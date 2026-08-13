/* base 관측 타일과 시각 sibling이 공유하는 bounded promise cache. */

export class SharedTilePromiseCache {
  constructor({ maxEntries = 192, ttlMs = 30_000 } = {}) {
    if (!(maxEntries > 0) || !(ttlMs > 0)) throw new RangeError('INVALID_TILE_CACHE_LIMIT');
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.entries = new Map();
    this.stats = { hit: 0, miss: 0, evicted: 0, rejected: 0 };
  }

  getOrCreate(key, factory) {
    const now = Date.now();
    const old = this.entries.get(key);
    if (old && now - old.touched <= this.ttlMs) {
      old.touched = now;
      this.entries.delete(key);
      this.entries.set(key, old);
      this.stats.hit += 1;
      return old.promise;
    }
    if (old) this.entries.delete(key);
    const produced = factory();
    if (produced == null) return produced; // Cesium throttle 신호는 캐시하지 않는다.
    this.stats.miss += 1;
    const entry = { touched: now, promise: Promise.resolve(produced) };
    entry.promise = entry.promise.catch(error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      this.stats.rejected += 1;
      throw error;
    });
    this.entries.set(key, entry);
    this._trim();
    return entry.promise;
  }

  deletePrefix(prefix) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  _trim() {
    while (this.entries.size > this.maxEntries) {
      const first = this.entries.keys().next().value;
      this.entries.delete(first);
      this.stats.evicted += 1;
    }
  }

  snapshot() { return { size: this.entries.size, ...this.stats }; }
}

export const satelliteTileCache = new SharedTilePromiseCache();
