// 앱(TWA) 준비 — 웹 쪽 잠금 (2026-09-24, docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-4 · §3-8 · D16 · D17)
//
// 결과로 본다(금지만 시험하지 않는다 — AGENTS.md '일하는 법' 2):
//   · 앱 안 진입 네 길(아이콘·알림 새 창·App Link·공유)은 모두 '앱 안'이 **되어야** 하고, 결제 길에 'web'(토스)이 **없어야** 한다.
//   · 일반 브라우저 탭은 '앱 밖'이 **되어야** 하고 웹 결제 길이 **남아 있어야** 한다(판매를 열면 웹은 그대로 팔 수 있어야 한다).
//   · 뒤로 단추: 서랍을 열면 칸이 **하나** 생기고, 뒤로 한 번에 닫히고, ✕ 로 닫으면 칸이 **남지 않아야** 한다.
//   · 오프라인: /v2/·/Intelligence/ 화면 이동이 망 오류로 실패하면 안내 화면이 **나와야** 하고, v2 코드는 v1 캐시에 **안 들어가야** 한다.
//   · kill-switch: 옛 v2 캐시는 **지워지고** 등록은 **풀리고**, v1 캐시는 **남아야** 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');

const {
  detectAppContext, stripAppMarker, paymentRoute, allowedProviderKeys, APP_PACKAGE,
} = await import('../../prototype/js/app-context.js');
const { createBackStack, oauthRewindSteps, OVERLAY_STATE_KEY } = await import('../../prototype/js/back-close.js');

// ── 1. 앱 안 판정 ────────────────────────────────────────────────────────────────────────────────
const inAppRoute = (ctx, extra = {}) => paymentRoute({ inApp: ctx.inApp, hasDigitalGoods: false, hasNativeBridge: false, ...extra });

test('앱 아이콘(런처) — start_url ?src=twa 로 들어오면 앱 안이고 표식을 지울 준비가 된다', () => {
  const ctx = detectAppContext({ search: '?src=twa', sessionValue: null, standalone: true, referrer: '' });
  assert.equal(ctx.inApp, true);
  assert.equal(ctx.entryKind, 'twa');
  assert.equal(ctx.marker, true);
  // standalone 이 거짓이어도(삼성 인터넷 등) 표식 하나로 앱 안이다
  assert.equal(detectAppContext({ search: '?src=twa', standalone: false }).inApp, true);
});

test('알림 탭 — clients.openWindow 새 창: sessionStorage 는 비었지만 런처가 붙인 src=twa 로 앱 안이다', () => {
  const ctx = detectAppContext({ search: '?tab=my&event=kma-1&src=twa', sessionValue: null, standalone: false, referrer: '' });
  assert.equal(ctx.inApp, true);
  assert.deepEqual(allowedProviderKeys(inAppRoute(ctx)).includes('web'), false);
});

test('App Link — 다른 앱에서 연 earthus.net 링크(표식 + 우리 패키지 referrer)는 앱 안이다', () => {
  const withMarker = detectAppContext({ search: '?tc=WP202619&src=twa', referrer: `android-app://${APP_PACKAGE}/` });
  assert.equal(withMarker.inApp, true);
  // 표식이 빠져도 우리 패키지 referrer 하나로 앱 안(보조 신호)
  const refOnly = detectAppContext({ search: '?tc=WP202619', referrer: `android-app://${APP_PACKAGE}/` });
  assert.equal(refOnly.inApp, true);
  assert.equal(refOnly.signals.androidReferrer, true);
});

test('공유 링크 — ?station=108&src=twa 로 들어온 앱은 앱 안, 같은 탭의 다음 화면은 sessionStorage 로 앱 안', () => {
  assert.equal(detectAppContext({ search: '?station=108&src=twa' }).inApp, true);
  const next = detectAppContext({ search: '', sessionValue: 'twa', standalone: false, referrer: 'https://earthus.net/' });
  assert.equal(next.inApp, true);
  assert.equal(next.entryKind, 'twa');
});

