// EARTHUS V3 WONDER — globe-engine / earth-v2 (WONDER EARTH ASSETS v2.0, PD 2026-09-13)
//
// v1.2 와 완전히 다른 팩이다. 실측으로 확인한 차이:
//   · 화풍   v1.2 = ETOPO 계열 사실적 기복도(고유색 709~2368) → v2 = 단색 종이 오려내기(고유색 7~13)
//   · 벡터   v1.2 = shape.svg 16장 전부 빈 path → v2 = 대륙 7장에 진짜 폴리곤(1,180~6,200점, M/L/Z 만)
//   · 좌표   v1.2 = 마스터 한 장을 자른 crop → v2 = 지역마다 자기 boundsLonLat 을 갖는 독립 crop
//   · 바다   v1.2 = 수심 그라데이션 → v2 = **단색 #1b6696 하나** (8장 전부 같은 색)
//
// 그래서 구조가 단순해진다. 바다는 색 하나로 칠하고, 대륙은 **벡터로 그린다**.
// 벡터라 텍스처 해상도를 올리면 그만큼 또렷해진다 — v1.2 에 없던 LOD2 가 생긴다.
//
// 이음새(§7): 팩의 대륙 경계는 지리가 아니라 **정치 구분**이라 유럽과 아시아가 유라시아 한복판에서
// 맞닿는다(실측: lon 26~135°, lat 41~55° 에서 겹침 225px + 틈 152px). 각 대륙이 제 그림자를 따로
// 지면 그 선이 러시아를 가로지른다. 그래서 그림자는 **모든 대륙의 합집합 밖에만** 남긴다.

const CONT_ORDER = ['antarctica', 'oceania', 'africa', 'south_america', 'north_america', 'europe', 'asia'];

/** 팩 벡터가 놓친 섬을 우리 지리 자료로 메울 때 쓸 기본 땅색(어느 대륙 상자에도 안 들어가는 섬). */
export const ISLAND_FALLBACK = { fill: '#7ea45b', shadow: '#587e35' };

/**
 * 팩의 대륙 폴리곤은 Natural Earth 110m 수준이라 작은 섬이 통째로 빠져 있다.
 * 실측: 제주·울릉·독도·괌이 전부 바다로 나온다. 한국이 첫 시장인데 제주가 화면에서 사라진다.
 * 우리가 이미 첫 화면에 받는 `content/geo/country-reference.json` 에는 KOR·PRK·JPN 이 1:10m 로 들어 있다.
 * 그 자료에서 **팩이 땅으로 치지 않는 자리의 작은 폴리곤만** 골라 얹는다(본토를 두 번 그리지 않는다).
 */
export function pickMissingIslands(geo, isLand, { maxSpanDeg = 3, minPoints = 4 } = {}) {
  const out = [];
  for (const f of geo?.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of polys) {
      const ring = poly?.[0];
      if (!ring || ring.length < minPoints) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
      for (const [lon, lat] of ring) {
        if (lon < x0) x0 = lon; if (lon > x1) x1 = lon;
        if (lat < y0) y0 = lat; if (lat > y1) y1 = lat;
        cx += lon; cy += lat;
      }
      if (x1 - x0 > maxSpanDeg || y1 - y0 > maxSpanDeg) continue;      // 본토·큰 섬은 팩 몫이다
      cx /= ring.length; cy /= ring.length;
      if (isLand(cx, cy)) continue;                                     // 팩이 이미 땅으로 그린 자리
      out.push({ code: f.code3 ?? f.code ?? '?', name: f.nameKo ?? f.nameEn ?? '', ring, lon: cx, lat: cy, span: Math.max(x1 - x0, y1 - y0) });
    }
  }
  return out;
}

