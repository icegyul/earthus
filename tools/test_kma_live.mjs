import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../prototype/js/ui-korea.js', import.meta.url), 'utf8');
const menu = await readFile(new URL('../prototype/js/layerbar.js', import.meta.url), 'utf8');
const korea = await readFile(new URL('../prototype/js/korea.js', import.meta.url), 'utf8');
const oceanHandler = await readFile(new URL('../aws/kma-ocean/handler.py', import.meta.url), 'utf8');
const radarHandler = await readFile(new URL('../aws/kma-radar/handler.py', import.meta.url), 'utf8');
const metricsSource = await readFile(new URL('../prototype/js/kma-live-metrics.js', import.meta.url), 'utf8');
const metrics = await import(`data:text/javascript;base64,${Buffer.from(metricsSource).toString('base64')}`);

assert.match(menu, /기상청 라이브[\s\S]*736개 실측[\s\S]*5일 공식예보/,
  'KMA data must have a visible top-level Layers entry');
assert.match(ui, /id: 'forecast'[\s\S]*id: 'upper'/,
  'official forecast and upper-air tabs must be public');
for (const id of ['landobs', 'alerts', 'lightning', 'tpw', 'buoy']) {
  assert.match(ui, new RegExp(`_mapButton\\('${id}'`), `${id} must have a map action`);
}
assert.match(korea, /forecast:.*kma-fcst\.json[\s\S]*upperNow:.*kma-upper\.json/,
  'KMA forecast and current upper-air sources must be wired');
assert.doesNotMatch(ui + menu, /setInterval|requestAnimationFrame/,
  'KMA Live must not own an infinite render loop');
assert.match(oceanHandler, /whRaw[\s\S]*wave-height-outlier-over-30m/,
  'impossible wave values must remain auditable but not enter maps/extrema');
assert.match(radarHandler, /PNG_KEY = "wind\/kma-radar\.png"[\s\S]*observedTimeAuthority/,
  'official radar image must be cached with explicit timestamp authority');
assert.match(ui, /기상청 HSR 레이더[\s\S]*ground-station observations/,
  'radar imagery and rain-gauge observations must be visibly separated');
assert.doesNotMatch(ui, /169개 해양관측/, 'live marine station count must not be hard-coded');

const points = [
  { id: 'a', name: 'A', hourly: [{ tm: '202608130000', t: 25, pop: 20, ws: 2 }] },
  { id: 'b', name: 'B', hourly: [{ tm: '202608130000', t: 29, pop: 70, ws: 5 }] },
  { id: 'c', name: 'C', hourly: [{ tm: '202608130000', t: null, pop: null, ws: null }] },
];
const highlights = metrics.forecastHighlights(points, Date.parse('2026-08-12T14:30:00Z'));
assert.equal(highlights.sampleCount, 3);
assert.equal(highlights.hottest[0].name, 'B');
assert.equal(highlights.wettest[0].pop, 70);
assert.equal(highlights.windiest[0].ws, 5);
assert.equal(highlights.coolest.length, 2, 'missing temperature must not become 0°C');

const upper = metrics.upperAirSummary({ stations: [
  { tm: '202608121200', tpw: 30, cape: null, ki: 10, li: 3 },
  { tm: '202608121200', tpw: 40, cape: 120, ki: 20, li: -1 },
] }, { days: {
  20260810: { tpw: 20, capeMax: 50, ki: 8, li: 4 },
  20260811: { tpw: 30, capeMax: 100, ki: 12, li: 2 },
  20260812: { tpw: 35, capeMax: 120, ki: 15, li: 1 },
} });
assert.equal(upper.stationCount, 2);
assert.equal(upper.missing.cape, 1);
assert.equal(upper.tpw.value, 35);
assert.equal(upper.capeMax.value, 120);
assert.equal(metrics.empiricalPercentile([10, 20, 30], 20), 50);
assert.equal(metrics.parseKmaTime('202608122300').toISOString(), '2026-08-12T14:00:00.000Z');
assert.equal(metrics.parseKmaUtcTime('202608121200').toISOString(), '2026-08-12T12:00:00.000Z');

console.log('KMA Live: 25/25 passed');
