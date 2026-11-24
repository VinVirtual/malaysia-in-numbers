// Link previews: Open Graph and Twitter card tags on every built page, so a link pasted into
// WhatsApp, LinkedIn, X, Facebook, iMessage, Slack or Telegram shows a picture, a title and a
// summary. Runs over the finished HTML at the end of a build, so every page the generator
// writes (every indicator page included) gets them from its own <title> and description.
import fs from 'node:fs';
import path from 'node:path';
import { esc } from './html.mjs';
import { writeFileAtomic } from './safe-fs.mjs';
import { SITE_TITLE } from './config.mjs';

const SITE_TAGLINE = 'The latest official Malaysian figures from data.gov.my, updated daily.';

export const SHARE_IMAGE = Object.freeze({
  path: 'assets/share.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'Malaysia in Numbers: official Malaysian figures checked every day, from fuel prices and inflation to jobs, trade and the ringgit.',
});

const SKIP = new Set(['404.html']);
const MAX_DESCRIPTION = 300;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function clip(s, max) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

// Address of a built file on the live site: ".../index.html" is served as ".../".
export function pageUrl(siteUrl, rel) {
  return new URL(rel.split(path.sep).join('/').replace(/(^|\/)index\.html$/, '$1'), siteUrl).href;
}

export function shareTags({ title, description, url, siteUrl, type = 'website' }) {
  const image = new URL(SHARE_IMAGE.path, siteUrl).href;
  const p = (k, v) => `<meta property="${k}" content="${esc(v)}">`;
  const n = (k, v) => `<meta name="${k}" content="${esc(v)}">`;
  return [
    p('og:type', type),
    p('og:site_name', SITE_TITLE),
    p('og:title', title),
    p('og:description', description),
    p('og:url', url),
    p('og:image', image),
    p('og:image:type', SHARE_IMAGE.type),
    p('og:image:width', SHARE_IMAGE.width),
    p('og:image:height', SHARE_IMAGE.height),
    p('og:image:alt', SHARE_IMAGE.alt),
    n('twitter:card', 'summary_large_image'),
    n('twitter:title', title),
    n('twitter:description', description),
    n('twitter:image', image),
    n('twitter:image:alt', SHARE_IMAGE.alt),
  ].join('\n');
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.isFile() && e.name.endsWith('.html') ? [p] : [];
  });
}

// Adds the tags (and a canonical link and description where a page has none) to every page.
export function addShareTags(outDir, { siteUrl, root }) {
  if (!fs.existsSync(path.join(outDir, SHARE_IMAGE.path))) throw new Error(`share image missing: ${SHARE_IMAGE.path} (run "npm run share-image")`);
  let pages = 0;
  for (const file of htmlFiles(outDir)) {
    const rel = path.relative(outDir, file);
    if (SKIP.has(rel)) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes('property="og:title"')) continue;
    const headEnd = src.indexOf('</head>');
    const titleEnd = src.indexOf('</title>');
    if (headEnd < 0 || titleEnd < 0 || titleEnd > headEnd) throw new Error(`${rel}: no <title> in <head>`);
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(src);
    const descMatch = /<meta name="description" content="([^"]*)">/.exec(src);
    const title = clip(decodeEntities(titleMatch[1]), 200) || SITE_TITLE;
    const description = clip(decodeEntities(descMatch?.[1] ?? '') || SITE_TAGLINE, MAX_DESCRIPTION);
    const url = pageUrl(siteUrl, rel);
    const extra = [];
    if (!descMatch) extra.push(`<meta name="description" content="${esc(description)}">`);
    if (!/<link rel="canonical"/.test(src)) extra.push(`<link rel="canonical" href="${esc(url)}">`);
    extra.push(shareTags({ title, description, url, siteUrl }));
    const at = descMatch ? descMatch.index + descMatch[0].length : titleEnd + '</title>'.length;
    writeFileAtomic(file, `${src.slice(0, at)}\n${extra.join('\n')}${src.slice(at)}`, root);
    pages += 1;
  }
  return pages;
}
