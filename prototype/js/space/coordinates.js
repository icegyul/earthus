// Aetherus canonical coordinate core.
//
// 이 파일은 "물리 좌표"와 "화면 좌표"를 분리하는 단일 정본이다.
// 행성 계산, 은하 방향, 관측자 하늘, Three.js 렌더러가 각각 제멋대로 축을
// 바꾸지 않도록 모든 순수 좌표 변환을 여기로 모은다.
//
// 기준:
// - 황도: J2000 mean ecliptic/equinox, 오른손 좌표계
// - 적도: ICRF/J2000 근사 축, 오른손 좌표계
// - 은하: IAU/ICRS Galactic Cartesian (x=l0,b0 / y=l90,b0 / z=NGP)
// - 수평: 기하학적 고도/방위각, 북=0°, 동=90°, 굴절 없음
//
// ⚠️ 좌표 변환은 정밀한 ephemeris 자체가 아니다. 천체의 원래 위치 오차는
//    위치 공급자(현재 kepler.js의 JPL Table 1 근사식, 향후 Horizons/SPICE)가 결정한다.

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const DAY_MS = 86_400_000;
export const J2000_JD = 2_451_545.0;
export const J2000_OBLIQUITY_DEG = 23.439291111;

export const ORIGIN = Object.freeze({
  SUN: 'sun',
  SOLAR_SYSTEM_BARYCENTER: 'solar-system-barycenter',
  EARTH: 'earth',
  OBSERVER: 'observer',
});

export const ORIENTATION = Object.freeze({
  ECLIPTIC_J2000: 'ecliptic-j2000',
  ICRF_J2000: 'icrf-j2000',
  GALACTIC_ICRS: 'galactic-icrs',
  HORIZONTAL_GEOMETRIC: 'horizontal-geometric',
});

export const UNIT = Object.freeze({
  AU: 'AU',
  KM: 'km',
  M: 'm',
  UNIT_VECTOR: 'unit-vector',
});

export const FRAME = Object.freeze({
  HELIOCENTRIC_ECLIPTIC_J2000: Object.freeze({
    origin: ORIGIN.SUN,
    orientation: ORIENTATION.ECLIPTIC_J2000,
    unit: UNIT.AU,
  }),
  GEOCENTRIC_ECLIPTIC_J2000: Object.freeze({
    origin: ORIGIN.EARTH,
    orientation: ORIENTATION.ECLIPTIC_J2000,
    unit: UNIT.AU,
  }),
  GEOCENTRIC_ICRF_J2000: Object.freeze({
    origin: ORIGIN.EARTH,
    orientation: ORIENTATION.ICRF_J2000,
    unit: UNIT.AU,
  }),
  GALACTIC_DIRECTION: Object.freeze({
    origin: ORIGIN.OBSERVER,
    orientation: ORIENTATION.GALACTIC_ICRS,
    unit: UNIT.UNIT_VECTOR,
  }),
  HORIZONTAL_DIRECTION: Object.freeze({
    origin: ORIGIN.OBSERVER,
    orientation: ORIENTATION.HORIZONTAL_GEOMETRIC,
    unit: UNIT.UNIT_VECTOR,
  }),
});

const EPSILON = J2000_OBLIQUITY_DEG * DEG2RAD;
const COS_EPSILON = Math.cos(EPSILON);
const SIN_EPSILON = Math.sin(EPSILON);

// ICRS/J2000 equatorial -> Galactic rotation matrix.
// Standard matrix used by the Hipparcos/IAU realization of Galactic coordinates.
const ICRF_TO_GALACTIC = Object.freeze([
  Object.freeze([-0.0548755604, -0.8734370902, -0.4838350155]),
  Object.freeze([ 0.4941094279, -0.4448296300,  0.7469822445]),
  Object.freeze([-0.8676661490, -0.1980763734,  0.4559837762]),
]);
const GALACTIC_TO_ICRF = Object.freeze([
  Object.freeze([ICRF_TO_GALACTIC[0][0], ICRF_TO_GALACTIC[1][0], ICRF_TO_GALACTIC[2][0]]),
  Object.freeze([ICRF_TO_GALACTIC[0][1], ICRF_TO_GALACTIC[1][1], ICRF_TO_GALACTIC[2][1]]),
  Object.freeze([ICRF_TO_GALACTIC[0][2], ICRF_TO_GALACTIC[1][2], ICRF_TO_GALACTIC[2][2]]),
]);

