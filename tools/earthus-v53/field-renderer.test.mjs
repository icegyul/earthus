// DEV-DIRECTIVE 2026-09-20 · W1 — 공통 색면 렌더러(prototype/v2-three/js/field-renderer.js)의 결과 시험.
//
// "그라데이션이 없다"만 시험하면 아무것도 안 칠하는 렌더러가 통과한다. 여기서는 **무엇이 칠해지는지**를 잰다:
//   표(field-scales)를 한 줄 바꾸면 셰이더 uniform · 범례 · 등치선이 같이 바뀌는가 · 셰이더가 고르는 칸이 모든 경계에서 CPU 와 같은가 ·
//   셰이더가 셈하는 값이 클릭 값(frames.sampleAt)과 같은가 · 8bit 고원에서 등치선이 면으로 번지지 않는가 · 서울 칸이 제자리인가.
// WebGL 은 없다 — 셰이더 식을 JS 로 옮긴 순수 함수(파일이 직접 낸다)와 셰이더 소스의 글자를 본다.
// THREE 는 가짜가 아니라 저장소의 r184 그대로다(재질·기하·DataTexture 는 WebGL 없이 만들어진다 — wind-particles.test.mjs 선례).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  FIELD_FRAG, FIELD_GRAD_EPS, FIELD_LIFT, FIELD_LINE, FIELD_MAX_BREAKS, FIELD_MAX_LEVELS, FIELD_OPACITY,
  FIELD_RENDER_ORDER, FIELD_SHADE, FIELD_TERRAIN_GLSL, FIELD_VERT, FieldRenderer,
  gridCoordOf, halfStepOf, intervalLineCoverage, isolineAlpha, isolineUniforms, lineCoverage, paintedBandIndex,
  paintedColorOf, scaleUniforms, shaderBandIndex, shaderValueAt, terrainShadeOf,
} from '../../prototype/v2-three/js/field-renderer.js';
import {
  BREAK_PAD, FIELD_SCALES, SCALE_IDS, bandIndex, defineScale, isolineSpec, legendModel, paletteRGBA, scaleOf,
} from '../../prototype/v2-three/js/field-scales.js';
import { createGfsFrames, uvTransformOf } from '../../prototype/v2-three/js/gfs-frames.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');   // 이 워크트리는 CRLF 로 체크아웃된다 — 글자 대조는 LF 로 한다
const squash = (s) => lf(s).replace(/\s+/g, ' ').trim();
const MAIN_SRC = lf(readFileSync(here('../../prototype/v2-three/js/main.js'), 'utf8'));
const SCHEMA2 = JSON.parse(readFileSync(here('./fixtures/gfs-fc-manifest-schema2.json'), 'utf8'));

// 표를 '한 줄' 바꾼 사본. 얼린 눈금에서 유도값을 떼고 다시 짓는다(defineScale 이 유도값을 밖에서 받지 않는다).
const rebuilt = (scale, change) => {
  const spec = JSON.parse(JSON.stringify(scale));
  change(spec);
  return defineScale(spec);
};

// ---------------------------------------------------------------- 표 한 장 → 셰이더 · 범례 · 등치선

test('표를 한 줄 바꾸면 셰이더 uniform · 팔레트 · 범례가 같이 바뀐다', () => {
  const temp = scaleOf('temp');
  const r = new FieldRenderer({ scale: temp, segments: [8, 4] });
  const before = scaleUniforms(temp);
  assert.deepEqual([...r.uniforms.uBreaks.value], [...before.breaks]);
  assert.equal(r.uniforms.uBandCount.value, 11);
  assert.deepEqual([...r.uniforms.uPalette.value.image.data], [...before.palette]);

  // '30 ~ 35' 줄 하나: 경계 30 → 31 · 색 #e2402c → #123456
  const changed = rebuilt(temp, (s) => { s.bands[9] = [31, '#123456']; });
  r.setScale(changed);
  const at = [...r.uniforms.uBreaks.value].indexOf(31);
  assert.equal(at, 8, '셰이더 경계 배열의 그 칸이 31 이 됐다');
  assert.ok(![...r.uniforms.uBreaks.value].includes(30));
  assert.deepEqual([...r.uniforms.uPalette.value.image.data.slice(9 * 4, 10 * 4)], [0x12, 0x34, 0x56, 255], '팔레트의 그 칸이 같이 바뀌었다');
  const cell = legendModel(changed).find((c) => c.index === 9);
  assert.deepEqual([cell.from, cell.to, cell.rgba], [31, 35, [0x12, 0x34, 0x56, 255]], '범례의 그 칸도 같은 경계 · 같은 바이트다');
  // 칠해지는 칸도 따라 바뀐다: 30.5°C 는 이제 아래 칸이다.
  assert.equal(shaderBandIndex(r.uniforms.uBreaks.value, 30.5), 8);
  assert.equal(shaderBandIndex(before.breaks, 30.5), 9);
  r.dispose();
});

test('등치선도 같은 표에서 나온다 — 간격 줄을 바꾸면 셰이더의 선 간격이 바뀐다', () => {
  const temp = scaleOf('temp');
  const r = new FieldRenderer({ scale: temp, segments: [8, 4] });
  r.setIsolines(isolineSpec(temp, '5'), true);
  assert.deepEqual([r.uniforms.uIsoOn.value, r.uniforms.uIsoInterval.value, r.uniforms.uIsoMajor.value], [1, 5, 10]);
  r.setIsolines(isolineSpec(temp, '2'), true);
  assert.deepEqual([r.uniforms.uIsoInterval.value, r.uniforms.uIsoMajor.value], [2, 10], '2°C 를 골라도 굵은 선은 10°C 마다');
  const changed = rebuilt(temp, (s) => { s.isolines.choices['5'].interval = 4; s.isolines.choices['5'].majorEvery = 8; });
  r.setIsolines(isolineSpec(changed, '5'), true);
  assert.deepEqual([r.uniforms.uIsoInterval.value, r.uniforms.uIsoMajor.value], [4, 8]);
  // 끄면 전부 0 — 셰이더는 선 계산을 건너뛴다. 풍속처럼 명세가 없으면(null) 켜 달래도 긋지 않는다.
  r.setIsolines(isolineSpec(temp, '5'), false);
  assert.equal(r.uniforms.uIsoOn.value, 0);
  assert.equal(isolineSpec(scaleOf('wind')), null);
  assert.equal(isolineUniforms(null, true).on, 0);
  r.dispose();
});

test('간격이 없는 눈금은 값 목록으로, 간격이 있는 눈금은 강조값만 굵게 들어간다', () => {
  const wave = isolineUniforms(isolineSpec(scaleOf('wave')), true);
  assert.deepEqual([wave.interval, wave.levelCount, [...wave.levels.slice(0, 6)]], [0, 6, [1, 2, 3, 4, 6, 9]]);
  const pres = isolineUniforms(isolineSpec(scaleOf('pressure')), true);
  assert.deepEqual([pres.interval, pres.levelCount, pres.levels[0]], [4, 1, 1012]);
  assert.ok(pres.widths[0] > FIELD_LINE.minorWidthPx, '1012 hPa 는 굵은 선이다');
  assert.ok(FIELD_MAX_LEVELS >= 6);
});

