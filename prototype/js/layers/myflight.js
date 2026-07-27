// 내 항공편 — 실제 항적 + 비행기
//
// 규칙: **내가 고른 비행기 한 대만** 그린다.
//   하늘에 뜬 모든 비행기를 그리는 건 다른 얘기다. 여기서는 사용자가 타는 그 편만이다.
//
// 무엇을 그리나
//   1) **실제 항적** — adsb.lol 이 준 비행 궤적. 고도별로 색을 칠한다.
//      ⚠️ 예전엔 대권항로(great circle)를 그려놓고 "예상 경로"라고 했다.
//         실제 항로는 제트기류·영공·항로점 때문에 대권과 꽤 다르다.
//         이제 진짜로 지나온 길을 그린다 — 근사가 아니다.
//   2) 비행기 — 진행 방위로 회전한 기호. 고도를 반영해 띄운다.
//   3) 남은 구간 — 도착지까지는 아직 대권으로 점선. 그건 여전히 "예상"이므로
//      실선과 확실히 구분해서 그린다.
//
// 고도 색 (adsb.lol/tar1090 관습을 따른다)
//   지상 초록 → 저고도 하늘색 → 중고도 파랑 → 순항 보라 → 고고도 주황
//   ⚠️ 색을 우리가 새로 정하지 않는다. 항공 추적을 아는 사람이 바로 읽을 수 있어야 한다.
//
// ⚠️ 수신 공백을 메우지 않는다.
//    자원봉사 수신망이라 대양·극지는 항적이 끊긴다. 끊긴 구간을 직선으로 이어
//    "거기로 갔다"고 그리면 안 된다 — 실제로 어디로 갔는지 우리는 모른다.
//    시간 간격이 크게 벌어진 곳은 선을 끊는다.

import { viewer } from '../viewer.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';
import { greatCircle, progressAlong, distanceKm } from '../flight.js';

const TEAL = '#3fc7c0';

/* 고도(m) → 색. tar1090 팔레트에 맞췄다. */
const ALT_STOPS = [
  [0,     '#3ddc84'],   // 지상·이륙
  [1500,  '#5ad1e8'],   // 상승 초기
  [3500,  '#3f9fff'],   // 저고도
  [6000,  '#4a5cff'],   // 중고도
  [9000,  '#8b5cf6'],   // 순항 하단
  [11000, '#c084fc'],   // 순항
  [12500, '#f59e0b'],   // 고고도
];

function altColor(m) {
  const a = m == null ? 0 : m;
  let lo = ALT_STOPS[0], hi = ALT_STOPS[ALT_STOPS.length - 1];
  for (let i = 0; i < ALT_STOPS.length - 1; i++) {
    if (a >= ALT_STOPS[i][0] && a <= ALT_STOPS[i + 1][0]) {
      lo = ALT_STOPS[i]; hi = ALT_STOPS[i + 1];
      break;
    }
  }
  if (a >= hi[0]) return Cesium.Color.fromCssColorString(hi[1]);
  const t = Math.max(0, Math.min(1, (a - lo[0]) / Math.max(1, hi[0] - lo[0])));
  return Cesium.Color.lerp(
    Cesium.Color.fromCssColorString(lo[1]),
    Cesium.Color.fromCssColorString(hi[1]),
    t, new Cesium.Color());
}

/* 항적 고도를 눈에 보이게 하려면 과장이 필요하다.
   순항 11km 는 지구 반지름의 0.17% 라 실제 비율로는 지표에 붙어 보인다.
   ⚠️ 과장했다는 사실을 시트에 적는다. */
const ALT_EXAG = 8;

/* 이 시간 이상 벌어지면 수신이 끊긴 구간으로 보고 선을 끊는다 (초).
   순항 중 정상 간격은 수십 초 단위다. */
const GAP_SEC = 900;

