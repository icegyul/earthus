#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_BUOY_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 754, height: 402 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function selectBuoy(page) {
  await page.waitForFunction(() => !!window.__e?.store);
  await page.evaluate(() => {
    const buoy = {
      id: 'buoy-7810215', kind: 'buoy', name: '부이 7810215',
      lat: 21.5, lon: 125.9, _buoyId: '7810215', _ndbc: false,
      _obsAt: '2026-08-14T14:30:00Z',
      _obs: { waterTemp: 29.7, waveHeight: null, wavePeriod: null },
      data: {
        '수온': '29.7°C', '관측소': 'NDBC 7810215',
        '부이 종류': 'DRIFTING BUOYS (GENERIC)',
      },
    };
    /* 실제 지도 선택 순서와 같다. 지면 좌표 이벤트 직후 관측 엔티티가 정본이 된다. */
    document.dispatchEvent(new CustomEvent('earthus:decision-point', {
      detail: { point: { lat: buoy.lat, lon: buoy.lon }, pickedId: buoy.id },
    }));
    window.__e.store.select(buoy);
  });
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#decisionRail[data-ready="true"]').waitFor({ state: 'attached' });
    await selectBuoy(page);
    await page.locator('#sheet.up').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => ({
      sheetText: document.querySelector('#sheet')?.innerText || '',
      decisionVisible: !!document.querySelector('#decisionRail')?.getClientRects().length,
      placeLayout: document.querySelectorAll('#sheet.is-place-detail').length,
      compareCards: document.querySelectorAll('#sheet .buoy-compare').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    assert.equal(state.decisionVisible, false, `${item.name}: buoy opened the activity panel`);
    assert.equal(state.placeLayout, 0, `${item.name}: buoy received the generic place layout`);
    assert.equal(state.compareCards, 1, `${item.name}: buoy comparison card count changed`);
    assert.match(state.sheetText, /부이 7810215/);
    assert.match(state.sheetText, /NDBC 7810215/);
    assert.match(state.sheetText, /29\.7°C/);
    assert.doesNotMatch(state.sheetText,
      /이 장소의 활동 조건|밖에서 무엇을 할까요|야구|캠핑|풋살|등산|별보기|판단 근거|예약 가능성|출조·입수/i);
    assert.ok(state.overflow <= 0, `${item.name}: horizontal overflow ${state.overflow}`);
    assert.deepEqual(errors, [], `${item.name}: page errors ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/earthus-buoy-clean-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · buoy evidence kept · activity UI absent · one comparison card`);
  }
} finally {
  await browser.close();
}
