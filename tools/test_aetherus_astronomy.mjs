#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importBrowserModule(relativePath) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function importAstronomy() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-astronomy-'));
  const coordinates = await readFile(path.join(ROOT, 'prototype/js/space/coordinates.js'), 'utf8');
  const kepler = (await readFile(path.join(ROOT, 'prototype/js/space/kepler.js'), 'utf8'))
    .replace("'./coordinates.js'", "'./coordinates.mjs'");
  const astronomy = (await readFile(path.join(ROOT, 'prototype/js/space/astronomy.js'), 'utf8'))
    .replace("'./kepler.js'", "'./kepler.mjs'")
    .replace("'./coordinates.js'", "'./coordinates.mjs'");
  await writeFile(path.join(directory, 'coordinates.mjs'), coordinates);
  await writeFile(path.join(directory, 'kepler.mjs'), kepler);
  await writeFile(path.join(directory, 'astronomy.mjs'), astronomy);
  return import(pathToFileURL(path.join(directory, 'astronomy.mjs')).href);
}

const fixture = JSON.parse(await readFile(
  path.join(ROOT, 'tools/fixtures/aetherus-mars-horizons.json'),
  'utf8',
));
const astronomy = await importAstronomy();
const routes = await importBrowserModule('prototype/js/space/route-state.js');
const angularError = (actual, expected) => Math.abs((((actual - expected) + 540) % 360) - 180);

for (const row of fixture.rows) {
  const result = astronomy.calculateMarsObservation({
    observer: fixture.observer,
    at: row.utc,
  });
  const coordinates = result.coordinates;
  const gate = result.precision.comparisonGateDeg;
  assert.ok(angularError(coordinates.raDeg, row.raDegJ2000) < gate, `RA gate: ${row.utc}`);
  assert.ok(Math.abs(coordinates.decDeg - row.decDegJ2000) < gate, `Dec gate: ${row.utc}`);
  assert.ok(angularError(coordinates.horizontal.azimuthDeg, row.azimuthDegAirless) < gate, `Az gate: ${row.utc}`);
  assert.ok(Math.abs(coordinates.horizontal.altitudeDeg - row.altitudeDegAirless) < gate, `Alt gate: ${row.utc}`);
  assert.ok(Math.abs(coordinates.distanceAu - row.distanceAu) < 0.01, `range gate: ${row.utc}`);
  assert.equal(result.horizon, row.horizon);
  assert.equal(result.provenance.kind, 'calculated');
  assert.equal(result.provenance.sampleCount, null);
  assert.equal(result.precision.tier, 'explorer');
  assert.match(coordinates.equatorialOfDate.frame, /equinox-of-date/);
}

assert.throws(
  () => astronomy.calculateMarsObservation({ observer: { lat: 91, lon: 0 }, at: fixture.rows[0].utc }),
  /OBSERVER_LAT_OUT_OF_RANGE/,
);
assert.throws(
  () => astronomy.calculateMarsObservation({ observer: fixture.observer, at: '2051-01-01T00:00:00Z' }),
  /UTC_OUTSIDE_JPL_TABLE_1/,
);
assert.throws(
  () => astronomy.calculateMarsObservation({ observer: fixture.observer, at: fixture.rows[0].utc, precision: 'scientific' }),
  /PRECISION_TIER_UNAVAILABLE/,
);

const encoded = routes.encodeAetherusRoute({
  stage: 'solar',
  target: 'mars',
  observer: { lat: 37.456789, lon: 126.705234, source: 'device', accuracyM: 12 },
  at: fixture.rows[0].utc,
  precision: 'explorer',
}, 'https://earthus.net/?lang=ko#dev');
assert.equal(encoded.searchParams.get('aetherus'), '4');
assert.equal(encoded.searchParams.get('observer'), '37.46,126.71');
assert.equal(encoded.searchParams.get('at'), fixture.rows[0].utc);
assert.equal(encoded.searchParams.get('precision'), 'explorer');
assert.ok(!encoded.href.includes('accuracy'));

const decoded = routes.decodeAetherusRoute(encoded);
assert.equal(decoded.version, 4);
assert.deepEqual(decoded.observer, { id: null, source: 'shared', lat: 37.46, lon: 126.71 });
assert.equal(decoded.at, fixture.rows[0].utc);
assert.equal(decoded.precision, 'explorer');

const legacy = routes.decodeAetherusRoute('?aetherus=1&solar=1&target=mars');
assert.equal(legacy.version, 1);
assert.equal(legacy.target, 'mars');
assert.equal(legacy.observer, null);

const orphan = routes.decodeAetherusRoute('?aetherus=2&solar=1&observer=37.46,126.71&precision=explorer');
assert.ok(orphan.issues.includes('ORPHAN_ASTRONOMY_STATE'));
assert.equal(orphan.observer, null);

const invalidObserver = routes.decodeAetherusRoute('?aetherus=2&solar=1&target=mars&observer=91,0');
assert.ok(invalidObserver.issues.includes('INVALID_OBSERVER'));
assert.equal(invalidObserver.observer, null);

const jupiter = astronomy.calculateMajorBodyObservation({
  target: 'jupiter', observer: fixture.observer, at: fixture.rows[0].utc,
});
assert.equal(jupiter.target, 'jupiter');
assert.ok(Number.isFinite(jupiter.coordinates.raDeg));
assert.ok(Number.isFinite(jupiter.coordinates.horizontal.azimuthDeg));

const jupiterRoute = routes.decodeAetherusRoute(
  `?aetherus=4&solar=1&target=jupiter&observer=37.46,126.71&at=${encodeURIComponent(fixture.rows[0].utc)}&precision=explorer`,
);
assert.equal(jupiterRoute.target, 'jupiter');
assert.equal(jupiterRoute.observer.source, 'shared');
assert.equal(jupiterRoute.issues.length, 0);

const unsupported = routes.decodeAetherusRoute('?aetherus=5&solar=1');
assert.deepEqual([...unsupported.issues], ['UNSUPPORTED_VERSION']);

console.log(`PASS: ${fixture.rows.length} JPL Mars fixtures, generic Jupiter My Sky, 3 engine failures, and 6 astronomy route/privacy cases`);
