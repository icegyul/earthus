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
// Aetherus의 Galactic 축(+X=l0, +Y=l90, +Z=NGP)을 유지한 translated frame을 쓴다.
// Astropy v4.0의 v_sun은 Galactocentric H-tilt 이후 성분이므로, z_sun/R0에서 얻은
// 작은 y축 tilt를 역회전해 이 Galactic-aligned frame으로 되돌린 뒤 사용한다.
// full Astropy coordinate transform 자체를 복제하지는 않지만 위치·속도 축을 섞지는 않는다.

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
  id: 'astropy-v4-parameters-aetherus-galactic-aligned-v2',
  galcenDistanceKpc: 8.122,
  zSunKpc: 0.0208,
  // Astropy Galactocentric frame components, before converting back to Aetherus Galactic-aligned axes.
  sunVelocityKms: Object.freeze({ x: 12.9, y: 245.6, z: 7.78 }),
  source: 'Astropy Galactocentric v4.0 parameter set',
  sourceUrl: 'https://docs.astropy.org/en/stable/coordinates/galactocentric.html',
  limitations: Object.freeze([
    'aetherus-galactic-axes-translated-frame-not-full-astropy-coordinate-transform',
    'astropy-sun-velocity-inverse-height-tilted-to-galactic-aligned-axes',
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

export function galactocentricHeightTiltRad(model = GALACTOCENTRIC_MODEL) {
  const ratio = Number(model.zSunKpc) / Number(model.galcenDistanceKpc);
  if (!Number.isFinite(ratio) || Math.abs(ratio) >= 1) {
    throw new RangeError('GALACTOCENTRIC_HEIGHT_DISTANCE_INVALID');
  }
  return Math.asin(ratio);
}

// Astropy transformation's final H rotation is about +Y:
// H=[c 0 s; 0 1 0; -s 0 c]. Aetherus keeps the pre-H Galactic-aligned axes,
// so Astropy Galactocentric velocity components are converted with H^T.
export function galactocentricVectorToGalacticAligned(value, model = GALACTOCENTRIC_MODEL) {
  const x = Number(value?.x), y = Number(value?.y), z = Number(value?.z);
  if (![x, y, z].every(Number.isFinite)) throw new RangeError('FINITE_GALACTOCENTRIC_VECTOR_REQUIRED');
  const theta = galactocentricHeightTiltRad(model);
  const c = Math.cos(theta), s = Math.sin(theta);
  return {
    x: c * x - s * z,
    y,
    z: s * x + c * z,
  };
}

export function solarVelocityGalacticKms(model = GALACTOCENTRIC_MODEL) {
  return galactocentricVectorToGalacticAligned(model.sunVelocityKms, model);
}

export function solarVelocityGalacticKpcPerDay(model = GALACTOCENTRIC_MODEL) {
  return scaleVector(solarVelocityGalacticKms(model), KM_S_TO_KPC_DAY);
}

export function solarVelocityDirectionGalactic(model = GALACTOCENTRIC_MODEL) {
  const velocity = solarVelocityGalacticKms(model);
  const length = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (!(length > 0)) throw new RangeError('GALACTOCENTRIC_SOLAR_VELOCITY_REQUIRED');
  return { x: velocity.x / length, y: velocity.y / length, z: velocity.z / length };
}

export function sunReferenceGalactocentricKpc(model = GALACTOCENTRIC_MODEL) {
  const distance = Number(model.galcenDistanceKpc);
  const z = Number(model.zSunKpc);
  const x = -Math.sqrt(Math.max(0, distance * distance - z * z));
  return { x, y: 0, z };
}

export function sunGalactocentricAt(at, {
  referenceAt = at,
  model = GALACTOCENTRIC_MODEL,
} = {}) {
  const date = normalizedDate(at);
  const reference = normalizedDate(referenceAt);
  const elapsedDays = (date.getTime() - reference.getTime()) / DAY_MS;
  return addVectors(
    sunReferenceGalactocentricKpc(model),
    scaleVector(solarVelocityGalacticKpcPerDay(model), elapsedDays),
  );
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

// Experience trail은 8 kpc짜리 절대 위치 두 개를 빼서 1년의 ~10^-7 kpc 변위를 얻으면 안 된다.
// 큰 수의 차로 유효 자릿수가 사라지므로, 기준시각에서의 작은 국소 변위를 직접 계산한다.
// Horizons Sun state가 양 끝에 있으면 Sun의 SSB wobble 변화도 같은 작은 벡터에서 제거한다.
export function solarSystemBarycenterDisplacementGalactic({
  at,
  referenceAt,
  sunBarycentricIcrfAu = null,
  referenceSunBarycentricIcrfAu = null,
  model = GALACTOCENTRIC_MODEL,
} = {}) {
  const date = normalizedDate(at);
  const reference = normalizedDate(referenceAt);
  const elapsedDays = (date.getTime() - reference.getTime()) / DAY_MS;
  const solarMotion = scaleVector(solarVelocityGalacticKpcPerDay(model), elapsedDays);
  if (!sunBarycentricIcrfAu || !referenceSunBarycentricIcrfAu) {
    return Object.freeze({
      displacementKpc: Object.freeze(solarMotion),
      bridge: 'sun-as-ssb-fallback',
      model: model.id,
    });
  }
  const sunWobbleDeltaIcrfAu = subtractVectors(
    sunBarycentricIcrfAu,
    referenceSunBarycentricIcrfAu,
  );
  const sunWobbleDeltaGalacticKpc = auVectorToKpc(icrfToGalactic(sunWobbleDeltaIcrfAu));
  return Object.freeze({
    displacementKpc: Object.freeze(subtractVectors(solarMotion, sunWobbleDeltaGalacticKpc)),
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
  const displacement = solarSystemBarycenterDisplacementGalactic({
    at: '2026-08-21T00:00:00.000Z',
    referenceAt: reference,
  }).displacementKpc;
  const velocity = solarVelocityGalacticKpcPerDay();
  const error = Math.max(
    Math.abs(displacement.x - velocity.x),
    Math.abs(displacement.y - velocity.y),
    Math.abs(displacement.z - velocity.z),
  );
  const absolute = sunReferenceGalactocentricKpc();
  const distanceError = Math.abs(
    Math.hypot(absolute.x, absolute.y, absolute.z) - GALACTOCENTRIC_MODEL.galcenDistanceKpc,
  );
  return Object.freeze({
    ok: error < 1e-18 && distanceError < 1e-12 && absolute.x < -8 && absolute.z > 0,
    errorKpc: error,
    distanceErrorKpc: distanceError,
    model: GALACTOCENTRIC_MODEL.id,
  });
}
