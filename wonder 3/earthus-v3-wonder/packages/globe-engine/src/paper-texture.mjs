// EARTHUS V3 WONDER — globe-engine / paper-texture (PHASE 1 Paper Earth Core, 2026-09-13 PD 승인 reference 기준)
//
// 국가 폴리곤(Natural Earth admin 0) → 등장방형 캔버스에 **겹쳐 붙인 종이**로 굽는다.
// 그림 파일이 아니라 자료에서 런타임에 만든다 — Paper Earth 는 Background Pack 후보와 완전히 분리다(PD PHASE 1 §BACKGROUND).
// 대륙 배치·해안선은 전부 자료 그대로. 생물군 색은 위도 띠(부드러운 물결 경계)로, 지형 장식(나무·산·모래)은 **장식**이고 고도 자료가 아니다.
//
// 층 순서(아래 → 위):
//   1 바다(깊은 종이 파랑 + 결)  2 대륙붕 헤일로(아래 종이)  3 땅 그림자  4 생물군 띠 + 지형 장식(오프스크린 → 땅 모양으로 한 번에 오려 붙임)
//   5 종이 두께(안쪽 그늘)  6 빛 받는 모서리  7 나라별 색 차이(아주 옅게)  8 자른 단면 선  9 극지 얼음  10 종이 결
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

/** 생물군 기준 위도와 종이색(HSL). 따뜻한 자연색 — 고급 그림책·자연사 박물관 톤. */
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

/** 옛 이름(나라별 종이 차이). 지금은 위도 띠 위에 얹는 아주 옅은 색 차이로만 쓴다. */
export function paperTone(code, lat = 20) {
  const h = hash32(code || '?');
  const dh = (h % 13) - 6, dl = ((h >> 16) % 9) - 4;
  return { hueShift: dh, lightShift: dl, alpha: 0.07 + ((h >> 8) % 5) / 100, biome: biomeAt(lat) };
}

