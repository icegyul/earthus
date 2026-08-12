#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(path.join(os.tmpdir(), 'earthus-reservation-impact-'));
const source = await readFile(path.join(root, 'prototype/js/reservation-impact.js'), 'utf8');
await writeFile(path.join(dir, 'reservation-impact.mjs'), source);
const reservation = await import(pathToFileURL(path.join(dir, 'reservation-impact.mjs')).href);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const watch = reservation.createReservationWatch({
  watchId: 'watch_01', reservationRef: 'reservation_ref_01', subjectRef: 'sub_fixture_0001',
  providerId: 'provider_fixture', placeId: 'place_fixture', activityProfileId: 'CAMPING',
  startUtc: '2026-08-12T12:00:00Z', endUtc: '2026-08-12T15:00:00Z',
  createdAtUtc: '2026-08-12T00:00:00Z',
});
const snapshot = values => reservation.normalizeProviderSnapshot({
  providerId: 'provider_fixture', sourceRecordId: 'record-01',
  observedAtUtc: '2026-08-12T12:00:00Z',
  sourceUrl: 'https://provider.example/evidence',
  providerPolicyUrl: 'https://provider.example/policy',
  revision: 'r1', outcome: 'AVAILABLE', availableCount: 5, sampleCount: 1,
  authorized: true, ...values,
});
const decision = values => ({
  schemaVersion: 'earthus.activity-decision.v1',
  decisionId: 'decision_r1',
  evaluatedAt: '2026-08-12T12:00:00Z',
  placeId: 'place_fixture',
  timeWindow: { start: '2026-08-12T12:00:00Z', end: '2026-08-12T15:00:00Z' },
  activityProfile: { id: 'CAMPING' },
  axes: {
    safety: {
      status: 'NO_ACTIVE_BLOCKER', applies: true,
      blocksPositiveRecommendation: false, reason: 'NO_ACTIVE_OFFICIAL_BLOCKER',
    },
    forecastConfidence: { confidenceLevel: 'HIGH', score: 90 },
  },
  recommendation: { state: 'EVIDENCE_READY', reason: 'ALL_RELEASE_GATES_PASSED' },
  inputSignalIds: ['weather:r1', 'safety:r1'],
  ...values,
});
const evaluate = overrides => reservation.evaluateReservationImpact({
  watch,
  previousSnapshot: snapshot(),
  currentSnapshot: snapshot(),
  previousDecision: decision(),
  currentDecision: decision(),
  evaluatedAtUtc: '2026-08-12T12:01:00Z',
  ...overrides,
});

test('watch는 opaque subject·예약 장소/시간/activity를 분리해 보존한다', () => {
  assert.equal(watch.schemaVersion, 'earthus.reservation-watch.v1');
  assert.equal(watch.subjectRef, 'sub_fixture_0001');
  assert.equal(watch.activityProfileId, 'CAMPING');
  assert.deepEqual(watch.execution, { notificationSent: false, providerAction: null, paymentAction: null });
  assert.throws(() => reservation.createReservationWatch({
    ...watch, subjectRef: 'person@example.com', createdAtUtc: watch.createdAtUtc,
  }), /WATCH_SUBJECT_REF_REQUIRED/);
});

test('timezone 없는 예약 시각은 UTC로 추측하지 않는다', () => {
  assert.throws(() => reservation.createReservationWatch({
    ...watch, startUtc: '2026-08-12T12:00:00', createdAtUtc: watch.createdAtUtc,
  }), /WATCH_START_REQUIRED/);
});

test('provider snapshot은 승인·HTTPS source/policy·record/revision·n을 모두 요구한다', () => {
  const ready = snapshot();
  assert.equal(ready.authorized, true);
  assert.equal(ready.sampleCount, 1);
  for (const patch of [
    { authorized: false }, { sourceUrl: 'http://provider.example' },
    { providerPolicyUrl: null }, { sourceRecordId: '' }, { revision: '' }, { sampleCount: null },
  ]) {
    const invalid = snapshot(patch);
    assert.equal(invalid.authorized, false);
    assert.equal(invalid.outcome, 'UNKNOWN');
  }
});

