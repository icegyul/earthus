#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {
  assertOfficialTourismSnapshot,
  OFFICIAL_TOURISM_SNAPSHOT_NEGATIVE_CASES,
} from './tourism-official-snapshot-validator.mjs';

const target = process.env.EARTHUS_TOURISM_URL || 'http://127.0.0.1:8880/';
const snapshotPath = process.env.EARTHUS_TOURISM_SNAPSHOT || null;
const snapshotUrl = process.env.EARTHUS_TOURISM_SNAPSHOT_URL
  || 'https://earthus.net/tourism/seoul-flow.json';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const localConfig = await readFile(
  new URL('../prototype/js/config.local.example.js', import.meta.url), 'utf8',
);
const officialCatalog = JSON.parse(await readFile(
  new URL('../prototype/data/tourism/seoul-121-catalog.v1.json', import.meta.url), 'utf8',
));
const loadedAt = new Date().toISOString();
const snapshot = snapshotPath
  ? JSON.parse(await readFile(snapshotPath, 'utf8'))
  : await fetch(snapshotUrl, { cache: 'no-cache' }).then(async response => {
    assert.equal(response.ok, true, `tourism snapshot HTTP ${response.status}`);
    return response.json();
  });

function assertOfficialFullSnapshot(candidate) {
  return assertOfficialTourismSnapshot(candidate, officialCatalog);
}
const invalidOfficialSnapshotCases = OFFICIAL_TOURISM_SNAPSHOT_NEGATIVE_CASES;
const acceptedInvalidSnapshots = [];
const wrongInvalidSnapshotErrors = [];
for (const [label, expectedError, mutate] of invalidOfficialSnapshotCases) {
  const candidate = structuredClone(snapshot);
  mutate(candidate);
  try {
    assertOfficialFullSnapshot(candidate);
    acceptedInvalidSnapshots.push(label);
  } catch (error) {
    if (!expectedError.test(String(error?.message || error))) {
      wrongInvalidSnapshotErrors.push({ label, error: String(error?.message || error) });
    }
  }
}
assert.deepEqual(acceptedInvalidSnapshots, [],
  `invalid 121-row snapshots accepted by official visual QA: ${acceptedInvalidSnapshots.join(', ')}`);
assert.deepEqual(wrongInvalidSnapshotErrors, [],
  `invalid snapshots rejected for the wrong reason: ${JSON.stringify(wrongInvalidSnapshotErrors)}`);
assertOfficialFullSnapshot(snapshot);
console.log(`official snapshot gate: PASS (${invalidOfficialSnapshotCases.length} negative mutations, canonical catalog 121)`);
const forecastAt = [...new Set(snapshot.places.flatMap(place =>
  (place.forecast || []).filter(row => row.rank === 4).map(row => row.at),
))].sort()[0];
assert.ok(forecastAt, 'visual QA requires a real official forecast timestamp containing rank 4');
console.log(`snapshot: ${JSON.stringify({
  input: snapshotPath || snapshotUrl,
  loadedAt,
  generatedAt: snapshot.generatedAt,
  state: snapshot.state,
  sourceUrl: snapshot.source?.url,
  available: snapshot.coverage.available,
})}`);

const viewLevels = [
  { name: 'overview', height: 26_000, lon: 126.89, lat: 37.36, pitch: -52 },
  { name: 'district', height: 12_000, lon: 126.95, lat: 37.50, pitch: -58 },
  { name: 'detail', height: 4_000, lon: 126.976, lat: 37.568, pitch: -58 },
];

