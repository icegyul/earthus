import { resolveSceneRecipe } from './scene-recipe-resolver.js';
export class MenuController {
  #tx; #env;
  constructor({transaction, environment=()=>({})}){this.#tx=transaction;this.#env=environment;}
  async select(menu){return this.#tx.apply(resolveSceneRecipe({type:'TOP_MENU_SELECT',menu}, this.#env()));}
  async openPulseEvent(event){return this.#tx.apply(resolveSceneRecipe({type:'PULSE_EVENT_OPEN',...event}, this.#env()));}
  async openApprovedContext(primary, context){return this.#tx.apply(resolveSceneRecipe({type:'DOMAIN_CONTEXT_OPEN',primary,context}, this.#env()));}
}
