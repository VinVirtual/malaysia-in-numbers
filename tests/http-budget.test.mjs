// The network layer: HTTPS only, one allowed host, no redirects, size caps, timeouts, the
// shared budget, rate spacing for the API's 4-a-minute limit, retries and the cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkUrl, HttpError, createHttp } from '../scripts/lib/http.mjs';
import { Budget, BudgetExceeded } from '../scripts/lib/budget.mjs';
import { ResponseCache } from '../scripts/lib/cache.mjs';
import { LIMITS, USER_AGENT, API_HOST } from '../scripts/lib/config.mjs';
import { fakeFetch, testHttp, testBudget, tmpDir, makeResponse } from './helpers.mjs';

const ok = (body = '{}') => () => ({ body });
const API = 'https://api.data.gov.my/opendosm/?id=lfs_month';

test('checkUrl allows only https to api.data.gov.my', () => {
  assert.ok(checkUrl(API));
  assert.throws(() => checkUrl('http://api.data.gov.my/opendosm/'), /non-https/);
  assert.throws(() => checkUrl('https://data.gov.my/'), /host not allowed/);
  assert.throws(() => checkUrl('https://api.data.gov.my.evil.example/'), /host not allowed/);
  assert.throws(() => checkUrl('https://user:pw@api.data.gov.my/'), /credentials/);
  assert.throws(() => checkUrl('https://api.data.gov.my:8443/'), /port/);
  assert.throws(() => checkUrl('file:///etc/passwd'), /non-https/);
  assert.throws(() => checkUrl('not a url'), HttpError);
});

test('the rate limit is respected by design: at most 4 requests a minute', () => {
  const gap = LIMITS.hostIntervalMs[API_HOST];
  assert.ok(60_000 / gap <= 4, `spacing ${gap} ms allows more than 4 a minute`);
  assert.ok(LIMITS.maxRetryAfterMs >= 60_000, 'a 429 should be able to wait out a whole minute');
});

