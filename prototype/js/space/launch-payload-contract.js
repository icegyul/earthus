// Aetherus Launch/Payload v1 local shadow (Sheets 65-78, 82-90, QA 282-283).
// No schedule ingestion, telemetry fetch, notification dispatch, timers or trajectory interpolation.

export const LAUNCH_EVENT_SCHEMA = 'earthus.aetherus-launch-event.v1';
export const PAYLOAD_MANIFEST_SCHEMA = 'earthus.aetherus-payload-manifest.v1';
export const LAUNCH_STATES = Object.freeze([
  'SCHEDULED', 'DELAYED', 'HOLD', 'SCRUBBED', 'LIVE', 'ASCENT', 'ORBIT_INSERTION',
  'PAYLOAD_DEPLOYMENT', 'SUCCESS', 'FAILED',
]);
export const PAYLOAD_STATES = Object.freeze([
  'MANIFESTED', 'SEPARATION_PENDING', 'DEPLOYED', 'DEPLOYMENT_FAILED',
  'FIRST_CONTACT_PENDING', 'FIRST_CONTACT_SUCCESS', 'FIRST_CONTACT_FAILED', 'OPERATIONAL',
]);
const LAUNCH_TRANSITIONS = Object.freeze({
  SCHEDULED: ['DELAYED', 'HOLD', 'SCRUBBED', 'LIVE', 'FAILED'],
  DELAYED: ['SCHEDULED', 'HOLD', 'SCRUBBED', 'LIVE', 'FAILED'],
  HOLD: ['SCHEDULED', 'DELAYED', 'SCRUBBED', 'LIVE', 'FAILED'],
  SCRUBBED: [], LIVE: ['ASCENT', 'FAILED'], ASCENT: ['ORBIT_INSERTION', 'FAILED'],
  ORBIT_INSERTION: ['PAYLOAD_DEPLOYMENT', 'SUCCESS', 'FAILED'],
  PAYLOAD_DEPLOYMENT: ['SUCCESS', 'FAILED'], SUCCESS: [], FAILED: [],
});
const PAYLOAD_TRANSITIONS = Object.freeze({
  MANIFESTED: ['SEPARATION_PENDING', 'DEPLOYMENT_FAILED'],
  SEPARATION_PENDING: ['DEPLOYED', 'DEPLOYMENT_FAILED'],
  DEPLOYED: ['FIRST_CONTACT_PENDING'], DEPLOYMENT_FAILED: [],
  FIRST_CONTACT_PENDING: ['FIRST_CONTACT_SUCCESS', 'FIRST_CONTACT_FAILED'],
  FIRST_CONTACT_SUCCESS: ['OPERATIONAL'], FIRST_CONTACT_FAILED: [], OPERATIONAL: [],
});

