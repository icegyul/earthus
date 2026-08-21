// Aetherus canonical-coordinate adapter.
//
// 기존 3D UX 전체를 한 번에 다시 쓰지 않고 안정적으로 보존하면서, 좌표가 물리 계산과
// 화면 연출 사이에서 뒤집히거나 임의 축으로 바뀌던 핵심 경로부터 교체한다.
// 원래 장면 구현은 cosmic3d-legacy.js에 동일 blob으로 보존한다.

import { cosmic3d } from './cosmic3d-legacy.js';
import { planetOrbit } from './kepler.js';
import {
  eclipticToGalactic,
  icrfToGalactic,
  toAetherusRender,
} from './coordinates.js';
import {
  ASTRONOMY_TARGETS,
  calculateMajorBodyObservation,
  calculateMajorBodyObservationFromGeocentricIcrf,
} from './astronomy.js';
import {
  createMajorEphemerisService,
  HORIZONS_PROVIDER_ID,
} from './ephemeris-provider.js';
import {
  buildSolarMotionModel,
  solarMotionSample,
} from './solar-motion-engine.js';
import {
  solarOrbitDisplayRadius,
} from './scale-bridge.js';
import { installMySkyController } from './my-sky-controller.js';

const IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const MOTION_BODY = Object.freeze({
  mercury: Object.freeze({ color: 0xaaa7a0, radius: .38 }),
  venus: Object.freeze({ color: 0xd7b575, radius: .52 }),
  earth: Object.freeze({ color: 0x62b7da, radius: .56 }),
  mars: Object.freeze({ color: 0xc86d50, radius: .44 }),
  jupiter: Object.freeze({ color: 0xd0a27b, radius: 1.15 }),
  saturn: Object.freeze({ color: 0xd7c28a, radius: 1.02 }),
  uranus: Object.freeze({ color: 0x86d1d5, radius: .78 }),
  neptune: Object.freeze({ color: 0x557bd5, radius: .75 }),
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const smoothStep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const roundedNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);
const ko = () => document.documentElement.lang !== 'en';
const majorEphemeris = createMajorEphemerisService();
const astronomyTargets = new Set(ASTRONOMY_TARGETS);

const legacyMakeSolarSystem = cosmic3d.makeSolarSystem;
const legacyActivate = cosmic3d.activate;
const legacyOpenSolarMotion = cosmic3d.openSolarMotion;
const legacyShowSolarMotionInfo = cosmic3d.showSolarMotionInfo;
const legacyUpdateHud = cosmic3d.updateHud;
const legacyUpdateLabels = cosmic3d.updateLabels;

function threeVector(T, value) {
  return new T.Vector3(value.x, value.y, value.z);
}

function radialGalacticRender(point) {
  const radius = Math.hypot(point.x, point.y, point.z);
  if (!(radius > 0)) return { x: 0, y: 0, z: 0 };
  const scale = solarOrbitDisplayRadius(radius) / radius;
  return toAetherusRender({ x: point.x * scale, y: point.y * scale, z: point.z * scale });
}

function solarRenderPointFromEcliptic(point) {
  return radialGalacticRender(eclipticToGalactic(point));
}

function solarRenderPointFromIcrf(point) {
  return radialGalacticRender(icrfToGalactic(point));
}

function setLineGeometry(T, line, points) {
  if (!line) return;
  line.geometry?.dispose?.();
  line.geometry = new T.BufferGeometry().setFromPoints(points);
}

cosmic3d.coordinateEclipticNormalRender = function coordinateEclipticNormalRender() {
  const value = toAetherusRender(eclipticToGalactic({ x: 0, y: 0, z: 1 }));
  return new this.THREE.Vector3(value.x, value.y, value.z).normalize();
};

cosmic3d.coordinateEclipticVectorToRender = function coordinateEclipticVectorToRender(values) {
  const point = Array.isArray(values)
    ? { x: Number(values[0]), y: Number(values[1]), z: Number(values[2]) }
    : values;
  const value = toAetherusRender(eclipticToGalactic(point));
  return new this.THREE.Vector3(value.x, value.y, value.z);
};

cosmic3d.ephemerisStatus = function ephemerisStatus() {
  return majorEphemeris.status();
};

cosmic3d.ensureMajorEphemeris = function ensureMajorEphemeris({ refresh = false } = {}) {
  if (this._majorEphemerisPromise && !refresh) return this._majorEphemerisPromise;
  this._majorEphemerisPromise = majorEphemeris.preload({ refresh }).then(catalog => {
    if (!catalog || !this._ready) return catalog;
    const at = roundedNow();
    this.refreshSolarSystemAt(at, false);
    if (this._motionCatalog) this.buildSolarMotion();
    if (astronomyTargets.has(this._detailBody?.id)) {
      this.calculateAstronomy();
      this.showAstronomy(this._detailBody);
    }
    if (location.hash === '#dev' && this.canvas) {
      const status = majorEphemeris.status();
      this.canvas.dataset.ephemerisProvider = status.providerId;
      this.canvas.dataset.ephemerisGeneratedAt = status.generatedAt || '';
      this.canvas.dataset.ephemerisCoverage = status.coverage
        ? `${status.coverage.startAt}/${status.coverage.endAt}` : '';
    }
    this.render();
    return catalog;
  }).finally(() => {
    this._majorEphemerisPromise = null;
  });
  return this._majorEphemerisPromise;
};

// 실제 행성 좌표는 물리 프레임 그대로 유지하고, 마지막 순간에만 Three.js y-up으로 바꾼다.
// 기존 구현의 (x,z,y)는 반사(det=-1)를 만들어 태양계의 손잡이를 뒤집었다. 정본 변환은
// coordinates.js의 (x,z,-y)이며, 시각 반지름 압축도 그 전에 radial 단계로만 적용한다.
// Horizons cache가 준비되면 현재 위치는 @0 barycentric state에서 Sun을 뺀 실제 ICRF vector를
// Galactic ICRS world frame으로 회전해 표시한다. 없거나 coverage 밖이면 Table 1 fallback으로 내려간다.
cosmic3d.refreshSolarSystemAt = function refreshSolarSystemAt(at = roundedNow(), render = false) {
  if (!this.THREE || !this.solarGroup || !this.planetMeshes) return false;
  const T = this.THREE;
  const date = at instanceof Date ? new Date(at.getTime()) : new Date(at);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_SOLAR_EPOCH_REQUIRED');

  IDS.forEach((id, index) => {
    const state = majorEphemeris.heliocentricIcrfState(id, date);
    const point = state.position;
    const rendered = solarRenderPointFromIcrf(point);
    const mesh = this.planetMeshes[id];
    if (mesh) {
      mesh.position.set(rendered.x, rendered.y, rendered.z);
      mesh.userData.physicalFrame = state.orientation;
      mesh.userData.physicalOrigin = state.origin;
      mesh.userData.worldFrame = 'galactic-icrs';
      mesh.userData.ephemerisAt = state.at;
      mesh.userData.ephemerisProvider = state.provider;
      mesh.userData.ephemerisFallbackReason = state.fallbackReason || null;
    }

    // 전체 궤도선은 현재 위치 provider와 별개다. JPL Table 1의 osculating shape를
    // 읽기 쉬운 guide로 유지하고, 현재 천체 점만 Horizons state로 정확도를 올린다.
    const orbit = planetOrbit(id, date, 150)
      .map(sample => threeVector(T, solarRenderPointFromEcliptic(sample)));
    setLineGeometry(T, this.orbitLines?.[index], orbit);
  });

  this.earthMesh = this.planetMeshes.earth;
  if (this.moonGroup && this.earthMesh) this.moonGroup.position.copy(this.earthMesh.position);
  this._solarEpochAt = date.toISOString();
  if (location.hash === '#dev' && this.canvas) {
    this.canvas.dataset.solarEpoch = this._solarEpochAt;
    this.canvas.dataset.solarPhysicalFrame = 'heliocentric-icrf-j2000';
    this.canvas.dataset.solarWorldFrame = 'galactic-icrs';
    this.canvas.dataset.solarRenderFrame = 'aetherus-right-handed-y-up';
    this.canvas.dataset.ephemerisProvider = majorEphemeris.providerId;
  }
  if (render) this.render();
  return true;
};

cosmic3d.makeSolarSystem = function makeSolarSystemCanonical() {
  legacyMakeSolarSystem.call(this);
  this.refreshSolarSystemAt(roundedNow(), false);
};

// 장면에 다시 들어올 때마다 현재 UTC로 위치를 갱신한다. 첫 프레임은 로컬 Table 1로 즉시
// 열고, Horizons cache는 뒤에서 한 번만 읽어 같은 장면을 업그레이드한다. 네트워크 때문에
// 우주 진입을 막거나 무한 rAF를 돌리지 않는다.
cosmic3d.activate = async function activateCanonical(stage) {
  const result = await legacyActivate.call(this, stage);
  if (!this._ready) return result;
  this.refreshSolarSystemAt(roundedNow(), false);
  if (this._craftCatalog) this.buildSpacecraft();
  if (this._motionCatalog) this.buildSolarMotion();
  this.render();
  void this.ensureMajorEphemeris();
  return result;
};

// 태양계 전진 장면은 Galactocentric solar velocity 3-vector와 SSB bridge를 쓴다.
// Horizons cache가 있으면 @0 Sun state로 SSB를 복원하고 행성도 같은 barycentric frame에서
// 가져온다. 없으면 Table 1 planet position만 fallback하고 은하 운동 방향은 그대로 유지한다.
cosmic3d.buildSolarMotion = function buildSolarMotionCanonical() {
  if (!this._motionCatalog || !this.solarMotionGroup || !this.THREE) return;
  this.clearSolarMotion();
  const T = this.THREE;
  const model = buildSolarMotionModel({
    endAt: roundedNow(),
    spanDays: Number(this._motionCatalog.displaySpanDays) || 365.25,
    ephemerisProvider: majorEphemeris,
  });
  this._solarMotionModel = model;
  this._motionSunPoints = model.samples.map(sample => threeVector(T, sample.sunRender));

  const direction = threeVector(T, model.direction.render).normalize();
  const firstSun = this._motionSunPoints[0];
  const lastSun = this._motionSunPoints[this._motionSunPoints.length - 1];
  const linePoints = [
    firstSun.clone().addScaledVector(direction, -5),
    lastSun.clone().addScaledVector(direction, 5),
  ];
  const directionLine = new T.Line(
    new T.BufferGeometry().setFromPoints(linePoints),
    new T.LineDashedMaterial({
      color: 0x83e0f2,
      transparent: true,
      opacity: .32,
      dashSize: 1.5,
      gapSize: .9,
      depthWrite: false,
    }),
  );
  directionLine.computeLineDistances();
  directionLine.userData.coordinateFrame = model.direction.frame;
  directionLine.userData.directionModel = model.direction.model;
  this.solarMotionGroup.add(directionLine);
  this._motionDirectionLine = directionLine;

  const directionMarker = new T.Mesh(
    new T.ConeGeometry(.72, 2.4, 16),
    new T.MeshBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .72 }),
  );
  directionMarker.position.copy(lastSun).addScaledVector(direction, 5);
  directionMarker.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
  directionMarker.userData.coordinateFrame = model.direction.frame;
  this.solarMotionGroup.add(directionMarker);
  this.motionDirectionMarker = directionMarker;

  IDS.forEach(id => {
    const meta = MOTION_BODY[id];
    const points = model.samples.map(sample => threeVector(T, sample.planets[id].render));
    const geometry = new T.BufferGeometry().setFromPoints(points);
    geometry.setDrawRange(0, 2);
    const line = new T.Line(geometry, new T.LineBasicMaterial({
      color: meta.color,
      transparent: true,
      opacity: id === 'earth' ? .94 : .66,
      depthWrite: false,
    }));
    line.userData.coordinateFrame = model.direction.frame;
    line.userData.displayScale = 'orbit-radial-log-compressed';
    this.solarMotionGroup.add(line);

    const radius = clamp(meta.radius * .5, .22, .62);
    const planet = new T.Mesh(
      new T.SphereGeometry(radius, 14, 10),
      new T.MeshBasicMaterial({ color: meta.color }),
    );
    planet.position.copy(points[0]);
    planet.userData.motionBody = id;
    planet.userData.ephemerisProvider = model.samples[0].planets[id].provider;
    this.solarMotionGroup.add(planet);
    this._motionPaths.set(id, { points, line });
    this._motionPlanetMeshes.set(id, planet);
  });

  this.motionSun = new T.Mesh(
    new T.SphereGeometry(1.15, 20, 14),
    new T.MeshBasicMaterial({ color: 0xffca55 }),
  );
  this.motionSun.position.copy(firstSun);
  this.motionSun.userData.directionModel = model.direction.model;
  this.solarMotionGroup.add(this.motionSun);

  this.motionSunGlow = new T.Sprite(new T.SpriteMaterial({
    map: this.spriteTexture,
    color: 0xffb83d,
    transparent: true,
    opacity: .72,
    blending: T.AdditiveBlending,
    depthWrite: false,
  }));
  this.motionSunGlow.scale.set(8, 8, 1);
  this.motionSunGlow.position.copy(this.motionSun.position);
  this.solarMotionGroup.add(this.motionSunGlow);

  if (location.hash === '#dev' && this.canvas) {
    this.canvas.dataset.motionPhysicalFrame = 'heliocentric-icrf-j2000';
    this.canvas.dataset.motionGalacticFrame = model.direction.frame;
    this.canvas.dataset.motionDirectionModel = model.direction.model;
    this.canvas.dataset.motionStartAt = model.startAt;
    this.canvas.dataset.motionEndAt = model.endAt;
    this.canvas.dataset.motionEphemerisProviders = model.ephemerisProviders.join(',');
    this.canvas.dataset.motionSsbBridge = model.samples.at(-1)?.ssbBridge || '';
  }
  this.setSolarMotionProgress(0, false);
};

