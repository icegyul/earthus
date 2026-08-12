// 격자 데이터를 색으로 칠해 지구에 얹는다 (기온 · 습도)
//
// 왜 이렇게 하나
//   Open-Meteo 는 지점 API 라 타일 이미지를 주지 않는다.
//   그래서 서버(wind-grid Lambda)가 만든 격자를 받아 브라우저에서 캔버스로 칠하고,
//   Cesium 에 단일 타일로 얹는다. 오로라 레이어가 쓰는 것과 같은 방식이다.
//
// ⚠️ 대부분은 5°이고 TPW는 동아시아 1° 지역 격자다.
//    캔버스를 크게 잡고 양선형 보간으로 채우되, 화면 숫자는 원격자만 쓴다.

import { viewer } from './viewer.js';
import { API } from './config.js';
import { CONFIG } from './config.local.js';
import { i18n } from './i18n.js';
import { gridBounds, isGlobalGrid, nearestGridValue } from './gridmath.js';

/* 색 눈금 — 값에서 색으로.
   기온은 기상청·윈디가 쓰는 한색→난색 순서를 따랐다.
   습도는 건조(갈색)→습함(파랑)이 직관적이다. */
const SCALES = {
  temp: {
    unit: '°C',
    /* PR-06: 색을 부드럽게 섞으면 경계가 안 읽힌다. 원자료는 연속값 그대로 두고
       화면 색만 10°C 구간으로 고정한다. 숫자·지점 카드는 계속 원격자값을 쓴다. */
    stepped: true,
    stops: [
      [-40, [ 40,  20,  90]], [-25, [ 50,  60, 170]], [-10, [ 60, 140, 210]],
      [  0, [120, 190, 225]], [ 10, [140, 215, 160]], [ 20, [240, 225, 120]],
      [ 30, [240, 150,  70]], [ 40, [200,  50,  50]], [ 50, [130,  20,  60]],
    ],
    alpha: 0.62,
  },
  rh: {
    unit: '%',
    stops: [
      [  0, [150, 110,  60]], [ 25, [200, 175, 110]], [ 50, [180, 210, 200]],
      [ 75, [ 90, 165, 210]], [100, [ 40,  90, 180]],
    ],
    alpha: 0.55,
  },
  /* 총가강수량(TPW) — 뉴스 화면처럼 수증기 통로와 마른 공기의 경계가 먼저 읽혀야 한다.
     ⚠️ CIMSS 색표를 복제한 것이 아니다. 수치 구간과 색은 EARTHUS가 별도로 정했다.
     ⚠️ 부드러운 무지개로 섞으면 경계가 흐려지므로 stepped=true로 단계색을 쓴다. */
  tpw: {
    unit: 'mm',
    stepped: true,
    stops: [
      [ 0, [ 60,  30, 110]], [10, [ 45,  80, 175]], [20, [ 55, 155, 210]],
      [30, [145, 215, 190]], [40, [245, 220, 125]], [50, [238, 145,  70]],
      [60, [190,  65, 100]], [70, [225, 145, 195]],
    ],
    alpha: 0.86,
  },
  /* 내일 최고기온 — 더위 쪽을 넓게 잡는다. 최고기온을 보는 이유가 그것이다.
     ⚠️ 현재기온(temp)과 같은 색을 쓰면 두 레이어를 구분할 수 없다.
        난색 쪽으로 치우친 눈금을 따로 둔다. */
  tmax: {
    unit: '°C',
    stepped: true,
    stops: [
      [-20, [ 70,  90, 180]], [  0, [120, 190, 225]], [ 12, [150, 215, 165]],
      [ 22, [245, 230, 130]], [ 28, [245, 175,  80]], [ 33, [230, 110,  55]],
      [ 38, [200,  45,  45]], [ 45, [140,  20,  70]],
    ],
    alpha: 0.62,
  },
  /* ── 대기질 ─────────────────────────────────────────────
     ⚠️ 색 경계를 우리가 정하지 않는다. 각국 기준의 경계를 그대로 쓴다.
        예쁘라고 경계를 옮기면 "나쁨"인데 노란색으로 보이는 일이 생긴다. */
  pm25: {                                   // WHO·한국 기준 계열 (µg/m³)
    unit: 'µg/m³',
    stops: [
      [  0, [ 90, 200, 170]], [ 15, [130, 210, 140]], [ 35, [245, 225, 120]],
      [ 55, [245, 160,  70]], [ 75, [225,  85,  60]], [150, [150,  40, 100]],
      [250, [110,  25,  70]],
    ],
    alpha: 0.6,
  },
  pm10: {
    unit: 'µg/m³',
    stops: [
      [  0, [ 90, 200, 170]], [ 30, [130, 210, 140]], [ 80, [245, 225, 120]],
      [150, [245, 160,  70]], [250, [225,  85,  60]], [400, [150,  40, 100]],
    ],
    alpha: 0.6,
  },
  /* 먼지 질량 — 사막에서 불어오는 모래바람이 여기 잡힌다.
     ⚠️ 이 값만으로 "황사"라고 부르지 않는다. 어디서 왔는지는 이 숫자에 없다. */
  dust: {
    unit: 'µg/m³',
    stops: [
      [  0, [ 40,  60,  80]], [ 10, [120, 110,  90]], [ 50, [190, 160, 100]],
      [150, [225, 185,  95]], [400, [235, 150,  60]], [800, [210,  95,  45]],
    ],
    alpha: 0.62,
  },
  o3: {
    unit: 'µg/m³',
    stops: [
      [  0, [ 70, 110, 190]], [ 60, [110, 190, 200]], [100, [190, 220, 150]],
      [140, [245, 220, 120]], [180, [240, 150,  75]], [240, [215,  70,  70]],
    ],
    alpha: 0.55,
  },
  /* 자외선 지수 — WHO 구간(1-2 낮음, 3-5 보통, 6-7 높음, 8-10 매우높음, 11+ 위험) */
  uv: {
    unit: '',
    stops: [
      [ 0, [ 60, 130, 180]], [ 2, [110, 200, 140]], [ 5, [245, 225, 110]],
      [ 7, [245, 165,  70]], [10, [225,  80,  70]], [13, [160,  60, 165]],
    ],
    alpha: 0.6,
  },
  /* 대기질 지수(유럽) — 0 좋음 … 100+ 매우 나쁨 */
  aqi: {
    unit: 'EAQI',
    stops: [
      [ 0, [ 80, 200, 190]], [ 20, [120, 205, 140]], [ 40, [245, 225, 120]],
      [ 60, [245, 160,  80]], [ 80, [225,  85,  65]], [100, [150,  45, 110]],
    ],
    alpha: 0.6,
  },

  /* ── 해양 ───────────────────────────────────────────── */
  /* 해수면 온도 — 기온과 다른 눈금을 쓴다. 바다는 -2~32°C 안에 거의 다 들어와서
     기온 눈금(-40~50)을 쓰면 전부 비슷한 색이 되어 차이가 안 보인다. */
  sst: {
    unit: '°C',
    stepped: true,
    stops: [
      [-2, [ 45,  35, 120]], [ 4, [ 55,  95, 190]], [10, [ 70, 160, 215]],
      [16, [110, 205, 190]], [22, [235, 220, 130]], [26, [240, 165,  80]],
      [29, [225,  95,  65]], [32, [155,  35,  75]],
    ],
    alpha: 0.66,
  },
  /* 유의파고 — 항해 경보 감각에 맞춘 구간. 4m 부터 붉어진다. */
  wave: {
    unit: 'm',
    stepped: true,
    stops: [
      [0, [ 25,  60, 100]], [1, [ 60, 130, 190]], [2, [100, 195, 200]],
      [3, [190, 220, 150]], [4, [245, 215, 120]], [6, [240, 150,  75]],
      [9, [215,  60,  70]], [14, [140,  25,  85]],
    ],
    alpha: 0.62,
  },
  /* 너울 — 멀리서 온 긴 파도. 맑은 날에도 갯바위를 덮치는 게 이것이라
     낮은 값부터 눈에 띄게 한다. */
  swell: {
    unit: 'm',
    stops: [
      [0, [ 30,  55,  95]], [0.5, [ 70, 140, 195]], [1.5, [120, 200, 195]],
      [2.5, [230, 215, 135]], [4, [240, 150,  80]], [7, [210,  60,  75]],
    ],
    alpha: 0.6,
  },
  /* 해류 속도.
     ⚠️ 조류(tide)가 아니다. 물때표로 쓰면 안 된다 — marine-grid 머리말 참고. */
  cur: {
    unit: 'm/s',
    stops: [
      [0, [ 30,  50,  85]], [0.2, [ 60, 130, 180]], [0.5, [110, 200, 190]],
      [1.0, [240, 220, 130]], [1.5, [240, 145,  75]], [2.5, [210,  60,  70]],
    ],
    alpha: 0.6,
  },

  /* 해수면온도 **편차** — 평년 대비 몇 도인가.
     ⚠️ 발산형(diverging) 눈금이어야 한다. 0 이 가운데에 오고 위아래가 대칭이어야
        "평년보다 높다/낮다"가 색으로 바로 읽힌다. 기온 눈금(한색→난색 일방향)을
        그대로 쓰면 0.0°C 가 초록으로 칠해져서 "따뜻하다"로 잘못 읽힌다.
     ⚠️ ±3°C 로 자른다. 실측상 대부분 ±2 안에 들어오는데, 범위를 넓히면
        의미 있는 차이가 전부 흐린 색이 된다. */
  sstAnom: {
    unit: '°C',
    stepped: true,
    stops: [
      [-3.0, [ 40,  60, 150]], [-1.5, [ 70, 130, 200]], [-0.5, [150, 200, 225]],
      [ 0.0, [235, 238, 240]],
      [ 0.5, [250, 210, 150]], [ 1.5, [235, 130,  70]], [ 3.0, [170,  30,  50]],
    ],
    alpha: 0.72,
  },

  /* ── 안개 · 가뭄 ────────────────────────────────────── */
  /* 시정(m). ⚠️ 값이 작을수록 위험하므로 눈금이 거꾸로다.
     기상 정의상 1km 미만이 안개다 — 그 아래를 진하게 칠한다. */
  vis: {
    unit: 'm',
    reverse: true,
    stops: [
      [    0, [225,  70,  70]], [  200, [240, 140,  70]], [ 1000, [245, 215, 120]],
      [ 4000, [170, 205, 190]], [10000, [ 80, 140, 180]], [24000, [ 25,  45,  75]],
    ],
    alpha: 0.55,
  },
  /* 표층 토양수분(m³/m³).
     ⚠️ 이건 가뭄 "지수"가 아니라 지금의 젖은 정도다. 가뭄은 몇 주~몇 달의
        누적으로 판정한다. 평년 기준선이 생기기 전까지는 "지금 메마름"까지만 말한다. */
  soil: {
    unit: 'm³/m³',
    stops: [
      [0.00, [155,  95,  45]], [0.08, [200, 160,  95]], [0.18, [225, 215, 150]],
      [0.28, [150, 200, 155]], [0.40, [ 60, 150, 175]], [0.55, [ 35,  90, 165]],
    ],
    alpha: 0.58,
  },

  /* 해면기압(hPa) — 고기압·저기압 배치.
     받은 요청: "태풍 경로는 대체로 북태평양 고기압 가장자리 따라 이동함" 을
     그림으로도 보여 달라 (기압 배치도 사진 2장).

     ⚠️⚠️ **1013 을 한가운데 중립색으로 둔다.** 기압은 절대값이 아니라 **차이**가
        읽혀야 하는 값이다. 한쪽으로 흐르는 눈금을 쓰면 "1020 이 높은 건가?" 를
        알 수 없다. 표준대기 1013.25hPa 를 0 점으로 삼아 고기압(난색)·저기압(한색)이
        한눈에 갈리게 한다.
     ⚠️ 범위를 970~1040 으로 좁게 잡는다. 지상 기압은 대부분 이 안에 든다 —
        넓히면 실제 배치 차이가 전부 같은 색이 된다.
        (태풍 중심은 930hPa 까지 내려가지만 그건 점 하나다. 그 한 점 때문에
         전지구를 흐리게 칠할 이유가 없다 — 아래쪽 끝 색으로 잘린다.) */
  mslp: {
    unit: 'hPa',
    stepped: true,
    stops: [
      [ 970, [ 70,  20, 110]], [ 990, [ 60,  90, 190]], [1005, [130, 190, 225]],
      [1013, [232, 236, 238]],
      [1020, [250, 205, 140]], [1030, [235, 125,  65]], [1040, [165,  35,  55]],
    ],
    alpha: 0.55,
  },

  /* 비구름 — 지금 내리는 양(mm/h).
     ⚠️⚠️ **구름량이 아니다.** 구름이 하늘을 덮고 있어도 비는 안 올 수 있다.
        "비구름"을 구름량으로 칠하면 흐린 날 전국이 비 오는 것처럼 보인다.
     ⚠️ 0 에 가까운 값을 칠하지 않는다 — 0.1mm/h 까지 파랗게 하면 지구가 통째로
        젖은 것처럼 보인다. 0.1 아래는 투명하게 둔다(alphaFrom 참고).
     ⚠️ 구간은 기상청 강수 강도 감각에 맞췄다:
        1mm/h 미만 약한 비 · 3 보통 · 15 강한 비 · 30 매우 강한 비 */
  rain: {
    unit: 'mm/h',
    /* ⚠️ 이 값 아래는 **투명**하다. 0.1mm/h 는 우산도 안 편다 —
       그걸 칠하면 지구가 통째로 젖은 것처럼 보인다(실측으로 확인). */
    mute: 0.1,
    fade: 0.4,
    stops: [
      [0.1, [ 90, 150, 220]], [1, [ 70, 190, 210]], [3, [ 90, 210, 140]],
      [8,  [235, 215, 100]], [15, [240, 150,  70]], [30, [225,  70,  80]],
      [50, [165,  40, 120]],
    ],
    alpha: 0.72,
  },

  /* 내일 최저기온 — 추위 쪽을 넓게. 밤에 얼마나 떨어지는지가 관심사다. */
  tmin: {
    unit: '°C',
    stepped: true,
    stops: [
      [-35, [ 45,  25,  95]], [-20, [ 60,  70, 175]], [-10, [ 75, 130, 205]],
      [  0, [130, 190, 225]], [ 8,  [165, 215, 200]], [ 16, [200, 225, 150]],
      [ 24, [240, 205, 110]], [ 32, [225, 130,  70]],
    ],
    alpha: 0.62,
  },
  /* 바람 색면 — u/v 모델 원격자의 벡터 크기 sqrt(u²+v²)를 정확히 계산한다.
     입자 속도는 방향 판독용으로 과장하지만 이 색면·숫자는 실제 m/s 값이다. */
  wind: {
    unit: 'm/s',
    stepped: true,
    stops: [
      [0, [ 27,  47,  74]], [2, [ 43,  95, 132]], [5, [ 66, 145, 164]],
      [10, [129, 191, 156]], [15, [224, 211, 120]], [20, [232, 154,  80]],
      [30, [205,  82,  74]], [45, [142,  42,  89]], [60, [ 87,  28,  76]],
    ],
    alpha: 0.62,
  },
};

