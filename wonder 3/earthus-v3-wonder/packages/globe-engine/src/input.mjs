// EARTHUS V3 WONDER — globe-engine / input = Globe Interaction (포인터 → Rotation State 명령)
//
// 규칙 원본: EARTHUS V2 `prototype/v2-three/js/main.js` class OrbitCam 의 pointerdown/move/up/cancel·wheel·gesture 처리
// (PD ROTATION RULE LOCK 2026-09-13). V2 에서 확인한 것을 그대로 옮긴다:
//   · 포인터 이벤트 한 벌(마우스·터치·펜). 캔버스는 touch-action:none — 브라우저가 한 손가락 드래그를 페이지 팬으로 못 가져가게.
//   · 포인터 캡처는 상태를 정한 '뒤에' 잡는다(캡처 실패 예외가 드래그 상태를 통째로 날리지 않게).
//   · 한 손가락(또는 마우스 왼쪽) = 회전: 첫 픽셀부터 즉시(문턱 없음), 상한 없음. 방향: 손가락이 가는 쪽으로 지구가 따라온다.
//   · 두 손가락 = 회전이 아니다(dragging=false). 핀치는 줌(V3 는 3단: 거리 비율 1.3 마다 한 단).
//   · 손가락 하나를 떼면 남은 손가락이 그 자리에서 회전을 이어받는다(굳지 않는다). pointercancel 은 lift 와 같다.
//   · iOS 사파리는 touch-action:none 으로도 페이지 핀치 줌을 막지 못한다 → document 의 gesturestart/change/end 를 막는다(카드·패널 위는 예외).
// V3 고유: 톡(탭) = 지역 선택(이동 ≤ 8px · 500ms 이내 · pointerup 만), 휠 = 줌 단, 키보드(화살표·+/−·Escape). 틸트·자동회전은 V3 에 없다.
const TAP_MS = 500, TAP_PX = 8, PINCH_RATIO = 1.3, PINCH_MIN_PX = 8, WHEEL_STEP = 60, WHEEL_COOLDOWN_MS = 320, KEY_PX = 40;

export function attachGlobeInput(el, { camera, onTap = () => {}, onInteract = () => {}, onBack = () => {}, onGesture = () => {}, gestureExempt = '#storyCard, #qa, #log', doc = el.ownerDocument ?? null } = {}) {
  const touches = new Map();          // V2: 터치 포인터만 추적. 마우스·펜은 dragging 플래그만.
  let dragging = false, lastX = 0, lastY = 0, lastPinch = null;
  let downAt = 0, downXY = null, moved = false, wheelAcc = 0, wheelAt = -Infinity;   // −∞: 첫 320ms 안의 휠도 받는다

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const capture = e => { try { el.setPointerCapture?.(e.pointerId); } catch { /* 살아있는 포인터가 아니면 그냥 넘어간다 */ } };
  const release = e => { try { el.releasePointerCapture?.(e.pointerId); } catch { /* */ } };
  const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  const down = e => {
    if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;   // V3 에 틸트(가운데 버튼)가 없다 — 왼쪽만
    onInteract();
    if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size >= 2) {                                                        // 두 손가락은 회전이 아니다
      dragging = false; moved = true; lastPinch = { dist: pinchDist() };
      capture(e); return;
    }
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    downAt = now(); downXY = { x: e.clientX, y: e.clientY }; moved = false;
    camera.beginDrag();
    capture(e);                                                                     // 상태를 정한 뒤에 잡는다 (V2)
  };

  const move = e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      const t = touches.get(e.pointerId); t.x = e.clientX; t.y = e.clientY;
      if (touches.size >= 2) {
        const dist = pinchDist();
        if (lastPinch && dist > PINCH_MIN_PX && lastPinch.dist > PINCH_MIN_PX) {
          const ratio = dist / lastPinch.dist;
          if (ratio > PINCH_RATIO) { camera.zoomIn(); lastPinch = { dist }; onInteract(); onGesture('pinch-in', { pointerType: 'touch' }); }
          else if (ratio < 1 / PINCH_RATIO) { camera.zoomOut(); lastPinch = { dist }; onInteract(); onGesture('pinch-out', { pointerType: 'touch' }); }
        } else if (!lastPinch) lastPinch = { dist };
        dragging = false;
        return;
      }
    }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (!moved && downXY && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > TAP_PX) { moved = true; onGesture('drag', { pointerType: e.pointerType }); }
    camera.drag(dx, dy);
  };

  // 손을 떼는 처리 — pointerup 과 pointercancel 이 같다. 두 손가락 중 하나만 떼면 남은 손가락으로 회전을 이어받는다.
  const lift = e => {
    const singleTouch = e.pointerType !== 'touch' || touches.size === 1;
    const tapCandidate = dragging && !moved && singleTouch && e.type === 'pointerup' && now() - downAt < TAP_MS;
    if (e.pointerType === 'touch') touches.delete(e.pointerId);
    if (touches.size < 2) lastPinch = null;
    if (touches.size === 1) {
      const t = [...touches.values()][0];
      dragging = true; lastX = t.x; lastY = t.y; moved = true;
      camera.beginDrag();
    } else {
      dragging = false;
      camera.endDrag();
    }
    release(e);
    if (tapCandidate) {
      const r = el.getBoundingClientRect();
      onGesture('tap', { pointerType: e.pointerType });
      onTap({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
  };

  const wheel = e => {
    e.preventDefault(); onInteract();
    const t = now(); if (t - wheelAt < WHEEL_COOLDOWN_MS) return;
    wheelAcc += e.deltaY;
    if (wheelAcc <= -WHEEL_STEP) { camera.zoomIn(); wheelAcc = 0; wheelAt = t; onGesture('wheel-in', {}); }
    else if (wheelAcc >= WHEEL_STEP) { camera.zoomOut(); wheelAcc = 0; wheelAt = t; onGesture('wheel-out', {}); }
  };
  const key = e => {
    const map = { ArrowLeft: [KEY_PX, 0], ArrowRight: [-KEY_PX, 0], ArrowUp: [0, KEY_PX], ArrowDown: [0, -KEY_PX] };
    if (map[e.key]) { e.preventDefault(); onInteract(); camera.beginDrag(); camera.drag(map[e.key][0], map[e.key][1]); camera.endDrag(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); onInteract(); camera.zoomIn(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); onInteract(); camera.zoomOut(); }
    else if (e.key === 'Escape') { onBack(); }
  };
  const ctx = e => e.preventDefault();
  // iOS 사파리 전용 gesture 이벤트 — 지구 핀치가 페이지 확대와 싸우지 않게. 글·카드를 읽는 패널 위에서는 확대를 살려 둔다 (V2).
  const gesture = e => { if (e.target?.closest?.(gestureExempt)) return; e.preventDefault(); };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', lift);
  el.addEventListener('pointercancel', lift);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('keydown', key);
  el.addEventListener('contextmenu', ctx);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) doc?.addEventListener?.(type, gesture, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', lift); el.removeEventListener('pointercancel', lift);
    el.removeEventListener('wheel', wheel); el.removeEventListener('keydown', key); el.removeEventListener('contextmenu', ctx);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) doc?.removeEventListener?.(type, gesture);
  };
}
