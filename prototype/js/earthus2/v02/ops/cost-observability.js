export function estimateDailyCost({ storageGbDays = 0, egressGb = 0, requests = 0, computeSeconds = 0, rates }) {
  const required = ['storagePerGbMonth', 'egressPerGb', 'requestsPerMillion', 'computePerSecond'];
  for (const key of required) if (!Number.isFinite(rates?.[key]) || rates[key] < 0) throw new TypeError(`rate ${key} is required`);
  const storage = storageGbDays / 30 * rates.storagePerGbMonth;
  const egress = egressGb * rates.egressPerGb;
  const requestCost = requests / 1_000_000 * rates.requestsPerMillion;
  const compute = computeSeconds * rates.computePerSecond;
  return Object.freeze({ storage, egress, requests: requestCost, compute, total: storage + egress + requestCost + compute });
}

export function costToValueDecision({ estimatedCost, activeUsers, valueScore, safetyCritical = false, budget }) {
  if (![estimatedCost, activeUsers, valueScore, budget].every(Number.isFinite) || estimatedCost < 0 || activeUsers < 0 || budget < 0) throw new RangeError('invalid cost/value inputs');
  if (safetyCritical) return Object.freeze({ decision: 'RUN', reason: 'SAFETY_CRITICAL', costPerActiveUser: activeUsers > 0 ? estimatedCost / activeUsers : null });
  if (estimatedCost > budget) return Object.freeze({ decision: 'DEFER_OR_DOWNSAMPLE', reason: 'BUDGET_EXCEEDED', costPerActiveUser: activeUsers > 0 ? estimatedCost / activeUsers : null });
  const costPerActiveUser = activeUsers > 0 ? estimatedCost / activeUsers : Infinity;
  const efficiency = valueScore / Math.max(estimatedCost, 0.01);
  return Object.freeze({ decision: efficiency >= 0.5 ? 'RUN' : 'DOWNSAMPLE', reason: efficiency >= 0.5 ? 'VALUE_JUSTIFIED' : 'LOW_VALUE_EFFICIENCY', costPerActiveUser, efficiency });
}
