/* EARTHUS V2 — device-safe layered rendering derived only from real GFS volume bytes. */

const BANDS = Object.freeze([
  Object.freeze({ id: 'LOW', minM: -Infinity, maxM: 3000, color: [0.91, 0.93, 0.95] }),
  Object.freeze({ id: 'MID', minM: 3000, maxM: 7000, color: [0.96, 0.97, 0.98] }),
  Object.freeze({ id: 'HIGH', minM: 7000, maxM: Infinity, color: [1, 0.995, 0.985] }),
]);

export const REAL_CLOUD_FIDELITY_LADDER = Object.freeze([
  'GLOBAL_LAYERED',
  'VOLUME',
  'LAYERED',
  'CTH_RELIEF',
  'OFF',
]);

export function assessCloudManifestFreshness(manifest, {
  nowMs = Date.now(),
  maximumAgeMs = 18 * 60 * 60 * 1000,
  futureToleranceMs = 30 * 60 * 1000,
} = {}) {
  const validAtMs = Date.parse(manifest?.cloudState?.validAt);
  if (!Number.isFinite(validAtMs)) throw new Error('GFS_LAYERED_VALID_AT');
  const ageMs = Number(nowMs) - validAtMs;
  if (!Number.isFinite(ageMs)) throw new Error('GFS_LAYERED_NOW');
  if (ageMs < -futureToleranceMs) throw new Error(`GFS_LAYERED_FUTURE:${ageMs}`);
  if (ageMs > maximumAgeMs) throw new Error(`GFS_LAYERED_STALE:${ageMs}`);
  return Object.freeze({
    status: 'CURRENT_MODEL_ANALYSIS',
    validAt: new Date(validAtMs).toISOString(),
    ageMs,
  });
}

export function validateLayeredCloudManifest(manifest) {
  const d = manifest?.dimensions;
  const bounds = manifest?.boundsDegrees;
  const state = manifest?.cloudState;
  const count = Number(d?.x) * Number(d?.y) * Number(d?.z);
  if (manifest?.ready !== true || manifest?.production !== true || manifest?.synthetic === true
    || manifest?.encoding !== 'UINT8_0_255'
    || state?.truthClass !== 'MODELLED_NWP'
    || state?.sourceId !== 'NOAA_NCEP_GFS_0P50_NOMADS'
    || state?.volume?.densityReady !== true
    || state?.volume?.verticalStructureReady !== true) {
    throw new Error('GFS_LAYERED_TRUTH_GATE');
  }
  if (!Number.isInteger(d?.x) || !Number.isInteger(d?.y) || !Number.isInteger(d?.z)
    || count <= 0 || count > 4 * 1024 * 1024
    || Number(manifest.byteLength) !== count) {
    throw new Error('GFS_LAYERED_DIMENSION_GATE');
  }
  if (!Array.isArray(manifest.altitudeAxisM) || manifest.altitudeAxisM.length !== d.z
    || !manifest.altitudeAxisM.every(Number.isFinite)) {
    throw new Error('GFS_LAYERED_ALTITUDE_GATE');
  }
  if (!bounds || ![bounds.west, bounds.east, bounds.south, bounds.north].every(Number.isFinite)
    || bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new Error('GFS_LAYERED_BOUNDS_GATE');
  }
  if (!Number.isFinite(Date.parse(state.validAt))) throw new Error('GFS_LAYERED_VALID_AT');
  return manifest;
}

