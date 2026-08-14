#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-aetherus-satellite-'));
const source = await readFile(path.join(root, 'prototype/js/space/satellite-object-contract.js'), 'utf8');
const modulePath = path.join(directory, 'satellite-object-contract.mjs');
await writeFile(modulePath, source);
const satelliteContract = await import(pathToFileURL(modulePath).href);
const draftPolicy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/satellite-policy.v1.json'), 'utf8'));
assert.equal(satelliteContract.validateSatellitePolicy(draftPolicy).productionEnabled, false);
const approvedPolicy = { ...draftPolicy, status: 'APPROVED', productionEnabled: true,
  revision: 'fixture-approved-v1', approvedAt: '2026-08-14T09:00:00Z',
  approvedBy: 'fixture-orbit-owner' };
const evidence = (object, at = '2026-08-14T09:00:00Z') => ({ authority: 'OFFICIAL',
  sourceId: 'fixture-satellite-provider', providerObjectId: object,
  sourceUrl: 'https://example.test/satellite/source', assertedAt: at });
const satellite = satelliteContract.normalizeSatelliteObject({ id: 'satellite-fixture-1',
  noradId: '12345', internationalDesignator: '2026-001ABC', name: 'Fixture Weather Science 1',
  aliases: ['Fixture WS-1'], status: 'ACTIVE', statusEvidence: evidence('status-1'),
  orbit: { revision: 'orbit-fixture-r1', epoch: '2026-08-14T08:00:00Z', orbitClass: 'LEO',
    classificationSource: evidence('class-1'), inclinationDeg: 51.6, eccentricity: 0.001,
    periodMinutes: 92.5, tleLine1: '1 FIXTURE LINE ONE', tleLine2: '2 FIXTURE LINE TWO',
    source: evidence('orbit-1') },
  missionTypes: ['SCIENCE', 'WEATHER'], operator: 'Fixture Operator', countryCode: 'KR',
  constellation: 'STARLINK', launchHistory: [{ launchEventId: 'launch-fixture-1',
    launchedAt: '2026-08-01T00:00:00Z', source: evidence('launch-history-1') }] });
assert.equal(satellite.orbit.orbitClass, 'LEO');
assert.equal(satellite.status, 'ACTIVE');
const freshness = satelliteContract.evaluateOrbitFreshness(satellite,
  { policy: approvedPolicy, nowMs: Date.parse('2026-08-14T10:00:00Z') });
assert.equal(freshness.status, 'FRESH');
assert.equal(freshness.liveClaimAllowed, false);
assert.throws(() => satelliteContract.evaluateOrbitFreshness(satellite,
  { policy: draftPolicy, nowMs: Date.parse('2026-08-14T10:00:00Z') }),
error => error.code === 'SATELLITE_FRESHNESS_POLICY_NOT_APPROVED');

const position = satelliteContract.normalizeSatellitePosition({ satelliteId: satellite.id,
  sourceOrbitRevision: satellite.orbit.revision, at: '2026-08-14T10:00:00Z', lat: 35, lon: 129,
  altitudeKm: 550, calculatedAt: '2026-08-14T09:59:59Z', propagatorRevision: 'fixture-sgp4-v1' },
{ satellite, freshness });
assert.equal(position.provenance, 'CALCULATED_FROM_ORBIT_ELEMENTS');
assert.equal(position.liveClaimAllowed, false);
const track = satelliteContract.normalizeGroundTrack({ satelliteId: satellite.id,
  sourceOrbitRevision: satellite.orbit.revision, points: [
    { at: '2026-08-14T10:00:00Z', lat: 35, lon: 129, altitudeKm: 550 },
    { at: '2026-08-14T10:01:00Z', lat: 36, lon: 130, altitudeKm: 551 },
  ] }, { satellite, freshness });
assert.equal(track.interpolation, 'NONE');
assert.equal(track.liveClaimAllowed, false);
const nextPass = satelliteContract.normalizeNextPass({ satelliteId: satellite.id,
  sourceOrbitRevision: satellite.orbit.revision, locationRef: 'private-location-fixture-1',
  startsAt: '2026-08-14T11:00:00Z', peaksAt: '2026-08-14T11:04:00Z',
  endsAt: '2026-08-14T11:09:00Z', maxElevationDeg: 46, visibility: 'OPTICAL_CANDIDATE' },
{ satellite, freshness });
assert.equal(nextPass.observed, false);
assert.equal(nextPass.liveClaimAllowed, false);
assert.equal('lat' in nextPass, false);
assert.equal('lon' in nextPass, false);
assert.deepEqual(satelliteContract.satelliteFilterMembership(satellite),
  { STARLINK: true, KOREA: true, SCIENCE: true, WEATHER: true });
const info = satelliteContract.buildSatelliteInfo(satellite, { position, nextPass });
assert.equal(info.positionIsLive, false);
assert.equal(info.position.sourceOrbitEpoch, '2026-08-14T08:00:00.000Z');
const missing = satelliteContract.buildSatelliteInfo(satellite);
assert.equal(missing.position, null);
assert.equal(missing.missingPositionReason, 'NO_USABLE_CALCULATED_POSITION');
assert.throws(() => satelliteContract.normalizeSatellitePosition({ ...position,
  sourceOrbitRevision: 'wrong-r2' }, { satellite, freshness }),
error => error.code === 'SATELLITE_POSITION_ORBIT_REVISION_MISMATCH');
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Satellite Sheets 91-101 orbit/status/freshness, calculated position/track/pass and explicit filters');
