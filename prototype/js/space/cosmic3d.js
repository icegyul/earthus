// Aetherus canonical-coordinate adapter.
//
// 기존 3D UX 전체를 한 번에 다시 쓰지 않고 안정적으로 보존하면서, 좌표가 물리 계산과
// 화면 연출 사이에서 뒤집히거나 임의 축으로 바뀌던 핵심 경로부터 교체한다.
// 원래 장면 구현은 cosmic3d-legacy.js에 동일 blob으로 보존한다.

import { cosmic3d } from './cosmic3d-legacy.js';
import { planetOrbit } from './kepler.js';
import {
  radialDisplayVector,
  toAetherusRender,
} from './coordinates.js';
import {
  calculateMarsObservationFromGeocentricIcrf,
} from './astronomy.js';
import {
  createMajorEphemerisService,
  HORIZONS_PROVIDER_ID,
} from './ephemeris-provider.js';
import {
  buildSolarMotionModel,
  solarMotionSample,
} from './solar-motion-engine.js';

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
const solarDisplayRadius = au => 3.5 + 7 * Math.log1p(Math.max(0, Number(au)) * 1.4);
const roundedNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);
const ko = () => document.documentElement.lang !== 'en';
const majorEphemeris = createMajorEphemerisService();

const legacyMakeSolarSystem = cosmic3d.makeSolarSystem;
const legacyActivate = cosmic3d.activate;
const legacyOpenSolarMotion = cosmic3d.openSolarMotion;
const legacyShowSolarMotionInfo = cosmic3d.showSolarMotionInfo;
const legacyCalculateAstronomy = cosmic3d.calculateAstronomy;

function threeVector(T, value) {
  return new T.Vector3(value.x, value.y, value.z);
}

function solarRenderPoint(point) {
  const displayPhysical = radialDisplayVector(point, solarDisplayRadius);
  return toAetherusRender(displayPhysical);
}

function setLineGeometry(T, line, points) {
  if (!line) return;
  line.geometry?.dispose?.();
  line.geometry = new T.BufferGeometry().setFromPoints(points);
}

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
    if (this._detailBody?.id === 'mars') {
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
// ecliptic J2000으로 되돌려 표시한다. 없거나 coverage 밖이면 Table 1 fallback으로 내려간다.
cosmic3d.refreshSolarSystemAt = function refreshSolarSystemAt(at = roundedNow(), render = false) {
  if (!this.THREE || !this.solarGroup || !this.planetMeshes) return false;
  const T = this.THREE;
  const date = at instanceof Date ? new Date(at.getTime()) : new Date(at);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_SOLAR_EPOCH_REQUIRED');

  IDS.forEach((id, index) => {
    const state = majorEphemeris.heliocentricEclipticState(id, date);
    const point = state.position;
    const rendered = solarRenderPoint(point);
    const mesh = this.planetMeshes[id];
    if (mesh) {
      mesh.position.set(rendered.x, rendered.y, rendered.z);
      mesh.userData.physicalFrame = state.orientation;
      mesh.userData.physicalOrigin = state.origin;
      mesh.userData.ephemerisAt = state.at;
      mesh.userData.ephemerisProvider = state.provider;
      mesh.userData.ephemerisFallbackReason = state.fallbackReason || null;
    }

    // 전체 궤도선은 현재 위치 provider와 별개다. JPL Table 1의 osculating shape를
    // 읽기 쉬운 guide로 유지하고, 현재 천체 점만 Horizons state로 정확도를 올린다.
    const orbit = planetOrbit(id, date, 150).map(sample => threeVector(T, solarRenderPoint(sample)));
    setLineGeometry(T, this.orbitLines?.[index], orbit);
  });

  this.earthMesh = this.planetMeshes.earth;
  if (this.moonGroup && this.earthMesh) this.moonGroup.position.copy(this.earthMesh.position);
  this._solarEpochAt = date.toISOString();
  if (location.hash === '#dev' && this.canvas) {
    this.canvas.dataset.solarEpoch = this._solarEpochAt;
    this.canvas.dataset.solarPhysicalFrame = 'heliocentric-ecliptic-j2000';
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
  const result = await legacyOpenSolarMotion.call(this);
  if (this._solarMotionMode) {
    this.yaw = Math.PI / 2;
    this.pitch = .26;
    this.render();
  }
  return result;
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

// 기존 계산을 즉시 보여준 뒤 Horizons cache가 이미 로드돼 있으면 같은 observer/time을
// geometric geocentric ICRF state로 교체한다. UI/공유 URL precision=explorer는 그대로여서
// 상대방이 cache를 못 받았을 때도 기능이 깨지지 않는다.
cosmic3d.calculateAstronomy = function calculateAstronomyCanonical() {
  legacyCalculateAstronomy.call(this);
  if (this._detailBody?.id !== 'mars' || !this._astronomyAt) return this._astronomyObservation;
  const state = majorEphemeris.geocentricIcrfState('mars', this._astronomyAt);
  if (!state) return this._astronomyObservation;
  try {
    this._astronomyObservation = calculateMarsObservationFromGeocentricIcrf({
      observer: this._astronomyObserver,
      at: this._astronomyAt,
      geocentricIcrfAu: state.position,
      provider: state,
    });
    this._astronomyObserver = this._astronomyObservation.observer;
    this._astronomyAt = this._astronomyObservation.time.utc;
    this._astronomyPrecision = 'explorer';
    this._astronomyError = null;
    this.updateObservationPlanFreshness();
    if (location.hash === '#dev' && this.canvas) {
      this.canvas.dataset.astronomyVectorProvider = state.provider;
      this.canvas.dataset.astronomyInterpolation = state.interpolation?.kind || '';
    }
  } catch (error) {
    console.warn('[aetherus-astronomy-horizons]', error?.message || error);
  }
  return this._astronomyObservation;
};

export { cosmic3d };
