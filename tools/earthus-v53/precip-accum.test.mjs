// DEV-DIRECTIVE 2026-09-20 · W4 강수 · 작업 E2 — 강수 누적(3시간 · 24시간)의 **결과** 시험.
//
// 금지만 재면 아무것도 안 더하는 코드가 통과한다. 여기서 재는 것은 화면이 말하게 될 수(數)와 글자다:
//   겹치는 GFS 버킷에서 고른 구간이 목표를 **한 번씩만** 덮는가(두 번 더하지 않는가 · 구멍이 없는가) ·
//   더한 mm 가 원 자료를 푼 값의 합과 **정확히** 같은가(바이트를 더하지 않았는가) ·
//   앞 구간이 모자라면 0 으로 칠하지 않고 몇 시간치인지 말하는가 ·
//   누적을 고르면 범례 · 카드 · 클릭 값 **세 곳이 같이** mm 로 바뀌고 현재 강우로 돌아오면 셋이 같이 mm/h 로 돌아가는가 ·
//   누적 눈금이 따로 있어 24시간 양이 맨 위 칸에 몰리지 않는가.
// 숫자를 박지 않는다 — 기대값은 합성 매니페스트의 디코드 상수와 눈금표에서 셈한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCUM_CHANNEL, ACCUM_KEYS, accumCardState, accumDescriptorOf, accumStatusText,
  coverageOf, createAccumFrames, encodeAccumBytes, planAccumulation, sumAccumulation,
} from '../../prototype/v2-three/js/precip-accum.js';
import { FIELD_DESCRIPTORS, FieldLayer } from '../../prototype/v2-three/js/field-layer.js';
import { createGfsFrames, decodeByte, readManifest } from '../../prototype/v2-three/js/gfs-frames.js';
import { createTimeBus } from '../../prototype/v2-three/js/time-bus.js';
import { bandIndex, scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { readTicks } from '../../prototype/v2-three/js/field-log.js';

const H = 3.6e6;
const RUN = '2026-09-20T06:00:00Z';
const T0 = Date.parse(RUN);
const clone = (x) => JSON.parse(JSON.stringify(x));
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

// ── 합성 매니페스트 ──────────────────────────────────────────────────────────────────────────────────────────
// 운영 매니페스트의 apcp 그대로다: 6시간마다 비우는 버킷 — h%6==3 이면 {h−3, h}(3시간) · h%6==0 이면 {h−6, h}(6시간) ·
// f000 에는 누적이 없다(분석장에는 쌓인 양이 없다). 격자만 작게 줄였다(5° · 72×37).
const NI = 72;
const NJ = 37;
const STEP_H = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27];
const windowOf = (h) => (h === 0 ? null : (h % 6 === 3 ? { fromH: h - 3, toH: h } : { fromH: h - 6, toH: h }));
const p3 = (h) => String(h).padStart(3, '0');
const MANIFEST = {
  schema: 2, model: 'GFS', run: RUN, runTag: '2026092006', generatedAt: '2026-09-20T11:04:00Z',
  stepHours: 3, resolutionDeg: 5,
  grid: { ni: NI, nj: NJ, lon0: -180, dLon: 5, lat0: 90, dLat: -5 },
  fields: {
    apcp: {
      file: 'a{h:03d}.png', stepKey: 'apcp', png: 'gray8',
      grid: { ni: NI, nj: NJ, sameAs: 'grid' },
      variable: 'APCP', level: 'surface', unit: 'mm',
      channels: { R: { transfer: 'log10', logLo: -1, logSpan: 3.3979400086720375, zeroByte: 0, min: 0.1, max: 250 } },
    },
    // 강수율(mm/h) — '현재 강우' 칩이 읽는 그 필드다. 누적과 단위가 갈리는지 보려면 둘 다 있어야 한다.
    precip: {
      file: 'p{h:03d}.png', stepKey: 'precip', png: 'rgb8',
      grid: { ni: NI, nj: NJ, sameAs: 'grid' },
      variable: 'PRATE', level: 'surface', unit: 'mm/h',
      channels: { R: { transfer: 'log10', logLo: -1.3010299956639813, logSpan: 2.778151250383644, zeroByte: 0, min: 0.05, max: 30 } },
    },
  },
  steps: STEP_H.map((h) => {
    const st = { h, valid: new Date(T0 + h * H).toISOString(), precip: `2026092006/p${p3(h)}.png` };
    if (h > 0) { st.apcp = `2026092006/a${p3(h)}.png`; st.apcpWindow = windowOf(h); }
    return st;
  }),
  runs: [],
};

