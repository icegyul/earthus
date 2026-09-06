// 쓰나미 도달시간 계산본 읽기 (EARTHUS 기준선 · SIMULATION_ONLY)
//
// ⚠️ 이건 **공식 예보가 아니다.** 장파 근사 c=√(g·h) 로 우리가 계산한 물리 근사고,
//    파고·침수·피해가 아니라 "첫 파가 닿을 수 있는 시각"이다. 화면에 항상 그렇게 적는다.
//    대피는 PTWC·기상청 원문 지시만 따른다.
// ⚠️ 계산 대상이 정해져 있다(색인의 rule 을 그대로 보여준다). 대상이 아닌 발표에
//    "계산 중"이라고 쓰지 않는다 — "대상이 아니다"라고 쓴다.
// ⚠️ 색인에 없는 사건 파일을 찌르면 S3 가 403 을 낸다(v2 QA 실측). 색인을 먼저 본다.

import { API } from './config.js';
import { fetchT } from './net.js';

const TTL = 5 * 60_000;
let index = null;      // { at, doc }
const files = new Map();

/** 계산본 색인. 실패하면 null. */
export async function etaIndex() {
  const now = Date.now();
  if (index && now - index.at < TTL) return index.doc;
  let doc = null;
  try {
    const r = await fetchT(`${API.OCEAN}/tsunami-eta.json`, { timeout: 10_000 });
    if (r.ok) doc = await r.json();
  } catch (_) { /* 없으면 없다고 적는다 */ }
  index = { at: now, doc };
  return doc;
}

const R = 6371;
const rad = d => (d * Math.PI) / 180;
function distKm(a, b, c, d) {
  const dLat = rad(c - a), dLon = rad(d - b);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/**
 * 쓰나미 발표 하나에 대응하는 계산본을 찾는다.
 * 발표문에는 USGS 사건 번호가 없다 — 그래서 **자리와 시각으로** 맞춘다.
 * 아무 것이나 갖다 붙이지 않도록 400 km · 3시간 안쪽만 같은 사건으로 본다.
 *
 * @returns {{state:'found'|'none'|'unavailable', rule?:string, eta?:object, event?:object}}
 */
export async function etaFor(t) {
  const idx = await etaIndex();
  if (!idx) return { state: 'unavailable' };
  const rule = idx.rule || null;
  if (t.lat == null || t.lon == null) return { state: 'none', rule };

  const sent = Date.parse(t.sent || t.updated || '') || null;
  let best = null;
  (idx.events || []).forEach(e => {
    const km = distKm(t.lat, t.lon, e.lat, e.lon);
    if (km > 400) return;
    if (sent != null && e.originUtc) {
      const gap = Math.abs(sent - Date.parse(e.originUtc)) / 3_600_000;
      if (gap > 3) return;
    }
    if (!best || km < best.km) best = { km, e };
  });
  if (!best) return { state: 'none', rule };

  const key = best.e.usgsId;
  if (!files.has(key)) {
    let doc = null;
    try {
      const r = await fetchT(`${API.OCEAN}/tsunami-eta/${key}.json`, { timeout: 12_000 });
      if (r.ok) doc = await r.json();
    } catch (_) { /* 계산본을 못 받으면 발표만 보여준다 */ }
    files.set(key, doc);
  }
  const eta = files.get(key);
  if (!eta) return { state: 'unavailable', rule };
  return { state: 'found', rule, eta, event: best.e };
}

/** 계산본에서 "가장 먼저 닿는 곳" 몇 군데. 없으면 빈 배열. */
export function soonest(eta, n = 5) {
  return (eta?.stations || [])
    .filter(s => s.etaMin != null)
    .sort((a, b) => a.etaMin - b.etaMin)
    .slice(0, n);
}
