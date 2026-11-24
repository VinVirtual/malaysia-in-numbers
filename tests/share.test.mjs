// Link previews: every built page carries Open Graph and Twitter card tags that point at a
// share image which exists, is a 1200x630 PNG and is small enough for WhatsApp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSite } from '../scripts/lib/site.mjs';
import { shareTags, pageUrl, decodeEntities, SHARE_IMAGE } from '../scripts/lib/share.mjs';
import { writeDataset, appendRelease } from '../scripts/lib/store.mjs';
import { ROOT, tmpDir, allFixtureFiles } from './helpers.mjs';

const SITE = 'https://data.example.org/';
const PROPS = ['og:title', 'og:description', 'og:type', 'og:url', 'og:site_name', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt'];
const NAMES = ['description', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

function metas(src) {
  const out = new Map();
  for (const m of src.matchAll(/<meta (property|name)="([^"]+)" content="([^"]*)">/g)) out.set(m[2], decodeEntities(m[3]));
  return out;
}

test('every built page has share tags, its own og:url and a canonical link', () => {
  const root = tmpDir();
  const out = path.join(root, 'dist');
  const dataDir = path.join(root, 'data');
  for (const f of Object.values(allFixtureFiles())) {
    writeDataset(root, dataDir, f);
    appendRelease(root, dataDir, { at: '2026-11-24T01:30:00.000Z', id: f.id, data_as_of: f.meta.data_as_of, last_updated: f.meta.last_updated, added: 5, revised: 0, removed: 0 });
  }
  buildSite({ root, dataDir, assetsDir: path.join(ROOT, 'assets'), outDir: out, siteUrl: SITE, now: new Date('2026-11-24T02:00:00Z') });
  const pages = walk(out).filter((f) => f.endsWith('.html') && path.basename(f) !== '404.html');
  assert.ok(pages.length >= 4, `only ${pages.length} pages built`);
  const urls = new Set();
  for (const file of pages) {
    const rel = path.relative(out, file);
    const src = fs.readFileSync(file, 'utf8');
    const m = metas(src);
    for (const k of PROPS) assert.ok(m.get(`${k}`)?.trim(), `${rel}: no ${k}`);
    for (const k of NAMES) assert.ok(m.get(k)?.trim(), `${rel}: no ${k}`);
    assert.equal(m.get('og:image'), `${SITE}${SHARE_IMAGE.path}`, rel);
    assert.equal(m.get('twitter:image'), m.get('og:image'), rel);
    assert.equal(m.get('twitter:card'), 'summary_large_image', rel);
    assert.equal(m.get('og:image:width'), '1200', rel);
    assert.equal(m.get('og:image:height'), '630', rel);
    assert.equal(m.get('og:image:type'), 'image/png', rel);
    assert.ok(m.get('og:url').startsWith(SITE), `${rel}: og:url ${m.get('og:url')}`);
    assert.equal(m.get('og:url'), pageUrl(SITE, rel), rel);
    assert.match(src, /<link rel="canonical" href="https:\/\/[^"]+">/, `${rel}: no canonical`);
    assert.equal((src.match(/property="og:title"/g) ?? []).length, 1, `${rel}: og:title more than once`);
    urls.add(m.get('og:url'));
  }
  assert.equal(urls.size, pages.length, 'og:url repeats across pages');
  const png = fs.readFileSync(path.join(out, SHARE_IMAGE.path));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length < 300 * 1024, `share image is ${png.length} bytes`);
});

test('shareTags escapes page text and uses absolute https image URLs', () => {
  const tags = shareTags({ title: 'A "quoted" <title> & more', description: "It's <b>bold</b>", url: `${SITE}x/`, siteUrl: SITE });
  assert.ok(!tags.includes('<title>') && !tags.includes('<b>'));
  assert.match(tags, /content="A &quot;quoted&quot; &lt;title&gt; &amp; more"/);
  assert.match(tags, new RegExp(`property="og:image" content="${SITE.replace(/[.]/g, '\\.')}assets/share\\.png"`));
});

test('pageUrl serves index.html pages at their folder address', () => {
  assert.equal(pageUrl(SITE, 'index.html'), SITE);
  assert.equal(pageUrl(SITE, path.join('a', 'b', 'index.html')), `${SITE}a/b/`);
  assert.equal(pageUrl(SITE, '404.html'), `${SITE}404.html`);
});