export const myFlight = {
  ds: null,

  init() {
    this.ds = new Cesium.CustomDataSource('myflight');
    viewer.dataSources.add(this.ds);
    this.ds.show = true;      // 추적 중일 때만 내용이 생긴다
    return this;
  },

  clear() { this.ds?.entities.removeAll(); },

  /**
   * @param flight { from, to, num, callsign, hex }
   * @param state  현재 상태 (없으면 항적만)
   * @param trace  [{t, lat, lon, alt, ground}] — 실제 항적
   */
  draw(flight, state, trace) {
    if (!this.ds) return;
    this.ds.entities.removeAll();
    if (!flight) return;

    const ko = i18n.lang === 'ko';
    const { from, to } = flight;

    /* ── 1. 실제 항적 ─────────────────────────────────────────
       고도가 변하는 구간마다 색이 달라야 하므로 선을 조각내 그린다.
       ⚠️ 한 폴리라인에 색을 여러 개 줄 수 없다 (Cesium 제약).
          조각을 너무 잘게 나누면 엔티티가 수백 개가 되므로,
          색 구간이 바뀔 때만 새 조각을 시작한다. */
    if (trace?.length > 1) {
      let seg = [trace[0]];
      let segColor = altColor(trace[0].alt);
      let idx = 0;

      const flush = (pts, col) => {
        if (pts.length < 2) return;
        this.ds.entities.add({
          id: `mf:tr${idx++}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(
              pts.flatMap(p => [p.lon, p.lat, Math.max(0, (p.alt || 0) * ALT_EXAG)])),
            width: 3.5,
            material: new Cesium.ColorMaterialProperty(col.withAlpha(0.92)),
            arcType: Cesium.ArcType.NONE,
          },
        });
      };

      for (let i = 1; i < trace.length; i++) {
        const p = trace[i], prev = trace[i - 1];
        // 수신 공백 — 선을 끊는다 (이어 그으면 가지 않은 길을 그리는 것이 된다)
        if (p.t - prev.t > GAP_SEC) {
          flush(seg, segColor);
          seg = [p];
          segColor = altColor(p.alt);
          continue;
        }
        const c = altColor(p.alt);
        // 색이 눈에 보일 만큼 달라졌으면 조각을 끊는다
        if (Math.abs(c.red - segColor.red) + Math.abs(c.green - segColor.green)
            + Math.abs(c.blue - segColor.blue) > 0.18) {
          seg.push(p);
          flush(seg, segColor);
          seg = [p];
          segColor = c;
        } else {
          seg.push(p);
        }
      }
      flush(seg, segColor);
    }

    /* ── 2. 남은 구간 — 여전히 "예상"이다 ────────────────────── */
    if (from && to) {
      const head = state || (trace?.length ? trace[trace.length - 1] : null);
      const restFrom = head || from;
      const path = greatCircle(restFrom, to, 64);
      this.ds.entities.add({
        id: 'mf:ahead',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(path.flatMap(p => [p.lon, p.lat])),
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(TEAL).withAlpha(0.38), dashLength: 14,
          }),
          arcType: Cesium.ArcType.NONE,
        },
      });
    }

    /* ── 3. 공항 ──────────────────────────────────────────── */
    [[from, ko ? '출발' : 'From'], [to, ko ? '도착' : 'To']].forEach(([ap, label], i) => {
      if (!ap) return;
      this.ds.entities.add({
        id: `mf:ap${i}`,
        position: Cesium.Cartesian3.fromDegrees(ap.lon, ap.lat),
        point: { pixelSize: 8, color: Cesium.Color.fromCssColorString(TEAL).withAlpha(0.9),
                 outlineColor: Cesium.Color.WHITE.withAlpha(0.6), outlineWidth: 1.5,
                 disableDepthTestDistance: 600_000 },
        label: mapLabel({ text: `${ap.iata} · ${label}`,
                          color: Cesium.Color.WHITE.withAlpha(0.92),
                          size: 'sm', weight: 400, offsetY: -18 }),
        _meta: { id: `ap-${ap.iata}`, kind: 'airport', name: `${ap.iata} ${ap.name}`,
                 lat: ap.lat, lon: ap.lon,
                 data: { [ko ? '공항' : 'Airport']: ap.name,
                         [ko ? '도시' : 'City']: ap.city || '—' } },
        _layer: 'myflight',
      });
    });

    if (!state) return;

    /* ── 4. 비행기 ────────────────────────────────────────── */
    const altM = (state.alt || 0) * ALT_EXAG;
    const pos = Cesium.Cartesian3.fromDegrees(state.lon, state.lat, altM);
    const planeCol = state.emergency ? '#ff3b30' : (state.onGround ? '#3ddc84' : TEAL);

    this.ds.entities.add({
      id: 'mf:plane',
      position: pos,
      billboard: {
        image: planeIcon(state.track || 0, planeCol),
        width: 36, height: 36,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: mapLabel({
        text: state.callsign || flight.callsign || flight.num || '',
        color: planeCol, size: 'md', weight: 600, offsetY: -28, alwaysOnTop: true,
      }),
      _meta: {
        id: 'myflight', kind: 'myflight',
        name: state.callsign || flight.callsign || flight.num,
        lat: state.lat, lon: state.lon,
        _flight: flight, _state: state,
      },
      _layer: 'myflight',
    });

    // 고도 기둥 — 지표 어디 위에 있는지
    this.ds.entities.add({
      id: 'mf:drop',
      polyline: {
        positions: [pos, Cesium.Cartesian3.fromDegrees(state.lon, state.lat, 0)],
        width: 1.2,
        material: new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString(planeCol).withAlpha(0.3)),
        arcType: Cesium.ArcType.NONE,
      },
    });
  },

  /** 고도 색 범례 — UI 가 쓴다 */
  legend() {
    return ALT_STOPS.map(([m, c]) => ({ m, color: c }));
  },
  altExaggeration: ALT_EXAG,
};

/* 비행기 기호를 캔버스로 그린다 — 진행 방위대로 회전시켜서
   어느 쪽으로 가는지 바로 읽히게 한다. */
const iconCache = new Map();
function planeIcon(headingDeg, color) {
  const key = `${Math.round(headingDeg / 5) * 5}|${color}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const S = 72;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.translate(S / 2, S / 2);
  g.rotate((Math.round(headingDeg / 5) * 5) * Math.PI / 180);   // 0° = 북쪽

  g.beginPath();
  g.moveTo(0, -24);                                     // 기수
  g.lineTo(5, -7); g.lineTo(25, 6); g.lineTo(25, 11);   // 오른쪽 주익
  g.lineTo(4, 8); g.lineTo(3, 18);
  g.lineTo(12, 23); g.lineTo(12, 26);                   // 오른쪽 수평미익
  g.lineTo(0, 23);
  g.lineTo(-12, 26); g.lineTo(-12, 23);
  g.lineTo(-3, 18); g.lineTo(-4, 8);
  g.lineTo(-25, 11); g.lineTo(-25, 6); g.lineTo(-5, -7);
  g.closePath();

  g.fillStyle = color;
  g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 5;
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5;
  g.stroke();

  const url = cv.toDataURL('image/png');
  iconCache.set(key, url);
  return url;
}
