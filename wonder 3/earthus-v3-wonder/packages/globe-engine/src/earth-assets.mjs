// EARTHUS V3 WONDER — globe-engine / earth-assets (WONDER EARTH ASSETS v1.2, PD 2026-09-13 지시서)
//
// 팩 구조: 등장방형 마스터 2048×1024 를 16개 지역(대륙 6 · 대양 8 · 극지 2)으로 잘라 놓은 것.
// 각 지역은 `uv_bounds` 자리에 그대로 얹으면 되는 crop 이고, color(알파 포함) · mask · height · normal 을 갖는다.
//
// **LOD 사다리** (지시서 §5·§10, 팩 자신의 runtime_strategy 와 같다):
//   LOD0  shared/overview_1k.avif 한 장 → 전지구를 빈틈없이 덮는다(부팅 뒤 한 번, 179KB)
//   LOD1  카메라가 보는 지역만 color(+normal·height) 를 uv 자리에 합성
//   LOD2+ **v1.2 에 없다** — 지역 파일은 마스터의 잘라내기라 픽셀 밀도가 전지구 2048 텍스처와 같다(실측 5.689 px/°)
//
// 이음새(§7): 지역을 사각형째 깔면 사각형 경계가 보이고(실측 이웃차 최대 3.4배), 마스크만 쓰면 3.27% 가 빈다.
// 그래서 **오버뷰를 바탕에 깔고 그 위에 마스크로만** 얹는다 — 구멍 0, 사각형 선 없음.
// 지역 그림과 오버뷰는 같은 마스터에서 나왔으므로 해안 경계에서 색이 튀지 않는다(평균차 9.8).

const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 카메라 거리 d 에서 구(반지름 1)의 보이는 원뿔 반각(도). d=3.58 → 73.8°, d=2.03 → 60.5° */
export function visibleCapDeg(dist) {
  const d = Math.max(1.0001, Number.isFinite(dist) ? dist : 3);
  return Math.acos(clamp(1 / d, -1, 1)) / DEG;
}

/** 두 위경도 사이 중심각(도). */
export function angularDistanceDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(clamp(c, -1, 1)) / DEG;
}

/** 지역의 위경도 상자. 경도를 한 바퀴 도는 지역(극지·대양 띠)은 경도를 재지 않는다. */
export function regionExtent(r) {
  const latC = (r.latMin + r.latMax) / 2;
  const full = r.wrapsDateline || (r.lonMax - r.lonMin) >= 359.9;
  const lonC = full ? 0 : (r.lonMin + r.lonMax) / 2;
  const latR = (r.latMax - r.latMin) / 2;
  // 경도 폭은 위도가 높을수록 좁은 거리를 뜻한다(cos φ). 중심 위도 기준으로 환산한다.
  const lonR = full ? 180 : ((r.lonMax - r.lonMin) / 2) * Math.max(0.15, Math.cos(latC * DEG));
  const areaDeg2 = (r.latMax - r.latMin) * (full ? 360 : r.lonMax - r.lonMin);
  return { latC, lonC, full, latR, lonR, areaDeg2, radiusDeg: Math.hypot(latR, lonR) };
}

/** 경도 차이를 −180~180 으로 접는다. */
const foldLon = d => ((d % 360) + 540) % 360 - 180;

/**
 * 카메라가 보는 점에서 지역 **상자까지의** 거리(도). 상자 안이면 0.
 * 중심-반지름으로 재면 큰 지역이 전부 0 이 되어 순위가 무너진다(2026-09-13 실측: 북극 위에서 아시아가 1등).
 */
export function regionDistanceDeg(r, lat, lon) {
  const e = regionExtent(r);
  const dLat = Math.max(0, r.latMin - lat, lat - r.latMax);
  let dLon = 0;
  if (!e.full) {
    const a = Math.abs(foldLon(lon - r.lonMin)), b = Math.abs(foldLon(lon - r.lonMax));
    const inside = foldLon(lon - r.lonMin) >= 0 && foldLon(lon - r.lonMax) <= 0;
    // 경도 1° 는 위도가 높을수록 짧다 — 상자에서 가장 가까운 위도로 환산한다.
    if (!inside) dLon = Math.min(a, b) * Math.max(0.15, Math.cos(clamp(lat, r.latMin, r.latMax) * DEG));
  }
  return Math.hypot(dLat, dLon);
}

