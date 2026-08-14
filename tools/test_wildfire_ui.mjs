import assert from 'node:assert/strict';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_WILDFIRE_URL || 'http://127.0.0.1:8765/prototype/index.html';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => !!window.__e?.store);
  await page.evaluate(() => window.__e.store.select({
    id: 'qa-fire', kind: 'wildfire', name: '1,240 MW', lat: 37.4, lon: 127.1,
    _date: '2026-08-13', _place: true,
    data: {
      _frp: 1240, _note: true,
      '규모': '중간 · 1,240 MW', '화선 길이': '4.2 km',
      '탐지 픽셀': '8개 (고신뢰 6개)', '최근 관측': '2026-08-13 04:10 UTC',
      '위성': 'VIIRS',
    },
  }));
  await page.locator('#sheet.up').waitFor({ state: 'visible' });
  const text = await page.locator('#sheet').innerText();
  assert.equal(text.includes('열점이 모두 산불은 아닙니다'), false, '삭제한 산불 경고문이 남았다');
  assert.equal(text.includes('가스플레어'), false, '삭제한 산불 오탐 설명이 남았다');
  assert.equal(text.includes('불이 없음'), false, '삭제한 탐지 한계 설명이 남았다');
  assert.match(text, /1,240 MW/);
  assert.match(text, /2026-08-13 04:10 UTC/);
  assert.match(text, /VIIRS/);
  console.log(`wildfire UI: PASS (${target})`);
} finally {
  await browser.close();
}
