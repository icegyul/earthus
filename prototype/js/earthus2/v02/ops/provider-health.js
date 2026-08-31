export const PROVIDER_HEALTH = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  STALE: 'STALE',
  DOWN: 'DOWN',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  AUTH_ERROR: 'AUTH_ERROR',
  SCHEMA_DRIFT: 'SCHEMA_DRIFT',
});

export class CircuitBreaker {
  #failureThreshold;
  #resetAfterMs;
  #state = 'CLOSED';
  #failures = 0;
  #openedAt = null;

  constructor({ failureThreshold = 3, resetAfterMs = 60000 } = {}) {
    if (!Number.isInteger(failureThreshold) || failureThreshold <= 0 || !Number.isFinite(resetAfterMs) || resetAfterMs <= 0) throw new RangeError('invalid circuit breaker settings');
    this.#failureThreshold = failureThreshold;
    this.#resetAfterMs = resetAfterMs;
  }

  canCall(nowMs = Date.now()) {
    if (this.#state === 'OPEN' && nowMs - this.#openedAt >= this.#resetAfterMs) this.#state = 'HALF_OPEN';
    return this.#state !== 'OPEN';
  }

  success() { this.#failures = 0; this.#state = 'CLOSED'; this.#openedAt = null; }

  failure(nowMs = Date.now()) {
    this.#failures += 1;
    if (this.#failures >= this.#failureThreshold) { this.#state = 'OPEN'; this.#openedAt = nowMs; }
  }

  snapshot() { return Object.freeze({ state: this.#state, failures: this.#failures, openedAt: this.#openedAt }); }
}

export function providerHealthState({ lastSuccessAt, nowAt = new Date().toISOString(), freshnessSlaMinutes, consecutiveFailures = 0, authError = false, schemaDrift = false, quotaExhausted = false }) {
  if (authError) return PROVIDER_HEALTH.AUTH_ERROR;
  if (schemaDrift) return PROVIDER_HEALTH.SCHEMA_DRIFT;
  if (quotaExhausted) return PROVIDER_HEALTH.QUOTA_EXHAUSTED;
  const last = Date.parse(lastSuccessAt); const now = Date.parse(nowAt);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return PROVIDER_HEALTH.DOWN;
  const ageMinutes = Math.max(0, (now - last) / 60000);
  if (consecutiveFailures >= 3) return PROVIDER_HEALTH.DEGRADED;
  if (ageMinutes > freshnessSlaMinutes * 2) return PROVIDER_HEALTH.DOWN;
  if (ageMinutes > freshnessSlaMinutes) return PROVIDER_HEALTH.STALE;
  return PROVIDER_HEALTH.HEALTHY;
}

export function exponentialBackoff({ attempt, baseMs = 1000, maxMs = 60000, jitter = 0 }) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError('attempt must be a non-negative integer');
  const deterministic = Math.min(maxMs, baseMs * (2 ** attempt));
  const jitterValue = Math.max(-1, Math.min(1, jitter));
  return Math.max(0, Math.round(deterministic * (1 + 0.25 * jitterValue)));
}
