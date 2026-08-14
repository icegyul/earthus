#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.AETHERUS_MISSION_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'iphone-portrait', width: 390, height: 844, leftVisible: false, columns: 1 },
  { name: 'iphone-landscape', width: 754, height: 402, leftVisible: false, columns: 2 },
  { name: 'desktop', width: 1440, height: 900, leftVisible: true, columns: 3 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.name.startsWith('iphone') ? 3 : 1,
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 25 } });
        },
      } });
    });
    await page.route('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { time_tag: '2026-08-15T00:14:00Z', kp_index: 4.25 },
      ]),
    }));
    await page.route('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        'Observation Time': '2026-08-15T00:00:00Z', 'Forecast Time': '2026-08-15T00:30:00Z',
        coordinates: [[126, 67, 8], [127, 68, 15], [128, 69, 4]],
      }),
    }));
    await page.route('**/celestrak/catalog.json.gz', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ generated: '2026-08-15T00:00:00Z', groups: { stations: [{
        n: 'ISS (ZARYA)', id: '25544',
        l1: '1 25544U 98067A   26226.50000000  .00010000  00000-0  18000-3 0  9999',
        l2: '2 25544  51.6400 120.0000 0005000  80.0000 280.0000 15.50000000450000',
      }] } }),
    }));
    await page.route('https://ll.thespacedevs.com/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [
        {
          id: 'launch-a', name: 'Falcon 9 Block 5 | Verified Test Mission',
          window_start: '2026-08-16T01:12:00Z', window_end: '2026-08-16T01:27:00Z',
          status: { name: 'Go for Launch', description: 'Current T-0 confirmed by reliable sources.' },
          webcast_live: true,
          launch_service_provider: { name: 'SpaceX' },
          pad: { name: 'SLC-40', latitude: 28.56, longitude: -80.57,
            location: { name: 'Cape Canaveral SFS, FL, USA' } },
          mission: { name: 'Verified Test Mission', type: 'Communications', vid_urls: [{
            url: 'https://www.youtube.com/watch?v=earthus-mission-control-fixture',
            title: 'Verified provider stream',
          }] },
        },
        {
          id: 'launch-b', name: 'Ariane 6 | Test Payload',
          window_start: '2026-08-18T12:00:00Z', window_end: '2026-08-18T13:00:00Z',
          status: { name: 'To Be Confirmed' }, webcast_live: false,
          launch_service_provider: { name: 'Arianespace' },
          pad: { name: 'ELA-4', location: { name: 'Kourou, French Guiana' } },
          mission: { name: 'Test Payload', type: 'Technology' },
        },
        {
          id: 'launch-c', name: 'Nuri | Korea Verified Mission',
          window_start: '2026-08-20T02:00:00Z', status: { name: 'To Be Confirmed' },
          webcast_live: false, launch_service_provider: { name: 'KARI' },
          pad: { name: 'LC-2', location: { name: 'Naro Space Center, Korea' } },
          mission: { name: 'Korea Verified Mission', type: 'Technology' },
        },
        {
          id: 'launch-d', name: 'Starship | Integrated Flight Test',
          window_start: '2026-08-21T03:00:00Z', status: { name: 'To Be Confirmed' },
          webcast_live: false, launch_service_provider: { name: 'SpaceX' },
          pad: { name: 'OLP-A', location: { name: 'Starbase, Texas' } },
          mission: { name: 'Integrated Flight Test', type: 'Test Flight' },
        },
      ] }),
    }));
    const url = new URL(base);
    url.search = 'aetherus=3&solar=1';
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#aetherusMissionControl').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-mission-kp-value]')?.textContent === 'Kp 4.25');
    await page.waitForFunction(() => document.querySelector('[data-launch-name]')?.textContent?.includes('Verified Test Mission'));

    const evidence = await page.evaluate(() => {
      const mission = document.querySelector('#aetherusMissionControl');
      const center = mission.querySelector('.mission-center').getBoundingClientRect();
      const left = mission.querySelector('.mission-left');
      const right = mission.querySelector('.mission-right').getBoundingClientRect();
      const controls = [...mission.querySelectorAll('button,a'), ...document.querySelectorAll('.cosmic-experience-nav button')]
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        .map(node => node.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        columns: getComputedStyle(mission).gridTemplateColumns.split(' ').length,
        leftVisible: getComputedStyle(left).display !== 'none',
        centerOutside: center.left < -0.5 || center.right > innerWidth + 0.5 || center.height < 150,
        rightOutside: right.left < -0.5 || right.right > innerWidth + 0.5 || right.height < 150,
        minimumControlHeight: Math.min(...controls.map(rect => rect.height)),
        activeRoute: document.querySelector('[data-aetherus-nav].current')?.dataset.aetherusNav,
        kp: mission.querySelector('[data-mission-kp-value]').textContent,
        kpTime: mission.querySelector('[data-mission-kp-time]').textContent,
        aurora: mission.querySelector('[data-mission-aurora-value]').textContent,
        auroraTime: mission.querySelector('[data-mission-aurora-time]').textContent,
        photo: mission.querySelector('[data-mission-photo-count]').textContent,
        launch: mission.querySelector('[data-launch-name]').textContent,
        countdown: mission.querySelector('[data-widget-body="COUNTDOWN"] .mission-countdown').textContent,
        stage: document.querySelector('#cosmicExperience').dataset.stage,
        forbidden: /\bPRO\b|결제|구독|누리호 5차/.test(mission.textContent),
        canvasWidth: document.querySelector('#cosmicCanvas').width,
      };
    });
    assert.ok(evidence.overflow <= 0, `${item.name} horizontal overflow ${evidence.overflow}`);
    assert.equal(evidence.columns, item.columns, `${item.name} wrong mission grid`);
    assert.equal(evidence.leftVisible, item.leftVisible, `${item.name} left panel visibility`);
    assert.equal(evidence.centerOutside, false, `${item.name} Earth stage outside viewport`);
    assert.equal(evidence.rightOutside, false, `${item.name} official panel outside viewport`);
    assert.ok(evidence.minimumControlHeight >= 44,
      `${item.name} control below 44px: ${evidence.minimumControlHeight}`);
    assert.equal(evidence.activeRoute, 'mission', `${item.name} mission route inactive`);
    assert.equal(evidence.stage, 'mission', `${item.name} mission stage missing`);
    assert.equal(evidence.kp, 'Kp 4.25', `${item.name} NOAA observation missing`);
    assert.match(evidence.kpTime, /2026-08-15/);
    assert.equal(evidence.aurora, '최대 15');
    assert.match(evidence.auroraTime, /NOAA SWPC OVATION 모델/);
    assert.match(evidence.photo, /^59장/);
    assert.match(evidence.launch, /Verified Test Mission/);
    assert.match(evidence.countdown, /^(T-|예정 시각 경과)/);
    assert.equal(evidence.forbidden, false, `${item.name} paywall or invented mission copy present`);
    assert.ok(evidence.canvasWidth > 0, `${item.name} 3D canvas did not initialize`);
    assert.equal(await page.locator('[data-launch-marker]').getAttribute('data-widget'), 'NEXT_LAUNCH');
    assert.equal(await page.locator('[data-launch-marker]').evaluate(node => !node.hidden), true);
    for (const widget of ['LIVE', 'COUNTDOWN', 'MISSION_TIMELINE', 'PAYLOAD_STATUS', 'SATELLITE_PASS',
      'SPACE_WEATHER', 'EARTH_WEATHER', 'AURORA', 'KOREA_SPACE', 'SPACEX', 'STARSHIP', 'JWST']) {
      assert.equal(await page.locator(`[data-widget="${widget}"]`).count(), 1,
        `${item.name} ${widget} widget shell missing`);
    }
    assert.match(await page.locator('[data-widget="MISSION_TIMELINE"]').textContent(), /일정 등록/);
    assert.match(await page.locator('[data-widget="PAYLOAD_STATUS"]').textContent(), /Verified Test Mission/);
    assert.match(await page.locator('[data-widget="EARTH_WEATHER"]').textContent(), /지구에서 위치 선택/);
    assert.match(await page.locator('[data-widget="LIVE"]').textContent(), /LL2에서 LIVE 상태 수신/);
    assert.equal(await page.locator('[data-widget="LIVE"] a').getAttribute('href'),
      'https://www.youtube.com/watch?v=earthus-mission-control-fixture');

    const statusButton = page.locator('[data-mission-status-open]');
    assert.match(await statusButton.getAttribute('aria-label'), /관제 알림센터/);
    await statusButton.click();
    await page.locator('[data-mission-status]').waitFor({ state: 'visible' });
    const statusEvidence = await page.locator('[data-mission-status]').evaluate(panel => ({
      text: panel.textContent,
      rows: panel.querySelectorAll('.mission-status-row').length,
      outside: (() => {
        const rect = panel.getBoundingClientRect();
        return rect.left < -0.5 || rect.right > innerWidth + 0.5 || rect.top < -0.5 || rect.bottom > innerHeight + 0.5;
      })(),
      forbidden: /예보|안전 판정|결제|구독|\bPRO\b/.test(panel.textContent),
    }));
    assert.equal(statusEvidence.rows, 6, `${item.name} status center evidence rows`);
    assert.match(statusEvidence.text, /Verified Test Mission/);
    assert.match(statusEvidence.text, /Launch Library 2/);
    assert.match(statusEvidence.text, /NOAA SWPC/);
    assert.match(statusEvidence.text, /Earthus provenance catalogue/);
    assert.equal(statusEvidence.outside, false, `${item.name} status center outside viewport`);
    assert.equal(statusEvidence.forbidden, false, `${item.name} invented or paid status copy`);
    await page.screenshot({ path: `/tmp/aetherus-mission-status-${item.name}.png`, fullPage: true });
    await page.locator('[data-mission-status-close]').click();
    await page.locator('[data-mission-status]').waitFor({ state: 'hidden' });
    if (item.name === 'desktop') {
      await page.keyboard.press('KeyN');
      await page.locator('[data-mission-status]').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('[data-mission-status]').waitFor({ state: 'hidden' });
    }

    if (item.name === 'desktop') {
      await page.locator('[data-follow-launch]').click();
      assert.equal(await page.locator('[data-following-count]').textContent(), '1');
      assert.match(await page.locator('[data-following-list]').textContent(), /Verified Test Mission/);
      await page.locator('[data-unfollow-launch]').click();
      assert.equal(await page.locator('[data-following-count]').textContent(), '0');
      await page.locator('.mission-add-widget').click();
    } else {
      await page.locator('[data-mission-edit]:visible').first().click();
    }

    await page.locator('[data-mission-editor]').waitFor({ state: 'visible' });
    await page.locator('[data-layout-toggle="EARTH_WEATHER"]').click();
    assert.equal(await page.locator('[data-widget="EARTH_WEATHER"]').evaluate(node => node.hidden), true);
    await page.locator('[data-layout-toggle="EARTH_WEATHER"]').click();
    assert.equal(await page.locator('[data-widget="EARTH_WEATHER"]').evaluate(node => node.hidden), false);
    await page.locator('[data-layout-size="SPACE_WEATHER"]').click();
    assert.equal(await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.classList.contains('is-wide')), true);
    await page.locator('[data-layout-move="SPACE_WEATHER"][data-direction="down"]').click();
    const movedOrder = await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.style.order);
    await page.locator('.mission-room-picker [data-room="WEATHER_CENTER"]').click();
    await page.locator('[data-mission-editor-close]').first().click();

    assert.equal(await page.locator('[data-widget="AURORA"]').evaluate(node => !node.hidden), true);
    assert.equal(await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.classList.contains('is-wide')), false,
      `${item.name} room-specific layout leaked from SPACE_CONTROL`);
    await page.locator('[data-mission-edit]:visible').first().click();
    await page.locator('.mission-room-picker [data-room="ASTRONOMY_LAB"]').click();
    await page.locator('[data-mission-editor-close]').first().click();
    assert.equal(await page.locator('[data-widget="JWST"]').evaluate(node => !node.hidden), true);
    assert.match(await page.locator('[data-widget="JWST"]').textContent(), /PROVENANCE/);
    await page.locator('[data-mission-edit]:visible').first().click();
    await page.locator('.mission-room-picker [data-room="SATELLITE_TRACKING"]').click();
    await page.locator('[data-mission-editor-close]').first().click();
    for (const widget of ['SATELLITE_PASS', 'KOREA_SPACE', 'SPACEX', 'STARSHIP']) {
      assert.equal(await page.locator(`[data-widget="${widget}"]`).evaluate(node => !node.hidden), true,
        `${item.name} ${widget} missing from satellite room`);
    }
    assert.match(await page.locator('[data-widget="KOREA_SPACE"]').textContent(), /Korea Verified Mission/);
    assert.match(await page.locator('[data-widget="SPACEX"]').textContent(), /Verified Test Mission/);
    assert.match(await page.locator('[data-widget="STARSHIP"]').textContent(), /Integrated Flight Test/);
    if (item.name !== 'iphone-landscape') {
      await page.locator('[data-mission-satellite-pass]').click();
      await page.waitForFunction(() => document.querySelector('[data-widget-state="SATELLITE_PASS"]')?.textContent === 'ISS · CALCULATED');
    }
    await page.locator('[data-mission-edit]:visible').first().click();
    await page.locator('.mission-room-picker [data-room="SPACE_CONTROL"]').click();
    await page.locator('[data-mission-editor-close]').first().click();
    assert.equal(await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.classList.contains('is-wide')), true,
      `${item.name} SPACE_CONTROL layout did not persist independently`);
    assert.equal(await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.style.order), movedOrder,
      `${item.name} SPACE_CONTROL reorder did not persist independently`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#aetherusMissionControl').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-mission-kp-value]')?.textContent === 'Kp 4.25');
    assert.equal(await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.classList.contains('is-wide')), true,
      `${item.name} resized layout did not survive reconnect`);
    assert.equal(await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.style.order), movedOrder,
      `${item.name} reordered layout did not survive reconnect`);
    await page.locator('[data-mission-edit]:visible').first().click();
    await page.locator('[data-layout-reset]').click();
    await page.locator('[data-mission-editor-close]').first().click();

    await page.locator('[data-mission-fullscreen]').click();
    await page.waitForFunction(() => document.fullscreenElement?.id === 'cosmicExperience');
    const fullscreenEvidence = await page.evaluate(() => {
      const mission = document.querySelector('#aetherusMissionControl').getBoundingClientRect();
      const center = document.querySelector('.mission-center').getBoundingClientRect();
      const canvas = document.querySelector('#cosmicCanvas').getBoundingClientRect();
      return {
        missionTop: mission.top, missionRight: mission.right,
        centerWidth: center.width, centerHeight: center.height,
        canvasVisible: canvas.width > 0 && canvas.height > 0,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.ok(fullscreenEvidence.missionTop >= 61 && fullscreenEvidence.missionTop <= 63,
      `${item.name} fullscreen navigation overlap`);
    assert.ok(fullscreenEvidence.missionRight <= item.width + 0.5,
      `${item.name} fullscreen outside viewport`);
    assert.ok(fullscreenEvidence.centerWidth > 200 && fullscreenEvidence.centerHeight > 150,
      `${item.name} fullscreen Earth stage collapsed`);
    assert.equal(fullscreenEvidence.canvasVisible, true, `${item.name} fullscreen 3D canvas missing`);
    assert.ok(fullscreenEvidence.overflow <= 0, `${item.name} fullscreen overflow ${fullscreenEvidence.overflow}`);
    await page.keyboard.press('KeyF');
    await page.waitForFunction(() => !document.fullscreenElement);

    await page.locator('[data-aetherus-nav="solar"]').click();
    await page.locator('#aetherusMissionControl').waitFor({ state: 'hidden' });
    await page.locator('[data-aetherus-nav="solar"].current').waitFor({ timeout: 5_000 });
    assert.equal(await page.locator('[data-aetherus-nav="solar"]').getAttribute('aria-current'), 'page');
    await page.locator('[data-aetherus-nav="mission"]').click();
    await page.locator('#aetherusMissionControl').waitFor({ state: 'visible' });
    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/aetherus-mission-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · ${evidence.columns} columns · overflow ${evidence.overflow} · ${evidence.kp}`);
  }
} finally {
  await browser.close();
}
