// EARTHUS v2 — 번개 표식
//
// 왜 표식인가: 윈디를 열어 확인했다(2026-09-03). 윈디는 비를 **색면**으로 그리고
// 번개는 **따로 켜는 표식**으로 얹는다. PD 도 같은 말을 했다 — "색은 우리도 쓰고 있어,
// 그런데 구름에 번개 표시 메뉴가 있어".
//
// 뇌우를 색면으로 칠하면 안 되는 이유(실측 2026-09-03): 대류강수와 CAPE 는 아열대에서
// 흔해서, 그것으로 칠하면 강수 구역의 절반이 뇌우색이 된다. 번개는 드문 사건이어야 한다.
// → 가장 센 셀 몇 개만 골라 표식으로 찍는다. 개수는 고도에 따라 늘린다.
//
// 자료: GFS 강수 프레임 p{step}.png 의 B 채널 — DERIVED(대류강수 세기 × CAPE).
// 관측된 낙뢰가 아니다. 카드에 그렇게 적는다.
import * as THREE from '../../vendor/three-r184.module.min.js';

const FRAMES = 8;
const TILE = 48;
const MAX_MARKS = 900;

// 고도별 예산. 멀면 정말 센 것만, 가까울수록 늘린다.
// 윈디는 뇌우 구역에 작은 번개를 꽤 촘촘히 뿌린다(레퍼런스 확인). 그 밀도에 맞춘다.
const LOD = [
  { alt: 6000, thr: 120, sep: 4, max: 120 },
  { alt: 2500, thr: 100, sep: 3, max: 260 },
  { alt: 1000, thr: 84, sep: 2, max: 420 },
  { alt: 400, thr: 70, sep: 2, max: 620 },
  { alt: 0, thr: 56, sep: 1, max: 900 },
];

function lodFor(altKm) {
  for (const l of LOD) if (altKm >= l.alt) return l;
  return LOD[LOD.length - 1];
}

