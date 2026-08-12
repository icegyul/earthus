// EARTHUS PR-06 — 연속 격자 공통 등치선.
//
// 단계색만으로는 같은 색 안에서 값의 경계를 읽기 어렵다. 기온·풍속·TPW·수온·
// 수온편차·파고는 **색 범례 경계와 같은 값**의 선을 얹고 수치를 직접 적는다.
// 기압은 1° 전용 원격자와 공식 4 hPa 간격이 필요해 isobars.js가 별도로 소유한다.
//
// ⚠️ 점 관측·위성 영상·재난 점에는 절대 적용하지 않는다.
// ⚠️ 카메라 이벤트나 타이머로 다시 계산하지 않는다. 원격자 렌더 완료 때 한 번 만들고
//    레이어가 꺼지면 전부 제거한다. requestRenderMode의 idle render는 0을 유지한다.
// ⚠️ `clampToGround`를 쓰지 않는다. 지표와 겹치지 않게 유한 높이로 띄운다.

import { viewer } from './viewer.js';
import { i18n } from './i18n.js';
import { contourPathLength, contourPathMidpoint, contourSegments,
         stitchSegments } from './contour-math.js';

const LIFT_M = 9_000;
const SHOW_MAX_M = 32_000_000;
const LINE = '#f4fbfe';

/* 등치선은 임의 확대 단계가 아니라 변수마다 고정된 **색 경계값**이다.
   경계가 불규칙한 수온·파고·편차도 범례와 선이 정확히 맞는다. */
export const CONTOUR_PROFILES = Object.freeze({
  temp:    { levels: [-25, -10, 0, 10, 20, 30, 40], unit: '°C' },
  tmax:    { levels: [0, 12, 22, 28, 33, 38], unit: '°C' },
  tmin:    { levels: [-20, -10, 0, 8, 16, 24], unit: '°C' },
  wind:    { levels: [2, 5, 10, 15, 20, 30, 45], unit: 'm/s' },
  windfc:  { levels: [2, 5, 10, 15, 20, 30, 45], unit: 'm/s' },
  tpw:     { levels: [10, 20, 30, 40, 50, 60, 70], unit: 'mm' },
  sst:     { levels: [4, 10, 16, 22, 26, 29], unit: '°C' },
  sstanom: { levels: [-1.5, -0.5, 0, 0.5, 1.5], unit: '°C', emphasis: 0 },
  wave:    { levels: [1, 2, 3, 4, 6, 9], unit: 'm' },
});

