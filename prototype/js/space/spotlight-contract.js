// Aetherus National/Organization Spotlight local shadow (Sheets 102-114).
// The module validates curated records; it never fetches or infers missions, landings or milestones.

export const SPOTLIGHT_POLICY_SCHEMA = 'earthus.aetherus-spotlight-policy.v1';
export const LANDING_STATUS = Object.freeze(['LANDED', 'SPLASHDOWN', 'EXPENDED', 'FAILED', 'UNKNOWN']);

export class SpotlightContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'SpotlightContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new SpotlightContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,159}$/.test(output), code); return output;
};
const text = (value, code, max = 500) => {
  const output = String(value || '').trim(); requireValue(output && output.length <= max, code);
  return output;
};
const utc = (value, code = 'SPOTLIGHT_UTC_REQUIRED') => {
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
function evidence(raw, code) {
  requireValue(['OFFICIAL', 'CURATED'].includes(raw?.authority), `${code}_AUTHORITY_REQUIRED`);
  return freeze({ authority: raw.authority, sourceId: token(raw.sourceId, `${code}_SOURCE_REQUIRED`),
    sourceUrl: https(raw.sourceUrl, `${code}_URL_INVALID`), assertedAt: utc(raw.assertedAt) });
}

export function validateSpotlightPolicy(raw) {
  requireValue(raw?.schema === SPOTLIGHT_POLICY_SCHEMA, 'SPOTLIGHT_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'SPOTLIGHT_POLICY_STATUS_INVALID');
  requireValue(Array.isArray(raw.hubs) && raw.hubs.length > 0, 'SPOTLIGHT_HUB_REGISTRY_REQUIRED');
  const hubs = raw.hubs.map(hub => {
    requireValue(/^[A-Z]{2}$/.test(hub.countryCode), 'SPOTLIGHT_COUNTRY_CODE_INVALID');
    requireValue(['COUNTRY', 'ORGANIZATION'].includes(hub.kind), 'SPOTLIGHT_HUB_KIND_INVALID');
    return freeze({ id: token(hub.id, 'SPOTLIGHT_HUB_ID_INVALID'), kind: hub.kind,
      countryCode: hub.countryCode, organizationId: hub.organizationId
        ? token(hub.organizationId, 'SPOTLIGHT_ORGANIZATION_ID_INVALID') : null,
      localePriority: [...new Set((hub.localePriority || []).map(locale => {
        requireValue(/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale), 'SPOTLIGHT_LOCALE_INVALID'); return locale;
      }))] });
  });
  if (raw.productionEnabled === true) requireValue(raw.status === 'APPROVED'
    && raw.approvedAt && raw.approvedBy, 'SPOTLIGHT_PRODUCTION_POLICY_NOT_APPROVED');
  return freeze({ schema: SPOTLIGHT_POLICY_SCHEMA, revision: token(raw.revision,
    'SPOTLIGHT_POLICY_REVISION_INVALID'), status: raw.status,
    productionEnabled: raw.productionEnabled === true, hubs,
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

export function normalizeSpotlightMission(raw) {
  requireValue(['NURI', 'CUBESAT', 'FALCON_9', 'FALCON_HEAVY', 'STARSHIP', 'OTHER']
    .includes(raw?.missionFamily), 'SPOTLIGHT_MISSION_FAMILY_INVALID');
  requireValue(['SCHEDULED', 'DELAYED', 'HOLD', 'SCRUBBED', 'LIVE', 'ASCENT',
    'ORBIT_INSERTION', 'PAYLOAD_DEPLOYMENT', 'SUCCESS', 'FAILED'].includes(raw.status),
  'SPOTLIGHT_MISSION_STATUS_INVALID');
  return freeze({ schema: 'earthus.aetherus-spotlight-mission.v1',
    id: token(raw.id, 'SPOTLIGHT_MISSION_ID_INVALID'),
    launchEventId: token(raw.launchEventId, 'SPOTLIGHT_LAUNCH_EVENT_ID_REQUIRED'),
    hubId: token(raw.hubId, 'SPOTLIGHT_MISSION_HUB_ID_REQUIRED'),
    missionFamily: raw.missionFamily, name: text(raw.name, 'SPOTLIGHT_MISSION_NAME_REQUIRED'),
    status: raw.status, statusEvidence: evidence(raw.statusEvidence, 'SPOTLIGHT_MISSION_STATUS'),
    payloadIds: freeze([...new Set((raw.payloadIds || []).map(id => token(id,
      'SPOTLIGHT_PAYLOAD_ID_INVALID')))]),
    satelliteIds: freeze([...new Set((raw.satelliteIds || []).map(id => token(id,
      'SPOTLIGHT_SATELLITE_ID_INVALID')))]),
    officialUrl: https(raw.officialUrl, 'SPOTLIGHT_MISSION_OFFICIAL_URL_INVALID') });
}

export function normalizeBooster(raw) {
  requireValue(LANDING_STATUS.includes(raw?.landingStatus), 'SPOTLIGHT_LANDING_STATUS_INVALID');
  const flights = (raw.flights || []).map(flight => freeze({ launchEventId: token(flight.launchEventId,
    'SPOTLIGHT_BOOSTER_LAUNCH_ID_REQUIRED'), flownAt: utc(flight.flownAt),
  landingStatus: LANDING_STATUS.includes(flight.landingStatus) ? flight.landingStatus
    : fail('SPOTLIGHT_FLIGHT_LANDING_STATUS_INVALID'), evidence: evidence(flight.evidence,
    'SPOTLIGHT_BOOSTER_FLIGHT') }));
  requireValue(flights.every((flight, index) => index === 0
    || Date.parse(flight.flownAt) >= Date.parse(flights[index - 1].flownAt)),
  'SPOTLIGHT_BOOSTER_HISTORY_ORDER_INVALID');
  return freeze({ schema: 'earthus.aetherus-booster.v1', id: token(raw.id,
    'SPOTLIGHT_BOOSTER_ID_INVALID'), serial: token(raw.serial,
    'SPOTLIGHT_BOOSTER_SERIAL_INVALID'), landingStatus: raw.landingStatus,
  statusEvidence: evidence(raw.statusEvidence, 'SPOTLIGHT_BOOSTER_STATUS'), flights });
}

export function normalizeMilestone(raw) {
  requireValue(['STARSHIP_BOOSTER', 'STARSHIP_SHIP', 'STARLINK_DEPLOYMENT'].includes(raw?.track),
    'SPOTLIGHT_MILESTONE_TRACK_INVALID');
  requireValue(!raw.occurredAt || !raw.scheduledAt, 'SPOTLIGHT_MILESTONE_TIME_CONFLICT');
  return freeze({ schema: 'earthus.aetherus-milestone.v1', id: token(raw.id,
    'SPOTLIGHT_MILESTONE_ID_INVALID'), track: raw.track,
  title: text(raw.title, 'SPOTLIGHT_MILESTONE_TITLE_REQUIRED'),
  occurredAt: raw.occurredAt ? utc(raw.occurredAt) : null,
  scheduledAt: raw.scheduledAt ? utc(raw.scheduledAt) : null,
  observed: Boolean(raw.occurredAt), payloadIds: freeze((raw.payloadIds || []).map(id => token(id,
    'SPOTLIGHT_MILESTONE_PAYLOAD_ID_INVALID'))), evidence: evidence(raw.evidence,
    'SPOTLIGHT_MILESTONE_EVIDENCE') });
}

export function resolveSpotlightLocale(locale, hubId, { policy } = {}) {
  const normalized = validateSpotlightPolicy(policy);
  const hub = normalized.hubs.find(item => item.id === hubId);
  requireValue(hub, 'SPOTLIGHT_HUB_UNKNOWN');
  const requested = String(locale || '');
  const selected = hub.localePriority.includes(requested) ? requested : hub.localePriority[0] || 'en';
  return freeze({ hubId, requested, selected, fallbackUsed: selected !== requested });
}

export function normalizeSpotlightFollow(raw) {
  requireValue(['HUB', 'MISSION', 'SATELLITE', 'BOOSTER'].includes(raw?.targetType),
    'SPOTLIGHT_FOLLOW_TARGET_TYPE_INVALID');
  requireValue(typeof raw.enabled === 'boolean', 'SPOTLIGHT_FOLLOW_ENABLED_REQUIRED');
  return freeze({ schema: 'earthus.aetherus-spotlight-follow.v1', userRef: token(raw.userRef,
    'SPOTLIGHT_FOLLOW_USER_REF_REQUIRED'), targetType: raw.targetType,
  targetId: token(raw.targetId, 'SPOTLIGHT_FOLLOW_TARGET_ID_REQUIRED'), enabled: raw.enabled,
  historyVisible: raw.historyVisible === true, notificationRequested: false,
  notificationReason: 'EXTERNAL_NOTIFICATION_GATE_CLOSED', updatedAt: utc(raw.updatedAt) });
}

export function rankSpotlights(entries, { editorialOverrides = [] } = {}) {
  requireValue(Array.isArray(entries), 'SPOTLIGHT_RANKING_ENTRIES_INVALID');
  const overrideMap = new Map(editorialOverrides.map(override => {
    requireValue(Number.isInteger(override.position) && override.position > 0
      && override.reason && override.evidence, 'SPOTLIGHT_EDITORIAL_OVERRIDE_INVALID');
    return [override.id, { position: override.position, reason: text(override.reason,
      'SPOTLIGHT_EDITORIAL_REASON_REQUIRED'), evidence: evidence(override.evidence,
      'SPOTLIGHT_EDITORIAL_EVIDENCE') }];
  }));
  return freeze(entries.map(entry => {
    requireValue(Number.isFinite(entry.relevanceScore) && entry.relevanceScore >= 0,
      'SPOTLIGHT_RELEVANCE_SCORE_INVALID');
    return { id: token(entry.id, 'SPOTLIGHT_RANKING_ID_INVALID'),
      relevanceScore: entry.relevanceScore, override: overrideMap.get(entry.id) || null };
  }).sort((a, b) => (a.override?.position ?? Number.MAX_SAFE_INTEGER)
    - (b.override?.position ?? Number.MAX_SAFE_INTEGER)
    || b.relevanceScore - a.relevanceScore || a.id.localeCompare(b.id))
    .map((entry, index) => ({ ...entry, rank: index + 1, random: false })));
}
