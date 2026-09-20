// DEV-DIRECTIVE 2026-09-20 · ocean.common.land_mask_hotfix — 바다 색면이 육지를 덮던 버그의 회귀 시험.
//
// 원인(실측): 바다 격자 3종(sstfield · wavefield · sstanom)이 반지름 1.0012 고정 껍질에 칠해져,
// 과장 50× 에서 해발 153 m 이하 육지(가까이 가면 1,529 m 까지)가 껍질 아래에 놓여 물빛에 덮였다.
// 수정은 고도의 부호로 만든 가림판(prototype/v2-three/js/ocean-land-mask.js)을 껍질의 alphaMap 으로 거는 것.
//
// 금지("육지에 색이 없어야 한다")만 시험하면 아무것도 안 칠하는 판이 통과한다 —
// 결과("바다는 칠해져야 한다 · 해안에서 두 칸 넘게 잃지 않는다")를 같이 잠근다.
// WebGL 은 노드에서 못 돌리므로 GPU 가 판을 읽는 방식(LinearFilter)은 sampleOceanMaskAlpha 로 옮겨 시험하고,
// 배선은 소스에서 확인한다(기존 관례 — camera-near-plane.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CELL,
  OCEAN_MASK_RES,
  buildOceanMask,
  buildOceanMaskAsync,
  classifyHeight,
  classifyOceanMaskRows,
  createOceanMask,
  erodedGridNodes,
  maskCellOf,
  oceanMaskAlphaRGBA,
  oceanMaskCardLine,
  sampleOceanMaskAlpha,
} from '../../prototype/v2-three/js/ocean-land-mask.js';

const liveSrc = readFileSync(
  new URL('../../prototype/v2-three/js/live-layers.js', import.meta.url), 'utf8');

// 합성 지구 — main.js heightAtJs 와 같은 서명 (위도, 경도) → m.
//   대륙(경도 0~40 · 위도 ±20, +300 m) · 칸 중심을 비껴 앉은 0.1° 섬 · 날짜변경선 동쪽 끝의 섬 · 남극. 나머지 −3000 m.
let worldCalls = 0;
const world = (lat, lon) => {
  worldCalls += 1;
  assert.ok(lat >= -90 && lat <= 90, `위도 자리에 ${lat} — (위도, 경도) 순서가 뒤집혔다`);
  assert.ok(lon >= -180 && lon <= 180, `경도 자리에 ${lon}`);
  if (lat < -70) return 2000;
  if (lon >= 0 && lon <= 40 && lat >= -20 && lat <= 20) return 300;
  if (lon >= 100.0 && lon <= 100.1 && lat >= 10.0 && lat <= 10.1) return 50;
  if (lon >= 179.8 && lat >= -1 && lat <= 1) return 100;
  return -3000;
};
const isLand = (lat, lon) => {
  const before = worldCalls;
  const h = world(lat, lon);
  worldCalls = before;
  return h > 0;
};
const mask = buildOceanMask(world);
const cellAt = (lat, lon) => {
  const { px, row } = maskCellOf(mask, lat, lon);
  return mask.cells[row * mask.width + px];
};

test('고도 한 점의 판정 — 음수만 바다이고 정확히 0 은 모름이다', () => {
  assert.equal(classifyHeight(-0.5), CELL.SEA);
  assert.equal(classifyHeight(12), CELL.LAND);
  // 실패한 지형 타일은 정확히 0 m 로 채워지고(main.js rgb(128,0,0)), 지형이 없으면 heightAtJs 는 0 만 돌려준다.
  assert.equal(classifyHeight(0), CELL.UNKNOWN);
  assert.equal(classifyHeight(NaN), CELL.UNKNOWN);
  assert.equal(classifyHeight(undefined), CELL.UNKNOWN);
});

