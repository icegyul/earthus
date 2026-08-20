import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/weather-earth-sync.js', import.meta.url), 'utf8')
  .catch(() => 'throw new Error("WEATHER_EARTH_SYNC_NOT_IMPLEMENTED")');
const { createWeatherEarthSync } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

class FakeEvents {
  constructor() { this.listeners = new Map(); this.dispatched = []; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatchEvent(event) {
    this.dispatched.push(event);
    this.listeners.get(event.type)?.(event);
    return true;
  }
  send(type, detail) { this.listeners.get(type)?.({ type, detail }); }
}

const calls = [];
const events = new FakeEvents();
const sync = createWeatherEarthSync({
  eventTarget: events,
  sceneMgr: { to: async (scene, options) => { calls.push(['scene', scene, options.stage]); } },
  store: { setLayer: (id, on) => calls.push(['layer', id, on]) },
  flyTo: (lon, lat, height, duration) => calls.push(['fly', lon, lat, height, duration]),
  renderMoment: detail => calls.push(['moment', detail.validAt, detail.hour.temperature.value]),
});

assert.equal(await sync.applyLayer({ id: 'rain' }), true);
assert.deepEqual(calls.slice(0, 2), [['scene', 'earth', 'surface'], ['layer', 'rain', true]]);
assert.equal(await sync.applyLayer({ id: 'cyclone' }), false, '날씨 카드 허용 레이어만 연다');

const detail = {
  validAt: '2026-08-20T09:00:00.000Z',
  location: { name: '서울', lat: 37.5665, lon: 126.978 },
  hour: { temperature: { value: 30, unit: '°C', sourceType: 'OFFICIAL_FORECAST' } },
};
assert.equal(await sync.applyTime(detail), true);
assert.deepEqual(calls.slice(2), [
  ['scene', 'earth', 'surface'],
  ['moment', detail.validAt, 30],
  ['fly', 126.978, 37.5665, 2_800_000, 0.9],
]);
assert.equal(events.dispatched.at(-1).type, 'earthus:weather-time-applied');
assert.equal(events.dispatched.at(-1).detail.validAt, detail.validAt);

assert.equal(await sync.applyTime({ ...detail, validAt: 'invalid' }), false);
assert.equal(await sync.applyTime({ ...detail, location: { lat: 100, lon: 0 } }), false);

sync.init();
events.send('earthus:weather-layer-request', { id: 'pm25' });
await sync.flush();
assert.deepEqual(calls.slice(-2), [['scene', 'earth', 'surface'], ['layer', 'pm25', true]]);
sync.destroy();
assert.equal(events.listeners.has('earthus:weather-layer-request'), false);

console.log('weather earth sync: PASS');
