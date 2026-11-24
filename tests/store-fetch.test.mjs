// Committed data and the daily run: validation, compact files, change detection, the release
// log, and a whole fetch against recorded replies (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateDatasetFile, serializeDatasetFile, diffSeries, writeDataset, loadDataset, loadAll, appendRelease, loadReleases, SchemaError } from '../scripts/lib/store.mjs';
import { fetchAll, makeHttp, shrinkage } from '../scripts/lib/fetch.mjs';
import { DATASETS } from '../scripts/lib/config.mjs';
import { parseArgs, siteUrlFromEnv } from '../scripts/mnum.mjs';
import { spawnSync } from 'node:child_process';
import { ROOT, fixtureFile, fixtureFetch, fixtureJson, testHttp, testBudget, tmpDir } from './helpers.mjs';

const good = () => fixtureFile('lfs_month');

test('a dataset file made from a fixture is valid and round-trips through the compact format', () => {
  const f = good();
  assert.equal(validateDatasetFile(f, 'lfs_month'), f);
  assert.deepEqual(JSON.parse(serializeDatasetFile(f)), f);
  const lines = serializeDatasetFile(f).split('\n');
  assert.ok(lines.some((l) => /^ {6}\["2026-09-01",2\.9\]/.test(l)), 'one point per line, for readable diffs');
});

test('validation rejects broken files', () => {
  const cases = [
    [(f) => ({ ...f, schema: 2 }), /schema/],
    [(f) => ({ ...f, id: 'births' }), /unknown dataset/],
    [(f) => ({ ...f, fetchedAt: 'soon' }), /fetchedAt/],
    [(f) => ({ ...f, meta: { ...f.meta, last_updated: undefined } }), /meta/],
    [(f) => ({ ...f, series: {} }), /series: empty/],
    [(f) => ({ ...f, series: { 'Bad Key': f.series.u_rate } }), /bad key/],
    [(f) => ({ ...f, series: { u_rate: [['2026-09-01', 'x']] } }), /bad point/],
    [(f) => ({ ...f, series: { u_rate: [['2026-09-01', 1], ['2026-08-01', 2]] } }), /strictly increasing/],
    [(f) => ({ ...f, series: { u_rate: [['2026-09-01', 1], ['2026-09-01', 1]] } }), /strictly increasing/],
    [(f) => ({ ...f, series: { u_rate: [['2026-02-30', 1]] } }), /bad point/],
  ];
  for (const [mut, re] of cases) assert.throws(() => validateDatasetFile(mut(good())), re);
  assert.throws(() => validateDatasetFile(good(), 'fuelprice'), /expected fuelprice/);
});

test('diffSeries counts new, revised and removed values', () => {
  const a = { x: [['2026-01-01', 1], ['2026-02-01', 2]] };
  const b = { x: [['2026-02-01', 2.5], ['2026-03-01', 3]], y: [['2026-03-01', 9]] };
  const d = diffSeries(a, b);
  assert.deepEqual([d.added, d.revised, d.removed, d.changed], [2, 1, 1, true]);
  assert.deepEqual(d.revisions, [{ key: 'x', date: '2026-02-01', from: 2, to: 2.5 }]);
  assert.equal(diffSeries(a, a).changed, false);
  assert.equal(diffSeries(undefined, a).added, 2);
});

test('files and the release log are written inside the project only, never through a symlink', () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  writeDataset(root, dataDir, good());
  assert.deepEqual(loadDataset(dataDir, 'lfs_month'), good());
  appendRelease(root, dataDir, { at: '2026-11-24T10:00:00Z', id: 'lfs_month', data_as_of: '2026-09' });
  appendRelease(root, dataDir, { at: '2026-11-25T10:00:00Z', id: 'lfs_month', data_as_of: '2026-10' });
  assert.equal(loadReleases(dataDir).length, 2);
  const outside = tmpDir();
  fs.rmSync(path.join(dataDir, 'series'), { recursive: true });
  fs.symlinkSync(outside, path.join(dataDir, 'series'));
  assert.throws(() => writeDataset(root, dataDir, good()), /symlink/);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.throws(() => writeDataset(root, path.join(root, '..', 'elsewhere'), good()), /outside/);
});

