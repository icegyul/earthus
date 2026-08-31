function clone(v){ return structuredClone(v); }
function validGeom(g){ return g && ['Polygon','MultiPolygon'].includes(g.type) && Array.isArray(g.coordinates); }
export class EarthusSpatialCellRegistry {
  #cells = new Map(); #external = new Map();
  registerCell(cell) {
    if (!cell?.cellId || !validGeom(cell.geometry)) throw new TypeError('cellId and Polygon/MultiPolygon geometry required');
    if (!Number.isFinite(cell.areaM2) || cell.areaM2 <= 0) throw new RangeError('areaM2 must be positive');
    if (this.#cells.has(cell.cellId)) throw new Error(`duplicate cellId: ${cell.cellId}`);
    const saved = Object.freeze({ ...clone(cell), poiIds: Object.freeze([...(cell.poiIds ?? [])]), roadSegmentIds: Object.freeze([...(cell.roadSegmentIds ?? [])]), transitNodeIds: Object.freeze([...(cell.transitNodeIds ?? [])]) });
    this.#cells.set(saved.cellId, saved); return clone(saved);
  }
  mapExternal({ provider, service, externalId, cellId, mappingQuality = null, mappingVersion = 'v1' }) {
    if (!this.#cells.has(cellId)) throw new Error(`unknown cellId: ${cellId}`);
    if (![provider,service,externalId].every(v => typeof v === 'string' && v.trim())) throw new TypeError('provider/service/externalId required');
    const key = `${provider}|${service}|${externalId}`;
    const row = Object.freeze({ provider, service, externalId, cellId, mappingQuality: Number.isFinite(mappingQuality) ? Math.max(0,Math.min(1,mappingQuality)) : null, mappingVersion });
    this.#external.set(key,row); return clone(row);
  }
  get(cellId){ return this.#cells.has(cellId) ? clone(this.#cells.get(cellId)) : null; }
  resolveExternal(provider,service,externalId){ const r=this.#external.get(`${provider}|${service}|${externalId}`); return r?clone(r):null; }
  list(){ return [...this.#cells.values()].map(clone); }
}
