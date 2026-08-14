// Ocean Core v1 — 공식 안전 JSON을 활동 안전 evidence로 바꾸는 순수 adapter.
//
// 이 파일은 네트워크를 호출하지 않는다. 특히 다음을 추정하지 않는다.
// - JMA 낙뢰 type 0/1/4의 의미
// - KHOA 이안류 등급을 해수욕장 입수 통제로 변환
// - 반경이 없는 태풍 위치를 임의 반경으로 위험 판정
// coverage가 명시적으로 승인되지 않으면 "자료에 없음"을 INACTIVE로 바꾸지 않는다.

import { evaluateOceanFreshness, OCEAN_QUALITY, parseKstCompactTime } from './observation-contract.js';

export const OCEAN_SAFETY_EVIDENCE_SCHEMA = 'earthus.ocean-safety-evidence.v1';

const FRESHNESS_UNKNOWN = Object.freeze({
  status: OCEAN_QUALITY.UNKNOWN, usable: false, ageMinutes: null, reason: 'TIME_MISSING',
});
const VALID_STATES = new Set(['ACTIVE', 'INACTIVE', 'UNKNOWN', 'CLOSED']);

const finite = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value));

function validPoint(lat, lon) {
  return finite(lat) && finite(lon) && Number(lat) >= -90 && Number(lat) <= 90
    && Number(lon) >= -180 && Number(lon) <= 180;
}

