function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return new TextEncoder().encode(JSON.stringify(value));
}
export async function sha256Hex(value) {
  const data = bytesOf(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,'0')).join('');
}
function safePart(v){ return String(v ?? 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'unknown'; }
export function compileRawArtifactKey({ providerId, operationId, runId, receivedAt = Date.now(), hash, extension = 'bin' } = {}) {
  if (!providerId || !operationId || !runId || !hash) throw new Error('RAW_ARTIFACT_KEY_FIELDS_REQUIRED');
  const d=new Date(Number(receivedAt)); const yyyy=d.getUTCFullYear(); const mm=String(d.getUTCMonth()+1).padStart(2,'0'); const dd=String(d.getUTCDate()).padStart(2,'0');
  return `raw/v1/${safePart(providerId)}/${safePart(operationId)}/${yyyy}/${mm}/${dd}/${safePart(runId)}/${safePart(hash)}.${safePart(extension)}`;
}
export async function buildRawArtifactReceipt(raw, meta = {}) {
  const hash = await sha256Hex(raw); const bytes = bytesOf(raw);
  const receivedAt = Number(meta.receivedAt ?? Date.now());
  const key = compileRawArtifactKey({ ...meta, receivedAt, hash, extension:meta.extension || 'bin' });
  return Object.freeze({ version:'raw-receipt-v1', key, sha256:hash, byteLength:bytes.byteLength, providerId:meta.providerId, operationId:meta.operationId, runId:meta.runId, observedAt:meta.observedAt ?? null, receivedAt, contentType:meta.contentType ?? 'application/octet-stream', immutable:true });
}
export function validateRawNormalizedLink({ rawReceipt, normalized } = {}) {
  if (!rawReceipt?.sha256) return {ok:false, reason:'RAW_HASH_MISSING'};
  if (!normalized?.provenance?.rawHash) return {ok:false, reason:'NORMALIZED_RAW_HASH_MISSING'};
  return rawReceipt.sha256 === normalized.provenance.rawHash ? {ok:true} : {ok:false, reason:'RAW_NORMALIZED_HASH_MISMATCH'};
}
