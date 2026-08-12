import { viewer, scene } from './viewer.js';
import { classifyMoonDisplay } from './ambient-moon-math.js?v=20260812-visibility1';

const REFRESH_MS = 5 * 60_000;
const RENDER_THROTTLE_MS = 80;
const DISPLAY_DISTANCE = Cesium.Ellipsoid.WGS84.maximumRadius * 2.2;

const inertialScratch = new Cesium.Cartesian3();
const fixedScratch = new Cesium.Cartesian3();
const unitScratch = new Cesium.Cartesian3();
const displayScratch = new Cesium.Cartesian3();
const cameraToDisplayScratch = new Cesium.Cartesian3();
const windowScratch = new Cesium.Cartesian2();
const icrfToFixedScratch = new Cesium.Matrix3();
const rayScratch = new Cesium.Ray();

function moonDirectionInFixedFrame(at) {
  const time = Cesium.JulianDate.fromDate(at);
  let transform = Cesium.Transforms.computeIcrfToFixedMatrix(time, icrfToFixedScratch);
  // Cesium Moon.js와 같은 fallback. 지구자전 보조자료가 아직 로드되지 않은 첫 프레임도 막는다.
  if (!Cesium.defined(transform)) {
    transform = Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, icrfToFixedScratch);
  }
  const inertial = Cesium.Simon1994PlanetaryPositions
    .computeMoonPositionInEarthInertialFrame(time, inertialScratch);
  return Cesium.Matrix3.multiplyByVector(transform, inertial, fixedScratch);
}

export const ambientMoon = {
  el: null,
  noteEl: null,
  lastRenderUpdate: 0,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.el = document.getElementById('ambientMoon');
    this.noteEl = document.getElementById('ambientMoonNote');
    if (!this.el || !this.noteEl) return;
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
    if (!this.el || !this.noteEl || !viewer || !scene?.canvas) return;
    try {
      const moonFixed = moonDirectionInFixedFrame(at);
      const direction = Cesium.Cartesian3.normalize(moonFixed, unitScratch);
      const displayPosition = Cesium.Cartesian3.multiplyByScalar(direction, DISPLAY_DISTANCE, displayScratch);
      const camera = viewer.camera;
      const canvas = scene.canvas;
      const moonRadius = Math.max(1, this.el.offsetWidth / 2);
      const cameraToDisplay = Cesium.Cartesian3.subtract(
        displayPosition, camera.positionWC, cameraToDisplayScratch,
      );
      const distanceToDisplay = Cesium.Cartesian3.magnitude(cameraToDisplay);
      Cesium.Cartesian3.normalize(cameraToDisplay, rayScratch.direction);
      Cesium.Cartesian3.clone(camera.positionWC, rayScratch.origin);
      const earthHit = Cesium.IntersectionTests.rayEllipsoid(rayScratch, scene.globe.ellipsoid);
      const occludedByEarth = Cesium.defined(earthHit)
        && earthHit.start >= 0 && earthHit.start < distanceToDisplay;
      const inFront = Cesium.Cartesian3.dot(rayScratch.direction, camera.directionWC) > 0;
      const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
        scene, displayPosition, windowScratch,
      );
      const projection = classifyMoonDisplay({
        inFront,
        occludedByEarth,
        screenX: windowPosition?.x ?? Number.NaN,
        screenY: windowPosition?.y ?? Number.NaN,
        viewportWidth: canvas.clientWidth,
        viewportHeight: canvas.clientHeight,
        moonRadius,
      });
      const utc = at.toISOString();
      const note = projection.reason === 'EARTH_OCCLUDED'
        ? '현재 달 방향 · 지구 뒤쪽 · 거리 축약'
        : projection.reason === 'BEHIND_CAMERA'
          ? '현재 달 방향 · 현재 화면 뒤쪽 · 거리 축약'
          : projection.reason === 'OUTSIDE_VIEWPORT'
            ? '현재 달 방향 · 화면 밖 · 거리 축약'
            : '현재 달 방향 · 거리 축약';
      this.noteEl.textContent = note;
      this.noteEl.title = `Cesium 천체 계산 · ${utc}`;
      this.noteEl.classList.add('on');
      if (!projection.visible) {
        this.el.hidden = true;
        this.el.classList.remove('ready');
        return;
      }

      this.el.style.setProperty('--moon-x', `${projection.x.toFixed(2)}px`);
      this.el.style.setProperty('--moon-y', `${projection.y.toFixed(2)}px`);
      this.el.title = `현재 달 방향 · ${utc} · 지구와의 거리는 화면에 맞게 축약`;
      this.el.setAttribute('aria-label', `현재 달 방향 · 거리 축약 · 계산 시각 ${utc}`);
      this.el.hidden = false;
      this.el.classList.add('ready');
    } catch (error) {
      this.el.hidden = true;
      this.el.classList.remove('ready');
      this.noteEl.classList.remove('on');
      console.warn('[ambient-moon]', error.message);
    }
  },
};
