// EARTHUS V3 WONDER — wonder-environment / 흐름 상태기 (순수, DOM 없음)
// Paper Earth → region selection → camera approach → paper unfold → environment active(discovery-ready) → fold → zoom-out → Earth.
// 브라우저 history 에 의존하지 않는다. 첫 방문은 긴 unfold(700~1000ms), 재방문은 짧게(150~250ms), reduced motion 은 최소.

export const STATES = Object.freeze(['earth', 'approaching', 'unfolding', 'active', 'folding', 'zooming-out']);

export const TIMINGS = Object.freeze({
  first:   { approachMs: 900, unfoldMs: 900, staggerMs: 110, foldMs: 380, zoomOutMs: 900 },
  revisit: { approachMs: 700, unfoldMs: 200, staggerMs: 30,  foldMs: 160, zoomOutMs: 700 },
  reduced: { approachMs: 0,   unfoldMs: 80,  staggerMs: 0,   foldMs: 60,  zoomOutMs: 0 },
});

/**
 * @param {{ reducedMotion?: () => boolean, timings?: typeof TIMINGS }} [o]
 */
export function createEnvironmentFlow({ reducedMotion = () => false, timings = TIMINGS } = {}) {
  const visits = new Map();
  const listeners = new Set();
  let state = 'earth', current = null, plan = null, seq = 0;

  const emit = () => { for (const l of listeners) l({ state, current, plan }); };
  const set = (s) => { state = s; emit(); };

  /** 방문 횟수·움직임 설정에 따른 타이밍. */
  function planFor(envId) {
    const n = visits.get(envId) ?? 0;
    const t = reducedMotion() ? timings.reduced : n === 0 ? timings.first : timings.revisit;
    return { envId, visit: n + 1, mode: reducedMotion() ? 'reduced' : n === 0 ? 'first' : 'revisit', ...t };
  }

  /** 지역 진입 시도. earth 상태에서만. @returns {{ok:boolean, reason?:string, plan?:object}} */
  function enter(envId) {
    if (!envId) return { ok: false, reason: 'no-environment' };
    if (state !== 'earth') return { ok: false, reason: `busy:${state}` };
    plan = planFor(envId); current = envId; seq++;
    set('approaching');
    return { ok: true, plan, seq };
  }
  function approached() { if (state !== 'approaching') return false; set('unfolding'); return true; }
  function unfolded() {
    if (state !== 'unfolding') return false;
    visits.set(current, (visits.get(current) ?? 0) + 1);
    set('active'); return true;
  }
  /** 지구로. active 에서만. */
  function exit() {
    if (state !== 'active') return { ok: false, reason: `not-active:${state}` };
    set('folding'); return { ok: true, plan, seq };
  }
  function folded() { if (state !== 'folding') return false; set('zooming-out'); return true; }
  function zoomedOut() { if (state !== 'zooming-out') return false; current = null; plan = null; set('earth'); return true; }
  /** 비상 복귀(자산 실패 등): 어디서든 earth 로. */
  function abort() { current = null; plan = null; seq++; set('earth'); }

  return {
    get state() { return state; }, get current() { return current; }, get plan() { return plan; }, get seq() { return seq; },
    get discoveryReady() { return state === 'active'; },
    visitsOf: id => visits.get(id) ?? 0,
    enter, approached, unfolded, exit, folded, zoomedOut, abort, planFor,
    subscribe: l => { listeners.add(l); return () => listeners.delete(l); },
  };
}
