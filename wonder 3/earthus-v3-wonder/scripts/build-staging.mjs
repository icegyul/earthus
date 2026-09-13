#!/usr/bin/env node
// EARTHUS V3 WONDER — STAGING 정적 빌드 (PD "STAGING DEPLOYMENT FOR DEVICE GATE")
//
// 개발 트리를 그대로 올리지 않는다. 브라우저가 실제로 읽는 것만 build/staging/ 에 모은다:
//   apps/web (html·css·mjs) · packages/*/src/*.mjs + shared/vendor/three · content 중 런타임이 읽는 파일
// 빼는 것: docs · tests · scripts · benchmarks · package.json · README · *.ts 계약 · content 의 검수/출처/QA JSON ·
//         불합격 배경 24장(무대가 절대 그리지 않으므로 올리지 않는다) · source-manifest(로컬 경로 기록)
// 번들러 없음(ESM 그대로). 124 캐릭터 런타임 WebP 는 전부 올리되 on-demand 로만 받는다(eager loading 0 — 코드가 그렇다).
//   node scripts/build-staging.mjs [--out build/staging]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
// target 별 출력 폴더·base href·S3 prefix·URL (PD 2026-09-13: wonder-test = 터미널을 닫아도 남는 상시 테스트 URL)
const TARGETS = {
  next: { out: 'build/staging', base: '/wonder/next/apps/web/', s3Prefix: 'app/wonder/next/', url: 'https://earthus.net/wonder/next/apps/web/' },
  'wonder-test': { out: 'build/wonder-test', base: '/wonder-test/apps/web/', s3Prefix: 'app/wonder-test/', url: 'https://earthus.net/wonder-test/' },
};
const TARGET = args.includes('--target') ? args[args.indexOf('--target') + 1] : 'next';
if (!TARGETS[TARGET]) throw new Error(`알 수 없는 target: ${TARGET} (next | wonder-test)`);
const T = TARGETS[TARGET];
const OUT = path.resolve(ROOT, args.includes('--out') ? args[args.indexOf('--out') + 1] : T.out);

// 허용 목록 (프로젝트 루트 기준 상대경로 → 조건)
const ALLOW = [
  ['apps/web', p => /\.(html|css|mjs)$/.test(p) && !p.includes('/vendor/')],
  ['packages', p => (/\/src\/[^/]+\.mjs$/.test(p)) || /packages\/shared\/vendor\/three\/(three-r184\.module\.min\.js|three\.core\.min\.js|three-r184-LICENSE\.txt)$/.test(p)],
  ['content/geo', p => p.endsWith('country-reference.json')],
  ['content/environments', p => p.endsWith('environments.json')],
  ['content/stories', p => p.endsWith('stories.json')],
  ['content/landmarks', p => /\.(webp|json)$/.test(p)],
  ['content/backgrounds', p => p.endsWith('regions.json')],
  ['content/registry', p => p.endsWith('asset-registry.json')],
  ['content/characters', p => p.endsWith('manifest-124.json') || /\/(runtime|thumb)\/[^/]+\.webp$/.test(p)],
  ['content/pack-1.8', p => p.endsWith('background-review.json') || /\/fx\/[^/]+\.svg$/.test(p)],
  ['assets', p => p === 'assets/background_manifest.json' || /^assets\/background\/[^/]+\.webp$/.test(p)                       // Background Pack v1 (품질 보고서·팩 manifest 사본은 안 올린다)
    || p === 'assets/material/paper_earth_material_manifest.json' || /^assets\/material\/paper-earth\/[^/]+\.webp$/.test(p)   // Paper Earth Material v1 (첫 화면 뒤 on-demand)
    // WONDER EARTH ASSETS v2.0 — 기본 지구. **런타임이 실제로 받는 것만** 올린다:
    // 대륙 벡터 7장(294KB) + 북극 얼음 마스크 1장. 대륙 color.avif·height·normal 은 쓰지 않으므로 올리지 않는다
    // (normal 7장은 실측상 평평해서 정보가 없다 — assets/earth_v2_manifest.json 의 defects 참고).
    || p === 'assets/earth_v2_manifest.json'
    || /^assets\/earth-v2\/continents\/[^/]+\/shape\.svg$/.test(p)
    || p === 'assets/earth-v2/polar/arctic/ice_mask.png'
    // v1.2 기복도 팩 — ?earth=assets 비교용(기본 경로가 아니다)
    || p === 'assets/earth/earth_assets_manifest.json' || /^assets\/earth\/(continents|oceans|polar|shared)\/.+\.(avif|png)$/.test(p)],
];
const DENY_HINT = ['docs/', 'tests/', 'scripts/', 'benchmarks/', 'build/', 'node_modules/', 'package.json', 'README.md', '.ts', 'source-manifest', 'background-qa', 'background-catalog', 'characters-124-interactions', 'replacement-manifest', 'runtime-overrides', 'review.json', 'pack-1.8/backgrounds/'];

