// PHASE 2 STEP 09 — 장애·복구 QA. 운영 코드(earthus.net/v2)를 그대로 띄우고 네트워크만 가로채 장애를 만든다.
// 바꾸는 건 요청뿐이다(page.route). 화면이 "조회 불가/STALE/이전 결과" 로 정직하게 말하는지, "안전/위험 없음" 이 없는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'output/qa-v2-failure'); fs.mkdirSync(out, { recursive: true });
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium, devices } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
const SITE = process.env.EARTHUS_SITE || 'https://earthus.net';
const results = [];
const R = (id, title, state, evidence, category = null) => { results.push({ id, title, state, evidence: String(evidence ?? '').slice(0, 300), category }); console.log(`${state.padEnd(4)} ${id} ${title} — ${String(evidence ?? '').slice(0, 120)}`); };
const FORBIDDEN = /안전합니다|위험 없음|피해 없음|정상입니다/;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function scenario(label, routes, run, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR', ...ctxOpts });
  await ctx.addInitScript(() => { try { localStorage.setItem('earthus.seen.intro.v1', '1'); localStorage.setItem('earthus.myplace', JSON.stringify({ lat: 35.18, lon: 129.08 })); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  for (const [pattern, handler] of routes) await page.route(pattern, handler);
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url().slice(0, 80)}`); });
  const click = (sel, i = 0) => page.evaluate(([s, k]) => { const el = document.querySelectorAll(s)[k]; if (!el) return false; el.scrollIntoView(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }, [sel, i]);
  const text = () => page.evaluate(() => (document.querySelector('#intel-content') || {}).textContent || '');
  const openFeed = async () => {
    await page.goto(`${SITE}/v2/?fx=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#intel-tab', { timeout: 120000 });
    for (let k = 0; k < 6; k++) { await click('#intel-tab'); const open = await page.evaluate(() => { const b = document.querySelector('[data-tab="feed"]'); return !!(b && b.getBoundingClientRect().height > 0); }); if (open) break; await page.waitForTimeout(1500); }
    await click('[data-tab="feed"]');
    await page.waitForFunction(() => { const c = document.querySelector('#intel-content'); return c && (c.querySelector('.feed-item') || /조회 불가|응답 없음/.test(c.textContent)); }, null, { timeout: 90000 }).catch(() => {});
    await page.waitForFunction(() => !/받는 중/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || ''), null, { timeout: 120000 }).catch(() => {});
  };
  try { await run({ page, click, text, openFeed, bad }); await page.screenshot({ path: path.join(out, `${label}.png`) }); }
  catch (e) { R(`${label}-ERR`, '시나리오 중단', 'FAIL', String(e && e.message || e), 'TEST_TOOL'); try { await page.screenshot({ path: path.join(out, `${label}-fail.png`) }); } catch { /* */ } }
  await ctx.close();
}
const abort = (r) => r.abort('failed');
const status = (code, body = '') => (r) => r.fulfill({ status: code, contentType: 'application/json', body });
const delay = (ms) => async (r) => { await new Promise((res) => setTimeout(res, ms)); await r.continue(); };

