#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_WEATHER_V7_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const pad = value => String(value).padStart(2, '0');
const kst = new Date(Date.now() + 9 * 3600_000);
const compactKst = date => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
  + `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
const localKst = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  + `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
const dateKst = date => localKst(date).slice(0, 10);
const issued = compactKst(new Date(kst.getTime() - 60 * 60_000));
const observed = compactKst(new Date(kst.getTime() - 4 * 60_000));
const startHour = new Date(kst);
startHour.setUTCMinutes(0, 0, 0);

const kmaObservation = {
  generated: new Date().toISOString(), observedKst: observed,
  source: '기상청 방재기상관측 AWS 매분자료 (API허브)',
  sourceEn: 'KMA AWS 1-minute observations', license: '공공누리 제1유형 (출처표시)',
  stations: [{ id: '108', name: '서울', lat: 37.5714, lon: 126.9658,
    ta: 27, hm: 82, ws1: 1.2, wd1: 35, wss: 2.1, rn15: 0, rn60: 0.1,
    rnday: 1.8, ps: 1013.2, td: 23.7 }],
};
const kmaHours = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(startHour.getTime() + index * 3600_000);
  return { tm: compactKst(date), t: 30 - index * 0.1, wd: 270, ws: 1.5,
    sky: index % 5 ? 3 : 4, pty: index === 2 ? 1 : 0,
    pop: index === 2 ? 70 : 20, pcp: index === 2 ? 2 : 0, rh: 70 };
});
const dailyOfficial = {};
for (let index = 1; index <= 3; index += 1) {
  const date = new Date(startHour.getTime() + index * 86400_000);
  dailyOfficial[dateKst(date).replaceAll('-', '')] = { tmin: 23 + index, tmax: 29 + index };
}
const kmaForecast = {
  generated: new Date().toISOString(), source: '기상청 동네예보',
  sourceEn: 'KMA Village Forecast', license: '공공누리 제1유형',
  points: [{ name: '서울', lat: 37.5665, lon: 126.978, baseKst: issued,
    hourly: kmaHours, daily: dailyOfficial }],
};
const meteoHours = Array.from({ length: 48 }, (_, index) => localKst(
  new Date(startHour.getTime() + index * 3600_000)));
const meteoDays = Array.from({ length: 10 }, (_, index) => dateKst(
  new Date(startHour.getTime() + index * 86400_000)));
