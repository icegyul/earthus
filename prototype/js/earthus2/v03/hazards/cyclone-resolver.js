const REGION_PRIORITY={KOREA:['KMA','JMA'],JAPAN:['JMA','KMA'],USA:['NHC','CPHC'],WEST_PACIFIC:['JMA','KMA'],GLOBAL:[]};
export function resolveCycloneTracks(tracks,{region='GLOBAL'}={}){
  const order=REGION_PRIORITY[region]??[]; const normalized=(tracks??[]).filter(t=>t?.agency&&Array.isArray(t.points));
  normalized.sort((a,b)=>{const ai=order.indexOf(a.agency),bi=order.indexOf(b.agency);return (ai<0?999:ai)-(bi<0?999:bi)||Date.parse(b.issuedAt??0)-Date.parse(a.issuedAt??0);});
  return {primary:normalized[0]??null,alternates:normalized.slice(1),rule:'DO_NOT_AVERAGE_OFFICIAL_AGENCY_TRACKS'};
}
export function impactWindows(points,{radiusKm=150}={}){return (points??[]).map(p=>({validAt:p.validAt,center:{lat:p.lat,lon:p.lon},radiusKm,sourceKind:p.sourceKind??'OFFICIAL_FORECAST'}));}
