#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [lightningPath, typhoonPath, coastPath] = process.argv.slice(2);
if (!lightningPath || !typhoonPath || !coastPath) {
  throw new Error('usage: verify_ocean_safety_live.mjs lightning.json typhoon.json coast.json');
}

const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-ocean-safety-live-'));
const contractSource = await readFile(path.join(ROOT,
  'prototype/js/ocean/observation-contract.js'), 'utf8');
const adapterSource = (await readFile(path.join(ROOT,
  'prototype/js/ocean/safety-adapters.js'), 'utf8'))
  .replace("'./observation-contract.js'", "'./observation-contract.mjs'");
await Promise.all([
  writeFile(path.join(directory, 'observation-contract.mjs'), contractSource),
  writeFile(path.join(directory, 'safety-adapters.mjs'), adapterSource),
]);
const contract = await import(pathToFileURL(path.join(directory, 'observation-contract.mjs')).href);
const adapters = await import(pathToFileURL(path.join(directory, 'safety-adapters.mjs')).href);
const [lightning, typhoon, coast] = await Promise.all([
  readFile(lightningPath, 'utf8').then(JSON.parse),
  readFile(typhoonPath, 'utf8').then(JSON.parse),
  readFile(coastPath, 'utf8').then(JSON.parse),
]);

const manifest = contract.validateOceanProviderManifest(JSON.parse(await readFile(
  path.join(ROOT, 'prototype/data/ocean/provider-manifest.v1.json'), 'utf8')));
assert.equal(manifest.entries.every(entry => entry.rightsStatus === 'DRAFT'), true);
assert.equal(manifest.entries.some(entry => contract.providerOperationAllowed(entry, 'DISPLAY')), false);

const replayPolicy = Object.freeze({
  freshForMinutes: 30, staleAfterMinutes: 120, futureToleranceMinutes: 5,
  verificationOnly: true,
});

const validStrikes = (lightning.strikes || []).map(item => ({
  ...item, parsedAt: adapters.parseOceanSafetyLocalTime(item.at),
})).filter(item => item.parsedAt && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
  .sort((a, b) => Date.parse(b.parsedAt) - Date.parse(a.parsedAt));
assert.ok(validStrikes.length > 0, 'live lightning has no parseable strike');
const strike = validStrikes[0];
const lightningNow = Date.parse(lightning.generated) + 60_000;
const lightningEvidence = adapters.adaptOfficialLightning(lightning, {
  lat: strike.lat, lon: strike.lon, radiusKm: 5, nowMs: lightningNow,
  freshnessPolicy: replayPolicy,
  coveragePolicy: {
    status: 'APPROVED', verificationOnly: true,
    areas: [{ sourceId: strike.src, minLat: Number(strike.lat) - 0.5,
      maxLat: Number(strike.lat) + 0.5, minLon: Number(strike.lon) - 0.5,
      maxLon: Number(strike.lon) + 0.5 }],
  },
  maxStrikeAgeMinutes: Number(lightning.windowMinutes) + 5,
});
assert.equal(lightningEvidence.state, 'ACTIVE');
assert.equal(lightningEvidence.matches[0].source, strike.src);

let typhoonTarget = null;
for (const storm of typhoon.storms || []) {
  for (const agency of storm.agencies || []) {
    const current = (agency.steps || []).find(step => Number(step.h) === 0);
    const circular = [...(current?.stormArea || []), ...(current?.galeArea || [])]
      .find(area => area?.dirJp === '全域' && Number(area?.km) > 0);
    if (current && circular) {
      typhoonTarget = { storm, agency, current, circular };
      break;
    }
  }
  if (typhoonTarget) break;
}
assert.ok(typhoonTarget, 'live typhoon has no current all-around official wind area');
const typhoonEvidence = adapters.adaptOfficialTyphoon(typhoon, {
  lat: typhoonTarget.current.lat, lon: typhoonTarget.current.lon,
  nowMs: Date.parse(typhoon.generated) + 60_000, freshnessPolicy: replayPolicy,
});
assert.equal(typhoonEvidence.state, 'ACTIVE');
assert.equal(typhoonEvidence.matches[0].agency, typhoonTarget.agency.agency);

const coastEvidence = adapters.adaptOfficialClosure(coast, {
  spotId: 'LIVE_SCHEMA_REPLAY', lat: 35, lon: 129,
  nowMs: Date.parse(coast.generated) + 60_000, freshnessPolicy: replayPolicy,
});
assert.equal(coastEvidence.state, 'UNKNOWN');
assert.equal(coastEvidence.reason, 'OBSERVATION_IS_NOT_CLOSURE');

console.log(JSON.stringify({
  schema: 'earthus.ocean-safety-live-replay.v1',
  sourceTimes: {
    lightning: lightning.generated, typhoon: typhoon.generated, coast: coast.generated,
  },
  lightning: {
    sourceCount: lightning.count, source: strike.src,
    targetObservedAt: strike.parsedAt, evidenceState: lightningEvidence.state,
    nearbyMatches: lightningEvidence.matches.length,
  },
  typhoon: {
    sourceStorms: typhoon.count, storm: typhoonTarget.storm.name || typhoonTarget.storm.key,
    agency: typhoonTarget.agency.agency, officialRadiusKm: typhoonTarget.circular.km,
    evidenceState: typhoonEvidence.state,
  },
  coast: {
    ripObservations: coast.rip?.count ?? null, tideObservations: coast.tide?.count ?? null,
    evidenceState: coastEvidence.state, reason: coastEvidence.reason,
  },
  publicDisplayAllowed: false,
  rightsStatus: 'DRAFT',
}, null, 2));
