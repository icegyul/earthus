// DEV-DIRECTIVE 2026-09-20 · 작업 D3 — JSON 격자(바다 3종 · 대기질)를 W1 렌더러로 옮긴 어댑터의 시험.
//
// 금지("육지에 색이 없다")만 보면 아무것도 안 칠하는 어댑터가 통과한다 — **결과**를 잠근다:
//   · 서울·부산 앞바다 칸이 제자리(행·열)이고 옛 식과의 차이가 숫자로 나온다(5° 2.5° · 1° 0.375° · 0.5° 0.125°)
//   · DataTexture 의 행 순서가 셰이더에서 GFS 그림 텍스처와 **같은 방향**이다(flipY 가 없다)
//   · 결측 칸은 무게 0 이라 옆 칸의 값과 섞이지 않는다 — 결측 칸의 값 바이트를 무엇으로 바꿔도 답이 같다
//   · 격자 밖(동아시아 편차의 대서양 · OISST 의 극)에서는 가장자리 칸을 늘여 칠하지 않는다
//   · 타임라인이 '지금'이 아니면 outOfRange · single 로 밝힌다
//   · 같은 파일을 쓰는 두 필드가 파일을 한 번만 받는다
//   · 눈금표의 경계가 바이트 눈금 위에 없으면 저장소를 만들 때 던진다(조용히 자르지 않는다)
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRID_SOURCES, MASK_OFF, MASK_ON,
  bracketSingle, checkLattice, createGridFrames, docToken, encodeByte,
  maskedValueAt, outsideGrid, quantizeGrid, readGridShape,
} from '../../prototype/v2-three/js/grid-frames.js';
import { uvTransformOf } from '../../prototype/v2-three/js/gfs-frames.js';
import { gridCoordOf } from '../../prototype/v2-three/js/field-renderer.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';

const NOW = Date.parse('2026-09-20T06:00:00Z');

// 운영 파일의 **실제 모양**(2026-09-20 공개 GET 으로 확인) — 값만 합성한다.
const SHAPES = {
  sstGlobal: { res: 1, nx: 360, ny: 161, lat0: -79.875, lon0: -179.875 },
  marine: { res: 5, nx: 72, ny: 33, lat0: -80, lon0: -180 },
  sstAnomEa: { res: 0.5, nx: 73, ny: 49, lat0: 23.125, lon0: 114.125 },
  air: { res: 5, nx: 72, ny: 33, lat0: -80, lon0: -180 },
};

// 합성 문서 한 장. fill(위도, 경도, 남쪽부터 센 행, 열) → 값 또는 null.
const makeDoc = (shapeId, keys, fill, extra = {}) => {
  const s = SHAPES[shapeId];
  const doc = { res: s.res, nx: s.nx, ny: s.ny, lat0: s.lat0, lon0: s.lon0, ...extra };
  for (const key of keys) {
    const arr = new Array(s.nx * s.ny);
    for (let y = 0; y < s.ny; y += 1) {
      for (let x = 0; x < s.nx; x += 1) {
        arr[y * s.nx + x] = fill(s.lat0 + y * s.res, s.lon0 + x * s.res, y, x, key);
      }
    }
    doc[key] = arr;
  }
  return doc;
};

const storeOf = (sourceId, doc, opts = {}) => {
  let fetches = 0;
  const store = createGridFrames(GRID_SOURCES[sourceId], {
    now: () => (opts.now || NOW),
    fetch: () => { fetches += 1; return Promise.resolve({ ok: true, json: async () => (typeof doc === 'function' ? doc() : doc) }); },
  });
  return { store, fetchCount: () => fetches };
};

// ── 격자 모양과 등록 ────────────────────────────────────────────────────────────────────────────────────────

test('원본은 행 0 = 남인데 격자는 북쪽 끝을 lat0 으로 말한다(gfs-frames 규약)', () => {
  const g = readGridShape({ res: 1, nx: 360, ny: 161, lat0: -79.875, lon0: -179.875 });
  assert.equal(g.lat0, 80.125);           // −79.875 + 160
  assert.equal(g.dLat, 1);
  assert.equal(g.wraps, true);            // 360 × 1° = 360
  const ea = readGridShape(SHAPES.sstAnomEa);
  assert.equal(ea.lat0, 47.125);          // 23.125 + 48 × 0.5
  assert.equal(ea.wraps, false);          // 73 × 0.5° = 36.5° — 한 바퀴가 아니다
  assert.equal(readGridShape({ res: 1 }), null);
});

