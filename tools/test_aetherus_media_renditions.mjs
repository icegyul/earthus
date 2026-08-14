#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-aetherus-renditions-'));
const source = await readFile(path.join(root, 'prototype/js/space/media-rendition-policy.js'), 'utf8');
const modulePath = path.join(directory, 'media-rendition-policy.mjs');
await writeFile(modulePath, source);
const media = await import(pathToFileURL(modulePath).href);
const draftPolicy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/media-rendition-policy.v1.json'), 'utf8'));
assert.equal(media.validateRenditionPolicy(draftPolicy).productionEnabled, false);
const approvedPolicy = { ...draftPolicy, status: 'APPROVED', productionEnabled: true,
  revision: 'fixture-approved-v1', approvedAt: '2026-08-14T09:00:00Z',
  approvedBy: 'fixture-media-owner' };
const digest = character => character.repeat(64);
const sourceAsset = { assetId: 'raw-observation-fixture-1', private: true, immutable: true,
  width: 6000, height: 4000, byteLength: 30_000_000, contentDigest: digest('a') };

const avifPlan = media.buildRenditionPlan({ source: sourceAsset, policy: approvedPolicy,
  capabilities: { formats: ['AVIF', 'WEBP', 'JPEG'] }, createdAt: '2026-08-14T12:00:00Z' });
assert.deepEqual(avifPlan.outputs.map(output => output.id),
  ['THUMBNAIL_512', 'PREVIEW_1920', 'FOUR_K_3840']);
assert.deepEqual(avifPlan.outputs.map(output => output.dimensions.width), [512, 1920, 3840]);
assert.equal(avifPlan.outputs.every(output => output.format === 'AVIF'
  && output.mimeType === 'image/avif' && output.dimensions.upscaled === false
  && output.exifGpsPresent === false && output.sourceDigest === digest('a')), true);
assert.equal(avifPlan.deepZoom.tileSize, 256);
assert.equal(avifPlan.deepZoom.levels.at(-1).width, 6000);
assert.equal(avifPlan.deepZoom.levels.at(-1).height, 4000);
assert.ok(avifPlan.deepZoom.levels.at(-1).columns > 1);
assert.equal(avifPlan.productionAllowed, true);

const webpPlan = media.buildRenditionPlan({ source: sourceAsset, policy: approvedPolicy,
  capabilities: { formats: ['WEBP', 'JPEG'] }, createdAt: '2026-08-14T12:00:00Z' });
assert.equal(webpPlan.outputs.every(output => output.format === 'WEBP'), true);
const jpegPlan = media.buildRenditionPlan({ source: sourceAsset, policy: approvedPolicy,
  capabilities: { formats: ['JPEG'] }, createdAt: '2026-08-14T12:00:00Z' });
assert.equal(jpegPlan.outputs.every(output => output.format === 'JPEG'), true);
const smallPlan = media.buildRenditionPlan({ source: { ...sourceAsset, width: 400, height: 300 },
  policy: approvedPolicy, capabilities: { formats: ['JPEG'] }, createdAt: '2026-08-14T12:00:00Z' });
assert.equal(smallPlan.outputs.every(output => output.dimensions.width === 400
  && output.dimensions.upscaled === false), true);
assert.equal(smallPlan.deepZoom, null);

let job = media.createRenditionJob({ jobId: 'rendition-job-fixture-1', plan: avifPlan,
  createdAt: '2026-08-14T12:00:00Z' });
assert.equal(media.admitRenditionJob({ job, policy: approvedPolicy,
  queueState: { queuedBytes: 0, running: 0 } }).state, 'ADMITTED');
assert.equal(media.admitRenditionJob({ job, policy: approvedPolicy,
  queueState: { queuedBytes: approvedPolicy.queue.maxQueuedBytes, running: 0 } }).state, 'BACKPRESSURE');
job = media.startRenditionJob(job, { at: '2026-08-14T12:01:00Z' });
job = media.failRenditionJob(job, { at: '2026-08-14T12:02:00Z',
  code: 'FIXTURE_DECODE_FAILURE', policy: approvedPolicy });
assert.equal(job.state, 'FAILED');
assert.equal(job.failure.retryAutomatic, false);
assert.throws(() => media.retryRenditionJob(job, { at: '2026-08-14T12:03:00Z',
  explicitOperatorAction: false }), error => error.code === 'RENDITION_EXPLICIT_RETRY_REQUIRED');
job = media.retryRenditionJob(job, { at: '2026-08-14T12:03:00Z', explicitOperatorAction: true });
job = media.startRenditionJob(job, { at: '2026-08-14T12:04:00Z' });
const receiptIds = [...avifPlan.outputs.map(output => output.id), 'DEEP_ZOOM'];
const receipts = receiptIds.map((id, index) => ({ id, contentDigest: String(index + 1).repeat(64),
  byteLength: 1000 + index, exifGpsPresent: false }));
job = media.completeRenditionJob(job, { at: '2026-08-14T12:05:00Z', receipts });
assert.equal(job.state, 'SUCCEEDED');
assert.equal(job.result.receipts.length, 4);

let dead = media.createRenditionJob({ jobId: 'rendition-job-fixture-dead', plan: jpegPlan,
  createdAt: '2026-08-14T12:00:00Z' });
for (let attempt = 1; attempt <= approvedPolicy.queue.maxAttempts; attempt += 1) {
  dead = media.startRenditionJob(dead, { at: `2026-08-14T12:0${attempt}:00Z` });
  dead = media.failRenditionJob(dead, { at: `2026-08-14T12:0${attempt}:30Z`,
    code: 'FIXTURE_REPEAT_FAILURE', policy: approvedPolicy });
  if (dead.state === 'FAILED') dead = media.retryRenditionJob(dead,
    { at: `2026-08-14T12:0${attempt}:40Z`, explicitOperatorAction: true });
}
assert.equal(dead.state, 'DEAD_LETTER');
assert.equal(dead.attempts, approvedPolicy.queue.maxAttempts);
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Aetherus 512/1920/3840 AVIF-WebP-JPEG, Deep Zoom, backpressure, explicit retry and DLQ');
