// From data to pages: headlines and their changes, chart specs, the built site, its checks,
// CSV, feeds and headers.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { headline, comparePoint, align, chartSpec } from '../scripts/lib/model.mjs';
import { TOPICS, topicBySlug, CPI_DIVISIONS } from '../scripts/lib/topics.mjs';
import { DATASETS } from '../scripts/lib/config.mjs';
import { buildSite, checkSite, headersFile, checkSiteUrl, datasetCsv } from '../scripts/lib/site.mjs';
import { writeDataset, appendRelease } from '../scripts/lib/store.mjs';
import { csvCell, toCsv } from '../scripts/lib/csv.mjs';
import { html, raw, esc, localHref, isSafeUrl } from '../scripts/lib/html.mjs';
import { leadSentences } from '../scripts/lib/render/home.mjs';
import { sourceTime } from '../scripts/lib/feeds.mjs';
import { myt } from '../scripts/lib/render/layout.mjs';
import { ROOT, allFixtureFiles, fixtureFile, tmpDir } from './helpers.mjs';

const NOW = new Date('2026-11-24T02:00:00Z');
let site;

before(() => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  for (const f of Object.values(allFixtureFiles())) {
    writeDataset(root, dataDir, f);
    appendRelease(root, dataDir, { at: '2026-11-24T01:30:00.000Z', id: f.id, data_as_of: f.meta.data_as_of, last_updated: f.meta.last_updated, added: 5, revised: 0, removed: 0 });
  }
  const outDir = path.join(root, 'dist');
  const r = buildSite({ root, dataDir, assetsDir: path.join(ROOT, 'assets'), outDir, siteUrl: 'https://data.example.org/', now: NOW });
  site = { root, outDir, r, read: (p) => fs.readFileSync(path.join(outDir, p), 'utf8') };
});

test('every topic points at a configured dataset and its headline series exists in the data', () => {
  const files = allFixtureFiles();
  assert.equal(TOPICS.length, DATASETS.length);
  for (const t of TOPICS) {
    assert.ok(DATASETS.some((d) => d.id === t.dataset), t.slug);
    assert.ok(files[t.dataset].series[t.headline.key], `${t.slug}: ${t.headline.key}`);
    assert.ok(t.titleMs && t.headline.labelMs, `${t.slug}: Malay labels`);
    assert.equal(topicBySlug(t.slug), t);
  }
});

test('fuel headline: latest week against the week before, in sen', () => {
  const h = headline(topicBySlug('fuel'), fixtureFile('fuelprice'));
  assert.equal(h.valueText, 'RM3.72');
  assert.equal(h.periodText, '19 Nov 2026');
  assert.equal(h.change.text, '−15 sen');
  assert.equal(h.change.vs, 'vs the week before');
});

test('seasonal headlines compare with the same month a year before', () => {
  const h = headline(topicBySlug('trade'), fixtureFile('trade_sitc_1d'));
  assert.equal(h.prevDate, '2025-09-01');
  assert.equal(h.change.vs, 'vs Sep 2025');
  const e = headline(topicBySlug('electricity'), fixtureFile('electricity_consumption'));
  assert.equal(e.prevDate, '2025-06-01');
});

test('comparePoint gives null rather than a wrong comparison when the year-ago point is missing', () => {
  assert.equal(comparePoint([['2026-09-01', 1], ['2026-10-01', 2]], 'year'), null);
  assert.equal(comparePoint([['2026-10-01', 2]], 'prev'), null);
  assert.deepEqual(comparePoint([['2026-09-01', 1], ['2026-10-01', 2]], 'prev'), ['2026-09-01', 1]);
});

test('inflation headline uses percentage points against the month before', () => {
  const h = headline(topicBySlug('inflation'), fixtureFile('cpi_headline_inflation'));
  assert.equal(h.valueText, '1.9%');
  assert.equal(h.change.text, '+0.1 pp');
  assert.equal(h.change.vs, 'vs Sep 2026');
});

test('align puts series on the union of their dates with nulls for gaps', () => {
  const { x, cols } = align({ a: [['2026-01-01', 1], ['2026-03-01', 3]], b: [['2026-02-01', 2]] }, ['a', 'b']);
  assert.deepEqual(x, ['2026-01-01', '2026-02-01', '2026-03-01']);
  assert.deepEqual(cols, [[1, null, 3], [null, 2, null]]);
  assert.deepEqual(align({ a: [['2026-01-01', 1], ['2026-02-01', 2]] }, ['a'], 1).x, ['2026-02-01']);
});

test('every chart of every topic builds from the fixtures, with table and CSV rows', () => {
  const files = allFixtureFiles();
  for (const t of TOPICS) {
    for (const c of t.charts) {
      const { spec, table, csv } = chartSpec(t, c, files[t.dataset]);
      assert.ok(spec.x.length > 0, `${t.slug}/${c.id}`);
      assert.equal(table.rows.length, spec.x.length, `${t.slug}/${c.id} table`);
      assert.equal(csv.length, spec.x.length + 1, `${t.slug}/${c.id} csv`);
      for (const s of spec.series) assert.equal(s.v.length, spec.x.length);
    }
  }
});