const SRC_CH = readManifest(MANIFEST).fields.apcp.channels[0];   // 디코드 상수의 유일한 출처
// 프레임마다 다른 바이트 — 한 장을 두 번 더하면 합이 어긋나 바로 걸린다.
// 6시간 버킷(h%6==0)이 그 앞 3시간 버킷보다 크게 둔다: 그래야 a[h] − a[h−3] 이 진짜 양이고 0 으로 눕지 않는다.
const byteAt = (h) => (h % 6 === 3 ? 60 + h : 120 + h);
const mmAt = (h) => decodeByte(SRC_CH, byteAt(h));
const FRAMES = readManifest(MANIFEST).frames.apcp;

const pxOf = (h) => ({ w: NI, h: NJ, channels: 1, names: ['R'], data: new Uint8Array(NI * NJ).fill(byteAt(h)) });
const expected = (plan) => plan.terms.reduce((s, t) => s + t.sign * mmAt(t.h), 0);

// ---------------------------------------------------------------- ① 겹치지 않게 고른다

test('3시간 누적 — 3시간 버킷이 있으면 그대로, 6시간 버킷뿐이면 한 장을 빼서 자른다', () => {
  const at3 = planAccumulation(FRAMES, 3, 3);
  assert.deepEqual(at3.terms.map((t) => [t.h, t.sign]), [[3, 1]], 'h=3 은 {0,3} 한 장 그대로');
  assert.deepEqual([at3.fromH, at3.coveredH, at3.short], [0, 3, false]);

  // h%6==0 에는 3시간 버킷이 없다 — 매니페스트 apcp.note 가 적어 둔 식(a[h] − a[h−3])으로 잘라 낸다.
  const at6 = planAccumulation(FRAMES, 6, 3);
  assert.deepEqual(at6.terms.map((t) => [t.h, t.sign]), [[6, 1], [3, -1]]);
  assert.deepEqual([at6.fromH, at6.coveredH, at6.short], [3, 3, false]);

  assert.deepEqual(planAccumulation(FRAMES, 9, 3).terms.map((t) => [t.h, t.sign]), [[9, 1]]);
  assert.deepEqual(planAccumulation(FRAMES, 12, 3).terms.map((t) => [t.h, t.sign]), [[12, 1], [9, -1]]);
});

test('24시간 누적 — 6시간 버킷으로 타일을 깔고 끝에서 넘친 만큼만 뺀다', () => {
  const at24 = planAccumulation(FRAMES, 24, 24);
  assert.deepEqual(at24.terms.map((t) => [t.h, t.sign]), [[24, 1], [18, 1], [12, 1], [6, 1]], '정각에서는 뺄 것이 없다');
  assert.deepEqual([at24.fromH, at24.coveredH, at24.short], [0, 24, false]);

  // h=27 은 {24,27}(3시간)로 시작하므로 앞이 한 칸 밀린다 — 마지막 6시간 버킷이 3시간 넘치고, 그 3시간을 뺀다.
  const at27 = planAccumulation(FRAMES, 27, 24);
  assert.deepEqual(at27.terms.map((t) => [t.h, t.sign]), [[27, 1], [24, 1], [18, 1], [12, 1], [6, 1], [3, -1]]);
  assert.deepEqual([at27.fromH, at27.coveredH, at27.short], [3, 24, false]);
});

