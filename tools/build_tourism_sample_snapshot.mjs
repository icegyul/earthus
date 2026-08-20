import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [rawPath, outputPath] = process.argv.slice(2);
if (!rawPath || !outputPath) {
  throw new Error('usage: node tools/build_tourism_sample_snapshot.mjs RAW_JSON OUTPUT_JSON');
}
const root = path.resolve(import.meta.dirname, '..');
const source = await readFile(path.join(root, 'prototype/js/tourism-flow-contract.js'), 'utf8');
const flow = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const [raw, catalogDoc] = await Promise.all([
  readFile(rawPath, 'utf8').then(JSON.parse),
  readFile(path.join(root, 'prototype/data/tourism/seoul-121-catalog.v1.json'), 'utf8').then(JSON.parse),
]);
const receivedAt = new Date().toISOString();
const snapshot = flow.buildTourismSnapshot({
  responses: [raw], catalog: catalogDoc.places, mode: 'SAMPLE', receivedAt, now: receivedAt,
});
await writeFile(outputPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
console.log(`wrote ${snapshot.places.length} official sample place to ${outputPath}`);
