const REASONS=new Set(['SCHEMA_BREAKING','IDEMPOTENCY_COLLISION','PARSER_ERROR','SEMANTIC_INVALID','RIGHTS_BLOCK','SECURITY_POLICY','UNKNOWN']);
export function quarantineRecord({id,providerId,operationId,reason='UNKNOWN',rawRef=null,details=null,createdAt=Date.now()}={}){
  if(!id||!providerId) throw new Error('QUARANTINE_ID_PROVIDER_REQUIRED');
  const r=REASONS.has(reason)?reason:'UNKNOWN'; return {id:String(id),providerId:String(providerId),operationId:operationId??null,reason:r,rawRef,details,status:'QUARANTINED',createdAt:Number(createdAt),releasedAt:null,releaseEvidence:null};
}
export function releaseQuarantine(record,{evidence,validator,at=Date.now()}={}){
  if(record.status!=='QUARANTINED') throw new Error('NOT_QUARANTINED');
  if(!evidence||!validator) throw new Error('QUARANTINE_RELEASE_EVIDENCE_REQUIRED');
  return {...record,status:'RELEASED_FOR_REPLAY',releasedAt:Number(at),releaseEvidence:{evidence,validator}};
}
