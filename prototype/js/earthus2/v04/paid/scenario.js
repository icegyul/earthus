export function scenarioExecutionGate({ plan='FREE', quotaRemaining=0, liveMutationRequested=false, assumptions=[] }={}){
  if(liveMutationRequested) return Object.freeze({allowed:false,reason:'SCENARIO_MUST_NOT_MUTATE_LIVE'});
  if(!['CONTROL','BUSINESS'].includes(plan)) return Object.freeze({allowed:false,reason:'CONTROL_REQUIRED'});
  if(!(quotaRemaining>0)) return Object.freeze({allowed:false,reason:'QUOTA_EXHAUSTED'});
  return Object.freeze({allowed:true,evidenceKind:'SIMULATION',quotaCost:1,assumptions:Object.freeze([...assumptions])});
}