export class LaunchPayloadError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'LaunchPayloadError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new LaunchPayloadError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:~-]{1,180}$/.test(output), code); return output;
};
const text = (value, code, max = 500) => {
  const output = String(value || '').trim(); requireValue(output && output.length <= max, code); return output;
};
const utc = (value, code = 'LAUNCH_UTC_REQUIRED') => {
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
function evidence(value, codePrefix = 'LAUNCH') {
  requireValue(value?.authority === 'OFFICIAL' || value?.authority === 'CURATED',
    `${codePrefix}_EVIDENCE_AUTHORITY_REQUIRED`);
  return freeze({ authority: value.authority,
    sourceId: token(value.sourceId, `${codePrefix}_EVIDENCE_SOURCE_REQUIRED`),
    providerObjectId: token(value.providerObjectId, `${codePrefix}_EVIDENCE_OBJECT_REQUIRED`),
    sourceUrl: https(value.sourceUrl, `${codePrefix}_EVIDENCE_URL_INVALID`),
    assertedAt: utc(value.assertedAt), observedAt: value.observedAt ? utc(value.observedAt) : null });
}

function normalizeSite(value) {
  const coordinates = value?.coordinates;
  requireValue(coordinates && Number.isFinite(Number(coordinates.lat))
    && Number.isFinite(Number(coordinates.lon)) && Number(coordinates.lat) >= -90
    && Number(coordinates.lat) <= 90 && Number(coordinates.lon) >= -180
    && Number(coordinates.lon) <= 180, 'LAUNCH_SITE_COORDINATES_INVALID');
  return freeze({ id: token(value.id, 'LAUNCH_SITE_ID_REQUIRED'),
    name: text(value.name, 'LAUNCH_SITE_NAME_REQUIRED'),
    coordinates: { lat: Number(coordinates.lat), lon: Number(coordinates.lon) },
    source: evidence(value.source, 'LAUNCH_SITE') });
}
function normalizeRocket(value) {
  return freeze({ id: token(value?.id, 'ROCKET_ID_REQUIRED'),
    family: text(value.family, 'ROCKET_FAMILY_REQUIRED'),
    vehicleVersion: text(value.vehicleVersion, 'LAUNCH_VEHICLE_VERSION_REQUIRED'),
    versionSource: evidence(value.versionSource, 'ROCKET_VERSION') });
}
function normalizeMission(value) {
  return freeze({ id: token(value?.id, 'MISSION_ID_REQUIRED'),
    name: text(value.name, 'MISSION_NAME_REQUIRED'),
    description: value.description ? text(value.description, 'MISSION_DESCRIPTION_INVALID', 1200) : null });
}
function normalizeWindow(value) {
  const opensAt = utc(value?.opensAt), closesAt = utc(value?.closesAt);
  requireValue(Date.parse(closesAt) >= Date.parse(opensAt), 'LAUNCH_WINDOW_INVALID');
  return freeze({ opensAt, closesAt, precision: ['EXACT', 'WINDOW', 'DATE_ONLY'].includes(value.precision)
    ? value.precision : 'WINDOW' });
}

export function normalizeLaunchEvent(raw) {
  requireValue(LAUNCH_STATES.includes(raw?.status), 'LAUNCH_STATUS_INVALID');
  const statusEvidence = evidence(raw.statusEvidence, 'LAUNCH_STATUS');
  const createdAt = utc(raw.createdAt), updatedAt = utc(raw.updatedAt);
  requireValue(Date.parse(updatedAt) >= Date.parse(createdAt), 'LAUNCH_UPDATE_BEFORE_CREATE');
  const history = Array.isArray(raw.history) && raw.history.length ? raw.history.map(item => freeze({
    from: item.from == null ? null : item.from, to: item.to, at: utc(item.at),
    evidence: evidence(item.evidence, 'LAUNCH_STATUS'),
  })) : [{ from: null, to: raw.status, at: updatedAt, evidence: statusEvidence }];
  requireValue(history.at(-1).to === raw.status, 'LAUNCH_HISTORY_STATUS_MISMATCH');
  const broadcast = raw.broadcast ? freeze({
    officialUrl: https(raw.broadcast.officialUrl, 'LAUNCH_BROADCAST_URL_INVALID'),
    delivery: raw.broadcast.delivery === 'EMBED' ? 'EMBED' : 'LINK', storedByEarthus: false,
    verifiedAt: utc(raw.broadcast.verifiedAt),
  }) : null;
  return freeze({ schema: LAUNCH_EVENT_SCHEMA, id: token(raw.id, 'LAUNCH_EVENT_ID_REQUIRED'),
    providerObjectId: token(raw.providerObjectId, 'LAUNCH_PROVIDER_OBJECT_REQUIRED'),
    status: raw.status, statusEvidence, site: normalizeSite(raw.site), rocket: normalizeRocket(raw.rocket),
    mission: normalizeMission(raw.mission), window: normalizeWindow(raw.window), broadcast,
    replacementLaunchEventId: raw.replacementLaunchEventId
      ? token(raw.replacementLaunchEventId, 'LAUNCH_REPLACEMENT_ID_INVALID') : null,
    createdAt, updatedAt, history: freeze(history) });
}

export function transitionLaunch(event, { to, at, statusEvidence } = {}) {
  requireValue(event?.schema === LAUNCH_EVENT_SCHEMA, 'LAUNCH_EVENT_REQUIRED');
  requireValue(LAUNCH_STATES.includes(to), 'LAUNCH_STATUS_INVALID');
  requireValue(LAUNCH_TRANSITIONS[event.status]?.includes(to), 'LAUNCH_TRANSITION_REJECTED',
    { from: event.status, to });
  const occurredAt = utc(at), normalizedEvidence = evidence(statusEvidence, 'LAUNCH_STATUS');
  requireValue(Date.parse(occurredAt) >= Date.parse(event.updatedAt), 'LAUNCH_TRANSITION_TIME_REVERSED');
  return freeze({ ...event, status: to, statusEvidence: normalizedEvidence, updatedAt: occurredAt,
    history: [...event.history, { from: event.status, to, at: occurredAt,
      evidence: normalizedEvidence }] });
}

export function linkReplacementLaunch(event, { replacementLaunchEventId, evidence: linkEvidence } = {}) {
  requireValue(event?.status === 'SCRUBBED', 'LAUNCH_REPLACEMENT_REQUIRES_SCRUBBED');
  const replacement = token(replacementLaunchEventId, 'LAUNCH_REPLACEMENT_ID_INVALID');
  requireValue(replacement !== event.id, 'LAUNCH_REPLACEMENT_SELF_REFERENCE');
  return freeze({ ...event, replacementLaunchEventId: replacement,
    replacementEvidence: evidence(linkEvidence, 'LAUNCH_REPLACEMENT') });
}

export function buildLaunchCountdown(event, nowMs = Date.now()) {
  requireValue(event?.schema === LAUNCH_EVENT_SCHEMA, 'LAUNCH_EVENT_REQUIRED');
  if (!['SCHEDULED', 'DELAYED'].includes(event.status)) return freeze({ state: event.status,
    targetAt: null, remainingSeconds: null, ownsTimer: false });
  const targetAt = event.window.opensAt;
  return freeze({ state: event.status, targetAt,
    remainingSeconds: Math.max(0, Math.floor((Date.parse(targetAt) - nowMs) / 1000)), ownsTimer: false });
}

export function normalizeLaunchTrajectory(raw) {
  requireValue(['PLANNED', 'LIVE_TELEMETRY', 'ESTIMATED', 'LAST_CONFIRMED'].includes(raw?.kind),
    'LAUNCH_TRAJECTORY_KIND_INVALID');
  const sourceEvidence = evidence(raw.sourceEvidence, 'LAUNCH_TRAJECTORY');
  if (raw.kind === 'LIVE_TELEMETRY') {
    requireValue(sourceEvidence.authority === 'OFFICIAL' && raw.freshness?.usable === true,
      'LAUNCH_LIVE_TELEMETRY_NOT_VERIFIED');
  }
  const points = (raw.points || []).map(point => {
    const lat = Number(point.lat), lon = Number(point.lon), altitudeKm = Number(point.altitudeKm);
    requireValue(Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon)
      && lon >= -180 && lon <= 180 && Number.isFinite(altitudeKm) && altitudeKm >= 0,
    'LAUNCH_TRAJECTORY_POINT_INVALID');
    return freeze({ at: utc(point.at), lat, lon, altitudeKm,
      confirmed: point.confirmed === true });
  });
  requireValue(points.length > 0 && points.every((point, index) => index === 0
    || Date.parse(point.at) >= Date.parse(points[index - 1].at)), 'LAUNCH_TRAJECTORY_ORDER_INVALID');
  return freeze({ schema: 'earthus.aetherus-launch-trajectory.v1',
    launchEventId: token(raw.launchEventId, 'LAUNCH_EVENT_ID_REQUIRED'), kind: raw.kind,
    sourceEvidence, freshness: raw.freshness || null, points,
    liveClaimAllowed: raw.kind === 'LIVE_TELEMETRY', interpolation: 'NONE' });
}

