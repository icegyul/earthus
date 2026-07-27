// 개기대(금환대) 좌표 — NASA 경로표를 받아 지도에 띠로 그릴 준비를 한다
//
// 왜 이 파일이 있나
//   식심 지점 하나만 찍으면 대개 바다다. "그럼 어디로 가야 보이나"에 답하지 못한다.
//   NASA GSFC 가 일식마다 북쪽 한계선·남쪽 한계선·중심선을 120초 간격으로 낸다.
//   eclipse-path Lambda 가 그걸 받아 S3 에 두고, 여기서 읽는다.
//
// ⚠️ 우리가 계산하지 않는다. NASA 표를 그대로 옮긴다.
//    개기대는 베셀 요소로 계산해야 하는데, 그걸 자체 구현해서 틀리면
//    "여기서 보인다"고 잘못 안내하는 것이 된다. 권위 있는 자료를 쓴다.

import { API } from './config.js';

export const eclipsePaths = {
  byslug: new Map(),
  meta: {},
  loaded: false,
  error: null,

  async load() {
    if (this.loaded) return this.byslug;
    try {
      const r = await fetch(`${API.EVENTS}/eclipse-paths.json`, { cache: 'no-cache' });   // ⚠️ 재검증 — 캐시된 옛 파일에 새 필드가 없어 한 번 헤맸다
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      (j.eclipses || []).forEach(e => this.byslug.set(e.slug, e));
      this.meta = { generated: j.generated, source: j.source, note: j.note };
      this.error = null;
    } catch (e) {
      // ⚠️ S3 는 없는 객체에 403 을 준다 (404 아님). 둘 다 "아직 없음"으로 본다.
      this.error = /\b(403|404)\b/.test(e.message) ? 'none' : e.message;
    }
    this.loaded = true;
    return this.byslug;
  },

  get(slug) { return this.byslug.get(slug) || null; },
};

/** 경도를 기준값 옆으로 펴준다 — 날짜변경선을 넘는 구간이 지구를 한 바퀴 돌지 않게.
    ⚠️ 이걸 안 하면 태평양을 건너는 일식에서 띠가 지구 전체를 덮는다. */
export function unwrapLon(lon, ref) {
  let v = lon;
  while (v - ref > 180) v -= 360;
  while (ref - v > 180) v += 360;
  return v;
}

/**
 * 띠를 **구간별 사각형**으로 만든다.
 *
 * ⚠️ 전체를 폴리곤 하나로 이으면 극지에서 자기 자신과 꼬인다.
 *    실측: 2026-08-12 의 17:06 행은 "남쪽 한계선"이 북쪽 한계선보다 더 북쪽이다
 *    (극 근처에서는 북/남이라는 구분 자체가 무의미해진다).
 *    구간마다 작은 사각형으로 나누면 그런 자료에도 그림이 깨지지 않는다.
 *
 * @returns [[lon,lat, lon,lat, lon,lat, lon,lat], ...]  각 사각형의 4각 (그리기 순서)
 */
/* 띠를 그리지 않는 위도. 이 위에서는 중심선만 그린다.
   ⚠️ 왜 필요한가 (실측)
     극 근처를 지나는 폴리곤은 Cesium 이 내부를 잘못 잡아 극에서 부채꼴이 생긴다.
     2026-08-12 일식에서 실제로 북극에 별 모양 아티팩트가 나타났다.
     그 구간의 실제 띠 폭은 275km 라 전지구 화면에서 한 픽셀도 안 된다 —
     안 그려도 잃는 정보가 없고, 그리면 없는 모양을 만들어낸다. */
const BAND_MAX_LAT = 80;

/* 표기 폭 대비 이 배수를 넘으면 그리지 않는다.
   ⚠️ 일출·일몰 쪽 끝 구간은 그림자가 지표를 스치듯 지나가서
      한계선 사이 거리가 표기 폭의 몇 배가 된다 (실측: 첫 행 3.9배, 끝 행 3.0배).
      그걸 그대로 그리면 띠가 끝에서 부풀어 보인다. */
const BAND_MAX_RATIO = 2.6;

function gcKm(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  return 6371 * Math.acos(Math.max(-1, Math.min(1,
    Math.sin(la1 * p) * Math.sin(la2 * p)
    + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p))));
}

export function bandQuads(rows) {
  const quads = [];
  let skipped = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    // 한계선이 없는 구간은 띠를 만들지 않는다 (그림자가 스치기만 하는 곳)
    if (a[1] == null || b[1] == null) { skipped++; continue; }
    // 극 근처는 중심선만 (위 주석)
    if (Math.max(Math.abs(a[1]), Math.abs(a[3]), Math.abs(b[1]), Math.abs(b[3])) > BAND_MAX_LAT) {
      skipped++; continue;
    }
    // 표기 폭과 크게 다르면 그리지 않는다 (끝 구간의 부풀림)
    const w = a[7];
    if (w) {
      const d = gcKm(a[1], a[2], a[3], a[4]);
      if (d / w > BAND_MAX_RATIO) { skipped++; continue; }
    }
    const ref = a[2];
    const aN = [unwrapLon(a[2], ref), a[1]];
    const bN = [unwrapLon(b[2], ref), b[1]];
    const bS = [unwrapLon(b[4], ref), b[3]];
    const aS = [unwrapLon(a[4], ref), a[3]];
    quads.push([...aN, ...bN, ...bS, ...aS]);
  }
  bandQuads.lastSkipped = skipped;
  return quads;
}

/** 실제 띠 폭 범위 (km) — 화면의 선 굵기와 혼동하지 않게 시트에 적는다.
    ⚠️ 전지구 화면에서 3px 선은 약 300km 에 해당한다. 실제 폭이 그와 비슷하다는
       뜻이 아니므로 숫자를 반드시 밝힌다. */
export function widthRange(rows) {
  const w = rows.map(r => r[7]).filter(v => v != null);
  if (!w.length) return null;
  return { min: Math.min(...w), max: Math.max(...w) };
}

/** 중심선 — 가장 오래 개기식이 보이는 선 */
export function centerLine(rows) {
  const pts = [];
  let ref = null;
  rows.forEach(r => {
    if (r[5] == null) return;
    if (ref === null) ref = r[6];
    const lon = unwrapLon(r[6], ref);
    ref = lon;
    pts.push(lon, r[5]);
  });
  return pts;
}
