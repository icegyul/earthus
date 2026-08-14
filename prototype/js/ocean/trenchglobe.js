// 지구본 위 해구 탐험
//
// 받은 요청: "별도 페이지를 굳이 만들어 보여주면 안 돼. 최대한 지구본을 이용해서 보여줘."
// ⚠️ 두 번째 Cesium Viewer를 만들지 않는다. 기존 지구본과 정적 primitive만 재사용한다.
// ⚠️ 점을 해구 면적으로 속이지 않는다. GEBCO 2026 격자에서 NOAA 하달대 기준인
//    6,000m보다 깊고 최심점과 연결된 셀만 채운다. 공식 해구 경계·전체 면적은 아니다.
// ⚠️ 생물은 문헌 최대·관측 수심 표식일 뿐, 이 해구의 현재 관측으로 표현하지 않는다.

import { viewer, scene } from '../viewer.js';
import { store } from '../store.js';
import { i18n } from '../i18n.js';
import { power } from '../power.js';

const START_HEIGHT = 1_500_000;
const END_HEIGHT = 8_000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const LIFE_LABEL_OFFSETS = [
  new Cesium.Cartesian2(-92, -82),
  new Cesium.Cartesian2(72, 58),
];
const depthText = item => item.depthMin === item.depthMax
  ? `${item.depthMin.toLocaleString()}m`
  : `${item.depthMin.toLocaleString()}–${item.depthMax.toLocaleString()}m`;
const lifeMarkerDepth = item => item.depthMax;
const lifeMarkerWindow = item => item.depthKind === 'observation-depth'
  ? Math.max(45, item.displayWindowM || 75)
  : clamp(Math.round(item.depthMax * .07), 35, 120);
const pointInRing = (lon, lat, ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index]; const [px, py] = ring[previous];
    if ((y > lat) !== (py > lat) && lon < (px - x) * (lat - y) / (py - y) + x) inside = !inside;
  }
  return inside;
};

