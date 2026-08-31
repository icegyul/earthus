export class FeatureStateStore {
  #state = Object.freeze({version:0, primary:null, secondary:null, status:'IDLE', lastError:null});
  snapshot(){ return this.#state; }
  commit(next){ this.#state = Object.freeze({...this.#state, ...next, version:this.#state.version+1, status:'IDLE', lastError:null}); return this.#state; }
  mark(status){ this.#state = Object.freeze({...this.#state, status}); return this.#state; }
  fail(error){ this.#state = Object.freeze({...this.#state, status:'ERROR', lastError:String(error?.message ?? error)}); return this.#state; }
  clear(){ return this.commit({primary:null, secondary:null}); }
}
