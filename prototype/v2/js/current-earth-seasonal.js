/* EARTHUS V2 — Current Earth seasonal surface.
 *
 * Lightweight GLOBAL/CONTINENT context only. This module never creates a Viewer,
 * never blocks the base Earth, and never upgrades provider truth on failure.
 *
 * NOAA / U.S. National Ice Center IMS is an analyst-produced, daily Northern
 * Hemisphere snow/ice analysis. It is useful as an OBSERVED context layer, not as
 * an emergency decision surface and not as snow-depth/SWE truth.
 */

const IMS_SERVICE = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/usnic_ims_snow_ice_1km/ImageServer';
const IMS_RASTER_FUNCTION = 'rft_usnic_ims_1km';
const CREDIT = 'NOAA · U.S. National Ice Center · IMS Snow and Ice Analysis';
const VERSION = 'earthus.current-earth-seasonal.v1';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function buildExportUrl() {
  const params = new URLSearchParams({
    bbox: '-180,0,180,90',
    bboxSR: '4326',
    imageSR: '4326',
    size: '2048,1024',
    format: 'png32',
    transparent: 'true',
    interpolation: 'RSP_NearestNeighbor',
    renderingRule: JSON.stringify({ rasterFunction: IMS_RASTER_FUNCTION }),
    f: 'image',
  });
  return `${IMS_SERVICE}/exportImage?${params.toString()}`;
}

async function readLatestCatalogTimestamp(signal) {
  try {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: 'idp_filedate,idp_ingestdate,idp_validtime',
      orderByFields: 'idp_filedate DESC',
      resultRecordCount: '1',
      returnGeometry: 'false',
      f: 'json',
    });
    const response = await fetch(`${IMS_SERVICE}/query?${params.toString()}`, { cache: 'no-store', signal });
    if (!response.ok) return null;
    const json = await response.json();
    const attrs = json?.features?.[0]?.attributes || null;
    if (!attrs) return null;
    const epoch = finite(attrs.idp_validtime, finite(attrs.idp_filedate, finite(attrs.idp_ingestdate)));
    return epoch == null ? null : new Date(epoch).toISOString();
  } catch (_) {
    return null;
  }
}

function alphaForScope(scope) {
  return ({ GLOBAL: .52, CONTINENT: .44, COUNTRY: .26, REGION: 0, LOCAL: 0, UNDERWATER: 0 })[scope] ?? .38;
}

function scopeFromRuntime() {
  return globalThis.__earthusV2Intelligence?.snapshot?.()?.context?.viewScope || 'GLOBAL';
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
  let latestValidAt = null;
  let truthState = 'INSUFFICIENT_DATA';
  let errorMessage = null;
  let scope = scopeFromRuntime();

  try {
    task = tasks?.begin?.('current-earth-seasonal', {
      label: 'Current Earth · Snow & Ice',
      provider: 'NOAA · USNIC IMS 1 km',
      stage: 'observed snow/ice surface',
      indeterminate: true,
      retryable: true,
      cancellable: false,
    }) || null;

    const metadataResponse = await fetch(`${IMS_SERVICE}?f=json`, { cache: 'no-store', signal: abort.signal });
    if (!metadataResponse.ok) throw new Error(`IMS_METADATA_${metadataResponse.status}`);
    const metadata = await metadataResponse.json();
    if (!String(metadata?.name || '').includes('usnic_ims_snow_ice_1km')) throw new Error('IMS_METADATA_IDENTITY_MISMATCH');
    const functions = Array.isArray(metadata?.rasterFunctionInfos) ? metadata.rasterFunctionInfos.map(item => item?.name) : [];
    if (!functions.includes(IMS_RASTER_FUNCTION)) throw new Error('IMS_RASTER_FUNCTION_UNAVAILABLE');

    latestValidAt = await readLatestCatalogTimestamp(abort.signal);
    const provider = await C.SingleTileImageryProvider.fromUrl(buildExportUrl(), {
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
    task?.complete?.({ stage: latestValidAt ? `IMS ${latestValidAt}` : 'IMS current daily analysis' });
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
    validAt: () => latestValidAt,
    scope: () => scope,
    layer: () => layer,
    diagnostics: () => Object.freeze({
      service: IMS_SERVICE,
      rasterFunction: IMS_RASTER_FUNCTION,
      validAt: latestValidAt,
      truthState,
      error: errorMessage,
      semanticMeaning: 'SNOW_ICE_EXTENT_NOT_DEPTH',
      operationalCaveat: 'CONTEXT_ONLY_NOT_EMERGENCY_DECISION_SURFACE',
    }),
    async refresh() {
      if (disposed) return false;
      latestValidAt = await readLatestCatalogTimestamp(abort.signal);
      return latestValidAt;
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
