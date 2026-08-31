import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef
  ? await import(pathToFileURL(path.resolve(moduleRef)).href)
  : await import('playwright');
const CLOUD = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.u8': 'application/octet-stream',
};

function server() {
  return http.createServer(async (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (pathname.startsWith('/clouds/')) {
      try {
        const response = await fetch(CLOUD + pathname, { cache: 'no-store' });
        res.writeHead(response.status, {
          'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store',
        }).end(Buffer.from(await response.arrayBuffer()));
      } catch (error) { res.writeHead(502).end(String(error)); }
      return;
    }
    if (pathname === '/' || pathname === '/v2' || pathname === '/v2/') pathname = '/v2/index.html';
    const file = path.resolve(prototypeRoot, '.' + pathname);
    if (!file.startsWith(prototypeRoot + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => error
      ? res.writeHead(404).end()
      : res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
      }).end(bytes));
  });
}

async function wait(page, predicate, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await page.evaluate(predicate)) return; } catch {}
    await page.waitForTimeout(180);
  }
  throw new Error(label);
}

const srv = server();
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.EARTHUS_CHROMIUM_EXECUTABLE || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const terrainRequests = [];
const failedRequests = [];
const httpErrors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('request', request => {
  if (/elevation3d\.arcgis\.com\/arcgis\/rest\/services\/WorldElevation3D\/Terrain3D/i.test(request.url())) {
    terrainRequests.push(request.url());
  }
});
page.on('requestfailed', request => {
  failedRequests.push({ url: request.url(), error: request.failure()?.errorText || null });
});
page.on('response', response => {
  if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
});

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await wait(page, () => document.documentElement.dataset.c === '1'
    && !!window.__earthusV2?.realEarth, 65000, 'DEFAULT_EARTH_BOOT_TIMEOUT');
  await wait(page, () => window.__earthusV2.realEarth.defaultPhysicalReady?.() === true,
    Number(process.env.EARTHUS_V2_DEFAULT_PHYSICAL_TIMEOUT || 70000),
    'DEFAULT_PHYSICAL_EARTH_TIMEOUT');
  await wait(page, () => window.__earthusV2.realEarth.globalTerrainReliefSnapshot?.()?.ready === true,
    Number(process.env.EARTHUS_V2_GLOBAL_RELIEF_TIMEOUT || 70000),
    'GLOBAL_TERRAIN_RELIEF_TIMEOUT');

  let visualTilesReady = false;
  let tileReadyStreak = 0;
  const tileReadyDeadline = Date.now() + 10_000;
  while (Date.now() < tileReadyDeadline) {
    const loaded = await page.evaluate(() => window.__earthusV2.viewer.scene.globe.tilesLoaded === true);
    tileReadyStreak = loaded ? tileReadyStreak + 1 : 0;
    if (tileReadyStreak >= 3) {
      visualTilesReady = true;
      break;
    }
    await page.waitForTimeout(250);
  }

  const state = await page.evaluate(async () => {
    const v = window.__earthusV2.viewer;
    const real = window.__earthusV2.realEarth;
    const C = window.Cesium;
    const sourcePoint = C.Cartographic.fromDegrees(86.925, 27.9881);
    const [sampled] = await C.sampleTerrainMostDetailed(v.terrainProvider, [sourcePoint]);
    const ellipsoidPoint = C.Cartesian3.fromRadians(sampled.longitude, sampled.latitude, 0);
    const terrainPoint = C.Cartesian3.fromRadians(sampled.longitude, sampled.latitude, sampled.height);
    const ellipsoidPx = C.SceneTransforms.worldToWindowCoordinates(v.scene, ellipsoidPoint);
    const terrainPx = C.SceneTransforms.worldToWindowCoordinates(v.scene, terrainPoint);
    const tiles = v.scene.globe?._surface?._tilesToRender || [];
    const imageryUrls = [];
    for (let index = 0; index < v.imageryLayers.length; index += 1) {
      const provider = v.imageryLayers.get(index)?.imageryProvider;
      const url = provider?.url || provider?._resource?.url || provider?._url || null;
      imageryUrls.push(String(url || '').startsWith('data:') ? 'data:image' : url);
    }
    const idleFrames1s = await new Promise(resolve => {
      let frames = 0;
      const remove = v.scene.postRender.addEventListener(() => { frames += 1; });
      v.scene.requestRender();
      setTimeout(() => {
        try { remove(); } catch {}
        resolve(frames);
      }, 1000);
    });
    return {
      cameraHeight: v.camera.positionCartographic.height,
      cloudFidelity: real.cloudFidelity(),
      defaultPhysical: real.defaultPhysicalSnapshot(),
      globalRelief: real.globalTerrainReliefSnapshot?.() || null,
      materialType: v.scene.globe.material?.type || null,
      verticalExaggeration: v.scene.verticalExaggeration,
      terrainProviderClass: v.terrainProvider?.constructor?.name || null,
      terrainProviderUrl: v.terrainProvider?._resource?.url
        || v.terrainProvider?._resource?._url
        || v.terrainProvider?._url
        || null,
      sampledReliefM: sampled.height,
      reliefScreenDeltaPx: ellipsoidPx && terrainPx
        ? Math.hypot(ellipsoidPx.x - terrainPx.x, ellipsoidPx.y - terrainPx.y)
        : 0,
      terrainTileLevels: tiles.map(tile => tile.level),
      tilesLoaded: v.scene.globe.tilesLoaded,
      lighting: v.scene.globe.enableLighting,
      imageryUrls,
      imageryLayerCount: v.imageryLayers.length,
      primitiveCount: v.scene.primitives.length,
      requestRenderMode: v.scene.requestRenderMode,
      idleFrames1s,
      scope: globalThis.__earthusV2IntelligenceSnapshot?.context?.viewScope || null,
      canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });

  state.esriTerrainRequests = terrainRequests.length;
  state.visualTilesReady = visualTilesReady;
  state.failedRequests = failedRequests;
  state.httpErrors = httpErrors;
  console.log('EARTHUS V2 G2 RUNTIME', JSON.stringify(state));

  assert.equal(state.canvasCount, 1);
  assert.ok(state.overflow <= 0);
  assert.ok(state.cameraHeight >= 13_000_000 && state.cameraHeight <= 16_000_000,
    `DEFAULT_CAMERA_FRAME_INVALID:${state.cameraHeight}`);
  assert.equal(state.verticalExaggeration, 2.2,
    'GLOBAL default view must apply the labeled presentation scale (PD 2026-08-31: 원거리 입체감)');
  assert.equal(state.materialType, 'EarthusTerrainRelief');
  assert.equal(state.defaultPhysical.terrainScale, 2.2);
  assert.equal(state.defaultPhysical.terrainScaleClass,
    'ESRI_TERRAIN3D_LABELED_PRESENTATION_SCALE_2.2X');
  assert.ok(state.defaultPhysical.maximumScreenSpaceError <= 1.25,
    `GLOBAL_TERRAIN_LOD_TOO_COARSE:${state.defaultPhysical.maximumScreenSpaceError}`);
  assert.equal(state.defaultPhysical.reliefMaterialSource, 'ESRI_TERRAIN3D_HEIGHT_SLOPE');
  assert.equal(state.defaultPhysical.oceanMaterial, null);
  assert.equal(state.globalRelief?.ready, true);
  assert.equal(state.globalRelief?.sourceId, 'ESRI_WORLDELEVATION3D_TERRAIN3D');
  assert.equal(state.globalRelief?.synthetic, false);
  assert.ok(state.globalRelief?.sampleCount >= 10_000,
    `GLOBAL_RELIEF_SAMPLE_COUNT:${state.globalRelief?.sampleCount}`);
  assert.ok(state.globalRelief?.maxHeightM > 5_000,
    `GLOBAL_RELIEF_MAX_HEIGHT:${state.globalRelief?.maxHeightM}`);
  assert.ok(state.globalRelief?.loadDurationMs > 0 && state.globalRelief?.loadDurationMs < 15_000,
    `GLOBAL_RELIEF_LOAD_DURATION:${state.globalRelief?.loadDurationMs}`);
  assert.equal(state.globalRelief?.layerAttached, true);
  assert.equal(state.globalRelief?.visible, true);
  assert.equal(state.globalRelief?.terrainScale, 1);
  assert.match(String(state.terrainProviderUrl), /WorldElevation3D\/Terrain3D/i);
  assert.ok(state.esriTerrainRequests > 0, 'NO_ESRI_TERRAIN_REQUESTS');
  assert.ok(state.sampledReliefM > 5_000, `SAMPLED_RELIEF_TOO_LOW:${state.sampledReliefM}`);
  assert.ok(state.reliefScreenDeltaPx > 0.02, `TERRAIN_SCREEN_RESPONSE_MISSING:${state.reliefScreenDeltaPx}`);
  assert.ok(state.terrainTileLevels.length > 0, 'NO_TERRAIN_TILES_TO_RENDER');
  assert.equal(state.lighting, true);
  assert.equal(state.cloudFidelity, 'OFF');
  assert.equal(state.requestRenderMode, true);
  assert.ok(state.idleFrames1s <= 3, `IDLE_RENDER_NOT_BOUNDED:${state.idleFrames1s}`);
  assert.equal(state.imageryUrls.some(url => /wms\/epsg4326/i.test(String(url))), false,
    `DUPLICATE_GLOBAL_WMS:${JSON.stringify(state.imageryUrls)}`);
  assert.equal(errors.length, 0, errors.join('\n'));

  const output = process.env.EARTHUS_V2_DEFAULT_PHYSICAL_OUTPUT || '/private/tmp/earthus-v2-default-physical.png';
  await page.screenshot({ path: output, fullPage: true });
  await page.evaluate(() => {
    for (const selector of ['#ui', '#shade', '#earthusV2RealSources', '#resourceLoading', '.cesium-viewer-bottom']) {
      const element = document.querySelector(selector);
      if (element) element.style.setProperty('display', 'none', 'important');
    }
  });
  const uiOffOutput = output.replace(/\.png$/i, '-ui-off.png');
  await page.waitForTimeout(800);
  const reliefOn = await page.screenshot({ path: uiOffOutput, fullPage: true });
  await page.evaluate(() => {
    const v = window.__earthusV2.viewer;
    for (let index = 0; index < v.imageryLayers.length; index += 1) {
      const layer = v.imageryLayers.get(index);
      if (layer?.__earthusV2GlobalTerrainRelief === true) layer.show = false;
    }
    v.scene.requestRender();
  });
  await page.waitForTimeout(800);
  const reliefOffOutput = output.replace(/\.png$/i, '-relief-off.png');
  const reliefOff = await page.screenshot({ path: reliefOffOutput, fullPage: true });
  const onHash = createHash('sha256').update(reliefOn).digest('hex');
  const offHash = createHash('sha256').update(reliefOff).digest('hex');
  assert.notEqual(onHash, offHash, 'GLOBAL_RELIEF_NOT_VISIBLE_IN_FRAME');
  state.reliefFrameSha256 = onHash;
  state.reliefOffFrameSha256 = offHash;
  console.log('EARTHUS V2 DEFAULT PHYSICAL EARTH: PASS', JSON.stringify(state));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
