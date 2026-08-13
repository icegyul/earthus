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
assert.match(radarHandler, /HISTORY_SLOTS = 13[\s\S]*CYCLIC_FIXED_SLOTS/,
  'radar history must stay within fixed cyclic slots instead of growing without bound');
assert.match(radarHandler, /event\.get\("backfillFrames"\)[\s\S]*max\(0, len\(collected\) - 1\)/,
  'manual backfill must be explicit and routine schedules must fetch only one frame');
assert.match(ui, /data-radar-timeline[\s\S]*5분 간격 레이더 영상 선택/,
  'multiple official frames must expose an accessible 5-minute timeline');
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

const profile = metrics.windProfileSummary({ observedUtc: '202608131800', stations: [
  { stn: '47095', levels: [
    { heightM: 500, windSpeedMs: 15, windDirectionDeg: 280, mode: 'L', qcRaw: '0' },
    { heightM: 100, windSpeedMs: null, windDirectionDeg: 270, mode: 'L', qcRaw: '1' },
    { heightM: 1000, windSpeedMs: 22, windDirectionDeg: 290, mode: 'H', qcRaw: '0' },
  ] },
] });
assert.equal(profile.stationCount, 1);
assert.equal(profile.levelCount, 3);
assert.equal(profile.stations[0].minHeightM, 100);
assert.equal(profile.stations[0].maxHeightM, 1000);
assert.equal(profile.stations[0].missingWind, 1);
assert.equal(profile.stations[0].strongest.windSpeedMs, 22);
assert.deepEqual(profile.stations[0].sampledLevels.map(row => row.heightM), [100, 500, 1000]);
assert.match(ui, /연직바람 실측[\s\S]*고도 사이를 보간하지 않습니다/,
  'upper-air UI must show actual vertical wind levels without interpolation');

const timeline = metrics.evidenceTimeline({
  radar: { requestedKst: '202608140105', updateMinutes: 5, image: { bytes: 180000 }, source: 'KMA radar' },
  lightning: { observedKst: '202608140103', count: 18, windowMinutes: 60, source: 'KMA lightning' },
  aws: { observedKst: '202608140100', count: 736, stations: [], source: 'KMA AWS' },
  warning: { generated: '2026-08-13T15:55:00Z', activeCount: 4, source: 'KMA warning' },
}, Date.parse('2026-08-13T16:10:00Z'));
assert.deepEqual(timeline.map(row => row.id), ['RADAR', 'LIGHTNING', 'AWS', 'WARNING']);
assert.equal(timeline[0].at, '2026-08-13T16:05:00.000Z');
assert.equal(timeline[0].count, 1, 'one radar frame must not pretend to be pixel sample count');
assert.equal(timeline[2].count, 736);
assert.equal(timeline[3].kind, 'OFFICIAL_BULLETIN');
const unknownTimeline = metrics.evidenceTimeline({ warning: { source: 'KMA' } }, Date.now());
assert.equal(unknownTimeline[0].state, 'UNKNOWN');
assert.equal(unknownTimeline[0].at, null, 'missing bulletin time must not be replaced with now');
assert.match(ui, /evidenceTimeline[\s\S]*값을 섞거나 평균내지 않습니다/,
  'sky tab must explain that unlike sources are aligned but not averaged');

console.log('KMA Live: 41/41 passed');
