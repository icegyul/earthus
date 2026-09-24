// 판매 개시 조건 — SALES_OPEN 을 켜도 조건 하나라도 남으면 결제 단추가 없고, 막은 조건 이름이 콘솔에 남는다 (2026-09-24)
//
// 왜: billing.js 판매 스위치가 Open-Meteo·GVP 두 값만 봤다(docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md §1-5).
//   기상예보업 등록·Esri 인증·Gemini 연령 조항·에코뱅크·뉴스 RSS·v2 서버 등급 판정·Play 결제가 안 끝나도
//   SALES_OPEN=true 하나로 결제가 시작될 수 있었다. 조건 목록의 정본은 access-mode.js SALES_PRECONDITIONS 다.
//
// 결과로 시험한다(금지만 보지 않는다):
//   ① 조건이 모두 true 면 **결제 단추가 나와야** 통과 — 아무것도 안 파는 코드가 통과하지 못하게.
//   ② 조건 하나만 false 여도 결제 단추가 없고, 그 조건 이름이 콘솔 경고에 **나와야** 통과.
//   ③ billing.subscribe() 도 같은 조건에서 SALES_PRECONDITION_BLOCKED 로 멈추고 이름을 남긴다.
//
// billing.js·ui-subscribe.js 는 config.local.js(깃 제외)·auth.js·i18n.js·ui.js 를 부른다 — 이 시험은
// 그 넷을 **이 파일 안의 가짜 모듈**로 바꿔 끼운다(node:module register). 작업 트리에 파일을 만들지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// ── 가짜 모듈 ─────────────────────────────────────────────────────────────
const STUBS = {
  'config.local': 'export const CONFIG = globalThis.__SALES_TEST_CONFIG__;',
  auth: 'export const auth = { user: null, client: null, isPaid() { return false; }, async accessToken() { return null; } };\n'
    + 'export const interest = {};',
  i18n: 'export const i18n = { lang: "ko", t: (k) => k };',
  ui: 'export const toast = (m) => { (globalThis.__SALES_TEST_TOASTS__ ||= []).push(m); };',
};
const LOADER = `
const STUBS = ${JSON.stringify(STUBS)};
export async function resolve(spec, ctx, next) {
  const m = /^\\.\\/(config\\.local|auth|i18n|ui)\\.js(\\?.*)?$/.exec(spec);
  if (m && ctx.parentURL && /\\/prototype\\/js\\/(billing|ui-subscribe)\\.js/.test(ctx.parentURL)) {
    return { url: 'stub:' + m[1], shortCircuit: true };
  }
  return next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true };
  return next(url, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(LOADER));

// ── 아주 작은 가짜 DOM — render() 가 쓰는 만큼만 ─────────────────────────────
function fakeNode(tag) {
  return {
    tag, className: '', innerHTML: '', textContent: '', children: [], onclick: null,
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); return c; },
  };
}
const created = [];
const subBody = fakeNode('div');
globalThis.document = {
  createElement(tag) { const n = fakeNode(tag); created.push(n); return n; },
  querySelector(sel) { return sel === '#subBody' ? subBody : fakeNode('div'); },
  querySelectorAll() { return []; },
  head: fakeNode('head'),
};

const CONFIG = {};
globalThis.__SALES_TEST_CONFIG__ = CONFIG;

const am = await import('../../prototype/js/access-mode.js');
const { SALES_PRECONDITIONS, salesPreconditionsBlocking, salesReadiness, salesAllowed } = am;
const KEYS = SALES_PRECONDITIONS.map((p) => p.key);
const allTrue = () => Object.fromEntries(KEYS.map((k) => [k, true]));

function setConfig(over) {
  for (const k of Object.keys(CONFIG)) delete CONFIG[k];
  Object.assign(CONFIG, {
    MONETIZATION_MODE: 'PAID', SALES_OPEN: true,
    CHECKOUT_URL: 'https://example.invalid/functions/v1/checkout',
    ...allTrue(),
  }, over);
}

function captureWarn(fn) {
  const orig = console.warn;
  const lines = [];
  console.warn = (...a) => { lines.push(a.map(String).join(' ')); };
  return Promise.resolve().then(fn).finally(() => { console.warn = orig; }).then((r) => ({ r, lines }));
}

// ── ① 목록 자체 ────────────────────────────────────────────────────────────
test('판매 조건 목록 — 요청된 아홉 조건이 이름·한국어 이유와 함께 있다', () => {
  assert.deepEqual(KEYS, [
    'WEATHER_BUSINESS_REGISTERED', 'OPEN_METEO_COMMERCIAL_READY', 'ESRI_AUTH_TILES_READY', 'GVP_COMMERCIAL_READY',
    'GEMINI_AGE_CLAUSE_RESOLVED', 'ECOBANK_CLEARED', 'NEWS_RSS_CLEARED', 'V2_SERVER_TIER_LIVE', 'PLAY_BILLING_LIVE',
  ]);
  for (const p of SALES_PRECONDITIONS) {
    assert.match(p.ko, /[가-힣]/, `${p.key}: 한국어 이유가 있어야 한다`);
    assert.ok(p.ko.includes(' — '), `${p.key}: 짧은 이름 — 설명 꼴이어야 화면이 짧은 이름을 뽑는다`);
    assert.ok(p.en && p.ref, `${p.key}: 영어 이유·근거 번호`);
    assert.ok(Object.isFrozen(p));
  }
  assert.ok(Object.isFrozen(SALES_PRECONDITIONS));
});

test('판정 — 모두 true 면 열리고, 하나만 빠져도 그 이름으로 막힌다. 없는 값·오타·"true" 문자열도 막힌다', () => {
  assert.deepEqual(salesPreconditionsBlocking(allTrue()), []);
  assert.equal(salesReadiness({ mode: 'PAID', salesOpen: true, config: allTrue() }).ready, true);
  for (const k of KEYS) {
    for (const bad of [false, undefined, 'true', 1, null]) {
      const cfg = allTrue();
      if (bad === undefined) delete cfg[k]; else cfg[k] = bad;
      const g = salesReadiness({ mode: 'PAID', salesOpen: true, config: cfg });
      assert.equal(g.ready, false, `${k}=${String(bad)} 이면 막혀야 한다`);
      assert.equal(g.salesOpen, true);
      assert.deepEqual([...g.blocking], [k]);
    }
  }
  assert.deepEqual([...salesReadiness({ mode: 'PAID', salesOpen: true }).blocking], KEYS, 'config 가 없으면 전부 막힘');
  assert.deepEqual([...salesReadiness({ mode: 'PAID', salesOpen: true, config: null }).blocking], KEYS);
  // 스위치가 닫혀 있으면 조건이 다 차도 안 열린다 — salesAllowed 의 뜻은 그대로다
  assert.equal(salesReadiness({ mode: 'PAID', salesOpen: false, config: allTrue() }).ready, false);
  assert.equal(salesReadiness({ mode: 'FREE_OPEN', salesOpen: true, config: allTrue() }).ready, false);
  assert.equal(salesAllowed({ mode: 'PAID', salesOpen: true }), true, 'salesAllowed 서명·뜻은 바꾸지 않았다');
});

test('config.local.example.js — 아홉 조건이 모두 false 로 적혀 있고, 판매 스위치는 닫혀 있다', () => {
  const ex = read('prototype/js/config.local.example.js');
  for (const k of KEYS) assert.match(ex, new RegExp(`\\b${k}:\\s*false,`), `${k} 기본값 false`);
  assert.match(ex, /SALES_OPEN:\s*false,/);
  assert.match(ex, /MONETIZATION_MODE:\s*'FREE_OPEN',/);
});

test('billing.js·ui-subscribe.js 는 목록을 따로 적지 않고 access-mode.js 의 판정을 쓴다', () => {
  const b = read('prototype/js/billing.js');
  const u = read('prototype/js/ui-subscribe.js');
  assert.match(b, /import \{ salesAllowed, salesReadiness, TIER \} from '\.\/access-mode\.js';/);
  assert.match(b, /salesReadiness\(\{ mode: CONFIG\.MONETIZATION_MODE, salesOpen: CONFIG\.SALES_OPEN, config: CONFIG \}\)/);
  assert.match(u, /salesReadiness\(\{ mode: CONFIG\.MONETIZATION_MODE, salesOpen: CONFIG\.SALES_OPEN, config: CONFIG \}\)/);
  for (const k of ['WEATHER_BUSINESS_REGISTERED', 'PLAY_BILLING_LIVE', 'ESRI_AUTH_TILES_READY']) {
    assert.doesNotMatch(b, new RegExp(k), `billing.js 에 ${k} 를 따로 적지 않는다`);
    assert.doesNotMatch(u, new RegExp(k), `ui-subscribe.js 에 ${k} 를 따로 적지 않는다`);
  }
});

// ── ② 결제 시작(billing.subscribe) ─────────────────────────────────────────
const { billing } = await import('../../prototype/js/billing.js');

test('billing.subscribe — 조건이 다 차면 결제 길로 들어간다(로그인 단계까지)', async () => {
  setConfig({});
  const { r, lines } = await captureWarn(() => billing.subscribe('monthly', 'web').then(() => 'ok', (e) => e.message));
  assert.equal(r, 'NOT_SIGNED_IN', '관문을 지나 토큰 확인에서 멈춰야 한다(가짜 auth 는 로그인 안 됨)');
  assert.equal(lines.filter((l) => l.includes('[판매 스위치]')).length, 0);
});

test('billing.subscribe — SALES_OPEN=true 라도 조건 하나가 false 면 막고, 그 이름을 콘솔에 남긴다', async () => {
  // Open-Meteo·GVP 는 예전 코드(DATA_LICENSE_NOT_READY)가 먼저 막는다 — 그 둘을 뺀 일곱을 본다
  for (const k of KEYS.filter((x) => x !== 'OPEN_METEO_COMMERCIAL_READY' && x !== 'GVP_COMMERCIAL_READY')) {
    setConfig({ [k]: false });
    const { r, lines } = await captureWarn(() => billing.subscribe('monthly', 'web').then(() => 'ok', (e) => e));
    assert.equal(r.message, 'SALES_PRECONDITION_BLOCKED', `${k}`);
    assert.deepEqual([...r.blocking], [k]);
    assert.ok(lines.some((l) => l.includes('[판매 스위치]') && l.includes(k)), `${k} 이름이 콘솔에 나와야 한다: ${lines}`);
  }
  // (2026-09-24 정정) 예전 시험은 이 둘의 콘솔 경고를 보지 않았다 — 실제로 경고가 안 남았다(옛 줄이 먼저 멈춤).
  //   이제 오류 코드는 옛 그대로이면서 막은 이름도 콘솔에 **나와야** 통과한다.
  for (const k of ['OPEN_METEO_COMMERCIAL_READY', 'GVP_COMMERCIAL_READY']) {
    setConfig({ [k]: false });
    const { r: e, lines } = await captureWarn(() => billing.subscribe('monthly', 'web').then(() => null, (x) => x));
    assert.equal(e.message, 'DATA_LICENSE_NOT_READY', `${k} 는 옛 코드 그대로`);
    assert.ok(lines.some((l) => l.includes('[판매 스위치]') && l.includes(k)), `${k} 이름이 콘솔에 나와야 한다: ${lines}`);
  }
});

test('billing.subscribe — 판매가 닫힌 지금(SALES_OPEN=false)은 옛 NOT_AVAILABLE 그대로이고 콘솔도 조용하다', async () => {
  // (2026-09-24 검수 추가) 경고를 옛 두 줄 앞으로 올렸으므로, 닫힌 상태에서 새 경고가 새지 않는지 따로 본다.
  setConfig({ SALES_OPEN: false });
  const { r, lines } = await captureWarn(() => billing.subscribe('monthly', 'web').then(() => 'ok', (e) => e.message));
  assert.equal(r, 'NOT_AVAILABLE');
  assert.equal(lines.filter((l) => l.includes('[판매 스위치]')).length, 0);
});

// ── ③ 결제 단추(ui-subscribe render) ────────────────────────────────────────
const { subscribeSheet } = await import('../../prototype/js/ui-subscribe.js');

function renderSheet() {
  created.length = 0;
  subBody.children.length = 0;
  subscribeSheet.plan = 'monthly';
  subscribeSheet._reason = null;
  subscribeSheet.render();
  const buttons = created.filter((n) => n.tag === 'button' && /구독하기/.test(n.innerHTML));
  const pending = created.filter((n) => /pay-pending/.test(n.className)).map((n) => n.innerHTML).join('\n');
  return { buttons, pending };
}

test('구독 화면 — 조건이 다 차면 "구독하기" 단추가 나와야 한다(아무것도 안 파는 코드가 통과하지 못하게)', async () => {
  setConfig({});
  const { r, lines } = await captureWarn(() => renderSheet());
  assert.ok(r.buttons.length >= 1, '구독하기 단추가 있어야 한다');
  assert.equal(r.pending, '');
  assert.equal(lines.filter((l) => l.includes('[판매 스위치]')).length, 0);
});

test('구독 화면 — SALES_OPEN=true 라도 조건 하나가 false 면 단추가 없고, 막은 조건이 콘솔과 안내에 나온다', async () => {
  for (const p of SALES_PRECONDITIONS) {
    setConfig({ [p.key]: false });
    const { r, lines } = await captureWarn(() => renderSheet());
    assert.equal(r.buttons.length, 0, `${p.key}=false 인데 구독하기 단추가 있다`);
    assert.match(r.pending, /결제 준비 중/);
    assert.ok(r.pending.includes(p.ko.split(' — ')[0]), `${p.key}: 안내에 짧은 이름이 나와야 한다`);
    assert.ok(lines.some((l) => l.includes('[판매 스위치]') && l.includes(p.key)), `${p.key}: 콘솔 경고`);
  }
});

test('구독 화면 — 판매가 닫힌 지금(SALES_OPEN=false)은 예전 문구 그대로이고 콘솔도 조용하다(보이는 변화 없음)', async () => {
  setConfig({ SALES_OPEN: false, MONETIZATION_MODE: 'FREE_OPEN' });
  for (const k of KEYS) CONFIG[k] = false;
  const { r, lines } = await captureWarn(() => renderSheet());
  assert.equal(r.buttons.length, 0);
  assert.match(r.pending, /통신판매업 신고 절차 진행 중/);
  assert.equal(lines.filter((l) => l.includes('[판매 스위치]')).length, 0);
});
