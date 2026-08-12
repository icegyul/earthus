// Earthus Safety Engine — 공식 특보를 점수보다 먼저 처리하는 순수 판단 모듈
//
// 받은 지적: "특보 0건"이나 region mapping 실패를 "안전"으로 바꾸면 안 된다.
// 이 모듈은 PR-05의 좁은 vertical slice다. 현재 공개 자료에는 공식 경계 polygon이 없으므로
// 최근접 기상청 관측지점의 특보구역을 근사로 찾되, **같은 공식 regionId가 실제로 존재할 때만**
// Hard Gate를 켠다. 일치 특보가 없을 때는 SAFE가 아니라 UNKNOWN이다.

const KR = Object.freeze({ s: 32.5, n: 39.0, w: 124.0, e: 132.5 });
export const WARNING_ZONE_MAX_KM = 60;
export const WARNING_FRESH_MINUTES = 30;
export const WARNING_STALE_MINUTES = 45;
const FUTURE_TOLERANCE_MINUTES = 5;

const finite = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value));

export function inKorea(lat, lon) {
  return finite(lat) && finite(lon)
    && Number(lat) >= KR.s && Number(lat) <= KR.n
    && Number(lon) >= KR.w && Number(lon) <= KR.e;
}

/** 두 점 사이 거리(km). */
export function distanceKm(aLat, aLon, bLat, bLon) {
  if (![aLat, aLon, bLat, bLon].every(finite)) return null;
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (Number(bLat) - Number(aLat)) * rad;
  const dLon = (Number(bLon) - Number(aLon)) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(Number(aLat) * rad) * Math.cos(Number(bLat) * rad)
    * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * KST 숫자 시각(YYYYMMDDHHMM[SS]) 또는 RFC3339을 epoch ms로 바꾼다.
 * 형식을 모르면 null이다. 로컬 timezone으로 추측하지 않는다.
 */
export function parseWarningTime(value) {
  const raw = String(value || '').trim();
  if (/^\d{12}(\d{2})?$/.test(raw)) {
    const y = +raw.slice(0, 4), mo = +raw.slice(4, 6), d = +raw.slice(6, 8);
    const h = +raw.slice(8, 10), mi = +raw.slice(10, 12), s = raw.length >= 14 ? +raw.slice(12, 14) : 0;
    const ms = Date.UTC(y, mo - 1, d, h, mi, s) - 9 * 3600_000;
    const check = new Date(ms + 9 * 3600_000);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1
        || check.getUTCDate() !== d || check.getUTCHours() !== h
        || check.getUTCMinutes() !== mi) return null;
    return ms;
  }
  if (!raw || !/(Z|[+-]\d\d:\d\d)$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function warningFreshness(snapshot, nowMs = Date.now()) {
  const at = parseWarningTime(snapshot?.generated) ?? parseWarningTime(snapshot?.observedKst);
  if (at == null || !finite(nowMs)) {
    return { status: 'UNKNOWN', usable: false, ageMinutes: null, reason: 'TIME_MISSING' };
  }
  const ageMinutes = (Number(nowMs) - at) / 60_000;
  if (ageMinutes < -FUTURE_TOLERANCE_MINUTES) {
    return { status: 'FUTURE', usable: false, ageMinutes, reason: 'TIME_IN_FUTURE' };
  }
  if (ageMinutes <= WARNING_FRESH_MINUTES) {
    return { status: 'FRESH', usable: true, ageMinutes, reason: null };
  }
  if (ageMinutes <= WARNING_STALE_MINUTES) {
    return { status: 'AGING', usable: true, ageMinutes, reason: 'PROVIDER_DELAY_POSSIBLE' };
  }
  return { status: 'STALE', usable: false, ageMinutes, reason: 'PROVIDER_DELAY' };
}

/** 최근접 공식 관측지점의 구역을 찾는다. 결과는 polygon이 아닌 근사라는 사실을 보존한다. */
export function resolveWarningZone(coords, zoneSnapshot, maxKm = WARNING_ZONE_MAX_KM) {
  if (!coords || !finite(coords.lat) || !finite(coords.lon)) {
    return { status: 'UNLOCATED', mapped: false, reason: 'LOCATION_MISSING' };
  }
  if (!inKorea(coords.lat, coords.lon)) {
    return { status: 'OUT_OF_COVERAGE', mapped: false, reason: 'KMA_OUT_OF_COVERAGE' };
  }
  const stations = Array.isArray(zoneSnapshot?.stations) ? zoneSnapshot.stations : [];
  let best = null;
  for (const station of stations) {
    const km = distanceKm(coords.lat, coords.lon, station?.lat, station?.lon);
    if (km == null || km > maxKm || !station?.zone) continue;
    if (!best || km < best.km) best = { station, km };
  }
  if (!best) {
    return {
      status: 'REGION_UNMAPPED', mapped: false, reason: 'REGION_UNMAPPED',
      method: 'NEAREST_KMA_STATION_ZONE', stationCount: stations.length,
    };
  }
  return {
    status: 'MAPPED_APPROXIMATE', mapped: true,
    id: best.station.zone,
    name: best.station.zoneName || null,
    station: best.station.name || null,
    km: best.km,
    method: 'NEAREST_KMA_STATION_ZONE',
    approximate: true,
    stationCount: stations.length,
    mappingGenerated: zoneSnapshot?.generated || null,
  };
}

export function warningLevelRank(warning) {
  if (Number.isInteger(warning?.levelRank) && warning.levelRank >= 0) return warning.levelRank;
  const level = String(warning?.level || '').trim();
  if (level === '중대경보') return 3;
  if (level === '경보') return 2;
  if (level === '주의' || level === '주의보') return 1;
  if (level === '예비특보') return 0;
  return null;
}

function baseResult(snapshot, freshness, zone) {
  const active = Array.isArray(snapshot?.active) ? snapshot.active : [];
  return {
    engineVersion: 'earthus.safety.warning.v1',
    status: 'UNKNOWN',
    gate: 'UNKNOWN',
    reason: 'UNKNOWN',
    applies: true,
    activityAllowed: null,
    blocksPositiveRecommendation: true,
    safeClaimAllowed: false,
    warnings: [],
    freshness,
    zone,
    evidence: {
      source: snapshot?.source || null,
      sourceEn: snapshot?.sourceEn || null,
      license: snapshot?.license || null,
      generated: snapshot?.generated || null,
      observedKst: snapshot?.observedKst || null,
      n: Number.isInteger(snapshot?.activeCount) ? snapshot.activeCount : active.length,
    },
  };
}

/**
 * 공식 특보 Hard Gate.
 * - 공식 특보 일치: 활동 점수보다 앞서 긍정 추천을 제한한다.
 * - 무특보/미매핑/지연: SAFE로 만들지 않고 UNKNOWN이다.
 * - CLOSED는 장소 운영기관의 공식 폐쇄 근거가 없으므로 절대 생성하지 않는다.
 */
export function evaluateWarningSafety({ snapshot, zones, coords, nowMs = Date.now() } = {}) {
  const freshness = warningFreshness(snapshot, nowMs);
  const zone = resolveWarningZone(coords, zones);
  const out = baseResult(snapshot, freshness, zone);

  if (!snapshot) {
    out.reason = 'PROVIDER_UNAVAILABLE';
    return out;
  }
  if (zone.status === 'OUT_OF_COVERAGE') {
    out.applies = false;
    out.blocksPositiveRecommendation = false;
    out.reason = zone.reason;
    return out;
  }
  if (!zone.mapped) {
    out.reason = zone.reason;
    return out;
  }
  if (!freshness.usable) {
    out.reason = freshness.reason;
    return out;
  }

  // ⚠️ parentId prefix나 대표점 반경으로 확장하지 않는다. 공식 hierarchy/polygon이 없으므로
  // 같은 source regionId만 확정 일치다. 불일치는 UNKNOWN이지 무특보가 아니다.
  const matched = (Array.isArray(snapshot.active) ? snapshot.active : [])
    .filter(w => w?.regionId === zone.id)
    .map(w => ({
      ...w,
      levelRank: warningLevelRank(w),
      km: (finite(w?.lat) && finite(w?.lon))
        ? Math.round(distanceKm(coords.lat, coords.lon, w.lat, w.lon)) : null,
    }))
    .sort((a, b) => (b.levelRank ?? -1) - (a.levelRank ?? -1));

  if (!matched.length) {
    out.gate = 'NO_EXACT_WARNING_MATCH';
    out.reason = 'NO_MATCH_NOT_SAFE';
    return out;
  }

  const topRank = matched.reduce((max, w) => Math.max(max, w.levelRank ?? -1), -1);
  out.status = topRank >= 2 ? 'DANGER' : 'WARNING';
  out.gate = 'OFFICIAL_WARNING_ACTIVE';
  out.reason = 'OFFICIAL_WARNING_ACTIVE';
  out.activityAllowed = false;
  out.blocksPositiveRecommendation = true;
  out.warnings = matched;
  return out;
}

/**
 * 발표→대치→해제 상태 replay. 입력 순서가 뒤섞이거나 중복돼도 최신 revision이 이긴다.
 * 이 reducer는 기관의 command를 보존할 뿐, 없는 해제 시각을 추정하지 않는다.
 */
export function replayWarningRevisions(records = [], nowMs = Date.now()) {
  const byKey = new Map();
  for (const raw of Array.isArray(records) ? records : []) {
    const regionId = String(raw?.regionId || '').trim();
    const kind = String(raw?.kind || '').trim();
    const issuedKst = String(raw?.issuedKst || '').trim();
    const issuedMs = parseWarningTime(issuedKst);
    if (!regionId || !kind || issuedMs == null) continue;
    const command = String(raw?.command ?? raw?.cmd ?? '').trim();
    const identity = `${regionId}|${kind}|${issuedKst}|${command}|${raw?.level || ''}|${raw?.effectiveKst || ''}`;
    const key = `${regionId}|${kind}`;
    const list = byKey.get(key) || [];
    if (!list.some(item => item.identity === identity)) {
      list.push({ ...raw, regionId, kind, issuedKst, issuedMs, command, identity });
      byKey.set(key, list);
    }
  }

  const states = [];
  for (const [key, history] of byKey.entries()) {
    history.sort((a, b) => a.issuedMs - b.issuedMs || a.identity.localeCompare(b.identity));
    const latest = history[history.length - 1];
    const command = latest.command.replace(/\s+/g, '');
    // 기상청 코드 4(해제예보 연장)는 아직 해제가 아니다. "해제"/코드 3만 종료다.
    const released = command === '해제' || command === '3';
    const effectiveMs = parseWarningTime(latest.effectiveKst);
    const upcoming = !released && effectiveMs != null && effectiveMs > Number(nowMs);
    states.push({
      key,
      state: released ? 'RELEASED' : (upcoming ? 'UPCOMING' : 'ACTIVE'),
      latest,
      revisionCount: history.length,
      history,
    });
  }
  return states.sort((a, b) => a.key.localeCompare(b.key));
}
