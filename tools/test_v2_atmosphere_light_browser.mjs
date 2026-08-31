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

async function applyTime(page, timeIso) {
  const snapshot = await page.evaluate(async time => {
    const real = window.__earthusV2.realEarth;
    const viewer = window.__earthusV2.viewer;
    real.setAtmosphereTime(time);
    viewer.scene.requestRender();
    await new Promise(resolve => setTimeout(resolve, 900));
    viewer.scene.requestRender();
    return {
      atmosphere: real.atmosphereLightSnapshot(),
      ocean: real.oceanSurfaceSnapshot(),
    };
  }, timeIso);
  await page.waitForTimeout(500);
  return snapshot;
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
    && window.__earthusV2?.realEarth?.atmosphereLightSnapshot?.()?.ready === true,
  70_000, 'ATMOSPHERE_LIGHT_READY_TIMEOUT');
  await wait(page, () => window.__earthusV2.realEarth.oceanSurfaceSnapshot?.()?.ready === true,
    70_000, 'ATMOSPHERE_OCEAN_READY_TIMEOUT');
  await page.evaluate(() => {
    for (const selector of ['#ui', '#shade', '#earthusV2RealSources', '#resourceLoading', '.cesium-viewer-bottom']) {
      document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    }
  });

  const day = await applyTime(page, '2026-08-31T04:00:00.000Z');
  assert.equal(day.atmosphere.ready, true);
  assert.equal(day.atmosphere.truthClass, 'EXPLICIT_EARTH_RAYLEIGH_MIE_PRESENTATION');
  assert.equal(day.atmosphere.timeSource, 'CAPTURED_UTC_CESIUM_CLOCK_FROZEN');
  assert.equal(day.atmosphere.timeIso, '2026-08-31T04:00:00.000Z');
  assert.equal(day.atmosphere.shouldAnimate, false);
  assert.equal(day.atmosphere.sunDirectionMagnitude, 1);
  assert.equal(day.atmosphere.anchor.phase, 'DAY');
  assert.equal(day.atmosphere.atmosphere.show, true);
  assert.deepEqual(day.atmosphere.atmosphere.rayleighCoefficient, [0.0000052, 0.0000121, 0.0000275]);
  assert.equal(day.atmosphere.atmosphere.rayleighScaleHeightM, 8_000);
  assert.deepEqual(day.atmosphere.atmosphere.mieCoefficient, [0.00002, 0.00002, 0.00002]);
  assert.equal(day.atmosphere.atmosphere.mieScaleHeightM, 1_200);
  assert.equal(day.atmosphere.atmosphere.mieAnisotropy, 0.82);
  assert.equal(day.atmosphere.atmosphere.perFragmentAtmosphere, true);
  assert.equal(day.atmosphere.atmosphere.dynamicLighting, true);
  assert.equal(day.atmosphere.atmosphere.dynamicLightingFromSun, true);
  assert.equal(day.atmosphere.terrainLighting.enabled, true);
  assert.equal(day.atmosphere.terrainLighting.isSunLight, true);
  assert.equal(day.atmosphere.terrainLighting.intensity, 1.9);
  assert.equal(day.atmosphere.oceanLightingModel, 'CESIUM_FIXED_SUN_DIRECTION_SPECULAR');
  assert.equal(day.ocean.lightingModel, 'CESIUM_FIXED_SUN_DIRECTION_SPECULAR');
  assert.equal(day.atmosphere.cityLights.sourceId, 'NASA_GIBS_VIIRS_CITYLIGHTS_2012');
  assert.equal(day.atmosphere.cityLights.dayAlpha, 0);
  assert.equal(day.atmosphere.cityLights.nightAlpha, 0.26);
  assert.equal(day.atmosphere.cityLights.brightness, 0.82);
  assert.equal(day.atmosphere.cloudShadow.status, 'UNAVAILABLE_NO_VALID_OBSERVATION');
  assert.equal(day.atmosphere.cloudShadow.enabled, false);
  const dayBuffer = await page.screenshot({
    path: process.env.EARTHUS_V2_G4_DAY_OUTPUT || '/private/tmp/earthus-v2-g4-day.png',
    fullPage: true,
  });

  const terminator = await applyTime(page, '2026-08-31T10:40:00.000Z');
  assert.equal(terminator.atmosphere.anchor.phase, 'TERMINATOR');
  assert.ok(Math.abs(terminator.atmosphere.anchor.cosine) <= 0.08,
    JSON.stringify(terminator.atmosphere.anchor));
  const terminatorBuffer = await page.screenshot({
    path: process.env.EARTHUS_V2_G4_TERMINATOR_OUTPUT || '/private/tmp/earthus-v2-g4-terminator.png',
    fullPage: true,
  });

  const night = await applyTime(page, '2026-08-31T16:00:00.000Z');
  assert.equal(night.atmosphere.timeIso, '2026-08-31T16:00:00.000Z');
  assert.equal(night.atmosphere.anchor.phase, 'NIGHT');
  assert.ok(night.atmosphere.anchor.cosine < -0.5, JSON.stringify(night.atmosphere.anchor));
  const nightBuffer = await page.screenshot({
    path: process.env.EARTHUS_V2_G4_NIGHT_OUTPUT || '/private/tmp/earthus-v2-g4-night.png',
    fullPage: true,
  });
  const dayHash = createHash('sha256').update(dayBuffer).digest('hex');
  const terminatorHash = createHash('sha256').update(terminatorBuffer).digest('hex');
  const nightHash = createHash('sha256').update(nightBuffer).digest('hex');
  assert.notEqual(dayHash, nightHash, 'G4_DAY_NIGHT_FRAME_NOT_DIFFERENT');
  assert.notEqual(dayHash, terminatorHash, 'G4_DAY_TERMINATOR_FRAME_NOT_DIFFERENT');
  assert.notEqual(terminatorHash, nightHash, 'G4_TERMINATOR_NIGHT_FRAME_NOT_DIFFERENT');

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
  assert.ok(runtime.idleFrames1s <= 3, `G4_IDLE_FRAMES:${runtime.idleFrames1s}`);
  assert.equal(errors.length, 0, errors.join('\n'));

  console.log('V2 G4 ATMOSPHERE / LIGHT: PASS', JSON.stringify({
    day: day.atmosphere,
    terminator: terminator.atmosphere,
    night: night.atmosphere,
    runtime,
    dayHash,
    terminatorHash,
    nightHash,
  }));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
