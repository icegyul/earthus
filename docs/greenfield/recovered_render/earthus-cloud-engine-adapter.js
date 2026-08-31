import { AdaptiveCloudRuntime } from './adaptive-cloud-runtime.js';
import { CloudReliefRuntime } from './cloud-relief-runtime.js';
import { RegionalCloudShellRuntime } from './cesium-cloud-shell.js';
import { CesiumWebGpuCameraBridge } from './cesium-webgpu-camera-bridge.js';
import { WebGpuCloudVolumeRenderer, webgpuAvailable } from './webgpu-volume-renderer.js';

/**
 * Actual EARTHUS integration entry point.
 * HARD RULE: this function never creates a Cesium.Viewer. It reuses the existing singleton.
 * Real-data callers must pass preprocessed artifacts with provenance. Synthetic data is blocked.
 */
export async function attachEarthusCloudEngine({
  Cesium = globalThis.Cesium,
  viewer = globalThis.__earthusViewer,
  shell = null,
  relief = null,
  volume = null,
  getDeviceContext = () => ({ deviceClass: 'desktop', thermalState: 'NORMAL' }),
  getCameraHeightM = () => viewer?.scene?.camera?.positionCartographic?.height ?? Infinity,
  userRequestedCloudDetail = () => false,
} = {}) {
  if (!Cesium) throw new Error('EARTHUS_CLOUD_BLOCKED_NO_CESIUM');
  if (!viewer || viewer.isDestroyed?.()) throw new Error('EARTHUS_CLOUD_BLOCKED_NO_EXISTING_VIEWER');

  let shellRuntime = null, reliefRuntime = null, volumeRuntime = null;
  if (shell?.imageUrl && shell?.rectangle) {
    shellRuntime = new RegionalCloudShellRuntime({ viewer, Cesium, ...shell });
  }
  if (relief?.manifestUrl) {
    if (relief.allowSynthetic) throw new Error('EARTHUS_CLOUD_PRODUCTION_SYNTHETIC_FORBIDDEN');
    reliefRuntime = new CloudReliefRuntime({ viewer, Cesium, ...relief, allowSynthetic: false });
  }
  if (volume?.density && volume?.dimensions && volume?.boundsLocalM && volume?.anchor) {
    if (volume.truthClass === 'SYNTHETIC_FIXTURE') throw new Error('EARTHUS_CLOUD_PRODUCTION_SYNTHETIC_FORBIDDEN');
    const bridge = new CesiumWebGpuCameraBridge({ viewer, Cesium,
      anchorLongitudeDeg: volume.anchor.longitudeDeg,
      anchorLatitudeDeg: volume.anchor.latitudeDeg,
      anchorHeightM: volume.anchor.heightM ?? 0,
    });
    volumeRuntime = new WebGpuCloudVolumeRenderer({ viewer, Cesium, bridge, ...volume });
  }

  const runtime = new AdaptiveCloudRuntime({
    shell: shellRuntime, relief: reliefRuntime, volume: volumeRuntime,
    getContext: () => {
      const device = getDeviceContext();
      return {
        cameraHeightM: getCameraHeightM(),
        deviceClass: device.deviceClass ?? 'desktop',
        thermalState: device.thermalState ?? 'NORMAL',
        hasShell: Boolean(shellRuntime),
        hasRelief: Boolean(reliefRuntime),
        hasVolume: Boolean(volumeRuntime),
        webgpuSupported: webgpuAvailable(),
        userRequestedCloudDetail: Boolean(userRequestedCloudDetail()),
      };
    },
  });
  return Object.freeze({
    runtime,
    update: () => runtime.update(),
    dispose: () => runtime.dispose(),
    evidence: Object.freeze({ viewerReused: true, createdCesiumViewer: false, syntheticProductionAllowed: false }),
  });
}
