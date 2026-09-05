// 지시서 실기기 칸의 대체 증거 — iPhone 크기(390×844, DPR 3, 모바일 UA) **에뮬레이션** 캡처 5장.
// 실기기가 아니다. 보고서에는 "에뮬레이션"이라고 적는다. 실소스(S3)로 뜬 화면을 찍는다.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const out = path.resolve(process.env.EARTHUS_V2_MOBILE_OUTPUT || path.join(root, 'output/v2-three-mobile'));
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium, devices } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/v2' || p === '/v2/') p = '/v2-three/index.html';
  if (p.startsWith('/v2/')) p = '/v2-three/' + p.slice(4);
  const f = path.resolve(prototypeRoot, '.' + p);
  if (!f.startsWith(prototypeRoot + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, b) => (e ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(b)));
});
fs.mkdirSync(out, { recursive: true });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR' });
await ctx.addInitScript(() => { try { localStorage.setItem('earthus.myplace', JSON.stringify({ lat: 35.18, lon: 129.08 })); localStorage.setItem('earthus.seen.intro.v1', '1'); } catch (e) { /* 무시 */ } });
const page = await ctx.newPage();
const click = (sel, i = 0) => page.evaluate(([s, k]) => { const el = document.querySelectorAll(s)[k]; if (!el) throw new Error('no ' + s); el.scrollIntoView(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, [sel, i]);
const shot = (name) => page.screenshot({ path: path.join(out, name) });
const log = { emulated: 'Playwright iPhone 13 (390×844, DPR 3, iOS UA) — 실기기 아님', shots: [], ts: new Date().toISOString() };
try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#intel-tab', { timeout: 90000 });
  await page.waitForTimeout(3000);
  // 패널 토글은 셸 초기화 뒤에야 듣는다 — 탭 줄이 보일 때까지 몇 번 더 누른다
  for (let k = 0; k < 6; k++) {
    await click('#intel-tab');
    const ok = await page.waitForSelector('[data-tab="feed"]', { timeout: 5000 }).then(() => true).catch(() => false);
    if (ok) break;
  }
  await page.waitForSelector('[data-tab="feed"]', { timeout: 10000 });
  await click('[data-tab="feed"]');
  const waitFeed = () => page.waitForFunction(() => document.querySelector('#intel-content .feed-item') && !/받는 중/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || ''), null, { timeout: 150000 }).catch(() => {});
  await waitFeed();
  // GDACS(1.7 MB)는 자주 늦는다 — 태풍 카드가 없으면 '재시도'를 두 번까지 누른다
  for (let k = 0; k < 2; k++) {
    const hasTc = await page.evaluate(() => !!document.querySelector('#intel-content .feed-follow'));
    if (hasTc) break;
    const retry = await page.$('[data-action="feed-retry"]');
    if (!retry) break;
    await click('[data-action="feed-retry"]');
    await page.waitForTimeout(3000);
    await waitFeed();
  }
  await shot('1-feed.png'); log.shots.push('1-feed.png');
  const tc = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((it) => it.querySelector('.feed-follow')));
  if (tc >= 0) {
    await click('#intel-content .feed-item', tc);
    await page.waitForSelector('.room-src', { timeout: 90000 }); await page.waitForTimeout(5000);
    await shot('2-event-room.png'); log.shots.push('2-event-room.png');
    await click('[data-tab="scenario"]'); await page.waitForTimeout(600);
    await shot('4-scenario.png'); log.shots.push('4-scenario.png');
  }
  await click('[data-tab="my"]'); await page.waitForTimeout(500);
  const rb = await page.$('[data-action="my-refresh"]'); if (rb) { await click('[data-action="my-refresh"]'); await page.waitForTimeout(9000); }
  await shot('3-my-place.png'); log.shots.push('3-my-place.png');
  await click('#btn-ask'); await page.waitForTimeout(600);
  await shot('5-ask-earth.png'); log.shots.push('5-ask-earth.png');
  log.ok = true;
} catch (e) { log.error = String(e && e.stack || e); try { await shot('failure.png'); } catch { /* 없음 */ } }
finally { fs.writeFileSync(path.join(out, 'capture.json'), JSON.stringify(log, null, 2)); await browser.close(); srv.close(); }
console.log(JSON.stringify({ ok: !!log.ok, shots: log.shots, error: log.error && log.error.split('\n')[0] }));
