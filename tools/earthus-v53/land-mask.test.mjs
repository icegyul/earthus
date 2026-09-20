// DEV-DIRECTIVE 2026-09-20 · 작업 D3 반박 검증 — 바다 색면이 **해수면보다 낮은 육지**를 바다로 읽던 결함의 회귀 시험.
//
// 재현(검증자가 실브라우저 · 운영 JSON · Terrarium z4 로 픽셀을 읽어 보고한 자리):
//   플레볼란트 52.5N 5.5E (−3 m) → 수온 18.2 °C · 파고 2.84 m  ·  요르단 계곡 32.3N 35.55E (−217 m) → 29.4 °C
//   카라기예 43.4N 51.7E (−107 m) → 22.6 °C  ·  카스피 저지 · 사해 · 솔턴호 → 파고 0.30~1.70 m
// 원인은 한 줄이다 — 셰이더도 클릭 판독도 바다/육지를 고도의 **부호**로만 갈랐다.
//
// 금지("저지대에 색이 없어야 한다")만 보면 아무것도 안 칠하는 판이 통과한다. **결과**를 같이 잠근다:
//   · 저지대 열두 자리가 육지로 읽힌다(고침)  · 좁은 바다 스무 자리는 그대로 바다다(이 작업이 존재하는 이유를 되돌리지 않는다)
//   · 침식한 판은 늘 원판의 부분집합이다(바다는 절대 잃지 않는다 — 성질로 잠근다)
//   · 판을 읽는 칸 고르기가 셰이더의 uv 식과 **같은 칸**을 고른다(화면과 카드가 갈리지 않는 근거)
//   · 판이 없으면 옛 동작 그대로다(열린 실패) · 카드가 무엇으로 갈랐는지 사실대로 말한다
//   · 지형을 통째로 못 받은 세션에서 '칠해진 바다를 눌렀는데 육지입니다' 가 나오지 않는다
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './../v2-test-dom.mjs';

import {
  LAND_MASK_ERODE,
  LAND_MASK_RES,
  buildLandMask,
  cellCenter,
  createLandMask,
  createLandRaster,
  erodeLand,
  landAt,
  landMaskCardLine,
  landMaskRGBA,
  polygonsOf,
  rasterizeLand,
} from '../../prototype/v2-three/js/land-mask.js';

const { FIELD_DESCRIPTORS, FieldLayer } = await import('../../prototype/v2-three/js/field-layer.js');
const { GRID_SOURCES, createGridFrames } = await import('../../prototype/v2-three/js/grid-frames.js');

const COUNTRIES = JSON.parse(readFileSync(new URL('../../prototype/data/country-reference.json', import.meta.url), 'utf8'));

// 검증자가 실브라우저에서 색을 읽어 보고한 자리들 — 전부 **해수면보다 낮은 육지**이거나 대조군 육지다.
const BELOW_SEA_LAND = [
  ['플레볼란트', 52.5, 5.5], ['로테르담', 51.95, 4.5], ['스히폴', 52.31, 4.76],
  ['요르단 계곡', 32.3, 35.55], ['사해', 31.5, 35.5], ['카라기예', 43.4, 51.7],
  ['카스피 저지', 47.5, 49.0], ['솔턴호', 33.3, -115.8], ['카타라 저지', 30.0, 27.0],
  ['투르판', 42.9, 89.2], ['데스밸리', 36.25, -116.82], ['에어호', -28.4, 137.4],
];
// 이 작업이 되살린 좁은 바다 — 판이 이 자리를 먹으면 다도해·대한해협이 다시 계단으로 빈다.
const NARROW_SEA = [
  ['대한해협 서수도', 34.0, 129.0], ['다도해', 34.3, 126.3], ['서해 중부', 37.0, 125.5],
  ['세토 내해', 34.3, 133.5], ['동해', 38.0, 131.0], ['남해 여수앞', 34.5, 127.7],
  ['진해만', 35.05, 128.7], ['대마도 북쪽', 34.9, 129.4], ['제주 남쪽', 33.0, 126.5],
  ['부산 앞바다', 35.0, 129.3], ['북해(네덜란드 앞)', 52.5, 3.8], ['영불해협', 50.2, 0.5],
  ['발트해', 57, 19], ['아드리아해', 43, 15], ['페르시아만', 27, 51], ['홍해', 20, 38],
  ['지브롤터 서쪽', 36, -7], ['체서피크만', 37.5, -76.1], ['카스피해 한가운데', 42.0, 50.5],
  ['태평양', 0, -140],
];

