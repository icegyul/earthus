// EARTHUS v2 — Three.js 지형 지구
// Cesium 프로토타입(prototype/v2)과 별개의 실험 렌더러.
// 실제 고도 데이터(AWS Terrarium 타일)를 정점 변위 + 픽셀 단위 법선 음영으로 직접 렌더링한다.
// 위성/기본색 텍스처는 보조 색상일 뿐이며, 입체감은 전부 고도 데이터에서 나온다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { initShell, buildNowCards, dataBadge, OPEN_COUNTRIES } from './ui-shell.js?v=5';
import { OceanSim } from './sim-ocean.js?v=6';
import { LocalTerrain } from './local-terrain.js?v=1';
import { IntelFeed } from './intel-feed.js?v=2';

const EARTH_RADIUS_M = 6371000;

// ---------------------------------------------------------------------------
// 태양 위치 (실시간): 태양 직하점(subsolar point)의 위도 = 적위, 경도 = 시각에서 계산.
// NOAA 근사식 — 적위 오차 ±0.01° 수준이면 조명용으로 충분하다.
// ---------------------------------------------------------------------------

function subsolarPoint(date) {
  const DEG = Math.PI / 180;
  // J2000 기준 경과일 (UTC)
  const n = date.getTime() / 86400000 - 10957.5;
  const L = (280.460 + 0.9856474 * n) % 360;         // 평균 황경
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG; // 평균 근점이각
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;        // 황도 경사

  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda)); // 적위(rad)

  // 균시차: 평균 황경 - 적경 (°), [-180,180]로 감아 분 단위 환산
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG;
  let dAngle = (((L - alpha) % 360) + 540) % 360 - 180;
  const eotMin = 4 * dAngle;

  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lonDeg = -15 * (utcHours - 12 + eotMin / 60); // 동경 +
  lonDeg = ((lonDeg + 540) % 360) - 180;

  return { latRad: decl, lonRad: lonDeg * DEG, declDeg: decl / DEG, lonDeg };
}
const TERRARIUM_ZOOM = 4; // 16×16 타일 = 4096×4096 웹메르카토르 고도맵
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const BASEMAP_URL = '../v2/assets/physical-earth/ne2-base-8192.jpg';

// ---------------------------------------------------------------------------
// 지형 고도맵 로딩 (Terrarium RGB 인코딩: h = R*256 + G + B/256 - 32768)
// ---------------------------------------------------------------------------

async function loadTerrariumHeightCanvas(onProgress) {
  const n = 1 << TERRARIUM_ZOOM;
  const size = n * 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // 실패 타일은 해수면(32768 → rgb(128,0,0))으로 채워 화면이 깨지지 않게 한다.
  ctx.fillStyle = 'rgb(128,0,0)';
  ctx.fillRect(0, 0, size, size);

  let done = 0;
  let failed = 0;
  const total = n * n;

  const loadTile = (x, y, retry) => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, x * 256, y * 256);
      done += 1;
      onProgress(done, total);
      resolve(true);
    };
    img.onerror = () => {
      if (retry > 0) {
        loadTile(x, y, retry - 1).then(resolve);
      } else {
        failed += 1;
        done += 1;
        onProgress(done, total);
        resolve(false);
      }
    };
    img.src = TILE_URL(TERRARIUM_ZOOM, x, y);
  });

  const jobs = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      jobs.push(loadTile(x, y, 1));
    }
  }
  await Promise.all(jobs);
  return { canvas, failed, total };
}

// ---------------------------------------------------------------------------
// 셰이더
// ---------------------------------------------------------------------------

// 전역 고도맵(z4) + 카메라 주변 고해상도 디테일 윈도우(z6~z8)를 공유하는 샘플링 체인.
// uDetailRect: xy = 윈도 원점(전역 메르카토르 uv), zw = 윈도 폭/높이. 경계는 8% 마진으로 페이드.
const TERRAIN_GLSL = /* glsl */ `
uniform sampler2D uHeightMap;
uniform sampler2D uDetailMap;
uniform vec4 uDetailRect;
uniform float uHasDetail;
uniform float uHasHeight;

const float PI = 3.141592653589793;

float decodeHeight(vec3 rgb) {
  return dot(rgb, vec3(65280.0, 255.0, 255.0 / 256.0)) - 32768.0;
}

vec2 mercatorUV(float lon, float lat) {
  float u = lon / (2.0 * PI) + 0.5;
  float latC = clamp(lat, -1.4844, 1.4844); // ±85.05°
  float v = 0.5 - log(tan(PI * 0.25 + latC * 0.5)) / (2.0 * PI);
  return vec2(u, v);
}

float detailFade(vec2 uv) {
  if (uHasDetail < 0.5) return 0.0;
  float du = fract(uv.x - uDetailRect.x);
  float dv = uv.y - uDetailRect.y;
  if (du >= uDetailRect.z || dv <= 0.0 || dv >= uDetailRect.w) return 0.0;
  vec2 duv = vec2(du / uDetailRect.z, dv / uDetailRect.w);
  vec2 m = min(duv, 1.0 - duv);
  return smoothstep(0.0, 0.08, min(m.x, m.y));
}

float sampleHeight(vec2 uv) {
  float h = decodeHeight(texture2D(uHeightMap, uv).rgb);
  float f = detailFade(uv);
  if (f > 0.0) {
    float du = fract(uv.x - uDetailRect.x);
    float dv = uv.y - uDetailRect.y;
    vec2 duv = vec2(du / uDetailRect.z, dv / uDetailRect.w);
    h = mix(h, decodeHeight(texture2D(uDetailMap, duv).rgb), f);
  }
  return h;
}

float heightAt(float lon, float lat) {
  if (uHasHeight < 0.5) return 0.0;
  return sampleHeight(mercatorUV(lon, lat));
}

// 정점 변위 전용: 디테일 윈도를 쓰지 않고 전역맵을 넓은 탭으로 평균.
// 메시 정점 간격(~0.35°)보다 고주파인 지형을 그대로 찍으면 쿼드 단위
// 앨리어싱 봉우리가 생기므로, 변위는 저주파만 담당하고 잔 디테일은
// 프래그먼트 법선(음영)이 표현한다.
float displacementHeight(float lon, float lat) {
  if (uHasHeight < 0.5) return 0.0;
  float e = 0.003; // ≈ 메시 반 셀
  float c = decodeHeight(texture2D(uHeightMap, mercatorUV(lon, lat)).rgb);
  float n4 = decodeHeight(texture2D(uHeightMap, mercatorUV(lon + e, lat)).rgb)
           + decodeHeight(texture2D(uHeightMap, mercatorUV(lon - e, lat)).rgb)
           + decodeHeight(texture2D(uHeightMap, mercatorUV(lon, lat + e)).rgb)
           + decodeHeight(texture2D(uHeightMap, mercatorUV(lon, lat - e)).rgb);
  return c * 0.4 + n4 * 0.15;
}
`;

const EARTH_VERT = TERRAIN_GLSL + /* glsl */ `
uniform float uExagger;
varying vec3 vUnit;

void main() {
  vUnit = normalize(position);
  float lat = asin(clamp(vUnit.y, -1.0, 1.0));
  float lon = atan(vUnit.x, vUnit.z);
  float h = displacementHeight(lon, lat);
  // 메르카토르 데이터가 ±85°에서 끝나므로 극지는 고정 고도로 페이드 (남극 대륙 빙상 ~2800m).
  float poleFade = smoothstep(1.437, 1.4844, abs(lat));
  h = mix(h, lat < 0.0 ? 2800.0 : 0.0, poleFade);
  // 바다는 해수면에 고정하고 육지만 밀어올린다 (수심은 색으로만 표현).
  float disp = max(h, 0.0) / ${EARTH_RADIUS_M.toFixed(1)} * uExagger;
  vec3 p = vUnit * (1.0 + disp);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const EARTH_FRAG = TERRAIN_GLSL + /* glsl */ `
uniform sampler2D uBaseMap;
uniform sampler2D uDetailImg;
uniform float uHasDetailImg;
uniform float uExagger;
uniform float uShade;
uniform float uPhotoMix;
uniform float uHasBase;
uniform float uDetailEps;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform sampler2D uCloudTex;
uniform float uCloudShadow;
uniform float uCloudLum;
uniform sampler2D uSnowTex;
uniform float uHasSnow;
uniform sampler2D uFocusMask;
uniform float uHasFocus;
uniform vec4 uFocusRect;
uniform vec3 uFocusAccent;
varying vec3 vUnit;

const float R = ${EARTH_RADIUS_M.toFixed(1)};

vec3 srgb(float r, float g, float b) {
  return pow(vec3(r, g, b) / 255.0, vec3(2.2));
}

vec3 hypsometric(float h) {
  vec3 low   = srgb( 74.0, 110.0,  62.0);
  vec3 mid   = srgb(128.0, 128.0,  74.0);
  vec3 high  = srgb(150.0, 116.0,  80.0);
  vec3 rock  = srgb(126.0, 114.0, 104.0);
  vec3 snow  = srgb(232.0, 237.0, 242.0);
  vec3 c = mix(low,  mid,  smoothstep(   80.0, 1000.0, h));
  c      = mix(c,    high, smoothstep( 1000.0, 2600.0, h));
  c      = mix(c,    rock, smoothstep( 2600.0, 4200.0, h));
  c      = mix(c,    snow, smoothstep( 4200.0, 5400.0, h));
  return c;
}

vec3 oceanColor(float h) {
  vec3 deep    = srgb(  6.0,  16.0,  30.0);
  vec3 midsea  = srgb( 14.0,  42.0,  66.0);
  vec3 shallow = srgb( 28.0,  82.0, 112.0);
  float d = clamp(-h, 0.0, 6500.0);
  vec3 c = mix(shallow, midsea, smoothstep(80.0, 1800.0, d));
  c      = mix(c,       deep,   smoothstep(1800.0, 5200.0, d));
  return c;
}

