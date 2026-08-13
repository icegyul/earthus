import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const playwrightEntry = process.env.EARTHUS_PLAYWRIGHT_MODULE
  || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(path.resolve(playwrightEntry)).href);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = path.join(root, 'prototype');
const outputRoot = process.env.EARTHUS_VISUAL_RELEASE_OUTPUT
  || path.join(root, 'docs/earthus-visual-engineering-next/evidence/pr07');
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cycles = Number(process.env.EARTHUS_VISUAL_CYCLES || 30);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function localServer() {
  return http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch (_) { response.writeHead(400).end('bad request'); return; }
    if (pathname === '/') pathname = '/index.html';
    const target = path.resolve(prototypeRoot, `.${pathname}`);
    if (!target.startsWith(`${prototypeRoot}${path.sep}`)) { response.writeHead(403).end('forbidden'); return; }
    fs.readFile(target, (error, body) => {
      if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('not found'); return; }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      response.end(body);
    });
  });
}

function safeUrl(value) {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; }
  catch (_) { return '[url]'; }
}

async function waitLayer(page, expression, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(expression)) { await page.waitForTimeout(350); return; }
    await page.waitForTimeout(200);
  }
  throw new Error('VISUAL_LAYER_WAIT_TIMEOUT');
}

async function pageState(page) {
  return page.evaluate(async () => {
    const [{ viewer }, { imagery }, { visualEffects }, { power }] = await Promise.all([
      import('/js/viewer.js'), import('/js/layers/imagery.js'),
      import('/js/visual-effect-settings.js'), import('/js/power.js'),
    ]);
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const sky = resources.find(name => /panorama-(?:6000|4096|2048)\.[a-f0-9]+\.webp/.test(name)) || null;
    const texture = globalThis.__earthusTextureProbe || { created: 0, deleted: 0 };
    return {
      layers: viewer.imageryLayers.length,
      visual: imagery.visualMetrics(),
      effect: { selected: visualEffects.mode, resolved: visualEffects.resolved() },
      sky: sky ? safePath(sky) : null,
      layout: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        overflow: document.documentElement.scrollWidth - innerWidth },
      texture: { created: texture.created, deleted: texture.deleted,
        live: texture.created - texture.deleted },
      idle: { animating: power.animating, owners: [...power._requests.keys()] },
      sourceTimes: { noaa: imagery._cloudTime || null, himaVisible: imagery._himaVisibleTime || null,
        himaInfrared: imagery._himaIRTime || null, gk2a: imagery._gk2aMeta?.time || null },
    };
    function safePath(value) { const url = new URL(value); return url.pathname; }
  });
}

