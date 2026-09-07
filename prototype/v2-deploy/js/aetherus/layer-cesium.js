// AETHERUS 레이어 — Cesium 어댑터
//
// 정본 코어(core.js)가 무엇을 그릴지 정하고, 이 파일은 어떻게 그릴지만 정한다.
// EARTHUS(/) 가 쓴다. Three.js 지구 두 곳은 layer-three.js 를 쓴다 — 같은 코어다.
//
// ⚠️ Cesium 은 전역(window.Cesium)이다. 여기서 import 하지 않는다.
// ⚠️ 1.0 은 requestRenderMode 를 켜 두었다(power.js). 위치를 바꾸고 나서
//    다시 그려달라고 하지 않으면 화면이 그대로 멈춰 있다 — 실측으로 겪은 함정이다.
//    그래서 onAnimate 를 주입받는다(레이어가 power.js 를 직접 알 필요는 없다).
// ⚠️ 500기를 Entity 로 만들면 CustomDataSource 가 매 프레임 전부를 훑는다.
//    PointPrimitiveCollection 은 한 번에 올려 GPU 로 넘긴다 — 점 수백 개의 제자리다.

import { AetherusCore } from './core.js';

const DOT = '#7EDCFF';
const DOT_DEBRIS = '#FF9E6B';
const LINK = '#F5B14C';
const POS_INTERVAL_MS = 250;   // 위성 250ms 이동 = 전지구 뷰에서 0.05px. 더 자주 할 이유가 없다.

export class AetherusCesiumLayer {
  /**
   * @param {object} opts
   * @param {object} opts.viewer     Cesium Viewer
   * @param {Function} [opts.onAnimate] 다시 그려달라고 알리는 함수 (power.animate 등)
   */
  constructor(opts = {}) {
    this.viewer = opts.viewer;
    this.onAnimate = opts.onAnimate || (() => { this.viewer?.scene?.requestRender?.(); });
    this.core = opts.core || new AetherusCore(opts);
    this.on = false;
    this.loading = false;
    this.points = null;
    this.lines = null;
    this.ticker = null;
  }

  get entries() { return this.core.entries; }
  get conjunctions() { return this.core.conjunctions; }
  get lastError() { return this.core.lastError; }

  _ensureCollections() {
    if (this.points) return;
    const prims = this.viewer.scene.primitives;
    this.points = prims.add(new Cesium.PointPrimitiveCollection());
    this.lines = prims.add(new Cesium.PolylineCollection());
    this.points.show = false;
    this.lines.show = false;
  }

  _clearCollections() {
    this.points?.removeAll();
    this.lines?.removeAll();
  }

  /* 좌표는 코어가 ECEF(km)로 준다. Cesium 의 고정좌표계가 같은 규약이라
     단위(m)만 맞추면 변환이 없다 — 위도·경도로 되돌렸다 다시 푸는 낭비를 안 한다. */
  _draw() {
    if (!this.on || document.hidden) return;
    const rows = this.core.positions();
    this._clearCollections();

    if (!rows.length) {
      // 정책상 위치를 그릴 수 없는 상태 — 낡은 점을 남겨두지 않는다.
      this.onAnimate(POS_INTERVAL_MS * 3, POS_INTERVAL_MS, 'aetherus');
      return;
    }

    const at = new Map();
    for (const row of rows) {
      const pos = new Cesium.Cartesian3(
        row.ecef[0] * 1000, row.ecef[1] * 1000, row.ecef[2] * 1000);
      at.set(row.catalogId, pos);
      const css = row.debris ? DOT_DEBRIS : DOT;
      const color = Cesium.Color.fromCssColorString(css);
      this.points.add({
        position: pos,
        pixelSize: row.debris ? 3.4 : 4.6,
        color,
        outlineColor: color.withAlpha(0.35),
        outlineWidth: 1.6,
        /* ⚠️ 표시 거리를 Infinity 로 두지 않는다 — 지구 뒤편 객체가 지구를 뚫고
           보인다(1.0 위성 레이어가 같은 함정을 겪었다). */
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6e7),
        /* 집기용 식별자 — 관제센터(js/spaceops)가 점을 눌러 정본 객체를 고른다.
           PointPrimitive 는 Entity 가 아니라 _meta 가 없으므로 id 로 넘긴다. */
        id: { _aeth: row.catalogId, name: row.name },
      });
    }

    const linkColor = Cesium.Color.fromCssColorString(LINK);
    for (const ev of this.core.conjunctions) {
      const a = at.get(ev.a);
      const b = at.get(ev.b);
      if (!a || !b) continue;
      this.lines.add({
        positions: [a, b],
        width: 1.6,
        material: Cesium.Material.fromType('Color', { color: linkColor.withAlpha(0.85) }),
      });
    }

    this.onAnimate(POS_INTERVAL_MS * 3, POS_INTERVAL_MS, 'aetherus');
  }

  async toggle() {
    if (this.loading) return { on: this.on };
    this.loading = true;
    try {
      this.on = !this.on;
      if (this.on) {
        this._ensureCollections();
        await this.core.start();
        this.points.show = true;
        this.lines.show = true;
        this._draw();
        this.ticker = setInterval(() => this._draw(), POS_INTERVAL_MS);
      } else {
        this._stop();
      }
      return { on: this.on };
    } catch (error) {
      this.on = false;
      this._stop();
      console.warn('[aetherus]', error);
      return { on: false, error: String(error?.message || error) };
    } finally { this.loading = false; }
  }

  _stop() {
    if (this.ticker) { clearInterval(this.ticker); this.ticker = null; }
    this.core.stop();
    this._clearCollections();
    if (this.points) this.points.show = false;
    if (this.lines) this.lines.show = false;
    this.viewer?.scene?.requestRender?.();
  }

  state() {
    if (!this.on) return { on: false };
    return { on: true, note: this.core.state(true) };
  }

  card(ko = true) { return this.core.card(ko); }

  dispose() {
    this._stop();
    const prims = this.viewer?.scene?.primitives;
    if (prims) {
      if (this.points) prims.remove(this.points);
      if (this.lines) prims.remove(this.lines);
    }
    this.points = null;
    this.lines = null;
  }
}
