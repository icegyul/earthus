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
    assert.equal(await menuEntries.count(), 0, `${item.name} independent OCEAN menu remains`);
    await page.locator('#menuMain [data-act="outdoor"]').click();
    await page.locator('#outSheet.up').waitFor({ timeout: 30_000 });

    const evidence = await page.evaluate(() => {
      const sheet = document.querySelector('#outSheet');
      const box = sheet.getBoundingClientRect();
      const targets = [...sheet.querySelectorAll('.out-card')]
        .filter(node => node.getClientRects().length)
        .map(node => node.getBoundingClientRect());
      const closeHit = getComputedStyle(sheet.querySelector('.tl.close'), '::before');
      return {
        title: sheet.querySelector('h3')?.textContent,
        groups: sheet.querySelectorAll('[data-out-group]').length,
        cards: sheet.querySelectorAll('[data-out-act]').length,
        text: sheet.innerText,
        outside: box.left < -0.5 || box.right > innerWidth + 0.5,
        overflow: document.documentElement.scrollWidth - innerWidth,
        minimumTarget: Math.min(...targets.map(target => Math.min(target.width, target.height))),
        closeHit: { width: closeHit.width, height: closeHit.height },
      };
    });
    assert.equal(evidence.title, '취미');
    assert.equal(evidence.groups, 5, `${item.name} Hobby group count`);
    assert.equal(evidence.cards, 19, `${item.name} Hobby card count`);
    for (const label of ['해수면 온도', '수온 편차', '파고', '너울', '해류', '해양 부이',
      '서핑', '낚시', 'Dive · 심해', 'My Ocean', '선박', '바다거북', '땅과 하늘']) {
      assert.match(evidence.text, new RegExp(label), `${item.name} missing ${label}`);
    }
    assert.doesNotMatch(evidence.text, /무료|\bFREE\b|결제|구독/i);
    assert.equal(evidence.outside, false, `${item.name} Hobby sheet outside viewport`);
    assert.ok(evidence.overflow <= 0, `${item.name} horizontal overflow ${evidence.overflow}`);
    assert.ok(evidence.minimumTarget >= 44, `${item.name} target below 44px: ${evidence.minimumTarget}`);
    assert.deepEqual(evidence.closeHit, { width: '44px', height: '44px' });
    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/earthus-hobby-ocean-${item.name}.png` });
    await page.close();
    console.log(`${item.name}: PASS · one Hobby entry · 5 categories · 19 routes`);
  }
} finally {
  await browser.close();
}
