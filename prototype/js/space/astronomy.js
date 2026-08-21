// Aetherus Astronomy Vertical Slice — 화성·태양 관측자 기준 계산.
//
// 기본값은 JPL Table 1 Explorer 계산을 유지한다. 서버에서 캐시한 Horizons @0 ICRF
// state vector가 준비되면 같은 출력 스키마에 geometric geocentric vector를 주입해
// RA/Dec 원천을 업그레이드한다. 공유 URL의 precision=explorer 계약은 그대로 유지한다.
//
// Horizons state는 VEC_CORR=NONE이므로 '보이는 위치(apparent)'가 아니라 geometric vector다.
// 수평 좌표도 현지 굴절·지형·날씨·주광·정밀 topocentric parallax를 포함하지 않는다.

import { planetPosition } from './kepler.js';
import {
  DEG2RAD,
  FRAME,
  RAD2DEG,
  eclipticToIcrf,
  equatorialToHorizontal as canonicalEquatorialToHorizontal,
  finiteVector,
  gmstDegrees as canonicalGmstDegrees,
  julianDate,
  normalizeObserver as normalizeCoordinateObserver,
  raDecFromVector,
  relativePosition,
  scaleVector,
  wrap360,
} from './coordinates.js';

const MIN_DATE_MS = Date.parse('1800-01-01T00:00:00.000Z');
const MAX_DATE_MS = Date.parse('2050-01-01T00:00:00.000Z');

export const DEFAULT_ASTRONOMY_OBSERVER = Object.freeze({
  id: 'default',
  name: Object.freeze({ ko: '기본 관측 위치 · 인천', en: 'Default observer · Incheon' }),
  lat: 37.4563,
  lon: 126.7052,
  source: 'default',
});

export const ASTRONOMY_PRECISION = Object.freeze({
  tier: 'explorer',
  comparisonGateDeg: 1,
  validFrom: '1800-01-01T00:00:00.000Z',
  validUntil: '2050-01-01T00:00:00.000Z',
  marsNominalHeliocentricError: Object.freeze({
    longitudeArcsec: 40,
    latitudeArcsec: 2,
    distanceKm: 25_000,
  }),
});

export const ASTRONOMY_TARGETS = Object.freeze([
  'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
]);
const ASTRONOMY_TARGET_SET = new Set(ASTRONOMY_TARGETS);

export const gmstDegrees = canonicalGmstDegrees;
export const equatorialToHorizontal = canonicalEquatorialToHorizontal;

function normalizedDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new RangeError('VALID_UTC_REQUIRED');
  if (time < MIN_DATE_MS || time > MAX_DATE_MS) throw new RangeError('UTC_OUTSIDE_JPL_TABLE_1');
  return new Date(Math.floor(time / 1000) * 1000);
}

export function normalizeAstronomyObserver(observer = DEFAULT_ASTRONOMY_OBSERVER) {
  const value = observer || DEFAULT_ASTRONOMY_OBSERVER;
  const { lat, lon } = normalizeCoordinateObserver(value);
  const source = ['default', 'device', 'shared'].includes(value.source) ? value.source : 'shared';
  const fallbackName = source === 'default'
    ? DEFAULT_ASTRONOMY_OBSERVER.name
    : Object.freeze({ ko: '공유된 관측 위치', en: 'Shared observer location' });
  return Object.freeze({
    id: source === 'default' ? 'default' : null,
    name: value.name || fallbackName,
    lat,
    lon,
    source,
    accuracyM: Number.isFinite(Number(value.accuracyM)) ? Math.max(0, Number(value.accuracyM)) : null,
  });
}

// J2000 RA/Dec를 관측일 평균 적도/분점으로 옮기는 저차 세차식.
// Horizons apparent observer ephemeris를 대체하는 것이 아니다.
export function precessJ2000ToDate({ raDeg, decDeg, at }) {
  const date = normalizedDate(at);
  const centuries = (julianDate(date) - 2_451_545.0) / 36_525;
  const zeta = (2306.2181 * centuries
    + 0.30188 * centuries * centuries
    + 0.017998 * centuries * centuries * centuries) / 3600 * DEG2RAD;
  const z = (2306.2181 * centuries
    + 1.09468 * centuries * centuries
    + 0.018203 * centuries * centuries * centuries) / 3600 * DEG2RAD;
  const theta = (2004.3109 * centuries
    - 0.42665 * centuries * centuries
    - 0.041833 * centuries * centuries * centuries) / 3600 * DEG2RAD;
  const ra = Number(raDeg) * DEG2RAD;
  const dec = Number(decDeg) * DEG2RAD;
  const a = Math.cos(dec) * Math.sin(ra + zeta);
  const b = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta)
    - Math.sin(theta) * Math.sin(dec);
  const c = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta)
    + Math.cos(theta) * Math.sin(dec);
  return Object.freeze({
    raDeg: wrap360((Math.atan2(a, b) + z) * RAD2DEG),
    decDeg: Math.asin(c) * RAD2DEG,
    frame: 'mean-equator-and-equinox-of-date-iau1976',
  });
}

