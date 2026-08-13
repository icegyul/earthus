import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
const outputRoot = process.env.EARTHUS_VISUAL_PR00_OUTPUT
  || path.join(root, 'docs/earthus-visual-engineering-next/evidence/pr00');
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const diagnosticsSource = fs.readFileSync(path.join(prototypeRoot, 'js/satellite-diagnostics.js'), 'utf8');
const diagnostics = await import(`data:text/javascript;base64,${Buffer.from(diagnosticsSource).toString('base64')}`);

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
});

function localServer() {
  return http.createServer((request, response) => {
    let pathname = '/';
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch (_) { response.writeHead(400).end('bad request'); return; }
    if (pathname === '/') pathname = '/index.html';
    const target = path.resolve(prototypeRoot, `.${pathname}`);
    if (!target.startsWith(`${prototypeRoot}${path.sep}`)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(target, (error, body) => {
      if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('not found'); return; }
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      response.end(body);
    });
  });
}

function sanitizeMessage(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s)]+/g, match => {
      try { const url = new URL(match); return `${url.origin}${url.pathname}`; }
      catch (_) { return '[url]'; }
    })
    .slice(0, 240);
}

async function waitForQuiet(page) {
  /* 첫 Earth의 30초 유한 회전은 제품 연출이다. 유휴 예산은 그 연출이 끝난 뒤를
     재야 하므로 진단에서만 같은 stop 경로를 호출한다. 앱 코드는 바꾸지 않는다. */
  await page.evaluate(async () => {
    const { intro } = await import('/js/intro.js');
    intro.stop();
  });
  await page.waitForTimeout(1200);
  let tilesSettled = true;
  try {
    await page.waitForFunction(async () => {
      const { viewer } = await import('/js/viewer.js');
      return viewer.scene.globe.tilesLoaded === true;
    }, null, { timeout: 15_000 });
  } catch (_) { tilesSettled = false; }
  try {
    await page.waitForFunction(async () => {
      const { power } = await import('/js/power.js');
      return power.animating === false;
    }, null, { timeout: 10_000 });
  } catch (_) { /* 기준선은 timeout 자체도 수치로 남기고 계속한다. */ }
  let renderSettled = true;
  try {
    await page.waitForFunction(() => {
      const now = performance.now();
      const current = Number(document.documentElement.dataset.totalRenders || 0);
      const state = globalThis.__earthusRenderSilence || (globalThis.__earthusRenderSilence = {
        count: current, changedAt: now,
      });
      if (state.count !== current) { state.count = current; state.changedAt = now; }
      return now - state.changedAt >= 1200;
    }, null, { timeout: 10_000 });
  } catch (_) { renderSettled = false; }
  await page.waitForTimeout(500);
  return { tilesSettled, renderSettled };
}

async function sceneSnapshot(page, name, requestUrls, screenshotPath) {
  const settled = await waitForQuiet(page);
  const idleBefore = await page.evaluate(() => Number(document.documentElement.dataset.totalRenders || 0));
  await page.waitForTimeout(3000);
  const idleAfter = await page.evaluate(() => Number(document.documentElement.dataset.totalRenders || 0));
  const browserState = await page.evaluate(async () => {
    const [{ viewer }, { renderQuality }, { imagery }, { power }, diag] = await Promise.all([
      import('/js/viewer.js'),
      import('/js/render-quality.js'),
      import('/js/layers/imagery.js?v=20260813-satellite-list1'),
      import('/js/power.js'),
      import('/js/satellite-diagnostics.js'),
    ]);
    const texture = globalThis.__earthusTextureProbe || { created: 0, deleted: 0 };
    const probe = globalThis.__earthusPr00Probe || {
      maskMs: [], providerCalls: { attempted: 0, accepted: 0, attemptedKeys: {}, acceptedKeys: {} },
    };
    const gl = viewer.scene.context?._gl;
    return {
      layer: diag.imageryLayerSnapshot(viewer.imageryLayers),
      texture: { ...texture, live: texture.created - texture.deleted },
      mask: diag.maskTimingSummary(probe.maskMs),
      providerRequestCalls: {
        attempted: probe.providerCalls.attempted,
        accepted: probe.providerCalls.accepted,
        uniqueAttempted: Object.keys(probe.providerCalls.attemptedKeys).length,
        uniqueAccepted: Object.keys(probe.providerCalls.acceptedKeys).length,
      },
      sourceTimes: {
        noaaGmgsi: imagery._cloudTime || null,
        himawariVisible: imagery._himaVisibleTime || null,
        himawariInfrared: imagery._himaIRTime || null,
        gk2a: imagery._gk2aMeta?.time || null,
      },
      render: {
        total: renderQuality.totalRenders,
        frameCostMs: renderQuality.frameCostMs,
        resolutionScale: viewer.resolutionScale,
        animating: power.animating,
        activeOwnerKeys: [...power._requests.keys()],
      },
      gpu: {
        cesiumMaximumTextureSize: viewer.scene.context?.maximumTextureSize || null,
        webglMaximumTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : null,
        deviceMemoryGb: Number(navigator.deviceMemory || 0) || null,
        finePointer: matchMedia('(pointer:fine)').matches,
      },
      layout: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      },
    };
  });
  const resourceNames = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  const skyResource = resourceNames.find(name => /earthus-milky-way\/panorama(?:-6000)?\.webp/.test(name));
  const skySixK = /panorama-6000\.webp/.test(skyResource || '');
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: false });
  return {
    name,
    ...browserState,
    tilesSettledBeforeIdle: settled.tilesSettled,
    renderSettledBeforeIdle: settled.renderSettled,
    idleRenderCount3s: idleAfter - idleBefore,
    requests: diagnostics.requestSummary(requestUrls),
    sky: {
      variant: skySixK ? 'desktop-6k' : skyResource ? 'mobile-4k' : 'not-observed',
      estimatedDecodedBytes: skyResource
        ? diagnostics.estimateTextureBytes(skySixK ? 6000 : 4096, skySixK ? 3000 : 2048)
        : null,
    },
    screenshot: screenshotPath ? path.relative(root, screenshotPath).split(path.sep).join('/') : null,
  };
}