void main() {
  vec3 nGeo = normalize(vUnit);
  float lat = asin(clamp(nGeo.y, -1.0, 1.0));
  float lon = atan(nGeo.x, nGeo.z);

  vec2 cuv = mercatorUV(lon, lat);
  float df = detailFade(cuv);
  float h = uHasHeight > 0.5 ? sampleHeight(cuv) : 0.0;

  // 고도맵 기울기 → 픽셀 법선. 디테일 윈도 안에서는 그 해상도에 맞는 간격으로 샘플.
  float eps = mix(0.0016, uDetailEps, df);
  float hE = heightAt(lon + eps, lat);
  float hW = heightAt(lon - eps, lat);
  float hN = heightAt(lon, lat + eps);
  float hS = heightAt(lon, lat - eps);
  float arcE = eps * R * max(cos(lat), 0.08);
  float arcN = eps * R;
  float slopeE = (hE - hW) / (2.0 * arcE);
  float slopeN = (hN - hS) / (2.0 * arcN);

  vec3 tE = vec3(0.0);
  vec3 tN = vec3(0.0);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 crossUp = cross(up, nGeo);
  if (length(crossUp) > 1e-4) {
    tE = normalize(crossUp);
    tN = cross(nGeo, tE);
  }

  float poleFade = smoothstep(1.437, 1.4844, abs(lat));
  float bumpK = uExagger * uShade * (h < 0.0 ? 0.35 : 1.0) * (1.0 - poleFade);
  vec3 N = normalize(nGeo - (slopeE * tE + slopeN * tN) * bumpK);

  // 조명: uSunDir는 실시간 태양(월드 고정) 또는 수동 모드(화면 기준) — JS에서 매 프레임 계산
  float hillshade = clamp(dot(N, uSunDir), 0.0, 1.0);
  float dayMask = smoothstep(-0.05, 0.10, dot(nGeo, uSunDir));

  // 표면 색
  float coast = smoothstep(-15.0, 15.0, h);
  vec3 ground = mix(oceanColor(h), hypsometric(max(h, 0.0)), coast);

  if (uHasBase > 0.5 && uPhotoMix > 0.001) {
    vec2 baseUV = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    vec3 baseTex = texture2D(uBaseMap, baseUV).rgb;
    ground = mix(ground, baseTex, uPhotoMix);
  }

  // 줌인 시 실제 위성사진(도시·경작지·실지표)이 지형 위로 페이드 인
  if (uHasDetailImg > 0.5 && df > 0.0) {
    float du2 = fract(cuv.x - uDetailRect.x);
    float dv2 = cuv.y - uDetailRect.y;
    vec2 duv2 = vec2(du2 / uDetailRect.z, dv2 / uDetailRect.w);
    vec3 sat = texture2D(uDetailImg, duv2).rgb;
    ground = mix(ground, sat, df * 0.92);
  }

  // 눈·얼음 관측 레이어 (OBSERVED · MODIS NDSI): 지표 재질/상태로만 사용 (17A SNOW/ICE)
  if (uHasSnow > 0.5) {
    vec2 snUV = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    vec4 sn = texture2D(uSnowTex, snUV);
    float sAmt = sn.a * smoothstep(0.10, 0.55, dot(sn.rgb, vec3(0.3333)));
    ground = mix(ground, vec3(0.87, 0.91, 0.95), sAmt * 0.85);
  }

  // 극지 만년설/해빙: 데이터가 없는 위도는 얼음색으로 덮는다
  ground = mix(ground, srgb(226.0, 234.0, 240.0), poleFade);

  vec3 dayCol = ground * (0.30 + 0.85 * hillshade);
  vec3 nightCol = ground * vec3(0.055, 0.070, 0.105); // 밤면: 어두운 청색 잔광
  vec3 color = mix(nightCol, dayCol, dayMask);

  // 구름 그림자: 태양 쪽으로 살짝 이동한 지점의 구름 알파만큼 지면을 어둡게
  if (uCloudShadow > 0.5) {
    vec3 tSun = uSunDir - nGeo * dot(nGeo, uSunDir);
    float tl = length(tSun);
    if (tl > 1e-4) {
      tSun /= tl;
      float k = 0.010;
      float offE = dot(tSun, tE) * k;
      float offN = dot(tSun, tN) * k;
      vec2 suv = vec2(
        (lon + offE / max(cos(lat), 0.2)) / (2.0 * PI) + 0.5,
        (lat + offN) / PI + 0.5
      );
      vec4 ct = texture2D(uCloudTex, suv);
      float ca = mix(ct.a, dot(ct.rgb, vec3(0.3333)), uCloudLum);
      color *= 1.0 - ca * 0.38 * dayMask;
    }
  }

  // 바다 반짝임 (낮면에서만)
  vec3 viewDir = normalize(uCamPos - nGeo);
  if (h < 0.0) {
    vec3 halfV = normalize(uSunDir + viewDir);
    float spec = pow(clamp(dot(N, halfV), 0.0, 1.0), 80.0);
    color += vec3(0.35, 0.45, 0.55) * spec * 0.35 * dayMask;
  }

  // 대기 림 (지표면 쪽) — 밤면은 약하게
  float rim = pow(clamp(1.0 - dot(nGeo, viewDir), 0.0, 1.0), 3.0);
  color += vec3(0.12, 0.25, 0.45) * rim * (0.15 + 0.45 * dayMask);

  // 해양 포커스 (지시서 19.10): 육지 65~80% 억제, 해안선 맥락은 유지
  if (uHasFocus > 1.5) {
    float lumO = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 landDim = mix(vec3(lumO), color, 0.35) * 0.30;
    color = mix(color, landDim, coast * 0.9);
  }
  // 국가 포커스: 선택 외부는 밝기·채도 65% 억제(검은 오버레이 금지, 지형 맥락 유지),
  // 선택 국가는 살짝 리프트 + 국경 액센트 라인 (지시서 19.2/19.4)
  // 마스크는 선택 국가 bbox에 지역화(uFocusRect)되어 작은 나라도 경계가 선명하다.
  else if (uHasFocus > 0.5) {
    vec2 fuv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
    vec2 duv = (fuv - uFocusRect.xy) / uFocusRect.zw;
    vec3 fm = vec3(0.0);
    if (duv.x > 0.0 && duv.x < 1.0 && duv.y > 0.0 && duv.y < 1.0) {
      fm = texture2D(uFocusMask, duv).rgb;
    }
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 dimmed = mix(vec3(lum), color, 0.35) * 0.35;
    // 선택 국가는 밤이어도 보여야 한다(지시서: 선택만 밝고 입체적으로 활성화)
    // → 밤면에서는 카메라 기준 가상 조명으로 지형 음영을 되살린다
    vec3 vlight = normalize(viewDir * 0.8 + tN * 0.45 - tE * 0.35);
    float vshade = clamp(dot(N, vlight), 0.0, 1.0);
    vec3 focusLit = ground * (0.30 + 0.85 * max(hillshade, vshade * (1.0 - dayMask)));
    vec3 inside = mix(color, focusLit, 0.85 * (1.0 - dayMask)) * (1.0 + 0.08 * fm.r);
    color = mix(dimmed, inside, fm.r);
    color += uFocusAccent * fm.g;
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const ATMO_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPosW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ATMO_FRAG = /* glsl */ `
uniform vec3 uCamPos;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 v = normalize(uCamPos - vPosW);
  float glow = pow(clamp(1.0 + dot(normalize(vNormalW), v), 0.0, 1.0), 6.0);
  vec3 c = vec3(0.24, 0.50, 0.85) * glow;
  gl_FragColor = vec4(c, glow);
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// 커스텀 궤도 카메라 (드래그 회전 + 휠 줌, 거리 비례 감속)
// ---------------------------------------------------------------------------

class OrbitCam {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.yaw = 0.6;
    this.pitch = 0.35;
    this.dist = 3.0;
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.targetDist = this.dist;
    this.dragging = false;
    this.autoRotate = true;
    this.minDist = 1.02;
    this.maxDist = 7.0;
    this.glide = 0; // >0이면 느린 감쇠(국가 포커스 카메라 핏, 지시서 0.8~1.4초)

    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const speed = 0.0035 * Math.max(this.targetDist - 1.0, 0.02);
      this.targetYaw -= dx * speed;
      this.targetPitch += dy * speed;
      const lim = Math.PI / 2 - 0.05;
      this.targetPitch = Math.max(-lim, Math.min(lim, this.targetPitch));
    });
    dom.addEventListener('pointerup', () => { this.dragging = false; });
    dom.addEventListener('pointercancel', () => { this.dragging = false; });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetDist *= Math.exp(e.deltaY * 0.0011);
      this.targetDist = Math.max(this.minDist, Math.min(this.maxDist, this.targetDist));
    }, { passive: false });
  }

  update(dt) {
    if (this.autoRotate && !this.dragging && this.glide <= 0) {
      this.targetYaw += dt * 0.02;
    }
    const damp = this.glide > 0 ? 3.2 : 8.0;
    this.glide = Math.max(0, this.glide - dt);
    const k = 1.0 - Math.exp(-dt * damp);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.dist += (this.targetDist - this.dist) * k;

    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      Math.sin(this.yaw) * cp * this.dist,
      Math.sin(this.pitch) * this.dist,
      Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }
}

// ---------------------------------------------------------------------------
// 디테일 지형 스트리밍: 카메라가 내려가면 보이는 지역의 z6~z8 타일(6×6)을 받아
// 전역 z4 고도맵 위에 덧씌운다. 실패 타일은 전역맵 업스케일로 자연스럽게 대체.
// ---------------------------------------------------------------------------

class DetailTerrain {
  constructor(uniforms, baseCanvas) {
    this.uniforms = uniforms;
    this.baseCanvas = baseCanvas;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1536;
    this.canvas.height = 1536;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.flipY = false;
    this.tex.wrapS = THREE.ClampToEdgeWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    uniforms.uDetailMap.value = this.tex;
    // 위성 이미지 윈도우 (같은 타일 좌표계) — 줌인 시 도시·실지표가 보이게
    this.imgCanvas = document.createElement('canvas');
    this.imgCanvas.width = 1536;
    this.imgCanvas.height = 1536;
    this.imgCtx = this.imgCanvas.getContext('2d');
    this.imgTex = new THREE.CanvasTexture(this.imgCanvas);
    this.imgTex.flipY = false;
    this.imgTex.wrapS = THREE.ClampToEdgeWrapping;
    this.imgTex.wrapT = THREE.ClampToEdgeWrapping;
    this.imgTex.minFilter = THREE.LinearFilter;
    this.imgTex.magFilter = THREE.LinearFilter;
    this.imgTex.generateMipmaps = false;
    this.imgTex.colorSpace = THREE.SRGBColorSpace;
    uniforms.uDetailImg.value = this.imgTex;
    this.cur = null; // { z, tx0, ty0 }
    this.busy = false;
  }

  static zoomFor(altKm) {
    if (altKm > 4000) return 0; // 전역 z4로 충분
    if (altKm > 1200) return 6;
    if (altKm > 400) return 7;
    return 8;
  }

  update(latRad, lonRad, altKm) {
    const z = DetailTerrain.zoomFor(altKm);
    if (z === 0) {
      if (this.cur) {
        this.cur = null;
        this.uniforms.uHasDetail.value = 0;
      }
      return;
    }
    const n = 1 << z;
    const lonDeg = THREE.MathUtils.radToDeg(lonRad);
    const latC = THREE.MathUtils.clamp(latRad, -1.4844, 1.4844);
    let txc = Math.floor((((lonDeg + 180) / 360) % 1 + 1) % 1 * n);
    const mercV = 0.5 - Math.log(Math.tan(Math.PI / 4 + latC / 2)) / (2 * Math.PI);
    const tyc = Math.max(0, Math.min(n - 1, Math.floor(mercV * n)));
    const tx0 = txc - 3;
    const ty0 = Math.max(0, Math.min(n - 6, tyc - 3));
    if (this.cur && this.cur.z === z) {
      const dtx = ((tx0 - this.cur.tx0) % n + n) % n;
      if (Math.min(dtx, n - dtx) < 2 && Math.abs(ty0 - this.cur.ty0) < 2) return;
    }
    if (this.busy) return;
    this.busy = true;
    this.fetchWindow(z, tx0, ty0).finally(() => { this.busy = false; });
  }

  async fetchWindow(z, tx0, ty0) {
    const n = 1 << z;
    const u0 = (((tx0 % n) + n) % n) / n;
    const v0 = ty0 / n;
    const w = 6 / n;
    // 전역맵을 미리 업스케일로 깔아 실패 타일이 구멍이 되지 않게 한다
    // (GPU 업로드는 needsUpdate 시점이라 진행 중에도 화면의 이전 윈도는 유지됨)
    if (this.baseCanvas) {
      const bw = this.baseCanvas.width;
      const sx = u0 * bw;
      const sy = v0 * bw;
      const sw = w * bw;
      if (sx + sw <= bw) {
        this.ctx.drawImage(this.baseCanvas, sx, sy, sw, sw, 0, 0, 1536, 1536);
      } else {
        const w1 = bw - sx;
        const px = Math.round(1536 * (w1 / sw));
        this.ctx.drawImage(this.baseCanvas, sx, sy, w1, sw, 0, 0, px, 1536);
        this.ctx.drawImage(this.baseCanvas, 0, sy, sw - w1, sw, px, 0, 1536 - px, 1536);
      }
    }
    const jobs = [];
    let imgOk = 0;
    for (let dy = 0; dy < 6; dy += 1) {
      for (let dx = 0; dx < 6; dx += 1) {
        const tx = (((tx0 + dx) % n) + n) % n;
        const ty = ty0 + dy;
        jobs.push(new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { this.ctx.drawImage(img, dx * 256, dy * 256); resolve(); };
          img.onerror = () => resolve();
          img.src = TILE_URL(z, tx, ty);
        }));
        jobs.push(new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            this.imgCtx.drawImage(img, dx * 256, dy * 256, 256, 256);
            imgOk += 1;
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
        }));
      }
    }
    await Promise.all(jobs);
    this.tex.needsUpdate = true;
    this.imgTex.needsUpdate = true;
    this.cur = { z, tx0, ty0 };
    this.uniforms.uDetailRect.value.set(u0, v0, w, w);
    this.uniforms.uDetailEps.value = ((2 * Math.PI) / (n * 256)) * 1.5;
    this.uniforms.uHasDetail.value = 1;
    this.uniforms.uHasDetailImg.value = imgOk > 18 ? 1 : 0;
  }
}

// ---------------------------------------------------------------------------
// 2D 지도 모드: 고도 250km 아래로 내려가면 3D 지구 대신 슬리피 맵으로 전환.
// 지구→대륙→국가는 3D, 국가 내부는 지도 — 고해상도 3D 지형 데이터 없이 해결.
// ---------------------------------------------------------------------------

class MapView {
  constructor(el, hud, onExit) {
    this.el = el;
    this.tilesEl = document.getElementById('map-tiles');
    this.hud = hud;
    this.onExit = onExit;
    this.active = false;
    this.lat = 37.5;
    this.lon = 127;
    this.zf = 9;
    this.tiles = new Map();
    this.drag = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#map-exit')) return;
      this.drag = { x: e.clientX, y: e.clientY };
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag = { x: e.clientX, y: e.clientY };
      const world = 256 * (2 ** this.zf);
      this.lon = (((this.lon - (dx / world) * 360) + 540) % 360) - 180;
      const v = MapView.mercV(this.lat) - dy / world;
      this.lat = MapView.invMercV(Math.min(Math.max(v, 0.003), 0.997));
      this.render();
    });
    const up = () => { this.drag = null; el.classList.remove('dragging'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zf = Math.min(this.zf - e.deltaY * 0.0016, 17.5);
      if (this.zf < 6.4) { this.exit(); return; }
      this.render();
    }, { passive: false });
    document.getElementById('map-exit').addEventListener('click', () => this.exit());
    window.addEventListener('resize', () => { if (this.active) this.render(); });
  }

  static mercV(latDeg) {
    const s = Math.sin(THREE.MathUtils.degToRad(latDeg));
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  }

  static invMercV(v) {
    return THREE.MathUtils.radToDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * v))));
  }

  show(lat, lon, zf) {
    this.lat = Math.min(Math.max(lat, -84), 84);
    this.lon = (((lon) + 540) % 360) - 180;
    this.zf = Math.min(Math.max(zf, 7), 17);
    this.active = true;
    this.el.classList.add('active');
    this.render();
  }

  exit() {
    this.active = false;
    this.el.classList.remove('active');
    this.onExit(this.lat, this.lon);
  }

  render() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const zi = Math.max(3, Math.min(17, Math.round(this.zf)));
    const n = 1 << zi;
    const scale = 2 ** (this.zf - zi);
    const cx = ((this.lon + 180) / 360) * n * 256;
    const cy = MapView.mercV(this.lat) * n * 256;
    this.tilesEl.style.transform =
      `translate(${W / 2}px, ${H / 2}px) scale(${scale}) translate(${-cx}px, ${-cy}px)`;
    const hx = W / 2 / scale;
    const hy = H / 2 / scale;
    const x0 = Math.floor((cx - hx) / 256);
    const x1 = Math.floor((cx + hx) / 256);
    const y0 = Math.max(0, Math.floor((cy - hy) / 256));
    const y1 = Math.min(n - 1, Math.floor((cy + hy) / 256));
    const need = new Set();
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        const wx = ((tx % n) + n) % n;
        const key = `${zi}/${wx}/${ty}@${tx}`;
        need.add(key);
        if (!this.tiles.has(key)) {
          const img = new Image();
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zi}/${ty}/${wx}`;
          img.style.left = `${tx * 256}px`;
          img.style.top = `${ty * 256}px`;
          img.alt = '';
          this.tilesEl.appendChild(img);
          this.tiles.set(key, img);
        }
      }
    }
    for (const [key, img] of this.tiles) {
      if (!need.has(key)) { img.remove(); this.tiles.delete(key); }
    }
    const latS = `${this.lat >= 0 ? 'N' : 'S'}${Math.abs(this.lat).toFixed(2)}°`;
    const lonS = `${this.lon >= 0 ? 'E' : 'W'}${Math.abs(this.lon).toFixed(2)}°`;
    this.hud.textContent = `지도 모드 · 중심 ${latS} ${lonS} · z${this.zf.toFixed(1)} · 휠 축소로 3D 복귀`;
  }
}

