// Pleos 운전 중 안전 게이트 — V38.1 지시서 §3·§14 Safety
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { importPrototype, createRunner, PROTOTYPE } from './pleos-test-support.mjs';

const gate = await importPrototype('prototype/js/pleos/safety-gate.js');
const actions = await importPrototype('prototype/js/pleos/actions.js');
const hostMod = await importPrototype('prototype/js/pleos/host-bridge.js');
const { decideAction, guardAction, DRIVING_STATE } = gate;
const { ACTION, ACTION_POLICY, canonicalAction } = actions;
const { test, run } = createRunner('test_pleos_safety_gate');

const decide = (drivingState, action, extra = {}) => decideAction({ drivingState, action, ...extra }).decision;

// §14 Safety 표 그대로
const TABLE = [
  ['UNKNOWN', 'unknown_feature_xyz', 'BLOCK'],
  ['DRIVING', 'unknown_feature_xyz', 'BLOCK'],
  ['RESTRICTED', 'unknown_feature_xyz', 'BLOCK'],
  ['DRIVING', 'MAP', 'ALLOW'],
  ['DRIVING', 'CURRENT_WEATHER', 'ALLOW'],
  ['DRIVING', 'DISASTER_ALERT', 'ALLOW'],
  ['DRIVING', 'DIRECTIONS', 'ALLOW'],
  ['DRIVING', 'SATELLITE_PLAYBACK', 'BLOCK'],
  ['DRIVING', 'TIME_PLAYBACK', 'BLOCK'],
  ['DRIVING', 'LOCAL_DISCOVERY', 'BLOCK'],
  ['DRIVING', 'RESERVATION', 'BLOCK'],
  ['DRIVING', 'COUPON', 'BLOCK'],
  ['DRIVING', 'VIDEO_PLAYBACK', 'BLOCK'],
  ['DRIVING', 'KEYBOARD_SEARCH', 'BLOCK'],
];
for (const [state, action, expected] of TABLE) {
  test(`${state} + ${action} = ${expected}`, () => assert.equal(decide(state, action), expected));
}

