const TYPES = new Set(['AREA','GATE','ROAD','WALKWAY','STAIR','STATION','SAFE_ZONE']);
export class SpatialDigitalTwin {
  #entities = new Map();
  add(entity){
    if (!entity?.id || !TYPES.has(entity.type) || !entity.geometry) throw new TypeError('valid twin entity required');
    if (Number.isFinite(entity.nominalCapacity) && !entity.capacityProvenance) throw new Error('capacity provenance required');
    const saved = Object.freeze({ ...structuredClone(entity), nominalCapacity: Number.isFinite(entity.nominalCapacity) ? entity.nominalCapacity : null, operationalStatus: entity.operationalStatus ?? 'UNKNOWN' });
    this.#entities.set(saved.id,saved); return structuredClone(saved);
  }
  get(id){ const v=this.#entities.get(id); return v?structuredClone(v):null; }
  setOperationalStatus(id,status){ const v=this.#entities.get(id); if(!v) throw new Error(`unknown entity: ${id}`); const next=Object.freeze({...structuredClone(v),operationalStatus:status}); this.#entities.set(id,next); return structuredClone(next); }
  listByType(type){ return [...this.#entities.values()].filter(x=>x.type===type).map(x=>structuredClone(x)); }
}