// ---------------------------------------------------------------- 구간 찾기

test('셰이더의 구간 찾기는 모든 눈금 · 모든 경계에서 field-scales.bandIndex 와 같다', () => {
  for (const id of SCALE_IDS) {
    const scale = FIELD_SCALES[id];
    const { breaks } = scaleUniforms(scale);
    assert.equal(breaks.length, FIELD_MAX_BREAKS);
    assert.equal(breaks[scale.breaks.length], Math.fround(BREAK_PAD), '남는 칸은 BREAK_PAD — 어떤 자료값보다 크다');
    const probes = [-1e6, 1e6];
    for (const b of scale.breaks) probes.push(b, b - 1e-6, b + 1e-6, b - 1e-3, b + 1e-3, b - 0.25, b + 0.25);
    for (const v of probes) assert.equal(shaderBandIndex(breaks, v), bandIndex(scale, v), `${id} · ${v}`);
  }
  // 규칙 자체: 아래 경계 포함 · 위 경계 제외.
  const t = scaleUniforms(scaleOf('temp')).breaks;
  assert.deepEqual([35, 34.999, -10, -10.001].map((v) => shaderBandIndex(t, v)), [10, 9, 1, 0]);
});

test('칠해진 칸 = 읽히는 값의 칸 — 보간값을 0.5°C 눈금으로 반올림한 값을 구간 규칙에 넣은 것과 전 구간에서 같다', () => {
  const temp = scaleOf('temp');
  const { breaks } = scaleUniforms(temp);
  const chans = [{ transfer: 'linear', scale: 0.5, offset: -80 }];
  const h = halfStepOf(chans, 'scalar');
  assert.equal(h, 0.25, '반 눈금은 매니페스트의 디코드 scale 에서 온다');
  // −80 ~ +47.5°C 를 1/64°C 걸음으로 훑는다(2의 거듭제곱이라 동률 0.25 · 0.75 도 정확히 밟는다).
  for (let k = -80 * 64; k <= 47.5 * 64; k += 1) {
    const v = k / 64;
    const shown = Math.round(v / 0.5) * 0.5;                 // 누른 자리에서 '~30.0 °C' 라고 말하는 그 값(field-layer.js readoutOf)
    assert.equal(paintedBandIndex(breaks, v, h), bandIndex(temp, shown), `${v} → 읽히는 값 ${shown}`);
  }
  // 경계 30 의 색은 29.75 에서 바뀐다 — 29.5 고원과 30.0 고원 사이 경사면의 한가운데다(격자선을 따라 꺾이지 않는다).
  assert.deepEqual([29.74, 29.75, 30].map((v) => paintedBandIndex(breaks, v, h)), [8, 9, 9]);
  // 눈금값 그 자체(격자점 · 고원)는 반 눈금을 더해도 제 칸이다.
  for (let b = 0; b <= 255; b += 1) assert.equal(paintedBandIndex(breaks, b * 0.5 - 80, h), bandIndex(temp, b * 0.5 - 80));
  // 풍속(크기 모드)은 더하지 않는다. log 식 필드도.
  assert.equal(halfStepOf([{ transfer: 'linear', scale: 0.5 }, { transfer: 'linear', scale: 0.5 }], 'magnitudeRG'), 0);
  assert.equal(halfStepOf([{ transfer: 'log10', logLo: 0, logSpan: 1 }], 'scalar'), 0);
  const r = new FieldRenderer({ scale: temp, segments: [8, 4] });
  r.setField({ channels: chans, uv: { su: 1, ou: 0, sv: 1, ov: 0 }, grid: { ni: 720, nj: 361 } });
  assert.equal(r.uniforms.uHalfStep.value, 0.25);
  r.dispose();
});

