// Browser check of the built site (run "mnum site" first). Needs Chrome; fails, not skips, without it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { serveDir, randomPort } from '../../scripts/lib/serve.mjs';
import { TOPICS } from '../../scripts/lib/topics.mjs';
import { ROOT } from '../helpers.mjs';

const DIST = path.join(ROOT, 'dist');
const CHROME = [process.env.MNUM_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((c) => c && fs.existsSync(c));
const PAGES = ['index.html', 'method/index.html', 'limits/index.html', 'log/index.html', ...TOPICS.map((t) => `${t.slug}/index.html`)];
let srv;
let browser;

before(async () => {
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'dist/ is missing: run "node scripts/mnum.mjs site" first');
  assert.ok(CHROME, 'no Chrome found: install Google Chrome or set MNUM_CHROME');
  srv = await serveDir(DIST, { port: randomPort() });
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
});

after(async () => {
  await browser?.close();
  await srv?.close();
});

async function open(urlPath, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url()}`));
  await page.goto(`http://127.0.0.1:${srv.port}/${urlPath}`, { waitUntil: 'networkidle' });
  return { page, ctx, problems };
}

test('every page loads under its CSP with no errors and no off-site requests', async () => {
  for (const p of PAGES) {
    const offsite = [];
    const { page, ctx, problems } = await open(p);
    page.on('request', (r) => !r.url().startsWith(`http://127.0.0.1:${srv.port}/`) && offsite.push(r.url()));
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(problems, [], p);
    assert.deepEqual(offsite, [], p);
    assert.equal(await page.evaluate(() => document.fonts.check('16px "Bricolage Grotesque"')), true, p);
    assert.equal(await page.locator('figure.is-static').count(), 0, `${p}: a chart failed to go live`);
    await ctx.close();
  }
});

test('charts are redrawn at the width they are shown at', async () => {
  for (const width of [1280, 390]) {
    const { page, ctx } = await open('inflation/index.html', { viewport: { width, height: 900 } });
    const r = await page.evaluate(() => [...document.querySelectorAll('.plot')].map((p) => [Math.round(p.clientWidth), Number(p.querySelector('svg').getAttribute('width'))]));
    for (const [shown, drawn] of r) assert.equal(drawn, shown, `at ${width}px`);
    await ctx.close();
  }
});

test('a chart can be read with the keyboard and announces each value', async () => {
  const { page, ctx } = await open('fuel/index.html');
  const plot = page.locator('#fuel-last-year .plot');
  await plot.focus();
  const readout = page.locator('#fuel-last-year [data-readout]');
  assert.match(await readout.textContent(), /^Week from 19 November 2026: RON97 RM4\.00; RON95 \(unsubsidised\) RM3\.72/);
  await page.keyboard.press('ArrowLeft');
  assert.match(await readout.textContent(), /^Week from 12 November 2026: RON97 RM4\.20/);
  await page.keyboard.press('Home');
  assert.match(await readout.textContent(), /^Week from \d+ November 2025/);
  assert.equal(await page.locator('#fuel-last-year .cursor line.rule').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#fuel-last-year .cursor > *').count(), 0);
  await ctx.close();
});

test('hovering a chart shows a crosshair and a tooltip; leaving hides them', async () => {
  const { page, ctx } = await open('jobs/index.html');
  const plot = page.locator('#jobs-unemployment .plot');
  await plot.scrollIntoViewIfNeeded();
  const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  const tip = page.locator('#jobs-unemployment .tip');
  assert.equal(await tip.isVisible(), true);
  assert.match(await tip.textContent(), /Unemployment rate\d+\.\d%/);
  assert.equal(await page.locator('#jobs-unemployment .cursor .dot').count(), 1);
  await page.mouse.move(5, 5);
  assert.equal(await tip.isVisible(), false);
  await ctx.close();
});

test('the data table opens and its CSV downloads', async () => {
  const { page, ctx } = await open('gdp/index.html');
  const fig = page.locator('#gdp-growth');
  await fig.locator('summary').click();
  assert.ok((await fig.locator('tbody tr').count()) > 20);
  const href = await fig.locator('.btn-csv').getAttribute('href');
  const res = await page.request.get(new URL(href, page.url()).toString());
  assert.equal(res.status(), 200);
  assert.match(await res.text(), /^date,growth_yoy\r\n2016-01-01,/);
  await ctx.close();
});

test('the theme toggle switches, says what it does, and is remembered', async () => {
  const { page, ctx } = await open('index.html', { colorScheme: 'light' });
  const btn = page.locator('[data-theme-toggle]');
  assert.equal(await btn.getAttribute('aria-label'), 'Switch to dark theme');
  await btn.click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await ctx.close();
});

test('at 360 px wide no page scrolls sideways', async () => {
  for (const p of PAGES) {
    const { page, ctx } = await open(p, { viewport: { width: 360, height: 780 } });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `${p} overflows by ${over}px`);
    await ctx.close();
  }
});

