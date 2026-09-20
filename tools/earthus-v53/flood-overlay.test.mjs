// 2026-09-20 작업 E1 — 해수면 상승 '잠기는 땅'(prototype/v2-three/js/flood-overlay.js)의 **결과** 시험.
//
// "막대기가 없다"만 시험하면 아무것도 안 그리는 레이어가 통과한다. 여기서는 무엇이 칠해지는지를 잰다:
//   합성 지형 계단에서 상승 0.7 m 가 어느 칸을 덮나 · 바다를 칠하지 않나 · 해수면보다 낮은 육지(간척지)는 칠하나 ·
//   IDW 격자가 관측소 위에서 그 값이고 먼 바다에서 전지구 중앙값인가 · 시나리오·연도를 바꾸면 잠기는 칸이 바뀌나 ·
//   셰이더가 지구 셰이더와 같은 식인가(글자 대조) · 옛 막대기가 정말 사라졌나 · 카드가 네 가지를 다 말하나.
// WebGL 은 없다 — 셰이더 식을 JS 로 옮긴 순수 함수와 셰이더 소스의 글자를 본다(field-renderer.test.mjs 선례).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  FLOOD_DEFAULT, FLOOD_FAR_KM, FLOOD_FRAG, FLOOD_IDW_K, FLOOD_LIFT, FLOOD_OPACITY, FLOOD_QUANTITY, FLOOD_RIM, FLOOD_RISE_BASE, FLOOD_RISE_RES,
  FLOOD_RISE_STEP, FLOOD_SCALE, FLOOD_SCENARIOS, FLOOD_TERRAIN_GLSL, FLOOD_VERT, FLOOD_YEARS,
  buildRiseStencil, createFloodOverlay, decodeRise, encodeRise, floodAt, floodBandIndex, floodCardInner, floodRimCoverage,
  floodStations, medianOf, riseAt, riseGridOf, riseRGBA, stationMedians, swapFloodCard,
} from '../../prototype/v2-three/js/flood-overlay.js';
import { FIELD_FRAG, FIELD_GRAD_EPS, FIELD_LIFT, FIELD_RENDER_ORDER, FIELD_VERT, lineCoverage } from '../../prototype/v2-three/js/field-renderer.js';
import { bandIndex, legendModel } from '../../prototype/v2-three/js/field-scales.js';
import { resetSharedLandMask } from '../../prototype/v2-three/js/land-mask.js';
import { CLOUD_LEVEL, cloudYieldFor } from '../../prototype/v2-three/js/cloud-yield.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');   // 이 워크트리는 CRLF 로 체크아웃된다 — 글자 대조는 LF 로 한다
const squash = (s) => lf(s).replace(/\s+/g, ' ').trim();
const read = (rel) => lf(readFileSync(here(rel), 'utf8'));
const MAIN_SRC = read('../../prototype/v2-three/js/main.js');
const LIVE_SRC = read('../../prototype/v2-three/js/live-layers.js');
const AR6 = JSON.parse(read('../../prototype/v2-three/sealevel/ar6.json'));

/** 함수 본문을 글자로 떼어 낸다(field-renderer.test.mjs 와 같은 도구). */
const bodyOf = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at >= 0, `'${head}' 를 못 찾았다`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') { depth -= 1; if (depth === 0) return squash(src.slice(at, i + 1)); }
  }
  throw new Error('닫는 중괄호 없음');
};

/** 시험용 가짜 육지 판 — 앱의 저장소와 같은 얼굴만 갖춘다(파일을 받지 않는다). */
const fakeLand = (landAt = () => 1) => ({
  load: () => Promise.resolve(null), texture: () => null, raster: () => null,
  landAt: (lat, lon) => landAt(lat, lon), info: () => null,
});
const fakeTerrain = () => ({
  uHeightMap: { value: { isTexture: true } }, uHasHeight: { value: 1 }, uExagger: { value: 50 },
  uDetailMap: { value: null }, uDetailRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uHasDetail: { value: 0 }, uDetailAmt: { value: 0 },
});

// ---------------------------------------------------------------- 판정: 무엇이 잠기나

test('합성 지형 계단(0 · 0.5 · 2 m)에서 상승 0.7 m 는 0 과 0.5 칸만 덮는다', () => {
  // 경도 한 칸마다 고도가 다른 계단. 판정은 '고도 < 상승폭' 하나다 — 과장도 색도 끼지 않는다.
  const steps = { '-10': 0, 0: 0.5, 10: 2 };
  const deps = {
    heightAt: (lat, lon) => steps[String(Math.round(lon))],
    landAt: () => 1,
    riseAt: () => 0.7,
  };
  const at = (lon) => floodAt(deps, 0, lon);
  assert.equal(at(-10).painted, true, '0 m 칸은 잠긴다');
  assert.equal(at(0).painted, true, '0.5 m 칸은 잠긴다');
  assert.equal(at(10).painted, false, '2 m 칸은 마른다');
  assert.equal(at(10).why, 'dry');
  // 깊이는 상승폭 − 고도다(값이 아니라 판정이지만, 칸을 고르는 수는 이것이다).
  assert.equal(Math.round(at(-10).depth * 100), 70);
  assert.equal(Math.round(at(0).depth * 100), 20);
  // 경계는 아래를 포함하지 않는다 — 딱 0.7 m 인 땅은 물에 닿을 뿐 잠기지 않는다(선이 서는 자리다).
  assert.equal(floodAt({ ...deps, heightAt: () => 0.7 }, 0, 0).painted, false);
  assert.equal(floodAt({ ...deps, heightAt: () => 0.699 }, 0, 0).painted, true);
});

