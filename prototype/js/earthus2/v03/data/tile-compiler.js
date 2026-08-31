function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
export function quantizeScalar(values,{bits=16,min=null,max=null}={}){
  if(!Array.isArray(values)||!values.length) throw new TypeError('values required');
  const finite=values.filter(Number.isFinite); if(!finite.length) return {bits,min:null,max:null,nodata:0,values:values.map(()=>0)};
  const lo=Number.isFinite(min)?min:Math.min(...finite), hi=Number.isFinite(max)?max:Math.max(...finite); const levels=(2**bits)-2;
  const out=values.map(v=>!Number.isFinite(v)?0:1+Math.round(clamp((v-lo)/Math.max(1e-12,hi-lo),0,1)*levels));
  return {bits,min:lo,max:hi,nodata:0,values:out};
}
export function dequantizeScalar(pack){ const levels=(2**pack.bits)-2; return pack.values.map(q=>q===pack.nodata?null:pack.min+((q-1)/levels)*(pack.max-pack.min)); }
export function compileTileManifest({datasetId,validAt,lod,bounds,width,height,encoding='Q16'}){
  if(!datasetId||!validAt) throw new TypeError('datasetId and validAt required');
  return Object.freeze({schemaVersion:'earthus.tile.v1',datasetId,validAt,lod,bounds,width,height,encoding});
}
