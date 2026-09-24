// 뒤로 단추로 서랍·시트를 닫는다 — v1·v2 공용 (2026-09-24, 지시서 §3-8-1 · Phase 1 완료 기준 12)
//
// ── 왜 ─────────────────────────────────────────────────────────────────────────────────────────────
//   안드로이드 앱(TWA)에서 뒤로 단추는 브라우저의 '뒤로'다. 지금까지 popstate 를 받는 곳은 v1 earth-view-state.js
//   하나뿐이라, 서랍·시트·Inspector 가 열린 채 뒤로를 누르면 페이지가 바뀌거나 앱이 닫혔다.
//   결과 기준: "열린 서랍·시트는 뒤로 한 번에 닫히고, 첫 화면에서 뒤로를 누르면 앱이 끝난다."
//
// ── 어떻게 ─────────────────────────────────────────────────────────────────────────────────────────
//   · 무엇이든 하나라도 열리면 **표식 칸 하나**를 같은 주소로 쌓는다(pushState). 몇 겹이 열려도 칸은 하나다.
//   · 뒤로를 누르면(표식 칸을 떠나면) 가장 나중에 연 것 하나를 닫는다. 아직 열린 것이 남으면 칸을 다시 쌓는다.
//   · 화면의 ✕·바깥 탭·Esc 로 전부 닫히면 우리가 쌓은 칸을 우리가 걷는다(history.back) — 칸이 남으면
//     "닫았는데 뒤로를 한 번 더 눌러야 나간다"가 된다.
//   · 우리 때문에 일어난 popstate 는 표시(consumed)해 둔다. 주소 복원기(v1 earth-view-state · v2 해시 링크)는
//     이 표시를 보고 지구 장면을 되돌리지 않는다 — 대신 onConsumedPop 훅으로 **지금 상태의 주소**를 다시 쓴다
//     (그래서 닫은 뒤 주소는 열기 전과 같다).
//   ⚠️ popstate 는 capture 로 받는다 — 같은 window 대상에서는 capture 듣개가 먼저 불린다. 다른 듣개보다 먼저
//      consumed 표시를 붙여야 v1 earth-view-state 가 레이어를 초기화하지 않는다.
//   (2026-09-24 정정) 위 줄은 틀렸다 — Chromium 실측에서 window popstate 는 등록 순서대로 불렸다. consumed() 가
//      순서와 무관하게 미리 판정하도록 고쳤다(아래 consumed 주석).
//
// ── 하지 않는 것 ───────────────────────────────────────────────────────────────────────────────────
//   무엇이 서랍인지 모른다 — 각 앱이 register(id, {isOpen, close}) 로 알려 준다(v1 main.js · v2 ui-shell.js).
//   애니메이션·타이머 없음. 저장소에 아무것도 적지 않는다.
//
// ── (2026-09-24 정정, PD 결정) 뒤로 단추는 **앱 안에서만** ─────────────────────────────────────────
//   PD: "뒤로 단추 = 앱만". 일반 브라우저 탭(폰·데스크톱)에서는 이 브랜치 이전과 **똑같이** 움직여야 한다 —
//   서랍을 열어도 칸을 쌓지 않고, v1 지구 단계(Earth→Style→Data) 뒤로도 예전 그대로다.
//   그래서 backStack() 은 app-context.js 의 isInApp() 이 거짓이면 **아무것도 하지 않는 한 벌**(createInertBackStack)을 준다:
//   popstate 를 듣지 않고, history 를 건드리지 않고, consumed()·suppressPush()·armedNow() 는 늘 false 다.
//   호출부(v1 main.js · earth-view-state · auth · v2 main.js · ui-shell)는 그대로 부르면 되고, 웹 동작을 바꾸는 줄은
//   backStack().enabled 로 묶는다(earth-view-state.js · auth.js).
//   ⚠️ app-context.js 를 ?v=2 로 부른다 — v1 main.js·billing.js·v2 main.js 와 **같은 지정자**여야 한 문서에 판정이 한 벌이다
//      (v2 번들에서는 ./shared/ 안에서 ./app-context.js?v=2 로 풀려 main.js 의 ./shared/app-context.js?v=2 와 같아진다).
import { isInApp } from './app-context.js?v=2';

export const OVERLAY_STATE_KEY = 'earthusOverlay';

