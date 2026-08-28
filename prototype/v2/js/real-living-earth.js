/* EARTHUS V2 — Real Living Earth runtime
 * Truth-first production bridge for the V2 Quiet Earth shell.
 *
 * Reuses the canonical Cesium viewer configuration from 1.0 and replaces the
 * V2 ellipsoid/NaturalEarth mock path with real terrain, real imagery and the
 * observed NOAA GMGSI cloud product. No synthetic terrain/bathymetry/cloud data.
 */

import {
  initViewer,
  viewer as sharedViewer,
  scene as sharedScene,
  gibsProvider,
  setAmbientView,
} from '../../js/viewer.js';
import { API } from '../../js/config.js';
import { buildCloudShadowAlpha } from '../../js/cloud-shadow.js';

const TOPO_BATHY_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer';
const LAND_TERRAIN_URL =
  'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const ESRI_IMAGERY =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const CLOUD_SHELL_DISPLAY_HEIGHT_M = 12_000; // visual placement only; never exposed as observed CTH
const CLOUD_REFRESH_MS = 20 * 60_000;
const TRENCH_TARGET = Object.freeze({
  id: 'mariana-challenger-deep-region',
  lon: 142.20,
  lat: 11.35,
  surfaceRadiusM: 185_000,
  cameraHeightM: 360_000,
});

let viewer = null;
let scene = null;
let terrainTruth = 'UNINITIALIZED';
let terrainProvider = null;
let baseLayer = null;
let detailLayer = null;
let cityLightsLayer = null;
let cloudShell = null;
let cloudShadowLayer = null;
let cloudMeta = null;
let cloudRefreshTimer = null;
let cloudGeneration = 0;
let trenchSurface = null;
let trenchSample = null;
let sourceBadge = null;
let activeMode = 'EARTH';
let installed = false;

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
};

function progress(task, stage, value, provider) {
  try { task?.update?.({ stage, progress: value, provider }); } catch (_) { /* UI is non-authoritative */ }
}

function announce(message) {
  document.dispatchEvent(new CustomEvent('earthus:v2-real-earth-notice', { detail: { message } }));
}

function ensureSourceBadge() {
  if (sourceBadge?.isConnected) return sourceBadge;
  sourceBadge = document.createElement('div');
  sourceBadge.id = 'earthusV2RealSources';
  sourceBadge.setAttribute('aria-live', 'polite');
  Object.assign(sourceBadge.style, {
    position: 'fixed',
    left: '18px',
    bottom: '76px',
    zIndex: '4',
    maxWidth: 'min(520px, calc(100vw - 36px))',
    padding: '6px 9px',
    border: '1px solid rgba(188,220,238,.11)',
    borderRadius: '10px',
    background: 'rgba(2,8,12,.54)',
    backdropFilter: 'blur(12px)',
    color: '#78909c',
    font: '8px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    pointerEvents: 'none',
  });
  document.body.append(sourceBadge);
  return sourceBadge;
}

function renderSourceBadge(extra = '') {
  const badge = ensureSourceBadge();
  const terrain = terrainTruth === 'ESRI_TOPOBATHY3D'
    ? 'TERRAIN/BATHY: Esri WorldElevation3D TopoBathy3D'
    : terrainTruth === 'ESRI_TERRAIN3D'
      ? 'TERRAIN: Esri WorldElevation3D Terrain3D · bathymetry unavailable'
      : 'TERRAIN: ellipsoid fallback';
  const cloud = cloudMeta?.time
    ? `CLOUD: NOAA NESDIS GMGSI ${cloudMeta.time} · observed 2D shell`
    : 'CLOUD: loading / unavailable';
  badge.textContent = `${terrain} · ${cloud}${extra ? ` · ${extra}` : ''}`;
}

function removeCloudObjects() {
  if (cloudShell && scene?.primitives?.contains?.(cloudShell)) {
    try { scene.primitives.remove(cloudShell); } catch (_) { /* noop */ }
  }
  cloudShell = null;
  if (cloudShadowLayer && viewer?.imageryLayers) {
    try { viewer.imageryLayers.remove(cloudShadowLayer, true); } catch (_) { /* noop */ }
  }
  cloudShadowLayer = null;
}

