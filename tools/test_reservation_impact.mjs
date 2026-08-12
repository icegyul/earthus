#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = await mkdtemp(path.join(os.tmpdir(), 'earthus-reservation-impact-'));
const source = await readFile(path.join(root, 'prototype/js/reservation-impact.js'), 'utf8');
await writeFile(path.join(dir, 'reservation-impact.mjs'), source);
const reservation = await import(pathToFileURL(path.join(dir, 'reservation-impact.mjs')).href);
const watch = reservation.createReservationWatch({ watchId: 'watch_01', subjectRef: 'sub_fixture_0001', providerId: 'provider_fixture', placeId: 'place_fixture', startUtc: '2026-08-12T12:00:00Z', endUtc: '2026-08-12T15:00:00Z', createdAtUtc: '2026-08-12T00:00:00Z' });
const snapshot = values => reservation.normalizeProviderSnapshot({ providerId: 'provider_fixture', observedAtUtc: '2026-08-12T12:00:00Z', sourceUrl: 'https://provider.example/evidence', revision: 'r1', outcome: 'AVAILABLE', availableCount: 5, sampleCount: 1, authorized: true, ...values });

const baseline = reservation.evaluateReservationImpact({ watch, currentSnapshot: snapshot(), evaluatedAtUtc: '2026-08-12T12:01:00Z' });
assert.equal(baseline.state, 'BASELINE_RECORDED');
const noChange = reservation.evaluateReservationImpact({ watch, previousSnapshot: snapshot(), currentSnapshot: snapshot(), evaluatedAtUtc: '2026-08-12T12:01:00Z' });
assert.equal(noChange.state, 'NO_CHANGE');
const changed = reservation.evaluateReservationImpact({ watch, previousSnapshot: snapshot(), currentSnapshot: snapshot({ revision: 'r2', outcome: 'SOLD_OUT', availableCount: 0 }), evaluatedAtUtc: '2026-08-12T12:01:00Z' });
assert.equal(changed.state, 'PENDING_USER_CONFIRMATION'); assert.equal(changed.providerAction, null); assert.equal(changed.notificationSent, false);
assert.equal(reservation.deduplicateImpact({ impact: changed, previouslyProposedFingerprints: [changed.fingerprint] }).state, 'DUPLICATE_WITHHELD');
const acknowledgement = reservation.acknowledgeReservationImpact({ impact: changed, subjectRef: 'sub_fixture_0001', acknowledgedAtUtc: '2026-08-12T12:02:00Z', choice: 'REVIEWED' });
assert.equal(acknowledgement.providerAction, null); assert.equal(acknowledgement.notificationSent, false);
const unavailable = reservation.evaluateReservationImpact({ watch, currentSnapshot: snapshot({ authorized: false }), evaluatedAtUtc: '2026-08-12T12:01:00Z' });
assert.equal(unavailable.state, 'WITHHELD'); assert.equal(unavailable.evidence.outcome, 'UNKNOWN');
const stale = reservation.evaluateReservationImpact({ watch, currentSnapshot: snapshot({ observedAtUtc: '2026-08-12T11:00:00Z' }), evaluatedAtUtc: '2026-08-12T12:01:00Z' });
assert.equal(stale.state, 'WITHHELD');
assert.doesNotMatch(source, /\bfetch\s*\(|WebSocket|checkout|payment-confirm|setInterval|requestAnimationFrame|navigator\./i);
console.log('PASS: reservation impact baseline/diff/dedup/acknowledgement and provider failure all remain non-executing');
