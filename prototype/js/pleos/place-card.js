// EARTHUS Pleos — 장소 카드 adapter
//
// 흐름: 장소 선택 → 기존 EARTHUS 자료(관광 인구 스냅샷·해변 목록) → 이 adapter → 문맥·안전 표시 → Pleos 화면
//
// ⚠️ ui_PLEOS 킷의 57개 POI(41개 출처 없음)를 쓰지 않는다. 운영 자료만 받는다.
// ⚠️ 없는 값은 null 로 둔다. 출처가 없으면 "출처 정보 없음"이지, 그럴듯한 출처를 붙이지 않는다.

import { ACTION } from './actions.js';
import { decideAction } from './safety-gate.js';
import { evaluateContext } from './context-rules.js';
import { describeFreshness } from './freshness.js';

export const PLACE_CARD_VERSION = 'earthus.pleos-place-card.v1.0.0';

const num = v => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** tourism-flow-contract normalizeSeoulPopulation 결과 → 공통 장소 */
export function fromTourismPlace(place, snapshot = {}) {
  const pos = place?.position || {};
  const prov = place?.provenance || {};
  return {
    kind: 'TOURISM_FLOW',
    id: str(place?.id),
    canonicalId: str(place?.id),
    name: str(place?.nameKo) ?? str(place?.nameEn),
    category: str(place?.category),
    lat: num(pos.lat),
    lon: num(pos.lon),
    status: str(place?.state),
    region: null,
    source: {
      name: str(prov.sourceName) ?? str(snapshot?.source?.name),
      url: str(prov.sourceUrl),
      license: str(prov.license),
    },
    observedAt: str(prov.observedAt),
    receivedAt: str(prov.receivedAt),
    referenceAt: null,
  };
}

/** beaches.js list 항목 + beaches.meta → 공통 장소 (정적 참고 자료) */
export function fromBeach(beach, meta = {}) {
  const lat = num(beach?.lat); const lon = num(beach?.lon);
  const country = str(beach?.country) ?? 'xx';
  return {
    kind: 'STATIC_BEACH',
    id: lat !== null && lon !== null ? `earthus:beach:${country}:${lat.toFixed(4)},${lon.toFixed(4)}` : null,
    canonicalId: lat !== null && lon !== null ? `earthus:beach:${country}:${lat.toFixed(4)},${lon.toFixed(4)}` : null,
    name: str(beach?.name),
    category: 'beach',
    lat,
    lon,
    status: 'STATIC_REFERENCE',
    region: str(beach?.region),
    source: { name: str(meta?.source), url: null, license: str(meta?.license) },
    observedAt: null,
    receivedAt: null,
    referenceAt: str(meta?.generated),
  };
}

function weatherPart(card) {
  const cur = card?.current || {};
  const pick = p => (p ? { value: p.value ?? null, unit: p.unit ?? null, dataState: p.dataState ?? 'MISSING', sourceRef: p.sourceRef ?? null, observedAt: p.observedAt ?? null, validAt: p.validAt ?? null } : null);
  return {
    temperature: pick(cur.temperature),
    precipitation60m: pick(cur.precipitation60m),
    windSpeed: pick(cur.windSpeed),
    sources: Array.isArray(card?.sources) ? card.sources.map(s => ({ id: s.id, label: s.label, sourceType: s.sourceType, observedAt: s.observedAt, issuedAt: s.issuedAt, receivedAt: s.receivedAt, dataState: s.dataState })) : [],
  };
}

/**
 * @param {object} place  fromTourismPlace/fromBeach 결과
 * @param {object} ctx    { weatherCard, warning, drivingState, capabilities, nowMs, regionName }
 */
export function buildPlaceCard(place, ctx = {}) {
  const nowMs = ctx.nowMs ?? Date.now();
  const warning = ctx.warning ?? null;
  const criticalDisaster = warning?.gate === 'OFFICIAL_WARNING_ACTIVE';
  const gateCtx = { drivingState: ctx.drivingState, criticalDisaster, capabilities: ctx.capabilities || {} };
  const decide = action => {
    const d = decideAction({ ...gateCtx, action });
    return { allowed: d.decision === 'ALLOW', reason: d.reason };
  };
  const card = ctx.weatherCard ?? null;
  const context = evaluateContext(place, { weatherCard: card, warning, nowMs });

  return {
    version: PLACE_CARD_VERSION,
    id: place.id,
    canonicalId: place.canonicalId,
    name: place.name,
    category: place.category,
    coordinates: place.lat !== null && place.lon !== null ? { lat: place.lat, lon: place.lon } : null,
    status: place.status,
    region: place.region ?? ctx.regionName ?? null,
    source: place.source,
    observedAt: place.observedAt,
    referenceAt: place.referenceAt,
    freshness: describeFreshness({
      sourceState: place.kind === 'STATIC_BEACH' ? null : place.status,
      source: place.source?.name ?? null,
      observedAt: place.observedAt,
      receivedAt: place.receivedAt,
      nowMs,
    }),
    weather: card ? weatherPart(card) : null,
    airQuality: card?.details?.airQuality ? { grade: card.details.airQuality.grade, pm10: card.details.airQuality.pm10, pm25: card.details.airQuality.pm25, stationName: card.details.airQuality.stationName } : null,
    marine: card?.details?.waves ?? null,
    sunset: card?.details?.sun?.sunset ?? null,
    context,
    safety: {
      mode: decideAction({ ...gateCtx, action: ACTION.MAP }).mode,
      drivingState: decideAction({ ...gateCtx, action: ACTION.MAP }).drivingState,
      warningGate: warning?.gate ?? 'UNKNOWN',
      warningReason: warning?.reason ?? 'UNKNOWN',
      criticalDisaster,
    },
    actions: {
      [ACTION.DIRECTIONS]: decide(ACTION.DIRECTIONS),
      [ACTION.PLACE_DETAIL]: decide(ACTION.PLACE_DETAIL),
      [ACTION.FORECAST]: decide(ACTION.FORECAST),
      [ACTION.RESERVATION]: decide(ACTION.RESERVATION),
      [ACTION.COUPON]: decide(ACTION.COUPON),
    },
  };
}
