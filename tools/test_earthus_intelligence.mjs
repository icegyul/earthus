#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/earthus-intelligence.js', import.meta.url), 'utf8');
const intelligence = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const tenant = { tenantId: 'tenant_a', subjectTenantId: 'tenant_a', scopes: ['intelligence:read'] };
const signal = (id, domain, at, rights = { display: true, intelligence: true, export: false }) => ({
  signalId: id, domain, sourceId: `source_${domain}`, sourceUrl: `https://example.org/${domain}`,
  observedAt: at, receivedAt: '2026-08-14T00:11:00Z', revision: `rev_${id}`,
  regionRef: 'kr-seoul', kind: 'OBSERVATION', unit: domain === 'WEATHER' ? 'mm/h' : null,
  sampleCount: 1, missingCount: 0, quality: { state: 'HEALTHY' }, rights,
});
const input = {
  region: { regionRef: 'kr-seoul', label: '서울' },
  window: { startAt: '2026-08-14T00:00:00Z', endAt: '2026-08-14T00:30:00Z' },
  evaluatedAt: '2026-08-14T00:31:00Z', tenantContext: tenant,
  signals: [signal('weather-1', 'WEATHER', '2026-08-14T00:05:00Z'),
    signal('warning-1', 'OFFICIAL_WARNING', '2026-08-14T00:10:00Z')],
};

assert.deepEqual(intelligence.validateIntelligencePolicy(), { valid: true, errors: [] });
const result = intelligence.composeSignalCooccurrence(input);
assert.equal(result.status, 'SHADOW_EVIDENCE_READY');
assert.equal(result.signalCount, 2);
assert.deepEqual(result.domains, ['OFFICIAL_WARNING', 'WEATHER']);
assert.match(result.statement, /2개 영역의 2개 근거 신호/);
assert.equal(result.inference, null);
assert.equal(result.action, null);
assert.equal(result.public, false);
assert.equal(result.billable, false);
assert.equal(result.exportAuthorized, false);
assert.equal(result.costAttribution.tenantId, 'tenant_a');
assert.equal(result.costAttribution.estimatedCost, null);
assert.equal(intelligence.composeSignalCooccurrence({ ...input, signals: [...input.signals].reverse() }).bundleId,
  result.bundleId, 'input ordering must not change bundle identity');

assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  tenantContext: { ...tenant, subjectTenantId: 'tenant_b' } }), /CROSS_TENANT_DENIED/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  tenantContext: { ...tenant, scopes: [] } }), /INTELLIGENCE_SCOPE_REQUIRED/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  signals: [input.signals[0], { ...input.signals[1], cause: 'weather-1' }] }), /UNSUPPORTED_INFERENCE_FIELD/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  signals: [input.signals[0], { ...input.signals[1], observedAt: '2026-08-14T00:10:00' }] }), /SIGNAL_EVIDENCE_INCOMPLETE/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  signals: [input.signals[0], { ...input.signals[1], regionRef: 'kr-busan' }] }), /SIGNAL_REGION_MISMATCH/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  signals: [input.signals[0], signal('late', 'AIR', '2026-08-14T01:00:00Z')] }), /SIGNAL_OUTSIDE_WINDOW/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  signals: [input.signals[0], signal('weather-2', 'WEATHER', '2026-08-14T00:10:00Z')] }), /CROSS_DOMAIN_EVIDENCE_REQUIRED/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  signals: [input.signals[0], signal('blocked', 'AIR', '2026-08-14T00:10:00Z',
    { display: true, intelligence: false, export: false })] }), /SIGNAL_POLICY_BLOCKED/);
assert.throws(() => intelligence.authorizeIntelligenceExport({ bundle: result, tenantContext: tenant }),
  /EXPORT_POLICY_BLOCKED/);
assert.throws(() => intelligence.composeSignalCooccurrence({ ...input,
  policy: { ...intelligence.INTELLIGENCE_POLICY, saleApproved: true } }), /UNAPPROVED_POLICY_ESCALATION/);
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame|navigator\./,
  'shadow fusion must not own network, device, or render capability');
for (const forbidden of ['cause', 'path', 'arrival', 'damage', 'probability']) {
  assert.ok(intelligence.INTELLIGENCE_FORBIDDEN_KEYS.includes(forbidden));
}

console.log('Earthus Intelligence shadow: 28/28 passed');
