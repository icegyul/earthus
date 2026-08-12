import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const root = new URL('../', import.meta.url);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const policySource = await readFile(new URL('prototype/js/activity-profile-policy.js', root), 'utf8');
const confidenceSource = await readFile(new URL('prototype/js/forecast-confidence.js', root), 'utf8');
const policyUrl = dataUrl(policySource);
const confidenceUrl = dataUrl(confidenceSource);
const rawCoreSource = await readFile(new URL('prototype/js/activity-decision-core.js', root), 'utf8');
const coreSource = rawCoreSource
  .replace("'./activity-profile-policy.js'", `'${policyUrl}'`)
  .replace("'./forecast-confidence.js'", `'${confidenceUrl}'`);
const policy = await import(policyUrl);
const confidenceEngine = await import(confidenceUrl);
const core = await import(dataUrl(coreSource));
const fixture = JSON.parse(await readFile(new URL('tools/fixtures/activity-decision-v1.json', root), 'utf8'));
const configExample = await readFile(new URL('prototype/js/config.local.example.js', root), 'utf8');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const fullConfidence = () => confidenceEngine.evaluateForecastConfidence(fixture.confidence);
const baseInput = scenario => ({
  profileId: scenario.profileId,
  placeId: scenario.placeId,
  timeWindow: scenario.timeWindow,
  signals: scenario.signals,
  safety: fixture.safety,
  confidence: fullConfidence(),
  evaluatedAt: '2026-08-12T09:01:00Z',
});

test('정책은 정확히 5개 활동과 weight 합 1을 가진다', () => {
  const validation = policy.validateActivityProfilePolicy();
  assert.deepEqual(validation, { valid: true, errors: [], profileCount: 5 });
  assert.deepEqual(Object.keys(policy.ACTIVITY_PROFILE_POLICY.profiles), [
    'BASEBALL_SPECTATOR', 'CAMPING', 'FUTSAL_OUTDOOR', 'HIKING', 'STARGAZING',
  ]);
});

test('Base 정책은 CALIBRATION_SHADOW이며 개인 bonus가 없다', () => {
  assert.equal(policy.ACTIVITY_PROFILE_POLICY.releaseMode, 'CALIBRATION_SHADOW');
  assert.deepEqual(policy.ACTIVITY_PROFILE_POLICY.objectiveBonuses, []);
  assert.equal(policy.ACTIVITY_PROFILE_POLICY.safetyPrecedence, true);
  assert.match(configExample, /DECISION_CORE_READY: false/);
});

test('모든 factor는 unit·aggregation·basis·공개 곡선을 가진다', () => {
  for (const profile of Object.values(policy.ACTIVITY_PROFILE_POLICY.profiles)) {
    assert.ok(profile.requiredSafetyGates.length > 0);
    for (const factor of profile.factors) {
      assert.equal(factor.required, true);
      assert.equal(factor.decisionClass, 'FIT_CURVE_NOT_SAFETY_THRESHOLD');
      assert.ok(factor.unit && factor.aggregation && factor.basis);
      assert.ok(factor.curve.length >= 2);
    }
  }
});

test('곡선 보간은 끝점 clamp와 구간 선형보간을 재현한다', () => {
  assert.equal(policy.normalizeActivityFactor(-10, [[0, 0], [10, 100]]), 0);
  assert.equal(policy.normalizeActivityFactor(5, [[0, 0], [10, 100]]), 0.5);
  assert.equal(policy.normalizeActivityFactor(20, [[0, 0], [10, 100]]), 1);
  assert.equal(policy.normalizeActivityFactor(null, [[0, 0], [10, 100]]), null);
});

test('Confidence는 6개 차원과 두 모델 근거로 고정 점수를 만든다', () => {
  const out = fullConfidence();
  assert.equal(out.score, fixture.confidence.expectedScore);
  assert.equal(out.confidenceLevel, fixture.confidence.expectedLevel);
  assert.equal(out.calibratedProbability, null);
  assert.equal(out.dimensions.length, 6);
});

