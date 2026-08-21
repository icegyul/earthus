#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const RELEASE = '20260821-tourism-density1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = new URL(process.env.EARTHUS_LIVE_URL
  || `https://earthus.net/?earth=1&earthView=data&earthLayer=tourism&release=${RELEASE}`);
target.searchParams.set('release', RELEASE);
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const snapshotPath = process.env.EARTHUS_TOURISM_SNAPSHOT || null;
const localSnapshot = snapshotPath ? await readFile(snapshotPath, 'utf8') : null;
const localConfig = await readFile(
  new URL('../prototype/js/config.local.example.js', import.meta.url), 'utf8',
);
const catalog = JSON.parse(await readFile(
  new URL('../prototype/data/tourism/seoul-121-catalog.v1.json', import.meta.url), 'utf8',
));

const digest = value => createHash('sha256').update(value).digest('hex');
const assets = Object.freeze([
  ['index.html', 'text/html'],
  ['sw.js', 'text/javascript'],
  ['css/tourism-flow.css', 'text/css'],
  ['css/v8-shell.css', 'text/css'],
  ['js/tourism-flow-contract.js', 'text/javascript'],
  ['js/tourism-density-grid.js', 'text/javascript'],
  ['js/tourism-density-labels.js', 'text/javascript'],
  ['js/layers/tourism-flow.js', 'text/javascript'],
  ['js/layers/registry.js', 'text/javascript'],
  ['js/ui-tourism.js', 'text/javascript'],
  ['js/ui-source.js', 'text/javascript'],
  ['js/v8/provenance-dock.js', 'text/javascript'],
]);

