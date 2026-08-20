// Pure regression checks for the Aetherus coordinate/ephemeris core.
// Run: node --experimental-default-type=module tools/test_aetherus_coordinate_core.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  coordinateSelfTest,
  toAetherusRender,
} from '../prototype/js/space/coordinates.js';
import {
  galactocentricHeightTiltRad,
  galactocentricSelfTest,
  solarVelocityGalacticKms,
} from '../prototype/js/space/galactocentric.js';
import {
  createMajorEphemerisService,
  ephemerisProviderSelfTest,
  HORIZONS_PROVIDER_ID,
} from '../prototype/js/space/ephemeris-provider.js';
import {
  calculateMarsObservationFromGeocentricIcrf,
  DEFAULT_ASTRONOMY_OBSERVER,
} from '../prototype/js/space/astronomy.js';
import {
  buildSolarMotionModel,
  solarMotionSelfTest,
} from '../prototype/js/space/solar-motion-engine.js';
import { assertAetherusCatalog } from '../prototype/js/space/contracts.js';
import { parseHorizonsVectorResult } from '../aws/aetherus-ephemeris/horizons-parser.mjs';

function close(actual, expected, tolerance = 1e-10, label = 'value') {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} != ${expected} within ${tolerance}`);
}

function vectorRows(startMs, position, velocity) {
  const stepDays = .25;
  const end = position.map((value, index) => value + velocity[index] * stepDays);
  return [
    [startMs, ...position, ...velocity],
    [startMs + 6 * 60 * 60 * 1000, ...end, ...velocity],
  ];
}

function fakeHorizonsCatalog() {
  const start = Date.parse('2026-08-20T00:00:00.000Z');
  const definitions = {
    sun:     { command: '10',  p: [0.005, 0, 0],       v: [0, .001, 0] },
    mercury: { command: '199', p: [.39, .01, 0],       v: [0, .03, 0] },
    venus:   { command: '299', p: [.72, .02, .01],     v: [0, .024, 0] },
    earth:   { command: '399', p: [1.005, 0, 0],       v: [0, .018, 0] },
    mars:    { command: '499', p: [1.505, .2, .1],     v: [0, .012, 0] },
    jupiter: { command: '599', p: [5.2, .4, -.1],      v: [0, .007, 0] },
    saturn:  { command: '699', p: [9.5, -.4, .1],      v: [0, .005, 0] },
    uranus:  { command: '799', p: [19.2, .2, -.05],    v: [0, .003, 0] },
    neptune: { command: '899', p: [30.1, -.1, .03],    v: [0, .002, 0] },
  };
  return {
    schema: 'earthus.aetherus-ephemeris.v1',
    schemaVersion: 1,
    generatedAt: '2026-08-20T00:10:00.000Z',
    frame: {
      origin: 'solar-system-barycenter',
      orientation: 'icrf-j2000',
      positionUnit: 'AU',
      velocityUnit: 'AU/day',
      vectorCorrection: 'NONE',
      timeType: 'UT',
    },
    coverage: {
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + 6 * 60 * 60 * 1000).toISOString(),
      stepHours: 6,
      sampleCountPerBody: 2,
    },
    source: { name: 'Synthetic Horizons contract fixture' },
    bodies: Object.fromEntries(Object.entries(definitions).map(([id, value]) => [id, {
      command: value.command,
      samples: vectorRows(start, value.p, value.v),
    }])),
  };
}

async function main() {
  assert.deepEqual(toAetherusRender({ x: 1, y: 2, z: 3 }), { x: 1, y: 3, z: -2 });
  assert.equal(coordinateSelfTest().ok, true, 'canonical coordinate round trips');
  assert.equal(galactocentricSelfTest().ok, true, 'Galactocentric linear bridge');
  assert.ok(galactocentricHeightTiltRad() > 0 && galactocentricHeightTiltRad() < .01,
    'Astropy solar-height tilt must be small and explicit');
  const alignedVelocity = solarVelocityGalacticKms();
  close(Math.hypot(alignedVelocity.x, alignedVelocity.y, alignedVelocity.z),
    Math.hypot(12.9, 245.6, 7.78), 1e-12, 'velocity rotation preserves magnitude');
  assert.equal(ephemerisProviderSelfTest().ok, true, 'Hermite ephemeris interpolation');
  assert.equal(solarMotionSelfTest().ok, true, 'fallback solar motion');

  const fixture = fakeHorizonsCatalog();
  const service = createMajorEphemerisService({
    url: 'fixture://horizons',
    fetchFn: async () => ({ ok: true, json: async () => fixture }),
  });
  await service.preload();
  assert.equal(service.providerId, HORIZONS_PROVIDER_ID);

  const middleAt = '2026-08-20T03:00:00.000Z';
  const marsGeo = service.geocentricIcrfState('mars', middleAt);
  assert.equal(marsGeo.provider, HORIZONS_PROVIDER_ID);
  close(marsGeo.position.x, .5, 1e-12, 'Mars-Earth x');
  close(marsGeo.position.z, .1, 1e-12, 'Mars-Earth z');

  const observation = calculateMarsObservationFromGeocentricIcrf({
    observer: DEFAULT_ASTRONOMY_OBSERVER,
    at: middleAt,
    geocentricIcrfAu: marsGeo.position,
    provider: marsGeo,
  });
  assert.equal(observation.precision.providerTier, 'jpl-horizons-geometric-vectors');
  assert.ok(Number.isFinite(observation.coordinates.raDeg));
  assert.ok(Number.isFinite(observation.coordinates.horizontal.altitudeDeg));

  const preciseMotion = buildSolarMotionModel({
    endAt: '2026-08-20T06:00:00.000Z',
    spanDays: .25,
    samples: 3,
    halfTravelSceneUnits: 1,
    ephemerisProvider: service,
  });
  assert.ok(preciseMotion.ephemerisProviders.includes(HORIZONS_PROVIDER_ID));
  assert.equal(preciseMotion.samples.at(-1).ssbBridge, 'jpl-sun-barycentric-to-ssb');
  assert.ok(preciseMotion.physicalTravelDistanceAu > 0);
  assert.match(preciseMotion.direction.model, /jpl-sun-barycentric-ssb-displacement/);

  const vectorFixture = [
    'JPL/HORIZONS synthetic regression fixture',
    '$$SOE',
    '2461042.500000000, A.D. 2026-Aug-20 00:00:00.0000, 1.000000000000000E+00, 2.000000000000000E+00, 3.000000000000000E+00, 1.000000000000000E-02, 2.000000000000000E-02, 3.000000000000000E-02,',
    '2461042.750000000, A.D. 2026-Aug-20 06:00:00.0000, 1.002500000000000E+00, 2.005000000000000E+00, 3.007500000000000E+00, 1.000000000000000E-02, 2.000000000000000E-02, 3.000000000000000E-02,',
    '$$EOE',
  ].join('\n');
  const parsed = parseHorizonsVectorResult(vectorFixture, 'synthetic');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1][0] - parsed[0][0], 6 * 60 * 60 * 1000);
  close(parsed[0][1], 1, 0, 'parsed X');
  close(parsed[1][6], .03, 0, 'parsed VZ');

  const solarMotionRaw = JSON.parse(await fs.readFile(
    new URL('../prototype/data/solar-motion.json', import.meta.url),
    'utf8',
  ));
  assert.doesNotThrow(() => assertAetherusCatalog('solar-motion', solarMotionRaw));

  console.log(JSON.stringify({
    ok: true,
    checks: [
      'coordinate-roundtrip',
      'right-handed-render-map',
      'galactocentric-bridge',
      'astropy-height-tilt-axis-conversion',
      'hermite-interpolation',
      'horizons-provider-fixture',
      'mars-my-sky-vector-path',
      'ssb-solar-motion-path',
      'horizons-csv-parser',
      'solar-motion-catalog-contract',
    ],
    preciseProvider: service.providerId,
    solarMotionProviders: preciseMotion.ephemerisProviders,
  }, null, 2));
}

await main();
