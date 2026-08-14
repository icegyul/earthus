#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-ocean-vessel-lite-'));
const source = await readFile(path.join(root, 'prototype/js/ocean/vessel-lite.js'), 'utf8');
const modulePath = path.join(directory, 'vessel-lite.mjs');
await writeFile(modulePath, source);
const vessel = await import(pathToFileURL(modulePath).href);
const productionRaw = JSON.parse(await readFile(
  path.join(root, 'prototype/data/ocean/ais-provider-manifest.v1.json'), 'utf8'));
const productionManifest = vessel.validateAisProviderManifest(productionRaw);
assert.equal(productionManifest.entries.every(entry => entry.status === 'DRAFT'), true);
assert.equal(productionManifest.entries.every(entry => entry.featureFlag === 'OFF'), true);

const coverage = { status: 'APPROVED', polygons: [
  [[128, 34], [131, 34], [131, 37], [128, 37], [128, 34]],
] };
const providerBase = {
  status: 'APPROVED', featureFlag: 'PUBLIC', coverage,
  attribution: 'Fixture AIS provider', termsUrl: 'https://example.test/fixture-ais-terms',
  licenseRevision: 'fixture-license-v1', reviewedAt: '2026-08-14T09:00:00Z',
  rateLimit: { minZoom: 7, maxBboxAreaDeg2: 4, maxPositionsPerRequest: 2 },
  freshness: { liveMaxAgeSeconds: 120, delayedMaxAgeSeconds: 600,
    maxDisplayAgeSeconds: 3600 },
};
const fixtureManifest = vessel.validateAisProviderManifest({
  schema: vessel.AIS_PROVIDER_MANIFEST_SCHEMA, revision: 'fixture-only-v1', entries: [
    { ...providerBase, id: 'fixture-regional-live', latencyClass: 'LIVE', redistribution: true,
      cacheTTLSeconds: 60, historyAllowed: true,
      external: { allowed: true,
        vesselUrlTemplate: 'https://example.test/vessel/{mmsi}' } },
    { ...providerBase, id: 'fixture-external-only', latencyClass: 'EXTERNAL', redistribution: false,
      cacheTTLSeconds: 0, historyAllowed: false,
      external: { allowed: true,
        vesselUrlTemplate: 'https://tracker.example.test/ship/{mmsi}' } },
    { ...providerBase, id: 'fixture-disabled', featureFlag: 'OFF', latencyClass: 'LIVE',
      redistribution: true, cacheTTLSeconds: 0, historyAllowed: false,
      external: { allowed: false, vesselUrlTemplate: null } },
  ],
});

const nowMs = Date.parse('2026-08-14T12:00:00Z');
const position = (mmsi, observedAt, extra = {}) => ({ mmsi, lat: 35.1, lon: 129.1,
  sog: 12.4, cog: 84.2, heading: 83, navStatus: 'UNDER_WAY_USING_ENGINE',
  observedAt, receivedAt: new Date(Date.parse(observedAt) + 15_000).toISOString(),
  providerId: 'fixture-regional-live', ...extra });
const fresh = position('440123456', '2026-08-14T11:59:00Z');
const delayed = position('440123457', '2026-08-14T11:30:00Z');
const secondFresh = position('440123458', '2026-08-14T11:59:20Z', { lat: 35.2 });

const freshView = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-regional-live', bbox: [128.5, 34.5, 129.5, 35.5], zoom: 9,
  positions: [fresh], vesselMmsi: fresh.mmsi, nowMs });
assert.equal(freshView.state, 'LIVE');
assert.equal(freshView.realtimeBadgeAllowed, true);
assert.equal(freshView.markers.length, 1);
assert.equal(freshView.markers[0].freshness.ageSeconds, 60);
assert.equal(freshView.markers[0].observedAt, '2026-08-14T11:59:00.000Z');
assert.equal(freshView.markers[0].receivedAt, '2026-08-14T11:59:15.000Z');
assert.equal(freshView.provider.licenseRevision, 'fixture-license-v1');

