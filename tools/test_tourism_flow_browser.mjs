#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_TOURISM_URL || 'http://127.0.0.1:8880/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const localConfig = await readFile(
  new URL('../prototype/js/config.local.example.js', import.meta.url), 'utf8',
);
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
    const consoleErrors = [];
    const failedRequests = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => failedRequests.push(
      `${request.url()} ${request.failure()?.errorText || 'failed'}`,
    ));
    // config.local.js는 의도적으로 git 제외다. 빈 공개 설정의 완전한 실제 구조로 게스트 부팅한다.
    await page.route('**/js/config.local.js', route => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8', body: localConfig,
    }));
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
    try {
      await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
    } catch (error) {
      const state = await page.evaluate(() => ({
        keys: Object.keys(window.__e || {}),
        loading: document.querySelector('#loading .load-text')?.textContent || null,
      }));
      throw new Error(`earthus boot failed: ${runtimeErrors.join(' | ') || error.message} ${JSON.stringify({
        ...state, consoleErrors, failedRequests,
      })}`);
    }
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
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href);
      return store.isOn('tourism') && tourismFlow.snapshot?.places?.length === 1
        && tourismFlow.ds?.entities?.values?.length > 0 && tourismFlow.ds.show;
    }, null, { timeout: 15_000 });

    const initial = await page.evaluate(async () => {
      const [{ store }, { viewer }, { intro }] = await Promise.all([
        import(new URL('js/store.js', location.href).href),
        import(new URL('js/viewer.js', location.href).href),
        import(new URL('js/intro.js', location.href).href),
      ]);
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href);
      const heights = tourismFlow.ds.entities.values.map(entity => entity.box.dimensions.getValue().z);
      return { cellCount: tourismFlow.count(), rawCellCount: tourismFlow.ds.entities.values.length,
        labelCount: tourismFlow.labelDs?.entities?.values?.length ?? 0, tourismOn: store.isOn('tourism'),
        visibleLabelCount: tourismFlow.labelDs?.entities?.values?.filter(entity =>
          entity.label.show.getValue()).length ?? 0,
        show: tourismFlow.ds.show, labelShow: Boolean(tourismFlow.labelDs?.show),
        storeHeight: store.height, cameraHeight: viewer.camera.positionCartographic.height,
        cameraPitchDegrees: Cesium.Math.toDegrees(viewer.camera.pitch), intro: intro._active,
        maxHeight: Math.max(...heights), minHeight: Math.min(...heights),
        cellMeters: tourismFlow.ds.entities.values[0]?._tourismVisual?.cellMeters,
        title: document.querySelector('#tourismMapUi h2')?.textContent?.trim(),
        dominantName: tourismFlow.ds.entities.values[0]?._tourism?.nameKo,
        contributorCount: tourismFlow.ds.entities.values[0]?._tourismContributors?.length };
    });
    initial.runtimeErrors = [...runtimeErrors];
    initial.consoleErrors = [...consoleErrors];
    assert.ok(initial.cellCount >= 9 && initial.cellCount <= 25, JSON.stringify(initial));
    assert.ok(initial.labelCount >= 1 && initial.labelCount <= 12, JSON.stringify(initial));
    assert.ok(initial.visibleLabelCount >= 1 && initial.visibleLabelCount <= initial.labelCount,
      JSON.stringify(initial));
    assert.equal(initial.title, '서울 관광 밀도');
    assert.ok(initial.maxHeight <= 180);
    assert.ok(initial.minHeight >= 12);
    assert.equal(initial.cellMeters, 320);
    assert.equal(initial.show, true);
    assert.equal(initial.labelShow, true);
    assert.equal(initial.dominantName, place.nameKo);
    assert.ok(initial.contributorCount >= 1);
    assert.ok(initial.cameraHeight <= 28_000,
      `${viewport.name} tourism relief is too far away: ${JSON.stringify(initial)}`);
    assert.ok(initial.cameraPitchDegrees >= -58 && initial.cameraPitchDegrees <= -45,
      `${viewport.name} tourism relief needs an oblique view: ${JSON.stringify(initial)}`);
    const lodCells = await page.evaluate(async current => {
      const [{ tourismFlow }, { viewer }] = await Promise.all([
        import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href),
        import(new URL('js/viewer.js', location.href).href),
      ]);
      const observe = height => {
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(current.position.lon, current.position.lat, height),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
        });
        tourismFlow.renderAt(null);
        return tourismFlow.ds.entities.values[0]?._tourismVisual?.cellMeters;
      };
      const district = observe(12_000);
      const detail = observe(3_000);
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(126.89, 37.36, 26_000),
        orientation: { heading: Cesium.Math.toRadians(22), pitch: Cesium.Math.toRadians(-52), roll: 0 },
      });
      tourismFlow.renderAt(null);
      viewer.scene.requestRender();
      return { district, detail };
    }, place);
    assert.deepEqual(lodCells, { district: 170, detail: 95 });
    await page.waitForTimeout(120);
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
    assert.match(mapOverlay.text, /서울 관광 밀도/);
    assert.match(mapOverlay.text, /공식 관측/);
    assert.match(mapOverlay.text, /블록 높이·색/);
    assert.match(mapOverlay.text, /고정 표시 셀/);
    assert.equal(mapOverlay.controls.length, place.forecast.length + 1,
      `${viewport.name} map timeline must retain every official forecast timestamp`);
    assert.ok(mapOverlay.controls.every(item => item.width >= 43.9 && item.height >= 43.9),
      `${viewport.name} map time target violation: ${JSON.stringify(mapOverlay.controls)}`);
    await page.locator('#menuTab').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `/private/tmp/earthus-tourism-relief-${viewport.name}.png` });

    await page.locator('#tourismMapUi [data-tourism-map-time]').nth(1).click();
    const mapForecastLength = await page.evaluate(async () => {
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href);
      return Math.max(...tourismFlow.ds.entities.values.map(entity => entity.box.dimensions.getValue().z));
    });
    assert.ok(mapForecastLength >= 12 && mapForecastLength <= 180,
      `${viewport.name} forecast density height out of range: ${mapForecastLength}`);
    assert.ok(mapForecastLength < initial.maxHeight,
      `${viewport.name} official forecast did not recalculate density: ${mapForecastLength}`);

    // 실제 상세 화면을 열고 기관 예측 시각을 누르면 같은 3D 블록이 바뀐다.
    await page.evaluate(async current => {
      const { tourismSheet } = await import(new URL('js/ui-tourism.js?v=20260821-v8p3-1', location.href).href);
      await tourismSheet.open(current);
    }, place);
    await page.locator('#tourismSheet.up').waitFor();
    await page.locator('#tourismSheet [data-tourism-time]').nth(1).click();
    const forecast = await page.evaluate(async () => {
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href);
      const body = document.getElementById('tourismBody');
      return { height: tourismFlow.ds.entities.values[0].box.dimensions.getValue().z,
        text: body.innerText, overflow: document.documentElement.scrollWidth - innerWidth,
        targets: [...body.querySelectorAll('button,a')].map(node => {
          const rect = node.getBoundingClientRect();
          return { text: node.textContent.trim().slice(0, 28), width: rect.width, height: rect.height };
        }) };
    });
    assert.ok(forecast.height >= 12 && forecast.height <= 180,
      `${viewport.name} sheet forecast density height out of range: ${forecast.height}`);
    assert.ok(forecast.height < initial.maxHeight,
      `${viewport.name} sheet forecast did not recalculate density: ${forecast.height}`);
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
      const { tourismFlow } = await import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href);
      return { show: tourismFlow.ds.show, labelShow: tourismFlow.labelDs.show,
        count: tourismFlow.count(), abort: tourismFlow._abort };
    });
    assert.deepEqual(off, { show: false, labelShow: false, count: 0, abort: null });
    assert.equal(await page.locator('#tourismMapUi').getAttribute('aria-hidden'), 'true');
    assert.deepEqual(runtimeErrors, []);
    await page.screenshot({ path: `/private/tmp/earthus-tourism-flow-${viewport.name}.png`, fullPage: true });
    await context.close();
    console.log(`${viewport.name}: Tourism flow PASS — cells ${initial.cellCount}, labels ${initial.visibleLabelCount}/${initial.labelCount}, heights ${initial.minHeight.toFixed(1)}–${initial.maxHeight.toFixed(1)}m, camera ${Math.round(initial.cameraHeight)}m, overflow ${forecast.overflow}`);
  }
} finally {
  await browser.close();
}