test('결과 — 먼 바다는 온전히 칠해지고 대륙 한가운데는 비워진다', () => {
  assert.equal(mask.width, 1440);
  assert.equal(mask.height, 720);
  assert.equal(mask.usable, true);
  assert.equal(cellAt(0, -150), CELL.SEA);
  assert.equal(sampleOceanMaskAlpha(mask, 0, -150), 1);
  assert.equal(cellAt(0, 20), CELL.LAND);
  assert.equal(sampleOceanMaskAlpha(mask, 0, 20), 0);
  // 이 합성 지구의 바다는 해안 띠를 빼고 전부 칠해져야 한다 — '아무것도 안 칠하는 판'을 걸러 낸다.
  assert.ok(mask.seaFraction > 0.70, `바다로 남은 칸 ${mask.seaFraction}`);
  // 한 번에 415만 점을 넘기지 않는다(1440×720×2×2) — 표본이 몰래 늘면 휴대폰에서 첫 켬이 멈춘다.
  assert.ok(worldCalls <= 1440 * 720 * 4 + 648, `heightAt ${worldCalls}회`);
});

test('결과 — 육지의 어느 점에서도 알파가 0 이다 (LinearFilter 번짐까지 포함)', () => {
  // 대륙과 그 둘레를 0.05° 간격으로 촘촘히 — 해안선 바로 안쪽 점이 핵심이다.
  let landPts = 0;
  for (let lat = -22; lat <= 22; lat += 0.05) {
    for (let lon = -2; lon <= 42; lon += 0.05) {
      if (!isLand(lat, lon)) continue;
      landPts += 1;
      const a = sampleOceanMaskAlpha(mask, lat, lon);
      if (a !== 0) assert.fail(`육지 (${lat.toFixed(2)}, ${lon.toFixed(2)}) 에 알파 ${a}`);
    }
  }
  assert.ok(landPts > 600000, `육지 점 ${landPts}`);
  // 지구 전체를 결정적 난수로 20만 점 — 섬·남극·날짜변경선까지.
  let seed = 20260920;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let seaPts = 0;
  let seaFull = 0;
  for (let i = 0; i < 200000; i += 1) {
    const lat = -90 + rnd() * 180;
    const lon = -180 + rnd() * 360;
    const a = sampleOceanMaskAlpha(mask, lat, lon);
    if (isLand(lat, lon)) {
      if (a !== 0) assert.fail(`육지 (${lat}, ${lon}) 에 알파 ${a}`);
    } else {
      seaPts += 1;
      if (a === 1) seaFull += 1;
    }
  }
  assert.ok(seaFull / seaPts > 0.95, `바다 점 중 온전히 칠해진 비율 ${seaFull / seaPts}`);
});

test('결과 — 해안에서 잃는 바다는 두 칸을 넘지 않는다', () => {
  // 대륙 서해안은 경도 0. [-0.25,0) 칸은 바다지만 육지 칸과 맞닿아 비운다(해안 띠).
  assert.equal(cellAt(0.1, -0.125), CELL.COAST);
  assert.equal(sampleOceanMaskAlpha(mask, 0.125, -0.125), 0);
  // 그다음 칸 [-0.5,-0.25) 부터는 온전히 칠해져야 한다 — 띠가 띠를 부르면 바다가 계속 깎인다.
  assert.equal(cellAt(0.1, -0.375), CELL.SEA);
  assert.equal(sampleOceanMaskAlpha(mask, 0.125, -0.375), 1);
  // 두 칸 중심 사이에서는 서서히 옅어진다 — 딱딱한 계단이 아니다.
  const mid = sampleOceanMaskAlpha(mask, 0.125, -0.25);
  assert.ok(mid > 0.4 && mid < 0.6, `해안 띠 경계의 알파 ${mid}`);
});

