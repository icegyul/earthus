// 색면 위의 나라·해안 윤곽선(js/field-outlines.js) — 새 색면이 바탕 지도의 국경을 덮어 '어디가 한반도인지' 알 수 없었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OUTLINE_LIFT, createFieldOutlines, isSeamEdge, outlinePositions, outlineSegments,
} from '../../prototype/v2-three/js/field-outlines.js';

const lf = (s) => s.replace(/\r\n/g, '\n');
const poly = (ring) => ({ geometry: { type: 'Polygon', coordinates: [ring] } });

test('폴리곤의 변이 선분이 된다 — Polygon · MultiPolygon 둘 다', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  assert.equal(outlineSegments([poly(sq)]).length, 4 * 4, '변 4개 × (lon0,lat0,lon1,lat1)');
  const multi = { geometry: { type: 'MultiPolygon', coordinates: [[sq], [sq.map(([x, y]) => [x + 20, y])]] } };
  assert.equal(outlineSegments([multi]).length, 8 * 4);
  assert.equal(outlineSegments(null).length, 0);
  assert.equal(outlineSegments([{ geometry: null }, {}]).length, 0);
});

test('지도 밖의 선은 긋지 않는다 — 날짜변경선을 건너는 변 · ±180° 경선을 따라 닫는 변 · 남극 바닥', () => {
  assert.equal(isSeamEdge(179, 10, -179, 10), true, '지구를 가로지르는 선이 된다');
  assert.equal(isSeamEdge(180, -16.07, 180, -16.56), true, '피지: 폴리곤을 닫으려고 경선을 따라 그은 변');
  assert.equal(isSeamEdge(-180, -90, 180, -90), true);
  assert.equal(isSeamEdge(-60, -90, 60, -90), true, '남극 바닥');
  assert.equal(isSeamEdge(126, 37, 127, 38), false);
  // 실제 자료: 러시아·피지·남극이 이 경우다 — 선분 가운데 경도 차가 180° 를 넘는 것이 하나도 없어야 한다
  const j = JSON.parse(readFileSync(new URL('../../prototype/v2-three/data/country-reference.json', import.meta.url), 'utf8'));
  const seg = outlineSegments(j.features);
  assert.ok(seg.length / 4 > 15000, `선분 ${seg.length / 4}개 — 나라 177곳의 변이 다 들어오지 않았다`);
  let worst = 0;
  for (let i = 0; i < seg.length; i += 4) worst = Math.max(worst, Math.abs(seg[i + 2] - seg[i]));
  assert.ok(worst <= 180, `경도 차 ${worst}° 인 선분이 있다 — 지구를 가로지른다`);
});

test('깨진 좌표는 그 변만 버린다', () => {
  const ring = [[0, 0], [5, 'x'], [10, 0], [10, 10], [0, 0]];
  assert.equal(outlineSegments([poly(ring)]).length, 2 * 4, "가운데 점이 깨졌으면 그 점에 닿는 두 변만 빠진다");
});

test('좌표 규약이 v2 와 같다 — 서울은 +x·+y 쪽, 반지름은 주어진 함수에서', () => {
  const pos = outlinePositions(Float32Array.from([127, 37.5, 0, 0]), () => 2);
  const D = Math.PI / 180;
  assert.ok(Math.abs(pos[0] - 2 * Math.cos(37.5 * D) * Math.sin(127 * D)) < 1e-6);
  assert.ok(Math.abs(pos[1] - 2 * Math.sin(37.5 * D)) < 1e-6);
  assert.ok(Math.abs(pos[2] - 2 * Math.cos(37.5 * D) * Math.cos(127 * D)) < 1e-6);
  assert.deepEqual([...pos.slice(3)].map((v) => +v.toFixed(6)), [0, 0, 2], '경도 0 · 위도 0 은 +z');
  const flat = outlinePositions(Float32Array.from([0, 0]), null);
  assert.ok(Math.abs(flat[2] - (1 + OUTLINE_LIFT)) < 1e-6, '반지름 함수가 없으면 색면 위 고정 높이');
});

