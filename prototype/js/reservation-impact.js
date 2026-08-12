// Earthus PR-09 Weather-aware Reservation Impact shadow contract.
// 예약 window와 검증된 Decision/provider evidence를 교차해 검토 제안만 만든다.
// 알림 전송·예약 생성/변경/취소·결제·provider 호출은 이 모듈의 capability가 아니다.

export const RESERVATION_IMPACT_VERSION = 'earthus.reservation-impact-engine.v1.1.0';
export const RESERVATION_IMPACT_SCHEMAS = Object.freeze({
  watch: 'earthus.reservation-watch.v1',
  snapshot: 'earthus.reservation-provider-snapshot.v1',
  alternative: 'earthus.reservation-alternative-candidate.v1',
  impact: 'earthus.reservation-impact.v2',
  acknowledgement: 'earthus.reservation-impact-acknowledgement.v1',
});

export class ReservationImpactError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'ReservationImpactError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, details = {}) => { throw new ReservationImpactError(code, details); };
const need = (value, code, details) => { if (!value) fail(code, details); };
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const UTC_PATTERN = /(Z|[+-]\d\d:\d\d)$/;
const utc = (value, code) => {
  need(typeof value === 'string' && UTC_PATTERN.test(value), code);
  const date = new Date(value);
  need(Number.isFinite(date.getTime()), code);
  return date.toISOString();
};
const opaqueId = (value, code) => {
  const id = String(value || '').trim();
  need(/^[A-Za-z0-9._:-]{3,160}$/.test(id), code);
  return id;
};
const subjectId = value => {
  const id = String(value || '').trim();
  need(/^sub_[a-z0-9_-]{8,80}$/.test(id), 'WATCH_SUBJECT_REF_REQUIRED');
  return id;
};
const httpsUrl = (value, code) => {
  try {
    const url = new URL(String(value || ''));
    need(url.protocol === 'https:' && !url.username && !url.password, code);
    return url.href;
  } catch {
    fail(code);
  }
};
const hash = value => {
  let h = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    h ^= BigInt(value.charCodeAt(index));
    h = BigInt.asUintN(64, h * 0x100000001b3n);
  }
  return h.toString(16).padStart(16, '0');
};
const stable = value => JSON.stringify(value);
const OUTCOMES = new Set(['AVAILABLE', 'LIMITED', 'SOLD_OUT', 'CLOSED', 'UNKNOWN', 'PROVIDER_ERROR']);
const IMPACT_LEVELS = Object.freeze(['INFO', 'WATCH', 'ACTION_REQUIRED', 'BLOCKED', 'UNKNOWN']);
const LIMITING_SAFETY = new Set(['WARNING', 'DANGER', 'CLOSED']);

export function createReservationWatch({
  watchId, reservationRef = null, subjectRef, providerId, placeId, activityProfileId,
  startUtc, endUtc, createdAtUtc,
} = {}) {
  const start = utc(startUtc, 'WATCH_START_REQUIRED');
  const end = utc(endUtc, 'WATCH_END_REQUIRED');
  const created = utc(createdAtUtc, 'WATCH_CREATED_AT_REQUIRED');
  need(Date.parse(end) > Date.parse(start), 'WATCH_WINDOW_INVALID');
  const id = opaqueId(watchId, 'WATCH_ID_REQUIRED');
  return freeze({
    schemaVersion: RESERVATION_IMPACT_SCHEMAS.watch,
    watchId: id,
    reservationRef: opaqueId(reservationRef || id, 'WATCH_RESERVATION_REF_REQUIRED'),
    subjectRef: subjectId(subjectRef),
    providerId: opaqueId(providerId, 'WATCH_PROVIDER_REQUIRED'),
    placeId: opaqueId(placeId, 'WATCH_PLACE_REQUIRED'),
    activityProfileId: opaqueId(activityProfileId, 'WATCH_ACTIVITY_PROFILE_REQUIRED'),
    startUtc: start,
    endUtc: end,
    createdAtUtc: created,
    execution: freeze({ notificationSent: false, providerAction: null, paymentAction: null }),
  });
}

