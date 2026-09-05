#!/usr/bin/env node
// 정보 접근성 선택 배포 — manifest 에 적힌 파일만 올린다 (build_information_release.mjs 의 publicationGate 실행).
//
//   node tools/upload_information_release.mjs            # 백업 → 의존성 확인 → 업로드 → 공개 해시 검증 → 무효화
//   node tools/upload_information_release.mjs --dry-run  # 백업·확인까지만
//
// 순서가 곧 안전장치다:
//   1. existingDependencies 가 운영에 있는지 HEAD 로 확인 — 없으면 아무것도 올리지 않는다(모듈 import 가 깨진다).
//   2. 바꿀 객체마다 현재 운영 바이트·메타를 remote-before/ 에 저장 — 롤백은 이 백업을 복원하는 것이다.
//   3. manifest 의 MIME·Cache-Control 그대로 put. 4. 공개 URL 의 SHA-256 이 manifest 와 같은지 확인.
//   5. CloudFront 무효화. 결과는 deploy-record.json 으로 남긴다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'out', 'information-release-20260905');
const DRY = process.argv.includes('--dry-run');
const PROFILE = process.env.EARTHUS_AWS_PROFILE || 'earthus-deploy';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const aws = (args, opts = {}) => execFileSync('aws', args, { encoding: 'buffer', env: { ...process.env, AWS_PROFILE: PROFILE, PYTHONUTF8: '1', MSYS_NO_PATHCONV: '1' }, stdio: ['ignore', 'pipe', 'pipe'], ...opts });