test('셰이더 소스 — 값을 보간하고 색은 양자화한다: 팔레트는 한 번 읽고 구간색끼리 섞는 연산이 없다', () => {
  const frag = lf(FIELD_FRAG);
  assert.equal((frag.match(/texture2D\(uPalette/g) || []).length, 1, '팔레트를 두 번 읽으면 두 색을 섞을 길이 생긴다');
  assert.match(frag, /float vs = v \+ uHalfStep;\s+float idx = 0\.0;\s+for \(int i = 0; i < FIELD_MAX_BREAKS; i\+\+\) idx \+= step\(uBreaks\[i\], vs\);/,
    '구간 규칙 = Σ step(경계, 읽히는 값)');
  assert.match(frag, /float grad = fwidth\(vs\);\s+line = intervalLine\(vs, grad, uIsoInterval,/, '등치선도 같은 값으로 긋는다 — 선과 색 경계가 같은 자리다');
  assert.match(frag, /vec2\(\(idx \+ 0\.5\) \/ uBandCount, 0\.5\)/, '칸 한가운데를 읽는다');
  assert.doesNotMatch(frag, /\bmix\s*\(/, '프래그먼트에 mix() 가 없다 — 값의 보간도 a + (b − a)·t 로 직접 쓴다');
  // band.rgb 가 **다른 색**과 만나는 곳은 등치선을 얹는 한 줄뿐이고 상대는 상수 uLineColor 다.
  // (2026-09-20 작업 E3 ⑤ — 지형 결은 색이 아니라 스칼라 계수 하나를 곱한다. 채널마다 같은 수를 곱하므로 색조가 그대로다.)
  const uses = frag.split('\n').filter((l) => /band\.rgb/.test(l));
  assert.equal(uses.length, 2);
  assert.match(uses[0], /^\s*band\.rgb \*= terrainShade\(n, lon, lat\);$/, '지형 결이 색을 섞으면 그것은 바탕색 혼합이다');
  assert.match(uses[1], /uLineColor \* line \+ band\.rgb \* bandA \* \(1\.0 - line\)/);
  assert.doesNotMatch(frag, /colorspace_fragment/, 'sRGB 바이트를 그대로 내보낸다 — 변환을 한쪽만 넣으면 범례와 색이 어긋난다');
  // 값은 풀고 나서 섞는다 · 고원에서 정확한 꼴.
  assert.match(frag, /floor\(texture2D\(tex, uv\)\.rg \* 255\.0 \+ 0\.5\)/, '정수 바이트로 되돌린 뒤 푼다');
  assert.match(frag, /vec2 c = ca \+ \(cb - ca\) \* uMix;/);
  assert.match(frag, /precision highp float;/);
  assert.match(frag, /precision highp sampler2D;/);
  // 풍속은 섞은 뒤에 크기를 구한다.
  assert.match(frag, /#ifdef FIELD_MODE_MAGNITUDE\s+float v = length\(c\);/);
  // 팔레트 텍스처는 Nearest — Linear 면 칸 사이에서 색이 섞인다.
  const r = new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] });
  const pal = r.uniforms.uPalette.value;
  assert.deepEqual([pal.minFilter, pal.magFilter, pal.generateMipmaps, pal.colorSpace],
    [THREE.NearestFilter, THREE.NearestFilter, false, THREE.NoColorSpace]);
  assert.deepEqual([pal.image.width, pal.image.height], [11, 1]);
  r.dispose();
});

// ---------------------------------------------------------------- 등치선 · 고원 가드

test('고원 가드 — 기울기 0 에서는 값이 레벨과 같아도 선이 없다', () => {
  assert.equal(lineCoverage(0, 0, 1), 0, '0 / 0 을 셈하지 않는다');
  assert.equal(lineCoverage(0.1, 0, 1), 0);
  assert.equal(lineCoverage(0.1, FIELD_GRAD_EPS, 1), 0, '문턱 이하도 고원이다');
  assert.ok(lineCoverage(0.1, 0.1, 1) > 0.9, '같은 값이라도 경사면(1px 에 0.1)이면 선이다');
  // 30.0°C 고원(같은 바이트가 수백 칸): 5°C 선 · 10°C 선 어느 것도 서지 않는다 — 가드가 없으면 면 전체가 선이다.
  const iso = isolineUniforms(isolineSpec(scaleOf('temp'), '5'), true);
  assert.equal(intervalLineCoverage(30, 0, 5, 1), 0);
  assert.equal(isolineAlpha(30, 0, iso), 0);
  // 29.5 와 30.5 를 시간으로 반씩 섞은 순간의 고원(v = 30.0 · 기울기 0)도 같다.
  assert.equal(isolineAlpha(29.5 + (30.5 - 29.5) * 0.5, 0, iso), 0);
  assert.ok(Number.isFinite(isolineAlpha(30, 0, iso)));
});

test('경사면에서는 선이 서고, 주 레벨(10°C 마다)이 더 굵고 또렷하다', () => {
  const iso = isolineUniforms(isolineSpec(scaleOf('temp'), '5'), true);
  const grad = 0.2;                                   // 1px 에 0.2°C
  // 레벨 아래 1px(보통 선의 한가운데): 보통 선(25)도 굵은 선(30)도 선다.
  assert.ok(isolineAlpha(25 - 1 * grad, grad, iso) > 0.5);
  assert.ok(isolineAlpha(30 - 1 * grad, grad, iso) > isolineAlpha(25 - 1 * grad, grad, iso), '굵은 선이 더 또렷하다');
  // 레벨 아래 2.2px: 보통 선은 끝났고 굵은 선은 아직 서 있다.
  assert.equal(isolineAlpha(25 - 2.2 * grad, grad, iso), 0);
  assert.ok(isolineAlpha(30 - 2.2 * grad, grad, iso) > 0.5);
  // 레벨에 닿은 픽셀과 넘은 픽셀은 선이 아니다 — 그 픽셀은 위 칸의 색이다(색 경계 = 선의 위쪽 끝).
  assert.equal(isolineAlpha(30, grad, iso), 0);
  assert.equal(isolineAlpha(30.05, grad, iso), 0);
  // 장치 픽셀비 2(폰): 같은 CSS 굵기 = 장치 px 두 배.
  assert.ok(isolineAlpha(25 - 2.2 * grad, grad, iso, 2) > 0.3);
  // 등치선이 꺼져 있으면 0.
  assert.equal(isolineAlpha(29.9, grad, isolineUniforms(isolineSpec(scaleOf('temp'), '5'), false)), 0);
});

// 화면 한 줄을 훑어 선이 몇 줄 서는지 센다. values = 픽셀마다의 보간값 · h = 반 눈금. 기울기는 이웃 픽셀의 차(fwidth 자리).
const scanLine = (values, h, iso) => {
  const vs = values.map((v) => v + h);
  const alpha = vs.map((v, i) => isolineAlpha(v, Math.abs(vs[Math.min(vs.length - 1, i + 1)] - vs[Math.max(0, i - 1)]) / 2, iso));
  let runs = 0;
  for (let i = 0; i < alpha.length; i += 1) if (alpha[i] > 0.3 && !(alpha[i - 1] > 0.3)) runs += 1;
  const first = alpha.findIndex((a) => a > 0.3);
  const last = alpha.length - 1 - [...alpha].reverse().findIndex((a) => a > 0.3);
  return { alpha, runs, first, last, edge: vs.findIndex((v) => v >= 30) };
};

test('선은 색 경계의 아래쪽 한 곳에만 선다 — 8bit 고원의 양쪽 가장자리에 두 줄이 서지 않는다', () => {
  // 29.0 → 30.0 경사 · 30.0 고원 40px · 30.0 → 31.0 경사 (0.5°C 눈금 자료를 이중선형으로 이은 모양).
  const px = [];
  for (let x = 0; x < 20; x += 1) px.push(29 + x / 20);
  for (let x = 0; x < 40; x += 1) px.push(30);
  for (let x = 0; x <= 20; x += 1) px.push(30 + x / 20);
  const iso = isolineUniforms(isolineSpec(scaleOf('temp'), '5'), true);
  const breaks = scaleUniforms(scaleOf('temp')).breaks;
  const s = scanLine(px, 0.25, iso);
  assert.equal(s.runs, 1, `30°C 선은 한 줄이어야 한다 (${s.runs}줄)`);
  assert.equal(s.edge, 15, '색 경계는 읽히는 값이 30 이 되는 곳 — 보간값 29.75 · 경사면의 한가운데');
  assert.equal(paintedBandIndex(breaks, px[14], 0.25), 8);
  assert.equal(paintedBandIndex(breaks, px[15], 0.25), 9);
  assert.ok(s.first >= s.edge - 4 && s.last === s.edge - 1, `선은 색 경계 바로 아래에 붙어 선다 (${s.first}~${s.last} · 경계 ${s.edge})`);
  assert.ok(s.alpha.slice(s.edge).every((a) => a === 0), '경계 위쪽(30 이상 칸) · 고원 · 고원의 먼 가장자리에는 선이 없다');
  // 두 프레임을 반씩 섞은 순간: 29.5 고원(A)과 30.0 고원(B)이 겹친 곳은 보간값 29.75 = 읽히는 값 30.0 의 고원이 된다.
  // 고원 전체가 선으로 번지지 않고, 고원의 양쪽이 아니라 아래쪽 한 곳에만 선다.
  const mixed = [];
  for (let x = 0; x < 20; x += 1) mixed.push(29.25 + (x / 20) * 0.5);
  for (let x = 0; x < 40; x += 1) mixed.push(29.75);
  for (let x = 0; x <= 20; x += 1) mixed.push(29.75 + (x / 20) * 0.5);
  const m = scanLine(mixed, 0.25, iso);
  assert.equal(m.runs, 1);
  assert.ok(m.alpha.slice(m.edge).every((a) => a === 0));
});

test('선이 화면 픽셀보다 촘촘해지면 스스로 사라진다', () => {
  // 2°C 간격 · 1px 에 1°C → 이웃 선 사이 2px. 모아레 대신 색면만 남는다.
  assert.equal(intervalLineCoverage(19, 1.0, 2, 1), 0);
  // 같은 기울기에서 10°C 선은 10px 간격이라 산다.
  assert.ok(intervalLineCoverage(19, 1.0, 10, 1.9) > 0.5);
});

// 2026-09-20 작업 E3 ④ (B1 반박 검증) — 흐림 문턱이 **장치 픽셀** 기준이었다.
//   fwidth 는 장치 px 당 값 변화라 interval/grad 는 장치 px 간격인데, 문턱(FIELD_LINE.fadePx 3·8)은 CSS px 로 적힌 수다.
//   DPR 2 인 폰에서는 같은 화면이 두 배로 넓게 읽혀, 사라져야 할 선이 절반쯤 살아남아 전선대가 허옇게 떴다.
//   숫자를 박지 않고 상수(fadePx)에서 셈한다 — 문턱을 바꾸면 이 시험이 같이 따라간다.
test('흐림 문턱은 CSS px 로 잰다 — DPR 2 인 폰에서 촘촘한 선이 허옇게 살아남지 않는다', () => {
  const [gone, full] = FIELD_LINE.fadePx;
  const interval = 5;
  // CSS 간격이 '사라지는 값' 아래가 되게 기울기를 고른다: cssGap = interval / (grad × dpr).
  const dpr = 2;
  const grad = interval / (gone * 0.8 * dpr);              // CSS 간격 = fadePx[0] × 0.8 → 완전히 사라져야 한다
  assert.ok(interval / (grad * dpr) < gone, '이 기울기에서 CSS 간격이 문턱 아래라야 시험이 뜻이 있다');
  assert.ok(interval / grad > gone, '장치 간격으로만 보면 문턱 위다 — 옛 코드가 선을 그리던 자리');
  const w = FIELD_LINE.minorWidthPx * dpr;
  assert.equal(intervalLineCoverage(interval - 1 * grad, grad, interval, w, dpr), 0,
    'DPR 2 에서 촘촘한 선이 남았다 — 전선대가 허옇게 뜬다');
  // 같은 화면을 DPR 1 로 보면 CSS 간격이 두 배라 선이 산다 — 문턱 자체를 올린 것이 아니다.
  const grad1 = interval / (full * 1.5);
  assert.ok(intervalLineCoverage(interval - 1 * grad1, grad1, interval, FIELD_LINE.minorWidthPx, 1) > 0.5);
  // 등치선 알파도 같은 자를 쓴다(거울 함수 둘이 어긋나면 화면과 시험이 갈린다).
  const iso = isolineUniforms(isolineSpec(scaleOf('temp'), '5'), true);
  assert.equal(isolineAlpha(25 - 1 * grad, grad, iso, dpr), 0, 'isolineAlpha 가 pxScale 을 흐림에 넘기지 않았다');
  assert.ok(isolineAlpha(25 - 1 * grad, grad, iso, 1) > 0, 'DPR 1 에서는 같은 자리에 선이 선다');
});

// ---------------------------------------------------------------- 불투명도 · 지형 결 (2026-09-20 작업 E3 ⑤)

// 바탕색을 섞어 지형 결을 내면 밑에 무엇이 있느냐에 따라 **같은 값이 다른 색**으로 칠해진다 — 색이 곧 값인 화면에서
// 그것은 범례가 거짓말을 한다는 뜻이다. 여기서는 '어느 바탕 위에서 얼마나 달라지나'를 숫자로 잰다.
const UNDERS = Object.freeze([
  Object.freeze([10, 20, 40]),      // 밤바다
  Object.freeze([200, 180, 140]),   // 밝은 사막
  Object.freeze([235, 240, 245]),   // 빙상
]);
const maxCh = (a, b) => Math.max(...a.map((c, i) => Math.abs(c - b[i])));
const bandRGB = (scaleId, i) => [...paletteRGBA(scaleOf(scaleId)).slice(i * 4, i * 4 + 3)];

test('화면의 색이 범례의 색이다 — 바탕이 섞이는 몫을 줄였다', () => {
  const worstAt = (a) => Math.max(...[6, 8, 0].map((i) => {
    const band = bandRGB('temp', i);
    return Math.max(...UNDERS.map((u) => maxCh(paintedColorOf(band, u, { opacity: a }), band)));
  }));
  // 바탕이 섞이는 몫의 상한은 (1 − 불투명도) × 255 다 — 숫자를 박지 않고 상수에서 셈한다.
  assert.ok(worstAt(FIELD_OPACITY) <= 255 * (1 - FIELD_OPACITY) + 0.5, `범례와 ${worstAt(FIELD_OPACITY)} 만큼 다르다`);
  // 옛 값(0.8)보다 실제로 가까워졌다 — 이 줄이 없으면 불투명도를 도로 내려도 위 단언이 통과한다.
  assert.ok(worstAt(FIELD_OPACITY) < worstAt(0.8) * 0.6,
    `옛 0.8 의 최대 차 ${worstAt(0.8)} → 지금 ${worstAt(FIELD_OPACITY)}`);
  // 기압처럼 일부러 옅은 눈금(칸 알파 0.4)은 옅은 채로 남는다 — 이 작업이 '선이 주인공'을 뒤집지 않는다.
  const pres = paletteRGBA(scaleOf('pressure'));
  assert.ok(pres[3] / 255 * FIELD_OPACITY < 0.45, '기압 색면이 더 이상 옅지 않다');
});

test('지형 결은 음영 계수로 준다 — 평지에서는 정확히 1(= 범례 색 그대로), 위로는 범례를 넘지 않는다', () => {
  // 평지: 기울인 법선이 평평한 구와 같다 → 차이 0 → 1. 이것이 '화면의 색 = 범례의 색'을 지킨다.
  for (const s of [0.1, 0.5, 0.9, 1]) assert.equal(terrainShadeOf(s, s), 1, `평지(${s})에서 색이 바뀌었다`);
  // 해를 등진 비탈: 어두워지되 바닥 아래로는 안 간다(색을 못 알아볼 만큼 어두워지지 않게).
  assert.ok(terrainShadeOf(0.2, 0.8) < 1);
  assert.equal(terrainShadeOf(0, 1), Math.max(FIELD_SHADE.min, 1 - FIELD_SHADE.k));
  assert.ok(terrainShadeOf(0, 1) >= FIELD_SHADE.min);
  // 해를 마주한 비탈: 천장이 1 이다 — 범례보다 밝아지면 그 칸의 색을 되읽을 수 없다.
  assert.equal(terrainShadeOf(1, 0.2), 1);
  // 밤면은 손대지 않는다 — 색면은 값이지 조명이 아니다.
  assert.equal(terrainShadeOf(0, 0), 1);
  // 세기 0(지형을 못 받은 세션)이면 결이 없다.
  assert.equal(terrainShadeOf(0, 1, 0), 1);
  // 깎이는 폭은 눈에 보이되 색조를 바꾸지는 않는다(밝기만 곱한다).
  const band = bandRGB('temp', 8);
  const dark = paintedColorOf(band, UNDERS[0], { shade: terrainShadeOf(0, 1) });
  assert.ok(maxCh(dark, band) > 20, '결이 눈에 안 띄면 지형이 사라진 색칠한 공이 된다');
  const ratios = dark.map((c, i) => c / Math.max(1, paintedColorOf(band, UNDERS[0])[i]));
  assert.ok(Math.max(...ratios) - Math.min(...ratios) < 0.2, '채널마다 다른 비율로 깎였다 — 색조가 바뀐다');
});

// 2026-09-20 F2 정정 — 위 시험은 결의 **규칙**(평지 1 · 천장 1 · 바닥 min)만 쟀다. 규칙은 다 맞는데 **크기**가 틀려 있었다:
//   k 0.55 · min 0.72 에서 비탈의 계수가 0.72 에 붙어, 결이 바탕 혼합보다 **네 배 크게** 색을 바꿨다. 게다가 계수는 태양을 따르므로
//   값이 하나도 안 변해도 재생하거나 지구를 돌리면 같은 칸의 색이 변했다. 여기서는 그 **크기**를 상수에서 셈해 잠근다.
test('지형 결이 새 오염원이 되지 않는다 — 결이 깎는 최대가 바탕이 섞이는 몫을 넘지 않는다', () => {
  // 바탕이 색을 바꿀 수 있는 최대 = (1 − 불투명도) × 255. 결이 깎을 수 있는 최대 = (1 − min) × 불투명도 × 255.
  // 뒤가 앞을 넘으면, 바탕 혼합을 줄이려고 올린 불투명도를 결이 도로 까먹는다. 숫자를 박지 않고 상수에서 셈한다.
  const underBite = (1 - FIELD_OPACITY) * 255;
  const shadeBite = (1 - FIELD_SHADE.min) * FIELD_OPACITY * 255;
  assert.ok(shadeBite <= underBite + 0.5, `결이 깎는 최대 ${shadeBite.toFixed(1)} 가 바탕이 섞이는 몫 ${underBite.toFixed(1)} 보다 크다`);

  // 같은 칸(값이 하나도 안 변했다) 위에서 해만 돈다 — 화면의 색이 얼마나 흔들리나. 흔들림이 평지의 차보다 크면
  // 사용자는 '색이 변했으니 값이 변했나' 하고 읽는다. ▶ 로 5일을 재생하면 해가 실제로 한 바퀴 돈다.
  const band = bandRGB('temp', 8);
  const flatDiff = maxCh(paintedColorOf(band, UNDERS[0]), band);          // 결 없이 바탕만 섞였을 때의 차
  let lo = 1; let hi = 0;
  for (let i = 0; i <= 40; i += 1) {
    // 해가 도는 동안 이 칸의 (lit, sphereLit) 이 훑는 범위. sphereLit 는 평평한 구의 밝기, lit 는 기울인 법선의 밝기다.
    const sphereLit = i / 40;
    const s = terrainShadeOf(Math.max(0, sphereLit - 0.35), sphereLit);   // 해를 등진 비탈(차 0.35)에서 가장 많이 깎인다
    lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  const swing = maxCh(paintedColorOf(band, UNDERS[0], { shade: lo }), paintedColorOf(band, UNDERS[0], { shade: hi }));
  assert.ok(swing <= flatDiff, `값이 안 변했는데 해가 도는 것만으로 색이 ${swing} 만큼 흔들린다 (평지의 차 ${flatDiff})`);

  // 결이 아예 사라지지는 않았다 — 위 두 단언은 k 0 으로도 통과한다. 결을 뺄지는 PD 의 한 줄이다(field-renderer.js FIELD_SHADE 주석).
  assert.ok(FIELD_SHADE.k > 0 && terrainShadeOf(0, 1) < 1, '결이 사라졌다 — 지시서 E3 ⑤ 는 지형 결을 음영 계수로 주라고 적었다');
});

test('셰이더의 지형 결 — 같은 규칙이고, 값이 1 로 정해지는 곳에서는 고도맵을 읽지 않는다', () => {
  // GLSL 은 시험이 실행하지 못한다. 규칙과 발열 장치를 글자로 잠근다.
  assert.match(FIELD_FRAG, /float terrainShade\(vec3 nGeo, float lon, float lat\)/);
  assert.match(FIELD_FRAG, /band\.rgb \*= terrainShade\(n, lon, lat\);/, '구간색에 계수를 곱하지 않는다');
  assert.match(FIELD_FRAG, new RegExp(`clamp\\(1\\.0 \\+ uShadeK \\* \\(lit - sphereLit\\), ${FIELD_SHADE.min.toFixed(4)}, 1\\.0\\)`),
    'JS 거울(terrainShadeOf)과 식이 다르다');
  // 밤면 · 바다 · 극에서는 읽기 전에 빠져나간다(폰 발열).
  assert.match(FIELD_FRAG, /if \(sphereLit <= 0\.0\) return 1\.0;[\s\S]{0,200}?float hC = fieldHeightM\(lon, lat\);/);
  assert.match(FIELD_FRAG, /if \(bumpK <= 0\.0\) return 1\.0;[\s\S]{0,400}?slopeE/);
  // (예약어는 아래 '셰이더 글자' 시험이 두 단계 전부를 본다 — 여기서 같은 목록을 두 벌로 만들지 않는다.)
  // 같은 uniform 을 두 번 선언하지 않는다 — #ifdef 안팎에 나눠 적으면 바다 레이어에서만 컴파일이 깨진다.
  for (const u of ['uHeightMap', 'uHasHeight', 'uSunDir', 'uShade', 'uShadeK', 'uExagger']) {
    assert.equal((FIELD_FRAG.match(new RegExp(`^\\s*uniform\\s+\\w+\\s+${u};`, 'gm')) || []).length, 1, `uniform ${u} 선언이 하나가 아니다`);
  }
});

test('지형 결의 uniform 은 지구의 객체를 그대로 문다 — 태양·음영 손잡이를 두 벌로 만들지 않는다', () => {
  const terrain = {
    uHeightMap: { value: 'tex' }, uHasHeight: { value: 1 }, uExagger: { value: 50 },
    uShade: { value: 0.9 }, uSunDir: { value: new THREE.Vector3(0, 0, 1) },
  };
  const r = new FieldRenderer({ scale: scaleOf('temp'), terrain, segments: [8, 4] });
  for (const k of ['uHeightMap', 'uHasHeight', 'uExagger', 'uShade', 'uSunDir']) {
    assert.equal(r.uniforms[k], terrain[k], `${k} 를 새 객체로 만들었다 — 지구가 바꿔도 색면이 안 따라간다`);
  }
  assert.equal(r.uniforms.uShadeK.value, FIELD_SHADE.k);
  r.dispose();
  // 지형 묶음이 없으면(시험 · 지형을 못 받은 세션) 결을 만들지 않는다 — 셰이더가 그 줄을 지나간다.
  const bare = new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] });
  assert.equal(bare.uniforms.uShadeK.value, 0);
  assert.equal(bare.uniforms.uOpacity.value, FIELD_OPACITY);
  bare.dispose();
});

