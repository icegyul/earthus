import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const out = path.resolve(process.env.EARTHUS_V2_CURRENT_EARTH_OUTPUT || path.join(root, 'output/v2-current-earth-seasonal'));
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
const CLOUD = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const IMS_SERVICE = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/usnic_ims_snow_ice_1km/ImageServer';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml' };
const VIEWPORT = { width: 1280, height: 800 };
let imsSnapshotPromise = null;
const sourceEvidence = [];

async function sourceFetch(url) {
  const r = await fetch(url, { cache:'no-store', headers:{ 'User-Agent':'earthus-v2-ci/1.0' } });
  sourceEvidence.push({ url, status:r.status, contentType:r.headers.get('content-type') || null });
  if (!r.ok) throw new Error(`SOURCE_${r.status}:${url}`);
  return r;
}

async function getImsSnapshot() {
  if (imsSnapshotPromise) return imsSnapshotPromise;
  imsSnapshotPromise = (async () => {
    const metadata = await (await sourceFetch(`${IMS_SERVICE}?f=json`)).json();
    const functions = (metadata?.rasterFunctionInfos || []).map(item => item?.name);
    assert.ok(functions.includes('rft_usnic_ims_1km'), 'IMS_RASTER_FUNCTION_UNAVAILABLE');

    const query = new URLSearchParams({
      where:'1=1', outFields:'idp_filedate,idp_ingestdate,idp_validtime', orderByFields:'idp_filedate DESC',
      resultRecordCount:'1', returnGeometry:'false', f:'json',
    });
    let validAt = null;
    try {
      const q = await (await sourceFetch(`${IMS_SERVICE}/query?${query}`)).json();
      const a = q?.features?.[0]?.attributes || {};
      const epoch = [a.idp_validtime, a.idp_filedate, a.idp_ingestdate].map(Number).find(Number.isFinite);
      if (epoch != null) validAt = new Date(epoch).toISOString();
    } catch (_) {}

    const params = new URLSearchParams({
      bbox:'-180,0,180,90', bboxSR:'4326', imageSR:'4326', size:'2048,1024', format:'png32',
      transparent:'true', interpolation:'RSP_NearestNeighbor',
      renderingRule:JSON.stringify({ rasterFunction:'rft_usnic_ims_1km' }), f:'image',
    });
    const imageResponse = await sourceFetch(`${IMS_SERVICE}/exportImage?${params}`);
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    assert.ok(bytes.length > 10_000, `IMS_IMAGE_TOO_SMALL:${bytes.length}`);
    assert.deepEqual([...bytes.subarray(0,4)], [0x89,0x50,0x4e,0x47], 'IMS_NOT_PNG');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return {
      bytes,
      receipt:{
        schemaVersion:'earthus.provider-receipt.v1', source:'NOAA_USNIC_IMS_1KM', provider:'NOAA / U.S. National Ice Center',
        product:'Interactive Multisensor Snow and Ice Mapping System (IMS) 1 km', truthState:'OBSERVED',
        semanticMeaning:'SNOW_ICE_EXTENT_NOT_DEPTH', spatialCoverage:'NORTHERN_HEMISPHERE_0_TO_90N', nominalResolutionM:1000,
        updateCadence:'DAILY_00UTC_SERVICE', validAt, retrievedAt:new Date().toISOString(), sourceUrl:IMS_SERVICE,
        rasterFunction:'rft_usnic_ims_1km', sha256, bytes:bytes.length,
        rights:{ credit:'National Oceanic & Atmospheric Administration, U.S. National Ice Center, National Weather Service', sourcePublic:true },
        caveat:'Context layer only; not snow depth/SWE and not an emergency decision surface.',
      },
    };
  })();
  return imsSnapshotPromise;
}

function server() {
  return http.createServer(async (req, res) => {
    let u, p;
    try { u = new URL(req.url, 'http://x'); p = decodeURIComponent(u.pathname); }
    catch { res.writeHead(400).end(); return; }
    if (p === '/v2/data/current-earth/snow-ice.meta.json') {
      try {
        const snap = await getImsSnapshot();
        res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }).end(JSON.stringify(snap.receipt));
      } catch (error) { res.writeHead(502).end(String(error)); }
      return;
    }
    if (p === '/v2/data/current-earth/snow-ice.png') {
      try {
        const snap = await getImsSnapshot();
        res.writeHead(200, { 'Content-Type':'image/png', 'Content-Length':String(snap.bytes.length), 'Cache-Control':'no-store' }).end(snap.bytes);
      } catch (error) { res.writeHead(502).end(String(error)); }
      return;
    }
    if (p.startsWith('/clouds/')) {
      try {
        const r = await fetch(CLOUD + p, { cache:'no-store' });
        const b = Buffer.from(await r.arrayBuffer());
        res.writeHead(r.status, { 'Content-Type':r.headers.get('content-type') || 'application/octet-stream', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' }).end(b);
      } catch (error) { res.writeHead(502).end(String(error)); }
      return;
    }
    if (p === '/' || p === '/v2' || p === '/v2/') p = '/v2/index.html';
    const f = path.resolve(prototypeRoot, '.' + p);
    if (!f.startsWith(prototypeRoot + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(f, (e, b) => e ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type':MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' }).end(b));
  });
}