test('단일 source는 제공된 agreement 점수도 사용하지 않고 UNKNOWN이다', () => {
  const out = confidenceEngine.evaluateForecastConfidence({
    ...fixture.confidence,
    modelSourceIds: ['only-one-model'],
  });
  assert.equal(out.confidenceLevel, 'UNKNOWN');
  assert.equal(out.score, null);
  assert.ok(out.reasonCodes.includes('MODEL_AGREEMENT_SINGLE_SOURCE'));
});

test('한 차원 결측은 알려진 차원만 재가중하지 않고 전체 UNKNOWN이다', () => {
  const dimensions = structuredClone(fixture.confidence.dimensions);
  dimensions.FRESHNESS = null;
  const out = confidenceEngine.evaluateForecastConfidence({ ...fixture.confidence, dimensions });
  assert.equal(out.score, null);
  assert.equal(out.confidenceLevel, 'UNKNOWN');
  assert.ok(out.reasonCodes.includes('FRESHNESS_UNKNOWN'));
});

test('Core는 hand-made HIGH나 probability 주입을 Confidence로 받지 않는다', () => {
  const input = baseInput(fixture.scenarios[0]);
  input.confidence = {
    ...fullConfidence(),
    score: 100,
    confidenceLevel: 'HIGH',
    calibratedProbability: 0.99,
  };
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.forecastConfidence.confidenceLevel, 'UNKNOWN');
  assert.equal(out.axes.forecastConfidence.calibratedProbability, null);
  assert.ok(out.axes.forecastConfidence.reasonCodes.includes('FORECAST_PROBABILITY_FORBIDDEN'));
});

test('Confidence band 경계는 80/60/40을 그대로 적용한다', () => {
  const create = score => confidenceEngine.evaluateForecastConfidence({
    dimensions: Object.fromEntries(confidenceEngine.CONFIDENCE_DIMENSIONS.map(key => [key, score])),
    modelSourceIds: ['a', 'b'], inputSignalIds: ['a:r1', 'b:r1'],
  });
  assert.equal(create(80).confidenceLevel, 'HIGH');
  assert.equal(create(60).confidenceLevel, 'MEDIUM');
  assert.equal(create(40).confidenceLevel, 'LOW');
  assert.equal(create(39.99).confidenceLevel, 'VERY_LOW');
});

for (const scenario of fixture.scenarios) {
  test(`${scenario.id} ${scenario.profileId} 골든 점수와 contribution ledger`, () => {
    const out = core.evaluateBaseActivityDecision(baseInput(scenario));
    assert.equal(out.axes.activityFit.status, 'COMPLETE');
    assert.equal(out.axes.activityFit.score, scenario.expectedScore);
    assert.equal(out.axes.activityFit.contributions.length, scenario.signals.length);
    assert.ok(out.axes.activityFit.contributions.every(item => item.signalIds.length === 1));
    assert.ok(out.axes.activityFit.contributions.every(item => item.reasonCode.startsWith('FIT_CURVE:')));
    assert.equal(out.cache.scope, 'PUBLIC_SHARED_BASE');
    assert.equal(out.cache.userSpecific, false);
    assert.equal(out.recommendation.reason, 'PROFILE_CALIBRATION_SHADOW');
  });
}

test('입력 순서가 달라도 cache key와 decision id가 같다', () => {
  const scenario = fixture.scenarios[0];
  const a = core.evaluateBaseActivityDecision(baseInput(scenario));
  const b = core.evaluateBaseActivityDecision({ ...baseInput(scenario), signals: [...scenario.signals].reverse() });
  assert.equal(a.cacheKey, b.cacheKey);
  assert.equal(a.decisionId, b.decisionId);
  assert.deepEqual(a.inputSignalIds, [...a.inputSignalIds].sort());
});

