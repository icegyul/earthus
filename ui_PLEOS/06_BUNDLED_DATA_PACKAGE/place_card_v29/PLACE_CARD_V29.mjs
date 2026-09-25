/** EARTHUS V29 Place Card + Context Integration. Deterministic, network-free UI model. */
import fs from 'node:fs/promises';

const PRIORITY = ['SAFETY','SYSTEM','CURRENT_ENVIRONMENT','USER_SELECTION','LOCAL_DISCOVERY','COMMERCIAL'];

export function safetyGate(input={}) {
  const {marineAlert=false, criticalDisaster=false, drivingState='PARKED'} = input;
  if (criticalDisaster) return {level:'SAFETY', mode:'SAFETY', suppress:['commercial','leisure'], reason:'CRITICAL_DISASTER'};
  if (marineAlert) return {level:'SAFETY', mode:'SAFETY', suppress:['marine_leisure','sports'], reason:'MARINE_ALERT'};
  if (drivingState==='DRIVING' || drivingState==='RESTRICTED' || drivingState==='UNKNOWN')
    return {level:'SYSTEM', mode:'DRIVING_SAFE', suppress:['deep_detail','keyboard_search','complex_filters','reservation_flow'], reason:`DRIVING_STATE_${drivingState}`};
  return {level:'CURRENT_ENVIRONMENT', mode:'NORMAL', suppress:[], reason:'NO_OVERRIDE'};
}

export function scoreContext(poi, env={}, now=new Date()) {
  const rules=[]; let score=0; const suppress=new Set();
  const precip=!!env.precipitation;
  if (precip) { if(['culture','tourism'].includes(poi.category)){score+=30;rules.push('RAIN_INDOOR');} if(['nature','sports'].includes(poi.category)) suppress.add(poi.category); }
  if (!precip && Number.isFinite(env.sunsetWithinMinutes) && env.sunsetWithinMinutes<=120 && env.sunsetWithinMinutes>=0) {
    if(['nature','marine','tourism'].includes(poi.category)){score+=25;rules.push('SUNSET_OUTDOOR');}
  }
  if (env.marineSuitable===true && env.marineAlert!==true && ['marine','sports'].includes(poi.category)){score+=25;rules.push('GOOD_MARINE');}
  if (env.marineAlert===true && ['marine','sports'].includes(poi.category)) suppress.add(poi.category);
  if (env.airQuality==='poor' && ['nature','sports'].includes(poi.category)) suppress.add(poi.category);
  if (env.eventToday===true && poi.category==='event'){score+=35;rules.push('EVENT_TODAY');}
  if (poi.status && poi.status!=='ACTIVE') suppress.add(poi.category);
  return {score, suppressed:suppress.has(poi.category), rules};
}

export function buildPlaceCard(poi, env={}, options={}) {
  const gate=safetyGate(env); const ctx=scoreContext(poi,env);
  const card={
    id:poi.id, canonicalId:poi.canonicalId||poi.id, name:poi.name, category:poi.category,
    coordinates:{lat:poi.lat,lon:poi.lon}, status:poi.status||'UNKNOWN', region:poi.region||null,
    source:poi.source||null, observedAt:poi.observedAt||null,
    context:{score:ctx.score,rules:ctx.rules,suppressed:ctx.suppressed},
    safety:{mode:gate.mode,reason:gate.reason,level:gate.level},
    environment:{weather:env.weather??null,airQuality:env.airQuality??null,marine:env.marine??null,sunsetWithinMinutes:env.sunsetWithinMinutes??null},
    actions:{directions:true,detail:gate.suppress.includes('deep_detail')?false:true,phone:true,save:true,reservation:gate.suppress.includes('reservation_flow')?false:!!poi.bookingUrl,coupon:false}
  };
  if (gate.mode==='SAFETY') card.banner={type:'SAFETY',message:'안전 관련 정보가 우선 표시됩니다.'};
  return card;
}

export async function loadContextBundle(baseDir){
  const rules=JSON.parse(await fs.readFile(`${baseDir}/context_v27/CONTEXT_RULES_V27.json`,'utf8'));
  return {rules,priority:PRIORITY};
}
