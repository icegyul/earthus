import { clamp01, isoOrNull, stableId } from '../core/contracts.js';
const R=6371000; const rad=d=>d*Math.PI/180;
export function haversineMeters(a,b){if(!Number.isFinite(a?.lat)||!Number.isFinite(a?.lon)||!Number.isFinite(b?.lat)||!Number.isFinite(b?.lon))return null;const p1=rad(a.lat),p2=rad(b.lat),dp=rad(b.lat-a.lat),dl=rad(b.lon-a.lon);const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
const tokens=s=>new Set(String(s||'').toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>1));
function jaccard(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n);}
export function eventSimilarity(a={},b={},policy={}){
  const typeA=String(a.eventType||'').toUpperCase(),typeB=String(b.eventType||'').toUpperCase(); if(!typeA||typeA!==typeB)return{score:0,merge:false,reasons:['TYPE_MISMATCH']};
  if(a.officialEventId&&b.officialEventId&&a.officialEventId===b.officialEventId)return{score:1,merge:true,reasons:['OFFICIAL_ID_MATCH']};
  const ta=Date.parse(a.startedAt||a.observedAt||''),tb=Date.parse(b.startedAt||b.observedAt||''); const hours=Number.isFinite(ta)&&Number.isFinite(tb)?Math.abs(ta-tb)/3600000:null;
  const dist=haversineMeters(a,b); const name=jaccard(a.title,b.title); const region=a.region&&b.region&&String(a.region).toLowerCase()===String(b.region).toLowerCase()?1:0;
  const timeScore=hours===null?0.25:Math.max(0,1-hours/(policy.maxHours||72)); const geoScore=dist===null?(region?0.7:0.2):Math.max(0,1-dist/(policy.maxMeters||250000));
  const score=clamp01(.35*timeScore+.35*geoScore+.2*name+.1*region); const threshold=policy.threshold??.62;
  return{score,merge:score>=threshold,reasons:[`TIME_${timeScore.toFixed(2)}`,`GEO_${geoScore.toFixed(2)}`,`NAME_${name.toFixed(2)}`]};
}
export function clusterEarthEvents(records=[],policy={}){
  const rows=records.map((r,i)=>({...r,_i:i})); const parent=rows.map((_,i)=>i); const find=x=>parent[x]===x?x:(parent[x]=find(parent[x])); const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(eventSimilarity(rows[i],rows[j],policy).merge)union(i,j);
  const groups=new Map();rows.forEach((r,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);});
  return [...groups.values()].map(members=>{const ordered=[...members].sort((a,b)=>Date.parse(a.startedAt||a.observedAt||0)-Date.parse(b.startedAt||b.observedAt||0));const first=ordered[0];const lat=members.find(x=>Number.isFinite(x.lat))?.lat??null,lon=members.find(x=>Number.isFinite(x.lon))?.lon??null;return Object.freeze({eventId:first.officialEventId||stableId([first.eventType,first.region,first.startedAt,first.title]),eventType:first.eventType||'UNKNOWN',title:first.title||null,startedAt:isoOrNull(first.startedAt||first.observedAt),lat,lon,region:first.region||null,members:members.map(x=>{const{_i,...rest}=x;return rest;}),sourceCount:new Set(members.map(x=>x.sourceId).filter(Boolean)).size});});
}
