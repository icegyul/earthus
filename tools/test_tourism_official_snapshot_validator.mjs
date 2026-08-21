#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertOfficialTourismSnapshot,
  OFFICIAL_TOURISM_SNAPSHOT_NEGATIVE_CASES,
} from './tourism-official-snapshot-validator.mjs';

const snapshotPath = process.env.EARTHUS_TOURISM_SNAPSHOT
  || '/private/tmp/earthus-seoul-flow-current.json';
const [snapshot, catalog] = await Promise.all([
  readFile(snapshotPath, 'utf8').then(JSON.parse),
  readFile(new URL('../prototype/data/tourism/seoul-121-catalog.v1.json', import.meta.url), 'utf8')
    .then(JSON.parse),
]);

const validated = assertOfficialTourismSnapshot(snapshot, catalog);
assert.equal(validated.state, 'STALE', 'genuine cached official snapshot must remain STALE');
assert.equal(validated.canonicalPlaceIds.length, 121);

const accepted = [];
const wrongErrors = [];
for (const [label, expectedError, mutate] of OFFICIAL_TOURISM_SNAPSHOT_NEGATIVE_CASES) {
  const candidate = structuredClone(snapshot);
  mutate(candidate);
  try {
    assertOfficialTourismSnapshot(candidate, catalog);
    accepted.push(label);
  } catch (error) {
    if (!expectedError.test(String(error?.message || error))) {
      wrongErrors.push({ label, error: String(error?.message || error) });
    }
  }
}
assert.deepEqual(accepted, [], `invalid official snapshots accepted: ${accepted.join(', ')}`);
assert.deepEqual(wrongErrors, [], `invalid snapshots rejected for wrong reason: ${JSON.stringify(wrongErrors)}`);

for (const required of [
  'snapshot movement', 'observation route', 'forecast vector', 'flow path',
  'generic direction', 'OD shape', 'link shape', 'edge shape', 'flow-line shape',
]) {
  assert.ok(OFFICIAL_TOURISM_SNAPSHOT_NEGATIVE_CASES.some(([label]) => label.includes(required)),
    `missing hardened negative: ${required}`);
}

console.log(`tourism official snapshot validator: PASS (${OFFICIAL_TOURISM_SNAPSHOT_NEGATIVE_CASES.length} negatives, STALE accepted)`);
