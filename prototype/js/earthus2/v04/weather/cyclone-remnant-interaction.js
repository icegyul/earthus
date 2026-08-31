export function evaluateCycloneRemnantInteraction({remnantDistanceKm,moistureTransport,frontOverlap,upperJetSupport,verticalMotion,sourceFreshness=1}){
  const components={proximity:Number.isFinite(remnantDistanceKm)?Math.max(0,1-remnantDistanceKm/1500):0,moisture:Number.isFinite(moistureTransport)?Math.max(0,Math.min(1,moistureTransport)):0,front:frontOverlap?1:0,jet:upperJetSupport?1:0,ascent:Number.isFinite(verticalMotion)?Math.max(0,Math.min(1,verticalMotion)):0,freshness:Math.max(0,Math.min(1,sourceFreshness))};
  const score=(components.proximity*.15+components.moisture*.3+components.front*.2+components.jet*.12+components.ascent*.18+components.freshness*.05);
  return Object.freeze({score,band:score>=.75?'STRONG_SUPPORT':score>=.5?'MODERATE_SUPPORT':score>=.3?'WEAK_SUPPORT':'INSUFFICIENT',components:Object.freeze(components),causalClaimAllowed:score>=.75&&components.moisture>.6&&components.ascent>.5});
}
