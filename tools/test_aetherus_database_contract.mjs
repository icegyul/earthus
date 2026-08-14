#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-database-contract-'));
const source = await readFile(path.join(root, 'prototype/js/space/database-contract.js'), 'utf8');
const modulePath = path.join(directory, 'database-contract.mjs');
await writeFile(modulePath, source);
const database = await import(pathToFileURL(modulePath).href);
const contract = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/database-contract.v1.json'), 'utf8'));
const normalized = database.validateDatabaseContract(contract);
assert.equal(normalized.tables.length, 24);
assert.equal(normalized.productionEnabled, false);
assert.throws(() => database.validateDatabaseContract({ ...contract,
  tables: contract.tables.filter(table => table.name !== 'AuditLog') }),
error => error.code === 'DATABASE_REQUIRED_TABLE_MISSING');
assert.throws(() => database.validateDatabaseContract({ ...contract,
  tables: contract.tables.map(table => table.name === 'UserObservation'
    ? { ...table, controls: ['SOFT_DELETE'] } : table) }),
error => error.code === 'DATABASE_OWNER_RLS_REQUIRED');
assert.throws(() => database.validateDatabaseContract({ ...contract,
  indexes: contract.indexes.filter(index => index.kind !== 'GIST_GEO') }),
error => error.code === 'DATABASE_GEO_INDEX_REQUIRED');
assert.throws(() => database.validateDatabaseContract({ ...contract, productionEnabled: true }),
error => error.code === 'DATABASE_PRODUCTION_MIGRATION_NOT_APPROVED');
const active = database.retentionDecision({ tableName: 'UserObservation', now: '2026-08-14T00:00:00Z',
  contract });
assert.equal(active.disposition, 'ACTIVE');
const hold = database.retentionDecision({ tableName: 'UserObservation',
  deletedAt: '2026-08-01T00:00:00Z', now: '2026-08-14T00:00:00Z', contract });
assert.equal(hold.disposition, 'RETENTION_HOLD');
const eligible = database.retentionDecision({ tableName: 'UserObservation',
  deletedAt: '2026-07-01T00:00:00Z', now: '2026-08-14T00:00:00Z', contract });
assert.equal(eligible.disposition, 'DELETE_ELIGIBLE');
assert.equal(eligible.automaticDelete, false);
assert.equal(database.retentionDecision({ tableName: 'AuditLog',
  deletedAt: '2020-01-01T00:00:00Z', now: '2026-08-14T00:00:00Z', contract }).disposition,
  'RETAIN_AUDIT');
assert.doesNotMatch(source, /\bfetch\s*\(|DELETE\s+FROM|DROP\s+TABLE|setInterval/);
console.log('PASS: Database Sheets 219-232 24-table registry, RLS/rights/append-only/index/retention gates');
