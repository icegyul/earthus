// DEV-DIRECTIVE 2026-09-20 · W1 §4 — 등치선 숫자 라벨(prototype/v2-three/js/field-labels.js)의 결과 시험.
//
// 선은 셰이더가 긋고 이 모듈은 라벨 자리만 찾는다. 그래서 잴 것은 **라벨이 어디에 서는가**다:
//   합성 원형 등온선에서 라벨이 그 원 위에 놓이는가 · 날짜변경선을 넘는 원에서도 그런가 · 상한과 최소 간격을 지키는가 ·
//   키프레임이 그대로면 다시 계산하지 않는가 · 글자가 같으면 텍스처를 다시 굽지 않는가 · 지구 뒤편과 상한 밖의 라벨이 꺼지는가.
// 캔버스는 없다 — 텍스처 굽기를 주입한다. THREE 는 저장소의 r184 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  FIELD_LABEL_CAP, FIELD_LABEL_MAX_LAT, FIELD_LABEL_MIN_SEP_DEG, FieldLabels,
  labelLevels, labelOpacity, labelText, pickLabelSpots, thinField, traceContours,
} from '../../prototype/v2-three/js/field-labels.js';
import { isolineSpec, scaleOf } from '../../prototype/v2-three/js/field-scales.js';

const D2R = Math.PI / 180;
const W = 720;
const H = 361;
const GRID = Object.freeze({ ni: W, nj: H, lon0: -180, lat0: 90, dLon: 0.5, dLat: 0.5, wraps: true });
// 운영 매니페스트 fields.temp 의 디코드 상수와 같은 꼴(0.5°C 눈금 · −80°C 부터).
const TEMP = Object.freeze([{ name: 'R', idx: 0, transfer: 'linear', scale: 0.5, offset: -80 }]);
const byteOf = (c) => Math.max(0, Math.min(255, Math.round((c + 80) / 0.5)));
const ang = (la1, lo1, la2, lo2) => Math.acos(Math.max(-1, Math.min(1,
  Math.sin(la1 * D2R) * Math.sin(la2 * D2R) + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.cos((lo1 - lo2) * D2R)))) / D2R;

// fn(lat, lon) → °C 로 720×361 회색 프레임의 CPU 사본을 만든다(gfs-frames pixels 와 같은 모양).
const frame = (fn) => {
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j += 1) for (let i = 0; i < W; i += 1) data[j * W + i] = byteOf(fn(90 - j * 0.5, -180 + i * 0.5));
  return { w: W, h: H, channels: 1, names: ['R'], data };
};
// 한 점을 둘러싼 동심원 등온선: 중심 40°C · 1° 에 0.5°C 씩 내려간다 → 30°C 는 20°, 20°C 는 40°, 10°C 는 60° 원.
const cone = (cLat, cLon) => (lat, lon) => 40 - 0.5 * ang(lat, lon, cLat, cLon);
const radiusOf = (level) => (40 - level) / 0.5;

test('라벨 글자 — 시안의 "20°C" · "−10°C" (소수 0 을 떼고 도 단위는 붙인다 · 글자와 부호는 눈금표의 것)', () => {
  const temp = scaleOf('temp');
  assert.deepEqual([20, -10, 0, 30].map((v) => labelText(temp, v)), ['20°C', '−10°C', '0°C', '30°C']);
  assert.equal(labelText(scaleOf('pressure'), 1012), '1012 hPa');
});

test('2° 로 솎는다 — 720×361 → 180×91 · 두 프레임이면 가운데 값과 두 프레임의 차를 같이 낸다', () => {
  const a = frame(() => 10);
  const b = frame((lat) => (lat > 0 ? 14 : 10));
  const t = thinField({ pxA: a, pxB: b, channels: TEMP, grid: GRID });
  assert.deepEqual([t.nx, t.ny, t.dLon, t.dLat, t.lon0, t.lat0, t.wraps], [180, 91, 2, 2, -180, 90, true]);
  assert.equal(t.mid[10 * 180 + 5], 12, '북반구: (10 + 14) / 2');
  assert.equal(t.spread[10 * 180 + 5], 4);
  assert.equal(t.mid[80 * 180 + 5], 10);
  assert.equal(t.spread[80 * 180 + 5], 0);
  assert.deepEqual([t.min, t.max], [10, 12]);
  // 같은 배열을 돌려쓴다 — 키프레임마다 새로 잡지 않는다.
  const again = thinField({ pxA: a, channels: TEMP, grid: GRID }, t);
  assert.equal(again.mid, t.mid);
  assert.equal(again.mid[10 * 180 + 5], 10, '한 프레임이면 그 값 그대로');
});

