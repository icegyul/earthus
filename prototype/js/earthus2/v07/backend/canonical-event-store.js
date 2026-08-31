function setOf(v){return new Set((v||[]).map(x=>String(x).toLowerCase()));}
function jaccard(a,b){const A=setOf(a),B=setOf(b);if(!A.size&&!B.size)return 0;let i=0;for(const x of A)if(B.has(x))i++;return i/(A.size+B.size-i||1);}
export function eventMergeEvidence(a={},b={}){
  if(a.officialEventId&&b.officialEventId&&a.officialEventId===b.officialEventId) return {score:1,allow:true,reason:'OFFICIAL_ID_MATCH'};
  if(a.eventType&&b.eventType&&String(a.eventType)!==String(b.eventType)) return {score:0,allow:false,reason:'TYPE_CONFLICT'};
  const topic=jaccard(a.topics,b.topics); const loc=(a.country&&a.country===b.country?0.2:0)+(a.region&&a.region===b.region?0.2:0)+(a.city&&a.city===b.city?0.15:0);
  const ta=Number(new Date(a.occurredAt??a.publishedAt??0)), tb=Number(new Date(b.occurredAt??b.publishedAt??0)); const hours=Math.abs(ta-tb)/3600000; const time=Number.isFinite(hours)?Math.max(0,0.3-hours/240):0;
  const score=Math.min(1,topic*0.45+loc+time); return {score,allow:score>=0.72,reason:score>=0.72?'EVIDENCE_THRESHOLD':'INSUFFICIENT_EVIDENCE'};
}
export class CanonicalEventStore {
  constructor(){this.events=new Map();}
  upsert(event,{candidateIds=[]}={}){
    if(!event?.id) throw new Error('EVENT_ID_REQUIRED');
    for(const id of candidateIds){const existing=this.events.get(id);if(!existing)continue;const m=eventMergeEvidence(existing,event);if(m.allow){const merged={...existing,...event,id:existing.id,sourceEventIds:[...new Set([...(existing.sourceEventIds||[]),event.id,...(event.sourceEventIds||[])])]};this.events.set(existing.id,merged);return {decision:'MERGED',event:merged,evidence:m};}}
    this.events.set(event.id,{...event,sourceEventIds:[...new Set([event.id,...(event.sourceEventIds||[])])]}); return {decision:'CREATED',event:this.events.get(event.id)};
  }
  get(id){return this.events.get(id)||null;}
}
