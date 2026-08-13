import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = path => readFile(new URL(path, root), 'utf8');

const profileSource = await read('prototype/js/activity-profile-policy.js');
const confidenceSource = await read('prototype/js/forecast-confidence.js');
const coreRaw = await read('prototype/js/activity-decision-core.js');
const profileUrl = dataUrl(profileSource);
const confidenceUrl = dataUrl(confidenceSource);
const coreUrl = dataUrl(coreRaw
  .replace("'./activity-profile-policy.js'", `'${profileUrl}'`)
  .replace("'./forecast-confidence.js'", `'${confidenceUrl}'`));

const personalPolicySource = await read('prototype/js/personalization-policy.js');
const personalPolicyUrl = dataUrl(personalPolicySource);
const personalEngineRaw = await read('prototype/js/personalization-engine.js');
const personalEngineUrl = dataUrl(personalEngineRaw
  .replace("'./personalization-policy.js'", `'${personalPolicyUrl}'`));
const uiModelSource = await read('prototype/js/decision-ui-model.js');
const uiModelUrl = dataUrl(uiModelSource);
const uiSource = await read('prototype/js/decision-ui.js');
const uiUrl = dataUrl(uiSource.replace("'./decision-ui-model.js'", `'${uiModelUrl}'`));

const confidenceEngine = await import(confidenceUrl);
const core = await import(coreUrl);
const personalPolicy = await import(personalPolicyUrl);
const personal = await import(personalEngineUrl);
const uiModel = await import(uiModelUrl);
const ui = await import(uiUrl);
const fixture = JSON.parse(await read('tools/fixtures/activity-decision-v1.json'));
const css = await read('prototype/css/decision-ui.css');
const main = await read('prototype/js/main.js');
const configExample = await read('prototype/js/config.local.example.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const scenario = () => structuredClone(fixture.scenarios[0]);
const confidence = () => confidenceEngine.evaluateForecastConfidence(fixture.confidence);
const base = (source = scenario(), safety = fixture.safety, placeId = source.placeId) => core.evaluateBaseActivityDecision({
  profileId: source.profileId,
  placeId,
  timeWindow: source.timeWindow,
  signals: source.signals,
  safety,
  confidence: confidence(),
  evaluatedAt: '2026-08-12T09:01:00Z',
});
const preferenceSet = (entries, overrides = {}) => ({
  schemaVersion: 'earthus.personal-preference.v1',
  preferenceVersion: 'pref-v1',
  enabled: true,
  consent: {
    status: 'GRANTED',
    version: 'earthus.personalization-consent.v1',
    grantedAt: '2026-08-12T08:00:00Z',
  },
  entries,
  ...overrides,
});
const entry = (key, level = 'HIGH', value = undefined, revision = 'r1') => ({
  key, level, source: 'EXPLICIT_USER_INPUT', revision, ...(value ? { value } : {}),
});
const apply = (decision, preferences) => personal.applyPersonalization({
  baseDecision: decision,
  preferenceSet: preferences,
  subjectRef: 'sub_fixture_0001',
});

test('개인화 정책은 ±12 후보·shadow·private no-store 계약이다', () => {
  assert.deepEqual(personalPolicy.validatePersonalizationPolicy(), { valid: true, errors: [] });
  assert.equal(personalPolicy.PERSONALIZATION_POLICY.maxAbsoluteDeltaCandidate, 12);
  assert.equal(personalPolicy.PERSONALIZATION_POLICY.releaseMode, 'CALIBRATION_SHADOW');
  assert.equal(personalPolicy.PERSONALIZATION_POLICY.responseCacheControl, 'private, no-store');
  assert.ok(personalPolicy.PERSONALIZATION_POLICY.privateCacheTtlSeconds <= 300);
});

test('5개 profile마다 허용 preference가 명시돼 있다', () => {
  assert.deepEqual(Object.keys(personalPolicy.PERSONALIZATION_POLICY.profiles), [
    'BASEBALL_SPECTATOR', 'CAMPING', 'FUTSAL_OUTDOOR', 'HIKING', 'STARGAZING',
  ]);
  for (const keys of Object.values(personalPolicy.PERSONALIZATION_POLICY.profiles)) assert.ok(keys.length >= 5);
});

test('사용자가 끄면 Base와 같은 점수이고 delta는 0이다', () => {
  const decision = base();
  const result = apply(decision, preferenceSet([], { enabled: false }));
  assert.equal(result.status, 'DISABLED');
  assert.equal(result.personalizedScore, decision.axes.activityFit.score);
  assert.equal(result.boundedDelta, 0);
});

test('동의 없이는 explicit preference도 계산하지 않는다', () => {
  const result = apply(base(), preferenceSet([entry('HEAT_SENSITIVITY')], { consent: null }));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.reasonCodes.includes('PERSONALIZATION_CONSENT_MISSING'));
  assert.equal(result.boundedDelta, 0);
});

