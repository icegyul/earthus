// EARTHUS — 해양 시뮬레이션 씬 (인텔리전스 시뮬레이션 렌더러)
// ABYSSAL(MIT) 아키텍처에서 영감: 파라미터(파고·너울·풍속)를 넣으면 물리로 그리는 함수.
// 관측값(NOW) / 시나리오 값(SCENARIO)을 같은 엔진이 렌더한다 — 데이터 없이는 열리지 않음.
// v1은 Gerstner 파 합성 자체 구현 (ABYSSAL FFT 오션 포팅은 다음 단계 업그레이드).

import * as THREE from '../../vendor/three-r184.module.min.js';

const NWAVES = 14;
const G = 9.81;

const OCEAN_VERT = /* glsl */ `
uniform float uTime;
uniform float uQ; // 전 파동 공통 스티프니스 (JS에서 ΣkA 기준 정규화 — 루프 방지)
uniform vec4 uWaves[${NWAVES}]; // xy: 방향, z: 진폭(m), w: 파장(m)
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;

void main() {
  vec3 p = vec3(position.x, 0.0, -position.y); // plane(xy) → xz 평면, y 위
  vec3 disp = p;
  vec3 n = vec3(0.0, 1.0, 0.0);
  float foam = 0.0;
  for (int i = 0; i < ${NWAVES}; i += 1) {
    vec2 D = uWaves[i].xy;
    float A = uWaves[i].z;
    float L = uWaves[i].w;
    if (A < 0.001) continue;
    float k = 6.28318 / L;
    float w = sqrt(${G.toFixed(2)} * k);
    float th = k * dot(D, p.xz) - w * uTime;
    float WA = k * A;
    float Q = uQ;
    float s = sin(th);
    float c = cos(th);
    disp.x += Q * A * D.x * c;
    disp.z += Q * A * D.y * c;
    disp.y += A * s;
    n.x -= D.x * WA * c;
    n.z -= D.y * WA * c;
    n.y -= Q * WA * s;
    foam += WA * smoothstep(0.45, 1.0, s);
  }
  vWorld = disp;
  vNormal = normalize(n);
  vFoam = foam;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(disp, 1.0);
}
`;

const OCEAN_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uStorm;
uniform float uFlash;
uniform float uFoamNorm; // 1/ΣkA — 스펙트럼 규모와 무관하게 거품을 파봉에만
uniform vec3 uCamPos;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;

