export function compareNormalized(items,{requireSameUnit=true,requireSameVariable=true}={}){
  if(!Array.isArray(items)||items.length<2) throw new TypeError('at least two items required');
  const variables=new Set(items.map(i=>i.variable)); const units=new Set(items.map(i=>i.unit));
  if(requireSameVariable&&variables.size>1) return Object.freeze({state:'BLOCKED',reason:'VARIABLE_MISMATCH'});
  if(requireSameUnit&&units.size>1) return Object.freeze({state:'BLOCKED',reason:'UNIT_MISMATCH'});
  const resolutions=items.map(i=>i.spatialResolutionM).filter(Number.isFinite); const vals=items.map(i=>i.value).filter(Number.isFinite);
  if(vals.length!==items.length) return Object.freeze({state:'BLOCKED',reason:'MISSING_VALUE'});
  const min=Math.min(...vals),max=Math.max(...vals); return Object.freeze({state:'COMPARABLE',items:Object.freeze(structuredClone(items)),range:max-min,resolutionMismatch:resolutions.length>1&&Math.max(...resolutions)/Math.max(1,Math.min(...resolutions))>4});
}