test('한 signal revision이 바뀌면 cache key와 decision id도 바뀐다', () => {
  const scenario = fixture.scenarios[0];
  const a = core.evaluateBaseActivityDecision(baseInput(scenario));
  const changed = structuredClone(baseInput(scenario));
  changed.signals[0].revision = 'r2';
  const b = core.evaluateBaseActivityDecision(changed);
  assert.notEqual(a.cacheKey, b.cacheKey);
  assert.notEqual(a.decisionId, b.decisionId);
});

test('Safety snapshot revision이 바뀌어도 cache key가 바뀐다', () => {
  const scenario = fixture.scenarios[0];
  const a = core.evaluateBaseActivityDecision(baseInput(scenario));
  const changed = structuredClone(baseInput(scenario));
  changed.safety.evidence.revision = 'r2';
  const b = core.evaluateBaseActivityDecision(changed);
  assert.notEqual(a.cacheKey, b.cacheKey);
});

test('Safety Hard Gate는 100점 Base보다 먼저 추천을 제한한다', () => {
  const scenario = structuredClone(fixture.scenarios[0]);
  for (const signal of scenario.signals) {
    const definition = policy.getActivityProfile(scenario.profileId).factors.find(item => item.key === signal.factor);
    const best = definition.curve.reduce((a, b) => b[1] > a[1] ? b : a);
    signal.value = best[0];
  }
  const input = baseInput(scenario);
  input.safety = {
    engineVersion: 'earthus.safety.warning.v1', ruleSetVersion: 'rules-v1',
    status: 'DANGER', applies: true, blocksPositiveRecommendation: true,
    reason: 'OFFICIAL_WARNING_ACTIVE',
    evidence: { sourceId: 'kma', revision: 'warning-r1', observedAt: '2026-08-12T09:00:00Z' },
  };
  const out = core.evaluateBaseActivityDecision(input);
  assert.ok(out.axes.activityFit.score >= 99);
  assert.equal(out.recommendation.reason, 'OFFICIAL_WARNING_ACTIVE');
  assert.equal(out.displayPolicy.scoreVisibility, 'DEEMPHASIZED');
  assert.equal(out.displayPolicy.positiveRecommendationAllowed, false);
});

test('Safety 없음은 UNKNOWN이며 긍정 추천을 제한한다', () => {
  const input = baseInput(fixture.scenarios[0]);
  delete input.safety;
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.safety.status, 'UNKNOWN');
  assert.equal(out.recommendation.reason, 'SAFETY_EVIDENCE_MISSING');
});

test('KMA 범위 밖은 현지 Safety 근거 없이 통과시키지 않는다', () => {
  const input = baseInput(fixture.scenarios[0]);
  input.safety = {
    engineVersion: 'earthus.safety.warning.v1', status: 'UNKNOWN', applies: false,
    blocksPositiveRecommendation: false, reason: 'KMA_OUT_OF_COVERAGE',
  };
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.safety.reason, 'LOCAL_SAFETY_PROVIDER_MISSING');
  assert.equal(out.axes.safety.blocksPositiveRecommendation, true);
});

test('필수 factor 결측은 0점이 아니라 Base UNKNOWN이다', () => {
  const input = baseInput(fixture.scenarios[0]);
  input.signals = input.signals.slice(1);
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.activityFit.score, null);
  assert.equal(out.axes.activityFit.status, 'UNKNOWN');
  assert.ok(out.axes.activityFit.reasonCodes.includes('REQUIRED_FACTOR_MISSING:PRECIPITATION_AMOUNT'));
});

test('unit mismatch는 환산 추정 없이 Base UNKNOWN이다', () => {
  const input = structuredClone(baseInput(fixture.scenarios[0]));
  input.signals[0].unit = 'inch/h';
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.activityFit.score, null);
  assert.ok(out.axes.activityFit.reasonCodes.some(code => code.startsWith('UNIT_MISMATCH:')));
});

test('중복 factor는 임의 최신 선택 없이 Base UNKNOWN이다', () => {
  const input = structuredClone(baseInput(fixture.scenarios[0]));
  input.signals.push({ ...input.signals[0], id: 'duplicate-rain' });
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.activityFit.score, null);
  assert.ok(out.axes.activityFit.reasonCodes.includes('DUPLICATE_FACTOR:PRECIPITATION_AMOUNT'));
});

