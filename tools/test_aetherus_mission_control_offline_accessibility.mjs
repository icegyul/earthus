#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.AETHERUS_MISSION_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const errors = [];
  let offline = false;
  page.on('pageerror', error => errors.push(error.message));

  await page.route('**/data/space-photos.json*', route => offline
    ? route.fulfill({ status: 503, body: 'offline fixture' }) : route.continue());
  await page.route('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', route => route.fulfill(offline
    ? { status: 503, body: 'offline fixture' }
    : { status: 200, contentType: 'application/json', body: JSON.stringify([
      { time_tag: '2026-08-15T00:14:00Z', kp_index: 4.25 },
    ]) }));
  await page.route('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', route => route.fulfill(offline
    ? { status: 503, body: 'offline fixture' }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({
      'Observation Time': '2026-08-15T00:00:00Z', 'Forecast Time': '2026-08-15T00:30:00Z',
      coordinates: [[126, 67, 8], [127, 68, 15], [128, 69, 4]],
    }) }));
  await page.route('https://ll.thespacedevs.com/**', route => route.fulfill(offline
    ? { status: 503, body: 'offline fixture' }
    : { status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{
      id: 'launch-accessibility', name: 'Falcon 9 | Accessibility Test Mission',
      window_start: '2026-08-16T01:12:00Z', status: { name: 'Go for Launch' },
      webcast_live: true, launch_service_provider: { name: 'SpaceX' },
      pad: { name: 'SLC-40', location: { name: 'Cape Canaveral SFS, FL, USA' } },
      mission: { name: 'Accessibility Test Mission', type: 'Technology', vid_urls: [{
        url: 'https://www.youtube.com/watch?v=earthus-offline-fixture', title: 'Fixture stream',
      }] },
    }] }) }));

  const url = new URL(base); url.search = 'aetherus=3&solar=1';
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#aetherusMissionControl').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('[data-mission-kp-value]')?.textContent === 'Kp 4.25');
  assert.equal(await page.locator('#aetherusMissionControl').getAttribute('data-source-mode'), 'live');
  assert.match(await page.locator('[data-mission-source-mode]').textContent(), /4개 연결/);

  const semantics = await page.evaluate(() => ({
    dialogRole: document.querySelector('[data-mission-editor]').getAttribute('role'),
    dialogModal: document.querySelector('[data-mission-editor]').getAttribute('aria-modal'),
    allPressed: document.querySelector('[data-mission-filter="all"]').getAttribute('aria-pressed'),
    widgetLabel: document.querySelector('[data-widget="SPACE_WEATHER"]').getAttribute('aria-label'),
    live: document.querySelector('[data-mission-announcement]').getAttribute('aria-live'),
    atomic: document.querySelector('[data-mission-announcement]').getAttribute('aria-atomic'),
    cache: JSON.parse(localStorage.getItem('earthus:aetherus-mission-control-public-data:v1')),
  }));
  assert.equal(semantics.dialogRole, 'dialog');
  assert.equal(semantics.dialogModal, 'true');
  assert.equal(semantics.allPressed, 'true');
  assert.equal(semantics.widgetLabel, 'SPACE WEATHER');
  assert.equal(semantics.live, 'polite');
  assert.equal(semantics.atomic, 'true');
  assert.deepEqual(Object.keys(semantics.cache.sources).sort(), ['aurora', 'kp', 'launches', 'photos']);
  assert.doesNotMatch(JSON.stringify(semantics.cache), /latitude|longitude|satellitePass|37\.5665|126\.978/);

  await page.keyboard.press('Digit2');
  assert.equal(await page.locator('#aetherusMissionControl').getAttribute('data-room'), 'WEATHER_CENTER');
  await page.locator('[data-mission-fullscreen]').focus();
  await page.keyboard.press('KeyE');
  await page.locator('[data-mission-editor]').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-mission-editor-close')), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '완료');
  await page.keyboard.press('Escape');
  await page.locator('[data-mission-editor]').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-mission-fullscreen')), true);

  await page.locator('[data-mission-filter="weather"]').click();
  assert.equal(await page.locator('[data-mission-filter="weather"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-widget="SPACE_WEATHER"]').evaluate(node => node.classList.contains('is-filtered-out')), false);
  assert.equal(await page.locator('[data-widget="COUNTDOWN"]').evaluate(node => node.classList.contains('is-filtered-out')), true);
  await page.locator('[data-mission-filter="all"]').click();

  await page.locator('[data-mission-fullscreen]').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => document.fullscreenElement?.id === 'cosmicExperience');
  assert.equal(await page.locator('[data-mission-fullscreen]').getAttribute('aria-pressed'), 'true');
  const fullscreenBox = await page.locator('#aetherusMissionControl').boundingBox();
  assert.ok(fullscreenBox.width >= 1439 && fullscreenBox.height >= 837);
  assert.ok(fullscreenBox.y >= 61 && fullscreenBox.y <= 63);
  const canvasInFullscreen = await page.locator('#cosmicCanvas').evaluate(canvas => ({
    visible: canvas.getClientRects().length > 0 && getComputedStyle(canvas).visibility !== 'hidden',
    width: canvas.getBoundingClientRect().width,
    height: canvas.getBoundingClientRect().height,
  }));
  assert.equal(canvasInFullscreen.visible, true);
  assert.ok(canvasInFullscreen.width > 500 && canvasInFullscreen.height > 300);
  await page.screenshot({ path: '/tmp/aetherus-mission-fullscreen.png', fullPage: true });
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !document.fullscreenElement);

  offline = true;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#aetherusMissionControl').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('#aetherusMissionControl')?.dataset.sourceMode === 'cached');
  assert.equal(await page.locator('[data-mission-kp-value]').textContent(), 'Kp 4.25');
  assert.match(await page.locator('[data-widget-state="SPACE_WEATHER"]').textContent(), /^CACHED · 2026-08-15/);
  assert.match(await page.locator('[data-widget-state="UPCOMING_LAUNCHES"]').textContent(), /^CACHED · 2026-08-15/);
  assert.match(await page.locator('[data-mission-source-mode]').textContent(), /오프라인 캐시 4/);
  await page.screenshot({ path: '/tmp/aetherus-mission-offline.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: fullscreen · keyboard 1-4/E/F · dialog focus · ARIA · filtered mouse UI · 4-source timestamped offline cache');
} finally {
  await browser.close();
}
