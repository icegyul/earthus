import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [summarySource, uiSource, narrativeSource, climateSource, cssSource] = await Promise.all([
  readFile(path.join(root, 'prototype/js/weather-summary.js'), 'utf8'),
  readFile(path.join(root, 'prototype/js/ui-weather.js'), 'utf8'),
  readFile(path.join(root, 'prototype/js/narrative.js'), 'utf8'),
  readFile(path.join(root, 'prototype/js/location-climate.js'), 'utf8'),
  readFile(path.join(root, 'prototype/css/app.css'), 'utf8'),
]);

const condStub = `const condText=(sky,pty,ko=true)=>{const sk=ko?{1:'맑음',3:'구름많음',4:'흐림'}:{1:'Clear',3:'Partly cloudy',4:'Cloudy'};const pt=ko?{1:'비',2:'비/눈',3:'눈',4:'소나기',5:'빗방울',6:'빗방울/눈날림',7:'눈날림'}:{1:'Rain',2:'Rain/snow',3:'Snow',4:'Showers'};return pty?(pt[pty]||'강수'):(sk[sky]||'—')};`;
const loadable = summarySource.replace(/import \{ condText \} from '.\/kma-fcst\.js';/, condStub);
const summary = await import(`data:text/javascript;base64,${Buffer.from(loadable).toString('base64')}`);

const hours = [];
for (let h = 0; h < 24; h++) hours.push({
  tm: `20260815${String(h).padStart(2, '0')}00`, t: 26, sky: 4,
  pty: [15, 19].includes(h) ? 4 : 0, pop: [15, 19].includes(h) ? 60 : 30,
  pcp: h === 15 ? '14.0mm' : (h === 19 ? '7.0mm' : 0),
});
for (let h = 0; h < 24; h++) hours.push({
  tm: `20260816${String(h).padStart(2, '0')}00`, t: 25, sky: 4,
  pty: (h >= 6 && h <= 15) || h === 22 ? 1 : 0,
  pop: (h >= 6 && h <= 15) || h === 22 ? 60 : 30,
  pcp: h === 6 ? '7.0mm' : 0,
});
const kma = {
  hours,
  days: {
    20260815: { tmin: 24, tmax: 31 },
    20260816: { tmin: 24, tmax: 29 },
  },
};
const result = summary.summarizeKma(kma, true, Date.parse('2026-08-15T00:30:00+09:00'));
assert.equal(result.today.headline, '오늘은 오후 3시와 저녁 7시에 소나기 예보가 있습니다');
assert.deepEqual(result.today.windows, ['15시', '19시']);
assert.match(result.today.detail, /강수확률 최고 60%/);
assert.match(result.today.detail, /한 시간 강수량 최대 14\.0mm/);
assert.equal(result.today.icon, '🌧️');
assert.equal(result.tomorrow.headline,
  '내일은 오전 6시부터 오후 3시까지 비가 이어지고, 밤 10시에 다시 예보됩니다');
assert.deepEqual(result.tomorrow.windows, ['06~15시', '22시']);

const oldFetch = globalThis.fetch;
let seriesFetched = false;
globalThis.fetch = async url => {
  const value = String(url);
  if (value.includes('station-temp/index.json')) return {
    ok: true,
    json: async () => ({ stations: [
      { id: 112, name: '인천', lat: 37.467, lon: 126.633, path: 'data/station-temp/112.json' },
    ] }),
  };
  if (value.includes('doy/index.json')) return {
    ok: true,
    json: async () => ({ stations: [
      { s: 108, n: '서울', la: 37.57142, lo: 126.9658 },
      { s: 112, n: '인천', la: 37.47772, lo: 126.6249 },
    ] }),
  };
  seriesFetched = true;
  throw new Error(`unexpected series fetch: ${value}`);
};
try {
  const climate = await import(`data:text/javascript;base64,${Buffer.from(climateSource).toString('base64')}`);
  const guarded = await climate.climateSeriesAt(37.5665, 126.9780);
  assert.equal(guarded.unavailable, true);
  assert.equal(guarded.expectedStation.name, '서울');
  assert.equal(guarded.referenceStation.name, '인천');
  assert.equal(seriesFetched, false, 'a mismatched city series must not be downloaded');
} finally {
  globalThis.fetch = oldFetch;
}

const todayMethod = uiSource.slice(uiSource.indexOf('  _today(body'), uiSource.indexOf('  _annualClimate(body, ko) {'));
assert.ok(todayMethod.indexOf('_todayKma') < todayMethod.indexOf('_narrative'), 'official forecast must precede context narrative');
assert.ok(todayMethod.indexOf('_narrative') < todayMethod.indexOf('_annualClimate'), 'annual climate must remain last');
assert.match(uiSource, /k\.hours\.slice\(0, 24\)/, '24-hour conditions must be visible');
assert.match(uiSource, /details\.addEventListener\('toggle'/, 'annual climate must lazy-load only when opened');
assert.match(uiSource, /오늘·내일 예보 아래의 별도 참고 자료/, 'annual station data must remain below the forecast');
assert.match(uiSource, /화면에 .* 장기 차트를 대신 표시하지 않습니다/, 'another city must not replace the selected city');
assert.match(uiSource, /시 예보/, 'forecast-hour values must not be labelled as live observations');
assert.match(uiSource, /_dropStaleKma\(\)[\s\S]*this\.kma = null/, 'a changed location must discard the previous KMA station');
assert.match(uiSource, /this\._placeKey\(\) !== key/, 'late forecast responses must not overwrite a new location');
assert.doesNotMatch(narrativeSource, /head:\s*ko\s*\?\s*'특별한 것이 없는 날입니다'/);
assert.doesNotMatch(narrativeSource, /S\(`오늘은 눈에 띄는 것이 없습니다/);
assert.match(narrativeSource, /기온·습도는 평년과 비슷합니다/);
assert.match(cssSource, /\.wxh\{[^}]*min-height:105px/s);
assert.match(cssSource, /\.wx-climate>summary\{[^}]*min-height:52px/s);
assert.match(cssSource, /\.wx-climate-unavailable\{/);

console.log('PASS: current forecast first, official rain timing, tomorrow, icons, and honest climate reference');
