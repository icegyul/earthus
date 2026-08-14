#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-infrastructure-contract-'));
const source = await readFile(path.join(root, 'prototype/js/space/infrastructure-contract.js'), 'utf8');
const modulePath = path.join(directory, 'infrastructure-contract.mjs');
await writeFile(modulePath, source);
const infra = await import(pathToFileURL(modulePath).href);
const policy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/infrastructure-policy.v1.json'), 'utf8'));
assert.equal(infra.validateInfrastructurePolicy(policy).productionEnabled, false);
assert.throws(() => infra.validateInfrastructurePolicy({ ...policy, productionEnabled: true }),
  error => error.code === 'INFRA_PRODUCTION_EVIDENCE_REQUIRED');
const publicKey = infra.buildCacheKey({ classification: 'PUBLIC_RENDITION', namespace: 'media',
  objectId: 'asset-fixture-1', revision: 'rendition-v1', rightsRecordId: 'rights-fixture-1' });
assert.match(publicKey, /^v1:public_rendition:/);
assert.throws(() => infra.buildCacheKey({ classification: 'PRIVATE_ORIGINAL', namespace: 'media',
  objectId: 'asset-fixture-1', revision: 'source-v1', rightsRecordId: 'rights-fixture-1' }),
error => error.code === 'INFRA_PRIVATE_CACHE_OWNER_REQUIRED');
assert.equal(infra.cacheDecision({ ageSeconds: 60, originStatus: 'AVAILABLE',
  classification: 'PUBLIC_RENDITION', policy }).disposition, 'HOT');
assert.equal(infra.cacheDecision({ ageSeconds: 87000, originStatus: 'FAILED',
  classification: 'PROVIDER_RESPONSE', policy }).disposition, 'STALE_FALLBACK');
assert.equal(infra.cacheDecision({ ageSeconds: 91000, originStatus: 'FAILED',
  classification: 'PROVIDER_RESPONSE', policy }).serve, false);
const privateRoute = infra.storageRoute({ kind: 'PRIVATE_ORIGINAL', objectId: 'asset-fixture-1',
  ownerRef: 'private-owner-fixture', policy });
assert.equal(privateRoute.publicRead, false);
assert.equal(privateRoute.signedReadRequired, true);
assert.equal(infra.verifyMediaChecksum({ expectedSha256: 'a'.repeat(64),
  actualSha256: 'b'.repeat(64) }).disposition, 'QUARANTINE');
const sample = { sourceId: 'fixture-cloud-metrics', observedAt: '2026-08-14T00:00:00Z',
  egressBytes: 1000, storageBytes: 5000, cacheHits: 90, cacheMisses: 10,
  cpuPercent: 75, queueDepth: 120 };
assert.equal(infra.normalizeInfrastructureMetrics(sample).cacheHitRatio, 0.9);
const scale = infra.autoscalingProposal(sample, { currentReplicas: 2, policy });
assert.equal(scale.action, 'PROPOSE_SCALE_OUT');
assert.equal(scale.automaticApply, false);
const provider = infra.providerRequestDecision({ providerId: 'fixture-space-provider',
  usedRequests: 0, consecutiveFailures: 0, policy });
assert.equal(provider.allowed, false);
assert.equal(provider.reason, 'PRODUCTION_GATE_CLOSED');
const incremental = infra.buildIngestionPlan({ mode: 'INCREMENTAL',
  providerId: 'fixture-space-provider', cursor: 'cursor-fixture-001', policy });
assert.equal(incremental.automaticStart, false);
assert.throws(() => infra.buildIngestionPlan({ mode: 'FULL_RESYNC',
  providerId: 'fixture-space-provider', policy }),
error => error.code === 'INFRA_FULL_RESYNC_APPROVAL_REQUIRED');
assert.doesNotMatch(source, /\bfetch\s*\(|aws\s+s3|setInterval|requestAnimationFrame/);
console.log('PASS: Infrastructure Sheets 233-238,241-245 cache/storage/metrics/provider/ingestion plans');
