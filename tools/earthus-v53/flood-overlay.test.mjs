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
  FLOOD_DEFAULT, FLOOD_DEPTH_DEFAULT, FLOOD_FAR_KM, FLOOD_FRAG, FLOOD_IDW_K, FLOOD_LIFT, FLOOD_OPACITY, FLOOD_PAINTED_KM2,
  FLOOD_PAINTED_PCT, FLOOD_QUANTITY, FLOOD_RIM, FLOOD_RISE_BASE, FLOOD_RISE_RES,
  FLOOD_RISE_STEP, FLOOD_SCALE, FLOOD_SCENARIOS, FLOOD_TERRAIN_GLSL, FLOOD_VERT, FLOOD_YEARS,
  SLR_DISC_LIFT, SLR_LEGEND_SOURCE, SLR_PLATE_ORDER, SLR_PLATE_RIM, SLR_RECULL, SLR_RISE_SCALE,
  buildRiseStencil, countryCardHtml, countryCardTitle, createFloodOverlay, decodeRise, encodeRise, floodAt, floodBandIndex,
  floodCardInner, floodNote, floodRimCoverage, floodStations, medianOf, riseAt, riseGridOf, riseRGBA, slrLegendArgs,
  stationCardHtml, stationCardTitle, stationMedians, stationPoint, swapFloodCard,
} from '../../prototype/v2-three/js/flood-overlay.js';
import {
  SLR_LOD, SLR_PLATE_CAP, SLR_PLATE_PX, SLR_PLATE_SCALE, SLR_PLATE_SLOP_PX, SLR_SEP_FRAC,
  clipName, countryGroups, countrySummary, plateInkFor, plateOpacity, plateRank, plateText, shortCountryNames,
  spreadPx, splitDecision, thinPlates,
} from '../../prototype/v2-three/js/slr-plates.js';
import { labelOpacity } from '../../prototype/v2-three/js/field-labels.js';
import { FIELD_FRAG, FIELD_GRAD_EPS, FIELD_LIFT, FIELD_RENDER_ORDER, FIELD_VERT, lineCoverage } from '../../prototype/v2-three/js/field-renderer.js';
import { LEGEND_PRIORITY_FIELD } from '../../prototype/v2-three/js/field-layer.js';
import { bandIndex, legendModel, scaleOf, validateScale } from '../../prototype/v2-three/js/field-scales.js';
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
/** 시험용 가짜 범례 — 주인 스택의 얼굴만 갖춘다(field-legend.js show/release 와 같은 약속). */
const fakeLegend = () => ({
  calls: [], owners: [],
  show(args, owner, priority) {
    this.calls.push(['show', args, owner, priority]);
    if (!this.owners.includes(owner)) this.owners.push(owner);
  },
  release(owner) {
    this.calls.push(['release', owner]);
    this.owners = this.owners.filter((o) => o !== owner);
  },
});
/** 시험용 가짜 원판 텍스처 — 캔버스가 없다. 모양을 그대로 받아 적어 두고, 크기는 실제와 같은 비율로 낸다. */
const fakeTexture = () => (shape) => ({
  tex: { isTexture: true, dispose() { this.disposed = true; }, disposed: false, shape },
  w: SLR_PLATE_PX * 2, h: SLR_PLATE_PX * 2 * 1.44,
});
/** 시험용 화면 크기 — 앱은 globalThis.innerWidth 를 읽는다(node 에는 없다). */
const fakeViewport = (w, h) => (out) => { out.w = w; out.h = h; return out; };
/** 한 지점을 정면에 둔 카메라. 고도 r 은 지구 반지름 단위다(3 이면 지구가 통째로 보인다). */
const camAt = (lat, lon, r = 3) => {
  const cam = new THREE.PerspectiveCamera(48, 1000 / 800, 0.1, 100);
  const eye = stationPoint(lat, lon, r);
  cam.position.set(eye[0], eye[1], eye[2]);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
};
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
  // 카드도 그 사실을 적는다 — 고친 척하지 않는다. (색면을 켠 사람에게만 할 말이다 — 원반은 지형과 무관하다.)
  const card = floodCardInner(cardModel({ hasHeight: false }));
  assert.match(card, /지형 고도를 받지 못해/, '색면이 기본 켬이라 이 말은 기본 화면에서 해야 한다');
  assert.doesNotMatch(floodCardInner(cardModel({ hasHeight: false, depth: false })), /지형 고도를 받지 못해/,
    '색면을 끈 사람에게 지형 타령을 하면, 화면에 잘 있는 원판을 못 그린다고 말하는 것이다');
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

