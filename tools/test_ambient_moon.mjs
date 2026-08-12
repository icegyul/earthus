#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/ambient-moon-math.js', import.meta.url), 'utf8');
const { classifyMoonDisplay } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const base = {
  inFront: true,
  occludedByEarth: false,
  screenX: 920,
  screenY: 240,
  viewportWidth: 1280,
  viewportHeight: 720,
  moonRadius: 38.4,
};

const visible = classifyMoonDisplay(base);
assert.deepEqual(visible, {
  visible: true, x: 920, y: 240, distanceMode: 'compressed-3d-direction-preserving',
});

const occluded = classifyMoonDisplay({ ...base, occludedByEarth: true });
assert.deepEqual(occluded, { visible: false, reason: 'EARTH_OCCLUDED' });

const behind = classifyMoonDisplay({ ...base, inFront: false });
assert.deepEqual(behind, { visible: false, reason: 'BEHIND_CAMERA' });

const outside = classifyMoonDisplay({ ...base, screenX: -100 });
assert.deepEqual(outside, { visible: false, reason: 'OUTSIDE_VIEWPORT' });

assert.throws(
  () => classifyMoonDisplay({ ...base, screenX: Number.NaN }),
  /FINITE_MOON_PROJECTION_REQUIRED/,
);

console.log('Ambient Moon visibility and occlusion: 5/5 passed');