test('provider outcome과 available count가 충돌하면 UNKNOWN이다', () => {
  const invalid = snapshot({ outcome: 'AVAILABLE', availableCount: 0 });
  assert.equal(invalid.authorized, false);
  assert.equal(invalid.failureReason, 'PROVIDER_OUTCOME_COUNT_CONFLICT');
});

test('최초 정상 근거는 안전 변화가 없을 때 baseline만 기록한다', () => {
  const result = evaluate({ previousSnapshot: null, previousDecision: null });
  assert.equal(result.state, 'BASELINE_RECORDED');
  assert.equal(result.providerAction, null);
  assert.equal(result.notificationSent, false);
});

test('같은 decision/provider 근거는 NO_CHANGE다', () => {
  const result = evaluate({});
  assert.equal(result.state, 'NO_CHANGE');
  assert.equal(result.impactLevel, 'INFO');
});

test('경미한 provider revision 변화는 INFO 검토 제안이다', () => {
  const result = evaluate({ currentSnapshot: snapshot({ revision: 'r2' }) });
  assert.equal(result.state, 'PENDING_USER_CONFIRMATION');
  assert.equal(result.impactLevel, 'INFO');
  assert.ok(result.changedReasons.includes('PROVIDER_REVISION_CHANGED'));
});

test('confidence가 크게 떨어지면 WATCH이고 확률을 만들지 않는다', () => {
  const result = evaluate({
    currentDecision: decision({
      decisionId: 'decision_r2',
      axes: {
        safety: decision().axes.safety,
        forecastConfidence: { confidenceLevel: 'MEDIUM', score: 65 },
      },
      inputSignalIds: ['weather:r2', 'safety:r1'],
    }),
  });
  assert.equal(result.impactLevel, 'WATCH');
  assert.equal(result.notificationSent, false);
});

test('공식 WARNING은 점수와 재고보다 먼저 ACTION_REQUIRED다', () => {
  const result = evaluate({
    currentDecision: decision({
      decisionId: 'decision_warning',
      axes: {
        safety: { status: 'WARNING', applies: true, blocksPositiveRecommendation: true, reason: 'OFFICIAL_HEAVY_RAIN_WARNING_ISSUED' },
        forecastConfidence: { confidenceLevel: 'HIGH', score: 92 },
      },
      recommendation: { state: 'WITHHELD', reason: 'OFFICIAL_HEAVY_RAIN_WARNING_ISSUED' },
      inputSignalIds: ['weather:r2', 'warning:r2'],
    }),
  });
  assert.equal(result.impactLevel, 'ACTION_REQUIRED');
  assert.ok(result.changedReasons.includes('OFFICIAL_HEAVY_RAIN_WARNING_ISSUED'));
  assert.equal(result.providerAvailability, 'AVAILABLE');
});

test('공식 CLOSED/DANGER는 BLOCKED 제안이지만 취소를 실행하지 않는다', () => {
  const result = evaluate({
    previousSnapshot: null, previousDecision: null,
    currentSnapshot: snapshot({ revision: 'r3', outcome: 'CLOSED', availableCount: 0 }),
    currentDecision: decision({
      decisionId: 'decision_closed',
      axes: {
        safety: { status: 'CLOSED', applies: true, blocksPositiveRecommendation: true, reason: 'OFFICIAL_FACILITY_CLOSED' },
        forecastConfidence: { confidenceLevel: 'HIGH', score: 90 },
      },
      recommendation: { state: 'WITHHELD', reason: 'OFFICIAL_FACILITY_CLOSED' },
      inputSignalIds: ['weather:r2', 'closure:r3'],
    }),
  });
  assert.equal(result.impactLevel, 'BLOCKED');
  assert.equal(result.providerAction, null);
  assert.equal(result.paymentAction, null);
  assert.equal(result.notificationProposal.commercialContentAllowed, false);
});

