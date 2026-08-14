// Aetherus release QA local shadow (Sheets 279, 284, 286, 291, 295).
// It validates test evidence and creates non-executing rollback/hotfix plans.

export const RELEASE_QA_POLICY_SCHEMA = 'earthus.aetherus-release-qa-policy.v1';

export class ReleaseQaContractError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'ReleaseQaContractError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
const fail = (code, details = {}) => { throw new ReleaseQaContractError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,255}$/.test(output), code); return output;
};
const utc = (value, code = 'RELEASE_QA_UTC_REQUIRED') => {
  requireValue(/(?:Z|[+-]\d{2}:\d{2})$/.test(String(value || '')), code);
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export function validateReleaseQaPolicy(raw) {
  requireValue(raw?.schema === RELEASE_QA_POLICY_SCHEMA, 'RELEASE_QA_POLICY_SCHEMA_INVALID');
  requireValue(['DRAFT', 'APPROVED'].includes(raw.status), 'RELEASE_QA_POLICY_STATUS_INVALID');
  const requiredSheets = ['279', '284', '286', '291', '295'];
  requireValue(raw.evidenceBySheet && requiredSheets.every(sheet =>
    Array.isArray(raw.evidenceBySheet[sheet]) && raw.evidenceBySheet[sheet].length > 0),
  'RELEASE_QA_EVIDENCE_MATRIX_INCOMPLETE');
  const evidenceBySheet = Object.fromEntries(requiredSheets.map(sheet => [sheet,
    [...new Set(raw.evidenceBySheet[sheet].map(item => token(item,
      'RELEASE_QA_EVIDENCE_PATH_INVALID')))]]));
  if (raw.productionEnabled === true) requireValue(raw.status === 'APPROVED'
    && raw.approvedAt && raw.approvedBy && raw.releaseCandidateEvidence,
  'RELEASE_QA_PRODUCTION_EVIDENCE_REQUIRED');
  return freeze({ schema: RELEASE_QA_POLICY_SCHEMA, revision: token(raw.revision,
    'RELEASE_QA_POLICY_REVISION_INVALID'), status: raw.status,
    productionEnabled: raw.productionEnabled === true, evidenceBySheet,
    releaseCandidateEvidence: raw.releaseCandidateEvidence || null,
    approvedAt: raw.approvedAt || null, approvedBy: raw.approvedBy || null });
}

export function formatZonedInstant(instant, { timeZone, locale = 'en-US' } = {}) {
  const normalizedInstant = utc(instant);
  requireValue(timeZone, 'RELEASE_QA_TIMEZONE_REQUIRED');
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      timeZoneName: 'longOffset' });
  } catch { fail('RELEASE_QA_TIMEZONE_INVALID'); }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(normalizedInstant))
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  requireValue(parts.year && parts.month && parts.day && parts.hour && parts.minute && parts.second
    && parts.timeZoneName, 'RELEASE_QA_TIMEZONE_FORMAT_INCOMPLETE');
  return freeze({ instantUtc: normalizedInstant, timeZone, locale,
    localKey: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
    offset: parts.timeZoneName, sourceInstantPreserved: true });
}

export function compareDstFold(firstInstant, secondInstant, options = {}) {
  const first = formatZonedInstant(firstInstant, options);
  const second = formatZonedInstant(secondInstant, options);
  const repeated = first.localKey === second.localKey && first.offset !== second.offset;
  return freeze({ status: repeated ? 'AMBIGUOUS_LOCAL_TIME' : 'DISTINCT_LOCAL_TIME',
    first, second, collisionPreventedByUtc: repeated });
}

const VISION_TRANSITIONS = Object.freeze({ IDLE: ['TARGET_SELECTED', 'BLOCKED'],
  TARGET_SELECTED: ['PREPARING', 'IDLE', 'BLOCKED'], PREPARING: ['TRAVELING', 'IDLE', 'BLOCKED'],
  TRAVELING: ['PAUSED', 'ARRIVED', 'EXITED', 'BLOCKED'], PAUSED: ['TRAVELING', 'EXITED', 'BLOCKED'],
  ARRIVED: ['EXITED'], EXITED: ['IDLE'], BLOCKED: ['IDLE'] });