/**
 * 장식용 산줄기 앵커 — 실제 주요 산맥의 대략 위치(시작·끝 위도/경도)다.
 * **고도 자료가 아니다.** 종이 삼각형을 몇 개 얹어 "산이 있는 곳"을 그림으로 보여 줄 뿐이다(가짜 정밀 지형 생성 금지 규칙 준수).
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

/** 위도 띠 + 지형 장식을 오프스크린에 그린다(클리핑 없이). 뒤에서 땅 모양으로 한 번에 오려 붙인다. */
function paintLandLayer(scratch, w, h, rnd) {
  const g = scratch.getContext('2d');
  const px = w / 2048;
  const yOf = lat => (90 - lat) / 180 * h;
  const latOf = y => 90 - (y / h) * 180;

  // 1) 생물군 띠 — 세로 그라디언트를 기둥마다 조금씩 밀어 경계가 물결치게 한다(자로 그은 띠처럼 보이지 않게).
  const COL = Math.max(2, Math.round(4 * px)), STOPS = 41;
  for (let x = 0; x < w; x += COL) {
    const u = x / w;
    const wob = 5.5 * Math.sin(u * Math.PI * 2 * 2.3) + 3.2 * Math.sin(u * Math.PI * 2 * 5.7 + 1.3) + 1.8 * Math.sin(u * Math.PI * 2 * 11 + 0.7);
    const grad = g.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i < STOPS; i++) {
      const t = i / (STOPS - 1);
      grad.addColorStop(t, landToneAt(latOf(t * h) + wob));
    }
    g.fillStyle = grad; g.fillRect(x, 0, COL + 1, h);
  }

  // 2) 사막 모래 결 — 낮은 호 몇 줄
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const lat = (rnd() < .5 ? 1 : -1) * (19 + rnd() * 13), x = rnd() * w, y = yOf(lat) + (rnd() - .5) * 10 * px;
    const len = (26 + rnd() * 54) * px;
    g.strokeStyle = rnd() < .5 ? 'rgba(255,244,214,.30)' : 'rgba(150,105,52,.16)';
    g.lineWidth = 2.2 * px; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 5 * px, x + len, y); g.stroke();
  }

  // 3) 종이 나무 — 숲·정글 띠에만. 삼각형 두 겹 + 줄기.
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * w, y = rnd() * h, lat = latOf(y), a = Math.abs(lat);
    if (a > 60 || (a > 18 && a < 33)) continue;                       // 극지·사막 띠는 건너뛴다
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

  // 4) 장식 산줄기 — 종이 삼각형(밝은 면 + 그늘 면 + 눈 모자). 고도 자료 아님.
  for (const r of TERRAIN_RANGES) {
    const n = r.big ? 15 : 8, s0 = (r.big ? 15 : 11) * px;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const lat = lerp(r.a[0], r.b[0], t) + (rnd() - .5) * 2.4, lon = lerp(r.a[1], r.b[1], t) + (rnd() - .5) * 2.4;
      const p = equirect(lat, lon, w, h);
      const s = s0 * (0.72 + rnd() * 0.6), snow = Math.abs(lat) > 30 || r.big;
      g.fillStyle = 'rgba(45,32,18,.22)';
      g.beginPath(); g.moveTo(p.x + s * .25, p.y - s * .8); g.lineTo(p.x + s * 1.35, p.y + s * .7); g.lineTo(p.x - s * .85, p.y + s * .7); g.closePath(); g.fill();
      g.fillStyle = 'hsl(28 14% 52%)';                                  // 그늘 면
      g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x + s, p.y + s * .7); g.lineTo(p.x - s, p.y + s * .7); g.closePath(); g.fill();
      g.fillStyle = 'hsl(32 16% 68%)';                                  // 빛 받는 면
      g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x - s, p.y + s * .7); g.lineTo(p.x - s * .12, p.y + s * .7); g.closePath(); g.fill();
      if (snow) {
        g.fillStyle = 'hsl(205 24% 95%)';
        g.beginPath(); g.moveTo(p.x, p.y - s); g.lineTo(p.x + s * .42, p.y - s * .3); g.lineTo(p.x + s * .16, p.y - s * .18); g.lineTo(p.x - s * .1, p.y - s * .38); g.lineTo(p.x - s * .44, p.y - s * .28); g.closePath(); g.fill();
      }
    }
  }

  // 5) 고위도 땅 눈 — 위로 갈수록 짙어지는 흰 종이, 아래 끝은 물결
  for (const dir of [1, -1]) {
    const y0 = yOf(dir * 57), y1 = dir > 0 ? 0 : h;
    const grad = g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, 'rgba(238,245,250,0)'); grad.addColorStop(.55, 'rgba(238,245,250,.72)'); grad.addColorStop(1, 'rgba(244,249,252,.96)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, y1);
    for (let x = 0; x <= w; x += 8 * px) g.lineTo(x, y0 + dir * (Math.sin(x / w * Math.PI * 2 * 6) * 7 + Math.sin(x / w * Math.PI * 2 * 13 + 2) * 4) * px);
    g.lineTo(w, y1); g.closePath(); g.fill();
  }
  return scratch;
}

/**
 * @param {HTMLCanvasElement} canvas  호출부가 만든 캔버스
 * @param {{features: {code:string, nameKo?:string, geometry:{type:string, coordinates:any}}[]}} geo
 * @param {{w?:number, h?:number, grain?:boolean, decor?:boolean, seed?:number}} [opt]
 * @returns {{ w:number, h:number, features:number, ms:number }}
 */
