// Earthus/Aetherus discovery contract local shadow (Sheets 43, 47, 50, 56, 61).
// Search and recommendations use explicit catalog evidence only; no facts are generated here.

export const DISCOVERY_POLICY_SCHEMA = 'earthus.discovery-policy.v1';
export const OBJECT_TYPES = Object.freeze(['EARTH_FEATURE', 'CONSTELLATION', 'SOLAR_SYSTEM_BODY',
  'STAR_CLUSTER', 'EXOPLANET', 'STAR', 'NEBULA', 'GALAXY', 'TELESCOPE_OBSERVATION']);

export class DiscoveryContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'DiscoveryContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new DiscoveryContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,159}$/.test(output), code); return output;
};
const text = (value, code, max = 300) => {
  const output = String(value || '').trim();
  requireValue(output && output.length <= max, code); return output;
};
const utc = (value, code = 'DISCOVERY_UTC_REQUIRED') => {
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

export function validateDiscoveryPolicy(raw) {
  requireValue(raw?.schema === DISCOVERY_POLICY_SCHEMA, 'DISCOVERY_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'DISCOVERY_POLICY_STATUS_INVALID');
  requireValue(Array.isArray(raw.telescopeProviders), 'DISCOVERY_TELESCOPE_REGISTRY_REQUIRED');
  const telescopeProviders = raw.telescopeProviders.map(provider => {
    requireValue(['DRAFT', 'APPROVED', 'DISABLED'].includes(provider.status),
      'DISCOVERY_TELESCOPE_PROVIDER_STATUS_INVALID');
    return freeze({ id: token(provider.id, 'DISCOVERY_TELESCOPE_PROVIDER_ID_INVALID'),
      status: provider.status, sourceUrl: https(provider.sourceUrl,
        'DISCOVERY_TELESCOPE_PROVIDER_URL_INVALID'),
      rightsRecordId: token(provider.rightsRecordId,
        'DISCOVERY_TELESCOPE_PROVIDER_RIGHTS_REQUIRED') });
  });
  if (raw.productionEnabled === true) {
    requireValue(raw.status === 'APPROVED' && raw.approvedAt && raw.approvedBy,
      'DISCOVERY_PRODUCTION_POLICY_NOT_APPROVED');
  }
  return freeze({ schema: DISCOVERY_POLICY_SCHEMA, revision: token(raw.revision,
    'DISCOVERY_POLICY_REVISION_INVALID'), status: raw.status,
    productionEnabled: raw.productionEnabled === true, telescopeProviders,
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

export function normalizeDiscoveryRecord(raw) {
  requireValue(OBJECT_TYPES.includes(raw?.type), 'DISCOVERY_OBJECT_TYPE_INVALID');
  const aliases = [...new Set((raw.aliases || []).map(value => text(value,
    'DISCOVERY_ALIAS_INVALID', 160)))];
  const externalIds = Object.fromEntries(Object.entries(raw.externalIds || {}).map(([key, value]) =>
    [token(key, 'DISCOVERY_EXTERNAL_ID_NAMESPACE_INVALID'),
      token(value, 'DISCOVERY_EXTERNAL_ID_INVALID')]));
  const relations = (raw.relations || []).map(relation => freeze({ type: token(relation.type,
    'DISCOVERY_RELATION_TYPE_INVALID'), targetId: token(relation.targetId,
    'DISCOVERY_RELATION_TARGET_INVALID'), reason: text(relation.reason,
    'DISCOVERY_RELATION_REASON_REQUIRED'), evidence: evidence(relation.evidence,
    'DISCOVERY_RELATION_EVIDENCE') }));
  return freeze({ schema: 'earthus.discovery-record.v1', id: token(raw.id,
    'DISCOVERY_OBJECT_ID_INVALID'), domain: raw.type === 'EARTH_FEATURE' ? 'EARTHUS' : 'AETHERUS',
  type: raw.type, name: text(raw.name, 'DISCOVERY_OBJECT_NAME_REQUIRED'), aliases,
  externalIds: freeze(externalIds), relations, evidence: evidence(raw.evidence,
    'DISCOVERY_OBJECT_EVIDENCE') });
}

const searchable = record => [record.name, ...record.aliases, ...Object.values(record.externalIds)]
  .map(value => value.toLocaleLowerCase('en-US'));

export function createDiscoveryCatalog(rawRecords) {
  requireValue(Array.isArray(rawRecords), 'DISCOVERY_CATALOG_INVALID');
  const records = rawRecords.map(normalizeDiscoveryRecord);
  const byId = new Map(records.map(record => [record.id, record]));
  requireValue(byId.size === records.length, 'DISCOVERY_DUPLICATE_OBJECT_ID');
  requireValue(records.every(record => record.relations.every(relation => byId.has(relation.targetId))),
    'DISCOVERY_RELATION_TARGET_MISSING');
  return freeze({ records,
    search(query, { domain = null, limit = 20 } = {}) {
      const needle = String(query || '').trim().toLocaleLowerCase('en-US');
      requireValue(needle.length >= 2 && needle.length <= 100, 'DISCOVERY_QUERY_INVALID');
      requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100,
        'DISCOVERY_SEARCH_LIMIT_INVALID');
      if (domain !== null) requireValue(['EARTHUS', 'AETHERUS'].includes(domain),
        'DISCOVERY_DOMAIN_INVALID');
      return freeze(records.filter(record => (!domain || record.domain === domain)
        && searchable(record).some(value => value.includes(needle)))
        .sort((a, b) => {
          const aExact = searchable(a).includes(needle) ? 0 : 1;
          const bExact = searchable(b).includes(needle) ? 0 : 1;
          return aExact - bExact || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        }).slice(0, limit));
    },
    recommendations(objectId) {
      const record = byId.get(objectId);
      requireValue(record, 'DISCOVERY_OBJECT_NOT_FOUND');
      return freeze(record.relations.map(relation => ({ relation: relation.type,
        reason: relation.reason, evidence: relation.evidence, object: byId.get(relation.targetId),
        generated: false })));
    } });
}

export function buildDiscoveryShareLink({ origin, domain, objectId, view = 'INFO' } = {}) {
  const parsed = new URL(https(origin, 'DISCOVERY_SHARE_ORIGIN_INVALID'));
  requireValue(['EARTHUS', 'AETHERUS'].includes(domain), 'DISCOVERY_SHARE_DOMAIN_INVALID');
  requireValue(['INFO', 'MEDIA', 'CULTURE', 'OBSERVATIONS'].includes(view),
    'DISCOVERY_SHARE_VIEW_INVALID');
  parsed.pathname = '/explore';
  parsed.search = '';
  parsed.hash = '';
  parsed.searchParams.set('domain', domain.toLowerCase());
  parsed.searchParams.set('object', token(objectId, 'DISCOVERY_SHARE_OBJECT_INVALID'));
  parsed.searchParams.set('view', view.toLowerCase());
  return freeze({ url: parsed.toString(), includesPrivateCoordinates: false,
    includesSessionOrToken: false, canonical: true });
}

export function telescopeProviderDecision(providerId, { policy } = {}) {
  const normalizedPolicy = validateDiscoveryPolicy(policy);
  const provider = normalizedPolicy.telescopeProviders.find(item => item.id === providerId);
  requireValue(provider, 'DISCOVERY_TELESCOPE_PROVIDER_UNKNOWN');
  const allowed = normalizedPolicy.productionEnabled && provider.status === 'APPROVED';
  return freeze({ providerId, allowed, reason: allowed ? 'APPROVED_PROVIDER'
    : provider.status === 'DISABLED' ? 'PROVIDER_DISABLED' : 'PRODUCTION_GATE_CLOSED',
  rightsRecordId: provider.rightsRecordId, sourceUrl: provider.sourceUrl });
}