test('일반 브라우저 탭 — 앱 밖이고 웹(토스) 결제 길이 남는다', () => {
  const plain = detectAppContext({ search: '?station=108', sessionValue: null, standalone: false, referrer: 'https://www.google.com/' });
  assert.equal(plain.inApp, false);
  assert.equal(plain.entryKind, 'web');
  assert.equal(paymentRoute({ inApp: false, hasDigitalGoods: false, hasNativeBridge: false }), 'web');
  assert.ok(allowedProviderKeys('web').includes('web'));
  // ⚠️ 다른 앱(Gmail)에서 눌러 **일반 Chrome 탭**으로 열린 링크는 앱 밖이다 — android-app:// 전체를 보면 웹 결제가 막힌다
  const gmail = detectAppContext({ search: '', referrer: 'android-app://com.google.android.gm/' });
  assert.equal(gmail.inApp, false);
  // 비슷한 이름의 다른 패키지도 앱 밖
  assert.equal(detectAppContext({ referrer: `android-app://${APP_PACKAGE}.evil/` }).inApp, false);
});

test('PWA 설치본(standalone) — D17 대가: 앱 안으로 본다', () => {
  const ctx = detectAppContext({ search: '', standalone: true });
  assert.equal(ctx.inApp, true);
  assert.equal(ctx.entryKind, 'standalone');
});

test('앱 안 결제 길 — Digital Goods → play, 브리지 → native, 둘 다 없음 → blocked. 어느 길에도 web 이 없다', () => {
  assert.equal(paymentRoute({ inApp: true, hasDigitalGoods: true, hasNativeBridge: true }), 'play');
  assert.equal(paymentRoute({ inApp: true, hasDigitalGoods: false, hasNativeBridge: true }), 'native');
  assert.equal(paymentRoute({ inApp: true, hasDigitalGoods: false, hasNativeBridge: false }), 'blocked');
  for (const route of ['play', 'native', 'blocked']) assert.equal(allowedProviderKeys(route).includes('web'), false, route);
  assert.deepEqual(allowedProviderKeys('play'), ['play']);
  assert.deepEqual(allowedProviderKeys('native'), ['google']);
  assert.deepEqual(allowedProviderKeys('blocked'), []);
});

test('표식 지우기 — src=twa 만 빠지고 다른 쿼리·해시는 남는다', () => {
  assert.equal(stripAppMarker('https://earthus.net/?src=twa'), '/');
  assert.equal(stripAppMarker('https://earthus.net/v2/?tab=my&src=twa&event=a#v=1&at=1'), '/v2/?tab=my&event=a#v=1&at=1');
  assert.equal(stripAppMarker('https://earthus.net/?src=web'), '/?src=web');
});

test('billing.js — 결제 길 거름을 쓰고, web 은 앱 안에서 세 겹으로 막히고, play 가 google 보다 앞이다', () => {
  const src = read('prototype/js/billing.js');
  assert.match(src, /import \{ isInApp, paymentRoute, allowedProviderKeys \} from '\.\/app-context\.js';/);
  assert.match(src, /const allowed = allowedProviderKeys\(this\.route\(\)\);/);
  assert.match(src, /available: \(\) => !!CONFIG\.CHECKOUT_URL && !isInApp\(\),/);
  assert.match(src, /if \(prov\.key === 'web' && isInApp\(\)\) throw new Error\('NOT_AVAILABLE'\);/);
  assert.ok(src.indexOf('  play: {') > 0 && src.indexOf('  play: {') < src.indexOf('  google: {'), 'play 가 google 앞');
  // '앱에서는 결제할 수 없습니다' 는 링크 없이 나와야 한다
  const ui = read('prototype/js/ui-subscribe.js');
  const i = ui.indexOf('앱에서는 결제할 수 없습니다');
  assert.ok(i > 0, '문구가 있어야 한다');
  const block = ui.slice(ui.lastIndexOf('if (salesReady && !provs.length && billing.inApp())', i), ui.indexOf('} else if (!provs.length)', i));
  assert.doesNotMatch(block, /<a\b|href=|location\./, '앱 안 결제 불가 안내에 링크가 없어야 한다');
});

