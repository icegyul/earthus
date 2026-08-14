#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-spotlight-contract-'));
const source = await readFile(path.join(root, 'prototype/js/space/spotlight-contract.js'), 'utf8');
const modulePath = path.join(directory, 'spotlight-contract.mjs');
await writeFile(modulePath, source);
const spotlight = await import(pathToFileURL(modulePath).href);
const policy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/spotlight-policy.v1.json'), 'utf8'));
assert.equal(spotlight.validateSpotlightPolicy(policy).productionEnabled, false);
const evidence = object => ({ authority: 'OFFICIAL', sourceId: 'fixture-spotlight-provider',
  sourceUrl: `https://example.test/spotlight/${object}`, assertedAt: '2026-08-14T00:00:00Z' });
const nuri = spotlight.normalizeSpotlightMission({ id: 'mission-nuri-fixture',
  launchEventId: 'launch-nuri-fixture', hubId: 'korea-space', missionFamily: 'NURI',
  name: 'Fixture Nuri Mission', status: 'SCHEDULED',
  statusEvidence: evidence('nuri-status'), payloadIds: ['payload-fixture-1'],
  satelliteIds: ['satellite-fixture-1'], officialUrl: 'https://example.test/nuri' });
assert.equal(nuri.payloadIds.length, 1);
const falcon = spotlight.normalizeSpotlightMission({ ...nuri, id: 'mission-falcon-fixture',
  launchEventId: 'launch-falcon-fixture', hubId: 'spacex', missionFamily: 'FALCON_9',
  name: 'Fixture Falcon Mission', officialUrl: 'https://example.test/falcon' });
assert.equal(falcon.missionFamily, 'FALCON_9');
const booster = spotlight.normalizeBooster({ id: 'booster-fixture-1', serial: 'B-FIXTURE-1',
  landingStatus: 'LANDED', statusEvidence: evidence('booster-status'), flights: [
    { launchEventId: 'launch-falcon-fixture', flownAt: '2026-08-01T00:00:00Z',
      landingStatus: 'LANDED', evidence: evidence('flight-1') },
    { launchEventId: 'launch-falcon-fixture-2', flownAt: '2026-08-10T00:00:00Z',
      landingStatus: 'EXPENDED', evidence: evidence('flight-2') },
  ] });
assert.equal(booster.flights.length, 2);
const boosterMilestone = spotlight.normalizeMilestone({ id: 'milestone-booster-fixture',
  track: 'STARSHIP_BOOSTER', title: 'Fixture booster milestone',
  occurredAt: '2026-08-10T00:00:00Z', evidence: evidence('booster-milestone') });
const shipMilestone = spotlight.normalizeMilestone({ id: 'milestone-ship-fixture',
  track: 'STARSHIP_SHIP', title: 'Fixture ship milestone',
  scheduledAt: '2026-09-10T00:00:00Z', evidence: evidence('ship-milestone') });
assert.equal(boosterMilestone.observed, true);
assert.equal(shipMilestone.observed, false);
assert.equal(spotlight.resolveSpotlightLocale('ko-KR', 'korea-space', { policy }).selected, 'ko-KR');
assert.equal(spotlight.resolveSpotlightLocale('fr-FR', 'spacex', { policy }).fallbackUsed, true);
const follow = spotlight.normalizeSpotlightFollow({ userRef: 'private-user-fixture',
  targetType: 'BOOSTER', targetId: booster.id, enabled: true, historyVisible: true,
  updatedAt: '2026-08-14T00:00:00Z' });
assert.equal(follow.notificationRequested, false);
const ranked = spotlight.rankSpotlights([{ id: nuri.id, relevanceScore: 8 },
  { id: falcon.id, relevanceScore: 10 }], { editorialOverrides: [{ id: nuri.id, position: 1,
    reason: 'Fixture Korean editorial priority', evidence: evidence('editorial-1') }] });
assert.equal(ranked[0].id, nuri.id);
assert.equal(ranked[0].random, false);
assert.throws(() => spotlight.normalizeMilestone({ id: 'broken-milestone',
  track: 'STARSHIP_SHIP', title: 'Broken', occurredAt: '2026-08-01T00:00:00Z',
  scheduledAt: '2026-08-02T00:00:00Z', evidence: evidence('broken') }),
error => error.code === 'SPOTLIGHT_MILESTONE_TIME_CONFLICT');
assert.doesNotMatch(source, /Math\.random|\bfetch\s*\(|setInterval|requestAnimationFrame/);
console.log('PASS: Spotlight Sheets 102-104,106-107,109-114 national/mission/booster/milestone/editorial contracts');
