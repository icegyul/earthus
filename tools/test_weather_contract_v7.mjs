import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/weather-contract-v7.js', import.meta.url), 'utf8');
const {
  DATA_STATE,
  SOURCE_TYPE,
  buildWeatherQueryV7,
  buildWeatherCardModel,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const NOW = '2026-08-20T06:35:00Z';

const kmaObservation = {
  generated: '2026-08-20T06:32:00Z',
  observedKst: '202608201529',
  source: '기상청 방재기상관측 AWS 매분자료 (API허브)',
  sourceEn: 'KMA AWS 1-minute observations',
  license: '공공누리 제1유형 (출처표시)',
  stations: [{
    id: '108', name: '서울', lat: 37.5714, lon: 126.9658,
    ta: 27, hm: 82.1, ws1: 1, wd1: 32.5, wss: 1.4,
    rn15: 0, rn60: 0.1, rnday: 1.8, ps: 1013.2, td: 23.7,
  }],
};

const kmaForecast = {
  name: '서울', km: 1, baseKst: '202608201400',
  source: '기상청 동네예보 (API허브 getVilageFcst)',
  sourceEn: 'KMA Village Forecast',
  license: '공공누리 제1유형 (출처표시)',
  now: {
    tm: '202608201500', t: 30, wd: 270, ws: 0.6,
    sky: 3, pty: 0, pop: 20, pcp: 0, rh: 70,
  },
  hours: Array.from({ length: 30 }, (_, index) => ({
    tm: `202608${String(20 + Math.floor((15 + index) / 24)).padStart(2, '0')}${String((15 + index) % 24).padStart(2, '0')}00`,
    t: 30 - index * 0.1, wd: 270, ws: 0.6,
    sky: 3, pty: 0, pop: 20, pcp: 0, rh: 70,
  })),
  days: {
    20260821: { tmin: 24, tmax: 30 },
    20260822: { tmin: 24, tmax: 31 },
    20260823: { tmin: 25, tmax: 33 },
  },
};

const openMeteo = {
  timezone: 'Asia/Seoul',
  timezone_abbreviation: 'GMT+9',
  utc_offset_seconds: 32400,
  current: {
    time: '2026-08-20T15:30', interval: 900,
    temperature_2m: 29.4, relative_humidity_2m: 68,
    apparent_temperature: 33.1, precipitation: 0,
    weather_code: 2, surface_pressure: 1006.2,
    wind_speed_10m: 5.4, wind_direction_10m: 280, wind_gusts_10m: 10.2,
    is_day: 1,
  },
  hourly: {
    time: Array.from({ length: 24 }, (_, index) => `2026-08-2${index < 9 ? 0 : 1}T${String(index).padStart(2, '0')}:00`),
    temperature_2m: Array(24).fill(29),
    relative_humidity_2m: Array(24).fill(70),
    precipitation_probability: Array(24).fill(20),
    precipitation: Array(24).fill(0),
    weather_code: Array(24).fill(2),
    wind_speed_10m: Array(24).fill(4),
    wind_direction_10m: Array(24).fill(270),
    wind_gusts_10m: Array(24).fill(8),
    visibility: Array(24).fill(18000),
    surface_pressure: Array(24).fill(1007),
    uv_index: Array(24).fill(5),
  },
  daily: {
    time: Array.from({ length: 10 }, (_, index) => `2026-08-${String(20 + index).padStart(2, '0')}`),
    weather_code: [2, 61, 3, 2, 1, 3, 2, 61, 2, 3],
    temperature_2m_max: [31, 30, 31, 33, 32, 31, 30, 29, 31, 32],
    temperature_2m_min: [25, 24, 24, 25, 25, 24, 23, 24, 24, 25],
    precipitation_sum: [0, 5, 0, 0, 0, 0, 0, 7, 0, 0],
    precipitation_probability_max: [20, 70, 20, 10, 10, 20, 20, 80, 20, 20],
    sunrise: Array.from({ length: 10 }, (_, index) => `2026-08-${String(20 + index).padStart(2, '0')}T05:55`),
    sunset: Array.from({ length: 10 }, (_, index) => `2026-08-${String(20 + index).padStart(2, '0')}T19:20`),
    uv_index_max: Array(10).fill(7),
  },
};

const airObservation = {
  generated: '2026-08-20T06:21:00Z',
  observedKst: '2026-08-20 15:00',
  sources: [{
    id: 'AirKorea', ko: '한국환경공단 에어코리아',
    en: 'Korea Environment Corporation — AirKorea',
    license: '공공누리 제1유형 (출처표시)',
  }],
  stations: [{
    name: '중구', sido: '서울', at: '2026-08-20 15:00',
    pm10: 60, pm25: 49, khai: 87, gradeKo: '보통',
    lat: 37.564639, lon: 126.975961,
  }],
};

const uvIndex = {
  generated: '2026-08-20T03:50:00Z',
  source: '기상청 생활·보건기상지수 (API허브)',
  license: '공공누리 제1유형 (출처표시)',
  indices: { uv: { regions: { 서울: {
    value: 5, issuedKst: '2026082009', aheadHours: 3,
    levelKo: '보통', levelEn: 'Moderate',
  } } } },
};

const input = {
  now: NOW,
  location: { name: '서울특별시', lat: 37.5665, lon: 126.978, region: '서울' },
  openMeteo,
  kmaForecast,
  kmaObservation,
  airObservation,
  uvIndex,
  warningGate: {
    gate: 'OFFICIAL_WARNING_ACTIVE', status: 'DANGER',
    reason: 'OFFICIAL_WARNING_ACTIVE', warnings: [{ kind: '폭염', level: '경보' }],
  },
};

const query = buildWeatherQueryV7(37.5665, 126.978);
assert.equal(query.get('latitude'), '37.5665');
assert.equal(query.get('longitude'), '126.9780');
assert.equal(query.get('forecast_days'), '10');
assert.equal(query.get('forecast_hours'), '48');
for (const field of ['wind_gusts_10m', 'dew_point_2m', 'visibility', 'surface_pressure', 'uv_index']) {
  assert.match(`${query.get('current')},${query.get('hourly')},${query.get('daily')}`, new RegExp(field));
}

const model = buildWeatherCardModel(input);

assert.equal(model.schemaVersion, 'earthus.weather-card.v1');
assert.equal(model.location.timezone, 'Asia/Seoul');
assert.equal(model.current.temperature.value, 27);
assert.equal(model.current.temperature.sourceType, SOURCE_TYPE.OBSERVED);
assert.equal(model.current.temperature.sourceRef, 'kma-aws-108');
assert.equal(model.current.temperature.observedAt, '2026-08-20T06:29:00.000Z');
assert.equal(model.current.temperature.dataState, DATA_STATE.AVAILABLE);
assert.equal(model.current.condition.sourceType, SOURCE_TYPE.OFFICIAL_FORECAST);
assert.equal(model.current.condition.validAt, '2026-08-20T06:00:00.000Z');
assert.equal(model.current.feelsLike.value, null,
  '관측 기반 체감온도를 계산하지 않았으면 모델 값을 현재 관측처럼 섞지 않는다');

assert.equal(model.hourly.length, 24);
assert.ok(model.hourly.every(row => row.sourceType === SOURCE_TYPE.OFFICIAL_FORECAST));
assert.equal(model.hourly[0].validAt, '2026-08-20T06:00:00.000Z');

assert.equal(model.daily.length, 10);
assert.equal(model.daily[1].temperatureMax.value, 30);
assert.equal(model.daily[1].temperatureMax.sourceType, SOURCE_TYPE.OFFICIAL_FORECAST);
assert.equal(model.daily[4].temperatureMax.sourceType, SOURCE_TYPE.MODEL_FORECAST);
assert.equal(model.daily[4].temperatureMax.sourceRef, 'open-meteo');

assert.equal(model.details.airQuality.pm25.value, 49);
assert.equal(model.details.airQuality.pm25.sourceType, SOURCE_TYPE.OBSERVED);
assert.equal(model.details.airQuality.stationName, '중구');
assert.equal(model.details.uv.value.value, 5);
assert.equal(model.details.uv.value.sourceType, SOURCE_TYPE.OFFICIAL_FORECAST);
assert.equal(model.warningGate.gate, 'OFFICIAL_WARNING_ACTIVE');
assert.equal(model.displayPolicy.safetyFirst, true);
assert.equal(model.displayPolicy.positiveRecommendationAllowed, false);
assert.ok(model.sources.every(source => source.license && source.label));

const missing = buildWeatherCardModel({
  now: NOW,
  location: { name: '서울', lat: 37.5665, lon: 126.978, region: '서울' },
  openMeteo: {
    ...openMeteo,
    current: { ...openMeteo.current, temperature_2m: null },
  },
  warningGate: null,
});
assert.equal(missing.current.temperature.value, null);
assert.equal(missing.current.temperature.dataState, DATA_STATE.MISSING);
assert.equal(missing.current.temperature.sourceType, SOURCE_TYPE.MODEL_FORECAST);
assert.equal(missing.warningGate.status, 'UNKNOWN');
assert.equal(missing.displayPolicy.positiveRecommendationAllowed, false);
assert.equal(missing.hourly.length, 24);
assert.ok(missing.hourly.every(row => row.sourceType === SOURCE_TYPE.MODEL_FORECAST));
assert.equal(missing.hourly[0].temperature.sourceRef, 'open-meteo');

const staleObservation = structuredClone(kmaObservation);
staleObservation.observedKst = '202608201200';
const stale = buildWeatherCardModel({ ...input, kmaObservation: staleObservation });
assert.equal(stale.current.temperature.value, 27);
assert.equal(stale.current.temperature.dataState, DATA_STATE.STALE);
assert.notEqual(stale.current.temperature.value, 0);

console.log('weather contract v7: PASS');
