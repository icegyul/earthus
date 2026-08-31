export function observationGapLens({ observedCoverage, modelCoverage, stationDensity, sourceAgeMinutes, spatialResolutionM }) {
  const observed = Number.isFinite(observedCoverage) ? Math.max(0, Math.min(1, observedCoverage)) : 0;
  const model = Number.isFinite(modelCoverage) ? Math.max(0, Math.min(1, modelCoverage)) : 0;
  const station = Number.isFinite(stationDensity) ? Math.max(0, Math.min(1, stationDensity)) : 0;
  const freshness = Number.isFinite(sourceAgeMinutes) ? Math.max(0, Math.min(1, 1 - sourceAgeMinutes / 180)) : 0;
  const resolution = Number.isFinite(spatialResolutionM) ? Math.max(0, Math.min(1, 10000 / Math.max(100, spatialResolutionM))) : 0;
  const knowledge = 0.38 * observed + 0.18 * station + 0.18 * freshness + 0.14 * resolution + 0.12 * model;
  const modelDependence = Math.max(0, model - observed);
  return Object.freeze({
    knowledgeScore: knowledge,
    modelDependence,
    state: knowledge >= 0.75 ? 'WELL_OBSERVED' : knowledge >= 0.45 ? 'MIXED_OBSERVATION_MODEL' : model > 0.4 ? 'MODEL_DEPENDENT' : 'OBSERVATION_GAP',
  });
}