export function finiteVector(value, label = 'VECTOR') {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))
      || !Number.isFinite(Number(value.z))) {
    throw new RangeError(`${label}_MUST_BE_FINITE_XYZ`);
  }
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}

export function vectorLength(value) {
  const v = finiteVector(value);
  return Math.hypot(v.x, v.y, v.z);
}

export function normalizeVector(value) {
  const v = finiteVector(value);
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 0)) throw new RangeError('ZERO_VECTOR_HAS_NO_DIRECTION');
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

export function addVectors(a, b) {
  const left = finiteVector(a, 'LEFT_VECTOR');
  const right = finiteVector(b, 'RIGHT_VECTOR');
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function subtractVectors(a, b) {
  const left = finiteVector(a, 'LEFT_VECTOR');
  const right = finiteVector(b, 'RIGHT_VECTOR');
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function scaleVector(value, scale) {
  const v = finiteVector(value);
  const factor = Number(scale);
  if (!Number.isFinite(factor)) throw new RangeError('FINITE_SCALE_REQUIRED');
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

function applyMatrix(matrix, value) {
  const v = finiteVector(value);
  return {
    x: matrix[0][0] * v.x + matrix[0][1] * v.y + matrix[0][2] * v.z,
    y: matrix[1][0] * v.x + matrix[1][1] * v.y + matrix[1][2] * v.z,
    z: matrix[2][0] * v.x + matrix[2][1] * v.y + matrix[2][2] * v.z,
  };
}

export function eclipticToIcrf(value) {
  const v = finiteVector(value);
  return {
    x: v.x,
    y: COS_EPSILON * v.y - SIN_EPSILON * v.z,
    z: SIN_EPSILON * v.y + COS_EPSILON * v.z,
  };
}

export function icrfToEcliptic(value) {
  const v = finiteVector(value);
  return {
    x: v.x,
    y: COS_EPSILON * v.y + SIN_EPSILON * v.z,
    z: -SIN_EPSILON * v.y + COS_EPSILON * v.z,
  };
}

export function icrfToGalactic(value) {
  return applyMatrix(ICRF_TO_GALACTIC, value);
}

export function galacticToIcrf(value) {
  return applyMatrix(GALACTIC_TO_ICRF, value);
}

export function eclipticToGalactic(value) {
  return icrfToGalactic(eclipticToIcrf(value));
}

export function galacticToEcliptic(value) {
  return icrfToEcliptic(galacticToIcrf(value));
}

export function transformOrientation(value, from, to) {
  if (from === to) return finiteVector(value);
  if (from === ORIENTATION.HORIZONTAL_GEOMETRIC || to === ORIENTATION.HORIZONTAL_GEOMETRIC) {
    throw new RangeError('HORIZONTAL_TRANSFORM_REQUIRES_TIME_AND_OBSERVER');
  }
  let icrf;
  if (from === ORIENTATION.ICRF_J2000) icrf = finiteVector(value);
  else if (from === ORIENTATION.ECLIPTIC_J2000) icrf = eclipticToIcrf(value);
  else if (from === ORIENTATION.GALACTIC_ICRS) icrf = galacticToIcrf(value);
  else throw new RangeError(`UNSUPPORTED_SOURCE_ORIENTATION:${from}`);

  if (to === ORIENTATION.ICRF_J2000) return icrf;
  if (to === ORIENTATION.ECLIPTIC_J2000) return icrfToEcliptic(icrf);
  if (to === ORIENTATION.GALACTIC_ICRS) return icrfToGalactic(icrf);
  throw new RangeError(`UNSUPPORTED_TARGET_ORIENTATION:${to}`);
}

export function relativePosition(target, center) {
  return subtractVectors(target, center);
}

export function wrap360(value) {
  return ((Number(value) % 360) + 360) % 360;
}

export function wrap180(value) {
  const wrapped = wrap360(value);
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

export function vectorFromRaDec(raDeg, decDeg, radius = 1) {
  const ra = Number(raDeg);
  const dec = Number(decDeg);
  const r = Number(radius);
  if (!Number.isFinite(ra) || ra < 0 || ra >= 360) throw new RangeError('RA_OUT_OF_RANGE');
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) throw new RangeError('DEC_OUT_OF_RANGE');
  if (!Number.isFinite(r) || r < 0) throw new RangeError('RADIUS_OUT_OF_RANGE');
  const raRad = ra * DEG2RAD;
  const decRad = dec * DEG2RAD;
  const cosDec = Math.cos(decRad);
  return {
    x: r * cosDec * Math.cos(raRad),
    y: r * cosDec * Math.sin(raRad),
    z: r * Math.sin(decRad),
  };
}

export function raDecFromVector(value) {
  const v = finiteVector(value);
  const distance = Math.hypot(v.x, v.y, v.z);
  if (!(distance > 0)) throw new RangeError('ZERO_VECTOR_HAS_NO_RA_DEC');
  return {
    raDeg: wrap360(Math.atan2(v.y, v.x) * RAD2DEG),
    decDeg: Math.asin(v.z / distance) * RAD2DEG,
    distance,
  };
}

export function vectorFromGalactic(lDeg, bDeg, radius = 1) {
  const longitude = Number(lDeg);
  const latitude = Number(bDeg);
  const r = Number(radius);
  if (!Number.isFinite(longitude)) throw new RangeError('GALACTIC_LONGITUDE_REQUIRED');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('GALACTIC_LATITUDE_OUT_OF_RANGE');
  }
  if (!Number.isFinite(r) || r < 0) throw new RangeError('RADIUS_OUT_OF_RANGE');
  const l = wrap360(longitude) * DEG2RAD;
  const b = latitude * DEG2RAD;
  const cosB = Math.cos(b);
  return { x: r * cosB * Math.cos(l), y: r * cosB * Math.sin(l), z: r * Math.sin(b) };
}

export function galacticLonLatFromVector(value) {
  const v = finiteVector(value);
  const distance = Math.hypot(v.x, v.y, v.z);
  if (!(distance > 0)) throw new RangeError('ZERO_VECTOR_HAS_NO_GALACTIC_DIRECTION');
  return {
    lDeg: wrap360(Math.atan2(v.y, v.x) * RAD2DEG),
    bDeg: Math.asin(v.z / distance) * RAD2DEG,
    distance,
  };
}

export function julianDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_DATE_REQUIRED');
  return date.getTime() / DAY_MS + 2_440_587.5;
}

export function gmstDegrees(value) {
  const jd = julianDate(value);
  const centuries = (jd - J2000_JD) / 36_525;
  return wrap360(280.46061837
    + 360.98564736629 * (jd - J2000_JD)
    + 0.000387933 * centuries * centuries
    - centuries * centuries * centuries / 38_710_000);
}

export function normalizeObserver(observer) {
  const lat = Number(observer?.lat);
  const lon = Number(observer?.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError('OBSERVER_LAT_OUT_OF_RANGE');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new RangeError('OBSERVER_LON_OUT_OF_RANGE');
  return { lat, lon };
}

// 입력 RA/Dec는 "해당 시각의 적도/분점" 기준이어야 한다. ICRF/J2000 값을 넣을 때는
// 호출자가 먼저 세차/장동 정책을 적용해야 한다. astronomy.js가 이 계약을 지킨다.
export function equatorialToHorizontal({ raDeg, decDeg, observer, at }) {
  const site = normalizeObserver(observer);
  const date = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_UTC_REQUIRED');
  const ra = Number(raDeg);
  const dec = Number(decDeg);
  if (!Number.isFinite(ra)) throw new RangeError('RA_REQUIRED');
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) throw new RangeError('DEC_OUT_OF_RANGE');
  const latitude = site.lat * DEG2RAD;
  const declination = dec * DEG2RAD;
  const hourAngleDeg = wrap180(gmstDegrees(date) + site.lon - ra);
  const hourAngle = hourAngleDeg * DEG2RAD;
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude),
  ) * RAD2DEG + 180;
  return Object.freeze({
    altitudeDeg: altitude * RAD2DEG,
    azimuthDeg: wrap360(azimuth),
    hourAngleDeg,
    frame: ORIENTATION.HORIZONTAL_GEOMETRIC,
  });
}

