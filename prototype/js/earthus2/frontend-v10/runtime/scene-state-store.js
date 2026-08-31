export function createInitialSceneState() {
  return Object.freeze({version:0, menu:'EARTH', scene:'LAND', primary:null, secondary:null, event:null, safety:true, panel:'EARTH', cesiumSuspended:false, focus:null, pinnedTime:null, transition:'IDLE'});
}
export class SceneStateStore {
  #state;
  constructor(initial=createInitialSceneState()){this.#state=initial;}
  snapshot(){return this.#state;}
  commit(recipe){this.#state=Object.freeze({...this.#state, ...recipe, version:this.#state.version+1, transition:'IDLE'});return this.#state;}
  markTransition(status){this.#state=Object.freeze({...this.#state, transition:status});return this.#state;}
}
