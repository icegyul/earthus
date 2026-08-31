export class PlanetStateGraph {
  #nodes=new Map(); #edges=[];
  addSignal(signal){if(!signal?.id||!signal?.domain) throw new TypeError('id/domain required');this.#nodes.set(signal.id,structuredClone(signal));return this;}
  relate(from,to,{type='CORRELATED_WITH',weight=1,evidence=[]}={}){if(!this.#nodes.has(from)||!this.#nodes.has(to))throw new Error('unknown node');this.#edges.push({from,to,type,weight,evidence:[...evidence]});return this;}
  queryByDomain(domain){return [...this.#nodes.values()].filter(n=>n.domain===domain).map(structuredClone);}
  snapshot(){return {nodes:[...this.#nodes.values()].map(structuredClone),edges:structuredClone(this.#edges)};}
}
