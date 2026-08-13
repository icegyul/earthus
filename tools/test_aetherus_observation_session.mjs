#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importFixtureModules() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-session-'));
  const kepler = await readFile(path.join(ROOT, 'prototype/js/space/kepler.js'), 'utf8');
  const astronomy = (await readFile(path.join(ROOT, 'prototype/js/space/astronomy.js'), 'utf8'))
    .replace("'./kepler.js'", "'./kepler.mjs'");
  const planner = (await readFile(path.join(ROOT, 'prototype/js/space/observation-planner.js'), 'utf8'))
    .replace(/'\.\/astronomy\.js(?:\?v=[^']+)?'/, "'./astronomy.mjs'");
  const session = await readFile(path.join(ROOT, 'prototype/js/space/observation-session.js'), 'utf8');
  await Promise.all([
    writeFile(path.join(directory, 'kepler.mjs'), kepler),
    writeFile(path.join(directory, 'astronomy.mjs'), astronomy),
    writeFile(path.join(directory, 'observation-planner.mjs'), planner),
    writeFile(path.join(directory, 'observation-session.mjs'), session),
  ]);
  return {
    planner: await import(pathToFileURL(path.join(directory, 'observation-planner.mjs')).href),
    session: await import(pathToFileURL(path.join(directory, 'observation-session.mjs')).href),
  };
}

const { planner, session } = await importFixtureModules();
const observer = { lat: 37.4563, lon: 126.7052, source: 'device', accuracyM: 8 };
const plan = planner.createMarsGeometryPlan({ observer, startAt: '2026-08-12T00:00:00.000Z' });
const manifest = planner.createOfflinePlanManifest(plan);

let clockSecond = 0;
const now = () => new Date(Date.UTC(2026, 7, 12, 0, 0, clockSecond++));
let id = 0;
const idFactory = () => `fixture-${++id}`;
const repository = session.createMemoryObservationSessionRepository();
const ownerId = await repository.getOrCreateOwnerId(() => 'owner-a');
const service = session.createObservationSessionService({ repository, ownerId, now, idFactory });

// Start → prepared → aligned → pause → resume → completed, one checkpoint per event.
const started = await service.start({ planManifest: manifest, sessionId: 'session-fixture-1' });
assert.equal(started.status, 'APPLIED');
assert.equal(started.checkpoint.state, 'PREPARING');
assert.equal(started.checkpoint.revision, 1);
assert.equal(started.checkpoint.planRevision, plan.revision);
assert.equal(started.checkpoint.sync.status, 'LOCAL_ONLY');
assert.equal(started.checkpoint.sync.upload, 'NOT_IMPLEMENTED');
assert.equal(started.checkpoint.observationSampleCount, null);
assert.ok(!JSON.stringify(started.checkpoint).includes('accuracyM'));

const prepared = await service.dispatch({
  sessionId: started.checkpoint.sessionId,
  type: 'MARK_PREPARED',
  expectedRevision: 1,
  idempotencyKey: 'fixture:prepared',
});
assert.equal(prepared.checkpoint.state, 'ALIGNING');
const aligned = await service.dispatch({
  sessionId: started.checkpoint.sessionId,
  type: 'MARK_ALIGNED',
  expectedRevision: 2,
  idempotencyKey: 'fixture:aligned',
});
assert.equal(aligned.checkpoint.state, 'OBSERVING');
const paused = await service.dispatch({
  sessionId: started.checkpoint.sessionId,
  type: 'PAUSE_SESSION',
  expectedRevision: 3,
  idempotencyKey: 'fixture:paused',
});
assert.equal(paused.checkpoint.state, 'PAUSED');
assert.equal(paused.checkpoint.resumeState, 'OBSERVING');
const resumed = await service.dispatch({
  sessionId: started.checkpoint.sessionId,
  type: 'RESUME_SESSION',
  expectedRevision: 4,
  idempotencyKey: 'fixture:resumed',
});
assert.equal(resumed.checkpoint.state, 'OBSERVING');
const completed = await service.dispatch({
  sessionId: started.checkpoint.sessionId,
  type: 'COMPLETE_SESSION',
  expectedRevision: 5,
  idempotencyKey: 'fixture:completed',
});
assert.equal(completed.checkpoint.state, 'COMPLETED');
assert.equal(completed.checkpoint.revision, 6);
assert.equal(completed.checkpoint.history.length, 6);

// Duplicate command: same idempotency key + same command is a read-only replay.
const duplicateRepository = session.createMemoryObservationSessionRepository();
const duplicateOwner = await duplicateRepository.getOrCreateOwnerId(() => 'owner-duplicate');
const duplicateService = session.createObservationSessionService({
  repository: duplicateRepository, ownerId: duplicateOwner, now, idFactory,
});
const duplicateStarted = await duplicateService.start({
  planManifest: manifest,
  sessionId: 'session-duplicate',
  idempotencyKey: 'duplicate:start',
});
const duplicateStartedAgain = await duplicateService.start({
  planManifest: manifest,
  sessionId: 'session-duplicate',
  idempotencyKey: 'duplicate:start',
});
assert.equal(duplicateStartedAgain.status, 'DUPLICATE');
assert.equal(duplicateStartedAgain.checkpoint.revision, duplicateStarted.checkpoint.revision);
assert.equal(duplicateRepository.rawEvents('session-duplicate').length, 1);
await assert.rejects(() => duplicateService.dispatch({
  sessionId: 'session-duplicate',
  type: 'ABORT_SESSION',
  expectedRevision: 1,
  idempotencyKey: 'duplicate:start',
}), error => error.code === 'SESSION_IDEMPOTENCY_CONFLICT');

