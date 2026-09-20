// EARTHUS v2 — 바다 색면의 '육지' 판 (2026-09-20 작업 D3 반박 검증 수정 · 결함 major)
//
// 무엇이 잘못돼 있었나: 작업 D3 은 바다 3종(수온 · 파고 · 평년 대비 수온)의 육지 가림을 셰이더로 옮기면서
// 바다와 육지를 **고도의 부호 하나로** 갈랐다(field-renderer.js `hgt >= 0.0` · field-layer.js sampleAt 의 육지 가드).
// 해수면보다 낮은 육지는 그 판으로 걸러지지 않는다. 실브라우저 재현(운영 JSON + Terrarium z4):
//   플레볼란트 52.5N 5.5E (−3 m) → 수온 18.2 °C · 파고 2.84 m  ·  요르단 계곡 32.3N 35.55E (−217 m) → 29.4 °C
//   카라기예 43.4N 51.7E (−107 m) → 22.6 °C  ·  카스피 저지 · 사해 · 솔턴호 → 파고 0.30~1.70 m
// 옛 0.25° CPU 가림판(ocean-land-mask.js)은 육지에 닿은 칸과 이웃 칸을 통째로 비워 이 자리들을 해안 띠에 묻어
// 버렸을 뿐이다 — 그 파일 머리말이 '넓은 저지(카스피 북쪽 · 카타라)는 바다로 읽힌다'고 이미 적어 두었다.
// D3 이 해안 띠를 없애면서 그 우연한 보호까지 같이 사라졌고, 카드는 그 값을 **단언**했다.
//
// 왜 문턱이 답이 아닌가: 사해 −352 · 카라기예 −107 · 카스피해 수면 −28 이 모두 '바다 아님'인데 동해는 −2,196 이다.
// 고도 하나로는 어떤 문턱으로도 가를 수 없다. 바다/육지는 고도가 아니라 **지리**다.
//
// 이 파일이 하는 일: 이미 저장소가 가진 국가 경계(prototype/data/country-reference.json · Natural Earth admin-0)를
// 등장방형 격자 한 장으로 구워 '여기는 육지'를 내놓는다. 셰이더는 uLandMask 로 읽고(프래그먼트마다 한 번),
// 클릭 판독(FieldLayer.sampleAt)은 **같은 판**을 읽는다 — 화면과 카드가 갈라지지 않는 근거가 그것이다.
//
// ── 왜 침식(erode)하나 — 이 작업이 존재하는 이유를 되돌리지 않으려고 ──────────────────────────────────────
//   국가 경계의 정밀도는 고르지 않다(country-reference.json 의 resolution): 전지구 1:110m · 한국 · 북한 · 일본만 1:10m.
//   네덜란드는 점 15개짜리 덩어리 하나다(실측). 그런 경계를 그대로 '육지'라고 쓰면 해안에서 바다 쪽으로 넘쳐
//   **해안 띠가 다시 생긴다** — 다도해 · 대한해협 · 세토 내해를 되살리려고 한 작업을 스스로 되돌리는 것이다.
//   그래서 판을 한 칸 깎는다(LAND_MASK_ERODE): 깎은 판은 늘 원판의 부분집합이므로 **바다는 잃지 않는다.**
//   깎인 해안 한 칸 안쪽(약 28 km)은 고도 가림(`hgt >= 0`)이 맡는다 — 해안 육지는 거의 해수면 위다.
//   남는 구멍은 '해수면보다 낮은 **해안** 육지'뿐이다(네덜란드 간척지). 카드가 그 한 줄을 말한다(landMaskCardLine).
//
// ── 방향 (⚠️ DataTexture 는 flipY 가 적용되지 않는다) ────────────────────────────────────────────────────────
//   행 0 이 **남쪽**이다(ocean-land-mask.js createOceanMask 와 같은 규약). 셰이더는 v = lat/π + 0.5 로 읽으므로
//   v = 0 이 남극이어야 하고, DataTexture 는 배열 첫 행을 그대로 v = 0 에 앉힌다. 시험이 이 방향을 잠근다.
//
// 이 파일은 DOM 을 모른다. THREE · fetch 는 주입받고(시험이 가짜를 넣는다) 계산은 순수 함수다 —
// tools/earthus-v53/land-mask.test.mjs 가 운영 자료를 그대로 넣어 결함의 여덟 자리를 숫자로 본다.