// 번개 글리프 8프레임. 구름은 그리지 않는다 — 이미 구름 위에 얹히는 표식이다.
function makeAtlas() {
  const can = document.createElement('canvas');
  can.width = TILE * FRAMES;
  can.height = TILE;
  const g = can.getContext('2d');
  for (let f = 0; f < FRAMES; f += 1) {
    // 윈디는 번개를 **연보라**로 찍는다(레퍼런스 확인). 노랑은 도시 날씨 아이콘 쪽이다.
    // 늘 보이되 8칸 중 3칸에서 밝아진다 — 켜져 있기만 하면 번쩍임이 아니고,
    // 꺼져 사라지면 '어디에 뇌우가 있나'를 놓친다.
    const on = f < 3;
    const k = on ? [1.0, 0.78, 0.5][f] : 0.55;
    g.save();
    g.translate(f * TILE, 0);
    if (on) {                               // 번쩍일 때 둘레가 함께 밝아진다
      const gr = g.createRadialGradient(TILE / 2, TILE / 2, 1, TILE / 2, TILE / 2, TILE * 0.46);
      gr.addColorStop(0, `rgba(226,176,246,${0.30 * k})`);
      gr.addColorStop(1, 'rgba(226,176,246,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, TILE, TILE);
    }
    g.globalAlpha = Math.max(0.55, k);
    g.fillStyle = on ? '#e9b6f5' : '#c58fd8';
    g.strokeStyle = 'rgba(86,36,110,0.55)';
    g.lineWidth = TILE * 0.045;
    g.beginPath();
    g.moveTo(TILE * 0.56, TILE * 0.10);
    g.lineTo(TILE * 0.33, TILE * 0.52);
    g.lineTo(TILE * 0.50, TILE * 0.52);
    g.lineTo(TILE * 0.38, TILE * 0.92);
    g.lineTo(TILE * 0.72, TILE * 0.42);
    g.lineTo(TILE * 0.53, TILE * 0.42);
    g.lineTo(TILE * 0.68, TILE * 0.10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(can);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
varying float vPhase;
uniform float uPixelRatio;
void main() {
  vPhase = aPhase;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
}`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D uAtlas;
uniform float uTime;
uniform float uOpacity;
varying float vPhase;
void main() {
  // 셀마다 위상이 달라 동시에 번쩍이지 않는다.
  float f = floor(fract(uTime * 0.55 + vPhase) * 8.0);
  // gl_PointCoord 는 위가 0. CanvasTexture 는 flipY 라 v = 1 - y 로 맞춘다.
  vec2 uv = vec2((f + gl_PointCoord.x) / 8.0, 1.0 - gl_PointCoord.y);
  vec4 t = texture2D(uAtlas, uv);
  if (t.a < 0.02) discard;
  gl_FragColor = vec4(t.rgb, t.a * uOpacity);
}`;

export class LightningMarks {
  constructor(scene) {
    this.uniforms = {
      uAtlas: { value: makeAtlas() },
      uTime: { value: 0 },
      uOpacity: { value: 0.95 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_MARKS * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_MARKS), 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(MAX_MARKS), 1));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = false;
    scene.add(this.points);
    this.canvas = document.createElement('canvas');
    this.ctx = null;
    this.lastKey = null;
  }

  setVisible(v) { this.points.visible = !!v; }

  // precipTex 의 B 채널에서 가장 센 셀만 골라 표식을 놓는다.
  build(precipTex, radius, altKm, centerLat, centerLon, viewDeg) {
    const img = precipTex && precipTex.image;
    if (!img || !img.width) { this.points.visible = false; return 0; }
    const lod = lodFor(altKm);
    const span = Number.isFinite(viewDeg) ? Math.min(180, Math.max(5, viewDeg * 1.6)) : 180;
    const cLat = Number.isFinite(centerLat) ? centerLat : 0;
    const cLon = Number.isFinite(centerLon) ? centerLon : 0;
    const grid = Math.max(1, span / 6);
    const key = `${img.src || ''}|${lod.alt}|${Math.round(cLat / grid)}|${Math.round(cLon / grid)}`;
    if (key === this.lastKey) return this.points.geometry.drawRange.count;

    const W = img.width;
    const H = img.height;
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.ctx = null;
    }
    if (!this.ctx) this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.clearRect(0, 0, W, H);
    this.ctx.drawImage(img, 0, 0);
    let px;
    try {
      px = this.ctx.getImageData(0, 0, W, H).data;
    } catch (e) {
      this.points.visible = false;
      return 0;
    }

    const y0 = Math.max(0, Math.floor(((90 - (cLat + span)) / 180) * H));
    const y1 = Math.min(H, Math.ceil(((90 - (cLat - span)) / 180) * H));
    const lonHalf = span >= 180 ? 180 : span / Math.max(0.15, Math.cos((cLat * Math.PI) / 180));
    const wrapAll = lonHalf >= 180;
    const cand = [];
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const o = (y * W + x) * 4;
        const b = px[o + 2];
        if (b < lod.thr) continue;
        if (px[o] < 46) continue;                 // 비가 없는데 번개만 있을 수는 없다
        if (!wrapAll) {
          const lon = ((x + 0.5) / W) * 360 - 180;
          let d = lon - cLon;
          if (d > 180) d -= 360; else if (d < -180) d += 360;
          if (Math.abs(d) > lonHalf) continue;
        }
        cand.push({ x, y, w: b });
      }
    }
    if (!cand.length) { this.points.geometry.setDrawRange(0, 0); return 0; }
    // 센 곳부터, 최소 간격을 두고 — 격자무늬가 생기지 않고 뇌우 핵에 앉는다.
    cand.sort((a, b) => b.w - a.w);
    const sep = lod.sep;
    const gw = Math.ceil(W / sep);
    const taken = new Set();
    const geo = this.points.geometry;
    const pos = geo.attributes.position.array;
    const siz = geo.attributes.aSize.array;
    const pha = geo.attributes.aPhase.array;
    const base = altKm > 6000 ? 11 : altKm > 2500 ? 13 : altKm > 1000 ? 16 : altKm > 400 ? 20 : 26;
    let k = 0;
    for (const c of cand) {
      if (k >= Math.min(lod.max, MAX_MARKS)) break;
      const key2 = Math.floor(c.y / sep) * gw + Math.floor(c.x / sep);
      if (taken.has(key2)) continue;
      taken.add(key2);
      const lon = ((c.x + 0.5) / W) * 360 - 180;
      const lat = 90 - ((c.y + 0.5) / H) * 180;
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      const cl = Math.cos(la);
      pos[k * 3] = radius * cl * Math.sin(lo);
      pos[k * 3 + 1] = radius * Math.sin(la);
      pos[k * 3 + 2] = radius * cl * Math.cos(lo);
      siz[k] = base * (0.8 + 0.4 * (c.w / 255));
      pha[k] = ((c.x * 7 + c.y * 13) % 97) / 97;
      k += 1;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aPhase.needsUpdate = true;
    geo.setDrawRange(0, k);
    this.lastKey = key;
    return k;
  }

  tick(nowMs) {
    if (this.points.visible) this.uniforms.uTime.value = nowMs * 0.001;
  }
}
