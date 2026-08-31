import { volumeEligibility } from './cloud-state-contract.js';

function enuScaledMatrix(C, anchor, sizeM) {
  const centerHeight = (anchor.bottomM + anchor.topM) * 0.5;
  const origin = C.Cartesian3.fromDegrees(anchor.longitudeDeg, anchor.latitudeDeg, centerHeight);
  const enu = C.Transforms.eastNorthUpToFixedFrame(origin);
  const scale = C.Matrix4.fromScale(new C.Cartesian3(sizeM.eastWestM * 0.5, sizeM.northSouthM * 0.5, (anchor.topM - anchor.bottomM) * 0.5));
  return C.Matrix4.multiply(enu, scale, new C.Matrix4());
}

function createInlineProvider(C, inline) {
  const { dimensions, density, anchor, sizeM, encoding = 'FLOAT32_0_1' } = inline;
  const count = dimensions.x * dimensions.y * dimensions.z;
  if (density.length !== count) throw new TypeError('voxel density length mismatch');
  const useUint8 = encoding === 'UINT8_0_255';
  const metadata = useUint8 ? (density instanceof Uint8Array ? density : Uint8Array.from(density)) : (density instanceof Float32Array ? density : Float32Array.from(density));
  return {
    globalTransform: enuScaledMatrix(C, anchor, sizeM),
    shapeTransform: C.Matrix4.IDENTITY,
    shape: C.VoxelShapeType.BOX,
    minBounds: new C.Cartesian3(-1, -1, -1), maxBounds: new C.Cartesian3(1, 1, 1),
    dimensions: new C.Cartesian3(dimensions.x, dimensions.y, dimensions.z),
    paddingBefore: C.Cartesian3.ZERO, paddingAfter: C.Cartesian3.ZERO,
    names: ['density'], types: [C.MetadataType.SCALAR], componentTypes: [useUint8 ? C.MetadataComponentType.UINT8 : C.MetadataComponentType.FLOAT32],
    minimumValues: [[0]], maximumValues: [[useUint8 ? 255 : 1]], availableLevels: 1, maximumTileCount: 1,
    requestData({ tileLevel = 0, tileX = 0, tileY = 0, tileZ = 0 } = {}) {
      if (tileLevel !== 0 || tileX !== 0 || tileY !== 0 || tileZ !== 0) return undefined;
      return Promise.resolve(C.VoxelContent.fromMetadataArray([metadata]));
    }
  };
}

function cloudShader(C, encoding = 'FLOAT32_0_1') {
  const scale = encoding === 'UINT8_0_255' ? '0.003921568627451' : '1.0';
  return new C.CustomShader({
    fragmentShaderText: `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        float d = clamp(fsInput.metadata.density * ${scale}, 0.0, 1.0);
        float a = smoothstep(0.04, 0.38, d) * 0.46;
        vec3 shadowTone = vec3(0.70, 0.76, 0.82);
        vec3 sunTone = vec3(1.0, 0.99, 0.97);
        material.diffuse = mix(shadowTone, sunTone, smoothstep(0.12, 0.72, d));
        material.alpha = a;
      }
    `
  });
}

export class CesiumVoxelCloudRuntime {
  constructor({ viewer, Cesium, state, tilesetUrl = null, inline = null, scheduler, resourceLedger } = {}) {
    const eligible = volumeEligibility(state); if (!eligible.eligible) throw new Error(`CLOUD_VOLUME_BLOCKED_${eligible.reason}`);
    this.viewer = viewer; this.Cesium = Cesium; this.state = state; this.tilesetUrl = tilesetUrl; this.inline = inline; this.scheduler = scheduler; this.resourceLedger = resourceLedger;
    this.primitive = null; this.shader = null; this.visible = false; this.disposed = false; this.initialized = false;
  }
  async init() {
    if (this.initialized) return this;
    const C = this.Cesium;
    if (!C.VoxelPrimitive || !C.VoxelContent) throw new Error('CESIUM_VOXEL_RUNTIME_UNAVAILABLE');
    let provider;
    if (this.tilesetUrl) provider = await C.Cesium3DTilesVoxelProvider.fromUrl(this.tilesetUrl);
    else if (this.inline) provider = createInlineProvider(C, this.inline);
    else throw new TypeError('voxel tilesetUrl or inline data required');
    if (this.disposed) return this;
    this.shader = cloudShader(C, this.inline?.encoding ?? 'FLOAT32_0_1');
    this.primitive = this.viewer.scene.primitives.add(new C.VoxelPrimitive({ provider, customShader: this.shader, calculateStatistics: true }));
    this.primitive.show = this.visible; this.primitive.depthTest = true; this.initialized = true;
    this.scheduler?.request?.('cloud-voxel-init');
    return this;
  }
  setVisible(show) { this.visible = Boolean(show); if (this.primitive) { this.primitive.show = this.visible; this.primitive.disableUpdate = !this.visible; } this.scheduler?.request?.('cloud-voxel-visibility'); }
  applyQuality(profile) {
    if (!this.primitive) return;
    this.primitive.screenSpaceError = profile.cloud.voxelScreenSpaceError;
    this.primitive.stepSize = profile.cloud.voxelStepSize;
    this.#updateStatistics();
    this.scheduler?.request?.('cloud-voxel-quality');
  }
  #updateStatistics() {
    const bytes = this.primitive?.statistics?.texturesByteLength;
    if (Number.isFinite(bytes)) this.resourceLedger?.set?.('cloud-voxel-textures', bytes, { actual: true });
  }
  estimatedVoxelBytes() { this.#updateStatistics(); return this.resourceLedger?.snapshot?.().entries?.['cloud-voxel-textures']?.bytes ?? 0; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    if (this.primitive) this.viewer.scene.primitives.remove(this.primitive); this.primitive = null;
    if (this.shader && !this.shader.isDestroyed?.()) this.shader.destroy?.(); this.shader = null;
    this.resourceLedger?.delete?.('cloud-voxel-textures'); this.scheduler?.request?.('cloud-voxel-dispose');
  }
}
