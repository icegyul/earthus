// EARTHUS v2 — Three.js 지형 지구
// Cesium 프로토타입(prototype/v2)과 별개의 실험 렌더러.
// 실제 고도 데이터(AWS Terrarium 타일)를 정점 변위 + 픽셀 단위 법선 음영으로 직접 렌더링한다.
// 위성/기본색 텍스처는 보조 색상일 뿐이며, 입체감은 전부 고도 데이터에서 나온다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { initShell, buildNowCards, dataBadge, OPEN_COUNTRIES, SCENES } from './ui-shell.js?v=46';
import { OceanSim } from './sim-ocean.js?v=6';
import { LocalTerrain } from './local-terrain.js?v=1';
import { IntelFeed } from './intel-feed.js?v=5';
import { LiveLayers } from './live-layers.js?v=22';
import { SatLayer } from './sat-layer.js?v=1';
import { CloudVolume } from './cloud-volume.js?v=4';
import { PopSculpture } from './pop-sculpture.js?v=13';
import { QuakeHistory } from './quake-history.js?v=3';
import { initOnboard } from './onboard.js?v=1';
import { SolarView } from './solar-view.js?v=2';
import { GalaxyView } from './galaxy-view.js?v=1';
import { SkyView } from './sky-view.js?v=1';
import { AetherusLink } from './aetherus-link.js?v=2';
import { SeaFloor } from './seafloor.js?v=2';
import { TravelScene } from './travel.js?v=2';
// 익명 이용 집계 — 개인 식별자를 보내지 않는다 (날짜·이벤트명·횟수만). usage.js 주석 참조.
import { usage } from './usage.js?v=1';
import { FlightRoute, routeCardHtml } from './route.js?v=4';
import { PrecipField } from './precip-field.js?v=3';
import { LightningMarks } from './lightning-marks.js?v=2';
// 정본 엔진(prototype/js/earthus2/v02)으로 가는 유일한 이음매 — 어휘·신선도·품질 예산의 출처
import {
  installFetchObserver, ThermalGovernor, scenePlan, layerDataState, layerTruthLine,
  refreshProviderHealth, providerCardHtml, providerSnapshot, THERMAL_STATE,
  getRuntime, registerAndMount, broadcastThermal, engineCardHtml, ENGINE_CLASS,
} from './engine-bridge.js?v=12';
import { globeAdapter, overlayAdapter, takeoverAdapter } from './engine-adapters.js?v=1';

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
// 베이스맵은 기기가 감당하는 크기로 고른다.
// MAX_TEXTURE_SIZE가 4096인 기기에 8192를 올리면 조용히 실패해 지구가 색을 잃는다.
const BASEMAP_FOR = (maxTex, mobile) => {
  const px = (!maxTex || maxTex >= 8192) && !mobile ? 8192 : (maxTex >= 4096 ? 4096 : 2048);
  return { url: `../v2/assets/physical-earth/ne2-base-${px}.jpg`, px };
};

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

  // 타임아웃이 필요한 이유: 느린 모바일 회선에서 요청이 '끊기지 않고 멈추면'
  // onload도 onerror도 오지 않아 로딩 화면이 영원히 N/256에 머문다.
  const TILE_TIMEOUT = 15000;
  const loadTile = (x, y, retry) => new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (!ok) failed += 1;
      done += 1;
      onProgress(done, total);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      img.src = '';                                   // 멈춘 요청을 끊는다
      if (retry > 0) { settled = true; clearTimeout(timer); loadTile(x, y, retry - 1).then(resolve); }
      else finish(false);
    }, TILE_TIMEOUT);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (settled) return;
      ctx.drawImage(img, x * 256, y * 256);
      finish(true);
    };
    img.onerror = () => {
      if (settled) return;
      if (retry > 0) { settled = true; clearTimeout(timer); loadTile(x, y, retry - 1).then(resolve); }
      else finish(false);
    };
    img.src = TILE_URL(TERRARIUM_ZOOM, x, y);
  });

  // 256장을 한꺼번에 던지면 모바일에서 연결이 밀려 전부 느려진다 — 동시 12장으로 흘린다
  const coords = [];
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) coords.push([x, y]);
  let next = 0;
  const worker = async () => {
    while (next < coords.length) {
      const [x, y] = coords[next];
      next += 1;
      await loadTile(x, y, 1);
    }
  };
  await Promise.all(Array.from({ length: Math.min(12, coords.length) }, worker));
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
uniform float uDetailAmt;   // 창이 화면을 덮는 여유분 (경계에서 0으로 넘긴다)
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
  return smoothstep(0.0, 0.08, min(m.x, m.y)) * uDetailAmt;
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
  // 바다는 해수면에 고정하고 육지만 밀어올린다 (수심은 색과 등심선으로 표현).
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
uniform float uIsobath;      // 해저 등심선 세기 (0 = 끔)
uniform float uIsobathStep;  // 등심 간격 (m)
uniform float uHasBase;
uniform float uDetailEps;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform sampler2D uCloudTex;
uniform float uCloudShadow;
uniform float uCloudLum;
uniform float uCloudGfs;   // 1이면 구름 텍스처 A 가 선형 구름량(GFS 프레임)
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
  // 바다는 예외로 둔다 — 측심(Terrarium 해저)은 육상 DEM보다 원본이 훨씬 성겨서
  // z6~z8 타일은 그걸 확대한 것에 가깝다. 디테일 간격(≈1 km)으로 미분하면 실제 지형이
  // 아니라 원본의 계단이 음영으로 드러난다(줌인 시 회로기판 무늬). 그래서 수심 400 m
  // 아래부터는 전역 간격(≈10 km)을 유지해 측심 해상도 밖의 형상을 만들지 않는다.
  float sea = 1.0 - smoothstep(-400.0, 0.0, h);
  float eps = mix(0.0016, uDetailEps, df * (1.0 - sea));
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
      if (uCloudGfs > 0.5) ca = smoothstep(0.28, 0.80, ct.a) * 0.92;
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

  // ---- 해저 등심선 (isobath) ----------------------------------------------
  // 수심을 uIsobathStep 간격으로 끊어 선으로 그린다. 지형을 변형하지 않고
  // 같은 고도맵을 읽어 등고선만 얹는 것이라 값은 그대로다.
  // 선 두께는 fwidth(화면상 기울기)로 잡아 어느 줌에서도 1px 근처를 유지하고,
  // 등심선이 픽셀보다 촘촘해지는 완경사 구간은 스스로 사라진다 (모아레 방지).
  if (uIsobath > 0.001 && h < 0.0) {
    // 등심선은 스무딩한 고도로 그린다 — z4 원본의 계단 잡음이 선으로 드러나지 않게.
    float hc = displacementHeight(lon, lat);
    float f0 = -hc / uIsobathStep;
    // 줌에 맞춰 간격을 2배씩 키운다 — 화면에서 선 간격이 최소 ~26px 되도록.
    // 해도처럼 멀리서는 성기게, 가까이서는 촘촘하게 (슬라이더 값 = 가장 촘촘할 때의 간격).
    float mult = exp2(max(0.0, ceil(log2(max(fwidth(f0) * 26.0, 1e-6)))));
    float f = f0 / mult;
    float w = fwidth(f);
    float minor = 1.0 - smoothstep(0.0, w * 1.4, min(fract(f), 1.0 - fract(f)));
    float f5 = f * 0.2;                     // 5배 간격 = 주곡선
    float w5 = fwidth(f5);
    float major = 1.0 - smoothstep(0.0, w5 * 1.4, min(fract(f5), 1.0 - fract(f5)));
    float lineA = max(minor * 0.22, major * 0.50) * uIsobath * (0.45 + 0.55 * dayMask);
    color = mix(color, vec3(0.66, 0.86, 0.98), clamp(lineA, 0.0, 1.0));
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
uniform vec3 uSunDir;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 v = normalize(uCamPos - vPosW);
  vec3 n = normalize(vNormalW);
  float rim = pow(clamp(1.0 + dot(n, v), 0.0, 1.0), 5.0);
  // 태양 연동 산란 근사: 낮면 = 레일리풍 하늘색, 터미네이터 = 낮은 태양의 노을 밴드
  float sunN = dot(n, uSunDir);
  float day = smoothstep(-0.22, 0.28, sunN);
  float twilight = exp(-pow(sunN * 3.4, 2.0)); // 명암 경계 주변 가우시안 밴드
  // 역광(태양이 지구 뒤)일 때 림이 후광처럼 더 밝아진다 (전방 산란)
  float forward = 0.72 + 0.55 * pow(clamp(dot(v, -uSunDir), 0.0, 1.0), 2.0);
  vec3 dayC = vec3(0.26, 0.52, 0.92);
  vec3 duskC = vec3(1.00, 0.52, 0.26);
  vec3 nightC = vec3(0.10, 0.16, 0.30);
  // 노을은 낮 림보다 얇은 링으로 (rim을 한 번 더 조임 — 실제 지구 사진의 얇은 주황 테)
  vec3 c = (dayC * day * 0.85 + duskC * twilight * 0.5 * pow(rim, 0.8) + nightC * 0.05) * rim * forward;
  gl_FragColor = vec4(c, 1.0); // Additive: rgb만 더해진다
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
    // 시점 틸트 (0=수직 부감, 최대 ~78°): 데이터 기둥을 옆면에서 보기 위한 각.
    // 휠 클릭 드래그(데스크톱) 또는 두 손가락 세로 드래그(모바일)로 조절한다.
    this.tilt = 0;
    this.targetTilt = 0;
    // 1픽셀 끌면 손가락 아래 지점이 정확히 1픽셀 따라오는 회전량.
    // 옛 상수식(0.0035×거리)은 화면 크기·화각과 무관해서 어디서나 약 3배 빨랐고,
    // 도시까지 줌인하면(minDist 1.003) 하한 0.02에 걸려 20배로 폭주했다.
    this.dragSpeed = () => {
      const h = (this.dom && this.dom.clientHeight) || window.innerHeight || 800;
      const fov = (this.camera && this.camera.fov) || 50;
      const altR = Math.max(this.targetDist - 1.0, 0.0006); // 지표까지 남은 거리(지구반경 배수)
      return (2 * Math.tan((fov * Math.PI) / 360) * altR) / h;
    };
    this.maxTilt = 1.36;
    this.tiltDrag = false;
    this.touches = new Map();
    this.lastPinch = null;

    // 포인터 캡처는 항상 상태를 정한 '뒤에' 잡는다. 앞에서 잡으면 캡처가 실패하는 순간
    // (이미 놓인 포인터 등) 예외가 나면서 드래그 상태가 통째로 설정되지 않는다.
    const capture = (e) => { try { dom.setPointerCapture(e.pointerId); } catch (err) { /* 살아있는 포인터가 아니면 그냥 넘어간다 */ } };
    dom.addEventListener('pointerdown', (e) => {
      // 첫 화면에서만 저절로 돌고, 사용자가 지구를 만지는 순간 자동회전은 끝난다.
      // (드래그 중에만 멈췄다 놓으면 다시 도는 예전 동작은 조작을 방해했다)
      this.autoRotate = false;
      if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // 휠 클릭(가운데 버튼) = 시점 틸트
      if (e.button === 1) {
        this.tiltDrag = true;
        this.lastY = e.clientY;
        capture(e);
        e.preventDefault();
        return;
      }
      if (this.touches.size >= 2) { this.dragging = false; capture(e); return; }  // 두 손가락은 회전이 아니다
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      capture(e);
    });
    // 가운데 버튼 기본 동작(자동 스크롤) 차단
    dom.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    // 손가락을 떼는 처리 — 두 손가락 중 하나만 떼면 남은 손가락으로 회전을 이어받는다.
    // (이어받지 않으면 손가락이 화면에 남아 있는데도 지구가 굳어버린다)
    const lift = (e) => {
      if (e && e.pointerId != null) this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.lastPinch = null;
      this.tiltDrag = false;
      if (this.touches.size === 1) {
        const t = [...this.touches.values()][0];
        this.dragging = true;
        this.lastX = t.x;
        this.lastY = t.y;
      } else {
        this.dragging = false;
      }
    };
    dom.addEventListener('pointerup', lift);
    dom.addEventListener('pointercancel', lift);
    dom.addEventListener('pointermove', (e) => {
      // 모바일 두 손가락: 벌리면 줌, 함께 위아래로 밀면 시점 틸트.
      // 캔버스에 touch-action:none을 걸어 브라우저 핀치를 껐으므로 줌은 우리가 처리해야 한다.
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        const t = this.touches.get(e.pointerId);
        t.x = e.clientX;
        t.y = e.clientY;
        if (this.touches.size >= 2) {
          const [a, b] = [...this.touches.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const midY = (a.y + b.y) / 2;
          if (this.lastPinch) {
            if (dist > 8 && this.lastPinch.dist > 8) {
              this.targetDist *= this.lastPinch.dist / dist;
              this.targetDist = Math.max(this.minDist, Math.min(this.maxDist, this.targetDist));
            }
            // 대칭 핀치는 중점이 제자리라 틸트와 섞이지 않는다
            this.targetTilt = Math.max(0, Math.min(this.maxTilt,
              this.targetTilt + (midY - this.lastPinch.midY) * 0.006));
          }
          this.lastPinch = { dist, midY };
          this.dragging = false;
          return;
        }
      }
      if (this.tiltDrag) {
        const dyT = e.clientY - this.lastY;
        this.lastY = e.clientY;
        this.targetTilt = Math.max(0, Math.min(this.maxTilt, this.targetTilt + dyT * 0.005));
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      const speed = this.dragSpeed();
      this.targetYaw -= dx * speed;
      this.targetPitch += dy * speed;
      const lim = Math.PI / 2 - 0.05;
      this.targetPitch = Math.max(-lim, Math.min(lim, this.targetPitch));
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.autoRotate = false;   // 휠로 줌하는 것도 '만지기 시작'이다
      this.targetDist *= Math.exp(e.deltaY * 0.0011);
      this.targetDist = Math.max(this.minDist, Math.min(this.maxDist, this.targetDist));
    }, { passive: false });
    // iOS 사파리는 touch-action:none으로도 페이지 핀치 줌을 막지 못한다(의도적으로 무시한다).
    // 사파리 전용 gesture 이벤트를 막아야 지구 핀치가 페이지 확대와 싸우지 않는다.
    // 글·카드를 읽는 패널 위에서는 확대를 그대로 살려 둔다.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, (e) => {
        const t = e.target;
        const inPanel = t && t.closest
          && t.closest('#panel, #menu-panel, .drawer, #intel, #sk-card, #sv-bar, #lt-bar');
        if (!inPanel) e.preventDefault();
      }, { passive: false });
    }
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

    this.tilt += (this.targetTilt - this.tilt) * k;

    const cp = Math.cos(this.pitch);
    // 지표 조준점 (지구 중심이 아니라 이 점을 본다 — 틸트의 회전 중심)
    const tx = Math.sin(this.yaw) * cp;
    const ty = Math.sin(this.pitch);
    const tz = Math.cos(this.yaw) * cp;
    if (this.tilt < 0.001) {
      // 수직 부감 — 기존 동작 그대로 (지구 중심을 본다)
      this.camera.position.set(tx * this.dist, ty * this.dist, tz * this.dist);
      this.camera.lookAt(0, 0, 0);
    } else {
      // 틸트: 조준점의 지역 수직축을 동/서 접선축 기준으로 눕힌다.
      // 데이터 기둥(인구·파고 등)을 옆면에서 보기 위한 시점 — 지형은 그대로다.
      const up = new THREE.Vector3(tx, ty, tz);            // 지역 수직
      const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), up);
      if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
      east.normalize();
      const north = new THREE.Vector3().crossVectors(up, east).normalize();
      const h = Math.max(this.dist - 1, 0.01);              // 조준점 위 높이
      const st = Math.sin(this.tilt);
      const ct = Math.cos(this.tilt);
      // 남쪽으로 누우며 카메라가 지표에 가까워진다 (지평선이 보이는 시점)
      const off = up.clone().multiplyScalar(ct).addScaledVector(north, -st);
      const target = up.clone(); // 지표 위 조준점
      this.camera.position.copy(target).addScaledVector(off, h);
      this.camera.lookAt(target);
    }
    this.camera.updateMatrixWorld();
  }
}

// ---------------------------------------------------------------------------
// 디테일 지형 스트리밍: 카메라가 내려가면 보이는 지역의 z6~z8 타일(6×6)을 받아
// 전역 z4 고도맵 위에 덧씌운다. 실패 타일은 전역맵 업스케일로 자연스럽게 대체.
// ---------------------------------------------------------------------------

