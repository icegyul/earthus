import { stableId, isoOrNull } from '../core/contracts.js';
const REL=new Set(['RELATED_TO','PRECEDES','RESPONDS_TO','IMPACTS','PARENT_OF','SAME_EVENT_AS']);
export class EarthEventGraph {
  #events=new Map();#relations=[];
  upsert(input={}){if(!input.eventType)throw new TypeError('eventType required');const id=input.eventId||stableId([input.eventType,input.region,input.startedAt,input.title]);const before=this.#events.get(id)||{};const next=Object.freeze({...before,...structuredClone(input),eventId:id,startedAt:isoOrNull(input.startedAt)||before.startedAt||null,updatedAt:new Date().toISOString()});this.#events.set(id,next);return structuredClone(next);}
  relate(from,to,type,metadata={}){if(!this.#events.has(from)||!this.#events.has(to))throw new Error('event endpoints must exist');if(!REL.has(type))throw new TypeError('unsupported relation');const row=Object.freeze({from,to,type,metadata:structuredClone(metadata)});this.#relations.push(row);return structuredClone(row);}
  get(id){const v=this.#events.get(id);return v?structuredClone(v):null;} snapshot(){return{events:[...this.#events.values()].map(structuredClone),relations:this.#relations.map(structuredClone)};}
}