test('어느 시각 어느 기간이든 목표를 한 번씩만 덮는다 — 두 번 더하지도, 구멍을 내지도 않는다', () => {
  for (const hours of [3, 24]) {
    for (const f of FRAMES) {
      const plan = planAccumulation(FRAMES, f.h, hours);
      assert.ok(plan, `h=${f.h} · ${hours}시간 계획이 없다`);
      const cov = coverageOf(plan);
      for (let i = 0; i < cov.counts.length; i += 1) {
        const hour = cov.from + i;
        const inside = hour >= plan.fromH && hour < plan.toH;
        assert.equal(cov.counts[i], inside ? 1 : 0,
          `h=${f.h} · ${hours}시간: ${hour}~${hour + 1} 시가 ${cov.counts[i]} 번 덮였다`);
      }
      assert.equal(plan.toH, f.h);
      assert.ok(plan.coveredH > 0 && plan.coveredH <= hours);
    }
  }
});

test('앞 구간이 모자라면 있는 만큼만 더하고 몇 시간치인지 말한다 — 0 으로 칠하지 않는다', () => {
  const at6 = planAccumulation(FRAMES, 6, 24);      // 런이 시작한 지 6시간 — 24시간치가 있을 리 없다
  assert.deepEqual([at6.coveredH, at6.short, at6.fromH], [6, true, 0]);
  assert.deepEqual(at6.terms.map((t) => [t.h, t.sign]), [[6, 1]]);
  const at3 = planAccumulation(FRAMES, 3, 24);
  assert.deepEqual([at3.coveredH, at3.short], [3, true]);
  // 말로도 그렇게 나온다 — '몇 시간치'가 글자에 있다.
  const fmt = (ms) => new Date(ms).toISOString().slice(11, 16);
  const text = accumStatusText({ a: { t: T0 + 6 * H, accum: at6 } }, { ko: true, fmtValid: fmt });
  assert.match(text, /24시간/);
  assert.match(text, /6시간치/);
  assert.match(text, /0 으로 칠하지 않고/);
  assert.equal(accumStatusText({ a: { t: T0, accum: null } }, { ko: true }), '', '누적이 아니면 이 줄이 통째로 없다');
});

// ---------------------------------------------------------------- ② 더한 값

test('더한 mm 는 원 자료를 푼 값의 합 그대로다 — 바이트를 더하지 않는다', () => {
  for (const hours of [3, 24]) {
    for (const f of FRAMES) {
      const plan = planAccumulation(FRAMES, f.h, hours);
      const mm = sumAccumulation(plan, pxOf, SRC_CH);
      assert.equal(mm.length, NI * NJ);
      const want = Math.fround(expected(plan));
      for (const i of [0, 1, NI * NJ - 1]) assert.ok(Math.abs(mm[i] - want) < 1e-5, `h=${f.h}·${hours}h: ${mm[i]} ≠ ${want}`);
    }
  }
  // 두 번 더했다면 이 수가 된다 — 실제 합과 다른지 확인해 시험이 스스로를 속이지 않게 한다.
  const at6 = planAccumulation(FRAMES, 6, 3);
  const wrong = mmAt(6) + mmAt(3);
  assert.ok(Math.abs(wrong - expected(at6)) > 1, '픽스처가 겹침을 구분하지 못한다 — 바이트를 다시 고를 것');
});

