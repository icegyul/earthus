import { getFeature } from './feature-registry.js';

export class EarthusV2AppController {
  #menu; #bridge; #featureState; #sceneState; #evidence;
  constructor({menuController, bridge=null, featureState, sceneState, evidence}) {
    this.#menu=menuController; this.#bridge=bridge; this.#featureState=featureState; this.#sceneState=sceneState; this.#evidence=evidence;
  }
  snapshot(){return Object.freeze({scene:this.#sceneState.snapshot(), features:this.#featureState.snapshot(), bridge:this.#bridge?.snapshot?.() ?? null});}

  async selectMenu(menu) {
    this.#featureState.mark('CLEARING');
    if (this.#bridge) await this.#bridge.deactivateAll();
    this.#featureState.clear();
    const result = await this.#menu.select(menu);
    this.#evidence?.record('menu.selected',{menu,generation:result.generation});
    return this.snapshot();
  }

  async selectFeature(featureId) {
    const def=getFeature(featureId);
    const current=this.#sceneState.snapshot();
    if(current.menu!==def.menu) await this.selectMenu(def.menu);
    this.#featureState.mark('PREPARING');
    try {
      const bridgeResult=this.#bridge ? await this.#bridge.activate(featureId,{slot:'PRIMARY'}) : {bridge:'NO_LEGACY_STORE'};
      this.#featureState.commit({primary:featureId,secondary:null});
      this.#evidence?.record('feature.selected',{featureId,bridge:bridgeResult.bridge ?? 'LEGACY_LAYER'});
      return this.snapshot();
    } catch(error){this.#featureState.fail(error);this.#evidence?.record('feature.error',{featureId,message:error.message});throw error;}
  }

  async openContext(featureId) {
    const def=getFeature(featureId);
    const scene=this.#sceneState.snapshot();
    if(!scene.primary) throw new Error('primary domain is required before context');
    await this.#menu.openApprovedContext(scene.primary, def.menu);
    try {
      const bridgeResult=this.#bridge ? await this.#bridge.activate(featureId,{slot:'SECONDARY'}) : {bridge:'NO_LEGACY_STORE'};
      this.#featureState.commit({secondary:featureId});
      this.#evidence?.record('context.selected',{featureId});
      return Object.freeze({state:this.snapshot(),bridgeResult});
    } catch(error){this.#featureState.fail(error);throw error;}
  }
}
