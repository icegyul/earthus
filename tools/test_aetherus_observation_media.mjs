#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importModule() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-observation-media-'));
  const source = await readFile(path.join(ROOT, 'prototype/js/space/observation-media.js'), 'utf8');
  const modulePath = path.join(directory, 'observation-media.mjs');
  await writeFile(modulePath, source);
  return import(pathToFileURL(modulePath).href);
}

const media = await importModule();
let clockTick = 0;
const now = () => new Date(Date.UTC(2026, 7, 12, 3, 0, clockTick++));
let idTick = 0;
const idFactory = () => `fixture-${++idTick}`;

function captureInput(jobId, sessionId = 'session-observation-media') {
  return {
    jobId,
    sessionId,
    imagingPlan: { revision: 'plan-mars-20260812-r1', targetId: 'mars' },
    deviceCapabilities: {
      adapterId: 'fixture-file-worker-port-v1',
      physicalControl: false,
      maxFrameBytes: 4096,
      mediaTypes: ['application/octet-stream'],
    },
    storage: { availableBytes: 65536 },
    power: { status: 'OK' },
    safetyGate: {
      status: 'ALLOWED',
      sourceRevision: 'user-confirmed-local-fixture-v1',
      checkedAtUtc: '2026-08-12T03:00:00.000Z',
    },
  };
}

async function captureFrames(repository, suffix, frames) {
  const capture = media.createCaptureOrchestrator({ repository, now, idFactory });
  const jobId = `capture-${suffix}`;
  const queued = await capture.queue({
    ...captureInput(jobId, `session-${suffix}`),
    idempotencyKey: `${suffix}:queue`,
  });
  assert.equal(queued.status, 'APPLIED');
  assert.equal(queued.job.state, 'QUEUED');
  const duplicateQueue = await capture.queue({
    ...captureInput(jobId, `session-${suffix}`),
    idempotencyKey: `${suffix}:queue`,
  });
  assert.equal(duplicateQueue.status, 'DUPLICATE');
  const prepared = await capture.prepare({
    jobId,
    expectedRevision: 1,
    idempotencyKey: `${suffix}:prepare`,
  });
  const duplicatePrepare = await capture.prepare({
    jobId,
    expectedRevision: 1,
    idempotencyKey: `${suffix}:prepare`,
  });
  assert.equal(duplicatePrepare.status, 'DUPLICATE');
  assert.equal(duplicatePrepare.job.revision, prepared.job.revision);
  const started = await capture.start({
    jobId,
    expectedRevision: prepared.job.revision,
    idempotencyKey: `${suffix}:start`,
  });
  let revision = started.job.revision;
  const rawAssetIds = [];
  for (let index = 0; index < frames.length; index += 1) {
    const observedAtUtc = `2026-08-12T03:01:${String(index).padStart(2, '0')}.000Z`;
    const stored = await capture.storeFrame({
      jobId,
      expectedRevision: revision,
      idempotencyKey: `${suffix}:frame:${index}`,
      bytes: frames[index],
      observedAtUtc,
      mediaType: 'application/octet-stream',
      dimensions: { width: 4, height: Math.ceil(frames[index].length / 4) },
    });
    assert.equal(stored.status, 'APPLIED');
    assert.equal(stored.rawAsset.immutable, true);
    assert.equal(stored.rawAsset.provenance.classification, 'observation');
    assert.equal(stored.rawAsset.privacy.exifLocationStored, false);
    rawAssetIds.push(stored.rawAsset.assetId);
    revision = stored.job.revision;
    if (index === 0) {
      const duplicateFrame = await capture.storeFrame({
        jobId,
        expectedRevision: revision - 1,
        idempotencyKey: `${suffix}:frame:${index}`,
        bytes: frames[index],
        observedAtUtc,
        mediaType: 'application/octet-stream',
        dimensions: { width: 4, height: Math.ceil(frames[index].length / 4) },
      });
      assert.equal(duplicateFrame.status, 'DUPLICATE');
      assert.equal(duplicateFrame.rawAsset.assetId, stored.rawAsset.assetId);
    }
    if (index === 0 && frames.length > 1) {
      const paused = await capture.pause({
        jobId,
        expectedRevision: revision,
        idempotencyKey: `${suffix}:pause`,
      });
      const resumed = await capture.resume({
        jobId,
        expectedRevision: paused.job.revision,
        idempotencyKey: `${suffix}:resume`,
      });
      revision = resumed.job.revision;
    }
  }
  const draining = await capture.drain({
    jobId,
    expectedRevision: revision,
    idempotencyKey: `${suffix}:drain`,
  });
  const completed = await capture.finalize({
    jobId,
    expectedRevision: draining.job.revision,
    idempotencyKey: `${suffix}:finalize`,
  });
  assert.equal(completed.job.state, 'COMPLETED');
  assert.equal(completed.job.frameCount, frames.length);
  assert.equal(completed.job.provenance.observationSampleCount, frames.length);
  assert.equal(completed.job.telemetry.networkRequestCount, 0);
  assert.equal(completed.job.telemetry.originalUploadCount, 0);
  assert.equal(completed.job.telemetry.physicalDeviceCommandCount, 0);
  return { capture, job: completed.job, rawAssetIds };
}

