// EARTHUS v2 — 바다 색면의 육지 가림 (DEV-DIRECTIVE 2026-09-20 · ocean.common.land_mask_hotfix)
//
// 무엇이 잘못돼 있었나: 바다 격자 3종(sstfield · wavefield · sstanom)은 반지름 1.0012 고정 구
// 껍질에 칠해진다(live-layers.js buildField). 지형은 max(h,0)/6371000 × 과장(기본 50)만큼 솟으므로
// 해발 약 153 m 이하 육지는 껍질 **아래**에 놓여 물빛에 덮였다. 가까이 가면 과장이 자동으로
// 낮아져(main.js 프레임 루프의 exagCeil) 764 m → 1,529 m 까지 잠겼다. 5° 격자 한 칸(555 km)이
// 통째로 칠해지고 LinearFilter 가 반 칸 더 번지니, PD 눈에는 '파고를 누르면 육지가 물에 잠긴다'였다.
//
// 어떻게 막나: 지구본이 이미 가진 고도(heightAtJs · Terrarium z4)를 0.25° 칸으로 한 번 훑어
// '바다로 확인된 칸'만 남기는 가림판을 만들고, 껍질 재질의 alphaMap 으로 건다.
//   · 색 텍스처(자료 격자)는 건드리지 않는다 — 가림판은 **지울 뿐 칠하지 않는다.**
//   · 가림판은 세 레이어가 한 장을 같이 쓴다(지형은 로딩 뒤 바뀌지 않는다 — main.js heightAtJs 주석).
//   · 과장과 무관하다. 고도의 **부호**만 보므로 1× 에서도 50× 에서도 같은 판이다.
//
// 왜 셰이더(지시서의 나·다 안)가 아닌가: 이 작업은 브라우저 없이 시험만으로 합쳐진다. GLSL 은
// node 에서 돌릴 수 없어 '육지 위에 색이 없다'를 시험으로 잠글 수 없고, 컴파일이 한 번 깨지면
// 바다 3종이 통째로 꺼진다. 프래그먼트 단위 해안선은 P1 공통 렌더러(W1)의 몫으로 남긴다.
//
// 남은 한계 (고친 척하지 않으려고 적어 둔다)
//   · 곧은 해안에서 약 15~40 km 까지는 색이 없고 40~70 km 부터 온전하다(대각 해안은 그 1.4배).
//     섬 하나는 둘레 3×3 칸(약 83 km)을 비우므로 폭 80 km 안쪽의 좁은 바다(대한해협 서수도 · 다도해 ·
//     세토 내해)는 통째로 비어 보인다. 육지에 닿은 칸 + 이웃 칸(아래 finalizeOceanMask)을 비우는 값이다.
//     고장이 아니다 — 카드가 같은 말을 한다(oceanMaskCardLine).
//   · 해수면보다 낮은 육지는 고도 부호로는 바다와 구별되지 않는다. 좁은 곳(네덜란드 간척지 · 사해)은
//     해안 띠에 묻혀 비지만, 넓은 곳(카스피해 북쪽 저지 약 −28 m · 카타라 저지 약 −133 m)은 '바다'로 읽힌다.
//     수온 · 평년 대비 수온은 자료가 육지에서 값이 없어(OISST) 칠해지지 않는다. 파고(5°)는 해안 육지의
//     점에도 값을 실어 오므로 그 두 곳에 색이 앉을 수 있다 — 운영 자료로 확인하지 못했다.
//   · 정밀도는 z4 고도(9.8 km/px)가 아니라 이 판의 칸(0.25° ≈ 28 km)이 정한다. 확대해도 나아지지 않는다.
//
// 이 파일은 DOM · THREE 를 모른다 — tools/earthus-v53/ocean-land-mask.test.mjs 가 그대로 부른다.

