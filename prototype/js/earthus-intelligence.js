// Earthus Intelligence — cross-domain evidence co-occurrence, shadow only.
//
// ⚠️ 원인·경로·도착·피해를 추론하지 않는다. 이 모듈은 같은 region/time window 안에
// 검증된 신호가 함께 있었다는 사실만 정렬한다. 네트워크·AI·action·판매 capability가 없다.

export const INTELLIGENCE_POLICY = Object.freeze({
  schemaVersion: 'earthus.intelligence-policy.v1',
  releaseMode: 'SHADOW_EVIDENCE_ONLY',
  publicReleaseApproved: false,
  saleApproved: false,
  exportApproved: false,
  maxSignalsPerBundle: 50,
  maxWindowMinutes: 1440,
  requiredScope: 'intelligence:read',
  engineVersion: 'earthus.intelligence-cooccurrence.v1.0.0',
});

const FORBIDDEN_KEYS = new Set([
  'cause', 'causedBy', 'causal', 'path', 'route', 'arrival', 'arrivalAt', 'eta',
  'damage', 'impactPrediction', 'forecast', 'probability', 'recommendation', 'action',
]);

const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const instant = value => {
  if (!text(value) || !/(Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const httpsUrl = value => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};

function hasForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  return Object.entries(value).some(([key, child]) => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(child));
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function deny(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validateTenant(tenantContext, policy) {
  const tenantId = text(tenantContext?.tenantId);
  const subjectTenantId = text(tenantContext?.subjectTenantId);
  if (!tenantId || !subjectTenantId) deny('TENANT_CONTEXT_REQUIRED');
  if (tenantId !== subjectTenantId) deny('CROSS_TENANT_DENIED');
  if (!Array.isArray(tenantContext.scopes) || !tenantContext.scopes.includes(policy.requiredScope)) {
    deny('INTELLIGENCE_SCOPE_REQUIRED');
  }
  return tenantId;
}

function normalizeSignal(signal, window, regionRef) {
  if (!signal || typeof signal !== 'object' || hasForbiddenKey(signal)) deny('UNSUPPORTED_INFERENCE_FIELD');
  const observed = instant(signal.observedAt);
  const received = instant(signal.receivedAt);
  if (!text(signal.signalId) || !text(signal.domain) || !text(signal.sourceId)
      || !httpsUrl(signal.sourceUrl) || !observed || !received || !text(signal.revision)) {
    deny('SIGNAL_EVIDENCE_INCOMPLETE');
  }
  if (text(signal.regionRef) !== regionRef) deny('SIGNAL_REGION_MISMATCH');
  if (observed < window.start || observed > window.end) deny('SIGNAL_OUTSIDE_WINDOW');
  if (received < observed) deny('SIGNAL_RECEIVED_BEFORE_OBSERVED');
  if (signal.quality?.state && ['FAILED', 'UNKNOWN'].includes(signal.quality.state)) deny('SIGNAL_QUALITY_BLOCKED');
  if (signal.rights?.display !== true || signal.rights?.intelligence !== true) deny('SIGNAL_POLICY_BLOCKED');
  return {
    signalId: signal.signalId.trim(), domain: signal.domain.trim(), sourceId: signal.sourceId.trim(),
    sourceUrl: signal.sourceUrl, observedAt: observed.toISOString(), receivedAt: received.toISOString(),
    revision: signal.revision.trim(), regionRef, kind: text(signal.kind) || 'EVIDENCE',
    unit: text(signal.unit), sampleCount: Number.isInteger(signal.sampleCount) && signal.sampleCount >= 0
      ? signal.sampleCount : null,
    missingCount: Number.isInteger(signal.missingCount) && signal.missingCount >= 0
      ? signal.missingCount : null,
    rights: { display: true, intelligence: true, export: signal.rights?.export === true },
  };
}

export function composeSignalCooccurrence({
  region, window, signals, tenantContext, evaluatedAt, policy = INTELLIGENCE_POLICY,
} = {}) {
  if (policy.releaseMode !== 'SHADOW_EVIDENCE_ONLY' || policy.publicReleaseApproved || policy.saleApproved) {
    deny('UNAPPROVED_POLICY_ESCALATION');
  }
  const tenantId = validateTenant(tenantContext, policy);
  const regionRef = text(region?.regionRef);
  const start = instant(window?.startAt);
  const end = instant(window?.endAt);
  const evaluated = instant(evaluatedAt);
  if (!regionRef || !start || !end || !evaluated || start >= end || evaluated < end) deny('WINDOW_INVALID');
  const minutes = (end - start) / 60_000;
  if (minutes > policy.maxWindowMinutes) deny('WINDOW_QUOTA_EXCEEDED');
  if (!Array.isArray(signals) || signals.length < 2) deny('INSUFFICIENT_SIGNAL_COUNT');
  if (signals.length > policy.maxSignalsPerBundle) deny('SIGNAL_QUOTA_EXCEEDED');
  const normalized = signals.map(signal => normalizeSignal(signal, { start, end }, regionRef))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.signalId.localeCompare(b.signalId));
  if (new Set(normalized.map(signal => signal.signalId)).size !== normalized.length) deny('DUPLICATE_SIGNAL_ID');
  const domains = [...new Set(normalized.map(signal => signal.domain))].sort();
  if (domains.length < 2) deny('CROSS_DOMAIN_EVIDENCE_REQUIRED');
  const core = {
    schemaVersion: 'earthus.intelligence-cooccurrence.v1',
    engineVersion: policy.engineVersion,
    tenantId,
    region: { regionRef, label: text(region.label) },
    window: { startAt: start.toISOString(), endAt: end.toISOString(), minutes },
    evaluatedAt: evaluated.toISOString(),
    domains,
    signalCount: normalized.length,
    signals: normalized,
  };
  return freeze({
    ...core,
    bundleId: `eci_${fnv1a(stable(core))}`,
    status: 'SHADOW_EVIDENCE_READY',
    statement: `같은 지역·시간창에서 ${domains.length}개 영역의 ${normalized.length}개 근거 신호가 함께 기록되었습니다.`,
    inference: null,
    action: null,
    toolCalls: 0,
    externalModelCalls: 0,
    public: false,
    billable: false,
    exportAuthorized: false,
    costAttribution: { tenantId, units: normalized.length, estimatedCost: null, currency: null },
  });
}

export function authorizeIntelligenceExport({ bundle, tenantContext, policy = INTELLIGENCE_POLICY } = {}) {
  const tenantId = validateTenant(tenantContext, policy);
  if (bundle?.tenantId !== tenantId) deny('CROSS_TENANT_DENIED');
  if (policy.exportApproved !== true) deny('EXPORT_POLICY_BLOCKED');
  if (!Array.isArray(bundle.signals) || bundle.signals.some(signal => signal.rights?.export !== true)) {
    deny('SIGNAL_EXPORT_RIGHTS_BLOCKED');
  }
  return freeze({ bundleId: bundle.bundleId, tenantId, authorized: true, package: null, action: null });
}

export function validateIntelligencePolicy(policy = INTELLIGENCE_POLICY) {
  const errors = [];
  if (policy.releaseMode !== 'SHADOW_EVIDENCE_ONLY') errors.push('RELEASE_MODE');
  if (policy.publicReleaseApproved !== false) errors.push('PUBLIC_RELEASE');
  if (policy.saleApproved !== false) errors.push('SALE');
  if (policy.exportApproved !== false) errors.push('EXPORT');
  if (!(policy.maxSignalsPerBundle > 1 && policy.maxSignalsPerBundle <= 100)) errors.push('SIGNAL_QUOTA');
  if (!(policy.maxWindowMinutes > 0 && policy.maxWindowMinutes <= 1440)) errors.push('WINDOW_QUOTA');
  return freeze({ valid: errors.length === 0, errors });
}

export const INTELLIGENCE_FORBIDDEN_KEYS = freeze([...FORBIDDEN_KEYS].sort());
