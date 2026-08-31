#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? process.cwd());
const manifestPath = path.join(root, 'PACKAGE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
for (const item of manifest.files) {
  const filePath = path.join(root, item.path);
  if (!fs.existsSync(filePath)) { failures.push({ path: item.path, reason: 'MISSING' }); continue; }
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== item.sha256) failures.push({ path: item.path, reason: 'CHECKSUM', expected: item.sha256, actual: sha256 });
  if (bytes.length !== item.bytes) failures.push({ path: item.path, reason: 'SIZE', expected: item.bytes, actual: bytes.length });
}
console.log(JSON.stringify({ pass: failures.length === 0, checked: manifest.files.length, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
