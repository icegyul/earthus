#!/usr/bin/env node
// Build only this information-access release. Never edits prototype/v2-deploy,
// never scans dirty files into the payload, never uploads or deletes remote files.
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteV2Paths, relativeModuleSpecifiers } from './rewrite_v2_paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'out', 'information-release-20260905');
const OWNER = 'earthus-information-release-20260905';
const posix = value => value.split(path.sep).join('/');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const exists = async file => { try { await access(file); return true; } catch { return false; } };

const V1_FILES = [
  'js/layerbar.js', 'js/menu-information.js', 'css/menu-information.css', 'js/ui-events.js',
  'js/layers/space.js', 'js/launch-schedule.js', 'js/space/cosmic3d.js',
  'js/space/aetherus-dashboard.js', 'js/space/mission-readability.js',
  'js/space/mission-observer.js', 'css/aetherus-dashboard.css',
];
const V2_FILES = [
  'js/main.js', 'js/ui-shell.js', 'js/live-layers.js', 'js/engine-bridge.js',
  'js/event-room.js', 'js/travel.js', 'js/source-context.js', 'js/information-contract.js',
  'js/information-access.css', 'js/menu-guide.js', 'js/travel-catalog.js', 'js/travel-catalog.css',
  'data/tourism/kto-barrier-free.json', 'data/tourism/kto-wellness.json', 'data/tourism/kto-english.json',
];

function contentType(file) {
  if (/\.m?js$/i.test(file)) return 'text/javascript; charset=utf-8';
  if (/\.css$/i.test(file)) return 'text/css; charset=utf-8';
  if (/\.json$/i.test(file)) return 'application/json; charset=utf-8';
  if (/\.html$/i.test(file)) return 'text/html; charset=utf-8';
  throw new Error(`Unsupported payload MIME: ${file}`);
}

function inside(root, relative) {
  const resolved = path.resolve(root, relative);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) {
    throw new Error(`Path must remain inside ${root}: ${relative}`);
  }
  return resolved;
}

