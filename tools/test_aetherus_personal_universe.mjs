#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importModule() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-personal-universe-'));
  const source = await readFile(path.join(ROOT, 'prototype/js/space/personal-universe.js'), 'utf8');
  const modulePath = path.join(directory, 'personal-universe.mjs');
  await writeFile(modulePath, source);
  return import(pathToFileURL(modulePath).href);
}

const personal = await importModule();
let tick = 0;
const now = () => new Date(Date.UTC(2026, 7, 12, 8, 0, tick++));
let ids = 0;
const idFactory = prefix => `${prefix}_fixture_${++ids}`;
const repository = personal.createMemoryPersonalUniverseRepository();
const universe = personal.createPersonalUniverseService({ repository, now, idFactory });

const created = await universe.create({
  universeId: 'universe-fixture', ownerId: 'principal-a', idempotencyKey: 'create-fixture',
  privacy: { locationPolicy: 'COARSE_REGION', coarseRegion: 'seoul-metropolitan-area' },
});
assert.equal(created.status, 'APPLIED');
assert.equal(created.result.state, 'PRIVATE');
assert.deepEqual(created.result.exclusions, ['AI_MEMORY', 'OBSERVATION_RAW_BYTES', 'COMMUNITY_POSTS']);
const duplicateCreate = await universe.create({
  universeId: 'universe-fixture', ownerId: 'principal-a', idempotencyKey: 'create-fixture',
});
assert.equal(duplicateCreate.status, 'DUPLICATE');

const record = {
  recordId: 'record-webb-first-images', type: 'MISSION_BOOKMARK', subjectId: 'jwst-first-images',
  title: 'Webb first images', note: 'private learning note',
  sourceContext: {
    provenance: 'observation', sourceRevision: 'jwst-mission-media-replay-r1',
    freshness: 'STATIC_ARTIFACT_2026-08-12', precision: 'MILESTONE_ONLY',
    sourceUrl: 'https://science.nasa.gov/mission/webb/webbs-first-images/',
  },
  privacy: { visibility: 'PRIVATE', locationPolicy: 'NOT_STORED' },
};
const added = await universe.addRecord({
  universeId: 'universe-fixture', ownerId: 'principal-a', expectedRevision: 1,
  record, idempotencyKey: 'add-webb-record',
});
assert.equal(added.status, 'APPLIED');
assert.equal(added.result.revision, 2);
assert.equal(added.result.records[0].privacy.visibility, 'PRIVATE');
assert.equal(added.result.records[0].linkedObservationId, null);
const duplicateAdd = await universe.addRecord({
  universeId: 'universe-fixture', ownerId: 'principal-a', expectedRevision: 1,
  record, idempotencyKey: 'add-webb-record',
});
assert.equal(duplicateAdd.status, 'DUPLICATE');
await assert.rejects(() => universe.load({ universeId: 'universe-fixture', ownerId: 'principal-b' }),
  error => error.code === 'PERSONAL_UNIVERSE_NOT_AUTHORIZED');
await assert.rejects(() => universe.addRecord({
  universeId: 'universe-fixture', ownerId: 'principal-a', expectedRevision: 2,
  idempotencyKey: 'reject-exact-location', record: {
    ...record, recordId: 'record-exact-location',
    privacy: { visibility: 'PRIVATE', locationPolicy: 'NOT_STORED', latitude: 37.5, longitude: 127 },
  },
}), error => error.code === 'PERSONAL_UNIVERSE_PRECISE_LOCATION_FORBIDDEN');

const exported = await universe.exportPackage({ universeId: 'universe-fixture', ownerId: 'principal-a', exportId: 'export-fixture' });
const verified = await personal.verifyPersonalUniverseExport(exported.packageBytes);
assert.equal(verified.manifest.recordCount, 1);
assert.equal(verified.snapshot.records[0].recordId, 'record-webb-first-images');
assert.equal(verified.snapshot.exclusions.includes('AI_MEMORY'), true);
const tampered = new Uint8Array(exported.packageBytes);
tampered[tampered.length - 2] ^= 1;
await assert.rejects(() => personal.verifyPersonalUniverseExport(tampered),
  error => /^PERSONAL_UNIVERSE_EXPORT_/.test(error.code));
await assert.rejects(() => universe.delete({
  universeId: 'universe-fixture', ownerId: 'principal-a', expectedRevision: 2,
  exportPackageBytes: exported.packageBytes, explicitUserConfirmation: false, idempotencyKey: 'delete-no-confirm',
}), error => error.code === 'PERSONAL_UNIVERSE_DELETE_CONFIRMATION_REQUIRED');

const deleted = await universe.delete({
  universeId: 'universe-fixture', ownerId: 'principal-a', expectedRevision: 2,
  exportPackageBytes: exported.packageBytes, explicitUserConfirmation: true,
  receiptId: 'receipt-fixture', idempotencyKey: 'delete-fixture',
});
assert.equal(deleted.status, 'APPLIED');
assert.equal(deleted.result.scopes.personalUniverse, 'COMPLETED_LOCAL');
assert.equal(deleted.result.scopes.aiMemory, 'OUT_OF_SCOPE_SEPARATE_SCHEMA');
assert.equal(deleted.result.scopes.observationRawBytes, 'OUT_OF_SCOPE_ARCHIVE_OWNER');
assert.equal((await personal.verifyPersonalUniverseDeletionReceipt(deleted.result)).receiptId, 'receipt-fixture');
assert.equal(await universe.loadDeletionReceipt('receipt-fixture').then(value => value.receiptId), 'receipt-fixture');
await assert.rejects(() => universe.load({ universeId: 'universe-fixture', ownerId: 'principal-a' }),
  error => error.code === 'PERSONAL_UNIVERSE_NOT_FOUND');
const duplicateDelete = await universe.delete({
  universeId: 'universe-fixture', ownerId: 'principal-a', expectedRevision: 2,
  exportPackageBytes: exported.packageBytes, explicitUserConfirmation: true,
  receiptId: 'receipt-fixture', idempotencyKey: 'delete-fixture',
});
assert.equal(duplicateDelete.status, 'DUPLICATE');

const source = await readFile(path.join(ROOT, 'prototype/js/space/personal-universe.js'), 'utf8');
assert.doesNotMatch(source, /\bfetch\s*\(/, 'local-first personal universe must not add server calls');
assert.doesNotMatch(source, /setInterval|requestAnimationFrame|setTimeout/, 'personal universe must not create a render loop');
console.log('PASS: private ownership, tenant denial, revision/idempotency, exact-location rejection, export verification, and scoped deletion receipt');