/**
 * 카메라가 보는 지역을 가까운 순서로 고른다. 거리가 같으면 **좁은 지역이 먼저** — 띠보다 대륙이 앞선다.
 * @param {any[]} regions  manifest 의 regions
 * @param {{lat:number, lon:number, dist:number}} pose
 * @param {{marginDeg?:number, max?:number}} [o]
 */
export function regionsInView(regions, pose, { marginDeg = 8, max = 8 } = {}) {
  const cap = visibleCapDeg(pose.dist) + marginDeg;
  const out = [];
  for (const r of regions) {
    const d = regionDistanceDeg(r, pose.lat, pose.lon);
    if (d <= cap) out.push({ id: r.id, region: r, distanceDeg: +d.toFixed(2), areaDeg2: regionExtent(r).areaDeg2 });
  }
  out.sort((a, b) => (a.distanceDeg - b.distanceDeg) || (a.areaDeg2 - b.areaDeg2));
  return out.slice(0, max);
}

/** 그리는 차례: 바다 → 극지 → 대륙. 겹치는 1.3% 에서 해안이 바다에 먹히지 않게 한다(§7). */
const PAINT_RANK = { oceans: 0, polar: 1, continents: 2 };
export function paintOrder(picked) {
  return [...picked].sort((a, b) => (PAINT_RANK[a.region.group] ?? 9) - (PAINT_RANK[b.region.group] ?? 9));
}

const makeScratch = (canvas, w, h) => {
  const doc = canvas.ownerDocument;
  if (doc?.createElement) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new globalThis.OffscreenCanvas(w, h);
};

/**
 * 등장방형 지구 아틀라스 — 색 캔버스와 노멀 캔버스에 LOD0 을 깔고 그 위에 지역을 얹는다.
 * 캔버스는 호출부가 준다(ARCHITECTURE_LOCK §2). 네트워크는 하지 않는다 — 이미지는 받아서 넘겨 준다.
 *
 * @param {{colorCanvas:HTMLCanvasElement, normalCanvas?:HTMLCanvasElement, manifest:any}} o
 */