export function normalizeProviderSnapshot({
  providerId, sourceRecordId, observedAtUtc, sourceUrl, providerPolicyUrl, revision,
  supersedesRevision = null, outcome, availableCount = null, sampleCount = null,
  authorized = false,
} = {}) {
  const normalizedOutcome = String(outcome || 'UNKNOWN');
  need(OUTCOMES.has(normalizedOutcome), 'PROVIDER_OUTCOME_INVALID');
  const count = availableCount === null ? null : Number(availableCount);
  need(count === null || (Number.isInteger(count) && count >= 0), 'PROVIDER_AVAILABLE_COUNT_INVALID');
  const n = sampleCount === null ? null : Number(sampleCount);
  need(n === null || (Number.isInteger(n) && n >= 0), 'PROVIDER_SAMPLE_COUNT_INVALID');
  let normalizedSource = null;
  let normalizedPolicy = null;
  let failureReason = null;
  try { normalizedSource = httpsUrl(sourceUrl, 'PROVIDER_SOURCE_URL_INVALID'); } catch { failureReason = 'PROVIDER_SOURCE_URL_INVALID'; }
  try { normalizedPolicy = httpsUrl(providerPolicyUrl, 'PROVIDER_POLICY_URL_INVALID'); } catch { failureReason ||= 'PROVIDER_POLICY_URL_INVALID'; }
  const revisionReady = typeof revision === 'string' && revision.trim().length > 0;
  const recordReady = typeof sourceRecordId === 'string' && sourceRecordId.trim().length > 0;
  const countConflict = (normalizedOutcome === 'AVAILABLE' && count === 0)
    || (['SOLD_OUT', 'CLOSED'].includes(normalizedOutcome) && count !== null && count !== 0);
  if (countConflict) failureReason ||= 'PROVIDER_OUTCOME_COUNT_CONFLICT';
  if (!revisionReady) failureReason ||= 'PROVIDER_REVISION_MISSING';
  if (!recordReady) failureReason ||= 'PROVIDER_SOURCE_RECORD_ID_MISSING';
  if (!Number.isInteger(n) || n < 1) failureReason ||= 'PROVIDER_SAMPLE_COUNT_MISSING';
  if (authorized !== true) failureReason ||= 'PROVIDER_NOT_AUTHORIZED';
  const evidenceReady = failureReason === null;
  return freeze({
    schemaVersion: RESERVATION_IMPACT_SCHEMAS.snapshot,
    providerId: opaqueId(providerId, 'PROVIDER_ID_REQUIRED'),
    sourceRecordId: evidenceReady ? sourceRecordId.trim() : null,
    observedAtUtc: utc(observedAtUtc, 'PROVIDER_OBSERVED_AT_REQUIRED'),
    sourceUrl: evidenceReady ? normalizedSource : null,
    providerPolicyUrl: evidenceReady ? normalizedPolicy : null,
    revision: evidenceReady ? revision.trim() : null,
    supersedesRevision: evidenceReady && supersedesRevision ? String(supersedesRevision).trim() : null,
    outcome: evidenceReady ? normalizedOutcome : 'UNKNOWN',
    availableCount: evidenceReady ? count : null,
    sampleCount: evidenceReady ? n : null,
    authorized: evidenceReady,
    failureReason: evidenceReady ? null : failureReason,
  });
}

function comparableProvider(watch, snapshot) {
  return snapshot?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.snapshot
    && snapshot.providerId === watch.providerId;
}

function windowCovers(watch, decision) {
  return Date.parse(decision?.timeWindow?.start) <= Date.parse(watch.startUtc)
    && Date.parse(decision?.timeWindow?.end) >= Date.parse(watch.endUtc);
}