function assessment(rawAssetId, seed) {
  return {
    rawAssetId,
    metrics: {
      sharpnessProxy: 100 + seed,
      backgroundMedianProxy: seed % 2 ? null : 12 + seed,
      saturationFraction: 0.01 * seed,
    },
    flags: seed % 2 ? ['CALIBRATION_UNKNOWN', 'WCS_UNVERIFIED'] : ['ACCEPTABLE'],
    measurementSource: 'DETERMINISTIC_LOCAL_PROXY',
  };
}

function recipe() {
  return {
    schema: media.OBSERVATION_MEDIA_SCHEMAS.recipe,
    schemaVersion: 1,
    operation: 'LINEAR_LEVELS_U8',
    parameters: { blackPoint: 8, whitePoint: 220 },
    processor: {
      kind: 'DETERMINISTIC_LOCAL',
      version: 'aetherus-linear-levels-u8-v1',
    },
    calibrationAssetIds: [],
  };
}

async function reviewFrames(repository, suffix, rawAssetIds) {
  const review = media.createReviewProcessor({ repository, now, idFactory });
  const reviewId = `review-${suffix}`;
  const created = await review.create({
    reviewId,
    rawAssetIds,
    idempotencyKey: `${suffix}:review:create`,
  });
  assert.equal(created.reviewSet.state, 'UNREVIEWED');
  const assessed = await review.assess({
    reviewId,
    expectedRevision: created.reviewSet.revision,
    assessments: rawAssetIds.map((rawAssetId, index) => assessment(rawAssetId, index + 1)),
    idempotencyKey: `${suffix}:review:assess`,
  });
  assert.equal(assessed.reviewSet.assessments[0].sampleCount, 1);
  assert.equal(assessed.reviewSet.assessments[0].metrics.backgroundMedianProxy, null);
  const selected = await review.select({
    reviewId,
    expectedRevision: assessed.reviewSet.revision,
    selectedAssetIds: rawAssetIds,
    reason: 'fixture selection',
    idempotencyKey: `${suffix}:review:select`,
  });
  const beforeRaw = await Promise.all(rawAssetIds.map(id => repository.read('rawAssets', id)));
  const processed = await review.process({
    reviewId,
    expectedRevision: selected.reviewSet.revision,
    recipe: recipe(),
    idempotencyKey: `${suffix}:review:process`,
  });
  assert.equal(processed.reviewSet.state, 'PROCESSED');
  assert.equal(processed.reviewSet.provenance.rawClassification, 'observation');
  assert.equal(processed.reviewSet.provenance.derivativeClassification, 'calculated');
  assert.equal(processed.reviewSet.provenance.sourceDerivativeIdentityShared, false);
  assert.equal(processed.derivatives.length, rawAssetIds.length);
  for (let index = 0; index < processed.derivatives.length; index += 1) {
    const derivative = processed.derivatives[index];
    assert.notEqual(derivative.assetId, rawAssetIds[index]);
    assert.equal(derivative.provenance.aiGenerated, false);
    assert.equal(derivative.provenance.sourceAssetId, rawAssetIds[index]);
    const reproduced = await review.reproduce(derivative.assetId);
    assert.equal(reproduced.status, 'VERIFIED');
    assert.equal(reproduced.contentDigest, derivative.contentDigest);
    const afterRaw = await repository.read('rawAssets', rawAssetIds[index]);
    assert.equal(afterRaw.contentDigest, beforeRaw[index].contentDigest);
    assert.deepEqual([...afterRaw.bytes], [...beforeRaw[index].bytes]);
  }
  const approved = await review.approve({
    reviewId,
    expectedRevision: processed.reviewSet.revision,
    confirmedByUser: true,
    idempotencyKey: `${suffix}:review:approve`,
  });
  assert.equal(approved.reviewSet.state, 'APPROVED');
  assert.equal(approved.reviewSet.userDecision.actorType, 'USER');
  return { review, reviewSet: approved.reviewSet, derivatives: processed.derivatives };
}

