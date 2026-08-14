#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-aetherus-launch-payload-'));
const source = await readFile(path.join(root, 'prototype/js/space/launch-payload-contract.js'), 'utf8');
const modulePath = path.join(directory, 'launch-payload-contract.mjs');
await writeFile(modulePath, source);
const launch = await import(pathToFileURL(modulePath).href);
const statusEvidence = (state, at) => ({ authority: 'OFFICIAL', sourceId: 'fixture-launch-provider',
  providerObjectId: `fixture-${state.toLowerCase()}`, sourceUrl: 'https://example.test/launch/status',
  assertedAt: at, observedAt: at });
const base = launch.normalizeLaunchEvent({ id: 'launch-fixture-1', providerObjectId: 'provider-launch-1',
  status: 'SCHEDULED', statusEvidence: statusEvidence('SCHEDULED', '2026-08-14T10:00:00Z'),
  site: { id: 'site-fixture-1', name: 'Fixture Launch Site', coordinates: { lat: 34, lon: 127 },
    source: statusEvidence('SITE', '2026-08-14T09:00:00Z') },
  rocket: { id: 'rocket-fixture-1', family: 'Fixture Rocket', vehicleVersion: 'Fixture Block 1',
    versionSource: statusEvidence('ROCKET', '2026-08-14T09:00:00Z') },
  mission: { id: 'mission-fixture-1', name: 'Fixture Mission', description: 'Synthetic test mission.' },
  window: { opensAt: '2026-08-15T10:00:00Z', closesAt: '2026-08-15T10:30:00Z', precision: 'WINDOW' },
  broadcast: { officialUrl: 'https://example.test/official/live', delivery: 'EMBED',
    verifiedAt: '2026-08-14T09:00:00Z' },
  createdAt: '2026-08-14T09:00:00Z', updatedAt: '2026-08-14T10:00:00Z' });
assert.equal(base.broadcast.storedByEarthus, false);
assert.equal(launch.buildLaunchCountdown(base, Date.parse('2026-08-15T09:00:00Z')).remainingSeconds, 3600);
assert.throws(() => launch.transitionLaunch(base, { to: 'SUCCESS', at: '2026-08-15T10:00:00Z',
  statusEvidence: statusEvidence('SUCCESS', '2026-08-15T10:00:00Z') }),
error => error.code === 'LAUNCH_TRANSITION_REJECTED');

let event = base;
const stateTimes = [
  ['LIVE', '2026-08-15T10:00:00Z'], ['ASCENT', '2026-08-15T10:01:00Z'],
  ['ORBIT_INSERTION', '2026-08-15T10:08:00Z'],
  ['PAYLOAD_DEPLOYMENT', '2026-08-15T10:12:00Z'], ['SUCCESS', '2026-08-15T10:20:00Z'],
];
for (const [state, at] of stateTimes) event = launch.transitionLaunch(event,
  { to: state, at, statusEvidence: statusEvidence(state, at) });
assert.equal(event.status, 'SUCCESS');
assert.deepEqual(event.history.map(item => item.to),
  ['SCHEDULED', 'LIVE', 'ASCENT', 'ORBIT_INSERTION', 'PAYLOAD_DEPLOYMENT', 'SUCCESS']);

let scrubbed = launch.transitionLaunch(base, { to: 'SCRUBBED', at: '2026-08-15T09:30:00Z',
  statusEvidence: statusEvidence('SCRUBBED', '2026-08-15T09:30:00Z') });
scrubbed = launch.linkReplacementLaunch(scrubbed, { replacementLaunchEventId: 'launch-fixture-2',
  evidence: statusEvidence('REPLACEMENT', '2026-08-15T09:31:00Z') });
assert.equal(scrubbed.replacementLaunchEventId, 'launch-fixture-2');

const trajectory = launch.normalizeLaunchTrajectory({ launchEventId: base.id, kind: 'LIVE_TELEMETRY',
  sourceEvidence: statusEvidence('TRAJECTORY', '2026-08-15T10:04:00Z'), freshness: { usable: true },
  points: [
    { at: '2026-08-15T10:00:00Z', lat: 34, lon: 127, altitudeKm: 0, confirmed: true },
    { at: '2026-08-15T10:02:00Z', lat: 35, lon: 128, altitudeKm: 50, confirmed: true },
    { at: '2026-08-15T10:04:00Z', lat: 36, lon: 129, altitudeKm: 100, confirmed: false },
  ] });
