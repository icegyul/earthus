// 인트로 — 앱을 처음 열었을 때의 "아름다운 지구"
//
// 하는 일
//   · 살짝 멀리서 시작해 안착 고도까지 부드럽게 줌인한다.
//   · 지구 자전 방향(서→동)으로 아주 천천히 계속 돈다.
//   · 사용자가 화면을 만지는 순간 멈춘다. 그 뒤는 Cesium 자체 관성만 맡는다.
//
// ⚠️ 렌더 루프를 새로 만들지 않는다. power.onTick(30Hz) 에 얹고,
//    돌아야 할 동안만 power.animate() 로 렌더를 요청한다(requestRenderMode 대응).
//    ticker 는 딱 한 번만 등록하고(내부 _active 로 껐다 켬), 두 번 등록하지 않는다
//    — power.onTick 은 해제가 없어서 중복 등록하면 영영 두 배로 돈다.

import { viewer, fitGlobeHeight } from './viewer.js';
import { power } from './power.js';

const RATE_DEG_S    = 0.22;   // 인트로 회전 각속도 (drift 0.15 보다 살짝 또렷하게)
const ZOOM_IN_MS    = 4000;   // 줌인에 걸리는 시간
const SPIN_MAX_MS   = 30_000; // 첫 화면 연출도 30초 뒤에는 반드시 멎는다
const START_FRAC    = 0.42;   // 시작 — 살짝 멀리 (fraction 작을수록 지구가 작다=멀다)
const REST_FRAC     = 0.52;   // 안착 — ambient 기본과 같다

const easeOutCubic = p => 1 - Math.pow(1 - p, 3);

export const intro = {
  _active: false,
  _registered: false,
  _zoom: false,          // 이번 회차에 줌인을 할지
  _t0: 0,
  _last: 0,
  _fromH: 0,
  _toH: 0,
  _stopListeners: null,

  /** @param {{zoom?:boolean}} opts  zoom:false 면 회전만(위치 이동 후 재개용) */
  start(opts = {}) {
    this._zoom = opts.zoom !== false;
    this._toH = fitGlobeHeight(REST_FRAC);

    if (this._zoom) {
      // 살짝 멀리서 시작. 로딩 오버레이가 아직 덮고 있을 때 잡으므로 튀어 보이지 않는다.
      this._fromH = fitGlobeHeight(START_FRAC);
      const c = viewer.camera.positionCartographic;
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, this._fromH) });
    }

    this._t0 = performance.now();
    this._last = this._t0;
    this._active = true;
    this._armStop();

    if (!this._registered) { power.onTick(() => this._tick()); this._registered = true; }
    // 줌인 구간 + 그 뒤로도 계속 돌 것이므로 넉넉히 요청하고, _tick 에서 매번 연장한다.
    power.animate(ZOOM_IN_MS + 1000, 0, 'intro');
  },

  /** 첫 입력에 멈춘다 */
  _armStop() {
    this._stopListeners?.();     // 중복 등록 방지 — 이전 리스너가 있으면 먼저 뗀다
    const stop = () => this.stop();
    /* 메뉴·레이어를 누른 뒤에도 배경 지구가 90초 도는 것은 숨은 발열이다.
       캔버스만 듣지 말고 문서 전체의 첫 조작에서 멈춘다. */
    const cv = document;
    const evs = ['pointerdown', 'wheel', 'touchstart'];
    evs.forEach(e => cv.addEventListener(e, stop, { once: true, passive: true }));
    this._stopListeners = () => evs.forEach(e => cv.removeEventListener(e, stop));
  },

  stop() {
    if (!this._active) return;
    this._active = false;
    /* ⚠️ 움직임만 멈추고 예약된 5초 렌더를 남기면, 첫 터치 뒤에도 빈 화면을
       계속 그린다. 주인 키를 같이 취소해야 GPU 가 그 순간 실제로 쉰다. */
    power.cancel('intro');
    this._stopListeners?.();
    this._stopListeners = null;
  },

  _tick() {
    if (!this._active || document.hidden) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    if (!dt) return;

    // 오래 안 만지면 스스로 멎는다 — 밀어둔 지구본도 결국 멈춘다(발열 방지).
    if (now - this._t0 > SPIN_MAX_MS) { this.stop(); return; }

    // 서→동 회전 (drift 와 같은 규약: UNIT_Z, 부호 -1)
    viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, Cesium.Math.toRadians(RATE_DEG_S) * dt * -1);

    // 줌인 — fromH → toH 로 easeOut. 다 끝나면 회전만 계속된다.
    if (this._zoom) {
      const p = Math.min(1, (now - this._t0) / ZOOM_IN_MS);
      const targetH = this._fromH + (this._toH - this._fromH) * easeOutCubic(p);
      const curH = viewer.camera.positionCartographic.height;
      viewer.camera.zoomIn(curH - targetH);   // 양수면 하강(줌인), p=1 이후엔 ≈0
      if (p >= 1) {
        this._zoom = false;
        /* 같은 주인의 빠른 간격은 진행 중인 요청 동안 유지된다. 줌 요청을 한 번
           거둬야 아래 10fps 회전 간격으로 실제 전환된다. */
        power.cancel('intro');
      }
    }

    /* 줌이 끝난 뒤의 0.22°/s 회전은 10fps 로도 충분히 부드럽다. 첫 4초만
       30fps 를 쓰고, 이후에는 렌더 횟수를 3분의 1로 낮춘다. */
    power.animate(300, this._zoom ? 0 : 100, 'intro');
  },
};
