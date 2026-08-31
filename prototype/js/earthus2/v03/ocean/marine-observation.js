function ageSec(at,now){return Math.max(0,(Date.parse(now)-Date.parse(at))/1000);}
export function chooseMarineObservation(records,{nowAt,maxAgeSeconds=7200,variable}={}){
  const valid=(records??[]).filter(r=>r.variable===variable&&Number.isFinite(r.value)&&r.observedAt&&ageSec(r.observedAt,nowAt)<=maxAgeSeconds);
  valid.sort((a,b)=>{const qa=Number.isFinite(a.quality)?a.quality:0.5,qb=Number.isFinite(b.quality)?b.quality:0.5; return qb-qa || Date.parse(b.observedAt)-Date.parse(a.observedAt);});
  return valid[0]?structuredClone(valid[0]):null;
}
