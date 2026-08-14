#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-security-contract-'));
const source = await readFile(path.join(root, 'prototype/js/space/security-privacy-contract.js'), 'utf8');
const modulePath = path.join(directory, 'security-privacy-contract.mjs');
await writeFile(modulePath, source);
const security = await import(pathToFileURL(modulePath).href);
const policy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/security-policy.v1.json'), 'utf8'));
assert.equal(security.validateSecurityPolicy(policy).productionEnabled, false);
assert.throws(() => security.validateSecurityPolicy({ ...policy, productionEnabled: true }),
  error => error.code === 'SECURITY_PRODUCTION_EVIDENCE_REQUIRED');
const rightsBase = { recordId: 'rights-fixture-1', checkedAt: '2026-08-14T00:00:00Z',
  sourceUrl: 'https://example.test/rights/1' };
assert.equal(security.rightsUseDecision({ ...rightsBase, status: 'PRESS_USE' }).disposition,
  'HUMAN_REVIEW_REQUIRED');
assert.equal(security.rightsUseDecision({ ...rightsBase, status: 'EMBED_ONLY' }).storageAllowed,
  false);
const session = security.normalizeSessionEvidence({ sessionRef: 'session-fixture-1',
  actorRef: 'actor-fixture-1', accessTokenRef: 'access-ref-fixture-1',
  refreshTokenRef: 'refresh-ref-fixture-1', issuedAt: '2026-08-14T00:00:00Z',
  accessExpiresAt: '2026-08-14T00:10:00Z', refreshExpiresAt: '2026-08-20T00:00:00Z' },
{ policy, now: '2026-08-14T00:05:00Z' });
assert.equal(session.accessState, 'ACTIVE');
assert.equal(session.rawTokenIncluded, false);
assert.throws(() => security.normalizeSessionEvidence({ accessToken: 'raw-secret' },
  { policy, now: '2026-08-14T00:05:00Z' }), error => error.code === 'SECURITY_RAW_TOKEN_FORBIDDEN');
const signed = security.signedUrlPlan({ ownerRef: 'owner-fixture-1',
  objectRef: 'private-object-fixture-1', expiresInSeconds: 300, policy });
assert.equal(signed.publicAcl, false);
assert.equal(signed.url, null);
assert.equal(security.authorizeRole({ role: 'USER', permission: 'OWN_OBSERVATION_READ',
  ownsResource: true, policy }).allowed, true);
assert.equal(security.authorizeRole({ role: 'USER', permission: 'OWN_OBSERVATION_READ',
  ownsResource: false, policy }).allowed, false);
assert.equal(security.authorizeRole({ role: 'EDITOR', permission: 'CONTENT_HIDE', policy }).allowed,
  false);
const report = security.normalizeModerationReport({ id: 'report-fixture-1',
  reporterRef: 'reporter-fixture-1', contentRef: 'upload-fixture-1', reason: 'COPYRIGHT',
  submittedAt: '2026-08-14T00:00:00Z' });
assert.equal(report.state, 'QUEUED');
assert.equal(report.automaticDecision, false);
assert.equal(security.abuseRateDecision({ usedReports: 0, policy }).allowed, false);
assert.equal(security.malwareDecision({ contentRef: 'upload-fixture-1', scanStatus: 'PASS',
  scannerRef: 'scanner-fixture-1', scannedAt: '2026-08-14T00:01:00Z' }, { policy }).disposition,
  'KEEP_QUARANTINED');
const received = { id: 'case-fixture-1', kind: 'COPYRIGHT_TAKEDOWN', state: 'RECEIVED', audit: [] };
const triaged = security.transitionCase(received, 'TRIAGED', { actorRef: 'moderator-fixture-1',
  at: '2026-08-14T00:02:00Z', evidenceRef: 'evidence-fixture-1' });
assert.equal(triaged.automaticExternalAction, false);
assert.throws(() => security.transitionCase(triaged, 'RESOLVED', { actorRef: 'moderator-fixture-1',
  at: '2026-08-14T00:03:00Z', evidenceRef: 'evidence-fixture-2' }),
error => error.code === 'SECURITY_CASE_TRANSITION_INVALID');
assert.doesNotMatch(source, /\bfetch\s*\(|localStorage|document\.cookie|setInterval/);
console.log('PASS: Security Sheets 250,252-256,260-262 rights/session/RBAC/moderation/quarantine/workflow gates');