async function collectView(page) {
  return page.evaluate(async () => {
    const [{ tourismFlow }, { viewer }] = await Promise.all([
      import(new URL('js/layers/tourism-flow.js?v=20260821-tourism-density2', location.href).href),
      import(new URL('js/viewer.js', location.href).href),
    ]);
    viewer.render();
    const canvas = viewer.scene.canvas;
    const cells = tourismFlow.ds.entities.values;
    const projected = cells.map(entity => {
      const world = entity.position?.getValue(viewer.clock.currentTime);
      const point = world
        ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, world) : null;
      return point && point.x >= 0 && point.x < canvas.clientWidth
        && point.y >= 0 && point.y < canvas.clientHeight ? point : null;
    }).filter(Boolean);
    const nearest = projected.map((point, index) => {
      let minimum = Number.POSITIVE_INFINITY;
      for (let other = 0; other < projected.length; other += 1) {
        if (index === other) continue;
        minimum = Math.min(minimum, Math.hypot(
          point.x - projected[other].x, point.y - projected[other].y,
        ));
      }
      return minimum;
    }).filter(Number.isFinite).sort((left, right) => left - right);
    const allocationRows = cells.flatMap(entity => entity._tourismContributors || []);
    const allocationAudit = new Map();
    for (const allocation of allocationRows) {
      const row = allocationAudit.get(allocation.placeId) || { count: 0, weight: 0 };
      row.count += 1;
      row.weight += Number(allocation.weight);
      allocationAudit.set(allocation.placeId, row);
    }
    const sourceWeightErrors = [...allocationAudit.entries()].filter(([, row]) =>
      row.count < 9 || row.count > 25 || Math.abs(row.weight - 1) > 1e-9,
    ).map(([placeId, row]) => ({ placeId, ...row }));
    const heights = cells.map(entity =>
      entity.box.dimensions.getValue(viewer.clock.currentTime).z);
    const visibleLabels = tourismFlow.labelDs.entities.values.filter(entity =>
      entity.label.show.getValue(viewer.clock.currentTime)).map(entity => ({
      text: entity.label.text.getValue(viewer.clock.currentTime),
      kind: entity._tourismLabelCandidate?.kind,
    }));
    const graphics = cells.map(entity => ({
      box: Boolean(entity.box),
      polyline: Boolean(entity.polyline),
      corridor: Boolean(entity.corridor),
      wall: Boolean(entity.wall),
    }));
    const bandHeights = cells.reduce((result, entity) => {
      const band = entity._tourismVisual?.band;
      const height = entity._tourismVisual?.heightMeters;
      if (band && Number.isFinite(height)) (result[band] ||= []).push(height);
      return result;
    }, {});
    const sourceToggle = document.querySelector('#provenanceDock .pd-toggle');
    const sourceStyle = sourceToggle ? getComputedStyle(sourceToggle) : null;
    const timeline = document.querySelector('.tm-timeline');
    const sourceRect = sourceToggle?.getBoundingClientRect() || null;
    const timelineRect = timeline?.getBoundingClientRect() || null;
    const rect = value => value ? {
      left: value.left, top: value.top, right: value.right, bottom: value.bottom,
      width: value.width, height: value.height,
    } : null;
    const intersects = (left, right) => Boolean(left && right
      && left.left < right.right && left.right > right.left
      && left.top < right.bottom && left.bottom > right.top);
    const visibleTimelineControlRects = [...(timeline?.querySelectorAll('button') || [])]
      .filter(button => {
        const style = getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && bounds.width > 0 && bounds.height > 0;
      })
      .map(button => button.getBoundingClientRect());
    return {
      sourcePlaceCount: tourismFlow.snapshot.places.length,
      renderSourceCount: tourismFlow._renderSourceCount,
      densityCellCount: cells.length,
      cellMeters: cells[0]?._tourismVisual?.cellMeters ?? null,
      placesWithNineAllocations: [...allocationAudit.values()]
        .filter(row => row.count >= 9 && row.count <= 25).length,
      visibleLabelCount: visibleLabels.length,
      visibleLabels,
      duplicateVisibleLabels: visibleLabels.length
        - new Set(visibleLabels.map(label => label.text)).size,
      occupiedScreenBins: new Set(projected.map(point =>
        `${Math.floor(point.x / 12)}:${Math.floor(point.y / 12)}`)).size,
      projectedCellCount: projected.length,
      medianNearestNeighborPx: nearest[Math.floor(nearest.length / 2)]
        ?? Number.POSITIVE_INFINITY,
      minHeight: Math.min(...heights),
      maxHeight: Math.max(...heights),
      minVeryCrowdedHeight: Math.min(...(bandHeights['very-crowded'] || [Infinity])),
      maxCrowdedHeight: Math.max(...(bandHeights.crowded || [-Infinity])),
      sourceWeightErrors,
      allocationSourceTypes: [...new Set(allocationRows.map(row => row.sourceType))],
      nonBoxGraphics: graphics.filter(item => !item.box || item.polyline || item.corridor || item.wall),
      cameraHeight: viewer.camera.positionCartographic.height,
      cameraPitchDegrees: Cesium.Math.toDegrees(viewer.camera.pitch),
      overflow: document.documentElement.scrollWidth - innerWidth,
      sourceText: sourceToggle?.innerText?.replace(/\s+/g, ' ').trim() || '',
      sourceBackground: sourceStyle?.backgroundColor || null,
      sourceBorder: sourceStyle?.borderTopWidth || null,
      sourceRadius: sourceStyle?.borderRadius || null,
      sourceRect: rect(sourceRect),
      timelineRect: rect(timelineRect),
      visibleTimelineControlCount: visibleTimelineControlRects.length,
      sourceInsideViewport: Boolean(sourceRect
        && sourceRect.left >= 0 && sourceRect.top >= 0
        && sourceRect.right <= innerWidth && sourceRect.bottom <= innerHeight),
      sourceTimelineOverlap: intersects(sourceRect, timelineRect),
      sourceTimelineControlOverlap: visibleTimelineControlRects
        .some(controlRect => intersects(sourceRect, controlRect)),
      counters: { ...window.__tourismDensityE2E },
    };
  });
}

