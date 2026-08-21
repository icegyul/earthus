#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.evaluate(() => localStorage.setItem('earthus.hud', 'off'));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });

  const folded = await page.locator('#hudShow').evaluate(node => ({
    hidden: node.hidden,
    ariaHidden: node.getAttribute('aria-hidden'),
    display: getComputedStyle(node).display,
    opacity: Number(getComputedStyle(node).opacity),
  }));
  assert.equal(folded.hidden, false, `public HUD handle disappeared: ${JSON.stringify(folded)}`);
  assert.equal(folded.ariaHidden, 'false', JSON.stringify(folded));
  assert.notEqual(folded.display, 'none', JSON.stringify(folded));
  assert.ok(folded.opacity >= 0.5, `public HUD handle is effectively invisible: ${JSON.stringify(folded)}`);

  await page.locator('#hudShow').click();
  const opened = await page.locator('#hud').evaluate(node => ({
    hidden: node.hidden,
    ariaHidden: node.getAttribute('aria-hidden'),
    display: getComputedStyle(node).display,
    text: node.innerText,
  }));
  assert.equal(opened.hidden, false, JSON.stringify(opened));
  assert.equal(opened.ariaHidden, 'false', JSON.stringify(opened));
  assert.notEqual(opened.display, 'none', JSON.stringify(opened));
  assert.match(opened.text, /고도/);
  assert.match(opened.text, /프레임/);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });
  assert.equal(await page.locator('#hud').evaluate(node => node.hidden), false,
    'opened public HUD state must survive reload');
  await page.screenshot({ path: '/private/tmp/earthus-public-hud.png' });
  console.log('public HUD browser: PASS');
} finally {
  await browser.close();
}
