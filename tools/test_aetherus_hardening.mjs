#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modules = ['ai-evidence.js', 'remote-observatory.js', 'plugin-sandbox.js', 'personal-universe.js', 'community-safety.js', 'citizen-science.js'];
for (const name of modules) {
  const source = await readFile(path.join(ROOT, 'prototype/js/space', name), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|WebSocket|navigator\.serial|navigator\.bluetooth/, `${name}: no external/device bypass`);
  assert.doesNotMatch(source, /setInterval|requestAnimationFrame/, `${name}: no owned infinite render loop`);
}
const handover = await readFile(path.join(ROOT, 'docs/HANDOVER.md'), 'utf8');
assert.match(handover, /예보하지 않는다/);
assert.match(handover, /SNS 자동 게시 금지/);
console.log(`PASS: ${modules.length} Aetherus safety modules have no external/device bypass or owned infinite loop; constitutional rules present`);
