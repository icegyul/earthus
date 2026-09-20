// DEV-DIRECTIVE 2026-09-20 · W1 기압 줄("4 hPa 등압선 + H/L 기호") · 작업 D1 — prototype/v2-three/js/field-symbols.js 의 결과 시험.
//
// '기호가 나온다'만 보면 아무 극값에나 글자를 세우는 코드가 통과한다. 여기서는 **어디에 · 무엇이 적히고 · 몇 개가 보이는지**를 잰다:
//   합성 저기압·고기압의 자리에 서는가 · 고지대에는 안 서는가 · 앞 반구에서 종류마다 상한을 지키는가 ·
//   키프레임이 그대로면 다시 찾지 않는가 · mix 에 따라 두 중심 사이를 움직이는가 · 디코드 상수가 바뀌면 숫자가 따라 바뀌는가 ·
//   텍스처가 기호 수가 아니라 **글자 종류 수**만큼만 구워지는가 · 끈 뒤에 정리되는가.
// 눈금표를 한 줄 바꾸면 등압선 간격과 두드러짐 임계가 같이 바뀌는 것도 여기서 본다(같은 값을 두 곳에 적지 않는다).
// 캔버스는 없다 — 텍스처 굽기를 주입한다. THREE 는 저장소의 r184 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  FieldSymbols, SYMBOL_CAP, centerLabel, decodeSignature, highTerrainNote, rankSymbols, symbolCardRow, symbolKey,
} from '../../prototype/v2-three/js/field-symbols.js';
import { FIELD_DESCRIPTORS } from '../../prototype/v2-three/js/field-layer.js';
import { defineScale, isolineSpec, scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { findPressureCenters, greatCircleDeg, matchCenters } from '../../prototype/v2-three/js/pressure-centers.js';

const W = 720;
const H = 361;
const GRID = Object.freeze({ ni: W, nj: H, lon0: -180, lat0: 90, dLon: 0.5, dLat: 0.5, wraps: true });
// 운영 매니페스트 fields.mslp.channels.R 과 그 앞 런의 눈금. 모듈은 어느 쪽도 모른다.
const NOW = Object.freeze({ name: 'R', idx: 0, transfer: 'linear', scale: 1, offset: 870 });
const OLD = Object.freeze({ name: 'R', idx: 0, transfer: 'linear', scale: 0.5, offset: 940 });
const PRESSURE = scaleOf('pressure');

const bump = (lat, lon, c) => {
  if (Math.abs(lat - c.lat) > 6 * c.sigma) return 0;
  const d = greatCircleDeg(lat, lon, c.lat, c.lon);
  return c.amp * Math.exp(-0.5 * (d / c.sigma) ** 2);
};
/** fn(lat, lon) → hPa 를 8bit 프레임 CPU 사본으로(gfs-frames pixels 와 같은 모양). */
const frame = (fn, dec = NOW) => {
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      data[j * W + i] = Math.max(0, Math.min(255, Math.round((fn(90 - j * 0.5, -180 + i * 0.5) - dec.offset) / dec.scale)));
    }
  }
  return { w: W, h: H, channels: 1, names: ['R'], data };
};
const world = (list) => (lat, lon) => { let v = 1013; for (const c of list) v += bump(lat, lon, c); return v; };

const fakeTextures = () => {
  const made = [];
  return {
    made,
    make: (glyph, num, color) => {
      const tex = { glyph, num, color, disposed: false, dispose() { this.disposed = true; } };
      made.push(tex);
      return { tex, w: 60, h: 84 };
    },
  };
};
const cameraAt = (x, y, z) => { const c = new THREE.PerspectiveCamera(); c.position.set(x, y, z); c.updateMatrixWorld(true); return c; };
const seaLevel = () => -3000;                      // 어디나 바다 — 가림판이 '고도를 읽었다'고 판정하는 값
const rig = (opts = {}) => {
  const tx = fakeTextures();
  const sym = new FieldSymbols({
    scale: PRESSURE, decode: NOW, cap: SYMBOL_CAP.desktop, heightAt: seaLevel, makeTexture: tx.make, ...opts,
  });
  return { sym, tx };
};
const at = (sym, kind, lat, lon, deg = 1.5) => sym.list.filter((c) => c.kind === kind && greatCircleDeg(c.lat, c.lon, lat, lon) <= deg);
const shownAt = (sym, kind, lat, lon, deg = 1.5) => sym.list
  .map((c, i) => ({ c, a: sym.pool[i].material.opacity }))
  .filter((x) => x.c.kind === kind && greatCircleDeg(x.c.lat, x.c.lon, lat, lon) <= deg && x.a > 0);

