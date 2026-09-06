/* 위성 관제센터 — Cesium 그리기 (지시서 §5·§6·§12·§17·§21·§22)
 *
 * 무엇을 그릴지는 model.js 와 index.js 가 정하고, 여기서는 어떻게 그릴지만 정한다.
 *  · 선택 객체: 강조점 + 이름표 + 지나온 궤적(흐리게, 2바퀴) + 앞으로 궤적(밝게, 시간 범위) + 진행 끝점
 *  · 주변 객체: 선택 객체와 잇는 선 + 거리 이름표
 *  · 근접사건: 두 객체를 잇는 선(서버 산출)
 *  · 발사: 기존 launchtrack.js(근사 지상궤적) 위에 재생 표식(T+ 시각 따라 이동)
 *  · ARCHIVE: 불러온 모든 궤도 객체를 재생 시각으로 전파한 점구름(PointPrimitiveCollection)
 *
 * ⚠️ Cesium 은 전역이다. requestRenderMode 라 위치가 바뀌면 power.animate 로 다시 그려 달라고 해야 한다.
 * ⚠️ 시각은 인자로 받는다(clockMs). 라이브면 Date.now(), ARCHIVE 면 재생 시각 — 같은 코드다.
 */
import { viewer } from '../viewer.js';
import { power } from '../power.js';
import { geodeticAt, trackSamples, KIND } from './model.js';
import { inclinationFor, groundTrack } from '../layers/orbit-math.js';

const COLOR = Object.freeze({
  satellite: '#7EDCFF', station: '#3fc7c0', rocket_body: '#F5B14C', fragment: '#FF7A59',
  debris: '#FF9E6B', unknown: '#C9C9C9', launch: '#ffb454', selected: '#FFFFFF',
  past: '#9fb7c9', future: '#7EDCFF', nearby: '#F5B14C', approach: '#FF5D5D',
});
export const KIND_COLOR = COLOR;

const cart = (g) => Cesium.Cartesian3.fromDegrees(g.lon, g.lat, g.altKm * 1000);
const css = (c) => Cesium.Color.fromCssColorString(c);

