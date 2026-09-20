// DEV-DIRECTIVE 2026-09-20 · W1 §6 — 색 눈금표 한 장(prototype/v2-three/js/field-scales.js)의 시험.
//
// W1 완료 기준 ①: "같은 팔레트 표에서 셰이더·범례·등치선이 나온다(시험: 표를 한 줄 바꾸면 셋이 같이 바뀐다)".
// 금지("그라데이션이 없다")만 잠그면 아무 색도 안 내는 표가 통과한다 — 결과를 잠근다:
//   경계가 지시서 표와 같다 · 경계값이 어느 칸인지 · 팔레트 바이트 = 범례 색 · 이웃 칸이 구별된다 · 색각 모의에서도 구별된다.
//
// ⚠️ 명도 시험은 '단조'가 아니라 '한 봉우리'다. PD 시안의 무지개(파랑 → 노랑 → 빨강)는 노랑에서 명도가 꺾인다
//    (시안 실측 L*: 기온 20 34 57 64 68 73 84 76 68 51 45). 그 색상 순서를 지키면서 끝까지 단조로 만들 방법이 없다 —
//    field-scales.js 머리말에 근거를 적었다. 그래서 잠그는 것은: 봉우리 하나 · 이웃 명도차 · 색각 모의 색차 · 두 팔의 분리.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BREAK_PAD,
  FIELD_SCALES,
  KT_PER_MS,
  SCALE_FOR_LAYER,
  SCALE_IDS,
  bandColor,
  bandCount,
  bandIndex,
  breaksFloat32,
  defineScale,
  formatValue,
  isolineSpec,
  legendModel,
  paletteRGBA,
  scaleOf,
  validateScale,
} from '../../prototype/v2-three/js/field-scales.js';

// ⚠️ 줄바꿈을 LF 로 맞춰 읽는다(core.autocrlf=true 워크트리는 CRLF 로 풀린다 — warning-banner.test.mjs 와 같은 이유).
const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (rel) => lf(readFileSync(new URL(rel, import.meta.url), 'utf8'));

