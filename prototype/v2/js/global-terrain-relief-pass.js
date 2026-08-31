/* EARTHUS V2 — source-backed global low-LOD terrain material.
 *
 * Provider height is sampled at a bounded Cesium terrain LOD and converted to
 * a small hillshade/hypsometric material. The material never changes terrain
 * geometry, camera height or scientific elevation. Raster bytes are a derived
 * material input layered on the existing 1× Terrain3D geometry.
 */

const SOURCE_ID = 'ESRI_WORLDELEVATION3D_TERRAIN3D';
const TRUTH_CLASS = 'PROVIDER_DERIVED_TERRAIN_MATERIAL';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function validateGlobalTerrainReliefGrid(grid) {
  if (!grid || grid.synthetic === true)
    throw new Error('GLOBAL_TERRAIN_RELIEF_SYNTHETIC_FORBIDDEN');
  if (grid.sourceId !== SOURCE_ID || grid.truthClass !== TRUTH_CLASS)
    throw new Error('GLOBAL_TERRAIN_RELIEF_SOURCE_GATE');
  if (!Number.isInteger(grid.width) || grid.width < 3
    || !Number.isInteger(grid.height) || grid.height < 3
    || !Number.isFinite(grid.spacingDeg) || grid.spacingDeg <= 0
    || !Number.isInteger(grid.sampleLevel) || grid.sampleLevel < 0) {
    throw new Error('GLOBAL_TERRAIN_RELIEF_GRID');
  }
  if (!(grid.heightsM instanceof Float32Array)
    || grid.heightsM.length !== grid.width * grid.height) {
    throw new Error('GLOBAL_TERRAIN_RELIEF_LENGTH');
  }
  for (const height of grid.heightsM) {
    if (!Number.isFinite(height))
      throw new Error('GLOBAL_TERRAIN_RELIEF_NON_FINITE');
  }
  return grid;
}

function heightAt(heights, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, x));
  const py = Math.max(0, Math.min(height - 1, y));
  return heights[py * width + px];
}

export function deriveGlobalTerrainRelief(input) {
  const grid = validateGlobalTerrainReliefGrid(input);
  const { width, height, heightsM } = grid;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let minHeightM = Infinity;
  let maxHeightM = -Infinity;
  let landSamples = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const heightM = heightsM[index];
      minHeightM = Math.min(minHeightM, heightM);
      maxHeightM = Math.max(maxHeightM, heightM);
      const target = index * 4;
      if (heightM <= 0) {
        pixels[target + 3] = 0;
        continue;
      }
      landSamples += 1;
      const west = heightAt(heightsM, width, height, x - 1, y);
      const east = heightAt(heightsM, width, height, x + 1, y);
      const north = heightAt(heightsM, width, height, x, y - 1);
      const south = heightAt(heightsM, width, height, x, y + 1);
      const dx = (east - west) * 0.5;
      const dy = (south - north) * 0.5;
      const slope = clamp(Math.hypot(dx, dy) / 1800);
      const light = clamp(0.58 + (-dx + dy) / 4200, 0.16, 1);
      const plateau = clamp((heightM - 750) / 1750);
      const alpine = clamp((heightM - 2500) / 2500);
      const shadow = clamp((0.56 - light) / 0.4);
      pixels[target] = 10;
      pixels[target + 1] = 22;
      pixels[target + 2] = 17;
      pixels[target + 3] = Math.round(
        clamp((0.02 + slope * 0.5 + plateau * 0.03 + alpine * 0.04) * (0.12 + shadow * 0.88)) * 255,
      );
    }
  }

  return Object.freeze({
    sourceId: grid.sourceId,
    truthClass: grid.truthClass,
    synthetic: false,
    width,
    height,
    spacingDeg: grid.spacingDeg,
    sampleLevel: grid.sampleLevel,
    pixels,
    stats: Object.freeze({
      validSamples: heightsM.length,
      landSamples,
      minHeightM,
      maxHeightM,
    }),
  });
}

function canvasForRelief(relief) {
  const canvas = document.createElement('canvas');
  canvas.width = relief.width;
  canvas.height = relief.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('GLOBAL_TERRAIN_RELIEF_CANVAS');
  const image = context.createImageData(relief.width, relief.height);
  image.data.set(relief.pixels);
  context.putImageData(image, 0, 0);
  return canvas;
}

function sampleGrid(C, { width, height }) {
  const spacingDeg = 360 / width;
  const latSpacingDeg = 180 / height;
  const points = [];
  for (let y = 0; y < height; y += 1) {
    const latitudeDeg = 90 - (y + 0.5) * latSpacingDeg;
    for (let x = 0; x < width; x += 1) {
      const longitudeDeg = -180 + (x + 0.5) * spacingDeg;
      points.push(C.Cartographic.fromDegrees(longitudeDeg, latitudeDeg));
    }
  }
  return Object.freeze({ points, spacingDeg, latSpacingDeg });
}