export function deriveLayeredCloudFields(manifest, density) {
  validateLayeredCloudManifest(manifest);
  const { x, y, z } = manifest.dimensions;
  const expected = x * y * z;
  if (!(density instanceof Uint8Array) || density.length !== expected) {
    throw new Error(`GFS_LAYERED_DENSITY_LENGTH:${density?.length || 0}:${expected}`);
  }
  const plane = x * y;
  const layers = BANDS.map(band => {
    const indices = manifest.altitudeAxisM
      .map((altitudeM, index) => ({ altitudeM, index }))
      .filter(item => item.altitudeM >= band.minM && item.altitudeM < band.maxM);
    if (!indices.length) throw new Error(`GFS_LAYERED_EMPTY_BAND:${band.id}`);
    const alpha = new Uint8Array(plane);
    for (const { index } of indices) {
      const offset = index * plane;
      for (let i = 0; i < plane; i++) alpha[i] = Math.max(alpha[i], density[offset + i]);
    }
    let sum = 0, maximum = 0, covered = 0;
    for (const value of alpha) {
      sum += value;
      maximum = Math.max(maximum, value);
      if (value > 8) covered += 1;
    }
    return Object.freeze({
      id: band.id,
      altitudeM: Math.round(indices.reduce((sum, item) => sum + item.altitudeM, 0) / indices.length),
      alpha,
      color: Object.freeze([...band.color]),
      maximumDensity: maximum,
      meanDensity: Math.round(sum / Math.max(1, alpha.length) * 1000) / 1000,
      coverage: Math.round(covered / Math.max(1, alpha.length) * 1_000_000) / 1_000_000,
    });
  });
  return Object.freeze({
    truthClass: 'MODELLED_NWP_LAYERED',
    sourceId: manifest.cloudState.sourceId,
    validAt: manifest.cloudState.validAt,
    boundsDegrees: Object.freeze({ ...manifest.boundsDegrees }),
    dimensions: Object.freeze({ x, y }),
    layers: Object.freeze(layers),
  });
}

