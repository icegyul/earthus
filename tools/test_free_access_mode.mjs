#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [accessModeSource, localConfig, exampleConfig, store, billing] = await Promise.all([
  readFile(path.join(root, 'prototype/js/access-mode.js'), 'utf8'),
  readFile(path.join(root, 'prototype/js/config.local.js'), 'utf8'),
  readFile(path.join(root, 'prototype/js/config.local.example.js'), 'utf8'),
  readFile(path.join(root, 'prototype/js/store.js'), 'utf8'),
  readFile(path.join(root, 'prototype/js/billing.js'), 'utf8'),
]);
const { decideCapabilityAccess, isFreeOpenMode, normalizeMonetizationMode,
  salesAllowed, subscriptionUiAllowed } = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(accessModeSource)}`);

assert.equal(normalizeMonetizationMode(undefined), 'FREE_OPEN');
assert.equal(normalizeMonetizationMode('TYPO'), 'FREE_OPEN');
assert.equal(isFreeOpenMode('FREE_OPEN'), true);
assert.deepEqual(decideCapabilityAccess({ mode: 'FREE_OPEN', available: true }),
  { allowed: true, reason: 'FREE_OPEN_UNTIL_PAID_LAUNCH' });
assert.deepEqual(decideCapabilityAccess({ mode: 'FREE_OPEN', available: false }),
  { allowed: false, reason: 'CAPABILITY_NOT_AVAILABLE' });
assert.deepEqual(decideCapabilityAccess({ mode: 'PAID', available: true, paidEntitled: false }),
  { allowed: false, reason: 'PAID_ENTITLEMENT_REQUIRED' });
assert.deepEqual(decideCapabilityAccess({ mode: 'PAID', available: true, paidEntitled: true }),
  { allowed: true, reason: 'PAID_ENTITLED' });
assert.deepEqual(decideCapabilityAccess({ mode: 'PAID', available: true, alwaysFree: true }),
  { allowed: true, reason: 'ALWAYS_FREE' });
assert.equal(salesAllowed({ mode: 'FREE_OPEN', salesOpen: true }), false);
assert.equal(salesAllowed({ mode: 'PAID', salesOpen: false }), false);
assert.equal(salesAllowed({ mode: 'PAID', salesOpen: true }), true);
assert.equal(subscriptionUiAllowed({ mode: 'FREE_OPEN', showSubscribe: true }), false);
assert.equal(subscriptionUiAllowed({ mode: 'PAID', showSubscribe: true }), true);

for (const [name, source] of [['local', localConfig], ['example', exampleConfig]]) {
  assert.match(source, /MONETIZATION_MODE\s*:\s*['"]FREE_OPEN['"]/, `${name}: free mode missing`);
  assert.match(source, /SALES_OPEN\s*:\s*false/, `${name}: sales must be closed`);
  assert.match(source, /SHOW_SUBSCRIBE\s*:\s*false/, `${name}: subscription UI must be closed`);
}
assert.match(store, /decideCapabilityAccess\(\{ mode: CONFIG\.MONETIZATION_MODE/);
assert.match(billing, /salesAllowed\(\{ mode: CONFIG\.MONETIZATION_MODE/);
console.log('PASS: FREE_OPEN grants every available capability; unavailable gates and sales stay closed');