function inspectDecision(watch, decision, evaluatedAtUtc, maxDecisionAgeSeconds, enforceFresh = true) {
  if (!decision || decision.schemaVersion !== 'earthus.activity-decision.v1') {
    return { ready: false, reason: 'RESERVATION_DECISION_MISSING' };
  }
  if (decision.placeId !== watch.placeId) return { ready: false, reason: 'RESERVATION_DECISION_PLACE_MISMATCH' };
  if (decision.activityProfile?.id !== watch.activityProfileId) {
    return { ready: false, reason: 'RESERVATION_DECISION_PROFILE_MISMATCH' };
  }
  if (!windowCovers(watch, decision)) return { ready: false, reason: 'RESERVATION_DECISION_WINDOW_INCOMPLETE' };
  let decisionAt;
  try { decisionAt = utc(decision.evaluatedAt, 'RESERVATION_DECISION_TIME_MISSING'); } catch (error) {
    return { ready: false, reason: error.code || 'RESERVATION_DECISION_TIME_MISSING' };
  }
  const ageSeconds = Math.floor((Date.parse(evaluatedAtUtc) - Date.parse(decisionAt)) / 1000);
  if (ageSeconds < 0) return { ready: false, reason: 'RESERVATION_DECISION_FROM_FUTURE' };
  if (enforceFresh && ageSeconds > maxDecisionAgeSeconds) return { ready: false, reason: 'RESERVATION_DECISION_STALE' };
  const revisions = Array.isArray(decision.inputSignalIds)
    ? [...new Set(decision.inputSignalIds.map(String).filter(Boolean))].sort()
    : [];
  if (!decision.decisionId || !revisions.length) return { ready: false, reason: 'RESERVATION_DECISION_REVISION_MISSING' };
  return {
    ready: true,
    evidence: freeze({
      decisionId: String(decision.decisionId),
      evaluatedAtUtc: decisionAt,
      placeId: decision.placeId,
      activityProfileId: decision.activityProfile.id,
      timeWindow: freeze({ start: decision.timeWindow.start, end: decision.timeWindow.end }),
      safetyStatus: String(decision.axes?.safety?.status || 'UNKNOWN'),
      safetyApplies: decision.axes?.safety?.applies ?? null,
      safetyBlocks: decision.axes?.safety?.blocksPositiveRecommendation !== false,
      safetyReason: decision.axes?.safety?.reason || null,
      confidenceLevel: String(decision.axes?.forecastConfidence?.confidenceLevel || 'UNKNOWN'),
      confidenceScore: decision.axes?.forecastConfidence?.score !== null
        && decision.axes?.forecastConfidence?.score !== undefined
        && Number.isFinite(Number(decision.axes?.forecastConfidence?.score))
        ? Number(decision.axes.forecastConfidence.score) : null,
      recommendationState: decision.recommendation?.state || 'WITHHELD',
      recommendationReason: decision.recommendation?.reason || null,
      signalRevisions: revisions,
      n: revisions.length,
    }),
  };
}

function providerInspection(snapshot, evaluatedAtUtc, maxSnapshotAgeSeconds) {
  if (!snapshot.authorized) return { ready: false, reason: snapshot.failureReason || 'PROVIDER_EVIDENCE_INCOMPLETE' };
  const ageSeconds = Math.floor((Date.parse(evaluatedAtUtc) - Date.parse(snapshot.observedAtUtc)) / 1000);
  if (ageSeconds < 0) return { ready: false, reason: 'PROVIDER_SNAPSHOT_FROM_FUTURE' };
  if (ageSeconds > maxSnapshotAgeSeconds) return { ready: false, reason: 'PROVIDER_SNAPSHOT_STALE' };
  return { ready: true };
}

function decisionReasons(evidence) {
  return [evidence.safetyReason, evidence.recommendationReason]
    .filter(Boolean).map(String);
}

function changedReasons(previousDecision, currentDecision, previousProvider, currentProvider) {
  const reasons = [];
  if (previousDecision?.safetyStatus !== currentDecision.safetyStatus) reasons.push(`SAFETY:${previousDecision?.safetyStatus || 'NONE'}→${currentDecision.safetyStatus}`);
  if (previousDecision?.confidenceLevel !== currentDecision.confidenceLevel) reasons.push(`CONFIDENCE:${previousDecision?.confidenceLevel || 'NONE'}→${currentDecision.confidenceLevel}`);
  if (previousDecision?.recommendationReason !== currentDecision.recommendationReason && currentDecision.recommendationReason) reasons.push(currentDecision.recommendationReason);
  if (previousProvider?.outcome !== currentProvider.outcome) reasons.push(`PROVIDER:${previousProvider?.outcome || 'NONE'}→${currentProvider.outcome}`);
  if (previousProvider?.availableCount !== currentProvider.availableCount) reasons.push('PROVIDER_AVAILABLE_COUNT_CHANGED');
  if (previousProvider?.revision !== currentProvider.revision) reasons.push('PROVIDER_REVISION_CHANGED');
  return [...new Set(reasons)];
}

