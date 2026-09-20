// DEV-DIRECTIVE 2026-09-20 · W4 — 강수 색면(log10 로 실린 자료)의 **결과** 시험.
//
// 금지만 시험하면 아무것도 안 칠하는 렌더러가 통과한다. 여기서는 무엇이 칠해지고 무엇이 말해지는지를 잰다:
//   셰이더의 디코드 식이 저장소(gfs-frames.decodeByte)와 바이트 256칸 전부에서 같은 값인가 ·
//   바이트 0 과 0.1 mm/h 미만이 **정말 투명한가**(팔레트의 알파로) · 두 프레임을 **값에서** 섞는가(1 과 10 의 가운데가 5.5 인가 · 3.16 이 아닌가) ·
//   칠해진 칸이 클릭 값(frames.sampleAt)의 칸과 같은가 · 코어 윤곽이 10 mm/h 에서만 서고 포화 고원에서 면으로 번지지 않는가 ·
//   범례가 포화를 말하는가 · 누적 단추를 그리지 않는가.
// WebGL 은 없다 — 셰이더 식을 JS 로 옮긴 순수 함수와 셰이더 소스의 글자를 본다(field-renderer.test.mjs 의 선례).
//
// 숫자를 박지 않는다. 기대값은 **픽스처의 디코드 상수와 눈금표**에서 셈한다 —
// 픽스처(fixtures/gfs-fc-manifest-c1-legacy.json)는 aws/gfs-cloud-forecast/handler.py 의 field_specs() 가 낸 그대로이고
// 파이썬 시험(test_field_frames.py C1FixtureLock)이 그것을 잠근다. 인코더를 바꾸면 그쪽이 먼저 떨어진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FIELD_LOG2_10, logRangeText, logReadout, logUniforms, logValueText, readTicks, shaderLogDecode, topBandNote,
} from '../../prototype/v2-three/js/field-log.js';
import {
  FIELD_FRAG, FIELD_LINE, FieldRenderer,
  halfStepOf, isolineAlpha, isolineUniforms, lineCoverage, paintedBandIndex, scaleUniforms, shaderBandIndex, shaderValueAt,
} from '../../prototype/v2-three/js/field-renderer.js';
import { bandColor, bandIndex, isolineSpec, legendModel, paletteRGBA, scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { FIELD_DESCRIPTORS, FieldLayer, readoutOf } from '../../prototype/v2-three/js/field-layer.js';
import { createGfsFrames, decodeByte, readManifest } from '../../prototype/v2-three/js/gfs-frames.js';
import { createTimeBus } from '../../prototype/v2-three/js/time-bus.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');   // 이 워크트리는 CRLF 로 체크아웃된다 — 글자 대조는 LF 로 한다
const src = (rel) => lf(readFileSync(new URL(`../../prototype/v2-three/js/${rel}`, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const C1 = JSON.parse(readFileSync(here('./fixtures/gfs-fc-manifest-c1-legacy.json'), 'utf8'));   // 스텝 0·3·6 h
const SCHEMA2 = JSON.parse(readFileSync(here('./fixtures/gfs-fc-manifest-schema2.json'), 'utf8')); // 강수가 fields{} 에 없던 매니페스트
const H = 3.6e6;
const T0 = Date.parse(C1.run);

const MODEL = readManifest(C1);
const CH = MODEL.fields.precip.channels[0];        // 강수율 R — 디코드 상수의 유일한 출처
const SCALE = scaleOf('precip');
const BREAKS = scaleUniforms(SCALE).breaks;
const PAL = paletteRGBA(SCALE);

// 값 v 를 가장 가깝게 담는 바이트(인코더의 반올림과 같은 자리). 상수는 픽스처에서만 온다.
const byteFor = (v) => Math.max(0, Math.min(255, Math.round(((Math.log10(v) - CH.logLo) / CH.logSpan) * 255)));
// 셰이더가 그 값을 칠하는 칸의 **알파 바이트** — 0 이면 칠하지 않는다.
const paintedAlpha = (v) => PAL[paintedBandIndex(BREAKS, v, halfStepOf([CH])) * 4 + 3];

const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NoColorSpace: '',
  Texture: class { constructor(image) { this.image = image; } dispose() {} },
};
const hourOf = (url) => Number(/(\d{3})\.png/.exec(url)[1]);

// 가짜 강수 프레임. R 은 주어진 바이트, **G·B 는 0 이 아닌 딴 수**다 — 종류 부호·유도값이 값으로 새어 들면 여기서 걸린다.
const image = (rByte, g, b) => {
  const rgba = new Uint8Array(720 * 361 * 4);
  for (let p = 0; p < 720 * 361; p += 1) rgba.set([rByte, g, b, 255], p * 4);
  return { width: 720, height: 361, rgba };
};
const storeWith = (byteAtHour, manifest = C1) => createGfsFrames({
  THREE: FakeTHREE,
  now: () => T0,
  fetch: async () => ({ ok: true, json: async () => clone(manifest) }),
  loadImage: async (url) => image(byteAtHour(hourOf(url)), 200, 77),
  readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
});

// 한 점만 보는 것은 격자 보정을 못 잡는다 — 날짜변경선·극·서울을 같이 본다.
const SPOTS = [[37.5, 127], [0.25, -179.75], [-45.5, 33.5], [89.9, 0.1], [12.34, 178.9]];

// ---------------------------------------------------------------- ① 디코드

test('셰이더의 로그 디코드 = 저장소의 디코드 — 바이트 256칸 전부', () => {
  const u = logUniforms(CH);
  assert.equal(u.span, CH.logSpan / 255);
  assert.equal(u.lo, CH.logLo);
  assert.equal(u.zeroByte, CH.zeroByte);
  for (let b = 0; b <= 255; b += 1) {
    const mine = shaderLogDecode(u, b);
    const store = decodeByte(CH, b);
    if (b === CH.zeroByte) { assert.equal(mine, 0, '없음 바이트는 0 이지 10^logLo 가 아니다'); continue; }
    assert.ok(Math.abs(mine - store) <= Math.abs(store) * 1e-12, `byte ${b}: ${mine} vs ${store}`);
  }
  // 단조 증가 · 양 끝. 어느 것도 이 파일에 숫자로 적지 않았다.
  assert.ok(shaderLogDecode(u, 1) > CH.min && shaderLogDecode(u, 1) < shaderLogDecode(u, 2));
  assert.ok(Math.abs(shaderLogDecode(u, 255) - CH.max) < 1e-9, '바이트 255 = 천장');
  // 셰이더에도 같은 식·같은 수가 적혀 있다(GLSL 에는 log10 도 없고 pow(10,x) 의 보증도 없다).
  assert.equal(FIELD_LOG2_10, Math.log2(10));
  assert.ok(lf(FIELD_FRAG).includes(`const float LOG2_10 = ${FIELD_LOG2_10};`), 'LOG2_10 이 field-log.js 의 수 그대로다');
  assert.match(lf(FIELD_FRAG), /float val = abs\(bytes\.x - uZeroByte\) < 0\.5 \? 0\.0 : exp2\(\(bytes\.x \* uLog\.x \+ uLog\.y\) \* LOG2_10\);/);
  assert.match(lf(FIELD_FRAG), /return vec2\(val, 0\.0\);/, 'G 를 값으로 쓰지 않는다 — 강수 프레임의 G 는 종류 부호다');
  // 디코드는 **네 칸을 뜨는 자리 안**에 있다 — 바이트를 섞은 뒤 풀면 기하평균이 나온다.
  assert.ok(lf(FIELD_FRAG).indexOf('exp2((bytes.x') < lf(FIELD_FRAG).indexOf('vec2 sampleGrid'));
});

// ---------------------------------------------------------------- ② 칠하지 않는 칸

test('바이트 0 은 투명 · 0.1 mm/h 미만은 칠하지 않는다 — 맨 아래 칸의 알파가 0 이다', () => {
  assert.equal(SCALE.alpha[0], 0, '눈금표의 맨 아래 칸이 칠하지 않는 칸이다');
  assert.equal(paintedAlpha(0), 0, '비가 없는 곳은 아예 안 칠한다(안 오는 곳이 파래지면 지구 전체가 비가 된다)');
  assert.equal(paintedAlpha(decodeByte(CH, 1)), 0, '자료가 낼 수 있는 가장 작은 비(0.05 mm/h 대)도 아직 안 칠한다');
  assert.equal(paintedAlpha(SCALE.breaks[0] - 1e-6), 0);
  assert.ok(paintedAlpha(SCALE.breaks[0]) > 0, '0.1 mm/h 부터 칠한다(아래 경계 포함)');
  for (const b of SCALE.breaks.slice(1)) assert.ok(paintedAlpha(b) > 0, `${b} mm/h`);
  // 범례는 화면에 있는 색만 말한다 — 칸 9개 가운데 8개.
  const cells = legendModel(SCALE);
  assert.equal(cells.length, SCALE.breaks.length, '경계 8 → 범례 8칸(칠하지 않는 칸은 빠진다)');
  assert.equal(cells[0].from, SCALE.breaks[0]);
  assert.equal(cells[0].fromText, String(SCALE.breaks[0]));
  // 셰이더는 알파 0 이고 선도 없으면 그리지 않는다(옅게도 칠하지 않는다).
  assert.match(lf(FIELD_FRAG), /float outA = line \+ bandA \* \(1\.0 - line\);\s*\n\s*if \(outA < 0\.004\) discard;/);
});

test('바이트 256칸 전부에서 셰이더가 고르는 칸 = 눈금표가 고르는 칸 (float32 로도)', () => {
  const u = logUniforms(CH);
  for (let b = 0; b <= 255; b += 1) {
    const store = decodeByte(CH, b);
    assert.equal(shaderBandIndex(BREAKS, Math.fround(shaderLogDecode(u, b))), bandIndex(SCALE, store), `byte ${b} → ${store}`);
  }
  // 반 눈금은 0 이다 — 로그에는 상수 눈금이 없고, 경계가 바이트 값 위에 있지도 않다(field-log.js 머리말).
  assert.equal(halfStepOf([CH]), 0);
  assert.equal(halfStepOf([CH], 'magnitudeRG'), 0);
});

// ---------------------------------------------------------------- ③ 값에서 섞는다 · CPU 와 같은 칸

test('두 프레임은 **값에서** 섞인다 — 1 과 10 mm/h 의 가운데는 5.5 이지 3.16 이 아니다', async () => {
  const b1 = byteFor(1);
  const b10 = byteFor(10);
  const store = storeWith((h) => (h === 0 ? b1 : b10));
  await store.load();
  const spec = store.fieldSpec('precip');
  assert.equal(spec.channels.length, 1, '저장소도 R 하나만 남긴다 — G·B 는 값이 아니다');
  const tMs = T0 + 1.5 * H;                                    // f000 과 f003 의 한가운데
  const br = await store.ensure('precip', tMs);
  assert.equal(br.mix, 0.5);
  const args = {
    a: store.pixelsNow('precip', br.a.h), b: store.pixelsNow('precip', br.b.h), mix: br.mix,
    decode: spec.channels, uvT: store.uvTransform('precip'), size: spec.grid, wraps: spec.grid.wraps,
  };
  const want = (decodeByte(CH, b1) + decodeByte(CH, b10)) / 2;                         // 값의 가운데
  const geo = Math.sqrt(decodeByte(CH, b1) * decodeByte(CH, b10));                     // 바이트를 섞고 풀면 나오는 것
  assert.ok(want > 5 && want < 6 && geo > 3 && geo < 3.5, `${want} vs ${geo}`);
  assert.notEqual(bandIndex(SCALE, want), bandIndex(SCALE, geo), '두 길은 다른 칸을 칠한다 — 섞는 순서가 화면에 보인다');
  for (const [lat, lon] of SPOTS) {
    const v = shaderValueAt(args, lat, lon);
    const s = store.sampleAt('precip', tMs, lat, lon);
    assert.ok(Math.abs(v - want) < 1e-9, `${lat},${lon} → ${v}`);
    assert.ok(Math.abs(v - s.value) < 1e-9, '셰이더가 셈하는 값 = 클릭 값');
    // 칠해진 칸 = 클릭한 값의 칸. 반 눈금이 0 이라 더하거나 뺀 값이 아니다.
    assert.equal(paintedBandIndex(BREAKS, v, halfStepOf(spec.channels)), bandIndex(SCALE, s.value), `${lat},${lon}`);
  }
});

test('포화 고원(천장 바이트)에서 값은 정확히 천장이고 선이 면이 되지 않는다', async () => {
  const store = storeWith(() => 255);                          // 전지구가 30 mm/h — 강수율 프레임의 천장
  await store.load();
  const spec = store.fieldSpec('precip');
  const br = await store.ensure('precip', T0 + 1.1 * H);
  const args = {
    a: store.pixelsNow('precip', br.a.h), b: store.pixelsNow('precip', br.b.h), mix: br.mix,
    decode: spec.channels, uvT: store.uvTransform('precip'), size: spec.grid, wraps: true,
  };
  const top = shaderLogDecode(logUniforms(CH), 255);
  const iso = isolineUniforms(isolineSpec(SCALE), true);
  for (const [lat, lon] of SPOTS) {
    const v = shaderValueAt(args, lat, lon);
    assert.equal(v, top, `${lat},${lon} → ${v}`);              // a + (b − a)·t 꼴이라 고원에서 정확히 a 다
    assert.equal(shaderBandIndex(BREAKS, v), bandIndex(SCALE, top));
    // 고원의 화면 기울기는 0 — 고원 가드가 선을 막는다(가드가 없으면 면 전체가 흰 선이 된다).
    assert.equal(isolineAlpha(v, 0, iso, 1), 0);
    assert.equal(isolineAlpha(v, 0, iso, 2), 0);
    // 기울기가 있어도 값이 레벨 위쪽이면 선이 아니다(선은 아래쪽에만 선다).
    assert.equal(isolineAlpha(v, 0.4, iso, 1), 0);
  }
  assert.equal(lineCoverage(iso.levels[0] - top, 0.4, FIELD_LINE.emphasisWidthPx), 0);
});

// ---------------------------------------------------------------- ④ 코어 윤곽

test('등치선은 강한 코어 하나 — 10 mm/h 에서만 서고 다른 경계에는 없다', () => {
  const spec = isolineSpec(SCALE);
  assert.deepEqual([...spec.levels], [...SCALE.isolines.levels], '그을 값은 눈금표의 것뿐이다');
  assert.equal(spec.levels.length, 1);
  assert.equal(spec.interval, null, '고른 간격이 아니다 — 격자 모양 등치선을 만들지 않는다');
  assert.equal(spec.label, 'none', '코어 윤곽에는 숫자 라벨을 달지 않는다(선 하나에 숫자가 수십 개 서면 지도가 덮인다)');
  const iso = isolineUniforms(spec, true);
  assert.deepEqual([iso.on, iso.levelCount, iso.interval, iso.majorEvery], [1, 1, 0, 0]);
  assert.equal(iso.levels[0], spec.levels[0]);
  assert.equal(iso.widths[0], Math.fround(FIELD_LINE.emphasisWidthPx), '강조값이라 굵은 선이다(uniform 은 float32)');
  const core = spec.levels[0];
  const grad = 0.2;                                            // 화면 1px 에 0.2 mm/h
  assert.ok(isolineAlpha(core - grad * 1.5, grad, iso, 1) > 0.5, '코어 경계 바로 아래에 선이 선다');
  for (const b of SCALE.breaks) {
    if (b === core) continue;
    assert.equal(isolineAlpha(b - grad * 1.5, grad, iso, 1), 0, `${b} mm/h 에는 선이 없다`);
  }
  assert.equal(isolineUniforms(spec, false).on, 0, '꺼면 긋지 않는다');
});

// ---------------------------------------------------------------- ⑤ 범례 · 카드

test('범례는 자료가 못 채우는 맨 위 칸을 말한다 — 천장은 매니페스트에서만 온다', () => {
  const note = topBandNote(SCALE, CH, true);
  assert.ok(note.includes(logValueText(SCALE, CH.max)), `천장 ${CH.max} 을 말한다`);
  assert.ok(note.includes(logValueText(SCALE, SCALE.breaks[SCALE.breaks.length - 1])), '못 나오는 칸을 말한다');
  assert.match(note, /포화/);
  assert.match(topBandNote(SCALE, CH, false), /saturates/);
  // 천장이 맨 위 칸을 넘는 자료는 아무 말도 하지 않는다 — 없는 한계를 지어내지 않는다.
  assert.equal(topBandNote(scaleOf('temp'), MODEL.fields.temp.channels[0]), '');
  assert.equal(topBandNote(scaleOf('wind'), MODEL.fields.wind10.channels[0]), '');
  assert.equal(topBandNote(scaleOf('pressure'), MODEL.fields.mslp.channels[0]), '');
  assert.equal(topBandNote(SCALE, { ...CH, max: SCALE.breaks[SCALE.breaks.length - 1] + 1 }), '', '인코더가 천장을 올리면 글이 사라진다');
  assert.equal(topBandNote(SCALE, null), '');
});

test('카드 — 기간 칩이 서고(1시간은 없다), 고를 것 없는 등치선은 글자로 말한다', async () => {
  const store = storeWith(() => byteFor(3));
  const timeBus = createTimeBus({ now: () => T0 });
  const legend = { last: null, show(a) { this.last = a; }, hide() {}, release() {} };
  const layer = new FieldLayer(FIELD_DESCRIPTORS.raingrid, {
    frames: store, timeBus, legend, parent: { add() {}, remove() {} }, segments: [8, 4],
    getLang: () => 'ko', now: () => T0, makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 92, h: 40 }),
    setInterval: () => 1, clearInterval: () => {},
  });
  assert.deepEqual(await layer.on(), { on: true });
  const html = layer.cardHtml();
  assert.ok(!/field-iso-step/.test(html), '눈금표에 간격 선택지가 없다 — 없는 단추를 그리지 않는다');
  // (2026-09-20 작업 E2) D2 가 '누를 때 아무 일도 안 나는 토글'이라 비워 두었던 자리에 기간 칩이 섰다.
  // 여전히 잠그는 것: **1시간 칩은 없다.** GFS 누적 버킷은 3시간이 가장 짧아 1시간 양은 지어내야 한다.
  assert.match(html, /data-action="field-accum" data-layer="raingrid" data-window="rate" aria-pressed="true"/, '켠 직후는 현재 강우다');
  assert.match(html, /data-window="3" aria-pressed="false"/);
  assert.match(html, /data-window="24" aria-pressed="false"/);
  assert.ok(!/data-window="1"/.test(html), '1시간 칩은 없다 — 지어내야 나오는 값에는 단추를 달지 않는다');
  assert.match(html, /1시간 누적은 없습니다/, '없는 까닭을 화면이 말한다(조용히 빠뜨리지 않는다)');
  assert.ok(/mm\/h/.test(html) && !/>\s*mm\s*</.test(html), '현재 강우에서는 단위가 mm/h 다(누적 mm 로 바뀌지 않는다)');
  assert.match(html, new RegExp(`${legendModel(SCALE).length}단 구간색`), '칠하는 칸만 센다 — 9칸이 아니라 8칸');
  assert.match(html, /강한 코어 윤곽/);
  assert.match(html, new RegExp(`${SCALE.isolines.levels[0]} mm/h 이상`), '선이 무엇을 두르는지 글자로 말한다');
  assert.match(html, /data-action="field-iso"/, '켬/끔은 실제로 동작한다');
  assert.equal(layer.handleAction('field-iso', { layer: 'raingrid', set: 'off' }), true);
  assert.equal(layer.renderer.uniforms.uIsoOn.value, 0);
  // 범례의 풀이 줄은 **둘 다** 말한다(누른 곳도 못 그릴 사정도 없을 때): 눈금표가 늘 하는 말 + 포화 고지.
  // 전에는 note 를 하나만 넘겨, 뒤엣것이 앞엣것을 덮었다(field-legend.js legendView 는 note 가 차 있으면 scale.legendNote 를 안 본다).
  assert.ok(legend.last.note.includes(SCALE.legendNote.ko), '눈금표의 풀이(0.1 미만은 칠하지 않습니다)가 남아 있다');
  assert.ok(legend.last.note.includes(topBandNote(SCALE, CH, true)), '포화 고지도 같이 선다');
  assert.equal(legend.last.note, `${SCALE.legendNote.ko} · ${topBandNote(SCALE, CH, true)}`);
  // 풀이 줄은 **12px 두 줄(24px)** 이고 그 칸은 overflow:hidden 이다(index.html #field-legend · .fl-note) —
  // 넘치면 조용히 잘린다. 둘을 이어도 들어가는지 글자 폭으로 재 둔다: 한글은 글씨 크기만큼(9.5px), 나머지는 그 절반,
  // 빈칸은 4분의 1. 가장 좁은 화면은 320px 폰이다(@media 720px 에서 좌우 8px + 안쪽 여백 12px×2).
  const FS = 9.5;
  const wide = (s) => [...s].reduce((w, c) => w + (/[가-힣]/.test(c) ? FS : c === ' ' ? FS / 4 : FS / 2), 0);
  const lineW = 320 - 8 * 2 - 12 * 2;
  assert.ok(wide(legend.last.note) <= 2 * lineW,
    `범례 풀이 줄이 두 줄(${2 * lineW}px)을 넘는다 — ${wide(legend.last.note).toFixed(0)}px`);
  // id 로 견준다 — 시험은 field-scales.js 를 질의문자열 없이 들이므로 앱('…?v=1')과 다른 모듈 사본이다(ES 모듈은 URL 전체로 구분된다).
  assert.equal(legend.last.scale.id, SCALE.id);
  assert.deepEqual([...legend.last.scale.breaks], [...SCALE.breaks]);
  layer.off();
});

