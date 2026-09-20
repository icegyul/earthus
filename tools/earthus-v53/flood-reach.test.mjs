// 2026-09-20 작업 E1 반박 검증 — '바다에서 물이 닿나' 판(prototype/v2-three/js/flood-reach.js)의 **결과** 시험.
//
// 고친 결함: 잠기는 땅이 바다와 이어지지 않은 내륙 저지까지 칠했다. 운영 자료로 센 값은 칠해지는 688,744 km² 중
// 66.3% 가 그런 땅이었고, 전지구 뷰에서 눈에 들어오는 파란 것이 카스피 저지 하나였다.
// 여기서는 '막았다'가 아니라 **무엇이 남고 무엇이 빠지나**를 합성 지형으로 잰다(전지구 지형 자료를 시험이 받지 않는다):
//   닫힌 분지는 빠지고 해안 저지는 남나 · 해수면 아래 내륙해를 대양으로 오해하지 않나 ·
//   격자가 만든 한 칸짜리 벽은 넘고 두 칸짜리는 못 넘나(한계를 사실대로) · 경도가 감기나 ·
//   쪼개 구운 판이 한 번에 구운 판과 같나 · 셰이더와 JS 거울이 같은 자리에서 가르나.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  FLOOD_OCEAN_SEEDS, FLOOD_REACH_GROW, FLOOD_REACH_RES,
  buildOceanReach, buildOceanReachAsync, createReachGrid, fillFromOcean, growReach,
  markReachPassable, reachAt, reachInfo, reachRGBA,
} from '../../prototype/v2-three/js/flood-reach.js';
import {
  FLOOD_FRAG, FLOOD_SCENARIOS, FLOOD_YEARS, buildRiseStencil, createFloodOverlay, floodAt, floodCardInner,
  floodReachLine, floodStations, medianOf, riseAt, riseGridOf, riseMaxGridOf, stationMedians,
} from '../../prototype/v2-three/js/flood-overlay.js';
import { LAND_MASK_RES } from '../../prototype/v2-three/js/land-mask.js';

const lf = (s) => s.replace(/\r\n/g, '\n');
const AR6 = JSON.parse(lf(readFileSync(new URL('../../prototype/v2-three/sealevel/ar6.json', import.meta.url), 'utf8')));

/** 합성 지형 한 장을 상자 목록으로 짓는다 — [lat0, lat1, lon0, lon1, 고도 m]. 뒤에 오는 상자가 앞을 덮는다. */
const worldOf = (boxes, sea = -3000) => (lat, lon) => {
  let h = sea;
  for (const [a0, a1, o0, o1, v] of boxes) {
    if (lat >= a0 && lat < a1 && lon >= o0 && lon < o1) h = v;
  }
  return h;
};
const flatRise = (m) => () => m;

// ---------------------------------------------------------------- 닫힌 분지 vs 해안 저지

test('닫힌 분지는 바다에서 닿지 않고, 바다에 붙은 해안 저지는 닿는다 — 이 레이어가 존재하는 이유', () => {
  // 대륙(50 m) 안에 닫힌 분지(−20 m)가 있고, 대륙 서쪽 끝에는 바다에 붙은 저지(−1 m)가 있다.
  const heightAt = worldOf([
    [0, 40, 0, 40, 50],        // 대륙
    [15, 25, 15, 25, -20],     // 닫힌 분지 — 사해 · 카스피 저지 닮은꼴
    [5, 15, 0, 5, -1],         // 해안 저지 — 삼각주 · 간척지 닮은꼴(서쪽이 바다다)
  ]);
  const grid = buildOceanReach({ heightAt, riseAt: flatRise(0.7) }, { res: 1 });
  assert.equal(reachAt(grid, 20, 20), 0, '닫힌 분지에 바닷물이 닿는다고 말한다');
  assert.equal(reachAt(grid, 10, 2), 1, '바다에 붙은 저지가 내륙 분지로 읽힌다');
  assert.equal(reachAt(grid, 0, -140), 1, '대양은 늘 닿는다');
  assert.equal(reachAt(grid, 30, 30), 0, '50 m 대륙은 물길이 아니다');

  // floodAt 이 그 판을 그대로 쓴다 — 셰이더와 같은 차례(sea → dry → basin).
  const deps = { heightAt, landAt: (la, lo) => (heightAt(la, lo) > -100 ? 1 : 0), riseAt: flatRise(0.7), reachAt: (la, lo) => reachAt(grid, la, lo) };
  assert.equal(floodAt(deps, 20, 20).why, 'basin', '닫힌 분지는 칠하지 않는다');
  assert.equal(floodAt(deps, 20, 20).depth > 20, true, '깊이는 그대로 셈한다 — 가리는 것은 마지막 단이다');
  assert.equal(floodAt(deps, 10, 2).painted, true, '해안 저지는 칠한다');
  assert.equal(floodAt(deps, 30, 30).why, 'dry');
  // 판이 없는 세션(아직 안 구웠다)에서는 가르지 않는다 — 고친 척하지 않고 카드가 그 사실을 적는다.
  assert.equal(floodAt({ ...deps, reachAt: null }, 20, 20).painted, true);
});

