import { viewer, scene } from './viewer.js';
import { classifyMoonDisplay } from './ambient-moon-math.js?v=20260812-cesium3d1';

const REFRESH_MS = 5 * 60_000;
const DISPLAY_DISTANCE = Cesium.Ellipsoid.WGS84.maximumRadius * 2.2;
const DISPLAY_RADIUS = 950_000;

const inertialScratch = new Cesium.Cartesian3();
const fixedScratch = new Cesium.Cartesian3();
const unitScratch = new Cesium.Cartesian3();
const displayScratch = new Cesium.Cartesian3();
const cameraToDisplayScratch = new Cesium.Cartesian3();
const radiusEdgeScratch = new Cesium.Cartesian3();
const windowScratch = new Cesium.Cartesian2();
const windowEdgeScratch = new Cesium.Cartesian2();
const icrfToFixedScratch = new Cesium.Matrix3();
const moonRotationScratch = new Cesium.Matrix3();
const modelMatrixScratch = new Cesium.Matrix4();
const rayScratch = new Cesium.Ray();
const moonAxes = typeof Cesium.IauOrientationAxes === 'function'
  ? new Cesium.IauOrientationAxes()
  : null;

function moonFrame(at) {
  const time = Cesium.JulianDate.fromDate(at);
  let transform = Cesium.Transforms.computeIcrfToFixedMatrix(time, icrfToFixedScratch);
  // Cesium Moon.js와 같은 fallback. 지구자전 보조자료가 아직 로드되지 않은 첫 프레임도 막는다.
  if (!Cesium.defined(transform)) {
    transform = Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, icrfToFixedScratch);
  }
  const inertial = Cesium.Simon1994PlanetaryPositions
    .computeMoonPositionInEarthInertialFrame(time, inertialScratch);
  const fixed = Cesium.Matrix3.multiplyByVector(transform, inertial, fixedScratch);
  const direction = Cesium.Cartesian3.normalize(fixed, unitScratch);
  const position = Cesium.Cartesian3.multiplyByScalar(direction, DISPLAY_DISTANCE, displayScratch);

  // Cesium Moon.js와 같은 IAU 달 고정축. 카메라가 지구 주위를 돌 때 달 표면도 같은
  // 사진을 정면에 붙인 판처럼 따라오지 않고 3D 구체의 해당 면을 보여 준다.
  let rotation = Cesium.Matrix3.IDENTITY;
  if (moonAxes) {
    rotation = moonAxes.evaluate(time, moonRotationScratch);
    Cesium.Matrix3.transpose(rotation, rotation);
    Cesium.Matrix3.multiply(transform, rotation, rotation);
  }
  return { time, position, rotation };
}

export const ambientMoon = {
  primitive: null,
  noteEl: null,
  position: new Cesium.Cartesian3(),
  initialized: false,

  init() {
    if (this.initialized) return;
    this.noteEl = document.getElementById('ambientMoonNote');
    if (!this.noteEl) return;
    this.initialized = true;
    const frame = moonFrame(new Date());
    Cesium.Cartesian3.clone(frame.position, this.position);
    const material = Cesium.Material.fromType(Cesium.Material.ImageType);
    material.uniforms.image = 'space/planets/small/moon.webp?v=20260810d';
    material.translucent = false;
    this.primitive = scene.primitives.add(new Cesium.EllipsoidPrimitive({
      id: 'ambient-moon-3d',
      radii: new Cesium.Cartesian3(DISPLAY_RADIUS, DISPLAY_RADIUS, DISPLAY_RADIUS),
      modelMatrix: Cesium.Matrix4.fromRotationTranslation(
        frame.rotation, frame.position, modelMatrixScratch,
      ),
      material,
      onlySunLighting: true,
      depthTestEnabled: true,
    }));

    // 달은 Cesium 3D 장면 안에 있으므로 카메라 이동은 같은 렌더 프레임에서 처리된다.
    // JS가 화면 좌표를 쫓아가며 움직이지 않는다. changed는 좌하단 상태 문구만 갱신한다.
    viewer.camera.changed.addEventListener(() => this.updateStatus(new Date()));
    window.addEventListener('resize', () => this.updateStatus(new Date()));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refresh(new Date());
    });
    new MutationObserver(() => this.syncSceneVisibility()).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    setInterval(() => this.refresh(new Date()), REFRESH_MS);
    this.syncSceneVisibility();
    this.updateStatus(new Date());
    scene.requestRender();
  },

  refresh(at) {
    if (!this.primitive) return;
    try {
      const frame = moonFrame(at);
      Cesium.Cartesian3.clone(frame.position, this.position);
      Cesium.Matrix4.fromRotationTranslation(
        frame.rotation, frame.position, this.primitive.modelMatrix,
      );
      this.updateStatus(at);
      scene.requestRender();
    } catch (error) {
      console.warn('[ambient-moon]', error.message);
    }
  },

  syncSceneVisibility() {
    if (!this.primitive) return;
    this.primitive.show = !document.body.classList.contains('ocean-globe');
    scene.requestRender();
  },

  updateStatus(at) {
    if (!this.primitive || !this.noteEl || !viewer || !scene?.canvas) return;
    try {
      const camera = viewer.camera;
      const canvas = scene.canvas;
      const cameraToDisplay = Cesium.Cartesian3.subtract(
        this.position, camera.positionWC, cameraToDisplayScratch,
      );
      const distanceToDisplay = Cesium.Cartesian3.magnitude(cameraToDisplay);
      Cesium.Cartesian3.normalize(cameraToDisplay, rayScratch.direction);
      Cesium.Cartesian3.clone(camera.positionWC, rayScratch.origin);
      const earthHit = Cesium.IntersectionTests.rayEllipsoid(rayScratch, scene.globe.ellipsoid);
      const occludedByEarth = Cesium.defined(earthHit)
        && earthHit.start >= 0 && earthHit.start < distanceToDisplay;
      const inFront = Cesium.Cartesian3.dot(rayScratch.direction, camera.directionWC) > 0;
      const windowPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
        scene, this.position, windowScratch,
      );
      const radiusEdge = Cesium.Cartesian3.multiplyByScalar(
        camera.rightWC, DISPLAY_RADIUS, radiusEdgeScratch,
      );
      Cesium.Cartesian3.add(this.position, radiusEdge, radiusEdge);
      const windowEdge = Cesium.SceneTransforms.worldToWindowCoordinates(scene, radiusEdge, windowEdgeScratch);
      const moonRadius = windowPosition && windowEdge
        ? Math.max(1, Cesium.Cartesian2.distance(windowPosition, windowEdge))
        : 1;
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
      this.noteEl.dataset.renderer = 'cesium-ellipsoid';
      this.noteEl.dataset.visibility = projection.visible ? 'visible' : projection.reason;
      this.noteEl.dataset.screenX = Number.isFinite(windowPosition?.x)
        ? windowPosition.x.toFixed(1) : '';
      this.noteEl.dataset.screenY = Number.isFinite(windowPosition?.y)
        ? windowPosition.y.toFixed(1) : '';
      this.noteEl.dataset.radiusPx = moonRadius.toFixed(1);
      this.noteEl.classList.add('on');
    } catch (error) {
      this.noteEl.classList.remove('on');
      console.warn('[ambient-moon]', error.message);
    }
  },
};
