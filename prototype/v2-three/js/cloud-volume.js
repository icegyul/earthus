// EARTHUS — 구름 3D 볼륨 (v5.3 P5 사다리 최상단: LOW/MEDIUM_3D_VOLUME)
// GFS 기압면 운량(TCDC)을 실제 지오퍼텐셜고도(HGT)로 균일 고도축에 재배열한
// 95×69×32 복셀을 레이마칭한다. 값 생성 없음 — 결측이면 빌드 실패시키는 원본 파이프라인.
// 셸(2D 텍스처)이 아니라 실제 연직 구조를 가진 볼륨이라는 점이 P5의 요구다.
//
// 카메라가 셸 안으로 들어오면 진입면이 사라지므로, 볼륨은 원거리(고도 900km+)
// 전용이고 그 아래는 기존 CTH 릴리프가 맡는다 (사다리의 자동 능력 폴백).

import * as THREE from '../../vendor/three-r184.module.min.js';

// (배포 번들에서 vendor 경로는 ../vendor 로 재작성된다)

const BASE = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds/gfs/volume/east-asia';
const R_M = 6371000;
const COLS = 8; // 32슬라이스 = 8×4 아틀라스
const ROWS = 4;
const VERT_EXAG = 0.6;  // 지형 과장의 0.6배 (CTH 릴리프 구름과 동일 규약)
const FADE_LO = 900;    // km — 이 아래는 볼륨을 끄고 릴리프에 맡긴다
const FADE_HI = 1400;

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uVol;      // 32슬라이스 아틀라스 (R=밀도)
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec4 uBounds;        // west, east, south, north (rad)
uniform vec2 uAlt;           // bottomM, topM
uniform vec2 uDims;          // 슬라이스 크기 (95, 69)
uniform vec2 uAtlas;         // 아틀라스 픽셀 크기
uniform float uRadTop;       // 셸 상단 반경 (렌더 단위)
uniform float uRadBot;
uniform float uK;            // 미터 → 렌더 반경 계수 (과장 포함)
uniform float uOpacity;
uniform float uDensity;
varying vec3 vWorld;

const float PI = 3.141592653589793;
const int STEPS = 48;

// 아틀라스 한 슬라이스 샘플 (타일 경계 블리딩 방지용 반텍셀 인셋)
float slice(vec2 uv, float k) {
  float col = mod(k, ${COLS}.0);
  float row = floor(k / ${COLS}.0);
  vec2 px = clamp(uv, 0.0, 1.0) * (uDims - 1.0) + 0.5;
  vec2 base = vec2(col * uDims.x, row * uDims.y);
  return texture2D(uVol, (base + px) / uAtlas).r;
}

