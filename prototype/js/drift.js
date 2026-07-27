// 지구 관성 흘러가기
//
// inertiaSpin(viewer.js)은 손을 뗀 뒤 "감속하며 멎는" 관성이다. 결국 멈춘다.
// 여기서 하는 건 그다음이다 — 멎고 나서도 마지막으로 민 방향으로 아주 천천히 계속 돈다.
// 실제 지구본을 살짝 밀어두면 계속 도는 것과 같은 느낌을 노린 것이다.
//
// 규칙
//   · Ambient(멀리 있을 때)에서만 돈다. 확대해서 뭔가 보고 있는데 화면이 흐르면 방해다.
//   · 사용자가 만지면 즉시 멈추고, 손 뗀 뒤 잠깐 기다렸다가 다시 시작한다.
//   · 방향은 마지막 드래그의 좌우 성분을 따른다. 위아래로만 밀었으면 기본(서→동)으로 둔다.
//   · 시트·패널이 열려 있으면 돌지 않는다 (읽는 중에 배경이 움직이면 산만하다).

import { viewer, scene } from './viewer.js';
import { store } from './store.js';
import { T } from './config.js';
import { OPEN_PANELS } from './panels.js';
import { power } from './power.js';

const RATE_DEG_S = 0.15;   // 초당 회전각. 0.15°/s ≈ 9°/분 — 눈에 띄지만 성가시지 않은 정도
const RESUME_MS  = 2000;   // 손 뗀 뒤 이만큼 지나면 다시 흐르기 시작
const RAMP_MS    = 1800;   // 갑자기 튀지 않게 서서히 속도를 올리는 시간

/* ⚠️⚠️ 회전에 끝을 둔다. 발열의 가장 큰 원인이었다.
   카메라가 움직이면 타일 선택부터 전 엔티티 화면좌표까지 다시 계산된다 —
   파문 몇 개보다 훨씬 비싸다. 그런데 예전에는 **영구히** 돌았다:
   손 떼고 2초 뒤 시작해서 앱을 닫을 때까지 멈추지 않았다.
   실제 지구본도 밀어두면 결국 멎는다. 그 편이 비유에도 맞고 기기도 식는다. */
const SPIN_DOWN_MS = 75_000;   // 손 뗀 뒤 이만큼 지나면 회전을 멈춘다

/* 회전은 초당 0.15° 다 — 33ms 동안 0.005° 움직인다. 30fps 로 그릴 이유가 없다.
   90ms(≈11fps) 로도 부드럽고, 렌더 횟수가 3분의 1 이 된다. */
const DRIFT_GAP_MS = 90;

/* 확대하면 같은 각속도라도 화면에서는 훨씬 빠르게 보인다.
   (경도 1° 가 차지하는 픽셀이 늘어나기 때문)
   → 가까울수록 각속도를 줄여서 체감 속도를 비슷하게 맞춘다. */
function zoomScale(h) {
  return Math.min(1, Math.max(0.12, h / T.CHROME));
}

export const drift = {
  enabled: localStorage.getItem('earthus.drift') !== 'off',
  dir: -1,                 // -1 = 서→동 (지구 자전과 같은 방향). 기본값.
  _lastInput: 0,
  _lastFrame: 0,
  _dragStartX: null,

  init() {
    const canvas = scene.canvas;

    // 드래그 방향 기록 — 마지막으로 민 좌우 성분을 방향으로 삼는다
    const h = new Cesium.ScreenSpaceEventHandler(canvas);
    const down = m => { this._dragStartX = (m.position || m.startPosition)?.x ?? null; this._touch(); };
    const move = m => {
      this._touch();
      if (this._dragStartX == null) return;
      const x = (m.endPosition || m.position)?.x;
      if (x == null) return;
      const dx = x - this._dragStartX;
      // 미세한 떨림으로 방향이 뒤집히지 않도록 문턱을 둔다
      if (Math.abs(dx) > 6) this.dir = dx > 0 ? 1 : -1;
    };
    const up = () => { this._dragStartX = null; this._touch(); };

    h.setInputAction(down, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    h.setInputAction(move, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    h.setInputAction(up,   Cesium.ScreenSpaceEventType.LEFT_UP);
    h.setInputAction(this._touch.bind(this), Cesium.ScreenSpaceEventType.WHEEL);
    h.setInputAction(down, Cesium.ScreenSpaceEventType.PINCH_START);
    h.setInputAction(up,   Cesium.ScreenSpaceEventType.PINCH_END);

    /* ⚠️ preRender 에 걸면 안 된다.
       requestRenderMode 를 켜두면 렌더가 없을 때 preRender 가 안 불리고,
       그러면 이 틱이 안 돌아 렌더를 요청하지도 못한다 (교착).
       power 의 시계는 렌더와 무관하게 돌아서 그 고리를 끊는다. */
    power.onTick(() => this._tick());
    return this;
  },

  _touch() { this._lastInput = performance.now(); },

  setEnabled(on) {
    this.enabled = on;
    localStorage.setItem('earthus.drift', on ? 'on' : 'off');
  },

  /** 시트가 열려 있는지 — 읽는 중에는 배경을 세운다 */
  _blocked() {
    return !!document.querySelector(OPEN_PANELS);
  },

  _tick() {
    const now = performance.now();
    const dt = this._lastFrame ? Math.min(0.2, (now - this._lastFrame) / 1000) : 0;
    this._lastFrame = now;
    if (!dt) return;

    if (!this.enabled || power.saving) return;   // 절전 모드면 안 흐른다
    if (this._blocked()) return;
    // ⚠️ 예전엔 Explore(확대 상태)에서 아예 멈췄는데,
    //    "지구가 살짝 돌아가는 느낌"은 확대해서 보고 있을 때도 있어야 한다.
    //    대신 확대할수록 느리게 해서 어지럽지 않게 한다.

    const idle = now - this._lastInput;
    if (idle < RESUME_MS) return;
    // 오래 가만히 뒀으면 회전을 멈춘다 (만지면 _lastInput 이 갱신돼 다시 시작된다)
    if (idle > SPIN_DOWN_MS) return;

    // 재개 직후 확 도는 대신 천천히 붙는다
    const ramp = Math.min(1, (idle - RESUME_MS) / RAMP_MS);
    const angle = Cesium.Math.toRadians(RATE_DEG_S) * dt * ramp * this.dir
                * zoomScale(store.height);

    // 지축(Z) 기준 회전 = 지구가 자전하는 방향과 같은 축
    viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, angle);
    power.animate(200, DRIFT_GAP_MS);   // requestRenderMode 상태에서 계속 그려지도록
  },
};
