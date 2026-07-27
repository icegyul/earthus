// 내 위치 표시
//
// ⚠️ 위치정보는 "보안 컨텍스트"에서만 동작한다.
//    localhost 는 예외로 허용되지만 http://192.168.x.x 는 아니다.
//    폰에서 HTTP 로 열면 에러도 없이 조용히 실패한다 — 그래서 상태를 남긴다.

import { viewer } from './viewer.js';
import { i18n } from './i18n.js';

export const myLocation = {
  ds: null,
  coords: null,
  state: 'idle',     // idle | ok | denied | insecure | unavailable

  init() {
    this.ds = new Cesium.CustomDataSource('me');
    viewer.dataSources.add(this.ds);
    return this;
  },

  /** 위치를 얻어 표시. 실패해도 앱은 그대로 돌아야 한다. */
  async locate() {
    if (!window.isSecureContext) {
      this.state = 'insecure';
      console.warn('[내 위치] 보안 컨텍스트가 아니라 위치를 못 받는다 (HTTPS 필요)');
      return null;
    }
    if (!navigator.geolocation) { this.state = 'unavailable'; return null; }

    const p = await new Promise(res => {
      navigator.geolocation.getCurrentPosition(
        pos => res(pos),
        err => { this.state = err.code === 1 ? 'denied' : 'unavailable'; res(null); },
        { timeout: 8000, maximumAge: 300_000, enableHighAccuracy: false }
      );
    });
    if (!p) return null;

    this.state = 'ok';
    this.coords = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    this.draw();
    return this.coords;
  },

  draw() {
    if (!this.ds || !this.coords) return;
    this.ds.entities.removeAll();
    const { lat, lon } = this.coords;

    /* 지도앱처럼 파란 점 + 숨쉬는 고리.
       ⚠️ disableDepthTestDistance 에 Infinity 를 쓰면 지구 반대편에서도 보인다.
          유한값을 줘서 지구 뒤로 가면 가려지게 한다. */
    this.ds.entities.add({
      id: 'me:dot',
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString('#4d9fff'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: 600_000,
      },
      label: {
        text: i18n.lang === 'ko' ? '내 위치' : 'You',
        font: '300 11px -apple-system, sans-serif',
        fillColor: Cesium.Color.WHITE.withAlpha(0.85),
        pixelOffset: new Cesium.Cartesian2(0, -20),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6_000_000),
      },
      _meta: { id: 'me', kind: 'me', name: i18n.lang === 'ko' ? '내 위치' : 'My location',
               lat, lon, data: { _lazy: true } },
    });

    // 정확도 원 — 실제 오차 반경을 정직하게 보여준다
    if (this.coords.acc > 50) {
      this.ds.entities.add({
        id: 'me:acc',
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        ellipse: {
          semiMajorAxis: this.coords.acc, semiMinorAxis: this.coords.acc,
          material: Cesium.Color.fromCssColorString('#4d9fff').withAlpha(0.14),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#4d9fff').withAlpha(0.35),
        },
      });
    }
  },

  set(on) { if (this.ds) this.ds.show = on; },

  /** 내 위치로 날아간다 */
  flyTo() {
    if (!this.coords) return false;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(this.coords.lon, this.coords.lat, 1_200_000),
      duration: 1.6,
    });
    return true;
  },

  /** 왜 안 되는지 사람이 읽는 말로 */
  reason() {
    const ko = i18n.lang === 'ko';
    return {
      insecure: ko ? 'HTTPS 로 접속해야 위치를 쓸 수 있습니다' : 'Location needs HTTPS',
      denied: ko ? '위치 권한이 거부되었습니다' : 'Location permission denied',
      unavailable: ko ? '위치를 가져오지 못했습니다' : 'Could not get location',
      idle: ko ? '위치 확인 중…' : 'Locating…',
      ok: null,
    }[this.state];
  },
};
