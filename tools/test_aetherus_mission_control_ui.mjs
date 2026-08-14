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
    await page.route('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { time_tag: '2026-08-15T00:14:00Z', kp_index: 4.25 },
      ]),
    }));
    const url = new URL(base);
    url.search = 'aetherus=3&solar=1';
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#aetherusMissionControl').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('[data-mission-kp-value]')?.textContent === 'Kp 4.25');

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
        photo: mission.querySelector('[data-mission-photo-count]').textContent,
        stage: document.querySelector('#cosmicExperience').dataset.stage,
        forbidden: /\bPRO\b|T-\d|결제|구독/.test(mission.textContent),
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
    assert.match(evidence.photo, /^59장/);
    assert.equal(evidence.forbidden, false, `${item.name} paywall or invented countdown copy present`);
    assert.ok(evidence.canvasWidth > 0, `${item.name} 3D canvas did not initialize`);

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
