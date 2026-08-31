export class ResourceOwnershipRegistry {
  #owners = new Map();
  register(ownerId, disposer) {
    if (!ownerId) throw new TypeError('ownerId is required');
    if (typeof disposer !== 'function') throw new TypeError('disposer must be a function');
    const list = this.#owners.get(ownerId) ?? [];
    list.push(disposer); this.#owners.set(ownerId, list);
    return disposer;
  }
  count(ownerId){return (this.#owners.get(ownerId) ?? []).length;}
  total(){return [...this.#owners.values()].reduce((n,list)=>n+list.length,0);}
  async disposeOwner(ownerId){
    const list = this.#owners.get(ownerId) ?? [];
    this.#owners.delete(ownerId);
    const errors=[];
    for (const dispose of [...list].reverse()) { try { await dispose(); } catch (e) { errors.push(e); } }
    return Object.freeze({disposed:list.length, errors});
  }
}