test("카드의 '모델 범위' — 운영 프레임처럼 바이트 0 과 255 가 같이 있어도 두 수로 굳지 않는다", async () => {
  // 전지구 프레임은 늘 '비 없음' 칸(바이트 0)과 천장에 닿은 칸을 함께 갖는다 — 그래서 이 줄이 '0.0 ~ 30.0 mm/h' 로 굳어 있었다.
  const spread = (rByte) => {
    const rgba = new Uint8Array(720 * 361 * 4);
    for (let p = 0; p < 720 * 361; p += 1) rgba.set([p === 0 ? 0 : p === 1 ? 255 : rByte, 200, 77, 255], p * 4);
    return { width: 720, height: 361, rgba };
  };
  const store = createGfsFrames({
    THREE: FakeTHREE,
    now: () => T0,
    fetch: async () => ({ ok: true, json: async () => clone(C1) }),
    loadImage: async () => spread(byteFor(3)),
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
  });
  const layer = new FieldLayer(FIELD_DESCRIPTORS.raingrid, {
    frames: store, timeBus: createTimeBus({ now: () => T0 }), legend: { show() {}, hide() {}, release() {} },
    parent: { add() {}, remove() {} }, segments: [8, 4], getLang: () => 'ko', now: () => T0,
    makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 92, h: 40 }),
    setInterval: () => 1, clearInterval: () => {},
  });
  assert.deepEqual(await layer.on(), { on: true });
  const html = layer.cardHtml();
  const line = /모델 범위 ([^<]+)/.exec(html);
  assert.ok(line, "'모델 범위' 줄이 없다");
  assert.ok(line[1].includes('비 없음'), `바닥이 값인 척한다 — '${line[1]}'`);
  assert.ok(line[1].includes('인코딩 천장'), `천장이 모델의 최댓값인 척한다 — '${line[1]}'`);
  assert.ok(!/0\.0 mm\/h/.test(line[1]), "'0.0 mm/h' 는 모델이 낸 강수율이 아니다");
  assert.ok(!/30\.0 mm\/h/.test(line[1]), '자릿수가 바로 밑 클릭 값(유효숫자)과 갈린다');
  layer.off();
});

