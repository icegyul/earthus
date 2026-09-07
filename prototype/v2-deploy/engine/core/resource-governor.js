import { THERMAL_STATE } from './constants.js';

const THERMAL_STATES = new Set(Object.values(THERMAL_STATE));

export class ResourceScope {
  #id;
  #abortControllers = new Set();
  #timers = new Set();
  #disposers = new Set();
  #metrics = new Map();
  #disposed = false;

  constructor(id) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('scope id is required');
    this.#id = id;
  }

  get id() { return this.#id; }
  get disposed() { return this.#disposed; }

  ownAbortController(controller = new AbortController()) {
    this.#assertActive();
    this.#abortControllers.add(controller);
    return controller;
  }

  ownTimer(timerId, clear = clearInterval) {
    this.#assertActive();
    if (typeof clear !== 'function') throw new TypeError('clear must be a function');
    this.#timers.add({ timerId, clear });
    return timerId;
  }

  ownDisposer(disposer) {
    this.#assertActive();
    if (typeof disposer !== 'function') throw new TypeError('disposer must be a function');
    this.#disposers.add(disposer);
    return disposer;
  }

  setMetric(name, value) {
    this.#assertActive();
    if (typeof name !== 'string' || !name) throw new TypeError('metric name is required');
    if (!Number.isFinite(value)) throw new TypeError('metric value must be finite');
    this.#metrics.set(name, value);
  }

  snapshot() {
    return Object.freeze({
      id: this.#id,
      disposed: this.#disposed,
      abortControllers: this.#abortControllers.size,
      timers: this.#timers.size,
      disposers: this.#disposers.size,
      metrics: Object.freeze(Object.fromEntries(this.#metrics)),
    });
  }

  dispose() {
    if (this.#disposed) return this.snapshot();
    for (const controller of this.#abortControllers) {
      try { controller.abort(); } catch {}
    }
    for (const timer of this.#timers) {
      try { timer.clear(timer.timerId); } catch {}
    }
    for (const disposer of [...this.#disposers].reverse()) {
      try { disposer(); } catch {}
    }
    this.#abortControllers.clear();
    this.#timers.clear();
    this.#disposers.clear();
    this.#disposed = true;
    return this.snapshot();
  }

  #assertActive() {
    if (this.#disposed) throw new Error(`resource scope is disposed: ${this.#id}`);
  }
}

export class EngineResourceGovernor {
  #scopes = new Map();
  #primaryDynamic = null;
  #staticContext = null;
  #thermalState = THERMAL_STATE.NORMAL;
  #listeners = new Set();

  createScope(id) {
    if (this.#scopes.has(id)) throw new Error(`resource scope already exists: ${id}`);
    const scope = new ResourceScope(id);
    this.#scopes.set(id, scope);
    return scope;
  }

  getScope(id) { return this.#scopes.get(id) ?? null; }

  activatePrimary(id) {
    this.#requireScope(id);
    if (this.#primaryDynamic && this.#primaryDynamic !== id) this.disposeScope(this.#primaryDynamic);
    this.#primaryDynamic = id;
    this.#emit('primary.changed');
  }

  activateStaticContext(id) {
    this.#requireScope(id);
    if (this.#staticContext && this.#staticContext !== id) this.disposeScope(this.#staticContext);
    this.#staticContext = id;
    this.#emit('context.changed');
  }

  setThermalState(state) {
    if (!THERMAL_STATES.has(state)) throw new TypeError(`invalid thermal state: ${state}`);
    if (state === this.#thermalState) return;
    this.#thermalState = state;
    if ([THERMAL_STATE.ECO, THERMAL_STATE.SAFE].includes(state) && this.#primaryDynamic) {
      const scope = this.#scopes.get(this.#primaryDynamic);
      scope?.setMetric('thermalDegraded', 1);
    }
    this.#emit('thermal.changed');
  }

  onChange(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  disposeScope(id) {
    const scope = this.#scopes.get(id);
    if (!scope) return null;
    const snapshot = scope.dispose();
    this.#scopes.delete(id);
    if (this.#primaryDynamic === id) this.#primaryDynamic = null;
    if (this.#staticContext === id) this.#staticContext = null;
    this.#emit('scope.disposed');
    return snapshot;
  }

  disposeAll() {
    for (const id of [...this.#scopes.keys()]) this.disposeScope(id);
  }

  snapshot() {
    return Object.freeze({
      thermalState: this.#thermalState,
      primaryDynamic: this.#primaryDynamic,
      staticContext: this.#staticContext,
      scopes: Object.freeze([...this.#scopes.values()].map((scope) => scope.snapshot())),
    });
  }

  #requireScope(id) {
    if (!this.#scopes.has(id)) throw new Error(`unknown resource scope: ${id}`);
  }

  #emit(type) {
    const detail = this.snapshot();
    for (const listener of this.#listeners) listener({ type, detail });
  }
}

export function thermalBudget(state) {
  switch (state) {
    case THERMAL_STATE.NORMAL:
      return Object.freeze({ fps: 30, dynamicEngines: 1, allowHeavy: true, particleScale: 1, volumeScale: 1, shadowScale: 1 });
    case THERMAL_STATE.BALANCED:
      return Object.freeze({ fps: 28, dynamicEngines: 1, allowHeavy: true, particleScale: 0.65, volumeScale: 0.6, shadowScale: 0.6 });
    case THERMAL_STATE.ECO:
      return Object.freeze({ fps: 24, dynamicEngines: 1, allowHeavy: false, particleScale: 0.3, volumeScale: 0, shadowScale: 0.2 });
    case THERMAL_STATE.SAFE:
      return Object.freeze({ fps: 0, dynamicEngines: 0, allowHeavy: false, particleScale: 0, volumeScale: 0, shadowScale: 0 });
    default:
      throw new TypeError(`invalid thermal state: ${state}`);
  }
}