/* 레이어 id → 격자 필드 이름.
   ⚠️ 예보(tmax/tmin)는 격자에 따로 들어 있다. temp 로 대신 칠하면
      "내일 최고기온"이라고 써놓고 지금 기온을 보여주는 것이 된다. */
const FIELD_OF = {
  temp: 't', rh: 'rh', tmax: 'tmax', tmin: 'tmin',
  wind: 'windSpeed', windfc: 'windSpeedFc',
  tpw: 'tpw',
  fog: 'vis', drought: 'soil',
  pm25: 'pm25', pm10: 'pm10', dust: 'dust', ozone: 'o3', uv: 'uv', aqi: 'aqi',
  sst: 'sst', wave: 'wave', swell: 'swell', current: 'cur',
  sstanom: 'sst',   // 실제 값은 편차로 갈아끼운다 (show 참고)
  pressure: 'mslp',
  rain: 'rain',
};

/* 어느 격자 파일에서 오는가.
   ⚠️ 파일이 셋으로 나뉜 이유는 API 가 셋이기 때문이다(기상·대기질·해양).
      하나로 합치면 한쪽이 실패할 때 전부가 없어진다. 따로 두면 따로 산다. */
const SOURCE_OF = {
  temp: 'wind', rh: 'wind', tmax: 'wind', tmin: 'wind', fog: 'wind', drought: 'wind',
  wind: 'wind', windfc: 'wind',
  pressure: 'wind', rain: 'wind',
  tpw: 'tpw',
  pm25: 'air', pm10: 'air', dust: 'air', ozone: 'air', uv: 'air', aqi: 'air',
  sst: 'marine', wave: 'marine', swell: 'marine', current: 'marine',
  sstanom: 'marine',
};