// 판 한 칸의 크기(°). 1440×720 — ocean-land-mask.js 가 이미 고른 값이고 어떤 기기의 텍스처 한도(2048)에도 들어간다.
// RGBA 4.1 MB. 더 잘게 구워도 1:110m 경계의 오차가 정밀도를 정하므로 나아지지 않는다.
export const LAND_MASK_RES = 0.25;
// 깎는 횟수(칸). 1 칸 = 위도로 약 28 km — 1:110m 경계가 해안에서 흔들리는 폭을 덮는다.
export const LAND_MASK_ERODE = 1;
// 국가 경계 — main.js CountryFocus 가 쓰는 것과 **같은 주소**다(브라우저 캐시를 나눠 쓴다. 저장소에 사본이 하나뿐이다).
export const LAND_COUNTRY_URL = '../data/country-reference.json';
const KM_PER_DEG = 111.195;

/** feature 의 폴리곤 목록(Polygon | MultiPolygon). 한 폴리곤 = [바깥 고리, 구멍…] */
export const polygonsOf = (feature) => {
  const g = feature && feature.geometry;
  if (!g || !Array.isArray(g.coordinates)) return [];
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
};

/** 빈 판. cells 는 0(바다·모름) | 1(육지) · 행 0 = 남쪽 · 칸 중심이 격자점이다. */
export function createLandRaster(res = LAND_MASK_RES) {
  const width = Math.round(360 / res);
  const height = Math.round(180 / res);
  return { res, width, height, cells: new Uint8Array(width * height) };
}

/** 칸 한가운데의 좌표 — 셰이더의 uv 식(u = lon/2π + 0.5 · v = lat/π + 0.5)을 되짚은 것과 같다. */
export const cellCenter = (raster, x, y) => ({
  lon: -180 + (x + 0.5) * raster.res,
  lat: -90 + (y + 0.5) * raster.res,
});

/**
 * 폴리곤 하나를 판에 채운다(짝홀 규칙 — 바깥 고리와 구멍을 한 번에 가른다).
 * 가로줄 하나에서 고리와 만나는 x 를 모아 짝지어 채운다. 교차 판정은 main.js CountryFocus.inRing 과 **같은 반열림 규칙**이라
 * 꼭짓점에서 두 번 세지 않는다.
 */
export function fillPolygon(raster, rings) {
  const { width, height, res, cells } = raster;
  let minLat = 90;
  let maxLat = -90;
  for (const ring of rings) {
    for (const p of ring) {
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
    }
  }
  const yFrom = Math.max(0, Math.floor((minLat + 90) / res - 0.5));
  const yTo = Math.min(height - 1, Math.ceil((maxLat + 90) / res - 0.5));
  const xs = [];
  for (let y = yFrom; y <= yTo; y += 1) {
    const lat = -90 + (y + 0.5) * res;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const yi = ring[i][1];
        const yj = ring[j][1];
        if ((yi > lat) === (yj > lat)) continue;
        xs.push(((ring[j][0] - ring[i][0]) * (lat - yi)) / (yj - yi) + ring[i][0]);
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    const row = y * width;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // 칸 **중심**이 두 교차 사이인 칸만 채운다 — 판을 읽는 쪽(NearestFilter · landAt)도 중심으로 고른다.
      let a = Math.ceil((xs[k] + 180) / res - 0.5);
      let b = Math.floor((xs[k + 1] + 180) / res - 0.5);
      if (a < 0) a = 0;
      if (b > width - 1) b = width - 1;
      for (let x = a; x <= b; x += 1) cells[row + x] = 1;
    }
  }
  return raster;
}

/** 국가 목록 → 깎기 전의 판. 나라끼리는 겹치지 않으므로 폴리곤마다 따로 채워 더한다(짝홀을 나라 사이로 번지게 하지 않는다). */
export function rasterizeLand(features, { res = LAND_MASK_RES } = {}) {
  const raster = createLandRaster(res);
  for (const f of features || []) {
    for (const poly of polygonsOf(f)) {
      if (Array.isArray(poly) && poly.length && Array.isArray(poly[0]) && poly[0].length > 2) fillPolygon(raster, poly);
    }
  }
  return raster;
}

/**
 * 판을 한 칸씩 깎는다 — 여덟 이웃이 다 육지인 칸만 육지로 남긴다.
 * 결과는 늘 원판의 **부분집합**이다(바다는 절대 늘지 않는다 — 시험이 그것을 본다).
 * 경도는 감고(지구는 한 바퀴다), 위도는 판 밖을 '같은 값'으로 본다(극 행을 깎지 않는다 — 남극이 통째로 사라진다).
 */
