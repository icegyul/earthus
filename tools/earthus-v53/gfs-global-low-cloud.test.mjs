import assert from 'node:assert/strict';
import test from 'node:test';

import {
  globalCloudVisible,
  splitGlobalCloudDensity,
  validateGlobalCloudManifest,
} from '../../prototype/v2/js/gfs-cloud-global-low.js';

const manifest = Object.freeze({
  schemaVersion: 'earthus.cloud.global-layered.v1',
  ready: true,
  production: false,
  synthetic: false,
  artifactState: 'LOCAL_GENERATED_FROM_LIVE_NOAA_SOURCE',
  deploymentEvidence: null,
  encoding: 'UINT8_0_255_BAND_MAJOR',
  byteLength: 195_480,
  densityUrl: 'density-bands.u8',
  densitySha256: 'fixture-sha',
  cloudState: {
    truthClass: 'MODELLED_NWP_GLOBAL_LAYERED',
    sourceId: 'NOAA_NCEP_GFS_1P00_NOMADS',
    validAt: '2026-08-30T18:00:00Z',
    forecastStepHours: 0,
    analysisNotForecast: true,
    verticalStructureReady: true,
  },
  dimensions: { x: 360, y: 181, bands: 3 },
  boundsDegrees: { west: -180, east: 180, south: -90, north: 90 },
  layers: [
    { id: 'LOW', representativeAltitudeM: 900 },
    { id: 'MID', representativeAltitudeM: 4_800 },
    { id: 'HIGH', representativeAltitudeM: 10_700 },
  ],
  sourceGrid: 'NOAA_GFS_1P00_ANALYSIS',
  renderContract: 'ZERO_THICKNESS_PLANES_NO_FAKE_CLOUD_VOLUME',
  fakeThickness: false,
});

test('local live-source manifest requires an explicit non-production test policy', () => {
  assert.throws(() => validateGlobalCloudManifest(manifest, {
    nowMs: Date.parse('2026-08-31T03:00:00Z'),
  }), /GFS_GLOBAL_PRODUCTION_GATE/);
  const accepted = validateGlobalCloudManifest(manifest, {
    allowLocalArtifact: true,
    nowMs: Date.parse('2026-08-31T03:00:00Z'),
  });
  assert.equal(accepted.manifest, manifest);
  assert.equal(accepted.freshness.status, 'CURRENT_MODEL_ANALYSIS');
  assert.equal(accepted.freshness.ageMs, 9 * 60 * 60 * 1000);
  assert.equal(accepted.deploymentState, 'LOCAL_NOT_DEPLOYED');
});

test('global manifest rejects synthetic, stale, partial-bounds or fake-thickness artifacts', () => {
  const options = { allowLocalArtifact: true, nowMs: Date.parse('2026-08-31T03:00:00Z') };
  assert.throws(() => validateGlobalCloudManifest({ ...manifest, synthetic: true }, options),
    /GFS_GLOBAL_TRUTH_GATE/);
  assert.throws(() => validateGlobalCloudManifest({
    ...manifest,
    boundsDegrees: { west: 108, east: 155, south: 18, north: 52 },
  }, options), /GFS_GLOBAL_BOUNDS_GATE/);
  assert.throws(() => validateGlobalCloudManifest({ ...manifest, fakeThickness: true }, options),
    /GFS_GLOBAL_RENDER_CONTRACT/);
  assert.throws(() => validateGlobalCloudManifest(manifest, {
    allowLocalArtifact: true,
    nowMs: Date.parse('2026-09-01T18:01:00Z'),
  }), /GFS_GLOBAL_STALE/);
});

test('band-major density splits into three exact global planes', () => {
  const smallManifest = {
    ...manifest,
    byteLength: 24,
    dimensions: { x: 4, y: 2, bands: 3 },
  };
  const bytes = Uint8Array.from({ length: 24 }, (_, index) => index);
  const planes = splitGlobalCloudDensity(smallManifest, bytes);
  assert.equal(planes.length, 3);
  assert.deepEqual(planes.map(plane => plane.id), ['LOW', 'MID', 'HIGH']);
  assert.deepEqual([...planes[0].density], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...planes[2].density], [16, 17, 18, 19, 20, 21, 22, 23]);
  assert.throws(() => splitGlobalCloudDensity(smallManifest, bytes.subarray(0, 12)),
    /GFS_GLOBAL_DENSITY_LENGTH/);
});

test('global low-LOD is visible only for the high-altitude Earth surface scene', () => {
  assert.equal(globalCloudVisible({ mode: 'EARTH', cameraHeightM: 14_500_000 }), true);
  assert.equal(globalCloudVisible({ mode: 'EARTH', cameraHeightM: 4_999_999 }), false);
  assert.equal(globalCloudVisible({ mode: 'TRENCH', cameraHeightM: 14_500_000 }), false);
  assert.equal(globalCloudVisible({ mode: 'UNDERWATER', cameraHeightM: 14_500_000 }), false);
});
