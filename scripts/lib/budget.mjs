// One budget per build: total requests, total bytes and a wall-clock deadline,
// plus a minimum gap between requests to the same host.

export class BudgetExceeded extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceeded';
  }
}

export class Budget {
  constructor({ maxRequests, maxBytes, wallClockMs, hostIntervalMs = {}, now = () => Date.now(), sleep } = {}) {
    for (const [k, v] of Object.entries({ maxRequests, maxBytes, wallClockMs })) {
      if (!Number.isFinite(v) || v <= 0) throw new Error(`budget: ${k} must be a positive number`);
    }
    this.maxRequests = maxRequests;
    this.maxBytes = maxBytes;
    this.now = now;
    this.deadline = now() + wallClockMs;
    this.hostIntervalMs = hostIntervalMs;
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.requests = 0;
    this.bytes = 0;
    this.cacheHits = 0;
    this.nextAt = new Map();
    this.queue = Promise.resolve();
  }

  remainingMs() {
    return Math.max(0, this.deadline - this.now());
  }

  check() {
    if (this.requests >= this.maxRequests) throw new BudgetExceeded(`request budget used up (${this.maxRequests} requests)`);
    if (this.bytes >= this.maxBytes) throw new BudgetExceeded(`byte budget used up (${this.maxBytes} bytes)`);
    if (this.remainingMs() <= 0) throw new BudgetExceeded('time budget used up');
  }

  // Reserve one request slot for `host`, waiting for its spacing. Requests are serialised.
  async acquire(host) {
    const run = async () => {
      this.check();
      const gap = this.hostIntervalMs[host] ?? 0;
      const wait = Math.max(0, (this.nextAt.get(host) ?? 0) - this.now());
      if (wait > this.remainingMs()) throw new BudgetExceeded('time budget would run out waiting for the rate limit');
      if (wait > 0) await this.sleep(wait);
      this.check();
      this.requests += 1;
      this.nextAt.set(host, this.now() + gap);
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  // Push the next request to `host` back (used for Retry-After).
  delayHost(host, ms) {
    this.nextAt.set(host, Math.max(this.nextAt.get(host) ?? 0, this.now() + ms));
  }

  addBytes(n) {
    this.bytes += n;
    if (this.bytes > this.maxBytes) throw new BudgetExceeded(`byte budget used up (${this.maxBytes} bytes)`);
  }

  summary() {
    return { requests: this.requests, bytes: this.bytes, cacheHits: this.cacheHits };
  }
}