test('셰이더도 같은 자로 잰다 — 굵기는 pxScale 을 곱하고 흐림은 pxScale 로 나눈다', () => {
  // GLSL 은 시험이 실행하지 못한다(WebGL 없음). 글자로 잠근다 — JS 거울과 식이 갈리면 화면만 틀린다.
  assert.match(FIELD_FRAG, /float fade = smoothstep\(uLineFade\.x, uLineFade\.y, interval \/ \(grad \* max\(uPxScale, 0\.0001\)\)\);/);
  assert.match(FIELD_FRAG, /uniform float uPxScale;/);
});

// ---------------------------------------------------------------- uv 보정 · 값

test('uv 보정이 서울 칸(행 105 · 열 614)을 제자리에 놓는다', () => {
  const grid = { ni: 720, nj: 361, lon0: -180, lat0: 90, dLon: 0.5, dLat: 0.5, wraps: true };
  const uvT = uvTransformOf(grid);
  const g = gridCoordOf(uvT, grid, 37.5, 127);
  assert.ok(Math.abs(g[0] - 614) < 1e-9 && Math.abs(g[1] - 105) < 1e-9, `[${g}]`);
  // 보정 없이 구면 uv 를 그대로 쓰면 반 칸(0.25°) 어긋난다 — 이 시험이 그것을 잡는다.
  const raw = gridCoordOf({ su: 1, ou: 0, sv: 1, ov: 0 }, grid, 37.5, 127);
  assert.ok(Math.abs(raw[0] - 613.5) < 1e-9);
  // 두 극과 날짜변경선: 북극 = 행 0 · 남극 = 행 360 · 서경 180 = 열 0 · 동경 179.5 = 열 719.
  assert.ok(Math.abs(gridCoordOf(uvT, grid, 90, -180)[1]) < 1e-9);
  assert.ok(Math.abs(gridCoordOf(uvT, grid, -90, 0)[1] - 360) < 1e-9);
  assert.ok(Math.abs(gridCoordOf(uvT, grid, 0, -180)[0]) < 1e-9);
  assert.ok(Math.abs(gridCoordOf(uvT, grid, 0, 179.5)[0] - 719) < 1e-9);
  // 셰이더도 같은 식을 쓴다.
  assert.match(lf(FIELD_FRAG), /vec2 tuv = vec2\(suv\.x \* uUv\.x \+ uUv\.y, suv\.y \* uUv\.z \+ uUv\.w\);/);
  assert.match(lf(FIELD_FRAG), /vec2 g = vec2\(tuv\.x \* uGridSize\.x - 0\.5, \(1\.0 - tuv\.y\) \* uGridSize\.y - 0\.5\);/);
});

