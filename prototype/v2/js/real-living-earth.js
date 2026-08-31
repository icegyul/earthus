/* EARTHUS V2 — truth-first real Earth runtime. */
import {
  initViewer,
  viewer as sharedViewer,
  scene as sharedScene,
  gibsProvider,
  setAmbientView,
} from "../../js/viewer.js";
import { API } from "../../js/config.js";
import { buildCloudShadowAlpha } from "../../js/cloud-shadow.js";
import { Gk2aCthReliefRuntime } from "./gk2a-cth-relief.js";
import { GfsCloudVolumeRuntime } from "./gfs-cloud-volume.js";
import { GlobalTerrainReliefPass } from "./global-terrain-relief-pass.js";
import { OceanSurfacePass } from "./ocean-surface-pass.js";
import {
  PhysicalEarthPresentationRuntime,
  terrainPresentationForHeight,
} from "./physical-earth-presentation.js";
import { PolarGeographicCapRuntime } from "./polar-geographic-cap.js";
import { TrenchBathymetryMeshRuntime } from "./trench-bathymetry-mesh.js";

const TOPO_BATHY_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer";
const LAND_TERRAIN_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const ESRI_IMAGERY_SERVICE =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const CLOUD_SHELL_DISPLAY_HEIGHT_M = 12_000;
const CLOUD_REFRESH_MS = 20 * 60_000;
const TRENCH = Object.freeze({ lon: 142.2, lat: 11.35 });

let viewer = null,
  scene = null,
  terrainProvider = null,
  surfaceTerrainProvider = null,
  bathyTerrainProvider = null;
let terrainTruth = "UNINITIALIZED",
  bathymetryTruth = "UNINITIALIZED",
  waterTruth = "NO_WATER_MASK",
  polarTruth = "UNINITIALIZED",
  activeMode = "EARTH",
  cloudFidelity = "OFF";
let polarBaseLayer = null,
  baseLayer = null,
  detailLayer = null,
  cityLightsLayer = null,
  cloudShadowLayer = null,
  polarSurface = null;
let cloudShell = null,
  cloudMeta = null,
  cloudTimer = null,
  cloudGeneration = 0,
  cthRelief = null,
  cthMeta = null,
  cloudVolume = null,
  volumeMeta = null,
  physicalPresentation = null,
  globalTerrainRelief = null,
  oceanSurface = null,
  defaultPhysicalReady = false,
  globalReliefError = null,
  oceanSurfaceError = null,
  lastVolumeError = null,
  lastCthError = null;
let trenchSample = null,
  trenchMesh = null,
  trenchMeshMeta = null,
  trenchRevealRestore = null,
  sourceBadge = null,
  underwaterRestore = null,
  waterRestore = null;
let featureRequestHandler = null,
  earthClickHandler = null,
  cameraReadoutRemove = null,
  cameraDetailRemove = null;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
};
const progress = (task, stage, value, provider) => {
  try {
    task?.update?.({ stage, progress: value, provider });
  } catch (_) {}
};
const announce = (message) =>
  document.dispatchEvent(
    new CustomEvent("earthus:v2-real-earth-notice", { detail: { message } }),
  );

function badge(extra = "") {
  if (!sourceBadge?.isConnected) {
    sourceBadge = document.createElement("div");
    sourceBadge.id = "earthusV2RealSources";
    sourceBadge.setAttribute("aria-live", "polite");
    Object.assign(sourceBadge.style, {
      position: "fixed",
      left: "18px",
      bottom: "76px",
      zIndex: "4",
      maxWidth: "min(940px,calc(100vw - 36px))",
      padding: "6px 9px",
      border: "1px solid rgba(188,220,238,.11)",
      borderRadius: "10px",
      background: "rgba(2,8,12,.54)",
      backdropFilter: "blur(12px)",
      color: "#78909c",
      font: "8px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace",
      pointerEvents: "none",
    });
    document.body.append(sourceBadge);
  }
  const physical = physicalPresentation?.snapshot?.();
  const t =
    terrainTruth === "ESRI_TERRAIN3D"
      ? `TERRAIN: Esri Terrain3D · source scale ${Number(physical?.terrainScale || 1).toFixed(1)}× · SSE ${Number(physical?.maximumScreenSpaceError || 2).toFixed(2)}`
      : terrainTruth === "ESRI_TOPOBATHY3D"
        ? "TERRAIN/BATHY: Esri TopoBathy3D"
        : "TERRAIN: ellipsoid fallback";
  const b =
    bathymetryTruth === "ESRI_TOPOBATHY3D"
      ? "BATHY: Esri TopoBathy3D ready"
      : "BATHY: unavailable";
  const w =
    waterTruth === "NATURAL_EARTH_MASK_0M_OCEAN_SURFACE"
      ? "WATER: independent 0m surface · Natural Earth mask · static normal"
      : waterTruth === "PROVIDER_WATER_MASK"
      ? "WATER: provider mask + reflective waves"
      : "WATER: imagery surface";
  const p =
    polarTruth === "NASA_GIBS_POLAR_STEREOGRAPHIC_HOLE_FILL_IMAGERY_ONLY"
      ? "POLAR: NASA GIBS EPSG3413/3031 stereographic UV"
      : polarTruth === "UNAVAILABLE"
        ? "POLAR: unavailable"
        : "POLAR: loading";
  const c = cloudMeta?.time
    ? `CLOUD L0: NOAA GMGSI ${cloudMeta.time}`
    : "CLOUD L0: loading / unavailable";
  const r = cthMeta?.validAt ? ` · L1 GK2A CTH ${cthMeta.validAt}` : "";
  const v = volumeMeta?.cloudState?.validAt
    ? ` · L2 GFS VOLUME ${volumeMeta.cloudState.validAt}`
    : "";
  const gr = globalTerrainRelief?.snapshot?.();
  const relief = gr?.ready
    ? ` · RELIEF L0: ${gr.sourceId} ${gr.width}×${gr.height}`
    : globalReliefError
      ? ` · RELIEF L0: unavailable ${globalReliefError}`
      : " · RELIEF L0: loading";
  sourceBadge.textContent = `${t}${relief} · ${b} · ${w} · ${p} · ${c}${r}${v} · ACTIVE ${cloudFidelity}${extra ? ` · ${extra}` : ""}`;
}

