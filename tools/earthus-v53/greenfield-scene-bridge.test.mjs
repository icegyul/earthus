import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSceneTruth } from '../../prototype/v2/js/greenfield-scene-bridge.js';

function fakeRealEarth(overrides = {}) {
  return {
    cloudFidelity: () => 'GLOBAL_LAYERED',
    terrainTruth: () => 'ESRI_TERRAIN3D',
    bathymetryTruth: () => 'ESRI_TOPOBATHY3D',
    waterTruth: () => 'PROVIDER_WATER_MASK',
    polarVisible: () => true,
    polarTruth: () => 'NASA_GIBS_GEOGRAPHIC_POLAR_HOLE_FILL_IMAGERY_ONLY',
    oceanSurfaceSnapshot: () => ({ ready: true }),
    atmosphereLightSnapshot: () => ({ ready: true }),
    globalCloudTruth: () => ({ truthClass: 'MODELLED_NWP_GLOBAL_LAYERED' }),
    layeredCloudTruth: () => null,
    cthTruth: () => null,
    volumeTruth: () => null,
    defaultPhysicalReady: () => true,
    cloudDiagnostics: () => Object.freeze({ global: null }),
    ...overrides,
  };
}

test('camera height maps to the canonical scope ladder', () => {
  const realEarth = fakeRealEarth();
  assert.equal(deriveSceneTruth({ cameraHeightM: 20_000_000, realEarth }).scope, 'GLOBAL');
  assert.equal(deriveSceneTruth({ cameraHeightM: 3_000_000, realEarth }).scope, 'CONTINENT');
  assert.equal(deriveSceneTruth({ cameraHeightM: 1_000_000, realEarth }).scope, 'COUNTRY');
  assert.equal(deriveSceneTruth({ cameraHeightM: 300_000, realEarth }).scope, 'REGION');
  assert.equal(deriveSceneTruth({ cameraHeightM: 50_000, realEarth }).scope, 'LOCAL');
  assert.equal(deriveSceneTruth({ cameraHeightM: -2_000, realEarth }).scope, 'UNDERWATER');
});

test('visible semantic layers reflect only truth accessors that report data', () => {
  const truth = deriveSceneTruth({ cameraHeightM: 20_000_000, realEarth: fakeRealEarth() });
  assert.deepEqual([...truth.visibleSemanticLayers], [
    'TERRAIN:ESRI_TERRAIN3D',
    'BATHY:ESRI_TOPOBATHY3D',
    'WATER:PROVIDER_WATER_MASK',
    'POLAR:NASA_GIBS_GEOGRAPHIC_POLAR_HOLE_FILL_IMAGERY_ONLY',
    'OCEAN_SURFACE:ACTIVE',
    'ATMOSPHERE:PHYSICAL_LIGHT',
    'CLOUD:GLOBAL_LAYERED',
  ]);
  assert.deepEqual([...truth.truthClasses], ['MODELLED_NWP_GLOBAL_LAYERED']);
});

test('cloud OFF is absent from layers instead of being faked', () => {
  const truth = deriveSceneTruth({
    cameraHeightM: 20_000_000,
    realEarth: fakeRealEarth({ cloudFidelity: () => 'OFF', globalCloudTruth: () => null }),
  });
  assert.equal(truth.visibleSemanticLayers.some(layer => layer.startsWith('CLOUD:')), false);
  assert.deepEqual([...truth.truthClasses], []);
});

test('photo-as-world fidelities are rejected by the canonical policy', () => {
  for (const banned of ['THREE_SHELL', 'STATIC_SHELL', 'SATELLITE_SHELL', 'PHOTO']) {
    assert.throws(
      () => deriveSceneTruth({
        cameraHeightM: 20_000_000,
        realEarth: fakeRealEarth({ cloudFidelity: () => banned }),
      }),
      /PHOTO_AS_WORLD_FORBIDDEN/,
    );
  }
});

test('missing accessors degrade to empty evidence, never invented layers', () => {
  const truth = deriveSceneTruth({
    cameraHeightM: 9_000_000,
    realEarth: {
      cloudFidelity: () => 'OFF',
    },
  });
  assert.equal(truth.scope, 'GLOBAL');
  assert.deepEqual([...truth.visibleSemanticLayers], []);
  assert.equal(truth.sourceReadiness.defaultPhysicalReady, false);
  assert.equal(truth.sourceReadiness.cloudDiagnostics, null);
});
