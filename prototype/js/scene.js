// 우주·심해 공통 장면 전환기
//
// ⚠️ Cesium은 파괴하지 않는다. 다른 장면에서는 입력·렌더 요청을 멈추고 숨긴다.
// ⚠️ 상태는 저장하지 않는다. 새로 열면 항상 지구다.

import { viewer, scene } from './viewer.js';
import { store } from './store.js';
import { power } from './power.js';

const VALID = new Set(['earth', 'space', 'ocean']);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export const sceneMgr = {
  current: 'earth',
  _busy: false,
  _queued: null,
  _transition: Promise.resolve(),

  init() {
    this.current = 'earth';
    store.setScene('earth', 'earth');
    document.querySelectorAll('[data-scene-home]').forEach(button => {
      button.addEventListener('click', () => this.to('earth'));
    });
    return this;
  },

  to(next, options = {}) {
    if (!VALID.has(next)) return Promise.reject(new Error(`UNKNOWN_SCENE:${next}`));
    const stage = options.stage || next;
    if (this._busy) {
      // 재난 배너처럼 전환 중 들어온 마지막 요청은 버리지 않는다.
      this._queued = { next, options };
      return this._transition.then(() => {
        const queued = this._queued;
        this._queued = null;
        return queued ? this.to(queued.next, queued.options) : this.current;
      });
    }
    if (next === this.current) {
      store.setScene(next, stage);
      this._paintStage(next, stage);
      return Promise.resolve(next);
    }
    this._busy = true;
    this._transition = this._run(next, stage).finally(() => { this._busy = false; });
    return this._transition;
  },

  async _run(next, stage) {
    const fade = document.getElementById('sceneFade');
    fade?.classList.add('covered');
    await wait(620);
    this._apply(next, stage);
    // 새 장면의 첫 레이아웃이 검은 덮개 뒤에서 끝난 다음 걷는다.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    fade?.classList.remove('covered');
    await wait(620);
    return next;
  },

  _apply(next, stage) {
    const earth = document.getElementById('cesiumContainer');
    const root = document.getElementById('sceneRoot');
    const inputs = scene?.screenSpaceCameraController;
    try { viewer?.camera.cancelFlight(); } catch (_) { }

    if (next === 'earth') {
      root?.classList.remove('active');
      root?.setAttribute('aria-hidden', 'true');
      earth?.classList.remove('scene-hidden');
      if (earth) earth.inert = false;
      if (inputs) inputs.enableInputs = true;
      power.resume();
      scene?.requestRender();
    } else {
      if (inputs) inputs.enableInputs = false;
      if (earth) earth.inert = true;
      earth?.classList.add('scene-hidden');
      power.suspend();
      root?.classList.add('active');
      root?.setAttribute('aria-hidden', 'false');
    }
    this.current = next;
    store.setScene(next, stage);
    this._paintStage(next, stage);
  },

  _paintStage(next, stage) {
    const root = document.getElementById('sceneRoot');
    if (root) root.dataset.stage = stage;
    document.querySelectorAll('[data-scene-view]').forEach(view => {
      view.classList.toggle('current', view.dataset.sceneView === next);
    });
  },
};