export function createEarthAtlas({ colorCanvas, normalCanvas = null, manifest }) {
  const W = colorCanvas.width, H = colorCanvas.height;
  const cc = colorCanvas.getContext('2d', { alpha: false });
  const nc = normalCanvas ? normalCanvas.getContext('2d', { alpha: false }) : null;
  const byId = new Map(manifest.regions.map(r => [r.id, r]));
  const loaded = new Map();                       // id → { at, bytes }
  let baseDone = false, scratch = null;
  const stats = { baseMs: 0, regionMs: 0, regionsPainted: 0, evicted: 0 };

  const rectOf = r => {
    const [u0, v0, u1, v1] = r.uvBounds;
    const x = Math.round(u0 * W), y = Math.round(v0 * H);
    return { x, y, w: Math.max(1, Math.round(u1 * W) - x), h: Math.max(1, Math.round(v1 * H) - y) };
  };

  /** LOD0 — 전지구 오버뷰 한 장. 노멀 캔버스는 평평한 값(128,128,255)으로 채운다. */
  function paintBase(overviewImg) {
    const t0 = (globalThis.performance ?? Date).now();
    cc.imageSmoothingEnabled = true; cc.imageSmoothingQuality = 'high';
    cc.globalCompositeOperation = 'source-over'; cc.globalAlpha = 1;
    cc.drawImage(overviewImg, 0, 0, W, H);
    if (nc) { nc.globalCompositeOperation = 'source-over'; nc.fillStyle = 'rgb(128,128,255)'; nc.fillRect(0, 0, W, H); }
    loaded.clear(); baseDone = true;
    stats.baseMs = Math.round((globalThis.performance ?? Date).now() - t0);
    return { w: W, h: H, ms: stats.baseMs };
  }

  /**
   * LOD1 — 지역 하나를 제 자리에 얹는다. color 의 알파(=mask)로만 그려서 사각형 선이 생기지 않는다.
   * height 는 얕은 그늘로 얹어 종이 층 깊이를 만든다(§9). normal 은 노멀 캔버스에 같은 마스크로.
   */
  function paintRegion(id, { color, normal = null, height = null }, { depth = 0.16 } = {}) {
    const r = byId.get(id);
    if (!r) throw new Error(`모르는 지역: ${id}`);
    if (!baseDone) throw new Error('LOD0 바탕이 먼저다');
    const t0 = (globalThis.performance ?? Date).now();
    const { x, y, w, h } = rectOf(r);
    cc.globalCompositeOperation = 'source-over'; cc.globalAlpha = 1;
    cc.drawImage(color, x, y, w, h);                                   // color 는 알파를 갖고 있다 → 지역 모양대로만 찍힌다

    if (height && depth > 0) {
      // 높이의 어두운 곳을 살짝 더 어둡게 — 종이 층 사이 그늘. 지역 모양 밖으로 새지 않게 color 알파로 오려 낸다.
      const s = ensureScratch(w, h);
      const sc = s.getContext('2d');
      sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, w, h);
      sc.drawImage(height, 0, 0, w, h);
      sc.globalCompositeOperation = 'destination-in';                  // 한 번만 부른다(기둥마다 부르면 캔버스가 통째로 지워진다)
      sc.drawImage(color, 0, 0, w, h);
      sc.globalCompositeOperation = 'source-over';
      cc.globalAlpha = depth; cc.globalCompositeOperation = 'multiply';
      cc.drawImage(s, x, y, w, h);
      cc.globalAlpha = 1; cc.globalCompositeOperation = 'source-over';
    }

    if (nc && normal) {
      const s = ensureScratch(w, h);
      const sc = s.getContext('2d');
      sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, w, h);
      sc.drawImage(normal, 0, 0, w, h);
      sc.globalCompositeOperation = 'destination-in';
      sc.drawImage(color, 0, 0, w, h);
      sc.globalCompositeOperation = 'source-over';
      nc.drawImage(s, x, y, w, h);
    }

    loaded.set(id, { at: (globalThis.performance ?? Date).now(), rect: { x, y, w, h }, bytes: r.bytes ?? 0 });
    stats.regionsPainted++;
    stats.regionMs += Math.round((globalThis.performance ?? Date).now() - t0);
    return { id, rect: { x, y, w, h }, ms: Math.round((globalThis.performance ?? Date).now() - t0) };
  }

  function ensureScratch(w, h) {
    if (!scratch || scratch.width < w || scratch.height < h) scratch = makeScratch(colorCanvas, Math.max(w, scratch?.width ?? 0), Math.max(h, scratch?.height ?? 0));
    return scratch;
  }

  /** 보이지 않는 지역을 목록에서 지운다. 그림은 LOD0 로 되돌리지 않는다(되돌리면 깜빡인다) — 메모리는 호출부가 이미지로 관리한다. */
  function forget(keepIds) {
    const keep = new Set(keepIds);
    let n = 0;
    for (const id of [...loaded.keys()]) if (!keep.has(id)) { loaded.delete(id); n++; }
    stats.evicted += n;
    return n;
  }

  return {
    paintBase, paintRegion, forget,
    get size() { return { w: W, h: H }; },
    has: id => loaded.has(id),
    loadedIds: () => [...loaded.keys()],
    rectOf: id => (byId.get(id) ? rectOf(byId.get(id)) : null),
    regions: manifest.regions,
    stats: () => ({ ...stats, loaded: loaded.size, baseDone }),
  };
}

// ── 종이 마무리(§3) ────────────────────────────────────────────────────────
// v1.2 팩의 그림은 ETOPO 계열 **사실적 지형·수심도**다(실측: 바다 채도 0.78, 연속 그라데이션).
// 지시서 §3 은 "2.5D 종이 오려붙인 느낌 유지 · 지나치게 사실적인 위성사진 스타일 금지" 이므로
// 지리는 그대로 두고 **표현만** 종이로 바꾼다: 그라데이션을 층으로 끊고, 채도를 낮추고, 결을 덮는다.

/** 0~255 로 자른다. */
const b255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);

/** HSL(도, %, %) → [r,g,b] */
export function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((t[0] + m) * 255), Math.round((t[1] + m) * 255), Math.round((t[2] + m) * 255)];
}

