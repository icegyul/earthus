export function reconcileForecasts({official,ensemble,earthus,persistenceRuns=0,calibrationQualified=false}){
  if(!official) return Object.freeze({state:'NO_OFFICIAL_BASELINE',official:null,earlySignal:false});
  const candidates=[ensemble?.value,earthus?.value].filter(Number.isFinite); const consensus=candidates.length?candidates.reduce((a,b)=>a+b,0)/candidates.length:null;
  const gap=Number.isFinite(consensus)&&Number.isFinite(official.value)?consensus-official.value:null; const scale=Math.max(1,Math.abs(official.value??0)); const divergent=Number.isFinite(gap)&&Math.abs(gap)/scale>=.2;
  const earlySignal=divergent&&persistenceRuns>=2&&calibrationQualified===true;
  return Object.freeze({state:divergent?'DIVERGENT':'ALIGNED',official:structuredClone(official),consensus,gap,earlySignal,label:earlySignal?'EARTHUS_EARLY_SIGNAL':'OFFICIAL_BASELINE_REMAINS_PRIMARY',officialOverridden:false});
}
