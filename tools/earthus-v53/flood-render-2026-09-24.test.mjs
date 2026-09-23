// 2026-09-24 — 해수면 상승 '잠기는 땅'이 확대(루이지애나 · 고도 약 430 km)에서 네모 · ◎ · 좁쌀 · 계단으로 보이던 결함의 **결과** 시험.
//
// PD 폰(402×714): "창도 답답하고 표현 이상하고". 실측으로 가른 원인 넷(prototype/v2-three/js/flood-overlay.js 머리말들):
//   ① 옅은 네모 덩어리 = 지형 자료가 0 m 로 둔 **수면**(폰차트레인 호 · 브레턴 해협)이 '고도 ≥ 0 → 육지'로 읽혀 칠해졌다.
//   ② 짙은 네모 + ◎   = 국가 경계 판(1:110m) 안의 **호수 · 만 바닥**(−1 ~ −3 m)이 '가장 깊이 잠기는 땅'으로 칠해졌다.
//   ③ 흰 좁쌀 · 계단 테 = 수면과 물가를 GPU 겹선형으로 섞은 가짜 저지 띠 + 텍셀마다 도는 흰 테.
//   ④ 톱니 가장자리   = 0.25° 바다 도달 판 칸의 계단.
// "안 그린다"만 보면 아무것도 안 그리는 레이어가 통과한다 — 그래서 **여전히 칠해야 하는 것**(0.2 m 늪지 · 간척지 빗금)도 같이 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  FLOOD_AMBIG, FLOOD_AMBIG_KM2, FLOOD_FRAG, FLOOD_LEGEND_NOTE, FLOOD_PAINTED_KM2, FLOOD_PAINTED_PCT, FLOOD_RIM, FLOOD_RIM_FADE,
  FLOOD_WATER_EPS, FLOOD_WATER_GLSL, boxTentWeights, createFloodOverlay, floodAt, floodBandIndex, floodCardInner,
  landWaterMix, rimAlphaFor,
} from '../../prototype/v2-three/js/flood-overlay.js';
import { readFileSync } from 'node:fs';

const lf = (s) => s.replace(/\r\n/g, '\n');
const AR6 = JSON.parse(lf(readFileSync(new URL('../../prototype/v2-three/sealevel/ar6.json', import.meta.url), 'utf8')));
const code = (s) => lf(s).replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------- ① 수면은 칠하지 않는다 · 땅은 칠한다

test('① 0 m 수면(±0.1 m 안)은 판이 육지라 해도 물이다 — 0.2 m 늪지는 그대로 잠긴다', () => {
  assert.equal(FLOOD_WATER_EPS, 0.1);
  const rise = () => 1.3;
  for (const h of [0, 0.004, -0.004, 0.047, -0.09]) {
    for (const plate of [0, 1]) {
      const r = floodAt({ heightAt: () => h, landAt: () => plate, riseAt: rise, reachAt: () => 1 }, 29.7, -89.3);
      assert.equal(r.painted, false, `${h} m (판 ${plate})는 수면이다`);
      assert.equal(r.why, 'water');
    }
  }
  // 결과가 나와야 통과: 수면 문턱 밖의 낮은 땅은 여전히 칠한다(루이지애나 늪지 0.2 ~ 1.2 m).
  for (const h of [0.1, 0.2, 0.8, 1.2]) {
    const r = floodAt({ heightAt: () => h, landAt: () => 0, riseAt: rise, reachAt: () => 1 }, 29.3, -90.2);
    assert.equal(r.painted, true, `${h} m 늪지는 1.3 m 상승에서 잠긴다`);
    assert.equal(r.why, 'wet');
    assert.equal(r.band, floodBandIndex(1.3 - h));
  }
});

