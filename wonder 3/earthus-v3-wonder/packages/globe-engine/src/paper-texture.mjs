// EARTHUS V3 WONDER — globe-engine / paper-texture (PHASE 1 Paper Earth Core)
//
// 국가 폴리곤(Natural Earth admin 0) → 등장방형 캔버스에 **겹쳐 붙인 종이**로 굽는다. 굽는 길은 둘:
//   · paintPaperEarth(…)          절차적 종이 — 색을 코드로 칠한다. 받을 것이 없어 첫 화면이 즉시 뜬다.
//   · paintPaperEarthMaterial(…)  Paper Earth Material v1 의 실제 종이 견본을 지리에 맞춰 오려 붙인다. 첫 그림 뒤에 갈아 끼운다.
// 둘 다 대륙 배치·해안선은 자료 그대로이고, 지형 장식(나무·산줄기·모래)은 **장식**이지 고도 자료가 아니다.
//
// 층 순서(MATERIAL_INTEGRATION.md 의 Shader Layer 1~8 과 같은 순서):
//   1 바다 → 2 땅 생물군 → 3 종이 섬유 → 4 높이/노멀(three.js 재질) → 5 무광 거칠기(three.js 재질)
//   → 6 해안 자른 단면 → 7 종이 두께 그림자 → 8 빛 받는 모서리 → (그 위) 극지 얼음
// 6·7·8 은 나라 경계에 닿으면 정치 지도가 되므로 **합성 규칙**으로 해안에만 그린다(source-atop / destination-over).
//
// 캔버스는 호출부가 만들어 준다(ARCHITECTURE_LOCK §2). 오프스크린은 그 캔버스의 document 로 만든다.
import { equirect } from './geo.mjs';

const hash32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);

/** 위도 → 생물군 이름. 실제 기후대의 대략적인 띠다(정밀 자료가 아니라 그림책 색 구분). */
export function biomeAt(lat) {
  const a = Math.abs(lat);
  return a < 11 ? 'tropical' : a < 19 ? 'savanna' : a < 33 ? 'desert' : a < 43 ? 'steppe' : a < 58 ? 'temperate' : a < 67 ? 'taiga' : 'polar';
}

/** 생물군 기준 위도와 종이색(HSL). 따뜻한 자연색 — 고급 그림책·자연사 박물관 톤. 절차적 경로에서만 쓴다. */
export const BIOME_ANCHORS = [
  { at: 5,  name: 'tropical',  h: 124, s: 27, l: 43 },
  { at: 15, name: 'savanna',   h: 79,  s: 33, l: 57 },
  { at: 26, name: 'desert',    h: 36,  s: 47, l: 72 },
  { at: 38, name: 'steppe',    h: 68,  s: 31, l: 61 },
  { at: 50, name: 'temperate', h: 99,  s: 29, l: 52 },
  { at: 62, name: 'taiga',     h: 112, s: 19, l: 47 },
  { at: 75, name: 'polar',     h: 198, s: 15, l: 87 },
];

/** 위도 → 땅 종이색. 기준 위도 사이를 부드럽게 섞는다(경계선이 딱 끊기지 않게). */
export function landToneAt(lat) {
  const a = Math.min(90, Math.abs(lat));
  const A = BIOME_ANCHORS;
  if (a <= A[0].at) return `hsl(${A[0].h} ${A[0].s}% ${A[0].l}%)`;
  if (a >= A[A.length - 1].at) return `hsl(${A[A.length - 1].h} ${A[A.length - 1].s}% ${A[A.length - 1].l}%)`;
  let i = 0; while (i < A.length - 2 && a > A[i + 1].at) i++;
  const t = (a - A[i].at) / (A[i + 1].at - A[i].at);
  const p = A[i], q = A[i + 1];
  return `hsl(${Math.round(lerp(p.h, q.h, t))} ${Math.round(lerp(p.s, q.s, t))}% ${Math.round(lerp(p.l, q.l, t))}%)`;
}

/** 나라별 종이 차이 — 위도 띠 위에 얹는 아주 옅은 색 차이(선이 아니라 색으로만 구분한다). */
export function paperTone(code, lat = 20) {
  const h = hash32(code || '?');
  const dh = (h % 13) - 6, dl = ((h >> 16) % 9) - 4;
  return { hueShift: dh, lightShift: dl, alpha: 0.07 + ((h >> 8) % 5) / 100, biome: biomeAt(lat) };
}

