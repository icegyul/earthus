// 제스처: 톡(tap) / 꾹(long-press). 포인터 이벤트 하나로 마우스·터치·펜을 다 받는다.
// 키보드: Enter = 톡, Shift+Enter = 꾹 (아이 화면이라도 키보드 경로를 막지 않는다).
const LONG_MS = 450, MOVE_PX = 10;

/**
 * @param {HTMLElement} el
 * @param {{ onTap: (at:{x:number,y:number}) => void, onLongPress: (at:{x:number,y:number}) => void }} h
 * @returns {() => void} detach
 */
export function attachGestures(el, h) {
  let timer = null, start = null, fired = false, pid = null;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; };
  const down = e => {
    if (e.button != null && e.button !== 0) return;
    pid = e.pointerId; start = { x: e.clientX, y: e.clientY }; fired = false;
    try { el.setPointerCapture(pid); } catch { /* 일부 브라우저 */ }
    clear();
    timer = setTimeout(() => { fired = true; h.onLongPress({ x: start.x, y: start.y }); }, LONG_MS);
    e.preventDefault();
  };
  const move = e => {
    if (!start || e.pointerId !== pid) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_PX) { clear(); start = null; }
  };
  const up = e => {
    if (e.pointerId !== pid) return;
    clear();
    if (start && !fired) h.onTap({ x: e.clientX, y: e.clientY });
    start = null; pid = null;
  };
  const cancel = () => { clear(); start = null; pid = null; };
  const key = e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const r = el.getBoundingClientRect(); const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (e.shiftKey) h.onLongPress(at); else h.onTap(at);
  };
  const ctx = e => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('keydown', key);
  el.addEventListener('contextmenu', ctx);
  return () => {
    clear();
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('keydown', key); el.removeEventListener('contextmenu', ctx);
  };
}