test('판단 시각 뒤에 받은 동의를 과거 판단에 소급 적용하지 않는다', () => {
  const result = apply(base(), preferenceSet([entry('HEAT_SENSITIVITY')], {
    consent: {
      status: 'GRANTED', version: 'earthus.personalization-consent.v1',
      grantedAt: '2026-08-12T10:00:00Z',
    },
  }));
  assert.equal(result.status, 'UNKNOWN');
  assert.deepEqual(result.reasonCodes, ['PERSONALIZATION_CONSENT_NOT_ACTIVE_AT_EVALUATION']);
});

test('원본 이메일이나 짧은 사용자 ID를 subject key로 받지 않는다', () => {
  assert.throws(() => personal.applyPersonalization({
    baseDecision: base(), preferenceSet: preferenceSet([]), subjectRef: 'person@example.com',
  }), /OPAQUE_SUBJECT_REF_REQUIRED/);
});

test('민감 건강·정밀 위치 추론 필드는 깊은 위치에서도 거절한다', () => {
  const preferences = preferenceSet([entry('HEAT_SENSITIVITY')]);
  preferences.metadata = { healthStatus: 'sensitive' };
  assert.throws(() => apply(base(), preferences), /SENSITIVE_INFERENCE_FORBIDDEN/);
});

test('행동 이력 기반 추론도 explicit preference로 저장하지 않는다', () => {
  const preferences = preferenceSet([entry('HEAT_SENSITIVITY')]);
  preferences.metadata = { nested: { inferredFrom: 'click_history' } };
  assert.throws(() => apply(base(), preferences), /SENSITIVE_INFERENCE_FORBIDDEN/);
});

test('INFERRED source는 explicit처럼 위장할 수 없다', () => {
  const inferred = entry('HEAT_SENSITIVITY');
  inferred.source = 'INFERRED_BEHAVIOR';
  const result = apply(base(), preferenceSet([inferred]));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.reasonCodes.includes('PREFERENCE_SOURCE_FORBIDDEN:HEAT_SENSITIVITY'));
});

test('고온 explicit 민감도는 Base 밖의 음수 delta로만 반영된다', () => {
  const source = scenario();
  source.signals.find(item => item.factor === 'APPARENT_TEMPERATURE').value = 40;
  const decision = base(source);
  const snapshot = structuredClone(decision);
  const result = apply(decision, preferenceSet([entry('HEAT_SENSITIVITY')]));
  assert.equal(result.boundedDelta, -6);
  assert.equal(result.personalizedScore, Math.max(0, decision.axes.activityFit.score - 6));
  assert.deepEqual(decision, snapshot);
  assert.deepEqual(result.protectedAxes, ['SAFETY', 'FORECAST_CONFIDENCE', 'CROWD', 'AVAILABILITY']);
});

test('저녁 선호가 시간창과 맞으면 최대 +3 후보가 별도 이유로 남는다', () => {
  const value = { startLocalMinute: 1080, endLocalMinute: 1380, utcOffsetMinutes: 540 };
  const result = apply(base(), preferenceSet([entry('TIME_WINDOW_PREFERENCE', 'HIGH', value)]));
  assert.equal(result.boundedDelta, 3);
  assert.equal(result.contributions[0].reasonCode, 'EXPLICIT_TIME_WINDOW_MATCH');
});

test('자정을 넘는 선호 시간창도 explicit offset으로만 계산한다', () => {
  const source = scenario();
  source.timeWindow = { start: '2026-08-12T14:00:00Z', end: '2026-08-12T16:00:00Z' };
  const result = apply(base(source), preferenceSet([
    entry('TIME_WINDOW_PREFERENCE', 'HIGH', { startLocalMinute: 1320, endLocalMinute: 120, utcOffsetMinutes: 540 }),
  ]));
  assert.equal(result.boundedDelta, 3);
});

test('잘못된 timezone offset은 현지 시각으로 추측하지 않는다', () => {
  const result = apply(base(), preferenceSet([
    entry('TIME_WINDOW_PREFERENCE', 'HIGH', { startLocalMinute: 0, endLocalMinute: 60, utcOffsetMinutes: 9999 }),
  ]));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.reasonCodes.includes('TIME_PREFERENCE_INVALID:TIME_WINDOW_PREFERENCE'));
});