export const globe = {
  ds: null,
  cloud: null,          // ARCHIVE 점구름
  clockFn: () => Date.now(),
  _selEnts: [],
  _trackEnts: [],
  _nearEnts: [],
  _approachEnts: [],
  _launchEnts: [],
  _launchPlan: null,
  _lastAnimate: 0,

  init() {
    if (this.ds) return this;
    this.ds = new Cesium.CustomDataSource('spaceops');
    viewer.dataSources.add(this.ds);
    this.ds.show = true;
    return this;
  },

  /** 시계를 바꾼다(라이브/ARCHIVE). CallbackProperty 가 다음 프레임부터 이 시각을 쓴다. */
  setClock(fn) { this.clockFn = fn || (() => Date.now()); this.wake(1500); },

  wake(ms = 1200) { power.animate(ms, 250, 'spaceops'); },

  _rm(list) { list.forEach(e => { try { this.ds.entities.remove(e); } catch (_) {} }); list.length = 0; },

  clearSelection() {
    this._rm(this._selEnts); this._rm(this._trackEnts); this._rm(this._nearEnts); this._rm(this._approachEnts); this._rm(this._gsLinkEnts);
    viewer.scene.requestRender?.();
  },

  clearAll() {
    this.clearSelection();
    this.clearLaunch();
    this.archive(false);
    this._rm(this._gsEnts);
  },

  /* ── 선택 객체 강조 (§21 선택 객체 = Highlight + Orbit + Label) ─────────── */
  highlight(obj) {
    this._rm(this._selEnts);
    if (!obj?.rec) return;
    const col = css(COLOR[obj.kind] || COLOR.satellite);
    const pos = new Cesium.CallbackProperty(() => {
      const g = geodeticAt(obj.rec, new Date(this.clockFn()));
      return g ? cart(g) : undefined;
    }, false);
    this._selEnts.push(this.ds.entities.add({
      id: `so:sel:${obj.id}`,
      position: pos,
      point: { pixelSize: 11, color: col, outlineColor: Cesium.Color.WHITE, outlineWidth: 2.2,
        disableDepthTestDistance: 0 },
      label: { text: obj.name, font: '500 12px -apple-system, "Segoe UI", sans-serif',
        fillColor: Cesium.Color.WHITE, showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#0b1017').withAlpha(0.78),
        backgroundPadding: new Cesium.Cartesian2(7, 4), pixelOffset: new Cesium.Cartesian2(0, -20),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM },
      _meta: { kind: 'spaceops-selected' },
    }));
    // 선택 링 — 멀리서도 눈에 띄게
    this._selEnts.push(this.ds.entities.add({
      id: `so:selring:${obj.id}`,
      position: pos,
      point: { pixelSize: 24, color: Cesium.Color.TRANSPARENT, outlineColor: col.withAlpha(0.55), outlineWidth: 1.5 },
    }));
    this.wake();
  },

  /* ── 궤적 (§6) — 지나온 2바퀴(흐리게) + 앞으로 rangeMin(밝게) ────────────── */
  tracks(obj, rangeMin, clockMs, opts = {}) {
    this._rm(this._trackEnts);
    if (!obj?.rec || !obj.elements) return null;
    const col = css(COLOR[obj.kind] || COLOR.future);
    const period = obj.elements.periodMin;
    const pastMin = Math.min(period * (opts.pastOrbits ?? 2), 6 * 60);
    const past = trackSamples(obj.rec, clockMs, -pastMin, Math.min(240, Math.max(40, Math.round(pastMin))));
    // 앞으로 — 표본 수는 범위에 비례하되 상한(1,400점)을 둔다. 7일이면 7분 간격이다.
    const steps = Math.min(1400, Math.max(80, Math.round(rangeMin / Math.max(0.5, period / 60))));
    const next = trackSamples(obj.rec, clockMs, rangeMin, steps);
    if (past.length > 3) {
      this._trackEnts.push(this.ds.entities.add({
        id: `so:track:past:${obj.id}`,
        polyline: { positions: past.map(cart), width: 1.4, arcType: Cesium.ArcType.NONE,
          material: css(COLOR.past).withAlpha(0.33) },
      }));
    }
    if (next.length > 3) {
      this._trackEnts.push(this.ds.entities.add({
        id: `so:track:next:${obj.id}`,
        polyline: { positions: next.map(cart), width: rangeMin > 24 * 60 ? 1.2 : 2.2, arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.18, color: col.withAlpha(rangeMin > 24 * 60 ? 0.55 : 0.9) }) },
      }));
      const tip = next[next.length - 1];
      this._trackEnts.push(this.ds.entities.add({
        id: `so:track:tip:${obj.id}`,
        position: cart(tip),
        point: { pixelSize: 6, color: col, outlineColor: Cesium.Color.WHITE.withAlpha(0.7), outlineWidth: 1.5 },
        label: { text: opts.tipLabel || `+${rangeMin >= 60 ? `${Math.round(rangeMin / 60)}h` : `${rangeMin}m`}`,
          font: '300 10px -apple-system, sans-serif', fillColor: Cesium.Color.WHITE.withAlpha(0.75),
          pixelOffset: new Cesium.Cartesian2(0, -13) },
      }));
    }
    this.wake();
    return { past: past.length, next: next.length };
  },

  /* ── 주변 객체 (§8) — 선택 객체에서 각 객체로 선 + 거리 ───────────────── */
  nearby(obj, rows, clockMs) {
    this._rm(this._nearEnts);
    if (!obj?.rec || !rows?.length) return;
    const a = geodeticAt(obj.rec, new Date(clockMs));
    if (!a) return;
    const A = cart(a);
    rows.forEach((r, i) => {
      const g = r.obj.rec ? geodeticAt(r.obj.rec, new Date(clockMs)) : null;
      if (!g) return;
      const B = cart(g);
      const col = css(r.trend === 'approaching' ? COLOR.approach : COLOR.nearby);
      this._nearEnts.push(this.ds.entities.add({
        id: `so:near:${i}`,
        polyline: { positions: [A, B], width: 1.3, arcType: Cesium.ArcType.NONE, material: col.withAlpha(0.7) },
      }));
      this._nearEnts.push(this.ds.entities.add({
        id: `so:nearpt:${i}`,
        position: B,
        point: { pixelSize: 7, color: css(COLOR[r.obj.kind] || COLOR.unknown), outlineColor: col, outlineWidth: 1.6 },
        label: { text: `${r.obj.name} · ${r.distKm < 10 ? r.distKm.toFixed(1) : Math.round(r.distKm)} km`,
          font: '300 10px -apple-system, sans-serif', fillColor: Cesium.Color.WHITE.withAlpha(0.85),
          showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#0b1017').withAlpha(0.6),
          backgroundPadding: new Cesium.Cartesian2(5, 3), pixelOffset: new Cesium.Cartesian2(0, 14),
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 40_000_000) },
      }));
    });
    this.wake();
  },

  /* ── 근접사건 (§9) — 두 객체를 잇는다. 확률 표시는 없다. ───────────────── */
  approach(objA, objB, ev, clockMs) {
    this._rm(this._approachEnts);
    if (!objA?.rec || !objB?.rec) return;
    const a = geodeticAt(objA.rec, new Date(clockMs));
    const b = geodeticAt(objB.rec, new Date(clockMs));
    if (!a || !b) return;
    const col = css(COLOR.approach);
    this._approachEnts.push(this.ds.entities.add({
      id: `so:ca:${ev?.id || 'x'}`,
      polyline: { positions: [cart(a), cart(b)], width: 2, arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineDashMaterialProperty({ color: col.withAlpha(0.9), dashLength: 12 }) },
    }));
    this._approachEnts.push(this.ds.entities.add({
      id: `so:ca:b:${ev?.id || 'x'}`,
      position: cart(b),
      point: { pixelSize: 9, color: css(COLOR[objB.kind] || COLOR.unknown), outlineColor: col, outlineWidth: 2 },
      label: { text: objB.name, font: '400 11px -apple-system, sans-serif', fillColor: Cesium.Color.WHITE,
        showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#2a0c0c').withAlpha(0.7),
        backgroundPadding: new Cesium.Cartesian2(6, 3), pixelOffset: new Cesium.Cartesian2(0, 16),
        verticalOrigin: Cesium.VerticalOrigin.TOP },
    }));
    this.wake();
  },

  /* ── 발사 (§12) — 근사 궤적 위 재생 표식 ─────────────────────────────── */
  /**
   * 발사 장면을 만든다. 기존 launchtrack.js 가 선을 그리고, 여기서는 재생 표식만 얹는다.
   * @returns plan { inc, alt, T, pts, ascentPts, why } | { skipped, why } | null
   */
  async launchScene(launchObj) {
    this.clearLaunch();
    const m = launchObj?._raw;
    if (!m) return null;
    const { launchTrack } = await import('../layers/launchtrack.js');
    const { launchPads } = await import('../layers/launchpad.js');
    try { launchPads.pin(m); } catch (_) { /* 핀 없어도 궤적은 그린다 */ }
    const drawn = launchTrack.show(m, { ascentPts: 12 });
    const plan = inclinationFor(m);
    if (!plan || plan.skip) { this._launchPlan = null; return drawn || plan; }
    const { pts, T } = groundTrack(m.lat, m.lon, plan.inc, plan.alt);
    this._launchPlan = { inc: plan.inc, alt: plan.alt, T, pts, ascentPts: 12, stepSec: 45, why: plan.why,
      lat0: m.lat, lon0: m.lon, exact: !!plan.exact, minimum: !!plan.minimum };
    this._tPlus = 0;
    const pos = new Cesium.CallbackProperty(() => this._launchPos(this._tPlus), false);
    const col = css(COLOR.launch);
    this._launchEnts.push(this.ds.entities.add({
      id: `so:launch:marker:${m.id}`,
      position: pos,
      point: { pixelSize: 10, color: col, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
      label: { text: new Cesium.CallbackProperty(() => this._launchLabel(), false),
        font: '500 11px ui-monospace, monospace', fillColor: Cesium.Color.WHITE, showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#2b1a05').withAlpha(0.8),
        backgroundPadding: new Cesium.Cartesian2(6, 3), pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM },
    }));
    this.wake();
    return { ...this._launchPlan, drawn };
  },

  /** T+초 → 근사 위치. 상승 구간(첫 ascentPts 점, 약 9분)은 고도를 0→alt 로 올린다. */
  _launchPos(tPlusSec) {
    const p = this._launchPlan;
    if (!p) return undefined;
    const k = Math.max(0, Math.min(p.pts.length - 1, tPlusSec / p.stepSec));
    const i = Math.floor(k), f = k - i;
    const a = p.pts[i], b = p.pts[Math.min(p.pts.length - 1, i + 1)];
    let lon = a[0] + (b[0] - a[0]) * f, lat = a[1] + (b[1] - a[1]) * f;
    if (Math.abs(b[0] - a[0]) > 180) { lon = a[0]; lat = a[1]; }   // 날짜변경선 — 보간하지 않는다
    const altKm = p.alt * Math.min(1, k / p.ascentPts);
    if (tPlusSec <= 0) return Cesium.Cartesian3.fromDegrees(p.lon0, p.lat0, 0);
    return Cesium.Cartesian3.fromDegrees(lon, lat, altKm * 1000);
  },

  _launchLabel() {
    const s = Math.max(0, Math.round(this._tPlus || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? `T+${String(h).padStart(2, '0')}:` : 'T+') + `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  },

  /** 재생 시각(T+초)을 바꾼다. */
  launchAt(tPlusSec) { this._tPlus = tPlusSec; this.wake(400); },
  launchPlan() { return this._launchPlan; },

  async clearLaunch() {
    this._rm(this._launchEnts);
    this._launchPlan = null;
    try {
      const { launchTrack } = await import('../layers/launchtrack.js');
      launchTrack.clear();
      const { launchPads } = await import('../layers/launchpad.js');
      launchPads.clearPin?.();
    } catch (_) { /* 아직 안 받은 모듈이면 지울 것도 없다 */ }
  },

  /* ── ARCHIVE (§17·§25) — 재생 시각의 점구름 ─────────────────────────── */
  /**
   * @param on
   * @param objects SpaceObject[] (rec 있는 것만 그린다)
   * @param clockMs
   */
  archive(on, objects = [], clockMs = Date.now()) {
    if (!on) {
      if (this.cloud) { this.cloud.removeAll(); this.cloud.show = false; }
      viewer.scene.requestRender?.();
      return 0;
    }
    if (!this.cloud) {
      this.cloud = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    }
    this.cloud.show = true;
    this.cloud.removeAll();
    const date = new Date(clockMs);
    let n = 0;
    for (const o of objects) {
      if (!o.rec) continue;
      const g = geodeticAt(o.rec, date);
      if (!g) continue;
      const c = css(COLOR[o.kind] || COLOR.unknown);
      this.cloud.add({
        position: cart(g),
        pixelSize: o.kind === KIND.STATION ? 7 : (o.kind === KIND.SATELLITE ? 4 : 3.2),
        color: c.withAlpha(0.9), outlineColor: c.withAlpha(0.3), outlineWidth: 1.2,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6e7),
        id: { _spaceops: o.id },
      });
      n++;
    }
    this.wake(800);
    return n;
  },

  /* ── 지상국 (§5 ⌾) ────────────────────────────────────────────────────── */
  _gsEnts: [],
  groundStations(list, ko = true) {
    this._rm(this._gsEnts);
    for (const st of list || []) {
      this._gsEnts.push(this.ds.entities.add({
        id: `so:gs:${st.id}`,
        position: Cesium.Cartesian3.fromDegrees(st.lon, st.lat, 0),
        point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#cfe9ff').withAlpha(0.9),
          outlineColor: Cesium.Color.fromCssColorString('#5ad1e8').withAlpha(0.9), outlineWidth: 2,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4e7) },
        label: { text: ko ? st.name : st.en, font: '300 10px -apple-system, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#cfe9ff').withAlpha(0.8), pixelOffset: new Cesium.Cartesian2(0, 13),
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 9_000_000) },
        _meta: { kind: 'ground-station', _gs: st },
      }));
    }
    this.wake(600);
  },

  /** 선택 객체와 지금 보이는 지상국을 잇는 얇은 선 */
  _gsLinkEnts: [],
  stationLinks(obj, rows, clockMs) {
    this._rm(this._gsLinkEnts);
    if (!obj?.rec || !rows?.length) return;
    const a = geodeticAt(obj.rec, new Date(clockMs));
    if (!a) return;
    const A = cart(a);
    rows.filter(r => r.visible).forEach(r => {
      this._gsLinkEnts.push(this.ds.entities.add({
        id: `so:gslink:${r.station.id}`,
        polyline: { positions: [A, Cesium.Cartesian3.fromDegrees(r.station.lon, r.station.lat, 0)], width: 1,
          arcType: Cesium.ArcType.NONE, material: css('#5ad1e8').withAlpha(0.45) },
      }));
    });
    this.wake();
  },

  /* ── 카메라 (§22) ─────────────────────────────────────────────────────── */
  camera(preset, ctx = {}) {
    const fly = (lon, lat, h, d = 1.4) => viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, h), duration: d });
    switch (preset) {
      case 'GLOBAL': return fly(120, 10, 32_000_000);
      case 'ASIA': return fly(118, 22, 19_000_000);
      case 'KOREA': return fly(127.5, 36.3, 4_000_000);
      case 'LAUNCH_SITE': {
        const l = ctx.launch; if (!l || !Number.isFinite(l.lat)) return;
        return fly(l.lon, l.lat, 2_500_000);
      }
      case 'SELECTED': {
        const o = ctx.object; if (!o?.rec) return;
        const g = geodeticAt(o.rec, new Date(this.clockFn()));
        if (!g) return;
        return fly(g.lon, g.lat, Math.max(2_500_000, g.altKm * 1000 * 2.4 + 1_500_000));
      }
      default: return undefined;
    }
  },
};
