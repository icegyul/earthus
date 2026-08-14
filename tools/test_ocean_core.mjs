#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-ocean-core-'));
const contractSource = await readFile(path.join(ROOT, 'prototype/js/ocean/observation-contract.js'), 'utf8');
const safetySource = (await readFile(path.join(ROOT, 'prototype/js/ocean/safety-gate.js'), 'utf8'))
  .replace("'./observation-contract.js'", "'./observation-contract.mjs'");
const adapterSource = (await readFile(path.join(ROOT, 'prototype/js/ocean/safety-adapters.js'), 'utf8'))
  .replace("'./observation-contract.js'", "'./observation-contract.mjs'");
const shadowSource = await readFile(path.join(ROOT, 'prototype/js/ocean/shadow-view.js'), 'utf8');
const fishingSource = (await readFile(path.join(ROOT, 'prototype/js/ocean/fishing-decision.js'), 'utf8'))
  .replace("'./observation-contract.js'", "'./observation-contract.mjs'")
  .replace("'./safety-gate.js'", "'./safety-gate.mjs'");
const locationSource = await readFile(path.join(ROOT, 'prototype/js/ocean/location-policy.js'), 'utf8');
const surfSource = (await readFile(path.join(ROOT, 'prototype/js/ocean/surf-decision.js'), 'utf8'))
  .replace("'./observation-contract.js'", "'./observation-contract.mjs'")
  .replace("'./safety-gate.js'", "'./safety-gate.mjs'");
await Promise.all([
  writeFile(path.join(directory, 'observation-contract.mjs'), contractSource),
  writeFile(path.join(directory, 'safety-gate.mjs'), safetySource),
  writeFile(path.join(directory, 'safety-adapters.mjs'), adapterSource),
  writeFile(path.join(directory, 'shadow-view.mjs'), shadowSource),
  writeFile(path.join(directory, 'fishing-decision.mjs'), fishingSource),
  writeFile(path.join(directory, 'location-policy.mjs'), locationSource),
  writeFile(path.join(directory, 'surf-decision.mjs'), surfSource),
]);
const contract = await import(pathToFileURL(path.join(directory, 'observation-contract.mjs')).href);
const safety = await import(pathToFileURL(path.join(directory, 'safety-gate.mjs')).href);
const adapters = await import(pathToFileURL(path.join(directory, 'safety-adapters.mjs')).href);
const shadow = await import(pathToFileURL(path.join(directory, 'shadow-view.mjs')).href);
const fishingDecision = await import(pathToFileURL(path.join(directory, 'fishing-decision.mjs')).href);
const locationPolicy = await import(pathToFileURL(path.join(directory, 'location-policy.mjs')).href);
const surfDecision = await import(pathToFileURL(path.join(directory, 'surf-decision.mjs')).href);
const fixture = JSON.parse(await readFile(path.join(ROOT, 'tools/fixtures/ocean-core-v1.json'), 'utf8'));
const manifestRaw = JSON.parse(await readFile(
  path.join(ROOT, 'prototype/data/ocean/provider-manifest.v1.json'), 'utf8'));
const surfPolicyDraft = JSON.parse(await readFile(
  path.join(ROOT, 'prototype/data/ocean/surf-scoring-policy.v1.json'), 'utf8'));
const nowMs = Date.parse(fixture.now);
const policy = fixture.freshnessPolicy;

assert.equal(fixture.fixtureOnly, true);

const manifest = contract.validateOceanProviderManifest(manifestRaw);
assert.equal(manifest.entries.length, 6);
for (const entry of manifest.entries) {
  assert.equal(entry.rightsStatus, 'DRAFT');
  assert.equal(contract.providerOperationAllowed(entry, 'DISPLAY'), false);
}

const grid = contract.normalizeMarineGridCell(fixture.marineGrid, {
  index: 0, nowMs, freshnessPolicy: policy,
});
assert.equal(grid.provenance, 'FORECAST');
assert.equal(grid.coordinates.lat, 35);
assert.equal(grid.coordinates.lon, 129);
assert.equal(grid.observations.find(item => item.metric === 'WAVE_HEIGHT').value, 1.8);
assert.equal(grid.observations.find(item => item.metric === 'WAVE_HEIGHT').unit, 'm');
assert.equal(grid.observations.find(item => item.metric === 'WAVE_HEIGHT').observedAt, null);
assert.equal(grid.observations.find(item => item.metric === 'WAVE_HEIGHT').validFrom,
  '2026-08-14T09:30:00.000Z');
