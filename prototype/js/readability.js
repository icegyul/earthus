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
import { gridBounds, nearestGridPoint, nearestGridValue } from './gridmath.js';
import { get as krGet, inKorea, nearest as nearestStation } from './korea.js';
import { worldPlaces, describePlace, latLonText } from './geoname.js';
import { i18n } from './i18n.js';
import { store } from './store.js';
import { coastlineReference } from './coastline-reference.js';
/* main과 정확히 같은 URL을 써야 ES module 인스턴스가 둘로 갈라지지 않는다. */
import { continuousContours } from './continuous-contours.js';

const ESRI_REFERENCE = 'https://services.arcgisonline.com/ArcGIS/rest/services/'
  + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
const ESRI_CREDIT = 'Esri, Garmin, HERE, © OpenStreetMap contributors, and the GIS user community';
/* 국가·해안선은 색면을 가리지 않는 범위에서 기본 표시하고, 사용자가 판독 모드를
   명시적으로 켰을 때만 더 강하게 보인다. 첫 Earth View에는 reference 자체가 없다. */
const REFERENCE_ALPHA = Object.freeze({ data: 0.78, read: 0.96 });
/* 좁은 화면에서 패널이 스스로 접히기까지의 시간. 처음 몇 초는 출처·시각을
   읽을 수 있어야 하고, 그 뒤로는 지도가 주인공이어야 한다. */
const LEAN_AFTER_MS = 7000;
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
/* 원격자점이 도시에서 이만큼 넘게 떨어져 있으면 그 도시의 값이라고 부르지 않는다.
   50km — 수도권 하나가 들어가는 거리다. 그 안쪽이면 같은 날씨라고 봐도 된다. */
const FAR_KM = 50;
const isFar = point => Number.isFinite(point?.km) && point.km > FAR_KM;

/* ── 한국은 격자 대신 실측을 쓴다 ───────────────────────────────
   5° 전지구 격자에서 서울의 가장 가까운 격자점은 40°N·125°E — 321km 떨어진 서해
   북부다. 2026-09-08 07시 그 점의 습도는 82%, 같은 시각 서울 관측은 76%였다.
   물결표를 달아 "먼 점의 값"이라고 밝히긴 했지만, 밝힌다고 맞는 값이 되지는 않는다.
   ⚠️ 우리는 기상청 AWS 736지점을 이미 10분마다 받고 있다(korea.js `aws`).
      실측이 있는데 남의 격자값을 도시 이름 옆에 놓을 이유가 없다.
      보간하거나 지어내지 않는다 — **가까운 실제 관측소의 실제 값**만 쓴다.
   ⚠️ 단위가 격자와 같은 것만 넣는다. 다르면 조용히 틀린 숫자가 된다.
        습도 %      ← hm     기온 °C   ← ta
        풍속 m/s    ← ws10 (10분 평균)  해면기압 hPa ← ps            */
