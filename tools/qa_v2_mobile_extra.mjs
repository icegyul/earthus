// PHASE 2 STEP 08 — 모바일 추가 검사: 가로 모드, 키보드(입력 포커스), 고정 UI 잘림, 오버플로, Android 에뮬레이션.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'output/qa-v2-mobile'); fs.mkdirSync(out, { recursive: true });
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium, devices } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
const SITE = process.env.EARTHUS_SITE || 'https://earthus.net';
const results = [];
const R = (id, title, pass, evidence) => { const state = pass === null ? 'PENDING' : pass ? 'PASS' : 'FAIL'; results.push({ id, title, state, evidence: String(evidence ?? '').slice(0, 300) }); console.log(`${state.padEnd(7)} ${id} ${title} — ${String(evidence ?? '').slice(0, 120)}`); };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function run(label, device, viewport) {
  const ctx = await browser.newContext({ ...device, ...(viewport ? { viewport } : {}), locale: 'ko-KR' });
  await ctx.addInitScript(() => { try { localStorage.setItem('earthus.seen.intro.v1', '1'); localStorage.setItem('earthus.myplace', JSON.stringify({ lat: 35.18, lon: 129.08 })); } catch (e) { /* */ } });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/v2/?m=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#intel-tab', { timeout: 120000 }); await page.waitForTimeout(2500);
  for (let k = 0; k < 8; k++) { const open = await page.evaluate(() => { const t = document.querySelector('[data-tab="feed"]'); return !!(t && t.getBoundingClientRect().height > 0); }); if (open) break; await page.evaluate(() => { const b = document.querySelector('#intel-tab'); b && b.click(); }); await page.waitForTimeout(2000); }
  const geo = await page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const inView = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left >= -1 && b.right <= vw + 1 && b.top >= -1 && b.bottom <= vh + 1; };
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const small = tabs.filter((t) => Math.min(t.getBoundingClientRect().height, t.getBoundingClientRect().width) < 32).length;
    const fixed = [...document.querySelectorAll('button, [role=button]')].filter((el) => { const cs = getComputedStyle(el); return cs.position === 'fixed' && el.getBoundingClientRect().width > 0; });
    const clipped = fixed.filter((el) => !inView(el)).map((el) => (el.id || el.className || el.textContent).toString().slice(0, 30));
    const body = document.querySelector('#intel-body'); const cs = body ? getComputedStyle(body) : null;
    return { vw, vh, tabs: tabs.length, tabsIn: tabs.filter(inView).length, small, clipped, scrollW: document.documentElement.scrollWidth, panel: body ? { fits: body.getBoundingClientRect().bottom <= vh + 1, ov: cs.overflowY, sh: body.scrollHeight, ch: body.clientHeight } : null };
  });
  R(`${label}-1`, '탭 6개가 화면 안·터치 타깃 ≥32px', geo.tabs >= 6 && geo.tabsIn === geo.tabs && geo.small === 0, `${geo.tabsIn}/${geo.tabs} · 작은 것 ${geo.small} · ${geo.vw}×${geo.vh}`);
  R(`${label}-2`, '가로 스크롤 없음', geo.scrollW <= geo.vw, `scrollWidth ${geo.scrollW}/${geo.vw}`);
  R(`${label}-3`, '고정 UI(버튼)가 잘리지 않음', geo.clipped.length === 0, geo.clipped.join(',') || '0');
  R(`${label}-4`, '패널이 화면 안에서 스크롤', geo.panel && geo.panel.fits && /auto|scroll/.test(geo.panel.ov), geo.panel ? `${geo.panel.ov} ${geo.panel.sh}/${geo.panel.ch} fits=${geo.panel.fits}` : '패널 없음');
  await page.evaluate(() => document.querySelector('[data-tab="feed"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForFunction(() => document.querySelector('#intel-content .feed-item'), null, { timeout: 90000 }).catch(() => {});
  const opened = await page.evaluate(async () => { const it = document.querySelector('#intel-content .feed-item'); if (!it) return null; it.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 4000)); return !!document.querySelector('.room-src'); });
  R(`${label}-5`, '카드 탭 → 사건 방', opened === true, String(opened));
  // 키보드: 지구에 묻기 입력 포커스 → 입력 후 화면 안에 남는가(가상 키보드는 에뮬레이션 불가 → 포커스·값만)
  const ask = await page.evaluate(async () => { const b = document.getElementById('btn-ask'); if (!b) return null; b.click(); await new Promise((r) => setTimeout(r, 400)); const q = document.getElementById('ask-q'); if (!q) return null; q.focus(); q.value = '테스트'; const r = q.getBoundingClientRect(); return { focused: document.activeElement === q, inView: r.top >= 0 && r.bottom <= innerHeight, value: q.value }; });
  R(`${label}-6`, '지구에 묻기 입력창 포커스·입력 가능·화면 안', ask && ask.focused && ask.inView && ask.value === '테스트', JSON.stringify(ask));
  await page.screenshot({ path: path.join(out, `${label}.png`) });
  await ctx.close();
}
try {
  await run('iphone13-portrait', devices['iPhone 13']);
  await run('iphone13-landscape', devices['iPhone 13 landscape']);
  await run('pixel5-android', devices['Pixel 5']);
  await run('pixel5-landscape', devices['Pixel 5 landscape']);
} finally { await browser.close(); }
R('PHYS-1', '실기기 iPhone', null, '기기 없음 — PENDING'); R('PHYS-2', '실기기 Android', null, '기기 없음 — PENDING'); R('KBD', '가상 키보드가 뜬 상태의 레이아웃', null, '에뮬레이션 불가 — PENDING(실기기)');
const counts = results.reduce((m, r) => { m[r.state] = (m[r.state] || 0) + 1; return m; }, {});
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ site: SITE, at: new Date().toISOString(), counts, results }, null, 2));
console.log(JSON.stringify(counts));