test('바다는 칠하지 않고 해수면보다 낮은 육지(간척지)는 칠한다 — 바다 색면의 두 단을 뒤집은 판정', () => {
  const rise = () => 0.8;
  // ① 판이 바다라 하고 고도도 음수 → 바다다(이미 물이라 칠하지 않는다)
  assert.deepEqual(
    floodAt({ heightAt: () => -2196, landAt: () => 0, riseAt: rise }, 38, 132),
    { painted: false, why: 'sea', height: -2196 },
  );
  // ② 판이 육지라 하고 고도가 음수 → 간척지·저지다. 잠긴다(욕조식 근사 — 카드가 방조제를 모른다고 말한다)
  const polder = floodAt({ heightAt: () => -3, landAt: () => 1, riseAt: rise }, 52.5, 5.5);
  assert.equal(polder.painted, true);
  assert.equal(floodBandIndex(polder.depth), 2, '−3 m 땅은 3.8 m 깊이라 가장 깊은 칸이다');
  // ③ 판이 없는 세션(판정의 근거가 고도의 부호뿐) → 해수면보다 낮은 땅은 바다로 읽힌다. 지어내지 않는다.
  assert.equal(floodAt({ heightAt: () => -3, landAt: null, riseAt: rise }, 52.5, 5.5).why, 'sea');
  // ④ 판이 없어도 해수면 위 육지는 그대로 판정한다
  assert.equal(floodAt({ heightAt: () => 0.2, landAt: null, riseAt: rise }, 52.5, 5.5).painted, true);
});

test('지형을 못 받은 세션은 아무것도 칠하지 않는다 — 고도 0 을 육지로 읽으면 지구가 통째로 잠긴다', () => {
  const r = floodAt({ heightAt: () => 0, landAt: () => 1, riseAt: () => 0.8, hasHeight: false }, 0, 0);
  assert.deepEqual(r, { painted: false, why: 'noTerrain' });
  // 셰이더도 같은 자리에서 막는다(uniform 분기라 도함수와 무관하게 통째로 버린다).
  assert.match(FLOOD_FRAG, /if \(uHasHeight < 0\.5\) discard;/);
  // 카드도 그 사실을 적는다 — 고친 척하지 않는다.
  const card = floodCardInner({ ...cardModel(), hasHeight: false });
  assert.match(card, /지형 고도를 받지 못해/);
});

// ---------------------------------------------------------------- 상승폭 격자 (IDW)

const station = (id, lat, lon, v) => ({
  id, name: `S${id}`, country: 'Test', lat, lon,
  s: Object.fromEntries(FLOOD_SCENARIOS.map((sc, i) => [sc.id, Object.fromEntries(
    FLOOD_YEARS.map((y, j) => [y, [v + i + j * 10, v - 0.1, v + 0.1]]),
  )])),
});

test('IDW — 관측소 가까이는 그 값, 1,500 km 밖뿐인 칸은 전지구 중앙값', () => {
  // 관측소 둘: 적도 0°E(값 1.0)와 적도 90°E(값 3.0). 두 곳은 1만 km 떨어져 서로 섞이지 않는다.
  const st = floodStations([station(1, 0, 0, 1), station(2, 0, 90, 3)]);
  const sten = buildRiseStencil(st, { res: FLOOD_RISE_RES });
  const values = [1, 3];
  const med = medianOf(values);
  assert.equal(med, 2);
  const grid = riseGridOf(sten, values, med);
  // 관측소 바로 위 칸(0.5°E · 0.5°N — 칸 한가운데)은 그 관측소의 값이다. 반대쪽 관측소는 1,500 km 밖이라 아예 안 섞인다.
  const cellAt = (lat, lon) => grid.values[(Math.floor(lat + 90) * grid.width) + Math.floor(lon + 180)];
  assert.ok(Math.abs(cellAt(0, 0) - 1) < 1e-6, `관측소 칸은 그 값이다 — ${cellAt(0, 0)}`);
  assert.ok(Math.abs(cellAt(0, 90) - 3) < 1e-6);
  // 관측소가 1,500 km 안에 하나뿐인 칸도 그 값 그대로다(무게의 합은 늘 1).
  assert.ok(Math.abs(cellAt(5, 5) - 1) < 1e-6);
  // 두 관측소에서 다 먼 칸(남극 · 태평양 한가운데)은 전지구 중앙값이다 — 가까운 관측소를 대륙에 우기지 않는다.
  assert.equal(cellAt(-80, -150), 2);
  assert.equal(cellAt(0, -90), 2);
  assert.ok(grid.farCells > 0 && sten.nearCells > 0);
  // 1,500 km 의 경계 — 딱 안쪽 칸은 값이 오고 바깥 칸은 오지 않는다.
  const degIn = (FLOOD_FAR_KM / 6371) * (180 / Math.PI) - 1;
  assert.ok(Math.abs(cellAt(degIn, 0) - 1) < 1e-6, '1,500 km 안쪽은 관측소 값');
  assert.equal(cellAt(degIn + 3, 0), 2, '1,500 km 밖은 전지구 중앙값');
});

test('IDW — 가까운 쪽이 더 무겁고, 무게의 합은 늘 1 이라 값이 작아지지 않는다', () => {
  const st = floodStations([station(1, 0, 0, 1), station(2, 0, 6, 5)]);   // 약 667 km 떨어진 둘
  const sten = buildRiseStencil(st);
  const grid = riseGridOf(sten, [1, 5], 3);
  const cellAt = (lat, lon) => grid.values[(Math.floor(lat + 90) * grid.width) + Math.floor(lon + 180)];
  const near1 = cellAt(0, 0);
  const near2 = cellAt(0, 6);
  const mid = cellAt(0, 3);
  assert.ok(near1 < mid && mid < near2, `가운데 칸은 두 값 사이다 — ${near1} ${mid} ${near2}`);
  assert.ok(near1 < 1.5 && near2 > 4.5, '관측소 칸은 그 관측소 쪽으로 쏠린다');
  // 값 둘이 같으면 어디서나 그 값이다(무게의 합 = 1 의 결과 — 합이 1 이 아니면 여기서 값이 줄어든다).
  const flat = riseGridOf(sten, [2, 2], 2);
  for (let i = 0; i < flat.values.length; i += 1) assert.ok(Math.abs(flat.values[i] - 2) < 1e-6);
  assert.ok(sten.k === FLOOD_IDW_K);
});