function sunFixedAt(isoTime) {
  const time = Cesium.JulianDate.fromIso8601(isoTime);
  const inertial = Cesium.Simon1994PlanetaryPositions
    .computeSunPositionInEarthInertialFrame(time, new Cesium.Cartesian3());
  let transform = Cesium.Transforms.computeIcrfToFixedMatrix(time, new Cesium.Matrix3());
  if (!Cesium.defined(transform)) {
    transform = Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, new Cesium.Matrix3());
  }
  const fixed = Cesium.Matrix3.multiplyByVector(transform, inertial, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(fixed, fixed);
  return [fixed.x, fixed.y, fixed.z];
}

function cloudCanvasFromObservedImage(image, meta) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;

  if (meta.format === 'la8') {
    for (let i = 0; i < d.length; i += 4) {
      const l = 90 + d[i] * 165 / 255;
      d[i] = d[i + 1] = d[i + 2] = Math.round(l);
      d[i + 3] = Math.round(255 * Math.pow(d[i + 3] / 255, 0.78));
    }
  } else {
    for (let i = 0; i < d.length; i += 4) {
      const a = Math.round(255 * Math.pow(d[i] / 255, 0.78));
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return { canvas, rgba: pixels.data };
}

function shadowCanvasFromObservedAlpha(rgba, width, height, meta) {
  const result = buildCloudShadowAlpha({
    rgba,
    sourceWidth: width,
    sourceHeight: height,
    north: Cesium.Math.toRadians(meta.north),
    south: Cesium.Math.toRadians(meta.south),
    sun: sunFixedAt(meta.time),
  });
  const mask = document.createElement('canvas');
  mask.width = result.width;
  mask.height = result.height;
  const maskCtx = mask.getContext('2d');
  const img = maskCtx.createImageData(result.width, result.height);
  for (let i = 0; i < result.alpha.length; i += 1) {
    const p = i * 4;
    img.data[p] = img.data[p + 1] = img.data[p + 2] = 0;
    img.data[p + 3] = Math.round(result.alpha[i] * 0.32);
  }
  maskCtx.putImageData(img, 0, 0);

  const blurred = document.createElement('canvas');
  blurred.width = mask.width;
  blurred.height = mask.height;
  const bctx = blurred.getContext('2d');
  bctx.filter = 'blur(1.5px)';
  bctx.drawImage(mask, 0, 0);
  return blurred;
}

function addCloudShell(canvas, meta) {
  const rectangle = Cesium.Rectangle.fromDegrees(-180, meta.south, 180, meta.north);
  const material = Cesium.Material.fromType('Image', {
    image: canvas,
    repeat: new Cesium.Cartesian2(1, 1),
    color: Cesium.Color.WHITE.withAlpha(0.92),
    transparent: true,
  });
  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.RectangleGeometry({
        rectangle,
        height: CLOUD_SHELL_DISPLAY_HEIGHT_M,
        granularity: Cesium.Math.toRadians(1.0),
        vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }),
    }),
    appearance: new Cesium.EllipsoidSurfaceAppearance({
      aboveGround: true,
      faceForward: true,
      translucent: true,
      material,
    }),
    asynchronous: false,
    show: activeMode === 'EARTH',
  });
  scene.primitives.add(primitive);
  return primitive;
}

function addCloudShadow(canvas, meta) {
  const provider = new Cesium.SingleTileImageryProvider({
    url: canvas.toDataURL('image/png'),
    rectangle: Cesium.Rectangle.fromDegrees(-180, meta.south, 180, meta.north),
    tileWidth: canvas.width,
    tileHeight: canvas.height,
    credit: meta.credit || 'NOAA NESDIS GMGSI',
  });
  const layer = viewer.imageryLayers.addImageryProvider(provider);
  layer.alpha = 0.28;
  layer.show = activeMode === 'EARTH';
  return layer;
}

