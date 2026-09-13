// EARTHUS V3 WONDER — globe-engine / paper-texture
// 국가 폴리곤(Natural Earth admin 0, content/geo/country-reference.json)을 등장방형 캔버스에 **종이 오려 붙인 느낌**으로 굽는다.
// 그림 파일이 아니라 자료에서 런타임에 만든다 → 배경 24장 납품과 무관하게 지구가 선다. 실제 대륙 배치는 자료 그대로.
// 캔버스는 호출부가 만들어 준다(DOM 은 apps 가 잡는다 — ARCHITECTURE_LOCK §2).
import { equirect } from './geo.mjs';

const hash32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const ICE = new Set(['AQ']);                       // 남극은 얼음빛 종이
const lerp = (a, b, t) => a + (b - a) * t;

/** 종이 색: 국가별로 살짝 다른 따뜻한 종이. 남극은 연한 회청. */
export function paperTone(code, lat = 20) {
  if (ICE.has(code)) return 'hsl(200 18% 92%)';
  const h = hash32(code || '?');
  const hue = 34 + (h % 13) - 6;                   // 28~40 (모래·크라프트 종이)
  const sat = 42 + ((h >> 8) % 10) - 5;            // 37~46
  const lig = 76 + ((h >> 16) % 9) - 4;            // 72~80
  const cold = Math.max(0, (Math.abs(lat) - 45) / 45); // 고위도는 조금 창백하게
  return `hsl(${hue} ${Math.round(lerp(sat, 22, cold))}% ${Math.round(lerp(lig, 84, cold))}%)`;
}

/** 폴리곤 링 → Path2D. 경도 180 을 건너뛰는 변은 끊는다(가로선 사고 방지). */
function ringPath(path, ring, w, h) {
  let prev = null, started = false;
  for (const [lon, lat] of ring) {
    const p = equirect(lat, lon, w, h);
    if (!started || (prev && Math.abs(lon - prev) > 180)) { path.moveTo(p.x, p.y); started = true; }
    else path.lineTo(p.x, p.y);
    prev = lon;
  }
  path.closePath();
}

/**
 * @param {HTMLCanvasElement} canvas  호출부가 만든 캔버스
 * @param {{features: {code:string, nameKo?:string, geometry:{type:string, coordinates:any}}[]}} geo
 * @param {{w?:number, h?:number, grain?:boolean}} [opt]
 * @returns {{ w:number, h:number, features:number, ms:number }}
 */
export function paintPaperEarth(canvas, geo, { w = 2048, h = 1024, grain = true } = {}) {
  const t0 = (globalThis.performance ?? Date).now();
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  // 바다: 연한 종이 파랑 + 위아래로 아주 약한 밝기 차(종이 결)
  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#d3e4ee'); sea.addColorStop(.5, '#c9dde9'); sea.addColorStop(1, '#d3e4ee');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, w, h);

  const paths = [];
  for (const f of geo.features ?? []) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const path = new Path2D();
    let latSum = 0, n = 0;
    for (const poly of polys) for (const ring of poly) { ringPath(path, ring, w, h); for (const c of ring) { latSum += c[1]; n++; } }
    paths.push({ path, code: f.code, lat: n ? latSum / n : 0 });
  }
  const px = w / 2048;                              // 그림자·선 두께를 해상도에 비례
  // 1) 오려 붙인 종이의 그림자 — 모든 땅을 오른쪽 아래로 밀어 어둡게
  ctx.save(); ctx.translate(3 * px, 4 * px); ctx.fillStyle = 'rgba(70,45,20,.28)';
  for (const p of paths) ctx.fill(p.path, 'evenodd');
  ctx.restore();
  // 2) 땅 본체
  for (const p of paths) { ctx.fillStyle = paperTone(p.code, p.lat); ctx.fill(p.path, 'evenodd'); }
  // 3) 자른 단면(가는 어두운 선)
  ctx.lineWidth = 1.2 * px; ctx.strokeStyle = 'rgba(120,90,50,.5)'; ctx.lineJoin = 'round';
  for (const p of paths) ctx.stroke(p.path);
  // 4) 종이 결 — 성긴 점 무늬(밝은/어두운). 사진 노이즈가 아니라 종이 섬유 느낌만.
  if (grain) {
    let s = 1234567;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const n = Math.round(w * h / 48);
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * h, k = rnd();
      ctx.fillStyle = k < .5 ? 'rgba(255,255,255,.07)' : 'rgba(60,40,20,.045)';
      ctx.fillRect(x, y, 1.5 * px, 1.5 * px);
    }
  }
  return { w, h, features: paths.length, ms: Math.round((globalThis.performance ?? Date).now() - t0) };
}
