import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPUTE_CLASSES,
  createComputePolicyRegistry,
} from '../../prototype/v2/js/v52/compute-policy-registry.js';
import { resolveIntelligenceLod } from '../../prototype/v2/js/v52/intelligence-lod-policy.js';
import { SingleFlight } from '../../aws/materialized-earth/lib/singleflight.mjs';
import {
  MaterializedEarthService,
  MemoryMaterializedStore,
} from '../../aws/materialized-earth/lib/materialized-earth-service.mjs';
import { DependencyIndex } from '../../aws/materialized-earth/lib/dependency-invalidation.mjs';
import {
  buildEarthVersion,
  diffEarthVersions,
} from '../../aws/materialized-earth/lib/earth-version-diff.mjs';
import { ComputeTelemetry } from '../../aws/materialized-earth/lib/compute-telemetry.mjs';
import { calculateDirectInfraCost } from '../../aws/materialized-earth/lib/compute-cost-ledger.mjs';
import { planCapacity } from '../../aws/materialized-earth/lib/capacity-planner.mjs';
import { routeWorkload } from '../../aws/materialized-earth/lib/workload-router.mjs';
import {
  buildPrivateCacheKey,
  buildSharedCacheKey,
  projectPrivate,
} from '../../aws/materialized-earth/lib/shared-private-projection.mjs';

const publicWeatherPolicy = {
  capabilityId: 'weather.region.snapshot',
  ownerEngineIds: ['FND-017', 'BCK-029'],
  computeClass: 'C1_MATERIALIZED_SHARED',
  scopeLevels: ['COUNTRY', 'REGION'],
  ttlSeconds: 900,
  freshnessHalfLifeSeconds: 1800,
  staleWhileRevalidateSeconds: 1800,
  maxStaleSeconds: 7200,
  dependencyKeys: ['provider:KMA:forecast:*'],
  shareScope: 'PUBLIC',
  cacheKeyFields: [
    'capabilityId', 'spatialKey', 'targetTimeBucket', 'dataRevision', 'policyVersion',
  ],
  estimatedCostClass: 'LOW',
  maxRuntimeMs: 2000,
  maxResultBytes: 65536,
  fallbackMode: 'LAST_GOOD',
  truthRestrictions: ['PRIVATE_FIELDS_FORBIDDEN'],
  policyVersion: '5.2.0',
};

test('global free first load cannot plan C3-C5 work', () => {
  const registry = createComputePolicyRegistry([
    publicWeatherPolicy,
    { ...publicWeatherPolicy, capabilityId: 'weather.deep', computeClass: 'C3_SHARED_DEEP' },
  ]);
  const result = registry.plan('weather.deep', {
    spatialKey: 'GLOBAL', targetTimeBucket: '2026-08-31T00', dataRevision: 'r1',
  }, { globalFirstLoad: true, planClass: 'FREE' });
  assert.equal(result.computeCeiling, 'C1_MATERIALIZED_SHARED');
  assert.equal(result.computeAllowed, false);
  assert.equal(result.fallbackMode, 'LAST_GOOD');
  assert.ok(!result.cacheKey.includes('user'));
});

test('public compute policy rejects private cache dimensions', () => {
  assert.throws(() => createComputePolicyRegistry([{
    ...publicWeatherPolicy,
    cacheKeyFields: [...publicWeatherPolicy.cacheKeyFields, 'userId'],
  }]), /PUBLIC_POLICY_PRIVATE_FIELD/);
});

test('camera motion caps intelligence independently from visual quality', () => {
  const moving = resolveIntelligenceLod({
    spatialScope: 'REGION', temporalClass: 'T1', requestedDepth: 'I4_PERSONAL',
    visualTier: 'V3_FULL', cameraState: 'MOVING', planClass: 'PAID',
  });
  assert.equal(moving.visualTier, 'V3_FULL');
  assert.equal(moving.computeCeiling, 'C1_MATERIALIZED_SHARED');
  assert.equal(moving.allowDeepCompute, false);
  const stable = resolveIntelligenceLod({
    spatialScope: 'REGION', temporalClass: 'T1', requestedDepth: 'I3_DEEP_SHARED',
    visualTier: 'V1_LITE', cameraState: 'STABLE', planClass: 'PAID',
  });
  assert.equal(stable.computeCeiling, 'C3_SHARED_DEEP');
  assert.equal(stable.visualTier, 'V1_LITE');
});

