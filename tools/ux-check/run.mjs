// EARTHUS UX 자동 점검 — v1 · v2 를 폰·PC 로 열어 누르고, 겹침·작은 버튼·오류·접근성·LTE 속도를 한 장으로 낸다.
//
// ── 왜 (2026-09-23 PD) ─────────────────────────────────────────────────────────────────────────────
//   "프로젝트가 덩치가 커서 내가 다 테스트하기엔 무리가 있어" — 폰에서 창이 겹치고(09-21 에만 겹침 고침 5건),
//   누르면 엉뚱한 화면이 뜨는 일이 사람이 눌러 봐야 드러났다. 그것을 기계가 매번 같은 방법으로 본다.
//
// ── 무엇을 보나 ────────────────────────────────────────────────────────────────────────────────────
//   ① 화면: 콘솔 오류 · 실패한 요청 · 가로 넘침 · 떠 있는 창끼리 겹침 · 지구가 실제로 보이는 비율
//           · 44px 보다 작은 터치 버튼(폰) · 11px 보다 작은 글씨
//   ② 흐름: 하단 메뉴를 하나씩 눌러 무엇이 열리는지 · (v2) 기온 켠 채 지구를 누르면 지점 카드가 뜨는지
//   ③ axe-core(Deque): WCAG 2 A·AA 접근성 위반
//   ④ Lighthouse(Google): 모바일 · 느린 4G + CPU×4 흉내 — 성능·접근성·모범 사례 점수와 고칠 거리
//
// ── 쓰는 법 ────────────────────────────────────────────────────────────────────────────────────────
//   node tools/ux-check/run.mjs                 # 운영(earthus.net) 전부
//   node tools/ux-check/run.mjs --no-lighthouse # 화면·흐름·axe 만(빠름)
//   UX_BASE=http://127.0.0.1:8777 node tools/ux-check/run.mjs   # 로컬(npm run serve) — v2 는 /v2-three/
//   결과: build/ux-check/<시각>/report.html (캡처가 들어 있는 한 장) · results.json
//
// ⚠️ 읽기만 한다 — 운영 사이트를 열고 누를 뿐 아무것도 올리거나 바꾸지 않는다. 로그인·결제·폼 제출은 하지 않는다.
// ⚠️ 헤드리스 크롬의 WebGL 은 소프트웨어(SwiftShader)라 지구 그리기가 실기기보다 느리다 — 속도 숫자는 Lighthouse 쪽을 본다.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const BASE = (process.env.UX_BASE || 'https://earthus.net').replace(/\/$/, '');
const LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const TARGETS = [
  { id: 'v1', name: 'v1 EARTHUS', url: `${BASE}/` },
  { id: 'v2', name: 'v2 Intelligence', url: LOCAL ? `${BASE}/v2-three/` : `${BASE}/v2/` },
];
const DEVICES = [
  { id: 'phone', name: '폰 402×714', viewport: { width: 402, height: 714 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  { id: 'desktop', name: 'PC 1280×800', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
const STAMP = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');
const OUT = path.resolve('build', 'ux-check', STAMP);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { base: BASE, stamp: STAMP, pages: [], lighthouse: [] };

// 떠 있는 창 · 겹침 · 버튼 · 글씨 · 지구 보이는 비율 — 페이지 안에서 잰다.
const measureInPage = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return null; return r; };
  const label = (el) => (el.id ? `#${el.id}` : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
  // ① 떠 있는 창: position fixed/sticky 이거나 fixed 조상 바로 아래의 큰 상자 — 캔버스·전체 덮개는 뺀다
  const panels = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (el.tagName === 'CANVAS') continue;
    const r = vis(el); if (!r) continue;
    const area = r.width * r.height;
    if (area < 900) continue;                         // 30×30 미만(작은 점·배지)은 창이 아니다
    if (area > vw * vh * 0.92) continue;              // 화면 전체 덮개(스크림·라벨 층)는 겹침 계산에서 뺀다
    if (cs.pointerEvents === 'none' && !el.textContent.trim()) continue;
    panels.push({ el, r, label: label(el), z: cs.zIndex });
  }
  // 바깥 상자만 — 창 안의 fixed 자식은 부모와 겹치는 게 당연하다
  const top = panels.filter((p) => !panels.some((q) => q !== p && q.el.contains(p.el)));
  const overlaps = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
    const a = top[i].r, b = top[j].r;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 4 || h <= 4) continue;
    const inter = w * h, small = Math.min(a.width * a.height, b.width * b.height);
    if (inter / small >= 0.12) overlaps.push({ a: top[i].label, b: top[j].label, pct: Math.round((inter / small) * 100), za: top[i].z, zb: top[j].z });
  }
  // ② 지구가 보이는 비율 — 격자 점마다 맨 위 요소가 캔버스인가
  let globe = 0, total = 0;
  for (let y = 6; y < vh; y += 14) for (let x = 6; x < vw; x += 14) {
    total += 1; const t = document.elementFromPoint(x, y);
    if (t && (t.tagName === 'CANVAS' || t.id === 'cesiumContainer' || t.closest('.cesium-widget'))) globe += 1;
  }
  // ③ 작은 터치 버튼 · ④ 작은 글씨
  const small = [];
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select, summary')) {
    const r = vis(el); if (!r) continue;
    if (r.width < 44 || r.height < 44) small.push({ label: label(el), text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) });
  }
  const tiny = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = vis(el); if (!r) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) tiny.push({ label: label(el), fs, text: el.textContent.trim().slice(0, 30) });
  }
  return {
    panels: top.map((p) => ({ label: p.label, x: Math.round(p.r.left), y: Math.round(p.r.top), w: Math.round(p.r.width), h: Math.round(p.r.height), z: p.z })),
    overlaps, globePct: Math.round((globe / total) * 100),
    overflowX: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0,
    smallTargets: small, smallTargetCount: small.length, tinyText: tiny.slice(0, 40), tinyTextCount: tiny.length,
  };
};