// ------------------------------------------------------------------------------------------------ 글자

test('기호 글자 — "L" 위 · 중심 기압 아래 · 단위는 적지 않는다(범례가 말한다)', () => {
  assert.deepEqual(centerLabel({ kind: 'L', hPa: 985 }), { glyph: 'L', num: '985' });
  assert.deepEqual(centerLabel({ kind: 'H', hPa: 1032 }), { glyph: 'H', num: '1032' });
  assert.deepEqual(centerLabel({ kind: 'L', hPa: 870, saturated: true }), { glyph: 'L', num: '≤870' }, '눈금 끝에 눌린 값');
  assert.deepEqual(centerLabel({ kind: 'L', hPa: 985.5 }), { glyph: 'L', num: '985.5' }, '0.5 hPa 눈금이면 소수도 나온다');
  assert.equal(symbolKey({ kind: 'H', hPa: 1024 }), 'H 1024', '텍스처 열쇠 = 화면에 적히는 글자');
  assert.equal(centerLabel({ kind: 'X', hPa: 1 }), null);
  // 색은 눈금표 한 장에서 온다 — 이 파일에도, field-symbols.js 에도 색을 다시 적지 않는다.
  assert.deepEqual(Object.keys(PRESSURE.symbols).sort(), ['H', 'L']);
  for (const c of Object.values(PRESSURE.symbols)) assert.match(c, /^#[0-9a-f]{6}$/i);
});

test('카드 줄 — 켬/끔 단추 하나와 고지대 규칙 한 줄 · 기온·풍속에는 이 줄이 없다', () => {
  const btn = (action, data, on, text) => `<b ${action} ${data} ${on}>${text}</b>`;
  const row = symbolCardRow({ id: 'presgrid', symbolName: '고·저기압 기호 H/L', symbolsOn: true, shown: { H: 3, L: 4 }, ko: true }, btn);
  assert.match(row, /field-symbols/);
  assert.match(row, /data-set="off"/, '켜져 있으면 누르면 꺼진다');
  assert.match(row, /1,500 m/, '왜 남극·티베트에 기호가 없는지 카드가 말한다');
  assert.match(row, /앞 반구 H 3 · L 4/);
  assert.match(symbolCardRow({ symbolsOn: false, ko: true }, btn), /data-set="on"/);
  assert.match(highTerrainNote(true, false), /지형 고도를 받은 뒤/);
  assert.match(highTerrainNote(false, true), /1,500 m/);
  // descriptor 의 훅은 기압에만 있다 — 기온·풍속은 이 층을 만들지도 않는다.
  assert.equal(FIELD_DESCRIPTORS.presgrid.symbols, 'pressureCenters');
  assert.equal(FIELD_DESCRIPTORS.tempgrid.symbols, undefined);
  assert.equal(FIELD_DESCRIPTORS.windgrid.symbols, undefined);
  assert.equal(FIELD_DESCRIPTORS.presgrid.scaleId, 'pressure');
  assert.equal(FIELD_DESCRIPTORS.presgrid.fieldId, 'mslp');
});

// ------------------------------------------------------------------------------------------------ 눈금표 한 장

test('눈금표를 한 줄 바꾸면 등압선 간격과 두드러짐 임계가 같이 바뀐다', () => {
  assert.equal(isolineSpec(PRESSURE).interval, 4);
  assert.equal(rig().sym.minProminence, 4, '임계 = 등압선 간격(닫힌 등압선이 하나는 있다는 뜻)');
  // 표의 등압선 줄만 2 hPa 로 바꾼 눈금 — 색도 경계도 그대로다.
  const finer = defineScale({ ...PRESSURE, id: 'pressureFine', isolines: { ...PRESSURE.isolines, interval: 2 } });
  assert.equal(isolineSpec(finer).interval, 2);
  assert.equal(rig({ scale: finer }).sym.minProminence, 2);
  // 색면의 불투명도도 표가 정한다 — 기압은 모든 칸이 0.4 다("색면은 옅게, 선이 주인공").
  assert.deepEqual([...new Set(PRESSURE.alpha)], [0.4]);
});

// ------------------------------------------------------------------------------------------------ 자리

test('합성 저기압·고기압의 자리에 기호가 선다 · 글자는 그 칸의 hPa 그대로', () => {
  const { sym } = rig();
  const f = frame(world([
    { lat: 30, lon: 130, sigma: 3, amp: -28 },       // 저기압 985
    { lat: 10, lon: -40, sigma: 5, amp: 19 },        // 고기압 1032
  ]));
  sym.update('a|b', f, f, { grid: GRID, hourA: 0, hourB: 0, gapH: 3 });
  const low = at(sym, 'L', 30, 130);
  const high = at(sym, 'H', 10, -40);
  assert.equal(low.length, 1);
  assert.equal(high.length, 1);
  assert.equal(symbolKey(low[0]), 'L 985');
  assert.equal(symbolKey(high[0]), 'H 1032');
  assert.ok(greatCircleDeg(low[0].lat, low[0].lon, 30, 130) <= 0.5, '0.5° 격자 한 칸 안');
});

test('디코드 상수는 매니페스트에서 온다 — 0.5/940 과 1/870 둘 다 같은 자리에 제 숫자를 적는다', () => {
  const make = (dec) => {
    const { sym } = rig({ decode: dec });
    sym.update('a|b', frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }]), dec), null, { grid: GRID, hourA: 0, hourB: 0 });
    return at(sym, 'L', 30, 130)[0];
  };
  assert.equal(symbolKey(make(NOW)), 'L 985');
  assert.equal(symbolKey(make(OLD)), 'L 985');
  // 눈금 바닥(940 hPa)에 눌린 태풍은 'L ≤940' 이라 적는다 — 없는 정밀을 말하지 않는다.
  const { sym } = rig({ decode: OLD });
  sym.update('a|b', frame(world([{ lat: 20, lon: 130, sigma: 2, amp: -90 }]), OLD), null, { grid: GRID, hourA: 0, hourB: 0 });
  assert.equal(symbolKey(at(sym, 'L', 20, 130)[0]), 'L ≤940');
});

