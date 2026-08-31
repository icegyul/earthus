export function evaluatePublishCandidate({rawLinkOk=false,schemaSeverity='NONE',freshnessState='LIVE',providerHealth='HEALTHY',normalizedRef=null}={}){
  if(!rawLinkOk)return {allow:false,reason:'RAW_LINK_INVALID'}; if(schemaSeverity==='BREAKING')return {allow:false,reason:'SCHEMA_BREAKING'}; if(!normalizedRef)return {allow:false,reason:'NORMALIZED_REF_MISSING'}; if(['DOWN','UNKNOWN'].includes(providerHealth))return {allow:false,reason:'PROVIDER_HEALTH_BLOCK'}; if(freshnessState==='UNAVAILABLE')return {allow:false,reason:'FRESHNESS_UNAVAILABLE'}; return {allow:true,reason:freshnessState==='STALE'?'ALLOW_STALE_MARKED':'READY'};
}
export function promoteLastGoodPointer(current,candidate,{at=Date.now()}={}){
  if(!candidate?.key||!candidate?.version)throw new Error('PUBLISH_CANDIDATE_KEY_VERSION_REQUIRED');return {key:candidate.key,version:candidate.version,publishedAt:Number(at),previous:current?{key:current.key,version:current.version}:null,rollbackSafe:true};
}