test('⚠️ 씨앗을 고도로 뽑지 않는다 — 해수면 아래 내륙해(카스피 닮은꼴)가 대양이 되면 이 셈은 아무 일도 안 한다', () => {
  const heightAt = worldOf([
    [0, 60, 0, 60, 50],        // 대륙
    [15, 45, 15, 45, -5],      // 저지
    [20, 40, 20, 40, -28],     // 내륙해 — 카스피해의 수면 고도 그대로
  ]);
  const grid = buildOceanReach({ heightAt, riseAt: flatRise(0.8) }, { res: 1 });
  assert.equal(reachAt(grid, 30, 30), 0, '내륙해가 대양으로 읽혔다 — 그러면 저지 전체가 잠긴 땅이 된다');
  assert.equal(reachAt(grid, 18, 18), 0, '내륙해 둘레의 저지도 바닷물이 닿지 않는다');
  assert.equal(grid.seeded, FLOOD_OCEAN_SEEDS.length, '씨앗은 정해진 대양의 점들이다');
  // 씨앗이 어떤 좌표인지까지 못 박는다 — 고도·국가 경계에서 뽑는 순간 이 시험이 무의미해진다.
  for (const [lat, lon] of FLOOD_OCEAN_SEEDS) {
    assert.equal(Number.isFinite(lat) && Number.isFinite(lon), true);
    assert.equal(heightAt(lat, lon), -3000, `씨앗 ${lat},${lon} 은 대양이어야 한다`);
  }
});

// ---------------------------------------------------------------- 격자가 만든 벽

test('한 칸짜리 벽은 넘어 그 너머를 마저 채우고, 두 칸짜리 벽은 넘지 않는다', () => {
  // 삼각주를 바다로 잇는 물길은 28 km 보다 좁아 격자 한 칸이 통째로 벽이 된다. 그 한 칸만 넘는다.
  const oneWall = worldOf([
    [0, 20, 0, 20, 50],        // 대륙
    [5, 15, 1, 6, -1],         // 벽 뒤의 저지(벽은 경도 0~1 의 한 칸)
  ]);
  const a = buildOceanReach({ heightAt: oneWall, riseAt: flatRise(0.7) }, { res: 1 });
  assert.equal(reachAt(a, 10, 1.5), 1, '한 칸 벽을 못 넘었다');
  assert.equal(reachAt(a, 10, 5.5), 1, '넘어간 자리에서 주머니를 마저 채우지 않았다 — 부풀리기만으로는 한 칸만 산다');

  const twoWall = worldOf([
    [0, 20, 0, 20, 50],
    [5, 15, 2, 7, -1],         // 벽이 두 칸(경도 0~2)
  ]);
  const b = buildOceanReach({ heightAt: twoWall, riseAt: flatRise(0.7) }, { res: 1 });
  assert.equal(reachAt(b, 10, 3.5), 0, '두 칸 벽을 넘었다 — 56 km 다리는 진짜 문턱까지 넘는다(카타라가 터진다)');
  // 한계를 카드가 말한다.
  assert.match(floodReachLine({ reach: 'ready' }), /그보다 두꺼운 벽 뒤의 저지는 바다와 이어져 있어도 칠하지 않습니다/);

  // 부풀리기를 끄면 한 칸 벽도 못 넘는다 — 부풀리기가 실제로 일을 한다는 뜻이다(죽은 상수가 아니다).
  const none = buildOceanReach({ heightAt: oneWall, riseAt: flatRise(0.7) }, { res: 1, grow: 0 });
  assert.equal(reachAt(none, 10, 1.5), 0);
  assert.equal(FLOOD_REACH_GROW, 1, '두 칸으로 늘리면 카타라·사하라가 41칸 중 33칸으로 터진다(운영 자료 실측)');
});