const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); e.isDirectory() ? walk(p, out) : out.push(p); } return out; };
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let files = [], bytes = 0;
for (const [base, pred] of ALLOW) {
  const dir = path.join(ROOT, base); if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const r = rel(f); if (!pred(r)) continue;
    if (DENY_HINT.some(h => r.includes(h) && !r.startsWith('content/pack-1.8/fx/') && !(h === 'review.json' && r.endsWith('background-review.json')))) throw new Error(`금지 항목이 허용 목록을 통과했다: ${r}`);
    const dst = path.join(OUT, r); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(f, dst);
    const st = fs.statSync(f); files.push({ path: r, bytes: st.size }); bytes += st.size;
  }
}
// 디렉터리 주소용 사본: S3 REST 오리진은 /…/apps/web/ 에 index.html 을 붙여 주지 않는다 → 배포 스크립트가 키 "…/apps/web/" 로 올린다.
// /wonder/next/ 와 /wonder/next 는 <base href> 를 얹은 사본으로(legacy 와 같은 관례).
const indexHtml = fs.readFileSync(path.join(OUT, 'apps/web/index.html'), 'utf8');
const withBase = indexHtml.replace(/<head>\s*/, m => `${m}<base href="${T.base}">\n  `);
if (!withBase.includes(`<base href="${T.base}">`)) throw new Error('base href 삽입 실패');
fs.writeFileSync(path.join(OUT, '_index-base-next.html'), withBase);

const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
let commit = 'unknown', appCommit = 'unknown', dirty = null;
try {
  commit = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  appCommit = execSync('git log -1 --format=%H -- apps packages content', { cwd: ROOT }).toString().trim();   // 실제로 올라가는 코드·콘텐츠의 마지막 커밋 (docs 만 바뀐 HEAD 와 구분)
  dirty = execSync('git status --porcelain -- "wonder 3"', { cwd: path.resolve(ROOT, '..', '..') }).toString().trim().split('\n').filter(Boolean).length;
} catch { /* */ }
const build = { project: 'earthus-v3-wonder', target: TARGET, s3Prefix: T.s3Prefix, url: T.url, baseHref: T.base, commit, appCommit, wonder3Uncommitted: dirty, builtAt: new Date().toISOString(), files: files.length, bytes,
  byKind: files.reduce((m, f) => { const k = f.path.startsWith('apps/') ? 'app' : f.path.startsWith('packages/shared/vendor') ? 'vendor' : f.path.startsWith('packages/') ? 'packages' : /characters\/runtime/.test(f.path) ? 'character-runtime' : /characters\/thumb/.test(f.path) ? 'character-thumb' : /landmarks\/.*webp/.test(f.path) ? 'landmark' : f.path.endsWith('.svg') ? 'fx' : 'data'; m[k] = (m[k] ?? 0) + 1; return m; }, {}),
  serviceWorker: false, eagerCharacterLoad: false, hashes: Object.fromEntries(files.filter(f => /\.(html|mjs|css|json)$/.test(f.path)).map(f => [f.path, sha(path.join(OUT, f.path))])) };
fs.writeFileSync(path.join(OUT, 'BUILD.json'), JSON.stringify(build, null, 2) + '\n');
// 금지 항목 최종 검사
const bad = walk(OUT).map(p => path.relative(OUT, p).split(path.sep).join('/')).filter(r => DENY_HINT.some(h => r.includes(h)) && !r.startsWith('content/pack-1.8/fx/') && !r.endsWith('background-review.json'));
if (bad.length) throw new Error('빌드에 금지 항목이 있다: ' + bad.join(', '));
console.log(`✓ ${TARGET} build → ${path.relative(ROOT, OUT)}  files ${files.length}  ${(bytes / 1048576).toFixed(2)} MB  HEAD ${commit.slice(0, 8)} · app ${appCommit.slice(0, 8)}${dirty ? ` (미커밋 ${dirty})` : ''}  base ${T.base}`);
console.log('  ' + Object.entries(build.byKind).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('  제외: docs · tests · scripts · benchmarks · *.ts · 검수/QA/출처 JSON · 불합격 배경 24장 · 서비스워커 없음');