const repository = media.createMemoryObservationMediaRepository();
const mainFrames = [
  new Uint8Array([0, 8, 16, 32, 64, 96, 128, 180, 220, 240, 250, 255]),
  new Uint8Array([5, 10, 20, 40, 80, 120, 160, 200, 221, 230, 245, 254]),
  new Uint8Array([3, 9, 18, 36, 72, 108, 144, 189, 219, 225, 242, 253]),
];
const captured = await captureFrames(repository, 'main', mainFrames);
const reviewed = await reviewFrames(repository, 'main', captured.rawAssetIds);
const linkedReview = media.createReviewProcessor({ repository, now, idFactory });
const linkedCreated = await linkedReview.create({
  reviewId: 'review-main-linked-derivative',
  rawAssetIds: [captured.rawAssetIds[0]],
});
const linkedAssessed = await linkedReview.assess({
  reviewId: linkedCreated.reviewSet.reviewId,
  expectedRevision: linkedCreated.reviewSet.revision,
  assessments: [assessment(captured.rawAssetIds[0], 4)],
});
const linkedSelected = await linkedReview.select({
  reviewId: linkedCreated.reviewSet.reviewId,
  expectedRevision: linkedAssessed.reviewSet.revision,
  selectedAssetIds: [captured.rawAssetIds[0]],
});
const linkedRecipe = recipe();
linkedRecipe.parameters = { blackPoint: 4, whitePoint: 210 };
const linkedProcessed = await linkedReview.process({
  reviewId: linkedCreated.reviewSet.reviewId,
  expectedRevision: linkedSelected.reviewSet.revision,
  recipe: linkedRecipe,
});
const unlistedLinkedDerivativeId = linkedProcessed.derivatives[0].assetId;

// Corrupt input never advances the job and never creates a RAW asset.
const failureRepository = media.createMemoryObservationMediaRepository();
const failureCapture = media.createCaptureOrchestrator({ repository: failureRepository, now, idFactory });
const failureQueued = await failureCapture.queue(captureInput('capture-failure', 'session-failure'));
const failurePrepared = await failureCapture.prepare({
  jobId: failureQueued.job.jobId,
  expectedRevision: failureQueued.job.revision,
});
const failureStarted = await failureCapture.start({
  jobId: failureQueued.job.jobId,
  expectedRevision: failurePrepared.job.revision,
});
await assert.rejects(() => failureCapture.storeFrame({
  jobId: failureStarted.job.jobId,
  expectedRevision: failureStarted.job.revision,
  bytes: new Uint8Array([1, 2, 3]),
  expectedDigest: '0'.repeat(64),
  observedAtUtc: '2026-08-12T03:05:00.000Z',
  mediaType: 'application/octet-stream',
}), error => error.code === 'CAPTURE_FRAME_CHECKSUM_MISMATCH');
assert.equal((await failureCapture.load(failureStarted.job.jobId)).revision, failureStarted.job.revision);
assert.equal((await failureRepository.list('rawAssets')).length, 0);

