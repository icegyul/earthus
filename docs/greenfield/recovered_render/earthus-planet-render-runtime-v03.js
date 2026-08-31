import { probeDeviceCapabilities } from '../performance-runtime-v01/capability-probe.js';
import { profileById } from '../performance-runtime-v01/quality-profiles.js';
import { ResourceLedger } from '../performance-runtime-v01/resource-ledger.js';
import { AdaptivePerformanceGovernor } from '../performance-runtime-v01/adaptive-performance-governor.js';
import { ExplicitRenderScheduler } from '../performance-runtime-v01/explicit-render-scheduler.js';
import { RuntimePerformanceMonitor } from '../performance-runtime-v01/runtime-performance-monitor.js';
import { createEarthusTerrainEngineV02 } from '../terrain-runtime-v02/earthus-terrain-engine-adapter-v02.js';
import { createEarthusCloudEngineV03 } from '../cloud-runtime-v03/earthus-cloud-engine-adapter-v03.js';
import { createEarthusOceanEngineV02 } from '../ocean-runtime-v02/earthus-ocean-engine-adapter-v02.js';

export async function createEarthusPlanetRenderRuntimeV03({
  Cesium = globalThis.Cesium,
  viewer = globalThis.__earthusViewer,
  terrain = {}, cloud = null,
  capabilityOverrides = {},
  onQualityChange = () => {}
} = {}) {
  if (!viewer || viewer.isDestroyed?.()) throw new Error('EARTHUS_VIEWER_SINGLETON_REQUIRED');
  if (!Cesium) throw new Error('CESIUM_RUNTIME_REQUIRED');

  const scene = viewer.scene;
  const scheduler = new ExplicitRenderScheduler({ scene }); scheduler.configureForIdle();
  const resources = new ResourceLedger();
  const capabilities = probeDeviceCapabilities(capabilityOverrides);
  const initialProfile = capabilities.recommendedProfile;
  const governor = new AdaptivePerformanceGovernor({ initialProfile, maxProfile: capabilities.mobileLike ? 'BALANCED' : 'FULL', onChange: event => applyProfile(event.current, event.reason) });
  const terrainEngine = createEarthusTerrainEngineV02({ Cesium, viewer, scheduler, landSource: terrain.landSource ?? { type: 'ELLIPSOID' }, oceanSource: terrain.oceanSource ?? null });
  const cloudEngine = cloud ? await createEarthusCloudEngineV03({ Cesium, viewer, scheduler, resourceLedger: resources, ...cloud }) : null;
  const oceanEngine = createEarthusOceanEngineV02({ Cesium, viewer, terrain: terrainEngine, scheduler });
  let disposed = false;

  function applyProfile(id, reason = 'initial') {
    const profile = profileById(id);
    viewer.resolutionScale = profile.resolutionScale; viewer.resize?.();
    terrainEngine.applyQuality(profile); cloudEngine?.applyQuality(profile); oceanEngine.applyQuality(profile);
    scheduler.setMaxFps(profile.playback.maxFps); scheduler.request(`quality:${id}`);
    onQualityChange({ id, reason, profile, capabilities });
  }
  applyProfile(initialProfile, 'capability-startup');

  const monitor = new RuntimePerformanceMonitor({
    viewer,
    getVoxelBytes: () => cloudEngine?.voxelBytes?.() ?? 0,
    onWindow: metrics => governor.recordWindow(metrics)
  }).start();

  const visibilityHandler = () => {
    const hidden = globalThis.document?.hidden === true;
    governor.setHidden(hidden);
    if (hidden) scheduler.stopPlayback(); else scheduler.request('document-visible');
  };
  globalThis.document?.addEventListener?.('visibilitychange', visibilityHandler);

  const api = Object.freeze({
    capabilities,
    async setSceneMode(mode, options = {}) {
      if (disposed) throw new Error('PLANET_RENDER_RUNTIME_DISPOSED');
      if (mode === 'EARTH') { await oceanEngine.setMode('SURFACE'); cloudEngine?.setRequestedMode('SHELL'); }
      else if (mode === 'WEATHER') { await terrainEngine.setMode('LAND'); cloudEngine?.setRequestedMode(options.cloudMode ?? 'VOLUME'); }
      else if (mode === 'OCEAN') { await oceanEngine.setMode(options.oceanMode ?? 'SEAFLOOR', options); cloudEngine?.setRequestedMode(options.cloudContext ? 'SHELL' : 'OFF'); }
      else if (mode === 'HAZARD') { await terrainEngine.setMode(options.useBathymetry ? 'OCEAN' : 'LAND'); cloudEngine?.setRequestedMode(options.cloudMode ?? 'RELIEF'); }
      else throw new RangeError(`unsupported scene mode: ${mode}`);
      scheduler.request(`scene:${mode}`);
      return api.snapshot();
    },
    markDynamicActivity(reason, active) { monitor.setActive(reason, Boolean(active)); },
    startPlayback(fps) { monitor.setActive('playback', true); scheduler.startPlayback(fps); },
    stopPlayback() { scheduler.stopPlayback(); monitor.setActive('playback', false); },
    enterUnderwater(params) { return oceanEngine.enterUnderwater(params); },
    exitUnderwater() { return oceanEngine.exitUnderwater(); },
    setCloudMode(mode) { cloudEngine?.setRequestedMode(mode); },
    setQualityCeiling(profileId) { governor.setManualCeiling(profileId); },
    requestRender(reason) { scheduler.request(reason); },
    snapshot() { return { quality: governor.snapshot(), capabilities, resources: resources.snapshot(), cloud: cloudEngine?.runtime?.snapshot?.() ?? null, ocean: oceanEngine.runtime.snapshot(), terrainMode: terrainEngine.runtime.mode, requestRenderMode: scene.requestRenderMode === true }; },
    dispose() {
      if (disposed) return; disposed = true;
      globalThis.document?.removeEventListener?.('visibilitychange', visibilityHandler);
      monitor.dispose(); scheduler.dispose(); cloudEngine?.dispose(); oceanEngine.dispose(); terrainEngine.dispose(); resources.clear();
    }
  });
  return api;
}
