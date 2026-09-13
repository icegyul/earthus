#!/usr/bin/env node
// EARTHUS V3 WONDER — Asset Registry 빌더 (PHASE 0)
//
// content/ 아래 실제 파일을 걸어 다니며 sha256·bytes 를 재고 하나의 색인으로 쓴다.
//   · 팩 1.8 카탈로그(background-catalog.json)의 sha256_12 와 실측 해시를 대조한다 — 하나라도 다르면 실패.
//   · 124종 manifest 는 팩 1.8 JSON(인터랙션) + 기존 manifest(index/place_basis/raw_fallback)를 병합한다.
//     기존 manifest 는 저장소 `prototype/v3-paper/pack124/docs/` 에서 **읽기만** 한다.
//   · 캐릭터 그림은 content/characters/runtime/ 에 실제로 있는 것만 `art` 에 적는다. 없으면 null + status.
// 레거시 런타임 번들·PNG 원본은 등록하지 않는다 (CLEANUP 지시서 §12).
//
//   node scripts/build-registry.mjs [--legacy-manifest <path>] [--check]
//     --check : 파일을 쓰지 않고 기존 registry 와 비교만 한다 (tests 가 쓴다)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../packages/interaction-runtime/src/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const CHECK = args.includes('--check');
const LEGACY_MANIFEST = flag('--legacy-manifest',
  path.resolve(ROOT, '..', '..', 'prototype', 'v3-paper', 'pack124', 'docs', 'EARTHUS_V3_RUNTIME_MANIFEST_124.json'));
const PACK_ZIP_SHA256 = '5d39bc2b1e9ca531e02ca2b5bfb8c0f23987c788cfcf95c476bdb2b20d8b679b'; // wonder 3/EARTHUS_V3_WONDER_1.8_…zip (2026-09-13 실측)

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = p => path.relative(CONTENT, p).split(path.sep).join('/');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};

// ── 1. 파일 실측 ──────────────────────────────────────────────────────
const files = walk(CONTENT).filter(p => !p.startsWith(path.join(CONTENT, 'registry')) && !p.endsWith('manifest-124.json'));
const assets = [];
const kindOf = r => r.startsWith('pack-1.8/backgrounds/') ? 'background'
  : r.startsWith('pack-1.8/fx/') ? 'fx'
  : r.startsWith('characters/runtime/') ? (r.endsWith('_scene.webp') ? 'character-scene' : 'character')
  : r.startsWith('characters/thumb/') ? 'character-thumb'
  : r.startsWith('landmarks/') && r.endsWith('.webp') ? 'landmark'
  : r.startsWith('landmarks/') && r.endsWith('.json') ? 'data'
  : r.startsWith('environments/') && r.endsWith('.json') ? 'data'
  : r.startsWith('stories/') && r.endsWith('.json') ? 'data'
  : r.startsWith('backgrounds/') && r.endsWith('.json') ? 'data'
  : r.startsWith('geo/') && r.endsWith('.json') ? 'data'
  : r.startsWith('characters/') && r.endsWith('.json') ? 'data'
  : r.startsWith('pack-1.8/') && r.endsWith('.json') ? 'data' : 'other';
const sourceOf = r => r.startsWith('pack-1.8/') ? 'pack-1.8' : r.startsWith('geo/') ? 'natural-earth' : r.startsWith('characters/runtime/') || r.startsWith('characters/thumb/') ? 'legacy-pack124→runtime-webp' : r.startsWith('landmarks/') && r.endsWith('.webp') ? 'legacy-v3-paper-atlas' : 'earthus-v3-wonder';
for (const f of files) {
  const r = rel(f);
  const kind = kindOf(r);
  const st = fs.statSync(f);
  assets.push({
    id: path.basename(r).replace(/\.[a-z0-9]+$/i, ''),
    kind,
    path: r,
    bytes: st.size,
    sha256: sha256(f),
    source: sourceOf(r),
    load: kind === 'background' ? 'region-lazy' : kind === 'landmark' ? 'region-lazy' : kind === 'character-thumb' ? 'lod1' : kind.startsWith('character') ? 'on-demand' : kind === 'fx' ? 'preload' : 'boot',
  });
}
assets.sort((a, b) => a.path.localeCompare(b.path));

