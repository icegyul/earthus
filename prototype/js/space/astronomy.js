// Aetherus Astronomy Vertical Slice — 화성·태양 관측자 기준 계산
//
// 입력: target + observer geodetic lat/lon + UTC instant
// 출력: J2000/ICRF 근사 RA·Dec, 거리, 기하학적 고도·방위각, 정밀도/출처 계약
//
// 정본 출처:
// - NASA/JPL approximate planetary positions, Table 1 (1800–2050)
//   https://ssd.jpl.nasa.gov/planets/approx_pos.html
// - NASA/JPL Horizons observer ephemeris comparison
//   https://ssd-api.jpl.nasa.gov/doc/horizons.html
//
// ⚠️ Explorer 등급이다. Table 1의 태양중심 근사식을 지구중심 방향으로 바꾸며,
//    광행차·장동·시차·대기 굴절·지형 지평선·날씨·주광을 계산하지 않는다.
//    망원경 조준이나 항해에 쓰지 않고 JPL Horizons/SPICE를 사용해야 한다.
//
// ⚠️ 축 회전/GMST/수평 좌표 수학은 coordinates.js만 정본으로 사용한다.

import { planetPosition } from './kepler.js';
import {
  DEG2RAD,
  FRAME,
  RAD2DEG,
  eclipticToIcrf,
  equatorialToHorizontal as canonicalEquatorialToHorizontal,
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

// JPL의 출력 RA·Dec는 ICRF/J2000이지만 고도·방위각은 관측일의 적도 좌표계로
// 환산된다. J2000 좌표를 그대로 지역 항성시에 넣으면 특히 천정 부근의 방위각이
// 1° 넘게 벌어질 수 있다. IAU 1976 저차 세차식을 수평 좌표 변환에만 적용한다.
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

function observationCoordinatesFromGeocentricEcliptic(ecliptic, observer, date) {
  const equatorial = eclipticToIcrf(ecliptic);
  const { raDeg, decDeg, distance: distanceAu } = raDecFromVector(equatorial);
  const equatorialOfDate = precessJ2000ToDate({ raDeg, decDeg, at: date });
  const horizontal = canonicalEquatorialToHorizontal({
    raDeg: equatorialOfDate.raDeg,
    decDeg: equatorialOfDate.decDeg,
    observer,
    at: date,
  });
  return { raDeg, decDeg, distanceAu, equatorialOfDate, horizontal };
}

export function calculateMarsObservation({ observer, at = new Date(), precision = 'explorer' } = {}) {
  if (precision !== 'explorer') throw new RangeError('PRECISION_TIER_UNAVAILABLE');
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const mars = planetPosition('mars', date);
  const earth = planetPosition('earth', date);
  const ecliptic = relativePosition(mars, earth);
  const coordinates = observationCoordinatesFromGeocentricEcliptic(ecliptic, normalizedObserver, date);

  return Object.freeze({
    schema: 'earthus.astronomy-observation.v2',
    target: 'mars',
    observer: normalizedObserver,
    time: Object.freeze({
      utc: date.toISOString(),
      julianDateUtc: julianDate(date),
      inputScale: 'UTC',
      dynamicsApproximation: 'UTC used as JDTDB at Explorer precision',
    }),
    coordinates: Object.freeze({
      raDeg: coordinates.raDeg,
      decDeg: coordinates.decDeg,
      distanceAu: coordinates.distanceAu,
      frame: 'approximate-ICRF-J2000-geocentric',
      frameContract: FRAME.GEOCENTRIC_ICRF_J2000,
      sourceFrame: FRAME.GEOCENTRIC_ECLIPTIC_J2000,
      equatorialOfDate: coordinates.equatorialOfDate,
      horizontal: coordinates.horizontal,
    }),
    horizon: coordinates.horizontal.altitudeDeg >= 0 ? 'above' : 'below',
    precision: Object.freeze({
      tier: ASTRONOMY_PRECISION.tier,
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
    }),
    provenance: Object.freeze({
      kind: 'calculated',
      sampleCount: null,
      sampleReason: 'deterministic calculation, not an observation sample',
      sourceName: 'NASA/JPL Solar System Dynamics · Approximate Positions of the Planets',
      sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      comparisonSource: 'NASA/JPL Horizons observer ephemeris',
      comparisonUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
    }),
  });
}

// Observation Planner의 주광 경계에만 쓰는 태양 중심의 기하학적 위치다.
// Earth/Moon barycenter 근사 벡터의 반대 방향을 사용하므로 일출·일몰 시각이나
// 태양 관측 안전 판정으로 승격하지 않는다. -18° 기준의 의미는 USNO 정의를 따르되,
// 현지 지평선·굴절이 없는 15분 계산 격자라는 제한을 Planner가 함께 표시한다.
export function calculateSunObservation({ observer, at = new Date(), precision = 'explorer' } = {}) {
  if (precision !== 'explorer') throw new RangeError('PRECISION_TIER_UNAVAILABLE');
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const earth = planetPosition('earth', date);
  const ecliptic = scaleVector(earth, -1);
  const coordinates = observationCoordinatesFromGeocentricEcliptic(ecliptic, normalizedObserver, date);

  return Object.freeze({
    schema: 'earthus.astronomy-observation.v2',
    target: 'sun',
    observer: normalizedObserver,
    time: Object.freeze({
      utc: date.toISOString(),
      julianDateUtc: julianDate(date),
      inputScale: 'UTC',
      dynamicsApproximation: 'UTC used as JDTDB at Explorer precision',
    }),
    coordinates: Object.freeze({
      raDeg: coordinates.raDeg,
      decDeg: coordinates.decDeg,
      distanceAu: coordinates.distanceAu,
      frame: 'approximate-ICRF-J2000-geocentric',
      frameContract: FRAME.GEOCENTRIC_ICRF_J2000,
      sourceFrame: FRAME.GEOCENTRIC_ECLIPTIC_J2000,
      equatorialOfDate: coordinates.equatorialOfDate,
      horizontal: coordinates.horizontal,
    }),
    horizon: coordinates.horizontal.altitudeDeg >= 0 ? 'above' : 'below',
    precision: Object.freeze({
      tier: ASTRONOMY_PRECISION.tier,
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
    }),
    provenance: Object.freeze({
      kind: 'calculated',
      sampleCount: null,
      sampleReason: 'deterministic calculation, not an observation sample',
      sourceName: 'NASA/JPL Solar System Dynamics · Approximate Positions of the Planets',
      sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      definitionSource: 'U.S. Naval Observatory · Rise, Set, and Twilight Definitions',
      definitionUrl: 'https://aa.usno.navy.mil/faq/RST_defs',
    }),
  });
}
