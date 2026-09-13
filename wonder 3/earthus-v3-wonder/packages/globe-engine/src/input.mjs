// EARTHUS V3 WONDER — globe-engine / input. 포인터(마우스·터치·펜) → 카메라 명령.
// 한 손가락 = 회전(관성), 두 손가락 = 핀치(줌 단 이동, 연속 아님 — 3단 잠금), 짧게 톡 = 탭(지역 선택), 휠 = 줌 단.
// 키보드: 화살표 회전, +/- 줌, Escape = 지구로.
const TAP_MS = 500, TAP_PX = 8, PINCH_RATIO = 1.3, WHEEL_STEP = 60, WHEEL_COOLDOWN_MS = 320;

export function attachGlobeInput(el, { camera, onTap, onInteract = () => {}, onBack = () => {} }) {
  const pointers = new Map();
  let moved = false, downAt = 0, downXY = null, last = null, lastT = 0, pinchBase = null, wheelAcc = 0, wheelAt = 0;

  const now = () => performance.now();
  const dist2 = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  const down = e => {
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
    try { el.setPointerCapture(e.pointerId); } catch { /* 일부 브라우저 */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    onInteract();
    if (pointers.size === 1) {
      moved = false; downAt = now(); downXY = { x: e.clientX, y: e.clientY }; last = { ...downXY }; lastT = downAt;
      camera.beginDrag();
    } else if (pointers.size === 2) { pinchBase = dist2(); moved = true; }
    e.preventDefault();
  };
  const move = e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      const t = now(), dt = Math.max(1 / 240, (t - lastT) / 1000);
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (!moved && Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > TAP_PX) moved = true;
      if (moved) camera.drag(dx, dy, dt);
      last = { x: e.clientX, y: e.clientY }; lastT = t;
    } else if (pointers.size === 2 && pinchBase) {
      const d = dist2(), ratio = d / pinchBase;
      if (ratio > PINCH_RATIO) { camera.zoomIn(); pinchBase = d; onInteract(); }
      else if (ratio < 1 / PINCH_RATIO) { camera.zoomOut(); pinchBase = d; onInteract(); }
    }
    e.preventDefault();
  };
  const up = e => {
    if (!pointers.has(e.pointerId)) return;
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    try { el.releasePointerCapture(e.pointerId); } catch { /* */ }
    if (wasSingle) {
      camera.endDrag();
      if (!moved && now() - downAt < TAP_MS) {
        const r = el.getBoundingClientRect();
        onTap({ x: e.clientX - r.left, y: e.clientY - r.top });
      }
    }
    if (pointers.size < 2) pinchBase = null;
    if (pointers.size === 1) { const [q] = pointers.values(); last = { x: q.x, y: q.y }; lastT = now(); moved = true; camera.beginDrag(); }
  };
  const cancel = e => { pointers.delete(e.pointerId); if (!pointers.size) camera.endDrag(); pinchBase = null; };
  const wheel = e => {
    e.preventDefault(); onInteract();
    const t = now(); if (t - wheelAt < WHEEL_COOLDOWN_MS) return;
    wheelAcc += e.deltaY;
    if (wheelAcc <= -WHEEL_STEP) { camera.zoomIn(); wheelAcc = 0; wheelAt = t; }
    else if (wheelAcc >= WHEEL_STEP) { camera.zoomOut(); wheelAcc = 0; wheelAt = t; }
  };
  const key = e => {
    const step = 40;
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) { e.preventDefault(); onInteract(); camera.beginDrag(); camera.drag(map[e.key][0], map[e.key][1], 1 / 30); camera.endDrag(); camera.vLon = 0; camera.vLat = 0; }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); onInteract(); camera.zoomIn(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); onInteract(); camera.zoomOut(); }
    else if (e.key === 'Escape') { onBack(); }
  };
  const ctx = e => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('keydown', key);
  el.addEventListener('contextmenu', ctx);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('wheel', wheel); el.removeEventListener('keydown', key); el.removeEventListener('contextmenu', ctx);
  };
}