test('뺄셈이 만든 음수는 양이 아니라 8bit 눈금의 잡음이다 — 0 으로 눕힌다', () => {
  const plan = planAccumulation(FRAMES, 6, 3);                   // [+a6, −a3]
  const flat = (h) => ({ w: 2, h: 1, channels: 1, names: ['R'], data: new Uint8Array([h === 6 ? 100 : 140, h === 6 ? 200 : 40]) });
  const mm = sumAccumulation(plan, flat, SRC_CH);
  assert.equal(mm[0], 0, 'a6 < a3 인 칸은 0 이다(음수 강수는 없다)');
  assert.ok(mm[1] > 0 && Math.abs(mm[1] - (decodeByte(SRC_CH, 200) - decodeByte(SRC_CH, 40))) < 1e-5);
  assert.equal(sumAccumulation(plan, () => null, SRC_CH), null, '장이 하나라도 없으면 지어내지 않는다');
});

test('파생 인코딩 — 원 자료와 같은 문법이고 범위만 넓다(24시간이 천장에서 잘리지 않는다)', () => {
  assert.equal(ACCUM_CHANNEL.transfer, 'log10');
  assert.equal(readTicks(ACCUM_CHANNEL).floor, ACCUM_CHANNEL.min, '클릭 값의 바닥은 채널이 말한 min 이다');
  assert.equal(decodeByte(ACCUM_CHANNEL, 0), 0, '바이트 0 은 없음이다');
  assert.ok(Math.abs(decodeByte(ACCUM_CHANNEL, 1) - 0.10371) < 1e-4, '바닥 바로 위 칸');
  assert.ok(Math.abs(decodeByte(ACCUM_CHANNEL, 255) - ACCUM_CHANNEL.max) < 1e-6);
  // 24시간은 250 mm 버킷 넷이 겹치지 않게 더해진다 — 원 자료의 천장(250)으로는 잘릴 값이다.
  const ceiling = 4 * SRC_CH.max;
  assert.ok(ACCUM_CHANNEL.max >= ceiling, `파생 천장 ${ACCUM_CHANNEL.max} 이 ${ceiling} mm 를 못 담는다`);
  const bytes = encodeAccumBytes(Float32Array.from([0, 0.05, 0.5, 5, 50, 500, ceiling]));
  assert.deepEqual([bytes[0], bytes[1]], [0, 0], '바닥 이하는 없음(원 자료 _apcp_byte 와 같은 문법)');
  assert.equal(bytes[6], 255, '4×250 mm 가 천장에 딱 닿는다');
  for (const [i, v] of [[2, 0.5], [3, 5], [4, 50], [5, 500]]) {
    const back = decodeByte(ACCUM_CHANNEL, bytes[i]);
    assert.ok(Math.abs(back / v - 1) < 0.02, `${v} mm → 바이트 ${bytes[i]} → ${back}`);
  }
});

// ---------------------------------------------------------------- ③ 눈금표

test('누적 눈금이 따로 있다 — 색은 같고 경계만 다르다(24시간이 맨 위 칸에 몰리지 않는다)', () => {
  const rate = scaleOf('precip');
  const acc = scaleOf('precipAccum');
  assert.notEqual(rate, acc);
  assert.deepEqual([...acc.colors], [...rate.colors], '색은 강수 표 한 벌뿐이다 — 두 곳에 적지 않는다');
  assert.notDeepEqual([...acc.breaks], [...rate.breaks]);
  assert.equal(acc.unit, 'mm');
  assert.equal(rate.unit, 'mm/h');
  // 왜 따로 두는가 — mm/h 경계로는 하루 20 mm 도, 하루 400 mm 도 똑같이 맨 위 칸이다.
  const top = rate.breaks.length;
  for (const mm of [55, 120, 400]) assert.equal(bandIndex(rate, mm), top, `${mm} mm 는 mm/h 눈금에서 맨 위 칸`);
  assert.notEqual(bandIndex(acc, 55), bandIndex(acc, 400), '누적 눈금은 그 둘을 가른다');
  assert.equal(acc.alpha[0], 0, '0.5 mm 미만은 칠하지 않는다');
  assert.deepEqual([...scaleOf('precipAccum').isolines.levels], [10, 50]);
  for (const lv of acc.isolines.levels) assert.ok(acc.breaks.includes(lv), `등치선 ${lv} 이 색 경계 위에 있지 않다`);
});

