// EARTHUS v2 — 잠기는 땅의 '바다에서 물이 닿나' 판 (2026-09-20 작업 E1 반박 검증 수정 · 결함 major)
//
// 무엇이 잘못돼 있었나: flood-overlay.js 는 '고도 < 상승폭'인 육지를 전부 칠했다. 욕조식 근사에는 맞는 말이지만
// 그 욕조에는 **마개가 없었다** — 바다와 이어지지 않은 내륙 저지까지 '해수면 상승으로 잠기는 땅'으로 칠했다.
// 운영 자료로 직접 셌다(ar6.json 1,016곳 · Natural Earth admin-0 깎은 판 · Terrarium z4 · SSP5-8.5/2100):
//   칠해지는 육지 688,744 km² 가운데 **바다와 이어지는 것은 33.7% 뿐**이고 66.3%(456,653 km²)는 어떤 경로로도 바다에 닿지 않는다.
//   깊이 칸도 한 칸뿐이었다 — 칠해진 면적의 67.6% 가 '≥2 m' 칸이고, 그 값이 사해 −415 m · 카타라 −77 m · 다나킬 · 투르판이었다.
// 전지구 뷰에서 눈에 들어오는 파란 것이 카스피 저지 하나였다. PD 가 '해수면이 오르면 어디가 물에 잠기나'를 눌러
// 받는 답이 '중앙아시아와 사하라의 사막'이었다.
//
// 이 파일이 하는 일: 0.25° 격자 한 장에 **대양에서 욕조 물을 채워** 물이 닿는 칸만 표시한다.
// flood-overlay.js 가 그 판을 값 텍스처 한 장으로 올리고, 셰이더는 닿지 않는 칸을 discard 한다.
//
// ── 씨앗을 고도로 뿌리면 안 되는 이유 (가장 중요한 함정) ─────────────────────────────────────────────────────
//   '고도 < 0 이면 바다' 나 '육지 판이 아니면 바다' 로 씨를 뿌리면 **카스피해가 대양이 된다**:
//   수면이 −28 m 이고 Natural Earth admin-0 국가 폴리곤에도 없다. 그러면 이 셈이 스스로 아무 일도 하지 않는다
//   (카스피 저지가 '카스피해에서 물이 닿는 땅'이 되어 그대로 칠해진다). 그래서 씨앗은 **대양의 정해진 점**이다.
//
// ── 왜 한 번만 굽나 · 왜 가장 큰 상승폭으로 굽나 ──────────────────────────────────────────────────────────────
//   지나갈 수 있는 칸을 '고도 < 그 자리의 상승폭'으로 보면 판이 시나리오·연도마다 달라진다. 12칸을 다 구우면
//   1,200만 번 지형을 읽어야 한다. 대신 **12칸의 최대 상승폭**으로 한 번 굽는다: 상승폭이 작아지면 지나갈 수 있는
//   칸은 줄어들 뿐이므로, 최대에서 닿지 않는 칸은 **어느 시나리오에서도 닿지 않는다.** 한쪽으로만 틀리는 근사다
//   (작은 시나리오에서 실제로는 막힌 칸을 '닿는다'고 볼 수 있다 — 칠하는 쪽으로 틀리므로 땅을 숨기지 않는다).
//
// ── 왜 한 칸 부풀린 뒤 다시 채우나 ───────────────────────────────────────────────────────────────────────────
//   0.25° 는 약 28 km 다. 삼각주와 간척지를 바다로 잇는 물길은 그보다 훨씬 좁아서, 격자 한 칸이 통째로 '벽'이 되어
//   진짜 해안 저지가 내륙 분지로 오독된다. 실측(같은 자료): 그냥 채우면 네덜란드는 칠해지는 24칸 중 20칸만,
//   미시시피 하류는 13칸 중 11칸만 이어진 것으로 나왔다.
//   그래서 채운 뒤 **한 칸 부풀려 그 벽을 넘고, 넘어간 자리에서 마저 채운다.** 네덜란드 24/24 · 미시시피 13/13 ·
//   아마존 하류 7칸 중 3칸이 살아나고 닿는 몫이 33.8% → 40.6% 가 되는데, **닫힌 분지는 그대로 닫힌 채다**:
//   카스피 저지 390칸 중 0 · 사해 6칸 중 0 · 솔턴호 7칸 중 0 · 투르판 6칸 중 0 · 에어호 22칸 중 0 ·
//   카타라·사하라 41칸 중 1 · 다나킬 11칸 중 1.
//   ⚠️ **두 칸**으로 늘리면 무너진다(같은 자료로 재 봤다): 카타라·사하라가 41칸 중 33칸, 다나킬이 11칸 중 7칸으로
//      터진다 — 56 km 짜리 다리는 진짜 문턱을 넘어 버린다. 한 칸이 격자 자신의 오차와 같은 크기라서 한 칸이다.
//   이 숫자들이 시험에 그대로 들어 있지는 않다(전지구 지형 자료를 시험이 받지 않는다) — 합성 지형으로 같은 성질을 잰다.
//   ⚠️ 부풀리기는 **닿는 쪽으로만** 틀린다. 칠하지 말아야 할 땅을 살릴 수는 있어도, 칠해야 할 땅을 지우지 않는다.
//
// DOM · THREE 를 모른다. 지형은 주입받는 함수 하나(heightAt)뿐이라 시험이 합성 지형을 그대로 넣는다.

