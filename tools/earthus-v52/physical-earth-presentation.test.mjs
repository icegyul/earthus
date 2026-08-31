import assert from 'node:assert/strict';
import test from 'node:test';

import {
  terrainPresentationForHeight,
  physicalAmbientCamera,
  fitGlobeHeightM,
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

test('ambient camera matches the 1.0 viewpoint contract (127E/25N, nadir, screen-fit globe)', () => {
  const desktop = physicalAmbientCamera({ mobile: false });
  const mobile = physicalAmbientCamera({ mobile: true });
  assert.equal(desktop.longitudeDeg, 127);
  assert.equal(desktop.latitudeDeg, 25);
  assert.equal(desktop.pitchDeg, -90);
  assert.equal(desktop.headingDeg, 0);
  assert.equal(desktop.globeFraction, 0.52);
  assert.ok(mobile.globeFraction > desktop.globeFraction);
  const fov = Math.PI / 3;
  const wide = fitGlobeHeightM({ fovRad: fov, aspect: 16 / 9, fraction: 0.52 });
  const tall = fitGlobeHeightM({ fovRad: fov, aspect: 0.5, fraction: 0.6 });
  assert.ok(wide > 20_000_000 && wide < 34_000_000, `wide=${wide}`);
  assert.ok(tall > 8_000_000 && tall < 20_000_000, `tall=${tall}`);
});