function restoreMotionSceneVisibility(instance) {
  instance._motionPaths.forEach((entry, id) => {
    entry.line.visible = true;
    entry.line.material.opacity = id === 'earth' ? .94 : .66;
    instance._motionPlanetMeshes.get(id).visible = true;
  });
  if (instance.motionSun) instance.motionSun.visible = true;
  if (instance.motionSunGlow) instance.motionSunGlow.visible = true;
  if (instance.motionDirectionMarker) {
    instance.motionDirectionMarker.visible = true;
    instance.motionDirectionMarker.material.opacity = .72;
  }
  if (instance._motionDirectionLine) {
    instance._motionDirectionLine.visible = true;
    instance._motionDirectionLine.material.opacity = .32;
  }
}

// 일반 Solar → Milky Way 줌에서 별도 모드 버튼을 누르지 않아도 지난 1년의 물리 방향 trail을
// 자연스럽게 드러낸다. 현재 sample의 Sun을 SolarSystem 원점에 맞추므로 trail 끝과 현재 행성 점이
// 같은 좌표에 포개지고, reframe/scale은 태양계와 함께 움직여 결국 Milky Way marker로 수렴한다.
cosmic3d.applyCoordinateJourneyOverlay = function applyCoordinateJourneyOverlay({ level, solarScale }) {
  if (!this._solarMotionModel || !this.solarMotionGroup || this._solarMotionMode) return;
  const reveal = smoothStep(.70, .94, level);
  const fade = 1 - smoothStep(1.34, 1.62, level);
  const opacity = reveal * fade;
  if (opacity <= .002) {
    this.solarMotionGroup.visible = false;
    this._coordinateJourneyState = null;
    return;
  }

  const T = this.THREE;
  const model = this._solarMotionModel;
  const lastIndex = model.samples.length - 1;
  const currentSun = this._motionSunPoints[lastIndex];
  this.solarMotionGroup.visible = true;
  this.solarMotionGroup.scale.setScalar(solarScale);
  this.solarMotionGroup.position.copy(this.solarGroup.position)
    .sub(new T.Vector3().copy(currentSun).multiplyScalar(solarScale));

  this._motionPaths.forEach((entry, id) => {
    entry.line.visible = true;
    entry.line.geometry.setDrawRange(0, model.samples.length);
    entry.line.material.opacity = (id === 'earth' ? .82 : .46) * opacity;
    const mesh = this._motionPlanetMeshes.get(id);
    if (mesh) mesh.visible = false;
  });
  if (this.motionSun) this.motionSun.visible = false;
  if (this.motionSunGlow) this.motionSunGlow.visible = false;
  if (this._motionDirectionLine) {
    this._motionDirectionLine.visible = opacity > .12;
    this._motionDirectionLine.material.opacity = .22 * opacity;
  }
  if (this.motionDirectionMarker) {
    this.motionDirectionMarker.visible = opacity > .28;
    this.motionDirectionMarker.material.opacity = .52 * opacity;
  }
  this._coordinateJourneyState = opacity > .16 ? 'motion-reveal' : null;
  if (location.hash === '#dev' && this.canvas) {
    this.canvas.dataset.coordinateJourney = this._coordinateJourneyState || 'solar';
    this.canvas.dataset.coordinateJourneyOpacity = opacity.toFixed(3);
  }
};

