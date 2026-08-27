/* EARTHUS 2.0 provider bridge
 *
 * Bounded bridge from the v2 shell to proven 1.0 public provider contracts.
 * Start with GMGSI clouds because it is a real heavy layer with measurable bytes.
 * Do not duplicate the Cesium Viewer: all layers attach to window.__earthusV2.viewer.
 */
import { API } from '../../js/config.js';

const state = {
  cloudLayer: null,
  cloudObjectUrl: null,
  cloudTime: null,
  requestGeneration: new Map(),
};

function runtime() {
  const rt = window.__earthusV2;
  if (!rt?.viewer || !rt?.tasks || !window.Cesium) throw new Error('V2_RUNTIME_NOT_READY');
  return rt;
}

function nextGeneration(resource) {
  const next = (state.requestGeneration.get(resource) || 0) + 1;
  state.requestGeneration.set(resource, next);
  return next;
}

function assertCurrent(resource, generation, signal) {
  if (signal?.aborted || state.requestGeneration.get(resource) !== generation) {
    throw new DOMException('Replaced by newer request', 'AbortError');
  }
}

async function fetchJson(url, task, { start = 5, end = 18 } = {}) {
  task.update({ stage: 'request', progress: start });
  const response = await fetch(url, { cache: 'no-cache', signal: task.signal });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  task.update({ stage: 'parse', progress: end });
  return response.json();
}

async function fetchBlobWithProgress(url, task, { start = 20, end = 72 } = {}) {
  task.update({ stage: 'request', progress: start });
  const response = await fetch(url, { cache: 'no-cache', signal: task.signal });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader?.();
  if (!reader) {
    task.update({ stage: 'download', indeterminate: true });
    return response.blob();
  }

  let received = 0;
  const chunks = [];
  task.update(total > 0 ? { stage: 'download', progress: start } : { stage: 'download', indeterminate: true });
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      if (total > 0) {
        const ratio = Math.min(1, received / total);
        task.update({ stage: 'download', progress: start + ratio * (end - start) });
      }
    }
  }
  const type = response.headers.get('content-type') || 'application/octet-stream';
  return new Blob(chunks, { type });
}

function waitForRender(viewer, task, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let remove = null;
    let timer = null;
    const finish = error => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { remove?.(); } catch (_) { }
      error ? reject(error) : resolve();
    };
    remove = viewer.scene.postRender.addEventListener(() => finish());
    timer = setTimeout(() => finish(new Error('LAYER_RENDER_TIMEOUT')), timeoutMs);
    task.signal.addEventListener('abort', () => finish(new DOMException('Aborted', 'AbortError')), { once: true });
    viewer.scene.requestRender();
  });
}

async function decodeImage(blob, task) {
  task.update({ stage: 'decode', progress: 76 });
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
      img.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadClouds() {
  const { viewer, tasks } = runtime();
  const resource = 'clouds';
  const generation = nextGeneration(resource);

  return tasks.run(resource, {
    label: '전지구 위성 구름',
    provider: 'NOAA NESDIS GMGSI',
    stage: 'request',
    progress: 2,
    timeoutMs: 25000,
    retryable: true,
    cancellable: true,
  }, async task => {
    const meta = await fetchJson(`${API.CLOUDS}/meta.json`, task);
    assertCurrent(resource, generation, task.signal);
    if (!meta?.time) throw new Error('CLOUD_META_TIME_MISSING');

    // A cache hit is real work saved: do not replay fake download progress.
    if (state.cloudLayer && state.cloudTime === meta.time) {
      task.update({ stage: 'ready', progress: 96 });
      state.cloudLayer.show = true;
      viewer.scene.requestRender();
      return { cached: true, time: meta.time, provider: 'NOAA NESDIS GMGSI' };
    }

    const blob = await fetchBlobWithProgress(
      `${API.CLOUDS}/global.png?t=${encodeURIComponent(meta.time)}`,
      task,
      { start: 20, end: 72 },
    );
    assertCurrent(resource, generation, task.signal);
    const dimensions = await decodeImage(blob, task);
    assertCurrent(resource, generation, task.signal);

    if (!Number.isFinite(Number(meta.south)) || !Number.isFinite(Number(meta.north))) {
      throw new Error('CLOUD_BOUNDS_MISSING');
    }
    const objectUrl = URL.createObjectURL(blob);
    let nextLayer = null;
    try {
      task.update({ stage: 'layer', progress: 84 });
      const provider = new Cesium.SingleTileImageryProvider({
        url: objectUrl,
        rectangle: Cesium.Rectangle.fromDegrees(-180, Number(meta.south), 180, Number(meta.north)),
        tileWidth: dimensions.width || undefined,
        tileHeight: dimensions.height || undefined,
        credit: meta.credit || 'NOAA NESDIS GMGSI',
      });
      nextLayer = viewer.imageryLayers.addImageryProvider(provider);
      nextLayer.alpha = 0.78;
      nextLayer.brightness = 1.08;
      task.update({ stage: 'attach', progress: 92 });
      await waitForRender(viewer, task);
      assertCurrent(resource, generation, task.signal);

      const previousLayer = state.cloudLayer;
      const previousUrl = state.cloudObjectUrl;
      state.cloudLayer = nextLayer;
      state.cloudObjectUrl = objectUrl;
      state.cloudTime = meta.time;
      nextLayer = null;
      if (previousLayer) {
        try { viewer.imageryLayers.remove(previousLayer, true); } catch (_) { }
      }
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      task.update({ stage: 'ready', progress: 98 });
      document.dispatchEvent(new CustomEvent('earthus:v2-layer-ready', {
        detail: {
          resource,
          source: 'NOAA NESDIS GMGSI',
          observedAt: meta.time,
          provenance: 'OFFICIAL_OBSERVATION',
          credit: meta.credit || 'NOAA NESDIS GMGSI',
        },
      }));
      return { time: meta.time, source: 'NOAA NESDIS GMGSI' };
    } catch (error) {
      if (nextLayer) {
        try { viewer.imageryLayers.remove(nextLayer, true); } catch (_) { }
      }
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  });
}

function hideClouds() {
  const rt = window.__earthusV2;
  if (!rt?.viewer || !state.cloudLayer) return;
  state.cloudLayer.show = false;
  rt.viewer.scene.requestRender();
}

const handlers = new Map([
  ['WEATHER:Clouds', loadClouds],
]);

async function runFeature(menu, feature) {
  const handler = handlers.get(`${menu}:${feature}`);
  if (!handler) return false;
  try {
    await handler();
    return true;
  } catch (error) {
    if (error?.name !== 'AbortError') console.error('[v2 provider]', menu, feature, error);
    return false;
  }
}

document.addEventListener('earthus:v2-feature-request', event => {
  const { menu, feature } = event.detail || {};
  if (!menu || !feature) return;
  runFeature(menu, feature);
});

document.addEventListener('earthus:v2-retry', event => {
  const resource = event.detail?.resource;
  if (resource === 'clouds') loadClouds().catch(error => {
    if (error?.name !== 'AbortError') console.error('[v2 provider retry]', error);
  });
});

window.EarthusV2Providers = Object.freeze({
  loadClouds,
  hideClouds,
  runFeature,
  state: () => Object.freeze({ cloudTime: state.cloudTime, cloudsVisible: !!state.cloudLayer?.show }),
});
