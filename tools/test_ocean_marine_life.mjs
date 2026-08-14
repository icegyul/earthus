#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-ocean-marine-life-'));
const locationSource = await readFile(path.join(root, 'prototype/js/ocean/location-policy.js'), 'utf8');
const mediaSource = (await readFile(path.join(root, 'prototype/js/ocean/marine-life-media.js'), 'utf8'))
  .replace("'./location-policy.js'", "'./location-policy.mjs'");
await Promise.all([
  writeFile(path.join(directory, 'location-policy.mjs'), locationSource),
  writeFile(path.join(directory, 'marine-life-media.mjs'), mediaSource),
]);
const media = await import(pathToFileURL(path.join(directory, 'marine-life-media.mjs')).href);
const fixture = JSON.parse(await readFile(path.join(root, 'tools/fixtures/ocean-core-v1.json'), 'utf8'));

const repository = media.createMemoryMarineLifeMediaRepository();
let idCounter = 0;
const service = media.createMarineLifeMediaService({ repository,
  locationPolicy: fixture.locationPolicy,
  now: () => new Date('2026-08-14T12:00:00Z'),
  idFactory: prefix => `${prefix}-fixture-${++idCounter}`,
});
const digest = character => character.repeat(64);
const rights = { display: 'ALLOWED', derivative: 'ALLOWED', communityShare: 'ALLOWED',
  credit: 'Fixture observer', license: 'CC BY 4.0', sourceUrl: 'https://example.test/rights' };
const suggestion = { canonicalId: 'obis:fixture-taxon', scientificName: 'Testus marinus',
  rank: 'SPECIES', taxonomyVersion: 'OBIS-fixture', sourceUrl: 'https://example.test/taxon',
  suggestionClass: 'AI_SUGGESTION' };

let record = await service.registerPrivateOriginal({ recordId: 'marine-fixture-1', ownerId: 'owner-a',
  original: { contentDigest: digest('a'), byteLength: 30_000_000, mimeType: 'image/jpeg',
    privateKey: 'private/owner-a/marine-fixture-1/original.jpg', capturedAt: '2026-08-14T11:30:00Z' },
  location: { lat: 35.1234, lon: 129.1234, region: 'KR-26' }, sensitive: true,
  taxonomySuggestion: suggestion, rights });
assert.equal(record.visibility, 'PRIVATE');
assert.equal(record.original.publicUrl, null);
assert.equal(record.original.exifGpsStored, false);
assert.equal(record.taxonomy.status, 'SUGGESTED');
assert.equal(media.summarizeVerifiedTaxonomy([record]).totalVerified, 0);
assert.equal(await service.loadPublic({ recordId: record.id }), null);
await assert.rejects(service.loadOwner({ recordId: record.id, ownerId: 'owner-b' }),
  error => error.code === 'MARINE_LIFE_NOT_AUTHORIZED');

const derivatives = media.MARINE_LIFE_DERIVATIVE_WIDTHS.map((width, index) => ({
  width, height: Math.round(width * 0.75), byteLength: width * 100,
  mimeType: 'image/webp', contentDigest: digest(String(index + 1)),
  recipeRevision: 'marine-life-webp-v1',
  privateKey: `private/owner-a/marine-fixture-1/${width}.webp`, exifGpsPresent: false,
}));
record = await service.recordDerivatives({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, derivatives });
assert.deepEqual(record.derivatives.map(item => item.width), [320, 640, 1280, 2048]);
assert.equal(record.derivatives.every(item => item.publicUrl === null), true);
await assert.rejects(service.requestPublic({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, explicitHumanConfirmation: true }),
  error => error.code === 'MARINE_LIFE_TAXONOMY_VERIFICATION_REQUIRED');

await assert.rejects(service.verifyTaxonomy({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, taxonomy: { ...suggestion, reviewerId: 'reviewer-1',
    reviewedAt: '2026-08-14T11:40:00Z', suggestionClass: 'AI_VERIFIED' } }),
  error => error.code === 'MARINE_LIFE_AI_CANNOT_VERIFY');
record = await service.verifyTaxonomy({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, taxonomy: { ...suggestion, reviewerId: 'reviewer-1',
    reviewedAt: '2026-08-14T11:40:00Z', suggestionClass: 'HUMAN_REVIEW' } });
