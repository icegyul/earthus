import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const fixtureDir = path.resolve(
  process.env.EARTHUS_GFS_GLOBAL_LOW_FIXTURE_DIR || '/private/tmp/earthus-gfs-global-low',
);
const manifestBytes = fs.readFileSync(path.join(fixtureDir, 'manifest.json'));
const densityBytes = fs.readFileSync(path.join(fixtureDir, 'density-bands.u8'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
assert.equal(manifest.production, false);
assert.equal(manifest.artifactState, 'LOCAL_GENERATED_FROM_LIVE_NOAA_SOURCE');
assert.equal(manifest.densitySha256, createHash('sha256').update(densityBytes).digest('hex'));

const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef
  ? await import(pathToFileURL(path.resolve(moduleRef)).href)
  : await import('playwright');
const pngModuleRef = process.env.EARTHUS_PNGJS_MODULE;
const { PNG } = pngModuleRef
  ? await import(pathToFileURL(path.resolve(pngModuleRef)).href)
  : await import('pngjs');
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
    if (pathname === '/clouds/gfs/global-low/manifest.json') {
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
      }).end(manifestBytes);
      return;
    }
    if (pathname === '/clouds/gfs/global-low/density-bands.u8') {
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
      }).end(densityBytes);
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

function imageMetrics(buffer) {
  const png = PNG.sync.read(buffer);
  let count = 0, luminance = 0, white = 0, chroma = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    const red = png.data[index] / 255;
    const green = png.data[index + 1] / 255;
    const blue = png.data[index + 2] / 255;
    count += 1;
    luminance += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    chroma += Math.max(red, green, blue) - Math.min(red, green, blue);
    if (red > 0.96 && green > 0.96 && blue > 0.96) white += 1;
  }
  return {
    mean: luminance / count,
    whiteRatio: white / count,
    chromaMean: chroma / count,
  };
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
  globalThis.__earthusV2AllowLocalGlobalCloudArtifact = true;
});
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await wait(page, () => document.documentElement.dataset.c === '1'
    && !!window.__earthusV2?.realEarth, 70_000, 'G5_GLOBAL_BOOT_TIMEOUT');
  const selection = await page.evaluate(async () => {
    const real = window.__earthusV2.realEarth;
    real.enterEarth({ upgrade: false });
    const result = await real.showBestCloud3d({ focus: false });
    return {
      result,
      fidelity: real.cloudFidelity(),
      global: real.globalCloudTruth(),
      diagnostics: real.cloudDiagnostics(),
      ocean: real.oceanSurfaceSnapshot(),
      atmosphere: real.atmosphereLightSnapshot(),
    };
  });
  assert.equal(selection.result, 'GLOBAL_LAYERED');
  assert.equal(selection.fidelity, 'GLOBAL_LAYERED');
  assert.equal(selection.diagnostics.global, null);
  assert.equal(selection.diagnostics.volume, null);
  assert.equal(selection.global.ready, true);
  assert.equal(selection.global.truthClass, 'MODELLED_NWP_GLOBAL_LAYERED');
  assert.equal(selection.global.sourceId, 'NOAA_NCEP_GFS_1P00_NOMADS');
  assert.equal(selection.global.validAt, manifest.cloudState.validAt);
  assert.equal(selection.global.forecastStepHours, 0);
  assert.equal(selection.global.analysisNotForecast, true);
  assert.equal(selection.global.freshness.status, 'CURRENT_MODEL_ANALYSIS');
  assert.equal(selection.global.production, false);
  assert.equal(selection.global.deploymentState, 'LOCAL_NOT_DEPLOYED');
  assert.equal(selection.global.synthetic, false);
  assert.equal(selection.global.scope, 'GLOBAL');
  assert.equal(selection.global.lod, 'LOW');
  assert.deepEqual(selection.global.boundsDegrees, {
    west: -180, east: 180, south: -90, north: 90,
  });
  assert.deepEqual(selection.global.dimensions, { x: 360, y: 181, bands: 3 });
  assert.equal(selection.global.byteLength, 195_480);
  assert.equal(selection.global.densitySha256, manifest.densitySha256);
  assert.equal(selection.global.fakeThickness, false);
  assert.equal(selection.global.texturePresentation,
    '3X_LINEAR_INTERPOLATION_DATELINE_SEAM_DUPLICATE');
  assert.equal(selection.global.visible, true);
  assert.equal(selection.global.primitiveCount, 3);
  assert.deepEqual(selection.global.layers.map(layer => layer.id), ['LOW', 'MID', 'HIGH']);
  assert.deepEqual(selection.global.layers.map(layer => layer.representativeAltitudeM),
    [936, 4_795, 10_719]);
  assert.equal(selection.ocean.visible, true);
  assert.equal(selection.atmosphere.mode, 'EARTH');

  await page.evaluate(() => {
    for (const selector of ['#ui', '#shade', '#earthusV2RealSources', '#resourceLoading', '.cesium-viewer-bottom']) {
      document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForTimeout(1_100);
  const output = process.env.EARTHUS_V2_G5_GLOBAL_OUTPUT
    || '/private/tmp/earthus-v2-g5-global-low.png';
  const cloudOn = await page.screenshot({ path: output, fullPage: true });
  const primitiveState = await page.evaluate(() => {
    const viewer = window.__earthusV2.viewer;
    const ids = [];
    let observedShellCount = 0;
    for (let index = 0; index < viewer.scene.primitives.length; index += 1) {
      const primitive = viewer.scene.primitives.get(index);
      if (primitive?.__earthusV2GfsGlobalLowCloud) {
        ids.push(primitive.__earthusV2GfsGlobalLowCloud);
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
  const cloudOff = await page.screenshot({
    path: output.replace(/\.png$/i, '-off.png'), fullPage: true,
  });
  const cloudOnHash = createHash('sha256').update(cloudOn).digest('hex');
  const cloudOffHash = createHash('sha256').update(cloudOff).digest('hex');
  const cloudOnMetrics = imageMetrics(cloudOn);
  assert.notEqual(cloudOnHash, cloudOffHash, 'G5_GLOBAL_CLOUD_NOT_VISIBLE_IN_FRAME');
  assert.ok(cloudOnMetrics.whiteRatio < 0.12,
    `G5_GLOBAL_WHITE_SPHERE:${JSON.stringify(cloudOnMetrics)}`);
  assert.ok(cloudOnMetrics.chromaMean > 0.03,
    `G5_GLOBAL_COLOR_SIGNAL_LOST:${JSON.stringify(cloudOnMetrics)}`);

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
  assert.ok(runtime.idleFrames1s <= 3, `G5_GLOBAL_IDLE_FRAMES:${runtime.idleFrames1s}`);
  assert.equal(errors.length, 0, errors.join('\n'));

  console.log('V2 G5 GLOBAL LOW CLOUD: PASS', JSON.stringify({
    artifact: {
      manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
      densitySha256: manifest.densitySha256,
      sourceSha256: manifest.sourceSha256,
      sourceByteLength: manifest.sourceByteLength,
    },
    selection,
    primitiveState,
    runtime,
    cloudOnHash,
    cloudOffHash,
    cloudOnMetrics,
  }));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
