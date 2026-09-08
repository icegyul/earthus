// 바람 파티클 — 윈디처럼 흰 선이 바람 방향으로 흐른다
//
// 원리
//   1) 전지구 u/v 격자를 서버(S3)에서 받는다 (wind-grid Lambda 가 시간마다 만든다)
//   2) 지구 표면에 입자를 뿌리고, 그 지점의 바람 벡터만큼 위경도를 옮긴다
//   3) 매 프레임 이전 화면을 살짝 지우면서 그리면 꼬리(잔상)가 남는다
//   4) 수명이 다하면 다른 곳에 다시 뿌린다 — 안 그러면 전부 한쪽에 뭉친다
//
// ⚠️ Cesium 캔버스 위에 별도 2D 캔버스를 얹는다. WebGL 안에 그리지 않는다.
//    지구 뒤쪽(반대편) 입자는 그리면 안 된다 — 화면엔 앞면만 보여야 한다.

import { viewer, scene } from './viewer.js';
import { API } from './config.js';
import { i18n } from './i18n.js';
// ⚠️ power 는 더 이상 쓰지 않는다 — 아래 _tick() 끝의 주석 참고.
//    입자는 자기 캔버스에 그리므로 Cesium 렌더를 깨울 이유가 없다.

/* ⚠️⚠️ **2026-09-08 밀도 재계산 — 전지구에 입자가 540개뿐이었다.**
   예전 식은 `캔버스 장치픽셀 / 2400` 이었다. 1440×900 화면(dpr 1)에서 **540개**다.
   전지구 뷰에서 지구가 차지하는 면적은 화면의 1/4쯤이니 실제로 바람을 그리는
   입자는 **130개 남짓**이었다 — 태평양 하나에 열몇 개다. 흐름이 보일 수가 없다.
   ⚠️ 게다가 장치픽셀 기준이라 dpr 2 화면에서는 같은 넓이에 **4배**가 뿌려졌다.
      기기마다 밀도가 달랐다. → CSS 픽셀 기준으로 바꿔 어느 화면에서든 같게 만든다. */
const DENSITY_CSS_PX = 460;  // 입자 하나가 맡는 CSS 픽셀 면적 (1440×900 → 2,817개)
const COUNT_MAX = 4200;      // 상한. 넘으면 4K 화면에서 계산이 프레임을 먹는다.
const LIFE_SEC = 3.0;        // 입자 수명(초)
const FADE = 0.98;           // 잔상이 남는 정도. 1 에 가까울수록 꼬리가 길다.
                             // 0.94 는 꼬리가 약 1초라 느린 바람이 점이 됐다 → 0.98(약 3초, LIFE_SEC 과 같다)
/* ⚠️⚠️ **카메라가 움직인 프레임은 통째로 지운다.** 한 번 짧은 페이드로 바꿔 봤다가
   되돌렸다(2026-09-08). 꼬리는 "그때 그 화면 좌표"에 그려진 그림이라, 지구가
   돌아가는 동안 남겨 두면 **선이 옆으로 휘었다가 제자리를 찾는 것처럼 보인다** —
   지구를 돌리면 바람이 미끄러지는 것 같다는 지적을 받았다. 잘못 그린 선을 남기느니
   그 프레임은 비우는 게 정직하다. 손을 떼면 0.1초 안에 다시 찬다. */
const JUMP_PX = 60;          // 이만큼 넘게 튄 입자는 선을 잇지 않는다 (지평선·카메라 점프)
const FRAME_MS = Math.round(1000 / 30); // 120Hz 폰에서도 30회만 계산·그린다

/* ── 입자 색 ─────────────────────────────────────────────────────────
   예전에는 전부 `rgba(255,255,255,a)` 흰 선이었다. 흰 선 하나로는 두 가지를 잃는다.
     ① 세기가 안 읽힌다 — 알파만 다르면 "연한 흰 선/진한 흰 선"이라 비교가 안 된다.
     ② 색면 위에서 묻힌다.
   → 세기에 따라 얼음빛(약)에서 따뜻한 빛(강풍)으로 간다. **색면보다 항상 밝은**
     계열만 써서 어떤 색면 위에서도 선이 먼저 읽힌다.
   ⚠️ 경계는 **m/s** 다(예전엔 kt). 전지구 5° 격자의 실측 분포는 중앙값 6.1 ·
      90% 11.5 · 99% 17.2 · 최대 23.8 m/s 다(2026-09-08 실측). kt 로 잡은 옛 경계
      (8·16·26·40·60kt = 4·8·13·20·31m/s)는 위 세 칸이 사실상 안 쓰였다.
   ⚠️ 구간별로 모아 한 번씩만 stroke 한다. 입자마다 stroke 하면 2,800번이 된다. */