/** SVG 한 장에서 종이 층을 뜯어낸다. 이 팩의 d 는 M/L/Z 뿐이지만 Path2D 가 나머지도 알아서 읽는다. */
export function parsePaperShape(svgText) {
  const vb = /viewBox="([-\d.\s]+)"/.exec(svgText);
  const viewBox = vb ? vb[1].trim().split(/\s+/).map(Number) : null;
  const layers = [];
  for (const m of svgText.matchAll(/<path\b([^>]*?)\/?>/gs)) {
    const at = {};
    for (const a of m[1].matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) at[a[1]] = a[2];
    const d = (at.d ?? '').trim();
    if (!d) continue;
    const tr = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(at.transform ?? '');
    layers.push({
      d,
      fill: at.fill ?? '#000',
      opacity: at.opacity == null ? 1 : Number(at.opacity),
      fillRule: at['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
      tx: tr ? Number(tr[1]) : 0,
      ty: tr ? Number(tr[2]) : 0,
      stroke: at.stroke && at.stroke !== 'none' ? at.stroke : null,
      strokeWidth: Number(at['stroke-width'] ?? 0) || 0,
    });
  }
  // 층 구실: 채우기 = 불투명하고 획이 없는 것. 그림자 = 아래로 민 것. 테두리 = 획만 있는 것.
  const fill = layers.find(l => l.opacity >= 0.999 && !l.stroke) ?? layers[layers.length - 1] ?? null;
  const shadows = layers.filter(l => l !== fill && !l.stroke && (l.ty !== 0 || l.tx !== 0));
  const rim = layers.find(l => l.stroke) ?? null;
  return { viewBox, layers, fill, shadows, rim };
}

/**
 * 지역 그림(viewBox 좌표)을 등장방형 캔버스에 놓는 변환.
 * x = (lon+180)/360·CW, y = (90−lat)/180·CH 규약을 따른다(ARCHITECTURE_LOCK §4).
 */
export function regionPlacement(region, CW, CH, viewBox) {
  const vw = viewBox?.[2] || region.declaredSize[0];
  const vh = viewBox?.[3] || region.declaredSize[1];
  const spanLon = region.lonMax - region.lonMin;
  const spanLat = region.latMax - region.latMin;
  return {
    sx: (spanLon / 360) * CW / vw,
    sy: (spanLat / 180) * CH / vh,
    ox: ((region.lonMin + 180) / 360) * CW,
    oy: ((90 - region.latMax) / 180) * CH,
    spanLon, spanLat, vw, vh,
  };
}

/**
 * 경도는 ±180° 에서 이어진다. 지역이 자오선을 건너면 한 번 그려서는 한쪽이 잘린다.
 * 이 팩은 europe·oceania·antarctica 가 lon −190.8~190.8 (폭 381.6°) 이라 특히 그렇다.
 */
export function wrapOffsets(place, CW) {
  const out = [];
  for (const k of [-1, 0, 1]) {
    const x0 = place.ox + k * CW;
    const x1 = x0 + (place.spanLon / 360) * CW;
    if (x1 > 0 && x0 < CW) out.push(k * CW);
  }
  return out.length ? out : [0];
}

const makeCanvas = (like, w, h) => {
  const doc = like?.ownerDocument;
  if (doc?.createElement) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new globalThis.OffscreenCanvas(w, h);
};
const ctx2d = (c, o) => c.getContext('2d', o);

/**
 * 종이 지구 v2 — 바다 한 색 위에 대륙을 벡터로 오려 붙인다.
 * 캔버스는 호출부가 준다(ARCHITECTURE_LOCK §2). 네트워크는 하지 않는다.
 *
 * @param {{colorCanvas:HTMLCanvasElement, manifest:any}} o
 */
export function createPaperGlobeV2({ colorCanvas, manifest }) {
  const W = colorCanvas.width, H = colorCanvas.height;
  const cc = ctx2d(colorCanvas, { alpha: false });
  const byId = new Map(manifest.regions.map(r => [r.id, r]));
  const stats = { oceanMs: 0, landMs: 0, iceMs: 0, continents: 0, islands: 0, paths: 0, points: 0 };
  let unionCanvas = null;                       // 모든 대륙 채우기의 합집합 — 그림자·테두리가 여기서 나온다

  /** 바다. 팩의 8장이 전부 같은 색이라 그림을 받지 않고 색 하나로 칠한다(구멍이 생길 수 없다). */
  function paintOcean({ color = manifest.baseOcean || '#1b6696' } = {}) {
    const t0 = (globalThis.performance ?? Date).now();
    cc.globalCompositeOperation = 'source-over'; cc.globalAlpha = 1;
    cc.fillStyle = color; cc.fillRect(0, 0, W, H);
    stats.oceanMs = Math.round((globalThis.performance ?? Date).now() - t0);
    return { color, w: W, h: H, ms: stats.oceanMs };
  }

  /** viewBox 좌표계로 들어가서 그린다. 되돌리는 것은 호출부가 아니라 여기가 책임진다. */
  function withPlacement(ctx, place, dx, fn) {
    ctx.save();
    ctx.setTransform(place.sx, 0, 0, place.sy, place.ox + dx, place.oy);
    fn(ctx);
    ctx.restore();
  }

  /**
   * 대륙 7장. 순서대로:
   *   1) 합집합 알파를 만든다        → 그림자가 이웃 대륙 위로 떨어지지 않게 오려 낼 형틀
   *   2) 각 대륙의 종이 단면(그림자)을 모아서 **합집합 밖만** 남긴다
   *   3) 각 대륙을 제 색으로 채운다  (가는 획으로 살짝 부풀려 대륙 사이 실틈을 메운다)
   *   4) 북쪽 가장자리에 흰 빛을 얹는다 (합집합에서 뽑아 내부 경계선이 생기지 않는다)
   *
   * @param {Map<string,{d:string}[]>|Record<string,any>} shapes  id → parsePaperShape 결과
   * @param {{depthPx?:number, dilatePx?:number, rimPx?:number, rimAlpha?:number, islands?:object|any[]}} [o]
   *   islands 에 GeoJSON 계열(`{features:[{geometry}]}`)을 주면 **팩이 놓친 작은 섬만** 골라 얹는다.
   *   depthPx 는 **캔버스 화소**로 고정한다. 팩이 적은 10px 를 그대로 쓰면 지역마다 배율이 달라
   *   유럽은 9.3px, 아프리카는 2.8px 가 되어 종이 두께가 제각각이 된다(실측).
   */
  function paintLand(shapes, { depthPx = Math.max(2, Math.round(H / 340)), dilatePx = 1.1, rimPx = 1.4, rimAlpha = 0.16, islands = null } = {}) {
    const t0 = (globalThis.performance ?? Date).now();
    const list = CONT_ORDER.filter(id => shapes.get?.(id) ?? shapes[id]).map(id => ({ id, shape: shapes.get?.(id) ?? shapes[id], region: byId.get(id) }))
      .filter(x => x.region && x.shape?.fill);
    if (!list.length) return { painted: 0, ms: 0 };

    // Path2D 는 브라우저 전역이다. 여기서 찾아 쓰면 Node 테스트가 가짜를 끼워 넣어 합성 순서를 검사할 수 있다.
    const P2D = globalThis.Path2D;
    if (typeof P2D !== 'function') throw new Error('Path2D 가 없다 — 벡터 대륙을 그릴 수 없다');

    // 위경도 고리 → 캔버스 좌표 Path2D. 섬은 제 viewBox 가 없으니 여기서 바로 만든다.
    const islandPath = ring => {
      const q = new P2D();
      ring.forEach(([lon, lat], i) => {
        const x = ((lon + 180) / 360) * W, y = ((90 - lat) / 180) * H;
        i ? q.lineTo?.(x, y) : q.moveTo?.(x, y);
      });
      q.closePath?.();
      return q;
    };
    /** 섬이 어느 대륙 상자 안에 드는가 — 그 대륙의 종이색을 물려준다. */
    const toneFor = (lon, lat) => {
      for (const { shape, region } of list) {
        if (lon >= region.lonMin && lon <= region.lonMax && lat >= region.latMin && lat <= region.latMax) {
          return { fill: shape.fill.fill, shadow: shape.shadows[0]?.fill ?? shape.fill.fill };
        }
      }
      return ISLAND_FALLBACK;
    };

    const cache = new Map();
    const pathOf = (id, d) => { const k = `${id}|${d.length}`; let p = cache.get(k); if (!p) { p = new P2D(d); cache.set(k, p); } return p; };

    // 1) 합집합 알파
    unionCanvas = makeCanvas(colorCanvas, W, H);
    const uc = ctx2d(unionCanvas);
    uc.clearRect(0, 0, W, H); uc.fillStyle = '#000';
    for (const { id, shape, region } of list) {
      const pl = regionPlacement(region, W, H, shape.viewBox);
      const p = pathOf(id, shape.fill.d);
      for (const dx of wrapOffsets(pl, W)) withPlacement(uc, pl, dx, c => {
        c.translate(shape.fill.tx, shape.fill.ty);
        c.fill(p, shape.fill.fillRule);
        // 실틈 메우기: 같은 색 가는 획으로 아주 조금 부풀린다(대륙 경계의 1px 틈 152개, 실측)
        if (dilatePx > 0) { c.lineWidth = dilatePx / Math.max(pl.sx, pl.sy); c.strokeStyle = '#000'; c.lineJoin = 'round'; c.stroke(p); }
      });
    }
    // 섬 고르기는 **대륙 합집합이 만들어진 뒤**에 한다 — "팩이 이미 땅으로 그린 자리" 를 알아야 하니까.
    let picked = Array.isArray(islands) ? islands : [];
    if (islands && !Array.isArray(islands) && islands.features) {
      const ud = uc.getImageData(0, 0, W, H).data;
      const isLand = (lon, lat) => {
        const x = Math.round(((lon + 180) / 360) * W), y = Math.round(((90 - lat) / 180) * H);
        if (x < 0 || x >= W || y < 0 || y >= H) return false;
        return ud[(y * W + x) * 4 + 3] > 8;
      };
      picked = pickMissingIslands(islands, isLand);
    }
    // 섬은 캔버스 좌표로 바로 만들어 붙인다. 합집합에 넣어야 그림자·테두리를 같이 받는다.
    const isles = picked.map(o => ({ ...o, path: islandPath(o.ring), tone: toneFor(o.lon, o.lat) }));
    if (isles.length) {
      uc.setTransform(1, 0, 0, 1, 0, 0);
      uc.lineJoin = 'round'; uc.strokeStyle = '#000'; uc.lineWidth = Math.max(1.2, dilatePx);
      for (const o of isles) { uc.fill(o.path); uc.stroke(o.path); }   // 작은 섬은 한 화소로 사라지니 조금 부풀린다
    }

    // 2) 종이 단면(그림자) — 대륙마다 제 어두운 색으로, 합집합 밖에만
    const sc = makeCanvas(colorCanvas, W, H);
    const s2 = ctx2d(sc);
    s2.clearRect(0, 0, W, H);
    for (const { id, shape, region } of list) {
      const pl = regionPlacement(region, W, H, shape.viewBox);
      for (const sh of shape.shadows.length ? shape.shadows : [{ ...shape.fill, opacity: 0.5, ty: 1 }]) {
        const p = pathOf(id, sh.d);
        // 팩이 적은 ty 는 원본 화소다. 캔버스 화소로 환산해 **모든 대륙이 같은 두께**가 되게 한다.
        const off = (sh.ty / Math.max(1, Math.abs(shape.shadows[0]?.ty || 10))) * depthPx;
        for (const dx of wrapOffsets(pl, W)) {
          s2.save();
          s2.setTransform(pl.sx, 0, 0, pl.sy, pl.ox + dx, pl.oy + off);
          s2.globalAlpha = sh.opacity; s2.fillStyle = sh.fill;
          s2.fill(p, sh.fillRule);
          s2.restore();
        }
      }
    }
    if (isles.length) {
      s2.setTransform(1, 0, 0, 1, 0, 0);
      for (const o of isles) {
        for (const [alpha, off] of [[0.55, depthPx], [0.32, depthPx * 0.5]]) {
          s2.save(); s2.translate(0, off); s2.globalAlpha = alpha; s2.fillStyle = o.tone.shadow;
          s2.fill(o.path); s2.lineWidth = Math.max(1.2, dilatePx); s2.strokeStyle = o.tone.shadow; s2.stroke(o.path); s2.restore();
        }
      }
    }
    s2.globalAlpha = 1;
    s2.globalCompositeOperation = 'destination-out';
    s2.drawImage(unionCanvas, 0, 0);                      // 땅 위에 떨어진 그림자를 지운다(유라시아 한복판 선 제거)
    s2.globalCompositeOperation = 'source-over';
    cc.drawImage(sc, 0, 0);

    // 3) 각 대륙 채우기
    for (const { id, shape, region } of list) {
      const pl = regionPlacement(region, W, H, shape.viewBox);
      const p = pathOf(id, shape.fill.d);
      for (const dx of wrapOffsets(pl, W)) withPlacement(cc, pl, dx, c => {
        c.translate(shape.fill.tx, shape.fill.ty);
        c.fillStyle = shape.fill.fill;
        c.fill(p, shape.fill.fillRule);
        if (dilatePx > 0) { c.lineWidth = dilatePx / Math.max(pl.sx, pl.sy); c.strokeStyle = shape.fill.fill; c.lineJoin = 'round'; c.stroke(p); }
      });
      stats.paths += shape.layers.length;
    }
    if (isles.length) {
      cc.setTransform(1, 0, 0, 1, 0, 0);
      cc.lineJoin = 'round'; cc.lineWidth = Math.max(1.2, dilatePx);
      for (const o of isles) { cc.fillStyle = o.tone.fill; cc.strokeStyle = o.tone.fill; cc.fill(o.path); cc.stroke(o.path); }
      stats.islands = isles.length;
    }

    // 4) 북쪽 가장자리 흰 빛 — 합집합을 위로 민 뒤 땅 안쪽만 남긴다(내부 경계선이 안 생긴다)
    if (rimPx > 0 && rimAlpha > 0) {
      // 땅에서 **아래로 민 땅을 빼면** 북쪽 가장자리 띠만 남는다.
      // (위로 민 땅과 교집합을 쓰면 땅 거의 전체가 남아 대륙이 통째로 하얘진다 — 2026-09-13 실측: 아시아 #7ca559 가 #93b177 로)
      const rc = makeCanvas(colorCanvas, W, H);
      const r2 = ctx2d(rc);
      r2.clearRect(0, 0, W, H);
      r2.drawImage(unionCanvas, 0, 0);
      r2.globalCompositeOperation = 'destination-out';
      r2.drawImage(unionCanvas, 0, rimPx);                // 한 번만 부른다
      r2.globalCompositeOperation = 'source-in';
      r2.fillStyle = '#fff'; r2.fillRect(0, 0, W, H);
      r2.globalCompositeOperation = 'source-over';
      cc.globalAlpha = rimAlpha; cc.drawImage(rc, 0, 0); cc.globalAlpha = 1;
    }

    stats.continents = list.length;
    stats.points = list.reduce((n, x) => n + (x.region.shape?.totalPoints ?? 0), 0);
    stats.landMs = Math.round((globalThis.performance ?? Date).now() - t0);
    // 고른 섬 목록을 돌려준다 — 다시 구울 때 합집합을 또 읽지 않게(getImageData 8MB) 호출부가 캐시한다.
    return { painted: list.length, islands: stats.islands, islandList: picked, depthPx, ms: stats.landMs, ids: list.map(x => x.id) };
  }

  /**
   * 북극 해빙. ice_mask 는 회색조라 알파가 없다 — 밝기를 알파로 옮겨야 마스크 구실을 한다.
   * bounds 가 팩 manifest 에 없어서 전지구 등장방형으로 놓는다(실측으로 확인: 얼음이 lat 90~72.4° 에 있다).
   */
  function paintIce(iceMaskImg, { color = '#eef4f6', alpha = 0.92, featherPx = 14, bounds = manifest.arctic?.assumedBounds } = {}) {
    if (!iceMaskImg) return null;
    const t0 = (globalThis.performance ?? Date).now();
    const iw = iceMaskImg.width, ih = iceMaskImg.height;
    const tmp = makeCanvas(colorCanvas, iw, ih);
    const t2 = ctx2d(tmp, { willReadFrequently: true });
    t2.drawImage(iceMaskImg, 0, 0);
    const im = t2.getImageData(0, 0, iw, ih), d = im.data;
    let on = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i]; d[i + 3] = a; if (a > 127) on++; }   // 밝기 → 알파
    t2.putImageData(im, 0, 0);
    t2.globalCompositeOperation = 'source-in';
    t2.fillStyle = color; t2.fillRect(0, 0, iw, ih);
    // 마스크는 위도 띠라 남쪽 끝이 **직선으로 뚝 끊긴다**(실측: 72.4°N 에서 직선). 그 끝을 흐린다.
    if (featherPx > 0) {
      let y1 = 0;
      for (let y = ih - 1; y >= 0 && !y1; y--) { for (let x = 0; x < iw; x += 8) if (d[(y * iw + x) * 4 + 3] > 8) { y1 = y; break; } }
      const g = t2.createLinearGradient(0, Math.max(0, y1 - featherPx), 0, y1 + 1);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
      t2.globalCompositeOperation = 'destination-out';
      t2.fillStyle = g; t2.fillRect(0, Math.max(0, y1 - featherPx), iw, featherPx + 2);
    }
    t2.globalCompositeOperation = 'source-over';
    const b = bounds ?? [-180, -90, 180, 90];
    const x = ((b[0] + 180) / 360) * W, y = ((90 - b[3]) / 180) * H;
    const w = ((b[2] - b[0]) / 360) * W, h = ((b[3] - b[1]) / 180) * H;
    cc.globalAlpha = alpha; cc.drawImage(tmp, x, y, w, h); cc.globalAlpha = 1;
    stats.iceMs = Math.round((globalThis.performance ?? Date).now() - t0);
    return { coverage: +(on / (iw * ih)).toFixed(4), ms: stats.iceMs };
  }

  return {
    paintOcean, paintLand, paintIce,
    get size() { return { w: W, h: H }; },
    get union() { return unionCanvas; },
    regions: manifest.regions,
    stats: () => ({ ...stats }),
  };
}
