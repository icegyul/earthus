// 자연현상 3D 교육 콘텐츠 (§5-6) — 무료 티어
//
// §5-6 요구사항
//   · 팝업 설명창이 아니라 실제 지구본 좌표에 3D로 직접 표현
//   · 원리 설명이 아니라 "지금 이 위치에서 발생 중인 현상 + 며칠 후 변화 예측"
//   · 예측값은 GFS/ECMWF 수치를 그대로 쓴다 (자체 예보모델 개발 안 함)
//   · ⚠️ 학생 교육자료로 쓰이므로, 예보 수치에 근거한 문장만 생성한다.
//        "아마 ~할 것이다" 같은 일반화된 추측 문장이 섞이면 안 된다.
//
// 현재 상태
//   3D 에셋은 코드 밖 작업이라 아직 없다. 대신 **절차적 플레이스홀더**로 배치·스케일·
//   예보 연동을 전부 동작시켜 두었다. 에셋이 나오면 `render()` 안의 도형만 교체하면 된다.

import { viewer } from '../viewer.js';
import { store } from '../store.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';
import { API, C } from '../config.js';
import { fetchT } from '../net.js';
import { power } from '../power.js';

/* ── 열돔 판정 기준 ────────────────────────────────────────────
   열돔 = 상층(500hPa) 고기압 능이 정체하며 하강기류로 지표를 데우는 현상.
   지표 기온만으로는 단순 더위와 구분이 안 되므로 500hPa 지위고도를 함께 본다.
   임계값은 여름 중위도 기준 통상치이며, 실제 운영 전 기상 전문가 검수가 필요하다. */
const HEATDOME = {
  gph500_min: 5880,   // m — 이 이상이면 상층 고기압 능
  temp_min: 33,       // °C — 지표 최고기온
  persist_days: 3,    // 며칠 이상 지속되어야 "돔"으로 본다
};

/* 전지구 육지 스캔 격자 — 한 번의 요청으로 다 받는다 (Open-Meteo 다중지점 지원) */
const SCAN = [
  [37.5,127.0],[35.2,129.1],[35.7,139.7],[39.9,116.4],[31.2,121.5],
  [22.3,114.2],[13.8,100.5],[28.6,77.2],[25.2,55.3],[41.0,29.0],
  [55.8,37.6],[51.5,-0.1],[48.9,2.4],[40.4,-3.7],[41.9,12.5],
  [30.0,31.2],[-1.3,36.8],[6.5,3.4],[-33.9,18.4],[40.7,-74.0],
  [34.1,-118.2],[41.9,-87.6],[29.8,-95.4],[19.4,-99.1],[-23.5,-46.6],
  [-34.6,-58.4],[-33.9,151.2],[-37.8,145.0],[45.4,-75.7],[61.2,-149.9],
];

/* §4-7 해양 환류 — 정적 위치 */
const GYRES = [
  /* dir: +1 시계방향, -1 반시계방향.
     ⚠️ 임의로 정한 값이 아니다. 코리올리 효과 때문에 북반구 환류는 시계방향,
        남반구는 반시계방향으로 돈다. 지구 자전이 만드는 물리 현상이다.
        방향을 반대로 그리면 과학적으로 틀린 그림이 된다. */
  { id:'np', name:{ko:'북태평양 환류',en:'North Pacific Gyre'}, lat:32, lon:-155, r:2600, dir: 1 },
  { id:'sp', name:{ko:'남태평양 환류',en:'South Pacific Gyre'}, lat:-30, lon:-125, r:2400, dir:-1 },
  { id:'na', name:{ko:'북대서양 환류',en:'North Atlantic Gyre'}, lat:32, lon:-45,  r:1900, dir: 1 },
  { id:'sa', name:{ko:'남대서양 환류',en:'South Atlantic Gyre'}, lat:-28, lon:-15, r:1700, dir:-1 },
  { id:'io', name:{ko:'인도양 환류',  en:'Indian Ocean Gyre'},  lat:-32, lon:80,  r:1900, dir:-1 },
];

