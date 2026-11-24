// Requests to api.data.gov.my and checks on what comes back. Everything from the network
// is untrusted until it has passed parseResponse() and extractSeries().
import { API_HOST, LIMITS } from './config.mjs';

export class DataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataError';
  }
}

const ID = /^[a-z0-9_]{2,60}$/;
const PARAM_VALUE = /^[A-Za-z0-9_@,.:\-[\]]{1,200}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// https://api.data.gov.my/<endpoint>/?id=...&meta=true&sort=date&limit=...[&date_start=...@date][&filter=...]
// The trailing slash matters: without it the API answers 301, and redirects are refused.
export function buildUrl(ds, { rowLimit = LIMITS.rowLimit } = {}) {
  if (!ID.test(ds?.id ?? '')) throw new DataError(`bad dataset id: ${String(ds?.id).slice(0, 40)}`);
  if (!['data-catalogue', 'opendosm'].includes(ds.endpoint)) throw new DataError(`bad endpoint for ${ds.id}`);
  const u = new URL(`https://${API_HOST}/${ds.endpoint}/`);
  u.searchParams.set('id', ds.id);
  u.searchParams.set('meta', 'true');
  u.searchParams.set('sort', 'date');
  u.searchParams.set('limit', String(rowLimit));
  if (ds.from) {
    if (!ISO_DAY.test(ds.from)) throw new DataError(`bad start date for ${ds.id}`);
    u.searchParams.set('date_start', `${ds.from}@date`);
  }
  for (const [k, v] of Object.entries(ds.query ?? {})) {
    if (!['filter', 'include', 'exclude'].includes(k)) throw new DataError(`unsupported query parameter ${k} for ${ds.id}`);
    if (!PARAM_VALUE.test(String(v))) throw new DataError(`bad ${k} value for ${ds.id}`);
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

const text = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : null);

// The meta block says when the source last changed the data and what period it covers.
export function parseMeta(meta, id) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new DataError(`${id}: response has no meta block`);
  if (meta.catalogue_id !== undefined && meta.catalogue_id !== id) throw new DataError(`${id}: response is for another dataset (${text(meta.catalogue_id, 40)})`);
  const out = {
    data_as_of: text(meta.data_as_of, 20),
    last_updated: text(meta.last_updated, 20),
    next_update: text(meta.next_update, 20),
    update_frequency: text(meta.update_frequency, 20),
    data_source: Array.isArray(meta.data_source) ? meta.data_source.filter((s) => typeof s === 'string').map((s) => s.slice(0, 40)).slice(0, 8) : [],
  };
  if (!out.data_as_of || !out.last_updated) throw new DataError(`${id}: meta block lacks data_as_of or last_updated`);
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(out.last_updated)) throw new DataError(`${id}: last_updated is not a date`);
  return out;
}

export function parseResponse(body, id) {
  let json;
  try {
    json = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    throw new DataError(`${id}: response is not JSON`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new DataError(`${id}: expected {meta, data}`);
  if (json.status !== undefined && json.status >= 400) throw new DataError(`${id}: API error ${Number(json.status)}`);
  const meta = parseMeta(json.meta, id);
  if (!Array.isArray(json.data)) throw new DataError(`${id}: response has no data array`);
  if (!json.data.length) throw new DataError(`${id}: response has no rows`);
  if (json.data.length >= LIMITS.rowLimit) throw new DataError(`${id}: ${json.data.length} rows reached the row limit; raise LIMITS.rowLimit`);
  for (const row of json.data) if (!row || typeof row !== 'object' || Array.isArray(row)) throw new DataError(`${id}: a row is not an object`);
  return { meta, rows: json.data };
}
