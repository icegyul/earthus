export class GenerationGuard {
  #generation = 0;
  next(){this.#generation += 1; return this.#generation;}
  current(){return this.#generation;}
  isCurrent(value){return value === this.#generation;}
  assertCurrent(value){if(!this.isCurrent(value)) throw new Error(`stale scene generation: ${value}`);}
}
