// One run: ask the API for each dataset in turn (one request each, spaced for the rate
// limit), check and reshape the rows, and write a dataset file only when something changed.
// A dataset that fails keeps its committed file; the run reports it.
import path from 'node:path';
import { DATASETS, LIMITS, USER_AGENT } from './config.mjs';
import { Budget } from './budget.mjs';
import { ResponseCache } from './cache.mjs';
import { createHttp, isBudgetError } from './http.mjs';
import { buildUrl, parseResponse } from './api.mjs';
import { extractSeries } from './extract.mjs';
import { loadDataset, diffSeries, writeDataset, appendRelease } from './store.mjs';

export function makeHttp({ root, offline = false, fetchImpl, useCache = true, limits = LIMITS, sleep, now } = {}) {
  const budget = new Budget({ maxRequests: limits.maxRequests, maxBytes: limits.maxBytes, wallClockMs: limits.wallClockMs, hostIntervalMs: limits.hostIntervalMs, sleep, now });
  const cache = useCache ? new ResponseCache({ dir: path.join(root, '.cache', 'api'), root, ttlMs: limits.cacheTtlMs }) : null;
  return createHttp({
    fetchImpl, budget, cache, userAgent: USER_AGENT, timeoutMs: limits.timeoutMs, maxResponseBytes: limits.maxResponseBytes,
    maxRetries: limits.maxRetries, maxRetryAfterMs: limits.maxRetryAfterMs, offline,
  });
}

// A reply that loses values, or whose newest point is older than the committed one, is
// refused: it is far more likely a broken reply than a real deletion.
export function shrinkage(oldSeries, newSeries) {
  if (!oldSeries) return null;
  for (const [key, pts] of Object.entries(oldSeries)) {
    const now = newSeries[key];
    if (!now?.length) return `series ${key} is missing from the reply`;
    if (now.at(-1)[0] < pts.at(-1)[0]) return `series ${key} now ends at ${now.at(-1)[0]}, before ${pts.at(-1)[0]}`;
    const have = new Set(now.map((p) => p[0]));
    const lost = pts.filter((p) => !have.has(p[0])).length;
    if (lost) return `series ${key} lost ${lost} value${lost > 1 ? 's' : ''}`;
  }
  return null;
}

export async function fetchAll({ root, dataDir, http, only = null, datasets = DATASETS, nowIso = () => new Date().toISOString(), log = () => {} }) {
  const results = [];
  for (const ds of datasets) {
    if (only && !only.includes(ds.id)) continue;
    const r = { id: ds.id, ok: false, changed: false };
    try {
      const { data, fromCache } = await http.getJson(buildUrl(ds));
      const { meta, rows } = parseResponse(data, ds.id);
      const { series, skipped } = extractSeries(ds, rows);
      if (skipped) throw new Error(`${skipped} rows without a valid date; keeping the committed file`);
      const old = loadDataset(dataDir, ds.id);
      const diff = diffSeries(old?.series, series);
      const shrink = shrinkage(old?.series, series);
      if (shrink) throw new Error(`${shrink}; keeping the committed file (a source that deletes history is treated as an error, not news)`);
      const metaChanged = !old || JSON.stringify(old.meta) !== JSON.stringify(meta);
      Object.assign(r, { ok: true, fromCache, rows: rows.length, skipped, data_as_of: meta.data_as_of, last_updated: meta.last_updated, ...diff });
      if (diff.changed || metaChanged) {
        const at = nowIso();
        writeDataset(root, dataDir, { schema: 1, id: ds.id, fetchedAt: at, meta, series });
        r.changed = true;
        if (diff.changed) {
          appendRelease(root, dataDir, { at, id: ds.id, data_as_of: meta.data_as_of, last_updated: meta.last_updated, added: diff.added, revised: diff.revised, removed: diff.removed, ...(diff.revisions.length ? { revisions: diff.revisions.slice(0, 5) } : {}) });
        }
      }
      log(`${ds.id}: ${rows.length} rows, data as of ${meta.data_as_of}; ${r.changed ? `+${diff.added} new, ${diff.revised} revised, ${diff.removed} removed` : 'no change'}${fromCache ? ' (cache)' : ''}`);
    } catch (err) {
      r.error = err.message;
      log(`${ds.id}: FAILED: ${err.message}`);
      results.push(r);
      if (isBudgetError(err)) break;
      continue;
    }
    results.push(r);
  }
  return { results, budget: http.budget.summary() };
}
