// Aetherus API contract v1 local shadow (Sheets 215-218).
// Defines response and cache semantics only; it does not start a server or enable production routes.

export const API_CONTRACT_SCHEMA = 'earthus.aetherus-api-contract.v1';
export const API_POLICY_SCHEMA = 'earthus.aetherus-api-policy.v1';

export class ApiContractError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ApiContractError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, details = {}) => { throw new ApiContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code, pattern = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/) => {
  const output = String(value || '').trim();
  requireValue(pattern.test(output), code);
  return output;
};
const positiveInteger = (value, code, { allowZero = false } = {}) => {
  const output = Number(value);
  requireValue(Number.isInteger(output) && (allowZero ? output >= 0 : output > 0), code);
  return output;
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function validateApiPolicy(raw) {
  requireValue(raw?.schema === API_POLICY_SCHEMA, 'API_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'API_POLICY_STATUS_INVALID');
  requireValue(/^v[1-9]\d*$/.test(String(raw.apiVersion || '')), 'API_VERSION_INVALID');
  requireValue(raw.basePath === `/api/${raw.apiVersion}`, 'API_BASE_PATH_INVALID');
  const maxPageSize = positiveInteger(raw.maxPageSize, 'API_MAX_PAGE_SIZE_INVALID');
  const idempotency = raw.idempotency || {};
  const minKeyLength = positiveInteger(idempotency.minKeyLength,
    'API_IDEMPOTENCY_MIN_KEY_LENGTH_INVALID');
  const maxKeyLength = positiveInteger(idempotency.maxKeyLength,
    'API_IDEMPOTENCY_MAX_KEY_LENGTH_INVALID');
  requireValue(maxKeyLength >= minKeyLength, 'API_IDEMPOTENCY_KEY_RANGE_INVALID');
  const ttlSeconds = positiveInteger(idempotency.ttlSeconds, 'API_IDEMPOTENCY_TTL_INVALID');
  if (raw.productionEnabled === true) {
    requireValue(raw.status === 'APPROVED' && raw.approvedAt && raw.approvedBy,
      'API_PRODUCTION_POLICY_NOT_APPROVED');
  }
  return freeze({ schema: API_POLICY_SCHEMA, revision: token(raw.revision, 'API_POLICY_REVISION_INVALID'),
    status: raw.status, productionEnabled: raw.productionEnabled === true,
    apiVersion: raw.apiVersion, basePath: raw.basePath, maxPageSize,
    idempotency: { minKeyLength, maxKeyLength, ttlSeconds },
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

const ROUTE_PARAMETER = /^\{[a-z][A-Za-z0-9]*\}$/;
const REST_SEGMENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERB_SEGMENTS = new Set(['create', 'read', 'update', 'delete', 'get', 'post', 'patch']);

export function validateRestRoute(method, routeTemplate, { policy } = {}) {
  const normalizedPolicy = validateApiPolicy(policy);
  const normalizedMethod = String(method || '').toUpperCase();
  requireValue(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(normalizedMethod),
    'API_METHOD_INVALID');
  const route = String(routeTemplate || '');
  requireValue(route.startsWith(`${normalizedPolicy.basePath}/`) && !route.includes('?')
    && !route.includes('#') && !route.includes('//') && !route.endsWith('/'),
  'API_ROUTE_VERSION_OR_SHAPE_INVALID');
  const segments = route.slice(normalizedPolicy.basePath.length + 1).split('/');
  requireValue(segments.length > 0 && segments.every(segment => ROUTE_PARAMETER.test(segment)
    || REST_SEGMENT.test(segment)), 'API_REST_NAMING_INVALID');
  requireValue(segments.filter(segment => !ROUTE_PARAMETER.test(segment))
    .every(segment => !VERB_SEGMENTS.has(segment)), 'API_REST_VERB_SEGMENT_FORBIDDEN');
  return freeze({ schema: API_CONTRACT_SCHEMA, method: normalizedMethod, route,
    version: normalizedPolicy.apiVersion });
}

export function normalizeCursorPage(raw, { requestedLimit, policy } = {}) {
  const normalizedPolicy = validateApiPolicy(policy);
  const limit = positiveInteger(requestedLimit, 'API_PAGE_LIMIT_INVALID');
  requireValue(limit <= normalizedPolicy.maxPageSize, 'API_PAGE_LIMIT_EXCEEDED');
  requireValue(Array.isArray(raw?.items) && raw.items.length <= limit, 'API_PAGE_ITEMS_INVALID');
  requireValue(typeof raw.hasMore === 'boolean', 'API_PAGE_HAS_MORE_REQUIRED');
  const nextCursor = raw.nextCursor == null ? null : String(raw.nextCursor);
  if (nextCursor !== null) {
    requireValue(/^[A-Za-z0-9_-]{16,1024}$/.test(nextCursor), 'API_CURSOR_OPAQUE_TOKEN_INVALID');
  }
  requireValue(raw.hasMore ? nextCursor !== null : nextCursor === null,
    'API_CURSOR_CONTINUATION_MISMATCH');
  requireValue(!Object.hasOwn(raw, 'total') && !Object.hasOwn(raw, 'estimatedTotal'),
    'API_CURSOR_SYNTHETIC_TOTAL_FORBIDDEN');
  return freeze({ schema: 'earthus.cursor-page.v1', items: [...raw.items], nextCursor,
    hasMore: raw.hasMore, limit });
}

const SENSITIVE_ERROR_KEYS = /^(stack|password|passphrase|token|secret|authorization|cookie)$/i;
function sanitizeErrorDetails(details) {
  if (details == null) return null;
  requireValue(Object.getPrototypeOf(details) === Object.prototype, 'API_ERROR_DETAILS_INVALID');
  requireValue(Object.keys(details).every(key => !SENSITIVE_ERROR_KEYS.test(key)),
    'API_ERROR_SENSITIVE_DETAIL_FORBIDDEN');
  return freeze({ ...details });
}

export function buildErrorEnvelope({ code, message, requestId, details = null,
  retryable = false } = {}) {
  const normalizedCode = token(code, 'API_ERROR_CODE_INVALID', /^[A-Z][A-Z0-9_]{2,80}$/);
  const normalizedMessage = String(message || '').trim();
  requireValue(normalizedMessage.length > 0 && normalizedMessage.length <= 300,
    'API_ERROR_MESSAGE_INVALID');
  const normalizedRequestId = token(requestId, 'API_REQUEST_ID_INVALID');
  return freeze({ schema: 'earthus.error-envelope.v1', error: { code: normalizedCode,
    message: normalizedMessage, requestId: normalizedRequestId,
    details: sanitizeErrorDetails(details), retryable: retryable === true } });
}

function normalizeIdempotencyInput(raw, policy) {
  const normalizedPolicy = validateApiPolicy(policy);
  const method = String(raw?.method || '').toUpperCase();
  requireValue(['POST', 'PATCH', 'PUT', 'DELETE'].includes(method),
    'API_IDEMPOTENCY_METHOD_INVALID');
  const key = String(raw?.key || '').trim();
  requireValue(key.length >= normalizedPolicy.idempotency.minKeyLength
    && key.length <= normalizedPolicy.idempotency.maxKeyLength
    && /^[A-Za-z0-9][A-Za-z0-9._:~-]*$/.test(key), 'API_IDEMPOTENCY_KEY_INVALID');
  const actorId = token(raw.actorId, 'API_IDEMPOTENCY_ACTOR_REQUIRED');
  const route = validateRestRoute(method, raw.route, { policy: normalizedPolicy }).route;
  const requestBodyHash = String(raw.requestBodyHash || '').toLowerCase();
  requireValue(/^[a-f0-9]{64}$/.test(requestBodyHash), 'API_IDEMPOTENCY_BODY_HASH_INVALID');
  return { actorId, method, route, key, requestBodyHash, normalizedPolicy };
}

export class IdempotencyRegistry {
  constructor({ policy, nowMs = () => Date.now() } = {}) {
    this.policy = validateApiPolicy(policy);
    this.nowMs = nowMs;
    this.records = new Map();
  }

  claim(raw) {
    const input = normalizeIdempotencyInput(raw, this.policy);
    const scope = `${input.actorId}|${input.method}|${input.route}|${input.key}`;
    const now = Number(this.nowMs());
    requireValue(Number.isFinite(now), 'API_IDEMPOTENCY_CLOCK_INVALID');
    const existing = this.records.get(scope);
    if (existing && existing.expiresAtMs <= now) this.records.delete(scope);
    const active = this.records.get(scope);
    if (active) {
      requireValue(active.requestBodyHash === input.requestBodyHash,
        'API_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
      return freeze({ disposition: 'REPLAY', scope, state: active.state,
        responseRef: active.responseRef, expiresAtMs: active.expiresAtMs });
    }
    const record = { requestBodyHash: input.requestBodyHash, state: 'PENDING', responseRef: null,
      expiresAtMs: now + this.policy.idempotency.ttlSeconds * 1000 };
    this.records.set(scope, record);
    return freeze({ disposition: 'ACCEPTED', scope, state: record.state,
      responseRef: null, expiresAtMs: record.expiresAtMs });
  }

  complete(scope, responseRef) {
    const record = this.records.get(String(scope || ''));
    requireValue(record?.state === 'PENDING', 'API_IDEMPOTENCY_PENDING_RECORD_REQUIRED');
    record.state = 'COMPLETED';
    record.responseRef = token(responseRef, 'API_IDEMPOTENCY_RESPONSE_REF_INVALID');
    return freeze({ scope, state: record.state, responseRef: record.responseRef,
      expiresAtMs: record.expiresAtMs });
  }
}

export function makeStrongEtag(representationHash) {
  const hash = String(representationHash || '').toLowerCase();
  requireValue(/^[a-f0-9]{64}$/.test(hash), 'API_ETAG_REPRESENTATION_HASH_INVALID');
  return `"sha256-${hash}"`;
}

function strongEtag(value, code) {
  const output = String(value || '').trim();
  requireValue(/^"[\x21\x23-\x7e]{1,190}"$/.test(output) && !output.startsWith('W/'), code);
  return output;
}

export function evaluateConditionalGet({ etag, ifNoneMatch = null } = {}) {
  const current = strongEtag(etag, 'API_ETAG_INVALID');
  if (ifNoneMatch == null || String(ifNoneMatch).trim() === '') {
    return freeze({ status: 200, bodyAllowed: true, etag: current });
  }
  const candidates = String(ifNoneMatch).split(',').map(value => value.trim());
  requireValue(candidates.every(value => value === '*' || (!value.startsWith('W/')
    && /^"[\x21\x23-\x7e]{1,190}"$/.test(value))), 'API_IF_NONE_MATCH_INVALID');
  const matched = candidates.includes('*') || candidates.includes(current);
  return freeze({ status: matched ? 304 : 200, bodyAllowed: !matched, etag: current });
}

export function buildRateLimitHeaders({ limit, remaining, resetAtEpochSeconds,
  retryAfterSeconds = null } = {}) {
  const normalizedLimit = positiveInteger(limit, 'API_RATE_LIMIT_INVALID');
  const normalizedRemaining = positiveInteger(remaining, 'API_RATE_REMAINING_INVALID',
    { allowZero: true });
  requireValue(normalizedRemaining <= normalizedLimit, 'API_RATE_REMAINING_EXCEEDS_LIMIT');
  const normalizedReset = positiveInteger(resetAtEpochSeconds, 'API_RATE_RESET_INVALID');
  const headers = { 'X-RateLimit-Limit': String(normalizedLimit),
    'X-RateLimit-Remaining': String(normalizedRemaining),
    'X-RateLimit-Reset': String(normalizedReset) };
  if (retryAfterSeconds != null) headers['Retry-After'] = String(positiveInteger(retryAfterSeconds,
    'API_RETRY_AFTER_INVALID', { allowZero: true }));
  return freeze(headers);
}
