/* EARTHUS 2.0 Route Intelligence runtime
 *
 * Product rule:
 * - ROUTES replaces the promise of Earthus-owned global commercial-vessel tracking.
 * - Arctic is the flagship surface.
 * - Never invent a static shipping line where the authoritative product is an area,
 *   a dynamic ice-navigation route, or a family of alternative corridors.
 * - Sea-ice / satellite layers keep provider, product and observation-time evidence.
 */

const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?';
const GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi';

const SOURCE_REGISTRY = Object.freeze({
  gibsSeaIce: Object.freeze({
    id: 'nasa-gibs-amsru2-sea-ice-12km',
    provider: 'NASA Earthdata GIBS',
    product: 'GCOM-W1 / AMSR2 Sea Ice Concentration (12 km)',
    layer: 'AMSRU2_Sea_Ice_Concentration_12km',
    matrixSet: 'GoogleMapsCompatible_Level6',
    dataClass: 'SATELLITE_OBSERVATION',
    cadence: 'DAILY',
    access: 'PUBLIC_WMS_WMTS',
    sourceUrl: 'https://nasa-gibs.github.io/gibs-api-docs/access-basics/',
    credit: 'NASA Earthdata GIBS · GCOM-W1/AMSR2',
  }),
  gibsOptical: Object.freeze({
    id: 'nasa-gibs-viirs-noaa20-true-color',
    provider: 'NASA Earthdata GIBS',
    product: 'NOAA-20 / VIIRS Corrected Reflectance (True Color)',
    layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    matrixSet: null,
    dataClass: 'SATELLITE_IMAGERY',
    cadence: 'DAILY_OR_SUBDAILY_PRODUCT',
    access: 'PUBLIC_WMS_WMTS',
    sourceUrl: 'https://worldview.earthdata.nasa.gov/',
    credit: 'NASA Worldview / GIBS · NOAA-20/VIIRS',
  }),
  nsidcSeaIceIndex: Object.freeze({
    id: 'noaa-nsidc-sea-ice-index-v4',
    provider: 'NOAA / NSIDC',
    product: 'Sea Ice Index Version 4 (G02135)',
    dataClass: 'OBSERVATION_CLIMATE_BASELINE',
    cadence: 'DAILY_MONTHLY',
    access: 'PUBLIC_ARCHIVE',
    resolution: '25 km',
    sourceUrl: 'https://nsidc.org/data/g02135/versions/4',
    dataUrl: 'https://noaadata.apps.nsidc.org/NOAA/G02135/',
    credit: 'NOAA/NSIDC Sea Ice Index v4 · G02135',
  }),
  copernicusSeaIce: Object.freeze({
    id: 'copernicus-marine-seaice-glo-nrt-011-001',
    provider: 'Copernicus Marine Service / OSI SAF',
    product: 'SEAICE_GLO_SEAICE_L4_NRT_OBSERVATIONS_011_001',
    dataClass: 'SATELLITE_OBSERVATION',
    cadence: 'DAILY',
    access: 'SERVER_ADAPTER_REQUIRED',
    sourceUrl: 'https://data.marine.copernicus.eu/product/SEAICE_GLO_SEAICE_L4_NRT_OBSERVATIONS_011_001/description',
    credit: 'Copernicus Marine Service · OSI SAF',
  }),
  sentinel1Sar: Object.freeze({
    id: 'copernicus-sentinel-1-sar',
    provider: 'Copernicus Data Space Ecosystem',
    product: 'Sentinel-1 SAR',
    dataClass: 'SAR_IMAGERY',
    cadence: 'PASS_DEPENDENT',
    access: 'AUTH_PROCESSING_REQUIRED',
    sourceUrl: 'https://dataspace.copernicus.eu/',
    credit: 'Copernicus Sentinel-1',
  }),
});

