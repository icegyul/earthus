// Earthus/Aetherus shared operating contract local shadow (Sheets 6, 8, 10, 11, 14-18, 21-23).
// This file validates boundaries. It does not provision infrastructure or approve providers/rights.

export const PLATFORM_POLICY_SCHEMA = 'earthus.platform-operating-policy.v1';
export const REQUIRED_COMPONENTS = Object.freeze([
  'API_GATEWAY', 'AUTH_SESSION', 'ENTITLEMENT', 'EARTH_PROVIDER_ADAPTER',
  'SPACE_PROVIDER_ADAPTER', 'MEDIA_PROVIDER_ADAPTER', 'EVENT_INGESTION',
  'OBSERVATION_INGESTION', 'JOB_QUEUE', 'CACHE', 'ANALYTICS_EVENT_BUS',
  'OBSERVABILITY', 'FEATURE_FLAG', 'CONFIGURATION', 'SECRETS', 'RATE_LIMIT',
]);

export class PlatformContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'PlatformContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new PlatformContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/.test(output), code); return output;
};
const utc = (value, code = 'PLATFORM_UTC_REQUIRED') => {
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

export function validatePlatformPolicy(raw) {
  requireValue(raw?.schema === PLATFORM_POLICY_SCHEMA, 'PLATFORM_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'PLATFORM_POLICY_STATUS_INVALID');
  const components = raw.components || {};
  requireValue(REQUIRED_COMPONENTS.every(name => ['LOCAL_CONTRACT', 'EXTERNAL_REQUIRED',
    'PRODUCTION_VERIFIED'].includes(components[name])), 'PLATFORM_COMPONENT_MATRIX_INCOMPLETE');
  requireValue(Number.isInteger(raw.cache?.maxStaleSeconds) && raw.cache.maxStaleSeconds >= 0,
    'PLATFORM_CACHE_POLICY_INVALID');
  requireValue(Number.isInteger(raw.rateLimit?.defaultRequests)
    && raw.rateLimit.defaultRequests > 0 && Number.isInteger(raw.rateLimit.windowSeconds)
    && raw.rateLimit.windowSeconds > 0, 'PLATFORM_RATE_LIMIT_POLICY_INVALID');
  if (raw.productionEnabled === true) {
    requireValue(raw.status === 'APPROVED' && raw.approvedAt && raw.approvedBy
      && REQUIRED_COMPONENTS.every(name => components[name] === 'PRODUCTION_VERIFIED'),
    'PLATFORM_PRODUCTION_NOT_VERIFIED');
  }
  return freeze({ schema: PLATFORM_POLICY_SCHEMA, revision: token(raw.revision,
    'PLATFORM_POLICY_REVISION_INVALID'), status: raw.status,
    productionEnabled: raw.productionEnabled === true, components: { ...components },
    cache: { ...raw.cache }, rateLimit: { ...raw.rateLimit },
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

export function decideExternalMediaHandling(raw) {
  const sourceUrl = https(raw?.sourceUrl, 'PLATFORM_MEDIA_SOURCE_URL_INVALID');
  const rights = raw?.rights || {};
  requireValue(['PUBLIC_DOMAIN', 'LICENSED', 'EMBED_ONLY', 'UNKNOWN'].includes(rights.status),
    'PLATFORM_MEDIA_RIGHTS_STATUS_INVALID');
  requireValue(rights.checkedAt && rights.sourceUrl, 'PLATFORM_MEDIA_RIGHTS_EVIDENCE_REQUIRED');
  const evidence = { checkedAt: utc(rights.checkedAt), sourceUrl: https(rights.sourceUrl,
    'PLATFORM_MEDIA_RIGHTS_URL_INVALID'), recordId: token(rights.recordId,
    'PLATFORM_MEDIA_RIGHTS_RECORD_REQUIRED') };
  let disposition = 'LINK_ONLY';
  if (rights.status === 'EMBED_ONLY' && raw.embedUrl) disposition = 'EMBED_ONLY';
  if (['PUBLIC_DOMAIN', 'LICENSED'].includes(rights.status) && rights.storageAllowed === true
    && raw.checksumSha256 && /^[a-f0-9]{64}$/i.test(raw.checksumSha256)) disposition = 'CACHE_ALLOWED';
  return freeze({ sourceUrl, embedUrl: disposition === 'EMBED_ONLY'
    ? https(raw.embedUrl, 'PLATFORM_MEDIA_EMBED_URL_INVALID') : null,
  disposition, earthusStorageAllowed: disposition === 'CACHE_ALLOWED',
  publicDisplayAllowed: disposition === 'CACHE_ALLOWED' && rights.publicDisplayAllowed === true,
  evidence });
}

export function decideEntitlement({ capability, requiredTier, entitlement = null } = {}) {
  const normalizedCapability = token(capability, 'PLATFORM_CAPABILITY_INVALID');
  requireValue(['FREE', 'PLUS', 'PRO'].includes(requiredTier), 'PLATFORM_TIER_INVALID');
  if (!entitlement) return freeze({ capability: normalizedCapability, allowed: false,
    reason: 'ENTITLEMENT_UNKNOWN', requiredTier, evidence: null });
  requireValue(['FREE', 'PLUS', 'PRO'].includes(entitlement.tier), 'PLATFORM_ENTITLEMENT_TIER_INVALID');
  requireValue(['ACTIVE', 'EXPIRED', 'REVOKED'].includes(entitlement.status)
    && entitlement.assertedAt && entitlement.sourceId, 'PLATFORM_ENTITLEMENT_EVIDENCE_INVALID');
  const rank = { FREE: 0, PLUS: 1, PRO: 2 };
  const allowed = entitlement.status === 'ACTIVE' && rank[entitlement.tier] >= rank[requiredTier];
  return freeze({ capability: normalizedCapability, allowed,
    reason: allowed ? 'ENTITLED' : entitlement.status === 'ACTIVE' ? 'TIER_INSUFFICIENT'
      : `ENTITLEMENT_${entitlement.status}`,
  requiredTier, evidence: { tier: entitlement.tier, status: entitlement.status,
    assertedAt: utc(entitlement.assertedAt), sourceId: token(entitlement.sourceId,
      'PLATFORM_ENTITLEMENT_SOURCE_INVALID') } });
}

export function normalizePresentationContext(raw) {
  const locale = String(raw?.locale || '');
  requireValue(/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale), 'PLATFORM_LOCALE_INVALID');
  const timeZone = String(raw?.timeZone || '');
  try { new Intl.DateTimeFormat(locale, { timeZone }).format(0); } catch {
    fail('PLATFORM_TIMEZONE_INVALID');
  }
  requireValue(typeof raw.reducedMotion === 'boolean' && typeof raw.highContrast === 'boolean',
    'PLATFORM_ACCESSIBILITY_CONTEXT_REQUIRED');
  return freeze({ locale, timeZone, reducedMotion: raw.reducedMotion,
    highContrast: raw.highContrast, sourceTimestampsRemainUtc: true,
    animationMode: raw.reducedMotion ? 'REDUCED' : 'ON_DEMAND' });
}

export function normalizeProviderEnvelope(raw, { domain } = {}) {
  requireValue(['EARTH', 'SPACE', 'MEDIA'].includes(domain), 'PLATFORM_PROVIDER_DOMAIN_INVALID');
  requireValue(['OK', 'PARTIAL', 'UNAVAILABLE'].includes(raw?.status),
    'PLATFORM_PROVIDER_STATUS_INVALID');
  const source = { providerId: token(raw.providerId, 'PLATFORM_PROVIDER_ID_REQUIRED'),
    sourceUrl: https(raw.sourceUrl, 'PLATFORM_PROVIDER_SOURCE_URL_INVALID'),
    fetchedAt: utc(raw.fetchedAt), rightsRecordId: token(raw.rightsRecordId,
      'PLATFORM_PROVIDER_RIGHTS_RECORD_REQUIRED') };
  const records = (raw.records || []).map(record => {
    requireValue(record.observedAt || record.missingReason, 'PLATFORM_PROVIDER_TIME_OR_MISSING_REQUIRED');
    requireValue(!(record.observedAt && record.missingReason), 'PLATFORM_PROVIDER_VALUE_MISSING_CONFLICT');
    return freeze({ id: token(record.id, 'PLATFORM_PROVIDER_RECORD_ID_REQUIRED'),
      observedAt: record.observedAt ? utc(record.observedAt) : null,
      missingReason: record.missingReason ? token(record.missingReason,
        'PLATFORM_PROVIDER_MISSING_REASON_INVALID') : null, payload: record.payload ?? null });
  });
  requireValue(raw.status !== 'OK' || records.every(record => record.observedAt),
    'PLATFORM_PROVIDER_OK_WITH_MISSING_RECORD');
  return freeze({ schema: `earthus.${domain.toLowerCase()}-provider-envelope.v1`, domain,
    status: raw.status, source, records });
}

const JOB_TRANSITIONS = Object.freeze({ QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: ['SUCCEEDED', 'PARTIAL', 'FAILED'], PARTIAL: [], SUCCEEDED: [], FAILED: [], CANCELLED: [] });
export function transitionIngestionJob(job, nextState, { at, receipt = null } = {}) {
  requireValue(JOB_TRANSITIONS[job?.state]?.includes(nextState), 'PLATFORM_JOB_TRANSITION_INVALID');
  requireValue(job.idempotencyKey && job.providerId, 'PLATFORM_JOB_IDENTITY_REQUIRED');
  if (['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(nextState)) {
    requireValue(receipt?.sourceCount >= 0 && receipt?.acceptedCount >= 0
      && receipt?.missingCount >= 0 && receipt?.rejectedCount >= 0,
    'PLATFORM_JOB_RECEIPT_REQUIRED');
    requireValue(receipt.acceptedCount + receipt.missingCount + receipt.rejectedCount
      === receipt.sourceCount, 'PLATFORM_JOB_RECEIPT_COUNT_MISMATCH');
  }
  return freeze({ ...job, state: nextState, updatedAt: utc(at),
    receipt: receipt ? { ...receipt } : null });
}

const SENSITIVE_ANALYTICS_KEYS = /^(lat|lon|latitude|longitude|exactLocation|accessToken|email)$/i;
export function sanitizeAnalyticsEvent(raw) {
  requireValue(raw?.name && raw?.occurredAt && raw?.properties
    && Object.getPrototypeOf(raw.properties) === Object.prototype,
  'PLATFORM_ANALYTICS_EVENT_INVALID');
  requireValue(Object.keys(raw.properties).every(key => !SENSITIVE_ANALYTICS_KEYS.test(key)),
    'PLATFORM_ANALYTICS_SENSITIVE_PROPERTY_FORBIDDEN');
  return freeze({ name: token(raw.name, 'PLATFORM_ANALYTICS_NAME_INVALID'),
    occurredAt: utc(raw.occurredAt), properties: { ...raw.properties }, exactLocationIncluded: false });
}

const SECRET_KEY = /(secret|password|private.?key|access.?token|refresh.?token|authorization)/i;
export function validateRuntimeConfiguration(raw, { policy } = {}) {
  const normalizedPolicy = validatePlatformPolicy(policy);
  requireValue(raw && Object.getPrototypeOf(raw) === Object.prototype,
    'PLATFORM_CONFIGURATION_INVALID');
  requireValue(Object.keys(raw).every(key => !SECRET_KEY.test(key)),
    'PLATFORM_SECRET_IN_CONFIGURATION_FORBIDDEN');
  const features = {};
  for (const [name, value] of Object.entries(raw.features || {})) {
    requireValue(typeof value === 'boolean', 'PLATFORM_FEATURE_FLAG_INVALID', { name });
    features[token(name, 'PLATFORM_FEATURE_NAME_INVALID')] = normalizedPolicy.productionEnabled
      ? value : false;
  }
  return freeze({ revision: token(raw.revision, 'PLATFORM_CONFIGURATION_REVISION_INVALID'),
    features, productionEnabled: normalizedPolicy.productionEnabled,
    rateLimit: { ...normalizedPolicy.rateLimit } });
}
