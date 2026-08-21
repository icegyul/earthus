#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = process.env.EARTHUS_HOBBY_URL || 'http://127.0.0.1:4173/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const onlyAction = process.env.EARTHUS_HOBBY_ACTION || '';
const layerIds = ['sst', 'sstanom', 'wave', 'swell', 'current', 'buoy']
  .filter(id => !onlyAction || onlyAction === `layer:${id}`);
const panelRoutes = [
  ['surf', '#sfSheet.up'],
  ['fishing', '#fsSheet.up'],
  ['vessel', '#oceanSheet.up'],
  ['my-ocean', '#oceanSheet.up'],
  ['turtle', '#turtleSheet.up'],
  ['seabird', '#seabirdSheet.up'],
  ['migbird', '#migbirdSheet.up'],
  ['ecobird', '#ecobirdSheet.up'],
  ['para', '#pgSheet.up'],
  ['mountain', '#mtSheet.up'],
  ['sky', '#skySheet.up'],
].filter(([action]) => !onlyAction || onlyAction === action);

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const openHobby = async page => {
    await page.locator('#menuTab').click();
    await page.locator('#menuMain.open').waitFor();
    assert.equal(await page.locator('#menuMain [data-act="ocean"]').count(), 0);
    await page.locator('#menuMain [data-act="outdoor"]').click();
    await page.locator('#outSheet.up').waitFor();
  };
  const newPage = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        errors.push(message.text());
      }
    });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
    return { page, errors };
  };

  for (const id of layerIds) {
    const { page, errors } = await newPage();
    await openHobby(page);
    await page.locator(`#outSheet [data-out-act="layer:${id}"]`).click();
    await page.waitForFunction(async layerId =>
      (await import(new URL('js/store.js', location.href).href)).store.isOn(layerId), id);
    assert.deepEqual(errors, [], `${id} layer route errors: ${errors.join(' | ')}`);
    await page.close();
  }

  for (const [action, target] of panelRoutes) {
    const { page, errors } = await newPage();
    await openHobby(page);
    await page.locator(`#outSheet [data-out-act="${action}"]`).click();
    try {
      await page.locator(target).waitFor({ timeout: 30_000 });
    } catch (error) {
      const state = await page.evaluate(selector => {
        const node = document.querySelector(selector.replace('.up', ''));
        if (!node) return null;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return { className: node.className, display: style.display, visibility: style.visibility,
          opacity: style.opacity, rect: { width: rect.width, height: rect.height, top: rect.top } };
      }, target);
      throw new Error(`${action} did not open ${target}: ${JSON.stringify(state)} · ${errors.join(' | ')}`, { cause: error });
    }
    if (action === 'my-ocean') {
      assert.equal(await page.locator('#oceanBody .ocean-widget-grid .ocean-module').count(), 6);
    }
    if (action === 'vessel') {
      assert.equal(await page.locator('#oceanBody a[target="_blank"]').count(), 2);
    }
    assert.deepEqual(errors, [], `${action} route errors: ${errors.join(' | ')}`);
    await page.close();
  }

  if (!onlyAction || onlyAction === 'trench') {
    const { page, errors } = await newPage();
    await openHobby(page);
    await page.locator('#outSheet [data-out-act="trench"]').click();
    await page.locator('#trenchGlobeHud.on').waitFor({ timeout: 30_000 });
    assert.deepEqual(errors, [], `trench route errors: ${errors.join(' | ')}`);
    await page.close();
  }

  if (!onlyAction || onlyAction === 'dive') {
    const { page, errors } = await newPage();
    await openHobby(page);
    await page.locator('#outSheet [data-out-act="dive"]').click();
    await page.locator('#sceneRoot.active[data-stage="dive"]').waitFor({ timeout: 30_000 });
    await page.locator('#diveExperience').waitFor({ state: 'visible', timeout: 30_000 });
    assert.deepEqual(errors, [], `dive route errors: ${errors.join(' | ')}`);
    await page.close();
  }

  console.log(onlyAction
    ? `PASS: Hobby route ${onlyAction} opens its real destination`
    : 'PASS: all 19 Hobby routes open a real layer, panel, trench globe, or Dive scene');
} finally {
  await browser.close();
}
