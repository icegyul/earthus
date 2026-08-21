import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/v8/entitlement-contract.js', import.meta.url), 'utf8');
const entitlement = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

assert.deepEqual(entitlement.evaluatePublicAccess({ accessClass: 'ALWAYS_FREE_SAFETY' }), { allowed: true, reason: 'SAFETY_ALWAYS_FREE' });
assert.deepEqual(entitlement.evaluatePublicAccess({ accessClass: 'PUBLIC' }), { allowed: true, reason: 'PUBLIC' });
assert.deepEqual(entitlement.evaluatePublicAccess({ accessClass: 'PREMIUM' }), { allowed: false, reason: 'SERVER_ENTITLEMENT_REQUIRED' });
assert.doesNotMatch(source, /profile|capabilities|expiresAt|subjectId/,
  'browser access code must not authorize premium data from client state');

const publicOfficial = { dataClass: 'OFFICIAL_FORECAST', accessClass: 'PUBLIC', payload: { value: 27 } };
assert.equal(entitlement.enforceResponseBoundary(publicOfficial, { surface: 'PUBLIC' }), publicOfficial);
assert.throws(() => entitlement.enforceResponseBoundary({ dataClass: 'EARTHUS_DERIVED', accessClass: 'PREMIUM', payload: { value: 26.4 } }, { surface: 'PUBLIC' }), /PREMIUM_PAYLOAD_ON_PUBLIC_SURFACE/);
assert.throws(() => entitlement.enforceResponseBoundary({ dataClass: 'OFFICIAL_WARNING', accessClass: 'PREMIUM', payload: {} }, { surface: 'PREMIUM' }), /SAFETY_MUST_BE_ALWAYS_FREE/);
assert.throws(() => entitlement.enforceResponseBoundary(publicOfficial, { surface: 'PREMIUM' }), /SERVER_ONLY_SURFACE/);

console.log('EARTHUS v8 entitlement contract: PASS');