test('라벨은 주 레벨에만 — 기온은 2°C 를 골라도 5°C 를 골라도 10°C 마다 · 자료 범위 안의 것만', () => {
  const temp = scaleOf('temp');
  assert.deepEqual(labelLevels(isolineSpec(temp, '5'), -23.5, 38), [-20, -10, 0, 10, 20, 30]);
  assert.deepEqual(labelLevels(isolineSpec(temp, '2'), -23.5, 38), [-20, -10, 0, 10, 20, 30]);
  assert.deepEqual(labelLevels(isolineSpec(temp, '5'), 10, 19.5), [], '최솟값과 같은 레벨은 넘을 곳이 없다');
  // 기압(2026-09-20 D1): 선은 4 hPa 마다지만 숫자는 **굵은 선(20 hPa)** 에만 — 지시서 W3 의 "20 hPa 굵게".
  // (그 전에는 label 'all' 이라 4 hPa 마다 숫자가 붙었고 이 줄이 [1004, 1008, 1012] 였다.)
  assert.deepEqual(labelLevels(isolineSpec(scaleOf('pressure')), 960, 1045), [980, 1000, 1020, 1040]);
  assert.deepEqual(labelLevels(isolineSpec(scaleOf('pressure')), 1001, 1013), [], '좁은 범위에는 굵은 선이 없다');
  assert.deepEqual(labelLevels(isolineSpec(scaleOf('sst')), 20, 30), [26, 29], '강조값에만');
  assert.deepEqual(labelLevels(isolineSpec(scaleOf('precip')), 0, 40), [], "label 'none'");
  assert.deepEqual(labelLevels(null, 0, 40), [], '등치선이 없는 눈금(풍속)');
});

test('합성 원형 등온선 — 라벨이 그 원 위에 놓이고, 상한과 최소 간격을 지킨다', () => {
  const C = [20, 100];
  const thin = thinField({ pxA: frame(cone(...C)), channels: TEMP, grid: GRID });
  const levels = labelLevels(isolineSpec(scaleOf('temp'), '5'), thin.min, thin.max);
  // 40 은 중심 한 점의 값이다 — 레벨에는 들지만 그 '선'은 점이라 아래에서 짧은 선으로 걸러진다.
  assert.deepEqual(levels, [-40, -30, -20, -10, 0, 10, 20, 30, 40]);
  // 선 하나하나: 20°C 선은 닫힌 원 하나이고 길이는 반지름 40° 원의 둘레(2π·sin40° rad ≈ 231°)다.
  const lines = traceContours(thin, 20);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].closed, true);
  assert.ok(Math.abs(lines[0].lengthDeg - 360 * Math.sin(40 * D2R)) < 8, `둘레 ${lines[0].lengthDeg.toFixed(1)}°`);
  for (const [lon, lat] of lines[0].pts) assert.ok(Math.abs(ang(lat, lon, ...C) - 40) < 1.2, '꼭짓점이 원 위에 있다(2° 격자 · 0.5°C 눈금의 오차 안)');

  const spots = pickLabelSpots(thin, levels, { maxTotal: 24 });
  assert.ok(spots.length >= 8 && spots.length <= 24, `${spots.length}개`);
  for (const s of spots) {
    assert.ok(Math.abs(ang(s.lat, s.lon, ...C) - radiusOf(s.level)) < 1.5, `${s.level}°C 라벨이 제 원에서 ${Math.abs(ang(s.lat, s.lon, ...C) - radiusOf(s.level)).toFixed(2)}° 떨어졌다`);
    assert.ok(Math.abs(s.lat) <= FIELD_LABEL_MAX_LAT);
    assert.ok(s.lon >= -180 && s.lon < 180);
  }
  for (let i = 0; i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      assert.ok(ang(spots[i].lat, spots[i].lon, spots[j].lat, spots[j].lon) >= FIELD_LABEL_MIN_SEP_DEG - 1e-9, '라벨이 겹친다');
    }
  }
  assert.ok(spots.every((s) => s.level !== 40), '점 같은 봉우리에는 숫자를 세우지 않는다');
  // 긴 선에는 여러 개가 선다(20°C 원 둘레 231° ÷ 45°).
  assert.ok(spots.filter((s) => s.level === 20).length >= 3);
  // 상한은 상한이다.
  assert.equal(pickLabelSpots(thin, levels, { maxTotal: 5 }).length, 5);
  assert.ok(FIELD_LABEL_CAP.phone === 12 && FIELD_LABEL_CAP.desktop === 24);
});

