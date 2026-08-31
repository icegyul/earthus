/* EARTHUS V2 — source-backed physical presentation for the default Earth view. */

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/* 표면 스타일 (정본 §0.6: 사실적인 지구와 과학 시각화를 동시에 유지)
 * - REAL: 정돈된 반사실적 지구 — 사진 albedo가 실측 3D 지오메트리 위에서
 *   주도한다 (0A.3 허용 용도). 첫 화면 기본.
 * - DATA: 구운 데이터 지도가 주도한다. 인텔리전스/레이어 분석용. */
export const PRESENTATION_STYLES = Object.freeze(['REAL', 'DATA']);

export function terrainPresentationForHeight(heightM, style = 'REAL') {
  const height = Number(heightM);
  const h = Number.isFinite(height) ? height : 10_800_000;
  const t = smooth((h - 450_000) / 1_100_000);
  const deep = smooth((h - 2_000_000) / 8_000_000);
  /* 실제 지구 비율(반지름 대비 최고봉 0.14%)에서는 원거리 실루엣이 물리적으로
   * 보이지 않는다. 원거리 한정 표기된 지형 강조를 적용하고 배지·스냅샷에
   * 배율을 그대로 노출한다. 근접(≤450km)은 항상 실축 1.0×다. */
  const verticalExaggeration = Math.round((1 + 0.6 * t + 0.6 * deep) * 100) / 100;
  const detailImageryAlpha = style === 'DATA'
    ? Math.round((1 - 0.94 * t) * 100) / 100
    : Math.round((1 - 0.55 * smooth((h - 900_000) / 9_900_000)) * 100) / 100;
  return Object.freeze({
    style,
    verticalExaggeration,
    verticalExaggerationClass: verticalExaggeration === 1
      ? 'ESRI_TERRAIN3D_SOURCE_SCALE_1X'
      : `ESRI_TERRAIN3D_LABELED_PRESENTATION_SCALE_${verticalExaggeration}X`,
    detailImageryAlpha,
  });
}

/* 1.0의 setAmbientView(127, 25, 0.52)와 동일한 시점 계약 (PD 2026-09-01:
 * 기울어진 부감이 북반구로 쏠려 조작이 어려움 → 1.0 수직 정면 시점으로 통일).
 * 고도는 지구가 화면 세로의 globeFraction을 차지하도록 화면적응 계산한다. */
export function physicalAmbientCamera({ mobile = false } = {}) {
  return Object.freeze({
    longitudeDeg: 127,
    latitudeDeg: 25,
    globeFraction: mobile ? 0.6 : 0.52,
    fallbackHeightM: 20_000_000,
    headingDeg: 0,
    pitchDeg: -90,
    rollDeg: 0,
  });
}

export function fitGlobeHeightM({ fovRad, aspect, fraction }) {
  const R = 6_371_000;
  const fovY = aspect > 1
    ? 2 * Math.atan(Math.tan(fovRad / 2) / aspect)
    : fovRad;
  const sin = Math.sin((fovY * fraction) / 2);
  if (!(sin > 0) || sin >= 1) return 24_000_000;
  return Math.max(8_000_000, R / sin - R);
}

export class PhysicalEarthPresentationRuntime {
  constructor({ viewer, Cesium } = {}) {
    if (!viewer || viewer.isDestroyed?.()) throw new Error('PHYSICAL_EARTH_VIEWER_REQUIRED');
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.C = Cesium || globalThis.Cesium;
    this.mode = 'EARTH';
    this.style = 'REAL';
    this.reliefMaterial = null;
    this.removeCameraChanged = null;
    this.original = Object.freeze({
      material: this.scene.globe.material,
      verticalExaggeration: this.scene.verticalExaggeration,
      verticalExaggerationRelativeHeight: this.scene.verticalExaggerationRelativeHeight,
    });
  }

