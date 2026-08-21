// Aetherus observer-local MY SKY controller.
//
// WHERE IS IT?에서 사용자가 명시적으로 기기 위치를 허용한 뒤, astronomy.js가 계산한
// 같은 target/observer/UTC의 horizontal 좌표를 N/E/S/W/ZenITH 3D 방향 구에 놓는다.
// 이 장면은 실제 별자리 배경을 꾸며내지 않는다. 표적 방향과 지평선만 보여주며,
// TAKE ME THERE가 기존 천체 상세 3D로 되돌아가게 한다.

import {
  MY_SKY_RENDER_FRAME,
  cameraYawPitchForDirection,
  horizontalToMySkyDirection,
  mySkyCardinalDirection,
} from './sky-journey.js';

const TARGET_COLORS = Object.freeze({
  sun: 0xffca55,
  mercury: 0xaaa7a0,
  venus: 0xd7b575,
  mars: 0xc86d50,
  jupiter: 0xd0a27b,
  saturn: 0xd7c28a,
  uranus: 0x86d1d5,
  neptune: 0x557bd5,
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const mix = (a, b, amount) => a + (b - a) * amount;

export function installMySkyController(cosmic3d, {
  astronomyTargets,
  ko = () => document.documentElement.lang !== 'en',
} = {}) {
  if (!cosmic3d || cosmic3d._mySkyControllerInstalled) return cosmic3d;
  if (!(astronomyTargets instanceof Set)) throw new TypeError('MY_SKY_ASTRONOMY_TARGET_SET_REQUIRED');
  cosmic3d._mySkyControllerInstalled = true;

  const baseMakeSolarSystem = cosmic3d.makeSolarSystem;
  const baseEnsureMajorEphemeris = cosmic3d.ensureMajorEphemeris;
  const baseRender = cosmic3d.render;
  const baseCloseBody = cosmic3d.closeBody;
  const baseSelectBody = cosmic3d.selectBody;
  const baseUseAstronomyLocation = cosmic3d.useAstronomyLocation;
  const baseUpdateHud = cosmic3d.updateHud;
  const baseUpdateLabels = cosmic3d.updateLabels;

  cosmic3d.ensureMySkyUi = function ensureMySkyUi() {
    if (!this.root) return null;
    if (!document.getElementById('aetherusMySkyStyle')) {
      const style = document.createElement('link');
      style.id = 'aetherusMySkyStyle';
      style.rel = 'stylesheet';
      style.href = '/css/aetherus-my-sky.css?v=20260820-sky1';
      document.head.append(style);
    }

    let info = document.getElementById('cosmicMySkyInfo');
    if (!info) {
      info = document.createElement('aside');
      info.id = 'cosmicMySkyInfo';
      info.className = 'cosmic-my-sky-info';
      info.hidden = true;
      info.setAttribute('aria-live', 'polite');
      info.setAttribute('aria-labelledby', 'cosmicMySkyTitle');
      info.innerHTML = `
        <button id="cosmicMySkyBack" type="button"></button>
        <p id="cosmicMySkyKind"></p>
        <h2 id="cosmicMySkyTitle"></h2>
        <p id="cosmicMySkyDirection"></p>
        <p id="cosmicMySkyStatus"></p>
        <p id="cosmicMySkyLimit"></p>
        <button id="cosmicMySkyTake" class="cosmic-my-sky-take" type="button">TAKE ME THERE →</button>`;
      this.root.append(info);
    }

    if (!this._mySkyUiBound) {
      document.getElementById('cosmicMySkyBack')?.addEventListener('click', () => this.closeMySky());
      document.getElementById('cosmicMySkyTake')?.addEventListener('click', () => this.takeMeThereFromMySky());
      this._mySkyUiBound = true;
    }
    return info;
  };

  cosmic3d.makeMySkyJourneyScene = function makeMySkyJourneyScene() {
    if (this.mySkyGroup || !this.THREE || !this.world) return;
    const T = this.THREE;
    const radius = 72;
    this.mySkyGroup = new T.Group();
    this.mySkyGroup.visible = false;
    this.mySkyGroup.userData.coordinateFrame = MY_SKY_RENDER_FRAME;

    const horizonPoints = Array.from({ length: 129 }, (_, index) => {
      const angle = index / 128 * Math.PI * 2;
      return new T.Vector3(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
    });
    this.mySkyHorizon = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(horizonPoints),
      new T.LineBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .32, depthWrite: false }),
    );
    this.mySkyHorizon.userData.coordinateFrame = MY_SKY_RENDER_FRAME;
    this.mySkyGroup.add(this.mySkyHorizon);

    const verticalPoints = Array.from({ length: 65 }, (_, index) => {
      const angle = -Math.PI / 2 + index / 64 * Math.PI;
      return new T.Vector3(0, Math.sin(angle) * radius, -Math.cos(angle) * radius);
    });
    this.mySkyMeridian = new T.Line(
      new T.BufferGeometry().setFromPoints(verticalPoints),
      new T.LineBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .12, depthWrite: false }),
    );
    this.mySkyGroup.add(this.mySkyMeridian);

    this._mySkyAnchors = new Map();
    for (const id of ['N', 'E', 'S', 'W', 'Z']) {
      const direction = mySkyCardinalDirection(id);
      const anchor = new T.Object3D();
      anchor.position.set(direction.x * radius, direction.y * radius, direction.z * radius);
      this.mySkyGroup.add(anchor);
      this._mySkyAnchors.set(id, anchor);
    }

    this.mySkyTarget = new T.Mesh(
      new T.SphereGeometry(.72, 18, 12),
      new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .98, depthWrite: false }),
    );
    this.mySkyTarget.userData.coordinateFrame = MY_SKY_RENDER_FRAME;
    this.mySkyGroup.add(this.mySkyTarget);
    this.mySkyTargetGlow = new T.Sprite(new T.SpriteMaterial({
      map: this.spriteTexture,
      color: 0x83e0f2,
      transparent: true,
      opacity: .78,
      blending: T.AdditiveBlending,
      depthWrite: false,
    }));
    this.mySkyTargetGlow.scale.set(8, 8, 1);
    this.mySkyGroup.add(this.mySkyTargetGlow);
    this.world.add(this.mySkyGroup);
    this.ensureMySkyUi();

    if (!this._mySkyInputBound) {
      this.root.addEventListener('wheel', event => {
        if (!this._mySkyMode) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this._mySkyFov = clamp((this._mySkyFov || 60) + Math.sign(event.deltaY) * 3, 38, 80);
        this.render();
      }, { passive: false, capture: true });

      this.canvas.addEventListener('keydown', event => {
        if (!this._mySkyMode) return;
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopImmediatePropagation(); this.closeMySky(); return;
        }
        if (event.key === '+' || event.key === '=') {
          event.preventDefault(); event.stopImmediatePropagation();
          this._mySkyFov = clamp((this._mySkyFov || 60) - 3, 38, 80); this.render(); return;
        }
        if (event.key === '-' || event.key === '_') {
          event.preventDefault(); event.stopImmediatePropagation();
          this._mySkyFov = clamp((this._mySkyFov || 60) + 3, 38, 80); this.render();
        }
      }, { capture: true });

      this.canvas.addEventListener('dblclick', event => {
        if (!this._mySkyMode) return;
        event.preventDefault(); event.stopImmediatePropagation(); this.centerMySkyTarget();
      }, { capture: true });
      this._mySkyInputBound = true;
    }
  };

  cosmic3d.updateMySkyTarget = function updateMySkyTarget({ center = false } = {}) {
    const observation = this._astronomyObservation;
    if (!observation || !this.mySkyTarget || !this.THREE) return false;
    const direction = horizontalToMySkyDirection(observation.coordinates.horizontal);
    this._mySkyTargetDirection = direction;
    const radius = 68;
    this.mySkyTarget.position.set(direction.x * radius, direction.y * radius, direction.z * radius);
    this.mySkyTargetGlow.position.copy(this.mySkyTarget.position);
    const targetColor = TARGET_COLORS[observation.target] || 0xffffff;
    this.mySkyTarget.material.color.setHex(targetColor);
    this.mySkyTargetGlow.material.color.setHex(targetColor);
    if (center) {
      const view = cameraYawPitchForDirection(direction);
      this.yaw = view.yaw;
      this.pitch = view.pitch;
    }
    if (location.hash === '#dev' && this.canvas) {
      this.canvas.dataset.mySkyTarget = observation.target;
      this.canvas.dataset.mySkyFrame = MY_SKY_RENDER_FRAME;
      this.canvas.dataset.mySkyAzimuth = observation.coordinates.horizontal.azimuthDeg.toFixed(6);
      this.canvas.dataset.mySkyAltitude = observation.coordinates.horizontal.altitudeDeg.toFixed(6);
    }
    return true;
  };

  cosmic3d.centerMySkyTarget = function centerMySkyTarget() {
    if (!this._mySkyTargetDirection) return false;
    const view = cameraYawPitchForDirection(this._mySkyTargetDirection);
    this.yaw = view.yaw;
    this.pitch = view.pitch;
    this.render();
    return true;
  };

  cosmic3d.showMySkyInfo = function showMySkyInfo() {
    const info = document.getElementById('cosmicMySkyInfo');
    const observation = this._astronomyObservation;
    if (!info || !observation || !this._detailBody) return;
    const isKo = ko();
    const horizontal = observation.coordinates.horizontal;
    const bodyName = this._detailBody.name?.[isKo ? 'ko' : 'en'] || this._detailBody.id.toUpperCase();
    const provider = observation.precision?.providerTier === 'jpl-horizons-geometric-vectors'
      ? 'JPL HORIZONS' : 'JPL TABLE 1';
    document.getElementById('cosmicMySkyKind').textContent = isKo
      ? `MY SKY · ${provider} · 기하 좌표`
      : `MY SKY · ${provider} · geometric coordinates`;
    document.getElementById('cosmicMySkyTitle').textContent = bodyName;
    document.getElementById('cosmicMySkyDirection').textContent = isKo
      ? `방위 ${horizontal.azimuthDeg.toFixed(1)}° · 고도 ${horizontal.altitudeDeg >= 0 ? '+' : ''}${horizontal.altitudeDeg.toFixed(1)}°`
      : `Az ${horizontal.azimuthDeg.toFixed(1)}° · Alt ${horizontal.altitudeDeg >= 0 ? '+' : ''}${horizontal.altitudeDeg.toFixed(1)}°`;
    document.getElementById('cosmicMySkyStatus').textContent = observation.horizon === 'above'
      ? (isKo ? '현재 기하학적 지평선 위' : 'Above the geometric horizon now')
      : (isKo ? '현재 기하학적 지평선 아래' : 'Below the geometric horizon now');
    document.getElementById('cosmicMySkyLimit').textContent = isKo
      ? '내 위치 + 현재 UTC · N/E/S/W는 관측자 로컬 좌표 · 별 배경 미표시 · 대기굴절·건물·산·날씨 미포함'
      : 'Device location + current UTC · N/E/S/W use the observer local frame · no star-field claim · refraction, buildings, terrain and weather excluded';
    document.getElementById('cosmicMySkyBack').textContent = isKo ? '← 천체 정보' : '← Target info';
    document.getElementById('cosmicMySkyTake').textContent = 'TAKE ME THERE →';
    info.hidden = false;
  };

  cosmic3d.openMySky = function openMySky() {
    if (!this._astronomyObservation || !astronomyTargets.has(this._detailBody?.id)) return false;
    this.ensureMySkyUi();
    this.makeMySkyJourneyScene();
    this.cancelMySkyArrival?.();
    if (!this._mySkyMode) {
      this._mySkyReturnView = { yaw: this.yaw, pitch: this.pitch, bodyDistance: this._bodyDistance };
    }
    this._mySkyMode = true;
    this._mySkyFov = 60;
    this.root.classList.add('is-my-sky');
    this.bodyInfo.hidden = true;
    this.mySkyGroup.visible = true;
    if (this.background) this.background.visible = false;
    this.updateMySkyTarget({ center: true });
    this.showMySkyInfo();
    this.updateHud();
    this.updateLabels();
    this.render();
    return true;
  };

  cosmic3d.closeMySky = function closeMySky({ render = true, restoreView = true } = {}) {
    if (!this._mySkyMode) return;
    this._mySkyMode = false;
    this.root?.classList.remove('is-my-sky');
    if (this.mySkyGroup) this.mySkyGroup.visible = false;
    if (this.background) this.background.visible = true;
    const info = document.getElementById('cosmicMySkyInfo');
    if (info) info.hidden = true;
    if (this._detailBody && this.bodyInfo) this.bodyInfo.hidden = false;
    if (restoreView && this._mySkyReturnView) {
      this.yaw = this._mySkyReturnView.yaw;
      this.pitch = this._mySkyReturnView.pitch;
      this._bodyDistance = this._mySkyReturnView.bodyDistance;
    }
    if (render) { this.updateHud(); this.updateLabels(); this.render(); }
  };

  cosmic3d.cancelMySkyArrival = function cancelMySkyArrival() {
    if (this._mySkyArrivalFrame) cancelAnimationFrame(this._mySkyArrivalFrame);
    this._mySkyArrivalFrame = 0;
  };

  cosmic3d.takeMeThereFromMySky = function takeMeThereFromMySky() {
    if (!this._mySkyMode || !this._detailBody) return false;
    this.cancelMySkyArrival();
    const returnView = this._mySkyReturnView || { yaw: .72, pitch: .38, bodyDistance: this._bodyDistance || 48 };
    this.closeMySky({ render: false, restoreView: false });
    this.yaw = returnView.yaw;
    this.pitch = returnView.pitch;
    const endDistance = returnView.bodyDistance || 48;
    const startDistance = Math.min(150, Math.max(endDistance + 38, endDistance * 1.9));
    this._bodyDistance = startDistance;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._bodyDistance = endDistance;
      this.render();
      return true;
    }
    const started = performance.now();
    let lastDraw = started - 34;
    const step = now => {
      const progress = clamp((now - started) / 950, 0, 1);
      if (progress < 1 && now - lastDraw < 33) {
        this._mySkyArrivalFrame = requestAnimationFrame(step);
        return;
      }
      lastDraw = now;
      const eased = 1 - (1 - progress) ** 3;
      this._bodyDistance = mix(startDistance, endDistance, eased);
      this.render();
      if (progress >= 1) { this._mySkyArrivalFrame = 0; return; }
      this._mySkyArrivalFrame = requestAnimationFrame(step);
    };
    this._mySkyArrivalFrame = requestAnimationFrame(step);
    return true;
  };

  cosmic3d.render = function renderWithMySky() {
    if (!this._mySkyMode) return baseRender.call(this);
    if (!this._ready || this.root?.hidden || !this.THREE || !this.mySkyGroup) return;
    this._renderCount += 1;
    this.resize();
    const T = this.THREE;
    this.setDashboardObjectVisibility?.(false);
    if (this.solarGroup) this.solarGroup.visible = false;
    if (this.galaxyGroup) this.galaxyGroup.visible = false;
    if (this.clusterGroup) this.clusterGroup.visible = false;
    if (this.bodyDetailGroup) this.bodyDetailGroup.visible = false;
    if (this.solarMotionGroup) this.solarMotionGroup.visible = false;
    if (this.photoGroup) this.photoGroup.visible = false;
    if (this.galaxyGuideGroup) this.galaxyGuideGroup.visible = false;
    if (this.background) this.background.visible = false;
    this.mySkyGroup.visible = true;

    const fov = this._mySkyFov || 60;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const cosPitch = Math.cos(this.pitch);
    const direction = new T.Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    );
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(direction.multiplyScalar(10));
    this.ambientLight.intensity = .46;
    this.renderer.render(this.world, this.camera);
    this.updateHud();
    this.updateLabels();
    this.updateBodyPicker();
    this.updateCraftPicker();
    this.updateMotionControl();
  };

  cosmic3d.updateHud = function updateHudWithMySky() {
    if (!this._mySkyMode || !this._astronomyObservation || !this._detailBody) {
      return baseUpdateHud.call(this);
    }
    const isKo = ko();
    const horizontal = this._astronomyObservation.coordinates.horizontal;
    const bodyName = this._detailBody.name?.[isKo ? 'ko' : 'en'] || this._detailBody.id.toUpperCase();
    document.getElementById('cosmicStage').textContent = `MY SKY · ${bodyName}`;
    document.getElementById('cosmicScale').textContent = isKo
      ? `내 위치 · UTC ${this._astronomyObservation.time.utc} · 방위 ${horizontal.azimuthDeg.toFixed(1)}° · 고도 ${horizontal.altitudeDeg.toFixed(1)}°`
      : `My location · UTC ${this._astronomyObservation.time.utc} · az ${horizontal.azimuthDeg.toFixed(1)}° · alt ${horizontal.altitudeDeg.toFixed(1)}°`;
    document.getElementById('cosmicHint').textContent = isKo
      ? '드래그해 방향을 둘러보거나 TAKE ME THERE로 천체 공간으로 이동하세요'
      : 'Drag around the direction sphere or use TAKE ME THERE to move into the target world';
    document.getElementById('cosmicNote').textContent = isKo
      ? '관측자 로컬 ENU 방향 · 실제 위치/시각 계산 · 별 배경 미표시 · 대기굴절·지형·날씨 미포함'
      : 'Observer-local ENU direction · calculated position/time · no star-field claim, refraction, terrain or weather';
    this.root.dataset.stage = 'my-sky';
  };

  cosmic3d.updateLabels = function updateLabelsWithMySky() {
    if (!this._mySkyMode) return baseUpdateLabels.call(this);
    this.labels?.querySelectorAll('[data-cosmic-label]').forEach(label => { label.hidden = true; });
    const labels = { N: 'N', E: 'E', S: 'S', W: 'W', Z: ko() ? '천정' : 'Zenith' };
    this._mySkyAnchors?.forEach((anchor, id) => this.placeLabel(`my-sky-${id}`, anchor, labels[id]));
    const name = this._detailBody?.name?.[ko() ? 'ko' : 'en'] || this._detailBody?.id?.toUpperCase();
    this.placeLabel('my-sky-target', this.mySkyTarget, name || 'TARGET', 10, -14);
  };

  cosmic3d.makeSolarSystem = function makeSolarSystemWithMySky() {
    baseMakeSolarSystem.call(this);
    this.makeMySkyJourneyScene();
  };

  cosmic3d.ensureMajorEphemeris = function ensureMajorEphemerisWithMySky(options = {}) {
    const result = baseEnsureMajorEphemeris.call(this, options);
    return Promise.resolve(result).then(catalog => {
      if (this._mySkyMode && this._astronomyObservation) {
        this.updateMySkyTarget({ center: false });
        this.showMySkyInfo();
        this.render();
      }
      return catalog;
    });
  };

  cosmic3d.useAstronomyLocation = async function useAstronomyLocationAndOpenMySky() {
    await baseUseAstronomyLocation.call(this);
    if (this._astronomyObservation?.observer?.source === 'device') this.openMySky();
  };

  cosmic3d.closeBody = function closeBodyWithMySky(render = true) {
    if (this._mySkyMode) this.closeMySky({ render: false, restoreView: false });
    this.cancelMySkyArrival?.();
    return baseCloseBody.call(this, render);
  };

  cosmic3d.selectBody = async function selectBodyWithMySky(id) {
    if (this._mySkyMode) this.closeMySky({ render: false, restoreView: false });
    return baseSelectBody.call(this, id);
  };

  return cosmic3d;
}
