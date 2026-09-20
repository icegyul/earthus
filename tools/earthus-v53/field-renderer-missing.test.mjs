// DEV-DIRECTIVE 2026-09-20 · 작업 D3 — 공통 색면 렌더러에 늘어난 두 가지의 시험.
//
//   FIELD_MISSING_MASK  결측 칸과 값 칸을 섞지 않는다(해안의 가짜 값 띠) · 네 칸이 다 결측이면 버린다
//                       · 지형을 못 받은 세션에서는 자료 자신의 결측이 해안선 노릇을 한다
//   FIELD_CLIP_OUTSIDE  격자 밖을 버린다(동아시아 편차가 대서양을 칠하던 길 · OISST 가 극까지 늘어나던 길)
//
// WebGL 은 노드에서 못 돌린다 — 셰이더가 하는 일은 JS 거울(shaderMaskedAt · shaderClipsOutside)로 재고,
// 셰이더 글자는 소스에서 확인한다(이 저장소의 기존 관례 — field-renderer.test.mjs · ocean-land-mask.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_FRAG, FieldRenderer, gridCoordOf, shaderClipsOutside, shaderMaskedAt,
} from '../../prototype/v2-three/js/field-renderer.js';
import { uvTransformOf } from '../../prototype/v2-three/js/gfs-frames.js';
import { readGridShape } from '../../prototype/v2-three/js/grid-frames.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';

const lf = (s) => String(s).replace(/\r\n/g, '\n');
const DECODE = [{ transfer: 'linear', scale: 0.2, offset: -10 }, { transfer: 'linear', scale: 1, offset: 0 }];
const enc = (v) => Math.round((v - DECODE[0].offset) / DECODE[0].scale);

// 4×3 점 격자(경도 90° · 위도 60° 간격 · 한 바퀴 돈다). 칸마다 [값 바이트, 마스크].
const makePx = (cells) => {
  const data = new Uint8Array(4 * 3 * 2);
  cells.forEach((c, i) => {
    data[i * 2] = c == null ? 0 : enc(c);
    data[i * 2 + 1] = c == null ? 0 : 255;
  });
  return { w: 4, h: 3, channels: 2, data };
};
const GRID = { ni: 4, nj: 3, lon0: -180, lat0: 60, dLon: 90, dLat: 60, wraps: true };
const SIZE = { ni: 4, nj: 3 };
const UVT = uvTransformOf(GRID, 'point');

// ── 결측 ────────────────────────────────────────────────────────────────────────────────────────────────────

test('결측 이웃은 무게 0 — 해안에 가짜 값 띠가 서지 않는다', () => {
  // 위쪽 행 전부 20 °C · 아래쪽 행의 한 칸만 결측(육지). 그 칸을 낀 칸 한가운데를 읽는다.
  const px = makePx([
    20, 20, 20, 20,
    20, null, 20, 20,
    20, 20, 20, 20,
  ]);
  // 칸 (열 0~1 · 행 0~1) 한가운데 = 열 0.5 · 행 0.5 → 경도 −135 · 위도 30
  const at = shaderMaskedAt({ px, decode: DECODE, uvT: UVT, size: SIZE }, 30, -135);
  assert.ok(Math.abs(at.value - 20) < 1e-9, `${at.value} — 결측이 값으로 섞였다`);
  assert.ok(Math.abs(at.weight - 0.75) < 1e-9);
  assert.equal(at.all, 0);
  // 결측 칸의 값 바이트를 무엇으로 바꿔도 답이 같다 — 그 바이트는 값이 아니다.
  px.data[(1 * 4 + 1) * 2] = 255;
  assert.equal(shaderMaskedAt({ px, decode: DECODE, uvT: UVT, size: SIZE }, 30, -135).value, at.value);
  px.data[(1 * 4 + 1) * 2] = 0;
  assert.equal(shaderMaskedAt({ px, decode: DECODE, uvT: UVT, size: SIZE }, 30, -135).value, at.value);
});

test('네 칸이 다 결측이면 무게가 0 이다 — 셰이더가 그 픽셀을 버린다', () => {
  const px = makePx(new Array(12).fill(null));
  assert.equal(shaderMaskedAt({ px, decode: DECODE, uvT: UVT, size: SIZE }, 30, -135).weight, 0);
});

