// 발사대 — 발사 지점으로 날아갔을 때 "여기가 발사대다"를 보여준다
//
// 왜 따로 만드나
//   발사 레이어는 이미 발사대 좌표에 점을 찍고 있다. 그런데 확대해서 내려가 보면
//   보라색 점 하나뿐이라 발사대인지 아닌지 알 수가 없다.
//   (실제로 "팰컨9 고르면 발사지역으로 가는데 발사대 포인트가 없다"는 지적을 받았다.)
//
//   멀리서는 점 하나로 충분하다 — 어디서 쏘는지만 알면 된다.
//   가까이 가면 발사대 구조물이 보여야 한다. 그게 그 자리에 간 이유다.
//
// ⚠️ 발사대 도면을 지어내지 않는다.
//    LL2 가 주는 것은 좌표와 이름뿐이다. 실제 탑·화염 유도로 배치는 모른다.
//    그래서 "그 자리에 발사대가 있다"는 사실만 기호로 표시하고,
//    구조물을 사실적으로 그린 척하지 않는다. 라벨에 발사대 이름을 그대로 쓴다.
//
// ⚠️ 한 발사대에서 여러 발사가 예정되는 일이 흔하다 (SpaceX 는 특히).
//    발사 건마다 탑을 세우면 같은 자리에 겹쳐 그려진다. 발사대 단위로 묶는다.

import { viewer } from '../viewer.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';
import { C } from '../config.js';

/* 발사대 구조물이 보이기 시작하는 거리.
   이보다 멀면 발사 레이어의 점만 남는다 — 그 정도 거리에서는 탑이 픽셀 몇 개다. */
const SHOW_M = 900_000;
const LABEL_M = 2_500_000;