test('riseAt 은 셰이더가 읽는 값 — 바이트로 구운 뒤 이중선형이고 경도로 감긴다', () => {
  const st = floodStations([station(1, 0, 179.5, 1), station(2, 0, -179.5, 1)]);
  const sten = buildRiseStencil(st);
  const grid = riseGridOf(sten, [1, 1], 1);
  // 칸 한가운데에서는 그 칸의 값(3 cm 눈금으로 구운 뒤)이다.
  assert.ok(Math.abs(riseAt(grid, 0.5, 179.5) - decodeRise(encodeRise(1))) < 1e-5);
  // ±180° 를 건너뛰어도 끊기지 않는다 — 경도는 한 바퀴 돈다(RepeatWrapping).
  assert.ok(Math.abs(riseAt(grid, 0, 179.99) - riseAt(grid, 0, -179.99)) < 1e-6, '날짜변경선에서 이어진다');
  // 극에서도 값을 낸다(ClampToEdge — 끝 행에서 멈춘다).
  assert.ok(Number.isFinite(riseAt(grid, 90, 0)) && Number.isFinite(riseAt(grid, -90, 0)));
  // 눈금은 3 cm 다 — 되돌린 값과 원래 값의 차이가 반 눈금을 넘지 않는다.
  for (const v of [-2.384, -1, 0, 0.781, 2.611, 4.152]) {
    assert.ok(Math.abs(decodeRise(encodeRise(v)) - v) <= FLOOD_RISE_STEP / 2 + 1e-9, `${v} m`);
  }
  // 운영 자료의 값이 눈금 밖으로 잘리지 않는다.
  const all = [];
  for (const sc of FLOOD_SCENARIOS) for (const y of FLOOD_YEARS) for (const it of AR6.items) all.push(it.s[sc.id][y][0]);
  assert.ok(Math.min(...all) > FLOOD_RISE_BASE, `가장 낮은 값 ${Math.min(...all)} m 가 눈금 아래로 잘린다`);
  assert.ok(Math.max(...all) < decodeRise(255), `가장 높은 값 ${Math.max(...all)} m 가 눈금 위로 잘린다`);
});

test('값 텍스처 — R 은 상승폭, G 는 관측소가 가까운 칸인가, 행 0 은 남쪽', () => {
  const st = floodStations([station(1, -80, 0, 1)]);          // 남극 가까이 하나
  const sten = buildRiseStencil(st);
  const grid = riseGridOf(sten, [1], 1);
  const rgba = riseRGBA(grid, sten);
  const px = (lat, lon) => {
    const i = (Math.floor(lat + 90) * grid.width) + Math.floor(lon + 180);
    return [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 3]];
  };
  assert.deepEqual(px(-80, 0), [encodeRise(1), 255, 255], '관측소 칸 — 값과 근접 표시');
  assert.deepEqual(px(60, 0)[1], 0, '먼 칸은 근접 표시가 0 이다');
  // 행 0 = 남쪽: 첫 행은 남극이다(land-mask.js 와 같은 규약 · DataTexture 는 flipY 가 없다).
  assert.equal(grid.height, 180);
  assert.equal(rgba.length, grid.width * grid.height * 4);
});

// ---------------------------------------------------------------- 시나리오 · 연도

const cardModel = () => {
  const st = floodStations(AR6.items);
  const values = stationMedians(st, FLOOD_DEFAULT.scenario, FLOOD_DEFAULT.year);
  return {
    scenario: FLOOD_DEFAULT.scenario, year: FLOOD_DEFAULT.year, stations: st.length,
    globalMedian: medianOf(values), farPct: 30.5, landMask: null, hasHeight: true,
    min: Math.min(...values), max: Math.max(...values),
    top: [{ name: 'A', v: 2.6, lo: 2.1, hi: 3.0 }], korea: [{ name: 'MOKPO', v: 0.98, lo: 0.72, hi: 1.34 }], koreaCount: 24,
    source: AR6.source, license: AR6.license, baseline: AR6.baseline,
  };
};

test('시나리오 4개 × 연도 3개가 자료에 다 있고, 바꾸면 잠기는 칸이 바뀐다', () => {
  const st = floodStations(AR6.items);
  assert.equal(st.length, AR6.items.length, '12칸을 다 가진 관측소만 쓴다 — 운영 자료는 1,016곳 전부다');
  assert.equal(st.length, AR6.counts.stations);
  // 단추는 자료에 있는 칸만 그린다(죽은 토글 금지).
  assert.deepEqual(FLOOD_SCENARIOS.map((s) => s.id), AR6.scenarios);
  assert.deepEqual([...FLOOD_YEARS], AR6.years.map(String));
  const sten = buildRiseStencil(st);
  const gridOf = (sc, y) => {
    const v = stationMedians(st, sc, y);
    return riseGridOf(sten, v, medianOf(v));
  };
  const lo = gridOf('ssp126', '2050');
  const hi = gridOf('ssp585', '2150');
  // 같은 합성 지형(0.5 m 평지)에서 칸이 갈린다: 저배출·2050 에는 마르고 최고배출·2150 에는 잠긴다.
  const deps = (g) => ({ heightAt: () => 0.5, landAt: () => 1, riseAt: (la, lo2) => riseAt(g, la, lo2) });
  assert.equal(floodAt(deps(lo), 37.5, 126.6).painted, false, `저배출 2050 은 ${riseAt(lo, 37.5, 126.6).toFixed(2)} m`);
  assert.equal(floodAt(deps(hi), 37.5, 126.6).painted, true, `최고배출 2150 은 ${riseAt(hi, 37.5, 126.6).toFixed(2)} m`);
  // 전지구 중앙값도 시나리오·연도를 따라 커진다(자료가 그렇게 말한다 — 우리가 지은 순서가 아니다).
  let prev = -Infinity;
  for (const y of FLOOD_YEARS) {
    const m = medianOf(stationMedians(st, 'ssp585', y));
    assert.ok(m > prev, `${y}년 중앙값 ${m}`);
    prev = m;
  }
});