export function horizontalToEnu({ altitudeDeg, azimuthDeg }) {
  const altitude = Number(altitudeDeg) * DEG2RAD;
  const azimuth = Number(azimuthDeg) * DEG2RAD;
  if (!Number.isFinite(altitude) || altitude < -Math.PI / 2 || altitude > Math.PI / 2) {
    throw new RangeError('ALTITUDE_OUT_OF_RANGE');
  }
  if (!Number.isFinite(azimuth)) throw new RangeError('AZIMUTH_REQUIRED');
  const cosAltitude = Math.cos(altitude);
  // ENU: x=east, y=north, z=up. Azimuth: north=0, east=90.
  return {
    x: cosAltitude * Math.sin(azimuth),
    y: cosAltitude * Math.cos(azimuth),
    z: Math.sin(altitude),
  };
}

// Three.js는 y-up을 쓰므로 물리 좌표의 +z를 화면 +y로 옮긴다.
// +y를 -z로 보내 오른손성을 유지한다. 이 함수 전에는 절대 시각 압축/기울기를 섞지 않는다.
export function toAetherusRender(value) {
  const v = finiteVector(value);
  return { x: v.x, y: v.z, z: -v.y };
}

export function fromAetherusRender(value) {
  const v = finiteVector(value);
  return { x: v.x, y: -v.z, z: v.y };
}