test('점 격자 등록 — 옛 식은 반 칸 어긋나 있었다(5° 2.5° · 1° 0.375° · 0.5° 0.125°)', () => {
  // 옛 buildField: 격자점 값을 floor((lon+180)/res) 픽셀에 넣었다 → 그 픽셀의 한가운데가 값의 자리가 된다.
  const oldCenter = (lon, lat, res) => ({
    lon: (Math.floor((lon + 180) / res) + 0.5) * res - 180,
    lat: 90 - (Math.floor((90 - lat) / res) + 0.5) * res,
  });
  // 새 식: 셰이더가 쓰는 uvTransform 으로 되짚어 그 점이 칸 (열, 행) 정수에 정확히 앉는지 본다.
  const check = (shapeId, lat, lon, wantCol, wantRow, wantShiftDeg) => {
    const grid = readGridShape(SHAPES[shapeId]);
    const uvT = uvTransformOf(grid, 'point');
    const g = gridCoordOf(uvT, { ni: grid.ni, nj: grid.nj }, lat, lon);
    assert.ok(Math.abs(g[0] - wantCol) < 1e-6, `${shapeId} 열 ${g[0]} ≠ ${wantCol}`);
    assert.ok(Math.abs(g[1] - wantRow) < 1e-6, `${shapeId} 행 ${g[1]} ≠ ${wantRow}`);
    const o = oldCenter(lon, lat, SHAPES[shapeId].res);
    assert.ok(Math.abs(Math.abs(o.lon - lon) - wantShiftDeg) < 1e-6, `${shapeId} 옛 경도 어긋남 ${o.lon - lon}`);
    assert.ok(Math.abs(Math.abs(o.lat - lat) - wantShiftDeg) < 1e-6, `${shapeId} 옛 위도 어긋남 ${o.lat - lat}`);
  };
  check('sstGlobal', 80.125, -179.875, 0, 0, 0.375);        // 북서쪽 첫 점
  check('sstGlobal', 35.125, 129.125, 309, 45, 0.375);      // 부산 앞바다에 가장 가까운 OISST 1° 점
  check('marine', -80, -180, 0, 32, 2.5);                   // 남서쪽 첫 점 = 마지막 행
  check('marine', 35, 130, 62, 9, 2.5);                     // 한반도 남쪽 5° 점
  check('sstAnomEa', 47.125, 114.125, 0, 0, 0.125);
  check('sstAnomEa', 35.125, 129.125, 30, 24, 0.125);
});

test('42 km · 278 km — 옛 어긋남을 거리로 적는다', () => {
  const km = (deg) => deg * 111.195;
  assert.ok(Math.round(km(0.375)) === 42, `1° 수온 ${km(0.375)}`);
  assert.ok(Math.round(km(2.5)) === 278, `5° 파고·대기질 ${km(2.5)}`);
  assert.ok(Math.round(km(0.125)) === 14, `0.5° 편차 ${km(0.125)}`);
});

// ── 텍스처 방향 ─────────────────────────────────────────────────────────────────────────────────────────────

test('DataTexture 는 flipY 가 없다 — 행을 남쪽부터 담아야 셰이더에서 GFS 그림과 같은 방향이다', () => {
  const grid = readGridShape(SHAPES.marine);
  const ch = { transfer: 'linear', scale: 0.1, offset: 0 };
  // 위도만으로 값을 만든다 — 남과 북이 뒤집히면 바로 드러난다.
  const arr = new Array(grid.ni * grid.nj);
  for (let y = 0; y < grid.nj; y += 1) {
    for (let x = 0; x < grid.ni; x += 1) arr[y * grid.ni + x] = y * 0.1;
  }
  const q = quantizeGrid(arr, grid, ch);
  // CPU 사본은 행 0 = 북(gfs-frames 규약) → 가장 큰 값(북쪽 행)이 첫 행이다.
  assert.equal(q.px.data[0], 32);                                  // y=32(북) → 3.2 m → 바이트 32
  assert.equal(q.px.data[(grid.nj - 1) * grid.ni * 2], 0);         // 마지막 행 = 남
  // 텍스처는 행 0 = 남 → 첫 바이트가 0.
  assert.equal(q.tex[0], 0);
  assert.equal(q.tex[(grid.nj - 1) * grid.ni * 4], 32);

  // 셰이더가 실제로 읽는 길로 되짚는다: gridCoordOf → tapValue 의 uv → (flipY 없는) DataTexture 의 행.
  const uvT = uvTransformOf(grid, 'point');
  const texelAt = (lat, lon) => {
    const g = gridCoordOf(uvT, { ni: grid.ni, nj: grid.nj }, lat, lon);
    const col = Math.round(g[0]);
    const row = Math.round(g[1]);
    const v = 1 - (row + 0.5) / grid.nj;                            // tapValue 의 uv.y
    const dataRow = Math.floor(v * grid.nj);                        // flipY 없음 = 배열 행 그대로
    return q.tex[(dataRow * grid.ni + ((col % grid.ni) + grid.ni) % grid.ni) * 4];
  };
  assert.equal(texelAt(80, 130), 32, '북위 80° 가 북쪽 행에서 읽히지 않는다 — 위아래가 뒤집혔다');
  assert.equal(texelAt(-80, 130), 0, '남위 80° 가 남쪽 행에서 읽히지 않는다');
  assert.equal(texelAt(0, 130), 16, '적도 행이 가운데가 아니다');
});