test('factor 범위 밖 값은 clamp하지 않고 입력 오류로 남긴다', () => {
  const input = structuredClone(baseInput(fixture.scenarios[0]));
  input.signals[0].value = 999;
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.activityFit.score, null);
  assert.ok(out.axes.activityFit.reasonCodes.includes('FACTOR_OUT_OF_RANGE:PRECIPITATION_AMOUNT'));
});

test('개인화 데이터는 어느 깊이에서든 Base 입력에서 거절한다', () => {
  const input = baseInput(fixture.scenarios[0]);
  input.metadata = { personalization: { hotSensitive: true } };
  assert.throws(() => core.evaluateBaseActivityDecision(input), /PERSONALIZATION_FORBIDDEN/);
});

test('timezone 없는 time window는 로컬 시각으로 추측하지 않는다', () => {
  const input = baseInput(fixture.scenarios[0]);
  input.timeWindow = { start: '2026-08-12T19:00:00', end: '2026-08-12T22:00:00' };
  assert.throws(() => core.evaluateBaseActivityDecision(input), /TIME_WINDOW_INVALID_OR_TIMEZONE_MISSING/);
});

test('Crowd와 Availability는 provider evidence 없으면 UNKNOWN이다', () => {
  const out = core.evaluateBaseActivityDecision(baseInput(fixture.scenarios[0]));
  assert.equal(out.axes.crowd.status, 'UNKNOWN');
  assert.equal(out.axes.availability.status, 'UNKNOWN');
  assert.equal(out.axes.crowd.value, null);
  assert.equal(out.axes.availability.value, null);
});

test('Crowd evidence는 source/time/revision이 모두 있을 때만 관측으로 보존한다', () => {
  const input = baseInput(fixture.scenarios[0]);
  input.crowdEvidence = { sourceId: 'venue', observedAt: '2026-08-12T09:00:00Z', revision: 'r1', value: 'MODERATE', n: 1 };
  input.availabilityEvidence = { sourceId: 'booking', observedAt: '2026-08-12T09:00:00Z', revision: 'r1', value: 'AVAILABLE', n: 1 };
  const out = core.evaluateBaseActivityDecision(input);
  assert.equal(out.axes.crowd.status, 'OBSERVED');
  assert.equal(out.axes.availability.status, 'OBSERVED');
  assert.equal(out.axes.availability.value, 'AVAILABLE');
  const changed = structuredClone(input);
  changed.availabilityEvidence.revision = 'r2';
  assert.notEqual(
    core.evaluateBaseActivityDecision(input).cacheKey,
    core.evaluateBaseActivityDecision(changed).cacheKey,
  );
});

test('fixture는 합성임과 공개 금지를 명시한다', () => {
  assert.equal(fixture.fixtureOnly, true);
  assert.match(fixture.warning, /Never display/);
});

test('순수 엔진은 fetch/timer/animation과 확률 문구를 만들지 않는다', () => {
  const all = policySource + confidenceSource + rawCoreSource;
  assert.doesNotMatch(all, /fetch\s*\(|setInterval|requestAnimationFrame/);
  assert.doesNotMatch(all, /calibratedProbability:\s*(?:[0-9]|"|')/);
});

test('10,000회 동일 입력 replay가 2초 안이고 결과가 동일하다', () => {
  const input = baseInput(fixture.scenarios[0]);
  const expected = core.evaluateBaseActivityDecision(input).decisionId;
  const start = performance.now();
  let last = null;
  for (let i = 0; i < 10_000; i += 1) last = core.evaluateBaseActivityDecision(input).decisionId;
  const elapsed = performance.now() - start;
  assert.equal(last, expected);
  assert.ok(elapsed < 2000, `benchmark ${elapsed.toFixed(1)}ms >= 2000ms`);
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
console.log(`activity decision tests: ${passed}/${tests.length} passed`);
