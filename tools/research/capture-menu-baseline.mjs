#!/usr/bin/env node
// Hash only explicitly named paths. Never invokes git or restores source files.
import { createHash } from 'node:crypto';
import { readFile, stat, mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PATHS = [
  'prototype/index.html', 'prototype/js/ui.js', 'prototype/js/ui-events.js',
  'prototype/js/earth-switch.js', 'prototype/js/space/aetherus-dashboard.js',
  'prototype/css/aetherus-dashboard.css', 'prototype/js/space/mission-readability.js',
  'prototype/v2-three/index.html', 'prototype/v2-three/js/main.js',
  'prototype/v2-three/js/ui-shell.js', 'prototype/v2-three/js/engine-bridge.js',
  'prototype/v2-three/js/live-layers.js', 'prototype/v2-three/js/intel-feed.js',
  'prototype/v2-three/js/sim-ocean.js', 'prototype/v2-three/js/ask-earth.js',
  'tools/build-v2-bundle.sh', 'tools/deploy-v2-three.sh',
];

export function relativePath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('An explicit relative file path is required.');
  const normalized = value.replaceAll('\\', '/');
  if (path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || normalized.startsWith('/')
      || normalized.split('/').some(part => !part || part === '.' || part === '..')
      || /[*?\x00]/.test(normalized)) throw new Error(`Unsafe or non-explicit path: ${value}`);
  return normalized;
}

export async function fileDigest(root, name) {
  const safe = relativePath(name);
  const target = path.resolve(root, safe);
  let resolved;
  try { resolved = await realpath(target); } catch (error) {
    if (error.code === 'ENOENT') return { path: safe, sha256: null, exists: false };
    throw error;
  }
  const relative = path.relative(await realpath(root), resolved);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error(`Path resolves outside repository: ${name}`);
  }
  if (!(await stat(target)).isFile()) throw new Error(`Not a regular file: ${name}`);
  const bytes = await readFile(target);
  return { path: safe, sha256: createHash('sha256').update(bytes).digest('hex'), exists: true, bytes: bytes.length };
}

export async function capture(root, paths) {
  const names = paths.map(relativePath);
  if (!names.length || new Set(names).size !== names.length) throw new Error('Paths must be nonempty and unique.');
  return { schemaVersion: '1.0', capturedAt: new Date().toISOString(), scope: 'explicit-paths-only',
    files: await Promise.all(names.map(name => fileDigest(root, name))) };
}

async function main() {
  let root = process.cwd(), output, pathsFile;
  const paths = [];
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--help') {
      console.log('node tools/research/capture-menu-baseline.mjs --output <new.json> [--root <repo>] [--path <relative-file> ... | --paths-file <JSON array or baseline.json>]');
      return;
    }
    if (!['--root', '--output', '--path', '--paths-file'].includes(flag) || !process.argv[i + 1]) throw new Error(`Unknown or incomplete argument: ${flag}`);
    const value = process.argv[++i];
    if (flag === '--root') root = path.resolve(value);
    if (flag === '--output') output = path.resolve(value);
    if (flag === '--path') paths.push(value);
    if (flag === '--paths-file') pathsFile = value;
  }
  if (!output) throw new Error('--output is required; existing files are never overwritten.');
  if (paths.length && pathsFile) throw new Error('Choose --path or --paths-file.');
  if (pathsFile) {
    const source = JSON.parse((await readFile(pathsFile, 'utf8')).replace(/^\uFEFF/, ''));
    const entries = Array.isArray(source) ? source : source.files;
    if (!Array.isArray(entries)) throw new Error('Paths file must be an array or contain files.');
    paths.push(...entries.map(entry => typeof entry === 'string' ? entry : entry.path));
  }
  const baseline = await capture(root, paths.length ? paths : DEFAULT_PATHS);
  if (baseline.files.some(file => path.resolve(root, file.path) === output)) throw new Error('Output cannot replace a captured file.');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, tracked: baseline.files.length, missing: baseline.files.filter(file => !file.exists).map(file => file.path) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
