import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBackground, haversineKm } from '../packages/stage-engine/src/background-resolver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const REG = path.join(CONTENT, 'registry', 'asset-registry.json');
const MAN = path.join(CONTENT, 'characters', 'manifest-124.json');
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('registry 가 존재하고 실제 파일과 최신 상태다 (--check)', () => {
  assert.ok(fs.existsSync(REG), 'node scripts/build-registry.mjs 를 먼저 돌릴 것');
  const r = spawnSync(process.execPath, ['scripts/build-registry.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('registry 의 모든 항목: 파일 존재·bytes·sha256 일치, content/ 밖 경로 없음', () => {
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  assert.equal(reg.schema, 'earthus-v3-wonder/asset-registry@0');
  assert.ok(reg.assets.length > 0);
  for (const a of reg.assets) {
    assert.ok(!a.path.startsWith('..') && !path.isAbsolute(a.path), a.path);
    const f = path.join(CONTENT, a.path);
    assert.ok(fs.existsSync(f), `없음: ${a.path}`);
    assert.equal(fs.statSync(f).size, a.bytes, a.path);
    assert.equal(sha256(f), a.sha256, a.path);
    assert.ok(['background', 'fx', 'character', 'character-scene', 'data', 'other'].includes(a.kind), a.kind);
  }
});

test('registry: 팩 1.8 배경 24 · FX 5, 카탈로그 sha256_12 대조', () => {
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  assert.equal(reg.counts.backgrounds, 24);
  assert.equal(reg.counts.fx, 5);
  const catalog = JSON.parse(fs.readFileSync(path.join(CONTENT, 'pack-1.8', 'background-catalog.json'), 'utf8'));
  for (const c of catalog) {
    const a = reg.assets.find(x => x.kind === 'background' && x.id === c.id);
    assert.ok(a, c.id);
    assert.ok(a.sha256.startsWith(c.sha256_12), c.id);
    assert.ok(['region-lazy', 'blocked-by-review'].includes(a.load), a.id);
  }
  assert.equal(reg.sources['pack-1.8'].sha256, '5d39bc2b1e9ca531e02ca2b5bfb8c0f23987c788cfcf95c476bdb2b20d8b679b');
});

test('배경 검수: 24장 전부 검수 기록이 있고, ok 가 아닌 배경은 load 가 막혀 있다 (2026-09-13: 사용 가능 0장)', () => {
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  const review = JSON.parse(fs.readFileSync(path.join(CONTENT, 'pack-1.8', 'background-review.json'), 'utf8'));
  const bgs = reg.assets.filter(a => a.kind === 'background');
  assert.equal(Object.keys(review.backgrounds).length, 24);
  for (const a of bgs) {
    const v = review.backgrounds[a.id];
    assert.ok(v, a.id);
    assert.equal(a.review, v.verdict, a.id);
    assert.equal(a.load, v.verdict === 'ok' ? 'region-lazy' : 'blocked-by-review', a.id);
    assert.ok(['ok', 'invalid'].includes(v.verdict) && typeof v.seen === 'string' && v.seen.length > 4, a.id);
  }
  const usable = bgs.filter(a => a.review === 'ok').length;
  assert.equal(reg.counts.backgrounds_usable, usable);
  const counted = Object.values(review.backgrounds).reduce((m, v) => (m[v.verdict] = (m[v.verdict] ?? 0) + 1, m), { ok: 0, invalid: 0 });
  assert.deepEqual(counted, review.verdict_counts, 'verdict_counts 가 실제 항목과 맞아야 한다');
  const cats = Object.values(review.backgrounds).reduce((m, v) => (m[v.category] = (m[v.category] ?? 0) + 1, m), {});
  assert.deepEqual(cats, review.category_counts);
});

test('registry: 레거시 PNG 원본은 등록되지 않는다 (WebP 변환본만)', () => {
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  assert.equal(reg.assets.filter(a => a.path.endsWith('.png')).length, 0);
  assert.equal(reg.assets.filter(a => a.path.includes('pack124')).length, 0);
});

test('manifest-124: 124종, index·place_basis 병합, art 상태가 실제 파일과 맞다', () => {
  const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
  assert.equal(man.length, 124);
  assert.deepEqual(man.slice(0, 3).map(m => m.slug), ['yeti', 'haetae', 'nessie'], '기존 manifest 의 index 순서');
  for (const m of man) {
    assert.equal(typeof m.index, 'number', m.slug);
    assert.equal(typeof m.place_basis, 'string', m.slug);
    assert.equal(typeof m.lat, 'number'); assert.ok(Array.isArray(m.moves));
    const exists = fs.existsSync(path.join(CONTENT, 'characters', 'runtime', `${m.slug}.webp`));
    assert.equal(m.art.status, exists ? 'ready' : 'pending-conversion', m.slug);
    if (exists) assert.equal(m.art.character, `characters/runtime/${m.slug}.webp`);
  }
  const ready = man.filter(m => m.art.status === 'ready');
  assert.ok(ready.length >= 1, 'PHASE 0 은 최소 1종(yeti) 변환');
  assert.ok(ready.some(m => m.slug === 'yeti'));
});

test('배경 선택기: 지리 배경은 반경 안 최근접, 밖이면 fallback', () => {
  const regions = JSON.parse(fs.readFileSync(path.join(CONTENT, 'backgrounds', 'regions.json'), 'utf8'));
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  for (const b of regions.backgrounds) assert.ok(reg.assets.some(a => a.kind === 'background' && a.id === b.id), `regions.json 의 ${b.id} 가 팩에 없다`);
  assert.equal(regions.backgrounds.length, 24);
  assert.equal(resolveBackground(regions, 27.99, 86.93).id, 'tibet_01', '예티(에베레스트)');
  assert.equal(resolveBackground(regions, 37.58, 126.98).id, 'korea_seoul_01', '해태(광화문)');
  assert.equal(resolveBackground(regions, 35.86, 129.22).id, 'korea_gyeongju_01', '경주는 부산 반경 안이라도 더 가까운 경주');
  assert.equal(resolveBackground(regions, 33.46, 126.49).id, 'korea_jeju_01', '도깨비(제주)');
  assert.deepEqual(resolveBackground(regions, 57.32, -4.44), { id: 'grassland_01', distance_km: null, reason: 'fallback' }, '네시(네스호) — 지리 배경 없음');
  assert.equal(resolveBackground(regions, -25.34, 131.04).id, 'australia_01', '붉은캥거루(울루루) — 호주 배경');
  assert.equal(resolveBackground(regions, -35.12, 139.28).id, 'australia_01', '버닙(머리브리지) — 호주 중심에서 ~1,400km, 반경 안');
  assert.equal(resolveBackground(regions, -8.6, 115.26).reason, 'fallback', '바롱(발리) — 호주 중심까지 ~2,700km 라 반경 밖. 발리에 호주 사막을 붙이지 않는다');
  assert.ok(Math.abs(haversineKm(37.57, 126.98, 35.18, 129.08) - 325) < 10, '서울–부산 ≈ 325km');
});