// 월드 좌표 → 복셀 밀도 (경계 밖은 0 — 없는 데이터는 그리지 않는다)
float densityAt(vec3 p) {
  float r = length(p);
  float altM = (r - 1.0) / uK;
  if (altM < uAlt.x || altM > uAlt.y) return 0.0;
  float lat = asin(clamp(p.y / r, -1.0, 1.0));
  float lon = atan(p.x, p.z);
  if (lat < uBounds.z || lat > uBounds.w) return 0.0;
  float du = lon - uBounds.x;
  du = mod(du + PI, 2.0 * PI) - PI;           // 반자오선 감김 보정
  float span = uBounds.y - uBounds.x;
  if (du < 0.0 || du > span) return 0.0;
  vec2 uv = vec2(du / span, (lat - uBounds.z) / (uBounds.w - uBounds.z));
  float w = (altM - uAlt.x) / (uAlt.y - uAlt.x) * 31.0;
  float k0 = floor(w);
  float f = w - k0;
  float a = slice(uv, k0);
  float b = slice(uv, min(k0 + 1.0, 31.0));
  return mix(a, b, f);
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = normalize(vWorld - uCamPos);
  // 셸 경계(동심 구) 해석적 교차 — 진입/이탈 구간만 마칭
  float b = dot(ro, rd);
  float c0 = dot(ro, ro);
  float dTop = b * b - (c0 - uRadTop * uRadTop);
  if (dTop < 0.0) discard;
  float sT = sqrt(dTop);
  float t0 = max(-b - sT, 0.0);
  float t1 = -b + sT;
  float dBot = b * b - (c0 - uRadBot * uRadBot);
  if (dBot > 0.0) {
    float tb = -b - sqrt(dBot);     // 안쪽 구 첫 교차에서 멈춘다 (지표 아래로 안 감)
    if (tb > t0) t1 = min(t1, tb);
  }
  if (t1 <= t0) discard;

  float dt = (t1 - t0) / float(STEPS);
  float acc = 0.0;      // 누적 불투명도
  vec3 col = vec3(0.0);
  float t = t0 + dt * 0.5;
  for (int i = 0; i < STEPS; i += 1) {
    vec3 p = ro + rd * t;
    float d = densityAt(p) * uDensity;
    if (d > 0.002) {
      // 위쪽 한 스텝의 밀도로 자기그림자 근사 (연직 구조가 보이게)
      vec3 up = normalize(p);
      float above = densityAt(p + up * (uAlt.y - uAlt.x) * uK * 0.14) * uDensity;
      float lit = clamp(dot(up, uSunDir), 0.0, 1.0);
      float shade = 1.0 - clamp(above * 1.8, 0.0, 0.82); // 위에 구름이 있으면 아래는 어둡다
      vec3 cc = mix(vec3(0.34, 0.41, 0.53), vec3(1.0, 0.99, 0.96), lit) * (0.26 + 0.74 * shade);
      float a = clamp(d * dt * 145.0, 0.0, 1.0);
      col += cc * a * (1.0 - acc);
      acc += a * (1.0 - acc);
      if (acc > 0.985) break;
    }
    t += dt;
  }
  if (acc < 0.004) discard;
  gl_FragColor = vec4(col, acc * uOpacity);
  #include <colorspace_fragment>
}
`;

export class CloudVolume {
  constructor(scene, getExagger) {
    this.scene = scene;
    this.getExagger = getExagger;
    this.on = false;
    this.loading = false;
    this.mesh = null;
    this.meta = null;
  }

  state() {
    if (!this.on) return { on: false };
    return { on: true, note: this.note || '' };
  }

  async toggle() {
    if (this.loading) return { on: this.on };
    if (this.mesh) {
      this.on = !this.on;
      this.mesh.visible = this.on;
      return { on: this.on };
    }
    this.loading = true;
    try {
      await this.build();
      this.on = true;
      return { on: true, badge: 'MODEL_SIGNAL' };
    } catch (e) {
      console.warn('[cloud-volume]', e);
      return { on: false, error: String((e && e.message) || e) };
    } finally {
      this.loading = false;
    }
  }

  async build() {
    const man = await fetch(`${BASE}/manifest.json`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`manifest ${r.status}`); return r.json(); });
    if (!man.ready || man.synthetic) throw new Error('볼륨 데이터 미준비');
    const { x: NX, y: NY, z: NZ } = man.dimensions;
    if (NZ > COLS * ROWS) throw new Error(`슬라이스 ${NZ} > 아틀라스 용량`);
    const buf = await fetch(`${BASE}/${man.densityUrl}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`density ${r.status}`); return r.arrayBuffer(); });
    const src = new Uint8Array(buf);
    if (src.length < NX * NY * NZ) throw new Error(`밀도 바이트 부족 ${src.length}`);

    // 32슬라이스를 8×4 아틀라스로 (RGBA 텍스처, R에 밀도)
    const AW = NX * COLS;
    const AH = NY * ROWS;
    const atlas = new Uint8Array(AW * AH * 4);
    for (let z = 0; z < NZ; z += 1) {
      const cx = (z % COLS) * NX;
      const cy = Math.floor(z / COLS) * NY;
      for (let y = 0; y < NY; y += 1) {
        for (let x = 0; x < NX; x += 1) {
          const v = src[z * NX * NY + y * NX + x];
          const o = ((cy + y) * AW + (cx + x)) * 4;
          atlas[o] = v; atlas[o + 1] = v; atlas[o + 2] = v; atlas[o + 3] = 255;
        }
      }
    }
    const tex = new THREE.DataTexture(atlas, AW, AH, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;

    const D = Math.PI / 180;
    const bd = man.boundsDegrees;
    const alt = man.anchor;
    this.uniforms = {
      uVol: { value: tex },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uBounds: { value: new THREE.Vector4(bd.west * D, bd.east * D, bd.south * D, bd.north * D) },
      uAlt: { value: new THREE.Vector2(alt.bottomM, alt.topM) },
      uDims: { value: new THREE.Vector2(NX, NY) },
      uAtlas: { value: new THREE.Vector2(AW, AH) },
      uRadTop: { value: 1.02 },
      uRadBot: { value: 1.0 },
      uK: { value: 1 / R_M },
      uOpacity: { value: 0 },
      // texture2D는 이미 0~1로 정규화해 돌려준다 (u8 나누기 금지 — 255배 흐려진다)
      uDensity: { value: 1.0 },
    };

    // 진입면: 지역을 덮는 구면 패치 (여유 3° — 경사 시선에서도 볼륨을 놓치지 않게)
    const m = 3;
    const phiStart = (bd.west - m) * D;
    const phiLen = (bd.east - bd.west + 2 * m) * D;
    const thetaStart = (90 - (bd.north + m)) * D;
    const thetaLen = (bd.north - bd.south + 2 * m) * D;
    const geo = new THREE.SphereGeometry(1, 96, 64, phiStart, phiLen, thetaStart, thetaLen);
    // SphereGeometry의 phi 기준축과 렌더 좌표(x=sinλ, z=cosλ) 정렬
    geo.rotateY(Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.scene.add(this.mesh);
    this.meta = man;

    const v = man.cloudState && man.cloudState.validAt;
    this.note = `${NX}×${NY}×${NZ} 복셀 · 동아시아 · ${v ? `${v.slice(5, 10)} ${v.slice(11, 16)}Z 기준` : ''}`;
    return true;
  }

  cardHtml() {
    const m = this.meta || {};
    const cs = m.cloudState || {};
    const d = m.dimensions || {};
    const a = m.anchor || {};
    return `GFS 기압면 운량(TCDC)을 실제 지오퍼텐셜고도로 균일 고도축에 재배열한 <b>3D 복셀 볼륨</b>을 레이마칭합니다.<br/>`
      + `격자 ${d.x}×${d.y}×${d.z} · 고도 ${Math.round(a.bottomM || 0).toLocaleString()}~${Math.round(a.topM || 0).toLocaleString()}m · 21개 기압면<br/>`
      + `영역: 동아시아 (108–155°E, 18–52°N) · 기준 ${cs.validAt ? cs.validAt.replace('T', ' ').slice(0, 16) + 'Z' : '—'}<br/>`
      + `출처 ${cs.sourceId || 'NOAA NCEP GFS'} · truthClass ${cs.truthClass || 'MODELLED_NWP'} · 합성 구름 추가 없음(결측은 빌드 실패)<br/>`
      + `연직 과장 ${VERT_EXAG}×지형 · 고도 ${FADE_LO}km 아래로 내려가면 관측 CTH 릴리프로 자동 전환(사다리 폴백)`;
  }

  // 매 프레임: 카메라·태양·과장·거리 페이드 갱신
  update(camera, sunDir, altKm) {
    if (!this.mesh || !this.on) return;
    const k = (this.getExagger() * VERT_EXAG) / R_M;
    const u = this.uniforms;
    u.uK.value = k;
    u.uRadBot.value = 1 + u.uAlt.value.x * k;
    u.uRadTop.value = 1 + u.uAlt.value.y * k;
    // 진입 패치는 셸 상단 반경에 둔다 — 반경 1이면 과장된 지형(최대 ~1.07)에 파묻혀 가려진다
    this.mesh.scale.setScalar(u.uRadTop.value);
    u.uCamPos.value.copy(camera.position);
    u.uSunDir.value.copy(sunDir);
    const fade = THREE.MathUtils.smoothstep(altKm, FADE_LO, FADE_HI);
    u.uOpacity.value = fade;
    this.mesh.visible = fade > 0.01;
  }
}