async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('CLOUD_IMAGE_DECODE_FAILED'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadObservedCloudShell({ force = false } = {}) {
  const generation = ++cloudGeneration;
  try {
    const metaResponse = await fetch(`${API.CLOUDS}/meta.json`, { cache: 'no-cache' });
    if (!metaResponse.ok) throw new Error(`GMGSI_META_${metaResponse.status}`);
    const meta = await metaResponse.json();
    if (!meta?.time || !Number.isFinite(Number(meta.south)) || !Number.isFinite(Number(meta.north))) {
      throw new Error('GMGSI_META_INVALID');
    }
    if (!force && cloudMeta?.time === meta.time && cloudShell) return cloudMeta;

    const imageResponse = await fetch(
      `${API.CLOUDS}/global.png?t=${encodeURIComponent(meta.time)}`,
      { cache: 'no-cache' },
    );
    if (!imageResponse.ok) throw new Error(`GMGSI_IMAGE_${imageResponse.status}`);
    const image = await imageFromBlob(await imageResponse.blob());
    if (generation !== cloudGeneration) return cloudMeta;

    const normalized = cloudCanvasFromObservedImage(image, meta);
    const shadow = shadowCanvasFromObservedAlpha(
      normalized.rgba,
      normalized.canvas.width,
      normalized.canvas.height,
      meta,
    );
    removeCloudObjects();
    cloudShadowLayer = addCloudShadow(shadow, meta);
    cloudShell = addCloudShell(normalized.canvas, meta);
    cloudMeta = Object.freeze({
      time: meta.time,
      source: 'NOAA_NESDIS_GMGSI',
      credit: meta.credit || 'NOAA NESDIS GMGSI',
      truthClass: 'OBSERVED_2D_SHELL',
      heightClass: 'DISPLAY_ONLY_NOT_CTH',
      south: Number(meta.south),
      north: Number(meta.north),
    });
    renderSourceBadge();
    scene.requestRender();
    return cloudMeta;
  } catch (error) {
    console.warn('[v2-real-earth/cloud]', error?.message || error);
    renderSourceBadge('cloud fallback: unavailable');
    return null;
  }
}

function scheduleCloudRefresh() {
  clearTimeout(cloudRefreshTimer);
  cloudRefreshTimer = setTimeout(async () => {
    if (document.visibilityState === 'visible') await loadObservedCloudShell({ force: true });
    scheduleCloudRefresh();
  }, CLOUD_REFRESH_MS);
}

async function installTerrain() {
  try {
    terrainProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(TOPO_BATHY_URL);
    viewer.terrainProvider = terrainProvider;
    terrainTruth = 'ESRI_TOPOBATHY3D';
  } catch (error) {
    console.warn('[v2-real-earth/terrain] TopoBathy3D unavailable:', error?.message || error);
    try {
      terrainProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(LAND_TERRAIN_URL);
      viewer.terrainProvider = terrainProvider;
      terrainTruth = 'ESRI_TERRAIN3D';
    } catch (landError) {
      console.warn('[v2-real-earth/terrain] Terrain3D unavailable:', landError?.message || landError);
      terrainProvider = viewer.terrainProvider;
      terrainTruth = 'ELLIPSOID_FALLBACK';
    }
  }
  renderSourceBadge();
  scene.requestRender();
  return terrainTruth;
}

function installEarthImagery() {
  baseLayer = viewer.imageryLayers.addImageryProvider(
    gibsProvider({ layer: 'BlueMarble_ShadedRelief_Bathymetry', level: 8, ext: 'jpeg' }),
  );
  baseLayer.dayAlpha = 1.0;
  baseLayer.nightAlpha = 0.10;

  detailLayer = viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
      url: ESRI_IMAGERY,
      maximumLevel: 19,
      credit: 'Powered by Esri · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    }),
  );

  cityLightsLayer = viewer.imageryLayers.addImageryProvider(
    gibsProvider({ layer: 'VIIRS_CityLights_2012', level: 8, ext: 'jpeg' }),
  );
  cityLightsLayer.dayAlpha = 0.0;
  cityLightsLayer.nightAlpha = 0.82;
  cityLightsLayer.brightness = 1.35;

  const updateDetail = () => {
    const h = viewer.camera.positionCartographic?.height ?? 24_000_000;
    const detail = 1 - smoothstep(2_000_000, 8_000_000, h);
    detailLayer.alpha = activeMode === 'TRENCH' ? Math.min(0.28, detail) : detail;
    baseLayer.alpha = activeMode === 'TRENCH' ? 0.34 : 1.0;
    cityLightsLayer.show = activeMode === 'EARTH';
  };
  viewer.camera.changed.addEventListener(updateDetail);
  updateDetail();
}

