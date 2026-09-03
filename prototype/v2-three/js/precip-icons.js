// EARTHUS v2 — 강수 아이콘 (비 · 눈 · 뇌우)
//
// 왜 아이콘인가: 절차적 셰이더로 그린 빗줄기는 지구본 위에서 싸구려로 보였다(PD 지적).
// 윈디처럼 **작고 성긴 표식**이 훨씬 잘 읽힌다. "이 지역에 눈이 온다/천둥이 친다"가 목적이지
// 비를 사실적으로 렌더링하는 게 목적이 아니다.
//
// 어떻게: 아이콘 아틀라스를 캔버스에 그려 두고(외부 이미지 없음), 강수 격자에서 뽑은
// 지점마다 THREE.Points 하나를 찍는다. 프레임 12칸을 돌며 아이콘이 애니메이션한다.
// 화면 크기 고정(sizeAttenuation false)이라 어느 축척에서도 같은 크기로 읽힌다.
//
// 자료: GFS 강수 프레임 p{step}.png — R=강도(log mm/h) · G=종류 · B=뇌우(DERIVED).
// 종류는 예보 모델의 판정이고 뇌우는 우리가 유도한 값이다. 없는 곳에는 아무것도 찍지 않는다.
import * as THREE from '../../vendor/three-r184.module.min.js';

const FRAMES = 12;          // PD 요청: 12프레임 주기
const TYPES = 3;            // 0 비 · 1 눈 · 2 뇌우
const TILE = 64;
const MAX_POINTS = 2600;    // 버퍼 상한. 실제로 찍는 수는 고도별 예산이 정한다

// 고도별 표시 기준. 멀리서는 '집중적으로 내리는 곳'만, 가까울수록 약한 비까지 보여준다.
// rate/storm 은 강수 PNG 의 0~255 값 (rate 46 ≈ 0.5mm/h · 110 ≈ 2mm/h · 150 ≈ 4mm/h).
const LOD = [
  // altKm 이상,  강수문턱, 뇌우문턱, 격자간격, 최대개수
  { alt: 6000, rate: 150, storm: 120, step: 5, max: 300 },
  { alt: 2500, rate: 122, storm: 96, step: 4, max: 600 },
  { alt: 1000, rate: 92, storm: 74, step: 3, max: 1000 },
  { alt: 400, rate: 64, storm: 60, step: 2, max: 1600 },
  { alt: 0, rate: 40, storm: 46, step: 1, max: 2400 },
];

function lodFor(altKm) {
  for (const l of LOD) if (altKm >= l.alt) return l;
  return LOD[LOD.length - 1];
}

