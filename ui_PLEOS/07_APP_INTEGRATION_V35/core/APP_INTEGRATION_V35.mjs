import { queryViewport } from '../../06_BUNDLED_DATA_PACKAGE/renderer_v28/POI_RENDERER_V28.mjs';
import { buildPlaceCard } from '../../06_BUNDLED_DATA_PACKAGE/place_card_v29/PLACE_CARD_V29.mjs';
import { safetyDecision, STATES } from '../../06_BUNDLED_DATA_PACKAGE/pleos_safety_v33/PLEOS_SAFETY_GATE_V33.mjs';

export class EarthusAppIntegrationV35 {
  constructor({poiMaster, spatialIndex, repository, drivingStateProvider} = {}) {
    this.poiMaster = poiMaster || [];
    this.spatialIndex = spatialIndex || {};
    this.repository = repository || { getEnvironment: async () => ({}) };
    this.drivingStateProvider = drivingStateProvider || (() => STATES.UNKNOWN);
    this.state = { bbox:null, selectedPoiId:null, dock:null, layers:[], environment:{} };
    this.seq = 0;
  }

  setMapState({bbox, dock, layers}={}) {
    if (bbox) this.state.bbox = bbox;
    if (dock !== undefined) this.state.dock = dock;
    if (layers) this.state.layers = [...layers];
    return {...this.state};
  }

  getDrivingState() { return this.drivingStateProvider(); }

  async queryLocalPois({bbox, categories, limit=200}={}) {
    const decision = safetyDecision({drivingState:this.getDrivingState(), feature:'local_discovery'});
    if (decision.action === 'BLOCK') return {items:[], blocked:true, reason:decision.reason};
    const result = queryViewport({poiMaster:this.poiMaster, spatialIndex:this.spatialIndex, bbox, categories, limit});
    return {...result, blocked:false};
  }

  async selectPoi(poi, environment={}) {
    const id = poi?.canonicalId || poi?.id;
    if (!id) throw new Error('POI id required');
    this.state.selectedPoiId = id;
    const seq = ++this.seq;
    const live = await this.repository.getEnvironment({poi, signal:{seq}});
    if (seq !== this.seq) return {stale:true};
    this.state.environment = {...environment, ...live};
    return buildPlaceCard(poi, this.state.environment);
  }

  actionAllowed(feature) {
    return safetyDecision({drivingState:this.getDrivingState(), feature}).action === 'ALLOW';
  }

  clearEnvironmentLayers() { this.state.layers = this.state.layers.filter(x => !['weather','satellite','ocean','air','disaster'].includes(x)); return [...this.state.layers]; }
  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
}