test('CPI by division: all items first, then divisions from highest to lowest, with DOSM Malay names', () => {
  const t = topicBySlug('inflation');
  const { spec, table } = chartSpec(t, t.charts.find((c) => c.divisions), fixtureFile('cpi_headline_inflation'));
  assert.equal(spec.x[0], 'All items');
  assert.equal(spec.x.length, 14);
  const v = spec.series[0].v.slice(1);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] <= v[i - 1]);
  assert.equal(spec.x[1], 'Transport');
  assert.ok(table.rows.some((r) => r[1] === CPI_DIVISIONS['07'][1]));
});

test('the trade balance is exports minus imports for the same month', () => {
  const t = topicBySlug('trade');
  const { spec } = chartSpec(t, t.charts.find((c) => c.derived), fixtureFile('trade_sitc_1d'));
  const f = fixtureFile('trade_sitc_1d');
  const last = spec.x.length - 1;
  assert.equal(spec.series[0].v[last], f.series.exports.at(-1)[1] - f.series.imports.at(-1)[1]);
});

test('a chart naming a series the data lacks is an error, not an empty chart', () => {
  const t = topicBySlug('jobs');
  assert.throws(() => chartSpec(t, { ...t.charts[0], series: [['nope', 'x', 1]] }, fixtureFile('lfs_month')), /no series nope/);
});

test('the lead is built only from the figures', () => {
  const files = allFixtureFiles();
  const heads = Object.fromEntries(TOPICS.map((t) => [t.slug, headline(t, files[t.dataset])]));
  const s = leadSentences(heads).join(' ');
  assert.match(s, /RM3\.72 a litre in the week from 19 Nov 2026, 15 sen less than the week before/);
  assert.match(s, /1\.9% higher than a year earlier/);
  assert.match(s, /grew 5\.5% in Q3 2026/);
  const shrink = leadSentences({ gdp: { ...heads.gdp, value: -2.1 } }).join(' ');
  assert.match(shrink, /shrank 2\.1%/);
});

test('the site has a page per topic plus home, method, limits, log and 404', () => {
  for (const p of ['index.html', 'method/index.html', 'limits/index.html', 'log/index.html', '404.html', ...TOPICS.map((t) => `${t.slug}/index.html`)]) {
    assert.ok(fs.existsSync(path.join(site.outDir, p)), p);
  }
  assert.equal(site.r.pages, TOPICS.length + 5);
  assert.deepEqual(checkSite(site.outDir), []);
});