test('경도 원점 — 서경 180 이 첫 열이고 동경 130 이 제자리다', () => {
  const grid = readGridShape(SHAPES.marine);
  const ch = { transfer: 'linear', scale: 0.1, offset: 0 };
  const arr = new Array(grid.ni * grid.nj).fill(0);
  const rowSouth = 23;                                              // lat 35 = −80 + 23 × 5 (원본은 남쪽부터)
  arr[rowSouth * grid.ni + 62] = 7.7;                               // lon 130 = −180 + 62 × 5
  const q = quantizeGrid(arr, grid, ch);
  const spot = maskedValueAt({ px: q.px, grid, channel: ch, lat: 35, lon: 130 });
  assert.ok(Math.abs(spot.value - 7.7) < 1e-9, `동경 130 에서 ${spot.value}`);
  assert.equal(maskedValueAt({ px: q.px, grid, channel: ch, lat: 35, lon: -50 }).value, 0);
});

// ── 결측 ────────────────────────────────────────────────────────────────────────────────────────────────────

test('결측 칸은 값과 섞이지 않는다 — 결측의 값 바이트를 무엇으로 바꿔도 답이 같다', () => {
  const grid = { ni: 4, nj: 4, lon0: -180, lat0: 90, dLon: 90, dLat: 45, wraps: true };
  const ch = { transfer: 'linear', scale: 0.2, offset: -10 };
  // 한 칸의 네 꼭짓점 중 하나만 결측. 나머지 셋은 전부 20 °C.
  const px = { w: 4, h: 4, channels: 2, data: new Uint8Array(4 * 4 * 2) };
  const put = (row, col, v) => {
    const o = (row * 4 + col) * 2;
    if (v == null) { px.data[o] = 0; px.data[o + 1] = MASK_OFF; return; }
    px.data[o] = encodeByte(v, ch);
    px.data[o + 1] = MASK_ON;
  };
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) put(r, c, 20);
  put(1, 1, null);
  const at = maskedValueAt({ px, grid, channel: ch, lat: 90 - 45 * 1.5, lon: -180 + 90 * 1.5 });   // 그 칸 한가운데
  assert.ok(Math.abs(at.value - 20) < 1e-9, `결측 옆에서 ${at.value} — 결측이 값으로 섞였다`);
  assert.ok(Math.abs(at.weight - 0.75) < 1e-9, `무게 ${at.weight}`);
  assert.equal(at.all, 0, '네 칸이 다 있지 않은데 all 이 1 이다');
  // 결측 칸의 값 바이트를 255 로 바꿔도 답이 바뀌면 안 된다(그 바이트는 값이 아니다).
  px.data[(1 * 4 + 1) * 2] = 255;
  const again = maskedValueAt({ px, grid, channel: ch, lat: 90 - 45 * 1.5, lon: -180 + 90 * 1.5 });
  assert.equal(again.value, at.value);
});

test('네 칸이 다 결측이면 아무 말도 하지 않는다 · 다 있으면 all = 1', () => {
  const grid = { ni: 4, nj: 4, lon0: -180, lat0: 90, dLon: 90, dLat: 45, wraps: true };
  const ch = { transfer: 'linear', scale: 0.2, offset: -10 };
  const px = { w: 4, h: 4, channels: 2, data: new Uint8Array(4 * 4 * 2) };
  const at = maskedValueAt({ px, grid, channel: ch, lat: 0, lon: 0 });
  assert.equal(at.weight, 0);
  assert.ok(Number.isNaN(at.value));
  px.data.fill(MASK_ON);
  const full = maskedValueAt({ px, grid, channel: ch, lat: 0, lon: 0 });
  assert.equal(full.all, 1);
  assert.ok(full.weight > 0);
});

