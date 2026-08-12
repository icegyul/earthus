import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('prototype/js/safety-engine.js', root), 'utf8');
const engine = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const ui = await readFile(new URL('prototype/js/safety-gate-ui.js', root), 'utf8');
const gateUi = await import(`data:text/javascript;base64,${Buffer.from(ui).toString('base64')}`);
const warnUi = await readFile(new URL('prototype/js/ui-warn.js', root), 'utf8');
const koreaUi = await readFile(new URL('prototype/js/ui-korea.js', root), 'utf8');
const css = await readFile(new URL('prototype/css/safety.css', root), 'utf8');
const index = await readFile(new URL('prototype/index.html', root), 'utf8');
const main = await readFile(new URL('prototype/js/main.js', root), 'utf8');

const NOW = Date.UTC(2026, 7, 12, 2, 20); // 2026-08-12 11:20 KST
const coords = { lat: 37.62, lon: 126.72 };
const zones = {
  generated: '2026-08-12T01:00:00Z',
  stations: [{ name: '김포', lat: 37.62, lon: 126.72, zone: 'L1010700', zoneName: '김포시' }],
};
const warning = {
  region: '김포시', regionId: 'L1010700', parentId: 'L1010000', kind: '폭염',
  level: '주의', levelRank: 1, issuedKst: '202608121000', effectiveKst: '202608121100',
};
const snapshot = overrides => ({
  generated: '2026-08-12T02:10:00Z', observedKst: '202608121110',
  source: '기상청 기상특보 (API허브 wrn_now_data)', license: '공공누리 제1유형 (출처표시)',
  activeCount: 1, active: [warning], ...overrides,
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('KST 숫자 시각을 UTC epoch로 바꾼다', () => {
  assert.equal(engine.parseWarningTime('202608121120'), NOW);
});
test('timezone 없는 ISO를 추측하지 않는다', () => {
  assert.equal(engine.parseWarningTime('2026-08-12T02:20:00'), null);
});
test('최근접 관측지점의 공식 zone code와 거리·표본 수를 보존한다', () => {
  const z = engine.resolveWarningZone(coords, zones);
  assert.equal(z.id, 'L1010700');
  assert.equal(z.approximate, true);
  assert.equal(z.stationCount, 1);
  assert.ok(z.km < 0.01);
});
test('60km 안에 지점이 없으면 REGION_UNMAPPED다', () => {
  assert.equal(engine.resolveWarningZone(coords, { stations: [] }).status, 'REGION_UNMAPPED');
});
test('한국 밖은 KMA 적용 범위 밖이다', () => {
  assert.equal(engine.resolveWarningZone({ lat: 35.68, lon: 139.76 }, zones).status, 'OUT_OF_COVERAGE');
});
test('30분 이내 자료만 FRESH다', () => {
  assert.equal(engine.warningFreshness(snapshot(), NOW).status, 'FRESH');
});
test('30~45분은 AGING이지만 원시각과 지연 가능성을 보존한다', () => {
  const f = engine.warningFreshness(snapshot({ generated: '2026-08-12T01:40:00Z' }), NOW);
  assert.equal(f.status, 'AGING');
  assert.equal(f.usable, true);
  assert.equal(f.reason, 'PROVIDER_DELAY_POSSIBLE');
});
test('45분을 넘긴 자료는 현재 특보로 사용하지 않는다', () => {
  const g = engine.evaluateWarningSafety({ snapshot: snapshot({ generated: '2026-08-12T01:30:00Z' }), zones, coords, nowMs: NOW });
  assert.equal(g.status, 'UNKNOWN');
  assert.equal(g.reason, 'PROVIDER_DELAY');
  assert.equal(g.activityAllowed, null);
});
test('5분보다 먼 미래 시각은 차단한다', () => {
  const g = engine.evaluateWarningSafety({ snapshot: snapshot({ generated: '2026-08-12T02:30:00Z' }), zones, coords, nowMs: NOW });
  assert.equal(g.reason, 'TIME_IN_FUTURE');
});
test('주의 특보가 정확히 일치하면 점수보다 먼저 추천을 제한한다', () => {
  const g = engine.evaluateWarningSafety({ snapshot: snapshot(), zones, coords, nowMs: NOW });
  assert.equal(g.status, 'WARNING');
  assert.equal(g.gate, 'OFFICIAL_WARNING_ACTIVE');
  assert.equal(g.activityAllowed, false);
  assert.equal(g.blocksPositiveRecommendation, true);
  assert.equal(g.safeClaimAllowed, false);
});
test('경보는 DANGER지만 폐쇄를 지어내지 않는다', () => {
  const g = engine.evaluateWarningSafety({
    snapshot: snapshot({ active: [{ ...warning, level: '경보', levelRank: 2 }] }), zones, coords, nowMs: NOW,
  });
  assert.equal(g.status, 'DANGER');
  assert.notEqual(g.status, 'CLOSED');
  assert.equal(g.activityAllowed, false);
});
test('공식 등급을 모르면 경보를 임의 분류하지 않는다', () => {
  const g = engine.evaluateWarningSafety({
    snapshot: snapshot({ active: [{ ...warning, level: '새등급', levelRank: undefined }] }), zones, coords, nowMs: NOW,
  });
  assert.equal(g.status, 'WARNING');
  assert.equal(g.warnings[0].levelRank, null);
});
test('정확한 regionId가 없으면 SAFE가 아니라 UNKNOWN이다', () => {
  const g = engine.evaluateWarningSafety({
    snapshot: snapshot({ active: [{ ...warning, regionId: 'L9999999', parentId: 'L1010700' }] }), zones, coords, nowMs: NOW,
  });
  assert.equal(g.status, 'UNKNOWN');
  assert.equal(g.reason, 'NO_MATCH_NOT_SAFE');
  assert.equal(g.blocksPositiveRecommendation, true);
});
test('전국 activeCount 0도 SAFE가 아니다', () => {
  const g = engine.evaluateWarningSafety({ snapshot: snapshot({ activeCount: 0, active: [] }), zones, coords, nowMs: NOW });
  assert.equal(g.status, 'UNKNOWN');
  assert.equal(g.safeClaimAllowed, false);
  assert.equal(g.evidence.n, 0);
});
test('위치가 없으면 판단을 보류한다', () => {
  const g = engine.evaluateWarningSafety({ snapshot: snapshot(), zones, coords: null, nowMs: NOW });
  assert.equal(g.status, 'UNKNOWN');
  assert.equal(g.reason, 'LOCATION_MISSING');
});
test('한국 밖에서는 이 KMA gate가 다른 기관 판단을 가로막지 않는다', () => {
  const g = engine.evaluateWarningSafety({ snapshot: snapshot(), zones, coords: { lat: 0, lon: 0 }, nowMs: NOW });
  assert.equal(g.applies, false);
  assert.equal(g.blocksPositiveRecommendation, false);
});
test('발표→대치→해제 replay는 RELEASED와 3개 revision을 남긴다', () => {
  const history = [
    { regionId: 'A', kind: '호우', issuedKst: '202608120900', effectiveKst: '202608120900', command: '발표', level: '주의보' },
    { regionId: 'A', kind: '호우', issuedKst: '202608121000', effectiveKst: '202608121000', command: '대치', level: '경보' },
    { regionId: 'A', kind: '호우', issuedKst: '202608121100', effectiveKst: '202608121100', command: '해제', level: '경보' },
  ];
  const [state] = engine.replayWarningRevisions(history, NOW);
  assert.equal(state.state, 'RELEASED');
  assert.equal(state.revisionCount, 3);
  assert.deepEqual(state.history.map(x => x.command), ['발표', '대치', '해제']);
});
test('뒤섞인 입력과 중복 replay도 최신 revision 하나를 고른다', () => {
  const release = { regionId: 'A', kind: '강풍', issuedKst: '202608121100', effectiveKst: '202608121100', command: '3' };
  const [state] = engine.replayWarningRevisions([
    release,
    { regionId: 'A', kind: '강풍', issuedKst: '202608120900', effectiveKst: '202608120900', command: '1' },
    release,
  ], NOW);
  assert.equal(state.state, 'RELEASED');
  assert.equal(state.revisionCount, 2);
});
test('미래 발효 revision은 UPCOMING으로 분리한다', () => {
  const [state] = engine.replayWarningRevisions([
    { regionId: 'A', kind: '대설', issuedKst: '202608121100', effectiveKst: '202608121200', command: '발표' },
  ], NOW);
  assert.equal(state.state, 'UPCOMING');
});
test('화면 계약은 UNKNOWN과 근사 한계를 숨기지 않는다', () => {
  assert.match(ui, /특보가 없거나 안전하다는 뜻이 아닙니다/);
  assert.match(ui, /공식 구역 경계 polygon이 아닌 근사/);
  assert.match(ui, /n=\$\{esc\(evidence\.n/);
  assert.doesNotMatch(warnUi + koreaUi, /발효 중인 특보가 없습니다|No active warnings in your area|No warnings in your area/);
});
test('활성 공식 특보 UI는 제한·출처·시각·n·공식 CTA를 함께 보인다', () => {
  const gate = engine.evaluateWarningSafety({ snapshot: snapshot(), zones, coords, nowMs: NOW });
  const html = gateUi.safetyGateMarkup(gate, 'ko');
  assert.match(html, /data-safety-status="WARNING"/);
  assert.match(html, /공식 특보 우선 · 추천 제한/);
  assert.match(html, /n=1/);
  assert.match(html, /2026-08-12 11:10 KST/);
  assert.match(html, /weather\.go\.kr\/w\/special-report\/overall\.do/);
});
test('Safety UI는 독립 CSS와 versioned entry로 배포된다', () => {
  assert.match(css, /\.safety-gate--danger/);
  assert.match(index, /safety\.css\?v=20260812-safety1/);
  assert.match(index, /main\.js\?v=20260812-[a-z0-9-]+/);
  assert.match(main, /from '\.\/warn\.js'/);
});
test('Safety Engine은 무한 timer나 animation을 만들지 않는다', () => {
  assert.doesNotMatch(source, /setInterval|requestAnimationFrame/);
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
console.log(`Safety engine: ${passed}/${tests.length} passed`);