test('부풀리기는 닿는 쪽으로만 틀린다 — 한 번 닿은 칸이 사라지지 않는다', () => {
  const heightAt = worldOf([[0, 40, 0, 40, 50], [5, 15, 0, 5, -1], [15, 25, 15, 25, -20]]);
  const deps = { heightAt, riseAt: flatRise(0.7) };
  const grown = buildOceanReach(deps, { res: 1 });
  const bare = buildOceanReach(deps, { res: 1, grow: 0 });
  for (let i = 0; i < bare.cells.length; i += 1) {
    if (bare.cells[i]) assert.equal(grown.cells[i], 1, `부풀렸더니 닿던 칸이 사라졌다 (${i})`);
  }
  assert.ok(grown.reached >= bare.reached);
});

// ---------------------------------------------------------------- 격자의 생김새

test('경도가 감긴다 — 날짜변경선을 건너 채운다', () => {
  // 적도의 물길 띠 한 바퀴. 경도 0~3 만 막혀 있어, 씨앗(−140°)에서 동쪽 +90° 까지 가려면 ±180° 를 건너야 한다.
  const heightAt = worldOf([[-90, 90, -180, 180, 50], [-1, 1, -180, 180, -10], [-1, 1, 0, 3, 50]]);
  const grid = buildOceanReach({ heightAt, riseAt: flatRise(0.5) }, { res: 1 });
  assert.equal(reachAt(grid, 0, -140), 1, '씨앗');
  assert.equal(reachAt(grid, 0, 179.5), 1, '날짜변경선 서쪽');
  assert.equal(reachAt(grid, 0, -179.5), 1, '날짜변경선 동쪽');
  assert.equal(reachAt(grid, 0, 90), 1, '경도가 감기지 않으면 여기에 닿을 수 없다');
  assert.equal(reachAt(grid, 40, 90), 0, '띠 밖은 닿지 않는다');
});

test('행 0 은 남쪽이다 — 육지 판(land-mask.js)과 같은 규약이어야 두 판이 같은 칸을 가리킨다', () => {
  assert.equal(FLOOD_REACH_RES, LAND_MASK_RES, '두 판의 격자가 다르면 셰이더가 같은 uv 로 다른 칸을 읽는다');
  const grid = createReachGrid(1);
  markReachPassable(grid, { heightAt: (lat) => (lat < -88 ? -10 : 50), riseAt: flatRise(0.5) });
  fillFromOcean(grid, [[-89, 0]]);
  const rgba = reachRGBA(grid);
  assert.equal(rgba.length, grid.width * grid.height * 4);
  assert.equal(rgba[0], 255, '첫 행이 남극이 아니다 — DataTexture 는 flipY 가 없다');
  assert.equal(rgba[(grid.width * (grid.height - 1)) * 4], 0, '마지막 행은 북극이다');
  assert.equal(reachAt(grid, -89.5, 0), 1);
  assert.equal(reachAt(grid, 89.5, 0), 0);
  // 판이 없거나 좌표가 수가 아니면 0 — 지어내지 않는다.
  assert.equal(reachAt(null, 0, 0), 0);
  assert.equal(reachAt(grid, NaN, 0), 0);
});

test('쪼개 구운 판이 한 번에 구운 판과 같다 — 화면을 멈추지 않으려고 쪼갠 것이지 다르게 셈한 것이 아니다', async () => {
  const heightAt = worldOf([[0, 40, 0, 40, 50], [15, 25, 15, 25, -20], [5, 15, 0, 5, -1]]);
  const deps = { heightAt, riseAt: flatRise(0.7) };
  const once = buildOceanReach(deps, { res: 2 });
  let pauses = 0;
  const split = await buildOceanReachAsync(deps, {
    res: 2, budgetMs: 0, now: () => 0, pause: () => { pauses += 1; return Promise.resolve(); },
  });
  assert.ok(pauses > 1, '쉬지 않았다 — 폰에서 화면이 멈춘다');
  assert.deepEqual([...split.cells], [...once.cells]);
  assert.equal(split.reached, once.reached);
});

