#!/usr/bin/env node
// Renders assets/share.png, the 1200x630 picture link previews show (WhatsApp, LinkedIn, X,
// Slack...). The card is drawn with the site's own stylesheet, fonts, flag stripes and ticker, then
// screenshotted in headless Chrome. Run again after changing the card: npm run share-image
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { TOPICS } from './lib/topics.mjs';
import { SHARE_IMAGE } from './lib/share.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://card.local';
const MAX_BYTES = 300 * 1024;
const CHROME_CANDIDATES = [process.env.MNUM_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const findChrome = () => CHROME_CANDIDATES.find((c) => c && fs.existsSync(c)) ?? null;

const CSS = `
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body::before, body::after { display: none !important; }
.og-card { position: relative; isolation: isolate; box-sizing: border-box; width: 1200px; height: 630px; display: grid; grid-template-rows: 96px 1fr 64px; overflow: hidden; }
.masthead { padding: 0 56px; border-bottom: 1px solid var(--rule); }
.masthead .mark { width: 50px; height: 50px; }
.masthead .wordmark { gap: 16px; }
.wm-en { font-size: 30px; }
.wm-ms { font-size: 19px; margin-top: 3px; }
.site { font-family: var(--font-mono); font-size: 20px; font-weight: 600; color: var(--ink); }
.stripes { top: 96px; height: 470px; width: 380px; }
.body { padding: 42px 56px 0; position: relative; }
.hero-title { font-size: 146px; }
.hero-title .ht-b { padding-left: 84px; }
.lead { font-size: 33px; max-width: 690px; margin-top: 34px; color: var(--ink); font-weight: 500; }
.lead .ms { display: block; font-size: 26px; color: var(--muted); font-weight: 400; margin-top: 4px; }
.ticker { font-size: 20px; display: flex; align-items: center; }
.ticker-track { animation: none; padding: 0; }
.ticker li { padding: 0 19px; }
.ticker li:first-child { padding-left: 56px; }
.ticker li:last-child { border-right: 0; }
`;

function cardHtml() {
  const names = TOPICS.map((t) => `<li><span class="tk-val">${t.title}</span></li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/style.css"><style>${CSS}</style></head>
<body><div class="og-card">
  <header class="masthead">
    <span class="wordmark"><svg class="mark" viewBox="0 0 28 28" aria-hidden="true"><rect class="mark-bg" x="0" y="0" width="28" height="28" rx="6"/><path class="mark-bar" d="M6 7h16M6 11h12M6 15h14M6 19h8M6 23h11"/></svg>
    <span class="wm-text"><span class="wm-en">Malaysia in Numbers</span><span class="wm-ms" lang="ms">Malaysia dalam Angka</span></span></span>
    <span class="site">data.lashvin.com</span>
  </header>
  <svg class="stripes" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<rect class="stripe${i % 2 ? ' alt' : ''}" x="0" y="${i * 10}" width="100" height="10"/>`).join('')}</svg>
  <div class="body">
    <p class="hero-title"><span class="ht-a">Malaysia</span><span class="ht-b">in Numbers</span></p>
    <p class="lead">Official figures, checked every day.<span class="ms" lang="ms">Angka rasmi terkini, disemak setiap hari.</span></p>
  </div>
  <div class="ticker"><ul class="ticker-track">${names}</ul></div>
</div></body></html>`;
}

const TYPES = { '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

export async function renderShareImage({ out = path.join(ROOT, SHARE_IMAGE.path) } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found; set MNUM_CHROME');
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: SHARE_IMAGE.width, height: SHARE_IMAGE.height }, colorScheme: 'light', reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.route(`${ORIGIN}/**`, (route) => {
      const p = new URL(route.request().url()).pathname;
      if (p === '/') return route.fulfill({ contentType: 'text/html', body: cardHtml() });
      const file = path.resolve(ROOT, `.${decodeURIComponent(p)}`);
      if (!file.startsWith(path.join(ROOT, 'assets') + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: fs.readFileSync(file) });
    });
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png' });
    if (png.length > MAX_BYTES) throw new Error(`share image is ${png.length} bytes, over ${MAX_BYTES}`);
    fs.writeFileSync(out, png);
    return { out, bytes: png.length };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out, bytes } = await renderShareImage();
  process.stderr.write(`${path.relative(ROOT, out)} ${Math.round(bytes / 1024)} KB\n`);
}