export function radialDisplayVector(value, displayRadius) {
  const v = finiteVector(value);
  const radius = Math.hypot(v.x, v.y, v.z);
  if (!(radius > 0)) return { x: 0, y: 0, z: 0 };
  const targetRadius = typeof displayRadius === 'function' ? Number(displayRadius(radius)) : Number(displayRadius);
  if (!Number.isFinite(targetRadius) || targetRadius < 0) throw new RangeError('DISPLAY_RADIUS_OUT_OF_RANGE');
  return scaleVector(v, targetRadius / radius);
}

export function taggedPosition(value, {
  origin,
  orientation,
  unit,
  at = null,
  provider = null,
  precision = null,
} = {}) {
  const v = finiteVector(value);
  if (!origin || !Object.values(ORIGIN).includes(origin)) throw new RangeError('KNOWN_ORIGIN_REQUIRED');
  if (!orientation || !Object.values(ORIENTATION).includes(orientation)) throw new RangeError('KNOWN_ORIENTATION_REQUIRED');
  if (!unit || !Object.values(UNIT).includes(unit)) throw new RangeError('KNOWN_UNIT_REQUIRED');
  const utc = at == null ? null : new Date(at).toISOString();
  return Object.freeze({ ...v, frame: Object.freeze({ origin, orientation, unit }), at: utc, provider, precision });
}

// 개발/CI용 순수 수학 점검. 브라우저 상태나 Cesium에 의존하지 않는다.
export function coordinateSelfTest(tolerance = 2e-9) {
  const seed = normalizeVector({ x: 0.27, y: -0.81, z: 0.43 });
  const eclipticRoundTrip = galacticToEcliptic(eclipticToGalactic(seed));
  const renderRoundTrip = fromAetherusRender(toAetherusRender(seed));
  const maxError = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  const eclipticError = maxError(seed, eclipticRoundTrip);
  const renderError = maxError(seed, renderRoundTrip);
  const galacticCenter = galacticLonLatFromVector(icrfToGalactic(vectorFromRaDec(266.4051, -28.936175)));
  const centerAngularErrorDeg = Math.hypot(wrap180(galacticCenter.lDeg), galacticCenter.bDeg);
  return Object.freeze({
    ok: eclipticError <= tolerance && renderError <= tolerance && centerAngularErrorDeg < 0.01,
    eclipticRoundTripError: eclipticError,
    renderRoundTripError: renderError,
    galacticCenterAngularErrorDeg: centerAngularErrorDeg,
  });
}
