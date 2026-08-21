import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const prototypeRoot = new URL('../prototype/', import.meta.url).pathname;
const mime = { '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html lang="ko"><body><div id="srcNote"></div></body></html>');
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const sourcePath = pathname === '/js/config.local.js'
      ? join(prototypeRoot, 'js/config.local.example.js')
      : join(prototypeRoot, pathname);
    if (relative(prototypeRoot, sourcePath).startsWith('..')) throw new Error('outside prototype');
    response.writeHead(200, { 'content-type': mime[extname(sourcePath)] || 'text/plain; charset=utf-8' });
    response.end(await readFile(sourcePath));
  } catch (_) {
    response.writeHead(404);
    response.end('not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async () => {
    const {
      compactActiveSources, resolveActiveSourceId, sourceNote,
    } = await import('/js/ui-source.js?active-source-test=2');
    const { store } = await import('/js/store.js');
    const both = resolveActiveSourceId(id => ['tourism', 'clouds'].includes(id));
    const cloudsOnly = resolveActiveSourceId(id => id === 'clouds');
    const compacted = compactActiveSources([
      '서울특별시 실시간 인구데이터',
      'USGS 지진',
      '서울특별시 실시간 인구데이터',
      'NASA FIRMS',
      'GDACS',
    ], true);

    store.layers.tourism = true;
    store.layers.clouds = true;
    store.layers.quake = true;
    store.layers.wildfire = true;
    store.layers.cyclone = true;
    sourceNote.root = document.getElementById('srcNote');
    await sourceNote.render();
    return { both, cloudsOnly, compacted, inlineSource: sourceNote.root.dataset.inlineSource || '' };
  });
  assert.equal(result.both, 'tourism');
  assert.equal(result.cloudsOnly, 'clouds');
  assert.equal(result.compacted, '서울특별시 실시간 인구데이터 · USGS 지진 · 외 2');
  assert.match(result.inlineSource,
    /^서울특별시 실시간 인구데이터 · NASA FIRMS 위성 화재 관측 · 외 2$/);
  assert.doesNotMatch(result.inlineSource, /NOAA GMGSI/);
  console.log('EARTHUS v8 active source context: PASS');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
