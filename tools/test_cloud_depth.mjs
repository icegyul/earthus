import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('prototype/js/cloud-depth-provider.js', 'utf8')
  .replace(/import \{ cloudShadowSourceAt, normalizeCloudShadowSun \}[^;]+;/,
    `const normalizeCloudShadowSun = sun => sun;
     const cloudShadowSourceAt = () => ({ longitude: 0.01, latitude: 0.01, daylight: 1 });`)
  .replace(/export class CloudDepthImageryProvider[\s\S]*$/, '');
const mod = await import(`data:text/javascript,${encodeURIComponent(source)}#${Date.now()}`);

assert.equal(mod.cloudDepthMaskAlpha({ red: 255, green: 255, blue: 255, alpha: 0, mode: 'alpha' }), 0);
assert.equal(mod.cloudDepthMaskAlpha({ red: 20, green: 20, blue: 20, alpha: 255, mode: 'infrared' }), 0);
assert.ok(mod.cloudDepthMaskAlpha({ red: 240, green: 230, blue: 225, alpha: 255, mode: 'visible' }) > 0.5);
assert.ok(mod.cloudDepthMaskAlpha({ red: 240, green: 70, blue: 30, alpha: 255, mode: 'visible' }) < 0.1);
assert.ok(mod.cloudDepthMaskAlpha({ red: 250, green: 250, blue: 250, alpha: 128, mode: 'alpha' }) > 0.49);

const relief = mod.cloudDepthOffset({ width: 1600, height: 1600 });
assert.deepEqual(relief, { x: 5, y: 5, daylight: 1 });
const night = mod.cloudDepthOffset({
  rectangle: { west: -0.1, east: 0.1, south: -0.1, north: 0.1 },
  sun: [1, 0, 0], width: 256, height: 256,
});
assert.ok(Number.isFinite(night.x) && Number.isFinite(night.y));

const imagery = fs.readFileSync('prototype/js/layers/imagery.js', 'utf8');
assert.match(imagery, /new CloudDepthImageryProvider/);
assert.match(imagery, /mode === 'visible' \? this\._sunFixedAt\(ts\) : null/);
assert.match(imagery, /const cloudChannel = visible \|\| ch === 'ir112' \|\| ch === 'ir112ea' \|\| ch === 'nightlow'/);
assert.match(imagery, /old\.forEach\(o => this\._removeImageryWithDepth\(o\)\)/);
assert.match(imagery, /this\.himaLayers\.forEach\(L => this\._removeImageryWithDepth\(L\)\)/);

console.log('cloud depth tests: ok');
