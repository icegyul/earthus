#!/usr/bin/env node

import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => readFile(path.join(ROOT, relativePath), 'utf8');

const [html, css, main, cosmic, layerbar, catalogSource] = await Promise.all([
  read('prototype/index.html'),
  read('prototype/css/app.css'),
  read('prototype/js/main.js'),
  read('prototype/js/space/cosmic3d.js'),
  read('prototype/js/layerbar.js'),
  read('prototype/data/space-photos.json'),
]);
const catalog = JSON.parse(catalogSource);

for (const route of ['solar', 'photos', 'milkyway', 'galaxies']) {
  assert.match(html, new RegExp(`data-aetherus-nav="${route}"`));
  assert.match(layerbar, new RegExp(`id: '${route}'`));
}
assert.match(html, /AETHERUS <small>v3\.0<\/small>/);
assert.match(html, /class="cosmic-photo-stage"/);
assert.match(html, /class="cosmic-photo-hero"/);
assert.match(html, /class="cosmic-photo-copy"/);
assert.match(html, /app\.css\?v=20260814-oceanv1/);
assert.match(html, /main\.js\?v=20260814-oceanv1/);
assert.match(main, /layerbar\.js\?v=20260814-aetherusv3/);
assert.match(main, /cosmic3d\.js\?v=20260815-mc14/);
assert.match(cosmic, /photo\.preview \|\| photo\.thumb/);
assert.match(cosmic, /updateExperienceNav\('milkyway'\)/);
assert.match(css, /\.cosmic-experience-nav button\{[^}]*min-height:44px/s);
assert.match(css, /@media\(max-width:760px\)/);

assert.equal(catalog.items.length, 59);
assert.equal(catalog.items.filter(item => item.telescope === 'HST').length, 9);
assert.equal(catalog.items.filter(item => item.telescope === 'JWST').length, 50);
for (const item of catalog.items.slice(0, 9)) {
  await access(path.join(ROOT, 'prototype', item.thumb));
  await access(path.join(ROOT, 'prototype', item.preview));
  assert.ok((await stat(path.join(ROOT, 'prototype', item.preview))).size > 20_000,
    `${item.id} preview must be a real local image`);
}

console.log('PASS: Aetherus v3 public navigation, photo-first layout, responsive controls and 2026 assets are wired');
