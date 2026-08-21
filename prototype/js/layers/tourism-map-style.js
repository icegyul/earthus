// 관광 흐름 전용 도시 지도.
//
// 첫 Earth View의 위성·구름 레이어를 건드리지 않는다. 관광 레이어가 실제로 보일 때만
// Esri Dark Gray Canvas를 올리고, 끄면 즉시 제거한다.
// 별도 지명 reference 타일은 경사 시점에서 글자가 거대하게 늘어나므로 올리지 않는다.
// Cesium 기본 credit 영역은 앱에서 숨겨져 있으므로 화면 UI에도 같은 출처를 명시한다.

import { viewer } from '../viewer.js';

const DARK_BASE = 'https://services.arcgisonline.com/ArcGIS/rest/services/'
  + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const CREDIT = 'Esri, HERE, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS user community';

export const tourismMapStyle = {
  base: null,

  set(on) {
    if (!viewer?.imageryLayers) return;
    if (!on) return this.remove();
    if (!this.base) {
      this.base = viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: DARK_BASE,
          maximumLevel: 19,
          credit: CREDIT,
        }),
      );
      // 위성 질감이나 밝은 지형이 기둥의 밀도 판독을 방해하지 않도록 완전히 덮는다.
      this.base.alpha = 1;
      this.base.brightness = 0.72;
      this.base.contrast = 1.18;
      this.base.gamma = 0.92;
    }
    viewer.scene.requestRender?.();
  },

  remove() {
    for (const layer of [this.base]) {
      if (!layer) continue;
      try { viewer.imageryLayers.remove(layer, true); } catch (_) { }
    }
    this.base = null;
    viewer?.scene?.requestRender?.();
  },
};