function sunFixedAt(iso) {
  const time = Cesium.JulianDate.fromIso8601(iso),
    inertial =
      Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
        time,
        new Cesium.Cartesian3(),
      );
  let m = Cesium.Transforms.computeIcrfToFixedMatrix(
    time,
    new Cesium.Matrix3(),
  );
  if (!Cesium.defined(m))
    m = Cesium.Transforms.computeTemeToPseudoFixedMatrix(
      time,
      new Cesium.Matrix3(),
    );
  const fixed = Cesium.Matrix3.multiplyByVector(
    m,
    inertial,
    new Cesium.Cartesian3(),
  );
  Cesium.Cartesian3.normalize(fixed, fixed);
  return [fixed.x, fixed.y, fixed.z];
}
async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    await new Promise((ok, no) => {
      image.onload = ok;
      image.onerror = () => no(new Error("CLOUD_IMAGE_DECODE_FAILED"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function normalizeCloud(image, meta) {
  const cv = document.createElement("canvas");
  cv.width = image.naturalWidth || image.width;
  cv.height = image.naturalHeight || image.height;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(image, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height),
    d = px.data;
  if (meta.format === "la8")
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] / 255,
        a = (d[i + 3] / 255) * lum,
        l = 90 + lum * 165;
      d[i] = d[i + 1] = d[i + 2] = Math.round(l);
      d[i + 3] = Math.round(255 * Math.pow(clamp(a), 0.78));
    }
  else
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] / 255,
        a = Math.round(255 * Math.pow(clamp(lum), 0.78));
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a;
    }
  cx.putImageData(px, 0, 0);
  return { canvas: cv, rgba: px.data };
}
function shadowCanvas(rgba, w, h, meta) {
  const r = buildCloudShadowAlpha({
      rgba,
      sourceWidth: w,
      sourceHeight: h,
      north: Cesium.Math.toRadians(meta.north),
      south: Cesium.Math.toRadians(meta.south),
      sun: sunFixedAt(meta.time),
    }),
    a = document.createElement("canvas");
  a.width = r.width;
  a.height = r.height;
  const ac = a.getContext("2d"),
    im = ac.createImageData(r.width, r.height);
  for (let i = 0; i < r.alpha.length; i++) {
    const p = i * 4;
    im.data[p] = im.data[p + 1] = im.data[p + 2] = 0;
    im.data[p + 3] = Math.round(r.alpha[i] * 0.32);
  }
  ac.putImageData(im, 0, 0);
  const b = document.createElement("canvas");
  b.width = a.width;
  b.height = a.height;
  const bc = b.getContext("2d");
  bc.filter = "blur(1.5px)";
  bc.drawImage(a, 0, 0);
  return b;
}
function removeCloud() {
  if (cloudShell) {
    try {
      scene.primitives.remove(cloudShell);
    } catch (_) {}
    cloudShell = null;
  }
  if (cloudShadowLayer) {
    try {
      viewer.imageryLayers.remove(cloudShadowLayer, true);
    } catch (_) {}
    cloudShadowLayer = null;
  }
}
function addCloudShell(canvas, meta) {
  const rect = Cesium.Rectangle.fromDegrees(-180, meta.south, 180, meta.north),
    material = Cesium.Material.fromType("Image", {
      image: canvas,
      repeat: new Cesium.Cartesian2(1, 1),
      color: Cesium.Color.WHITE.withAlpha(0.9),
      transparent: true,
    }),
    p = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.RectangleGeometry({
          rectangle: rect,
          height: CLOUD_SHELL_DISPLAY_HEIGHT_M,
          granularity: Cesium.Math.toRadians(1),
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
      show: activeMode === "EARTH" && cloudFidelity === "SHELL",
    });
  scene.primitives.add(p);
  return p;
}
function setCloudShellPresentation({ show, opacity = 0.5 } = {}) {
  if (!cloudShell) return;
  cloudShell.show = !!show && activeMode === "EARTH";
  const color = cloudShell.appearance?.material?.uniforms?.color;
  if (color)
    cloudShell.appearance.material.uniforms.color = Cesium.Color.WHITE.withAlpha(
      clamp(Number(opacity), 0, 1),
    );
}
function addShadow(canvas, meta) {
  const provider = new Cesium.SingleTileImageryProvider({
      url: canvas.toDataURL("image/png"),
      rectangle: Cesium.Rectangle.fromDegrees(
        -180,
        meta.south,
        180,
        meta.north,
      ),
      tileWidth: canvas.width,
      tileHeight: canvas.height,
      credit: meta.credit || "NOAA NESDIS GMGSI",
    }),
    layer = viewer.imageryLayers.addImageryProvider(provider);
  layer.alpha = 0.22;
  layer.show = activeMode === "EARTH" && cloudFidelity !== "OFF";
  layer.__earthusV2CloudShadow = true;
  return layer;
}
function setObservedShadow(alpha = 0.22, show = true) {
  if (!cloudShadowLayer) return;
  cloudShadowLayer.alpha = alpha;
  cloudShadowLayer.show = !!show && activeMode === "EARTH";
}