assert.equal(trajectory.liveClaimAllowed, true);
const stopped = launch.stopTrajectoryOnFailure(trajectory, { failedAt: '2026-08-15T10:03:00Z' });
assert.equal(stopped.kind, 'LAST_CONFIRMED');
assert.equal(stopped.liveClaimAllowed, false);
assert.equal(stopped.points.length, 2);
assert.equal(stopped.points.at(-1).at, '2026-08-15T10:02:00.000Z');
assert.throws(() => launch.normalizeLaunchTrajectory({ ...trajectory, kind: 'LIVE_TELEMETRY',
  freshness: { usable: false } }), error => error.code === 'LAUNCH_LIVE_TELEMETRY_NOT_VERIFIED');

const payloadEvidence = (state, at) => ({ authority: 'OFFICIAL', sourceId: 'fixture-payload-provider',
  providerObjectId: `payload-${state.toLowerCase()}`, sourceUrl: 'https://example.test/payload/status',
  assertedAt: at, observedAt: at });
const manifest = launch.normalizePayloadManifest({ schema: launch.PAYLOAD_MANIFEST_SCHEMA,
  launchEventId: base.id, missionId: 'mission-fixture-1', revision: 1,
  updatedAt: '2026-08-14T10:00:00Z', payloads: [
    { id: 'payload-primary-1', missionId: 'mission-fixture-1', name: 'Fixture Primary', role: 'PRIMARY',
      status: 'MANIFESTED', massKg: 500, statusEvidence: payloadEvidence('MANIFESTED', '2026-08-14T10:00:00Z') },
    { id: 'payload-cubesat-1', missionId: 'mission-fixture-1', name: 'Fixture CubeSat', role: 'CUBESAT',
      status: 'MANIFESTED', massKg: 10, statusEvidence: payloadEvidence('MANIFESTED', '2026-08-14T10:00:00Z') },
    { id: 'payload-rideshare-1', missionId: 'mission-fixture-1', name: 'Fixture Rideshare', role: 'RIDESHARE',
      status: 'MANIFESTED', massKg: 20, statusEvidence: payloadEvidence('MANIFESTED', '2026-08-14T10:00:00Z') },
  ] });
assert.equal(manifest.payloads.length, 3);
assert.equal(manifest.payloads.filter(item => item.role === 'PRIMARY').length, 1);
let payload = manifest.payloads[1];
const payloadStates = [
  ['SEPARATION_PENDING', '2026-08-15T10:10:00Z'], ['DEPLOYED', '2026-08-15T10:12:00Z'],
  ['FIRST_CONTACT_PENDING', '2026-08-15T10:13:00Z'],
  ['FIRST_CONTACT_SUCCESS', '2026-08-15T10:30:00Z'], ['OPERATIONAL', '2026-08-16T10:00:00Z'],
];
for (const [state, at] of payloadStates) payload = launch.transitionPayload(payload,
  { to: state, at, statusEvidence: payloadEvidence(state, at) });
assert.equal(payload.status, 'OPERATIONAL');
const matched = launch.matchPayloadToSatellite(payload, { satelliteObjectId: 'satellite-fixture-1',
  noradId: '12345', internationalDesignator: '2026-001ABC',
  matchEvidence: payloadEvidence('MATCH', '2026-08-16T12:00:00Z') });
assert.equal(matched.satelliteMatch.matchedByInference, false);
assert.equal(matched.satelliteMatch.noradId, '12345');
assert.throws(() => launch.matchPayloadToSatellite(payload, { satelliteObjectId: 'satellite-fixture-2',
  noradId: 'guess', internationalDesignator: '2026-001A',
  matchEvidence: payloadEvidence('MATCH', '2026-08-16T12:00:00Z') }),
error => error.code === 'PAYLOAD_NORAD_ID_INVALID');

let failedEvent = launch.transitionLaunch(base, { to: 'LIVE', at: '2026-08-15T10:00:00Z',
  statusEvidence: statusEvidence('LIVE', '2026-08-15T10:00:00Z') });
failedEvent = launch.transitionLaunch(failedEvent, { to: 'FAILED', at: '2026-08-15T10:03:00Z',
  statusEvidence: statusEvidence('FAILED', '2026-08-15T10:03:00Z') });
const replay = launch.buildLaunchReplay(failedEvent, [trajectory]);
assert.equal(replay.mode, 'MILESTONE_ONLY');
assert.equal(replay.interpolation, 'NONE');
assert.equal(replay.trajectories[0].kind, 'LAST_CONFIRMED');
assert.equal(replay.notificationDispatchAllowed, false);
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Aetherus Launch 10 states, failure stop, Payload 8 states, 1:N manifest and official NORAD match');
