const RENDERERS = new Set(['RELIEF','FLOW','FIELD','VOLUME','EVENT','ORBIT','STORY']);
const DOMAINS = new Set(['WEATHER','AIR','OCEAN','HUMAN_CITY','OBSERVATION','ECOLOGY','HAZARD','ORBIT','STORY']);
export class VisualLayerRegistry {
  #layers = new Map();
  register(descriptor) {
    if (!descriptor?.layerId) throw new TypeError('layerId is required');
    if (this.#layers.has(descriptor.layerId)) throw new Error(`layer already registered: ${descriptor.layerId}`);
    if (!RENDERERS.has(descriptor.renderer)) throw new TypeError(`unknown renderer: ${descriptor.renderer}`);
    if (!DOMAINS.has(descriptor.domain)) throw new TypeError(`unknown domain: ${descriptor.domain}`);
    if (!Array.isArray(descriptor.truthClasses) || descriptor.truthClasses.length === 0) throw new TypeError('truthClasses are required');
    if (!Array.isArray(descriptor.qualityProfiles) || descriptor.qualityProfiles.length === 0) throw new TypeError('qualityProfiles are required');
    const saved = structuredClone(descriptor); this.#layers.set(saved.layerId, saved); return structuredClone(saved);
  }
  get(layerId) { return this.#layers.has(layerId) ? structuredClone(this.#layers.get(layerId)) : null; }
  list({ domain = null, renderer = null } = {}) { return [...this.#layers.values()].filter(item => (!domain || item.domain === domain) && (!renderer || item.renderer === renderer)).map(item => structuredClone(item)); }
}
