// PHASE 2 STEP 06 — 운영 성능 측정. 데스크톱 cold/warm, iPhone 13, Pixel 5(Android) 에뮬레이션.
// 헤드리스·소프트웨어 GL 이라 절대값은 실기기보다 느리다. 같은 조건의 기준선(2026-09-05 PHASE 1)과 비교하는 용도.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'output/perf-v2'); fs.mkdirSync(out, { recursive: true });
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium, devices } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
const SITE = process.env.EARTHUS_SITE || 'https://earthus.net';
const R = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v));

async function measure(browser, label, ctxOpts, { warm = false } = {}) {
  const ctx = await browser.newContext({ ...ctxOpts, locale: 'ko-KR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('earthus.seen.intro.v1', '1'); localStorage.setItem('earthus.myplace', JSON.stringify({ lat: 35.18, lon: 129.08 })); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  const net = { requests: 0, bytes: 0, js: 0, css: 0, img: 0, api: 0, failed: 0, s4xx: 0, s5xx: 0 };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('requestfailed', () => { net.failed++; });
  page.on('response', async (r) => {
    net.requests++;
    const st = r.status(); if (st >= 500) net.s5xx++; else if (st >= 400) net.s4xx++;
    let len = +(r.headers()['content-length'] || 0);
    if (!len) { try { len = (await r.body()).length; } catch { len = 0; } }
    net.bytes += len;
    const ct = r.headers()['content-type'] || ''; const u = r.url();
    if (/javascript/.test(ct) || /\.m?js(\?|$)/.test(u)) net.js += len;
    else if (/css/.test(ct)) net.css += len;
    else if (/image/.test(ct) || /\.(png|jpe?g|webp|svg|ktx2?|basis)(\?|$)/.test(u)) net.img += len;
    else if (/json/.test(ct) || /amazonaws|api\//.test(u)) net.api += len;
  });
  const t = {}; const mark = (k, t0) => { t[k] = R(performance.now() - t0); };
  const click = (sel, i = 0) => page.evaluate(([s, k]) => { const el = document.querySelectorAll(s)[k]; if (!el) return false; el.scrollIntoView(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }, [sel, i]);
  const T0 = performance.now();
  if (warm) { await page.goto(`${SITE}/v2/`, { waitUntil: 'load', timeout: 90000 }); await page.waitForSelector('#intel-tab', { timeout: 90000 }).catch(() => {}); await page.waitForTimeout(3000); }
  const t0 = performance.now();
  await page.goto(`${SITE}/v2/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#intel-tab', { timeout: 120000 }); mark('firstEarthShell', t0);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
    return { dns: n.domainLookupEnd - n.domainLookupStart, tcp: n.connectEnd - n.connectStart, tls: n.secureConnectionStart ? n.connectEnd - n.secureConnectionStart : null,
      ttfb: n.responseStart - n.requestStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: paint['first-contentful-paint'] };
  });
  const lcp = await page.evaluate(() => new Promise((res) => { let v = null; try { const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }); po.observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* */ } setTimeout(() => res(v), 800); }));
  for (let k = 0; k < 6; k++) { await click('#intel-tab'); const open = await page.evaluate(() => { const b = document.querySelector('[data-tab="feed"]'); return !!(b && b.getBoundingClientRect().height > 0); }); if (open) break; await page.waitForTimeout(1500); }
  let t1 = performance.now(); await click('[data-tab="feed"]');
  await page.waitForFunction(() => document.querySelector('#intel-content .feed-item'), null, { timeout: 90000 }).catch(() => {}); mark('firstFeed', t1);
  await page.waitForFunction(() => !/받는 중/.test((document.querySelector('#intel-content .feed-note') || {}).textContent || ''), null, { timeout: 60000 }).catch(() => {}); mark('eventListSettled', t1);
  const tcIdx = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((i) => i.querySelector('.feed-follow')));
  if (tcIdx >= 0) { t1 = performance.now(); await click('#intel-content .feed-item', tcIdx); await page.waitForSelector('.room-src', { timeout: 60000 }).catch(() => {}); mark('eventRoom', t1); await click('[data-action="feed-back"]'); await page.waitForTimeout(400); }
  const eqIdx = await page.evaluate(() => [...document.querySelectorAll('#intel-content .feed-item')].findIndex((i) => i.querySelector('.feed-dot.eq')));
  if (eqIdx >= 0) { t1 = performance.now(); await click('#intel-content .feed-item', eqIdx); await page.waitForSelector('.room-src', { timeout: 60000 }).catch(() => {}); mark('earthquakeRoom', t1); await click('[data-action="feed-back"]'); await page.waitForTimeout(400); }
  t1 = performance.now(); await click('[data-tab="my"]'); await click('[data-action="my-refresh"]');
  await page.waitForFunction(() => /내 특보 구역|대응표 조회 불가|확인 실패/.test(document.querySelector('#intel-content').textContent), null, { timeout: 30000 }).catch(() => {}); mark('myPlace', t1);
  t1 = performance.now(); await click('[data-tab="scenario"]'); await page.waitForFunction(() => /가정 실험|기준선/.test(document.querySelector('#intel-content').textContent), null, { timeout: 10000 }).catch(() => {}); mark('whatIf', t1);
  t1 = performance.now(); await click('#btn-ask');
  const asked = await page.evaluate(() => { const q = document.getElementById('ask-q'); const go = document.getElementById('ask-go'); if (!q || !go) return false; q.value = '지금 부산 하늘은 어때?'; go.click(); return true; });
  if (asked) await page.waitForFunction(() => { const s = (document.getElementById('ask-out') || {}).textContent || ''; return s && !/읽는 중|묻는 중/.test(s); }, null, { timeout: 60000 }).catch(() => {});
  mark('earthAsk', t1);
  const result = { label, warm, at: new Date().toISOString(), nav: Object.fromEntries(Object.entries(nav).map(([k, v]) => [k, R(v)])), lcp: R(lcp), timings: t, net: { ...net, bytesMB: +(net.bytes / 1048576).toFixed(2), jsKB: R(net.js / 1024), cssKB: R(net.css / 1024), imgKB: R(net.img / 1024), apiKB: R(net.api / 1024) }, pageErrors: errors.length, total: R(performance.now() - T0) };
  await page.screenshot({ path: path.join(out, `${label}.png`) });
  await ctx.close();
  console.log(JSON.stringify(result));
  return result;
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
try {
  results.push(await measure(browser, 'desktop-cold', { viewport: { width: 1280, height: 800 } }));
  results.push(await measure(browser, 'desktop-warm', { viewport: { width: 1280, height: 800 } }, { warm: true }));
  results.push(await measure(browser, 'iphone13', { ...devices['iPhone 13'] }));
  results.push(await measure(browser, 'pixel5-android', { ...devices['Pixel 5'] }));
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify({ site: SITE, results }, null, 2));
console.log('→ output/perf-v2/perf.json');