/** 판 한 칸의 크기(°). 육지 판(land-mask.js LAND_MASK_RES)과 **같은 격자**다 — 두 판이 같은 칸을 가리켜야 화면이 갈라지지 않는다. */
export const FLOOD_REACH_RES = 0.25;
/** 부풀리는 칸 수(약 28 km). 한 칸인 이유는 머리말 '왜 한 칸 부풀린 뒤 다시 채우나' 의 ⚠️ 두 줄에 있다. */
export const FLOOD_REACH_GROW = 1;
/**
 * 욕조 물을 붓는 자리 — 대양의 깊은 점들이다. 고도나 국가 경계로 뽑지 않는다(머리말의 함정).
 * 다섯 대양과 갈라진 바다 몇을 고루 짚는다: 한 점이 어쩌다 섬 위에 떨어져도 나머지가 같은 물을 채운다.
 */
export const FLOOD_OCEAN_SEEDS = Object.freeze([
  Object.freeze([0, -140]),    // 태평양 한가운데
  Object.freeze([0, -30]),     // 대서양 적도
  Object.freeze([-20, 80]),    // 인도양
  Object.freeze([-60, 0]),     // 남극해
  Object.freeze([85, 0]),      // 북극해
  Object.freeze([30, -60]),    // 북대서양 서쪽
  Object.freeze([40, -160]),   // 북태평양
  Object.freeze([0, 150]),     // 서태평양
]);

/** 빈 판 한 장. cells = 대양에서 물이 닿나(0|1) · pass = 지나갈 수 있는 칸인가(0|1). 행 0 = 남쪽(land-mask.js 와 같은 규약). */
export function createReachGrid(res = FLOOD_REACH_RES) {
  const width = Math.round(360 / res);
  const height = Math.round(180 / res);
  return { res, width, height, cells: new Uint8Array(width * height), pass: new Uint8Array(width * height), reached: 0, grown: 0, seeded: 0 };
}

/** 칸 한가운데의 좌표 — land-mask.js cellCenter 와 같은 규약이다. */
export const reachCellCenter = (grid, x, y) => ({
  lat: -90 + (y + 0.5) * grid.res,
  lon: -180 + (x + 0.5) * grid.res,
});

