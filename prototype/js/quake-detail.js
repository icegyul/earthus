// 지진 한 건이 "어디서 어떻게 진행됐나" — USGS 상세 문서에서 읽어 오는 사실들
//
// 받은 지적(2026-09-07): "쓰나미와 지진은 여기서 누르면 어디서 어떻게 진행되었다던지
// 그런 정보가 없어. 지구에 표시를 해줘."
//
// ⚠️ 여기서 하는 일은 **옮기는 것**뿐이다. 흔들림 세기도, 느낀 사람 수도, 피해 등급도
//    전부 USGS 가 낸 값이다. 우리가 계산하거나 보정하지 않는다.
// ⚠️ 없는 것은 없다고 적는다. ShakeMap 이 없는 지진이 훨씬 많고(작은 지진·해저 지진),
//    그때 "흔들림 없음"이라고 쓰면 거짓말이 된다 — "아직 산출되지 않았습니다"라고 쓴다.
// ⚠️ MMI 는 사람이 느낀 정도를 나타내는 **수정 메르칼리 진도**다. 규모(M)와 다른 값이고,
//    말 설명은 USGS 가 공표한 등급 표현을 그대로 옮긴다. 새로 지어내지 않는다.

import { i18n } from './i18n.js';
import { fetchT } from './net.js';

/* 상세 문서는 한 지진당 한 번만 받는다 — 단층 메커니즘(faultmech.js)도 같은 문서를 쓴다. */
const docCache = new Map();   // detailUrl → 원본 문서 (실패는 null)
const contCache = new Map();  // contourUrl → GeoJSON (실패는 null)

/** USGS 상세 GeoJSON 한 건. 실패하면 null — 부르는 쪽이 "확인 불가"로 적는다. */
export async function usgsDetail(detailUrl) {
  if (!detailUrl) return null;
  if (docCache.has(detailUrl)) return docCache.get(detailUrl);
  let doc = null;
  try {
    const r = await fetchT(detailUrl, { timeout: 12_000 });
    if (r.ok) doc = await r.json();
  } catch (_) { /* 지진 정보 자체는 그대로 보여줘야 한다 */ }
  docCache.set(detailUrl, doc);
  return doc;
}

/* 수정 메르칼리 진도(MMI) — USGS 가 쓰는 등급 표현.
   ⚠️ 경계값·표현을 임의로 바꾸지 않았다. USGS ShakeMap 범례를 그대로 옮겼다. */
const MMI = [
  { max: 1.5, roman: 'I', ko: '느끼지 못함', en: 'Not felt', color: '#ffffff' },
  { max: 3.5, roman: 'II–III', ko: '실내에서 일부만 느낌', en: 'Weak', color: '#bfccff' },
  { max: 4.5, roman: 'IV', ko: '창문·그릇이 흔들림', en: 'Light', color: '#87cdf7' },
  { max: 5.5, roman: 'V', ko: '거의 모두 느끼고 물건이 넘어짐', en: 'Moderate', color: '#53ffcc' },
  { max: 6.5, roman: 'VI', ko: '놀라 밖으로 나옴 · 가벼운 피해', en: 'Strong', color: '#ffff00' },
  { max: 7.5, roman: 'VII', ko: '서 있기 어려움 · 부실한 건물 손상', en: 'Very strong', color: '#ffcc00' },
  { max: 8.5, roman: 'VIII', ko: '건물에 상당한 피해', en: 'Severe', color: '#ff9900' },
  { max: 9.5, roman: 'IX', ko: '튼튼한 건물도 큰 피해', en: 'Violent', color: '#ff0000' },
  { max: 99, roman: 'X+', ko: '대부분의 건물이 무너짐', en: 'Extreme', color: '#c00000' },
];

/** MMI 값 → { roman, word, color }. 값이 없으면 null. */
export function mmiWord(v) {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  const row = MMI.find(r => n < r.max) || MMI[MMI.length - 1];
  return { roman: row.roman, word: i18n.lang === 'ko' ? row.ko : row.en, color: row.color, value: n };
}

/* PAGER 예상 피해 경보색 — USGS 가 정한 4단계. 뜻풀이도 USGS 설명을 옮긴 것이다. */
const PAGER = {
  green:  { ko: '피해 거의 없음 (녹색)', en: 'Little damage (green)', color: '#4caf50' },
  yellow: { ko: '국지적 피해 가능 (노랑)', en: 'Local damage possible (yellow)', color: '#ffd54f' },
  orange: { ko: '상당한 피해 가능 (주황)', en: 'Significant damage possible (orange)', color: '#ff9800' },
  red:    { ko: '큰 피해 가능 (빨강)', en: 'Extensive damage possible (red)', color: '#f44336' },
};