export const trenchGlobe = {
  data: null,
  footprints: null,
  species: null,
  bathymetryLayer: null,
  areas: null,
  outlines: null,
  labels: null,
  speciesLabels: null,
  selected: null,
  selectedFootprint: null,
  visible: false,
  _speciesKey: '',
  _autoFocusAt: 0,

  init() {
    if (this.labels || !viewer || !scene) return this;
    this.outlines = scene.primitives.add(new Cesium.PolylineCollection());
    this.labels = scene.primitives.add(new Cesium.LabelCollection());
    this.speciesLabels = scene.primitives.add(new Cesium.LabelCollection());
    this.outlines.show = this.labels.show = this.speciesLabels.show = false;
    viewer.imageryLayers.layerAdded.addEventListener(layer => {
      if (!this.visible) return;
      // 기존 지구의 레이어는 그대로 둔다. 해저지형은 선택한 해구를 가까이 볼 때만
      // 가장 위에 반투명으로 겹치며, 새로 들어온 지구 레이어를 숨기지 않는다.
      queueMicrotask(() => {
        if (!this.visible) return;
        if (this.selected && this.bathymetryLayer) viewer.imageryLayers.raiseToTop(this.bathymetryLayer);
        scene.requestRender();
      });
    });
    store.on('scene', (next, stage) => this.setVisible(next === 'earth' && stage === 'trench', stage));
    i18n.onChange(() => { this.paint(); this.updateDepth(true); });
    scene.preRender.addEventListener(() => {
      if (this.visible && this.selected) this.updateDepth();
      else if (this.visible) this.focusFromZoom();
    });
    this.makeHud();
    return this;
  },

  async load() {
    if (this.data) return this.data;
    const [catalogResponse, footprintsResponse] = await Promise.all([
      fetch('/data/trenches.json', { cache: 'no-cache' }),
      fetch('/data/trench-footprints.json', { cache: 'no-cache' }),
    ]);
    if (!catalogResponse.ok) throw new Error(`TRENCHES_${catalogResponse.status}`);
    if (!footprintsResponse.ok) throw new Error(`TRENCH_FOOTPRINTS_${footprintsResponse.status}`);
    this.data = await catalogResponse.json();
    this.footprints = await footprintsResponse.json();
    this.ensureBathymetry();
    this.paint();
    return this.data;
  },

  ensureBathymetry() {
    if (this.bathymetryLayer || !this.footprints?.basemap?.path) return;
    const provider = new Cesium.SingleTileImageryProvider({
      url: `/${this.footprints.basemap.path}`,
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      credit: this.footprints.source.credit,
    });
    this.bathymetryLayer = viewer.imageryLayers.addImageryProvider(provider);
    this.bathymetryLayer.alpha = .42;
    // 전지구 개요에서는 원래 지구 표면과 해구 면적만 보인다. 해구를 고른 뒤에만
    // 해저지형을 반투명 레이어로 올려 별도의 수심 지구처럼 보이지 않게 한다.
    this.bathymetryLayer.show = false;
    viewer.imageryLayers.raiseToTop(this.bathymetryLayer);
    power.animate(1100, 0, 'trench-bathymetry-load');
  },

  async loadSpecies() {
    if (this.species) return this.species;
    const response = await fetch('/data/sea-life.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`SEA_LIFE_${response.status}`);
    const document = await response.json();
    this.species = document.items || [];
    return this.species;
  },

  async setVisible(on, stage = 'trench') {
    this.init();
    this.visible = !!on;
    if (this.areas) this.areas.show = !!on;
    this.outlines.show = this.labels.show = !!on;
    this.speciesLabels.show = !!on && !!this.selected;
    if (!on) {
      this.selected = null;
      this.selectedFootprint = null;
      this._speciesKey = '';
      this.speciesLabels.removeAll();
      if (this.bathymetryLayer) this.bathymetryLayer.show = false;
      this.hud?.classList.remove('on');
      scene.requestRender();
      return;
    }
    try {
      await this.load();
      if (this.bathymetryLayer) this.bathymetryLayer.show = false;
      this.renderOverviewHud();
      if (stage === 'trench' && viewer.camera.positionCartographic.height > 18_000_000) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(145, -8, 17_000_000),
          duration: 1.1,
        });
        power.animate(1300, 0, 'trench-globe-enter');
      }
    } catch (error) {
      console.warn('[trench-globe]', error.message);
    }
    scene.requestRender();
  },

  paint() {
    if (!this.data || !this.footprints || !this.outlines || !this.labels) return;
    if (this.areas) scene.primitives.remove(this.areas);
    this.areas = null; this.outlines.removeAll();
    this.labels.removeAll();
    const ko = i18n.lang === 'ko';
    const instances = [];
    this.footprints.features.forEach(feature => {
      const item = this.data.items.find(candidate => candidate.id === feature.representativeId);
      if (!item || feature.ring.length < 4) return;
      const name = feature.name[ko ? 'ko' : 'en'];
      const positions = Cesium.Cartesian3.fromDegreesArray(feature.ring.flat());
      instances.push(new Cesium.GeometryInstance({
        id: { _trench: item, _footprint: feature, _pick: `${name} · ${feature.areaKm2.toLocaleString()} km²` },
        geometry: new Cesium.PolygonGeometry({
          polygonHierarchy: new Cesium.PolygonHierarchy(positions),
          height: 2200,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.fromCssColorString('#36cfe6').withAlpha(.24)),
        },
      }));
      this.outlines.add({
        id: { _trench: item, _footprint: feature, _pick: `${name} · ${feature.areaKm2.toLocaleString()} km²` },
        positions,
        width: 1.6,
        material: Cesium.Material.fromType('Color', {
          color: Cesium.Color.fromCssColorString('#75eff8').withAlpha(.78),
        }),
      });
      const position = Cesium.Cartesian3.fromDegrees(feature.label[0], feature.label[1], 2800);
      this.labels.add({
        id: { _trench: item, _footprint: feature }, position,
        text: `${name}\n6,000m+ · ${feature.areaKm2.toLocaleString()} km²`,
        font: '500 11px system-ui,sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#dffbff'),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#031116').withAlpha(.76),
        pixelOffset: new Cesium.Cartesian2(0, -22),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        // 전지구에서는 채워진 실제 격자 윤곽만 보고, 가까워졌을 때 이름·면적을 읽는다.
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 10_000_000),
        disableDepthTestDistance: 0,
      });
    });
    this.areas = scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true, closed: false }),
      asynchronous: false,
    }));
    this.areas.show = this.visible;
    scene.requestRender();
  },

  footprintFor(item) {
    return this.footprints?.features.find(feature => feature.deepIds.includes(item.id)) || null;
  },

  focusFromZoom() {
    const now = performance.now();
    if (!this.footprints || now - this._autoFocusAt < 350) return;
    this._autoFocusAt = now;
    const camera = viewer.camera.positionCartographic;
    if (camera.height > 900_000 || camera.height < END_HEIGHT) return;
    const lat = Cesium.Math.toDegrees(camera.latitude);
    const lon = Cesium.Math.toDegrees(camera.longitude);
    const feature = this.footprints.features.find(candidate => pointInRing(lon, lat, candidate.ring));
    if (!feature) return;
    const item = this.data.items.find(candidate => candidate.id === feature.representativeId);
    if (item) this.focus(item, { fly: false });
  },

  async focus(item, { fly = true } = {}) {
    if (!item) return;
    this.selected = item;
    this.selectedFootprint = this.footprintFor(item);
    if (this.bathymetryLayer) {
      this.bathymetryLayer.show = true;
      viewer.imageryLayers.raiseToTop(this.bathymetryLayer);
    }
    this.speciesLabels.show = true;
    this._speciesKey = '';
    this.hud?.classList.add('on');
    this.renderHud(0);
    if (fly) {
      viewer.camera.flyTo({
        // 첫 진입은 햇빛층 끝자락부터 읽힌다. 이후 더 확대할수록 어스름층·심해로 내려간다.
        destination: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 650_000),
        duration: 1.25,
        complete: () => this.updateDepth(true),
      });
      power.animate(1500, 0, 'trench-globe-focus');
    }
    try { await this.loadSpecies(); } catch (error) {
      console.warn('[trench-species]', error.message);
      this.species = [];
    }
    this.updateDepth(true);
  },

  async openAt(lat, lon) {
    await this.load();
    const item = this.data.items.reduce((best, candidate) => {
      const distance = Math.hypot(candidate.lat - lat, candidate.lon - lon);
      return !best || distance < best.distance ? { item: candidate, distance } : best;
    }, null)?.item;
    if (item) await this.focus(item);
  },

  updateDepth(force = false) {
    if (!this.selected || !this.speciesLabels) return;
    const height = viewer.camera.positionCartographic.height;
    /* 휠 한 번에 카메라 높이는 수백 km씩 바뀐다. 선형 매핑이면 1,000m에서 곧장
       10,000m로 떨어지므로 로그 높이를 다시 완만하게 눌러 얕은 층을 차례로 거친다. */
    const rawProgress = clamp(
      Math.log(START_HEIGHT / Math.max(END_HEIGHT, height)) / Math.log(START_HEIGHT / END_HEIGHT), 0, 1);
    const progress = rawProgress ** 2.4;
    const depth = Math.round(progress * this.selected.depthMax);
    /* 범위의 시작부터 끝까지 종을 계속 켜면 수면에서 물범·거북이 한꺼번에 쌓인다.
       문헌 범위 종은 최대 수심 부근, 단일 관측 자료는 그 관측 수심 부근에서만
       표식으로 만난다. 이 값은 출현 좌표가 아니라 자료에 적힌 깊이 안내다. */
    const active = (this.species || [])
      .map(item => ({ item, distance: Math.abs(depth - lifeMarkerDepth(item)) }))
      .filter(({ item, distance }) => depth > 0 && distance <= lifeMarkerWindow(item))
      .sort((a, b) => a.distance - b.distance
        || lifeMarkerDepth(a.item) - lifeMarkerDepth(b.item)
        || a.item.id.localeCompare(b.item.id))
      .slice(0, LIFE_LABEL_OFFSETS.length)
      .map(candidate => candidate.item);
    const key = `${Math.round(depth / 50)}:${active.map(item => item.id).join(',')}:${i18n.lang}`;
    if (!force && key === this._speciesKey) return;
    this._speciesKey = key;
    this.speciesLabels.removeAll();
    const ko = i18n.lang === 'ko';
    const position = Cesium.Cartesian3.fromDegrees(this.selected.lon, this.selected.lat, 2600);
    active.forEach((item, index) => {
      const observed = item.depthKind === 'observation-depth';
      const markerDepth = lifeMarkerDepth(item);
      const depthLabel = ko
        ? `${observed ? '관측' : '최대'} ${markerDepth.toLocaleString()}m`
        : `${observed ? 'observed' : 'maximum'} ${markerDepth.toLocaleString()}m`;
      const offset = LIFE_LABEL_OFFSETS[index];
      this.speciesLabels.add({
        id: { _pick: ko
          ? `${item.name.ko} · 문헌 ${depthLabel}`
          : `${item.name.en} · literature ${depthLabel}` },
        position,
        text: `${item.name[ko ? 'ko' : 'en']}\n${depthLabel}`,
        font: '500 11px system-ui,sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#06232c').withAlpha(.88),
        pixelOffset: offset,
        horizontalOrigin: offset.x < 0 ? Cesium.HorizontalOrigin.RIGHT : Cesium.HorizontalOrigin.LEFT,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: 0,
      });
    });
    this.renderHud(depth, active.length);
    scene.requestRender();
  },

  makeHud() {
    if (this.hud) return;
    this.hud = document.createElement('aside');
    this.hud.id = 'trenchGlobeHud';
    this.hud.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.hud);
  },

  renderHud(depth, speciesCount = 0) {
    if (!this.hud || !this.selected) return;
    const ko = i18n.lang === 'ko';
    const name = this.selected.name[ko ? 'ko' : 'en'];
    const footprint = this.selectedFootprint;
    const area = footprint
      ? `${ko ? '6,000m 이상 연결 영역' : 'Connected area at 6,000m+'} · ${footprint.areaKm2.toLocaleString()} km²`
      : (ko ? '6,000m 이상 연결 영역 없음' : 'No connected area at 6,000m+');
    this.hud.innerHTML = `<b>${name}</b><span>${depthText(this.selected)}</span>`
      + `<span>${area}</span>`
      + `<strong>${ko ? '확대 단계의 가상 수심' : 'Virtual depth from zoom'} ${depth.toLocaleString()}m</strong>`
      + `<small>${ko
        ? `현재 수심 부근 문헌 최대·관측 수심 표식 ${speciesCount}종<br>${this.footprints.limitations.ko}<br>${this.selected.source}`
        : `${speciesCount} literature maximum/observed-depth markers near this depth<br>${this.footprints.limitations.en}<br>${this.selected.source}`}</small>`;
  },

  renderOverviewHud() {
    if (!this.hud || !this.data) return;
    const ko = i18n.lang === 'ko';
    const totalArea = this.footprints.features.reduce((sum, feature) => sum + feature.areaKm2, 0);
    this.hud.classList.add('on');
    this.hud.innerHTML = `<b>${ko ? '지구의 깊은 해구 영역' : 'Earth’s deep trench regions'}</b>`
      + `<span>${this.footprints.features.length}${ko ? '개 연결 영역' : ' connected regions'} · ${totalArea.toLocaleString()} km²</span>`
      + `<small>${ko
        ? '자료 · GEBCO 2026 약 11km 격자 · 6,000m 이상 연결 영역<br>확대하면 문헌 최대·관측 수심 표식 표시'
        : 'Data · GEBCO 2026 ~11 km grid · connected regions deeper than 6,000 m<br>Zoom for literature maximum and observed-depth markers'}</small>`;
  },

};