test('고지대에는 기호를 세우지 않는다 · 지형을 못 받았으면 아무것도 그리지 않고 카드가 그 이유를 말한다', () => {
  const f = frame(world([
    { lat: 33, lon: 88, sigma: 3, amp: 24 },         // 티베트 위의 가짜 고기압
    { lat: 10, lon: -40, sigma: 5, amp: 19 },        // 바다 위의 진짜 고기압
  ]));
  const tibet = (lat, lon) => (lat > 27 && lat < 38 && lon > 78 && lon < 100 ? 4500 : -3000);
  const { sym } = rig({ heightAt: tibet });
  sym.update('a|b', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  assert.equal(sym.ready, true);
  assert.equal(at(sym, 'H', 33, 88, 4).length, 0, '해면 경정이 만든 고기압은 그리지 않는다');
  assert.equal(at(sym, 'H', 10, -40).length, 1);
  // 지형 타일이 아직 안 왔다(heightAtJs 는 그때 어디서나 정확히 0 이다) — 기호를 그리지 않고 다음 키프레임에 다시 해 본다.
  const cold = { h: 0 };
  const { sym: pending } = rig({ heightAt: () => cold.h });
  pending.update('a|b', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  assert.equal(pending.ready, false);
  assert.equal(pending.count, 0, '가짜가 섞인 그림을 내느니 아무것도 안 그린다');
  cold.h = -3000;
  pending.update('b|c', f, null, { grid: GRID, hourA: 3, hourB: 3 });
  assert.equal(pending.ready, true);
  assert.ok(pending.count > 0, '지형이 오면 다음 키프레임에 선다');
});

// ------------------------------------------------------------------------------------------------ 시간

test('키프레임이 안 바뀌면 다시 찾지 않는다 · 같은 프레임은 한 번만 찾는다', () => {
  const { sym } = rig();
  const a = frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }]));
  const b = frame(world([{ lat: 30, lon: 134, sigma: 3, amp: -30 }]));
  assert.equal(sym.update('0|3', a, b, { grid: GRID, hourA: 0, hourB: 3 }), true);
  assert.deepEqual([sym.builds, sym.finds], [1, 2]);
  // 타임라인이 같은 두 프레임 사이를 지나는 동안(mix 만 변한다) — 몇 번을 불러도 찾기는 돌지 않는다.
  for (let i = 0; i < 50; i += 1) {
    assert.equal(sym.update('0|3', a, b, { grid: GRID, hourA: 0, hourB: 3 }), false);
    sym.setMix(i / 50);
  }
  assert.deepEqual([sym.builds, sym.finds], [1, 2]);
  // 다음 구간으로 넘어가면 **새 프레임 한 장만** 더 찾는다(0|3 → 3|6 의 3 은 쥐고 있다).
  const c = frame(world([{ lat: 30, lon: 138, sigma: 3, amp: -32 }]));
  assert.equal(sym.update('3|6', b, c, { grid: GRID, hourA: 3, hourB: 6 }), true);
  assert.deepEqual([sym.builds, sym.finds], [2, 3]);
});