// ---------------------------------------------------------------- ④ 화면 — 단위가 세 곳에서 같이 바뀐다

const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NoColorSpace: '', RGBAFormat: 1023,
  Texture: class { constructor(image) { this.image = image; this.flipY = true; } dispose() { this.disposed = true; } },
  // ⚠️ 진짜 THREE 와 같게 flipY 기본이 **false** 다 — 파생 장이 이것을 true 로 되돌리는지 아래 시험이 본다.
  DataTexture: class { constructor(data, w, h, format) { Object.assign(this, { data, width: w, height: h, format, flipY: false }); } dispose() { this.disposed = true; } },
};
const frameOfUrl = (url) => { const m = /([ap])(\d{3})\.png/.exec(url); return { kind: m[1], h: Number(m[2]) }; };
// 강수율 프레임은 누적과 **다른 바이트**로 채운다 — 단위가 갈리는지 볼 때 두 값이 우연히 같으면 시험이 눈을 감는다.
const RATE_BYTE = 150;
const image = (kind, h) => {
  const rgba = new Uint8Array(NI * NJ * 4);
  const b = kind === 'a' ? byteAt(h) : RATE_BYTE;
  for (let p = 0; p < NI * NJ; p += 1) rgba.set([b, 0, 0, 255], p * 4);
  return { width: NI, height: NJ, rgba };
};

function rig(nowMs = T0 + 24 * H) {
  const state = { now: nowMs };
  const frames = createGfsFrames({
    THREE: FakeTHREE, now: () => state.now,
    fetch: async () => ({ ok: true, json: async () => clone(MANIFEST) }),
    loadImage: async (url) => { const f = frameOfUrl(url); return image(f.kind, f.h); },
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
  });
  const timeBus = createTimeBus({ now: () => state.now });
  const legend = { last: null, show(a) { this.last = a; }, hide() {}, release() {} };
  const layer = new FieldLayer(FIELD_DESCRIPTORS.raingrid, {
    frames, timeBus, legend, parent: { add() {}, remove() {} }, segments: [8, 4],
    getLang: () => 'ko', now: () => state.now, THREE: FakeTHREE,
    makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 92, h: 40 }),
    setInterval: () => 1, clearInterval: () => {},
  });
  return { layer, frames, timeBus, legend, state };
}
const chip = async (layer, key) => { assert.equal(layer.handleAction('field-accum', { layer: 'raingrid', window: key }), true); await tick(20); };

