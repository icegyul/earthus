import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/v8/source-registry.js', import.meta.url), 'utf8');
const { SourceRegistry } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const registry = new SourceRegistry({ now: () => '2026-08-21T01:00:00Z' });
const allRights = { display: true, cache: true, history: true, derivative: true, redistribution: false, paidExport: false, apiResale: false, aiUse: false };
registry.register({
  schemaVersion: '8.0', sourceRef: 'src_observation', provider: { name: 'Official Sensor', dataset: 'Minute observations' },
  dataClass: 'OBSERVED', operationState: 'OPERATING',
  times: { observedAt: '2026-08-21T00:58:00Z', issuedAt: null, validAt: null, receivedAt: '2026-08-21T00:58:30Z' },
  rights: allRights, freshnessSeconds: 300,
});
registry.register({
  schemaVersion: '8.0', sourceRef: 'src_model', provider: { name: 'Model Agency', dataset: 'Ocean current model' },
  dataClass: 'MODEL_OUTPUT', operationState: 'SHADOW',
  times: { observedAt: null, issuedAt: '2026-08-20T18:00:00Z', validAt: '2026-08-21T00:00:00Z', receivedAt: '2026-08-20T18:05:00Z' },
  rights: { ...allRights, derivative: false }, freshnessSeconds: 21600,
});

assert.equal(registry.evaluateOperation('src_observation', 'display').state, 'ALLOWED');
assert.equal(registry.evaluateOperation('src_model', 'derivative').state, 'BLOCKED_RIGHTS');
assert.equal(registry.evaluateOperation('src_missing', 'display').state, 'UNKNOWN_SOURCE');

const summary = registry.summarize(['src_observation', 'src_model']);
assert.equal(summary.sourceCount, 2);
assert.equal(summary.oldestReferenceAt, '2026-08-20T18:00:00Z');
assert.equal(summary.staleCount, 1);
assert.deepEqual(summary.operationStates, ['OPERATING', 'SHADOW']);
assert.equal('rights' in summary, false, 'compact dock summary must not expose the technical rights matrix');

registry.register({
  schemaVersion: '8.0', sourceRef: 'src_model', provider: { name: 'Model Agency', dataset: 'Ocean current model revision 2' },
  dataClass: 'MODEL_OUTPUT', operationState: 'SHADOW',
  times: { observedAt: null, issuedAt: '2026-08-21T00:00:00Z', validAt: '2026-08-21T01:00:00Z', receivedAt: '2026-08-21T00:05:00Z' },
  rights: { ...allRights, derivative: false }, freshnessSeconds: 21600,
});
assert.equal(registry.history('src_model').length, 2, 'source revisions remain inspectable');
assert.throws(() => registry.evaluateOperation('src_model', 'secretExport'), /unknown operation/);

console.log('EARTHUS v8 source registry: PASS');
