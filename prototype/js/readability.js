// EARTHUS PR-04 — 수치 레이어 공통 판독 기반.
//
// 아름다운 첫 지구에는 아무것도 얹지 않는다. 사용자가 연속 격자 레이어를 켠 뒤에만
// 범례·화면 안 도시 원격자값·지점 근거를 보여준다. 화면 숫자는 보간한 캔버스 픽셀이
// 아니라 `gridoverlay`가 실제로 그린 격자의 가장 가까운 원값이다.
//
// ⚠️ 점 관측·위성·재난 자료에는 이 모듈로 색면이나 등치선을 만들지 않는다.
// ⚠️ 자료가 없거나 범위 밖이면 0으로 표시하지 않는다.

import { viewer, onCameraIdle, viewRect } from './viewer.js';
import { gridOverlay } from './gridoverlay.js';
import { gridBounds, nearestGridValue } from './gridmath.js';
import { worldPlaces, describePlace, latLonText } from './geoname.js';
import { i18n } from './i18n.js';
import { store } from './store.js';
import { coastlineReference } from './coastline-reference.js';
/* main과 정확히 같은 URL을 써야 ES module 인스턴스가 둘로 갈라지지 않는다. */
import { continuousContours } from './continuous-contours.js?v=20260812-contours1';

const ESRI_REFERENCE = 'https://services.arcgisonline.com/ArcGIS/rest/services/'
  + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ESRI_CREDIT = 'Esri, Garmin, HERE, © OpenStreetMap contributors, and the GIS user community';
/* 국가·해안선은 색면을 가리지 않는 범위에서 기본 표시하고, 사용자가 판독 모드를
   명시적으로 켰을 때만 더 강하게 보인다. 첫 Earth View에는 reference 자체가 없다. */
const REFERENCE_ALPHA = Object.freeze({ data: 0.78, read: 0.96 });
const GRID_LAYERS = new Set([
  'temp', 'tmax', 'tmin', 'wind', 'windfc', 'humidity', 'tpw', 'rain', 'pressure', 'fog', 'drought',
  'pm25', 'pm10', 'dust', 'aqi', 'uv', 'ozone', 'sst', 'sstanom', 'wave', 'swell', 'current',
]);
const KIND = {
  temp: ['현재 기온', 'Current temperature', 'MODEL'],
  tmax: ['내일 최고기온', 'Tomorrow maximum', 'MODEL FORECAST'],
  tmin: ['내일 최저기온', 'Tomorrow minimum', 'MODEL FORECAST'],
  wind: ['현재 풍속', 'Current wind speed', 'COMPUTED FROM MODEL'],
  windfc: ['내일 대표 풍속', 'Tomorrow representative wind', 'MODEL FORECAST · COMPUTED'],
  humidity: ['2m 상대습도', '2 m relative humidity', 'MODEL'],
  tpw: ['수증기 통로', 'Moisture corridor', 'MODEL ANALYSIS'],
  rain: ['강수 강도', 'Precipitation rate', 'MODEL'],
  pressure: ['해면기압', 'Mean sea-level pressure', 'MODEL'],
  fog: ['시정', 'Visibility', 'MODEL'],
  drought: ['표층 토양수분', 'Surface soil moisture', 'MODEL'],
  pm25: ['초미세먼지', 'PM2.5', 'MODEL'],
  pm10: ['미세먼지', 'PM10', 'MODEL'],
  dust: ['먼지 질량', 'Dust mass', 'MODEL'],
  aqi: ['유럽 기준 대기질 지수', 'European AQI', 'MODEL'],
  uv: ['자외선 지수', 'UV index', 'MODEL'],
  ozone: ['오존', 'Ozone', 'MODEL'],
  sst: ['해수면 온도', 'Sea-surface temperature', 'MODEL'],
  sstanom: ['수온 편차', 'Sea-surface temperature anomaly', 'COMPUTED'],
  wave: ['유의파고', 'Significant wave height', 'MODEL'],
  swell: ['너울 높이', 'Swell height', 'MODEL'],
  current: ['표층 해류', 'Surface current', 'MODEL'],
};

