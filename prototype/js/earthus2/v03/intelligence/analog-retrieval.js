function z(v,mean,std){return std>0?(v-mean)/std:0;}
export function rankAnalogs(target,candidates,{features,weights={},topK=5}={}){
  if(!Array.isArray(features)||!features.length) throw new TypeError('features required');
  const stats=Object.fromEntries(features.map(f=>{const vals=[target,...candidates].map(x=>x[f]).filter(Number.isFinite);const mean=vals.reduce((s,x)=>s+x,0)/Math.max(1,vals.length);const std=Math.sqrt(vals.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,vals.length));return[f,{mean,std}];}));
  return candidates.map(c=>{let d=0,w=0;for(const f of features){if(!Number.isFinite(target[f])||!Number.isFinite(c[f]))continue;const ww=weights[f]??1;d+=ww*(z(target[f],stats[f].mean,stats[f].std)-z(c[f],stats[f].mean,stats[f].std))**2;w+=ww;}return{candidate:c,distance:w?Math.sqrt(d/w):Infinity};}).sort((a,b)=>a.distance-b.distance).slice(0,topK);
}
