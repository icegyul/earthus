import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', p), 'utf8'));

test('배경 QA: 24장 전부 검사 기록이 있고, 어떤 것도 자동으로 production_approved 되지 않는다', () => {
  const qa = read('pack-1.8/background-qa.json');
  const catalog = read('pack-1.8/background-catalog.json');
  assert.equal(qa.backgrounds.length, 24);
  assert.deepEqual(qa.backgrounds.map(b => b.id).sort(), catalog.map(c => c.id).sort());
  assert.deepEqual(qa.spec, { width: 2048, height: 1152, ratio: 16 / 9, format: 'WEBP', max_bytes: 512000, target_bytes: 358400, alpha: false });
  for (const b of qa.backgrounds) {
    for (const k of ['resolution', 'ratio_16_9', 'format_webp', 'file_size_ok', 'no_alpha', 'visual_review_ok']) assert.equal(typeof b.checks[k], 'boolean', `${b.id}.${k}`);
    assert.equal(b.production_approved, false, `${b.id}: 승인은 PD 만`);
    assert.equal(b.spec_pass, Object.values(b.checks).every(Boolean));
    if (!b.checks.visual_review_ok) assert.ok(b.pending_visual_checks.length >= 4, `${b.id}: 눈 검수 불합격이면 구도·대비 검사는 보류`);
  }
  assert.equal(qa.summary.production_approved, 0);
  assert.equal(qa.summary.total, 24);
});

test('배경 QA (2026-09-13 상태): 팩 1.8 24장은 해상도 1024×655 로 2048×1152 미달, 눈 검수 24 불합격, spec_pass 0', () => {
  const qa = read('pack-1.8/background-qa.json');
  assert.equal(qa.summary.resolution_fail, 24);
  assert.equal(qa.summary.visual_fail, 24);
  assert.equal(qa.summary.spec_pass, 0);
  assert.equal(qa.summary.format_webp, 24, '형식(WebP)만 맞는다');
  assert.equal(qa.summary.size_ok, 24, '크기 상한은 전부 안');
  for (const b of qa.backgrounds) assert.ok(b.width === 1024 && (b.height === 655 || b.height === 652), `${b.id} ${b.width}×${b.height} (3장은 652)`);
});
