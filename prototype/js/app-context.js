// 앱 안(안드로이드 TWA)인가 — 판정 한 곳 (2026-09-24, docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-4 · PD 결정 D17)
//
// ── 왜 ─────────────────────────────────────────────────────────────────────────────────────────────
//   안드로이드 앱은 이 웹을 그대로 띄운다(TWA). Play 는 앱 안 디지털 판매를 Play 결제로만 받으라고 한다 —
//   앱 안에서 토스 결제창이 한 번이라도 뜨면 정책 위반이다(지시서 R1). 판매 스위치(SALES_OPEN)는 웹 전체
//   스위치라서, 웹에서 여는 순간 같은 웹을 띄우는 앱에도 토스가 뜬다. 그래서 판정은 **판매 전인 지금** 넣어 둔다.
//
// ── 신호 셋 (하나라도 참이면 '앱 안') ─────────────────────────────────────────────────────────────
//   1) 런처 표식 `src=twa` — 안드로이드 LauncherActivity 가 **모든 진입 URL**(아이콘·알림·App Link·공유)에 붙인다.
//      첫 로드에서 sessionStorage 에 적고 history.replaceState 로 주소에서 지운다(쿼리가 referrer 로 새지 않게).
//      ⚠️ localStorage 에 두면 안 된다 — TWA 는 Chrome 과 저장소를 공유하므로 일반 탭 웹 사용자까지 '앱 안'이 된다.
//   2) matchMedia('(display-mode: standalone)') — 대가: 크롬에서 PWA 로 설치한 사람도 토스를 못 쓴다(D17 에서 받았다).
//   3) document.referrer 가 `android-app://net.earthus.app` 로 시작 — 공식 확인 못 한 보조 신호다.
//      ⚠️ 우리 패키지(D3)만 본다. `android-app://` 전체를 보면 Gmail 앱에서 누른 링크가 **일반 Chrome 탭**으로 열려도
//         '앱 안'이 되어 웹 결제가 막힌다.
//   ⚠️ `'getDigitalGoodsService' in window` 로 판정하지 않는다 — Chrome TWA 에서만 참이라 삼성 인터넷으로 뜬 앱을
//      '앱 밖'으로 오판해 토스를 띄운다(survey-android §4-1). 그 값은 '앱 안'이 정해진 뒤 **어느 결제 길**인지 고를 때만 쓴다.
//
// ── 이 파일이 하지 않는 것 ─────────────────────────────────────────────────────────────────────────
//   결제를 시작하지 않는다(billing.js 몫). 사람을 식별하지 않는다. 서버로 아무것도 보내지 않는다.
//   localStorage 에는 '이 기기에서 마지막으로 연 시각' 하나만 적는다 — 오프라인 안내 화면(offline.html)이
//   "마지막으로 연 시각"을 **지어내지 않고** 보여 주려고 쓰는 값이다.

export const APP_PACKAGE = 'net.earthus.app';
export const APP_SESSION_KEY = 'earthus.appContext';   // sessionStorage — 탭 하나의 수명
export const LAST_OPEN_KEY = 'earthus.lastOpen';        // localStorage — offline.html 이 읽는다
const MARKER_PARAM = 'src';
const MARKER_VALUE = 'twa';

/** 순수 판정 — DOM 없이 시험할 수 있게 입력을 모두 인자로 받는다.
 *  @param {{search?:string, sessionValue?:string|null, standalone?:boolean, referrer?:string}} env
 *  @returns {{inApp:boolean, entryKind:'twa'|'standalone'|'web', signals:object, marker:boolean}} */
export function detectAppContext(env = {}) {
  let marker = false;
  try { marker = new URLSearchParams(env.search || '').get(MARKER_PARAM) === MARKER_VALUE; } catch (_) { marker = false; }
  const sessionFlag = env.sessionValue === MARKER_VALUE;
  const standalone = env.standalone === true;
  const referrer = typeof env.referrer === 'string' ? env.referrer : '';
  const androidReferrer = referrer === `android-app://${APP_PACKAGE}`
    || referrer.startsWith(`android-app://${APP_PACKAGE}/`);
  const signals = { marker, sessionFlag, standalone, androidReferrer };
  const twa = marker || sessionFlag || androidReferrer;
  const inApp = twa || standalone;
  return { inApp, entryKind: twa ? 'twa' : standalone ? 'standalone' : 'web', signals, marker };
}

