/* 등산로 — 산을 고르면 그 산의 길을 지도에 그린다
 *
 * 받은 요청: "등산로도 하자. 등산로 길도 그려주고 산 날씨와 등산·하이킹에 필요한
 *            데이터. 서핑처럼 해주면 되겠어"
 *
 * ⚠️⚠️ **산 하나당 파일 하나다.** 전국 등산로를 한 덩어리로 만들면 몇 MB 가 되고,
 *    첫 화면에서 그걸 받게 된다. 고른 산의 것만 그때 받는다.
 *
 * ⚠️⚠️ **이 선은 "이 길로 가세요"가 아니다.** OpenStreetMap 에 그려진 길이고,
 *    폐쇄·낙석·출입통제·계절통제는 담겨 있지 않다. 국립공원 통제 구간이
 *    그대로 그려져 있을 수 있다. 화면에 그렇게 적는다.
 *
 * ⚠️ 길에는 고도가 없다. OSM way 에 ele 태그가 거의 없어서, "이 길이 얼마나 가파른가"는
 *    말할 수 없다. 못 내는 값을 흉내내지 않는다 — 대신 있는 것만 말한다:
 *      · sac_scale (있으면) — 국제 등산 난이도 등급
 *      · 길 이름 (있으면)
 *      · 총 길이
 */

import { viewer } from './viewer.js';
import { fetchT } from './net.js';
import { i18n } from './i18n.js';

/* 지면에서 띄우는 높이(m).
   ⚠️⚠️ 0 으로 두면 산비탈 지형에 먹혀 선이 통째로 사라진다.
      태풍 예보선에서 똑같이 겪었다(cyclone.js 의 LIFT_LINE_M 참고).
      산은 지형 기복이 크므로 바다보다 더 띄운다. */
const LIFT_M = 40;

/* 이 거리보다 멀면 길을 안 그린다.
   ⚠️ 전지구에서 등산로 수백 개를 그리면 지구가 실뭉치가 된다. */
const SHOW_MAX_M = 260_000;

/* sac_scale — 국제 산악연맹 등급. ⚠️ 우리가 매긴 것이 아니다. */
const SAC_KO = {
  hiking: '산책로',
  mountain_hiking: '일반 등산로',
  demanding_mountain_hiking: '험한 등산로',
  alpine_hiking: '알파인 — 손을 쓴다',
  demanding_alpine_hiking: '알파인(상급)',
  difficult_alpine_hiking: '알파인(최상급) — 장비 필요',
};

/* 등급별 색. ⚠️ 색으로 "좋다/나쁘다"가 아니라 **얼마나 험한가**를 말한다. */
const SAC_COLOR = {
  hiking: '#9fd8b0',
  mountain_hiking: '#8fd0e8',
  demanding_mountain_hiking: '#f2c15a',
  alpine_hiking: '#f0955a',
  demanding_alpine_hiking: '#e8705a',
  difficult_alpine_hiking: '#d8455a',
};
const PLAIN = '#8fd0e8';