vec3 skyColorFor(vec3 dir, vec3 sun, float storm, float flash) {
  float sunEl = clamp(sun.y, -1.0, 1.0);
  float day = smoothstep(-0.12, 0.25, sunEl);
  vec3 zenithDay = mix(vec3(0.22, 0.42, 0.62), vec3(0.16, 0.18, 0.22), storm);
  vec3 horizDay  = mix(vec3(0.65, 0.74, 0.82), vec3(0.30, 0.32, 0.36), storm);
  vec3 zenithNight = vec3(0.012, 0.02, 0.035);
  vec3 horizNight  = vec3(0.03, 0.045, 0.07);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(mix(horizNight, horizDay, day), mix(zenithNight, zenithDay, day), pow(h, 0.6));
  float sunAmt = pow(max(dot(dir, sun), 0.0), 350.0) * (1.0 - storm * 0.97);
  sky += vec3(1.0, 0.85, 0.6) * sunAmt * day * 3.0;
  sky += pow(max(dot(dir, sun), 0.0), 6.0) * vec3(0.5, 0.4, 0.3) * day * 0.35 * (1.0 - storm * 0.7);
  sky += vec3(0.75, 0.8, 1.0) * flash;
  return sky;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 sun = normalize(uSunDir);
  float day = smoothstep(-0.12, 0.25, sun.y);

  // 물색: 폭풍일수록 회녹색으로
  vec3 deep = mix(vec3(0.012, 0.09, 0.14), vec3(0.05, 0.075, 0.08), uStorm);
  vec3 crest = mix(vec3(0.05, 0.22, 0.26), vec3(0.10, 0.14, 0.14), uStorm);
  float hgt = clamp(vWorld.y * 0.12 + 0.5, 0.0, 1.0);
  vec3 water = mix(deep, crest, hgt) * (0.15 + 0.85 * day);

  // 프레넬 하늘 반사
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  fres = 0.03 + 0.62 * fres;
  vec3 refl = skyColorFor(reflect(-V, N), sun, uStorm, uFlash);
  vec3 color = mix(water, refl, fres);

  // 태양 스페큘러 — 폭풍 하늘에선 해가 안 보이므로 거의 소거
  float spec = pow(max(dot(reflect(-sun, N), V), 0.0), 260.0);
  color += vec3(1.0, 0.9, 0.7) * spec * day * (1.0 - uStorm * 0.93) * 1.6;

  // 거품: 파봉 지표(정규화) + 급경사(법선) 결합 — 가파른 마루만 하얗게
  float crestI = vFoam * uFoamNorm * 3.0;
  float steep = (1.0 - N.y) * 1.4;
  float fn = crestI * 0.55 + steep;
  float foamTh = mix(0.95, 0.52, uStorm);
  float foam = smoothstep(foamTh, foamTh + 0.35, fn);
  color = mix(color, vec3(0.82, 0.88, 0.9) * (0.25 + 0.75 * day + uFlash), foam * 0.85);

  // 번개 섬광
  color += vec3(0.35, 0.4, 0.55) * uFlash * 0.6;

  // 수평선 안개
  float dist = length(vWorld.xz - uCamPos.xz);
  float fog = smoothstep(500.0, 1900.0, dist);
  vec3 fogCol = skyColorFor(normalize(vec3(vWorld.x - uCamPos.x, 20.0, vWorld.z - uCamPos.z)), sun, uStorm, uFlash);
  color = mix(color, fogCol, fog);

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // 항상 최원경
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uStorm;
uniform float uFlash;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i += 1) { v += a * noise(p); p *= 2.1; a *= 0.5; }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 sun = normalize(uSunDir);
  float sunEl = clamp(sun.y, -1.0, 1.0);
  float day = smoothstep(-0.12, 0.25, sunEl);

  vec3 zenithDay = mix(vec3(0.20, 0.40, 0.62), vec3(0.14, 0.16, 0.20), uStorm);
  vec3 horizDay  = mix(vec3(0.66, 0.74, 0.82), vec3(0.28, 0.30, 0.34), uStorm);
  vec3 zenithNight = vec3(0.012, 0.02, 0.035);
  vec3 horizNight  = vec3(0.03, 0.045, 0.07);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(mix(horizNight, horizDay, day), mix(zenithNight, zenithDay, day), pow(h, 0.6));

  // 구름층: 폭풍도에 따라 커버·어두움 증가 (방향 투영 평면에 fbm)
  if (dir.y > 0.01) {
    vec2 cuv = dir.xz / (dir.y + 0.15) * 0.9 + vec2(uTime * 0.004, 0.0);
    float cov = fbm(cuv * 1.4);
    float cloudAmt = smoothstep(0.62 - uStorm * 0.5, 0.95 - uStorm * 0.35, cov);
    vec3 cloudBright = mix(vec3(0.9, 0.92, 0.95), vec3(0.24, 0.25, 0.28), uStorm) * (0.2 + 0.8 * day);
    vec3 cloudDark = cloudBright * mix(0.75, 0.35, uStorm);
    vec3 cloudCol = mix(cloudBright, cloudDark, smoothstep(0.0, 1.0, cov));
    sky = mix(sky, cloudCol, cloudAmt * smoothstep(0.0, 0.12, dir.y));
  }

  // 태양
  float sunAmt = pow(max(dot(dir, sun), 0.0), 500.0) * (1.0 - uStorm * 0.97);
  sky += vec3(1.0, 0.85, 0.55) * sunAmt * day * 4.0;
  sky += pow(max(dot(dir, sun), 0.0), 5.0) * vec3(0.5, 0.42, 0.3) * day * 0.3 * (1.0 - uStorm * 0.8);

  sky += vec3(0.7, 0.75, 1.0) * uFlash * smoothstep(0.0, 0.4, dir.y + 0.3);

  gl_FragColor = vec4(sky, 1.0);
  #include <colorspace_fragment>
}
`;

const RAIN_VERT = /* glsl */ `
uniform float uTime;
uniform float uStorm;
varying float vA;
void main() {
  vec3 p = position;
  p.y = mod(p.y - uTime * (55.0 + uStorm * 45.0), 120.0);
  vA = smoothstep(0.0, 0.15, p.y / 120.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = 2.2;
  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = /* glsl */ `
uniform float uStorm;
varying float vA;
void main() {
  float a = smoothstep(0.35, 0.75, uStorm) * 0.5 * vA;
  gl_FragColor = vec4(0.65, 0.72, 0.8, a);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------

export class OceanSim {
  constructor() {
    this.active = false;
    this.dom = null;
    this.renderer = null;
    this.raf = 0;
    this.flash = 0;
    this.nextFlash = 4;
    this.yaw = 0;
    this.pitch = 0.06;
    this.onParamChange = null;
  }

  ensure() {
    if (this.dom) return;
    const dom = document.createElement('div');
    dom.id = 'simview';
    dom.innerHTML = `
      <canvas id="sim-canvas"></canvas>
      <button id="sim-exit">◀ 지구로</button>
      <div id="sim-info"></div>
      <div id="sim-controls"></div>`;
    document.body.appendChild(dom);
    this.dom = dom;
    this.canvas = dom.querySelector('#sim-canvas');
    this.info = dom.querySelector('#sim-info');
    this.controls = dom.querySelector('#sim-controls');
    dom.querySelector('#sim-exit').addEventListener('click', () => this.close());

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 6000);

    this.uniforms = {
      uTime: { value: 0 },
      uQ: { value: 0.8 },
      uFoamNorm: { value: 1 },
      uWaves: { value: Array.from({ length: NWAVES }, () => new THREE.Vector4(1, 0, 0, 30)) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
    };

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4200, 250, 250),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: OCEAN_VERT,
        fragmentShader: OCEAN_FRAG,
      }),
    );
    ocean.rotation.x = 0; // 버텍스 셰이더에서 xy→xz 변환
    this.scene.add(ocean);

    this.skyUniforms = {
      uSunDir: this.uniforms.uSunDir,
      uStorm: this.uniforms.uStorm,
      uFlash: this.uniforms.uFlash,
      uTime: this.uniforms.uTime,
    };
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(4500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    ));

    // 비: 카메라 주변 박스 파티클
    const rainN = 2200;
    const rp = new Float32Array(rainN * 3);
    for (let i = 0; i < rainN; i += 1) {
      rp[i * 3] = (Math.random() - 0.5) * 160;
      rp[i * 3 + 1] = Math.random() * 120;
      rp[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.Points(rg, new THREE.ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uStorm: this.uniforms.uStorm },
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite: false,
    }));
    this.scene.add(this.rain);

    // 시선 드래그
    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('#sim-controls')) return;
      drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.0032;
      this.pitch += (e.clientY - drag.y) * 0.0028;
      this.pitch = Math.max(-0.25, Math.min(0.6, this.pitch));
      drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', () => { drag = null; });
    dom.addEventListener('pointercancel', () => { drag = null; });
    window.addEventListener('resize', () => { if (this.active) this.resize(); });
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // params: { Hs, swellH, swellT, swellDirDeg, windWaveH, windSpeed, windDirDeg, sunElev, sunAz }
  setParams(params) {
    this.params = params;
    const waves = this.uniforms.uWaves.value;
    const rad = (d) => (d * Math.PI) / 180;
    const list = [];
    const put = (dirDeg, A, L) => list.push({ dirDeg, A, L: Math.max(L, 16) });

    // 너울: 장주기 (λ = gT²/2π)
    const swellH = params.swellH || 0;
    if (swellH > 0.05) {
      const T = Math.max(params.swellT || 8, 4);
      const L = (G * T * T) / (2 * Math.PI);
      put(params.swellDirDeg || 0, swellH * 0.5, L);
      put((params.swellDirDeg || 0) + 14, swellH * 0.25, L * 0.7);
    }
    // 풍파 3대역: 폭풍 바다의 폭력성은 중·단파의 가파름에서 나온다
    const ww = Math.max(params.windWaveH || 0, 0.05);
    const U = Math.max(params.windSpeed || 2, 1);
    const wdir = params.windDirDeg || 0;
    const Lp = Math.min(Math.max(0.35 * U * U, 24), 320);
    const Aw = ww * 0.9; // 진폭 합 목표
    // 대역1 — 에너지 장파 (50%)
    [[-14, 0.30, 1.15], [4, 0.36, 0.9], [19, 0.24, 1.35]].forEach(([d, a, l]) => {
      put(wdir + d, Aw * 0.5 * a, Lp * l);
    });
    // 대역2 — 중파 챱 (32%)
    [[-30, 0.3, 0.32], [-9, 0.34, 0.26], [12, 0.3, 0.38], [33, 0.22, 0.3]].forEach(([d, a, l]) => {
      put(wdir + d, Aw * 0.32 * a, Lp * l);
    });
    // 대역3 — 단파 (18%) : 백파·질감
    [[-42, 0.4, 0.12], [8, 0.42, 0.09], [46, 0.34, 0.14]].forEach(([d, a, l]) => {
      put(wdir + d, Aw * 0.18 * a, Lp * l);
    });
    put(wdir - 55, 0.05, 22);
    put(wdir + 60, 0.04, 26);

    let sumWA = 0;
    for (const wv of list.slice(0, NWAVES)) sumWA += ((2 * Math.PI) / wv.L) * wv.A;

    // 폭풍도
    const Hs = params.Hs || swellH + ww;
    this.storm = Math.max(0, Math.min(1, Math.max(Hs / 9, U / 55)));
    this.uniforms.uStorm.value = this.storm;

    // 스티프니스 정규화: Σ(Q·k·A) ≈ 목표치(<1이면 루프 없음). 폭풍일수록 가파르게
    const targetSteep = 0.78 + this.storm * 0.2;
    this.uniforms.uQ.value = Math.min(targetSteep / Math.max(sumWA, 0.05), 1.4);
    this.uniforms.uFoamNorm.value = 1 / Math.max(sumWA, 0.05);

    for (let i = 0; i < NWAVES; i += 1) {
      const wv = list[i];
      if (wv) waves[i].set(Math.sin(rad(wv.dirDeg)), Math.cos(rad(wv.dirDeg)), wv.A, wv.L);
      else waves[i].set(1, 0, 0, 30);
    }

    // 태양: 실제 그 지점의 고도각
    const el = params.sunElev != null ? params.sunElev : 0.5;
    const az = rad(params.sunAz != null ? params.sunAz : 140);
    this.uniforms.uSunDir.value.set(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    ).normalize();

    // 카메라: 대체로 파봉 위, 큰 마루는 카메라 위로 솟게
    this.camH = 4.0 + Hs * 0.6;
  }

  open(params, infoHtml, controlsHtml) {
    this.ensure();
    this.setParams(params);
    this.info.innerHTML = infoHtml;
    this.controls.innerHTML = controlsHtml || '';
    this.controls.style.display = controlsHtml ? 'flex' : 'none';
    this.active = true;
    this.dom.classList.add('active');
    this.resize();
    this.t0 = performance.now();
    const loop = (now) => {
      if (!this.active) return;
      try {
        const t = (now - this.t0) / 1000;
        this.uniforms.uTime.value = t;
        // 번개: 폭풍도 높을 때 랜덤 섬광
        if (this.storm > 0.55) {
          this.flash *= 0.88;
          this.nextFlash -= 1 / 60;
          if (this.nextFlash <= 0) {
            this.flash = 0.8 + Math.random() * 0.4;
            this.nextFlash = 1.5 + Math.random() * 7 / Math.max(this.storm, 0.6);
          }
        } else { this.flash *= 0.9; }
        this.uniforms.uFlash.value = Math.min(this.flash, 1.2);

        const bob = Math.sin(t * 0.5) * 0.6;
        this.camera.position.set(0, this.camH + bob, 0);
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotateY(this.yaw + t * 0.012);
        this.camera.rotateX(-this.pitch);
        this.uniforms.uCamPos.value.copy(this.camera.position);
        this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.error('[earthus-sim] frame error:', err);
      }
      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.dom) this.dom.classList.remove('active');
    if (this.onClose) this.onClose();
  }
}