async function filesUnder(directory) {
  if (!await exists(directory)) return [];
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in release output: ${path.join(directory, entry.name)}`);
    if (entry.isDirectory()) result.push(...await filesUnder(path.join(directory, entry.name)));
    else if (entry.isFile()) result.push(path.join(directory, entry.name));
  }
  return result;
}

function parseExtras(args) {
  const extras = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--extra' || !args[i + 1]) throw new Error('Usage: node tools/build_information_release.mjs [--extra source/path=app/target/path]');
    const value = args[++i], split = value.indexOf('=');
    if (split < 1) throw new Error('--extra requires source/path=app/target/path');
    const source = value.slice(0, split).replace(/\\/g, '/');
    const key = value.slice(split + 1).replace(/\\/g, '/');
    if (!key.startsWith('app/') || key.split('/').includes('..') || source.split('/').includes('..')) throw new Error(`Invalid explicit extra: ${value}`);
    inside(ROOT, source); contentType(key);
    extras.push({ source, key, service: key.startsWith('app/v2/') ? 'v2' : 'v1',
      rewrite: source.startsWith('prototype/v2-three/js/') && /\.js$/.test(source), explicitExtra: true });
  }
  return extras;
}

async function build() {
  const startedAt = new Date().toISOString();
  const head = git(['rev-parse', 'HEAD']);
  const selections = [
    ...V1_FILES.map(file => ({ source: `prototype/${file}`, key: `app/${file}`, service: 'v1', rewrite: false })),
    ...V2_FILES.map(file => ({ source: `prototype/v2-three/${file}`, key: `app/v2/${file}`, service: 'v2', rewrite: file.endsWith('.js') })),
    ...parseExtras(process.argv.slice(2)),
  ];
  const keys = new Set();
  for (const item of selections) {
    if (keys.has(item.key)) throw new Error(`Duplicate release target: ${item.key}`);
    keys.add(item.key);
  }
  // The output is task-owned. Unexpected files are never swept or deleted.
  inside(ROOT, posix(path.relative(ROOT, OUTPUT)));
  const ownerFile = path.join(OUTPUT, '.information-release-owner.json');
  if (await exists(OUTPUT)) {
    const entries = await readdir(OUTPUT);
    if (entries.length && !await exists(ownerFile)) throw new Error('Release directory exists without this builder ownership marker; no files written.');
    if (await exists(ownerFile) && JSON.parse(await readFile(ownerFile, 'utf8')).owner !== OWNER) throw new Error('Release directory belongs to another task.');
  }
  const payloadRoot = path.join(OUTPUT, 'payload');
  for (const file of await filesUnder(payloadRoot)) {
    const key = posix(path.relative(payloadRoot, file));
    if (!keys.has(key)) throw new Error(`Unexpected old payload file retained, not deleted: ${key}. Include it explicitly or use a separately reviewed output.`);
  }

  const snapshots = [];
  let syntaxChecked = 0, jsonChecked = 0;
  for (const item of selections) {
    const sourcePath = inside(ROOT, item.source);
    const sourceBytes = await readFile(sourcePath);
    const sourceText = sourceBytes.toString('utf8');
    const rewrite = item.rewrite ? rewriteV2Paths(sourceText) : { code: sourceText, rewrites: [] };
    const payloadBytes = rewrite.rewrites.length ? Buffer.from(rewrite.code, 'utf8') : sourceBytes;
    if (/\.m?js$/.test(item.source)) {
      const checked = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: payloadBytes, encoding: 'utf8' });
      if (checked.status !== 0) throw new Error(`Payload syntax failed: ${item.source}\n${checked.stderr || checked.error || ''}`);
      syntaxChecked++;
    }
    if (item.source.endsWith('.json')) { JSON.parse(sourceText); jsonChecked++; }
    snapshots.push({ ...item, sourceBytes, payloadBytes, sourceText, payloadText: rewrite.code, rewrites: rewrite.rewrites });
  }

  const dependencyMap = new Map();
  for (const item of snapshots.filter(item => /\.m?js$/.test(item.source))) {
    const before = relativeModuleSpecifiers(item.sourceText);
    const after = relativeModuleSpecifiers(item.payloadText);
    for (let i = 0; i < after.length; i++) {
      const spec = after[i];
      const key = path.posix.normalize(path.posix.join(path.posix.dirname(item.key), spec.split(/[?#]/)[0]));
      if (!key.startsWith(item.service === 'v2' ? 'app/v2/' : 'app/')) throw new Error(`Module escapes service root: ${item.key} -> ${spec}`);
      if (keys.has(key)) continue;
      const original = before[i];
      const localSource = original ? posix(path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, item.source)), original.split(/[?#]/)[0]))) : null;
      if (!localSource || !await exists(inside(ROOT, localSource))) throw new Error(`Missing existing dependency: ${item.source} -> ${original || spec}`);
      const dep = dependencyMap.get(key) || { key, localReference: localSource, references: [],
        deploymentState: 'EXISTING_DEPENDENCY_REQUIRES_REMOTE_VERIFICATION' };
      dep.references.push({ from: item.key, specifier: spec }); dependencyMap.set(key, dep);
    }
  }
  for (const item of snapshots) {
    if (sha256(await readFile(inside(ROOT, item.source))) !== sha256(item.sourceBytes)) {
      throw new Error(`Source changed during build; rerun after editing finishes: ${item.source}`);
    }
  }
  if (git(['rev-parse', 'HEAD']) !== head) throw new Error('HEAD changed during build; rerun against the intended checkout.');

  const files = snapshots.map(item => ({
    service: item.service, source: item.source, key: item.key, payloadPath: `payload/${item.key}`,
    sourceSha256: sha256(item.sourceBytes), sha256: sha256(item.payloadBytes), bytes: item.payloadBytes.length,
    contentType: contentType(item.key), cacheControl: 'no-cache, max-age=0, must-revalidate',
    publicPath: `/${item.key.slice(4)}`, cloudFrontPath: `/${item.key.slice(4)}*`,
    transform: item.rewrites.length ? 'v2-path-rewrite' : 'byte-preserving-copy', rewrites: item.rewrites,
    ...(item.explicitExtra ? { explicitExtra: true } : {}),
  }));
  const manifest = {
    schemaVersion: 'earthus.information-release.v1', releaseId: OWNER, generatedAt: new Date().toISOString(), startedAt,
    source: { head, kind: 'WORKTREE_SNAPSHOT', sourceHashesAuthoritative: true,
      note: 'Selected working-tree bytes include existing edits in each listed file; HEAD is identity, not a claim of a clean tree.' },
    target: { bucket: 'earthus-cache-kr', prefix: 'app', region: 'us-east-2',
      distributionId: 'E193CZEBLWEB56', publicOrigin: 'https://earthus.net' },
    scope: { v1: V1_FILES.length, v2: V2_FILES.length, files: files.length, bytes: files.reduce((n, file) => n + file.bytes, 0),
      includesEntrypoints: files.some(file => /\/index\.html$/.test(file.key)), backendIncluded: false,
      note: 'Explicit static-file allowlist only. No recursive sync, vendor/engine recopy, or prototype/v2-deploy mutation.' },
    checks: { payloadJavaScriptSyntax: { passed: syntaxChecked }, jsonParse: { passed: jsonChecked },
      sourceStableDuringBuild: true, deploymentExecuted: false, browserValidation: 'PARENT_TASK', remoteBytesVerified: false },
    files,
    cloudFrontPaths: [...new Set(files.map(file => file.cloudFrontPath))],
    existingDependencies: [...dependencyMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    rollback: { requiredBeforeUpload: true, status: 'REMOTE_BACKUP_NOT_CAPTURED',
      instruction: 'Before changing any target, capture its current remote bytes plus Content-Type, Cache-Control, Content-Encoding, ETag, VersionId when available, and a SHA-256. Distinguish confirmed NoSuchKey from access denied. Rollback restores this remote snapshot, not Git HEAD.',
      suggestedDirectory: 'remote-before/',
      preserveExistingObjects: files.map(file => ({ key: file.key, backupPath: `remote-before/${file.key}`, state: 'UNREAD' })),
      missingObjectPolicy: 'Record confirmed absence explicitly; only confirmed newly created release objects may be removed during rollback.' },
    publicationGate: ['Rebuild after final source edits.', 'Capture and review remote-before backups.',
      'Verify the CloudFront distribution alias/origin and existing dependencies.',
      'Upload only manifest files with their declared MIME and cache metadata.',
      'Invalidate the listed CloudFront paths, verify public SHA/MIME, and complete browser checks.'],
  };
  await mkdir(OUTPUT, { recursive: true });
  await writeFile(ownerFile, JSON.stringify({ owner: OWNER }, null, 2) + '\n');
  for (const item of snapshots) {
    const destination = inside(payloadRoot, item.key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, item.payloadBytes);
  }
  await writeFile(path.join(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(OUTPUT, 'SHA256SUMS'), files.map(file => `${file.sha256}  ${file.payloadPath}`).join('\n') + '\n');
  await writeFile(path.join(OUTPUT, 'cloudfront-paths.json'), JSON.stringify(manifest.cloudFrontPaths, null, 2) + '\n');
  await writeFile(path.join(OUTPUT, 'BUILD.md'), `# 정보 접근성 선택 배포 후보\n\n`
    + `HEAD: ${head}\n\n정적 파일 ${files.length}개 · ${(manifest.scope.bytes / 1048576).toFixed(2)} MiB. 업로드·운영 백업·무효화는 실행하지 않았습니다.\n\n`
    + `최종 편집 후 다시 실행: \`node tools/build_information_release.mjs\`\n\n`
    + `- payload/app은 S3 app/에, payload/app/v2는 app/v2/에 대응합니다. manifest.json에 기록한 파일만 업로드합니다.\n`
    + `- v2 vendor/engine 경로만 내부화된 운영 위치로 변환합니다. 모듈 기준 new URL('../data/...', import.meta.url)는 보존합니다.\n`
    + `- 기존 vendor/engine와 외부 모듈은 포함하지 않습니다. existingDependencies의 운영 존재·호환성을 확인해야 합니다.\n`
    + `- 모든 대상의 이전 운영 바이트·메타데이터·해시를 remote-before/에 백업한 후 업로드합니다. 현재 manifest의 rollback 상태는 REMOTE_BACKUP_NOT_CAPTURED입니다.\n`
    + `- 롤백은 이 운영 백업을 복원합니다. 로컬 HEAD로 되돌리면 다른 작업자의 운영 변경을 잃을 수 있습니다.\n`
    + `- 엔트리 HTML·백엔드는 기본 목록에서 제외됩니다. 추가 정적 파일은 --extra source/path=app/target/path로 명시할 수 있습니다. 백엔드 배포는 별도 검증 묶음으로 처리합니다.\n`
    + `- 기존 prototype/v2-deploy와 다른 작업 파일은 읽어 복사하지도, 덮어쓰지도 않습니다.\n`);
  console.log(`PASS selected payload: ${files.length} files, ${syntaxChecked} JS syntax checks, ${jsonChecked} JSON checks`);
  console.log(`Manifest: ${path.join(OUTPUT, 'manifest.json')}`);
  console.log('NOT DEPLOYED · remote rollback backup still required');
}

build().catch(error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