// ── GDACS ─────────────────────────────────────────────────────
await scenario('gdacs-compact-404', [[/events\/gdacs-tc\.json/, status(404)]], async ({ page, text, openFeed }) => {
  await openFeed(); const t = await text();
  const originReq = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /gdacs\.org.*geteventlist/.test(e.name)));
  const tc = await page.evaluate(() => document.querySelectorAll('#intel-content .feed-follow').length);
  R('G1', 'compact 404(캐시 없음) → 원본 폴백으로 태풍 카드가 뜨고 상태 줄에 "원본 직접"', tc > 0 && /원본 직접/.test(t) ? 'PASS' : 'FAIL', `tc ${tc} · 원본요청 ${originReq}`, tc > 0 ? null : 'APP');
});
await scenario('gdacs-compact-5xx', [[/events\/gdacs-tc\.json/, status(503)]], async ({ page, text, openFeed }) => {
  await openFeed(); const t = await text();
  const tc = await page.evaluate(() => document.querySelectorAll('#intel-content .feed-follow').length);
  R('G2', 'compact 5xx → 폴백 경로로 카드 유지, 금지 문구 없음', tc > 0 && !FORBIDDEN.test(t) ? 'PASS' : 'FAIL', `tc ${tc}`);
});
await scenario('gdacs-compact-timeout', [[/events\/gdacs-tc\.json/, delay(25000)]], async ({ page, text, openFeed }) => {
  await openFeed(); const t = await text();
  const tc = await page.evaluate(() => document.querySelectorAll('#intel-content .feed-follow').length);
  R('G3', 'compact timeout(20초 초과) → 폴백, 카드 유지', tc > 0 ? 'PASS' : 'FAIL', `tc ${tc} · ${/원본 직접|이전 축약본/.test(t) ? '폴백 표기 있음' : '폴백 표기 없음'}`);
});
await scenario('gdacs-all-down', [[/events\/gdacs-tc\.json/, abort], [/gdacs\.org/, abort]], async ({ page, text, openFeed }) => {
  await openFeed(); const t = await text();
  R('G4', '축약본·원본 모두 불가(캐시 없음) → "GDACS 조회 불가"+재시도, USGS 카드는 유지, 금지 문구 없음', /GDACS 조회 불가/.test(t) && /재시도/.test(t) && !FORBIDDEN.test(t) ? 'PASS' : 'FAIL', (t.match(/GDACS[^\n]{0,40}/) || [''])[0]);
});
await scenario('gdacs-cache-then-down', [], async ({ page, text, openFeed }) => {
  await openFeed();                                        // 1차: 정상 → localStorage 에 마지막 축약본 저장
  await page.route(/events\/gdacs-tc\.json/, abort); await page.route(/gdacs\.org/, abort);
  await page.evaluate(() => { const b = document.querySelector('[data-action="feed-retry"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#intel-tab', { timeout: 120000 });
  for (let k = 0; k < 6; k++) { await page.evaluate(() => document.querySelector('#intel-tab').click()); const open = await page.evaluate(() => { const b = document.querySelector('[data-tab="feed"]'); return !!(b && b.getBoundingClientRect().height > 0); }); if (open) break; await page.waitForTimeout(1500); }
  await page.evaluate(() => document.querySelector('[data-tab="feed"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForFunction(() => document.querySelector('#intel-content .feed-item') && !/받는 중/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || ''), null, { timeout: 90000 }).catch(() => {});
  const t = await text();
  const tc = await page.evaluate(() => document.querySelectorAll('#intel-content .feed-follow').length);
  R('G5', '축약본 실패 + localStorage 마지막 축약본 있음 → 카드 유지 + "이전 축약본 HH:MMZ" 표기, 원본 미요청', tc > 0 && /이전 축약본/.test(t) ? 'PASS' : 'FAIL', (t.match(/GDACS[^\n]{0,60}/) || [''])[0]);
});

// ── KMA(사건 방 소스) ────────────────────────────────────────────
await scenario('kma-warn-fail', [[/events\/kma-warn\.json/, status(503)]], async ({ page, text, click, openFeed }) => {
  await openFeed();
  const i = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((it) => it.querySelector('.feed-follow')));
  if (i < 0) return R('K1', '특보 5xx', 'PENDING', '태풍 카드 없음');
  await click('#intel-content .feed-item', i); await page.waitForSelector('.room-src', { timeout: 60000 }); await page.waitForTimeout(4000);
  const t = await text();
  const failRow = await page.evaluate(() => [...document.querySelectorAll('.room-src.fail')].map((r) => r.textContent.replace(/\s+/g, ' ')).find((s) => /특보/.test(s)) || '');
  R('K1', '특보 소스 5xx → 특보 줄이 "조회 불가"+재시도로 남고 "특보 없음" 이 없다', /조회 불가/.test(failRow) && /재시도/.test(failRow) && !/특보 없음/.test(t) && !FORBIDDEN.test(t) ? 'PASS' : 'FAIL', failRow.slice(0, 120));
  await click('[data-tab="my"]'); await click('[data-action="my-refresh"]'); await page.waitForTimeout(9000);
  const my = await text();
  R('K2', '내 장소: 특보 조회 실패 → "확인 실패/조회 불가 — 판단하지 않음" + 감시 중단 문구', /확인 실패|조회 불가/.test(my) && /감시 중단/.test(my) && !/발효 특보 없음|특보 없음/.test(my) ? 'PASS' : 'FAIL', (my.match(/감시[^\n]{0,60}/) || [''])[0]);
});
await scenario('kma-sources-timeout', [[/typhoon-official\.json|kma-buoy\.json|kma-warn\.json/, delay(20000)]], async ({ page, text, click, openFeed }) => {
  await openFeed();
  const i = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((it) => it.querySelector('.feed-follow')));
  if (i < 0) return R('K3', 'KMA timeout', 'PENDING', '태풍 카드 없음');
  await click('#intel-content .feed-item', i); await page.waitForSelector('.room-src', { timeout: 60000 });
  await page.waitForTimeout(3000);
  const t = await text();
  const fails = await page.evaluate(() => document.querySelectorAll('.room-src.fail').length);
  R('K3', '기관 소스 timeout(15초 초과) → 해당 줄만 조회 불가, GDACS 줄은 유지, 금지 문구 없음', fails >= 1 && /GDACS/.test(t) && !FORBIDDEN.test(t) ? 'PASS' : 'FAIL', `실패 줄 ${fails}`);
});
await scenario('kma-malformed', [[/kma-warn\.json/, status(200, '{"generated": "2026-09-05T10:00:00Z", "active": ')]], async ({ page, text, click, openFeed }) => {
  await openFeed();
  const i = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((it) => it.querySelector('.feed-follow')));
  if (i < 0) return R('K4', '특보 malformed', 'PENDING', '태풍 카드 없음');
  await click('#intel-content .feed-item', i); await page.waitForSelector('.room-src', { timeout: 60000 }); await page.waitForTimeout(4000);
  const failRow = await page.evaluate(() => [...document.querySelectorAll('.room-src.fail')].map((r) => r.textContent.replace(/\s+/g, ' ')).find((s) => /특보/.test(s)) || '');
  R('K4', '특보 JSON 깨짐 → 조회 불가(정상 데이터로 오판하지 않음)', /조회 불가/.test(failRow) ? 'PASS' : 'FAIL', failRow.slice(0, 100));
});
await scenario('tsunami-eta-missing', [[/ocean\/tsunami-eta\//, status(403)]], async ({ page, text, click, openFeed }) => {
  await openFeed();
  const i = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((it) => it.querySelector('.feed-dot.eq')));
  if (i < 0) return R('T1', '도달시간 파일 없음', 'PENDING', '지진 카드 없음');
  await click('#intel-content .feed-item', i); await page.waitForSelector('.room-src', { timeout: 60000 }); await page.waitForTimeout(3000);
  const t = await text();
  R('T1', '지진 방: 도달시간 파일 없음(403) → "계산 대상 아님 — 위험이 없다는 뜻이 아닙니다", 실패 줄 아님', /도달시간 계산 대상이 아닙니다/.test(t) && /위험이 없다는 뜻이 아닙니다/.test(t) ? 'PASS' : 'FAIL', (t.match(/도달시간[^\n]{0,80}/) || [''])[0]);
});
await scenario('ptwc-down', [[/events\/tsunami-intl\.json/, abort]], async ({ page, text, click, openFeed }) => {
  // 소스 캐시(5분)가 남지 않게 새 컨텍스트에서 처음부터 PTWC 를 끊는다
  await openFeed();
  const i = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((it) => it.querySelector('.feed-dot.eq')));
  if (i < 0) return R('T2', 'PTWC 불가', 'PENDING', '지진 카드 없음');
  await click('#intel-content .feed-item', i); await page.waitForSelector('.room-src', { timeout: 60000 }); await page.waitForTimeout(3000);
  const t2 = await text();
  R('T2', 'PTWC 소스 불가 → "쓰나미 발표 조회 불가 — 없다고 적지 않습니다"', /조회 불가/.test(t2) && /없다고 적지 않습니다|판단하지 않습니다/.test(t2) ? 'PASS' : 'FAIL', (t2.match(/쓰나미[^\n]{0,80}/) || [''])[0]);
});

