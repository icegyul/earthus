const TERMS = Object.freeze([
  ['cpuCoreSeconds', 'cpuCoreSecond'],
  ['gpuSeconds', 'gpuSecond'],
  ['memoryGbSeconds', 'memoryGbSecond'],
  ['storageGbHours', 'storageGbHour'],
  ['storageOps', 'storageOp'],
  ['egressGb', 'egressGb'],
  ['providerApiUnits', 'providerApiUnit'],
  ['llmInputTokens', 'llmInputToken'],
  ['llmOutputTokens', 'llmOutputToken'],
]);

export function calculateDirectInfraCost(measured = {}, rateCard = {}) {
  const missingRates = [];
  const components = {};
  let total = Number(measured.otherMeteredRuntimeCost || 0);
  for (const [usageField, rateField] of TERMS) {
    const usage = Number(measured[usageField] || 0);
    if (usage === 0) { components[usageField] = 0; continue; }
    const rate = Number(rateCard[rateField]);
    if (!Number.isFinite(rate)) {
      missingRates.push(rateField);
      components[usageField] = null;
      continue;
    }
    const cost = usage * rate;
    components[usageField] = cost;
    total += cost;
  }
  if (!rateCard.version || missingRates.length) {
    return Object.freeze({
      status: 'INSUFFICIENT_RATE_DATA', total: null,
      currency: rateCard.currency || null, rateVersion: rateCard.version || null,
      missingRates: Object.freeze(missingRates), components: Object.freeze(components),
    });
  }
  return Object.freeze({
    status: 'MEASURED', total: Number(total.toFixed(12)), currency: rateCard.currency,
    rateVersion: rateCard.version, missingRates: Object.freeze([]),
    components: Object.freeze(components),
  });
}
