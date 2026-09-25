// EARTHUS Pleos — 장소 문맥 규칙 (결정적, SHADOW)
//
// ⚠️ 저장소에는 RAIN_INDOOR 같은 장소 문맥 규칙 ID가 없었다 (SOURCE_SURVEY §4).
//    그리고 HANDOVER-2026-08-22 §0 에 따라 Decision·공개 점수는 SHADOW/BLOCKED 다.
//    그래서 이 모듈은 **점수를 만들지 않고**, 어떤 규칙이 걸렸는지와 숨김 여부만 돌려준다.
//    화면에 쓰는 것은 안전 억제(재난·해양 특보·대기 나쁨)뿐이고, 긍정 규칙(RAIN_INDOOR 등)은
//    결과에 releaseMode:'SHADOW' 로만 남긴다. 공개는 PD 승인 뒤 별도 배치다.
//
// 입력은 weather-contract-v7 카드와 safety-engine 결과다. 값이 없으면 규칙을 켜지 않는다 (추정 금지).

export const CONTEXT_RULES_VERSION = 'earthus.pleos-context-rules.v1.0.0';

export const CONTEXT_RULE = Object.freeze({
  CRITICAL_DISASTER_OVERRIDE: 'CRITICAL_DISASTER_OVERRIDE',
  MARINE_SAFETY_OVERRIDE: 'MARINE_SAFETY_OVERRIDE',
  HIGH_AIR_POLLUTION: 'HIGH_AIR_POLLUTION',
  RAIN_INDOOR: 'RAIN_INDOOR',
  SUNSET_OUTDOOR: 'SUNSET_OUTDOOR',
  EVENT_TODAY: 'EVENT_TODAY',
  // GOOD_MARINE 은 넣지 않았다. "바다 놀기 좋음"을 가를 기존 임계값이 저장소에 없고,
  // 새로 정하면 우리가 판단을 지어내는 것이 된다. 공개 기준값이 정해지면 추가한다.
});

const OUTDOOR = new Set(['nature', 'sports', 'beach', 'marine', 'park', 'mountain']);
const MARINE = new Set(['beach', 'marine']);
const INDOOR = new Set(['culture', 'museum', 'indoor']);
const MARINE_WARNING_KINDS = /풍랑|폭풍해일|해일|태풍|고조|rough sea|storm surge|typhoon/i;

const available = p => p && p.dataState === 'AVAILABLE' && p.value !== null && p.value !== undefined;

/**
 * @param {object} place  { category }
 * @param {object} env    { weatherCard, warning (safety-engine 결과), nowMs, eventToday }
 */
export function evaluateContext(place = {}, env = {}) {
  const category = String(place.category || '').toLowerCase();
  const warning = env.warning || null;
  const card = env.weatherCard || null;
  const safety = [];
  const shadow = [];
  let suppressed = false;

  // 1) 재난 안전 — 가장 먼저. 공식 특보가 확정 일치할 때만 (safety-engine 판단을 그대로 따른다).
  if (warning?.gate === 'OFFICIAL_WARNING_ACTIVE') {
    safety.push(CONTEXT_RULE.CRITICAL_DISASTER_OVERRIDE);
    suppressed = true;
    if (MARINE.has(category) && (warning.warnings || []).some(w => MARINE_WARNING_KINDS.test(`${w.kind || ''}${w.kindEn || ''}`))) {
      safety.push(CONTEXT_RULE.MARINE_SAFETY_OVERRIDE);
    }
  }

  // 2) 대기질 — 공식 등급 문자열이 있을 때만.
  const grade = card?.details?.airQuality?.grade || null;
  if (OUTDOOR.has(category) && grade && /나쁨/.test(grade)) {
    safety.push(CONTEXT_RULE.HIGH_AIR_POLLUTION);
    suppressed = true;
  }

  // 3) 긍정 규칙 — SHADOW. 특보 상태를 모르면 켜지 않는다 (모름 ≠ 안전).
  const warningKnownClear = card?.displayPolicy?.positiveRecommendationAllowed === true;
  if (!suppressed && warningKnownClear) {
    const rain = card?.current?.precipitation60m;
    if (available(rain) && rain.value > 0 && INDOOR.has(category)) shadow.push(CONTEXT_RULE.RAIN_INDOOR);
    const sunset = card?.details?.sun?.sunset;
    if (sunset?.value && env.nowMs && OUTDOOR.has(category)) {
      const mins = (Date.parse(sunset.value) - env.nowMs) / 60_000;
      if (Number.isFinite(mins) && mins >= 0 && mins <= 120) shadow.push(CONTEXT_RULE.SUNSET_OUTDOOR);
    }
    if (env.eventToday === true && category === 'event') shadow.push(CONTEXT_RULE.EVENT_TODAY);
  }

  return {
    version: CONTEXT_RULES_VERSION,
    suppressed,
    safetyRules: safety,
    shadowRules: shadow,
    releaseMode: 'SHADOW',
  };
}
