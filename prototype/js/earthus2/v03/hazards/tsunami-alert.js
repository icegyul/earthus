export function createTsunamiAlertState({officialAlerts=[],observations=[],historicalRunup=[]}){
  const active=[...officialAlerts].filter(a=>a.active!==false).sort((a,b)=>(b.severityRank??0)-(a.severityRank??0));
  return {officialPrimary:active[0]??null,officialAlerts:active,observations:structuredClone(observations),historicalRunup:structuredClone(historicalRunup),simulation:null,rule:'OFFICIAL_ALERT_OBSERVATION_HISTORY_SEPARATED'};
}
export function travelTimeRingFromProvided({sourceId,minutes,geometryRef,kind='OFFICIAL_OR_MODEL_PROVIDED'}){
  if(!Number.isFinite(minutes)||minutes<0) throw new TypeError('minutes required'); return {sourceId,minutes,geometryRef,kind,computedByEarthus:false};
}
