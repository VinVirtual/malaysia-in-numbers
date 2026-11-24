// The site's own words use no em dashes (the owner's house style). Text quoted from the
// publishers (dataset metadata as the API returns it) is left exactly as published, so it is
// taken out before the built pages are checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSite } from '../scripts/lib/site.mjs';
import { writeDataset, appendRelease } from '../scripts/lib/store.mjs';
import { ROOT, allFixtureFiles, tmpDir } from './helpers.mjs';

const EM = '—';

function walk(dir, keep) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, keep) : keep(p) ? [p] : [];
  });
}

function strings(v) {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

test('no em dash in the templates, copy, styles or scripts that make the site', () => {
  const files = [
    ...walk(path.join(ROOT, 'scripts'), (p) => /\.mjs$/.test(p)),
    ...walk(path.join(ROOT, 'assets'), (p) => /\.(css|js|svg)$/.test(p)),
  ];
  assert.ok(files.length > 10, 'found the source files');
  const bad = files.filter((f) => fs.readFileSync(f, 'utf8').includes(EM)).map((f) => path.relative(ROOT, f));
  assert.deepEqual(bad, []);
});

test('no em dash in the built pages, feeds and headers, apart from text quoted from the publishers', () => {
  const root = tmpDir();
  const dataDir = path.join(root, 'data');
  const fixtures = Object.values(allFixtureFiles());
  for (const f of fixtures) {
    writeDataset(root, dataDir, f);
    appendRelease(root, dataDir, { at: '2026-11-24T01:30:00.000Z', id: f.id, data_as_of: f.meta.data_as_of, last_updated: f.meta.last_updated, added: 5, revised: 0, removed: 0 });
  }
  const outDir = path.join(root, 'dist');
  buildSite({ root, dataDir, assetsDir: path.join(ROOT, 'assets'), outDir, siteUrl: 'https://example.pages.dev/', now: new Date('2026-11-24T02:00:00Z') });
  const quoted = fixtures.flatMap((f) => strings(f.meta)).filter((s) => s.includes(EM));
  const pages = walk(outDir, (p) => /\.(html|json|xml|txt|css|js)$/.test(p) || path.basename(p) === '_headers');
  assert.ok(pages.some((p) => p.endsWith('index.html')), 'the site was built');
  const bad = pages.filter((p) => {
    let text = fs.readFileSync(p, 'utf8');
    for (const q of quoted) text = text.split(q).join('');
    return text.includes(EM);
  }).map((p) => path.relative(outDir, p));
  assert.deepEqual(bad, []);
});

test('the check notices an em dash when there is one', () => {
  assert.ok(`a ${EM} b`.includes(EM));
  assert.ok(!'10 to 20, 10-20'.includes(EM));
});
