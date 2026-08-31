import assert from 'node:assert/strict';
import test from 'node:test';

import {
  terrainPresentationForHeight,
  physicalAmbientCamera,
} from '../../prototype/v2/js/physical-earth-presentation.js';

test('far scopes apply labeled presentation scale while close terrain stays at source scale', () => {
  assert.deepEqual(terrainPresentationForHeight(10_800_000), {
    style: 'REAL',
    verticalExaggeration: 2.2,
    verticalExaggerationClass: 'ESRI_TERRAIN3D_LABELED_PRESENTATION_SCALE_2.2X',
    detailImageryAlpha: 0.45,
  });
  assert.deepEqual(terrainPresentationForHeight(450_000), {
    style: 'REAL',
    verticalExaggeration: 1,
    verticalExaggerationClass: 'ESRI_TERRAIN3D_SOURCE_SCALE_1X',
    detailImageryAlpha: 1,
  });
});

test('DATA style hands the far view to the baked data map instead of photos', () => {
  assert.equal(terrainPresentationForHeight(10_800_000, 'DATA').detailImageryAlpha, 0.06);
  assert.equal(terrainPresentationForHeight(450_000, 'DATA').detailImageryAlpha, 1);
  assert.equal(
    terrainPresentationForHeight(10_800_000, 'DATA').verticalExaggeration,
    terrainPresentationForHeight(10_800_000, 'REAL').verticalExaggeration,
  );
});

test('physical ambient camera is continental and oblique instead of a distant nadir photo', () => {
  const desktop = physicalAmbientCamera({ mobile: false });
  const mobile = physicalAmbientCamera({ mobile: true });
  assert.ok(desktop.heightM >= 13_000_000 && desktop.heightM <= 16_000_000);
  assert.ok(Math.abs(desktop.latitudeDeg) <= 25);
  assert.ok(desktop.pitchDeg <= -78);
  assert.ok(mobile.heightM > desktop.heightM);
});
