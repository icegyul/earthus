import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/v8/unified-time.js', import.meta.url), 'utf8');
const { UnifiedTime, bindSignalTime } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const events = [];
const time = new UnifiedTime({ now: () => '2026-08-21T03:00:00Z', timezone: 'Asia/Seoul', onChange: event => events.push(event) });
time.registerAvailability('ocean.current', { from: '2026-08-21T00:00:00Z', to: '2026-08-21T06:00:00Z', stepSeconds: 10800 });
time.registerAvailability('human.tourism', { from: '2026-08-21T00:00:00Z', to: '2026-08-21T00:00:00Z', stepSeconds: 3600 });

time.setMode('NOW');
assert.equal(time.snapshot().cursorTime, '2026-08-21T03:00:00Z');
assert.equal(time.snapshot().playback.state, 'STOPPED');
assert.equal(time.layerState('ocean.current'), 'AVAILABLE');
assert.equal(time.layerState('human.tourism'), 'UNAVAILABLE', 'one unavailable layer does not halt global time');

time.startPlayback({ from: '2026-08-21T00:00:00Z', to: '2026-08-21T02:00:00Z', stepSeconds: 3600 });
assert.equal(time.snapshot().playback.loop, false);
assert.equal(time.advance().cursorTime, '2026-08-21T01:00:00.000Z');
assert.equal(time.advance().cursorTime, '2026-08-21T02:00:00.000Z');
assert.equal(time.advance().playback.state, 'STOPPED', 'playback stops at the finite end');
assert.ok(events.some(event => event.type === 'time.cursor.changed'));

assert.equal(bindSignalTime({ dataClass: 'OBSERVED', times: { observedAt: '2026-08-21T01:00:00Z', issuedAt: null, validAt: null } }), '2026-08-21T01:00:00Z');
assert.equal(bindSignalTime({ dataClass: 'OFFICIAL_FORECAST', times: { observedAt: null, issuedAt: '2026-08-21T00:00:00Z', validAt: '2026-08-21T05:00:00Z' } }), '2026-08-21T05:00:00Z');
assert.equal(bindSignalTime({ dataClass: 'OFFICIAL_FORECAST', times: { observedAt: null, issuedAt: '2026-08-21T00:00:00Z', validAt: null } }), null, 'validAt is not substituted with issuedAt');
assert.throws(() => time.setMode('FUTURE'), /unknown time mode/);

console.log('EARTHUS v8 unified time: PASS');
