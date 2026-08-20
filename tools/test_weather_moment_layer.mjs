import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/weather-moment-layer.js', import.meta.url), 'utf8')
  .catch(() => 'throw new Error("WEATHER_MOMENT_LAYER_NOT_IMPLEMENTED")');
const { createWeatherMomentLayer } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const added = [];
const removed = [];
const viewer = { entities: {
  add: config => { added.push(config); return config; },
  remove: entity => { removed.push(entity); return true; },
} };
const Cesium = {
  Cartesian3: { fromDegrees: (...args) => ({ args }) },
  Cartesian2: class Cartesian2 { constructor(x, y) { this.x = x; this.y = y; } },
  Color: {
    fromCssColorString: value => ({ value, withAlpha(alpha) { return { value, alpha }; } }),
    WHITE: 'white',
  },
  VerticalOrigin: { BOTTOM: 'BOTTOM' },
  HorizontalOrigin: { CENTER: 'CENTER' },
};
let animations = 0;
const layer = createWeatherMomentLayer({ viewer, Cesium, power: { animate: () => { animations += 1; } },
  language: () => 'ko' });

assert.equal(layer.show({
  validAt: '2026-08-20T09:00:00.000Z',
  location: { name: '서울', lat: 37.5665, lon: 126.978, timezone: 'Asia/Seoul' },
  hour: {
    temperature: { value: 30, unit: '°C', sourceType: 'OFFICIAL_FORECAST' },
    precipitationProbability: { value: 70, unit: '%' },
  },
}), true);
assert.equal(added.length, 1);
assert.deepEqual(added[0].position.args, [126.978, 37.5665, 60_000]);
assert.match(added[0].label.text, /공식 예보/);
assert.match(added[0].label.text, /30°C/);
assert.match(added[0].label.text, /70%/);
assert.equal('heightReference' in added[0].point, false, 'clampToGround/지면 고정은 쓰지 않는다');
assert.equal(animations, 1);

layer.show({
  validAt: '2026-08-20T10:00:00.000Z',
  location: { name: '서울', lat: 37.5665, lon: 126.978, timezone: 'Asia/Seoul' },
  hour: { temperature: { value: 29, unit: '°C', sourceType: 'MODEL_FORECAST' } },
});
assert.equal(added.length, 2);
assert.equal(removed[0], added[0], '시각을 바꾸면 표식을 누적하지 않는다');
layer.clear();
assert.equal(removed.at(-1), added[1]);

console.log('weather moment layer: PASS');
