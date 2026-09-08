// Data View 전용 흰색 해안선.
//
// 기존 Esri reference 타일은 국경·지명·해안선을 한 이미지로 제공해 해안선만 선명하게
// 조절할 수 없다. Natural Earth의 별도 coastline을 어두운 halo + 흰색 선으로 그려
// 온도·파고 같은 색면 위에서도 섬과 육지 외곽을 읽게 한다.
//
// ⚠️ 첫 Earth에는 만들지 않는다. Data/Evidence/Decision에서만 켜며 화면을 벗어나면 제거한다.
// ⚠️ clampToGround를 쓰지 않는다. 이 선은 영토·안전·정밀 해안 판정 자료가 아니다.

import { viewer } from './viewer.js';

const DATA_URL = new URL('../data/coastline-reference.json?v=20260813-coast1', import.meta.url).href;
const HEIGHT_M = 3_500;
let documentPromise = null;

async function loadDocument() {
  if (!documentPromise) documentPromise = fetch(DATA_URL, { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error(`coastline: HTTP ${response.status}`);
    const doc = await response.json();
    if (doc?.schemaVersion !== 'earthus.coastline-reference.v1' || !Array.isArray(doc.lines)) {
      throw new Error('coastline: invalid schema');
    }
    return doc;
  });
  return documentPromise;
}

/* ⚠️⚠️ **해안선에 검은 가시가 돋던 이유 (2026-09-08).**
   폴리라인은 꼭짓점에서 두 선분을 **miter(뾰족 이음)** 로 잇는다. 이음의 길이는
   `굵기 / sin(끼인각/2)` 이라, 선이 거의 되꺾이는 자리(끼인각이 0에 가까운 곳)에서
   **무한히 길어진다.** 자연지리 해안선 자료에는 그런 꼭짓점이 실제로 있다 —
   이 파일의 27,890개 중 **138개가 150° 넘게 꺾인다**(실측).
   굵기 1.8 의 흰 선에서는 티가 안 났지만, 굵기 4.4 의 어두운 halo 에서는
   17픽셀짜리 검은 가시가 돼서 "일본쪽 지도 선이 이상하다"가 됐다.
   ⚠️ 색면 아래 판을 누르기 시작하면서(gridOverlay.syncBaseDim) 밝은 색면 위에
      검은 가시가 그대로 드러난 것이지, 가시 자체는 그 전에도 있었다.
   → **꺾임이 심한 자리에서 선을 끊는다.** 끊으면 그 자리에 이음이 없으므로 miter 도
     없다. 110° 에서 끊으면 남는 최대 miter 는 1.74배다(4.4 → 7.7px 였던 것이
     halo 굵기를 2.8 로 줄여 4.9px, 선 굵기와의 차이는 2px — 안 보인다). */
const MAX_TURN_DEG = 110;
const MAX_TURN_COS = Math.cos(MAX_TURN_DEG * Math.PI / 180);

/** 되꺾이는 꼭짓점에서 끊어 조각 배열로 만든다. 끊긴 자리는 이음이 없다. */
function splitAtSharpTurns(line) {
  const points = [];
  for (const point of line) {
    const lon = Number(point?.[0]), lat = Number(point?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    /* ⚠️ 겹친 꼭짓점은 방향 벡터를 0 으로 만들어 이음 계산을 깨뜨린다. 먼저 버린다. */
    const last = points[points.length - 1];
    if (last && last[0] === lon && last[1] === lat) continue;
    points.push([lon, lat]);
  }
  if (points.length < 2) return [];

  const pieces = [];
  let piece = [points[0]];
  for (let i = 1; i < points.length; i++) {
    piece.push(points[i]);
    const next = points[i + 1];
    if (!next) break;
    const p = points[i - 1], c = points[i];
    const ax = c[0] - p[0], ay = c[1] - p[1];
    const bx = next[0] - c[0], by = next[1] - c[1];
    const ma = Math.hypot(ax, ay), mb = Math.hypot(bx, by);
    if (ma < 1e-12 || mb < 1e-12) continue;
    // cos 이 이 값보다 작으면 110° 보다 많이 꺾인 것이다
    if ((ax * bx + ay * by) / (ma * mb) < MAX_TURN_COS) {
      pieces.push(piece);
      piece = [c];            // 끊되 끊긴 자리는 이어 붙는다 — 선이 비지 않게
    }
  }
  if (piece.length >= 2) pieces.push(piece);
  return pieces;
}

function geometryInstances(lines, width) {
  const out = [];
  for (const line of lines) {
    if (!Array.isArray(line) || line.length < 2) continue;
    for (const piece of splitAtSharpTurns(line)) {
      const degrees = [];
      for (const [lon, lat] of piece) degrees.push(lon, lat, HEIGHT_M);
      if (degrees.length < 6) continue;
      out.push(new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(degrees),
          width,
          arcType: Cesium.ArcType.GEODESIC,
          vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
        }),
      }));
    }
  }
  return out;
}

function primitive(lines, width, color) {
  return new Cesium.Primitive({
    geometryInstances: geometryInstances(lines, width),
    appearance: new Cesium.PolylineMaterialAppearance({
      material: Cesium.Material.fromType('Color', { color }),
      translucent: true,
    }),
    asynchronous: false,
    releaseGeometryInstances: true,
  });
}

export const coastlineReference = {
  token: 0,
  primitives: [],
  document: null,

  set(on, enhanced = false) {
    const token = ++this.token;
    if (!on) return this.remove();
    if (this.primitives.length) return this._style(enhanced);
    loadDocument().then(doc => {
      if (token !== this.token || !viewer?.scene?.primitives) return;
      this.document = doc;
      /* ⚠️ halo 를 4.4 → 2.8 로 줄였다. 원래는 밝은 위성 영상 위에서 흰 선을
         살리려던 굵기인데, 이제 색면 아래 판을 눌러 배경이 어둡다. 굵은 halo 는
         남은 miter 를 키우고 해안선을 굵은 검은 띠로 만들 뿐이다. */
      const halo = primitive(doc.lines, 2.8, Cesium.Color.fromCssColorString('#001018').withAlpha(0.72));
      const line = primitive(doc.lines, 1.8, Cesium.Color.WHITE.withAlpha(0.96));
      this.primitives = [
        viewer.scene.primitives.add(halo),
        viewer.scene.primitives.add(line),
      ];
      this._style(enhanced);
    }).catch(error => console.warn('[readability] 해안선 reference를 못 열었습니다', error?.message || error));
  },

  _style(enhanced) {
    const [halo, line] = this.primitives;
    if (halo?.appearance?.material?.uniforms) {
      halo.appearance.material.uniforms.color = Cesium.Color.fromCssColorString('#001018')
        .withAlpha(enhanced ? 0.84 : 0.72);
    }
    if (line?.appearance?.material?.uniforms) {
      line.appearance.material.uniforms.color = Cesium.Color.WHITE.withAlpha(enhanced ? 1 : 0.96);
    }
    viewer.scene.requestRender?.();
  },

  remove() {
    for (const item of this.primitives) {
      try { viewer.scene.primitives.remove(item); } catch (_) { }
    }
    this.primitives = [];
    viewer.scene.requestRender?.();
  },
};