test('칸 중심을 비껴 앉은 작은 섬을 놓치지 않는다 — 2×2 표본의 이유', () => {
  // 섬은 [100.0,100.1]×[10.0,10.1]. 그 칸의 중심 (10.125, 100.125) 은 바다다.
  assert.equal(isLand(10.125, 100.125), false);
  assert.equal(cellAt(10.05, 100.05), CELL.LAND);
  assert.equal(sampleOceanMaskAlpha(mask, 10.05, 100.05), 0);
  // 중심 한 점(sub=1)만 보면 같은 섬이 바다로 읽힌다 — 표본 수를 줄이려는 사람이 먼저 보게 둔다.
  const one = createOceanMask(OCEAN_MASK_RES);
  const { px, row } = maskCellOf(one, 10.05, 100.05);
  classifyOceanMaskRows(one, world, row, row + 1, 1);
  assert.equal(one.cells[row * one.width + px], CELL.SEA);
});

test('날짜변경선 — 동쪽 끝의 육지가 서쪽 끝 칸을 해안 띠로 만든다', () => {
  assert.equal(cellAt(0, 179.9), CELL.LAND);
  assert.equal(cellAt(0, -179.9), CELL.COAST);      // 경도는 감긴다
  assert.equal(sampleOceanMaskAlpha(mask, 0, 179.95), 0);
  assert.equal(sampleOceanMaskAlpha(mask, 0, -179.99), 0);
});

test('행 0 은 남쪽이다 — DataTexture(flipY=false)의 첫 행이 남극에 놓인다', () => {
  assert.ok(maskCellOf(mask, -80, 0).row < maskCellOf(mask, 80, 0).row);
  const rgba = oceanMaskAlphaRGBA(mask);
  assert.equal(rgba.length, 1440 * 720 * 4);
  // 첫 행 = 남극 대륙 = 0, 마지막 행 = 북극해 = 255. three 의 alphamap_fragment 는 .g 를 읽는다.
  assert.equal(rgba[1], 0);
  assert.equal(rgba[((mask.height - 1) * mask.width) * 4 + 1], 255);
  const { px, row } = maskCellOf(mask, 0, 20);
  assert.equal(rgba[(row * mask.width + px) * 4 + 1], 0, '대륙 칸의 알파');
  const sea = maskCellOf(mask, 0, -150);
  assert.equal(rgba[(sea.row * mask.width + sea.px) * 4 + 1], 255, '먼 바다 칸의 알파');
});

test('가림판과 껍질의 좌표 규약 — three 의 기본값이 바뀌면 남반구 바다가 사라진다', async () => {
  // 가림판의 (행 0 = 남쪽 · 열 0 = 경도 −180) 은 three 의 세 가지 기본값에 기대고 있다. 판올림 때 여기서 걸린다.
  const THREE = await import('../../prototype/vendor/three-r184.module.min.js');
  const dt = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  assert.equal(dt.flipY, false, 'DataTexture 첫 행이 v=0 에 놓이지 않는다');
  const g = new THREE.SphereGeometry(1, 8, 4);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  assert.equal(pos.getY(0), 1);
  assert.equal(uv.getY(0), 1, '북극이 v=1 이 아니다');
  assert.equal(uv.getY(9 * 4), 0, '남극이 v=0 이 아니다');
  // buildField 는 껍질을 rotation.y = −90° 로 돌린다 — 그 뒤 u=0 이 경도 −180, u=0.75 가 동경 90 이어야 한다.
  assert.match(liveSrc, /mesh\.rotation\.y = -Math\.PI \/ 2;/);
  const rot = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const lonOf = (i) => {
    const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(rot);
    return (Math.atan2(p.x, p.z) * 180) / Math.PI;
  };
  const eq = 9 * 2;                                          // 적도 링의 첫 정점
  assert.equal(uv.getX(eq), 0);
  assert.ok(Math.abs(Math.abs(lonOf(eq)) - 180) < 1e-6, `u=0 의 경도 ${lonOf(eq)}`);
  assert.equal(uv.getX(eq + 6), 0.75);
  assert.ok(Math.abs(lonOf(eq + 6) - 90) < 1e-6, `u=0.75 의 경도 ${lonOf(eq + 6)}`);
  // 가림판 쪽 식도 같은 규약이다: 열 0 = 경도 −180, 행 0 = 위도 −90.
  assert.deepEqual(maskCellOf(mask, -89.9, -179.9), { px: 0, row: 0 });
  assert.deepEqual(maskCellOf(mask, 89.9, 179.9), { px: 1439, row: 719 });
});

