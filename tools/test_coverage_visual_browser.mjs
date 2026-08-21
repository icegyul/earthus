#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });

const points = [
  { lat: 37.57, lon: 126.98 }, { lat: 35.68, lon: 139.76 },
  { lat: 40.71, lon: -74.01 }, { lat: 51.51, lon: -0.13 },
  { lat: -33.87, lon: 151.21 }, { lat: 1.29, lon: 103.85 },
];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await page.route('**/ocean/buoys.json*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ buoys: points.slice(0, 2) }),
  }));
  await page.route('**/wind/stations.json*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ stations: points.slice(2, 4) }),
  }));
  await page.route('**/wind/gts-global.json*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ stations: points.slice(4) }),
  }));
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });
  await page.locator('#menuTab').click();
  await page.locator('#menuMain [data-open="earth"]').click();
  const button = page.locator('#layerStrip [data-id="coverage"]').first();
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  await button.click();
  await page.waitForFunction(async () => {
    const { coverage } = await import(new URL('js/layers/coverage.js', location.href).href);
    return Boolean(coverage.layer);
  }, null, { timeout: 20_000 });

  const visual = await page.evaluate(async () => {
    const { coverage } = await import(new URL('js/layers/coverage.js', location.href).href);
    const provider = coverage.layer.imageryProvider;
    const image = await provider.requestImage(0, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alphas = new Set();
    let maxAlpha = 0;
    let nonTransparent = 0;
    let redBruisePixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      alphas.add(alpha);
      maxAlpha = Math.max(maxAlpha, alpha);
      if (alpha > 0) nonTransparent += 1;
      if (alpha > 40 && red > green * 1.45 && red > blue * 1.45) redBruisePixels += 1;
    }
    const mapButton = document.querySelector('#layerStrip [data-id="coverage"]');
    return {
      width: canvas.width,
      height: canvas.height,
      maxAlpha,
      uniqueAlphaCount: alphas.size,
      nonTransparent,
      redBruisePixels,
      buttonText: mapButton?.innerText || '',
      layerAlpha: coverage.layer.alpha,
    };
  });

  assert.ok(visual.nonTransparent > 0, JSON.stringify(visual));
  assert.ok(visual.maxAlpha <= 72, `coverage overlay is too opaque: ${JSON.stringify(visual)}`);
  assert.ok(visual.uniqueAlphaCount >= 16,
    `coverage overlay has blocky stepped cells: ${JSON.stringify(visual)}`);
  assert.equal(visual.redBruisePixels, 0,
    `coverage overlay still looks like red bruises: ${JSON.stringify(visual)}`);
  assert.match(visual.buttonText, /관측 공백/);
  await page.screenshot({ path: '/private/tmp/earthus-coverage-visual.png' });
  console.log(`coverage visual browser: PASS ${JSON.stringify(visual)}`);
} finally {
  await browser.close();
}