export function stopTrajectoryOnFailure(trajectory, { failedAt } = {}) {
  const at = utc(failedAt);
  const confirmed = trajectory.points.filter(point => point.confirmed && Date.parse(point.at) <= Date.parse(at));
  return freeze({ ...trajectory, kind: 'LAST_CONFIRMED', points: confirmed,
    liveClaimAllowed: false, stoppedAt: at, stopReason: 'CONFIRMED_LAUNCH_FAILURE', interpolation: 'NONE' });
}

function normalizePayload(raw) {
  requireValue(['PRIMARY', 'RIDESHARE', 'CUBESAT'].includes(raw?.role), 'PAYLOAD_ROLE_INVALID');
  requireValue(PAYLOAD_STATES.includes(raw?.status), 'PAYLOAD_STATUS_INVALID');
  const massKg = raw.massKg == null ? null : Number(raw.massKg);
  requireValue(massKg == null || (Number.isFinite(massKg) && massKg >= 0),
    'PAYLOAD_MASS_INVALID');
  return freeze({ id: token(raw.id, 'PAYLOAD_ID_REQUIRED'),
    missionId: token(raw.missionId, 'PAYLOAD_MISSION_ID_REQUIRED'),
    name: text(raw.name, 'PAYLOAD_NAME_REQUIRED'), role: raw.role, status: raw.status,
    statusEvidence: evidence(raw.statusEvidence, 'PAYLOAD_STATUS'),
    massKg,
    satelliteObjectId: raw.satelliteObjectId || null,
    history: freeze(Array.isArray(raw.history) && raw.history.length ? raw.history : [{
      from: null, to: raw.status, at: raw.statusEvidence.assertedAt,
    }]) });
}

