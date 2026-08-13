#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [html, css, js, fixture, migration, verifier, rollbackProbe] = await Promise.all([
  readFile(path.join(root, 'prototype/aetherus-device-qa.html'), 'utf8'),
  readFile(path.join(root, 'prototype/css/aetherus-device-qa.css'), 'utf8'),
  readFile(path.join(root, 'prototype/js/aetherus-device-qa.js'), 'utf8'),
  readFile(path.join(root, 'prototype/data/astrometry/m82opt-nasa-wcs-features-v1.json'), 'utf8'),
  readFile(path.join(root, 'prototype/supabase/migrations/20260814090000_aetherus_private_data.sql'), 'utf8'),
  readFile(path.join(root, 'tools/verify_aetherus_rls.mjs'), 'utf8'),
  readFile(path.join(root, 'prototype/canary/aetherus-device-rc-rollback-probe.json'), 'utf8'),
]);

const fixtureDocument = JSON.parse(fixture);
const rollbackDocument = JSON.parse(rollbackProbe);
assert.equal(rollbackDocument.state, 'RESTORED_SAFE_BASELINE');
assert.equal(rollbackDocument.productionConsumerAffected, false);
assert.equal(fixtureDocument.source.originalBundled, false);
assert.equal(fixtureDocument.extraction.sampleCount, 24);
assert.equal(fixtureDocument.features.length, 24);
assert.match(fixtureDocument.source.url, /^https:\/\/fits\.gsfc\.nasa\.gov\//);

for (const id of [
  'runEnvironment', 'requestLocation', 'startSkyAr', 'stopSkyAr', 'captureFrame',
  'checkPersistence', 'exportArchive', 'deleteArchive', 'saveConsent', 'withdrawConsent',
  'runAstrometry', 'runAiGate', 'runRemoteGate', 'startEndurance', 'finishEndurance',
  'manualChecks', 'exportReport',
]) assert.match(html, new RegExp(`id="${id}"`), `missing control ${id}`);
assert.match(html, /noindex,nofollow,noarchive/);
assert.match(html, /Content-Security-Policy/);
assert.match(html, /default-src 'self'/);
assert.match(html, /object-src 'none'/);
assert.match(html, /BLOCKED[\s\S]*Supabase[\s\S]*BLOCKED[\s\S]*\uc6b4\uc601 AI[\s\S]*BLOCKED[\s\S]*\uc6d0\uaca9 \uad00\uce21\uc18c HIL/);
assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /:focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.doesNotMatch(css, /animation:\s*[^;]*infinite/i);

assert.match(js, /createBrowserSkyARRuntime/);
assert.match(js, /createIndexedDbObservationMediaRepository/);
assert.match(js, /verifyObservationArchiveExport/);
assert.match(js, /verifyObservationDeletionReceipt/);
assert.match(js, /exactCoordinatesStoredInReport:\s*false/);
assert.match(js, /&& capabilities\.orientationApi/);
assert.match(js, /originalFilenameStored:\s*false/);
assert.match(js, /originalUploadCount/);
assert.match(js, /!cleanStop \|\| !noUpload \? 'FAIL' : enoughSamples \? 'PASS' : 'BLOCKED'/);
assert.match(js, /releaseDecision\s*=\s*'BLOCKED'/);
assert.doesNotMatch(js, /fetch\(['"]https?:\/\//i);
assert.doesNotMatch(js, /WebSocket|EventSource|navigator\.sendBeacon/);
assert.doesNotMatch(js, /setInterval|requestAnimationFrame/);

for (const table of [
  'aetherus_personal_universes', 'aetherus_personal_records',
  'aetherus_observation_archives', 'aetherus_privacy_events',
  'aetherus_data_subject_requests', 'aetherus_deletion_receipts',
]) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`));
  assert.match(migration, new RegExp(`alter table public\\.${table} force row level security;`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from public, anon;`));
}
assert.match(migration, /auth\.uid\(\) = owner_id/g);
assert.match(migration, /AETHERUS_EXPLICIT_CONFIRMATION_REQUIRED/);
assert.match(migration, /aetherus_export_my_data/);
assert.match(migration, /aetherus_withdraw_my_consent/);
assert.match(migration, /aetherus_delete_my_data/);
assert.match(migration, /dataSubjectRequests/);
assert.match(migration, /deletionReceipts/);
assert.match(migration, /privacyAuditEventsRetained/);
assert.match(migration, /if found then return to_jsonb\(receipt\)/);
assert.match(migration, /request_type = 'CONSENT_WITHDRAWAL'[\s\S]*'duplicate', true/);
assert.match(migration, /grant usage, select on sequence public\.aetherus_privacy_events_event_id_seq to authenticated/);
for (const functionName of [
  'aetherus_export_my_data', 'aetherus_withdraw_my_consent', 'aetherus_delete_my_data',
]) {
  assert.match(migration, new RegExp(`function public\\.${functionName}\\([\\s\\S]*?security definer`));
}
assert.doesNotMatch(migration, /service_role|anon_key|jwt_secret/i);

assert.match(verifier, /--confirm-live/);
assert.match(verifier, /AETHERUS_USER_A_JWT/);
assert.match(verifier, /AETHERUS_USER_B_JWT/);
assert.match(verifier, /principal-b-cannot-read-a-row/);
assert.match(verifier, /principal-b-cannot-update-a-row/);
assert.match(verifier, /principal-b-cannot-delete-a-row/);
assert.match(verifier, /probe-cleanup-verified/);
assert.doesNotMatch(verifier, /console\.log\([^\n]*(JWT|tokenA|tokenB)/);

console.log('PASS: AETHERUS device QA surface, local media receipts, blocked release gates, and principal A/B RLS evidence contract');