test('카드는 네 가지를 다 말한다 — 욕조식 근사 · 모르는 것 · 지형 해상도 · 출처와 범위', () => {
  const card = floodCardInner(cardModel());
  assert.match(card, /욕조식 근사/);
  assert.match(card, /지금 지형에서/);
  assert.match(card, /방조제/);
  assert.match(card, /배수/);
  assert.match(card, /지반침하/);
  assert.match(card, /바다와의 연결/);
  assert.match(card, /약 10 km/);
  assert.match(card, /약 300 m/);
  // 2026-09-20 반박 검증: 카드가 화면과 반대로 말하던 두 자리. ② 는 '네덜란드 간척지가 칠해진다'고 했고
  // ③ 은 '확대하면 제자리를 찾는다'고 했는데, 실측은 둘 다 아니었다(송도 −3.1 m·판 0 → sea · 도쿄 고토구 z9 11.0 m → dry).
  assert.match(card, /간척지 · 매립지\(송도 · 새만금\)는 지형 자료가 아직 바다로 담고 있어 칠하지 않습니다/);
  assert.doesNotMatch(card, /제방 뒤의 낮은 땅도 칠해지고/, '칠해지지 않는 것을 칠해진다고 약속하지 않는다');
  assert.match(card, /건물 · 제방이 섞인 표면 고도/);
  assert.match(card, /확대해도 칠해지지 않을 수 있습니다/);
  assert.doesNotMatch(card, /확대할수록 물가의 선이 제자리를 찾습니다/, '지켜지지 않는 약속을 지운다');
  assert.match(card, /IPCC AR6/);
  assert.match(card, /1,016곳/);
  assert.match(card, /중앙값/);
  assert.match(card, /17~83% 범위/);
  assert.match(card, /1,500 km 밖/, '관측소가 먼 곳은 전지구 중앙값이라고 적는다');
  assert.match(card, /타임라인/, '5일 예보와 잇지 않았다고 적는다');
  // 지시서: 기관 시나리오 전망과 우리 셈의 주인을 가른다 · 욕조식 물채움을 '시뮬레이션'이라 부르지 않는다.
  assert.match(card, /기관 전망/);
  assert.match(card, /EARTHUS 의 셈/);
  assert.doesNotMatch(card, /시뮬레이션/);
  assert.doesNotMatch(card, /예측합니다|예상됩니다/);
  // 육지 판정의 고지는 **이 화면의 방향**으로 말한다 — 바다 색면의 문장('바다에만 칠합니다')을 돌려 쓰면 카드가 반대로 말한다.
  assert.match(card, /육지에만 칠합니다|국가 경계 판을 받지 못해/);
  assert.doesNotMatch(card, /바다에만 칠합니다/);
  const withPlate = floodCardInner({ ...cardModel(), landMask: { erodeKm: 28, source: 'Natural Earth admin 0 countries', resolution: { global: '1:110m', KOR: '1:10m', PRK: '1:10m', JPN: '1:10m' } } });
  assert.match(withPlate, /육지에만 칠합니다/);
  assert.match(withPlate, /28 km 물려/, '판을 얼마나 물렸는지는 판 자신이 들고 온 숫자다');
  assert.match(withPlate, /1:110m/);
  assert.match(floodCardInner({ ...cardModel(), landMask: null }), /국가 경계 판을 받지 못해/, '판이 없으면 그 사실을 적는다');
  // 옛 막대기의 말이 남아 있지 않다.
  assert.doesNotMatch(card, /기둥/);
  // 단추 12칸이 다 있고 지금 고른 것만 눌린 모양이다.
  for (const s of FLOOD_SCENARIOS) assert.ok(card.includes(`data-ssp="${s.id}"`), s.id);
  for (const y of FLOOD_YEARS) assert.ok(card.includes(`data-year="${y}"`), y);
  const onNow = card.match(/data-ssp="ssp585"[^>]*aria-pressed="true"/);
  assert.ok(onNow, '기본은 SSP5-8.5 다');
  assert.ok(/data-year="2100"[^>]*aria-pressed="true"/.test(card), '기본은 2100년이다');
  assert.equal((card.match(/aria-pressed="true"/g) || []).length, 2, '시나리오 하나 · 연도 하나만 눌려 있다');
  // 범례는 칠하는 칸만 말한다 + 물가의 테. (글자는 HTML 로 나가므로 '<' 가 &lt; 다 — 카드가 태그를 지어내지 않는다는 뜻이기도 하다.)
  const escLabel = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const c of legendModel(FLOOD_SCALE)) assert.ok(card.includes(escLabel(c.label)), c.label);
  assert.match(card, /물가/);
});

test('카드 갈아 끼우기 — 떠 있는 글 안에서 이 카드만 바뀐다', () => {
  const body = `<div class="card">앞</div>${'<div data-slr-card="slr">옛 글</div><!--/slr-card-->'}<div class="card">뒤</div>`;
  const out = swapFloodCard(body, '새 글');
  assert.ok(out.includes('새 글') && !out.includes('옛 글'));
  assert.ok(out.includes('앞') && out.includes('뒤'), '남의 카드는 건드리지 않는다');
  assert.equal(swapFloodCard('<div>남의 카드</div>', '새 글'), '<div>남의 카드</div>');
});

// ---------------------------------------------------------------- 색 · 테