// 운영 자료로 한 번만 굽는다(19 ms · 실측) — 아래 여러 절이 같이 본다.
const RAW = rasterizeLand(COUNTRIES.features);
const MASK = buildLandMask(COUNTRIES.features);

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  판 만들기 — 순수 계산
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

test('빈 판의 모양과 칸 한가운데 — 행 0 이 남쪽이다(DataTexture 는 flipY 가 없다)', () => {
  const r = createLandRaster(0.25);
  assert.deepEqual([r.width, r.height], [1440, 720]);
  assert.equal(r.cells.length, 1440 * 720);
  assert.equal(r.cells.reduce((a, b) => a + b, 0), 0);
  const south = cellCenter(r, 0, 0);
  const north = cellCenter(r, r.width - 1, r.height - 1);
  assert.deepEqual([south.lon, south.lat], [-179.875, -89.875]);
  assert.deepEqual([north.lon, north.lat], [179.875, 89.875]);
  assert.ok(south.lat < north.lat, '행 0 이 남쪽이 아니면 셰이더의 v = lat/π + 0.5 와 위아래가 뒤집힌다');
});

test('폴리곤 채우기 — 구멍은 비고, 채운 칸은 점 판정과 같은 답을 낸다', () => {
  // 바깥 사각형 안에 구멍 사각형 하나(짝홀 규칙).
  const outer = [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]];
  const hole = [[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]];
  const r = rasterizeLand([{ geometry: { type: 'Polygon', coordinates: [outer, hole] } }], { res: 1 });
  assert.equal(landAt(r, 0, 0), 0, '구멍이 뚫리지 않았다');
  assert.equal(landAt(r, 5, 5), 1);
  assert.equal(landAt(r, 0, 5), 1);
  assert.equal(landAt(r, 20, 0), 0, '폴리곤 밖이 육지가 됐다');
  // 칸의 한가운데로 되짚어 보면 안쪽 칸만 차 있다 — 반 칸 어긋나 있으면 여기서 걸린다.
  let filled = 0;
  for (let y = 0; y < r.height; y += 1) {
    for (let x = 0; x < r.width; x += 1) {
      if (!r.cells[y * r.width + x]) continue;
      filled += 1;
      const c = cellCenter(r, x, y);
      assert.ok(Math.abs(c.lon) < 10 && Math.abs(c.lat) < 10, `폴리곤 밖의 칸이 찼다: ${c.lat},${c.lon}`);
      assert.ok(Math.abs(c.lon) > 2 || Math.abs(c.lat) > 2, `구멍 안의 칸이 찼다: ${c.lat},${c.lon}`);
    }
  }
  assert.equal(filled, 20 * 20 - 4 * 4, '20°×20° 에서 4°×4° 구멍을 뺀 칸 수와 달라졌다');
  assert.deepEqual(polygonsOf({ geometry: { type: 'MultiPolygon', coordinates: [[outer], [hole]] } }).length, 2);
});

