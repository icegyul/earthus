/* 패러글라이딩 — 바람과 구름 밑면
 *
 * 받은 요청: "페러글라이더 인가? 그것도 있잖아. 여긴 대표하는 곳이 몇 군데 안 될 거야.
 *            담양이라던지. 그런 곳에 필요정보? 바람세기? 그런 거 찾아서 그것도 해줘"
 *
 * ⚠️⚠️ **좌표는 산 정상이지 이륙장이 아니다.**
 *    활공장 좌표를 공개하는 곳이 없다(대한패러글라이딩협회에도 목록만 있다).
 *    네이버 지도에는 있지만 그건 그쪽 자산이라 가져오지 않는다.
 *    → 활공장이 올라앉은 **산 이름**은 공개 자료에 나오므로, 그 산을 OSM 에서 찾았다.
 *    ⚠️ 이륙장은 정상에서 수백 m 안쪽에 있다. 바람을 보는 데는 쓸 만하지만
 *       **찾아가는 좌표로 쓰면 안 된다.** 화면에 그렇게 적는다.
 *
 * ⚠️⚠️ **"날기 좋다"고 말하지 않는다.** 서핑·낚시와 같은 규율이다.
 *    이륙 가능 여부는 그 사람의 등급·날개·경험·동료가 있는지에 달렸고,
 *    무엇보다 **이륙장이 어느 쪽을 보는지**를 우리는 모른다 —
 *    정풍이어야 뜨는데 그 방향을 자료로 갖고 있지 않다.
 *    우리가 할 수 있는 것은 값을 정확히 옮기고, 어느 구간인지 말하는 것뿐이다.
 *
 * 구름 밑면(운고)은 계산할 수 있다 — 기온과 이슬점 차이로 낸다(Espy 근사).
 *   ⚠️ 이건 우리가 지어낸 식이 아니라 항공기상에서 쓰는 표준 근사다.
 *      다만 **근사**이므로 실제와 수백 m 어긋난다. 그것도 적는다.
 */

import { API } from './config.js';
import { fetchT } from './net.js';
import { distKm } from './korea.js';

const SRC = 'data/para.json';

/* ── 바람 구간 ────────────────────────────────────────────────
   ⚠️ 우리가 정한 값이 아니라 교육 과정에서 통용되는 구간이다.
      그래도 **"우리 기준"이라고 화면에 밝힌다** — 협회 공식 기준이 아니다. */
const W_LIGHT = 3;     // 이 아래는 약함 (이륙이 어렵다)
const W_OK_HI = 6;     // 3~6 이 흔히 말하는 적정
const W_STRONG = 8;    // 이 위는 강함
const W_DANGER = 11;   // 이 위는 대부분 비행 중단

/* 돌풍과 평균의 차. ⚠️⚠️ **평균 풍속보다 이게 더 위험하다.**
   6m/s 평균에 돌풍 7m/s 는 다룰 만하지만, 4m/s 평균에 돌풍 12m/s 는
   날개가 접힌다. 그래서 두 값을 따로 보여주고 차이도 따로 말한다. */
const GUST_WATCH = 4;
const GUST_DANGER = 7;

export const PARA_RULES = {
  lightMs: W_LIGHT, okHiMs: W_OK_HI, strongMs: W_STRONG, dangerMs: W_DANGER,
  gustWatch: GUST_WATCH, gustDanger: GUST_DANGER,
};

const DIR16 = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동',
               '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
export const dir16 = (deg, ko) => deg == null ? '—'
  : (ko ? DIR16[Math.round(deg / 22.5) % 16]
        : ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16]);

/** 구름 밑면 높이(m, 지면 기준). 기온−이슬점 × 125 (Espy 근사).
 *  ⚠️ 근사다. 실제와 수백 m 어긋난다 — 화면에 그렇게 적는다.
 *  ⚠️ 값이 없으면 null. 0 으로 채우면 "구름이 땅에 붙었다"가 된다. */
export function cloudBaseM(tempC, dewC) {
  if (tempC == null || dewC == null) return null;
  const d = tempC - dewC;
  if (!(d >= 0)) return null;
  return Math.round(d * 125);
}