function observationCoordinatesFromGeocentricIcrf(icrf, observer, date) {
  const vector = finiteVector(icrf, 'GEOCENTRIC_ICRF');
  const { raDeg, decDeg, distance: distanceAu } = raDecFromVector(vector);
  const equatorialOfDate = precessJ2000ToDate({ raDeg, decDeg, at: date });
  const horizontal = canonicalEquatorialToHorizontal({
    raDeg: equatorialOfDate.raDeg,
    decDeg: equatorialOfDate.decDeg,
    observer,
    at: date,
  });
  return { raDeg, decDeg, distanceAu, equatorialOfDate, horizontal };
}

function observationCoordinatesFromGeocentricEcliptic(ecliptic, observer, date) {
  return observationCoordinatesFromGeocentricIcrf(eclipticToIcrf(ecliptic), observer, date);
}

function observationResult({
  target,
  observer,
  date,
  coordinates,
  frame,
  sourceFrame,
  precision,
  provenance,
  time,
}) {
  return Object.freeze({
    schema: 'earthus.astronomy-observation.v3',
    target,
    observer,
    time: Object.freeze({
      utc: date.toISOString(),
      julianDateUtc: julianDate(date),
      inputScale: 'UTC',
      ...time,
    }),
    coordinates: Object.freeze({
      raDeg: coordinates.raDeg,
      decDeg: coordinates.decDeg,
      distanceAu: coordinates.distanceAu,
      frame,
      frameContract: FRAME.GEOCENTRIC_ICRF_J2000,
      sourceFrame,
      equatorialOfDate: coordinates.equatorialOfDate,
      horizontal: coordinates.horizontal,
    }),
    horizon: coordinates.horizontal.altitudeDeg >= 0 ? 'above' : 'below',
    precision: Object.freeze(precision),
    provenance: Object.freeze(provenance),
  });
}

export function calculateMarsObservation({ observer, at = new Date(), precision = 'explorer' } = {}) {
  if (precision !== 'explorer') throw new RangeError('PRECISION_TIER_UNAVAILABLE');
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const mars = planetPosition('mars', date);
  const earth = planetPosition('earth', date);
  const ecliptic = relativePosition(mars, earth);
  const coordinates = observationCoordinatesFromGeocentricEcliptic(ecliptic, normalizedObserver, date);

  return observationResult({
    target: 'mars',
    observer: normalizedObserver,
    date,
    coordinates,
    frame: 'approximate-ICRF-J2000-geocentric',
    sourceFrame: FRAME.GEOCENTRIC_ECLIPTIC_J2000,
    time: { dynamicsApproximation: 'UTC used as JDTDB at Explorer precision' },
    precision: {
      tier: ASTRONOMY_PRECISION.tier,
      providerTier: 'jpl-table1-approximation',
      comparisonGateDeg: ASTRONOMY_PRECISION.comparisonGateDeg,
      validFrom: ASTRONOMY_PRECISION.validFrom,
      validUntil: ASTRONOMY_PRECISION.validUntil,
      nominalSourceError: ASTRONOMY_PRECISION.marsNominalHeliocentricError,
      limitations: Object.freeze([
        'j2000-ra-dec-no-light-time-aberration-nutation',
        'horizontal-uses-iau1976-precession-only',
        'no-topocentric-parallax-or-refraction',
        'no-local-horizon-daylight-weather',
      ]),
    },
    provenance: {
      kind: 'calculated',
      sampleCount: null,
      sampleReason: 'deterministic calculation, not an observation sample',
      sourceName: 'NASA/JPL Solar System Dynamics · Approximate Positions of the Planets',
      sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      comparisonSource: 'NASA/JPL Horizons observer ephemeris',
      comparisonUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    },
  });
}

