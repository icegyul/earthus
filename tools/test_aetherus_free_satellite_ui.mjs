#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success) {
        success({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 25 } });
      },
    } });
  });
  const sat = {
    n: 'ISS (ZARYA)', id: '25544', own: 'US', ownKo: '미국', ld: '1998-11-20', ls: 'TYMSC',
    l1: '1 25544U 98067A   26226.50000000  .00010000  00000-0  18000-3 0  9999',
    l2: '2 25544  51.6400 120.0000 0005000  80.0000 280.0000 15.50000000450000',
  };
  await page.route('**/celestrak/catalog.json.gz*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ generated: '2026-08-15T00:00:00Z', groups: {
      stations: [sat], weather: [], science: [], starlink: [sat], all: [sat],
    } }),
  }));
  await page.route('https://ll.thespacedevs.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));

  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__e?.orbits && window.__e?.store, null, { timeout: 30_000 });
  await page.locator('#menuTab').click();
  await page.locator('#menuMain [data-act="sat"]').waitFor({ state: 'visible' });
  await page.locator('#menuMain [data-act="sat"]').click();
  await page.locator('#satSheet').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#satSheet')?.getAttribute('aria-hidden') === 'false');

  assert.equal(await page.evaluate(() => window.__e.store.isFreeOpen()), true);
  assert.equal(await page.evaluate(() => window.__e.store.can('satAll')), true);
  assert.equal(await page.locator('#satSheet').evaluate(node => node.inert), false);

  const starlink = page.locator('#satGroups label:has-text("스타링크") input');
  await starlink.check();
  await page.waitForFunction(() => window.__e.orbits.selected.includes('starlink') && !window.__e.orbits.loading);
  assert.equal(await starlink.isChecked(), true);
  const all = page.locator('#satGroups label:has-text("전체") input');
  await all.check();
  await page.waitForFunction(() => window.__e.orbits.selected.includes('all') && !window.__e.orbits.loading);
  assert.equal(await all.isChecked(), true);
  assert.match(await page.locator('#satStatus').textContent(), /1개 표시 중/);
  assert.doesNotMatch(await page.locator('#satSheet').textContent(), /구독|결제|준비 중|coming soon/i);

  await page.evaluate(async () => {
    const { myLocation } = await import('/js/mylocation.js');
    await myLocation.locate(true);
    const sat = window.__e.orbits.sats[0];
    window.__e.store.select({ kind: 'satellite', name: sat.name, _satIdx: 0, lat: 0, lon: 0 });
  });
  await page.locator('#sheet').waitFor({ state: 'visible' });
  await page.locator('#sheet .passes').waitFor({ state: 'visible' });
  assert.match(await page.locator('#sheet .passes').textContent(), /내 위치 통과 예보|앞으로 48시간/);
  assert.equal(await page.locator('#sheet .paid-hint').count(), 0);
  assert.ok(await page.evaluate(() => window.__e.orbits._selTrack.length > 0));
  assert.deepEqual(errors, []);
  console.log('PASS: FREE_OPEN Starlink + all catalogue + orbit track + location pass, no paid gate');
} finally {
  await browser.close();
}
