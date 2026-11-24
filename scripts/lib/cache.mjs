// A small on-disk cache of API responses, so a re-run within the TTL asks nobody.
// Keys never include credentials.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { writeJsonAtomic, assertNoSymlinks } from './safe-fs.mjs';

export class ResponseCache {
  constructor({ dir, root, ttlMs, now = () => Date.now() } = {}) {
    this.dir = dir;
    this.root = root ?? dir;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  static key(url, accept = '') {
    return crypto.createHash('sha256').update(`GET ${url}\n${accept}`).digest('hex');
  }

  file(key) {
    return path.join(this.dir, key.slice(0, 2), `${key}.json`);
  }

  get(url, accept) {
    if (!this.dir) return null;
    const f = this.file(ResponseCache.key(url, accept));
    let st;
    try {
      assertNoSymlinks(f, this.root);
      st = fs.lstatSync(f);
    } catch {
      return null;
    }
    if (!st.isFile()) return null;
    try {
      const entry = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (entry?.url !== url || typeof entry.body !== 'string' || !Number.isFinite(entry.fetchedAt)) return null;
      if (this.now() - entry.fetchedAt > this.ttlMs) return null;
      return entry;
    } catch {
      return null; // a damaged cache file is ignored and replaced
    }
  }

  set(url, accept, { status, body, contentType }) {
    if (!this.dir) return;
    const entry = { url, accept, status, contentType, fetchedAt: this.now(), body };
    writeJsonAtomic(this.file(ResponseCache.key(url, accept)), entry, this.root);
  }
}
