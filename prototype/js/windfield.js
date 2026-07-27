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
import { power } from './power.js';

const COUNT_MAX = 3000;      // 입자 수. 많을수록 촘촘하지만 프레임을 먹는다.
const LIFE_SEC = 3.0;        // 입자 수명(초)
const FADE = 0.94;           // 잔상이 남는 정도. 1 에 가까울수록 꼬리가 길다.

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

   기준점 (전지구 뷰, 경도 1° ≈ 4.7픽셀)
     10 kt   5 m/s  산들바람       0.29°/s ≈  1 px/s
     20 kt  10 m/s  선선한 바람     0.73°/s ≈  3 px/s
     34 kt  17 m/s  강풍주의보급    1.45°/s ≈  7 px/s
     40 kt  21 m/s  강풍           1.85°/s ≈  9 px/s
     64 kt  33 m/s  태풍(TY) 시작   3.50°/s ≈ 16 px/s   확실히 몰아친다
     90 kt  46 m/s  강한 태풍       5.60°/s ≈ 26 px/s

   실제보다 수천 배 과장돼 있다. 실제 속도로 그리면 초당 0.003픽셀이라
   아예 안 움직인다. 목적이 "어디로 부는지"를 보이는 것이므로 과장은 불가피하고,
   대신 배율을 일정하게 유지해 바람 간 상대 세기는 정확하다. */
export const MS_TO_KT = 1 / 0.5144;
const BASE = 0.285;          // 10kt 일 때의 도/초
const EXP = 1.35;            // 클수록 강풍이 더 두드러진다

function degPerSec(ms) {
  const kt = ms * MS_TO_KT;
  return BASE * Math.pow(Math.max(kt, 0.1) / 10, EXP);
}

