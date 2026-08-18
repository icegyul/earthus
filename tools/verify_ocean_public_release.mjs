#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.EARTHUS_LIVE_URL || 'https://earthus.net';
const digest = value => createHash('sha256').update(value).digest('hex');
const files = [
  ['prototype/index.html', 'index.html', 'text/html'],
  ['prototype/css/app.css', 'css/app.css', 'text/css'],
  ['prototype/js/main.js', 'js/main.js', 'text/javascript'],
  ['prototype/js/layerbar.js', 'js/layerbar.js', 'text/javascript'],
  ['prototype/js/i18n.js', 'js/i18n.js', 'text/javascript'],
  ['prototype/js/ui-outdoor.js', 'js/ui-outdoor.js', 'text/javascript'],
  ['prototype/js/ui-ocean.js', 'js/ui-ocean.js', 'text/javascript'],
  ['prototype/sw.js', 'sw.js', 'text/javascript'],
  ['prototype/ocean.html', 'ocean.html', 'text/html'],
  ['prototype/data/sea-life.json', 'data/sea-life.json', 'application/json'],
  ['prototype/data/trenches.json', 'data/trenches.json', 'application/json'],
  ['prototype/data/trench-footprints.json', 'data/trench-footprints.json', 'application/json'],
  ['prototype/data/ocean-comparisons.json', 'data/ocean-comparisons.json', 'application/json'],
  ['prototype/data/trench-bathymetry.webp', 'data/trench-bathymetry.webp', 'image/webp'],
];

for (const name of await readdir(path.join(root, 'prototype/js/ocean'))) {
  if (name.endsWith('.js')) files.push([`prototype/js/ocean/${name}`, `js/ocean/${name}`, 'text/javascript']);
}
for (const name of await readdir(path.join(root, 'prototype/data/ocean'))) {
  if (name.endsWith('.json')) files.push([`prototype/data/ocean/${name}`, `data/ocean/${name}`, 'application/json']);
}
for (const name of await readdir(path.join(root, 'prototype/ocean/thumbs'))) {
  if (/\.(?:jpg|png)$/i.test(name)) files.push([`prototype/ocean/thumbs/${name}`,
    `ocean/thumbs/${name}`, name.endsWith('.png') ? 'image/png' : 'image/jpeg']);
}

const revision = Date.now();
for (const [localPath, publicPath, expectedType] of files) {
  const [local, response] = await Promise.all([
    readFile(path.join(root, localPath)),
    fetch(`${baseUrl}/${publicPath}?ocean-release=${revision}`, { cache: 'no-store' }),
  ]);
  assert.equal(response.status, 200, `${publicPath} HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', new RegExp(`^${expectedType.replace('/', '\\/')}`),
    `${publicPath} MIME ${response.headers.get('content-type')}`);
  const live = Buffer.from(await response.arrayBuffer());
  assert.equal(digest(live), digest(local), `${publicPath} live/local SHA-256 mismatch`);
}

const hub = await fetch(`${baseUrl}/?ocean=hub&ocean-release=${revision}`, { cache: 'no-store' });
assert.equal(hub.status, 200);
const html = await hub.text();
assert.match(html, /data-act="ocean"/);
assert.match(html, /data-act="outdoor"/);
assert.match(html, /바다 · 생물 관측 · 땅과 하늘/);
assert.doesNotMatch(html.match(/<nav id="menuMain"[\s\S]*?<\/nav>/)?.[0] || '', /무료|\bFREE\b/i);
assert.match(html, /20260814-oceanv1/);

console.log(`PASS: ${files.length} Ocean operating assets have exact live/local SHA-256 and MIME`);
console.log(`PASS: ${baseUrl}/?ocean=hub exposes the first-class public Ocean hub without price copy`);
