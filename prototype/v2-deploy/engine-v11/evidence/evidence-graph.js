import { isoOrNull, requireEvidenceKind, stableId } from '../core/contracts.js';
const RELATIONS=new Set(['OBSERVATION_OF','REPORTED_BY','OFFICIAL_NOTICE_OF','ACTION_RESPONDS_TO','DERIVED_FROM','SUPPORTS','CONTRADICTS','CALIBRATES','HISTORICAL_ANALOG_OF']);
export class EvidenceGraph {
  #nodes=new Map(); #edges=[];
  addNode(input={}) {
    const kind=requireEvidenceKind(input.evidenceKind); if(!kind||!input.sourceId) throw new TypeError('evidenceKind and sourceId are required');
    const node=Object.freeze({id:input.id||stableId([input.sourceId,input.externalId,input.observedAt,input.title]),evidenceKind:kind,sourceId:String(input.sourceId),externalId:input.externalId||null,title:input.title||null,observedAt:isoOrNull(input.observedAt),url:input.url||null,payload:structuredClone(input.payload||{})});
    this.#nodes.set(node.id,node); return structuredClone(node);
  }
  addEdge(from,to,relation,metadata={}) { if(!this.#nodes.has(from)||!this.#nodes.has(to)) throw new Error('edge endpoints must exist'); if(!RELATIONS.has(relation)) throw new TypeError('unsupported relation'); const edge=Object.freeze({from,to,relation,metadata:structuredClone(metadata)}); this.#edges.push(edge); return structuredClone(edge); }
  trace(id,{maxDepth=6}={}){const seen=new Set([id]),queue=[{id,depth:0}],nodes=[],edges=[];while(queue.length){const cur=queue.shift();const n=this.#nodes.get(cur.id);if(n)nodes.push(structuredClone(n));if(cur.depth>=maxDepth)continue;for(const e of this.#edges){if(e.from===cur.id||e.to===cur.id){edges.push(structuredClone(e));const next=e.from===cur.id?e.to:e.from;if(!seen.has(next)){seen.add(next);queue.push({id:next,depth:cur.depth+1});}}}}return{nodes,edges};}
  snapshot(){return{nodes:[...this.#nodes.values()].map(structuredClone),edges:this.#edges.map(structuredClone)};}
}