// 런이 갈리면(매니페스트 30분마다 다시 읽음 · gfs-frames onSwap) **같은 h 의 그림이 통째로 바뀐다.**
// 예보 시각 h 로 쥐면 옛 런에서 찾은 중심이 그대로 나오고, FieldLayer 는 제 key 만 비운 채 같은 '75|78' 을
// 다시 보내므로 update 가 '안 바뀌었다'고 일찍 돌아선다 — 기호가 수천 km 떨어진 자리에 선다(2026-09-20 반박 검증).
test('런이 갈리면 쥐고 있던 중심을 버린다 — 같은 예보 시각이라도 그림이 바뀌면 다시 찾는다', () => {
  const { sym } = rig();
  const oldA = frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }]));   // 옛 런: L 985 @ 130°E
  const oldB = frame(world([{ lat: 30, lon: 133, sigma: 3, amp: -28 }]));
  const newA = frame(world([{ lat: -20, lon: -60, sigma: 3, amp: -33 }]));  // 새 런: L 980 @ 60°W
  const newB = frame(world([{ lat: -20, lon: -57, sigma: 3, amp: -33 }]));
  sym.update('75|78', oldA, oldB, { grid: GRID, hourA: 75, hourB: 78 });
  assert.equal(at(sym, 'L', 30, 130, 4).length, 1);
  // ① 껐다 켜는 사이에 런이 갈린다(FieldLayer.off → on).
  sym.clear();
  sym.update('75|78', newA, newB, { grid: GRID, hourA: 75, hourB: 78 });
  assert.equal(at(sym, 'L', 30, 130, 4).length, 0, '옛 런의 중심이 남으면 안 된다');
  assert.equal(at(sym, 'L', -20, -60, 4).length, 1);
  // ② 켠 채로 런이 갈린다(onSwap 은 FieldLayer 의 key 만 비운다 — 기호에는 같은 글자가 다시 온다).
  const { sym: live } = rig();
  live.update('75|78', oldA, oldB, { grid: GRID, hourA: 75, hourB: 78 });
  assert.equal(live.update('75|78', newA, newB, { grid: GRID, hourA: 75, hourB: 78 }), true, '그림이 다르면 다시 찾는다');
  assert.equal(at(live, 'L', 30, 130, 4).length, 0);
  assert.equal(at(live, 'L', -20, -60, 4).length, 1);
  // ③ 눈금이 바뀌면(0.5/940 → 1/870 은 실제로 한 번 있었다) 같은 그림도 다른 숫자다 — 쥔 것을 버린다.
  const { sym: rescaled } = rig({ decode: OLD });
  const f = frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }]), OLD);   // OLD 눈금으로 구운 장
  rescaled.update('0|0', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  assert.equal(symbolKey(at(rescaled, 'L', 30, 130)[0]), 'L 985');
  rescaled.decode = NOW;                                   // FieldLayer.applyFieldSpec 이 하는 일
  assert.equal(rescaled.key, null, '눈금이 바뀌면 key 도 버린다');
  rescaled.update('0|0', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  // OLD 로 구운 바이트 90((985−940)/0.5)을 NOW 로 다시 풀면 90×1+870 = 960 이다.
  assert.equal(symbolKey(at(rescaled, 'L', 30, 130)[0]), 'L 960', '같은 바이트를 새 눈금으로 다시 푼다');
  // 값이 같은 새 객체(매니페스트를 다시 읽으면 그렇다)로는 버리지 않는다 — 공연히 다 버리지 않게.
  const before = rescaled.finds;
  rescaled.decode = { ...NOW };
  assert.equal(rescaled.key, '0|0');
  assert.equal(rescaled.finds, before);
  assert.equal(decodeSignature(NOW), decodeSignature({ ...NOW }));
  assert.notEqual(decodeSignature(NOW), decodeSignature(OLD));
  assert.equal(decodeSignature(null), 'none');
});