  install() {
    if (!this.reliefMaterial) {
      this.reliefMaterial = new this.C.Material({
        fabric: {
          type: 'EarthusTerrainRelief',
          uniforms: { dataStyle: this.style === 'DATA' ? 1.0 : 0.0 },
          source: `
            czm_material czm_getMaterial(czm_materialInput materialInput) {
              czm_material material = czm_getDefaultMaterial(materialInput);
              float height = max(materialInput.height, 0.0);
              float land = smoothstep(0.5, 30.0, height);
              float foothill = smoothstep(80.0, 1400.0, height);
              float alpine = smoothstep(1400.0, 4800.0, height);
              float slope = smoothstep(0.03, 0.72, materialInput.slope);
              float distanceClass = smoothstep(350000.0, 2200000.0, length(materialInput.positionToEyeEC));
              float slopeAngle = materialInput.slope * 1.5707963;
              float hillshade = clamp(
                cos(0.7853982) * cos(slopeAngle)
                + sin(0.7853982) * sin(slopeAngle) * cos(5.4977871 - materialInput.aspect),
                0.0, 1.0);
              float shade = mix(1.0, 0.30 + 0.85 * hillshade, distanceClass);
              vec3 low = vec3(0.048, 0.088, 0.058);
              vec3 mid = vec3(0.295, 0.298, 0.178);
              vec3 high = vec3(0.855, 0.862, 0.800);
              vec3 rock = vec3(0.235, 0.198, 0.152);
              vec3 tint = mix(mix(low, mid, foothill), high, alpine);
              tint = mix(tint, rock, slope * 0.38);
              material.diffuse = tint * (1.0 - slope * 0.18) * shade;
              float localAlpha = 0.10 + foothill * 0.08 + alpine * 0.12 + slope * 0.10;
              float realGlobalAlpha = 0.34 + foothill * 0.10 + alpine * 0.12 + slope * 0.08;
              float dataGlobalAlpha = 0.24 + foothill * 0.08 + alpine * 0.10 + slope * 0.05;
              float globalAlpha = mix(realGlobalAlpha, dataGlobalAlpha, dataStyle);
              float alphaCap = mix(0.62, 0.50, dataStyle);
              material.alpha = land * clamp(mix(localAlpha, globalAlpha, distanceClass), 0.0, alphaCap);
              float contourCoord = height / 500.0;
              float contourDistance = min(fract(contourCoord), 1.0 - fract(contourCoord));
              float contourWidth = max(fwidth(contourCoord) * 1.35, 0.012);
              float contour = 1.0 - smoothstep(contourWidth, contourWidth * 2.2, contourDistance);
              material.emission = vec3(0.48, 0.62, 0.53) * contour * land * distanceClass * 0.12;
              return material;
            }
          `,
        },
      });
      this.reliefMaterial.__earthusV2Source = 'ESRI_TERRAIN3D_HEIGHT_SLOPE';
      this.reliefMaterial.__earthusV2TextureSamplers = 0;
    }
    if (!this.removeCameraChanged) {
      this.removeCameraChanged = this.viewer.camera.changed.addEventListener(() => this.update());
    }
    this.setMode('EARTH');
    return this.snapshot();
  }

  setAmbientCamera() {
    const mobile = matchMedia('(max-width:760px)').matches;
    const camera = physicalAmbientCamera({ mobile });
    let heightM = camera.fallbackHeightM;
    try {
      heightM = fitGlobeHeightM({
        fovRad: this.viewer.camera.frustum.fov,
        aspect: this.scene.canvas.clientWidth / this.scene.canvas.clientHeight,
        fraction: camera.globeFraction,
      });
    } catch (_) {}
    this.viewer.camera.setView({
      destination: this.C.Cartesian3.fromDegrees(
        camera.longitudeDeg,
        camera.latitudeDeg,
        heightM,
      ),
      orientation: {
        heading: this.C.Math.toRadians(camera.headingDeg),
        pitch: this.C.Math.toRadians(camera.pitchDeg),
        roll: this.C.Math.toRadians(camera.rollDeg),
      },
    });
    this.update();
    return camera;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'EARTH') {
      this.scene.globe.material = this.reliefMaterial;
      this.scene.verticalExaggerationRelativeHeight = 0;
      this.update();
    } else {
      this.scene.globe.material = this.original.material;
      this.scene.verticalExaggeration = 1;
      this.scene.verticalExaggerationRelativeHeight = 0;
    }
    this.scene.requestRender();
  }

  setStyle(style) {
    this.style = PRESENTATION_STYLES.includes(style) ? style : 'REAL';
    if (this.reliefMaterial)
      this.reliefMaterial.uniforms.dataStyle = this.style === 'DATA' ? 1.0 : 0.0;
    this.update();
    return this.style;
  }

  update() {
    if (this.mode !== 'EARTH') return;
    const height = this.viewer.camera.positionCartographic?.height;
    const policy = terrainPresentationForHeight(height, this.style);
    this.scene.verticalExaggeration = policy.verticalExaggeration;
    this.scene.requestRender();
  }

  snapshot() {
    const policy = terrainPresentationForHeight(
      this.viewer.camera.positionCartographic?.height,
      this.style,
    );
    return Object.freeze({
      mode: this.mode,
      presentationStyle: this.style,
      terrainScale: policy.verticalExaggeration,
      appliedTerrainScale: this.scene.verticalExaggeration,
      terrainScaleClass: policy.verticalExaggerationClass,
      maximumScreenSpaceError: this.scene.globe.maximumScreenSpaceError,
      detailImageryAlpha: policy.detailImageryAlpha,
      oceanMaterial: null,
      reliefMaterialSource: this.reliefMaterial?.__earthusV2Source || null,
      reliefMaterialTextureSamplers: this.reliefMaterial?.__earthusV2TextureSamplers ?? null,
      cameraHeightM: this.viewer.camera.positionCartographic?.height ?? null,
    });
  }

  dispose() {
    try { this.removeCameraChanged?.(); } catch (_) {}
    this.removeCameraChanged = null;
    this.scene.globe.material = this.original.material;
    this.scene.verticalExaggeration = this.original.verticalExaggeration;
    this.scene.verticalExaggerationRelativeHeight = this.original.verticalExaggerationRelativeHeight;
    try { this.reliefMaterial?.destroy?.(); } catch (_) {}
    this.reliefMaterial = null;
    this.scene.requestRender();
  }
}