const OBS_FIELD = { humidity: 'hm', temp: 'ta', wind: 'ws10', pressure: 'ps' };
/* 관측소가 이보다 멀면 실측이라 부르지 않는다 — 그때는 격자값 + 물결표로 돌아간다. */
const OBS_MAX_KM = 25;
const pointNote = (place, unit) => {
  if (place.obs) {
    const km = Math.round(place.obs.km);
    return i18n.lang === 'ko'
      ? `기상청 실측 — ${place.obs.name || place.obs.id} 관측소 ${fmt(place.value)}${unit} · `
        + `${place.ko}에서 ${km}km · 격자값이 아닙니다`
      : `Observed by KMA — station ${place.obs.name || place.obs.id}, ${km} km from ${place.en}`
        + '; not a model grid value';
  }
  const point = place.point;
  if (!point) return i18n.lang === 'ko' ? '가장 가까운 실제 격자점 값' : 'Nearest source grid-cell value';
  const where = `${fmt(Math.abs(point.lat))}°${point.lat >= 0 ? 'N' : 'S'} `
    + `${fmt(Math.abs(point.lon))}°${point.lon >= 0 ? 'E' : 'W'}`;
  const km = Math.round(point.km);
  return i18n.lang === 'ko'
    ? `가장 가까운 원격자점(${where})의 값 ${fmt(place.value)}${unit} · `
      + `${place.ko}에서 ${km}km 떨어져 있습니다${isFar(point) ? ' — 그 도시의 관측값이 아닙니다' : ''}`
    : `Value at the nearest source grid point (${where}) — ${km} km from ${place.en}`
      + `${isFar(point) ? '; not an observation for that city' : ''}`;
};
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
  detailsButton: null,
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
    this.detailsButton = document.getElementById('readabilityDetails');

    /* ⚠️ 사용자가 직접 편 뒤에는 다시 접지 않는다. 읽으려고 편 것을 도로 접으면
       "화면이 제멋대로 움직인다"가 된다. 접는 것은 처음 한 번뿐이다. */
    this.detailsButton?.addEventListener('click', () => {
      clearTimeout(this._leanTimer);
      this._leanTimer = null;
      this._setLean(!this.root.classList.contains('rd-lean'), true);
    });

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

    /* ⚠️ 하단에 겹쳐 있는 것들(레이어 칩)이 이 패널을 피하려면 **실제 키**를 알아야 한다.
       접힘·펼침·언어·눈금 단계 수에 따라 71px↔300px 로 변하므로 상수로는 못 맞춘다. */
    try {
      new ResizeObserver(() => {
        const h = this.root.hidden ? 0 : Math.round(this.root.getBoundingClientRect().height);
        document.body.style.setProperty('--rd-panel-h', `${h}px`);
      }).observe(this.root);
    } catch (_) { }

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
    if (!active) document.body.style.setProperty('--rd-panel-h', '0px');
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
      clearTimeout(this._leanTimer); this._leanTimer = null;
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
    /* ⚠️ **레이어가 바뀔 때만** 다시 펴고 다시 센다. store 이벤트마다 부르면
       (카메라·줌·시간 변경도 여기로 온다) 패널이 몇 초마다 폈다 접혔다 한다. */
    if (this.activeLayer !== this._leanLayer) {
      this._leanLayer = this.activeLayer;
      this._scheduleLean();
    }
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

  /* ── 좁은 화면에서 스스로 접기 ───────────────────────────────────────
     ⚠️ 이 패널은 세로로 여덟 줄이다(제목·배지·단추 둘·색 눈금·출처·주의문 둘·크레딧).
        폰에서는 그것만으로 화면의 3분의 1을 먹었다(2026-09-08 실측 화면).
        윈디는 같은 정보를 위쪽에 한 줄로 띄우고 잠시 뒤 지운다.
     → 레이어를 켠 뒤 LEAN_AFTER_MS 동안은 다 보여 주고(처음 볼 때는 출처·시각이
       중요하다), 그 뒤 **제목 + 눈금**만 남긴다. "정보" 단추로 다시 편다.
     ⚠️ 눈금은 접어도 남긴다 — 색을 못 읽으면 지도 자체가 못 읽힌다.
     ⚠️ 넓은 화면에서는 접지 않는다. 자리가 있는데 감추면 정보만 잃는다. */
  _leanTimer: null,

  _isNarrow() {
    return window.matchMedia?.('(max-width: 820px)').matches === true;
  },

  _setLean(on, byUser = false) {
    if (!this.root) return;
    this.root.classList.toggle('rd-lean', on);
    if (this.detailsButton) {
      this.detailsButton.setAttribute('aria-expanded', String(!on));
      const ko = i18n.lang === 'ko';
      this.detailsButton.textContent = on ? (ko ? '정보' : 'Info') : (ko ? '접기' : 'Less');
    }
    if (byUser) this._leanByUser = true;
  },

  /** 레이어가 새로 켜졌을 때만 부른다 — 자료가 바뀌면 출처를 다시 보여 준다. */
  _scheduleLean() {
    clearTimeout(this._leanTimer);
    this._leanTimer = null;
    this._leanByUser = false;
    if (!this._isNarrow()) { this._setLean(false); return; }
    this._setLean(false);
    this._leanTimer = setTimeout(() => {
      this._leanTimer = null;
      if (!this._leanByUser) this._setLean(true);
    }, LEAN_AFTER_MS);
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
    /* ⚠️ 격자가 성기면 도시 이름 옆 숫자는 그 도시의 값이 아니다. 범례에서 한 번
       말해 둔다 — 툴팁만으로는 마우스를 올린 사람만 알게 된다. */
    if (Number.isFinite(this.grid.res) && this.grid.res * 111 > FAR_KM * 2) {
      const approx = document.createElement('p');
      approx.className = 'rd-contour-meta';
      approx.textContent = i18n.lang === 'ko'
        ? `~ 표시 = 그 도시에서 ${FAR_KM}km 넘게 떨어진 격자점 값 · 도시 관측값이 아님`
        : `~ marks a grid point more than ${FAR_KM} km from that city — not a city observation`;
      children.push(approx);
      /* 한국 도시는 격자가 아니라 실측을 쓴다 — 물결표가 없는 이유를 밝힌다. */
      if (OBS_FIELD[this.activeLayer]) {
        const obsNote = document.createElement('p');
        obsNote.className = 'rd-contour-meta';
        obsNote.textContent = i18n.lang === 'ko'
          ? `물결표 없는 한국 도시 = 기상청 AWS 실측(${OBS_MAX_KM}km 이내 관측소) · 격자값 아님`
          : `Korean cities without ~ use KMA station observations within ${OBS_MAX_KM} km — not grid values`;
        children.push(obsNote);
      }
    }
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
      /* ⚠️⚠️ 도시 이름을 붙였다고 **그 도시의 값이 되는 게 아니다.**
         5° 전지구 격자에서 서울의 가장 가까운 격자점은 40°N·125°E — 300km 떨어진
         서해 북부다. 그 값 87% 가 "서울 87%" 로 나갔고, 같은 시각 서울 관측은 57% 였다.
         숫자를 지어내지도, 보간해서 도시값인 척하지도 않는다 — 대신 **얼마나 떨어진
         점인지 화면에 밝힌다.** 멀면 물결표를 달고, 정확한 격자점은 툴팁에 적는다. */
      const point = nearestGridPoint(this.grid, place.lat, place.lon);
      /* 한국은 실측이 있다 — 있으면 그것이 그 도시의 값이다(위 OBS_FIELD 주석). */
      const obs = this._observationFor(place);
      seen.add(key);
      chosen.push(obs ? { ...place, value: obs.value, point, obs } : { ...place, value, point });
      if (chosen.length >= max) break;
    }
    const unit = gridOverlay.scaleOf(this.activeLayer)?.unit || '';
    this.cities.replaceChildren(...chosen.map(place => {
      const item = document.createElement('li');
      /* 실측에는 물결표를 달지 않는다 — 물결표는 "그 도시 값이 아니다"라는 뜻이다. */
      const far = !place.obs && isFar(place.point);
      item.innerHTML = `<span>${i18n.lang === 'ko' ? place.ko : place.en}</span>`
        + `<b>${far ? '~' : ''}${fmt(place.value)}${unit}</b>`;
      item.title = pointNote(place, unit);
      if (far) item.dataset.far = '1';
      if (place.obs) item.dataset.obs = '1';
      return item;
    }));
    this.cities.hidden = chosen.length === 0;
    this._refreshMapLabels(chosen, unit);
  },

  /** 이 도시에 쓸 실측값 — 없으면 null(그때는 격자값 + 물결표로 돌아간다). */
  _observationFor(place) {
    const field = OBS_FIELD[this.activeLayer];
    if (!field || !inKorea(place.lat, place.lon)) return null;
    this._ensureObservations();
    const list = this._obs?.stations;
    if (!Array.isArray(list)) return null;
    const st = nearestStation(list, place.lat, place.lon, OBS_MAX_KM);
    const value = st?.[field];
    return Number.isFinite(value) ? { value, km: st.km, name: st.name, id: st.id } : null;
  },

  /* 화면에 한국 도시가 처음 들어왔을 때만 받는다. korea.js 가 5분 캐시를 쥐고 있어
     레이어를 오가도 다시 받지 않는다. 도착하면 한 번 더 그린다 — 그 전까지는
     격자값 + 물결표가 그대로 보인다(빈 화면을 만들지 않는다). */
  _ensureObservations() {
    if (this._obs || this._obsPending) return;
    this._obsPending = true;
    krGet('aws').then(data => {
      this._obs = data;
      this._refreshCities();
    }).catch(e => console.warn('[실측 도시값]', e.message))
      .finally(() => { this._obsPending = false; });
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
      const text = `${i18n.lang === 'ko' ? place.ko : place.en} `
        + `${isFar(place.point) ? '~' : ''}${fmt(place.value)}${unit}`;
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
      /* ⚠️ 색면이 켜지면 gridOverlay 가 그 **아래 판들을 눌러 어둡게** 만든다.
         해안선·국경은 눌리면 안 된다 — 어두운 바탕 위의 어두운 선은 사라진다.
         (윈디가 색면 위에 얇은 해안선만 남기는 것과 같은 이유다.)
         그래서 이 판에 표를 붙여 둔다. gridOverlay 가 이 표를 보고 건너뛴다. */
      this.reference.__earthusKeepBright = true;
      this.reference.alpha = enhanced ? REFERENCE_ALPHA.read : REFERENCE_ALPHA.data;
      this.reference.brightness = enhanced ? 1.12 : 1.04;
      this.reference.contrast = enhanced ? 1.16 : 1.08;
    }
    viewer.scene.requestRender?.();
  },
};