async function runCase(browser, baseUrl, item) {
  const context = await browser.newContext({ viewport: item.viewport,
    deviceScaleFactor: item.dpr, reducedMotion: item.reducedMotion || 'no-preference' });
  const page = await context.newPage();
  await page.addInitScript(({ saveData }) => {
    localStorage.setItem('earthus.coachDone', '1');
    localStorage.setItem('earthus.visualEffect', 'auto');
    if (saveData) Object.defineProperty(navigator, 'connection', { configurable: true,
      value: { saveData: true, effectiveType: '3g' } });
    const probe = globalThis.__earthusTextureProbe = { created: 0, deleted: 0 };
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const prototype = globalThis[name]?.prototype;
      if (!prototype || prototype.__earthusReleaseTextureProbe) continue;
      const createTexture = prototype.createTexture;
      const deleteTexture = prototype.deleteTexture;
      prototype.createTexture = function (...args) { const value = createTexture.apply(this, args);
        if (value) probe.created++; return value; };
      prototype.deleteTexture = function (...args) { if (args[0]) probe.deleted++;
        return deleteTexture.apply(this, args); };
      Object.defineProperty(prototype, '__earthusReleaseTextureProbe', { value: true });
    }
  }, { saveData: !!item.saveData });

  const pageErrors = [];
  const consoleErrors = [];
  const failed = new Map();
  page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 200)));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
      consoleErrors.push(message.text().replace(/https?:\/\/\S+/g, '[url]').slice(0, 200));
    }
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    const key = `${response.status()}:${safeUrl(response.url())}`;
    failed.set(key, (failed.get(key) || 0) + 1);
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('#cesiumContainer canvas').first().waitFor({ state: 'visible', timeout: 25_000 });
  await page.waitForTimeout(3500);
  const opening = await pageState(page);
  assert.equal(opening.layout.overflow, 0, `${item.name} horizontal overflow`);
  await page.screenshot({ path: path.join(outputRoot, `${item.name}-opening.png`) });
  const settingsAudit = await page.evaluate(async () => {
    const { settings } = await import('/js/ui.js');
    settings.render();
    const controls = [...document.querySelectorAll('#segVisualFx button')];
    return { labels: controls.map(node => node.textContent), pressed: controls.map(node => node.getAttribute('aria-pressed')),
      hint: document.getElementById('visualFxHint')?.textContent || '' };
  });
  assert.equal(settingsAudit.labels.length, 3);
  assert.equal(settingsAudit.pressed.filter(value => value === 'true').length, 1);
  assert.match(settingsAudit.hint, /관측|Observation/);

  await page.evaluate(async () => {
    const { store } = await import('/js/store.js'); store.setLayer('himawari', true);
  });
  await waitLayer(page, async () => (await import('/js/layers/imagery.js')).imagery.himaLayers.length > 0);
  const preEffect = await page.evaluate(async () => {
    const [{ imagery }, { store }] = await Promise.all([
      import('/js/layers/imagery.js'), import('/js/store.js')]);
    return { layers: imagery.himaLayers.length, on: imagery._himaOn, stored: store.isOn('himawari') };
  });
  const effectAudit = await page.evaluate(async () => {
    const [{ imagery }, { visualEffects }] = await Promise.all([
      import('/js/layers/imagery.js'), import('/js/visual-effect-settings.js')]);
    const baseBefore = imagery.himaLayers.length;
    visualEffects.set('off');
    const depthLayers = imagery.himaLayers.map(layer => layer._earthusDepthLayer).filter(Boolean);
    const depthHidden = depthLayers.length > 0 && depthLayers.every(layer => layer.show === false);
    const baseAfter = imagery.himaLayers.length;
    visualEffects.set('low');
    return { baseBefore, baseAfter, depthHidden };
  });
  assert.ok(effectAudit.baseBefore > 0 && effectAudit.baseAfter === effectAudit.baseBefore,
    JSON.stringify({ preEffect, effectAudit }));
  assert.equal(effectAudit.depthHidden, true);
  const himawariState = await pageState(page);
  await page.screenshot({ path: path.join(outputRoot, `${item.name}-himawari.png`) });

  const lifecycle = [];
  let gk2aState = null;
  if (item.cycles) {
    for (let index = 1; index <= cycles; index++) {
      await page.evaluate(async () => { const { store } = await import('/js/store.js');
        store.setLayer('gk2aAuto', true); });
      await waitLayer(page, async () => (await import('/js/layers/imagery.js')).imagery.gk2aAutoLayers.length > 0);
      if (index === 1) {
        gk2aState = await pageState(page);
        await page.screenshot({ path: path.join(outputRoot, `${item.name}-gk2a.png`) });
      }
      await page.evaluate(async () => { const { store } = await import('/js/store.js');
        store.setLayer('gk2aAuto', false); });
      await page.waitForTimeout(500);
      await page.evaluate(async () => { const { store } = await import('/js/store.js');
        store.setLayer('himawari', true); });
      await waitLayer(page, async () => (await import('/js/layers/imagery.js')).imagery.himaLayers.length > 0);
      await page.evaluate(async () => { const { store } = await import('/js/store.js');
        store.setLayer('himawari', false); });
      await page.waitForTimeout(500);
      const state = await pageState(page);
      assert.equal(state.visual.activeGroups, 0, `cycle ${index} active group`);
      assert.equal(state.visual.groups.length, 0, `cycle ${index} orphan group`);
      lifecycle.push({ cycle: index, layers: state.layers, liveTextures: state.texture.live,
        cacheSize: state.visual.cache.size });
    }
    assert.equal(lifecycle.at(-1).layers, lifecycle[0].layers, '30-cycle layer growth');
    assert.equal(lifecycle.at(-1).cacheSize, 0, 'disposed owner cache must be empty');
  } else {
    await page.evaluate(async () => { const { store } = await import('/js/store.js');
      store.setLayer('himawari', false); });
  }

  await context.setOffline(true);
  await page.waitForTimeout(600);
  await context.setOffline(false);
  await page.evaluate(async () => { const { store } = await import('/js/store.js'); store.setLayer('clouds', true); });
  await waitLayer(page, async () => (await import('/js/layers/imagery.js')).imagery.cloudLayers.length > 0, 20_000);
  const restored = await pageState(page);
  const errorOffsets = { page: pageErrors.length, console: consoleErrors.length };
  const runtimeBeforeContextLoss = { pageErrors: [...pageErrors],
    consoleErrors: [...new Set(consoleErrors)] };

  const canLoseContext = await page.evaluate(async () => {
    const { viewer } = await import('/js/viewer.js');
    return !!viewer.scene.context?._gl?.getExtension('WEBGL_lose_context');
  });
  let contextLoss = { supported: canLoseContext, reloaded: false };
  if (canLoseContext) {
    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.evaluate(async () => {
      const { viewer } = await import('/js/viewer.js');
      viewer.scene.context._gl.getExtension('WEBGL_lose_context').loseContext();
    }).catch(() => {});
    await navigation;
    await page.locator('#cesiumContainer canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(1500);
    contextLoss = await page.evaluate(async () => {
      const { viewer } = await import('/js/viewer.js');
      const sky = performance.getEntriesByType('resource').map(entry => entry.name)
        .find(name => /panorama-(?:6000|4096|2048)\.[a-f0-9]+\.webp/.test(name));
      return { supported: true, reloaded: true, canvasConnected: viewer.scene.canvas.isConnected,
        fallbackLevel: Number(sessionStorage.getItem('earthus.webglFallbackLevel') || 0),
        sky: sky ? new URL(sky).pathname : null };
    });
    assert.equal(contextLoss.canvasConnected, true);
    assert.ok(contextLoss.fallbackLevel >= 1);
  }
  await page.screenshot({ path: path.join(outputRoot, `${item.name}-restored.png`) });

  const inducedContextLossErrors = {
    pageErrors: pageErrors.slice(errorOffsets.page),
    consoleErrors: [...new Set(consoleErrors.slice(errorOffsets.console))],
  };
  const result = { item, opening, settingsAudit, preEffect, effectAudit, himawariState,
    gk2aState, lifecycle, restored, contextLoss,
    errors: { runtimeBeforeContextLoss, inducedContextLossErrors,
      failedResponses: [...failed].map(([key, count]) => ({ key, count })) } };
  await context.close();
  return result;
}