test('날짜변경선 — 경도 180° 를 품은 원도 끊기지 않은 한 줄이고 라벨이 그 위에 선다', () => {
  const C = [0, 180];
  const thin = thinField({ pxA: frame(cone(...C)), channels: TEMP, grid: GRID });
  const lines = traceContours(thin, 30);             // 반지름 20° — 동경 160 ~ 서경 160 에 걸친다
  assert.equal(lines.length, 1, '이음매에서 두 조각으로 갈리면 안 된다');
  assert.equal(lines[0].closed, true);
  assert.ok(Math.abs(lines[0].lengthDeg - 360 * Math.sin(20 * D2R)) < 8);
  const spots = pickLabelSpots(thin, [30, 20], {});
  assert.ok(spots.length >= 3);
  for (const s of spots) assert.ok(Math.abs(ang(s.lat, s.lon, ...C) - radiusOf(s.level)) < 1.5);
  assert.ok(spots.some((s) => s.lon < -150) && spots.some((s) => s.lon > 150), '이음매 양쪽에 다 선다');
  // 한 바퀴 돌지 않는 격자(지역판)는 이음 칸을 만들지 않는다 — 없는 자료를 잇지 않는다.
  const open = { ...thin, wraps: false };
  assert.ok(traceContours(open, 30).length >= 2);
});

test('라벨은 셰이더의 선을 따라간다 — 선이 반 눈금 아래(v = 레벨 − 0.25)에 서면 라벨도 거기 선다', () => {
  const C = [10, -30];
  const thin = thinField({ pxA: frame(cone(...C)), channels: TEMP, grid: GRID });
  const plain = pickLabelSpots(thin, [20], {});
  const shifted = pickLabelSpots(thin, [20], { shift: 0.25 });
  assert.ok(plain.length >= 3 && shifted.length >= 3);
  // 원뿔은 1° 에 0.5°C 다 — 19.75°C 선은 20°C 선보다 0.5° 바깥이다. 글자는 그대로 20 이다.
  const mean = (list) => list.reduce((s, p) => s + ang(p.lat, p.lon, ...C), 0) / list.length;
  assert.ok(Math.abs(mean(shifted) - mean(plain) - 0.5) < 0.35, `${mean(plain).toFixed(2)}° → ${mean(shifted).toFixed(2)}°`);
  assert.ok(shifted.every((s) => s.level === 20));
});

test('두 프레임 사이에서 흔들리는 곳보다 가만있는 곳에 라벨을 세운다', () => {
  // 위도에 따라 내려가는 기온(가로 등온선). 동반구는 두 프레임이 같고 서반구는 일교차처럼 8°C 흔들린다.
  const base = (lat) => 30 - Math.abs(lat) * 0.6;
  const a = frame((lat, lon) => base(lat) + (lon < 0 ? 4 : 0));
  const b = frame((lat, lon) => base(lat) - (lon < 0 ? 4 : 0));
  const thin = thinField({ pxA: a, pxB: b, channels: TEMP, grid: GRID });
  const spots = pickLabelSpots(thin, [10, 20], { maxTotal: 6 });
  assert.ok(spots.length >= 4);
  const calm = spots.filter((s) => s.lon >= 0).length;
  assert.ok(calm > spots.length / 2, `가만있는 동반구 ${calm} / ${spots.length}`);
});

test('지평선에서 흐려지고 지구 뒤편은 0', () => {
  assert.equal(labelOpacity(0, 0, 1, 0, 0, 3), 1, '카메라 바로 아래');
  assert.equal(labelOpacity(0, 0, -1, 0, 0, 3), 0, '지구 뒤편');
  assert.equal(labelOpacity(1, 0, 0, 0, 0, 3), 0, '90° 옆 — 거리 3 에서 지평선(70.5°) 너머');
  const near = labelOpacity(Math.sin(60 * D2R), 0, Math.cos(60 * D2R), 0, 0, 3);
  assert.ok(near > 0 && near <= 1);
  assert.equal(labelOpacity(0, 0, 1, 0, 0, 0.9), 0, '카메라가 라벨보다 낮다');
  assert.equal(labelOpacity(0, 0, 0, 0, 0, 3), 0);
});

// ---------------------------------------------------------------- 그리기

const fakeTextures = () => {
  const made = [];
  return { made, make: (text) => { const tex = { text, disposed: false, dispose() { this.disposed = true; } }; made.push(tex); return { tex, w: 92, h: 40 }; } };
};
const cameraAt = (x, y, z) => { const c = new THREE.PerspectiveCamera(); c.position.set(x, y, z); c.updateMatrixWorld(true); return c; };

