const SAFE_KEYS=new Set(['event','at','surface','layerId','scene','plan','countryId','result','latencyMs','engineId','reasonCode']);
export function sanitizeTelemetry(input){const out={};for(const [k,v] of Object.entries(input??{}))if(SAFE_KEYS.has(k))out[k]=v;out.at=out.at??new Date().toISOString();return out;}
export function aggregateCounts(events,key='event'){const m=new Map();for(const e of events??[]){const k=e?.[key]??'UNKNOWN';m.set(k,(m.get(k)??0)+1);}return Object.fromEntries(m);}