// ---------------------------------------------------------------- ⑥ 클릭 값

test('클릭 값 — 유효숫자 2자리 · 0 은 비 없음 · 색 점은 칠해진 칸 그대로', () => {
  const opts = { scale: SCALE, resolutionDeg: 0.5, zeroText: FIELD_DESCRIPTORS.raingrid.zeroText, ko: true };
  const at = (v) => readoutOf({ decoded: true, value: v, values: [v], floor: CH.min }, opts);
  const r = at(2.437);
  assert.equal(r.text, '~2.4 mm/h');
  assert.match(r.note, /0\.5° 격자\(약 55 km\) 평균/);
  assert.ok(!/눈금/.test(r.note), '로그에는 상수 눈금이 없다 — 있는 척하지 않는다');
  assert.equal(r.color, bandColor(SCALE, 2.437), '색 점은 반올림하지 않은 값의 칸 = 칠해진 칸');
  assert.equal(at(24.37).text, '~24 mm/h', '큰 값은 소수를 붙이지 않는다');
  assert.equal(at(0.442).text, '~0.44 mm/h');
  assert.equal(at(decodeByte(CH, 1)).text, `~${logValueText(SCALE, decodeByte(CH, 1))}`);
  assert.equal(at(decodeByte(CH, 1)).text, '~0.051 mm/h', '소수 한 자리로 적으면 0.1 mm/h 라는 거짓말이 된다');
  // 비 없음 — '0.0 mm/h' 라고 적지 않는다. 자료가 말할 수 있는 것은 '바닥 미만'까지다.
  const zero = at(0);
  assert.equal(zero.text, `비 없음(${logValueText(SCALE, CH.min)} 미만)`);
  assert.equal(zero.text, '비 없음(0.05 mm/h 미만)');
  assert.equal(zero.color, null);
  assert.ok(!/칠하지/.test(zero.note));
  assert.equal(readoutOf({ decoded: true, value: 0, values: [0], floor: CH.min }, { ...opts, ko: false }).text, 'No rain (below 0.05 mm/h)');
  // 값은 있는데 색이 없는 자리 — 왜 안 칠하는지 적는다(고장으로 보이지 않게).
  assert.match(at(0.07).note, /0\.1 mm\/h 미만이라 칠하지 않습니다/);
  assert.equal(at(0.07).color, null);
  assert.ok(!/칠하지/.test(at(0.7).note));
  // 선형 자료는 옛 길 그대로다(상수 눈금으로 반올림하고 '~').
  assert.equal(readoutOf({ decoded: true, value: 29.8, values: [29.8], step: 0.5 }, { scale: scaleOf('temp'), resolutionDeg: 0.5 }).text, '~30.0 °C');
  assert.deepEqual(readTicks(MODEL.fields.temp.channels[0]), { step: 0.5 });
  assert.deepEqual(readTicks(MODEL.fields.wind10.channels[0]), { step: 0.5 }, '0.50196 → 0.5 (옛 식 그대로)');
  assert.deepEqual(readTicks(MODEL.fields.mslp.channels[0]), { step: 1 });
  assert.deepEqual(readTicks(CH), { floor: CH.min }, '로그는 눈금 대신 바닥을 준다');
  // 읽을 수 없는 표본은 값을 지어내지 않는다.
  assert.equal(logReadout({ scale: SCALE, raw: NaN, floor: CH.min }).ok, false);
});

