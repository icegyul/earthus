import { EarthusAppIntegrationV35 } from '../../07_APP_INTEGRATION_V35/core/APP_INTEGRATION_V35.mjs';

export const DOCKS=['earth','weather','satellite','ocean','air','disaster','local'];
export const PANEL_BY_DOCK={earth:['world','city','time','day-night'],weather:['current','forecast','hourly','region'],satellite:['clouds','radar','infrared','time-playback'],ocean:['wave','water-temp','wind','currents'],air:['pm10','pm2.5','uv','pressure'],disaster:['alerts','typhoon','earthquake','wildfire'],local:['nearby','korea','travel','content']};

export class EarthusUIAdapterV36 {
  constructor(opts={}) { this.app=new EarthusAppIntegrationV35(opts); this.ui={panel:null,selectedPoi:null,mode:'PARKED'}; }
  openDock(dock){ if(!DOCKS.includes(dock)) throw new Error('invalid dock'); this.ui.panel=this.ui.panel===dock?null:dock; this.app.setMapState({dock}); return this.view(); }
  closePanel(){this.ui.panel=null; return this.view();}
  async selectPoi(poi,env={}){ const card=await this.app.selectPoi(poi,env); if(!card?.stale) this.ui.selectedPoi=card; return card; }
  setDrivingStateProvider(fn){this.app.drivingStateProvider=fn; this.ui.mode=this.app.getDrivingState();}
  action(feature){ return {feature,allowed:this.app.actionAllowed(feature)}; }
  view(){return {dock:this.app.state.dock,panel:this.ui.panel,menu:this.ui.panel?PANEL_BY_DOCK[this.ui.panel]:[],selectedPoiId:this.app.state.selectedPoiId,mapBbox:this.app.state.bbox,layers:[...this.app.state.layers]};}
}
