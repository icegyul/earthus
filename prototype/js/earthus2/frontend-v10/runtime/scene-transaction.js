export class SceneTransactionCoordinator {
  #runtime; #store; #guard;
  constructor({runtime, store, guard}) { if(!runtime||!store||!guard) throw new TypeError('runtime/store/guard required'); this.#runtime=runtime; this.#store=store; this.#guard=guard; }
  async apply(recipe) {
    const current = this.#store.snapshot();
    if (sameRecipe(current, recipe)) return Object.freeze({state:current, generation:this.#guard.current(), idempotent:true});
    const generation = this.#guard.next();
    this.#store.markTransition('PREPARING');
    const suspended = await this.#runtime.suspendConflicts(current, recipe, {generation});
    try {
      await this.#runtime.prepare(recipe, {generation});
      this.#guard.assertCurrent(generation);
      await this.#runtime.commit(recipe, {generation});
      this.#guard.assertCurrent(generation);
      const state = this.#store.commit(recipe);
      await this.#runtime.disposeObsolete(current, recipe, {generation});
      return Object.freeze({state, generation, idempotent:false});
    } catch (error) {
      await this.#runtime.rollback(suspended, current, {generation, error});
      this.#store.commit(current);
      throw error;
    }
  }
}
function sameRecipe(state, recipe){return ['menu','scene','primary','secondary','event','panel','cesiumSuspended'].every(k=>state[k]===recipe[k]) && JSON.stringify(state.focus??null)===JSON.stringify(recipe.focus??null) && (state.pinnedTime??null)===(recipe.pinnedTime??null);}
