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
  ['**/js/layerbar.js*', process.env.EARTHUS_LAYERBAR_CANDIDATE, 'text/javascript; charset=utf-8'],
  ['**/js/ui.js*', process.env.EARTHUS_UI_CANDIDATE, 'text/javascript; charset=utf-8'],
  ['**/css/account.css*', process.env.EARTHUS_ACCOUNT_CANDIDATE, 'text/css; charset=utf-8'],
].filter(([, file]) => file)
  .map(async ([url, file, contentType]) => [url, await readFile(file, 'utf8'), contentType]));

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height }, serviceWorkers: 'block' });
    for (const [url, body, contentType] of sourceOverrides) {
      await page.route(url, route => route.fulfill({ status: 200,
        contentType, body }));
    }
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const openAllLayers = async () => {
      await page.locator('#menuTab').click();
      await page.locator('#menuMain.open').waitFor();
      await page.locator('#menuMain [data-open="earth"]').click();
      await page.locator('#menuSub.open').waitFor();
      // 전체 레이어는 두 번째 펼치기 동작 없이 처음부터 모두 보여야 한다.
      assert.equal(await page.locator('#menuSub .ly-all-toggle').count(), 0);
    };

    await openAllLayers();
    const flight = page.locator('#menuSub .ly').filter({ hasText: '항공기' });
    assert.match(await flight.innerText(), /항로·내 비행기 추적/);
    assert.doesNotMatch(await flight.innerText(), /선착순|유료|구독|잠김/);
    await flight.click();
    await page.locator('#flightSheet.up').waitFor();
    await page.waitForFunction(() => !document.querySelector('#menuSub')?.classList.contains('open'));
    await page.locator('#flightSheet .ap-input').first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(450);
    const flightLayout = await page.locator('#flightSheet').evaluate(sheet => {
      const rect = sheet.getBoundingClientRect();
      const controls = [...sheet.querySelectorAll('button,a,input')]
        .filter(node => node.getClientRects().length).map(node => {
          const rectangle = node.getBoundingClientRect();
          const before = getComputedStyle(node, '::before');
          const beforeWidth = Number.parseFloat(before.width) || 0;
          const beforeHeight = Number.parseFloat(before.height) || 0;
          return {
            name: node.getAttribute('aria-label') || node.textContent?.trim() || node.placeholder || node.tagName,
            width: Math.max(rectangle.width, beforeWidth),
            height: Math.max(rectangle.height, beforeHeight),
          };
        });
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        minimumControl: Math.min(...controls.map(control => Math.min(control.width, control.height))),
        controls };
    });
    assert.ok(flightLayout.left >= -0.5 && flightLayout.right <= item.width + 0.5
      && flightLayout.top >= -0.5 && flightLayout.bottom <= item.height + 0.5,
    `${item.name} flight sheet outside viewport: ${JSON.stringify(flightLayout)}`);
    assert.ok(flightLayout.minimumControl >= 44,
      `${item.name} flight control below 44px: ${JSON.stringify(flightLayout.controls)}`);
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
    await page.waitForFunction(() => !document.querySelector('#menuSub')?.classList.contains('open'));
    await page.waitForTimeout(450);
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
