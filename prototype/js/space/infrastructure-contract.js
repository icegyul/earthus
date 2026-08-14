// Aetherus cache/storage/provider infrastructure local shadow (Sheets 233-245).
// Produces plans and validates measured samples; it never provisions, scales, retries or resyncs by itself.

export const INFRA_POLICY_SCHEMA = 'earthus.aetherus-infrastructure-policy.v1';

export class InfrastructureContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'InfrastructureContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new InfrastructureContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const integer = (value, code, { zero = false } = {}) => {
  const output = Number(value); requireValue(Number.isInteger(output) && (zero ? output >= 0 : output > 0), code);
  return output;
};
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,159}$/.test(output), code); return output;
};
const utc = (value, code = 'INFRA_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export function validateInfrastructurePolicy(raw) {
  requireValue(raw?.schema === INFRA_POLICY_SCHEMA, 'INFRA_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'INFRA_POLICY_STATUS_INVALID');
  const cache = raw.cache || {};
  const hotSeconds = integer(cache.hotSeconds, 'INFRA_HOT_CACHE_INVALID');
  const warmSeconds = integer(cache.warmSeconds, 'INFRA_WARM_CACHE_INVALID');
  const staleWhileRevalidateSeconds = integer(cache.staleWhileRevalidateSeconds,
    'INFRA_STALE_WINDOW_INVALID', { zero: true });
  requireValue(warmSeconds >= hotSeconds, 'INFRA_CACHE_TIER_ORDER_INVALID');
  const storage = raw.storage || {};
  requireValue(['public/renditions/', 'private/originals/', 'quarantine/'].every(prefix =>
    Object.values(storage.prefixes || {}).includes(prefix)), 'INFRA_STORAGE_PREFIXES_INVALID');
  const providers = (raw.providers || []).map(provider => freeze({
    id: token(provider.id, 'INFRA_PROVIDER_ID_INVALID'),
    requestLimit: integer(provider.requestLimit, 'INFRA_PROVIDER_LIMIT_INVALID'),
    windowSeconds: integer(provider.windowSeconds, 'INFRA_PROVIDER_WINDOW_INVALID'),
    failureThreshold: integer(provider.failureThreshold, 'INFRA_PROVIDER_FAILURE_THRESHOLD_INVALID'),
    retryAttempts: integer(provider.retryAttempts, 'INFRA_PROVIDER_RETRY_ATTEMPTS_INVALID', { zero: true }),
    backoffSeconds: (provider.backoffSeconds || []).map(value => integer(value,
      'INFRA_PROVIDER_BACKOFF_INVALID', { zero: true })), schedule: String(provider.schedule || '') }));
  requireValue(providers.every(provider => provider.backoffSeconds.length === provider.retryAttempts),
    'INFRA_PROVIDER_RETRY_BACKOFF_MISMATCH');
  const autoscaling = raw.autoscaling || {};
  requireValue(Number.isFinite(autoscaling.cpuScaleOutPercent) && autoscaling.cpuScaleOutPercent > 0
    && autoscaling.cpuScaleOutPercent <= 100 && Number.isInteger(autoscaling.queueDepthScaleOut)
    && autoscaling.queueDepthScaleOut >= 0 && Number.isInteger(autoscaling.minReplicas)
    && Number.isInteger(autoscaling.maxReplicas) && autoscaling.maxReplicas >= autoscaling.minReplicas,
  'INFRA_AUTOSCALING_POLICY_INVALID');
  if (raw.productionEnabled === true) requireValue(raw.status === 'APPROVED'
    && raw.approvedAt && raw.approvedBy && raw.infrastructureEvidence,
  'INFRA_PRODUCTION_EVIDENCE_REQUIRED');
  return freeze({ schema: INFRA_POLICY_SCHEMA, revision: token(raw.revision,
    'INFRA_POLICY_REVISION_INVALID'), status: raw.status,
    productionEnabled: raw.productionEnabled === true,
    cache: { hotSeconds, warmSeconds, staleWhileRevalidateSeconds },
    storage: { prefixes: { ...storage.prefixes }, lifecycle: { ...storage.lifecycle } },
    providers, autoscaling: { ...autoscaling }, infrastructureEvidence: raw.infrastructureEvidence || null,
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

export function buildCacheKey(raw) {
  requireValue(['PUBLIC_RENDITION', 'PRIVATE_ORIGINAL', 'PROVIDER_RESPONSE'].includes(raw?.classification),
    'INFRA_CACHE_CLASSIFICATION_INVALID');
  const parts = ['v1', raw.classification.toLowerCase(), token(raw.namespace,
    'INFRA_CACHE_NAMESPACE_INVALID'), token(raw.objectId, 'INFRA_CACHE_OBJECT_ID_INVALID'),
  token(raw.revision, 'INFRA_CACHE_REVISION_INVALID'), token(raw.rightsRecordId,
    'INFRA_CACHE_RIGHTS_RECORD_REQUIRED')];
  if (raw.classification === 'PRIVATE_ORIGINAL') parts.push(token(raw.ownerRef,
    'INFRA_PRIVATE_CACHE_OWNER_REQUIRED'));
  requireValue(!raw.url && !raw.accessToken && !raw.signedUrl, 'INFRA_CACHE_SECRET_INPUT_FORBIDDEN');
  return parts.join(':');
}

export function cacheDecision({ ageSeconds, originStatus, classification, policy } = {}) {
  const normalized = validateInfrastructurePolicy(policy);
  const age = integer(ageSeconds, 'INFRA_CACHE_AGE_INVALID', { zero: true });
  requireValue(['AVAILABLE', 'FAILED', 'TIMEOUT'].includes(originStatus), 'INFRA_ORIGIN_STATUS_INVALID');
  requireValue(['PUBLIC_RENDITION', 'PRIVATE_ORIGINAL', 'PROVIDER_RESPONSE'].includes(classification),
    'INFRA_CACHE_CLASSIFICATION_INVALID');
  if (classification === 'PRIVATE_ORIGINAL') return freeze({ disposition: 'PRIVATE_NO_CDN',
    serve: false, revalidate: false, reason: 'SIGNED_PRIVATE_ORIGIN_REQUIRED' });
  if (age <= normalized.cache.hotSeconds) return freeze({ disposition: 'HOT', serve: true,
    revalidate: false, reason: 'WITHIN_HOT_TTL' });
  if (age <= normalized.cache.warmSeconds) return freeze({ disposition: 'WARM', serve: true,
    revalidate: true, reason: 'WITHIN_WARM_TTL' });
  if (originStatus !== 'AVAILABLE' && age <= normalized.cache.warmSeconds
    + normalized.cache.staleWhileRevalidateSeconds) return freeze({ disposition: 'STALE_FALLBACK',
    serve: true, revalidate: true, reason: 'ORIGIN_FAILED_WITHIN_EXPLICIT_STALE_WINDOW' });
  return freeze({ disposition: 'MISS', serve: false, revalidate: originStatus === 'AVAILABLE',
    reason: originStatus === 'AVAILABLE' ? 'FETCH_REQUIRED' : 'ORIGIN_FAILED_NO_USABLE_CACHE' });
}

export function storageRoute({ kind, objectId, ownerRef = null, policy } = {}) {
  const normalized = validateInfrastructurePolicy(policy);
  requireValue(['PUBLIC_RENDITION', 'PRIVATE_ORIGINAL', 'QUARANTINE'].includes(kind),
    'INFRA_STORAGE_KIND_INVALID');
  const prefixKey = kind === 'PUBLIC_RENDITION' ? 'publicRendition'
    : kind === 'PRIVATE_ORIGINAL' ? 'privateOriginal' : 'quarantine';
  const segments = [normalized.storage.prefixes[prefixKey]];
  if (kind === 'PRIVATE_ORIGINAL') segments.push(`${token(ownerRef, 'INFRA_STORAGE_OWNER_REQUIRED')}/`);
  segments.push(token(objectId, 'INFRA_STORAGE_OBJECT_ID_INVALID'));
  return freeze({ key: segments.join(''), publicRead: kind === 'PUBLIC_RENDITION',
    signedReadRequired: kind === 'PRIVATE_ORIGINAL', quarantine: kind === 'QUARANTINE' });
}

export function verifyMediaChecksum({ expectedSha256, actualSha256 } = {}) {
  const expected = String(expectedSha256 || '').toLowerCase();
  const actual = String(actualSha256 || '').toLowerCase();
  requireValue(/^[a-f0-9]{64}$/.test(expected) && /^[a-f0-9]{64}$/.test(actual),
    'INFRA_CHECKSUM_INVALID');
  return freeze({ verified: expected === actual,
    disposition: expected === actual ? 'ACCEPT' : 'QUARANTINE', algorithm: 'SHA-256' });
}

export function normalizeInfrastructureMetrics(raw) {
  requireValue(raw?.sourceId && raw?.observedAt, 'INFRA_METRIC_SOURCE_TIME_REQUIRED');
  const metrics = {};
  for (const name of ['egressBytes', 'storageBytes', 'cacheHits', 'cacheMisses', 'cpuPercent',
    'queueDepth']) {
    const value = Number(raw[name]);
    requireValue(Number.isFinite(value) && value >= 0, 'INFRA_METRIC_VALUE_INVALID', { name });
    metrics[name] = value;
  }
  const denominator = metrics.cacheHits + metrics.cacheMisses;
  return freeze({ sourceId: token(raw.sourceId, 'INFRA_METRIC_SOURCE_INVALID'),
    observedAt: utc(raw.observedAt), ...metrics,
  cacheHitRatio: denominator ? metrics.cacheHits / denominator : null, estimatedCost: null });
}

export function autoscalingProposal(sample, { currentReplicas, policy } = {}) {
  const normalizedPolicy = validateInfrastructurePolicy(policy);
  const metrics = normalizeInfrastructureMetrics(sample);
  const replicas = integer(currentReplicas, 'INFRA_CURRENT_REPLICAS_INVALID');
  const pressure = metrics.cpuPercent >= normalizedPolicy.autoscaling.cpuScaleOutPercent
    || metrics.queueDepth >= normalizedPolicy.autoscaling.queueDepthScaleOut;
  const proposed = pressure ? Math.min(replicas + 1, normalizedPolicy.autoscaling.maxReplicas) : replicas;
  return freeze({ action: proposed > replicas ? 'PROPOSE_SCALE_OUT' : 'NO_CHANGE',
    currentReplicas: replicas, proposedReplicas: proposed, automaticApply: false,
    productionPolicyEnabled: normalizedPolicy.productionEnabled, evidence: metrics });
}

export function providerRequestDecision({ providerId, usedRequests, consecutiveFailures,
  policy } = {}) {
  const normalized = validateInfrastructurePolicy(policy);
  const provider = normalized.providers.find(item => item.id === providerId);
  requireValue(provider, 'INFRA_PROVIDER_UNKNOWN');
  const used = integer(usedRequests, 'INFRA_PROVIDER_USAGE_INVALID', { zero: true });
  const failures = integer(consecutiveFailures, 'INFRA_PROVIDER_FAILURE_COUNT_INVALID', { zero: true });
  const circuitOpen = failures >= provider.failureThreshold;
  const rateLimited = used >= provider.requestLimit;
  return freeze({ providerId, allowed: normalized.productionEnabled && !circuitOpen && !rateLimited,
    reason: !normalized.productionEnabled ? 'PRODUCTION_GATE_CLOSED'
      : circuitOpen ? 'CIRCUIT_OPEN' : rateLimited ? 'RATE_LIMIT_REACHED' : 'ALLOWED',
  retryPlanSeconds: circuitOpen || rateLimited ? [] : [...provider.backoffSeconds],
  schedule: provider.schedule });
}

export function buildIngestionPlan({ mode, providerId, cursor = null, approval = null,
  policy } = {}) {
  const normalized = validateInfrastructurePolicy(policy);
  requireValue(normalized.providers.some(provider => provider.id === providerId),
    'INFRA_PROVIDER_UNKNOWN');
  requireValue(['INCREMENTAL', 'FULL_RESYNC'].includes(mode), 'INFRA_INGESTION_MODE_INVALID');
  if (mode === 'INCREMENTAL') requireValue(cursor, 'INFRA_INCREMENTAL_CURSOR_REQUIRED');
  if (mode === 'FULL_RESYNC') requireValue(approval?.approvedBy && approval?.approvedAt
    && approval?.reason, 'INFRA_FULL_RESYNC_APPROVAL_REQUIRED');
  return freeze({ mode, providerId, cursor: cursor ? token(cursor,
    'INFRA_INCREMENTAL_CURSOR_INVALID') : null, approval: approval ? { ...approval,
    approvedAt: utc(approval.approvedAt) } : null, automaticStart: false,
  productionPolicyEnabled: normalized.productionEnabled });
}