test('every page has one h1, a main landmark, labelled controls and focusable charts', async () => {
  for (const p of PAGES) {
    const { page, ctx } = await open(p);
    assert.equal(await page.locator('h1').count(), 1, p);
    assert.equal(await page.locator('main').count(), 1, p);
    const unlabeled = await page.evaluate(() => [...document.querySelectorAll('button, [tabindex="0"]')].filter((b) => !b.hidden && !(b.textContent.trim() || b.getAttribute('aria-label'))).length);
    assert.equal(unlabeled, 0, p);
    const imgs = await page.evaluate(() => [...document.querySelectorAll('svg[role="img"]')].every((s) => s.querySelector('title')?.textContent && s.querySelector('desc')?.textContent));
    assert.ok(imgs, `${p}: every chart has a title and description`);
    await ctx.close();
  }
});

// Computed colours go through a canvas to get sRGB bytes.
const CONTRAST = `(sels) => {
  const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d', { willReadFrequently: true });
  const rgb = (col) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = col; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const lum = ([r, gr, b]) => [r, gr, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const b = getComputedStyle(e).backgroundColor; if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return rgb(b); } return rgb(getComputedStyle(document.body).backgroundColor); };
  return sels.map((sel) => { const el = document.querySelector(sel); if (!el) return [sel, 0]; const fg = rgb(getComputedStyle(el).color); const [a, b] = [lum(fg), lum(bgOf(el))].sort((x, y) => y - x); return [sel, (a + 0.05) / (b + 0.05)]; });
}`;

test('text colours meet WCAG AA contrast (4.5:1) on their backgrounds in both themes', async () => {
  const sel = ['.lead', '.eyebrow', '.card-ms', '.card-what', '.stamp', '.delta-up', '.delta-down', '.delta-flat', '.topic-strip a', '.rel-what', '.colophon p'];
  for (const scheme of ['light', 'dark']) {
    const { page, ctx } = await open('index.html', { colorScheme: scheme, reducedMotion: 'reduce' });
    const ratios = await page.evaluate(`(${CONTRAST})(${JSON.stringify(sel)})`);
    for (const [s, r] of ratios) assert.ok(r >= 4.5, `${scheme} ${s}: ${r.toFixed(2)}:1`);
    await ctx.close();
    const topic = await open('fuel/index.html', { colorScheme: scheme, reducedMotion: 'reduce' });
    const r2 = await topic.page.evaluate(`(${CONTRAST})(${JSON.stringify(['.fig-ms', '.fig-source', '.stamps dt', '.hl-period', '.legend li', '.table-wrap summary'])})`);
    for (const [s, r] of r2) assert.ok(r >= 4.5, `${scheme} fuel ${s}: ${r.toFixed(2)}:1`);
    await topic.ctx.close();
  }
});

test('reduced motion stops the ticker and the line drawing; otherwise they move', async () => {
  const still = await open('index.html', { reducedMotion: 'reduce' });
  assert.equal(await still.page.evaluate(() => getComputedStyle(document.querySelector('.ticker-track')).animationName), 'none');
  assert.equal(await still.page.evaluate(() => getComputedStyle(document.querySelector('.spark .line')).animationName), 'none');
  await still.ctx.close();
  const moving = await open('index.html', { reducedMotion: 'no-preference' });
  assert.equal(await moving.page.evaluate(() => getComputedStyle(document.querySelector('.ticker-track')).animationName), 'tick');
  await moving.ctx.close();
});

test('without JavaScript every chart and table is still there', async () => {
  const { page, ctx } = await open('ringgit/index.html', { javaScriptEnabled: false });
  assert.equal(await page.locator('figure svg[role="img"]').count(), 4);
  assert.equal(await page.locator('figure table').count(), 4);
  assert.equal(await page.locator('[data-theme-toggle]').isVisible(), false, 'the toggle only appears when it works');
  await ctx.close();
});

test('the feeds are served and parse', async () => {
  const { page, ctx } = await open('index.html');
  for (const f of ['feed.json', 'latest.json']) {
    const res = await page.request.get(`http://127.0.0.1:${srv.port}/${f}`);
    assert.equal(res.status(), 200);
    assert.ok(JSON.parse(await res.text()));
  }
  await ctx.close();
});