const levelText = (value, unit) => `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
const signatureOf = detail => [detail.layer, detail.grid?.time || detail.grid?.validAt || '',
  detail.grid?.nx, detail.grid?.ny, detail.grid?.lat0, detail.grid?.lon0, detail.grid?.res,
  detail.sourceName || ''].join(':');

export const continuousContours = {
  sources: new Map(),
  signatures: new Map(),
  results: new Map(),
  _started: false,

  init() {
    if (this._started) return this;
    this._started = true;
    document.addEventListener('earthus:grid-ready', event => this.render(event.detail));
    document.addEventListener('earthus:grid-removed', event => this.clear(event.detail?.layer));
    return this;
  },

  _source(layer) {
    let source = this.sources.get(layer);
    if (!source) {
      source = new Cesium.CustomDataSource(`continuous-contours:${layer}`);
      viewer.dataSources.add(source);
      this.sources.set(layer, source);
    }
    return source;
  },

  clear(layer, announce = true) {
    if (!layer || !CONTOUR_PROFILES[layer]) return;
    const source = this.sources.get(layer);
    try { source?.entities.removeAll(); } catch (_) { }
    this.signatures.delete(layer);
    this.results.delete(layer);
    if (document.documentElement.dataset.contourLayer === layer) {
      delete document.documentElement.dataset.contourLayer;
      delete document.documentElement.dataset.contourPaths;
      delete document.documentElement.dataset.contourLabels;
    }
    if (announce) document.dispatchEvent(new CustomEvent('earthus:contours-removed', {
      detail: { layer },
    }));
    viewer?.scene?.requestRender?.();
  },

  render(detail) {
    const profile = CONTOUR_PROFILES[detail?.layer];
    if (!profile || !detail?.grid || !Array.isArray(detail.field)) return;
    const signature = signatureOf(detail);
    if (this.signatures.get(detail.layer) === signature) return;

    this.clear(detail.layer, false);
    const source = this._source(detail.layer);
    let segmentCount = 0, pathCount = 0, labelCount = 0, cells = 0, missingCells = 0;
    const levelsDrawn = [];

    profile.levels.forEach(level => {
      const result = contourSegments(detail.grid, detail.field, level);
      cells = Math.max(cells, result.cells);
      missingCells = Math.max(missingCells, result.missingCells);
      if (!result.segments.length) return;
      segmentCount += result.segments.length;
      const paths = stitchSegments(result.segments)
        .filter(path => path.length >= 2)
        .sort((a, b) => contourPathLength(b) - contourPathLength(a));
      if (!paths.length) return;
      levelsDrawn.push(level);

      const emphasized = profile.emphasis === level;
      paths.forEach((path, index) => {
        pathCount++;
        const positions = [];
        path.forEach(([lon, lat]) => positions.push(lon, lat, LIFT_M));
        source.entities.add({
          id: `contour:${detail.layer}:${level}:${index}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
            width: emphasized ? 2.2 : 1.25,
            material: Cesium.Color.fromCssColorString(LINE).withAlpha(emphasized ? 0.88 : 0.62),
            arcType: Cesium.ArcType.GEODESIC,
            clampToGround: false,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
          },
        });
      });

      /* 긴 선부터 레벨당 최대 2개만 값을 적는다. 라벨이 선보다 많아지면 지구가 표가 된다. */
      paths.slice(0, 2).forEach((path, index) => {
        if (contourPathLength(path) < Math.max(0.6, detail.grid.res * 0.45)) return;
        const point = contourPathMidpoint(path);
        if (!point) return;
        labelCount++;
        source.entities.add({
          id: `contour-label:${detail.layer}:${level}:${index}`,
          position: Cesium.Cartesian3.fromDegrees(point[0], point[1], LIFT_M + 700),
          label: {
            text: levelText(level, profile.unit),
            font: '650 11px ui-monospace, SFMono-Regular, Menlo, monospace',
            fillColor: Cesium.Color.WHITE,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.fromCssColorString('#02080c').withAlpha(0.92),
            outlineWidth: 3,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#02080c').withAlpha(0.62),
            backgroundPadding: new Cesium.Cartesian2(4, 2),
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: 0,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
          },
        });
      });
    });

    const payload = {
      layer: detail.layer, levels: levelsDrawn, segmentCount, pathCount, labelCount,
      cells, missingCells, method: 'MARCHING_SQUARES', basis: 'LEGEND_BREAKS',
      unit: profile.unit,
    };
    this.signatures.set(detail.layer, signature);
    this.results.set(detail.layer, payload);
    /* DOM 기반 E2E 계측. 숫자만 노출하며 원자료나 사용자 정보는 넣지 않는다. */
    document.documentElement.dataset.contourLayer = detail.layer;
    document.documentElement.dataset.contourPaths = String(pathCount);
    document.documentElement.dataset.contourLabels = String(labelCount);
    document.dispatchEvent(new CustomEvent('earthus:contours-ready', { detail: payload }));
    /* readability가 같은 ready 이벤트의 앞 순서에서 기본 문구를 그렸더라도, 결과가
       저장된 다음 한 번 다시 동기화할 수 있게 한다. 새 계산이나 렌더는 없다. */
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('earthus:contours-ready', {
      detail: payload,
    })));
    viewer.scene.requestRender?.();
    return payload;
  },

  /** 범례 문구와 테스트가 같은 계약을 읽는다. */
  profileOf(layer) { return CONTOUR_PROFILES[layer] || null; },
  renderedOf(layer) { return this.results.get(layer) || null; },
  description(layer) {
    const profile = CONTOUR_PROFILES[layer];
    if (!profile) return null;
    return i18n.lang === 'ko'
      ? `등치선 ${profile.levels.map(value => levelText(value, profile.unit)).join(' · ')} · 색 경계값 · 결측 칸 제외`
      : `Contours ${profile.levels.map(value => levelText(value, profile.unit)).join(' · ')} · legend breaks · missing cells skipped`;
  },
};
