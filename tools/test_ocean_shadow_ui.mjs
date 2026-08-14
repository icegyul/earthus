#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8765';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'blocked-mobile', mode: 'blocked', width: 390, height: 844, state: 'BLOCKED', score: null },
  { name: 'unknown-tablet', mode: 'unknown', width: 768, height: 900, state: 'UNKNOWN', score: null },
  { name: 'clear-desktop', mode: 'clear', width: 1280, height: 900,
    state: 'NO_BLOCKING_EVIDENCE', score: 72 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/tools/fixtures/ocean-core-shadow.html?mode=${item.mode}`,
      { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => window.__oceanShadowReady === true);
    const state = await page.evaluate(() => {
      const section = document.querySelector('.ocean-core-shadow');
      const buttons = [...document.querySelectorAll('button')].map(button => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      return {
        public: section.dataset.public,
        shadow: section.dataset.shadowOnly,
        state: section.dataset.state,
        score: window.__oceanShadowState.gatedResult.score,
        coreCta: window.__oceanShadowState.gatedResult.departureCtaAllowed,
        shadowCta: section.querySelector('[data-shadow-cta]')?.dataset.shadowCta,
        overflow: document.documentElement.scrollWidth - innerWidth,
        buttons,
        text: section.textContent,
        evidenceCount: section.querySelectorAll('[data-kind]').length,
        metricCount: section.querySelectorAll('[data-metric]').length,
      };
    });
    assert.equal(state.public, 'false');
    assert.equal(state.shadow, 'true');
    assert.equal(state.state, item.state);
    assert.equal(state.score, item.score);
    assert.equal(state.coreCta, item.state === 'NO_BLOCKING_EVIDENCE');
    assert.equal(state.shadowCta, 'disabled');
    assert.ok(state.overflow <= 0, `${item.name} horizontal overflow ${state.overflow}`);
    assert.ok(state.buttons.every(button => button.width >= 44 && button.height >= 44),
      `${item.name} has a small target`);
    assert.equal(state.evidenceCount, 3);
    assert.equal(state.metricCount, 2);
    assert.match(state.text, /FIXTURE|fixture/);
    assert.match(state.text, /2026-08-14T09:50:00.000Z/);
    assert.doesNotMatch(state.text, /안전합니다|출발하세요|입수 가능/);
    assert.deepEqual(errors, [], `${item.name} console errors: ${errors.join(' | ')}`);

    if (item.mode === 'blocked') {
      await page.locator('[data-mode="unknown"]').click();
      await page.waitForFunction(() => window.__oceanShadowState.mode === 'unknown');
      assert.equal(await page.locator('.ocean-core-shadow').getAttribute('data-state'), 'UNKNOWN');
      assert.equal(await page.locator('[data-mode="unknown"]').getAttribute('aria-pressed'), 'true');
    }
    await page.screenshot({ path: `/private/tmp/ocean-shadow-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · ${item.state} · overflow ${state.overflow}`);
  }
} finally {
  await browser.close();
}
