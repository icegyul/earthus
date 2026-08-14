// Aetherus rights/security/privacy/moderation local shadow (Sheets 250, 252-256, 260-262).
// This validates fail-closed decisions; it does not authenticate, scan, notify or remove content.

export const SECURITY_POLICY_SCHEMA = 'earthus.aetherus-security-policy.v1';
export const ROLES = Object.freeze(['ADMIN', 'EDITOR', 'MODERATOR', 'USER']);

export class SecurityContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'SecurityContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new SecurityContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,159}$/.test(output), code); return output;
};
const utc = (value, code = 'SECURITY_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export function validateSecurityPolicy(raw) {
  requireValue(raw?.schema === SECURITY_POLICY_SCHEMA, 'SECURITY_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'SECURITY_POLICY_STATUS_INVALID');
  const tokenPolicy = raw.tokenPolicy || {};
  for (const name of ['accessTokenSeconds', 'refreshTokenSeconds', 'signedUrlMaxSeconds']) {
    requireValue(Number.isInteger(tokenPolicy[name]) && tokenPolicy[name] > 0,
      'SECURITY_TOKEN_POLICY_INVALID', { name });
  }
  requireValue(tokenPolicy.refreshTokenSeconds > tokenPolicy.accessTokenSeconds,
    'SECURITY_TOKEN_LIFETIME_ORDER_INVALID');
  requireValue(raw.rolePermissions && ROLES.every(role => Array.isArray(raw.rolePermissions[role])),
    'SECURITY_ROLE_MATRIX_INCOMPLETE');
  const abuse = raw.abuseRateLimit || {};
  requireValue(Number.isInteger(abuse.reports) && abuse.reports > 0
    && Number.isInteger(abuse.windowSeconds) && abuse.windowSeconds > 0,
  'SECURITY_ABUSE_RATE_POLICY_INVALID');
  if (raw.productionEnabled === true) requireValue(raw.status === 'APPROVED'
    && raw.approvedAt && raw.approvedBy && raw.oauthEvidence && raw.scannerEvidence,
  'SECURITY_PRODUCTION_EVIDENCE_REQUIRED');
  return freeze({ schema: SECURITY_POLICY_SCHEMA, revision: token(raw.revision,
    'SECURITY_POLICY_REVISION_INVALID'), status: raw.status,
    productionEnabled: raw.productionEnabled === true, tokenPolicy: { ...tokenPolicy },
    rolePermissions: Object.fromEntries(ROLES.map(role => [role,
      [...new Set(raw.rolePermissions[role])]])), abuseRateLimit: { ...abuse },
    oauthEvidence: raw.oauthEvidence || null, scannerEvidence: raw.scannerEvidence || null,
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

export function rightsUseDecision(raw) {
  requireValue(['PUBLIC_DOMAIN', 'LICENSED', 'PRESS_USE', 'EMBED_ONLY', 'UNKNOWN']
    .includes(raw?.status), 'SECURITY_RIGHTS_STATUS_INVALID');
  requireValue(raw.recordId && raw.checkedAt && raw.sourceUrl,
    'SECURITY_RIGHTS_EVIDENCE_REQUIRED');
  let disposition = 'BLOCK';
  if (raw.status === 'PUBLIC_DOMAIN' || raw.status === 'LICENSED') disposition = 'ALLOW_BY_RECORD';
  if (raw.status === 'PRESS_USE') disposition = 'HUMAN_REVIEW_REQUIRED';
  if (raw.status === 'EMBED_ONLY') disposition = 'EXTERNAL_EMBED_ONLY';
  return freeze({ recordId: token(raw.recordId, 'SECURITY_RIGHTS_RECORD_INVALID'),
    status: raw.status, disposition, storageAllowed: disposition === 'ALLOW_BY_RECORD'
      && raw.storageAllowed === true, publicDisplayAllowed: disposition === 'ALLOW_BY_RECORD'
      && raw.publicDisplayAllowed === true, checkedAt: utc(raw.checkedAt),
  sourceUrl: String(raw.sourceUrl) });
}

export function normalizeSessionEvidence(raw, { policy, now } = {}) {
  const normalized = validateSecurityPolicy(policy);
  requireValue(!raw?.accessToken && !raw?.refreshToken && !raw?.authorization,
    'SECURITY_RAW_TOKEN_FORBIDDEN');
  requireValue(raw?.sessionRef && raw?.actorRef && raw?.accessTokenRef && raw?.refreshTokenRef,
    'SECURITY_SESSION_REFERENCE_REQUIRED');
  const issuedAt = Date.parse(utc(raw.issuedAt));
  const accessExpiresAt = Date.parse(utc(raw.accessExpiresAt));
  const refreshExpiresAt = Date.parse(utc(raw.refreshExpiresAt));
  requireValue(accessExpiresAt > issuedAt && refreshExpiresAt > accessExpiresAt
    && accessExpiresAt - issuedAt <= normalized.tokenPolicy.accessTokenSeconds * 1000
    && refreshExpiresAt - issuedAt <= normalized.tokenPolicy.refreshTokenSeconds * 1000,
  'SECURITY_SESSION_LIFETIME_INVALID');
  const current = Date.parse(utc(now));
  return freeze({ sessionRef: token(raw.sessionRef, 'SECURITY_SESSION_REF_INVALID'),
    actorRef: token(raw.actorRef, 'SECURITY_ACTOR_REF_INVALID'),
    accessTokenRef: token(raw.accessTokenRef, 'SECURITY_ACCESS_TOKEN_REF_INVALID'),
    refreshTokenRef: token(raw.refreshTokenRef, 'SECURITY_REFRESH_TOKEN_REF_INVALID'),
    accessExpiresAt: new Date(accessExpiresAt).toISOString(),
    refreshExpiresAt: new Date(refreshExpiresAt).toISOString(),
    accessState: current < accessExpiresAt ? 'ACTIVE' : 'EXPIRED',
    refreshState: current < refreshExpiresAt ? 'ACTIVE' : 'EXPIRED', rawTokenIncluded: false });
}

export function signedUrlPlan({ ownerRef, objectRef, expiresInSeconds, policy } = {}) {
  const normalized = validateSecurityPolicy(policy);
  requireValue(Number.isInteger(expiresInSeconds) && expiresInSeconds > 0
    && expiresInSeconds <= normalized.tokenPolicy.signedUrlMaxSeconds,
  'SECURITY_SIGNED_URL_EXPIRY_INVALID');
  return freeze({ ownerRef: token(ownerRef, 'SECURITY_SIGNED_URL_OWNER_REQUIRED'),
    objectRef: token(objectRef, 'SECURITY_SIGNED_URL_OBJECT_REQUIRED'), expiresInSeconds,
    publicAcl: false, url: null, automaticIssue: false, reason: 'SERVER_OWNER_CHECK_REQUIRED' });
}

export function authorizeRole({ role, permission, ownsResource = false, policy } = {}) {
  const normalized = validateSecurityPolicy(policy);
  requireValue(ROLES.includes(role), 'SECURITY_ROLE_INVALID');
  const allowedByRole = normalized.rolePermissions[role].includes(permission);
  const ownerPermission = permission.startsWith('OWN_');
  const allowed = allowedByRole && (!ownerPermission || ownsResource);
  return freeze({ role, permission, allowed, reason: allowed ? 'ROLE_ALLOWED'
    : ownerPermission && !ownsResource ? 'OWNER_SCOPE_REQUIRED' : 'ROLE_DENIED',
  productionPolicyEnabled: normalized.productionEnabled });
}

export function normalizeModerationReport(raw) {
  requireValue(['COPYRIGHT', 'ABUSE', 'MALWARE', 'PRIVACY', 'OTHER'].includes(raw?.reason),
    'SECURITY_REPORT_REASON_INVALID');
  requireValue(raw.reporterRef && raw.contentRef && raw.submittedAt,
    'SECURITY_REPORT_FIELDS_REQUIRED');
  return freeze({ schema: 'earthus.moderation-report.v1', id: token(raw.id,
    'SECURITY_REPORT_ID_INVALID'), reporterRef: token(raw.reporterRef,
    'SECURITY_REPORTER_REF_INVALID'), contentRef: token(raw.contentRef,
    'SECURITY_REPORT_CONTENT_REF_INVALID'), reason: raw.reason, submittedAt: utc(raw.submittedAt),
  state: 'QUEUED', publicVisible: false, automaticDecision: false });
}

export function abuseRateDecision({ usedReports, policy } = {}) {
  const normalized = validateSecurityPolicy(policy);
  requireValue(Number.isInteger(usedReports) && usedReports >= 0,
    'SECURITY_ABUSE_USAGE_INVALID');
  const allowed = normalized.productionEnabled && usedReports < normalized.abuseRateLimit.reports;
  return freeze({ allowed, reason: !normalized.productionEnabled ? 'PRODUCTION_GATE_CLOSED'
    : allowed ? 'WITHIN_LIMIT' : 'ABUSE_RATE_LIMIT_REACHED',
  limit: normalized.abuseRateLimit.reports, windowSeconds: normalized.abuseRateLimit.windowSeconds });
}

export function malwareDecision(raw, { policy } = {}) {
  const normalized = validateSecurityPolicy(policy);
  requireValue(['PASS', 'FAIL', 'ERROR', 'NOT_SCANNED'].includes(raw?.scanStatus),
    'SECURITY_SCAN_STATUS_INVALID');
  requireValue(raw.scannerRef && raw.scannedAt, 'SECURITY_SCAN_EVIDENCE_REQUIRED');
  const release = normalized.productionEnabled && raw.scanStatus === 'PASS';
  return freeze({ contentRef: token(raw.contentRef, 'SECURITY_SCAN_CONTENT_REF_REQUIRED'),
    scanStatus: raw.scanStatus, scannerRef: token(raw.scannerRef,
    'SECURITY_SCANNER_REF_INVALID'), scannedAt: utc(raw.scannedAt), release,
  disposition: release ? 'RELEASE_FROM_QUARANTINE' : 'KEEP_QUARANTINED' });
}

const WORKFLOW_TRANSITIONS = Object.freeze({ RECEIVED: ['TRIAGED'], TRIAGED: ['CONTENT_HIDDEN', 'REJECTED'],
  CONTENT_HIDDEN: ['RESOLVED'], REJECTED: [], RESOLVED: [] });
export function transitionCase(rawCase, nextState, { actorRef, at, evidenceRef } = {}) {
  requireValue(WORKFLOW_TRANSITIONS[rawCase?.state]?.includes(nextState),
    'SECURITY_CASE_TRANSITION_INVALID');
  return freeze({ ...rawCase, state: nextState, updatedAt: utc(at),
    audit: freeze([...(rawCase.audit || []), { actorRef: token(actorRef,
      'SECURITY_CASE_ACTOR_REQUIRED'), at: utc(at), from: rawCase.state, to: nextState,
    evidenceRef: token(evidenceRef, 'SECURITY_CASE_EVIDENCE_REQUIRED') }]),
  automaticExternalAction: false });
}