for (const [publicPath, mime] of assets) {
  const assetUrl = new URL(publicPath, target);
  assetUrl.searchParams.set('release', RELEASE);
  const [local, response] = await Promise.all([
    readFile(path.join(root, 'prototype', publicPath)),
    fetch(assetUrl, { cache: 'no-store' }),
  ]);
  assert.equal(response.status, 200, `${publicPath} HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', new RegExp(`^${mime.replace('/', '\\/')}`),
    `${publicPath} MIME ${response.headers.get('content-type')}`);
  const live = Buffer.from(await response.arrayBuffer());
  assert.equal(digest(live), digest(local), `${publicPath} live/local SHA-256 mismatch`);
}
console.log(`asset bytes: PASS (${assets.length}/${assets.length}, release ${RELEASE})`);

const catalogByCode = new Map(catalog.places.map(place => [place.code, place]));
assert.equal(catalog.schemaVersion, 'earthus.tourism-place-catalog.v1');
assert.equal(catalog.source?.publisher, '서울특별시');
assert.equal(catalogByCode.size, 121);

function assertOfficialFullSnapshot(snapshot) {
  assert.equal(snapshot?.schemaVersion, 'earthus.tourism-flow.v1');
  assert.deepEqual(snapshot?.provider, {
    id: 'seoul-citydata-ppltn', mode: 'FULL', endpointClass: 'OFFICIAL_PUBLIC_API',
  });
  assert.equal(snapshot?.source?.name, '서울특별시 실시간 인구데이터');
  assert.equal(snapshot?.source?.url,
    'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do');
  assert.equal(snapshot?.coverage?.available, 121);
  assert.equal(snapshot?.coverage?.total, 121);
  assert.equal(snapshot?.coverage?.requested, 121);
  assert.equal(snapshot?.coverage?.responses, 121);
  assert.equal(snapshot?.coverage?.errorCount, 0);
  assert.equal(snapshot?.coverage?.fullCoverage, true);
  assert.equal(snapshot?.places?.length, 121);

  const ids = new Set();
  const codes = new Set();
  for (const place of snapshot.places) {
    const canonical = catalogByCode.get(place.code);
    assert.ok(canonical, `unknown official code ${place.code}`);
    assert.equal(place.id, `earthus:tourism:seoul:${place.code}`);
    assert.equal(ids.has(place.id), false, `duplicate official id ${place.id}`);
    assert.equal(codes.has(place.code), false, `duplicate official code ${place.code}`);
    ids.add(place.id);
    codes.add(place.code);
    assert.equal(place.nameKo, canonical.nameKo);
    assert.equal(place.nameEn, canonical.nameEn);
    assert.equal(place.category, canonical.category);
    assert.ok(Math.abs(place.position.lat - canonical.lat) <= 1e-6);
    assert.ok(Math.abs(place.position.lon - canonical.lon) <= 1e-6);
    assert.equal(place.position.source, '서울시 주요 121장소 영역');
    assert.equal(place.provenance?.sourceId, 'seoul-citydata-ppltn');
    assert.equal(place.provenance?.sourceName, '서울특별시 실시간 인구데이터');
    assert.equal(place.provenance?.sourceUrl,
      'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do');
    assert.equal(place.official?.sourceType, 'OFFICIAL_OBSERVATION');
    assert.ok(place.forecast?.every(row => row.sourceType === 'OFFICIAL_FORECAST'));
    assert.equal(place.flow?.direction?.state, 'UNAVAILABLE');
    assert.equal(place.flow?.direction?.value, null);
    assert.equal(place.flow?.scalarTrend?.flowDirection, null);
    for (const forbidden of ['od', 'links', 'edges', 'flowLines', 'route', 'path', 'vector']) {
      assert.equal(Object.hasOwn(place, forbidden), false, `${place.code} contains ${forbidden}`);
    }
  }
  assert.equal(ids.size, 121);
  assert.equal(codes.size, 121);
}

async function configureContext(context) {
  if (!localSnapshot) return;
  await context.route('**/js/config.local.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: localConfig,
  }));
  await context.route('**/tourism/seoul-flow.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: localSnapshot,
  }));
  await context.route('**/tourism/health.json*', route => route.fulfill({ status: 404, body: '{}' }));
  await context.route('**/tourism/kto/summary.json*', route => route.fulfill({ status: 404, body: '{}' }));
}

async function openTourism(page) {
  await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });
  await page.locator('#menuTab').click();
  await page.locator('#menuMain [data-open="earth"]').click();
  const button = page.locator('#layerStrip [data-id="tourism"]').first();
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  const active = await button.evaluate(node => node.classList.contains('on')
    || node.getAttribute('aria-pressed') === 'true');
  // 딥링크가 먼저 켠 경우에도 source listener가 붙은 뒤의 실제 사용자 on 경로를 다시 검증한다.
  if (active) {
    await button.click();
    await page.waitForFunction(() => !window.__e.store.isOn('tourism'), null, { timeout: 10_000 });
  }
  await button.click();
  await page.waitForFunction(async release => {
    const { tourismFlow } = await import(new URL(
      `js/layers/tourism-flow.js?v=${release}`, location.href,
    ).href);
    return tourismFlow.ds?.show && tourismFlow.snapshot?.places?.length === 121
      && tourismFlow.ds.entities.values.length > 0 && tourismFlow._abort === null;
  }, RELEASE, { timeout: 30_000 });
  await page.waitForFunction(() => /^출처:\s*서울특별시 실시간 인구데이터 · \d{2}:\d{2} 자료$/.test(
    document.querySelector('#provenanceDock .pd-toggle')?.innerText?.replace(/\s+/g, ' ').trim() || '',
  ), null, { timeout: 10_000 });
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('earthus:close-menu')));
}

async function moveCamera(page, height) {
  await page.evaluate(async nextHeight => {
    const [{ viewer }, { tourismFlow }] = await Promise.all([
      import(new URL('js/viewer.js', location.href).href),
      import(new URL('js/layers/tourism-flow.js?v=20260821-tourism-density1', location.href).href),
    ]);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`camera moveEnd timeout ${nextHeight}`)), 8_000);
      const complete = () => {
        clearTimeout(timeout);
        resolve();
      };
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          nextHeight > 10_000 ? 126.89 : 126.976,
          nextHeight > 10_000 ? 37.36 : 37.568,
          nextHeight,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(22),
          pitch: Cesium.Math.toRadians(nextHeight > 10_000 ? -52 : -58),
          roll: 0,
        },
        duration: 0.35,
        complete,
        cancel: () => {
          clearTimeout(timeout);
          reject(new Error(`camera flight cancelled ${nextHeight}`));
        },
      });
    });
    // 이미 같은 목적지이면 moveEnd가 생략될 수 있으므로 검증할 LOD를 한 번 명시적으로 계산한다.
    tourismFlow.renderAt();
    viewer.render();
  }, height);
  await page.waitForTimeout(800);
}

async function collect(page) {
  return page.evaluate(async release => {
    const [{ tourismFlow }, { viewer }] = await Promise.all([
      import(new URL(`js/layers/tourism-flow.js?v=${release}`, location.href).href),
      import(new URL('js/viewer.js', location.href).href),
    ]);
    viewer.render();
    const cells = tourismFlow.ds.entities.values;
    const labels = tourismFlow.labelDs.entities.values.filter(entity =>
      entity.label.show.getValue(viewer.clock.currentTime)).map(entity => ({
      text: entity.label.text.getValue(viewer.clock.currentTime),
      kind: entity._tourismLabelCandidate?.kind,
      placeNameKo: entity._tourismLabelCandidate?.placeNameKo || null,
      districtNameKo: entity._tourismLabelCandidate?.districtNameKo || null,
    }));
    const allocations = cells.flatMap(entity => entity._tourismContributors || []);
    const audit = new Map();
    for (const row of allocations) {
      const item = audit.get(row.placeId) || { count: 0, weight: 0 };
      item.count += 1;
      item.weight += Number(row.weight);
      audit.set(row.placeId, item);
    }
    const sourceWeightErrors = [...audit.entries()].filter(([, row]) =>
      row.count < 9 || row.count > 25 || Math.abs(row.weight - 1) > 1e-9,
    ).map(([placeId, row]) => ({ placeId, ...row }));
    const projected = cells.map(entity => {
      const world = entity.position?.getValue(viewer.clock.currentTime);
      const point = world ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, world) : null;
      return point && point.x >= 0 && point.x < viewer.canvas.clientWidth
        && point.y >= 0 && point.y < viewer.canvas.clientHeight ? point : null;
    }).filter(Boolean);
    const nearest = projected.map((point, index) => {
      let minimum = Infinity;
      for (let other = 0; other < projected.length; other += 1) {
        if (index !== other) minimum = Math.min(minimum, Math.hypot(
          point.x - projected[other].x, point.y - projected[other].y,
        ));
      }
      return minimum;
    }).filter(Number.isFinite).sort((a, b) => a - b);
    const source = document.querySelector('#provenanceDock .pd-toggle');
    const timeline = document.querySelector('.tm-timeline');
    const sourceRect = source?.getBoundingClientRect();
    const timelineRect = timeline?.getBoundingClientRect();
    const intersects = (left, right) => Boolean(left && right
      && left.left < right.right && left.right > right.left
      && left.top < right.bottom && left.bottom > right.top);
    const controls = [...(timeline?.querySelectorAll('button') || [])].filter(button => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const sourceStyle = source ? getComputedStyle(source) : null;
    const heights = cells.map(entity => entity.box.dimensions.getValue(viewer.clock.currentTime).z);
    return {
      snapshot: tourismFlow.snapshot,
      sourcePlaceCount: tourismFlow.snapshot.places.length,
      renderSourceCount: tourismFlow._renderSourceCount,
      densityCellCount: cells.length,
      occupiedScreenBins: new Set(projected.map(point =>
        `${Math.floor(point.x / 12)}:${Math.floor(point.y / 12)}`)).size,
      medianNearestNeighborPx: nearest[Math.floor(nearest.length / 2)] ?? Infinity,
      sourceWeightErrors,
      minHeight: Math.min(...heights),
      maxHeight: Math.max(...heights),
      labels,
      title: document.querySelector('.tm-title h2')?.textContent?.trim() || '',
      sourceText: source?.innerText?.replace(/\s+/g, ' ').trim() || '',
      sourceBackground: sourceStyle?.backgroundColor || null,
      sourceBorder: sourceStyle?.borderTopWidth || null,
      sourceRadius: sourceStyle?.borderRadius || null,
      sourceShadow: sourceStyle?.boxShadow || null,
      sourceInsideViewport: Boolean(sourceRect && sourceRect.left >= 0 && sourceRect.top >= 0
        && sourceRect.right <= innerWidth && sourceRect.bottom <= innerHeight),
      sourceLowerLeft: Boolean(sourceRect && sourceRect.left <= 32 && sourceRect.top > innerHeight / 2),
      sourceTimelineOverlap: intersects(sourceRect, timelineRect),
      sourceControlOverlap: controls.some(button => intersects(sourceRect, button.getBoundingClientRect())),
      releaseAssets: {
        main: document.querySelector('script[src*="js/main.js"]')?.getAttribute('src') || '',
        tourismCss: document.querySelector('link[href*="tourism-flow.css"]')?.getAttribute('href') || '',
        v8Css: document.querySelector('link[href*="v8-shell.css"]')?.getAttribute('href') || '',
      },
    };
  }, RELEASE);
}

function assertOverview(result, viewport) {
  assertOfficialFullSnapshot(result.snapshot);
  assert.equal(result.sourcePlaceCount, 121);
  assert.equal(result.renderSourceCount, 121);
  assert.ok(result.densityCellCount >= viewport.minCells && result.densityCellCount <= viewport.maxCells,
    `${viewport.name} density cells ${result.densityCellCount}`);
  assert.ok(result.occupiedScreenBins >= 363, `${viewport.name} occupied bins ${result.occupiedScreenBins}`);
  assert.ok(result.medianNearestNeighborPx <= viewport.maxNeighbor,
    `${viewport.name} nearest p50 ${result.medianNearestNeighborPx}`);
  assert.deepEqual(result.sourceWeightErrors, []);
  assert.ok(result.minHeight >= 12 && result.maxHeight <= 180);
  assert.ok(result.labels.length >= 1 && result.labels.length <= 12);
  assert.ok(result.labels.some(label => label.kind === 'district' && label.districtNameKo),
    `${viewport.name} ADM2 label missing`);
  assert.equal(result.title, '서울 관광 밀도');
  assert.match(result.sourceText, /^출처:\s*서울특별시 실시간 인구데이터/);
  assert.doesNotMatch(result.sourceText, /NOAA|GMGSI|구름/);
  assert.equal(result.sourceBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(result.sourceBorder, '0px');
  assert.equal(result.sourceRadius, '0px');
  assert.equal(result.sourceShadow, 'none');
  assert.equal(result.sourceInsideViewport, true);
  assert.equal(result.sourceLowerLeft, true);
  assert.equal(result.sourceTimelineOverlap, false);
  assert.equal(result.sourceControlOverlap, false);
  assert.match(result.releaseAssets.main, new RegExp(RELEASE));
  assert.match(result.releaseAssets.tourismCss, new RegExp(RELEASE));
  assert.match(result.releaseAssets.v8Css, new RegExp(RELEASE));
}

function stableCore(result) {
  return {
    sourcePlaceCount: result.sourcePlaceCount,
    renderSourceCount: result.renderSourceCount,
    densityCellCount: result.densityCellCount,
    occupiedScreenBins: result.occupiedScreenBins,
    minHeight: result.minHeight,
    maxHeight: result.maxHeight,
    title: result.title,
    sourceText: result.sourceText,
    labelTexts: result.labels.map(label => label.text),
    sourceWeightErrors: result.sourceWeightErrors,
  };
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [
    { name: 'desktop', width: 1600, height: 900, minCells: 901, maxCells: 2500, maxNeighbor: 24 },
    { name: 'mobile', width: 390, height: 844, minCells: 401, maxCells: 900, maxNeighbor: 18 },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'allow' });
    await configureContext(context);
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));

    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await openTourism(page);
    await moveCamera(page, 26_000);
    const initial = await collect(page);
    assertOverview(initial, viewport);

    await moveCamera(page, 4_000);
    const detail = await collect(page);
    assert.ok(detail.labels.some(label => label.kind === 'place'
      && label.placeNameKo && label.text.includes(label.placeNameKo)),
    `${viewport.name} official place label missing`);

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15_000 });
    await openTourism(page);
    await moveCamera(page, 26_000);
    const reloaded = await collect(page);
    assertOverview(reloaded, viewport);
    assert.deepEqual(stableCore(reloaded), stableCore(initial),
      `${viewport.name} service-worker reload changed the tourism core result`);
    const serviceWorker = await page.evaluate(async () => ({
      controller: navigator.serviceWorker.controller?.scriptURL || '',
      caches: await caches.keys(),
    }));
    assert.match(serviceWorker.controller, /\/sw\.js$/);
    assert.ok(serviceWorker.caches.includes('earthus-shell-2026-08-21-tourism-density1'));
    assert.equal(serviceWorker.caches.includes('earthus-shell-2026-08-20-weather-tourism1'), false);
    assert.deepEqual(runtimeErrors, []);
    await page.screenshot({
      path: `/private/tmp/earthus-tourism-density-live-${viewport.name}.png`, fullPage: false,
    });
    console.log(`${viewport.name}: ${JSON.stringify({
      cells: initial.densityCellCount,
      labels: initial.labels.length,
      occupiedScreenBins: initial.occupiedScreenBins,
      medianNearestNeighborPx: initial.medianNearestNeighborPx,
      serviceWorker: serviceWorker.controller,
      runtimeErrors: runtimeErrors.length,
    })}`);
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('tourism density live: PASS');