// OT-010: stale 위치는 좌표 시각을 보존하되 실시간 배지를 절대 유지하지 않는다.
const staleView = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-regional-live', bbox: [128.5, 34.5, 129.5, 35.5], zoom: 9,
  positions: [delayed], nowMs });
assert.equal(staleView.state, 'DELAYED');
assert.equal(staleView.realtimeBadgeAllowed, false);
assert.equal(staleView.markers[0].freshness.status, 'STALE');
assert.equal(staleView.markers[0].freshness.realtimeBadgeAllowed, false);

// OT-009: coverage 밖은 UNAVAILABLE이며, 입력이 있어도 가짜/유출 marker가 0이다.
const unsupported = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-regional-live', bbox: [140, 40, 141, 41], zoom: 9,
  positions: [fresh], nowMs });
assert.equal(unsupported.state, 'UNAVAILABLE');
assert.equal(unsupported.reason, 'AIS_COVERAGE_UNAVAILABLE');
assert.deepEqual(unsupported.markers, []);
assert.deepEqual(unsupported.track, []);

const limited = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-regional-live', bbox: [128.5, 34.5, 129.5, 35.5], zoom: 9,
  positions: [fresh, delayed, secondFresh], nowMs });
assert.equal(limited.markers.length, 2);
assert.equal(limited.truncated, true);
const wideQuery = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-regional-live', bbox: [120, 30, 135, 40], zoom: 9,
  positions: [fresh], nowMs });
assert.equal(wideQuery.reason, 'AIS_QUERY_LIMITED');
assert.equal(wideQuery.markers.length, 0);

const historicalPositions = [
  position('440123456', '2026-08-13T10:00:00Z'),
  position('440123456', '2026-08-13T10:05:00Z', { lat: 35.2, lon: 129.2 }),
];
const historical = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-regional-live', mode: 'HISTORICAL',
  bbox: [128.5, 34.5, 129.5, 35.5], zoom: 9, positions: historicalPositions, nowMs });
assert.equal(historical.state, 'HISTORICAL');
assert.equal(historical.realtimeBadgeAllowed, false);
assert.deepEqual(historical.markers, []);
assert.equal(historical.track.length, 2);
assert.equal(historical.track.every(item => item.state === 'HISTORICAL'), true);

// redistribution=false 자료는 Earthus 응답에 원시 좌표를 넣지 않고 승인된 링크만 반환한다.
const externalRaw = { ...fresh, providerId: 'fixture-external-only' };
const external = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-external-only', bbox: [128.5, 34.5, 129.5, 35.5], zoom: 9,
  positions: [externalRaw], vesselMmsi: externalRaw.mmsi, nowMs });
assert.equal(external.state, 'EXTERNAL');
assert.equal(external.realtimeBadgeAllowed, false);
assert.deepEqual(external.markers, []);
assert.deepEqual(external.track, []);
assert.equal(external.externalUrl, 'https://tracker.example.test/ship/440123456');
assert.doesNotMatch(JSON.stringify(external), /35\.1|129\.1/);

const disabled = vessel.buildVesselLiteView({ manifest: fixtureManifest,
  providerId: 'fixture-disabled', bbox: [128.5, 34.5, 129.5, 35.5], zoom: 9,
  positions: [{ ...fresh, providerId: 'fixture-disabled' }], nowMs });
assert.equal(disabled.reason, 'AIS_PROVIDER_NOT_PUBLIC');
assert.equal(disabled.markers.length, 0);
const productionClosed = vessel.buildVesselLiteView({ manifest: productionManifest,
  providerId: 'ais-regional-public-contract-slot', bbox: [128.5, 34.5, 129.5, 35.5],
  zoom: 9, positions: [fresh], nowMs });
assert.equal(productionClosed.reason, 'AIS_PROVIDER_NOT_PUBLIC');

assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
console.log('PASS: Vessel Lite OT-009/010, license/coverage/freshness, external-only and historical gates');