test('결측 칸 수와 값 범위는 값이 있는 칸만 센다', () => {
  const grid = { ni: 4, nj: 2, lon0: -180, lat0: 45, dLon: 90, dLat: 90, wraps: true };
  const ch = { transfer: 'linear', scale: 0.2, offset: -10 };
  const q = quantizeGrid([5, null, 30, null, null, null, -1.8, 12], grid, ch);
  assert.equal(q.present, 4);
  assert.equal(q.total, 8);
  assert.equal(q.min, -1.8);
  assert.equal(q.max, 30);
  // CPU 사본의 첫 행 = 북(원본의 마지막 행 [null, null, −1.8, 12]).
  assert.equal(q.px.data[1], MASK_OFF);
  assert.equal(q.px.data[2 * 2 + 1], MASK_ON);
  assert.equal(q.px.data[2 * 2], 41);       // −1.8 °C → (−1.8 + 10) / 0.2 = 41
});

// ── 격자 밖 ─────────────────────────────────────────────────────────────────────────────────────────────────

test('지역 격자는 대서양을 칠하지 않고, 전지구 격자도 극에서 멈춘다', () => {
  const ea = readGridShape(SHAPES.sstAnomEa);
  assert.equal(outsideGrid(ea, 35, 128), false, '동아시아 안인데 밖이라고 한다');
  assert.equal(outsideGrid(ea, 37.5, -30), true, '대서양에 동아시아 편차를 칠한다');
  assert.equal(outsideGrid(ea, 60, 128), true, '북쪽 밖');
  const sst = readGridShape(SHAPES.sstGlobal);
  assert.equal(outsideGrid(sst, 35, -30), false, '전지구 격자는 경도로 감는다');
  assert.equal(outsideGrid(sst, 88, 0), true, 'OISST 는 ±80° 까지다 — 북극까지 늘여 칠하면 안 된다');
  assert.equal(outsideGrid(sst, 80.1, 0), false);
});

// ── 눈금 잠그기 ─────────────────────────────────────────────────────────────────────────────────────────────

test('눈금표의 경계가 바이트 눈금 위에 있다 — 넷 다', () => {
  for (const src of Object.values(GRID_SOURCES)) {
    for (const f of Object.values(src.fields)) {
      const ch = { transfer: 'linear', scale: f.scale, offset: f.offset };
      assert.deepEqual(checkLattice(ch, scaleOf(f.scaleId)), [], `${src.id}.${f.id}`);
    }
  }
});

test('경계가 눈금 사이에 걸치면 저장소를 만들 때 던진다', () => {
  const bad = checkLattice({ scale: 0.15, offset: -2 }, scaleOf('sst'));
  assert.ok(bad.length >= 2, bad.join(' · '));
  assert.match(bad.join(' · '), /한 자리 유효숫자가 아니다/);
  assert.throws(() => createGridFrames({
    ...GRID_SOURCES.sstGlobal,
    fields: { sst: { ...GRID_SOURCES.sstGlobal.fields.sst, offset: -9.9 } },
  }, {}), /눈금이 표와 어긋난다/);
});

test('눈금표 한 줄을 바꾸면 이 검사도 같이 움직인다', () => {
  // sst 표의 경계를 4 → 4.05 로 바꾼 가짜 눈금: 0.2 °C 바이트 위에 없다.
  const fake = { breaks: [0, 4.05, 8], isolines: null };
  assert.match(checkLattice({ scale: 0.2, offset: -10 }, fake).join(' · '), /경계 4\.05 이 눈금 0\.2/);
});

// ── 저장소 ──────────────────────────────────────────────────────────────────────────────────────────────────

test("'지금'이면 한 장을 주고, 타임라인을 밀면 숨으라고 밝힌다(single)", async () => {
  const doc = makeDoc('marine', ['wave'], () => 2.5, { time: '2026-09-20T06:00:00Z' });
  const { store } = storeOf('marine', doc);
  await store.load();
  const now = store.bracket('wave', NOW);
  assert.equal(now.outOfRange, null);
  assert.equal(now.exact, true);
  assert.equal(now.single, true);
  const later = store.bracket('wave', NOW + 6 * 3600_000);
  assert.equal(later.outOfRange, 'after');
  assert.equal(later.single, true);
  assert.equal(store.bracket('wave', NOW - 6 * 3600_000).outOfRange, 'before');
  // 1분 안쪽은 '지금'이다(time-bus 의 NOW_EPS_MS 와 같은 폭).
  assert.equal(store.bracket('wave', NOW + 30_000).outOfRange, null);
  assert.equal(bracketSingle(null, NOW, NOW), null);
});