export function erodeLand(raster, steps = LAND_MASK_ERODE) {
  const { width, height } = raster;
  let cur = raster.cells;
  for (let s = 0; s < steps; s += 1) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < height; y += 1) {
      const rowUp = (y + 1 < height ? y + 1 : y) * width;
      const rowMid = y * width;
      const rowDn = (y > 0 ? y - 1 : y) * width;
      for (let x = 0; x < width; x += 1) {
        if (!cur[rowMid + x]) continue;
        const xl = x > 0 ? x - 1 : width - 1;
        const xr = x + 1 < width ? x + 1 : 0;
        if (!cur[rowMid + xl] || !cur[rowMid + xr]) continue;
        if (!cur[rowDn + xl] || !cur[rowDn + x] || !cur[rowDn + xr]) continue;
        if (!cur[rowUp + xl] || !cur[rowUp + x] || !cur[rowUp + xr]) continue;
        next[rowMid + x] = 1;
      }
    }
    cur = next;
  }
  return { res: raster.res, width, height, cells: cur };
}

/** 국가 목록 → 쓸 판 하나. rawLand 는 깎기 전의 칸 수(깎은 뒤와 견주면 얼마나 물러섰는지 보인다). */
export function buildLandMask(features, { res = LAND_MASK_RES, erode = LAND_MASK_ERODE } = {}) {
  const raw = rasterizeLand(features, { res });
  let rawLand = 0;
  for (let i = 0; i < raw.cells.length; i += 1) rawLand += raw.cells[i];
  const out = erode > 0 ? erodeLand(raw, erode) : raw;
  let land = 0;
  for (let i = 0; i < out.cells.length; i += 1) land += out.cells[i];
  return {
    ...out,
    land,
    rawLand,
    total: out.cells.length,
    erode,
    erodeDeg: erode * res,
    erodeKm: Math.round(erode * res * KM_PER_DEG),
  };
}

/**
 * 한 점이 판에서 육지인가 → 0 | 1.
 * 셰이더가 NearestFilter 로 고르는 칸과 **같은 칸**을 고른다: x = floor((lon+180)/res) · y = floor((lat+90)/res).
 */
