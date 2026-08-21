#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8877/prototype/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 720 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(() => localStorage.clear());
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#menuTab').click();
    await page.waitForSelector('#menuMain.open');
    await page.locator('#menuMain [data-open="travel"]').click();
    await page.waitForSelector('#menuSub.open');

    const travel = await page.evaluate(() => ({
      ids: [...document.querySelectorAll('#layerStrip .ly-purpose-item')]
        .map(button => button.dataset.id),
      text: document.querySelector('#menuSub').innerText,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.deepEqual(travel.ids, ['tourism', 'poi']);
    assert.match(travel.text, /같은 상태|same state/i);
    assert.ok(travel.overflow <= 0, `${viewport.name} horizontal overflow ${travel.overflow}`);

    await page.locator('#layerStrip [data-id="tourism"]').click();
    assert.equal(await page.locator('#layerStrip [data-id="tourism"]').evaluate(
      button => button.classList.contains('on')), true);

    // 2단이 열린 모바일에서는 1단이 의도적으로 화면 밖/inert다. 오른쪽 손잡이로
    // 메뉴를 닫았다 다시 여는 실제 터치 경로를 거쳐 지구 레이어로 이동한다.
    await page.locator('#menuTab').click();
    await page.waitForFunction(() => !document.querySelector('#menuMain').classList.contains('open'));
    await page.locator('#menuTab').click();
    await page.waitForSelector('#menuMain.open');
    await page.locator('#menuMain [data-open="earth"]').click();
    await page.waitForFunction(() => document.querySelector('#menuSub .ms-head')?.textContent
      ?.includes('레이어'));
    assert.equal(await page.locator('#layerStrip [data-id="tourism"]').evaluate(
      button => button.classList.contains('on')), true,
    `${viewport.name} travel and Earth menus do not share tourism state`);

    assert.deepEqual(pageErrors, [], `${viewport.name} page errors: ${pageErrors.join(' | ')}`);
    await page.screenshot({ path: `/private/tmp/earthus-v8-travel-menu-${viewport.name}.png` });
    await page.close();
    console.log(`${viewport.name}: PASS · Travel reuses Earth tourism/POI layer state`);
  }
} finally {
  await browser.close();
}