// ── 2026-09-20 반박 검증 — 글자와 색 점이 서로 다른 칸을 가리켰다 ───────────────────────────────────────────
test('클릭 값 — 경계 바로 아래 값의 글자가 경계로 올라가지 않는다(글자와 색 점이 같은 칸)', () => {
  const opts = { scale: SCALE, resolutionDeg: 0.5, zeroText: FIELD_DESCRIPTORS.raingrid.zeroText, ko: true };
  const at = (v) => readoutOf({ decoded: true, value: v, values: [v], floor: CH.min }, opts);
  // 칠하는 경계마다 그 0.2 % 아래를 눌러 본다 — 숫자를 박지 않고 눈금표에서 셈한다.
  for (const b of SCALE.breaks) {
    const just = b * (1 - 2e-3);
    const r = at(just);
    assert.equal(bandIndex(SCALE, Number(r.text.replace(/[^0-9.]/g, ''))), bandIndex(SCALE, just),
      `${b} mm/h 바로 아래(${just})의 글자 '${r.text}' 가 제 칸을 떠났다`);
    assert.equal(r.color, bandColor(SCALE, just), '색 점은 늘 칠해진 칸 그대로다');
    // 경계 위아래가 **같은 글자**를 달면 안 된다 — '~' 하나로는 색 점이 다른 이유를 말하지 못한다.
    assert.notEqual(r.text, at(b).text, `${b} mm/h 의 위아래가 같은 글자다`);
  }
  // 작업자 머리말이 예로 든 그 값. 실제 출력은 '~2.0' 이 아니라 소수 0 이 깎인 '~2 mm/h' 였다 — 2.0 과 글자까지 같았다.
  assert.equal(at(2).text, '~2 mm/h');
  assert.notEqual(at(1.996).text, '~2 mm/h');
  assert.equal(bandColor(SCALE, 1.996), bandColor(SCALE, 1.5), '1.996 은 1 – 2 칸이다');
  // 경계에서 먼 값은 여전히 유효숫자 2자리다 — 늘 길게 적지 않는다.
  assert.equal(at(2.437).text, '~2.4 mm/h');
  assert.equal(at(24.37).text, '~24 mm/h');
  // 칠하지 않는 칸(0.1 mm/h 미만)도 경계다: 0.0997 을 '~0.1' 이라 적으면 바로 옆줄과 한 줄 안에서 부딪친다.
  const near = at(0.0997);
  assert.match(near.note, /0\.1 mm\/h 미만이라 칠하지 않습니다/);
  assert.ok(!/~0\.1 mm\/h$/.test(near.text), `글자 '${near.text}' 가 옆줄('0.1 mm/h 미만')을 반박한다`);
  assert.equal(near.text, '~0.0997 mm/h');
  // 경계에 유효숫자 5자리 안쪽까지 붙으면 값을 말하지 않고 경계 하나로 말한다(자리를 더 늘리는 대신).
  assert.equal(at(SCALE.breaks[0] * (1 - 1e-9)).text, '0.1 mm/h 미만');
});