test('깊이 3단 — 깊을수록 어둡고 이웃 칸이 확실히 구별된다', () => {
  const lab = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    const r = f((n >> 16) & 255); const g = f((n >> 8) & 255); const b = f(n & 255);
    const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    const X = t((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const Y = t(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const Z = t((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return { L: 116 * Y - 16, a: 500 * (X - Y), b: 200 * (Y - Z) };
  };
  const cols = FLOOD_SCALE.colors.map(lab);
  assert.equal(cols.length, 3, '2~3단으로만 — 값이 아니라 판정이다');
  for (let i = 1; i < cols.length; i += 1) {
    assert.ok(cols[i - 1].L - cols[i].L >= 10, `깊을수록 어둡다 (${i})`);
    const de = Math.hypot(cols[i - 1].L - cols[i].L, cols[i - 1].a - cols[i].a, cols[i - 1].b - cols[i].b);
    assert.ok(de >= 15, `이웃 칸 색차 ${de.toFixed(1)}`);
  }
  // 물가의 테는 가장 옅은 물빛보다도 밝다 — 전지구 줌에서 이 선이 그림의 주인공이다.
  const rim = lab(`#${FLOOD_RIM.color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`);
  assert.ok(rim.L > cols[0].L + 8, `테 L* ${rim.L.toFixed(1)} vs 물빛 ${cols[0].L.toFixed(1)}`);
  // 셰이더가 고르는 칸 = 표의 칸(field-scales 의 구간 규칙 그대로 — 아래 경계 포함).
  for (const d of [0, 0.49, 0.5, 1.99, 2, 40]) assert.equal(floodBandIndex(d), bandIndex(FLOOD_SCALE, d), `깊이 ${d}`);
  // 색면보다 옅다 — 이것은 값이 아니라 덮개라 지형의 결이 비쳐야 한다.
  assert.ok(FLOOD_OPACITY > 0 && FLOOD_OPACITY < 0.8);
});

test('물가의 테는 색면의 등치선과 같은 함수다 — 평평한 곳에서는 긋지 않는다', () => {
  for (const sub of [-1, 0, 0.001, 0.05, 0.4, 3]) {
    for (const grad of [0, 1e-9, 0.002, 0.05, 1]) {
      for (const w of [1, 1.6, 3.2]) {
        assert.equal(floodRimCoverage(sub, grad, w), lineCoverage(sub, grad, w), `${sub}/${grad}/${w}`);
      }
    }
  }
  assert.equal(floodRimCoverage(0.01, FIELD_GRAD_EPS, 1.6), 0, '고원 가드 — 기울기가 없으면 면이 통째로 하얘진다');
  assert.equal(floodRimCoverage(-0.01, 0.02, 1.6), 0, '마른 땅 쪽에는 서지 않는다');
  assert.ok(floodRimCoverage(0.02, 0.02, 1.6) > 0, '물가 안쪽에는 선다');
});

// ---------------------------------------------------------------- 셰이더 글자

test('지형 GLSL 은 main.js 의 것과 같은 글자다 — 색면이 읽는 전역맵에 디테일 창 세 함수를 더한 것이다', () => {
  const mine = lf(FLOOD_TERRAIN_GLSL);
  for (const head of [
    'float decodeHeight(vec3 rgb)', 'vec2 mercatorUV(float lon, float lat)', 'float displacementHeight(float lon, float lat)',
    'float detailFade(vec2 uv)', 'float sampleHeight(vec2 uv)', 'float heightAt(float lon, float lat)',
  ]) {
    assert.equal(bodyOf(mine, head), bodyOf(MAIN_SRC, head), head);
  }
  // 판정의 고도는 **디테일 창까지 읽는 것**이다 — 카드가 말하는 '확대하면 약 300 m'(z9)가 이 한 줄이다.
  assert.match(FLOOD_FRAG, /float hgt = heightAt\(lon, lat\);/);
  assert.match(MAIN_SRC, /전역 z4 \+ 지역 z5~z9/, 'main.js 가 말하는 지형 해상도가 바뀌면 카드의 고지도 같이 고쳐야 한다');
  // 정점은 색면과 **같은 것**이다 — 베낀 사본이 아니라 그 값 자체다.
  assert.equal(FLOOD_VERT, FIELD_VERT);
});

test('⚠️ 과장(uExagger)은 고도 비교에 섞이지 않는다 — 50× 에서 0.7 m 가 35 m 가 되면 잠기는 땅이 50배가 된다', () => {
  // 주석은 떼고 본다 — 머리말은 '과장을 섞지 않는다'고 말해야 하고, 코드에는 그 이름이 없어야 한다.
  const main = bodyOf(lf(FLOOD_FRAG).replace(/\/\/[^\n]*/g, ''), 'void main()');
  assert.ok(!main.includes('uExagger'), '프래그먼트의 판정에 과장이 들어갔다');
  // 과장은 정점을 올리는 데에만 쓰인다(지구와 평행한 면을 만드는 일).
  assert.match(lf(FLOOD_VERT), /float disp = max\(h, 0\.0\) \/ 6371000\.0 \* uExagger;/);
  // JS 거울도 과장을 모른다 — 인수에 없다.
  assert.ok(!/uExagger|exagger/i.test(floodAt.toString()));
});

test('물가의 테 — 셰이더의 lineCover 는 색면의 것과 같은 글자이고 fwidth 는 discard 앞에서 잰다', () => {
  const head = 'float lineCover(float below, float grad, float widthPx)';
  assert.equal(bodyOf(lf(FLOOD_FRAG), head), bodyOf(lf(FIELD_FRAG), head));
  // ⚠️ 버려진 이웃 픽셀의 도함수는 정의되지 않는다 — 물가의 테가 바로 그 경계에 서므로 순서가 결과를 바꾼다.
  const src = lf(FLOOD_FRAG);
  const atGrad = src.indexOf('float grad = fwidth(sub);');
  const atDiscard = src.indexOf('if (max(plate, step(0.0, hgt)) < 0.5) discard;');
  assert.ok(atGrad > 0 && atDiscard > 0 && atGrad < atDiscard, 'fwidth 가 discard 뒤로 갔다');
});

test('셰이더 글자 — GLSL ES 예약어를 이름으로 쓰지 않았고 괄호가 맞는다(화면 없이 잡을 수 있는 컴파일 오류)', () => {
  const RESERVED = ['half', 'sample', 'input', 'output', 'filter', 'common', 'active', 'partition', 'fixed', 'unsigned', 'superp',
    'long', 'short', 'double', 'class', 'union', 'enum', 'typedef', 'template', 'this', 'goto', 'inline', 'noinline', 'public',
    'static', 'extern', 'external', 'interface', 'sizeof', 'cast', 'namespace', 'using', 'asm', 'resource', 'patch', 'subroutine',
    'coherent', 'volatile', 'restrict', 'readonly', 'writeonly', 'atomic_uint', 'noperspective', 'packed', 'centroid', 'flat', 'smooth',
    'hvec2', 'hvec3', 'hvec4', 'fvec2', 'fvec3', 'fvec4', 'dvec2', 'dvec3', 'dvec4', 'texture'];
  for (const [name, src] of [['FLOOD_VERT', FLOOD_VERT], ['FLOOD_FRAG', FLOOD_FRAG]]) {
    const code = lf(src).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const words = new Set(code.match(/[A-Za-z_]\w*/g));
    for (const w of RESERVED) assert.ok(!words.has(w), `${name}: '${w}' 는 GLSL ES 3.00 의 예약어다`);
    for (const [open, close] of [['(', ')'], ['{', '}'], ['[', ']']]) {
      assert.equal(code.split(open).length, code.split(close).length, `${name}: ${open}${close} 짝이 안 맞는다`);
    }
    assert.ok(!/[^\x00-\x7f]/.test(code), `${name}: 주석 밖에 ASCII 가 아닌 글자가 있다 — shaderSource 가 거부한다`);
  }
  // 두 단계가 같이 쓰는 이름은 같은 형이어야 링크된다.
  assert.match(lf(FLOOD_VERT), /varying vec3 vUnit;/);
  assert.match(lf(FLOOD_FRAG), /varying vec3 vUnit;/);
  assert.match(lf(FLOOD_FRAG), /uniform sampler2D uHeightMap;\s+uniform float uHasHeight;/);
  // PI 는 한 번만 선언된다 — 두 번 선언하면 컴파일이 통째로 떨어진다.
  assert.equal((lf(FLOOD_FRAG).match(/const float PI/g) || []).length, 1);
  assert.match(lf(FLOOD_FRAG), /precision highp float;/);
});

// ---------------------------------------------------------------- 끝에서 끝까지

test('막대기가 사라졌다 — buildSlr 이 내놓는 것에 LineSegments 도 Points 도 없다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  // 앱이 색면에 주는 것과 같은 묶음(main.js provideField) — 지구의 uniform 과 지오메트리를 그대로 물린다.
  const terrain = fakeTerrain();
  const geometry = new THREE.SphereGeometry(1, 8, 4);
  let disposed = 0;
  geometry.dispose = () => { disposed += 1; };
  const cards = [];
  ll.provideField({ terrain, geometry, landMask: fakeLand(), onCard: (swap) => cards.push(swap('<div data-slr-card="slr">옛</div><!--/slr-card-->')) });
  const built = await ll.buildFromData('slr', AR6);
  let bars = 0;
  let dots = 0;
  let meshes = 0;
  built.obj.traverse((c) => {
    if (c.isLineSegments) bars += 1;
    if (c.isPoints) dots += 1;
    if (c.isMesh) meshes += 1;
  });
  assert.equal(bars, 0, '수직 막대기가 남아 있다');
  assert.equal(dots, 0, '관측소 점이 남아 있다');
  assert.equal(meshes, 1, '잠기는 땅은 면 하나다');
  // 지구의 지오메트리·uniform 을 같이 쓴다(정점이 같아야 지형과 평행하다).
  const mesh = built.obj.children[0];
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material.uniforms.uExagger, terrain.uExagger, '같은 객체 — 과장이 바뀌면 저절로 따라간다');
  assert.equal(mesh.material.uniforms.uHeightMap, terrain.uHeightMap);
  assert.equal(mesh.material.uniforms.uDetailMap, terrain.uDetailMap, '디테일 창도 같은 객체다 — 확대하면 300 m 로 읽는다');
  // 띄우는 높이는 색면보다 낮다 — 물가의 선이 곧 답이라 비스듬히 볼 때의 시차가 그대로 거짓말이 된다.
  assert.equal(mesh.material.uniforms.uLift.value, FLOOD_LIFT);
  assert.ok(FLOOD_LIFT > 0 && FLOOD_LIFT < FIELD_LIFT, `${FLOOD_LIFT} vs 색면 ${FIELD_LIFT}`);
  assert.ok(FLOOD_LIFT * 6371 > 1, '전지구 뷰의 깊이 눈금(약 0.32 km)보다 한참 위여야 지구와 겹쳐 깜빡이지 않는다');
  assert.equal(mesh.renderOrder, FIELD_RENDER_ORDER);
  assert.equal(mesh.userData.keepGeometry, true, '남의 지오메트리라는 표 — live-layers.disposeObj 가 이것을 본다');
  // 카드·메뉴 글은 읽을 때마다 지금 것이다(단추를 누른 뒤 다시 열어도 맞는다).
  assert.equal(built.meta.badge, 'MODEL_SIGNAL');
  assert.match(built.meta.note, /SSP5-8\.5 · 2100년/);
  assert.match(built.meta.cardHtml, /잠기는 땅/);
  // 단추는 **장면에 선 겹면**을 잡는다 — 레이어에 달리기 전에는 잡을 것이 없다(늦게 온 옛 build 가 못 건드리는 이유).
  assert.equal(ll.slrAction('slr-scenario', { layer: 'slr', ssp: 'ssp126' }), false, '켜지지 않은 겹면은 단추가 잡지 않는다');
  ll.layers.slr = { on: true, obj: built.obj, data: AR6, meta: built.meta };
  assert.equal(ll.slrAction('slr-scenario', { layer: 'slr', ssp: 'ssp126' }), true);
  assert.match(built.meta.note, /SSP1-2\.6/, '단추를 누르면 메뉴 한 줄도 같이 바뀐다');
  assert.match(built.meta.cardHtml, /SSP1-2\.6 · 2100년/);
  assert.ok(cards.length >= 1 && /SSP1-2\.6/.test(cards[cards.length - 1]), '떠 있는 카드의 원본 글도 같이 바뀐다');
  assert.equal(ll.slrAction('slr-year', { layer: 'slr', year: '1999' }), false, '자료에 없는 연도는 받지 않는다');
  // keepGeometry 표 덕분에 켜는 중에 껐을 때 지구가 사라지지 않는다.
  ll.disposeObj(built.obj);
  assert.equal(disposed, 0, '지구의 지오메트리를 버렸다 — 화면이 통째로 사라진다');
});

// 2026-09-20 반박 검증(결함 ①): 지은 겹면을 인스턴스 한 칸(this._flood)에 들고 새로 지을 때 먼저 dispose() 했다.
// dispose() 는 group.parent.remove(group) 까지 하므로 **늦게 온 옛 build 가 지금 화면에 선 겹면을 장면에서 빼** 버렸다.
// 메뉴는 켜졌다 하고 카드는 값을 멀쩡히 말하는데 지구에는 아무것도 없고, l.obj 가 있으니 껐다 켜도 안 돌아왔다(새로고침해야 했다).
test('켜는 중에 한 번 껐다 다시 켜도 겹면은 장면에 남는다 — 늦게 온 옛 build 는 제 것만 버린다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  ll.provideField({ terrain: fakeTerrain(), geometry: new THREE.SphereGeometry(1, 8, 4), landMask: fakeLand() });
  // 느린 망 흉내 — 응답 차례를 손으로 연다(첫 요청 2.5초 · 세 번째 0.2초를 순서로만 재현한다).
  const gate = [];
  ll.build = (id) => new Promise((resolve) => { gate.push(() => resolve(ll.buildFromData(id, AR6))); });

  const first = ll.toggle('slr');                       // ① 켠다 — 받는 중
  assert.equal(gate.length, 1);
  assert.deepEqual(await ll.toggle('slr'), { on: false });   // ② 받는 중에 끈다
  const third = ll.toggle('slr');                       // ③ 다시 켠다
  assert.equal(gate.length, 2);
  gate[1]();                                            // 세 번째가 먼저 돌아온다
  assert.equal((await third).on, true);
  const live = ll.layers.slr.obj;
  assert.equal(live.parent, ll.group, '켠 겹면이 장면에 섰다');

  gate[0]();                                            // 첫 요청이 늦게 돌아온다
  assert.deepEqual(await first, { on: false }, '취소된 build 는 레이어를 켜지 않는다');
  const meshes = [];
  ll.group.traverse((c) => { if (c.isMesh) meshes.push(c); });
  assert.equal(meshes.length, 1, '늦게 온 옛 build 가 화면의 겹면을 장면에서 빼 갔다');
  assert.equal(ll.layers.slr.obj, live);
  assert.equal(live.parent, ll.group);
  assert.equal(live.children[0].material.uniforms.uRise.value.image.data.length > 0, true, '살아 있는 겹면의 값 텍스처가 버려졌다');

  // 단추와 카드는 '장면에 선 겹면'을 잡는다 — 마지막에 지어진 것이 아니라.
  assert.equal(ll.floodOverlay(), live.userData.flood);
  assert.equal(ll.slrAction('slr-year', { layer: 'slr', year: '2050' }), true);
  assert.equal(live.userData.flood.state.year, '2050');
  assert.match(ll.layers.slr.meta.cardHtml, /· 2050년/, '카드도 같은 겹면을 말한다');

  // 껐다 켜면 그대로 돌아온다(장면에서 빠진 겹면의 visible 만 뒤집는 일이 없다).
  assert.deepEqual(await ll.toggle('slr'), { on: false });
  assert.equal(live.visible, false);
  assert.equal((await ll.toggle('slr')).on, true);
  assert.equal(live.visible, true);
  assert.equal(live.parent, ll.group);
});

test('버리는 자리에서 값 텍스처와 색 표가 같이 정리된다 — ShaderMaterial 이라 m.map 갈래가 못 본다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  ll.provideField({ terrain: fakeTerrain(), geometry: new THREE.SphereGeometry(1, 8, 4), landMask: fakeLand() });
  const built = await ll.buildFromData('slr', AR6);
  const u = built.obj.children[0].material.uniforms;
  const bye = [];
  for (const [name, tex] of [['uRise', u.uRise.value], ['uPalette', u.uPalette.value]]) {
    tex.addEventListener('dispose', () => bye.push(name));
  }
  ll.disposeObj(built.obj);
  assert.deepEqual(bye.sort(), ['uPalette', 'uRise'], '끌 때마다 1° 값 텍스처와 색 표가 쌓인다');
});

