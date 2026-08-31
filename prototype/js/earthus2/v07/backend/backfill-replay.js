export function planBackfill({startAt,endAt,chunkMs=86400000,maxChunks=366,mode='BACKFILL'}={}){
  const s=Number(new Date(startAt)), e=Number(new Date(endAt)); if(!Number.isFinite(s)||!Number.isFinite(e)||e<=s) throw new Error('INVALID_BACKFILL_RANGE');
  if(chunkMs<=0) throw new Error('INVALID_BACKFILL_CHUNK');
  const chunks=[]; for(let a=s;a<e;a+=chunkMs){ if(chunks.length>=maxChunks) throw new Error('BACKFILL_TOO_LARGE'); chunks.push({startAt:new Date(a).toISOString(),endAt:new Date(Math.min(e,a+chunkMs)).toISOString(),mode}); }
  return chunks;
}
export function prioritizeReplayJobs(jobs=[]){
  const rank={SAFETY:0,CURRENT_REPAIR:1,GROUND_TRUTH:2,BACKFILL:3,RESEARCH:4}; return [...jobs].sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9)||Number(new Date(a.startAt))-Number(new Date(b.startAt)));
}