test('a broken release log line is reported with its line number', () => {
  const root = tmpDir();
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data', 'releases.jsonl'), '{"at":"2026-11-24T00:00:00Z","id":"lfs_month","data_as_of":"2026-09"}\nnot json\n');
  assert.throws(() => loadReleases(path.join(root, 'data')), /line 2: not JSON/);
  fs.writeFileSync(path.join(root, 'data', 'releases.jsonl'), '{"at":"x","id":"nope","data_as_of":"2026"}\n');
  assert.throws(() => loadReleases(path.join(root, 'data')), SchemaError);
});

test('loadAll names the broken file', () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(dataDir, 'series'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'series', 'fuelprice.json'), '{"schema":1}');
  assert.throws(() => loadAll(dataDir), /data\/series\/fuelprice\.json/);
});

test('the committed data in this repository is valid', () => {
  const files = loadAll(path.resolve('data'));
  assert.equal(Object.keys(files).length, DATASETS.length);
  assert.ok(loadReleases(path.resolve('data')).length >= DATASETS.length);
});

test('a full run: one request per dataset, files written, release log started', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  const f = fixtureFetch();
  const http = testHttp(f);
  const { results } = await fetchAll({ root, dataDir, http, nowIso: () => '2026-11-24T10:00:00.000Z' });
  assert.equal(f.calls.length, DATASETS.length);
  assert.ok(results.every((r) => r.ok && r.changed));
  assert.equal(Object.keys(loadAll(dataDir)).length, DATASETS.length);
  assert.equal(loadReleases(dataDir).length, DATASETS.length);
});

test('a second run with the same data changes nothing and logs nothing', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  await fetchAll({ root, dataDir, http: testHttp(fixtureFetch()) });
  const before = fs.readFileSync(path.join(dataDir, 'series', 'gdp_qtr_real.json'), 'utf8');
  const { results } = await fetchAll({ root, dataDir, http: testHttp(fixtureFetch()), nowIso: () => '2030-01-01T00:00:00.000Z' });
  assert.ok(results.every((r) => r.ok && !r.changed));
  assert.equal(fs.readFileSync(path.join(dataDir, 'series', 'gdp_qtr_real.json'), 'utf8'), before, 'fetchedAt not bumped without a change');
  assert.equal(loadReleases(dataDir).length, DATASETS.length);
});

test('a revision by the source is written and logged with what changed', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  await fetchAll({ root, dataDir, http: testHttp(fixtureFetch()) });
  const revised = fixtureJson('lfs_month');
  revised.data = revised.data.map((r) => (r.date === '2026-09-01' ? { ...r, u_rate: 3.0 } : r));
  const { results } = await fetchAll({ root, dataDir, only: ['lfs_month'], http: testHttp(fixtureFetch({ lfs_month: () => ({ body: JSON.stringify(revised) }) })) });
  assert.equal(results[0].revised, 1);
  const last = loadReleases(dataDir).at(-1);
  assert.deepEqual(last.revisions, [{ key: 'u_rate', date: '2026-09-01', from: 2.9, to: 3 }]);
  assert.deepEqual(loadDataset(dataDir, 'lfs_month').series.u_rate.at(-1), ['2026-09-01', 3]);
});

test('a failing dataset keeps its committed file and the others still update', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  await fetchAll({ root, dataDir, http: testHttp(fixtureFetch()) });
  const before = fs.readFileSync(path.join(dataDir, 'series', 'fuelprice.json'), 'utf8');
  const f = fixtureFetch({ fuelprice: () => ({ status: 500, body: 'oops' }), exchangerates: () => ({ body: '{"meta":{"catalogue_id":"births"},"data":[]}' }) });
  const { results } = await fetchAll({ root, dataDir, http: testHttp(f) });
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.match(byId.fuelprice.error, /HTTP 500/);
  assert.match(byId.exchangerates.error, /another dataset/);
  assert.equal(results.filter((r) => r.ok).length, DATASETS.length - 2);
  assert.equal(fs.readFileSync(path.join(dataDir, 'series', 'fuelprice.json'), 'utf8'), before);
});