// ── 1-B. Background Pack v1 (assets/background/, PD 2026-09-13) ─────────────────────────────
// content/ 밖 독립 콘텐츠. manifest(assets/background_manifest.json) 의 24 항목을 실제 파일과 대조해 등록한다.
// 필수 필드: id·category·slug·region·path·width·height·format·bytes·version·hash·status. REJECT 는 load 가 막힌 채로 등록만 된다.
const BG_MANIFEST = path.join(ROOT, 'assets', 'background_manifest.json');
const bgPack = fs.existsSync(BG_MANIFEST) ? JSON.parse(fs.readFileSync(BG_MANIFEST, 'utf8')) : null;
const bgProblems = [];
if (bgPack) {
  const seenId = new Set(), seenPath = new Set();
  for (const b of bgPack.assets) {
    const f = path.join(ROOT, b.path);
    if (!fs.existsSync(f)) { bgProblems.push(`배경 파일 없음: ${b.path}`); continue; }
    const st = fs.statSync(f), hash = sha256(f);
    if (st.size !== b.bytes) bgProblems.push(`배경 bytes 불일치: ${b.path} manifest ${b.bytes} ≠ 실제 ${st.size}`);
    if (hash !== b.sha256) bgProblems.push(`배경 sha256 불일치: ${b.path}`);
    if (seenId.has(b.id)) bgProblems.push(`배경 id 중복: ${b.id}`); seenId.add(b.id);
    if (seenPath.has(b.path)) bgProblems.push(`배경 path 중복: ${b.path}`); seenPath.add(b.path);
    for (const k of ['id', 'category', 'slug', 'region', 'path', 'width', 'height', 'format', 'bytes', 'version', 'sha256', 'status']) if (b[k] === undefined) bgProblems.push(`배경 필드 없음: ${b.id}.${k}`);
    assets.push({
      id: b.id, kind: 'environment-background', root: 'project', path: b.path, category: b.category, slug: b.slug, region: b.region, geo: b.geo ?? null,
      width: b.width, height: b.height, format: b.format, bytes: st.size, sha256: hash, version: b.version, status: b.status, productionStatus: b.productionStatus,
      safeCropPx: b.safeCropPx, focal: b.focal, source: 'background-pack-v1',
      load: b.status === 'REJECT' ? 'blocked-by-review' : (b.load ?? (b.category === 'world' || b.category === 'atmosphere' ? 'on-demand' : 'region-lazy')),
    });
  }
  const actual = fs.readdirSync(path.join(ROOT, 'assets', 'background')).filter(x => x.endsWith('.webp')).length;
  if (actual !== bgPack.assets.length || bgPack.count !== bgPack.assets.length) bgProblems.push(`배경 manifest ${bgPack.assets.length} ≠ 실제 파일 ${actual}`);
}
const bgPackAssets = assets.filter(a => a.kind === 'environment-background');

// ── 1-C. Paper Earth Material v1 (assets/material/, PD 2026-09-13) ────────────────────────
// 지구 표면의 종이 재질. 지리가 구워져 있지 않고(geography_baked=false) 첫 그림 뒤에 받아 갈아 끼운다.
const MAT_MANIFEST = path.join(ROOT, 'assets', 'material', 'paper_earth_material_manifest.json');
const matPack = fs.existsSync(MAT_MANIFEST) ? JSON.parse(fs.readFileSync(MAT_MANIFEST, 'utf8')) : null;
if (matPack) {
  for (const t of matPack.textures) {
    const f = path.join(ROOT, t.path);
    if (!fs.existsSync(f)) { bgProblems.push(`재질 파일 없음: ${t.path}`); continue; }
    const st = fs.statSync(f), hash = sha256(f);
    if (st.size !== t.bytes) bgProblems.push(`재질 bytes 불일치: ${t.path}`);
    if (hash !== t.sha256) bgProblems.push(`재질 sha256 불일치: ${t.path}`);
    assets.push({ id: t.id, kind: 'paper-material', root: 'project', path: t.path, role: t.role, layer: t.layer,
      width: t.width, height: t.height, format: t.format, bytes: st.size, sha256: hash, version: matPack.version,
      wrap: t.wrap, usedInV1: t.usedInV1, source: 'paper-earth-material-v1', load: 'on-demand' });
  }
  const actual = fs.readdirSync(path.join(ROOT, 'assets', 'material', 'paper-earth')).filter(x => x.endsWith('.webp')).length;
  if (actual !== matPack.textures.length || matPack.count !== matPack.textures.length) bgProblems.push(`재질 manifest ${matPack.textures.length} ≠ 실제 파일 ${actual}`);
}
const matAssets = assets.filter(a => a.kind === 'paper-material');