test('기간 칩 — 누적을 고르면 범례 · 카드 · 클릭 값이 같이 mm 가 되고, 현재 강우로 돌아오면 같이 mm/h 로 돌아간다', async () => {
  const { layer, legend, timeBus } = rig();
  assert.deepEqual(await layer.on(), { on: true });
  const probeText = () => layer.probe(37.5, 127).text;

  // ① 현재 강우 — 세 곳이 mm/h
  assert.equal(legend.last.scale.unit, 'mm/h');
  assert.match(layer.cardHtml(), /mm\/h/);
  assert.match(probeText(), /mm\/h$/);
  assert.deepEqual(accumCardState(layer).key, 'rate');
  assert.deepEqual([...accumCardState(layer).keys], [...ACCUM_KEYS]);

  // ② 3시간 누적 — 세 곳이 같이 mm
  await chip(layer, '3');
  assert.equal(legend.last.scale.unit, 'mm', '범례');
  const card = layer.cardHtml();
  assert.match(card, /3시간 누적/, '카드');
  assert.match(card, /모델 강수율의 합산/, '지시서 W4 의 그 말을 카드가 한다');
  assert.ok(!/mm\/h/.test(card), '카드에 mm/h 가 남아 있지 않다');
  const acc3 = probeText();
  assert.match(acc3, / mm$/, '클릭 값');
  // 값도 맞다 — 그 시각(정각 f024)까지 3시간 = a24 − a21.
  const plan = planAccumulation(FRAMES, 24, 3);
  const want = expected(plan);
  assert.ok(Math.abs(Number(/([\d.]+)/.exec(acc3)[1]) / want - 1) < 0.05, `${acc3} ≠ ${want} mm`);

  // ③ 24시간 — 더 큰 값이고 여전히 mm
  await chip(layer, '24');
  assert.equal(legend.last.scale.unit, 'mm');
  const acc24 = Number(/([\d.]+)/.exec(probeText())[1]);
  assert.ok(acc24 > Number(/([\d.]+)/.exec(acc3)[1]), '24시간이 3시간보다 많다');
  assert.ok(Math.abs(acc24 / expected(planAccumulation(FRAMES, 24, 24)) - 1) < 0.05);

  // ④ 현재 강우로 되돌아온다
  await chip(layer, 'rate');
  assert.equal(legend.last.scale.unit, 'mm/h');
  assert.match(layer.cardHtml(), /mm\/h/);
  assert.match(probeText(), /mm\/h$/);
  assert.equal(accumCardState(layer).key, 'rate');
  assert.equal(layer.desc, FIELD_DESCRIPTORS.raingrid, '원래 descriptor 로 돌아온다');
  layer.off();
  assert.equal(timeBus.validMs() > 0, true);
});

test('범례의 유효 시각은 타임라인이 아니라 **누적 구간의 끝**이다 — 카드가 화면과 다른 말을 하지 않는다', async () => {
  const { layer, legend, timeBus } = rig(T0 + 24 * H);
  await layer.on();
  await chip(layer, '3');
  timeBus.set(1.5 * H);                                        // 지금 + 1.5 h = f024 와 f027 사이
  await tick(20);
  assert.equal(layer.status.kind, 'exact', '누적은 두 장을 섞지 않는다');
  assert.equal(layer.status.a.h, 24, '시각을 덮는 것은 그 시각 이하의 마지막 장이다');
  assert.equal(legend.last.valid, T0 + 24 * H, '범례가 25:30 이 아니라 구간의 끝(24 h)을 적는다');
  assert.notEqual(legend.last.valid, timeBus.validMs());
  assert.match(legend.last.note, /3시간 누적/);
  layer.off();
});

test('런 시작 직후의 24시간 — 모자란 채로 그리고 카드가 몇 시간치인지 말한다', async () => {
  const { layer } = rig(T0 + 6 * H);                           // 런 + 6 h
  await layer.on();
  await chip(layer, '24');
  assert.equal(layer.status.a.accum.short, true);
  assert.equal(layer.status.a.accum.coveredH, 6);
  assert.match(layer.cardHtml(), /24시간을 청했지만/);
  assert.match(layer.cardHtml(), /6시간치/);
  assert.equal(layer.renderer.mesh.visible, true, '모자라다고 화면을 비우지는 않는다 — 있는 만큼은 칠한다');
  layer.off();
});

test('파생 장 — 셰이더가 읽는 값 텍스처 한 장이고 flipY 가 그림 프레임과 같다', async () => {
  const { frames } = rig();
  await frames.load();
  const store = createAccumFrames(frames, { hours: 3, THREE: FakeTHREE });
  assert.equal(store.has('precip'), true);
  assert.equal(store.fieldSpec('precip').unit, 'mm');
  assert.equal(store.fieldSpec('precip').channels[0], ACCUM_CHANNEL);
  assert.deepEqual(store.uvTransform('precip'), frames.uvTransform('apcp'), '격자 보정은 원 자료의 것 그대로');
  const tex = await store.texture('precip', 24);
  assert.ok(tex, '파생 텍스처가 나온다');
  assert.equal(tex.flipY, true, 'DataTexture 기본(false)을 그림 프레임과 같은 방향으로 되돌린다');
  assert.equal(tex.width, NI);
  assert.equal(tex.height, NJ);
  const px = await store.pixels('precip', 24);
  assert.equal(px.channels, 1);
  assert.equal(px.data.length, NI * NJ);
  assert.equal(tex.data[0], px.data[0], '텍스처의 R 과 CPU 사본이 같은 바이트다');
  assert.equal(tex.data[3], 255);
  // 같은 장을 다시 청하면 다시 굽지 않는다(재생 중 폰이 뜨거워진다).
  const builds = store.stats().builds;
  await store.pixels('precip', 24);
  assert.equal(store.stats().builds, builds);
  assert.throws(() => store.framesFor('apcp'), /모르는 필드/, '이 저장소는 제 필드 하나만 대답한다');
  assert.equal(store.framesFor('precip')[0].h, 3, 'f000 에는 누적이 없다 — 목록에도 없다');
  store.dispose();
});

