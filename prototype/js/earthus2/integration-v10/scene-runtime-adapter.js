// Adapts the pure Frontend Foundation transaction contract to the existing Earthus scene/store.
// It deliberately does not create a second Cesium.Viewer.
export class EarthusSceneRuntimeAdapter {
  #legacyStore;
  #viewer;
  #lastScene = 'earth';
  constructor({legacyStore=null, viewer=null}={}) { this.#legacyStore=legacyStore; this.#viewer=viewer; }

  async suspendConflicts(current, recipe) {
    return Object.freeze({scene:this.#legacyStore?.scene ?? this.#lastScene, cesiumSuspended:!!current?.cesiumSuspended});
  }

  async prepare(recipe) {
    if (!recipe?.menu || !recipe?.scene) throw new TypeError('resolved scene recipe required');
    if (recipe.cesiumSuspended && recipe.primary !== 'SPACE') throw new Error('only SPACE may suspend Cesium');
    return true;
  }

  async commit(recipe) {
    // The existing 1.0 scene manager subscribes to store scene changes in the full app.
    // In isolated /v2 preview this remains a truthful state transition even when AETHERUS
    // modules are not mounted. Do not synthesize a fake space scene.
    const target = recipe.primary === 'SPACE' ? 'space' : 'earth';
    this.#lastScene = target;
    if (this.#legacyStore?.setScene) this.#legacyStore.setScene(target, target);
    if (this.#viewer?.scene?.requestRender) this.#viewer.scene.requestRender();
  }

  async disposeObsolete(_current, recipe) {
    if (recipe.primary !== 'SPACE' && this.#viewer?.scene?.requestRender) this.#viewer.scene.requestRender();
  }

  async rollback(suspended) {
    const target = suspended?.scene === 'space' ? 'space' : 'earth';
    this.#lastScene = target;
    if (this.#legacyStore?.setScene) this.#legacyStore.setScene(target, target);
    if (this.#viewer?.scene?.requestRender) this.#viewer.scene.requestRender();
  }
}
