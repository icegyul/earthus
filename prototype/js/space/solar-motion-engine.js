// Aetherus Solar Motion Engine — SSB/Galactocentric/Experience scale bridge.
//
// 정밀 provider가 준비되면:
//   JPL Horizons @0 barycentric ICRF → Sun/SSB bridge → Galactocentric short-span motion
//   planet barycentric ICRF - Sun barycentric ICRF → heliocentric orbit orientation
//
// provider가 없으면:
//   JPL Table 1 heliocentric ecliptic fallback을 쓰되, 태양 진행 방향은 더 이상 화면 X축이나
//   l=90° 단일축이 아니라 Astropy v4.0 Galactocentric solar velocity 3-vector를 사용한다.
//
// 화면에서는 실제 1년 은하 이동 거리와 행성 궤도 크기를 각각 독립 확대한다.
// 방향/handedness는 물리 좌표에서 유지하고, 확대율은 scale-bridge.js에만 존재한다.

import { planetPositions } from './kepler.js';
import {
  DAY_MS,
  eclipticToIcrf,
  icrfToGalactic,
  normalizeVector,
  subtractVectors,
  toAetherusRender,
} from './coordinates.js';
import {
  AU_PER_KPC,
  GALACTOCENTRIC_MODEL,
  solarSystemBarycenterDisplacementGalactic,
  solarSystemBarycenterGalactocentricAt,
  solarVelocityDirectionGalactic,
} from './galactocentric.js';
import {
  composeSolarExperienceRender,
  solarOrbitOffsetRender,
  solarTrailCenterRender,
} from './scale-bridge.js';

export const SOLAR_MOTION_DIRECTION_MODEL = 'astropy-v4-galactocentric-solar-velocity-linearized';
export const SOLAR_MOTION_FRAME = 'galactocentric-aetherus-v1';

const DEFAULT_SAMPLES = 145;
const DEFAULT_SPAN_DAYS = 365.25;
const DEFAULT_HALF_TRAVEL_SCENE_UNITS = 42;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function normalizedDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_SOLAR_MOTION_DATE_REQUIRED');
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

function fallbackHeliocentricIcrf(at) {
  const ecliptic = planetPositions(at);
  return Object.fromEntries(Object.entries(ecliptic).map(([id, point]) => [id, Object.freeze({
    id,
    position: Object.freeze(eclipticToIcrf(point)),
    provider: 'jpl-table1-heliocentric-ecliptic-v1',
    origin: 'sun',
    orientation: 'icrf-j2000',
  })]));
}

function samplePhysicalState(at, referenceAt, referenceSunBarycentric, ephemerisProvider) {
  const sunBarycentric = ephemerisProvider?.barycentricIcrfState?.('sun', at) || null;
  const ssb = solarSystemBarycenterGalactocentricAt({
    at,
    referenceAt,
    sunBarycentricIcrfAu: sunBarycentric?.position || null,
  });
  const displacement = solarSystemBarycenterDisplacementGalactic({
    at,
    referenceAt,
    sunBarycentricIcrfAu: sunBarycentric?.position || null,
    referenceSunBarycentricIcrfAu: referenceSunBarycentric?.position || null,
  });

  let provider = 'jpl-table1-heliocentric-ecliptic-v1';
  let planets;
  if (ephemerisProvider) {
    planets = {};
    for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const state = ephemerisProvider.heliocentricIcrfState?.(id, at);
      if (!state) {
        planets = null;
        break;
      }
      planets[id] = state;
      if (state.provider?.includes('horizons')) provider = state.provider;
    }
  }
  if (!planets) planets = fallbackHeliocentricIcrf(at);

  return Object.freeze({
    at: at.toISOString(),
    provider,
    ssbBridge: displacement.bridge,
    ssbGalactocentricKpc: ssb.positionKpc,
    ssbDisplacementKpc: displacement.displacementKpc,
    sunBarycentricIcrfAu: sunBarycentric?.position || null,
    planets,
  });
}

