export function planDeadLetterRecovery(messages, { maxAttempts = 5, retryableCodes = ['TIMEOUT','RATE_LIMIT','UPSTREAM_5XX','TRANSIENT_NETWORK'] } = {}) {
  if (!Array.isArray(messages)) throw new TypeError('messages must be array');
  return Object.freeze(messages.map(m => {
    const attempts = Number.isFinite(m.attempts) ? m.attempts : 0;
    if (!m.idempotencyKey) return Object.freeze({ id:m.id, action:'QUARANTINE', reason:'MISSING_IDEMPOTENCY_KEY' });
    if (attempts >= maxAttempts) return Object.freeze({ id:m.id, action:'QUARANTINE', reason:'MAX_ATTEMPTS' });
    if (!retryableCodes.includes(m.errorCode)) return Object.freeze({ id:m.id, action:'QUARANTINE', reason:'NON_RETRYABLE' });
    return Object.freeze({ id:m.id, action:'RETRY', nextAttempt:attempts+1, backoffSeconds:Math.min(3600, 2**attempts*30) });
  }));
}