const weather = {
  timezone: 'Asia/Seoul', timezone_abbreviation: 'KST', utc_offset_seconds: 32400,
  current: { time: localKst(kst), temperature_2m: 29.4, relative_humidity_2m: 68,
    dew_point_2m: 23, apparent_temperature: 33.1, precipitation: 0,
    weather_code: 2, surface_pressure: 1006.2, wind_speed_10m: 5.4,
    wind_direction_10m: 280, wind_gusts_10m: 10.2, visibility: 18000, is_day: 1 },
  hourly: { time: meteoHours, temperature_2m: Array(48).fill(29),
    relative_humidity_2m: Array(48).fill(70), dew_point_2m: Array(48).fill(23),
    apparent_temperature: Array(48).fill(32), precipitation_probability: Array(48).fill(20),
    precipitation: Array(48).fill(0), weather_code: Array(48).fill(2),
    surface_pressure: Array(48).fill(1007), visibility: Array(48).fill(18000),
    wind_speed_10m: Array(48).fill(4), wind_direction_10m: Array(48).fill(270),
    wind_gusts_10m: Array(48).fill(8), uv_index: Array(48).fill(5), is_day: Array(48).fill(1) },
  daily: { time: meteoDays, weather_code: Array(10).fill(2),
    temperature_2m_max: Array.from({ length: 10 }, (_, index) => 31 + index % 2),
    temperature_2m_min: Array(10).fill(24), precipitation_sum: Array(10).fill(0),
    precipitation_probability_max: Array(10).fill(20),
    sunrise: meteoDays.map(day => `${day}T05:55`), sunset: meteoDays.map(day => `${day}T19:20`),
    uv_index_max: Array(10).fill(7), wind_speed_10m_max: Array(10).fill(8),
    wind_gusts_10m_max: Array(10).fill(14), wind_direction_10m_dominant: Array(10).fill(270) },
};
const air = {
  generated: new Date().toISOString(), observedKst: localKst(kst).replace('T', ' '),
  sources: [{ id: 'AirKorea', ko: '한국환경공단 에어코리아', en: 'AirKorea',
    license: '공공누리 제1유형 (출처표시)' }],
  stations: [{ name: '중구', sido: '서울', at: localKst(kst).replace('T', ' '),
    pm10: 60, pm25: 49, khai: 87, gradeKo: '보통', lat: 37.564639, lon: 126.975961 }],
};
const life = {
  generated: new Date().toISOString(), source: '기상청 생활·보건기상지수',
  sourceEn: 'KMA life weather index', license: '공공누리 제1유형',
  indices: { uv: { regions: { 서울: { value: 5, issuedKst: issued.slice(0, 10), aheadHours: 3,
    levelKo: '보통', levelEn: 'Moderate' } } } },
};
const warning = {
  generated: new Date().toISOString(), observedKst: observed,
  source: '기상청 기상특보', sourceEn: 'KMA weather warnings', license: '공공누리 제1유형',
  activeCount: 1, active: [{ regionId: 'L1100000', region: '서울특별시', kind: '폭염',
    kindEn: 'Heat', level: '경보', levelRank: 2, icon: '🔥', color: '#e8590c',
    issuedKst: issued, effectiveKst: issued }],
};
const zones = { generated: new Date().toISOString(), stations: [
  { name: '서울', lat: 37.5665, lon: 126.978, zone: 'L1100000', zoneName: '서울특별시' },
] };

