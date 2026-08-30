export function routeWorkload({
  computeClass = 'C1_MATERIALIZED_SHARED', gpuAvailable = false,
  gpuEligible = false, benchmark = null,
} = {}) {
  if (['C0_STATIC_BASELINE', 'C1_MATERIALIZED_SHARED', 'C2_EVENT_DELTA'].includes(computeClass)) {
    return Object.freeze({ backend: 'CPU', fallbackBackend: 'CPU', reason: 'BASE_SHARED_CPU_PATH' });
  }
  if (!gpuAvailable || !gpuEligible || !benchmark) {
    return Object.freeze({ backend: 'CPU', fallbackBackend: 'CPU', reason: 'GPU_NOT_JUSTIFIED' });
  }
  const faster = Number(benchmark.gpuRuntimeMs) < Number(benchmark.cpuRuntimeMs);
  const cheaper = Number(benchmark.gpuCostUnits) < Number(benchmark.cpuCostUnits);
  if (faster && cheaper) {
    return Object.freeze({
      backend: 'GPU', fallbackBackend: 'CPU', reason: 'BENCHMARKED_LATENCY_AND_COST_ADVANTAGE',
      estimatedRuntimeMs: benchmark.gpuRuntimeMs,
      estimatedCostUnits: benchmark.gpuCostUnits,
    });
  }
  return Object.freeze({ backend: 'CPU', fallbackBackend: 'CPU', reason: 'CPU_ECONOMICS_PREFERRED' });
}