// Storage pressure keeps the existing job revision and user bytes unchanged.
failureRepository.failNextMutation('OBSERVATION_MEDIA_STORAGE_PRESSURE');
await assert.rejects(() => failureCapture.storeFrame({
  jobId: failureStarted.job.jobId,
  expectedRevision: failureStarted.job.revision,
  bytes: new Uint8Array([4, 5, 6]),
  observedAtUtc: '2026-08-12T03:05:01.000Z',
  mediaType: 'application/octet-stream',
}), error => error.code === 'OBSERVATION_MEDIA_STORAGE_PRESSURE');
assert.equal((await failureCapture.load(failureStarted.job.jobId)).revision, failureStarted.job.revision);
assert.equal((await failureRepository.list('rawAssets')).length, 0);

// Abort is a local mutation with no transport, timer, or physical command dependency.
const abortDurations = [];
for (let index = 0; index < 30; index += 1) {
  const abortRepository = media.createMemoryObservationMediaRepository();
  const abortCapture = media.createCaptureOrchestrator({ repository: abortRepository, now, idFactory });
  const queued = await abortCapture.queue(captureInput(`capture-abort-${index}`, `session-abort-${index}`));
  const startedAt = performance.now();
  const aborted = await abortCapture.abort({
    jobId: queued.job.jobId,
    expectedRevision: queued.job.revision,
    idempotencyKey: `abort-${index}`,
  });
  abortDurations.push(performance.now() - startedAt);
  assert.equal(aborted.job.state, 'ABORTED');
}
abortDurations.sort((a, b) => a - b);
const abortP95Ms = abortDurations[Math.ceil(abortDurations.length * 0.95) - 1];
assert.ok(abortP95Ms < 1000);

// Bit-rot is detected before recipe reproduction and never rewritten as a fresh derivative.
const tamperRepository = media.createMemoryObservationMediaRepository();
const tamperCapture = await captureFrames(tamperRepository, 'tamper', [mainFrames[0]]);
const tamperReview = await reviewFrames(tamperRepository, 'tamper', tamperCapture.rawAssetIds);
const tamperDerivativeId = tamperReview.derivatives[0].assetId;
tamperRepository.corruptFixtureByte('derivativeAssets', tamperDerivativeId, 0);
const storedTamperedDerivative = await tamperRepository.read('derivativeAssets', tamperDerivativeId);
assert.notEqual(
  await media.observationMediaSha256(storedTamperedDerivative.bytes),
  storedTamperedDerivative.contentDigest,
);
await assert.rejects(() => tamperReview.review.reproduce(tamperDerivativeId),
  error => error.code === 'REVIEW_DERIVATIVE_CHECKSUM_MISMATCH');
tamperRepository.corruptFixtureByte('rawAssets', tamperCapture.rawAssetIds[0], 0);
const tamperArchive = media.createObservationArchive({ repository: tamperRepository, now, idFactory });
await assert.rejects(() => tamperArchive.stage({
  archiveId: 'archive-tampered-raw',
  rawAssetId: tamperCapture.rawAssetIds[0],
  retention: { mode: 'KEEP_UNTIL_USER_DELETE', legalHold: false },
}), error => error.code === 'ARCHIVE_ASSET_CHECKSUM_MISMATCH');

// Archive local commit, explicit interrupted multipart resume, and final remote byte proof.
const archive = media.createObservationArchive({ repository, now, idFactory });
const staged = await archive.stage({
  archiveId: 'archive-main',
  rawAssetId: captured.rawAssetIds[0],
  derivativeAssetIds: [reviewed.derivatives[0].assetId],
  retention: { mode: 'KEEP_UNTIL_USER_DELETE', legalHold: false },
  idempotencyKey: 'archive-main:stage',
});
assert.equal(staged.archiveObject.state, 'STAGING');
const local = await archive.commitLocal({
  archiveId: staged.archiveObject.archiveId,
  expectedRevision: staged.archiveObject.revision,
  idempotencyKey: 'archive-main:commit-local',
});
assert.equal(local.archiveObject.state, 'HOT');
assert.equal(local.archiveObject.replicas[0].backup.status, 'NOT_CONFIGURED');
const adapter = media.createMemoryMultipartArchiveAdapter({ adapterId: 'fixture-remote-main' });
adapter.interruptOnceAtPart(1);
const interrupted = await archive.uploadReplica({
  archiveId: local.archiveObject.archiveId,
  adapter,
  explicitUserConsent: true,
  partSize: 4,
});
assert.equal(interrupted.status, 'PAUSED');
assert.deepEqual([...interrupted.checkpoint.uploadedParts], [0]);
assert.equal(interrupted.automaticRetryCount, 0);
const resumedUpload = await archive.uploadReplica({
  archiveId: local.archiveObject.archiveId,
  adapter,
  explicitUserConsent: true,
  partSize: 4,
});
assert.equal(resumedUpload.status, 'VERIFIED');
assert.equal(resumedUpload.archiveObject.replicas.length, 2);
assert.equal(resumedUpload.archiveObject.replicas[1].productionApproved, false);
const remote = await adapter.readObject(resumedUpload.archiveObject.replicas[1].objectKey);
const localRaw = await repository.read('rawAssets', captured.rawAssetIds[0]);
assert.deepEqual([...remote.bytes], [...localRaw.bytes]);
assert.equal(remote.contentDigest, localRaw.contentDigest);