assert.equal(record.taxonomy.status, 'VERIFIED');
assert.equal(media.summarizeVerifiedTaxonomy([record]).totalVerified, 1);

await assert.rejects(service.requestPublic({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, explicitHumanConfirmation: false }),
  error => error.code === 'MARINE_LIFE_HUMAN_CONFIRMATION_REQUIRED');
record = await service.requestPublic({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, explicitHumanConfirmation: true });
assert.equal(record.moderation.state, 'PENDING');
assert.equal(await service.loadPublic({ recordId: record.id }), null);
record = await service.resolveModeration({ recordId: record.id, moderatorId: 'moderator-1',
  decision: 'ACCEPTED', reason: 'fixture evidence reviewed' });
assert.equal(record.state, 'PUBLIC_UPLOAD_PENDING');
assert.equal(await service.loadPublic({ recordId: record.id }), null);

const receipts = record.derivatives.map(item => ({ width: item.width,
  contentDigest: item.contentDigest,
  publicUrl: `https://cdn.example.test/ocean/marine-fixture-1/${item.width}.webp`,
  cacheControl: 'public, max-age=31536000, immutable' }));
record = await service.confirmPublicObjects({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, receipts });
assert.equal(record.visibility, 'PUBLIC');
const publicView = await service.loadPublic({ recordId: record.id });
assert.equal(publicView.originalUrl, null);
assert.equal(publicView.derivatives.length, 4);
assert.equal(publicView.location.precision, 'REGION');
assert.equal(publicView.location.coordinates, null);
assert.equal(publicView.location.reason, 'SENSITIVE_SPECIES_GENERALIZED');

const paths = record.publication.publicPaths;
await assert.rejects(service.confirmPrivatePurge({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, explicitHumanConfirmation: true,
  deletionReceipts: paths.slice(1).map(item => ({ path: item, deleted: true })),
  invalidationReceipt: { status: 'CREATED', id: 'inv-incomplete', paths,
    createdAt: '2026-08-14T12:05:00Z' },
  anonymousReadVerification: { status: 'VERIFIED_404', paths,
    verifiedAt: '2026-08-14T12:06:00Z' } }),
  error => error.code === 'MARINE_LIFE_PUBLIC_DELETE_INCOMPLETE');
record = await service.confirmPrivatePurge({ recordId: record.id, ownerId: 'owner-a',
  expectedRevision: record.revision, explicitHumanConfirmation: true,
  deletionReceipts: paths.map(item => ({ path: item, deleted: true })),
  invalidationReceipt: { status: 'CREATED', id: 'inv-fixture', paths,
    createdAt: '2026-08-14T12:05:00Z' },
  anonymousReadVerification: { status: 'VERIFIED_404', paths,
    verifiedAt: '2026-08-14T12:06:00Z' } });
assert.equal(record.visibility, 'PRIVATE');
assert.equal(record.state, 'PRIVATE_PURGED');
assert.equal(record.derivatives.every(item => item.publicUrl === null), true);
assert.equal(await service.loadPublic({ recordId: record.id }), null);
const ownerView = await service.loadOwner({ recordId: record.id, ownerId: 'owner-a' });
assert.match(ownerView.original.privateKey, /^private\/owner-a\//);
assert.deepEqual(ownerView.ownerLocation.coordinates, { lat: 35.1234, lon: 129.1234 });
const guessedOriginal = await service.authorizeOriginalRead({ recordId: record.id,
  principalId: null, objectKey: 'public/ocean/marine-fixture-1/original.jpg' });
assert.equal(guessedOriginal.allowed, false);
assert.equal(guessedOriginal.httpStatus, 403);
assert.equal('objectKey' in guessedOriginal, false);
const ownerOriginal = await service.authorizeOriginalRead({ recordId: record.id,
  principalId: 'owner-a', objectKey: ownerView.original.privateKey });
assert.equal(ownerOriginal.allowed, true);
assert.equal(ownerOriginal.httpStatus, 200);

assert.doesNotMatch(mediaSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Marine Life 30MB contract, 4 derivatives, PRIVATE→PUBLIC→PRIVATE, AI exclusion and original 403');
