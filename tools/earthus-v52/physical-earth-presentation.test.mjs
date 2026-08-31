import assert from 'node:assert/strict';
import test from 'node:test';

import {
  terrainPresentationForHeight,
  physicalAmbientCamera,
} from '../../prototype/v2/js/physical-earth-presentation.js';

test('global terrain stays at source scale while presentation requests real LOD', () => {
  assert.deepEqual(terrainPresentationForHeight(10_800_000), {
    verticalExaggeration: 1,
    detailImageryAlpha: 0.22,
  });
  assert.deepEqual(terrainPresentationForHeight(900_000), {
    verticalExaggeration: 1,
    detailImageryAlpha: 1,
  });
});

test('physical ambient camera is continental and oblique instead of a distant nadir photo', () => {
  const desktop = physicalAmbientCamera({ mobile: false });
  const mobile = physicalAmbientCamera({ mobile: true });
  assert.ok(desktop.heightM >= 13_000_000 && desktop.heightM <= 16_000_000);
  assert.ok(Math.abs(desktop.latitudeDeg) <= 25);
  assert.ok(desktop.pitchDeg <= -78);
  assert.ok(mobile.heightM > desktop.heightM);
});