cosmic3d.setSolarMotionProgress = function setSolarMotionProgressCanonical(value, updateScreen = true) {
  const model = this._solarMotionModel;
  if (!this._motionCatalog || !this.motionSun || !model) return;
  const { index, sample, progress } = solarMotionSample(model, value);
  this._motionProgress = progress;
  const sunPoint = this._motionSunPoints[index];
  this.motionSun.position.copy(sunPoint);
  this.motionSunGlow.position.copy(sunPoint);

  this._motionPaths.forEach((entry, id) => {
    entry.line.geometry.setDrawRange(0, Math.max(2, index + 1));
    this._motionPlanetMeshes.get(id)?.position.copy(entry.points[index]);
  });

  const elapsedDays = Math.round(model.spanDays * progress);
  const distance = model.physicalTravelDistanceAu * progress;
  const utc = sample.at.replace('T', ' ').replace('.000Z', 'Z');
  const status = document.getElementById('cosmicMotionDistance');
  if (status) status.textContent = ko()
    ? `${utc} · 지난 ${elapsedDays}일 · 태양계 진행 약 ${distance.toFixed(1)} AU`
    : `${utc} · ${elapsedDays} days into trail · Solar System travels about ${distance.toFixed(1)} AU`;
  const bar = document.getElementById('cosmicMotionProgress');
  if (bar) bar.style.transform = `scaleX(${progress})`;
  if (location.hash === '#dev' && this.canvas) {
    this.canvas.dataset.motionUtc = sample.at;
    this.canvas.dataset.motionEphemerisProvider = sample.ephemerisProvider;
    this.canvas.dataset.motionSsbBridge = sample.ssbBridge;
  }
  if (updateScreen) this.render();
};