const BUCKETS = Object.freeze([
  { maxMs:  3, rgb: '150,196,236', a: 0.30, w: 0.9 },  // 실바람
  { maxMs:  6, rgb: '190,224,248', a: 0.46, w: 1.0 },  // 남실바람
  { maxMs:  9, rgb: '224,242,255', a: 0.60, w: 1.1 },  // 산들바람
  { maxMs: 13, rgb: '255,250,226', a: 0.74, w: 1.3 },  // 센바람
  { maxMs: 18, rgb: '255,226,140', a: 0.88, w: 1.5 },  // 큰바람
  { maxMs: Infinity, rgb: '255,190, 96', a: 0.98, w: 1.9 }, // 노대바람 이상
]);
function bucketOf(ms) {
  for (let i = 0; i < BUCKETS.length; i++) if (ms < BUCKETS[i].maxMs) return i;
  return BUCKETS.length - 1;
}

/* ── 좌표 변환을 직접 한다 (2026-09-08) ──────────────────────────────
   ⚠️⚠️ **`scene.cartesianToCanvasCoordinates` 가 틱 비용의 79% 였다.**
      실측(입자 2,800개 · 1회 틱): 전체 2.16ms 중 투영만 **1.76ms**.
      나머지는 fromDegrees 0.18 · 법선·내적 0.14 · 격자 보간 0.16 이고,
      선 2,800개를 실제로 긋는 비용은 0.10ms 로 사실상 공짜였다.
      같은 일을 **행렬 한 번 곱으로 하면 0.04ms** 다 — 44배.
      (400점 무작위 대조에서 화면 좌표가 **소수점까지 동일**함을 확인했다.)
   → 틱마다 뷰·투영 행렬을 한 번 만들어 두고 입자는 직접 곱한다.
      메인 스레드를 놓아 주는 것이 목적이다 — 이 계산이 길면 지구를 돌리고
      확대하는 조작 자체가 끊긴다("엄청 버벅거린다", 2026-09-08).
   ⚠️ 3D 모드가 아닐 때(2D·컬럼버스 뷰)는 이 행렬이 안 맞는다. 그때는 예전처럼
      Cesium 에 물어본다. */
const WGS84_A2 = 6378137.0 * 6378137.0;
const WGS84_B2 = 6356752.3142451793 * 6356752.3142451793;
const D2R = Math.PI / 180;