// ---------- 아이콘 아틀라스 ----------
// 12프레임 × 3종. 구름은 고정, 아래 알갱이만 내려간다. 뇌우는 번개가 번쩍인다.
function drawCloud(g, cx, cy, r, alpha) {
  g.globalAlpha = alpha;
  g.fillStyle = '#dfe9f5';
  g.beginPath();
  g.arc(cx - r * 0.55, cy, r * 0.62, 0, Math.PI * 2);
  g.arc(cx + r * 0.05, cy - r * 0.34, r * 0.82, 0, Math.PI * 2);
  g.arc(cx + r * 0.72, cy + r * 0.02, r * 0.58, 0, Math.PI * 2);
  g.ellipse(cx, cy + r * 0.42, r * 1.32, r * 0.46, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

function makeAtlas() {
  const can = document.createElement('canvas');
  can.width = TILE * FRAMES;
  can.height = TILE * TYPES;
  const g = can.getContext('2d');
  const R = TILE * 0.26;
  for (let f = 0; f < FRAMES; f += 1) {
    const t = f / FRAMES;
    for (let ty = 0; ty < TYPES; ty += 1) {
      const ox = f * TILE;
      const oy = ty * TILE;
      g.save();
      g.translate(ox, oy);
      const cx = TILE * 0.5;
      const cy = TILE * 0.36;
      drawCloud(g, cx, cy, R, ty === 2 ? 0.95 : 0.88);

      if (ty === 0) {
        // 비: 빗방울 세 줄기가 아래로. 아래로 갈수록 흐려진다.
        g.strokeStyle = '#7ec8ff';
        g.lineWidth = TILE * 0.055;
        g.lineCap = 'round';
        for (let k = 0; k < 3; k += 1) {
          const px = cx + (k - 1) * TILE * 0.20;
          const phase = (t + k / 3) % 1;
          const y0 = TILE * 0.55 + phase * TILE * 0.26;
          g.globalAlpha = 0.95 * (1 - phase * 0.55);
          g.beginPath();
          g.moveTo(px + TILE * 0.03, y0);
          g.lineTo(px - TILE * 0.02, y0 + TILE * 0.14);
          g.stroke();
        }
      } else if (ty === 1) {
        // 눈: 육각 눈송이 세 개가 천천히 내리며 회전
        g.strokeStyle = '#eaf4ff';
        g.lineWidth = TILE * 0.045;
        g.lineCap = 'round';
        for (let k = 0; k < 3; k += 1) {
          const phase = (t + k / 3) % 1;
          const px = cx + (k - 1) * TILE * 0.20 + Math.sin(phase * Math.PI * 2) * TILE * 0.03;
          const py = TILE * 0.58 + phase * TILE * 0.28;
          const rr = TILE * 0.07;
          g.globalAlpha = 0.95 * (1 - phase * 0.5);
          for (let a = 0; a < 3; a += 1) {
            const ang = (a / 3) * Math.PI + phase * Math.PI;
            g.beginPath();
            g.moveTo(px - Math.cos(ang) * rr, py - Math.sin(ang) * rr);
            g.lineTo(px + Math.cos(ang) * rr, py + Math.sin(ang) * rr);
            g.stroke();
          }
        }
      } else {
        // 뇌우: 12칸 중 3칸에서만 번개가 보인다 — 늘 켜져 있으면 번쩍임이 아니다
        const on = (f % 6 === 0) || (f % 6 === 1);
        g.globalAlpha = 0.9;
        g.strokeStyle = '#7ec8ff';
        g.lineWidth = TILE * 0.05;
        g.lineCap = 'round';
        for (const px of [cx - TILE * 0.22, cx + TILE * 0.22]) {
          const phase = (t + (px < cx ? 0 : 0.5)) % 1;
          const y0 = TILE * 0.56 + phase * TILE * 0.24;
          g.globalAlpha = 0.8 * (1 - phase * 0.5);
          g.beginPath();
          g.moveTo(px + TILE * 0.02, y0);
          g.lineTo(px - TILE * 0.02, y0 + TILE * 0.12);
          g.stroke();
        }
        g.globalAlpha = on ? 1 : 0.22;
        g.fillStyle = on ? '#ffe14d' : '#c8b45a';
        g.beginPath();
        g.moveTo(cx + TILE * 0.04, TILE * 0.50);
        g.lineTo(cx - TILE * 0.09, TILE * 0.72);
        g.lineTo(cx + TILE * 0.005, TILE * 0.72);
        g.lineTo(cx - TILE * 0.06, TILE * 0.95);
        g.lineTo(cx + TILE * 0.14, TILE * 0.66);
        g.lineTo(cx + TILE * 0.03, TILE * 0.66);
        g.closePath();
        g.fill();
        if (on) {
          g.globalAlpha = 0.35;
          g.fillStyle = '#fff6c0';
          g.beginPath();
          g.arc(cx, TILE * 0.72, TILE * 0.22, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(can);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const VERT = /* glsl */ `
attribute float aType;
attribute float aSize;
varying float vType;
varying float vSmall;      // 작게 보일수록 1 — 그때는 종류 색으로 읽히게 한다
uniform float uPixelRatio;
void main() {
  vType = aType;
  vSmall = smoothstep(26.0, 12.0, aSize);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
}`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D uAtlas;
uniform float uFrame;      // 0~11
uniform float uOpacity;
varying float vType;
varying float vSmall;
void main() {
  // gl_PointCoord 는 위가 0, 아래가 1. CanvasTexture 는 flipY 라 v=1 이 캔버스 위쪽이다.
  // 예전엔 여기서 뒤집고 uv 에서 또 뒤집어 서로 상쇄돼 아이콘이 거꾸로 섰다.
  vec2 pc = gl_PointCoord;
  vec2 uv = vec2((floor(uFrame) + pc.x) / 12.0, 1.0 - (vType + pc.y) / 3.0);
  vec4 t = texture2D(uAtlas, uv);
  if (t.a < 0.02) discard;
  // 아이콘이 작아지면 빗방울·번개가 안 보여 셋이 똑같은 흰 점이 된다.
  // 작을수록 종류 색으로 물들여 멀리서도 비/눈/뇌우가 구분되게 한다.
  vec3 tint = vType > 1.5 ? vec3(1.00, 0.82, 0.30)   // 뇌우 — 노랑
            : vType > 0.5 ? vec3(0.93, 0.97, 1.00)   // 눈 — 흰빛
                          : vec3(0.42, 0.72, 1.00);  // 비 — 파랑
  vec3 col = mix(t.rgb, t.rgb * 0.35 + tint * 0.85, vSmall);
  gl_FragColor = vec4(col, t.a * uOpacity);
}`;

export class PrecipIcons {
  constructor(scene) {
    this.atlas = makeAtlas();
    this.uniforms = {
      uAtlas: { value: this.atlas },
      uFrame: { value: 0 },
      uOpacity: { value: 0.95 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
    geo.setAttribute('aType', new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.visible = false;
    scene.add(this.points);
    this.canvas = document.createElement('canvas');
    this.ctx = null;
    this.lastKey = null;
  }

  setVisible(v) { this.points.visible = !!v; }

  // 텍스처 한 장을 캔버스로 옮겨 픽셀을 읽는다. 실패하면 null — 값을 지어내지 않는다.
  readPixels(tex, slot) {
    const img = tex && tex.image;
    if (!img || !img.width) return null;
    const c = this[slot] || (this[slot] = document.createElement('canvas'));
    if (c.width !== img.width || c.height !== img.height) {
      c.width = img.width;
      c.height = img.height;
      this[`${slot}Ctx`] = null;
    }
    let ctx = this[`${slot}Ctx`];
    if (!ctx) {
      ctx = c.getContext('2d', { willReadFrequently: true });
      this[`${slot}Ctx`] = ctx;
    }
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    try {
      return { px: ctx.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
    } catch (e) {
      return null;                                    // 캔버스 오염 등
    }
  }

  // 강수 PNG 를 읽어 표식 지점을 뽑는다.
  // cloudTex 를 같이 받아 **구름 아래**에 매달고, 구름이 없는 곳에는 찍지 않는다.
  // viewDeg: 지금 화면에 보이는 지구의 반각(도). 가까울수록 작다 — 그만큼만 뽑는다.
  build(precipTex, cloudTex, exagger, altKm, centerLat, centerLon, viewDeg) {
    const img = precipTex && precipTex.image;
    if (!img || !img.width) { this.points.visible = false; return 0; }
    const radius = 1.0;
    const lod = lodFor(altKm);
    // 시야가 좁아지면 화면 밖을 뽑을 이유가 없다. 여유 1.6배 — 돌릴 때 빈 곳이 생기지 않게.
    const span = Number.isFinite(viewDeg) ? Math.min(180, Math.max(6, viewDeg * 1.6)) : 180;
    const cLat = Number.isFinite(centerLat) ? centerLat : 0;
    const cLon = Number.isFinite(centerLon) ? centerLon : 0;
    // 카메라가 조금 움직였다고 매번 다시 뽑지 않는다 — 시야의 1/6 만큼 움직이면 갱신한다.
    const grid = Math.max(1, span / 6);
    const key = `${img.src || ''}|${Math.round(exagger)}|${lod.alt}`
      + `|${Math.round(cLat / grid)}|${Math.round(cLon / grid)}|${Math.round(span)}`;
    if (key === this.lastKey) return this.points.geometry.drawRange.count;
    const pRead = this.readPixels(precipTex, 'canvas');
    if (!pRead) { this.points.visible = false; return 0; }
    const { px, W, H } = pRead;
    const cRead = this.readPixels(cloudTex, 'cloudCanvas');   // 없으면 고정 높이로 떨어진다
    const cand = [];
    // 시야 밖은 아예 훑지 않는다 — 같은 예산을 보이는 곳에 쓴다.
    const y0 = Math.max(1, Math.floor(((90 - (cLat + span)) / 180) * H));
    const y1 = Math.min(H - 1, Math.ceil(((90 - (cLat - span)) / 180) * H));
    const lonHalf = span >= 180 ? 180 : span / Math.max(0.15, Math.cos((cLat * Math.PI) / 180));
    const wrapAll = lonHalf >= 180;
    // 한 칸도 빼놓지 않고 훑는다. 간격은 뒤에서 '봉우리 고르기'로 준다 —
    // 일정 간격으로 훑으면 비가 어디에 세든 표식이 격자로 선다(PD 지적).
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const o = (y * W + x) * 4;
        const rate = px[o];
        const storm = px[o + 2];
        if (rate < lod.rate && storm < lod.storm) continue;
        if (!wrapAll) {
          const lon = ((x + 0.5) / W) * 360 - 180;
          let d = lon - cLon;
          if (d > 180) d -= 360; else if (d < -180) d += 360;
          if (Math.abs(d) > lonHalf) continue;
        }
        // 구름이 없는 곳에서 비가 오게 둘 수 없다 — 두께가 없으면 건너뛴다.
        let top = 6000;
        if (cRead) {
          const co = (y * cRead.W + x) * 4;
          if (cRead.px[co + 3] < 24) continue;
          top = (cRead.px[co + 2] / 255) * 16000;
        }
        const kind = px[o + 1];
        const type = storm >= lod.storm && rate >= lod.rate ? 2 : (kind > 190 ? 1 : 0);
        cand.push({ x, y, w: Math.max(rate, storm * 0.9), type, top });
      }
    }
    if (!cand.length) { this.points.geometry.setDrawRange(0, 0); return 0; }
    // 센 곳부터 고르되 이미 고른 것과 최소 간격을 둔다.
    // 봉우리에 먼저 놓이므로 비 모양을 따라 앉고, 격자무늬가 생기지 않는다.
    cand.sort((a, b) => b.w - a.w);
    const sep = Math.max(1, lod.step);
    const gw = Math.ceil(W / sep);
    const taken = new Set();
    const picked = [];
    for (const c of cand) {
      if (picked.length >= lod.max) break;
      const gx = Math.floor(c.x / sep);
      const gy = Math.floor(c.y / sep);
      const k = gy * gw + gx;
      if (taken.has(k)) continue;
      taken.add(k);
      picked.push(c);
    }
    cand.length = 0;
    Array.prototype.push.apply(cand, picked);
    const n = Math.min(cand.length, lod.max, MAX_POINTS);
    const geo = this.points.geometry;
    const pos = geo.attributes.position.array;
    const typ = geo.attributes.aType.array;
    const siz = geo.attributes.aSize.array;
    // 화면 크기 고정 아이콘. 가까울수록 조금 크게, 멀면 작게 — 윈디보다 작게 유지한다.
    // 확대할수록 크게. 가까이서는 1° 격자라 보이는 칸이 몇 개 안 되므로,
    // 작게 두면 '여기 비가 온다'가 아니라 먼지처럼 보인다.
    const base = altKm > 6000 ? 11
      : altKm > 2500 ? 14
        : altKm > 1000 ? 18
          : altKm > 400 ? 26
            : 34;
    for (let i = 0; i < n; i += 1) {
      const c = cand[i];
      const lon = ((c.x + 0.5) / W) * 360 - 180;
      const lat = 90 - ((c.y + 0.5) / H) * 180;
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      const cl = Math.cos(la);
      // 구름 밑에 매단다 — 운정의 45% 높이(대략 구름 밑면). 지형 과장과 같은 배율을 쓴다.
      const r = radius + ((c.top * 0.45) / 6371000) * exagger;
      pos[i * 3] = r * cl * Math.sin(lo);
      pos[i * 3 + 1] = r * Math.sin(la);
      pos[i * 3 + 2] = r * cl * Math.cos(lo);
      typ[i] = c.type;
      siz[i] = base * (0.72 + 0.45 * (c.w / 255));
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aType.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.setDrawRange(0, n);
    this.lastKey = key;
    return n;
  }

  tick(nowMs) {
    if (!this.points.visible) return;
    this.uniforms.uFrame.value = Math.floor((nowMs * 0.0012) % FRAMES);
  }
}