function syncPhysicalWater() {
  if (!scene?.globe) return false;
  if (waterRestore === null) waterRestore = scene.globe.showWaterEffect;
  const supported = terrainProvider?.hasWaterMask === true;
  scene.globe.showWaterEffect = supported;
  waterTruth = supported ? "PROVIDER_WATER_MASK" : "NO_WATER_MASK";
  return supported;
}
function setTerrain(provider, truth) {
  if (!provider || !viewer) return false;
  terrainProvider = provider;
  viewer.terrainProvider = provider;
  terrainTruth = truth;
  syncPhysicalWater();
  scene.requestRender();
  return true;
}
function useSurfaceTerrain() {
  if (surfaceTerrainProvider)
    return setTerrain(surfaceTerrainProvider, "ESRI_TERRAIN3D");
  if (bathyTerrainProvider)
    return setTerrain(bathyTerrainProvider, "ESRI_TOPOBATHY3D");
  return false;
}
function useBathymetryTerrain() {
  return bathyTerrainProvider
    ? setTerrain(bathyTerrainProvider, "ESRI_TOPOBATHY3D")
    : false;
}
function afterRender(timeoutMs = 2500) {
  return new Promise((resolve) => {
    let done = false,
      timer = null,
      remove = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      try {
        remove?.();
      } catch (_) {}
      resolve();
    };
    remove = scene.postRender.addEventListener(finish);
    timer = setTimeout(finish, timeoutMs);
    scene.requestRender();
  });
}
function flyToAsync(options) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    viewer.camera.flyTo({ ...options, complete: finish, cancel: finish });
  });
}
async function waitGlobeReady({ minimumMs = 650, timeoutMs = 16000 } = {}) {
  const start = performance.now();
  let streak = 0;
  while (performance.now() - start < timeoutMs) {
    scene.requestRender();
    await new Promise((r) => setTimeout(r, 180));
    if (performance.now() - start < minimumMs) continue;
    streak = scene.globe.tilesLoaded === true ? streak + 1 : 0;
    if (streak >= 3) {
      await afterRender();
      return true;
    }
  }
  return false;
}

async function loadCloud({ force = false } = {}) {
  const generation = ++cloudGeneration;
  try {
    const mr = await fetch(`${API.CLOUDS}/meta.json`, { cache: "no-cache" });
    if (!mr.ok) throw new Error(`GMGSI_META_${mr.status}`);
    const meta = await mr.json();
    if (
      !meta?.time ||
      !Number.isFinite(Number(meta.south)) ||
      !Number.isFinite(Number(meta.north))
    )
      throw new Error("GMGSI_META_INVALID");
    if (!force && cloudMeta?.time === meta.time && cloudShell) return cloudMeta;
    const ir = await fetch(
      `${API.CLOUDS}/global.png?t=${encodeURIComponent(meta.time)}`,
      { cache: "no-cache" },
    );
    if (!ir.ok) throw new Error(`GMGSI_IMAGE_${ir.status}`);
    const normalized = normalizeCloud(
      await imageFromBlob(await ir.blob()),
      meta,
    );
    if (generation !== cloudGeneration) return cloudMeta;
    const shadow = shadowCanvas(
      normalized.rgba,
      normalized.canvas.width,
      normalized.canvas.height,
      meta,
    );
    removeCloud();
    cloudShadowLayer = addShadow(shadow, meta);
    cloudShell = addCloudShell(normalized.canvas, meta);
    cloudMeta = Object.freeze({
      time: meta.time,
      source: "NOAA_NESDIS_GMGSI",
      truthClass: "OBSERVED_2D_SHELL",
      heightClass: "DISPLAY_ONLY_NOT_CTH",
    });
    badge();
    scene.requestRender();
    return cloudMeta;
  } catch (error) {
    console.warn("[v2-real-earth/cloud]", error?.message || error);
    badge("cloud L0 unavailable");
    return null;
  }
}
function scheduleCloud() {
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(async () => {
    if (document.visibilityState === "visible")
      await loadCloud({ force: true });
    scheduleCloud();
  }, CLOUD_REFRESH_MS);
}
function hideCloud3d() {
  cloudVolume?.hide();
  cthRelief?.hide();
  cloudFidelity = "SHELL";
  setCloudShellPresentation({ show: true, opacity: 0.5 });
  setObservedShadow(0.22, true);
}
async function showBestCloud3d({ focus = true } = {}) {
  lastVolumeError = null;
  lastCthError = null;
  if (!cloudVolume) cloudVolume = new GfsCloudVolumeRuntime({ viewer, Cesium });
  try {
    volumeMeta = await cloudVolume.show();
    cthRelief?.hide();
    cloudFidelity = "VOLUME";
    setCloudShellPresentation({ show: false });
    setObservedShadow(0.12, true);
    if (focus) {
      const a = volumeMeta.anchor;
      await flyToAsync({
        destination: Cesium.Cartesian3.fromDegrees(
          a.longitudeDeg,
          a.latitudeDeg - 5.5,
          1_650_000,
        ),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-52), roll: 0 },
        duration: 0.9,
      });
      await afterRender();
    }
    badge("VOLUME: GFS TCDC + HGT · step-aware optical alpha");
    announce(
      `NOAA GFS 실제 수직 구름 Volume · ${volumeMeta.cloudState.validAt}`,
    );
    return "VOLUME";
  } catch (error) {
    lastVolumeError = String(error?.message || error);
    cloudVolume?.hide();
    console.warn("[v2-real-earth/volume]", lastVolumeError);
  }
  if (!cthRelief) cthRelief = new Gk2aCthReliefRuntime({ viewer, Cesium });
  try {
    cthMeta = await cthRelief.show();
    cloudFidelity = "CTH_RELIEF";
    setCloudShellPresentation({ show: false });
    setObservedShadow(0.13, true);
    if (focus) {
      await flyToAsync({
        destination: Cesium.Cartesian3.fromDegrees(132, 26, 1_850_000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
        duration: 0.9,
      });
      await afterRender();
    }
    badge("CTH: actual GK2A CTh mesh + observed GMGSI appearance");
    announce(`천리안2A 실제 운정고도 3D mesh · ${cthMeta.validAt}`);
    return "CTH_RELIEF";
  } catch (error) {
    lastCthError = String(error?.message || error);
    cthRelief?.hide();
    console.warn("[v2-real-earth/cth]", lastCthError);
  }
  cloudFidelity = "SHELL";
  setCloudShellPresentation({ show: true, opacity: 0.5 });
  setObservedShadow(0.22, true);
  badge(
    `OBSERVED_2D_FALLBACK · GFS ${lastVolumeError || "unknown"} · CTH ${lastCthError || "unknown"}`,
  );
  announce("실제 3D 구름 산출물 렌더가 실패해 NOAA 관측 Shell로 유지합니다.");
  return "SHELL";
}