function impactLevel(currentDecision, previousDecision, currentProvider, changed) {
  const safety = currentDecision.safetyStatus;
  if (safety === 'DANGER' || safety === 'CLOSED' || currentProvider.outcome === 'CLOSED') return 'BLOCKED';
  if (safety === 'UNKNOWN' || currentDecision.safetyApplies === false
      || currentDecision.confidenceLevel === 'UNKNOWN'
      || ['UNKNOWN', 'PROVIDER_ERROR'].includes(currentProvider.outcome)) return 'UNKNOWN';
  if (safety === 'WARNING' || (currentDecision.safetyBlocks && LIMITING_SAFETY.has(safety))
      || ['SOLD_OUT', 'LIMITED'].includes(currentProvider.outcome)) return 'ACTION_REQUIRED';
  const confidenceDrop = previousDecision != null
    && previousDecision.confidenceScore !== null
    && currentDecision.confidenceScore !== null
    && previousDecision.confidenceScore - currentDecision.confidenceScore >= 20;
  if (safety === 'CAUTION' || ['LOW', 'VERY_LOW'].includes(currentDecision.confidenceLevel) || confidenceDrop) return 'WATCH';
  return changed.length ? 'INFO' : null;
}

export function normalizeAlternativeCandidates({ watch, candidates = [] } = {}) {
  need(watch?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.watch, 'ALTERNATIVE_WATCH_REQUIRED');
  need(Array.isArray(candidates) && candidates.length <= 5, 'ALTERNATIVE_LIMIT_EXCEEDED');
  const seen = new Set();
  return freeze(candidates.map((candidate, index) => {
    const placeId = opaqueId(candidate?.placeId, `ALTERNATIVE_PLACE_REQUIRED:${index}`);
    const start = utc(candidate?.timeWindow?.start, `ALTERNATIVE_START_REQUIRED:${index}`);
    const end = utc(candidate?.timeWindow?.end, `ALTERNATIVE_END_REQUIRED:${index}`);
    need(Date.parse(end) > Date.parse(start), `ALTERNATIVE_WINDOW_INVALID:${index}`);
    const decisionId = opaqueId(candidate?.decisionId, `ALTERNATIVE_DECISION_REQUIRED:${index}`);
    const evidenceRefs = Array.isArray(candidate?.evidenceRefs)
      ? [...new Set(candidate.evidenceRefs.map(String).filter(Boolean))].sort() : [];
    need(evidenceRefs.length > 0, `ALTERNATIVE_EVIDENCE_REQUIRED:${index}`);
    const key = stable([placeId, start, end]);
    need(!seen.has(key), `ALTERNATIVE_DUPLICATE:${index}`);
    seen.add(key);
    need(!(placeId === watch.placeId && start === watch.startUtc && end === watch.endUtc), `ALTERNATIVE_SAME_AS_WATCH:${index}`);
    need(candidate?.price === undefined && candidate?.rank === undefined
      && candidate?.availableCount === undefined, `ALTERNATIVE_UNVERIFIED_FACT_FORBIDDEN:${index}`);
    return freeze({
      schemaVersion: RESERVATION_IMPACT_SCHEMAS.alternative,
      placeId,
      timeWindow: freeze({ start, end }),
      decisionId,
      evidenceRefs,
      providerAvailability: 'UNKNOWN',
      price: null,
      rank: null,
      sponsored: false,
      claim: 'REVIEW_CANDIDATE_NOT_VERIFIED_AVAILABILITY',
    });
  }));
}

function impactFingerprint(watch, currentDecision, currentProvider, level) {
  return `impact_${hash(stable({
    reservationRef: watch.reservationRef,
    level,
    decisionId: currentDecision.decisionId,
    signalRevisions: currentDecision.signalRevisions,
    providerRevision: currentProvider.revision,
    providerOutcome: currentProvider.outcome,
  }))}`;
}

function baseImpact(watch, evaluatedAt, currentSnapshot) {
  return {
    schemaVersion: RESERVATION_IMPACT_SCHEMAS.impact,
    engineVersion: RESERVATION_IMPACT_VERSION,
    impactId: null,
    watchId: watch.watchId,
    reservationRef: watch.reservationRef,
    evaluatedAtUtc: evaluatedAt,
    providerId: watch.providerId,
    impactLevel: 'UNKNOWN',
    providerAvailability: currentSnapshot?.outcome || 'UNKNOWN',
    providerPolicyUrl: currentSnapshot?.providerPolicyUrl || null,
    previousDecisionId: null,
    currentDecisionId: null,
    changedReasons: [],
    alternatives: [],
    notificationKey: null,
    correctionOfFingerprint: null,
    providerAction: null,
    paymentAction: null,
    notificationSent: false,
    acknowledgementRequired: false,
    notificationProposal: null,
    executionRequirements: freeze({
      explicitConfirmation: true,
      latestProviderPolicy: true,
      idempotencyKey: true,
      stepUpAuth: true,
      providerReceiptVerification: true,
    }),
  };
}