assert.equal(grid.observations.find(item => item.metric === 'WAVE_HEIGHT').quality, 'FRESH');
assert.ok(grid.missingMetrics.includes('OCEAN_CURRENT_SPEED'));
assert.equal(grid.observations.some(item => item.metric === 'OCEAN_CURRENT_SPEED'), false);

const staleGrid = contract.normalizeMarineGridCell(
  { ...fixture.marineGrid, time: '2026-08-14T07:00:00Z' },
  { index: 0, nowMs, freshnessPolicy: policy });
assert.equal(staleGrid.observations[0].quality, 'STALE');

const station = contract.normalizeKmaMarineStation(fixture.kmaDocument, fixture.kmaStation,
  { nowMs, freshnessPolicy: policy });
const measuredWave = station.observations.find(item => item.metric === 'WAVE_HEIGHT');
assert.equal(measuredWave.provenance, 'MEASURED');
assert.equal(measuredWave.observedAt, '2026-08-14T09:50:00.000Z');
assert.equal(measuredWave.value, 1.6);
assert.equal(measuredWave.providerObjectId, 'fixture-22101');

const rejected = contract.normalizeKmaMarineStation(
  fixture.kmaDocument, fixture.kmaRejectedStation, { nowMs, freshnessPolicy: policy });
assert.equal(rejected.observations.some(item => item.metric === 'WAVE_HEIGHT'), false);
assert.deepEqual(rejected.rejected.find(item => item.metric === 'WAVE_HEIGHT'), {
  metric: 'WAVE_HEIGHT', sourceField: 'whRaw', rawValue: 90,
  reason: 'wave-height-outlier-over-30m',
});
const defensivelyRejected = contract.normalizeKmaMarineStation(fixture.kmaDocument,
  { ...fixture.kmaStation, id: 'fixture-direct-outlier', wh: 90 },
  { nowMs, freshnessPolicy: policy });
assert.equal(defensivelyRejected.observations.some(item => item.metric === 'WAVE_HEIGHT'), false);
assert.equal(defensivelyRejected.rejected.find(item => item.metric === 'WAVE_HEIGHT').reason,
  'WAVE_HEIGHT_OUT_OF_RANGE');

const ndbc = contract.normalizeNdbcBuoy(fixture.ndbcDocument, fixture.ndbcBuoy,
  { nowMs, freshnessPolicy: policy });
assert.equal(ndbc.provenance, 'MEASURED');
assert.equal(ndbc.observations.find(item => item.metric === 'WAVE_HEIGHT').value, 1.7);
assert.equal(ndbc.observations.find(item => item.metric === 'AIR_PRESSURE').unit, 'hPa');
assert.equal(ndbc.source.stationSource, 'NDBC');

const point = contract.normalizeOpenMeteoMarinePoint(fixture.openMeteoPoint, {
  nowMs, freshnessPolicy: policy,
});
assert.equal(point.provenance, 'FORECAST');
assert.equal(point.source.validFrom, '2026-08-14T09:50:00.000Z');
const pointCurrent = point.observations.find(item => item.metric === 'OCEAN_CURRENT_SPEED');
assert.equal(pointCurrent.value, 0.5);
assert.equal(pointCurrent.unit, 'm/s');
assert.equal(pointCurrent.sourceUnit, 'km/h');
assert.ok(pointCurrent.qualityFlags.includes('UNIT_CONVERTED_KMH_TO_MS'));
assert.equal(point.observations.find(item => item.metric === 'SWELL_DIRECTION').value, 88);

const tideDocument = {
  latitude: 35.1, longitude: 129.1, location_id: 0,
  utc_offset_seconds: 32400, timezone: 'Asia/Seoul',
  hourly_units: { time: 'iso8601', sea_level_height_msl: 'm' },
  hourly: { time: [], sea_level_height_msl: [] },
};
const localStart = Date.UTC(2026, 7, 14, 0, 0, 0);
for (let index = 0; index < 72; index += 1) {
  tideDocument.hourly.time.push(new Date(localStart + index * 3600_000).toISOString().slice(0, 16));
  tideDocument.hourly.sea_level_height_msl.push(fixture.tidePatternM[index % 24]);
}
const tidePolicy = { ...policy, forecastHorizonMinutes: 72 * 60 };
const tideObservations = tideDocument.hourly.time.flatMap((_, index) =>
  contract.normalizeOpenMeteoTidePoint(tideDocument,
    { index, nowMs, freshnessPolicy: tidePolicy }).observations);