async function installTerrain() {
  const surfacePromise =
      Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(LAND_TERRAIN_URL),
    bathyPromise =
      Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(TOPO_BATHY_URL),
    [surface, bathy] = await Promise.allSettled([surfacePromise, bathyPromise]);
  surfaceTerrainProvider =
    surface.status === "fulfilled" ? surface.value : null;
  bathyTerrainProvider = bathy.status === "fulfilled" ? bathy.value : null;
  bathymetryTruth = bathyTerrainProvider ? "ESRI_TOPOBATHY3D" : "UNAVAILABLE";
  if (surface.status === "rejected")
    console.warn(
      "[v2-real-earth/terrain] Terrain3D:",
      surface.reason?.message || surface.reason,
    );
  if (bathy.status === "rejected")
    console.warn(
      "[v2-real-earth/terrain] TopoBathy3D:",
      bathy.reason?.message || bathy.reason,
    );
  if (!useSurfaceTerrain()) {
    terrainProvider = viewer.terrainProvider;
    terrainTruth = "ELLIPSOID_FALLBACK";
    syncPhysicalWater();
  }
  badge();
  scene.requestRender();
  return terrainTruth;
}
async function installPolarSurface() {
  polarSurface?.dispose();
  polarSurface = new PolarGeographicCapRuntime({ viewer, Cesium });
  polarTruth = "LOADING";
  badge();
  try {
    polarTruth = (await polarSurface.load()) || "UNAVAILABLE";
    badge();
    scene.requestRender();
    return polarTruth;
  } catch (error) {
    console.warn("[v2-real-earth/polar]", error?.message || error);
    polarSurface?.dispose();
    polarSurface = null;
    polarTruth = "UNAVAILABLE";
    badge("polar stereographic hole-fill unavailable");
    scene.requestRender();
    return polarTruth;
  }
}
function updateImageryForView() {
  if (!viewer) return;
  const h = viewer.camera.positionCartographic?.height ?? 24_000_000;
  if (activeMode === "UNDERWATER") {
    if (polarBaseLayer) polarBaseLayer.alpha = 0.6;
    if (baseLayer) baseLayer.alpha = 0.82;
    if (detailLayer) detailLayer.alpha = 0.02;
    if (cityLightsLayer) cityLightsLayer.show = false;
    return;
  }
  if (activeMode === "TRENCH") {
    if (polarBaseLayer) polarBaseLayer.alpha = 0.72;
    if (baseLayer) baseLayer.alpha = 0.9;
    if (detailLayer) detailLayer.alpha = 0.03;
    if (cityLightsLayer) cityLightsLayer.show = false;
    return;
  }
  const d = terrainPresentationForHeight(h).detailImageryAlpha;
  if (polarBaseLayer) polarBaseLayer.alpha = 1;
  if (baseLayer) baseLayer.alpha = 1;
  if (detailLayer) detailLayer.alpha = d;
  if (cityLightsLayer) cityLightsLayer.show = true;
}
async function installImagery() {
  baseLayer = viewer.imageryLayers.addImageryProvider(
    gibsProvider({
      layer: "BlueMarble_ShadedRelief_Bathymetry",
      level: 8,
      ext: "jpeg",
    }),
  );
  baseLayer.dayAlpha = 1;
  baseLayer.nightAlpha = 0.1;
  baseLayer.brightness = 0.98;
  baseLayer.saturation = 0.94;
  let detailProvider = null;
  try {
    detailProvider =
      await Cesium.ArcGisMapServerImageryProvider.fromUrl(ESRI_IMAGERY_SERVICE);
  } catch (error) {
    console.warn(
      "[v2-real-earth/imagery] ArcGIS metadata provider fallback:",
      error?.message || error,
    );
    detailProvider = new Cesium.UrlTemplateImageryProvider({
      url: `${ESRI_IMAGERY_SERVICE}/tile/{z}/{y}/{x}`,
      maximumLevel: 19,
      credit:
        "Powered by Esri · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
    });
  }
  detailLayer = viewer.imageryLayers.addImageryProvider(detailProvider);
  detailLayer.brightness = 0.97;
  detailLayer.contrast = 1.02;
  detailLayer.saturation = 0.94;
  globalThis.__earthusV2CanonicalEsriImageryLayer = detailLayer;
  cityLightsLayer = viewer.imageryLayers.addImageryProvider(
    gibsProvider({ layer: "VIIRS_CityLights_2012", level: 8, ext: "jpeg" }),
  );
  cityLightsLayer.dayAlpha = 0;
  cityLightsLayer.nightAlpha = 0.76;
  cityLightsLayer.brightness = 1.1;
  cameraDetailRemove?.();
  cameraDetailRemove =
    viewer.camera.changed.addEventListener(updateImageryForView);
  updateImageryForView();
}