export function paintPaperEarth(canvas, geo, { w = 2048, h = 1024, grain = true, decor = true, seed = 1234567 } = {}) {
  const t0 = (globalThis.performance ?? Date).now();
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  const px = w / 2048;
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  // ── 1. 바다: 깊은 종이 파랑. 적도가 조금 밝고 극으로 갈수록 짙다.
  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#2a4f6e'); sea.addColorStop(.28, '#2f5f83'); sea.addColorStop(.5, '#356a90'); sea.addColorStop(.72, '#2f5f83'); sea.addColorStop(1, '#2a4f6e');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  for (let i = 0; i < 340; i++) {                                     // 바다 종이 결 — 긴 가로 섬유(아주 옅게, 긁힘으로 보이지 않게)
    const y = rnd() * h, x = rnd() * w, len = (60 + rnd() * 220) * px;
    ctx.strokeStyle = rnd() < .5 ? 'rgba(255,255,255,.028)' : 'rgba(10,30,45,.032)';
    ctx.lineWidth = (1 + rnd() * 1.6) * px;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (rnd() - .5) * 3 * px); ctx.stroke();
  }

  // ── 2. 나라 경로
  const paths = [];
  const landAll = new Path2D();
  for (const f of geo.features ?? []) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const path = new Path2D();
    let latSum = 0, n = 0;
    for (const poly of polys) for (const ring of poly) { ringPath(path, ring, w, h); ringPath(landAll, ring, w, h); for (const c of ring) { latSum += c[1]; n++; } }
    paths.push({ path, code: f.code, lat: n ? latSum / n : 0 });
  }

  // ── 3. 대륙붕 헤일로: 땅 밑에 깔린 한 장 더 넓은 종이
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(126,186,214,.30)'; ctx.lineWidth = 22 * px; ctx.stroke(landAll);
  ctx.strokeStyle = 'rgba(150,205,226,.34)'; ctx.lineWidth = 11 * px; ctx.stroke(landAll);

  // ── 4. 땅 그림자: 오른쪽 아래로 밀어 어둡게(오려 붙인 종이가 떠 있는 느낌)
  ctx.save(); ctx.translate(5 * px, 7 * px); ctx.fillStyle = 'rgba(12,28,40,.34)'; ctx.fill(landAll, 'evenodd'); ctx.restore();

  // ── 5. 땅: 생물군 띠 + 지형 장식을 오프스크린에 그려 땅 모양으로 한 번에 오려 붙인다(클립 1회 — 느려지지 않게)
  ctx.save();
  ctx.clip(landAll, 'evenodd');
  ctx.fillStyle = 'hsl(84 28% 56%)'; ctx.fillRect(0, 0, w, h);
  if (decor) ctx.drawImage(paintLandLayer(makeScratch(canvas, w, h), w, h, rnd), 0, 0);
  else { const g2 = ctx.createLinearGradient(0, 0, 0, h); for (let i = 0; i < 41; i++) g2.addColorStop(i / 40, landToneAt(90 - (i / 40) * 180)); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h); }
  // 나라별 옅은 색 차이 — 오려 붙인 낱장 느낌(같은 띠 안에서도 살짝 다르게)
  for (const p of paths) {
    const t = paperTone(p.code, p.lat);
    ctx.fillStyle = `hsl(${(360 + 40 + t.hueShift * 3) % 360} 30% ${58 + t.lightShift}%)`;
    ctx.globalAlpha = t.alpha; ctx.fill(p.path, 'evenodd');
  }
  ctx.globalAlpha = 1;
  // 종이 두께: 해안 안쪽에 드리우는 그늘
  ctx.strokeStyle = 'rgba(35,45,25,.20)'; ctx.lineWidth = 9 * px; ctx.stroke(landAll);
  // 빛 받는 모서리: 왼쪽 위로 밀어 밝게(안쪽만 보인다)
  ctx.save(); ctx.translate(-2.5 * px, -3.5 * px); ctx.strokeStyle = 'rgba(255,250,232,.34)'; ctx.lineWidth = 5 * px; ctx.stroke(landAll); ctx.restore();
  ctx.restore();

  // ── 6. 자른 단면: 가는 어두운 선
  ctx.lineWidth = 1.4 * px; ctx.strokeStyle = 'rgba(62,52,28,.55)';
  for (const p of paths) ctx.stroke(p.path);

  // ── 7. 극지 얼음(바다까지 덮는 만년빙). 아래 끝은 물결 — 자른 종이처럼.
  for (const dir of [1, -1]) {
    const yEdge = (90 - dir * 71) / 180 * h, yOut = dir > 0 ? -2 : h + 2;
    const grad = ctx.createLinearGradient(0, yEdge, 0, yOut);
    grad.addColorStop(0, 'rgba(226,238,246,0)'); grad.addColorStop(.42, 'rgba(233,243,249,.85)'); grad.addColorStop(1, 'rgba(245,250,253,.97)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, yOut);
    for (let x = 0; x <= w; x += 7 * px) ctx.lineTo(x, yEdge + dir * (Math.sin(x / w * Math.PI * 2 * 5) * 9 + Math.sin(x / w * Math.PI * 2 * 11 + 1.7) * 5 + Math.sin(x / w * Math.PI * 2 * 23) * 2.5) * px);
    ctx.lineTo(w, yOut); ctx.closePath(); ctx.fill();
  }

  // ── 8. 종이 결: 성긴 점 무늬(사진 노이즈가 아니라 섬유 느낌)
  if (grain) {
    const n = Math.round(w * h / 54);
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, k = rnd();
      ctx.fillStyle = k < .5 ? 'rgba(255,255,255,.055)' : 'rgba(40,30,15,.04)';
      ctx.fillRect(x, y, 1.6 * px, 1.6 * px);
    }
  }
  return { w, h, features: paths.length, ms: Math.round((globalThis.performance ?? Date).now() - t0) };
}