const fmt = value => {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  return abs >= 100 ? String(Math.round(value)) : abs >= 10 ? value.toFixed(1) : value.toFixed(2);
};
const fmtStop = value => Number.isInteger(value) ? String(value) : fmt(value);
const timeText = value => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};
const inLonRange = (lon, west, east) => west <= east
  ? lon >= west && lon <= east : lon >= west || lon <= east;
const inRect = (place, rect) => !!rect
  && place.lat >= rect.south && place.lat <= rect.north
  && inLonRange(place.lon, rect.west, rect.east);
const coordinateKey = place => `${Math.round(place.lat * 2)},${Math.round(place.lon * 2)}`;

export const readability = {
  root: null,
  title: null,
  badge: null,
  legend: null,
  cities: null,
  point: null,
  pointName: null,
  pointValue: null,
  pointMeta: null,
  toggle: null,
  earthButton: null,
  pointClose: null,
  reference: null,
  activeLayer: null,
  grid: null,
  field: null,
  sourceName: null,
  gridLayer: null,
  mapLabels: null,
  contourMeta: null,

  init() {
    this.root = document.getElementById('readabilityPanel');
    if (!this.root) return this;
    this.title = document.getElementById('readabilityTitle');
    this.badge = document.getElementById('readabilityBadge');
    this.legend = document.getElementById('readabilityLegend');
    this.cities = document.getElementById('readabilityCities');
    this.point = document.getElementById('readabilityPoint');
    this.pointName = document.getElementById('readabilityPointName');
    this.pointValue = document.getElementById('readabilityPointValue');
    this.pointMeta = document.getElementById('readabilityPointMeta');
    this.toggle = document.getElementById('readabilityToggle');
    this.earthButton = document.getElementById('readabilityEarth');
    this.pointClose = document.getElementById('readabilityPointClose');

    this.toggle?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('earthus:read-mode', {
        detail: { on: !store.earthView.read },
      }));
    });
    this.earthButton?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
        detail: { view: 'earth', reason: 'readability-earth', resetLayers: true },
      }));
    });
    this.pointClose?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('earthus:earth-point-clear'));
    });

    store.on('earthView', state => this._state(state));
    store.on('scene', () => this._state(store.earthView));
    i18n.onChange(() => this._state(store.earthView));
    document.addEventListener('earthus:grid-ready', event => this._gridReady(event.detail));
    document.addEventListener('earthus:grid-removed', event => {
      if (this.acceptsLayer(event.detail?.layer)) this._clearGrid();
    });
    document.addEventListener('earthus:contours-ready', event => {
      if (!this.acceptsLayer(event.detail?.layer)) return;
      this.contourMeta = event.detail;
      this._renderLegend();
    });
    document.addEventListener('earthus:contours-removed', event => {
      if (!this.acceptsLayer(event.detail?.layer)) return;
      this.contourMeta = null;
      this._renderLegend();
    });
    document.addEventListener('earthus:earth-point', event => this._point(event.detail));
    document.addEventListener('earthus:earth-point-clear', () => this._clearPoint());
    onCameraIdle(() => this._refreshCities());
    this._state(store.earthView);
    return this;
  },

  _state(state) {
    const active = store.scene === 'earth' && GRID_LAYERS.has(state?.layer)
      && ['data', 'evidence', 'decision'].includes(state?.view);
    this.activeLayer = active ? state.layer : null;
    this.gridLayer = this.activeLayer === 'humidity' ? 'rh' : this.activeLayer;
    this.root.hidden = !active;
    document.body.classList.toggle('earth-data-view', active);
    document.body.classList.toggle('earth-read-mode', active && state.read === true);
    this.toggle?.setAttribute('aria-pressed', String(active && state.read === true));
    if (this.toggle) this.toggle.textContent = i18n.lang === 'ko'
      ? (state.read ? '판독 모드 끄기' : '판독 모드')
      : (state.read ? 'Exit read mode' : 'Read mode');
    if (this.earthButton) this.earthButton.textContent = i18n.lang === 'ko' ? '지구 보기' : 'Earth view';
    this.pointClose?.setAttribute('aria-label', i18n.lang === 'ko'
      ? '지점 근거 닫기' : 'Close point evidence');
    this.cities?.setAttribute('aria-label', i18n.lang === 'ko'
      ? '현재 화면의 도시 원격자값' : 'Nearest source grid-cell values for visible cities');
    if (!active) {
      this._clearGrid();
      this._clearPoint();
      this._setReference(false);
      coastlineReference.set(false);
      this._clearMapLabels();
      return;
    }
    const info = KIND[this.activeLayer] || [this.activeLayer, this.activeLayer, 'MODEL'];
    this.title.textContent = info[i18n.lang === 'ko' ? 0 : 1];
    this.badge.textContent = info[2];
    /* 받은 지적: 온도·수증기 같은 색면을 켜면 도시값은 보여도 어느 국가인지 읽기
       어려웠다. 경계/해안선/국가 지명 reference는 Data View 진입 즉시 올리고,
       판독 모드는 같은 reference의 대비를 더 높이는 단계로 유지한다. */
    this._setReference(true, state.read === true);
    coastlineReference.set(true, state.read === true);
    const rendered = gridOverlay.renderedOf(this.gridLayer);
    if (rendered) {
      this._gridReady({ layer: this.gridLayer, ...rendered });
      if (this.activeLayer === 'pressure') {
        import('./isobars.js').then(({ isobars }) => {
          if (this.activeLayer !== 'pressure') return;
          this.contourMeta = isobars.rendered();
          this._renderLegend();
        }).catch(() => {});
      } else {
        this.contourMeta = continuousContours.renderedOf(this.activeLayer);
        this._renderLegend();
      }
    }
    else this._loading();
  },

  _loading() {
    this.legend.innerHTML = `<p class="rd-loading">${i18n.lang === 'ko'
      ? '격자와 출처를 확인하는 중' : 'Checking grid and source'}</p>`;
    this.cities.replaceChildren();
  },

  _gridReady(detail) {
    if (!detail || detail.layer !== this.gridLayer) return;
    this.grid = detail.grid;
    this.field = detail.field;
    this.sourceName = detail.sourceName || null;
    this.contourMeta = null;
    this._renderLegend();
    this._refreshCities();
    if (store.earthView.point) this._point({ layer: this.activeLayer, point: store.earthView.point });
  },

  _clearGrid() {
    this.grid = null;
    this.field = null;
    this.sourceName = null;
    this.contourMeta = null;
    this.cities?.replaceChildren();
    this._clearMapLabels();
  },

  acceptsLayer(layer) {
    return layer === this.activeLayer || layer === this.gridLayer;
  },

  _renderLegend() {
    const scale = gridOverlay.scaleOf(this.activeLayer);
    if (!scale?.stops?.length || !this.grid) return this._loading();
    const stopList = document.createElement('ol');
    stopList.className = 'rd-scale';
    scale.stops.forEach(([value, color]) => {
      const item = document.createElement('li');
      const swatch = document.createElement('i');
      swatch.style.setProperty('--rd-color', `rgb(${color.join(',')})`);
      const label = document.createElement('span');
      label.textContent = `${fmtStop(value)}${scale.unit || ''}`;
      item.append(swatch, label); stopList.append(item);
    });
    const meta = document.createElement('p');
    meta.className = 'rd-grid-meta';
    const bounds = gridBounds(this.grid);
    const cells = Array.isArray(this.field) ? this.field.filter(Number.isFinite).length : 0;
    const cellText = Number.isFinite(this.grid.res)
      ? `${this.grid.res}° · n=${cells.toLocaleString()}` : `n=${cells.toLocaleString()}`;
    const time = timeText(this.grid.validAt || this.grid.time);
    const source = this.grid.attribution || this.grid.source || this.sourceName;
    const latitude = bounds && `${i18n.lang === 'ko' ? '위도' : 'lat'} `
      + `${fmt(bounds.south)}…${fmt(bounds.north)}°`;
    meta.textContent = [source, time, cellText, latitude]
      .filter(Boolean).join(' · ');
    const children = [stopList, meta];
    const contour = document.createElement('p');
    contour.className = 'rd-contour-meta';
    if (this.activeLayer === 'pressure') {
      const detail = this.contourMeta;
      contour.textContent = i18n.lang === 'ko'
        ? `등압선 4hPa · 동아시아 1° 전용 원격자 · 결측 칸 제외${detail ? ` · 선 ${detail.pathCount}` : ''}`
        : `Isobars 4 hPa · dedicated East Asia 1° grid · missing cells skipped${detail ? ` · ${detail.pathCount} paths` : ''}`;
    } else {
      contour.textContent = continuousContours.description(this.activeLayer) || '';
      if (this.contourMeta) contour.textContent += i18n.lang === 'ko'
        ? ` · 선 ${this.contourMeta.pathCount} · 라벨 ${this.contourMeta.labelCount}`
        : ` · ${this.contourMeta.pathCount} paths · ${this.contourMeta.labelCount} labels`;
    }
    if (contour.textContent) children.push(contour);
    /* Cesium의 기본 credit 영역은 이 앱에서 숨겨져 있다. imagery provider에만 credit을
       넣으면 화면에서는 출처가 사라지므로, 참조 타일을 켠 동안 패널에도 항상 적는다. */
    if (this.reference) {
      const credit = document.createElement('p');
      credit.className = 'rd-reference-credit';
      credit.textContent = i18n.lang === 'ko'
        ? `국가 경계·지명 · ${ESRI_CREDIT} · 흰색 해안선 · Natural Earth (public domain)`
        : `Country borders and places · ${ESRI_CREDIT} · white coastline · Natural Earth (public domain)`;
      children.push(credit);
    }
    this.legend.replaceChildren(...children);
  },

  _refreshCities() {
    if (!this.activeLayer || !this.grid || !Array.isArray(this.field)) return;
    const rect = viewRect();
    if (!rect) { this.cities.replaceChildren(); return; }
    const height = viewer.camera.positionCartographic?.height || 24_000_000;
    const max = height > 9_000_000 ? 7 : height > 2_500_000 ? 10 : 14;
    /* viewRectangle은 우주에서 지구 전부를 담을 때 반대편 도시도 포함할 수 있다.
       화면 좌표와 지평선 검사를 함께 통과하지 않은 도시는 '현재 화면' 숫자로 부르지 않는다. */
    const candidates = worldPlaces().filter(place => inRect(place, rect)).map(place => ({
      ...place,
      placement: this._screenPlacement(place),
    })).filter(place => place.placement);
    const canvas = viewer.scene.canvas;
    const centerX = canvas.clientWidth / 2, centerY = canvas.clientHeight / 2;
    candidates.sort((a, b) => {
      const da = Math.hypot(a.placement.screen.x - centerX, a.placement.screen.y - centerY);
      const db = Math.hypot(b.placement.screen.x - centerX, b.placement.screen.y - centerY);
      return da - db;
    });
    const seen = new Set();
    const chosen = [];
    for (const place of candidates) {
      const key = coordinateKey(place);
      if (seen.has(key)) continue;
      const value = nearestGridValue(this.grid, this.field, place.lat, place.lon);
      if (!Number.isFinite(value)) continue;
      seen.add(key); chosen.push({ ...place, value });
      if (chosen.length >= max) break;
    }
    const unit = gridOverlay.scaleOf(this.activeLayer)?.unit || '';
    this.cities.replaceChildren(...chosen.map(place => {
      const item = document.createElement('li');
      item.innerHTML = `<span>${i18n.lang === 'ko' ? place.ko : place.en}</span>`
        + `<b>${fmt(place.value)}${unit}</b>`;
      item.title = i18n.lang === 'ko' ? '가장 가까운 실제 격자점 값' : 'Nearest source grid-cell value';
      return item;
    }));
    this.cities.hidden = chosen.length === 0;
    this._refreshMapLabels(chosen, unit);
  },

  _screenPlacement(place) {
    if (!viewer?.scene?.canvas || !viewer?.camera?.positionWC) return null;
    const position = Cesium.Cartesian3.fromDegrees(place.lon, place.lat, 18_000);
    const surface = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
    const camera = Cesium.Cartesian3.normalize(viewer.camera.positionWC, new Cesium.Cartesian3());
    const cameraDistance = Cesium.Cartesian3.magnitude(viewer.camera.positionWC);
    const horizon = 6_378_137 / Math.max(6_378_137, cameraDistance);
    if (Cesium.Cartesian3.dot(surface, camera) <= horizon) return null;
    const screen = viewer.scene.cartesianToCanvasCoordinates(position);
    const canvas = viewer.scene.canvas;
    if (!screen || screen.x < 0 || screen.y < 0
      || screen.x > canvas.clientWidth || screen.y > canvas.clientHeight) return null;
    return { position, screen };
  },

  _refreshMapLabels(chosen, unit) {
    this._clearMapLabels();
    if (!chosen.length || !viewer?.scene?.primitives) return;
    const collection = new Cesium.LabelCollection();
    this.mapLabels = viewer.scene.primitives.add(collection);
    const occupied = [];
    chosen.forEach(place => {
      const placement = this._screenPlacement(place);
      if (!placement) return;
      const { position, screen } = placement;
      const text = `${i18n.lang === 'ko' ? place.ko : place.en} ${fmt(place.value)}${unit}`;
      const width = Math.max(74, text.length * 7.2), height = 24;
      const box = { left: screen.x - width / 2, right: screen.x + width / 2,
                    top: screen.y - height / 2, bottom: screen.y + height / 2 };
      if (occupied.some(other => !(box.right < other.left || box.left > other.right
        || box.bottom < other.top || box.top > other.bottom))) return;
      occupied.push(box);
      collection.add({
        position,
        text,
        font: '650 12px -apple-system, BlinkMacSystemFont, sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#020b11').withAlpha(0.82),
        backgroundPadding: new Cesium.Cartesian2(7, 4),
        pixelOffset: new Cesium.Cartesian2(0, -8),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: 0,
        id: { kind: 'readability-grid-label', layer: this.activeLayer,
              name: text, lat: place.lat, lon: place.lon, value: place.value },
      });
    });
    viewer.scene.requestRender?.();
  },

  _clearMapLabels() {
    if (!this.mapLabels || !viewer?.scene?.primitives) return;
    try { viewer.scene.primitives.remove(this.mapLabels); } catch (_) { }
    this.mapLabels = null;
    viewer.scene.requestRender?.();
  },

  async _point(detail) {
    if (!detail?.point || !this.acceptsLayer(detail.layer) || !this.grid || !this.field) return;
    const lat = Number(detail.point.lat), lon = Number(detail.point.lon);
    const value = Number.isFinite(detail.value)
      ? detail.value : nearestGridValue(this.grid, this.field, lat, lon);
    if (!Number.isFinite(value)) return this._clearPoint();
    const unit = gridOverlay.scaleOf(this.activeLayer)?.unit || '';
    const place = describePlace(lat, lon, i18n.lang === 'ko');
    this.pointName.textContent = `${place.text} · ${latLonText(lat, lon, i18n.lang === 'ko')}`;
    this.pointValue.textContent = `${fmt(value)}${unit}`;
    const source = this.grid.attribution || this.grid.source || this.sourceName || '—';
    const time = timeText(this.grid.validAt || this.grid.time);
    const cells = Number.isFinite(this.grid.res) ? `${this.grid.res}°` : null;
    this.pointMeta.textContent = [
      i18n.lang === 'ko' ? '가장 가까운 원격자값' : 'Nearest source grid-cell value',
      time,
      cells,
      source,
    ].filter(Boolean).join(' · ');
    this.point.hidden = false;
  },

  _clearPoint() {
    if (this.point) this.point.hidden = true;
  },

  _setReference(on, enhanced = false) {
    if (!viewer?.imageryLayers) return;
    if (on && !this.reference) {
      this.reference = viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: ESRI_REFERENCE,
          maximumLevel: 19,
          credit: ESRI_CREDIT,
        }),
      );
    } else if (!on && this.reference) {
      try { viewer.imageryLayers.remove(this.reference, true); } catch (_) { }
      this.reference = null;
    }
    if (this.reference) {
      this.reference.alpha = enhanced ? REFERENCE_ALPHA.read : REFERENCE_ALPHA.data;
      this.reference.brightness = enhanced ? 1.12 : 1.04;
      this.reference.contrast = enhanced ? 1.16 : 1.08;
    }
    viewer.scene.requestRender?.();
  },
};
