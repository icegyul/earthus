export function buildOceanFlowLayer(dataset, { depth = 0 } = {}) {
  if (dataset?.unit !== 'm/s') throw new TypeError('ocean current vectors must be normalized to m/s');
  if (!Array.isArray(dataset.levels) || !Array.isArray(dataset.sourceRefs) || dataset.sourceRefs.length === 0) throw new TypeError('ocean levels and sourceRefs are required');
  const vertical = dataset.levels.find(level => level.value === depth);
  if (!vertical) throw new RangeError(`unavailable depth: ${depth}`);
  return Object.freeze({ schemaVersion:'8.0', layerId:'ocean.current', datasetId:dataset.datasetId, domain:'OCEAN', renderer:'FLOW', unit:'m/s', vertical:structuredClone(vertical), sourceRefs:[...dataset.sourceRefs], followMeaning:'VISUAL_ADVECTION_NOT_PREDICTED_TRAJECTORY' });
}
