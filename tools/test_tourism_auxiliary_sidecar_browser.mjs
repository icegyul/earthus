#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { assertOfficialTourismSnapshot } from './tourism-official-snapshot-validator.mjs';
import { validateCanonicalTourismAllocationAudit } from './tourism-density-release-contract.mjs';

const RELEASE = '20260821-tourism-density2';
const target = process.env.EARTHUS_TOURISM_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const snapshotPath = process.env.EARTHUS_TOURISM_SNAPSHOT
  || '/private/tmp/earthus-seoul-flow-current.json';
const [snapshotText, catalog, localConfig] = await Promise.all([
  readFile(snapshotPath, 'utf8'),
  readFile(new URL('../prototype/data/tourism/seoul-121-catalog.v1.json', import.meta.url), 'utf8')
    .then(JSON.parse),
  readFile(new URL('../prototype/js/config.local.example.js', import.meta.url), 'utf8'),
]);

const health = {
  schemaVersion: 'earthus.tourism-health.v1', generatedAt: '2026-08-20T15:10:04.433Z',
  state: 'SUCCEEDED', mode: 'FULL',
  credentialPool: { configured: 3, used: 3, slots: [
    { slot: 1, requested: 41, responses: 41, errors: 0 },
    { slot: 2, requested: 40, responses: 40, errors: 0 },
    { slot: 3, requested: 40, responses: 40, errors: 0 },
  ] },
  providers: { tourismAccessibility: { state: 'UNAVAILABLE' } },
};
const ktoSummary = {
  schemaVersion: 'earthus.kto-summary.v1', provider: 'KTO',
  generatedAt: '2026-08-20T14:50:10Z', state: 'PARTIAL',
  services: {
    barrierFree: {
      sourceName: '한국관광공사 무장애 여행 정보',
      sourceUrl: 'https://www.data.go.kr/data/15101897/openapi.do',
      updatedAt: '2026-08-20T13:48:03Z',
      operations: { areaBasedSyncList2: {
        state: 'AVAILABLE', itemCount: 11644, updatedAt: '2026-08-20T13:48:03Z',
        semanticType: 'OFFICIAL_BARRIER_FREE_TOURISM_CONTENT',
        sourceType: 'OFFICIAL_INFORMATION',
        path: '/tourism/kto/barrierFree/areaBasedSyncList2.json',
      } },
    },
  },
};

async function configureContext(context, auxiliarySuccess) {
  await context.route('**/js/config.local.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: localConfig,
  }));
  await context.route('**/tourism/seoul-flow.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: snapshotText,
  }));
  await context.route('**/tourism/health.json*', route => route.fulfill(auxiliarySuccess ? {
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(health),
  } : { status: 404, body: '{}' }));
  await context.route('**/tourism/kto/summary.json*', route => route.fulfill(auxiliarySuccess ? {
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(ktoSummary),
  } : { status: 404, body: '{}' }));
}

async function openTourism(page) {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });
  await page.evaluate(() => {
    window.__tourismAuxiliaryTest = { snapshot: null, auxiliary: null };
    document.addEventListener('earthus:tourism-snapshot', event => {
      window.__tourismAuxiliaryTest.snapshot = event.detail;
    }, { once: true });
    document.addEventListener('earthus:tourism-auxiliary', event => {
      window.__tourismAuxiliaryTest.auxiliary = event.detail;
    }, { once: true });
  });
  await page.locator('#menuTab').click();
  await page.locator('#menuMain [data-open="earth"]').click();
  await page.locator('#layerStrip [data-id="tourism"]').first().click();
  await page.waitForFunction(() => {
    const dataSource = window.__e?.viewer?.dataSources?.getByName('tourism-flow')?.[0];
    return window.__tourismAuxiliaryTest?.snapshot?.places?.length === 121
      && window.__tourismAuxiliaryTest?.auxiliary
      && dataSource?.entities?.values?.length > 0;
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(1_600);
}

async function collect(page) {
  return page.evaluate(async release => {
    const { tourismSheet } = await import(new URL(
      `js/ui-tourism.js?v=${release}`, location.href,
    ).href);
    const { snapshot, auxiliary } = window.__tourismAuxiliaryTest;
    const dataSource = window.__e.viewer.dataSources.getByName('tourism-flow')[0];
    const allocations = dataSource.entities.values
      .flatMap(entity => entity._tourismContributors || []);
    const auditMap = new Map();
    for (const allocation of allocations) {
      const row = auditMap.get(allocation.placeId) || { count: 0, weight: 0 };
      row.count += 1;
      row.weight += Number(allocation.weight);
      auditMap.set(allocation.placeId, row);
    }
    const allocationAudit = [...auditMap.entries()]
      .map(([placeId, row]) => ({ placeId, ...row }))
      .sort((left, right) => left.placeId.localeCompare(right.placeId));
    tourismSheet.snapshot = snapshot;
    tourismSheet.auxiliary = auxiliary;
    tourismSheet.place = snapshot.places.find(place => place.state !== 'UNAVAILABLE');
    tourismSheet.render();
    return {
      snapshot,
      auxiliary,
      sheetAuxiliary: tourismSheet.auxiliary,
      allocationAudit,
      densityCellCount: dataSource.entities.values.length,
      sheetText: document.getElementById('tourismBody')?.textContent || '',
    };
  }, RELEASE);
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const results = {};
  for (const auxiliarySuccess of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await configureContext(context, auxiliarySuccess);
    const page = await context.newPage();
    await openTourism(page);
    const result = await collect(page);
    const official = assertOfficialTourismSnapshot(result.snapshot, catalog);
    const allocation = validateCanonicalTourismAllocationAudit(
      official.canonicalPlaceIds, result.allocationAudit,
    );
    assert.deepEqual(allocation.errors, []);
    assert.equal(result.allocationAudit.length, 121);
    if (auxiliarySuccess) {
      assert.equal(result.auxiliary?.health?.state, 'SUCCEEDED');
      assert.equal(result.auxiliary?.ktoSummary?.provider, 'KTO');
      assert.equal(result.sheetAuxiliary?.health?.state, 'SUCCEEDED');
      assert.match(result.sheetText, /수집기 SUCCEEDED · FULL/);
      assert.match(result.sheetText, /한국관광공사 요약 수신/);
    } else {
      assert.deepEqual(result.auxiliary, { health: null, ktoSummary: null });
      assert.deepEqual(result.sheetAuxiliary, { health: null, ktoSummary: null });
      assert.match(result.sheetText, /health 보조 자료를 확인하지 못했습니다/);
      assert.match(result.sheetText, /한국관광공사 수집 결과가 연결되기 전 상태/);
    }
    results[auxiliarySuccess ? 'success' : 'failure'] = {
      canonicalSnapshot: result.snapshot,
      allocationAudit: result.allocationAudit,
      densityCellCount: result.densityCellCount,
    };
    await context.close();
  }
  assert.deepEqual(results.success, results.failure,
    'auxiliary success/failure must not change the canonical 121-place density allocation');
  console.log('tourism auxiliary sidecar browser: PASS (success/failure canonical 121 audit identical)');
} finally {
  await browser.close();
}