test('mix 에 따라 기호가 두 중심 사이를 움직이고, 글자는 가까운 쪽 키프레임의 것이다', () => {
  const { sym } = rig();
  const a = frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }]));   // L 985
  const b = frame(world([{ lat: 30, lon: 135, sigma: 3, amp: -33 }]));   // L 980 · 5° 동쪽
  sym.update('0|3', a, b, { grid: GRID, hourA: 0, hourB: 3, gapH: 3 });
  const lonAt = (mix) => { sym.setMix(mix); return at(sym, 'L', 30, 132.5, 4)[0]; };
  const c0 = lonAt(0);
  const c5 = lonAt(0.5);
  const c1 = lonAt(1);
  assert.ok(Math.abs(c0.lon - 130) < 0.3 && Math.abs(c1.lon - 135) < 0.3);
  assert.ok(c5.lon > c0.lon + 2 && c5.lon < c1.lon - 2, `중간은 사이에 있다 (${c5.lon})`);
  assert.deepEqual([symbolKey(c0), symbolKey(lonAt(0.4)), symbolKey(c5), symbolKey(c1)], ['L 985', 'L 985', 'L 980', 'L 980'],
    '두 키프레임에 없는 숫자를 만들지 않는다 — mix 0.5 에서 한 번 바뀐다');
  assert.equal(sym.finds, 2, '움직이는 동안 찾기는 돌지 않았다');
});

test('두드러짐이 임계(등압선 간격)에 못 미치는 중심은 그리지 않는다 · 짝 한쪽만 넘으면 그린다', () => {
  const deep = { kind: 'L', lat: 0, lon: 0, hPa: 990, prominence: 20 };
  const weak = { kind: 'L', lat: 20, lon: 0, hPa: 1010, prominence: 2 };
  const one = rankSymbols(matchCenters([deep, weak], [deep, weak]), 0, { minProminence: 4 });
  assert.deepEqual(one.map((c) => c.hPa), [990]);
  // 한 프레임만 임계를 밑돌면 기호가 깜빡인다 — 짝이 있다는 것은 같은 중심이라는 뜻이라 둘 중 큰 쪽을 본다.
  const rising = rankSymbols(matchCenters([{ ...weak, prominence: 3 }], [{ ...weak, prominence: 6 }]), 0, { minProminence: 4 });
  assert.equal(rising.length, 1);
  // 히스테리시스: 직전 키프레임에 보이던 중심이 상한 자리를 먼저 갖는다.
  const old = { kind: 'H', lat: -10, lon: 30, hPa: 1020, prominence: 5 };
  const fresh = { kind: 'H', lat: 40, lon: 30, hPa: 1030, prominence: 9 };
  const plain = rankSymbols(matchCenters([old, fresh], [old, fresh]), 0, { minProminence: 4 });
  assert.deepEqual(plain.map((c) => c.hPa), [1030, 1020], '아무것도 안 보였으면 센 것부터');
  const carried = rankSymbols(matchCenters([old, fresh], [old, fresh]), 0, { minProminence: 4, carry: new Set([old]) });
  assert.deepEqual(carried.map((c) => c.hPa), [1020, 1030], '보이던 것이 먼저 — 순위가 오가는 중심에서 기호가 깜빡이지 않게');
});

