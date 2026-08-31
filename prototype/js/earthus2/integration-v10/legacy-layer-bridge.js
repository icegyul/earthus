import { getFeature } from './feature-registry.js';

// Owns only layers activated through Earthus 2.0. It never mass-resets the 1.0 store and
// therefore does not silently disable unrelated official safety layers or another actor's work.
export class LegacyLayerBridge {
  #store;
  #slots = new Map();
  #owned = new Map();
  constructor({store}) {
    if (!store || typeof store.setLayer !== 'function' || !store.layers) throw new TypeError('legacy Earthus store is required');
    this.#store = store;
  }

  available(featureId) {
    const def = getFeature(featureId);
    return def.legacyLayerIds.every(id => Object.prototype.hasOwnProperty.call(this.#store.layers, id));
  }

  snapshot() {
    return Object.freeze({
      slots: Object.fromEntries([...this.#slots.entries()].map(([slot, value]) => [slot, value.featureId])),
      ownedLayers: [...this.#owned.keys()].sort(),
    });
  }

  async activate(featureId, {slot='PRIMARY'}={}) {
    const def = getFeature(featureId);
    const previous = this.#slots.get(slot) ?? null;
    if (previous?.featureId === featureId) return Object.freeze({featureId, slot, idempotent:true, active:[...def.legacyLayerIds]});

    if (def.legacyLayerIds.length === 0) {
      await this.deactivateSlot(slot);
      this.#slots.set(slot, {featureId, layers:[]});
      return Object.freeze({featureId, slot, idempotent:false, active:[], bridge:'ORCHESTRATOR_ONLY'});
    }

    const missing = def.legacyLayerIds.filter(id => !Object.prototype.hasOwnProperty.call(this.#store.layers, id));
    if (missing.length) throw new Error(`legacy layer missing for ${featureId}: ${missing.join(', ')}`);

    const rollback = new Map(def.legacyLayerIds.map(id => [id, !!this.#store.layers[id]]));
    try {
      await this.deactivateSlot(slot);
      for (const id of def.legacyLayerIds) {
        this.#store.setLayer(id, true);
        this.#owned.set(id, {featureId, slot});
        if (this.#store.layers[id] !== true) throw new Error(`legacy store refused layer activation: ${id}`);
      }
      this.#slots.set(slot, {featureId, layers:[...def.legacyLayerIds]});
      return Object.freeze({featureId, slot, idempotent:false, active:[...def.legacyLayerIds]});
    } catch (error) {
      for (const [id, wasOn] of rollback) {
        try { this.#store.setLayer(id, wasOn); } catch (_) { /* fail closed; caller reports */ }
        if (!wasOn) this.#owned.delete(id);
      }
      if (previous) this.#slots.set(slot, previous); else this.#slots.delete(slot);
      throw error;
    }
  }

  async deactivateSlot(slot) {
    const current = this.#slots.get(slot);
    if (!current) return Object.freeze({slot, disposed:0});
    let disposed = 0;
    for (const id of current.layers) {
      const owner = this.#owned.get(id);
      if (!owner || owner.slot !== slot) continue;
      if (this.#store.layers[id] === true) this.#store.setLayer(id, false);
      this.#owned.delete(id);
      disposed += 1;
    }
    this.#slots.delete(slot);
    return Object.freeze({slot, disposed});
  }

  async deactivateAll() {
    const slots = [...this.#slots.keys()];
    let disposed = 0;
    for (const slot of slots) disposed += (await this.deactivateSlot(slot)).disposed;
    return Object.freeze({disposed});
  }
}