test('실패한 지형 타일(정확히 0 m) 위는 칠하지 않는다 — 그 밖의 바다는 그대로 칠한다', () => {
  // 경도 60~82.5 · 위도 ±10 이 통째로 0 m — 그 안에 육지가 있는지 바다인지 모른다.
  const patchy = (lat, lon) => ((lon >= 60 && lon < 82.5 && Math.abs(lat) < 10) ? 0 : world(lat, lon));
  const m = buildOceanMask(patchy, { res: 0.5 });
  const at = (lat, lon) => { const c = maskCellOf(m, lat, lon); return m.cells[c.row * m.width + c.px]; };
  assert.equal(at(0, 70), CELL.UNKNOWN);
  assert.equal(sampleOceanMaskAlpha(m, 0, 70), 0);
  assert.equal(sampleOceanMaskAlpha(m, 0, -150), 1);
  assert.equal(m.usable, true);
  assert.ok(m.unknown > 0);
});

test('지형이 통째로 없으면 쓸 수 없는 판이라고 말한다 — 전부 가리지도 전부 드러내지도 않는다', () => {
  let calls = 0;
  const none = () => { calls += 1; return 0; };            // main.js heightAtJs: baseHeightCanvas 없으면 0
  const m = buildOceanMask(none);
  assert.equal(m.usable, false);
  assert.equal(m.sea, 0);
  assert.ok(calls <= 648, `지형이 없는데 ${calls}점을 돌았다 — 성긴 탐침에서 멈춰야 한다`);
  assert.match(oceanMaskCardLine(m), /지형 자료를 받지 못해/);
  assert.match(oceanMaskCardLine(null), /지형 자료를 받지 못해/);

  // 대체 규칙: 값 없는 칸(육지)에 닿은 격자점은 비우고, 먼 바다는 칠한다.
  const nx = 8; const ny = 6;
  const v = new Array(nx * ny).fill(20);
  v[2 * nx + 3] = null;                                     // 육지 한 칸
  const ok = erodedGridNodes(v, nx, ny, false);
  assert.equal(ok[2 * nx + 3], 0, '값 없는 칸');
  assert.equal(ok[2 * nx + 4], 0, '육지 옆 칸');
  assert.equal(ok[1 * nx + 2], 0, '육지 대각 칸');
  assert.equal(ok[2 * nx + 6], 1, '먼 바다 칸은 칠해져야 한다');
  assert.equal(ok[0], 1, '격자 가장자리를 육지로 읽으면 안 된다');
  const painted = ok.reduce((a, b) => a + b, 0);
  assert.equal(painted, nx * ny - 9);
  // 한 바퀴 도는 격자는 날짜변경선을 넘어 이웃을 본다.
  const w = new Array(nx * ny).fill(20);
  w[3 * nx + (nx - 1)] = null;
  assert.equal(erodedGridNodes(w, nx, ny, true)[3 * nx + 0], 0);
  assert.equal(erodedGridNodes(w, nx, ny, false)[3 * nx + 0], 1);
  // 색을 고르지 않은 값(평년 ±0.25°C 안쪽)은 '값 없음'이 아니다 — 0 도 값이다.
  const z = new Array(nx * ny).fill(0);
  assert.equal(erodedGridNodes(z, nx, ny, false)[2 * nx + 3], 1);
});