// 프레임 저장소(진짜 코드 + 가짜 입출력)로 클릭 값을 읽어 셰이더의 값과 견준다.
const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NoColorSpace: '',
  Texture: class { constructor(image) { this.image = image; } dispose() {} },
};
const T0 = Date.parse('2026-09-20T00:00:00Z');
const hourOf = (url) => Number(/(\d{3})\.png/.exec(url)[1]);
function storeWith(fill) {
  return createGfsFrames({
    THREE: FakeTHREE,
    now: () => T0,
    fetch: async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(SCHEMA2)) }),
    loadImage: async (url) => {
      const h = hourOf(url);
      const rgba = new Uint8Array(720 * 361 * 4);
      for (let r = 0; r < 361; r += 1) {
        for (let c = 0; c < 720; c += 1) rgba.set(fill(h, r, c, /\/u\d{3}/.test(url)), (r * 720 + c) * 4);
      }
      return { width: 720, height: 361, rgba };
    },
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
  });
}

test('셰이더가 셈하는 값 = 클릭 값(frames.sampleAt) — 칠해진 칸과 클릭한 값의 칸이 갈리지 않는다', async () => {
  // 위도·경도·시각마다 다른 바이트(가짜 난수) — 기온은 회색, 바람은 R·G.
  const byte = (h, r, c, k) => (r * 7 + c * 13 + h * 31 + k * 97 + ((r * c) % 11) * 5) % 256;
  const store = storeWith((h, r, c, wind) => (wind ? [byte(h, r, c, 0), byte(h, r, c, 1), 0, 255] : [byte(h, r, c, 0), byte(h, r, c, 0), byte(h, r, c, 0), 255]));
  await store.load();
  const spots = [[37.5, 127], [37.63, 126.91], [0, 179.9], [-0.2, -179.95], [89.9, 10], [-89.97, -60], [12.345, -45.678], [90, 0], [-90, 0]];
  for (const id of ['temp', 'wind10']) {
    const spec = store.fieldSpec(id);
    const uvT = store.uvTransform(id);
    for (const tMs of [T0, T0 + 1.25 * 3.6e6, T0 + 4.5 * 3.6e6]) {
      const br = await store.ensure(id, tMs);
      const args = {
        a: store.pixelsNow(id, br.a.h), b: store.pixelsNow(id, br.b.h), mix: br.mix,
        decode: spec.channels, uvT, size: spec.grid, wraps: spec.grid.wraps,
      };
      for (const [lat, lon] of spots) {
        const s = store.sampleAt(id, tMs, lat, lon);
        if (id === 'temp') {
          assert.ok(Math.abs(shaderValueAt({ ...args, mode: 'scalar' }, lat, lon) - s.value) < 1e-6, `${id} ${lat},${lon} @${br.mix}`);
        } else {
          const want = Math.hypot(s.values[0], s.values[1]);     // 성분을 섞은 뒤의 크기
          assert.ok(Math.abs(shaderValueAt({ ...args, mode: 'magnitudeRG' }, lat, lon) - want) < 1e-6, `${id} ${lat},${lon}`);
        }
      }
    }
  }
});