// ---------------------------------------------------------------------------
// 구름 3종: ① 정적 스냅샷 ② 관측(NASA GIBS 어제자 위성 합성에서 구름 추출)
// ③ 모델(GFS 5° 격자, Open-Meteo). 모두 같은 구름 셸 셰이더로 렌더.
// ---------------------------------------------------------------------------

const CLOUD_VERT = /* glsl */ `
varying vec3 vUnit;
void main() {
  vUnit = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform sampler2D uTexB;
uniform float uBlend; // 예보 프레임 보간 (0=uTex, 1=uTexB)
uniform float uAlphaFromLum;
uniform float uOpacity;
uniform vec3 uSunDir;
varying vec3 vUnit;
const float PI = 3.141592653589793;
void main() {
  vec3 n = normalize(vUnit);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  vec4 t = texture2D(uTex, uv);
  if (uBlend > 0.001) {
    vec4 tb = texture2D(uTexB, uv);
    t = mix(t, tb, uBlend);
  }
  float a = mix(t.a, dot(t.rgb, vec3(0.3333)), uAlphaFromLum);
  // 텍스처 색 = 의미 색 (흰색=구름, 파랑=비, 연보라=눈). 휘도 모드(IR)는 백색.
  vec3 tint = mix(t.rgb / max(max(t.r, max(t.g, t.b)), 0.2), vec3(1.0), uAlphaFromLum);
  float day = smoothstep(-0.08, 0.15, dot(n, uSunDir));
  float lit = 0.22 + 0.85 * clamp(dot(n, uSunDir), 0.0, 1.0);
  gl_FragColor = vec4(tint * lit, a * uOpacity * (0.2 + 0.8 * day));
  #include <colorspace_fragment>
}
`;