const ROUTES = Object.freeze([
  Object.freeze({
    routeId: 'arctic-nsr', routeClass: 'ARCTIC',
    ko: '북동항로 · NSR', en: 'Northern Sea Route · NSR',
    flagship: true,
    geometry: Object.freeze({
      mode: 'DYNAMIC_CORRIDOR',
      status: 'AUTHORITATIVE_DYNAMIC_ROUTE_REQUIRED',
      source: 'Northern Sea Route General Administration / Rosatom',
      sourceUrl: 'https://nsr.rosatom.ru/en/official-information/boundaries-of-the-water-area-of-the-northern-sea-route/',
      noteKo: '공식 자료는 NSR 수역 경계를 정의하고 실제 항해 경로는 해빙·수문기상·항행 상황에 따라 개발됩니다. 고정 선을 임의 생성하지 않습니다.',
      noteEn: 'The official source defines the NSR water area; navigation routes are developed with ice, hydrometeorological and navigational conditions. Earthus does not invent one fixed line.',
    }),
    modules: Object.freeze(['SEA_ICE', 'SATELLITE', 'WEATHER', 'OCEAN', 'HAZARD', 'NEWS', 'HISTORY']),
  }),
  Object.freeze({
    routeId: 'arctic-nwp', routeClass: 'ARCTIC',
    ko: '북서항로 · NWP', en: 'Northwest Passage · NWP',
    flagship: true,
    geometry: Object.freeze({
      mode: 'MULTI_CORRIDOR',
      status: 'AUTHORITATIVE_GEOMETRY_REQUIRED',
      source: 'Canadian / Arctic reference geometry required',
      sourceUrl: 'https://www.pame.is/ourwork/arctic-shipping',
      noteKo: 'NWP는 하나의 고정 선이 아니라 캐나다 북극 제도 사이의 여러 통과 경로로 구성됩니다. 검증된 회랑 자료가 연결되기 전에는 한 선으로 단정하지 않습니다.',
      noteEn: 'The NWP is a family of passages through the Canadian Arctic Archipelago, not one immutable line. A sourced corridor dataset is required before drawing it as route geometry.',
    }),
    modules: Object.freeze(['SEA_ICE', 'SATELLITE', 'WEATHER', 'OCEAN', 'HAZARD', 'NEWS', 'HISTORY']),
  }),
  Object.freeze({
    routeId: 'arctic-transpolar', routeClass: 'ARCTIC',
    ko: '횡단북극 회랑', en: 'Transpolar corridor',
    flagship: false,
    geometry: Object.freeze({
      mode: 'CONCEPTUAL_CORRIDOR',
      status: 'REFERENCE_REQUIRED',
      source: null,
      sourceUrl: null,
      noteKo: '미래 가능 회랑은 운영 항로처럼 표시하지 않습니다. 권위 있는 참고 geometry가 확보된 경우에만 장기 전망 레이어로 추가합니다.',
      noteEn: 'A future transpolar corridor is not shown as an operational route. It may be added only as sourced long-range reference geometry.',
    }),
    modules: Object.freeze(['SEA_ICE', 'SATELLITE', 'CLIMATE', 'HISTORY']),
  }),
]);

const state = {
  selectedRouteId: 'arctic-nsr',
  seaIceLayer: null,
  opticalLayer: null,
  seaIceTime: null,
  opticalTime: null,
  generations: new Map(),
};

function runtime() {
  const rt = window.__earthusV2;
  if (!rt?.viewer || !rt?.tasks || !window.Cesium) throw new Error('V2_RUNTIME_NOT_READY');
  return rt;
}

function nextGeneration(resource) {
  const value = (state.generations.get(resource) || 0) + 1;
  state.generations.set(resource, value);
  return value;
}

function assertCurrent(resource, generation, signal) {
  if (signal?.aborted || state.generations.get(resource) !== generation) {
    throw new DOMException('Replaced by newer request', 'AbortError');
  }
}

