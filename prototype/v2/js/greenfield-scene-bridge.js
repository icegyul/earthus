/* EARTHUS V2 — v2.5.3 greenfield canonical overlay bridge.
 * scope-resolver / physical-3d-policy / scene-evidence-snapshot 계약을
 * 라이브 real-living-earth 런타임에 연결한다. Fail-soft: 브리지 실패가
 * 기본 지구를 막지 않고, 데이터 없는 층을 지어내지 않는다.
 */
import { resolveScope } from "../../js/earthus2/greenfield/scope-resolver.js";
import { buildSceneEvidenceSnapshot } from "../../js/earthus2/greenfield/scene-evidence-snapshot.js";
import {
  PHYSICAL_3D_FALLBACK,
  assertNoPhotoAsWorld,
} from "../../js/earthus2/greenfield/physical-3d-policy.js";

export function deriveSceneTruth({ cameraHeightM, realEarth }) {
  if (!realEarth) throw new TypeError("realEarth runtime required");
  const underwater = Number.isFinite(cameraHeightM) && cameraHeightM < 0;
  const scope = resolveScope({
    cameraHeightM: underwater ? 0 : cameraHeightM,
    underwater,
  });
  const cloudFidelity = realEarth.cloudFidelity?.() || "OFF";
  assertNoPhotoAsWorld(cloudFidelity);
  const visibleSemanticLayers = [];
  const terrain = realEarth.terrainTruth?.();
  if (terrain) visibleSemanticLayers.push(`TERRAIN:${terrain}`);
  const bathymetry = realEarth.bathymetryTruth?.();
  if (bathymetry) visibleSemanticLayers.push(`BATHY:${bathymetry}`);
  const water = realEarth.waterTruth?.();
  if (water) visibleSemanticLayers.push(`WATER:${water}`);
  if (realEarth.polarVisible?.() && realEarth.polarTruth?.())
    visibleSemanticLayers.push(`POLAR:${realEarth.polarTruth()}`);
  if (realEarth.oceanSurfaceSnapshot?.())
    visibleSemanticLayers.push("OCEAN_SURFACE:ACTIVE");
  if (realEarth.atmosphereLightSnapshot?.())
    visibleSemanticLayers.push("ATMOSPHERE:PHYSICAL_LIGHT");
  if (cloudFidelity !== "OFF")
    visibleSemanticLayers.push(`CLOUD:${cloudFidelity}`);
  const truthClasses = [
    realEarth.globalCloudTruth?.()?.truthClass,
    realEarth.layeredCloudTruth?.()?.truthClass,
    realEarth.cthTruth?.()?.truthClass,
    realEarth.volumeTruth?.()?.truthClass,
  ].filter(Boolean);
  return Object.freeze({
    scope,
    underwater,
    cloudFidelity,
    visibleSemanticLayers: Object.freeze(visibleSemanticLayers),
    truthClasses: Object.freeze(truthClasses),
    sourceReadiness: Object.freeze({
      defaultPhysicalReady: realEarth.defaultPhysicalReady?.() === true,
      cloudDiagnostics: realEarth.cloudDiagnostics?.() || null,
    }),
  });
}

export function installGreenfieldSceneBridge({
  root = globalThis,
  pollMs = 200,
  maxWaitMs = 60000,
} = {}) {
  let disposed = false;
  let removeCameraListener = null;
  let currentScope = null;
  let lastTruthError = null;
  const startedAt = Date.now();

  function cameraHeightM(viewer) {
    return viewer?.camera?.positionCartographic?.height ?? NaN;
  }

  function cameraState(viewer) {
    const carto = viewer?.camera?.positionCartographic;
    const degrees = root.Cesium?.Math?.toDegrees;
    return {
      heightM: carto?.height ?? null,
      latitudeDeg:
        carto && degrees ? Number(degrees(carto.latitude).toFixed(5)) : null,
      longitudeDeg:
        carto && degrees ? Number(degrees(carto.longitude).toFixed(5)) : null,
    };
  }

  function evaluate(viewer, realEarth) {
    let truth = null;
    try {
      truth = deriveSceneTruth({ cameraHeightM: cameraHeightM(viewer), realEarth });
      lastTruthError = null;
    } catch (error) {
      lastTruthError = String(error?.message || error);
      console.warn("[v2/greenfield-bridge]", lastTruthError);
      return null;
    }
    if (truth.scope !== currentScope) {
      const previous = currentScope;
      currentScope = truth.scope;
      document.dispatchEvent(
        new CustomEvent("earthus:v2-greenfield-scope", {
          detail: { scope: truth.scope, previous },
        }),
      );
    }
    return truth;
  }

  function bind(api) {
    const { viewer, realEarth } = api;
    evaluate(viewer, realEarth);
    removeCameraListener = viewer.camera.changed.addEventListener(() =>
      evaluate(viewer, realEarth),
    );
    root.__earthusV2Greenfield = Object.freeze({
      contract: "earthus.greenfield.overlay.v1",
      fidelityLadder: PHYSICAL_3D_FALLBACK,
      scope: () => currentScope,
      truth: () => evaluate(viewer, realEarth),
      truthError: () => lastTruthError,
      snapshot: () => {
        const truth = evaluate(viewer, realEarth);
        if (!truth) return null;
        return buildSceneEvidenceSnapshot({
          camera: cameraState(viewer),
          scope: truth.scope,
          time: { mode: "LIVE", capturedAt: new Date().toISOString() },
          visibleSemanticLayers: truth.visibleSemanticLayers,
          truthClasses: truth.truthClasses,
          sourceReadiness: truth.sourceReadiness,
        });
      },
      dispose,
    });
    document.dispatchEvent(
      new CustomEvent("earthus:v2-greenfield-ready", {
        detail: { scope: currentScope },
      }),
    );
  }

  function dispose() {
    disposed = true;
    try {
      removeCameraListener?.();
    } catch (_) {}
    removeCameraListener = null;
    if (root.__earthusV2Greenfield?.contract) root.__earthusV2Greenfield = null;
  }

  function waitForRuntime() {
    if (disposed) return;
    const api = root.__earthusV2;
    if (api?.viewer && api?.realEarth) {
      try {
        bind(api);
      } catch (error) {
        console.warn("[v2/greenfield-bridge]", error?.message || error);
      }
      return;
    }
    if (Date.now() - startedAt > maxWaitMs) {
      console.warn("[v2/greenfield-bridge] RUNTIME_WAIT_TIMEOUT");
      return;
    }
    setTimeout(waitForRuntime, pollMs);
  }

  waitForRuntime();
  window.addEventListener("pagehide", dispose, { once: true });
  return Object.freeze({ dispose });
}