test('누적 descriptor — 레이어 id 와 필드 id 는 그대로고 눈금표·제목·닫는 줄만 바뀐다', () => {
  const base = FIELD_DESCRIPTORS.raingrid;
  const d = accumDescriptorOf(base, 24);
  assert.equal(d.layerId, base.layerId);
  assert.equal(d.fieldId, base.fieldId);
  assert.equal(d.transfer, base.transfer);
  assert.equal(d.scaleId, 'precipAccum');
  assert.equal(d.accumHours, 24);
  assert.equal(d.nature.ko, '모델 강수율의 합산');
  assert.match(d.timelineNote.ko, /섞지 않고/);
  assert.equal(accumDescriptorOf(base, 24), d, '같은 기간은 같은 얼린 한 장이다');
  assert.equal(base.accum, 'precip', '강수에만 누적 훅이 있다');
  for (const id of ['tempgrid', 'windgrid', 'presgrid', 'sstfield', 'pm25grid']) {
    assert.equal(FIELD_DESCRIPTORS[id].accum, undefined, `${id} 에는 기간 칩이 없다`);
  }
});

test('3시간이 뺄셈으로 나오는 시각에는 그 한계를 카드가 말한다 — 없는 시각에는 그 줄도 없다', async () => {
  const { accumCardRow } = await import('../../prototype/v2-three/js/precip-accum.js');
  const btn = (action, data, on, text) => `<b data-action="${action}" ${data} aria-pressed="${on}">${text}</b>`;
  const row = (endH, key = '3') => accumCardRow({ ko: true, accum: { key, keys: ACCUM_KEYS, plan: endH == null ? null : planAccumulation(FRAMES, endH, 3) } }, btn);
  assert.match(row(6), /뺀<\/b> 것입니다/, 'h%6==0 은 6시간 버킷에서 앞 3시간을 뺀 값이다');
  assert.match(row(6), /약 3 %/, '거칠어진 눈금을 수로 말한다');
  assert.ok(!/뺀/.test(row(9)), '3시간 버킷이 그대로 있는 시각에는 그 줄이 없다');
  assert.ok(!/뺀/.test(row(null, 'rate')), '현재 강우에는 그 줄이 없다');
});

test('칩은 셋뿐이다 — 1시간은 자료가 못 내놓으므로 단추를 달지 않는다', () => {
  assert.deepEqual([...ACCUM_KEYS], ['rate', '3', '24']);
  assert.ok(!ACCUM_KEYS.includes('1'), 'GFS 누적 버킷은 3시간이 가장 짧다 — 1시간 양은 지어내야 나온다');
  // 자료로도 그것이 사실이다: 어느 스텝에서도 1시간 구간을 만들 수 없다.
  for (const f of FRAMES) {
    const plan = planAccumulation(FRAMES, f.h, 1);
    assert.ok(!plan || plan.coveredH >= 3, `h=${f.h} 에서 1시간 구간이 나왔다 — 자료가 바뀌었으면 칩을 다시 볼 것`);
  }
});
