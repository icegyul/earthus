/* EARTHUS V2 — global low-LOD cloud planes from real NOAA GFS TCDC + HGT. */

const EXPECTED_LAYER_IDS = Object.freeze(['LOW', 'MID', 'HIGH']);
const MAX_AGE_MS = 18 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 30 * 60 * 1000;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function validateGlobalCloudManifest(manifest, {
  allowLocalArtifact = false,
  nowMs = Date.now(),
  maximumAgeMs = MAX_AGE_MS,
} = {}) {
  if (manifest?.schemaVersion !== 'earthus.cloud.global-layered.v1'
    || manifest?.ready !== true
    || manifest?.synthetic === true
    || manifest?.encoding !== 'UINT8_0_255_BAND_MAJOR'
    || manifest?.cloudState?.truthClass !== 'MODELLED_NWP_GLOBAL_LAYERED'
    || manifest?.cloudState?.sourceId !== 'NOAA_NCEP_GFS_1P00_NOMADS'
    || manifest?.cloudState?.forecastStepHours !== 0
    || manifest?.cloudState?.analysisNotForecast !== true
    || manifest?.cloudState?.verticalStructureReady !== true
    || manifest?.sourceGrid !== 'NOAA_GFS_1P00_ANALYSIS') {
    throw new Error('GFS_GLOBAL_TRUTH_GATE');
  }
  let deploymentState = 'PRODUCTION_DEPLOYED';
  if (manifest.production !== true) {
    if (!allowLocalArtifact
      || manifest.artifactState !== 'LOCAL_GENERATED_FROM_LIVE_NOAA_SOURCE'
      || manifest.deploymentEvidence !== null) {
      throw new Error('GFS_GLOBAL_PRODUCTION_GATE');
    }
    deploymentState = 'LOCAL_NOT_DEPLOYED';
  }
  const dimensions = manifest.dimensions;
  const count = Number(dimensions?.x) * Number(dimensions?.y) * Number(dimensions?.bands);
  if (!Number.isInteger(dimensions?.x) || !Number.isInteger(dimensions?.y)
    || dimensions?.bands !== 3 || dimensions.x < 350 || dimensions.x > 361
    || dimensions.y < 179 || dimensions.y > 181
    || count <= 0 || count > 512 * 1024 || Number(manifest.byteLength) !== count) {
    throw new Error('GFS_GLOBAL_DIMENSION_GATE');
  }
  const bounds = manifest.boundsDegrees;
  if (bounds?.west !== -180 || bounds?.east !== 180
    || bounds?.south !== -90 || bounds?.north !== 90) {
    throw new Error('GFS_GLOBAL_BOUNDS_GATE');
  }
  if (manifest.renderContract !== 'ZERO_THICKNESS_PLANES_NO_FAKE_CLOUD_VOLUME'
    || manifest.fakeThickness !== false) {
    throw new Error('GFS_GLOBAL_RENDER_CONTRACT');
  }
  if (!Array.isArray(manifest.layers) || manifest.layers.length !== 3
    || manifest.layers.some((layer, index) => layer?.id !== EXPECTED_LAYER_IDS[index]
      || !Number.isFinite(Number(layer.representativeAltitudeM)))
    || !(manifest.layers[0].representativeAltitudeM < manifest.layers[1].representativeAltitudeM
      && manifest.layers[1].representativeAltitudeM < manifest.layers[2].representativeAltitudeM)) {
    throw new Error('GFS_GLOBAL_LAYER_GATE');
  }
  const validAtMs = Date.parse(manifest.cloudState.validAt);
  if (!Number.isFinite(validAtMs)) throw new Error('GFS_GLOBAL_VALID_AT');
  const ageMs = Number(nowMs) - validAtMs;
  if (!Number.isFinite(ageMs)) throw new Error('GFS_GLOBAL_NOW');
  if (ageMs < -FUTURE_TOLERANCE_MS) throw new Error(`GFS_GLOBAL_FUTURE:${ageMs}`);
  if (ageMs > maximumAgeMs) throw new Error(`GFS_GLOBAL_STALE:${ageMs}`);
  return Object.freeze({
    manifest,
    deploymentState,
    freshness: Object.freeze({
      status: 'CURRENT_MODEL_ANALYSIS',
      validAt: new Date(validAtMs).toISOString(),
      ageMs,
    }),
  });
}

export function splitGlobalCloudDensity(manifest, bytes) {
  const { x, y, bands } = manifest.dimensions;
  const planeLength = x * y;
  const expected = planeLength * bands;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== expected)
    throw new Error(`GFS_GLOBAL_DENSITY_LENGTH:${bytes?.byteLength || 0}:${expected}`);
  return Object.freeze(manifest.layers.map((layer, index) => Object.freeze({
    ...layer,
    density: bytes.slice(index * planeLength, (index + 1) * planeLength),
  })));
}

