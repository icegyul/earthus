#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const accessModeSource = await readFile(path.join(root, 'prototype/js/access-mode.js'), 'utf8');
const { decideCapabilityAccess, salesAllowed } = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(accessModeSource)}`);
const manifest = await readFile(path.join(root, 'tools/manifests/free-open-policy-files.tsv'), 'utf8');
const rows = manifest.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const [sourcePath, publicPath, contentType, cacheControl] = line.split('\t');
  return { sourcePath, publicPath, contentType, cacheControl };
});
const sourceOverrides = JSON.parse(process.env.EARTHUS_VERIFY_SOURCE_OVERRIDES || '{}');
assert.equal(rows.length, 12);
const sha256 = value => createHash('sha256').update(value).digest('hex');
let liveConfig = '';

for (const row of rows) {
  const expectedPath = sourceOverrides[row.publicPath] || row.sourcePath;
  const local = await readFile(path.isAbsolute(expectedPath) ? expectedPath : path.join(root, expectedPath));
  const response = await fetch(`https://earthus.net/${row.publicPath}?free-open=${Date.now()}`,
    { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  assert.equal(response.status, 200, `${row.publicPath}: HTTP ${response.status}`);
  const live = Buffer.from(await response.arrayBuffer());
  assert.equal(sha256(live), sha256(local), `${row.publicPath}: SHA mismatch`);
  assert.ok((response.headers.get('content-type') || '').toLowerCase()
    .startsWith(row.contentType.split(';')[0].toLowerCase()), `${row.publicPath}: MIME mismatch`);
  assert.match(response.headers.get('cache-control') || '', /no-cache/i,
    `${row.publicPath}: Cache-Control mismatch`);
  if (row.publicPath === 'js/config.local.js') liveConfig = live.toString('utf8');
}

assert.match(liveConfig, /MONETIZATION_MODE\s*:\s*['"]FREE_OPEN['"]/);
assert.match(liveConfig, /SALES_OPEN\s*:\s*false/);
assert.match(liveConfig, /SHOW_SUBSCRIBE\s*:\s*false/);
assert.equal(decideCapabilityAccess({ mode: 'FREE_OPEN', available: true }).allowed, true);
assert.equal(decideCapabilityAccess({ mode: 'FREE_OPEN', available: false }).allowed, false);
assert.equal(salesAllowed({ mode: 'FREE_OPEN', salesOpen: true }), false);
console.log(`PASS: ${rows.length}/${rows.length} live files; FREE_OPEN; sales and subscription UI closed`);
