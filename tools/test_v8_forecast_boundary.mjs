import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/v8/forecast-boundary.js', import.meta.url), 'utf8');
const fc = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const official = fc.buildOfficialForecast({
  revisionId: 'official_1', variable: 'temperature', value: 27, unit: 'Cel',
  issuedAt: '2026-08-21T00:00:00Z', validAt: '2026-08-21T03:00:00Z', sourceRefs: ['src_kma'],
});
assert.equal(official.accessClass, 'PUBLIC');
assert.equal(official.dataClass, 'OFFICIAL_FORECAST');
assert.equal('confidence' in official, false);
assert.deepEqual(fc.servePublicForecast([official]), {
  status: 200, accessClass: 'PUBLIC', outputs: [official],
});

const premiumThatMustNeverReachThePublicClient = {
  revisionId: 'private_revision', dataClass: 'EARTHUS_DERIVED', accessClass: 'PREMIUM',
  releaseState: 'RELEASED', confidence: { label: 'MEDIUM' },
};
assert.deepEqual(fc.servePublicForecast([official, premiumThatMustNeverReachThePublicClient]), {
  status: 500, code: 'PREMIUM_PAYLOAD_REACHED_PUBLIC_BOUNDARY', outputs: [],
});
assert.doesNotMatch(source, /profile|ENTITLEMENT_REQUIRED|surface\s*===?\s*['"]PREMIUM/,
  'browser code must not pretend to authorize premium forecast access');
console.log('EARTHUS v8 forecast boundary: PASS');