function layerCanvas(layer, dimensions) {
  const source = document.createElement('canvas');
  source.width = dimensions.x;
  source.height = dimensions.y;
  const context = source.getContext('2d');
  if (!context) throw new Error('GFS_LAYERED_CANVAS_CONTEXT');
  const image = context.createImageData(dimensions.x, dimensions.y);
  for (let southY = 0; southY < dimensions.y; southY++) {
    const northY = dimensions.y - 1 - southY;
    for (let x = 0; x < dimensions.x; x++) {
      const source = southY * dimensions.x + x;
      const target = (northY * dimensions.x + x) * 4;
      const density = layer.alpha[source] / 255;
      const optical = Math.pow(Math.max(0, (density - 0.025) / 0.975), 0.86);
      const edgePixels = Math.min(x, dimensions.x - 1 - x, southY, dimensions.y - 1 - southY);
      const edgeT = Math.max(0, Math.min(1, edgePixels / 5));
      const edgeFade = edgeT * edgeT * (3 - 2 * edgeT);
      image.data[target] = Math.round(layer.color[0] * 255);
      image.data[target + 1] = Math.round(layer.color[1] * 255);
      image.data[target + 2] = Math.round(layer.color[2] * 255);
      image.data[target + 3] = Math.round(optical * edgeFade * 96);
    }
  }
  context.putImageData(image, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.x * 4;
  canvas.height = dimensions.y * 4;
  const output = canvas.getContext('2d');
  if (!output) throw new Error('GFS_LAYERED_OUTPUT_CANVAS_CONTEXT');
  output.imageSmoothingEnabled = true;
  output.imageSmoothingQuality = 'high';
  output.filter = 'blur(1.25px)';
  output.drawImage(source, 0, 0, canvas.width, canvas.height);
  output.filter = 'none';
  return canvas;
}

function primitiveForLayer(viewer, C, field, layer) {
  const bounds = field.boundsDegrees;
  const material = C.Material.fromType('Image', {
    image: layerCanvas(layer, field.dimensions),
    repeat: new C.Cartesian2(1, 1),
    color: C.Color.WHITE,
    transparent: true,
  });
  const primitive = viewer.scene.primitives.add(new C.Primitive({
    geometryInstances: new C.GeometryInstance({
      geometry: new C.RectangleGeometry({
        rectangle: C.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
        height: layer.altitudeM,
        granularity: C.Math.toRadians(0.5),
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
    show: true,
  }));
  primitive.__earthusV2GfsLayeredCloud = layer.id;
  return primitive;
}

export class GfsCloudLayeredFallbackRuntime {
  constructor({ viewer, Cesium, baseUrl = '/clouds/gfs/volume/east-asia' } = {}) {
    if (!viewer || viewer.isDestroyed?.()) throw new Error('GFS_LAYERED_VIEWER_REQUIRED');
    this.viewer = viewer;
    this.C = Cesium || globalThis.Cesium;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.primitives = [];
    this.field = null;
    this.manifest = null;
    this.generation = 0;
    this.freshness = null;
    this.loadDurationMs = null;
    this.error = null;
  }

  async load({ force = false } = {}) {
    const generation = ++this.generation;
    const startedAt = performance.now();
    if (this.primitives.length && !force) return this.snapshot();
    const manifestResponse = await fetch(`${this.baseUrl}/manifest.json?t=${Date.now()}`, { cache: 'no-cache' });
    if (!manifestResponse.ok) throw new Error(`GFS_LAYERED_MANIFEST_${manifestResponse.status}`);
    const manifest = validateLayeredCloudManifest(await manifestResponse.json());
    const freshness = assessCloudManifestFreshness(manifest);
    const densityResponse = await fetch(new URL(manifest.densityUrl, `${location.origin}${this.baseUrl}/`).href,
      { cache: 'no-cache' });
    if (!densityResponse.ok) throw new Error(`GFS_LAYERED_DENSITY_${densityResponse.status}`);
    const bytes = new Uint8Array(await densityResponse.arrayBuffer());
    if (generation !== this.generation) return null;
    const field = deriveLayeredCloudFields(manifest, bytes);
    this.dispose({ preserveGeneration: true });
    this.manifest = manifest;
    this.freshness = freshness;
    this.field = field;
    this.primitives = field.layers.map(layer => primitiveForLayer(this.viewer, this.C, field, layer));
    this.viewer.scene.requestRender();
    this.loadDurationMs = Math.round(performance.now() - startedAt);
    this.error = null;
    return this.snapshot();
  }

  async show() {
    try {
      if (!this.primitives.length) await this.load();
      for (const primitive of this.primitives) primitive.show = true;
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

  snapshot() {
    if (!this.field) return null;
    return Object.freeze({
      ready: true,
      truthClass: this.field.truthClass,
      sourceId: this.field.sourceId,
      validAt: this.field.validAt,
      freshness: this.freshness,
      synthetic: false,
      scope: 'BOUNDED_REGION',
      boundsDegrees: this.field.boundsDegrees,
      dimensions: this.manifest?.dimensions || null,
      byteLength: this.manifest?.byteLength || null,
      densityMeaning: this.manifest?.densityMeaning || null,
      layerCount: this.primitives.length,
      visible: this.primitives.some(primitive => primitive.show === true),
      renderModel: 'REAL_GFS_VERTICAL_COLUMNS_COLLAPSED_TO_ZERO_THICKNESS_ALTITUDE_PLANES_WITH_PRESENTATION_ONLY_INTERPOLATION',
      texturePresentation: '4X_LINEAR_INTERPOLATION_EDGE_FEATHER_NO_DENSITY_INVENTION',
      fakeThickness: false,
      loadDurationMs: this.loadDurationMs,
      error: this.error,
      layers: this.field.layers.map(layer => Object.freeze({
        id: layer.id,
        altitudeM: layer.altitudeM,
        maximumDensity: layer.maximumDensity,
        meanDensity: layer.meanDensity,
        coverage: layer.coverage,
      })),
    });
  }

  dispose({ preserveGeneration = false } = {}) {
    if (!preserveGeneration) this.generation++;
    for (const primitive of this.primitives) {
      try { this.viewer.scene.primitives.remove(primitive); } catch (_) {}
    }
    this.primitives = [];
    this.field = null;
    this.manifest = null;
    this.freshness = null;
    this.loadDurationMs = null;
  }
}
