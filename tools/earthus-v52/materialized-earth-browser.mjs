import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prototypeRoot = path.join(root, 'prototype');
const moduleRef = process.env.EARTHUS_PLAYWRIGHT_MODULE;
const { chromium } = moduleRef
  ? await import(pathToFileURL(path.resolve(moduleRef)).href)
  : await import('playwright');
const CLOUD = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
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
    await page.waitForTimeout(160);
  }
  throw new Error(label);
}

const srv = server();
await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const requests = [];
const errors = [];
page.on('request', request => requests.push(request.url()));
page.on('pageerror', error => errors.push(String(error)));

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await wait(page, () => !!globalThis.__earthusV52Materialized?.snapshot?.(), 65000, 'MATERIALIZED_RUNTIME_TIMEOUT');
  await page.click('#tab');
  await wait(page, () => /MATERIALIZED/.test(document.getElementById('body')?.innerText || ''), 15000, 'MATERIALIZED_PANEL_TIMEOUT');
  const state = await page.evaluate(() => ({
    snapshot: globalThis.__earthusV52Materialized.snapshot(),
    body: document.getElementById('body')?.innerText || '',
    viewerCount: document.querySelectorAll('.cesium-viewer').length,
    canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
  }));
  assert.equal(state.snapshot.schemaVersion, 'earthus.materialized-current.v5.2');
  assert.equal(state.snapshot.computeClass, 'C1_MATERIALIZED_SHARED');
  assert.equal(state.snapshot.shareScope, 'PUBLIC');
  assert.equal(state.snapshot.activeEventCount, 4);
  assert.equal(state.snapshot.stationCount, 97);
  assert.match(state.body, /MATERIALIZED/);
  assert.match(state.body, /EVENTS\s+4/);
  assert.equal(state.viewerCount, 1);
  assert.equal(state.canvasCount, 1);
  assert.ok(requests.some(url => /\/v2\/data\/materialized\/current\.json/.test(url)));
  assert.equal(requests.filter(url => /mapservices\.weather\.noaa\.gov|apihub\.kma\.go\.kr/.test(url)).length, 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('V52 MATERIALIZED EARTH BROWSER: PASS', JSON.stringify(state.snapshot));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
