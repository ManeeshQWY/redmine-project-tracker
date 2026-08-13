interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Minimal in-memory TTL cache. Avoids re-fetching thousands of issues on every filter/UI interaction — only a project switch or explicit refresh triggers a re-fetch. */
export class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/** Deduplicates concurrent fetches for the same key so simultaneous requests don't trigger duplicate upstream calls. */
export class InFlightGuard<T> {
  private inFlight = new Map<string, Promise<T>>();

  async run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const promise = fn().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }
}