export function calculateMarsObservationFromGeocentricIcrf({
  observer,
  at = new Date(),
  geocentricIcrfAu,
  provider = null,
} = {}) {
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const coordinates = observationCoordinatesFromGeocentricIcrf(
    geocentricIcrfAu,
    normalizedObserver,
    date,
  );
  return observationResult({
    target: 'mars',
    observer: normalizedObserver,
    date,
    coordinates,
    frame: 'ICRF-J2000-geocentric-geometric',
    sourceFrame: FRAME.GEOCENTRIC_ICRF_J2000,
    time: {
      sourceTimeScale: 'UT',
      dynamicsApproximation: null,
    },
    precision: {
      tier: ASTRONOMY_PRECISION.tier,
      providerTier: 'jpl-horizons-geometric-vectors',
      comparisonGateDeg: ASTRONOMY_PRECISION.comparisonGateDeg,
      interpolation: provider?.interpolation?.kind || 'server-cache-provider',
      limitations: Object.freeze([
        'horizons-vector-correction-none-geometric-not-apparent',
        'horizontal-uses-iau1976-precession-only',
        'no-topocentric-parallax-or-refraction',
        'no-local-horizon-daylight-weather',
      ]),
    },
    provenance: {
      kind: 'calculated-from-state-vector',
      sampleCount: null,
      sampleReason: 'deterministic state-vector interpolation, not an observation sample',
      sourceName: 'NASA/JPL Horizons · barycentric ICRF state-vector cache',
      sourceUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
      provider: provider?.provider || 'jpl-horizons-ssb-icrf-hermite-v1',
      interpolation: provider?.interpolation || null,
    },
  });
}

export function calculateMajorBodyObservation({
  target,
  observer,
  at = new Date(),
  precision = 'explorer',
} = {}) {
  const id = String(target || '').toLowerCase();
  if (!ASTRONOMY_TARGET_SET.has(id)) throw new RangeError(`ASTRONOMY_TARGET_UNAVAILABLE:${id || 'empty'}`);
  if (id === 'mars') return calculateMarsObservation({ observer, at, precision });
  if (id === 'sun') return calculateSunObservation({ observer, at, precision });
  if (precision !== 'explorer') throw new RangeError('PRECISION_TIER_UNAVAILABLE');

  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const body = planetPosition(id, date);
  const earth = planetPosition('earth', date);
  const ecliptic = relativePosition(body, earth);
  const coordinates = observationCoordinatesFromGeocentricEcliptic(ecliptic, normalizedObserver, date);
  return observationResult({
    target: id,
    observer: normalizedObserver,
    date,
    coordinates,
    frame: 'approximate-ICRF-J2000-geocentric',
    sourceFrame: FRAME.GEOCENTRIC_ECLIPTIC_J2000,
    time: { dynamicsApproximation: 'UTC used as JDTDB at Explorer precision' },
    precision: {
      tier: ASTRONOMY_PRECISION.tier,
      providerTier: 'jpl-table1-approximation',
      comparisonGateDeg: ASTRONOMY_PRECISION.comparisonGateDeg,
      validFrom: ASTRONOMY_PRECISION.validFrom,
      validUntil: ASTRONOMY_PRECISION.validUntil,
      limitations: Object.freeze([
        'j2000-ra-dec-no-light-time-aberration-nutation',
        'horizontal-uses-iau1976-precession-only',
        'no-topocentric-parallax-or-refraction',
        'no-local-horizon-daylight-weather',
      ]),
    },
    provenance: {
      kind: 'calculated',
      sampleCount: null,
      sampleReason: 'deterministic calculation, not an observation sample',
      sourceName: 'NASA/JPL Solar System Dynamics · Approximate Positions of the Planets',
      sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      comparisonSource: 'NASA/JPL Horizons observer ephemeris',
      comparisonUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    },
  });
}

export function calculateMajorBodyObservationFromGeocentricIcrf({
  target,
  observer,
  at = new Date(),
  geocentricIcrfAu,
  provider = null,
} = {}) {
  const id = String(target || '').toLowerCase();
  if (!ASTRONOMY_TARGET_SET.has(id)) throw new RangeError(`ASTRONOMY_TARGET_UNAVAILABLE:${id || 'empty'}`);
  if (id === 'mars') {
    return calculateMarsObservationFromGeocentricIcrf({ observer, at, geocentricIcrfAu, provider });
  }
  if (id === 'sun') {
    return calculateSunObservationFromGeocentricIcrf({ observer, at, geocentricIcrfAu, provider });
  }
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const coordinates = observationCoordinatesFromGeocentricIcrf(
    geocentricIcrfAu,
    normalizedObserver,
    date,
  );
  return observationResult({
    target: id,
    observer: normalizedObserver,
    date,
    coordinates,
    frame: 'ICRF-J2000-geocentric-geometric',
    sourceFrame: FRAME.GEOCENTRIC_ICRF_J2000,
    time: { sourceTimeScale: 'UT', dynamicsApproximation: null },
    precision: {
      tier: ASTRONOMY_PRECISION.tier,
      providerTier: 'jpl-horizons-geometric-vectors',
      comparisonGateDeg: ASTRONOMY_PRECISION.comparisonGateDeg,
      interpolation: provider?.interpolation?.kind || 'server-cache-provider',
      limitations: Object.freeze([
        'horizons-vector-correction-none-geometric-not-apparent',
        'horizontal-uses-iau1976-precession-only',
        'no-topocentric-parallax-or-refraction',
        'no-local-horizon-daylight-weather',
      ]),
    },
    provenance: {
      kind: 'calculated-from-state-vector',
      sampleCount: null,
      sampleReason: 'deterministic state-vector interpolation, not an observation sample',
      sourceName: 'NASA/JPL Horizons · barycentric ICRF state-vector cache',
      sourceUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
      provider: provider?.provider || 'jpl-horizons-ssb-icrf-hermite-v1',
      interpolation: provider?.interpolation || null,
    },
  });
}

