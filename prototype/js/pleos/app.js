// EARTHUS Pleos — 화면 상태와 실행 경로
//
// ⚠️ 모든 사용자 동작은 dispatch() 하나로 들어오고, dispatch 는 실행 순간의 운전 상태를
//    host 에서 다시 읽어 guardAction() 으로 판단한다. 화면을 그릴 때의 값을 믿지 않는다.
// ⚠️ 운전 모드로 바뀌어도 선택한 장소·도크 상태는 지우지 않는다 (주차하면 그대로 돌아온다).
//    다만 운전 중에는 그 상태를 그리지 않는다.

import { ACTION } from './actions.js';
import { guardAction, isDrivingSafeMode } from './safety-gate.js';
import { buildPlaceCard } from './place-card.js';
import { renderDriving, renderParked, DOCKS } from './render.js';

export const PLEOS_APP_VERSION = 'earthus.pleos-app.v1.0.0';

// 고정 문장 (무작위 문구 금지)
const BLOCKED_NOTICE = Object.freeze({
  DRIVING: '운전 중에는 사용할 수 없습니다. 정차 후 이용하세요.',
  DISASTER: '공식 특보가 발효 중이라 여가 안내를 멈췄습니다.',
  OTHER: '지금은 사용할 수 없는 기능입니다.',
});

export function createPleosApp({ bridge, repository, root = null, nowMs = () => Date.now(), capabilities = { transactions: false } } = {}) {
  const state = {
    drivingState: bridge.drivingState(),
    location: null,
    region: null,
    countryCode: null,
    weather: null,
    loadError: null,
    dock: null,
    showForecast: false,
    places: null,
    selectedPlace: null,
    selectedCard: null,
    notice: null,
  };

  const liveContext = () => ({
    drivingState: bridge.drivingState(),
    criticalDisaster: state.weather?.warning?.safety?.gate === 'OFFICIAL_WARNING_ACTIVE',
    capabilities,
  });
  const viewContext = () => ({ canOpenDirections: bridge.canOpenDirections() });

  function html() {
    state.drivingState = bridge.drivingState();
    return isDrivingSafeMode(state.drivingState) ? renderDriving(state, viewContext()) : renderParked(state, viewContext());
  }
  function paint() {
    if (root) root.innerHTML = html();
  }

  function cardFor(place) {
    return buildPlaceCard(place, {
      weatherCard: state.weather?.card ?? null,
      warning: state.weather?.warning?.safety ?? null,
      drivingState: bridge.drivingState(),
      capabilities,
      nowMs: nowMs(),
      regionName: null,
    });
  }

  const handlers = {
    [ACTION.DOCK_NAVIGATION]: dock => {
      if (!DOCKS.some(d => d.id === dock)) return false;
      state.dock = state.dock === dock ? null : dock;   // 한 번에 하나만, 다시 누르면 닫힘
      state.showForecast = false;
      if (state.dock === 'local') return dispatch(ACTION.LOCAL_DISCOVERY);
      return true;
    },
    [ACTION.FORECAST]: () => { state.showForecast = true; return true; },
    [ACTION.LOCAL_DISCOVERY]: async () => {
      state.selectedCard = null;
      if (!state.location) return false;
      const r = await repository.nearbyPlaces(state.location);
      if (!r.stale) state.places = r;
      return true;
    },
    [ACTION.PLACE_DETAIL]: id => {
      const place = state.places?.places?.find(p => p.id === id);
      if (!place) return false;
      state.selectedPlace = place;
      state.selectedCard = cardFor(place);
      return true;
    },
    [ACTION.DIRECTIONS]: () => {
      const p = state.selectedPlace;
      if (!p) return false;
      return bridge.openDirections({ lat: p.lat, lon: p.lon, name: p.name });
    },
    // RESERVATION·COUPON 은 실행기를 두지 않는다. 게이트가 capability 없음으로 먼저 막는다.
  };

  async function dispatch(action, arg) {
    const run = handlers[action];
    const out = guardAction(action, liveContext, () => (run ? run(arg) : false));
    if (!out.executed) {
      const r = out.decision.reason;
      state.notice = r.startsWith('DRIVING_SAFE') ? BLOCKED_NOTICE.DRIVING
        : r === 'CRITICAL_DISASTER_OVERRIDE' ? BLOCKED_NOTICE.DISASTER : BLOCKED_NOTICE.OTHER;
      paint();
      return out;
    }
    state.notice = null;
    const result = await out.result;
    paint();
    return { ...out, result };
  }

  async function refresh() {
    state.location = bridge.location();
    if (!state.location) { paint(); return; }
    state.region = await repository.regionAt(state.location);
    try {
      const r = await repository.weatherAt(state.location);
      if (!r.stale) { state.weather = r; state.loadError = null; }
    } catch (e) {
      state.loadError = String(e?.message || e).slice(0, 120);
    }
    if (state.selectedPlace) state.selectedCard = cardFor(state.selectedPlace);
    paint();
  }

  function attach() {
    if (!root) return () => {};
    const onClick = ev => {
      const el = ev.target.closest?.('[data-action]');
      if (!el || !root.contains(el)) return;
      dispatch(el.dataset.action, el.dataset.arg);
    };
    root.addEventListener('click', onClick);
    const off = bridge.onDrivingStateChange(() => { state.notice = null; paint(); });
    return () => { root.removeEventListener('click', onClick); off(); };
  }

  return { state, html, paint, dispatch, refresh, attach };
}
