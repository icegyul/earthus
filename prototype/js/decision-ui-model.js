// Earthus Decision UI Model v1 — Safety를 첫 번째로 읽고 5축을 한 점수로 합치지 않는다.

export const DECISION_UI_MODEL_VERSION = 'earthus.decision-ui-model.v1.0.0';
export const DECISION_AXIS_ORDER = Object.freeze([
  'SAFETY',
  'ACTIVITY_FIT',
  'FORECAST_CONFIDENCE',
  'CROWD',
  'AVAILABILITY',
]);

const TEXT = Object.freeze({
  ko: {
    SAFETY: '안전', ACTIVITY_FIT: '활동 적합도', FORECAST_CONFIDENCE: '예보 자료 신뢰도',
    CROWD: '혼잡', AVAILABILITY: '예약 가능성', UNKNOWN: '확인할 자료 없음',
    DANGER: '위험 · 추천 제한', WARNING: '주의 · 추천 제한',
    WITHHELD: '추천 보류', BASE: '공용 기준', PERSONAL: '내 취향 반영',
    HIGH: '높음', MEDIUM: '보통', LOW: '낮음', VERY_LOW: '매우 낮음',
    AVAILABLE: '가능', LIMITED: '제한적', SOLD_OUT: '매진',
    MODERATE: '보통', OBSERVED: '자료 확인',
  },
  en: {
    SAFETY: 'Safety', ACTIVITY_FIT: 'Activity fit', FORECAST_CONFIDENCE: 'Forecast data confidence',
    CROWD: 'Crowd', AVAILABILITY: 'Availability', UNKNOWN: 'No verified data',
    DANGER: 'Danger · recommendation blocked', WARNING: 'Warning · recommendation blocked',
    WITHHELD: 'Recommendation withheld', BASE: 'Shared base', PERSONAL: 'With my preferences',
    HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', VERY_LOW: 'Very low',
    AVAILABLE: 'Available', LIMITED: 'Limited', SOLD_OUT: 'Sold out',
    MODERATE: 'Moderate', OBSERVED: 'Verified response',
  },
});

const language = value => value === 'en' ? 'en' : 'ko';
const text = (lang, key, fallback = key) => TEXT[language(lang)][key] || fallback;
const formatNumber = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const REASONS = Object.freeze({
  ko: Object.freeze({
    OFFICIAL_WARNING_ACTIVE: '공식 특보가 확인되어 추천을 제한합니다.',
    SAFETY_EVIDENCE_MISSING: '현재 지역의 공식 안전 근거가 없습니다.',
    LOCAL_SAFETY_PROVIDER_MISSING: '이 지역을 담당하는 공식 안전 자료가 없습니다.',
    PROFILE_CALIBRATION_SHADOW: '활동 기준을 검증 중이라 추천을 열지 않았습니다.',
    FORECAST_CONFIDENCE_UNKNOWN: '예보 자료의 품질 근거가 충분하지 않습니다.',
    CROWD_EVIDENCE_MISSING: '출처와 시각이 확인된 혼잡 자료가 없습니다.',
    AVAILABILITY_EVIDENCE_MISSING: '예약 공급자의 최신 응답이 없습니다.',
    PRODUCT_FIT_CURVE_CALIBRATION: '활동 적합도 곡선은 검증 중입니다.',
    EXPLICIT_PREFERENCES_APPLIED: '직접 고른 취향만 별도로 반영했습니다.',
  }),
  en: Object.freeze({
    OFFICIAL_WARNING_ACTIVE: 'An official warning is active, so recommendations are blocked.',
    SAFETY_EVIDENCE_MISSING: 'No verified official safety evidence is available for this area.',
    LOCAL_SAFETY_PROVIDER_MISSING: 'No local official safety provider is connected for this area.',
    PROFILE_CALIBRATION_SHADOW: 'Recommendations remain closed while the activity policy is calibrated.',
    FORECAST_CONFIDENCE_UNKNOWN: 'The evidence needed to assess forecast data quality is incomplete.',
    CROWD_EVIDENCE_MISSING: 'No crowd data with a verified source and time is available.',
    AVAILABILITY_EVIDENCE_MISSING: 'No current response is available from a booking provider.',
    PRODUCT_FIT_CURVE_CALIBRATION: 'The activity-fit curve is still under calibration.',
    EXPLICIT_PREFERENCES_APPLIED: 'Only preferences you entered explicitly were applied.',
  }),
});

export function decisionReasonLabel(code, lang = 'ko') {
  const key = String(code || '');
  return REASONS[language(lang)][key] || key;
}

function safetyTone(safety) {
  if (safety?.status === 'DANGER') return 'danger';
  if (!safety || safety.status === 'UNKNOWN' || safety.applies === false) return 'unknown';
  if (safety?.status === 'WARNING' || safety?.blocksPositiveRecommendation) return 'warning';
  return 'unknown';
}

