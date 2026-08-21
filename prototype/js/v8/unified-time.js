const MODES = new Set(['PAST', 'NOW', 'FORECAST', 'SIMULATION']);

function validIso(value, field) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${field} must be an ISO date-time`);
  return value;
}

export function bindSignalTime(signal) {
  if (signal?.dataClass === 'OBSERVED') return signal.times?.observedAt ?? null;
  if (signal?.dataClass === 'OFFICIAL_FORECAST' || signal?.dataClass === 'MODEL_OUTPUT' || signal?.dataClass === 'EARTHUS_DERIVED') {
    return signal.times?.validAt ?? null;
  }
  if (signal?.dataClass === 'OFFICIAL_WARNING') return signal.times?.validAt ?? signal.times?.issuedAt ?? null;
  return signal?.times?.validAt ?? null;
}

export class UnifiedTime {
  #now;
  #onChange;
  #availability = new Map();
  #state;
  #playWindow = null;

  constructor({ now = () => new Date().toISOString(), timezone = 'UTC', onChange = () => {} } = {}) {
    this.#now = now;
    this.#onChange = onChange;
    this.#state = {
      schemaVersion: '8.0', mode: 'NOW', cursorTime: validIso(now(), 'now'), timezone,
      playback: { state: 'STOPPED', rate: 1, loop: false },
    };
  }

  registerAvailability(layerId, availability) {
    if (!layerId) throw new TypeError('layerId is required');
    const from = validIso(availability.from, 'from');
    const to = validIso(availability.to, 'to');
    if (Date.parse(from) > Date.parse(to)) throw new RangeError('availability from must not exceed to');
    this.#availability.set(layerId, { from, to, stepSeconds: availability.stepSeconds ?? null, state: availability.state ?? 'AVAILABLE' });
  }

  setMode(mode) {
    if (!MODES.has(mode)) throw new TypeError(`unknown time mode: ${mode}`);
    this.#state.mode = mode;
    this.stopPlayback();
    if (mode === 'NOW') this.#state.cursorTime = validIso(this.#now(), 'now');
    this.#emit('time.mode.changed');
    return this.snapshot();
  }

  setCursor(cursorTime) {
    this.#state.cursorTime = validIso(cursorTime, 'cursorTime');
    this.#emit('time.cursor.changed');
    return this.snapshot();
  }

  layerState(layerId) {
    const availability = this.#availability.get(layerId);
    if (!availability) return 'UNAVAILABLE';
    if (availability.state === 'BLOCKED_RIGHTS') return 'BLOCKED_RIGHTS';
    const cursor = Date.parse(this.#state.cursorTime);
    return cursor >= Date.parse(availability.from) && cursor <= Date.parse(availability.to)
      ? availability.state
      : 'UNAVAILABLE';
  }

  startPlayback({ from, to, stepSeconds, rate = 1 }) {
    validIso(from, 'from'); validIso(to, 'to');
    if (Date.parse(from) > Date.parse(to)) throw new RangeError('playback from must not exceed to');
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) throw new RangeError('stepSeconds must be positive');
    this.#playWindow = { from, to, stepSeconds };
    this.#state.cursorTime = from;
    this.#state.playback = { state: 'PLAYING', rate, loop: false };
    this.#emit('time.cursor.changed');
    return this.snapshot();
  }

  advance() {
    if (this.#state.playback.state !== 'PLAYING' || !this.#playWindow) return this.snapshot();
    const next = Date.parse(this.#state.cursorTime) + this.#playWindow.stepSeconds * 1000;
    if (next > Date.parse(this.#playWindow.to)) {
      this.stopPlayback();
      return this.snapshot();
    }
    this.#state.cursorTime = new Date(next).toISOString();
    this.#emit('time.cursor.changed');
    return this.snapshot();
  }

  stopPlayback() {
    this.#state.playback = { ...this.#state.playback, state: 'STOPPED', loop: false };
    this.#playWindow = null;
    return this.snapshot();
  }

  snapshot() {
    return structuredClone({
      ...this.#state,
      layerAvailability: [...this.#availability].map(([layerId, availability]) => ({ layerId, state: this.layerState(layerId), ...availability })),
    });
  }

  #emit(type) { this.#onChange({ type, detail: this.snapshot() }); }
}
