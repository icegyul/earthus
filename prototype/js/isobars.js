/* 등압선 — 기압 배치를 선으로
 *
 * 받은 지적: "기압배치에 고기압 저기압 배치를 등고선을 써서 보여주면 어때?
 *            더 정확할거 같은데"
 *
 * 맞는 말이다. 기상학에서 기압을 읽는 방식이 그것이다 —
 * ⚠️⚠️ **등압선의 간격이 곧 바람 세기**다. 촘촘하면 세다.
 *    색칠만으로는 "어디가 높나"만 알고 "얼마나 급한가"를 모른다.
 *
 * ⚠️⚠️ 그래서 격자를 따로 받는다. 전지구 격자는 5°(약 555km)라
 *    **한반도 전체가 한 칸**이다. 그걸로 매끄러운 등압선을 그리면
 *    없는 정밀도를 있는 척하는 것이 된다. 동아시아만 1°(약 111km)로 받는다.
 *
 * ⚠️ 4hPa 간격은 기상청 지상일기도가 쓰는 간격이다 — 우리가 정한 값이 아니다.
 *
 * ⚠️ 발열: 선은 자료가 바뀔 때 한 번만 만든다. 카메라가 움직여도 다시 안 만든다.
 *    (매 프레임 다시 계산하는 것이 이 앱 발열의 원인이었다 — power.js 참고)
 */

import { viewer } from './viewer.js';
import { API } from './config.js';
import { fetchT } from './net.js';
import { contourPathLength, contourPathMidpoint, contourSegments,
         stitchSegments } from './contour-math.js';

const SRC = () => `${API.WIND}/pressure-ea.json`;

/* 등압선 간격(hPa). ⚠️ 기상청 지상일기도와 같은 4hPa.
   더 촘촘히 하면 1°(111km) 격자가 감당 못 하는 선이 나온다. */
const STEP = 4;

/* 지면에서 띄우는 높이(m).
   ⚠️ 0 이면 지구 표면과 겹쳐 깊이 검사에서 져서 통째로 사라진다
      (태풍 예보선·등산로에서 이미 겪었다). */
const LIFT_M = 5_000;

/* 이보다 멀면 안 그린다 — 전지구에서 등압선은 실뭉치가 된다 */
const SHOW_MAX_M = 12_000_000;

/* 고기압·저기압을 찾을 때 이웃을 몇 칸까지 볼까.
   ⚠️ 1칸만 보면 잡음 하나로 "고기압"이 생긴다. 2칸(≈222km)을 본다. */
const HL_RADIUS = 2;

const HI = '#f0955a';     // 고기압
const LO = '#6ea8dc';     // 저기압
const LINE = 'rgba(255,255,255,.55)';

/** 고기압·저기압 중심 — 이웃보다 확실히 높거나 낮은 칸 */
function extrema(grid, nx, ny, lat0, lon0, res) {
  const out = [];
  const at = (x, y) => grid[y * nx + x];
  for (let y = HL_RADIUS; y < ny - HL_RADIUS; y++) {
    for (let x = HL_RADIUS; x < nx - HL_RADIUS; x++) {
      const c = at(x, y);
      if (c == null) continue;
      let hi = true, lo = true, n = 0;
      for (let dy = -HL_RADIUS; dy <= HL_RADIUS; dy++) {
        for (let dx = -HL_RADIUS; dx <= HL_RADIUS; dx++) {
          if (!dx && !dy) continue;
          const v = at(x + dx, y + dy);
          if (v == null) continue;
          n++;
          if (v >= c) hi = false;
          if (v <= c) lo = false;
        }
      }
      /* ⚠️ 이웃이 적으면(가장자리) 판정하지 않는다 — 화면 밖이 더 높을 수 있다. */
      if (n < (HL_RADIUS * 2 + 1) ** 2 - 1) continue;
      if (hi || lo) {
        out.push({ lat: lat0 + y * res, lon: lon0 + x * res, v: c, high: hi });
      }
    }
  }
  return out;
}

