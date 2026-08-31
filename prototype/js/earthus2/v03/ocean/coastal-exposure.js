const RISK_ORDER={SAFE:0,CAUTION:1,WARNING:2,CRITICAL:3,UNKNOWN:4};
export function coastalExposure({waveM=0,swellPeriodS=0,tideResidualM=0,windMs=0,officialWarning=false,dataAvailable=true}){
  if(officialWarning) return {state:'WARNING',score:null,reason:'OFFICIAL_WARNING_GATE'};
  if(!dataAvailable) return {state:'UNKNOWN',score:null,reason:'REQUIRED_DATA_MISSING'};
  const score=Math.max(0,Math.min(100,waveM*15+Math.max(0,swellPeriodS-8)*4+Math.max(0,tideResidualM)*25+Math.max(0,windMs-8)*2));
  const state=score>=75?'CRITICAL':score>=50?'WARNING':score>=25?'CAUTION':'SAFE'; return {state,score,reason:'DERIVED_EXPOSURE'};
}
export function maxCoastalRisk(states){ return [...states].sort((a,b)=>(RISK_ORDER[b]??0)-(RISK_ORDER[a]??0))[0]??'UNKNOWN'; }