test('여러 민감도 합이 -12를 넘으면 후보 cap과 raw delta를 둘 다 남긴다', () => {
  const source = scenario();
  const values = { APPARENT_TEMPERATURE: 40, PRECIPITATION_AMOUNT: 20, PRECIPITATION_PROBABILITY: 100, WIND_SPEED: 18, RELATIVE_HUMIDITY: 100 };
  for (const signal of source.signals) if (values[signal.factor] !== undefined) signal.value = values[signal.factor];
  const result = apply(base(source), preferenceSet([
    entry('HEAT_SENSITIVITY'), entry('RAIN_SENSITIVITY'),
    entry('WIND_SENSITIVITY'), entry('HUMIDITY_SENSITIVITY'),
  ]));
  assert.ok(result.rawDelta < -12);
  assert.equal(result.boundedDelta, -12);
  assert.equal(result.capApplied, true);
});

test('profile이 허용하지 않은 preference는 계산 전체를 UNKNOWN으로 둔다', () => {
  const result = apply(base(), preferenceSet([entry('AIR_QUALITY_SENSITIVITY')]));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.reasonCodes.includes('PREFERENCE_NOT_ALLOWED:BASEBALL_SPECTATOR:AIR_QUALITY_SENSITIVITY'));
});

test('중복 preference는 최신을 임의 선택하지 않는다', () => {
  const result = apply(base(), preferenceSet([entry('HEAT_SENSITIVITY'), entry('HEAT_SENSITIVITY', 'LOW', undefined, 'r2')]));
  assert.equal(result.status, 'UNKNOWN');
  assert.ok(result.reasonCodes.includes('PREFERENCE_DUPLICATE:HEAT_SENSITIVITY'));
});

test('12개를 넘는 preference payload는 잘라 계산하지 않고 거절한다', () => {
  const result = apply(base(), preferenceSet(Array.from({ length: 13 }, (_, index) => ({
    ...entry('HEAT_SENSITIVITY'), revision: `r${index}`,
  }))));
  assert.equal(result.status, 'UNKNOWN');
  assert.deepEqual(result.reasonCodes, ['PREFERENCE_ENTRY_LIMIT_EXCEEDED']);
});

test('개인 결과는 public cache가 아니라 짧은 private key다', () => {
  const result = apply(base(), preferenceSet([entry('TIME_WINDOW_PREFERENCE', 'HIGH', { startLocalMinute: 1080, endLocalMinute: 1380, utcOffsetMinutes: 540 })]));
  assert.equal(result.cache.scope, 'USER_SCOPED_PRIVATE');
  assert.equal(result.cache.shared, false);
  assert.equal(result.cache.userSpecific, true);
  assert.equal(result.cache.responseCacheControl, 'private, no-store');
  assert.doesNotMatch(result.cache.key, /sub_fixture_0001/);
});

test('preference revision이 바뀌면 private cache key도 바뀐다', () => {
  const decision = base();
  const a = apply(decision, preferenceSet([entry('HEAT_SENSITIVITY', 'HIGH', undefined, 'r1')]));
  const b = apply(decision, preferenceSet([entry('HEAT_SENSITIVITY', 'HIGH', undefined, 'r2')]));
  assert.notEqual(a.cache.key, b.cache.key);
});

test('Base score가 UNKNOWN이면 개인화로 메우지 않는다', () => {
  const source = scenario();
  source.signals.shift();
  const result = apply(base(source), preferenceSet([entry('TIME_WINDOW_PREFERENCE', 'HIGH', { startLocalMinute: 1080, endLocalMinute: 1380, utcOffsetMinutes: 540 })]));
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.personalizedScore, null);
});

test('5축 UI model은 Safety가 DOM/데이터 모두 첫 번째다', () => {
  const decision = base();
  const model = uiModel.createDecisionViewModel({ baseDecision: decision, lang: 'ko', label: '합성' });
  assert.equal(model.safetyFirst, true);
  assert.equal(model.axes.length, 5);
  assert.deepEqual(model.axes.map(axis => axis.key), uiModel.DECISION_AXIS_ORDER);
  assert.equal(model.axes[0].key, 'SAFETY');
});

test('Crowd와 Availability UNKNOWN을 0·가능으로 바꾸지 않는다', () => {
  const model = uiModel.createDecisionViewModel({ baseDecision: base(), lang: 'ko' });
  for (const key of ['CROWD', 'AVAILABILITY']) {
    const axis = model.axes.find(item => item.key === key);
    assert.equal(axis.unknown, true);
    assert.equal(axis.primary, '확인할 자료 없음');
  }
});