test('100 identical requests execute one SingleFlight leader', async () => {
  const group = new SingleFlight();
  let executions = 0;
  const results = await Promise.all(Array.from({ length: 100 }, () => group.run('same', async () => {
    executions += 1;
    await new Promise(resolve => setTimeout(resolve, 15));
    return Object.freeze({ version: 'artifact-v1' });
  })));
  assert.equal(executions, 1);
  assert.equal(group.metrics().leaders, 1);
  assert.equal(group.metrics().followers, 99);
  assert.ok(results.every(result => result === results[0]));
});

test('materialized publish is immutable and failed rebuild retains last-good', async () => {
  const store = new MemoryMaterializedStore();
  const service = new MaterializedEarthService({ store, now: () => '2026-08-31T00:00:00.000Z' });
  const spec = {
    productType: 'REGION_SNAPSHOT', spatialScope: 'REGION', spatialKey: 'KR-26',
    targetTime: '2026-08-31T00:00:00.000Z', schemaVersion: 'earthus.materialized.v5.2',
    policyVersion: '5.2.0', modelVersion: 'official-cache', dataRevision: 'kma-r17',
    dependencies: ['provider:KMA:forecast:KR-26:r17'], shareScope: 'PUBLIC',
    truthState: 'OFFICIAL_FORECAST', sourceRefs: ['KMA_FORECAST'],
    payload: { summary: { precipitationState: 'OBSERVED_NONE_REPORTED' } },
  };
  const first = await service.publish(spec);
  const second = await service.publish(spec);
  assert.equal(first.artifactId, second.artifactId);
  assert.equal(store.artifacts.size, 1);
  assert.equal((await service.readCurrent('REGION_SNAPSHOT', 'KR-26')).artifactId, first.artifactId);
  await assert.rejects(() => service.publish({ ...spec, dataRevision: 'kma-r18', payload: { privateRoute: 'x' } }), /PUBLIC_ARTIFACT_PRIVATE_FIELD/);
  assert.equal((await service.readCurrent('REGION_SNAPSHOT', 'KR-26')).artifactId, first.artifactId);
});

test('revision invalidation rebuilds only dependent products and ignores no-op revisions', () => {
  const index = new DependencyIndex();
  index.register('kr26-weather', ['provider:KMA:forecast:KR-26']);
  index.register('seoul-crowd', ['provider:SEOUL:crowd:SEOUL']);
  const changed = index.invalidate({
    dependencyKey: 'provider:KMA:forecast:KR-26', oldRevision: 'r17', newRevision: 'r18',
  });
  assert.deepEqual(changed.affectedArtifactKeys, ['kr26-weather']);
  assert.equal(changed.fanout, 1);
  assert.equal(index.invalidate({
    dependencyKey: 'provider:KMA:forecast:KR-26', oldRevision: 'r18', newRevision: 'r18',
  }).fanout, 0);
});

test('Earth Diff traverses only changed content-addressed leaves', () => {
  const before = buildEarthVersion({
    parentVersion: null,
    artifacts: { 'KR-26/weather': 'sha256:a', 'KR-11/crowd': 'sha256:b' },
  });
  const after = buildEarthVersion({
    parentVersion: before.earthVersion,
    artifacts: { 'KR-26/weather': 'sha256:c', 'KR-11/crowd': 'sha256:b' },
  });
  const diff = diffEarthVersions(before, after);
  assert.deepEqual(diff.changes, [{ key: 'KR-26/weather', from: 'sha256:a', to: 'sha256:c' }]);
  assert.equal(diff.visitedLeaves, 1);
});

test('telemetry rejects PII and counts leaders separately from followers', () => {
  const telemetry = new ComputeTelemetry({ maxEvents: 10 });
  telemetry.emit('compute.singleflight_leader', { computeClass: 'C3_SHARED_DEEP', runtimeMs: 40 });
  telemetry.emit('compute.singleflight_follower', { computeClass: 'C3_SHARED_DEEP', runtimeMs: 0 });
  assert.throws(() => telemetry.emit('compute.plan', { userId: 'person-1' }), /TELEMETRY_PII_FIELD/);
  assert.deepEqual(telemetry.summary(), {
    events: 2, dropped: 0, leaders: 1, followers: 1, executions: 1,
  });
});