function restoreTrenchReveal() {
  if (!trenchRevealRestore || !scene) return;
  const r = trenchRevealRestore,
    g = scene.globe,
    t = g.translucency;
  t.enabled = r.translucencyEnabled;
  t.frontFaceAlpha = r.frontFaceAlpha;
  t.backFaceAlpha = r.backFaceAlpha;
  t.frontFaceAlphaByDistance = r.frontFaceAlphaByDistance;
  t.backFaceAlphaByDistance = r.backFaceAlphaByDistance;
  t.rectangle = r.rectangle;
  g.depthTestAgainstTerrain = r.depthTestAgainstTerrain;
  g.undergroundColor = r.undergroundColor;
  g.undergroundColorAlphaByDistance = r.undergroundColorAlphaByDistance;
  trenchRevealRestore = null;
}
function prepareTrenchReveal(meta) {
  restoreTrenchReveal();
  const g = scene.globe,
    t = g.translucency,
    b = meta?.bounds;
  if (!b) return false;
  trenchRevealRestore = {
    translucencyEnabled: t.enabled,
    frontFaceAlpha: t.frontFaceAlpha,
    backFaceAlpha: t.backFaceAlpha,
    frontFaceAlphaByDistance: t.frontFaceAlphaByDistance,
    backFaceAlphaByDistance: t.backFaceAlphaByDistance,
    rectangle: t.rectangle,
    depthTestAgainstTerrain: g.depthTestAgainstTerrain,
    undergroundColor: g.undergroundColor,
    undergroundColorAlphaByDistance: g.undergroundColorAlphaByDistance,
  };
  t.enabled = true;
  t.frontFaceAlpha = 0.055;
  t.backFaceAlpha = 0.12;
  t.frontFaceAlphaByDistance = undefined;
  t.backFaceAlphaByDistance = undefined;
  t.rectangle = Cesium.Rectangle.fromDegrees(b.west, b.south, b.east, b.north);
  g.depthTestAgainstTerrain = false;
  g.undergroundColor = undefined;
  g.undergroundColorAlphaByDistance = undefined;
  scene.requestRender();
  return true;
}
async function ensureTrenchMesh() {
  if (!bathyTerrainProvider) throw new Error("BATHY_MESH_PROVIDER_UNAVAILABLE");
  if (!trenchMesh)
    trenchMesh = new TrenchBathymetryMeshRuntime({ viewer, Cesium });
  if (!trenchMeshMeta)
    trenchMeshMeta = await trenchMesh.load({
      terrainProvider: bathyTerrainProvider,
    });
  trenchMesh.setVisible(true);
  return trenchMeshMeta;
}
function removeTrench() {
  trenchMesh?.hide();
  restoreTrenchReveal();
  trenchSample = null;
}

function restoreUnderwater() {
  if (!underwaterRestore || !scene) return;
  const r = underwaterRestore,
    cc = scene.screenSpaceCameraController,
    g = scene.globe,
    t = g.translucency;
  cc.enableCollisionDetection = r.collision;
  t.enabled = r.translucencyEnabled;
  t.frontFaceAlpha = r.frontFaceAlpha;
  t.backFaceAlpha = r.backFaceAlpha;
  t.frontFaceAlphaByDistance = r.frontFaceAlphaByDistance;
  t.backFaceAlphaByDistance = r.backFaceAlphaByDistance;
  t.rectangle = r.rectangle;
  g.undergroundColor = r.undergroundColor;
  g.undergroundColorAlphaByDistance = r.undergroundColorAlphaByDistance;
  g.backFaceCulling = r.backFaceCulling;
  g.showSkirts = r.showSkirts;
  g.depthTestAgainstTerrain = r.depthTestAgainstTerrain;
  g.enableLighting = r.enableLighting;
  g.showGroundAtmosphere = r.showGroundAtmosphere;
  scene.skyAtmosphere.show = r.skyAtmosphereShow;
  scene.sun.show = r.sunShow;
  scene.fog.enabled = r.fogEnabled;
  scene.backgroundColor = r.backgroundColor;
  globalThis.__earthusSkyPanorama?.show?.();
  underwaterRestore = null;
}
function prepareUnderwater() {
  restoreUnderwater();
  restoreTrenchReveal();
  const cc = scene.screenSpaceCameraController,
    g = scene.globe,
    t = g.translucency;
  underwaterRestore = {
    collision: cc.enableCollisionDetection,
    translucencyEnabled: t.enabled,
    frontFaceAlpha: t.frontFaceAlpha,
    backFaceAlpha: t.backFaceAlpha,
    frontFaceAlphaByDistance: t.frontFaceAlphaByDistance,
    backFaceAlphaByDistance: t.backFaceAlphaByDistance,
    rectangle: t.rectangle,
    undergroundColor: g.undergroundColor,
    undergroundColorAlphaByDistance: g.undergroundColorAlphaByDistance,
    backFaceCulling: g.backFaceCulling,
    showSkirts: g.showSkirts,
    depthTestAgainstTerrain: g.depthTestAgainstTerrain,
    enableLighting: g.enableLighting,
    showGroundAtmosphere: g.showGroundAtmosphere,
    skyAtmosphereShow: scene.skyAtmosphere.show,
    sunShow: scene.sun.show,
    fogEnabled: scene.fog.enabled,
    backgroundColor: scene.backgroundColor,
  };
  cc.enableCollisionDetection = false;
  t.enabled = true;
  t.frontFaceAlpha = 1;
  t.backFaceAlpha = 1;
  t.frontFaceAlphaByDistance = undefined;
  t.backFaceAlphaByDistance = undefined;
  t.rectangle = Cesium.Rectangle.MAX_VALUE;
  g.backFaceCulling = false;
  g.showSkirts = false;
  g.depthTestAgainstTerrain = false;
  g.undergroundColor = undefined;
  g.undergroundColorAlphaByDistance = undefined;
  g.enableLighting = false;
  g.showGroundAtmosphere = false;
  scene.skyAtmosphere.show = false;
  scene.sun.show = false;
  scene.fog.enabled = false;
  scene.backgroundColor = Cesium.Color.fromCssColorString("#03111b");
  globalThis.__earthusSkyPanorama?.hide?.();
}
async function sampleDepth() {
  if (!bathyTerrainProvider) return null;
  const p = Cesium.Cartographic.fromDegrees(TRENCH.lon, TRENCH.lat);
  try {
    let s = null;
    if (typeof Cesium.sampleTerrainMostDetailed === "function")
      try {
        [s] = await Cesium.sampleTerrainMostDetailed(bathyTerrainProvider, [p]);
      } catch (_) {}
    if (!s && typeof Cesium.sampleTerrain === "function")
      [s] = await Cesium.sampleTerrain(bathyTerrainProvider, 12, [p]);
    const h = Number(s?.height);
    return Number.isFinite(h)
      ? Object.freeze({
          heightM: h,
          depthM: h < 0 ? -h : 0,
          source: "ESRI_TOPOBATHY3D_PROVIDER_SAMPLE",
        })
      : null;
  } catch (e) {
    console.warn("[v2-real-earth/trench-sample]", e?.message || e);
    return null;
  }
}

