// The only way the site talks to the network: HTTPS GET to an allow-listed host,
// no redirects, a timeout, a size cap, the shared budget, the cache and a generic User-Agent.
// (Adapted from physical-ai-radar's http layer.)
import { BudgetExceeded } from './budget.mjs';

import { API_HOST } from './config.mjs';

export const ALLOWED_HOSTS = Object.freeze([API_HOST]);

export class HttpError extends Error {
  constructor(message, { status = 0, url = '' } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export function checkUrl(url, allowed = ALLOWED_HOSTS) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError(`not a URL: ${String(url).slice(0, 80)}`);
  }
  if (u.protocol !== 'https:') throw new HttpError(`refusing non-https URL: ${u.protocol}//${u.host}`);
  if (u.username || u.password) throw new HttpError('refusing a URL with credentials');
  if (!allowed.includes(u.hostname)) throw new HttpError(`host not allowed: ${u.hostname}`);
  if (u.port && u.port !== '443') throw new HttpError(`refusing a non-standard port: ${u.port}`);
  return u;
}

// Read a response body up to maxBytes; anything larger is an error, not a silent cut.
export async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(`response too large (${declared} bytes > ${maxBytes})`);
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(`response too large (over ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

function retryAfterMs(headers, cap, fallback) {
  const raw = headers.get('retry-after');
  if (!raw) return Math.min(cap, fallback);
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.min(cap, Math.max(0, secs * 1000));
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.min(cap, Math.max(0, at - Date.now())) : Math.min(cap, fallback);
}

const RETRY_STATUS = new Set([429, 502, 503, 504]);

export function createHttp({
  fetchImpl = globalThis.fetch,
  budget,
  cache = null,
  userAgent,
  timeoutMs,
  maxResponseBytes,
  maxRetries = 1,
  maxRetryAfterMs = 30_000,
  defaultRetryMs = 65_000,
  allowedHosts = ALLOWED_HOSTS,
  offline = false,
} = {}) {
  if (!budget) throw new Error('createHttp: a budget is required');
  if (!userAgent || /@/.test(userAgent)) throw new Error('createHttp: a generic User-Agent without an email address is required');

  async function once(u, accept, maxBytes, callTimeoutMs) {
    await budget.acquire(u.hostname);
    const headers = { 'user-agent': userAgent, accept };
    const ctrl = new AbortController();
    const limit = callTimeoutMs ?? timeoutMs;
    const timer = setTimeout(() => ctrl.abort(), Math.min(limit, Math.max(1, budget.remainingMs())));
    try {
      const res = await fetchImpl(u.toString(), { method: 'GET', headers, redirect: 'manual', signal: ctrl.signal });
      if (res.status >= 300 && res.status < 400) {
        throw new HttpError(`redirect refused (${res.status})`, { status: res.status, url: u.toString() });
      }
      const body = await readCapped(res, maxBytes);
      budget.addBytes(Buffer.byteLength(body));
      return { status: res.status, body, headers: res.headers, contentType: res.headers.get('content-type') ?? '' };
    } catch (err) {
      if (err.name === 'AbortError' || ctrl.signal.aborted) throw new HttpError(`timed out after ${limit} ms`, { url: u.toString() });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getText(url, { accept = 'application/json', maxBytes = maxResponseBytes, timeoutMs: callTimeoutMs } = {}) {
    const u = checkUrl(url, allowedHosts);
    const hit = cache?.get(u.toString(), accept);
    if (hit) {
      budget.cacheHits += 1;
      if (hit.status >= 200 && hit.status < 300) return { status: hit.status, body: hit.body, fromCache: true };
    }
    // Offline: replay cached responses only; a miss is an error and nothing is sent.
    if (offline) throw new HttpError(`offline: not in the cache: ${u.hostname}${u.pathname}`, { url: u.toString() });
    let attempt = 0;
    for (;;) {
      const res = await once(u, accept, maxBytes, callTimeoutMs);
      if (RETRY_STATUS.has(res.status) && attempt < maxRetries) {
        attempt += 1;
        budget.delayHost(u.hostname, retryAfterMs(res.headers, maxRetryAfterMs, defaultRetryMs));
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        throw new HttpError(`HTTP ${res.status} from ${u.hostname}`, { status: res.status, url: u.toString() });
      }
      cache?.set(u.toString(), accept, res);
      return { status: res.status, body: res.body, fromCache: false };
    }
  }

  async function getJson(url, opts) {
    const { body, fromCache } = await getText(url, opts);
    try {
      return { data: JSON.parse(body), fromCache };
    } catch {
      throw new HttpError(`invalid JSON from ${new URL(url).hostname}`, { url });
    }
  }

  return { getText, getJson, budget };
}

export function isBudgetError(err) {
  return err instanceof BudgetExceeded;
}
