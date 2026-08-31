export function buildRollbackPlan({ currentVersion, previousStableVersion, reason, affectedSurfaces = [], dataMigration = null, rollbackArtifactVerified = false }) {
  if (![currentVersion,previousStableVersion,reason].every(v=>typeof v==='string'&&v.trim())) throw new TypeError('versions and reason required');
  const blockers=[];
  if(!rollbackArtifactVerified) blockers.push('ROLLBACK_ARTIFACT_NOT_VERIFIED');
  if(dataMigration?.irreversible===true) blockers.push('IRREVERSIBLE_DATA_MIGRATION');
  return Object.freeze({
    allowed:blockers.length===0, from:currentVersion, to:previousStableVersion, reason,
    affectedSurfaces:Object.freeze([...new Set(affectedSurfaces)]), blockers:Object.freeze(blockers),
    steps:Object.freeze(['FREEZE_WRITES_IF_NEEDED','RESTORE_CODE_OR_FLAG','VERIFY_SCHEMA_COMPATIBILITY','RUN_SMOKE','VERIFY_RUNTIME_EVIDENCE','REOPEN_TRAFFIC']),
    automaticExecution:false,
  });
}