test('app-context.js 는 v1 main.js·v2 main.js 의 첫 import 다(주소에 표식이 박히기 전에 지운다)', () => {
  const v1 = read('prototype/js/main.js').split('\n').filter((l) => /^import /.test(l));
  assert.equal(v1[0], "import './app-context.js';");
  const v2 = read('prototype/v2-three/js/main.js').split('\n').filter((l) => /^import /.test(l));
  assert.equal(v2[0], "import '../../js/app-context.js?v=1';");
  // 한 문서 안에서 back-close 는 한 벌이어야 한다 — v2 의 두 importer 가 같은 지정자
  const shell = read('prototype/v2-three/js/ui-shell.js');
  assert.match(shell, /from '\.\.\/\.\.\/js\/back-close\.js\?v=1';/);
  assert.match(read('prototype/v2-three/js/main.js'), /from '\.\.\/\.\.\/js\/back-close\.js\?v=1';/);
  // 번들이 두 파일을 싣고 경로를 바꾼다
  const build = read('tools/build-v2-bundle.sh');
  assert.match(build, /prototype\/js\/app-context\.js" "\$ROOT\/prototype\/js\/back-close\.js" "\$OUT\/js\/shared\/"/);
  assert.match(build, /s#\\\.\\\.\/\\\.\\\.\/js\/back-close\\\.js#\.\/shared\/back-close\.js#g/);
});

// ── 2. 뒤로 단추 ─────────────────────────────────────────────────────────────────────────────────
function fakeWindow(url = 'https://earthus.net/') {
  const entries = [{ state: null, url }];
  let idx = 0;
  const listeners = [];
  const fire = () => { const e = { state: entries[idx].state }; listeners.forEach((fn) => fn(e)); return e; };
  const win = {
    location: { get href() { return entries[idx].url; } },
    history: {
      get state() { return entries[idx].state; },
      get length() { return entries.length; },
      pushState(s, _t, u) { entries.splice(idx + 1); entries.push({ state: structuredClone(s), url: u ?? entries[idx].url }); idx += 1; },
      replaceState(s, _t, u) { entries[idx] = { state: structuredClone(s), url: u ?? entries[idx].url }; },
      back() { if (idx === 0) return; idx -= 1; setTimeout(fire, 0); },
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn); },
    userBack() { idx -= 1; return fire(); },
    get idx() { return idx; },
    entries,
  };
  return win;
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('뒤로 단추 — 서랍을 열면 칸 하나, 뒤로 한 번에 닫히고 칸이 남지 않는다', async () => {
  const win = fakeWindow();
  const bs = createBackStack(win);
  let open = false;
  bs.register('menu', { isOpen: () => open, close: () => { open = false; } });
  await tick();
  assert.equal(win.history.length, 1, '처음엔 칸이 하나');
  open = true; bs.syncNow();
  assert.equal(win.history.length, 2, '열면 표식 칸 하나');
  assert.ok(win.history.state[OVERLAY_STATE_KEY]);
  const e = win.userBack();
  assert.equal(open, false, '뒤로 한 번에 닫힌다');
  assert.equal(bs.consumed(e), true, '주소 복원기가 이 pop 을 건너뛰어야 한다');
  assert.equal(win.idx, 0, '첫 칸 — 한 번 더 뒤로면 페이지를 떠난다');
});

test('뒤로 단추 — ✕ 로 닫으면 우리가 칸을 걷는다(칸이 남아 두 번 눌러야 나가는 일이 없다)', async () => {
  const win = fakeWindow();
  const bs = createBackStack(win);
  let open = false;
  let resynced = 0;
  bs.onConsumedPop(() => { resynced += 1; });
  bs.register('sheet', { isOpen: () => open, close: () => { open = false; } });
  open = true; bs.syncNow();
  assert.equal(win.idx, 1);
  open = false; bs.syncNow();   // 화면에서 닫음
  await tick();
  assert.equal(win.idx, 0, '표식 칸을 걷었다');
  assert.equal(resynced, 1, '주소를 지금 상태로 다시 썼다');
});

test('뒤로 단추 — 두 겹(지도 화면 시트 + 서랍)이면 맨 위부터 하나씩, 칸을 다시 쌓는다', async () => {
  const win = fakeWindow();
  const bs = createBackStack(win);
  const open = { sheet: false, menu: false };
  bs.register('sheet', { isOpen: () => open.sheet, close: () => { open.sheet = false; } });
  bs.register('menu', { isOpen: () => open.menu, close: () => { open.menu = false; } });
  open.sheet = true; bs.syncNow();
  open.menu = true; bs.syncNow();
  assert.equal(win.history.length, 2, '겹쳐도 칸은 하나');
  win.userBack();
  assert.deepEqual(open, { sheet: true, menu: false }, '나중에 연 서랍이 먼저 닫힌다');
  assert.equal(win.idx, 1, '남은 시트를 위해 칸을 다시 쌓았다');
  win.userBack();
  assert.deepEqual(open, { sheet: false, menu: false });
  assert.equal(win.idx, 0);
});

test('뒤로 단추 — 먼저 등록된 주소 복원기도 우리 pop 을 알아본다(Chromium 은 window popstate 를 등록 순서대로 부른다)', async () => {
  const win = fakeWindow();
  const seen = [];
  let bs = null;
  // earth-view-state 처럼 back-close 보다 **먼저** 건 듣개
  win.addEventListener('popstate', (e) => seen.push(bs.consumed(e)));
  bs = createBackStack(win);
  let open = false;
  bs.register('menu', { isOpen: () => open, close: () => { open = false; } });
  open = true; bs.syncNow();
  win.userBack();                    // 사용자가 뒤로
  open = true; bs.syncNow();
  open = false; bs.syncNow();        // 화면에서 닫음 → 우리가 칸을 걷는다
  await tick();
  assert.deepEqual(seen, [true, true], '두 경우 모두 먼저 불린 듣개가 consumed=true 를 봐야 한다');
});

test('뒤로 단추 — 열려 있거나 닫는 중에는 주소 쓰기가 칸을 쌓지 않는다(suppressPush)', () => {
  const win = fakeWindow();
  const bs = createBackStack(win);
  let open = false;
  let during = null;
  bs.register('menu', { isOpen: () => open, close: () => { during = bs.suppressPush(); open = false; } });
  assert.equal(bs.suppressPush(), false);
  open = true; bs.syncNow();
  assert.equal(bs.suppressPush(), true);
  win.userBack();
  assert.equal(during, true, '뒤로로 닫는 동안');
  assert.equal(bs.suppressPush(), false);
});

test('뒤로 단추 — 새로 읽은 문서가 옛 표식 칸 위에서 시작하면 표식을 지운다', () => {
  const win = fakeWindow();
  win.history.replaceState({ [OVERLAY_STATE_KEY]: 3, keep: 1 }, '', win.location.href);
  createBackStack(win);
  assert.deepEqual(win.history.state, { keep: 1 });
});

test('v1 earth-view-state — 우리 pop 은 장면을 되돌리지 않고, Style(서랍)은 칸을 쌓지 않는다', () => {
  const src = read('prototype/js/earth-view-state.js');
  assert.match(src, /if \(backStack\(\)\.consumed\(event\)\) return;/);
  assert.match(src, /if \(same\(cleanState\(route\), cleanState\(store\.earthView\)\)\) return;/);
  assert.match(src, /state\.view === 'style' \|\| store\.earthView\.view === 'style' \|\| backStack\(\)\.suppressPush\(\)/);
  const main = read('prototype/js/main.js');
  for (const id of ["'sheet'", "'menu'", "'search'"]) assert.ok(main.includes(`.register(${id}`), id);
});

test('v2 — 메뉴·Intelligence 를 알리고, 해시 쓰기가 표식을 지우지 않는다', () => {
  const shell = read('prototype/v2-three/js/ui-shell.js');
  assert.match(shell, /\.register\('menu', \{ isOpen: \(\) => panel\.classList\.contains\('open'\), close: \(\) => closeFlyout\(\) \}\)/);
  assert.match(shell, /\.register\('intel', \{ isOpen: \(\) => intel\.classList\.contains\('open'\), close: \(\) => setIntelOpen\(false\) \}\)/);
  const main = read('prototype/v2-three/js/main.js');
  assert.match(main, /history\.replaceState\(history\.state, '', h\);/);
  assert.doesNotMatch(main, /history\.replaceState\(null, '', h\);/);
  assert.match(main, /backStack\(\)\.onConsumedPop\(\(\) => \{ lastLink = ''; writeLink\(\); \}\);/);
});

test('OAuth 되감기 — 로그인 시트 칸을 Google 로 바꿨으면 그 아래(떠나기 전 화면)로 간다', () => {
  // [v1 첫 칸, 시트 표식 칸→Google(replace)] 뒤에 Google 칸 2개 + 돌아온 칸
  assert.equal(oauthRewindSteps({ savedLength: 2, replaced: true, nowLength: 5 }), 4);
  // 표식 칸 없이 떠났으면(assign) 떠난 칸이 기록의 끝이었는지 모른다 — 움직이지 않는다(Google 칸에 떨어질 수 있다)
  assert.equal(oauthRewindSteps({ savedLength: 2, replaced: false, nowLength: 5 }), 0);
  // 로그인 전 과정이 서버 넘김(칸이 안 늘어남)이어도 바뀐 칸 아래가 떠나기 전 화면이다 → 한 칸
  assert.equal(oauthRewindSteps({ savedLength: 5, replaced: true, nowLength: 5 }), 1);
  // 기록이 줄었으면(다른 탭·잘림) 위치를 모른다 — 움직이지 않는다
  assert.equal(oauthRewindSteps({ savedLength: 5, replaced: true, nowLength: 3 }), 0);
  // 50칸 상한 근처는 번호가 밀려 위험 — 움직이지 않는다
  assert.equal(oauthRewindSteps({ savedLength: 45, replaced: true, nowLength: 50 }), 0);
  const auth = read('prototype/js/auth.js');
  assert.match(auth, /skipBrowserRedirect: true/);
  assert.match(auth, /if \(replaced\) window\.location\.replace\(url\);/);
});

// ── 3. 오프라인 (v1 sw.js 를 가짜 SW 환경에서 돌린다) ───────────────────────────────────────────
function loadSw(rel, { cacheSeed = {}, online = true, net = {} } = {}) {
  const ORIGIN = 'https://earthus.net';
  const handlers = {};
  const store = new Map(Object.entries(cacheSeed).map(([name, map]) => [name, new Map(Object.entries(map))]));
  const puts = [];
  const key = (req, opts = {}) => {
    const u = new URL(typeof req === 'string' ? req : req.url, `${ORIGIN}/sw.js`);
    if (opts.ignoreSearch) u.search = '';
    return u.href;
  };
  const cacheObj = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      match: async (req, opts) => { const k = key(req, opts); for (const [kk, v] of m) { if ((opts?.ignoreSearch ? key(kk, opts) : kk) === k) return v.clone(); } return undefined; },
      put: async (req, res) => { puts.push({ cache: name, url: key(req) }); m.set(key(req), res); },
      addAll: async (list) => { for (const p of list) m.set(key(p), new Response(`precached ${p}`, { headers: { 'Content-Type': 'text/html' } })); },
      keys: async () => [...m.keys()].map((u) => ({ url: u })),
    };
  };
  const caches = {
    open: async (name) => cacheObj(name),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (req, opts) => { for (const name of store.keys()) { const r = await cacheObj(name).match(req, opts); if (r) return r; } return undefined; },
  };
  const fetchFn = async (req) => {
    if (!online) throw new TypeError('Failed to fetch');
    const u = typeof req === 'string' ? req : req.url;
    return new Response(net[u] ?? `network ${u}`, { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
  let unregistered = false;
  const self = {
    location: new URL(`${ORIGIN}${rel.includes('v2-three') ? '/v2/sw.js' : '/sw.js'}`),
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { unregister: async () => { unregistered = true; return true; }, showNotification: async () => {} },
  };
  const ctx = vm.createContext({ self, caches, fetch: fetchFn, Response, Headers, URL, crypto: globalThis.crypto, console, Promise, Set, Map, setTimeout, Uint8Array, importScripts: () => {} });
  vm.runInContext(read(rel), ctx, { filename: rel });
  const dispatch = async (type, extra = {}) => {
    let responded = null;
    const waits = [];
    const e = { ...extra, respondWith: (p) => { responded = p; }, waitUntil: (p) => waits.push(p) };
    handlers[type](e);
    await Promise.all(waits);
    return responded ? await responded : undefined;
  };
  const navigate = (url, { mode = 'navigate', destination = 'document' } = {}) =>
    dispatch('fetch', { request: { method: 'GET', url: `${ORIGIN}${url}`, mode, destination } });
  return { dispatch, navigate, store, puts, get unregistered() { return unregistered; }, setOnline: (v) => { online = v; } };
}

test('오프라인 — /v2/·/Intelligence/ 화면 이동이 망 오류면 안내 화면, 스크립트는 손대지 않고, v2 는 캐시에 안 넣는다', async () => {
  const sw = loadSw('prototype/sw.js', { online: false });
  await sw.dispatch('install');
  const shellName = [...sw.store.keys()].find((n) => n.startsWith('earthus-shell-'));
  assert.equal(shellName, 'earthus-shell-2026-09-24-offline', '캐시 이름을 올렸다(새 파일이 install 에 들어가게)');
  assert.ok(sw.store.get(shellName).has('https://earthus.net/offline.html'), 'install 이 offline.html 을 넣는다');
  assert.ok(sw.store.get(shellName).has('https://earthus.net/logo/earthus-wordmark-white.svg'), '안내 화면 로고도');

  for (const url of ['/v2/', '/Intelligence/', '/Intelligence', '/v2/?tab=my']) {
    const r = await sw.navigate(url);
    assert.ok(r, `${url} 응답이 있어야 한다`);
    assert.equal(await r.text(), 'precached ./offline.html', url);
  }
  // 스크립트·자료 요청은 v1 워커가 손대지 않는다(2026-09-07 사고 — HTML 을 모듈로 주면 멈춘다)
  assert.equal(await sw.navigate('/v2/js/main.js?v=1', { mode: 'cors', destination: 'script' }), undefined);
  assert.equal(await sw.navigate('/v2/data/x.json', { mode: 'cors', destination: '' }), undefined);

  // 온라인이면 네트워크 응답 그대로, v2 문서는 v1 캐시에 넣지 않는다
  sw.setOnline(true);
  const ok = await sw.navigate('/v2/');
  assert.equal(await ok.text(), 'network https://earthus.net/v2/');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sw.puts.filter((p) => p.url.includes('/v2/') || p.url.includes('/Intelligence')).length, 0);
});

test('오프라인 — v1 화면 이동은 캐시된 문서가 먼저(AETHERUS 현장 세션), 캐시가 비었을 때만 안내 화면', async () => {
  const sw = loadSw('prototype/sw.js', { online: false });
  await sw.dispatch('install');
  const r1 = await sw.navigate('/');
  assert.equal(await r1.text(), 'precached ./index.html');
  // 캐시가 통째로 비면 안내 화면(빈 오류 대신)
  const empty = loadSw('prototype/sw.js', { online: false });
  const r2 = await empty.navigate('/');
  assert.ok(r2, '응답이 있어야 한다');
  assert.equal(r2.status, 503);
  assert.match(await r2.text(), /오프라인/);
});

test('오프라인 — 옛 v1 캐시는 활성화 때 지우고, v2 캐시는 v1 워커가 건드리지 않는다', async () => {
  const sw = loadSw('prototype/sw.js', {
    cacheSeed: { 'earthus-shell-2026-09-07-scope': {}, 'earthus-v2-2026-08-28-device1': {} },
  });
  await sw.dispatch('install');
  await sw.dispatch('activate');
  assert.equal(sw.store.has('earthus-shell-2026-09-07-scope'), false);
  assert.equal(sw.store.has('earthus-v2-2026-08-28-device1'), true);
});

test('offline.html — 절대 경로 자산, 지어낸 값 없음, 다시 불러오기, 마지막 연 시각은 기록이 있을 때만', () => {
  const html = read('prototype/offline.html');
  assert.match(html, /src="\/logo\/earthus-wordmark-white\.svg"/);
  assert.doesNotMatch(html, /(src|href)="(?!\/|#|data:)/, '상대 경로 자산이 있으면 /v2/ 에서 깨진다');
  assert.match(html, /인터넷에 연결되어 있지 않습니다/);
  assert.match(html, /You're offline/);
  assert.match(html, /id="retry"/);
  assert.match(html, /earthus\.lastOpen/);
  assert.match(html, /lastEl\.remove\(\)/);
  assert.doesNotMatch(html, /℃|°C|m\/s|hPa|진도|규모 ?\d/, '오프라인 화면에 관측값을 싣지 않는다');
  assert.doesNotMatch(html, /setInterval|requestAnimationFrame|@keyframes|animation:/, '무한 애니메이션 금지');
});

// ── 4. D16 kill-switch ─────────────────────────────────────────────────────────────────────────
test('kill-switch — 옛 v2 캐시를 지우고 등록을 풀고, v1 캐시는 남긴다. fetch 처리기가 없다', async () => {
  const sw = loadSw('prototype/v2-three/sw.js', {
    cacheSeed: {
      'earthus-v2-2026-08-28-device1': {}, 'earthus-v2-2026-08-01-older': {},
      'earthus-shell-2026-09-07-scope': {}, 'earthus-shell-2026-09-24-offline': {},
    },
  });
  await sw.dispatch('install');
  await sw.dispatch('activate');
  assert.deepEqual([...sw.store.keys()].sort(), ['earthus-shell-2026-09-07-scope', 'earthus-shell-2026-09-24-offline']);
  assert.equal(sw.unregistered, true);
  const src = read('prototype/v2-three/sw.js');
  assert.doesNotMatch(src, /addEventListener\(\s*['"]fetch['"]/);
  assert.doesNotMatch(src, /^\s*importScripts\(/m, '새 워커는 아무것도 불러오지 않는다');
  // 옛 워커가 importScripts 하던 파일 자리는 빈 목록으로 남긴다
  const stub = read('prototype/v2-three/seo-geo-sw-routes.js');
  assert.match(stub, /EARTHUS_SEO_GEO_NON_CACHEABLE_PATHS = self\.EARTHUS_SEO_GEO_NON_CACHEABLE_PATHS \|\| \[\]/);
});

// ── 5. 아이콘·theme-color ──────────────────────────────────────────────────────────────────────
test('manifest — 전용 maskable, 이름은 그대로, theme-color 세 곳이 한 값', () => {
  const m = JSON.parse(read('prototype/manifest.webmanifest'));
  assert.equal(m.short_name, 'earthus');
  const maskable = m.icons.filter((i) => i.purpose === 'maskable');
  assert.deepEqual(maskable.map((i) => i.src), ['icon-maskable-512.png']);
  assert.ok(m.icons.some((i) => i.src === 'icon-512.png' && i.purpose === 'any'));
  const v1 = read('prototype/index.html').match(/<meta name="theme-color" content="([^"]+)"/)[1];
  const v2 = read('prototype/v2-three/index.html').match(/<meta name="theme-color" content="([^"]+)"/)[1];
  assert.equal(m.theme_color, v1);
  assert.equal(v2, v1);
  assert.equal(m.background_color.toLowerCase(), v1.toLowerCase(), '스플래시 → 상태바 → 첫 화면이 이어진다');
  const png = readFileSync(path.join(REPO, 'prototype', 'icon-maskable-512.png'));
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
});

// ── 6. 검수(2026-09-24) 보강 ───────────────────────────────────────────────────────────────────
test('뒤로 단추 — 모듈 주소가 둘이어도(v2 번들 ./shared/ + LAB 의 /js/auth.js) 문서에는 한 벌이고, 열린 서랍의 표식 칸을 지우지 않는다', async () => {
  const win = fakeWindow();
  const prev = globalThis.window;
  globalThis.window = win;
  try {
    const a = await import('../../prototype/js/back-close.js?instance=bundle');
    const b = await import('../../prototype/js/back-close.js?instance=v1-auth');
    assert.notEqual(a.backStack, b.backStack, '시험 전제: 모듈이 두 벌이다');
    const bs = a.backStack();
    let open = false;
    bs.register('menu', { isOpen: () => open, close: () => { open = false; } });
    open = true; bs.syncNow();
    assert.ok(win.history.state?.[OVERLAY_STATE_KEY], '서랍을 열면 표식 칸');
    // LAB 화면이 /js/auth.js 를 늦게 읽어 두 번째 모듈이 backStack() 을 부른다
    const bs2 = b.backStack();
    assert.equal(bs2, bs, '같은 한 벌이어야 한다');
    assert.ok(win.history.state?.[OVERLAY_STATE_KEY], '두 번째 모듈이 표식 칸을 지우면 안 된다');
    assert.equal(bs2.armedNow(), true, '로그인 이동(auth.armedNow)이 표식 칸을 본다');
    win.userBack();
    assert.equal(open, false, '뒤로 한 번에 닫힌다(듣개가 하나라 두 번 처리하지 않는다)');
  } finally {
    if (prev === undefined) delete globalThis.window; else globalThis.window = prev;
  }
});

test('v2 — 우상단 검색·설정 서랍과 물어보기 서랍도 뒤로 단추에 알린다', () => {
  const main = read('prototype/v2-three/js/main.js');
  assert.match(main, /\.register\('drawer', \{\s*isOpen: \(\) => searchDrawer\.classList\.contains\('open'\) \|\| settingsDrawer\.classList\.contains\('open'\),\s*close: \(\) => closeDrawers\(\),/);
  assert.match(main, /\.register\('ask', \{ isOpen: \(\) => !!askBox\?\.classList\.contains\('open'\), close: \(\) => askEarth\.close\(\) \}\)/);
});