export const launchPads = {
  ds: null,
  pads: [],

  init() {
    this.ds = new Cesium.CustomDataSource('launchpad');
    viewer.dataSources.add(this.ds);
    this.ds.show = true;
    return this;
  },

  set(on) { if (this.ds) this.ds.show = on; },

  /* ── 발사대 핀포인트 (2026-09-06 받은 지시: "발사대 위치를 핀포인트로 표시해줘") ──
     인공위성 시트의 발사 목록에서 한 건을 고르면, launch 레이어가 꺼져 있어도 그 발사대 자리에
     핀(아이콘 + 900 m 원 + 이름)을 하나 세운다. 레이어와 별도의 작은 데이터소스라 레이어 켜고 끔에
     휩쓸리지 않는다. 다른 걸 고르거나 선택이 풀리면(store 'select' null) 걷는다. */
  pinDs: null,
  pin(m) {
    if (!m || m.lat == null || m.lon == null) return;
    if (!this.pinDs) {
      this.pinDs = new Cesium.CustomDataSource('launchpin');
      viewer.dataSources.add(this.pinDs);
    }
    this.pinDs.entities.removeAll();
    this.pinDs.show = true;
    const t = i18n.t.F;
    const name = m.data?.[t.pad] || m.name || '';
    const col = Cesium.Color.fromCssColorString(C.amber);
    const meta = { id: `pad-pin-${m.id}`, kind: 'launchpad', name, lat: m.lat, lon: m.lon, _launch: m };
    this.pinDs.entities.add({
      id: 'pad:pin',
      position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat),
      billboard: {
        image: padIcon(true), width: 40, height: 46,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        ...mapLabel({ text: name, color: col, size: 'sm', maxDistance: 12_000_000 }),
        pixelOffset: new Cesium.Cartesian2(0, 10),
        verticalOrigin: Cesium.VerticalOrigin.TOP,
      },
      _meta: meta, _layer: 'launch',
    });
    this.pinDs.entities.add({
      id: 'pad:pin:ring',
      position: Cesium.Cartesian3.fromDegrees(m.lon, m.lat),
      ellipse: {
        semiMajorAxis: 900, semiMinorAxis: 900,
        material: col.withAlpha(0.14), outline: true, outlineColor: col.withAlpha(0.7), outlineWidth: 1.5, height: 0,
      },
      _meta: meta, _layer: 'launch',
    });
    viewer.scene.requestRender?.();
  },
  clearPin() {
    if (!this.pinDs) return;
    this.pinDs.entities.removeAll();
    viewer.scene.requestRender?.();
  },

  /** 발사 목록에서 발사대를 뽑아낸다 (같은 좌표는 하나로 묶는다) */
  build(items) {
    if (!this.ds) return;
    this.ds.entities.removeAll();
    const ko = i18n.lang === 'ko';
    const t = i18n.t.F;

    const byPad = new Map();
    (items || []).forEach(m => {
      // 좌표를 소수 4자리로 끊어 같은 발사대를 하나로 본다 (약 11m)
      const key = `${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
      if (!byPad.has(key)) {
        byPad.set(key, {
          key, lat: m.lat, lon: m.lon,
          name: m.data?.[t.pad] || '—',
          provider: m.data?.[t.provider] || '—',
          launches: [],
        });
      }
      byPad.get(key).launches.push(m);
    });

    this.pads = [...byPad.values()];
    this.pads.forEach(p => {
      // 가장 임박한 발사 기준으로 급한 정도를 정한다
      p.launches.sort((a, b) => (a.data._hoursOut ?? 1e9) - (b.data._hoursOut ?? 1e9));
      const soon = p.launches[0]?.data?._hoursOut;
      const hot = soon != null && soon >= 0 && soon <= 24;
      this._draw(p, hot, ko);
    });
  },

  _draw(p, hot, ko) {
    const col = Cesium.Color.fromCssColorString(hot ? C.amber : C.violet);
    const meta = {
      id: `pad-${p.key}`, kind: 'launchpad',
      name: p.name, lat: p.lat, lon: p.lon, _pad: p,
    };

    // 발사대 구조물 — 확대했을 때만
    this.ds.entities.add({
      id: `pad:${p.key}`,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
      billboard: {
        image: padIcon(hot),
        width: 40, height: 46,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, SHOW_M),
      },
      // 발사대 이름은 아이콘 아래에 (아이콘이 위로 솟아 있다)
      label: {
        ...mapLabel({ text: p.name, color: col, size: 'sm', maxDistance: LABEL_M }),
        pixelOffset: new Cesium.Cartesian2(0, 10),
        verticalOrigin: Cesium.VerticalOrigin.TOP,
      },
      _meta: meta, _layer: 'launch',
    });

    /* 발사대 부지 — 반경 900m 원.
       ⚠️ 실제 부지 크기가 아니라 "이 자리"를 가리키는 표시다. 시트에 그렇게 쓴다. */
    this.ds.entities.add({
      id: `pad:${p.key}:ring`,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
      ellipse: {
        semiMajorAxis: 900, semiMinorAxis: 900,
        material: col.withAlpha(0.12),
        outline: true, outlineColor: col.withAlpha(0.6), outlineWidth: 1.5,
        height: 0,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, SHOW_M),
      },
      _meta: meta, _layer: 'launch',
    });

    /* 임박한 발사가 있으면 상승 경로를 세로선으로 세운다.
       "여기서 위로 올라간다"가 한눈에 읽힌다. */
    if (hot) {
      this.ds.entities.add({
        id: `pad:${p.key}:up`,
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0),
            Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 120_000),
          ],
          width: 3,
          material: new Cesium.PolylineGlowMaterialProperty({
            color: col.withAlpha(0.5), glowPower: 0.35, taperPower: 0.15,
          }),
          arcType: Cesium.ArcType.NONE,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6_000_000),
        },
        _meta: meta, _layer: 'launch',
      });
    }
  },

  /** 시트용 상세 */
  detail(p) {
    const ko = i18n.lang === 'ko';
    const rows = {};
    rows[ko ? '발사대' : 'Pad'] = p.name;
    rows[ko ? '운용' : 'Operator'] = p.provider;
    rows[ko ? '좌표' : 'Coordinates'] =
      `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
    rows[ko ? '예정된 발사' : 'Upcoming launches'] = `${p.launches.length}${ko ? '건' : ''}`;
    p.launches.slice(0, 4).forEach((m, i) => {
      const h = m.data._hoursOut;
      const when = h == null ? '—'
        : h < 0 ? (ko ? '지남' : 'past')
        : h < 24 ? (ko ? `${Math.round(h)}시간 뒤` : `in ${Math.round(h)}h`)
        : (ko ? `${Math.round(h / 24)}일 뒤` : `in ${Math.round(h / 24)}d`);
      rows[`${i + 1}. ${m.name}`] = when;
    });
    rows['_note'] = ko
      ? '위치 표시 원 · 부지 규모 미반영 · 좌표·이름 출처 The Space Devs(LL2)'
      : 'Location marker · site footprint omitted · coordinates and names from The Space Devs (LL2)';
    return { title: p.name, rows };
  },
};

/* 발사대 기호를 캔버스로 그린다 — 발사탑과 지지 구조의 실루엣.
   사진이 아니라 기호다. 어느 발사대든 같은 모양이며, 그 사실을 시트에 밝힌다. */
const cache = new Map();
function padIcon(hot) {
  const key = hot ? 'hot' : 'cold';
  if (cache.has(key)) return cache.get(key);

  const W = 80, H = 92;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const col = hot ? '#f2a65a' : '#c9a7ff';

  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,.9)';
  g.shadowBlur = 4;

  // 기단 (발사 플랫폼)
  g.beginPath();
  g.moveTo(14, 86); g.lineTo(66, 86);
  g.stroke();
  g.beginPath();
  g.moveTo(20, 86); g.lineTo(26, 76); g.lineTo(54, 76); g.lineTo(60, 86);
  g.stroke();

  // 발사탑 (오른쪽 격자 구조)
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(52, 76); g.lineTo(52, 20); g.lineTo(62, 20); g.lineTo(62, 76);
  g.stroke();
  g.lineWidth = 1.4;
  for (let y = 26; y < 76; y += 11) {
    g.beginPath(); g.moveTo(52, y); g.lineTo(62, y + 6); g.stroke();
  }

  // 로켓 (탑 왼쪽에 세워진 원통 + 노즈콘)
  g.lineWidth = 2.4;
  g.beginPath();
  g.moveTo(34, 76); g.lineTo(34, 34);
  g.quadraticCurveTo(40, 20, 46, 34);
  g.lineTo(46, 76);
  g.stroke();
  // 하단 핀
  g.beginPath();
  g.moveTo(34, 68); g.lineTo(28, 76); g.moveTo(46, 68); g.lineTo(52, 76);
  g.stroke();

  cache.set(key, cv.toDataURL('image/png'));
  return cache.get(key);
}