// 로딩 화면: v1 은 #loading.gone · v2 는 #loading.done 으로 걷는다.
// 첫 방문 안내·열린 서랍을 걷는다(메인 화면을 재려고) — 버튼을 누르지 않고 닫기만 한다.
const dismiss = async (page) => {
  await page.evaluate(() => {
    const intro = document.getElementById('intro'); if (intro) intro.classList.remove('show');
    const mp = document.getElementById('menu-panel'); if (mp && mp.classList.contains('open')) mp.querySelector('[data-x]')?.click();
    const intel = document.getElementById('intel'); if (intel && intel.classList.contains('open')) document.getElementById('intel-close')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }).catch(() => {});
  await sleep(900);
};

const shot = async (page, name) => { const f = `${name}.jpg`; await page.screenshot({ path: path.join(OUT, f), type: 'jpeg', quality: 62 }).catch(() => {}); return f; };

async function checkPage(browser, target, device) {
  const ctx = await browser.newContext({ viewport: device.viewport, deviceScaleFactor: device.id === 'phone' ? 2 : 1, isMobile: device.isMobile, hasTouch: device.hasTouch, ...(device.userAgent ? { userAgent: device.userAgent } : {}) });
  const page = await ctx.newPage();
  const console_ = [], pageErrors = [], failed = [];
  page.on('console', (m) => { if (m.type() === 'error') console_.push(m.text().slice(0, 240)); });
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 240)));
  page.on('requestfailed', (r) => { const why = r.failure()?.errorText || ''; if (!/ERR_ABORTED/.test(why)) failed.push({ url: r.url().slice(0, 160), why }); });   // 페이지를 옮기며 끊긴 것은 뺀다
  page.on('response', (r) => { if (r.status() >= 400) failed.push({ url: r.url().slice(0, 160), why: `HTTP ${r.status()}` }); });
  const id = `${target.id}-${device.id}`;
  const rec = { id, target: target.name, device: device.name, url: target.url, shots: {}, flows: [] };
  const t0 = Date.now();
  await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => pageErrors.push('goto: ' + e.message));
  await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.classList.contains('gone') || l.classList.contains('done'); }, null, { timeout: 60000, polling: 250 }).catch(() => {});
  rec.loadingGoneMs = Date.now() - t0;
  await sleep(6000);
  rec.shots.first = await shot(page, `${id}-1-first`);
  await dismiss(page);
  rec.shots.main = await shot(page, `${id}-2-main`);
  rec.layout = await page.evaluate(measureInPage);
  try {
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    rec.axe = ax.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
  } catch (e) { rec.axe = [{ id: 'axe-error', impact: 'n/a', help: e.message, count: 0, targets: [] }]; }

  // ── 흐름: 하단 메뉴 하나씩 ──
  const navSel = target.id === 'v2' ? '#bottom-nav button' : '#menuMain button, #menuMain a';
  const navCount = await page.locator(navSel).count().catch(() => 0);
  let tested = 0;
  for (let i = 0; i < navCount && tested < 10; i++) {
    await dismiss(page);
    const btn = page.locator(navSel).nth(i);
    // 사람이 누를 수 있는 단추만 — 가운데 점을 눌렀을 때 맨 위가 그 단추(또는 그 안)여야 한다.
    //   하단 독에서 옆으로 밀려 잘린 단추는 Playwright 가 '보인다'고 해도 누를 수 없다(1차 점검의 거짓 '확인 필요' 4건).
    const reachable = await btn.evaluate((el) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); }).catch(() => false);
    if (!reachable) continue;
    tested += 1;
    const before = await page.evaluate(measureInPage).catch(() => null);
    const label = ((await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || `#${i}`).replace(/\s+/g, ' ').trim().slice(0, 20);
    const errsBefore = pageErrors.length;
    let clicked = true;
    await btn.click({ timeout: 4000 }).catch(() => { clicked = false; });
    await sleep(1600);
    const after = await page.evaluate(measureInPage).catch(() => null);
    const opened = after && before ? after.panels.filter((p) => !before.panels.some((q) => q.label === p.label)).map((p) => p.label) : [];
    const f = await shot(page, `${id}-nav-${i}`);
    const moved = page.url().split('#')[0].split('?')[0] !== target.url.split('?')[0];
    rec.flows.push({ step: `하단 메뉴 '${label}'`, clicked, opened: moved ? [`→ 다른 페이지 ${page.url().slice(0, 60)}`] : opened, globePct: after?.globePct,
      newErrors: pageErrors.slice(errsBefore), shot: f, overlaps: after?.overlaps || [], ok: clicked && pageErrors.length === errsBefore });
    if (moved) {   // 다른 페이지로 갔으면 돌아와서 다음 단추를 누른다
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await page.waitForFunction(() => { const l = document.getElementById('loading'); return !l || l.classList.contains('gone') || l.classList.contains('done'); }, null, { timeout: 60000, polling: 250 }).catch(() => {});
      await sleep(4000);
    }
  }
  // ── 흐름: (v2) 기온 켠 채 지구를 누르면 지점 카드 ──
  if (target.id === 'v2') {
    await page.goto(`${target.url}?ux=1#v=1&at=36.500,127.500,1.2000,0.000&cloud=obs&live=tempgrid`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await sleep(9000); await dismiss(page);
    const vp = device.viewport;
    await page.mouse.click(Math.round(vp.width * 0.62), Math.round(vp.height * 0.58));
    await sleep(3500);
    const card = await page.evaluate(() => { const c = document.querySelector('.point-card'); const big = c && c.querySelector('.pc-big');
      const tabs = [...document.querySelectorAll('#intel .intel-tabs button[data-tab]')].filter((b) => b.getBoundingClientRect().height > 0).length;
      return { shown: !!c && c.getBoundingClientRect().height > 0, value: big ? big.textContent.trim() : null, visibleTabButtons: tabs }; }).catch(() => ({ shown: false }));
    const f = await shot(page, `${id}-point-card`);
    rec.flows.push({ step: '기온 켠 채 지구 누르기 → 지점 카드', ...card, shot: f, ok: !!card.shown && !!card.value && card.visibleTabButtons === 0 });
  }
  rec.consoleErrors = [...new Set(console_)].slice(0, 30);
  rec.pageErrors = [...new Set(pageErrors)].slice(0, 30);
  rec.failedRequests = failed.filter((f, i, a) => a.findIndex((g) => g.url === f.url) === i).slice(0, 40);
  await ctx.close();
  return rec;
}

