// Ocean Surf v1 shadow — 승인된 정책과 같은 시각의 evidence가 있을 때만 점수를 계산한다.

import { buildOceanActivityInputs, OCEAN_METRIC } from './observation-contract.js';
import { applyOceanSafetyGate, OCEAN_SAFETY_STATE } from './safety-gate.js';

export const OCEAN_SURF_POLICY_SCHEMA = 'earthus.ocean-surf-scoring-policy.v1';
export const OCEAN_SURF_DECISION_SCHEMA = 'earthus.ocean-surf-decision.v1';
const AXIS_KINDS = new Set(['METRIC', 'ANGLE_GAP']);

const freeze = value => {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
};

function angleGap(a, b) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return null;
  const delta = Math.abs(Number(a) - Number(b)) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function bandsValid(bands) {
  if (!Array.isArray(bands) || !bands.length) return false;
  let previousMax = -Infinity;
  for (const band of bands) {
    const min = Number(band?.min), max = Number(band?.max), score = Number(band?.score);
    if (![min, max, score].every(Number.isFinite) || min >= max || min < previousMax
        || score < 0 || score > 100) return false;
    previousMax = max;
  }
  return true;
}

export function validateSurfScoringPolicy(policy) {
  const errors = [];
  if (policy?.schema !== OCEAN_SURF_POLICY_SCHEMA || policy?.revision !== 1) {
    errors.push('SURF_POLICY_SCHEMA_INVALID');
  }
  if (policy?.status !== 'APPROVED') errors.push('SURF_POLICY_NOT_APPROVED');
  if (!policy?.effectiveAt || !policy?.approvedBy || !Array.isArray(policy?.sourceRefs)
      || !policy.sourceRefs.length) errors.push('SURF_POLICY_APPROVAL_EVIDENCE_MISSING');
  const skills = policy?.skills && typeof policy.skills === 'object' ? policy.skills : {};
  if (!Object.keys(skills).length) errors.push('SURF_POLICY_SKILLS_EMPTY');
  for (const [skill, config] of Object.entries(skills)) {
    if (!/^[A-Z][A-Z0-9_]{2,31}$/.test(skill)) errors.push(`SURF_SKILL_INVALID:${skill}`);
    const axes = Array.isArray(config?.axes) ? config.axes : [];
    if (!axes.length) errors.push(`SURF_AXES_EMPTY:${skill}`);
    let weightSum = 0;
    const axisIds = new Set();
    for (const axis of axes) {
      if (!axis?.id || axisIds.has(axis.id)) errors.push(`SURF_AXIS_ID_INVALID:${skill}`);
      axisIds.add(axis?.id);
      if (!AXIS_KINDS.has(axis?.kind)) errors.push(`SURF_AXIS_KIND_INVALID:${skill}:${axis?.id}`);
      if (!Object.values(OCEAN_METRIC).includes(axis?.metric)) {
        errors.push(`SURF_AXIS_METRIC_INVALID:${skill}:${axis?.id}`);
      }
      const weight = Number(axis?.weight);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 1) {
        errors.push(`SURF_AXIS_WEIGHT_INVALID:${skill}:${axis?.id}`);
      } else weightSum += weight;
      if (!bandsValid(axis?.bands)) errors.push(`SURF_AXIS_BANDS_INVALID:${skill}:${axis?.id}`);
    }
    if (Math.abs(weightSum - 1) > 0.000001) errors.push(`SURF_AXIS_WEIGHT_SUM_INVALID:${skill}`);
  }
  return freeze({ valid: errors.length === 0, errors });
}

function bandScore(value, bands) {
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    if (value >= Number(band.min)
        && (value < Number(band.max) || (index === bands.length - 1 && value === Number(band.max)))) {
      return { score: Number(band.score), band: band.label || `${band.min}-${band.max}` };
    }
  }
  return null;
}

function axisValue(axis, input, spot) {
  if (!input?.observation) return null;
  if (axis.kind === 'METRIC') return Number(input.value);
  if (axis.kind === 'ANGLE_GAP') return angleGap(input.value, spot?.facingDeg);
  return null;
}

