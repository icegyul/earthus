#!/usr/bin/env node
// 앱(TWA) 준비 — 브라우저 확인 (2026-09-24, 지시서 §3-4 · §3-8-1 · §3-8-2 · D16)
//
//   EARTHUS_NODE_MODULES="<playwright 가 있는 node_modules>" node tools/test_app_readiness_browser.mjs
//   (선택) EARTHUS_TEST_PORT=8733  EARTHUS_ART_DIR=<스크린샷 폴더>
//
// 이 스크립트는 prototype/ 을 로컬 서버로 직접 띄운다(tools/dev_static_server.mjs). 배포·AWS 는 건드리지 않는다.
// ⚠️ prototype/js/config.local.js 가 있어야 v1 이 뜬다 — 없으면 config.local.example.js 를 복사해 둔다(비밀값 없음).
//    결제 판정 확인은 그 파일을 **요청 가로채기**로 바꿔 판매가 열린 상태를 흉내 낸다(파일은 건드리지 않는다).
//
// 결과로 본다:
//   A. 결제 판정 — 일반 탭은 웹 결제 길이 **있고**, 앱 안 네 길(아이콘·알림 새 창·App Link·공유)은 web 이 **없다**.
//      앱 안에서 판매가 열린 구독 시트에는 '앱에서는 결제할 수 없습니다'가 **링크 없이** 뜬다.
//   B. v1 뒤로 — 서랍 열기 → 뒤로 → 닫힘·주소 그대로 / 시트 열기 → 뒤로 → 닫힘 / ✕ 로 닫아도 칸이 안 남음 / 뒤로 → 페이지를 떠남.
//   C. v2 뒤로 — 메뉴 서랍·Intelligence 시트가 같은 규칙. 해시(카메라)가 옛 자리로 돌아가지 않는다.
//   D. 오프라인 — SW 가 붙은 뒤 망을 끊으면 /v2/·/Intelligence/ 가 안내 화면(마지막 연 시각 포함)으로 뜬다.
//   E. kill-switch — 옛 /v2/sw.js 를 등록해 둔 뒤 kill-switch 로 바꾸고 갱신하면 등록이 풀리고 옛 v2 캐시가 지워지며 v1 캐시는 남는다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = process.env.EARTHUS_NODE_MODULES || path.join(REPO, 'node_modules');
const { chromium } = createRequire(nm.endsWith(path.sep) ? nm : nm + path.sep)('playwright');
const PORT = Number(process.env.EARTHUS_TEST_PORT || 8733);
const KS_PORT = PORT + 1;
const BASE = `http://127.0.0.1:${PORT}`;
const KS_BASE = `http://127.0.0.1:${KS_PORT}`;
const ART = process.env.EARTHUS_ART_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'earthus-app-readiness-'));
fs.mkdirSync(ART, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(ART, name) });
const results = [];
const pass = (name, detail = '') => { results.push(name); console.log(`PASS ${name}${detail ? ' — ' + detail : ''}`); };

function startServer(root, port) {
  const child = spawn(process.execPath, [path.join(REPO, 'tools', 'dev_static_server.mjs'), String(port)], {
    env: { ...process.env, EARTHUS_STATIC_ROOT: root, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (String(d).includes('dev server')) resolve(child); });
    child.on('error', reject);
    setTimeout(() => reject(new Error('server start timeout')), 10000);
  });
}

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const salesOpenConfig = () => fs.readFileSync(path.join(REPO, 'prototype', 'js', 'config.local.example.js'), 'utf8')
  .replace("CHECKOUT_URL: '',", "CHECKOUT_URL: 'https://example.invalid/functions/v1/checkout',")
  .replace("MONETIZATION_MODE: 'FREE_OPEN',", "MONETIZATION_MODE: 'PAID',")
  .replace('SALES_OPEN: false,', 'SALES_OPEN: true,')
  .replace('OPEN_METEO_COMMERCIAL_READY: false,', 'OPEN_METEO_COMMERCIAL_READY: true,')
  .replace('GVP_COMMERCIAL_READY: false,', 'GVP_COMMERCIAL_READY: true,')
  .replace(/SHOW_SUBSCRIBE:\s*false,/, 'SHOW_SUBSCRIBE: true,');

