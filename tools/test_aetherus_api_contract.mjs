#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-aetherus-api-'));
const source = await readFile(path.join(root, 'prototype/js/space/api-contract.js'), 'utf8');
const modulePath = path.join(directory, 'api-contract.mjs');
await writeFile(modulePath, source);
const api = await import(pathToFileURL(modulePath).href);
const draftPolicy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/api-contract-policy.v1.json'), 'utf8'));
assert.equal(api.validateApiPolicy(draftPolicy).productionEnabled, false);
assert.throws(() => api.validateApiPolicy({ ...draftPolicy, productionEnabled: true }),
  error => error.code === 'API_PRODUCTION_POLICY_NOT_APPROVED');

const route = api.validateRestRoute('GET', '/api/v1/celestial-objects/{id}/observations',
  { policy: draftPolicy });
assert.equal(route.version, 'v1');
assert.throws(() => api.validateRestRoute('GET', '/api/celestial-objects/{id}',
  { policy: draftPolicy }), error => error.code === 'API_ROUTE_VERSION_OR_SHAPE_INVALID');
assert.throws(() => api.validateRestRoute('POST', '/api/v1/celestial-objects/create',
  { policy: draftPolicy }), error => error.code === 'API_REST_VERB_SEGMENT_FORBIDDEN');

const page = api.normalizeCursorPage({ items: [{ id: 'fixture-1' }], hasMore: true,
  nextCursor: 'opaque_Cursor_001' }, { requestedLimit: 20, policy: draftPolicy });
assert.equal(page.nextCursor, 'opaque_Cursor_001');
assert.equal(Object.hasOwn(page, 'total'), false);
assert.throws(() => api.normalizeCursorPage({ items: [], hasMore: true, nextCursor: null },
  { requestedLimit: 20, policy: draftPolicy }),
error => error.code === 'API_CURSOR_CONTINUATION_MISMATCH');
assert.throws(() => api.normalizeCursorPage({ items: [], hasMore: false, nextCursor: null, total: 7 },
  { requestedLimit: 20, policy: draftPolicy }),
error => error.code === 'API_CURSOR_SYNTHETIC_TOTAL_FORBIDDEN');

const envelope = api.buildErrorEnvelope({ code: 'OBJECT_NOT_FOUND',
  message: '요청한 객체를 찾지 못했습니다.', requestId: 'request-fixture-001',
  details: { objectId: 'fixture-1' }, retryable: false });
assert.equal(envelope.error.requestId, 'request-fixture-001');
assert.equal(Object.hasOwn(envelope.error, 'stack'), false);
assert.throws(() => api.buildErrorEnvelope({ code: 'UPSTREAM_FAILURE', message: '실패',
  requestId: 'request-fixture-002', details: { token: 'must-not-leak' } }),
error => error.code === 'API_ERROR_SENSITIVE_DETAIL_FORBIDDEN');

let now = Date.parse('2026-08-14T00:00:00Z');
const registry = new api.IdempotencyRegistry({ policy: draftPolicy, nowMs: () => now });
const mutation = { actorId: 'user-fixture-1', method: 'POST',
  route: '/api/v1/user-observations', key: 'fixture-key-001', requestBodyHash: 'a'.repeat(64) };
const accepted = registry.claim(mutation);
assert.equal(accepted.disposition, 'ACCEPTED');
registry.complete(accepted.scope, 'response-fixture-001');
const replay = registry.claim(mutation);
assert.equal(replay.disposition, 'REPLAY');
assert.equal(replay.responseRef, 'response-fixture-001');
assert.throws(() => registry.claim({ ...mutation, requestBodyHash: 'b'.repeat(64) }),
  error => error.code === 'API_IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST');
assert.equal(registry.claim({ ...mutation, actorId: 'user-fixture-2' }).disposition, 'ACCEPTED');
now += draftPolicy.idempotency.ttlSeconds * 1000 + 1;
assert.equal(registry.claim(mutation).disposition, 'ACCEPTED');

const hash = 'c'.repeat(64);
const etag = api.makeStrongEtag(hash);
assert.deepEqual(api.evaluateConditionalGet({ etag, ifNoneMatch: etag }),
  { status: 304, bodyAllowed: false, etag });
assert.equal(api.evaluateConditionalGet({ etag, ifNoneMatch: `"sha256-${'d'.repeat(64)}"` }).status,
  200);
assert.throws(() => api.evaluateConditionalGet({ etag, ifNoneMatch: `W/${etag}` }),
  error => error.code === 'API_IF_NONE_MATCH_INVALID');
const rateHeaders = api.buildRateLimitHeaders({ limit: 120, remaining: 0,
  resetAtEpochSeconds: 1786669200, retryAfterSeconds: 30 });
assert.deepEqual(rateHeaders, { 'X-RateLimit-Limit': '120', 'X-RateLimit-Remaining': '0',
  'X-RateLimit-Reset': '1786669200', 'Retry-After': '30' });
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Aetherus API Sheets 215-218 versioned REST, cursor/error, request/idempotency and cache/rate headers');