// Planner의 주광 경계에만 쓰는 태양 위치. 기본 경로는 Table 1 fallback이다.
export function calculateSunObservation({ observer, at = new Date(), precision = 'explorer' } = {}) {
  if (precision !== 'explorer') throw new RangeError('PRECISION_TIER_UNAVAILABLE');
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const earth = planetPosition('earth', date);
  const ecliptic = scaleVector(earth, -1);
  const coordinates = observationCoordinatesFromGeocentricEcliptic(ecliptic, normalizedObserver, date);

  return observationResult({
    target: 'sun',
    observer: normalizedObserver,
    date,
    coordinates,
    frame: 'approximate-ICRF-J2000-geocentric',
    sourceFrame: FRAME.GEOCENTRIC_ECLIPTIC_J2000,
    time: { dynamicsApproximation: 'UTC used as JDTDB at Explorer precision' },
    precision: {
      tier: ASTRONOMY_PRECISION.tier,
      providerTier: 'jpl-table1-approximation',
      comparisonGateDeg: ASTRONOMY_PRECISION.comparisonGateDeg,
      validFrom: ASTRONOMY_PRECISION.validFrom,
      validUntil: ASTRONOMY_PRECISION.validUntil,
      limitations: Object.freeze([
        'earth-moon-barycenter-used-for-earth',
        'j2000-ra-dec-no-light-time-aberration-nutation',
        'horizontal-uses-iau1976-precession-only',
        'no-topocentric-parallax-or-refraction',
        'no-local-horizon-weather-or-solar-safety',
      ]),
    },
    provenance: {
      kind: 'calculated',
      sampleCount: null,
      sampleReason: 'deterministic calculation, not an observation sample',
      sourceName: 'NASA/JPL Solar System Dynamics · Approximate Positions of the Planets',
      sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      definitionSource: 'U.S. Naval Observatory · Rise, Set, and Twilight Definitions',
      definitionUrl: 'https://aa.usno.navy.mil/faq/RST_defs',
    },
  });
}

export function calculateSunObservationFromGeocentricIcrf({
  observer,
  at = new Date(),
  geocentricIcrfAu,
  provider = null,
} = {}) {
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const coordinates = observationCoordinatesFromGeocentricIcrf(
    geocentricIcrfAu,
    normalizedObserver,
    date,
  );
  return observationResult({
    target: 'sun',
    observer: normalizedObserver,
    date,
    coordinates,
    frame: 'ICRF-J2000-geocentric-geometric',
    sourceFrame: FRAME.GEOCENTRIC_ICRF_J2000,
    time: { sourceTimeScale: 'UT', dynamicsApproximation: null },
    precision: {
      tier: ASTRONOMY_PRECISION.tier,
      providerTier: 'jpl-horizons-geometric-vectors',
      comparisonGateDeg: ASTRONOMY_PRECISION.comparisonGateDeg,
      interpolation: provider?.interpolation?.kind || 'server-cache-provider',
      limitations: Object.freeze([
        'horizons-vector-correction-none-geometric-not-apparent',
        'horizontal-uses-iau1976-precession-only',
        'no-topocentric-parallax-or-refraction',
        'no-local-horizon-weather-or-solar-safety',
      ]),
    },
    provenance: {
      kind: 'calculated-from-state-vector',
      sampleCount: null,
      sampleReason: 'deterministic state-vector interpolation, not an observation sample',
      sourceName: 'NASA/JPL Horizons · barycentric ICRF state-vector cache',
      sourceUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
      provider: provider?.provider || 'jpl-horizons-ssb-icrf-hermite-v1',
      interpolation: provider?.interpolation || null,
    },
  });
}
