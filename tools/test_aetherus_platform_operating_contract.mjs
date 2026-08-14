#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-platform-contract-'));
const source = await readFile(path.join(root, 'prototype/js/space/platform-operating-contract.js'), 'utf8');
const modulePath = path.join(directory, 'platform-operating-contract.mjs');
await writeFile(modulePath, source);
const platform = await import(pathToFileURL(modulePath).href);
const policy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/platform-operating-policy.v1.json'), 'utf8'));
assert.equal(platform.validatePlatformPolicy(policy).productionEnabled, false);
assert.throws(() => platform.validatePlatformPolicy({ ...policy, productionEnabled: true }),
  error => error.code === 'PLATFORM_PRODUCTION_NOT_VERIFIED');

const unknownMedia = platform.decideExternalMediaHandling({ sourceUrl: 'https://example.test/media/1',
  rights: { status: 'UNKNOWN', checkedAt: '2026-08-14T00:00:00Z',
    sourceUrl: 'https://example.test/rights/1', recordId: 'rights-fixture-1' } });
assert.equal(unknownMedia.disposition, 'LINK_ONLY');
assert.equal(unknownMedia.earthusStorageAllowed, false);
const cachedMedia = platform.decideExternalMediaHandling({ sourceUrl: 'https://example.test/media/2',
  checksumSha256: 'a'.repeat(64), rights: { status: 'LICENSED', storageAllowed: true,
    publicDisplayAllowed: false, checkedAt: '2026-08-14T00:00:00Z',
    sourceUrl: 'https://example.test/rights/2', recordId: 'rights-fixture-2' } });
assert.equal(cachedMedia.disposition, 'CACHE_ALLOWED');
assert.equal(cachedMedia.publicDisplayAllowed, false);

assert.equal(platform.decideEntitlement({ capability: 'mission-control-pro',
  requiredTier: 'PRO' }).reason, 'ENTITLEMENT_UNKNOWN');
assert.equal(platform.decideEntitlement({ capability: 'mission-control-pro', requiredTier: 'PRO',
  entitlement: { tier: 'PRO', status: 'ACTIVE', assertedAt: '2026-08-14T00:00:00Z',
    sourceId: 'entitlement-fixture-1' } }).allowed, true);
const presentation = platform.normalizePresentationContext({ locale: 'ko-KR',
  timeZone: 'Asia/Seoul', reducedMotion: true, highContrast: false });
assert.equal(presentation.animationMode, 'REDUCED');
assert.equal(presentation.sourceTimestampsRemainUtc, true);

const partialRaw = { status: 'PARTIAL',
  providerId: 'fixture-provider', sourceUrl: 'https://example.test/provider',
  fetchedAt: '2026-08-14T00:05:00Z', rightsRecordId: 'rights-fixture-provider', records: [
    { id: 'observation-1', observedAt: '2026-08-14T00:00:00Z', payload: { value: 1 } },
    { id: 'observation-2', missingReason: 'PROVIDER_MISSING', payload: null },
  ] };
const partial = platform.normalizeProviderEnvelope(partialRaw, { domain: 'EARTH' });
assert.equal(partial.records[1].missingReason, 'PROVIDER_MISSING');
assert.throws(() => platform.normalizeProviderEnvelope({ ...partialRaw, status: 'OK' },
  { domain: 'EARTH' }), error => error.code === 'PLATFORM_PROVIDER_OK_WITH_MISSING_RECORD');
const running = platform.transitionIngestionJob({ state: 'QUEUED', idempotencyKey: 'job-key-001',
  providerId: 'fixture-provider' }, 'RUNNING', { at: '2026-08-14T00:06:00Z' });
const completed = platform.transitionIngestionJob(running, 'PARTIAL', {
  at: '2026-08-14T00:07:00Z', receipt: { sourceCount: 2, acceptedCount: 1,
    missingCount: 1, rejectedCount: 0 } });
assert.equal(completed.receipt.missingCount, 1);
assert.throws(() => platform.transitionIngestionJob(completed, 'SUCCEEDED',
  { at: '2026-08-14T00:08:00Z' }), error => error.code === 'PLATFORM_JOB_TRANSITION_INVALID');
assert.throws(() => platform.sanitizeAnalyticsEvent({ name: 'map-opened',
  occurredAt: '2026-08-14T00:00:00Z', properties: { latitude: 37.5 } }),
error => error.code === 'PLATFORM_ANALYTICS_SENSITIVE_PROPERTY_FORBIDDEN');
const config = platform.validateRuntimeConfiguration({ revision: 'fixture-config-v1',
  features: { aetherus: true } }, { policy });
assert.equal(config.features.aetherus, false);
assert.throws(() => platform.validateRuntimeConfiguration({ revision: 'fixture-config-v2',
  accessToken: 'leak', features: {} }, { policy }),
error => error.code === 'PLATFORM_SECRET_IN_CONFIGURATION_FORBIDDEN');
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Shared platform Sheets 6,8,10,11,14-18,21-23 fail-closed operating contracts');