function routeById(id) { return ROUTES.find(route => route.routeId === id) || ROUTES[0]; }

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function installStyles() {
  if (document.getElementById('earthusRouteIntelStyle')) return;
  const style = document.createElement('style');
  style.id = 'earthusRouteIntelStyle';
  style.textContent = `
    #body.route-intel{padding:10px 12px 18px;overflow:auto;height:calc(100% - 106px)}
    .ri-kicker{font-size:7px;letter-spacing:.16em;color:#6f8794;margin:8px 2px 5px}
    .ri-card,.ri-source,.ri-action{width:100%;border:1px solid rgba(188,220,238,.1);background:rgba(255,255,255,.025);border-radius:13px;padding:11px 12px;margin:6px 0;color:#d8e9f1;text-align:left}
    button.ri-card,button.ri-action{cursor:pointer}.ri-card.on{border-color:rgba(112,215,255,.32);background:rgba(112,215,255,.07)}
    .ri-card b,.ri-source b{display:block;font-size:10px;font-weight:550;margin-bottom:5px}.ri-card span,.ri-source span{display:block;font-size:8px;line-height:1.55;color:#768c98}
    .ri-badge{display:inline-flex!important;width:auto!important;margin-bottom:6px;padding:3px 6px;border-radius:999px;border:1px solid rgba(112,215,255,.18);font-size:6px!important;letter-spacing:.12em;color:#82cfe8!important}
    .ri-row{display:flex;gap:6px}.ri-row>*{flex:1}.ri-action{font-size:8px}.ri-action[disabled]{opacity:.4;cursor:not-allowed}
    .ri-status{padding:9px 10px;border-left:2px solid rgba(112,215,255,.35);background:rgba(112,215,255,.035);font-size:8px;line-height:1.65;color:#91a7b2;margin:8px 0 11px}
    .ri-on{color:#76efbc!important}.ri-time{font-family:ui-monospace,monospace;color:#9fb2bd!important}
  `;
  document.head.appendChild(style);
}

function setIntelChrome(title = 'ROUTE INTELLIGENCE') {
  const intel = document.getElementById('intel');
  const tab = document.getElementById('tab');
  const it = document.getElementById('it');
  const stateLabel = document.getElementById('state');
  const now = document.getElementById('now');
  if (intel) intel.hidden = false;
  if (tab) tab.hidden = true;
  if (it) it.textContent = title;
  if (stateLabel) stateLabel.textContent = 'ROUTES';
  if (now) now.textContent = 'OCEAN · ROUTE INTELLIGENCE';
}

function sourceStatus(source, active, time) {
  const stateText = active ? 'VISIBLE' : source.access;
  return `<div class="ri-source"><span class="ri-badge ${active ? 'ri-on' : ''}">${escapeHtml(stateText)}</span>`
    + `<b>${escapeHtml(source.product)}</b><span>${escapeHtml(source.provider)}</span>`
    + `<span>${escapeHtml(source.dataClass)} · ${escapeHtml(source.cadence)}</span>`
    + `<span class="ri-time">${time ? `OBSERVED/VALID · ${escapeHtml(time)}` : 'TIME · provider metadata resolves at load time'}</span></div>`;
}

