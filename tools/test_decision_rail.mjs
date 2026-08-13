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

async function mockWarnings(page) {
  await page.route('**/kma-warn-stations.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(zoneSnapshot),
  }));
  await page.route('**/kma-warn.json*', route => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(warningSnapshot),
  }));
}

async function selectPoint(page, point) {
  await page.evaluate(value => document.dispatchEvent(new CustomEvent('earthus:decision-point', {
    detail: { point: value },
  })), point);
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    geolocation: { latitude: 48.8566, longitude: 2.3522 },
    permissions: ['geolocation'],
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => localStorage.setItem('earthus.coachDone', '1'));
  const page = await context.newPage();
  const runtimeErrors = [];
  const decisionUiRequests = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('request', request => {
    if (/\/decision-ui(?:-model)?\.(?:js|css)(?:\?|$)/.test(request.url())) decisionUiRequests.push(request.url());
  });
  await mockWarnings(page);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#decisionRail[data-ready="true"] #decisionRailHandle').waitFor({ state: 'visible' });

  assert.equal(await page.locator('#decisionRailHandleTitle').textContent(), '장소를 눌러 조건 확인');
  assert.equal(await page.locator('#decisionRailPanel').isHidden(), true, '첫 Earth에서 판단 패널이 자동으로 펼쳐졌다');
  assert.equal(await page.locator('#decisionUiHost').count(), 0, 'Shadow Decision UI host가 생겼다');
  assert.deepEqual(decisionUiRequests, [], 'Shadow Decision UI asset을 요청했다');

  await selectPoint(page, { lat: 37.5665, lon: 126.978 });
  await page.locator('#decisionRail[data-safety="danger"]').waitFor({ timeout: 10_000 });
  assert.equal(await page.locator('#decisionRailPanel').isVisible(), true);
  assert.equal(await page.locator('.dr-axis').count(), 5, '5축이 아니다');
  assert.equal(await page.locator('.dr-axis').first().getAttribute('class'), 'dr-axis dr-axis--safety');
  assert.match(await page.locator('#decisionRailSafety').textContent(), /공식 특보 우선/);
  assert.match(await page.locator('#decisionRailSafetyState').textContent(), /추천 제한/);
  assert.equal(await page.locator('#decisionRailSafety').getAttribute('data-safety-status'), null);
  assert.equal(await page.locator('#decisionRailSafety [data-safety-status="DANGER"]').count(), 1);

  await page.locator('[data-activity="STARGAZING"]').click();
  assert.equal(await page.locator('[data-activity="STARGAZING"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#decisionRailFitState').textContent(), /공개 전 검증 · 별보기/);
  const outputValues = await page.locator('.dr-axis strong').allTextContents();
  assert.ok(outputValues.every(value => !/^\s*\d+(?:\.\d+)?\s*%?\s*$/.test(value)), '검증 전 점수를 노출했다');

  const targets = await page.locator('.dr-activity button, #decisionRailAsk, #decisionRailClose').evaluateAll(nodes =>
    nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  assert.ok(targets.every(targetItem => targetItem.height >= 44 && targetItem.width >= 44), '44px 터치 표적을 위반했다');

  await page.locator('#decisionRailAsk').click();
  await page.locator('#askSheet.up').waitFor();
  assert.match(await page.locator('.ask-context').textContent(), /선택한 맥락/);
  assert.match(await page.locator('.ask-context').textContent(), /Activity Score를 알고 있는 척 답하지 않습니다/);
  await page.locator('.ask-close').click();
  await page.waitForFunction(() => !document.getElementById('askSheet').classList.contains('up'));

  await selectPoint(page, { lat: 35.6762, lon: 139.6503 });
  await page.locator('#decisionRail[data-safety="outside"]').waitFor({ timeout: 5_000 });
  assert.match(await page.locator('#decisionRailSafetyState').textContent(), /현지 공식 특보 연결 전/);
  assert.match(await page.locator('#decisionRailSafety').textContent(), /기상청 적용 범위 밖/);
  assert.deepEqual(runtimeErrors, [], `runtime errors: ${runtimeErrors.join(' | ')}`);
  await selectPoint(page, { lat: 37.5665, lon: 126.978 });
  await page.locator('#decisionRail[data-safety="danger"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/earthus-ax-desktop.png', fullPage: true });

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mockWarnings(mobile);
  await mobile.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await mobile.locator('#decisionRail[data-ready="true"] #decisionRailHandle').waitFor({ state: 'visible' });
  await selectPoint(mobile, { lat: 37.5665, lon: 126.978 });
  await mobile.locator('#decisionRail[data-safety="danger"]').waitFor({ timeout: 10_000 });
  await mobile.locator('[data-activity="HIKING"]').click();
  const layout = await mobile.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    panel: document.getElementById('decisionRailPanel').getBoundingClientRect().toJSON(),
  }));
  assert.ok(layout.scrollWidth <= layout.innerWidth, `mobile overflow ${layout.scrollWidth} > ${layout.innerWidth}`);
  assert.ok(layout.panel.left >= 0 && layout.panel.right <= layout.innerWidth, 'mobile panel이 화면 밖으로 나갔다');
  assert.ok(await mobile.locator('.brand-menu-tab').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).pointerEvents === 'none')),
    '펼친 판단 패널 위로 브랜드 손잡이가 남았다');
  await mobile.screenshot({ path: '/tmp/earthus-ax-mobile.png', fullPage: true });

  console.log(`decision rail AX: PASS (${target})`);
} finally {
  await browser.close();
}