test('히스테리시스는 앞으로 밀어도 되감아도 선다 — 짝의 양쪽을 다 기억한다', () => {
  const { sym } = rig();
  const f = (dlon) => frame(world([{ lat: 20, lon: dlon, sigma: 3, amp: -25 }]));
  const f0 = f(0);
  const f3 = f(3);
  const f6 = f(6);
  const carriedL = () => sym.list.find((c) => c.kind === 'L').carried;
  sym.setVisible(true);
  sym.update('0|3', f0, f3, { grid: GRID, hourA: 0, hourB: 3 });
  sym.setMix(0.2);                                    // 가까운 쪽 키프레임은 h=0 이다(lerpCenter 의 nearest)
  sym.tick(cameraAt(0, 0, 3));
  assert.ok(sym.shown.L >= 1);
  // 앞으로: 0|3 → 3|6. 보이던 중심은 h=0 의 것이지만 새 짝의 a 는 h=3 이다 — 양쪽을 물어야 이어진다.
  sym.update('3|6', f3, f6, { grid: GRID, hourA: 3, hourB: 6 });
  assert.equal(carriedL(), true, '앞으로 밀 때');
  sym.setMix(0.2);
  sym.tick(cameraAt(0, 0, 3));
  // 되감기: 3|6 → 0|3. 이번에는 보이던 중심이 h=3 이고 새 짝의 **b** 가 h=3 이다.
  sym.update('0|3', f0, f3, { grid: GRID, hourA: 0, hourB: 3 });
  assert.equal(carriedL(), true, '되감을 때');
  // 한 번도 안 보이던 중심은 이어지지 않는다.
  sym.clear();
  sym.update('0|3', f0, f3, { grid: GRID, hourA: 0, hourB: 3 });
  assert.equal(carriedL(), false);
});

// ------------------------------------------------------------------------------------------------ 그리기

test('앞 반구 상한 — 종류마다 따로 센다(데스크톱 8·8 · 폰 5·5) · 뒤편은 0', () => {
  const { sym } = rig({ cap: SYMBOL_CAP.phone });
  // 카메라 쪽(경도 0 부근)에 저기압 9개와 고기압 9개, 지구 뒤편(경도 180)에 저기압 4개.
  // 위도 간격 10° — 모듈의 최소 간격(8°)보다 넉넉히 떨어뜨린다(딱 8° 로 두면 대권 거리의 반올림에 걸린다).
  const list = [];
  for (let i = 0; i < 9; i += 1) list.push({ lat: -40 + i * 10, lon: -16, sigma: 2.2, amp: -(10 + i) });
  for (let i = 0; i < 9; i += 1) list.push({ lat: -40 + i * 10, lon: 16, sigma: 2.2, amp: 10 + i });
  for (let i = 0; i < 4; i += 1) list.push({ lat: -20 + i * 13, lon: 180, sigma: 2.2, amp: -(12 + i) });
  const f = frame(world(list));
  sym.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  sym.tick(cameraAt(0, 0, 3));
  assert.deepEqual(sym.shown, { H: SYMBOL_CAP.phone.H, L: SYMBOL_CAP.phone.L });
  assert.ok(sym.count > SYMBOL_CAP.phone.H + SYMBOL_CAP.phone.L, '찾은 것은 더 많다 — 그리는 쪽이 센다');
  // 상한 밖과 지구 뒤편은 0. 남는 것은 우선순위(두드러짐) 앞의 것이다.
  const shownList = sym.list.filter((c, i) => sym.pool[i].material.opacity > 0);
  for (const kind of ['H', 'L']) {
    const proms = shownList.filter((c) => c.kind === kind).map((c) => c.prominence);
    const all = sym.list.filter((c) => c.kind === kind && Math.abs(c.lon) < 90).map((c) => c.prominence).sort((p, q) => q - p);
    assert.deepEqual(proms, all.slice(0, SYMBOL_CAP.phone[kind]), `${kind} 는 센 것부터`);
  }
  assert.equal(shownAt(sym, 'L', 0, 180, 40).length, 0, '지구 뒤편은 0');
  // 데스크톱 상한은 더 크다 — 숫자를 박지 않고 상수에서 센다.
  const { sym: desk } = rig();
  desk.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  desk.tick(cameraAt(0, 0, 3));
  assert.deepEqual(desk.shown, { H: 8, L: 8 });
  assert.deepEqual([SYMBOL_CAP.desktop, SYMBOL_CAP.phone], [{ H: 8, L: 8 }, { H: 5, L: 5 }]);
  // 반대편으로 돌면 뒤에 있던 것이 보인다.
  desk.tick(cameraAt(0, 0, -3));
  assert.equal(desk.shown.L, 4);
  assert.equal(desk.shown.H, 0);
});

