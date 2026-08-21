import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/v8/truth-contract.js', import.meta.url), 'utf8');
const {
  ACCESS_CLASS,
  DATA_CLASS,
  classifyAccess,
  makeCanonicalSignal,
  signalLiveState,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const sourceTimes = {
  observedAt: '2026-08-21T00:00:00Z',
  issuedAt: null,
  validAt: null,
  receivedAt: '2026-08-21T00:01:00Z',
};

assert.equal(classifyAccess({ dataClass: DATA_CLASS.OBSERVED, rightsAllowed: true }), ACCESS_CLASS.PUBLIC);
assert.equal(classifyAccess({ dataClass: DATA_CLASS.OFFICIAL_FORECAST, rightsAllowed: true }), ACCESS_CLASS.PUBLIC);
assert.equal(classifyAccess({ dataClass: DATA_CLASS.OFFICIAL_WARNING, rightsAllowed: true }), ACCESS_CLASS.ALWAYS_FREE_SAFETY);
assert.equal(classifyAccess({ dataClass: DATA_CLASS.EARTHUS_DERIVED, rightsAllowed: true }), ACCESS_CLASS.PREMIUM);
assert.equal(classifyAccess({ dataClass: DATA_CLASS.OBSERVED, rightsAllowed: false }), ACCESS_CLASS.BLOCKED_RIGHTS);

const signal = makeCanonicalSignal({
  signalId: 'sig_demo_temperature',
  variable: 'air_temperature',
  dataClass: DATA_CLASS.OBSERVED,
  value: 27,
  unit: 'Cel',
  geometry: { type: 'Point', coordinates: [126.97, 37.56] },
  times: sourceTimes,
  sourceRefs: ['src_demo_observation'],
});
assert.deepEqual(signal.times, sourceTimes, 'missing issued/valid times stay null and are not substituted');
assert.equal(signal.accessClass, ACCESS_CLASS.PUBLIC);
assert.equal(signalLiveState(signal, '2026-08-21T00:04:59Z', 300), 'LIVE');
assert.equal(signalLiveState(signal, '2026-08-21T00:05:01Z', 300), 'STALE');

const forecast = makeCanonicalSignal({
  signalId: 'sig_demo_forecast',
  variable: 'air_temperature',
  dataClass: DATA_CLASS.OFFICIAL_FORECAST,
  value: 26,
  unit: 'Cel',
  geometry: { type: 'Point', coordinates: [126.97, 37.56] },
  times: { observedAt: null, issuedAt: '2026-08-21T00:00:00Z', validAt: '2026-08-21T03:00:00Z', receivedAt: '2026-08-21T00:01:00Z' },
  sourceRefs: ['src_demo_official_forecast'],
});
assert.equal(signalLiveState(forecast, '2026-08-21T00:01:30Z', 300), 'NOT_LIVE', 'a forecast is never labeled LIVE');

assert.throws(() => makeCanonicalSignal({
  signalId: 'sig_missing_source', variable: 'x', dataClass: DATA_CLASS.OBSERVED,
  value: 1, unit: null, geometry: { type: 'Point', coordinates: [0, 0] }, times: sourceTimes, sourceRefs: [],
}), /sourceRefs/);
assert.throws(() => makeCanonicalSignal({
  signalId: 'sig_bad_time', variable: 'x', dataClass: DATA_CLASS.OBSERVED,
  value: 1, unit: null, geometry: { type: 'Point', coordinates: [0, 0] }, times: { ...sourceTimes, observedAt: 'not-a-date' }, sourceRefs: ['src_x'],
}), /observedAt/);

console.log('EARTHUS v8 truth contract: PASS');
