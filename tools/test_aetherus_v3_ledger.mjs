#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledger = JSON.parse(await readFile(
  path.join(root, 'docs/earthus-v23/AETHERUS_V3_SHEET_LEDGER.json'), 'utf8'));
const index = JSON.parse(await readFile(
  path.join(root, 'work/aetherus-v3.0-master-package/IMPLEMENTATION_SHEET_INDEX.json'), 'utf8'));
assert.equal(ledger.schema, 'earthus.aetherus-v3-sheet-ledger.v1');
assert.equal(ledger.entries.length, 296);
assert.equal(index.length, 296);
assert.deepEqual(ledger.entries.map(entry => entry.sheet),
  Array.from({ length: 296 }, (_, index) => index + 1));
for (let position = 0; position < 296; position += 1) {
  assert.equal(ledger.entries[position].title, index[position].title);
  assert.equal(ledger.entries[position].part, index[position].part);
}
const allowed = new Set(['VERIFIED_EXISTING', 'IMPLEMENT', 'BLOCKED_EXTERNAL', 'NOT_APPLICABLE']);
assert.equal(ledger.entries.every(entry => allowed.has(entry.status)), true);
assert.equal(ledger.entries.every(entry => entry.productionStatus === 'NOT_RELEASED'), true);
assert.equal(ledger.entries.filter(entry => entry.status === 'BLOCKED_EXTERNAL')
  .every(entry => entry.blockers.length > 0), true);
assert.equal(ledger.entries.filter(entry => entry.status === 'VERIFIED_EXISTING')
  .every(entry => entry.evidence.files.length + entry.evidence.tests.length > 0), true);
for (let sheet = 151; sheet <= 163; sheet += 1) {
  const entry = ledger.entries[sheet - 1];
  assert.equal(entry.status, 'VERIFIED_EXISTING');
  assert.ok(entry.evidence.tests.includes('tools/test_aetherus_culture.mjs'));
}
const countSum = Object.values(ledger.counts).reduce((sum, count) => sum + count, 0);
assert.equal(countSum, 296);
assert.equal(ledger.counts.VERIFIED_EXISTING, 200);
assert.equal(ledger.counts.IMPLEMENT, 0);
assert.equal(ledger.counts.BLOCKED_EXTERNAL, 96);
console.log(`PASS: Aetherus v3 ledger 296/296, ${JSON.stringify(ledger.counts)}`);