test('② 판이 육지인데 오늘 해수면 아래 — 칠하되 **빗금**(모름)이다 · 깊이 칸을 쓰지 않는다', () => {
  const r = floodAt({ heightAt: () => -3, landAt: () => 1, riseAt: () => 0.8, reachAt: () => 1 }, 52.5, 5.5);
  assert.equal(r.painted, true, '간척지 자리를 조용히 지우지 않는다');
  assert.equal(r.ambiguous, true);
  assert.equal(r.why, 'unknown');
  assert.equal(r.band, null, '물 밑바닥의 깊이를 잠기는 깊이로 읽히게 하지 않는다');
  // 판이 바다면 여전히 바다다.
  assert.equal(floodAt({ heightAt: () => -3, landAt: () => 0, riseAt: () => 0.8 }, 29.7, -89.0).why, 'sea');
  // 셰이더도 같은 갈래를 가진다: hgt < 0 이면 빗금 · 테 없음.
  const main = code(FLOOD_FRAG);
  assert.match(main, /if \(hgt < 0\.0\) \{[\s\S]*?hatch[\s\S]*?rim = 0\.0;/);
  assert.ok(FLOOD_AMBIG.spacingPx >= 5 && FLOOD_AMBIG.widthPx >= 1 && FLOOD_AMBIG.alpha > FLOOD_AMBIG.fill);
});

// ---------------------------------------------------------------- ③ 물가의 가짜 저지 띠 · 외톨이 텍셀

test('③ 수면과 물가를 섞지 않는다 — 0 m 수면 옆 5 m 둔덕 사이에 가짜 저지가 생기지 않는다', () => {
  // 옛 겹선형: 0 과 5 를 반씩 섞으면 2.5 m → 상승 3 m 에서 '잠긴다'. 호숫가마다 이 띠가 흰 테를 두르고 섰다.
  const w = [0.5, 0.5];
  const old = 0 * w[0] + 5 * w[1];
  assert.ok(old < 3, '전제: 옛 식은 가짜 저지를 만든다');
  const m = landWaterMix([0, 5], w);
  assert.equal(m.h, 5, '땅 고도는 땅 텍셀끼리만 섞는다');
  assert.equal(m.water, 0.5);
  // 물 몫이 절반을 넘으면 물이다 — 셰이더의 'if (hw.y >= 0.5) discard;'
  assert.equal(landWaterMix([0, 0, 0, 5], [0.25, 0.25, 0.25, 0.25]).water, 0.75);
  assert.match(code(FLOOD_FRAG), /if \(hw\.y >= 0\.5\) discard;/);
  // 문턱은 JS 상수 하나에서 온다(uniform uWaterEps).
  const f = createFloodOverlay(AR6, { geometry: new THREE.SphereGeometry(1, 8, 4), landMask: null, legend: { show() {}, release() {} } });
  assert.equal(f.uniforms.uWaterEps.value, FLOOD_WATER_EPS);
  f.dispose();
});

test('③ 디테일 창의 아홉 텍셀 거르개 — 외톨이 텍셀은 1/4, 한 텍셀 띠는 1/2 을 넘지 못한다', () => {
  for (const g of [0, 0.25, 0.5, 0.75, 0.999]) {
    const w = boxTentWeights(g);
    assert.ok(Math.abs(w[0] + w[1] + w[2] - 1) < 1e-12, '무게의 합은 1');
  }
  // 외톨이 텍셀의 최대 몫 = 가운데 무게의 제곱 = 1/4 → 물 몫 · 높이 판정에서 홀로 서지 못한다.
  const peak = Math.max(...[0, 0.25, 0.5, 0.75].map((g) => boxTentWeights(g)[1] ** 2));
  assert.equal(peak, 0.25);
  // 셰이더가 실제로 아홉 칸을 그 무게로 읽는다.
  const glsl = code(FLOOD_WATER_GLSL);
  assert.match(glsl, /vec3 wx = vec3\(\(1\.0 - g\.x\) \* 0\.5, 0\.5, g\.x \* 0\.5\);/);
  assert.match(glsl, /for \(int j = 0; j < 3; j\+\+\)/);
  // 텍셀은 정수로 되돌려 정확히 푼다(8비트 세 채널) — 문턱이 부동소수 오차와 닿지 않게.
  assert.match(glsl, /vec3 b = floor\(rgb \* 255\.0 \+ 0\.5\);/);
});

test('③ 물가의 테는 멀리서 그대로, 확대하면 옅어진다(흰 좁쌀 · ◎ 를 막는다) — 0 으로 끄지는 않는다', () => {
  assert.equal(rimAlphaFor(20000), FLOOD_RIM.alpha, '전지구에서는 옛 그대로 — 실오라기 해안 저지를 보이게 하는 선이다');
  assert.equal(rimAlphaFor(FLOOD_RIM_FADE.far), FLOOD_RIM.alpha);
  assert.ok(Math.abs(rimAlphaFor(430) - FLOOD_RIM.alpha * FLOOD_RIM_FADE.min) < 1e-12, 'PD 화면의 고도(약 430 km)에서는 가장 옅다');
  assert.ok(rimAlphaFor(430) > 0, '넓은 면의 가장자리는 확대해서도 선이 조금 남는다');
  let prev = -1;
  for (let km = 300; km <= 2000; km += 50) { const a = rimAlphaFor(km); assert.ok(a >= prev - 1e-12, `${km} km 에서 줄었다`); prev = a; }
  assert.equal(rimAlphaFor(NaN), FLOOD_RIM.alpha);
  // 겹면이 그릴 때마다 카메라 고도로 테 진하기를 고친다(지구 반지름 = 1).
  const f = createFloodOverlay(AR6, { geometry: new THREE.SphereGeometry(1, 8, 4), landMask: null, legend: { show() {}, release() {} } });
  const mesh = f.object.children.find((c) => c.isMesh);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  cam.position.set(0, 0, 1 + 430 / 6371);
  mesh.onBeforeRender({ getPixelRatio: () => 2 }, null, cam);
  assert.ok(Math.abs(f.uniforms.uRimStyle.value.y - rimAlphaFor(430)) < 1e-6);
  cam.position.set(0, 0, 1 + 20000 / 6371);
  mesh.onBeforeRender({ getPixelRatio: () => 2 }, null, cam);
  assert.equal(f.uniforms.uRimStyle.value.y, FLOOD_RIM.alpha);
  f.dispose();
});

// ---------------------------------------------------------------- 셰이더 차례 · 판

test('셰이더 차례 — fwidth 는 모든 discard 앞 · 판은 오늘 해수면 아래일 때만 읽고 네 칸을 이어 자른다', () => {
  const src = code(FLOOD_FRAG);
  const main = src.slice(src.indexOf('void main()'));
  const atGrad = main.indexOf('float grad = fwidth(sub);');
  for (const d of ['if (hw.y >= 0.5) discard;', 'if (max(plate, step(0.0, hgt)) < 0.5) discard;', 'if (sub <= 0.0) discard;']) {
    assert.ok(atGrad > 0 && atGrad < main.indexOf(d), `fwidth 가 '${d}' 뒤로 갔다`);
  }
  assert.match(main, /float plate = \(uHasLand > 0\.5 && hgt < 0\.0\) \? landPlateAt\(suv\) : 0\.0;/);
  assert.match(src, /return step\(0\.5, dot\(wv, step\(vec4\(0\.5\), pv\)\)\);/, '판을 섞은 뒤 0.5 로 자르지 않으면 경계가 흐려진다');
});

// ---------------------------------------------------------------- 넓이 · 범례 · 카드

test('다시 잰 넓이 — 수면을 빼고 251,555 km² (0.169 %) · 옛 수 279,614 가 남아 있지 않다', () => {
  assert.equal(FLOOD_PAINTED_KM2, 251555);
  assert.equal(FLOOD_PAINTED_PCT, 0.169);
  assert.notEqual(FLOOD_PAINTED_KM2, 279614);
  const card = floodCardInner({
    scenario: 'ssp585', year: '2100', stations: 1016, countries: 113, soloCountries: 40, globalMedian: 0.78, min: -1.27, max: 2.61,
    top: [], korea: [], koreaCount: 24, source: 'IPCC AR6', license: 'CC BY 4.0', baseline: '1995–2014', depth: true, hasHeight: true,
    painted: { n: 1016, lower: 0, higher: 0, verdict: 'same' },
  });
  assert.ok(card.includes('251,555 km²') && card.includes('0.169%'));
  // (2026-09-24 검토) 칠해지는 넓이의 43 % 는 빗금(물인지 땅인지 모름)이다 — 그 몫을 적지 않으면 호수 바닥까지 땅으로 단언한다.
  assert.equal(FLOOD_AMBIG_KM2, 107658);
  assert.ok(FLOOD_AMBIG_KM2 < FLOOD_PAINTED_KM2);
  assert.ok(card.includes('그중 빗금 약 107,658 km²'), '칠해지는 넓이에서 빗금 몫을 안 적는다');
  // 카드가 빼는 것(수면)과 모르는 것(빗금)을 따로 말한다.
  assert.match(card, /호수 · 만 · 연안의 수면/);
  assert.match(card, /<b>빗금<\/b>은 국가 경계 판이 육지라 하는데 고도가 오늘 해수면보다 낮은 곳/);
  assert.match(card, /빗금 = 물인지 땅인지 모름/);
});

test('범례 풀이 — 물빛 면과 빗금이 무엇인지, 무엇을 칠하지 않는지, 어디까지 보이는지를 적는다', () => {
  assert.match(FLOOD_LEGEND_NOTE.ko, /물빛 면/);
  assert.match(FLOOD_LEGEND_NOTE.ko, /빗금/);
  // (2026-09-24 정정 · 검토) 옛 두 줄 — assert.match(.., /수면\(0 m\)은 칠하지 않음/) · assert.match(.., /해안 세부는 지형 격자/).
  //   그 두 사실은 이제 **카드**가 적는다(아래에서 본다). 범례에 두면 넓은 화면의 24px 두 줄에서 잘려 음수 칸 설명까지 가렸다.
  assert.match(FLOOD_LEGEND_NOTE.ko, /무채색\(< 0\): 땅이 솟아/, '음수 칸(무채색) 설명이 범례에서 사라지면 안 된다');
  assert.match(FLOOD_LEGEND_NOTE.en, /Grey \(< 0\)/);
  assert.ok(FLOOD_LEGEND_NOTE.en.length > 40);
  // 길이 상한 — 넓은 화면 풀이 줄(index.html #field-legend · 340px · 9.5px · 24px 두 줄 · 접는 단추 없음)에 들어가야 한다.
  //   실측(2026-09-24 · build/ux-mockups/flood-rv-notefit.mjs): ko 88자 · en 122자 = 24px, en 160자 = 36px(잘림).
  assert.ok(FLOOD_LEGEND_NOTE.ko.length <= 90, `ko ${FLOOD_LEGEND_NOTE.ko.length}자 — 넓은 화면에서 잘린다`);
  assert.ok(FLOOD_LEGEND_NOTE.en.length <= 125, `en ${FLOOD_LEGEND_NOTE.en.length}자 — 넓은 화면에서 잘린다`);
  // 범례에서 뺀 두 사실은 카드에 남아 있어야 한다(사실을 화면에서 지우지 않는다).
  const card = floodCardInner({
    scenario: 'ssp585', year: '2100', stations: 1016, countries: 113, soloCountries: 40, globalMedian: 0.78, min: -1.27, max: 2.61,
    top: [], korea: [], koreaCount: 24, source: 'IPCC AR6', license: 'CC BY 4.0', baseline: '1995–2014', depth: true, hasHeight: true,
    painted: { n: 1016, lower: 0, higher: 0, verdict: 'same' },
  });
  assert.match(card, /0 m 로 둔 곳과 그 가장자리 ±0\.1 m\)은 이미 물이라 칠하지 않습니다/);
  assert.match(card, /격자 두 칸\(약 0\.5~1 km\)보다 작은 얼룩을 칠하지 않습니다/);
});