test('the User-Agent is generic, names the site and has no email address', () => {
  assert.match(USER_AGENT, /^malaysia-in-numbers\//);
  assert.ok(!/@/.test(USER_AGENT));
});

test('requests never follow redirects', async () => {
  const f = fakeFetch([['', ok()]]);
  await testHttp(f).getText(API);
  assert.equal(f.calls[0].init.redirect, 'manual');
  assert.equal(f.calls[0].init.headers.authorization, undefined, 'no credentials of any kind');
  const r = fakeFetch([['', () => ({ status: 301, headers: { location: '/opendosm/?id=x' } })]]);
  await assert.rejects(testHttp(r).getText(API), /redirect refused \(301\)/);
});

test('a User-Agent with an email address is refused at setup', () => {
  assert.throws(() => createHttp({ budget: testBudget(), userAgent: 'bot (me@example.org)', timeoutMs: 1, maxResponseBytes: 1 }), /email/);
  assert.throws(() => createHttp({ userAgent: 'x', timeoutMs: 1, maxResponseBytes: 1 }), /budget is required/);
});

test('responses over the size cap are errors, by header or by streaming', async () => {
  const big = 'x'.repeat(5000);
  const declared = fakeFetch([['', () => makeResponse(200, big, { 'content-length': '5000' })]]);
  await assert.rejects(testHttp(declared, { maxResponseBytes: 1000 }).getText(API), /too large/);
  const undeclared = fakeFetch([['', () => makeResponse(200, big)]]);
  await assert.rejects(testHttp(undeclared, { maxResponseBytes: 1000 }).getText(API), /too large/);
});

test('a hanging server times out', async () => {
  const hang = async (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(testHttp(hang, { timeoutMs: 50 }).getText(API), /timed out after 50 ms/);
});

test('non-2xx answers are errors with their status', async () => {
  const f = fakeFetch([['', () => ({ status: 404, body: '{"status_code": 404}' })]]);
  await assert.rejects(testHttp(f).getText(API), (err) => err.status === 404);
});

test('429 waits for Retry-After, or 65 s when the API gives none, then retries once', async () => {
  let n = 0;
  const f = fakeFetch([['', () => (++n === 1 ? { status: 429, headers: { 'retry-after': '20' } } : { body: 'fine' })]]);
  const budget = testBudget();
  assert.equal((await testHttp(f, { budget, maxRetryAfterMs: 65_000 }).getText(API)).body, 'fine');
  assert.ok(budget.sleeps.includes(20_000));

  let m = 0;
  const g = fakeFetch([['', () => (++m === 1 ? { status: 429 } : { body: 'ok' })]]);
  const b2 = testBudget();
  await testHttp(g, { budget: b2, maxRetryAfterMs: 65_000, defaultRetryMs: 65_000 }).getText(API);
  assert.ok(b2.sleeps.includes(65_000));

  const always = fakeFetch([['', () => ({ status: 429 })]]);
  await assert.rejects(testHttp(always, { maxRetryAfterMs: 1000 }).getText(API), /HTTP 429/);
  assert.equal(always.calls.length, 2, 'one retry only');
});

test('a huge Retry-After is capped', async () => {
  let n = 0;
  const f = fakeFetch([['', () => (++n === 1 ? { status: 503, headers: { 'retry-after': '86400' } } : { body: 'x' })]]);
  const budget = testBudget();
  await testHttp(f, { budget, maxRetryAfterMs: 65_000 }).getText(API);
  assert.ok(Math.max(...budget.sleeps) <= 65_000);
});

test('the request budget stops further requests', async () => {
  const f = fakeFetch([['', ok()]]);
  const http = testHttp(f, { budget: testBudget({ maxRequests: 2 }) });
  await http.getText(`${API}&a=1`);
  await http.getText(`${API}&a=2`);
  await assert.rejects(http.getText(`${API}&a=3`), BudgetExceeded);
  assert.equal(f.calls.length, 2);
});

test('the byte budget counts every body', async () => {
  const f = fakeFetch([['', () => ({ body: 'y'.repeat(600) })]]);
  const http = testHttp(f, { budget: testBudget({ maxBytes: 1000 }) });
  await http.getText(`${API}&a=1`);
  await assert.rejects(http.getText(`${API}&a=2`), /byte budget/);
});

test('the wall-clock budget refuses to start late requests', async () => {
  const budget = testBudget({ wallClockMs: 1000 });
  budget.advance(2000);
  await assert.rejects(budget.acquire(API_HOST), /time budget/);
});

test('requests to the API are spaced by its interval', async () => {
  const budget = testBudget({ hostIntervalMs: { [API_HOST]: 16_000 } });
  await budget.acquire(API_HOST);
  await budget.acquire(API_HOST);
  await budget.acquire(API_HOST);
  assert.deepEqual(budget.sleeps, [16_000, 16_000]);
  assert.equal(budget.requests, 3);
});

test('a budget rejects nonsense limits', () => {
  assert.throws(() => new Budget({ maxRequests: 0, maxBytes: 1, wallClockMs: 1 }), /maxRequests/);
  assert.throws(() => new Budget({ maxRequests: 1, maxBytes: -1, wallClockMs: 1 }), /maxBytes/);
  assert.throws(() => new Budget({ maxRequests: 1, maxBytes: 1, wallClockMs: NaN }), /wallClockMs/);
});

test('the cache answers repeat requests without the network and expires', async () => {
  const dir = tmpDir();
  let t = 0;
  const cache = new ResponseCache({ dir: path.join(dir, 'c'), root: dir, ttlMs: 1000, now: () => t });
  const f = fakeFetch([['', ok('{"a":1}')]]);
  const budget = testBudget();
  const http = testHttp(f, { cache, budget });
  await http.getJson(API);
  const second = await http.getJson(API);
  assert.equal(second.fromCache, true);
  assert.equal(f.calls.length, 1);
  assert.equal(budget.cacheHits, 1);
  t = 5000;
  await http.getJson(API);
  assert.equal(f.calls.length, 2, 'expired entry refetched');
});

test('offline mode answers from the cache only and never touches the network', async () => {
  const dir = tmpDir();
  const cache = new ResponseCache({ dir: path.join(dir, 'c'), root: dir, ttlMs: 1e9 });
  cache.set(API, 'application/json', { status: 200, body: '{"x":1}', contentType: 'application/json' });
  const f = fakeFetch([['', ok()]]);
  const http = testHttp(f, { cache, offline: true });
  assert.deepEqual((await http.getJson(API)).data, { x: 1 });
  await assert.rejects(http.getJson(`${API}&other=1`), /offline: not in the cache/);
  assert.equal(f.calls.length, 0);
});

test('damaged or mismatched cache files are ignored', () => {
  const dir = tmpDir();
  const cache = new ResponseCache({ dir, root: dir, ttlMs: 1e9 });
  const file = cache.file(ResponseCache.key(API, 'application/json'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json');
  assert.equal(cache.get(API, 'application/json'), null);
  fs.writeFileSync(file, JSON.stringify({ url: 'https://other/', body: 'x', fetchedAt: Date.now() }));
  assert.equal(cache.get(API, 'application/json'), null, 'entry for another URL is not served');
});

test('a symlink planted in the cache is not followed', () => {
  const dir = tmpDir();
  const cache = new ResponseCache({ dir: path.join(dir, 'c'), root: dir, ttlMs: 1e9 });
  const outside = tmpDir();
  fs.symlinkSync(outside, path.join(dir, 'c'));
  assert.throws(() => cache.set(API, 'application/json', { status: 200, body: 'x', contentType: '' }), /symlink/);
  assert.equal(cache.get(API, 'application/json'), null);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('getJson turns invalid JSON into a clear error', async () => {
  const f = fakeFetch([['', ok('<html>')]]);
  await assert.rejects(testHttp(f).getJson(API), /invalid JSON/);
});
