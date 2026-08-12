#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/cloud-shadow.js', import.meta.url), 'utf8');
const shadow = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const overhead = shadow.cloudShadowSourceAt({ longitude: 0, latitude: 0, sun: [1, 0, 0] });
assert.ok(Math.abs(overhead.longitude) < 1e-12);
assert.ok(Math.abs(overhead.latitude) < 1e-12);
assert.equal(overhead.daylight, 1);

const morning = shadow.cloudShadowSourceAt({ longitude: 0, latitude: 0, sun: [1, 1, 0] });
assert.ok(morning.longitude > 0, 'shadow ground point must sample cloud toward the sun');
assert.ok(morning.daylight > 0);

assert.equal(
  shadow.cloudShadowSourceAt({ longitude: Math.PI, latitude: 0, sun: [1, 0, 0] }),
  null,
  'night side must not receive a cloud shadow',
);

const rgba = new Uint8ClampedArray(16 * 8 * 4);
for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = 255;
const raster = shadow.buildCloudShadowAlpha({
  rgba, sourceWidth: 16, sourceHeight: 8,
  north: Math.PI / 3, south: -Math.PI / 3, sun: [1, 0, 0],
});
assert.deepEqual({ width: raster.width, height: raster.height }, { width: 4, height: 2 });
assert.ok([...raster.alpha].some(value => value > 0));
assert.ok([...raster.alpha].some(value => value === 0));

assert.throws(() => shadow.normalizeCloudShadowSun([0, 0, 0]), /NONZERO_SUN_VECTOR_REQUIRED/);
console.log('Cloud shadow projection: 8/8 passed');