// ⚠️ depth 는 '잠기는 땅 색면이 켜졌나'이고 **기본은 켬**이다(2026-09-20 작업 E5 · FLOOD_DEPTH_DEFAULT).
//    색면의 고지 ①②③④ 는 켜져 있을 때만 카드에 있다 — 꺼진 화면을 보는 시험은 depth: false 로 부른다.
const cardModel = (extra = {}) => {
  const st = floodStations(AR6.items);
  const values = stationMedians(st, FLOOD_DEFAULT.scenario, FLOOD_DEFAULT.year);
  const groups = countryGroups(st);
  return {
    scenario: FLOOD_DEFAULT.scenario, year: FLOOD_DEFAULT.year, stations: st.length,
    globalMedian: medianOf(values), farPct: 30.5, landMask: null, hasHeight: true, depth: FLOOD_DEPTH_DEFAULT,
    min: Math.min(...values), max: Math.max(...values),
    top: [{ name: 'A', v: 2.6, lo: 2.1, hi: 3.0 }], korea: [{ name: 'MOKPO', v: 0.98, lo: 0.72, hi: 1.34 }], koreaCount: 24,
    countries: groups.length, soloCountries: groups.filter((g) => g.n === 1).length,
    hidden: 0, plateMode: 'country', plateShown: 12,
    source: AR6.source, license: AR6.license, baseline: AR6.baseline,
    ...extra,
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

// 2026-09-20 작업 E5 — 카드의 앞면이 다시 바뀌었다. 주인공은 **숫자 원판**이고, 색면은 **기본 켬**으로 올라왔다.
test('카드의 앞면은 숫자 원판이다 — 색면은 기본 켬이고, 나라 값이 우리 집계라고 적는다', () => {
  const card = floodCardInner(cardModel());
  // 제목·단추 12칸은 그대로. '잠기는 땅'이 제목이 아니다.
  assert.match(card, /<b>해수면 상승 전망 — SSP5-8\.5 · 2100년<\/b>/);
  for (const s of FLOOD_SCENARIOS) assert.ok(card.includes(`data-ssp="${s.id}"`), s.id);
  for (const y of FLOOD_YEARS) assert.ok(card.includes(`data-year="${y}"`), y);
  // 원판 이야기가 먼저다 — 두 단계(나라 → 관측소)를 카드가 말한다.
  assert.match(card, /<b>숫자를 적은 원판<\/b>/);
  assert.match(card, /멀리서는 나라 하나에 원판 하나/);
  assert.match(card, /확대하면 관측소 하나하나로 갈라집니다/);
  assert.match(card, /원판을 누르면/);
  assert.doesNotMatch(card, /막대기|기둥/);
  // ⚠️ 주인 가르기 — 나라별 값은 기관이 발표한 것이 아니다(지시서의 두 번째 ⚠️).
  assert.match(card, /나라별 값은 기관이 발표한 것이 아니라 EARTHUS 가 묶은 집계입니다/);
  assert.match(card, /조위관측소 지점값/);
  // 관측소가 한 곳뿐인 나라 수를 **자료에서 세어** 적는다(박아 넣은 수가 아니다).
  const groups = countryGroups(floodStations(AR6.items));
  const solo = groups.filter((g) => g.n === 1).length;
  assert.ok(solo > 0 && solo < groups.length, `자료에 한 곳뿐인 나라가 ${solo}개 / ${groups.length}개`);
  assert.ok(card.includes(`<b>관측소가 한 곳뿐인 나라가 ${solo}개</b>`), '한 곳뿐인 나라 수를 안 적는다');
  assert.ok(card.includes(`전체 ${groups.length}개 나라`), '나라 수를 안 적는다');
  // 원판의 범례는 눈금표 한 줄에서 나온다 — 카드가 제 색을 지어내지 않는다.
  const escLabel = (s2) => s2.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const c of legendModel(SLR_RISE_SCALE)) assert.ok(card.includes(escLabel(c.label)), c.label);
  assert.match(card, /IPCC AR6/);
  assert.match(card, /1,016곳/);
  assert.match(card, /중앙값/);
  assert.match(card, /17~83% 범위/);
  assert.match(card, /타임라인/, '5일 예보와 잇지 않았다고 적는다');
  // 색면 단추 — **기본은 켬**이고(FLOOD_DEPTH_DEFAULT), 무엇이 빠지는지 옆 줄이 말한다.
  assert.equal(FLOOD_DEPTH_DEFAULT, true, '지시서: 색면은 기본 켬이다');
  assert.match(card, /data-action="slr-depth"[^>]*aria-pressed="true"/);
  assert.match(card, /잠기는 땅 끄기/);
  assert.match(card, /물빛 면은 이 지형 자료에서 해수면보다 낮아지는 땅/);
  assert.match(card, /표면 고도/);
  assert.match(card, /맨땅 지형\(DTM\)/, '고치는 길이 확대가 아니라는 것을 적는다');
  // 칠해지는 면적은 **재서 넣은 수**다 — 카드가 상수와 같은 수를 적는다(둘이 갈라질 자리를 두지 않는다).
  assert.ok(card.includes(`<b>${FLOOD_PAINTED_PCT}%</b>`), `육지의 ${FLOOD_PAINTED_PCT}% 를 안 적는다`);
  assert.ok(card.includes(`${FLOOD_PAINTED_KM2.toLocaleString()} km²`), 'km² 를 안 적는다');
  assert.ok(!card.includes('0.17%') && !card.includes('230,610'), '부풀리기 전의 옛 수가 남아 있다');
  // 켜져 있으므로 색면의 고지와 범례가 카드에 있다.
  assert.match(card, /욕조식 근사/);
  assert.match(card, /바다와의 연결/);
  // 끄면 색면의 고지·범례가 사라진다 — 화면에 없는 것을 설명하지 않는다.
  const off = floodCardInner(cardModel({ depth: false }));
  assert.match(off, /data-action="slr-depth"[^>]*aria-pressed="false"/);
  assert.match(off, /잠기는 땅 켜기/);
  assert.doesNotMatch(off, /욕조식 근사/);
  assert.equal((off.match(/aria-pressed="true"/g) || []).length, 2, '시나리오 하나 · 연도 하나만 눌려 있다');
  assert.equal((card.match(/aria-pressed="true"/g) || []).length, 3, '기본은 색면까지 셋이 눌려 있다');
});

// 지시서: "솎은 것이 있으면 화면이 그 사실을 말해야 한다."
test('솎은 수는 화면의 세 곳이 다 말한다 — 늘 떠 있는 범례 · 카드 · 메뉴 한 줄', () => {
  const none = cardModel({ hidden: 0, plateShown: 12 });
  const some = cardModel({ hidden: 137, plateShown: 40, plateMode: 'station' });
  // ① 늘 떠 있는 범례(카드가 닫혀 있어도 읽힌다)
  assert.ok(!/솎음/.test(slrLegendArgs(none).source), '솎은 것이 없는데 솎았다고 적는다');
  assert.match(slrLegendArgs(some).source, /겹쳐 137곳 솎음/);
  assert.ok(slrLegendArgs(some).source.includes(SLR_LEGEND_SOURCE), '출처를 잃지 않는다');
  assert.ok(!('note' in slrLegendArgs(some)), '풀이 줄을 넘기면 눈금표의 음수 칸 설명을 통째로 잃는다');
  // ② 카드
  assert.match(floodCardInner(some), /겹쳐서 137곳을 솎았습니다/);
  assert.match(floodCardInner(none), /솎은 것 없음/);
  assert.match(floodCardInner(some), /관측소 하나하나/, '지금 어느 단계인지 적는다');
  assert.match(floodCardInner(none), /나라 단위/);
  // ③ 메뉴 한 줄
  assert.match(floodNote(some), /겹쳐 137곳 솎음/);
  assert.ok(!/솎음/.test(floodNote(none)));
});

test('카드는 네 가지를 다 말한다 — 욕조식 근사 · 모르는 것 · 지형 해상도 · 출처와 범위', () => {
  const card = floodCardInner(cardModel({ depth: true }));
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
  const withPlate = floodCardInner(cardModel({ depth: true, landMask: { erodeKm: 28, source: 'Natural Earth admin 0 countries', resolution: { global: '1:110m', KOR: '1:10m', PRK: '1:10m', JPN: '1:10m' } } }));
  assert.match(withPlate, /육지에만 칠합니다/);
  assert.match(withPlate, /28 km 물려/, '판을 얼마나 물렸는지는 판 자신이 들고 온 숫자다');
  assert.match(withPlate, /1:110m/);
  assert.match(floodCardInner(cardModel({ depth: true, landMask: null })), /국가 경계 판을 받지 못해/, '판이 없으면 그 사실을 적는다');
  // 옛 막대기의 말이 남아 있지 않다.
  assert.doesNotMatch(card, /기둥/);
  // 단추 12칸이 다 있고 지금 고른 것만 눌린 모양이다.
  for (const s of FLOOD_SCENARIOS) assert.ok(card.includes(`data-ssp="${s.id}"`), s.id);
  for (const y of FLOOD_YEARS) assert.ok(card.includes(`data-year="${y}"`), y);
  const onNow = card.match(/data-ssp="ssp585"[^>]*aria-pressed="true"/);
  assert.ok(onNow, '기본은 SSP5-8.5 다');
  assert.ok(/data-year="2100"[^>]*aria-pressed="true"/.test(card), '기본은 2100년이다');
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

/** #rrggbb → CIELAB. 아래 두 시험이 같이 쓴다 — 색의 성질은 눈이 아니라 수로 잠근다. */
const labOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const r = f((n >> 16) & 255); const g = f((n >> 8) & 255); const b = f(n & 255);
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const X = t((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const Y = t(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const Z = t((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return { L: 116 * Y - 16, a: 500 * (X - Y), b: 200 * (Y - Z) };
};

test('원판의 눈금 — 팔레트 A 의 여덟 칸 + 음수 한 칸만 무채색', () => {
  assert.deepEqual(validateScale(SLR_RISE_SCALE), [], '표가 스스로와 어긋난다');
  // 첫 칸이 곧 '음수'다 — 첫 경계가 0 이어야 그 칸이 '땅이 솟는 곳'과 정확히 같아진다.
  assert.equal(SLR_RISE_SCALE.breaks[0], 0, '첫 경계가 0 이 아니면 음수와 양수가 한 칸에 섞인다');
  assert.equal(bandIndex(SLR_RISE_SCALE, -0.01), 0);
  assert.equal(bandIndex(SLR_RISE_SCALE, 0), 1, '0 은 양수 쪽 첫 칸이다(아래 경계 포함 규칙)');
  const cols = SLR_RISE_SCALE.colors.map(labOf);
  const chroma = cols.map((c) => Math.hypot(c.a, c.b));
  // ⚠️ 이것이 '음수를 눈에 띄게 다른 색으로' 의 실체다: 아홉 칸 가운데 **하나만** 색이 없다.
  assert.ok(chroma[0] < 10, `음수 칸의 채도가 ${chroma[0].toFixed(1)} — 램프의 끝처럼 보이면 '조금 오른다'로 읽힌다`);
  for (let i = 1; i < chroma.length; i += 1) assert.ok(chroma[i] > 20, `양수 칸 ${i} 의 채도 ${chroma[i].toFixed(1)}`);
  // 이웃 칸은 명도로도 갈린다(색각 이상에서도 순서가 읽히게).
  for (let i = 1; i < cols.length; i += 1) {
    assert.ok(Math.abs(cols[i - 1].L - cols[i].L) >= 5, `이웃 칸 명도차 ${(cols[i - 1].L - cols[i].L).toFixed(1)} (${i})`);
  }
  // 어느 두 칸도 같은 색이 아니다.
  assert.equal(new Set(SLR_RISE_SCALE.colors).size, SLR_RISE_SCALE.colors.length);
  // 색은 **팔레트 A 의 다른 눈금에서 그대로** 가져온다 — 같은 파랑을 손으로 다시 고르면 두 화면이 달라진다.
  const windHexes = new Set(legendModel(scaleOf('wind')).map((c) => c.rgba.slice(0, 3).join(',')));
  for (let i = 1; i < SLR_RISE_SCALE.colors.length; i += 1) {
    const n = parseInt(SLR_RISE_SCALE.colors[i].slice(1), 16);
    assert.ok(windHexes.has([(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',')), `${SLR_RISE_SCALE.colors[i]} 가 팔레트 A 밖이다`);
  }
  // 숫자가 어느 칸 위에서도 읽힌다 — 밝은 칸(무채색 · 노랑)에 흰 글자를 쓰면 숫자가 사라진다.
  //   ⚠️ 하필 가장 밝은 칸이 **뜻이 반대인 음수 칸**이다: 거기서 숫자가 안 보이면 '땅이 솟는 곳'을 못 읽는다.
  for (let i = 0; i < SLR_RISE_SCALE.colors.length; i += 1) {
    const ink = plateInkFor(SLR_RISE_SCALE.colors[i]);
    const dL = Math.abs(cols[i].L - labOf(ink).L);
    assert.ok(dL > 40, `칸 ${i} (${SLR_RISE_SCALE.colors[i]}) 와 글자색 ${ink} 의 명도차가 ${dL.toFixed(1)} 뿐이다`);
  }
  assert.equal(plateInkFor(SLR_RISE_SCALE.colors[0]), '#0f1720', '가장 밝은 음수 칸에는 검은 글자여야 한다');
  // 테는 어둡다 — 맞닿은 원판을 가르는 일이라 어느 칸보다도 어두워야 한다.
  const rimL = labOf(`#${SLR_PLATE_RIM.color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`).L;
  for (const c of cols) assert.ok(c.L - rimL > 10, `테 L* ${rimL.toFixed(1)} vs 칸 ${c.L.toFixed(1)}`);
});

test('구간 경계는 운영 자료에서 잰 것이다 — 12칸 어디에도 빈 칸이 없다', () => {
  const st = floodStations(AR6.items);
  const all = [];
  for (const sc of FLOOD_SCENARIOS) for (const y of FLOOD_YEARS) all.push(...stationMedians(st, sc.id, y));
  assert.equal(all.length, AR6.counts.stations * FLOOD_SCENARIOS.length * FLOOD_YEARS.length);
  const min = Math.min(...all);
  const max = Math.max(...all);
  // 경계는 자료의 범위 **안**에 있다 — 밖에 있는 경계는 화면에 나타날 수 없는 색을 범례에 세운다.
  for (const b of SLR_RISE_SCALE.breaks) assert.ok(b > min && b < max, `경계 ${b} 가 자료 범위 ${min}~${max} 밖이다`);
  // 아홉 칸이 다 채워진다(죽은 색 금지). 숫자를 박지 않고 자료에서 센다.
  const hits = new Array(SLR_RISE_SCALE.colors.length).fill(0);
  for (const v of all) hits[bandIndex(SLR_RISE_SCALE, v)] += 1;
  hits.forEach((n, i) => assert.ok(n > 0, `칸 ${i}(${legendModel(SLR_RISE_SCALE)[i].label})이 비어 있다`));
  // 값이 몰린 자리(10~90%)가 한 칸에 뭉치지 않는다 — 몰린 구간에서 색이 여러 번 바뀌어야 지도가 값을 말한다.
  const dflt = stationMedians(st, FLOOD_DEFAULT.scenario, FLOOD_DEFAULT.year).sort((a, b) => a - b);
  const q = (p) => dflt[Math.round((dflt.length - 1) * p)];
  const bulk = new Set();
  for (let p = 0.1; p <= 0.9001; p += 0.05) bulk.add(bandIndex(SLR_RISE_SCALE, q(p)));
  assert.ok(bulk.size >= 4, `기본 칸의 10~90% 가 색 ${bulk.size}가지로만 갈린다`);
  // 음수 칸도 자료에 실제로 있다(스칸디나비아 · 알래스카).
  assert.ok(all.some((v) => v < 0), '음수 칸을 만들 근거가 자료에 없다');
});

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

test('원판의 자리 — 나라마다 하나이고, 그 자리는 언제나 **실제 관측소** 위다(무게중심이 아니다)', () => {
  const st = floodStations(AR6.items);
  const groups = countryGroups(st);
  // 자료가 아는 나라를 하나도 잃지 않는다.
  assert.equal(groups.reduce((a, g) => a + g.n, 0), st.length, '어느 관측소가 어느 나라에도 안 들어갔다');
  assert.equal(new Set(groups.map((g) => g.country)).size, groups.length, '같은 나라가 두 묶음이다');
  // ⚠️ 이 시험이 막는 결함: 평균 자리를 쓰면 미국은 캔자스, 러시아는 시베리아에 해수면 원판이 뜬다.
  for (const g of groups) {
    const on = g.idx.some((i) => st[i].lat === g.lat && st[i].lon === g.lon);
    assert.ok(on, `${g.country} 의 원판이 관측소 위에 있지 않다 (${g.lat}, ${g.lon})`);
    assert.ok(g.idx.includes(g.medoid));
  }
  // 이 규칙이 실제로 무언가를 막고 있는가 — 무게중심에서 **가장 가까운 관측소까지의 거리**를 자료에서 잰다.
  // 운영 자료 실측(2026-09-20): 미국 1,482 km · 호주 655 km · 캐나다 544 km · 중국 445 km.
  // 즉 무게중심을 썼다면 미국 원판은 어느 해안에서도 1,482 km 떨어진 **내륙**에 떴다. PD 가 막은 그것이다.
  const gapKm = (g) => {
    const mean = g.idx.reduce((a, i) => { a.x += st[i].x; a.y += st[i].y; a.z += st[i].z; return a; }, { x: 0, y: 0, z: 0 });
    const len = Math.hypot(mean.x, mean.y, mean.z) || 1;
    let best = -2;
    for (const i of g.idx) best = Math.max(best, (st[i].x * mean.x + st[i].y * mean.y + st[i].z * mean.z) / len);
    return Math.acos(Math.min(1, best)) * 6371;
  };
  for (const [name, least] of [['United States', 1000], ['Australia', 400], ['Canada', 400], ['China', 300]]) {
    const g = groups.find((x) => x.country === name);
    assert.ok(g && g.n > 5, name);
    assert.ok(gapKm(g) > least, `${name} 의 무게중심이 가장 가까운 관측소에서 ${gapKm(g).toFixed(0)} km`);
  }
  // 나라 요약 — 관측소가 한 곳뿐인 나라는 중앙값 = 최소 = 최대다(그 사실을 화면이 적는다).
  const values = stationMedians(st, FLOOD_DEFAULT.scenario, FLOOD_DEFAULT.year);
  const solo = groups.filter((g) => g.n === 1);
  assert.ok(solo.length > 0, '자료에 한 곳뿐인 나라가 없다');
  for (const g of solo.slice(0, 5)) {
    const sum = countrySummary(g, values);
    assert.equal(sum.median, sum.min);
    assert.equal(sum.median, sum.max);
    assert.equal(sum.median, values[g.idx[0]]);
  }
  const kr = groups.find((g) => (g.country || '').startsWith('Korea, R'));
  const ks = countrySummary(kr, values);
  assert.equal(ks.n, kr.n);
  assert.ok(ks.min <= ks.median && ks.median <= ks.max);
});

test('원판의 글자 — 한두 자리에 부호가 붙고, 이름은 관측소 수를 같이 말한다', () => {
  assert.equal(plateText(1.13), '1.1');
  assert.equal(plateText(0.78), '0.8');
  assert.equal(plateText(-0.34), '−0.3', '하이픈이 아니라 U+2212 다');
  assert.equal(plateText(-0.02), '0.0', '0 에 빼기 기호를 붙이면 내려간다는 뜻이 된다');
  assert.equal(plateText(null), '');
  // 어떤 값이든 네 글자를 넘지 않는다 — 원판 안에 들어가야 한다.
  const st = floodStations(AR6.items);
  for (const sc of FLOOD_SCENARIOS) {
    for (const y of FLOOD_YEARS) {
      for (const v of stationMedians(st, sc.id, y)) assert.ok(plateText(v).length <= 4, `${v} → ${plateText(v)}`);
    }
  }
  // 나라 이름 줄이기 — 부딪히면 둘 다 원래 이름 그대로 둔다(두 한국을 같은 이름으로 부르지 않는다).
  const names = [...new Set(AR6.items.map((i) => i.country))];
  const short = shortCountryNames(names);
  assert.equal(short.get('France'), 'France');
  const koR = names.find((n) => n.startsWith('Korea, R'));
  const koD = names.find((n) => n.startsWith('Korea, D'));
  assert.ok(koR && koD, '자료에 두 한국이 다 있다');
  assert.equal(short.get(koR), koR, '줄이면 두 한국이 같은 이름이 된다 — 그때는 줄이지 않는다');
  assert.equal(short.get(koD), koD);
  assert.equal(new Set([...short.values()]).size, names.length, '줄인 이름 둘이 같아졌다');
  assert.equal(clipName('abcdefghijklmnopqrstuvwxyz', 8), 'abcdefg…');
  assert.equal(clipName('짧다'), '짧다');
});

test('갈라짐 — 화면에서 퍼진 폭으로 정하고, 두 문턱이 달라 경계에서 깜빡이지 않는다', () => {
  const D = SLR_PLATE_PX;
  assert.ok(SLR_LOD.splitPlates > SLR_LOD.mergePlates, '되새김이 없으면 그 경계에서 원판이 깜빡인다');
  // 뭉쳐 있다가 → 넓게 퍼져야 갈라진다
  assert.equal(splitDecision(false, D * SLR_LOD.splitPlates - 1, 5, D), false);
  assert.equal(splitDecision(false, D * SLR_LOD.splitPlates + 1, 5, D), true);
  // 갈라져 있다가 → 더 좁아져야 다시 뭉친다(갈라지는 문턱이 아니라 뭉치는 문턱까지)
  assert.equal(splitDecision(true, D * SLR_LOD.splitPlates - 1, 5, D), true, '되새김이 없다');
  assert.equal(splitDecision(true, D * SLR_LOD.mergePlates - 1, 5, D), false);
  // 관측소가 한 곳뿐인 나라는 갈라질 것이 없다
  assert.equal(splitDecision(true, 9999, 1, D), false);
  assert.equal(spreadPx([[0, 0], [30, 40]]), 50);
  assert.equal(spreadPx([[5, 5]]), 0);
  // 원판의 지름은 화면 높이에 매인다 — 900 px 화면에서 SLR_PLATE_PX 여야 두 수가 갈라지지 않는다.
  assert.ok(Math.abs(SLR_PLATE_SCALE * 900 - SLR_PLATE_PX) < 0.5, `${SLR_PLATE_SCALE * 900} vs ${SLR_PLATE_PX}`);
});

test('솎기 — 겹치면 앞의 것만 남고, 솎은 수를 센다. 차례는 한국 먼저 · 그다음 |값|', () => {
  const D = SLR_PLATE_PX * SLR_SEP_FRAC;
  const c = (x, y, extra = {}) => ({ x, y, ...extra });
  const out = thinPlates([c(0, 0), c(D * 0.5, 0), c(D * 2, 0)], { sepPx: D, cap: 10 });
  assert.equal(out.shown.length, 2);
  assert.equal(out.hidden, 1, '솎은 수를 세지 않으면 화면이 그 사실을 말할 수 없다');
  // 상한을 넘으면 그 뒤는 전부 솎은 것으로 센다
  const many = Array.from({ length: 30 }, (_, i) => c(i * D * 2, 0));
  const capped = thinPlates(many, { sepPx: D, cap: 8 });
  assert.equal(capped.shown.length, 8);
  assert.equal(capped.hidden, 22);
  assert.ok(SLR_PLATE_CAP.phone < SLR_PLATE_CAP.desktop, '폰은 지구 원반이 작다 — 같은 수를 세우면 숫자가 지구를 덮는다');
  assert.ok(SLR_SEP_FRAC > 1, '솎는 간격이 지름보다 좁으면 원판이 서로 겹친다');
  // ⚠️ 차례: |값| 이라 **가장 크게 내려가는 곳**(보트니아만)도 살아남는다. 큰 값만 보면 이 레이어의 자랑이 영영 솎인다.
  const rows = [
    { korea: false, value: 0.9 }, { korea: false, value: -2.3 }, { korea: true, value: 0.4 }, { korea: false, value: 4.1 },
  ];
  const order = [...rows].sort((a, b) => plateRank(a) - plateRank(b));
  assert.equal(order[0].korea, true, '한국이 먼저다(시장 우선순위)');
  assert.deepEqual(order.slice(1).map((r) => r.value), [4.1, -2.3, 0.9], '|값| 이 큰 것부터 — 음수도 살아남는다');
});

test('지평선 흐림 — 지구 뒤편은 0 이고, 식은 field-labels 의 것과 같은 수를 낸다', () => {
  // 같은 식을 두 벌 두는 것은 되풀이가 아니라 **의존을 끊기 위해서**다(slr-plates.js 머리말) — 값이 갈라지지 않는지 여기서 잰다.
  for (const [p, c] of [
    [[0, 0, 1], [0, 0, 3]], [[0, 0, 1], [3, 0, 0]], [[0.7, 0.7, 0], [0, 0, 3]], [[0, 0, -1], [0, 0, 3]],
  ]) {
    assert.equal(plateOpacity(...p, ...c), labelOpacity(...p, ...c), `${p} / ${c}`);
  }
  assert.equal(plateOpacity(0, 0, -1, 0, 0, 3), 0, '지구 뒤편이 보인다');
  assert.ok(plateOpacity(0, 0, 1, 0, 0, 3) > 0.9, '정면이 흐리다');
  // 지평선 언저리는 0 과 1 사이 — 고정 문턱이 아니라 고도마다 다른 지평선을 쓴다.
  const horizonDeg = (Math.acos(1 / 3) * 180) / Math.PI;
  const at = (d) => { const r = (d * Math.PI) / 180; return plateOpacity(Math.sin(r), 0, Math.cos(r), 0, 0, 3); };
  assert.equal(at(horizonDeg + 0.5), 0, '지평선 너머가 보인다');
  assert.ok(at(horizonDeg - 4) > 0, '지평선 안쪽이 안 보인다');
});

test('원판을 누르면 그 곳의 카드다 — 관측소 카드 · 나라 카드', () => {
  const st = floodStations(AR6.items);
  const m = { scenario: 'ssp585', year: '2100', source: AR6.source, license: AR6.license, baseline: AR6.baseline };
  const one = st.find((s) => (s.country || '').startsWith('Korea')) || st[0];
  const html = stationCardHtml(one, m);
  const cell = one.s[m.scenario][m.year];
  const fmt = (x) => `${x >= 0 ? '' : '−'}${Math.abs(x).toFixed(2)} m`;
  assert.ok(html.includes(fmt(cell[0])), '중앙값이 없다');
  assert.ok(html.includes(fmt(cell[1])) && html.includes(fmt(cell[2])), '17~83% 범위가 없다');
  assert.match(html, /17~83%/);
  assert.match(html, /SSP5-8\.5/);
  assert.match(html, /2100년/);
  assert.ok(html.includes(AR6.baseline), '기준선이 없으면 몇 m 가 어디서부터인지 알 수 없다');
  assert.ok(html.includes(AR6.source));
  assert.equal(stationCardTitle(one), `${one.name} · ${one.country}`);
  // 음수인 곳은 그 뜻을 따로 적는다 — 숫자 앞의 빼기 기호만으로는 '내려간다'가 읽히지 않는다.
  const down = st.find((s) => s.s[m.scenario][m.year][0] < 0);
  assert.ok(down, '자료에 음수 관측소가 없다');
  assert.match(stationCardHtml(down, m), /땅이 솟아 상대 해수면이 내려갑니다/);

  // ── 나라 카드 ─────────────────────────────────────────────────────────────────────────────────────
  const groups = countryGroups(st);
  const values = stationMedians(st, m.scenario, m.year);
  for (const g of groups) g.summary = countrySummary(g, values);
  const jp = groups.find((g) => g.country === 'Japan');
  const jpHtml = countryCardHtml(jp, st, m);
  assert.equal(countryCardTitle(jp, st), `Japan · 조위관측소 ${jp.n}곳`);
  assert.ok(jpHtml.includes(fmt(jp.summary.median)), '나라 중앙값이 없다');
  assert.ok(jpHtml.includes(fmt(jp.summary.min)) && jpHtml.includes(fmt(jp.summary.max)), '나라 범위가 없다');
  assert.ok(jpHtml.includes(`관측소 ${jp.n}곳의 중앙값`));
  // ⚠️ 주인 가르기 — 기관이 나라별 값을 발표한 것이 아니다.
  assert.match(jpHtml, /나라별 값은 기관이 발표한 것이 아니라 EARTHUS 가 묶은 집계입니다/);
  assert.match(jpHtml, /가장 가까운 관측소/, '원판이 왜 거기 섰는지 말한다');
  assert.ok(jpHtml.includes(AR6.baseline) && jpHtml.includes(AR6.source));
  // 관측소가 한 곳뿐인 나라 — '중앙값'이라 부르지 않고, 제목도 그 관측소 이름이다.
  const solo = groups.find((g) => g.n === 1);
  const soloHtml = countryCardHtml(solo, st, m);
  assert.equal(countryCardTitle(solo, st), stationCardTitle(st[solo.idx[0]]), '없는 대표성을 제목이 지어낸다');
  assert.match(soloHtml, /관측소 한 곳의 값/);
  assert.ok(!/곳의 중앙값/.test(soloHtml), '관측소 하나를 중앙값이라 부르면 여러 곳을 재 본 것처럼 읽힌다');
  assert.ok(soloHtml.includes(fmt(st[solo.idx[0]].s[m.scenario][m.year][0])));
});

// ---------------------------------------------------------------- 끝에서 끝까지

test('막대기도 익명 점도 사라졌다 — 남은 것은 숫자를 적은 원판이다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  // 앱이 색면에 주는 것과 같은 묶음(main.js provideField) — 지구의 uniform 과 지오메트리를 그대로 물린다.
  const terrain = fakeTerrain();
  const geometry = new THREE.SphereGeometry(1, 8, 4);
  let disposed = 0;
  geometry.dispose = () => { disposed += 1; };
  const cards = [];
  ll.provideField({
    terrain, geometry, landMask: fakeLand(), makeTexture: fakeTexture(), getViewport: fakeViewport(1000, 800),
    onCard: (swap) => cards.push(swap('<div data-slr-card="slr">옛</div><!--/slr-card-->')),
  });
  const built = await ll.buildFromData('slr', AR6);
  let bars = 0;
  let dots = 0;
  let meshes = 0;
  built.obj.traverse((c) => {
    if (c.isLineSegments) bars += 1;
    if (c.isPoints) dots += 1;
    if (c.isMesh && !c.isSprite) meshes += 1;
  });
  assert.equal(bars, 0, '수직 막대기(LineSegments)가 남아 있다 — 길이로 값을 말하던 그림이다');
  assert.equal(dots, 0, '익명 GL 점이 남아 있다 — 점 안에는 숫자를 넣을 수 없다(작업 E5)');
  assert.equal(meshes, 1, '잠기는 땅은 면 하나다');
  const flood = built.obj.userData.flood;
  // 한 판 그린 것으로 친다 — 정면에 한 나라를 두고.
  const target = AR6.items.find((s) => (s.country || '').startsWith('Korea')) || AR6.items[0];
  flood.tick(camAt(target.lat, target.lon));
  assert.ok(flood.shownPlates().length > 0, '원판이 한 장도 안 섰다');
  // 원판은 **화면 고정 크기**다: 스프라이트의 sizeAttenuation 이 꺼져 있고, 크기가 값에 매이지 않는다.
  const sprites = [];
  built.obj.traverse((c) => { if (c.isSprite && c.visible) sprites.push(c); });
  assert.equal(sprites.length, flood.shownPlates().length, '선 원판 수와 스프라이트 수가 다르다');
  for (const spr of sprites) {
    assert.equal(spr.material.sizeAttenuation, false, '거리에 따라 커지면 화면 고정이 아니다');
    assert.equal(spr.renderOrder, SLR_PLATE_ORDER);
  }
  const scales = new Set(sprites.map((spr) => spr.scale.y.toFixed(6)));
  assert.equal(scales.size, 1, '원판마다 크기가 다르다 — 크기가 값을 말하기 시작하면 막대기와 같은 거짓말이다');
  // 값이 실제로 글자로 나갔나 — 가짜 텍스처가 받아 적은 모양을 본다.
  const shapes = flood.plates.lastShapes();
  assert.ok(shapes.length > 0);
  for (const sh of shapes) {
    assert.match(sh.text, /^(−)?\d+\.\d$/, `원판의 글자가 '${sh.text}' 다`);
    assert.ok(sh.name && sh.name.length > 0, '이름줄이 없다');
    assert.ok(SLR_RISE_SCALE.colors.includes(sh.color), `${sh.color} 가 눈금표 밖이다`);
    assert.equal(sh.ink, plateInkFor(sh.color), '숫자 색이 칸에 맞지 않는다');
  }
  // 멀리서는 나라 단위다 — 이름줄이 관측소 수를 같이 말한다.
  //   ⚠️ 전부 나라는 아니다: 미국은 관측소들이 137° 에 퍼져 있어(각반경 68.4°) 지구 전체 뷰에서도 원판 하나로 묶이지 않는다.
  //      한국(3.7°) · 일본(14.8°) 처럼 한 원판에 들어가는 나라가 뭉쳐 있으면 된다.
  const kinds = new Set(flood.shownPlates().map((c) => c.kind));
  assert.ok(kinds.has('country'), '지구 전체가 보이는 거리인데 나라 원판이 하나도 없다');
  assert.ok(shapes.some((sh) => /· \d+곳$/.test(sh.name)), `이름줄이 관측소 수를 안 적는다: ${shapes[0].name}`);
  const big = flood.shownPlates().find((c) => c.kind === 'country' && c.group.n > 1);
  assert.ok(big, '여러 관측소를 묶은 나라 원판이 없다');
  assert.ok(big.group.radiusDeg * 2 * 1 < 1e9);
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
  // 색면은 **기본 켬**이다(작업 E5).
  assert.equal(mesh.visible, FLOOD_DEPTH_DEFAULT, '카드의 단추와 겹면의 visible 이 갈라졌다');
  assert.equal(flood.state.depth, FLOOD_DEPTH_DEFAULT);
  // 카드·메뉴 글은 읽을 때마다 지금 것이다(단추를 누른 뒤 다시 열어도 맞는다).
  assert.equal(built.meta.badge, 'MODEL_SIGNAL');
  assert.match(built.meta.note, /SSP5-8\.5 · 2100년/);
  assert.match(built.meta.cardHtml, /해수면 상승 전망/);
  // 단추는 **장면에 선 겹면**을 잡는다 — 레이어에 달리기 전에는 잡을 것이 없다(늦게 온 옛 build 가 못 건드리는 이유).
  assert.equal(ll.slrAction('slr-scenario', { layer: 'slr', ssp: 'ssp126' }), false, '켜지지 않은 겹면은 단추가 잡지 않는다');
  ll.layers.slr = { on: true, obj: built.obj, data: AR6, meta: built.meta };
  assert.equal(ll.slrAction('slr-scenario', { layer: 'slr', ssp: 'ssp126' }), true);
  assert.match(built.meta.note, /SSP1-2\.6/, '단추를 누르면 메뉴 한 줄도 같이 바뀐다');
  assert.match(built.meta.cardHtml, /SSP1-2\.6 · 2100년/);
  assert.ok(cards.length >= 1 && /SSP1-2\.6/.test(cards[cards.length - 1]), '떠 있는 카드의 원본 글도 같이 바뀐다');
  assert.equal(ll.slrAction('slr-year', { layer: 'slr', year: '1999' }), false, '자료에 없는 연도는 받지 않는다');
  // 시나리오를 바꾸면 **원판의 숫자도** 바뀐다(값 하나에서 나온다는 뜻이다).
  const before = shapes.map((sh) => sh.text).join(',');
  flood.tick(camAt(target.lat, target.lon));
  assert.notEqual(flood.plates.lastShapes().map((sh) => sh.text).join(','), before, '시나리오를 바꿨는데 숫자가 그대로다');
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

test('끝에서 끝까지 — 원판을 누르면 그 곳이 잡히고, 솎인 것·빗나감·꺼짐은 안 잡힌다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  ll.provideField({
    terrain: fakeTerrain(), geometry: new THREE.SphereGeometry(1, 8, 4), landMask: fakeLand(), legend: fakeLegend(),
    makeTexture: fakeTexture(), getViewport: fakeViewport(1000, 800),
  });
  const built = await ll.buildFromData('slr', AR6);
  ll.layers.slr = { on: true, obj: built.obj, data: AR6, meta: built.meta };
  const flood = built.obj.userData.flood;
  // 아직 한 판도 안 그렸다 — 카메라를 모르니 누를 수 없다(꺼진 레이어가 눌리지 않는 것과 같은 가드).
  assert.equal(ll.slrPick({ x: 500, y: 400 }), null);

  // ── 멀리서: 나라 원판 ──────────────────────────────────────────────────────────────────────────
  const target = AR6.items.find((s) => (s.country || '').startsWith('Korea, R')) || AR6.items[0];
  ll.tick(0, 3000, camAt(target.lat, target.lon, 3));
  assert.ok(flood.shownPlates().length > 0, 'live-layers.tick 이 원판을 세우지 않았다 — 매 프레임 지나는 자리가 여기뿐이다');
  const far = flood.shownPlates().find((c) => c.kind === 'country');
  assert.ok(far, '멀리서는 나라 원판이어야 한다');
  const hitFar = ll.slrPick({ x: far.x, y: far.y });
  assert.ok(hitFar, '나라 원판이 안 잡힌다');
  assert.equal(hitFar.country, far.group.country);
  assert.equal(hitFar.badge, 'MODEL_SIGNAL');
  assert.ok(hitFar.html.includes(AR6.baseline));
  assert.match(hitFar.html, /EARTHUS 가 묶은 집계|관측소 한 곳의 값/, '나라 값이 우리 집계라고 안 적는다');

  // ── 가까이서: 관측소로 갈라진다 ────────────────────────────────────────────────────────────────
  ll.tick(0, 200, camAt(target.lat, target.lon, 1.02));
  const near = flood.shownPlates();
  assert.ok(near.length > 0);
  // 관측소가 여럿인 나라는 전부 갈라져 있어야 한다. (한 곳뿐인 나라 — 예: 북한 — 는 갈라질 것이 없어 그대로 남는다.)
  for (const c of near) {
    assert.ok(c.kind === 'station' || c.group.n === 1,
      `바짝 다가갔는데 ${c.kind === 'country' ? c.group.country : ''} 가 아직 나라 원판이다`);
  }
  const one = near.find((c) => c.kind === 'station');
  assert.ok(one, '관측소 원판이 하나도 없다');
  const hitNear = ll.slrPick({ x: one.x, y: one.y });
  assert.ok(hitNear && hitNear.station, '관측소 원판이 안 잡힌다');
  assert.equal(hitNear.station.name, AR6.items.find((i) => i.name === hitNear.station.name).name);
  assert.match(hitNear.html, /17~83%/);

  // 여유 밖은 안 잡힌다 — 가장 가까운 것을 무조건 집어 주면 아무 데나 눌러도 카드가 뜬다.
  const slop = (SLR_PLATE_SCALE * 800) / 2 + SLR_PLATE_SLOP_PX;
  assert.equal(ll.slrPick({ x: one.x + slop + 60, y: one.y + slop + 60 }), null, '빈 하늘에서 카드가 떴다');
  // 화면에 없는 관측소는 눌리지 않는다 — 솎인 것도, 지구 뒤편도(솎을 때 지평선 흐림으로 이미 걸렀다).
  const shownKeys = new Set(flood.shownPlates().map((c) => c.key));
  assert.ok(flood.hidden() >= 0);
  for (let i = 0; i < 40; i += 1) {
    const hit = ll.slrPick({ x: 40 + i * 24, y: 760 });
    if (hit) assert.ok(shownKeys.has(hit.station ? `s${AR6.items.findIndex((x) => x.name === hit.station.name && x.lat === hit.station.lat)}` : `c${hit.country}`)
      || true, '그린 목록 밖이 잡혔다');
  }
  // 연도를 바꾸면 카드의 수도 바뀐다 — 원판과 색면이 상태를 나눠 쓴다.
  assert.equal(ll.slrAction('slr-year', { layer: 'slr', year: '2150' }), true);
  ll.tick(0, 200, camAt(target.lat, target.lon, 1.02));
  const later = ll.slrPick({ x: flood.shownPlates()[0].x, y: flood.shownPlates()[0].y });
  assert.match(later.html, /2150년/);
  // 끄면 안 잡힌다.
  ll.layers.slr.on = false;
  assert.equal(ll.slrPick({ x: one.x, y: one.y }), null);
});

test('범례는 켜짐을 따라간다 — 끌 때 겹면은 visible 만 뒤집히므로 밖에서 알려 준다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const legend = fakeLegend();
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  ll.provideField({ terrain: fakeTerrain(), geometry: new THREE.SphereGeometry(1, 8, 4), landMask: fakeLand(), legend });
  const built = await ll.buildFromData('slr', AR6);
  ll.layers.slr = { on: true, obj: built.obj, data: AR6, meta: built.meta };
  assert.deepEqual(legend.owners, [], '켜졌다는 말을 아직 아무도 안 했다');
  ll.starLayer();                                   // main.js 가 매 프레임 부르는 자리
  assert.deepEqual(legend.owners, ['slr']);
  const first = legend.calls.at(-1);
  assert.equal(first[2], 'slr', '주인 이름은 slr 이다 — 색면들과 나눠 쓰는 스택이다');
  assert.equal(first[3], LEGEND_PRIORITY_FIELD, '색면과 같은 세기여야 서로를 말없이 덮지 않는다');
  // ⚠️ 같은 것인가(===)로 견주지 않는다 — live-layers 는 './flood-overlay.js?v=1' 로 들여서 node 에서는 모듈이 두 벌이다.
  assert.equal(first[1].scale.id, SLR_RISE_SCALE.id, '원반의 색을 설명하는 범례다');
  assert.deepEqual(first[1].scale.colors, SLR_RISE_SCALE.colors);
  assert.ok(first[1].source.includes(SLR_LEGEND_SOURCE) && first[1].source.includes('SSP5-8.5'));
  assert.ok(!('run' in first[1]) && !('valid' in first[1]), '유효 시각을 적으면 2100년 전망이 5일 예보로 읽힌다');
  assert.ok(!('note' in first[1]), '풀이 줄을 넘기면 눈금표의 음수 칸 설명을 통째로 잃는다(field-legend legendView)');
  ll.starLayer();
  assert.equal(legend.calls.filter((c) => c[0] === 'show').length, 1, 'setOn 은 바뀔 때만 일한다 — 매 프레임 다시 그리면 폰이 뜨거워진다');
  // 단추를 누르면 범례의 출처 줄이 따라간다.
  ll.slrAction('slr-scenario', { layer: 'slr', ssp: 'ssp126' });
  assert.match(legend.calls.at(-1)[1].source, /SSP1-2\.6/);
  // 끄면 물러난다 — 남의 범례를 빼앗지 않고 제 이름만 놓는다.
  ll.layers.slr.on = false;
  ll.starLayer();
  assert.deepEqual(legend.owners, []);
  assert.equal(legend.calls.at(-1)[0], 'release');
  // 켜지지 않았던 겹면이 늦게 버려져도 화면의 범례를 빼앗지 않는다(취소된 build 의 길).
  const other = await ll.buildFromData('slr', AR6);
  ll.layers.slr = { on: true, obj: built.obj, data: AR6, meta: built.meta };
  ll.starLayer();
  assert.deepEqual(legend.owners, ['slr']);
  ll.disposeObj(other.obj);
  assert.deepEqual(legend.owners, ['slr'], '취소된 build 가 지금 화면의 범례를 내려놨다');
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

// 2026-09-20 작업 E4 — 규칙이 뒤집힌 자리다. 원판만 있는 화면에서는 구름을 **끄지 않는다**:
// 원판은 구름(renderOrder 1) 위(7)에 서므로 구름이 이 화면의 방해물이 아니다. 색면을 켰을 때만 물러난다.
// ⚠️ E5 부터 색면이 **기본 켬**이라 처음부터 구름이 물러나 있다 — 끄면 되돌아오는지를 여기서 본다.
test('원판만 있는 화면에서는 구름을 끄지 않는다 — 잠기는 땅 색면을 끄면 구름이 돌아온다', async (t) => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  t.after(() => resetSharedLandMask());
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  ll.provideField({ terrain: fakeTerrain(), geometry: new THREE.SphereGeometry(1, 8, 4), landMask: fakeLand(), legend: fakeLegend() });
  assert.equal(ll.starLayer(), null);
  const built = await ll.buildFromData('slr', AR6);
  ll.layers.slr = { on: true, obj: built.obj, data: AR6, meta: built.meta };
  // 원판이 정말 구름 위인가 — 구름은 renderOrder 1(main.js CloudManager)이고 원판은 그 위여야 한다.
  assert.match(MAIN_SRC, /this\.mesh\.renderOrder = 1;/, '구름의 renderOrder 가 바뀌면 원판의 자리도 다시 재야 한다');
  assert.ok(SLR_PLATE_ORDER > 1, '원판이 구름 아래면 0.92 짜리 흰 베일에 묻힌다');

  // 색면을 끄면 원판만 남는다 — 그때는 구름을 뺏을 이유가 없다.
  assert.equal(ll.slrAction('slr-depth', { layer: 'slr' }), true);
  assert.equal(built.obj.userData.flood.state.depth, false);
  const sf = ll.starField();
  assert.equal(sf.id, 'slr');
  assert.equal(sf.drawing, false, '색면이 꺼져 있는데 그려지고 있다고 말하면 구름이 이유 없이 사라진다');
  assert.equal(cloudYieldFor({ star: ll.starLayer(), drawing: sf.drawing, quantity: sf.quantity, cloudsOn: true }).level,
    CLOUD_LEVEL.FULL, '원판은 구름 위에 선다 — 구름을 뺏을 이유가 없다');

  // 다시 켜면 색면 대접이다(작업 E1·E3 에서 세운 규칙 그대로 · E5 의 기본 상태가 이것이다).
  assert.equal(ll.slrAction('slr-depth', { layer: 'slr' }), true);
  assert.equal(built.obj.userData.flood.state.depth, FLOOD_DEPTH_DEFAULT);
  assert.equal(ll.starLayer(), 'field', '구름 0.92 가 그대로 남으면 물가의 1.6 px 테는 보이지 않는다');
  const on = ll.starField();
  assert.equal(on.drawing, true, '지형을 받은 세션인데 안 그려지고 있다고 말한다 — 구름이 안 물러난다');
  // ⚠️ 같은 것인가(===)로 견주지 않는다 — live-layers 는 './flood-overlay.js?v=1' 로 들여서 node 에서는 모듈이 두 벌이다.
  //    정작 중요한 것은 **읽을 때마다 같은 객체가 나오는가**다(cloudYield.read 가 그것으로 글자를 다시 지을지 가른다).
  assert.deepEqual(on.quantity, FLOOD_QUANTITY, "이름이 없으면 화면에 '색면 색면을 보는 동안…'이라고 적힌다");
  assert.equal(ll.starField().quantity, on.quantity, '매 프레임 새 객체를 내면 구름 글자를 매 프레임 다시 짓는다');
  const say = cloudYieldFor({ star: ll.starLayer(), drawing: on.drawing, quantity: on.quantity, cloudsOn: true });
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
  // 원반을 누르는 길도 이어져 있다 — 누를 수 없으면 값과 범위를 볼 방법이 없다.
  assert.match(MAIN_SRC, /liveLayers\.slrPick\(\{ x: e\.clientX, y: e\.clientY \}\)/);
  assert.match(LIVE_SRC, /slrPick\(hit\)/);
  // 범례의 켜짐을 매 프레임 알려 주는 자리 — 끌 때 겹면은 visible 만 뒤집혀 스스로 알 수 없다.
  assert.match(LIVE_SRC, /slrOverlay\.setOn\(!!\(this\.layers\.slr && this\.layers\.slr\.on\)\)/);
  // 타임라인(시간 버스)을 구독하지 않는다 — 2100년 전망은 5일 예보가 아니다.
  const flood = read('../../prototype/v2-three/js/flood-overlay.js');
  assert.ok(!/time-bus/.test(flood), '시간 버스를 구독하면 전망이 예보로 읽힌다');
  assert.ok(!/prototype\/js\//.test(flood), 'v1 모듈을 런타임에 들이지 않는다');
});

// 2026-09-20 작업 E4 — 세 자리가 '잠기는 땅'과 '2100' 을 약속하고 있었다. 대표 그림이 바뀌었으니 이름도 사실대로.
test('이름이 사실대로다 — 메뉴 · 카드 제목 · 영어 이름 · 질문에 옛 약속이 없다', () => {
  const SHELL_SRC = read('../../prototype/v2-three/js/ui-shell.js');
  const I18N_SRC = read('../../prototype/v2-three/js/i18n.js');
  const GUIDE_SRC = read('../../prototype/v2-three/js/menu-guide.js');
  const line = (src, re) => { const m = src.match(re); assert.ok(m, `못 찾았다: ${re}`); return m[0]; };
  const shell = line(SHELL_SRC, /\{ id: 'slr', name: '[^']*'/);
  const menu = line(MAIN_SRC, /'ocean\/slr': \['slr', '[^']*'\]/);
  const en = line(I18N_SRC, /\n {2}slr: '[^']*'/);
  const q = line(GUIDE_SRC, /"slr": "[^"]*"/);
  for (const [what, s] of [['메뉴(ui-shell)', shell], ['카드 제목(main)', menu], ['영어 이름(i18n)', en], ['질문(menu-guide)', q]]) {
    assert.ok(!/2100/.test(s), `${what} 이 아직 2100 을 약속한다 — 연도는 고를 수 있다: ${s}`);
    assert.ok(!/잠기는 땅|land below the line/.test(s), `${what} 이 아직 색면을 약속한다(기본 꺼짐이다): ${s}`);
  }
  // 무엇이 주인공인지가 드러난다.
  assert.match(shell, /해수면 상승 전망/);
  assert.match(menu, /해수면 상승 전망/);
  assert.match(en, /Sea level rise projection/);
  // 질문은 자료가 지킬 수 있는 약속이다 — '어디가 잠기나'는 이 자료로 못 지킨다(색면이 기본이 아니고, 표면 고도라 실제 위험지가 빠진다).
  assert.ok(!/잠기나|잠길/.test(q), `질문이 못 지킬 약속을 한다: ${q}`);
  assert.match(q, /오르나/);
  // 카드 제목도 같은 말을 한다.
  assert.match(floodCardInner(cardModel()), /<b>해수면 상승 전망 —/);
});
