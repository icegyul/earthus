import assert from 'node:assert/strict';
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
  '.json': 'application/json', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

function server() {
  return http.createServer(async (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (pathname.startsWith('/clouds/')) {
      try {
        const response = await fetch(CLOUD + pathname, { cache: 'no-store' });
        const bytes = Buffer.from(await response.arrayBuffer());
        res.writeHead(response.status, {
          'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store',
        }).end(bytes);
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
    await page.waitForTimeout(160);
  }
  throw new Error(label);
}

function ownership(page) {
  return page.evaluate(() => {
    const rootRuntime = window.__earthusV2;
    const viewer = rootRuntime?.viewer;
    const canonical = rootRuntime?.realEarth?.detailImageryLayer?.();
    const layers = [];
    for (let index = 0; index < (viewer?.imageryLayers?.length || 0); index += 1) {
      const layer = viewer.imageryLayers.get(index);
      const provider = layer?.imageryProvider;
      const url = String(provider?._resource?.url || provider?._url || provider?.url || '');
      if (/World_Imagery\/MapServer/i.test(url)) layers.push({ index, layer, provider, url });
    }
    return {
      viewerCount: document.querySelectorAll('.cesium-viewer').length,
      canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
      arcgisLayerCount: layers.length,
      canonicalExists: !!canonical,
      canonicalAttached: layers.some(item => item.layer === canonical),
      canonicalProviderAttached: layers.some(item => item.provider === canonical?.imageryProvider),
      controllerCreatedProvider: !!globalThis.__earthusV2ArcGisImageryProvider,
      canonicalLayerMarkerMatches: globalThis.__earthusV2CanonicalEsriImageryLayer === canonical,
    };
  });
}

const srv = server();
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(90000);

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await wait(page, () => document.documentElement.dataset.c === '1'
    && !!window.__earthusV2?.realEarth?.detailImageryLayer?.(), 65000, 'CANONICAL_IMAGERY_BOOT_TIMEOUT');
  await wait(page, () => !!globalThis.__earthusV2VisualFidelityController, 40000, 'VISUAL_CONTROLLER_TIMEOUT');

  const first = await ownership(page);
  await page.evaluate(() => {
    const viewer = window.__earthusV2.viewer;
    for (const height of [7_000_000, 950_000, 48_000, 29_000_000]) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(127.8, 36.4, height),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      });
      globalThis.__earthusV2VisualFidelityController.update();
      viewer.scene.requestRender();
    }
  });
  await page.waitForTimeout(1200);
  const after = await ownership(page);

  for (const [label, state] of [['first', first], ['after', after]]) {
    assert.equal(state.viewerCount, 1, `${label}:viewerCount`);
    assert.equal(state.canvasCount, 1, `${label}:canvasCount`);
    assert.equal(state.arcgisLayerCount, 1, `${label}:arcgisLayerCount`);
    assert.equal(state.canonicalExists, true, `${label}:canonicalExists`);
    assert.equal(state.canonicalAttached, true, `${label}:canonicalAttached`);
    assert.equal(state.canonicalProviderAttached, true, `${label}:canonicalProviderAttached`);
    assert.equal(state.controllerCreatedProvider, false, `${label}:controllerCreatedProvider`);
    assert.equal(state.canonicalLayerMarkerMatches, true, `${label}:canonicalLayerMarkerMatches`);
  }
  console.log('V2 CANONICAL IMAGERY OWNERSHIP: PASS', JSON.stringify({ first, after }));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
