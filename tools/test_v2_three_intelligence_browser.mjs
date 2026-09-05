// 지시서 G-2 — CI 진입점을 운영 /v2 의 실제 코드(prototype/v2-three)로 재조준한다.
// 예전 tools/test_v2_intelligence_runtime_browser.mjs 는 Cesium FND-017(prototype/v2)을 검사했는데,
// earthus.net/v2 는 v2-three 를 서빙한다. 검사하는 코드와 배포하는 코드가 달랐다.
//
// 검사 항목(지시서 A~D 계약): 사건 탭이 뜨고, 카드에 시각 줄이 있으며, 사건 방의 소스 행이
// OK/EMPTY/FAILED 를 문구로 남기고, 행동 칸이 조회 실패를 "특보 없음"으로 적지 않는다.
// 실제 소스(S3)를 그대로 쓴다 — 스텁을 쓰면 "연결됐다"는 증거가 안 된다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const out = path.resolve(process.env.EARTHUS_V2_INTELLIGENCE_OUTPUT || path.join(root, 'output/v2-three-intelligence'));
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glsl': 'text/plain', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };

const server = () => http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/v2' || p === '/v2/') p = '/v2-three/index.html';
  if (p.startsWith('/v2/')) p = '/v2-three/' + p.slice(4);   // 운영 경로 /v2/* → 저장소 prototype/v2-three/*
  const f = path.resolve(prototypeRoot, '.' + p);
  if (!f.startsWith(prototypeRoot + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, b) => (e ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(b)));
});

