// The static site: committed data -> pages, CSV and JSON downloads, feeds, _headers,
// then a check of links, inline code, CSP and size.
import fs from 'node:fs';
import path from 'node:path';
import { DATASETS, SITE_TITLE } from './config.mjs';
import { TOPICS } from './topics.mjs';
import { loadAll, loadReleases, serializeDatasetFile } from './store.mjs';
import { headline, chartSpec, align } from './model.mjs';
import { toCsv } from './csv.mjs';
import { writeFileAtomic, copyFileSafe, removeTreeInside, ensureDir } from './safe-fs.mjs';
import { page, CSP } from './render/layout.mjs';
import { renderHome } from './render/home.mjs';
import { renderTopic } from './render/topic.mjs';
import { renderMethod, renderLimits, renderLog, render404 } from './render/pages.mjs';
import { jsonFeed, latestJson } from './feeds.mjs';
import { addShareTags } from './share.mjs';

export const SITE_BUDGET_BYTES = 6 * 1024 * 1024;

export function checkSiteUrl(u) {
  let p;
  try {
    p = new URL(u);
  } catch {
    throw new Error(`site URL is not a URL: ${u}`);
  }
  // https everywhere, except plain http on this machine for local builds.
  const local = p.protocol === 'http:' && (p.hostname === 'localhost' || p.hostname === '127.0.0.1');
  if ((p.protocol !== 'https:' && !local) || !u.endsWith('/') || p.search || p.hash || p.username || p.password) throw new Error('site URL must be https (or http://localhost) and end with "/"');
  return u;
}

function copyDir(src, dest, root) {
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) throw new Error(`refusing to copy a symlink: ${s}`);
    if (st.isDirectory()) copyDir(s, path.join(dest, name), root);
    else if (st.isFile()) copyFileSafe(s, path.join(dest, name), root);
  }
}

// Every series of a dataset side by side, one row per date.
export function datasetCsv(file) {
  const keys = Object.keys(file.series);
  const { x, cols } = align(file.series, keys);
  return toCsv([['date', ...keys], ...x.map((d, i) => [d, ...cols.map((c) => c[i])])]);
}

export function buildSite({ root, dataDir, assetsDir, outDir, siteUrl, now = new Date(), warn = () => {} }) {
  checkSiteUrl(siteUrl);
  const files = loadAll(dataDir);
  if (!Object.keys(files).length) throw new Error('no data: run "mnum fetch" first');
  const releases = loadReleases(dataDir);
  if (fs.existsSync(outDir)) removeTreeInside(outDir, root);
  ensureDir(outDir, root);
  copyDir(assetsDir, path.join(outDir, 'assets'), root);
  let pages = 0;
  let csv = 0;
  const write = (rel, content) => writeFileAtomic(path.join(outDir, rel), String(content), root);
  const writePage = (rel, opts) => {
    write(rel, page({ ...opts, builtAt: now, canonical: rel === '404.html' ? null : new URL(rel.replace(/index\.html$/, ''), siteUrl).toString() }));
    pages += 1;
  };

  const heads = {};
  for (const t of TOPICS) {
    const f = files[t.dataset];
    if (!f) {
      warn(`${t.slug}: no data for ${t.dataset}; page left out`);
      continue;
    }
    heads[t.slug] = headline(t, f);
  }
  for (const t of TOPICS) {
    const f = files[t.dataset];
    if (!f) continue;
    const charts = t.charts.map((chart) => ({ chart, ...chartSpec(t, chart, f) }));
    for (const ch of charts) {
      write(`data/${t.slug}-${ch.chart.id}.csv`, toCsv(ch.csv));
      csv += 1;
    }
    writePage(`${t.slug}/index.html`, {
      title: `${t.title}: ${heads[t.slug].valueText}, ${heads[t.slug].periodText} · ${SITE_TITLE}`,
      description: `${t.dek} Latest: ${t.headline.label} ${heads[t.slug].valueText} (${heads[t.slug].periodText}).`,
      base: '../', active: t.slug,
      body: renderTopic({ topic: t, file: f, head: heads[t.slug], charts, base: '../' }),
    });
  }
  for (const ds of DATASETS) {
    if (!files[ds.id]) continue;
    write(`data/${ds.id}.csv`, datasetCsv(files[ds.id]));
    write(`data/${ds.id}.json`, serializeDatasetFile(files[ds.id]));
    csv += 1;
  }
  write('data/releases.jsonl', releases.map((r) => JSON.stringify(r)).join('\n') + (releases.length ? '\n' : ''));
  writePage('index.html', {
    title: `${SITE_TITLE}: Malaysia’s official figures, updated daily`,
    description: 'Fuel prices, inflation, jobs, growth, trade, the ringgit, electricity and population: the latest official Malaysian figures from data.gov.my, with charts, tables and CSV downloads.',
    base: '', active: 'home', body: renderHome({ heads, files, releases, builtAt: now }),
  });
  writePage('method/index.html', { title: `Method · ${SITE_TITLE}`, description: 'How the figures are fetched, checked, stored and drawn.', base: '../', active: 'method', body: renderMethod({ files, base: '../' }) });
  writePage('limits/index.html', { title: `Limits · ${SITE_TITLE}`, description: 'What this site does not do, and where its numbers can mislead.', base: '../', active: 'limits', body: renderLimits() });
  writePage('log/index.html', { title: `Release log · ${SITE_TITLE}`, description: 'Every new or revised figure this site has seen.', base: '../', active: 'log', body: renderLog({ releases, base: '../' }) });
  writePage('404.html', { title: `Not found · ${SITE_TITLE}`, description: 'Page not found.', base: '/', active: null, body: render404() });
  write('feed.json', jsonFeed(heads, files, siteUrl));
  write('latest.json', latestJson(heads, files, now));
  write('robots.txt', `User-agent: *\nAllow: /\n`);
  write('_headers', headersFile());
  addShareTags(outDir, { siteUrl, root });
  const problems = checkSite(outDir);
  if (problems.length) throw new Error(`site check failed:\n  ${problems.join('\n  ')}`);
  return { pages, csv, bytes: dirBytes(outDir), heads };
}

