// Earthus Personalization Engine v1 — 공용 Base를 바꾸지 않는 user-scoped private delta.

import {
  PERSONALIZATION_CONSENT_VERSION,
  PERSONALIZATION_POLICY,
  PERSONALIZATION_POLICY_VERSION,
  PERSONAL_PREFERENCE_SCHEMA_VERSION,
  PREFERENCE_LEVELS,
  allowedPersonalizationKeys,
} from './personalization-policy.js';

export const PERSONALIZATION_ENGINE_VERSION = 'earthus.personalization-engine.v1.0.0';

const SUBJECT_PATTERN = /^sub_[a-z0-9_-]{8,80}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FORBIDDEN_KEYS = new Set([
  'health', 'healthStatus', 'disability', 'pregnancy', 'religion', 'politicalView',
  'preciseLocationHistory', 'locationHistory', 'medical', 'diagnosis', 'freeTextProfile',
  'inferredFrom', 'behavioralProfile', 'behaviorHistory', 'rawLocation',
]);

const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function hasForbiddenInference(value, path = '') {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key)) return next;
    const nested = hasForbiddenInference(child, next);
    if (nested) return nested;
  }
  return null;
}

function validUtc(value) {
  return typeof value === 'string' && UTC_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function disabledResult(baseDecision, reason) {
  const rawScore = baseDecision?.axes?.activityFit?.score;
  const score = rawScore !== null && rawScore !== undefined && rawScore !== ''
    && Number.isFinite(Number(rawScore)) ? Number(rawScore) : null;
  return {
    schemaVersion: 'earthus.personalization-result.v1',
    engineVersion: PERSONALIZATION_ENGINE_VERSION,
    policyVersion: PERSONALIZATION_POLICY_VERSION,
    releaseMode: PERSONALIZATION_POLICY.releaseMode,
    status: reason === 'PERSONALIZATION_DISABLED_BY_USER' ? 'DISABLED' : 'UNKNOWN',
    reasonCodes: [reason],
    baseDecisionId: baseDecision?.decisionId || null,
    baseScore: score,
    personalizedScore: score,
    rawDelta: 0,
    boundedDelta: 0,
    capApplied: false,
    contributions: [],
    protectedAxes: ['SAFETY', 'FORECAST_CONFIDENCE', 'CROWD', 'AVAILABILITY'],
    cache: {
      scope: 'USER_SCOPED_PRIVATE', shared: false, userSpecific: true,
      ttlSeconds: PERSONALIZATION_POLICY.privateCacheTtlSeconds,
      responseCacheControl: PERSONALIZATION_POLICY.responseCacheControl,
      key: null,
    },
  };
}

function contributionMap(baseDecision) {
  return new Map((baseDecision?.axes?.activityFit?.contributions || [])
    .map(item => [item.factor, item]));
}

function normalizedDeficit(definition, baseContributions) {
  const relevant = definition.factors.map(key => baseContributions.get(key)).filter(Boolean);
  if (!relevant.length) return null;
  return clamp(1 - Math.min(...relevant.map(item => Number(item.normalized))), 0, 1);
}

function rawSeverity(definition, baseContributions) {
  const factor = baseContributions.get(definition.factors[0]);
  if (!factor || !Number.isFinite(Number(factor.rawValue))) return null;
  const value = Number(factor.rawValue);
  if (definition.mode === 'ABOVE_RAW') {
    return clamp((value - definition.baseline) / (definition.severeAt - definition.baseline), 0, 1);
  }
  if (definition.mode === 'BELOW_RAW') {
    return clamp((definition.baseline - value) / (definition.baseline - definition.severeAt), 0, 1);
  }
  return null;
}

function localMinute(instant, utcOffsetMinutes) {
  const shifted = new Date(Date.parse(instant) + utcOffsetMinutes * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function minuteInWindow(minute, start, end) {
  return start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
}

function preferencePoints(entry, definition, baseDecision, baseContributions) {
  const multiplier = PREFERENCE_LEVELS[entry.level];
  if (!multiplier) return { status: 'INVALID', reason: `PREFERENCE_LEVEL_INVALID:${entry.key}` };
  let severity = null;
  let points = 0;
  if (definition.mode === 'NORMALIZED_DEFICIT') {
    severity = normalizedDeficit(definition, baseContributions);
    if (severity == null) return { status: 'MISSING', reason: `PREFERENCE_FACTOR_MISSING:${entry.key}` };
    points = -definition.maxNegative * multiplier * severity;
  } else if (definition.mode === 'ABOVE_RAW' || definition.mode === 'BELOW_RAW') {
    severity = rawSeverity(definition, baseContributions);
    if (severity == null) return { status: 'MISSING', reason: `PREFERENCE_FACTOR_MISSING:${entry.key}` };
    points = -definition.maxNegative * multiplier * severity;
  } else if (definition.mode === 'TIME_WINDOW_MATCH') {
    const start = Number(entry?.value?.startLocalMinute);
    const end = Number(entry?.value?.endLocalMinute);
    const offset = Number(entry?.value?.utcOffsetMinutes);
    if (![start, end, offset].every(Number.isFinite)
        || start < 0 || start > 1439 || end < 0 || end > 1439 || offset < -840 || offset > 840) {
      return { status: 'INVALID', reason: `TIME_PREFERENCE_INVALID:${entry.key}` };
    }
    const midpoint = new Date((Date.parse(baseDecision.timeWindow.start) + Date.parse(baseDecision.timeWindow.end)) / 2).toISOString();
    severity = minuteInWindow(localMinute(midpoint, offset), start, end) ? 1 : 0;
    points = definition.maxPositive * multiplier * severity;
  } else if (definition.mode === 'DURATION_MATCH') {
    const min = Number(entry?.value?.minMinutes);
    const max = Number(entry?.value?.maxMinutes);
    if (![min, max].every(Number.isFinite) || min < 1 || max < min || max > 1440) {
      return { status: 'INVALID', reason: `DURATION_PREFERENCE_INVALID:${entry.key}` };
    }
    const duration = (Date.parse(baseDecision.timeWindow.end) - Date.parse(baseDecision.timeWindow.start)) / 60_000;
    severity = duration >= min && duration <= max ? 1 : 0;
    points = definition.maxPositive * multiplier * severity;
  }
  return { status: 'OK', severity: round(severity, 4), points: round(points) };
}

/** 사용자가 직접 동의·입력한 취향만 Base 바깥에서 계산한다. */
export function applyPersonalization({ baseDecision, preferenceSet, subjectRef } = {}) {
  const forbidden = hasForbiddenInference(preferenceSet);
  if (forbidden) throw new Error(`SENSITIVE_INFERENCE_FORBIDDEN:${forbidden}`);
  if (!baseDecision || baseDecision.schemaVersion !== 'earthus.activity-decision.v1'
      || baseDecision.cache?.scope !== 'PUBLIC_SHARED_BASE'
      || baseDecision.cache?.userSpecific !== false) {
    throw new Error('PUBLIC_BASE_DECISION_REQUIRED');
  }
  if (!SUBJECT_PATTERN.test(String(subjectRef || ''))) throw new Error('OPAQUE_SUBJECT_REF_REQUIRED');
  if (preferenceSet?.schemaVersion !== PERSONAL_PREFERENCE_SCHEMA_VERSION) {
    return disabledResult(baseDecision, 'PREFERENCE_SCHEMA_UNSUPPORTED');
  }
  if (preferenceSet.enabled !== true) return disabledResult(baseDecision, 'PERSONALIZATION_DISABLED_BY_USER');
  const consent = preferenceSet.consent || {};
  if (consent.status !== 'GRANTED' || consent.version !== PERSONALIZATION_CONSENT_VERSION
      || !validUtc(consent.grantedAt)) {
    return disabledResult(baseDecision, 'PERSONALIZATION_CONSENT_MISSING');
  }
  if (validUtc(baseDecision.evaluatedAt)
      && Date.parse(consent.grantedAt) > Date.parse(baseDecision.evaluatedAt)) {
    return disabledResult(baseDecision, 'PERSONALIZATION_CONSENT_NOT_ACTIVE_AT_EVALUATION');
  }
  if (baseDecision.axes?.activityFit?.status !== 'COMPLETE'
      || !Number.isFinite(Number(baseDecision.axes.activityFit.score))) {
    return disabledResult(baseDecision, 'BASE_ACTIVITY_INCOMPLETE');
  }
  const profileId = baseDecision.activityProfile?.id;
  const allowed = allowedPersonalizationKeys(profileId);
  if (!allowed) throw new Error(`PERSONALIZATION_PROFILE_UNKNOWN:${profileId || 'missing'}`);
  const entries = Array.isArray(preferenceSet.entries) ? preferenceSet.entries : [];
  if (entries.length > 12) return disabledResult(baseDecision, 'PREFERENCE_ENTRY_LIMIT_EXCEEDED');
  const seen = new Set();
  const errors = [];
  const contributions = [];
  const baseContributions = contributionMap(baseDecision);

  for (const entry of entries) {
    const key = String(entry?.key || '');
    if (seen.has(key)) { errors.push(`PREFERENCE_DUPLICATE:${key}`); continue; }
    seen.add(key);
    if (!allowed.includes(key)) { errors.push(`PREFERENCE_NOT_ALLOWED:${profileId}:${key}`); continue; }
    if (entry?.source !== 'EXPLICIT_USER_INPUT') { errors.push(`PREFERENCE_SOURCE_FORBIDDEN:${key}`); continue; }
    if (!entry?.revision) { errors.push(`PREFERENCE_REVISION_MISSING:${key}`); continue; }
    const definition = PERSONALIZATION_POLICY.definitions[key];
    const result = preferencePoints(entry, definition, baseDecision, baseContributions);
    if (result.status !== 'OK') { errors.push(result.reason); continue; }
    if (result.points === 0) continue;
    contributions.push({
      preferenceKey: key,
      labelKo: definition.labelKo,
      labelEn: definition.labelEn,
      level: entry.level,
      severity: result.severity,
      points: result.points,
      reasonCode: definition.reasonCode,
      source: 'EXPLICIT_USER_INPUT',
      revision: String(entry.revision),
    });
  }

  if (errors.length) {
    const out = disabledResult(baseDecision, 'PERSONALIZATION_INPUT_INVALID');
    out.reasonCodes = ['PERSONALIZATION_INPUT_INVALID', ...[...new Set(errors)].sort()];
    return out;
  }
  const rawDelta = round(contributions.reduce((sum, item) => sum + item.points, 0));
  const limit = PERSONALIZATION_POLICY.maxAbsoluteDeltaCandidate;
  const boundedDelta = round(clamp(rawDelta, -limit, limit));
  const baseScore = Number(baseDecision.axes.activityFit.score);
  const personalizedScore = round(clamp(baseScore + boundedDelta, 0, 100));
  const revisions = entries.map(item => `${encodeURIComponent(item.key)}:${encodeURIComponent(String(item.revision))}`).sort();
  const preferenceVersion = String(preferenceSet.preferenceVersion || '').trim();
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(preferenceVersion)) {
    const out = disabledResult(baseDecision, 'PREFERENCE_VERSION_MISSING');
    return out;
  }
  const cacheMaterial = JSON.stringify({
    subjectRef,
    baseDecisionId: baseDecision.decisionId,
    preferenceVersion,
    policyVersion: PERSONALIZATION_POLICY_VERSION,
    revisions,
  });
  return {
    schemaVersion: 'earthus.personalization-result.v1',
    engineVersion: PERSONALIZATION_ENGINE_VERSION,
    policyVersion: PERSONALIZATION_POLICY_VERSION,
    releaseMode: PERSONALIZATION_POLICY.releaseMode,
    status: contributions.length ? 'APPLIED' : 'NO_EFFECT',
    reasonCodes: contributions.length ? ['EXPLICIT_PREFERENCES_APPLIED'] : ['EXPLICIT_PREFERENCES_NO_EFFECT'],
    baseDecisionId: baseDecision.decisionId,
    baseScore,
    personalizedScore,
    rawDelta,
    boundedDelta,
    capApplied: rawDelta !== boundedDelta,
    contributions,
    protectedAxes: ['SAFETY', 'FORECAST_CONFIDENCE', 'CROWD', 'AVAILABILITY'],
    cache: {
      scope: 'USER_SCOPED_PRIVATE', shared: false, userSpecific: true,
      ttlSeconds: PERSONALIZATION_POLICY.privateCacheTtlSeconds,
      responseCacheControl: PERSONALIZATION_POLICY.responseCacheControl,
      key: `personal_${fnv1a64(cacheMaterial)}`,
    },
  };
}