test('고원에서 셰이더의 값은 정확히 그 값이다 — 30.0°C 고원이 25–30 칸으로 떨어지지 않는다', async () => {
  const store = storeWith(() => [220, 220, 220, 255]);          // 220 × 0.5 − 80 = 30.0°C 가 전지구에 깔렸다
  await store.load();
  const spec = store.fieldSpec('temp');
  const br = await store.ensure('temp', T0 + 1.1 * 3.6e6);
  const args = {
    a: store.pixelsNow('temp', br.a.h), b: store.pixelsNow('temp', br.b.h), mix: br.mix,
    decode: spec.channels, uvT: store.uvTransform('temp'), size: spec.grid, wraps: true,
  };
  const breaks = scaleUniforms(scaleOf('temp')).breaks;
  for (const [lat, lon] of [[37.513, 127.031], [0.1234, -179.99], [-45.4321, 33.333], [89.99, 0.01]]) {
    const v = shaderValueAt(args, lat, lon);
    assert.equal(v, 30, `${lat},${lon} → ${v}`);
    assert.equal(shaderBandIndex(breaks, v), bandIndex(scaleOf('temp'), 30));
    assert.equal(shaderBandIndex(breaks, v), 9, "'30 – 35' 칸(아래 경계 포함)");
  }
});