async function runLighthouse(url) {
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  const userDataDir = path.join(OUT, 'lh-profile-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(userDataDir, { recursive: true });   // 없으면 chrome-launcher 가 chrome-out.log 를 못 연다(ENOENT)
  const chrome = await chromeLauncher.launch({ chromePath: chromium.executablePath(), userDataDir, chromeFlags: ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // 기본 설정 = 모바일 · 느린 4G(150ms RTT · 1.6Mbps) · CPU×4 흉내(simulate) — 폰 LTE 에서 '오래 걸린다'를 숫자로 본다
    const r = await lighthouse(url, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
    const lhr = r.lhr;
    const m = (k) => lhr.audits[k] && lhr.audits[k].displayValue;
    const opp = Object.values(lhr.audits).filter((a) => a.details && a.details.type === 'opportunity' && a.score !== null && a.score < 0.9)
      .sort((a, b) => (b.details.overallSavingsMs || 0) - (a.details.overallSavingsMs || 0)).slice(0, 8)
      .map((a) => ({ id: a.id, title: a.title, savingsMs: Math.round(a.details.overallSavingsMs || 0), display: a.displayValue || '' }));
    const failedA11y = Object.values(lhr.audits).filter((a) => lhr.categories.accessibility.auditRefs.some((x) => x.id === a.id) && a.score === 0).map((a) => a.title).slice(0, 12);
    writeFileSync(path.join(OUT, `lighthouse-${url.includes('/v2') ? 'v2' : 'v1'}.json`), JSON.stringify(lhr));
    return { url, scores: Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)])),
      metrics: { FCP: m('first-contentful-paint'), LCP: m('largest-contentful-paint'), TBT: m('total-blocking-time'), CLS: m('cumulative-layout-shift'), SI: m('speed-index'), TTI: m('interactive') },
      requests: lhr.audits['network-requests']?.details?.items?.length, totalKB: Math.round((lhr.audits['total-byte-weight']?.numericValue || 0) / 1024),
      opportunities: opp, failedA11y };
  } finally { try { await chrome.kill(); } catch (e) { /* 윈도우: 임시 폴더 지우기 EPERM — 결과는 이미 받았다 */ } }
}

