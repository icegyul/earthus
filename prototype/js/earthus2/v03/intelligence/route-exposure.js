export function integrateRouteExposure(segments,{officialGateTypes=[]}={}){
  const valid=(segments??[]).filter(s=>Number.isFinite(s.lengthKm)); const gates=valid.flatMap(s=>s.officialGates??[]).filter(g=>officialGateTypes.length===0||officialGateTypes.includes(g.type)); if(gates.length)return{state:'BLOCKED_OR_CAUTION',officialGates:gates,score:null};
  let weighted=0,total=0;for(const s of valid){const intensity=Number.isFinite(s.intensity)?Math.max(0,s.intensity):0;weighted+=intensity*s.lengthKm;total+=s.lengthKm;}return{state:'DERIVED',score:total?weighted/total:null,totalKm:total};
}
