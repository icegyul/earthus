import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const read = p => JSON.parse(fs.readFileSync(path.join(CONTENT, p), 'utf8'));

test('배경 교체 매니페스트: 24 id 가 팩 카탈로그·지역표·검수 파일과 같다', () => {
  const man = read('backgrounds/replacement-manifest.json');
  const catalog = read('pack-1.8/background-catalog.json');
  const regions = read('backgrounds/regions.json');
  const review = read('pack-1.8/background-review.json');
  const ids = man.backgrounds.map(b => b.id);
  assert.equal(ids.length, 24);
  assert.deepEqual([...ids].sort(), catalog.map(c => c.id).sort(), '팩 카탈로그와 같은 id');
  assert.deepEqual([...ids].sort(), regions.backgrounds.map(b => b.id).sort(), 'regions.json 과 같은 id');
  assert.deepEqual([...ids].sort(), Object.keys(review.backgrounds).sort(), '검수 파일과 같은 id');
});

test('배경 교체 매니페스트: 분류 world 1 · korea 4 · atmosphere 3 · region 16 (DECISION LOCK 6)', () => {
  const man = read('backgrounds/replacement-manifest.json');
  const counts = man.backgrounds.reduce((m, b) => (m[b.class] = (m[b.class] ?? 0) + 1, m), {});
  assert.deepEqual(counts, { world: 1, korea: 4, atmosphere: 3, region: 16 });
  assert.deepEqual(counts, man.class_counts);
  assert.deepEqual(man.backgrounds.filter(b => b.class === 'korea').map(b => b.id).sort(), ['korea_busan_01', 'korea_gyeongju_01', 'korea_jeju_01', 'korea_seoul_01']);
  assert.deepEqual(man.backgrounds.filter(b => b.class === 'atmosphere').map(b => b.id).sort(), ['aurora_01', 'night_01', 'sunset_01']);
});

test('배경 교체 매니페스트: 각 항목이 장면 지시·교체 대상 해시·상태를 갖고, 규격은 16:9 2048×1152 WebP', () => {
  const man = read('backgrounds/replacement-manifest.json');
  const catalog = new Map(read('pack-1.8/background-catalog.json').map(c => [c.id, c]));
  assert.deepEqual(man.format, { ratio: '16:9', width: 2048, height: 1152, type: 'webp', quality: 85, alpha: false, max_bytes: 512000, target_bytes: 358400 });
  assert.equal(Math.round(man.format.width / man.format.height * 1000), Math.round(16 / 9 * 1000));
  for (const b of man.backgrounds) {
    assert.ok(typeof b.brief_ko === 'string' && b.brief_ko.length >= 20, b.id);
    assert.ok(Array.isArray(b.must_include) && b.must_include.length >= 1, b.id);
    assert.equal(b.status, 'pending', b.id);
    assert.equal(b.replaces, catalog.get(b.id).sha256_12, `${b.id} 의 replaces 는 지금 불합격 파일의 해시`);
    assert.ok(b.geo === null || (Number.isFinite(b.geo.lat) && Number.isFinite(b.geo.lon)), b.id);
    assert.ok(!/캐릭터|사람|동물이 /.test(b.must_include.join(' ')), `${b.id}: must_include 에 생물이 있으면 안 된다`);
  }
  for (const k of ['text', 'watermark', 'ui', 'other-place-thumbnail', 'character-or-creature', 'hero-card-or-logo']) assert.ok(man.common_must_exclude.includes(k), k);
});
