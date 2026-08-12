#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = relative => readFile(path.join(ROOT, relative), 'utf8').then(JSON.parse);
const clone = value => JSON.parse(JSON.stringify(value));

async function importMissionModule() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-mission-replay-'));
  for (const filename of ['contracts.js', 'mission-replay.js']) {
    const source = await readFile(path.join(ROOT, 'prototype/js/space', filename), 'utf8');
    await writeFile(path.join(directory, filename.replace('.js', '.mjs')),
      source.replace("'./contracts.js'", "'./contracts.mjs'"));
  }
  return import(pathToFileURL(path.join(directory, 'mission-replay.mjs')).href);
}

const mission = await importMissionModule();
const artifact = await json('prototype/data/missions/jwst-mission-media-replay-v1.json');
const photos = await json('prototype/data/space-photos.json');

assert.equal(mission.assertMissionMediaReplayArtifact(artifact), artifact);
assert.equal(mission.assertMissionMediaReferences(artifact, photos), artifact);
const catalog = mission.createMissionMediaReplayCatalog(artifact, { spacePhotoCatalog: photos });
assert.equal(catalog.mission.id, 'jwst');
assert.equal(catalog.cueEvents.length, 3);
assert.equal(catalog.mediaAssets.length, 2);
assert.deepEqual(catalog.mediaAssets[0].spectralCoverage, ['near-infrared', 'mid-infrared']);
assert.equal(catalog.mediaAssets[0].displayMapping, 'PUBLISHED_FALSE_COLOR_COMPOSITE');
assert.equal(catalog.mediaAssets[0].pixelAlignment, 'NOT_VERIFIED');

const mismatchedCredit = clone(artifact);
mismatchedCredit.mediaAssets[0].rights.credit = 'invented credit';
assert.throws(() => mission.assertMissionMediaReferences(mismatchedCredit, photos), error => error.code === 'RIGHTS_METADATA_MISMATCH');
const missingReference = clone(artifact);
missingReference.mediaAssets[0].catalogAssetRef = 'missing-photo';
assert.throws(() => mission.assertMissionMediaReferences(missingReference, photos), error => error.code === 'MISSING_CATALOG_ASSET');
const deniedAsset = clone(artifact);
deniedAsset.mediaAssets[0].rights.display = 'DENIED';
const deniedCatalog = mission.createMissionMediaReplayCatalog(deniedAsset, { spacePhotoCatalog: photos });
assert.equal(mission.evaluateMissionAssetRights(deniedCatalog, deniedCatalog.mediaAssets[0].id).allowed, false);

const beforeOperations = mission.resolveMissionStatus(catalog, '2022-01-01T00:00:00.000Z');
assert.equal(beforeOperations.status, 'UNKNOWN');
const operating = mission.resolveMissionStatus(catalog, '2022-07-12T00:00:00.000Z');
assert.equal(operating.status, 'OPERATING');
assert.equal(operating.authority, 'OFFICIAL');

const correctionFixture = clone(artifact);
correctionFixture.mission.statusAssertions.push({
  id: 'jwst-curated-conflict', status: 'ENDED', authority: 'CURATED',
  validFromUtc: '2022-07-13T00:00:00.000Z', assertedAtUtc: '2026-08-12T00:00:00.000Z',
  source: 'fixture only', sourceUrl: 'https://example.test/curated',
});
const correctionCatalog = mission.createMissionMediaReplayCatalog(correctionFixture);
assert.equal(mission.resolveMissionStatus(correctionCatalog, '2022-07-14T00:00:00.000Z').status, 'OPERATING');

let session = mission.createMissionReplaySession(catalog, {
  atUtc: '2021-12-25T12:20:00.000Z',
  selectedAssetId: 'webb-pillars-nircam-miri-composite',
});
assert.equal(session.state, 'LOADING');
session = mission.reduceMissionReplay(catalog, session, { type: 'LOADED' });
assert.equal(session.state, 'PAUSED');
const paused = mission.reduceMissionReplay(catalog, session, { type: 'TICK', elapsedMs: 1000 });
assert.equal(paused.atUtc, session.atUtc);
session = mission.reduceMissionReplay(catalog, session, { type: 'PLAY' });
assert.equal(session.state, 'PLAYING');
session = mission.reduceMissionReplay(catalog, session, { type: 'TICK', elapsedMs: 1000 });
assert.equal(session.state, 'DEGRADED');
assert.equal(session.scene.availability, 'DATA_GAP');
assert.equal(session.scene.scene, null);
assert.equal(session.scene.gap.reason, 'MILESTONE_ONLY_NO_INTERPOLATION');
const seeked = mission.reduceMissionReplay(catalog, session, { type: 'SEEK', atUtc: '2022-07-12T00:00:00.000Z' });
assert.equal(seeked.state, 'SEEKING');
assert.equal(seeked.scene.availability, 'MILESTONE');
assert.equal(seeked.scene.scene.eventId, 'jwst-first-images');
assert.throws(() => mission.reduceMissionReplay(catalog, seeked, { type: 'SEEK', atUtc: '2019-01-01T00:00:00.000Z' }),
  error => error.code === 'SEEK_OUT_OF_RANGE');

const link = mission.encodeMissionReplayLink(catalog, {
  atUtc: '2022-11-30T00:00:00.000Z', assetId: 'webb-pillars-nircam-miri-composite',
}, 'https://earthus.net/?lang=ko&earthRead=1#mission');
assert.equal(link.searchParams.get('lang'), 'ko');
assert.equal(link.searchParams.get('aetherusMission'), '1');
assert.equal(link.searchParams.get('mission'), 'jwst');
assert.equal(link.hash, '#mission');
const restored = mission.restoreMissionReplayLink(catalog, link);
assert.equal(restored.status, 'RESTORED');
assert.equal(restored.session.atUtc, '2022-11-30T00:00:00.000Z');
assert.equal(restored.session.selectedAssetId, 'webb-pillars-nircam-miri-composite');
const unavailableRevision = mission.restoreMissionReplayLink(catalog,
  'https://earthus.net/?aetherusMission=1&mission=jwst&missionRevision=2&replayAt=2022-11-30T00:00:00.000Z');
assert.deepEqual({ status: unavailableRevision.status, reason: unavailableRevision.reason },
  { status: 'BLOCKED', reason: 'REVISION_NOT_AVAILABLE' });
const blockedAsset = mission.restoreMissionReplayLink(catalog,
  'https://earthus.net/?aetherusMission=1&mission=jwst&missionRevision=1&replayAt=2022-11-30T00:00:00.000Z&replayAsset=missing');
assert.deepEqual({ status: blockedAsset.status, reason: blockedAsset.reason },
  { status: 'BLOCKED', reason: 'ASSET_NOT_RESTORABLE' });

const source = await readFile(path.join(ROOT, 'prototype/js/space/mission-replay.js'), 'utf8');
assert.doesNotMatch(source, /\bfetch\s*\(/, 'static replay module must not call provider APIs');
assert.doesNotMatch(source, /setInterval|requestAnimationFrame|setTimeout/, 'replay must not own an animation loop');
console.log('PASS: mission media rights, source parity, timeline precedence, deterministic milestone replay, gaps, and deep-link restoration');