test('맞지 않는 baseDecisionId의 personal result는 UI에서 무시한다', () => {
  const decision = base();
  const result = apply(decision, preferenceSet([entry('HEAT_SENSITIVITY')]));
  result.baseDecisionId = 'decision_other';
  const model = uiModel.createDecisionViewModel({ baseDecision: decision, personalResult: result });
  assert.equal(model.personal, null);
  assert.equal(model.axes.find(axis => axis.key === 'ACTIVITY_FIT').personalizedScore, null);
});

test('5축 비교는 같은 profile/time에서만 가능하고 단일 winner를 만들지 않는다', () => {
  const left = uiModel.createDecisionViewModel({ baseDecision: base(scenario(), fixture.safety, 'left') });
  const right = uiModel.createDecisionViewModel({ baseDecision: base(scenario(), fixture.safety, 'right') });
  const compare = uiModel.compareDecisionViewModels(left, right);
  assert.equal(compare.status, 'COMPARABLE');
  assert.equal(compare.winner, null);
  assert.equal(compare.rows.length, 5);
  assert.equal(compare.rows[0].key, 'SAFETY');
  assert.match(ui.decisionCompareMarkup(compare), /fixture-model-a/);
});

test('다른 시간창 비교는 BLOCKED이고 점수 승자를 만들지 않는다', () => {
  const other = scenario();
  other.timeWindow.end = '2026-08-12T14:00:00Z';
  const compare = uiModel.compareDecisionViewModels(
    uiModel.createDecisionViewModel({ baseDecision: base() }),
    uiModel.createDecisionViewModel({ baseDecision: base(other) }),
  );
  assert.equal(compare.status, 'BLOCKED');
  assert.equal(compare.winner, null);
  assert.deepEqual(compare.rows, []);
});

test('UI markup은 Safety를 Activity보다 먼저 쓰고 명시적 UNKNOWN·끄기 버튼을 가진다', () => {
  const decision = base();
  const result = apply(decision, preferenceSet([entry('HEAT_SENSITIVITY')]));
  const model = uiModel.createDecisionViewModel({ baseDecision: decision, personalResult: result, lang: 'ko' });
  const html = ui.decisionPanelMarkup(model, { synthetic: true });
  assert.ok(html.indexOf('data-axis="SAFETY"') < html.indexOf('data-axis="ACTIVITY_FIT"'));
  assert.match(html, /확인할 자료 없음/);
  assert.match(html, /data-personal-toggle/);
  assert.match(html, /개인화는 안전·공식 폐쇄·예약 사실·예보 자료 신뢰도를 바꾸지 않습니다/);
  assert.match(html, /합성 개발 자료/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /OFFICIAL_WARNING_ACTIVE/);
});

test('UI markup은 place label HTML을 escape한다', () => {
  const model = uiModel.createDecisionViewModel({ baseDecision: base(), label: '<script>alert(1)</script>' });
  const html = ui.decisionPanelMarkup(model);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('CSS는 모바일 1열·44px target·focus-visible·UNKNOWN 텍스트 계약을 가진다', () => {
  assert.match(css, /min-width:44px;min-height:44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /\.du-axis-list\{grid-template-columns:1fr\}/);
  assert.match(css, /#decisionUiHost\{\s*position:fixed;z-index:21/);
});

test('flag는 false이고 main 공개 entry는 아직 UI를 정적 import하지 않는다', () => {
  assert.match(configExample, /DECISION_CORE_READY: false/);
  assert.doesNotMatch(main, /^import .*decision-ui/m);
  assert.match(main, /if \(CONFIG\.DECISION_CORE_READY === true\)/);
  assert.match(main, /import\('\.\/decision-ui\.js'\)/);
  assert.doesNotMatch(main, /import\('\.\/decision-ui\.js\?v=/,
    '동일 모듈을 query suffix로 중복 평가하면 상태가 분리된다');
});

test('개인화와 UI 모듈은 fetch·예약 실행·timer·animation을 만들지 않는다', () => {
  const all = personalPolicySource + personalEngineRaw + uiModelSource + uiSource;
  assert.doesNotMatch(all, /fetch\s*\(|setInterval|requestAnimationFrame|checkout|payment|reservation.*execute/i);
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
console.log(`personalization + decision UI tests: ${passed}/${tests.length} passed`);
