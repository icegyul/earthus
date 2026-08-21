#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8877/prototype/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1280, height: 720 },
];
const expectedGroups = {
  'ocean-data': ['layer:sst', 'layer:sstanom', 'layer:wave', 'layer:swell', 'layer:current', 'layer:buoy'],
  'ocean-activity': ['surf', 'fishing', 'vessel', 'my-ocean'],
  'deep-sea': ['dive', 'trench'],
  life: ['turtle', 'seabird', 'migbird', 'ecobird'],
  'land-sky': ['para', 'mountain', 'sky'],
};

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        errors.push(message.text());
      }
    });

    await page.goto(`${baseUrl}?ocean=hub`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#outSheet.up', { timeout: 30_000 });
    const hub = await page.evaluate(() => {
      const sheet = document.querySelector('#outSheet');
      const rect = sheet.getBoundingClientRect();
      const targets = [...sheet.querySelectorAll('.out-card')].map(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
      const close = sheet.querySelector('.tl.close');
      const closeHit = getComputedStyle(close, '::before');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        targets,
        text: sheet.innerText,
        closeHit: { width: closeHit.width, height: closeHit.height },
        groups: sheet.querySelectorAll('[data-out-group]').length,
        cards: sheet.querySelectorAll('[data-out-act]').length,
        oceanMenuEntries: document.querySelectorAll('#menuMain [data-act="ocean"]').length,
      };
    });
    assert.ok(hub.overflow <= 0, `${item.name} horizontal overflow ${hub.overflow}`);
    assert.ok(hub.rect.left >= 0 && hub.rect.right <= item.width + 0.5,
      `${item.name} Hobby sheet outside viewport`);
    assert.ok(hub.targets.every(target => target.width >= 44 && target.height >= 44),
      `${item.name} has an Ocean target below 44px`);
    assert.deepEqual(hub.closeHit, { width: '44px', height: '44px' });
    assert.equal(hub.groups, 5, `${item.name} Hobby group count changed`);
    assert.equal(hub.cards, 19, `${item.name} Hobby route count changed`);
    assert.equal(hub.oceanMenuEntries, 0, `${item.name} independent OCEAN menu remains`);
    assert.doesNotMatch(hub.text, /무료|\bFREE\b/i);
    await page.screenshot({ path: `/private/tmp/earthus-ocean-hub-${item.name}.png` });

    await page.locator('#outSheet [data-out-act="layer:wave"]').click();
    await page.waitForFunction(() => !document.querySelector('#outSheet').classList.contains('up'));
    assert.equal(await page.evaluate(async () =>
      (await import(new URL('js/store.js', location.href).href)).store.isOn('wave')), true);

    await page.locator('#menuTab').click();
    await page.waitForSelector('#menuMain.open');
    await page.locator('#menuMain [data-act="outdoor"]').click();
    await page.waitForSelector('#outSheet.up');
    const hobby = await page.evaluate(() => {
      const sheet = document.querySelector('#outSheet');
      const groups = Object.fromEntries([...sheet.querySelectorAll('[data-out-group]')].map(group => [
        group.dataset.outGroup,
        [...group.querySelectorAll('[data-out-act]')].map(card => card.dataset.outAct),
      ]));
      const targets = [...sheet.querySelectorAll('[data-out-act]')].map(element => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height };
      });
      return { groups, targets, text: sheet.innerText };
    });
    assert.deepEqual(hobby.groups, expectedGroups, `${item.name} hobby shortcut mapping changed`);
    assert.ok(hobby.targets.every(target => target.width >= 44 && target.height >= 44),
      `${item.name} has a Hobby target below 44px`);
    assert.doesNotMatch(hobby.text, /무료|\bFREE\b/i);
    await page.screenshot({ path: `/private/tmp/earthus-ocean-category-${item.name}.png` });
    await page.locator('#outSheet [data-out-act="vessel"]').click();
    await page.waitForSelector('#oceanSheet.up');
    assert.equal(await page.getByRole('link', { name: /실시간 선박 위치/ })
      .getAttribute('href'), 'https://mtis.komsa.or.kr/stg/traffic/liveSea');
    assert.equal(await page.getByRole('link', { name: /여객선 위치 · 운항/ })
      .getAttribute('target'), '_blank');
    assert.doesNotMatch(await page.locator('#oceanBody').innerText(), /무료|\bFREE\b|UNAVAILABLE|권리 승인 전/i);
    await page.screenshot({ path: `/private/tmp/earthus-ocean-vessel-${item.name}.png` });

    await page.locator('#oceanSheet [data-close="oceanSheet"]').click();
    await page.locator('#menuTab').click();
    await page.waitForSelector('#menuMain.open');
    await page.locator('#menuMain [data-act="outdoor"]').click();
    await page.waitForSelector('#outSheet.up');
    await page.locator('#outSheet [data-out-act="surf"]').click();
    await page.waitForSelector('#sfSheet.up');
    assert.deepEqual(errors, [], `${item.name} console/page errors: ${errors.join(' | ')}`);
    await page.close();
    console.log(`${item.name}: PASS · legacy Ocean route, categorized Hobby and live cards remain usable`);
  }
} finally {
  await browser.close();
}
