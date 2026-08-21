#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(
  new URL('../prototype/data/tourism/seoul-121-catalog.v1.json', import.meta.url), 'utf8',
));
const canonicalPlaceIds = catalog.places
  .map(place => `earthus:tourism:seoul:${place.code}`)
  .sort();
const allocations = canonicalPlaceIds.flatMap(placeId => Array.from({ length: 9 }, () => ({
  placeId,
  weight: 1 / 9,
})));
const droppedSourceAllocations = allocations.filter(row => row.placeId !== canonicalPlaceIds[0]);

function legacyVerifierAccepts(rows, renderSourceCount) {
  const audit = new Map();
  for (const allocation of rows) {
    const row = audit.get(allocation.placeId) || { count: 0, weight: 0 };
    row.count += 1;
    row.weight += Number(allocation.weight);
    audit.set(allocation.placeId, row);
  }
  const errors = [...audit.values()].filter(row =>
    row.count < 9 || row.count > 25 || Math.abs(row.weight - 1) > 1e-9);
  return renderSourceCount === 121 && errors.length === 0;
}

assert.equal(legacyVerifierAccepts(droppedSourceAllocations, 121), true,
  'review reproduction must show the old aggregate gate accepting a dropped canonical source');
console.log('allocation RED reproduction: legacy gate accepted 120/121 canonical sources');

const { auditCanonicalTourismAllocations } = await import('./tourism-density-release-contract.mjs');

const valid = auditCanonicalTourismAllocations(canonicalPlaceIds, allocations);
assert.equal(valid.valid, true);
assert.equal(valid.audit.length, 121);
assert.deepEqual(valid.audit.map(row => row.placeId), canonicalPlaceIds);
assert.deepEqual(valid.errors, []);

const dropped = auditCanonicalTourismAllocations(canonicalPlaceIds, droppedSourceAllocations);
assert.equal(dropped.valid, false);
assert.deepEqual(dropped.errors, [{
  placeId: canonicalPlaceIds[0], count: 0, weight: 0, reason: 'MISSING_CANONICAL_SOURCE',
}]);

console.log('tourism density live allocation gate: PASS (exact canonical 121-place audit)');
