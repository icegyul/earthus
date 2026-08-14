#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [html, css, js, ledgerText, manifestText, qaHtml, qaJs] = await Promise.all([
  readFile(path.join(root, 'prototype/aetherus-lab.html'), 'utf8'),
  readFile(path.join(root, 'prototype/css/aetherus-lab.css'), 'utf8'),
  readFile(path.join(root, 'prototype/js/aetherus-lab.js'), 'utf8'),
  readFile(path.join(root, 'docs/earthus-v23/AETHERUS_V3_SHEET_LEDGER.json'), 'utf8'),
  readFile(path.join(root, 'tools/manifests/aetherus-public-safe-files.tsv'), 'utf8'),
  readFile(path.join(root, 'prototype/aetherus-device-qa.html'), 'utf8'),
  readFile(path.join(root, 'prototype/js/aetherus-device-qa.js'), 'utf8'),
]);
const ledger = JSON.parse(ledgerText);
const publicLedger = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/v3-sheet-ledger.json'), 'utf8'));
assert.deepEqual(publicLedger, ledger, 'public ledger must match the generated evidence ledger');

assert.match(html, /PUBLIC SAFE/);
assert.match(html, /id="deployedCount"/);
assert.match(html, /id="blockedCount"/);
assert.match(html, /aetherus-device-qa\.html/);
assert.match(html, /Content-Security-Policy/);
assert.match(html, /noindex,nofollow,noarchive/);
assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /orientation:\s*landscape/);
assert.doesNotMatch(css, /animation:\s*[^;]*infinite/i);
for (const id of ['free-access', 'culture', 'mission', 'media', 'launch', 'satellite', 'api',
  'platform', 'discovery', 'spotlight', 'database', 'infra', 'security', 'release']) {
  assert.match(js, new RegExp(`id: '${id}'`), `missing public check ${id}`);
}
assert.doesNotMatch(js, /fetch\(['"]https?:\/\//i);
assert.doesNotMatch(js, /WebSocket|EventSource|navigator\.sendBeacon/);
assert.equal(ledger.entries.length, 296);
assert.equal(ledger.entries.filter(entry => entry.productionStatus === 'LOCAL_EVIDENCE_ONLY').length, 183);
assert.equal(ledger.entries.filter(entry => entry.productionStatus === 'PARTIAL_RUNTIME').length, 13);
assert.equal(ledger.entries.filter(entry => entry.productionStatus === 'BLOCKED_EXTERNAL').length, 100);
assert.equal(ledger.entries.some(entry => entry.productionStatus === 'NOT_RELEASED'), false);

const manifestRows = manifestText.split('\n').filter(line => line && !line.startsWith('#'))
  .map(line => line.split('\t'));
assert.equal(new Set(manifestRows.map(row => row[1])).size, manifestRows.length,
  'duplicate public path in manifest');
assert.equal(manifestRows.some(row => row[0] === 'prototype/index.html'), false,
  'main consumer must not be deployed by this manifest');
assert.equal(manifestRows.some(row => row[0] === 'prototype/js/space/cosmic3d.js'), false,
  'dirty main-scene consumer must not be deployed by this manifest');
assert.equal(manifestRows.some(row => row[0].includes('/ocean/')), false,
  'Ocean files must not enter AETHERUS manifest');
assert.equal(manifestRows.some(row => row[0].includes('supabase/migrations')), false,
  'database migration must not enter static deployment');
await Promise.all(manifestRows.map(([source]) => access(path.join(root, source))));

assert.match(qaHtml, /임의 천체사진 로컬 별 추출/);
assert.match(qaJs, /astrometry-feature-extractor\.js/);
assert.match(qaJs, /featureExtraction:\s*'PASS'/);
assert.match(qaJs, /originalFilenameStored:\s*false/);
assert.match(qaJs, /uploaded:\s*false/);
assert.doesNotMatch(`${html}\n${qaHtml}\n${qaJs}\n${ledgerText}`, /NOT[ _-]RELEASED/i);

console.log(`PASS: AETHERUS public safe lab, ${manifestRows.length} selective files, ledger 183 local evidence / 13 partial runtime / 100 external blocked`);
