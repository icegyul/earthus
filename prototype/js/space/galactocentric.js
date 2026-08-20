// Aetherus Galactocentric bridge.
//
// 태양계 내부의 ICRF/AU 좌표와 우리은하 kpc 좌표를 한 계산 그래프에 연결한다.
// 물리 좌표는 절대 화면 스케일로 바꾸지 않고, 렌더용 확대/압축은 scale-bridge.js가 맡는다.
//
// Galactocentric parameter set:
// - Astropy Galactocentric v4.0: R0=8.122 kpc, z_sun=20.8 pc,
//   v_sun=(12.9, 245.6, 7.78) km/s.
//   https://docs.astropy.org/en/stable/coordinates/galactocentric.html
//
// 축 규약은 Aetherus Galactic ICRS와 맞춘 단순 translated frame이다.
// +X: 태양 위치에서 은하 중심 방향(l=0), +Y: 은하 회전 방향(l=90), +Z: NGP.
// 이 규약에서는 기준 시각의 태양이 X=-R0, Z=+z_sun에 있다.
// Astropy의 full Galactocentric transform에 포함되는 작은 tilt/roll까지 재현하는 모듈은 아니다.

import {
  DAY_MS,
  addVectors,
  icrfToGalactic,
  scaleVector,
  subtractVectors,
} from './coordinates.js';

export const AU_PER_KPC = 206_264_806.24709636;
export const KM_S_TO_KPC_DAY = 86_400 / 3.0856775814913673e16;

export const GALACTOCENTRIC_MODEL = Object.freeze({
  id: 'astropy-v4-parameters-aetherus-galactic-axes-v1',
  galcenDistanceKpc: 8.122,
  zSunKpc: 0.0208,
  sunVelocityKms: Object.freeze({ x: 12.9, y: 245.6, z: 7.78 }),
  source: 'Astropy Galactocentric v4.0 parameter set',
  sourceUrl: 'https://docs.astropy.org/en/stable/coordinates/galactocentric.html',
  limitations: Object.freeze([
    'aetherus-galactic-axes-translated-frame-not-full-astropy-tilt-roll',
    'solar-velocity-linearized-for-short-span-visualization',
    'sun-state-used-as-ssb-bridge-when-jpl-barycentric-state-is-available',
  ]),
});

function normalizedDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_GALACTOCENTRIC_DATE_REQUIRED');
  return date;
}

export function auVectorToKpc(value) {
  return scaleVector(value, 1 / AU_PER_KPC);
}

export function kpcVectorToAu(value) {
  return scaleVector(value, AU_PER_KPC);
}

export function solarVelocityGalacticKpcPerDay(model = GALACTOCENTRIC_MODEL) {
  return scaleVector(model.sunVelocityKms, KM_S_TO_KPC_DAY);
}

export function solarVelocityDirectionGalactic(model = GALACTOCENTRIC_MODEL) {
  const velocity = model.sunVelocityKms;
  const length = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (!(length > 0)) throw new RangeError('GALACTOCENTRIC_SOLAR_VELOCITY_REQUIRED');
  return { x: velocity.x / length, y: velocity.y / length, z: velocity.z / length };
}

export function sunGalactocentricAt(at, {
  referenceAt = at,
  model = GALACTOCENTRIC_MODEL,
} = {}) {
  const date = normalizedDate(at);
  const reference = normalizedDate(referenceAt);
  const elapsedDays = (date.getTime() - reference.getTime()) / DAY_MS;
  const base = { x: -model.galcenDistanceKpc, y: 0, z: model.zSunKpc };
  return addVectors(base, scaleVector(solarVelocityGalacticKpcPerDay(model), elapsedDays));
}

// JPL Horizons CENTER='@0' state에서 Sun은 SSB 기준 ICRF 위치다.
// Sun_galcen - Sun_from_SSB = SSB_galcen 이므로, 이 값이 태양계 질량중심의 은하 좌표다.
export function solarSystemBarycenterGalactocentricAt({
  at,
  referenceAt = at,
  sunBarycentricIcrfAu = null,
  model = GALACTOCENTRIC_MODEL,
} = {}) {
  const sun = sunGalactocentricAt(at, { referenceAt, model });
  if (!sunBarycentricIcrfAu) {
    return Object.freeze({
      positionKpc: Object.freeze(sun),
      bridge: 'sun-as-ssb-fallback',
      model: model.id,
    });
  }
  const sunFromSsbGalacticKpc = auVectorToKpc(icrfToGalactic(sunBarycentricIcrfAu));
  const ssb = subtractVectors(sun, sunFromSsbGalacticKpc);
  return Object.freeze({
    positionKpc: Object.freeze(ssb),
    bridge: 'jpl-sun-barycentric-to-ssb',
    model: model.id,
  });
}

export function barycentricIcrfToGalactocentric({
  barycentricIcrfAu,
  ssbGalactocentricKpc,
} = {}) {
  if (!barycentricIcrfAu || !ssbGalactocentricKpc) {
    throw new RangeError('BARYCENTRIC_AND_SSB_GALACTOCENTRIC_REQUIRED');
  }
  const localGalacticKpc = auVectorToKpc(icrfToGalactic(barycentricIcrfAu));
  return addVectors(ssbGalactocentricKpc, localGalacticKpc);
}

export function galactocentricSelfTest() {
  const reference = '2026-08-20T00:00:00.000Z';
  const start = sunGalactocentricAt(reference, { referenceAt: reference });
  const end = sunGalactocentricAt('2026-08-21T00:00:00.000Z', { referenceAt: reference });
  const velocity = solarVelocityGalacticKpcPerDay();
  const error = Math.max(
    Math.abs((end.x - start.x) - velocity.x),
    Math.abs((end.y - start.y) - velocity.y),
    Math.abs((end.z - start.z) - velocity.z),
  );
  return Object.freeze({
    ok: error < 1e-15 && start.x < -8 && start.z > 0,
    errorKpc: error,
    model: GALACTOCENTRIC_MODEL.id,
  });
}