test("'네 칸이 다 있나'는 무게의 합이 아니라 곱으로 가른다(float 에서 합은 1 에 못 미친다)", () => {
  const px = makePx(new Array(12).fill(20));
  // 칸 안의 아무 자리나 — 합은 1 에 못 미칠 수 있어도 곱은 정확히 1 이다.
  for (const [lat, lon] of [[30, -135], [12.3, -100.7], [59.9, 179.9], [0, 0]]) {
    const at = shaderMaskedAt({ px, decode: DECODE, uvT: UVT, size: SIZE }, lat, lon);
    assert.equal(at.all, 1, `(${lat}, ${lon}) 에서 all ${at.all}`);
    assert.ok(at.weight > 0);
  }
  assert.doesNotMatch(lf(FIELD_FRAG), /\bm\.x \* m\.y \* m\.z \* m\.w\b[^\n]*==/);
  assert.doesNotMatch(lf(FIELD_FRAG).replace(/\/\/[^\n]*/g, ''), /sw\s*==\s*1\.0/, "무게의 합을 1.0 과 견주면 안 된다");
});

test('값 칸끼리는 여느 때처럼 잇는다 — 마스크가 보간을 망치지 않는다', () => {
  const px = makePx([
    10, 30, 10, 10,
    10, 10, 10, 10,
    10, 10, 10, 10,
  ]);
  // 열 0 과 열 1 사이 한가운데(같은 행) = 경도 −135 · 위도 60
  const mid = shaderMaskedAt({ px, decode: DECODE, uvT: UVT, size: SIZE }, 60, -135);
  assert.ok(Math.abs(mid.value - 20) < 1e-9, `${mid.value}`);
  assert.equal(mid.all, 1);
});

// ── 격자 밖 ─────────────────────────────────────────────────────────────────────────────────────────────────

test('지역 격자는 격자 밖을 버린다 — 동아시아 편차가 대서양을 칠하지 않는다', () => {
  const ea = readGridShape({ res: 0.5, nx: 73, ny: 49, lat0: 23.125, lon0: 114.125 });
  const uv = uvTransformOf(ea, 'point');
  const size = { ni: ea.ni, nj: ea.nj };
  assert.equal(shaderClipsOutside(uv, size, ea.wraps, 35.125, 129.125), false);
  assert.equal(shaderClipsOutside(uv, size, ea.wraps, 37.5, -30), true, '대서양에 동아시아 값을 늘여 칠한다');
  assert.equal(shaderClipsOutside(uv, size, ea.wraps, 60, 128), true);
  // 끝 점은 제 칸(반 칸)까지 칠한다 — 한 칸을 통째로 잃지 않는다.
  assert.equal(shaderClipsOutside(uv, size, ea.wraps, 47.3, 114.0), false);
  assert.equal(shaderClipsOutside(uv, size, ea.wraps, 47.5, 114.125), true);
});

test('극까지 안 닿는 전지구 격자도 멈춘다 — OISST 는 ±80° 다', () => {
  const g = readGridShape({ res: 1, nx: 360, ny: 161, lat0: -79.875, lon0: -179.875 });
  const uv = uvTransformOf(g, 'point');
  const size = { ni: g.ni, nj: g.nj };
  assert.equal(g.wraps, true);
  assert.equal(shaderClipsOutside(uv, size, g.wraps, 35, -30), false, '경도로는 감는다');
  assert.equal(shaderClipsOutside(uv, size, g.wraps, 88, 0), true, '북극까지 80° 값을 늘여 칠한다');
  assert.equal(shaderClipsOutside(uv, size, g.wraps, -85, 0), true);
  assert.equal(shaderClipsOutside(uv, size, g.wraps, 80.5, 0), false);
});

test('전지구 0.5° GFS 는 잘라 낼 것이 없다 — 기온 색면이 좁아지지 않는다', () => {
  const g = { ni: 720, nj: 361, lon0: -180, lat0: 90, dLon: 0.5, dLat: 0.5, wraps: true };
  const uv = uvTransformOf(g, 'point');
  for (const lat of [-90, -89.9, 0, 89.9, 90]) {
    assert.equal(shaderClipsOutside(uv, { ni: 720, nj: 361 }, true, lat, 127), false, `${lat}°`);
  }
  // 그래서 tempgrid·windgrid 의 렌더러는 clip 을 켜지 않는다(켜도 같지만 셰이더에 쓸데없는 가지를 남기지 않는다).
  const r = new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] });
  assert.equal(r.material.defines.FIELD_CLIP_OUTSIDE, undefined);
  assert.equal(r.material.defines.FIELD_MISSING_MASK, undefined);
  r.dispose();
});

// ── 셰이더 글자와 배선 ──────────────────────────────────────────────────────────────────────────────────────