async function enterTrench() {
  hideCloud3d();
  if (bathymetryTruth !== "ESRI_TOPOBATHY3D" || !useBathymetryTerrain()) {
    announce(
      "실제 Bathymetry Provider가 준비되지 않아 해구 모드를 열지 않았습니다.",
    );
    badge("TRENCH blocked");
    return false;
  }
  restoreUnderwater();
  restoreTrenchReveal();
  polarSurface?.setVisible(false);
  try {
    [trenchSample, trenchMeshMeta] = await Promise.all([
      sampleDepth(),
      ensureTrenchMesh(),
    ]);
  } catch (error) {
    console.warn("[v2-real-earth/trench-mesh]", error?.message || error);
    announce(
      "실제 TopoBathy3D 샘플 mesh를 만들지 못해 해구 모드를 열지 않았습니다.",
    );
    badge(`TRENCH blocked · ${error?.message || error}`);
    useSurfaceTerrain();
    return false;
  }
  if (
    !(trenchSample?.depthM > 0) ||
    trenchMeshMeta?.truthClass !== "ESRI_TOPOBATHY3D_SAMPLED_SEAFLOOR_MESH"
  ) {
    announce("검증 가능한 실제 해구 mesh를 확보하지 못했습니다.");
    badge("TRENCH blocked · sampled mesh truth gate");
    useSurfaceTerrain();
    return false;
  }
  activeMode = "TRENCH";
  physicalPresentation?.setMode?.("TRENCH");
  globalTerrainRelief?.setMode?.("TRENCH");
  oceanSurface?.setMode?.("TRENCH");
  waterTruth = "NO_WATER_MASK";
  if (cloudShell) cloudShell.show = false;
  setObservedShadow(0, false);
  scene.globe.maximumScreenSpaceError = 1.2;
  scene.globe.enableLighting = false;
  scene.globe.showGroundAtmosphere = false;
  scene.skyAtmosphere.show = false;
  scene.sun.show = false;
  globalThis.__earthusSkyPanorama?.hide?.();
  scene.screenSpaceCameraController.enableTilt = true;
  scene.screenSpaceCameraController.enableLook = false;
  prepareTrenchReveal(trenchMeshMeta);
  updateImageryForView();
  await flyToAsync({
    destination: Cesium.Cartesian3.fromDegrees(
      TRENCH.lon,
      TRENCH.lat - 1.1,
      175_000,
    ),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-56), roll: 0 },
    duration: 0.9,
  });
  await afterRender();
  badge(
    `TRENCH MESH: Esri sampled ${trenchMeshMeta.grid.nx}×${trenchMeshMeta.grid.ny} · deepest ${Math.round(trenchMeshMeta.deepestM).toLocaleString()}m · center sample ${Math.round(trenchSample.depthM).toLocaleString()}m`,
  );
  announce("실제 TopoBathy3D 샘플로 만든 해구 3D mesh를 표시합니다.");
  return true;
}

async function enterUnderwater() {
  hideCloud3d();
  if (bathymetryTruth !== "ESRI_TOPOBATHY3D" || !useBathymetryTerrain()) {
    announce("실제 Bathymetry Provider가 없어 수중 카메라를 열지 않았습니다.");
    badge("UNDERWATER blocked");
    return false;
  }
  const sample = await sampleDepth();
  if (!(sample?.depthM > 1200)) {
    announce(
      "검증 가능한 실제 해저 수심을 읽지 못해 수중 카메라를 열지 않았습니다.",
    );
    badge("UNDERWATER blocked · provider sample unavailable");
    return false;
  }
  try {
    trenchMeshMeta = await ensureTrenchMesh();
  } catch (error) {
    console.warn("[v2-real-earth/underwater-mesh]", error?.message || error);
    announce("실제 해저 mesh를 만들지 못해 수중 카메라를 열지 않았습니다.");
    badge(`UNDERWATER blocked · ${error?.message || error}`);
    return false;
  }
  polarSurface?.setVisible(false);
  trenchSample = sample;
  activeMode = "UNDERWATER";
  physicalPresentation?.setMode?.("UNDERWATER");
  globalTerrainRelief?.setMode?.("UNDERWATER");
  oceanSurface?.setMode?.("UNDERWATER");
  waterTruth = "NO_WATER_MASK";
  if (cloudShell) cloudShell.show = false;
  setObservedShadow(0, false);
  prepareUnderwater();
  trenchMesh?.setVisible(true);
  scene.globe.maximumScreenSpaceError = 0.9;
  scene.screenSpaceCameraController.enableTilt = true;
  scene.screenSpaceCameraController.enableLook = true;
  updateImageryForView();
  const cameraDepth = Math.min(6500, Math.max(1200, sample.depthM - 4000));
  await flyToAsync({
    destination: Cesium.Cartesian3.fromDegrees(
      TRENCH.lon,
      TRENCH.lat,
      -cameraDepth,
    ),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-72), roll: 0 },
    duration: 0.95,
  });
  await afterRender();
  badge(
    `UNDERWATER MESH: Esri sampled · camera ${Math.round(cameraDepth).toLocaleString()}m below 0m · seafloor ${Math.round(sample.depthM).toLocaleString()}m`,
  );
  announce("실제 TopoBathy3D 샘플 해저 mesh 안으로 진입했습니다.");
  return true;
}