fs.mkdirSync(out, { recursive: true });
const srv = server();
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e.message || e)));
const evidence = { ok: false, target: 'prototype/v2-three (served at earthus.net/v2)', checks: {}, timestamp: new Date().toISOString() };
try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#intel-tab', { timeout: 90000 });
  await page.click('#intel-tab');
  await page.waitForSelector('[data-tab="feed"]', { timeout: 30000 });
  await page.click('[data-tab="feed"]');
  // 실제 소스가 도착할 때까지 — 카드가 뜨거나, 소스 상태가 실패로 확정될 때까지
  await page.waitForFunction(() => {
    const c = document.querySelector('#intel-content');
    return c && (c.querySelector('.feed-item') || /조회 불가|unavailable/.test(c.textContent));
  }, null, { timeout: 90000 });
  // GDACS(1.7 MB)가 아직 오는 중이면 기다린다 — 태풍 카드가 있어야 사건 방까지 검사할 수 있다
  await page.waitForFunction(() => !/받는 중|loading/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || ''), null, { timeout: 120000 }).catch(() => {});
  const feed = await page.evaluate(() => {
    const c = document.querySelector('#intel-content');
    const items = [...c.querySelectorAll('.feed-item')];
    return { count: items.length, withTimeLine: items.filter((it) => it.querySelector('.feed-sub')).length,
      firstTc: items.findIndex((it) => it.querySelector('.feed-follow')), note: (c.querySelector('.feed-note') || {}).textContent || '',
      hasSortNote: /정렬|sort/i.test(c.textContent) };
  });
  evidence.checks.feed = feed;
  assert.ok(feed.count > 0 || /조회 불가|unavailable/.test(feed.note), 'FEED_EMPTY_WITHOUT_SOURCE_STATE');
  if (feed.count) assert.equal(feed.withTimeLine, feed.count, 'FEED_CARD_MISSING_TIME_LINE');
  await page.screenshot({ path: path.join(out, 'feed.png') });
  if (feed.firstTc >= 0) {
    // 패널 안 카드는 스크롤 컨테이너 뒤에 있어 Playwright 의 가시성 판정이 자주 막힌다 — 앱이 듣는 click 을 직접 보낸다
    await page.evaluate((i) => { const el = document.querySelectorAll('#intel-content .feed-item')[i]; el.scrollIntoView(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, feed.firstTc);
    await page.waitForSelector('.room-src', { timeout: 90000 });
    await page.waitForTimeout(4000);   // 기관별 행·특보 행이 순차로 채워진다
    const room = await page.evaluate(() => {
      const c = document.querySelector('#intel-content');
      const rows = [...c.querySelectorAll('.room-src')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
      return { rows, text: c.textContent, failRows: c.querySelectorAll('.room-src.fail').length,
        saysNoWarnWithoutCheck: /특보 없음/.test(c.textContent) && /조회 불가/.test(c.textContent) };
    });
    evidence.checks.room = { rowCount: room.rows.length, failRows: room.failRows, rows: room.rows.slice(0, 12) };
    assert.ok(room.rows.length >= 3, `ROOM_SOURCE_ROWS:${room.rows.length}`);
    assert.equal(room.saysNoWarnWithoutCheck, false, 'ACTION_SAYS_NO_WARNING_WHILE_SOURCE_FAILED');
    assert.ok(/발표|issued/.test(room.text) && /수집|retrieved/.test(room.text), 'EVIDENCE_TIME_LINES_MISSING');
    await page.screenshot({ path: path.join(out, 'event-room.png') });
    // 지시서 F — 고른 사건의 최신 공식 +24h 가 기준선이 된다. 없으면 "확인 불가"로 적고 만들지 않는다.
    await page.evaluate(() => document.querySelector('[data-tab="scenario"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(600);
    const sc = await page.evaluate(() => {
      const c = document.querySelector('#intel-content');
      const btn = c.querySelector('[data-action="sim-scenario-event"]');
      if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return { hasBaseline: !!btn, text: c.textContent.slice(0, 300) };
    });
    if (sc.hasBaseline) {
      await page.waitForSelector('#sc-wind', { timeout: 20000 });
      sc.sliders = await page.evaluate(() => ({ wind: !!document.querySelector('#sc-wind'), eye: !!document.querySelector('#sc-eye'),
        badge: (document.querySelector('.badge.model') || {}).textContent || '', record: JSON.parse(localStorage.getItem('earthus.scenario') || '[]').length }));
      assert.ok(sc.sliders.wind && sc.sliders.eye, 'SCENARIO_SLIDERS_MISSING');
      assert.match(sc.sliders.badge, /공식 예보 아님|SCENARIO/, 'SCENARIO_BADGE_MISSING');
      assert.ok(sc.sliders.record >= 1, 'SCENARIO_RECORD_MISSING');
      assert.doesNotMatch(sc.text, /피해|대피/, 'SCENARIO_FORBIDDEN_WORDS');
      await page.screenshot({ path: path.join(out, 'scenario-baseline.png') });
    } else {
      assert.match(sc.text, /기준선.*확인 불가|공식 [+]24h 전망이 아직/, 'SCENARIO_NO_BASELINE_NOT_HONEST');
    }
    evidence.checks.scenario = sc;
  }
  await page.evaluate(() => document.querySelector('[data-tab="my"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(500);
  const my = await page.evaluate(() => document.querySelector('#intel-content').textContent);
  evidence.checks.my = { hasWatchWording: /감시|Watch/.test(my) || /위치|location/i.test(my) };
  evidence.pageErrors = consoleErrors;
  evidence.ok = true;
  evidence.url = page.url();
  evidence.branch = process.env.GITHUB_REF_NAME || null;
  evidence.head = process.env.GITHUB_SHA || null;
} catch (e) {
  evidence.error = String((e && e.stack) || e);
  evidence.pageErrors = consoleErrors;
  try { await page.screenshot({ path: path.join(out, 'failure.png') }); } catch { /* 없음 */ }
} finally {
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(evidence, null, 2));
  await browser.close();
  srv.close();
}
console.log(JSON.stringify({ ok: evidence.ok, checks: evidence.checks, error: evidence.error ? evidence.error.split('\n')[0] : undefined }));
if (!evidence.ok) process.exit(1);
