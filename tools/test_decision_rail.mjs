import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_AX_URL || 'http://127.0.0.1:8765/prototype/index.html';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function kstStamp(date = new Date()) {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().replace(/[-:T]/g, '').slice(0, 12);
}

const stamp = kstStamp();
const warningSnapshot = {
  source: '기상청 기상특보',
  sourceEn: 'Korea Meteorological Administration weather warnings',
  license: '공공누리 제1유형',
  generated: stamp,
  observedKst: stamp,
  activeCount: 1,
  kinds: { '호우': 1 },
  note: { ko: '기상청 공식 발표를 따르세요.', en: 'Follow official KMA notices.' },
  active: [{
    regionId: 'L1100000', region: '서울특별시', kind: '호우', kindEn: 'Heavy rain',
    level: '경보', levelRank: 2, color: '#ff5d5d', icon: '☔',
    effectiveKst: stamp, issuedKst: stamp,
  }],
};
const zoneSnapshot = {
  generated: stamp,
  stations: [{ name: '서울', lat: 37.5665, lon: 126.978, zone: 'L1100000', zoneName: '서울특별시' }],
};
const kmaForecastSnapshot = {
  source: '기상청 단기예보', sourceEn: 'KMA short-range forecast', license: '공공누리 제1유형',
  points: [{
    name: '서울', lat: 37.5665, lon: 126.978, baseKst: stamp,
    hourly: [
      { tm: stamp, t: 28, reh: 78, ws: 2.4, pop: 60, sky: 4, pty: 1 },
      { tm: String(Number(stamp) + 100).padStart(12, '0'), t: 27, reh: 82, ws: 2.8, pop: 80, sky: 4, pty: 1 },
    ],
  }],
};
const weatherSnapshot = {
  timezone_abbreviation: 'KST',
  current: {
    time: '2026-08-15T01:00', temperature_2m: 27.6, apparent_temperature: 30.4,
    relative_humidity_2m: 79, precipitation: 0.8, weather_code: 61,
    surface_pressure: 1006, wind_speed_10m: 8.2, wind_direction_10m: 180, is_day: 0,
  },
  hourly: {
    time: Array.from({ length: 13 }, (_, i) => `2026-08-15T${String(i + 1).padStart(2, '0')}:00`),
    precipitation_probability: [60, 80, 70, 50, 30, 20, 10, 10, 20, 20, 30, 40, 40],
    precipitation: [0.8, 1.2, 0.8, 0.4, 0.2, 0, 0, 0, 0, 0, 0.1, 0.2, 0.2],
    weather_code: Array(13).fill(61), temperature_2m: Array(13).fill(27),
  },
  daily: {
    time: Array.from({ length: 7 }, (_, i) => `2026-08-${String(15 + i).padStart(2, '0')}`),
    weather_code: Array(7).fill(61), temperature_2m_max: Array(7).fill(31),
    temperature_2m_min: Array(7).fill(24), precipitation_sum: Array(7).fill(4),
    precipitation_probability_max: Array(7).fill(80),
    sunrise: Array(7).fill('2026-08-15T05:45'), sunset: Array(7).fill('2026-08-15T19:25'),
  },
};

async function mockWarnings(page) {
  await page.route('**/kma-warn-stations.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(zoneSnapshot),
  }));
  await page.route('**/kma-warn.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(warningSnapshot),
  }));
  await page.route('**/kma-fcst.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(kmaForecastSnapshot),
  }));
  await page.route('**/api.open-meteo.com/v1/forecast*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(weatherSnapshot),
  }));
  /* 육지에도 Marine 최근접 격자가 응답하는 실제 실패 조건을 고정한다. */
  await page.route('**/marine-api.open-meteo.com/v1/marine*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ current: {
      wave_height: 0.4, wave_direction: 20, wave_period: 5.2,
      swell_wave_height: 0.3, swell_wave_direction: 340,
    } }),
  }));
}

async function selectPoint(page, point) {
  await page.waitForFunction(() => !!window.__e?.store);
  await page.evaluate(value => window.__e.store.select({
    id: 'qa-point', kind: 'stations', name: 'QA point',
    lat: value.lat, lon: value.lon, data: { _lazy: true },
  }), point);
}

