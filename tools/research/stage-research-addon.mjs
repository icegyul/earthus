// Stage only new research assets. Never rebuild or delete the shared v2 deploy folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'prototype/v2-three');
const destination = path.join(root, 'services/research-runtime/.local-data/research-addon');
await fs.mkdir(destination, { recursive: true });
const resolved = await fs.realpath(destination);
const serviceRoot = await fs.realpath(path.join(root, 'services/research-runtime'));
if (!resolved.startsWith(serviceRoot + path.sep)) throw new Error('Staging path escaped the research service workspace.');
const names = ['research.html', 'css/research.css'];
async function walk(relative) {
  for (const entry of await fs.readdir(path.join(source, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlink is not a research asset.');
    const item = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await walk(item); else if (entry.isFile()) names.push(item);
  }
}
await walk('js/research');
const manifest = [];
for (const name of names) {
  let bytes = await fs.readFile(path.join(source, name));
  if (name.endsWith('.js')) {
    bytes = Buffer.from(bytes.toString('utf8').replaceAll('../../../vendor/', '../../vendor/'));
  }
  const target = path.join(destination, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  manifest.push({ path: name, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
}
await fs.writeFile(path.join(destination, 'research-addon.manifest.json'), JSON.stringify({
  createdAt: new Date().toISOString(), assets: manifest,
  requiredExistingAssets: ['vendor/three-r184.module.min.js', 'data/country-reference.json'],
  apiRequired: '/api/research/',
  productionReady: false,
  note: 'Only research assets staged. Existing menus, entry HTML, deployment bundle and cloud state were not edited. Local API is not a production deployment.',
}, null, 2));
console.log(JSON.stringify({ stagingDirectory: destination, assetCount: manifest.length, productionReady: false }, null, 2));
