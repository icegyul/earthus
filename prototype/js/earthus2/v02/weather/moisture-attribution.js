import { clamp } from '../core/math.js';

export function moistureFluxContribution({ trajectoryOverlap, fluxConvergence, tpwAnomaly, verticalAscent, sstSupport, radarGrowth, counterDryAir = 0 }) {
  const values = { trajectoryOverlap, fluxConvergence, tpwAnomaly, verticalAscent, sstSupport, radarGrowth, counterDryAir };
  for (const [key, value] of Object.entries(values)) if (!Number.isFinite(value)) throw new TypeError(`${key} must be finite`);
  const support = 0.22 * clamp(trajectoryOverlap, 0, 1)
    + 0.24 * clamp(fluxConvergence, 0, 1)
    + 0.16 * clamp(tpwAnomaly, 0, 1)
    + 0.18 * clamp(verticalAscent, 0, 1)
    + 0.08 * clamp(sstSupport, 0, 1)
    + 0.12 * clamp(radarGrowth, 0, 1);
  const score = clamp(support - 0.45 * clamp(counterDryAir, 0, 1), 0, 1);
  const requiredCore = trajectoryOverlap >= 0.5 && fluxConvergence >= 0.45 && verticalAscent >= 0.35;
  return Object.freeze({
    score,
    state: requiredCore && score >= 0.65 ? 'SUPPORTED_CONTRIBUTION' : score >= 0.4 ? 'POSSIBLE_CONTRIBUTION' : 'INSUFFICIENT_EVIDENCE',
    causalLanguageAllowed: requiredCore && score >= 0.65,
    sstOnlyProhibited: true,
  });
}
