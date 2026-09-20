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
  FIELD_LOG2_10, logReadout, logUniforms, logValueText, readTicks, shaderLogDecode, topBandNote,
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

test('카드 — 누적 단추가 없고, 고를 것 없는 등치선은 글자로 말한다', async () => {
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
  assert.ok(!/누적|1h|3h|24h/.test(html), '누적은 아직 없다 — 누를 때 아무 일도 안 나는 토글을 그리지 않는다');
  assert.ok(/mm\/h/.test(html) && !/>\s*mm\s*</.test(html), '단위는 mm/h 다(누적 mm 로 바뀌지 않는다)');
  assert.match(html, new RegExp(`${legendModel(SCALE).length}단 구간색`), '칠하는 칸만 센다 — 9칸이 아니라 8칸');
  assert.match(html, /강한 코어 윤곽/);
  assert.match(html, new RegExp(`${SCALE.isolines.levels[0]} mm/h 이상`), '선이 무엇을 두르는지 글자로 말한다');
  assert.match(html, /data-action="field-iso"/, '켬/끔은 실제로 동작한다');
  assert.equal(layer.handleAction('field-iso', { layer: 'raingrid', set: 'off' }), true);
  assert.equal(layer.renderer.uniforms.uIsoOn.value, 0);
  // 범례의 풀이 줄이 포화를 말한다(누른 곳도 못 그릴 사정도 없을 때).
  assert.equal(legend.last.note, topBandNote(SCALE, CH, true));
  // id 로 견준다 — 시험은 field-scales.js 를 질의문자열 없이 들이므로 앱('…?v=1')과 다른 모듈 사본이다(ES 모듈은 URL 전체로 구분된다).
  assert.equal(legend.last.scale.id, SCALE.id);
  assert.deepEqual([...legend.last.scale.breaks], [...SCALE.breaks]);
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

// ---------------------------------------------------------------- ⑦ 배선

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
