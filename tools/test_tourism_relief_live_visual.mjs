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
const localConfig = await readFile(
  new URL('../prototype/js/config.local.example.js', import.meta.url), 'utf8',
);
const snapshot = snapshotPath
  ? JSON.parse(await readFile(snapshotPath, 'utf8'))
  : await fetch(snapshotUrl, { cache: 'no-cache' }).then(async response => {
    assert.equal(response.ok, true, `tourism snapshot HTTP ${response.status}`);
    return response.json();
  });

assert.equal(snapshot.coverage?.available, 121, 'visual QA requires the full official 121-place snapshot');
assert.equal(snapshot.places?.length, 121, 'visual QA requires 121 official place rows');

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [
    { name: 'desktop', width: 1600, height: 900, minCells: 901, maxCells: 2500, maxNeighbor: 24 },
    { name: 'mobile', width: 390, height: 844, minCells: 401, maxCells: 900, maxNeighbor: 18 },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.route('**/js/config.local.js', route => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8', body: localConfig,
    }));
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
      const { tourismFlow } = await import(new URL(
        'js/layers/tourism-flow.js?v=20260821-tourism-density2', location.href,
      ).href);
      return tourismFlow.ds?.show && tourismFlow.snapshot?.places?.length === 121
        && tourismFlow.ds.entities.values.length > 0;
    }, null, { timeout: 20_000 });
    await page.waitForTimeout(1_600);

    const result = await page.evaluate(async () => {
      const [{ tourismFlow }, { viewer }] = await Promise.all([
        import(new URL('js/layers/tourism-flow.js?v=20260821-tourism-density2', location.href).href),
        import(new URL('js/viewer.js', location.href).href),
      ]);
      viewer.render();
      const canvas = viewer.scene.canvas;
      const projected = tourismFlow.ds.entities.values.map(entity => {
        const world = entity.position?.getValue(viewer.clock.currentTime);
        const point = world
          ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, world) : null;
        return point && point.x >= 0 && point.x < canvas.clientWidth
          && point.y >= 0 && point.y < canvas.clientHeight ? point : null;
      }).filter(Boolean);
      const nearest = projected.map((point, index) => {
        let minimum = Number.POSITIVE_INFINITY;
        for (let other = 0; other < projected.length; other += 1) {
          if (other === index) continue;
          minimum = Math.min(minimum, Math.hypot(
            point.x - projected[other].x, point.y - projected[other].y,
          ));
        }
        return minimum;
      }).filter(Number.isFinite).sort((left, right) => left - right);
      const allocations = tourismFlow.ds.entities.values
        .flatMap(entity => entity._tourismContributors || []);
      const audit = new Map();
      for (const allocation of allocations) {
        const row = audit.get(allocation.placeId) || { count: 0, weight: 0 };
        row.count += 1;
        row.weight += allocation.weight;
        audit.set(allocation.placeId, row);
      }
      const sourceWeightErrors = [...audit.entries()].filter(([, row]) =>
        row.count < 9 || row.count > 25 || Math.abs(row.weight - 1) > 1e-9,
      ).map(([placeId, row]) => ({ placeId, ...row }));
      const heights = tourismFlow.ds.entities.values.map(entity =>
        entity.box.dimensions.getValue(viewer.clock.currentTime).z);
      const visibleLabels = (tourismFlow.labelDs?.entities?.values || []).filter(entity =>
        entity.label.show.getValue(viewer.clock.currentTime)).map(entity =>
        entity.label.text.getValue(viewer.clock.currentTime));
      return {
        sourcePlaceCount: tourismFlow.snapshot.places.length,
        densityCellCount: tourismFlow.ds.entities.values.length,
        placesWithNineAllocations: [...audit.values()].filter(row => row.count >= 9).length,
        visibleLabelCount: visibleLabels.length,
        duplicateVisibleLabels: visibleLabels.length - new Set(visibleLabels).size,
        occupiedScreenBins: new Set(projected.map(point =>
          `${Math.floor(point.x / 12)}:${Math.floor(point.y / 12)}`)).size,
        medianNearestNeighborPx: nearest[Math.floor(nearest.length / 2)] ?? Number.POSITIVE_INFINITY,
        minHeight: Math.min(...heights),
        maxHeight: Math.max(...heights),
        sourceWeightErrors,
        cameraHeight: viewer.camera.positionCartographic.height,
        cameraPitchDegrees: Cesium.Math.toDegrees(viewer.camera.pitch),
        referenceLabelsLoaded: viewer.imageryLayers._layers.some(layer => {
          const url = layer.imageryProvider?.url || layer.imageryProvider?._url || '';
          return String(url).includes('World_Dark_Gray_Reference');
        }),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    result.runtimeErrors = [...runtimeErrors];

    assert.equal(result.sourcePlaceCount, 121, JSON.stringify(result));
    assert.ok(result.densityCellCount >= viewport.minCells
      && result.densityCellCount <= viewport.maxCells, JSON.stringify(result));
    assert.equal(result.placesWithNineAllocations, 121, JSON.stringify(result));
    assert.deepEqual(result.sourceWeightErrors, [], JSON.stringify(result));
    assert.ok(result.minHeight >= 12 && result.maxHeight <= 180, JSON.stringify(result));
    assert.ok(result.visibleLabelCount >= 1 && result.visibleLabelCount <= 12, JSON.stringify(result));
    assert.equal(result.duplicateVisibleLabels, 0, JSON.stringify(result));
    assert.ok(result.occupiedScreenBins >= 363, JSON.stringify(result));
    assert.ok(result.medianNearestNeighborPx <= viewport.maxNeighbor, JSON.stringify(result));
    assert.ok(result.cameraHeight <= 28_000, JSON.stringify(result));
    assert.ok(result.cameraPitchDegrees >= -58 && result.cameraPitchDegrees <= -45,
      JSON.stringify(result));
    assert.equal(result.referenceLabelsLoaded, false,
      `${viewport.name} oblique relief must not stretch provider label tiles`);
    assert.equal(result.overflow, 0, JSON.stringify(result));
    assert.deepEqual(result.runtimeErrors, []);
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
