import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const out = path.resolve(process.env.EARTHUS_V2_INTELLIGENCE_OUTPUT || path.join(root, 'output/v2-intelligence-runtime'));
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef ? await import(pathToFileURL(path.resolve(moduleRef)).href) : await import('playwright');
const CLOUD = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml' };
const VIEWPORT = { width: 1280, height: 800 };

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
    await page.waitForTimeout(160);
  }
  throw new Error(label);
}

async function setHeight(page, height) {
  await page.evaluate(heightM => {
    const v = window.__earthusV2.viewer;
    v.camera.cancelFlight?.();
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(127.8, 36.4, heightM),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });
    v.scene.requestRender();
  }, height);
}

async function waitScope(page, scope) {
  await wait(page, expected => {
    const s = globalThis.__earthusV2Intelligence?.snapshot?.();
    return s?.context?.viewScope === expected && s?.context?.cameraState === 'STABLE';
  }, 25000, `SCOPE_TIMEOUT:${scope}`);
  return page.evaluate(() => {
    const s = globalThis.__earthusV2Intelligence.snapshot();
    const v = window.__earthusV2.viewer;
    return {
      scope: s.context.viewScope,
      truthState: s.context.truthState,
      quality: s.executionPlan.quality,
      primaryEngine: s.executionPlan.primaryEngine,
      sse: s.renderPolicy.maximumScreenSpaceError,
      liveSse: v.scene.globe.maximumScreenSpaceError,
      preloadSiblings: s.renderPolicy.preloadSiblings,
      livePreloadSiblings: v.scene.globe.preloadSiblings,
      requestRenderMode: s.renderPolicy.requestRenderMode,
      liveRequestRenderMode: v.scene.requestRenderMode,
      readiness: s.readiness,
      cameraState: s.context.cameraState,
    };
  });
}

fs.mkdirSync(out, { recursive: true });
const srv = server();
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
page.setDefaultTimeout(100000);
const evidence = { ok:false, status:'FOUNDATION_CODE', scopes:{}, intents:{}, taskEvents:[] };

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, { waitUntil:'domcontentloaded', timeout:60000 });
  await wait(page, () => document.documentElement.dataset.c === '1' && !!window.__earthusV2?.realEarth, 65000, 'BASE_EARTH_TIMEOUT');
  await wait(page, () => globalThis.__earthusV2Intelligence?.engineId === 'FND-017', 30000, 'FND017_BOOT_TIMEOUT');

  const singleton = await page.evaluate(() => ({
    viewerCount: document.querySelectorAll('.cesium-viewer').length,
    canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
    engineId: globalThis.__earthusV2Intelligence?.engineId,
    version: globalThis.__earthusV2Intelligence?.version,
  }));
  assert.equal(singleton.engineId, 'FND-017');
  assert.equal(singleton.viewerCount, 1, `viewerCount:${singleton.viewerCount}`);
  assert.equal(singleton.canvasCount, 1, `canvasCount:${singleton.canvasCount}`);
  evidence.singleton = singleton;

  await page.evaluate(() => {
    globalThis.__intelTaskEvents = [];
    document.addEventListener('earthus:v2-task', e => {
      if (e.detail?.task?.resource === 'planet-refinement') {
        globalThis.__intelTaskEvents.push({
          event:e.detail.event,
          stage:e.detail.task.stage,
          status:e.detail.task.status,
          indeterminate:e.detail.task.indeterminate,
          progress:e.detail.task.progress,
        });
      }
    });
  });

  for (const [scope, height] of [['GLOBAL',29_000_000],['CONTINENT',4_000_000],['COUNTRY',900_000],['REGION',180_000],['LOCAL',40_000]]) {
    await setHeight(page, height);
    const state = await waitScope(page, scope);
    assert.equal(state.liveSse, state.sse, `${scope}:SSE_POLICY_DRIFT`);
    assert.equal(state.livePreloadSiblings, state.preloadSiblings, `${scope}:PRELOAD_POLICY_DRIFT`);
    assert.equal(state.liveRequestRenderMode, state.requestRenderMode, `${scope}:RENDER_MODE_POLICY_DRIFT`);
    evidence.scopes[scope] = state;
  }
  assert.ok(evidence.scopes.GLOBAL.sse > evidence.scopes.LOCAL.sse, 'PROGRESSIVE_SSE_ORDER');
  assert.ok(evidence.scopes.LOCAL.sse <= 1.7, `LOCAL_SSE:${evidence.scopes.LOCAL.sse}`);

  await page.evaluate(() => document.dispatchEvent(new CustomEvent('earthus:v2-feature-request', { detail:{ menu:'WEATHER', feature:'Clouds' } })));
  await wait(page, () => globalThis.__earthusV2Intelligence?.snapshot?.()?.executionPlan?.primaryEngine === 'VOLUME', 10000, 'WEATHER_INTENT_TIMEOUT');
  evidence.intents.weatherClouds = await page.evaluate(() => {
    const s = globalThis.__earthusV2Intelligence.snapshot();
    return { primaryEngine:s.executionPlan.primaryEngine, truthState:s.context.truthState, requestRenderMode:s.renderPolicy.requestRenderMode };
  });
  assert.equal(evidence.intents.weatherClouds.primaryEngine, 'VOLUME');
  assert.equal(evidence.intents.weatherClouds.truthState, 'INSUFFICIENT_DATA');
  assert.equal(evidence.intents.weatherClouds.requestRenderMode, false);

  await page.evaluate(() => document.dispatchEvent(new CustomEvent('earthus:v2-feature-request', { detail:{ menu:'EARTH', feature:null } })));
  await wait(page, () => globalThis.__earthusV2Intelligence?.snapshot?.()?.context?.analysisMode === 'EARTH', 10000, 'EARTH_INTENT_TIMEOUT');

  await page.click('#tab');
  await page.waitForTimeout(500);
  await page.screenshot({ path:path.join(out, 'intelligence-panel-local.png'), fullPage:true });

  evidence.taskEvents = await page.evaluate(() => globalThis.__intelTaskEvents || []);
  assert.ok(evidence.taskEvents.some(e => e.event === 'begin' && e.indeterminate === true && e.progress === null), 'REAL_READINESS_LOADER_MISSING');
  evidence.status = 'RUNTIME_WIRED';
  evidence.ok = true;
  evidence.url = page.url();
  evidence.branch = process.env.GITHUB_REF_NAME || null;
  evidence.head = process.env.GITHUB_SHA || null;
  evidence.timestamp = new Date().toISOString();
  evidence.browser = 'Chromium / Playwright';
  evidence.viewport = VIEWPORT;
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(evidence, null, 2));
  console.log('EARTHUS INTELLIGENCE RUNTIME: RUNTIME_WIRED');
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.error = String(error?.stack || error);
  fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