export const phenomena = {
  ds: null,        // 환류 등 정적 자연현상
  dsHeat: null,    // 열돔 — 따로 끌 수 있어야 한다
  found: [],
  /* 환류별 "흐름 굳히기" 예약. 다시 그릴 때 취소해야 옛 타이머가
     새로 만든 엔티티를 멈춰 세우는 일이 없다. (_drawGyreFlow 참고) */
  _flowFreeze: {},

  /* ⚠️ 데이터소스를 둘로 나눈 이유
     열돔은 반경 수백 km 를 덮는 큰 반투명 면이라, 다른 걸 보려는 사람에게는
     방해가 된다. 그런데 예전에는 '자연현상' 하나로 묶여 있어서
     환류를 보려면 열돔도 같이 켜야 했다.
     Cesium 의 show 는 데이터소스 단위라, 엔티티마다 켜고 끄는 것보다
     소스를 나누는 쪽이 간단하고 새는 곳이 없다. */
  init() {
    this.ds = new Cesium.CustomDataSource('phenomena');
    this.dsHeat = new Cesium.CustomDataSource('heatdome');
    viewer.dataSources.add(this.ds);
    viewer.dataSources.add(this.dsHeat);
    this.ds.show = false;
    this.dsHeat.show = false;
    return this;
  },

  /** 자연현상(환류 등) */
  set(on) {
    if (this.ds) this.ds.show = on;
    if (on && !this.found.length) this.refresh();
  },

  /** 열돔만 */
  setHeat(on) {
    if (this.dsHeat) this.dsHeat.show = on;
    // ⚠️ 열돔만 켰을 때도 자료를 받아와야 한다.
    //    안 그러면 켜도 아무것도 안 나와서 고장으로 보인다.
    if (on && !this.found.some(f => f.kind === 'heatdome')) this.refresh();
  },

  /** 둘 중 하나라도 켜져 있나 — 자료 갱신 여부 판단에 쓴다 */
  get anyOn() { return !!(this.ds?.show || this.dsHeat?.show); },

  _busy: null,

  async refresh() {
    // 동시 호출 방지 — 겹쳐 돌면 엔티티와 found 가 중복된다
    if (this._busy) return this._busy;
    this._busy = (async () => {
      try {
        /* ⚠️ 엔티티를 지우기 전에 예약된 "흐름 굳히기"를 취소한다.
           안 그러면 옛 타이머가 깨어나 새로 그린 흐름을 멈춰 세운다. */
        Object.values(this._flowFreeze).forEach(clearTimeout);
        this._flowFreeze = {};
        this.ds.entities.removeAll();
        this.dsHeat.entities.removeAll();
        this.found = [];
        await Promise.allSettled([this.scanHeatDomes()]);
        this.renderGyres();           // 정적 — 항상 표시
        return this.found;
      } finally {
        this._busy = null;
      }
    })();
    return this._busy;
  },

  /**
   * 이 지점이 지금 열돔인지 직접 판정한다.
   *
   * 왜 필요한가
   *   전지구 훑기는 도시 30곳만 본다. 한국에는 서울 하나뿐이다.
   *   그래서 "내가 있는 곳이 열돔인가?"를 답할 수 없었다.
   *   실측: 서울은 30~32°C 로 기준(33°C) 미달인데 대전·청주는 33~34°C 다.
   *         서울 하나로 한반도를 대표하면 대전에 대한 답이 틀린다.
   *
   * ⚠️ 이 함수가 판정과 설명을 동시에 만든다. 이게 핵심이다.
   *    설명글은 "열돔이다"라고 하는데 지도에는 없는 상황이 생기면 안 된다
   *    (실제로 그런 지적을 받았다). 판정이 참일 때만 설명이 나오고,
   *    참이면 지도에도 그린다 — 둘이 같은 계산에서 나오므로 어긋날 수 없다.
   *
   * @returns {{ isDome:boolean, days:number, peak:number, gph:number,
   *             reason:string, item:object|null }}
   */
  async checkAt(lat, lon) {
    const q = new URLSearchParams({
      latitude: lat.toFixed(4), longitude: lon.toFixed(4),
      daily: 'temperature_2m_max',
      hourly: 'geopotential_height_500hPa',
      forecast_days: '7', timezone: 'auto',
    });
    const r = await fetchT(`${API.METEO}?${q}`);
    if (!r.ok) throw new Error('heatdome-check ' + r.status);
    const j = await r.json();
    const d = j.daily, h = j.hourly;
    if (!d || !h) throw new Error('no data');

    const gphByDay = d.time.map(day => {
      const k = h.time.findIndex(t => t.startsWith(day) && t.endsWith('12:00'));
      return k >= 0 ? h.geopotential_height_500hPa[k] : null;
    });

    let run = 0;
    for (let i = 0; i < d.time.length; i++) {
      const hot = d.temperature_2m_max[i] >= HEATDOME.temp_min;
      const ridge = gphByDay[i] != null && gphByDay[i] >= HEATDOME.gph500_min;
      if (hot && ridge) run++; else break;
    }
    const peak = Math.max(...d.temperature_2m_max.slice(0, 7));
    const gph = Math.round(Math.max(...gphByDay.filter(v => v != null)));
    const isDome = run >= HEATDOME.persist_days;

    /* 아니라면 "왜 아닌지"를 말한다. 그냥 "해당 없음"은 정보가 아니다.
       상층 능은 있는데 기온이 모자란 것과, 둘 다 아닌 것은 다른 상황이다. */
    const ko = i18n.lang === 'ko';
    let reason;
    if (isDome) {
      reason = ko ? `${run}일 연속 조건 충족` : `${run} consecutive days meeting criteria`;
    } else {
      const ridgeOK = gph >= HEATDOME.gph500_min;
      const hotOK = peak >= HEATDOME.temp_min;
      if (ridgeOK && !hotOK) {
        reason = ko
          ? `상층 고기압 능은 있으나(최대 ${gph}m) 지표 최고기온이 ${i18n.temp(peak)} 로 기준 ${i18n.temp(HEATDOME.temp_min)} 에 못 미칩니다`
          : `An upper ridge is present (${gph}m) but the surface high of ${i18n.temp(peak)} is below the ${i18n.temp(HEATDOME.temp_min)} threshold`;
      } else if (!ridgeOK && hotOK) {
        reason = ko
          ? `기온은 높지만(${i18n.temp(peak)}) 상층 고기압 능이 약합니다(최대 ${gph}m, 기준 ${HEATDOME.gph500_min}m)`
          : `Hot (${i18n.temp(peak)}) but the upper ridge is weak (${gph}m vs ${HEATDOME.gph500_min}m)`;
      } else if (run > 0) {
        reason = ko
          ? `조건을 ${run}일만 충족했습니다 (${HEATDOME.persist_days}일 이상 필요)`
          : `Criteria met for only ${run} day(s); ${HEATDOME.persist_days}+ needed`;
      } else {
        reason = ko
          ? `지금은 열돔 조건이 아닙니다 (최고 ${i18n.temp(peak)}, 상층 ${gph}m)`
          : `Not a heat dome now (high ${i18n.temp(peak)}, upper ${gph}m)`;
      }
    }

    let item = null;
    if (isDome) {
      /* 판정이 참이면 지도에도 올린다. 이미 있는 열돔과 가까우면 새로 만들지 않는다. */
      const near = this.found.find(f => f.kind === 'heatdome'
        && Math.hypot((f.lat - lat) * 110.54,
                      (f.lon - lon) * 111.32 * Math.cos(lat * Math.PI / 180)) < 200);
      if (near) item = near;
      else {
        item = {
          id: `heatdome-at-${lat.toFixed(2)}-${lon.toFixed(2)}`,
          kind: 'heatdome', lat, lon, days: run, peak,
          gph: Math.round(gphByDay[0]), breaksOn: null,
          daily: { time: d.time, tmax: d.temperature_2m_max },
        };
        this.found.push(item);
        try { await this.measureExtent(item); } catch (_) { item.shape = null; }
        this.renderHeatDome(item);
      }
    }
    return { isDome, days: run, peak, gph, reason, item };
  },

  /* ══════════════════════════════════════════════════════════
     열돔 — 실제 감지 (Open-Meteo, GFS/ECMWF 기반)
     ══════════════════════════════════════════════════════════ */
  async scanHeatDomes() {
    const q = new URLSearchParams({
      latitude:  SCAN.map(p => p[0]).join(','),
      longitude: SCAN.map(p => p[1]).join(','),
      daily: 'temperature_2m_max',
      hourly: 'geopotential_height_500hPa',
      forecast_days: '7',
      timezone: 'auto',
    });
    const res = await fetchT(`${API.METEO}?${q}`);
    if (!res.ok) throw new Error('meteo-scan ' + res.status);
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [rows];

    list.forEach((r, idx) => {
      const [lat, lon] = SCAN[idx];
      const d = r.daily, h = r.hourly;
      if (!d || !h) return;

      // 하루 대표 500hPa 지위고도 = 그날 12시 값
      const gphByDay = d.time.map(day => {
        const k = h.time.findIndex(t => t.startsWith(day) && t.endsWith('12:00'));
        return k >= 0 ? h.geopotential_height_500hPa[k] : null;
      });

      // 오늘부터 며칠 연속으로 조건을 만족하는가
      let run = 0;
      for (let i = 0; i < d.time.length; i++) {
        const hot = d.temperature_2m_max[i] >= HEATDOME.temp_min;
        const ridge = gphByDay[i] != null && gphByDay[i] >= HEATDOME.gph500_min;
        if (hot && ridge) run++; else break;
      }
      if (run < HEATDOME.persist_days) return;

      // 소멸 예정일 — 조건이 깨지는 첫날
      let breaksOn = null;
      for (let i = run; i < d.time.length; i++) {
        const hot = d.temperature_2m_max[i] >= HEATDOME.temp_min;
        const ridge = gphByDay[i] != null && gphByDay[i] >= HEATDOME.gph500_min;
        if (!hot || !ridge) { breaksOn = { day: d.time[i], after: i }; break; }
      }

      const item = {
        id: `heatdome-${idx}`, kind: 'heatdome', lat, lon,
        days: run,
        peak: Math.max(...d.temperature_2m_max.slice(0, run)),
        gph: Math.round(gphByDay[0]),
        breaksOn,
        daily: { time: d.time, tmax: d.temperature_2m_max },
      };
      this.found.push(item);
    });

    /* 범위를 "실제로 재서" 그린다.
       ⚠️ 예전에는 반경을 260km + 지속일수×55km 로 만들어 냈다. 근거가 없는 숫자다.
          그 결과 7일 지속이면 반경 645km(지름 1,290km)짜리 원이 되어
          실제 열돔과 상관없이 거대하게 보였다 — "너무 크다"는 지적이 맞았다.
          이제는 중심점 주위를 실제로 훑어 조건이 끊기는 곳까지를 범위로 삼는다. */
    for (const item of this.found.filter(f => f.kind === 'heatdome')) {
      try { await this.measureExtent(item); }
      catch (e) { console.warn('[heatdome] 범위 측정 실패', e.message); item.shape = null; }
      this.renderHeatDome(item);
    }
  },

  /**
   * 열돔의 실제 범위를 측정한다.
   *
   * 중심에서 8방향으로 뻗어가며 각 지점의 조건(지표 최고기온 + 500hPa 능)을 확인하고,
   * 조건이 깨지는 지점 직전까지를 그 방향의 반경으로 잡는다.
   * → 원이 아니라 실제 모양(대개 타원·불규칙)이 나온다.
   *
   * ⚠️ Open-Meteo 는 한 요청에 100지점까지다. 8방향 × 8단계 = 64지점이면 한 번에 된다.
   * ⚠️ 조건이 끝까지 안 깨지면 "최소 이만큼"이라고 표시한다 (truncated).
   *    실제로는 더 넓은데 우리가 덜 본 것이므로, 그걸 확정처럼 그리면 안 된다.
   */
  async measureExtent(m) {
    const DIRS = 8, STEPS = 8, STEP_KM = 220;      // 최대 1,760 km 까지 훑는다
    const pts = [];
    for (let d = 0; d < DIRS; d++) {
      const a = (d / DIRS) * Math.PI * 2;
      for (let s = 1; s <= STEPS; s++) {
        const km = s * STEP_KM;
        const dLat = (km * Math.cos(a)) / 110.54;
        const dLon = (km * Math.sin(a)) / (111.32 * Math.cos(m.lat * Math.PI / 180));
        pts.push([Math.max(-89, Math.min(89, m.lat + dLat)), m.lon + dLon]);
      }
    }
    const q = new URLSearchParams({
      latitude: pts.map(p => p[0].toFixed(3)).join(','),
      longitude: pts.map(p => (((p[1] + 180) % 360 + 360) % 360 - 180).toFixed(3)).join(','),
      daily: 'temperature_2m_max',
      hourly: 'geopotential_height_500hPa',
      forecast_days: '1',
      timezone: 'UTC',
    });
    const r = await fetchT(`${API.METEO}?${q}`);
    if (!r.ok) throw new Error('extent ' + r.status);
    const rows = await r.json();
    const list = Array.isArray(rows) ? rows : [rows];

    const ok = list.map(x => {
      const tmax = x?.daily?.temperature_2m_max?.[0];
      const gphArr = x?.hourly?.geopotential_height_500hPa || [];
      const k = (x?.hourly?.time || []).findIndex(t => t.endsWith('12:00'));
      const gph = k >= 0 ? gphArr[k] : null;
      /* 가장자리 판정은 중심보다 살짝 느슨하게 잡는다.
         딱 임계로 자르면 경계가 톱니처럼 들쭉날쭉해진다 — 실제 기단은 그렇게 안 끝난다. */
      return tmax != null && gph != null
        && tmax >= HEATDOME.temp_min - 2 && gph >= HEATDOME.gph500_min - 20;
    });

    const ring = [];
    let truncated = false;
    for (let d = 0; d < DIRS; d++) {
      let reach = 0;
      for (let s = 0; s < STEPS; s++) {
        if (!ok[d * STEPS + s]) break;
        reach = (s + 1) * STEP_KM;
      }
      if (reach === STEPS * STEP_KM) truncated = true;
      const a = (d / DIRS) * Math.PI * 2;
      // 한 방향도 조건을 못 넘기면 중심 격자 하나 크기(≈110km)만 인정한다
      ring.push({ a, km: Math.max(110, reach) });
    }
    m.shape = { ring, truncated };
    m.meanKm = Math.round(ring.reduce((s, r) => s + r.km, 0) / ring.length);
    m.maxKm = Math.max(...ring.map(r => r.km));
  },

  /* ── 시각화 ────────────────────────────────────────────────
     ⚠️ 예전에는 반투명 반구(ellipsoid + maximumCone)로 그렸다. 두 가지가 잘못됐다.
        1) 반경이 지어낸 값이었다 → 실측값(m.shape)으로 바꿨다
        2) 확대해 들어가면 카메라가 돔 "안"에 들어가 아무것도 안 보였다.
           대전에서 "열돔이라는데 그림이 없다"는 게 이 증상이다.
           → 지면에 붙는 다각형으로 바꾼다. 안에서도, 밖에서도, 어느 고도에서도 보인다. */
  renderHeatDome(m) {
    const heat = Math.min(1, (m.peak - HEATDOME.temp_min) / 12);
    const color = Cesium.Color.fromCssColorString('#ff6b3d')
      .withAlpha(0.13 + heat * 0.12);
    const edge = Cesium.Color.fromCssColorString('#ff6b3d');

    /* 실측 범위를 부드러운 폐곡선으로. 8방향 측정값 사이는 원형 보간한다.
       측정에 실패했으면 아무것도 안 그린다 — 크기를 지어내지 않는다. */
    const ring = m.shape?.ring;
    if (!ring?.length) return;
    const cosLat = Math.cos(m.lat * Math.PI / 180);
    const hier = [];
    const N = 96;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // 인접한 두 측정 방향 사이를 보간
      const f = (a / (Math.PI * 2)) * ring.length;
      const i0 = Math.floor(f) % ring.length, i1 = (i0 + 1) % ring.length;
      const t = f - Math.floor(f);
      const km = ring[i0].km * (1 - t) + ring[i1].km * t;
      hier.push(m.lon + (km * Math.sin(a)) / (111.32 * cosLat),
                m.lat + (km * Math.cos(a)) / 110.54);
    }
    const radius = m.meanKm * 1000;                    // 화살표 배치용

    this.dsHeat.entities.add({
      id: m.id,
      position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat, 0),
      polygon: {
        hierarchy: Cesium.Cartesian3.fromDegreesArray(hier),
        material: color,
        outline: true,
        outlineColor: edge.withAlpha(0.55),
        outlineWidth: 2,
        height: 0,                                     // 지면에 붙인다 (정적이라 재생성 없음)
      },
      label: mapLabel({
        text: i18n.lang === 'ko' ? '열돔' : 'Heat dome',
        color: '#ffb199', size: 'md', offsetY: -26, maxDistance: 14_000_000,
      }),
      /* ⚠️ _area 는 "이 엔티티는 넓은 면을 덮는다"는 표시다.
         열돔은 반경 수백 km 라 그 안의 도시를 누를 방법이 없어진다.
         (실제로 "열돔 안에 있는 도시 선택이 안 된다"는 지적을 받았다.)
         main.js 의 onPick 이 이 표시를 보고 "누른 지점"의 날씨를 열고,
         열돔은 그 밑에 배경 설명으로 붙인다 — 둘 다 볼 수 있게. */
      _meta: { ...m, name: i18n.lang === 'ko' ? '열돔' : 'Heat dome',
               _place: true,          // 시트가 지명을 붙여준다 (ui.js)
               _area: true,
               data: this.explain(m) },
      _layer: 'heatdome',
    });

    // 하강기류 표시 — 열돔의 원리(공기가 눌려 내려오며 데워짐)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const dx = Math.cos(a) * radius * 0.55, dy = Math.sin(a) * radius * 0.55;
      const dLon = (dx / 111_320) / Math.cos(m.lat * Math.PI / 180);
      const dLat = dy / 110_540;
      this.dsHeat.entities.add({
        // 화살표도 주인의 _meta 를 물려받는다 — 안 그러면 눌렀을 때 "빈 곳"으로 처리된다
        _meta: { ...m, name: i18n.lang === 'ko' ? '열돔' : 'Heat dome',
                 _place: true, _area: true, data: this.explain(m) },
        _layer: 'heatdome',
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(m.lon + dLon, m.lat + dLat, 130_000),
            Cesium.Cartesian3.fromDegrees(m.lon + dLon, m.lat + dLat, 8_000),
          ],
          width: 5,
          material: new Cesium.PolylineArrowMaterialProperty(
            Cesium.Color.fromCssColorString('#ff6b3d').withAlpha(0.42)),
          arcType: Cesium.ArcType.NONE,
        },
      });
    }
  },

  renderGyres() {
    GYRES.forEach(g => {
      this.ds.entities.add({
        id: 'gyre-' + g.id,
        position: Cesium.Cartesian3.fromDegrees(g.lon, g.lat),
        ellipse: {
          semiMajorAxis: g.r * 1000, semiMinorAxis: g.r * 1000 * 0.72,
          material: Cesium.Color.fromCssColorString('#8fd694').withAlpha(0.07),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#8fd694').withAlpha(0.28),
          height: 0,
        },
        label: {
          text: g.name[i18n.lang] || g.name.ko,
          font: '300 12px -apple-system, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#8fd694'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 30_000_000),
        },
        _meta: {
          id: 'gyre-' + g.id, kind: 'gyre',
          name: g.name[i18n.lang] || g.name.ko,
          lat: g.lat, lon: g.lon,
          data: this.explainGyre(g),
        },
        _layer: 'phenomena',
      });

      this._drawGyreFlow(g);
    });
  },

  /* ── 환류 흐름 애니메이션 ──────────────────────────────────────
     동그라미만 그리면 "여기 뭔가 있다"까지만 전달된다.
     환류의 핵심은 "바닷물이 이 방향으로 돈다"는 것이므로 흐름을 보여야 한다.

     타원 궤도를 따라 점을 돌린다. 점 여러 개를 각도 차이를 두고 배치하면
     흐르는 띠처럼 보인다. 방향은 코리올리 효과에 따른 실제 회전 방향이다. */
  _drawGyreFlow(g) {
    const N = 14;                     // 궤도 위의 점 개수
    const PERIOD = 26_000;            // 한 바퀴 도는 데 걸리는 시간(ms)
    const col = Cesium.Color.fromCssColorString('#8fd694');
    const a = g.r * 1000, b = g.r * 1000 * 0.72;
    const dir = g.dir ?? 1;

    /* ⚠️ 흐름에도 끝을 둔다 (발열 — power.js 주석 참고).
       회전 방향(북반구 시계·남반구 반시계)은 몇 바퀴만 보면 전달된다.
       영구히 돌리면 그 뒤로는 정보 없이 렌더만 계속 요청하게 된다. */
    const FLOW_MS = 20_000;
    const flowUntil = Date.now() + FLOW_MS;

    // 각도 → 지구 위 좌표. 콜백과 굳힐 때가 **같은 식**을 써야 멈추는 순간 안 튄다.
    const at = (off, ms) => {
      const th = off + dir * (ms % PERIOD) / PERIOD * Math.PI * 2;
      // 타원 위의 점을 위경도로 — 위도 1° ≈ 111km, 경도는 위도에 따라 줄어든다
      const dLat = (b * Math.sin(th)) / 111_000;
      const dLon = (a * Math.cos(th)) / (111_000 * Math.cos(g.lat * Math.PI / 180));
      return Cesium.Cartesian3.fromDegrees(g.lon + dLon, g.lat + dLat);
    };

    for (let i = 0; i < N; i++) {
      const off = (i / N) * Math.PI * 2;
      const pos = new Cesium.CallbackProperty(
        () => at(off, Math.min(Date.now(), flowUntil)), false);

      this.ds.entities.add({
        id: `gyreflow:${g.id}:${i}`,
        position: pos,
        point: {
          // 앞쪽 점일수록 밝게 — 흐르는 방향이 읽힌다
          pixelSize: 5.5 - (i / N) * 2,
          color: col.withAlpha(0.85 - (i / N) * 0.55),
          disableDepthTestDistance: 600_000,
        },
        _gyreFlow: true,
      });
    }
    power.animate(FLOW_MS);

    /* ⚠️ 여기서 끝내면 안 된다. 위 콜백은 20초 뒤 **움직임만** 멈춘다 —
       CallbackProperty 자체는 그대로 남아 매 프레임 계속 평가된다.
       환류 5곳 × 14점 = **70개가 켜 둔 내내 프레임마다 sin/cos + 좌표 변환**을 한다.
       (실측 2026-08-02: 이 레이어 하나가 애니메이션 엔티티 70개 — 앱 전체 1위였다.)
       파문이 수명이 다하면 정적인 원으로 바뀌는 것과 같은 처리가 빠져 있었다.
       → 다 돈 뒤에는 **멈춘 자리에 상수로 굳힌다.** 보이는 그림은 그대로고,
         프레임마다 하던 계산만 사라진다. */
    clearTimeout(this._flowFreeze[g.id]);
    this._flowFreeze[g.id] = setTimeout(() => {
      for (let i = 0; i < N; i++) {
        const e = this.ds.entities.getById(`gyreflow:${g.id}:${i}`);
        // 그 사이 다시 그려졌으면 새 콜백이 돌고 있다 — 건드리지 않는다
        if (!e || !(e.position instanceof Cesium.CallbackProperty)) continue;
        e.position = new Cesium.ConstantPositionProperty(
          at((i / N) * Math.PI * 2, flowUntil));
      }
    }, FLOW_MS + 200);
  },

  /* ══════════════════════════════════════════════════════════
     설명 생성 — 예보 수치에 근거한 문장만. 추측 문장 금지 (§5-6)
     ══════════════════════════════════════════════════════════ */
  explain(m) {
    const ko = i18n.lang === 'ko';
    const out = {};

    /* 범위는 "재본 값"이라고 밝힌다.
       ⚠️ 끝까지 조건이 안 깨졌으면 그건 우리가 덜 본 것이지 거기서 끝난 게 아니다.
          "약 N km"가 아니라 "최소 N km 이상"이라고 써야 맞다. */
    if (m.shape) {
      const label = ko ? '범위(실측)' : 'Measured extent';
      const v = ko
        ? `평균 반경 ${m.meanKm.toLocaleString()} km · 최대 ${m.maxKm.toLocaleString()} km`
        : `mean radius ${m.meanKm.toLocaleString()} km · max ${m.maxKm.toLocaleString()} km`;
      out[label] = m.shape.truncated
        ? (ko ? `${v} (조사 범위 끝까지 이어져 실제로는 더 넓습니다)`
              : `${v} (still going at the edge of our scan — actually wider)`)
        : v;
    }

    if (ko) {
      out['지금'] = `상층 500hPa 고도 ${m.gph}m 의 고기압 능이 자리잡고 있습니다. ` +
        `이 능이 공기를 아래로 눌러 데우면서 ${m.days}일째 최고 ${i18n.temp(m.peak)} 를 기록하고 있습니다.`;
      out['원리'] = '상층 고기압이 정체하면 공기가 갇힌 채 하강합니다. ' +
        '내려오는 공기는 압축되며 더워지고, 구름이 생기지 않아 햇빛이 그대로 들어옵니다. ' +
        '뚜껑을 덮은 것처럼 열이 빠져나가지 못해 "돔"이라 부릅니다.';
      out['예보'] = m.breaksOn
        ? `${m.breaksOn.after}일 뒤(${m.breaksOn.day})부터 조건이 풀립니다. ` +
          `그날 예상 최고기온은 ${i18n.temp(m.daily.tmax[m.breaksOn.after])} 입니다.`
        : '예보 기간(7일) 안에는 해소가 예측되지 않았습니다.';
    } else {
      out['Now'] = `A ridge of high pressure sits at ${m.gph}m (500hPa). ` +
        `It has held for ${m.days} days, peaking at ${i18n.temp(m.peak)}.`;
      out['Why'] = 'A stalled upper ridge traps air and forces it downward. ' +
        'Sinking air compresses and warms, and clouds cannot form — so heat is capped in, like a dome.';
      out['Forecast'] = m.breaksOn
        ? `Conditions break in ${m.breaksOn.after} days (${m.breaksOn.day}), with a high of ${i18n.temp(m.daily.tmax[m.breaksOn.after])}.`
        : 'No breakdown is forecast within the 7-day window.';
    }
    out['_source'] = 'Open-Meteo (GFS/ECMWF)';
    return out;
  },

  explainGyre(g) {
    const ko = i18n.lang === 'ko';
    return ko ? {
      '지금': '해류가 원을 그리며 도는 구역입니다. 떠다니는 플라스틱이 이 안쪽으로 모입니다.',
      '오해': '"쓰레기섬"이라 불리지만 걸어다닐 수 있는 섬이 아닙니다. ' +
              '대부분 5mm 이하의 미세플라스틱이 넓은 바다에 옅게 퍼져 있어서, ' +
              '위성 사진으로는 아무것도 보이지 않습니다.',
      '실제': `이 환류의 지름은 약 ${g.r * 2}km 입니다. 표시된 원은 쓰레기의 양이 아니라 해류가 도는 범위입니다.`,
      '_source': 'NOAA 조사 자료 (§4-7)',
    } : {
      'Now': 'Ocean currents circle here, drawing floating plastic inward.',
      'Misconception': 'Despite the name "garbage patch", there is no walkable island. ' +
        'Most of it is microplastic under 5mm, thinly spread — invisible in satellite photos.',
      'Scale': `This gyre spans roughly ${g.r * 2}km. The circle shows current extent, not debris volume.`,
      '_source': 'NOAA survey (§4-7)',
    };
  },
};