// Galactic velocity를 화면 축에 돌려 맞추지 않는다. 카메라만 옆으로 이동한다.
cosmic3d.openSolarMotion = async function openSolarMotionCanonical() {
  restoreMotionSceneVisibility(this);
  const result = await legacyOpenSolarMotion.call(this);
  if (this._solarMotionMode) {
    this.yaw = Math.PI / 2;
    this.pitch = .26;
    this.render();
  }
  return result;
};

cosmic3d.updateHud = function updateHudCanonical() {
  legacyUpdateHud.call(this);
  const blocked = this._solarMotionMode || this._detailBody || this._photoMode
    || this._selectedCraft || this._galaxyGuideMode || this._dashboardOpen;
  if (blocked) return;
  const isKo = ko();

  if (this._coordinateJourneyState === 'motion-reveal') {
    const model = this._solarMotionModel;
    if (!model) return;
    const horizons = model.ephemerisProviders.includes(HORIZONS_PROVIDER_ID);
    const liveUtc = model.endAt.replace('T', ' ').replace('.000Z', 'Z');
    document.getElementById('cosmicStage').textContent = isKo
      ? '태양계의 은하 이동' : 'Solar System through the Galaxy';
    document.getElementById('cosmicScale').textContent = isKo
      ? `LIVE ${liveUtc} · 현재 태양계 + 지난 1년 · SSB → Galactic`
      : `LIVE ${liveUtc} · current Solar System + past year · SSB → Galactic`;
    document.getElementById('cosmicHint').textContent = isKo
      ? '계속 줌아웃하면 이 궤적이 우리은하 속 태양계 위치로 이어집니다'
      : 'Keep zooming out and this trail resolves into the Solar System’s place in the Milky Way';
    document.getElementById('cosmicNote').textContent = isKo
      ? `${horizons ? 'JPL Horizons 상태벡터' : 'JPL Table 1 위치 fallback'} · 실제 방향 관계 보존 · 이동거리·궤도·천체 크기는 시각 확대`
      : `${horizons ? 'JPL Horizons state vectors' : 'JPL Table 1 position fallback'} · physical orientation preserved · travel, orbit and body sizes visually exaggerated`;
    this.root.dataset.stage = 'solar-motion-reveal';
    return;
  }

  // 평상시 태양계 화면도 NOW가 장식 애니메이션이 아니라 어떤 시각/공급자에서 온 점인지
  // 바로 알 수 있게 한다. 궤도선은 읽기용 Table 1 guide라 현재 점과 데이터 의미를 섞지 않는다.
  if (this.root.dataset.stage === 'solar' && this._solarEpochAt) {
    const status = majorEphemeris.status();
    const horizons = status.providerId === HORIZONS_PROVIDER_ID;
    const utc = this._solarEpochAt.replace('T', ' ').replace('.000Z', 'Z');
    document.getElementById('cosmicScale').textContent = isKo
      ? `LIVE ${utc} · ${horizons ? 'JPL Horizons' : 'JPL Table 1 fallback'} · Galactic world frame`
      : `LIVE ${utc} · ${horizons ? 'JPL Horizons' : 'JPL Table 1 fallback'} · Galactic world frame`;
    document.getElementById('cosmicNote').textContent = isKo
      ? '현재 행성 점은 현재 UTC 계산 · 전체 궤도선은 읽기용 Table 1 guide · 거리·천체 크기는 시각 스케일'
      : 'Current planet dots use the current UTC calculation · full orbit lines are Table 1 guides · distances and body sizes use visual scale';
  }
};

