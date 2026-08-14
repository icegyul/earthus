#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = await readFile(
  path.join(root, 'prototype/js/space/astrometry-feature-extractor.js'), 'utf8');
const { extractStarFeatures, rgbaToLuminance } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

const width = 48;
const height = 32;
const luminance = new Uint8ClampedArray(width * height).fill(12);
const stars = [
  [8, 7, 230], [19, 9, 210], [35, 7, 250], [13, 23, 220], [29, 21, 240], [40, 25, 200],
];
for (const [x, y, peak] of stars) {
  luminance[y * width + x] = peak;
  luminance[y * width + x - 1] = Math.round(peak * .36);
  luminance[y * width + x + 1] = Math.round(peak * .31);
  luminance[(y - 1) * width + x] = Math.round(peak * .28);
  luminance[(y + 1) * width + x] = Math.round(peak * .24);
}

const result = extractStarFeatures({ width, height, luminance }, { thresholdSigma: 2.5 });
assert.equal(result.schema, 'earthus.astrometry-feature-extraction.v1');
assert.equal(result.features.length, stars.length);
assert.equal(result.diagnostics.networkRequestCount, 0);
assert.equal(result.diagnostics.originalUploadCount, 0);
for (const [x, y] of stars) {
  assert.equal(result.features.some(feature => Math.abs(feature.x - x) < 1
    && Math.abs(feature.y - y) < 1), true, `missing centroid near ${x},${y}`);
}

const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
assert.deepEqual([...rgbaToLuminance({ width: 2, height: 1, rgba })], [54, 182]);
assert.throws(() => extractStarFeatures({ width: 2, height: 2, luminance: new Uint8Array(4) }),
  error => error.code === 'FEATURE_IMAGE_DIMENSIONS_INVALID');
assert.throws(() => rgbaToLuminance({ width: 2, height: 1, rgba: new Uint8Array(3) }),
  error => error.code === 'RGBA_IMAGE_INVALID');

console.log(`PASS: local arbitrary-image feature extraction ${result.features.length} stars, uploads 0`);