// A provider checksum mismatch is blocked and never registered as a verified replica.
const checksumRepository = media.createMemoryObservationMediaRepository();
const checksumCaptured = await captureFrames(checksumRepository, 'checksum', [mainFrames[1]]);
const checksumArchive = media.createObservationArchive({ repository: checksumRepository, now, idFactory });
const checksumStaged = await checksumArchive.stage({
  archiveId: 'archive-checksum',
  rawAssetId: checksumCaptured.rawAssetIds[0],
  retention: { mode: 'KEEP_UNTIL_USER_DELETE', legalHold: false },
});
const checksumLocal = await checksumArchive.commitLocal({
  archiveId: checksumStaged.archiveObject.archiveId,
  expectedRevision: checksumStaged.archiveObject.revision,
});
const corruptAdapter = media.createMemoryMultipartArchiveAdapter({ adapterId: 'fixture-corrupt-remote' });
corruptAdapter.corruptNextCompletion();
await assert.rejects(() => checksumArchive.uploadReplica({
  archiveId: checksumLocal.archiveObject.archiveId,
  adapter: corruptAdapter,
  explicitUserConsent: true,
  partSize: 5,
}), error => error.code === 'ARCHIVE_UPLOAD_FINAL_CHECKSUM_MISMATCH');
assert.equal((await checksumArchive.load('archive-checksum')).replicas.length, 1);

// Export contains exact asset bytes and checksums; a valid-JSON payload tamper fails closed.
const exported = await archive.exportPackage({
  archiveIds: ['archive-main'],
  exportId: 'export-main',
});
assert.equal(exported.status, 'READY');
assert.equal(exported.manifest.assets.length, 2);
assert.equal(exported.manifest.privacy.exifLocationsIncluded, false);
const verifiedExport = await media.verifyObservationArchiveExport(exported.packageBytes);
assert.equal(verifiedExport.status, 'VERIFIED');
assert.equal(verifiedExport.packageDigest, exported.packageDigest);
const tamperedEnvelope = JSON.parse(new TextDecoder().decode(exported.packageBytes));
const firstAssetId = tamperedEnvelope.manifest.assets[0].assetId;
const payload = tamperedEnvelope.payloads[firstAssetId];
tamperedEnvelope.payloads[firstAssetId] = `${payload[0] === 'A' ? 'B' : 'A'}${payload.slice(1)}`;
const tamperedPackage = new TextEncoder().encode(media.observationMediaCanonicalJson(tamperedEnvelope));
await assert.rejects(() => media.verifyObservationArchiveExport(tamperedPackage),
  error => error.code === 'ARCHIVE_EXPORT_ASSET_CHECKSUM_MISMATCH');

// Missing remote adapter blocks deletion and preserves every local original and derivative.
const blockedDelete = await archive.delete({
  archiveId: 'archive-main',
  receiptId: 'delete-main-blocked',
  explicitUserConfirmation: true,
  adapters: {},
});
assert.equal(blockedDelete.status, 'BLOCKED_ADAPTER_REQUIRED');
assert.ok(await repository.read('rawAssets', captured.rawAssetIds[0]));
assert.ok(await repository.read('derivativeAssets', reviewed.derivatives[0].assetId));
assert.equal((await media.verifyObservationDeletionReceipt(blockedDelete.receipt)).status, 'VERIFIED');

