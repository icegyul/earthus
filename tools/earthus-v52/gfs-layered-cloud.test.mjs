import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REAL_CLOUD_FIDELITY_LADDER,
  assessCloudManifestFreshness,
  deriveLayeredCloudFields,
  validateLayeredCloudManifest,
} from '../../prototype/v2/js/gfs-cloud-layered-fallback.js';

const manifest = Object.freeze({
  ready: true,
  production: true,
  synthetic: false,
  encoding: 'UINT8_0_255',
  byteLength: 8,
  densityUrl: 'density.u8',
  dimensions: { x: 2, y: 1, z: 4 },
  boundsDegrees: { west: 108, east: 109, south: 35, north: 35.5 },
  altitudeAxisM: [500, 2500, 5000, 9000],
  cloudState: {
    truthClass: 'MODELLED_NWP',
    sourceId: 'NOAA_NCEP_GFS_0P50_NOMADS',
    validAt: '2026-08-30T12:00:00Z',
    volume: { densityReady: true, verticalStructureReady: true },
  },
});

test('real GFS columns collapse into hand-checked low, mid and high layers', () => {
  const density = Uint8Array.from([
    10, 20,
    30, 40,
    50, 60,
    70, 80,
  ]);
  const result = deriveLayeredCloudFields(manifest, density);

  assert.deepEqual(result.layers.map(layer => layer.id), ['LOW', 'MID', 'HIGH']);
  assert.deepEqual(result.layers.map(layer => layer.altitudeM), [1500, 5000, 9000]);
  assert.deepEqual([...result.layers[0].alpha], [30, 40]);
  assert.deepEqual([...result.layers[1].alpha], [50, 60]);
  assert.deepEqual([...result.layers[2].alpha], [70, 80]);
  assert.equal(result.truthClass, 'MODELLED_NWP_LAYERED');
});

test('production cloud ladder contains only real 3D outputs and terminates at OFF', () => {
  assert.deepEqual(REAL_CLOUD_FIDELITY_LADDER,
    ['GLOBAL_LAYERED', 'VOLUME', 'LAYERED', 'CTH_RELIEF', 'OFF']);
  assert.equal(REAL_CLOUD_FIDELITY_LADDER.includes('SHELL'), false);
});

test('model cloud freshness is explicit and stale manifests fail closed', () => {
  assert.deepEqual(assessCloudManifestFreshness(manifest, {
    nowMs: Date.parse('2026-08-31T00:00:00Z'),
    maximumAgeMs: 18 * 60 * 60 * 1000,
  }), {
    status: 'CURRENT_MODEL_ANALYSIS',
    validAt: '2026-08-30T12:00:00.000Z',
    ageMs: 12 * 60 * 60 * 1000,
  });
  assert.throws(
    () => assessCloudManifestFreshness(manifest, {
      nowMs: Date.parse('2026-09-01T12:00:00Z'),
      maximumAgeMs: 18 * 60 * 60 * 1000,
    }),
    /GFS_LAYERED_STALE/,
  );
});

test('layer derivation rejects synthetic or byte-incomplete volume data', () => {
  assert.throws(
    () => validateLayeredCloudManifest({ ...manifest, synthetic: true }),
    /GFS_LAYERED_TRUTH_GATE/,
  );
  assert.throws(
    () => deriveLayeredCloudFields(manifest, Uint8Array.from([1, 2, 3])),
    /GFS_LAYERED_DENSITY_LENGTH/,
  );
});
