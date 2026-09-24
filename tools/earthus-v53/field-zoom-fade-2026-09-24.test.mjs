// 2026-09-24 PD "줌을 확대하면 더 디테일한 지도가 나오던지 …" → 결정 "색 옅게+위성".
// 결과로 잠근다: 확대하면 구간색이 **옅어져야** 통과(위성 상세 창이 비친다), 지구 전체·나라 높이에서는 **범례 색 그대로여야** 통과,
// 등치선은 **옅어지지 않아야** 통과(값 경계는 계속 읽혀야 한다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';
import { FieldRenderer, FIELD_ZOOM_FADE, zoomFadeFor, FIELD_OPACITY } from '../../prototype/v2-three/js/field-renderer.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';

const src = readFileSync(new URL('../../prototype/v2-three/js/field-renderer.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('고도별 계수 — 600 km 위는 1, 150 km 아래는 0.3, 사이는 단조롭게', () => {
  assert.equal(zoomFadeFor(12742), 1, '지구 전체');
  assert.equal(zoomFadeFor(1500), 1, '대륙');
  assert.equal(zoomFadeFor(600), 1, '나라 — 경계');
  assert.equal(zoomFadeFor(127), FIELD_ZOOM_FADE.min, '가장 가까이(127 km)');
  assert.equal(zoomFadeFor(150), FIELD_ZOOM_FADE.min);
  let prev = FIELD_ZOOM_FADE.min;
  for (let k = 160; k < 600; k += 20) {
    const f = zoomFadeFor(k);
    assert.ok(f >= prev - 1e-12 && f <= 1, `${k} km → ${f}`);
    prev = f;
  }
  const mid = zoomFadeFor(300);
  assert.ok(mid > 0.5 && mid < 0.8, `300 km → ${mid.toFixed(2)}`);
});

test('이상한 고도(NaN·음수)는 색을 지우지 않는다 — NaN 은 1, 음수는 min', () => {
  assert.equal(zoomFadeFor(NaN), 1);
  assert.equal(zoomFadeFor(-5), FIELD_ZOOM_FADE.min);
});

test('셰이더 — 계수는 구간색(bandA)에만 곱하고, 등치선(line)에는 곱하지 않는다', () => {
  assert.match(src, /uniform float uZoomFade;/);
  assert.match(src, /float bandA = band\.a \* uOpacity \* uZoomFade;/);
  assert.match(src, /float outA = line \+ bandA \* \(1\.0 - line\);/, '흰 선은 그대로 얹힌다');
  assert.ok(!/line\s*\*=\s*uZoomFade|uZoomFade\s*\*\s*line/.test(src), '등치선을 옅게 하면 값 경계가 사라진다');
});

test('그리기 직전에 카메라 고도로 정한다 — 가까우면 옅게, 멀면 1 · setOpacity 와 섞이지 않는다', () => {
  const r = new FieldRenderer({ scale: scaleOf('temp'), segments: [8, 4] });
  assert.equal(r.uniforms.uZoomFade.value, 1);
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 0, 1 + 127 / 6371);
  r.mesh.onBeforeRender({ getPixelRatio: () => 2 }, null, cam);
  assert.ok(Math.abs(r.uniforms.uZoomFade.value - FIELD_ZOOM_FADE.min) < 1e-9);
  assert.equal(r.uniforms.uOpacity.value, FIELD_OPACITY, '기본 불투명도는 건드리지 않는다');
  cam.position.set(0, 0, 3);
  r.mesh.onBeforeRender({ getPixelRatio: () => 2 }, null, cam);
  assert.equal(r.uniforms.uZoomFade.value, 1);
});