test('판을 읽는 칸 고르기가 셰이더의 uv 식과 같은 칸을 고른다 — 화면과 카드가 갈리지 않는 근거', () => {
  const r = createLandRaster(0.25);
  r.cells[100 * r.width + 700] = 1;                       // 한 칸만 육지로
  const c = cellCenter(r, 700, 100);
  assert.equal(landAt(r, c.lat, c.lon), 1);
  // 셰이더: u = lon/2π + 0.5 · v = lat/π + 0.5 → NearestFilter 는 floor(u×W) · floor(v×H) 칸을 고른다.
  const gpuCell = (lat, lon) => {
    const u = lon / 360 + 0.5;
    const v = lat / 180 + 0.5;
    const x = Math.min(r.width - 1, Math.max(0, Math.floor(u * r.width)));
    const y = Math.min(r.height - 1, Math.max(0, Math.floor(v * r.height)));
    return r.cells[y * r.width + x] ? 1 : 0;
  };
  for (const d of [-0.2, -0.1, 0, 0.1, 0.2]) {
    assert.equal(landAt(r, c.lat + d, c.lon + d), gpuCell(c.lat + d, c.lon + d),
      `CPU 와 GPU 가 다른 칸을 골랐다 (${c.lat + d}, ${c.lon + d})`);
  }
  // 경도는 한 바퀴 돈다(±180 이 같은 칸이다).
  assert.equal(landAt(r, 0, 180), landAt(r, 0, -180));
});

