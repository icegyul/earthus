export function vectorFromUV(u,v){ if(!Number.isFinite(u)||!Number.isFinite(v)) return null; const speed=Math.hypot(u,v); const directionDeg=(Math.atan2(u,v)*180/Math.PI+360)%360; return {u,v,speed,directionDeg}; }
export function createOceanState(input){
  if(!input?.validAt||!input?.sourceId) throw new TypeError('validAt/sourceId required');
  const current=input.currentU!=null&&input.currentV!=null?vectorFromUV(input.currentU,input.currentV):null;
  return Object.freeze({schemaVersion:'earthus.ocean-state.v1',validAt:input.validAt,sourceId:input.sourceId,sstC:Number.isFinite(input.sstC)?input.sstC:null,current,currentScalarMs:Number.isFinite(input.currentScalarMs)?input.currentScalarMs:null,wave:input.wave??null,tide:input.tide??null,confidence:Number.isFinite(input.confidence)?Math.max(0,Math.min(1,input.confidence)):null});
}
