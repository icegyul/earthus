#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');
const [scene, css, assetReadme, backgroundStat, amphipodStat] = await Promise.all([
  read('prototype/js/ocean/divescene.js'),
  read('prototype/css/ocean-dive.css'),
  read('prototype/ocean/scenes/README.md'),
  stat(path.join(root, 'prototype/ocean/scenes/mariana-trench-simulator.jpg')),
  stat(path.join(root, 'prototype/ocean/scenes/hadal-amphipod-illustration.jpg')),
]);

assert.match(scene, /MARIANA TRENCH/);
assert.match(scene, /data-dive-control="down"/);
assert.match(scene, /data-dive-control="pause"/);
assert.match(scene, /data-dive-control="up"/);
assert.match(scene, /data-dive-control="speed"/);
assert.match(scene, /data-dive-control="reset"/);
assert.match(scene, /Hirondellea gigas/);
assert.match(scene, /관측 사진이 아니다/);
assert.match(scene, /수온은 관측 프로파일이 연결되지 않았으므로/);
assert.match(scene, /document\.addEventListener\('visibilitychange'/);
assert.match(scene, /requestAnimationFrame\(tick\)/);
assert.match(scene, /cancelAnimationFrame\(this\._raf\)/);
assert.doesNotMatch(scene, /Math\.random|setInterval|clampToGround/);

assert.match(css, /mariana-trench-simulator\.jpg/);
assert.match(css, /min-height:44px/);
assert.match(css, /env\(safe-area-inset-bottom\)/);
assert.match(css, /@media\(max-width:760px\)/);
assert.match(css, /orientation:landscape/);
assert.match(css, /prefers-reduced-motion/);

assert.ok(backgroundStat.size > 200_000, 'deep-sea background asset is unexpectedly small');
assert.ok(amphipodStat.size > 200_000, 'amphipod illustration asset is unexpectedly small');
assert.match(assetReadme, /not documentary photographs or observation records/);
assert.match(assetReadme, /GEBCO 2026/);
assert.match(assetReadme, /OBIS/);

console.log('PASS: cinematic deep-sea cockpit, evidence labels, finite controls and responsive assets');