async function routeFixtures(page) {
  const json = body => ({ status: 200, contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body) });
  await page.route('**/wind/kma-aws-min.json*', route => route.fulfill(json(kmaObservation)));
  await page.route('**/wind/kma-fcst.json*', route => route.fulfill(json(kmaForecast)));
  await page.route('**/wind/korea-air-obs.json*', route => route.fulfill(json(air)));
  await page.route('**/wind/kma-life.json*', route => route.fulfill(json(life)));
  await page.route('**/events/kma-warn-stations.json*', route => route.fulfill(json(zones)));
  await page.route('**/events/kma-warn.json*', route => route.fulfill(json(warning)));
  await page.route('**/api.open-meteo.com/v1/forecast*', route => route.fulfill(json(weather)));
  await page.route('**/marine-api.open-meteo.com/v1/marine*', route => route.fulfill(json({
    current: { time: localKst(kst), wave_height: 0.4, wave_direction: 20,
      wave_period: 5.2, swell_wave_height: 0.3, swell_wave_direction: 340,
      swell_wave_period: 7.2, wind_wave_height: 0.2 },
  })));
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    await routeFixtures(page);
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.evaluate(async () => {
      document.getElementById('loading')?.classList.add('gone');
      const [{ chrome }, { weatherPanel }] = await Promise.all([
        import(new URL('js/ui.js', location.href).href),
        import(new URL('js/ui-weather.js', location.href).href),
      ]);
      chrome.place = { name: '서울특별시', lat: 37.5665, lon: 126.978, region: '서울' };
      chrome.isDefault = false;
      chrome.wx = null;
      window.__weatherTimeEvents = [];
      window.__weatherLayerEvents = [];
      document.addEventListener('earthus:weather-time', event => window.__weatherTimeEvents.push(event.detail));
      document.addEventListener('earthus:weather-layer-request', event => window.__weatherLayerEvents.push(event.detail));
      weatherPanel.open();
    });
    await page.waitForSelector('#wxSheet.up [data-weather-card-v7]', { timeout: 15_000 });
    await page.waitForFunction(() => document.querySelectorAll('#wxSheet .wcv7-hour').length === 24);

    const state = await page.evaluate(() => {
      const body = document.getElementById('wxBody');
      const sections = [...body.querySelectorAll(':scope > [data-weather-section]')]
        .map(node => node.getAttribute('data-weather-section'));
      const targets = [...body.querySelectorAll('button,a')].map(node => {
        const rect = node.getBoundingClientRect();
        return { text: node.textContent.trim().slice(0, 30), width: rect.width, height: rect.height };
      });
      return {
        sections,
        allText: body.innerText,
        tabCount: body.querySelectorAll('.comm-tabs').length,
        hours: body.querySelectorAll('.wcv7-hour').length,
        days: body.querySelectorAll('.wcv7-day').length,
        details: body.querySelectorAll('.wcv7-detail').length,
        targets,
        overflow: document.documentElement.scrollWidth - innerWidth,
        runtimeWidth: body.getBoundingClientRect().width,
      };
    });
    assert.deepEqual(state.sections.slice(0, 8), [
      'hero', 'official-warning', 'hourly', '10-day', 'intelligence', 'details', 'sources', 'earth',
    ]);
    assert.equal(state.tabCount, 0);
    assert.equal(state.hours, 24);
    assert.equal(state.days, 10);
    assert.equal(state.details, 8);
    assert.match(state.allText, /27°C/);
    assert.match(state.allText, /관측/);
    assert.match(state.allText, /공식 예보/);
    assert.match(state.allText, /폭염 경보/);
    assert.match(state.allText, /한국환경공단 에어코리아/);
    assert.match(state.allText, /Open-Meteo/);
    assert.doesNotMatch(state.allText, /14일/);
    assert.ok(state.targets.every(target => target.width >= 43.9 && target.height >= 43.9),
      `${viewport.name} 44px violation: ${JSON.stringify(state.targets.filter(target => target.width < 43.9 || target.height < 43.9))}`);
    assert.ok(state.overflow <= 0, `${viewport.name} horizontal overflow: ${state.overflow}`);

    const firstDetail = page.locator('#wxSheet .wcv7-detail').first();
    await firstDetail.locator('button').click();
    assert.equal(await firstDetail.evaluate(node => node.classList.contains('is-expanded')), true);
    assert.equal(await page.locator('#wxSheet.up').count(), 1);

    await page.locator('#wxSheet .wcv7-hour').nth(9).click();
    const timeState = await page.evaluate(() => ({
      events: window.__weatherTimeEvents,
      selected: document.querySelectorAll('#wxSheet .wcv7-hour[aria-pressed="true"]').length,
      hero: document.querySelector('#wxSheet [data-weather-section="hero"]')?.innerText || '',
      intelligence: document.querySelector('#wxSheet [data-weather-section="intelligence"]')?.innerText || '',
    }));
    assert.equal(timeState.events.length, 1);
    assert.ok(timeState.events[0].validAt);
    assert.equal(timeState.events[0].hour.temperature.value, kmaHours[9].t);
    assert.equal(timeState.selected, 1);
    assert.match(timeState.hero, /29°C/);
    assert.match(timeState.hero, /선택 시각/);
    assert.match(timeState.intelligence, /선택한 시각/);
    assert.match(timeState.intelligence, /공식 예보/);
    await page.locator('#wxSheet [data-weather-layer="rain"]').click();
    assert.deepEqual(await page.evaluate(() => window.__weatherLayerEvents), [{ id: 'rain' }]);
    assert.deepEqual(runtimeErrors, []);
    await page.screenshot({ path: `/private/tmp/earthus-weather-card-v7-${viewport.name}.png`, fullPage: true });
    await context.close();
    console.log(`${viewport.name}: Weather Card v7 PASS`);
  }
} finally {
  await browser.close();
}
