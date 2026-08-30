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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/v2/`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await wait(page, () => document.documentElement.dataset.c === '1'
    && !!globalThis.__earthusV52Materialized?.snapshot?.(), 65000, 'MOBILE_READY_TIMEOUT');
  const initial = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    canvasCount: document.querySelectorAll('#g .cesium-widget canvas').length,
    search: document.querySelector('#search')?.getBoundingClientRect(),
    tab: document.querySelector('#tab')?.getBoundingClientRect(),
    dockTargets: [...document.querySelectorAll('#dock button')].map(button => button.getBoundingClientRect()),
  }));
  assert.ok(initial.overflow <= 0, `MOBILE_HORIZONTAL_OVERFLOW:${initial.overflow}`);
  assert.equal(initial.canvasCount, 1);
  assert.ok(initial.search.height >= 44, `MOBILE_SEARCH_TARGET:${initial.search.height}`);
  assert.ok(initial.tab.width >= 44, `MOBILE_INTELLIGENCE_TARGET:${initial.tab.width}`);
  assert.ok(initial.dockTargets.every(rect => rect.width >= 44 && rect.height >= 44));

  await page.click('[data-menu="WEATHER"]');
  await wait(page, () => document.querySelectorAll('#chips button').length >= 8, 5000, 'MOBILE_WEATHER_CHIPS');
  const chips = await page.evaluate(() => [...document.querySelectorAll('#chips button')]
    .map(button => button.getBoundingClientRect()));
  assert.ok(chips.every(rect => rect.height >= 44), `MOBILE_CHIP_TARGET:${Math.min(...chips.map(rect => rect.height))}`);

  await page.click('#tab');
  await wait(page, () => /MATERIALIZED/.test(document.getElementById('body')?.innerText || ''), 10000, 'MOBILE_MATERIALIZED_PANEL');
  const panel = await page.evaluate(() => ({
    rect: document.querySelector('#intel')?.getBoundingClientRect(),
    body: document.querySelector('#body')?.innerText || '',
    overflow: document.documentElement.scrollWidth - innerWidth,
    targets: [
      document.querySelector('#close'),
      ...document.querySelectorAll('#intel nav button'),
    ].map(button => {
      const rect = button?.getBoundingClientRect();
      return { label: button?.textContent?.trim() || '', width: rect?.width || 0, height: rect?.height || 0 };
    }),
  }));
  assert.ok(panel.rect.left >= 0 && panel.rect.right <= 390);
  assert.ok(panel.overflow <= 0);
  assert.ok(panel.targets.every(target => target.width >= 44 && target.height >= 44),
    `MOBILE_INTELLIGENCE_PANEL_TARGET:${JSON.stringify(panel.targets)}`);
  assert.match(panel.body, /EVENTS\s+4/);
  assert.equal(errors.length, 0, errors.join('\n'));
  const output = process.env.EARTHUS_V52_MOBILE_SCREENSHOT || '/private/tmp/earthus-v52-mobile.png';
  await page.screenshot({ path: output, fullPage: true });
  console.log('V52 MOBILE 390x844: PASS', JSON.stringify({ initial, panel }));
} finally {
  await browser.close();
  await new Promise(resolve => srv.close(resolve));
}
