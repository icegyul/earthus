import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => typeof window.__e?.v8?.snapshot === 'function', null, { timeout: 30_000 });

  const state = await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('earthus:tourism-snapshot', { detail: {
      places: [{ provenance: { observedAt: '2026-08-21T02:50:00.000Z' },
        forecast: [{ at: '2026-08-21T04:00:00.000Z' }] }],
    } }));
    document.dispatchEvent(new CustomEvent('earthus:tourism-time', {
      detail: { at: '2026-08-21T04:00:00.000Z' },
    }));
    return window.__e.v8.snapshot();
  });

  assert.equal(state.schemaVersion, '8.0');
  assert.equal(state.time.mode, 'FORECAST');
  assert.equal(state.time.cursorTime, '2026-08-21T04:00:00.000Z');
  assert.equal(state.layers.find(layer => layer.layerId === 'human.tourism')?.renderer, 'RELIEF');
  assert.equal(state.layers.find(layer => layer.layerId === 'ocean.surface-speed')?.renderer, 'FIELD');
  assert.equal(state.layers.some(layer => layer.layerId === 'ocean.current'), false);
  assert.equal(state.ocean.follow, 'DISABLED_NO_VECTOR_FIELD');
  assert.deepEqual(errors, []);
  console.log('EARTHUS v8 runtime browser: PASS');
} finally {
  await browser.close();
}