test('텍스처는 글자 종류 수만큼만 굽는다 — 기호가 몇 개든 "H 1024" 는 한 장이다', () => {
  const { sym, tx } = rig();
  // 같은 깊이의 저기압 여섯 — 글자가 전부 'L 1003' 이다.
  const list = [];
  for (let i = 0; i < 6; i += 1) list.push({ lat: 0, lon: -150 + 60 * i, sigma: 2.5, amp: -10 });
  const f = frame(world(list));
  sym.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  assert.ok(sym.count >= 6);
  const keys = new Set(sym.list.map(symbolKey));
  assert.equal(tx.made.length, keys.size);
  assert.ok(tx.made.length < sym.count, `기호 ${sym.count}개 · 텍스처 ${tx.made.length}장`);
  assert.equal(sym.pool[0].material.map, sym.pool[1].material.map);
  // 스프라이트 설정: 화면 고정 크기 · 깊이 검사 끔(판이 구면에 잘린다) · 색면과 구름 위.
  const m = sym.pool[0].material;
  assert.deepEqual([m.sizeAttenuation, m.depthTest, m.depthWrite, m.transparent], [false, false, false, true]);
  assert.ok(sym.pool[0].renderOrder > 4);
  // 같은 글자를 다시 청해도 굽지 않는다.
  const before = tx.made.length;
  sym.update('k2', f, null, { grid: GRID, hourA: 3, hourB: 3 });
  assert.equal(tx.made.length, before);
});

test('끄면 정리한다 — 스프라이트 알파 0 · 짝과 키를 버린다 · dispose 는 텍스처까지', () => {
  const { sym, tx } = rig();
  const f = frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }, { lat: 10, lon: -40, sigma: 5, amp: 19 }]));
  sym.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  sym.setVisible(true);
  sym.tick(cameraAt(0, 0, 3));
  assert.ok(sym.count > 0 && sym.group.visible);
  // 카드의 켬/끔은 그룹만 감춘다 — 다시 켤 때 찾지 않는다.
  sym.setEnabled(false);
  assert.equal(sym.group.visible, false);
  sym.setEnabled(true);
  assert.equal(sym.group.visible, true);
  assert.equal(sym.finds, 1);
  // 레이어를 끄면(FieldLayer.off) 비운다.
  sym.clear();
  assert.deepEqual([sym.count, sym.key, sym.group.visible, sym.pairs.length], [0, null, false, 0]);
  assert.ok(sym.pool.every((s) => s.material.opacity === 0 && !s.visible));
  assert.equal(tx.made.every((t) => t.disposed), false, '텍스처는 돌려쓰려고 남긴다');
  sym.dispose();
  assert.ok(tx.made.every((t) => t.disposed));
  assert.equal(sym.pool.length, 0);
});