assert.equal(tideObservations.length, 72);
assert.equal(tideObservations[0].datum, undefined);
assert.ok(tideObservations[0].qualityFlags.includes('DATUM_GLOBAL_MEAN_SEA_LEVEL'));
assert.equal(tideObservations.find(item => item.validFrom > fixture.now).freshness.usable, true);
const tideSummary = fishingDecision.summarizeTideObservations(tideObservations,
  { nowMs, utcOffsetSeconds: 32400 });
assert.equal(tideSummary.state, 'READY');
assert.equal(tideSummary.datum, 'GLOBAL_MEAN_SEA_LEVEL');
assert.equal(tideSummary.navigationUseAllowed, false);
assert.ok(tideSummary.next.length >= 1);

// 운영 safety adapter 계약: coverage가 승인되지 않으면 빈 화면을 비활성으로 만들지 않는다.
const uncoveredLightning = adapters.adaptOfficialLightning(fixture.lightningDocument, {
  lat: 35.1, lon: 129.1, nowMs, freshnessPolicy: policy,
});
assert.equal(uncoveredLightning.state, 'UNKNOWN');
assert.equal(uncoveredLightning.reason, 'COVERAGE_POLICY_UNAPPROVED');
const activeLightningEvidence = adapters.adaptOfficialLightning(fixture.lightningDocument, {
  lat: 35.1, lon: 129.1, radiusKm: 30, nowMs, freshnessPolicy: policy,
  coveragePolicy: fixture.lightningCoveragePolicy,
});
assert.equal(activeLightningEvidence.state, 'ACTIVE');
assert.equal(activeLightningEvidence.matches[0].source, 'JMA');
assert.equal(activeLightningEvidence.matches[0].observedAt, '2026-08-14T09:55:00.000Z');
assert.equal(adapters.parseOceanSafetyLocalTime('20260814185430'), '2026-08-14T09:54:30.000Z');
const inactiveLightningEvidence = adapters.adaptOfficialLightning(fixture.lightningDocument, {
  lat: 34.0, lon: 145.0, radiusKm: 10, nowMs, freshnessPolicy: policy,
  coveragePolicy: fixture.lightningCoveragePolicy,
});
assert.equal(inactiveLightningEvidence.state, 'INACTIVE');

const activeTyphoonEvidence = adapters.adaptOfficialTyphoon(fixture.typhoonDocument, {
  lat: 35.2, lon: 129.2, nowMs, freshnessPolicy: policy,
  coveragePolicy: fixture.typhoonCoveragePolicy,
});
assert.equal(activeTyphoonEvidence.state, 'ACTIVE');
assert.equal(activeTyphoonEvidence.reason, 'POINT_INSIDE_OFFICIAL_WIND_AREA');
const inactiveTyphoonEvidence = adapters.adaptOfficialTyphoon(fixture.typhoonDocument, {
  lat: 45, lon: 150, nowMs, freshnessPolicy: policy,
  coveragePolicy: fixture.typhoonCoveragePolicy,
});
assert.equal(inactiveTyphoonEvidence.state, 'INACTIVE');

// KHOA 위험 등급은 관측이지 입수 통제가 아니다.
const coastObservationEvidence = adapters.adaptOfficialClosure(fixture.coastObservationDocument, {
  spotId: 'FIXTURE_BEACH', lat: 35.1, lon: 129.1, nowMs, freshnessPolicy: policy,
  coveragePolicy: fixture.closureCoveragePolicy,
});
assert.equal(coastObservationEvidence.state, 'UNKNOWN');
assert.equal(coastObservationEvidence.reason, 'OBSERVATION_IS_NOT_CLOSURE');
const activeClosureEvidence = adapters.adaptOfficialClosure(fixture.closureDocument, {
  spotId: 'FIXTURE_BEACH', lat: 35.1, lon: 129.1, nowMs, freshnessPolicy: policy,
  coveragePolicy: fixture.closureCoveragePolicy,
});
assert.equal(activeClosureEvidence.state, 'CLOSED');
assert.equal(activeClosureEvidence.reason, 'OFFICIAL_CLOSURE_ACTIVE');

