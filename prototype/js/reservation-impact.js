// Earthus PR-09 Reservation Impact shadow contract.
// It accepts evidence snapshots and proposes a user-visible impact only. It cannot send a
// notification, create/change/cancel a reservation, call a provider, or infer provider success.

export const RESERVATION_IMPACT_SCHEMAS = Object.freeze({
  watch: 'earthus.reservation-watch.v1',
  snapshot: 'earthus.reservation-provider-snapshot.v1',
  impact: 'earthus.reservation-impact.v1',
  acknowledgement: 'earthus.reservation-impact-acknowledgement.v1',
});

export class ReservationImpactError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'ReservationImpactError'; this.code = code; this.details = Object.freeze({ ...details }); }
}

const fail = (code, details = {}) => { throw new ReservationImpactError(code, details); };
const need = (value, code, details) => { if (!value) fail(code, details); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const utc = (value, code) => { const date = new Date(value); need(Number.isFinite(date.getTime()), code); return date.toISOString(); };
const opaqueId = (value, code) => { const id = String(value || '').trim(); need(/^[A-Za-z0-9._:-]{3,160}$/.test(id), code); return id; };
const stable = value => JSON.stringify(value);
const hash = value => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const OUTCOMES = new Set(['AVAILABLE', 'LIMITED', 'SOLD_OUT', 'CLOSED', 'UNKNOWN', 'PROVIDER_ERROR']);

export function createReservationWatch({ watchId, subjectRef, providerId, placeId, startUtc, endUtc, createdAtUtc } = {}) {
  const start = utc(startUtc, 'WATCH_START_REQUIRED');
  const end = utc(endUtc, 'WATCH_END_REQUIRED');
  need(Date.parse(end) > Date.parse(start), 'WATCH_WINDOW_INVALID');
  return freeze({
    schemaVersion: RESERVATION_IMPACT_SCHEMAS.watch,
    watchId: opaqueId(watchId, 'WATCH_ID_REQUIRED'),
    subjectRef: opaqueId(subjectRef, 'WATCH_SUBJECT_REF_REQUIRED'),
    providerId: opaqueId(providerId, 'WATCH_PROVIDER_REQUIRED'),
    placeId: opaqueId(placeId, 'WATCH_PLACE_REQUIRED'),
    startUtc: start, endUtc: end, createdAtUtc: utc(createdAtUtc, 'WATCH_CREATED_AT_REQUIRED'),
    execution: { notificationSent: false, providerAction: null, paymentAction: null },
  });
}

export function normalizeProviderSnapshot({ providerId, observedAtUtc, sourceUrl, revision, outcome, availableCount = null, sampleCount = null, authorized = false } = {}) {
  const normalizedOutcome = String(outcome || 'UNKNOWN');
  need(OUTCOMES.has(normalizedOutcome), 'PROVIDER_OUTCOME_INVALID');
  const count = availableCount === null ? null : Number(availableCount);
  need(count === null || (Number.isInteger(count) && count >= 0), 'PROVIDER_AVAILABLE_COUNT_INVALID');
  const n = sampleCount === null ? null : Number(sampleCount);
  need(n === null || (Number.isInteger(n) && n >= 0), 'PROVIDER_SAMPLE_COUNT_INVALID');
  const evidenceReady = authorized === true && typeof sourceUrl === 'string' && /^https:\/\//.test(sourceUrl)
    && typeof revision === 'string' && revision.trim().length > 0;
  return freeze({
    schemaVersion: RESERVATION_IMPACT_SCHEMAS.snapshot,
    providerId: opaqueId(providerId, 'PROVIDER_ID_REQUIRED'),
    observedAtUtc: utc(observedAtUtc, 'PROVIDER_OBSERVED_AT_REQUIRED'),
    sourceUrl: evidenceReady ? sourceUrl : null,
    revision: evidenceReady ? revision.trim() : null,
    outcome: evidenceReady ? normalizedOutcome : 'UNKNOWN',
    availableCount: evidenceReady ? count : null,
    sampleCount: evidenceReady ? n : null,
    authorized: evidenceReady,
    failureReason: evidenceReady ? null : 'PROVIDER_NOT_AUTHORIZED_OR_EVIDENCE_INCOMPLETE',
  });
}

function comparable(watch, snapshot) {
  return snapshot?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.snapshot && snapshot.providerId === watch.providerId;
}

function fingerprint(watch, snapshot) {
  return hash(stable({ watchId: watch.watchId, providerId: snapshot.providerId, revision: snapshot.revision, outcome: snapshot.outcome, availableCount: snapshot.availableCount }));
}

export function evaluateReservationImpact({ watch, previousSnapshot = null, currentSnapshot, evaluatedAtUtc, maxSnapshotAgeSeconds = 300 } = {}) {
  need(watch?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.watch, 'IMPACT_WATCH_REQUIRED');
  need(comparable(watch, currentSnapshot), 'IMPACT_CURRENT_SNAPSHOT_REQUIRED');
  need(Number.isInteger(maxSnapshotAgeSeconds) && maxSnapshotAgeSeconds > 0 && maxSnapshotAgeSeconds <= 900, 'IMPACT_FRESHNESS_POLICY_INVALID');
  const evaluatedAt = utc(evaluatedAtUtc, 'IMPACT_EVALUATED_AT_REQUIRED');
  const ageSeconds = Math.max(0, Math.floor((Date.parse(evaluatedAt) - Date.parse(currentSnapshot.observedAtUtc)) / 1000));
  const base = { schemaVersion: RESERVATION_IMPACT_SCHEMAS.impact, watchId: watch.watchId, evaluatedAtUtc: evaluatedAt, providerId: watch.providerId, providerAction: null, paymentAction: null, notificationSent: false, acknowledgementRequired: false, notificationProposal: null, previousRevision: previousSnapshot?.revision || null, currentRevision: currentSnapshot.revision || null };
  if (!currentSnapshot.authorized || ageSeconds > maxSnapshotAgeSeconds) return freeze({ ...base, state: 'WITHHELD', reasonCodes: [currentSnapshot.authorized ? 'PROVIDER_SNAPSHOT_STALE' : currentSnapshot.failureReason], fingerprint: null, evidence: currentSnapshot });
  if (previousSnapshot && !comparable(watch, previousSnapshot)) return freeze({ ...base, state: 'WITHHELD', reasonCodes: ['PREVIOUS_SNAPSHOT_PROVIDER_MISMATCH'], fingerprint: null, evidence: currentSnapshot });
  const prior = previousSnapshot?.authorized === true ? previousSnapshot : null;
  if (!prior) return freeze({ ...base, state: 'BASELINE_RECORDED', reasonCodes: ['NO_COMPARABLE_PRIOR_EVIDENCE'], fingerprint: null, evidence: currentSnapshot });
  const changed = prior.revision !== currentSnapshot.revision || prior.outcome !== currentSnapshot.outcome || prior.availableCount !== currentSnapshot.availableCount;
  if (!changed) return freeze({ ...base, state: 'NO_CHANGE', reasonCodes: ['PROVIDER_EVIDENCE_UNCHANGED'], fingerprint: null, evidence: currentSnapshot });
  const id = fingerprint(watch, currentSnapshot);
  return freeze({ ...base, state: 'PENDING_USER_CONFIRMATION', reasonCodes: ['PROVIDER_EVIDENCE_CHANGED'], fingerprint: id, acknowledgementRequired: true, notificationProposal: { kind: 'RESERVATION_IMPACT_REVIEW', fingerprint: id, dispatchState: 'NOT_SENT' }, evidence: currentSnapshot });
}

export function deduplicateImpact({ impact, previouslyProposedFingerprints = [] } = {}) {
  need(impact?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.impact, 'DEDUP_IMPACT_REQUIRED');
  const known = new Set(Array.isArray(previouslyProposedFingerprints) ? previouslyProposedFingerprints.map(String) : []);
  if (impact.state !== 'PENDING_USER_CONFIRMATION' || !impact.fingerprint || !known.has(impact.fingerprint)) return freeze({ impact, state: 'NEW_OR_NOT_APPLICABLE', notificationSent: false });
  return freeze({ impact: freeze({ ...impact, state: 'DUPLICATE_WITHHELD', reasonCodes: [...impact.reasonCodes, 'DUPLICATE_FINGERPRINT'] }), state: 'DUPLICATE_WITHHELD', notificationSent: false });
}

export function acknowledgeReservationImpact({ impact, subjectRef, acknowledgedAtUtc, choice } = {}) {
  need(impact?.state === 'PENDING_USER_CONFIRMATION' && impact.acknowledgementRequired === true, 'ACKNOWLEDGEMENT_NOT_AVAILABLE');
  need(['REVIEWED', 'DISMISSED'].includes(choice), 'ACKNOWLEDGEMENT_CHOICE_INVALID');
  return freeze({ schemaVersion: RESERVATION_IMPACT_SCHEMAS.acknowledgement, watchId: impact.watchId, fingerprint: impact.fingerprint, subjectRef: opaqueId(subjectRef, 'ACKNOWLEDGEMENT_SUBJECT_REQUIRED'), choice, acknowledgedAtUtc: utc(acknowledgedAtUtc, 'ACKNOWLEDGEMENT_AT_REQUIRED'), providerAction: null, paymentAction: null, notificationSent: false });
}
