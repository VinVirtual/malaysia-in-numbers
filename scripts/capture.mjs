#!/usr/bin/env node
// Screenshots of the built site for the README (light, dark, phone, a topic page with the
// crosshair open). Needs Chrome. Usage: node scripts/capture.mjs [outDir]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serveDir, randomPort } from './lib/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHROME_CANDIDATES = [process.env.MNUM_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
export const findChrome = () => CHROME_CANDIDATES.find((c) => c && fs.existsSync(c)) ?? null;

const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'docs'));
const shots = [
  { name: 'home-light.png', url: 'index.html', viewport: { width: 1440, height: 1500 }, scheme: 'light' },
  { name: 'home-dark.png', url: 'index.html', viewport: { width: 1440, height: 1500 }, scheme: 'dark' },
  { name: 'home-phone.png', url: 'index.html', viewport: { width: 390, height: 844 }, scheme: 'light', mobile: true, full: true },
  { name: 'fuel-light.png', url: 'fuel/index.html', viewport: { width: 1280, height: 1300 }, scheme: 'light', hover: '#fuel-pump-prices .plot' },
  { name: 'inflation-dark.png', url: 'inflation/index.html', viewport: { width: 1280, height: 1800 }, scheme: 'dark', scrollTo: '.figures' },
  { name: 'ringgit-phone.png', url: 'ringgit/index.html', viewport: { width: 390, height: 844 }, scheme: 'dark', mobile: true, scrollTo: '.figures' },
  { name: 'method.png', url: 'method/index.html', viewport: { width: 1280, height: 1000 }, scheme: 'light' },
];

const chrome = findChrome();
if (!chrome) {
  process.stderr.write('no Chrome found; set MNUM_CHROME\n');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const srv = await serveDir(path.join(ROOT, 'dist'), { port: randomPort() });
const browser = await chromium.launch({ executablePath: chrome, headless: true });
try {
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: s.viewport, colorScheme: s.scheme, deviceScaleFactor: s.mobile ? 2 : 1, isMobile: Boolean(s.mobile), hasTouch: Boolean(s.mobile), reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/${s.url}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (s.scrollTo) await page.locator(s.scrollTo).first().evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 16));
    if (s.hover) {
      const box = await page.locator(s.hover).boundingBox();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
    }
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, s.name), fullPage: Boolean(s.full) });
    if (errors.length) throw new Error(`${s.name}: browser errors: ${errors.join(' | ')}`);
    process.stderr.write(`${path.relative(ROOT, path.join(OUT, s.name))}\n`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
