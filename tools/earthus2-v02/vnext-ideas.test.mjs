import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_STATE, EVIDENCE_KIND, THERMAL_STATE, VISUAL_ENGINE } from '../../prototype/js/earthus2/v02/core/constants.js';
import { compileFailSoftScene } from '../../prototype/js/earthus2/v02/core/fail-soft-scene.js';
import { buildTrustLedger } from '../../prototype/js/earthus2/v02/core/trust-ledger.js';
import { proceduralCloudDetailPlan } from '../../prototype/js/earthus2/v02/cloud/procedural-detail.js';
import { buildReplayRehydrationPlan } from '../../prototype/js/earthus2/v02/storage/replay-rehydration.js';
import { buildOfflineTripPackPlan } from '../../prototype/js/earthus2/v02/paid/offline-trip-pack.js';

test('fail-soft flow never invents direction', () => {
  const plan = compileFailSoftScene({ requestedEngine: VISUAL_ENGINE.FLOW, dataState: DATA_STATE.LIVE, vectorAvailable: false, fallbackFieldAvailable: true });
  assert.equal(plan.activeEngine, VISUAL_ENGINE.FIELD);
  assert.equal(plan.mode, 'SCALAR_FIELD_FALLBACK');
  assert.equal(plan.dataReplacementAllowed, false);
});

test('fail-soft tower becomes aggregate cluster without actual grid', () => {
  const plan = compileFailSoftScene({ requestedEngine: VISUAL_ENGINE.TOWER, dataState: DATA_STATE.LIVE, actualSpatialGrid: false });
  assert.equal(plan.activeEngine, VISUAL_ENGINE.BEACON);
  assert.equal(plan.reason, 'ACTUAL_SPATIAL_GRID_UNAVAILABLE');
});

test('official safety remains visible when domain data is unavailable', () => {
  const plan = compileFailSoftScene({ requestedEngine: VISUAL_ENGINE.PULSE, dataState: DATA_STATE.UNAVAILABLE, officialSafety: true });
  assert.equal(plan.mode, 'OFFICIAL_SAFETY_ONLY');
});

test('trust ledger marks counter-balanced output contested', () => {
  const ledger = buildTrustLedger({
    outputId: 'claim-1', label: 'rain timing',
    evidence: [{ sourceId: 'KMA', evidenceKind: EVIDENCE_KIND.OFFICIAL_FORECAST, forecastAt: '2026-08-27T00:00:00Z', confidence: 0.7 }],
    counterEvidence: [{ sourceId: 'ECMWF', evidenceKind: EVIDENCE_KIND.EARTHUS_ANALYSIS, forecastAt: '2026-08-27T00:00:00Z', confidence: 0.6 }],
  });
  assert.equal(ledger.status, 'CONTESTED');
});

test('procedural cloud detail is deterministic and visual-only', () => {
  const input = { tileId: 'asia/10/12/3', validAt: '2026-08-26T00:00:00Z', confidence: 0.8, uncertainty: 0.2 };
  const a = proceduralCloudDetailPlan(input);
  const b = proceduralCloudDetailPlan(input);
  assert.equal(a.seed, b.seed);
  assert.equal(a.meteorologicalMeaning, 'NONE_VISUAL_ONLY');
  assert.equal(a.mayChangeCoverage, false);
});

test('long-range procedural cloud detail is reduced', () => {
  const near = proceduralCloudDetailPlan({ tileId: 'x', validAt: '2026-08-26T00:00:00Z', confidence: 0.8, uncertainty: 0.2, horizonHours: 12 });
  const far = proceduralCloudDetailPlan({ tileId: 'x', validAt: '2026-08-26T00:00:00Z', confidence: 0.8, uncertainty: 0.2, horizonHours: 200 });
  assert.ok(near.detailBudget > far.detailBudget);
});

test('replay rehydration never serves NAS directly', () => {
  const plan = buildReplayRehydrationPlan({
    archiveManifest: { archiveId: 'arc-1', schemaVersion: '2', processorVersion: 'p1', chunks: [{ chunkId: 'c1', region: 'asia', fromAt: '2026-08-01T00:00:00Z', toAt: '2026-08-01T03:00:00Z' }] },
    requestedRegion: 'asia', fromAt: '2026-08-01T01:00:00Z', toAt: '2026-08-01T02:00:00Z', targetSchemaVersion: '2', supportedProcessorVersions: ['p1'],
  });
  assert.equal(plan.allowed, true);
  assert.equal(plan.directNasServing, false);
  assert.ok(plan.steps.includes('PUBLISH_CLOUDFRONT_TEMP'));
});

test('replay rehydration blocks incompatible processor', () => {
  const plan = buildReplayRehydrationPlan({
    archiveManifest: { archiveId: 'arc-1', schemaVersion: '2', processorVersion: 'old', chunks: [] },
    requestedRegion: 'asia', fromAt: '2026-08-01T01:00:00Z', toAt: '2026-08-01T02:00:00Z', supportedProcessorVersions: ['p1'],
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reason, 'PROCESSOR_VERSION_UNSUPPORTED');
});

test('offline trip pack always prioritizes safety', () => {
  const plan = buildOfflineTripPackPlan({
    tripId: 't1', countryId: 'KR', startAt: '2026-09-01T00:00:00Z', endAt: '2026-09-03T00:00:00Z', maxBytes: 150,
    assets: [
      { id: 'media', kind: 'MEDIA', bytes: 100 },
      { id: 'warning', kind: 'SAFETY', bytes: 80 },
      { id: 'weather', kind: 'WEATHER', bytes: 60 },
    ],
  });
  assert.equal(plan.allowed, true);
  assert.ok(plan.assetIds.includes('warning'));
  assert.equal(plan.safetyAlwaysIncluded, true);
});

test('free offline trip pack excludes premium intelligence', () => {
  const plan = buildOfflineTripPackPlan({
    tripId: 't1', countryId: 'GB', startAt: '2026-09-01T00:00:00Z', endAt: '2026-09-03T00:00:00Z',
    assets: [
      { id: 'warning', kind: 'SAFETY', bytes: 10 },
      { id: 'why', kind: 'INTELLIGENCE', bytes: 10, premium: true },
    ],
  });
  assert.deepEqual([...plan.assetIds], ['warning']);
});
