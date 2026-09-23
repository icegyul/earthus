// 지구를 움직이는 동안 창·메뉴를 걷어 낸다 — 2026-09-24 PD:
//   "화면을 움직이면 모든 창과 메뉴들 사라지고, 멈추면 다시 메뉴가 보이고, 터치로 지역 선택하면 정보창 띄우자"
//   (그 전에 "창이 너무 많이 떠" · "창도 답답하고" 가 여러 번 있었다.)
//
// 무엇을 하나
//   · 손(한 손가락 끌기 · 두 손가락 핀치/틸트 · 마우스 끌기 · 가운데 버튼 틸트 · 휠 줌)이 지구를 **움직이기 시작하면**
//     body.is-moving 을 건다 → motion-chrome.css 가 창들을 opacity 0 + pointer-events none 으로 걷는다.
//   · 손이 떨어지고 **카메라가 실제로 멈춘 뒤** RESTORE_S(0.4 s) 가 지나면 is-moving 을 벗기고 mc-back 을 0.2 s 건다(다시 나타나는 페이드).
//   · 탭(누름 → 뗌, 움직임 ≤ TAP_MOVE_PX)은 아무것도 숨기지 않는다 — main.js pointerup 의 '고르기' 와 **같은 문턱**을 쓴다.
//     (main.js 가 이 파일의 TAP_MOVE_PX 를 가져다 쓴다. 문턱이 둘이면 '숨겼는데 골랐다' / '안 숨겼는데 안 골랐다' 가 생긴다.)
//   · 코드가 옮기는 카메라(검색·사건 선택의 fly-to, 국가 포커스 glide, 자동회전)는 숨기지 않는다 — 손이 시작한 움직임만 센다.
//   · 창 위의 손(시트 스크롤·메뉴·타임라인 슬라이더·시트 손잡이)은 캔버스에 닿지 않으므로 애초에 여기로 오지 않는다.
//
// 왜 opacity 뿐인가 — display 를 바꾸면 레이아웃이 다시 흐르고(시트 peek/half/full 높이 재계산) 상태가 날아간다.
//   요소는 그 자리에 그대로 있고 보이지만 않는다. 시트의 단계·스크롤, 서랍의 열림/닫힘은 그대로 남는다.
// 왜 transition 이 아니라 animation 인가 — 걷어 낼 창들이 이미 transition 을 갖고 있다(.edge-tab transform 0.42 s,
//   #bottom-nav opacity·transform, #pop-menu visibility 지연 …). transition 을 덮어쓰면 지구를 누르는 순간 닫히는
//   서랍의 미끄러짐 같은 제 움직임이 끊긴다. 걷어 낼 창에는 animation 이 하나도 없어 그쪽을 쓴다(2026-09-24 실측 grep).
//
// 이 파일은 DOM·THREE 없이 노드에서 시험할 수 있는 상태기계(createMotionChrome)와,
// 브라우저에서 그것을 body 클래스·스타일에 잇는 한 줄(installMotionChrome)로 나뉜다.

export const TAP_MOVE_PX = 6;       // 이보다 많이 움직이면 '끌기' — 탭(고르기)이 아니다. main.js pointerup 과 같은 값.
export const RESTORE_S = 0.4;       // 카메라가 멈춘 뒤 이만큼 더 가만 있어야 창이 돌아온다.
// 남은 회전이 화면에서 이 픽셀보다 작으면 '멈췄다'. OrbitCam 감쇠(k=1-exp(-dt·8))는 휙 끌면 떼는 순간 100px 가까이 남긴다 —
//   0.5px 까지 기다리면 뗀 뒤 1.07 s(60fps 흉내), 2px 이면 0.9 s. 마지막 2px 은 0.2 s 에 걸쳐 흘러 눈에 거의 안 보인다.
export const SETTLE_PX = 2;
// 남은 줌이 지표까지 높이의 이 비율보다 작으면 '멈췄다'. 0.2% 면 휠 한 칸 뒤 1.00 s, 0.5% 면 0.88 s(60fps 흉내 · 네 칸 1.13 s · 핀치 1.4배 1.03 s) — 남은 0.5% 는 프레임당 0.06% 로 안 보인다.
export const SETTLE_DIST = 0.005;
export const SETTLE_TILT = 0.002;   // 남은 틸트(rad).
export const BACK_MS = 220;         // mc-back(다시 나타나는 페이드 0.18 s)을 걸어 두는 시간.
export const WATCHDOG_MS = 2500;    // 손을 뗀 뒤 이만큼 tick 이 안 오면(지도·시뮬레이션 모드로 렌더가 멈춤) 그냥 돌려놓는다.
// (2026-09-24 검토 정정) 손을 뗀 뒤 tick 은 오는데 카메라가 끝내 '멈춤' 판정을 못 받는 경우(목표가 NaN·다른 코드가 목표를 계속 민다)의 상한.
//   감시견은 tick 이 오면 다시 걸리기만 해서 이 경우를 못 끊었다. 휙 끌기+국가 glide 1.4 s 도 2 s 안에 멈추므로 4 s 는 정상 동작을 자르지 않는다.
export const MAX_FREE_S = 4;