/* ── 속도 기준 (윈디 척도) ──────────────────────────────────────
   ⚠️ 처음엔 "프레임당" 이동시켰다. 그러면 주사율에 따라 속도가 달라진다.
      120Hz 폰이 30fps 기기보다 4배 빨라져 "태풍 같다"는 지적을 받았다.
      → 초 단위로 바꿔 어느 기기에서든 같게 만들었다.

   단위는 윈디와 같이 노트(kt)를 쓴다. 1 kt = 0.5144 m/s.
   윈디 범례: 0 · 5 · 10 · 20 · 30 · 40 · 60 kt

   ⚠️ 선형으로 하면 태풍이 안 두드러진다.
      64kt(태풍) 는 10kt(산들바람)의 6.4배인데, 화면에서는 그 정도 차이가
      "조금 빠르네" 정도로만 읽힌다. 지수를 1.35 로 줘서 12배 차이로 벌렸다.
      약한 바람은 더 느긋해지고 태풍은 확실히 몰아친다.

        도/초 = BASE × (kt / 10)^1.35

   ⚠️⚠️ **2026-09-08 재조정 — 선이 안 나오고 점만 찍히고 있었다.**
      이 표의 예전 값은 10kt 를 **초당 1픽셀**로 잡았다. 꼬리는 약 1초 남으므로
      산들바람의 꼬리 길이가 **1픽셀**이었다 — 즉 점이다. 화면 대부분이 30kt 아래라
      전지구 뷰에서는 방향을 읽을 수 있는 선이 거의 그려지지 않았다.
      ("바람이 선으로 방향을 알려주던 게 기온처럼 보인다"는 지적, 2026-09-08)
      → 약한 바람의 바닥을 올렸다(2.5배). 강풍은 1.6배만 올려 과장이 더 벌어지지
        않게 했다. 꼬리 지속(FADE)도 1초 → 3초로 늘려 LIFE_SEC 과 맞췄다.

   ⚠️⚠️ **2026-09-08 (2) — 같은 바람이 줌에 따라 8배 다르게 보였다.**
      입자는 **도/초**로 움직이는데, 화면에서 1°가 몇 픽셀인지는 줌마다 다르다.
        전지구 뷰      1° ≈ 4.7px   → 10kt 꼬리 ≈ 10px  (점에 가깝다)
        4,200km 뷰     1° ≈  40px   → 10kt 꼬리 ≈ 78px  (시원하게 흐른다)
      같은 바람인데 지구를 당겨 보면 8배 빨라 보였다. "전지구에서만 구리다"의 정체다.
      윈디·mapped.earth 는 **화면 기준**으로 흐르게 해서 어느 줌에서도 같아 보인다.
      → 매 틱 화면의 1°가 몇 픽셀인지 재서(_pxPerDeg) REF_PX_PER_DEG 로 정규화한다.
      ⚠️ 이 배율은 **한 화면 전체에 똑같이** 곱해진다. 화면 안에서 강풍과 약풍의
         비(比)는 그대로다 — 바뀌는 것은 줌 사이의 비교뿐이고, 그건 원래 비교
         대상이 아니다(같은 바람을 당겨 본 것뿐이다).

   기준점 (정규화 후 · 어느 줌에서나 · 꼬리 약 3초)
     10 kt   5 m/s  산들바람        8 px/s   꼬리 ≈  25 px  ← 선으로 읽힌다
     20 kt  10 m/s  선선한 바람     18 px/s   꼬리 ≈  53 px
     34 kt  17 m/s  강풍주의보급    33 px/s
     40 kt  21 m/s  강풍           40 px/s
     64 kt  33 m/s  태풍(TY) 시작   68 px/s   확실히 몰아친다
     90 kt  46 m/s  강한 태풍      100 px/s

   실제보다 수천 배 과장돼 있다. 실제 속도로 그리면 초당 0.003픽셀이라
   아예 안 움직인다. 목적이 "어디로 부는지"를 보이는 것이므로 과장은 불가피하고,
   대신 배율을 화면 안에서 일정하게 유지해 바람 간 상대 세기는 정확하다. */
export const MS_TO_KT = 1 / 0.5144;
const BASE = 0.70;           // 10kt 일 때의 도/초 (2026-09-08: 0.285 → 0.70)
const EXP = 1.15;            // 클수록 강풍이 더 두드러진다 (1.35 → 1.15)
/* 이 화면 밀도를 기준으로 삼는다. 전지구 뷰(4.7px/°)에서 배율 2.55 가 되어
   10kt 꼬리가 10px → 25px 로 늘어난다 — mapped.earth 의 줄 길이와 같은 자리다. */
const REF_PX_PER_DEG = 12;
const BOOST_MIN = 0.05, BOOST_MAX = 4;   // 극단적인 줌에서 폭주하지 않게

function degPerSec(ms) {
  const kt = ms * MS_TO_KT;
  return BASE * Math.pow(Math.max(kt, 0.1) / 10, EXP);
}

