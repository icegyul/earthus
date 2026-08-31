const SAFETY_TYPES=new Set(['SAFETY','OFFICIAL_WARNING','EVACUATION','EMERGENCY']);
const text=(v,f)=>{if(typeof v!=='string'||!v.trim())throw new TypeError(`${f} is required`);return v.trim()};
const conf=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
export function makeSemanticDedupeKey({userId,watchId,ruleId,subjectId,semanticWindow}){return[userId,watchId,ruleId,subjectId,semanticWindow].map(v=>text(v,'dedupe part')).join(':')}
export function decideWatchNotification(input,history=[]){
 const now=Date.parse(input?.nowIso??new Date().toISOString());if(!Number.isFinite(now))throw new TypeError('nowIso must be ISO');
 if(!input?.consent?.pushEnabled)return Object.freeze({state:'BLOCKED',reason:'PUSH_NOT_ENABLED'});
 if(!input?.tokenActive)return Object.freeze({state:'BLOCKED',reason:'NO_ACTIVE_DEVICE_TOKEN'});
 const severity=String(input.severity??'NOTICE').toUpperCase();const officialSafety=input.officialSafety===true||SAFETY_TYPES.has(severity);const confidence=conf(input.confidence);const min=Number.isFinite(input.minimumConfidence)?input.minimumConfidence:.55;
 if(!officialSafety&&confidence<min)return Object.freeze({state:'BLOCKED',reason:'LOW_CONFIDENCE',confidence});
 const dedupeKey=makeSemanticDedupeKey(input);const duplicate=history.find(r=>r?.dedupeKey===dedupeKey&&r?.state!=='RETRACTED');
 if(duplicate&&!input.semanticStateChanged)return Object.freeze({state:'BLOCKED',reason:'DUPLICATE',dedupeKey});
 const cooldownMs=Math.max(0,Number(input.cooldownSeconds??1800)*1000);const last=[...history].reverse().find(r=>r?.ruleId===input.ruleId&&r?.subjectId===input.subjectId&&r?.sentAt);
 if(!officialSafety&&last&&now-Date.parse(last.sentAt)<cooldownMs)return Object.freeze({state:'BLOCKED',reason:'COOLDOWN',dedupeKey});
 const deepLink=text(input.deepLink,'deepLink');if(!/^earthus:\/\//.test(deepLink)&&!/^https:\/\/earthus\.net\//.test(deepLink))throw new TypeError('deepLink must target earthus');
 return Object.freeze({state:'DECIDED',channel:'PUSH',severity:officialSafety?'SAFETY':severity,officialSafety,confidence:officialSafety?null:confidence,dedupeKey,collapseKey:`${input.subjectId}:${input.alertType??input.ruleId}`,deepLink,expiresAt:input.expiresAt??null,evidenceRefs:[...new Set(input.evidenceRefs??[])],reason:officialSafety?'OFFICIAL_SAFETY_PRIORITY':'WATCH_RULE_MATCH'});
}
