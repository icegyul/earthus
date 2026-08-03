/* 등압선 — 기압 배치를 선으로
 *
 * 받은 지적: "기압배치에 고기압 저기압 배치를 등고선을 써서 보여주면 어때?
 *            더 정확할거 같은데"
 *
 * 맞는 말이다. 기상학에서 기압을 읽는 방식이 그것이다 —
 * ⚠️⚠️ **등압선의 간격이 곧 바람 세기**다. 촘촘하면 세다.
 *    색칠만으로는 "어디가 높나"만 알고 "얼마나 급한가"를 모른다.
 *
 * ⚠️⚠️ 그래서 격자를 따로 받는다. 전지구 격자는 5°(약 555km)라
 *    **한반도 전체가 한 칸**이다. 그걸로 매끄러운 등압선을 그리면
 *    없는 정밀도를 있는 척하는 것이 된다. 동아시아만 1°(약 111km)로 받는다.
 *
 * ⚠️ 4hPa 간격은 기상청 지상일기도가 쓰는 간격이다 — 우리가 정한 값이 아니다.
 *
 * ⚠️ 발열: 선은 자료가 바뀔 때 한 번만 만든다. 카메라가 움직여도 다시 안 만든다.
 *    (매 프레임 다시 계산하는 것이 이 앱 발열의 원인이었다 — power.js 참고)
 */

import { viewer } from './viewer.js';
import { API } from './config.js';
import { fetchT } from './net.js';

const SRC = () => `${API.WIND}/pressure-ea.json`;

/* 등압선 간격(hPa). ⚠️ 기상청 지상일기도와 같은 4hPa.
   더 촘촘히 하면 1°(111km) 격자가 감당 못 하는 선이 나온다. */
const STEP = 4;

/* 지면에서 띄우는 높이(m).
   ⚠️ 0 이면 지구 표면과 겹쳐 깊이 검사에서 져서 통째로 사라진다
      (태풍 예보선·등산로에서 이미 겪었다). */
const LIFT_M = 5_000;

/* 이보다 멀면 안 그린다 — 전지구에서 등압선은 실뭉치가 된다 */
const SHOW_MAX_M = 12_000_000;

/* 고기압·저기압을 찾을 때 이웃을 몇 칸까지 볼까.
   ⚠️ 1칸만 보면 잡음 하나로 "고기압"이 생긴다. 2칸(≈222km)을 본다. */
const HL_RADIUS = 2;

const HI = '#f0955a';     // 고기압
const LO = '#6ea8dc';     // 저기압
const LINE = 'rgba(255,255,255,.55)';

/* ── 마칭 스퀘어 ─────────────────────────────────────────────
   격자에서 같은 값의 선을 뽑는 표준 방법이다.
   ⚠️ 칸 네 귀퉁이 중 하나라도 값이 없으면 그 칸은 **건너뛴다.**
      없는 값을 이웃으로 메우면 있지도 않은 선이 생긴다. */
function contour(grid, nx, ny, lat0, lon0, res, level) {
  const segs = [];
  const at = (x, y) => grid[y * nx + x];
  const lerp = (v1, v2, p1, p2) => {
    const t = (level - v1) / ((v2 - v1) || 1e-9);
    return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
  };
  for (let y = 0; y < ny - 1; y++) {
    for (let x = 0; x < nx - 1; x++) {
      const v = [at(x, y + 1), at(x + 1, y + 1), at(x + 1, y), at(x, y)];
      if (v.some(z => z == null)) continue;
      const p = [
        [lon0 + x * res, lat0 + (y + 1) * res],
        [lon0 + (x + 1) * res, lat0 + (y + 1) * res],
        [lon0 + (x + 1) * res, lat0 + y * res],
        [lon0 + x * res, lat0 + y * res],
      ];
      let idx = 0;
      for (let i = 0; i < 4; i++) if (v[i] >= level) idx |= (1 << i);
      if (idx === 0 || idx === 15) continue;
      // 변마다 교차점 — 0:위 1:오른쪽 2:아래 3:왼쪽
      const e = [
        lerp(v[0], v[1], p[0], p[1]),
        lerp(v[1], v[2], p[1], p[2]),
        lerp(v[2], v[3], p[2], p[3]),
        lerp(v[3], v[0], p[3], p[0]),
      ];
      const T = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
        6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]],
        11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
        /* ⚠️ 5·10 은 안장점(saddle)이다. 두 갈래로 갈리는데 어느 쪽인지
           네 값의 평균으로 정한다 — 임의로 고르면 선이 엉뚱하게 이어진다. */
        5: null, 10: null,
      };
      let pairs = T[idx];
      if (pairs === null) {
        const mid = (v[0] + v[1] + v[2] + v[3]) / 4;
        const flip = mid >= level;
        pairs = idx === 5
          ? (flip ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]])
          : (flip ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]);
      }
      pairs.forEach(([a, b]) => segs.push([e[a], e[b]]));
    }
  }
  return segs;
}