export function scoreSurfFrame({ observations = [], spot = null, skill = null, policy = null } = {}) {
  const validation = validateSurfScoringPolicy(policy);
  const config = validation.valid ? policy.skills?.[skill] : null;
  if (!validation.valid || !config) return freeze({
    state: 'POLICY_UNAPPROVED', score: null, confidence: 0,
    reasons: config ? validation.errors : [...validation.errors, 'SURF_SKILL_UNAPPROVED'],
    explanation: [], inputKey: null,
  });
  if (!Number.isFinite(Number(spot?.facingDeg)) || Number(spot.facingDeg) < 0
      || Number(spot.facingDeg) > 360) return freeze({
    state: 'INPUT_UNKNOWN', score: null, confidence: 0,
    reasons: ['SURF_SPOT_FACING_MISSING'], explanation: [], inputKey: null,
  });
  const metrics = [...new Set(config.axes.map(axis => axis.metric))];
  const selected = buildOceanActivityInputs(observations, metrics);
  const explanation = [], missing = [];
  let weighted = 0;
  for (const axis of config.axes) {
    const input = selected.inputs[axis.metric];
    const value = axisValue(axis, input, spot);
    const scored = value == null ? null : bandScore(value, axis.bands);
    if (!scored) {
      missing.push(value == null ? `${axis.id}_INPUT_MISSING` : `${axis.id}_OUTSIDE_POLICY_BANDS`);
      continue;
    }
    weighted += scored.score * Number(axis.weight);
    explanation.push({ id: axis.id, metric: axis.metric, value,
      unit: axis.kind === 'ANGLE_GAP' ? 'deg-gap' : input.observation.unit,
      band: scored.band, axisScore: scored.score, weight: Number(axis.weight),
      sourceId: input.observation.sourceId,
      validAt: input.observation.observedAt || input.observation.validFrom });
  }
  if (missing.length) return freeze({ state: 'INPUT_UNKNOWN', score: null,
    confidence: explanation.length / config.axes.length, reasons: missing, explanation, inputKey: null });
  const inputKey = explanation.map(item => [item.id, item.metric, item.value, item.sourceId, item.validAt]
    .join(':')).sort().join('|');
  return freeze({ state: 'READY', score: Math.round(weighted * 10) / 10, confidence: 1,
    reasons: ['POLICY_SCORE_NOT_SAFETY_OR_RECOMMENDATION'], explanation, inputKey });
}

export function buildSurfDecision({
  observations = [], safety = null, spot = null, skill = null, scoringPolicy = null,
  providerDisplayAllowed = false,
} = {}) {
  const scored = scoreSurfFrame({ observations, spot, skill, policy: scoringPolicy });
  const gated = applyOceanSafetyGate({ candidateScore: scored.score, safety });
  const validAt = observations.map(item => item?.validFrom || item?.observedAt).filter(Boolean).sort()[0] || null;
  return freeze({
    schema: OCEAN_SURF_DECISION_SCHEMA,
    status: providerDisplayAllowed ? gated.status : 'LOCAL_SHADOW',
    decisionState: safety?.state === OCEAN_SAFETY_STATE.BLOCKED ? 'BLOCKED'
      : safety?.state === OCEAN_SAFETY_STATE.UNKNOWN ? 'UNKNOWN' : scored.state,
    validAt, skill: skill || null,
    spot: spot ? { id: spot.id || null, label: spot.label || null, facingDeg: spot.facingDeg } : null,
    displayScore: providerDisplayAllowed ? gated.score : null,
    shadowScore: gated.score,
    grade: providerDisplayAllowed ? gated.grade : 'UNKNOWN',
    confidence: scored.confidence,
    explanation: scored.explanation,
    inputKey: scored.inputKey,
    reasons: [...scored.reasons, ...(safety?.reasons || ['SAFETY_UNKNOWN']),
      ...(!providerDisplayAllowed ? ['PROVIDER_DISPLAY_RIGHTS_UNAPPROVED'] : [])],
    safeClaimAllowed: false,
    positiveRecommendationAllowed: false,
    departureCtaAllowed: false,
    alertSendAllowed: false,
  });
}

export function buildSurfTimeline({
  observations = [], safetyByValidTime = {}, spot = null, skill = null, scoringPolicy = null,
  providerDisplayAllowed = false, fromMs = Date.now(), hours = 72,
} = {}) {
  const maxHours = Math.min(72, Math.max(1, Number(hours) || 72));
  const grouped = new Map();
  for (const observation of observations) {
    const validAt = observation?.validFrom || observation?.observedAt;
    const at = Date.parse(validAt || '');
    if (!Number.isFinite(at) || at < Number(fromMs) - 5 * 60_000
        || at > Number(fromMs) + maxHours * 3600_000) continue;
    const list = grouped.get(validAt) || [];
    list.push(observation); grouped.set(validAt, list);
  }
  const frames = [...grouped.entries()].sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .slice(0, maxHours).map(([validAt, frameObservations]) => buildSurfDecision({
      observations: frameObservations, safety: safetyByValidTime[validAt] || null,
      spot, skill, scoringPolicy, providerDisplayAllowed,
    }));
  return freeze({ schema: 'earthus.ocean-surf-timeline.v1', status: providerDisplayAllowed
    ? 'READY_FOR_REVIEW' : 'LOCAL_SHADOW', hours: maxHours, frames,
    complete: frames.length === maxHours,
    missingSafetyFrames: frames.filter(frame => frame.decisionState === 'UNKNOWN').length });
}
