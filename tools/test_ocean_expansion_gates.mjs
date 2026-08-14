#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledger = JSON.parse(await readFile(
  path.join(root, 'prototype/data/ocean/expansion-gates.v1.json'), 'utf8'));
assert.equal(ledger.schema, 'earthus.ocean-expansion-gates.v1');
assert.equal(ledger.overall, 'BLOCKED_EXTERNAL');
assert.deepEqual(ledger.gates.map(gate => gate.id), ['G1', 'G2', 'G3', 'G4', 'G5']);
assert.equal(ledger.gates.every(gate => gate.status === 'CLOSED'), true);
assert.equal(ledger.gates.every(gate => gate.evidence === null), true);
assert.equal(ledger.gates.every(gate => Array.isArray(gate.requiredEvidence)
  && gate.requiredEvidence.length >= 3 && typeof gate.reason === 'string'), true);
const known = new Set(ledger.gates.map(gate => gate.id));
assert.equal(ledger.capabilities.every(capability => capability.productionEnabled === false), true);
assert.equal(ledger.capabilities.every(capability => capability.requires.length > 0
  && capability.requires.every(id => known.has(id))), true);
assert.deepEqual(ledger.capabilities.find(item => item.id === 'GLOBAL_AIS').requires,
  ['G1', 'G2', 'G3', 'G4']);
assert.deepEqual(ledger.capabilities.find(item => item.id === 'PORT_LOGISTICS_B2B').requires,
  ['G1', 'G2', 'G3', 'G4', 'G5']);
console.log('PASS: O6 G1-G5 are evidence-empty CLOSED gates and all expansion capabilities remain disabled');
