// 관광·인간 흐름 3D Density Tower.
// 기관의 범주형 혼잡 등급만 높이와 색으로 옮기며, 이동 방향은 그리지 않는다.

import { API } from '../config.js';
import { fetchT } from '../net.js';
import { store } from '../store.js';
import { viewer } from '../viewer.js';
import { towerVisual, validateTourismSnapshot } from '../tourism-flow-contract.js';

const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);

export const tourismFlow = {
  ds: null,
  snapshot: null,
  selectedAt: null,
  _abort: null,
  _focusedOnce: false,

  init() {
    this.ds = new Cesium.CustomDataSource('tourism-flow');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    document.addEventListener('earthus:tourism-time', event => {
      this.selectedAt = event.detail?.at || null;
      this.renderAt(this.selectedAt);
    });
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
      this.snapshot = snapshot;
      this.renderAt(this.selectedAt);
      document.dispatchEvent(new CustomEvent('earthus:tourism-snapshot', { detail: snapshot }));
      if (!this._focusedOnce && snapshot.places?.some(place => place.position)) {
        this._focusedOnce = true;
        // 첫 화면 위치·인트로 flight가 아직 남아 있으면 관광지 확대와 다시 경쟁한다.
        // 사용자가 레이어를 직접 켠 시점의 이동이 마지막 의도이므로 기존 flight를 먼저 끊는다.
        viewer.camera.cancelFlight();
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(126.978, 37.5665, 260_000),
          duration: 1.2,
          complete: () => this.applyVisibility(),
        });
      }
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
    if (!this.ds) return;
    this.ds.entities.removeAll();
    if (!store.isOn('tourism') || !this.snapshot?.places) {
      this.ds.show = false;
      return;
    }
    for (const place of this.snapshot.places) {
      const visual = towerVisual(place, at);
      if (!visual) continue;
      const color = Cesium.Color.fromCssColorString(visual.color).withAlpha(visual.alpha);
      const forecast = visual.sourceType === 'OFFICIAL_FORECAST';
      const state = place.state === 'LIVE' && !forecast ? 'LIVE' : forecast ? '공식 예측' : place.stateLabelKo;
      this.ds.entities.add({
        id: `tourism:${place.code}`,
        position: Cesium.Cartesian3.fromDegrees(
          place.position.lon, place.position.lat, visual.heightMeters / 2,
        ),
        cylinder: {
          length: visual.heightMeters,
          topRadius: visual.radiusMeters * 0.72,
          bottomRadius: visual.radiusMeters,
          material: color,
          outline: true,
          outlineColor: color.withAlpha(Math.min(1, visual.alpha + 0.22)),
          outlineWidth: 1,
        },
        label: {
          text: `${place.nameKo}\n${state} · ${visual.level}`,
          font: '500 12px ui-monospace, SFMono-Regular, Menlo, monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.88),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 850_000),
        },
        _tourism: place,
        _tourismVisual: visual,
      });
    }
    this.applyVisibility();
    viewer.scene.requestRender();
  },

  set(on) {
    if (!on) {
      this._abort?.abort();
      this._abort = null;
      this.selectedAt = null;
    }
    this.applyVisibility();
  },

  applyVisibility() {
    if (!this.ds) return;
    this.ds.show = store.isOn('tourism') && store.height <= 2_500_000;
  },

  count() {
    return this.ds?.show ? this.ds.entities.values.length : 0;
  },
};
