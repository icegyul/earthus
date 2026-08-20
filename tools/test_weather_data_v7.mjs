import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/weather-data-v7.js', import.meta.url), 'utf8');
const { loadWeatherInputsV7 } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const calls = [];
const deps = {
  fetchWeather: async (lat, lon) => { calls.push(['weather', lat, lon]); return { timezone: 'Asia/Seoul' }; },
  fetchKmaForecast: async (lat, lon) => { calls.push(['forecast', lat, lon]); return { name: '서울' }; },
  fetchKorea: async name => {
    calls.push(['korea', name]);
    if (name === 'airobservation' || name === 'airob') throw new Error('unexpected alias');
    if (name === 'airobs') throw new Error('AIR_PROVIDER_DOWN');
    return { name };
  },
  fetchWarningGate: async point => { calls.push(['warning', point.lat, point.lon]); return { status: 'UNKNOWN' }; },
  fetchMarine: async (lat, lon) => { calls.push(['marine', lat, lon]); return null; },
};

const seoul = await loadWeatherInputsV7(
  { name: '서울특별시', lat: 37.5665, lon: 126.978, region: '서울' }, deps,
);
assert.deepEqual(seoul.location, {
  name: '서울특별시', lat: 37.5665, lon: 126.978, region: '서울',
});
assert.deepEqual(seoul.openMeteo, { timezone: 'Asia/Seoul' });
assert.deepEqual(seoul.kmaForecast, { name: '서울' });
assert.deepEqual(seoul.kmaObservation, { name: 'aws' });
assert.deepEqual(seoul.uvIndex, { name: 'life' });
assert.equal(seoul.airObservation, null);
assert.equal(seoul.errors.airObservation, 'AIR_PROVIDER_DOWN');
assert.equal(seoul.errors.openMeteo, undefined);
assert.ok(calls.some(call => call[0] === 'warning'));
assert.ok(calls.some(call => call[0] === 'marine'));

calls.length = 0;
const paris = await loadWeatherInputsV7(
  { name: 'Paris', lat: 48.8566, lon: 2.3522, region: null }, deps,
);
assert.deepEqual(paris.openMeteo, { timezone: 'Asia/Seoul' });
assert.equal(paris.kmaForecast, null);
assert.equal(paris.kmaObservation, null);
assert.equal(paris.airObservation, null);
assert.equal(paris.uvIndex, null);
assert.equal(calls.some(call => call[0] === 'korea'), false,
  '한국 밖에서 KMA/AirKorea 전체 자료를 받지 않는다');
assert.equal(calls.some(call => call[0] === 'forecast'), false);
assert.equal(calls.some(call => call[0] === 'warning'), true,
  '범위 밖도 현지 공식기관 부재를 UNKNOWN으로 표시해야 한다');

await assert.rejects(
  () => loadWeatherInputsV7({ name: 'invalid', lat: null, lon: 0 }, deps),
  error => error.message === 'WEATHER_LOCATION_INVALID',
);

console.log('weather data v7: PASS');
