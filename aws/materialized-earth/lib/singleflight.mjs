export class SingleFlight {
  #inflight = new Map();
  #leaders = 0;
  #followers = 0;

  run(key, worker) {
    if (!key) throw new Error('SINGLEFLIGHT_KEY_REQUIRED');
    if (typeof worker !== 'function') throw new Error('SINGLEFLIGHT_WORKER_REQUIRED');
    const existing = this.#inflight.get(key);
    if (existing) {
      this.#followers += 1;
      return existing;
    }
    this.#leaders += 1;
    const promise = Promise.resolve().then(worker).finally(() => {
      if (this.#inflight.get(key) === promise) this.#inflight.delete(key);
    });
    this.#inflight.set(key, promise);
    return promise;
  }

  metrics() {
    return Object.freeze({
      leaders: this.#leaders,
      followers: this.#followers,
      inflight: this.#inflight.size,
    });
  }
}
