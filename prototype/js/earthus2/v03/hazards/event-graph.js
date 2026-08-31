export class HazardEventGraph {
  #nodes=new Map(); #edges=[];
  addEvent(e){if(!e?.eventId||!e?.type) throw new TypeError('eventId/type required'); this.#nodes.set(e.eventId,structuredClone(e)); return this;}
  link(a,b,{relation='RELATED',confidence=0.5,evidence=[]}={}){if(!this.#nodes.has(a)||!this.#nodes.has(b)) throw new Error('unknown event'); this.#edges.push({from:a,to:b,relation,confidence,evidence:[...evidence]}); return this;}
  snapshot(){return {nodes:[...this.#nodes.values()].map(structuredClone),edges:structuredClone(this.#edges)};}
}
export function canAutoRelate(a,b,{maxHours=24,maxKm=300}={}){ if(!a?.at||!b?.at||!Number.isFinite(a.distanceKmToB)) return false; return Math.abs(Date.parse(a.at)-Date.parse(b.at))<=maxHours*3600000&&a.distanceKmToB<=maxKm; }
