// 관광·인간 흐름 3D 밀도.
// 기관의 추정 인구 범위는 여러 공유 셀에 보존해 배분하고, 범주형 혼잡 등급은 높이와 색으로 옮긴다.
// 셀은 실제 구역 면적·수용력·OD가 아닌 지역 표시용 배분이므로 이동 방향을 그리지 않는다.

import { API } from '../config.js';
import { fetchT } from '../net.js';
import { store } from '../store.js';
import { viewer } from '../viewer.js';
import { resolveTourismEvidence, validateTourismSnapshot } from '../tourism-flow-contract.js';
import {
  buildTourismDensityGrid, DENSITY_LIMITS, dominantPlaceForCell,
} from '../tourism-density-grid.js';
import {
  buildTourismLabelCandidates, selectNonOverlappingLabels,
} from '../tourism-density-labels.js';
import { koreaAdminAt } from '../korea-admin-reference.js';
import { validateKtoSummary } from '../kto-tourism-contract.js';
import { tourismMapStyle } from './tourism-map-style.js';

const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);
export const TOURISM_LOD = Object.freeze({
  overview: Object.freeze({ minCameraHeight: 18_000, kernelSize: 5, cellMeters: 320 }),
  district: Object.freeze({ minCameraHeight: 6_000, kernelSize: 5, cellMeters: 170 }),
  detail: Object.freeze({ minCameraHeight: 0, kernelSize: 5, cellMeters: 95 }),
});

function lodForCameraHeight(value) {
  const height = Number(value);
  if (!Number.isFinite(height) || height >= TOURISM_LOD.overview.minCameraHeight) return 'overview';
  if (height >= TOURISM_LOD.district.minCameraHeight) return 'district';
  return 'detail';
}

function placeInsideRectangle(place, rectangle) {
  if (!rectangle) return true;
  const lat = Number(place?.position?.lat);
  const lon = Number(place?.position?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return Cesium.Rectangle.contains(rectangle, Cesium.Cartographic.fromDegrees(lon, lat));
}

function kstTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul',
  }).format(date);
}