async function selectBuoyFromMap(page) {
  await page.waitForFunction(() => !!window.__e?.store);
  await page.evaluate(() => {
    const buoy = {
      id: 'buoy-7810215', kind: 'buoy', name: '부이 7810215',
      lat: 21.5, lon: 125.9, _buoyId: '7810215', _ndbc: false,
      _obsAt: '2026-08-14T14:30:00Z',
      _obs: { waterTemp: 29.7, waveHeight: null, wavePeriod: null },
      data: {
        '수온': '29.7°C', '관측소': 'NDBC 7810215',
        '부이 종류': 'DRIFTING BUOYS (GENERIC)',
      },
    };
    /* 실제 지도 클릭 순서: ground 좌표 이벤트가 먼저, 엔티티 선택이 바로 뒤다. */
    document.dispatchEvent(new CustomEvent('earthus:decision-point', {
      detail: { point: { lat: buoy.lat, lon: buoy.lon }, pickedId: buoy.id },
    }));
    window.__e.store.select(buoy);
  });
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    geolocation: { latitude: 48.8566, longitude: 2.3522 },
    permissions: ['geolocation'],
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  const decisionUiRequests = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('request', request => {
    if (/\/decision-ui(?:-model)?\.(?:js|css)(?:\?|$)/.test(request.url())) decisionUiRequests.push(request.url());
  });
  await mockWarnings(page);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#decisionRail[data-ready="true"]').waitFor({ state: 'attached' });

  assert.equal(await page.locator('#decisionRail').isHidden(), true, '첫 Earth에 판단 UI가 노출됐다');
  assert.equal(await page.locator('#consentSheet.up').count(), 0, '게스트 첫 Earth에 약관 동의가 자동 노출됐다');
  assert.equal(await page.locator('#decisionRailHandle').count(), 0, '선택 전 판단 CTA가 DOM에 남았다');
  await page.waitForTimeout(2800);
  assert.equal(await page.locator('#coach.on').count(), 0, '첫 Earth에 코치마크가 자동 노출됐다');
  assert.equal(await page.locator('#decisionUiHost').count(), 0, 'Shadow Decision UI host가 생겼다');
  assert.deepEqual(decisionUiRequests, [], 'Shadow Decision UI asset을 요청했다');

  await selectPoint(page, { lat: 36.327, lon: 128.236 });
  await page.waitForFunction(() => document.getElementById('sheetTitle')?.textContent === '경상북도 구미시');
  assert.equal(await page.locator('#decisionRailPlace').textContent(), '경상북도 구미시');
  assert.match(await page.locator('#decisionRailCoords').textContent(), /geoBoundaries 2020 시·군·구 경계 참조/);
  assert.doesNotMatch(await page.locator('#sheetTitle').textContent(), /부산|북서쪽|150 km/,
    '한국 좌표를 부산 최근접점 거리 문구로 표시했다');
  await page.locator('#sheet').screenshot({ path: '/tmp/earthus-gumi-place.png' });
  await page.locator('#sheetClose').click();
  await page.locator('#sheet').waitFor({ state: 'hidden' });

  await selectPoint(page, { lat: 37.5665, lon: 126.978 });
  await page.locator('#decisionRail[data-safety="danger"]').waitFor({ timeout: 10_000 });
  assert.equal(await page.locator('#sheet.up').count(), 1, '선택 장소 상세 시트가 열리지 않았다');
  assert.equal(await page.locator('#sheet').evaluate(sheet => getComputedStyle(sheet).opacity), '1',
    '장소 상세 시트가 opacity 전환 0에 멈췄다');
  assert.equal(await page.locator('#sheet.is-place-detail').count(), 1, '장소 상세 통합 폭이 적용되지 않았다');
  assert.equal(await page.locator('#decisionRailPanel').isVisible(), true);
  assert.equal(await page.locator('#sheet').evaluate(sheet => sheet.contains(document.getElementById('decisionRail'))), true,
    '활동 판단이 장소 상세 시트 밖에 분리됐다');
  assert.equal(await page.locator('#sheetClose:visible').count(), 1, '통합 시트 닫기 버튼이 하나가 아니다');
  assert.equal(await page.locator('#decisionRailClose').count(), 0, '활동 판단 전용 닫기 버튼이 남았다');
  assert.equal(await page.locator('.dr-axis').count(), 0, '사용자에게 의미 없는 판단 5축이 남았다');
  assert.doesNotMatch(await page.locator('#decisionRail').textContent(), /판단 근거 5축|추천 제한|혼잡 자료 없음|예약 자료 없음/);
  assert.match(await page.locator('#decisionRailSafety').textContent(), /호우 경보 발효 중/);
  assert.equal(await page.locator('#decisionRailSafety').getAttribute('data-safety-status'), null);
  assert.equal(await page.locator('#decisionRailSafety [data-safety-status="DANGER"]').count(), 1);
  await page.waitForFunction(() => document.getElementById('decisionRailWeatherMeta')?.textContent.includes('기상청 5km'));
  assert.match(await page.locator('#decisionRailWeatherTemp').textContent(), /28\.0°C/);
  assert.match(await page.locator('#decisionRailRain').textContent(), /60%/);
  assert.match(await page.locator('#decisionRailNextRain').textContent(), /80%/);
  assert.match(await page.locator('#decisionRailWeatherMeta').textContent(), /기상청 5km 동네예보 · 서울/);
  assert.equal(await page.locator('#sheet .sheet-cta').filter({ hasText: '여기서 잠수' }).count(), 0,
    '한국 육지에 Marine 최근접 격자를 근거로 잠수 버튼을 노출했다');
  assert.doesNotMatch(await page.locator('#sheetRows').textContent(), /파고|파향|파주기|너울/,
    '한국 육지에 가까운 바다의 파랑값을 붙였다');

  await page.locator('[data-activity="STARGAZING"]').click();
  assert.equal(await page.locator('[data-activity="STARGAZING"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#decisionRailActivityTitle').textContent(), /별보기/);
  assert.match(await page.locator('#decisionRailActivitySignals').textContent(), /하늘 상태/);
  assert.match(await page.locator('#decisionRailActivitySignals').textContent(), /12시간 최고 강수확률/);
  assert.match(await page.locator('#decisionRailActivitySignals').textContent(), /습도/);
  assert.equal(await page.locator('[data-activity="WATER"]:visible').count(), 0,
    '육지 지점에 물가 활동을 노출했다');
  const activityLabels = await page.locator('.dr-activity button:visible b').allTextContents();
  assert.deepEqual(activityLabels, ['산책·러닝', '자전거', '등산', '캠핑', '별보기']);

  const targets = await page.locator('.dr-activity button:visible, #decisionRailAsk').evaluateAll(nodes =>
    nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  assert.ok(targets.every(targetItem => targetItem.height >= 44 && targetItem.width >= 44), '44px 터치 표적을 위반했다');

  await page.locator('#sheetClose').click();
  await page.waitForFunction(() => !document.getElementById('sheet').classList.contains('up'));
  await page.locator('#sheet').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#sheet').evaluate(sheet => getComputedStyle(sheet).opacity), '0',
    '장소 상세 시트 닫힘이 opacity 전환 1에 멈췄다');
  assert.equal(await page.locator('#decisionRail').isVisible(), false, '한 번 닫은 뒤 활동 판단이 화면에 남았다');
  await selectPoint(page, { lat: 37.5665, lon: 126.978 });
  await page.locator('#decisionRail[data-safety="danger"]').waitFor({ timeout: 10_000 });

  await page.locator('#decisionRailAsk').click();
  await page.locator('#askSheet.up').waitFor();
  assert.match(await page.locator('.ask-context').textContent(), /선택한 맥락/);
  assert.match(await page.locator('.ask-context').textContent(), /연결 자료: 태풍 · 지진 · 수온 · 기상 관측/);
  await page.locator('.ask-close').click();
  await page.waitForFunction(() => !document.getElementById('askSheet').classList.contains('up'));

  await selectPoint(page, { lat: 35.6762, lon: 139.6503 });
  await page.locator('#decisionRail[data-safety="outside"]').waitFor({ timeout: 5_000 });
  assert.match(await page.locator('#decisionRailSafety').textContent(), /기상청 적용 범위 밖/);

  await selectBuoyFromMap(page);
  await page.locator('#sheet.up').waitFor();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#decisionRail').isVisible(), false,
    '해양 부이를 방문 장소로 오인해 활동 판단을 노출했다');
  assert.equal(await page.locator('#sheet.is-place-detail').count(), 0,
    '해양 부이에 일반 장소 상세 레이아웃을 적용했다');
  assert.match(await page.locator('#sheet').textContent(), /NDBC 7810215/,
    '활동 판단을 숨기면서 부이 관측 정보까지 없앴다');
  assert.equal(await page.locator('.buoy-compare').count(), 1,
    '부이 실측·파랑 모델 대조 카드가 한 장이 아니다');
  await selectBuoyFromMap(page);
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.buoy-compare').count(), 1,
    '같은 부이를 다시 열 때 실측·모델 대조 카드가 중복됐다');
  assert.equal(await page.locator('#decisionRail').isVisible(), false,
    '반복 선택 뒤 해양 부이에 활동 판단이 다시 나타났다');
  assert.deepEqual(runtimeErrors, [], `runtime errors: ${runtimeErrors.join(' | ')}`);
  await selectPoint(page, { lat: 37.5665, lon: 126.978 });
  await page.locator('#decisionRail[data-safety="danger"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  await page.locator('#decisionRailPanel').screenshot({ path: '/tmp/earthus-ax-desktop.png' });

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mockWarnings(mobile);
  await mobile.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await mobile.locator('#decisionRail[data-ready="true"]').waitFor({ state: 'attached' });
  assert.equal(await mobile.locator('#decisionRail').isHidden(), true, '모바일 첫 Earth에 판단 UI가 노출됐다');
  await selectPoint(mobile, { lat: 37.5665, lon: 126.978 });
  await mobile.locator('#decisionRail[data-safety="danger"]').waitFor({ timeout: 10_000 });
  await mobile.locator('[data-activity="HIKING"]').click();
  const layout = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    panel: document.getElementById('sheet').getBoundingClientRect().toJSON(),
  }));
  assert.ok(layout.scrollWidth <= layout.innerWidth, `mobile overflow ${layout.scrollWidth} > ${layout.innerWidth}`);
  assert.ok(layout.panel.left >= 0 && layout.panel.right <= layout.innerWidth, 'mobile panel이 화면 밖으로 나갔다');
  assert.ok(await mobile.locator('.brand-menu-tab').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).pointerEvents === 'none')),
    '펼친 판단 패널 위로 브랜드 손잡이가 남았다');
  await mobile.locator('#decisionRailPanel').screenshot({ path: '/tmp/earthus-ax-mobile.png' });

  const authFlow = await context.newPage();
  await authFlow.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await authFlow.locator('#decisionRail[data-ready="true"]').waitFor({ state: 'attached' });
  await authFlow.evaluate(async () => {
    const [{ auth }, { authConsentIntent }] = await Promise.all([
      import('./js/auth.js'), import('./js/ui-account.js'),
    ]);
    localStorage.removeItem('earthus.consent');
    authConsentIntent.clear();
    auth.user = { id: 'qa-restored-session' };
    auth.profile = { id: 'qa-restored-session', tier: 'free' };
    auth.emit();
  });
  await authFlow.waitForTimeout(100);
  assert.equal(await authFlow.locator('#consentSheet.up').count(), 0,
    '저장 세션 복원을 신규 가입으로 오판해 약관을 자동 노출했다');
  await authFlow.evaluate(async () => {
    const [{ auth }, { authConsentIntent }] = await Promise.all([
      import('./js/auth.js'), import('./js/ui-account.js'),
    ]);
    authConsentIntent.mark();
    auth.emit();
  });
  await authFlow.locator('#consentSheet.up').waitFor({ state: 'visible' });
  assert.equal(await authFlow.locator('#consentSheet.up').count(), 1,
    '명시적 로그인/가입 반환 뒤 약관이 이어지지 않았다');

  console.log(`decision rail AX: PASS (${target})`);
} finally {
  await browser.close();
}