test('쪼개 만든 판은 한 번에 만든 판과 같다 — 화면을 멈추지 않으려고 쪼갤 뿐이다', async () => {
  const whole = buildOceanMask(world, { res: 1 });
  let clock = 0;
  let pauses = 0;
  const parts = await buildOceanMaskAsync(world, {
    res: 1,
    budgetMs: 8,
    now: () => { clock += 3; return clock; },              // 행 하나에 3ms 가 든 기기인 셈
    pause: async () => { pauses += 1; },
  });
  assert.ok(pauses >= 40, `쉬어 간 횟수 ${pauses} — 예산을 넘겨도 쉬지 않았다`);
  assert.deepEqual(Array.from(parts.cells), Array.from(whole.cells));
  assert.equal(parts.sea, whole.sea);
  assert.equal(parts.usable, true);
  const gone = await buildOceanMaskAsync(() => 0, { res: 1, pause: async () => {} });
  assert.equal(gone.usable, false);
});

test('카드 한 줄 — 바다에만 칠한다는 것과 해안 정밀도를 칸 크기에서 계산해 적는다', () => {
  const line = oceanMaskCardLine(mask);
  assert.match(line, /바다에만 칠합니다/);
  assert.match(line, /해안 정밀도 약 28 km/);              // 0.25° × 111.195 km
  assert.match(line, /확대해도 더 정밀해지지 않습니다/);
  assert.match(oceanMaskCardLine(buildOceanMask(world, { res: 0.5 })), /약 56 km\(0\.5° 칸/);
});

// ---- 끝에서 끝까지: 실제 LiveLayers 를 node 에서 돌린다 --------------------------------------------
// live-layers.js 가 DOM 에서 쓰는 것은 buildField 의 캔버스 하나뿐이다 — 그것만 흉내 낸다.
// 마지막으로 putImageData 에 넘어온 그림을 붙들어 '무엇이 칠해졌나'를 센다.
const fakeDom = { last: null };
const installFakeCanvas = () => {
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData: (img) => { fakeDom.last = img; },
      }),
    }),
  };
};
const paintedPixels = (img) => {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n += 1;
  return n;
};
// 5° 전지구 격자(marine-grid 와 같은 꼴). 파고 격자는 해안 육지의 점에도 값이 있다 — 버그의 재료 그대로.
const globalGrid = (key, fill) => {
  const nx = 72; const ny = 33;
  const values = new Array(nx * ny);
  for (let i = 0; i < values.length; i += 1) values[i] = fill(i % nx, Math.floor(i / nx));
  return { nx, ny, res: 5, lat0: -80, lon0: -180, [key]: values, time: '2026-09-20T00:00', observed: '2026-09-20T00:00:00Z' };
};