async function wait(page, fn, ms = 70000, label = 'WAIT_TIMEOUT') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await page.evaluate(fn)) return true; } catch {}
    await page.waitForTimeout(180);
  }
  throw new Error(label);
}

fs.mkdirSync(out, { recursive:true });
const srv = server();
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport:VIEWPORT, deviceScaleFactor:1 });
page.setDefaultTimeout(100000);
const evidence = { ok:false, status:'FOUNDATION_CODE', sourceEvidence, browserCacheResponses:[], upstreamBrowserRequests:[], consoleErrors:[] };

page.on('request', request => {
  if (request.url().includes('mapservices.weather.noaa.gov')) evidence.upstreamBrowserRequests.push(request.url());
});
page.on('response', response => {
  if (response.url().includes('/v2/data/current-earth/')) evidence.browserCacheResponses.push({ url:response.url(), status:response.status(), contentType:response.headers()['content-type'] || null });
});
page.on('console', msg => { if (msg.type() === 'error') evidence.consoleErrors.push(msg.text()); });

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(page, () => document.documentElement.dataset.c === '1' && !!window.__earthusV2?.realEarth, 65000, 'BASE_EARTH_TIMEOUT');
  await wait(page, () => globalThis.__earthusV2Intelligence?.engineId === 'FND-017', 30000, 'FND017_BOOT_TIMEOUT');
  await wait(page, () => globalThis.__earthusV2SeasonalCurrentEarth?.truthState?.() === 'OBSERVED', 70000, 'IMS_OBSERVED_TIMEOUT');

  await page.evaluate(() => {
    const v = window.__earthusV2.viewer;
    v.camera.cancelFlight?.();
    v.camera.setView({ destination:Cesium.Cartesian3.fromDegrees(92,42,29_000_000), orientation:{ heading:0, pitch:Cesium.Math.toRadians(-90), roll:0 } });
    globalThis.__earthusV2Intelligence?.update?.('seasonal-browser-global');
    v.scene.requestRender();
  });
  await page.waitForTimeout(4500);

  const state = await page.evaluate(() => {
    const current = globalThis.__earthusV2SeasonalCurrentEarth;
    const intel = globalThis.__earthusV2Intelligence?.snapshot?.();
    const layer = current?.layer?.();
    return {
      viewerCount:document.querySelectorAll('.cesium-viewer').length,
      canvasCount:document.querySelectorAll('#g .cesium-widget canvas').length,
      truthState:current?.truthState?.(), validAt:current?.validAt?.(), scope:current?.scope?.(), receipt:current?.receipt?.(), diagnostics:current?.diagnostics?.(),
      layerShow:layer?.show, layerAlpha:layer?.alpha, providerType:layer?.imageryProvider?.constructor?.name || null,
      intelScope:intel?.context?.viewScope || null, terrainTruth:window.__earthusV2?.realEarth?.terrainTruth?.() || null,
    };
  });

  assert.equal(state.viewerCount, 1, `viewerCount:${state.viewerCount}`);
  assert.equal(state.canvasCount, 1, `canvasCount:${state.canvasCount}`);
  assert.equal(state.truthState, 'OBSERVED');
  assert.equal(state.intelScope, 'GLOBAL');
  assert.equal(state.layerShow, true);
  assert.ok(state.layerAlpha >= .4 && state.layerAlpha <= .65, `layerAlpha:${state.layerAlpha}`);
  assert.equal(state.providerType, 'SingleTileImageryProvider');
  assert.equal(evidence.upstreamBrowserRequests.length, 0, 'BROWSER_DIRECT_PROVIDER_ACCESS_FORBIDDEN');
  assert.ok(evidence.browserCacheResponses.some(r => r.status === 200 && /snow-ice\.png/.test(r.url)), 'EARTHUS_CACHE_IMAGE_RESPONSE_MISSING');
  assert.ok(sourceEvidence.some(r => r.status === 200 && /exportImage/i.test(r.url)), 'IMS_EXPORT_IMAGE_SOURCE_MISSING');

  await page.screenshot({ path:path.join(out, '01-current-earth-snow-ice.png'), fullPage:true });
  evidence.state = state;
  evidence.ok = true;
  evidence.status = 'REAL_DATA_WIRED';
  evidence.dataPlane = 'REAL_NOAA -> CI_EARTHUS_CACHE_CONTRACT -> BROWSER';
  evidence.productionCachePublished = false;
  evidence.url = page.url();
  evidence.branch = process.env.GITHUB_REF_NAME || null;
  evidence.head = process.env.GITHUB_SHA || null;
  evidence.timestamp = new Date().toISOString();
  evidence.browser = 'Chromium / Playwright';
  evidence.viewport = VIEWPORT;
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(evidence, null, 2));
  console.log('P1 CURRENT EARTH SEASONAL: REAL_DATA_WIRED');
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.error = String(error?.stack || error);
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