test('a reply that loses history, or ends earlier than before, is refused and the file kept', async () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  await fetchAll({ root, dataDir, http: testHttp(fixtureFetch()) });
  const before = fs.readFileSync(path.join(dataDir, 'series', 'lfs_month.json'), 'utf8');
  const nulled = fixtureJson('lfs_month');
  nulled.data = nulled.data.map((r) => (r.date === '2026-09-01' ? { ...r, u_rate: null } : r));
  const short = fixtureJson('lfs_month');
  short.data = short.data.slice(-3);
  for (const body of [nulled, short]) {
    const { results } = await fetchAll({ root, dataDir, only: ['lfs_month'], http: testHttp(fixtureFetch({ lfs_month: () => ({ body: JSON.stringify(body) }) })) });
    assert.equal(results[0].ok, false);
    assert.match(results[0].error, /keeping the committed file/);
  }
  assert.equal(fs.readFileSync(path.join(dataDir, 'series', 'lfs_month.json'), 'utf8'), before);
  assert.equal(shrinkage({ a: [['2026-01-01', 1]] }, { a: [['2026-01-01', 1], ['2026-02-01', 2]] }), null, 'growth is fine');
  assert.match(shrinkage({ a: [['2026-01-01', 1]] }, { b: [['2026-01-01', 1]] }), /missing/);
});

test('rows without a valid date fail the dataset instead of vanishing quietly', async () => {
  const root = tmpDir();
  const bad = fixtureJson('gdp_qtr_real');
  bad.data[0] = { ...bad.data[0], date: '2026-Q3' };
  const { results } = await fetchAll({ root, dataDir: path.join(root, 'data'), only: ['gdp_qtr_real'], http: testHttp(fixtureFetch({ gdp_qtr_real: () => ({ body: JSON.stringify(bad) }) })) });
  assert.match(results[0].error, /1 rows without a valid date/);
});

test('when the request budget runs out the run stops asking', async () => {
  const root = tmpDir();
  const f = fixtureFetch();
  const { results } = await fetchAll({ root, dataDir: path.join(root, 'data'), http: testHttp(f, { budget: testBudget({ maxRequests: 3 }) }) });
  assert.equal(f.calls.length, 3);
  assert.equal(results.length, 4, 'three done, the fourth failed on the budget, then stop');
  assert.match(results[3].error, /budget/);
});

test('makeHttp spaces real requests 16 s apart (measured on the budget clock)', async () => {
  const sleeps = [];
  let t = 0;
  const root = tmpDir();
  const http = makeHttp({ root, useCache: false, fetchImpl: fixtureFetch(), now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
  await fetchAll({ root, dataDir: path.join(root, 'data'), http, only: ['lfs_month', 'fuelprice', 'gdp_qtr_real'] });
  assert.deepEqual(sleeps, [16_000, 16_000]);
});

test('CLI options are checked', () => {
  assert.deepEqual(parseArgs(['fetch', '--offline', '--only', 'lfs_month,fuelprice']).opts.only, ['lfs_month', 'fuelprice']);
  assert.throws(() => parseArgs(['fetch', '--only', 'births']), /dataset ids/);
  assert.throws(() => parseArgs(['fetch', '--only']), /dataset ids/);
  assert.throws(() => parseArgs(['site', '--out']), /needs a directory/);
  assert.throws(() => parseArgs(['fetch', '--force']), /unknown option/);
  assert.equal(parseArgs([]).cmd, 'help');
  assert.equal(siteUrlFromEnv({}), 'https://malaysia-in-numbers.pages.dev/');
  assert.equal(siteUrlFromEnv({ MNUM_SITE_URL: ' https://data.lashvin.com/ ' }), 'https://data.lashvin.com/');
});

test('the CLI refuses to build into a folder it would wipe, and check refuses stray data files', () => {
  const run = (args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'mnum.mjs'), ...args], { encoding: 'utf8', cwd: ROOT });
  for (const out of ['data', 'scripts', '.', '../elsewhere']) {
    const r = run(['site', '--out', out]);
    assert.equal(r.status, 2, out);
    assert.match(r.stderr, /--out must be dist\/ or a folder under \.scratch\//);
  }
  assert.ok(fs.existsSync(path.join(ROOT, 'data', 'series', 'fuelprice.json')));
  const stray = path.join(ROOT, 'data', 'series', 'evil.json');
  fs.writeFileSync(stray, '{}');
  try {
    const r = run(['check']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unexpected files in data\/series: evil\.json/);
  } finally {
    fs.rmSync(stray);
  }
});
