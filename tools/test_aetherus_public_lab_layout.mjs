#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.AETHERUS_LAB_URL || 'http://127.0.0.1:8765/aetherus-lab.html';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 754, height: 402 },
  { name: 'desktop', width: 1280, height: 900 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({
      viewport: { width: item.width, height: item.height },
      deviceScaleFactor: item.name.startsWith('iphone') ? 3 : 1,
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => !document.querySelector('#checkedAt')?.textContent.includes('대기'));
    const evidence = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, .hero-nav a, footer a')]
        .filter(node => node.getClientRects().length)
        .map(node => node.getBoundingClientRect());
      const cards = [...document.querySelectorAll('.card')].map(card => card.getBoundingClientRect());
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        minimumControlHeight: Math.min(...controls.map(rect => rect.height)),
        cardsOutside: cards.some(rect => rect.left < -0.5 || rect.right > innerWidth + 0.5),
        pass: document.querySelector('#passCount').textContent,
        deployed: document.querySelector('#deployedCount').textContent,
        blocked: document.querySelector('#blockedCount').textContent,
        implement: document.querySelector('#implementCount').textContent,
        gateCount: document.querySelectorAll('.gate').length,
        checkedAt: document.querySelector('#checkedAt').textContent,
        failedCards: [...document.querySelectorAll('.card[data-state="FAIL"]')]
          .map(card => `${card.querySelector('h3').textContent}: ${card.querySelector('.detail').textContent}`),
      };
    });
    assert.ok(evidence.overflow <= 0, `${item.name} horizontal overflow ${evidence.overflow}`);
    assert.equal(evidence.cardsOutside, false, `${item.name} card outside viewport`);
    assert.ok(evidence.minimumControlHeight >= 44,
      `${item.name} control below 44px: ${evidence.minimumControlHeight}`);
    assert.deepEqual([evidence.pass, evidence.deployed, evidence.blocked, evidence.implement],
      ['14', '200', '96', '0'], `${item.name}: ${evidence.checkedAt}; ${evidence.failedCards.join(' | ')}`);
    assert.ok(evidence.gateCount >= 1, `${item.name} external gate summary missing`);
    assert.deepEqual(errors, [], `${item.name} page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: `/tmp/aetherus-lab-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · 14/14 · overflow ${evidence.overflow} · controls ${Math.round(evidence.minimumControlHeight)}px`);
  }
} finally {
  await browser.close();
}