// OT-002: 조류 자료가 없을 때 조위나 다른 metric으로 유속을 만들지 않는다.
const activityInputs = contract.buildOceanActivityInputs([
  ...grid.observations,
  Object.freeze({
    schema: contract.OCEAN_OBSERVATION_SCHEMA,
    metric: contract.OCEAN_METRIC.TIDE_HEIGHT,
    value: 1.2, unit: 'm', provenance: 'FORECAST', quality: 'FRESH',
    observedAt: null, validFrom: '2026-08-14T09:30:00.000Z',
  }),
], [contract.OCEAN_METRIC.TIDE_HEIGHT, contract.OCEAN_METRIC.OCEAN_CURRENT_SPEED]);
assert.equal(activityInputs.inputs.TIDE_HEIGHT.value, 1.2);
assert.equal(activityInputs.inputs.OCEAN_CURRENT_SPEED.value, null);
assert.ok(activityInputs.missing.includes('OCEAN_CURRENT_SPEED'));

const freshEvidence = kind => ({
  kind, state: 'INACTIVE', official: true, sourceId: `fixture-${kind.toLowerCase()}`,
  freshness: { status: 'FRESH', usable: true }, observedAt: fixture.now,
});
const approvedWavePolicy = { status: 'APPROVED', thresholdM: 4, revision: 'fixture-v1' };

// OT-001: 공식 낙뢰가 활성 상태면 후보 점수보다 먼저 null과 CTA 차단이 적용된다.
const lightningGate = safety.evaluateOceanSafety({
  evidence: [
    { ...freshEvidence('LIGHTNING'), state: 'ACTIVE' },
    freshEvidence('TYPHOON'), freshEvidence('CLOSURE'),
  ],
  waveObservation: measuredWave,
  extremeWavePolicy: approvedWavePolicy,
});
assert.equal(lightningGate.state, 'BLOCKED');
assert.equal(lightningGate.safeClaimAllowed, false);
const lightningResult = safety.applyOceanSafetyGate({ candidateScore: 88, safety: lightningGate });
assert.equal(lightningResult.score, null);
assert.equal(lightningResult.grade, 'UNKNOWN');
assert.equal(lightningResult.departureCtaAllowed, false);

const adaptedGate = safety.evaluateOceanSafety({
  evidence: [activeLightningEvidence, inactiveTyphoonEvidence,
    { ...activeClosureEvidence, state: 'INACTIVE' }],
  waveObservation: measuredWave,
  extremeWavePolicy: approvedWavePolicy,
});
assert.equal(adaptedGate.state, 'BLOCKED');
assert.ok(adaptedGate.reasons.includes('LIGHTNING_ACTIVE'));

const staleCritical = safety.evaluateOceanSafety({
  evidence: [
    { ...freshEvidence('LIGHTNING'), freshness: { status: 'STALE', usable: false } },
    freshEvidence('TYPHOON'), freshEvidence('CLOSURE'),
  ],
  waveObservation: measuredWave,
  extremeWavePolicy: approvedWavePolicy,
});
assert.equal(staleCritical.state, 'UNKNOWN');
assert.equal(safety.applyOceanSafetyGate({ candidateScore: 70, safety: staleCritical }).score, null);

const noPolicy = safety.evaluateOceanSafety({
  evidence: [freshEvidence('LIGHTNING'), freshEvidence('TYPHOON'), freshEvidence('CLOSURE')],
  waveObservation: measuredWave,
  extremeWavePolicy: { status: 'DRAFT', thresholdM: 4 },
});
assert.equal(noPolicy.state, 'UNKNOWN');
assert.ok(noPolicy.reasons.includes('EXTREME_WAVE_POLICY_UNAPPROVED'));

const extremeWave = safety.evaluateOceanSafety({
  evidence: [freshEvidence('LIGHTNING'), freshEvidence('TYPHOON'), freshEvidence('CLOSURE')],
  waveObservation: { ...measuredWave, value: 4.5 },
  extremeWavePolicy: approvedWavePolicy,
});
assert.equal(extremeWave.state, 'BLOCKED');
assert.ok(extremeWave.reasons.includes('EXTREME_WAVE_ACTIVE'));

