const DOMAIN_TOKEN={WEATHER:'ATMOSPHERIC',OCEAN:'MARINE',HUMAN:'CIVIC',GEO:'MINERAL',HAZARD:'RISK',SPACE:'ORBITAL',ECOLOGY:'BIO'};
export function materialGrammar({domain,evidenceKind,scene,thermal='NORMAL',selected=false}={}){
  const family=DOMAIN_TOKEN[domain]??'NEUTRAL'; const risk=evidenceKind==='OFFICIAL_WARNING'; const simulation=evidenceKind==='SIMULATION';
  return {family,emphasis:selected?'PRIMARY':'CONTEXT',riskToken:risk?'OFFICIAL_RISK':'NONE',pattern:simulation?'SCENARIO_PATTERN':'SOLID',detail:thermal==='SAFE'?'STATIC':thermal==='ECO'?'LOW':'NORMAL',rule:'RED_RESERVED_FOR_OFFICIAL_OR_VERIFIED_RISK'};
}