function removeTrenchSurface() {
  if (trenchSurface) {
    try { viewer.entities.remove(trenchSurface); } catch (_) { /* noop */ }
  }
  trenchSurface = null;
  trenchSample = null;
}

async function sampleTrenchDepth() {
  if (terrainTruth !== 'ESRI_TOPOBATHY3D' || !terrainProvider) return null;
  const point = Cesium.Cartographic.fromDegrees(TRENCH_TARGET.lon, TRENCH_TARGET.lat);
  try {
    let sampled = null;
    if (typeof Cesium.sampleTerrainMostDetailed === 'function') {
      try { [sampled] = await Cesium.sampleTerrainMostDetailed(terrainProvider, [point]); }
      catch (_) { /* some providers do not expose availability */ }
    }
    if (!sampled && typeof Cesium.sampleTerrain === 'function') {
      [sampled] = await Cesium.sampleTerrain(terrainProvider, 12, [point]);
    }
    const height = Number(sampled?.height);
    if (!Number.isFinite(height)) return null;
    return Object.freeze({
      lon: TRENCH_TARGET.lon,
      lat: TRENCH_TARGET.lat,
      heightM: height,
      depthM: height < 0 ? -height : 0,
      source: 'ESRI_TOPOBATHY3D_PROVIDER_SAMPLE',
    });
  } catch (error) {
    console.warn('[v2-real-earth/trench-sample]', error?.message || error);
    return null;
  }
}

async function enterTrench() {
  if (terrainTruth !== 'ESRI_TOPOBATHY3D') {
    announce('실제 Bathymetry Provider가 준비되지 않아 해구 모드를 열지 않았습니다.');
    renderSourceBadge('TRENCH: blocked — real bathymetry unavailable');
    return false;
  }

  activeMode = 'TRENCH';
  if (cloudShell) cloudShell.show = false;
  if (cloudShadowLayer) cloudShadowLayer.show = false;
  cityLightsLayer && (cityLightsLayer.show = false);
  baseLayer && (baseLayer.alpha = 0.34);
  detailLayer && (detailLayer.alpha = 0.18);

  removeTrenchSurface();
  trenchSurface = viewer.entities.add({
    id: 'earthus-v2-zero-meter-ocean-surface',
    position: Cesium.Cartesian3.fromDegrees(TRENCH_TARGET.lon, TRENCH_TARGET.lat),
    ellipse: {
      semiMajorAxis: TRENCH_TARGET.surfaceRadiusM,
      semiMinorAxis: TRENCH_TARGET.surfaceRadiusM,
      height: 0,
      material: Cesium.Color.fromCssColorString('#164e68').withAlpha(0.18),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#8dd9e8').withAlpha(0.22),
    },
  });

  const controller = scene.screenSpaceCameraController;
  controller.enableTilt = true;
  controller.enableLook = false;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      TRENCH_TARGET.lon,
      TRENCH_TARGET.lat - 1.25,
      TRENCH_TARGET.cameraHeightM,
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-62),
      roll: 0,
    },
    duration: 1.25,
  });

  trenchSample = await sampleTrenchDepth();
  const sampleText = trenchSample?.depthM > 0
    ? `PROVIDER SAMPLE ${Math.round(trenchSample.depthM).toLocaleString()}m below 0m`
    : 'PROVIDER SAMPLE unavailable';
  renderSourceBadge(`TRENCH: real bathymetry · 0m surface separated · ${sampleText}`);
  announce('실제 TopoBathy3D 기반 해구 보기 · 수심은 Provider 표본값만 표시합니다.');
  scene.requestRender();
  return true;
}