test('Safety UNKNOWN은 영향 없음이 아니라 UNKNOWN 검토다', () => {
  const result = evaluate({
    currentDecision: decision({
      decisionId: 'decision_unknown',
      axes: {
        safety: { status: 'UNKNOWN', applies: null, blocksPositiveRecommendation: true, reason: 'SAFETY_EVIDENCE_MISSING' },
        forecastConfidence: { confidenceLevel: 'UNKNOWN', score: null },
      },
      recommendation: { state: 'WITHHELD', reason: 'SAFETY_EVIDENCE_MISSING' },
      inputSignalIds: ['weather:r2', 'safety:missing'],
    }),
  });
  assert.equal(result.impactLevel, 'UNKNOWN');
  assert.equal(result.state, 'PENDING_USER_CONFIRMATION');
  assert.match(result.reasonCodes.join(','), /UNKNOWN_REVIEW_REQUIRED/);
});

test('예약 장소/activity/window가 다른 Decision은 교차하지 않는다', () => {
  const cases = [
    decision({ placeId: 'other_place' }),
    decision({ activityProfile: { id: 'HIKING' } }),
    decision({ timeWindow: { start: '2026-08-12T13:00:00Z', end: '2026-08-12T15:00:00Z' } }),
  ];
  for (const currentDecision of cases) assert.equal(evaluate({ currentDecision }).state, 'WITHHELD');
});

test('미래·지연 Decision/provider와 순서 역전은 WITHHELD다', () => {
  assert.match(evaluate({ currentDecision: decision({ evaluatedAt: '2026-08-12T13:00:00Z' }) }).reasonCodes[0], /FUTURE/);
  assert.match(evaluate({ currentDecision: decision({ evaluatedAt: '2026-08-12T11:00:00Z' }) }).reasonCodes[0], /STALE/);
  assert.match(evaluate({ currentSnapshot: snapshot({ observedAtUtc: '2026-08-12T13:00:00Z' }) }).reasonCodes[0], /FUTURE/);
  assert.match(evaluate({
    previousSnapshot: snapshot({ observedAtUtc: '2026-08-12T12:00:30Z' }),
    currentSnapshot: snapshot({ observedAtUtc: '2026-08-12T12:00:00Z', revision: 'r2' }),
  }).reasonCodes[0], /OUT_OF_ORDER/);
});

test('과거 Decision은 비교 이력으로 보존하되 현재 Decision만 freshness를 요구한다', () => {
  const result = evaluate({ previousDecision: decision({
    decisionId: 'decision_historical', evaluatedAt: '2026-08-12T10:00:00Z',
    inputSignalIds: ['weather:historical', 'safety:historical'],
  }), currentSnapshot: snapshot({ revision: 'r2' }) });
  assert.equal(result.state, 'PENDING_USER_CONFIRMATION');
  assert.equal(result.previousDecisionId, 'decision_historical');
});

test('UNKNOWN confidence의 null 점수는 0으로 변환하지 않는다', () => {
  const result = evaluate({ currentDecision: decision({
    decisionId: 'decision_confidence_unknown',
    axes: {
      safety: decision().axes.safety,
      forecastConfidence: { confidenceLevel: 'UNKNOWN', score: null },
    },
    inputSignalIds: ['weather:unknown', 'safety:r1'],
  }) });
  assert.equal(result.evidence.decision.confidenceScore, null);
  assert.equal(result.impactLevel, 'UNKNOWN');
});

test('대안은 검증 Decision/evidence만 후보로 보존하고 재고·가격·순위를 만들지 않는다', () => {
  const alternatives = reservation.normalizeAlternativeCandidates({ watch, candidates: [{
    placeId: 'alternative_place',
    timeWindow: { start: '2026-08-13T12:00:00Z', end: '2026-08-13T15:00:00Z' },
    decisionId: 'decision_alternative_r1', evidenceRefs: ['signal:r1'],
  }] });
  assert.equal(alternatives[0].providerAvailability, 'UNKNOWN');
  assert.equal(alternatives[0].price, null);
  assert.equal(alternatives[0].rank, null);
  assert.throws(() => reservation.normalizeAlternativeCandidates({ watch, candidates: [{
    placeId: 'alternative_place',
    timeWindow: { start: '2026-08-13T12:00:00Z', end: '2026-08-13T15:00:00Z' },
    decisionId: 'decision_alternative_r1', evidenceRefs: ['signal:r1'], price: 10000,
  }] }), /ALTERNATIVE_UNVERIFIED_FACT_FORBIDDEN/);
});

