const MODES = new Set(['LIVE','FORECAST','HISTORY','SCENARIO']);
function ms(x){ const v=Date.parse(x); if(!Number.isFinite(v)) throw new TypeError(`invalid time: ${x}`); return v; }
export function alignTimeSlice(records, targetAt, { maxAgeSeconds=Infinity, prefer='nearest' } = {}) {
  const t=ms(targetAt); const valid=(records??[]).filter(r=>r?.at && Number.isFinite(Date.parse(r.at)));
  if (!valid.length) return null;
  const sorted=valid.map(r=>({r,delta:Math.abs(ms(r.at)-t)})).sort((a,b)=>a.delta-b.delta);
  const hit=sorted[0]; if (hit.delta/1000>maxAgeSeconds) return null;
  return structuredClone(hit.r);
}
export function interpolateScalarFrames(a,b,targetAt,{mode='FORECAST'}={}){
  if(!MODES.has(mode)) throw new TypeError('invalid mode');
  if(!a?.at||!b?.at||!Number.isFinite(a.value)||!Number.isFinite(b.value)) throw new TypeError('scalar frames required');
  const ta=ms(a.at),tb=ms(b.at),tt=ms(targetAt); if(tb<=ta) throw new RangeError('frame time order invalid');
  const q=Math.max(0,Math.min(1,(tt-ta)/(tb-ta)));
  return { at:new Date(tt).toISOString(), value:a.value+(b.value-a.value)*q, mode, interpolation:'LINEAR', sourceFrameIds:[a.id??null,b.id??null] };
}