/**
 * 행 묶음 [y0, y1) 의 '지나갈 수 있나'를 채운다 — 쉬어 가며 부를 수 있게 행으로 쪼갠다.
 *   riseAt(lat, lon) → 그 자리의 **가장 큰** 상승폭(m · 머리말)
 * 지나갈 수 있는 칸 = 고도 < max(상승폭, 0). max(…,0) 이 있는 이유: 땅이 솟아 상승폭이 음수인 곳(스칸디나비아 ·
 * 알래스카의 빙하 반동)에서 해수면 아래의 얕은 바다가 '벽'이 되어 물길이 끊기는 것을 막는다 — 지금 바다인 칸은 늘 물이다.
 */
export function markReachPassable(grid, { heightAt, riseAt }, y0 = 0, y1 = grid.height) {
  const { width, res, pass } = grid;
  for (let y = Math.max(0, y0); y < Math.min(grid.height, y1); y += 1) {
    const lat = -90 + (y + 0.5) * res;
    for (let x = 0; x < width; x += 1) {
      const lon = -180 + (x + 0.5) * res;
      const h = heightAt(lat, lon);
      const r = riseAt(lat, lon);
      pass[y * width + x] = Number.isFinite(h) && h < Math.max(Number.isFinite(r) ? r : 0, 0) ? 1 : 0;
    }
  }
  return grid;
}

/**
 * 씨앗에서 4방향으로 물을 채운다(경도는 감기고 위도는 극에서 멈춘다 — 격자의 생김새 그대로).
 * 되돌이(recursion)가 아니라 줄서기(queue)다: 1,036,800칸에서 되돌이는 스택을 넘긴다.
 * **이미 표시된 칸도 전부 물가로 친다** — 처음 부를 때는 씨앗뿐이지만, 한 칸 부풀린 뒤 다시 부르면
 * 벽을 넘어간 자리에서 이어 채운다(머리말 '왜 한 칸 부풀린 뒤 다시 채우나').
 */
export function fillFromOcean(grid, seeds = FLOOD_OCEAN_SEEDS) {
  const { width, height, res, cells, pass } = grid;
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const cellOf = (lat, lon) => {
    let y = Math.floor((lat + 90) / res);
    y = Math.max(0, Math.min(height - 1, y));
    let x = Math.floor((lon + 180) / res);
    x = ((x % width) + width) % width;
    return y * width + x;
  };
  for (const [lat, lon] of seeds) {
    const c = cellOf(lat, lon);
    if (!pass[c] || cells[c]) continue;        // 씨앗이 물이 아니면 조용히 건너뛴다(합성 지형 시험에서 흔하다)
    cells[c] = 1;
    grid.seeded += 1;
  }
  for (let c = 0; c < cells.length; c += 1) {
    if (!cells[c]) continue;
    queue[tail] = c;
    tail += 1;
  }
  while (head < tail) {
    const c = queue[head];
    head += 1;
    const y = (c / width) | 0;
    const x = c - y * width;
    const up = y > 0 ? c - width : -1;
    const dn = y < height - 1 ? c + width : -1;
    const lt = y * width + ((x - 1 + width) % width);
    const rt = y * width + ((x + 1) % width);
    for (let i = 0; i < 4; i += 1) {
      const n = i === 0 ? up : i === 1 ? dn : i === 2 ? lt : rt;
      if (n < 0 || cells[n] || !pass[n]) continue;
      cells[n] = 1;
      queue[tail] = n;
      tail += 1;
    }
  }
  grid.reached = tail;
  return grid;
}

/**
 * 닿는 칸을 한 칸씩 부풀린다(머리말 '왜 두 칸 부풀리나'). 지나갈 수 있나와 무관하게 이웃으로 번진다 —
 * 격자가 삼킨 좁은 물길을 되돌리는 것이 목적이라, 격자가 '벽'이라 부르는 칸을 일부러 넘는다.
 */
export function growReach(grid, steps = FLOOD_REACH_GROW) {
  const { width, height } = grid;
  for (let s = 0; s < steps; s += 1) {
    const src = Uint8Array.from(grid.cells);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const c = y * width + x;
        if (src[c]) continue;
        const up = y > 0 ? c - width : -1;
        const dn = y < height - 1 ? c + width : -1;
        const lt = y * width + ((x - 1 + width) % width);
        const rt = y * width + ((x + 1) % width);
        if ((up >= 0 && src[up]) || (dn >= 0 && src[dn]) || src[lt] || src[rt]) {
          grid.cells[c] = 1;
          grid.grown += 1;
        }
      }
    }
  }
  return grid;
}