const clearEvidence = safety.evaluateOceanSafety({
  evidence: [freshEvidence('LIGHTNING'), freshEvidence('TYPHOON'), freshEvidence('CLOSURE')],
  waveObservation: measuredWave,
  extremeWavePolicy: approvedWavePolicy,
});
assert.equal(clearEvidence.state, 'NO_BLOCKING_EVIDENCE');
const gated = safety.applyOceanSafetyGate({ candidateScore: 72, safety: clearEvidence });
assert.equal(gated.score, 72);
assert.equal(gated.grade, 'GOOD');
assert.equal(gated.safeClaimAllowed, false);
assert.equal(gated.positiveRecommendationAllowed, false);
const nullScore = safety.applyOceanSafetyGate({ candidateScore: null, safety: clearEvidence });
assert.equal(nullScore.score, null);
assert.equal(nullScore.grade, 'UNKNOWN');
assert.equal(nullScore.departureCtaAllowed, false);

const fishingShadow = fishingDecision.buildFishingDecision({
  observations: [...point.observations, ...tideObservations],
  safety: clearEvidence, tideSummary, providerDisplayAllowed: false,
  spot: { id: 'fixture-fishing', label: 'fixture', kind: 'breakwater' },
});
assert.equal(fishingShadow.status, 'LOCAL_SHADOW');
assert.equal(fishingShadow.conditions.oceanCurrentSpeed.value, 0.5);
assert.equal(fishingShadow.catchForecast, null);
assert.equal(fishingShadow.biteScore, null);
assert.equal(fishingShadow.catchGuaranteeAllowed, false);
assert.equal(fishingShadow.departureCtaAllowed, false);
assert.equal(fishingShadow.currentInferredFromTide, false);

assert.equal(locationPolicy.validateOceanLocationPolicy(fixture.locationPolicy).valid, true);
const ownerLocation = locationPolicy.protectOceanLocation(
  { lat: 35.1234, lon: 129.1234, region: 'KR-26' },
  { audience: 'OWNER', consent: true, policy: fixture.locationPolicy });
assert.equal(ownerLocation.precision, 'EXACT');
assert.deepEqual(ownerLocation.coordinates, { lat: 35.1234, lon: 129.1234 });
const sharedLocation = locationPolicy.protectOceanLocation(
  { lat: 35.1234, lon: 129.1234, region: 'KR-26' },
  { audience: 'SHARED', consent: true, policy: fixture.locationPolicy });
assert.equal(sharedLocation.precision, 'BLURRED');
assert.notDeepEqual(sharedLocation.coordinates, ownerLocation.coordinates);
assert.equal(sharedLocation.exactStored, false);
const publicLocation = locationPolicy.protectOceanLocation(
  { lat: 35.1234, lon: 129.1234, region: 'KR-26' },
  { audience: 'PUBLIC', consent: true, policy: fixture.locationPolicy });
assert.equal(publicLocation.precision, 'REGION');
assert.equal(publicLocation.coordinates, null);
assert.equal(publicLocation.region, 'KR-26');
assert.equal(publicLocation.exifGpsAllowed, false);

const surfDocument = {
  latitude: 35.1, longitude: 129.1, location_id: 0,
  utc_offset_seconds: 32400, timezone: 'Asia/Seoul',
  hourly_units: {
    time: 'iso8601', wave_height: 'm', wave_direction: '°', wave_period: 's',
    swell_wave_height: 'm', swell_wave_direction: '°', swell_wave_period: 's',
    sea_surface_temperature: '°C', ocean_current_velocity: 'm/s',
    ocean_current_direction: '°',
  },
  hourly: { time: [], wave_height: [], wave_direction: [], wave_period: [],
    swell_wave_height: [], swell_wave_direction: [], swell_wave_period: [],
    sea_surface_temperature: [], ocean_current_velocity: [], ocean_current_direction: [] },
};
const surfLocalStart = Date.UTC(2026, 7, 14, 19, 0, 0);
for (let index = 0; index < 72; index += 1) {
  surfDocument.hourly.time.push(new Date(surfLocalStart + index * 3600_000).toISOString().slice(0, 16));
  surfDocument.hourly.wave_height.push(1.7);
  surfDocument.hourly.wave_direction.push(92);
  surfDocument.hourly.wave_period.push(10.8);
  surfDocument.hourly.swell_wave_height.push(1.3);
  surfDocument.hourly.swell_wave_direction.push(88);
  surfDocument.hourly.swell_wave_period.push(11.5);
  surfDocument.hourly.sea_surface_temperature.push(24.4);
  surfDocument.hourly.ocean_current_velocity.push(0.5);
  surfDocument.hourly.ocean_current_direction.push(40);
}
const surfObservations = surfDocument.hourly.time.flatMap((_, index) =>
  contract.normalizeOpenMeteoMarineHourlyPoint(surfDocument,
    { index, nowMs, freshnessPolicy: tidePolicy }).observations);