async function installProbe(page) {
  await page.evaluate(async () => {
    const [{ imagery }, { CloudDepthImageryProvider }] = await Promise.all([
      import('/js/layers/imagery.js?v=20260813-satellite-list1'),
      import('/js/cloud-depth-provider.js?v=20260813-clouddepth1'),
    ]);
    const probe = globalThis.__earthusPr00Probe = {
      maskMs: [],
      providerCalls: { attempted: 0, accepted: 0, attemptedKeys: {}, acceptedKeys: {} },
    };
    const originalMask = CloudDepthImageryProvider.prototype._makeMask;
    CloudDepthImageryProvider.prototype._makeMask = function (...args) {
      const started = performance.now();
      try { return originalMask.apply(this, args); }
      finally { probe.maskMs.push(performance.now() - started); }
    };
    const originalAdd = imagery._addImageryWithDepth;
    imagery._addImageryWithDepth = function (provider, options) {
      if (!provider.__earthusPr00Wrapped) {
        const originalRequest = provider.requestImage.bind(provider);
        const source = String(provider.url || provider._resource?.url || '');
        const providerName = source.includes('Himawari_AHI_Band3') ? 'HIMAWARI_VISIBLE'
          : source.includes('Himawari_AHI_Band13') ? 'HIMAWARI_INFRARED'
          : source.includes('/gk2a/') ? 'GK2A'
          : source.includes('globalir') ? 'REALEARTH' : 'UNKNOWN_SATELLITE';
        provider.requestImage = function (x, y, level, request) {
          const key = `${providerName}/${level}/${x}/${y}`;
          probe.providerCalls.attempted += 1;
          probe.providerCalls.attemptedKeys[key] = (probe.providerCalls.attemptedKeys[key] || 0) + 1;
          const result = originalRequest(x, y, level, request);
          if (result) {
            probe.providerCalls.accepted += 1;
            probe.providerCalls.acceptedKeys[key] = (probe.providerCalls.acceptedKeys[key] || 0) + 1;
          }
          return result;
        };
        Object.defineProperty(provider, '__earthusPr00Wrapped', { value: true });
      }
      return originalAdd.call(this, provider, options);
    };
  });
}

async function resetProbe(page) {
  await page.evaluate(() => {
    const probe = globalThis.__earthusPr00Probe;
    if (!probe) return;
    probe.maskMs.length = 0;
    probe.providerCalls = { attempted: 0, accepted: 0, attemptedKeys: {}, acceptedKeys: {} };
  });
}

