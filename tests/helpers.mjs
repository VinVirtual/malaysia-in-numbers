// Test helpers: recorded fixtures, a fake fetch (no network in tests), a budget that never
// sleeps, and a data folder built from the fixtures.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Budget } from '../scripts/lib/budget.mjs';
import { createHttp } from '../scripts/lib/http.mjs';
import { DATASETS } from '../scripts/lib/config.mjs';
import { parseResponse } from '../scripts/lib/api.mjs';
import { extractSeries } from '../scripts/lib/extract.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIX = path.join(ROOT, 'tests', 'fixtures');

export const fixtureText = (id) => fs.readFileSync(path.join(FIX, `${id}.json`), 'utf8');
export const fixtureJson = (id) => JSON.parse(fixtureText(id));

export function tmpDir(prefix = 'mnum-test-') {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function makeResponse(status, body, headers = {}) {
  return new Response(status === 204 || status === 304 || (status >= 300 && status < 400) ? null : body, { status, headers });
}

// routes: [[predicate(url) | substring, handler(url, init) -> {status, body, headers} | Response]]
export function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const [match, handler] of routes) {
      const ok = typeof match === 'function' ? match(url) : url.includes(match);
      if (!ok) continue;
      const r = await handler(url, init);
      return r instanceof Response ? r : makeResponse(r.status ?? 200, r.body ?? '', r.headers ?? {});
    }
    return makeResponse(404, 'not found');
  };
  fn.calls = calls;
  return fn;
}

// Answers every dataset request with its recorded fixture.
export function fixtureFetch(override = {}) {
  return fakeFetch([[() => true, (url) => {
    const id = new URL(url).searchParams.get('id');
    if (override[id]) return override[id](url);
    return { body: fixtureText(id), headers: { 'content-type': 'application/json' } };
  }]]);
}

export function testBudget(over = {}) {
  let t = 1_000_000;
  const sleeps = [];
  const b = new Budget({
    maxRequests: 100,
    maxBytes: 50 * 1024 * 1024,
    wallClockMs: 600_000,
    hostIntervalMs: {},
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    ...over,
  });
  b.sleeps = sleeps;
  b.advance = (ms) => {
    t += ms;
  };
  return b;
}

export function testHttp(fetchImpl, over = {}) {
  return createHttp({
    fetchImpl,
    budget: over.budget ?? testBudget(),
    userAgent: 'malaysia-in-numbers-test/0 (+https://example.org/)',
    timeoutMs: 5_000,
    maxResponseBytes: 3 * 1024 * 1024,
    cache: null,
    ...over,
  });
}

// A dataset file made from a fixture, as "mnum fetch" would write it.
export function fixtureFile(id, fetchedAt = '2026-11-24T10:00:00.000Z') {
  const ds = DATASETS.find((d) => d.id === id);
  const { meta, rows } = parseResponse(fixtureText(id), id);
  return { schema: 1, id, fetchedAt, meta, series: extractSeries(ds, rows).series };
}

export function allFixtureFiles() {
  return Object.fromEntries(DATASETS.map((d) => [d.id, fixtureFile(d.id)]));
}
