// EARTHUS v2 — 내 장소 감시 (지시서 E)
//
// 네 조건을 본다: ① 내 특보 구역에 특보 발생 ② 팔로우한 사건에 새 회차 ③ 내 위치 400 km 안 M5+ 지진
//   ④ (2026-09-20 FOR ME × 시뮬레이션, 계약 §I) 최근 24시간 쓰나미 도달시간 계산이 내 장소 300 km 안의
//      한국 연안 지점에 첫 도달을 낸 경우. ⚠️ 이것은 SIMULATION 이다 — 공식 경보가 아니고, official:false 로
//      적고, 문장에도 그렇게 쓴다. 푸시·안전 판단 근거로 올리지 않는다(계약 §D 불변식 4 의 태도).
// 값을 만들지 않는다 — 특보 소스가 실패하면 "감시 중단"이지 "안전"이 아니다.
// 중복은 dedupeKey 로 막는다(같은 특보·같은 회차·같은 지진은 한 번만).
//
// 순수 함수 evaluateWatch() 가 판정하고, main.js 가 저장·표시·푸시를 맡는다.

const WATCH_KEY = 'earthus.watch';
const WATCH_MAX = 60;

export const loadWatch = () => { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch (e) { return []; } };
export const saveWatch = (log) => { try { localStorage.setItem(WATCH_KEY, JSON.stringify(log.slice(-WATCH_MAX))); } catch (e) { /* 저장 불가 */ } };

const R = Math.PI / 180;
export const kmBetween = (a, b) => {
  const dLat = (b.lat - a.lat) * R, dLon = (b.lon - a.lon) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

// 내 구역: 특보구역-관측지점 대응표에서 가장 가까운 지점의 구역. 경계선이 아니라 근사다 — 화면에 그렇게 적는다.
export function myZone(place, stations) {
  if (!place || !Array.isArray(stations) || !stations.length) return null;
  let best = null;
  for (const s of stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    const km = kmBetween(place, s);
    if (!best || km < best.km) best = { km, zone: s.zone, zoneName: s.zoneName, station: s.name };
  }
  return best;
}

/**
 * @param {object} p
 * @param {{lat:number,lon:number}} p.place
 * @param {{zone:string,zoneName:string}|null} p.zone
 * @param {{state:'OK'|'FAILED', active?:Array}} p.warn         특보 소스 상태 + 발효 목록
 * @param {Array} p.events                                     팔로우한 사건들의 패킷 목록 항목 [{eventId,name,lastRevisionAt,changeSummaryKo}]
 * @param {Array} p.quakes                                     피드의 지진 [{id,title,lat,lon,whenT,facts}]
 * @param {Set<string>} p.seen                                 이미 기록한 dedupeKey
 * @param {number} p.now
 * @returns {{ hits: Array, monitoring: 'ON'|'SUSPENDED', reason: string }}
 */
export const TSUNAMI_SIM_RADIUS_KM = 300;

export function evaluateWatch({ place, zone, warn, events = [], quakes = [], tsunamiEta = [], seen = new Set(), now = Date.now() }) {
  const hits = [];
  if (!place) return { hits, monitoring: 'SUSPENDED', reason: '위치 미등록' };
  let monitoring = 'ON', reason = '';
  // ① 내 구역 특보 — 소스 실패면 감시 중단이라고 말한다. "없음"으로 바꾸지 않는다.
  if (!warn || warn.state !== 'OK') {
    // FAILED 도, STALE(SLA 를 넘긴 자료)도 감시 근거가 못 된다 — 묵은 자료로 "새 특보 없음"을 판정하면 안 된다(PHASE 2 §6)
    monitoring = 'SUSPENDED'; reason = (warn && warn.reason) || (warn && warn.state === 'STALE' ? '특보 자료 STALE' : '특보 소스 조회 불가');
  } else if (zone) {
    for (const w of warn.active || []) {
      if (w.regionId !== zone.zone && w.parentId !== zone.zone) continue;
      const key = `warn:${zone.zone}:${w.kind}:${w.level}:${w.issuedKst || ''}`;
      if (seen.has(key)) continue;
      hits.push({ conditionId: 'zone-warning', dedupeKey: key, at: new Date(now).toISOString(),
        reasonKo: `내 구역(${zone.zoneName}) ${w.kind} ${w.level} 발효 (${(w.issuedKst || '').slice(4, 8)} ${(w.issuedKst || '').slice(8, 12)} KST)`, official: true });
    }
  }
  // ② 팔로우한 사건의 새 회차
  for (const e of events) {
    if (!e || !e.lastRevisionAt) continue;
    const key = `rev:${e.eventId}:${e.lastRevisionAt}`;
    if (seen.has(key)) continue;
    hits.push({ conditionId: 'follow-revision', dedupeKey: key, at: new Date(now).toISOString(), eventId: e.eventId,
      reasonKo: `${e.name} 새 회차 — ${e.changeSummaryKo || '변경 요약 없음'}`, official: false });
  }
  // ③ 400 km 안 M5+ (24시간 안)
  for (const q of quakes) {
    if (!q || !Number.isFinite(q.whenT) || now - q.whenT > 86400000) continue;
    const mag = parseFloat(String((q.facts && q.facts[0] ? q.facts[0][1] : '')).replace(/^M/, ''));
    if (!(mag >= 5)) continue;
    const km = Math.round(kmBetween(place, q));
    if (km > 400) continue;
    const key = `eq:${q.id}`;
    if (seen.has(key)) continue;
    hits.push({ conditionId: 'nearby-quake', dedupeKey: key, at: new Date(now).toISOString(), eventId: q.id,
      reasonKo: `${km} km 거리 ${q.title} (USGS 관측)`, official: true });
  }
  // ④ 쓰나미 도달시간 계산(SIMULATION) — aws/tsunami-eta 색인(ocean/tsunami-eta.json)의 nearestKorea
  //    (한국 연안에서 가장 먼저 닿는 지점)가 내 장소 300 km 안이면 적는다. 없는 계산을 만들지 않는다 — 색인에
  //    nearestKorea 가 없으면(한국까지 닿지 않거나 계산 대상이 아님) 아무것도 적지 않는다.
  for (const e of tsunamiEta) {
    const nk = e && e.nearestKorea;
    const at = e && Date.parse(e.computedAt);
    if (!nk || !Number.isFinite(nk.lat) || !Number.isFinite(nk.lon) || !Number.isFinite(nk.etaMin)) continue;
    if (!Number.isFinite(at) || now - at > 86400000) continue;
    const km = Math.round(kmBetween(place, nk));
    if (km > TSUNAMI_SIM_RADIUS_KM) continue;
    const key = `tsu:${e.usgsId}`;
    if (seen.has(key)) continue;
    hits.push({ conditionId: 'tsunami-eta-sim', dedupeKey: key, at: new Date(now).toISOString(), eventId: e.usgsId,
      runRef: `tsunami-eta:${e.usgsId}`, simulation: true, official: false,
      reasonKo: `쓰나미 도달시간 계산 — ${nk.name} 약 ${nk.etaMin}분(발생 기준, 내 장소 ${km} km) · 시뮬레이션, 공식 경보 아님 — 기상청·PTWC 발표를 따르세요` });
  }
  return { hits, monitoring, reason };
}
