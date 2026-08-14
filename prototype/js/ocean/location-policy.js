// Ocean 개인 위치 정책 — 정밀 좌표는 owner 전용이고 공유/공개 응답은 서버 정책으로 낮춘다.

export const OCEAN_LOCATION_POLICY_SCHEMA = 'earthus.ocean-location-policy.v1';
export const OCEAN_LOCATION_PRECISION = Object.freeze({
  EXACT: 'EXACT', BLURRED: 'BLURRED', REGION: 'REGION', NONE: 'NONE',
});
const AUDIENCES = new Set(['OWNER', 'SHARED', 'PUBLIC']);
const PRECISIONS = new Set(Object.values(OCEAN_LOCATION_PRECISION));

function validCoordinate(lat, lon) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
    && Number(lat) >= -90 && Number(lat) <= 90
    && Number(lon) >= -180 && Number(lon) <= 180;
}

export function validateOceanLocationPolicy(policy) {
  const errors = [];
  if (policy?.schema !== OCEAN_LOCATION_POLICY_SCHEMA) errors.push('LOCATION_POLICY_SCHEMA_INVALID');
  if (policy?.status !== 'APPROVED') errors.push('LOCATION_POLICY_NOT_APPROVED');
  if (policy?.serverEnforced !== true) errors.push('LOCATION_POLICY_NOT_SERVER_ENFORCED');
  for (const key of ['ownerPrecision', 'sharedPrecision', 'publicPrecision']) {
    if (!PRECISIONS.has(policy?.[key])) errors.push(`LOCATION_POLICY_PRECISION_INVALID:${key}`);
  }
  if (policy?.sharedPrecision === 'EXACT' || policy?.publicPrecision === 'EXACT') {
    errors.push('NON_OWNER_EXACT_LOCATION_FORBIDDEN');
  }
  if ([policy?.sharedPrecision, policy?.publicPrecision].includes('BLURRED')) {
    const step = Number(policy?.blurDegrees);
    if (!Number.isFinite(step) || step < 0.01 || step > 1) errors.push('BLUR_DEGREES_INVALID');
  }
  if (policy?.cacheControl !== 'private, no-store') errors.push('LOCATION_CACHE_MUST_BE_PRIVATE_NO_STORE');
  if (policy?.stripExifGps !== true) errors.push('EXIF_GPS_MUST_BE_STRIPPED');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

function precisionFor(policy, audience) {
  if (audience === 'OWNER') return policy.ownerPrecision;
  if (audience === 'SHARED') return policy.sharedPrecision;
  return policy.publicPrecision;
}

export function protectOceanLocation(location, {
  audience = 'PUBLIC', consent = false, policy = null,
} = {}) {
  const validation = validateOceanLocationPolicy(policy);
  if (!AUDIENCES.has(audience) || !validation.valid) return Object.freeze({
    schema: 'earthus.ocean-protected-location.v1', audience: AUDIENCES.has(audience) ? audience : 'PUBLIC',
    precision: 'NONE', coordinates: null, region: null, exactStored: false,
    cacheControl: 'private, no-store', exifGpsAllowed: false,
    reason: !validation.valid ? 'LOCATION_POLICY_BLOCKED' : 'AUDIENCE_INVALID',
  });
  const precision = precisionFor(policy, audience);
  const valid = validCoordinate(location?.lat, location?.lon);
  if (precision === 'EXACT' && audience === 'OWNER' && consent === true && valid) {
    return Object.freeze({ schema: 'earthus.ocean-protected-location.v1', audience,
      precision, coordinates: Object.freeze({ lat: Number(location.lat), lon: Number(location.lon) }),
      region: location?.region || null, exactStored: true,
      cacheControl: policy.cacheControl, exifGpsAllowed: false, reason: null });
  }
  if (precision === 'BLURRED' && valid) {
    const step = Number(policy.blurDegrees);
    const round = value => Math.round(Number(value) / step) * step;
    return Object.freeze({ schema: 'earthus.ocean-protected-location.v1', audience,
      precision, coordinates: Object.freeze({ lat: round(location.lat), lon: round(location.lon) }),
      region: location?.region || null, exactStored: false,
      cacheControl: policy.cacheControl, exifGpsAllowed: false, reason: 'DETERMINISTIC_GRID_BLUR' });
  }
  if (precision === 'REGION') return Object.freeze({
    schema: 'earthus.ocean-protected-location.v1', audience, precision,
    coordinates: null, region: location?.region || null, exactStored: false,
    cacheControl: policy.cacheControl, exifGpsAllowed: false, reason: null,
  });
  return Object.freeze({
    schema: 'earthus.ocean-protected-location.v1', audience, precision: 'NONE',
    coordinates: null, region: null, exactStored: false,
    cacheControl: policy.cacheControl, exifGpsAllowed: false,
    reason: precision === 'EXACT' ? 'OWNER_CONSENT_OR_COORDINATES_MISSING' : null,
  });
}
