// 고른 사건을 지구에 그린다 — 지진의 흔들림 등진도선, 쓰나미의 도달 등시선
//
// 받은 지적(2026-09-07): "쓰나미와 지진은 여기서 누르면 어디서 어떻게 진행되었다던지
// 그런 정보가 없어. 지구에 표시를 해줘."
//
// 왜 별도 레이어인가
//   경보·재난 목록에서 카드를 눌렀을 때 지진·쓰나미 **레이어가 꺼져 있으면** 화면이
//   빈 바다로 날아갔다(실측: quakeOn=false, tsunamiOn=false). 레이어를 사용자 몰래
//   켜지는 않는다 — 대신 고른 것 하나만 이 데이터소스에 그린다. 태풍 진로선과 같은 문법이다.
//
// ⚠️ 여기서 선을 **만들지 않는다.**
//    지진 등진도선은 USGS ShakeMap 의 cont_mmi.json 을 그대로 그린다(색까지 그 파일 값).
//    쓰나미 등시선은 우리 tsunami-eta 계산본(SIMULATION_ONLY)이고, 화면에 그렇게 적는다.
// ⚠️ 시트를 닫아도 지우지 않는다. 다른 것을 고르거나 선택을 풀 때만 걷는다
//    (받은 지적 "인포창 끄니깐 미국꺼 라인이 사라지네?" 이후로 지켜온 규칙).

import { viewer } from '../viewer.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';

/* 쓰나미 등시선 색 — 이른 시간은 붉게, 늦을수록 식는다. 시간 자체는 계산본 값이다. */
const ISO_COLOR = [
  [60, '#ff5d5d'], [120, '#ff9f43'], [180, '#ffd23f'],
  [300, '#7ee081'], [480, '#4dc9e6'], [Infinity, '#8aa7c4'],
];
const isoColor = min => ISO_COLOR.find(([m]) => min <= m)[1];

