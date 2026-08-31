export function advanceWatermark(current, candidate, { allowEqual = true } = {}) {
  const cur = current == null ? null : Number(new Date(current));
  const next = Number(new Date(candidate));
  if (!Number.isFinite(next)) throw new Error('INVALID_WATERMARK_CANDIDATE');
  if (cur == null || !Number.isFinite(cur)) return {advanced:true, value:new Date(next).toISOString(), reason:'INITIAL'};
  if (next > cur || (allowEqual && next === cur)) return {advanced:next>cur, value:new Date(Math.max(cur,next)).toISOString(), reason:next>cur?'ADVANCED':'EQUAL'};
  return {advanced:false, value:new Date(cur).toISOString(), reason:'REGRESSION_BLOCKED'};
}
export function reconcileRevision(existing, incoming) {
  if (!existing) return {decision:'ACCEPT_NEW', accepted:incoming, supersedes:null};
  if (existing.rawHash && incoming.rawHash && existing.rawHash === incoming.rawHash) return {decision:'DUPLICATE', accepted:existing, supersedes:null};
  const er=Number(existing.revision ?? 0), ir=Number(incoming.revision ?? 0);
  if (ir > er) return {decision:'ACCEPT_REVISION', accepted:incoming, supersedes:existing.id ?? null};
  if (ir < er) return {decision:'REJECT_OLDER_REVISION', accepted:existing, supersedes:null};
  const et=Number(new Date(existing.receivedAt ?? 0)), it=Number(new Date(incoming.receivedAt ?? 0));
  if (it > et) return {decision:'ACCEPT_LATE_CORRECTION', accepted:incoming, supersedes:existing.id ?? null};
  return {decision:'CONFLICT_QUARANTINE', accepted:existing, supersedes:null};
}