async function measureCase(browser, baseUrl, item) {
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    deviceScaleFactor: item.dpr,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('earthus.coachDone', '1');
    const metrics = globalThis.__earthusTextureProbe = { created: 0, deleted: 0 };
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const prototype = globalThis[name]?.prototype;
      if (!prototype || prototype.__earthusTextureProbeInstalled) continue;
      const createTexture = prototype.createTexture;
      const deleteTexture = prototype.deleteTexture;
      prototype.createTexture = function (...args) {
        const texture = createTexture.apply(this, args);
        if (texture) metrics.created += 1;
        return texture;
      };
      prototype.deleteTexture = function (...args) {
        if (args[0]) metrics.deleted += 1;
        return deleteTexture.apply(this, args);
      };
      Object.defineProperty(prototype, '__earthusTextureProbeInstalled', { value: true });
    }
  });
  const requestUrls = [];
  const messages = [];
  const pageErrors = [];
  const failedResponses = [];
  page.on('request', request => requestUrls.push(request.url()));
  page.on('response', response => {
    if (response.status() >= 400) failedResponses.push(`${response.status()}:${sanitizeMessage(response.url())}`);
  });
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type())) messages.push(`${message.type()}:${sanitizeMessage(message.text())}`);
  });
  page.on('pageerror', error => pageErrors.push(sanitizeMessage(error.message)));

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.locator('#cesiumContainer canvas').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => document.documentElement.dataset.totalRenders != null, null, { timeout: 20_000 });
    await installProbe(page);
    await page.waitForTimeout(6000);

    const result = { viewport: item, scenes: [] };
    result.scenes.push(await sceneSnapshot(
      page, 'opening-earth', requestUrls.splice(0), path.join(outputRoot, `${item.name}-earth.png`)));

    if (item.satellites) {
      await resetProbe(page);
      await page.evaluate(async () => {
        const { store } = await import('/js/store.js');
        store.setLayer('himawari', true);
      });
      await page.waitForFunction(async () => {
        const { imagery } = await import('/js/layers/imagery.js?v=20260813-satellite-list1');
        return imagery.himaLayers.length > 0;
      }, null, { timeout: 40_000 });
      await page.waitForTimeout(2500);
      result.scenes.push(await sceneSnapshot(
        page, 'himawari', requestUrls.splice(0), path.join(outputRoot, `${item.name}-himawari.png`)));

      await resetProbe(page);
      await page.evaluate(async () => {
        const { store } = await import('/js/store.js');
        store.setLayer('gk2aAuto', true);
      });
      await page.waitForFunction(async () => {
        const { imagery } = await import('/js/layers/imagery.js?v=20260813-satellite-list1');
        return imagery.gk2aAutoLayers.length > 0;
      }, null, { timeout: 40_000 });
      await page.waitForTimeout(2500);
      result.scenes.push(await sceneSnapshot(
        page, 'gk2a-auto', requestUrls.splice(0), path.join(outputRoot, `${item.name}-gk2a.png`)));

      await resetProbe(page);
      await page.evaluate(async () => {
        const { store } = await import('/js/store.js');
        store.setLayer('gk2aAuto', false);
      });
      result.scenes.push(await sceneSnapshot(page, 'satellites-disposed', requestUrls.splice(0), null));
    }

    result.console = {
      warningOrErrorCount: messages.length,
      messages: [...new Set(messages)].slice(0, 20),
      pageErrors,
      failedResponses: [...new Set(failedResponses)].slice(0, 30),
    };
    return result;
  } finally {
    await context.close();
  }
}

await fs.promises.mkdir(outputRoot, { recursive: true });
const server = localServer();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
assert(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const cases = [
    { name: 'desktop-1280x720', width: 1280, height: 720, dpr: 1, satellites: true },
    { name: 'mobile-390x844', width: 390, height: 844, dpr: 1, satellites: true },
  ];
  const measurements = [];
  for (const item of cases) measurements.push(await measureCase(browser, baseUrl, item));
  const report = {
    schema: 'earthus.visual-pr00-baseline.v1',
    generatedAt: new Date().toISOString(),
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    browser: await browser.version(),
    mode: 'local-read-only-no-production-deploy',
    privacy: 'No precise location, account identifier, search text, or URL query value is recorded.',
    measurements,
  };
  await fs.promises.writeFile(path.join(outputRoot, 'baseline.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    outputRoot: path.relative(root, outputRoot),
    cases: measurements.map(item => ({
      viewport: item.viewport.name,
      scenes: item.scenes.map(scene => ({
        name: scene.name,
        layers: scene.layer.total,
        siblings: scene.layer.depthSiblingCount,
        tileRequests: scene.requests.requestCount,
        duplicateTileRequests: scene.requests.duplicateRequestCount,
        maskP95Ms: scene.mask.p95Ms,
        idleRenders3s: scene.idleRenderCount3s,
        liveTextures: scene.texture.live,
      })),
    })),
  }, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
