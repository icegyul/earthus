/**
 * Minimal pub/sub application state for the explore experience.
 */

const listeners = new Map();

export const store = {
  lod: "global",
  coverage: null,
  catalog: [],
  filtered: [],
  selectedId: null,
  selectedEntry: null,
  ephemeris: null,
  ephemerisObjectRef: null,
  timeIndex: 0,
  conjunctions: null,
  benefit: { __state: "idle" },
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  overlay: { kind: "loading" },
  lastSnapshotAt: null,
};

export function subscribe(key, handler) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(handler);
  return () => listeners.get(key).delete(handler);
}

export function set(patch) {
  Object.assign(store, patch);
  for (const key of Object.keys(patch)) {
    const handlers = listeners.get(key);
    if (handlers) for (const handler of handlers) handler(store[key], store);
  }
  document.dispatchEvent(new CustomEvent("aetherus:state", { detail: { keys: Object.keys(patch) } }));
}

export function select(entry) {
  set({
    selectedId: entry ? entry.object_id : null,
    selectedEntry: entry,
    ephemeris: null,
    ephemerisObjectRef: null,
    timeIndex: 0,
    conjunctions: null,
    benefit: { __state: "idle" },
  });
}

export function visibleEntries() {
  return store.filtered.length ? store.filtered : store.catalog;
}