export function transitionVisionTravel(state, command) {
  requireValue(Number.isInteger(state?.revision) && command?.expectedRevision === state.revision,
    'RELEASE_QA_VISION_REVISION_CONFLICT');
  requireValue(VISION_TRANSITIONS[state.state]?.includes(command.nextState),
    'RELEASE_QA_VISION_TRANSITION_INVALID');
  const targetRef = command.nextState === 'IDLE' ? null
    : command.targetRef || state.targetRef || null;
  if (!['IDLE', 'BLOCKED', 'EXITED'].includes(command.nextState)) requireValue(targetRef,
    'RELEASE_QA_VISION_TARGET_REQUIRED');
  return freeze({ schema: 'earthus.aetherus-vision-travel-state.v1', state: command.nextState,
    revision: state.revision + 1, targetRef: targetRef ? token(targetRef,
      'RELEASE_QA_VISION_TARGET_INVALID') : null, updatedAt: utc(command.at),
  history: freeze([...(state.history || []), { revision: state.revision + 1,
    from: state.state, to: command.nextState, at: utc(command.at),
    evidenceRef: token(command.evidenceRef, 'RELEASE_QA_VISION_EVIDENCE_REQUIRED') }]),
  timerDriven: false, deviceVerified: false });
}

export function buildDataRollbackPlan(raw) {
  requireValue(raw?.dataset && raw?.currentRevision && raw?.lastGoodRevision
    && raw.currentRevision !== raw.lastGoodRevision, 'RELEASE_QA_ROLLBACK_REVISIONS_INVALID');
  requireValue(raw.backupEvidenceRef && raw.readerCompatibilityEvidenceRef
    && raw.approval?.actorRef && raw.approval?.reason && raw.approval?.approvedAt,
  'RELEASE_QA_ROLLBACK_EVIDENCE_REQUIRED');
  return freeze({ schema: 'earthus.data-rollback-plan.v1', dataset: token(raw.dataset,
    'RELEASE_QA_ROLLBACK_DATASET_INVALID'), currentRevision: token(raw.currentRevision,
    'RELEASE_QA_CURRENT_REVISION_INVALID'), targetRevision: token(raw.lastGoodRevision,
    'RELEASE_QA_LAST_GOOD_REVISION_INVALID'), backupEvidenceRef: token(raw.backupEvidenceRef,
    'RELEASE_QA_BACKUP_EVIDENCE_INVALID'), readerCompatibilityEvidenceRef:
    token(raw.readerCompatibilityEvidenceRef, 'RELEASE_QA_READER_EVIDENCE_INVALID'),
  approval: { actorRef: token(raw.approval.actorRef, 'RELEASE_QA_APPROVER_INVALID'),
    reason: String(raw.approval.reason), approvedAt: utc(raw.approval.approvedAt) },
  automaticExecute: false, destructiveDeleteAllowed: false, auditRequired: true });
}

export function buildHotfixPlan(raw) {
  requireValue(raw?.incidentRef && raw?.failureDescription && Array.isArray(raw.changedFiles)
    && raw.changedFiles.length > 0 && Array.isArray(raw.requiredTests)
    && raw.requiredTests.length > 0 && raw.rollbackRevision,
  'RELEASE_QA_HOTFIX_INPUT_INCOMPLETE');
  requireValue(raw.changedFiles.every(file => !file.includes('*') && !file.endsWith('/')),
    'RELEASE_QA_HOTFIX_SCOPE_TOO_BROAD');
  return freeze({ schema: 'earthus.hotfix-plan.v1', incidentRef: token(raw.incidentRef,
    'RELEASE_QA_HOTFIX_INCIDENT_INVALID'), failureDescription: String(raw.failureDescription),
  changedFiles: raw.changedFiles.map(file => token(file, 'RELEASE_QA_HOTFIX_FILE_INVALID')),
  requiredTests: raw.requiredTests.map(test => token(test, 'RELEASE_QA_HOTFIX_TEST_INVALID')),
  rollbackRevision: token(raw.rollbackRevision, 'RELEASE_QA_HOTFIX_ROLLBACK_INVALID'),
  automaticDeploy: false, productionApprovalRequired: true, unrelatedChangesAllowed: false });
}
