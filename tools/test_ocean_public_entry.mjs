#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');
const [html, main, hub, outdoor, css, redirect, sw, scene, trenchCards, ui] = await Promise.all([
  read('prototype/index.html'), read('prototype/js/main.js'), read('prototype/js/ui-ocean.js'),
  read('prototype/js/ui-outdoor.js'), read('prototype/css/app.css'), read('prototype/ocean.html'), read('prototype/sw.js'),
  read('prototype/js/scene.js'), read('prototype/js/ocean/trenchcards.js'), read('prototype/js/ui.js'),
]);

assert.doesNotMatch(html, /data-act="ocean"/);
assert.match(html, /data-act="outdoor"/);
assert.match(html, /id="oceanSheet"/);
assert.match(html, /js\/main\.js\?v=20260821-v8p3-2/);
assert.match(main, /import \{ oceanPanel \} from '.\/ui-ocean\.js\?v=20260821-v8p3-1'/);
assert.doesNotMatch(main, /layerBar\.onAction\('ocean'/);
assert.match(main, /if \(oceanHubRoute\) queueMicrotask\(\(\) => outdoorPanel\.open\(\)\)/);
assert.match(main, /const oceanHubRoute = oceanRoute === 'hub'/);
for (const action of ['surf', 'fishing', 'dive', 'turtle', 'seabird', 'migbird', 'ecobird']) {
  assert.match(main, new RegExp(`${action}:`), `missing ${action} operating route`);
}
for (const layer of ['sst', 'sstanom', 'wave', 'swell', 'current', 'buoy']) {
  assert.match(outdoor, new RegExp(`act: 'layer:${layer}'`), `missing ${layer} Hobby layer entry`);
}
for (const action of ['surf', 'fishing', 'dive', 'trench', 'vessel', 'my-ocean',
  'turtle', 'seabird', 'migbird', 'ecobird', 'para', 'mountain', 'sky']) {
  assert.match(outdoor, new RegExp(`'${action}'`), `missing categorized hobby route: ${action}`);
}
assert.match(main, /dive: openFeaturedDive/);
assert.match(main, /sceneMgr\.to\('ocean', \{ stage: 'dive' \}\)/);
assert.match(scene, /next === 'ocean' && stage === 'dive'/);
assert.match(trenchCards, /async openFeaturedDive\(\)/);
assert.match(trenchCards, /await this\.openDiveAt\(item\.lat, item\.lon/);
assert.match(ui, /sceneMgr\.to\('ocean', \{ stage: 'dive' \}\)/);
assert.match(ui, /diveScene\.open\(\{ lat: m\.lat, lon: m\.lon, name \}\)/);
assert.match(hub, /myView\(ko\)/);
assert.match(hub, /ko: 'SAFETY'/);
assert.match(hub, /ko: 'MARINE LIFE'/);
assert.match(hub, /Marine Life/);
assert.match(hub, /ko: 'Vessels', en: 'Vessels'/);
assert.match(hub, /https:\/\/mtis\.komsa\.or\.kr\/stg\/traffic\/liveSea/);
assert.match(hub, /실시간 선박 위치|Live vessel positions/);
assert.match(hub, /여객선 위치 · 운항|Passenger vessel position/);
assert.doesNotMatch(hub, /Vessels · UNAVAILABLE|badge: 'GATED'/);
assert.doesNotMatch(hub, /무료|\bFREE\b|\bFree\b|\bfree\b/);
assert.doesNotMatch(hub, /출조·입수 가능 여부를 예보하지 않습니다|does not forecast whether departure/);
assert.match(css, /\.ocean-layer,.ocean-module,.ocean-back\{ min-height:44px/);
assert.match(redirect, /location\.replace\('\/\?ocean=hub'\)/);
assert.match(sw, /earthus-shell-2026-08-20-hobby-ocean1/);
assert.doesNotMatch(hub, /Math\.random|setInterval|requestAnimationFrame|clampToGround/);

console.log('PASS: Ocean is consolidated into five Hobby categories with six layers, vertical routes, My Ocean and official vessels');