function km(a1, o1, a2, o2) {
  const R = 6371, r = Math.PI / 180;
  const dl = (o2 - o1) * r, dp = (a2 - a1) * r;
  const h = Math.sin(dp / 2) ** 2
    + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const trails = {
  ds: null,
  _cache: new Map(),      // 산 이름 → 자료
  _shown: null,

  _ensure() {
    if (!this.ds) {
      this.ds = new Cesium.CustomDataSource('trails');
      viewer.dataSources.add(this.ds);
    }
    return this.ds;
  },

  clear() {
    try { this.ds?.entities.removeAll(); } catch (_) { }
    this._shown = null;
  },

  /* 색인 — **이름이 아니라 좌표로 찾는다.**
     ⚠️⚠️ 기상청 산 목록은 바뀐다. 실측(2026-08-03): 하루 사이에 78곳 → 84곳이 되고
        "지리산(노고단대피소)"가 "지리산(정상)"으로 바뀌어, 받아 둔 39개 중
        **20개만 이름이 맞았다.** 이름으로 찾으면 자료가 있는데도 없다고 나온다. */
  async index() {
    if (this._idx) return this._idx;
    try {
      const r = await fetchT('data/trails/index.json', { cache: 'force-cache' });
      this._idx = r.ok ? await r.json() : { peaks: [], maxKm: 5 };
    } catch (_) { this._idx = { peaks: [], maxKm: 5 }; }
    return this._idx;
  },

  /** 그 산의 등산로 자료. 없으면 null (자료가 없는 산도 있다 — 지어내지 않는다) */
  async load(peak) {
    const name = typeof peak === 'string' ? peak : peak?.name;
    const key = String(name || '');
    if (this._cache.has(key)) return this._cache.get(key);

    const idx = await this.index();
    let file = null;
    if (peak?.lat != null && peak?.lon != null) {
      /* ⚠️ 5km 를 넘으면 다른 산으로 본다. 지리산 노고단과 천왕봉은 25km 떨어져
         등산로가 완전히 다르다 — 가깝다고 아무거나 붙이면 엉뚱한 길을 그린다. */
      const max = idx.maxKm ?? 5;
      let best = null, bd = Infinity;
      (idx.peaks || []).forEach(p => {
        const d = km(peak.lat, peak.lon, p.la, p.lo);
        if (d < bd) { bd = d; best = p; }
      });
      if (best && bd <= max) file = best.f;
    }
    if (!file) {
      const hit = (idx.peaks || []).find(p => p.n === key);
      if (hit) file = hit.f;
    }
    if (!file) { this._cache.set(key, null); return null; }

    let doc = null;
    try {
      const r = await fetchT(`data/trails/${encodeURIComponent(file)}`,
                             { cache: 'force-cache' });
      if (r.ok) doc = await r.json();
    } catch (_) { /* 없으면 조용히 넘어간다 */ }
    this._cache.set(key, doc);
    return doc;
  },

  /** 통계 — 시트에 적을 값 */
  stats(doc) {
    if (!doc?.ways?.length) return null;
    let total = 0;
    const bySac = new Map();
    const names = new Set();
    doc.ways.forEach(w => {
      let d = 0;
      for (let i = 1; i < w.p.length; i++) {
        d += km(w.p[i - 1][1], w.p[i - 1][0], w.p[i][1], w.p[i][0]);
      }
      total += d;
      if (w.s) bySac.set(w.s, (bySac.get(w.s) || 0) + d);
      if (w.n) names.add(w.n);
    });
    return {
      ways: doc.ways.length,
      km: Math.round(total * 10) / 10,
      named: [...names].slice(0, 6),
      namedN: names.size,
      sac: [...bySac.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ key: k, ko: SAC_KO[k] || k, km: Math.round(v * 10) / 10 })),
    };
  },

  /** 지도에 그린다. ⚠️ 이미 그 산이 그려져 있으면 아무것도 안 한다. */
  async show(peak) {
    const name = peak?.name;
    if (!name) return null;
    if (this._shown === name) return this._cache.get(name);
    const doc = await this.load(peak);
    this.clear();
    this._shown = name;
    if (!doc?.ways?.length) return doc;

    const ds = this._ensure();
    doc.ways.forEach((w, i) => {
      const col = Cesium.Color.fromCssColorString(SAC_COLOR[w.s] || PLAIN);
      const flat = [];
      w.p.forEach(([lo, la]) => flat.push(lo, la, LIFT_M));
      ds.entities.add({
        id: `trail:${name}:${i}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(flat),
          width: 2,
          material: col.withAlpha(0.82),
          arcType: Cesium.ArcType.GEODESIC,
          clampToGround: false,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
        },
        _trail: name,
      });
    });
    return doc;
  },

  SAC_KO, SAC_COLOR, LIFT_M,
};
