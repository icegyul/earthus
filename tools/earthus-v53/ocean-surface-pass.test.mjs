import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fresnelResponse,
  oceanSurfaceVisible,
  validateOceanSurfaceManifest,
} from '../../prototype/v2/js/ocean-surface-pass.js';

const manifest = Object.freeze({
  schemaVersion: 'earthus.physical-earth-assets.v1',
  oceanMask: {
    path: 'ocean-specular-mask.png',
    sha256: '05fefcbf59e5018ae580db9f0dbc874153d10025a6ea05b35a2251af4f1f56f1',
    source: 'Natural Earth admin 0 countries',
    sourceUrl: 'https://www.naturalearthdata.com/downloads/',
    license: 'Public domain',
    meaning: 'white=ocean specular response; black=Natural Earth land polygon',
  },
  waterNormal: {
    path: 'water-normal.jpg',
    sha256: 'b9f9500dc8092a6f007b251db3827c7f4e7741ff5098d060c8abf45f4e0cd4aa',
    source: 'CesiumJS 1.143 waterNormalsSmall.jpg',
    sourceUrl: 'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Assets/Textures/waterNormalsSmall.jpg',
    license: 'Apache-2.0',
    meaning: 'rendering-only surface-normal perturbation; not observed wave data',
  },
});

test('ocean surface accepts only the pinned public-domain mask and static rendering normal', () => {
  assert.equal(validateOceanSurfaceManifest(manifest), manifest);
  assert.throws(
    () => validateOceanSurfaceManifest({
      ...manifest,
      oceanMask: { ...manifest.oceanMask, license: 'UNKNOWN' },
    }),
    /OCEAN_SURFACE_MASK_LICENSE/,
  );
  assert.throws(
    () => validateOceanSurfaceManifest({
      ...manifest,
      waterNormal: { ...manifest.waterNormal, sha256: '' },
    }),
    /OCEAN_SURFACE_NORMAL_HASH/,
  );
});

test('camera grazing angle increases Fresnel response without animation or wave truth', () => {
  assert.deepEqual(fresnelResponse(1), { fresnel: 0, alpha: 0.1, specular: 0.08 });
  assert.deepEqual(fresnelResponse(0), { fresnel: 1, alpha: 0.35, specular: 0.5 });
  const middle = fresnelResponse(0.5);
  assert.ok(middle.alpha > 0.1 && middle.alpha < 0.35);
  assert.ok(middle.specular > 0.08 && middle.specular < 0.5);
});

test('ocean surface is visible only on the Earth surface scene', () => {
  assert.equal(oceanSurfaceVisible({ mode: 'EARTH', cameraHeightM: 14_500_000 }), true);
  assert.equal(oceanSurfaceVisible({ mode: 'EARTH', cameraHeightM: 1_000_000 }), false);
  assert.equal(oceanSurfaceVisible({ mode: 'TRENCH' }), false);
  assert.equal(oceanSurfaceVisible({ mode: 'UNDERWATER' }), false);
});
