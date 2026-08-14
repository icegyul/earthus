#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = await readFile(path.join(root,
  'tools/manifests/ocean-aetherus-v3-canary-files.tsv'), 'utf8');
const rows = manifest.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
  const [sourcePath, publicPath, contentType, cacheControl] = line.split('\t');
  return { sourcePath, publicPath, contentType, cacheControl };
});
assert.equal(rows.length, 45);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const results = [];

for (const row of rows) {
  const local = await readFile(path.join(root, row.sourcePath));
  const url = `https://earthus.net/${row.publicPath}?verify=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  assert.equal(response.status, 200, `${row.publicPath}: HTTP ${response.status}`);
  const live = Buffer.from(await response.arrayBuffer());
  const liveType = response.headers.get('content-type') || '';
  const liveCache = response.headers.get('cache-control') || '';
  assert.equal(sha256(live), sha256(local), `${row.publicPath}: SHA mismatch`);
  assert.ok(liveType.toLowerCase().startsWith(row.contentType.split(';')[0].toLowerCase()),
    `${row.publicPath}: Content-Type ${liveType}`);
  assert.match(liveCache, /no-cache/i, `${row.publicPath}: Cache-Control ${liveCache}`);
  results.push({ path: `/${row.publicPath}`, sha256: sha256(local), contentType: liveType,
    cacheControl: liveCache });
}

console.log(`PASS: ${results.length}/${rows.length} live/local SHA, MIME and no-cache headers`);
console.log(JSON.stringify({ schema: 'earthus.ocean-aetherus-v3-canary-live-proof.v1',
  verifiedAt: new Date().toISOString(), results }, null, 2));