// 가림판 한 칸의 크기(°). 1440×720 — 어떤 기기의 텍스처 한도(2048)에도 들어간다.
// 0.125°(2880×1440)는 RGBA 16.6 MB 이고 2048 한도 기기에서 DataTexture 가 통째로 실패한다
// (실패한 alphaMap 은 0 으로 읽혀 바다까지 전부 사라진다).
export const OCEAN_MASK_RES = 0.25;
// 칸 하나를 2×2 점으로 본다(점 간격 0.125°). z4 고도 한 텍셀(0.088°)은 겹선형으로 ±0.088° 에
// 영향을 주므로, 0.125° 간격이면 z4 가 아는 섬은 빠뜨리지 않는다. 칸 중심 한 점만 보면
// 점 사이(0.25°)로 울릉도만 한 섬이 빠져나간다.
export const OCEAN_MASK_SUB = 2;
// 바다로 확인된 칸이 이 비율에 못 미치면 지형 타일이 대부분 실패한 것으로 본다.
// 지구의 바다는 약 71% 다 — 그 절반에도 못 미치는 판으로 가리면 '전부 가려짐'에 가깝다.
export const OCEAN_MASK_MIN_SEA = 0.30;

const KM_PER_DEG = 111.195; // 6,371 km × π / 180

export const CELL = Object.freeze({
  SEA: 0,      // 칸 안의 모든 점이 해수면 아래 — 칠한다
  COAST: 1,    // 바다이지만 육지·모름 칸과 맞닿아 있다 — 비운다(아래 finalize 주석)
  LAND: 2,     // 점 하나라도 해수면 위 — 비운다
  UNKNOWN: 3,  // 고도를 모른다 — 비운다
});

// 고도 한 점의 판정.
// ⚠️ 정확히 0 은 '해수면'이 아니라 **모름**이다. 지형 타일이 실패하면 main.js 가 그 자리를
//    rgb(128,0,0) = 정확히 0 m 로 채우고(loadTerrariumHeightCanvas), 지형이 통째로 없으면
//    heightAtJs 가 어디서나 0 을 돌려준다. 0 을 육지로 읽으면 바다까지 전부 사라지고,
//    0 을 바다로 읽으면 실패한 타일 위의 육지가 다시 물빛에 덮인다 — 어느 쪽도 아닌 '모름'으로 둔다.
//    (지시서 원문은 'h ≥ 0 이면 알파 0'이다. 칠하지 않는다는 결과는 같고, 이유만 나눠 적었다.)
export function classifyHeight(h) {
  if (!Number.isFinite(h) || h === 0) return CELL.UNKNOWN;
  return h < 0 ? CELL.SEA : CELL.LAND;
}

// 빈 가림판. 행 0 이 **남쪽**이다 — DataTexture 는 flipY=false 가 기본이라 첫 행이 v=0(남극)에
// 놓인다. 캔버스(CanvasTexture · flipY=true)와 위아래가 반대이니 섞어 쓰지 말 것.
export function createOceanMask(res = OCEAN_MASK_RES) {
  const width = Math.round(360 / res);
  const height = Math.round(180 / res);
  return { res, width, height, cells: new Uint8Array(width * height).fill(CELL.UNKNOWN) };
}

// 칸 (px,row) 의 중심 좌표 — 시험과 판독이 같은 식을 쓰게 밖으로 낸다.
export const maskCellCenter = (mask, px, row) => ({
  lat: -90 + (row + 0.5) * mask.res,
  lon: -180 + (px + 0.5) * mask.res,
});
export const maskCellOf = (mask, lat, lon) => ({
  px: ((Math.floor((lon + 180) / mask.res) % mask.width) + mask.width) % mask.width,
  row: Math.min(mask.height - 1, Math.max(0, Math.floor((lat + 90) / mask.res))),
});

// row0 이상 row1 미만의 행을 판정한다. 한 번에 다 돌지 않고 행 단위로 쪼개 부를 수 있게 했다 —
// 전 지구 415만 점은 데스크톱 0.2초(실측 54 ns/점)지만 휴대폰은 그 몇 배다(buildOceanMaskAsync).
export function classifyOceanMaskRows(mask, heightAt, row0, row1, sub = OCEAN_MASK_SUB) {
  const { res, width, height, cells } = mask;
  const end = Math.min(height, row1);
  for (let row = Math.max(0, row0); row < end; row += 1) {
    for (let px = 0; px < width; px += 1) {
      let cls = CELL.SEA;
      scan:
      for (let j = 0; j < sub; j += 1) {
        const lat = -90 + (row + (j + 0.5) / sub) * res;
        for (let i = 0; i < sub; i += 1) {
          const lon = -180 + (px + (i + 0.5) / sub) * res;
          const c = classifyHeight(heightAt(lat, lon));
          if (c === CELL.LAND) { cls = CELL.LAND; break scan; }   // 육지 한 점이면 그 칸은 끝났다
          if (c === CELL.UNKNOWN) cls = CELL.UNKNOWN;
        }
      }
      cells[row * width + px] = cls;
    }
  }
}

