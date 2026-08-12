// Earthus Personalization Policy v1
//
// 받은 지적: 개인 취향을 Base Activity Score에 넣으면 공용 cache와 설명 가능성이 무너진다.
// 이 정책은 사용자가 직접 고른 취향만 별도 delta로 계산한다. ±12는 v2.3의 초기 후보이며
// 사용자 연구·분포 검증 전에는 CALIBRATION_SHADOW를 벗어나지 않는다.

export const PERSONALIZATION_POLICY_VERSION = 'earthus.personalization-policy.v1.0.0';
export const PERSONAL_PREFERENCE_SCHEMA_VERSION = 'earthus.personal-preference.v1';
export const PERSONALIZATION_CONSENT_VERSION = 'earthus.personalization-consent.v1';

export const PREFERENCE_LEVELS = Object.freeze({
  LOW: 0.4,
  MEDIUM: 0.7,
  HIGH: 1,
});

const sensitivity = ({ key, labelKo, labelEn, factors, mode = 'NORMALIZED_DEFICIT', maxNegative, ...rest }) => Object.freeze({
  key,
  labelKo,
  labelEn,
  factors,
  mode,
  maxNegative,
  sourcePolicy: 'EXPLICIT_USER_INPUT_ONLY',
  decisionClass: 'PERSONAL_DELTA_NOT_BASE_OR_SAFETY',
  ...rest,
});

export const PERSONALIZATION_POLICY = Object.freeze({
  schemaVersion: 'earthus.personalization-policy.v1',
  version: PERSONALIZATION_POLICY_VERSION,
  releaseMode: 'CALIBRATION_SHADOW',
  approvalStatus: 'USER_RESEARCH_AND_DISTRIBUTION_REVIEW_PENDING',
  effectiveAt: null,
  rollbackVersion: null,
  maxAbsoluteDeltaCandidate: 12,
  privateCacheTtlSeconds: 300,
  responseCacheControl: 'private, no-store',
  prohibitedInference: Object.freeze([
    'HEALTH_STATUS',
    'DISABILITY',
    'PREGNANCY',
    'RELIGION',
    'POLITICAL_VIEW',
    'PRECISE_LOCATION_HISTORY',
    'FREE_TEXT_PROFILE',
  ]),
  definitions: Object.freeze({
    HEAT_SENSITIVITY: sensitivity({
      key: 'HEAT_SENSITIVITY', labelKo: '더위 민감도', labelEn: 'Heat sensitivity',
      factors: ['APPARENT_TEMPERATURE'], mode: 'ABOVE_RAW', baseline: 24, severeAt: 40,
      maxNegative: 6, reasonCode: 'EXPLICIT_HEAT_SENSITIVITY',
    }),
    COLD_SENSITIVITY: sensitivity({
      key: 'COLD_SENSITIVITY', labelKo: '추위 민감도', labelEn: 'Cold sensitivity',
      factors: ['APPARENT_TEMPERATURE'], mode: 'BELOW_RAW', baseline: 12, severeAt: -10,
      maxNegative: 5, reasonCode: 'EXPLICIT_COLD_SENSITIVITY',
    }),
    RAIN_SENSITIVITY: sensitivity({
      key: 'RAIN_SENSITIVITY', labelKo: '비 민감도', labelEn: 'Rain sensitivity',
      factors: ['PRECIPITATION_AMOUNT', 'ACCUMULATED_PRECIPITATION', 'PRECIPITATION_PROBABILITY'],
      maxNegative: 5, reasonCode: 'EXPLICIT_RAIN_SENSITIVITY',
    }),
    WIND_SENSITIVITY: sensitivity({
      key: 'WIND_SENSITIVITY', labelKo: '바람 민감도', labelEn: 'Wind sensitivity',
      factors: ['WIND_SPEED', 'WIND_GUST'], maxNegative: 4,
      reasonCode: 'EXPLICIT_WIND_SENSITIVITY',
    }),
    HUMIDITY_SENSITIVITY: sensitivity({
      key: 'HUMIDITY_SENSITIVITY', labelKo: '습도 민감도', labelEn: 'Humidity sensitivity',
      factors: ['RELATIVE_HUMIDITY'], maxNegative: 3,
      reasonCode: 'EXPLICIT_HUMIDITY_SENSITIVITY',
    }),
    AIR_QUALITY_SENSITIVITY: sensitivity({
      key: 'AIR_QUALITY_SENSITIVITY', labelKo: '대기질 민감도', labelEn: 'Air-quality sensitivity',
      factors: ['AIR_QUALITY_INDEX'], maxNegative: 5,
      reasonCode: 'EXPLICIT_AIR_QUALITY_SENSITIVITY',
    }),
    SKY_CLARITY_PRIORITY: sensitivity({
      key: 'SKY_CLARITY_PRIORITY', labelKo: '맑은 하늘 우선', labelEn: 'Clear-sky priority',
      factors: ['CLOUD_COVER', 'VISIBILITY'], maxNegative: 5,
      reasonCode: 'EXPLICIT_SKY_CLARITY_PRIORITY',
    }),
    TIME_WINDOW_PREFERENCE: Object.freeze({
      key: 'TIME_WINDOW_PREFERENCE', labelKo: '선호 시간', labelEn: 'Preferred time',
      factors: [], mode: 'TIME_WINDOW_MATCH', maxPositive: 3,
      sourcePolicy: 'EXPLICIT_USER_INPUT_ONLY',
      decisionClass: 'PERSONAL_DELTA_NOT_BASE_OR_SAFETY',
      reasonCode: 'EXPLICIT_TIME_WINDOW_MATCH',
    }),
    DURATION_PREFERENCE: Object.freeze({
      key: 'DURATION_PREFERENCE', labelKo: '선호 활동 시간', labelEn: 'Preferred duration',
      factors: [], mode: 'DURATION_MATCH', maxPositive: 2,
      sourcePolicy: 'EXPLICIT_USER_INPUT_ONLY',
      decisionClass: 'PERSONAL_DELTA_NOT_BASE_OR_SAFETY',
      reasonCode: 'EXPLICIT_DURATION_MATCH',
    }),
  }),
  profiles: Object.freeze({
    BASEBALL_SPECTATOR: Object.freeze([
      'HEAT_SENSITIVITY', 'COLD_SENSITIVITY', 'RAIN_SENSITIVITY',
      'WIND_SENSITIVITY', 'HUMIDITY_SENSITIVITY', 'TIME_WINDOW_PREFERENCE',
    ]),
    CAMPING: Object.freeze([
      'HEAT_SENSITIVITY', 'COLD_SENSITIVITY', 'RAIN_SENSITIVITY',
      'WIND_SENSITIVITY', 'HUMIDITY_SENSITIVITY', 'DURATION_PREFERENCE',
    ]),
    FUTSAL_OUTDOOR: Object.freeze([
      'HEAT_SENSITIVITY', 'COLD_SENSITIVITY', 'RAIN_SENSITIVITY',
      'WIND_SENSITIVITY', 'AIR_QUALITY_SENSITIVITY',
      'TIME_WINDOW_PREFERENCE', 'DURATION_PREFERENCE',
    ]),
    HIKING: Object.freeze([
      'HEAT_SENSITIVITY', 'COLD_SENSITIVITY', 'RAIN_SENSITIVITY',
      'WIND_SENSITIVITY', 'AIR_QUALITY_SENSITIVITY',
      'TIME_WINDOW_PREFERENCE', 'DURATION_PREFERENCE',
    ]),
    STARGAZING: Object.freeze([
      'RAIN_SENSITIVITY', 'HUMIDITY_SENSITIVITY', 'SKY_CLARITY_PRIORITY',
      'TIME_WINDOW_PREFERENCE', 'DURATION_PREFERENCE',
    ]),
  }),
});