await fs.promises.mkdir(outputRoot, { recursive: true });
const server = localServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
assert(address && typeof address === 'object');
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const cases = [
    { name: 'desktop-1280x720', viewport: { width: 1280, height: 720 }, dpr: 1, cycles: true },
    { name: 'mobile-390x844-save-data', viewport: { width: 390, height: 844 }, dpr: 2, saveData: true },
    { name: 'retina-1600x900', viewport: { width: 1600, height: 900 }, dpr: 2 },
  ];
  const results = [];
  for (const item of cases) results.push(await runCase(browser, `http://127.0.0.1:${address.port}`, item));
  const report = { schema: 'earthus.visual-release-validation.v1', generatedAt: new Date().toISOString(),
    browser: await browser.version(), cycles, actualDeviceStatus: {
      safariMacOS: 'UNKNOWN', minimumIPhone: 'UNKNOWN', latestIPhone: 'UNKNOWN',
      lowEndAndroid: 'UNKNOWN', voiceOver: 'UNKNOWN', thermalAndBattery: 'UNKNOWN',
      reason: '현재 자동화 호스트에는 해당 실기기와 Safari WebDriver 접근이 없다' }, results };
  await fs.promises.writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ outputRoot: path.relative(root, outputRoot), cycles,
    cases: results.map(result => ({ name: result.item.name, sky: result.opening.sky,
      effect: result.opening.effect, layersAfterRestore: result.restored.layers,
      pageErrors: result.errors.runtimeBeforeContextLoss.pageErrors.length,
      consoleErrors: result.errors.runtimeBeforeContextLoss.consoleErrors.length,
      lifecycleEnd: result.lifecycle.at(-1) || null, contextLoss: result.contextLoss })) }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
