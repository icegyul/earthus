// Earth View → Style → Data → Evidence → Decision 상태 전환기.
// URL 직렬화는 earth-route-state.js 한 곳에서 하고, 이 파일은 기존 store·레이어 메뉴·
// Cesium 장면을 연결한다. 새 화면이나 판단을 만들지 않으며 PR-04~09가 이어 붙일 상태
// 경계만 제공한다.

import { LAYER_DEFS } from './config.js';
import { store } from './store.js';
import { decodeEarthRoute, writeEarthRoute } from './earth-route-state.js';

const EMPTY = Object.freeze({
  view: 'earth', layer: null, at: null, model: null, point: null,
  activity: null, reservation: null,
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function cleanState(state) {
  return {
    view: state?.view || 'earth',
    layer: state?.layer || null,
    at: state?.at || null,
    model: state?.model || null,
    point: state?.point || null,
    activity: state?.activity || null,
    reservation: state?.reservation || null,
  };
}

export const earthViewState = {
  _deps: null,
  _restoring: false,
  _started: false,
  _layerBatch: null,
  _layerQueued: false,

  init(deps) {
    if (this._started) return this;
    this._started = true;
    this._deps = deps;

    document.addEventListener('earthus:earth-view-intent', event => {
      const detail = event.detail || {};
      if (detail.view === 'style') this.openStyle();
      else if (detail.view === 'earth') {
        /* 레이어를 고른 뒤 메뉴만 닫는 것은 Data View를 닫는 행동이 아니다.
           Style 단계에서 아무것도 고르지 않고 닫았을 때만 Earth로 돌아간다. */
        if (detail.reason !== 'style-closed' || store.earthView.view === 'style') this.goEarth();
      }
      else if (detail.view === 'data' && detail.layer) {
        this._preferredLayer = detail.layer;
        this._queueLayer(detail.layer, true);
      }
    });
    document.addEventListener('earthus:earth-point', event => {
      const detail = event.detail || {};
      if (!detail.layer || !detail.point) return;
      this.showEvidence(detail.layer, detail.point, {
        at: detail.at || store.earthView.at,
        model: detail.model || store.earthView.model,
      });
    });
    document.addEventListener('earthus:decision-state', event => {
      const detail = event.detail || {};
      this.showDecision(detail);
    });

    store.on('layer', (id, on) => this._queueLayer(id, on));
    document.addEventListener('earthus:earth-point-clear', () => {
      if (this._restoring || store.earthView.view !== 'evidence') return;
      this._transition({ ...store.earthView, view: 'data', point: null });
    });
    window.addEventListener('popstate', () => {
      const route = decodeEarthRoute(location.search) || EMPTY;
      this.restore(route, { history: false, fromPop: true });
    });

    const route = decodeEarthRoute(location.search);
    if (deps.foreignRouteActive) {
      /* 해구 `dive/ocean`은 기존에 좌표와 자료 복원까지 가진 명시 route다. 수동으로
         Earth query가 섞여 와도 두 장면 복원기가 경쟁하지 않게 해구를 우선한다. */
      this._commit(EMPTY, 'replace', false);
      writeEarthRoute(null, 'replace');
    } else if (route) this.restore(route, { history: true, initial: true });
    else this._commit(EMPTY, 'replace', false);
    return this;
  },

  _knownLayer(id) {
    const def = LAYER_DEFS.find(item => item.id === id);
    return !!def && !def.blocked && store.canUse(def)
      && (this._deps?.canOpenLayer?.(id) ?? true);
  },

  _sanitizeRoute(route) {
    const state = cleanState(route);
    const issues = [...(route?.issues || [])];
    if (state.layer && !this._knownLayer(state.layer)) {
      issues.push('UNAVAILABLE_LAYER');
      state.layer = null;
      state.at = null;
      state.model = null;
      state.point = null;
      state.activity = null;
      state.reservation = null;
      state.view = 'style';
    }
    return { state, issues };
  },

  async restore(route, options = {}) {
    if (this._restoring) return;
    const { state, issues } = this._sanitizeRoute(route || EMPTY);
    this._restoring = true;
    try {
      await this._deps.sceneMgr.to('earth', { stage: 'earth' });
      this._deps.sourceNote?.setPoint?.(null, null);

      if (state.view === 'earth') {
        this._deps.layerBar.closeMenus?.();
        if (options.fromPop) store.resetLayersToDefaults();
      } else if (state.view === 'style') {
        store.resetLayersToDefaults();
        this._deps.layerBar.showEarthStyle?.();
      } else {
        this._deps.layerBar.closeMenus?.();
        if (state.layer && !store.isOn(state.layer)) store.setLayer(state.layer, true);
        if (state.view === 'evidence' && state.point) {
          this._restoreEvidence(state);
        } else if (state.view === 'decision') {
          document.dispatchEvent(new CustomEvent('earthus:restore-decision', { detail: state }));
        }
      }
      this._commit(state, 'replace', options.history !== false);
      if (issues.length) {
        console.warn('[earth-route] 안전한 이전 화면으로 복원:', [...new Set(issues)].join(', '));
        document.dispatchEvent(new CustomEvent('earthus:route-issue', {
          detail: { issues: [...new Set(issues)], state },
        }));
      }
    } finally {
      this._restoring = false;
    }
  },

  _restoreEvidence(state) {
    const { lat, lon } = state.point;
    this._deps.flyTo?.(lon, lat, 1_800_000, 0.9);
    import('./gridoverlay.js').then(async ({ gridOverlay }) => {
      if (store.earthView.view !== 'evidence' || store.earthView.layer !== state.layer) return;
      const value = await gridOverlay.valueAt(state.layer, lat, lon);
      this._deps.sourceNote?.setPoint?.(state.layer, value);
    }).catch(() => this._deps.sourceNote?.setPoint?.(null, null));
  },

  _commit(next, mode = 'replace', write = true) {
    const state = cleanState(next);
    store.setEarthView(state);
    if (document.body) document.body.dataset.earthView = state.view;
    if (write) writeEarthRoute(state, mode);
    return state;
  },

  _transition(next, requestedMode = 'push') {
    if (this._restoring) return store.earthView;
    const state = cleanState(next);
    if (same(state, store.earthView)) return state;
    /* 같은 단계 안에서 레이어·지점만 바뀌는 동안 방문기록을 수십 칸 만들지 않는다.
       Earth→Style→Data→Evidence처럼 의미 단계가 바뀔 때만 뒤로가기 한 칸을 만든다. */
    const mode = store.earthView.view === state.view ? 'replace' : requestedMode;
    return this._commit(state, mode, true);
  },

  openStyle() {
    if (this._restoring) return;
    this._deps.sceneMgr.to('earth', { stage: 'earth' }).catch(() => {});
    this._deps.layerBar.showEarthStyle?.();
    this._deps.sourceNote?.setPoint?.(null, null);
    this._transition({ ...EMPTY, view: 'style' });
  },

  goEarth(options = {}) {
    if (this._restoring) return;
    this._restoring = true;
    try {
      this._deps.sourceNote?.setPoint?.(null, null);
      this._deps.layerBar.closeMenus?.();
      if (options.resetLayers) store.resetLayersToDefaults();
      this._commit(EMPTY, store.earthView.view === 'earth' ? 'replace' : 'push', true);
    } finally {
      this._restoring = false;
    }
  },

  leaveForForeignRoute() {
    /* AETHERUS/해구 URL을 쓸 때 EARTHUS query만 지운다. 지구 레이어 자체를 끄면
       돌아왔을 때 사용자가 고른 맥락까지 사라지므로 화면 상태는 건드리지 않는다. */
    writeEarthRoute(null, 'replace');
  },

  showEvidence(layer, point, extra = {}) {
    if (this._restoring || !this._knownLayer(layer)) return;
    const lat = Number(point.lat), lon = Number(point.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    this._transition({
      view: 'evidence', layer, at: extra.at || null, model: extra.model || null,
      point: { lat, lon }, activity: null, reservation: null,
    });
  },

  showDecision(detail) {
    if (this._restoring || (!detail.activity && !detail.reservation)) return;
    this._transition({
      view: 'decision', layer: detail.layer || store.earthView.layer,
      at: detail.at || store.earthView.at, model: detail.model || store.earthView.model,
      point: detail.point || store.earthView.point, activity: detail.activity || null,
      reservation: detail.reservation || null,
    });
  },

  _queueLayer(id, on) {
    if (this._restoring) return;
    this._layerBatch ||= { on: [], off: [] };
    this._layerBatch[on ? 'on' : 'off'].push(id);
    if (this._layerQueued) return;
    this._layerQueued = true;
    queueMicrotask(() => {
      this._layerQueued = false;
      const batch = this._layerBatch || { on: [], off: [] };
      this._layerBatch = null;
      if (this._restoring || store.scene !== 'earth') return;

      const preferred = this._preferredLayer;
      this._preferredLayer = null;
      const turnedOn = preferred && store.isOn(preferred)
        ? preferred : [...batch.on].reverse().find(layer => store.isOn(layer) && this._knownLayer(layer));
      if (turnedOn) {
        const current = store.earthView.layer === turnedOn ? store.earthView : {};
        this._transition({
          view: 'data', layer: turnedOn, at: current.at || null, model: current.model || null,
          point: null, activity: null, reservation: null,
        });
        return;
      }
      if (store.earthView.layer && batch.off.includes(store.earthView.layer)
        && !store.isOn(store.earthView.layer)) {
        if (this._deps.layerBar.open && this._deps.layerBar.sub === 'earth') this.openStyle();
        else this.goEarth();
      }
    });
  },

};
