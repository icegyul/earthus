// 지구본 위 해구 탐험
//
// 받은 요청: "별도 페이지를 굳이 만들어 보여주면 안 돼. 최대한 지구본을 이용해서 보여줘."
// ⚠️ 두 번째 Cesium Viewer를 만들지 않는다. 기존 지구본·정적 primitive 두 묶음만 재사용한다.
// ⚠️ 해구의 지리적 면적 자료는 현재 카탈로그에 없다. 점 크기는 최심부 깊이이며 면적이 아니다.
// ⚠️ 생물은 문헌 깊이 범위가 겹치는 종일 뿐, 이 해구의 현재 관측으로 표현하지 않는다.

import { viewer, scene } from '../viewer.js';
import { store } from '../store.js';
import { i18n } from '../i18n.js';
import { power } from '../power.js';

const START_HEIGHT = 1_500_000;
const END_HEIGHT = 8_000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const depthText = item => item.depthMin === item.depthMax
  ? `${item.depthMin.toLocaleString()}m`
  : `${item.depthMin.toLocaleString()}–${item.depthMax.toLocaleString()}m`;

export const trenchGlobe = {
  data: null,
  species: null,
  points: null,
  labels: null,
  speciesLabels: null,
  selected: null,
  visible: false,
  _visualState: null,
  _speciesKey: '',

  init() {
    if (this.points || !viewer || !scene) return this;
    this.points = scene.primitives.add(new Cesium.PointPrimitiveCollection());
    this.labels = scene.primitives.add(new Cesium.LabelCollection());
    this.speciesLabels = scene.primitives.add(new Cesium.LabelCollection());
    this.points.show = this.labels.show = this.speciesLabels.show = false;
    store.on('scene', (next, stage) => this.setVisible(next === 'ocean', stage));
    i18n.onChange(() => { this.paint(); this.updateDepth(true); });
    scene.preRender.addEventListener(() => {
      if (this.visible && this.selected) this.updateDepth();
    });
    this.makeHud();
    return this;
  },

  async load() {
    if (this.data) return this.data;
    const response = await fetch('/data/trenches.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`TRENCHES_${response.status}`);
    this.data = await response.json();
    this.paint();
    return this.data;
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
    this.points.show = this.labels.show = !!on;
    this.speciesLabels.show = !!on && !!this.selected;
    document.body.classList.toggle('ocean-globe', !!on);
    this.setQuietGlobe(!!on);
    if (!on) {
      this.selected = null;
      this._speciesKey = '';
      this.speciesLabels.removeAll();
      this.hud?.classList.remove('on');
      scene.requestRender();
      return;
    }
    try {
      await this.load();
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
    if (!this.data || !this.points || !this.labels) return;
    this.points.removeAll();
    this.labels.removeAll();
    const ko = i18n.lang === 'ko';
    const maxDepth = Math.max(...this.data.items.map(item => item.depthMax));
    this.data.items.forEach(item => {
      const position = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 2200);
      const name = item.name[ko ? 'ko' : 'en'];
      this.points.add({
        id: { _trench: item, _pick: `${name} · ${depthText(item)}` },
        position,
        // 면적이 아니라 문헌 최심부 깊이. 전지구에서 깊이 차이를 한눈에 보는 부호다.
        pixelSize: 7 + item.depthMax / maxDepth * 11,
        color: Cesium.Color.fromCssColorString('#57d6e8').withAlpha(.72),
        outlineColor: Cesium.Color.fromCssColorString('#dffbff').withAlpha(.9),
        outlineWidth: 1.2,
        scaleByDistance: new Cesium.NearFarScalar(300_000, 1.3, 30_000_000, .72),
        // 지구 반대편 해구가 지구를 뚫고 보이면 위치를 잘못 읽는다. 항상 지구에 가린다.
        disableDepthTestDistance: 0,
      });
      this.labels.add({
        id: { _trench: item }, position,
        text: `${name}\n${depthText(item)}`,
        font: '500 11px system-ui,sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#dffbff'),
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('#031116').withAlpha(.76),
        pixelOffset: new Cesium.Cartesian2(0, -22),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        // 전지구에서 10개 이름을 다 켜면 태평양이 글자 덩어리가 된다. 위치·크기 점만 먼저 본다.
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
        disableDepthTestDistance: 0,
      });
    });
    scene.requestRender();
  },

  async focus(item) {
    if (!item) return;
    this.selected = item;
    this.speciesLabels.show = true;
    this._speciesKey = '';
    this.hud?.classList.add('on');
    this.renderHud(0);
    viewer.camera.flyTo({
      // 첫 진입은 약 1,000m 층이 보이는 높이. 이후 사용자가 더 확대할수록 더 깊어진다.
      destination: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 1_350_000),
      duration: 1.25,
      complete: () => this.updateDepth(true),
    });
    power.animate(1500, 0, 'trench-globe-focus');
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
    const active = (this.species || []).filter(item => item.depthKind === 'observation-depth'
      ? Math.abs(depth - item.depthMin) <= item.displayWindowM
      : depth >= item.depthMin && depth <= item.depthMax)
      .sort((a, b) => a.depthMin - b.depthMin || a.id.localeCompare(b.id)).slice(0, 4);
    const key = `${Math.round(depth / 50)}:${active.map(item => item.id).join(',')}:${i18n.lang}`;
    if (!force && key === this._speciesKey) return;
    this._speciesKey = key;
    this.speciesLabels.removeAll();
    const ko = i18n.lang === 'ko';
    const position = Cesium.Cartesian3.fromDegrees(this.selected.lon, this.selected.lat, 2600);
    active.forEach((item, index) => this.speciesLabels.add({
      id: { _pick: ko
        ? `${item.name.ko} · 문헌 깊이 범위 · 이 해구의 현재 관측 아님`
        : `${item.name.en} · literature depth range · not a live record here` },
      position,
      text: item.name[ko ? 'ko' : 'en'],
      font: '500 12px system-ui,sans-serif',
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString('#06232c').withAlpha(.88),
      pixelOffset: new Cesium.Cartesian2(42, 18 + index * 25),
      horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      disableDepthTestDistance: 0,
    }));
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
    this.hud.innerHTML = `<b>${name}</b><span>${depthText(this.selected)}</span>`
      + `<strong>${ko ? '확대 단계의 가상 수심' : 'Virtual depth from zoom'} ${depth.toLocaleString()}m</strong>`
      + `<small>${ko
        ? `문헌 깊이와 겹치는 생물 ${speciesCount}종 · 이 위치의 현재 관측 아님<br>점 크기는 최심부 깊이이며 해구 면적이 아닙니다 · ${this.selected.source}`
        : `${speciesCount} species overlap this literature depth · not a live record here<br>Point size encodes deepest depth, not trench area · ${this.selected.source}`}</small>`;
  },

  renderOverviewHud() {
    if (!this.hud || !this.data) return;
    const ko = i18n.lang === 'ko';
    this.hud.classList.add('on');
    this.hud.innerHTML = `<b>${ko ? '지구의 해구' : 'Earth trenches'}</b>`
      + `<span>${this.data.items.length}${ko ? '곳' : ' locations'}</span>`
      + `<small>${ko
        ? '점 크기 = 문헌 최심부 깊이 · 지리적 면적 아님<br>점을 누르고 확대하면 이름과 문헌 깊이 생물이 단계적으로 나타납니다.'
        : 'Point size = published deepest depth, not geographic area.<br>Tap and zoom to reveal names and literature-depth species.'}</small>`;
  },

  setQuietGlobe(on) {
    if (!viewer) return;
    if (on && !this._visualState) {
      this._visualState = {
        imagery: Array.from({ length: viewer.imageryLayers.length }, (_, index) => viewer.imageryLayers.get(index).show),
        dataSources: Array.from({ length: viewer.dataSources.length }, (_, index) => viewer.dataSources.get(index).show),
        lighting: scene.globe.enableLighting,
      };
    }
    if (on) {
      // Blue Marble 해저지형과 확대용 지표만 남긴다. 구름·도시불빛·분석 격자는 쉰다.
      for (let index = 0; index < viewer.imageryLayers.length; index++) {
        viewer.imageryLayers.get(index).show = index < 2;
      }
      for (let index = 0; index < viewer.dataSources.length; index++) viewer.dataSources.get(index).show = false;
      // 밤면이 검게 죽으면 해저지형을 읽을 수 없다. 해구 모드에서만 주야 조명을 잠시 뺀다.
      scene.globe.enableLighting = false;
    } else if (this._visualState) {
      this._visualState.imagery.forEach((show, index) => {
        if (index < viewer.imageryLayers.length) viewer.imageryLayers.get(index).show = show;
      });
      this._visualState.dataSources.forEach((show, index) => {
        if (index < viewer.dataSources.length) viewer.dataSources.get(index).show = show;
      });
      scene.globe.enableLighting = this._visualState.lighting;
      this._visualState = null;
    }
  },
};