export function normalizePayloadManifest(raw) {
  requireValue(raw?.schema === PAYLOAD_MANIFEST_SCHEMA, 'PAYLOAD_MANIFEST_SCHEMA_INVALID');
  const payloads = (raw.payloads || []).map(normalizePayload);
  requireValue(payloads.length > 0 && new Set(payloads.map(item => item.id)).size === payloads.length,
    'PAYLOAD_MANIFEST_INVALID');
  requireValue(payloads.filter(item => item.role === 'PRIMARY').length === 1,
    'PAYLOAD_PRIMARY_SINGLE_REQUIRED');
  const missionId = token(raw.missionId, 'PAYLOAD_MISSION_ID_REQUIRED');
  requireValue(payloads.every(item => item.missionId === missionId), 'PAYLOAD_MISSION_MISMATCH');
  return freeze({ schema: PAYLOAD_MANIFEST_SCHEMA,
    launchEventId: token(raw.launchEventId, 'LAUNCH_EVENT_ID_REQUIRED'), missionId,
    revision: Number(raw.revision), payloads, updatedAt: utc(raw.updatedAt) });
}

export function transitionPayload(payload, { to, at, statusEvidence } = {}) {
  requireValue(PAYLOAD_STATES.includes(to), 'PAYLOAD_STATUS_INVALID');
  requireValue(PAYLOAD_TRANSITIONS[payload?.status]?.includes(to), 'PAYLOAD_TRANSITION_REJECTED',
    { from: payload?.status, to });
  const occurredAt = utc(at), normalizedEvidence = evidence(statusEvidence, 'PAYLOAD_STATUS');
  requireValue(Date.parse(occurredAt) >= Date.parse(payload.history.at(-1).at),
    'PAYLOAD_TRANSITION_TIME_REVERSED');
  return freeze({ ...payload, status: to, statusEvidence: normalizedEvidence,
    history: [...payload.history, { from: payload.status, to, at: occurredAt }] });
}

export function matchPayloadToSatellite(payload, { satelliteObjectId, noradId,
  internationalDesignator, matchEvidence } = {}) {
  requireValue(['DEPLOYED', 'FIRST_CONTACT_PENDING', 'FIRST_CONTACT_SUCCESS', 'OPERATIONAL']
    .includes(payload?.status), 'PAYLOAD_SATELLITE_MATCH_STATE_INVALID');
  const norad = String(noradId || '');
  requireValue(/^\d{1,9}$/.test(norad), 'PAYLOAD_NORAD_ID_INVALID');
  requireValue(/^\d{4}-\d{3}[A-Z]{1,3}$/.test(String(internationalDesignator || '')),
    'PAYLOAD_INTERNATIONAL_DESIGNATOR_INVALID');
  const match = evidence(matchEvidence, 'PAYLOAD_SATELLITE_MATCH');
  requireValue(match.authority === 'OFFICIAL', 'PAYLOAD_SATELLITE_MATCH_OFFICIAL_REQUIRED');
  return freeze({ ...payload,
    satelliteObjectId: token(satelliteObjectId, 'SATELLITE_OBJECT_ID_REQUIRED'),
    satelliteMatch: { noradId: norad, internationalDesignator, evidence: match,
      matchedByInference: false } });
}

export function buildLaunchReplay(event, trajectories = []) {
  requireValue(event?.schema === LAUNCH_EVENT_SCHEMA, 'LAUNCH_EVENT_REQUIRED');
  const accepted = trajectories.filter(item => item.launchEventId === event.id)
    .map(item => item.kind === 'LIVE_TELEMETRY' && event.status === 'FAILED'
      ? stopTrajectoryOnFailure(item, { failedAt: event.updatedAt }) : item);
  return freeze({ schema: 'earthus.aetherus-launch-replay.v1', launchEventId: event.id,
    mode: 'MILESTONE_ONLY', interpolation: 'NONE', statusHistory: event.history,
    trajectories: accepted, automaticShareAllowed: false, notificationDispatchAllowed: false });
}