test('impact notification key는 예약+signal revision+level 변화에 따라 달라진다', () => {
  const warning = evaluate({
    currentDecision: decision({
      decisionId: 'decision_warning',
      axes: {
        safety: { status: 'WARNING', applies: true, blocksPositiveRecommendation: true, reason: 'OFFICIAL_WARNING' },
        forecastConfidence: { confidenceLevel: 'HIGH', score: 90 },
      },
      inputSignalIds: ['warning:r2'],
    }),
  });
  const changedRevision = evaluate({
    currentDecision: decision({
      decisionId: 'decision_warning_2',
      axes: warning.evidence.decision.safetyStatus ? {
        safety: { status: 'WARNING', applies: true, blocksPositiveRecommendation: true, reason: 'OFFICIAL_WARNING' },
        forecastConfidence: { confidenceLevel: 'HIGH', score: 90 },
      } : decision().axes,
      inputSignalIds: ['warning:r3'],
    }),
  });
  assert.notEqual(warning.notificationKey, changedRevision.notificationKey);
});

test('같은 fingerprint는 DUPLICATE_WITHHELD이고 전송하지 않는다', () => {
  const changed = evaluate({ currentSnapshot: snapshot({ revision: 'r2' }) });
  const duplicate = reservation.deduplicateImpact({
    impact: changed, previouslyProposedFingerprints: [changed.fingerprint],
  });
  assert.equal(duplicate.state, 'DUPLICATE_WITHHELD');
  assert.equal(duplicate.notificationSent, false);
  assert.equal(duplicate.impact.notificationProposal.dispatchState, 'DUPLICATE_NOT_SENT');
});

test('대치 revision은 이전 impact와 correction 연결만 만들고 조용히 삭제하지 않는다', () => {
  const prior = evaluate({ currentSnapshot: snapshot({ revision: 'r2' }) });
  const correction = evaluate({
    previousImpact: prior,
    currentSnapshot: snapshot({ revision: 'r3', supersedesRevision: 'r2', outcome: 'LIMITED', availableCount: 2 }),
  });
  assert.equal(correction.correctionOfFingerprint, prior.fingerprint);
  assert.notEqual(correction.fingerprint, prior.fingerprint);
});

test('확인은 watch 소유 subject와 영향 이후 시각만 허용하고 실행 권한이 아니다', () => {
  const changed = evaluate({ currentSnapshot: snapshot({ revision: 'r2' }) });
  const acknowledgement = reservation.acknowledgeReservationImpact({
    impact: changed, watch, subjectRef: 'sub_fixture_0001',
    acknowledgedAtUtc: '2026-08-12T12:02:00Z', choice: 'REVIEWED',
  });
  assert.equal(acknowledgement.executionAuthorized, false);
  assert.equal(acknowledgement.providerAction, null);
  assert.throws(() => reservation.acknowledgeReservationImpact({
    impact: changed, watch, subjectRef: 'sub_attacker_9999',
    acknowledgedAtUtc: '2026-08-12T12:02:00Z', choice: 'REVIEWED',
  }), /ACKNOWLEDGEMENT_SUBJECT_MISMATCH/);
  assert.throws(() => reservation.acknowledgeReservationImpact({
    impact: changed, watch, subjectRef: 'sub_fixture_0001',
    acknowledgedAtUtc: '2026-08-12T11:00:00Z', choice: 'REVIEWED',
  }), /ACKNOWLEDGEMENT_BEFORE_IMPACT/);
});

test('모듈은 network/device/timer/예약·결제 실행 capability가 없다', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|WebSocket|XMLHttpRequest|navigator\.|setInterval|requestAnimationFrame/i);
  assert.doesNotMatch(source, /checkout|payment-confirm|createProviderReservation|cancelProviderReservation|changeProviderReservation|dispatchNotification/i);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`reservation impact v1.1 tests: ${passed}/${tests.length} passed`);