// Cloudflare Pages and Netlify turn _headers into response headers (the file itself is not
// served; GitHub Pages ignores it).
export function headersFile() {
  const lines = [
    '/*',
    `  Content-Security-Policy: ${CSP}; frame-ancestors 'none'`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()',
    '/assets/*',
    '  Cache-Control: public, max-age=3600',
    '/feed.json',
    '  Content-Type: application/feed+json; charset=utf-8',
    '  Access-Control-Allow-Origin: *',
    '/latest.json',
    '  Access-Control-Allow-Origin: *',
    '/data/*',
    '  Access-Control-Allow-Origin: *',
    '/data/*.csv',
    '  Content-Type: text/csv; charset=utf-8',
    '/data/releases.jsonl',
    '  Content-Type: application/x-ndjson; charset=utf-8',
  ];
  return `${lines.join('\n')}\n`;
}

export function dirBytes(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirBytes(p) : fs.lstatSync(p).size;
  }
  return total;
}

function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// After a build: local links resolve, no inline script or style, CSP present, ids unique,
// size budget kept.
export function checkSite(outDir) {
  const problems = [];
  const absOut = path.resolve(outDir);
  for (const file of htmlFiles(outDir)) {
    const rel = path.relative(outDir, file);
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('http-equiv="Content-Security-Policy"')) problems.push(`${rel}: no CSP`);
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(src)) problems.push(`${rel}: inline <script>`);
    if (/<style[\s>]/i.test(src)) problems.push(`${rel}: inline <style>`);
    for (const tag of src.matchAll(/<[a-zA-Z][^>]*>/g)) {
      const names = tag[0].replace(/"[^"]*"/g, '""');
      if (/\sstyle=/i.test(names)) problems.push(`${rel}: style attribute`);
      if (/\son[a-z]+=/i.test(names)) problems.push(`${rel}: inline event handler`);
    }
    const idList = [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const ids = new Set(idList);
    if (ids.size !== idList.length) problems.push(`${rel}: duplicate id`);
    for (const m of src.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const link = m[1].replace(/&amp;/g, '&');
      if (/^https:\/\//.test(link) || /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(link)) continue; // local builds link to themselves
      if (/^[a-z]+:/i.test(link) || link.startsWith('//')) {
        problems.push(`${rel}: non-https link ${link.slice(0, 60)}`);
        continue;
      }
      if (link.startsWith('#')) {
        if (link.length > 1 && !ids.has(link.slice(1))) problems.push(`${rel}: missing anchor ${link}`);
        continue;
      }
      const clean = link.split('#')[0];
      const target = clean.startsWith('/') ? path.join(absOut, `.${clean}`) : path.resolve(path.dirname(file), clean);
      if (!(target === absOut || target.startsWith(absOut + path.sep)) || !fs.existsSync(target)) problems.push(`${rel}: broken link ${link}`);
    }
  }
  const bytes = dirBytes(outDir);
  if (bytes > SITE_BUDGET_BYTES) problems.push(`site is ${bytes} bytes, over the ${SITE_BUDGET_BYTES}-byte budget`);
  return problems;
}