// 가짜 THREE — 부품이 만드는 물체의 수와 갱신만 본다.
const fakeThree = () => {
  const made = { geo: 0, mat: 0, line: 0 };
  class BufferAttribute { constructor(array, size) { this.array = array; this.itemSize = size; this.needsUpdate = false; } }
  class BufferGeometry { constructor() { made.geo += 1; this.attrs = {}; } setAttribute(k, a) { this.attrs[k] = a; } getAttribute(k) { return this.attrs[k]; } dispose() {} }
  class LineBasicMaterial { constructor(o) { made.mat += 1; Object.assign(this, o); } dispose() {} }
  class LineSegments { constructor(g, m) { made.line += 1; this.geometry = g; this.material = m; this.visible = true; } }
  return { made, BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments };
};

test('보일 필요가 없으면 아무것도 짓지 않는다 · 폴리곤이 오면 물체 하나(드로우콜 1) · 과장이 바뀌면 자리만 다시 셈한다', () => {
  const T = fakeThree();
  const added = [];
  let features = null;
  let exag = 50;
  const o = createFieldOutlines({
    THREE: T, parent: { add: (m) => added.push(m), remove: () => {} },
    getFeatures: () => features,
    surfR: (lat, lon, lift) => 1 + lift + exag * 1e-4,
    getExagger: () => exag,
  });
  o.tick();
  assert.equal(T.made.line, 0, '꺼져 있는데 지었다');
  o.setVisible(true);
  o.tick();
  assert.equal(T.made.line, 0, '폴리곤을 아직 못 받았는데 지었다');
  features = [poly([[0, 0], [10, 0], [10, 10], [0, 0]])];
  o.tick();
  assert.equal(T.made.line, 1);
  assert.equal(added.length, 1);
  assert.equal(added[0].visible, true);
  assert.equal(added[0].material.depthWrite, false);
  assert.equal(o.state().segments, 3);
  const attr = added[0].geometry.getAttribute('position');
  const before = attr.array[2];
  exag = 50.5; o.tick();
  assert.equal(attr.needsUpdate, false, '과장 1% 변화에 다시 셈했다 — 슬라이더를 끄는 동안 매 프레임 돈다');
  exag = 1; o.tick();
  assert.equal(attr.needsUpdate, true);
  assert.notEqual(attr.array[2], before, '과장이 바뀌었는데 자리가 그대로다 — 지형은 내려앉고 선만 떠 있다');
  assert.equal(T.made.geo, 1, '지오메트리를 다시 만들지 않는다');
  o.setVisible(false);
  assert.equal(added[0].visible, false);
});

test('main.js — 색면이 실제로 그려질 때만 윤곽선이 선다(입자만 있을 때는 바탕 지도가 그대로 보인다)', () => {
  const main = lf(readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8'));
  assert.match(main, /import \{ createFieldOutlines \} from '\.\/field-outlines\.js\?v=1';/);
  // 2026-09-20 작업 E3 ③ — '켜져 있다'와 '그려지고 있다'는 다른 말이다. 예보 범위 밖이면 색면이 안 보이는데
  // 그 위에 나라 테두리만 남겨 두지 않는다(구름을 물리는 판정과 같은 drawing 을 본다).
  assert.match(main, /fieldOutlines\.setVisible\(star === 'field' && drawing\);\s*\n\s*fieldOutlines\.tick\(\);/);
  assert.match(main, /getFeatures: \(\) => \(focus\.data && focus\.data\.features\) \|\| null/, '새로 받지 않는다 — 국가 포커스가 받아 둔 폴리곤을 쓴다');
  const mod = lf(readFileSync(new URL('../../prototype/v2-three/js/field-outlines.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(mod.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'), /\bfetch\(|^\s*import /m, '윤곽선 모듈은 아무것도 받지도 들이지도 않는다');
});
