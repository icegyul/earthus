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

function geometryInstances(lines, width) {
  return lines.filter(line => Array.isArray(line) && line.length >= 2).map(line => {
    const degrees = [];
    for (const point of line) {
      const lon = Number(point?.[0]), lat = Number(point?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      degrees.push(lon, lat, HEIGHT_M);
    }
    if (degrees.length < 6) return null;
    return new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(degrees),
        width,
        arcType: Cesium.ArcType.GEODESIC,
        vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
      }),
    });
  }).filter(Boolean);
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
      const halo = primitive(doc.lines, 4.4, Cesium.Color.fromCssColorString('#001018').withAlpha(0.72));
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