test('기호는 색면의 덤이다 — 고도가 던져도, 격자가 낯설어도 던지지 않고 기호만 없다', () => {
  const f = frame(world([{ lat: 30, lon: 0, sigma: 3, amp: -28 }]));
  // ① heightAtJs 가 던진다(교차 출처로 더럽혀진 캔버스의 getImageData).
  const { sym: a } = rig({ heightAt: () => { throw new Error('SecurityError: tainted canvas'); } });
  assert.doesNotThrow(() => a.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 }));
  assert.deepEqual([a.count, a.ready], [0, false]);
  assert.match(a.state().maskError, /tainted/);
  // ② 매니페스트가 전지구가 아닌 격자를 말한다 — findPressureCenters 가 던지는 자리다.
  const { sym: b } = rig();
  const local = { ni: W, nj: H, lon0: 100, lat0: 60, dLon: 0.1, dLat: 0.1, wraps: false };
  assert.doesNotThrow(() => b.update('k', f, null, { grid: local, hourA: 0, hourB: 0 }));
  assert.equal(b.count, 0);
  assert.match(b.state().findError, /GLOBAL_GRID/);
  // ③ 디코드 상수가 없다 — 기호를 그리지 않을 뿐이다.
  const { sym: c } = rig({ decode: null });
  assert.doesNotThrow(() => c.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 }));
  assert.equal(c.count, 0);
});

test('콘솔 확인용 state() — 가림판·기호 수·보인 수·텍스처 수', () => {
  const { sym } = rig();
  const f = frame(world([{ lat: 30, lon: 0, sigma: 3, amp: -28 }]));   // 카메라 쪽(경도 0)에 둔다
  sym.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  sym.setVisible(true);
  sym.tick(cameraAt(0, 0, 3));
  const s = sym.state();
  assert.equal(s.ready, true);
  assert.equal(s.mask.cells, W * H);
  assert.ok(s.mask.high > 0, '고도가 바다뿐이어도 남극관은 가려진다');
  assert.equal(s.mask.ok, true);
  assert.ok(s.symbols > 0 && s.textures > 0);
  assert.equal(s.shown.L >= 1, true);
  assert.deepEqual([s.enabled, s.visible], [true, true]);
});

test('가림판은 한 번만 굽는다 — 키프레임이 바뀌어도 고도를 다시 묻지 않는다', () => {
  let probes = 0;
  const { sym } = rig({ heightAt: () => { probes += 1; return -3000; } });
  const f = frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }]));
  sym.update('0|3', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  const first = probes;
  assert.ok(first >= W * H, '한 칸마다 한 번');
  sym.update('3|6', f, null, { grid: GRID, hourA: 3, hourB: 3 });
  sym.update('6|9', f, null, { grid: GRID, hourA: 6, hourB: 9 });
  // 기호 자리마다 지형 높이를 한 번씩 더 묻는다(스프라이트를 지형 위에 세우려고) — 가림판 26만 번이 다시 돌지는 않는다.
  assert.ok(probes - first < 200, `가림판을 다시 굽지 않는다 (${probes - first}번 더)`);
});

test('찾기는 진짜 모듈이 한다 — 같은 프레임·같은 가림판이면 findPressureCenters 와 같은 자리다', () => {
  const { sym } = rig();
  const f = frame(world([{ lat: 30, lon: 130, sigma: 3, amp: -28 }, { lat: -20, lon: 20, sigma: 4, amp: 22 }]));
  sym.update('k', f, null, { grid: GRID, hourA: 0, hourB: 0 });
  const direct = findPressureCenters({ w: f.w, h: f.h, data: f.data, channels: 1 }, NOW, { highMask: sym.mask, grid: GRID })
    .filter((c) => c.prominence >= 4);
  const mine = new Set(sym.list.map((c) => `${c.kind}${c.lat}${c.lon}${c.hPa}`));
  for (const c of direct) assert.ok(mine.has(`${c.kind}${c.lat}${c.lon}${c.hPa}`), `${c.kind} ${c.hPa}@(${c.lat},${c.lon})`);
  assert.equal(sym.list.length, direct.length);
});
