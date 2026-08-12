import { viewer, scene } from './viewer.js';
import { projectMoonDirection } from './ambient-moon-math.js';

const REFRESH_MS = 5 * 60_000;
const RENDER_THROTTLE_MS = 80;

const inertialScratch = new Cesium.Cartesian3();
const fixedScratch = new Cesium.Cartesian3();
const unitScratch = new Cesium.Cartesian3();
const cameraUnitScratch = new Cesium.Cartesian3();
const icrfToFixedScratch = new Cesium.Matrix3();

function moonDirectionInFixedFrame(at) {
  const time = Cesium.JulianDate.fromDate(at);
  let transform = Cesium.Transforms.computeIcrfToFixedMatrix(time, icrfToFixedScratch);
  // Cesium Moon.js와 같은 fallback. 지구자전 보조자료가 아직 로드되지 않은 첫 프레임도 막는다.
  if (!Cesium.defined(transform)) {
    transform = Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, icrfToFixedScratch);
  }
  const inertial = Cesium.Simon1994PlanetaryPositions
    .computeMoonPositionInEarthInertialFrame(time, inertialScratch);
  Cesium.Matrix3.multiplyByVector(transform, inertial, fixedScratch);
  return Cesium.Cartesian3.normalize(fixedScratch, unitScratch);
}

export const ambientMoon = {
  el: null,
  lastRenderUpdate: 0,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.el = document.getElementById('ambientMoon');
    if (!this.el) return;
    this.initialized = true;
    this.update(new Date());

    // 카메라가 실제로 렌더되는 동안만 따라간다. 이 리스너가 렌더를 새로 요청하지는 않는다.
    scene.postRender.addEventListener(() => {
      const now = performance.now();
      if (now - this.lastRenderUpdate < RENDER_THROTTLE_MS) return;
      this.lastRenderUpdate = now;
      this.update(new Date());
    });
    window.addEventListener('resize', () => this.update(new Date()));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.update(new Date());
    });
    setInterval(() => this.update(new Date()), REFRESH_MS);
  },

  update(at) {
    if (!this.el || !viewer || !scene?.canvas) return;
    try {
      const direction = moonDirectionInFixedFrame(at);
      const camera = viewer.camera;
      const cameraUnit = Cesium.Cartesian3.normalize(camera.positionWC, cameraUnitScratch);
      const horizontal = Cesium.Cartesian3.dot(direction, camera.rightWC);
      const vertical = Cesium.Cartesian3.dot(direction, camera.upWC);
      const towardCamera = Cesium.Cartesian3.dot(direction, cameraUnit);
      const canvas = scene.canvas;
      const moonRadius = Math.max(1, this.el.offsetWidth / 2);
      const projection = projectMoonDirection({
        horizontal,
        vertical,
        towardCamera,
        viewportWidth: canvas.clientWidth,
        viewportHeight: canvas.clientHeight,
        earthRadius: canvas.clientHeight * .26,
        moonRadius,
        gap: Math.max(20, canvas.clientHeight * .035),
      });
      if (!projection.visible) {
        this.el.classList.remove('ready');
        return;
      }

      this.el.style.setProperty('--moon-x', `${projection.x.toFixed(2)}px`);
      this.el.style.setProperty('--moon-y', `${projection.y.toFixed(2)}px`);
      this.el.dataset.depth = projection.depth;
      this.el.dataset.hside = projection.x < canvas.clientWidth / 2 ? 'left' : 'right';
      this.el.dataset.note = projection.depth === 'far'
        ? '현재 달 방향 · 지구 뒤쪽 · 거리 축약'
        : '현재 달 방향 · 거리 축약';
      const utc = at.toISOString();
      this.el.title = `현재 달 방향 · ${utc} · 지구와의 거리는 화면에 맞게 축약`;
      this.el.setAttribute('aria-label', `${this.el.dataset.note} · 계산 시각 ${utc}`);
      this.el.classList.add('ready');
    } catch (error) {
      this.el.classList.remove('ready');
      console.warn('[ambient-moon]', error.message);
    }
  },
};