/** 한 점이 '대양에서 물이 닿는 칸'인가 → 0 | 1. 셰이더가 NearestFilter 로 고르는 칸과 같은 칸을 고른다(land-mask.landAt 와 같은 식). */
export function reachAt(grid, lat, lon) {
  if (!grid || !grid.cells || !Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
  const { width, height, res, cells } = grid;
  let x = Math.floor((lon + 180) / res);
  x = ((x % width) + width) % width;
  let y = Math.floor((lat + 90) / res);
  if (y < 0) y = 0;
  if (y > height - 1) y = height - 1;
  return cells[y * width + x] ? 1 : 0;
}

/** 판 → RGBA 바이트. 셰이더는 R 만 읽는다(닿음 255 · 아님 0). 행 0 = 남쪽 그대로 담는다(DataTexture 는 flipY 가 없다). */
export function reachRGBA(grid) {
  const n = grid.cells.length;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const v = grid.cells[i] ? 255 : 0;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** 판이 말해 주는 것 — 카드가 숫자로 적는다. */
export function reachInfo(grid) {
  const total = grid.cells.length;
  let on = 0;
  for (let i = 0; i < total; i += 1) on += grid.cells[i];
  return {
    res: grid.res, cellKm: Math.round(grid.res * 111.195), grow: grid.growSteps ?? null,
    growKm: grid.growSteps == null ? null : Math.round(grid.growSteps * grid.res * 111.195),
    reached: grid.reached, seeded: grid.seeded, cells: on, total,
  };
}

/** 판이 다 찬 뒤의 세 단 — 채우고 · 한 칸 넘고 · 마저 채운다. 동기·비동기가 **같은 함수**를 부른다(쪼개도 결과가 같아야 한다). */
export function finishReach(grid, { grow = FLOOD_REACH_GROW, seeds = FLOOD_OCEAN_SEEDS } = {}) {
  fillFromOcean(grid, seeds);
  grid.growSteps = grow;
  if (grow > 0) {
    growReach(grid, grow);
    fillFromOcean(grid, seeds);
  }
  return grid;
}

/** 한 번에 굽는다(시험 · node 용). */
export function buildOceanReach(deps, { res = FLOOD_REACH_RES, grow = FLOOD_REACH_GROW, seeds = FLOOD_OCEAN_SEEDS } = {}) {
  const grid = createReachGrid(res);
  markReachPassable(grid, deps);
  return finishReach(grid, { grow, seeds });
}

/**
 * 화면을 멈추지 않고 굽는다(브라우저 용). budgetMs 만큼 돌고 한 번 쉰다 — ocean-land-mask.buildOceanMaskAsync 와 같은 길이다.
 * 쪼개 구운 판이 한 번에 구운 판과 **같아야** 한다(시험이 그것을 잰다): 그래서 쪼개는 것은 지형 읽기뿐이고,
 * 물 채우기와 부풀리기는 판이 다 찬 뒤에 통째로 한 번 돈다.
 */
export async function buildOceanReachAsync(deps, {
  res = FLOOD_REACH_RES,
  grow = FLOOD_REACH_GROW,
  seeds = FLOOD_OCEAN_SEEDS,
  budgetMs = 8,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  pause = () => new Promise((resolve) => { setTimeout(resolve, 0); }),
  onProgress = null,
} = {}) {
  const grid = createReachGrid(res);
  let row = 0;
  while (row < grid.height) {
    const t0 = now();
    do {
      markReachPassable(grid, deps, row, row + 1);
      row += 1;
    } while (row < grid.height && now() - t0 < budgetMs);
    if (onProgress) onProgress(row, grid.height);
    if (row < grid.height) await pause();
  }
  return finishReach(grid, { grow, seeds });
}