export function evaluateReservationImpact({
  watch,
  previousSnapshot = null,
  currentSnapshot,
  previousDecision = null,
  currentDecision,
  alternativeCandidates = [],
  previousImpact = null,
  evaluatedAtUtc,
  maxSnapshotAgeSeconds = 300,
  maxDecisionAgeSeconds = 900,
} = {}) {
  need(watch?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.watch, 'IMPACT_WATCH_REQUIRED');
  need(comparableProvider(watch, currentSnapshot), 'IMPACT_CURRENT_SNAPSHOT_REQUIRED');
  need(Number.isInteger(maxSnapshotAgeSeconds) && maxSnapshotAgeSeconds > 0 && maxSnapshotAgeSeconds <= 900, 'IMPACT_FRESHNESS_POLICY_INVALID');
  need(Number.isInteger(maxDecisionAgeSeconds) && maxDecisionAgeSeconds > 0 && maxDecisionAgeSeconds <= 1800, 'IMPACT_DECISION_FRESHNESS_POLICY_INVALID');
  const evaluatedAt = utc(evaluatedAtUtc, 'IMPACT_EVALUATED_AT_REQUIRED');
  const base = baseImpact(watch, evaluatedAt, currentSnapshot);
  const provider = providerInspection(currentSnapshot, evaluatedAt, maxSnapshotAgeSeconds);
  if (!provider.ready) {
    return freeze({ ...base, state: 'WITHHELD', reasonCodes: [provider.reason], evidence: currentSnapshot });
  }
  if (previousSnapshot && !comparableProvider(watch, previousSnapshot)) {
    return freeze({ ...base, state: 'WITHHELD', reasonCodes: ['PREVIOUS_SNAPSHOT_PROVIDER_MISMATCH'], evidence: currentSnapshot });
  }
  if (previousSnapshot?.authorized && Date.parse(previousSnapshot.observedAtUtc) > Date.parse(currentSnapshot.observedAtUtc)) {
    return freeze({ ...base, state: 'WITHHELD', reasonCodes: ['PROVIDER_SNAPSHOT_OUT_OF_ORDER'], evidence: currentSnapshot });
  }
  const current = inspectDecision(watch, currentDecision, evaluatedAt, maxDecisionAgeSeconds);
  if (!current.ready) {
    return freeze({ ...base, state: 'WITHHELD', reasonCodes: [current.reason], evidence: currentSnapshot });
  }
  let previous = null;
  if (previousDecision) {
    const inspected = inspectDecision(watch, previousDecision, evaluatedAt, maxDecisionAgeSeconds, false);
    if (!inspected.ready) {
      return freeze({ ...base, state: 'WITHHELD', reasonCodes: [`PREVIOUS_${inspected.reason}`], evidence: currentSnapshot });
    }
    if (Date.parse(inspected.evidence.evaluatedAtUtc) > Date.parse(current.evidence.evaluatedAtUtc)) {
      return freeze({ ...base, state: 'WITHHELD', reasonCodes: ['RESERVATION_DECISION_OUT_OF_ORDER'], evidence: currentSnapshot });
    }
    previous = inspected.evidence;
  }
  const priorProvider = previousSnapshot?.authorized ? previousSnapshot : null;
  const alternatives = normalizeAlternativeCandidates({ watch, candidates: alternativeCandidates });
  const changed = changedReasons(previous, current.evidence, priorProvider, currentSnapshot);
  const level = impactLevel(current.evidence, previous, currentSnapshot, changed);
  const completePrior = previous && priorProvider;
  if (!completePrior && !['BLOCKED', 'ACTION_REQUIRED', 'UNKNOWN'].includes(level)) {
    return freeze({
      ...base,
      state: 'BASELINE_RECORDED',
      reasonCodes: ['NO_COMPARABLE_PRIOR_EVIDENCE'],
      currentDecisionId: current.evidence.decisionId,
      providerAvailability: currentSnapshot.outcome,
      evidence: freeze({ decision: current.evidence, provider: currentSnapshot }),
    });
  }
  if (completePrior && level === null) {
    return freeze({
      ...base,
      state: 'NO_CHANGE',
      reasonCodes: ['RESERVATION_EVIDENCE_UNCHANGED'],
      previousDecisionId: previous.decisionId,
      currentDecisionId: current.evidence.decisionId,
      impactLevel: 'INFO',
      evidence: freeze({ decision: current.evidence, provider: currentSnapshot }),
    });
  }
  const resolvedLevel = IMPACT_LEVELS.includes(level) ? level : 'UNKNOWN';
  const id = impactFingerprint(watch, current.evidence, currentSnapshot, resolvedLevel);
  const correctionOf = previousImpact?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.impact
    && previousImpact.watchId === watch.watchId
    && previousImpact.fingerprint && previousImpact.fingerprint !== id
    ? previousImpact.fingerprint : null;
  return freeze({
    ...base,
    impactId: `ri_${hash(`${watch.watchId}:${id}`)}`,
    state: 'PENDING_USER_CONFIRMATION',
    impactLevel: resolvedLevel,
    reasonCodes: resolvedLevel === 'UNKNOWN'
      ? ['RESERVATION_IMPACT_UNKNOWN_REVIEW_REQUIRED', ...decisionReasons(current.evidence)]
      : ['RESERVATION_EVIDENCE_CHANGED'],
    previousDecisionId: previous?.decisionId || null,
    currentDecisionId: current.evidence.decisionId,
    changedReasons: changed,
    alternatives,
    fingerprint: id,
    notificationKey: `reservation_${hash(stable([watch.reservationRef, current.evidence.signalRevisions, currentSnapshot.revision, resolvedLevel]))}`,
    correctionOfFingerprint: correctionOf,
    acknowledgementRequired: true,
    notificationProposal: freeze({
      kind: resolvedLevel === 'BLOCKED' ? 'SAFETY_RESERVATION_REVIEW' : 'RESERVATION_IMPACT_REVIEW',
      fingerprint: id,
      dispatchState: 'NOT_SENT',
      commercialContentAllowed: false,
    }),
    evidence: freeze({ decision: current.evidence, provider: currentSnapshot }),
  });
}