// 판정이 끝난 판에 해안 띠(COAST)를 두르고 통계를 낸다.
//
// 왜 한 칸을 더 비우나: 가림판은 GPU 에서 LinearFilter 로 읽힌다. 바다 칸(255) 옆이 육지 칸(0)이면
// 알파가 두 칸 **중심 사이**에서 서서히 0 이 되므로, 색이 육지 칸의 앞 절반까지 번져 들어간다 —
// 그 육지 칸의 어디에 땅이 있는지는 모른다. 육지·모름 칸과 맞닿은 바다 칸을 함께 0 으로 두면
// 번짐이 끝나는 자리(그 칸의 중심)까지가 전부 '바다로 확인된 칸' 안이다. 색이 닿는 모든 점이
// SEA 또는 COAST 칸 안이라는 것 — 이것이 '육지 위에 색이 없다'의 근거이고 시험이 잠근다.
// 값으로는 해안에서 한두 칸(28~56 km)의 바다를 잃는다. 수온 1° · 파고 5° 자료의 한 칸보다 좁고,
// 평년 대비 수온 0.5°(약 55 km)와는 비슷하다 — 자료가 애초에 말해 주지 못하는 폭이다.
export function finalizeOceanMask(mask) {
  const { width, height, cells } = mask;
  const out = new Uint8Array(cells);        // 이웃 판정은 원본에서 읽는다 — 띠가 띠를 부르면 안 된다
  let sea = 0; let coast = 0; let land = 0; let unknown = 0;
  for (let row = 0; row < height; row += 1) {
    for (let px = 0; px < width; px += 1) {
      const c = cells[row * width + px];
      if (c === CELL.LAND) { land += 1; continue; }
      if (c === CELL.UNKNOWN) { unknown += 1; continue; }
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy += 1) {
        const r = row + dy;
        if (r < 0 || r >= height) continue;             // 극 너머에는 칸이 없다
        for (let dx = -1; dx <= 1; dx += 1) {
          const x = (px + dx + width) % width;          // 경도는 감긴다 — 날짜변경선에 이음매가 없다
          if (cells[r * width + x] >= CELL.LAND) { touches = true; break; }
        }
      }
      if (touches) { out[row * width + px] = CELL.COAST; coast += 1; } else sea += 1;
    }
  }
  const total = width * height;
  const seaFraction = sea / total;
  return {
    ...mask, cells: out, sea, coast, land, unknown, seaFraction,
    usable: seaFraction >= OCEAN_MASK_MIN_SEA,
    coastKm: Math.round(mask.res * KM_PER_DEG),
  };
}

// 지형이 통째로 없는지(heightAt ≡ 0) 성긴 점 648개로 먼저 본다 — 없는데 415만 점을 돌 이유가 없다.
export function terrainLooksPresent(heightAt) {
  for (let lat = -85; lat <= 85; lat += 10) {
    for (let lon = -175; lon <= 175; lon += 10) {
      if (classifyHeight(heightAt(lat, lon)) !== CELL.UNKNOWN) return true;
    }
  }
  return false;
}

// 한 번에 만드는 판(시험 · node 용).
export function buildOceanMask(heightAt, { res = OCEAN_MASK_RES, sub = OCEAN_MASK_SUB } = {}) {
  const mask = createOceanMask(res);
  if (terrainLooksPresent(heightAt)) classifyOceanMaskRows(mask, heightAt, 0, mask.height, sub);
  return finalizeOceanMask(mask);
}

