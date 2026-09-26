import assert from 'node:assert/strict';
import {
  createSimulationPlan,
  evaluateDataReadiness,
  canRunSimulation,
  createSimulationJob,
  snapshotReproducibility,
} from './research-simulation.js';

const plan = createSimulationPlan({
  question: '서울 한강 주변에 강한 비가 내릴 때 침수범위가 어떻게 변하는가?',
  hypothesis: '강우량 증가에 따라 침수범위와 최대수심이 증가한다.',
  domain: 'FLOOD',
  aoi: { type: 'bbox', west: 126.75, south: 37.45, east: 127.15, north: 37.65 },
  timeWindow: { start: '2026-07-01T00:00:00Z', end: '2026-07-01T06:00:00Z' },
  model: { id: 'lisflood-fp' },
});

const blocked = evaluateDataReadiness([]);
assert.equal(blocked.status, 'BLOCKED');
assert.equal(canRunSimulation(plan, blocked).allowed, false);

const ready = evaluateDataReadiness([
  'coverage', 'crs', 'verticalDatum', 'resolution', 'temporal',
  'nodata', 'units', 'quality', 'version', 'license',
].map(gate => ({ gate, status: 'PASS', message: 'ok' })));

assert.equal(ready.status, 'READY');
assert.equal(canRunSimulation(plan, ready).allowed, true);

const job = createSimulationJob(plan, ready, {
  computeEstimate: { gpuMinutes: 12, storageMb: 850 },
  approvalToken: 'test-approval',
});
assert.equal(job.status, 'QUEUED');
assert.equal(job.model.id, 'lisflood-fp');

const repro = snapshotReproducibility(job, {
  workerImageDigest: 'sha256:test',
  modelCommit: 'test-commit',
  randomSeed: 42,
});
assert.equal(repro.runtime.randomSeed, 42);
assert.equal(repro.model.id, 'lisflood-fp');

console.log('research-simulation foundation: PASS');
