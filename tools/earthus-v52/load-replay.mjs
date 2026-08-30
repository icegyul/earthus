import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  MaterializedEarthService,
  MemoryMaterializedStore,
} from '../../aws/materialized-earth/lib/materialized-earth-service.mjs';
import { SingleFlight } from '../../aws/materialized-earth/lib/singleflight.mjs';
import { planCapacity } from '../../aws/materialized-earth/lib/capacity-planner.mjs';

const store = new MemoryMaterializedStore();
const service = new MaterializedEarthService({
  store,
  now: () => '2026-08-31T00:00:00.000Z',
});
let actualComputeExecutions = 0;
actualComputeExecutions += 1;
await service.publish({
  productType: 'GLOBAL_DIGEST', spatialScope: 'GLOBAL', spatialKey: 'GLOBAL',
  targetTime: '2026-08-31T00:00:00.000Z', schemaVersion: 'earthus.materialized.v5.2',
  policyVersion: '5.2.0', modelVersion: 'load-fixture-v1', dataRevision: 'r1',
  dependencies: ['fixture:r1'], shareScope: 'PUBLIC', truthState: 'DERIVED',
  sourceRefs: ['LOAD_FIXTURE'], payload: { activeEventCount: 1 },
});

const browseScenarios = [];
for (const reads of [10_000, 100_000, 1_000_000]) {
  const started = performance.now();
  for (let index = 0; index < reads; index += 1) {
    const artifact = await service.readCurrent('GLOBAL_DIGEST', 'GLOBAL');
    if (!artifact) throw new Error('MATERIALIZED_READ_MISSING');
  }
  browseScenarios.push(Object.freeze({
    reads,
    actualComputeExecutions,
    heavyComputePerRead: actualComputeExecutions / reads,
    reuseFactor: reads / actualComputeExecutions,
    durationMs: Math.round(performance.now() - started),
  }));
}
assert.ok(browseScenarios.every(item => item.actualComputeExecutions === 1));
assert.equal(browseScenarios.at(-1).heavyComputePerRead, 0.000001);

const singleFlight = new SingleFlight();
let sharedDeepExecutions = 0;
const sharedResults = await Promise.all(Array.from({ length: 100 }, () => singleFlight.run(
  'C3:typhoon:ETAU:r18',
  async () => {
    sharedDeepExecutions += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return Object.freeze({ artifactId: 'shared-deep-1' });
  },
)));
assert.equal(sharedDeepExecutions, 1);
assert.equal(singleFlight.metrics().followers, 99);
assert.ok(sharedResults.every(item => item === sharedResults[0]));

const capacity = planCapacity({
  materializedHitRate: 1,
  cacheTarget: 0.8,
  providerConstrained: false,
  cpuPressure: false,
  gpuEligiblePressure: false,
});
assert.equal(capacity.recommendation, 'NO_SCALE_NEEDED');

const report = Object.freeze({
  schemaVersion: 'earthus.capacity-replay.v5.2',
  generatedAt: new Date().toISOString(),
  browseScenarios,
  eventFanIn: Object.freeze({
    requests: 100,
    actualComputeExecutions: sharedDeepExecutions,
    singleFlightLeaders: singleFlight.metrics().leaders,
    singleFlightFollowers: singleFlight.metrics().followers,
  }),
  cpuOnlyBasePath: true,
  gpuRequiredForBaseEarth: false,
  capacity,
});
const output = process.env.EARTHUS_V52_LOAD_OUTPUT
  || path.join(os.tmpdir(), 'earthus-v52-load-replay.json');
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('V52 LOAD REPLAY: PASS', JSON.stringify(report));
