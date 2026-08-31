import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHYSICAL_ATMOSPHERE_PROFILE,
  cityLightPresentation,
  cloudShadowPresentation,
  solarIncidenceAt,
} from '../../prototype/v2/js/physical-atmosphere-light.js';

test('G4 atmosphere is an explicit Earth profile instead of a Cesium-default completion claim', () => {
  assert.equal(PHYSICAL_ATMOSPHERE_PROFILE.truthClass, 'EXPLICIT_EARTH_RAYLEIGH_MIE_PRESENTATION');
  assert.deepEqual(PHYSICAL_ATMOSPHERE_PROFILE.rayleighCoefficient, [5.2e-6, 12.1e-6, 27.5e-6]);
  assert.equal(PHYSICAL_ATMOSPHERE_PROFILE.rayleighScaleHeightM, 8_000);
  assert.deepEqual(PHYSICAL_ATMOSPHERE_PROFILE.mieCoefficient, [20e-6, 20e-6, 20e-6]);
  assert.equal(PHYSICAL_ATMOSPHERE_PROFILE.mieScaleHeightM, 1_200);
  assert.equal(PHYSICAL_ATMOSPHERE_PROFILE.mieAnisotropy, 0.82);
  assert.equal(PHYSICAL_ATMOSPHERE_PROFILE.perFragmentAtmosphere, true);
  assert.ok(PHYSICAL_ATMOSPHERE_PROFILE.lightingFadeOutDistanceM
    < PHYSICAL_ATMOSPHERE_PROFILE.lightingFadeInDistanceM);
});

test('solar incidence classifies day, terminator and night from a normalized fixed-frame sun vector', () => {
  assert.deepEqual(
    solarIncidenceAt({ longitudeDeg: 0, latitudeDeg: 0, sunDirection: [1, 0, 0] }),
    { cosine: 1, phase: 'DAY' },
  );
  assert.deepEqual(
    solarIncidenceAt({ longitudeDeg: 90, latitudeDeg: 0, sunDirection: [1, 0, 0] }),
    { cosine: 0, phase: 'TERMINATOR' },
  );
  assert.deepEqual(
    solarIncidenceAt({ longitudeDeg: 180, latitudeDeg: 0, sunDirection: [1, 0, 0] }),
    { cosine: -1, phase: 'NIGHT' },
  );
  assert.throws(
    () => solarIncidenceAt({ longitudeDeg: 0, latitudeDeg: 0, sunDirection: [0, 0, 0] }),
    /SUN_DIRECTION_NONZERO_REQUIRED/,
  );
});

test('VIIRS city light presentation is restrained, night-only and surface-mode-only', () => {
  assert.deepEqual(cityLightPresentation({ mode: 'EARTH' }), {
    show: true,
    dayAlpha: 0,
    nightAlpha: 0.26,
    brightness: 0.82,
    contrast: 1.05,
    saturation: 0.58,
  });
  assert.equal(cityLightPresentation({ mode: 'TRENCH' }).show, false);
  assert.equal(cityLightPresentation({ mode: 'UNDERWATER' }).show, false);
});

test('cloud shadow is enabled only for a valid observed cloud timestamp', () => {
  const valid = cloudShadowPresentation({
    mode: 'EARTH',
    cloudFidelity: 'LAYERED',
    cloudMeta: {
      time: '2026-08-31T00:00:00Z',
      source: 'NOAA_NESDIS_GMGSI',
      truthClass: 'OBSERVED_2D_INPUT_ONLY',
    },
  });
  assert.deepEqual(valid, {
    status: 'VALID_OBSERVED_ONLY',
    enabled: true,
    source: 'NOAA_NESDIS_GMGSI',
    validAt: '2026-08-31T00:00:00Z',
  });
  assert.equal(cloudShadowPresentation({ mode: 'EARTH', cloudFidelity: 'OFF' }).enabled, false);
  assert.equal(cloudShadowPresentation({ mode: 'TRENCH', cloudFidelity: 'LAYERED', cloudMeta: valid }).enabled, false);
  assert.equal(cloudShadowPresentation({ mode: 'EARTH', cloudFidelity: 'LAYERED' }).status,
    'UNAVAILABLE_NO_VALID_OBSERVATION');
});