test("'모델 범위' 는 로그 자료의 두 끝을 값인 척하지 않는다 — 바닥은 '비 없음' · 천장은 인코딩 천장", () => {
  const z = FIELD_DESCRIPTORS.raingrid.zeroText;
  // 바이트 0(비 없음)부터 바이트 255(천장)까지 — 운영 프레임이 늘 이렇게 나와 이 줄이 두 수로 굳어 있었다.
  const full = logRangeText(SCALE, { min: decodeByte(CH, 0), max: decodeByte(CH, 255) }, CH, z, true);
  assert.ok(full.includes('비 없음'), `바닥은 모델이 낸 강수율이 아니다 — '${full}'`);
  assert.ok(full.includes(logValueText(SCALE, CH.min)), '바닥이 얼마 미만인지 말한다');
  assert.ok(full.includes('인코딩 천장'), `천장은 모델의 최댓값이 아니다 — '${full}'`);
  assert.ok(!/0\.0 mm\/h/.test(full) && !/30\.0 mm\/h/.test(full), '클릭 값과 같은 자릿수(유효숫자)로 적는다');
  assert.ok(full.includes(logValueText(SCALE, decodeByte(CH, 255))), '천장의 수는 매니페스트에서 온다');
  // 천장에 안 닿고 바닥 위에 있는 두 끝은 그냥 값으로 적는다 — 없는 한계를 지어내지 않는다.
  const mid = logRangeText(SCALE, { min: 0.44, max: 3.2 }, CH, z, true);
  assert.equal(mid, `${logValueText(SCALE, 0.44)} ~ ${logValueText(SCALE, 3.2)}`);
  assert.ok(!/천장|비 없음/.test(mid));
  assert.match(logRangeText(SCALE, { min: 0, max: decodeByte(CH, 255) }, CH, z, false), /No rain \(below .+\) ~ .+\(encoding ceiling\)/);
  // 선형 자료는 빈 글자 — 부른 쪽이 옛 길(formatValue)로 간다.
  assert.equal(logRangeText(scaleOf('temp'), { min: -10, max: 30 }, MODEL.fields.temp.channels[0], null, true), '');
  assert.equal(logRangeText(SCALE, { min: 1, max: 2 }, null, z, true), '');
});