export function deduplicateImpact({ impact, previouslyProposedFingerprints = [] } = {}) {
  need(impact?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.impact, 'DEDUP_IMPACT_REQUIRED');
  const known = new Set(Array.isArray(previouslyProposedFingerprints)
    ? previouslyProposedFingerprints.map(String) : []);
  if (impact.state !== 'PENDING_USER_CONFIRMATION' || !impact.fingerprint || !known.has(impact.fingerprint)) {
    return freeze({ impact, state: 'NEW_OR_NOT_APPLICABLE', notificationSent: false });
  }
  return freeze({
    impact: freeze({
      ...impact,
      state: 'DUPLICATE_WITHHELD',
      reasonCodes: [...impact.reasonCodes, 'DUPLICATE_FINGERPRINT'],
      notificationProposal: impact.notificationProposal
        ? freeze({ ...impact.notificationProposal, dispatchState: 'DUPLICATE_NOT_SENT' }) : null,
    }),
    state: 'DUPLICATE_WITHHELD',
    notificationSent: false,
  });
}

export function acknowledgeReservationImpact({ impact, watch, subjectRef, acknowledgedAtUtc, choice } = {}) {
  need(impact?.state === 'PENDING_USER_CONFIRMATION'
    && impact.acknowledgementRequired === true, 'ACKNOWLEDGEMENT_NOT_AVAILABLE');
  need(watch?.schemaVersion === RESERVATION_IMPACT_SCHEMAS.watch
    && watch.watchId === impact.watchId, 'ACKNOWLEDGEMENT_WATCH_MISMATCH');
  need(subjectId(subjectRef) === watch.subjectRef, 'ACKNOWLEDGEMENT_SUBJECT_MISMATCH');
  need(['REVIEWED', 'DISMISSED'].includes(choice), 'ACKNOWLEDGEMENT_CHOICE_INVALID');
  const acknowledgedAt = utc(acknowledgedAtUtc, 'ACKNOWLEDGEMENT_AT_REQUIRED');
  need(Date.parse(acknowledgedAt) >= Date.parse(impact.evaluatedAtUtc), 'ACKNOWLEDGEMENT_BEFORE_IMPACT');
  return freeze({
    schemaVersion: RESERVATION_IMPACT_SCHEMAS.acknowledgement,
    watchId: impact.watchId,
    impactId: impact.impactId,
    fingerprint: impact.fingerprint,
    subjectRef: watch.subjectRef,
    choice,
    acknowledgedAtUtc: acknowledgedAt,
    providerAction: null,
    paymentAction: null,
    notificationSent: false,
    executionAuthorized: false,
  });
}