class CloudManager {
  constructor(scene, earthUniforms, noteEl) {
    this.mode = 'off';
    this.cache = new Map();
    this.noteEl = noteEl;
    this.earthUniforms = earthUniforms;
    this.uniforms = {
      uTex: { value: null },
      uTexB: { value: null },
      uBlend: { value: 0 },
      uAlphaFromLum: { value: 0 },
      uOpacity: { value: 0.92 },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
    };
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 192, 96),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  static texDefaults(tex) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    return tex;
  }

  async loadStatic() {
    const tex = await new THREE.TextureLoader().loadAsync(
      'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r152/examples/textures/planets/earth_clouds_2048.png',
    );
    CloudManager.texDefaults(tex);
    return { tex, lum: 1, label: '정적 스냅샷 · NASA Blue Marble 계열 (실시간 아님)' };
  }

  // 관측: 1차 GMGSI 다중위성 IR 실황(10분급, EARTHUS 캐시) → 실패 시 GIBS 어제자 폴백
  async loadObserved() {
    try {
      return await this.loadGmgsi();
    } catch (err) {
      console.warn('[earthus-cloud] GMGSI 실패 → GIBS 폴백:', err.message);
      return this.loadGibs();
    }
  }

  static loadImg(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`이미지 실패: ${url.slice(0, 80)}`));
      img.src = url;
    });
  }

  async loadGmgsi() {
    const base = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds';
    const meta = await fetch(`${base}/meta.json`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`meta ${r.status}`); return r.json(); });
    const img = await CloudManager.loadImg(`${base}/global.png?t=${encodeURIComponent(meta.time)}`);
    const north = meta.north != null ? meta.north : 72.715;
    const south = meta.south != null ? meta.south : -72.737;
    const W = img.width;
    const H = Math.round(W / 2);
    const full = document.createElement('canvas');
    full.width = W;
    full.height = H;
    const ctx = full.getContext('2d');
    const yTop = Math.round(((90 - north) / 180) * H);
    const yH = Math.round(((north - south) / 180) * H);
    ctx.drawImage(img, 0, yTop, W, yH);
    const tex = CloudManager.texDefaults(new THREE.CanvasTexture(full));
    const t = (meta.time || '').replace('T', ' ').slice(0, 16);
    return { tex, lum: 0, label: `관측 실황 · 다중위성 IR 합성 (NOAA GMGSI) · ${t}Z` };
  }

  async loadGk2a() {
    const base = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds/gk2a';
    const meta = await fetch(`${base}/meta.json`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`meta ${r.status}`); return r.json(); });
    const chs = meta.channels || {};
    const ch = chs.ir112 || chs.wv063;
    if (!ch || !ch.at) throw new Error('GK2A 채널 정보 없음');
    const img = await CloudManager.loadImg(`${base}/ir112.png?t=${ch.at}`);
    const bb = ch.bbox || {};
    const west = bb.west != null ? bb.west : (Array.isArray(bb) ? bb[0] : 70);
    const south = bb.south != null ? bb.south : (Array.isArray(bb) ? bb[1] : -60);
    const east = bb.east != null ? bb.east : (Array.isArray(bb) ? bb[2] : 190);
    const north = bb.north != null ? bb.north : (Array.isArray(bb) ? bb[3] : 60);
    const W = 2048;
    const H = 1024;
    const can = document.createElement('canvas');
    can.width = W;
    can.height = H;
    const ctx = can.getContext('2d');
    const x0 = ((west + 180) / 360) * W;
    const spanX = ((east - west) / 360) * W;
    const y0 = ((90 - north) / 180) * H;
    const spanY = ((north - south) / 180) * H;
    ctx.drawImage(img, x0, y0, spanX, spanY);
    if (x0 + spanX > W) ctx.drawImage(img, x0 - W, y0, spanX, spanY); // 반자오선 랩
    const tex = CloudManager.texDefaults(new THREE.CanvasTexture(can));
    const at = String(ch.at);
    const tf = `${at.slice(4, 6)}/${at.slice(6, 8)} ${at.slice(8, 10)}:${at.slice(10, 12)}Z`;
    return { tex, lum: 1, label: `관측 · 천리안-2A(GK2A) IR 11.2µm · ${tf} · 10분 주기 · 동아시아·서태평양 커버` };
  }

  async loadGibs() {
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // GIBS EPSG4326 타일 격자는 2^n이 아니다: 레벨 3 = 10열×5행(512px), 0.0703°/px
    const cols = 10;
    const rows = 5;
    const src = document.createElement('canvas');
    src.width = cols * 512;
    src.height = rows * 512;
    const sctx = src.getContext('2d');
    // Terra + Aqua + VIIRS 3중 합성: 세 위성의 스와스 갭이 서로 어긋나므로
    // 'lighten'(채널별 최대값)으로 겹치면 궤도 사이 구멍이 대부분 메워진다
    const layers = [
      'MODIS_Terra_CorrectedReflectance_TrueColor',
      'MODIS_Aqua_CorrectedReflectance_TrueColor',
      'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    ];
    for (const layer of layers) {
      const jobs = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          jobs.push(new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { sctx.drawImage(img, c * 512, r * 512); resolve(); };
            img.onerror = () => {
              if (layer === layers[0]) reject(new Error(`GIBS 타일 실패 ${r}/${c}`));
              else resolve(); // Aqua는 보조 — 실패 타일은 Terra만 사용
            };
            img.src = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}/250m/3/${r}/${c}.jpg`;
          }));
        }
      }
      await Promise.all(jobs);
      sctx.globalCompositeOperation = 'lighten';
    }
    sctx.globalCompositeOperation = 'source-over';
    // 진색 영상에서 구름 추출: 밝고 무채색인 픽셀 → 구름 알파 (빙설 지역 오검출은 알려진 한계)
    const d = sctx.getImageData(0, 0, src.width, src.height);
    // 잔여 스와스 갭·날짜변경선 이음새 보간: 검은 런을 양쪽 이웃 색 선형 블렌드로 채움
    {
      const Wc = src.width;
      const Hc = src.height;
      const dd = d.data;
      const lumAt = (i) => dd[i] * 0.299 + dd[i + 1] * 0.587 + dd[i + 2] * 0.114;
      for (let y = 0; y < Hc; y += 1) {
        const row = y * Wc;
        let x = 0;
        while (x < Wc) {
          if (lumAt((row + x) * 4) >= 9) { x += 1; continue; }
          let e = x;
          while (e < Wc && lumAt((row + e) * 4) < 9) e += 1;
          const run = e - x;
          if (run < Wc * 0.85) { // 행 전체가 극야/무데이터면 건드리지 않음
            const li = (row + ((x - 1 + Wc) % Wc)) * 4;
            const ri = (row + (e % Wc)) * 4;
            for (let k = 0; k < run; k += 1) {
              const t = (k + 1) / (run + 1);
              const o = (row + x + k) * 4;
              dd[o] = dd[li] * (1 - t) + dd[ri] * t;
              dd[o + 1] = dd[li + 1] * (1 - t) + dd[ri + 1] * t;
              dd[o + 2] = dd[li + 2] * (1 - t) + dd[ri + 2] * t;
            }
          }
          x = e;
        }
      }
    }
    const out = sctx.createImageData(src.width, src.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i] / 255;
      const g = d.data[i + 1] / 255;
      const b = d.data[i + 2] / 255;
      const mn = Math.min(r, g, b);
      const sat = Math.max(r, g, b) - mn;
      const a = Math.max(0, Math.min(1, (mn - 0.58) * 3.5)) * Math.max(0, Math.min(1, 1 - sat * 3.5));
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = Math.round(a * 255);
    }
    sctx.putImageData(out, 0, 0);
    const tex = CloudManager.texDefaults(new THREE.CanvasTexture(src));
    return { tex, lum: 0, label: `관측 ${date} · Terra+Aqua+VIIRS 3중 합성·갭 보간 (NASA GIBS)` };
  }

  // 격자 시계열 fetch: {lon0, lat0(북쪽부터), dLon, dLat, lonN, latN} → {cc, pr, sn} Float32Array
  async fetchForecastGrid(spec, HOURS) {
    const lats = [];
    const lons = [];
    for (let r = 0; r < spec.latN; r += 1) {
      for (let c = 0; c < spec.lonN; c += 1) {
        lats.push(spec.lat0 - r * spec.dLat);
        lons.push(spec.lon0 + c * spec.dLon);
      }
    }
    const n = lats.length;
    const cc = new Float32Array(n * HOURS);
    const pr = new Float32Array(n * HOURS);
    const sn = new Float32Array(n * HOURS);
    let timeBase = null;
    const batch = 150;
    const reqs = [];
    for (let i = 0; i < n; i += batch) {
      const la = lats.slice(i, i + batch).join(',');
      const lo = lons.slice(i, i + batch).join(',');
      reqs.push(
        fetch(`https://api.open-meteo.com/v1/gfs?latitude=${la}&longitude=${lo}&hourly=cloud_cover,precipitation,snowfall&forecast_days=5&timezone=UTC`)
          .then((r) => { if (!r.ok) throw new Error(`open-meteo ${r.status}`); return r.json(); })
          .then((j) => ({ i, arr: Array.isArray(j) ? j : [j] })),
      );
    }
    for (const { i, arr } of await Promise.all(reqs)) {
      arr.forEach((p, k) => {
        const hc = (p.hourly && p.hourly.cloud_cover) || [];
        const hp = (p.hourly && p.hourly.precipitation) || [];
        const hs = (p.hourly && p.hourly.snowfall) || [];
        if (!timeBase && p.hourly && p.hourly.time && p.hourly.time[0]) {
          timeBase = Date.parse(`${p.hourly.time[0]}:00Z`) || Date.parse(`${p.hourly.time[0]}Z`);
        }
        const o = (i + k) * HOURS;
        for (let h = 0; h < HOURS; h += 1) {
          cc[o + h] = hc[h] != null ? hc[h] : 0;
          pr[o + h] = hp[h] != null ? hp[h] : 0;
          sn[o + h] = hs[h] != null ? hs[h] : 0;
        }
      });
    }
    return { ...spec, cc, pr, sn, timeBase, wrap: Math.abs(spec.dLon * spec.lonN - 360) < 1 };
  }

  static sampleGrid(g, field, latDeg, lonDeg, h, HOURS) {
    const gx = (lonDeg - g.lon0) / g.dLon;
    const gy = (g.lat0 - latDeg) / g.dLat;
    if (gy < -0.5 || gy > g.latN - 0.5) return null;
    let x0f = Math.floor(gx);
    const fy = Math.max(0, Math.min(1, gy - Math.floor(gy)));
    const y0 = Math.max(0, Math.min(g.latN - 1, Math.floor(gy)));
    const y1 = Math.min(g.latN - 1, y0 + 1);
    let x0;
    let x1;
    if (g.wrap) {
      x0 = ((x0f % g.lonN) + g.lonN) % g.lonN;
      x1 = (x0 + 1) % g.lonN;
    } else {
      if (gx < -0.5 || gx > g.lonN - 0.5) return null;
      x0 = Math.max(0, Math.min(g.lonN - 1, x0f));
      x1 = Math.min(g.lonN - 1, x0 + 1);
      x0f = x0;
    }
    const fx = Math.max(0, Math.min(1, gx - x0f));
    const d = g[field];
    const v00 = d[(y0 * g.lonN + x0) * HOURS + h];
    const v10 = d[(y0 * g.lonN + x1) * HOURS + h];
    const v01 = d[(y1 * g.lonN + x0) * HOURS + h];
    const v11 = d[(y1 * g.lonN + x1) * HOURS + h];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
  }

  // 프레임 렌더: 구름=흰색 반투명, 비=파랑(강할수록 진함), 눈=연보라. EA 상세격자가 전역을 덮어씀.
  buildForecastFrame(h) {
    const { grids, HOURS } = this.gfs;
    const W2 = 480;
    const H2 = 240;
    const can = document.createElement('canvas');
    can.width = W2;
    can.height = H2;
    const ctx = can.getContext('2d');
    const im = ctx.createImageData(W2, H2);
    for (let y = 0; y < H2; y += 1) {
      const lat = 90 - ((y + 0.5) / H2) * 180;
      for (let x = 0; x < W2; x += 1) {
        const lon = ((x + 0.5) / W2) * 360 - 180;
        let cc = null;
        let pr = null;
        let sn = null;
        for (let gi = grids.length - 1; gi >= 0; gi -= 1) {
          const v = CloudManager.sampleGrid(grids[gi], 'cc', lat, lon, h, HOURS);
          if (v != null) {
            cc = v;
            pr = CloudManager.sampleGrid(grids[gi], 'pr', lat, lon, h, HOURS);
            sn = CloudManager.sampleGrid(grids[gi], 'sn', lat, lon, h, HOURS);
            break;
          }
        }
        const p = (y * W2 + x) * 4;
        let r = 255;
        let g = 255;
        let b = 255;
        let a = Math.pow(Math.max(cc || 0, 0) / 100, 1.5) * 148;
        if (pr != null && pr >= 0.15) {
          const pI = Math.min(Math.log10(pr + 1) / Math.log10(9), 1);
          const snowDom = sn != null && sn > 0.03 && sn * 7 > pr;
          if (snowDom) {
            r = 205; g = 210; b = 255; // 눈구름: 연보라빛
          } else {
            r = Math.round(60 + (1 - pI) * 90);
            g = Math.round(130 + (1 - pI) * 60);
            b = 255; // 비구름: 강할수록 진한 파랑
          }
          a = Math.max(a, 115 + pI * 140);
        }
        im.data[p] = r;
        im.data[p + 1] = g;
        im.data[p + 2] = b;
        im.data[p + 3] = Math.round(a);
      }
    }
    ctx.putImageData(im, 0, 0);
    return CloudManager.texDefaults(new THREE.CanvasTexture(can));
  }

  async loadGfs() {
    // 5일 예보: 구름+강수(비/눈) 시계열. 1단계 전지구 12°(450지점, 즉시 재생 가능),
    // 2단계 동아시아 4° 상세(태풍·전선 이동용)가 65초 뒤 자동 합류. 분당 한도(위치당 1콜) 준수.
    const HOURS = 120;
    const globalGrid = await this.fetchForecastGrid(
      { lon0: -174, lat0: 84, dLon: 12, dLat: 12, lonN: 30, latN: 15 }, HOURS,
    );
    this.gfs = {
      grids: [globalGrid],
      HOURS,
      timeBase: globalGrid.timeBase || Date.now(),
      texCache: new Map(),
    };
    this.lastOffsetMs = 0;
    // 동아시아 상세 (70~162E, 2~58N, 4°): 태풍 코어·전선대 이동이 여기서 보인다
    setTimeout(async () => {
      try {
        const ea = await this.fetchForecastGrid(
          { lon0: 70, lat0: 58, dLon: 4, dLat: 4, lonN: 24, latN: 15 }, HOURS,
        );
        if (!this.gfs) return;
        this.gfs.grids.push(ea);
        this.gfs.texCache.clear();
        if (this.mode === 'gfs') this.setForecastOffset(this.lastOffsetMs);
        if (this.mode === 'gfs') this.noteEl.innerHTML += ' · <b>동아시아 4° 상세 합류</b>';
      } catch (err) {
        console.warn('[earthus-cloud] EA 상세 격자 실패:', err.message);
      }
    }, 65000);
    const tex = this.gfsFrameTex(Math.max(0, Math.min(HOURS - 1, Math.floor((Date.now() - this.gfs.timeBase) / 3.6e6))));
    return { tex, lum: 0, label: 'GFS 5일 예보 · 구름(흰색)·비(파랑)·눈(연보라) · ▶ 재생 (Open-Meteo)' };
  }

  gfsFrameTex(h) {
    if (this.gfs.texCache.has(h)) return this.gfs.texCache.get(h);
    const tex = this.buildForecastFrame(h);
    this.gfs.texCache.set(h, tex);
    return tex;
  }

  // 타임라인 오프셋(ms) → 예보 프레임 보간. 관측/정적 모드는 무시.
  setForecastOffset(ms) {
    if (this.mode !== 'gfs' || !this.gfs) return;
    this.lastOffsetMs = ms;
    const hF = Math.max(0, Math.min(this.gfs.HOURS - 1.001, (Date.now() + ms - this.gfs.timeBase) / 3.6e6));
    const i0 = Math.floor(hF);
    const texA = this.gfsFrameTex(i0);
    this.uniforms.uTex.value = texA;
    this.uniforms.uTexB.value = this.gfsFrameTex(Math.min(i0 + 1, this.gfs.HOURS - 1));
    this.uniforms.uBlend.value = hF - i0;
    this.earthUniforms.uCloudTex.value = texA;
    const valid = new Date(this.gfs.timeBase + hF * 3.6e6);
    const offH = Math.round((valid.getTime() - Date.now()) / 3.6e6);
    const ea = this.gfs.grids.length > 1 ? ' · EA 4° 상세' : '';
    this.noteEl.innerHTML = `<span class="badge model">MODEL</span> GFS 예보 T${offH >= 0 ? '+' : ''}${offH}h · 유효 ${valid.getMonth() + 1}/${valid.getDate()} ${String(valid.getHours()).padStart(2, '0')}시 · 비=파랑 눈=연보라${ea}`;
  }

  async set(mode) {
    this.mode = mode;
    if (mode === 'off') {
      this.mesh.visible = false;
      this.earthUniforms.uCloudShadow.value = 0;
      this.noteEl.textContent = '구름 끔';
      return true;
    }
    if (!this.cache.has(mode)) {
      this.noteEl.textContent = '구름 데이터 로딩 중…';
      try {
        const entry = mode === 'static' ? await this.loadStatic()
          : mode === 'obs' ? await this.loadObserved()
            : mode === 'gk2a' ? await this.loadGk2a()
              : await this.loadGfs();
        this.cache.set(mode, entry);
      } catch (err) {
        console.error('[earthus-three] cloud load failed:', mode, err);
        this.noteEl.textContent = `로드 실패 (${err.message}) — 잠시 후 다시 시도`;
        if (this.mode === mode) {
          this.mode = 'off';
          this.mesh.visible = false;
          this.earthUniforms.uCloudShadow.value = 0;
        }
        return false;
      }
    }
    if (this.mode !== mode) return true; // 로딩 중 다른 모드로 바뀜
    const entry = this.cache.get(mode);
    this.uniforms.uTex.value = entry.tex;
    this.uniforms.uTexB.value = entry.tex;
    this.uniforms.uBlend.value = 0;
    this.uniforms.uAlphaFromLum.value = entry.lum;
    this.earthUniforms.uCloudTex.value = entry.tex;
    this.earthUniforms.uCloudLum.value = entry.lum;
    this.earthUniforms.uCloudShadow.value = 1;
    this.mesh.visible = true;
    this.noteEl.textContent = entry.label;
    return true;
  }
}