test('pages carry the strict CSP, one h1, Malay labels marked lang="ms", and Updated stamps', () => {
  const home = site.read('index.html');
  assert.match(home, /http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;self&#39;/);
  assert.equal((home.match(/<h1/g) || []).length, 1);
  assert.match(home, /<p class="card-ms" lang="ms">Harga bahan api<\/p>/);
  assert.match(home, /Edition of <time datetime="2026-11-24">Tuesday 24 November 2026<\/time>/);
  const fuel = site.read('fuel/index.html');
  assert.match(fuel, /<dt>Updated by source<\/dt><dd><time datetime="2026-11-18">18 Nov 2026<\/time>/);
  assert.match(fuel, /<dt>Change picked up here<\/dt>/);
});

test('every chart has a data table, a CSV download that exists, and a keyboard-focusable plot', () => {
  for (const t of TOPICS) {
    const src = site.read(`${t.slug}/index.html`);
    const figs = (src.match(/<figure /g) || []).length;
    assert.equal(figs, t.charts.length, t.slug);
    assert.equal((src.match(/<table>/g) || []).length, figs);
    for (const m of src.matchAll(/class="btn-csv" href="([^"]+)" download/g)) assert.ok(fs.existsSync(path.resolve(site.outDir, t.slug, m[1])), m[1]);
    const lineOrBar = t.charts.filter((c) => c.type !== 'hbar').length;
    assert.equal((src.match(/class="plot" tabindex="0" role="group"/g) || []).length, lineOrBar, t.slug);
  }
});

test('the 404 page uses root-absolute links so it works at any path', () => {
  const p = site.read('404.html');
  assert.match(p, /href="\/assets\/style\.css"/);
  assert.doesNotMatch(p, /href="\.\.\//);
});

test('checkSite catches inline code, style attributes, handlers, bad and broken links', () => {
  const dir = tmpDir();
  const head = '<meta http-equiv="Content-Security-Policy" content="x">';
  fs.writeFileSync(path.join(dir, 'a.html'), `${head}<script>alert(1)</script><style>x{}</style><p style="color:red" onclick="x()"><a href="javascript:alert(1)">x</a><a href="missing.html">y</a><a href="#nope">z</a><a href="http://insecure.example/">w</a><i id="d"></i><i id="d"></i>`);
  fs.writeFileSync(path.join(dir, 'b.html'), '<p>no csp</p>');
  const problems = checkSite(dir).join('\n');
  for (const re of [/inline <script>/, /inline <style>/, /style attribute/, /inline event handler/, /non-https link javascript/, /broken link missing\.html/, /missing anchor #nope/, /non-https link http:/, /duplicate id/, /b\.html: no CSP/]) assert.match(problems, re);
});

test('the escaped text in attributes is not mistaken for inline code', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.html'), '<meta http-equiv="Content-Security-Policy" content="x"><figure data-chart="{&quot;title&quot;:&quot; style=onclick=&quot;}"></figure>');
  assert.deepEqual(checkSite(dir), []);
});

test('site URL must be https and end with a slash', () => {
  assert.equal(checkSiteUrl('https://data.example.org/'), 'https://data.example.org/');
  assert.equal(checkSiteUrl('http://localhost:8000/'), 'http://localhost:8000/');
  assert.throws(() => checkSiteUrl('http://data.example.org/'), /https/);
  for (const bad of ['http://x.example/', 'https://x.example', 'https://x.example/?a=1', 'nope']) assert.throws(() => checkSiteUrl(bad));
});

test('_headers sends the CSP with frame-ancestors, nosniff and the feed types', () => {
  const h = headersFile();
  assert.match(h, /^\/\*\n {2}Content-Security-Policy: default-src 'none';.*frame-ancestors 'none'/);
  assert.match(h, /X-Content-Type-Options: nosniff/);
  assert.match(h, /\/feed\.json\n {2}Content-Type: application\/feed\+json/);
  assert.equal(site.read('_headers'), h);
});

test('JSON Feed 1.1: one item per indicator, ids change with each release, absolute URLs', () => {
  const feed = JSON.parse(site.read('feed.json'));
  assert.equal(feed.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(feed.items.length, TOPICS.length);
  assert.equal(new Set(feed.items.map((i) => i.id)).size, TOPICS.length);
  for (const it of feed.items) {
    assert.match(it.url, /^https:\/\/data\.example\.org\/[a-z]+\/$/);
    assert.match(it.id, /#[0-9A-Za-z-]+$/);
    assert.ok(!Number.isNaN(Date.parse(it.date_published)));
    assert.ok(it.content_text.includes('CC BY 4.0'));
  }
  const fuel = feed.items.find((i) => i.tags.includes('fuel'));
  assert.equal(fuel.title, 'Fuel prices: RM3.72 per litre, 19 Nov 2026');
});

test('latest.json gives each indicator with its source dates', () => {
  const l = JSON.parse(site.read('latest.json'));
  assert.equal(l.generated_at, NOW.toISOString());
  assert.equal(Object.keys(l.indicators).length, TOPICS.length);
  assert.equal(l.indicators.inflation.value, 1.9);
  assert.equal(l.indicators.inflation.source_last_updated, '2026-11-19 13:09');
  assert.equal(l.indicators.inflation.licence, 'CC BY 4.0');
});

test('source times are read as Malaysia time', () => {
  assert.equal(sourceTime('2026-11-19 13:09'), '2026-11-19T13:09:00+08:00');
  assert.equal(sourceTime('2026-11-19'), '2026-11-19T00:00:00+08:00');
  assert.equal(sourceTime('tbc'), null);
  assert.equal(myt(new Date('2026-11-23T17:30:00Z')).iso, '2026-11-24', 'after 16:00 UTC it is already tomorrow in Malaysia');
});

test('CSV: numbers stay numbers, text is quoted, formulas are defused', () => {
  assert.equal(csvCell(-0.15), '-0.15');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(toCsv([['a', 'b'], [1, 2]]), 'a,b\r\n1,2\r\n');
  const csv = datasetCsv(fixtureFile('fuelprice'));
  assert.match(csv, /^date,diesel,diesel_east,ron95,ron95_budi95,ron97\r\n/);
  assert.match(csv, /2026-11-19,4\.72,4\.72,3\.72,1\.99,4\r\n$/);
});

test('HTML: values are escaped unless built by html``; local links are confined', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.equal(String(html`<p>${evil}</p>`), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(String(html`<p>${raw('<b>ok</b>')}</p>`), '<p><b>ok</b></p>');
  assert.equal(esc('a‮b'), 'ab', 'bidi override removed');
  assert.equal(localHref('../fuel/index.html'), '../fuel/index.html');
  assert.equal(localHref('/assets/style.css'), '/assets/style.css');
  for (const bad of ['javascript:alert(1)', '//evil.example/', '../a/../../b', 'a b.html']) assert.throws(() => localHref(bad), /unsafe local link/);
  assert.ok(isSafeUrl('https://data.gov.my/'));
  assert.ok(!isSafeUrl('http://data.gov.my/'));
  assert.ok(!isSafeUrl('https://u:p@data.gov.my/'));
});

test('the site build refuses an empty data folder', () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'data'));
  assert.throws(() => buildSite({ root, dataDir: path.join(root, 'data'), assetsDir: path.join(ROOT, 'assets'), outDir: path.join(root, 'dist'), siteUrl: 'https://x.example/' }), /no data/);
});

test('the built site stays small', () => {
  assert.ok(site.r.bytes < 3 * 1024 * 1024, `${site.r.bytes} bytes`);
});