// 타일 하나가 이 시간 안에 안 오면 버린다. 매달린 연결이 상세 창을 볼모로 잡는 걸 막는다.
const TILE_TIMEOUT_MS = 8000;
// 창 중심이 이만큼 어긋나면 새 창을 받는다. 그 전까지는 옛 창을 쓰므로,
// 덮는지 따질 때 이만큼 밀린 최악의 상태를 기준으로 삼아야 한다.
const DETAIL_REFETCH_TILES = 1;

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

  // 카메라에서 반각 halfFov로 나간 광선이 지구에 닿는 지점까지의 '지구 중심각'(도).
  // 즉 지금 화면에 보이는 지구의 반폭이다. 지평선이 먼저 잘리면 그쪽을 쓴다.
  static arcHalfDeg(halfFovRad, altKm) {
    const R = EARTH_RADIUS_M / 1000;
    const d = R + Math.max(altKm, 0);
    const s = (d * Math.sin(halfFovRad)) / R;
    if (s >= 1) return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, R / d))); // 지평선 한계
    const far = Math.PI - Math.asin(s);   // 가까운 쪽 교점
    return THREE.MathUtils.radToDeg(Math.PI - halfFovRad - far);
  }

  // 지금 화면이 요구하는 지구 폭(도) — 세로는 fov, 가로는 화면비까지 본다.
  // 와이드 화면에서는 가로가 훨씬 넓게 요구된다(고도 2,900km에서 세로 25.9° · 가로 57.2°).
  static screenNeed(altKm, cam) {
    const vHalf = (((cam && cam.fov) || 50) * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * ((cam && cam.aspect) || 1));
    return {
      lat: DetailTerrain.arcHalfDeg(vHalf, altKm) * 2,
      lon: DetailTerrain.arcHalfDeg(hHalf, altKm) * 2,
    };
  }

  // 쓸 수 있는 폭 ÷ 화면 폭. 1이면 겨우 맞고, 클수록 여유가 있다.
  // '쓸 수 있는 폭'은 창 폭(6타일)이 아니라, 다시 받기 전까지 카메라가 밀릴 수 있는
  // 만큼을 양쪽에서 깎은 폭이다. 창 폭으로 재면 밀린 순간 가장자리에 띠가 남는다.
  // 메르카토르 타일은 위도가 높을수록 위도 방향으로 좁아진다(×cos위도) —
  // 같은 고도라도 시베리아에서 먼저 모자란다.
  static coverRatio(z, altKm, latRad, cam) {
    const need = DetailTerrain.screenNeed(altKm, cam);
    const usable = (6 - 2 * DETAIL_REFETCH_TILES) * (360 / (1 << z));
    const cosL = Math.max(0.15, Math.cos(latRad));
    return Math.min(usable / need.lon, (usable * cosL) / need.lat);
  }

  // 상세 창은 6×6 타일 고정이라 폭이 정해져 있다. 화면을 덮지 못하면 지구 위에
  // 사각형으로 드러나므로, 고도만 보지 말고 '덮는가'를 직접 따진다.
  static zoomFor(altKm, latRad, cam) {
    const zAlt = altKm > 1200 ? 6 : altKm > 400 ? 7 : 8;  // 고도별 상세도 상한
    for (let z = zAlt; z >= 6; z -= 1) {
      if (DetailTerrain.coverRatio(z, altKm, latRad, cam) >= 1) return z;
    }
    return 0;  // 가장 넓은 창으로도 못 덮는다 → 전역맵 한 장으로 간다
  }

  update(latRad, lonRad, altKm, cam) {
    const z = DetailTerrain.zoomFor(altKm, latRad, cam);
    // 겨우 덮는 구간에서 갑자기 꺼지면 지표 톤이 툭 튄다 → 여유분에 따라 서서히 넘긴다.
    // 높이도 같은 계수를 쓰므로(detailFade) 지형이 튀지도 않는다.
    this.uniforms.uDetailAmt.value = z === 0
      ? 0
      : THREE.MathUtils.smoothstep(DetailTerrain.coverRatio(z, altKm, latRad, cam), 1.0, 1.15);
    if (z === 0) {
      if (this.cur) {
        this.cur = null;
        this.uniforms.uHasDetail.value = 0;
        this.uniforms.uHasDetailImg.value = 0;
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
      const drift = Math.max(Math.min(dtx, n - dtx), Math.abs(ty0 - this.cur.ty0));
      if (drift < DETAIL_REFETCH_TILES) return;  // 아직 창 안이다
    }
    // 창을 벗어났다. 새 창이 올 때까지 낡은 창을 보여주면 화면에 경계선이 남는다.
    this.uniforms.uDetailAmt.value = 0;
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
    // 매달린 연결 하나가 창 전체를 붙잡지 못하게 타일마다 시한을 둔다.
    // (브라우저의 기본 연결 시한은 90초쯤이라 그동안 busy가 풀리지 않는다)
    const loadTile = (url, draw) => new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) { try { draw(img); } catch (e) { /* 그리기 실패는 그 타일만 버린다 */ } }
        resolve();
      };
      const timer = setTimeout(() => { img.src = ''; done(false); }, TILE_TIMEOUT_MS);
      img.crossOrigin = 'anonymous';
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = url;
    });
    const jobs = [];
    let imgOk = 0;
    for (let dy = 0; dy < 6; dy += 1) {
      for (let dx = 0; dx < 6; dx += 1) {
        const tx = (((tx0 + dx) % n) + n) % n;
        const ty = ty0 + dy;
        jobs.push(loadTile(TILE_URL(z, tx, ty), (img) => {
          this.ctx.drawImage(img, dx * 256, dy * 256);
        }));
        jobs.push(loadTile(
          `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`,
          (img) => { this.imgCtx.drawImage(img, dx * 256, dy * 256, 256, 256); imgOk += 1; },
        ));
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

    this.touches = new Map();
    this.lastPinchD = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#map-exit')) return;
      if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) { this.drag = null; return; }
      this.drag = { x: e.clientX, y: e.clientY };
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 살아있는 포인터가 아니면 넘어간다 */ }
    });
    el.addEventListener('pointermove', (e) => {
      // 두 손가락 벌리기 = 지도 확대. 브라우저 핀치를 껐으니 지도도 직접 처리해야 한다.
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        const t = this.touches.get(e.pointerId);
        t.x = e.clientX;
        t.y = e.clientY;
        if (this.touches.size >= 2) {
          const [a, b] = [...this.touches.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.lastPinchD && d > 8 && this.lastPinchD > 8) {
            this.zf = Math.min(this.zf + Math.log2(d / this.lastPinchD), 17.5);
            if (this.zf < 6.4) { this.lastPinchD = null; this.touches.clear(); this.exit(); return; }
            this.render();
          }
          this.lastPinchD = d;
          this.drag = null;
          return;
        }
      }
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
    const up = (e) => {
      if (e && e.pointerId != null) this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.lastPinchD = null;
      // 두 손가락 중 하나만 떼면 남은 손가락이 이동을 이어받는다
      if (this.touches.size === 1) {
        const t = [...this.touches.values()][0];
        this.drag = { x: t.x, y: t.y };
      } else {
        this.drag = null;
        el.classList.remove('dragging');
      }
    };
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

// 1° 격자를 10배 확대하면 이중선형 보간이 마름모꼴로 뭉갠다.
// Catmull-Rom 으로 이으면 같은 값에서 훨씬 곱게 나온다 — 없는 detail 을 만드는 게 아니라
// 있는 값 사이를 낫게 잇는 것이다. (셈은 늘지만 텍스처가 작아 부담이 적다)
const BICUBIC_GLSL = /* glsl */ `
vec4 cubicW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}
vec4 texBicubic(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 size = 1.0 / texel;
  vec2 c = uv * size - 0.5;
  vec2 f = fract(c);
  c = floor(c) + 0.5;
  vec4 wx = cubicW(f.x);
  vec4 wy = cubicW(f.y);
  vec4 sx = vec4(c.x - 1.0, c.x + 1.0, c.x + 1.0, c.x + 3.0);
  vec4 sy = vec4(c.y - 1.0, c.y + 1.0, c.y + 1.0, c.y + 3.0);
  vec4 offx = vec4(wx.y / (wx.x + wx.y), wx.w / (wx.z + wx.w), 0.0, 0.0);
  vec4 offy = vec4(wy.y / (wy.x + wy.y), wy.w / (wy.z + wy.w), 0.0, 0.0);
  vec2 p0 = vec2((c.x - 1.0 + offx.x) * texel.x, (c.y - 1.0 + offy.x) * texel.y);
  vec2 p1 = vec2((c.x + 1.0 + offx.y) * texel.x, (c.y - 1.0 + offy.x) * texel.y);
  vec2 p2 = vec2((c.x - 1.0 + offx.x) * texel.x, (c.y + 1.0 + offy.y) * texel.y);
  vec2 p3 = vec2((c.x + 1.0 + offx.y) * texel.x, (c.y + 1.0 + offy.y) * texel.y);
  float gx = wx.x + wx.y;
  float gy = wy.x + wy.y;
  return mix(mix(texture2D(tex, p3), texture2D(tex, p2), gx),
             mix(texture2D(tex, p1), texture2D(tex, p0), gx),
             gy);
}
`;

// 구름 릴리프 (v5.3 P5 CTH_3D_RELIEF 단계): IR 밝기(차가운 운정=밝음=높음)를
// 고도 근사로 정점 변위 — DERIVED 라벨 필수. 실제 CTH(Lambda) 연결 시 OBSERVED로 승격.
// 구름 높이 공통 GLSL: CTH 창(관측 운정고도, KMA L2) 안은 실측 미터,
// 밖은 IR 밝기→고도 근사(DERIVED). 반환 단위: m (0~16000).
const CLOUD_HEIGHT_GLSL = BICUBIC_GLSL + /* glsl */ `
uniform sampler2D uTex;
uniform sampler2D uCthTex;
uniform vec4 uCthRect; // xy=원점(equirect uv), zw=폭/높이. 0폭이면 비활성
uniform float uAlphaFromLum;

float cloudAmt(vec2 uv) {
  vec4 t = texture2D(uTex, uv);
  return mix(t.a, dot(t.rgb, vec3(0.3333)), uAlphaFromLum);
}

uniform float uGfsTop;   // 1이면 uTex 의 B 채널이 운정 높이(DERIVED, 0~16000m)
uniform vec2 uGfsTexel;  // 예보 프레임 1텍셀 크기 — Catmull-Rom 보간에 쓴다

float cloudHeightM(vec2 uv) {
  // 예보 프레임은 두께가 아니라 '운정 높이'를 따로 담고 있다.
  // 두께를 높이로 쓰면 두꺼운 저층운이 높은 산처럼 솟는다 — 그건 거짓이다.
  if (uGfsTop > 0.5) return texture2D(uTex, uv).b * 16000.0;
  if (uCthRect.z > 0.0) {
    vec2 cuv = (uv - uCthRect.xy) / uCthRect.zw;
    if (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) {
      vec4 c = texture2D(uCthTex, cuv);
      if (c.a > 0.35) return c.r * 16000.0; // 관측 운정고도
      return 0.0; // 관측상 구름 없음 (창 안에서는 관측이 우선)
    }
  }
  return cloudAmt(uv) * 11000.0; // IR 근사 (DERIVED)
}
`;

const CLOUD_VERT = CLOUD_HEIGHT_GLSL + /* glsl */ `
uniform float uReliefK; // exagger/지구반경 — 0이면 평면 셸
varying vec3 vUnit;
const float PI = 3.141592653589793;

void main() {
  vUnit = normalize(position);
  float lat = asin(clamp(vUnit.y, -1.0, 1.0));
  float lon = atan(vUnit.x, vUnit.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  // 변위는 5탭 평균 — 메시 셀(≈1°)보다 고주파인 운정고도를 그대로 찍으면
  // 근접 줌에서 삼각 결정처럼 각진다 (지형 displacementHeight와 같은 판단)
  float hM = 0.0;
  if (uReliefK > 0.0) {
    float e = 0.0026; // ≈ 메시 반 셀
    float hc = cloudHeightM(uv);
    float h4 = cloudHeightM(uv + vec2(e, 0.0)) + cloudHeightM(uv - vec2(e, 0.0))
             + cloudHeightM(uv + vec2(0.0, e)) + cloudHeightM(uv - vec2(0.0, e));
    hM = hc * 0.4 + h4 * 0.15;
  }
  vec3 p = position * (1.0 + hM * uReliefK);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;


const CLOUD_FRAG = CLOUD_HEIGHT_GLSL + /* glsl */ `
uniform sampler2D uTexB;
uniform float uBlend; // 예보 프레임 보간 (0=uTex, 1=uTexB)
uniform float uOpacity;
uniform float uReliefK;
uniform vec3 uSunDir;
uniform float uGfsFrames;   // 1이면 uTex/uTexB 가 GFS 구름 프레임(A=두께, B=운정)
uniform float uAdvectSec;   // 프레임 간격(초). 이류 거리 = 바람 × 시간
uniform sampler2D uWind;    // 바람은 별도 저해상도(4°) 텍스처 — 매끄러운 장이라 1°가 필요 없다
uniform sampler2D uWindB;
varying vec3 vUnit;
const float PI = 3.141592653589793;

// 프레임의 RG 채널 → m/s (Lambda 인코딩: (v+64)/128*255)
vec2 gfsWind(vec4 t) { return t.rg * 128.0 - 64.0; }
// m/s 바람이 dt 초 동안 옮기는 거리를 equirect uv 단위로
vec2 windToUv(vec2 w, float dt, float lat) {
  float cl = max(cos(lat), 0.15);
  return vec2((w.x * dt) / (6371000.0 * cl) / (2.0 * PI), (w.y * dt) / 6371000.0 / PI);
}

void main() {
  vec3 n = normalize(vUnit);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  vec4 t = texture2D(uTex, uv);
  float a;
  vec3 tint;
  if (uGfsFrames > 0.5) {
    // 반라그랑주 이류: 앞 프레임은 바람을 따라 f·dt 만큼 앞으로, 뒤 프레임은 (1-f)·dt 만큼 뒤로 끌어와 섞는다.
    // 그냥 섞으면 구름이 '이동'하지 않고 '녹았다 생긴다'. 사이 값은 보간이며 모델 출력이 아니다.
    float f = uBlend;
    vec2 dA = windToUv(gfsWind(texture2D(uWind, uv)), f * uAdvectSec, lat);
    vec4 ta = texBicubic(uTex, uv - dA, uGfsTexel);
    vec2 dB = windToUv(gfsWind(texture2D(uWindB, uv)), (1.0 - f) * uAdvectSec, lat);
    vec4 tb = texBicubic(uTexB, uv + dB, uGfsTexel);
    // A = 연직 구름수(CWAT)를 log 로 누른 두께. 0.005 kg/m² 이하 0, 2 kg/m² 이상 1.
    // 구름 '비율'로 그리면 지구 절반이 90% 라 베일이 된다(실측) — 두께가 위성과 같은 문법이다.
    // 인코딩 하한이 0.005 kg/m² 라 A 는 아주 얇은 구름부터 0 을 벗어난다.
    // 위성 눈으로 보이는 구름은 대략 0.03 부터 옅게, 0.5 쯤이면 불투명 — 그 구간으로 곡선을 잡는다.
    // (A 0.28 ≈ 0.03 kg/m², A 0.80 ≈ 0.53 kg/m²). 실측: 이 곡선에서 불투명 0.3 초과가 지구의 ~10%.
    float thick = smoothstep(0.28, 0.80, mix(ta.a, tb.a, f));
    // 고층 비율(B)은 권운 베일. 두꺼운 구름이 없는 곳에서만, 아주 옅게.
    float cirrus = mix(ta.b, tb.b, f);
    a = clamp(thick * 0.92 + cirrus * 0.06 * (1.0 - thick), 0.0, 1.0);
    // 불투명도가 포화된 넓은 구름대 안에서도 결이 보이게, 두께(연속값)로 밝기를 준다.
    // 두꺼운 핵은 희고 가장자리는 회색 — 위성 영상의 문법과 같다. 값을 바꾸는 게 아니라 밝기만.
    float core = mix(ta.a, tb.a, f);
    // 고층 구름(B)은 운정이 차가워 위성 IR 에서 가장 밝게 보인다 — 밝기에 같이 반영한다.
    float topBright = max(smoothstep(0.35, 1.0, core), cirrus * 0.9);
    tint = vec3(0.62 + 0.38 * topBright);
    // 예보 프레임은 두께가 포화된 구름대가 넓어 밤에 판처럼 보인다 → 밤에만 조금 더 눌러 결을 남긴다.
    float nightGfs = smoothstep(-0.08, 0.15, dot(n, uSunDir));
    a *= mix(0.72, 1.0, nightGfs);
  } else {
    if (uBlend > 0.001) {
      vec4 tb = texture2D(uTexB, uv);
      t = mix(t, tb, uBlend);
    }
    a = mix(t.a, dot(t.rgb, vec3(0.3333)), uAlphaFromLum);
    // 텍스처 색 = 의미 색 (흰색=구름, 파랑=비, 연보라=눈). 휘도 모드(IR)는 백색.
    tint = mix(t.rgb / max(max(t.r, max(t.g, t.b)), 0.2), vec3(1.0), uAlphaFromLum);
  }
  float day = smoothstep(-0.08, 0.15, dot(n, uSunDir));
  // 밤 바닥값. 예전엔 밝기 0.22 와 알파 0.2 가 곱해져 낮의 4% 로 떨어졌고,
  // 밤쪽 구름이 사실상 사라졌다 — 구름이 5일간 어디로 가는지 보는 제품에서
  // 지구 절반이 안 보이는 셈이었다. 자료는 그대로 두고 보이게만 올린다.
  // (밤 구름도 달빛·도시광에 실제로 보인다. 낮/밤 대비는 남긴다.)
  float lit = 0.36 + 0.72 * clamp(dot(n, uSunDir), 0.0, 1.0);
  // 릴리프 음영: 운정 고도장의 기울기로 뭉게 입체감 (지형 hillshade와 동일 기법)
  if (uReliefK > 0.001) {
    float eps = 0.0022;
    float hE = cloudHeightM(uv + vec2(eps, 0.0));
    float hW = cloudHeightM(uv - vec2(eps, 0.0));
    float hN = cloudHeightM(uv + vec2(0.0, eps));
    float hS = cloudHeightM(uv - vec2(0.0, eps));
    vec3 tE = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4));
    vec3 tN = cross(n, tE);
    vec3 cN = normalize(n - ((hE - hW) * tE + (hN - hS) * tN) * 0.0028);
    float shade = clamp(dot(cN, uSunDir), 0.0, 1.0);
    lit = 0.34 + 0.76 * mix(clamp(dot(n, uSunDir), 0.0, 1.0), shade, 0.75);
    // 관측 창 안에서 관측상 무운(높이 0)이면 IR 잔상 알파도 억제하지 않고 유지(면적은 IR이 정답일 수 있음)
  }
  gl_FragColor = vec4(tint * lit, a * uOpacity * (0.52 + 0.48 * day));
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
      uReliefK: { value: 0 },
      uCthTex: { value: null },
      uCthRect: { value: new THREE.Vector4(0, 0, 0, 0) },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      // GFS 프레임 모드: A=구름량(선형) · RG=700hPa 바람. 프레임 사이는 바람으로 이류한다.
      uGfsFrames: { value: 0 },
      uGfsTop: { value: 0 },
      uGfsTexel: { value: new THREE.Vector2(1 / 360, 1 / 181) },
      uAdvectSec: { value: 10800 },
      uWind: { value: null },
      uWindB: { value: null },
    };
    this.reliefOn = false;
    this.cthLoaded = false;
    // 강수는 연속 색면 (js/precip-field.js), 번개는 별도 표식 (js/lightning-marks.js) — 윈디 규칙.
    this.precip = new PrecipField(scene);
    this.bolts = new LightningMarks(scene);
    this.precipTex = null;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 384, 192),
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

  // 커버리지 경계를 부드럽게 — 관측 창 가장자리가 '벽'처럼 서지 않게 알파 페이드
  static featherEdges(ctx, x0, y0, w, h, fx, fy) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    let g;
    if (fx > 0) {
    // left
    g = ctx.createLinearGradient(x0, 0, x0 + fx, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, fx, h);
    // right
    g = ctx.createLinearGradient(x0 + w, 0, x0 + w - fx, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0 + w - fx, y0, fx, h);
    }
    if (fy <= 0) { ctx.restore(); return; }
    // top
    g = ctx.createLinearGradient(0, y0, 0, y0 + fy);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, fy);
    // bottom
    g = ctx.createLinearGradient(0, y0 + h, 0, y0 + h - fy);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0 + h - fy, w, fy);
    ctx.restore();
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
    CloudManager.featherEdges(ctx, 0, yTop, W, yH, 0, (3 / 180) * H); // 극 경계만 페이드
    const tex = CloudManager.texDefaults(new THREE.CanvasTexture(full));
    const t = (meta.time || '').replace('T', ' ').slice(0, 16);
    return { tex, lum: 0, relief: true, label: `관측 실황 · 다중위성 IR 합성 (NOAA GMGSI) · ${t}Z · 3D 릴리프(DERIVED: IR→고도 근사)` };
  }

  // 천리안은 채널이 7개인데 오랫동안 ir112 하나만 썼다.
  // 밤 안개(nightlow)·상층 수증기(wv063)·동아시아 2km(ir112ea)는 받아만 놓고 안 쓰고 있었다.
  async loadGk2a(chId = 'ir112') {
    const base = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds/gk2a';
    const meta = await fetch(`${base}/meta.json`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`meta ${r.status}`); return r.json(); });
    const chs = meta.channels || {};
    const ch = chs[chId] || chs.ir112 || chs.wv063;
    if (!ch || !ch.at) throw new Error(`GK2A ${chId} 채널 정보 없음`);
    if (ch.ok === false) throw new Error(`GK2A ${chId} 채널이 지금 준비되지 않았습니다`);
    const img = await CloudManager.loadImg(`${base}/${chs[chId] ? chId : 'ir112'}.png?t=${ch.at}`);
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
    const fpx = (3 / 360) * W; // 3° 경계 페이드 — 커버리지가 벽처럼 서지 않게
    CloudManager.featherEdges(ctx, x0, y0, spanX, spanY, fpx, fpx);
    if (x0 + spanX > W) CloudManager.featherEdges(ctx, x0 - W, y0, spanX, spanY, fpx, fpx);
    const tex = CloudManager.texDefaults(new THREE.CanvasTexture(can));
    const at = String(ch.at);
    const tf = `${at.slice(4, 6)}/${at.slice(6, 8)} ${at.slice(8, 10)}:${at.slice(10, 12)}Z`;
    const CH_KO = {
      ir112: ['IR 11.2µm', '밤에도 구름이 보입니다 (적외선)'],
      wv063: ['수증기 6.3µm', '구름이 아니라 <b>상층 수증기</b>입니다 — 제트기류와 기압골의 흐름이 보입니다'],
      nightlow: ['밤 낮은구름·안개 (BTD)', '밤에만 의미 있는 채널 — <b>낮은 구름과 안개</b>를 골라냅니다'],
      ir112ea: ['IR 11.2µm · 동아시아 2km', '한반도 주변을 더 촘촘하게 본 같은 적외선 채널'],
      vi006ea: ['가시광 0.6µm · 동아시아', '햇빛 반사라 <b>밤에는 비어 있습니다</b>'],
      vi006fd: ['가시광 0.6µm · 전지구', '햇빛 반사라 밤 쪽 절반은 비어 있습니다'],
    };
    const info = CH_KO[chId] || CH_KO.ir112;
    return {
      tex,
      lum: 1,
      relief: chId === 'ir112' || chId === 'ir112ea',
      label: `관측 · 천리안-2A(GK2A) ${info[0]} · ${tf} · 10분 주기 — ${info[1]}`,
    };
  }

  // 실측 운정고도(CTH, KMA GK2A L2 · 10분 주기) — 동아시아 창의 구름 높이를 관측값으로
  async loadCth() {
    const base = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds/gk2a/cth';
    const man = await fetch(`${base}/manifest.json`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`cth manifest ${r.status}`); return r.json(); });
    if (!man.ready || man.synthetic) throw new Error('CTH not ready');
    const grid = await fetch(`${base}/${man.gridUrl || 'grid.json'}`)
      .then((r) => { if (!r.ok) throw new Error(`cth grid ${r.status}`); return r.json(); });
    const LO = grid.longitude;
    const LA = grid.latitude;
    const HM = grid.heightM;
    const V = grid.valid;
    let minLo = 999; let maxLo = -999; let minLa = 999; let maxLa = -999;
    for (let i = 0; i < LO.length; i += 1) {
      if (LO[i] < minLo) minLo = LO[i];
      if (LO[i] > maxLo) maxLo = LO[i];
      if (LA[i] < minLa) minLa = LA[i];
      if (LA[i] > maxLa) maxLa = LA[i];
    }
    const W = 432;
    const Hc = Math.max(64, Math.round((W * (maxLa - minLa)) / (maxLo - minLo)));
    const acc = new Float32Array(W * Hc);
    const cnt = new Uint16Array(W * Hc);
    for (let i = 0; i < LO.length; i += 1) {
      if (!V[i]) continue; // 검증 실패/무운 미구분 셀은 IR 근사에 맡긴다 (보수적)
      const x = Math.round(((LO[i] - minLo) / (maxLo - minLo)) * (W - 1));
      const y = Math.round(((maxLa - LA[i]) / (maxLa - minLa)) * (Hc - 1));
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= W || yy < 0 || yy >= Hc) continue;
          acc[yy * W + xx] += HM[i];
          cnt[yy * W + xx] += 1;
        }
      }
    }
    const can = document.createElement('canvas');
    can.width = W;
    can.height = Hc;
    const ctx = can.getContext('2d');
    const im = ctx.createImageData(W, Hc);
    for (let p = 0; p < W * Hc; p += 1) {
      if (cnt[p] > 0) {
        const h = acc[p] / cnt[p];
        const r = Math.max(0, Math.min(255, Math.round((h / 16000) * 255)));
        im.data[p * 4] = r;
        im.data[p * 4 + 1] = r;
        im.data[p * 4 + 2] = r;
        im.data[p * 4 + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    // 저해상 그리드(≈28km)가 각진 결정처럼 보이지 않게 스무딩 (다운→업 블러)
    const half = document.createElement('canvas');
    half.width = Math.round(W / 3);
    half.height = Math.round(Hc / 3);
    half.getContext('2d').drawImage(can, 0, 0, half.width, half.height);
    ctx.clearRect(0, 0, W, Hc);
    ctx.drawImage(half, 0, 0, W, Hc);
    const tex = new THREE.CanvasTexture(can);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    this.uniforms.uCthTex.value = tex;
    this.uniforms.uCthRect.value.set(
      (minLo + 180) / 360,
      (minLa + 90) / 180,
      (maxLo - minLo) / 360,
      (maxLa - minLa) / 180,
    );
    this.cthLoaded = true;
    this.cthValidAt = man.validAt;
    return true;
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

  // GFS 1.0° 프레임 (Lambda gfs-cloud-forecast → S3 clouds/gfs-fc). 41장, 3시간 간격, 5일.
  // 예전 방식은 Open-Meteo 지점 450개(12°, 적도 1,300km)를 질의해 5일치를 통째로 받았다.
  // 그건 뭉개져 보였고 그건 표현이 아니라 자료의 성김이었다. 이제 원자료 격자를 그대로 쓴다.
  async loadGfs() {
    const S3B = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
    let mf = null;
    try {
      const r = await fetch(`${S3B}/clouds/gfs-fc/manifest.json`, { cache: 'no-cache' });
      if (r.ok) mf = await r.json();
    } catch (e) { mf = null; }
    if (!mf || !Array.isArray(mf.steps) || mf.steps.length < 2) {
      console.warn('[earthus-cloud] GFS 프레임 매니페스트 없음 → 지점 방식으로 물러남');
      return this.loadGfsPoints();
    }
    const frames = mf.steps.map((st) => ({
      h: st.h, t: Date.parse(st.valid), url: `${S3B}/clouds/gfs-fc/${st.file}`,
      wind: st.wind ? `${S3B}/clouds/gfs-fc/${st.wind}` : null,
      precip: st.precip ? `${S3B}/clouds/gfs-fc/${st.precip}` : null,
    })).filter((f) => Number.isFinite(f.t) && f.wind).sort((a, b) => a.t - b.t);
    if (!frames.length) return this.loadGfsPoints();
    const stepMs = (mf.stepHours || 3) * 3.6e6;
    this.gfs = {
      frames, stepMs, run: mf.run, texCache: new Map(), mode: 'frames',
      HOURS: frames.length, timeBase: frames[0].t,
    };
    this.uniforms.uAdvectSec.value = stepMs / 1000;
    this.lastOffsetMs = 0;
    // 현재 시각에 해당하는 프레임 둘을 먼저 받는다. 나머지는 스크럽할 때 받는다.
    // 지금 시각에 필요한 두 장만 받는다. 나머지는 사용자가 시간을 만질 때(prefetchFrames).
    const i0 = this.frameIndexAt(0).i0;
    const pairA = await this.frameTexAt(i0);
    this.frameTexAt(Math.min(i0 + 1, frames.length - 1));
    const texA = pairA && pairA.cloud;
    if (!texA) return this.loadGfsPoints();
    const runKo = mf.run ? mf.run.replace('T', ' ').slice(0, 16) + 'Z' : '';
    return {
      tex: texA, lum: 0, frames: true, relief: true,
      label: `GFS 1.0° 5일 예보 · 구름 두께(CWAT) · ▶ 재생 · 프레임 3시간 · 사이는 700hPa 바람으로 이류한 보간 (NOAA NOMADS · 런 ${runKo})`,
    };
  }

  // 프레임 인덱스: 지금+ms 가 몇 번째 프레임과 그 다음 사이 어디쯤인가
  frameIndexAt(ms) {
    const { frames, stepMs } = this.gfs;
    const hF = Math.max(0, Math.min(frames.length - 1.001, (Date.now() + ms - frames[0].t) / stepMs));
    const i0 = Math.floor(hF);
    return { i0, f: hF - i0, hF };
  }

  // 프레임 텍스처를 받는다(캐시). 아직 안 왔으면 Promise. 온 뒤에 현재 오프셋을 다시 적용한다.
  // 확대해서 쓰므로 밉맵은 업로드 비용만 낸다(메모리도 34%↑). 끄고 선형 확대만 쓴다.
  static frameTex(tex) {
    CloudManager.texDefaults(tex);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // 한 스텝 = 구름 PNG(1°) + 바람 PNG(4°). 둘 다 와야 그 시각을 그릴 수 있다.
  frameTexAt(i) {
    const g = this.gfs;
    const c = g.texCache.get(i);
    if (c && c.cloud) return Promise.resolve(c);
    if (c && c.then) return c;
    const one = (url) => new Promise((res) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, (tex) => res(CloudManager.frameTex(tex)), undefined, () => res(null));
    });
    const pr = Promise.all([
      one(g.frames[i].url), one(g.frames[i].wind), one(g.frames[i].precip),
    ]).then(([cloud, wind, precip]) => {
      if (!cloud || !wind) { g.texCache.delete(i); return null; }
      const pair = { cloud, wind, precip };
      g.texCache.set(i, pair);
      // 이 프레임을 기다리던 화면이 있으면 지금 반영한다
      if (this.mode === 'gfs' && this.gfs === g) this.setForecastOffset(this.lastOffsetMs || 0);
      return pair;
    });
    g.texCache.set(i, pr);
    return pr;
  }

  // 5일치를 배경에서 받아둔다. 실측: 장당 네트워크 대기가 스크럽 끊김의 유일한 원인이었다.
  // 다만 **시간을 실제로 만진 사람에게만** 한다 — 안 만지는 사람에게 5일치를 내려보내는 건
  // 그 사람에게도, 사용자 수에 비례하는 우리 CDN 요금에도 낭비다.
  prefetchFrames() {
    const g = this.gfs;
    if (!g || g.mode !== 'frames' || g.prefetching) return;
    g.prefetching = true;
    const frames = g.frames;
    const i0 = this.frameIndexAt(this.lastOffsetMs || 0).i0;
    const order = frames.map((_, i) => i).sort((a, b) => Math.abs(a - i0) - Math.abs(b - i0));
    let k = 0;
    const pump = () => {
      if (this.mode !== 'gfs' || !this.gfs || this.gfs.frames !== frames) return;
      let started = 0;
      while (k < order.length && started < 4) {          // 한 번에 4장씩
        const idx = order[k]; k += 1;
        if (!g.texCache.has(idx)) { this.frameTexAt(idx); started += 1; }
      }
      if (k < order.length) setTimeout(pump, 400);
      else console.info('[earthus-cloud] 예보 프레임 %d장 준비 완료', frames.length);
    };
    pump();
  }

  async loadGfsPoints() {
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
    return { tex, lum: 0, label: 'GFS 5일 예보 · 구름(흰색)·비(파랑)·눈(연보라) · ▶ 재생 (Open-Meteo)'
      + ' · 전지구 12° 격자(적도 약 1,300km) — 구름 <b>덩어리의 위치</b>이지 모양이 아닙니다' };
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
    if (this.gfs.mode === 'frames') {
      const g = this.gfs;
      const { i0, f, hF } = this.frameIndexAt(ms);
      const i1 = Math.min(i0 + 1, g.frames.length - 1);
      const a = g.texCache.get(i0);
      const b = g.texCache.get(i1);
      const okA = a && a.cloud;
      const okB = b && b.cloud;
      if (!okA) this.frameTexAt(i0);
      if (!okB) this.frameTexAt(i1);
      if (i1 + 1 < g.frames.length) this.frameTexAt(i1 + 1);   // 다음 것도 미리
      if (okA) {
        this.uniforms.uTex.value = a.cloud;
        this.uniforms.uWind.value = a.wind;
        this.earthUniforms.uCloudTex.value = a.cloud;
        this.uniforms.uTexB.value = okB ? b.cloud : a.cloud;
        this.uniforms.uWindB.value = okB ? b.wind : a.wind;
        this.uniforms.uBlend.value = okB ? f : 0;
        // 색면은 구름과 같은 방식으로 두 프레임을 섞는다 — 시간이 이어져 보여야 한다.
        this.precip.set(a.precip, (okB && b.precip) ? b.precip : null, f);
        // 번개 표식은 가까운 한 프레임으로 — 섞으면 표식이 두 번 찍힌다.
        this.precipTex = (okB && f > 0.5 && b.precip) ? b.precip : a.precip;
        this.bolts.setVisible(!!this.precipTex);
      }
      const valid = new Date(g.frames[0].t + hF * g.stepMs);
      const offH = Math.round((valid.getTime() - Date.now()) / 3.6e6);
      const pending = (okA && okB) ? '' : ' · <span style="opacity:.7">프레임 받는 중…</span>';
      this.noteEl.innerHTML = `<span class="badge model">MODEL</span> GFS 1.0° 예보 T${offH >= 0 ? '+' : ''}${offH}h · 유효 ${valid.getMonth() + 1}/${valid.getDate()} ${String(valid.getHours()).padStart(2, '0')}시`
        + `<br/><span style="opacity:.75">구름 <b>두께</b>(CWAT)로 그리고 <b>운정 높이</b>만큼 세움(DERIVED: 저·중·고층 비율에서 유도) · 프레임 3시간(NOAA GFS 1.0°, 적도 111km) · 사이는 700hPa 바람으로 이류한 <b>보간</b>이며 모델 출력이 아닙니다</span>${pending}`;
      return;
    }
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
    // 성긴 격자를 매끄럽게 그리면 위성사진처럼 보인다 — 그건 없는 상세를 있는 것처럼 만든다.
    // 해상도를 숫자로 밝혀, 이게 '모양'이 아니라 '덩어리의 위치'임을 알 수 있게 한다.
    const res = this.gfs.grids.length > 1 ? '전지구 12° + 동아시아 4°' : '전지구 12°';
    this.noteEl.innerHTML = `<span class="badge model">MODEL</span> GFS 예보 T${offH >= 0 ? '+' : ''}${offH}h · 유효 ${valid.getMonth() + 1}/${valid.getDate()} ${String(valid.getHours()).padStart(2, '0')}시 · 비=파랑 눈=연보라${ea}`
      + `<br/><span style="opacity:.75">격자 ${res} — 관측 구름보다 수백 배 성깁니다. 뭉개져 보이는 것은 표현이 아니라 자료의 성김입니다.</span>`;
  }

  async set(mode) {
    this.mode = mode;
    if (mode === 'off') {
      this.mesh.visible = false;
      this.precip.setVisible(false);
      this.bolts.setVisible(false);
      this.precipTex = null;
      this.earthUniforms.uCloudShadow.value = 0;
      this.noteEl.textContent = '구름 끔';
      return true;
    }
    if (!this.cache.has(mode)) {
      this.noteEl.textContent = '구름 데이터 로딩 중…';
      try {
        const entry = mode === 'static' ? await this.loadStatic()
          : mode === 'obs' ? await this.loadObserved()
            : mode.startsWith('gk2a') ? await this.loadGk2a(mode === 'gk2a' ? 'ir112' : mode.slice(5))
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
    this.reliefOn = !!entry.relief;
    if (this.reliefOn && !this.cthLoaded) {
      this.loadCth().then(() => {
        if (this.mode === mode) {
          const hm = (this.cthValidAt || '').slice(11, 16);
          this.noteEl.innerHTML += ` · 운정고도 <span class="badge live">OBSERVED</span> KMA L2 ${hm}Z`;
        }
      }).catch((e) => console.warn('[earthus-cth]', e.message || e));
    }
    this.earthUniforms.uCloudTex.value = entry.tex;
    this.earthUniforms.uCloudLum.value = entry.lum;
    this.earthUniforms.uCloudGfs.value = entry.frames ? 1 : 0;
    this.uniforms.uGfsFrames.value = entry.frames ? 1 : 0;
    this.uniforms.uGfsTop.value = entry.frames ? 1 : 0;
    // 관측 구름(GMGSI/천리안)에는 강수 종류 자료가 없다 — 없는 것을 그리지 않는다.
    if (!entry.frames) { this.precip.setVisible(false); this.bolts.setVisible(false); this.precipTex = null; }
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
    this.applyFocus([f], f);
  }

  // 권역 포커스 — 여러 나라를 한 마스크로 묶어 '이 권역 밖은 어둡게'를 만든다.
  // 예전엔 권역 칩이 카메라만 옮겨서 포커스했다는 느낌이 없었다.
  selectRegion(features, label, id) {
    if (!features.length) return;
    if (this.selected && this.selected.code3 === `RGN:${id}`) { this.clear(); return; }
    this.applyFocus(features, {
      code3: `RGN:${id}`, nameKo: label, nameEn: id, region: true, count: features.length,
    });
  }

  applyFocus(feats, sel) {
    this.selected = sel;
    const f = feats[0];

    // bbox 먼저: 마스크를 대상 영역에 지역화해 작은 나라도 경계가 선명하게
    let minLo = 180; let maxLo = -180; let minLa = 90; let maxLa = -90;
    for (const ft of feats) for (const poly of polysOf(ft)) {
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
      for (const ft of feats) for (const poly of polysOf(ft)) {
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
    this.chip.innerHTML = sel.region
      ? `${sel.nameKo} · ${sel.count}개국 <button class="chip-x" title="해제">✕</button>`
      : `${f.nameKo} (${f.nameEn}) · ${f.code3} <button class="chip-x" title="해제">✕</button>`;
    this.chip.classList.add('show');
    if (this.onChange) this.onChange(sel.region ? sel : f);
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

  // 모바일에서 앱을 전환했다 돌아오면 브라우저가 GL 컨텍스트를 회수해 화면이 검게 남는다.
  // 렌더 루프는 예외를 삼키므로 사용자는 죽은 줄도 모른다 — 상황을 화면에 알린다.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();               // 이걸 막아야 복구 이벤트가 온다
    const el = document.getElementById('load-err');
    if (el) {
      el.style.display = 'block';
      el.textContent = '그래픽 연결이 끊겼습니다 (다른 앱으로 전환·메모리 부족). 복구를 시도합니다…';
    }
    console.warn('[earthus-three] WebGL 컨텍스트 손실');
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    const el = document.getElementById('load-err');
    if (el) {
      el.style.display = 'block';
      el.textContent = '그래픽 연결이 복구되었습니다. 화면이 이상하면 새로고침해 주세요.';
      setTimeout(() => { el.style.display = 'none'; }, 6000);
    }
    console.info('[earthus-three] WebGL 컨텍스트 복구');
  }, false);

  // 나가는 요청을 한 곳에서 관찰 — 각 레이어의 신선도와 소스 건강 상태가 여기서 모인다.
  // (요청 자체는 그대로 통과. 렌더러보다 먼저 걸어야 초기 로딩도 잡힌다.)
  installFetchObserver();
  usage.init();
  window.__earthusUsage = usage;
  const basePixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(basePixelRatio);

  // 품질 스텝다운 (지시서 §20 · NEXT_STEPS에 "미구현"으로 남아 있던 것).
  // 실측 fps → 정본 THERMAL_STATE → thermalBudget()이 정한 예산을 렌더러에 적용한다.
  const thermal = new ThermalGovernor({
    onChange: (budget, state, fps) => {
      // 예산의 렌더 배율: NORMAL 1.0 / BALANCED 0.6 / ECO 0.3 / SAFE 정지
      const k = state === THERMAL_STATE.NORMAL ? 1
        : state === THERMAL_STATE.BALANCED ? 0.82
          : state === THERMAL_STATE.ECO ? 0.62 : 0.5;
      renderer.setPixelRatio(Math.max(0.5, basePixelRatio * k));
      // 정본 runtime.setThermalState() — 등록된 모든 엔진에 예산을 내려보낸다
      broadcastThermal(state, budget);
      console.info(`[earthus-thermal] ${state} · ${Math.round(fps)}fps · 입자 ${budget.particleScale}× · 볼륨 ${budget.volumeScale}×`);
    },
  });
  window.__earthusThermal = thermal;
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030608);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.005, 200);
  const orbit = new OrbitCam(camera, canvas);
  scene.add(makeStars());

  // --- 텍스처 로딩 ---
  // 베이스맵을 먼저 띄워 놓고 지형 타일을 받는다. 직렬로 기다리면 첫 화면이 그만큼 늦다.
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const maxTex = (renderer.capabilities && renderer.capabilities.maxTextureSize) || 0;
  const BASEMAP = BASEMAP_FOR(maxTex, isMobileUA);
  const basePromise = new THREE.TextureLoader().loadAsync(BASEMAP.url).catch((err) => {
    console.warn('[earthus-three] basemap load failed:', err);
    return null;
  });

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

  let hasBase = 0;
  const baseTex = await basePromise;
  if (baseTex) {
    baseTex.colorSpace = THREE.SRGBColorSpace;
    baseTex.wrapS = THREE.RepeatWrapping;
    baseTex.minFilter = THREE.LinearFilter;
    baseTex.magFilter = THREE.LinearFilter;
    baseTex.generateMipmaps = false;
    hasBase = 1;
  }

  // --- 지구 메시 ---
  const uniforms = {
    uHeightMap: { value: heightTex },
    uBaseMap: { value: baseTex },
    uExagger: { value: 50.0 },
    uIsobath: { value: 0.0 },      // 해저 등심선 세기 (0 = 끔)
    uIsobathStep: { value: 500.0 }, // 등심 간격 500 m · 주곡선 2,500 m
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
    uDetailAmt: { value: 1 },
    uCloudTex: { value: null },
    uCloudShadow: { value: 0 },
    uCloudLum: { value: 0 },
    uCloudGfs: { value: 0 },
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

  const atmoUniforms = {
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 0, 1) },
  };
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
  // AETHERUS 오늘의 태양계 (JPL 근사 궤도요소를 기기에서 계산)
  const solar = new SolarView(hud);
  const galaxy = new GalaxyView(document.getElementById('hud'));
  window.__earthusSolar = solar;
  // AETHERUS 우주 사진관 (천구 방향 배치)
  const sky = new SkyView(hud);
  window.__earthusSky = sky;

  const local = new LocalTerrain(hud);
  local.onClose = backToGlobe;
  local.onOpenMap = (lat, lon) => { map.show(lat, lon, 12); };
  // 위성지도 → 지역 3D 지형 (역방향 전환)
  document.getElementById('map-3d').addEventListener('click', () => {
    const lat = map.lat;
    const lon = map.lon;
    map.active = false;
    map.el.classList.remove('active');
    const sp = sunAtPoint(lat, lon);
    local.open(lat, lon, sp.elev);
  });

  // 해저 표현: 등심선(셰이더) + 해구 위치(SCUFN) — seafloor는 heightAtJs 선언 뒤에 생성
  let seafloor = null;
  let travel = null; // 여행 씬 (데이터랩 출품 모듈) — heightAtJs 뒤에 생성

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
  bind('c-exagger', 'v-exagger', (v) => `${v}×`, (v) => {
    uniforms.uExagger.value = v;
    if (window.__earthusLive) window.__earthusLive.onExaggerChanged();
  });
  // 해저 등심선 간격 — 500 m 간격, 5번째(2,500 m)마다 주곡선
  bind('c-isobath', 'v-isobath', (v) => `${v.toLocaleString('ko-KR')} m`, (v) => {
    uniforms.uIsobathStep.value = v;
  });
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
  const rotateEl = document.getElementById('c-rotate');
  rotateEl.addEventListener('change', (e) => {
    orbit.autoRotate = e.target.checked;   // 껐다가 다시 켜고 싶으면 여기서 켠다
  });

  // 국가 포커스: 클릭(드래그 아님)으로 선택, 재클릭/ESC/바다 클릭으로 해제
  const focus = new CountryFocus(uniforms, orbit, document.getElementById('focus-chip'));
  const rayc = new THREE.Raycaster();
  let downAt = null;

  // JS쪽 고도 샘플러: 클릭 픽킹의 지형 시차 보정용 (전역 z4 캔버스에서 직접 읽음)
  let heightPix = null;   // 캔버스 전체 픽셀을 한 번만 읽어 둔다
  let heightW = 0;
  let heightH = 0;
  const heightTexel = (x, y) => {
    const i = (y * heightW + x) * 4;
    return heightPix[i] * 256 + heightPix[i + 1] + heightPix[i + 2] / 256 - 32768;
  };
  const heightAtJs = (latDeg, lonDeg) => {
    if (!baseHeightCanvas) return 0;
    // 정점마다 getImageData(1,1)를 부르면 호출마다 GPU 동기화가 걸린다.
    // 침수면 35만 정점에서 5초가 여기서 나왔다 → 한 번에 통째로 읽어 캐시한다.
    // (baseHeightCanvas는 로딩 후 다시 그려지지 않는다. DetailTerrain은 자기 캔버스를 쓴다.)
    if (!heightPix) {
      heightW = baseHeightCanvas.width;
      heightH = baseHeightCanvas.height;
      const c = baseHeightCanvas.getContext('2d', { willReadFrequently: true });
      heightPix = c.getImageData(0, 0, heightW, heightH).data;
    }
    const u = (((lonDeg + 180) / 360) % 1 + 1) % 1;
    const latC = (Math.max(-85, Math.min(85, latDeg)) * Math.PI) / 180;
    const v = 0.5 - Math.log(Math.tan(Math.PI / 4 + latC / 2)) / (2 * Math.PI);
    // 최근접 이웃으로 뽑으면 텍셀 경계에서 고도가 계단처럼 튄다. 과장 50배가 곱해지면
    // 그 계단이 수 km 수직 벽이 되어 면 레이어를 찢는다(실측 최대 7km) → 겹선형으로 읽는다.
    const fx = u * heightW - 0.5;
    const fy = v * heightH - 0.5;
    const ix0 = Math.floor(fx);
    const iy0 = Math.floor(fy);
    const tx = fx - ix0;
    const ty = fy - iy0;
    const wrapX = (x) => ((x % heightW) + heightW) % heightW;          // 경도는 감긴다
    const clampY = (y) => Math.min(heightH - 1, Math.max(0, y));       // 위도는 끝에서 자른다
    const xa = wrapX(ix0);
    const xb = wrapX(ix0 + 1);
    const ya = clampY(iy0);
    const yb = clampY(iy0 + 1);
    const h00 = heightTexel(xa, ya);
    const h10 = heightTexel(xb, ya);
    const h01 = heightTexel(xa, yb);
    const h11 = heightTexel(xb, yb);
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  };
  // 제스처가 취소되면(앱 전환·OS 제스처) 탭 판정 기준점을 버린다.
  // 남겨 두면 다음 손가락이 옛 좌표·시각과 비교돼 엉뚱한 곳이 선택된다.
  canvas.addEventListener('pointercancel', () => { downAt = null; });
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    shell.closeFlyout(); // 지구를 만지면 메뉴·서랍은 닫힌다
    closeDrawers();
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
    // 해구 표시가 켜져 있으면 해구선 우선 — 바다 클릭이 해상 실황으로 새지 않게
    // 여행 씬이 켜져 있으면 시군구 비콘 우선 — 근거 5줄 카드
    const tv = travel && travel.pick(lat, lon);
    if (tv) {
      usage.track('travel.region_opened'); // 발견 → 상세 전환 (집계끼리 나눠 전환율을 구한다)
      focus.clear();
      lockedNote = { title: `${tv.nameKo} — 왜 지금`, badge: 'DERIVED', body: travel.regionCard(tv) };
      shell.showTab('now');
      shell.openIntel();
      shell.renderIntel();
      shell.refreshFlyout();
      return;
    }
    const tr = seafloor && seafloor.pick(lat, lon);
    if (tr) {
      focus.clear();
      lockedNote = { title: tr.ko, badge: 'OBSERVED', body: seafloor.trenchCard(tr) };
      shell.showTab('now');
      shell.openIntel();
      shell.renderIntel();
      shell.refreshFlyout();
      return;
    }
    const f = focus.pick(lat, lon);
    if (f) {
      focus.select(f);
      // 국가를 고르면 그 나라의 인구 격자가 국경 안쪽에서 솟아오른다 (R-03 문법)
      if (popSculpt.on) {
        popSculpt.show(f.code3, f.nameKo).then(() => { shell.renderIntel(); shell.refreshFlyout(); });
      }
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
  feed.onUpdate = () => shell.renderIntel(); // PAST 등 비동기 카드 갱신
  feed.load().then(() => shell.renderIntel()).catch((e) => console.warn('[earthus-feed]', e));

  // 소스 건강 상태: S3 캐시 객체에 HEAD를 쳐서 파이프라인 갱신 시각을 직접 확인한다.
  // (서드파티 직접 호출 소스는 fetch 관찰자가 호출 결과로 채운다)
  const pollProviders = () => refreshProviderHealth()
    .then(() => shell.renderIntel())
    .catch((e) => console.warn('[earthus-providers]', e));
  pollProviders();
  setInterval(pollProviders, 5 * 60 * 1000);

  // 1.0 S3 캐시 실데이터 레이어 (부이·낙뢰·산불위험·특보·쓰나미·서울인구·태풍공식)
  // 국가 데이터 조각 (R-03): 국경 안쪽 실제 인구 격자를 세운다
  const quakeHistory = new QuakeHistory(scene, () => uniforms.uExagger.value, () => baseHeightCanvas);
  window.__earthusQuakes = quakeHistory;
  const popSculpt = new PopSculpture(scene, heightAtJs, () => uniforms.uExagger.value);
  window.__earthusSculpt = popSculpt;

  const liveLayers = new LiveLayers(scene, heightAtJs, () => uniforms.uExagger.value, dataBadge);
  // 항로 — 항공편 추적이 아니라 '구간을 잇는 표현'이다 (js/route.js 머리말 참조)
  const flightRoute = new FlightRoute(scene, () => uniforms.uExagger.value);
  // 켜 둔 레이어를 원본 갱신 주기에 맞춰 실제로 다시 받는다 (배지만 갱신되던 문제)
  liveLayers.startAutoRefresh(() => { shell.refreshFlyout(); shell.renderIntel(); });
  window.__earthusLive = liveLayers;
  seafloor = new SeaFloor(scene, heightAtJs, dataBadge);
  travel = new TravelScene(scene, heightAtJs, () => uniforms.uExagger.value);
  window.__earthusTravel = travel;
  window.__earthusSeafloor = seafloor;
  const satLayer = new SatLayer(scene);
  window.__earthusSat = satLayer;
  // 구름 3D 볼륨 (P5 사다리 최상단 · 동아시아 GFS 복셀)
  const cloudVol = new CloudVolume(scene, () => uniforms.uExagger.value);
  window.__earthusVol = cloudVol;
  const aethLink = new AetherusLink(scene);
  window.__earthusAeth = aethLink;

  // ---- 정본 엔진 런타임 등록 (core/engine-runtime.js 계약) ----------------
  // 기존 모듈은 고치지 않고 어댑터로 감싼다. 런타임이 ResourceScope·품질 전파·측정을 맡는다.
  const runtime = getRuntime();
  window.__earthusRuntime = runtime;
  registerAndMount('globe', ENGINE_CLASS.STATIC_CONTEXT,
    globeAdapter({ renderer, basePixelRatio, uniforms }));
  // 지구 위 오버레이: mount까지만 (activate는 부르지 않는다 — 위 브리지 주석의 갈라짐 참고)
  registerAndMount('satellites', ENGINE_CLASS.DYNAMIC, overlayAdapter({
    group: () => satLayer.group || satLayer.scene,
    isOn: () => !!(satLayer.state('core').on || satLayer.state('starlink').on),
    disposeAll: () => satLayer.disposeSets && satLayer.disposeSets(),
    applyBudget: (b) => {
      // 입자 예산이 줄면 위성 점 크기를 줄이고, SAFE(0)에서는 숨긴다
      (satLayer.sets || []).forEach((s) => {
        if (!s.points) return;
        if (s.baseSize == null) s.baseSize = s.points.material.size;
        s.points.material.size = Math.max(1, s.baseSize * Math.max(b.particleScale, 0.2));
        s.points.visible = b.particleScale > 0;
      });
    },
  }));
  registerAndMount('cloud-volume', ENGINE_CLASS.DYNAMIC, overlayAdapter({
    group: () => cloudVol.group || cloudVol.mesh,
    isOn: () => !!cloudVol.state().on,
    applyBudget: (b) => {
      // 볼륨은 가장 무거운 엔진 — 예산이 0이면(ECO/SAFE) 렌더를 멈춘다
      const obj = cloudVol.mesh || cloudVol.group;
      if (obj && cloudVol.state().on) obj.visible = b.volumeScale > 0;
    },
  }));
  registerAndMount('live-layers', ENGINE_CLASS.DYNAMIC, overlayAdapter({
    group: () => liveLayers.group,
    isOn: () => Object.values(liveLayers.layers || {}).some((l) => l && l.on),
    applyBudget: (b) => {
      liveLayers.group.traverse((o) => {
        if (!o.isPoints || !o.material) return;
        if (o.userData.baseSize == null) o.userData.baseSize = o.material.size;
        o.material.size = Math.max(1, o.userData.baseSize * Math.max(b.particleScale, 0.25));
      });
    },
  }));
  registerAndMount('travel', ENGINE_CLASS.DYNAMIC, overlayAdapter({
    group: () => travel.group,
    isOn: () => !!travel.mode,
    disposeAll: () => travel.clear && travel.clear(),
  }));
  registerAndMount('seafloor', ENGINE_CLASS.DYNAMIC, overlayAdapter({
    group: () => seafloor.group,
    isOn: () => !!seafloor.on,
    disposeAll: () => seafloor.clear && seafloor.clear(),
  }));
  registerAndMount('aetherus-orbit', ENGINE_CLASS.DYNAMIC, overlayAdapter({
    group: () => aethLink.group,
    isOn: () => !!aethLink.state().on,
    // 이 모듈은 스스로 setInterval을 만든다 — 스코프에 넘겨 dispose가 실제로 멈추게 한다
    adoptTimers: (scope) => scope.ownDisposer(() => {
      if (aethLink.timer) { clearInterval(aethLink.timer); aethLink.timer = null; }
    }),
    disposeAll: () => aethLink._disposeGeometry && aethLink._disposeGeometry(),
  }));
  // 전체화면 인수 뷰 — 지금도 서로 배타적이라 정본 DYNAMIC 규칙과 그대로 맞는다
  [['scenario', sim], ['local-terrain', local], ['solar-system', solar], ['sky-gallery', sky], ['map-2d', map]]
    .forEach(([id, view]) => registerAndMount(id, ENGINE_CLASS.DYNAMIC, takeoverAdapter({ view, label: id })));
  const LIVE_LAYER_KEYS = {
    'ocean/buoys': ['buoys', '해양 부이 관측'],
    'hazards/fireglobal': ['fireglobal', '전지구 산불 화점'],
    'weather/radar': ['radar', '레이더 강수'],
    'weather/raingrid': ['raingrid', '전지구 강수'],
    'weather/tempgrid': ['tempgrid', '전지구 기온'],
    'weather/presgrid': ['presgrid', '전지구 기압'],
    'weather/windgrid': ['windgrid', '전지구 풍속'],
    'weather/pm25grid': ['pm25grid', '전지구 초미세먼지'],
    'weather/uvgrid': ['uvgrid', '전지구 자외선'],
    'weather/warnworld': ['warnworld', '미국 기상 특보'],
    'space/solaract': ['solaract', '오늘의 태양'],
    'hazards/crustal': ['crustal', '지각 이동 속도'],
    'hazards/tyens': ['tyens', '태풍 앙상블'],
    'ocean/sstanom': ['sstanom', '수온 아노말리'],
    'land/seaice': ['seaice', '해빙 농도'],
    'land/lst': ['lst', '지표온도'],
    'space/aurora': ['aurora', '오로라 예보'],
    'weather/tempanom': ['tempanom', '평년 대비 기온'],
    'ocean/khoasl126': ['khoasl126', '우리 바다 해수면 전망 SSP1-2.6'],
    'ocean/khoasl245': ['khoasl245', '우리 바다 해수면 전망 SSP2-4.5'],
    'ocean/khoasl370': ['khoasl370', '우리 바다 해수면 전망 SSP3-7.0'],
    'ocean/khoasl585': ['khoasl585', '우리 바다 해수면 전망 SSP5-8.5'],
    'ocean/khoaflood': ['khoaflood', '연안 침수 범위'],
    'hazards/lightning': ['lightning', '낙뢰 (최근 60분)'],
    'hazards/wildfire': ['wildfire', '산불 위험지수'],
    'weather/warn': ['warn', '기상 특보'],
    'hazards/tsunami': ['tsunami', '쓰나미 정보'],
    'people/seoul': ['seoul', '서울 실시간 인구'],
    'hazards/tyoff': ['tyoff', '태풍 공식 트랙'],
    'weather/airq': ['airq', '대기질 (에어코리아)'],
    'weather/wind': ['wind', '바람 관측'],
    'space/launch': ['launch', '발사 일정'],
    'ocean/kmasea': ['kmasea', '해상 관측망'],
    'ocean/slr': ['slr', '해수면 상승 전망 2100'],
    'people/news': ['news', '지역 뉴스'],
    'people/pop': ['pop', '국가 인구'],
    'ocean/sstfield': ['sstfield', '해수면 온도'],
    'ocean/wavefield': ['wavefield', '유의파고'],
    'ocean/current': ['current', '표층 해류'],
    'ocean/surf': ['surf', '해변·낚시'],
    'hazards/tyanalog': ['tyanalog', '태풍 과거 유사 경로'],
  };

  // 현재 구름 텍스처(등장방형)에서 특정 위경도의 구름 신호를 3×3 평균으로 샘플
  const sampleSkyAt = (lat, lon) => {
    const tex = clouds.uniforms.uTex.value;
    const img = tex && tex.image;
    if (!img || !img.width) return null;
    const c = document.createElement('canvas');
    c.width = 3; c.height = 3;
    const cx = c.getContext('2d');
    const sx = Math.floor(((lon + 180) / 360) * img.width);
    const sy = Math.floor(((90 - lat) / 180) * img.height);
    cx.clearRect(0, 0, 3, 3);
    cx.drawImage(img, sx - 1, sy - 1, 3, 3, 0, 0, 3, 3);
    const d = cx.getImageData(0, 0, 3, 3).data;
    const mixL = clouds.uniforms.uAlphaFromLum.value;
    let amt = 0;
    let covered = 0;
    for (let i = 0; i < 9; i += 1) {
      const a = d[i * 4 + 3] / 255;
      const l = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
      // 알파 0은 '구름 없음'이 아니라 '위성이 안 보는 곳'이다.
      // 0으로 세면 동아시아 밖에서 "구름 거의 없음"이라는 거짓 답이 나온다 (없는 값 ≠ 0).
      if (a === 0) continue;
      covered += 1;
      amt += a * (1 - mixL) + l * mixL;
    }
    if (covered < 5) return { outside: true };   // 9칸 중 과반이 관측 범위 밖
    amt /= covered;
    const pct = Math.round(amt * 100);
    const label = amt > 0.45 ? `☁️ 지금 내 상공에 구름 많음 — 위성 관측 신호 ${pct}%`
      : amt > 0.15 ? `⛅ 구름 조금 — 위성 관측 신호 ${pct}%`
        : `☀️ 위성 관측상 구름 거의 없음 (신호 ${pct}%)`;
    return { amt, pct, label, covered };
  };

  // '내 하늘': 사용자 위치 상공의 천리안 실황 구름 + 주변 유효 특보.
  // 사용자 유스케이스 — "앱은 없다는데 직접 보니 있네?"를 실측으로 답한다. 값 생성 없음.
  const mySky = (note) => {
    if (!navigator.geolocation) { note('내 하늘', '이 브라우저에서 위치를 사용할 수 없습니다.', 'UNAVAILABLE'); return; }
    navigator.geolocation.getCurrentPosition(async (p) => {
      const lat = p.coords.latitude;
      const lon = p.coords.longitude;
      let ty = THREE.MathUtils.degToRad(lon);
      ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
      orbit.targetYaw = ty;
      orbit.targetPitch = THREE.MathUtils.degToRad(lat);
      orbit.targetDist = 1.25;
      orbit.glide = 1.1;
      if (clouds.mode !== 'gk2a') {
        markCloudBtn('gk2a');
        const ok = await clouds.set('gk2a');
        shell.refreshFlyout();
        if (!ok) { note('내 하늘', '천리안 관측을 불러오지 못했습니다 — 판단하지 않습니다.', 'UNAVAILABLE'); return; }
      }
      const sky = sampleSkyAt(lat, lon);
      if (!sky) { note('내 하늘', '관측 텍스처가 아직 없습니다.', 'UNAVAILABLE'); return; }
      if (sky.outside) {
        note('내 하늘', '이 위치는 <b>천리안 정지궤도 관측 범위 밖</b>입니다 (동아시아 중심).<br/>'
          + '관측이 없는 것을 "구름 없음"으로 바꾸지 않습니다 — 값을 만들지 않고 비워 둡니다.<br/>'
          + '전지구 구름은 날씨 메뉴의 <b>관측 구름(GMGSI)</b>이나 <b>모델 구름</b>으로 보세요.', 'UNAVAILABLE');
        return;
      }
      const skyTxt = sky.label;
      let warnTxt = '주변 특보 확인 실패 — 판단하지 않습니다';
      try {
        const kw = await fetch('https://earthus-cache-kr.s3.us-east-2.amazonaws.com/events/kma-warn.json', { cache: 'no-store' })
          .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
        const near = (kw.active || []).filter((w) => w.lat != null
          && Math.hypot(w.lat - lat, (w.lon - lon) * Math.cos((lat * Math.PI) / 180)) < 0.55); // ≈60km
        warnTxt = near.length
          ? `주변 유효 특보 ${near.length}건 — ${[...new Set(near.map((w) => `${w.icon || ''}${w.kind} ${w.level}`))].slice(0, 4).join(' · ')}`
          : '내 주변(약 60km) 유효 특보 없음 — 기상청 발표 기준';
      } catch (_) { /* 특보 실패해도 하늘 답은 그대로 낸다 */ }
      const cn = document.getElementById('cloud-note').textContent;
      note('내 하늘', `${skyTxt}<br/>위치 ${fmtPt(lat, lon)} (GPS)<br/>${warnTxt}<br/>${cn}<br/>천리안 10분 관측 — 지금 하늘과 다르면 다음 갱신을 기다려 주세요.`, 'OBSERVED');
    }, () => note('내 하늘', '위치 권한이 거부되었습니다.', 'UNAVAILABLE'));
  };

  // ---------- MY EARTH (v5.3 축: Feed → Event Room → My Earth) ----------
  // 내 위치 기준 개인 지구 상태 — 하늘·특보·대기질·바람을 한 카드에.
  // 위치는 이 브라우저(localStorage)에만 저장. 모든 값은 관측·공식 발표 그대로 (생성 금지).
  const S3D = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
  let myEarth = { place: null, loading: false, data: null, error: null };
  try { myEarth.place = JSON.parse(localStorage.getItem('earthus.myplace') || 'null'); } catch (_) { /* 무시 */ }

  const nearestOf = (arr, lat, lon) => {
    let best = null;
    let bd = Infinity;
    for (const it of arr) {
      if (it.lat == null || it.lon == null) continue;
      const dd = Math.hypot(it.lat - lat, (it.lon - lon) * Math.cos((lat * Math.PI) / 180));
      if (dd < bd) { bd = dd; best = it; }
    }
    return best ? { it: best, km: Math.round(bd * 111) } : null;
  };

  const fetchS3 = (path) => fetch(`${S3D}${path}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const refreshMyEarth = async () => {
    const p = myEarth.place;
    if (!p) return;
    myEarth.loading = true;
    myEarth.error = null;
    shell.renderIntel();
    try {
      let ty = THREE.MathUtils.degToRad(p.lon);
      ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
      orbit.targetYaw = ty;
      orbit.targetPitch = THREE.MathUtils.degToRad(p.lat);
      orbit.targetDist = 1.25;
      orbit.glide = 1.1;
      if (clouds.mode !== 'gk2a') {
        markCloudBtn('gk2a');
        await clouds.set('gk2a');
        shell.refreshFlyout();
      }
      const sky = sampleSkyAt(p.lat, p.lon);
      const [warn, air, aws] = await Promise.all([
        fetchS3('/events/kma-warn.json'),
        fetchS3('/wind/korea-air-obs.json'),
        fetchS3('/wind/kma-aws.json'),
      ]);
      const warns = warn ? (warn.active || []).filter((w) => w.lat != null
        && Math.hypot(w.lat - p.lat, (w.lon - p.lon) * Math.cos((p.lat * Math.PI) / 180)) < 0.55) : null;
      myEarth.data = {
        sky,
        cloudNote: document.getElementById('cloud-note').textContent,
        warns,
        warnAt: warn && warn.generated,
        air: air ? nearestOf(air.stations || [], p.lat, p.lon) : null,
        airAt: air && air.observedKst,
        aws: aws ? nearestOf(aws.stations || [], p.lat, p.lon) : null,
        awsAt: aws && aws.observedKst,
        at: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      };
    } catch (e) {
      myEarth.error = String((e && e.message) || e);
    }
    myEarth.loading = false;
    shell.renderIntel();
  };

  const AIR_GRADE_KO = { 1: ['좋음', '#3fa7ff'], 2: ['보통', '#4fd06a'], 3: ['나쁨', '#ffab3d'], 4: ['매우나쁨', '#ff4d4d'] };
  const getMyHtml = () => {
    if (!myEarth.place) {
      return `<div class="card"><div class="card-h">MY EARTH ${dataBadge('LIVE')}</div>
        <div class="card-b">내 위치를 등록하면 내 하늘의 실황 구름, 주변 기상 특보, 가장 가까운 대기질·바람 관측을 한 화면으로 봅니다.<br/>
        위치는 <b>이 브라우저에만</b> 저장되며 서버로 보내지 않습니다.</div>
        <div class="paycard" style="border-style:solid;"><button class="simgo" data-action="my-locate">📍 내 위치 등록 (GPS)</button></div></div>`;
    }
    const p = myEarth.place;
    let html = `<div class="card"><div class="card-h">MY EARTH · ${fmtPt(p.lat, p.lon)}
      <button class="ui-x" data-action="my-refresh" title="갱신">⟳</button><button class="ui-x" data-action="my-locate" title="위치 다시 등록">📍</button></div><div class="card-b">`;
    if (myEarth.loading) {
      html += '관측 불러오는 중…</div></div>';
      return html;
    }
    const d = myEarth.data;
    if (!d) {
      html += '아직 조회 전 — ⟳ 를 눌러 주세요.</div></div>';
      return html;
    }
    const skyLine = !d.sky ? '하늘: 관측 텍스처 없음'
      : d.sky.outside ? '하늘: <b>천리안 관측 범위 밖</b> — 관측이 없는 것을 "구름 없음"으로 바꾸지 않습니다'
        : d.sky.label;
    html += `${skyLine}<br/><span style="font-size:9.5px;color:var(--text-dim)">${d.cloudNote || ''}</span>`;
    html += '<div style="margin-top:8px">';
    if (d.warns == null) html += '<div class="stat"><span class="k">⚠ 특보</span><span class="v na">확인 실패 — 판단하지 않음</span></div>';
    else if (!d.warns.length) html += '<div class="stat"><span class="k">⚠ 특보</span><span class="v">주변 60km 유효 특보 없음</span></div>';
    else html += `<div class="stat"><span class="k">⚠ 특보 ${d.warns.length}건</span><span class="v">${[...new Set(d.warns.map((w) => `${w.icon || ''}${w.kind} ${w.level}`))].slice(0, 3).join(' · ')}</span></div>`;
    if (d.air && d.air.km < 400) {
      const g = AIR_GRADE_KO[d.air.it.grade] || ['—', '#7f95a8'];
      html += `<div class="stat"><span class="k">💨 대기질 (${d.air.it.name} ${d.air.km}km)</span><span class="v" style="color:${g[1]}">${g[0]} · PM2.5 ${d.air.it.pm25 ?? '—'}㎍</span></div>`;
    } else {
      html += '<div class="stat"><span class="k">💨 대기질</span><span class="v na">주변 측정소 없음 (한국 관측망)</span></div>';
    }
    if (d.aws && d.aws.km < 400) {
      const a = d.aws.it;
      html += `<div class="stat"><span class="k">🌬 바람·기온 (${a.name} ${d.aws.km}km)</span><span class="v">${a.wind_ms != null ? `${a.wind_ms}m/s` : '—'} · ${a.temp_c != null ? `${a.temp_c}°C` : '—'}</span></div>`;
    }
    html += `</div>조회 ${d.at} · 하늘=천리안 10분 · 특보·대기질·바람=공식 관측 그대로</div></div>`;
    return html;
  };

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
      terrainHtml: `과장 ${uniforms.uExagger.value}× · 음영 ${uniforms.uShade.value.toFixed(1)}${uniforms.uIsobath.value > 0.5 ? ` · 등심선 ${uniforms.uIsobathStep.value.toLocaleString('ko-KR')} m` : ''}<br/>전역 z4 + 지역 z6~z8 스트리밍 (AWS Terrarium)`,
      cloudBadge: cloudBadgeFor(clouds.mode),
      cloudHtml: document.getElementById('cloud-note').textContent,
    });
    // 정본 ops/provider-health.js 판정 — 이 앱이 의존하는 소스가 지금 살아 있는지
    html += providerCardHtml();
    // 정본 core/engine-runtime.js 스냅샷 — 등록 엔진의 생명주기와 실제 자원량
    html += engineCardHtml();
    // 정본 core/resource-governor.js — 실측 fps로 결정된 품질 단계
    const th = thermal.snapshot();
    if (th.state !== THERMAL_STATE.NORMAL || th.fps > 0) {
      html += `<div class="card"><div class="card-h">렌더 품질 ${dataBadge(th.state === THERMAL_STATE.NORMAL ? 'LIVE' : 'STALE', th.state)}</div>
        <div class="card-b">
          <div class="stats">
            <div class="stat"><span class="k">실측 프레임</span><span class="v">${th.fps} fps</span></div>
            <div class="stat"><span class="k">목표</span><span class="v">${th.budget.fps} fps</span></div>
            <div class="stat"><span class="k">입자·볼륨 배율</span><span class="v">${th.budget.particleScale}× · ${th.budget.volumeScale}×</span></div>
          </div>
          <div style="margin-top:8px;opacity:.7;font-size:11px">
            판정 정본 <code>core/resource-governor.js · thermalBudget()</code> — 측정한 fps만 쓰고 예측하지 않습니다.
          </div>
        </div></div>`;
    }
    return html;
  };

  // 레이어별 켜짐/꺼짐 등 셸 자체 상태 (신선도는 getLayerState가 정본으로 덧입힌다)
  const baseLayerState = (sid, l) => {
    const id = l.id;
    if (sid === 'travel') {
      if (id === 'related') return {};
      const on = !!(travel && travel.mode === id);
      const sel = travel && travel.selected;
      return { on, note: on && sel ? `선택: ${sel.nameKo}` : undefined };
    }
    const cloudNote = () => document.getElementById('cloud-note').textContent;
    if (sid === 'weather') {
      if (id === 'cloud-off') return { on: clouds.mode === 'off' };
      if (id === 'cloud-obs') return { on: clouds.mode === 'obs', note: cloudNote() };
      if (id === 'cloud-gk2a') return { on: clouds.mode === 'gk2a', note: cloudNote() };
      if (id === 'cloud-wv') return { on: clouds.mode === 'gk2a:wv063', note: cloudNote() };
      if (id === 'cloud-fog') return { on: clouds.mode === 'gk2a:nightlow', note: cloudNote() };
      if (id === 'cloud-ea') return { on: clouds.mode === 'gk2a:ir112ea', note: cloudNote() };
      if (id === 'cloud-gfs') return { on: clouds.mode === 'gfs', note: cloudNote() };
      if (id === 'cloud-vol') return cloudVol.state();
    }
    if (sid === 'people' && id === 'sculpt') return popSculpt.state();
    if (sid === 'people' && id === 'livemix') {
      if (!popSculpt.liveOn) return { on: false };
      const n = (popSculpt.livePlaces || []).length;
      return { on: true, note: n ? `${n}곳 실시간 · 거주 격자와 겹쳐 표시` : '로딩 중…' };
    }
    if (sid === 'land' && id.startsWith('base-')) {
      return { on: baseStyle === id.slice(5) };
    }
    if (sid === 'land' && id === 'snow') {
      return { on: uniforms.uHasSnow.value === 1, note: snowNote.textContent };
    }
    if (sid === 'ocean' && id === 'oceanfocus') {
      return { on: !!(focus.selected && focus.selected.ocean) };
    }
    if (sid === 'ocean' && id === 'isobath') {
      const v = uniforms.uIsobath.value;
      return { on: v > 0.5, note: v > 0.5 ? `${uniforms.uIsobathStep.value.toLocaleString('ko-KR')} m 간격` : undefined };
    }
    if (sid === 'ocean' && id === 'trenches') {
      const t = seafloor && seafloor.selected;
      return { on: !!(seafloor && seafloor.on), note: t ? `선택: ${t.ko}` : undefined };
    }
    if (sid === 'hazards' && (id === 'feed' || id === 'eq' || id === 'tc')) {
      const want = id === 'eq' ? 'EQ' : id === 'tc' ? 'TC' : null;
      const on = shell.isIntelOpen && shell.isIntelOpen() && (feed.kind || null) === want;
      return on ? { on: true, note: `${feed.visibleItems().length}건` } : { on: false };
    }
    if (sid === 'hazards' && id === 'eqhistory') return quakeHistory.state();
    if (sid === 'hazards' && id === 'plates') {
      return quakeHistory.platesOn
        ? { on: true, note: `PB2002 ${quakeHistory.plateDoc ? `${quakeHistory.plateDoc.lines}개 선` : ''}` }
        : { on: false };
    }
    if (sid === 'hazards' && id === 'eqdepth') {
      return quakeHistory.depthMode && quakeHistory.on
        ? { on: true, note: '앞쪽 반구만 · 깊이 축척 그대로' }
        : { on: false };
    }
    const live = LIVE_LAYER_KEYS[`${sid}/${id}`];
    if (live) return liveLayers.state(live[0]);
    if (sid === 'space' && id === 'sats') return satLayer.state('core');
    if (sid === 'space' && id === 'starlink') return satLayer.state('starlink');
    if (sid === 'space' && id === 'aeth-orbit') return aethLink.state();
    return {};
  };

  // 권역 이동 (v5.3 스케일 사다리) — 3D 지구를 유지한 채 카메라 구도만 옮긴다.
  // dist는 지구 반경 배수: 3.0=전지구, 1.9=대륙, 1.45=권역, 1.22=국가 단위.
  const REGION_LABELS = {
    globe: '전 지구', eastasia: '동북아시아', korea: '한반도', seasia: '동남아시아',
    southasia: '남아시아', oceania: '오세아니아', europe: '유럽', mideast: '중동',
    africa: '아프리카', namerica: '북미', samerica: '남미', arctic: '북극', antarctic: '남극',
  };
  const REGION_VIEW = {
    globe: [20, 130, 3.0],
    eastasia: [34, 125, 1.62],
    korea: [36.2, 127.8, 1.22],
    seasia: [8, 112, 1.62],
    southasia: [21, 79, 1.7],
    oceania: [-25, 140, 1.85],
    europe: [50, 12, 1.6],
    mideast: [27, 45, 1.62],
    africa: [2, 20, 2.0],
    namerica: [42, -100, 1.9],
    samerica: [-15, -60, 1.9],
    arctic: [72, 10, 1.85],
    antarctic: [-72, 20, 1.85],
  };
  // 권역에 '속한 나라' 판정: 나라 중심이 이 상자 안에 들어오면 그 권역으로 본다.
  // [위도0, 위도1, 경도0, 경도1] — 경도0>경도1이면 반자오선을 넘는 상자.
  const REGION_BOX = {
    eastasia: [20, 55, 100, 150],
    korea: [33, 43, 124, 132],
    seasia: [-11, 29, 92, 142],
    southasia: [5, 38, 60, 93],
    oceania: [-48, 0, 110, 180],
    europe: [35, 72, -25, 45],
    mideast: [12, 42, 33, 64],
    africa: [-35, 38, -18, 52],
    namerica: [14, 72, -168, -52],
    samerica: [-56, 13, -82, -34],
    arctic: [66, 90, -180, 180],
    antarctic: [-90, -60, -180, 180],
  };
  const countriesInRegion = (id) => {
    const box = REGION_BOX[id];
    if (!box || !focus.data) return [];
    const [la0, la1, lo0, lo1] = box;
    const out = [];
    for (const f of focus.data.features) {
      let sLo = 0; let sLa = 0; let n = 0;
      for (const poly of polysOf(f)) {
        for (const [lo, la] of poly[0]) { sLo += lo; sLa += la; n += 1; }
      }
      if (!n) continue;
      const cLa = sLa / n;
      const cLo = sLo / n;
      if (cLa < la0 || cLa > la1) continue;
      const inLon = lo0 <= lo1 ? (cLo >= lo0 && cLo <= lo1) : (cLo >= lo0 || cLo <= lo1);
      if (inLon) out.push(f);
    }
    return out;
  };

  const goRegion = (id) => {
    const v = REGION_VIEW[id];
    if (!v) return;
    const [lat, lon, dist] = v;
    if (map.active) map.exit();
    if (local.active) local.close(true);
    focus.clear();
    // 전 지구는 포커스 없이 물러나기만 한다
    if (id !== 'globe') {
      const members = countriesInRegion(id);
      const label = (REGION_LABELS && REGION_LABELS[id]) || id;
      if (members.length) focus.selectRegion(members, label, id);
    }
    let ty = THREE.MathUtils.degToRad(lon);
    ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
    orbit.targetYaw = ty;
    orbit.targetPitch = THREE.MathUtils.degToRad(lat);
    orbit.targetDist = dist;
    orbit.glide = 1.2;
    orbit.autoRotate = false;
  };

  // 카드 띄우기 — 메뉴 클릭 밖(칩·단축키)에서도 같은 카드를 쓰려고 공용으로 둔다
  const showNote = (title, body, badge) => {
    lockedNote = { title, body, badge };
    shell.showTab('now');
    shell.openIntel();
    shell.renderIntel();
  };

  // 인구 조각 국가 칩 — 격자를 켜고 그 나라가 화면을 채우는 거리로 날아간다.
  const goPopCountry = (iso3, nameKo) => {
    if (map.active) map.exit();
    if (local.active) local.close(true);
    popSculpt.pendingName = nameKo;
    const ready = popSculpt.on ? Promise.resolve() : popSculpt.toggle().then(() => {});
    ready
      .then(() => popSculpt.show(iso3, nameKo))
      .then(() => {
        const ext = popSculpt.extent();
        showNote('인구 데이터 조각', popSculpt.cardHtml(), popSculpt.doc ? 'OBSERVED' : 'UNAVAILABLE');
        shell.refreshFlyout();
        if (!ext) return;
        let ty = THREE.MathUtils.degToRad(ext.lon);
        ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
        orbit.targetYaw = ty;
        orbit.targetPitch = THREE.MathUtils.degToRad(ext.lat);
        // 나라 폭이 화면에 담기는 거리 — 큰 나라는 멀리, 작은 나라는 가까이
        orbit.targetDist = 1 + THREE.MathUtils.clamp(ext.spanKm * 1.35, 260, 5200) / 6371;
        orbit.targetTilt = 0.85;
        orbit.glide = 1.2;
        orbit.autoRotate = false;
      });
  };

  // 셸 훅을 변수로 들고 있는다 — 사건 방의 "지구에 켜기"가 메뉴와 같은 경로로 레이어를 켤 수 있게
  const shellHooks = {
    onScene: () => { lockedNote = null; },
    onRegion: goRegion,
    onPopCountry: goPopCountry,
    onFlyoutOpened: () => { closeDrawers(); },
    onPlay: () => {
      // ▶ 재생은 예보 시간축 — 관측/정적 구름은 미래가 없으니 모델로 자동 전환
      if (clouds.mode !== 'gfs') {
        markCloudBtn('gfs');
        clouds.set('gfs').then((ok) => {
          if (!ok) markCloudBtn('off');
          shell.renderIntel();
          shell.refreshFlyout();
        });
      }
    },
    // 정본 canonical-signal.deriveFreshnessState()로 유도한 데이터 상태를 덧입힌다.
    // 셸 자체 상태(켜짐/꺼짐)는 그대로 두고, 늙은 데이터만 눈에 보이게 표시한다.
    getLayerState: (sid, l) => {
      const st = baseLayerState(sid, l) || {};
      const ds = layerDataState(`${sid}/${l.id}`);
      if (ds !== 'LIVE') return { ...st, note: `${st.note ? st.note + ' · ' : ''}${ds}` };
      return st;
    },
    onLayerAction: (sid, layer) => {
      const key = `${sid}/${layer.id}`;
      const note = showNote;
      if (layer.state === 'LOCKED') {
        note(layer.name, `출처 예정: ${layer.src}<br/>계획: ${layer.plan}<br/>연결 전에는 어떤 값도 생성하지 않습니다 (INSUFFICIENT_DATA ≠ 0).`);
        return;
      }
      if (key === 'hazards/plates') {
        quakeHistory.togglePlates().then((st) => {
          shell.refreshFlyout();
          if (st.on) note('판 경계선', quakeHistory.platesCardHtml(), 'OBSERVED');
          else if (st.error) note('판 경계선', st.error, 'UNAVAILABLE');
          else { lockedNote = null; shell.renderIntel(); }
        });
        return;
      }
      if (key === 'hazards/eqdepth') {
        const want = !(quakeHistory.on && quakeHistory.depthMode);
        note('지진 깊이', want ? '진원을 지구 속 제자리에 놓는 중…' : '표면 모드로 돌아갑니다', 'OBSERVED');
        shell.refreshFlyout();
        quakeHistory.setDepthMode(want).then((st) => {
          shell.refreshFlyout();
          if (st && st.on) {
            note('지진 깊이', quakeHistory.cardHtml(), 'OBSERVED');
            if (map.active) map.exit();
            // 섭입대는 비스듬히, 그리고 지구 속이 보일 만큼 가까이 봐야 판이 파고드는 각이 보인다
            if (want) {
              orbit.targetTilt = 1.02;
              orbit.targetDist = THREE.MathUtils.clamp(orbit.targetDist, 1.3, 1.5);
              orbit.glide = 1.4;
            }
            orbit.autoRotate = false;
          } else if (st && st.error) note('지진 깊이', st.error, 'UNAVAILABLE');
        });
        return;
      }
      if (key === 'hazards/eqhistory') {
        // 25년치를 처음 열 때는 1MB를 풀고 18만 점을 세우니, 먼저 카드로 상태를 알린다
        note('지진 25년', '25년치 지진 카탈로그(18만건)를 여는 중…', 'OBSERVED');
        shell.refreshFlyout();
        quakeHistory.toggle().then((st) => {
          shell.refreshFlyout();
          if (st.on) {
            note('지진 25년', quakeHistory.cardHtml(), 'OBSERVED');
            // 판 경계는 전지구에서만 보인다 — 가까이 있으면 물러난다
            if (map.active) map.exit();
            if (orbit.targetDist < 2.2) { orbit.targetDist = 2.6; orbit.glide = 1.4; }
            orbit.autoRotate = false;
          }
          else if (st.error) note('지진 25년', st.error, 'UNAVAILABLE');
          else { lockedNote = null; shell.renderIntel(); }
        });
        return;
      }
      const live = LIVE_LAYER_KEYS[key];
      if (live) {
        const [lid, title] = live;
        liveLayers.toggle(lid).then((st) => {
          shell.refreshFlyout();
          if (st.on) {
            // 정본이 선언한 증거종류·신선도 기준을 카드에 함께 보여준다 (진리등급의 근거)
            const truth = layerTruthLine(key);
            note(title, liveLayers.card(lid) + (truth ? `<div class="card"><div class="card-b" style="font-size:11px;opacity:.75">${truth}</div></div>` : ''), st.badge);
          } else if (st.error) {
            note(title, `데이터를 불러오지 못했습니다 — 값을 생성하지 않고 표시하지 않습니다.<br/>${st.error}`, 'UNAVAILABLE');
          } else {
            lockedNote = null;
            shell.renderIntel();
          }
        });
        shell.refreshFlyout();
        return;
      }
      if (key === 'space/aeth-orbit') {
        aethLink.toggle().then((st) => {
          shell.refreshFlyout();
          if (st.on) note('궤도 인텔리전스', aethLink.card(), 'LIVE');
          else if (st.error) note('궤도 인텔리전스', `AETHERUS 과학 API에 연결하지 못했습니다 — 위치·근접사건을 생성하지 않습니다.<br/>${st.error}`, 'UNAVAILABLE');
          else { lockedNote = null; shell.renderIntel(); }
        });
        shell.refreshFlyout();
        return;
      }
      if (key === 'people/livemix') {
        // 거주 인구 격자가 있어야 배율을 낼 수 있다 — 없으면 한국을 먼저 띄운다
        const ensure = popSculpt.on && popSculpt.doc
          ? Promise.resolve()
          : (popSculpt.on ? popSculpt.show('KOR', '대한민국')
            : popSculpt.toggle('KOR').then(() => { popSculpt.pendingName = '대한민국'; }));
        ensure.then(() => popSculpt.toggleLive()).then((st) => {
          shell.refreshFlyout();
          if (st.on) {
            note('지금 사람 × 거주 인구', popSculpt.liveCardHtml(), 'OBSERVED');
            // 서울 상공으로 이동해 두 층이 겹친 모습을 보여준다
            let ty = THREE.MathUtils.degToRad(126.99);
            ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
            orbit.targetYaw = ty;
            orbit.targetPitch = THREE.MathUtils.degToRad(37.55);
            orbit.targetDist = 1 + 90 / 6371;
            orbit.targetTilt = 0.95;
            orbit.glide = 1.2;
          } else if (st.error) {
            note('지금 사람 × 거주 인구', st.error, 'UNAVAILABLE');
          } else { lockedNote = null; shell.renderIntel(); }
        });
        shell.refreshFlyout();
        return;
      }
      if (key === 'people/sculpt') {
        const sel = focus.selected && focus.selected.code3;
        if (focus.selected) popSculpt.pendingName = focus.selected.nameKo;
        popSculpt.toggle(sel).then((st) => {
          shell.refreshFlyout();
          if (st.on) note('인구 데이터 조각', popSculpt.cardHtml(), 'OBSERVED');
          else { lockedNote = null; shell.renderIntel(); }
        });
        shell.refreshFlyout();
        return;
      }
      if (key === 'space/galaxy') {
        shell.closeFlyout();
        closeDrawers();
        galaxy.open();
        return;
      }
      if (key === 'space/solar') {
        shell.closeFlyout();
        closeDrawers();
        solar.open();
        return;
      }
      if (key === 'space/photos') {
        shell.closeFlyout();
        closeDrawers();
        sky.open();
        return;
      }
      if (key === 'space/sats' || key === 'space/starlink') {
        const fn = key === 'space/sats' ? satLayer.toggleCore() : satLayer.toggleStarlink();
        fn.then((st) => {
          shell.refreshFlyout();
          if (st.on) note('인공위성 추적', satLayer.card(), 'LIVE');
          else if (st.error) note('인공위성 추적', `카탈로그를 불러오지 못했습니다 — 위치를 생성하지 않습니다.<br/>${st.error}`, 'UNAVAILABLE');
          else { lockedNote = null; shell.renderIntel(); }
        });
        shell.refreshFlyout();
        return;
      }
      const setCloud = (m) => {
        markCloudBtn(m);
        clouds.set(m).then((ok) => {
          if (!ok) markCloudBtn('off');
          shell.renderIntel();
          shell.refreshFlyout();
        });
        shell.refreshFlyout();
      };
      switch (key) {
        case 'weather/cloud-off': setCloud('off'); break;
        case 'land/terrain':
          note('실지형 3D', 'AWS Terrarium 실고도 — 전역 z4 + 지역 z6~z8 스트리밍. 항상 켜져 있는 기본 씬입니다.', 'LIVE');
          break;
        case 'land/satdetail':
          note('위성 표면', '고도 4,000km 아래로 줌인하면 실제 위성 이미지가 지형 위로 자동 표시됩니다. 250km 아래는 지역 3D.', 'LIVE');
          break;
        case 'land/snow':
          setSnow(!document.getElementById('c-snow').checked).then(() => shell.refreshFlyout());
          shell.refreshFlyout();
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
        case 'land/base-ne2':
        case 'land/base-bluemarble':
        case 'land/base-truecolor':
        case 'land/base-night':
          setBaseStyle(key.replace('land/base-', ''), note);
          break;
        case 'land/globe':
          focus.clear();
          orbit.targetDist = 3.0;
          orbit.glide = 1.1;
          break;
        case 'weather/cloud-obs': setCloud('obs'); break;
        case 'weather/cloud-gk2a': setCloud('gk2a'); break;
        case 'weather/cloud-wv': setCloud('gk2a:wv063'); break;
        case 'weather/cloud-fog': setCloud('gk2a:nightlow'); break;
        case 'weather/cloud-ea': setCloud('gk2a:ir112ea'); break;
        case 'weather/mysky': mySky(note); break;
        case 'weather/cloud-vol':
          cloudVol.toggle().then((st) => {
            shell.refreshFlyout();
            if (st.on) note('구름 3D 볼륨', cloudVol.cardHtml(), 'MODEL_SIGNAL');
            else if (st.error) note('구름 3D 볼륨', `볼륨을 불러오지 못했습니다 — 값을 생성하지 않습니다.<br/>${st.error}`, 'UNAVAILABLE');
            else { lockedNote = null; shell.renderIntel(); }
          });
          shell.refreshFlyout();
          break;
        case 'weather/cloud-gfs':
          setCloud('gfs');
          note('비·눈·태풍 5일 예보', '하단 타임라인 ▶ 를 누르면 5일치 이동을 재생합니다.<br/>비=파랑 · 눈=연보라 · 65초 뒤 동아시아 4° 상세가 합류합니다.', 'MODEL_SIGNAL');
          break;
        case 'ocean/marine':
          note('해상 실황 조회', '지구의 바다를 클릭하면 그 지점의 실측 파고·너울·풍속을 조회하고, 관측 기반 시뮬레이션으로 볼 수 있습니다.', 'OBSERVED');
          break;
        case 'ocean/oceanfocus':
          if (focus.selected && focus.selected.ocean) focus.clear();
          else { focus.clear(); focus.selectOcean(); }
          shell.renderIntel();
          shell.refreshFlyout();
          break;
        case 'ocean/typhoonsim':
          shell.showTab('scenario');
          shell.openIntel();
          break;
        // 해저 등심선 — 셰이더가 고도맵에서 직접 등고선을 그린다
        case 'ocean/isobath': {
          const on = uniforms.uIsobath.value < 0.5;
          uniforms.uIsobath.value = on ? 1.0 : 0.0;
          const iso = document.getElementById('c-isobath');
          if (iso) iso.disabled = !on;
          shell.refreshFlyout();
          note('해저 등심선',
            on
              ? `바다 바닥을 <b>${uniforms.uIsobathStep.value.toLocaleString('ko-KR')} m 간격</b>의 등심선으로 그립니다.
                 5번째(${(uniforms.uIsobathStep.value * 5).toLocaleString('ko-KR')} m)마다 굵은 주곡선입니다.<br/>
                 줌아웃해서 선이 화면 1픽셀보다 촘촘해지는 구간은 저절로 사라집니다 — 뭉개진 띠 대신 아무것도 안 그립니다.<br/><br/>
                 <span style="opacity:.75">간격은 설정 ▸ 시뮬레이션 · 표현 튜닝의 “등심선 간격”에서 200~2,000 m로 바꿀 수 있습니다.</span><br/>
                 <span style="opacity:.7;font-size:11px">지형을 변형하지 않습니다. 지구본이 이미 쓰는 고도맵(AWS Terrarium z4 · 적도 약 9.8 km/px)을
                 그대로 읽어 선만 얹습니다 — 그 해상도보다 가는 지형은 등심선에도 나타나지 않습니다.</span>`
              : '해저 등심선을 껐습니다.',
            'OBSERVED');
          break;
        }
        // 여행 씬 — 오늘 발견 · 목적별 (데이터랩 출품 모듈). 모드는 하나만 켜진다.
        case 'travel/discover':
        case 'travel/bf':
        case 'travel/wl':
        case 'travel/en':
        case 'travel/visitors': {
          const mode = key.split('/')[1];
          travel.setMode(mode).then((st) => {
            shell.refreshFlyout();
            if (!st.on) { lockedNote = null; shell.renderIntel(); return; }
            usage.track(mode === 'discover' ? 'travel.discover_opened' : 'travel.purpose_opened');
            // 처음 켤 때 한국으로 — 시군구 228곳이 한 화면에 들어오는 거리
            const KR = { lat: 36.3, lon: 127.8 };
            let ty = THREE.MathUtils.degToRad(KR.lon);
            ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
            orbit.targetYaw = ty; orbit.targetPitch = THREE.MathUtils.degToRad(KR.lat);
            if (orbit.targetDist > 1.4 || orbit.targetDist < 1.06) orbit.targetDist = 1.22;
            orbit.glide = 1.1;
            note(layer.name, travel.sceneCard(), 'DERIVED');
          }).catch((e) => note(layer.name, `발견 데이터를 불러오지 못했습니다 — 값을 생성하지 않습니다.<br/>${String((e && e.message) || e)}`, 'UNAVAILABLE'));
          shell.refreshFlyout();
          break;
        }
        case 'travel/related':
          usage.track('travel.related_opened');
          travel.ensure().then(() => note(layer.name, travel.relatedCard(), 'HISTORY'))
            .catch((e) => note(layer.name, `연관 관광지 데이터를 불러오지 못했습니다.<br/>${String((e && e.message) || e)}`, 'UNAVAILABLE'));
          break;
        // 해구 위치 — GEBCO SCUFN 가제티어 축선
        case 'ocean/trenches':
          seafloor.toggle().then((st) => {
            shell.refreshFlyout();
            if (st.on) note('해구 위치', seafloor.card(), 'OBSERVED');
            else if (st.error) note('해구 위치', `GEBCO SCUFN 가제티어를 불러오지 못했습니다 — 좌표를 생성하지 않습니다.<br/>${st.error}`, 'UNAVAILABLE');
            else { lockedNote = null; shell.renderIntel(); }
          });
          shell.refreshFlyout();
          break;
        case 'hazards/feed':
        case 'hazards/eq':
        case 'hazards/tc':
          // 세 줄이 같은 화면을 열던 것을 종류별로 가른다
          feed.setKind(layer.id === 'eq' ? 'EQ' : layer.id === 'tc' ? 'TC' : null);
          shell.showTab('feed');
          shell.openIntel();
          shell.refreshFlyout();
          break;
        default:
          break;
      }
    },
    getNow: getNowHtml,
    getMy: () => getMyHtml(),
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
      } else if (action === 'my-locate') {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((p) => {
          myEarth.place = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) };
          try { localStorage.setItem('earthus.myplace', JSON.stringify(myEarth.place)); } catch (_) { /* 무시 */ }
          refreshMyEarth();
        }, () => { myEarth.error = '위치 권한이 거부되었습니다'; shell.renderIntel(); });
      } else if (action === 'my-refresh') {
        refreshMyEarth();
      } else if (action === 'ty-focus') {
        let ty = THREE.MathUtils.degToRad(parseFloat(ds.lon));
        ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
        orbit.targetYaw = ty;
        orbit.targetPitch = THREE.MathUtils.degToRad(parseFloat(ds.lat));
        orbit.targetDist = 1.45;
        orbit.glide = 1.1;
      } else if (action === 'ty-sim') {
        // 공식 최대풍속(m/s) → SSHS 카테고리로 시뮬 초기값 설정 (트랙→시뮬 연결)
        const w = parseFloat(ds.wind) || 0;
        const cat0 = w >= 70 ? 5 : w >= 58 ? 4 : w >= 50 ? 3 : w >= 43 ? 2 : 1;
        launchScenario(parseFloat(ds.lat), parseFloat(ds.lon), cat0);
      } else if (action === 'feed-open') {
        usage.track('event.room_opened');
        feed.select(parseInt(ds.idx, 10), orbit); // view 전환은 동기, 트랙은 비동기
        shell.renderIntel();
      } else if (action === 'feed-back') {
        feed.back();
        shell.renderIntel();
      } else if (action === 'flood-district' && ds.sgg) {
        // 시군구 침수 폴리곤을 받아 얹고, 그 위로 비스듬히 내려간다
        showNote('연안 침수 범위', `${ds.sgg} 침수 예상도를 불러오는 중…`, 'OFFICIAL_OBSERVATION');
        liveLayers.loadFloodDistrict(ds.sgg).then((info) => {
          if (!info) { showNote('연안 침수 범위', '침수 자료를 불러오지 못했습니다 — 그리지 않습니다.', 'UNAVAILABLE'); return; }
          const [w, sth, e2, n] = info.bbox;
          const lat = (sth + n) / 2;
          const lon = (w + e2) / 2;
          let ty = THREE.MathUtils.degToRad(lon);
          ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
          orbit.targetYaw = ty;
          orbit.targetPitch = THREE.MathUtils.degToRad(lat);
          const spanKm = Math.max((e2 - w) * 111 * Math.cos((lat * Math.PI) / 180), (n - sth) * 111, 6);
          orbit.targetDist = 1 + Math.min(120, Math.max(14, spanKm * 1.6)) / 6371;
          orbit.targetTilt = 0.8;
          orbit.glide = 1.2;
          orbit.autoRotate = false;
          if (map.active) map.exit();
          showNote('연안 침수 범위', liveLayers.floodDistrictCardHtml() + '<br/>' + liveLayers.card('khoaflood'), 'OFFICIAL_OBSERVATION');
        });
      } else if (action === 'room-layer' && ds.key) {
        // 사건 방 줄의 "지구에 켜기" — 메뉴에서 누른 것과 똑같은 경로로 레이어를 켠다
        usage.track('event.layer_from_room');
        const [sid, lid] = String(ds.key).split('/');
        const sc = SCENES.find((s) => s.id === sid);
        const layer = sc && sc.layers.find((l) => l.id === lid);
        if (layer) shellHooks.onLayerAction(sid, layer);
        else showNote('사건 방', `레이어 ${ds.key}를 메뉴에서 찾지 못했습니다.`, 'UNAVAILABLE');
      } else if (action === 'feed-retry') {
        feed.load().then(() => shell.renderIntel());
        shell.renderIntel();
      }
    },
    getFocusSel: () => focus.selected,
    // 라벨 예산: 정본 scene-orchestrator.buildScenePlan() (씬·기기·열상태·패널 반영)
    labelBudget: () => {
      // 이 셸은 씬 하이라이트가 없으므로 지금 켜져 있는 것으로 씬을 판정한다
      const sid = (focus.selected && focus.selected.ocean) ? 'ocean'
        : clouds.mode !== 'off' ? 'weather' : 'land';
      const plan = scenePlan(sid, {
        thermalState: thermal.state,
        panelOpen: shell.isIntelOpen(),
        focus: focus.selected ? { countryId: focus.selected.code3 || 'SEL' } : null,
      });
      return plan ? plan.labelBudget : 0;
    },
    labelData: () => labelCandidates,
    onTimeOffset: (ms) => {
      timeOffsetMs = ms;
      // 사용자가 시간을 실제로 만졌다 — 이제부터 5일치를 배경에서 받아둔다.
      // 만지지 않는 사람에게는 한 장도 더 내려보내지 않는다.
      if (ms !== 0) clouds.prefetchFrames();
      clouds.setForecastOffset(ms);
      liveLayers.setTimeOffset(ms);
      syncCloudToTime(ms);
    },
    // 스트립 문구는 실제 상태에서 만든다. 예전엔 하드코딩이라
    // 관측 구름을 보고 있어도 "예보구름 MODEL"이라고 말했다.
    // 스트립은 좁다. 짧은 말은 눈에, 온전한 말은 title 에 둔다.
    // 다만 '지금이 아닌 것을 지금처럼 보여주는' 경우에는 짧은 쪽에도 경고를 남긴다.
    timeNote: () => {
      const ty = liveLayers.state('tyoff').on;
      let short;
      if (clouds.mode === 'gfs') short = ty ? '구름·태풍 예보' : '구름 예보';
      else if (cloudSwitching) short = '예보로 전환 중…';
      else if (clouds.mode === 'off') short = ty ? '태양·태풍' : '태양만';
      else short = '⚠ 구름은 관측값 (이 시각 아님)';
      const full = [
        '태양 위치: 그 시각으로 다시 계산',
        clouds.mode === 'off' ? '구름: 꺼짐'
          : clouds.mode === 'gfs' ? '구름: GFS 예보 (MODEL) — 그 시각의 예보'
            : '구름: 관측 실황 — 지금 것이며 이 시각의 구름이 아닙니다',
        ty ? '태풍: 발표기관 공식 예보 경로 위의 그 시각 위치' : '태풍 레이어 꺼짐',
        '그 밖의 관측 레이어(지진·특보·대기질 등)는 현재값 그대로입니다',
      ].join('\n');
      return { short, full };
    },
  };
  const shell = initShell(shellHooks);

  // ---------- 크롬 서랍 (검색·설정) — 1.0식 배타성: 하나 열리면 나머지 닫힘 ----------
  const searchDrawer = document.getElementById('search-drawer');
  const settingsDrawer = document.getElementById('settings-drawer');
  const btnSearch = document.getElementById('btn-search');
  const btnSettings = document.getElementById('btn-settings');
  function closeDrawers() {
    searchDrawer.classList.remove('open');
    settingsDrawer.classList.remove('open');
    btnSearch.classList.remove('on');
    btnSettings.classList.remove('on');
  }
  const toggleDrawer = (drawer, btn) => {
    const willOpen = !drawer.classList.contains('open');
    closeDrawers();
    shell.closeFlyout();
    if (willOpen) {
      drawer.classList.add('open');
      btn.classList.add('on');
    }
    return willOpen;
  };
  btnSearch.addEventListener('click', () => {
    if (toggleDrawer(searchDrawer, btnSearch)) document.getElementById('c-search').focus();
  });
  btnSettings.addEventListener('click', () => toggleDrawer(settingsDrawer, btnSettings));

  // 첫 방문 안내 — 처음 온 사람에게 조작법과 어디에 뭐가 있는지 한 번만 알려준다
  const onboard = initOnboard();
  document.getElementById('btn-help').addEventListener('click', () => {
    closeDrawers();
    shell.closeFlyout();
    onboard.open();
  });

  // 공유 — 링크 복사 / 그림 저장
  const shareMenu = document.getElementById('share-menu');
  const shareToast = document.getElementById('share-toast');
  let toastTimer = null;
  const toast = (html) => {
    shareToast.innerHTML = html;
    shareToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => shareToast.classList.remove('show'), 3200);
  };
  document.getElementById('btn-share').addEventListener('click', (e) => {
    e.stopPropagation();
    closeDrawers();
    shell.closeFlyout();
    shareMenu.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!shareMenu.contains(e.target) && e.target.id !== 'btn-share') shareMenu.classList.remove('open');
  });
  shareMenu.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-share]');
    if (!b) return;
    shareMenu.classList.remove('open');
    if (b.dataset.share === 'image') {
      try { captureImage(); toast('지구 그림을 저장했습니다 — <b>다운로드</b> 폴더를 확인하세요'); } catch (err) { toast(`그림 저장 실패: ${err.message}`); }
      return;
    }
    const r = await shareNow();
    if (r.shared) return;
    toast(r.copied
      ? '이 화면 링크를 <b>복사</b>했습니다 — 붙여넣으면 지금 보는 화면 그대로 열립니다'
      : '주소창의 링크를 복사해 주세요 (클립보드 권한 없음)');
  });

  const launchScenario = (lat, lon, cat0 = 3) => {
    let cat = cat0;
    let eye = 35;
    const controls = `
      <label>카테고리 <input type="range" id="sc-cat" min="1" max="5" step="1" value="${cat0}" /><b id="sc-cat-v">${cat0}</b></label>
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
    // 권역 포커스는 지오메트리가 없다 — 묶인 나라 수와 합계 인구만 정직하게 적는다
    if (f.region) {
      focusStatsRows = statRow('권역', `${f.nameKo} · ${f.count}개국`)
        + statRow('합계 인구', '불러오는 중…', true)
        + statRow('묶는 기준', '나라 중심 좌표가 이 권역 상자 안에 드는 나라', false);
      shell.openIntel();
      shell.renderIntel();
      const members = countriesInRegion(f.nameEn);
      Promise.all(members.map((m) => liveLayers.countryPop((m.properties || m).code3)))
        .then((recs) => {
          if (!focus.selected || focus.selected.code3 !== f.code3) return;
          const got = recs.filter(Boolean);
          const sum = got.reduce((a, r) => a + r.v, 0);
          focusStatsRows = focusStatsRows.replace(
            statRow('합계 인구', '불러오는 중…', true),
            got.length
              ? statRow('합계 인구', `${Math.round(sum).toLocaleString('ko-KR')}명 (${got.length}/${members.length}개국 · World Bank)`)
              : statRow('합계 인구', 'UNAVAILABLE', true),
          );
          shell.renderIntel();
        });
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
      + statRow('인구', '불러오는 중…', true)
      + statRow('GDP', 'UNAVAILABLE', true)
      + statRow('실시간 데이터', focusLiveRow(f));
    shell.openIntel();
    shell.renderIntel();
    // 인구는 World Bank 최신 관측값 — 도착하면 그 줄만 다시 그린다
    const iso = (f.properties || f).code3;
    liveLayers.countryPop(iso).then((rec) => {
      if (!focus.selected || focus.selected.code3 !== iso) return;
      focusStatsRows = focusStatsRows.replace(
        statRow('인구', '불러오는 중…', true),
        rec
          ? statRow('인구', `${Math.round(rec.v).toLocaleString('ko-KR')}명 (${rec.year} World Bank)`)
          : statRow('인구', 'UNAVAILABLE', true),
      );
      shell.renderIntel();
    });
  };

  // 이 나라에서 지금 켜져 있는 실데이터 레이어 — 없으면 정직하게 없다고 적는다
  const focusLiveRow = () => {
    const on = liveLayers.activeIds ? liveLayers.activeIds() : [];
    return on.length ? `${on.length}개 레이어 켜짐` : '켜진 레이어 없음';
  };

  // 국가 검색: 한글/영문 이름 부분 일치 → 선택 시 포커스 이동
  // 시간을 옮기면 구름도 그 시각의 것이어야 한다.
  // 관측 구름은 '지금'의 관측이라 미래에는 존재하지 않는다. 그대로 두면 태양만 움직이고,
  // 더 나쁘게는 없는 구름을 그 시각에 있다고 보여주게 된다 → 예보 구름으로 바꾸고 밝힌다.
  let cloudBeforeScrub = null;
  let cloudSwitching = false;
  const isObservedCloud = (m) => m === 'obs' || (m || '').startsWith('gk2a');
  const syncCloudToTime = (ms) => {
    if (cloudSwitching) return;
    const far = Math.abs(ms) >= 3600000;   // 1시간 이상 옮겼을 때만
    if (far && isObservedCloud(clouds.mode)) {
      cloudBeforeScrub = clouds.mode;
      cloudSwitching = true;
      clouds.set('gfs').then((ok) => {
        cloudSwitching = false;
        if (!ok) { cloudBeforeScrub = null; return; }
        markCloudBtn('gfs');
        clouds.setForecastOffset(timeOffsetMs);
        refreshTimeLabel();   // 문구가 '⚠ 관측값'에서 '예보'로 바뀌어야 한다
      }).catch(() => { cloudSwitching = false; cloudBeforeScrub = null; refreshTimeLabel(); });
    } else if (!far && cloudBeforeScrub && clouds.mode === 'gfs') {
      const back = cloudBeforeScrub;   // 지금으로 돌아오면 관측을 되돌린다
      cloudBeforeScrub = null;
      cloudSwitching = true;
      clouds.set(back).then(() => { cloudSwitching = false; markCloudBtn(back); refreshTimeLabel(); })
        .catch(() => { cloudSwitching = false; refreshTimeLabel(); });
    }
  };
  // 스트립 문구는 슬라이더 input 때 만들어진다. 모드가 비동기로 바뀐 뒤엔 다시 만들어 줘야 한다.
  const refreshTimeLabel = () => {
    const r = document.getElementById('ts-range');
    if (r) r.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // ---------- 진단 HUD ----------
  // 화면만 봐서는 어느 빌드에서 무엇이 켜져 있는지 알 수 없다.
  // 여기 모아 두면 PD가 통째로 복사해 넘길 수 있다 — 캡처보다 정확하고 빠르다.
  const hudLine = document.getElementById('hud-line');
  const hudMore = document.getElementById('hud-more');
  const hudText = document.getElementById('hud-text');
  const hudCopy = document.getElementById('hud-copy');
  const fmtLL = (la, lo) => `${la >= 0 ? 'N' : 'S'}${Math.abs(la).toFixed(2)} ${lo >= 0 ? 'E' : 'W'}${Math.abs(lo).toFixed(2)}`;

  const diagnostics = () => {
    const ver = (document.querySelector('script[src*="main.js"]') || {}).src || '';
    const la = THREE.MathUtils.radToDeg(orbit.pitch);
    const lo = ((THREE.MathUtils.radToDeg(orbit.yaw) + 180) % 360 + 360) % 360 - 180;
    const alt = Math.round((orbit.dist - 1) * EARTH_RADIUS_M / 1000);
    const L = [];
    L.push(`EARTHUS v2 · ${(ver.match(/main\.js\?v=\d+/) || ['버전미상'])[0]}`);
    L.push(`좌표  ${fmtLL(la, lo)} · 고도 ${alt.toLocaleString()}km · 과장 ${uniforms.uExagger.value}×`);
    const offMin = Math.round(timeOffsetMs / 60000);
    const at = new Date(Date.now() + timeOffsetMs);
    L.push(`시각  ${offMin === 0 ? 'NOW' : `T${offMin > 0 ? '+' : '−'}${Math.floor(Math.abs(offMin) / 60)}:${String(Math.abs(offMin) % 60).padStart(2, '0')}`} = ${at.toISOString().slice(0, 16)}Z`);
    if (lastSunState) L.push(`태양  직하점 ${fmtLL(lastSunState.declDeg, lastSunState.lonDeg)}`);
    L.push(`구름  ${clouds.mode}${clouds.mode === 'gfs' && clouds.lastOffsetMs != null ? ` (오프셋 ${Math.round(clouds.lastOffsetMs / 3.6e6)}h 적용)` : ''}`);
    const cn = (document.querySelector('.cloud-note') || {}).textContent || '';
    if (cn) L.push(`      ${cn.replace(/\s+/g, ' ').slice(0, 120)}`);
    const on = liveLayers.activeIds();
    L.push(`레이어 ${on.length ? on.join(', ') : '없음'} (${on.length}개)`);
    const extra = [];
    if (popSculpt.on) extra.push('인구조각');
    if (quakeHistory.on) extra.push('지진25년');
    if (map.active) extra.push('지도모드');
    if (local.active) extra.push('지역3D');
    if (flightRoute.active()) extra.push('항로');
    if (extra.length) L.push(`기타  ${extra.join(', ')}`);
    try {
      const snap = providerSnapshot();
      // 아직 한 번도 호출 안 된 소스는 '정상'이 아니라 '미확인'이다.
      // 정상으로 세면 진단이 고장을 숨긴다 — 실제로 기상청 지상관측 고장을 놓쳤다.
      const bad = snap.filter((x) => x.state && x.state !== 'HEALTHY');
      const unknown = snap.filter((x) => !x.state);
      L.push(`소스  정상 ${snap.length - bad.length - unknown.length} · 이상 ${bad.length} · 미확인 ${unknown.length}`);
      for (const x of bad) L.push(`      ✕ ${x.label} (${x.state})`);
    } catch (e) { /* 소스 상태를 못 읽어도 나머지는 유효하다 */ }
    L.push(`화면  ${window.innerWidth}×${window.innerHeight} · DPR ${window.devicePixelRatio} · 열 ${thermal.state}`);
    return L.join('\n');
  };

  let hudTimer = null;
  hudMore.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = hud.classList.toggle('open');
    hudMore.textContent = open ? '▴' : '▾';
    if (hudTimer) { clearInterval(hudTimer); hudTimer = null; }
    if (open) {
      hudText.textContent = diagnostics();
      hudTimer = setInterval(() => { hudText.textContent = diagnostics(); }, 1500);
    }
  });
  hudCopy.addEventListener('click', async () => {
    const t = diagnostics();
    try {
      await navigator.clipboard.writeText(t);
      hudCopy.textContent = '복사됨';
    } catch (err) {
      // 클립보드가 막힌 환경(비보안 컨텍스트 등)에서는 선택이라도 되게 한다
      const r = document.createRange();
      r.selectNodeContents(hudText);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      hudCopy.textContent = '선택됨 — Ctrl+C';
    }
    setTimeout(() => { hudCopy.textContent = '📋 복사'; }, 2000);
  });

  const searchInput = document.getElementById('c-search');
  const searchResults = document.getElementById('search-results');
  // 검색은 나라만이 아니라 도시·공항까지 — 지구본에서 나라 이름만 되는 검색은 반쪽이다.
  // [IATA, 공항명, 도시, 국가코드, 위도, 경도, 고도] 4,037곳 (OurAirports 계열)
  let airports = null;
  let krPlaces = null;   // 한국 시군구 228 (한글 검색 — 공항 데이터는 영문뿐이다)
  const loadAirports = () => {
    if (airports) return Promise.resolve(airports);
    return Promise.all([
      fetch('./data/airports.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('./data/kr-places.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([rows, kr]) => {
      airports = Array.isArray(rows) ? rows : [];
      krPlaces = (kr && kr.items) || [];
      return airports;
    });
  };
  searchInput.addEventListener('focus', loadAirports);

  // 구간 전체가 화면에 들어오는 거리 — 보이는 지구의 반각을 이분탐색으로 뒤집는다
  const fitDistForHalfDeg = (halfDeg) => {
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    let lo = 1;
    let hi = 60000;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      const got = Math.min(DetailTerrain.arcHalfDeg(vHalf, mid), DetailTerrain.arcHalfDeg(hHalf, mid));
      if (got < halfDeg) lo = mid; else hi = mid;
    }
    return 1 + hi / 6371;
  };

  // 항로를 지구에 얹고, 공항 날씨를 받아 카드로 보여준다.
  const showRoute = async (stops) => {
    if (map.active) map.exit();
    if (local.active) local.close(true);
    flightRoute.show(stops);
    // 구간 중심으로 날아가되, 가장 먼 기착지까지 들어오는 거리를 잡는다
    const c = new THREE.Vector3();
    const vs = stops.map((st) => {
      const v = new THREE.Vector3(
        Math.cos((st.lat * Math.PI) / 180) * Math.sin((st.lon * Math.PI) / 180),
        Math.sin((st.lat * Math.PI) / 180),
        Math.cos((st.lat * Math.PI) / 180) * Math.cos((st.lon * Math.PI) / 180),
      );
      c.add(v);
      return v;
    });
    // 대권은 두 기착지 사이에서 북(또는 남)으로 부푼다. 기착지만 보고 화면을 잡으면
    // 정작 선이 화면 밖으로 빠져나간다 → 구간 위의 점도 같이 넣어 잡는다.
    // (a와 b의 어떤 선형결합이든 정규화하면 그 대권 위에 있다)
    const pts = [...vs];
    for (let i = 1; i < vs.length; i += 1) {
      for (const [wa, wb] of [[3, 1], [1, 1], [1, 3]]) {
        const m = vs[i - 1].clone().multiplyScalar(wa).addScaledVector(vs[i], wb);
        if (m.lengthSq() > 1e-9) { m.normalize(); pts.push(m); c.add(m); }
      }
    }
    c.normalize();
    let maxDeg = 0;
    for (const v of pts) {
      maxDeg = Math.max(maxDeg, (Math.acos(Math.min(1, Math.max(-1, v.dot(c)))) * 180) / Math.PI);
    }
    const cLat = (Math.asin(Math.min(1, Math.max(-1, c.y))) * 180) / Math.PI;
    const cLon = (Math.atan2(c.x, c.z) * 180) / Math.PI;
    let ty = THREE.MathUtils.degToRad(cLon);
    ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
    orbit.targetYaw = ty;
    orbit.targetPitch = THREE.MathUtils.degToRad(cLat);
    orbit.targetDist = fitDistForHalfDeg(Math.max(2, maxDeg * 1.25));
    orbit.glide = 1.4;
    orbit.autoRotate = false;

    const legs = FlightRoute.computeLegs(stops, Date.now());
    showNote('항로', '<div class="card"><div class="card-b">공항 날씨 불러오는 중…</div></div>', 'DERIVED');
    const lastArr = legs.length ? legs[legs.length - 1].arr : Date.now();
    const days = Math.ceil((lastArr - Date.now()) / 86400000) + 1;
    const raw = await Promise.all(stops.map((st) => FlightRoute.weatherAt(st, days)));
    const wx = stops.map((st, i) => ({
      now: FlightRoute.current(raw[i]),
      at: i > 0 ? FlightRoute.hourAt(raw[i], legs[i - 1].arr) : null,
    }));
    showNote('항로', routeCardHtml(stops, legs, wx, dataBadge), 'DERIVED');
  };

  const renderHits = (q) => {
    searchResults.innerHTML = '';
    if (!q) return;
    // 두 곳 이상을 적었으면 지점 검색이 아니라 '구간'으로 읽는다.
    // 예: "인천 > 나리타 > 로스앤젤레스" · "ICN NRT LAX"
    if (airports) {
      const rt = FlightRoute.parse(searchInput.value.trim(), airports);
      if (rt) {
        const d = document.createElement('div');
        d.className = 'search-hit';
        if (rt.error) {
          d.style.color = 'var(--text-dim)';
          d.textContent = `항로 — '${rt.error}' 공항을 찾지 못했습니다`;
          searchResults.appendChild(d);
          return;
        }
        d.textContent = `✈ 항로 ${rt.stops.map((st) => st.iata).join(' → ')} — 경로와 공항 날씨`;
        d.addEventListener('click', () => {
          searchResults.innerHTML = '';
          searchInput.value = '';
          closeDrawers();
          showRoute(rt.stops);
        });
        searchResults.appendChild(d);
        return;
      }
    }
    const hits = [];
    if (focus.data) {
      for (const f of focus.data.features) {
        if (f.nameKo.includes(q) || f.nameEn.toLowerCase().includes(q)) {
          hits.push({ kind: 'country', f, label: `${f.nameKo} · ${f.nameEn} (${f.code3})` });
          if (hits.length >= 5) break;
        }
      }
    }
    if (krPlaces && hits.length < 8) {
      for (const [ko, en, region, lat, lon] of krPlaces) {
        // 시·도 이름으로도 찾게 한다 — '인천'을 치면 인천광역시의 구들이 나와야 한다
        if (ko.includes(q) || (region || '').includes(q) || (en || '').toLowerCase().includes(q)) {
          hits.push({ kind: 'place', lat, lon, label: `${ko} · ${region}` });
          if (hits.length >= 8) break;
        }
      }
    }
    if (airports && hits.length < 8) {
      const up = q.toUpperCase();
      for (const a of airports) {
        const [iata, name, city, cc, lat, lon] = a;
        if (lat == null || lon == null) continue;
        if (iata === up || (city || '').toLowerCase().includes(q) || (name || '').toLowerCase().includes(q)) {
          hits.push({ kind: 'airport', lat, lon, label: `✈ ${city || name} · ${name} (${iata}, ${cc})` });
          if (hits.length >= 8) break;
        }
      }
    }
    for (const h of hits) {
      const d = document.createElement('div');
      d.className = 'search-hit';
      d.textContent = h.label;
      d.addEventListener('click', () => {
        searchResults.innerHTML = '';
        searchInput.value = '';
        closeDrawers();
        if (h.kind === 'country') { focus.clear(); focus.select(h.f); return; }
        // 공항·시군구는 그 지점 상공으로 — 국가 포커스는 건드리지 않는다
        let ty = THREE.MathUtils.degToRad(h.lon);
        ty += Math.round((orbit.yaw - ty) / (2 * Math.PI)) * 2 * Math.PI;
        orbit.targetYaw = ty;
        orbit.targetPitch = THREE.MathUtils.degToRad(h.lat);
        orbit.targetDist = 1 + (h.kind === 'place' ? 300 : 420) / 6371;
        orbit.glide = 1.2;
        orbit.autoRotate = false;
      });
      searchResults.appendChild(d);
    }
    if (!hits.length) {
      const d = document.createElement('div');
      d.className = 'search-hit';
      d.style.color = 'var(--text-dim)';
      d.textContent = '일치하는 나라·시군구·도시·공항이 없습니다';
      searchResults.appendChild(d);
    }
  };
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q && !airports) { loadAirports().then(() => renderHits(searchInput.value.trim().toLowerCase())); }
    renderHits(q);
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
  // ---------- 위성 베이스 전환 (지표 재질만 교체 — 지오메트리는 항상 실고도) ----------
  // v5.3 NO PHOTO-AS-WORLD: 위성 이미지는 색이지 세계가 아니다. 지형 입체는 Terrarium이 만든다.
  const BASE_STYLES = [
    { id: 'ne2', ko: '자연 지형 (기본)', src: 'Natural Earth II', badge: 'LIVE',
      note: '지형 채색 기본 베이스 — 계절·구름 없음' },
    { id: 'bluemarble', ko: '블루마블 (지형·수심)', src: 'NASA GIBS BlueMarble', badge: 'OBSERVED',
      layer: 'BlueMarble_ShadedRelief_Bathymetry', date: '2004-01-01', res: '500m', ext: 'jpeg',
      note: 'NASA 블루마블 음영기복+수심 합성본 (정적 기준영상)' },
    { id: 'truecolor', ko: '오늘의 지구 (실촬영)', src: 'VIIRS True Color', badge: 'OBSERVED',
      layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', res: '250m', ext: 'jpeg', daily: true,
      note: '어제자 실제 위성 촬영 — 구름·연무·황사가 그대로 보입니다 (밤면은 촬영 불가라 검음)' },
    { id: 'night', ko: '밤의 불빛', src: 'VIIRS City Lights', badge: 'OBSERVED',
      layer: 'VIIRS_CityLights_2012', date: '2012-01-01', res: '500m', ext: 'jpeg',
      note: '2012년 야간광 합성본 — 현재 시각의 불빛이 아닙니다' },
  ];
  let baseStyle = 'ne2';
  const baseCache = { ne2: baseTex };

  async function loadGibsBase(st) {
    const date = st.daily ? new Date(Date.now() - 36 * 3600000).toISOString().slice(0, 10) : st.date;
    const cols = 10;
    const rows = 5;
    const can = document.createElement('canvas');
    can.width = cols * 512;
    can.height = rows * 512;
    const ctx = can.getContext('2d');
    ctx.fillStyle = '#04070c';
    ctx.fillRect(0, 0, can.width, can.height);
    let ok = 0;
    await Promise.all(Array.from({ length: cols * rows }, (_, i) => new Promise((res) => {
      const c = i % cols;
      const r = (i / cols) | 0;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { ctx.drawImage(img, c * 512, r * 512); ok += 1; res(); };
      img.onerror = () => res();
      img.src = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${st.layer}/default/${date}/${st.res}/3/${r}/${c}.jpg`;
    })));
    if (ok < 25) throw new Error(`GIBS 타일 ${ok}/50`);
    const tex = new THREE.CanvasTexture(can);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return { tex, date, ok };
  }

  async function setBaseStyle(id, note) {
    const st = BASE_STYLES.find((s) => s.id === id);
    if (!st) return;
    if (baseCache[id]) {
      baseStyle = id;
      uniforms.uBaseMap.value = baseCache[id];
      uniforms.uHasBase.value = 1;
      shell.refreshFlyout();
      if (note) note(st.ko, `${st.note}<br/>출처 ${st.src}`, st.badge);
      return;
    }
    if (note) note(st.ko, '위성 베이스 로딩 중…', 'LIVE');
    try {
      const { tex, date, ok } = await loadGibsBase(st);
      baseCache[id] = tex;
      baseStyle = id;
      uniforms.uBaseMap.value = tex;
      uniforms.uHasBase.value = 1;
      shell.refreshFlyout();
      if (note) {
        note(st.ko, `${st.note}<br/>출처 ${st.src} · 기준 ${date} · 타일 ${ok}/50<br/>`
          + '위성 이미지는 표면 <b>재질</b>일 뿐이며 입체는 항상 실측 고도(AWS Terrarium)가 만듭니다.', st.badge);
      }
    } catch (e) {
      console.warn('[earthus-base]', e);
      if (note) note(st.ko, `위성 베이스를 받지 못했습니다 — 기존 베이스를 유지합니다.<br/>${String((e && e.message) || e)}`, 'UNAVAILABLE');
    }
  }
  window.__earthusBase = { list: BASE_STYLES, get: () => baseStyle, set: setBaseStyle };

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
      // 손으로 고른 것만 기억한다. 시간 스크럽의 자동 전환은 기억하지 않는다 —
      // 그건 사용자의 선택이 아니라 그 시각을 보여주기 위한 임시 전환이다.
      try { localStorage.setItem(CLOUD_PREF, btn.dataset.cloud); } catch (e) { /* 저장소가 막힌 환경 */ }
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

  // ---------------------------------------------------------------------------
  // 딥링크: 지금 보고 있는 화면을 주소로 적고, 주소로 그 화면을 되살린다.
  // 이게 없으면 어떤 화면도 남에게 보여줄 수 없고 북마크도 무의미하다.
  // 형식: #v=1&at=위도,경도,거리,틸트&base=ne2&cloud=gk2a&live=a,b&q=hdp&pop=KOR&c=KOR
  // ---------------------------------------------------------------------------
  const linkState = () => {
    const p = [];
    const lat = THREE.MathUtils.radToDeg(orbit.targetPitch);
    const lon = ((THREE.MathUtils.radToDeg(orbit.targetYaw) + 540) % 360) - 180;
    p.push(`at=${lat.toFixed(3)},${lon.toFixed(3)},${orbit.targetDist.toFixed(4)},${orbit.targetTilt.toFixed(3)}`);
    if (baseStyle && baseStyle !== 'ne2') p.push(`base=${baseStyle}`);
    if (clouds.mode) p.push(`cloud=${clouds.mode}`);
    const live = liveLayers.activeIds();
    if (live.length) p.push(`live=${live.join(',')}`);
    const q = `${quakeHistory.on ? 'h' : ''}${quakeHistory.depthMode ? 'd' : ''}${quakeHistory.platesOn ? 'p' : ''}`;
    if (q) p.push(`q=${q}`);
    if (popSculpt.on && popSculpt.iso3) p.push(`pop=${popSculpt.iso3}`);
    if (focus.selected && focus.selected.code3) p.push(`c=${focus.selected.code3}`);
    return `#v=1&${p.join('&')}`;
  };

  let lastLink = '';
  const writeLink = () => {
    const h = linkState();
    if (h === lastLink) return;
    lastLink = h;
    // replaceState — 뒤로가기 기록을 카메라 움직임으로 더럽히지 않는다
    history.replaceState(null, '', h);
  };
  setInterval(writeLink, 1200);

  const parseLink = () => {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h) return null;
    const o = {};
    for (const kv of h.split('&')) {
      const i = kv.indexOf('=');
      if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    }
    return o.v ? o : null;
  };

  const applyLink = async (o) => {
    if (!o) return;
    if (o.base && o.base !== 'ne2') { try { await setBaseStyle(o.base); } catch (e) { /* 실패해도 나머지는 복원 */ } }
    if (o.cloud && o.cloud !== clouds.mode) { try { markCloudBtn(o.cloud); await clouds.set(o.cloud); } catch (e) { /* 위와 같음 */ } }
    if (o.live) {
      for (const id of o.live.split(',').filter(Boolean)) {
        try { await liveLayers.toggle(id); } catch (e) { /* 한 레이어가 죽어도 나머지는 살린다 */ }
      }
    }
    if (o.q) {
      try {
        if (o.q.includes('h') || o.q.includes('d')) await quakeHistory.toggle();
        if (o.q.includes('d')) await quakeHistory.setDepthMode(true);
        if (o.q.includes('p')) await quakeHistory.togglePlates();
      } catch (e) { /* 위와 같음 */ }
    }
    if (o.pop) { try { await popSculpt.toggle(o.pop); } catch (e) { /* 위와 같음 */ } }
    if (o.c && focus.data) {
      const f = (focus.data.features || []).find((x) => (x.properties || x).code3 === o.c);
      if (f) focus.select(f);
    }
    // 카메라는 맨 마지막에 — 국가 선택·깊이 모드가 저마다 카메라를 옮기기 때문에
    // 먼저 적용하면 링크에 적힌 시점이 덮어써진다.
    if (o.at) {
      const [la, lo, d, ti] = o.at.split(',').map(Number);
      if (Number.isFinite(la)) orbit.targetPitch = orbit.pitch = THREE.MathUtils.degToRad(la);
      if (Number.isFinite(lo)) orbit.targetYaw = orbit.yaw = THREE.MathUtils.degToRad(lo);
      if (Number.isFinite(d)) orbit.targetDist = orbit.dist = d;
      if (Number.isFinite(ti)) orbit.targetTilt = orbit.tilt = ti;
      orbit.glide = 0;
      orbit.autoRotate = false;   // 링크로 온 사람에게 그 화면을 그대로 보여준다
    }
    shell.refreshFlyout();
    shell.renderIntel();
  };

  // ---------------------------------------------------------------------------
  // 공유: 지금 화면의 링크 복사 + 지구 그림 저장
  // ---------------------------------------------------------------------------
  const shareNow = async () => {
    writeLink();
    const url = location.href;
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (e) { /* 권한 없으면 주소창에 그대로 남아 있다 */ }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'EARTHUS — 지금 지구', url });
        return { shared: true };
      } catch (e) { /* 사용자가 취소한 경우 */ }
    }
    return { copied, url };
  };

  const captureImage = () => {
    renderer.render(scene, camera);   // preserveDrawingBuffer 없이도 같은 틱이면 읽힌다
    const src = renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const cx = c.getContext('2d');
    cx.drawImage(src, 0, 0);
    // 워터마크 — 어디서 만든 그림인지, 언제인지 남긴다
    const s = Math.max(1, c.width / 1200);
    cx.font = `${Math.round(15 * s)}px ui-monospace, Consolas, monospace`;
    cx.textBaseline = 'bottom';
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const txt = `EARTHUS · ${stamp} UTC · earthus.net/v2`;
    const w = cx.measureText(txt).width;
    cx.fillStyle = 'rgba(3,6,8,0.55)';
    cx.fillRect(c.width - w - 34 * s, c.height - 38 * s, w + 22 * s, 28 * s);
    cx.fillStyle = 'rgba(244,238,233,0.9)';
    cx.fillText(txt, c.width - w - 23 * s, c.height - 17 * s);
    const a = document.createElement('a');
    a.download = `earthus-${stamp.replace(/[: ]/g, '-')}.jpg`;
    a.href = c.toDataURL('image/jpeg', 0.92);
    a.click();
  };

  // 개발 콘솔용 핸들 (예: __earthus.goTo(28, 87, 1.35) → 히말라야)
  window.__earthus = {
    linkState,
    applyLink,
    parseLink,
    shareNow,
    captureImage,
    orbit,
    uniforms,
    detail,
    map,
    clouds,
    focus,
    liveLayers,
    feed,
    shell,
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
    thermal.tick(now); // 실측 fps → 정본 THERMAL_STATE (2초 창 평균 · 히스테리시스)
    if (map.active) {
      return; // 지도 모드: 3D 렌더 정지 (지도가 자체적으로 DOM 렌더)
    }
    if (sim.active || local.active || solar.active || sky.active) {
      return; // 시뮬레이션/지역 3D/태양계/사진관 모드: 자체 루프가 렌더
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
    atmoUniforms.uSunDir.value.copy(sun);

    const altKm = Math.max(orbit.dist - 1, 0) * 6371;

    // 국가 내부 줌 → 위성지도로 전환 (PD 지시: 지역 3D 평면은 답답하고 느렸다).
    // 지역 3D(고도 기복)는 지도 안의 '3D 지형' 버튼으로 들어간다.
    // 데이터 조각이 켜져 있으면 지도로 넘기지 않는다 — 도시 상공에서 기둥을 옆면으로 봐야 한다.
    // 침수 폴리곤도 같다 — 시군구 규모(해운대 약 9km)라 250km에서 튕기면 아예 볼 수가 없다.
    const closeUp = popSculpt.on || (liveLayers.state('khoaflood').on && liveLayers.floodSelected());
    if (closeUp) {
      orbit.minDist = 1 + 3 / 6371; // 3km까지 내려간다
    } else {
      orbit.minDist = 1.02;
      if (altKm < 250) {
        const latDeg = THREE.MathUtils.radToDeg(orbit.pitch);
        const lonDeg = ((THREE.MathUtils.radToDeg(orbit.yaw) + 540) % 360) - 180;
        orbit.dist = 1 + 320 / 6371; // 복귀 지점: 국가 뷰 높이
        orbit.targetDist = orbit.dist;
        map.show(latDeg, lonDeg, 12);
        return;
      }
    }

    if (detail) detail.update(orbit.pitch, orbit.yaw, altKm, camera);
    satLayer.update(now);
    aethLink.update(now);
    liveLayers.tick(now, altKm);
    flightRoute.tick(now, camera);
    popSculpt.updateLabels(camera);
    popSculpt.updateScale(altKm);
    quakeHistory.tick(dt);
    // 자동회전 체크박스는 실제 상태를 따라간다 — 지구를 만져서 꺼졌는데 켜진 채로 두면 거짓말이 된다
    if (rotateEl && rotateEl.checked !== orbit.autoRotate) rotateEl.checked = orbit.autoRotate;
    seafloor.update(camera, altKm);
    travel.update(camera);
    buildLabelCandidates();
    shell.updateLabels(camera, altKm);
    feed.updateMarkers(camera, altKm, (i) => {
      feed.select(i, orbit);
      shell.openIntel();
      shell.renderIntel();
    });
    clouds.uniforms.uSunDir.value.copy(sun);
    // 강수 색면: 태양만 넘기면 된다. 프레임 바인딩은 setForecastOffset 이 한다.
    if (clouds.precip.mesh.visible) clouds.precip.setSun(sun);
    // 번개 표식: 지금 보는 곳에 맞춰 센 뇌우만 뽑고 번쩍임을 돌린다.
    if (clouds.precipTex && clouds.bolts.points.visible) {
      const vH = (camera.fov * Math.PI) / 360;
      clouds.bolts.build(
        clouds.precipTex,
        1.0 + (9000 / 6371000) * uniforms.uExagger.value,
        altKm,
        THREE.MathUtils.radToDeg(orbit.pitch),
        ((THREE.MathUtils.radToDeg(orbit.yaw) + 180) % 360 + 360) % 360 - 180,
        DetailTerrain.arcHalfDeg(Math.atan(Math.tan(vH) * camera.aspect), altKm),
      );
      clouds.bolts.tick(now);
    }
    cloudVol.update(camera, sun, altKm);
    if (clouds.mesh.visible) {
      if (clouds.reliefOn) {
        // 릴리프 구름: 지표 근처에서 시작해 운정고도(m)만큼 솟는다 (지형 과장의 0.6배).
        // 근접 줌에서는 릴리프를 감쇠 — 메시 해상도(≈1°)가 드러나 각지는 것을 막는다.
        clouds.mesh.scale.setScalar(1.003);
        const reliefFade = THREE.MathUtils.smoothstep(altKm, 900, 3200);
        clouds.uniforms.uReliefK.value = ((uniforms.uExagger.value * 0.6) / 6371000) * reliefFade;
      } else {
        // 평면 셸(예보·정적)은 과장된 최고봉 위에
        clouds.mesh.scale.setScalar(1.004 + (uniforms.uExagger.value * 9000) / 6371000);
        clouds.uniforms.uReliefK.value = 0;
      }
    }
    hudLine.textContent = `고도 ${altKm >= 1000 ? `${(altKm / 1000).toFixed(1)}천` : Math.round(altKm)} km · 과장 ${uniforms.uExagger.value}×`;

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

  // 링크로 들어왔다면 그 화면을 되살린다 (국가 데이터가 준비된 뒤라 선택도 복원된다)
  const incoming = parseLink();
  if (incoming) applyLink(incoming).catch((e) => console.warn('[earthus-three] 링크 복원 실패', e));

  // 접속하면 지구만 뜨고 구름이 없었다 — 매번 손으로 켜야 했다.
  // 지구가 뜬 뒤에 전지구 관측 구름(NOAA GMGSI)을 얹는다.
  // 로딩바 뒤로 미루는 이유: 지형 로딩을 한 프레임도 늦추지 않기 위해서다.
  // 관측을 기본으로 두는 이유: 첫 화면은 '지금의 지구'여야 하고, GMGSI 는 전지구를
  // 덮는다(천리안은 동아시아만 본다). 시간을 밀면 예보로 자동 전환된다.
  const CLOUD_PREF = 'earthus.v2.cloud';
  let cloudPref = null;
  try { cloudPref = localStorage.getItem(CLOUD_PREF); } catch (e) { /* 저장소가 막힌 환경 */ }
  if (!(incoming && incoming.cloud) && cloudPref !== 'off') {
    // 지난번에 고른 것이 있으면 그것을, 없으면 관측을 켠다. 직접 끈 사람에게는 다시 켜지 않는다.
    const want = cloudPref || 'obs';
    setTimeout(() => {
      markCloudBtn(want);
      clouds.set(want)
        .then((ok) => { if (!ok) markCloudBtn('off'); })
        .catch(() => markCloudBtn('off'));
    }, 250);
  }

  // 이미 열린 탭 주소창에 링크를 붙여 넣는 경우 — 같은 문서라 새로고침이 안 되므로 직접 반영한다.
  // 우리가 쓴 주소(replaceState)는 hashchange를 일으키지 않으니 되돌이표가 생기지 않는다.
  window.addEventListener('hashchange', () => {
    const h = location.hash;
    if (h === lastLink) return;
    const o = parseLink();
    if (o) applyLink(o).catch((e) => console.warn('[earthus-three] 링크 반영 실패', e));
  });
}

// 어디서 터지든 사용자가 '무언가 잘못됐다'는 것은 알 수 있어야 한다.
const showFatal = (msg) => {
  const el = document.getElementById('load-err');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
};
window.addEventListener('error', (e) => {
  if (e && e.message) showFatal(`오류가 발생했습니다: ${e.message} — 새로고침해 주세요.`);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  showFatal(`처리되지 않은 오류: ${(r && r.message) || r} — 새로고침해 주세요.`);
});

main().catch((err) => {
  console.error('[earthus-three] fatal:', err);
  const loadErr = document.getElementById('load-err');
  loadErr.style.display = 'block';
  loadErr.textContent = `초기화 실패: ${err.message}`;
});
