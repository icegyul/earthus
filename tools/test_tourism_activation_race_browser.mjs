#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const RELEASE = '20260821-tourism-density2';
const target = process.env.EARTHUS_TOURISM_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const snapshotPath = process.env.EARTHUS_TOURISM_SNAPSHOT
  || '/private/tmp/earthus-seoul-flow-current.json';
const [snapshotText, localConfig] = await Promise.all([
  readFile(snapshotPath, 'utf8'),
  readFile(new URL('../prototype/js/config.local.example.js', import.meta.url), 'utf8'),
]);

const oldHealth = {
  schemaVersion: 'earthus.tourism-health.v1', generatedAt: '2026-08-20T15:10:04.433Z',
  state: 'SUCCEEDED', mode: 'FULL',
};
const freshHealth = {
  ...oldHealth, generatedAt: '2026-08-21T01:58:16.498Z',
};
const oldKto = {
  schemaVersion: 'earthus.kto-summary.v1', provider: 'KTO',
  generatedAt: '2026-08-20T14:50:10Z', state: 'PARTIAL', services: {},
};
const freshKto = {
  ...oldKto, generatedAt: '2026-08-21T01:50:10Z',
};

async function configureContext(context) {
  await context.route('**/js/config.local.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: localConfig,
  }));
  await context.route('**/tourism/seoul-flow.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: snapshotText,
  }));
}

async function installRaceHarness(page, blockedAuxiliary) {
  await page.evaluate(async ({ release, blocked, staleHealth, currentHealth, staleKto, currentKto }) => {
    const [{ tourismFlow }, { viewer }] = await Promise.all([
      import(new URL(`js/layers/tourism-flow.js?v=${release}`, location.href).href),
      import(new URL('js/viewer.js', location.href).href),
    ]);
    const originalFetch = window.fetch.bind(window);
    const originalRefresh = tourismFlow.refresh.bind(tourismFlow);
    const originalRenderAt = tourismFlow.renderAt.bind(tourismFlow);
    const originalFlyTo = viewer.camera.flyTo.bind(viewer.camera);
    const state = {
      blocked,
      healthCalls: 0,
      ktoCalls: 0,
      refreshStarted: 0,
      refreshFinished: 0,
      renderCalls: 0,
      flyToCalls: 0,
      snapshotEvents: 0,
      auxiliaryEvents: 0,
      errorEvents: 0,
      releaseOldHealth: null,
      releaseOldKto: null,
      freshSnapshot: null,
      freshAuxiliary: null,
      beforeOldCompletion: null,
    };
    const jsonResponse = body => ({
      ok: true,
      status: 200,
      json: async () => structuredClone(body),
    });
    const delayedResponse = (key, body) => ({
      ok: true,
      status: 200,
      json: () => new Promise(resolve => {
        state[key] = () => resolve(structuredClone(body));
      }),
    });
    window.fetch = async (input, init) => {
      const url = String(input?.url || input);
      if (/\/tourism\/health\.json(?:\?|$)/.test(url)) {
        state.healthCalls += 1;
        if (state.healthCalls === 1) {
          return blocked === 'health'
            ? delayedResponse('releaseOldHealth', staleHealth)
            : jsonResponse(staleHealth);
        }
        return jsonResponse(currentHealth);
      }
      if (/\/tourism\/kto\/summary\.json(?:\?|$)/.test(url)) {
        state.ktoCalls += 1;
        if (state.ktoCalls === 1) {
          return blocked === 'kto'
            ? delayedResponse('releaseOldKto', staleKto)
            : jsonResponse(currentKto);
        }
        return jsonResponse(blocked === 'health' ? staleKto : currentKto);
      }
      return originalFetch(input, init);
    };
    tourismFlow.refresh = (...args) => {
      state.refreshStarted += 1;
      const pending = originalRefresh(...args);
      pending.finally(() => { state.refreshFinished += 1; });
      return pending;
    };
    tourismFlow.renderAt = (...args) => {
      state.renderCalls += 1;
      return originalRenderAt(...args);
    };
    viewer.camera.flyTo = options => {
      state.flyToCalls += 1;
      return originalFlyTo(options);
    };
    document.addEventListener('earthus:tourism-snapshot', () => { state.snapshotEvents += 1; });
    document.addEventListener('earthus:tourism-auxiliary', () => { state.auxiliaryEvents += 1; });
    document.addEventListener('earthus:tourism-error', () => { state.errorEvents += 1; });
    window.__tourismActivationRace = state;
  }, {
    release: RELEASE,
    blocked: blockedAuxiliary,
    staleHealth: oldHealth,
    currentHealth: freshHealth,
    staleKto: oldKto,
    currentKto: freshKto,
  });
}

