#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_FREE_OPEN_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'iphone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];
const sourceOverrides = await Promise.all([
  ['**/js/layerbar.js*', process.env.EARTHUS_LAYERBAR_CANDIDATE],
  ['**/js/ui.js*', process.env.EARTHUS_UI_CANDIDATE],
].filter(([, file]) => file).map(async ([url, file]) => [url, await readFile(file, 'utf8')]));

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height }, serviceWorkers: 'block' });
    for (const [url, body] of sourceOverrides) {
      await page.route(url, route => route.fulfill({ status: 200,
        contentType: 'text/javascript; charset=utf-8', body }));
    }
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const openAllLayers = async () => {
      await page.locator('#menuTab').click();
      await page.locator('#menuMain.open').waitFor();
      await page.locator('#menuMain [data-open="earth"]').click();
      await page.locator('#menuSub.open').waitFor();
      const toggle = page.locator('#menuSub .ly-all-toggle');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    };

    await openAllLayers();
    const flight = page.locator('#menuSub .ly').filter({ hasText: '항공기' });
    assert.match(await flight.innerText(), /항로·내 비행기 추적/);
    assert.doesNotMatch(await flight.innerText(), /선착순|유료|구독|잠김/);
    await flight.click();
    await page.locator('#flightSheet.up').waitFor();
    assert.equal(await page.locator('#demandSheet.up').count(), 0);
    assert.equal(await page.locator('#waitlistSheet.up').count(), 0);
    await page.screenshot({ path: `/tmp/earthus-free-open-flight-${item.name}.png`, fullPage: true });
    await page.locator('#flightSheet [data-close="flightSheet"]').click();

    await openAllLayers();
    const vessel = page.locator('#menuSub .ly').filter({ hasText: '선박' });
    assert.match(await vessel.innerText(), /공식 실시간 위치/);
    assert.doesNotMatch(await vessel.innerText(), /선착순|유료|구독|잠김/);
    await vessel.click();
    await page.locator('#oceanSheet.up').waitFor();
    assert.equal(await page.getByRole('link', { name: /실시간 선박 위치/ })
      .getAttribute('href'), 'https://mtis.komsa.or.kr/stg/traffic/liveSea');
    assert.equal(await page.locator('#demandSheet.up').count(), 0);
    await page.screenshot({ path: `/tmp/earthus-free-open-vessel-${item.name}.png`, fullPage: true });
    await page.locator('#oceanSheet [data-close="oceanSheet"]').click();

    await page.locator('#menuTab').click();
    await page.locator('#menuMain.open').waitFor();
    await page.locator('#menuMain [data-act="settings"]').click();
    await page.locator('#settings.up').waitFor();
    assert.equal(await page.locator('#btnSubscribe').count(), 0);
    assert.equal(await page.locator('#btnWaitlist').count(), 0);
    const hint = await page.locator('#tierHint').innerText();
    assert.match(hint, /모두 무료/);
    assert.doesNotMatch(hint, /유료 서비스|결제|구독|창립 멤버/);

    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/earthus-free-open-transit-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · aircraft and vessels open directly · waitlist hidden`);
  }
} finally {
  await browser.close();
}