/* ── Paper Earth Material v1: 종이 견본을 어느 위도 띠에 붙이는가 ─────────────────────────────
   팩에는 지리가 구워져 있지 않다(geography_baked=false). 어디에 무엇을 붙일지는 여기서 정한다. */
export const SWATCH_ZONES = Object.freeze({
  forest: [[0, 13], [41, 63]],   // 열대 정글 + 온대·타이가 숲
  desert: [[19, 33]],            // 사하라·아라비아·칼라하리·호주 내륙 위도
  ice: [[66, 90]],               // 극지
});
export const SWATCH_FEATHER = 5;                       // 띠 경계에서 섞이는 폭(도)
export const SWATCH_NAMES = Object.freeze(['land', 'forest', 'desert', 'ice']);

function zoneAlpha(absLat, a, b, F) {
  const up = a <= 0 ? 1 : clamp01((absLat - a + F) / (2 * F));
  const dn = b >= 90 ? 1 : clamp01((b + F - absLat) / (2 * F));
  return Math.min(up, dn);
}
/** 견본 하나가 이 위도에서 얼마나 진하게 덮이는가 (0~1). land 는 바탕이라 여기서 1 을 돌려준다. */
export function swatchAlphaAt(name, lat) {
  if (name === 'land') return 1;
  const zones = SWATCH_ZONES[name];
  if (!zones) return 0;
  const a = Math.min(90, Math.abs(lat));
  return zones.reduce((m, [lo, hi]) => Math.max(m, zoneAlpha(a, lo, hi, SWATCH_FEATHER)), 0);
}
/** 이 위도의 종이 구성비(합 1). 시험·문서용 — 실제 그림은 바탕 위에 차례로 덮는다. */
export function swatchWeightsAt(lat) {
  const f = swatchAlphaAt('forest', lat), d = swatchAlphaAt('desert', lat), i = swatchAlphaAt('ice', lat);
  // 덮는 순서(forest → desert → ice)대로 남는 몫을 계산한다
  const ice = i, desert = d * (1 - ice), forest = f * (1 - ice - desert), land = Math.max(0, 1 - ice - desert - forest);
  return { land, forest, desert, ice };
}

/**
 * 장식용 산줄기 앵커 — 실제 주요 산맥의 대략 위치(시작·끝 위도/경도)다.
 * **고도 자료가 아니다.** 종이 삼각형을 몇 개 얹어 "산이 있는 곳"을 그림으로 보여 줄 뿐이다.
 */
export const TERRAIN_RANGES = Object.freeze([
  { id: 'himalaya', a: [35.5, 71], b: [27.5, 95], big: true },
  { id: 'andes', a: [8, -72], b: [-52, -71], big: true },
  { id: 'rockies', a: [60, -138], b: [36, -106], big: true },
  { id: 'alps', a: [46.4, 6], b: [47, 14] },
  { id: 'atlas', a: [31, -8], b: [36.5, 9] },
  { id: 'urals', a: [67, 65], b: [51, 58] },
  { id: 'caucasus', a: [43.5, 40], b: [41, 47] },
  { id: 'tianshan', a: [43, 75], b: [41, 87] },
  { id: 'great-dividing', a: [-17, 145], b: [-37, 148] },
  { id: 'scandes', a: [69, 20], b: [60, 7] },
  { id: 'appalachian', a: [46, -70], b: [34, -84] },
  { id: 'zagros', a: [37, 45], b: [27, 56] },
  { id: 'ethiopian', a: [14, 38], b: [6, 39] },
  { id: 'drakensberg', a: [-25, 30], b: [-31, 29] },
  { id: 'sierra-madre', a: [25, -105], b: [17, -97] },
  { id: 'altai', a: [51, 86], b: [46, 96] },
]);

/** 폴리곤 링 → Path2D 에 추가. 경도 180 을 건너뛰는 변은 끊는다(가로선 사고 방지). */
function ringPath(path, ring, w, h) {
  let prev = null, started = false;
  for (const [lon, lat] of ring) {
    const p = equirect(lat, lon, w, h);
    if (!started || (prev !== null && Math.abs(lon - prev) > 180)) { path.moveTo(p.x, p.y); started = true; }
    else path.lineTo(p.x, p.y);
    prev = lon;
  }
  path.closePath();
}