function evidenceSummary(evidence) {
  if (!evidence) return null;
  return {
    source: evidence.source || evidence.sourceId || null,
    observedAt: evidence.generated || evidence.observedAt || evidence.observedKst || null,
    revision: evidence.revision || null,
    n: Number.isInteger(evidence.n) ? evidence.n : null,
  };
}

function syntheticEvidence(sourceIds, revision, n = null) {
  const sources = [...new Set((Array.isArray(sourceIds) ? sourceIds : [])
    .map(value => value == null ? '' : String(value).trim()).filter(Boolean))].sort();
  if (!sources.length && !revision) return null;
  return {
    source: sources.length ? sources.join(' · ') : null,
    observedAt: null,
    revision: revision || null,
    n: Number.isInteger(n) ? n : sources.length || null,
  };
}

function validPersonalResult(baseDecision, personalResult) {
  return !!personalResult
    && personalResult.schemaVersion === 'earthus.personalization-result.v1'
    && personalResult.baseDecisionId === baseDecision.decisionId
    && personalResult.cache?.scope === 'USER_SCOPED_PRIVATE'
    && personalResult.cache?.shared === false
    && personalResult.protectedAxes?.includes('SAFETY')
    && personalResult.protectedAxes?.includes('FORECAST_CONFIDENCE')
    && personalResult.protectedAxes?.includes('CROWD')
    && personalResult.protectedAxes?.includes('AVAILABILITY');
}

function reasonList(axis, lang) {
  return Array.isArray(axis?.reasonCodes)
    ? axis.reasonCodes.map(code => decisionReasonLabel(code, lang)).filter(Boolean)
    : [];
}

function axisModel(baseDecision, key, lang, personalResult) {
  const axes = baseDecision.axes || {};
  if (key === 'SAFETY') {
    const safety = axes.safety || {};
    const status = String(safety.status || 'UNKNOWN');
    const verified = !safety.blocksPositiveRecommendation && status !== 'UNKNOWN';
    return {
      key, label: text(lang, key), status, tone: safetyTone(safety),
      primary: text(lang, status, verified ? status : text(lang, 'UNKNOWN')),
      secondary: safety.reason ? decisionReasonLabel(safety.reason, lang) : null,
      unknown: status === 'UNKNOWN' || safety.applies === false,
      blocker: safety.blocksPositiveRecommendation !== false,
      reasons: [],
      evidence: evidenceSummary(safety.evidence),
    };
  }
  if (key === 'ACTIVITY_FIT') {
    const fit = axes.activityFit || {};
    const complete = fit.status === 'COMPLETE' && Number.isFinite(Number(fit.score));
    const personal = validPersonalResult(baseDecision, personalResult)
      && ['APPLIED', 'NO_EFFECT'].includes(personalResult.status);
    return {
      key, label: text(lang, key), status: fit.status || 'UNKNOWN',
      tone: complete ? 'neutral' : 'unknown',
      primary: complete
        ? (lang === 'en' ? `${formatNumber(fit.score)} · Grade ${fit.grade || '—'}` : `${formatNumber(fit.score)}점 · 등급 ${fit.grade || '—'}`)
        : text(lang, 'UNKNOWN'),
      secondary: complete ? text(lang, 'BASE') : null,
      unknown: !complete,
      blocker: baseDecision.displayPolicy?.scoreVisibility === 'DEEMPHASIZED',
      reasons: reasonList(fit, lang),
      baseScore: complete ? Number(fit.score) : null,
      grade: fit.grade || null,
      personalizedScore: personal ? Number(personalResult.personalizedScore) : null,
      boundedDelta: personal ? Number(personalResult.boundedDelta) : null,
      personalContributions: personal ? personalResult.contributions : [],
      personalStatus: validPersonalResult(baseDecision, personalResult) ? personalResult.status : null,
      contributions: Array.isArray(fit.contributions) ? fit.contributions : [],
      evidence: syntheticEvidence(
        Array.isArray(fit.contributions) ? fit.contributions.flatMap(item => item.signalIds || []) : [],
        baseDecision.activityProfile?.version || null,
        Array.isArray(fit.contributions) ? fit.contributions.length : null,
      ),
    };
  }
  if (key === 'FORECAST_CONFIDENCE') {
    const confidence = axes.forecastConfidence || {};
    const level = String(confidence.confidenceLevel || 'UNKNOWN');
    return {
      key, label: text(lang, key), status: level,
      tone: level === 'HIGH' ? 'neutral' : level === 'UNKNOWN' ? 'unknown' : 'warning',
      primary: level === 'UNKNOWN' ? text(lang, 'UNKNOWN') : `${text(lang, level)} · ${formatNumber(confidence.score)}`,
      secondary: lang === 'en' ? 'Data quality, not probability' : '맞을 확률이 아닌 자료 품질',
      unknown: level === 'UNKNOWN', blocker: level === 'UNKNOWN' || level === 'LOW' || level === 'VERY_LOW',
      reasons: reasonList(confidence, lang),
      evidence: syntheticEvidence(
        confidence.modelSourceIds,
        confidence.engineVersion || confidence.policyVersion || null,
        Array.isArray(confidence.inputSignalIds) ? confidence.inputSignalIds.length : null,
      ),
    };
  }
  const sourceAxis = key === 'CROWD' ? axes.crowd : axes.availability;
  const observed = sourceAxis?.status === 'OBSERVED';
  const rawValue = observed ? String(sourceAxis.value || 'UNKNOWN') : 'UNKNOWN';
  return {
    key, label: text(lang, key), status: rawValue,
    tone: observed ? 'neutral' : 'unknown',
    primary: observed ? text(lang, rawValue, rawValue) : text(lang, 'UNKNOWN'),
    secondary: observed ? text(lang, 'OBSERVED') : null,
    unknown: !observed, blocker: false,
    reasons: reasonList(sourceAxis, lang), evidence: evidenceSummary(sourceAxis?.evidence),
  };
}

