// Aetherus Astronomy Vertical Slice — 화성 관측자 기준 계산
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
//    광행차·세차/장동·시차·대기 굴절·지형 지평선·날씨·주광을 계산하지 않는다.
//    망원경 조준이나 항해에 쓰지 않고 JPL Horizons를 사용해야 한다.

import { julianDate, planetPosition } from './kepler.js';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const J2000_OBLIQUITY_DEG = 23.43928;
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

const wrap360 = value => ((value % 360) + 360) % 360;
const wrap180 = value => {
  const wrapped = wrap360(value);
  return wrapped > 180 ? wrapped - 360 : wrapped;
};

function normalizedDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new RangeError('VALID_UTC_REQUIRED');
  if (time < MIN_DATE_MS || time > MAX_DATE_MS) throw new RangeError('UTC_OUTSIDE_JPL_TABLE_1');
  return new Date(Math.floor(time / 1000) * 1000);
}

export function normalizeAstronomyObserver(observer = DEFAULT_ASTRONOMY_OBSERVER) {
  const value = observer || DEFAULT_ASTRONOMY_OBSERVER;
  const lat = Number(value.lat);
  const lon = Number(value.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError('OBSERVER_LAT_OUT_OF_RANGE');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new RangeError('OBSERVER_LON_OUT_OF_RANGE');
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

export function gmstDegrees(date) {
  const jd = julianDate(date);
  const centuries = (jd - 2_451_545.0) / 36_525;
  return wrap360(280.46061837
    + 360.98564736629 * (jd - 2_451_545.0)
    + 0.000387933 * centuries * centuries
    - centuries * centuries * centuries / 38_710_000);
}

// JPL의 출력 RA·Dec는 ICRF/J2000이지만 고도·방위각은 관측일의 적도 좌표계로
// 환산된다. J2000 좌표를 그대로 지역 항성시에 넣으면 특히 천정 부근의 방위각이
// 1° 넘게 벌어졌다. IAU 1976 저차 세차식을 수평 좌표 변환에만 적용한다.
export function precessJ2000ToDate({ raDeg, decDeg, at }) {
  const date = normalizedDate(at);
  const centuries = (julianDate(date) - 2_451_545.0) / 36_525;
  const zeta = (2306.2181 * centuries
    + 0.30188 * centuries * centuries
    + 0.017998 * centuries * centuries * centuries) / 3600 * DEG;
  const z = (2306.2181 * centuries
    + 1.09468 * centuries * centuries
    + 0.018203 * centuries * centuries * centuries) / 3600 * DEG;
  const theta = (2004.3109 * centuries
    - 0.42665 * centuries * centuries
    - 0.041833 * centuries * centuries * centuries) / 3600 * DEG;
  const ra = Number(raDeg) * DEG;
  const dec = Number(decDeg) * DEG;
  const a = Math.cos(dec) * Math.sin(ra + zeta);
  const b = Math.cos(theta) * Math.cos(dec) * Math.cos(ra + zeta)
    - Math.sin(theta) * Math.sin(dec);
  const c = Math.sin(theta) * Math.cos(dec) * Math.cos(ra + zeta)
    + Math.cos(theta) * Math.sin(dec);
  return Object.freeze({
    raDeg: wrap360((Math.atan2(a, b) + z) * RAD),
    decDeg: Math.asin(c) * RAD,
    frame: 'mean-equator-and-equinox-of-date-iau1976',
  });
}

export function equatorialToHorizontal({ raDeg, decDeg, observer, at }) {
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const date = normalizedDate(at);
  const latitude = normalizedObserver.lat * DEG;
  const declination = Number(decDeg) * DEG;
  const hourAngleDeg = wrap180(gmstDegrees(date) + normalizedObserver.lon - Number(raDeg));
  const hourAngle = hourAngleDeg * DEG;
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  );
  // atan2 결과에 180°를 더해 북쪽=0°, 동쪽=90°인 방위각으로 바꾼다.
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
  ) * RAD + 180;
  return Object.freeze({
    altitudeDeg: altitude * RAD,
    azimuthDeg: wrap360(azimuth),
    hourAngleDeg,
    frame: 'geometric-horizontal-no-refraction',
  });
}

export function calculateMarsObservation({ observer, at = new Date(), precision = 'explorer' } = {}) {
  if (precision !== 'explorer') throw new RangeError('PRECISION_TIER_UNAVAILABLE');
  const date = normalizedDate(at);
  const normalizedObserver = normalizeAstronomyObserver(observer);
  const mars = planetPosition('mars', date);
  const earth = planetPosition('earth', date);
  const ecliptic = {
    x: mars.x - earth.x,
    y: mars.y - earth.y,
    z: mars.z - earth.z,
  };
  const obliquity = J2000_OBLIQUITY_DEG * DEG;
  const equatorial = {
    x: ecliptic.x,
    y: Math.cos(obliquity) * ecliptic.y - Math.sin(obliquity) * ecliptic.z,
    z: Math.sin(obliquity) * ecliptic.y + Math.cos(obliquity) * ecliptic.z,
  };
  const distanceAu = Math.hypot(equatorial.x, equatorial.y, equatorial.z);
  const raDeg = wrap360(Math.atan2(equatorial.y, equatorial.x) * RAD);
  const decDeg = Math.asin(equatorial.z / distanceAu) * RAD;
  const equatorialOfDate = precessJ2000ToDate({ raDeg, decDeg, at: date });
  const horizontal = equatorialToHorizontal({
    raDeg: equatorialOfDate.raDeg,
    decDeg: equatorialOfDate.decDeg,
    observer: normalizedObserver,
    at: date,
  });

  return Object.freeze({
    schema: 'earthus.astronomy-observation.v1',
    target: 'mars',
    observer: normalizedObserver,
    time: Object.freeze({
      utc: date.toISOString(),
      julianDateUtc: julianDate(date),
      inputScale: 'UTC',
      dynamicsApproximation: 'UTC used as JDTDB at Explorer precision',
    }),
    coordinates: Object.freeze({
      raDeg,
      decDeg,
      distanceAu,
      frame: 'approximate-ICRF-J2000-geocentric',
      equatorialOfDate,
      horizontal,
    }),
    horizon: horizontal.altitudeDeg >= 0 ? 'above' : 'below',
    precision: Object.freeze({
      tier: ASTRONOMY_PRECISION.tier,
      comparisonGateDeg: ASTRONOMY_PRECISION.comparisonGateDeg,
      validFrom: ASTRONOMY_PRECISION.validFrom,
      validUntil: ASTRONOMY_PRECISION.validUntil,
      nominalSourceError: ASTRONOMY_PRECISION.marsNominalHeliocentricError,
      limitations: Object.freeze([
        'no-light-time-aberration-precession-nutation',
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
