// 관광·인간 흐름 3D Density Tower.
// 기관의 추정 인구 범위는 높이로, 범주형 혼잡 등급은 색으로 옮기며 이동 방향은 그리지 않는다.

import { API } from '../config.js';
import { fetchT } from '../net.js';
import { store } from '../store.js';
import { viewer } from '../viewer.js';
import { towerVisual, validateTourismSnapshot } from '../tourism-flow-contract.js';
import { validateKtoSummary } from '../kto-tourism-contract.js';
import { tourismMapStyle } from './tourism-map-style.js';

const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);

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
  snapshot: null,
  selectedAt: null,
  _abort: null,
  _focusedOnce: false,
  _mapUi: null,

  init() {
    this.ds = new Cesium.CustomDataSource('tourism-flow');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    this._ensureMapUi();
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
      this.renderAt(this.selectedAt);
      document.dispatchEvent(new CustomEvent('earthus:tourism-snapshot', { detail: snapshot }));
      if (!this._focusedOnce && snapshot.places?.some(place => place.position)) {
        this._focusedOnce = true;
        // 첫 화면 위치·인트로 flight가 아직 남아 있으면 관광지 확대와 다시 경쟁한다.
        // 사용자가 레이어를 직접 켠 시점의 이동이 마지막 의도이므로 기존 flight를 먼저 끊는다.
        viewer.camera.cancelFlight();
        viewer.camera.flyTo({
          // flyTo의 좌표는 카메라 위치다. 서울 중심을 기둥 화면 중앙에 두기 위해
          // 남서쪽 상공에서 북동쪽(heading 22°)을 보도록 출발 위치를 둔다.
          destination: Cesium.Cartesian3.fromDegrees(126.77, 37.1575, 70_000),
          orientation: {
            heading: Cesium.Math.toRadians(22),
            pitch: Cesium.Math.toRadians(-55),
            roll: 0,
          },
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
      this.applyVisibility();
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
          // 장소별 공식 값을 가는 기둥으로 남겨, 서로 다른 장소를 하나의 면적값처럼 합치지 않는다.
          topRadius: visual.radiusMeters * 0.24,
          bottomRadius: visual.radiusMeters * 0.32,
          material: color,
          outline: false,
        },
        label: {
          text: `${place.nameKo}\n${state} · ${visual.level}`,
          // 지도 전체는 기둥 밀도를 읽는 화면이다. 상세 명칭은 기둥 선택 뒤 시트에서만 연다.
          show: false,
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
        <h2>서울 관광 흐름</h2>
        <p><i aria-hidden="true"></i>${forecastMode ? '서울시 공식 예측' : currentEvidenceLabel} · ${coverage.available ?? '—'}/${coverage.total ?? '—'}곳 · ${timeLabel} ${kstTime(forecastMode ? this.selectedAt : observedAt)} KST</p>
        <span>기둥 하나는 서울시가 구분한 한 관광지입니다.</span>
        <small class="tm-map-credit">지도 · Esri · 경계·도로</small>
      </header>
      <aside class="tm-legend" aria-label="관광지 혼잡 등급 범례">
        <b>기둥 높이·색</b>
        <ol>
          <li class="tm-rank4">붐빔</li>
          <li class="tm-rank3">약간 붐빔</li>
          <li class="tm-rank2">보통</li>
          <li class="tm-rank1">여유</li>
        </ol>
        <span>높이=공식 추정 인구 범위<br>색=기관 혼잡 등급</span>
      </aside>
      <nav class="tm-timeline" aria-label="서울 관광 흐름 시각 선택">
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
    if (!on) {
      this._abort?.abort();
      this._abort = null;
      this.selectedAt = null;
      tourismMapStyle.set(false);
    } else {
      tourismMapStyle.set(true);
    }
    this.applyVisibility();
  },

  applyVisibility() {
    if (!this.ds) return;
    this.ds.show = store.isOn('tourism') && store.height <= 2_500_000;
    tourismMapStyle.set(this.ds.show);
    this._renderMapUi();
  },

  count() {
    return this.ds?.show ? this.ds.entities.values.length : 0;
  },
};