// ── 2. 팩 카탈로그 대조 ───────────────────────────────────────────────
const catalog = JSON.parse(fs.readFileSync(path.join(CONTENT, 'pack-1.8', 'background-catalog.json'), 'utf8'));
const problems = [...bgProblems];
for (const c of catalog) {
  const a = assets.find(x => x.kind === 'background' && x.id === c.id);
  if (!a) { problems.push(`카탈로그에 있는데 파일이 없다: ${c.id}`); continue; }
  if (a.bytes !== c.bytes) problems.push(`bytes 불일치 ${c.id}: 카탈로그 ${c.bytes} vs 실측 ${a.bytes}`);
  if (!a.sha256.startsWith(c.sha256_12)) problems.push(`sha256 불일치 ${c.id}: 카탈로그 ${c.sha256_12} vs 실측 ${a.sha256.slice(0, 12)}`);
}
const bgCount = assets.filter(a => a.kind === 'background').length;
if (bgCount !== catalog.length) problems.push(`배경 수 불일치: 카탈로그 ${catalog.length} vs 파일 ${bgCount}`);

// 눈 검수 결과(background-review.json)를 배경 자산에 붙인다. 검수 없는 배경은 오류다 — 검수 안 된 그림을 무대에 올리지 않는다.
const review = JSON.parse(fs.readFileSync(path.join(CONTENT, 'pack-1.8', 'background-review.json'), 'utf8'));
for (const a of assets.filter(x => x.kind === 'background')) {
  const v = review.backgrounds[a.id];
  if (!v) { problems.push(`검수 기록이 없는 배경: ${a.id}`); continue; }
  a.review = v.verdict; a.review_category = v.category;
  if (v.verdict !== 'ok') a.load = 'blocked-by-review';
}
const bgUsable = assets.filter(a => a.kind === 'background' && a.review === 'ok').length;

// ── 3. 124종 manifest 병합 ────────────────────────────────────────────
const packChars = JSON.parse(fs.readFileSync(path.join(CONTENT, 'pack-1.8', 'characters-124-interactions.json'), 'utf8'));
const { rows, errors, counts } = validateManifest(packChars);
for (const e of errors) problems.push(`manifest ${e.slug}: ${e.reason}`);
let legacy = null;
if (fs.existsSync(LEGACY_MANIFEST)) {
  const lj = JSON.parse(fs.readFileSync(LEGACY_MANIFEST, 'utf8'));
  legacy = new Map((lj.characters ?? []).map(c => [c.slug, c]));
} else {
  problems.push(`기존 manifest 를 못 찾았다(읽기 전용 참조): ${LEGACY_MANIFEST}`);
}
const artOf = (slug, suffix) => {
  const r = `characters/runtime/${slug}${suffix}.webp`;
  return assets.some(a => a.path === r) ? r : null;
};
const manifest = rows.map(r => {
  const l = legacy?.get(r.slug);
  if (legacy && !l) problems.push(`기존 manifest 에 없는 slug: ${r.slug}`);
  if (l && (Math.abs(Number(l.lat) - r.lat) > 0.01 || Math.abs(Number(l.lon) - r.lon) > 0.01)) problems.push(`좌표가 기존 manifest 와 다름: ${r.slug}`);
  const character = artOf(r.slug, ''), scene = artOf(r.slug, '_scene');
  const thumbRel = `characters/thumb/${r.slug}.webp`, thumb = assets.some(a => a.path === thumbRel) ? thumbRel : null;
  return {
    index: l?.index ?? null,
    ...r,
    place_basis: l?.place_basis ?? null,
    art: { thumb, character, scene, status: character ? 'ready' : 'pending-conversion' },
  };
});
manifest.sort((a, b) => (a.index ?? 9999) - (b.index ?? 9999));