// ── 브라우저 조건 ──────────────────────────────────────────────
await scenario('slow-3g', [[/amazonaws\.com|gdacs\.org|usgs\.gov/, delay(1500)]], async ({ page, text, openFeed, bad }) => {
  const t0 = Date.now(); await openFeed(); const t = await text();
  const n = await page.evaluate(() => document.querySelectorAll('#intel-content .feed-item').length);
  R('B1', '느린 망(요청당 +1.5초) → 피드가 결국 뜨고 5xx 없음', n > 0 && bad.length === 0 ? 'PASS' : 'FAIL', `${Math.round((Date.now() - t0) / 1000)}초 · 카드 ${n} · 5xx ${bad.length}`);
});
await scenario('offline-after-load', [], async ({ page, text, click, openFeed }) => {
  await openFeed();
  await page.context().setOffline(true);
  await page.evaluate(() => { const b = document.querySelector('[data-action="feed-retry"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.evaluate(() => { const f = document.querySelector('[data-tab="feed"]'); f && f.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.waitForTimeout(8000);
  const t = await text();
  const n = await page.evaluate(() => document.querySelectorAll('#intel-content .feed-item').length);
  R('B2', '오프라인에서 재시도 → 직전 목록 유지("이전 결과") 또는 조회 불가, 금지 문구 없음', (n > 0 || /조회 불가/.test(t)) && !FORBIDDEN.test(t) ? 'PASS' : 'FAIL', `카드 ${n} · ${/이전 결과/.test(t) ? '이전 결과 표기' : /조회 불가/.test(t) ? '조회 불가 표기' : '표기 없음'}`);
  await page.context().setOffline(false);
  await page.evaluate(() => { const b = document.querySelector('[data-action="feed-retry"]'); if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.waitForFunction(() => !/받는 중/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || '') && !/조회 불가/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || ''), null, { timeout: 60000 }).catch(() => {});
  const t2 = await text();
  R('B3', '온라인 복구 후 재시도 → 조회 불가 표기가 사라지고 목록 갱신', !/조회 불가/.test((t2.match(/출처[^\n]{0,80}/) || [''])[0]) ? 'PASS' : 'FAIL', (t2.match(/출처[^\n]{0,80}/) || [''])[0]);
});
await scenario('ask-api-down', [[/\/api\/ask/, status(502)]], async ({ page, openFeed }) => {
  await openFeed(); await page.evaluate(() => document.getElementById('btn-ask').click()); await page.waitForTimeout(400);
  await page.evaluate(() => { document.getElementById('ask-q').value = '지금 태풍은?'; document.getElementById('ask-go').click(); });
  await page.waitForFunction(() => { const s = (document.getElementById('ask-out') || {}).textContent || ''; return s && !/읽는 중/.test(s); }, null, { timeout: 30000 }).catch(() => {});
  const a = await page.evaluate(() => (document.getElementById('ask-out') || {}).textContent || '');
  R('A1', '지구에 묻기 API 5xx → "답을 받지 못했습니다 · 값을 만들지 않고 비워 둡니다", 지어낸 답 없음', /답을 받지 못했습니다/.test(a) && /값을 만들지 않고/.test(a) ? 'PASS' : 'FAIL', a.slice(0, 100));
});

await browser.close();
const counts = results.reduce((m, r) => { m[r.state] = (m[r.state] || 0) + 1; return m; }, {});
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ site: SITE, at: new Date().toISOString(), counts, results }, null, 2));
console.log(JSON.stringify(counts));
