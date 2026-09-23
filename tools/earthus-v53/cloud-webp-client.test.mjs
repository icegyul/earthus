// 관측 구름 WebP 앱 전환 (2026-09-23 PD "추천대로 진행") — docs/CLOUD-WEBP-PLAN-2026-09-23.md §3-3.
// 지키는 것: variants 가 없으면 PNG · 폰 2048 은 'split' 에서만 · WebP 실패하면 PNG 로 한 번 더 · Blob 형식은 헤더에서 ·
// 한 줄 손잡이(CLOUD_STYLE)가 v1·v2 에 같은 값으로 있다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const v1 = readFileSync(new URL('../../prototype/js/layers/imagery.js', import.meta.url), 'utf8');

// imagery.js 는 Cesium 뷰어를 끌고 와 node 에서 import 할 수 없다 — 고르는 함수만 글자 그대로 꺼내 돌린다.
const pickSrc = v1.slice(v1.indexOf('export const pickCloudFile'), v1.indexOf('export const imagery'));
const pickCloudFile = new Function(`${pickSrc.replace('export const pickCloudFile', 'const pickCloudFile')}; return pickCloudFile;`)();
const META = { variants: {
  webp: { key: 'clouds/global.webp' },
  webp2048: { key: 'clouds/global-2048.webp' },
} };

test('v1 · variants 가 없으면 무엇을 골라도 PNG — Lambda 를 되돌리면 앱도 저절로 PNG', () => {
  for (const style of ['split', 'all3072', 'png']) {
    assert.equal(pickCloudFile({ time: 'x' }, style, true), 'global.png');
    assert.equal(pickCloudFile(null, style, false), 'global.png');
  }
});

test("v1 · 'split' 은 폰만 2048, PC 는 3072 · 'all3072' 는 폰도 3072 · 'png' 는 PNG", () => {
  assert.equal(pickCloudFile(META, 'split', true), 'global-2048.webp');
  assert.equal(pickCloudFile(META, 'split', false), 'global.webp');
  assert.equal(pickCloudFile(META, 'all3072', true), 'global.webp');
  assert.equal(pickCloudFile(META, 'png', true), 'global.png');
  // 2048 판만 빠진 시각(줄이기 조건) — 폰도 3072 로
  assert.equal(pickCloudFile({ variants: { webp: META.variants.webp } }, 'split', true), 'global.webp');
});

test("v1 · 손잡이는 지금 'split'(PD 승인) 이고 WebP 판별은 풀기 기준이다(toDataURL 금지 — 사파리가 전부 PNG 로 빠진다)", () => {
  assert.match(v1, /export const CLOUD_STYLE = 'split';/);
  assert.match(v1, /data:image\/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAA/);
  const probe = v1.slice(v1.indexOf('const canDecodeWebpAlpha'), v1.indexOf('export const pickCloudFile'));
  assert.doesNotMatch(probe, /toDataURL/, '판별이 만들기(toDataURL)로 돼 있다 — 사파리는 풀 수 있어도 만들지 못한다');
});

test('v1 · WebP 를 받거나 풀다 실패하면 PNG 로 한 번 더 · Blob 형식은 응답 헤더', () => {
  assert.match(v1, /img = await loadCloud\('global\.png'\);/);
  assert.match(v1, /if \(file === 'global\.png' \|\| signal\.aborted\) throw e;/);
  assert.match(v1, /new Blob\(chunks, \{ type: r\.headers\.get\('content-type'\) \|\| 'image\/png' \}\)/);
});

// ── v2 (2026-09-24) — 같은 손잡이 · 같은 고르기 · PNG 되받기 ──────────────────────────
const v2 = readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');
const pick2Src = v2.slice(v2.indexOf('const pickCloudFile'), v2.indexOf('class CloudManager {'));
const pick2 = new Function(`${pick2Src}; return pickCloudFile;`)();

test('v2 · 손잡이 값이 v1 과 같다 — 한쪽만 바꾸면 두 지구가 다른 구름을 받는다', () => {
  const m1 = v1.match(/export const CLOUD_STYLE = '([a-z0-9]+)';/);
  const m2 = v2.match(/const CLOUD_STYLE = '([a-z0-9]+)';/);
  assert.ok(m1 && m2);
  assert.equal(m2[1], m1[1]);
});

test('v2 · 고르는 규칙이 v1 과 같다', () => {
  for (const style of ['split', 'all3072', 'png']) {
    for (const phone of [true, false]) {
      assert.equal(pick2(META, style, phone), pickCloudFile(META, style, phone), `${style}/${phone}`);
      assert.equal(pick2({}, style, phone), 'global.png');
    }
  }
});

test('v2 · WebP 실패하면 PNG 로 한 번 더 · 폰 판별은 지형 z3 와 같은 terrainLite', () => {
  assert.match(v2, /if \(file === 'global\.png'\) throw e;/);
  assert.match(v2, /img = await CloudManager\.loadImg\(`\$\{base\}\/global\.png\?t=/);
  assert.match(v2, /clouds\.phone = terrainLite;/);
  const probe = v2.slice(v2.indexOf('const canDecodeWebpAlpha'), v2.indexOf('const pickCloudFile'));
  assert.doesNotMatch(probe, /toDataURL/);
});
