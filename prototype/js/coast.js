// 이안류 지수 · 조위 실측 — 국립해양조사원 (events/coast-kr.json)
//
// ⚠️⚠️ **이 파일이 생기기 전까지 화면은 정반대를 말하고 있었다.**
//    swimWarn() 이 "이안류는 이 자료에 잡히지 않습니다"라고 적고 있었는데,
//    이제 잡힌다. **없다고 말해 둔 문구를 그대로 두는 것이 자료가 없는 것보다 나쁘다** —
//    알 수 있는데 모른다고 말하는 것이기 때문이다.
//
// ⚠️⚠️ **거리를 함부로 늘리지 않는다.**
//    이안류는 해변마다 다르다. 지형·모래턱·파향이 몇백 미터 차이로 달라진다.
//    경포 값을 5km 떨어진 다른 해변의 값이라고 말하면, 부이 파고를 평균으로
//    보여줬던 것과 같은 종류의 잘못이 된다.
//    → 2km 안이면 "이 해변", 20km 안이면 "가까운 관측 해변(이름·거리 명시)",
//      그 밖은 **아무 말도 하지 않는다.**
//
// ⚠️ 등급(관심·주의·경계·위험)은 국립해양조사원이 매긴 것을 그대로 쓴다.
//    지수(lastScr)에 우리가 기준을 붙여 다시 나누지 않는다.
//
// ⚠️ 관측은 **해수욕장 개장 기간에만** 한다. 겨울에 비는 건 고장이 아니다.

import { API } from './config.js';

/** 같은 해변으로 볼 거리 */
const SAME_KM = 2;
/** 이 밖이면 말하지 않는다 */
const NEAR_KM = 20;
/** ⚠️ 이보다 오래된 관측은 "지금"이라고 말하지 않는다.
 *  5분마다 갱신되는 자료라 40분이 넘었다면 수집이 멈춘 것이다. */
const STALE_MIN = 40;

let _cache = null, _at = 0, _inflight = null;

export async function coastData() {
  if (_cache && Date.now() - _at < 3 * 60_000) return _cache;
  // ⚠️ 여러 화면이 동시에 열리면 같은 파일을 여러 번 받는다. 하나로 묶는다.
  if (_inflight) return _inflight;
  _inflight = (async () => {
    try {
      const r = await fetch(`${API.EVENTS}/coast-kr.json`, { cache: 'no-cache' });
      // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님).
      if (!r.ok) throw new Error('coast ' + r.status);
      _cache = await r.json();
      _at = Date.now();
      return _cache;
    } catch (_) {
      // ⚠️ 실패를 캐시하지 않는다. 다음에 다시 시도해야 한다.
      return null;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}

function km(aLat, aLon, bLat, bLon) {
  const R = 6371, rad = (d) => d * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "2026-08-04 00:45" (KST) → 몇 분 전인가.
 *  ⚠️ new Date("2026-08-04 00:45") 는 브라우저마다 다르게 읽는다(사파리에서 NaN).
 *     직접 쪼개고 +9 를 빼야 한다. */
function ageMin(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, H, M] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, H, M) - 9 * 3600_000;
  return (Date.now() - ms) / 60_000;
}

/**
 * 이 좌표에서 쓸 수 있는 이안류 관측.
 * @returns null | { beach, distKm, same, stale, ageMin, grade, rank, score, ... }
 */
export async function nearestRip(lat, lon) {
  if (lat == null || lon == null) return null;
  const d = await coastData();
  const list = d?.rip?.beaches || [];
  let best = null, bestD = Infinity;
  for (const b of list) {
    if (b.lat == null || b.lon == null) continue;
    const dist = km(lat, lon, b.lat, b.lon);
    if (dist < bestD) { best = b; bestD = dist; }
  }
  if (!best || bestD > NEAR_KM) return null;
  const age = ageMin(best.at);
  return {
    ...best,
    distKm: bestD,
    same: bestD <= SAME_KM,
    ageMin: age,
    // ⚠️ 오래된 값을 "지금"이라고 말하지 않는다. 화면이 이걸 보고 표현을 바꾼다.
    stale: age != null && age > STALE_MIN,
    watched: d?.rip?.watched ?? null,
  };
}

/** 전국에서 지금 경계 이상인 해변 (요약·브리핑용) */
export async function ripWarnings() {
  const d = await coastData();
  const b = (d?.rip?.beaches || []).filter((x) => (x.gradeRank || 0) >= 3);
  return { list: b, generatedKst: d?.generatedKst || null,
           watched: d?.rip?.watched ?? null };
}

/** 가장 가까운 조위 관측소 — 실제로 잰 조위·수온.
 *  ⚠️ 조위는 부이 파고와 달리 **먼 곳 값이 거의 쓸모없다.** 만 하나 건너면 다르다.
 *     그래서 60km 로 끊는다. */
export async function nearestTide(lat, lon, maxKm = 60) {
  if (lat == null || lon == null) return null;
  const d = await coastData();
  let best = null, bestD = Infinity;
  for (const s of d?.tide?.stations || []) {
    if (s.lat == null || s.lon == null) continue;
    const dist = km(lat, lon, s.lat, s.lon);
    if (dist < bestD) { best = s; bestD = dist; }
  }
  if (!best || bestD > maxKm) return null;
  return { ...best, distKm: bestD, ageMin: ageMin(best.at) };
}

/* 등급별 색 — ⚠️ 네 단계를 **두 색으로 뭉뚱그리지 않는다.**
   '주의'와 '위험'이 같은 빨강이면 등급을 나눈 의미가 없다. */
export const RIP_COLOR = {
  관심: '#4ade80', 주의: '#facc15', 경계: '#fb923c', 위험: '#f87171',
};
export const RIP_EN = {
  관심: 'Low', 주의: 'Caution', 경계: 'Alert', 위험: 'Danger',
};
