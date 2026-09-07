import { clamp, fnv1a64, stableStringify } from '../core/math.js';

/**
 * Generates a deterministic visual-detail contract from Cloud State.
 * It does not create new meteorological structures or alter cloud coverage.
 */
export function proceduralCloudDetailPlan({
  tileId,
  validAt,
  confidence,
  uncertainty,
  deviceClass = 'desktop',
  thermalState = 'NORMAL',
  horizonHours = 0,
}) {
  if (!tileId || !validAt) throw new TypeError('tileId and validAt are required');
  const c = clamp(confidence, 0, 1);
  const u = clamp(uncertainty, 0, 1);
  const deviceScale = deviceClass === 'mobile' ? 0.55 : 1;
  const thermalScale = thermalState === 'NORMAL' ? 1 : thermalState === 'BALANCED' ? 0.7 : thermalState === 'ECO' ? 0.3 : 0;
  const horizonScale = horizonHours <= 72 ? 1 : horizonHours <= 168 ? 0.65 : 0.25;
  const detailBudget = clamp(c * (1 - u) * deviceScale * thermalScale * horizonScale, 0, 1);
  return Object.freeze({
    schemaVersion: 'earthus.cloud-procedural-detail.v2.0',
    seed: fnv1a64(stableStringify({ tileId, validAt })).slice(0, 16),
    detailBudget,
    octaves: detailBudget >= 0.75 ? 5 : detailBudget >= 0.45 ? 3 : detailBudget > 0 ? 1 : 0,
    microShadow: detailBudget >= 0.65 && horizonHours <= 72,
    meteorologicalMeaning: 'NONE_VISUAL_ONLY',
    mayChangeCoverage: false,
  });
}
