#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_TOURISM_URL || 'http://127.0.0.1:8880/';
const snapshotPath = process.env.EARTHUS_TOURISM_SNAPSHOT || null;
const snapshotUrl = process.env.EARTHUS_TOURISM_SNAPSHOT_URL
  || 'https://earthus.net/tourism/seoul-flow.json';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const snapshot = snapshotPath
  ? JSON.parse(await readFile(snapshotPath, 'utf8'))
  : await fetch(snapshotUrl, { cache: 'no-cache' }).then(async response => {
    assert.equal(response.ok, true, `tourism snapshot HTTP ${response.status}`);
    return response.json();
  });

assert.equal(snapshot.coverage?.available, 121, 'visual QA requires the full official 121-place snapshot');

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [
    { name: 'desktop', width: 1600, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.route('**/tourism/seoul-flow.json*', route => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(snapshot),
    }));
    await page.route('**/tourism/health.json*', route => route.fulfill({ status: 404, body: '{}' }));
    await page.route('**/tourism/kto/summary.json*', route => route.fulfill({ status: 404, body: '{}' }));
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });
    await page.locator('#menuTab').click();
    await page.locator('#menuMain [data-open="earth"]').click();
    await page.locator('#layerStrip [data-id="tourism"]').first().click();
    await page.waitForFunction(async () => {
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-relief-hotfix1', location.href).href);
      return tourismFlow.ds?.show && tourismFlow.ds.entities.values.length === 121;
    }, null, { timeout: 20_000 });
    await page.waitForTimeout(1_600);

    const result = await page.evaluate(async () => {
      const [{ tourismFlow }, { viewer }] = await Promise.all([
        import(new URL('js/layers/tourism-flow.js?v=20260821-relief-hotfix1', location.href).href),
        import(new URL('js/viewer.js', location.href).href),
      ]);
      const screenHeights = tourismFlow.ds.entities.values.map(entity => {
        const place = entity._tourism;
        const visual = entity._tourismVisual;
        const bottom = Cesium.Cartesian3.fromDegrees(place.position.lon, place.position.lat, 0);
        const top = Cesium.Cartesian3.fromDegrees(
          place.position.lon, place.position.lat, visual.heightMeters,
        );
        const bottomPx = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, bottom);
        const topPx = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, top);
        if (!bottomPx || !topPx) return null;
        return Math.hypot(topPx.x - bottomPx.x, topPx.y - bottomPx.y);
      }).filter(Number.isFinite).sort((left, right) => left - right);
      return {
        count: tourismFlow.ds.entities.values.length,
        cameraHeight: viewer.camera.positionCartographic.height,
        cameraPitchDegrees: Cesium.Math.toDegrees(viewer.camera.pitch),
        referenceLabelsLoaded: viewer.imageryLayers._layers.some(layer => {
          const url = layer.imageryProvider?.url || layer.imageryProvider?._url || '';
          return String(url).includes('World_Dark_Gray_Reference');
        }),
        measured: screenHeights.length,
        medianScreenHeight: screenHeights[Math.floor(screenHeights.length / 2)] || 0,
        p10ScreenHeight: screenHeights[Math.floor(screenHeights.length * 0.1)] || 0,
      };
    });

    assert.equal(result.count, 121, JSON.stringify(result));
    assert.ok(result.cameraHeight <= 28_000, JSON.stringify(result));
    assert.ok(result.cameraPitchDegrees >= -58 && result.cameraPitchDegrees <= -45,
      JSON.stringify(result));
    assert.equal(result.referenceLabelsLoaded, false,
      `${viewport.name} oblique relief must not stretch provider label tiles`);
    assert.equal(result.measured, 121, JSON.stringify(result));
    assert.ok(result.medianScreenHeight >= 8,
      `${viewport.name} median relief collapsed into dots: ${JSON.stringify(result)}`);
    assert.ok(result.p10ScreenHeight >= 3,
      `${viewport.name} low relief collapsed into dots: ${JSON.stringify(result)}`);
    assert.deepEqual(runtimeErrors, []);
    await page.screenshot({
      path: `/private/tmp/earthus-tourism-relief-live-${viewport.name}.png`,
      fullPage: false,
    });
    console.log(`${viewport.name}: ${JSON.stringify(result)}`);
    await context.close();
  }
} finally {
  await browser.close();
}
