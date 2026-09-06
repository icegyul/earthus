/* 발사 궤적 그리기 — 계산은 orbit-math.js (2026-09-06 받은 지시: "발사 지나가는 발사궤도도 그려줘")
 *
 * ⚠️ 이 선은 예보가 아니라 근사다. 경사각을 어디서 얻었는지(정거장 고정값·SSO 범위·발사대 위도 하한)를
 *    화면에 그대로 적는다 — orbit-math.js 의 why 를 ui.js 가 받아 쓴다.
 */
import { viewer } from '../viewer.js';
import { inclinationFor, azimuthFor, groundTrack, segments } from './orbit-math.js';

export { inclinationFor, azimuthFor, groundTrack };

export const launchTrack = {
  ds: null,
  current: null,

  _ensure() {
    if (!this.ds) {
      this.ds = new Cesium.CustomDataSource('launchtrack');
      viewer.dataSources.add(this.ds);
    }
    return this.ds;
  },

  /** 선택한 발사의 궤적을 그린다. 그릴 수 없으면 이유를 돌려준다(화면이 그대로 적는다). */
  show(m) {
    const ds = this._ensure();
    ds.entities.removeAll();
    this.current = null;
    if (!m || m.kind !== 'launch' || !Number.isFinite(m.lat) || !Number.isFinite(m.lon)) return null;

    const plan = inclinationFor(m);
    if (!plan) return null;
    if (plan.skip) return { skipped: true, why: plan.why };

    const { pts, T } = groundTrack(m.lat, m.lon, plan.inc, plan.alt);
    if (pts.length < 2) return null;
    const az = azimuthFor(plan.inc, m.lat);

    const col = Cesium.Color.fromCssColorString('#ffb454');
    segments(pts).forEach((seg, idx) => {
      ds.entities.add({
        id: `ltrack:${m.id}:${idx}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(
            seg.flatMap(([lon, lat]) => [lon, lat, plan.alt * 1000]),
          ),
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({ color: col.withAlpha(0.75), glowPower: 0.22 }),
          arcType: Cesium.ArcType.NONE,
        },
        _layer: 'launch',
      });
    });

    /* 상승 구간 — 발사대에서 궤도 높이까지. "여기서 저쪽으로 올라간다"를 한눈에. */
    const head = pts.slice(0, Math.min(40, pts.length));
    ds.entities.add({
      id: `ltrack:${m.id}:ascent`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          m.lon, m.lat, 0,
          ...head.flatMap(([lon, lat], k) => [lon, lat, (plan.alt * 1000 * (k + 1)) / head.length]),
        ]),
        width: 3,
        material: new Cesium.PolylineGlowMaterialProperty({ color: col.withAlpha(0.9), glowPower: 0.35, taperPower: 0.4 }),
        arcType: Cesium.ArcType.NONE,
      },
      _layer: 'launch',
    });

    viewer.scene.requestRender?.();
    this.current = { id: m.id, inc: plan.inc, alt: plan.alt, periodMin: T / 60, az, why: plan.why,
      minimum: !!plan.minimum, exact: !!plan.exact };
    return this.current;
  },

  clear() {
    if (!this.ds) return;
    this.ds.entities.removeAll();
    this.current = null;
    viewer.scene.requestRender?.();
  },
};
