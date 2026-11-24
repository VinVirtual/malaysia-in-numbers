// The committed data: one compact file per dataset (data/series/<id>.json) and an
// append-only release log (data/releases.jsonl). Git history keeps every earlier version,
// so revisions by the source stay visible.
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_VERSION, DATASET_IDS } from './config.mjs';
import { isIsoDay, SERIES_KEY } from './extract.mjs';
import { writeFileAtomic, readJsonIfExists, assertNoSymlinks } from './safe-fs.mjs';

export class SchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaError';
  }
}

const fail = (p, m) => {
  throw new SchemaError(`${p}: ${m}`);
};
const str = (v, max) => typeof v === 'string' && v.length <= max;

export function validateDatasetFile(f, expectId) {
  if (!f || typeof f !== 'object') fail('file', 'not an object');
  if (f.schema !== SCHEMA_VERSION) fail('schema', `expected ${SCHEMA_VERSION}`);
  if (!DATASET_IDS.includes(f.id)) fail('id', `unknown dataset ${String(f.id).slice(0, 40)}`);
  if (expectId && f.id !== expectId) fail('id', `file is for ${f.id}, expected ${expectId}`);
  if (!str(f.fetchedAt, 40) || Number.isNaN(Date.parse(f.fetchedAt))) fail('fetchedAt', 'not a timestamp');
  const m = f.meta;
  if (!m || !str(m.data_as_of, 20) || !str(m.last_updated, 20)) fail('meta', 'needs data_as_of and last_updated');
  if (!Array.isArray(m.data_source)) fail('meta.data_source', 'not a list');
  if (!f.series || typeof f.series !== 'object' || !Object.keys(f.series).length) fail('series', 'empty');
  for (const [key, pts] of Object.entries(f.series)) {
    if (!SERIES_KEY.test(key)) fail(`series.${key.slice(0, 50)}`, 'bad key');
    if (!Array.isArray(pts) || !pts.length) fail(`series.${key}`, 'empty');
    let prev = '';
    for (const p of pts) {
      if (!Array.isArray(p) || p.length !== 2 || !isIsoDay(p[0]) || typeof p[1] !== 'number' || !Number.isFinite(p[1])) fail(`series.${key}`, `bad point ${JSON.stringify(p).slice(0, 60)}`);
      if (p[0] <= prev) fail(`series.${key}`, `dates not strictly increasing at ${p[0]}`);
      prev = p[0];
    }
  }
  return f;
}

// One line per series point is easy to diff in git; the whole file stays compact.
export function serializeDatasetFile(f) {
  const lines = ['{'];
  lines.push(`  "schema": ${f.schema},`, `  "id": ${JSON.stringify(f.id)},`, `  "fetchedAt": ${JSON.stringify(f.fetchedAt)},`);
  lines.push(`  "meta": ${JSON.stringify(f.meta)},`);
  lines.push('  "series": {');
  const keys = Object.keys(f.series);
  keys.forEach((k, i) => {
    lines.push(`    ${JSON.stringify(k)}: [`);
    const pts = f.series[k];
    pts.forEach((p, j) => lines.push(`      ${JSON.stringify(p)}${j < pts.length - 1 ? ',' : ''}`));
    lines.push(`    ]${i < keys.length - 1 ? ',' : ''}`);
  });
  lines.push('  }', '}');
  return `${lines.join('\n')}\n`;
}

export function datasetPath(dataDir, id) {
  return path.join(dataDir, 'series', `${id}.json`);
}

export function loadDataset(dataDir, id) {
  const f = readJsonIfExists(datasetPath(dataDir, id));
  return f ? validateDatasetFile(f, id) : null;
}

export function loadAll(dataDir) {
  const out = {};
  for (const id of DATASET_IDS) {
    try {
      const f = loadDataset(dataDir, id);
      if (f) out[id] = f;
    } catch (err) {
      throw new Error(`data/series/${id}.json: ${err.message}`);
    }
  }
  return out;
}

// What changed between the committed series and a fresh fetch.
export function diffSeries(oldSeries = {}, newSeries = {}) {
  let added = 0;
  let revised = 0;
  let removed = 0;
  const revisions = [];
  for (const key of new Set([...Object.keys(oldSeries), ...Object.keys(newSeries)])) {
    const a = new Map(oldSeries[key] ?? []);
    const b = new Map(newSeries[key] ?? []);
    for (const [d, v] of b) {
      if (!a.has(d)) added += 1;
      else if (a.get(d) !== v) {
        revised += 1;
        if (revisions.length < 20) revisions.push({ key, date: d, from: a.get(d), to: v });
      }
    }
    for (const d of a.keys()) if (!b.has(d)) removed += 1;
  }
  return { added, revised, removed, revisions, changed: added + revised + removed > 0 };
}

export function writeDataset(root, dataDir, f) {
  validateDatasetFile(f, f.id);
  writeFileAtomic(datasetPath(dataDir, f.id), serializeDatasetFile(f), root);
}

export function appendRelease(root, dataDir, entry) {
  const file = path.join(dataDir, 'releases.jsonl');
  assertNoSymlinks(file, root);
  const line = `${JSON.stringify(entry)}\n`;
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  writeFileAtomic(file, prev + line, root);
}

export function loadReleases(dataDir) {
  const file = path.join(dataDir, 'releases.jsonl');
  if (!fs.existsSync(file)) return [];
  if (fs.lstatSync(file).isSymbolicLink()) throw new Error('refusing to read a symlinked release log');
  const out = [];
  for (const [i, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      throw new SchemaError(`releases.jsonl line ${i + 1}: not JSON`);
    }
    if (!DATASET_IDS.includes(e.id) || !str(e.at, 40) || !str(e.data_as_of, 20)) throw new SchemaError(`releases.jsonl line ${i + 1}: bad entry`);
    out.push(e);
  }
  return out;
}