// ── 4. 쓰기 / 검사 ────────────────────────────────────────────────────
const registry = {
  schema: 'earthus-v3-wonder/asset-registry@0',
  project: 'EARTHUS V3 WONDER (NEW BUILD)',
  sources: {
    'pack-1.8': { file: 'wonder 3/EARTHUS_V3_WONDER_1.8_INTERACTION_BACKGROUND_ASSET_PACK.zip', sha256: PACK_ZIP_SHA256, note: '배경 24·FX 5·카탈로그·124 인터랙션 JSON. 중복 JSON(character-interactions-124.json) 은 등록하지 않음' },
    'background-pack-v1': bgPack ? { file: 'wonder 3/EARTHUS_V3_WONDER_BACKGROUND_PACK_v1.zip', sha256: bgPack.sourcePack?.sha256 ?? null, manifest: 'assets/background_manifest.json', qualityReport: 'assets/background_quality_report.json', note: '24장(world 1·korea 4·atmosphere 3·region 16) 1920×1080 WebP. 2026-09-13 검수: 내용 위반 0, 시트 여백/잔재·≈480p 로 production REJECT, REVIEW(safe-crop 후보) 로만 로드' } : null,
    'paper-earth-material-v1': matPack ? { file: 'wonder 3/material pack_01/EARTHUS_V3_WONDER_PAPER_EARTH_MATERIAL_v1.zip', sha256: matPack.sourcePack?.sha256 ?? null, manifest: 'assets/material/paper_earth_material_manifest.json', note: '종이 재질 10장(2048²). 지리 미포함. v1 은 8장 사용, height·edge_softmask 는 등록만' } : null,
    'legacy-pack124': { file: 'prototype/v3-paper/pack124 (== prototype/v3-kids/pack124)', note: '124 PNG 원본은 등록하지 않는다. content/characters/runtime/ 의 변환본만 등록. 승인 원본은 v3_CHARACTERS/EARTHUS_V3_CHARACTERS_124' },
  },
  counts: {
    assets: assets.length,
    backgrounds: bgCount,
    backgrounds_usable: bgUsable,
    paper_material: matAssets.length,
    paper_material_used_v1: matAssets.filter(a => a.usedInV1).length,
    environment_backgrounds: bgPackAssets.length,
    environment_backgrounds_loadable: bgPackAssets.filter(a => a.load !== 'blocked-by-review').length,
    environment_backgrounds_by_status: bgPackAssets.reduce((m, a) => (m[a.status] = (m[a.status] ?? 0) + 1, m), {}),
    fx: assets.filter(a => a.kind === 'fx').length,
    characters_ready: manifest.filter(m => m.art.status === 'ready').length,
    characters_pending: manifest.filter(m => m.art.status !== 'ready').length,
    manifest: { total: manifest.length, ...counts },
  },
  assets,
};
const regPath = path.join(CONTENT, 'registry', 'asset-registry.json');
const manPath = path.join(CONTENT, 'characters', 'manifest-124.json');
const stable = o => JSON.stringify(o, null, 2) + '\n';

if (problems.length) {
  console.error('✗ registry 실패');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
if (CHECK) {
  const same = fs.existsSync(regPath) && fs.readFileSync(regPath, 'utf8') === stable(registry)
    && fs.existsSync(manPath) && fs.readFileSync(manPath, 'utf8') === stable(manifest);
  console.log(same ? '✓ registry 최신' : '✗ registry 가 실제 파일과 다르다 — node scripts/build-registry.mjs 를 다시 돌릴 것');
  process.exit(same ? 0 : 2);
}
fs.mkdirSync(path.dirname(regPath), { recursive: true });
fs.writeFileSync(regPath, stable(registry));
fs.writeFileSync(manPath, stable(manifest));
console.log(`✓ registry: assets ${assets.length} (배경 ${bgCount} 중 사용 가능 ${bgUsable}, fx ${registry.counts.fx}, 캐릭터 그림 ${registry.counts.characters_ready}/124 준비)`);
console.log(`✓ manifest-124: ${manifest.length}종, 오류 0, folklore ${counts.folklore} · prehistoric ${counts.prehistoric} · animal ${counts.animal}`);