// ── 보고서 ──
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function writeReport() {
  const { readFileSync } = await import('node:fs');
  const img = (f) => { try { return `<img src="data:image/jpeg;base64,${readFileSync(path.join(OUT, f)).toString('base64')}" loading="lazy">`; } catch (e) { return ''; } };
  const sec = [];
  for (const p of results.pages) {
    const L = p.layout || {};
    sec.push(`<section><h2>${esc(p.target)} · ${esc(p.device)}</h2>
<div class="kpis"><div><b>${L.globePct ?? '?'}%</b><span>지구가 보이는 비율</span></div><div><b>${(L.overlaps || []).length}</b><span>창 겹침</span></div>
<div><b>${L.smallTargetCount ?? '?'}</b><span>44px 미만 버튼</span></div><div><b>${L.tinyTextCount ?? '?'}</b><span>11px 미만 글씨</span></div>
<div><b>${(p.axe || []).reduce((n, v) => n + v.count, 0)}</b><span>접근성 위반(axe)</span></div><div><b>${p.pageErrors.length + p.consoleErrors.length}</b><span>JS·콘솔 오류</span></div>
<div><b>${Math.round(p.loadingGoneMs / 100) / 10}s</b><span>로딩 걷힘(참고)</span></div></div>
<div class="shots"><figure>${img(p.shots.first)}<figcaption>처음 연 화면</figcaption></figure><figure>${img(p.shots.main)}<figcaption>안내 닫은 뒤</figcaption></figure></div>
${(L.overlaps || []).length ? `<h3>창 겹침</h3><ul>${L.overlaps.map((o) => `<li><code>${esc(o.a)}</code> ↔ <code>${esc(o.b)}</code> — 작은 쪽의 ${o.pct}% (z ${esc(o.za)} / ${esc(o.zb)})</li>`).join('')}</ul>` : ''}
<h3>떠 있는 창 ${(L.panels || []).length}개</h3><p class="dim">${(L.panels || []).map((q) => `${esc(q.label)} ${q.w}×${q.h}`).join(' · ')}</p>
${L.overflowX ? `<p class="bad">가로 넘침 ${L.overflowX}px</p>` : ''}
<h3>흐름</h3><table><tr><th>동작</th><th>결과</th><th>열린 창</th><th>지구%</th></tr>${p.flows.map((f) => `<tr class="${f.ok ? '' : 'badrow'}"><td>${esc(f.step)}</td><td>${f.ok ? '정상' : '확인 필요'}${f.value ? ` · 값 ${esc(f.value)}` : ''}${f.newErrors && f.newErrors.length ? ` · 오류 ${esc(f.newErrors[0])}` : ''}${f.visibleTabButtons ? ` · 탭 단추 ${f.visibleTabButtons}` : ''}</td><td>${esc((f.opened || []).join(', '))}</td><td>${f.globePct ?? ''}</td></tr>`).join('')}</table>
<div class="shots small">${p.flows.map((f) => `<figure>${img(f.shot)}<figcaption>${esc(f.step)}</figcaption></figure>`).join('')}</div>
${(p.axe || []).length ? `<h3>접근성 위반 (axe · WCAG 2 AA)</h3><ul>${p.axe.map((v) => `<li><b>${esc(v.impact)}</b> ${esc(v.help)} — ${v.count}곳 <span class="dim">${esc(v.targets.join(' | '))}</span></li>`).join('')}</ul>` : ''}
${p.pageErrors.length || p.consoleErrors.length ? `<h3>오류</h3><ul>${[...p.pageErrors, ...p.consoleErrors].slice(0, 12).map((e) => `<li><code>${esc(e)}</code></li>`).join('')}</ul>` : ''}
${p.failedRequests.length ? `<h3>실패한 요청 ${p.failedRequests.length}</h3><ul class="dim">${p.failedRequests.slice(0, 12).map((f) => `<li>${esc(f.why)} ${esc(f.url)}</li>`).join('')}</ul>` : ''}
${L.smallTargetCount ? `<details><summary>44px 미만 버튼 ${L.smallTargetCount}개</summary><p class="dim">${L.smallTargets.slice(0, 40).map((s) => `${esc(s.label)}「${esc(s.text)}」${s.w}×${s.h}`).join(' · ')}</p></details>` : ''}
</section>`);
  }
  const lh = results.lighthouse.map((l) => `<section><h2>Lighthouse · ${esc(l.url)}</h2>${l.error ? `<p class="bad">${esc(l.error)}</p>` : `
<div class="kpis">${Object.entries(l.scores).map(([k, v]) => `<div><b class="${v < 50 ? 'r' : v < 90 ? 'y' : 'g'}">${v}</b><span>${esc({ performance: '성능', accessibility: '접근성', 'best-practices': '모범 사례', seo: 'SEO' }[k] || k)}</span></div>`).join('')}</div>
<p>모바일 · 느린 4G(RTT 150ms · 1.6Mbps) · CPU×4 흉내 — FCP ${esc(l.metrics.FCP)} · LCP ${esc(l.metrics.LCP)} · TBT ${esc(l.metrics.TBT)} · CLS ${esc(l.metrics.CLS)} · 요청 ${l.requests}개 · ${l.totalKB} KB</p>
<h3>고칠 거리(아낄 수 있는 시간 순)</h3><ul>${l.opportunities.map((o) => `<li>${esc(o.title)} — 약 ${(o.savingsMs / 1000).toFixed(1)}초 ${esc(o.display)}</li>`).join('')}</ul>
${l.failedA11y.length ? `<h3>접근성 실패 항목</h3><ul>${l.failedA11y.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`}</section>`).join('');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EARTHUS UX 점검 ${STAMP}</title>
<style>:root{--bg:#0e1116;--fg:#e8edf3;--dim:#8a96a6;--line:#263041}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}h1{font-size:20px}h2{font-size:17px;border-top:1px solid var(--line);padding-top:16px}h3{font-size:14px;margin:14px 0 4px}
.kpis{display:flex;flex-wrap:wrap;gap:8px}.kpis div{background:#161b24;border:1px solid var(--line);border-radius:8px;padding:8px 12px;min-width:92px}.kpis b{display:block;font-size:20px}.kpis span{font-size:12px;color:var(--dim)}
.shots{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.shots figure{margin:0;flex:1 1 200px;max-width:360px}.shots.small figure{max-width:200px}.shots img{width:100%;border:1px solid var(--line);border-radius:6px}
figcaption{font-size:12px;color:var(--dim)}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
.badrow td{color:#ffb4a8}.bad{color:#ff8f7e}.dim{color:var(--dim);font-size:12px}code{font-size:12px}.r{color:#ff7a6b}.y{color:#ffc857}.g{color:#5fd39a}</style></head>
<body><main><h1>EARTHUS UX 자동 점검 · ${esc(STAMP)} KST</h1><p class="dim">대상 ${esc(BASE)} · 읽기만 함(올리거나 바꾸지 않음) · 헤드리스 크롬(WebGL 소프트웨어) — 속도는 Lighthouse 숫자를 볼 것</p>
${lh}${sec.join('')}</main></body></html>`;
  writeFileSync(path.join(OUT, 'report.html'), html);
  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
if (!args.has('--lighthouse-only')) for (const t of TARGETS) for (const d of DEVICES) {
  process.stdout.write(`… ${t.id} ${d.id}\n`);
  try { results.pages.push(await checkPage(browser, t, d)); } catch (e) { results.pages.push({ id: `${t.id}-${d.id}`, target: t.name, device: d.name, error: e.message, shots: {}, flows: [], pageErrors: [e.message], consoleErrors: [], failedRequests: [] }); }
}
await browser.close();
if (!args.has('--no-lighthouse')) for (const t of TARGETS) {
  process.stdout.write(`… lighthouse ${t.id}\n`);
  try { results.lighthouse.push(await runLighthouse(t.url)); } catch (e) { results.lighthouse.push({ url: t.url, error: e.message }); }
}
await writeReport();
console.log(path.join(OUT, 'report.html'));
