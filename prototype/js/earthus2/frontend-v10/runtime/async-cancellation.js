export class SceneAbortRegistry {
  #controllers = new Map();
  create(ownerId){const c=new AbortController(); const list=this.#controllers.get(ownerId)??[]; list.push(c);this.#controllers.set(ownerId,list);return c;}
  abortOwner(ownerId, reason='scene-exit'){const list=this.#controllers.get(ownerId)??[];this.#controllers.delete(ownerId);for(const c of list) if(!c.signal.aborted)c.abort(reason);return list.length;}
  count(ownerId){return (this.#controllers.get(ownerId)??[]).length;}
}