function renderRouteDetail(routeId) {
  installStyles();
  setIntelChrome();
  state.selectedRouteId = routeId;
  const route = routeById(routeId);
  const body = document.getElementById('body');
  if (!body) return;
  body.className = 'route-intel';
  const ko = document.documentElement.lang !== 'en';
  body.innerHTML = `
    <div class="ri-kicker">ARCTIC · FLAGSHIP</div>
    <button class="ri-action" data-ri-back>← ${ko ? '북극항로 목록' : 'Arctic route list'}</button>
    <div class="ri-card on"><span class="ri-badge">${escapeHtml(route.geometry.mode)}</span><b>${escapeHtml(ko ? route.ko : route.en)}</b>
      <span>${escapeHtml(ko ? route.geometry.noteKo : route.geometry.noteEn)}</span></div>
    <div class="ri-status"><b>GEOMETRY · ${escapeHtml(route.geometry.status)}</b><br>${ko
      ? '검증된 회랑 geometry가 들어오기 전에는 보기 좋은 임의 선을 그리지 않습니다. 북극 환경 레이어는 지금부터 실제 데이터로 볼 수 있습니다.'
      : 'No decorative route line is invented before sourced corridor geometry is connected. Real Arctic environmental layers can be viewed now.'}</div>
    <div class="ri-kicker">LIVE / RECENT CONTEXT</div>
    <div class="ri-row"><button class="ri-action" data-ri-layer="seaice">${state.seaIceLayer?.show ? '✓ ' : ''}${ko ? '해빙 농도' : 'Sea ice'}</button>
      <button class="ri-action" data-ri-layer="optical">${state.opticalLayer?.show ? '✓ ' : ''}${ko ? '위성 실사' : 'Satellite'}</button></div>
    <div class="ri-row"><button class="ri-action" data-ri-arctic>${ko ? '북극으로 이동' : 'Focus Arctic'}</button>
      <button class="ri-action" disabled title="${ko ? '검증된 route geometry 필요' : 'Sourced route geometry required'}">${ko ? '항로선 보기 · 준비중' : 'Route line · source required'}</button></div>
    ${sourceStatus(SOURCE_REGISTRY.gibsSeaIce, !!state.seaIceLayer?.show, state.seaIceTime)}
    ${sourceStatus(SOURCE_REGISTRY.gibsOptical, !!state.opticalLayer?.show, state.opticalTime)}
    <div class="ri-kicker">BASELINE / ADVANCED</div>
    ${sourceStatus(SOURCE_REGISTRY.nsidcSeaIceIndex, false, null)}
    ${sourceStatus(SOURCE_REGISTRY.copernicusSeaIce, false, null)}
    ${sourceStatus(SOURCE_REGISTRY.sentinel1Sar, false, null)}
    <div class="ri-kicker">NEXT MODULES</div>
    <div class="ri-status">WEATHER · OCEAN · HAZARD · RELATED NEWS · HISTORY<br>${ko
      ? '기존 Earthus 기상·해양·재난·뉴스 파이프라인을 route corridor 기준으로 연결합니다.'
      : 'Existing Earthus weather, ocean, hazard and news pipelines will be matched to the route corridor.'}</div>`;

  body.querySelector('[data-ri-back]')?.addEventListener('click', renderRouteHome);
  body.querySelector('[data-ri-arctic]')?.addEventListener('click', focusArctic);
  body.querySelectorAll('[data-ri-layer]').forEach(button => {
    button.addEventListener('click', async () => {
      const kind = button.dataset.riLayer;
      try { await toggleGibsLayer(kind); }
      catch (error) { if (error?.name !== 'AbortError') console.error('[route intelligence layer]', error); }
      renderRouteDetail(state.selectedRouteId);
    });
  });
}

function renderRouteHome() {
  installStyles();
  setIntelChrome();
  const body = document.getElementById('body');
  if (!body) return;
  const ko = document.documentElement.lang !== 'en';
  body.className = 'route-intel';
  body.innerHTML = `
    <div class="ri-kicker">ARCTIC ROUTES · FLAGSHIP</div>
    ${ROUTES.map(route => `<button class="ri-card ${route.routeId === state.selectedRouteId ? 'on' : ''}" data-ri-route="${route.routeId}">`
      + `<span class="ri-badge">${route.flagship ? 'FLAGSHIP' : 'REFERENCE'}</span><b>${escapeHtml(ko ? route.ko : route.en)}</b>`
      + `<span>${escapeHtml(ko ? route.geometry.noteKo : route.geometry.noteEn)}</span></button>`).join('')}
    <div class="ri-kicker">TRADE ROUTES</div>
    <div class="ri-card"><span class="ri-badge">NEXT</span><b>${ko ? '주요 무역항로' : 'Trade Routes'}</b><span>${ko
      ? '수에즈 · 파나마 · 말라카 · 희망봉 등 · 항만/병목·기상·파고·태풍·관련 뉴스'
      : 'Suez · Panama · Malacca · Cape routes · ports/chokepoints, weather, waves, cyclones and related news'}</span></div>
    <div class="ri-kicker">RESEARCH ROUTES</div>
    <div class="ri-card"><span class="ri-badge">NEXT</span><b>${ko ? '연구항로' : 'Research Routes'}</b><span>${ko
      ? '공개된 탐사·해양관측 임무와 관측지점 · 위성·해빙·기후·연구 업데이트'
      : 'Published expedition/ocean-observation missions and stations · satellite, sea ice, climate and research updates'}</span></div>`;
  body.querySelectorAll('[data-ri-route]').forEach(button => {
    button.addEventListener('click', () => renderRouteDetail(button.dataset.riRoute));
  });
}

