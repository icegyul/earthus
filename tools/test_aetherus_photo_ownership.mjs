#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => readFile(path.join(ROOT, relativePath), 'utf8');
const json = async relativePath => JSON.parse(await read(relativePath));

const document = await json('prototype/data/space-photos.json');
assert.equal(document.contract.owner, 'aetherus');
assert.deepEqual(document.contract.surfaces, ['photo-gallery', 'sky-position']);
assert.equal(document.items.length, 50);
assert.equal(document.items.filter(item => item.telescope === 'HST').length, 1);
assert.equal(document.items.filter(item => item.telescope === 'JWST').length, 49);

const moduleSource = (await read('prototype/js/space/photo-catalog.js'))
  .replace(
    /import \{ assertAetherusCatalog \} from '[^']+';/,
    'const assertAetherusCatalog = (_catalog, value) => value;',
  );
const photoCatalog = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

assert.equal(photoCatalog.normalizeAetherusTelescope('jwst'), 'JWST');
assert.equal(photoCatalog.normalizeAetherusTelescope('roman'), 'ALL');
assert.equal(photoCatalog.filterAetherusPhotos(document.items, 'HST').length, 1);
assert.equal(photoCatalog.filterAetherusPhotos(document.items, 'JWST').length, 49);
assert.equal(photoCatalog.resolveAetherusPhoto(document.items, 'southern-ring-jwst')?.telescope, 'JWST');
assert.deepEqual(photoCatalog.aetherusPhotoCounts(document.items), { ALL: 50, HST: 1, JWST: 49 });

const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async () => {
  requests += 1;
  return { ok: true, json: async () => document };
};
await Promise.all([
  photoCatalog.loadAetherusPhotoCatalog(),
  photoCatalog.loadAetherusPhotoCatalog(),
]);
assert.equal(requests, 1, 'parallel consumers must share one catalogue request');

globalThis.fetch = async () => {
  requests += 1;
  throw new Error('NETWORK_FIXTURE');
};
await assert.rejects(photoCatalog.loadAetherusPhotoCatalog({ refresh: true }), /NETWORK_FIXTURE/);
globalThis.fetch = async () => {
  requests += 1;
  return { ok: true, json: async () => document };
};
await photoCatalog.loadAetherusPhotoCatalog();
assert.equal(requests, 3, 'a failed request must be cleared so an explicit retry can recover');
globalThis.fetch = originalFetch;

const [config, layerbar, registry, search] = await Promise.all([
  read('prototype/js/config.js'),
  read('prototype/js/layerbar.js'),
  read('prototype/js/layers/registry.js'),
  read('prototype/js/search.js'),
]);
assert.doesNotMatch(config, /id:'(?:hst|jwst)'\s*,\s*kind:'skyphoto'/);
assert.doesNotMatch(layerbar, /id:'(?:hst|jwst)'\s*,\s*ko:/);
assert.match(layerbar, /id: 'photos', ko: '우주 사진관'/);
assert.doesNotMatch(registry, /skyPhotos|spacephotos/);
assert.match(search, /aetherus-photo/);
assert.match(search, /'hst'/);
assert.match(search, /'jwst'/);

console.log('PASS: Aetherus owns 50 photos; HST=1, JWST=49; shared load, retry, menu and search migration');