test('끝에서 끝까지 — 바다 3종의 껍질에는 같은 가림판 한 장이 걸리고 카드가 그 사실을 말한다', async () => {
  installFakeCanvas();
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  const ll = new LiveLayers({ add() {} }, world, () => 50, () => '');
  // 두 바다 레이어를 **동시에** 짓는다 — 통계(_fieldStat)가 서로 섞이면 카드의 칸 수가 남의 것이 된다.
  const [wave, sst] = await Promise.all([
    ll.buildFromData('wavefield', globalGrid('wave', (x) => (x < 10 ? 1.5 : null))),   // 값 330칸
    ll.buildFromData('sstfield', globalGrid('sst', () => 18)),                          // 값 2,376칸
  ]);
  const am = wave.obj.material.alphaMap;
  assert.ok(am && am.isDataTexture, '파고 껍질에 가림판이 없다');
  assert.equal(am.image.width, 1440);
  assert.equal(am.image.height, 720);
  assert.equal(am.flipY, false);
  assert.equal(sst.obj.material.alphaMap, am, '가림판은 세 레이어가 한 장을 같이 써야 한다');
  const g = (lat, lon) => {
    const c = maskCellOf(mask, lat, lon);
    return am.image.data[(c.row * 1440 + c.px) * 4 + 1];
  };
  assert.equal(g(0, -150), 255, '먼 바다가 가려졌다');
  assert.equal(g(0, 20), 0, '대륙이 가려지지 않았다');
  assert.equal(g(-80, 0), 0, '남극이 가려지지 않았다');
  assert.match(wave.meta.cardHtml, /바다에만 칠합니다<\/b> · 해안 정밀도 약 28 km/);
  assert.match(sst.meta.cardHtml, /바다에만 칠합니다<\/b> · 해안 정밀도 약 28 km/);
  assert.match(wave.meta.note, /^330셀/);
  assert.match(sst.meta.note, /^2,376셀/);
  // 색 텍스처는 그대로다 — 가림판은 지울 뿐 칠하지 않는다.
  assert.ok(wave.obj.material.map.isCanvasTexture);
  assert.equal(wave.obj.material.transparent, true);
  // 레이어를 버려도 공용 가림판은 버리지 않는다.
  let disposed = 0;
  am.dispose = () => { disposed += 1; };
  ll.disposeObj(wave.obj);
  assert.equal(disposed, 0);
  const anom = await ll.buildFromData('sstanom', {
    nx: 4, ny: 4, res: 0.5, lat0: 30.125, lon0: 125.125, sstAnom: new Array(16).fill(1.2), observed: '2026-09-19T00:00:00Z',
  });
  assert.equal(anom.obj.material.alphaMap, am);
  assert.match(anom.meta.cardHtml, /바다에만 칠합니다/);
  // 대기 색면은 육지 위에도 값이 있는 것이 맞다 — 가림판이 걸리면 기온이 바다에만 남는다.
  const air = await ll.buildFromData('tempgrid', globalGrid('t', () => 21));
  assert.equal(air.obj.material.alphaMap, null);
  assert.doesNotMatch(air.meta.cardHtml, /바다에만 칠합니다/);
});

test('끝에서 끝까지 — 지형을 못 받으면 먼 바다만 칠하고 그렇게 말한다 (전부도 0 도 아니다)', async () => {
  installFakeCanvas();
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  // 경도 열 20~29 가 육지(값 없음), 나머지는 바다.
  const grid = globalGrid('wave', (x) => (x >= 20 && x < 30 ? null : 2));
  const built = await ll.buildFromData('wavefield', grid);
  assert.equal(built.obj.material.alphaMap, null);
  const valued = (72 - 10) * 33;
  const painted = paintedPixels(fakeDom.last);
  assert.equal(painted, (72 - 12) * 33, '육지에 닿은 두 열만 비워야 한다');
  assert.ok(painted > 0 && painted < valued);
  assert.match(built.meta.note, new RegExp(`^${valued.toLocaleString()}셀`));   // 통계는 받은 자료의 것
  assert.match(built.meta.cardHtml, /지형 자료를 받지 못해/);
  assert.doesNotMatch(built.meta.cardHtml, /바다에만 칠합니다/);
  // 쓸 수 없는 판은 붙들지 않는다 — 지형이 뒤늦게 오면 다음 갱신에서 가림판이 걸린다.
  ll.heightAt = world;
  const again = await ll.buildFromData('wavefield', grid);
  assert.ok(again.obj.material.alphaMap && again.obj.material.alphaMap.isDataTexture);
  assert.equal(paintedPixels(fakeDom.last), valued, '가림판이 있으면 색 텍스처는 깎지 않는다');
});

