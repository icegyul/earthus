// Earthus Decision Core v1 — 공유 가능한 Base Activity Score만 계산한다.
// 개인화, 예약 재고, 폐쇄, 특보를 점수로 추정하지 않는다.

import {
  ACTIVITY_PROFILE_POLICY,
  ACTIVITY_PROFILE_POLICY_VERSION,
  getActivityProfile,
  normalizeActivityFactor,
} from './activity-profile-policy.js';
import { CONFIDENCE_DIMENSIONS, FORECAST_CONFIDENCE_VERSION } from './forecast-confidence.js';

export const ACTIVITY_DECISION_VERSION = 'earthus.activity-decision.v1.0.0';

const PERSONAL_KEYS = new Set([
  'userId', 'user', 'preference', 'preferences', 'personalization',
  'personalizedScore', 'personalAdjustment', 'boundedDelta',
]);

const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

function hasForbiddenPersonalData(value, path = '') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (PERSONAL_KEYS.has(key)) return next;
    if (child && typeof child === 'object') {
      const nested = hasForbiddenPersonalData(child, next);
      if (nested) return nested;
    }
  }
  return null;
}

function validInstant(value) {
  return typeof value === 'string'
    && /(Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function signalRevision(signal) {
  const id = String(signal?.id || '').trim();
  const revision = String(signal?.revision || '').trim();
  return id && revision ? `${encodeURIComponent(id)}:${encodeURIComponent(revision)}` : null;
}

function unknownAxis(axis, reason) {
  return {
    axis,
    status: 'UNKNOWN',
    value: null,
    reasonCodes: [reason],
    evidence: null,
  };
}

function evidenceAxis(axis, evidence) {
  if (!evidence) return unknownAxis(axis, `${axis}_EVIDENCE_MISSING`);
  const complete = evidence.sourceId && evidence.observedAt && evidence.revision
    && evidence.value !== undefined && evidence.value !== null;
  if (!complete || !validInstant(evidence.observedAt)) {
    return unknownAxis(axis, `${axis}_EVIDENCE_INCOMPLETE`);
  }
  return {
    axis,
    status: 'OBSERVED',
    value: evidence.value,
    reasonCodes: [],
    evidence: {
      sourceId: String(evidence.sourceId),
      observedAt: evidence.observedAt,
      revision: String(evidence.revision),
      n: Number.isInteger(evidence.n) ? evidence.n : null,
    },
  };
}

function axisEvidenceRevision(axis, evidence) {
  if (!evidence?.sourceId || !evidence?.revision) return null;
  return `${axis.toLowerCase()}:${encodeURIComponent(String(evidence.sourceId))}:${encodeURIComponent(String(evidence.revision))}`;
}

function grade(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

function baseActivityFit(profile, signals) {
  const byFactor = new Map();
  const duplicateFactors = new Set();
  for (const signal of Array.isArray(signals) ? signals : []) {
    const key = String(signal?.factor || '').trim();
    if (!key) continue;
    if (byFactor.has(key)) duplicateFactors.add(key);
    else byFactor.set(key, signal);
  }

  const contributions = [];
  const errors = [];
  for (const definition of profile.factors) {
    const signal = byFactor.get(definition.key);
    if (duplicateFactors.has(definition.key)) {
      errors.push(`DUPLICATE_FACTOR:${definition.key}`);
      continue;
    }
    if (!signal || signal.value === null || signal.value === undefined || signal.value === '') {
      errors.push(`REQUIRED_FACTOR_MISSING:${definition.key}`);
      continue;
    }
    if (String(signal.unit || '') !== definition.unit) {
      errors.push(`UNIT_MISMATCH:${definition.key}:${signal.unit || 'missing'}:${definition.unit}`);
      continue;
    }
    if (!signalRevision(signal)) {
      errors.push(`SIGNAL_ID_REVISION_MISSING:${definition.key}`);
      continue;
    }
    const rawValue = Number(signal.value);
    if (!Number.isFinite(rawValue)) {
      errors.push(`FACTOR_NOT_FINITE:${definition.key}`);
      continue;
    }
    if (rawValue < definition.range[0] || rawValue > definition.range[1]) {
      errors.push(`FACTOR_OUT_OF_RANGE:${definition.key}`);
      continue;
    }
    const normalized = normalizeActivityFactor(rawValue, definition.curve);
    const points = round(normalized * definition.weight * 100);
    contributions.push({
      factor: definition.key,
      label: definition.label,
      rawValue,
      unit: definition.unit,
      aggregation: definition.aggregation,
      normalized: round(normalized, 4),
      weight: definition.weight,
      points,
      signalIds: [String(signal.id)],
      reasonCode: `FIT_CURVE:${profile.id}:${definition.key}`,
      basis: definition.basis,
    });
  }

  if (errors.length) {
    return {
      status: 'UNKNOWN',
      score: null,
      grade: null,
      contributions,
      reasonCodes: [...new Set(errors)].sort(),
    };
  }
  const score = round(contributions.reduce((sum, item) => sum + item.points, 0));
  return {
    status: 'COMPLETE',
    score,
    grade: grade(score),
    contributions,
    reasonCodes: ['PRODUCT_FIT_CURVE_CALIBRATION'],
  };
}

function normalizeSafety(safety) {
  if (!safety || typeof safety !== 'object') {
    return {
      engineVersion: null,
      ruleSetVersion: null,
      status: 'UNKNOWN',
      applies: null,
      blocksPositiveRecommendation: true,
      reason: 'SAFETY_EVIDENCE_MISSING',
      evidence: null,
    };
  }
  const outOfCoverage = safety.applies === false;
  return {
    engineVersion: safety.engineVersion || null,
    ruleSetVersion: safety.ruleSetVersion || safety.engineVersion || null,
    status: String(safety.status || 'UNKNOWN'),
    applies: safety.applies ?? null,
    blocksPositiveRecommendation: outOfCoverage ? true : safety.blocksPositiveRecommendation !== false,
    reason: outOfCoverage ? 'LOCAL_SAFETY_PROVIDER_MISSING' : String(safety.reason || 'SAFETY_REASON_MISSING'),
    evidence: safety.evidence || null,
  };
}

function normalizeConfidence(confidence) {
  const unknown = reason => ({
    schemaVersion: 'earthus.forecast-confidence.v1',
    engineVersion: FORECAST_CONFIDENCE_VERSION,
    confidenceLevel: 'UNKNOWN',
    score: null,
    calibratedProbability: null,
    dimensions: [],
    reasonCodes: [reason],
    modelSourceIds: [],
    inputSignalIds: [],
  });
  if (!confidence || typeof confidence !== 'object') return unknown('FORECAST_CONFIDENCE_MISSING');
  if (confidence.schemaVersion !== 'earthus.forecast-confidence.v1'
      || confidence.engineVersion !== FORECAST_CONFIDENCE_VERSION) {
    return unknown('FORECAST_CONFIDENCE_ENGINE_UNSUPPORTED');
  }
  if (confidence.calibratedProbability !== null) {
    return unknown('FORECAST_PROBABILITY_FORBIDDEN');
  }
  const allowedLevels = new Set(['HIGH', 'MEDIUM', 'LOW', 'VERY_LOW', 'UNKNOWN']);
  if (!allowedLevels.has(confidence.confidenceLevel)) return unknown('FORECAST_CONFIDENCE_LEVEL_INVALID');
  const dimensionNames = Array.isArray(confidence.dimensions)
    ? confidence.dimensions.map(item => item?.name)
    : [];
  if (dimensionNames.length !== CONFIDENCE_DIMENSIONS.length
      || CONFIDENCE_DIMENSIONS.some(name => !dimensionNames.includes(name))) {
    return unknown('FORECAST_CONFIDENCE_DIMENSIONS_INVALID');
  }
  if (confidence.confidenceLevel === 'UNKNOWN') {
    if (confidence.score !== null) return unknown('FORECAST_CONFIDENCE_UNKNOWN_WITH_SCORE');
    return { ...confidence, score: null, calibratedProbability: null };
  }
  const score = Number(confidence.score);
  const modelSourceIds = Array.isArray(confidence.modelSourceIds)
    ? [...new Set(confidence.modelSourceIds.map(String).filter(Boolean))]
    : [];
  const inputSignalIds = Array.isArray(confidence.inputSignalIds)
    ? [...new Set(confidence.inputSignalIds.map(String).filter(Boolean))]
    : [];
  if (!Number.isFinite(score) || score < 0 || score > 100
      || confidence.dimensions.some(item => item?.status !== 'KNOWN')
      || confidence.dimensions.some(item => !Number.isFinite(Number(item?.score)) || item.score < 0 || item.score > 100)
      || modelSourceIds.length < 2 || inputSignalIds.length < 2) {
    return unknown('FORECAST_CONFIDENCE_CONTRACT_INVALID');
  }
  const expectedLevel = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : score >= 40 ? 'LOW' : 'VERY_LOW';
  if (confidence.confidenceLevel !== expectedLevel) return unknown('FORECAST_CONFIDENCE_BAND_MISMATCH');
  return {
    ...confidence,
    score: round(score),
    calibratedProbability: null,
    modelSourceIds: modelSourceIds.sort(),
    inputSignalIds: inputSignalIds.sort(),
  };
}

function recommendationState({ activityFit, safety, confidence }) {
  if (safety.blocksPositiveRecommendation) {
    return { state: 'WITHHELD', reason: safety.reason || 'SAFETY_BLOCK' };
  }
  if (activityFit.status !== 'COMPLETE') {
    return { state: 'WITHHELD', reason: 'BASE_ACTIVITY_INCOMPLETE' };
  }
  if (!confidence || confidence.confidenceLevel === 'UNKNOWN' || confidence.score == null) {
    return { state: 'WITHHELD', reason: 'FORECAST_CONFIDENCE_UNKNOWN' };
  }
  if (confidence.confidenceLevel === 'LOW' || confidence.confidenceLevel === 'VERY_LOW') {
    return { state: 'WITHHELD', reason: 'FORECAST_CONFIDENCE_BELOW_RELEASE_GATE' };
  }
  if (ACTIVITY_PROFILE_POLICY.releaseMode !== 'RELEASED') {
    return { state: 'WITHHELD', reason: 'PROFILE_CALIBRATION_SHADOW' };
  }
  return { state: 'EVIDENCE_READY', reason: 'ALL_RELEASE_GATES_PASSED' };
}

/**
 * 장소+시간+활동 입력만 받는 공유 Base Decision.
 * 같은 입력은 순서와 무관하게 같은 cacheKey/decisionId를 만든다.
 */
export function evaluateBaseActivityDecision(input = {}) {
  const forbidden = hasForbiddenPersonalData(input);
  if (forbidden) throw new Error(`PERSONALIZATION_FORBIDDEN:${forbidden}`);

  const profile = getActivityProfile(input.profileId);
  if (!profile) throw new Error(`ACTIVITY_PROFILE_UNKNOWN:${input.profileId || 'missing'}`);
  const placeId = String(input.placeId || '').trim();
  if (!placeId) throw new Error('PLACE_ID_REQUIRED');
  const start = input?.timeWindow?.start;
  const end = input?.timeWindow?.end;
  if (!validInstant(start) || !validInstant(end) || Date.parse(start) >= Date.parse(end)) {
    throw new Error('TIME_WINDOW_INVALID_OR_TIMEZONE_MISSING');
  }

  const signals = Array.isArray(input.signals) ? input.signals : [];
  const factorSignalRevisions = signals.map(signalRevision).filter(Boolean);
  const safety = normalizeSafety(input.safety);
  const confidence = normalizeConfidence(input.confidence);
  const activityFit = baseActivityFit(profile, signals);
  const safetySource = String(safety?.evidence?.sourceId || safety?.evidence?.source || 'safety').trim();
  const safetyRevision = String(
    safety?.evidence?.revision || safety?.evidence?.generated || safety?.evidence?.observedAt
    || safety?.evidence?.observedKst || '',
  ).trim();
  const confidenceSignals = Array.isArray(confidence?.inputSignalIds)
    ? confidence.inputSignalIds.map(String).filter(Boolean)
    : [];
  const signalRevisions = [...new Set([
    ...factorSignalRevisions,
    ...confidenceSignals,
    ...(safetyRevision ? [`safety:${encodeURIComponent(safetySource)}:${encodeURIComponent(safetyRevision)}`] : []),
    axisEvidenceRevision('CROWD', input.crowdEvidence),
    axisEvidenceRevision('AVAILABILITY', input.availabilityEvidence),
  ].filter(Boolean))].sort();
  const cacheKey = `earthus.base-activity.v1:${JSON.stringify({
    placeId,
    timeWindow: [start, end],
    activityProfile: [profile.id, ACTIVITY_PROFILE_POLICY_VERSION],
    safetyRuleSetVersion: safety.ruleSetVersion || 'missing',
    confidenceVersion: confidence.engineVersion || 'missing',
    inputSignalRevisions: signalRevisions,
  })}`;
  const recommendation = recommendationState({ activityFit, safety, confidence });
  const scoreVisibility = safety.blocksPositiveRecommendation ? 'DEEMPHASIZED' : 'VISIBLE';

  return {
    schemaVersion: 'earthus.activity-decision.v1',
    engineVersion: ACTIVITY_DECISION_VERSION,
    decisionId: `decision_${fnv1a64(cacheKey)}`,
    cacheKey,
    evaluatedAt: validInstant(input.evaluatedAt) ? input.evaluatedAt : null,
    placeId,
    timeWindow: { start, end },
    activityProfile: {
      id: profile.id,
      label: profile.label,
      version: ACTIVITY_PROFILE_POLICY_VERSION,
      releaseMode: ACTIVITY_PROFILE_POLICY.releaseMode,
      requiredSafetyGates: [...profile.requiredSafetyGates],
    },
    axes: {
      activityFit,
      safety,
      forecastConfidence: confidence,
      crowd: evidenceAxis('CROWD', input.crowdEvidence),
      availability: evidenceAxis('AVAILABILITY', input.availabilityEvidence),
    },
    displayPolicy: {
      scoreVisibility,
      safetyFirst: true,
      positiveRecommendationAllowed: recommendation.state === 'EVIDENCE_READY',
    },
    recommendation,
    inputSignalIds: signalRevisions,
    cache: {
      scope: 'PUBLIC_SHARED_BASE',
      userSpecific: false,
      key: cacheKey,
    },
  };
}