// ---------------------------------------------------------------------------
// 국가 포커스 (지시서 19.2/19.4): 클릭한 국가만 활성, 외부는 디밍.
// 경계 데이터: prototype/data/country-reference.json (Natural Earth admin-0)
// ---------------------------------------------------------------------------

class CountryFocus {
  constructor(uniforms, orbit, chipEl) {
    this.uniforms = uniforms;
    this.orbit = orbit;
    this.chip = chipEl;
    this.data = null;
    this.selected = null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2048;
    this.canvas.height = 1024;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.wrapS = THREE.RepeatWrapping;
    this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    uniforms.uFocusMask.value = this.tex;
    this.chip.addEventListener('click', (e) => {
      if (e.target.closest('.chip-x')) this.clear();
    });
    fetch('../data/country-reference.json')
      .then((r) => r.json())
      .then((j) => { this.data = j; })
      .catch((e) => console.warn('[earthus-three] country data load failed:', e));
  }

  static inRing(ring, lon, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  pick(lat, lon) {
    if (!this.data) return null;
    for (const f of this.data.features) {
      for (const poly of polysOf(f)) {
        if (CountryFocus.inRing(poly[0], lon, lat)) {
          let inHole = false;
          for (let h = 1; h < poly.length; h += 1) {
            if (CountryFocus.inRing(poly[h], lon, lat)) { inHole = true; break; }
          }
          if (!inHole) return f;
        }
      }
    }
    return null;
  }

  select(f) {
    if (this.selected && this.selected.code3 === f.code3) { this.clear(); return; }
    this.selected = f;

    // bbox 먼저: 마스크를 국가 영역에 지역화해 작은 나라도 경계가 선명하게
    let minLo = 180; let maxLo = -180; let minLa = 90; let maxLa = -90;
    for (const poly of polysOf(f)) {
      for (const [lo, la] of poly[0]) {
        if (lo < minLo) minLo = lo;
        if (lo > maxLo) maxLo = lo;
        if (la < minLa) minLa = la;
        if (la > maxLa) maxLa = la;
      }
    }
    const mLo = Math.max((maxLo - minLo) * 0.06, 0.3);
    const mLa = Math.max((maxLa - minLa) * 0.06, 0.3);
    const r0 = {
      lo: Math.max(minLo - mLo, -180),
      la: Math.max(minLa - mLa, -90),
      w: Math.min(maxLo + mLo, 180) - Math.max(minLo - mLo, -180),
      h: Math.min(maxLa + mLa, 90) - Math.max(minLa - mLa, -90),
    };
    const CW = this.canvas.width;
    const CH = this.canvas.height;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, CW, CH);
    const X = (lo) => ((lo - r0.lo) / r0.w) * CW;
    const Y = (la) => ((r0.la + r0.h - la) / r0.h) * CH;
    const trace = () => {
      ctx.beginPath();
      for (const poly of polysOf(f)) {
        for (const ring of poly) {
          ring.forEach(([lo, la], i) => {
            if (i === 0) ctx.moveTo(X(lo), Y(la));
            else ctx.lineTo(X(lo), Y(la));
          });
          ctx.closePath();
        }
      }
    };
    trace();
    ctx.fillStyle = 'rgb(255,0,0)'; // R: 국가 내부
    ctx.fill('evenodd');
    trace();
    ctx.strokeStyle = 'rgb(0,255,0)'; // G: 국경 액센트 라인
    ctx.lineWidth = 3;
    ctx.stroke();
    this.tex.needsUpdate = true;
    this.uniforms.uFocusRect.value.set(
      (r0.lo + 180) / 360,
      (r0.la + 90) / 180,
      r0.w / 360,
      r0.h / 180,
    );

    // 카메라 핏: 경계 bbox → 중심·거리, 1.1초 글라이드
    const spanLoRaw = maxLo - minLo;
    const cLa = (minLa + maxLa) / 2;
    const cLo = (minLo + maxLo) / 2; // 반자오선 국가는 근사치로 충분
    const span = Math.max(
      maxLa - minLa,
      spanLoRaw > 180 ? 60 : spanLoRaw * Math.cos(THREE.MathUtils.degToRad(cLa)),
    );
    const half = THREE.MathUtils.degToRad(span) * 0.75;
    const dist = 1 + Math.min(Math.max(half / Math.tan(THREE.MathUtils.degToRad(24)) + 0.02, 0.07), 1.8);
    this.orbit.targetPitch = THREE.MathUtils.degToRad(Math.min(Math.max(cLa, -85), 85));
    let ty = THREE.MathUtils.degToRad(cLo);
    ty += Math.round((this.orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
    this.orbit.targetYaw = ty;
    this.orbit.targetDist = dist;
    this.orbit.glide = 1.1;

    this.uniforms.uHasFocus.value = 1;
    this.chip.innerHTML = `${f.nameKo} (${f.nameEn}) · ${f.code3} <button class="chip-x" title="해제">✕</button>`;
    this.chip.classList.add('show');
    if (this.onChange) this.onChange(f);
  }

  selectOcean() {
    this.selected = { ocean: true, code3: 'OCEAN' };
    this.uniforms.uHasFocus.value = 2;
    this.chip.innerHTML = '해양 포커스 (DEMO) <button class="chip-x" title="해제">✕</button>';
    this.chip.classList.add('show');
    if (this.onChange) this.onChange(this.selected);
  }

  clear() {
    this.selected = null;
    this.uniforms.uHasFocus.value = 0;
    this.chip.classList.remove('show');
    if (this.onChange) this.onChange(null);
  }
}

// GeoJSON Polygon/MultiPolygon을 폴리곤 배열로 정규화 (일부 국가는 단일 Polygon)
function polysOf(f) {
  const c = f.geometry.coordinates;
  return f.geometry.type === 'Polygon' ? [c] : c;
}

// 구면 폴리곤 면적 근사 (km²): 등적 보정 슈레이스
function sphericalAreaKm2(multiPolygon) {
  const R = 6371;
  let total = 0;
  for (const poly of multiPolygon) {
    for (let r = 0; r < poly.length; r += 1) {
      const ring = poly[r];
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const l1 = (ring[j][0] * Math.PI) / 180;
        const l2 = (ring[i][0] * Math.PI) / 180;
        const p1 = (ring[j][1] * Math.PI) / 180;
        const p2 = (ring[i][1] * Math.PI) / 180;
        a += (l2 - l1) * (Math.sin(p1) + Math.sin(p2));
      }
      const area = Math.abs((a * R * R) / 2);
      total += r === 0 ? area : -area; // 홀은 빼기
    }
  }
  return Math.max(total, 0);
}

// ---------------------------------------------------------------------------
// 씬 구성
// ---------------------------------------------------------------------------

function makeStars() {
  const count = 2200;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const u = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3 + 0] = r * Math.cos(t) * 60;
    pos[i * 3 + 1] = u * 60;
    pos[i * 3 + 2] = r * Math.sin(t) * 60;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9fb4c8, size: 0.9, sizeAttenuation: false,
    transparent: true, opacity: 0.65, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

async function main() {
  const loadFill = document.getElementById('load-fill');
  const loadMsg = document.getElementById('load-msg');
  const loadErr = document.getElementById('load-err');
  const loading = document.getElementById('loading');
  const hud = document.getElementById('hud');

  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030608);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.005, 200);
  const orbit = new OrbitCam(camera, canvas);
  scene.add(makeStars());

  // --- 텍스처 로딩 ---
  loadMsg.textContent = '지형 데이터 로딩 중…';
  let heightTex = null;
  let hasHeight = 0;
  let baseHeightCanvas = null;
  try {
    const { canvas: hCanvas, failed, total } = await loadTerrariumHeightCanvas((done, tot) => {
      loadFill.style.width = `${Math.round((done / tot) * 100)}%`;
      loadMsg.textContent = `지형 데이터 로딩 ${done}/${tot}`;
    });
    if (failed < total) {
      baseHeightCanvas = hCanvas;
      heightTex = new THREE.CanvasTexture(hCanvas);
      heightTex.flipY = false;
      heightTex.wrapS = THREE.RepeatWrapping;
      heightTex.wrapT = THREE.ClampToEdgeWrapping;
      heightTex.minFilter = THREE.LinearFilter;
      heightTex.magFilter = THREE.LinearFilter;
      heightTex.generateMipmaps = false;
      heightTex.colorSpace = THREE.NoColorSpace;
      hasHeight = 1;
      if (failed > 0) {
        loadErr.style.display = 'block';
        loadErr.textContent = `일부 지형 타일(${failed}/${total})을 받지 못해 해당 구역은 평지로 표시됩니다.`;
      }
    } else {
      throw new Error('all tiles failed');
    }
  } catch (err) {
    console.error('[earthus-three] terrain load failed:', err);
    loadErr.style.display = 'block';
    loadErr.textContent = '지형 데이터를 받지 못했습니다. 색상 텍스처만으로 표시합니다. (네트워크 확인 후 새로고침)';
  }

  let baseTex = null;
  let hasBase = 0;
  try {
    baseTex = await new THREE.TextureLoader().loadAsync(BASEMAP_URL);
    baseTex.colorSpace = THREE.SRGBColorSpace;
    baseTex.wrapS = THREE.RepeatWrapping;
    baseTex.minFilter = THREE.LinearFilter;
    baseTex.magFilter = THREE.LinearFilter;
    baseTex.generateMipmaps = false;
    hasBase = 1;
  } catch (err) {
    console.warn('[earthus-three] basemap load failed:', err);
  }

  // --- 지구 메시 ---
  const uniforms = {
    uHeightMap: { value: heightTex },
    uBaseMap: { value: baseTex },
    uExagger: { value: 50.0 },
    uShade: { value: 1.9 },
    uPhotoMix: { value: hasHeight ? 0.65 : 1.0 },
    uHasHeight: { value: hasHeight },
    uHasBase: { value: hasBase },
    uSunDir: { value: new THREE.Vector3(0, 0, 1) },
    uCamPos: { value: new THREE.Vector3() },
    uDetailMap: { value: null },
    uDetailImg: { value: null },
    uHasDetailImg: { value: 0 },
    uDetailRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uDetailEps: { value: 0.0016 },
    uHasDetail: { value: 0 },
    uCloudTex: { value: null },
    uCloudShadow: { value: 0 },
    uCloudLum: { value: 0 },
    uSnowTex: { value: null },
    uHasSnow: { value: 0 },
    uFocusMask: { value: null },
    uHasFocus: { value: 0 },
    uFocusRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFocusAccent: { value: new THREE.Color(0x7FB7F5).convertSRGBToLinear() },
  };
  const detail = hasHeight ? new DetailTerrain(uniforms, baseHeightCanvas) : null;

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 1024, 512),
    new THREE.ShaderMaterial({ uniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }),
  );
  scene.add(earth);

  const atmoUniforms = { uCamPos: { value: new THREE.Vector3() } };
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 128, 64),
    new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(atmo);

  const clouds = new CloudManager(scene, uniforms, document.getElementById('cloud-note'));
  const backToGlobe = (lat, lon) => {
    orbit.pitch = THREE.MathUtils.degToRad(Math.min(Math.max(lat, -85), 85));
    orbit.targetPitch = orbit.pitch;
    orbit.yaw = THREE.MathUtils.degToRad(lon);
    orbit.targetYaw = orbit.yaw;
    orbit.dist = 1 + 320 / 6371;
    orbit.targetDist = orbit.dist;
  };
  const map = new MapView(document.getElementById('mapview'), hud, backToGlobe);
  const local = new LocalTerrain(hud);
  local.onClose = backToGlobe;
  local.onOpenMap = (lat, lon) => { map.show(lat, lon, 12); };

  // --- UI 바인딩 ---
  const bind = (id, valId, fmt, apply) => {
    const el = document.getElementById(id);
    const val = document.getElementById(valId);
    const sync = () => {
      const v = parseFloat(el.value);
      val.textContent = fmt(v);
      apply(v);
    };
    el.addEventListener('input', sync);
    sync();
  };
  bind('c-exagger', 'v-exagger', (v) => `${v}×`, (v) => { uniforms.uExagger.value = v; });
  bind('c-shade', 'v-shade', (v) => v.toFixed(1), (v) => { uniforms.uShade.value = v; });
  bind('c-photo', 'v-photo', (v) => `${v}%`, (v) => { uniforms.uPhotoMix.value = v / 100; });
  if (!hasHeight) {
    // 지형 전체 실패 폴백: 슬라이더 초기 동기화가 0.65로 덮지 않게 100%로 맞춘다
    const photoEl = document.getElementById('c-photo');
    photoEl.value = 100;
    photoEl.dispatchEvent(new Event('input'));
  }

  let sunAz = 245;
  let sunEl = 64;
  bind('c-sunaz', 'v-sunaz', (v) => `${v}°`, (v) => { sunAz = v; });
  bind('c-sunel', 'v-sunel', (v) => `${v}°`, (v) => { sunEl = v; });
  document.getElementById('c-rotate').addEventListener('change', (e) => {
    orbit.autoRotate = e.target.checked;
  });

  // 국가 포커스: 클릭(드래그 아님)으로 선택, 재클릭/ESC/바다 클릭으로 해제
  const focus = new CountryFocus(uniforms, orbit, document.getElementById('focus-chip'));
  const rayc = new THREE.Raycaster();
  let downAt = null;

  // JS쪽 고도 샘플러: 클릭 픽킹의 지형 시차 보정용 (전역 z4 캔버스에서 직접 읽음)
  let heightCtx = null;
  const heightAtJs = (latDeg, lonDeg) => {
    if (!baseHeightCanvas) return 0;
    if (!heightCtx) heightCtx = baseHeightCanvas.getContext('2d', { willReadFrequently: true });
    const W = baseHeightCanvas.width;
    const u = (((lonDeg + 180) / 360) % 1 + 1) % 1;
    const latC = (Math.max(-85, Math.min(85, latDeg)) * Math.PI) / 180;
    const v = 0.5 - Math.log(Math.tan(Math.PI / 4 + latC / 2)) / (2 * Math.PI);
    const x = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
    const y = Math.min(W - 1, Math.max(0, Math.floor(v * W)));
    const d = heightCtx.getImageData(x, y, 1, 1).data;
    return d[0] * 256 + d[1] + d[2] / 256 - 32768;
  };
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    shell.closeFlyout(); // 지구를 만지면 레이어 메뉴는 닫힌다
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    const held = performance.now() - downAt.t;
    downAt = null;
    if (moved > 6 || held > 400) return;
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    rayc.setFromCamera(ndc, camera);
    const ro = rayc.ray.origin;
    const rd = rayc.ray.direction;
    const b = ro.dot(rd);
    const c = ro.lengthSq() - 1;
    const disc = b * b - c;
    if (disc < 0) { focus.clear(); return; }
    const p = ro.clone().addScaledVector(rd, -b - Math.sqrt(disc));
    let lat = THREE.MathUtils.radToDeg(Math.asin(Math.min(Math.max(p.y, -1), 1)));
    let lon = THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z));
    // 과장된 지형은 반경 1보다 위에 그려져 시차가 생긴다 → 그 지점 고도로
    // 팽창 반경을 잡아 두 번 재교차 (한국 폭 ~3°인데 시차가 1~3°라 필수)
    for (let it = 0; it < 2; it += 1) {
      const h = Math.max(heightAtJs(lat, lon), 0);
      const r1 = 1 + (h / EARTH_RADIUS_M) * uniforms.uExagger.value;
      const disc2 = b * b - (ro.lengthSq() - r1 * r1);
      if (disc2 <= 0) break;
      const p2 = ro.clone().addScaledVector(rd, -b - Math.sqrt(disc2));
      lat = THREE.MathUtils.radToDeg(Math.asin(Math.min(Math.max(p2.y / r1, -1), 1)));
      lon = THREE.MathUtils.radToDeg(Math.atan2(p2.x, p2.z));
    }
    const f = focus.pick(lat, lon);
    if (f) {
      focus.select(f);
    } else {
      // 바다 클릭: 국가 선택 중이면 해제만, 아니면 해상 실황 조회 (①)
      const hadSelection = !!focus.selected;
      focus.clear();
      if (!hadSelection) marineSelect(lat, lon);
    }
  });
  // ESC: 열린 것부터 차례로 닫기 (플라이아웃 → 포커스 → 인텔 패널)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (shell.isFlyoutOpen()) { shell.closeFlyout(); return; }
    if (focus.selected) { focus.clear(); return; }
    if (shell.isIntelOpen()) shell.closeIntel();
  });

  // ---------- 해양 실측 + 시뮬레이션 (인텔리전스 시뮬레이션) ----------
  const sim = new OceanSim();
  let seaPoint = null; // { lat, lon, loading|error|marine+wind, time }

  // 그 지점의 실제 태양 고도·방위 (시뮬레이션 하늘에 사용)
  const sunAtPoint = (latDeg, lonDeg) => {
    const s = subsolarPoint(new Date(Date.now() + timeOffsetMs));
    const p = THREE.MathUtils.degToRad(latDeg);
    const l = THREE.MathUtils.degToRad(lonDeg);
    const loc = new THREE.Vector3(Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l));
    const sv = new THREE.Vector3(
      Math.cos(s.latRad) * Math.sin(s.lonRad),
      Math.sin(s.latRad),
      Math.cos(s.latRad) * Math.cos(s.lonRad),
    );
    const elev = Math.asin(THREE.MathUtils.clamp(loc.dot(sv), -1, 1));
    const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), loc).normalize();
    const north = new THREE.Vector3().crossVectors(loc, east);
    const azDeg = THREE.MathUtils.radToDeg(Math.atan2(sv.dot(east), sv.dot(north)));
    return { elev, azDeg };
  };

  async function marineSelect(lat, lon) {
    seaPoint = { lat, lon, loading: true };
    shell.openIntel();
    shell.renderIntel();
    try {
      const [m, w] = await Promise.all([
        fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction`)
          .then((r) => { if (!r.ok) throw new Error(`marine ${r.status}`); return r.json(); }),
        fetch(`https://api.open-meteo.com/v1/gfs?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`)
          .then((r) => { if (!r.ok) throw new Error(`wind ${r.status}`); return r.json(); }),
      ]);
      if (!m.current || m.current.wave_height == null) {
        seaPoint = { lat, lon, error: '해양 데이터 없음 (연안 밖 지점을 클릭하세요)' };
      } else {
        seaPoint = { lat, lon, marine: m.current, wind: (w && w.current) || {}, time: m.current.time };
      }
    } catch (err) {
      seaPoint = { lat, lon, error: err.message };
    }
    shell.renderIntel();
  }

  const fmtPt = (lat, lon) => `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(1)}°`;

  const seaCardHtml = () => {
    if (!seaPoint) return '';
    if (seaPoint.loading) {
      return `<div class="card"><div class="card-h">해상 지점 ${fmtPt(seaPoint.lat, seaPoint.lon)}</div><div class="card-b">실측 해양 데이터 조회 중…</div></div>`;
    }
    if (seaPoint.error) {
      return `<div class="card"><div class="card-h">해상 지점 ${dataBadge('UNAVAILABLE')}</div><div class="card-b">${seaPoint.error}</div></div>`;
    }
    const m = seaPoint.marine;
    const w = seaPoint.wind;
    return `<div class="card"><div class="card-h">해상 실황 ${dataBadge('OBSERVED')}</div>
      <div class="card-b">
        <div class="stat"><span class="k">지점</span><span class="v">${fmtPt(seaPoint.lat, seaPoint.lon)}</span></div>
        <div class="stat"><span class="k">유의파고</span><span class="v">${m.wave_height} m</span></div>
        <div class="stat"><span class="k">너울</span><span class="v">${m.swell_wave_height != null ? `${m.swell_wave_height} m · ${m.swell_wave_period}s` : '—'}</span></div>
        <div class="stat"><span class="k">풍파</span><span class="v">${m.wind_wave_height != null ? `${m.wind_wave_height} m` : '—'}</span></div>
        <div class="stat"><span class="k">풍속</span><span class="v">${w.wind_speed_10m != null ? `${w.wind_speed_10m} m/s` : '—'}</span></div>
        출처 Open-Meteo Marine (GFS-Wave) · ${seaPoint.time || ''}
      </div>
      <div class="paycard" style="border-style:solid; cursor:default;">
        <button class="simgo" data-action="sim-now">이 바다 시뮬레이션 보기 →</button>
        <div class="paysub">관측 파라미터로 물리 재구성 — 실제 영상 아님 (OBSERVED-DRIVEN MODEL)</div>
      </div></div>`;
  };

  // 태풍 시나리오: 카테고리·눈거리 → 풍속·파고 매핑 (SSHS 근사)
  const TY_CAT = {
    1: { U: 36, Hs: 6 }, 2: { U: 45, Hs: 8 }, 3: { U: 53, Hs: 10.5 },
    4: { U: 62, Hs: 12.5 }, 5: { U: 72, Hs: 14.5 },
  };
  const scenarioParams = (cat, eyeKm, lat, lon) => {
    const base = TY_CAT[cat] || TY_CAT[3];
    let f;
    if (eyeKm < 15) f = 0.3; // 태풍의 눈: 상대적 고요
    else if (eyeKm <= 45) f = 1.0; // 눈벽: 최대 강도
    else f = Math.pow(45 / eyeKm, 0.55);
    const sun = sunAtPoint(lat, lon);
    return {
      Hs: base.Hs * f,
      swellH: base.Hs * f * 0.45,
      swellT: 12,
      swellDirDeg: 210,
      windWaveH: base.Hs * f * 0.55,
      windSpeed: base.U * f,
      windDirDeg: 230,
      sunElev: sun.elev,
      sunAz: sun.azDeg,
    };
  };

  const scenarioInfoHtml = (cat, eyeKm, lat, lon) => {
    const p = TY_CAT[cat];
    return `<div class="card-h">${dataBadge('SIMULATION_ONLY')} 태풍 시뮬레이션</div>
      <div class="card-b">
        <div class="stat"><span class="k">지점</span><span class="v">${fmtPt(lat, lon)}</span></div>
        <div class="stat"><span class="k">카테고리</span><span class="v">${cat} (최대풍속 ~${p.U} m/s)</span></div>
        <div class="stat"><span class="k">눈까지 거리</span><span class="v">${eyeKm} km</span></div>
        가정 기반 시나리오 — <b>공식 예보 아님</b>. 실제 태풍 정보는 기상청 발표를 따르세요.
      </div>`;
  };

  const simNowInfoHtml = () => {
    const m = seaPoint.marine;
    const w = seaPoint.wind;
    return `<div class="card-h"><span class="badge live">OBSERVED-DRIVEN</span><span class="badge model">MODEL</span></div>
      <div class="card-b">
        <div class="stat"><span class="k">지점</span><span class="v">${fmtPt(seaPoint.lat, seaPoint.lon)}</span></div>
        <div class="stat"><span class="k">유의파고</span><span class="v">${m.wave_height} m</span></div>
        <div class="stat"><span class="k">풍속</span><span class="v">${w.wind_speed_10m != null ? `${w.wind_speed_10m} m/s` : '—'}</span></div>
        출처 Open-Meteo Marine · ${seaPoint.time || ''}<br/>
        관측 파라미터 물리 재구성 — 실제 영상 아님
      </div>`;
  };

  // ---------- 화면 문법 셸 통합 (§19.12): 레일 + EARTH INTELLIGENCE + 타임 스트립 ----------
  let timeOffsetMs = 0;
  let focusStatsRows = '';
  let lastSunState = null;
  let lockedNote = null;
  let labelCandidates = null;
  const statRow = (k, v, na) => `<div class="stat"><span class="k">${k}</span><span class="v${na ? ' na' : ''}">${v}</span></div>`;

  const feed = new IntelFeed(scene, dataBadge);
  feed.load().then(() => shell.renderIntel()).catch((e) => console.warn('[earthus-feed]', e));

  const cloudBadgeFor = (mode) => {
    if (mode === 'static') return dataBadge('STALE', '고정 스냅샷');
    if (mode === 'obs') return dataBadge('OBSERVED', '실황');
    if (mode === 'gk2a') return dataBadge('OBSERVED', 'GK2A');
    if (mode === 'gfs') return dataBadge('MODEL_SIGNAL');
    return dataBadge('UNAVAILABLE');
  };

  const getNowHtml = () => {
    let html = '';
    if (lockedNote) {
      html += `<div class="card"><div class="card-h">${lockedNote.title} ${dataBadge(lockedNote.badge || 'LOCKED')}</div><div class="card-b">${lockedNote.body}</div></div>`;
    }
    html += seaCardHtml();
    const s = lastSunState;
    const sunHtml = s
      ? `직하점 ${s.declDeg >= 0 ? 'N' : 'S'}${Math.abs(s.declDeg).toFixed(1)}° ${s.lonDeg >= 0 ? 'E' : 'W'}${Math.abs(s.lonDeg).toFixed(1)}° · 적위 ${s.declDeg >= 0 ? '+' : ''}${s.declDeg.toFixed(1)}°${timeOffsetMs !== 0 ? '<br/>타임 스크럽 적용 중 — 현재 시각 아님' : ''}`
      : '수동 조명 모드 (화면 기준)';
    html += buildNowCards({
      focusSel: focus.selected,
      focusStatsHtml: focusStatsRows,
      sunHtml,
      terrainHtml: `과장 ${uniforms.uExagger.value}× · 음영 ${uniforms.uShade.value.toFixed(1)}<br/>전역 z4 + 지역 z6~z8 스트리밍 (AWS Terrarium)`,
      cloudBadge: cloudBadgeFor(clouds.mode),
      cloudHtml: document.getElementById('cloud-note').textContent,
    });
    return html;
  };

  const shell = initShell({
    onScene: () => { lockedNote = null; },
    onLayerAction: (sid, layer) => {
      const key = `${sid}/${layer.id}`;
      const note = (title, body, badge) => {
        lockedNote = { title, body, badge };
        shell.showTab('now');
        shell.openIntel();
        shell.renderIntel();
      };
      if (layer.state === 'LOCKED') {
        note(layer.name, `출처 예정: ${layer.src}<br/>계획: ${layer.plan}<br/>연결 전에는 어떤 값도 생성하지 않습니다 (INSUFFICIENT_DATA ≠ 0).`);
        return;
      }
      const setCloud = (m) => {
        markCloudBtn(m);
        clouds.set(m).then((ok) => { if (!ok) markCloudBtn('off'); shell.renderIntel(); });
      };
      switch (key) {
        case 'land/terrain':
          note('실지형 3D', 'AWS Terrarium 실고도 — 전역 z4 + 지역 z6~z8 스트리밍. 항상 켜져 있는 기본 씬입니다.', 'LIVE');
          break;
        case 'land/satdetail':
          note('위성 표면', '고도 4,000km 아래로 줌인하면 실제 위성 이미지가 지형 위로 자동 표시됩니다. 250km 아래는 지역 3D.', 'LIVE');
          break;
        case 'land/snow':
          setSnow(!document.getElementById('c-snow').checked);
          break;
        case 'land/locate':
          if (!navigator.geolocation) { note('내 위치', '이 브라우저에서 위치를 사용할 수 없습니다.', 'UNAVAILABLE'); break; }
          navigator.geolocation.getCurrentPosition((p) => {
            let ty = THREE.MathUtils.degToRad(p.coords.longitude);
            ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
            orbit.targetYaw = ty;
            orbit.targetPitch = THREE.MathUtils.degToRad(p.coords.latitude);
            orbit.targetDist = 1.15;
            orbit.glide = 1.1;
          }, () => note('내 위치', '위치 권한이 거부되었습니다.', 'UNAVAILABLE'));
          break;
        case 'land/globe':
          focus.clear();
          orbit.targetDist = 3.0;
          orbit.glide = 1.1;
          break;
        case 'weather/cloud-obs': setCloud('obs'); break;
        case 'weather/cloud-gk2a': setCloud('gk2a'); break;
        case 'weather/cloud-gfs':
          setCloud('gfs');
          note('비·눈·태풍 5일 예보', '하단 타임라인 ▶ 를 누르면 5일치 이동을 재생합니다.<br/>비=파랑 · 눈=연보라 · 65초 뒤 동아시아 4° 상세가 합류합니다.', 'MODEL_SIGNAL');
          break;
        case 'ocean/marine':
          note('해상 실황 조회', '지구의 바다를 클릭하면 그 지점의 실측 파고·너울·풍속을 조회하고, 관측 기반 시뮬레이션으로 볼 수 있습니다.', 'OBSERVED');
          break;
        case 'ocean/oceanfocus':
          focus.clear();
          focus.selectOcean();
          shell.renderIntel();
          break;
        case 'ocean/typhoonsim':
          shell.showTab('scenario');
          shell.openIntel();
          break;
        case 'hazards/feed':
        case 'hazards/eq':
        case 'hazards/tc':
          feed.back();
          shell.showTab('feed');
          shell.openIntel();
          break;
        default:
          break;
      }
    },
    getNow: getNowHtml,
    getFeed: () => feed.html(),
    getScenario: () => {
      const hasSea = seaPoint && seaPoint.marine;
      const loc = hasSea ? seaPoint : { lat: 34.2, lon: 128.9 };
      return `<div class="card"><div class="card-h">태풍 시나리오 ${dataBadge('SIMULATION_ONLY')} <span class="badge demo">무료 프리뷰</span></div>
        <div class="card-b">가정한 태풍 조건으로 해상 상태를 물리 시뮬레이션합니다.<br/>
        지점: ${fmtPt(loc.lat, loc.lon)} ${hasSea ? '(선택한 해상)' : '(기본: 대한해협)'}<br/>
        시뮬레이션 안에서 카테고리·눈까지 거리를 실시간 조절할 수 있습니다.</div>
        <div class="paycard" style="border-style:solid;">
          <button class="simgo" data-action="sim-scenario" data-lat="${loc.lat}" data-lon="${loc.lon}">시나리오 시작 →</button>
          <div class="paysub">공식 예보 아님 · SIMULATION_ONLY · 정식 Scenario Lab은 INTELLIGENCE PRO (실제 태풍 트랙 연동 예정)</div>
        </div></div>`;
    },
    onAction: (action, ds) => {
      if (action === 'sim-now' && seaPoint && seaPoint.marine) {
        const m = seaPoint.marine;
        const w = seaPoint.wind;
        const sun = sunAtPoint(seaPoint.lat, seaPoint.lon);
        sim.open({
          Hs: m.wave_height != null ? m.wave_height : 1,
          swellH: m.swell_wave_height != null ? m.swell_wave_height : 0,
          swellT: m.swell_wave_period != null ? m.swell_wave_period : 8,
          swellDirDeg: m.swell_wave_direction != null ? m.swell_wave_direction : 0,
          windWaveH: m.wind_wave_height != null ? m.wind_wave_height : (m.wave_height || 1) * 0.6,
          windSpeed: w.wind_speed_10m != null ? w.wind_speed_10m : 5,
          windDirDeg: w.wind_direction_10m != null ? w.wind_direction_10m : 0,
          sunElev: sun.elev,
          sunAz: sun.azDeg,
        }, simNowInfoHtml(), '');
      } else if (action === 'sim-scenario') {
        launchScenario(parseFloat(ds.lat), parseFloat(ds.lon));
      } else if (action === 'feed-open') {
        feed.select(parseInt(ds.idx, 10), orbit); // view 전환은 동기, 트랙은 비동기
        shell.renderIntel();
      } else if (action === 'feed-back') {
        feed.back();
        shell.renderIntel();
      } else if (action === 'feed-retry') {
        feed.load().then(() => shell.renderIntel());
        shell.renderIntel();
      }
    },
    getFocusSel: () => focus.selected,
    labelData: () => labelCandidates,
    onTimeOffset: (ms) => {
      timeOffsetMs = ms;
      clouds.setForecastOffset(ms);
    },
  });

  const launchScenario = (lat, lon) => {
    let cat = 3;
    let eye = 35;
    const controls = `
      <label>카테고리 <input type="range" id="sc-cat" min="1" max="5" step="1" value="3" /><b id="sc-cat-v">3</b></label>
      <label>눈까지 거리 <input type="range" id="sc-eye" min="5" max="200" step="5" value="35" /><b id="sc-eye-v">35km</b></label>
      <span class="badge model">SCENARIO — 공식 예보 아님</span>`;
    sim.open(scenarioParams(cat, eye, lat, lon), scenarioInfoHtml(cat, eye, lat, lon), controls);
    const catEl = document.getElementById('sc-cat');
    const eyeEl = document.getElementById('sc-eye');
    const apply = () => {
      cat = parseInt(catEl.value, 10);
      eye = parseInt(eyeEl.value, 10);
      document.getElementById('sc-cat-v').textContent = cat;
      document.getElementById('sc-eye-v').textContent = `${eye}km`;
      sim.setParams(scenarioParams(cat, eye, lat, lon));
      sim.info.innerHTML = scenarioInfoHtml(cat, eye, lat, lon);
    };
    catEl.addEventListener('input', apply);
    eyeEl.addEventListener('input', apply);
  };

  // 라벨 후보: 국가별 최대 폴리곤의 bbox 중심 (해외영토·반자오선 왜곡 회피)
  const buildLabelCandidates = () => {
    if (labelCandidates || !focus.data) return;
    labelCandidates = focus.data.features.map((f) => {
      let best = null;
      let bestSize = -1;
      for (const poly of polysOf(f)) {
        let mnLo = 180; let mxLo = -180; let mnLa = 90; let mxLa = -90;
        for (const [lo, la] of poly[0]) {
          if (lo < mnLo) mnLo = lo;
          if (lo > mxLo) mxLo = lo;
          if (la < mnLa) mnLa = la;
          if (la > mxLa) mxLa = la;
        }
        const size = (mxLa - mnLa) * (mxLo - mnLo);
        if (size > bestSize) { bestSize = size; best = { mnLo, mxLo, mnLa, mxLa }; }
      }
      const cLa = (best.mnLa + best.mxLa) / 2;
      const cLo = (best.mnLo + best.mxLo) / 2;
      const latR = (cLa * Math.PI) / 180;
      const lonR = (cLo * Math.PI) / 180;
      return {
        nameKo: f.nameKo,
        code3: f.code3,
        rank: bestSize * Math.max(Math.cos(latR), 0.2),
        unit: new THREE.Vector3(
          Math.cos(latR) * Math.sin(lonR),
          Math.sin(latR),
          Math.cos(latR) * Math.cos(lonR),
        ),
      };
    });
  };

  focus.onChange = (f) => {
    if (!f || f.ocean) {
      focusStatsRows = '';
      if (f) shell.openIntel();
      shell.renderIntel();
      return;
    }
    let minLo = 180; let maxLo = -180; let minLa = 90; let maxLa = -90;
    for (const poly of polysOf(f)) {
      for (const [lo, la] of poly[0]) {
        if (lo < minLo) minLo = lo;
        if (lo > maxLo) maxLo = lo;
        if (la < minLa) minLa = la;
        if (la > maxLa) maxLa = la;
      }
    }
    const cLa = (minLa + maxLa) / 2;
    const cLo = (minLo + maxLo) / 2;
    let maxH = 0;
    for (let iy = 0; iy < 20; iy += 1) {
      for (let ix = 0; ix < 20; ix += 1) {
        const la = minLa + ((iy + 0.5) / 20) * (maxLa - minLa);
        const lo = minLo + ((ix + 0.5) / 20) * (maxLo - minLo);
        const h = heightAtJs(la, lo);
        if (h > maxH) maxH = h;
      }
    }
    const area = sphericalAreaKm2(polysOf(f));
    focusStatsRows =
      statRow('중심 좌표', `${cLa >= 0 ? 'N' : 'S'}${Math.abs(cLa).toFixed(1)}° ${cLo >= 0 ? 'E' : 'W'}${Math.abs(cLo).toFixed(1)}°`)
      + statRow('면적 (근사)', `${Math.round(area).toLocaleString()} km²`)
      + statRow('최고 고도 (근사)', `${Math.round(maxH).toLocaleString()} m`)
      + statRow('인구', 'UNAVAILABLE', true)
      + statRow('GDP', 'UNAVAILABLE', true)
      + statRow('실시간 데이터', 'UNAVAILABLE', true);
    shell.openIntel();
    shell.renderIntel();
  };

  // 국가 검색: 한글/영문 이름 부분 일치 → 선택 시 포커스 이동
  const searchInput = document.getElementById('c-search');
  const searchResults = document.getElementById('search-results');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = '';
    if (!q || !focus.data) return;
    const hits = focus.data.features
      .filter((f) => f.nameKo.includes(q) || f.nameEn.toLowerCase().includes(q))
      .slice(0, 6);
    for (const f of hits) {
      const d = document.createElement('div');
      d.className = 'search-hit';
      d.textContent = `${f.nameKo} · ${f.nameEn} (${f.code3})`;
      d.addEventListener('click', () => {
        focus.clear();
        focus.select(f);
        searchResults.innerHTML = '';
        searchInput.value = '';
      });
      searchResults.appendChild(d);
    }
  });

  // 눈·얼음 관측 레이어 (P1 계절 컨텍스트): GIBS MODIS NDSI — extent만, 적설 깊이 아님
  const snowNote = document.getElementById('snow-note');
  let snowLoaded = false;
  async function loadSnow() {
    const date = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const cols = 10;
    const rows = 5;
    const can = document.createElement('canvas');
    can.width = cols * 512;
    can.height = rows * 512;
    const ctx = can.getContext('2d');
    let ok = 0;
    const jobs = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        jobs.push(new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { ctx.drawImage(img, c * 512, r * 512); ok += 1; resolve(); };
          img.onerror = () => resolve();
          img.src = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_NDSI_Snow_Cover/default/${date}/500m/3/${r}/${c}.png`;
        }));
      }
    }
    await Promise.all(jobs);
    if (ok < 20) throw new Error(`NDSI 타일 ${ok}/50`);
    const tex = new THREE.CanvasTexture(can);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    uniforms.uSnowTex.value = tex;
    snowLoaded = true;
    return date;
  }
  async function setSnow(on) {
    const box = document.getElementById('c-snow');
    box.checked = on;
    if (!on) {
      uniforms.uHasSnow.value = 0;
      snowNote.textContent = '';
      return;
    }
    if (snowLoaded) {
      uniforms.uHasSnow.value = 1;
      return;
    }
    snowNote.textContent = '눈덮임 관측 로딩 중…';
    try {
      const date = await loadSnow();
      uniforms.uHasSnow.value = 1;
      snowNote.innerHTML = `${dataBadge('OBSERVED', date)} MODIS NDSI 눈덮임 (NASA GIBS) — 범위만, 적설 깊이 아님`;
    } catch (err) {
      console.warn('[earthus-snow]', err);
      snowNote.innerHTML = `${dataBadge('INSUFFICIENT_DATA')} 눈덮임 데이터를 받지 못했습니다`;
      box.checked = false;
    }
  }
  document.getElementById('c-snow').addEventListener('change', (e) => setSnow(e.target.checked));

  const cloudSeg = document.getElementById('cloud-seg');
  const markCloudBtn = (mode) => {
    cloudSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.cloud === mode));
  };
  cloudSeg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      markCloudBtn(btn.dataset.cloud);
      clouds.set(btn.dataset.cloud).then((ok) => { if (!ok) markCloudBtn('off'); });
    });
  });

  // 시뮬레이션 패널 접기/펴기
  const simPanel = document.getElementById('sim');
  const simToggle = document.getElementById('sim-toggle');
  simToggle.addEventListener('click', () => {
    const open = simPanel.classList.toggle('open');
    simToggle.textContent = open ? '시뮬레이션 설정 닫기 ▴' : '시뮬레이션 설정 열기 ▾';
  });

  // 조명 모드: 기본은 실시간 태양, 수동(화면 기준)은 시뮬레이션 패널에서 켠다
  let manualLight = false;
  const azSlider = document.getElementById('c-sunaz');
  const elSlider = document.getElementById('c-sunel');
  document.getElementById('c-manual').addEventListener('change', (e) => {
    manualLight = e.target.checked;
    azSlider.disabled = !manualLight;
    elSlider.disabled = !manualLight;
  });

  const sunInfo = document.getElementById('sun-info');
  const fmtLat = (d) => `${d >= 0 ? 'N' : 'S'}${Math.abs(d).toFixed(1)}°`;
  const fmtLon = (d) => `${d >= 0 ? 'E' : 'W'}${Math.abs(d).toFixed(1)}°`;
  let lastInfoAt = 0;
  const updateSunInfo = (now, s) => {
    if (now - lastInfoAt < 1000) return;
    lastInfoAt = now;
    if (manualLight) {
      sunInfo.innerHTML = '조명: <b>수동 (화면 기준)</b>';
    } else {
      const t = new Date();
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      sunInfo.innerHTML =
        `조명: <b>실시간 태양</b> · ${hh}:${mm}<br/>` +
        `직하점 ${fmtLat(s.declDeg)} ${fmtLon(s.lonDeg)} (적위 ${s.declDeg >= 0 ? '+' : ''}${s.declDeg.toFixed(1)}°)`;
    }
  };

  // 시작 카메라: 태양 직하점(지금 낮인 곳) 상공에서 시작
  {
    const s = subsolarPoint(new Date());
    orbit.yaw = s.lonRad;
    orbit.targetYaw = s.lonRad;
    const p = THREE.MathUtils.clamp(s.latRad, -1.0, 1.0);
    orbit.pitch = p;
    orbit.targetPitch = p;
  }

  // --- 루프 ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camOut = new THREE.Vector3();
  const sun = new THREE.Vector3();

  // 개발 콘솔용 핸들 (예: __earthus.goTo(28, 87, 1.35) → 히말라야)
  window.__earthus = {
    orbit,
    uniforms,
    detail,
    map,
    clouds,
    focus,
    goTo(latDeg, lonDeg, dist) {
      orbit.targetPitch = THREE.MathUtils.degToRad(latDeg);
      orbit.targetYaw = THREE.MathUtils.degToRad(lonDeg);
      if (dist) orbit.targetDist = dist;
    },
  };

  let last = performance.now();
  const tickBody = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (map.active) {
      return; // 지도 모드: 3D 렌더 정지 (지도가 자체적으로 DOM 렌더)
    }
    if (sim.active || local.active) {
      return; // 시뮬레이션/지역 3D 모드: 자체 루프가 렌더
    }
    orbit.update(dt);

    let sunState = null;
    if (manualLight) {
      // 수동: 방위각은 화면 위쪽 기준 시계방향, 고도각은 화면 밖(카메라 쪽)으로
      const az = THREE.MathUtils.degToRad(sunAz);
      const el = THREE.MathUtils.degToRad(sunEl);
      camera.matrixWorld.extractBasis(camRight, camUp, camOut);
      camOut.copy(camera.position).normalize();
      sun.set(0, 0, 0)
        .addScaledVector(camRight, Math.sin(az) * Math.cos(el))
        .addScaledVector(camUp, Math.cos(az) * Math.cos(el))
        .addScaledVector(camOut, Math.sin(el))
        .normalize();
    } else {
      // 실시간: 태양 직하점 방향 (월드 고정 → 낮/밤 경계가 실제와 일치)
      // 타임 스트립 스크럽 시 offset 적용 — 태양 위치는 진짜 재계산(LIVE)
      sunState = subsolarPoint(new Date(Date.now() + timeOffsetMs));
      const cl = Math.cos(sunState.latRad);
      sun.set(
        cl * Math.sin(sunState.lonRad),
        Math.sin(sunState.latRad),
        cl * Math.cos(sunState.lonRad),
      );
    }
    lastSunState = sunState;
    uniforms.uSunDir.value.copy(sun);
    updateSunInfo(now, sunState);
    uniforms.uCamPos.value.copy(camera.position);
    atmoUniforms.uCamPos.value.copy(camera.position);

    const altKm = Math.max(orbit.dist - 1, 0) * 6371;

    // 국가 내부 줌 → 지역 3D(위성+실지형)로 전환. 2D 지도는 그 안의 버튼으로.
    if (altKm < 250) {
      const latDeg = THREE.MathUtils.radToDeg(orbit.pitch);
      const lonDeg = ((THREE.MathUtils.radToDeg(orbit.yaw) + 540) % 360) - 180;
      orbit.dist = 1 + 320 / 6371; // 복귀 지점: 국가 뷰 높이
      orbit.targetDist = orbit.dist;
      const sp = sunAtPoint(latDeg, lonDeg);
      local.open(latDeg, lonDeg, sp.elev);
      return;
    }

    if (detail) detail.update(orbit.pitch, orbit.yaw, altKm);
    buildLabelCandidates();
    shell.updateLabels(camera, altKm);
    feed.updateMarkers(camera, altKm, (i) => {
      feed.select(i, orbit);
      shell.openIntel();
      shell.renderIntel();
    });
    clouds.uniforms.uSunDir.value.copy(sun);
    if (clouds.mesh.visible) {
      // 구름 셸은 과장된 최고봉 위에 떠 있어야 지형을 뚫지 않는다
      clouds.mesh.scale.setScalar(1.004 + (uniforms.uExagger.value * 9000) / 6371000);
    }
    hud.textContent = `고도 ${altKm >= 1000 ? `${(altKm / 1000).toFixed(1)}천` : Math.round(altKm)} km · 과장 ${uniforms.uExagger.value}×`;

    renderer.render(scene, camera);
  };

  // 한 프레임의 예외가 루프를 죽이지 않게 — 에러는 로그로 남기고 다음 프레임 계속
  const tick = (now) => {
    try {
      tickBody(now);
    } catch (err) {
      console.error('[earthus-three] tick error:', err);
    }
    requestAnimationFrame(tick);
  };

  loading.classList.add('done');
  requestAnimationFrame(tick);
}

main().catch((err) => {
  console.error('[earthus-three] fatal:', err);
  const loadErr = document.getElementById('load-err');
  loadErr.style.display = 'block';
  loadErr.textContent = `초기화 실패: ${err.message}`;
});
