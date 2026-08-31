function stable(value){ if(Array.isArray(value)) return value.map(stable); if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])); return value; }
function hash32(text){ let h=2166136261; for(const c of text){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(16).padStart(8,'0'); }
export function revisionFingerprint(value){ return hash32(JSON.stringify(stable(value))); }
export function classifyRevision(previous,next){
  if(!previous) return {state:'NEW',changed:true};
  const a=revisionFingerprint(previous),b=revisionFingerprint(next); if(a===b) return {state:'UNCHANGED',changed:false,fingerprint:b};
  const prevTime=Date.parse(previous.observedAt??previous.validAt??0), nextTime=Date.parse(next.observedAt??next.validAt??0);
  const state=Number.isFinite(prevTime)&&Number.isFinite(nextTime)&&prevTime===nextTime?'PROVIDER_REVISION':'NEW_TIME_SLICE';
  return {state,changed:true,previousFingerprint:a,fingerprint:b};
}
export function backfillWindow({lastSuccessAt, nowAt, lookbackHours=24}){
  const now=Date.parse(nowAt); if(!Number.isFinite(now)) throw new TypeError('nowAt required');
  const start=Math.min(Number.isFinite(Date.parse(lastSuccessAt))?Date.parse(lastSuccessAt):now, now-lookbackHours*3600000);
  return {from:new Date(start).toISOString(),to:new Date(now).toISOString()};
}