cosmic3d.updateLabels = function updateLabelsCanonical() {
  legacyUpdateLabels.call(this);
  if (this._coordinateJourneyState !== 'motion-reveal' || this._solarMotionMode
    || this._detailBody || this._photoMode || this._selectedCraft || this._galaxyGuideMode) return;
  const isKo = ko();
  this.placeLabel('journey-direction', this.motionDirectionMarker,
    isKo ? '태양계 진행 방향 · 지난 1년' : 'Solar System motion · past year', -132, -18);
};

cosmic3d.showSolarMotionInfo = function showSolarMotionInfoCanonical() {
  legacyShowSolarMotionInfo.call(this);
  const model = this._solarMotionModel;
  if (!model) return;
  const isKo = ko();
  const start = model.startAt.slice(0, 10);
  const end = model.endAt.replace('T', ' ').replace('.000Z', 'Z');
  const horizons = model.ephemerisProviders.includes(HORIZONS_PROVIDER_ID);
  const kind = document.getElementById('cosmicMotionKind');
  const title = document.getElementById('cosmicMotionTitle');
  const replay = document.getElementById('cosmicMotionReplay');
  const limit = document.getElementById('cosmicMotionLimit');
  if (kind) kind.textContent = isKo
    ? `LIVE 기준 · ${start} → ${end} · SSB → Galactocentric`
    : `LIVE window · ${start} → ${end} · SSB → Galactocentric`;
  if (title) title.textContent = isKo
    ? '움직이는 태양계 · 실제 좌표 방향'
    : 'Moving Solar System · physical coordinate orientation';
  if (replay) replay.textContent = isKo ? '지난 1년 다시 보기' : 'Replay the past year';
  if (limit) limit.textContent = isKo
    ? `${horizons ? 'JPL Horizons @0 ICRF 상태벡터' : 'JPL Table 1 위치 fallback'} · SSB/은하 방향 보존 · 이동거리·궤도·천체 크기는 보기 위해 각각 확대`
    : `${horizons ? 'JPL Horizons @0 ICRF state vectors' : 'JPL Table 1 position fallback'} · SSB/galactic orientation preserved · travel distance, orbit radii and body sizes independently exaggerated for display`;
  this.setSolarMotionProgress(this._motionProgress, false);
};