const makeScratch = (canvas, w, h) => {
  const doc = canvas.ownerDocument;
  if (doc?.createElement) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new globalThis.OffscreenCanvas(w, h);
};
/** 띠 경계가 자로 그은 듯 보이지 않게 기둥마다 위도를 조금 민다. */
const bandWobble = u => 5.5 * Math.sin(u * Math.PI * 2 * 2.3) + 3.2 * Math.sin(u * Math.PI * 2 * 5.7 + 1.3) + 1.8 * Math.sin(u * Math.PI * 2 * 11 + 0.7);
const COLS_OF = px => Math.max(2, Math.round(4 * px));

/** 견본을 원하는 타일 크기로 줄여 둔다(패턴 반복 간격 = 이 크기). 한 번 굽는 동안 같은 (견본, 크기)는 다시 만들지 않는다. */
function tileOf(canvas, img, size, cache) {
  const hit = cache?.get(img);
  if (hit?.size === size) return hit.tile;
  const c = makeScratch(canvas, size, size);
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  cache?.set(img, { size, tile: c });
  return c;
}

/** 알파가 실제로 남아 있는 비율(0~1). 층을 "그렸다"고 적기 전에 정말 그려졌는지 센다. */
function coverageOf(c2d, w, h) {
  let on = 0, n = 0;
  for (const fy of [0.08, 0.28, 0.5, 0.72, 0.92]) {
    const d = c2d.getImageData(0, Math.min(h - 1, Math.round(h * fy)), w, 1).data;
    for (let i = 3; i < d.length; i += 4) { n++; if (d[i] > 8) on++; }
  }
  return n ? on / n : 0;
}

/** 지형 장식 — 모래 결 · 종이 나무 · 장식 산줄기. 두 경로가 함께 쓴다. */
function paintTerrainDecor(g, w, h, rnd) {
  const px = w / 2048;
  const yOf = lat => (90 - lat) / 180 * h;
  const latOf = y => 90 - (y / h) * 180;
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {                                   // 사막 모래 결
    const lat = (rnd() < .5 ? 1 : -1) * (19 + rnd() * 13), x = rnd() * w, y = yOf(lat) + (rnd() - .5) * 10 * px;
    const len = (26 + rnd() * 54) * px;
    g.strokeStyle = rnd() < .5 ? 'rgba(255,244,214,.30)' : 'rgba(150,105,52,.16)';
    g.lineWidth = 2.2 * px; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 5 * px, x + len, y); g.stroke();
  }
  for (let i = 0; i < 1500; i++) {                                  // 종이 나무 — 숲·정글 띠에만
    const x = rnd() * w, y = rnd() * h, lat = latOf(y), a = Math.abs(lat);
    if (a > 60 || (a > 18 && a < 33)) continue;
    const s = (5 + rnd() * 4.5) * px * (a < 12 ? 1.15 : 1);
    const dark = a < 12 ? 'hsl(131 32% 25%)' : a < 45 ? 'hsl(104 30% 30%)' : 'hsl(118 22% 30%)';
    const lite = a < 12 ? 'hsl(126 30% 36%)' : a < 45 ? 'hsl(100 30% 42%)' : 'hsl(115 22% 39%)';
    g.fillStyle = 'rgba(40,30,15,.18)';
    g.beginPath(); g.moveTo(x + s * .5, y + s * .3); g.lineTo(x + s * 1.5, y + s * 1.5); g.lineTo(x - s * .5, y + s * 1.5); g.closePath(); g.fill();
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s * 1.35); g.lineTo(x - s, y + s * 1.35); g.closePath(); g.fill();
    g.fillStyle = lite;
    g.beginPath(); g.moveTo(x, y + s * .35); g.lineTo(x + s * .72, y + s * 1.35); g.lineTo(x - s * .72, y + s * 1.35); g.closePath(); g.fill();
  }
  for (const r of TERRAIN_RANGES) {                                 // 장식 산줄기(고도 자료 아님)
    const n = r.big ? 15 : 8, s0 = (r.big ? 15 : 11) * px;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const lat = lerp(r.a[0], r.b[0], t) + (rnd() - .5) * 2.4, lon = lerp(r.a[1], r.b[1], t) + (rnd() - .5) * 2.4;
      const p = equirect(lat, lon, w, h);
      const s = s0 * (0.72 + rnd() * 0.6), snow = Math.abs(lat) > 30 || r.big;
      g.fillStyle = 'rgba(45,32,18,.22)';
      g.beginPath(); g.moveTo(p.x + s * .25, p.y - s * .8); g.lineTo(p.x + s * 1.35, p.y + s * .7); g.lineTo(p.x - s * .85, p.y + s * .7); g.closePath(); g.fill();
      g.fillStyle = 'hsl(28 14% 52%)';
      g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x + s, p.y + s * .7); g.lineTo(p.x - s, p.y + s * .7); g.closePath(); g.fill();
      g.fillStyle = 'hsl(32 16% 68%)';
      g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x - s, p.y + s * .7); g.lineTo(p.x - s * .12, p.y + s * .7); g.closePath(); g.fill();
      if (snow) {
        g.fillStyle = 'hsl(205 24% 95%)';
        g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x + s * .42, p.y - s * .3); g.lineTo(p.x + s * .16, p.y - s * .18); g.lineTo(p.x - s * .1, p.y - s * .38); g.lineTo(p.x - s * .44, p.y - s * .28); g.closePath(); g.fill();
      }
    }
  }
}