async function activateDefaultPhysicalEarth({ resetCamera = true } = {}) {
  defaultPhysicalReady = false;
  if (!physicalPresentation)
    physicalPresentation = new PhysicalEarthPresentationRuntime({ viewer, Cesium });
  physicalPresentation.install();
  physicalPresentation.setMode("EARTH");
  waterTruth = terrainProvider?.hasWaterMask === true
    ? "PROVIDER_WATER_MASK"
    : "NO_WATER_MASK";
  cloudVolume?.hide();
  cthRelief?.hide();
  cloudFidelity = "OFF";
  setCloudShellPresentation({ show: false });
  setObservedShadow(0, false);
  if (resetCamera) physicalPresentation.setAmbientCamera();
  updateImageryForView();
  let reliefReady = false;
  if (terrainTruth === "ESRI_TERRAIN3D" && surfaceTerrainProvider) {
    if (!globalTerrainRelief)
      globalTerrainRelief = new GlobalTerrainReliefPass({
        viewer,
        Cesium,
        terrainProvider: surfaceTerrainProvider,
      });
    try {
      globalReliefError = null;
      await globalTerrainRelief.show();
      reliefReady = globalTerrainRelief.snapshot().ready === true;
    } catch (error) {
      globalReliefError = String(error?.message || error);
      console.warn("[v2-real-earth/global-relief]", globalReliefError);
    }
  }
  let oceanReady = false;
  if (terrainTruth === "ESRI_TERRAIN3D") {
    if (!oceanSurface)
      oceanSurface = new OceanSurfacePass({ viewer, Cesium });
    try {
      oceanSurfaceError = null;
      await oceanSurface.show();
      oceanReady = oceanSurface.snapshot().ready === true;
    } catch (error) {
      oceanSurfaceError = String(error?.message || error);
      console.warn("[v2-real-earth/ocean-surface]", oceanSurfaceError);
    }
  }
  waterTruth = oceanReady
    ? "NATURAL_EARTH_MASK_0M_OCEAN_SURFACE"
    : "NO_WATER_MASK";
  defaultPhysicalReady = terrainTruth === "ESRI_TERRAIN3D" && reliefReady;
  badge(defaultPhysicalReady
    ? "G2 DEFAULT: Terrain3D 1× + provider-derived global relief material"
    : `G2 BLOCKED: ${globalReliefError || "global relief unavailable"}`);
  scene.requestRender();
  return defaultPhysicalReady;
}

function enterEarth({ upgrade = true } = {}) {
  restoreUnderwater();
  restoreTrenchReveal();
  trenchMesh?.hide();
  useSurfaceTerrain();
  activeMode = "EARTH";
  if (upgrade) {
    cloudVolume?.hide();
    cthRelief?.hide();
    cloudFidelity = "OFF";
    setCloudShellPresentation({ show: false });
    setObservedShadow(0, false);
  } else {
    hideCloud3d();
  }
  trenchSample = null;
  scene.globe.maximumScreenSpaceError = 2;
  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = true;
  scene.skyAtmosphere.show = true;
  scene.sun.show = true;
  scene.fog.enabled = false;
  globalThis.__earthusSkyPanorama?.show?.();
  scene.screenSpaceCameraController.enableTilt = false;
  scene.screenSpaceCameraController.enableLook = false;
  // Polar stereographic imagery is a focused hole-fill, not a second global
  // skin. The visual controller enables it only for a stable polar view.
  polarSurface?.setVisible(false);
  physicalPresentation?.setMode?.("EARTH");
  globalTerrainRelief?.setMode?.("EARTH");
  oceanSurface?.setMode?.("EARTH");
  waterTruth = oceanSurface?.snapshot?.().ready === true
    ? "NATURAL_EARTH_MASK_0M_OCEAN_SURFACE"
    : "NO_WATER_MASK";
  updateImageryForView();
  if (physicalPresentation) physicalPresentation.setAmbientCamera();
  else setAmbientView(127, 25, 0.52);
  badge();
  scene.requestRender();
  if (upgrade)
    void activateDefaultPhysicalEarth({ resetCamera: false }).catch((error) => {
      defaultPhysicalReady = false;
      console.warn("[v2-real-earth/default-physical]", error?.message || error);
      badge("DEFAULT PHYSICAL upgrade failed");
    });
}
function installBridge() {
  if (featureRequestHandler) return;
  featureRequestHandler = async (event) => {
    const { menu, feature } = event.detail || {};
    if (menu === "WEATHER" && feature === "Clouds") {
      enterEarth({ upgrade: false });
      await loadCloud({ force: false });
      await showBestCloud3d();
      return;
    }
    if (menu === "OCEAN" && feature === "Bathymetry / Trench") {
      await enterTrench();
      return;
    }
    if (menu === "OCEAN" && feature === "Underwater") {
      await enterUnderwater();
      return;
    }
    if (activeMode !== "EARTH" || cloudFidelity !== "SHELL") enterEarth();
  };
  earthClickHandler = (event) => {
    if (event.target?.closest?.('#home,[data-menu="EARTH"]')) enterEarth();
  };
  document.addEventListener(
    "earthus:v2-feature-request",
    featureRequestHandler,
  );
  document.addEventListener("click", earthClickHandler, true);
}
function installReadout() {
  cameraReadoutRemove?.();
  cameraReadoutRemove = scene.postRender.addEventListener(() => {
    const p = viewer.camera.positionCartographic;
    if (!p) return;
    const la = Cesium.Math.toDegrees(p.latitude),
      lo = Cesium.Math.toDegrees(p.longitude),
      c = document.getElementById("coord"),
      a = document.getElementById("alt");
    if (c)
      c.textContent = `${Math.abs(la).toFixed(1)}°${la >= 0 ? "N" : "S"} · ${Math.abs(lo).toFixed(1)}°${lo >= 0 ? "E" : "W"}`;
    if (a)
      a.textContent = `ALT ${Math.round(p.height / 1000).toLocaleString()} km`;
  });
}

