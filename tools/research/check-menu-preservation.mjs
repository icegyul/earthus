#!/usr/bin/env node
// Detect change; do not guess who changed it, call git, or roll anything back.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileDigest, relativePath } from './capture-menu-baseline.mjs';

export async function check(root, baseline, allowed = []) {
  if (!baseline || !Array.isArray(baseline.files) || !baseline.files.length) throw new Error('Baseline must contain a nonempty files array.');
  const names = baseline.files.map(file => relativePath(file.path));
  if (new Set(names).size !== names.length) throw new Error('Duplicate baseline paths.');
  const allow = new Set(allowed.map(relativePath));
  for (const name of allow) if (!names.includes(name)) throw new Error(`Allowed path is outside captured scope: ${name}`);
  const files = await Promise.all(baseline.files.map(async (before) => {
    if (before.sha256 !== null && !/^[a-fA-F0-9]{64}$/.test(before.sha256 || '')) throw new Error(`Invalid SHA-256: ${before.path}`);
    const after = await fileDigest(root, before.path);
    const beforeHash = before.sha256?.toLowerCase() ?? null;
    let change = beforeHash === after.sha256 ? 'UNCHANGED' : beforeHash === null ? 'ADDED' : after.sha256 === null ? 'DELETED' : 'MODIFIED';
    return { path: after.path, change,
      classification: change === 'UNCHANGED' ? 'PRESERVED' : allow.has(after.path) ? 'ALLOWED_CHANGE_REVIEW_REQUIRED' : 'UNATTRIBUTED_CHANGE_REVIEW_REQUIRED',
      beforeSha256: beforeHash, afterSha256: after.sha256 };
  }));
  return { schemaVersion: '1.0', checkedAt: new Date().toISOString(), capturedAt: baseline.capturedAt ?? null,
    scope: 'explicit-paths-only', tracked: files.length,
    preserved: files.filter(file => file.change === 'UNCHANGED').length,
    allowedChanges: files.filter(file => file.classification === 'ALLOWED_CHANGE_REVIEW_REQUIRED').length,
    unattributedChanges: files.filter(file => file.classification === 'UNATTRIBUTED_CHANGE_REVIEW_REQUIRED').length,
    files, limitations: ['Only captured paths are checked; this is not a repository-wide change audit.',
      'A hash difference cannot identify its author or prove a regression. Review concurrent changes; never restore automatically.',
      'An allowed change is not proof that current external edits or menu behavior were preserved.'] };
}

async function main() {
  let root = process.cwd(), baselineFile, output;
  const allowed = [];
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    if (flag === '--help') {
      console.log('node tools/research/check-menu-preservation.mjs --baseline <baseline.json> [--root <repo>] [--allow <exact-relative-file> ...] [--output <new-report.json>]');
      return;
    }
    if (!['--root', '--baseline', '--allow', '--output'].includes(flag) || !process.argv[i + 1]) throw new Error(`Unknown or incomplete argument: ${flag}`);
    const value = process.argv[++i];
    if (flag === '--root') root = path.resolve(value);
    if (flag === '--baseline') baselineFile = path.resolve(value);
    if (flag === '--allow') allowed.push(value);
    if (flag === '--output') output = path.resolve(value);
  }
  if (!baselineFile) throw new Error('--baseline is required.');
  const baseline = JSON.parse((await readFile(baselineFile, 'utf8')).replace(/^\uFEFF/, ''));
  const report = await check(root, baseline, allowed);
  if (output) {
    if (output === baselineFile || baseline.files.some(file => path.resolve(root, file.path) === output)) throw new Error('Output cannot replace baseline or tracked files.');
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.unattributedChanges) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
