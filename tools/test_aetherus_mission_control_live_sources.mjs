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
  page.on('pageerror', error => errors.push(error.message));
  const url = new URL(base); url.search = 'aetherus=3&solar=1';
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#aetherusMissionControl').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const kp = document.querySelector('[data-widget-state="SPACE_WEATHER"]')?.textContent;
    const aurora = document.querySelector('[data-widget-state="AURORA"]')?.textContent;
    const launch = document.querySelector('[data-widget-state="UPCOMING_LAUNCHES"]')?.textContent;
    return kp === 'OBSERVED' && aurora === 'MODEL' && launch?.startsWith('LL2 ·');
  }, { timeout: 45_000 });

  const evidence = await page.evaluate(() => ({
    kpState: document.querySelector('[data-widget-state="SPACE_WEATHER"]')?.textContent,
    kpText: document.querySelector('[data-mission-kp-value]')?.textContent,
    kpTime: document.querySelector('[data-mission-kp-time]')?.textContent,
    auroraState: document.querySelector('[data-widget-state="AURORA"]')?.textContent,
    auroraText: document.querySelector('[data-mission-aurora-value]')?.textContent,
    auroraTime: document.querySelector('[data-mission-aurora-time]')?.textContent,
    launchState: document.querySelector('[data-widget-state="UPCOMING_LAUNCHES"]')?.textContent,
    launchText: document.querySelector('[data-widget="UPCOMING_LAUNCHES"]')?.textContent,
    photoText: document.querySelector('[data-mission-photo-count]')?.textContent,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }));
  assert.equal(evidence.kpState, 'OBSERVED');
  assert.match(evidence.kpText, /^Kp \d/);
  assert.match(evidence.kpTime, /NOAA SWPC/);
  assert.equal(evidence.auroraState, 'MODEL');
  assert.match(evidence.auroraText, /^최대 \d+/);
  assert.match(evidence.auroraTime, /NOAA SWPC OVATION 모델.*격자 n=\d+/);
  assert.match(evidence.launchState, /^LL2 ·/);
  assert.match(evidence.launchText, /Falcon|Ariane|Soyuz|Electron|Long March|Vulcan|Atlas|New Glenn|H-IIA|H3/i);
  assert.match(evidence.photoText, /^59장 · HST 9 \/ JWST 50$/);
  assert.ok(evidence.overflow <= 0, `horizontal overflow ${evidence.overflow}`);
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
  await page.screenshot({ path: '/tmp/aetherus-mission-live-sources.png', fullPage: true });
  console.log(`PASS: live sources · ${evidence.kpText} · ${evidence.auroraText} · ${evidence.launchState}`);
} finally {
  await browser.close();
}