/** 나라 경로들과 전체 땅 경로를 만든다. */
function buildPaths(geo, w, h) {
  const paths = [], landAll = new Path2D();
  for (const f of geo.features ?? []) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const path = new Path2D();
    let latSum = 0, n = 0;
    for (const poly of polys) for (const ring of poly) { ringPath(path, ring, w, h); ringPath(landAll, ring, w, h); for (const c of ring) { latSum += c[1]; n++; } }
    paths.push({ path, code: f.code, lat: n ? latSum / n : 0 });
  }
  return { paths, landAll };
}

/** 층 6·7·8 — 해안에만 긋는다. source-atop = 땅 위, destination-over = 아직 빈 곳(=땅 바깥). */
function coastLayers(lc, landAll, px) {
  lc.lineJoin = 'round'; lc.lineCap = 'round';
  lc.globalCompositeOperation = 'source-atop';
  lc.strokeStyle = 'rgba(35,45,25,.10)'; lc.lineWidth = 9 * px; lc.stroke(landAll);                                   // 7 종이 두께
  lc.save(); lc.translate(-2.5 * px, -3.5 * px); lc.strokeStyle = 'rgba(255,250,232,.14)'; lc.lineWidth = 5 * px; lc.stroke(landAll); lc.restore();   // 8 빛 모서리
  lc.globalCompositeOperation = 'destination-over';
  lc.strokeStyle = 'rgba(52,44,24,.5)'; lc.lineWidth = 3.4 * px; lc.stroke(landAll);                                   // 6 자른 단면
  lc.strokeStyle = 'rgba(150,205,226,.34)'; lc.lineWidth = 12 * px; lc.stroke(landAll);                                // 대륙붕 안쪽
  lc.strokeStyle = 'rgba(126,186,214,.30)'; lc.lineWidth = 24 * px; lc.stroke(landAll);                                // 대륙붕 바깥
  lc.save(); lc.translate(5 * px, 7 * px); lc.fillStyle = 'rgba(12,28,40,.34)'; lc.fill(landAll, 'evenodd'); lc.restore();   // 7 떠 있는 그림자
  lc.globalCompositeOperation = 'source-over';
}

/** 극지 만년빙 — 바다까지 덮고 아래 끝은 물결(자른 종이). fill 은 색이거나 패턴. */
function polarSeaIce(ctx, w, h, px, fillFor) {
  for (const dir of [1, -1]) {
    const yEdge = (90 - dir * 71) / 180 * h, yOut = dir > 0 ? -2 : h + 2;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, yOut);
    for (let x = 0; x <= w; x += 7 * px) ctx.lineTo(x, yEdge + dir * (Math.sin(x / w * Math.PI * 2 * 5) * 9 + Math.sin(x / w * Math.PI * 2 * 11 + 1.7) * 5 + Math.sin(x / w * Math.PI * 2 * 23) * 2.5) * px);
    ctx.lineTo(w, yOut); ctx.closePath();
    ctx.clip();
    fillFor(ctx, dir, yEdge, yOut);
    ctx.restore();
  }
}