/* 눈금 이름 — 레이어 id 와 눈금 이름이 다른 것들 */
const SCALE_OF = { temp: 'temp', humidity: 'rh', rh: 'rh', fog: 'vis', drought: 'soil',
                   ozone: 'o3', current: 'cur', sstanom: 'sstAnom', pressure: 'mslp',
                   rain: 'rain', tpw: 'tpw', wind: 'wind', windfc: 'wind' };

/* 예보 레이어인지 — 화면에 "내일"이라고 밝혀야 하는지 판단한다 */
export const IS_FORECAST = { tmax: true, tmin: true, windfc: true };

function colorAt(scale, v) {
  const st = scale.stops;
  if (v <= st[0][0]) return st[0][1];
  if (v >= st[st.length - 1][0]) return st[st.length - 1][1];
  if (scale.stepped) {
    for (let i = st.length - 1; i >= 0; i--) if (v >= st[i][0]) return st[i][1];
  }
  for (let i = 0; i < st.length - 1; i++) {
    const [a, ca] = st[i], [b, cb] = st[i + 1];
    if (v >= a && v <= b) {
      const t = (v - a) / (b - a);
      return [0, 1, 2].map(k => Math.round(ca[k] + (cb[k] - ca[k]) * t));
    }
  }
  return st[st.length - 1][1];
}