export function landAt(raster, lat, lon) {
  if (!raster || !raster.cells || !Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
  const { width, height, res, cells } = raster;
  let x = Math.floor((lon + 180) / res);
  x = ((x % width) + width) % width;
  let y = Math.floor((lat + 90) / res);
  if (y < 0) y = 0;
  if (y > height - 1) y = height - 1;
  return cells[y * width + x] ? 1 : 0;
}

/** 판 → RGBA 바이트. 셰이더는 R 만 읽는다(육지 255 · 그 밖 0). 행 0 = 남쪽 그대로 담는다(머리말 '방향'). */
export function landMaskRGBA(raster) {
  const n = raster.cells.length;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const v = raster.cells[i] ? 255 : 0;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * 카드의 고지 한 줄 — 옛 oceanMaskCardLine 이 하던 말을 새 길의 사실로 다시 쓴다.
 * 판을 못 받은 세션에서는 고도만으로 가른다고 말한다: 고친 척하지 않는다.
 *   info  buildLandMask 의 결과(또는 null) · cell  자료 격자를 부르는 말('1° 격자(약 110 km)')
 */
export function landMaskCardLine(info, { cell = null, ko = true } = {}) {
  const km = info && Number.isFinite(info.erodeKm) ? info.erodeKm : Math.round(LAND_MASK_RES * KM_PER_DEG);
  if (!info) {
    return ko
      ? '바다에만 칠합니다 — 지금은 지형 고도로만 가릅니다. 국가 경계 판을 받지 못해 해수면보다 낮은 육지(네덜란드 간척지 · 카스피 저지 · 요르단 계곡)는 바다로 읽힙니다.'
      : 'Ocean only — masked by terrain height alone right now. The land outline failed to load, so land below sea level (Dutch polders, the Caspian depression, the Jordan valley) reads as sea.';
  }
  const cellWords = cell ? (ko ? ` ${cell} 자료라 아주 좁은 바다(보스포루스 · 마르마라)는 빌 수 있습니다.` : ` The data is on a ${cell}, so very narrow seas (the Bosphorus, Marmara) can stay empty.`) : '';
  return ko
    ? `바다에만 칠합니다 — 지형 고도와 국가 경계 판(Natural Earth admin-0)으로 가릅니다. 경계는 한국 · 일본만 1:10m 이고 나머지는 1:110m 라 판을 해안에서 ${km} km 물려 두었습니다: 해수면보다 낮은 **해안** 간척지(네덜란드)는 그 안쪽에서 아직 바다로 읽힐 수 있습니다.${cellWords}`
    : `Ocean only — masked by terrain height plus a land outline (Natural Earth admin-0). The outline is 1:10m for Korea and Japan and 1:110m elsewhere, so it is held back ${km} km from the coast: reclaimed land below sea level (the Dutch polders) can still read as sea inside that band.${cellWords}`;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  저장소 — 앱에 한 장이면 된다(지형처럼 로딩 뒤 바뀌지 않는다).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * createLandMask(deps)
 *   deps { THREE, fetch, url, res, erode } — 전부 선택. 브라우저에서는 THREE 만 주면 된다.
 * 파일은 한 번만 받는다. 못 받으면 texture() 가 null 이고 셰이더는 uHasLand = 0 으로 **옛 동작 그대로** 돈다(열린 실패).
 */
export function createLandMask(deps = {}) {
  const url = deps.url || LAND_COUNTRY_URL;
  const doFetch = deps.fetch || ((u) => globalThis.fetch(u));
  const res = deps.res || LAND_MASK_RES;
  const erode = Number.isFinite(deps.erode) ? deps.erode : LAND_MASK_ERODE;
  let THREE = deps.THREE || null;
  let mask = null;
  let tex = null;
  let loading = null;
  let failed = false;

  function build() {
    if (!mask || tex || !THREE) return;
    tex = new THREE.DataTexture(landMaskRGBA(mask), mask.width, mask.height, THREE.RGBAFormat);
    // 칸을 그대로 읽는다 — 섞으면 해안에서 0.5 문턱이 반 칸 흔들린다(클릭 판독은 섞지 않으므로 둘이 갈린다).
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;          // 경도는 한 바퀴 돈다
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;       // 판이지 색이 아니다
    tex.needsUpdate = true;
  }

  const api = {
    load() {
      if (mask || failed) { build(); return Promise.resolve(mask); }
      if (loading) return loading;
      loading = (async () => {
        try {
          const r = await doFetch(url);
          const j = r && r.ok ? await r.json() : null;
          const feats = j && Array.isArray(j.features) ? j.features : null;
          if (!feats || !feats.length) { failed = true; return null; }
          mask = buildLandMask(feats, { res, erode });
          mask.source = (j.source || 'Natural Earth admin 0 countries');
          mask.resolution = j.resolution || null;
          build();
          return mask;
        } catch (e) {
          failed = true;                       // 한 번 실패하면 다시 조르지 않는다 — 없어도 옛 동작으로 돈다
          return null;
        } finally { loading = null; }
      })();
      return loading;
    },
    get ready() { return !!mask; },
    raster() { return mask; },
    texture() { build(); return tex; },
    /** 판이 없으면 null — 부른 쪽이 '모른다'와 '바다다'를 가를 수 있게 0 을 돌려주지 않는다. */
    landAt(lat, lon) { return mask ? landAt(mask, lat, lon) : null; },
    info() {
      if (!mask) return null;
      const { res: r, width, height, land, rawLand, total, erode: e, erodeDeg, erodeKm, source, resolution } = mask;
      return { res: r, width, height, land, rawLand, total, erode: e, erodeDeg, erodeKm, source, resolution };
    },
    provide(more) { if (more && more.THREE && !THREE) { THREE = more.THREE; build(); } return api; },
    dispose() { if (tex && tex.dispose) tex.dispose(); tex = null; mask = null; failed = false; },
  };
  return api;
}

let sharedStore = null;
/** 앱이 나눠 쓰는 판 하나. 바다 색면 셋이 같은 장을 읽는다(같은 파일을 여러 번 받지 않는다). */
export function sharedLandMask(deps) {
  if (!sharedStore) sharedStore = createLandMask(deps || {});
  else if (deps) sharedStore.provide(deps);
  return sharedStore;
}
/** 시험이 판을 새로 얻고 싶을 때. 앱은 부르지 않는다. */
export const resetSharedLandMask = () => { if (sharedStore) sharedStore.dispose(); sharedStore = null; };