/**
 * 절차적 종이 지구 — 받을 것이 없다. 첫 화면이 즉시 뜨게 하는 경로.
 * @param {HTMLCanvasElement} canvas  호출부가 만든 캔버스
 * @param {{features: {code:string, geometry:{type:string, coordinates:any}}[]}} geo
 * @param {{w?:number, h?:number, grain?:boolean, decor?:boolean, seed?:number}} [opt]
 * @returns {{ w:number, h:number, features:number, ms:number, mode:string }}
 */
export function paintPaperEarth(canvas, geo, { w = 2048, h = 1024, grain = true, decor = true, seed = 1234567 } = {}) {
  const t0 = (globalThis.performance ?? Date).now();
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  const px = w / 2048;
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#2a4f6e'); sea.addColorStop(.28, '#2f5f83'); sea.addColorStop(.5, '#356a90'); sea.addColorStop(.72, '#2f5f83'); sea.addColorStop(1, '#2a4f6e');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let i = 0; i < 340; i++) {
    const y = rnd() * h, x = rnd() * w, len = (60 + rnd() * 220) * px;
    ctx.strokeStyle = rnd() < .5 ? 'rgba(255,255,255,.028)' : 'rgba(10,30,45,.032)';
    ctx.lineWidth = (1 + rnd() * 1.6) * px;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (rnd() - .5) * 3 * px); ctx.stroke();
  }

  const { paths, landAll } = buildPaths(geo, w, h);
  const landC = makeScratch(canvas, w, h);
  const lc = landC.getContext('2d');
  lc.save();
  lc.clip(landAll, 'evenodd');
  lc.fillStyle = 'hsl(84 28% 56%)'; lc.fillRect(0, 0, w, h);
  const COL = COLS_OF(px), STOPS = 41;
  for (let x = 0; x < w; x += COL) {                                // 생물군 위도 띠
    const wob = bandWobble(x / w);
    const grad = lc.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i < STOPS; i++) { const t = i / (STOPS - 1); grad.addColorStop(t, landToneAt(90 - t * 180 + wob)); }
    lc.fillStyle = grad; lc.fillRect(x, 0, COL + 1, h);
  }
  if (decor) paintTerrainDecor(lc, w, h, rnd);
  for (const dir of [1, -1]) {                                      // 고위도 땅 눈
    const yOf = lat => (90 - lat) / 180 * h;
    const y0 = yOf(dir * 57), y1 = dir > 0 ? 0 : h;
    const grad = lc.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, 'rgba(238,245,250,0)'); grad.addColorStop(.55, 'rgba(238,245,250,.72)'); grad.addColorStop(1, 'rgba(244,249,252,.96)');
    lc.fillStyle = grad;
    lc.beginPath(); lc.moveTo(0, y1);
    for (let x = 0; x <= w; x += 8 * px) lc.lineTo(x, y0 + dir * (Math.sin(x / w * Math.PI * 2 * 6) * 7 + Math.sin(x / w * Math.PI * 2 * 13 + 2) * 4) * px);
    lc.lineTo(w, y1); lc.closePath(); lc.fill();
  }
  for (const p of paths) {                                          // 나라별 옅은 색 차이
    const t = paperTone(p.code, p.lat);
    lc.fillStyle = `hsl(${(360 + 40 + t.hueShift * 3) % 360} 30% ${58 + t.lightShift}%)`;
    lc.globalAlpha = t.alpha; lc.fill(p.path, 'evenodd');
  }
  lc.globalAlpha = 1;
  lc.restore();
  coastLayers(lc, landAll, px);
  ctx.drawImage(landC, 0, 0);

  polarSeaIce(ctx, w, h, px, (c, dir, yEdge, yOut) => {
    const grad = c.createLinearGradient(0, yEdge, 0, yOut);
    grad.addColorStop(0, 'rgba(226,238,246,0)'); grad.addColorStop(.42, 'rgba(233,243,249,.85)'); grad.addColorStop(1, 'rgba(245,250,253,.97)');
    c.fillStyle = grad; c.fillRect(0, 0, w, h);
  });

  if (grain) {
    const n = Math.round(w * h / 54);
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, k = rnd();
      ctx.fillStyle = k < .5 ? 'rgba(255,255,255,.055)' : 'rgba(40,30,15,.04)';
      ctx.fillRect(x, y, 1.6 * px, 1.6 * px);
    }
  }
  return { w, h, features: paths.length, ms: Math.round((globalThis.performance ?? Date).now() - t0), mode: 'procedural' };
}