// Crash replay: lose only the snapshot, rebuild it from the immutable log before the next command.
repository.simulateCrashAfterEventCommit(started.checkpoint.sessionId);
const recovered = await service.load(started.checkpoint.sessionId);
assert.equal(recovered.recovered, true);
assert.equal(recovered.checkpoint.state, 'COMPLETED');
assert.equal(recovered.checkpoint.checkpointId, completed.checkpoint.checkpointId);

// Storage pressure: failed write never advances revision and never removes the existing original.
const pressureRepository = session.createMemoryObservationSessionRepository();
const pressureOwner = await pressureRepository.getOrCreateOwnerId(() => 'owner-pressure');
const pressureService = session.createObservationSessionService({
  repository: pressureRepository, ownerId: pressureOwner, now, idFactory,
});
const pressureStart = await pressureService.start({ planManifest: manifest, sessionId: 'session-pressure' });
pressureRepository.failNextWrite('quota');
await assert.rejects(() => pressureService.dispatch({
  sessionId: 'session-pressure', type: 'MARK_PREPARED', expectedRevision: 1,
}), error => error.code === 'SESSION_STORAGE_PRESSURE');
const afterPressure = await pressureService.load('session-pressure');
assert.equal(afterPressure.checkpoint.revision, pressureStart.checkpoint.revision);
assert.equal(afterPressure.checkpoint.state, 'PREPARING');
assert.equal(afterPressure.events.length, 1);

// Two stale tabs: compare-and-swap rejects the second write; last-write-wins is impossible.
const tabARevision = pressureStart.checkpoint.revision;
const tabBRevision = pressureStart.checkpoint.revision;
const tabA = await pressureService.dispatch({
  sessionId: 'session-pressure', type: 'MARK_PREPARED', expectedRevision: tabARevision,
  idempotencyKey: 'tab-a:prepared',
});
assert.equal(tabA.checkpoint.revision, 2);
await assert.rejects(() => pressureService.dispatch({
  sessionId: 'session-pressure', type: 'ABORT_SESSION', expectedRevision: tabBRevision,
  idempotencyKey: 'tab-b:abort',
}), error => error.code === 'SESSION_REVISION_CONFLICT'
  && error.details.expectedRevision === 1 && error.details.actualRevision === 2);
assert.equal((await pressureService.load('session-pressure')).checkpoint.state, 'ALIGNING');

// Two-device conflict fixture keeps both branches; vector-clock/last-write-wins merge is forbidden.
async function exportedBranch(branchOwner, suffix, command) {
  const branchRepository = session.createMemoryObservationSessionRepository();
  const branchService = session.createObservationSessionService({
    repository: branchRepository, ownerId: branchOwner, now, idFactory,
  });
  const branchStart = await branchService.start({
    planManifest: manifest,
    sessionId: 'session-shared-conflict',
    idempotencyKey: `branch-${suffix}:start`,
  });
  await branchService.dispatch({
    sessionId: branchStart.checkpoint.sessionId,
    type: command,
    expectedRevision: 1,
    idempotencyKey: `branch-${suffix}:${command}`,
  });
  return branchService.exportSession(branchStart.checkpoint.sessionId);
}

const branchA = await exportedBranch('device-a', 'a', 'MARK_PREPARED');
const branchB = await exportedBranch('device-b', 'b', 'ABORT_SESSION');
const conflict = session.evaluateObservationSessionConflict(branchA, branchB);
assert.equal(conflict.status, 'OWNER_CONFLICT');
assert.equal(conflict.autoMergeAllowed, false);
assert.deepEqual([...conflict.preserve], ['LOCAL_BRANCH', 'INCOMING_BRANCH']);

// Export/replay does not mutate originals and contains the full causal chain.
const exported = await service.exportSession(started.checkpoint.sessionId);
assert.equal(exported.schema, session.OBSERVATION_SESSION_EXPORT_SCHEMA);
assert.equal(exported.events.length, 6);
assert.equal(session.reduceObservationSession(exported.events).checkpointId, completed.checkpoint.checkpointId);
assert.equal(exported.sync.remoteAdapter, 'NOT_CONFIGURED');

// Offline scope accepts code plus two explicit Mars dependencies, never arbitrary data/media/foreign requests.
assert.deepEqual(session.sessionShellResources({
  locationHref: 'https://earthus.net/?aetherus=3',
  resourceNames: [
    'https://earthus.net/js/main.js?v=session1',
    '/css/app.css',
    '/data/celestial-bodies.json',
    'https://example.com/foreign.js',
    '/space/planets/mars.jpg',
  ],
}), [
  '/index.html',
  '/manifest.webmanifest',
  '/data/celestial-bodies.json',
  '/space/planets/detail/mars.webp?v=20260810d',
  '/js/main.js?v=session1',
  '/css/app.css',
]);
const serviceWorkerSource = await readFile(path.join(ROOT, 'prototype/sw.js'), 'utf8');
assert.match(serviceWorkerSource, /earthus-shell-2026-08-12-session1/);
assert.match(serviceWorkerSource, /X-Earthus-Aetherus-SHA256/);
assert.match(serviceWorkerSource, /earthus:aetherus-cache-session-shell/);
assert.match(serviceWorkerSource, /SESSION_DEPENDENCY_PATHS/);

assert.throws(
  () => session.reduceObservationSession([{ schema: 'earthus.observation-session-event.v0' }]),
  error => error.code === 'SESSION_EVENT_SCHEMA_UNSUPPORTED',
);

console.log('PASS: local session transitions, append-log crash replay, duplicate command, storage pressure, stale-tab CAS, two-device keep-both conflict, export, and exact offline dependency scope');
