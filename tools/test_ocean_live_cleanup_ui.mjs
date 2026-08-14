#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_OCEAN_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 754, height: 402 },
  { name: 'desktop', width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?ocean=hub`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#oceanSheet.up').waitFor({ timeout: 30_000 });

    const home = await page.evaluate(() => {
      const sheet = document.querySelector('#oceanSheet');
      const targets = [...sheet.querySelectorAll('.ocean-layer,.ocean-module,.ocean-back')]
        .filter(node => node.getClientRects().length)
        .map(node => node.getBoundingClientRect());
      return {
        title: document.querySelector('#oceanTitle')?.textContent.trim(),
        text: sheet.innerText,
        layers: sheet.querySelectorAll('[data-ocean-layer]').length,
        moduleNames: [...sheet.querySelectorAll('.ocean-module b')].map(node => node.textContent.trim()),
        freeMenuBadge: document.querySelectorAll('[data-act="ocean"] .mm-free').length,
        minimumControl: Math.min(...targets.map(box => Math.min(box.width, box.height))),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    assert.equal(home.title, 'OCEAN');
    assert.equal(home.layers, 6);
    assert.deepEqual(home.moduleNames, ['Surf', 'Fishing', 'Dive · 심해', 'Marine Life', 'Vessels']);
    assert.equal(home.freeMenuBadge, 0);
    assert.ok(home.minimumControl >= 44, `${item.name} control below 44px: ${home.minimumControl}`);
    assert.ok(home.overflow <= 0, `${item.name} horizontal overflow ${home.overflow}`);
    assert.doesNotMatch(home.text, /무료|\bFREE\b|UNAVAILABLE|GATED|권리 승인 전|My Ocean|결제|구독/i);
    assert.doesNotMatch(home.text, /출조·입수 가능 여부|does not forecast whether departure/i);

    await page.getByRole('button', { name: /Vessels/ }).click();
    await page.locator('#oceanBody a').first().waitFor();
    const vessel = await page.evaluate(() => ({
      text: document.querySelector('#oceanBody').innerText,
      accessBanners: document.querySelectorAll('#oceanBody .ocean-access').length,
      links: [...document.querySelectorAll('#oceanBody a')].map(link => ({
        text: link.innerText, href: link.href, target: link.target,
      })),
    }));
    assert.equal(vessel.accessBanners, 0);
    assert.equal(vessel.links.length, 2);
    assert.match(vessel.links[0].href, /mtis\.komsa\.or\.kr\/stg\/traffic\/liveSea/);
    assert.ok(vessel.links.every(link => link.target === '_blank'));
    assert.doesNotMatch(vessel.text, /무료|\bFREE\b|UNAVAILABLE|GATED|권리 승인 전/i);
    await page.screenshot({ path: `/tmp/earthus-ocean-clean-${item.name}.png`, fullPage: true });
    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.close();
    console.log(`${item.name}: PASS · clean Ocean hub · 6 layers · official vessels`);
  }
} finally {
  await browser.close();
}