// Remote deletion failure leaves the archive in DELETING and preserves the local raw.
adapter.failNextDeletion();
const failedDelete = await archive.delete({
  archiveId: 'archive-main',
  receiptId: 'delete-main-failed',
  explicitUserConfirmation: true,
  adapters: { [adapter.adapterId]: adapter },
});
assert.equal(failedDelete.status, 'INCOMPLETE_REMOTE_DELETE');
assert.ok(await repository.read('rawAssets', captured.rawAssetIds[0]));
assert.equal((await archive.load('archive-main')).state, 'DELETING');

// A new explicit deletion command resumes the known incomplete workflow and proves the cascade.
const completedDelete = await archive.delete({
  archiveId: 'archive-main',
  receiptId: 'delete-main-completed',
  explicitUserConfirmation: true,
  adapters: { [adapter.adapterId]: adapter },
});
assert.equal(completedDelete.status, 'COMPLETED');
assert.equal(completedDelete.archiveObject.state, 'DELETED');
assert.equal(await repository.read('rawAssets', captured.rawAssetIds[0]), null);
assert.equal(await repository.read('derivativeAssets', reviewed.derivatives[0].assetId), null);
assert.equal(await repository.read('derivativeAssets', unlistedLinkedDerivativeId), null);
assert.ok(completedDelete.receipt.derivatives.some(item => item.assetId === unlistedLinkedDerivativeId));
assert.equal((await repository.read('reviewSets', reviewed.reviewSet.reviewId)).state, 'SOURCE_DELETED');
assert.equal((await repository.read('reviewSets', linkedCreated.reviewSet.reviewId)).state, 'SOURCE_DELETED');
assert.equal((await media.verifyObservationDeletionReceipt(completedDelete.receipt)).status, 'VERIFIED');
const duplicateDelete = await archive.delete({
  archiveId: 'archive-main',
  receiptId: 'delete-main-completed',
  explicitUserConfirmation: true,
  adapters: { [adapter.adapterId]: adapter },
});
assert.equal(duplicateDelete.status, 'DUPLICATE');

// Legal hold records a signed blocked receipt and keeps the object HOT.
const holdRepository = media.createMemoryObservationMediaRepository();
const holdCaptured = await captureFrames(holdRepository, 'hold', [mainFrames[2]]);
const holdArchive = media.createObservationArchive({ repository: holdRepository, now, idFactory });
const holdStaged = await holdArchive.stage({
  archiveId: 'archive-hold',
  rawAssetId: holdCaptured.rawAssetIds[0],
  retention: { mode: 'KEEP_UNTIL_USER_DELETE', legalHold: true },
});
const holdLocal = await holdArchive.commitLocal({
  archiveId: holdStaged.archiveObject.archiveId,
  expectedRevision: holdStaged.archiveObject.revision,
});
const holdDelete = await holdArchive.delete({
  archiveId: holdLocal.archiveObject.archiveId,
  receiptId: 'delete-hold',
  explicitUserConfirmation: true,
});
assert.equal(holdDelete.status, 'BLOCKED_BY_LEGAL_HOLD');
assert.equal((await holdArchive.load('archive-hold')).state, 'HOT');
assert.ok(await holdRepository.read('rawAssets', holdCaptured.rawAssetIds[0]));

// Source contains no hidden network, blind retry timer, animation, or physical-device API.
const moduleSource = await readFile(path.join(ROOT, 'prototype/js/space/observation-media.js'), 'utf8');
assert.doesNotMatch(moduleSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|requestAnimationFrame|setInterval|setTimeout/);
assert.doesNotMatch(moduleSource, /navigator\.mediaDevices|getUserMedia|ImageCapture/);
assert.doesNotMatch(moduleSource, /\bTODO\b|IMPLEMENT HERE|rest of code/i);

console.log(`PASS: immutable RAW, deterministic recipe derivatives, explicit multipart resume, export checksums, replica-aware deletion receipts, storage/bit-rot/legal-hold failures, and local abort p95 ${abortP95Ms.toFixed(2)}ms`);