// 순수 상태기계. onChange(on) 은 상태가 **바뀔 때만** 불린다(프레임마다 DOM 을 건드리지 않는다).
export function createMotionChrome({
  tapPx = TAP_MOVE_PX,
  restoreS = RESTORE_S,
  onChange = null,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h),
  watchdogMs = WATCHDOG_MS,
} = {}) {
  const downs = new Map();   // 캔버스에서 눌린 포인터 → 누른 자리
  let gesture = false;       // 이번 손놀림이 '끌기' 문턱을 넘었나
  let moving = false;        // body.is-moving 상태
  let rest = 0;              // 손을 떼고 카메라가 멈춘 뒤 흐른 시간(s)
  let dog = null;
  let ticked = 0;            // 감시견을 건 뒤 들어온 tick 수
  let free = 0;              // (2026-09-24 검토 정정) 모든 손이 떨어진 뒤 흐른 tick 시간(s) — MAX_FREE_S 상한용

  const set = (on) => {
    if (on === moving) return;
    moving = on;
    if (onChange) onChange(on);
  };
  const finish = () => { gesture = false; rest = 0; free = 0; set(false); };
  // 감시견 — 렌더 루프가 멈춘 모드(지도·시뮬레이션·사진관)로 넘어가면 tick 이 안 온다. 그때 창이 영영 숨지 않게.
  //   tick 이 계속 오고 있으면(느린 폰에서 감쇠가 길어지는 것뿐) 끊지 않고 다시 건다 — 멈춤 판정은 tick 의 몫이다.
  const arm = () => {
    if (dog != null) clearTimer(dog);
    ticked = 0;
    dog = setTimer(() => {
      dog = null;
      if (!moving) return;
      if (ticked > 0) { arm(); return; }
      if (downs.size === 0) finish();
    }, watchdogMs);
  };
  const start = () => { gesture = true; rest = 0; free = 0; set(true); arm(); };

  return {
    down(id, x, y) { downs.set(id, { x, y }); },
    // 눌린 포인터가 누른 자리에서 tapPx 를 **넘게** 벗어나면 끌기다(main.js 의 `moved > 6` 과 같은 부등호).
    move(id, x, y) {
      const d = downs.get(id);
      if (!d) return;   // 마우스를 누르지 않고 지나가는 것(hover)은 움직임이 아니다
      if (gesture) { rest = 0; free = 0; if (!moving) set(true); arm(); return; }
      if (Math.hypot(x - d.x, y - d.y) > (d.px != null ? d.px : tapPx)) start();   // d.px: 길게 누르기로 넓힌 문턱(2026-09-24 검토 정정)
    },
    up(id) { downs.delete(id); if (moving) arm(); },
    // (2026-09-24 검토 정정) 길게 누르기가 퀵메뉴를 연 손가락 — 그 손가락의 문턱을 길게 누르기 허용 폭(px, main.js 10px)으로 넓히고,
    //   다른 손이 끌고 있지 않으면 걷혀 있던 창을 바로 돌려놓는다(메뉴가 걷힌 창들 사이에 안 보이게 열리지 않게).
    //   메뉴를 연 뒤 그 폭 안의 흔들림은 걷지 않고, 그 폭을 넘게 끌면(=지구를 돌리면) 다시 걷는다.
    longPress(id, px) {
      const d = downs.get(id);
      if (!d) return;
      d.px = px;
      if (gesture && downs.size === 1) finish();
    },
    wheel() { start(); },
    // 한 프레임마다(OrbitCam.update) 부른다. settled = 카메라가 목표에 닿았나.
    tick(dt, settled) {
      if (!gesture) return moving;
      ticked += 1;
      if (downs.size > 0) { rest = 0; free = 0; return moving; }
      // (2026-09-24 검토 정정) 손이 다 떨어졌는데 MAX_FREE_S 가 지나도 멈춤 판정이 안 오면 그냥 돌려놓는다 — 창이 영영 숨지 않게.
      free += dt;
      if (free >= MAX_FREE_S) { finish(); return moving; }
      if (!settled) { rest = 0; return moving; }
      rest += dt;
      if (rest >= restoreS) finish();
      return moving;
    },
    // (2026-09-24 검토 정정) 돌려놓기만 하고 누른 기록은 남긴다 — 확정된 탭(main.js canvas pointerup)용.
    //   reset() 을 쓰면 다른 손가락이 끌던 중일 때 그 손가락의 누른 자리까지 지워져, 그 뒤 끌어도 다시 걷지 못했다.
    release() { finish(); },
    // 앱 전환 등으로 손이 사라지면(pointerup 이 안 오면) 누른 기록을 버리고 돌려놓는다.
    reset() { downs.clear(); finish(); },
    get moving() { return moving; },
    get held() { return downs.size; },
  };
}

