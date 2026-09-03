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

// 비 문턱은 **고도와 무관하게 고정**이다. "번개는 색으로 보이는 비 위에 몰려야 한다"(PD).
// 색면 불투명도가 눈에 들어오는 값이 1.5mm/h(=byte 137, 윈디 범례의 시작값)이고,
// 그건 카메라가 어디 있든 변하지 않는다. 줌으로 바꿀 것은 개수뿐이다.
// (예전엔 최대 줌에서 byte 100 = 0.61mm/h 까지 통과시켜, 색이 거의 없는 곳에 번개가 앉았다.)
//
// rep = 한 칸 안에 흩뿌릴 개수. 1° 칸은 적도에서 111km 라 칸마다 하나만 찍으면
// 뇌우 구역이 '점 몇 개'로 보인다. 가까이 갈수록 칸 안에 여러 개를 흩어 뭉치게 만든다.
const RAIN_MIN = 137;   // 1.5 mm/h — 색면이 눈에 들어오기 시작하는 값
// 뇌우 문턱을 낮춰도 되는 이유: 비(1.5mm/h)와 구름(A≥128) 두 관문이 이미 전지구
// 65,160칸을 90~140칸으로 줄인다. 여기서 뇌우 문턱까지 높이면 화면에 2~5개만 남아
// '뭉쳐 있다'가 아니라 '점 몇 개'가 된다(실측: 고도 2,039km 에서 5개).
const LOD = [
  { alt: 6000, thr: 70, sep: 3, rep: 1, max: 120 },
  { alt: 2500, thr: 58, sep: 2, rep: 2, max: 220 },
  { alt: 1000, thr: 46, sep: 1, rep: 3, max: 340 },
  { alt: 400, thr: 36, sep: 1, rep: 4, max: 520 },
  { alt: 0, thr: 30, sep: 1, rep: 5, max: 760 },
];

// 칸 안에서 흩뿌릴 위치. 매 프레임 같은 자리에 나와야 하므로 난수가 아니라 해시다.
function jitter(x, y, i) {
  let a = (x * 73856093) ^ (y * 19349663) ^ (i * 83492791);
  a = (a ^ 61) ^ (a >>> 16);
  a = (a + (a << 3)) | 0;
  a ^= a >>> 4;
  a = Math.imul(a, 0x27d4eb2d);
  a ^= a >>> 15;
  return (a >>> 0) / 4294967296 - 0.5;
}

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
  // cloudTex 를 같이 받아 **구름 안에서만** 찍는다 — 구름 없이 번개가 치지는 않는다(PD 지적).
  build(precipTex, cloudTex, radius, altKm, centerLat, centerLon, viewDeg) {
    const img = precipTex && precipTex.image;
    if (!img || !img.width) { this.points.visible = false; return 0; }
    const lod = lodFor(altKm);
    const span = Number.isFinite(viewDeg) ? Math.min(180, Math.max(5, viewDeg * 1.6)) : 180;
    const cLat = Number.isFinite(centerLat) ? centerLat : 0;
    const cLon = Number.isFinite(centerLon) ? centerLon : 0;
    const grid = Math.max(1, span / 6);
    const key = `${img.src || ''}|${lod.alt}|${Math.round(cLat / grid)}|${Math.round(cLon / grid)}`;
    if (key === this.lastKey) return this.points.geometry.drawRange.count;

    // 구름 두께를 함께 읽는다.
    // 문턱을 '셰이더가 그리기 시작하는 값'(A=72)에 맞췄더니 여전히 허공에 번개가 떴다.
    // 재보니 그 값에서 셰이더 불투명도는 0.001 — 눈에는 구름이 없다. 게다가 번개 후보의
    // 63%가 A<72, 중앙값 26 이었다(실측): 대류 셀은 응결물이 비로 떨어져 CWAT 가 낮다.
    // 자료에 대류가 있어도 화면에 구름이 없으면 번개를 찍지 않는다 — 보이는 것이 기준이다.
    let cw = null;
    const cimg = cloudTex && cloudTex.image;
    if (cimg && cimg.width) {
      const cc = this.cloudCanvas || (this.cloudCanvas = document.createElement('canvas'));
      if (cc.width !== cimg.width || cc.height !== cimg.height) {
        cc.width = cimg.width;
        cc.height = cimg.height;
        this.cloudCtx = null;
      }
      if (!this.cloudCtx) this.cloudCtx = cc.getContext('2d', { willReadFrequently: true });
      this.cloudCtx.clearRect(0, 0, cc.width, cc.height);
      this.cloudCtx.drawImage(cimg, 0, 0);
      try {
        cw = { px: this.cloudCtx.getImageData(0, 0, cc.width, cc.height).data, W: cc.width };
      } catch (e) {
        cw = null;
      }
    }

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
        // 비가 **색으로 보일 만큼** 와야 한다. 예전엔 0.27mm/h 만 넘으면 통과시켜
        // 약한 비 위에도 번개가 앉았다 — 화면에서는 비 없는 곳처럼 보인다(PD 지적).
        const r = px[o];
        if (r < RAIN_MIN) continue;
        // 구름이 **눈에 보일 만큼** 두꺼운 곳에서만 (A=128 ≈ 셰이더 불투명도 0.25).
        // 구름 자료를 못 읽었으면 아예 찍지 않는다 — 확인 못 한 것을 그리지 않는다.
        if (!cw || cw.px[(y * cw.W + x) * 4 + 3] < 128) continue;
        if (!wrapAll) {
          const lon = ((x + 0.5) / W) * 360 - 180;
          let d = lon - cLon;
          if (d > 180) d -= 360; else if (d < -180) d += 360;
          if (Math.abs(d) > lonHalf) continue;
        }
        // 줄 세우기도 비 강도를 함께 본다 — 가장 센 비의 뇌우 핵에 먼저 앉는다.
        cand.push({ x, y, w: b * (0.35 + 0.65 * (r / 255)) });
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
      // 센 칸일수록 여러 개를 흩뿌린다 — 뇌우 핵이 '뭉쳐' 보여야 한다.
      const reps = Math.max(1, Math.round(lod.rep * (0.45 + 0.55 * (c.w / 255))));
      for (let i = 0; i < reps; i += 1) {
        if (k >= Math.min(lod.max, MAX_MARKS)) break;
        // 칸 안에서만 흔든다(±0.42칸). 칸 밖으로 나가면 비 없는 곳에 앉는다.
        const dx = i === 0 ? 0 : jitter(c.x, c.y, i) * 0.84;
        const dy = i === 0 ? 0 : jitter(c.y, c.x, i + 41) * 0.84;
        const lon = ((c.x + 0.5 + dx) / W) * 360 - 180;
        const lat = 90 - ((c.y + 0.5 + dy) / H) * 180;
        const la = (lat * Math.PI) / 180;
        const lo = (lon * Math.PI) / 180;
        const cl = Math.cos(la);
        pos[k * 3] = radius * cl * Math.sin(lo);
        pos[k * 3 + 1] = radius * Math.sin(la);
        pos[k * 3 + 2] = radius * cl * Math.cos(lo);
        siz[k] = base * (0.8 + 0.4 * (c.w / 255)) * (i === 0 ? 1 : 0.82);
        // 번쩍임이 같이 터지면 한 덩어리로 보인다 — 위상을 어긋나게 준다.
        pha[k] = ((c.x * 7 + c.y * 13 + i * 29) % 97) / 97;
        k += 1;
      }
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
