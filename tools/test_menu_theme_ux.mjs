#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8877/prototype/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'mobile-portrait', width: 390, height: 844 },
  { name: 'mobile-short-landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1280, height: 720 },
].filter(item => !process.env.EARTHUS_UX_CASE || item.name === process.env.EARTHUS_UX_CASE);
const expectedGroups = {
  ocean: ['ocean-layers', 'surf', 'fishing', 'trench', 'vessel'],
  life: ['turtle', 'seabird', 'migbird', 'ecobird'],
  'land-sky': ['para', 'mountain', 'sky'],
};

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of cases) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        errors.push(message.text());
      }
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.locator('#menuTab').click();
    await page.waitForSelector('#menuMain.open');
    await page.waitForFunction(() => {
      const rect = document.querySelector('#menuMain')?.getBoundingClientRect();
      return rect && Math.abs(rect.right - innerWidth) < 1;
    }, null, { timeout: 3_000 });

    const menu = await page.evaluate(() => {
      const root = document.querySelector('#menuMain');
      const box = root.getBoundingClientRect();
      const activity = root.querySelector('[aria-labelledby="mmActivitiesTitle"]');
      const items = [...activity.querySelectorAll('[data-act]')].map(item => {
        const rect = item.getBoundingClientRect();
        return { action: item.dataset.act, width: rect.width, height: rect.height, text: item.innerText };
      });
      return {
        box: { top: box.top, right: box.right, bottom: box.bottom, left: box.left },
        items,
        scrollable: root.scrollHeight > root.clientHeight,
        overflow: document.documentElement.scrollWidth - innerWidth,
        text: root.innerText,
        oceanEntries: root.querySelectorAll('[data-act="ocean"]').length,
      };
    });

    assert.ok(menu.box.top >= 0 && menu.box.bottom <= viewport.height + 0.5,
      `${viewport.name} menu escapes vertical viewport: ${JSON.stringify(menu.box)}`);
    assert.ok(menu.box.left >= 0 && menu.box.right <= viewport.width + 1,
      `${viewport.name} menu escapes horizontal viewport: ${JSON.stringify(menu.box)}`);
    assert.ok(menu.overflow <= 0, `${viewport.name} horizontal overflow ${menu.overflow}`);
    assert.deepEqual(menu.items.map(item => item.action), ['outdoor', 'flight']);
    assert.ok(menu.items.every(item => item.width >= 44 && item.height >= 44),
      `${viewport.name} activity item below 44px`);
    assert.equal(menu.oceanEntries, 0, `${viewport.name} independent OCEAN entry remains`);
    assert.match(menu.text, /취미/);
    assert.match(menu.text, /바다 · 생물 관측 · 땅과 하늘/);
    assert.doesNotMatch(menu.text, /무료|\bFREE\b/i);
    if (viewport.height <= 390) assert.equal(menu.scrollable, true,
      `${viewport.name} must scroll instead of clipping controls`);
    await page.screenshot({ path: `/private/tmp/earthus-menu-open-${viewport.name}.png` });

    await page.locator('#menuMain [data-act="outdoor"]').click();
    await page.waitForSelector('#outSheet.up');
    await page.waitForFunction(() => !document.querySelector('#menuMain')?.classList.contains('open'));
    await page.waitForTimeout(450);
    const hobby = await page.evaluate(() => {
      const root = document.querySelector('#outSheet');
      const groups = Object.fromEntries([...root.querySelectorAll('[data-out-group]')].map(group => [
        group.dataset.outGroup,
        [...group.querySelectorAll('[data-out-act]')].map(card => card.dataset.outAct),
      ]));
      const cards = [...root.querySelectorAll('[data-out-act]')].map(card => {
        const rect = card.getBoundingClientRect();
        return { action: card.dataset.outAct, width: rect.width, height: rect.height };
      });
      return {
        groups,
        cards,
        text: root.innerText,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.deepEqual(hobby.groups, expectedGroups, `${viewport.name} hobby category mapping changed`);
    assert.equal(hobby.cards.length, 12);
    assert.equal(new Set(hobby.cards.map(card => card.action)).size, hobby.cards.length,
      `${viewport.name} hobby has duplicated actions`);
    assert.ok(hobby.cards.every(card => card.width >= 44 && card.height >= 44),
      `${viewport.name} hobby target below 44px`);
    assert.ok(hobby.overflow <= 0, `${viewport.name} hobby horizontal overflow ${hobby.overflow}`);
    assert.match(hobby.text, /바다/);
    assert.match(hobby.text, /생물 관측/);
    assert.match(hobby.text, /땅과 하늘/);
    assert.doesNotMatch(hobby.text, /무료|\bFREE\b/i);
    await page.screenshot({ path: `/private/tmp/earthus-hobby-open-${viewport.name}.png` });

    await page.locator('#outSheet [data-out-act="ocean-layers"]').click();
    await page.waitForSelector('#oceanSheet.up');
    const layers = await page.evaluate(() => {
      const root = document.querySelector('#oceanSheet');
      const targets = [...root.querySelectorAll('.ocean-layer,.ocean-back')].map(target => {
        const rect = target.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      return { count: root.querySelectorAll('.ocean-layer').length, targets, text: root.innerText };
    });
    assert.equal(layers.count, 6);
    assert.ok(layers.targets.every(target => target.width >= 44 && target.height >= 44),
      `${viewport.name} ocean layer target below 44px`);
    assert.doesNotMatch(layers.text, /Surf|Fishing|My Ocean|무료|\bFREE\b/i);
    await page.locator('#oceanSheet [data-ocean-act="hobby"]').click();
    await page.waitForSelector('#outSheet.up');

    await page.locator('#outSheet [data-out-act="surf"]').click();
    await page.waitForSelector('#sfSheet.up');
    await page.locator('#sfSheet [data-close="sfSheet"]').click();

    await page.locator('#menuTab').click();
    await page.waitForSelector('#menuMain.open');
    await page.locator('#menuMain [data-act="outdoor"]').click();
    await page.waitForSelector('#outSheet.up');
    await page.waitForFunction(() => !document.querySelector('#menuMain')?.classList.contains('open'));
    await page.locator('#outSheet [data-out-act="vessel"]').click();
    await page.waitForSelector('#oceanSheet.up');
    const vesselText = await page.locator('#oceanBody').innerText();
    assert.match(vesselText, /실시간 선박 위치/);
    assert.match(vesselText, /여객선 위치 · 운항/);
    assert.doesNotMatch(vesselText, /무료|\bFREE\b/i);
    assert.equal(await page.getByRole('link', { name: /실시간 선박 위치/ })
      .getAttribute('href'), 'https://mtis.komsa.or.kr/stg/traffic/liveSea');
    await page.locator('#oceanSheet [data-close="oceanSheet"]').click();

    await page.locator('#menuTab').click();
    await page.waitForSelector('#menuMain.open');
    await page.locator('#menuMain [data-act="flight"]').click();
    await page.waitForSelector('#flightSheet.up');
    assert.deepEqual(errors, [], `${viewport.name} console/page errors: ${errors.join(' | ')}`);
    await page.close();
    console.log(`${viewport.name}: PASS · one Hobby entry, 3 categories, 12 unique routes, no free label`);
  }
} finally {
  await browser.close();
}