// 종이 팔레트 — 절차적 Paper Earth 와 같은 색을 쓴다(승인된 레퍼런스 톤). 바다 3층 · 얼음 1층.
export const PAPER_SEA = [[36, 68, 95], [42, 79, 110], [53, 106, 144]];    // 깊은 바다 → 대륙붕
export const PAPER_ICE = hsl2rgb(198, 15, 90);
export const PAPER_COAST = [243, 231, 207];                                 // 오려낸 종이 단면(크림)
/** 땅 밝기 4층 — 저지대는 어둡고 고지대는 밝다. 종이를 겹쳐 붙인 층처럼 보이게 한다. */
export const PAPER_LAND_STEPS = [-11, -3, 6, 15];
/** 4×4 정렬 디더 — 층 경계를 한 줄로 긋지 않고 오돌토돌 흩는다. 종이 결과 같은 성질이라 눈에 거슬리지 않는다.
 *  LOD0 바탕과 LOD1 지역은 같은 원본의 흐린 판·또렷한 판이라 밝기가 몇 단계 다르다. 문턱을 그냥 자르면
 *  그 몇 단계가 지역 네모를 따라 **한 줄**로 드러난다(2026-09-13 실측: 이웃차 2.12배 → 디더 뒤 아래 수치). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v / 16 - 0.469));

/**
 * 사실적 지형·수심도를 **오려붙인 종이**로 바꾼다(§3).
 * 지리(어디가 땅이고 어디가 바다인가·높낮이)는 팩 그림 그대로 두고, **색과 층만** 종이 팔레트로 갈아 끼운다.
 * 바다는 3층, 땅은 위도별 종이색 × 밝기 4층, 얼음은 한 층, 해안선에는 크림색 단면을 긋는다.
 *
 * @param {HTMLCanvasElement} canvas 완성된 등장방형 색 캔버스(제자리에서 고친다)
 * @param {{coast?:boolean, landToneAt?:(lat:number)=>string, strength?:number, rect?:{x:number,y:number,w:number,h:number}}} [o]
 *   landToneAt 를 주면 그 위도색을 쓴다(절차적 Paper Earth 와 같은 팔레트). 없으면 팩 색의 색조를 살린다.
 *   rect 를 주면 그 네모만 다시 칠한다 — 지역 하나가 새로 올라올 때 2백만 픽셀을 다시 돌지 않는다.
 */