/** 주소에서 `src=twa` 하나만 뺀다. 다른 쿼리(?tc= · ?station= · FOR ME 의 ?tab=my&event=)와 #해시는 그대로 둔다. */
export function stripAppMarker(href) {
  const url = new URL(href);
  const kept = [...url.searchParams].filter(([k, v]) => !(k === MARKER_PARAM && v === MARKER_VALUE));
  url.search = '';
  kept.forEach(([k, v]) => url.searchParams.append(k, v));
  return `${url.pathname}${url.search}${url.hash}`;
}

/** 앱 안이면 어느 결제 길로 가나 — 어떤 경우에도 앱 안에서는 'web'(토스)이 나오지 않는다.
 *  'play'   = Digital Goods API(Chrome TWA) → Play 시트 (Phase 2 전까지 스텁)
 *  'native' = 네이티브 Billing 브리지(window.AndroidBilling) — 삼성 인터넷 기본 폰 보조
 *  'blocked'= 둘 다 없음 → '앱에서는 결제할 수 없습니다' (링크 없음 — Play 정책상 밖으로 나가는 결제 링크 금지)
 *  'web'    = 앱 밖(일반 브라우저 탭) — 지금까지와 같다 */
export function paymentRoute({ inApp, hasDigitalGoods, hasNativeBridge }) {
  if (!inApp) return 'web';
  if (hasDigitalGoods) return 'play';
  if (hasNativeBridge) return 'native';
  return 'blocked';
}

/** 결제 길마다 쓸 수 있는 billing.js PROVIDERS 키. ⚠️ 앱 안 길(play·native·blocked)에 'web' 을 넣지 않는다. */
export function allowedProviderKeys(route) {
  if (route === 'play') return ['play'];
  if (route === 'native') return ['google'];
  if (route === 'blocked') return [];
  return ['apple', 'google', 'web'];   // 앱 밖 — 2026-09-24 이전 동작 그대로(iOS·네이티브 브리지·웹)
}

/* ── 브라우저에서 한 번만 판정한다 ──────────────────────────────────────────────────────────────
   ⚠️ 모듈을 평가하는 순간(main.js 가 가장 먼저 부른다) 표식을 적고 주소에서 지운다.
      earth-route-state.writeEarthRoute 는 location.href 를 바탕으로 쓰므로, 표식이 남아 있으면
      이후 모든 지구 주소에 `src=twa` 가 박혀 공유 링크로 새어 나간다. */
let _ctx = { inApp: false, entryKind: 'web', signals: {}, marker: false };

function readSession() {
  try { return window.sessionStorage.getItem(APP_SESSION_KEY); } catch (_) { return null; }
}

function initInBrowser() {
  if (typeof window === 'undefined' || typeof location === 'undefined') return;
  let standalone = false;
  try { standalone = !!window.matchMedia?.('(display-mode: standalone)')?.matches; } catch (_) { standalone = false; }
  _ctx = detectAppContext({
    search: location.search,
    sessionValue: readSession(),
    standalone,
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  });
  if (_ctx.signals.marker || _ctx.signals.androidReferrer) {
    try { window.sessionStorage.setItem(APP_SESSION_KEY, MARKER_VALUE); } catch (_) { /* 저장소가 막혀도 이번 문서의 판정은 유지된다 */ }
  }
  if (_ctx.marker) {
    try { history.replaceState(history.state, '', stripAppMarker(location.href)); } catch (_) { /* 주소를 못 고쳐도 판정은 유지 */ }
  }
  try {
    window.localStorage.setItem(LAST_OPEN_KEY, JSON.stringify({ at: Date.now(), path: location.pathname }));
  } catch (_) { /* 사생활 모드 — offline.html 은 이 줄을 빼고 그린다 */ }
}
initInBrowser();

/** 이 문서가 앱 안에서 열렸는가. 문서가 뜰 때 한 번 정해진다. */
export function isInApp() { return _ctx.inApp === true; }
/** 'twa' | 'standalone' | 'web' — 측정(D22) 범주 후보. 지금은 어디에도 보내지 않는다. */
export function entryKind() { return _ctx.entryKind; }
export function appContext() { return { ..._ctx, signals: { ..._ctx.signals } }; }
