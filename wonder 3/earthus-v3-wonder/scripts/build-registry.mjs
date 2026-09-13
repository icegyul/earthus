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
  : r.startsWith('backgrounds/') && r.endsWith('.json') ? 'data'
  : r.startsWith('geo/') && r.endsWith('.json') ? 'data'
  : r.startsWith('characters/') && r.endsWith('.json') ? 'data'
  : r.startsWith('pack-1.8/') && r.endsWith('.json') ? 'data' : 'other';
const sourceOf = r => r.startsWith('pack-1.8/') ? 'pack-1.8' : r.startsWith('geo/') ? 'natural-earth' : r.startsWith('characters/runtime/') ? 'legacy-pack124→runtime-webp' : 'earthus-v3-wonder';
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
    load: kind === 'background' ? 'region-lazy' : kind.startsWith('character') ? 'on-demand' : kind === 'fx' ? 'preload' : 'boot',
  });
}
assets.sort((a, b) => a.path.localeCompare(b.path));

// ── 2. 팩 카탈로그 대조 ───────────────────────────────────────────────
const catalog = JSON.parse(fs.readFileSync(path.join(CONTENT, 'pack-1.8', 'background-catalog.json'), 'utf8'));
const problems = [];
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
  return {
    index: l?.index ?? null,
    ...r,
    place_basis: l?.place_basis ?? null,
    art: { character, scene, status: character ? 'ready' : 'pending-conversion' },
  };
});
manifest.sort((a, b) => (a.index ?? 9999) - (b.index ?? 9999));

// ── 4. 쓰기 / 검사 ────────────────────────────────────────────────────
const registry = {
  schema: 'earthus-v3-wonder/asset-registry@0',
  project: 'EARTHUS V3 WONDER (NEW BUILD)',
  sources: {
    'pack-1.8': { file: 'wonder 3/EARTHUS_V3_WONDER_1.8_INTERACTION_BACKGROUND_ASSET_PACK.zip', sha256: PACK_ZIP_SHA256, note: '배경 24·FX 5·카탈로그·124 인터랙션 JSON. 중복 JSON(character-interactions-124.json) 은 등록하지 않음' },
    'legacy-pack124': { file: 'prototype/v3-paper/pack124 (== prototype/v3-kids/pack124)', note: '124 PNG 원본은 등록하지 않는다. content/characters/runtime/ 의 변환본만 등록. 승인 원본은 v3_CHARACTERS/EARTHUS_V3_CHARACTERS_124' },
  },
  counts: {
    assets: assets.length,
    backgrounds: bgCount,
    backgrounds_usable: bgUsable,
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
