import { clusterEarthEvents } from '../event/event-fusion.js'; import { clamp01, requireState } from '../core/contracts.js';
const SAFETY=new Set(['OFFICIAL_WARNING','EARTHQUAKE','TSUNAMI','CYCLONE','WILDFIRE','FLOOD','EVACUATION']);
export function pulseRank(event={},context={}){const type=String(event.eventType||'').toUpperCase();if(event.officialSafety===true||SAFETY.has(type))return 1000+Math.max(0,Number(event.severity)||0)*25;const f=clamp01(event.freshness??.5),c=clamp01(event.confidence??.5),r=clamp01(event.geographicRelevance??context.defaultRelevance??.5),i=clamp01(event.publicInterest??.5);return 100*(.32*f+.3*c+.23*r+.15*i);}
export function buildPulse({events=[],news=[],actions=[],context={},releaseState='SHADOW',maxItems=12}={}){
 const records=[...events.map(x=>({...x,kind:x.kind||'EVENT'})),...news.map(x=>({...x,kind:'NEWS'})),...actions.map(x=>({...x,kind:'ACTION'}))];
 const clusters=clusterEarthEvents(records).map(c=>({...c,priorityScore:pulseRank({...c,...c.members[0]},context),kinds:[...new Set(c.members.map(x=>x.kind))]})).sort((a,b)=>b.priorityScore-a.priorityScore);
 return{releaseState:requireState(releaseState),generatedAt:new Date().toISOString(),items:clusters.slice(0,maxItems),totalClusters:clusters.length};
}