assert.equal(surfObservations.length, 72 * 9);
assert.equal(surfDecision.validateSurfScoringPolicy(surfPolicyDraft).valid, false);
const draftSurf = surfDecision.buildSurfDecision({ observations: surfObservations.slice(0, 9),
  safety: clearEvidence, spot: { id: 'fixture-surf', facingDeg: 90 }, skill: 'INTERMEDIATE',
  scoringPolicy: surfPolicyDraft, providerDisplayAllowed: false });
assert.equal(draftSurf.shadowScore, null);
assert.equal(draftSurf.decisionState, 'POLICY_UNAPPROVED');

assert.equal(surfDecision.validateSurfScoringPolicy(fixture.surfScoringPolicy).valid, true);
const readySurf = surfDecision.buildSurfDecision({ observations: surfObservations.slice(0, 9),
  safety: clearEvidence, spot: { id: 'fixture-surf', facingDeg: 90 }, skill: 'INTERMEDIATE',
  scoringPolicy: fixture.surfScoringPolicy, providerDisplayAllowed: false });
assert.equal(readySurf.status, 'LOCAL_SHADOW');
assert.equal(readySurf.displayScore, null);
assert.equal(readySurf.shadowScore, 90);
assert.equal(readySurf.explanation.length, 3);
assert.equal(readySurf.safeClaimAllowed, false);
assert.equal(readySurf.departureCtaAllowed, false);

const surfTimes = [...new Set(surfObservations.map(item => item.validFrom))];
const safetyByValidTime = Object.fromEntries(surfTimes.map(validAt => [validAt, clearEvidence]));
const surfTimeline = surfDecision.buildSurfTimeline({ observations: surfObservations,
  safetyByValidTime, spot: { id: 'fixture-surf', facingDeg: 90 }, skill: 'INTERMEDIATE',
  scoringPolicy: fixture.surfScoringPolicy, providerDisplayAllowed: false, fromMs: nowMs, hours: 72 });
assert.equal(surfTimeline.frames.length, 72);
assert.equal(surfTimeline.complete, true);
assert.equal(surfTimeline.missingSafetyFrames, 0);
assert.equal(surfTimeline.frames.every(frame => frame.shadowScore === 90), true);
const blockedSurf = surfDecision.buildSurfDecision({ observations: surfObservations.slice(0, 9),
  safety: lightningGate, spot: { id: 'fixture-surf', facingDeg: 90 }, skill: 'INTERMEDIATE',
  scoringPolicy: fixture.surfScoringPolicy, providerDisplayAllowed: false });
assert.equal(blockedSurf.decisionState, 'BLOCKED');
assert.equal(blockedSurf.shadowScore, null);

const shadowMarkup = shadow.renderOceanSafetyShadow({
  safety: lightningGate, gatedResult: lightningResult,
  observations: [measuredWave], lang: 'ko',
});
assert.match(shadowMarkup, /data-shadow-only="true"/);
assert.match(shadowMarkup, /data-public="false"/);
assert.match(shadowMarkup, /WAVE_HEIGHT/);
assert.match(shadowMarkup, /fixture-22101|kma-marine-observation/);
assert.match(shadowMarkup, /2026-08-14T09:50:00.000Z/);
assert.doesNotMatch(shadowMarkup, /안전합니다|출발하세요|입수 가능/);

assert.doesNotMatch(contractSource + safetySource + adapterSource + shadowSource
  + fishingSource + locationSource + surfSource,
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);

console.log('PASS: Ocean Core/Fishing/Surf contracts, 72h timeline, official safety adapters, location privacy, OT-001/002, stale and extreme-wave gates');
