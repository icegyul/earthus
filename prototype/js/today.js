// 오늘의 지구 — 우리가 가진 자료만으로 만드는 "오늘 지구에서 가장 ○○한 곳"
//
// 왜 만드나 (받은 방향)
//   "커뮤니티는 사람들이 더 체류할 수 있는 재미있는 기능이 뭐가 있는지 고민해봐야겠어"
//
//   경고를 이벤트로 옮기고 나니 커뮤니티에 개발 요청만 남았다.
//   돌아올 이유가 필요한데, 우리에겐 이미 매시간 갱신되는 전지구 자료가 있다.
//   그걸로 매일 달라지는 화면을 만들 수 있다 — 새 데이터도, 사람 손도 필요 없다.
//
// ⚠️ 이 화면의 모든 숫자는 **우리가 센 것**이다. 지어낸 문장이 하나도 없다.
//    "오늘 가장 파도가 높은 곳: 남대서양 9.8m" — 격자에서 최댓값을 찾은 것이다.
//    형용사를 붙이지 않는다. "무시무시한 파도"라고 쓰는 순간 근거가 없어진다.
//
// ⚠️ 순위를 매기되 등수를 경쟁으로 만들지 않는다.
//    재난을 랭킹으로 소비하게 하면 안 된다. 그래서 지진·산불은 "가장 큰"이 아니라
//    "지금 진행 중"으로 적고, 눌러서 사건 자체로 갈 수 있게만 한다.

import { i18n } from './i18n.js';
import { API } from './config.js';

/* 무엇을 뽑을까 — 격자에서 최댓값(또는 최솟값)을 찾는다.
   ⚠️ 5° 격자라 "어느 나라"까지는 못 말한다. 위경도와 대략의 해역만 적는다. */
const PICKS = [
  { id: 'wave',  src: 'marine', field: 'wave',  unit: 'm',
    ko: '가장 파도가 높은 바다', en: 'Roughest sea', mode: 'max', fix: 1 },
  { id: 'sst',   src: 'marine', field: 'sst',   unit: '°C',
    ko: '가장 따뜻한 바다', en: 'Warmest sea', mode: 'max', fix: 1 },
  { id: 'sstc',  src: 'marine', field: 'sst',   unit: '°C',
    ko: '가장 차가운 바다', en: 'Coldest sea', mode: 'min', fix: 1 },
  { id: 'temp',  src: 'wind',   field: 't',     unit: '°C',
    ko: '가장 더운 곳', en: 'Hottest place', mode: 'max', fix: 1 },
  { id: 'cold',  src: 'wind',   field: 't',     unit: '°C',
    ko: '가장 추운 곳', en: 'Coldest place', mode: 'min', fix: 1 },
  { id: 'wind',  src: 'wind',   field: null,    unit: 'km/h',
    ko: '바람이 가장 센 곳', en: 'Windiest place', mode: 'wind', fix: 0 },
  { id: 'dust',  src: 'air',    field: 'dust',  unit: 'µg/m³',
    ko: '먼지가 가장 많은 하늘', en: 'Dustiest sky', mode: 'max', fix: 0 },
  { id: 'uv',    src: 'air',    field: 'uv',    unit: '',
    ko: '자외선이 가장 강한 곳', en: 'Strongest UV', mode: 'max', fix: 1 },
  { id: 'fog',   src: 'wind',   field: 'vis',   unit: 'm',
    ko: '가장 앞이 안 보이는 곳', en: 'Lowest visibility', mode: 'min', fix: 0 },
];

/* 대략의 해역·대륙 이름. ⚠️ 정확한 지명이 아니다 — "대략 이 근처"로만 쓴다.
   역지오코딩을 쓰면 정확해지지만 격자점 9개마다 외부 요청을 보내게 된다. */
