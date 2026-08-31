const TRANSITIONS = Object.freeze({
  PENDING: new Set(['FETCHING','FAILED']),
  FETCHING: new Set(['RAW_STORED','NOT_MODIFIED','QUARANTINED','FAILED']),
  RAW_STORED: new Set(['VALIDATING','QUARANTINED','FAILED']),
  VALIDATING: new Set(['NORMALIZED','QUARANTINED','FAILED']),
  NORMALIZED: new Set(['PUBLISHING','QUARANTINED','FAILED']),
  PUBLISHING: new Set(['PUBLISHED','FAILED']),
  PUBLISHED: new Set(['SUCCEEDED','FAILED']),
  NOT_MODIFIED: new Set(['SUCCEEDED']),
  QUARANTINED: new Set([]), FAILED: new Set([]), SUCCEEDED: new Set([]),
});

export function createIngestionRun({ runId, providerId, operationId, requestedAt = Date.now(), traceId = null, cursor = null } = {}) {
  if (!runId || !providerId || !operationId) throw new Error('INGESTION_RUN_ID_PROVIDER_OPERATION_REQUIRED');
  return { runId:String(runId), providerId:String(providerId), operationId:String(operationId), state:'PENDING', requestedAt:Number(requestedAt), updatedAt:Number(requestedAt), traceId, cursor, attempts:0, history:[{state:'PENDING', at:Number(requestedAt)}] };
}

export function advanceIngestionRun(run, nextState, { at = Date.now(), reason = null, artifactRef = null, normalizedRef = null } = {}) {
  const allowed = TRANSITIONS[run?.state];
  if (!allowed || !allowed.has(nextState)) throw new Error(`INVALID_INGESTION_TRANSITION:${run?.state}->${nextState}`);
  const attempts = nextState === 'FETCHING' ? Number(run.attempts || 0) + 1 : Number(run.attempts || 0);
  return { ...run, state:nextState, updatedAt:Number(at), attempts, artifactRef:artifactRef ?? run.artifactRef ?? null, normalizedRef:normalizedRef ?? run.normalizedRef ?? null, reason:reason ?? null, history:[...(run.history || []), {state:nextState, at:Number(at), reason:reason ?? null}] };
}

export function isTerminalIngestionState(state) { return ['SUCCEEDED','FAILED','QUARANTINED'].includes(String(state)); }