test('잠기는 땅도 색면과 같은 주인공 대접을 받는다 — 켜면 구름이 물러난다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  ll.provideField({ terrain: fakeTerrain(), geometry: new THREE.SphereGeometry(1, 8, 4), landMask: fakeLand() });
  assert.equal(ll.starLayer(), null);
  const built = await ll.buildFromData('slr', AR6);
  ll.layers.slr = { on: true, obj: built.obj, data: AR6, meta: built.meta };
  assert.equal(ll.starLayer(), 'field', '구름 0.92 가 그대로 남으면 물가의 1.6 px 테는 보이지 않는다');
  // ⚠️ starLayer 하나로는 부족하다(2026-09-20 합치기에서 실측). 작업 E3 ③ 이후 main.js 는 **그려지고 있나**(starField().drawing)
  //    까지 보고 구름을 민다 — 색면 표 밖의 겹면이 그 사실을 말하지 않으면 구름은 0.92 그대로다.
  const sf = ll.starField();
  assert.equal(sf.id, 'slr');
  assert.equal(sf.drawing, true, '지형을 받은 세션인데 안 그려지고 있다고 말한다 — 구름이 안 물러난다');
  // ⚠️ 같은 것인가(===)로 견주지 않는다 — live-layers 는 './flood-overlay.js?v=1' 로 들여서 node 에서는 모듈이 두 벌이다.
  //    정작 중요한 것은 **읽을 때마다 같은 객체가 나오는가**다(cloudYield.read 가 그것으로 글자를 다시 지을지 가른다).
  assert.deepEqual(sf.quantity, FLOOD_QUANTITY, "이름이 없으면 화면에 '색면 색면을 보는 동안…'이라고 적힌다");
  assert.equal(ll.starField().quantity, sf.quantity, '매 프레임 새 객체를 내면 구름 글자를 매 프레임 다시 짓는다');
  // 그 값들을 그대로 구름 규칙에 넣으면 구름이 꺼진다(main.js starLayers.tick 이 하는 일과 같은 셈).
  const say = cloudYieldFor({ star: ll.starLayer(), drawing: sf.drawing, quantity: sf.quantity, cloudsOn: true });
  assert.equal(say.level, CLOUD_LEVEL.OFF);
  assert.match(say.note, /잠기는 땅/, '무엇 때문에 구름을 숨겼는지 화면이 말한다');
  // 지형을 못 받은 세션은 셰이더가 전부 discard 한다 — 그때까지 구름을 끄면 맨 지구만 남는다.
  built.obj.userData.flood.uniforms.uHasHeight.value = 0;
  assert.equal(ll.starField().drawing, false);
  assert.equal(cloudYieldFor({ star: 'field', drawing: false, cloudsOn: true }).level, CLOUD_LEVEL.FULL);
  built.obj.userData.flood.uniforms.uHasHeight.value = 1;
  ll.layers.slr.on = false;
  assert.equal(ll.starLayer(), null, '끄면 구름이 제자리로 돌아온다');
  assert.equal(ll.starField(), null, '꺼도 obj 는 남는다 — 켜짐을 같이 보지 않으면 구름이 계속 물러나 있다');
});

