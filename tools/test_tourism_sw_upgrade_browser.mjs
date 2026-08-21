#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../prototype');
const currentCache = 'earthus-shell-2026-08-21-tourism-density1';
const previousCache = 'earthus-shell-2026-08-20-weather-tourism1';
const unrelatedCache = 'earthus-unrelated-test-cache';
const mime = pathname => pathname.endsWith('.js') ? 'text/javascript; charset=utf-8'
  : pathname.endsWith('.webmanifest') ? 'application/manifest+json'
    : pathname.endsWith('.webp') ? 'image/webp' : 'text/html; charset=utf-8';

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/__sw-upgrade-fixture.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>SW upgrade fixture</title>');
      return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(root, relative);
    assert.ok(target.startsWith(`${root}${path.sep}`));
    await stat(target);
    response.writeHead(200, { 'content-type': mime(target), 'cache-control': 'no-cache' });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(`${origin}/__sw-upgrade-fixture.html`);
  await page.evaluate(async ({ previousCache, unrelatedCache }) => {
    const previous = await caches.open(previousCache);
    await previous.put('/js/legacy-tourism.js', new Response('legacy'));
    const unrelated = await caches.open(unrelatedCache);
    await unrelated.put('/sentinel.txt', new Response('keep'));
  }, { previousCache, unrelatedCache });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker?.state !== 'activated') await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`service worker state ${worker?.state}`)), 15_000);
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  });
  const cachesAfter = await page.evaluate(() => caches.keys());
  assert.ok(cachesAfter.includes(currentCache), 'current shell cache must be retained');
  assert.equal(cachesAfter.includes(previousCache), false, 'previous shell cache must be deleted');
  assert.ok(cachesAfter.includes(unrelatedCache), 'activation must not delete unrelated cache namespaces');
  await context.close();
  console.log(`tourism service worker upgrade: PASS (${previousCache} deleted, current retained)`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
