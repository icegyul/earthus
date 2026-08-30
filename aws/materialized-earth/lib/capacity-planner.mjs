export function planCapacity({
  materializedHitRate, cacheTarget, providerConstrained = false,
  cpuPressure = false, gpuEligiblePressure = false, gpuBenchmarkAdvantage = false,
  storageEgressPressure = false,
} = {}) {
  let recommendation = 'NO_SCALE_NEEDED';
  const reasons = [];
  if (providerConstrained) {
    recommendation = 'PROVIDER_PLAN_REVIEW';
    reasons.push('PROVIDER_IS_BOTTLENECK');
  } else if (Number.isFinite(cacheTarget) && Number(materializedHitRate) < cacheTarget) {
    recommendation = 'SOFTWARE_OPTIMIZATION_FIRST';
    reasons.push('MATERIALIZED_HIT_BELOW_TARGET');
  } else if (storageEgressPressure) {
    recommendation = 'STORAGE_EGRESS_OPTIMIZATION';
    reasons.push('STORAGE_EGRESS_PRESSURE');
  } else if (gpuEligiblePressure && gpuBenchmarkAdvantage) {
    recommendation = 'GPU_PILOT_RECOMMENDED';
    reasons.push('BENCHMARKED_GPU_ADVANTAGE');
  } else if (cpuPressure) {
    recommendation = 'CPU_SCALE_RECOMMENDED';
    reasons.push('SUSTAINED_CPU_PRESSURE');
  }
  return Object.freeze({ recommendation, reasons: Object.freeze(reasons) });
}