export const eventFocus = {
  ds: null,
  lines: null,          // 등시선 전용 — 아래 주석 참고
  currentId: null,

  _ensure() {
    if (!this.ds) {
      this.ds = new Cesium.CustomDataSource('eventfocus');
      viewer.dataSources.add(this.ds);
    }
    this.ds.show = true;
    return this.ds;
  },

  /* ⚠️ 등시선은 두 점짜리 조각이 수천 개다(실측: 한 사건에 3,218개).
     그걸 엔티티로 하나씩 만들면 화면이 눈에 띄게 느려진다.
     Cesium 이 이런 용도로 두고 있는 PolylineCollection 을 쓴다 — 한 번에 그린다. */
  _lines() {
    if (!this.lines) {
      this.lines = new Cesium.PolylineCollection();
      viewer.scene.primitives.add(this.lines);
    }
    return this.lines;
  },

  clear() {
    if (this.lines) this.lines.removeAll();
    if (this.ds) this.ds.entities.removeAll();
    this.currentId = null;
    viewer.scene.requestRender?.();
  },

  /** 진앙 표식 하나 — 등진도선이 없어도 "여기서 났다"는 항상 보인다. */
  _epicenter(ds, lat, lon, label, color, meta) {
    const col = Cesium.Color.fromCssColorString(color);
    ds.entities.add({
      id: 'focus:point',
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 13, color: col.withAlpha(0.95),
        outlineColor: Cesium.Color.WHITE, outlineWidth: 2.5,
        disableDepthTestDistance: 600_000,
      },
      label: mapLabel({ text: label, color: col, size: 'md', weight: 600, offsetY: -22, alwaysOnTop: true }),
      _meta: meta, _layer: 'focus',
    });
    /* 진앙을 감싸는 얇은 고리 — 멀리서도 "여기"가 눈에 걸린다. */
    ds.entities.add({
      id: 'focus:ring',
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      ellipse: {
        semiMajorAxis: 45_000, semiMinorAxis: 45_000, height: 0,
        material: col.withAlpha(0.10), outline: true,
        outlineColor: col.withAlpha(0.75), outlineWidth: 1.5,
      },
      _meta: meta, _layer: 'focus',
    });
  },

  /**
   * 지진 하나를 그린다.
   * @param m    지진 마커
   * @param cont ShakeMap 등진도선 GeoJSON (없으면 null — 진앙만 그린다)
   * @returns {{contours:number}} 그린 등진도선 개수(0 이면 화면이 그 사실을 적는다)
   */
  quake(m, cont) {
    const ds = this._ensure();
    ds.entities.removeAll();
    this.lines?.removeAll();       // 앞서 그린 쓰나미 등시선을 남기지 않는다
    this.currentId = m.id;
    const meta = { id: m.id, kind: 'quake', name: m.name, lat: m.lat, lon: m.lon, data: m.data };
    this._epicenter(ds, m.lat, m.lon, m.name || 'M ?', '#ff5d5d', meta);

    let n = 0;
    (cont?.features || []).forEach((f, i) => {
      const p = f.properties || {};
      const col = Cesium.Color.fromCssColorString(p.color || '#ffcc00');
      const lines = f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates
        : f.geometry?.type === 'LineString' ? [f.geometry.coordinates] : [];
      lines.forEach((line, j) => {
        if (!line || line.length < 2) return;
        ds.entities.add({
          id: `focus:mmi:${i}:${j}`,
          /* ⚠️ 지면에 붙이는 선(clampToGround)은 쓸 수 있는 재질이 제한된다.
             외곽선 재질을 쓰면 조용히 안 그려진다 — 단색으로 둔다. */
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(line.flat()),
            width: p.value >= 6 ? 3.5 : p.value >= 4 ? 2.5 : 1.8,
            material: col.withAlpha(0.95),
            clampToGround: true,
          },
          _meta: meta, _layer: 'focus',
        });
        n += 1;
      });
    });
    viewer.scene.requestRender?.();
    return { contours: n };
  },

  /**
   * 쓰나미 경보 하나를 그린다.
   * @param t   경보 객체 (tsunami.list 의 항목)
   * @param eta 도달시간 계산본 (없으면 null — 발표 지점·구역만 그린다)
   */
  tsunami(t, eta) {
    const ds = this._ensure();
    ds.entities.removeAll();
    this.lines?.removeAll();
    this.currentId = t.id;
    const ko = i18n.lang === 'ko';
    const meta = { id: t.id, kind: 'tsunami', name: t.level[i18n.lang] || t.level.ko,
                   lat: t.lat, lon: t.lon, _ts: t };
    const col = Cesium.Color.fromCssColorString(t.level.color);

    /* NWS 경보는 구역 폴리곤이 있다. 국제(PTWC/NTWC) 발표에는 없다. */
    if (t.polygon?.length) {
      ds.entities.add({
        id: 'focus:tsarea',
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(t.polygon.flat()),
          material: col.withAlpha(0.20), outline: true,
          outlineColor: col.withAlpha(0.85), height: 0,
        },
        _meta: meta, _layer: 'focus',
      });
    }
    if (t.lat != null) {
      this._epicenter(ds, t.lat, t.lon, t.level[i18n.lang] || t.level.ko, t.level.color, meta);
    }

    /* 도달 등시선 — 계산본이 있는 사건만. 좌표가 [위도, 경도] 순인 점에 주의. */
    let iso = 0;
    const src = eta?.isochronesMin || null;
    const lines = this._lines();
    Object.keys(src || {}).sort((a, b) => Number(a) - Number(b)).forEach(k => {
      const min = Number(k);
      const c = Cesium.Color.fromCssColorString(isoColor(min)).withAlpha(0.85);
      (src[k] || []).forEach(seg => {
        if (!seg || seg.length < 2) return;
        const flat = [];
        seg.forEach(([la, lo]) => { flat.push(lo, la); });
        lines.add({
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: 1.6,
          material: Cesium.Material.fromType('Color', { color: c }),
        });
        iso += 1;
      });
    });

    /* 계산본이 짚은 연안 지점 — 몇 분 뒤인지 그 자리에 적는다. */
    let marks = 0;
    (eta?.stations || []).forEach((s, i) => {
      if (s.etaMin == null || s.lat == null) return;
      const c = Cesium.Color.fromCssColorString(isoColor(s.etaMin));
      ds.entities.add({
        id: `focus:sta:${i}`,
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
        point: { pixelSize: 7, color: c.withAlpha(0.95), outlineColor: Cesium.Color.WHITE,
                 outlineWidth: 1.5, disableDepthTestDistance: 600_000 },
        label: mapLabel({
          text: `${s.name} ${ko ? `${Math.round(s.etaMin)}분` : `${Math.round(s.etaMin)}m`}`,
          color: c, size: 'sm', offsetY: -18, maxDistance: 20_000_000,
        }),
        _meta: meta, _layer: 'focus',
      });
      marks += 1;
    });

    viewer.scene.requestRender?.();
    return { isochrones: iso, stations: marks };
  },
};