// ---------------------------------------------------------------- 지형

test('지형 GLSL 은 main.js 의 것과 같은 글자다 — 두 벌이 어긋나면 색면이 산을 뚫거나 묻힌다', () => {
  const bodyOf = (src, head) => {
    const at = src.indexOf(head);
    assert.ok(at >= 0, `main.js 에서 '${head}' 를 못 찾았다`);
    let depth = 0;
    for (let i = src.indexOf('{', at); i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      if (src[i] === '}') { depth -= 1; if (depth === 0) return squash(src.slice(at, i + 1)); }
    }
    throw new Error('닫는 중괄호 없음');
  };
  const mine = lf(FIELD_TERRAIN_GLSL);
  for (const head of ['float decodeHeight(vec3 rgb)', 'vec2 mercatorUV(float lon, float lat)', 'float displacementHeight(float lon, float lat)']) {
    assert.equal(bodyOf(mine, head), bodyOf(MAIN_SRC, head), head);
  }
  // 정점 변위: EARTH_VERT 의 줄들이 그대로 있고(극지 페이드 포함) 그 위에 uLift 만 더한다.
  const earthVert = MAIN_SRC.slice(MAIN_SRC.indexOf('const EARTH_VERT ='), MAIN_SRC.indexOf('const EARTH_FRAG ='));
  const vert = squash(FIELD_VERT);
  for (const line of [
    'vUnit = normalize(position);',
    'float lat = asin(clamp(vUnit.y, -1.0, 1.0));',
    'float lon = atan(vUnit.x, vUnit.z);',
    'float h = displacementHeight(lon, lat);',
    'float poleFade = smoothstep(1.437, 1.4844, abs(lat));',
    'h = mix(h, lat < 0.0 ? 2800.0 : 0.0, poleFade);',
  ]) {
    assert.ok(squash(earthVert).includes(line), `main.js EARTH_VERT 가 바뀌었다: ${line}`);
    assert.ok(vert.includes(line), `FIELD_VERT 에 없다: ${line}`);
  }
  assert.ok(squash(earthVert).includes('float disp = max(h, 0.0) / ${EARTH_RADIUS_M.toFixed(1)} * uExagger;'));
  assert.ok(/const EARTH_RADIUS_M = 6371000;/.test(MAIN_SRC));
  assert.ok(vert.includes('float disp = max(h, 0.0) / 6371000.0 * uExagger;'));
  assert.ok(vert.includes('vec3 p = vUnit * (1.0 + disp + uLift);'));
});

test('과장이 바뀌면 uniform 만 바뀐다 — 지구의 uniform 객체와 지오메트리를 그대로 같이 쓴다', () => {
  const terrain = { uHeightMap: { value: { isTexture: true } }, uHasHeight: { value: 1 }, uExagger: { value: 50 } };
  const geometry = new THREE.SphereGeometry(1, 8, 4);
  let disposed = 0;
  geometry.dispose = () => { disposed += 1; };
  const r = new FieldRenderer({ scale: scaleOf('temp'), terrain, geometry });
  assert.equal(r.uniforms.uExagger, terrain.uExagger, '같은 객체 — main.js 가 value 를 고치면 이 셰이더가 그대로 읽는다');
  assert.equal(r.uniforms.uHeightMap, terrain.uHeightMap);
  assert.equal(r.uniforms.uHasHeight, terrain.uHasHeight);
  terrain.uExagger.value = 12;
  assert.equal(r.material.uniforms.uExagger.value, 12);
  assert.equal(r.mesh.geometry, geometry, '지구의 지오메트리를 같이 쓴다(정점이 같아야 평행면이다)');
  assert.equal(r.uniforms.uLift.value, FIELD_LIFT);
  r.dispose();
  assert.equal(disposed, 0, '받은 지오메트리는 버리지 않는다');
  // 따로 만든 것은 버린다.
  const own = new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] });
  let ownDisposed = 0;
  own.geometry.dispose = () => { ownDisposed += 1; };
  own.dispose();
  assert.equal(ownDisposed, 1);
});

