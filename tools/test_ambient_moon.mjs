#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/ambient-moon-math.js', import.meta.url), 'utf8');
const { projectMoonDirection } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const base = {
  towardCamera: 0.4,
  viewportWidth: 1280,
  viewportHeight: 720,
  earthRadius: 187.2,
  moonRadius: 38.4,
  gap: 25.2,
};

const right = projectMoonDirection({ ...base, horizontal: 1, vertical: 0 });
assert.equal(right.visible, true);
assert.equal(right.depth, 'near');
assert.ok(right.x > 640 && Math.abs(right.y - 360) < 1e-9);

const upperLeft = projectMoonDirection({ ...base, horizontal: -1, vertical: 1, towardCamera: -0.2 });
assert.equal(upperLeft.depth, 'far');
assert.ok(upperLeft.x < 640 && upperLeft.y < 360);

const aligned = projectMoonDirection({ ...base, horizontal: 0, vertical: 0 });
assert.deepEqual(aligned, { visible: false, reason: 'VIEW_AXIS_ALIGNMENT' });

assert.throws(
  () => projectMoonDirection({ ...base, horizontal: Number.NaN, vertical: 1 }),
  /FINITE_MOON_PROJECTION_REQUIRED/,
);

console.log('Ambient Moon direction projection: 4/4 passed');
