#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_TOURISM_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const observed = new Date(Date.now() - 3 * 60_000).toISOString();
const received = new Date().toISOString();
const forecasts = Array.from({ length: 9 }, (_, index) => ({
  at: new Date(Date.now() + (index + 1) * 60 * 60_000).toISOString(),
  level: '여유', rank: 1, populationRange: { min: 5000, max: 5500 },
  sourceType: 'OFFICIAL_FORECAST',
}));
const place = {
  id: 'earthus:tourism:seoul:POI009', code: 'POI009', category: '고궁·문화유산',
  nameKo: '광화문·덕수궁', nameEn: 'Gwanghwamun & Deoksugung Palace',
  state: 'LIVE', stateLabelKo: 'LIVE', reasonCodes: [], observedAgeMinutes: 3,
  position: { lat: 37.5709309, lon: 126.9771868, source: '서울시 주요 121장소 영역' },
  official: { level: '붐빔', rank: 4, message: '서울시 기관 설명',
    populationRange: { min: 40000, max: 42000 }, color: '#ef5a67', replacement: false,
    sourceType: 'OFFICIAL_OBSERVATION' },
  forecast: forecasts,
  flow: { scalarTrend: { state: 'READY', direction: 'INCREASING', perHour: 900,
    relativePerHour: 0.02, flowDirection: null, method: 'robust pairwise median slope', sampleCount: 3 },
    direction: { state: 'UNAVAILABLE', value: null,
      reason: 'OD 또는 이동 경로 근거가 없어 방향 화살표를 만들지 않습니다.' } },
  provenance: { sourceId: 'seoul-citydata-ppltn', sourceName: '서울특별시 실시간 인구데이터',
    sourceUrl: 'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do',
    observedAt: observed, receivedAt: received, schemaVersion: 'earthus.tourism-flow.v1',
    processorVersion: 'tourism-flow-collector.v1', license: '공공누리 제1유형',
    redisplay: '출처표시 · 상업적 이용 및 변경 가능' },
};
const snapshot = {
  schemaVersion: 'earthus.tourism-flow.v1', generatedAt: received, state: 'LIVE',
  provider: { id: 'seoul-citydata-ppltn', mode: 'SAMPLE', endpointClass: 'OFFICIAL_PUBLIC_API' },
  coverage: { available: 1, total: 121, requested: 1, responses: 1, errorCount: 0,
    fullCoverage: false, noteKo: '서울시 샘플 키 범위 · 광화문·덕수궁 1곳만 공식 조회' },
  quality: { live: 1, degraded: 0, stale: 0, unavailable: 0,
    withOfficialForecast: 1, withDirectionEvidence: 0 },
  places: [place], source: { name: '서울특별시 실시간 인구데이터',
    url: 'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do', license: '공공누리 제1유형' },
};
const ktoSummary = {
  schemaVersion: 'earthus.kto-summary.v1', provider: 'KTO', generatedAt: received, state: 'PARTIAL',
  services: {
    concentration: {
      sourceName: '한국관광공사 관광지 집중률 방문자 추이 예측 정보',
      sourceUrl: 'https://www.data.go.kr/data/15128555/openapi.do', updatedAt: received,
      operations: { tatsCnctrRatedList: { state: 'AVAILABLE',
        semanticType: 'RELATIVE_CONCENTRATION_FORECAST', sourceType: 'PROVIDER_FORECAST',
        updatedAt: received, itemCount: 5,
        path: '/tourism/kto/concentration/tatsCnctrRatedList.json' } },
    },
    barrierFree: {
      sourceName: '한국관광공사 무장애 여행 정보',
      sourceUrl: 'https://www.data.go.kr/data/15101897/openapi.do', updatedAt: received,
      operations: { areaBasedSyncList2: { state: 'AVAILABLE',
        semanticType: 'OFFICIAL_BARRIER_FREE_TOURISM_CONTENT', sourceType: 'OFFICIAL_INFORMATION',
        updatedAt: received, itemCount: 20,
        path: '/tourism/kto/barrierFree/areaBasedSyncList2.json' } },
    },
  },
};

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [{ name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.route('**/tourism/seoul-flow.json*', route => route.fulfill({
      status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(snapshot),
    }));
    await page.route('**/tourism/health.json*', route => route.fulfill({
      status: 200, contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ schemaVersion: 'earthus.tourism-health.v1', generatedAt: received,
        state: 'OK', mode: 'SAMPLE', coverage: snapshot.coverage }),
    }));
    await page.route('**/tourism/kto/summary.json*', route => route.fulfill({
      status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(ktoSummary),
    }));
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });

    // 공개 메뉴에서 실제 레이어를 켠다.
    await page.locator('#menuTab').click();
    await page.locator('#menuMain [data-open="earth"]').click();
    const tourismButton = page.locator('#layerStrip [data-id="tourism"]').first();
    await tourismButton.waitFor({ state: 'visible' });
    await tourismButton.click();
    await page.waitForTimeout(1600);
    await page.waitForFunction(async () => {
      const { store } = window.__e;
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-relief-hotfix1', location.href).href);
      return store.isOn('tourism') && tourismFlow.snapshot?.places?.length === 1
        && tourismFlow.ds?.entities?.values?.length === 1 && tourismFlow.ds.show;
    }, null, { timeout: 15_000 });

    const initial = await page.evaluate(async () => {
      const [{ store }, { viewer }, { intro }] = await Promise.all([
        import(new URL('js/store.js', location.href).href),
        import(new URL('js/viewer.js', location.href).href),
        import(new URL('js/intro.js', location.href).href),
      ]);
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-relief-hotfix1', location.href).href);
      const entity = tourismFlow.ds.entities.values[0];
      return { count: tourismFlow.count(), show: tourismFlow.ds.show,
        storeHeight: store.height, cameraHeight: viewer.camera.positionCartographic.height,
        cameraPitchDegrees: Cesium.Math.toDegrees(viewer.camera.pitch), intro: intro._active,
        height: entity.box.dimensions.getValue().z,
        footprint: entity.box.dimensions.getValue().x,
        label: entity.label.text.getValue() };
    });
    assert.equal(initial.count, 1, JSON.stringify(initial));
    assert.equal(initial.show, true);
    assert.ok(initial.cameraHeight <= 28_000,
      `${viewport.name} tourism relief is too far away: ${JSON.stringify(initial)}`);
    assert.ok(initial.cameraPitchDegrees >= -58 && initial.cameraPitchDegrees <= -45,
      `${viewport.name} tourism relief needs an oblique view: ${JSON.stringify(initial)}`);
    assert.ok(initial.height / initial.footprint >= 3,
      `${viewport.name} tourism relief collapsed into flat squares: ${JSON.stringify(initial)}`);
    assert.ok(initial.height / initial.footprint <= 4,
      `${viewport.name} tourism relief became hairline towers: ${JSON.stringify(initial)}`);
    assert.match(initial.label, /LIVE · 붐빔/);
    const mapOverlay = await page.evaluate(() => {
      const node = document.getElementById('tourismMapUi');
      const controls = [...node?.querySelectorAll('[data-tourism-map-time]') || []].map(button => {
        const rect = button.getBoundingClientRect();
        return { pressed: button.getAttribute('aria-pressed'), width: rect.width, height: rect.height };
      });
      return { present: Boolean(node), hidden: node?.getAttribute('aria-hidden'), text: node?.innerText || '', controls };
    });
    assert.equal(mapOverlay.present, true);
    assert.equal(mapOverlay.hidden, 'false');
    assert.match(mapOverlay.text, /서울 관광 흐름/);
    assert.match(mapOverlay.text, /공식 관측/);
    assert.match(mapOverlay.text, /블록 높이·색/);
    assert.match(mapOverlay.text, /고정 표시 셀/);
    assert.equal(mapOverlay.controls.length, place.forecast.length + 1,
      `${viewport.name} map timeline must retain every official forecast timestamp`);
    assert.ok(mapOverlay.controls.every(item => item.width >= 43.9 && item.height >= 43.9),
      `${viewport.name} map time target violation: ${JSON.stringify(mapOverlay.controls)}`);
    await page.screenshot({ path: `/private/tmp/earthus-tourism-relief-${viewport.name}.png` });

    await page.locator('#tourismMapUi [data-tourism-map-time]').nth(1).click();
    const mapForecastLength = await page.evaluate(async () => {
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-relief-hotfix1', location.href).href);
      return tourismFlow.ds.entities.values[0].box.dimensions.getValue().z;
    });
    assert.ok(mapForecastLength / initial.footprint >= 1.5,
      `${viewport.name} forecast relief collapsed into flat squares: ${mapForecastLength}`);

    // 실제 상세 화면을 열고 기관 예측 시각을 누르면 같은 3D 블록이 바뀐다.
    await page.evaluate(async current => {
      const { tourismSheet } = await import(new URL('js/ui-tourism.js?v=20260821-v8p3-1', location.href).href);
      // 지구의 블록을 누르는 것과 같은 바깥 전환: 열린 레이어 메뉴부터 걷는다.
      document.getElementById('menuTab')?.click();
      await tourismSheet.open(current);
    }, place);
    await page.locator('#tourismSheet.up').waitFor();
    await page.locator('#tourismSheet [data-tourism-time]').nth(1).click();
    const forecast = await page.evaluate(async () => {
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-relief-hotfix1', location.href).href);
      const body = document.getElementById('tourismBody');
      return { height: tourismFlow.ds.entities.values[0].box.dimensions.getValue().z,
        text: body.innerText, overflow: document.documentElement.scrollWidth - innerWidth,
        targets: [...body.querySelectorAll('button,a')].map(node => {
          const rect = node.getBoundingClientRect();
          return { text: node.textContent.trim().slice(0, 28), width: rect.width, height: rect.height };
        }) };
    });
    assert.ok(forecast.height / initial.footprint >= 1.5,
      `${viewport.name} sheet forecast relief collapsed into flat squares: ${forecast.height}`);
    assert.match(forecast.text, /공식 예측/);
    assert.match(forecast.text, /운영시간[\s\S]{0,40}입장 가능 여부[\s\S]{0,30}(확인되지 않|없습니다)/);
    assert.match(forecast.text, /1\/121|광화문·덕수궁 1곳만 공식 조회/);
    assert.match(forecast.text, /자료 운영 상태/);
    assert.match(forecast.text, /수집기 OK · SAMPLE/);
    assert.match(forecast.text, /한국관광공사 공식 자료/);
    assert.match(forecast.text, /관광지 상대 집중률 예측/);
    assert.match(forecast.text, /실시간 인구가 아닙니다/);
    assert.match(forecast.text, /공식 무장애 여행 정보[\s\S]{0,80}자료 있음/);
    assert.match(forecast.text, /공식 콘텐츠 ID로 연결되기 전에는 접근 가능 판정을 만들지 않습니다/);
    assert.doesNotMatch(forecast.text, /안전합니다|가도 됩니다|수용 가능/);
    assert.ok(forecast.overflow <= 0, `${viewport.name} horizontal overflow: ${forecast.overflow}`);
    assert.ok(forecast.targets.every(item => item.width >= 43.9 && item.height >= 43.9),
      `${viewport.name} 44px target violation: ${JSON.stringify(forecast.targets.filter(item => item.width < 43.9 || item.height < 43.9))}`);
    await page.locator('#tourismSheet .tf-kto').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/private/tmp/earthus-tourism-kto-${viewport.name}.png` });

    // 레이어 OFF 뒤에는 보이지 않고 추가 provider 요청도 일어나지 않는다.
    await page.evaluate(async () => {
      document.getElementById('tourismSheet')?.classList.remove('up');
      const { store } = await import(new URL('js/store.js', location.href).href);
      store.toggle('tourism');
    });
    const off = await page.evaluate(async () => {
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-relief-hotfix1', location.href).href);
      return { show: tourismFlow.ds.show, count: tourismFlow.count(), abort: tourismFlow._abort };
    });
    assert.deepEqual(off, { show: false, count: 0, abort: null });
    assert.equal(await page.locator('#tourismMapUi').getAttribute('aria-hidden'), 'true');
    assert.deepEqual(runtimeErrors, []);
    await page.screenshot({ path: `/private/tmp/earthus-tourism-flow-${viewport.name}.png`, fullPage: true });
    await context.close();
    console.log(`${viewport.name}: Tourism flow PASS`);
  }
} finally {
  await browser.close();
}