test('침식은 늘 원판의 부분집합이다 — 바다는 한 칸도 잃지 않는다', () => {
  const r = rasterizeLand([{ geometry: { type: 'Polygon', coordinates: [[[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]] } }], { res: 1 });
  const e = erodeLand(r, 1);
  for (let i = 0; i < r.cells.length; i += 1) {
    assert.ok(!(e.cells[i] && !r.cells[i]), '침식이 바다를 육지로 만들었다 — 침식은 깎기만 해야 한다');
  }
  assert.equal(landAt(e, 0, 0), 1, '속은 남아야 한다');
  assert.equal(landAt(e, 9.5, 0), 0, '가장자리 한 칸이 깎이지 않았다');
  assert.equal(landAt(r, 9.5, 0), 1);
  // 운영 자료에서도 같은 성질이다(1,036,800 칸).
  for (let i = 0; i < RAW.cells.length; i += 1) {
    if (MASK.cells[i] && !RAW.cells[i]) assert.fail(`운영 판에서 침식이 바다를 먹었다 (칸 ${i})`);
  }
  assert.ok(MASK.land < MASK.rawLand, '침식이 아무것도 깎지 않았다');
  assert.equal(MASK.erode, LAND_MASK_ERODE);
  assert.equal(MASK.erodeKm, Math.round(LAND_MASK_ERODE * LAND_MASK_RES * 111.195));
});

test('침식은 날짜변경선에서 끊기지 않고 극 행을 통째로 지우지 않는다', () => {
  // 경도를 한 바퀴 두르는 띠(남위 −1 ~ 1) — 감기지 않으면 ±180 에서 잘려 두 칸이 사라진다.
  const belt = [[-180, -2], [180, -2], [180, 2], [-180, 2], [-180, -2]];
  const r = rasterizeLand([{ geometry: { type: 'Polygon', coordinates: [belt] } }], { res: 1 });
  const e = erodeLand(r, 1);
  assert.equal(landAt(e, 0, 179.5), 1, '날짜변경선에서 띠가 끊겼다');
  assert.equal(landAt(e, 0, -179.5), 1);
  // 남극 — 판 아래 끝의 행은 '판 밖'을 같은 값으로 보므로 살아남는다.
  const cap = [[-180, -90], [180, -90], [180, -85], [-180, -85], [-180, -90]];
  const c = erodeLand(rasterizeLand([{ geometry: { type: 'Polygon', coordinates: [cap] } }], { res: 1 }), 1);
  assert.equal(landAt(c, -89.5, 0), 1, '극 행이 깎여 남극이 바다가 됐다');
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  결함 그 자체 — 운영 국가 경계로 본다
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

test('해수면보다 낮은 육지 열두 자리가 육지로 읽힌다 — 검증자가 색을 읽은 바로 그 자리', () => {
  for (const [name, lat, lon] of BELOW_SEA_LAND) {
    assert.equal(landAt(MASK, lat, lon), 1, `${name}(${lat}, ${lon}) 이 아직 바다로 읽힌다`);
  }
  // 대조군 — 해수면 위 육지는 고도 가림이 맡는다. 판이 이들을 어떻게 읽든 결과는 같다(둘 다 버린다).
  for (const [name, lat, lon] of [['서울', 37.57, 126.98], ['히말라야', 28, 86], ['사하라', 23, 10], ['아마존', -3, -60]]) {
    assert.equal(landAt(MASK, lat, lon), 1, `${name} 이 판에서 빠졌다`);
  }
});

test('좁은 바다 스무 자리는 그대로 바다다 — 판이 해안 띠를 되살리지 않는다', () => {
  for (const [name, lat, lon] of NARROW_SEA) {
    assert.equal(landAt(RAW, lat, lon), 0, `${name} 이 깎기 전 판에서 이미 육지다 — 경계 자료를 의심하라`);
    assert.equal(landAt(MASK, lat, lon), 0, `${name}(${lat}, ${lon}) 이 판에 먹혔다 — 이 작업이 존재하는 이유를 되돌린다`);
  }
  // 지구의 바다는 약 71% 다. 판이 그보다 훨씬 많이 덮으면 뭔가 새고 있다.
  assert.ok(MASK.land / MASK.total < 0.35, `판이 지구의 ${(100 * MASK.land / MASK.total).toFixed(1)}% 를 육지라고 한다`);
  assert.ok(MASK.land / MASK.total > 0.20, `판이 지구의 ${(100 * MASK.land / MASK.total).toFixed(1)}% 만 육지라고 한다 — 너무 적다`);
});

test('RGBA 와 카드 글 — 판이 없으면 없다고 말한다(고친 척하지 않는다)', () => {
  const r = createLandRaster(1);
  r.cells[0] = 1;                                          // 행 0 = 남쪽의 첫 칸
  const rgba = landMaskRGBA(r);
  assert.equal(rgba.length, r.cells.length * 4);
  assert.deepEqual([...rgba.slice(0, 4)], [255, 255, 255, 255], '셰이더가 읽는 R 이 육지에서 255 가 아니다');
  assert.deepEqual([...rgba.slice(4, 8)], [0, 0, 0, 255]);
  const withMask = landMaskCardLine({ erodeKm: 28 }, { cell: '1° 격자(약 110 km)', ko: true });
  assert.match(withMask, /바다에만 칠합니다/);
  assert.match(withMask, /28 km/);
  assert.match(withMask, /1:10m/, '경계 자료의 정밀도가 고르지 않다는 사실을 적지 않는다');
  assert.match(withMask, /1° 격자\(약 110 km\)/);
  const without = landMaskCardLine(null, { ko: true });
  assert.match(without, /지형 고도로만 가릅니다/);
  assert.match(without, /카스피 저지/, '판이 없을 때 무엇이 바다로 읽히는지 말하지 않는다');
  assert.match(landMaskCardLine(null, { ko: false }), /terrain height alone/);
});

test('저장소 — 파일은 한 번만 받고, 못 받으면 판 없이 옛 동작으로 돈다', async () => {
  let hits = 0;
  const THREE = {
    RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, NearestFilter: 1003, NoColorSpace: '', RGBAFormat: 1023,
    DataTexture: class { constructor(data, w, h, f) { Object.assign(this, { data, width: w, height: h, format: f, isDataTexture: true }); } dispose() {} },
  };
  const store = createLandMask({
    THREE,
    fetch: () => { hits += 1; return Promise.resolve({ ok: true, json: async () => COUNTRIES }); },
  });
  assert.equal(store.landAt(52.5, 5.5), null, '판이 오기 전에는 0 이 아니라 모른다고 해야 한다');
  assert.equal(store.texture(), null);
  await Promise.all([store.load(), store.load()]);
  assert.equal(hits, 1, '같은 파일을 두 번 받았다');
  assert.equal(store.ready, true);
  assert.equal(store.landAt(52.5, 5.5), 1);
  assert.equal(store.landAt(34.3, 126.3), 0);
  const tex = store.texture();
  assert.equal(tex.width, 1440);
  assert.equal(tex.height, 720);
  assert.equal(tex.minFilter, THREE.NearestFilter, '섞어 읽으면 해안에서 0.5 문턱이 반 칸 흔들린다');
  assert.equal(tex.wrapS, THREE.RepeatWrapping, '경도가 감기지 않으면 날짜변경선에서 판이 끊긴다');
  assert.equal(store.info().erodeKm, MASK.erodeKm);

  const dead = createLandMask({ THREE, fetch: async () => ({ ok: false }) });
  assert.equal(await dead.load(), null);
  assert.equal(dead.texture(), null, '못 받은 판을 빈 텍스처로 물리면 바다가 통째로 사라진다');
  assert.equal(dead.landAt(52.5, 5.5), null);
  assert.equal(dead.info(), null);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  배선 — 셰이더와 클릭 판독이 **같은 판**을 본다
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const NOW = Date.parse('2026-09-20T06:00:00Z');
const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, NearestFilter: 1003, LinearFilter: 1006,
  NoColorSpace: '', RGBAFormat: 1023,
  DataTexture: class { constructor(data, w, h, f) { Object.assign(this, { data, width: w, height: h, format: f, isDataTexture: true }); } dispose() {} },
};

// 전 지구가 바다인 합성 격자 — 육지 가림이 없으면 어디서나 값을 말한다(그래서 판이 일하는지 보인다).
const seaDoc = (shape, key, extra) => {
  const arr = new Array(shape.nx * shape.ny).fill(0).map((_, i) => 10 + (i % 7));
  return { res: shape.res, nx: shape.nx, ny: shape.ny, lat0: shape.lat0, lon0: shape.lon0, [key]: arr, ...extra };
};

const rig = (id, doc, opts = {}) => {
  const desc = FIELD_DESCRIPTORS[id];
  const frames = createGridFrames(GRID_SOURCES[desc.source], {
    THREE: FakeTHREE, now: () => NOW, fetch: async () => ({ ok: true, json: async () => doc }),
  });
  const subs = new Set();
  const timeBus = { validMs: () => NOW, isNow: () => true, on(fn) { subs.add(fn); fn(0); return () => subs.delete(fn); } };
  const legend = { last: null, show(v) { this.last = v; }, release() {} };
  const layer = new FieldLayer(desc, {
    frames, timeBus, legend, doc: null, now: () => NOW, segments: [8, 4],
    setInterval: () => 0, clearInterval: () => {},
    makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 92, h: 40 }),
    ...opts,
  });
  return { layer, frames, legend };
};

// 운영 판을 그대로 쓰는 가짜 저장소(파일은 이미 읽어 두었다).
const realStore = (tex = { isDataTexture: true, tag: 'land' }) => ({
  load: async () => MASK,
  texture: () => tex,
  landAt: (lat, lon) => landAt(MASK, lat, lon),
  info: () => ({ erodeKm: MASK.erodeKm, land: MASK.land, total: MASK.total }),
});

test('바다 색면이 판을 물고, 판이 없으면 셰이더가 옛 동작으로 돈다(열린 실패)', async () => {
  const shape = { res: 5, nx: 72, ny: 33, lat0: -80, lon0: -180 };
  const tex = { isDataTexture: true, tag: 'land' };
  const on = rig('wavefield', seaDoc(shape, 'wave', { time: '2026-09-20T06:00:00Z' }), { landMask: realStore(tex) });
  assert.equal((await on.layer.on()).on, true);
  assert.equal(on.layer.renderer.uniforms.uHasLand.value, 1, '판을 물지 않았다 — 저지대가 다시 바다로 읽힌다');
  assert.equal(on.layer.renderer.uniforms.uLandMask.value, tex);
  on.layer.off();

  const off = rig('wavefield', seaDoc(shape, 'wave', { time: '2026-09-20T06:00:00Z' }), { landMask: null });
  assert.equal((await off.layer.on()).on, true);
  assert.equal(off.layer.renderer.uniforms.uHasLand.value, 0);
  assert.equal(off.layer.renderer.uniforms.uLandMask.value, null, '빈 판을 물리면 바다가 통째로 사라진다');
  off.layer.off();

  // 대기질은 바다 가림 자체가 없다 — 판도 물지 않는다(육지 위에도 값이 있는 것이 맞다).
  const air = rig('pm25grid', seaDoc(shape, 'pm25', { time: '2026-09-20T06:00:00Z' }), { landMask: realStore() });
  assert.equal((await air.layer.on()).on, true);
  assert.equal(air.layer.renderer.uniforms.uHasLand.value, 0);
  assert.equal(air.layer.landMask(), null);
  air.layer.off();
});

test('클릭 판독이 셰이더와 같은 판을 본다 — 간척지·저지대를 누르면 값을 말하지 않는다', async () => {
  const shape = { res: 5, nx: 72, ny: 33, lat0: -80, lon0: -180 };
  // 고도는 검증자가 읽은 값 그대로 — 전부 **해수면 아래**라 옛 가드는 통과시킨다.
  const depth = { '52.5,5.5': -3, '32.3,35.55': -217, '43.4,51.7': -107, '47.5,49': -15 };
  const r = rig('wavefield', seaDoc(shape, 'wave', { time: '2026-09-20T06:00:00Z' }), {
    landMask: realStore(),
    terrain: { uHasHeight: { value: 1 } },
    heightAt: (lat, lon) => depth[`${lat},${lon}`] ?? -3000,
  });
  assert.equal((await r.layer.on()).on, true);
  for (const [name, lat, lon] of BELOW_SEA_LAND.slice(0, 4)) {
    const s = r.layer.sampleAt(lat, lon);
    assert.deepEqual(s, { land: true }, `${name} 에서 카드가 아직 값을 단언한다`);
    assert.equal(r.layer.readoutNote(lat, lon).badge, 'UNAVAILABLE');
    assert.match(r.layer.readoutNote(lat, lon).html, /육지입니다/);
  }
  // 좁은 바다는 그대로 읽힌다 — 판이 클릭까지 먹으면 안 된다.
  for (const [name, lat, lon] of NARROW_SEA.slice(0, 6)) {
    const s = r.layer.sampleAt(lat, lon);
    assert.ok(s && !s.land, `${name} 에서 값을 못 읽는다`);
    assert.equal(Number.isFinite(s.value), true);
  }
  r.layer.off();
});

test('지형을 통째로 못 받은 세션 — 칠해진 바다를 눌렀는데 "육지입니다" 가 뜨지 않는다', async () => {
  // main.js heightAtJs 는 고도 캔버스가 없으면 **어디서나 정확히 0** 을 돌려준다(main.js:2731).
  // 그 세션은 uHasHeight = 0 이라 셰이더도 고도를 안 본다 — 판정의 근거를 화면과 같은 곳에 둔다.
  const shape = { res: 5, nx: 72, ny: 33, lat0: -80, lon0: -180 };
  const blind = rig('wavefield', seaDoc(shape, 'wave', { time: '2026-09-20T06:00:00Z' }), {
    landMask: realStore(),
    terrain: { uHasHeight: { value: 0 } },
    heightAt: () => 0,
  });
  assert.equal((await blind.layer.on()).on, true);
  const sea = blind.layer.sampleAt(0, -140);                 // 태평양 한가운데
  assert.ok(sea && !sea.land, '지형이 없는 세션에서 먼 바다가 육지가 됐다 — 코드 주석과 반대다');
  assert.equal(Number.isFinite(sea.value), true);
  // 그래도 판은 일한다 — 지형이 없어도 저지대는 육지다.
  assert.deepEqual(blind.layer.sampleAt(32.3, 35.55), { land: true });
  blind.layer.off();

  // 지형이 있는 세션에서는 고도가 그대로 육지를 가른다(판이 놓치는 해안 한 칸 안쪽을 이쪽이 맡는다).
  const seeing = rig('wavefield', seaDoc(shape, 'wave', { time: '2026-09-20T06:00:00Z' }), {
    landMask: realStore(), terrain: { uHasHeight: { value: 1 } }, heightAt: () => 78,
  });
  assert.equal((await seeing.layer.on()).on, true);
  assert.deepEqual(seeing.layer.sampleAt(0, -140), { land: true });
  seeing.layer.off();
});

test('카드가 무엇으로 육지를 갈랐는지 말한다 — 판이 늦게 와도 글이 따라 바뀐다', async () => {
  const shape = { res: 1, nx: 360, ny: 161, lat0: -79.875, lon0: -179.875 };
  let resolveLoad = null;
  const late = {
    load: () => new Promise((res) => { resolveLoad = res; }),
    texture() { return this.ready ? { isDataTexture: true } : null; },
    landAt: (lat, lon) => landAt(MASK, lat, lon),
    info() { return this.ready ? { erodeKm: MASK.erodeKm } : null; },
    ready: false,
  };
  const r = rig('sstfield', seaDoc(shape, 'sst', { observed: '2026-09-20T06:00:00Z' }), { landMask: late });
  assert.equal((await r.layer.on()).on, true);
  assert.match(r.layer.cardHtml(), /지형 고도로만 가릅니다/, '판이 없는데 있는 척한다');
  late.ready = true;
  resolveLoad(MASK);
  await new Promise((res) => setTimeout(res, 0));
  assert.match(r.layer.cardHtml(), /국가 경계 판/, '판이 왔는데 카드가 옛 말을 한다');
  assert.equal(r.layer.renderer.uniforms.uHasLand.value, 1);
  r.layer.off();

  // 대기질 카드에는 이 줄이 통째로 없다 — 바다에만 칠하는 색면이 아니다.
  const air = rig('pm25grid', seaDoc({ res: 5, nx: 72, ny: 33, lat0: -80, lon0: -180 }, 'pm25', { time: '2026-09-20T06:00:00Z' }),
    { landMask: null });
  assert.equal((await air.layer.on()).on, true);
  assert.doesNotMatch(air.layer.cardHtml(), /바다에만 칠합니다/);
  air.layer.off();
});

test('셰이더와 클릭이 같은 판 · 같은 칸 고르기를 쓴다 — 소스에서도 확인한다', () => {
  const frag = readFileSync(new URL('../../prototype/v2-three/js/field-renderer.js', import.meta.url), 'utf8');
  const layerSrc = readFileSync(new URL('../../prototype/v2-three/js/field-layer.js', import.meta.url), 'utf8');
  assert.match(frag, /uniform sampler2D uLandMask;/);
  assert.match(frag, /if \(uHasLand > 0\.5\)/);
  // 클릭 쪽은 저장소의 landAt 을 부른다(다른 판을 새로 만들지 않는다).
  assert.match(layerSrc, /const lm = this\.landMask\(\);\s*\n\s*if \(lm && lm\.landAt && lm\.landAt\(lat, lon\) === 1\) return \{ land: true \};/);
  // 고도 가드는 uHasHeight 와 같은 조건에 묶여 있다 — 지형 없는 세션에서 0 을 육지로 읽지 않는다.
  assert.match(layerSrc, /const hasHeight = t && t\.uHasHeight \? t\.uHasHeight\.value > 0\.5 : !!this\.deps\.heightAt;/);
});
