#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const requestedUrl = process.env.EARTHUS_CANARY_URL
  || 'http://127.0.0.1:8765/canary/ocean-aetherus-v3/index.html';
const baseUrl = requestedUrl.endsWith('.html') ? requestedUrl : `${requestedUrl.replace(/\/$/, '')}/index.html`;
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewports = [
  { name: 'mobile', width: 390, height: 844, columns: 1 },
  { name: 'desktop', width: 1280, height: 900, columns: 3 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#pendingCount')?.textContent === '0',
      null, { timeout: 30_000 });
    const state = await page.evaluate(() => ({
      pass: Number(document.querySelector('#passCount')?.textContent),
      fail: Number(document.querySelector('#failCount')?.textContent),
      pending: Number(document.querySelector('#pendingCount')?.textContent),
      overflow: document.documentElement.scrollWidth - innerWidth,
      cards: document.querySelectorAll('.card').length,
      passCards: document.querySelectorAll('.card[data-state="PASS"]').length,
      failures: [...document.querySelectorAll('.card[data-state="FAIL"]')].map(card => ({
        id: card.dataset.test, detail: card.querySelector('.card__detail')?.textContent,
      })),
      columns: getComputedStyle(document.querySelector('#oceanGrid')).gridTemplateColumns.split(' ').length,
      notReleased: document.querySelector('.guard strong')?.textContent,
      robots: document.querySelector('meta[name="robots"]')?.content,
      smallButtons: [...document.querySelectorAll('button')].some(button => {
        const rect = button.getBoundingClientRect(); return rect.height < 44 || rect.width < 44;
      }),
    }));
    assert.deepEqual(errors, [], `${viewport.name}: browser errors ${errors.join(' | ')}`);
    assert.equal(state.pass, 22, `${viewport.name}: pass count ${JSON.stringify(state.failures)}`);
    assert.equal(state.fail, 0, `${viewport.name}: fail count`);
    assert.equal(state.pending, 0, `${viewport.name}: pending count`);
    assert.equal(state.cards, 22, `${viewport.name}: card count`);
    assert.equal(state.passCards, 22, `${viewport.name}: pass cards`);
    assert.equal(state.columns, viewport.columns, `${viewport.name}: columns`);
    assert.ok(state.overflow <= 0, `${viewport.name}: horizontal overflow ${state.overflow}`);
    assert.equal(state.smallButtons, false, `${viewport.name}: control under 44px`);
    assert.equal(state.notReleased, 'NOT RELEASED');
    assert.match(state.robots, /noindex/);
    await page.screenshot({ path: `/private/tmp/ocean-aetherus-v3-canary-${viewport.name}.png`,
      fullPage: true });
    await page.close();
    console.log(`${viewport.name}: PASS · 22/22 · ${state.columns} columns · overflow ${state.overflow}`);
  }
} finally {
  await browser.close();
}
