import { ENGINE_CLASS, ENGINE_LIFECYCLE, THERMAL_STATE } from './constants.js';
import { EngineResourceGovernor } from './resource-governor.js';

const REQUIRED_METHODS = ['mount', 'setManifest', 'setData', 'setTime', 'setFocus', 'setQuality', 'setVisibility', 'measure', 'dispose'];
const ENGINE_CLASSES = new Set(Object.values(ENGINE_CLASS));

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('engine adapter is required');
  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`engine adapter is missing ${method}()`);
  }
}

export class EarthusEngineRuntime {
  #engines = new Map();
  #governor;

  constructor({ governor = new EngineResourceGovernor() } = {}) {
    this.#governor = governor;
  }

  get governor() { return this.#governor; }

  register({ id, engineClass, adapter }) {
    if (typeof id !== 'string' || !id.trim()) throw new TypeError('engine id is required');
    if (!ENGINE_CLASSES.has(engineClass)) throw new TypeError(`invalid engine class: ${engineClass}`);
    if (this.#engines.has(id)) throw new Error(`engine already registered: ${id}`);
    validateAdapter(adapter);
    const scope = this.#governor.createScope(id);
    this.#engines.set(id, { id, engineClass, adapter, scope, lifecycle: ENGINE_LIFECYCLE.REGISTERED, error: null });
  }

  async mount(id, context) {
    const entry = this.#require(id);
    if (![ENGINE_LIFECYCLE.REGISTERED, ENGINE_LIFECYCLE.SUSPENDED].includes(entry.lifecycle)) {
      throw new Error(`engine cannot mount from ${entry.lifecycle}`);
    }
    entry.lifecycle = ENGINE_LIFECYCLE.MOUNTING;
    try {
      await entry.adapter.mount({ ...context, resourceScope: entry.scope });
      entry.lifecycle = ENGINE_LIFECYCLE.READY;
      return this.snapshot(id);
    } catch (error) {
      entry.lifecycle = ENGINE_LIFECYCLE.ERROR;
      entry.error = String(error?.message ?? error);
      throw error;
    }
  }

  activate(id) {
    const entry = this.#require(id);
    if (![ENGINE_LIFECYCLE.READY, ENGINE_LIFECYCLE.SUSPENDED, ENGINE_LIFECYCLE.ACTIVE].includes(entry.lifecycle)) {
      throw new Error(`engine cannot activate from ${entry.lifecycle}`);
    }
    if (entry.engineClass === ENGINE_CLASS.DYNAMIC) this.#governor.activatePrimary(id);
    if (entry.engineClass === ENGINE_CLASS.STATIC_CONTEXT) this.#governor.activateStaticContext(id);
    entry.adapter.setVisibility(true);
    entry.lifecycle = ENGINE_LIFECYCLE.ACTIVE;
    return this.snapshot(id);
  }

  suspend(id) {
    const entry = this.#require(id);
    entry.adapter.setVisibility(false);
    entry.lifecycle = ENGINE_LIFECYCLE.SUSPENDED;
    return this.snapshot(id);
  }

  setManifest(id, manifest) { this.#require(id).adapter.setManifest(manifest); }
  setData(id, data) { this.#require(id).adapter.setData(data); }
  setTime(id, time) { this.#require(id).adapter.setTime(time); }
  setFocus(id, focus) { this.#require(id).adapter.setFocus(focus); }
  setQuality(id, quality) { this.#require(id).adapter.setQuality(quality); }

  setThermalState(state) {
    this.#governor.setThermalState(state);
    for (const entry of this.#engines.values()) entry.adapter.setQuality({ thermalState: state });
  }

  async dispose(id) {
    const entry = this.#engines.get(id);
    if (!entry) return null;
    entry.lifecycle = ENGINE_LIFECYCLE.DISPOSING;
    try { await entry.adapter.dispose(); } finally {
      this.#governor.disposeScope(id);
      entry.lifecycle = ENGINE_LIFECYCLE.DISPOSED;
      this.#engines.delete(id);
    }
    return Object.freeze({ id, lifecycle: ENGINE_LIFECYCLE.DISPOSED });
  }

  async disposeAll() {
    for (const id of [...this.#engines.keys()]) await this.dispose(id);
  }

  snapshot(id = null) {
    if (id) {
      const entry = this.#require(id);
      return Object.freeze({
        id: entry.id,
        engineClass: entry.engineClass,
        lifecycle: entry.lifecycle,
        error: entry.error,
        resources: entry.scope.snapshot(),
        measurement: Object.freeze(structuredClone(entry.adapter.measure() ?? {})),
      });
    }
    return Object.freeze({
      thermalState: this.#governor.snapshot().thermalState ?? THERMAL_STATE.NORMAL,
      engines: Object.freeze([...this.#engines.keys()].sort().map((engineId) => this.snapshot(engineId))),
      resources: this.#governor.snapshot(),
    });
  }

  #require(id) {
    const entry = this.#engines.get(id);
    if (!entry) throw new Error(`unknown engine: ${id}`);
    return entry;
  }
}

export function createMemoryEngineAdapter() {
  const state = {
    mounted: false,
    visible: false,
    manifest: null,
    data: null,
    time: null,
    focus: null,
    quality: null,
    disposed: false,
  };
  return {
    async mount() { state.mounted = true; },
    setManifest(value) { state.manifest = structuredClone(value); },
    setData(value) { state.data = structuredClone(value); },
    setTime(value) { state.time = structuredClone(value); },
    setFocus(value) { state.focus = structuredClone(value); },
    setQuality(value) { state.quality = structuredClone(value); },
    setVisibility(value) { state.visible = value === true; },
    measure() { return { mounted: state.mounted, visible: state.visible, disposed: state.disposed }; },
    async dispose() { state.disposed = true; state.visible = false; },
  };
}