function roughPlace(lat, lon) {
  const ko = i18n.lang === 'ko';
  const ns = lat >= 0 ? (ko ? '북' : 'N') : (ko ? '남' : 'S');
  let basin;
  const L = ((lon + 180) % 360) - 180;
  if (lat > 66) basin = ko ? '북극해' : 'Arctic';
  else if (lat < -60) basin = ko ? '남극해' : 'Southern Ocean';
  else if (L > -70 && L < 20) basin = ko ? '대서양' : 'Atlantic';
  else if (L >= 20 && L < 100) basin = ko ? '인도양·아프리카' : 'Indian Ocean / Africa';
  else if (L >= 100 && L < 180) basin = ko ? '서태평양·아시아' : 'W Pacific / Asia';
  else basin = ko ? '동태평양·아메리카' : 'E Pacific / Americas';
  return `${basin} ${Math.abs(lat).toFixed(0)}°${ns} ${Math.abs(L).toFixed(0)}°${L >= 0 ? 'E' : 'W'}`;
}

export const today = {
  _cache: null,
  _at: 0,

  /** 오늘의 항목들. 30분 캐시 — 격자가 매시간 갱신되므로 더 자주 볼 이유가 없다. */
  async build() {
    if (this._cache && Date.now() - this._at < 30 * 60_000) return this._cache;
    const { gridOverlay } = await import('./gridoverlay.js');

    const grids = {};
    await Promise.all(['wind', 'air', 'marine'].map(async src => {
      try { grids[src] = await gridOverlay.load(src); } catch (_) { grids[src] = null; }
    }));

    const out = [];
    for (const p of PICKS) {
      const g = grids[p.src];
      if (!g) continue;
      let best = null;

      if (p.mode === 'wind') {
        /* 풍속은 u·v 성분에서 만든다 — 격자에 속력 자체는 없다. */
        const u = g.u || [], v = g.v || [];
        for (let k = 0; k < u.length; k++) {
          if (u[k] == null || v[k] == null) continue;
          const sp = Math.hypot(u[k], v[k]) * 3.6;
          if (!best || sp > best.v) best = { v: sp, k };
        }
      } else {
        const arr = g[p.field];
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const val = arr[k];
          if (val == null) continue;
          if (!best || (p.mode === 'max' ? val > best.v : val < best.v)) best = { v: val, k };
        }
      }
      if (!best) continue;

      const iy = Math.floor(best.k / g.nx), ix = best.k % g.nx;
      const lat = g.lat0 + iy * g.res, lon = g.lon0 + ix * g.res;
      /* ⚠️ 온도는 설정 단위를 따른다. 나머지 단위(m, µg/m³ …)는 그대로다. */
      const shown = p.unit === '°C'
        ? i18n.temp(best.v, p.fix)
        : `${best.v.toFixed(p.fix)}${p.unit ? ' ' + p.unit : ''}`;
      out.push({
        id: p.id,
        title: i18n.lang === 'ko' ? p.ko : p.en,
        value: shown,
        place: roughPlace(lat, lon),
        lat, lon,
        layer: { wave: 'wave', sst: 'sst', sstc: 'sst', temp: 'temp', cold: 'temp',
                 wind: 'wind', dust: 'dust', uv: 'uv', fog: 'fog' }[p.id],
        time: g.time,
      });
    }

    this._cache = out;
    this._at = Date.now();
    return out;
  },

  /** 지금 진행 중인 사건 — 순위를 매기지 않고 "지금 몇 건"만 센다 */
  async counts() {
    const { pointLayers } = await import('./layers/registry.js');
    const ko = i18n.lang === 'ko';
    const rows = [];
    const add = (id, label) => {
      const L = pointLayers[id];
      if (L?.items?.length) rows.push({ id, label, n: L.items.length });
    };
    add('wildfire', ko ? '위성이 보는 산불' : 'Fires seen from orbit');
    add('quake', ko ? '오늘 지진' : 'Quakes today');
    add('buoy', ko ? '살아있는 해양 부이' : 'Reporting ocean buoys');
    add('landobs', ko ? '살아있는 지상 관측소' : 'Reporting ground stations');
    try {
      const { cyclones } = await import('./layers/cyclone.js');
      if (cyclones.list?.length) {
        rows.push({ id: 'cyclone', label: ko ? '추적 중인 폭풍' : 'Storms tracked',
                    n: cyclones.list.length });
      }
    } catch (_) { /* 태풍 레이어가 아직 없으면 그냥 뺀다 */ }
    return rows;
  },
};

export { roughPlace };
