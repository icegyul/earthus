import assert from 'node:assert/strict';
import fs from 'node:fs';

const cacheSource = fs.readFileSync('prototype/js/satellite-tile-cache.js', 'utf8');
const cacheMod = await import(`data:text/javascript,${encodeURIComponent(cacheSource)}#${Date.now()}`);
let calls = 0;
const cache = new cacheMod.SharedTilePromiseCache({ maxEntries: 2, ttlMs: 10_000 });
const one = cache.getOrCreate('frame/0/0/0', () => { calls++; return Promise.resolve('tile'); });
const two = cache.getOrCreate('frame/0/0/0', () => { calls++; return Promise.resolve('duplicate'); });
assert.equal(await one, 'tile'); assert.equal(await two, 'tile'); assert.equal(calls, 1);
cache.getOrCreate('frame/0/0/1', () => Promise.resolve('b'));
cache.getOrCreate('frame/0/0/2', () => Promise.resolve('c'));
assert.equal(cache.snapshot().size, 2); assert.equal(cache.snapshot().evicted, 1);

const policySource = fs.readFileSync('prototype/js/satellite-visual-policy.js', 'utf8');
const policy = await import(`data:text/javascript,${encodeURIComponent(policySource)}#${Date.now()}`);
assert.equal(policy.satelliteVisualPolicy('GK2A', 'wv063').enabled, false);
assert.equal(policy.satelliteVisualPolicy('HIMAWARI_GIBS', 'Band13').effect, 'relief');
assert.match(policy.satelliteVisualPolicy('HIMAWARI_GIBS', 'Band13').limit, /강수량이 아니라/);

const depthFile = fs.readFileSync('prototype/js/cloud-depth-provider.js', 'utf8');
let depthSource = depthFile
  .replace(/import \{ cloudShadowSourceAt, normalizeCloudShadowSun \}[^;]+;/,
    `const normalizeCloudShadowSun = sun => sun;
     const cloudShadowSourceAt = () => ({ longitude: 0.01, latitude: 0.01, daylight: 1 });`)
  .replace(/import \{ assertRasterDimensions, RASTER_LIMITS \}[^;]+;/,
    `const assertRasterDimensions = () => true;
     const RASTER_LIMITS = { maxWorkerTasks: 2 };`)
  .replace(/export class CloudDepthImageryProvider[\s\S]*$/, '');
const depth = await import(`data:text/javascript,${encodeURIComponent(depthSource)}#${Date.now()}`);
const golden = JSON.parse(fs.readFileSync('tools/fixtures/satellite-visual-golden-v1.json', 'utf8'));
for (const item of golden.cases) {
  const [red, green, blue, alpha] = item.rgba;
  const actual = depth.cloudDepthMaskAlpha({ red, green, blue, alpha, mode: item.mode });
  if (item.expectedAlpha != null) assert.ok(Math.abs(actual - item.expectedAlpha) < 1e-8, item.id);
  if (item.minAlpha != null) assert.ok(actual >= item.minAlpha, item.id);
  if (item.maxAlpha != null) assert.ok(actual <= item.maxAlpha, item.id);
}

const imagery = fs.readFileSync('prototype/js/layers/imagery.js', 'utf8');
assert.match(imagery, /const cloudChannel = visible \|\| ch === 'ir112' \|\| ch === 'ir112ea' \|\| ch === 'nightlow'/);
assert.doesNotMatch(imagery, /cloudChannel[^\n]*wv063/);
assert.match(depthFile, /offset\.x - 1[\s\S]*outputWidth \+ 2/, 'tile gutter must remain');
console.log(`visual pipeline tests: ${golden.cases.length + 8} checks passed`);
