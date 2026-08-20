// Aetherus canonical-coordinate adapter.
//
// 기존 3D UX 전체를 한 번에 다시 쓰지 않고 안정적으로 보존하면서, 좌표가 물리 계산과
// 화면 연출 사이에서 뒤집히거나 임의 축으로 바뀌던 핵심 경로부터 교체한다.
// 원래 장면 구현은 cosmic3d-legacy.js에 동일 blob으로 보존한다.

import { cosmic3d } from './cosmic3d-legacy.js';
import { planetOrbit, planetPositions } from './kepler.js';
import {
  radialDisplayVector,
  toAetherusRender,
} from './coordinates.js';
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

const legacyMakeSolarSystem = cosmic3d.makeSolarSystem;
const legacyActivate = cosmic3d.activate;
const legacyOpenSolarMotion = cosmic3d.openSolarMotion;
const legacyShowSolarMotionInfo = cosmic3d.showSolarMotionInfo;

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

// 실제 행성 좌표는 물리 프레임 그대로 유지하고, 마지막 순간에만 Three.js y-up으로 바꾼다.
// 기존 구현의 (x,z,y)는 반사(det=-1)를 만들어 태양계의 손잡이를 뒤집었다. 정본 변환은
// coordinates.js의 (x,z,-y)이며, 시각 반지름 압축도 그 전에 radial 단계로만 적용한다.
cosmic3d.refreshSolarSystemAt = function refreshSolarSystemAt(at = roundedNow(), render = false) {
  if (!this.THREE || !this.solarGroup || !this.planetMeshes) return false;
  const T = this.THREE;
  const date = at instanceof Date ? new Date(at.getTime()) : new Date(at);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_SOLAR_EPOCH_REQUIRED');
  const positions = planetPositions(date);

  IDS.forEach((id, index) => {
    const point = positions[id];
    const rendered = solarRenderPoint(point);
    const mesh = this.planetMeshes[id];
    if (mesh) {
      mesh.position.set(rendered.x, rendered.y, rendered.z);
      mesh.userData.physicalFrame = point.frame?.orientation || 'ecliptic-j2000';
      mesh.userData.physicalOrigin = point.frame?.origin || 'sun';
      mesh.userData.ephemerisAt = point.at;
      mesh.userData.ephemerisProvider = point.provider;
    }

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
  }
  if (render) this.render();
  return true;
};

cosmic3d.makeSolarSystem = function makeSolarSystemCanonical() {
  legacyMakeSolarSystem.call(this);
  this.refreshSolarSystemAt(roundedNow(), false);
};

// 장면에 다시 들어올 때마다 현재 UTC로 행성 좌표를 갱신한다. 무한 rAF로 행성을 계속
// 돌리지 않는다. 태양계 시간척도에서는 재진입/명시적 렌더 시 갱신이 발열 대비 충분하며,
// 향후 SimulationClock이 들어오면 이 메서드만 해당 clock provider에 연결하면 된다.
cosmic3d.activate = async function activateCanonical(stage) {
  const result = await legacyActivate.call(this, stage);
  if (!this._ready) return result;
  this.refreshSolarSystemAt(roundedNow(), false);
  if (this._craftCatalog) this.buildSpacecraft();
  // solar-motion.json은 속도/출처 계약만 유지한다. 실제 행성 표본 시간은 항상 현재 UTC로
  // 끝나는 지난 1년 창으로 다시 생성한다.
  if (this._motionCatalog) this.buildSolarMotion();
  this.render();
  return result;
};

// 태양계 전진 장면을 화면 X축용 가짜 나선에서 Galactic ICRS 기준으로 교체한다.
// 행성 공전면은 황도 J2000 → ICRF/J2000 → Galactic 회전을 거치므로 실제 방향 관계가
// 보존된다. 궤도 반지름과 천체 크기만 Experience 시각 스케일로 별도 과장한다.
cosmic3d.buildSolarMotion = function buildSolarMotionCanonical() {
  if (!this._motionCatalog || !this.solarMotionGroup || !this.THREE) return;
  this.clearSolarMotion();
  const T = this.THREE;
  const model = buildSolarMotionModel({
    endAt: roundedNow(),
    spanDays: Number(this._motionCatalog.displaySpanDays) || 365.25,
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
  directionLine.userData.coordinateFrame = 'galactic-icrs';
  directionLine.userData.directionModel = model.direction.model;
  this.solarMotionGroup.add(directionLine);

  const directionMarker = new T.Mesh(
    new T.ConeGeometry(.72, 2.4, 16),
    new T.MeshBasicMaterial({ color: 0x83e0f2, transparent: true, opacity: .72 }),
  );
  directionMarker.position.copy(lastSun).addScaledVector(direction, 5);
  directionMarker.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
  directionMarker.userData.coordinateFrame = 'galactic-icrs';
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
    line.userData.coordinateFrame = 'galactic-icrs';
    line.userData.displayScale = 'orbit-radial-log-compressed';
    this.solarMotionGroup.add(line);

    const radius = clamp(meta.radius * .5, .22, .62);
    const planet = new T.Mesh(
      new T.SphereGeometry(radius, 14, 10),
      new T.MeshBasicMaterial({ color: meta.color }),
    );
    planet.position.copy(points[0]);
    planet.userData.motionBody = id;
    planet.userData.physicalFrame = 'heliocentric-ecliptic-j2000';
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
    this.canvas.dataset.motionPhysicalFrame = 'heliocentric-ecliptic-j2000';
    this.canvas.dataset.motionGalacticFrame = 'galactic-icrs';
    this.canvas.dataset.motionDirectionModel = model.direction.model;
    this.canvas.dataset.motionStartAt = model.startAt;
    this.canvas.dataset.motionEndAt = model.endAt;
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
  const distance = Number(this._motionCatalog.distanceAu || 0) * progress;
  const utc = sample.at.replace('T', ' ').replace('.000Z', 'Z');
  const status = document.getElementById('cosmicMotionDistance');
  if (status) status.textContent = ko()
    ? `${utc} · 지난 ${elapsedDays}일 · 태양 진행 약 ${distance.toFixed(1)} AU`
    : `${utc} · ${elapsedDays} days into trail · Sun travels about ${distance.toFixed(1)} AU`;
  const bar = document.getElementById('cosmicMotionProgress');
  if (bar) bar.style.transform = `scaleX(${progress})`;
  if (location.hash === '#dev' && this.canvas) this.canvas.dataset.motionUtc = sample.at;
  if (updateScreen) this.render();
};

// Galactic +Y는 Aetherus 렌더 좌표에서 -Z로 보인다. 물리 축을 화면에 맞춰 돌리는 대신
// 카메라를 옆으로 옮겨 나선 궤적을 읽게 한다. 과학 좌표와 연출 카메라를 분리한다.
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
  const kind = document.getElementById('cosmicMotionKind');
  const title = document.getElementById('cosmicMotionTitle');
  const replay = document.getElementById('cosmicMotionReplay');
  if (kind) kind.textContent = isKo
    ? `LIVE 기준 · ${start} → ${end} · Galactic ICRS`
    : `LIVE window · ${start} → ${end} · Galactic ICRS`;
  if (title) title.textContent = isKo ? '움직이는 태양계 · 실제 방향 관계' : 'Moving Solar System · physical orientation';
  if (replay) replay.textContent = isKo ? '지난 1년 다시 보기' : 'Replay the past year';
  this.setSolarMotionProgress(this._motionProgress, false);
};

export { cosmic3d };