async function v1Ready(page) {
  await page.waitForFunction(() => document.querySelector('#menuMain [data-open="earth"]') && window.__e, null, { timeout: 60000 });
  await wait(1500);
}

async function billingState(page) {
  return page.evaluate(async () => {
    const { billing } = await import('/js/billing.js');
    let subscribeError = null;
    try { await billing.subscribe('monthly', 'web'); } catch (e) { subscribeError = e.message; }
    return { route: billing.route(), providers: billing.providers().map((p) => p.key), inApp: billing.inApp(), subscribeError, url: location.href };
  });
}

const serverRoot = path.join(REPO, 'prototype');
if (!fs.existsSync(path.join(serverRoot, 'js', 'config.local.js'))) {
  throw new Error('prototype/js/config.local.js 가 없다 — config.local.example.js 를 복사해 두고 다시 돌린다');
}
const ksRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'earthus-killswitch-'));
const servers = [await startServer(serverRoot, PORT), await startServer(ksRoot, KS_PORT)];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  // ── A. 결제 판정 ────────────────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(PHONE);
    await ctx.route('**/js/config.local.js', (route) => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8', body: salesOpenConfig(),
    }));
    // 일반 탭
    const web = await ctx.newPage();
    await web.goto(`${BASE}/?station=108`, { waitUntil: 'domcontentloaded' });
    await v1Ready(web);
    const w = await billingState(web);
    assert.equal(w.inApp, false);
    assert.equal(w.route, 'web');
    assert.deepEqual(w.providers, ['web'], '일반 탭은 웹 결제가 남아야 한다');
    assert.equal(w.subscribeError, 'NOT_SIGNED_IN', '일반 탭의 web 길은 막히지 않고 로그인 단계까지 간다');
    await web.evaluate(async () => (await import('/js/ui-subscribe.js')).subscribeSheet.open());
    await web.waitForSelector('#subSheet.up');
    const webSheet = await web.locator('#subBody').innerText();
    assert.match(webSheet, /구독하기 · 카드 · 간편결제/);
    await shot(web, 'A-web-tab-subscribe.png');
    pass('A1 일반 탭 — 웹 결제 길 유지', JSON.stringify(w));

    // 앱 아이콘(런처): start_url /?src=twa
    const app = await ctx.newPage();
    await app.goto(`${BASE}/?src=twa`, { waitUntil: 'domcontentloaded' });
    await v1Ready(app);
    const a = await billingState(app);
    assert.equal(a.inApp, true);
    assert.equal(a.route, 'blocked');
    assert.deepEqual(a.providers, []);
    assert.equal(a.subscribeError, 'NOT_AVAILABLE', '앱 안에서 web 을 직접 넘겨도 막힌다');
    assert.ok(!a.url.includes('src=twa'), '표식이 주소에서 지워져야 한다');
    await app.evaluate(async () => (await import('/js/ui-subscribe.js')).subscribeSheet.open());
    await app.waitForSelector('#subSheet.up');
    const box = await app.locator('#subBody .pay-pending').first();
    assert.equal((await box.innerText()).trim(), '앱에서는 결제할 수 없습니다');
    assert.equal(await app.locator('#subBody .pay-pending a').count(), 0, '링크가 없어야 한다');
    assert.equal(await app.locator('#subBody button', { hasText: '카드' }).count(), 0, '토스 단추가 없어야 한다');
    await shot(app, 'A-app-subscribe-blocked.png');
    pass('A2 앱 아이콘 — 토스 없음 · 앱에서는 결제할 수 없습니다(링크 없음)', JSON.stringify(a));

    // 같은 탭 다음 화면(표식 없는 주소) — sessionStorage 로 앱 안이 유지된다
    await app.goto(`${BASE}/?tc=none`, { waitUntil: 'domcontentloaded' });
    await v1Ready(app);
    const a2 = await billingState(app);
    assert.equal(a2.inApp, true);
    assert.equal(a2.route, 'blocked');
    pass('A3 같은 탭 다음 화면 — sessionStorage 로 앱 안 유지');

    // 알림 탭 → clients.openWindow 새 창: sessionStorage 가 비었다. 런처가 붙인 표식만 있다.
    const notif = await ctx.newPage();
    await notif.goto(`${BASE}/?tab=my&event=kma-1&src=twa`, { waitUntil: 'domcontentloaded' });
    await v1Ready(notif);
    const n = await billingState(notif);
    assert.equal(n.inApp, true);
    assert.ok(!n.providers.includes('web'));
    pass('A4 알림 새 창(빈 sessionStorage + 표식) — 앱 안', JSON.stringify(n));

    // 같은 조건에서 표식이 없으면 새 창은 일반 탭이다 — 표식이 꼭 필요한 이유
    const plainNew = await ctx.newPage();
    await plainNew.goto(`${BASE}/?tab=my&event=kma-1`, { waitUntil: 'domcontentloaded' });
    await v1Ready(plainNew);
    assert.equal((await billingState(plainNew)).route, 'web');
    await plainNew.close();

    // App Link — Chrome TWA 는 Digital Goods API 가 있다 → play 길(Phase 2 스텁)
    const link = await ctx.newPage();
    await link.addInitScript(() => { window.getDigitalGoodsService = async () => { throw new Error('stub'); }; });
    await link.goto(`${BASE}/?tc=WP202619&src=twa`, { waitUntil: 'domcontentloaded' });
    await v1Ready(link);
    const l = await billingState(link);
    assert.equal(l.route, 'play');
    assert.deepEqual(l.providers, ['play']);
    const playErr = await link.evaluate(async () => {
      const { billing } = await import('/js/billing.js');
      try { await billing.subscribe('monthly'); return null; } catch (e) { return e.message; }
    });
    assert.equal(playErr, 'NOT_CONFIGURED', 'play 스텁은 시트를 흉내 내지 않고 연결 안 됨을 말한다');
    pass('A5 App Link(Digital Goods 있음) — play 스텁', JSON.stringify(l));

    // 공유 링크 — 삼성 인터넷처럼 Digital Goods 가 없고 네이티브 브리지가 있는 앱
    const share = await ctx.newPage();
    await share.addInitScript(() => { window.AndroidBilling = { purchase: () => {} }; });
    await share.goto(`${BASE}/?station=108&src=twa`, { waitUntil: 'domcontentloaded' });
    await v1Ready(share);
    const s = await billingState(share);
    assert.equal(s.route, 'native');
    assert.deepEqual(s.providers, ['google']);
    pass('A6 공유 링크(네이티브 브리지) — google 길', JSON.stringify(s));
    await ctx.close();
  }

  // ── B. v1 뒤로 ─────────────────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await v1Ready(page);
    const url0 = page.url();
    const len0 = await page.evaluate(() => history.length);
    const menuOpen = () => page.evaluate(() => document.getElementById('menuSub').classList.contains('open'));
    const anyPanel = () => page.evaluate(() => !!document.querySelector('#sheet.up, #settings.up, .sheet-panel.up'));
    const back = async () => { await page.evaluate(() => history.back()); await wait(700); };

    // 서랍 열기 → 뒤로 → 닫힘, 주소 그대로
    await page.click('#menuMain [data-open="earth"]');
    await page.waitForFunction(() => document.getElementById('menuSub').classList.contains('open'));
    await wait(300);
    await shot(page, 'B1-v1-drawer-open.png');
    assert.equal(await page.evaluate(() => history.length), len0 + 1, '서랍을 열면 칸이 하나 생긴다');
    await back();
    assert.equal(await menuOpen(), false, '뒤로 한 번에 서랍이 닫혀야 한다');
    assert.equal(page.url(), url0, '주소가 열기 전과 같아야 한다');
    await shot(page, 'B1-v1-drawer-after-back.png');
    pass('B1 v1 서랍 → 뒤로 → 닫힘 · 주소 그대로');

    // 서랍 열기 → 같은 단추로 닫기(화면에서 닫음) → 표식 칸이 남지 않는다
    await page.click('#menuMain [data-open="earth"]');
    await page.waitForFunction(() => document.getElementById('menuSub').classList.contains('open'));
    await wait(300);
    await page.click('#menuMain [data-open="earth"]');
    await wait(800);
    assert.equal(await menuOpen(), false);
    assert.equal(await page.evaluate(() => !!(history.state && history.state.earthusOverlay)), false, '화면에서 닫으면 표식 칸을 걷는다');
    assert.equal(page.url(), url0);
    pass('B2 v1 서랍 → 화면에서 닫기 → 칸 안 남음');

    // 경보·재난 서랍 → 뒤로
    await page.click('#menuMain [data-open="alert"]');
    await page.waitForFunction(() => document.getElementById('menuSub').classList.contains('open'));
    await wait(300);
    await back();
    assert.equal(await menuOpen(), false);
    assert.equal(page.url(), url0);
    pass('B3 v1 경보 서랍 → 뒤로 → 닫힘');

    // 시트 열기(인공위성) → 뒤로 → 닫힘
    const satBtn = page.locator('#menuMain .mm-item', { hasText: '인공위성' }).first();
    await satBtn.click();
    await page.waitForFunction(() => !!document.querySelector('#sheet.up, #settings.up, .sheet-panel.up'), null, { timeout: 15000 });
    await wait(500);
    await shot(page, 'B4-v1-sheet-open.png');
    await back();
    assert.equal(await anyPanel(), false, '뒤로 한 번에 시트가 닫혀야 한다');
    assert.equal(page.url(), url0);
    await shot(page, 'B4-v1-sheet-after-back.png');
    pass('B4 v1 시트(인공위성) → 뒤로 → 닫힘 · 주소 그대로');

    // 검색 열기 → 뒤로 → 닫힘
    await page.click('#searchBtn');
    await page.waitForFunction(() => document.getElementById('searchBox').classList.contains('on'));
    await wait(300);
    await back();
    assert.equal(await page.evaluate(() => document.getElementById('searchBox').classList.contains('on')), false);
    pass('B5 v1 검색 → 뒤로 → 닫힘');

    // 첫 화면에서 뒤로 → 페이지를 떠난다(앱이면 앱이 끝난다)
    await page.evaluate(() => history.back()).catch(() => { /* 문서를 떠나면 실행 맥락이 사라진다 — 그게 기대한 결과다 */ });
    await page.waitForURL('about:blank', { timeout: 10000 });
    pass('B6 v1 첫 화면에서 뒤로 → 페이지를 떠남', page.url());
    await ctx.close();
  }

  // ── C. v2 뒤로 ─────────────────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/v2-three/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button[data-nav="explore"]', { timeout: 90000 });
    await wait(6000);
    const intro = page.locator('.intro-go');
    if (await intro.count()) { await intro.first().click(); await wait(500); }
    const back = async () => { await page.evaluate(() => history.back()); await wait(900); };
    const panelOpen = () => page.evaluate(() => !!document.getElementById('menu-panel')?.classList.contains('open'));
    const intelOpen = () => page.evaluate(() => !!document.querySelector('#intel')?.classList.contains('open'));
    const marker = () => page.evaluate(() => !!(history.state && history.state.earthusOverlay));
    const lonOf = (h) => Number((/at=[-\d.]+,([-\d.]+)/.exec(h) || [])[1]);
    await wait(1500);

    // 첫 화면: 소개를 닫으면 Intelligence 시트가 스스로 열린다(실측) — 그 시트도 뒤로 한 번에 닫혀야 한다
    if (!(await intelOpen())) {
      await page.click('button[data-nav="feed"]');
      await page.waitForFunction(() => !!document.querySelector('#intel')?.classList.contains('open'), null, { timeout: 15000 });
      await wait(800);
    }
    assert.equal(await marker(), true, '시트가 열리면 표식 칸');
    await shot(page, 'C2-v2-intel-open.png');
    await back();
    assert.equal(await intelOpen(), false, '뒤로 한 번에 Intelligence 시트가 닫혀야 한다');
    await shot(page, 'C2-v2-intel-after-back.png');
    pass('C2 v2 Intelligence 시트 → 뒤로 → 닫힘');

    // 메뉴 서랍 → 뒤로. 지구가 스스로 돌아 해시(카메라)가 계속 바뀐다 — 뒤로 뒤 해시가 **열기 전 칸의 옛 카메라**로
    // 돌아가지 않는지(=hashchange 가 applyLink 로 카메라를 되돌리지 않는지)를 경도로 본다.
    const hashBeforeOpen = await page.evaluate(() => location.hash);
    const len0 = await page.evaluate(() => history.length);
    await page.click('button[data-nav="explore"]');
    await wait(600);
    assert.equal(await panelOpen(), true, '탐색 서랍이 열려야 한다');
    assert.equal(await marker(), true);
    await shot(page, 'C1-v2-menu-open.png');
    await wait(1500);
    const hashBeforeBack = await page.evaluate(() => location.hash);
    await page.evaluate(() => history.back());
    await wait(150);
    const hashAfterBack = await page.evaluate(() => location.hash);
    await wait(1500);
    const hashLater = await page.evaluate(() => location.hash);
    assert.equal(await panelOpen(), false, '뒤로 한 번에 서랍이 닫혀야 한다');
    const [lo, lb, la, ll] = [hashBeforeOpen, hashBeforeBack, hashAfterBack, hashLater].map(lonOf);
    assert.ok(Math.abs(la - lb) <= Math.abs(la - lo), `뒤로 뒤 해시가 옛 카메라로 돌아갔다: open=${lo} beforeBack=${lb} after=${la}`);
    assert.ok(Math.abs(ll - la) <= Math.abs(ll - lo), `뒤로 뒤 카메라가 옛 자리로 날아갔다: after=${la} later=${ll} open=${lo}`);
    await shot(page, 'C1-v2-menu-after-back.png');
    pass('C1 v2 메뉴 서랍 → 뒤로 → 닫힘 · 카메라가 옛 해시로 안 돌아감', `len0=${len0} lon open ${lo} → beforeBack ${lb} → after ${la} → later ${ll}`);

    // 화면에서 닫기 → 칸이 남지 않는다
    await page.click('button[data-nav="explore"]');
    await wait(600);
    await page.click('[data-x]');
    await wait(900);
    assert.equal(await panelOpen(), false);
    assert.equal(await page.evaluate(() => !!(history.state && history.state.earthusOverlay)), false);
    pass('C3 v2 서랍 → ✕ → 칸 안 남음');

    // (2026-09-24 검수) 우상단 검색 서랍 → 뒤로 → 닫힘. 전에는 알리지 않아 뒤로가 앱을 끝냈다.
    const searchOpen = () => page.evaluate(() => !!document.getElementById('search-drawer')?.classList.contains('open'));
    await page.click('#btn-search');
    await wait(600);
    assert.equal(await searchOpen(), true, '검색 서랍이 열려야 한다');
    assert.equal(await marker(), true, '검색 서랍도 표식 칸');
    // LAB 화면처럼 v1 /js/back-close.js(다른 모듈 주소)를 늦게 읽어도 표식 칸이 남아야 한다 — 문서에 한 벌
    const dup = await page.evaluate(async () => {
      const m = await import('/js/back-close.js');
      const same = m.backStack() === window.__earthusBackStack;
      return { same, marker: !!(history.state && history.state.earthusOverlay) };
    });
    assert.deepEqual(dup, { same: true, marker: true }, JSON.stringify(dup));
    await shot(page, 'C5-v2-search-open.png');
    await back();
    assert.equal(await searchOpen(), false, '뒤로 한 번에 검색 서랍이 닫혀야 한다');
    assert.equal(await marker(), false);
    pass('C5 v2 검색 서랍 → 뒤로 → 닫힘 · 두 번째 모듈이 표식을 안 지움');

    await page.evaluate(() => history.back()).catch(() => { /* 문서를 떠나면 실행 맥락이 사라진다 */ });
    await page.waitForURL('about:blank', { timeout: 10000 });
    pass('C4 v2 첫 화면에서 뒤로 → 페이지를 떠남');
    await ctx.close();
  }

  // ── D. 오프라인 ────────────────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.ok(cacheNames.includes('earthus-shell-2026-09-24-offline'), JSON.stringify(cacheNames));
    await ctx.setOffline(true);
    for (const p of ['/v2/', '/Intelligence/']) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded' });
      const text = await page.locator('body').innerText();
      assert.match(text, /인터넷에 연결되어 있지 않습니다/, p);
      assert.match(text, /이 기기에서 마지막으로 연 시각 · \d{4}-\d{2}-\d{2} \d{2}:\d{2} KST/, p);
      assert.equal(await page.evaluate(() => document.querySelector('img.brand').naturalWidth > 0), true, `${p} 로고`);
      await shot(page, `D-offline${p.replace(/\//g, '_')}.png`);
      pass(`D ${p} 오프라인 → 안내 화면`);
    }
    await ctx.setOffline(false);
    await ctx.close();
  }

  // ── E. kill-switch ─────────────────────────────────────────────────────────────────────────────
  {
    const v2 = path.join(ksRoot, 'v2');
    fs.mkdirSync(path.join(v2, 'space', 'skybox', 'earthus-milky-way'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'tools', 'earthus-v53', 'fixtures', 'live-v2-sw-2026-09-23.js'), path.join(v2, 'sw.js'));
    fs.copyFileSync(path.join(REPO, 'tools', 'earthus-v53', 'fixtures', 'live-v2-seo-geo-sw-routes-2026-09-23.js'), path.join(v2, 'seo-geo-sw-routes.js'));
    for (const f of ['index.html', 'intro.html', 'provenance.html']) fs.writeFileSync(path.join(v2, f), `<!doctype html><title>${f}</title><p>${f}</p>`);
    fs.writeFileSync(path.join(v2, 'manifest.webmanifest'), '{}');
    fs.writeFileSync(path.join(v2, 'space', 'skybox', 'earthus-milky-way', 'panorama-2048.28125627e27567e3.webp'), 'x');
    fs.writeFileSync(path.join(ksRoot, 'index.html'), '<!doctype html><title>root</title>');

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${KS_BASE}/v2/index.html`);
    const before = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.register('/v2/sw.js', { scope: '/v2/' });
      await navigator.serviceWorker.ready;
      await new Promise((r) => setTimeout(r, 500));
      const shell = await caches.open('earthus-shell-2026-09-24-offline');
      await shell.put('/index.html', new Response('v1 shell'));
      return { scope: reg.scope, keys: await caches.keys(), regs: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) };
    });
    assert.ok(before.keys.includes('earthus-v2-2026-08-28-device1'), JSON.stringify(before));
    assert.ok(before.regs.some((s) => s.endsWith('/v2/')));
    pass('E1 옛 /v2/sw.js 등록·캐시 재현', JSON.stringify(before));

    // 배포가 하는 일: 같은 주소의 내용을 kill-switch 로 바꾼다
    fs.copyFileSync(path.join(REPO, 'prototype', 'v2-deploy', 'sw.js'), path.join(v2, 'sw.js'));
    fs.copyFileSync(path.join(REPO, 'prototype', 'v2-deploy', 'seo-geo-sw-routes.js'), path.join(v2, 'seo-geo-sw-routes.js'));
    const after = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/v2/');
      try { await reg.update(); } catch (e) { /* 등록이 활성화 중에 풀리면 update 가 거절될 수 있다 */ }
      for (let i = 0; i < 50; i++) {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (!regs.some((r) => r.scope.endsWith('/v2/'))) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      return {
        regs: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
        keys: await caches.keys(),
        shell: await (await (await caches.open('earthus-shell-2026-09-24-offline')).match('/index.html'))?.text(),
      };
    });
    assert.deepEqual(after.regs.filter((s) => s.endsWith('/v2/')), [], '등록이 풀려야 한다');
    assert.equal(after.keys.some((k) => k.startsWith('earthus-v2-')), false, '옛 v2 캐시가 지워져야 한다');
    assert.ok(after.keys.includes('earthus-shell-2026-09-24-offline'), 'v1 캐시는 남아야 한다');
    assert.equal(after.shell, 'v1 shell');
    pass('E2 kill-switch → 등록 해제 · 옛 v2 캐시 삭제 · v1 캐시 유지', JSON.stringify(after));
    await ctx.close();
  }
  console.log(`\nALL PASS (${results.length}) · 스크린샷 ${ART}`);
} finally {
  await browser.close();
  servers.forEach((s) => s.kill());
}
