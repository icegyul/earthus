#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-release-qa-contract-'));
const source = await readFile(path.join(root, 'prototype/js/space/release-qa-contract.js'), 'utf8');
const modulePath = path.join(directory, 'release-qa-contract.mjs');
await writeFile(modulePath, source);
const releaseQa = await import(pathToFileURL(modulePath).href);
const policy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/release-qa-policy.v1.json'), 'utf8'));
const normalized = releaseQa.validateReleaseQaPolicy(policy);
assert.equal(normalized.productionEnabled, false);
assert.throws(() => releaseQa.validateReleaseQaPolicy({ ...policy, productionEnabled: true }),
  error => error.code === 'RELEASE_QA_PRODUCTION_EVIDENCE_REQUIRED');
await Promise.all(Object.values(normalized.evidenceBySheet).flat().map(file => access(path.join(root, file))));

const beforeFold = releaseQa.formatZonedInstant('2026-11-01T05:30:00Z',
  { timeZone: 'America/New_York' });
const afterFold = releaseQa.formatZonedInstant('2026-11-01T06:30:00Z',
  { timeZone: 'America/New_York' });
assert.equal(beforeFold.localKey, afterFold.localKey);
assert.notEqual(beforeFold.offset, afterFold.offset);
const fold = releaseQa.compareDstFold('2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z',
  { timeZone: 'America/New_York' });
assert.equal(fold.status, 'AMBIGUOUS_LOCAL_TIME');
assert.equal(fold.collisionPreventedByUtc, true);
const seoul = releaseQa.formatZonedInstant('2026-08-14T00:00:00Z',
  { timeZone: 'Asia/Seoul', locale: 'ko-KR' });
assert.equal(seoul.sourceInstantPreserved, true);
assert.throws(() => releaseQa.formatZonedInstant('2026-08-14T00:00:00',
  { timeZone: 'Asia/Seoul' }), error => error.code === 'RELEASE_QA_UTC_REQUIRED');

let vision = { schema: 'earthus.aetherus-vision-travel-state.v1', state: 'IDLE',
  revision: 1, targetRef: null, history: [] };
vision = releaseQa.transitionVisionTravel(vision, { expectedRevision: 1,
  nextState: 'TARGET_SELECTED', targetRef: 'celestial-fixture-1',
  at: '2026-08-14T00:00:00Z', evidenceRef: 'selection-fixture-1' });
vision = releaseQa.transitionVisionTravel(vision, { expectedRevision: 2,
  nextState: 'PREPARING', at: '2026-08-14T00:00:01Z', evidenceRef: 'prepare-fixture-1' });
vision = releaseQa.transitionVisionTravel(vision, { expectedRevision: 3,
  nextState: 'TRAVELING', at: '2026-08-14T00:00:02Z', evidenceRef: 'travel-fixture-1' });
assert.equal(vision.timerDriven, false);
assert.equal(vision.deviceVerified, false);
assert.throws(() => releaseQa.transitionVisionTravel(vision, { expectedRevision: 3,
  nextState: 'ARRIVED', at: '2026-08-14T00:00:03Z', evidenceRef: 'stale-fixture-1' }),
error => error.code === 'RELEASE_QA_VISION_REVISION_CONFLICT');

const rollback = releaseQa.buildDataRollbackPlan({ dataset: 'aetherus-catalog',
  currentRevision: 'catalog-r2', lastGoodRevision: 'catalog-r1',
  backupEvidenceRef: 'backup-fixture-r1', readerCompatibilityEvidenceRef: 'reader-fixture-r1',
  approval: { actorRef: 'approver-fixture-1', reason: 'Fixture regression',
    approvedAt: '2026-08-14T00:05:00Z' } });
assert.equal(rollback.automaticExecute, false);
assert.equal(rollback.destructiveDeleteAllowed, false);
const hotfix = releaseQa.buildHotfixPlan({ incidentRef: 'incident-fixture-1',
  failureDescription: 'Fixture cache contract regression',
  changedFiles: ['prototype/js/space/infrastructure-contract.js'],
  requiredTests: ['tools/test_aetherus_infrastructure_contract.mjs'],
  rollbackRevision: 'verified-object-version-fixture-r1' });
assert.equal(hotfix.automaticDeploy, false);
assert.throws(() => releaseQa.buildHotfixPlan({ incidentRef: 'incident-fixture-2',
  failureDescription: 'Broad scope', changedFiles: ['prototype/js/space/'],
  requiredTests: ['tools/test_aetherus_infrastructure_contract.mjs'], rollbackRevision: 'r1' }),
error => error.code === 'RELEASE_QA_HOTFIX_SCOPE_TOO_BROAD');
assert.doesNotMatch(source, /\bfetch\s*\(|aws\s+s3|setInterval|requestAnimationFrame/);
console.log('PASS: QA Sheets 279,284,286,291,295 evidence matrix, DST, Vision state, rollback/hotfix plans');
