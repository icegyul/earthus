#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [marinePath, kmaPath, ndbcPath] = process.argv.slice(2);
if (!marinePath || !kmaPath || !ndbcPath) {
  throw new Error('usage: verify_ocean_core_live.mjs marine.json kma-buoy.json buoys.json');
}

const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-ocean-live-'));
const contractSource = await readFile(path.join(ROOT, 'prototype/js/ocean/observation-contract.js'), 'utf8');
await writeFile(path.join(directory, 'observation-contract.mjs'), contractSource);
const contract = await import(pathToFileURL(path.join(directory, 'observation-contract.mjs')).href);
const [marine, kma, ndbc] = await Promise.all([
  readFile(marinePath, 'utf8').then(JSON.parse),
  readFile(kmaPath, 'utf8').then(JSON.parse),
  readFile(ndbcPath, 'utf8').then(JSON.parse),
]);

const manifest = contract.validateOceanProviderManifest(JSON.parse(await readFile(
  path.join(ROOT, 'prototype/data/ocean/provider-manifest.v1.json'), 'utf8')));
assert.equal(manifest.entries.every(entry => entry.rightsStatus === 'DRAFT'), true);
assert.equal(manifest.entries.some(entry => contract.providerOperationAllowed(entry, 'DISPLAY')), false);

const replayPolicy = Object.freeze({
  freshForMinutes: 30, staleAfterMinutes: 90, futureToleranceMinutes: 5,
  verificationOnly: true,
});
const replayNow = Date.parse(marine.time) + 10 * 60_000;
let marineObservations = 0, marineMissing = 0, marineRejected = 0;
for (let index = 0; index < Number(marine.nx) * Number(marine.ny); index += 1) {
  const result = contract.normalizeMarineGridCell(marine, {
    index, nowMs: replayNow, freshnessPolicy: replayPolicy,
  });
  marineObservations += result.observations.length;
  marineMissing += result.missingMetrics.length;
  marineRejected += result.rejected.length;
}
assert.ok(marineObservations > 0);
assert.equal(marineRejected, 0);

const kmaNow = Date.parse(kma.generated) + 5 * 60_000;
let kmaObservations = 0, kmaRejected = 0, kmaOutlierRaw = 0;
for (const station of kma.stations || []) {
  const result = contract.normalizeKmaMarineStation(kma, station, {
    nowMs: kmaNow, freshnessPolicy: replayPolicy,
  });
  kmaObservations += result.observations.length;
  kmaRejected += result.rejected.length;
  kmaOutlierRaw += result.rejected.filter(item => item.sourceField === 'whRaw').length;
}
assert.equal((kma.stations || []).length, Number(kma.count));
assert.ok(kmaObservations > 0);

const ndbcNow = Date.parse(ndbc.generated) + 5 * 60_000;
let ndbcObservations = 0, ndbcRejected = 0;
for (const buoy of ndbc.buoys || []) {
  const result = contract.normalizeNdbcBuoy(ndbc, buoy, {
    nowMs: ndbcNow, freshnessPolicy: replayPolicy,
  });
  ndbcObservations += result.observations.length;
  ndbcRejected += result.rejected.length;
}
assert.equal((ndbc.buoys || []).length, Number(ndbc.count));
assert.ok(ndbcObservations > 0);

const summary = {
  schema: 'earthus.ocean-core-live-replay.v1',
  sourceTimes: { marine: marine.time, kma: kma.generated, ndbc: ndbc.generated },
  marine: {
    cells: Number(marine.nx) * Number(marine.ny), sourceSea: marine.sea,
    observations: marineObservations, missing: marineMissing, rejected: marineRejected,
  },
  kma: {
    stations: kma.count, sourceWithWave: kma.withWave,
    observations: kmaObservations, rejected: kmaRejected, outlierRaw: kmaOutlierRaw,
  },
  ndbc: {
    buoys: ndbc.count, observations: ndbcObservations, rejected: ndbcRejected,
  },
  publicDisplayAllowed: false,
  rightsStatus: 'DRAFT',
};
console.log(JSON.stringify(summary, null, 2));
