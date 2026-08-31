const HEALTH = new Set(['HEALTHY','DEGRADED','STALE','DOWN','SCHEMA_DRIFT','AUTH_ERROR','QUOTA_EXHAUSTED']);

export function createProviderAdapter({ providerId, fetcher, normalize, validate = () => [], now = () => new Date().toISOString() }) {
  if (!providerId || typeof fetcher !== 'function' || typeof normalize !== 'function') throw new TypeError('providerId, fetcher and normalize are required');
  return Object.freeze({
    providerId,
    async collect(context = {}) {
      const startedAt = now();
      try {
        const raw = await fetcher(context);
        const errors = validate(raw) ?? [];
        if (errors.length) return { providerId, health:'SCHEMA_DRIFT', startedAt, finishedAt:now(), errors, raw:null, normalized:null };
        const normalized = normalize(raw, context);
        return { providerId, health:'HEALTHY', startedAt, finishedAt:now(), errors:[], raw, normalized };
      } catch (error) {
        const code = String(error?.code ?? 'UNKNOWN');
        const health = code.includes('AUTH') ? 'AUTH_ERROR' : code.includes('QUOTA') ? 'QUOTA_EXHAUSTED' : 'DOWN';
        return { providerId, health, startedAt, finishedAt:now(), errors:[String(error?.message ?? error)], raw:null, normalized:null };
      }
    }
  });
}

export function assertProviderHealth(state) {
  if (!HEALTH.has(state)) throw new TypeError(`invalid provider health: ${state}`);
  return state;
}