const isMarker = (st) => !!(st && typeof st === 'object' && st[OVERLAY_STATE_KEY]);
const withoutMarker = (st) => {
  if (!st || typeof st !== 'object') return st ?? null;
  const { [OVERLAY_STATE_KEY]: _drop, ...rest } = st;
  return Object.keys(rest).length ? rest : null;
};

/** @param {{history:History, location:Location, addEventListener:Function}} win */
export function createBackStack(win) {
  const hist = win.history;
  const overlays = new Map();   // id → { isOpen(), close() }
  let order = [];               // 열린 순서 — 마지막이 맨 위
  let armed = false;            // 우리 표식 칸이 지금 칸인가
  let token = 0;
  let selfPops = 0;             // 우리가 부른 history.back() 이 아직 도착하지 않은 수
  let handling = false;         // 뒤로 때문에 닫는 중(이 사이의 주소 쓰기는 칸을 쌓지 않는다)
  let lastConsumed = null;
  const consumedHooks = [];
  let queued = false;
  /* (2026-09-24, PD 결정) 앱이 **스스로** 연 것(사람이 누르지 않은 것) — 열려 있어도 칸을 쌓지 않는다.
     v2 는 첫 방문 안내를 닫으면 Intelligence 시트를 스스로 편다. 그 시트가 표식 칸을 만들면 첫 화면에서
     뒤로 한 번이 앱을 끝내지 못하고 시트만 닫았다(PD ②). 사람이 연 것만 센다 — 닫히면 표시를 잊는다. */
  const silent = new Set();

  const openIds = () => [...overlays].filter(([, o]) => {
    try { return !!o.isOpen(); } catch (_) { return false; }
  }).map(([id]) => id);
  /** 칸을 세는 열린 것 — 앱이 스스로 연 것은 뺀다. */
  const countedIds = (open = openIds()) => open.filter((id) => !silent.has(id));

  function sync() {
    queued = false;
    const open = openIds();
    [...silent].forEach((id) => { if (!open.includes(id)) silent.delete(id); });   // 닫혔다 — 다음에 사람이 열면 센다
    order = order.filter((id) => open.includes(id));
    open.forEach((id) => { if (!order.includes(id)) order.push(id); });
    const live = countedIds(open);
    if (live.length && !armed) {
      token += 1;
      const base = hist.state && typeof hist.state === 'object' ? hist.state : {};
      try { hist.pushState({ ...base, [OVERLAY_STATE_KEY]: token }, '', win.location.href); armed = true; } catch (_) { armed = false; }
    } else if (!live.length && armed) {
      armed = false;
      /* 화면에서 닫았다 — 우리 칸이 아직 지금 칸이면 걷는다. 주소 복원기가 칸 위에 새 칸을 쌓았으면
         (그럴 일은 suppressPush 로 막지만) 그 칸은 사용자의 것이라 건드리지 않는다. */
      if (isMarker(hist.state)) { selfPops += 1; hist.back(); }
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  }

  function consume(e) {
    lastConsumed = e;
    try { e.earthusOverlayPop = true; } catch (_) { /* 읽기 전용 이벤트 — lastConsumed 로 판정한다 */ }
  }

  function runHooks() {
    consumedHooks.forEach((fn) => { try { fn(); } catch (err) { console.warn('[back-close] 주소 다시 쓰기 실패', err?.message); } });
  }

  function onPop(e) {
    if (selfPops > 0) {
      // 화면에서 닫은 뒤 우리가 걷은 칸 — 이미 닫혀 있다. 주소만 지금 상태로 맞춘다.
      selfPops -= 1;
      consume(e);
      handling = true;
      try { runHooks(); } finally { handling = false; }
      return;
    }
    if (armed && !isMarker(e.state)) {
      // 사용자가 뒤로를 눌러 우리 칸을 떠났다 → 맨 위 하나만 닫는다.
      armed = false;
      consume(e);
      handling = true;
      try {
        // (2026-09-24 정정) 맨 위 하나 = 사람이 연 것 가운데 마지막. 앱이 스스로 연 시트는 뒤로로 닫지 않는다(그 칸이 없다).
        const live = order.filter((id) => !silent.has(id));
        const top = live[live.length - 1];
        try { overlays.get(top)?.close(); } catch (err) { console.warn('[back-close] 닫기 실패', top, err?.message); }
        order = order.filter((id) => id !== top);
        runHooks();
      } finally { handling = false; }
      // 아직 열린 것이 있으면(예: 지도 화면 시트 + 서랍) 칸을 다시 쌓는다 — 다음 뒤로가 그것을 닫는다.
      sync();
      return;
    }
    if (isMarker(e.state)) {
      if (countedIds().length) { armed = true; return; }   // 앞으로 가기로 우리 칸에 돌아왔다 — 주소 복원은 평소대로
      /* 열린 것이 없는데 표식 칸에 섰다(새로 읽은 문서 · 오래된 칸). 표식을 지워 다음 뒤로가 헛돌지 않게 한다. */
      try { hist.replaceState(withoutMarker(e.state), '', win.location.href); } catch (_) { /* 무시 */ }
    }
  }

  win.addEventListener('popstate', onPop, true);
  // 새로 읽은 문서가 옛 표식 칸 위에서 시작했으면(로그인에서 돌아옴·새로고침) 표식을 지운다.
  if (isMarker(hist.state)) {
    try { hist.replaceState(withoutMarker(hist.state), '', win.location.href); } catch (_) { /* 무시 */ }
  }

  return {
    /** (2026-09-24) 앱 안의 진짜 한 벌이다 — 웹 탭의 한 벌(createInertBackStack)은 false. 웹 동작을 바꾸는 줄을 이것으로 묶는다. */
    enabled: true,
    /** (2026-09-24, PD 결정) 앱이 스스로 연 것을 알린다 — 여는 줄 **바로 뒤, 같은 흐름에서** 부른다(맞추기가 마이크로태스크라
     *  그 전에 표시가 붙어야 칸을 쌓지 않는다). 사람이 이미 열어 둔 것(order 에 있음)은 바꾸지 않는다. */
    openedByApp(id) { if (!order.includes(id)) silent.add(id); schedule(); return this; },
    /** 서랍·시트 하나를 알린다. isOpen 은 DOM 을 읽는 가벼운 함수여야 한다. */
    register(id, { isOpen, close }) { overlays.set(id, { isOpen, close }); schedule(); return this; },
    /** 열림·닫힘이 바뀌었을 수 있다 — 한 번에 모아 맞춘다. */
    sync: schedule,
    /** 지금 바로 맞춘다(시험·동기 경로용). */
    syncNow: sync,
    /** 이 요소 아래 class 변화를 지켜본다. */
    watch(root, options = {}) {
      if (typeof MutationObserver === 'undefined' || !root) return this;
      new MutationObserver(schedule).observe(root, {
        subtree: options.subtree !== false, attributes: true, attributeFilter: ['class'],
      });
      schedule();
      return this;
    },
    /** 뒤로 때문에 우리가 처리한(또는 곧 처리할) popstate 인가 — 주소 복원기가 먼저 묻는다.
     *  (2026-09-24 정정) 실측: Chromium 은 window 의 popstate 를 **등록 순서대로** 부른다 — capture 로 걸어도
     *  먼저 등록된 earth-view-state 의 듣개가 먼저 돌았다(서랍을 ✕ 로 닫자 Style 이 되살아나 서랍이 다시 열렸다).
     *  그래서 우리 처리기가 아직 안 돌았어도 **같은 규칙으로 미리 판정**한다 — 순서와 무관하게 같은 답이 나온다. */
    consumed(e) {
      if (!e) return false;
      if (e === lastConsumed || e.earthusOverlayPop === true) return true;
      return selfPops > 0 || (armed && !isMarker(e.state));
    },
    /** 우리 때문에 일어난 pop 뒤에 부를 함수 — 지금 상태의 주소를 다시 쓴다. */
    onConsumedPop(fn) { if (typeof fn === 'function') consumedHooks.push(fn); return this; },
    /** 주소 쓰기가 새 칸(pushState)을 만들면 안 되는 때 — 무엇이 열려 있거나, 뒤로 때문에 닫는 중. */
    suppressPush() { return handling || countedIds().length > 0; },
    /** 우리 표식 칸이 지금 칸인가(OAuth 로 떠날 때 replace 를 고르는 데 쓴다). */
    armedNow() { return armed && isMarker(hist.state); },
    /** 시험용 상태 */
    debug() { return { enabled: true, armed, order: [...order], silent: [...silent], selfPops, token }; },
  };
}

/** (2026-09-24, PD 결정 '뒤로 단추 = 앱만') 일반 브라우저 탭의 한 벌 — 아무것도 하지 않는다.
 *  popstate 를 듣지 않고 history 를 건드리지 않는다. 그래서 웹 탭의 뒤로는 이 브랜치 이전과 같다. */
export function createInertBackStack() {
  const inert = {
    enabled: false,
    openedByApp() { return inert; },
    register() { return inert; },
    sync() {},
    syncNow() {},
    watch() { return inert; },
    consumed() { return false; },
    onConsumedPop() { return inert; },
    suppressPush() { return false; },
    armedNow() { return false; },
    debug() { return { enabled: false, armed: false, order: [], silent: [], selfPops: 0, token: 0 }; },
  };
  return inert;
}

/* 문서마다 하나 — v1(main.js)·v2(ui-shell.js) 가 같은 것을 쓴다.
   (2026-09-24 정정, 검수) 모듈 변수 하나로는 '문서마다 하나'가 보장되지 않았다. v2 문서는 번들의
   ./shared/back-close.js?v=1 과, LAB 화면(lab-requests)이 끌어오는 v1 /js/auth.js 의 /js/back-close.js 를
   **서로 다른 모듈 주소**로 읽는다 — 모듈이 두 벌이면 createBackStack 이 두 번 돌아, 두 번째가 만들어지는 순간
   열린 서랍의 표식 칸을 지우고(생성자의 '옛 표식 지우기') popstate 듣개도 둘이 된다. 그래서 window 에 한 벌을 둔다.
   (2026-09-24 정정) v2 의 지정자는 이제 ?v=2 다(웹 탭 무동작 · 앱이 연 시트 — 이 파일이 바뀌었다). 웹 탭의 무동작 한 벌도
   window 에 걸어 두 번째 모듈이 다른 판정으로 진짜 한 벌을 만들지 않게 한다. */
const SHARED_KEY = '__earthusBackStack';
let _shared = null;
/* (2026-09-24 정정, PD 결정) 앱 안(isInApp)일 때만 진짜 한 벌을 만든다. 웹 탭은 아무것도 하지 않는 한 벌.
   판정은 문서가 뜰 때 한 번 정해진다(app-context.js) — 첫 호출이 정한 한 벌이 문서 끝까지 간다.
   options.inApp 은 **시험용**이다(node 에는 문서가 없어 isInApp() 이 늘 거짓). 운영 호출부는 인자 없이 부른다. */
export function backStack(options = {}) {
  if (_shared) return _shared;
  if (typeof window !== 'undefined' && window[SHARED_KEY]) { _shared = window[SHARED_KEY]; return _shared; }
  let inApp = false;
  try { inApp = (typeof options.inApp === 'function' ? options.inApp : isInApp)() === true; } catch (_) { inApp = false; }
  _shared = inApp && typeof window !== 'undefined' ? createBackStack(window) : createInertBackStack();
  if (typeof window === 'undefined') return _shared;
  try { window[SHARED_KEY] = _shared; } catch (_) { /* 못 걸어도 이 모듈 안에서는 한 벌이다 */ }
  return _shared;
}

/** OAuth 에서 돌아온 문서가 몇 칸 뒤로 가면 떠나기 전 화면인가 (auth.js).
 *  @param {{savedLength:number, replaced:boolean, nowLength:number}} p
 *  savedLength = 떠나기 직전 history.length (표식 칸이 지금 칸이라 앞 칸이 없는 상태)
 *  replaced    = 떠날 때 location.replace 로 지금 칸(표식 칸)을 Google 로 바꿨는가 → 그 아래 칸으로 간다
 *  @returns {number} 0 이면 움직이지 않는다 */
export function oauthRewindSteps({ savedLength, replaced, nowLength }) {
  if (!Number.isInteger(savedLength) || !Number.isInteger(nowLength)) return 0;
  /* (2026-09-24 정정) 표식 칸을 바꾼(replace) 경우에만 되감는다. 그때만 '떠난 칸 = 기록의 끝'이 보장된다
     (표식 칸을 막 쌓아 앞쪽 칸이 잘렸다). 표식 없이 떠났으면 앞쪽 칸이 남아 있었을 수 있어 savedLength 가
     실제 위치보다 커지고, go(-n) 이 Google 칸에 떨어질 수 있다 — 그럴 바엔 움직이지 않는다. */
  if (replaced !== true) return 0;
  const target = savedLength - 1 - (replaced ? 1 : 0);   // 돌아갈 칸의 번호
  const current = nowLength - 1;
  if (target < 0 || current <= target) return 0;
  const steps = current - target;
  // Chrome 은 기록을 50칸에서 자른다 — 가까이 가면 번호가 밀려 엉뚱한 칸으로 간다. 그때는 움직이지 않는다.
  if (nowLength >= 50 || steps > 20) return 0;
  return steps;
}
