function norm(v){return String(v ?? '').trim().toLowerCase();}
export function makeIdempotencyKey({providerId, operationId, externalId, observedAt, rawHash} = {}) {
  if (!providerId || !operationId) throw new Error('IDEMPOTENCY_PROVIDER_OPERATION_REQUIRED');
  const identity = externalId ? `id:${norm(externalId)}` : rawHash ? `hash:${norm(rawHash)}` : null;
  if (!identity) throw new Error('IDEMPOTENCY_ID_OR_HASH_REQUIRED');
  return [norm(providerId), norm(operationId), identity, observedAt ? new Date(observedAt).toISOString() : 'no-time'].join('|');
}
export class DedupeWindow {
  constructor({ttlMs=86400000}={}){ this.ttlMs=ttlMs; this.map=new Map(); }
  checkAndRemember(key, {now=Date.now(), rawHash=null}={}){
    const old=this.map.get(key);
    if(old && old.expiresAt>now){
      if(rawHash && old.rawHash && rawHash!==old.rawHash) return {duplicate:false, collision:true, existing:old};
      return {duplicate:true, collision:false, existing:old};
    }
    const entry={key, rawHash, createdAt:now, expiresAt:now+this.ttlMs}; this.map.set(key,entry); return {duplicate:false, collision:false, entry};
  }
  prune(now=Date.now()){ for(const [k,v] of this.map) if(v.expiresAt<=now) this.map.delete(k); }
}