// ── 색 계산(시험 전용) — sRGB → CIELAB, 색각 모의는 Machado·Oliveira·Fernandes(2009) 심도 1.0 행렬(선형 RGB 에 곱한다) ──
const lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const CVD = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const labOf = ([r, g, b], mode = 'normal') => {
  const l = [lin(r), lin(g), lin(b)];
  const m = CVD[mode];
  const [R, G, B] = m.map((row) => Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const painted = (scale) => legendModel(scale).map((c) => c.rgba.slice(0, 3));   // 칠하는 칸의 RGB, 아래에서 위로

const SEQUENTIAL = SCALE_IDS.filter((id) => FIELD_SCALES[id].kind === 'sequential');
const DIVERGING = SCALE_IDS.filter((id) => FIELD_SCALES[id].kind === 'diverging');

test('경계는 지시서 W1 표 그대로다 — 파고가 계약과 다른 값으로 들어가던 사고를 표에서 막는다', () => {
  assert.deepEqual([...scaleOf('temp').breaks], [-10, -5, 0, 5, 10, 15, 20, 25, 30, 35]);
  assert.deepEqual([...scaleOf('wind').breaks], [1, 5, 10, 20, 30, 40, 50]);
  assert.deepEqual([...scaleOf('precip').breaks], [0.1, 0.5, 1, 2, 5, 10, 20, 50]);
  assert.deepEqual([...scaleOf('sst').breaks], [0, 4, 8, 12, 16, 20, 24, 28, 32]);
  assert.deepEqual([...scaleOf('sstAnom').breaks], [-1.5, -0.5, 0.5, 1.5]);
  assert.deepEqual([...scaleOf('wave').breaks], [1, 2, 3, 4, 6, 9], '0·1·2.5·4·6·8 이 아니다');
  assert.deepEqual([...scaleOf('pm25').breaks], [15, 25, 50, 75, 150]);
  // 지시서가 센 단 수 — 범례에 보이는 칸
  const shown = (id) => legendModel(scaleOf(id)).length;
  assert.deepEqual(['temp', 'wind', 'precip', 'sst', 'pm25'].map(shown), [11, 8, 8, 10, 6]);
  assert.deepEqual([...scaleOf('pressure').breaks].map((b) => b % 4), [0, 0, 0, 0, 0, 0, 0, 0], '기압 색 경계는 4 hPa 등압선 위에 놓인다');
  assert.equal(scaleOf('nope'), null, '없는 눈금은 지어내지 않는다');
});

test('표를 한 줄 바꾸면 팔레트·경계 배열·범례·등치선이 같이 바뀐다 (W1 완료 기준 ①)', () => {
  const wave = scaleOf('wave');
  // 맨 윗줄 [9, '#d8323f'] 한 줄만 바꾼다
  const edited = defineScale({ ...wave, bands: wave.bands.map((b) => (b[0] === 9 ? [10, '#ff00ff'] : [...b])) });

  const f0 = breaksFloat32(wave); const f1 = breaksFloat32(edited);
  assert.equal(f0[f0.length - 1], 9); assert.equal(f1[f1.length - 1], 10);

  const p1 = paletteRGBA(edited);
  assert.deepEqual([...p1.slice(-4)], [255, 0, 255, 255], '셰이더가 읽는 팔레트');
  assert.deepEqual([...p1.slice(0, -4)], [...paletteRGBA(wave).slice(0, -4)], '다른 칸은 그대로');

  const l1 = legendModel(edited);
  assert.equal(l1.at(-1).from, 10); assert.equal(l1.at(-1).label, '≥ 10 m'); assert.equal(l1.at(-1).color, 'rgb(255, 0, 255)');
  assert.equal(l1.at(-2).label, '6 – 10 m', '아랫칸의 위 경계도 같이 움직인다');

  assert.deepEqual([...isolineSpec(edited).levels], [1, 2, 3, 4, 6, 10], '등치선은 경계를 그대로 읽는다');
  assert.equal(bandIndex(edited, 9.5), 5); assert.equal(bandIndex(wave, 9.5), 6);

  // 한 줄을 더하면 셋 다 한 칸 는다
  const grown = defineScale({ ...wave, bands: [...wave.bands.map((b) => [...b]), [12, '#7a0a3c']] });
  assert.equal(paletteRGBA(grown).length, paletteRGBA(wave).length + 4);
  assert.equal(legendModel(grown).length, legendModel(wave).length + 1);
  assert.equal(isolineSpec(grown).levels.length, isolineSpec(wave).levels.length + 1);
  assert.equal(breaksFloat32(grown).length, breaksFloat32(wave).length + 1);
});

test('고른 간격 등치선이 있는 눈금은 색 경계가 그 간격에서 벗어나면 표가 스스로 말한다', () => {
  for (const id of SCALE_IDS) assert.deepEqual(validateScale(FIELD_SCALES[id]), [], id);
  const temp = scaleOf('temp');
  const off = defineScale({ ...temp, bands: temp.bands.map((b) => (b[0] === 35 ? [36, b[1]] : [...b])) });
  assert.ok(validateScale(off).some((m) => /36/.test(m) && /등치선/.test(m)), '36 °C 경계는 5 °C 등온선과 어긋난다');
  const unsorted = defineScale({ ...temp, bands: temp.bands.map((b) => (b[0] === 0 ? [7, b[1]] : [...b])) });
  assert.ok(validateScale(unsorted).some((m) => /오름차순/.test(m)));
});

test('구간 규칙 — 아래 경계 포함(이상) · 위 경계 제외(미만) · 값 없음은 −1', () => {
  const t = scaleOf('temp');
  assert.equal(bandIndex(t, 35), 10, '35.0 은 ≥ 35 칸');
  assert.equal(bandIndex(t, 34.999), 9);
  assert.equal(bandIndex(t, -10), 1, '−10.0 은 −10 ~ −5 칸');
  assert.equal(bandIndex(t, -10.001), 0);
  assert.equal(bandIndex(t, -80), 0); assert.equal(bandIndex(t, 47.5), 10, '양 끝은 열린 구간');
  assert.equal(bandIndex(t, 0), 3, '어는점은 0 ~ 5 칸');
  // Number('') · Number(null) · Number(true) 는 0·0·1 이다 — 빈 칸이 어는점 칸으로 칠해지면 안 된다. 글자로 온 숫자도 받지 않는다
  for (const v of [null, undefined, NaN, Infinity, -Infinity, 'x', '', '5', true, false, [], {}]) assert.equal(bandIndex(t, v), -1, JSON.stringify(v));
  // 0.1 은 double 과 float32 가 다르다 — GPU(float32)와 같은 칸을 골라야 한다
  const p = scaleOf('precip');
  assert.equal(bandIndex(p, 0.1), 1, '0.1 mm/h 는 칠하는 첫 칸');
  assert.equal(bandIndex(p, 0.0999), 0);
  assert.equal(bandIndex(p, 0.09999999999), 1, 'float32 로 내리면 0.1 과 같은 값이다 — GPU 가 그렇게 본다');
});

test('셰이더의 Σ step(경계, 값) 과 bandIndex 가 모든 경계 둘레에서 같은 칸을 고른다', () => {
  const glslStep = (edge, x) => (x >= edge ? 1 : 0);
  for (const id of SCALE_IDS) {
    const s = FIELD_SCALES[id];
    const f32 = breaksFloat32(s, 16);                      // 고정 길이 uniform — 남는 칸은 BREAK_PAD
    assert.equal(f32.length, 16); assert.equal(f32[15], Math.fround(BREAK_PAD));
    const probes = [...s.breaks].flatMap((b) => [b - 1, b - 0.26, b - 1e-4, b, b + 1e-4, b + 0.26, b + 1]);
    for (const v of probes) {
      const x = Math.fround(v);
      const shader = f32.reduce((acc, edge) => acc + glslStep(edge, x), 0);
      assert.equal(bandIndex(s, v), shader, `${id} @ ${v}`);
    }
  }
  assert.throws(() => breaksFloat32(scaleOf('temp'), 4), RangeError, '안 들어가는 길이는 조용히 자르지 않는다');
});

test('팔레트 길이 = 경계 수 + 1 이고, 범례의 색은 팔레트의 그 칸과 같은 바이트다', () => {
  for (const id of SCALE_IDS) {
    const s = FIELD_SCALES[id];
    const pal = paletteRGBA(s);
    assert.ok(pal instanceof Uint8Array);
    assert.equal(pal.length, (s.breaks.length + 1) * 4, id);
    assert.equal(bandCount(s), s.breaks.length + 1);
    for (const c of legendModel(s)) {
      assert.deepEqual(c.rgba, [...pal.slice(c.index * 4, c.index * 4 + 4)], `${id}[${c.index}]`);
      assert.match(c.color, /^rgba?\(\d+, \d+, \d+(, 0?\.\d+)?\)$/, '단색 하나');
      assert.equal(c.from, c.index === 0 ? null : s.breaks[c.index - 1]);
      assert.equal(c.to, c.index === s.breaks.length ? null : s.breaks[c.index]);
    }
  }
  // 강수 0.1 미만은 칠하지 않는다 — 팔레트엔 자리(불투명도 0)가 있고 범례엔 없다
  const p = scaleOf('precip');
  assert.equal(paletteRGBA(p)[3], 0);
  assert.equal(paletteRGBA(p).length, 9 * 4); assert.equal(legendModel(p).length, 8);
  assert.equal(legendModel(p)[0].label, '0.1 – 0.5 mm/h');
  assert.equal(bandColor(p, 0.05), null, '안 칠하는 값에는 색이 없다');
  assert.equal(bandColor(p, null), null);
  assert.equal(bandColor(scaleOf('temp'), 27.5), 'rgb(238, 129, 48)');
  // 기압 색면은 옅게
  assert.ok([...paletteRGBA(scaleOf('pressure'))].filter((_, i) => i % 4 === 3).every((a) => a === 102));
});

test('표는 얼어 있다 — 쓰는 쪽이 실수로 고칠 수 없다', () => {
  const t = scaleOf('temp');
  for (const o of [FIELD_SCALES, t, t.breaks, t.colors, t.bands, t.bands[3], t.name, t.isolines, t.isolines.choices[5], scaleOf('wind').altUnit]) {
    assert.ok(Object.isFrozen(o));
  }
  assert.throws(() => { t.breaks[0] = 99; }, TypeError);
  assert.throws(() => { t.bands[0][1] = '#000000'; }, TypeError);
  const iso = isolineSpec(t);
  assert.throws(() => { iso.emphasize.push(1); }, TypeError);
  // 돌려받은 배열은 호출자의 것 — 고쳐도 표가 안 바뀐다
  const f = breaksFloat32(t); f[0] = 99;
  assert.equal(breaksFloat32(t)[0], -10);
});

test('명도는 한 봉우리 — 봉우리 앞은 밝아질수록, 뒤는 어두워질수록 큰 값 (기온·풍속·강수·SST·파고·PM2.5)', () => {
  for (const id of SEQUENTIAL) {
    const L = painted(FIELD_SCALES[id]).map((c) => labOf(c)[0]);
    const peak = L.indexOf(Math.max(...L));
    assert.ok(peak > 0 && peak < L.length - 1, `${id}: 봉우리가 끝에 있으면 한 팔짜리다 — 표 머리말을 고쳐 써야 한다`);
    for (let i = 1; i < L.length; i += 1) {
      const d = L[i] - L[i - 1];
      if (i <= peak) assert.ok(d >= 5, `${id}: 찬 팔 ${i - 1}→${i} 명도차 ${d.toFixed(1)}`);
      else assert.ok(d <= -5, `${id}: 더운 팔 ${i - 1}→${i} 명도차 ${d.toFixed(1)}`);
    }
    assert.ok(Math.min(...L) >= 25, `${id}: 가장 어두운 칸 L* ${Math.min(...L).toFixed(1)} — 어두운 지구 위에서 묻힌다`);
  }
});

test('이웃 칸이 확실히 구별된다 — 보통 눈에서도, 제1·제2·제3 색각 모의에서도', () => {
  for (const id of SCALE_IDS) {
    const cols = painted(FIELD_SCALES[id]);
    for (const mode of Object.keys(CVD)) {
      const labs = cols.map((c) => labOf(c, mode));
      const need = mode === 'normal' ? 12 : 8;
      for (let i = 1; i < labs.length; i += 1) {
        assert.ok(dE(labs[i - 1], labs[i]) >= need, `${id} ${mode}: ${i - 1}↔${i} 색차 ${dE(labs[i - 1], labs[i]).toFixed(1)}`);
      }
      for (let i = 0; i < labs.length; i += 1) {
        for (let j = i + 1; j < labs.length; j += 1) {
          assert.ok(dE(labs[i], labs[j]) >= 8, `${id} ${mode}: ${i}↔${j} 두 칸이 한 색으로 겹친다`);
        }
      }
    }
  }
});

test('두 팔은 적록 색각에서도 섞이지 않는다 — 같은 명도의 찬 칸과 더운 칸이 파랑↔노랑 축으로 갈린다', () => {
  for (const id of SEQUENTIAL) {
    const cols = painted(FIELD_SCALES[id]);
    const L = cols.map((c) => labOf(c)[0]);
    const peak = L.indexOf(Math.max(...L));
    for (const mode of ['protan', 'deutan']) {
      const labs = cols.map((c) => labOf(c, mode));
      for (let i = 0; i < peak; i += 1) {
        for (let j = peak + 1; j < labs.length; j += 1) {
          assert.ok(dE(labs[i], labs[j]) >= 20, `${id} ${mode}: 찬 칸 ${i} 과 더운 칸 ${j} 색차 ${dE(labs[i], labs[j]).toFixed(1)}`);
        }
      }
    }
  }
});

test('발산형은 0(기준값)이 중립색이다 — 가운데가 무채색·가장 밝고, 두 팔은 명도가 대칭이며 색상이 반대다', () => {
  assert.deepEqual(DIVERGING.sort(), ['pressure', 'sstAnom']);
  for (const id of DIVERGING) {
    const s = FIELD_SCALES[id];
    const cols = s.colors.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
    const mid = (cols.length - 1) / 2;
    assert.equal(bandIndex(s, s.pivot), mid, `${id}: 기준값이 가운데 칸`);
    const [r, g, b] = cols[mid];
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 16, `${id}: 가운데 칸이 무채색이 아니다`);
    const labs = cols.map((c) => labOf(c));
    assert.ok(labs.every((l, i) => i === mid || l[0] < labs[mid][0]), `${id}: 가운데가 가장 밝다`);
    for (let k = 1; k <= mid; k += 1) {
      assert.ok(Math.abs(labs[mid - k][0] - labs[mid + k][0]) <= 6, `${id}: ±${k} 칸 명도 대칭`);
      assert.ok(labs[mid - k][2] * labs[mid + k][2] < 0, `${id}: ±${k} 칸의 파랑↔노랑 부호가 반대`);
      if (k > 1) assert.ok(labs[mid - k][0] < labs[mid - k + 1][0] - 5 && labs[mid + k][0] < labs[mid + k - 1][0] - 5, `${id}: 멀어질수록 어둡다`);
    }
  }
  // 수온 편차: 찬 쪽이 파랑, 더운 쪽이 빨강. 가운데는 옅게 칠하되 범례에 남는다('평년 수준'도 뜻이 있다)
  const a = scaleOf('sstAnom');
  assert.ok(labOf(painted(a)[0])[2] < 0 && labOf(painted(a).at(-1))[2] > 0);
  assert.equal(legendModel(a).length, 5);
  assert.match(legendModel(a)[2].color, /^rgba\(/);
  assert.equal(legendModel(a)[2].label, '−0.5 – +0.5 °C');
});

test('범례 글자는 색 없이도 읽힌다 — 모든 칸의 라벨에 숫자와 단위가 있다', () => {
  for (const id of SCALE_IDS) {
    const s = FIELD_SCALES[id];
    const m = legendModel(s);
    for (const c of m) {
      assert.ok(c.label.endsWith(` ${s.unit}`), `${id}: '${c.label}'`);
      assert.match(c.label, /\d/);
    }
    assert.ok(m[0].label.startsWith('< ') || m[0].from != null, `${id}: 아래 끝은 열린 구간`);
    assert.ok(m.at(-1).label.startsWith('≥ '), `${id}: 위 끝은 열린 구간`);
  }
  const t = legendModel(scaleOf('temp'));
  assert.equal(t[0].label, '< −10 °C'); assert.equal(t[1].label, '−10 – −5 °C'); assert.equal(t.at(-1).label, '≥ 35 °C');
});

test('풍속은 m/s 와 kt 두 줄 — kt 는 1852 m 해리로 환산한다', () => {
  assert.ok(Math.abs(KT_PER_MS - 1.943844) < 1e-6);
  const w = scaleOf('wind');
  assert.equal(w.altUnit.mode, 'both');
  const kt = legendModel(w, { unitAlt: 'kt' });
  assert.deepEqual(kt.map((c) => c.fromText), [null, '2', '10', '19', '39', '58', '78', '97']);
  assert.equal(kt.at(-1).label, '≥ 97 kt');
  assert.deepEqual(kt.map((c) => c.from), legendModel(w).map((c) => c.from), 'from · to 는 늘 m/s — 경계와 비교할 수 있게');
  assert.equal(formatValue(w, 10, { unitAlt: 'kt' }), '19 kt');
  assert.equal(formatValue(w, 10), '10.0 m/s');
  assert.equal(formatValue(w, 10, { unitAlt: 'mph' }), '10.0 m/s', '없는 환산은 짓지 않는다');
  assert.equal(legendModel(scaleOf('temp'), { unitAlt: true })[1].label, '−10 – −5 °C', '둘째 단위가 없는 눈금은 그대로');
});

test('강수 mm/h ↔ 누적 mm — 경계는 같고 단위 글자만 바뀐다', () => {
  const p = scaleOf('precip');
  assert.equal(p.altUnit.mode, 'switch');
  const rate = legendModel(p); const acc = legendModel(p, { unitAlt: true });
  assert.deepEqual(acc.map((c) => [c.from, c.to, c.color]), rate.map((c) => [c.from, c.to, c.color]), '색의 뜻이 토글마다 바뀌지 않는다');
  assert.equal(rate[4].label, '5 – 10 mm/h'); assert.equal(acc[4].label, '5 – 10 mm');
  assert.equal(formatValue(p, 12.34, { unitAlt: 'mm' }), '12.3 mm');
});

test('formatValue — 눈금의 자릿수 · 빼기 기호 · 편차는 부호 · 값 없음은 —', () => {
  assert.equal(formatValue(scaleOf('temp'), 27.5), '27.5 °C');
  assert.equal(formatValue(scaleOf('temp'), -12), '−12.0 °C');
  assert.equal(formatValue(scaleOf('temp'), -0.04), '0.0 °C', '−0.0 을 만들지 않는다');
  assert.equal(formatValue(scaleOf('sstAnom'), 1.23), '+1.2 °C');
  assert.equal(formatValue(scaleOf('sstAnom'), -0.8), '−0.8 °C');
  assert.equal(formatValue(scaleOf('sstAnom'), 0), '0.0 °C');
  assert.equal(formatValue(scaleOf('pm25'), 37.6), '38 µg/m³');
  // 기압 눈금은 정확히 1 hPa 다 — '1013.0' 은 없는 정밀이다(2026-09-20 반박 검증 · 기온은 0.5 라 소수 한 자리).
  assert.equal(formatValue(scaleOf('pressure'), 1013), '1013 hPa');
  assert.equal(formatValue(scaleOf('pressure'), 1013.5), '1014 hPa');
  assert.equal(scaleOf('pressure').digits, 0);
  for (const v of [null, undefined, NaN, '', '27.5', true]) assert.equal(formatValue(scaleOf('temp'), v), '—', JSON.stringify(v));
});

test('등치선 — 풍속·PM2.5 는 없음(null), 나머지는 지시서 표대로', () => {
  assert.equal(isolineSpec(scaleOf('wind')), null, '풍속 등치선은 격자 모양이 된다 — 안 그리는 것이 결정이다');
  assert.equal(isolineSpec(scaleOf('pm25')), null);
  const t5 = isolineSpec(scaleOf('temp'));
  assert.deepEqual([t5.choice, t5.interval, t5.majorEvery, t5.label], ['5', 5, 10, 'major']);
  assert.deepEqual([...t5.choices], ['2', '5']);
  const t2 = isolineSpec(scaleOf('temp'), 2);
  assert.deepEqual([t2.choice, t2.interval, t2.majorEvery], ['2', 2, 10], '2 °C 를 골라도 굵은 선은 10 °C 마다');
  assert.equal(isolineSpec(scaleOf('temp'), '3').choice, '5', '모르는 선택은 기본값');
  const pr = isolineSpec(scaleOf('pressure'));
  assert.deepEqual([pr.interval, [...pr.emphasize]], [4, [1012]]);
  const sst = isolineSpec(scaleOf('sst'));
  assert.deepEqual([sst.interval, [...sst.emphasize]], [1, [26, 29]]);
  const an = isolineSpec(scaleOf('sstAnom'));
  assert.deepEqual([[...an.levels], [...an.emphasize]], [[-1.5, -0.5, 0, 0.5, 1.5], [0]], '0 선 강조');
  assert.deepEqual([...isolineSpec(scaleOf('wave')).levels], [...scaleOf('wave').breaks], '파고 등치선 = 색 경계');
  assert.deepEqual([...isolineSpec(scaleOf('precip')).levels], [10], '강한 코어 윤곽');
  assert.ok(scaleOf('precip').breaks.includes(10), '그 윤곽은 색 경계 위에 있다');
});

test('W0 프레임의 8bit 눈금이 색 경계를 정확히 담는다 — 경계가 눈금 사이에 떨어지면 칸 가장자리가 반 눈금 밀린다', () => {
  const py = read('../../aws/gfs-cloud-forecast/handler.py');
  const two = (name) => {
    const m = new RegExp(`^${name} = (-?[\\d.]+), (-?[\\d.]+)`, 'm').exec(py);
    assert.ok(m, `${name} 를 handler.py 에서 못 읽었다`);
    return [Number(m[1]), Number(m[2])];
  };
  for (const [id, name] of [['temp', 'TEMP_LO_C, TEMP_STEP_C'], ['pressure', 'MSLP_LO_HPA, MSLP_STEP_HPA']]) {
    const [lo, step] = two(name);
    for (const b of scaleOf(id).breaks) {
      const q = (b - lo) / step;
      assert.ok(Math.abs(q - Math.round(q)) < 1e-9 && q >= 0 && q <= 255, `${id} 경계 ${b} 가 byte 눈금(${lo} + n × ${step}) 위에 없다`);
    }
  }
});

test('레이어 id → 눈금 — 지금 있는 레이어 id 를 그대로 받는다(개명하지 않는다)', () => {
  const live = read('../../prototype/v2-three/js/live-layers.js');
  for (const [layer, id] of Object.entries(SCALE_FOR_LAYER)) {
    assert.ok(live.includes(`case '${layer}'`), `${layer} 는 live-layers.js 에 없는 id 다`);
    assert.equal(scaleOf(layer), FIELD_SCALES[id]);
  }
  assert.equal(scaleOf('uvgrid'), null, 'PD 표에 없는 눈금은 만들지 않았다');
});

test('이 파일은 DOM · THREE · i18n 을 모른다 — 그라데이션(선형 보간 램프)도 없다', () => {
  const src = read('../../prototype/v2-three/js/field-scales.js');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // 주석은 규칙 설명이라 뺀다
  assert.ok(!/^\s*import\s/m.test(code), '순수 모듈 — import 없음');
  assert.ok(!/\bdocument\b|\bwindow\b|THREE\./.test(code));
  assert.ok(!/gradient|rampFrom|lerp|mix\(/i.test(code));
});
