export function newTraceId(prefix='etr'){const uuid=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;return `${prefix}-${uuid}`;}
export function childTrace(parentTraceId,span){if(!parentTraceId)throw new Error('PARENT_TRACE_REQUIRED');return {traceId:parentTraceId,spanId:`${String(span||'span')}-${Math.random().toString(16).slice(2,10)}`};}
function sanitize(v,key=''){
  if(/secret|token|authorization|api.?key|service.?key/i.test(key)) return '[REDACTED]'; if(v==null||typeof v==='number'||typeof v==='boolean')return v; if(typeof v==='string')return v.length>1000?v.slice(0,1000)+'…':v; if(Array.isArray(v))return v.slice(0,50).map(x=>sanitize(x)); if(typeof v==='object'){const out={};for(const [k,val] of Object.entries(v))out[k]=sanitize(val,k);return out;} return String(v);
}
export function structuredLog(level,event,fields={}){return {ts:new Date().toISOString(),level:String(level||'INFO').toUpperCase(),event:String(event||'unknown'),...sanitize(fields)};}