test('상승폭이 클수록 물길이 넓어진다 — 최대 상승폭으로 한 번만 굽는 근거(단조성)', () => {
  // 문턱(0.5 m)을 사이에 둔 주머니. 상승폭 0.3 m 면 막히고 0.9 m 면 열린다.
  const heightAt = worldOf([[0, 20, 0, 20, 50], [5, 15, 0, 1, 0.5], [5, 15, 1, 6, -1]]);
  const low = buildOceanReach({ heightAt, riseAt: flatRise(0.3) }, { res: 1, grow: 0 });
  const high = buildOceanReach({ heightAt, riseAt: flatRise(0.9) }, { res: 1, grow: 0 });
  assert.equal(reachAt(low, 10, 3.5), 0);
  assert.equal(reachAt(high, 10, 3.5), 1);
  // 그래서 **최대 상승폭**으로 굽는다: 최대에서 닿지 않는 칸은 어느 시나리오에서도 닿지 않는다.
  const st = floodStations(AR6.items);
  const sten = buildRiseStencil(st);
  const maxGrid = riseMaxGridOf(sten, st);
  for (const sc of FLOOD_SCENARIOS) {
    for (const y of FLOOD_YEARS) {
      const v = stationMedians(st, sc.id, y);
      const g = riseGridOf(sten, v, medianOf(v));
      for (let i = 0; i < g.values.length; i += 1) {
        assert.ok(maxGrid.values[i] >= g.values[i] - 1e-9, `${sc.id} ${y} 칸 ${i} 이 최대보다 크다`);
      }
    }
  }
  // ⚠️ 그렇다고 'SSP5-8.5 · 2150년 한 장'으로 대신할 수는 없다. 운영 자료에서 그 한 장과 같은 칸은 94.9% 뿐이다 —
  // 땅이 솟는 곳(스칸디나비아 · 알래스카)에서는 배출이 클수록 상대 해수면이 더 내려가 다른 칸이 최대가 된다.
  const last = stationMedians(st, 'ssp585', '2150');
  const gLast = riseGridOf(sten, last, medianOf(last));
  let same = 0;
  for (let i = 0; i < gLast.values.length; i += 1) if (Math.abs(maxGrid.values[i] - gLast.values[i]) < 1e-9) same += 1;
  const pct = same / gLast.values.length;
  assert.ok(pct > 0.9, `대부분의 칸은 가장 센 시나리오가 최대다 — ${(pct * 100).toFixed(1)}%`);
  assert.ok(pct < 1, '한 장으로 대신할 수 있다면 칸마다 최대를 셀 이유가 없다');
});

// ---------------------------------------------------------------- 셰이더 · 겹면

test('셰이더가 같은 자리에서 가른다 — fwidth 뒤 · uniform 이름과 차례까지', () => {
  const src = lf(FLOOD_FRAG);
  assert.match(src, /uniform sampler2D uReach;/);
  assert.match(src, /uniform float uHasReach;/);
  const cut = 'if (uHasReach > 0.5 && texture2D(uReach, suv).r < 0.5) discard;';
  assert.ok(src.includes(cut), '셰이더가 내륙 저지를 가르지 않는다');
  const atGrad = src.indexOf('float grad = fwidth(sub);');
  assert.ok(atGrad > 0 && atGrad < src.indexOf(cut), 'fwidth 가 discard 뒤로 갔다 — 버려진 이웃의 도함수는 정의되지 않는다');
  // 판이 없으면 가르지 않는다(uniform 분기) — JS 거울과 같은 규칙이다.
  assert.match(src, /uHasReach > 0\.5 &&/);
});

test('겹면이 판을 굽고 셰이더에 물린다 — 다 굽기 전과 뒤의 카드가 다르다', async () => {
  const heightAt = worldOf([[0, 40, 0, 40, 50], [15, 25, 15, 25, -20], [5, 15, 0, 5, -1]]);
  const terrain = {
    uHeightMap: { value: { isTexture: true } }, uHasHeight: { value: 1 }, uExagger: { value: 50 },
    uDetailMap: { value: null }, uDetailRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uHasDetail: { value: 0 }, uDetailAmt: { value: 0 },
  };
  const f = createFloodOverlay(AR6, {
    terrain,
    geometry: new THREE.SphereGeometry(1, 8, 4),
    landMask: { load: () => Promise.resolve(null), texture: () => null, raster: () => null, landAt: () => 1, info: () => null },
    heightAt,
    reachOptions: { res: 2 },        // 시험은 성긴 판으로 — 성질은 같고 1,036,800칸을 돌지 않는다
  });
  assert.equal(f.uniforms.uHasReach.value, 0, '굽기 전에는 가르지 않는다');
  // 바다 도달 판은 '잠기는 땅' 색면의 고지다 — 그 색면은 **기본 켬**이라 처음부터 카드에 있다(2026-09-20 작업 E5).
  assert.match(f.cardHtml(), /바다와의 연결은 아직 가리지 않았습니다/);
  // 색면을 끄면 그 고지도 사라진다 — 화면에 없는 것을 설명하지 않는다.
  assert.equal(f.handleAction('slr-depth', { layer: 'slr' }), true);
  assert.doesNotMatch(f.cardHtml(), /바다와의 연결/, '색면이 꺼져 있는데 색면의 고지를 적는다');
  assert.equal(f.handleAction('slr-depth', { layer: 'slr' }), true);   // 다시 켠다(아래는 색면이 켜진 화면의 시험이다)
  await f.reachReady();
  assert.equal(f.uniforms.uHasReach.value, 1);
  assert.equal(f.model().reach, 'ready');
  assert.ok(f.uniforms.uReach.value && f.uniforms.uReach.value.isTexture);
  assert.equal(f.uniforms.uReach.value.magFilter, THREE.NearestFilter, '칸 판정을 섞으면 해안 경계가 흐려진다');
  assert.match(f.cardHtml(), /바다와의 연결은 약 \d+ km 격자로만 봅니다/);
  assert.match(f.cardHtml(), /사해 · 카스피 저지 · 카타라/);
  // 판이 실제로 판정에 쓰인다 — 닫힌 분지는 'basin', 해안 저지는 칠한다.
  assert.equal(f.floodAt(20, 20, heightAt).why, 'basin');
  assert.equal(f.floodAt(10, 2, heightAt).painted, true);
  assert.equal(reachInfo(f.reachGrid()).grow, FLOOD_REACH_GROW);
  // 버릴 때 판 텍스처도 같이 간다(ShaderMaterial 이라 m.map 갈래가 못 본다).
  let gone = 0;
  f.uniforms.uReach.value.addEventListener('dispose', () => { gone += 1; });
  f.dispose();
  assert.equal(gone, 1);
});

