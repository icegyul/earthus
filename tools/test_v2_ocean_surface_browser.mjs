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
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await wait(page, () => document.documentElement.dataset.c === '1'
    && !!window.__earthusV2?.realEarth, 70_000, 'OCEAN_SURFACE_BOOT_TIMEOUT');
  await wait(page, () => window.__earthusV2.realEarth.oceanSurfaceSnapshot?.()?.ready === true,
    Number(process.env.EARTHUS_V2_OCEAN_SURFACE_TIMEOUT || 70_000),
    'OCEAN_SURFACE_READY_TIMEOUT');
  await wait(page, () => window.__earthusV2.viewer.scene.requestRenderMode === true,
    15_000, 'OCEAN_SURFACE_IDLE_POLICY_TIMEOUT');

  const state = await page.evaluate(async () => {
    const v = window.__earthusV2.viewer;
    const real = window.__earthusV2.realEarth;
    const idleFrames1s = await new Promise(resolve => {
      let frames = 0;
      const remove = v.scene.postRender.addEventListener(() => { frames += 1; });
      v.scene.requestRender();
      setTimeout(() => { try { remove(); } catch {} resolve(frames); }, 1000);
    });
    return {
      ocean: real.oceanSurfaceSnapshot(),
      waterTruth: real.waterTruth(),
      terrainTruth: real.terrainTruth(),
      globeMaterial: v.scene.globe.material?.type || null,
      viewerCount: globalThis.__earthusViewer === v ? 1 : 0,
      canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
      primitiveCount: v.scene.primitives.length,
      requestRenderMode: v.scene.requestRenderMode,
      idleFrames1s,
    };
  });
  console.log('V2 G3 OCEAN STATE', JSON.stringify(state));

  assert.equal(state.viewerCount, 1);
  assert.equal(state.canvasCount, 1);
  assert.equal(state.terrainTruth, 'ESRI_TERRAIN3D');
  assert.notEqual(state.globeMaterial, 'Water');
  assert.equal(state.ocean.ready, true);
  assert.equal(state.ocean.truthClass, 'PHYSICAL_0M_OCEAN_SURFACE');
  assert.equal(state.ocean.maskSource, 'Natural Earth admin 0 countries');
  assert.equal(state.ocean.maskLicense, 'Public domain');
  assert.equal(state.ocean.maskSha256, '05fefcbf59e5018ae580db9f0dbc874153d10025a6ea05b35a2251af4f1f56f1');
  assert.equal(state.ocean.normalSha256, 'b9f9500dc8092a6f007b251db3827c7f4e7741ff5098d060c8abf45f4e0cd4aa');
  assert.equal(state.ocean.surfaceTruthHeightM, 0);
  assert.ok(state.ocean.presentationOffsetM > 0 && state.ocean.presentationOffsetM <= 50);
  assert.equal(state.ocean.depthPolicy, 'DEPTH_TESTED_GLOBAL_PRESENTATION_EPSILON');
  assert.equal(state.ocean.animation, false);
  assert.equal(state.ocean.synthetic, false);
  assert.equal(state.ocean.materialType, 'EarthusOceanSurface');
  assert.equal(state.ocean.primitiveAttached, true);
  assert.equal(state.ocean.visible, true);
  assert.equal(state.waterTruth, 'NATURAL_EARTH_MASK_0M_OCEAN_SURFACE');
  assert.equal(state.requestRenderMode, true);
  assert.ok(state.idleFrames1s <= 3, `OCEAN_IDLE_FRAMES:${state.idleFrames1s}`);
  assert.equal(errors.length, 0, errors.join('\n'));

  await page.evaluate(() => {
    for (const selector of ['#ui', '#shade', '#earthusV2RealSources', '#resourceLoading', '.cesium-viewer-bottom']) {
      document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForTimeout(800);
  const output = process.env.EARTHUS_V2_OCEAN_SURFACE_OUTPUT
    || '/private/tmp/earthus-v2-ocean-surface.png';
  const oceanOn = await page.screenshot({ path: output, fullPage: true });
  await page.evaluate(() => {
    const primitives = window.__earthusV2.viewer.scene.primitives;
    for (let index = 0; index < primitives.length; index += 1) {
      const primitive = primitives.get(index);
      if (primitive?.__earthusV2OceanSurface === true) primitive.show = false;
    }
    window.__earthusV2.viewer.scene.requestRender();
  });
  await page.waitForTimeout(800);
  const oceanOff = await page.screenshot({
    path: output.replace(/\.png$/i, '-off.png'),
    fullPage: true,
  });
  const oceanOnHash = createHash('sha256').update(oceanOn).digest('hex');
  const oceanOffHash = createHash('sha256').update(oceanOff).digest('hex');
  assert.notEqual(oceanOnHash, oceanOffHash, 'OCEAN_SURFACE_NOT_VISIBLE_IN_FRAME');

  console.log('V2 G3 OCEAN SURFACE: PASS', JSON.stringify({
    ...state,
    oceanOnHash,
    oceanOffHash,
  }));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