/**
 * Paper Earth Material v1 — 실제 종이 견본을 지리에 맞춰 오려 붙인다.
 * 견본에는 지리가 없다(geography_baked=false). 어디에 무엇을 붙일지는 SWATCH_ZONES 가 정한다.
 * normal·roughness 는 여기서 굽지 않는다 — three.js 재질에 타일로 직접 물린다(earth.applyMaterial).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{features:any[]}} geo
 * @param {{ocean:CanvasImageSource, land:CanvasImageSource, forest:CanvasImageSource, desert:CanvasImageSource, ice:CanvasImageSource, fiber?:CanvasImageSource}} tex
 * @param {{w?:number, h?:number, decor?:boolean, seed?:number, tile?:number, fiberAlpha?:number}} [opt]
 * @returns {{ w:number, h:number, features:number, ms:number, mode:string, layers:string[] }}
 */
export function paintPaperEarthMaterial(canvas, geo, tex, { w = 2048, h = 1024, decor = true, seed = 1234567, tile = 0, fiberTile = 0, fiberAlpha = 0.45 } = {}) {
  const t0 = (globalThis.performance ?? Date).now();
  for (const k of ['ocean', 'land', 'forest', 'desert', 'ice']) if (!tex?.[k]) throw new Error(`종이 견본이 없다: ${k}`);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  const px = w / 2048;
  // 견본을 너무 줄여 깔면 종이 결이 1픽셀 아래로 내려가 그냥 단색이 된다(2026-09-13 실측: 1/4 로 깔았더니 결이 사라졌다).
  // 앨비도는 경도 180° 마다 한 장, 섬유는 한 바퀴에 한 장 = 원래 결 크기 그대로.
  const TILE = tile || Math.round(w / 2);
  const FIBER_TILE = fiberTile || w;
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const layers = [], coverage = {};
  const tiles = new Map();                                          // 같은 견본을 여러 번 깔아도 타일은 한 장만 만든다
  const patternOf = (c, img, size = TILE) => c.createPattern(tileOf(canvas, img, size, tiles), 'repeat');

  // 1 바다 바탕 종이 + 깊이감(극으로 갈수록 짙게). 견본 색을 살려야 하니 밝히는 쪽은 아주 약하게.
  ctx.fillStyle = patternOf(ctx, tex.ocean); ctx.fillRect(0, 0, w, h);
  const depth = ctx.createLinearGradient(0, 0, 0, h);
  depth.addColorStop(0, 'rgba(6,22,40,.36)'); depth.addColorStop(.3, 'rgba(6,22,40,.07)'); depth.addColorStop(.5, 'rgba(190,232,250,.05)');
  depth.addColorStop(.7, 'rgba(6,22,40,.07)'); depth.addColorStop(1, 'rgba(6,22,40,.36)');
  ctx.fillStyle = depth; ctx.fillRect(0, 0, w, h);
  layers.push('1 ocean base material');

  // 2 땅: 기본 종이 위에 숲·사막·얼음 견본을 위도 띠로 덮는다
  const { paths, landAll } = buildPaths(geo, w, h);
  const landC = makeScratch(canvas, w, h);
  const lc = landC.getContext('2d');
  const band = makeScratch(canvas, w, h);                            // 견본 한 장을 띠 모양으로 오려 내는 작업대(셋이 돌려 쓴다)
  const bc = band.getContext('2d', { willReadFrequently: true });
  const maskC = makeScratch(canvas, w, h);                           // 띠 알파 마스크 — 따로 다 그린 뒤 한 번에 물린다
  const mc = maskC.getContext('2d');
  const COL = COLS_OF(px), STOPS = 73;                               // 2.5° 간격 — 5° 페더를 담을 만큼
  lc.save();
  lc.clip(landAll, 'evenodd');
  lc.fillStyle = patternOf(lc, tex.land); lc.fillRect(0, 0, w, h);
  for (const name of ['forest', 'desert', 'ice']) {
    // (1) 띠 알파 마스크를 source-over 로 **다 그린다**.
    mc.globalCompositeOperation = 'source-over';
    mc.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x += COL) {
      const wob = bandWobble(x / w);
      const g = mc.createLinearGradient(0, 0, 0, h);
      for (let i = 0; i < STOPS; i++) { const t = i / (STOPS - 1); g.addColorStop(t, `rgba(0,0,0,${swatchAlphaAt(name, 90 - t * 180 + wob).toFixed(3)})`); }
      mc.fillStyle = g; mc.fillRect(x, 0, COL + 1, h);
    }
    // (2) 견본을 깔고 **한 번만** 오려 낸다.
    //     destination-in 은 그린 사각형 '바깥'의 목적지를 전부 지운다. 기둥마다 부르면 세 번째 기둥에서 작업대가 통째로 빈다
    //     (2026-09-13 실측: 적도 행 알파>0 픽셀 0/2048, 땅 전체가 기본 종이 한 장이 됐다).
    bc.globalCompositeOperation = 'source-over';
    bc.clearRect(0, 0, w, h);
    bc.fillStyle = patternOf(bc, tex[name]); bc.fillRect(0, 0, w, h);
    bc.globalCompositeOperation = 'destination-in';
    bc.drawImage(maskC, 0, 0);
    bc.globalCompositeOperation = 'source-over';
    // (3) 정말 남았는지 세고 나서 층을 적는다 — 안 그린 층을 그렸다고 보고하면 이런 회귀를 다시 놓친다.
    coverage[name] = +coverageOf(bc, w, h).toFixed(4);
    if (coverage[name] > 0) { lc.drawImage(band, 0, 0); layers.push(`2 land biome material · ${name}`); }
  }
  if (decor) paintTerrainDecor(lc, w, h, rnd);
  for (const p of paths) {                                           // 나라별 옅은 색 차이(선 없음)
    const t = paperTone(p.code, p.lat);
    lc.fillStyle = `hsl(${(360 + 40 + t.hueShift * 3) % 360} 30% ${58 + t.lightShift}%)`;
    lc.globalAlpha = t.alpha * 0.55; lc.fill(p.path, 'evenodd');
  }
  lc.globalAlpha = 1;
  lc.restore();
  coastLayers(lc, landAll, px);                                      // 6·7·8
  layers.push('6 coast cut-edge', '7 paper thickness shadow', '8 soft edge highlight');
  ctx.drawImage(landC, 0, 0);

  // 극지 만년빙 — 얼음 견본으로(바다까지 덮는다)
  polarSeaIce(ctx, w, h, px, (c, dir, yEdge, yOut) => {
    c.fillStyle = patternOf(c, tex.ice); c.fillRect(0, 0, w, h);
    const fade = c.createLinearGradient(0, yEdge, 0, yOut);
    fade.addColorStop(0, 'rgba(255,255,255,0)'); fade.addColorStop(.5, 'rgba(255,255,255,.10)'); fade.addColorStop(1, 'rgba(255,255,255,.22)');
    c.fillStyle = fade; c.fillRect(0, 0, w, h);
  });

  // 3 종이 섬유 한 겹 — 전체에 같은 결을 얹는다.
  // multiply 로 깐다: 섬유는 거의 흰색(평균 229)이라 어두워지는 폭이 4~5% 뿐이고, 결은 그대로 남는다.
  // soft-light 로 깔면 밝은 견본이 전체를 들어 올려 색이 뿌옇게 뜬다(2026-09-13 실측).
  if (tex.fiber) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = fiberAlpha;
    ctx.fillStyle = patternOf(ctx, tex.fiber, FIBER_TILE); ctx.fillRect(0, 0, w, h);
    ctx.restore();
    layers.push('3 fiber overlay');
  }
  layers.sort((a, b) => Number(a[0]) - Number(b[0]));                // 층 번호 순서대로(섬유는 마지막에 그리지만 3번 층이다)
  return { w, h, features: paths.length, ms: Math.round((globalThis.performance ?? Date).now() - t0), mode: 'material', layers, coverage, tile: TILE, fiberTile: FIBER_TILE };
}