test('live-layers 와 main.js 의 배선 — 옛 막대기 코드가 없고 다시 짓는 길이 막혀 있다', () => {
  // 옛 buildSlr 의 재료(1.2 m 상한 색 정규화 · 기둥 높이)가 남아 있지 않다.
  assert.doesNotMatch(LIVE_SRC, /_slrItems|_slrMean|_slrMax/, '옛 막대기의 상태가 남아 있다');
  assert.ok(LIVE_SRC.includes('createFloodOverlay(d,'), 'buildSlr 이 잠기는 땅을 짓지 않는다');
  assert.ok(LIVE_SRC.includes("case 'slr': { const obj = this.buildSlr(data); return { obj, data, meta: this.metaSlr(obj) }; }"), '레이어 id 는 그대로고, 카드는 지은 그 겹면을 받는다');
  assert.ok(LIVE_SRC.includes("case 'slr': return fetch('./sealevel/ar6.json'"), '자료 주소는 그대로다');
  // 과장 슬라이더가 이 레이어를 다시 짓지 않는다(1° IDW 격자를 슬라이더 한 칸마다 다시 구우면 폰이 멈춘다).
  assert.match(LIVE_SRC, /if \(id === 'slr'\) continue;/);
  // 지구의 지오메트리를 같이 쓰는 면을 지우지 않는다 — 두 버리는 길(disposeObj · disposeDeep)에 같은 가드가 있다.
  assert.equal((LIVE_SRC.match(/userData && \w+\.userData\.keepGeometry\)\) \w+\.geometry\.dispose\(\);/g) || []).length, 2,
    'disposeDeep 에 가드가 없으면 onExaggerChanged 의 한 줄만 지구를 지키고 있다');
  // 카드의 단추가 실제로 이어져 있다.
  assert.match(MAIN_SRC, /action\.startsWith\('slr-'\)\) \{ liveLayers\.slrAction\(action, ds\);/);
  // 메뉴 이름에 '2100' 이 남아 있지 않다 — 카드에 2050 · 2100 · 2150 단추가 있고 2100 은 기본값일 뿐이다(세 자리).
  const SHELL_SRC = read('../../prototype/v2-three/js/ui-shell.js');
  const I18N_SRC = read('../../prototype/v2-three/js/i18n.js');
  assert.match(SHELL_SRC, /\{ id: 'slr', name: '해수면 상승 — 잠기는 땅 \(전 세계\)'/);
  assert.match(MAIN_SRC, /'ocean\/slr': \['slr', '해수면 상승 — 잠기는 땅'\]/);
  assert.match(I18N_SRC, /slr: 'Sea level rise — land below the line \(worldwide\)'/);
  // 타임라인(시간 버스)을 구독하지 않는다 — 2100년 전망은 5일 예보가 아니다.
  const flood = read('../../prototype/v2-three/js/flood-overlay.js');
  assert.ok(!/time-bus/.test(flood), '시간 버스를 구독하면 전망이 예보로 읽힌다');
  assert.ok(!/prototype\/js\//.test(flood), 'v1 모듈을 런타임에 들이지 않는다');
});
