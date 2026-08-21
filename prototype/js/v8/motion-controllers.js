export class FollowController {
  #now; #onEvent; #state = { state: 'IDLE', targetId: null, startedAt: null, endsAt: null };
  constructor({ now = () => Date.now(), onEvent = () => {} } = {}) { this.#now = now; this.#onEvent = onEvent; }
  start(targetId, durationMs = 12000) {
    if (!targetId) throw new TypeError('targetId is required');
    const bounded = Math.min(60000, Math.max(500, durationMs));
    const startedAt = this.#now();
    this.#state = { state: 'PLAYING', targetId, startedAt, endsAt: startedAt + bounded };
    this.#onEvent({ type: 'follow.started', targetId, durationMs: bounded });
    return this.snapshot();
  }
  tick() { if (this.#state.state === 'PLAYING' && this.#now() >= this.#state.endsAt) this.stop('COMPLETED'); return this.snapshot(); }
  onUserCameraInput() { if (this.#state.state === 'PLAYING') this.stop('USER'); }
  targetLost() { if (this.#state.state === 'PLAYING') this.stop('TARGET_LOST'); }
  stop(reason = 'USER') {
    const previous = this.#state;
    this.#state = { ...previous, state: reason === 'COMPLETED' ? 'COMPLETED' : 'STOPPED' };
    this.#onEvent({ type: 'follow.stopped', targetId: previous.targetId, reason });
    return this.snapshot();
  }
  snapshot() { return structuredClone(this.#state); }
}

export class CinemaController {
  #now; #onEvent; #manifest = null; #shotIndex = 0; #shotStartedAt = null; #pausedAt = null; #state = 'IDLE';
  constructor({ now = () => Date.now(), onEvent = () => {} } = {}) { this.#now = now; this.#onEvent = onEvent; }
  load(manifest) {
    if (manifest?.finite !== true) throw new TypeError('cinema manifest must be finite');
    if (!Array.isArray(manifest.shots) || manifest.shots.length === 0) throw new TypeError('cinema manifest needs finite shots');
    for (const shot of manifest.shots) if (!shot.shotId || !shot.sceneId || !Number.isFinite(shot.durationMs) || shot.durationMs < 500 || shot.durationMs > 20000) throw new TypeError('invalid finite cinema shot');
    this.#manifest = structuredClone(manifest); this.#shotIndex = 0; this.#state = 'IDLE';
    this.#shotStartedAt = null; this.#pausedAt = null;
    return this.snapshot();
  }
  play() {
    if (!this.#manifest) throw new Error('cinema manifest is not loaded');
    if (this.#state === 'PAUSED') {
      this.#shotStartedAt += this.#now() - this.#pausedAt;
      this.#pausedAt = null;
      this.#state = 'PLAYING';
      return this.snapshot();
    }
    this.#shotIndex = 0; this.#shotStartedAt = this.#now(); this.#state = 'PLAYING';
    this.#onEvent({ type: 'cinema.started', cinemaId: this.#manifest.cinemaId });
    this.#emitShot(); return this.snapshot();
  }
  pause() {
    if (this.#state === 'PLAYING') { this.#pausedAt = this.#now(); this.#state = 'PAUSED'; }
    return this.snapshot();
  }
  tick() {
    if (this.#state !== 'PLAYING') return this.snapshot();
    const shot = this.#manifest.shots[this.#shotIndex];
    if (this.#now() - this.#shotStartedAt < shot.durationMs) return this.snapshot();
    if (this.#shotIndex >= this.#manifest.shots.length - 1) return this.stop('COMPLETED');
    this.#shotStartedAt += shot.durationMs; this.#shotIndex += 1; this.#emitShot(); return this.snapshot();
  }
  stop(reason = 'USER') {
    this.#state = reason === 'COMPLETED' ? 'COMPLETED' : 'STOPPED';
    this.#pausedAt = null;
    this.#onEvent({ type: reason === 'COMPLETED' ? 'cinema.completed' : 'cinema.stopped', cinemaId: this.#manifest?.cinemaId ?? null, reason });
    return this.snapshot();
  }
  snapshot() { return { state: this.#state, cinemaId: this.#manifest?.cinemaId ?? null, shotId: this.#manifest?.shots?.[this.#shotIndex]?.shotId ?? null, shotIndex: this.#shotIndex }; }
  #emitShot() { const shot = this.#manifest.shots[this.#shotIndex]; this.#onEvent({ type: 'cinema.shot', cinemaId: this.#manifest.cinemaId, shotId: shot.shotId, sceneId: shot.sceneId }); }
}