function focusArctic() {
  const { viewer } = runtime();
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(30, 79, 5_800_000),
    duration: 1.4,
  });
}

function parseLatestDomain(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const domain = [...doc.getElementsByTagNameNS('*', 'Domain')].map(node => node.textContent?.trim()).find(Boolean);
  if (!domain) return null;
  let latest = null;
  for (const part of domain.split(',')) {
    const values = part.trim().split('/').filter(Boolean);
    const candidate = values.length >= 2 ? values[1] : values[0];
    const time = Date.parse(candidate);
    if (Number.isFinite(time) && (!latest || time > Date.parse(latest))) latest = new Date(time).toISOString().slice(0, 10);
  }
  return latest;
}

async function resolveLatestGibsDate(source, task) {
  if (!source.matrixSet) return null;
  const url = new URL(GIBS_WMTS);
  url.searchParams.set('SERVICE', 'WMTS');
  url.searchParams.set('REQUEST', 'DescribeDomains');
  url.searchParams.set('VERSION', '1.0.0');
  url.searchParams.set('LAYER', source.layer);
  url.searchParams.set('TILEMATRIXSET', source.matrixSet);
  const now = new Date();
  const start = new Date(now.getTime() - 45 * 86400e3).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  url.searchParams.set('TIME', `${start}/${end}`);
  task.update({ stage: 'metadata', progress: 12, provider: source.provider });
  try {
    const response = await fetch(url, { cache: 'no-cache', signal: task.signal });
    if (!response.ok) throw new Error(`GIBS_DOMAIN_HTTP_${response.status}`);
    return parseLatestDomain(await response.text());
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    console.warn('[route intelligence] GIBS time metadata unavailable; using provider default', error.message);
    return null;
  }
}

function waitForRender(viewer, task, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    let done = false, remove = null, timer = null;
    const finish = error => {
      if (done) return; done = true;
      if (timer) clearTimeout(timer);
      try { remove?.(); } catch (_) { }
      error ? reject(error) : resolve();
    };
    remove = viewer.scene.postRender.addEventListener(() => finish());
    timer = setTimeout(() => finish(new Error('ARCTIC_LAYER_RENDER_TIMEOUT')), timeoutMs);
    task.signal.addEventListener('abort', () => finish(new DOMException('Aborted', 'AbortError')), { once: true });
    viewer.scene.requestRender();
  });
}