test('셰이더 글자 — maskedGrid 는 바이트로 마스크를 가르고, 곱으로 다 있나를 잰다', () => {
  const src = lf(FIELD_FRAG);
  assert.match(src, /#ifdef FIELD_MISSING_MASK[\s\S]*vec3 maskedGrid\(sampler2D tex, vec2 g\)[\s\S]*#endif/);
  assert.match(src, /step\(127\.5, v00\.y\), step\(127\.5, v10\.y\), step\(127\.5, v01\.y\), step\(127\.5, v11\.y\)/);
  assert.match(src, /return vec3\(sw > 0\.0 \? val \/ sw : 0\.0, sw, m\.x \* m\.y \* m\.z \* m\.w\);/);
  // 본문의 갈림: 결측이 있으면 maskedGrid, 없으면 여느 때의 sampleGrid.
  assert.match(src, /#ifdef FIELD_MISSING_MASK\s+vec3 ma = maskedGrid\(uTexA, g\);\s+vec3 mb = maskedGrid\(uTexB, g\);/);
  assert.match(src, /if \(min\(ma\.y, mb\.y\) <= 0\.0\) discard;/);
  assert.match(src, /#ifdef FIELD_MASK_OCEAN[\s\S]*if \(uHasHeight < 0\.5 && min\(ma\.z, mb\.z\) < 0\.5\) discard;\s+#endif/);
  assert.match(src, /#else\s+vec2 ca = sampleGrid\(uTexA, g\);\s+vec2 cb = sampleGrid\(uTexB, g\);\s+#endif/);
  // 자르기는 위도 clamp 보다 **먼저** 와야 한다 — clamp 뒤에는 밖인지 알 수 없다.
  const clip = src.indexOf('#ifdef FIELD_CLIP_OUTSIDE');
  const clampY = src.indexOf('g.y = clamp(g.y, 0.0, uGridSize.y - 1.0);');
  assert.ok(clip > 0 && clip < clampY, '격자 밖 판정이 위도 clamp 뒤에 있다');
  assert.match(src, /if \(g\.y < -0\.5 \|\| g\.y > uGridSize\.y - 0\.5\) discard;/);
  assert.match(src, /if \(uWrapX < 0\.5 && \(g\.x < -0\.5 \|\| g\.x > uGridSize\.x - 0\.5\)\) discard;/);
});

test('define 은 만들 때 갈린다 · 마스크 채널이 없으면 던진다', () => {
  const r = new FieldRenderer({ scale: scaleOf('sst'), mask: 'ocean', missing: true, clip: true, segments: [8, 4] });
  assert.equal(r.material.defines.FIELD_MISSING_MASK, 1);
  assert.equal(r.material.defines.FIELD_CLIP_OUTSIDE, 1);
  assert.equal(r.material.defines.FIELD_MASK_OCEAN, 1);
  const uv = { su: 1, ou: 0, sv: 1, ov: 0 };
  const grid = { ni: 4, nj: 3, wraps: true };
  assert.throws(() => r.setField({
    channels: [{ transfer: 'linear', scale: 0.2, offset: -10 }], uv, grid,
  }), /결측 마스크/);
  r.setField({
    channels: [{ transfer: 'linear', scale: 0.2, offset: -10 }, { transfer: 'linear', scale: 1, offset: 0, role: 'mask' }],
    uv, grid,
  });
  assert.deepEqual([...r.uniforms.uDecode.value.toArray()], [0.2, -10, 1, 0]);
  assert.equal(r.uniforms.uHalfStep.value, 0.1, '읽히는 값은 v + 반 눈금(0.1 °C)이다');
  r.dispose();
  // 크기 모드(풍속)는 둘째 채널이 성분이다 — 마스크를 실을 자리가 없다.
  assert.throws(() => new FieldRenderer({ scale: scaleOf('wind'), mode: 'magnitudeRG', missing: true, segments: [8, 4] }), /크기 모드/);
});

test('JS 거울과 셰이더가 같은 칸을 읽는다 — gridCoordOf 로 되짚는다', () => {
  const px = makePx([
    1, 2, 3, 4,
    5, 6, 7, 8,
    9, 10, 11, 12,
  ]);
  for (const [lat, lon, want] of [[60, -180, 1], [60, -90, 2], [0, 0, 7], [-60, 90, 12], [-60, -180, 9]]) {
    const g = gridCoordOf(UVT, SIZE, lat, lon);
    assert.ok(Math.abs(g[0] - Math.round(g[0])) < 1e-9 && Math.abs(g[1] - Math.round(g[1])) < 1e-9,
      `(${lat}, ${lon}) 가 격자점에 안 앉는다: ${g}`);
    const at = shaderMaskedAt({ px, decode: DECODE, uvT: UVT, size: SIZE }, lat, lon);
    assert.ok(Math.abs(at.value - want) < 1e-9, `(${lat}, ${lon}) → ${at.value} ≠ ${want}`);
  }
});
