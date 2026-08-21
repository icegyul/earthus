#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const matrix = fs.readFileSync(path.join(root, 'docs/earthus-v23/DATA_SOURCE_MATRIX.md'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'prototype/data/catalog.json'), 'utf8'));
const cyclone = fs.readFileSync(path.join(root, 'prototype/js/ui-cyclone.js'), 'utf8');

const actual = fs.readdirSync(path.join(root, 'aws'), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'aws', entry.name, 'handler.py')))
  .map(entry => entry.name).sort();
const inventoryBlock = matrix.match(/## 3\. \d+개 handler 인벤토리[\s\S]*?```text\n([\s\S]*?)\n```/);
assert.ok(inventoryBlock, 'handler inventory block missing');
const documented = inventoryBlock[1].trim().split(/\s+/).sort();
assert.deepEqual(documented, actual, 'DATA_SOURCE_MATRIX handler inventory drifted');
assert.equal(new Set(documented).size, documented.length, 'handler inventory contains duplicates');

assert.equal(catalog.datasets.length, 30, 'catalog dataset count drifted');
for (const dataset of catalog.datasets) {
  assert.ok(dataset.id && dataset.tier && dataset.access && dataset.license?.status,
    `catalog metadata missing: ${dataset.id || 'unknown'}`);
}
const gated = catalog.datasets.filter(dataset => dataset.license.status !== 'verified').map(dataset => dataset.id).sort();
assert.deepEqual(gated, ['celestrak', 'gvp-volcano', 'wikimedia-commons']);

assert.match(cyclone, /target="_blank" rel="noopener"/);
assert.match(cyclone, /台風\$\{no\}号/);
assert.match(cyclone, /台風第\$\{no\}号/);
assert.doesNotMatch(cyclone, /<iframe/i);
assert.match(cyclone, /CCTV 는 넣지 않았다/);

console.log(`Data source matrix: ${actual.length}/${actual.length} handlers; ${catalog.datasets.length} catalog sources; ${gated.length} gated`);