export async function bootRealLivingEarth({
  containerId = "g",
  task = null,
} = {}) {
  if (!globalThis.Cesium) throw new Error("CESIUM_RUNTIME_UNAVAILABLE");
  progress(task, "viewer", 30, "EARTHUS canonical Cesium viewer");
  initViewer(containerId);
  viewer = sharedViewer;
  scene = sharedScene;
  if (!viewer || !scene) throw new Error("CANONICAL_VIEWER_INIT_FAILED");
  scene.globe.depthTestAgainstTerrain = true;
  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = true;
  if ("dynamicAtmosphereLighting" in scene.globe)
    scene.globe.dynamicAtmosphereLighting = true;
  if ("dynamicAtmosphereLightingFromSun" in scene.globe)
    scene.globe.dynamicAtmosphereLightingFromSun = true;
  if ("highDynamicRange" in scene) scene.highDynamicRange = true;
  scene.sun.show = true;
  scene.moon.show = false;
  scene.fog.enabled = false;
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = Cesium.JulianDate.now();
  progress(
    task,
    "imagery",
    42,
    "NASA GIBS geographic + canonical ArcGIS detail",
  );
  await installImagery();
  progress(
    task,
    "surface",
    52,
    "Esri Terrain3D surface + NASA polar stereographic imagery hole-fill",
  );
  await Promise.all([installTerrain(), installPolarSurface()]);
  progress(
    task,
    "terrain",
    62,
    "Terrain3D surface ready · TopoBathy held for ocean depth modes",
  );
  physicalPresentation = new PhysicalEarthPresentationRuntime({ viewer, Cesium });
  await activateDefaultPhysicalEarth({ resetCamera: true });
  installReadout();
  installBridge();
  progress(task, "cloud", 72, "NOAA observation staged off until Cloud selection");
  scheduleCloud();
  badge();
  scene.requestRender();
  return Object.freeze({
    viewer,
    scene,
    terrainTruth: () => terrainTruth,
    bathymetryTruth: () => bathymetryTruth,
    polarTruth: () => polarTruth,
    polarSources: () => polarSurface?.getSources?.() || Object.freeze([]),
    setPolarVisible: (show, opacity = 1) => polarSurface?.setVisible?.(show, opacity),
    polarVisible: () => polarSurface?.isVisible?.() === true,
    polarOpacity: () => polarSurface?.getOpacity?.() ?? 0,
    waterTruth: () => waterTruth,
    cloudTruth: () => cloudMeta,
    cthTruth: () => cthMeta,
    volumeTruth: () => volumeMeta,
    cloudFidelity: () => cloudFidelity,
    defaultPhysicalReady: () => defaultPhysicalReady,
    defaultPhysicalSnapshot: () => physicalPresentation?.snapshot?.() || null,
    globalTerrainReliefSnapshot: () => globalTerrainRelief?.snapshot?.() || null,
    oceanSurfaceSnapshot: () => oceanSurface?.snapshot?.() || null,
    cloudDiagnostics: () =>
      Object.freeze({
        volume: lastVolumeError,
        cth: lastCthError,
      }),
    detailImageryLayer: () => detailLayer,
    enterEarth,
    enterTrench,
    enterUnderwater,
    showBestCloud3d,
    refreshClouds: () => loadCloud({ force: true }),
    trenchSample: () => trenchSample,
    trenchMeshTruth: () => trenchMeshMeta,
    dispose() {
      clearTimeout(cloudTimer);
      cloudGeneration++;
      restoreUnderwater();
      restoreTrenchReveal();
      trenchMesh?.dispose();
      trenchMesh = null;
      trenchMeshMeta = null;
      cloudVolume?.dispose();
      cloudVolume = null;
      volumeMeta = null;
      cthRelief?.dispose();
      cthRelief = null;
      cthMeta = null;
      lastVolumeError = lastCthError = null;
      physicalPresentation?.dispose();
      physicalPresentation = null;
      globalTerrainRelief?.dispose();
      globalTerrainRelief = null;
      oceanSurface?.dispose();
      oceanSurface = null;
      defaultPhysicalReady = false;
      globalReliefError = null;
      oceanSurfaceError = null;
      polarSurface?.dispose();
      polarSurface = null;
      removeCloud();
      trenchSample = null;
      cameraReadoutRemove?.();
      cameraReadoutRemove = null;
      cameraDetailRemove?.();
      cameraDetailRemove = null;
      if (featureRequestHandler) {
        document.removeEventListener(
          "earthus:v2-feature-request",
          featureRequestHandler,
        );
        featureRequestHandler = null;
      }
      if (earthClickHandler) {
        document.removeEventListener("click", earthClickHandler, true);
        earthClickHandler = null;
      }
      for (const layer of [
        cityLightsLayer,
        detailLayer,
        baseLayer,
        polarBaseLayer,
      ]) {
        if (!layer || !viewer?.imageryLayers) continue;
        try {
          viewer.imageryLayers.remove(layer, true);
        } catch (_) {}
      }
      if (globalThis.__earthusV2CanonicalEsriImageryLayer === detailLayer)
        globalThis.__earthusV2CanonicalEsriImageryLayer = null;
      if (waterRestore !== null && scene?.globe)
        scene.globe.showWaterEffect = waterRestore;
      waterRestore = null;
      terrainProvider = surfaceTerrainProvider = bathyTerrainProvider = null;
      polarBaseLayer = baseLayer = detailLayer = cityLightsLayer = null;
      sourceBadge?.remove?.();
      sourceBadge = null;
      terrainTruth = bathymetryTruth = polarTruth = "UNINITIALIZED";
      waterTruth = "NO_WATER_MASK";
      activeMode = "EARTH";
      cloudFidelity = "OFF";
    },
  });
}