async function moveToLevel(page, level) {
  const before = await page.evaluate(() => ({ ...window.__tourismDensityE2E }));
  await page.evaluate(async next => {
    const { viewer } = await import(new URL('js/viewer.js', location.href).href);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`moveEnd timeout at ${next.name}`)), 8_000);
      let remove = null;
      remove = viewer.camera.moveEnd.addEventListener(() => {
        remove?.();
        clearTimeout(timeout);
        resolve();
      });
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(next.lon, next.lat, next.height),
        orientation: {
          heading: Cesium.Math.toRadians(22),
          pitch: Cesium.Math.toRadians(next.pitch),
          roll: 0,
        },
        duration: 0.35,
      });
    });
  }, level);
  await page.waitForTimeout(500);
  const metrics = await collectView(page);
  metrics.moveRebuildDelta = metrics.counters.rebuildCount - before.rebuildCount;
  metrics.moveRequestRenderDelta = metrics.counters.requestRenderCount - before.requestRenderCount;
  return metrics;
}

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
      status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(snapshot),
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
        && tourismFlow.ds.entities.values.length > 0 && tourismFlow._abort === null;
    }, null, { timeout: 30_000 });
    await page.waitForTimeout(1_600);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('earthus:close-menu')));

    await page.evaluate(async () => {
      const [{ tourismFlow }, { viewer }] = await Promise.all([
        import(new URL('js/layers/tourism-flow.js?v=20260821-tourism-density2', location.href).href),
        import(new URL('js/viewer.js', location.href).href),
      ]);
      window.__tourismDensityE2E = { rebuildCount: 0, requestRenderCount: 0 };
      const renderAt = tourismFlow.renderAt.bind(tourismFlow);
      tourismFlow.renderAt = (...args) => {
        window.__tourismDensityE2E.rebuildCount += 1;
        return renderAt(...args);
      };
      const requestRender = viewer.scene.requestRender.bind(viewer.scene);
      viewer.scene.requestRender = (...args) => {
        window.__tourismDensityE2E.requestRenderCount += 1;
        return requestRender(...args);
      };
    });

    const levels = {};
    for (const level of viewLevels) {
      levels[level.name] = await moveToLevel(page, level);
      assert.ok(Math.abs(levels[level.name].cameraHeight - level.height) <= 1,
        `${viewport.name} ${level.name} camera height: ${JSON.stringify(levels[level.name])}`);
      assert.equal(levels[level.name].moveRebuildDelta, 1,
        `${viewport.name} ${level.name} must rebuild once after moveEnd`);
      assert.ok(levels[level.name].densityCellCount > 0,
        `${viewport.name} ${level.name} must retain density cells`);
      assert.deepEqual(levels[level.name].nonBoxGraphics, [],
        `${viewport.name} ${level.name} must not create OD/direction graphics`);
      assert.ok(levels[level.name].visibleLabelCount >= 1
        && levels[level.name].visibleLabelCount <= 12,
      `${viewport.name} ${level.name} visible label budget`);
      assert.equal(levels[level.name].duplicateVisibleLabels, 0,
        `${viewport.name} ${level.name} duplicate labels`);
      assert.equal(levels[level.name].overflow, 0,
        `${viewport.name} ${level.name} horizontal overflow`);
      assert.equal(levels[level.name].sourceInsideViewport, true,
        `${viewport.name} ${level.name} source toggle must stay inside viewport: ${JSON.stringify(levels[level.name])}`);
      assert.ok(levels[level.name].visibleTimelineControlCount > 0,
        `${viewport.name} ${level.name} timeline controls must remain visible`);
      assert.equal(levels[level.name].sourceTimelineOverlap, false,
        `${viewport.name} ${level.name} source toggle must not overlap timeline: ${JSON.stringify(levels[level.name])}`);
      assert.equal(levels[level.name].sourceTimelineControlOverlap, false,
        `${viewport.name} ${level.name} source toggle must not overlap visible timeline controls: ${JSON.stringify(levels[level.name])}`);
      if (level.name === 'overview' || level.name === 'detail') {
        await page.evaluate(at => document.dispatchEvent(new CustomEvent('earthus:tourism-time', {
          detail: { at },
        })), forecastAt);
        await page.waitForTimeout(500);
        const forecastVisual = await collectView(page);
        assert.deepEqual(forecastVisual.allocationSourceTypes, ['OFFICIAL_FORECAST']);
        if (level.name === 'overview') {
          assert.equal(forecastVisual.renderSourceCount, 121, JSON.stringify(forecastVisual));
          assert.ok(Number.isFinite(forecastVisual.minVeryCrowdedHeight),
            `official forecast must visibly exercise red cells: ${JSON.stringify(forecastVisual)}`);
          assert.ok(Number.isFinite(forecastVisual.maxCrowdedHeight),
            `official forecast must visibly exercise orange cells: ${JSON.stringify(forecastVisual)}`);
          assert.ok(forecastVisual.minVeryCrowdedHeight >= forecastVisual.maxCrowdedHeight,
            `red relief must not be lower than orange: ${JSON.stringify(forecastVisual)}`);
        }
        await page.screenshot({
          path: `/private/tmp/earthus-tourism-density-${viewport.name}-${level.name}.png`,
          fullPage: false,
        });
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('earthus:tourism-time', {
          detail: { at: null },
        })));
        await page.waitForTimeout(500);
      }
    }

    const overview = levels.overview;
    assert.equal(overview.sourcePlaceCount, 121, JSON.stringify(overview));
    assert.equal(overview.renderSourceCount, 121, JSON.stringify(overview));
    assert.ok(overview.densityCellCount >= viewport.minCells
      && overview.densityCellCount <= viewport.maxCells, JSON.stringify(overview));
    assert.equal(overview.placesWithNineAllocations, 121, JSON.stringify(overview));
    assert.deepEqual(overview.sourceWeightErrors, [], JSON.stringify(overview));
    assert.ok(overview.minHeight >= 12 && overview.maxHeight <= 180, JSON.stringify(overview));
    assert.ok(overview.occupiedScreenBins >= 363, JSON.stringify(overview));
    assert.ok(overview.medianNearestNeighborPx <= viewport.maxNeighbor, JSON.stringify(overview));
    assert.ok(new Set([levels.overview.cellMeters, levels.district.cellMeters,
      levels.detail.cellMeters]).size >= 2,
    `${viewport.name} camera LOD must change rendered cell resolution`);
    assert.match(overview.sourceText,
      /^출처:\s*서울특별시 실시간 인구데이터 · \d{2}:\d{2} 자료$/);
    assert.equal(overview.sourceBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(overview.sourceBorder, '0px');
    assert.equal(overview.sourceRadius, '0px');

    // 카메라 이동 직후의 유한 power 요청과 imagery tile 조립이 끝난 뒤를 idle로 잰다.
    await page.waitForFunction(async () => {
      const { power } = await import(new URL('js/power.js', location.href).href);
      return !power.animating;
    }, null, { timeout: 10_000 });
    await page.waitForTimeout(5_000);
    const idleBefore = await collectView(page);
    await page.waitForTimeout(5_000);
    const idleAfter = await collectView(page);
    const idle = {
      milliseconds: 5_000,
      entityCountBefore: idleBefore.densityCellCount,
      entityCountAfter: idleAfter.densityCellCount,
      rebuildDelta: idleAfter.counters.rebuildCount - idleBefore.counters.rebuildCount,
      requestRenderDelta: idleAfter.counters.requestRenderCount - idleBefore.counters.requestRenderCount,
    };
    assert.equal(idle.entityCountAfter, idle.entityCountBefore, JSON.stringify(idle));
    assert.equal(idle.rebuildDelta, 0, JSON.stringify(idle));
    assert.equal(idle.requestRenderDelta, 0, JSON.stringify(idle));
    assert.deepEqual(runtimeErrors, []);

    console.log(`${viewport.name}: ${JSON.stringify({
      overview, district: levels.district, detail: levels.detail, idle, runtimeErrors,
    })}`);
    await context.close();
  }
} finally {
  await browser.close();
}
