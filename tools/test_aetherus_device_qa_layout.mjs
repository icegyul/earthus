#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.AETHERUS_QA_URL || 'http://127.0.0.1:8765/aetherus-device-qa.html';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const cases = [
  { name: 'iphone-portrait', width: 402, height: 754, columns: '1' },
  { name: 'iphone-landscape', width: 754, height: 402, columns: '2' },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: 3,
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('[data-status-for="environment"]').waitFor();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('.qa-main');
      const cards = [...document.querySelectorAll('.qa-card')].map(card => card.getBoundingClientRect());
      const controls = [...document.querySelectorAll('button, .button, select, input[type="number"], textarea')]
        .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
        .map(node => node.getBoundingClientRect());
      const camera = document.querySelector('.camera-stage').getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        overflow: document.documentElement.scrollWidth - innerWidth,
        columns: getComputedStyle(main).gridTemplateColumns.split(' ').length,
        cardOutside: cards.some(rect => rect.left < -0.5 || rect.right > innerWidth + 0.5),
        minimumControlHeight: Math.min(...controls.map(rect => rect.height)),
        camera: { width: camera.width, height: camera.height },
      };
    });
    assert.ok(layout.overflow <= 0, `${item.name} horizontal overflow ${layout.overflow}`);
    assert.equal(layout.cardOutside, false, `${item.name} card leaves viewport`);
    assert.equal(String(layout.columns), item.columns, `${item.name} wrong column count`);
    assert.ok(layout.minimumControlHeight >= 44, `${item.name} control below 44px: ${layout.minimumControlHeight}`);
    if (item.name === 'iphone-landscape') {
      assert.ok(layout.camera.height <= 240, `landscape camera too tall: ${layout.camera.height}`);
      assert.ok(layout.camera.width > layout.camera.height, 'landscape camera did not switch to wide framing');
    }
    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/aetherus-device-qa-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · ${layout.columns} column · overflow ${layout.overflow} · camera ${Math.round(layout.camera.width)}×${Math.round(layout.camera.height)}`);
  }
} finally {
  await browser.close();
}
