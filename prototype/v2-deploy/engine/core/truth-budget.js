import { DATA_STATE, EVIDENCE_KIND, TRUTH_FIDELITY } from './constants.js';
import { clamp } from './math.js';

const ORDER = Object.freeze([
  TRUTH_FIDELITY.NONE,
  TRUTH_FIDELITY.SUMMARY,
  TRUTH_FIDELITY.AGGREGATE,
  TRUTH_FIDELITY.GRID,
  TRUTH_FIDELITY.GEOMETRY,
  TRUTH_FIDELITY.PROBABILISTIC_VOLUME,
  TRUTH_FIDELITY.PRECISION,
]);

function minFidelity(left, right) {
  return ORDER[Math.min(ORDER.indexOf(left), ORDER.indexOf(right))];
}

export function calculateTruthBudget({
  evidenceKind,
  dataState,
  confidence,
  uncertainty,
  spatialResolutionM,
  geometryAuthoritative = false,
  actualGrid = false,
  sourceCount = 1,
  rightsAllowDisplay = true,
  rightsAllowDerivative = true,
  deviceClass = 'desktop',
  thermalState = 'NORMAL',
}) {
  if (!rightsAllowDisplay || dataState === DATA_STATE.UNAVAILABLE) {
    return Object.freeze({ maxFidelity: TRUTH_FIDELITY.NONE, detailScale: 0, reasonCodes: Object.freeze(['DISPLAY_BLOCKED_OR_UNAVAILABLE']) });
  }
  const reasons = [];
  let fidelity = TRUTH_FIDELITY.SUMMARY;
  const c = Number.isFinite(confidence) ? clamp(confidence, 0, 1) : 0;
  const u = Number.isFinite(uncertainty) ? clamp(uncertainty, 0, 1) : 1;

  if (actualGrid && Number.isFinite(spatialResolutionM)) fidelity = TRUTH_FIDELITY.GRID;
  else if (geometryAuthoritative) fidelity = TRUTH_FIDELITY.GEOMETRY;
  else fidelity = TRUTH_FIDELITY.AGGREGATE;

  if ([EVIDENCE_KIND.SIMULATION, EVIDENCE_KIND.EARTHUS_FORECAST, EVIDENCE_KIND.PROVIDER_FORECAST, EVIDENCE_KIND.OFFICIAL_FORECAST].includes(evidenceKind)) {
    fidelity = minFidelity(fidelity, TRUTH_FIDELITY.PROBABILISTIC_VOLUME);
    reasons.push('FORECAST_OR_SIMULATION_STYLE_REQUIRED');
  }
  if (evidenceKind === EVIDENCE_KIND.ESTIMATED_DISTRIBUTION) {
    fidelity = minFidelity(fidelity, TRUTH_FIDELITY.GRID);
    reasons.push('ESTIMATED_DISTRIBUTION_BADGE_REQUIRED');
  }
  if (!rightsAllowDerivative) {
    fidelity = minFidelity(fidelity, TRUTH_FIDELITY.AGGREGATE);
    reasons.push('DERIVATIVE_RIGHTS_BLOCKED');
  }
  if (dataState === DATA_STATE.STALE || dataState === DATA_STATE.DEGRADED) {
    fidelity = minFidelity(fidelity, TRUTH_FIDELITY.AGGREGATE);
    reasons.push(`DATA_${dataState}`);
  }
  if (c < 0.3 || u > 0.75) {
    fidelity = minFidelity(fidelity, TRUTH_FIDELITY.SUMMARY);
    reasons.push('LOW_CONFIDENCE_OR_HIGH_UNCERTAINTY');
  }
  if (sourceCount < 1) {
    fidelity = TRUTH_FIDELITY.NONE;
    reasons.push('NO_SOURCE');
  }
  if (deviceClass === 'mobile' && [TRUTH_FIDELITY.PRECISION, TRUTH_FIDELITY.PROBABILISTIC_VOLUME].includes(fidelity)) {
    fidelity = TRUTH_FIDELITY.GEOMETRY;
    reasons.push('MOBILE_FIDELITY_CAP');
  }
  if (['ECO', 'SAFE'].includes(thermalState)) {
    fidelity = minFidelity(fidelity, thermalState === 'SAFE' ? TRUTH_FIDELITY.SUMMARY : TRUTH_FIDELITY.AGGREGATE);
    reasons.push(`THERMAL_${thermalState}`);
  }
  const detailScale = clamp((0.25 + 0.75 * c) * (1 - 0.7 * u), 0.05, 1);
  return Object.freeze({ maxFidelity: fidelity, detailScale, reasonCodes: Object.freeze(reasons) });
}

export function mayRenderFinePopulationTowers(budget, { actualGrid }) {
  return actualGrid === true && [TRUTH_FIDELITY.GRID, TRUTH_FIDELITY.PRECISION].includes(budget?.maxFidelity);
}
