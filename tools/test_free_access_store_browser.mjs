#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = (process.env.EARTHUS_APP_URL || 'http://127.0.0.1:8767').replace(/\/$/, '');
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/js/access-mode.js`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const state = await page.evaluate(async () => {
    const [{ store }, config, { CONFIG }, access] = await Promise.all([
      import('/js/store.js'), import('/js/config.js'), import('/js/config.local.js'),
      import('/js/access-mode.js'),
    ]);
    return {
      mode: CONFIG.MONETIZATION_MODE,
      freeOpen: store.isFreeOpen(),
      paidCapabilities: Object.values(config.PAID_CAP).map(capability => ({
        capability, allowed: store.can(capability),
      })),
      availableLayersDenied: config.LAYER_DEFS.filter(item => !item.blocked && !store.canUse(item))
        .map(item => item.id),
      blockedLayersOpened: config.LAYER_DEFS.filter(item => item.blocked && store.canUse(item))
        .map(item => item.id),
      blockedProviders: config.LAYER_DEFS.filter(item => item.blocked === 'provider')
        .map(item => item.id),
      accidentalSalesAllowed: access.salesAllowed({ mode: CONFIG.MONETIZATION_MODE, salesOpen: true }),
      subscriptionUiAllowed: access.subscriptionUiAllowed({ mode: CONFIG.MONETIZATION_MODE,
        showSubscribe: true }),
    };
  });
  assert.deepEqual(errors, []);
  assert.equal(state.mode, 'FREE_OPEN');
  assert.equal(state.freeOpen, true);
  assert.equal(state.paidCapabilities.length, 5);
  assert.ok(state.paidCapabilities.every(item => item.allowed === true));
  assert.deepEqual(state.availableLayersDenied, []);
  assert.deepEqual(state.blockedLayersOpened, []);
  assert.deepEqual(state.blockedProviders.sort(), ['flight', 'ship']);
  assert.equal(state.accidentalSalesAllowed, false);
  assert.equal(state.subscriptionUiAllowed, false);
  console.log(`PASS: FREE_OPEN browser store · ${state.paidCapabilities.length}/5 capabilities free · sales off`);
} finally {
  await browser.close();
}
