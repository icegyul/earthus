function hav(a,b){const R=6371,toRad=x=>x*Math.PI/180,dlat=toRad(b.lat-a.lat),dlon=toRad(b.lon-a.lon);const x=Math.sin(dlat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dlon/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
export function fuseAgencyEvents(events,{timeWindowMin=90,distanceKm=150}={}){
  const groups=[];
  for(const e of events){if(!e?.agency||!e?.eventId||!e?.type||!e?.issuedAt)continue;let g=groups.find(g=>g.type===e.type&&Math.abs(Date.parse(g.anchor.issuedAt)-Date.parse(e.issuedAt))/60000<=timeWindowMin&&(!Number.isFinite(e.lat)||!Number.isFinite(e.lon)||!Number.isFinite(g.anchor.lat)||!Number.isFinite(g.anchor.lon)||hav(g.anchor,e)<=distanceKm));if(!g){g={type:e.type,anchor:e,members:[]};groups.push(g);}g.members.push(e);}
  return Object.freeze(groups.map((g,i)=>Object.freeze({canonicalEventId:`evt_${g.type}_${i+1}`,type:g.type,agencyEventIds:Object.freeze(g.members.map(m=>`${m.agency}:${m.eventId}`)),members:Object.freeze(g.members.map(x=>structuredClone(x))),officialGeometryMerged:false,officialValuesAveraged:false,conflict:g.members.some((m,idx)=>idx&&m.level!==g.members[0].level)})));
}
