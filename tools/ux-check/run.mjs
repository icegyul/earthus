// EARTHUS UX 자동 점검 — v1 · v2 를 폰·PC 로 열어 누르고, 겹침·작은 버튼·오류·접근성·LTE 속도를 한 장으로 낸다.
//
// ── 왜 (2026-09-23 PD) ─────────────────────────────────────────────────────────────────────────────
//   "프로젝트가 덩치가 커서 내가 다 테스트하기엔 무리가 있어" — 폰에서 창이 겹치고(09-21 에만 겹침 고침 5건),
//   누르면 엉뚱한 화면이 뜨는 일이 사람이 눌러 봐야 드러났다. 그것을 기계가 매번 같은 방법으로 본다.
//
// ── 무엇을 보나 ────────────────────────────────────────────────────────────────────────────────────
//   ① 화면: 콘솔 오류 · 실패한 요청 · 가로 넘침 · 떠 있는 창끼리 겹침 · 지구가 실제로 보이는 비율
//           · 44px 보다 작은 터치 버튼(폰) · 11px 보다 작은 글씨
//           (2026-09-23) 버튼은 테두리 상자가 아니라 '실제로 눌리는 넓이'(::after 로 넓힌 표적 포함)로 잰다 ·
//           24px 미만은 WCAG 2.5.8 실패로 따로 센다 · 문장 안 링크는 뺀다 · 눈에 안 보이는 것(투명한 부모 안 · inert)은 재지 않는다
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
  // ── (2026-09-23) 1차 점검(09-23)이 낸 오탐을 검사기에서 고친다 — 수정 계획 '검사기 규칙' 1~3 ─────────────────────────
  //   · vis() 는 요소 '자신'의 opacity 만 본다. 그래서 투명한 부모 안의 자식(닫힌 #pop-menu · inert 인 v1 #searchBox ·
  //     #quick-menu · 지도 레이어)이 '보이는 작은 버튼·글씨'로 잡혔다 → 아래 shown() 으로 조상까지 본다.
  //     ⚠️ 이 거름은 ③·④ 에만 건다. axe 에는 걸지 않는다 — axe 가 투명도 0 인 팝업을 그대로 검사했기 때문에
  //        '안 보이는 국가 지표 팝업이 Tab 순서·스크린리더에 남음'(실제 결함, 계획 A1)을 찾았다. ① 창 겹침도 vis() 그대로 둔다.
  //   · 테두리 상자만 재서, ::after 로 표적만 44px 로 넓힌 단추(v2 상단 #btn-search·#btn-share·#btn-research 30×28 ·
  //     #hud-more 12×10 · #ts-now·#ts-play 44×24 — index.html 사고 기록 '보이는 그림은 그대로 두고 표적만 가상요소로 넓힌다')가
  //     작다고 잡혔다 → 가운데에서 상하좌우로 elementFromPoint 를 떠서 '실제로 눌리는 넓이'를 잰다(가상요소를 누르면 그 요소가 잡힌다).
  //     한쪽으로만 번지는 표적(예: 아래로만 넓힌 ::after)도 재도록 한 방향에 48px 까지 본다 — ±20 네 점만 보면 그런 표적을 놓친다.
  //   · v1 크레딧 링크(77×9)는 WCAG 2.5.8 의 '문장 안 링크' 예외다 — 이용 조건상 링크를 없앨 수 없다(ui-source.js:31).
  const opMemo = new Map();
  const opacityUp = (el) => { if (!el) return 1; let o = opMemo.get(el);
    if (o === undefined) { o = (+getComputedStyle(el).opacity) * opacityUp(el.parentElement); opMemo.set(el, o); } return o; };
  const shown = (el) => {
    if (el.closest('[inert]')) return false;                                   // 닫힌 v1 #searchBox 는 inert · opacity 0 이었다
    if (typeof el.checkVisibility === 'function'                               // 새 이름(opacityProperty…)과 옛 이름(checkOpacity…)을 같이 넘긴다
      && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true })) return false;
    return opacityUp(el) >= 0.05;                                              // checkVisibility 는 opacity 가 딱 0 일 때만 거른다 — 사라지는 중(0.01)도 거른다
  };
  // 그 점을 누르면 이 요소가 눌리는가 — 요소 자신·자식·가상요소, 그리고 <label> 로 감싼 입력칸은 글자 자리까지 표적이다
  const mine = (el, x, y) => { if (x < 0 || y < 0 || x >= vw || y >= vh) return false;   // 화면 밖 넓이는 누를 수 없다
    const t = document.elementFromPoint(x, y); if (!t) return false; if (t === el || el.contains(t)) return true;
    const lb = t.closest('label'); return !!lb && lb.control === el; };
  const reach = (el, x, y, dx, dy) => { let n = 0; for (let k = 1; k <= 48; k++) { if (!mine(el, x + dx * k, y + dy * k)) break; n = k; } return n; };
  // 문장 안 링크(WCAG 2.5.8 Inline 예외): display:inline 인 a[href] 이고, 같은 문단(가장 가까운 inline 아닌 조상)에
  //   링크·단추가 아닌 글자가 있을 때만. 링크만 늘어선 줄(메뉴·탭)은 '문장'이 아니다 — 다른 링크·단추 안의 글은 세지 않는다.
  const inSentence = (el) => {
    if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') return false;
    let blk = el.parentElement;
    while (blk && blk !== document.body && /^(inline|contents)/.test(getComputedStyle(blk).display)) blk = blk.parentElement;
    if (!blk || blk === document.body) return false;
    const tw = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); let n = 0;
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const p = t.parentElement; if (!p || p.closest('a[href], button, [role="button"]')) continue;
      n += (t.textContent.match(/[\p{L}\p{N}]/gu) || []).length; if (n >= 2) return true;
    }
    return false;
  };
  const live = [], small = [], coveredSample = [];
  const targetSkips = { hidden: 0, ariaHidden: 0, noPointer: 0, covered: 0, widened: 0, inline: 0 };   // 무엇을 왜 뺐는지 — 뺀 것이 진짜 결함을 가리지 않았는지 사람이 볼 수 있게
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select, summary')) {
    const r = vis(el); if (!r) continue;
    if (!shown(el)) { targetSkips.hidden += 1; continue; }
    if (el.closest('[aria-hidden="true"]')) { targetSkips.ariaHidden += 1; continue; }   // 표적만 — aria-hidden 글씨는 눈에는 보이므로 ④ 에서는 빼지 않는다
    if (getComputedStyle(el).pointerEvents === 'none') { targetSkips.noPointer += 1; continue; }   // 일부러 누를 수 없게 한 것(v1 출처 독 — 지구 조작을 막지 않으려고, app.css:1284)
    const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, vw), y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, vh);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // 가운데를 눌러도 이 요소가 안 잡히면 사람이 누를 수 있는 단추가 아니다(닫힌 창 뒤 · 스크롤로 잘림 · 덮개 아래) — 흐름의 reachable 과 같은 규칙.
    //   ⚠️ 대가: 늘 덮개 아래 깔린 단추는 크기 검사에서 빠진다 → coveredTargets 에 '무엇이 덮었나'를 남겨 사람이 본다.
    if (!mine(el, cx, cy)) { targetSkips.covered += 1; if (coveredSample.length < 12) { const cover = document.elementFromPoint(cx, cy); coveredSample.push(`${label(el)} ← ${cover ? label(cover) : '?'}`); } continue; }
    const t = { el, label: label(el), text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height),
      hitW: Math.round(r.width), hitH: Math.round(r.height), x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
    if (r.width < 44 || r.height < 44) {
      const L = reach(el, cx, cy, -1, 0), R = reach(el, cx, cy, 1, 0), U = reach(el, cx, cy, 0, -1), D = reach(el, cx, cy, 0, 1);
      Object.assign(t, { hitW: L + R + 1, hitH: U + D + 1, x0: cx - L, x1: cx + R + 1, y0: cy - U, y1: cy + D + 1 });
    }
    live.push(t);
    if (t.hitW >= 44 && t.hitH >= 44) { if (r.width < 44 || r.height < 44) targetSkips.widened += 1; continue; }   // ::after 로 넓힌 표적 — 통과
    if (inSentence(el)) { targetSkips.inline += 1; continue; }
    small.push(t);
  }
  // WCAG 2.5.8(AA): 24px 미만은 실패 — 단 '간격 예외': 표적 가운데에 지름 24 원을 놓아 다른 표적(또는 다른 작은 표적의 원)에 닿지 않으면 통과.
  //   (v1 #hudShow 23px 는 주변에 다른 표적이 없어 예외로 넘어간다 — 계획 A18 은 HIG 44 를 채우려는 일이다)
  //   44 미만(HIG·Material 권고)은 경고, 24 미만이면서 간격 예외도 안 되는 것만 '실패'로 따로 센다.
  const under = (t) => t.hitW < 24 || t.hitH < 24;
  for (const t of small) {
    if (!under(t)) { t.wcag = 'ok'; continue; }
    const ux = (t.x0 + t.x1) / 2, uy = (t.y0 + t.y1) / 2;
    const near = live.some((o) => {
      if (o === t || o.el.contains(t.el) || t.el.contains(o.el)) return false;
      const dx = Math.max(o.x0 - ux, 0, ux - o.x1), dy = Math.max(o.y0 - uy, 0, uy - o.y1);
      if (Math.hypot(dx, dy) < 12) return true;
      return under(o) && Math.hypot((o.x0 + o.x1) / 2 - ux, (o.y0 + o.y1) / 2 - uy) < 24;
    });
    t.wcag = near ? 'fail' : 'spacing';
  }
  small.sort((a, b) => (a.wcag === 'fail' ? 0 : 1) - (b.wcag === 'fail' ? 0 : 1) || Math.min(a.hitW, a.hitH) - Math.min(b.hitW, b.hitH));
  const plain = small.map(({ el, x0, x1, y0, y1, ...s }) => s);   // DOM 요소는 page.evaluate 밖으로 못 나간다
  const tiny = [];
  let tinyHidden = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = vis(el); if (!r) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs >= 11) continue;
    // (2026-09-23) 투명한 부모 안 · visibility:hidden · inert — 사람 눈에 안 보이는 글씨는 크기를 따지지 않는다(닫힌 #pop-menu · #quick-menu 안의 글씨 같은 것)
    if (!shown(el)) { tinyHidden += 1; continue; }
    tiny.push({ label: label(el), fs, text: el.textContent.trim().slice(0, 30) });
  }
  return {
    panels: top.map((p) => ({ label: p.label, x: Math.round(p.r.left), y: Math.round(p.r.top), w: Math.round(p.r.width), h: Math.round(p.r.height), z: p.z })),
    overlaps, globePct: Math.round((globe / total) * 100),
    overflowX: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0,
    smallTargets: plain, smallTargetCount: plain.length, tinyText: tiny.slice(0, 40), tinyTextCount: tiny.length,
    wcagTargets: plain.filter((s) => s.wcag === 'fail'), wcagFailCount: plain.filter((s) => s.wcag === 'fail').length,
    targetSkips, coveredTargets: coveredSample, tinyHiddenCount: tinyHidden,
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
      // (2026-09-24 정정) 인텔리전스 시트가 한 장이 되며 .intel-tabs 줄 자체가 없어졌다 — 그 줄 이름에 묶여 세면 무엇이 다시 생겨도 0 이 나온다.
      //   시트 안의 탭 모양 단추를 모두 센다(data-tab 단추 · role=tab).
      const tabs = [...document.querySelectorAll('#intel button[data-tab], #intel [role="tab"]')].filter((b) => b.getBoundingClientRect().height > 0).length;
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
<div><b>${L.smallTargetCount ?? '?'}</b><span>44px 미만 버튼(눌리는 넓이)</span></div><div><b class="${L.wcagFailCount ? 'r' : ''}">${L.wcagFailCount ?? '?'}</b><span>24px 미만(WCAG 실패)</span></div><div><b>${L.tinyTextCount ?? '?'}</b><span>11px 미만 글씨</span></div>
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
${L.wcagFailCount ? `<h3 class="bad">WCAG 2.5.8 실패 — 눌리는 넓이 24px 미만 · 간격 예외도 안 됨 ${L.wcagFailCount}개</h3><p>${L.wcagTargets.slice(0, 20).map((s) => `<code>${esc(s.label)}</code>「${esc(s.text)}」 눌리는 넓이 ${s.hitW}×${s.hitH}`).join(' · ')}</p>` : ''}
${L.smallTargetCount ? `<details><summary>44px 미만 버튼 ${L.smallTargetCount}개 (실제로 눌리는 넓이 기준)</summary><p class="dim">${L.smallTargets.slice(0, 40).map((s) => `${esc(s.label)}「${esc(s.text)}」${s.w}×${s.h}${Math.abs(s.hitW - s.w) > 1 || Math.abs(s.hitH - s.h) > 1 ? ` → 눌리는 넓이 ${s.hitW}×${s.hitH}` : ''}${s.wcag === 'fail' ? ' [WCAG 실패]' : s.wcag === 'spacing' ? ' [24 미만 · 간격 예외]' : ''}`).join(' · ')}</p></details>` : ''}
${L.targetSkips ? `<p class="dim">버튼 검사에서 뺀 것 — 안 보임(투명한 부모 안·inert) ${L.targetSkips.hidden} · aria-hidden ${L.targetSkips.ariaHidden} · pointer-events:none ${L.targetSkips.noPointer} · 가운데가 덮임 ${L.targetSkips.covered} · ::after 로 넓혀 통과 ${L.targetSkips.widened} · 문장 안 링크 ${L.targetSkips.inline} · 안 보이는 작은 글씨 ${L.tinyHiddenCount ?? 0}</p>` : ''}
${(L.coveredTargets || []).length ? `<details><summary>가운데를 눌러도 안 잡혀 뺀 버튼(무엇이 덮었나) ${L.targetSkips.covered}개</summary><p class="dim">${L.coveredTargets.map((c) => esc(c)).join(' · ')}</p></details>` : ''}
${L.tinyTextCount ? `<details><summary>11px 미만 글씨 ${L.tinyTextCount}개</summary><p class="dim">${L.tinyText.map((t) => `${esc(t.label)} ${t.fs}px「${esc(t.text)}」`).join(' · ')}</p></details>` : ''}
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