// ---------------------------------------------------------------- ⑦ 배선

// ── 2026-09-20 반박 검증 — 색면은 바뀌었는데 그 위에 뜨는 지점 시트는 옛 자료를 불렀다 ──────────────────────
test('지점 시트가 강수를 색면에서 받는다 — 제공자·격자·단위·시각이 지구본과 갈리지 않는다', () => {
  const main = src('main.js');
  const menu = src('quick-menu.js');
  // 퀵메뉴의 강수 id 는 'rain' 이다 — 이름이 바뀌면 아래 인수인계가 조용히 끊긴다.
  assert.match(menu, /\{ id: 'rain',/, "퀵메뉴의 강수 id 가 'rain' 이 아니다");
  const at = main.indexOf('const fieldNote =');
  assert.ok(at > 0, 'pointWeather 의 색면 인수인계 줄이 없다');
  const line = main.slice(at, main.indexOf(';', at));
  assert.match(line, /metric === 'temperature'[\s\S]*fieldReadout\('tempgrid'/, '기온 인수인계가 사라졌다');
  assert.match(line, /metric === 'rain'[\s\S]*fieldReadout\('raingrid'/,
    "강수 색면이 GFS 0.5° mm/h 로 바뀌었는데 지점 시트는 Open-Meteo `current` 의 mm 를 부른다 — 카드가 화면과 다른 말을 한다");
  // 색면이 꺼져 있으면 fieldReadout 이 null 이라 옛 Open-Meteo 길로 떨어진다 — 그 길을 걷어 내지는 않았다.
  assert.match(main.slice(at), /api\.open-meteo\.com\/v1\/forecast/, '색면이 꺼졌을 때 갈 길이 없어졌다');
});

test('같은 사실을 적는 세 곳이 같은 말을 한다 — 메뉴 출처 · 레지스트리 기간 · 레지스트리 범위', async () => {
  // ui-shell 의 SCENES src 한 줄만 고치고 레지스트리를 두면, 이력 탭의 '기간'(ui-shell.js 가 temporalMode 를 그대로 그린다)이
  // 옛 5°·1시간 격자를 계속 말한다. 화면에 그려지는 두 줄이 서로 다른 자료를 가리키는 일이 없게 한다.
  assert.match(src('ui-shell.js'), /id: 'raingrid'[^}]*GFS 0\.5°[^}]*mm\/h/, '메뉴 출처가 색면의 자료를 말하지 않는다');
  assert.doesNotMatch(src('ui-shell.js'), /id: 'raingrid'[^}]*Open-Meteo/, '메뉴 출처가 아직 Open-Meteo 라고 말한다');
  const { PHENOMENA } = await import('../../prototype/v2-three/js/phenomenon-registry.js');
  const p = PHENOMENA['weather.precipitation'];
  assert.ok(p, '현상 id 는 개명하지 않는다');
  assert.doesNotMatch(p.temporalMode, /격자 1시간/, "이력 탭의 '기간' 이 아직 5° 1시간 격자라고 말한다");
  assert.match(p.temporalMode, /격자 3시간/, '예보 프레임의 간격(3시간)을 말한다');
  assert.doesNotMatch(p.scope, /전지구 강수는 5° 모델 격자/, '전지구 강수는 더 이상 5° 격자가 아니다');
  assert.match(p.scope, /GFS 0\.5°/);
});