export const windField = {
  grid: null,
  on: false,
  canvas: null, ctx: null,
  parts: [],
  _timer: null,
  _lastFetch: 0,
  _last: 0,
  _camKey: null,
  _ticks: 0,
  _tickCostSum: 0, _tickCostN: 0,
  _scratchWind: { u: 0, v: 0 },
  _scratchCur: null, _scratchScreen: null,   // 2D·컬럼버스 뷰 폴백에서만 쓴다
  _scratchMeasA: null, _scratchMeasB: null, _scratchMeas2A: null, _scratchMeas2B: null,
  _boost: 1,

  init() {
    const cv = document.createElement('canvas');
    cv.id = 'windCanvas';
    Object.assign(cv.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none',
      zIndex: '9', opacity: '0', transition: 'opacity .5s ease',
    });
    scene.canvas.parentElement.appendChild(cv);
    this.canvas = cv;
    this.ctx = cv.getContext('2d');
    this._scratchCur = new Cesium.Cartesian3();
    this._scratchScreen = new Cesium.Cartesian2();
    this._scratchMeasA = new Cesium.Cartesian3();
    this._scratchMeasB = new Cesium.Cartesian3();
    this._scratchMeas2A = new Cesium.Cartesian2();
    this._scratchMeas2B = new Cesium.Cartesian2();
    this._resize();
    new ResizeObserver(() => this._resize()).observe(scene.canvas.parentElement);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._stop();
      else if (this.on) this._start();
    });
    return this;
  },

  _resize() {
    const el = scene.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, el.clientWidth * dpr);
    this.canvas.height = Math.max(1, el.clientHeight * dpr);
    this.canvas.style.width = el.clientWidth + 'px';
    this.canvas.style.height = el.clientHeight + 'px';
    this._dpr = dpr;
    // 밀도는 CSS 픽셀로 센다 — dpr 2 화면에서 4배가 뿌려지지 않게 한다
    this._cssW = el.clientWidth; this._cssH = el.clientHeight;
    // 캔버스 크기를 바꾸면 내용이 지워진다 → 이전 좌표를 남겨두면 엉뚱한 선이 그어진다
    for (const p of (this.parts || [])) p.px = null;
  },

  async load() {
    // 1시간짜리 자료라 30분 안에 다시 받을 이유가 없다
    if (this.grid && Date.now() - this._lastFetch < 30 * 60_000) return this.grid;
    const r = await fetch(`${API.WIND}/global.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('wind ' + r.status);
    this.grid = await r.json();
    this._lastFetch = Date.now();
    return this.grid;
  },

  /* 어느 바람을 그릴지. 'now' = 지금(u/v), 'fc' = 내일(fu/fv).
     ⚠️ 둘을 동시에 그리지 않는다. 같은 화면에 지금 바람과 내일 바람이 섞이면
        어느 것이 어느 것인지 알 방법이 없다. registry 가 배타로 묶는다. */
  field: 'now',

  setField(f) {
    if (this.field === f) return;
    this.field = f;
    // 입자를 새로 뿌린다 — 안 그러면 이전 바람을 타던 입자가 잠시 남는다
    if (this.on) { this._stop(); this._start(); }
    this._tagForecast(this.on);
  },

  /** 범례에 "내일 · 날짜"를 붙인다.
      ⚠️ 예보를 켜놓고 아무 표시가 없으면 사용자는 지금 바람으로 읽는다.
         날짜까지 적어야 "내일이 언제인지"가 분명해진다. */
  _tagForecast(on) {
    const el = document.getElementById('windFcTag');
    if (!el) return;
    const show = !!on && this.field === 'fc';
    el.hidden = !show;
    if (!show) return;
    const d = this.forecastDate;
    const ko = i18n.lang === 'ko';
    el.textContent = ko
      ? `내일 예보${d ? ` · ${d.slice(5).replace('-', '월 ')}일` : ''}`
      : `Tomorrow’s forecast${d ? ` · ${d}` : ''}`;
  },

  /** 지금 그리는 것이 예보인가 — 범례가 "내일"이라고 밝혀야 한다 */
  get isForecast() { return this.field === 'fc'; },

  /** 예보 대상 날짜 (지점 현지 기준 대표 날짜) */
  get forecastDate() { return this.grid?.fcDate || null; },

  /* 타임라인 예보 보기 — 지역(동아시아) 격자로 대신 분다. null 이면 실황.
     ⚠️ 지역 격자는 경도로 안 감긴다 — 범위 밖이면 입자를 안 그린다.
        예보 시각에 실황 바람을 그리는 것보다 빈 것이 정직하다. */
  override: null,

  /** 격자에서 (lat,lon) 의 바람 — 양선형 보간 */
  sample(lat, lon, out = null) {
    const g = this.override || this.grid;
    if (!g) return null;
    let fx;
    if (this.override) {
      fx = (lon - g.lon0) / g.res;
      if (fx < 0 || fx > g.nx - 1) return null;       // 지역 격자 밖
    } else {
      fx = ((lon - g.lon0) / g.res + g.nx) % g.nx;
    }
    const fy = (lat - g.lat0) / g.res;
    if (fy < 0 || fy > g.ny - 1) return null;         // 극지는 자료가 없다

    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = (x0 + 1) % g.nx, y1 = Math.min(y0 + 1, g.ny - 1);
    const tx = fx - x0, ty = fy - y0;
    const U = this.override ? g.u : (this.field === 'fc' ? g.fu : g.u);
    const V = this.override ? g.v : (this.field === 'fc' ? g.fv : g.v);
    // ⚠️ 예보 격자가 없으면 지금 바람으로 대신 그리지 않는다 — 아무것도 안 그린다.
    if (!U || !V) return null;
    /* ⚠️ 이 함수는 입자마다 매 틱 호출된다. 예전의 at/bl 화살표 함수 두 개와
       {u,v} 반환 객체는 1,500입자 × 30fps 에서 초당 13만 개가 넘는 짧은 객체를
       만들었다. 인덱스·보간을 직접 계산하고 호출자가 준 결과 객체를 재사용한다. */
    const i00 = y0 * g.nx + x0, i10 = y0 * g.nx + x1;
    const i01 = y1 * g.nx + x0, i11 = y1 * g.nx + x1;
    const a = U[i00], b = U[i10], c = U[i01], d = U[i11];
    const e = V[i00], f = V[i10], h = V[i01], i = V[i11];
    if (a == null || b == null || c == null || d == null
        || e == null || f == null || h == null || i == null) return null;
    const x0w = 1 - tx, y0w = 1 - ty;
    const w00 = x0w * y0w, w10 = tx * y0w, w01 = x0w * ty, w11 = tx * ty;
    const result = out || {};
    result.u = a * w00 + b * w10 + c * w01 + d * w11;
    result.v = e * w00 + f * w10 + h * w01 + i * w11;
    return result;
  },

  /* ⚠️ 뷰 사각형은 **틱마다 한 번만** 구한다(_tick 이 _viewRect 에 넣어 준다).
     입자마다 computeViewRectangle 을 부르면, 2,800개가 3초마다 죽고 살아나는
     지금 밀도에서 초당 900번 넘게 카메라 절두체를 다시 푼다. */
  _spawn(p) {
    // 화면에 보이는 범위 안에 뿌려야 낭비가 없다
    const r = this._viewRect;
    let lat, lon;
    if (r) {
      const s = Cesium.Math.toDegrees(r.south), n = Cesium.Math.toDegrees(r.north);
      let w = Cesium.Math.toDegrees(r.west), e = Cesium.Math.toDegrees(r.east);
      if (e < w) e += 360;
      lat = s + Math.random() * (n - s);
      lon = ((w + Math.random() * (e - w) + 540) % 360) - 180;
    } else {
      lat = -80 + Math.random() * 160;
      lon = -180 + Math.random() * 360;
    }
    p.lat = lat; p.lon = lon;
    p.age = Math.random() * LIFE_SEC;
    p.px = null;
  },

  set(on) {
    this.on = on;
    this.canvas.style.opacity = on ? '1' : '0';
    document.getElementById('windLegend')?.classList.toggle('on', on);
    this._tagForecast(on);
    if (on) {
      /* ⚠️ 날짜는 격자 안에 있다. load() 전에는 알 수 없으므로 받은 뒤 다시 붙인다.
         (안 그러면 "내일 예보"까지만 나오고 그 내일이 언제인지 못 밝힌다.) */
      this.load()
        .then(() => { this._start(); this._tagForecast(this.on); })
        .catch(e => console.warn('[wind]', e.message));
    } else {
      this._stop();
    }
  },

  _start() {
    if (this._timer != null || document.hidden || !this.on || !this.grid) return;
    const n = Math.min(COUNT_MAX,
      Math.round((this._cssW || 1) * (this._cssH || 1) / DENSITY_CSS_PX));
    if (this.parts.length !== n) {
      this._viewRect = viewer.camera.computeViewRectangle(scene.globe.ellipsoid);
      this.parts = Array.from({ length: n }, () => { const p = {}; this._spawn(p); return p; });
    }
    const step = () => {
      this._timer = null;
      if (!this.on || document.hidden) return;
      this._tick();
      /* ⚠️ rAF 에 바로 다시 걸면 ProMotion 에서 120회/초 돈다.
         바람 속도는 dt 기반이라 30fps 로 줄여도 물리적 이동과 꼬리 길이는 같다. */
      this._timer = setTimeout(step, FRAME_MS);
    };
    this._timer = setTimeout(step, 0);
  },

  /** 지금 화면에서 경도 1°가 몇 CSS 픽셀인가 — 줌 보정의 유일한 입력.
   *  ⚠️ 계산으로 어림하지 않고 **화면에 실제로 찍어 본다**. 지구는 구라서 화면
   *     중심과 지평선 근처가 다르고, 카메라 기울기·투영에 따라서도 달라진다.
   *     보이는 범위의 한가운데에서 1° 떨어진 두 점을 투영해 그 거리를 쓴다.
   *  ⚠️ 실패하면(지평선 밖·투영 불가) 이전 값을 유지한다. 0 을 돌려주면 배율이
   *     무한대가 되어 입자가 지구 밖으로 튀어 나간다. */
  _measurePxPerDeg() {
    const r = this._viewRect;
    if (!r) return null;
    let lat = Cesium.Math.toDegrees((r.south + r.north) / 2);
    let lon = Cesium.Math.toDegrees(r.west + Cesium.Rectangle.computeWidth(r) / 2);
    lat = Math.max(-70, Math.min(70, lat));   // 극 근처의 경도 수렴을 기준으로 삼지 않는다
    const ell = scene.globe.ellipsoid;
    const a = Cesium.Cartesian3.fromDegrees(lon, lat, 0, ell, this._scratchMeasA);
    const b = Cesium.Cartesian3.fromDegrees(lon + 1, lat, 0, ell, this._scratchMeasB);
    const pa = scene.cartesianToCanvasCoordinates(a, this._scratchMeas2A);
    const pb = scene.cartesianToCanvasCoordinates(b, this._scratchMeas2B);
    if (!pa || !pb) return null;
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    return Number.isFinite(d) && d > 0.01 ? d : null;
  },

  /** 틱당 한 번 뷰·투영 행렬을 만들어 `_vp`(열 우선 16개)에 담는다.
   *  @returns {boolean} 이 행렬로 직접 투영해도 되는가 (3D 모드일 때만 true)
   *  ⚠️ `uniformState.viewProjection` 을 읽지 않고 카메라에서 다시 만든다.
   *     requestRenderMode 에서는 렌더가 없으면 uniformState 가 한 프레임 늦는다. */
  _prepareProjection() {
    if (scene.mode !== Cesium.SceneMode.SCENE3D) return false;
    if (!this._vp) { this._vp = new Float64Array(16); this._vpM = new Cesium.Matrix4(); }
    const cam = viewer.camera;
    const proj = cam.frustum.projectionMatrix;
    if (!proj) return false;
    Cesium.Matrix4.multiply(proj, cam.viewMatrix, this._vpM);
    Cesium.Matrix4.toArray(this._vpM, this._vp);
    return true;
  },

  _stop() {
    clearTimeout(this._timer); this._timer = null;
    this._last = 0;
    for (const p of this.parts) p.px = null;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  _tick() {
    if (!this.on || !this.grid || document.hidden) { this._last = 0; return; }
    const tickStarted = performance.now();
    this._ticks++;

    /* ⚠️ 프레임 수가 아니라 실제 경과 시간으로 움직여야 한다.
       안 그러면 120Hz 폰이 30fps 기기보다 4배 빨라진다 (그래서 태풍처럼 보였다).
       탭 전환 등으로 크게 튄 구간은 잘라낸다 — 순간이동을 막는다. */
    const now = performance.now();
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0.016;
    this._last = now;

    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;

    /* 꼬리는 "그때 그 화면 좌표"에 그려진 그림이다. 지구를 돌리면 그 좌표가 전혀
       다른 곳을 가리키게 되므로, 카메라가 움직인 프레임은 통째로 지운다.
       (짧은 페이드로 남겨 봤다가 "선이 옆으로 휜다"는 지적을 받고 되돌렸다.
        파일 머리말의 JUMP_PX 위 주석 참고.) */
    const c = viewer.camera;
    const key = `${c.positionWC.x.toFixed(0)},${c.positionWC.y.toFixed(0)},${c.positionWC.z.toFixed(0)},`
              + `${c.directionWC.x.toFixed(3)},${c.directionWC.y.toFixed(3)}`;
    const moved = key !== this._camKey;
    this._camKey = key;
    /* 카메라가 움직였으면 뿌릴 범위도, 1°가 몇 픽셀인지도 달라졌다.
       ⚠️ 둘 다 **틱당 한 번만** 구한다. 입자마다 부르면 초당 수천 번이 된다. */
    if (moved || !this._viewRect) {
      this._viewRect = c.computeViewRectangle(scene.globe.ellipsoid);
      const pxPerDeg = this._measurePxPerDeg();
      if (pxPerDeg) {
        this._boost = Math.max(BOOST_MIN,
          Math.min(BOOST_MAX, REF_PX_PER_DEG / pxPerDeg));
      }
    }

    if (moved) {
      ctx.clearRect(0, 0, W, H);
      for (const p of this.parts) p.px = null;
    } else {
      // 가만히 있을 때만 꼬리를 남긴다.
      // 60fps 기준으로 FADE 가 되도록 dt 로 보정 — 주사율이 달라도 꼬리 길이가 같다
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(FADE, dt * 60)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    const cam = c.positionWC;
    const camX = cam.x, camY = cam.y, camZ = cam.z;
    ctx.lineCap = 'round';

    /* 틱당 한 번: 뷰·투영 행렬. 입자마다 Cesium 에 물어보는 대신 이걸 직접 곱한다
       (파일 머리말의 실측 근거 참고 — 투영이 틱 비용의 79% 였다). */
    const fast = this._prepareProjection();
    const M = this._vp, cssW = this._cssW, cssH = this._cssH, dpr = this._dpr;

    /* 세기 구간별 선분 모음. 입자마다 stroke() 하면 2,800번이라 캔버스가 못 버틴다.
       ⚠️ 배열은 한 번 만들어 두고 길이만 0 으로 되돌린다 — 매 틱 새로 만들면
          초당 180개의 배열이 생겨 짧은 GC 가 계속 난다. */
    if (!this._segs) this._segs = BUCKETS.map(() => []);
    const segs = this._segs;
    const jump = JUMP_PX * dpr;

    for (const p of this.parts) {
      if ((p.age += dt) > LIFE_SEC) { this._spawn(p); continue; }
      const w = this.sample(p.lat, p.lon, this._scratchWind);
      if (!w) { this._spawn(p); continue; }

      // 크기는 윈디 척도로 매핑하고 방향(단위벡터)은 그대로 쓴다.
      // _boost 는 이 화면 전체에 같은 값이라 바람 사이의 상대 세기는 안 바뀐다.
      const ms = Math.hypot(w.u, w.v);
      const step = degPerSec(ms) * dt * this._boost;
      const ux = ms > 0.01 ? w.u / ms : 0, uy = ms > 0.01 ? w.v / ms : 0;
      const nlat = p.lat + uy * step;
      // 고위도로 갈수록 경도 1도의 실제 거리가 짧아진다 → 보정 안 하면 극 근처가 느려 보인다
      const nlon = p.lon + ux * step / Math.max(0.25, Math.cos(p.lat * Math.PI / 180));

      /* 위경도 → 지구중심 좌표. Cartesian3.fromDegrees 와 같은 식을 그대로 편다
         (WGS84 타원체 위의 점). 객체를 안 만들고 숫자 세 개만 남긴다. */
      const latR = p.lat * D2R, lonR = p.lon * D2R;
      const cl = Math.cos(latR);
      const nx = cl * Math.cos(lonR), ny = cl * Math.sin(lonR), nz = Math.sin(latR);
      const kx = WGS84_A2 * nx, ky = WGS84_A2 * ny, kz = WGS84_B2 * nz;
      const gamma = Math.sqrt(nx * kx + ny * ky + nz * kz);
      const X = kx / gamma, Y = ky / gamma, Z = kz / gamma;

      /* ⚠️ 지구 뒤편 입자는 그리지 않는다. P·(C−P) > 0 이면 앞면이다.
         (예전엔 측지 법선을 썼다. 지심 방향과 최대 0.2° 차이인데 지평선 판정에는
          보이지 않는 차이라, 함수 호출 세 번을 줄이는 쪽을 택했다.) */
      let x = null, y = null;
      if (X * camX + Y * camY + Z * camZ > X * X + Y * Y + Z * Z) {
        if (fast) {
          // 열 우선 4×4. w > 0 이어야 카메라 앞이다.
          const cwv = M[3] * X + M[7] * Y + M[11] * Z + M[15];
          if (cwv > 0) {
            const cxv = M[0] * X + M[4] * Y + M[8] * Z + M[12];
            const cyv = M[1] * X + M[5] * Y + M[9] * Z + M[13];
            x = (cxv / cwv * 0.5 + 0.5) * cssW * dpr;
            y = (0.5 - cyv / cwv * 0.5) * cssH * dpr;
          }
        } else {
          // 2D·컬럼버스 뷰 — 행렬이 안 맞는다. 예전 경로로 물어본다.
          this._scratchCur.x = X; this._scratchCur.y = Y; this._scratchCur.z = Z;
          const sc = scene.cartesianToCanvasCoordinates(this._scratchCur, this._scratchScreen);
          if (sc) { x = sc.x * dpr; y = sc.y * dpr; }
        }
      }

      if (x !== null) {
        /* ⚠️ 카메라가 크게 움직였거나 지평선을 넘어 다시 나타난 입자는 이전 좌표가
           전혀 다른 곳이다. 그대로 이으면 화면을 가로지르는 가짜 선이 생긴다. */
        if (p.px != null && Math.abs(x - p.px) < jump && Math.abs(y - p.py) < jump) {
          segs[bucketOf(ms)].push(p.px, p.py, x, y);
        }
        p.px = x; p.py = y;
      } else p.px = null;

      p.lat = nlat;
      if (p.lat > 84 || p.lat < -84) { this._spawn(p); continue; }
      p.lon = ((nlon + 540) % 360) - 180;
    }

    /* 약한 바람부터 그린다 — 겹치는 자리에서 강한 바람이 위에 오게. */
    for (let b = 0; b < BUCKETS.length; b++) {
      const list = segs[b];
      if (!list.length) continue;
      const spec = BUCKETS[b];
      ctx.strokeStyle = `rgba(${spec.rgb},${spec.a})`;
      ctx.lineWidth = spec.w * this._dpr;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 4) {
        ctx.moveTo(list[i], list[i + 1]);
        ctx.lineTo(list[i + 2], list[i + 3]);
      }
      ctx.stroke();
      list.length = 0;
    }

    /* ⚠️⚠️ 여기 있던 power.animate(200) 을 없앴다. 이 앱 최대의 발열 경로였다.
       ─────────────────────────────────────────────────────────────
       예전 동작: 매 rAF 틱(주사율, 최대 120Hz)마다 간격 없이 animate(200) 을 불러,
         바람 레이어가 켜져 있는 내내 **Cesium 지구본이 30fps 로 영구 재렌더**됐다.
         requestRenderMode 를 켜 둔 의미가 통째로 사라졌다.

       왜 필요 없나 — **입자는 Cesium 이 그리는 게 아니다.**
         이 모듈은 scene.canvas 옆에 자기 <canvas> 를 따로 만들어(67~74행)
         2D 컨텍스트에 직접 그린다. 화면 좌표는 SceneTransforms 로 구하는데,
         그건 카메라 행렬만 읽을 뿐 렌더를 요구하지 않는다.
         지평선 뒤 입자를 숨기는 판정도 여기서 직접 한다(법선·내적).
         → 지구본을 다시 그려도 입자 캔버스는 1픽셀도 안 바뀐다.

       카메라가 움직이면 Cesium 이 알아서 렌더한다(사용자 조작은 항상 렌더를 깨운다).
       카메라가 멈춰 있으면 지구본은 바뀔 것이 없고, 입자는 자기 타이머로 계속 흐른다. */

    /* 개발 계측용. 매 틱 DOM 을 건드리지 않고 약 1초에 한 번만 비용을 남긴다. */
    this._tickCostSum += performance.now() - tickStarted;
    this._tickCostN++;
    if (this._tickCostN >= 30) {
      this.canvas.dataset.ticks = String(this._ticks);
      this.canvas.dataset.tickMs = (this._tickCostSum / this._tickCostN).toFixed(2);
      this.canvas.dataset.particles = String(this.parts.length);
      // 줌 보정 배율 — "전지구에서만 점으로 보인다"의 회귀를 여기서 잰다
      this.canvas.dataset.boost = this._boost.toFixed(2);
      this._tickCostSum = 0;
      this._tickCostN = 0;
    }
  },
};