// 카메라가 목표에 닿았나 — OrbitCam 의 공개 값만 본다(yaw·pitch·dist·tilt 와 그 target, dragSpeed()).
// 회전은 화면 픽셀로 잰다: 같은 라디안이라도 도시까지 줌인하면 수십 픽셀이다.
// 자동회전 중이면 targetYaw 가 매 프레임 앞서 가므로 yaw 차이는 보지 않는다(손이 만지면 자동회전은 이미 꺼진다).
export function orbitSettled(o) {
  const pxPerRad = 1 / Math.max(o.dragSpeed(), 1e-9);
  const yawPx = o.autoRotate ? 0 : Math.abs(o.targetYaw - o.yaw) * Math.cos(o.pitch) * pxPerRad;
  const pitchPx = Math.abs(o.targetPitch - o.pitch) * pxPerRad;
  const distRel = Math.abs(o.targetDist - o.dist) / Math.max(o.dist - 1, 1e-4);
  const tilt = Math.abs(o.targetTilt - o.tilt);
  return yawPx < SETTLE_PX && pitchPx < SETTLE_PX && distRel < SETTLE_DIST && tilt < SETTLE_TILT;
}

// 브라우저 배선 — body 클래스 두 개와 스타일 파일 하나. index.html 은 건드리지 않는다
// (같은 날 폰 상단 줄·범례·시트를 고치는 작업이 index.html <style> 을 동시에 바꾸고 있어, 한 줄이라도 충돌을 피한다.
//  ui-shell.js 가 menu-v1look.css 를 붙이는 것과 같은 방식이다.)
export function installMotionChrome(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || !doc.body) return createMotionChrome();
  if (!doc.getElementById('motion-chrome-style')) {
    const css = doc.createElement('link');
    css.id = 'motion-chrome-style';
    css.rel = 'stylesheet';
    css.href = new URL('./motion-chrome.css?v=1', import.meta.url).href;
    doc.head.append(css);
  }
  let backTimer = null;
  const body = doc.body;
  const mc = createMotionChrome({
    onChange(on) {
      clearTimeout(backTimer);
      if (on) {
        body.classList.remove('mc-back');
        body.classList.add('is-moving');
      } else {
        // 같은 스타일 계산 안에서 is-moving 을 벗기고 mc-back 을 건다 — 숨김 animation 이 끝나는 자리에서 나타남 animation 이 0 부터 시작한다.
        body.classList.remove('is-moving');
        body.classList.add('mc-back');
        backTimer = setTimeout(() => body.classList.remove('mc-back'), BACK_MS);
      }
    },
  });
  // 탭을 떠나면(앱 전환) pointerup 이 안 올 수 있다 — 돌아왔을 때 창이 숨은 채 남지 않게.
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) mc.reset(); });
  // (2026-09-24 검토 정정) 잃어버린 pointerup 으로 창이 영영 숨던 두 길을 막는다(실측: 둘 다 6 s 넘게 숨은 채 굳었다).
  //   ① 캔버스가 up 을 못 받는 경우(setPointerCapture 실패는 main.js 가 조용히 삼킨다) — 문서 어디서든 그 포인터의 up/cancel 을 잡는다.
  //      캡처 단계라 캔버스의 lift 보다 먼저 불리지만 up() 은 지우기뿐이라 두 번 불려도 같다.
  //   ② 창 blur(Alt-Tab·다른 창 클릭) — visibilitychange 가 안 오고 up 도 안 온다.
  const view = doc.defaultView;
  const lost = (e) => { if (e && e.pointerId != null) mc.up(e.pointerId); };
  doc.addEventListener('pointerup', lost, true);
  doc.addEventListener('pointercancel', lost, true);
  if (view) view.addEventListener('blur', () => mc.reset());
  return mc;
}
