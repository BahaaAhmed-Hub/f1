import { log } from './log.js';

/**
 * Jolpica publishes a burst limit of 4 req/s and 500 req/hour for anonymous
 * use. We stay well under it with a serialised queue and a fixed gap.
 */
class RateLimiter {
  constructor(minGapMs) { this.minGapMs = minGapMs; this.chain = Promise.resolve(); }
  run(fn) {
    const next = this.chain.then(async () => {
      const out = await fn();
      await new Promise(r => setTimeout(r, this.minGapMs));
      return out;
    });
    // Keep the chain alive even when a call rejects.
    this.chain = next.then(() => {}, () => {});
    return next;
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export function createClient({ minGapMs = 300, retries = 4, timeoutMs = 30_000, name = 'http' } = {}) {
  const limiter = new RateLimiter(minGapMs);

  async function getJson(url) {
    return limiter.run(async () => {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt) {
          const backoff = Math.min(2 ** attempt * 1000, 30_000) + Math.random() * 500;
          log.warn(`${name}: retry ${attempt}/${retries} in ${Math.round(backoff)}ms — ${lastErr}`);
          await new Promise(r => setTimeout(r, backoff));
        }
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            signal: ac.signal,
            headers: { 'user-agent': 'f1-infographic-etl (+https://github.com/BahaaAhmed-Hub/f1)' },
          });
          if (res.status === 404) return null;               // nothing published yet
          if (!res.ok) {
            lastErr = `HTTP ${res.status}`;
            if (!RETRYABLE.has(res.status)) throw new Error(`${name} ${url}: ${lastErr}`);
            continue;
          }
          return await res.json();
        } catch (err) {
          if (err.name === 'AbortError') lastErr = `timeout after ${timeoutMs}ms`;
          else if (/HTTP \d+/.test(err.message)) throw err;  // non-retryable, already tagged
          else lastErr = err.message;
        } finally {
          clearTimeout(timer);
        }
      }
      throw new Error(`${name} ${url}: gave up after ${retries} retries — ${lastErr}`);
    });
  }

  return { getJson };
}