// 화면을 멈추지 않고 만드는 판(브라우저 용). budgetMs 만큼 돌고 한 번 쉰다.
// now · pause 는 시험이 갈아 끼운다 — 쪼개 만든 판이 한 번에 만든 판과 같아야 한다.
export async function buildOceanMaskAsync(heightAt, {
  res = OCEAN_MASK_RES,
  sub = OCEAN_MASK_SUB,
  budgetMs = 8,
  now = () => performance.now(),
  pause = () => new Promise((resolve) => { setTimeout(resolve, 0); }),
} = {}) {
  const mask = createOceanMask(res);
  if (!terrainLooksPresent(heightAt)) return finalizeOceanMask(mask);   // 전부 모름 → usable:false
  let row = 0;
  while (row < mask.height) {
    const t0 = now();
    do {
      classifyOceanMaskRows(mask, heightAt, row, row + 1, sub);
      row += 1;
    } while (row < mask.height && now() - t0 < budgetMs);
    if (row < mask.height) await pause();
  }
  return finalizeOceanMask(mask);
}

// alphaMap 으로 올릴 RGBA 바이트. three 의 alphamap_fragment 는 .g 만 읽지만 네 채널을 같이 채운다
// (RGBAFormat DataTexture 는 cloud-volume.js 에 선례가 있다 — RG·R 포맷은 이 앱에서 써 본 적이 없다).
export function oceanMaskAlphaRGBA(mask) {
  const { cells } = mask;
  const out = new Uint8Array(cells.length * 4);
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== CELL.SEA) continue;
    const o = i * 4;
    out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; out[o + 3] = 255;
  }
  return out;
}

// GPU 가 이 판을 읽는 방식(LinearFilter · 경도 Repeat · 위도 Clamp)을 그대로 옮긴 것. 0~1.
// 시험이 '육지의 어느 점에서도 0'을 확인하는 데 쓰고, 뒤에 Inspector 가 '여기는 왜 비었나'를
// 말해야 할 때도 같은 식을 쓰면 된다.
export function sampleOceanMaskAlpha(mask, lat, lon) {
  const { width, height, cells, res } = mask;
  const fx = (lon + 180) / res - 0.5;
  const fy = (lat + 90) / res - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x, y) => {
    const xx = ((x % width) + width) % width;
    const yy = Math.min(height - 1, Math.max(0, y));
    return cells[yy * width + xx] === CELL.SEA ? 1 : 0;
  };
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty)
    + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}

// 지형을 못 받았을 때의 대체 규칙 — 자료 격자가 스스로 아는 것(값 없는 칸 = 육지·미관측)만 쓴다.
// 값이 있고 **여덟 이웃에도 전부 값이 있는** 격자점만 1. 해안에 닿은 칸은 비우고 먼 바다만 남는다.
// 전부 가리지도(레이어가 죽은 것처럼 보인다) 전부 드러내지도(고치려던 버그 그대로다) 않기 위한 것.
// 격자 밖 이웃은 세지 않는다 — 동아시아판의 가장자리를 육지로 읽으면 안 된다.
export function erodedGridNodes(values, nx, ny, wrapLon = false) {
  const ok = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y += 1) {
    for (let x = 0; x < nx; x += 1) {
      if (values[y * nx + x] == null) continue;
      let open = true;
      for (let dy = -1; dy <= 1 && open; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= ny) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          let xx = x + dx;
          if (xx < 0 || xx >= nx) {
            if (!wrapLon) continue;
            xx = (xx + nx) % nx;
          }
          if (values[yy * nx + xx] == null) { open = false; break; }
        }
      }
      if (open) ok[y * nx + x] = 1;
    }
  }
  return ok;
}

// 카드에 넣는 한 줄. 정밀도 숫자는 가림판 칸 크기에서 계산한다 — 적어 넣은 숫자가 아니다.
// z4 고도는 9.8 km/px 이지만 가림판 칸(0.25° ≈ 28 km)이 더 성기므로 병목은 칸이다.
// 확대해도 나아지지 않는다(디테일 타일 z5~z9 는 heightAtJs 에 없다) — 그것도 같이 적는다.
export function oceanMaskCardLine(info) {
  if (!info || !info.usable) {
    return '지형 자료를 받지 못해 해안선으로 가리지 못했습니다 — 값 없는 칸(육지)에 닿은 칸은 비우고 먼 바다만 칠했습니다.';
  }
  return `<b>바다에만 칠합니다</b> · 해안 정밀도 약 ${info.coastKm} km(${info.res}° 칸 · 적도 기준) — `
    + '육지에 닿은 칸과 그 이웃 칸은 비워 두며, 확대해도 더 정밀해지지 않습니다.';
}
