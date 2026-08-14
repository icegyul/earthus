#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = await readFile(
  path.join(root, 'tools/manifests/aetherus-public-safe-files.tsv'), 'utf8');
const rows = manifest.split('\n').filter(line => line && !line.startsWith('#'))
  .map(line => line.split('\t'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = Date.now();
const results = [];

for (const [sourcePath, publicPath, contentType, cacheControl] of rows) {
  const local = await readFile(path.join(root, sourcePath));
  const response = await fetch(`https://earthus.net/${publicPath}?verify=${revision}`, { cache: 'no-store' });
  const live = Buffer.from(await response.arrayBuffer());
  const result = {
    publicPath,
    status: response.status,
    localSha256: digest(local),
    liveSha256: digest(live),
    contentType: response.headers.get('content-type'),
    cacheControl: response.headers.get('cache-control'),
  };
  assert.equal(response.ok, true, `${publicPath} HTTP ${response.status}`);
  assert.equal(result.liveSha256, result.localSha256, `${publicPath} SHA mismatch`);
  const expectedBaseType = contentType.split(';')[0];
  const allowedBaseTypes = expectedBaseType === 'text/javascript'
    ? ['text/javascript', 'application/javascript'] : [expectedBaseType];
  assert.equal(allowedBaseTypes.some(type => result.contentType?.startsWith(type)), true,
    `${publicPath} content-type mismatch`);
  const actualCacheDirectives = new Set(String(result.cacheControl || '').toLowerCase()
    .split(',').map(value => value.trim()).filter(Boolean));
  for (const expectedDirective of cacheControl.toLowerCase().split(',').map(value => value.trim())) {
    const satisfied = actualCacheDirectives.has(expectedDirective)
      || (expectedDirective === 'no-cache' && actualCacheDirectives.has('no-store'));
    assert.equal(satisfied, true,
      `${publicPath} cache-control missing ${expectedDirective}`);
  }
  results.push(result);
}

console.log(JSON.stringify({
  checkedAtUtc: new Date().toISOString(),
  origin: 'https://earthus.net',
  passed: results.length,
  failed: 0,
  files: results,
}, null, 2));