export function buildSolarMotionModel({
  endAt = new Date(),
  spanDays = DEFAULT_SPAN_DAYS,
  samples = DEFAULT_SAMPLES,
  halfTravelSceneUnits = DEFAULT_HALF_TRAVEL_SCENE_UNITS,
  ephemerisProvider = null,
} = {}) {
  const end = normalizedDate(endAt);
  const durationDays = Number(spanDays);
  const sampleCount = Math.max(3, Math.floor(Number(samples)));
  const halfTravel = Number(halfTravelSceneUnits);
  if (!Number.isFinite(durationDays) || durationDays <= 0) throw new RangeError('POSITIVE_SPAN_DAYS_REQUIRED');
  if (!Number.isFinite(sampleCount) || sampleCount < 3) throw new RangeError('SOLAR_MOTION_SAMPLE_COUNT_REQUIRED');
  if (!Number.isFinite(halfTravel) || halfTravel <= 0) throw new RangeError('POSITIVE_TRAVEL_SCENE_SCALE_REQUIRED');

  const start = new Date(end.getTime() - durationDays * DAY_MS);
  const directionGalactic = normalizeVector(solarVelocityDirectionGalactic());
  const directionRender = normalizeVector(toAetherusRender(directionGalactic));
  const referenceSunBarycentric = ephemerisProvider?.barycentricIcrfState?.('sun', end) || null;
  const physicalSamples = Array.from({ length: sampleCount }, (_, index) => {
    const progress = index / (sampleCount - 1);
    const at = new Date(start.getTime() + progress * durationDays * DAY_MS);
    return Object.freeze({
      progress,
      state: samplePhysicalState(at, end, referenceSunBarycentric, ephemerisProvider),
    });
  });

  // 절대 Galactocentric 위치는 약 8 kpc인데 1년 변위는 ~10^-7 kpc다.
  // 절대좌표의 차로 trail을 만들면 유효자릿수가 손실되므로 reference 기준 국소 변위를 쓴다.
  const centerMidpointKpc = midpoint(
    physicalSamples[0].state.ssbDisplacementKpc,
    physicalSamples[physicalSamples.length - 1].state.ssbDisplacementKpc,
  );

  const timeSamples = physicalSamples.map(({ progress, state }) => {
    const center = solarTrailCenterRender({
      physicalKpc: state.ssbDisplacementKpc,
      midpointKpc: centerMidpointKpc,
      halfTravelSceneUnits: halfTravel,
      fallbackDirectionGalactic: directionGalactic,
      progress,
    });
    const planets = Object.fromEntries(Object.entries(state.planets).map(([id, planetState]) => {
      const physicalIcrfAu = planetState.position;
      const physicalGalacticAu = icrfToGalactic(physicalIcrfAu);
      const orbit = solarOrbitOffsetRender(physicalGalacticAu);
      const combined = composeSolarExperienceRender({
        centerRender: center.render,
        orbitRender: orbit.render,
      });
      return [id, Object.freeze({
        id,
        provider: planetState.provider || state.provider,
        physicalHeliocentricIcrfAu: Object.freeze({ ...physicalIcrfAu }),
        physicalGalacticAu: Object.freeze(physicalGalacticAu),
        orbitDisplayGalactic: orbit.displayGalactic,
        render: combined.render,
        scaleMode: combined.scaleMode,
      })];
    }));
    return Object.freeze({
      progress,
      at: state.at,
      ephemerisProvider: state.provider,
      ssbBridge: state.ssbBridge,
      ssbGalactocentricKpc: Object.freeze({ ...state.ssbGalactocentricKpc }),
      ssbDisplacementKpc: Object.freeze({ ...state.ssbDisplacementKpc }),
      centerPhysicalDisplacementKpc: center.physicalDisplacementKpc,
      centerDisplayGalactic: center.displayGalactic,
      sunRender: center.render,
      planets: Object.freeze(planets),
    });
  });

  const providerSet = [...new Set(timeSamples.map(sample => sample.ephemerisProvider))];
  const firstCenter = timeSamples[0].ssbDisplacementKpc;
  const lastCenter = timeSamples[timeSamples.length - 1].ssbDisplacementKpc;
  const physicalTravelDistanceAu = Math.hypot(
    lastCenter.x - firstCenter.x,
    lastCenter.y - firstCenter.y,
    lastCenter.z - firstCenter.z,
  ) * AU_PER_KPC;
  return Object.freeze({
    schema: 'earthus.solar-motion-model.v3',
    generatedAt: end.toISOString(),
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    spanDays: durationDays,
    physicalTravelDistanceAu,
    samples: Object.freeze(timeSamples),
    ephemerisProviders: Object.freeze(providerSet),
    direction: Object.freeze({
      model: SOLAR_MOTION_DIRECTION_MODEL,
      frame: SOLAR_MOTION_FRAME,
      galactic: Object.freeze(directionGalactic),
      render: Object.freeze(directionRender),
      speedKms: Object.freeze({ ...GALACTOCENTRIC_MODEL.sunVelocityKms }),
    }),
    galactocentric: Object.freeze({
      model: GALACTOCENTRIC_MODEL.id,
      referenceAt: end.toISOString(),
      centerMidpointDisplacementKpc: Object.freeze(centerMidpointKpc),
    }),
    display: Object.freeze({
      halfTravelSceneUnits: halfTravel,
      orbitRadiusMode: 'radial-log-compressed-separate-from-physics',
      trailMode: 'galactocentric-local-displacement-direction-exaggerated',
      bodySizes: 'renderer-controlled-not-to-scale',
    }),
    limitations: Object.freeze([
      providerSet.some(value => value.includes('horizons'))
        ? 'jpl-horizons-6h-state-vectors-cubic-hermite-between-cache-nodes'
        : 'planet-ephemeris-jpl-table-1-approximation-1800-2050',
      'galactocentric-transform-uses-aetherus-translated-galactic-axes-not-full-astropy-tilt-roll',
      'solar-galactocentric-motion-linearized-over-short-display-span',
      'orbit-radius-visually-compressed',
      'solar-travel-distance-visually-exaggerated',
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
  const delta = subtractVectors(last.sunRender, first.sunRender);
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
    provider: model.ephemerisProviders,
  });
}
