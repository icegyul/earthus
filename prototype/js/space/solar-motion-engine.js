// Aetherus Solar Motion Engine — 물리 좌표와 화면 연출을 분리한 순수 계산 모듈.
//
// 1) 행성 위치: kepler.js의 JPL Table 1 근사 태양중심 황도 J2000 좌표
// 2) 방향 변환: 황도 J2000 → ICRF/J2000 → IAU/ICRS Galactic
// 3) 태양의 1년 진행 방향: 국소 원운동 접선(+Galactic Y, l=90°, b=0°) 근사
// 4) 화면 연출: 태양 진행 거리와 행성 궤도 반지름을 서로 독립적으로 압축/확대
//
// 중요: +Galactic Y는 태양의 정확한 3차원 속도벡터가 아니다. 은하 원반의 국소
// 원운동 방향을 나타내는 과학적 기준축이다. Sun peculiar motion(U,V,W), 은하 퍼텐셜,
// 장기 곡률은 별도 Galactic Dynamics provider에서 추가해야 한다.

import { planetPositions } from './kepler.js';
import {
  DAY_MS,
  addVectors,
  eclipticToGalactic,
  normalizeVector,
  radialDisplayVector,
  scaleVector,
  toAetherusRender,
  vectorFromGalactic,
} from './coordinates.js';

export const SOLAR_MOTION_DIRECTION_MODEL = 'local-galactic-circular-tangent-l90-b0';
export const SOLAR_MOTION_FRAME = 'galactic-icrs-local-sun';

const DEFAULT_SAMPLES = 145;
const DEFAULT_SPAN_DAYS = 365.25;
const DEFAULT_HALF_TRAVEL_SCENE_UNITS = 42;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function normalizedDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_SOLAR_MOTION_DATE_REQUIRED');
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

export function defaultOrbitDisplayRadius(au) {
  const radius = Number(au);
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('ORBIT_RADIUS_AU_REQUIRED');
  return 2.1 + Math.log1p(radius) * 5.7;
}

export function solarMotionDirectionGalactic() {
  return normalizeVector(vectorFromGalactic(90, 0));
}

function sampleCenter(direction, progress, halfTravelSceneUnits) {
  const signedDistance = (progress * 2 - 1) * halfTravelSceneUnits;
  return scaleVector(direction, signedDistance);
}

export function buildSolarMotionModel({
  endAt = new Date(),
  spanDays = DEFAULT_SPAN_DAYS,
  samples = DEFAULT_SAMPLES,
  halfTravelSceneUnits = DEFAULT_HALF_TRAVEL_SCENE_UNITS,
  orbitDisplayRadius = defaultOrbitDisplayRadius,
} = {}) {
  const end = normalizedDate(endAt);
  const durationDays = Number(spanDays);
  const sampleCount = Math.max(3, Math.floor(Number(samples)));
  const halfTravel = Number(halfTravelSceneUnits);
  if (!Number.isFinite(durationDays) || durationDays <= 0) throw new RangeError('POSITIVE_SPAN_DAYS_REQUIRED');
  if (!Number.isFinite(sampleCount) || sampleCount < 3) throw new RangeError('SOLAR_MOTION_SAMPLE_COUNT_REQUIRED');
  if (!Number.isFinite(halfTravel) || halfTravel <= 0) throw new RangeError('POSITIVE_TRAVEL_SCENE_SCALE_REQUIRED');

  const start = new Date(end.getTime() - durationDays * DAY_MS);
  const directionGalactic = solarMotionDirectionGalactic();
  const directionRender = normalizeVector(toAetherusRender(directionGalactic));
  const timeSamples = Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / (sampleCount - 1);
    const at = new Date(start.getTime() + progress * durationDays * DAY_MS);
    const heliocentricEcliptic = planetPositions(at);
    const centerGalacticDisplay = sampleCenter(directionGalactic, progress, halfTravel);
    const planets = Object.fromEntries(Object.entries(heliocentricEcliptic).map(([id, physical]) => {
      const galacticPhysical = eclipticToGalactic(physical);
      const galacticDisplayOffset = radialDisplayVector(galacticPhysical, orbitDisplayRadius);
      const galacticDisplay = addVectors(centerGalacticDisplay, galacticDisplayOffset);
      return [id, Object.freeze({
        id,
        physicalEclipticJ2000Au: Object.freeze({ x: physical.x, y: physical.y, z: physical.z }),
        physicalGalacticAu: Object.freeze(galacticPhysical),
        displayGalactic: Object.freeze(galacticDisplay),
        render: Object.freeze(toAetherusRender(galacticDisplay)),
      })];
    }));
    return Object.freeze({
      progress,
      at: at.toISOString(),
      centerGalacticDisplay: Object.freeze(centerGalacticDisplay),
      sunRender: Object.freeze(toAetherusRender(centerGalacticDisplay)),
      planets: Object.freeze(planets),
    });
  });

  return Object.freeze({
    schema: 'earthus.solar-motion-model.v2',
    generatedAt: end.toISOString(),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    spanDays: durationDays,
    samples: Object.freeze(timeSamples),
    direction: Object.freeze({
      model: SOLAR_MOTION_DIRECTION_MODEL,
      frame: SOLAR_MOTION_FRAME,
      galactic: Object.freeze(directionGalactic),
      render: Object.freeze(directionRender),
    }),
    display: Object.freeze({
      halfTravelSceneUnits: halfTravel,
      orbitRadiusMode: 'radial-log-compressed-separate-from-physics',
      bodySizes: 'renderer-controlled-not-to-scale',
    }),
    limitations: Object.freeze([
      'planet-ephemeris-jpl-table-1-approximation-1800-2050',
      'solar-direction-local-galactic-circular-tangent-not-full-uvw-state-vector',
      'galactic-curvature-omitted-over-one-year',
      'orbit-radius-visually-compressed',
      'body-sizes-not-to-scale',
    ]),
  });
}

export function solarMotionSample(model, progress) {
  if (!model?.samples?.length) throw new RangeError('SOLAR_MOTION_MODEL_REQUIRED');
  const value = clamp(Number(progress), 0, 1);
  const index = Math.min(model.samples.length - 1, Math.round(value * (model.samples.length - 1)));
  return Object.freeze({ index, sample: model.samples[index], progress: value });
}

export function solarMotionSelfTest() {
  const model = buildSolarMotionModel({
    endAt: '2026-08-20T00:00:00.000Z',
    spanDays: 1,
    samples: 3,
    halfTravelSceneUnits: 1,
  });
  const first = model.samples[0];
  const last = model.samples[2];
  const delta = {
    x: last.sunRender.x - first.sunRender.x,
    y: last.sunRender.y - first.sunRender.y,
    z: last.sunRender.z - first.sunRender.z,
  };
  const direction = normalizeVector(delta);
  const expected = model.direction.render;
  const directionError = Math.max(
    Math.abs(direction.x - expected.x),
    Math.abs(direction.y - expected.y),
    Math.abs(direction.z - expected.z),
  );
  const earth = last.planets.earth;
  const physicalRadius = Math.hypot(
    earth.physicalGalacticAu.x,
    earth.physicalGalacticAu.y,
    earth.physicalGalacticAu.z,
  );
  return Object.freeze({
    ok: directionError < 1e-10 && physicalRadius > .95 && physicalRadius < 1.05,
    directionError,
    earthPhysicalRadiusAu: physicalRadius,
    endAt: model.endAt,
  });
}
