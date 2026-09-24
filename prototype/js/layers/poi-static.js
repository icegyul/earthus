// 명소 정적 파일 — 칸 고르기·합치기·자르기 (Cesium·DOM 없음 — node 시험이 그대로 불러 쓴다)
//
// 2026-09-24: v1 '명소'가 확대할 때마다 브라우저에서 공용 Overpass(overpass-api.de)를 직접 불렀다.
//   공용 서버는 커뮤니티 운영이고(OSM 위키: 상업 이용은 자체·유료 서버), 이용자 요청을 합산해 본다 —
//   504 로 멈춘 날엔 레이어가 조용히 비었다. 이제 aws/travel-poi 가 하루 1회 5°칸 파일을 만들고
//   브라우저는 그 파일만 읽는다(docs/OPEN-METEO-REPLACEMENT-MAP-2026-09-24.md §5).
//   자료는 여전히 OpenStreetMap 이다 — "© OpenStreetMap contributors"(ODbL 1.0) 는 색인과 화면 출처 줄에 그대로 있다.

/** 화면 경계상자(west·south·east·north)와 겹치는 색인 칸들. count 0 칸(바다·빈 칸)은 받지 않는다. */
export function tilesForView(index, rect) {
  const tiles = index?.tiles || {};
  const out = [];
  for (const [key, t] of Object.entries(tiles)) {
    if (![t?.s, t?.w, t?.n, t?.e].every(Number.isFinite)) continue;
    if (t.n <= rect.south || t.s >= rect.north) continue;
    if (!lonOverlaps(t.w, t.e, rect.west, rect.east)) continue;
    out.push({ key, count: t.count || 0, fetchedAt: t.fetchedAt || null });
  }
  return out;
}

/** 화면이 덮는 나라 경계상자와 겹치는가 — 안 겹치면 "이 지역은 아직 준비되지 않았다"를 말한다. */
export function inCoverage(index, rect) {
  return (index?.coverage || []).some(c => {
    const b = c?.bbox;
    if (!b) return false;
    return !(b.north <= rect.south || b.south >= rect.north) && lonOverlaps(b.west, b.east, rect.west, rect.east);
  });
}

function lonOverlaps(w1, e1, w2, e2) {
  // 날짜변경선을 넘는 화면(west > east)은 두 조각으로 나눠 본다.
  if (w2 > e2) return lonOverlaps(w1, e1, w2, 180) || lonOverlaps(w1, e1, -180, e2);
  return !(e1 <= w2 || w1 >= e2);
}

/** 칸 파일 경로. 색인이 주는 틀(tilePath)을 따른다 — 박지 않는다. */
export function tileUrl(base, index, key) {
  const tpl = index?.tilePath || 'tiles/{key}.json';
  return `${base}/${tpl.replace('{key}', encodeURIComponent(key))}`;
}

/** 칸 파일 여러 개 → 화면 안의 항목. 순서는 서버 순위(위키 연결 → 드문 종류 → id)를 그대로 따른다. */
export function pickItems(tileDocs, rect, cap = 120) {
  const seen = new Set();
  const inView = [];
  for (const doc of tileDocs) {
    for (const it of doc?.items || []) {
      if (seen.has(it.id)) continue;
      if (!(it.la >= rect.south && it.la <= rect.north)) continue;
      if (!lonOverlaps(it.lo, it.lo + 1e-9, rect.west, rect.east)) continue;
      seen.add(it.id);
      inView.push(it);
    }
  }
  inView.sort((a, b) => ((a.w ? 0 : 1) - (b.w ? 0 : 1)) || (KIND_ORDER[a.k] ?? 9) - (KIND_ORDER[b.k] ?? 9) || a.id - b.id);
  return inView.slice(0, cap);
}

// aws/travel-poi/handler.py KIND_ORDER 와 같다.
export const KIND_ORDER = Object.freeze({ observatory: 0, planetarium: 1, aquarium: 2, zoo: 3, museum: 4, attraction: 5 });
