export function weatherActionDecision({officialGates=[],windows=[],activity='GENERAL',minimumConfidence=.55}){
  if(officialGates.some(g=>['CLOSED','EVACUATE','WARNING','CRITICAL'].includes(g.level??g.type))) return Object.freeze({state:'BLOCKED_BY_OFFICIAL_GATE',activity,recommended:null,officialGates:Object.freeze(structuredClone(officialGates))});
  const eligible=windows.filter(w=>Number.isFinite(w.score)&&Number.isFinite(w.confidence)&&w.confidence>=minimumConfidence).sort((a,b)=>b.score-a.score);
  return Object.freeze({state:eligible.length?'RECOMMENDATION_AVAILABLE':'INSUFFICIENT_CONFIDENCE',activity,recommended:eligible[0]?Object.freeze(structuredClone(eligible[0])):null,alternatives:Object.freeze(eligible.slice(1,4).map(x=>structuredClone(x)))});
}