// 주요 행성 My Sky는 같은 observer/time 계약을 쓴다. Horizons cache가 있으면
// Earth-relative geometric ICRF state를 쓰고, 없거나 coverage 밖이면 Table 1로 내려간다.
// Moon은 아직 provider가 없으므로 지원 대상으로 꾸미지 않는다.
cosmic3d.calculateAstronomy = function calculateAstronomyCanonical() {
  const target = this._detailBody?.id;
  if (!astronomyTargets.has(target)) return null;
  try {
    const at = this._astronomyAt || roundedNow().toISOString();
    const state = majorEphemeris.geocentricIcrfState(target, at);
    this._astronomyObservation = state
      ? calculateMajorBodyObservationFromGeocentricIcrf({
        target,
        observer: this._astronomyObserver,
        at,
        geocentricIcrfAu: state.position,
        provider: state,
      })
      : calculateMajorBodyObservation({
        target,
        observer: this._astronomyObserver,
        at,
        precision: this._astronomyPrecision || 'explorer',
      });
    this._astronomyObserver = this._astronomyObservation.observer;
    this._astronomyAt = this._astronomyObservation.time.utc;
    this._astronomyPrecision = 'explorer';
    this._astronomyError = null;
    if (target === 'mars') this.updateObservationPlanFreshness();
    if (location.hash === '#dev' && this.canvas) {
      this.canvas.dataset.astronomyTarget = target;
      this.canvas.dataset.astronomyVectorProvider = state?.provider
        || this._astronomyObservation.precision.providerTier;
      this.canvas.dataset.astronomyInterpolation = state?.interpolation?.kind || '';
    }
  } catch (error) {
    this._astronomyObservation = null;
    this._astronomyError = error?.message || 'ASTRONOMY_CALCULATION_FAILED';
    if (target === 'mars' && this._observationPlan) {
      this._observationPlanStatus = 'STALE';
      this._offlinePlanManifest = null;
    }
    console.warn('[aetherus-astronomy]', this._astronomyError);
  }
  return this._astronomyObservation;
};

installMySkyController(cosmic3d, { astronomyTargets, ko });

export { cosmic3d };
