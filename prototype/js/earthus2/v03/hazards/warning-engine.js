const SEV={INFO:0,ADVISORY:1,WATCH:2,WARNING:3,EMERGENCY:4};
export function normalizeWarning(w){
  if(!w?.sourceId||!w?.issuedAt||!w?.hazardType) throw new TypeError('sourceId, issuedAt, hazardType required');
  const severity=SEV[w.severity]!=null?w.severity:'INFO';
  return Object.freeze({...structuredClone(w),severity,official:w.official!==false});
}
export function mergeOfficialWarnings(warnings,{nowAt=new Date().toISOString()}={}){
  const now=Date.parse(nowAt); const active=(warnings??[]).map(normalizeWarning).filter(w=>!w.expiresAt||Date.parse(w.expiresAt)>=now);
  active.sort((a,b)=>(b.official-a.official)||((SEV[b.severity]??0)-(SEV[a.severity]??0))||Date.parse(b.issuedAt)-Date.parse(a.issuedAt));
  return {primary:active[0]??null,all:active,policy:'OFFICIAL_AND_MORE_SEVERE_FIRST_NO_DOWNRANK'};
}