async function loadGibsLayer(kind) {
  const { viewer, tasks } = runtime();
  const isIce = kind === 'seaice';
  const source = isIce ? SOURCE_REGISTRY.gibsSeaIce : SOURCE_REGISTRY.gibsOptical;
  const resource = isIce ? 'arctic-sea-ice' : 'arctic-satellite-optical';
  const layerKey = isIce ? 'seaIceLayer' : 'opticalLayer';
  const timeKey = isIce ? 'seaIceTime' : 'opticalTime';
  const generation = nextGeneration(resource);

  return tasks.run(resource, {
    label: isIce ? '북극 해빙 농도' : '북극 위성 실사',
    provider: source.provider,
    stage: 'metadata', progress: 3,
    timeoutMs: 25000, retryable: true, cancellable: true,
  }, async task => {
    const latest = await resolveLatestGibsDate(source, task);
    assertCurrent(resource, generation, task.signal);
    task.update({ stage: 'provider', progress: latest ? 28 : 20 });
    const provider = new Cesium.WebMapServiceImageryProvider({
      url: GIBS_WMS,
      layers: source.layer,
      parameters: {
        transparent: true,
        format: 'image/png',
        time: latest || 'default',
      },
      credit: source.credit,
    });
    task.update({ stage: 'attach', progress: 62 });
    const nextLayer = viewer.imageryLayers.addImageryProvider(provider);
    nextLayer.alpha = isIce ? 0.78 : 0.72;
    nextLayer.brightness = isIce ? 1.03 : 1.06;
    try {
      task.update({ stage: 'render', indeterminate: true });
      await waitForRender(viewer, task);
      assertCurrent(resource, generation, task.signal);
      const previous = state[layerKey];
      state[layerKey] = nextLayer;
      state[timeKey] = latest || 'GIBS DEFAULT · exact date unresolved';
      if (previous && previous !== nextLayer) {
        try { viewer.imageryLayers.remove(previous, true); } catch (_) { }
      }
      task.update({ stage: 'ready', progress: 98 });
      document.dispatchEvent(new CustomEvent('earthus:v2-layer-ready', { detail: {
        resource,
        routeClass: 'ARCTIC',
        source: source.provider,
        product: source.product,
        observedAt: latest,
        timeMode: latest ? 'RESOLVED' : 'PROVIDER_DEFAULT',
        provenance: source.dataClass,
        credit: source.credit,
      } }));
      return { source: source.provider, product: source.product, observedAt: latest };
    } catch (error) {
      try { viewer.imageryLayers.remove(nextLayer, true); } catch (_) { }
      throw error;
    }
  });
}

async function toggleGibsLayer(kind) {
  const { viewer } = runtime();
  const key = kind === 'seaice' ? 'seaIceLayer' : 'opticalLayer';
  const layer = state[key];
  if (layer?.show) {
    layer.show = false;
    viewer.scene.requestRender();
    return { visible: false };
  }
  if (layer) {
    layer.show = true;
    viewer.scene.requestRender();
    return { visible: true, cached: true };
  }
  await loadGibsLayer(kind);
  return { visible: true };
}

function installRouteChip() {
  const install = () => {
    const chips = document.getElementById('chips');
    const title = document.getElementById('ft');
    if (!chips || title?.textContent !== 'OCEAN' || chips.querySelector('[data-v2-routes]')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.v2Routes = '1'; button.textContent = 'Routes';
    button.addEventListener('click', () => {
      chips.querySelectorAll('button').forEach(item => item.classList.remove('on'));
      button.classList.add('on');
      document.dispatchEvent(new CustomEvent('earthus:v2-feature-request', { detail: { menu: 'OCEAN', feature: 'Routes' } }));
    });
    chips.prepend(button);
  };
  const observer = new MutationObserver(() => queueMicrotask(install));
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  queueMicrotask(install);
}

document.addEventListener('earthus:v2-feature-request', event => {
  const { menu, feature } = event.detail || {};
  if (menu === 'OCEAN' && feature === 'Routes') renderRouteHome();
});

document.addEventListener('earthus:v2-retry', event => {
  const resource = event.detail?.resource;
  if (resource === 'arctic-sea-ice') loadGibsLayer('seaice').then(() => renderRouteDetail(state.selectedRouteId)).catch(() => {});
  if (resource === 'arctic-satellite-optical') loadGibsLayer('optical').then(() => renderRouteDetail(state.selectedRouteId)).catch(() => {});
});

installRouteChip();

window.EarthusRouteIntelligence = Object.freeze({
  routes: ROUTES,
  sources: SOURCE_REGISTRY,
  render: renderRouteHome,
  select: renderRouteDetail,
  focusArctic,
  loadSeaIce: () => loadGibsLayer('seaice'),
  loadOptical: () => loadGibsLayer('optical'),
  state: () => Object.freeze({
    selectedRouteId: state.selectedRouteId,
    seaIceVisible: !!state.seaIceLayer?.show,
    opticalVisible: !!state.opticalLayer?.show,
    seaIceTime: state.seaIceTime,
    opticalTime: state.opticalTime,
  }),
});
