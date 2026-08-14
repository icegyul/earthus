#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.EARTHUS_TEST_URL || 'http://127.0.0.1:8877/prototype/';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cases = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 900 },
  { name: 'desktop', width: 1280, height: 720 },
];

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
        errors.push(message.text());
      }
    });
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(`${baseUrl}?ocean=hub`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#oceanSheet.up', { timeout: 30_000 });
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const sheet = document.querySelector('#oceanSheet');
      const rect = sheet.getBoundingClientRect();
      const targets = [...sheet.querySelectorAll('.ocean-layer,.ocean-module,.ocean-back')]
        .map(element => { const box = element.getBoundingClientRect(); return { w: box.width, h: box.height }; });
      const close = sheet.querySelector('.tl.close');
      const closeHit = getComputedStyle(close, '::before');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        targets, closeHit: { width: closeHit.width, height: closeHit.height },
        menuEntry: !!document.querySelector('#menuMain [data-act="ocean"]'),
        accessBanner: !!sheet.querySelector('#oceanBody > .ocean-access'),
        freeText: sheet.textContent.includes('지금 모든 사용 가능 기능 무료')
          || sheet.textContent.includes('결제·구독 화면 없음'),
        homeTrust: !!sheet.querySelector('#oceanBody > .ocean-trust')
          || sheet.textContent.includes('출조·입수 가능 여부를 예보하지 않습니다'),
      };
    });
    assert.ok(state.overflow <= 0, `${item.name} horizontal overflow ${state.overflow}`);
    assert.ok(state.rect.left >= 0 && state.rect.right <= item.width + 0.5,
      `${item.name} sheet outside viewport`);
    assert.ok(state.targets.every(target => target.w >= 44 && target.h >= 44),
      `${item.name} has an Ocean target below 44px`);
    assert.deepEqual(state.closeHit, { width: '44px', height: '44px' });
    assert.equal(state.menuEntry, true);
    assert.equal(state.accessBanner, false, `${item.name} Ocean 홈에 무료 안내 박스가 남았다`);
    assert.equal(state.freeText, false, `${item.name} Ocean 홈에 삭제한 무료 안내 문구가 남았다`);
    assert.equal(state.homeTrust, false, `${item.name} Ocean 홈에 삭제한 해명 문단이 남았다`);

    await page.getByRole('button', { name: /My Ocean FREE/ }).click();
    await page.waitForSelector('#oceanBody .ocean-widget-grid');
    assert.equal(await page.locator('#oceanBody').getByText('VESSEL', { exact: true }).count(), 1);
    await page.getByRole('button', { name: /OCEAN 전체/ }).click();
    await page.getByRole('button', { name: /Vessels FREE/ }).click();
    assert.match(await page.locator('#oceanBody').innerText(), /Vessels · FREE/);
    assert.equal(await page.getByRole('link', { name: /실시간 선박 위치 LIVE/ })
      .getAttribute('href'), 'https://mtis.komsa.or.kr/stg/traffic/liveSea');
    assert.equal(await page.getByRole('link', { name: /여객선 위치 · 운항 LIVE/ })
      .getAttribute('target'), '_blank');
    assert.doesNotMatch(await page.locator('#oceanBody').innerText(), /UNAVAILABLE|권리 승인 전/);
    await page.screenshot({ path: `/private/tmp/ocean-vessel-${item.name}.png` });

    await page.getByRole('button', { name: /OCEAN 전체/ }).click();
    await page.getByRole('button', { name: /파고 큰 쪽 파도 평균/ }).click();
    await page.waitForFunction(() => !document.querySelector('#oceanSheet').classList.contains('up'));
    assert.equal(await page.evaluate(async () =>
      (await import(new URL('js/store.js', location.href).href)).store.isOn('wave')), true);

    await page.locator('#menuTab').click();
    await page.locator('#menuMain [data-act="ocean"]').click();
    await page.getByRole('button', { name: /Surf LIVE/ }).click();
    await page.waitForSelector('#sfSheet.up');
    assert.deepEqual(errors, [], `${item.name} console/page errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: `/private/tmp/ocean-public-${item.name}.png`, fullPage: true });
    await page.close();
    console.log(`${item.name}: PASS · overflow ${state.overflow} · Ocean routes and targets verified`);
  }
} finally {
  await browser.close();
}
