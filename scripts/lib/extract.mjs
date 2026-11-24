// Rows -> series. A series is a sorted list of [date, value] pairs with ISO dates and
// finite numbers. Nothing is interpolated, filled or smoothed: a missing value stays missing.
import { DataError } from './api.mjs';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
export const SERIES_KEY = /^[a-z0-9_]{1,48}$/;

export function isIsoDay(s) {
  const m = ISO_DAY.exec(String(s));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Floating-point noise from the API (-0.1499999999999999) is rounded away; 15 significant
// digits keep every real digit (trade values in ringgit run to 12).
export function cleanNumber(v) {
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const r = Number(v.toPrecision(15));
  return Object.is(r, -0) ? 0 : r;
}

export function slugKey(v) {
  const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s.slice(0, 40);
}

function add(out, key, date, value, id) {
  if (!SERIES_KEY.test(key)) throw new DataError(`${id}: bad series key ${key.slice(0, 50)}`);
  const s = (out[key] ??= new Map());
  if (s.has(date) && s.get(date) !== value) throw new DataError(`${id}: two different values for ${key} on ${date}`);
  s.set(date, value);
}

function matches(row, where = {}) {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

export function extractSeries(ds, rows) {
  const out = {};
  let skipped = 0;
  for (const row of rows) {
    const date = row.date;
    if (!isIsoDay(date)) {
      skipped += 1;
      continue;
    }
    for (const ex of ds.extract) {
      if (!matches(row, ex.where)) continue;
      if (ex.type === 'wide') {
        for (const [key, col] of Object.entries(ex.values)) {
          const v = cleanNumber(row[col]);
          if (v !== null) add(out, key, date, v, ds.id);
        }
      } else if (ex.type === 'long') {
        const raw = slugKey(row[ex.keyCol]);
        if (!raw || (ex.keys && !ex.keys.includes(raw))) continue;
        const v = cleanNumber(row[ex.valueCol]);
        if (v !== null) add(out, `${ex.prefix ?? ''}${raw}`, date, v, ds.id);
      } else {
        throw new DataError(`${ds.id}: unknown extract type ${ex.type}`);
      }
    }
  }
  const series = {};
  for (const key of Object.keys(out).sort()) {
    series[key] = [...out[key].entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  if (!Object.keys(series).length) throw new DataError(`${ds.id}: no usable values in ${rows.length} rows`);
  return { series, skipped };
}