test('cost ledger keeps unknown rates unknown instead of inventing cost', () => {
  const measured = {
    cpuCoreSeconds: 10, gpuSeconds: 0, memoryGbSeconds: 5, storageGbHours: 0,
    storageOps: 0, egressGb: 1, providerApiUnits: 2, llmInputTokens: 0,
    llmOutputTokens: 0, otherMeteredRuntimeCost: 0,
  };
  const known = calculateDirectInfraCost(measured, {
    version: 'rates-1', currency: 'USD', cpuCoreSecond: 0.01, gpuSecond: 0.1,
    memoryGbSecond: 0.001, storageGbHour: 0.001, storageOp: 0.0001,
    egressGb: 0.1, providerApiUnit: 0.02, llmInputToken: 0.000001,
    llmOutputToken: 0.000002,
  });
  assert.equal(known.status, 'MEASURED');
  assert.equal(known.total, 0.245);
  const unknown = calculateDirectInfraCost(measured, { version: 'rates-empty', currency: 'USD' });
  assert.equal(unknown.status, 'INSUFFICIENT_RATE_DATA');
  assert.equal(unknown.total, null);
});

test('GPU routing requires benchmark advantage and CPU-only stays valid', () => {
  assert.equal(routeWorkload({ computeClass: 'C1_MATERIALIZED_SHARED', gpuAvailable: true }).backend, 'CPU');
  assert.equal(routeWorkload({ computeClass: 'C3_SHARED_DEEP', gpuAvailable: false }).backend, 'CPU');
  assert.equal(routeWorkload({
    computeClass: 'C3_SHARED_DEEP', gpuAvailable: true, gpuEligible: true,
    benchmark: { cpuRuntimeMs: 4000, gpuRuntimeMs: 800, cpuCostUnits: 4, gpuCostUnits: 1.5 },
  }).backend, 'GPU');
});

test('capacity recommendation uses measured bottleneck instead of user count', () => {
  assert.equal(planCapacity({
    materializedHitRate: 0.35, cacheTarget: 0.8, providerConstrained: false,
    cpuPressure: true, gpuEligiblePressure: false,
  }).recommendation, 'SOFTWARE_OPTIMIZATION_FIRST');
  assert.equal(planCapacity({
    materializedHitRate: 0.9, cacheTarget: 0.8, providerConstrained: true,
    cpuPressure: true, gpuEligiblePressure: true,
  }).recommendation, 'PROVIDER_PLAN_REVIEW');
});

test('shared and private projection keys cannot leak raw principal context', async () => {
  const shared = buildSharedCacheKey({
    capabilityId: 'typhoon.impact', spatialKey: 'KR-26', targetTimeBucket: '2026-08-31T00',
    dataRevision: 'r18', modelVersion: 'm1', policyVersion: '5.2.0',
  });
  assert.ok(!shared.includes('user-a'));
  const privateKey = buildPrivateCacheKey({
    sharedBaseHash: shared, principalScope: 'user-a', minimizedContext: { selectedPlaceIds: ['place-1'] },
    entitlementVersion: 'paid-v1', policyVersion: '5.2.0',
  });
  assert.ok(!privateKey.includes('user-a'));
  assert.ok(!privateKey.includes('place-1'));
  const projected = await projectPrivate({
    sharedBase: Object.freeze({ artifactId: 'base-1', value: 7 }),
    minimizedContext: { selectedPlaceIds: ['place-1'] },
    entitlement: { allowed: true, principalScope: 'user-a' },
    projector: ({ sharedBase }) => ({ exposure: sharedBase.value + 1 }),
  });
  assert.deepEqual(projected.result, { exposure: 8 });
  assert.equal(projected.cacheControl, 'private, no-store');
  await assert.rejects(() => projectPrivate({
    sharedBase: { artifactId: 'base-1' }, minimizedContext: {}, entitlement: { allowed: false },
    projector: () => ({}),
  }), /ENTITLEMENT_REQUIRED/);
});

test('compute class order remains C0 through C5', () => {
  assert.deepEqual(COMPUTE_CLASSES.map(item => item.id), [
    'C0_STATIC_BASELINE', 'C1_MATERIALIZED_SHARED', 'C2_EVENT_DELTA',
    'C3_SHARED_DEEP', 'C4_PREMIUM_PROJECTION', 'C5_PREMIUM_SCENARIO',
  ]);
});