function newestObservedAt(snapshot) {
  return (snapshot?.places || [])
    .map(place => place?.provenance?.observedAt)
    .filter(value => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
}

export const tourismFlow = {
  ds: null,
  labelDs: null,
  snapshot: null,
  selectedAt: null,
  _abort: null,
  _focusedOnce: false,
  _mapUi: null,
  _adminByPlaceId: new Map(),
  _moveEndRemove: null,
  _postRenderRemove: null,
  _timeListenerBound: false,
  _renderSourceCount: 0,
  _minimumZoomDistanceBeforeTourism: null,

  init() {
    if (this.ds && this.labelDs) return this;
    this.ds = new Cesium.CustomDataSource('tourism-flow');
    this.labelDs = new Cesium.CustomDataSource('tourism-density-labels');
    viewer.dataSources.add(this.ds);
    viewer.dataSources.add(this.labelDs);
    this.ds.show = false;
    this.labelDs.show = false;
    this._ensureMapUi();
    if (!this._timeListenerBound) {
      this._timeListenerBound = true;
      document.addEventListener('earthus:tourism-time', event => {
        this.selectedAt = event.detail?.at || null;
        this.renderAt(this.selectedAt);
      });
    }
    if (!this._moveEndRemove) {
      this._moveEndRemove = viewer.camera.moveEnd.addEventListener(() => {
        if (store.isOn('tourism') && this.snapshot?.places) this.renderAt(this.selectedAt);
      });
    }
    return this;
  },

  async refresh() {
    if (!store.isOn('tourism')) return;
    this._abort?.abort();
    const controller = new AbortController();
    this._abort = controller;
    try {
      let response = await fetchT(`${API.TOURISM}/seoul-flow.json`, {
        timeout: 12_000, signal: controller.signal, cache: 'no-cache',
      });
      if (!response.ok && IS_LOCAL) {
        response = await fetchT('data/tourism/seoul-flow.sample.v1.json', {
          timeout: 5_000, signal: controller.signal, cache: 'no-cache',
        });
      }
      if (!response.ok) throw new Error(`tourism HTTP ${response.status}`);
      const snapshot = await response.json();
      validateTourismSnapshot(snapshot);
      try {
        const healthResponse = await fetchT(`${API.TOURISM}/health.json`, {
          timeout: 5_000, signal: controller.signal, cache: 'no-cache',
        });
        if (healthResponse.ok) snapshot.health = await healthResponse.json();
      } catch (_) { /* health 보조 파일 실패가 현재 공식 관측까지 지우면 안 된다. */ }
      try {
        const ktoResponse = await fetchT(`${API.TOURISM}/kto/summary.json`, {
          timeout: 5_000, signal: controller.signal, cache: 'no-cache',
        });
        if (ktoResponse.ok) {
          const ktoSummary = await ktoResponse.json();
          validateKtoSummary(ktoSummary);
          snapshot.ktoSummary = ktoSummary;
        }
      } catch (_) {
        // KTO 미연결·계약 불일치는 서울시 현재 관측을 지우지 않고 별도 상태로 보여준다.
      }
      this.snapshot = snapshot;
      this._adminByPlaceId = new Map();
      const adminEntriesPromise = Promise.all((snapshot.places || []).map(async place => {
        const lat = Number(place?.position?.lat);
        const lon = Number(place?.position?.lon);
        if (!place?.id || !Number.isFinite(lat) || !Number.isFinite(lon)) return [place?.id, null];
        return [place.id, await koreaAdminAt(lat, lon)];
      }));
      this.renderAt(this.selectedAt);
      document.dispatchEvent(new CustomEvent('earthus:tourism-snapshot', { detail: snapshot }));
      if (!this._focusedOnce && snapshot.places?.some(place => place.position)) {
        this._focusedOnce = true;
        // 첫 화면 위치·인트로 flight가 아직 남아 있으면 관광지 확대와 다시 경쟁한다.
        // 사용자가 레이어를 직접 켠 시점의 이동이 마지막 의도이므로 기존 flight를 먼저 끊는다.
        viewer.camera.cancelFlight();
        viewer.camera.flyTo({
          // flyTo의 좌표는 카메라 위치다. 서울 중심을 블록 화면 중앙에 두기 위해
          // 남서쪽 상공에서 북동쪽(heading 22°)을 보도록 출발 위치를 둔다.
          destination: Cesium.Cartesian3.fromDegrees(126.89, 37.36, 26_000),
          orientation: {
            heading: Cesium.Math.toRadians(22),
            pitch: Cesium.Math.toRadians(-52),
            roll: 0,
          },
          duration: 1.2,
          complete: () => this.renderAt(this.selectedAt),
        });
      }
      const adminEntries = await adminEntriesPromise;
      if (controller.signal.aborted || this.snapshot !== snapshot) return null;
      // 행정 경계 파일 실패는 셀을 지우지 않는다. 라벨 모듈이 공식 관광지명으로 되돌아간다.
      this._adminByPlaceId = new Map(adminEntries.filter(([id]) => id));
      this.renderAt(this.selectedAt);
      return snapshot;
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      document.dispatchEvent(new CustomEvent('earthus:tourism-error', {
        detail: { code: 'TOURISM_SNAPSHOT_UNAVAILABLE' },
      }));
      throw error;
    } finally {
      if (this._abort === controller) this._abort = null;
    }
  },

  renderAt(at = null) {
    if (!this.ds || !this.labelDs) return;
    this._postRenderRemove?.();
    this._postRenderRemove = null;
    this.ds.entities.removeAll();
    this.labelDs.entities.removeAll();
    if (!store.isOn('tourism') || !this.snapshot?.places) {
      this.applyVisibility();
      return;
    }

    const cameraHeight = viewer.camera.positionCartographic?.height;
    const lod = lodForCameraHeight(cameraHeight);
    const settings = TOURISM_LOD[lod];
    const isMobile = Math.min(window.innerWidth, viewer.canvas?.clientWidth || window.innerWidth) <= 640;
    const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    const renderPlaces = this.snapshot.places.filter(place => {
      const evidence = resolveTourismEvidence(place, at);
      if (!evidence || (at && evidence.sourceType !== 'OFFICIAL_FORECAST')) return false;
      return lod !== 'detail' || placeInsideRectangle(place, rectangle);
    });
    this._renderSourceCount = renderPlaces.length;
    const maxCells = isMobile ? DENSITY_LIMITS.mobile : DENSITY_LIMITS.desktop;
    const grid = buildTourismDensityGrid(renderPlaces, at, {
      lod: isMobile ? 'mobile' : 'district',
      kernelSize: settings.kernelSize,
      cellMeters: settings.cellMeters,
      maxCells,
    });
    const placesById = new Map(renderPlaces.map(place => [place.id, place]));
    for (const cell of grid.cells) {
      const place = dominantPlaceForCell(cell, placesById);
      if (!place) continue;
      const color = Cesium.Color.fromCssColorString(cell.color).withAlpha(cell.alpha);
      this.ds.entities.add({
        id: cell.id,
        position: Cesium.Cartesian3.fromDegrees(
          cell.lon, cell.lat, cell.heightMeters / 2,
        ),
        box: {
          dimensions: new Cesium.Cartesian3(
            cell.cellMeters * 0.92, cell.cellMeters * 0.92, cell.heightMeters,
          ),
          material: color,
          outline: false,
        },
        _tourism: place,
        _tourismContributors: cell.allocations,
        _tourismVisual: cell,
      });
    }

    const labelLimit = isMobile ? 8 : lod === 'detail' ? 12 : 10;
    const candidates = buildTourismLabelCandidates(renderPlaces, this._adminByPlaceId, {
      lod, limit: labelLimit,
      isVisible: place => placeInsideRectangle(place, rectangle),
    });
    for (const candidate of candidates) {
      this.labelDs.entities.add({
        id: `tourism-label:${candidate.id}`,
        position: Cesium.Cartesian3.fromDegrees(candidate.lon, candidate.lat, 205),
        label: {
          text: candidate.text,
          show: false,
          font: candidate.kind === 'district'
            ? '700 13px system-ui, -apple-system, sans-serif'
            : '600 12px system-ui, -apple-system, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.9),
          outlineWidth: 4,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        _tourismLabelCandidate: candidate,
      });
    }
    this.applyVisibility();
    this._layoutLabelsOnce(labelLimit);
    viewer.scene.requestRender();
  },

  _layoutLabelsOnce(limit) {
    if (!this.labelDs?.show || !this.labelDs.entities.values.length) return;
    const scene = viewer.scene;
    const canvas = scene.canvas;
    let remove = null;
    remove = scene.postRender.addEventListener(() => {
      remove?.();
      if (this._postRenderRemove === remove) this._postRenderRemove = null;
      const entities = this.labelDs.entities.values;
      const candidates = entities.map(entity => entity._tourismLabelCandidate);
      const projectedRects = new Map();
      entities.forEach((entity, index) => {
        const candidate = candidates[index];
        const position = entity.position?.getValue(Cesium.JulianDate.now());
        const screen = position ? Cesium.SceneTransforms.worldToWindowCoordinates(scene, position) : null;
        const width = Math.max(44, candidate.text.length * 13 + 16);
        const height = 24;
        projectedRects.set(candidate.id, {
          left: screen?.x - width / 2,
          top: screen?.y - height,
          right: screen?.x + width / 2,
          bottom: screen?.y,
          viewportWidth: canvas.clientWidth,
          viewportHeight: canvas.clientHeight,
          visible: Boolean(screen),
        });
      });
      const selectedIds = new Set(selectNonOverlappingLabels(
        candidates, projectedRects, limit,
      ).map(candidate => candidate.id));
      entities.forEach(entity => {
        entity.label.show = selectedIds.has(entity._tourismLabelCandidate.id);
      });
      scene.requestRender();
    });
    this._postRenderRemove = remove;
  },

  _ensureMapUi() {
    if (this._mapUi?.isConnected) return this._mapUi;
    const template = document.createElement('template');
    template.innerHTML = '<section id="tourismMapUi" aria-hidden="true" data-nosnippet></section>';
    this._mapUi = template.content.firstElementChild;
    document.body.append(this._mapUi);
    return this._mapUi;
  },

  _timelineOptions() {
    const forecastTimes = [...new Set((this.snapshot?.places || []).flatMap(place =>
      (place.forecast || []).map(row => row.at),
    ).filter(value => Number.isFinite(Date.parse(value))))]
      .sort((left, right) => Date.parse(left) - Date.parse(right));
    return [null, ...forecastTimes];
  },

  _renderMapUi() {
    const node = this._ensureMapUi();
    const visible = Boolean(this.ds?.show && this.snapshot?.places?.length);
    node.setAttribute('aria-hidden', String(!visible));
    if (!visible) return;

    const coverage = this.snapshot.coverage || {};
    const observedAt = newestObservedAt(this.snapshot);
    const forecastMode = Boolean(this.selectedAt);
    const timeline = this._timelineOptions();
    const quality = this.snapshot.quality || {};
    const currentEvidenceLabel = quality.live > 0
      ? (quality.stale > 0 ? '서울시 공식 관측 · 일부 지난 관측' : '서울시 공식 관측')
      : quality.degraded > 0 ? '서울시 제한된 공식 관측'
        : quality.stale > 0 ? '서울시 지난 공식 관측'
          : '서울시 공식 관측 자료 없음';
    const timeLabel = forecastMode ? '예측 시각' : '관측';
    node.innerHTML = `
      <header class="tm-title">
        <small>EARTHUS · TOURISM</small>
        <h2>서울 관광 밀도</h2>
        <p><i aria-hidden="true"></i>${forecastMode ? '서울시 공식 예측' : currentEvidenceLabel} · ${forecastMode ? this._renderSourceCount : (coverage.available ?? '—')}/${coverage.total ?? '—'}곳 · ${timeLabel} ${kstTime(forecastMode ? this.selectedAt : observedAt)} KST</p>
      </header>
      <aside class="tm-legend" aria-label="관광지 혼잡 등급 범례">
        <b>높이·색 = 관광 혼잡도</b>
        <ol>
          <li class="tm-rank1">여유</li>
          <li class="tm-rank2">보통</li>
          <li class="tm-rank3">혼잡</li>
          <li class="tm-rank4">매우 혼잡</li>
        </ol>
      </aside>
      <nav class="tm-timeline" aria-label="서울 관광 밀도 시각 선택">
        <span>${forecastMode ? '공식 예측 시각' : '공식 관측 시각'}</span>
        <div>${timeline.map(at => `<button type="button" data-tourism-map-time="${at || ''}" aria-pressed="${String((at || null) === this.selectedAt)}" aria-label="${at ? `공식 예측 ${kstTime(at)} KST` : '현재 공식 관측'}"><i aria-hidden="true"></i><time>${at ? kstTime(at) : '현재'}</time></button>`).join('')}</div>
      </nav>`;
    node.querySelectorAll('[data-tourism-map-time]').forEach(button => {
      button.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('earthus:tourism-time', {
          detail: { at: button.dataset.tourismMapTime || null },
        }));
      });
    });
  },

  set(on) {
    const cameraController = viewer.scene.screenSpaceCameraController;
    if (!on) {
      this._abort?.abort();
      this._abort = null;
      this.selectedAt = null;
      tourismMapStyle.set(false);
      if (this._minimumZoomDistanceBeforeTourism != null) {
        cameraController.minimumZoomDistance = this._minimumZoomDistanceBeforeTourism;
        this._minimumZoomDistanceBeforeTourism = null;
      }
    } else {
      // 관광 detail LOD는 4km다. 전역 8km 제한을 그대로 두면 정의만 있고 사용자가
      // 도달할 수 없는 단계가 되므로, 레이어가 켜진 동안에만 낮추고 OFF에서 정확히 복원한다.
      if (this._minimumZoomDistanceBeforeTourism == null) {
        this._minimumZoomDistanceBeforeTourism = cameraController.minimumZoomDistance;
      }
      cameraController.minimumZoomDistance = Math.min(
        this._minimumZoomDistanceBeforeTourism, 4_000,
      );
      tourismMapStyle.set(true);
    }
    this.applyVisibility();
  },

  applyVisibility() {
    if (!this.ds || !this.labelDs) return;
    this.ds.show = store.isOn('tourism') && store.height <= 2_500_000;
    this.labelDs.show = this.ds.show;
    tourismMapStyle.set(this.ds.show);
    this._renderMapUi();
  },

  count() {
    return this.ds?.show ? this.ds.entities.values.length : 0;
  },
};