test('키프레임이 안 바뀌면 라벨을 다시 계산하지 않는다 · 글자가 같으면 텍스처도 다시 굽지 않는다', () => {
  const tx = fakeTextures();
  const labels = new FieldLabels({ makeTexture: tx.make });
  let builds = 0;
  const build = () => { builds += 1; return [{ lat: 0, lon: 0, text: '20°C' }, { lat: 10, lon: 20, text: '20°C' }, { lat: -5, lon: 40, text: '30°C' }]; };
  assert.equal(labels.update('0|3', build), true);
  // 타임라인이 같은 두 프레임 사이를 지나는 동안(mix 만 변한다) — 몇 번을 불러도 자리 찾기는 돌지 않는다.
  for (let i = 0; i < 50; i += 1) assert.equal(labels.update('0|3', build), false);
  assert.deepEqual([builds, labels.builds, labels.count], [1, 1, 3]);
  assert.equal(tx.made.length, 2, "'20°C' 두 개는 텍스처 한 장을 같이 쓴다");
  assert.equal(labels.pool[0].material.map, labels.pool[1].material.map);
  // 키프레임이 바뀌면 다시 돈다. 스프라이트와 텍스처는 돌려쓴다.
  const first = labels.pool[0];
  assert.equal(labels.update('3|6', () => { builds += 1; return [{ lat: 1, lon: 1, text: '20°C' }]; }), true);
  assert.deepEqual([builds, labels.count, labels.pool.length, labels.pool[0] === first], [2, 1, 3, true]);
  assert.deepEqual(labels.pool.map((s) => s.visible), [true, false, false]);
  assert.equal(tx.made.length, 2);
  // 스프라이트 설정: 화면 고정 크기 · 깊이 검사 끔(판이 구면에 잘린다) · 색면과 구름 위.
  const m = labels.pool[0].material;
  assert.deepEqual([m.sizeAttenuation, m.depthTest, m.depthWrite, m.transparent], [false, false, false, true]);
  assert.ok(labels.pool[0].renderOrder > 4);
  labels.dispose();
  assert.ok(tx.made.every((t) => t.disposed));
  assert.equal(labels.pool.length, 0);
});

test('앞 반구 상한 — 폰 12 · 뒤편은 0 · 우선순위 앞의 것부터 남는다', () => {
  const tx = fakeTextures();
  const labels = new FieldLabels({ maxFront: FIELD_LABEL_CAP.phone, makeTexture: tx.make });
  const list = [];
  for (let i = 0; i < 20; i += 1) list.push({ lat: (i % 5) * 6 - 12, lon: Math.floor(i / 5) * 8 - 12, text: '10°C' });   // 앞(경도 0 부근) 20개
  for (let i = 0; i < 10; i += 1) list.push({ lat: i * 3 - 15, lon: 180, text: '0°C' });                                // 뒤 10개
  labels.update('k', () => list);
  const shown = labels.tick(cameraAt(0, 0, 3));
  assert.equal(shown, 12);
  const op = labels.pool.map((s) => s.material.opacity);
  assert.ok(op.slice(0, 12).every((a) => a > 0), '우선순위 앞의 12개');
  assert.ok(op.slice(12).every((a) => a === 0), '상한 밖과 지구 뒤편');
  // 반대편으로 돌면 뒤에 있던 것이 보인다.
  assert.equal(labels.tick(cameraAt(0, 0, -3)), 10);
  assert.ok(labels.pool.slice(0, 20).every((s) => s.material.opacity === 0));
  labels.dispose();
});

test('라벨은 지형 위에 선다 — 과장이 바뀌면 높이만 다시 주고 자리는 다시 찾지 않는다', () => {
  let ex = 50;
  const tx = fakeTextures();
  const labels = new FieldLabels({ makeTexture: tx.make, heightAt: () => 4500, getExagger: () => ex, lift: 0.003 });
  labels.update('k', () => [{ lat: 0, lon: 0, text: '10°C' }]);
  const r50 = labels.pool[0].position.length();
  assert.ok(Math.abs(r50 - (1 + (4500 / 6371000) * 50 + 0.003)) < 1e-6);
  ex = 10;
  labels.tick(cameraAt(0, 0, 3));
  const r10 = labels.pool[0].position.length();
  assert.ok(Math.abs(r10 - (1 + (4500 / 6371000) * 10 + 0.003)) < 1e-6);
  assert.equal(labels.builds, 1);
  // 끄면 비우고, 다시 켜면 같은 키여도 다시 세운다.
  labels.clear();
  assert.equal(labels.count, 0);
  assert.equal(labels.update('k', () => [{ lat: 0, lon: 0, text: '10°C' }]), true);
  labels.dispose();
});