test('셰이더 글자 — GLSL ES 예약어를 이름으로 쓰지 않았고 괄호가 맞는다(화면 없이 잡을 수 있는 컴파일 오류)', () => {
  // 이 작업은 WebGL 없이 합쳐진다. 'half' 하나로 셰이더가 통째로 컴파일되지 않고 색면이 조용히 사라진다 — 실제로 한 번 그렇게 썼다.
  const RESERVED = ['half', 'sample', 'input', 'output', 'filter', 'common', 'active', 'partition', 'fixed', 'unsigned', 'superp',
    'long', 'short', 'double', 'class', 'union', 'enum', 'typedef', 'template', 'this', 'goto', 'inline', 'noinline', 'public',
    'static', 'extern', 'external', 'interface', 'sizeof', 'cast', 'namespace', 'using', 'asm', 'resource', 'patch', 'subroutine',
    'coherent', 'volatile', 'restrict', 'readonly', 'writeonly', 'atomic_uint', 'noperspective', 'packed', 'centroid', 'flat', 'smooth',
    'hvec2', 'hvec3', 'hvec4', 'fvec2', 'fvec3', 'fvec4', 'dvec2', 'dvec3', 'dvec4', 'texture'];
  for (const [name, src] of [['FIELD_VERT', FIELD_VERT], ['FIELD_FRAG', FIELD_FRAG]]) {
    const code = lf(src).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const words = new Set(code.match(/[A-Za-z_]\w*/g));
    for (const w of RESERVED) assert.ok(!words.has(w), `${name}: '${w}' 는 GLSL ES 3.00 의 예약어다`);
    for (const [open, close] of [['(', ')'], ['{', '}'], ['[', ']']]) {
      assert.equal(code.split(open).length, code.split(close).length, `${name}: ${open}${close} 짝이 안 맞는다`);
    }
    assert.ok(!/[^\x00-\x7f]/.test(code), `${name}: 주석 밖에 ASCII 가 아닌 글자가 있다 — shaderSource 가 거부한다`);
    assert.equal((code.match(/#ifdef|#ifndef|#if /g) || []).length, (code.match(/#endif/g) || []).length, `${name}: #if / #endif 짝`);
  }
  // 두 단계가 같이 쓰는 이름은 같은 형이어야 링크된다.
  assert.match(lf(FIELD_VERT), /varying vec3 vUnit;/);
  assert.match(lf(FIELD_FRAG), /varying vec3 vUnit;/);
  assert.match(lf(FIELD_VERT), /uniform sampler2D uHeightMap;\s+uniform float uHasHeight;/);
  // 바다 가림은 두 단이다 — 육지 판(uLandMask · 2026-09-20 반박 검증) 과 고도(uHeightMap). 둘 다 제 '있음' 플래그를 달고 온다.
  // ⚠️ 고도맵은 2026-09-20(작업 E3 ⑤)부터 지형 결도 쓴다 — 그래서 #ifdef **밖**에 한 번만 선언한다(안에 또 적으면
  //    같은 이름이 두 번 선언돼 바다 레이어에서만 셰이더가 통째로 컴파일되지 않는다). 판 둘만 ifdef 안에 남는다.
  assert.match(lf(FIELD_FRAG), /uniform sampler2D uHeightMap;\s+uniform float uHasHeight;[\s\S]*#ifdef FIELD_MASK_OCEAN\s+uniform sampler2D uLandMask;[^\n]*\s+uniform float uHasLand;[^\n]*\s+#endif/);
  // 셰이더가 읽는 uniform 은 전부 재질에 있다(이름이 어긋나면 값이 0 으로 들어가 색면이 한 색이 된다).
  const r = new FieldRenderer({ scale: scaleOf('temp'), mode: 'magnitudeRG', mask: 'ocean', segments: [8, 4] });
  const declared = new Set([...lf(FIELD_VERT + FIELD_FRAG).matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1]));
  for (const name of declared) assert.ok(name in r.uniforms, `재질에 uniform '${name}' 가 없다`);
  for (const name of Object.keys(r.uniforms)) assert.ok(declared.has(name), `셰이더가 안 읽는 uniform '${name}'`);
  r.dispose();
});

// ---------------------------------------------------------------- 그리기 객체

test('프레임이 오기 전에는 그리지 않는다 · 구름 아래 지표 위 · 투명하되 깊이를 쓰지 않는다', () => {
  const r = new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] });
  assert.equal(r.mesh.visible, false, '빈 색 · 검은 구를 그리지 않는다');
  r.setVisible(true);
  assert.equal(r.mesh.visible, false, '프레임 없이 켜 달래도 안 켠다');
  const a = { id: 'A' }; const b = { id: 'B' };
  r.setFrames(a, b, 0.25);
  assert.deepEqual([r.mesh.visible, r.uniforms.uTexA.value, r.uniforms.uTexB.value, r.uniforms.uMix.value], [true, a, b, 0.25]);
  r.setFrames(a, null, 0.7);
  assert.deepEqual([r.uniforms.uTexB.value, r.uniforms.uMix.value], [a, 0], '프레임이 하나면 섞지 않는다');
  r.setFrames(null);
  assert.equal(r.mesh.visible, false);
  assert.equal(r.mesh.renderOrder, FIELD_RENDER_ORDER);
  assert.ok(FIELD_RENDER_ORDER < 1, '구름(renderOrder 1)보다 먼저 그린다');
  assert.deepEqual([r.material.transparent, r.material.depthWrite, r.material.depthTest], [true, false, true]);
  assert.equal(r.mesh.frustumCulled, false);
  // 그리기 직전: 장치 픽셀비를 맞추고 카메라를 넘긴다.
  const cam = { isCamera: true };
  let got = null;
  r.onFrame = (c) => { got = c; };
  r.mesh.onBeforeRender({ getPixelRatio: () => 2 }, null, cam);
  assert.deepEqual([r.uniforms.uPxScale.value, got], [2, cam]);
  r.dispose();
});

test('모드와 가림은 컴파일 때 갈린다 — 풍속(|R,G|) · 바다 가림은 능력만 있고 모르는 이름은 던진다', () => {
  const chans = [{ transfer: 'linear', scale: 0.5, offset: -64 }, { transfer: 'linear', scale: 0.25, offset: -32 }];
  const uv = { su: 1, ou: 0.5 / 720, sv: 360 / 361, ov: 0.5 / 361 };
  const grid = { ni: 720, nj: 361, wraps: true };
  const wind = new FieldRenderer({ scale: scaleOf('wind'), mode: 'magnitudeRG', mask: 'ocean', segments: [8, 4] });
  assert.equal(wind.material.defines.FIELD_MODE_MAGNITUDE, 1);
  assert.equal(wind.material.defines.FIELD_MASK_OCEAN, 1);
  wind.setField({ channels: chans, uv, grid });
  assert.deepEqual(wind.uniforms.uDecode.value.toArray(), [0.5, -64, 0.25, -32], '디코드 상수는 받은 것 그대로');
  assert.deepEqual(wind.uniforms.uUv.value.toArray(), [uv.su, uv.ou, uv.sv, uv.ov]);
  assert.deepEqual(wind.uniforms.uGridSize.value.toArray(), [720, 361]);
  const temp = new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] });
  assert.equal(temp.material.defines.FIELD_MODE_MAGNITUDE, undefined);
  assert.equal(temp.material.defines.FIELD_MASK_OCEAN, undefined);
  assert.throws(() => wind.setField({ channels: [chans[0]], uv, grid }), /채널 2개/);
  assert.throws(() => temp.setField({ channels: [{ transfer: 'log10', logLo: 0, logSpan: 1 }], uv, grid }), /선형 디코드만/);
  assert.throws(() => new FieldRenderer({ scale: scaleOf('temp'), mode: 'vector' }), /모르는 mode/);
  assert.throws(() => new FieldRenderer({ scale: scaleOf('temp'), mask: 'land' }), /모르는 mask/);
  assert.match(lf(FIELD_FRAG), /#ifdef FIELD_MASK_OCEAN[\s\S]*if \(hgt >= 0\.0\) discard;/);
  // 육지 판이 **고도보다 먼저** 선다. 고도 부호만으로는 해수면보다 낮은 육지를 가르지 못한다(land-mask.js 머리말) —
  // 판이 뒤에 서면 그 자리는 이미 칠해진 뒤다. 판이 없으면(uHasLand 0) 옛 동작 그대로다.
  const frag = lf(FIELD_FRAG);
  assert.ok(frag.indexOf('uLandMask, vec2(') < frag.indexOf('if (hgt >= 0.0) discard;'), '육지 판이 고도 가림보다 뒤에 있다');
  assert.match(frag, /if \(uHasLand > 0\.5\) \{\s+if \(texture2D\(uLandMask, vec2\(lon \/ \(2\.0 \* PI\) \+ 0\.5, lat \/ PI \+ 0\.5\)\)\.r > 0\.5\) discard;/);
  wind.dispose(); temp.dispose();
});