export class GlobalTerrainReliefPass {
  constructor({
    viewer,
    Cesium,
    terrainProvider,
    width = 144,
    height = 72,
    sampleLevel = 2,
    visibleHeightM = 2_500_000,
  } = {}) {
    if (!viewer || viewer.isDestroyed?.())
      throw new Error('GLOBAL_TERRAIN_RELIEF_VIEWER_REQUIRED');
    if (!terrainProvider)
      throw new Error('GLOBAL_TERRAIN_RELIEF_PROVIDER_REQUIRED');
    this.viewer = viewer;
    this.C = Cesium || globalThis.Cesium;
    this.terrainProvider = terrainProvider;
    this.width = width;
    this.height = height;
    this.sampleLevel = sampleLevel;
    this.visibleHeightM = visibleHeightM;
    this.layer = null;
    this.relief = null;
    this.generation = 0;
    this.mode = 'EARTH';
    this.removeCameraChanged = null;
    this.error = null;
    this.generatedAt = null;
    this.loadDurationMs = null;
  }

  async load({ force = false } = {}) {
    if (this.relief && this.layer && !force) return this.snapshot();
    const startedAt = performance.now();
    const generation = ++this.generation;
    const grid = sampleGrid(this.C, { width: this.width, height: this.height });
    const sampled = await this.C.sampleTerrain(
      this.terrainProvider,
      this.sampleLevel,
      grid.points,
    );
    if (generation !== this.generation) return null;
    const heightsM = Float32Array.from(sampled.map(point => Number(point.height)));
    const relief = deriveGlobalTerrainRelief({
      sourceId: SOURCE_ID,
      truthClass: TRUTH_CLASS,
      synthetic: false,
      width: this.width,
      height: this.height,
      spacingDeg: grid.spacingDeg,
      sampleLevel: this.sampleLevel,
      heightsM,
    });
    const canvas = canvasForRelief(relief);
    if (this.layer) {
      try { this.viewer.imageryLayers.remove(this.layer, true); } catch (_) {}
      this.layer = null;
    }
    const provider = new this.C.SingleTileImageryProvider({
      url: canvas.toDataURL('image/png'),
      rectangle: this.C.Rectangle.MAX_VALUE,
      credit: 'Derived from Esri WorldElevation3D Terrain3D',
    });
    this.layer = this.viewer.imageryLayers.addImageryProvider(provider);
    /* 0.76은 사진 기본 지구 시절의 값이다. NE2 데이터 원판(풀해상 릴리프 내장)
     * 위에서는 저해상 144×72 오버레이가 베일이 되므로 미세 보강만 남긴다. */
    this.layer.alpha = 0.12;
    this.layer.brightness = 1;
    this.layer.contrast = 1;
    this.layer.__earthusV2GlobalTerrainRelief = true;
    this.relief = relief;
    this.generatedAt = new Date().toISOString();
    this.loadDurationMs = Math.round(performance.now() - startedAt);
    this.error = null;
    if (!this.removeCameraChanged) {
      this.removeCameraChanged = this.viewer.camera.changed.addEventListener(() => this.updateVisibility());
    }
    this.updateVisibility();
    this.viewer.scene.requestRender();
    return this.snapshot();
  }

  async show() {
    try {
      if (!this.relief || !this.layer) await this.load();
      this.mode = 'EARTH';
      this.updateVisibility();
      return this.snapshot();
    } catch (error) {
      this.error = String(error?.message || error);
      throw error;
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.updateVisibility();
  }

  updateVisibility() {
    if (!this.layer) return false;
    const cameraHeightM = this.viewer.camera.positionCartographic?.height ?? Infinity;
    this.layer.show = this.mode === 'EARTH' && cameraHeightM >= this.visibleHeightM;
    this.viewer.scene.requestRender();
    return this.layer.show;
  }

  snapshot() {
    return Object.freeze({
      ready: Boolean(this.relief && this.layer),
      sourceId: SOURCE_ID,
      truthClass: TRUTH_CLASS,
      synthetic: false,
      sampleLevel: this.sampleLevel,
      width: this.width,
      height: this.height,
      sampleCount: this.relief?.stats.validSamples ?? 0,
      landSamples: this.relief?.stats.landSamples ?? 0,
      minHeightM: this.relief?.stats.minHeightM ?? null,
      maxHeightM: this.relief?.stats.maxHeightM ?? null,
      generatedAt: this.generatedAt,
      loadDurationMs: this.loadDurationMs,
      providerUrl: this.terrainProvider?._resource?.url
        || this.terrainProvider?._resource?._url
        || null,
      layerAttached: Boolean(this.layer && this.viewer.imageryLayers.contains(this.layer)),
      visible: this.layer?.show === true,
      cameraHeightM: this.viewer.camera.positionCartographic?.height ?? null,
      terrainScale: 1,
      materialClass: 'TERRAIN_HEIGHT_HILLSHADE_MATERIAL_ONLY',
      error: this.error,
    });
  }

  dispose() {
    this.generation += 1;
    try { this.removeCameraChanged?.(); } catch (_) {}
    this.removeCameraChanged = null;
    if (this.layer) {
      try { this.viewer.imageryLayers.remove(this.layer, true); } catch (_) {}
    }
    this.layer = null;
    this.relief = null;
    this.generatedAt = null;
    this.loadDurationMs = null;
    this.viewer.scene.requestRender();
  }
}
