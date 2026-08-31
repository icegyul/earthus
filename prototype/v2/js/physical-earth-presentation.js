/* EARTHUS V2 — source-backed physical presentation for the default Earth view. */

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

export function terrainPresentationForHeight(heightM) {
  const height = Number(heightM);
  const t = smooth(((Number.isFinite(height) ? height : 10_800_000) - 900_000) / 9_900_000);
  return Object.freeze({
    verticalExaggeration: 1,
    detailImageryAlpha: Math.round((1 - 0.78 * t) * 100) / 100,
  });
}

export function physicalAmbientCamera({ mobile = false } = {}) {
  return Object.freeze({
    longitudeDeg: 112,
    latitudeDeg: mobile ? 14 : 18,
    heightM: mobile ? 16_200_000 : 14_500_000,
    headingDeg: -8,
    pitchDeg: mobile ? -82 : -80,
    rollDeg: 0,
  });
}

export class PhysicalEarthPresentationRuntime {
  constructor({ viewer, Cesium } = {}) {
    if (!viewer || viewer.isDestroyed?.()) throw new Error('PHYSICAL_EARTH_VIEWER_REQUIRED');
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.C = Cesium || globalThis.Cesium;
    this.mode = 'EARTH';
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
          source: `
            czm_material czm_getMaterial(czm_materialInput materialInput) {
              czm_material material = czm_getDefaultMaterial(materialInput);
              float height = max(materialInput.height, 0.0);
              float land = smoothstep(0.5, 30.0, height);
              float foothill = smoothstep(80.0, 1400.0, height);
              float alpine = smoothstep(1400.0, 4800.0, height);
              float slope = smoothstep(0.03, 0.72, materialInput.slope);
              float distanceClass = smoothstep(1800000.0, 12000000.0, length(materialInput.positionToEyeEC));
              vec3 low = vec3(0.048, 0.088, 0.058);
              vec3 mid = vec3(0.295, 0.298, 0.178);
              vec3 high = vec3(0.855, 0.862, 0.800);
              vec3 rock = vec3(0.235, 0.198, 0.152);
              vec3 tint = mix(mix(low, mid, foothill), high, alpine);
              tint = mix(tint, rock, slope * 0.38);
              material.diffuse = tint * (1.0 - slope * 0.30);
              float localAlpha = 0.10 + foothill * 0.08 + alpine * 0.12 + slope * 0.10;
              float globalAlpha = 0.68 + foothill * 0.10 + alpine * 0.12 + slope * 0.05;
              material.alpha = land * clamp(mix(localAlpha, globalAlpha, distanceClass), 0.0, 0.88);
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
    this.viewer.camera.setView({
      destination: this.C.Cartesian3.fromDegrees(
        camera.longitudeDeg,
        camera.latitudeDeg,
        camera.heightM,
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

  update() {
    if (this.mode !== 'EARTH') return;
    const height = this.viewer.camera.positionCartographic?.height;
    const policy = terrainPresentationForHeight(height);
    this.scene.verticalExaggeration = policy.verticalExaggeration;
    this.scene.requestRender();
  }

  snapshot() {
    const policy = terrainPresentationForHeight(this.viewer.camera.positionCartographic?.height);
    return Object.freeze({
      mode: this.mode,
      terrainScale: this.scene.verticalExaggeration,
      terrainScaleClass: 'ESRI_TERRAIN3D_SOURCE_SCALE_1X',
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