export function createDecisionViewModel({ baseDecision, personalResult = null, lang = 'ko', label = null } = {}) {
  if (!baseDecision || baseDecision.schemaVersion !== 'earthus.activity-decision.v1') {
    throw new Error('DECISION_UI_BASE_REQUIRED');
  }
  const acceptedPersonal = validPersonalResult(baseDecision, personalResult) ? personalResult : null;
  const axes = DECISION_AXIS_ORDER.map(key => axisModel(baseDecision, key, language(lang), acceptedPersonal));
  return {
    schemaVersion: 'earthus.decision-ui-model.v1',
    modelVersion: DECISION_UI_MODEL_VERSION,
    decisionId: baseDecision.decisionId,
    label: label || baseDecision.placeId,
    profileId: baseDecision.activityProfile?.id || null,
    profileLabel: baseDecision.activityProfile?.label || baseDecision.activityProfile?.id || null,
    profileVersion: baseDecision.activityProfile?.version || null,
    releaseMode: baseDecision.activityProfile?.releaseMode || null,
    timeWindow: baseDecision.timeWindow,
    safetyFirst: axes[0].key === 'SAFETY',
    axes,
    recommendation: {
      state: baseDecision.recommendation?.state || 'WITHHELD',
      reason: decisionReasonLabel(baseDecision.recommendation?.reason || 'RECOMMENDATION_REASON_MISSING', lang),
      label: text(lang, baseDecision.recommendation?.state || 'WITHHELD', text(lang, 'WITHHELD')),
      allowed: baseDecision.displayPolicy?.positiveRecommendationAllowed === true,
    },
    personal: acceptedPersonal ? {
      status: acceptedPersonal.status,
      policyVersion: acceptedPersonal.policyVersion,
      releaseMode: acceptedPersonal.releaseMode,
      capApplied: acceptedPersonal.capApplied,
      rawDelta: acceptedPersonal.rawDelta,
      boundedDelta: acceptedPersonal.boundedDelta,
      cacheScope: acceptedPersonal.cache?.scope,
    } : null,
    lang: language(lang),
  };
}

function sameComparableScope(a, b) {
  return a?.profileId && a.profileId === b?.profileId
    && a?.timeWindow?.start === b?.timeWindow?.start
    && a?.timeWindow?.end === b?.timeWindow?.end;
}

export function compareDecisionViewModels(left, right) {
  if (!left || !right || left.schemaVersion !== 'earthus.decision-ui-model.v1'
      || right.schemaVersion !== 'earthus.decision-ui-model.v1') {
    throw new Error('DECISION_COMPARE_MODELS_REQUIRED');
  }
  if (!sameComparableScope(left, right)) {
    return {
      schemaVersion: 'earthus.decision-compare.v1',
      status: 'BLOCKED',
      reasonCodes: ['COMPARE_REQUIRES_SAME_PROFILE_AND_TIME_WINDOW'],
      winner: null,
      left, right,
      rows: [],
    };
  }
  return {
    schemaVersion: 'earthus.decision-compare.v1',
    status: 'COMPARABLE',
    reasonCodes: ['NO_SINGLE_AXIS_WINNER'],
    winner: null,
    left,
    right,
    rows: DECISION_AXIS_ORDER.map(key => ({
      key,
      label: left.axes.find(axis => axis.key === key)?.label || key,
      left: left.axes.find(axis => axis.key === key),
      right: right.axes.find(axis => axis.key === key),
    })),
  };
}