/** 깊이가 무슨 뜻인지 — 지진학의 통상 구분(70/300 km)을 그대로 쓴다. */
export function depthWord(km) {
  if (km == null || !Number.isFinite(Number(km))) return null;
  const d = Number(km);
  const ko = i18n.lang === 'ko';
  if (d < 70) return ko
    ? '얕은 지진입니다. 진원이 지표에 가까워 같은 규모라도 흔들림이 세게 전해집니다.'
    : 'Shallow. The source is close to the surface, so shaking is felt more strongly.';
  if (d < 300) return ko
    ? '중간 깊이입니다. 흔들림이 넓게 퍼지는 대신 진앙 부근의 세기는 얕은 지진보다 약합니다.'
    : 'Intermediate depth — shaking spreads wider but is weaker near the epicentre.';
  return ko
    ? '깊은 지진입니다. 매우 넓은 지역에서 약하게 느껴지고, 지표 피해는 드뭅니다.'
    : 'Deep. Felt weakly over a very wide area; surface damage is rare.';
}

/**
 * 지진 한 건의 "어떻게" — 전부 USGS 값이다.
 * 돌려주는 값의 필드가 null 이면 **그 값이 산출되지 않았다는 뜻**이다(0 이 아니다).
 */
export async function quakeImpact(detailUrl) {
  const doc = await usgsDetail(detailUrl);
  if (!doc) return null;
  const p = doc.properties || {};
  const prods = p.products || {};
  const num = v => (v == null || v === '' ? null : Number(v));

  /* ShakeMap 등진도선 — 6 KB 안팎의 작은 파일이고 CORS 가 열려 있다(실측).
     색까지 파일에 들어 있어 우리가 색을 고르지 않아도 된다. */
  const sm = (prods.shakemap || [])[0];
  const cont = sm?.contents?.['download/cont_mmi.json'];

  return {
    mag: num(p.mag),
    magType: p.magType || null,
    place: p.place || null,
    time: num(p.time),
    depthKm: doc.geometry?.coordinates?.[2] != null ? Number(doc.geometry.coordinates[2]) : null,
    lat: doc.geometry?.coordinates?.[1] ?? null,
    lon: doc.geometry?.coordinates?.[0] ?? null,
    /* 사람들이 "느꼈다"고 직접 신고한 수. 신고가 없는 지역은 0 이 아니라 '모름'이다. */
    felt: num(p.felt),
    cdi: num(p.cdi),                       // 신고로 만든 진도
    mmi: num(p.mmi),                       // 계기·모델로 만든 최대 진도
    alert: p.alert ? { id: p.alert, ...(PAGER[p.alert] || {}) } : null,
    tsunamiFlag: p.tsunami === 1,
    status: p.status || null,              // reviewed = 사람이 검토함, automatic = 자동
    sig: num(p.sig),
    url: p.url || null,
    shakemapUrl: cont?.url || null,
    hasShakemap: !!cont,
    hasPager: !!(prods.losspager || []).length,
  };
}

/** ShakeMap 등진도선 GeoJSON. 없거나 실패하면 null. */
export async function shakemapContours(url) {
  if (!url) return null;
  if (contCache.has(url)) return contCache.get(url);
  let out = null;
  try {
    const r = await fetchT(url, { timeout: 12_000 });
    if (r.ok) out = await r.json();
  } catch (_) { /* 등진도선이 없어도 진앙은 찍는다 */ }
  contCache.set(url, out);
  return out;
}

/**
 * 여진 — **우리가 이미 받아 둔 목록에서 세는 것**이다. 새로 조회하지 않는다.
 * ⚠️ 우리 목록은 규모 2.5 이상 최근 것만 담고 있다. 그래서 "이 목록 안에서 n건"이라고 적는다.
 *    실제 여진은 이보다 훨씬 많다 — 그렇게 화면에 쓴다.
 */
export function aftershocksNear(items, main, radiusKm = 150) {
  if (!Array.isArray(items) || !main) return null;
  const t0 = main.data?._time;
  if (t0 == null) return null;
  const R = 6371;
  const rad = d => (d * Math.PI) / 180;
  const near = items.filter(q => {
    if (q.id === main.id) return false;
    const t = q.data?._time;
    if (t == null || t <= t0) return false;
    const dLat = rad(q.lat - main.lat);
    const dLon = rad(q.lon - main.lon);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(rad(main.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))) <= radiusKm;
  });
  if (!near.length) return { count: 0, maxMag: null, radiusKm };
  return {
    count: near.length,
    maxMag: near.reduce((a, q) => Math.max(a, q.data._mag || 0), 0),
    radiusKm,
  };
}
