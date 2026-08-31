import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const cacheBase = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const remotePaths = [
  '/clouds/gfs/volume/east-asia/manifest.json',
  '/clouds/gfs/volume/east-asia/density.u8',
];
const remote = new Map();
for (const pathname of remotePaths) {
  const response = await fetch(`${cacheBase}${pathname}`, { cache: 'no-store' });
  assert.equal(response.ok, true, `LIVE_CLOUD_ARTIFACT_HTTP:${pathname}:${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  remote.set(pathname, {
    bytes,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const liveManifest = JSON.parse(remote.get(remotePaths[0]).bytes.toString('utf8'));
assert.equal(liveManifest.ready, true);
assert.equal(liveManifest.production, true);
assert.equal(liveManifest.synthetic, false);
assert.equal(liveManifest.cloudState?.truthClass, 'MODELLED_NWP');
assert.equal(liveManifest.cloudState?.sourceId, 'NOAA_NCEP_GFS_0P50_NOMADS');
assert.equal(remote.get(remotePaths[1]).bytes.length, liveManifest.byteLength);

const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef
  ? await import(pathToFileURL(path.resolve(moduleRef)).href)
  : await import('playwright');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
};

function server() {
  return http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname); }
    catch { response.writeHead(400).end(); return; }
    const live = remote.get(pathname);
    if (live) {
      response.writeHead(200, {
        'Content-Type': live.contentType,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      }).end(live.bytes);
      return;
    }
    if (pathname === '/' || pathname === '/v2' || pathname === '/v2/') pathname = '/v2/index.html';
    const file = path.resolve(prototypeRoot, `.${pathname}`);
    if (!file.startsWith(`${prototypeRoot}${path.sep}`)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => error
      ? response.writeHead(404).end()
      : response.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
      }).end(bytes));
  });
}

async function wait(page, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: Object.freeze({ saveData: true }),
  });
});
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await wait(page, () => document.documentElement.dataset.c === '1'
    && !!window.__earthusV2?.realEarth, 70_000, 'G5_BOOT_TIMEOUT');
  const selection = await page.evaluate(async () => {
    window.__earthusV2.realEarth.enterEarth({ upgrade: false });
    const result = await window.__earthusV2.realEarth.showBestCloud3d({ focus: true });
    return {
      result,
      fidelity: window.__earthusV2.realEarth.cloudFidelity(),
      layered: window.__earthusV2.realEarth.layeredCloudTruth(),
      diagnostics: window.__earthusV2.realEarth.cloudDiagnostics(),
      atmosphere: window.__earthusV2.realEarth.atmosphereLightSnapshot(),
    };
  });
  assert.equal(selection.result, 'LAYERED');
  assert.equal(selection.fidelity, 'LAYERED');
  assert.match(selection.diagnostics.volume, /GFS_VOLUME_DEVICE_POLICY:SAVE_DATA/);
  assert.equal(selection.diagnostics.layered, null);
  assert.equal(selection.layered.ready, true);
  assert.equal(selection.layered.truthClass, 'MODELLED_NWP_LAYERED');
  assert.equal(selection.layered.sourceId, 'NOAA_NCEP_GFS_0P50_NOMADS');
  assert.equal(selection.layered.validAt, liveManifest.cloudState.validAt);
  assert.equal(selection.layered.freshness.status, 'CURRENT_MODEL_ANALYSIS');
  assert.equal(selection.layered.synthetic, false);
  assert.equal(selection.layered.scope, 'BOUNDED_REGION');
  assert.deepEqual(selection.layered.boundsDegrees, liveManifest.boundsDegrees);
  assert.deepEqual(selection.layered.dimensions, liveManifest.dimensions);
  assert.equal(selection.layered.byteLength, liveManifest.byteLength);
  assert.equal(selection.layered.layerCount, 3);
  assert.equal(selection.layered.visible, true);
  assert.equal(selection.layered.fakeThickness, false);
  assert.equal(selection.layered.renderModel,
    'REAL_GFS_VERTICAL_COLUMNS_COLLAPSED_TO_ZERO_THICKNESS_ALTITUDE_PLANES_WITH_PRESENTATION_ONLY_INTERPOLATION');
  assert.equal(selection.layered.texturePresentation,
    '4X_LINEAR_INTERPOLATION_EDGE_FEATHER_NO_DENSITY_INVENTION');
  assert.deepEqual(selection.layered.layers.map(layer => layer.id), ['LOW', 'MID', 'HIGH']);
  assert.ok(selection.layered.layers[0].altitudeM < selection.layered.layers[1].altitudeM);
  assert.ok(selection.layered.layers[1].altitudeM < selection.layered.layers[2].altitudeM);
  assert.ok(selection.layered.layers.every(layer => layer.maximumDensity > 0));
  assert.ok(selection.layered.layers.every(layer => layer.coverage > 0));
  assert.equal(selection.atmosphere.cloudShadow.status, 'UNAVAILABLE_NO_VALID_OBSERVATION');
  assert.equal(selection.atmosphere.cloudShadow.enabled, false);

  await page.evaluate(() => {
    for (const selector of ['#ui', '#shade', '#earthusV2RealSources', '#resourceLoading', '.cesium-viewer-bottom']) {
      document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForTimeout(1_200);
  const output = process.env.EARTHUS_V2_G5_LAYERED_OUTPUT || '/private/tmp/earthus-v2-g5-layered.png';
  const cloudOn = await page.screenshot({ path: output, fullPage: true });
  const primitiveState = await page.evaluate(() => {
    const viewer = window.__earthusV2.viewer;
    const ids = [];
    let observedShellCount = 0;
    for (let index = 0; index < viewer.scene.primitives.length; index += 1) {
      const primitive = viewer.scene.primitives.get(index);
      if (primitive?.__earthusV2GfsLayeredCloud) {
        ids.push(primitive.__earthusV2GfsLayeredCloud);
        primitive.show = false;
      }
      if (primitive?.__earthusV2ObservedCloudShell === true) observedShellCount += 1;
    }
    viewer.scene.requestRender();
    return { ids, observedShellCount };
  });
  assert.deepEqual(primitiveState.ids.sort(), ['HIGH', 'LOW', 'MID']);
  assert.equal(primitiveState.observedShellCount, 0);
  await page.waitForTimeout(800);
  const cloudOff = await page.screenshot({ path: output.replace(/\.png$/i, '-off.png'), fullPage: true });
  const cloudOnHash = createHash('sha256').update(cloudOn).digest('hex');
  const cloudOffHash = createHash('sha256').update(cloudOff).digest('hex');
  assert.notEqual(cloudOnHash, cloudOffHash, 'G5_LAYERED_CLOUD_NOT_VISIBLE_IN_FRAME');

  const runtime = await page.evaluate(async () => {
    const viewer = window.__earthusV2.viewer;
    const idleFrames1s = await new Promise(resolve => {
      let frames = 0;
      const remove = viewer.scene.postRender.addEventListener(() => { frames += 1; });
      viewer.scene.requestRender();
      setTimeout(() => { try { remove(); } catch {} resolve(frames); }, 1000);
    });
    return {
      viewerCount: globalThis.__earthusViewer === viewer ? 1 : 0,
      canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
      requestRenderMode: viewer.scene.requestRenderMode,
      idleFrames1s,
    };
  });
  assert.equal(runtime.viewerCount, 1);
  assert.equal(runtime.canvasCount, 1);
  assert.equal(runtime.requestRenderMode, true);
  assert.ok(runtime.idleFrames1s <= 3, `G5_IDLE_FRAMES:${runtime.idleFrames1s}`);
  assert.equal(errors.length, 0, errors.join('\n'));

  console.log('V2 G5 REAL LAYERED CLOUD: PASS', JSON.stringify({
    live: {
      manifestSha256: remote.get(remotePaths[0]).sha256,
      densitySha256: remote.get(remotePaths[1]).sha256,
      validAt: liveManifest.cloudState.validAt,
      byteLength: liveManifest.byteLength,
      boundsDegrees: liveManifest.boundsDegrees,
      dimensions: liveManifest.dimensions,
    },
    selection,
    primitiveState,
    runtime,
    cloudOnHash,
    cloudOffHash,
  }));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