export function paperize(canvas, { coast = true, landToneAt = null, strength = 1, rect = null, dither = 13 } = {}) {
  const t0 = (globalThis.performance ?? Date).now();
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
  const CW = canvas.height ? canvas.width : 0;
  const R = clampRect(rect, canvas.width, canvas.height);
  const W = R.w, H = R.h;                                   // 아래 계산은 잘라 온 네모 안에서만 돈다
  const fullWidth = W === canvas.width;
  const im = ctx.getImageData(R.x, R.y, W, H), d = im.data;
  const land = new Uint8Array(W * H);
  void CW;
  const mix = (a, b, t) => a + (b - a) * t;

  // 1) 땅·바다 가르기 + 층 칠하기. 위도색은 줄마다 한 번만 계산한다(2백만 번이 아니라 1024번).
  let rowTone = [0, 0, 0], rowL = 50;
  for (let y = 0; y < H; y++) {
    const lat = 90 - ((R.y + y) / canvas.height) * 180;      // 위도는 **캔버스 전체** 기준이다(잘라 온 네모 기준이 아니다)
    if (landToneAt) {
      const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(landToneAt(lat));
      if (m) { rowTone = [+m[1], +m[2], +m[3]]; rowL = +m[3]; }
    }
    const steps = PAPER_LAND_STEPS.map(dl => landToneAt ? hsl2rgb(rowTone[0], rowTone[1], Math.max(8, Math.min(96, rowL + dl))) : null);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      // 디더는 **캔버스 절대 좌표**로 고른다 — 네모만 다시 칠해도 같은 무늬가 나온다.
      const lum = 0.299 * r + 0.587 * g + 0.114 * b + BAYER[((R.y + y) & 3) * 4 + ((R.x + x) & 3)] * dither;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const isSea = b > r + 14 && b >= g - 6 && lum < 205;                 // 수심도는 파랑이 지배한다. 흰 얼음·크림 땅은 걸리지 않는다.
      let out;
      if (isSea) {
        const t = Math.min(1, Math.max(0, (lum - 40) / 120));              // 깊을수록 어둡다
        out = PAPER_SEA[t < 0.34 ? 0 : t < 0.7 ? 1 : 2];
      } else {
        land[y * W + x] = 1;
        if (lum > 198 && max - min < 34) out = PAPER_ICE;                  // 만년설·빙상
        else if (steps[0]) out = steps[lum < 96 ? 0 : lum < 132 ? 1 : lum < 176 ? 2 : 3];
        else { const k = lum < 96 ? 0.86 : lum < 132 ? 0.96 : lum < 176 ? 1.06 : 1.16; out = [r * k, g * k, b * k]; }
      }
      d[i] = mix(r, out[0], strength); d[i + 1] = mix(g, out[1], strength); d[i + 2] = mix(b, out[2], strength);
    }
  }

  // 2) 오려낸 단면 — 땅이 바다에 닿는 줄에만 크림색을 긋는다. 나라 경계에는 긋지 않는다(정치 지도가 되면 안 된다).
  let coastPx = 0;
  if (coast) {
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (!land[k]) continue;
      // 경도는 ±180° 에서 이어진다 — 전폭일 때만 감싼다. 잘라 온 네모의 좌우 끝은 바깥을 모르니 긋지 않는다.
      if (!fullWidth && (x === 0 || x === W - 1)) continue;
      const xw = fullWidth ? (x + W - 1) % W : x - 1, xe = fullWidth ? (x + 1) % W : x + 1;
      if (land[k - W] && land[k + W] && land[y * W + xw] && land[y * W + xe]) continue;
      const i = k * 4;
      d[i] = mix(d[i], PAPER_COAST[0], 0.62); d[i + 1] = mix(d[i + 1], PAPER_COAST[1], 0.62); d[i + 2] = mix(d[i + 2], PAPER_COAST[2], 0.62);
      coastPx++;
    }
  }
  ctx.putImageData(im, R.x, R.y);
  let landPx = 0; for (let i = 0; i < land.length; i++) landPx += land[i];
  return { ms: Math.round((globalThis.performance ?? Date).now() - t0), landPct: +(landPx / land.length * 100).toFixed(2), coastPx, px: W * H };
}

/** 종이 결을 덮는다(Paper Earth Material v1 의 fiber). multiply 라야 색이 바래지 않는다(soft-light 은 씻겨 나간다 — 2026-09-13 실측). */
export function applyFiber(canvas, fiberImg, { alpha = 0.4, tile = 1024, rect = null } = {}) {
  if (!fiberImg) return null;
  const ctx = canvas.getContext('2d', { alpha: false });
  const pat = ctx.createPattern(fiberImg, 'repeat');
  if (!pat) return null;
  const s = tile / (fiberImg.width || tile);
  // 무늬는 **캔버스 원점**에 붙여 둔다 — 네모만 다시 칠해도 결이 어긋나지 않는다.
  pat.setTransform?.(new DOMMatrix([s, 0, 0, s, 0, 0]));
  const R = clampRect(rect, canvas.width, canvas.height);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = alpha;
  ctx.fillStyle = pat; ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  return { alpha, tile, rect: R };
}

/** 네모를 캔버스 안으로 자른다. 없으면 캔버스 전체. */
export function clampRect(rect, W, H) {
  if (!rect) return { x: 0, y: 0, w: W, h: H };
  const x = Math.max(0, Math.min(W - 1, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(H - 1, Math.floor(rect.y)));
  return { x, y, w: Math.max(1, Math.min(W - x, Math.ceil(rect.w))), h: Math.max(1, Math.min(H - y, Math.ceil(rect.h))) };
}

/** 여러 네모를 하나로 합친다(겹치는 지역을 한 번에 다시 칠하려고). */
export function unionRect(rects, W, H) {
  if (!rects?.length) return { x: 0, y: 0, w: W, h: H };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  return clampRect({ x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 }, W, H);   // 해안선 이웃을 보려고 1px 씩 넓힌다
}