async function runRace(browser, blockedAuxiliary) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
  });
  await configureContext(context);
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });
  await installRaceHarness(page, blockedAuxiliary);

  await page.evaluate(() => window.__e.store.setLayer('tourism', true));
  await page.waitForFunction(blocked => {
    const state = window.__tourismActivationRace;
    return state.refreshStarted === 1
      && typeof state[blocked === 'health' ? 'releaseOldHealth' : 'releaseOldKto'] === 'function';
  }, blockedAuxiliary);

  await page.evaluate(() => window.__e.store.setLayer('tourism', false));
  const afterFirstOff = await page.evaluate(async release => {
    const { tourismFlow } = await import(new URL(
      `js/layers/tourism-flow.js?v=${release}`, location.href,
    ).href);
    return {
      snapshot: tourismFlow.snapshot,
      auxiliary: tourismFlow.auxiliary,
      snapshotEvents: window.__tourismActivationRace.snapshotEvents,
      auxiliaryEvents: window.__tourismActivationRace.auxiliaryEvents,
      errorEvents: window.__tourismActivationRace.errorEvents,
      mapHidden: document.getElementById('tourismMapUi')?.getAttribute('aria-hidden'),
    };
  }, RELEASE);
  assert.equal(afterFirstOff.snapshot, null, `${blockedAuxiliary}: OFF must keep snapshot unset`);
  assert.deepEqual(afterFirstOff.auxiliary, { health: null, ktoSummary: null });
  assert.equal(afterFirstOff.snapshotEvents, 0);
  assert.equal(afterFirstOff.auxiliaryEvents, 0);
  assert.equal(afterFirstOff.errorEvents, 0);
  assert.equal(afterFirstOff.mapHidden, 'true');

  await page.evaluate(async release => {
    const { tourismFlow } = await import(new URL(
      `js/layers/tourism-flow.js?v=${release}`, location.href,
    ).href);
    window.__e.store.setLayer('tourism', true);
    await tourismFlow.refresh();
  }, RELEASE);
  await page.waitForTimeout(1_600);
  await page.waitForFunction(() => window.__tourismActivationRace.refreshFinished >= 1);

  const fresh = await page.evaluate(async release => {
    const { tourismFlow } = await import(new URL(
      `js/layers/tourism-flow.js?v=${release}`, location.href,
    ).href);
    const state = window.__tourismActivationRace;
    state.freshSnapshot = tourismFlow.snapshot;
    state.freshAuxiliary = tourismFlow.auxiliary;
    window.__e.store.setLayer('tourism', false);
    state.beforeOldCompletion = {
      snapshotEvents: state.snapshotEvents,
      auxiliaryEvents: state.auxiliaryEvents,
      errorEvents: state.errorEvents,
      renderCalls: state.renderCalls,
      flyToCalls: state.flyToCalls,
      rawEntityCount: tourismFlow.ds.entities.values.length,
    };
    return {
      healthGeneratedAt: tourismFlow.auxiliary?.health?.generatedAt,
      ktoGeneratedAt: tourismFlow.auxiliary?.ktoSummary?.generatedAt,
      snapshotEvents: state.snapshotEvents,
      auxiliaryEvents: state.auxiliaryEvents,
      errorEvents: state.errorEvents,
      rawEntityCount: tourismFlow.ds.entities.values.length,
      visibleCount: tourismFlow.count(),
      mapHidden: document.getElementById('tourismMapUi')?.getAttribute('aria-hidden'),
    };
  }, RELEASE);
  assert.equal(fresh.healthGeneratedAt, freshHealth.generatedAt);
  assert.equal(fresh.ktoGeneratedAt, freshKto.generatedAt);
  assert.equal(fresh.snapshotEvents, 1);
  assert.equal(fresh.auxiliaryEvents, 1);
  assert.equal(fresh.errorEvents, 0);
  assert.ok(fresh.rawEntityCount > 0, `${blockedAuxiliary}: fresh ON must build density cells`);
  assert.equal(fresh.visibleCount, 0);
  assert.equal(fresh.mapHidden, 'true');

  await page.evaluate(blocked => {
    const state = window.__tourismActivationRace;
    state[blocked === 'health' ? 'releaseOldHealth' : 'releaseOldKto']();
  }, blockedAuxiliary);
  await page.waitForFunction(() => window.__tourismActivationRace.refreshFinished >= 2);
  await page.waitForTimeout(100);

  const final = await page.evaluate(async release => {
    const { tourismFlow } = await import(new URL(
      `js/layers/tourism-flow.js?v=${release}`, location.href,
    ).href);
    const state = window.__tourismActivationRace;
    return {
      snapshotSame: tourismFlow.snapshot === state.freshSnapshot,
      auxiliarySame: tourismFlow.auxiliary === state.freshAuxiliary,
      snapshotEvents: state.snapshotEvents,
      auxiliaryEvents: state.auxiliaryEvents,
      errorEvents: state.errorEvents,
      renderCalls: state.renderCalls,
      flyToCalls: state.flyToCalls,
      rawEntityCount: tourismFlow.ds.entities.values.length,
      visibleCount: tourismFlow.count(),
      mapHidden: document.getElementById('tourismMapUi')?.getAttribute('aria-hidden'),
      before: state.beforeOldCompletion,
    };
  }, RELEASE);
  assert.equal(final.snapshotSame, true, `${blockedAuxiliary}: stale snapshot replaced fresh state`);
  assert.equal(final.auxiliarySame, true, `${blockedAuxiliary}: abort became unavailable/stale sidecar`);
  assert.equal(final.snapshotEvents, final.before.snapshotEvents,
    `${blockedAuxiliary}: stale run emitted snapshot event`);
  assert.equal(final.auxiliaryEvents, final.before.auxiliaryEvents,
    `${blockedAuxiliary}: stale run emitted auxiliary event`);
  assert.equal(final.errorEvents, final.before.errorEvents,
    `${blockedAuxiliary}: aborted run emitted unavailable error`);
  assert.equal(final.renderCalls, final.before.renderCalls,
    `${blockedAuxiliary}: stale run rebuilt entities after OFF`);
  assert.equal(final.flyToCalls, final.before.flyToCalls,
    `${blockedAuxiliary}: stale run moved the camera after OFF`);
  assert.equal(final.rawEntityCount, final.before.rawEntityCount,
    `${blockedAuxiliary}: stale run cleared/rebuilt the fresh density entities`);
  assert.equal(final.visibleCount, 0);
  assert.equal(final.mapHidden, 'true');
  assert.deepEqual(runtimeErrors, []);
  await context.close();
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  await runRace(browser, 'health');
  await runRace(browser, 'kto');
  console.log('tourism activation race browser: PASS (health/KTO stale completions ignored)');
} finally {
  await browser.close();
}