async function head(url) {
  const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  return { ok: res.ok, status: res.status, type: res.headers.get('content-type'), etag: res.headers.get('etag') };
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(OUTPUT, 'manifest.json'), 'utf8'));
  const { bucket, region, distributionId, publicOrigin } = manifest.target;
  const record = { releaseId: manifest.releaseId, head: manifest.source.head, startedAt: new Date().toISOString(), dryRun: DRY, dependencies: [], backups: [], uploads: [], verified: [], invalidation: null };

  console.log(`== 1/5 기존 의존성 ${manifest.existingDependencies.length}개 운영 존재 확인 ==`);
  let missing = 0;
  for (const dep of manifest.existingDependencies) {
    const url = `${publicOrigin}/${dep.key.replace(/^app\//, '')}`;
    const h = await head(url);
    record.dependencies.push({ key: dep.key, url, status: h.status });
    console.log(`   ${h.ok ? 'OK ' : 'MISSING'} ${h.status} ${dep.key}`);
    if (!h.ok) missing++;
  }
  if (missing) throw new Error(`운영에 없는 의존성 ${missing}개 — 올리면 import 가 깨진다. 먼저 번들 배포(deploy-v2-three.sh)로 맞출 것.`);

  console.log(`== 2/5 운영 백업 remote-before/ (${manifest.files.length}개) ==`);
  const backupRoot = path.join(OUTPUT, 'remote-before');
  for (const file of manifest.files) {
    const dest = path.join(backupRoot, file.key);
    await mkdir(path.dirname(dest), { recursive: true });
    // 이미 백업이 있으면 건드리지 않는다 — 업로드 뒤 다시 돌리면 새 바이트가 "이전"으로 둔갑한다.
    try {
      const prior = JSON.parse(await readFile(`${dest}.meta.json`, 'utf8'));
      record.backups.push({ ...prior, reused: true }); console.log(`   보존  ${file.key} (이전 백업 유지)`); continue;
    } catch { /* 백업 없음 — 아래에서 받는다 */ }
    let meta;
    try {
      const out = aws(['s3api', 'head-object', '--bucket', bucket, '--key', file.key, '--region', region]);
      meta = JSON.parse(out.toString('utf8'));
      aws(['s3api', 'get-object', '--bucket', bucket, '--key', file.key, '--region', region, dest]);
      const bytes = await readFile(dest);
      const entry = { key: file.key, state: 'BACKED_UP', sha256: sha256(bytes), bytes: bytes.length, contentType: meta.ContentType, cacheControl: meta.CacheControl, etag: meta.ETag, lastModified: meta.LastModified };
      await writeFile(`${dest}.meta.json`, JSON.stringify(entry, null, 2) + '\n');
      record.backups.push(entry);
      console.log(`   백업 ${file.key} (${bytes.length} B${entry.sha256 === file.sha256 ? ' · 동일 — 변경 없음' : ''})`);
    } catch (error) {
      const text = String(error.stderr || error.message || error);
      if (/404|Not Found|NoSuchKey/.test(text)) { record.backups.push({ key: file.key, state: 'CONFIRMED_ABSENT' }); console.log(`   없음  ${file.key} (새 객체)`); }
      else throw new Error(`백업 실패 ${file.key}: ${text.slice(0, 200)}`);
    }
  }

  if (DRY) { record.finishedAt = new Date().toISOString(); await writeFile(path.join(OUTPUT, 'deploy-record.json'), JSON.stringify(record, null, 2) + '\n'); console.log('DRY RUN — 업로드하지 않음'); return; }

  console.log('== 3/5 업로드 ==');
  for (const file of manifest.files) {
    const local = path.join(OUTPUT, file.payloadPath);
    const bytes = await readFile(local);
    if (sha256(bytes) !== file.sha256) throw new Error(`payload 가 manifest 와 다르다: ${file.key} — 다시 빌드할 것`);
    const backup = record.backups.find(b => b.key === file.key);
    if (backup && backup.sha256 === file.sha256 && backup.contentType === file.contentType) { record.uploads.push({ key: file.key, state: 'UNCHANGED' }); console.log(`   같음  ${file.key}`); continue; }
    aws(['s3api', 'put-object', '--bucket', bucket, '--key', file.key, '--region', region, '--body', local,
      '--content-type', file.contentType, '--cache-control', file.cacheControl]);
    record.uploads.push({ key: file.key, state: 'UPLOADED', sha256: file.sha256, bytes: file.bytes });
    console.log(`   올림  ${file.key}`);
    // 디렉터리 키(app/v2/)가 S3 에 따로 있다 — CloudFront 의 /v2/ 는 그 객체를 낸다. index.html 만 갱신하면
    // /v2/index.html 은 새것, /v2/ 는 옛것이 된다(실측 2026-09-05: 9/4자 HTML 이 하루 더 나갔다). 같이 덮는다.
    if (file.key.endsWith('/index.html')) {
      const dirKey = file.key.slice(0, -'index.html'.length);
      aws(['s3api', 'put-object', '--bucket', bucket, '--key', dirKey, '--region', region, '--body', local,
        '--content-type', file.contentType, '--cache-control', 'no-cache, no-store, must-revalidate']);
      record.uploads.push({ key: dirKey, state: 'UPLOADED_DIR_MIRROR', sha256: file.sha256, bytes: file.bytes });
      console.log(`   올림  ${dirKey} (디렉터리 키 거울)`);
    }
  }

  console.log('== 4/5 무효화 ==');
  // 와일드카드(*) 무효화는 동시 진행 15개 한도가 있다(실측 2026-09-05 TooManyInvalidationsInProgress).
  // 정확한 경로는 한도가 3,000개라 파일마다 정확한 경로로 낸다. 쿼리(?v=)는 CloudFront 캐시 키에 따라 다르므로 두 경로(정확·와일드카드 최소)를 함께.
  const exact = manifest.files.flatMap(file => (file.publicPath.endsWith('/index.html') ? [file.publicPath, file.publicPath.slice(0, -'index.html'.length)] : [file.publicPath]));
  const wild = ['/v2/*', '/js/*', '/css/*'].filter(w => manifest.files.some(f => f.publicPath.startsWith(w.slice(0, -1))));
  let paths = [...exact, ...wild];
  let inv;
  try { inv = JSON.parse(aws(['cloudfront', 'create-invalidation', '--distribution-id', distributionId, '--paths', ...paths]).toString('utf8')); }
  catch (error) {
    if (!/TooManyInvalidationsInProgress/.test(String(error.stderr || error))) throw error;
    console.log('   와일드카드 한도 — 정확한 경로만으로 다시');
    paths = exact; inv = JSON.parse(aws(['cloudfront', 'create-invalidation', '--distribution-id', distributionId, '--paths', ...paths]).toString('utf8'));
  }
  record.invalidation = { id: inv.Invalidation.Id, status: inv.Invalidation.Status, paths: paths.length };
  console.log(`   ${inv.Invalidation.Id} ${inv.Invalidation.Status} (${paths.length}개 경로)`);

  console.log('== 5/5 공개 해시 검증 (최대 90초 대기) ==');
  for (const file of manifest.files) {
    const url = `${publicOrigin}${file.publicPath}`;
    let ok = false, got = null;
    for (let attempt = 0; attempt < 18 && !ok; attempt++) {
      const res = await fetch(`${url}?verify=${Date.now()}`, { cache: 'no-store' });
      got = sha256(Buffer.from(await res.arrayBuffer()));
      ok = res.ok && got === file.sha256;
      if (!ok) await new Promise(r => setTimeout(r, 5000));
    }
    record.verified.push({ key: file.key, url, ok, sha256: got });
    console.log(`   ${ok ? 'PASS' : 'FAIL'} ${file.publicPath}`);
  }
  record.finishedAt = new Date().toISOString();
  await writeFile(path.join(OUTPUT, 'deploy-record.json'), JSON.stringify(record, null, 2) + '\n');
  const failed = record.verified.filter(v => !v.ok).length;
  console.log(failed ? `⚠️ 공개 해시 불일치 ${failed}개 — CloudFront 전파 대기 후 다시 검증할 것` : `완료 — ${record.uploads.filter(u => u.state === 'UPLOADED').length}개 올림, 전부 공개 해시 일치`);
  if (failed) process.exitCode = 2;
}

main().catch(error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