export const isobars = {
  ds: null,
  _doc: null,
  _at: 0,
  _on: false,
  /* 타임라인 예보 보기 — null 이면 실황으로 복귀 (ui-timeline.js 가 부른다) */
  _ovr: null,
  async setOverride(step, meta) {
    this._ovr = step
      ? { nx: meta.nx, ny: meta.ny, lat0: meta.lat0, lon0: meta.lon0,
          res: meta.res, mslp: step.mslp, min: step.min, max: step.max }
      : null;
    if (this._on) await this.set(true);
  },

  _ensure() {
    if (!this.ds) {
      this.ds = new Cesium.CustomDataSource('isobars');
      viewer.dataSources.add(this.ds);
    }
    return this.ds;
  },

  clear(announce = true) {
    try { this.ds?.entities.removeAll(); } catch (_) { }
    if (announce) document.dispatchEvent(new CustomEvent('earthus:contours-removed', {
      detail: { layer: 'pressure' },
    }));
    if (document.documentElement.dataset.isobarLayer === 'pressure') {
      delete document.documentElement.dataset.isobarLayer;
      delete document.documentElement.dataset.isobarPaths;
      delete document.documentElement.dataset.isobarLabels;
    }
    this._result = null;
    viewer?.scene?.requestRender?.();
  },

  async load() {
    if (this._doc && Date.now() - this._at < 20 * 60_000) return this._doc;
    try {
      const r = await fetchT(SRC(), { cache: 'no-cache' });
      this._doc = r.ok ? await r.json() : null;
      this._at = Date.now();
    } catch (_) { this._doc = null; }
    return this._doc;
  },

  /** 켜기/끄기. ⚠️ 그리는 것은 자료가 바뀔 때 한 번뿐이다. */
  async set(on) {
    this._on = !!on;
    if (!on) { this.clear(); return; }
    const d = this._ovr || await this.load();
    if (!d?.mslp) return;
    this.clear(false);
    const ds = this._ensure();

    const { nx, ny, lat0, lon0, res } = d;
    const lo = Math.ceil(d.min / STEP) * STEP;
    const hi = Math.floor(d.max / STEP) * STEP;

    let segmentCount = 0, pathCount = 0, labelCount = 0, missingCells = 0;
    const levels = [];
    for (let lv = lo; lv <= hi; lv += STEP) {
      const result = contourSegments(d, d.mslp, lv);
      const paths = stitchSegments(result.segments)
        .filter(path => path.length >= 2)
        .sort((a, b) => contourPathLength(b) - contourPathLength(a));
      if (!paths.length) continue;
      levels.push(lv);
      segmentCount += result.segments.length;
      missingCells = Math.max(missingCells, result.missingCells);
      /* ⚠️ 1012hPa(표준 기압 근처)를 굵게 한다. 기준선이 있어야 위아래가 읽힌다. */
      const base = Math.abs(lv - 1012) < 0.1;
      /* 짧은 선분을 연결한 경로 하나당 엔티티 하나만 만든다. */
      paths.forEach((path, i) => {
        pathCount++;
        const positions = [];
        path.forEach(([lon, lat]) => positions.push(lon, lat, LIFT_M));
        ds.entities.add({
          id: `iso:${lv}:${i}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
            width: base ? 2.2 : 1.3,
            material: Cesium.Color.fromCssColorString(LINE)
              .withAlpha(base ? 0.85 : 0.5),
            arcType: Cesium.ArcType.GEODESIC, clampToGround: false,
            distanceDisplayCondition:
              new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
          },
        });
      });
      /* 등압선 자체에 값을 쓴다. H/L만으로는 어느 선이 몇 hPa인지 읽을 수 없다. */
      paths.slice(0, 2).forEach((path, i) => {
        if (contourPathLength(path) < Math.max(0.6, res * 0.45)) return;
        const point = contourPathMidpoint(path);
        if (!point) return;
        labelCount++;
        ds.entities.add({
          id: `iso:value:${lv}:${i}`,
          position: Cesium.Cartesian3.fromDegrees(point[0], point[1], LIFT_M + 700),
          label: {
            text: `${lv}hPa`,
            font: '650 11px ui-monospace, SFMono-Regular, Menlo, monospace',
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.9), outlineWidth: 3,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#02080c').withAlpha(0.62),
            backgroundPadding: new Cesium.Cartesian2(4, 2),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: 0,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
          },
        });
      });
    }

    /* ── 고기압 H · 저기압 L ──────────────────────────────
       ⚠️ 값을 함께 적는다. H 만 있으면 얼마나 센 고기압인지 모른다. */
    extrema(d.mslp, nx, ny, lat0, lon0, res).forEach((e, i) => {
      const col = Cesium.Color.fromCssColorString(e.high ? HI : LO);
      ds.entities.add({
        id: `iso:hl:${i}`,
        position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat, LIFT_M),
        label: {
          text: `${e.high ? 'H' : 'L'}\n${Math.round(e.v)}`,
          font: '700 15px -apple-system, sans-serif',
          fillColor: col,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.85), outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition:
            new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
        },
      });
    });

    const payload = {
      layer: 'pressure', levels, segmentCount, pathCount, labelCount,
      missingCells, cells: (nx - 1) * (ny - 1), method: 'MARCHING_SQUARES',
      basis: 'KMA_SURFACE_CHART_4HPA', unit: 'hPa', resolution: res,
    };
    document.dispatchEvent(new CustomEvent('earthus:contours-ready', { detail: payload }));
    document.documentElement.dataset.isobarLayer = 'pressure';
    document.documentElement.dataset.isobarPaths = String(pathCount);
    document.documentElement.dataset.isobarLabels = String(labelCount);
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('earthus:contours-ready', {
      detail: payload,
    })));
    /* readability가 늦게 초기화되는 딥링크 복원에서도 이미 생성된 결과를 읽는다. */
    this._result = payload;
    viewer.scene.requestRender?.();

    return d;
  },

  rendered() { return this._result || null; },
  STEP, LIFT_M,
};