export const windField = {
  grid: null,
  on: false,
  canvas: null, ctx: null,
  parts: [],
  _raf: null,
  _lastFetch: 0,
  _last: 0,
  _camKey: null,

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
    this._resize();
    new ResizeObserver(() => this._resize()).observe(scene.canvas.parentElement);
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

  /** 격자에서 (lat,lon) 의 바람 — 양선형 보간 */
  sample(lat, lon) {
    const g = this.grid;
    if (!g) return null;
    const fx = ((lon - g.lon0) / g.res + g.nx) % g.nx;
    const fy = (lat - g.lat0) / g.res;
    if (fy < 0 || fy > g.ny - 1) return null;         // 극지는 자료가 없다

    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = (x0 + 1) % g.nx, y1 = Math.min(y0 + 1, g.ny - 1);
    const tx = fx - x0, ty = fy - y0;
    const at = (x, y) => y * g.nx + x;
    const bl = (a, b, c, d) =>
      a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;

    const U = this.field === 'fc' ? g.fu : g.u;
    const V = this.field === 'fc' ? g.fv : g.v;
    // ⚠️ 예보 격자가 없으면 지금 바람으로 대신 그리지 않는다 — 아무것도 안 그린다.
    if (!U || !V) return null;
    const a = U[at(x0, y0)], b = U[at(x1, y0)], c = U[at(x0, y1)], d = U[at(x1, y1)];
    const e = V[at(x0, y0)], f = V[at(x1, y0)], h = V[at(x0, y1)], i = V[at(x1, y1)];
    if (a == null || b == null || c == null || d == null
        || e == null || f == null || h == null || i == null) return null;
    return { u: bl(a, b, c, d), v: bl(e, f, h, i) };
  },

  _spawn(p) {
    // 화면에 보이는 범위 안에 뿌려야 낭비가 없다
    const r = viewer.camera.computeViewRectangle(scene.globe.ellipsoid);
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
    if (this._raf) return;
    const n = Math.min(COUNT_MAX, Math.round(this.canvas.width * this.canvas.height / 2400));
    this.parts = Array.from({ length: n }, () => { const p = {}; this._spawn(p); return p; });
    const step = () => {
      this._raf = requestAnimationFrame(step);
      this._tick();
    };
    this._raf = requestAnimationFrame(step);
  },

  _stop() {
    cancelAnimationFrame(this._raf); this._raf = null;
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  _tick() {
    if (!this.on || !this.grid || document.hidden) { this._last = 0; return; }

    /* ⚠️ 프레임 수가 아니라 실제 경과 시간으로 움직여야 한다.
       안 그러면 120Hz 폰이 30fps 기기보다 4배 빨라진다 (그래서 태풍처럼 보였다).
       탭 전환 등으로 크게 튄 구간은 잘라낸다 — 순간이동을 막는다. */
    const now = performance.now();
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0.016;
    this._last = now;

    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;

    /* ⚠️ 카메라가 움직이면 이전 프레임의 꼬리를 지워야 한다.
       꼬리는 "그때 그 화면 좌표"에 그려진 그림이다. 지구를 돌리면 그 좌표가
       전혀 다른 곳을 가리키게 되는데, 부분 지우기(fade)만 하면 옛 자국이
       화면에 그대로 끌려다닌다 — 지구를 돌릴 때 잔상이 남는 원인이었다.
       → 카메라가 바뀐 프레임은 통째로 지우고, 입자의 이전 좌표도 버린다
         (안 버리면 옛 위치에서 새 위치로 긴 직선이 그어진다). */
    const c = viewer.camera;
    const key = `${c.positionWC.x.toFixed(0)},${c.positionWC.y.toFixed(0)},${c.positionWC.z.toFixed(0)},`
              + `${c.directionWC.x.toFixed(3)},${c.directionWC.y.toFixed(3)}`;
    const moved = key !== this._camKey;
    this._camKey = key;

    if (moved) {
      ctx.clearRect(0, 0, W, H);
      for (const p of this.parts) p.px = null;
    } else {
      // 가만히 있을 때만 꼬리를 남긴다
      ctx.globalCompositeOperation = 'destination-out';
      // 60fps 기준으로 FADE 가 되도록 dt 로 보정 — 주사율이 달라도 꼬리 길이가 같다
      const fade = 1 - Math.pow(FADE, dt * 60);
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    const cam = c.positionWC;
    const ell = scene.globe.ellipsoid;
    ctx.lineWidth = 1.1 * this._dpr;
    ctx.lineCap = 'round';

    for (const p of this.parts) {
      if ((p.age += dt) > LIFE_SEC) { this._spawn(p); continue; }
      const w = this.sample(p.lat, p.lon);
      if (!w) { this._spawn(p); continue; }

      // 크기는 윈디 척도로 매핑하고 방향(단위벡터)은 그대로 쓴다
      const ms = Math.hypot(w.u, w.v);
      const step = degPerSec(ms) * dt;
      const ux = ms > 0.01 ? w.u / ms : 0, uy = ms > 0.01 ? w.v / ms : 0;
      const nlat = p.lat + uy * step;
      // 고위도로 갈수록 경도 1도의 실제 거리가 짧아진다 → 보정 안 하면 극 근처가 느려 보인다
      const nlon = p.lon + ux * step / Math.max(0.25, Math.cos(p.lat * Math.PI / 180));

      const cur = Cesium.Cartesian3.fromDegrees(p.lon, p.lat);
      // ⚠️ 지구 뒤편 입자는 그리지 않는다. 카메라→점 벡터와 법선의 각도로 판정한다.
      const normal = ell.geodeticSurfaceNormal(cur, new Cesium.Cartesian3());
      const toCam = Cesium.Cartesian3.subtract(cam, cur, new Cesium.Cartesian3());
      const front = Cesium.Cartesian3.dot(normal, toCam) > 0;

      const sc = front ? scene.cartesianToCanvasCoordinates(cur) : null;
      if (sc) {
        const x = sc.x * this._dpr, y = sc.y * this._dpr;
        if (p.px != null) {
          // 강할수록 밝게. 60kt(윈디 범례 상한)에서 최대가 되도록 맞췄다.
          const kt = ms * MS_TO_KT;
          const a = Math.min(0.9, 0.2 + kt / 60 * 0.7);
          ctx.strokeStyle = `rgba(255,255,255,${a})`;
          ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(x, y); ctx.stroke();
        }
        p.px = x; p.py = y;
      } else p.px = null;

      p.lat = nlat;
      if (p.lat > 84 || p.lat < -84) { this._spawn(p); continue; }
      p.lon = ((nlon + 540) % 360) - 180;
    }

    // 카메라가 멈춰 있어도 입자는 움직여야 하므로 렌더를 요청한다
    power.animate(200);
  },
};