function enterEarth() {
  activeMode = 'EARTH';
  removeTrenchSurface();
  scene.screenSpaceCameraController.enableTilt = false;
  scene.screenSpaceCameraController.enableLook = false;
  if (cloudShell) cloudShell.show = true;
  if (cloudShadowLayer) cloudShadowLayer.show = true;
  if (cityLightsLayer) cityLightsLayer.show = true;
  if (baseLayer) baseLayer.alpha = 1.0;
  setAmbientView(127, 25, 0.52);
  renderSourceBadge();
  scene.requestRender();
}

function installFeatureBridge() {
  if (installed) return;
  installed = true;
  document.addEventListener('earthus:v2-feature-request', async event => {
    const { menu, feature } = event.detail || {};
    if (menu === 'WEATHER' && feature === 'Clouds') {
      enterEarth();
      await loadObservedCloudShell({ force: true });
      return;
    }
    if (menu === 'OCEAN' && feature === 'Bathymetry / Trench') {
      await enterTrench();
      return;
    }
    if (activeMode === 'TRENCH' && menu !== 'OCEAN') enterEarth();
  });

  document.addEventListener('click', event => {
    const earth = event.target?.closest?.('#home,[data-menu="EARTH"]');
    if (earth) enterEarth();
  }, true);
}

function installCameraReadout() {
  scene.postRender.addEventListener(() => {
    const p = viewer.camera.positionCartographic;
    if (!p) return;
    const lat = Cesium.Math.toDegrees(p.latitude);
    const lon = Cesium.Math.toDegrees(p.longitude);
    const coord = document.getElementById('coord');
    const alt = document.getElementById('alt');
    if (coord) coord.textContent = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
    if (alt) alt.textContent = `ALT ${Math.round(p.height / 1000).toLocaleString()} km`;
  });
}

export async function bootRealLivingEarth({ containerId = 'g', task = null } = {}) {
  if (!globalThis.Cesium) throw new Error('CESIUM_RUNTIME_UNAVAILABLE');
  progress(task, 'viewer', 30, 'EARTHUS canonical Cesium viewer');

  initViewer(containerId);
  viewer = sharedViewer;
  scene = sharedScene;
  if (!viewer || !scene) throw new Error('CANONICAL_VIEWER_INIT_FAILED');

  scene.globe.depthTestAgainstTerrain = true;
  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = true;
  if ('dynamicAtmosphereLighting' in scene.globe) scene.globe.dynamicAtmosphereLighting = true;
  if ('dynamicAtmosphereLightingFromSun' in scene.globe) scene.globe.dynamicAtmosphereLightingFromSun = true;
  scene.sun.show = true;
  scene.moon.show = false;
  scene.fog.enabled = false;
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = Cesium.JulianDate.now();

  progress(task, 'imagery', 42, 'NASA GIBS + Esri World Imagery');
  installEarthImagery();

  progress(task, 'terrain', 58, 'Esri WorldElevation3D TopoBathy3D');
  await installTerrain();

  setAmbientView(127, 25, 0.52);
  installCameraReadout();
  installFeatureBridge();

  progress(task, 'cloud', 72, 'NOAA NESDIS GMGSI observed cloud shell');
  loadObservedCloudShell().finally(() => scene.requestRender());
  scheduleCloudRefresh();
  renderSourceBadge();
  scene.requestRender();

  return Object.freeze({
    viewer,
    scene,
    terrainTruth,
    cloudTruth: () => cloudMeta,
    enterEarth,
    enterTrench,
    refreshClouds: () => loadObservedCloudShell({ force: true }),
    trenchSample: () => trenchSample,
    dispose() {
      clearTimeout(cloudRefreshTimer);
      cloudGeneration += 1;
      removeCloudObjects();
      removeTrenchSurface();
      sourceBadge?.remove?.();
      sourceBadge = null;
      installed = false;
    },
  });
}
