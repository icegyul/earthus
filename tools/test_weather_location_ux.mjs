#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const doc = JSON.parse(await readFile(process.env.EARTHUS_KMA_FIXTURE || '/tmp/earthus-kma-fcst.json', 'utf8'));
const point = doc.points.find(item => item.name === '서울');
assert.ok(point, '서울 기상청 지점이 운영 예보에 없다');

const parseKst = value => new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  + `T${value.slice(8, 10)}:${value.slice(10, 12)}:00+09:00`);
const futureHours = point.hourly.filter(hour => parseKst(hour.tm).getTime() >= Date.now() - 60 * 60_000);
const kma = {
  name: point.name,
  km: 1,
  baseKst: point.baseKst,
  now: futureHours[0] || point.hourly[0],
  hours: futureHours.length ? futureHours : point.hourly,
  days: point.daily,
  source: doc.source,
  sourceEn: doc.sourceEn,
  license: doc.license,
};
const wx = {
  current: {
    temperature_2m: kma.now.t,
    apparent_temperature: kma.now.t,
    relative_humidity_2m: kma.now.rh,
    wind_speed_10m: kma.now.ws,
    surface_pressure: 1008,
    weather_code: 3,
  },
  daily: {
    time: ['2026-08-15', '2026-08-16'],
    temperature_2m_max: [31, 29],
    temperature_2m_min: [24, 24],
    precipitation_probability_max: [60, 70],
    weather_code: [80, 61],
    sunrise: ['2026-08-15T05:45', '2026-08-16T05:46'],
    sunset: ['2026-08-15T19:24', '2026-08-16T19:23'],
  },
  hourly: { time: [], precipitation_probability: [] },
};
const cases = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of cases) {
    const context = await browser.newContext({
      viewport,
      geolocation: { latitude: 37.5665, longitude: 126.9780 },
      permissions: ['geolocation'],
    });
    const page = await context.newPage();
    await page.route('**/wind/kma-fcst.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(doc),
    }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#wxSheet', { state: 'attached' });
    await page.evaluate(async ({ wx }) => {
      document.getElementById('loading')?.classList.add('gone');
      const [{ chrome }, { weatherPanel }] = await Promise.all([
        import(new URL('js/ui.js', location.href).href),
        import(new URL('js/ui-weather.js', location.href).href),
      ]);
      chrome.place = { name: '서울특별시', lat: 37.5665, lon: 126.9780 };
      chrome.isDefault = false;
      chrome.wx = wx;
      weatherPanel.kma = null;
      weatherPanel.kmaKey = '';
      weatherPanel.kmaRequestKey = '';
      weatherPanel.open('today');
    }, { wx });
    await page.waitForFunction(() => document.querySelector('#wxSheet.up .wx-hero-title h3')
      ?.textContent.includes('오후 3시와 저녁 7시'));
    await page.waitForTimeout(800);

    const state = await page.evaluate(() => {
      const sheet = document.querySelector('#wxSheet');
      const body = document.querySelector('#wxBody');
      const children = [...body.children];
      const rect = sheet.getBoundingClientRect();
      const targets = [...body.querySelectorAll('button,a,summary')].map(target => {
        const box = target.getBoundingClientRect();
        return { tag: target.tagName, cls: target.className, text: target.textContent.trim().slice(0, 24),
          width: box.width, height: box.height };
      });
      return {
        title: document.querySelector('#wxTitle').textContent,
        hero: body.querySelector('.wx-hero')?.innerText || '',
        basis: body.querySelector('.wx-basis')?.innerText || '',
        tomorrow: body.querySelector('.wx-tomorrow')?.innerText || '',
        allText: body.innerText,
        hours: body.querySelectorAll('.wxh').length,
        icons: body.querySelectorAll('.wxh-icon').length,
        order: {
          hero: children.findIndex(node => node.classList.contains('wx-hero')),
          narrative: children.findIndex(node => node.classList.contains('wx-narr')),
          climate: children.findIndex(node => node.classList.contains('wx-climate')),
        },
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        overflow: document.documentElement.scrollWidth - innerWidth,
        targets,
      };
    });
    assert.equal(state.title, '서울특별시');
    assert.match(state.hero, /오늘은 오후 3시와 저녁 7시에 소나기 예보가 있습니다/);
    assert.match(state.hero, /\d{2}시 예보 · 흐림/);
    assert.match(state.hero, /강수확률 최고 60%/);
    assert.match(state.hero, /한 시간 강수량 최대 14\.0mm/);
    assert.match(state.basis, /기상청 서울 지점 · 현재 위치에서 약 1km/);
    assert.match(state.tomorrow, /내일은 오전 6시부터 오후 3시까지 비가 이어지고, 밤 10시에 다시 예보됩니다/);
    assert.equal(state.hours, 24);
    assert.equal(state.icons, 24);
    assert.ok(state.order.hero >= 0 && state.order.hero < state.order.narrative
      && state.order.narrative < state.order.climate,
    `${viewport.name} weather priority changed: ${JSON.stringify(state.order)}`);
    assert.doesNotMatch(state.allText, /특별한 것이 없는 날/);
    assert.doesNotMatch(state.allText, /인천 관측소 1년 기온/);
    assert.ok(state.rect.left >= 0 && state.rect.right <= viewport.width + 0.5,
      `${viewport.name} weather sheet outside viewport`);
    assert.ok(state.overflow <= 0, `${viewport.name} horizontal overflow ${state.overflow}`);
    assert.ok(state.targets.every(target => target.width >= 44 && target.height >= 44),
      `${viewport.name} weather target below 44px: ${JSON.stringify(state.targets.filter(
        target => target.width < 44 || target.height < 44))}`);
    await page.screenshot({ path: `/private/tmp/earthus-weather-seoul-${viewport.name}.png` });

    await page.locator('#wxSheet .wx-climate > summary').click();
    await page.waitForSelector('#wxSheet .wx-climate-unavailable');
    const climate = await page.locator('#wxSheet .wx-climate-unavailable').innerText();
    assert.match(climate, /서울 화면에 인천 장기 차트를 대신 표시하지 않습니다/);
    assert.match(climate, /서울 ASOS 평년 분포/);
    assert.equal(await page.locator('#wxSheet .wx-climate .ch-wrap').count(), 0);
    await page.screenshot({ path: `/private/tmp/earthus-weather-seoul-climate-${viewport.name}.png` });

    await context.close();
    console.log(`${viewport.name}: PASS · Seoul forecast first, rain timing and tomorrow visible, Incheon chart blocked`);
  }
} finally {
  await browser.close();
}