/* 소스 이름 → 실제 파일 */
const SRC_URL = {
  wind:   () => `${API.WIND}/global.json`,
  tpw:    () => `${API.TPW}/tpw-ea.json`,
  air:    () => `${API.AIR}/air.json`,
  marine: () => `${API.MARINE_GRID}/marine.json`,
  /* ⚠️⚠️ 전지구 해양 격자는 **5° = 약 550km** 다. 한반도 전체가 두세 칸이라
     서해·동해·남해가 한 칸에 뭉개진다 — 화면에서는 "남해에만 자료가 있는 것"처럼 보인다.
     동아시아만 **0.5°(약 55km)** 로 따로 만든다. 10배 촘촘하다.
     ⚠️ 상자는 천리안 동아시아 영상과 같은 범위다(23~47N, 114~150E). */
  marineEa: () => `${API.MARINE_GRID}/marine-ea.json`,
  /* 기압 색면도 동아시아 확대에서는 등압선과 같은 1° 전용판을 쓴다. */
  pressureEa: () => `${API.WIND}/pressure-ea.json`,
};

export const gridOverlay = {
  grid: null,        // 하위호환 — 기상 격자
  grids: {},         // 소스 이름 → 격자
  layers: {},        // key → Cesium ImageryLayer
  _fetchedAt: {},
  _labels: null,
  _labelState: null,
  _rendered: {},

  /** @param src 'wind' | 'air' | 'marine' */
  async load(src = 'wind') {
    const got = this.grids[src];
    if (got && Date.now() - (this._fetchedAt[src] || 0) < 30 * 60_000) return got;
    const url = (SRC_URL[src] || SRC_URL.wind)();
    const r = await fetch(url, { cache: 'no-cache' });
    /* ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 아직 안 만들어진 격자를
       "권한 오류"로 오해하지 않도록 메시지에 소스 이름을 남긴다. */
    if (!r.ok) throw new Error(`${src} 격자 HTTP ${r.status}`);
    const j = await r.json();
    this.grids[src] = j;
    this._fetchedAt[src] = Date.now();
    if (src === 'wind') this.grid = j;
    return j;
  },

  /** 지금 화면 한가운데가 동아시아 상자 안이고, 충분히 확대돼 있는가.
   *  ⚠️ 상자 밖에서 촘촘한 판을 쓰면 화면 대부분이 빈다 — 반드시 안일 때만 쓴다.
   *  ⚠️ 아주 멀리서 볼 때는 전지구 판이 맞다. 촘촘한 판은 동아시아 밖이 통째로 비어
   *     "저기는 바다가 없다"처럼 보인다. */
  _eastAsiaView() {
    try {
      const p = viewer?.camera?.positionCartographic;
      if (!p) return false;
      const lat = Cesium.Math.toDegrees(p.latitude);
      const lon = Cesium.Math.toDegrees(p.longitude);
      // 고도 4,000km 보다 가까울 때만. 그보다 멀면 지구 절반이 보인다.
      return p.height < 4_000_000
        && lat >= 23 && lat <= 47 && lon >= 114 && lon <= 150;
    } catch (_) { return false; }
  },

  _desiredSource(key) {
    const base = SOURCE_OF[key] || 'wind';
    if (!this._eastAsiaView()) return base;
    /* 편차 평년장은 전지구 5°뿐이다. 0.5° 실황과 배열로 빼지 않는다. */
    if (base === 'marine' && key !== 'sstanom') return 'marineEa';
    if (key === 'pressure') return 'pressureEa';
    return base;
  },

  /** key = 레이어 id (temp · rh · sst · pm25 · fog …) */
  async show(key, on) {
    /* 메뉴만 잠그면 검색·질문·저장 상태에서 우회해 켜질 수 있다.
       실제 파일·권리·화면 검수 전에는 renderer 자체가 마지막 문이 된다. */
    if (key === 'tpw' && CONFIG.TPW_READY !== true) {
      this._remove(key);
      if (on) {
        const { store } = await import('./store.js');
        if (store.isOn(key)) store.setLayer(key, false);
      }
      return;
    }
    if (!on) { this._remove(key); return; }
    try {
      /* ⚠️ 동아시아를 보고 있으면 촘촘한 판으로 바꾼다.
         ⚠️⚠️ 지금은 **레이어를 켜는 순간**에만 고른다. 켜 둔 채로 지구를 돌려
            동아시아로 오면 전지구 판 그대로다 — 껐다 켜야 바뀐다.
            (카메라가 멈출 때마다 격자를 다시 그리면 발열이 는다. 그 대가로 택한 것이다.)
         ⚠️ 못 받으면 조용히 전지구 판으로 돌아간다. 안 그러면 화면이 통째로 빈다. */
      const baseSource = SOURCE_OF[key] || 'wind';
      let srcName = this._desiredSource(key);
      /* applyAll·카메라 임계 이벤트가 같은 판을 다시 요청해도 캔버스와 등치선을
         다시 만들지 않는다. 자료 갱신은 레이어를 다시 켜거나 load TTL 이후 별도 경로다. */
      if (this._rendered[key]?.sourceName === srcName && this.layers[key]) return this._rendered[key];
      if (srcName !== baseSource) {
        try { await this.load(srcName); } catch (_) { srcName = baseSource; }
      }
      const g0 = await this.load(srcName);
      /* ⚠️ 편차 레이어는 격자 값이 아니라 "지금 − 평년"이다.
         평년값을 못 받으면 **그리지 않는다**. 실측값을 편차인 척 칠하면
         평년과 같은 바다가 +25°C 로 새빨갛게 나온다. */
      let g = g0, field;
      if (key === 'sstanom') {
        const an = await this.sstAnomaly();
        if (!an) throw new Error('평년값 없음 — 편차를 그리지 않는다');
        g = { ...g0, _anom: an.diff };
        field = an.diff;
        this._anomInfo = { period: an.period, doy: an.doy, mean: an.mean, n: an.n };
      } else if (key === 'wind' || key === 'windfc') {
        const U = key === 'windfc' ? g.fu : g.u;
        const V = key === 'windfc' ? g.fv : g.v;
        if (!Array.isArray(U) || !Array.isArray(V) || U.length !== V.length) {
          throw new Error(`격자에 ${key} 없음`);
        }
        field = U.map((u, index) => Number.isFinite(u) && Number.isFinite(V[index])
          ? Math.round(Math.hypot(u, V[index]) * 100) / 100 : null);
        /* 계산값의 식과 입력 필드를 메타데이터로 남긴다. source/time은 원 격자 그대로다. */
        g = { ...g, [FIELD_OF[key]]: field,
          derivation: { kind: 'VECTOR_MAGNITUDE', formula: 'sqrt(u^2+v^2)',
            inputs: key === 'windfc' ? ['fu', 'fv'] : ['u', 'v'] } };
      } else {
        field = g[FIELD_OF[key]];
      }
      /* ⚠️ 없으면 다른 값으로 대신 칠하지 않는다.
         예보 격자가 아직 안 올라온 서버에서 tmax 를 t 로 칠하면
         "내일 최고기온"이라는 이름 아래 지금 기온이 나온다 — 거짓말이 된다. */
      if (!field) throw new Error(`격자에 ${key} 없음`);
      this._remove(key);

      const scale = SCALES[SCALE_OF[key] || key];
      if (!scale) throw new Error(`${key} 눈금 없음`);
      // 전지구 격자는 날짜변경선에서 감고, 지역 격자는 양 끝을 이어 붙이지 않는다.
      // ⚠️ 지역 격자를 전지구처럼 % 연산하면 180° 끝이 90° 시작과 섞인다.
      const globalGrid = isGlobalGrid(g);
      const W = Math.max(4, (globalGrid ? g.nx : Math.max(1, g.nx - 1)) * 4);
      const H = Math.max(4, Math.max(1, g.ny - 1) * 4);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(W, H);

      for (let y = 0; y < H; y++) {
        // 캔버스는 위가 북쪽, 격자는 lat0(남쪽)부터라 뒤집는다
        const fy = (H - 1 - y) / (H - 1) * (g.ny - 1);
        const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, g.ny - 1), ty = fy - y0;
        for (let x = 0; x < W; x++) {
          const fx = globalGrid
            ? x / W * g.nx
            : x / Math.max(1, W - 1) * Math.max(0, g.nx - 1);
          const x0 = Math.min(g.nx - 1, Math.floor(fx));
          const x1 = globalGrid ? (x0 + 1) % g.nx : Math.min(x0 + 1, g.nx - 1);
          const tx = fx - Math.floor(fx);
          const q = (xx, yy) => field[yy * g.nx + xx];
          const a = q(x0, y0), b = q(x1, y0), c = q(x0, y1), d = q(x1, y1);
          const i = (y * W + x) * 4;
          if (a == null || b == null || c == null || d == null) { img.data[i + 3] = 0; continue; }
          const v = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
          /* ⚠️⚠️ **아무 일도 없는 곳은 칠하지 않는다.**
             강수처럼 "대부분 0" 인 값은 눈금 아래를 그대로 칠하면
             **비가 안 오는 곳까지 전부 파랗게** 된다 — 실측 화면에서 지구 전체가
             젖은 것처럼 보였다. 눈금 시작값 아래는 투명하게 두고,
             시작값 근처에서는 서서히 나타나게 한다(계단이 보이지 않게).
             ⚠️ `mute` 를 안 준 눈금(기온·습도 등)은 예전 그대로 전부 칠한다 —
                기온은 "0도 지역"이 없어서 투명하게 두면 구멍이 뚫린다. */
          if (scale.mute != null && v < scale.mute) { img.data[i + 3] = 0; continue; }
          const [R, G, B] = colorAt(scale, v);
          img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B;
          let al = scale.alpha;
          if (scale.mute != null) {
            const fade = scale.fade ?? (scale.mute * 3);
            if (v < fade) al *= (v - scale.mute) / (fade - scale.mute || 1);
          }
          img.data[i + 3] = Math.round(Math.max(0, Math.min(1, al)) * 255);
        }
      }
      ctx.putImageData(img, 0, 0);

      /* 단계색은 경계가 목적이다. 저해상도 캔버스를 다시 선형 확대하면 색 사이에
         존재하지 않는 중간색이 생기므로 nearest-neighbour로 키운다. 원자료 자체의
         공간 보간은 위 루프에서 한 번만 하고, 범례 경계를 그대로 보존한다. */
      const soft = document.createElement('canvas');
      soft.width = W * 3; soft.height = H * 3;
      const sc = soft.getContext('2d');
      sc.imageSmoothingEnabled = !scale.stepped;
      if (!scale.stepped) sc.imageSmoothingQuality = 'high';
      sc.drawImage(cv, 0, 0, soft.width, soft.height);

      const bounds = gridBounds(g);
      if (!bounds) throw new Error(`${key} 격자 범위 없음`);
      const L = viewer.imageryLayers.addImageryProvider(
        new Cesium.SingleTileImageryProvider({
          url: soft.toDataURL('image/png'),
          rectangle: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
          tileWidth: soft.width, tileHeight: soft.height,
          credit: g.attribution || g.source || 'Open-Meteo',
        })
      );
      this.layers[key] = L;
      this._rendered[key] = { grid: g, field, sourceName: srcName };
      this._showValueLabels(key, g, field);
      document.dispatchEvent(new CustomEvent('earthus:grid-ready', {
        detail: { layer: key, grid: g, field, sourceName: srcName },
      }));
    } catch (e) {
      console.warn('[gridOverlay]', key, e.message);
      /* ⚠️ 조용히 실패하면 안 된다. 켰는데 아무것도 안 나오고 설명도 없으면
         사용자에게는 그냥 고장이다. 왜 안 나오는지 말하고 스위치를 되돌린다.
         (예보 격자는 서버가 1시간에 한 번 갱신한다 — 그 전에는 없을 수 있다.) */
      const ko = i18n.lang === 'ko';
      const missing = /격자에/.test(e.message);
      const { toast } = await import('./ui.js');
      toast(missing
        ? (ko ? '내일 예보 자료가 아직 준비되지 않았습니다. 서버가 갱신하면 표시됩니다.'
              : 'Tomorrow’s forecast grid isn’t ready yet — it will appear after the next server update.')
        : (ko ? `자료를 불러오지 못했습니다 (${e.message})`
              : `Could not load the grid (${e.message})`));
      // 켜진 채로 두면 "켜져 있는데 아무것도 없다"가 된다
      const { store } = await import('./store.js');
      if (store.isOn(key)) store.setLayer(key, false);
    }
  },

  _remove(key) {
    const L = this.layers[key];
    if (L) { try { viewer.imageryLayers.remove(L, true); } catch (_) {} }
    delete this.layers[key];
    delete this._rendered[key];
    if (key === 'tpw') this._clearValueLabels();
    document.dispatchEvent(new CustomEvent('earthus:grid-removed', { detail: { layer: key } }));
  },

  /* TPW는 색만 보면 값이 기억나지 않는다. 주요 도시를 제한된 수만 표시한다.
     ⚠️ 라벨값은 가장 가까운 **실제 1° 격자점**이다. 보간한 화면 픽셀을 숫자로 쓰지 않는다. */
  _showValueLabels(key, grid, field) {
    /* PR-04부터 공통 readability가 현재 화면·지평선·충돌을 검사해 수치 라벨을 소유한다.
       예전 TPW 전용 라벨을 함께 켜면 같은 값이 두 번 겹친다. 구 HTML처럼 공통 패널이
       없는 배포에서만 이 코드를 fallback으로 남긴다. */
    if (document.getElementById('readabilityPanel')) {
      this._clearValueLabels();
      return;
    }
    if (key !== 'tpw' || !viewer?.scene?.primitives) {
      if (key === 'tpw') this._clearValueLabels();
      return;
    }
    if (!this._labels) {
      this._labels = viewer.scene.primitives.add(new Cesium.LabelCollection());
    }
    this._labels.removeAll();
    const cities = [
      ['서울', 'Seoul', 37.5665, 126.9780], ['부산', 'Busan', 35.1796, 129.0756],
      ['제주', 'Jeju', 33.4996, 126.5312], ['도쿄', 'Tokyo', 35.6762, 139.6503],
      ['오사카', 'Osaka', 34.6937, 135.5023], ['후쿠오카', 'Fukuoka', 33.5902, 130.4017],
      ['삿포로', 'Sapporo', 43.0618, 141.3545], ['나하', 'Naha', 26.2124, 127.6809],
      ['베이징', 'Beijing', 39.9042, 116.4074], ['상하이', 'Shanghai', 31.2304, 121.4737],
      ['칭다오', 'Qingdao', 36.0671, 120.3826], ['타이베이', 'Taipei', 25.0330, 121.5654],
      ['홍콩', 'Hong Kong', 22.3193, 114.1694], ['하노이', 'Hanoi', 21.0278, 105.8342],
    ];
    cities.forEach(([ko, en, lat, lon]) => {
      const value = nearestGridValue(grid, field, lat, lon);
      if (value == null) return;
      this._labels.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 12_000),
        text: `${i18n.lang === 'ko' ? ko : en} ${Math.round(value)}mm`,
        font: '600 13px -apple-system, BlinkMacSystemFont, sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#071019').withAlpha(0.78),
        backgroundPadding: new Cesium.Cartesian2(7, 4),
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9_000_000),
        id: { kind: 'tpw-label', ko, en, lat, lon, value },
      });
    });
    this._labels.show = true;
    this._labelState = { key, grid, field };
    viewer.scene.requestRender?.();
  },

  _clearValueLabels() {
    this._labels?.removeAll();
    this._labelState = null;
    viewer?.scene?.requestRender?.();
  },

  _refreshValueLabels() {
    const state = this._labelState;
    if (state) this._showValueLabels(state.key, state.grid, state.field);
  },

  /** 범례용 — 눈금 색 목록 */
  scaleOf(key) { return SCALES[SCALE_OF[key] || key]; },

  renderedOf(key) { return this._rendered[key] || null; },

  /**
   * 동아시아 전용 보강판 경계를 넘었을 때만 다시 그린다. 매 카메라 프레임·매 idle에
   * 계산하지 않고 source bucket이 달라진 경우 한 번만 바꾼다.
   */
  refreshResolution() {
    Object.entries(this._rendered).forEach(([key, rendered]) => {
      const desired = this._desiredSource(key);
      if (desired !== rendered.sourceName) this.show(key, true);
    });
  },

  /* 물어보기 패널이 쓴다 — 레이어를 켜지 않고 값만 읽을 수 있어야 한다 */
  async gridFor(key) {
    const g = await this.load(SOURCE_OF[key] || 'wind');
    if (key === 'wind' || key === 'windfc') {
      const U = key === 'windfc' ? g.fu : g.u;
      const V = key === 'windfc' ? g.fv : g.v;
      if (!Array.isArray(U) || !Array.isArray(V)) return g;
      return { ...g, [FIELD_OF[key]]: U.map((u, index) => Number.isFinite(u)
        && Number.isFinite(V[index]) ? Math.round(Math.hypot(u, V[index]) * 100) / 100 : null) };
    }
    return g;
  },
  fieldOf(key) { return FIELD_OF[key]; },
  async valueAt(key, lat, lon) {
    const rendered = this.renderedOf(key);
    if (rendered) return nearestGridValue(rendered.grid, rendered.field, lat, lon);
    const grid = await this.gridFor(key);
    return nearestGridValue(grid, grid?.[FIELD_OF[key]], lat, lon);
  },

  _clim: null,
  _climDoy: 0,

  /** 오늘 날짜의 해수면온도 **평년값**(1991–2020).
   *
   * ⚠️ 반드시 같은 달력 날짜끼리 비교해야 한다.
   *    전에 연평균(16.4°C)과 비교해서 여름 바다가 죄다 이상 고온으로 나온 적이 있다.
   * ⚠️ 이 자료는 365일치다. 윤년의 366일째는 365일째를 쓴다.
   */
  async climatology(date = new Date()) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 1);
    const doy = Math.min(365, Math.floor((Date.UTC(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000) + 1);
    if (this._clim && this._climDoy === doy) return this._clim;
    try {
      const r = await fetch(`${API.MARINE_GRID}/clim/sst-${String(doy).padStart(3, '0')}.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this._clim = await r.json();
      this._climDoy = doy;
      return this._clim;
    } catch (e) {
      // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 없으면 편차를 말하지 않는다.
      console.warn('[clim] 평년값 없음', e.message);
      return null;
    }
  },

  /** 지금 해수면온도 − 평년값. 격자점마다.
   *  @returns {{diff:number[], n:number, mean:number, period:string}|null} */
  async sstAnomaly() {
    const [now, clim] = await Promise.all([this.load('marine'), this.climatology()]);
    if (!now || !clim) return null;
    /* ⚠️ 두 격자가 같은 모양인지 반드시 확인한다. 다르면 엉뚱한 자리끼리 뺀다. */
    if (now.nx !== clim.nx || now.ny !== clim.ny
        || now.lat0 !== clim.lat0 || now.lon0 !== clim.lon0) {
      console.warn('[clim] 격자가 다르다 — 편차를 계산하지 않는다');
      return null;
    }
    const a = now.sst || [], b = clim.sst || [];
    const diff = new Array(a.length).fill(null);
    let sum = 0, n = 0;
    for (let k = 0; k < a.length; k++) {
      if (a[k] == null || b[k] == null) continue;
      diff[k] = Math.round((a[k] - b[k]) * 100) / 100;
      sum += diff[k]; n++;
    }
    if (!n) return null;
    return { diff, n, mean: sum / n, period: clim.period, doy: clim.doy, time: now.time };
  },
};

i18n.onChange(() => gridOverlay._refreshValueLabels());
