export function evaluateProviderBudget({ remaining, hardLimit, reserveForSafety = 0, requested = 1, safety = false, cooldownUntil = 0, now = Date.now() } = {}) {
  const rem=Number(remaining), req=Math.max(0,Number(requested));
  if(Number(cooldownUntil)>Number(now)) return {allow:false, reason:'COOLDOWN', remaining:rem};
  if(!Number.isFinite(rem) || rem < req) return {allow:false, reason:'HARD_QUOTA_EXHAUSTED', remaining:rem};
  if(safety) return {allow:true, reason:'SAFETY_RESERVED_ACCESS', remainingAfter:rem-req};
  if(rem-req < Number(reserveForSafety||0)) return {allow:false, reason:'SAFETY_RESERVE_PROTECTED', remaining:rem};
  return {allow:true, reason:'WITHIN_BUDGET', remainingAfter:rem-req};
}
export function nextRateLimitDelay({status, retryAfterSeconds=null, attempt=0, baseMs=500, maxMs=60000}={}){
  if(Number(retryAfterSeconds)>=0) return Math.min(maxMs,Number(retryAfterSeconds)*1000);
  if(![429,500,502,503,504].includes(Number(status))) return 0;
  return Math.min(maxMs, Math.round(baseMs * (2 ** Math.max(0,attempt))));
}
