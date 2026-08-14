// Ocean Core v1 — 활동 점수보다 먼저 적용하는 안전 hard gate.
//
// 결과가 NO_BLOCKING_EVIDENCE여도 "안전"을 뜻하지 않는다. 공식 자료에서 현재 차단 근거를
// 찾지 못했다는 뜻일 뿐이다. 자료가 없거나 stale이면 점수·출발 CTA를 모두 보류한다.

import { OCEAN_METRIC, OCEAN_QUALITY } from './observation-contract.js';

export const OCEAN_SAFETY_STATE = Object.freeze({
  BLOCKED: 'BLOCKED',
  UNKNOWN: 'UNKNOWN',
  NO_BLOCKING_EVIDENCE: 'NO_BLOCKING_EVIDENCE',
});

const REQUIRED_KINDS = Object.freeze(['LIGHTNING', 'TYPHOON', 'CLOSURE']);
const USABLE_QUALITY = new Set([OCEAN_QUALITY.FRESH, OCEAN_QUALITY.AGING]);
const ACTIVE = new Set(['ACTIVE', 'WARNING', 'DANGER', 'CLOSED']);

function result(state, reasons, evidence) {
  return Object.freeze({
    schema: 'earthus.ocean-safety-gate.v1',
    state,
    reasons: Object.freeze(reasons),
    scoreAllowed: state === OCEAN_SAFETY_STATE.NO_BLOCKING_EVIDENCE,
    departureCtaAllowed: state === OCEAN_SAFETY_STATE.NO_BLOCKING_EVIDENCE,
    positiveRecommendationAllowed: false,
    safeClaimAllowed: false,
    evidence: Object.freeze(evidence),
  });
}

function evidenceUsable(item) {
  return !!item?.official && USABLE_QUALITY.has(item?.freshness?.status);
}

export function evaluateOceanSafety({
  evidence = [], waveObservation = null, extremeWavePolicy = null,
} = {}) {
  const indexed = new Map((Array.isArray(evidence) ? evidence : [])
    .filter(item => item?.kind).map(item => [String(item.kind), item]));
  const preserved = [...indexed.values()].map(item => Object.freeze({ ...item }));
  const blocked = [];
  const unknown = [];

  for (const kind of REQUIRED_KINDS) {
    const item = indexed.get(kind);
    if (!item) {
      unknown.push(`${kind}_EVIDENCE_MISSING`);
      continue;
    }
    if (!evidenceUsable(item)) {
      unknown.push(`${kind}_${item?.freshness?.status || 'UNVERIFIED'}`);
      continue;
    }
    if (ACTIVE.has(item.state)) blocked.push(`${kind}_ACTIVE`);
    else if (item.state !== 'INACTIVE') unknown.push(`${kind}_STATE_UNKNOWN`);
  }

  if (extremeWavePolicy?.status !== 'APPROVED'
      || !Number.isFinite(Number(extremeWavePolicy?.thresholdM))
      || Number(extremeWavePolicy.thresholdM) <= 0) {
    unknown.push('EXTREME_WAVE_POLICY_UNAPPROVED');
  } else if (waveObservation?.metric !== OCEAN_METRIC.WAVE_HEIGHT
      || !USABLE_QUALITY.has(waveObservation?.quality)
      || !Number.isFinite(Number(waveObservation?.value))) {
    unknown.push('EXTREME_WAVE_EVIDENCE_MISSING');
  } else if (Number(waveObservation.value) >= Number(extremeWavePolicy.thresholdM)) {
    blocked.push('EXTREME_WAVE_ACTIVE');
  }

  if (blocked.length) return result(OCEAN_SAFETY_STATE.BLOCKED, blocked, preserved);
  if (unknown.length) return result(OCEAN_SAFETY_STATE.UNKNOWN, unknown, preserved);
  return result(OCEAN_SAFETY_STATE.NO_BLOCKING_EVIDENCE,
    ['NO_BLOCKING_EVIDENCE_NOT_SAFE_CLAIM'], preserved);
}

function gradeFor(score) {
  if (score >= 80) return 'EXCELLENT';
  if (score >= 65) return 'GOOD';
  if (score >= 45) return 'FAIR';
  return 'POOR';
}

/** 후보 점수가 있어도 hard gate가 열리지 않으면 화면으로 전달하지 않는다. */
export function applyOceanSafetyGate({ candidateScore = null, safety } = {}) {
  const allowed = safety?.state === OCEAN_SAFETY_STATE.NO_BLOCKING_EVIDENCE;
  const numeric = candidateScore !== null && candidateScore !== undefined && candidateScore !== ''
    && Number.isFinite(Number(candidateScore))
    && Number(candidateScore) >= 0 && Number(candidateScore) <= 100;
  const score = allowed && numeric ? Number(candidateScore) : null;
  return Object.freeze({
    schema: 'earthus.ocean-activity-gated-result.v1',
    status: !allowed ? safety?.state || OCEAN_SAFETY_STATE.UNKNOWN : (numeric ? 'READY' : 'UNKNOWN'),
    score,
    grade: score == null ? 'UNKNOWN' : gradeFor(score),
    scoreHidden: score == null,
    departureCtaAllowed: !!(allowed && numeric && safety.departureCtaAllowed),
    positiveRecommendationAllowed: false,
    safeClaimAllowed: false,
    reason: !allowed ? (safety?.reasons?.[0] || 'SAFETY_UNKNOWN')
      : (numeric ? 'SCORE_AVAILABLE_WITHOUT_SAFE_CLAIM' : 'ACTIVITY_SCORE_UNKNOWN'),
    safety: safety || null,
  });
}
