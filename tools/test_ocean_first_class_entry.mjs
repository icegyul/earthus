#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_OCEAN_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 },
];

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
    await page.locator('#menuTab').click();
    await page.locator('#menuMain.open').waitFor({ timeout: 30_000 });

    const menuEntries = page.locator('#menuMain [data-act="ocean"]');
    assert.equal(await menuEntries.count(), 1, `${item.name} OCEAN menu count`);
    assert.doesNotMatch(await menuEntries.innerText(), /무료|\bFREE\b|결제|구독/i);
    await menuEntries.click();
    await page.locator('#oceanSheet.up').waitFor({ timeout: 30_000 });

    const evidence = await page.evaluate(() => {
      const sheet = document.querySelector('#oceanSheet');
      const box = sheet.getBoundingClientRect();
      const targets = [...sheet.querySelectorAll('.ocean-layer,.ocean-module,.ocean-back')]
        .filter(node => node.getClientRects().length)
        .map(node => node.getBoundingClientRect());
      const closeHit = getComputedStyle(sheet.querySelector('.tl.close'), '::before');
      return {
        title: document.querySelector('#oceanTitle')?.textContent,
        layers: sheet.querySelectorAll('[data-ocean-layer]').length,
        modules: sheet.querySelectorAll('.ocean-module').length,
        text: sheet.innerText,
        outside: box.left < -0.5 || box.right > innerWidth + 0.5,
        overflow: document.documentElement.scrollWidth - innerWidth,
        minimumTarget: Math.min(...targets.map(target => Math.min(target.width, target.height))),
        closeHit: { width: closeHit.width, height: closeHit.height },
      };
    });
    assert.equal(evidence.title, 'OCEAN');
    assert.equal(evidence.layers, 6, `${item.name} Ocean layer count`);
    assert.equal(evidence.modules, 5, `${item.name} Ocean vertical count`);
    assert.match(evidence.text, /오늘의 바다/);
    for (const label of ['Surf', 'Fishing', 'Dive · 심해', 'Marine Life', 'Vessels']) {
      assert.match(evidence.text, new RegExp(label), `${item.name} missing ${label}`);
    }
    assert.doesNotMatch(evidence.text, /무료|\bFREE\b|결제|구독/i);
    assert.equal(evidence.outside, false, `${item.name} Ocean sheet outside viewport`);
    assert.ok(evidence.overflow <= 0, `${item.name} horizontal overflow ${evidence.overflow}`);
    assert.ok(evidence.minimumTarget >= 44, `${item.name} target below 44px: ${evidence.minimumTarget}`);
    assert.deepEqual(evidence.closeHit, { width: '44px', height: '44px' });
    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/earthus-ocean-first-class-${item.name}.png` });
    await page.close();
    console.log(`${item.name}: PASS · OCEAN first-class entry · 6 layers · 5 verticals`);
  }
} finally {
  await browser.close();
}