function iso(value) {
  const raw = String(value || '').trim();
  if (!raw || !/(Z|[+-]\d\d:\d\d)$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** KMA compact 또는 JMA slash 시각을 UTC ISO로 바꾼다. 둘 다 UTC+9 원시각이다. */
export function parseOceanSafetyLocalTime(value) {
  const raw = String(value || '').trim();
  const compact = parseKstCompactTime(raw);
  if (compact) return compact;
  const match = raw.match(/^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return iso(raw);
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? 0);
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - 9 * 3600_000;
  const check = new Date(ms + 9 * 3600_000);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1
      || check.getUTCDate() !== day || check.getUTCHours() !== hour
      || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return null;
  return new Date(ms).toISOString();
}

export function oceanDistanceKm(aLat, aLon, bLat, bLon) {
  if (!validPoint(aLat, aLon) || !validPoint(bLat, bLon)) return null;
  const rad = Math.PI / 180;
  const p1 = Number(aLat) * rad, p2 = Number(bLat) * rad;
  const dp = (Number(bLat) - Number(aLat)) * rad;
  const dl = (Number(bLon) - Number(aLon)) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function normalizedBounds(area) {
  const minLat = Number(area?.minLat), maxLat = Number(area?.maxLat);
  const minLon = Number(area?.minLon), maxLon = Number(area?.maxLon);
  if (![minLat, maxLat, minLon, maxLon].every(Number.isFinite)
      || minLat < -90 || maxLat > 90 || minLat > maxLat
      || minLon < -180 || maxLon > 180 || minLon > maxLon) return null;
  return { sourceId: String(area?.sourceId || '').trim() || null,
    minLat, maxLat, minLon, maxLon };
}

function coverageFor(policy, lat, lon) {
  if (policy?.status !== 'APPROVED' || !Array.isArray(policy?.areas) || !validPoint(lat, lon)) {
    return { approved: false, sourceIds: [], reason: 'COVERAGE_POLICY_UNAPPROVED' };
  }
  const areas = policy.areas.map(normalizedBounds).filter(Boolean);
  const matches = areas.filter(area => Number(lat) >= area.minLat && Number(lat) <= area.maxLat
    && Number(lon) >= area.minLon && Number(lon) <= area.maxLon);
  if (!matches.length) return { approved: false, sourceIds: [], reason: 'POINT_OUTSIDE_COVERAGE' };
  return { approved: true, sourceIds: [...new Set(matches.map(area => area.sourceId).filter(Boolean))],
    reason: null };
}

function makeEvidence({ kind, state, sourceId, generatedAt = null, observedAt = null,
  freshness = FRESHNESS_UNKNOWN, reason = null, location = null, matches = [], details = null }) {
  return Object.freeze({
    schema: OCEAN_SAFETY_EVIDENCE_SCHEMA,
    kind,
    state: VALID_STATES.has(state) ? state : 'UNKNOWN',
    official: true,
    sourceId,
    generatedAt: iso(generatedAt),
    observedAt: iso(observedAt),
    freshness: Object.freeze({ ...freshness }),
    reason,
    location: location ? Object.freeze({ ...location }) : null,
    matches: Object.freeze(matches.map(item => Object.freeze({ ...item }))),
    details: details ? Object.freeze({ ...details }) : null,
  });
}

export function adaptOfficialLightning(document, {
  lat, lon, radiusKm = 30, nowMs = Date.now(), freshnessPolicy, coveragePolicy,
  maxStrikeAgeMinutes = null,
} = {}) {
  const generatedAt = iso(document?.generated);
  const freshness = evaluateOceanFreshness({ at: generatedAt, nowMs, policy: freshnessPolicy });
  const location = validPoint(lat, lon) && finite(radiusKm) && Number(radiusKm) > 0
    ? { lat: Number(lat), lon: Number(lon), radiusKm: Number(radiusKm) } : null;
  if (!location) return makeEvidence({ kind: 'LIGHTNING', state: 'UNKNOWN',
    sourceId: 'earthus-lightning-official', generatedAt, freshness,
    reason: 'TARGET_LOCATION_INVALID' });

  const coverage = coverageFor(coveragePolicy, lat, lon);
  if (!coverage.approved) return makeEvidence({ kind: 'LIGHTNING', state: 'UNKNOWN',
    sourceId: 'earthus-lightning-official', generatedAt, freshness, location,
    reason: coverage.reason });
  if (![OCEAN_QUALITY.FRESH, OCEAN_QUALITY.AGING].includes(freshness.status)) {
    return makeEvidence({ kind: 'LIGHTNING', state: 'UNKNOWN',
      sourceId: 'earthus-lightning-official', generatedAt, freshness, location,
      reason: 'SOURCE_NOT_FRESH' });
  }

  const sourceErrors = document?.errors && typeof document.errors === 'object' ? document.errors : {};
  const relevantSources = coverage.sourceIds.length ? coverage.sourceIds : ['KMA', 'JMA'];
  if (relevantSources.every(sourceId => sourceErrors[String(sourceId).toLowerCase()])) {
    return makeEvidence({ kind: 'LIGHTNING', state: 'UNKNOWN',
      sourceId: 'earthus-lightning-official', generatedAt, freshness, location,
      reason: 'COVERING_SOURCES_FAILED', details: { sourceIds: relevantSources.join(',') } });
  }

  const documentWindow = Number(document?.windowMinutes);
  const ageLimit = finite(maxStrikeAgeMinutes) && Number(maxStrikeAgeMinutes) > 0
    ? Number(maxStrikeAgeMinutes) : (Number.isFinite(documentWindow) && documentWindow > 0 ? documentWindow : null);
  if (!ageLimit) return makeEvidence({ kind: 'LIGHTNING', state: 'UNKNOWN',
    sourceId: 'earthus-lightning-official', generatedAt, freshness, location,
    reason: 'STRIKE_WINDOW_MISSING' });

  const matches = [], invalidNearby = [];
  for (const strike of Array.isArray(document?.strikes) ? document.strikes : []) {
    if (coverage.sourceIds.length && !coverage.sourceIds.includes(String(strike?.src || ''))) continue;
    const distanceKm = oceanDistanceKm(lat, lon, strike?.lat, strike?.lon);
    if (distanceKm == null || distanceKm > Number(radiusKm)) continue;
    const at = parseOceanSafetyLocalTime(strike?.at);
    if (!at) {
      invalidNearby.push({ source: strike?.src || null, distanceKm: Math.round(distanceKm * 10) / 10 });
      continue;
    }
    const ageMinutes = (Number(nowMs) - Date.parse(at)) / 60_000;
    if (ageMinutes < -5 || ageMinutes > ageLimit) continue;
    matches.push({
      source: String(strike?.src || '') || null,
      observedAt: at,
      distanceKm: Math.round(distanceKm * 10) / 10,
      // JMA type는 의미가 공개되지 않았으므로 원시값만 보존한다.
      sourceType: strike?.t ?? null,
    });
  }
  matches.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  if (matches.length) return makeEvidence({ kind: 'LIGHTNING', state: 'ACTIVE',
    sourceId: 'earthus-lightning-official', generatedAt, observedAt: matches[0].observedAt,
    freshness, location, reason: 'OFFICIAL_DISCHARGE_WITHIN_RADIUS', matches,
    details: { coverageSources: relevantSources.join(','), ageLimitMinutes: ageLimit } });
  if (invalidNearby.length) return makeEvidence({ kind: 'LIGHTNING', state: 'UNKNOWN',
    sourceId: 'earthus-lightning-official', generatedAt, freshness, location,
    reason: 'NEARBY_STRIKE_TIME_INVALID', matches: invalidNearby });
  return makeEvidence({ kind: 'LIGHTNING', state: 'INACTIVE',
    sourceId: 'earthus-lightning-official', generatedAt, observedAt: generatedAt,
    freshness, location, reason: 'NO_RECENT_DISCHARGE_WITHIN_APPROVED_COVERAGE',
    details: { coverageSources: relevantSources.join(','), ageLimitMinutes: ageLimit } });
}

function currentAgencySteps(document) {
  const out = [];
  for (const storm of Array.isArray(document?.storms) ? document.storms : []) {
    for (const agency of Array.isArray(storm?.agencies) ? storm.agencies : []) {
      const steps = Array.isArray(agency?.steps) ? agency.steps : [];
      const step = steps.find(item => Number(item?.h) === 0) || null;
      if (!step || !validPoint(step.lat, step.lon)) continue;
      out.push({ storm, agency, step });
    }
  }
  return out;
}

function allAround(area) {
  return String(area?.dirJp || '') === '全域' || String(area?.dirKo || '') === '전역';
}

export function adaptOfficialTyphoon(document, {
  lat, lon, nowMs = Date.now(), freshnessPolicy, coveragePolicy,
} = {}) {
  const generatedAt = iso(document?.generated);
  const freshness = evaluateOceanFreshness({ at: generatedAt, nowMs, policy: freshnessPolicy });
  const location = validPoint(lat, lon) ? { lat: Number(lat), lon: Number(lon) } : null;
  if (!location) return makeEvidence({ kind: 'TYPHOON', state: 'UNKNOWN',
    sourceId: 'earthus-typhoon-official', generatedAt, freshness,
    reason: 'TARGET_LOCATION_INVALID' });
  if (![OCEAN_QUALITY.FRESH, OCEAN_QUALITY.AGING].includes(freshness.status)) {
    return makeEvidence({ kind: 'TYPHOON', state: 'UNKNOWN',
      sourceId: 'earthus-typhoon-official', generatedAt, freshness, location,
      reason: 'SOURCE_NOT_FRESH' });
  }

  const active = [], unresolved = [];
  for (const { storm, agency, step } of currentAgencySteps(document)) {
    const distanceKm = oceanDistanceKm(lat, lon, step.lat, step.lon);
    const areas = [...(Array.isArray(step.stormArea) ? step.stormArea : []),
      ...(Array.isArray(step.galeArea) ? step.galeArea : [])]
      .filter(area => finite(area?.km) && Number(area.km) > 0);
    const circular = areas.filter(allAround);
    const directional = areas.filter(area => !allAround(area));
    const maxCircularKm = circular.length ? Math.max(...circular.map(area => Number(area.km))) : null;
    if (maxCircularKm != null && distanceKm <= maxCircularKm) {
      active.push({ storm: storm.name || storm.key || null, agency: agency.agency || null,
        observedAt: iso(step.validKst) || iso(step.validUtc) || iso(agency.issue),
        distanceKm: Math.round(distanceKm * 10) / 10, officialRadiusKm: maxCircularKm });
      continue;
    }
    if (directional.length) {
      const minKm = Math.min(...directional.map(area => Number(area.km)));
      const maxKm = Math.max(...directional.map(area => Number(area.km)));
      if (distanceKm <= minKm) {
        active.push({ storm: storm.name || storm.key || null, agency: agency.agency || null,
          observedAt: iso(step.validKst) || iso(step.validUtc) || iso(agency.issue),
          distanceKm: Math.round(distanceKm * 10) / 10, officialRadiusKm: minKm,
          radiusMeaning: 'MIN_DIRECTIONAL_RADIUS' });
      } else if (distanceKm <= maxKm) {
        unresolved.push({ storm: storm.name || storm.key || null, agency: agency.agency || null,
          distanceKm: Math.round(distanceKm * 10) / 10, maxOfficialRadiusKm: maxKm });
      }
    }
  }
  if (active.length) {
    active.sort((a, b) => a.distanceKm - b.distanceKm);
    return makeEvidence({ kind: 'TYPHOON', state: 'ACTIVE',
      sourceId: 'earthus-typhoon-official', generatedAt, observedAt: active[0].observedAt,
      freshness, location, reason: 'POINT_INSIDE_OFFICIAL_WIND_AREA', matches: active });
  }
  if (unresolved.length) return makeEvidence({ kind: 'TYPHOON', state: 'UNKNOWN',
    sourceId: 'earthus-typhoon-official', generatedAt, freshness, location,
    reason: 'DIRECTIONAL_WIND_AREA_UNRESOLVED', matches: unresolved });

  const coverage = coverageFor(coveragePolicy, lat, lon);
  if (!coverage.approved || coveragePolicy?.inactiveWhenOutsideOfficialAreas !== true) {
    return makeEvidence({ kind: 'TYPHOON', state: 'UNKNOWN',
      sourceId: 'earthus-typhoon-official', generatedAt, freshness, location,
      reason: coverage.approved ? 'INACTIVE_POLICY_UNAPPROVED' : coverage.reason });
  }
  return makeEvidence({ kind: 'TYPHOON', state: 'INACTIVE',
    sourceId: 'earthus-typhoon-official', generatedAt, observedAt: generatedAt,
    freshness, location, reason: 'OUTSIDE_OFFICIAL_AREAS_WITH_APPROVED_COVERAGE' });
}

export function adaptOfficialClosure(document, {
  spotId = null, lat = null, lon = null, nowMs = Date.now(), freshnessPolicy, coveragePolicy,
} = {}) {
  const generatedAt = iso(document?.generated);
  const freshness = evaluateOceanFreshness({ at: generatedAt, nowMs, policy: freshnessPolicy });
  const location = validPoint(lat, lon) ? { lat: Number(lat), lon: Number(lon) } : null;
  const targetSpotId = String(spotId || '').trim() || null;
  if (!targetSpotId && !location) return makeEvidence({ kind: 'CLOSURE', state: 'UNKNOWN',
    sourceId: 'official-coast-closure', generatedAt, freshness,
    reason: 'TARGET_LOCATION_INVALID' });
  if (![OCEAN_QUALITY.FRESH, OCEAN_QUALITY.AGING].includes(freshness.status)) {
    return makeEvidence({ kind: 'CLOSURE', state: 'UNKNOWN',
      sourceId: 'official-coast-closure', generatedAt, freshness, location,
      reason: 'SOURCE_NOT_FRESH' });
  }
  if (!Array.isArray(document?.closures)) {
    // coast-kr.json은 관측값이며 관리주체의 입수 통제 문서가 아니다.
    return makeEvidence({ kind: 'CLOSURE', state: 'UNKNOWN',
      sourceId: 'official-coast-closure', generatedAt, freshness, location,
      reason: 'OBSERVATION_IS_NOT_CLOSURE' });
  }

  const matches = document.closures.filter(item => {
    if (targetSpotId && String(item?.spotId || item?.id || '') === targetSpotId) return true;
    if (!location || !validPoint(item?.lat, item?.lon)) return false;
    const distanceKm = oceanDistanceKm(lat, lon, item.lat, item.lon);
    const radiusKm = finite(item?.radiusKm) && Number(item.radiusKm) >= 0
      ? Number(item.radiusKm) : 0.25;
    return distanceKm != null && distanceKm <= radiusKm;
  }).map(item => ({ id: item.id || null, spotId: item.spotId || null,
    state: String(item.state || '').toUpperCase(), observedAt: iso(item.observedAt) || generatedAt,
    authority: item.authority || null, reason: item.reason || null }));
  if (matches.some(item => ['CLOSED', 'ACTIVE', 'WARNING', 'DANGER'].includes(item.state))) {
    return makeEvidence({ kind: 'CLOSURE', state: 'CLOSED',
      sourceId: 'official-coast-closure', generatedAt,
      observedAt: matches.find(item => ['CLOSED', 'ACTIVE', 'WARNING', 'DANGER'].includes(item.state))?.observedAt,
      freshness, location, reason: 'OFFICIAL_CLOSURE_ACTIVE', matches });
  }

  const coverage = coverageFor(coveragePolicy, lat, lon);
  const spotCovered = targetSpotId && Array.isArray(coveragePolicy?.spotIds)
    && coveragePolicy.spotIds.map(String).includes(targetSpotId);
  if (coveragePolicy?.status !== 'APPROVED' || (!coverage.approved && !spotCovered)
      || coveragePolicy?.emptyMeansOpen !== true) {
    return makeEvidence({ kind: 'CLOSURE', state: 'UNKNOWN',
      sourceId: 'official-coast-closure', generatedAt, freshness, location,
      reason: 'CLOSURE_COVERAGE_UNAPPROVED', matches });
  }
  return makeEvidence({ kind: 'CLOSURE', state: 'INACTIVE',
    sourceId: 'official-coast-closure', generatedAt, observedAt: generatedAt,
    freshness, location, reason: 'NO_ACTIVE_CLOSURE_IN_APPROVED_COVERAGE', matches });
}
