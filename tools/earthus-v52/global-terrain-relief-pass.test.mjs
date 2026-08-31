import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveGlobalTerrainRelief,
  validateGlobalTerrainReliefGrid,
} from '../../prototype/v2/js/global-terrain-relief-pass.js';

const grid = Object.freeze({
  sourceId: 'ESRI_WORLDELEVATION3D_TERRAIN3D',
  truthClass: 'PROVIDER_DERIVED_TERRAIN_MATERIAL',
  synthetic: false,
  width: 5,
  height: 3,
  spacingDeg: 5,
  sampleLevel: 2,
  heightsM: Float32Array.from([
    -10, 100, 1000, 100, -10,
    -10, 250, 2500, 250, -10,
    -10, 100, 1000, 100, -10,
  ]),
});

test('actual provider heights become transparent ocean and visible land relief material', () => {
  const relief = deriveGlobalTerrainRelief(grid);

  assert.equal(relief.sourceId, 'ESRI_WORLDELEVATION3D_TERRAIN3D');
  assert.equal(relief.synthetic, false);
  assert.equal(relief.pixels.length, 5 * 3 * 4);
  assert.equal(relief.pixels[3], 0);
  assert.equal(relief.pixels[(2 * 4) + 3] > 0, true);
  const center = (1 * 5 + 2) * 4;
  const neighbor = (1 * 5 + 1) * 4;
  assert.equal(relief.pixels[center + 3] > 0, true);
  assert.equal(relief.pixels[neighbor + 3] > 0, true);
  assert.equal(relief.pixels[neighbor + 3] > relief.pixels[center + 3], true);
  assert.equal(relief.stats.validSamples, 15);
  assert.equal(relief.stats.landSamples, 9);
  assert.equal(relief.stats.maxHeightM, 2500);
  assert.equal(relief.stats.minHeightM, -10);
});

test('global terrain relief fails closed for synthetic, incomplete or non-finite grids', () => {
  assert.throws(
    () => validateGlobalTerrainReliefGrid({ ...grid, synthetic: true }),
    /GLOBAL_TERRAIN_RELIEF_SYNTHETIC_FORBIDDEN/,
  );
  assert.throws(
    () => validateGlobalTerrainReliefGrid({ ...grid, heightsM: Float32Array.from([1, 2]) }),
    /GLOBAL_TERRAIN_RELIEF_LENGTH/,
  );
  const nonFinite = Float32Array.from(grid.heightsM);
  nonFinite[4] = Number.NaN;
  assert.throws(
    () => validateGlobalTerrainReliefGrid({ ...grid, heightsM: nonFinite }),
    /GLOBAL_TERRAIN_RELIEF_NON_FINITE/,
  );
});
