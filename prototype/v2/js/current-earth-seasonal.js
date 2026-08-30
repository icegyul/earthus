/* EARTHUS V2 — Current Earth seasonal surface.
 *
 * Lightweight GLOBAL/CONTINENT context only. This module never creates a Viewer,
 * never blocks the base Earth, and never calls the upstream NOAA provider from the
 * browser. Provider access is adapter-first: AWS cache adapter -> S3/CloudFront ->
 * /v2/data/current-earth/* -> browser.
 *
 * NOAA / U.S. National Ice Center IMS is an analyst-produced, daily Northern
 * Hemisphere snow/ice analysis. It is useful as an OBSERVED context layer, not as
 * an emergency decision surface and not as snow-depth/SWE truth.
 */

const PUBLIC_META = '/v2/data/current-earth/snow-ice.meta.json';
const PUBLIC_IMAGE = '/v2/data/current-earth/snow-ice.png';
const CREDIT = 'NOAA · U.S. National Ice Center · IMS Snow and Ice Analysis';
const VERSION = 'earthus.current-earth-seasonal.v1.1';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function alphaForScope(scope) {
  return ({ GLOBAL: .52, CONTINENT: .44, COUNTRY: .26, REGION: 0, LOCAL: 0, UNDERWATER: 0 })[scope] ?? .38;
}

function scopeFromRuntime() {
  return globalThis.__earthusV2Intelligence?.snapshot?.()?.context?.viewScope || 'GLOBAL';
}

function validateReceipt(receipt) {
  if (receipt?.source !== 'NOAA_USNIC_IMS_1KM') throw new Error('CURRENT_EARTH_RECEIPT_SOURCE_MISMATCH');
  if (receipt?.truthState !== 'OBSERVED') throw new Error('CURRENT_EARTH_RECEIPT_TRUTH_MISMATCH');
  if (receipt?.semanticMeaning !== 'SNOW_ICE_EXTENT_NOT_DEPTH') throw new Error('CURRENT_EARTH_RECEIPT_SEMANTIC_MISMATCH');
  if (!receipt?.sha256 || typeof receipt.sha256 !== 'string') throw new Error('CURRENT_EARTH_RECEIPT_SHA_REQUIRED');
  return receipt;
}

export async function installSeasonalCurrentEarth({ viewer, tasks = null, signal = null } = {}) {
  if (!viewer?.imageryLayers || !globalThis.Cesium) throw new Error('CURRENT_EARTH_VIEWER_REQUIRED');
  const C = globalThis.Cesium;
  const abort = new AbortController();
  if (signal) {
    if (signal.aborted) abort.abort(signal.reason);
    else signal.addEventListener('abort', () => abort.abort(signal.reason), { once: true });
  }

  let task = null;
  let layer = null;
  let disposed = false;
  let receipt = null;
  let truthState = 'INSUFFICIENT_DATA';
  let errorMessage = null;
  let scope = scopeFromRuntime();

  try {
    task = tasks?.begin?.('current-earth-seasonal', {
      label: 'Current Earth · Snow & Ice',
      provider: 'Earthus cache · NOAA USNIC IMS 1 km',
      stage: 'observed snow/ice surface',
      indeterminate: true,
      retryable: true,
      cancellable: false,
    }) || null;

    const metaResponse = await fetch(PUBLIC_META, { cache: 'no-store', signal: abort.signal });
    if (!metaResponse.ok) throw new Error(`CURRENT_EARTH_META_${metaResponse.status}`);
    receipt = validateReceipt(await metaResponse.json());

    const imageUrl = `${PUBLIC_IMAGE}?v=${encodeURIComponent(receipt.sha256.slice(0, 16))}`;
    const provider = await C.SingleTileImageryProvider.fromUrl(imageUrl, {
      rectangle: C.Rectangle.fromDegrees(-180, 0, 180, 90),
      credit: CREDIT,
    });
    if (disposed || abort.signal.aborted) throw new Error('CURRENT_EARTH_CANCELLED');

    layer = viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = alphaForScope(scope);
    layer.brightness = 1.04;
    layer.contrast = 1.08;
    layer.saturation = .38;
    layer.gamma = 1.02;
    layer.show = layer.alpha > .01;
    truthState = 'OBSERVED';
    task?.complete?.({ stage: receipt.validAt ? `IMS ${receipt.validAt}` : 'IMS current daily analysis' });
    viewer.scene.requestRender();
  } catch (error) {
    errorMessage = String(error?.message || error);
    if (errorMessage !== 'CURRENT_EARTH_CANCELLED') console.warn('[v2/current-earth-seasonal]', errorMessage);
    task?.fail?.(error, { errorCode: 'CURRENT_EARTH_SEASONAL_UNAVAILABLE', retryable: true });
    truthState = 'INSUFFICIENT_DATA';
  }

  const onContext = event => {
    if (!layer || disposed) return;
    scope = event?.detail?.context?.viewScope || scopeFromRuntime();
    const alpha = alphaForScope(scope);
    layer.alpha = alpha;
    layer.show = alpha > .01;
    viewer.scene.requestRender();
  };
  document.addEventListener('earthus:v2-intelligence-context', onContext);

  const controller = Object.freeze({
    version: VERSION,
    source: 'NOAA_USNIC_IMS_1KM',
    truthState: () => truthState,
    validAt: () => receipt?.validAt || null,
    receipt: () => receipt,
    scope: () => scope,
    layer: () => layer,
    diagnostics: () => Object.freeze({
      metaUrl: PUBLIC_META,
      imageUrl: PUBLIC_IMAGE,
      validAt: receipt?.validAt || null,
      retrievedAt: receipt?.retrievedAt || null,
      sha256: receipt?.sha256 || null,
      truthState,
      error: errorMessage,
      semanticMeaning: 'SNOW_ICE_EXTENT_NOT_DEPTH',
      operationalCaveat: 'CONTEXT_ONLY_NOT_EMERGENCY_DECISION_SURFACE',
      upstreamBrowserAccess: false,
    }),
    async refresh() {
      if (disposed) return false;
      const response = await fetch(PUBLIC_META, { cache: 'no-store', signal: abort.signal });
      if (!response.ok) return false;
      receipt = validateReceipt(await response.json());
      return receipt;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      abort.abort('disposed');
      document.removeEventListener('earthus:v2-intelligence-context', onContext);
      if (layer) {
        try { viewer.imageryLayers.remove(layer, true); } catch (_) {}
        layer = null;
      }
      if (globalThis.__earthusV2SeasonalCurrentEarth === controller) globalThis.__earthusV2SeasonalCurrentEarth = null;
      viewer.scene.requestRender();
    },
  });

  globalThis.__earthusV2SeasonalCurrentEarth = controller;
  return controller;
}

export async function installWhenReady({ timeoutMs = 45000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const root = globalThis.__earthusV2;
    if (root?.viewer && root?.realEarth) return installSeasonalCurrentEarth({ viewer: root.viewer, tasks: root.tasks });
    await sleep(120);
  }
  throw new Error('CURRENT_EARTH_SEASONAL_BOOT_TIMEOUT');
}
