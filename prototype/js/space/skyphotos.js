// 허블·제임스웹 공식 사진 천구 마커
//
// ⚠️ 사진은 카탈로그의 credit·license·공식 원본 링크가 모두 있을 때만 그린다.
// ⚠️ ICRF 변환은 카메라가 멈췄을 때만 갱신한다. 매 프레임 변환 금지.

import { viewer } from '../viewer.js';
import { radecToIcrf, icrfToFixedPosition, preloadIcrf } from './skyframe.js';

const SHOW_ABOVE_M = 45_000_000;

export const skyPhotos = {
  ds: null,
  items: [],
  loaded: false,

  init() {
    this.ds = new Cesium.CustomDataSource('sky-photos');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    const debug = new URLSearchParams(location.search).get('skyphotos');
    this._debug = debug;
    if (['hst', 'jwst'].includes(debug)) {
      // B1·B2 진단 모드. 일반 방문에는 로드하지 않고, 명시 쿼리에서만 상세까지 연다.
      queueMicrotask(async () => {
        try {
          await this.load();
          const { store } = await import('../store.js');
          // 진단 쿼리는 실제 탭 입력이 없으므로 첫 화면 줌 연출을 명시적으로 멈춘다.
          // 연출의 zoomIn과 아래 카메라 이동이 겹치면 위치가 폭증한다.
          document.dispatchEvent(new Event('pointerdown'));
          // setLayer -> registry.onToggle -> focusOut 순서로 한 번만 이동한다.
          // 같은 flyTo를 겹치면 Cesium 카메라 보간값이 비정상적으로 커질 수 있다.
          store.setLayer(debug, true);
          const telescope = debug === 'hst' ? 'HST' : 'JWST';
          const entity = this.ds.entities.values.find(e => e._meta?._photo?.telescope === telescope);
          if (!entity) return;
          setTimeout(() => store.select(entity._meta), 1700);
        } catch (error) {
          console.warn('[skyphotos] 진단 로드:', error.message);
        }
      });
    }
    return this;
  },

  async load() {
    if (this.loaded) return this.items;
    const response = await fetch('data/space-photos.json', { cache: 'force-cache' });
    if (!response.ok) throw new Error(`space-photos ${response.status}`);
    const doc = await response.json();
    this.items = Array.isArray(doc.items) ? doc.items : [];
    const date = Cesium.JulianDate.now();
    await preloadIcrf(date);
    this._build(date);
    this.loaded = true;
    return this.items;
  },

  _build(date) {
    this.ds.entities.removeAll();
    this.items.forEach(photo => {
      const fixed = icrfToFixedPosition(radecToIcrf(photo.ra, photo.dec), date);
      if (!fixed.position) return;
      this.ds.entities.add({
        id: `skyphoto:${photo.id}`,
        position: fixed.position,
        _meta: { id: photo.id, name: photo.name.ko, kind: 'skyphoto', _photo: photo },
        billboard: {
          image: photo.thumb,
          width: 64,
          height: 64,
          color: Cesium.Color.WHITE,
          /* 천구 반지름에서는 Cesium 깊이 버퍼가 마커를 삼킨다.
             반대편 투시는 아래 _applyVisibility의 반구 판정으로 별도 차단한다. */
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(SHOW_ABOVE_M, Number.POSITIVE_INFINITY),
          scaleByDistance: new Cesium.NearFarScalar(SHOW_ABOVE_M, 1.15, 2_000_000_000, 0.72),
        },
        label: {
          text: photo.name.ko,
          font: '400 11px -apple-system, sans-serif',
          fillColor: Cesium.Color.WHITE.withAlpha(0.9),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -43),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(SHOW_ABOVE_M, Number.POSITIVE_INFINITY),
        },
      });
    });
    this.set();
    if (this._focusPending) this.focusOut();
  },

  updateFrame() {
    if (!this.loaded || !this.ds?.show) return;
    const date = Cesium.JulianDate.now();
    this.ds.entities.values.forEach(entity => {
      const photo = entity._meta?._photo;
      if (!photo) return;
      const fixed = icrfToFixedPosition(radecToIcrf(photo.ra, photo.dec), date);
      if (fixed.position) entity.position = fixed.position;
    });
    this._applyVisibility();
    viewer.scene.requestRender();
  },

  set() {
    if (!this.ds) return;
    const hst = this._hst ?? false;
    const jwst = this._jwst ?? false;
    this.ds.show = hst || jwst;
    this._applyVisibility();
  },

  _applyVisibility() {
    if (!this.ds) return;
    const cameraUnit = Cesium.Cartesian3.normalize(viewer.camera.position, new Cesium.Cartesian3());
    this.ds.entities.values.forEach(entity => {
      const telescope = entity._meta?._photo?.telescope;
      const enabled = telescope === 'HST' ? !!this._hst : telescope === 'JWST' ? !!this._jwst : false;
      const position = entity.position?.getValue?.(Cesium.JulianDate.now());
      if (!enabled || !position) { entity.show = false; return; }
      const markerUnit = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
      entity.show = Cesium.Cartesian3.dot(cameraUnit, markerUnit) > 0;
    });
    this._reportDiagnostic();
  },

  _reportDiagnostic() {
    if (!['hst', 'jwst'].includes(this._debug) || !this.ds) return;
    const telescope = this._debug === 'hst' ? 'HST' : 'JWST';
    const entity = this.ds.entities.values.find(e => e._meta?._photo?.telescope === telescope);
    if (!entity) return;
    const position = entity.position?.getValue?.(Cesium.JulianDate.now());
    if (!position) return;
    const distanceKm = Cesium.Cartesian3.distance(viewer.camera.position, position) / 1000;
    const cameraKm = Cesium.Cartesian3.magnitude(viewer.camera.position) / 1000;
    const markerKm = Cesium.Cartesian3.magnitude(position) / 1000;
    let out = document.getElementById('skyphotosDiagnostic');
    if (!out) {
      out = document.createElement('output');
      out.id = 'skyphotosDiagnostic';
      out.className = 'skyframe-diagnostic';
      document.body.appendChild(out);
    }
    out.textContent = `B2 ${telescope} · ds ${this.ds.show ? 'on' : 'off'} · marker ${entity.show ? 'on' : 'off'} · distance ${Math.round(distanceKm).toLocaleString()} km · camera ${Math.round(cameraKm).toLocaleString()} km · sky ${Math.round(markerKm).toLocaleString()} km`;
  },

  show(hst, jwst) {
    this._hst = !!hst;
    this._jwst = !!jwst;
    this.set();
  },

  focusOut() {
    const cartographic = viewer.camera.positionCartographic;
    if (!cartographic) return;
    const target = this.ds.entities.values.find(entity => {
      const telescope = entity._meta?._photo?.telescope;
      return (telescope === 'HST' ? this._hst : telescope === 'JWST' ? this._jwst : false)
        && entity.position;
    });
    if (!target) {
      this._focusPending = true;
      if (cartographic.height >= SHOW_ABOVE_M) return;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromRadians(
          cartographic.longitude, cartographic.latitude, 55_000_000),
        duration: 1.5,
      });
      return;
    }
    this._focusPending = false;
    const targetPosition = target.position.getValue
      ? target.position.getValue(Cesium.JulianDate.now())
      : target.position;
    /* 사진 방향과 같은 지구 반구 바깥으로 이동한다.
       반대편에서 고개만 돌리면 지구가 마커를 가리므로 "켰는데 안 보임"이 된다. */
    const cameraPosition = Cesium.Cartesian3.multiplyByScalar(
      Cesium.Cartesian3.normalize(targetPosition, new Cesium.Cartesian3()),
      6_371_000 + 55_000_000,
      new Cesium.Cartesian3(),
    );
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(targetPosition, cameraPosition, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const right = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const up = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    viewer.camera.flyTo({
      destination: cameraPosition,
      orientation: { direction, up },
      duration: 1.5,
    });
  },
};