test('등록되지 않은 기능은 PARKED 에서도 막는다 (정본 목록 강제)', () => {
  const d = decideAction({ drivingState: 'PARKED', action: 'unknown_feature_xyz' });
  assert.equal(d.decision, 'BLOCK');
  assert.equal(d.reason, 'UNREGISTERED_ACTION');
});
test('기능 이름이 없거나 문자열이 아니면 막는다', () => {
  for (const a of [undefined, null, '', 42, {}]) assert.equal(decide('PARKED', a), 'BLOCK');
});
test('운전 상태 누락·오타·소문자·객체는 모두 UNKNOWN(운전 중 취급)이다', () => {
  for (const s of [undefined, null, '', 'parked', 'Parked', 'MOVING', 0, {}, 'PARKED ']) {
    const d = decideAction({ drivingState: s, action: 'LOCAL_DISCOVERY' });
    assert.equal(d.drivingState, 'UNKNOWN', String(s));
    assert.equal(d.decision, 'BLOCK', String(s));
  }
});
test('UNKNOWN 은 PARKED 가 아니다 — 운전 중 허용 4개만 된다', () => {
  const allowed = Object.keys(ACTION_POLICY).filter(a => decide('UNKNOWN', a) === 'ALLOW').sort();
  assert.deepEqual(allowed, ['CURRENT_WEATHER', 'DIRECTIONS', 'DISASTER_ALERT', 'MAP']);
});
test('DRIVING·RESTRICTED 의 허용 목록도 정확히 4개다', () => {
  for (const s of ['DRIVING', 'RESTRICTED']) {
    const allowed = Object.keys(ACTION_POLICY).filter(a => decide(s, a) === 'ALLOW').sort();
    assert.deepEqual(allowed, ['CURRENT_WEATHER', 'DIRECTIONS', 'DISASTER_ALERT', 'MAP']);
  }
});
test('옛 이름으로 게이트를 우회할 수 없다 (time-playback·local_explore 등)', () => {
  for (const alias of ['time-playback', 'satellite_playback', 'local_discovery', 'local_explore', 'deep_detail', 'reservation_flow', 'complex_filters', 'keyboard_search', 'forecast', 'coupon', 'video_playback', 'settings']) {
    assert.ok(canonicalAction(alias), alias);
    assert.equal(decide('DRIVING', alias), 'BLOCK', alias);
  }
  assert.equal(canonicalAction('time-playback'), 'TIME_PLAYBACK');
  assert.equal(canonicalAction('satellite_playback'), 'SATELLITE_PLAYBACK');
  assert.equal(canonicalAction('local_explore'), 'LOCAL_DISCOVERY');
  assert.equal(canonicalAction('local_discovery'), 'LOCAL_DISCOVERY');
});
test('모든 옛 이름은 등록된 정본 이름으로만 간다', () => {
  for (const [alias, target] of Object.entries(actions.ACTION_ALIASES)) {
    assert.ok(Object.prototype.hasOwnProperty.call(ACTION_POLICY, target), `${alias}→${target}`);
  }
  assert.deepEqual(Object.keys(ACTION_POLICY).sort(), Object.values(ACTION).sort());
});
test('예약·쿠폰은 실제 기능(capability)이 없으면 주차 중에도 막는다', () => {
  assert.equal(decideAction({ drivingState: 'PARKED', action: 'RESERVATION' }).reason, 'CAPABILITY_ABSENT');
  assert.equal(decideAction({ drivingState: 'PARKED', action: 'COUPON' }).reason, 'CAPABILITY_ABSENT');
  assert.equal(decide('PARKED', 'RESERVATION', { capabilities: { transactions: true } }), 'ALLOW');
  assert.equal(decide('DRIVING', 'RESERVATION', { capabilities: { transactions: true } }), 'BLOCK');
});
test('재난 특보는 여가·상업을 PARKED 에서도 막고, 안전 정보는 막지 않는다', () => {
  const x = { criticalDisaster: true, capabilities: { transactions: true } };
  assert.equal(decideAction({ drivingState: 'PARKED', action: 'LOCAL_DISCOVERY', ...x }).reason, 'CRITICAL_DISASTER_OVERRIDE');
  assert.equal(decide('PARKED', 'RESERVATION', x), 'BLOCK');
  assert.equal(decide('PARKED', 'COUPON', x), 'BLOCK');
  assert.equal(decide('PARKED', 'DISASTER_ALERT', x), 'ALLOW');
  assert.equal(decide('DRIVING', 'DISASTER_ALERT', x), 'ALLOW');
  assert.equal(decide('DRIVING', 'DIRECTIONS', x), 'ALLOW');
});
test('guardAction 은 실행 순간의 상태로 다시 판단하고, 막히면 실행 함수를 부르지 않는다', () => {
  let state = 'PARKED'; let calls = 0;
  const ctx = () => ({ drivingState: state });
  assert.equal(guardAction('LOCAL_DISCOVERY', ctx, () => ++calls).executed, true);
  state = 'DRIVING';   // 화면은 주차 중에 그려졌지만 누르는 순간 출발했다
  const r = guardAction('LOCAL_DISCOVERY', ctx, () => ++calls);
  assert.equal(r.executed, false);
  assert.equal(calls, 1);
});
test('guardAction 의 상태 함수가 던지면 UNKNOWN 으로 판단한다', () => {
  let calls = 0;
  const r = guardAction('PLACE_DETAIL', () => { throw new Error('host down'); }, () => ++calls);
  assert.equal(r.executed, false);
  assert.equal(r.decision.drivingState, 'UNKNOWN');
  assert.equal(calls, 0);
});
test('host 가 없거나 이상한 값·예외를 주면 UNKNOWN', () => {
  assert.equal(hostMod.createHostBridge({}).drivingState(), 'UNKNOWN');
  assert.equal(hostMod.createHostBridge({ EarthusPleosHost: { getDrivingState: () => 'parked' } }).drivingState(), 'UNKNOWN');
  assert.equal(hostMod.createHostBridge({ EarthusPleosHost: { getDrivingState: () => { throw new Error('x'); } } }).drivingState(), 'UNKNOWN');
  assert.equal(hostMod.createHostBridge({ EarthusPleosHost: { getDrivingState: () => 'PARKED' } }).drivingState(), 'PARKED');
  assert.equal(DRIVING_STATE.UNKNOWN, 'UNKNOWN');
});
test('host 위치가 범위를 벗어나거나 숫자가 아니면 위치 없음으로 둔다 (좌표를 지어내지 않는다)', () => {
  const mk = loc => hostMod.createHostBridge({ EarthusPleosHost: { getLocation: () => loc } }).location();
  assert.equal(mk({ lat: 'x', lon: 1 }), null);
  assert.equal(mk({ lat: 91, lon: 1 }), null);
  assert.equal(mk(null), null);
  assert.equal(mk({ lat: 37.5, lon: 127 }).source, 'VEHICLE_HOST');
});
test('URL·localStorage 로 PARKED 를 켜는 우회로가 없다', () => {
  const src = fs.readFileSync(path.join(PROTOTYPE, 'js/pleos/host-bridge.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /location\.search|URLSearchParams|localStorage|sessionStorage/);
});
test('Pleos 화면의 모든 data-action 은 등록된 정본 이름이다 (화면 이름과 게이트 이름이 어긋나지 않는다)', () => {
  const src = ['render.js', 'app.js'].map(f => fs.readFileSync(path.join(PROTOTYPE, 'js/pleos', f), 'utf8')).join('\n');
  const literal = [...src.matchAll(/data-action="([A-Z_a-z-]+)"/g)].map(m => m[1]);
  for (const a of literal) assert.ok(Object.prototype.hasOwnProperty.call(ACTION_POLICY, a), a);
  assert.doesNotMatch(src, /data-action="\$\{(?!ACTION\.)/, 'data-action 은 ACTION 상수만 쓴다');
});
test('app.js 의 실행 경로는 guardAction 을 거친다', () => {
  const src = fs.readFileSync(path.join(PROTOTYPE, 'js/pleos/app.js'), 'utf8');
  assert.match(src, /guardAction\(action, liveContext/);
  assert.match(src, /drivingState: bridge\.drivingState\(\)/, '실행 순간 host 값을 다시 읽는다');
});

await run();
