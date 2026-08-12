#!/usr/bin/env node
// PR-11 does not grant authority. This is a local guard that fails if a protected
// public/action flag is changed without replacing this evidence-only release path.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localConfig = await readFile(path.join(root, 'prototype/js/config.local.js'), 'utf8');
const configTemplate = await readFile(path.join(root, 'prototype/js/config.local.example.js'), 'utf8');
const main = await readFile(path.join(root, 'prototype/js/main.js'), 'utf8');
const subscribe = await readFile(path.join(root, 'prototype/js/ui-subscribe.js'), 'utf8');
const handover = await readFile(path.join(root, 'docs/HANDOVER.md'), 'utf8');

assert.match(localConfig, /SALES_OPEN\s*:\s*false/, 'SALES_OPEN must remain disabled');
for (const name of ['TPW_READY', 'DECISION_CORE_READY']) assert.match(configTemplate, new RegExp(`${name}\\s*:\\s*false`), `${name} default must remain disabled`);
assert.match(main, /if \(CONFIG\.DECISION_CORE_READY === true\)/, 'Decision UI must remain explicitly gated');
assert.match(subscribe, /const salesReady = CONFIG\.SALES_OPEN && dataReady/, 'sales must require both sale and data gates');
assert.match(handover, /SNS 자동 게시 금지/);
console.log('PASS: PR-11 release gate keeps sales, TPW, Decision UI and automatic publishing closed');
