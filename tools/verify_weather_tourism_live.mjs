#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const release = '20260820-weather-tourism1';
const target = process.env.EARTHUS_LIVE_URL || `https://earthus.net/?release=${release}`;
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'allow' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });

    const releaseAssets = await page.evaluate(() => ({
      main: document.querySelector('script[src*="js/main.js"]')?.getAttribute('src'),
      weatherCss: document.querySelector('link[href*="weather-card-v7.css"]')?.getAttribute('href'),
      tourismCss: document.querySelector('link[href*="tourism-flow.css"]')?.getAttribute('href'),
    }));
    assert.match(releaseAssets.main || '', /20260820-weather-tourism1/);
    assert.match(releaseAssets.weatherCss || '', /20260820-wcv7-1/);
    assert.match(releaseAssets.tourismCss || '', /20260820-tourism1/);

    // 공개 메뉴를 통해 실제 운영 관광 스냅샷을 받는다. 네트워크 fixture를 쓰지 않는다.
    await page.locator('#menuTab').click();
    await page.locator('#menuMain [data-open="earth"]').click();
    const tourismButton = page.locator('#layerStrip [data-id="tourism"]').first();
    await tourismButton.waitFor({ state: 'visible', timeout: 10_000 });
    await page.evaluate(() => {
      window.__tourismLiveSnapshot = null;
      document.addEventListener('earthus:tourism-snapshot', event => {
        window.__tourismLiveSnapshot = event.detail;
      }, { once: true });
    });
    await tourismButton.click();
    await page.waitForFunction(() => window.__tourismLiveSnapshot?.places?.length === 1,
      null, { timeout: 20_000 });
    await page.waitForTimeout(1_600);

    const tourism = await page.evaluate(async () => {
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js', location.href).href);
      const snapshot = window.__tourismLiveSnapshot;
      const place = snapshot.places[0];
      const entity = tourismFlow.ds.entities.values[0];
      return {
        state: snapshot.state,
        mode: snapshot.provider?.mode,
        coverage: snapshot.coverage,
        healthMode: snapshot.health?.mode,
        healthAccessibility: snapshot.health?.providers?.tourismAccessibility?.state,
        code: place.code,
        observedAt: place.provenance?.observedAt,
        sourceName: place.provenance?.sourceName,
        forecastCount: place.forecast?.length || 0,
        entityCount: tourismFlow.ds.entities.values.length,
        height: entity.cylinder.length.getValue(),
        label: entity.label.text.getValue(),
      };
    });
    assert.ok(['LIVE', 'DEGRADED', 'STALE'].includes(tourism.state), JSON.stringify(tourism));
    assert.equal(tourism.mode, 'SAMPLE');
    assert.equal(tourism.coverage.available, 1);
    assert.equal(tourism.coverage.total, 121);
    assert.equal(tourism.coverage.fullCoverage, false);
    assert.equal(tourism.healthMode, 'SAMPLE');
    assert.equal(tourism.healthAccessibility, 'UNAVAILABLE');
    assert.equal(tourism.code, 'POI009');
    assert.ok(Date.parse(tourism.observedAt) > 0);
    assert.equal(tourism.sourceName, '서울특별시 실시간 인구데이터');
    assert.ok(tourism.forecastCount > 0);
    assert.equal(tourism.entityCount, 1);
    assert.ok(tourism.height > 0);
    assert.match(tourism.label, /광화문·덕수궁/);

    await page.evaluate(async () => {
      const [{ tourismFlow }, { tourismSheet }] = await Promise.all([
        import(new URL('js/layers/tourism-flow.js', location.href).href),
        import(new URL('js/ui-tourism.js', location.href).href),
      ]);
      await tourismSheet.open(tourismFlow.snapshot.places[0]);
    });
    await page.locator('#tourismSheet.up').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1_000);
    const tourismPanel = await page.evaluate(() => {
      const body = document.getElementById('tourismBody');
      return {
        text: body.innerText,
        overflow: document.documentElement.scrollWidth - innerWidth,
        targets: [...body.querySelectorAll('button,a')].map(node => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      };
    });
    assert.match(tourismPanel.text, /광화문·덕수궁/);
    assert.match(tourismPanel.text, /1\/121|광화문·덕수궁 1곳만 공식 조회/);
    assert.match(tourismPanel.text, /수집기 SUCCEEDED · SAMPLE/);
    assert.match(tourismPanel.text, /서울특별시 실시간 인구데이터/);
    assert.match(tourismPanel.text, /운영시간[\s\S]{0,50}(확인되지 않|없습니다)/);
    assert.doesNotMatch(tourismPanel.text, /안전합니다|가도 됩니다|수용 가능/);
    assert.ok(tourismPanel.overflow <= 0, `${viewport.name} tourism overflow`);
    assert.ok(tourismPanel.targets.every(target => target.width >= 43.9 && target.height >= 43.9),
      `${viewport.name} tourism target below 44px`);

    // 실제 운영 기상 입력으로 Weather Card v7이 완성되는지 확인한다.
    await page.evaluate(async () => {
      document.getElementById('tourismSheet')?.classList.remove('up');
      const [{ chrome }, { weatherPanel }] = await Promise.all([
        import(new URL('js/ui.js', location.href).href),
        import(new URL('js/ui-weather.js', location.href).href),
      ]);
      chrome.place = { name: '서울특별시', lat: 37.5665, lon: 126.978, region: '서울' };
      chrome.isDefault = false;
      chrome.wx = null;
      weatherPanel.open();
    });
    await page.waitForSelector('#wxSheet.up [data-weather-card-v7]', { timeout: 25_000 });
    await page.waitForFunction(() => document.querySelectorAll('#wxSheet .wcv7-hour').length === 24,
      null, { timeout: 25_000 });
    const weather = await page.evaluate(() => {
      const body = document.getElementById('wxBody');
      return {
        sections: [...body.querySelectorAll(':scope > [data-weather-section]')]
          .map(node => node.dataset.weatherSection),
        text: body.innerText,
        hours: body.querySelectorAll('.wcv7-hour').length,
        days: body.querySelectorAll('.wcv7-day').length,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.deepEqual(weather.sections.slice(0, 8), [
      'hero', 'official-warning', 'hourly', '10-day', 'intelligence', 'details', 'sources', 'earth',
    ]);
    assert.equal(weather.hours, 24);
    assert.equal(weather.days, 10);
    assert.match(weather.text, /관측/);
    assert.match(weather.text, /기상청|Open-Meteo/);
    assert.ok(weather.overflow <= 0, `${viewport.name} weather overflow`);

    // 첫 설치 뒤 한 번 재로드해 서비스워커가 실제 캐시 경로를 제어하는지 확인한다.
    await page.evaluate(() => navigator.serviceWorker?.ready);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15_000 });
    const cacheState = await page.evaluate(async () => ({
      controller: navigator.serviceWorker.controller?.scriptURL || '',
      keys: await caches.keys(),
    }));
    assert.match(cacheState.controller, /\/sw\.js$/);
    assert.ok(cacheState.keys.includes('earthus-shell-2026-08-20-weather-tourism1'),
      JSON.stringify(cacheState));
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `/private/tmp/earthus-weather-tourism-live-${viewport.name}.png` });
    await context.close();
    console.log(`${viewport.name}: LIVE Weather Card + tourism + service worker PASS`);
  }
} finally {
  await browser.close();
}