// ⚠️ 2026-09-20(작업 D3) — 이 절이 지키는 것이 바뀌었다.
//   바다 3종(sstfield · wavefield · sstanom)의 **살아 있는 길**은 이제 W1 셰이더 색면이다: 값 텍스처(grid-frames.js)를
//   올리고 셰이더가 지형 고도 ≥ 0 인 프래그먼트를 버린다(field-renderer.js FIELD_MASK_OCEAN). 0.25° CPU 가림판이
//   비우던 해안 15~40 km 와 다도해·대한해협이 돌아왔다.
//   아래 줄들은 그러므로 **살아 있는 배선이 아니라 옛 길의 모양**을 지킨다. 지우지 않고 남겨 두는 이유:
//     · LiveLayers.toggle 이 isFieldLayerId 로 먼저 갈라지므로 이 case 들은 닿지 않는다(죽은 코드다).
//     · 그래도 남긴 것은 새 길이 못 서는 자료(예: 아직 안 옮긴 색면)가 이 길을 다시 탈 수 있어서다 —
//       그때 가림판이 통째로 빠져 있으면 육지가 다시 물든다. 모양이 무너지지 않았는지만 본다.
//   ocean-land-mask.js 자체는 남긴다: 0.25° 로 고도를 분류하는 유일한 부품이고 erodedGridNodes 는
//   옛 buildField 의 대체 규칙이다. 다만 **바다 3종은 더는 부르지 않는다** — 그 몫은 셰이더의 uHasHeight 갈림이 한다
//   (지형을 못 받은 세션에서는 '네 칸이 다 값일 때만 칠한다'로 자료 자신의 결측이 해안선 노릇을 한다).
// ⚠️ 2026-09-20(반박 검증) — 이 절이 **더는 옛 줄의 글자를 잠그지 않는다.**
//   먼젓번 글은 `case 'sstfield': return this.oceanFieldLayer(…)` 같은 죽은 줄을 글자 그대로 대조했다.
//   스스로 '지금은 닿지 않는 길'이라 적어 놓고 그 글자를 붙들고 있었으니, 언젠가 그 줄을 지우려는 사람은
//   고칠 것이 없는데도 이 시험을 고쳐야 했다. 남은 색면(강수·기압·자외선)이 옮겨지는 날 옛 길을 파일째
//   지울 수 있도록, 여기서는 **지금도 참이어야 하는 것**만 본다:
//     · 새 길의 문 셋이 닫혀 있다(켜기 · 갱신 · 과장 변경) — 이것이 옛 길을 죽은 코드로 만드는 근거다.
//     · 옮겨 간 색면 중 누구도 가림판을 부르지 않는다 — 새 길의 육지 가림은 셰이더가 한다
//       (육지 판 uLandMask + 고도 · land-mask.js · field-renderer.js FIELD_MASK_OCEAN).
//   ocean-land-mask.js 자체는 남긴다: 0.25° 로 고도를 분류하는 유일한 부품이고, 위의 순수 계산 절들은
//   그 부품을 직접 부르므로 이 파일이 지워지면 함께 지워진다.
test('새 길의 문이 닫혀 있다 — 옛 가림판은 이제 죽은 코드다(글자를 잠그지 않는다)', () => {
  // 켜고 끄기 · 갱신 · 과장 변경 — 세 문이 모두 isFieldLayerId 에서 먼저 갈린다.
  assert.match(liveSrc, /if \(isFieldLayerId\(id\)\) return toggleFieldLayer\(this, id\);/);
  assert.match(liveSrc, /if \(isFieldLayerId\(id\)\) return false;/);
  assert.match(liveSrc, /if \(isFieldLayerId\(id\)\) continue;/);
  // 옮겨 간 색면은 새 길의 두 모듈에만 있다 — 그 어디에도 가림판을 들여오거나 부르는 줄이 없다(주석은 셈하지 않는다).
  for (const rel of ['field-layer.js', 'grid-frames.js', 'land-mask.js']) {
    const code = readFileSync(new URL(`../../prototype/v2-three/js/${rel}`, import.meta.url), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /ocean-land-mask|oceanMask\(|erodedGridNodes|alphaMap/, `${rel} 이 옛 가림판을 부른다`);
  }
  // 갱신표에서도 빠졌다 — refresh(id) 가 false 를 내므로 남겨 두면 타이머만 헛돈다.
  const table = liveSrc.match(/static get REFRESH_MIN\(\)[\s\S]*?\n  \}/)[0];
  for (const id of ['sstfield', 'wavefield']) {
    assert.doesNotMatch(table.replace(/^\s*\/\/.*$/gm, ''), new RegExp(`${id}\\s*:`), `REFRESH_MIN 에 죽은 줄 '${id}' 가 남았다`);
  }
});