/** 바람이 어느 구간인가. ⚠️ "된다/안 된다"가 아니라 **구간 이름**만 말한다. */
export function windBand(ms) {
  if (ms == null) return null;
  if (ms >= W_DANGER) return 'danger';
  if (ms >= W_STRONG) return 'strong';
  if (ms >= W_OK_HI) return 'brisk';
  if (ms >= W_LIGHT) return 'ok';
  return 'light';
}

export const BAND_KO = {
  light: '약함 — 이륙이 어려울 수 있습니다',
  ok: '3~6m/s 구간입니다',
  brisk: '6~8m/s — 센 편입니다',
  strong: '8m/s 이상 — 강합니다',
  danger: '11m/s 이상 — 대부분 비행을 접습니다',
};
export const BAND_EN = {
  light: 'light — hard to launch',
  ok: '3-6 m/s band',
  brisk: '6-8 m/s — brisk',
  strong: 'over 8 m/s — strong',
  danger: 'over 11 m/s — most pilots stand down',
};

export const para = {
  list: [],
  meta: null,
  _now: new Map(),
  _at: 0,

  async load() {
    if (this.list.length) return this.list;
    const r = await fetchT(SRC, { cache: 'force-cache' });
    if (!r.ok) throw new Error('para ' + r.status);
    const j = await r.json();
    this.list = (j.sites || []).map(s => ({
      name: s.n, peak: s.peak, lat: s.la, lon: s.lo, alt: s.alt ?? null,
    }));
    this.meta = { generated: j.generated, note: j.note, source: j.source,
                  count: j.count };
    return this.list;
  },

  near(lat, lon, n = 20) {
    return this.list
      .map(s => ({ ...s, km: Math.round(distKm(lat, lon, s.lat, s.lon)) }))
      .sort((a, b) => a.km - b.km).slice(0, n);
  },

  /** 지금 값 — 한 번에 받는다 (10분 캐시)
   *  ⚠️ 지상 10m 바람이다. 이륙장 높이의 바람은 이것과 다르다 —
   *     산 위는 지형이 바람을 조이고 돌린다. 화면에 그렇게 적는다. */
  async now(items) {
    const fresh = Date.now() - this._at < 10 * 60_000;
    const need = items.filter(s => !(fresh && this._now.has(s.name)));
    if (!need.length) return this._now;
    if (!fresh) { this._now.clear(); this._at = Date.now(); }

    for (let i = 0; i < need.length; i += 16) {
      const chunk = need.slice(i, i + 16);
      const q = new URLSearchParams({
        latitude: chunk.map(s => s.lat.toFixed(3)).join(','),
        longitude: chunk.map(s => s.lon.toFixed(3)).join(','),
        current: 'temperature_2m,dew_point_2m,wind_speed_10m,wind_gusts_10m,'
               + 'wind_direction_10m,cloud_cover_low,cloud_cover,visibility,'
               + 'precipitation,cape',
        wind_speed_unit: 'ms',
        timezone: 'auto',
      });
      try {
        const r = await fetchT(`${API.WEATHER_POINT || 'https://api.open-meteo.com/v1/forecast'}?${q}`);
        if (!r.ok) continue;
        const j = await r.json();
        const rows = Array.isArray(j) ? j : [j];
        rows.forEach((row, k) => {
          const c = row?.current, s = chunk[k];
          if (!s || !c || c.wind_speed_10m == null) return;
          this._now.set(s.name, {
            wind: c.wind_speed_10m, gust: c.wind_gusts_10m,
            dir: c.wind_direction_10m,
            temp: c.temperature_2m, dew: c.dew_point_2m,
            cloudLow: c.cloud_cover_low, cloud: c.cloud_cover,
            vis: c.visibility, rain: c.precipitation, cape: c.cape,
            base: cloudBaseM(c.temperature_2m, c.dew_point_2m),
            at: c.time,
          });
        });
      } catch (e) {                                        // noqa
        console.warn('[활공장] 조회 실패', e.message);
      }
    }
    return this._now;
  },
};