export function globalCloudVisible({
  mode = 'EARTH',
  cameraHeightM = Infinity,
  minimumVisibleHeightM = 5_000_000,
} = {}) {
  return mode === 'EARTH' && cameraHeightM >= minimumVisibleHeightM;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

function cloudCanvas(layer, dimensions) {
  const { x: width, y: height } = dimensions;
  const source = document.createElement('canvas');
  source.width = width + 1;
  source.height = height;
  const context = source.getContext('2d');
  if (!context) throw new Error('GFS_GLOBAL_CANVAS_CONTEXT');
  const image = context.createImageData(source.width, source.height);
  const colors = {
    LOW: [224, 232, 239],
    MID: [239, 243, 247],
    HIGH: [255, 252, 246],
  };
  const alphaCeiling = { LOW: 40, MID: 44, HIGH: 48 }[layer.id] || 44;
  const color = colors[layer.id] || colors.MID;
  for (let southY = 0; southY < height; southY += 1) {
    const northY = height - 1 - southY;
    const latitude = -90 + (southY / Math.max(1, height - 1)) * 180;
    const polarFade = clamp((90 - Math.abs(latitude)) / 3);
    for (let outputX = 0; outputX <= width; outputX += 1) {
      const sourceX = outputX === width ? 0 : outputX;
      const sourceIndex = southY * width + sourceX;
      const target = (northY * source.width + outputX) * 4;
      const density = layer.density[sourceIndex] / 255;
      const optical = Math.pow(clamp((density - 0.055) / 0.945), 1.05);
      image.data[target] = color[0];
      image.data[target + 1] = color[1];
      image.data[target + 2] = color[2];
      image.data[target + 3] = Math.round(optical * polarFade * alphaCeiling);
    }
  }
  context.putImageData(image, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = source.width * 3;
  canvas.height = source.height * 3;
  const output = canvas.getContext('2d');
  if (!output) throw new Error('GFS_GLOBAL_OUTPUT_CANVAS_CONTEXT');
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = 'high';
  output.filter = 'blur(1.4px)';
  output.drawImage(source, 0, 0, canvas.width, canvas.height);
  output.filter = 'none';
  return canvas;
}

function primitiveForLayer(viewer, C, layer, dimensions) {
  const material = C.Material.fromType('Image', {
    image: cloudCanvas(layer, dimensions),
    repeat: new C.Cartesian2(1, 1),
    color: C.Color.WHITE,
    transparent: true,
  });
  const primitive = viewer.scene.primitives.add(new C.Primitive({
    geometryInstances: new C.GeometryInstance({
      geometry: new C.RectangleGeometry({
        rectangle: C.Rectangle.fromDegrees(-180, -89.999, 180, 89.999),
        height: layer.representativeAltitudeM,
        granularity: C.Math.toRadians(1.5),
        vertexFormat: C.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }),
    }),
    appearance: new C.EllipsoidSurfaceAppearance({
      aboveGround: true,
      faceForward: true,
      translucent: true,
      material,
      renderState: {
        depthTest: { enabled: true },
        depthMask: false,
        cull: { enabled: true, face: C.CullFace.BACK },
      },
    }),
    asynchronous: false,
    allowPicking: false,
    show: false,
  }));
  primitive.__earthusV2GfsGlobalLowCloud = layer.id;
  return primitive;
}

export class GfsCloudGlobalLowRuntime {
  constructor({
    viewer,
    Cesium,
    baseUrl = '/clouds/gfs/global-low',
    allowLocalArtifact = false,
    minimumVisibleHeightM = 5_000_000,
  } = {}) {
    if (!viewer || viewer.isDestroyed?.()) throw new Error('GFS_GLOBAL_VIEWER_REQUIRED');
    this.viewer = viewer;
    this.C = Cesium || globalThis.Cesium;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.allowLocalArtifact = allowLocalArtifact;
    this.minimumVisibleHeightM = minimumVisibleHeightM;
    this.mode = 'EARTH';
    this.primitives = [];
    this.manifest = null;
    this.freshness = null;
    this.deploymentState = null;
    this.densitySha256 = null;
    this.loadDurationMs = null;
    this.error = null;
    this.generation = 0;
    this.removeCameraChanged = null;
  }

  async load({ force = false } = {}) {
    if (this.primitives.length && !force) return this.snapshot();
    const generation = ++this.generation;
    const startedAt = performance.now();
    const manifestResponse = await fetch(`${this.baseUrl}/manifest.json?t=${Date.now()}`, {
      cache: 'no-cache',
    });
    if (!manifestResponse.ok) throw new Error(`GFS_GLOBAL_MANIFEST_${manifestResponse.status}`);
    const validated = validateGlobalCloudManifest(await manifestResponse.json(), {
      allowLocalArtifact: this.allowLocalArtifact,
    });
    const manifest = validated.manifest;
    const densityResponse = await fetch(
      new URL(manifest.densityUrl, `${location.origin}${this.baseUrl}/`).href,
      { cache: 'no-cache' },
    );
    if (!densityResponse.ok) throw new Error(`GFS_GLOBAL_DENSITY_${densityResponse.status}`);
    const buffer = await densityResponse.arrayBuffer();
    if (generation !== this.generation) return null;
    const bytes = new Uint8Array(buffer);
    const densitySha256 = await sha256Hex(buffer);
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.densitySha256 || ''))
      || densitySha256 !== manifest.densitySha256) {
      throw new Error(`GFS_GLOBAL_DENSITY_HASH:${densitySha256}`);
    }
    const layers = splitGlobalCloudDensity(manifest, bytes);
    this.dispose({ preserveGeneration: true });
    this.manifest = manifest;
    this.freshness = validated.freshness;
    this.deploymentState = validated.deploymentState;
    this.densitySha256 = densitySha256;
    this.primitives = layers.map(layer => primitiveForLayer(
      this.viewer, this.C, layer, manifest.dimensions,
    ));
    this.loadDurationMs = Math.round(performance.now() - startedAt);
    this.error = null;
    if (!this.removeCameraChanged) {
      this.removeCameraChanged = this.viewer.camera.changed.addEventListener(
        () => this.updateVisibility(),
      );
    }
    this.updateVisibility();
    this.viewer.scene.requestRender();
    return this.snapshot();
  }

  async show() {
    try {
      this.mode = 'EARTH';
      if (!this.primitives.length) await this.load();
      this.updateVisibility();
      this.viewer.scene.requestRender();
      return this.snapshot();
    } catch (error) {
      this.error = String(error?.message || error);
      throw error;
    }
  }

  hide() {
    for (const primitive of this.primitives) primitive.show = false;
    this.viewer.scene.requestRender();
  }

  setMode(mode) {
    this.mode = mode;
    this.updateVisibility();
    this.viewer.scene.requestRender();
  }

  updateVisibility() {
    const visible = globalCloudVisible({
      mode: this.mode,
      cameraHeightM: this.viewer.camera.positionCartographic?.height ?? Infinity,
      minimumVisibleHeightM: this.minimumVisibleHeightM,
    });
    for (const primitive of this.primitives) primitive.show = visible;
    this.viewer.scene.requestRender();
    return visible;
  }

  snapshot() {
    if (!this.manifest) return null;
    return Object.freeze({
      ready: this.primitives.length === 3,
      truthClass: this.manifest.cloudState.truthClass,
      sourceId: this.manifest.cloudState.sourceId,
      validAt: this.manifest.cloudState.validAt,
      forecastStepHours: this.manifest.cloudState.forecastStepHours,
      analysisNotForecast: this.manifest.cloudState.analysisNotForecast,
      freshness: this.freshness,
      production: this.manifest.production,
      deploymentState: this.deploymentState,
      synthetic: false,
      scope: 'GLOBAL',
      lod: 'LOW',
      boundsDegrees: this.manifest.boundsDegrees,
      dimensions: this.manifest.dimensions,
      byteLength: this.manifest.byteLength,
      densitySha256: this.densitySha256,
      fakeThickness: false,
      renderModel: 'GLOBAL_ZERO_THICKNESS_GFS_HGT_ALTITUDE_PLANES',
      texturePresentation: '3X_LINEAR_INTERPOLATION_DATELINE_SEAM_DUPLICATE',
      minimumVisibleHeightM: this.minimumVisibleHeightM,
      mode: this.mode,
      visible: this.primitives.some(primitive => primitive.show === true),
      primitiveCount: this.primitives.length,
      loadDurationMs: this.loadDurationMs,
      error: this.error,
      layers: this.manifest.layers.map(layer => Object.freeze({
        id: layer.id,
        representativeAltitudeM: layer.representativeAltitudeM,
        maximumDensity: layer.maximumDensity,
        meanDensity: layer.meanDensity,
        coverage: layer.coverage,
      })),
    });
  }

  dispose({ preserveGeneration = false } = {}) {
    if (!preserveGeneration) this.generation += 1;
    try { this.removeCameraChanged?.(); } catch (_) {}
    this.removeCameraChanged = null;
    for (const primitive of this.primitives) {
      try { this.viewer.scene.primitives.remove(primitive); } catch (_) {}
    }
    this.primitives = [];
    this.manifest = null;
    this.freshness = null;
    this.deploymentState = null;
    this.densitySha256 = null;
    this.loadDurationMs = null;
    this.viewer.scene.requestRender();
  }
}