test('같은 파일을 쓰는 두 필드가 파일을 한 번만 받는다', async () => {
  const doc = makeDoc('sstAnomEa', ['sst', 'sstAnom'], (lat) => lat / 10, { observed: '2026-09-20T06:00:00Z' });
  const { store, fetchCount } = storeOf('sstAnomEa', doc);
  await Promise.all([store.load(), store.load()]);
  await store.load();
  assert.equal(fetchCount(), 2, '동시에 부른 둘은 한 번이고, 다시 부르면 한 번 더 확인한다');
  assert.ok(store.has('sst') && store.has('sstAnom'));
  assert.equal(store.framesFor('sst').length, 1);
  assert.equal(store.framesFor('sstAnom')[0].h, 0);
});

test('세대가 바뀌면(문서가 다시 구워지면) 알리고 쥐고 있던 것을 버린다', async () => {
  let token = '2026-09-20T06:00:00Z';
  const doc = () => makeDoc('air', ['pm25'], () => 20, { time: token });
  const { store } = storeOf('air', doc);
  let swaps = 0;
  store.onSwap(() => { swaps += 1; });
  await store.load();
  assert.equal(store.pixelsNow('pm25').data[0], 4);     // 20 µg/m³ ÷ 5 = 바이트 4
  await store.load();
  assert.equal(swaps, 0, '같은 세대인데 갈아 끼웠다');
  token = '2026-09-20T09:00:00Z';
  await store.load();
  assert.equal(swaps, 1);
  assert.equal(docToken({ time: 'a' }), 'a');
});

test('문서를 못 받으면 이유를 말한다 — 지어내지 않는다', async () => {
  const store = createGridFrames(GRID_SOURCES.marine, { now: () => NOW, fetch: async () => ({ ok: false }) });
  await store.load();
  assert.equal(store.loaded, false);
  assert.equal(store.noDataReason, 'NO_DOCUMENT');
  assert.throws(() => store.fieldSpec('wave'), /GRID_FRAMES_NOT_LOADED/);
});

test('누른 자리의 값 — 결측과 섞지 않고, 격자 밖에서는 값이 없다', async () => {
  // 위도 35 · 경도 125~135 만 값이 있는 합성 수온(나머지는 육지처럼 null).
  const doc = makeDoc('sstGlobal', ['sst'], (lat, lon) => (
    (lat > 30 && lat < 40 && lon > 120 && lon < 140) ? 24 + (lat - 30) * 0.2 : null
  ), { observed: '2026-09-20T06:00:00Z' });
  const { store } = storeOf('sstGlobal', doc);
  await store.load();
  const s = store.sampleAt('sst', NOW, 35.125, 129.125);
  assert.equal(s.decoded, true);
  assert.equal(s.single, true);
  assert.ok(Math.abs(s.value - (24 + 5.125 * 0.2)) < 0.11, `부산 앞바다 ${s.value}`);
  const far = store.sampleAt('sst', NOW, 0, 0);
  assert.equal(far.weight, 0);
  assert.ok(Number.isNaN(far.value));
  assert.ok(Number.isNaN(store.sampleAt('sst', NOW, 88, 0).value), '극에서 가장자리 값을 말한다');
  assert.equal(store.gridStats('sst').present > 0, true);
});

test('uvTransform 과 fieldSpec 은 gfs-frames 와 같은 모양이다(FieldLayer 가 구별하지 않는다)', async () => {
  const doc = makeDoc('sstGlobal', ['sst'], () => 10, { observed: '2026-09-18T00:00:00Z' });
  const { store } = storeOf('sstGlobal', doc);
  await store.load();
  const spec = store.fieldSpec('sst');
  assert.equal(spec.decodable, true);
  assert.equal(spec.cell, 'point');
  assert.equal(spec.channels.length, 2);
  assert.equal(spec.channels[0].transfer, 'linear');
  assert.equal(spec.channels[1].role, 'mask');
  assert.deepEqual(store.uvTransform('sst'), uvTransformOf(spec.grid, 'point'));
  const info = store.info();
  assert.equal(info.single, true);
  assert.equal(info.resolutionDeg, 1);
  assert.equal(info.run, null, "한 시각 자료에 '런'은 없다");
  assert.equal(info.validMs, Date.parse('2026-09-18T00:00:00Z'));
  assert.equal(info.kind, 'OBSERVED');
  assert.match(info.sourceName, /OISST/);
  // OISST 는 하루치 분석장이라 이틀이 정상이다 — 12시간 규칙(GFS)을 그대로 쓰면 늘 '지연'이 된다.
  assert.equal(store.runAge(NOW).limitH, 60);
  assert.equal(store.runAge(NOW).delayed, false);
  assert.equal(store.runAge(NOW + 80 * 3600_000).delayed, true);
  assert.equal(store.document(), doc);
});