test('부풀리기 자체 — growReach 는 지나갈 수 있나와 무관하게 이웃으로 번진다', () => {
  const grid = createReachGrid(10);           // 36×18 — 손으로 셀 수 있는 크기
  const at = (lat, lon) => (Math.floor((lat + 90) / 10) * grid.width) + Math.floor((lon + 180) / 10);
  grid.cells[at(0, 0)] = 1;
  growReach(grid, 1);
  assert.equal(grid.cells[at(0, 0)], 1);
  assert.equal(grid.cells[at(0, 10)], 1, '동쪽 이웃');
  assert.equal(grid.cells[at(10, 0)], 1, '북쪽 이웃');
  assert.equal(grid.cells[at(0, 20)], 0, '두 칸 건너는 번지지 않는다');
  assert.equal(grid.grown, 4);
});

test('카드가 판을 말한다 — 구운 뒤와 못 구운 때의 문장이 다르고 둘 다 사실이다', () => {
  // depth: true — 바다 도달 판의 고지는 '잠기는 땅' 색면을 켠 사람에게만 할 말이다(그 색면은 기본 꺼짐이다).
  const base = {
    scenario: 'ssp585', year: '2100', stations: 1016, globalMedian: 0.78, farPct: 30.5, landMask: null,
    hasHeight: true, depth: true, min: -2.38, max: 4.15, top: [], korea: [], koreaCount: 24,
    source: 'IPCC AR6', license: 'CC BY 4.0', baseline: '1995–2014',
  };
  const ready = floodCardInner({ ...base, reach: 'ready', reachInfo: { cellKm: 28, grow: 1 } });
  assert.match(ready, /대양에서 물이 닿는 칸만 칠하므로/);
  assert.match(ready, /해수면이 올라도 그곳에는 바닷물이 가지 않습니다/);
  assert.doesNotMatch(ready, /사해 · 카스피 저지\)도 칠해집니다/, '이제 칠하지 않는다');
  const waiting = floodCardInner({ ...base, reach: 'pending' });
  assert.match(waiting, /바다와의 연결은 아직 가리지 않았습니다/);
  assert.match(waiting, /함께 칠해집니다/, '아직 가리지 않는다는 사실을 숨기지 않는다');
  // '아직' 은 기다리면 된다는 뜻이다 — 영영 못 굽는 세션에 그 말을 쓰면 거짓이 된다.
  for (const st of ['failed', 'noTerrain', 'noSampler']) {
    const dead = floodCardInner({ ...base, reach: st });
    assert.match(dead, /바다와의 연결을 가리지 못했습니다/, st);
    assert.doesNotMatch(dead, /아직 가리지 않았습니다/, `${st} 는 기다려도 오지 않는다`);
    assert.match(dead, /함께 칠해져 있습니다/, st);
  }
  // 카드는 판이 든 숫자를 적는다 — 상수를 두 번 적지 않는다.
  assert.match(floodCardInner({ ...base, reach: 'ready', reachInfo: { cellKm: 222, grow: 1 } }), /약 222 km 격자/);
});