export function allowedPersonalizationKeys(profileId) {
  return PERSONALIZATION_POLICY.profiles[String(profileId || '')] || null;
}

export function validatePersonalizationPolicy(policy = PERSONALIZATION_POLICY) {
  const errors = [];
  if (policy?.releaseMode !== 'CALIBRATION_SHADOW') errors.push('PERSONAL_POLICY_MUST_BE_SHADOW');
  if (policy?.maxAbsoluteDeltaCandidate !== 12) errors.push('DELTA_CANDIDATE_MUST_MATCH_V23');
  if (!Number.isInteger(policy?.privateCacheTtlSeconds) || policy.privateCacheTtlSeconds > 300) {
    errors.push('PRIVATE_CACHE_TTL_TOO_LONG');
  }
  if (policy?.responseCacheControl !== 'private, no-store') errors.push('PRIVATE_RESPONSE_MUST_BE_NO_STORE');
  const definitions = policy?.definitions || {};
  for (const [profileId, keys] of Object.entries(policy?.profiles || {})) {
    if (!Array.isArray(keys) || !keys.length) errors.push(`PROFILE_PERSONALIZATION_EMPTY:${profileId}`);
    if (new Set(keys).size !== keys.length) errors.push(`PROFILE_PERSONALIZATION_DUPLICATE:${profileId}`);
    for (const key of keys) if (!definitions[key]) errors.push(`PERSONALIZATION_DEFINITION_MISSING:${profileId}:${key}`);
  }
  for (const [key, definition] of Object.entries(definitions)) {
    if (definition.key !== key) errors.push(`PERSONALIZATION_KEY_MISMATCH:${key}`);
    if (definition.sourcePolicy !== 'EXPLICIT_USER_INPUT_ONLY') errors.push(`PERSONALIZATION_SOURCE_INVALID:${key}`);
    if (definition.decisionClass !== 'PERSONAL_DELTA_NOT_BASE_OR_SAFETY') errors.push(`PERSONALIZATION_CLASS_INVALID:${key}`);
    const max = Number(definition.maxNegative || definition.maxPositive || 0);
    if (!Number.isFinite(max) || max <= 0 || max > policy.maxAbsoluteDeltaCandidate) {
      errors.push(`PERSONALIZATION_POINTS_INVALID:${key}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
