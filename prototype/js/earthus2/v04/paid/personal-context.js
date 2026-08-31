const ALLOWED = new Set(['savedPlaceIds','tripWindows','activityTypes','routeIds','preferences','locale','timezone']);
export function minimizePersonalContext(input,{consent=false}={}){
  if(!consent) return Object.freeze({state:'NO_CONSENT',context:Object.freeze({})});
  const out={}; for(const [k,v] of Object.entries(input??{})) if(ALLOWED.has(k)) out[k]=structuredClone(v);
  return Object.freeze({state:'CONSENTED_MINIMAL',context:Object.freeze(out),droppedKeys:Object.freeze(Object.keys(input??{}).filter(k=>!ALLOWED.has(k)))});
}
