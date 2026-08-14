// Aetherus SatelliteObject v1 local shadow (Sheets 91-101).
// Validates provider/calculated products; it does not fetch TLEs, propagate or invent a live position/pass.

export const SATELLITE_OBJECT_SCHEMA = 'earthus.aetherus-satellite-object.v1';
export const SATELLITE_POLICY_SCHEMA = 'earthus.aetherus-satellite-policy.v1';
export const SATELLITE_STATUS = Object.freeze(['ACTIVE', 'INACTIVE', 'DECAYED', 'LOST', 'UNKNOWN']);
export const ORBIT_CLASS = Object.freeze(['LEO', 'MEO', 'GEO', 'HEO', 'UNKNOWN']);

export class SatelliteContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'SatelliteContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new SatelliteContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:~-]{1,180}$/.test(output), code); return output;
};
const text = (value, code, max = 500) => {
  const output = String(value || '').trim(); requireValue(output && output.length <= max, code); return output;
};
const utc = (value, code = 'SATELLITE_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
const https = (value, code) => {
  let parsed; try { parsed = new URL(value); } catch { fail(code); }
  requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password, code);
  return parsed.toString();
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function evidence(value, prefix) {
  requireValue(['OFFICIAL', 'CURATED'].includes(value?.authority), `${prefix}_AUTHORITY_REQUIRED`);
  return freeze({ authority: value.authority, sourceId: token(value.sourceId, `${prefix}_SOURCE_REQUIRED`),
    providerObjectId: token(value.providerObjectId, `${prefix}_OBJECT_REQUIRED`),
    sourceUrl: https(value.sourceUrl, `${prefix}_URL_INVALID`), assertedAt: utc(value.assertedAt) });
}

export function validateSatellitePolicy(raw) {
  requireValue(raw?.schema === SATELLITE_POLICY_SCHEMA, 'SATELLITE_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw?.status), 'SATELLITE_POLICY_STATUS_INVALID');
  const freshness = raw?.orbitFreshness || {};
  requireValue(Number.isInteger(freshness.freshSeconds) && freshness.freshSeconds >= 0
    && Number.isInteger(freshness.staleSeconds) && freshness.staleSeconds >= freshness.freshSeconds
    && Number.isInteger(freshness.maxUseSeconds) && freshness.maxUseSeconds >= freshness.staleSeconds,
  'SATELLITE_FRESHNESS_POLICY_INVALID');
  if (raw.productionEnabled === true) {
    requireValue(raw.status === 'APPROVED' && raw.approvedAt && raw.approvedBy,
      'SATELLITE_PRODUCTION_POLICY_NOT_APPROVED');
  }
  return freeze({ schema: SATELLITE_POLICY_SCHEMA, revision: String(raw.revision || ''),
    status: raw.status, productionEnabled: raw.productionEnabled === true,
    orbitFreshness: { ...freshness }, approvedAt: raw.approvedAt ? utc(raw.approvedAt) : null,
    approvedBy: raw.approvedBy ? token(raw.approvedBy, 'SATELLITE_APPROVER_INVALID') : null });
}

function normalizeOrbit(value) {
  requireValue(ORBIT_CLASS.includes(value?.orbitClass), 'SATELLITE_ORBIT_CLASS_INVALID');
  const epoch = utc(value.epoch), inclinationDeg = Number(value.inclinationDeg),
    eccentricity = Number(value.eccentricity), periodMinutes = Number(value.periodMinutes);
  requireValue(Number.isFinite(inclinationDeg) && inclinationDeg >= 0 && inclinationDeg <= 180
    && Number.isFinite(eccentricity) && eccentricity >= 0 && eccentricity < 1
    && Number.isFinite(periodMinutes) && periodMinutes > 0, 'SATELLITE_ORBIT_ELEMENTS_INVALID');
  return freeze({ revision: token(value.revision, 'SATELLITE_ORBIT_REVISION_REQUIRED'), epoch,
    orbitClass: value.orbitClass, classificationSource: evidence(value.classificationSource,
      'SATELLITE_ORBIT_CLASSIFICATION'), inclinationDeg, eccentricity, periodMinutes,
    tleLine1: text(value.tleLine1, 'SATELLITE_TLE_LINE1_REQUIRED', 100),
    tleLine2: text(value.tleLine2, 'SATELLITE_TLE_LINE2_REQUIRED', 100),
    source: evidence(value.source, 'SATELLITE_ORBIT') });
}

export function normalizeSatelliteObject(raw) {
  const noradId = String(raw?.noradId || '');
  requireValue(/^\d{1,9}$/.test(noradId), 'SATELLITE_NORAD_ID_INVALID');
  requireValue(/^\d{4}-\d{3}[A-Z]{1,3}$/.test(String(raw?.internationalDesignator || '')),
    'SATELLITE_INTERNATIONAL_DESIGNATOR_INVALID');
  requireValue(SATELLITE_STATUS.includes(raw?.status), 'SATELLITE_STATUS_INVALID');
  requireValue(Array.isArray(raw.missionTypes) && raw.missionTypes.length > 0
    && raw.missionTypes.every(value => /^[A-Z_]{2,40}$/.test(value)),
  'SATELLITE_MISSION_TYPES_INVALID');
  const launchHistory = (raw.launchHistory || []).map(item => freeze({
    launchEventId: token(item.launchEventId, 'SATELLITE_LAUNCH_EVENT_ID_REQUIRED'),
    launchedAt: utc(item.launchedAt), source: evidence(item.source, 'SATELLITE_LAUNCH_HISTORY') }));
  return freeze({ schema: SATELLITE_OBJECT_SCHEMA, id: token(raw.id, 'SATELLITE_ID_REQUIRED'),
    noradId, internationalDesignator: raw.internationalDesignator,
    name: text(raw.name, 'SATELLITE_NAME_REQUIRED'), aliases: freeze((raw.aliases || []).map(alias =>
      text(alias, 'SATELLITE_ALIAS_INVALID', 200))), status: raw.status,
    statusEvidence: evidence(raw.statusEvidence, 'SATELLITE_STATUS'), orbit: normalizeOrbit(raw.orbit),
    missionTypes: freeze([...new Set(raw.missionTypes)]),
    operator: text(raw.operator, 'SATELLITE_OPERATOR_REQUIRED'),
    countryCode: token(raw.countryCode, 'SATELLITE_COUNTRY_REQUIRED'),
    constellation: raw.constellation ? token(raw.constellation, 'SATELLITE_CONSTELLATION_INVALID') : null,
    launchHistory: freeze(launchHistory) });
}

export function evaluateOrbitFreshness(satellite, { policy, nowMs = Date.now() } = {}) {
  const normalizedPolicy = validateSatellitePolicy(policy);
  requireValue(normalizedPolicy.status === 'APPROVED', 'SATELLITE_FRESHNESS_POLICY_NOT_APPROVED');
  const ageSeconds = Math.floor((nowMs - Date.parse(satellite.orbit.epoch)) / 1000);
  requireValue(ageSeconds >= -300, 'SATELLITE_ORBIT_FUTURE_EPOCH');
  const ranges = normalizedPolicy.orbitFreshness;
  const status = ageSeconds <= ranges.freshSeconds ? 'FRESH'
    : ageSeconds <= ranges.staleSeconds ? 'STALE'
      : ageSeconds <= ranges.maxUseSeconds ? 'EXPIRED_WARNING' : 'UNUSABLE';
  return freeze({ status, ageSeconds, usable: status !== 'UNUSABLE',
    liveClaimAllowed: false, policyRevision: normalizedPolicy.revision });
}

function normalizeCalculatedPoint(point) {
  const lat = Number(point.lat), lon = Number(point.lon), altitudeKm = Number(point.altitudeKm);
  requireValue(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon)
    && lon >= -180 && lon <= 180 && Number.isFinite(altitudeKm) && altitudeKm >= 0,
  'SATELLITE_CALCULATED_POINT_INVALID');
  return freeze({ at: utc(point.at), lat, lon, altitudeKm });
}

export function normalizeSatellitePosition(raw, { satellite, freshness } = {}) {
  requireValue(raw?.satelliteId === satellite?.id, 'SATELLITE_POSITION_OBJECT_MISMATCH');
  requireValue(raw?.sourceOrbitRevision === satellite.orbit.revision,
    'SATELLITE_POSITION_ORBIT_REVISION_MISMATCH');
  requireValue(freshness?.usable === true, 'SATELLITE_POSITION_ORBIT_UNUSABLE');
  const point = normalizeCalculatedPoint(raw);
  return freeze({ schema: 'earthus.aetherus-satellite-position.v1', satelliteId: satellite.id,
    ...point, calculatedAt: utc(raw.calculatedAt), sourceOrbitRevision: satellite.orbit.revision,
    sourceOrbitEpoch: satellite.orbit.epoch,
    propagatorRevision: token(raw.propagatorRevision, 'SATELLITE_PROPAGATOR_REVISION_REQUIRED'),
    provenance: 'CALCULATED_FROM_ORBIT_ELEMENTS', liveClaimAllowed: false,
    freshness });
}

export function normalizeGroundTrack(raw, { satellite, freshness } = {}) {
  requireValue(raw?.satelliteId === satellite?.id && Array.isArray(raw.points) && raw.points.length > 1,
    'SATELLITE_GROUND_TRACK_INVALID');
  requireValue(raw.sourceOrbitRevision === satellite.orbit.revision,
    'SATELLITE_GROUND_TRACK_ORBIT_REVISION_MISMATCH');
  requireValue(freshness?.usable === true, 'SATELLITE_GROUND_TRACK_ORBIT_UNUSABLE');
  const points = raw.points.map(normalizeCalculatedPoint);
  requireValue(points.every((point, index) => index === 0
    || Date.parse(point.at) >= Date.parse(points[index - 1].at)), 'SATELLITE_GROUND_TRACK_ORDER_INVALID');
  return freeze({ schema: 'earthus.aetherus-ground-track.v1', satelliteId: satellite.id,
    sourceOrbitRevision: satellite.orbit.revision, points,
    provenance: 'CALCULATED_FROM_ORBIT_ELEMENTS', interpolation: 'NONE', liveClaimAllowed: false });
}

export function normalizeNextPass(raw, { satellite, freshness } = {}) {
  requireValue(raw?.satelliteId === satellite?.id && raw?.sourceOrbitRevision === satellite.orbit.revision,
    'SATELLITE_PASS_ORBIT_MISMATCH');
  requireValue(freshness?.usable === true, 'SATELLITE_PASS_ORBIT_UNUSABLE');
  requireValue(raw.locationRef && !('lat' in raw) && !('lon' in raw),
    'SATELLITE_PASS_PRIVATE_LOCATION_REF_REQUIRED');
  const startsAt = utc(raw.startsAt), peaksAt = utc(raw.peaksAt), endsAt = utc(raw.endsAt);
  requireValue(Date.parse(startsAt) <= Date.parse(peaksAt) && Date.parse(peaksAt) <= Date.parse(endsAt),
    'SATELLITE_PASS_TIME_ORDER_INVALID');
  const maxElevationDeg = Number(raw.maxElevationDeg);
  requireValue(Number.isFinite(maxElevationDeg) && maxElevationDeg >= 0 && maxElevationDeg <= 90,
    'SATELLITE_PASS_ELEVATION_INVALID');
  return freeze({ schema: 'earthus.aetherus-satellite-pass.v1', satelliteId: satellite.id,
    locationRef: token(raw.locationRef, 'SATELLITE_LOCATION_REF_INVALID'), startsAt, peaksAt, endsAt,
    maxElevationDeg, visibility: ['GEOMETRIC', 'OPTICAL_CANDIDATE', 'NOT_VISIBLE'].includes(raw.visibility)
      ? raw.visibility : 'GEOMETRIC', sourceOrbitRevision: satellite.orbit.revision,
    provenance: 'PREDICTED_FROM_ORBIT_AND_PRIVATE_LOCATION', observed: false, liveClaimAllowed: false });
}

export function satelliteFilterMembership(satellite) {
  return freeze({
    STARLINK: satellite.constellation === 'STARLINK',
    KOREA: satellite.countryCode === 'KR',
    SCIENCE: satellite.missionTypes.includes('SCIENCE'),
    WEATHER: satellite.missionTypes.includes('WEATHER'),
  });
}

export function buildSatelliteInfo(satellite, { position = null, nextPass = null } = {}) {
  return freeze({ schema: 'earthus.aetherus-satellite-info.v1', id: satellite.id,
    name: satellite.name, aliases: satellite.aliases, noradId: satellite.noradId,
    internationalDesignator: satellite.internationalDesignator, status: satellite.status,
    statusEvidence: satellite.statusEvidence, orbitClass: satellite.orbit.orbitClass,
    orbitEpoch: satellite.orbit.epoch, missionTypes: satellite.missionTypes,
    operator: satellite.operator, countryCode: satellite.countryCode,
    launchHistory: satellite.launchHistory, position, nextPass,
    positionIsLive: false, missingPositionReason: position ? null : 'NO_USABLE_CALCULATED_POSITION' });
}
