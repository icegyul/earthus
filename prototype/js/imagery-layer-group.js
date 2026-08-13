import { CloudDepthImageryProvider } from './cloud-depth-provider.js';
import { satelliteTileCache } from './satellite-tile-cache.js';
import { assertSatelliteProviderUrl } from './satellite-security.js';
import { visualEffects } from './visual-effect-settings.js';

export const IMAGERY_GROUP_STATE = Object.freeze({
  ACTIVE: 'ACTIVE', REPLACING: 'REPLACING', DISPOSING: 'DISPOSING', DISPOSED: 'DISPOSED',
});

let serial = 0;
const activeGroups = new Set();

function providerUrl(provider) {
  return provider?.url || provider?._resource?.url || provider?._url || null;
}

class SharedOwnerImageryProvider {
  constructor(provider, ownerKey) {
    this.provider = provider;
    this.ownerKey = ownerKey;
    this.prefix = `${ownerKey}/`;
    this.pendingRequests = new Set();
    this.active = true;
  }
  get rectangle() { return this.provider.rectangle; }
  get tileWidth() { return this.provider.tileWidth; }
  get tileHeight() { return this.provider.tileHeight; }
  get maximumLevel() { return this.provider.maximumLevel; }
  get minimumLevel() { return this.provider.minimumLevel; }
  get tilingScheme() { return this.provider.tilingScheme; }
  get tileDiscardPolicy() { return this.provider.tileDiscardPolicy; }
  get errorEvent() { return this.provider.errorEvent; }
  get credit() { return this.provider.credit; }
  get proxy() { return this.provider.proxy; }
  get hasAlphaChannel() { return this.provider.hasAlphaChannel; }
  get ready() { return this.provider.ready ?? true; }
  get readyPromise() { return this.provider.readyPromise ?? Promise.resolve(true); }
  getTileCredits(...args) { return this.provider.getTileCredits?.(...args); }
  pickFeatures(...args) { return this.provider.pickFeatures?.(...args); }

  requestImage(x, y, level, request) {
    if (!this.active) return undefined;
    const key = `${this.prefix}${level}/${x}/${y}`;
    return satelliteTileCache.getOrCreate(key, () => {
      if (!this.active) return undefined;
      if (request) this.pendingRequests.add(request);
      let result;
      try { result = this.provider.requestImage(x, y, level, request); }
      catch (error) { this.pendingRequests.delete(request); throw error; }
      if (result == null) { this.pendingRequests.delete(request); return result; }
      return Promise.resolve(result).finally(() => this.pendingRequests.delete(request));
    });
  }

  dispose() {
    if (!this.active) return;
    this.active = false;
    for (const request of this.pendingRequests) {
      try { request.cancel?.(); } catch (_) { }
    }
    this.pendingRequests.clear();
    satelliteTileCache.deletePrefix(this.prefix);
  }
}

export class ImageryLayerGroup {
  constructor(viewer, { provider = null, depth = null, baseLayer = null, visualLayer = null,
                        ownerKey = null } = {}) {
    this.viewer = viewer;
    this.ownerKey = ownerKey || `visual-${++serial}`;
    this.state = IMAGERY_GROUP_STATE.ACTIVE;
    this.cleanups = new Set();
    this.sharedProvider = null;
    this.depthProvider = null;

    if (provider) {
      assertSatelliteProviderUrl(providerUrl(provider));
      this.sharedProvider = new SharedOwnerImageryProvider(provider, this.ownerKey);
      this.depthProvider = new CloudDepthImageryProvider(this.sharedProvider, {
        ...depth, ownerKey: this.ownerKey, sampleLimit: visualEffects.sampleLimit(),
      });
      this.visualLayer = viewer.imageryLayers.addImageryProvider(this.depthProvider);
      this.baseLayer = viewer.imageryLayers.addImageryProvider(this.sharedProvider);
      this._configureVisual(depth || {});
    } else {
      this.baseLayer = baseLayer;
      this.visualLayer = visualLayer;
    }
    this._attach();
    activeGroups.add(this);
    this.applyVisualMode();
  }

  _configureVisual({ sun = null, alpha = 0.18, dayAlpha = 1, nightAlpha = 1 } = {}) {
    const layer = this.visualLayer;
    layer._earthusCloudRole = sun ? 'sun-shadow' : 'visual-relief';
    layer._earthusDepthBaseAlpha = alpha;
    layer._earthusDepthDayAlpha = dayAlpha;
    layer._earthusDepthNightAlpha = nightAlpha;
    layer.alpha = alpha; layer.dayAlpha = dayAlpha; layer.nightAlpha = nightAlpha;
  }

  _attach() {
    for (const layer of [this.baseLayer, this.visualLayer]) {
      if (layer) layer._earthusImageryGroup = this;
    }
    if (this.baseLayer) this.baseLayer._earthusDepthLayer = this.visualLayer || null;
  }

  addCleanup(fn) { if (typeof fn === 'function') this.cleanups.add(fn); return fn; }
  beginReplace() {
    if (this.state === IMAGERY_GROUP_STATE.ACTIVE) this.state = IMAGERY_GROUP_STATE.REPLACING;
  }

  applyVisualMode() {
    if (!this.visualLayer || this.state === IMAGERY_GROUP_STATE.DISPOSED) return;
    const mode = visualEffects.resolved();
    this.visualLayer.show = mode !== 'off';
    const scale = mode === 'low' ? 0.65 : 1;
    const stateScale = this.visualLayer._earthusFxScale ?? 1;
    this.visualLayer.alpha = (this.visualLayer._earthusDepthBaseAlpha ?? 0.18) * scale * stateScale;
  }

  dispose() {
    if (this.state === IMAGERY_GROUP_STATE.DISPOSING || this.state === IMAGERY_GROUP_STATE.DISPOSED) return;
    this.state = IMAGERY_GROUP_STATE.DISPOSING;
    this.sharedProvider?.dispose();
    this.depthProvider?.dispose?.();
    for (const cleanup of this.cleanups) { try { cleanup(); } catch (_) { } }
    this.cleanups.clear();
    for (const layer of [this.visualLayer, this.baseLayer]) {
      if (!layer) continue;
      try { this.viewer.imageryLayers.remove(layer, true); } catch (_) { }
      layer._earthusImageryGroup = null;
      layer._earthusDepthLayer = null;
    }
    activeGroups.delete(this);
    this.state = IMAGERY_GROUP_STATE.DISPOSED;
  }

  metrics() {
    return { ownerKey: this.ownerKey, state: this.state,
      pendingRequests: this.sharedProvider?.pendingRequests.size || 0,
      hasBase: !!this.baseLayer, hasVisual: !!this.visualLayer };
  }
}

export function adoptImageryLayerGroup(viewer, baseLayer, visualLayer, ownerKey) {
  return new ImageryLayerGroup(viewer, { baseLayer, visualLayer, ownerKey });
}

export function visualPipelineMetrics() {
  return { activeGroups: activeGroups.size, groups: [...activeGroups].map(group => group.metrics()),
    cache: satelliteTileCache.snapshot() };
}

document.addEventListener('earthus:visual-effect-change', () => {
  for (const group of activeGroups) group.applyVisualMode();
  try { globalThis.__earthusViewer?.scene?.requestRender?.(); } catch (_) { }
});