/** 고기압·저기압 중심 — 이웃보다 확실히 높거나 낮은 칸 */
function extrema(grid, nx, ny, lat0, lon0, res) {
  const out = [];
  const at = (x, y) => grid[y * nx + x];
  for (let y = HL_RADIUS; y < ny - HL_RADIUS; y++) {
    for (let x = HL_RADIUS; x < nx - HL_RADIUS; x++) {
      const c = at(x, y);
      if (c == null) continue;
      let hi = true, lo = true, n = 0;
      for (let dy = -HL_RADIUS; dy <= HL_RADIUS; dy++) {
        for (let dx = -HL_RADIUS; dx <= HL_RADIUS; dx++) {
          if (!dx && !dy) continue;
          const v = at(x + dx, y + dy);
          if (v == null) continue;
          n++;
          if (v >= c) hi = false;
          if (v <= c) lo = false;
        }
      }
      /* ⚠️ 이웃이 적으면(가장자리) 판정하지 않는다 — 화면 밖이 더 높을 수 있다. */
      if (n < (HL_RADIUS * 2 + 1) ** 2 - 1) continue;
      if (hi || lo) {
        out.push({ lat: lat0 + y * res, lon: lon0 + x * res, v: c, high: hi });
      }
    }
  }
  return out;
}

export const isobars = {
  ds: null,
  _doc: null,
  _at: 0,

  _ensure() {
    if (!this.ds) {
      this.ds = new Cesium.CustomDataSource('isobars');
      viewer.dataSources.add(this.ds);
    }
    return this.ds;
  },

  clear() { try { this.ds?.entities.removeAll(); } catch (_) { } },

  async load() {
    if (this._doc && Date.now() - this._at < 20 * 60_000) return this._doc;
    try {
      const r = await fetchT(SRC(), { cache: 'no-cache' });
      this._doc = r.ok ? await r.json() : null;
      this._at = Date.now();
    } catch (_) { this._doc = null; }
    return this._doc;
  },

  /** 켜기/끄기. ⚠️ 그리는 것은 자료가 바뀔 때 한 번뿐이다. */
  async set(on) {
    if (!on) { this.clear(); return; }
    const d = await this.load();
    if (!d?.mslp) return;
    this.clear();
    const ds = this._ensure();

    const { nx, ny, lat0, lon0, res } = d;
    const lo = Math.ceil(d.min / STEP) * STEP;
    const hi = Math.floor(d.max / STEP) * STEP;

    for (let lv = lo; lv <= hi; lv += STEP) {
      const segs = contour(d.mslp, nx, ny, lat0, lon0, res, lv);
      if (!segs.length) continue;
      /* ⚠️ 1012hPa(표준 기압 근처)를 굵게 한다. 기준선이 있어야 위아래가 읽힌다. */
      const base = Math.abs(lv - 1012) < 0.1;
      const flat = [];
      segs.forEach(([a, b]) => {
        flat.push(a[0], a[1], LIFT_M, b[0], b[1], LIFT_M);
      });
      // 선분을 하나씩 엔티티로 만들면 수백 개가 된다 — 한 레벨을 한 덩어리로 그린다
      for (let i = 0; i < segs.length; i++) {
        const [a, b] = segs[i];
        ds.entities.add({
          id: `iso:${lv}:${i}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(
              [a[0], a[1], LIFT_M, b[0], b[1], LIFT_M]),
            width: base ? 2.2 : 1.3,
            material: Cesium.Color.fromCssColorString(LINE)
              .withAlpha(base ? 0.85 : 0.5),
            arcType: Cesium.ArcType.GEODESIC, clampToGround: false,
            distanceDisplayCondition:
              new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
          },
        });
      }
    }

    /* ── 고기압 H · 저기압 L ──────────────────────────────
       ⚠️ 값을 함께 적는다. H 만 있으면 얼마나 센 고기압인지 모른다. */
    extrema(d.mslp, nx, ny, lat0, lon0, res).forEach((e, i) => {
      const col = Cesium.Color.fromCssColorString(e.high ? HI : LO);
      ds.entities.add({
        id: `iso:hl:${i}`,
        position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat, LIFT_M),
        label: {
          text: `${e.high ? 'H' : 'L'}\n${Math.round(e.v)}`,
          font: '700 15px -apple-system, sans-serif',
          fillColor: col,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.85), outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition:
            new Cesium.DistanceDisplayCondition(0, SHOW_MAX_M),
        },
      });
    });

    return d;
  },

  STEP, LIFT_M,
};