test('범례의 note 는 열쇠 하나다 — 같은 열쇠를 두 번 적으면 JS 가 앞엣것을 조용히 버린다', () => {
  const layer = src('field-layer.js');
  const at = layer.indexOf('this.legend.show({');
  assert.ok(at > 0);
  const lit = layer.slice(at, layer.indexOf('LEGEND_PRIORITY_FIELD', at));
  // 2026-09-20 에 실제로 그랬다: D3 가 'single' 줄을 더하면서 run·valid·note 를 통째로 다시 적어 포화 고지가 사라졌다.
  // ES 모듈은 중복 열쇠를 막지 않는다(strict 모드에서도) — 아무도 안 던진다. 그래서 글자로 잠근다.
  for (const key of ['note:', 'run:', 'valid:']) {
    assert.equal(lit.split(key).length - 1, 1, `legend.show 의 '${key}' 가 ${lit.split(key).length - 1}번 적혀 있다`);
  }
});

test('descriptor 한 장으로 켠다 — 디코드 식이 매니페스트와 다르면 그리지 않고 이유를 말한다', async () => {
  const d = FIELD_DESCRIPTORS.raingrid;
  assert.deepEqual([d.layerId, d.fieldId, d.scaleId, d.mode, d.mask, d.transfer],
    ['raingrid', 'precip', 'precip', 'scalar', 'none', 'log10']);
  assert.deepEqual([...d.isolineChoices], []);

  const r = new FieldRenderer({ scale: SCALE, transfer: 'log10', segments: [8, 4] });
  assert.equal(r.material.defines.FIELD_TRANSFER_LOG10, 1, '디코드 식은 컴파일 때 갈린다 — 프래그먼트마다 분기를 밟지 않는다');
  const uv = { su: 1, ou: 0.5 / 720, sv: 360 / 361, ov: 0.5 / 361 };
  const grid = { ni: 720, nj: 361, wraps: true };
  r.setField({ channels: [CH], uv, grid });
  assert.deepEqual(r.uniforms.uLog.value.toArray(), [CH.logSpan / 255, CH.logLo], '디코드 상수는 매니페스트에서 온 것 그대로');
  assert.equal(r.uniforms.uZeroByte.value, CH.zeroByte);
  assert.deepEqual(r.uniforms.uDecode.value.toArray(), [1, 0, 1, 0], '로그에서는 선형 상수를 건드리지 않는다(넣으면 NaN 이 된다)');
  assert.equal(r.uniforms.uHalfStep.value, 0);
  assert.throws(() => r.setField({ channels: [{ transfer: 'linear', scale: 1, offset: 0 }], uv, grid }), /log10/);
  assert.throws(() => new FieldRenderer({ scale: SCALE, transfer: 'ln' }), /모르는 transfer/);
  assert.equal(new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] }).material.defines.FIELD_TRANSFER_LOG10, undefined);
  r.dispose();

  // 강수를 fields{} 에 싣지 않은 매니페스트: 옛 5° 그라데이션으로 물러나지 않고 '자료 없음'과 이유를 돌려준다.
  const old = storeWith(() => 0, SCHEMA2);
  const layer = new FieldLayer(FIELD_DESCRIPTORS.raingrid, {
    frames: old, timeBus: createTimeBus({ now: () => T0 }), legend: { show() {}, hide() {}, release() {} },
    parent: { add() {}, remove() {} }, segments: [8, 4], getLang: () => 'ko', now: () => T0,
    makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 1, h: 1 }),
    setInterval: () => 1, clearInterval: () => {},
  });
  const st = await layer.on();
  assert.equal(st.on, false);
  assert.match(st.error, /자료 없음/);
  assert.equal(layer.unavailableReason(), 'NO_DECODE');
});
