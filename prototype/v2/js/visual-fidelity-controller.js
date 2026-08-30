/* EARTHUS V2 — camera-aware visual fidelity controller.
 * Presentation/LOD only. Provider truth, terrain elevations and cloud heights are untouched.
 */
import { TrenchBathymetryMeshRuntime } from "./trench-bathymetry-mesh.js";

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / Math.max(1e-9, b - a));
  return t * t * (3 - 2 * t);
};
function providerUrl(provider) {
  return String(
    provider?._resource?.url || provider?._url || provider?.url || "",
  );
}
function allLayers(viewer) {
  const out = [];
  for (let i = 0; i < viewer.imageryLayers.length; i++)
    out.push(viewer.imageryLayers.get(i));
  return out;
}
function findEsriDetail(viewer) {
  return (
    allLayers(viewer).find((l) =>
      /World_Imagery\/MapServer/i.test(providerUrl(l?.imageryProvider)),
    ) || null
  );
}
function findNasaLayers(viewer) {
  return allLayers(viewer).filter((l) =>
    /gibs\.earthdata\.nasa\.gov/i.test(providerUrl(l?.imageryProvider)),
  );
}
function findShadow(viewer, C) {
  for (let i = viewer.imageryLayers.length - 1; i >= 0; i--) {
    const layer = viewer.imageryLayers.get(i);
    if (layer?.__earthusV2CloudShadow === true) return layer;
  }
  return null;
}
function findCloudShell(viewer, C) {
  const list = viewer.scene.primitives;
  for (let i = 0; i < list.length; i++) {
    const p = list.get(i),
      a = p?.appearance;
    if (
      a instanceof C.EllipsoidSurfaceAppearance &&
      a?.material?.type === "Image"
    )
      return p;
  }
  return null;
}
function shellAlpha(heightM) {
  if (heightM <= 220_000) return 0;
  if (heightM < 600_000) return 0.08 + 0.22 * smooth(220_000, 600_000, heightM);
  if (heightM < 1_800_000)
    return 0.3 + 0.38 * smooth(600_000, 1_800_000, heightM);
  // Keep observed cloud structure legible without whitening the entire global
  // Earth. Regional CTH/volume modes provide the deeper cloud presentation.
  return 0.45 + 0.05 * smooth(1_800_000, 5_000_000, heightM);
}
function shadowAlpha(heightM) {
  if (heightM <= 180_000) return 0;
  if (heightM < 700_000) return 0.03 + 0.08 * smooth(180_000, 700_000, heightM);
  return 0.11 + 0.11 * smooth(700_000, 3_000_000, heightM);
}
export function installVisualFidelityController({ runtime = null } = {}) {
  if (globalThis.__earthusV2VisualFidelityController)
    return globalThis.__earthusV2VisualFidelityController;
  const root = globalThis.__earthusV2,
    real = runtime || root?.realEarth,
    viewer = root?.viewer,
    C = globalThis.Cesium;
  if (!real || !viewer || !C)
    throw new Error("V2_VISUAL_FIDELITY_RUNTIME_REQUIRED");
  const scene = viewer.scene,
    originalGlobeShow = scene.globe.show,
    originalBackground = scene.backgroundColor,
    originalMse = scene.globe.maximumScreenSpaceError,
    originalPreloadSiblings = scene.globe.preloadSiblings,
    originalGlobeLighting = scene.globe.enableLighting,
    originalLight = scene.light,
    layerRestore = new Map();
  let detail = real.detailImageryLayer?.() || findEsriDetail(viewer),
    nasaLayers = [],
    shadow = null,
    shell = null,
    disposed = false,
    underwaterAdjusted = false,
    trenchAdjusted = false,
    closeSurfaceLod = false,
    underwaterLayerGrade = false,
    underwaterLight = null,
    underwaterDetailRuntime = null,
    underwaterDetailMeta = null,
    underwaterDetailPromise = null;
  function rememberLayer(layer) {
    if (layer && !layerRestore.has(layer))
      layerRestore.set(layer, {
        show: layer.show,
        alpha: layer.alpha,
        brightness: layer.brightness,
        saturation: layer.saturation,
        contrast: layer.contrast,
        gamma: layer.gamma,
      });
  }
  function restoreLayerStyle(layer) {
    const state = layerRestore.get(layer);
    if (!state || !layer) return;
    if (state.show != null) layer.show = state.show;
    if (state.alpha != null) layer.alpha = state.alpha;
    if (state.brightness != null) layer.brightness = state.brightness;
    if (state.saturation != null) layer.saturation = state.saturation;
    if (state.contrast != null) layer.contrast = state.contrast;
    if (state.gamma != null) layer.gamma = state.gamma;
  }
  function restoreSurfaceLayers() {
    if (!closeSurfaceLod) return;
    for (const layer of layerRestore.keys()) restoreLayerStyle(layer);
    scene.globe.maximumScreenSpaceError = originalMse;
    scene.globe.preloadSiblings = originalPreloadSiblings;
    closeSurfaceLod = false;
  }
  function restoreUnderwaterLayerGrade() {
    if (!underwaterLayerGrade) return;
    for (const layer of layerRestore.keys()) restoreLayerStyle(layer);
    underwaterLayerGrade = false;
  }
  function applyNaturalColorGrade({ heightM, terrain }) {
    if (terrain !== "ESRI_TERRAIN3D") return;
    detail = real.detailImageryLayer?.() || detail || findEsriDetail(viewer);
    nasaLayers = nasaLayers.length ? nasaLayers : findNasaLayers(viewer);
    if (detail) {
      rememberLayer(detail);
      detail.brightness = 0.96;
      detail.saturation = 0.88;
      detail.contrast = 1.035;
      detail.gamma = 1.02;
    }
    const t = smooth(450_000, 5_000_000, heightM);
    for (const layer of nasaLayers) {
      rememberLayer(layer);
      // The former high-altitude grade suppressed Blue Marble saturation until
      // the first Earth failed its own chroma gate. Preserve source colours and
      // use only a restrained contrast lift; no geometry or data value changes.
      layer.brightness = 0.98 - 0.02 * t;
      layer.saturation = 1.1 - 0.02 * t;
      layer.contrast = 1.1 + 0.05 * t;
      layer.gamma = 0.99 + 0.01 * t;
    }
  }
  function applySurfaceDetailLod({ heightM, latAbs, terrain }) {
    detail = real.detailImageryLayer?.() || detail || findEsriDetail(viewer);
    nasaLayers = nasaLayers.length ? nasaLayers : findNasaLayers(viewer);
    const close =
      terrain === "ESRI_TERRAIN3D" &&
      heightM > 0 &&
      heightM < 320_000 &&
      latAbs < 70;
    if (close) {
      scene.globe.maximumScreenSpaceError = 1.25;
      scene.globe.preloadSiblings = false;
      if (detail) {
        rememberLayer(detail);
        detail.show = true;
        detail.alpha = 1;
        detail.brightness = 0.97;
        detail.saturation = 0.92;
        detail.contrast = 1.035;
      }
      for (const layer of nasaLayers) {
        const url = providerUrl(layer?.imageryProvider);
        rememberLayer(layer);
        if (/VIIRS_CityLights/i.test(url)) {
          layer.show = false;
          continue;
        }
        layer.show = true;
        layer.alpha = 1;
      }
      closeSurfaceLod = true;
      return true;
    }
    restoreSurfaceLayers();
    if (terrain === "ESRI_TERRAIN3D")
      scene.globe.maximumScreenSpaceError = originalMse;
    applyNaturalColorGrade({ heightM, terrain });
    return false;
  }
  function applyUnderwaterTerrainGrade() {
    detail = real.detailImageryLayer?.() || detail || findEsriDetail(viewer);
    nasaLayers = nasaLayers.length ? nasaLayers : findNasaLayers(viewer);
    if (detail) {
      rememberLayer(detail);
      detail.show = true;
      detail.alpha = 0.035;
      detail.brightness = 0.94;
      detail.saturation = 0.72;
      detail.contrast = 1.08;
      detail.gamma = 1.0;
    }
    for (const layer of nasaLayers) {
      const url = providerUrl(layer?.imageryProvider);
      rememberLayer(layer);
      if (/VIIRS_CityLights/i.test(url)) {
        layer.show = false;
        continue;
      }
      if (/BlueMarble/i.test(url)) {
        layer.show = true;
        layer.alpha = Math.max(0.72, Number(layer.alpha) || 0);
        layer.brightness = 1.08;
        layer.saturation = 0.68;
        layer.contrast = 1.14;
        layer.gamma = 0.96;
      }
    }
    underwaterLayerGrade = true;
  }
  function cameraBasis(destination, target) {
    const direction = C.Cartesian3.normalize(
        C.Cartesian3.subtract(target, destination, new C.Cartesian3()),
        new C.Cartesian3(),
      ),
      surfaceUp = C.Ellipsoid.WGS84.geodeticSurfaceNormal(
        destination,
        new C.Cartesian3(),
      ),
      right = C.Cartesian3.normalize(
        C.Cartesian3.cross(direction, surfaceUp, new C.Cartesian3()),
        new C.Cartesian3(),
      ),
      up = C.Cartesian3.normalize(
        C.Cartesian3.cross(right, direction, new C.Cartesian3()),
        new C.Cartesian3(),
      );
    return { direction, up };
  }
  function aimAtTrench(meta) {
    const d = meta?.deepestCoordinate;
    if (
      !d ||
      ![d.longitudeDeg, d.latitudeDeg, d.heightM].every(Number.isFinite)
    )
      return false;
    const destination = C.Cartesian3.fromDegrees(
        d.longitudeDeg - 0.62,
        d.latitudeDeg - 0.44,
        78_000,
      ),
      target = C.Cartesian3.fromDegrees(
        d.longitudeDeg,
        d.latitudeDeg,
        d.heightM,
      ),
      orientation = cameraBasis(destination, target);
    viewer.camera.setView({ destination, orientation });
    scene.requestRender();
    return true;
  }
  function aimAtActualDeepest(meta) {
    const d = meta?.deepestCoordinate;
    if (
      !d ||
      ![d.longitudeDeg, d.latitudeDeg, d.heightM].every(Number.isFinite)
    )
      return false;
    const cameraHeight = clamp(d.heightM + 9300, -1800, -900),
      destination = C.Cartesian3.fromDegrees(
        d.longitudeDeg - 0.2,
        d.latitudeDeg - 0.16,
        cameraHeight,
      ),
      target = C.Cartesian3.fromDegrees(
        d.longitudeDeg,
        d.latitudeDeg,
        d.heightM,
      ),
      orientation = cameraBasis(destination, target);
    viewer.camera.setView({ destination, orientation });
    scene.requestRender();
    return true;
  }
  function underwaterLightDirection() {
    const forward = C.Cartesian3.normalize(
        C.Cartesian3.clone(viewer.camera.directionWC, new C.Cartesian3()),
        new C.Cartesian3(),
      ),
      right = C.Cartesian3.normalize(
        C.Cartesian3.clone(viewer.camera.rightWC, new C.Cartesian3()),
        new C.Cartesian3(),
      ),
      up = C.Cartesian3.normalize(
        C.Cartesian3.clone(viewer.camera.upWC, new C.Cartesian3()),
        new C.Cartesian3(),
      ),
      direction = new C.Cartesian3();
    C.Cartesian3.multiplyByScalar(forward, 0.48, direction);
    C.Cartesian3.add(
      direction,
      C.Cartesian3.multiplyByScalar(right, 0.74, new C.Cartesian3()),
      direction,
    );
    C.Cartesian3.add(
      direction,
      C.Cartesian3.multiplyByScalar(up, -0.22, new C.Cartesian3()),
      direction,
    );
    return C.Cartesian3.normalize(direction, direction);
  }
  function applyUnderwaterLight() {
    scene.globe.enableLighting = true;
    if (!C.DirectionalLight) return;
    const direction = underwaterLightDirection();
    if (!underwaterLight)
      underwaterLight = new C.DirectionalLight({
        direction,
        color: C.Color.fromCssColorString("#d9eef7"),
        intensity: 1.82,
      });
    else C.Cartesian3.clone(direction, underwaterLight.direction);
    scene.light = underwaterLight;
  }
  function restoreSceneLight() {
    scene.globe.enableLighting = originalGlobeLighting;
    scene.light = originalLight;
  }
  function applyIntelligenceRenderPolicy() {
    const policy = globalThis.__earthusV2IntelligenceSnapshot?.renderPolicy;
    if (!policy) return false;
    if (Number.isFinite(policy.maximumScreenSpaceError))
      scene.globe.maximumScreenSpaceError = policy.maximumScreenSpaceError;
    if (typeof policy.preloadSiblings === "boolean")
      scene.globe.preloadSiblings = policy.preloadSiblings;
    if (
      "requestRenderMode" in scene &&
      typeof policy.requestRenderMode === "boolean"
    )
      scene.requestRenderMode = policy.requestRenderMode;
    return true;
  }
  function ensureUnderwaterDetail(trenchMeta) {
    if (disposed || underwaterDetailMeta)
      return underwaterDetailPromise || Promise.resolve(underwaterDetailMeta);
    if (underwaterDetailPromise) return underwaterDetailPromise;
    const d = trenchMeta?.deepestCoordinate;
    if (
      !d ||
      ![d.longitudeDeg, d.latitudeDeg].every(Number.isFinite) ||
      !viewer.terrainProvider
    )
      return Promise.reject(new Error("UNDERWATER_DETAIL_SOURCE_REQUIRED"));
    underwaterDetailRuntime = new TrenchBathymetryMeshRuntime({
      viewer,
      Cesium: C,
      role: "underwater-detail",
    });
    underwaterDetailPromise = underwaterDetailRuntime
      .load({
        terrainProvider: viewer.terrainProvider,
        centerLon: d.longitudeDeg,
        centerLat: d.latitudeDeg,
        lonSpan: 1.05,
        latSpan: 0.84,
        nx: 193,
        ny: 157,
        samplingLevel: 13,
      })
      .then((meta) => {
        if (disposed) return null;
        underwaterDetailMeta = meta;
        globalThis.__earthusV2UnderwaterDetailMeta = meta;
        underwaterDetailRuntime.setVisible(true);
        const overview = globalThis.__earthusV2TrenchBathymetryPrimitive;
        if (overview) overview.show = false;
        scene.globe.show = false;
        underwaterAdjusted = false;
        aimAtActualDeepest(meta);
        applyUnderwaterLight();
        scene.requestRender();
        return meta;
      })
      .catch((error) => {
        console.warn("[v2-visual/underwater-detail]", error?.message || error);
        underwaterDetailRuntime?.dispose();
        underwaterDetailRuntime = null;
        underwaterDetailPromise = null;
        globalThis.__earthusV2UnderwaterDetailMeta = null;
        return null;
      });
    return underwaterDetailPromise;
  }
  function update() {
    if (disposed || viewer.isDestroyed?.()) return;
    const cart = viewer.camera.positionCartographic;
    if (!cart) return;
    let h = Number(cart.height || 0);
    const lat = Math.abs(C.Math.toDegrees(cart.latitude || 0)),
      terrain = real.terrainTruth?.(),
      fidelity = real.cloudFidelity?.(),
      trenchMeta = real.trenchMeshTruth?.();
    const polarFocused = lat >= 68 && h >= 0 && h <= 6_000_000;
    real.setPolarVisible?.(polarFocused, polarFocused ? 1 : 0);
    shadow = shadow || findShadow(viewer, C);
    shell = shell || findCloudShell(viewer, C);
    const closeSurface = applySurfaceDetailLod({
      heightM: h,
      latAbs: lat,
      terrain,
    });
    if (detail && !closeSurface) {
      const base = 0.035 + 0.965 * (1 - smooth(1_500_000, 8_500_000, h)),
        polarFade = 1 - smooth(70, 82.2, lat);
      if (terrain === "ESRI_TOPOBATHY3D" && h < 500_000)
        detail.alpha = Math.min(0.08, base);
      else detail.alpha = base * polarFade;
    }
    if (shell) {
      if (fidelity !== "SHELL") {
        shell.show = false;
      } else {
        const a = shellAlpha(h);
        shell.show = a > 0.025;
        const color = shell.appearance?.material?.uniforms?.color;
        if (color)
          shell.appearance.material.uniforms.color = C.Color.WHITE.withAlpha(
            clamp(a, 0, 0.9),
          );
      }
    }
    if (shadow) {
      const a = shadowAlpha(h);
      shadow.alpha = clamp(a, 0, 0.22);
      shadow.show = a > 0.01 && fidelity === "SHELL";
    }
    const trenchPrimitive = globalThis.__earthusV2TrenchBathymetryPrimitive,
      detailPrimitive = globalThis.__earthusV2UnderwaterBathymetryPrimitive,
      underwater = h < -100;
    if (terrain === "ESRI_TOPOBATHY3D" && trenchMeta && !underwater) {
      if (!trenchAdjusted) {
        trenchAdjusted = aimAtTrench(trenchMeta);
        h = Number(viewer.camera.positionCartographic?.height || h);
      }
    } else if (terrain !== "ESRI_TOPOBATHY3D") {
      trenchAdjusted = false;
    }
    if (underwater) {
      restoreSurfaceLayers();
      scene.backgroundColor = C.Color.fromCssColorString("#01070b");
      if (trenchPrimitive) trenchPrimitive.show = false;
      applyUnderwaterTerrainGrade();
      applyUnderwaterLight();
      if (underwaterDetailMeta && detailPrimitive) {
        scene.globe.show = false;
        detailPrimitive.show = true;
        if (!underwaterAdjusted)
          underwaterAdjusted = aimAtActualDeepest(underwaterDetailMeta);
      } else {
        scene.globe.show = true;
        scene.globe.maximumScreenSpaceError = 1.05;
        scene.globe.depthTestAgainstTerrain = true;
        ensureUnderwaterDetail(trenchMeta);
      }
    } else {
      restoreUnderwaterLayerGrade();
      restoreSceneLight();
      scene.globe.show = originalGlobeShow;
      scene.backgroundColor = originalBackground;
      underwaterAdjusted = false;
      if (detailPrimitive) detailPrimitive.show = false;
      if (trenchPrimitive)
        trenchPrimitive.show = terrain === "ESRI_TOPOBATHY3D";
    }
    applyIntelligenceRenderPolicy();
    scene.requestRender();
  }
  const removeChanged = viewer.camera.changed.addEventListener(update),
    removePost = scene.postRender.addEventListener(update);
  const timer = setInterval(update, 900);
  update();
  const controller = Object.freeze({
    update,
    underwaterDetailTruth: () => underwaterDetailMeta,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      restoreSurfaceLayers();
      restoreUnderwaterLayerGrade();
      for (const layer of layerRestore.keys()) restoreLayerStyle(layer);
      scene.globe.maximumScreenSpaceError = originalMse;
      scene.globe.preloadSiblings = originalPreloadSiblings;
      restoreSceneLight();
      underwaterDetailRuntime?.dispose();
      underwaterDetailRuntime = null;
      underwaterDetailMeta = null;
      underwaterDetailPromise = null;
      globalThis.__earthusV2UnderwaterDetailMeta = null;
      try {
        removeChanged?.();
      } catch (_) {}
      try {
        removePost?.();
      } catch (_) {}
      scene.globe.show = originalGlobeShow;
      scene.backgroundColor = originalBackground;
      const trenchPrimitive = globalThis.__earthusV2TrenchBathymetryPrimitive;
      if (trenchPrimitive) trenchPrimitive.show = false;
      globalThis.__earthusV2VisualFidelityController = null;
    },
  });
  globalThis.__earthusV2VisualFidelityController = controller;
  return controller;
}
export async function installWhenReady({ timeoutMs = 30000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (globalThis.__earthusV2?.realEarth && globalThis.__earthusV2?.viewer)
      return installVisualFidelityController();
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("V2_VISUAL_FIDELITY_BOOT_TIMEOUT");
}
