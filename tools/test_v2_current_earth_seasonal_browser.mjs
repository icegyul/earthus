import assert from 'node:assert/strict';
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
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml' };
const VIEWPORT = { width: 1280, height: 800 };
const IMS = 'mapservices.weather.noaa.gov/raster/rest/services/obs/usnic_ims_snow_ice_1km';

function server() {
  return http.createServer(async (req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (p.startsWith('/clouds/')) {
      try {
        const r = await fetch(CLOUD + p, { cache: 'no-store' });
        const b = Buffer.from(await r.arrayBuffer());
        res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' }).end(b);
      } catch (error) { res.writeHead(502).end(String(error)); }
      return;
    }
    if (p === '/' || p === '/v2' || p === '/v2/') p = '/v2/index.html';
    const f = path.resolve(prototypeRoot, '.' + p);
    if (!f.startsWith(prototypeRoot + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(f, (e, b) => e ? res.writeHead(404).end() : res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' }).end(b));
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

fs.mkdirSync(out, { recursive: true });
const srv = server();
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless:true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport:VIEWPORT, deviceScaleFactor:1 });
page.setDefaultTimeout(100000);
const evidence = { ok:false, status:'FOUNDATION_CODE', imsResponses:[], consoleErrors:[] };

page.on('response', response => {
  const url = response.url();
  if (url.includes(IMS)) evidence.imsResponses.push({ url, status:response.status(), contentType:response.headers()['content-type'] || null });
});
page.on('console', msg => { if (msg.type() === 'error') evidence.consoleErrors.push(msg.text()); });

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(page, () => document.documentElement.dataset.c === '1' && !!window.__earthusV2?.realEarth, 65000, 'BASE_EARTH_TIMEOUT');
  await wait(page, () => globalThis.__earthusV2Intelligence?.engineId === 'FND-017', 30000, 'FND017_BOOT_TIMEOUT');
  await wait(page, () => globalThis.__earthusV2SeasonalCurrentEarth?.truthState?.() === 'OBSERVED', 50000, 'IMS_OBSERVED_TIMEOUT');

  await page.evaluate(() => {
    const v = window.__earthusV2.viewer;
    v.camera.cancelFlight?.();
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(92, 42, 29_000_000),
      orientation: { heading:0, pitch:Cesium.Math.toRadians(-90), roll:0 },
    });
    globalThis.__earthusV2Intelligence?.update?.('seasonal-browser-global');
    v.scene.requestRender();
  });
  await page.waitForTimeout(3500);

  const state = await page.evaluate(() => {
    const current = globalThis.__earthusV2SeasonalCurrentEarth;
    const intel = globalThis.__earthusV2Intelligence?.snapshot?.();
    const layer = current?.layer?.();
    return {
      viewerCount: document.querySelectorAll('.cesium-viewer').length,
      canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
      truthState: current?.truthState?.(),
      validAt: current?.validAt?.(),
      scope: current?.scope?.(),
      diagnostics: current?.diagnostics?.(),
      layerShow: layer?.show,
      layerAlpha: layer?.alpha,
      providerType: layer?.imageryProvider?.constructor?.name || null,
      intelScope: intel?.context?.viewScope || null,
      terrainTruth: window.__earthusV2?.realEarth?.terrainTruth?.() || null,
    };
  });

  assert.equal(state.viewerCount, 1, `viewerCount:${state.viewerCount}`);
  assert.equal(state.canvasCount, 1, `canvasCount:${state.canvasCount}`);
  assert.equal(state.truthState, 'OBSERVED');
  assert.equal(state.intelScope, 'GLOBAL');
  assert.equal(state.layerShow, true);
  assert.ok(state.layerAlpha >= .4 && state.layerAlpha <= .65, `layerAlpha:${state.layerAlpha}`);
  assert.equal(state.providerType, 'SingleTileImageryProvider');
  assert.ok(evidence.imsResponses.some(r => r.status >= 200 && r.status < 300 && /exportImage/i.test(r.url)), 'IMS_EXPORT_IMAGE_RESPONSE_MISSING');

  await page.screenshot({ path:path.join(out, '01-current-earth-snow-ice.png'), fullPage:true });
  evidence.state = state;
  evidence.ok = true;
  evidence.status = 'REAL_DATA_WIRED';
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
