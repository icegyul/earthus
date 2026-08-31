export class FreshnessSloRegistry {
  #rules = new Map();
  register(id,{liveSec,staleSec}){ if(!id||![liveSec,staleSec].every(Number.isFinite)||liveSec<0||staleSec<liveSec) throw new TypeError('valid SLO required'); this.#rules.set(id,{liveSec,staleSec}); }
  evaluate(id,referenceAt,nowAt=new Date().toISOString()){
    const r=this.#rules.get(id); if(!r) return Object.freeze({state:'UNKNOWN_RULE',id});
    const a=Date.parse(referenceAt), n=Date.parse(nowAt); if(!Number.isFinite(a)||!Number.isFinite(n)) return Object.freeze({state:'UNAVAILABLE',ageSec:null});
    const ageSec=Math.max(0,(n-a)/1000); const state=ageSec<=r.liveSec?'LIVE':ageSec<=r.staleSec?'STALE':'UNAVAILABLE';
    return Object.freeze({state,ageSec,...r});
  }
}
