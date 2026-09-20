// EARTHUS v2 — 바람 입자 엔진 (DEV-DIRECTIVE 2026-09-20 · W3 의 바닥 부품)
//
// 왜 새로 만드나: v2 의 바람은 관측소마다 선분 하나 위를 입자 2개가 왕복하는 '막대기'였다
// (live-layers.js buildWind). 이류·유선 0건. PD: "바람은 왜 mapped.earth 처럼 윈드 애니메이션이 없어?
// 지역마다 막대기가 나오면 되겠어?" — 이 파일은 전지구 u/v 격자 위를 **흐르는** 입자와 그 꼬리를 그린다.
//
// 이 파일이 하지 않는 것: 프레임을 받아 오지 않는다(프레임 저장소가 setField 로 넣어 준다) ·
// main.js 에 자기를 걸지 않는다 · 색 표를 정하지 않는다(field-scales.js 가 setSpeedColors 로 넣어 준다).
//
// ── 구조 ────────────────────────────────────────────────────────────────
//   순수 계산(DOM·THREE 없음 · node 에서 시험한다)
//     sampleWind      경도 랩 bilinear + 두 프레임 시간 보간          ← v1 windfield.js _bilinear
//     advectLatLon    cos 위도 보정 + 경도 랩 + 극 가드               ← v1 windfield.js _tick
//     stepWind        중점법(RK2) 한 걸음 — 오일러가 아닌 이유는 그 함수 주석
//     spawnInCap      구면 캡 위의 **면적 균일** 분포(위도 균일이 아니다 — 그러면 극에 몰린다)
//     WindParticleSim 입자 상태 + 꼬리 선분 이력(타입 배열만 · 프레임당 객체 생성 0)
//   그리기
//     WindParticles   인스턴스 리본 1 드로우콜. 아래 '꼬리' 참고.
//
// ── 꼬리 = 월드 공간 이력 선분 ──────────────────────────────────────────────
//   v1·mapped.earth 는 2D 캔버스를 매 프레임 살짝 지워 잔상을 남긴다(화면 공간 페이드).
//   v2 는 카메라가 자동으로 돈다(main.js OrbitCam.autoRotate) — 화면 공간 페이드는 지구가 도는 동안
//   꼬리가 옆으로 미끄러진다(v1 은 그래서 카메라가 움직인 프레임을 통째로 지웠다 · windfield.js:29-33).
//   → 꼬리를 **지구 좌표계의 선분**으로 들고 있는다. 지구가 돌아도 꼬리는 지구에 붙어 있다.
//
//   선(LineSegments)이 아니라 **화면 정렬 쿼드(리본)** 를 골랐다. 이유:
//     WebGL 선은 굵기가 1 장치픽셀로 고정이다. DPR 2 인 폰에서 그것은 0.5 CSS px 이고,
//     v1 에서 PD 가 승인한 굵기는 0.9~1.9 CSS px 이었다(windfield.js BUCKETS.w) — 2~4배 가늘다.
//     리본은 굵기를 **CSS px** 로 정하므로 어느 DPR 에서든 같은 굵기다(밀도와 같은 규칙).
//   ⚠️ 이 선택은 이 작업에서 화면으로 재지 못했다(브라우저 금지 조건). 그래서 같은 버퍼·같은 셰이더로
//      1px 선을 그리는 primitive:'line' 을 남겼다 — 생성자 옵션 하나로 폰에서 둘을 나란히 잴 수 있다.
//
//   버퍼 배치 — **슬롯 우선(slot-major) 링** 이다. 인스턴스 하나 = 선분 하나 = float 8개
//     [시작 xyz · 풍속 m/s · 끝 xyz · 수명 페이드]. 인스턴스 번호 = 슬롯 × (지금 입자 수) + 입자.
//     · 모든 입자가 같은 시각에 슬롯을 넘긴다 → 프레임마다 고쳐 쓰는 것은 **머리 슬롯 한 블록**뿐이고
//       그 블록은 메모리에서 이어져 있다 → bufferSubData 한 번.
//     · 꼬리 끝으로 갈수록 옅어지는 알파는 버퍼에 쓰지 않는다 — 정적 속성 aSlot 과 유니폼
//       uHead·uPhase 로 셰이더가 센다. 나이를 버퍼에 쓰면 매 프레임 전 선분을 다시 써야 한다.
//     셈(입자 5,000 · 선분 12):  인스턴스 60,000 · 정점 240,000 · 삼각형 120,000 · 드로우콜 1
//       프레임당 float 쓰기 ≤ 5,000 × 8 = 40,000 · bufferSubData 160,000 B (버퍼 전체 1.92 MB 의 1/12)
//       입자 우선 배치(입자마다 선분이 이어진 배치)로 같은 그림을 그리면 고친 자리가 흩어져
//       매 프레임 전체(1.92 MB)를 올려야 한다 — 초당 58 MB. 폰에서 열이 되는 쪽이다.
//     · 입자 수를 줄이면 인스턴스 수가 준다(geometry.instanceCount = 선분 × 입자). 인스턴스 그리기에서
//       drawRange 에 해당하는 것이 이것이다. 슬롯 블록 폭이 '지금 입자 수'라서, 수가 바뀔 때만
//       GPU 쪽 배열을 CPU 원본에서 다시 채운다(드문 일 — 단계 칩·발열 단계·창 크기).
//   CPU 원본(seg)은 블록 폭이 최대 입자 수로 고정이다. GPU 배열은 언제든 원본에서 다시 만들 수 있다
//   (packInto) — 시험이 '증분 갱신 = 전체 재생성' 을 잠근다.
//
// ── v1 에서 밟은 네 함정(기억 windfield-particle-speed) ─────────────────────────
//   ① 밀도는 CSS 픽셀 기준(particleBudgetFor) — 장치픽셀이면 DPR 2 에 4배가 뿌려진다.
//   ② 줌 정규화(degPerCssPx) — 입자는 도/초로 움직이는데 1°가 몇 픽셀인지는 줌마다 다르다.
//   ③ 색은 구간(WIND_SPEED_BOUNDS_MS) — 연속 램프가 아니다.
//   ④ 풍속 등치선을 그리지 않는다 — 이 파일에는 선을 긋는 코드가 없다.
import * as THREE from '../../vendor/three-r184.module.min.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/* ── 과장 상수 ────────────────────────────────────────────────────────────
   ⚠️ **입자 속도와 꼬리 길이는 방향과 상대 세기를 보이기 위한 과장이다.** 실제 풍속 그대로면
      5 m/s 는 전지구 뷰에서 초당 0.0004 픽셀이라 아예 안 움직인다(v1 windfield.js:120 과 같은 사정).
      범례는 이 문장을 그대로 말해야 한다(지시서 W3 '범례').
   화면 속도(CSS px/s) = 풍속(m/s) × WIND_SCREEN_PX_PER_S_PER_MS — **선형**이다.
      v1 은 (kt/10)^1.15 로 강풍을 더 벌렸다. v2 범례는 '상대 세기'를 약속하므로 비를 그대로 둔다 —
      10 m/s 는 5 m/s 의 정확히 두 배 빠르다. 값 3.5 는 v1 이 화면으로 확정한 기준점
      (5.1 m/s→16 · 10.3→36 · 17.5→66 · 32.9→136 px/s = 3.1~4.1 px/s per m/s)의 가운데다.
   꼬리: 선분 12개 × 0.2초 = 2.4초. v1 의 잔상(FADE 0.98)이 약 3초였다. 5 m/s 꼬리 ≈ 42 CSS px. */
export const WIND_SCREEN_PX_PER_S_PER_MS = 3.5;
export const WIND_TRAIL_SEGMENTS = 12;
export const WIND_TRAIL_SECONDS = 2.4;
export const WIND_TRAIL_GAMMA = 1.6;          // 꼬리 알파 = (1 − 나이)^γ. 클수록 머리만 밝다.

/* 줌 정규화의 천장. 멀리 물러나면 1 px 이 여러 도(°)라 같은 화면 속도가 초당 수십 도가 된다 —
   입자가 3초에 지구를 가로지른다. v1 의 BOOST_MAX 4(= 23 px/° ÷ 4 → 0.174 °/px)를 그대로 가져왔다.
   v2 의 첫 화면(거리 3.0 · 화각 48° · 높이 900)은 0.113 °/px 라 천장 아래다. */
export const WIND_DEG_PER_PX_MAX = 0.174;

/* 밀도 — 입자 하나가 맡는 **CSS 픽셀** 면적. v1 이 1440×900 에서 2,817개로 확정한 값(windfield.js:24). */
export const WIND_DENSITY_CSS_PX = 460;

/* 수명(초). 꼬리가 다 자라는 데 2.4초가 걸린다 — v1 의 3.0초면 다 자라자마자 죽는다.
   입자마다 다르게 줘서 한꺼번에 죽고 한꺼번에 태어나지 않게 한다. */
const LIFE_MIN_S = 3.5;
const LIFE_MAX_S = 7.0;
const FADE_IN_S = 0.5;
const FADE_OUT_S = 0.8;

/* 탭 전환 뒤 첫 프레임처럼 크게 튄 dt 는 잘라낸다 — 순간이동을 막는다(v1 과 같은 0.1초). */
const MAX_DT_S = 0.1;

/* ── 극 가드 ──────────────────────────────────────────────────────────────
   경도 이동 = u / cos(위도). 위도 89.99° 에서 1/cos = 5,730 — 한 걸음에 경도가 몇 바퀴 돈다.
   |위도| > 85° 에서는 1/cos 를 85° 값(11.47)에 묶는다. 그 사이의 동서 이동은 실제보다 작게 그려진다
   (89° 에서 0.2배) — 85° 위는 구면의 0.38% 이고, 폭주보다 느린 쪽이 정직하다.
   |위도| > 89.5° 로 들어가면 다시 뿌린다(격자의 극 행은 경도마다 같은 점이라 u/v 방향이 뜻을 잃는다). */
export const WIND_POLE_CLAMP_LAT = 85;
export const WIND_POLE_RESPAWN_LAT = 89.5;
const COS_FLOOR = Math.cos(WIND_POLE_CLAMP_LAT * D2R);

/* ── 결측 ─────────────────────────────────────────────────────────────────
   인코더(aws/gfs-cloud-forecast/handler.py _wind_bytes)는 결측을 **바이트 128** 로 쓴다.
   128 은 +0.251 m/s 로 풀리고, 정확히 0 m/s 도 128 로 반올림된다 — 풀고 나면 결측과 무풍을
   가를 수 없다. 둘 다 '흐름을 그릴 것이 없는 자리'이므로 0.4 m/s(128·128 = 0.355 m/s 바로 위,
   첫 구간 경계 1 m/s 아래) 미만이면 입자를 다른 곳에 다시 뿌린다.
   (0,0) 바이트는 다르다 — 인코딩의 아래 끝값(−64, −64 m/s)이 둘 동시에 찍힌 것이다. 디코드에 실패한
   이미지를 캔버스에서 읽으면 전부 0 이라, 거르지 않으면 모든 입자가 남서로 90 m/s 로 달린다. */
export const WIND_CALM_MS = 0.4;

/* 선분 하나가 이보다 길면(지구 반지름 배수의 현) 잇지 않는다 — 어떤 이유로든 입자가 튄 프레임의 안전망이다.
   정상 범위의 최댓값은 64 m/s × 3.5 × 0.174 °/px × 0.2 s = 7.8° ≈ 0.136 이다. */
export const WIND_MAX_CHORD = 0.35;

/* 풍속 구간 경계 m/s — PD 정본 8칸(지시서 W1 표 '풍속'). 색 표는 여기서 정하지 않는다. */
export const WIND_SPEED_BOUNDS_MS = Object.freeze([1, 5, 10, 20, 30, 40, 50]);

/* ⚠️ **임시** 색이다. 정본 팔레트는 field-scales.js(작업 A2)가 만들고 setSpeedColors 로 넣는다 —
   색면·범례·입자가 같은 표를 읽어야 한다(지시서 W1-6). 그 전까지 화면이 비지 않게 하는 값이고,
   v1 입자 색(얼음빛 → 따뜻한 빛 · windfield.js BUCKETS)을 8칸으로 늘린 것이다. */
export const WIND_SPEED_COLORS_TEMP = Object.freeze([
  '#7fa6cc', '#96c4ec', '#bee0f8', '#fffae2', '#ffe28c', '#ffbe60', '#ff8a5c', '#ff5c8a',
]);
/* 구간별 알파·굵기(CSS px) — v1 BUCKETS 의 a·w 를 8칸으로. 약한 바람은 옅고 가늘게, 강풍이 위에 읽히게. */
const BAND_ALPHA = Object.freeze([0.30, 0.48, 0.66, 0.82, 0.94, 1.0, 1.0, 1.0]);
const BAND_WIDTH_CSS = Object.freeze([1.0, 1.1, 1.3, 1.5, 1.7, 1.9, 2.0, 2.0]);

/** 풍속 → 구간 번호(0~7). 셰이더의 구간 찾기와 같은 규칙이다: 경계 **이상**이면 다음 칸. */
export function windSpeedBand(ms, bounds = WIND_SPEED_BOUNDS_MS) {
  let b = 0;
  for (let i = 0; i < bounds.length; i += 1) if (ms >= bounds[i]) b = i + 1;
  return b;
}

/** 화면 크기 → 입자 예산. ⚠️ **CSS 픽셀**로 센다 — 장치픽셀로 세면 DPR 2 화면에 4배가 뿌려진다(v1 09-08). */
export function particleBudgetFor(widthCss, heightCss, densityCssPx = WIND_DENSITY_CSS_PX) {
  if (!(widthCss > 0) || !(heightCss > 0)) return 0;
  return Math.round((widthCss * heightCss) / densityCssPx);
}

/** 예산 × 단계. 단계 칩은 고정 숫자가 아니라 '기기 예산의 1/3 · 2/3 · 전부' 다(지시서 W3). */
export function particleCountFor(budget, intensity, maxParticles = Infinity) {
  const k = intensity === 1 ? 1 : intensity === 2 ? 2 : 3;
  const full = Math.min(budget, maxParticles);
  if (!(full > 0)) return 0;
  return Math.floor((full * k) / 3);
}

/** 카메라 바로 아래(천저)에서 CSS 1px 이 지표의 몇 도인가 — 줌 정규화의 유일한 입력.
 *  ⚠️ 천저에서 잰다. 시야 한가운데는 지평선이 보이는 높이에서 지평선 근처로 가고, 거기서 1°가
 *     찌그러져 배율이 반대로 튄다(v1 09-08 실측 · windfield.js _measurePxPerDeg).
 *  main.js OrbitCam.dragSpeed 와 같은 식이다: 2·tan(화각/2)·(거리 − 반지름) / 화면 높이. */
export function degPerCssPx(camDist, radius, fovDeg, heightCss) {
  const alt = Math.max(camDist - radius, radius * 1e-4);
  const v = (2 * Math.tan((fovDeg * D2R) / 2) * alt) / (radius * Math.max(heightCss, 1)) * R2D;
  return Math.min(WIND_DEG_PER_PX_MAX, Math.max(1e-6, v));
}

/** 보이는 구면 캡의 반각(라디안) — 입자를 이 안에만 뿌린다.
 *  지평선(acos(R/d))과 시야 원뿔(대각 반화각 α 의 광선이 구와 만나는 중심각 asin(d·sinα/R) − α) 중 작은 쪽.
 *  줌하면 캡이 좁아지고 입자 수는 그대로라 **화면 픽셀당 밀도가 유지된다.**
 *  tilted 면(카메라가 천저를 안 본다) 시야가 천저 둘레로 대칭이 아니다 — 보이는 것 전부를 품는 지평선 캡을 쓴다. */
export function visibleCapAngle(camDist, radius, fovDeg, aspect, tilted = false) {
  const d = Math.max(camDist / radius, 1.0001);
  const horizon = Math.acos(1 / d);
  if (tilted) return horizon;
  const a = Math.atan(Math.tan((fovDeg * D2R) / 2) * Math.sqrt(1 + aspect * aspect));
  const s = d * Math.sin(a);
  if (s >= 1) return horizon;
  return Math.min(horizon, (Math.asin(s) - a) * 1.08);   // 8% 여유 — 화면 모서리에 빈 띠가 생기지 않게
}

/** 구면 캡 위의 면적 균일 점. axis 는 단위 벡터, cosCap 은 캡 반각의 코사인(−1 이면 구 전체).
 *  ⚠️ 위도·경도를 각각 균일하게 뽑으면 극에 몰린다(위도대 면적은 cos 위도에 비례한다).
 *     cos(중심각)을 [cosCap, 1] 에서 균일하게 뽑는 것이 면적 균일이다(아르키메데스의 모자 상자 정리).
 *  좌표 규약은 v2 전체와 같다: x = cos위도·sin경도 · y = sin위도 · z = cos위도·cos경도 (live-layers.js llToV3). */
export function spawnInCap(random, ax, ay, az, cosCap, out) {
  const cosT = 1 - random() * (1 - cosCap);
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = 2 * Math.PI * random();
  // axis 에 수직인 두 축. 도우미 축은 axis 와 나란하지 않은 쪽을 고른다.
  let hx = 0; let hy = 1; let hz = 0;
  if (Math.abs(ay) > 0.9) { hx = 1; hy = 0; }
  let e1x = hy * az - hz * ay; let e1y = hz * ax - hx * az; let e1z = hx * ay - hy * ax;
  const n = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z) || 1;
  e1x /= n; e1y /= n; e1z /= n;
  const e2x = ay * e1z - az * e1y; const e2y = az * e1x - ax * e1z; const e2z = ax * e1y - ay * e1x;
  const c = Math.cos(phi) * sinT; const s = Math.sin(phi) * sinT;
  const x = ax * cosT + e1x * c + e2x * s;
  const y = ay * cosT + e1y * c + e2y * s;
  const z = az * cosT + e1z * c + e2z * s;
  out.x = x; out.y = y; out.z = z;
  out.lat = Math.asin(Math.max(-1, Math.min(1, y))) * R2D;
  out.lon = Math.atan2(x, z) * R2D;
  return out;
}

/** 바람 격자 하나를 만든다(검증 포함). 프레임 저장소와 묶이지 않는다 — 바이트 배열과 디코드 상수만 받는다.
 *    { w, h, dataA, dataB?, mix?, decode:{ scale, offset }, grid?:{ lon0, dLon, lat0, dLat } }
 *  dataA·dataB 는 Uint8Array | Uint8ClampedArray, RG(2) · RGB(3) · RGBA(4) — 길이로 가린다. u = R · v = G.
 *    (RG(2) 는 2026-09-20 W3 배선 때 더했다 — 프레임 저장소의 CPU 사본이 쓰는 채널만 남긴 2채널이라 3·4 만 받으면 던진다.)
 *  grid 를 안 주면 GFS 필드 프레임의 모양이다: 행 0 = 북위 90 · 열 0 = 서경 180 (매니페스트 grid 와 같은 키).
 *  ⚠️ 경도로 한 바퀴 도는 전지구 격자만 받는다. 지역 격자는 랩 보간이 틀린 값을 만든다. */
export function createWindField(spec) {
  if (!spec) throw new TypeError('wind field spec is required');
  const { w, h, dataA, dataB = null } = spec;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2) {
    throw new TypeError('wind field needs integer w,h >= 2');
  }
  const px = w * h;
  // 2 = 프레임 저장소의 CPU 사본(gfs-frames.js compactPixels — 매니페스트가 말한 채널 R·G 만 남긴다). 사본을 3채널로
  // 다시 부풀리면 키프레임마다 780 KB 를 복사한다. sampleWind 는 어느 stride 든 [i]=u · [i+1]=v 로 읽는다.
  const n = dataA ? dataA.length : 0;
  const stride = n === px * 4 ? 4 : n === px * 3 ? 3 : n === px * 2 ? 2 : 0;
  if (!stride) throw new TypeError('dataA length must be w*h*2 (RG), w*h*3 (RGB) or w*h*4 (RGBA)');
  if (dataB && dataB.length !== dataA.length) throw new TypeError('dataB must match dataA length');
  const decode = spec.decode || {};
  if (typeof decode.scale !== 'number' || typeof decode.offset !== 'number') {
    throw new TypeError('decode {scale, offset} is required — take it from the manifest, do not assume it');
  }
  const g = spec.grid || {};
  const lon0 = g.lon0 ?? -180;
  const dLon = g.dLon ?? 360 / w;
  const lat0 = g.lat0 ?? 90;
  const dLat = g.dLat ?? -180 / (h - 1);
  if (Math.abs(Math.abs(w * dLon) - 360) > 1e-6) throw new TypeError('wind field must wrap 360° in longitude');
  return {
    w, h, stride, dataA, dataB, lon0, dLon, lat0, dLat,
    scale: decode.scale, offset: decode.offset,
    mix: clamp01(spec.mix),
  };
}

const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);

/** (위도, 경도)의 u/v m/s — 경도 랩 bilinear + 두 프레임 시간 보간. 없으면 null.
 *  ⚠️ 입자마다 매 걸음 두 번 불린다. 결과는 호출자가 준 out 에 쓴다 — 객체를 만들면 5,000입자 × 30fps 에서
 *     초당 30만 개의 짧은 객체가 생긴다(v1 이 09-08 에 같은 이유로 고쳤다 · windfield.js:272-274).
 *  바이트를 먼저 보간하고 디코드는 한 번만 한다 — 디코드가 선형이라 순서를 바꿔도 값이 같다.
 *  ⚠️ 행 0 이 **북쪽**이다(dLat < 0). v1 격자는 남쪽부터였다 — 식을 그대로 옮기면 남북이 뒤집힌다. */
export function sampleWind(f, lat, lon, out) {
  if (!f || !(lat >= -90 && lat <= 90) || !(lon > -1e7 && lon < 1e7)) return null;
  const w = f.w; const h = f.h; const st = f.stride;
  let fx = (lon - f.lon0) / f.dLon;
  fx -= Math.floor(fx / w) * w;                 // 경도 랩 → [0, w)
  if (!(fx < w)) fx = 0;                        // 부동소수 끝자리
  let fy = (lat - f.lat0) / f.dLat;
  if (fy < 0) fy = 0; else if (fy > h - 1) fy = h - 1;
  const x0 = Math.floor(fx); const y0 = Math.floor(fy);
  const x1 = x0 + 1 === w ? 0 : x0 + 1;         // 마지막 열(179.5E)의 이웃은 첫 열(180W)이다
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const tx = fx - x0; const ty = fy - y0;
  const w00 = (1 - tx) * (1 - ty); const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty; const w11 = tx * ty;
  const i00 = (y0 * w + x0) * st; const i10 = (y0 * w + x1) * st;
  const i01 = (y1 * w + x0) * st; const i11 = (y1 * w + x1) * st;

  const A = f.dataA;
  const a0 = A[i00]; const a1 = A[i10]; const a2 = A[i01]; const a3 = A[i11];
  const b0 = A[i00 + 1]; const b1 = A[i10 + 1]; const b2 = A[i01 + 1]; const b3 = A[i11 + 1];
  // 빈 칸(위 '결측' 주석). 네 귀 중 하나라도 비었으면 버린다 — 빈 칸과 섞어 보간하면 0 과 실제 값의
  // 중간, 곧 없는 바람이 나온다(시험에서 10 m/s 장의 가장자리가 12.4 m/s 남서풍이 됐다).
  if ((a0 | b0) === 0 || (a1 | b1) === 0 || (a2 | b2) === 0 || (a3 | b3) === 0) return null;
  let ub = a0 * w00 + a1 * w10 + a2 * w01 + a3 * w11;
  let vb = b0 * w00 + b1 * w10 + b2 * w01 + b3 * w11;

  const m = f.mix;
  const B = f.dataB;
  if (B && m > 0) {
    const c0 = B[i00]; const c1 = B[i10]; const c2 = B[i01]; const c3 = B[i11];
    const d0 = B[i00 + 1]; const d1 = B[i10 + 1]; const d2 = B[i01 + 1]; const d3 = B[i11 + 1];
    // 뒤 프레임이 비었으면 앞 프레임으로 대신 그리지 않는다 — 그 시각의 바람이라고 말할 수 없다.
    if ((c0 | d0) === 0 || (c1 | d1) === 0 || (c2 | d2) === 0 || (c3 | d3) === 0) return null;
    ub += (c0 * w00 + c1 * w10 + c2 * w01 + c3 * w11 - ub) * m;
    vb += (d0 * w00 + d1 * w10 + d2 * w01 + d3 * w11 - vb) * m;
  }
  const u = ub * f.scale + f.offset;
  const v = vb * f.scale + f.offset;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  out.u = u; out.v = v;
  return out;
}

/** 위경도 한 걸음. k = (m/s 당 움직일 도) — 호출자가 과장·줌·dt 를 곱해 넣는다.
 *  metricLat: 1/cos 를 잴 위도(중점법에서 중점 위도를 넣는다). out = { lat, lon, wrapped, pole }.
 *  경도는 [−180, 180) 로 접는다. 접힌 걸음에는 wrapped = true — 꼬리는 월드 좌표로 들고 있어
 *  접힘이 선분 길이에 영향을 주지 않지만(179.9E→179.9W 는 3D 에서 짧은 현이다), 위경도로 선을 긋는
 *  호출자가 생기면 이 표시를 봐야 한다. */
export function advectLatLon(lat, lon, u, v, k, out, metricLat = lat) {
  const c = Math.max(COS_FLOOR, Math.cos(metricLat * D2R));
  let nlat = lat + v * k;
  let nlon = lon + (u * k) / c;
  out.pole = nlat > WIND_POLE_RESPAWN_LAT || nlat < -WIND_POLE_RESPAWN_LAT;
  if (nlat > 90) nlat = 90; else if (nlat < -90) nlat = -90;
  const wrapped = nlon >= 180 || nlon < -180;
  if (wrapped) {
    nlon -= Math.floor((nlon + 180) / 360) * 360;
    if (!(nlon < 180)) nlon = -180;
  }
  out.lat = nlat; out.lon = nlon; out.wrapped = wrapped;
  return out;
}

const _tmpWind = { u: 0, v: 0 };

/** 입자 한 걸음 — **중점법(RK2)**. out = { lat, lon, u, v, speed, wrapped, pole }, 자료가 없으면 null.
 *
 *  v1 은 오일러였다(그 자리의 바람으로 한 걸음). 5° 격자에는 조인 소용돌이가 없어서 티가 안 났다.
 *  0.5° 에서는 태풍이 담긴다 — 오일러는 원운동에서 걸음마다 반지름을 √(1+Δθ²) 배로 키운다.
 *  전지구 뷰의 30 m/s · 반지름 5° 소용돌이는 한 걸음 Δθ ≈ 0.08 rad, 한 바퀴 78걸음 —
 *  **한 바퀴에 반지름이 +29%** 다. 입자가 저기압에서 바깥으로 풀려 나가 '발산'처럼 읽힌다.
 *  실제 지표 저기압은 수렴한다 — 적분기가 부호를 뒤집는 셈이다. 중점법은 같은 조건에서 ±0.1% 안이다
 *  (node 실측 2026-09-20: 오일러 5.00° → 6.46° · 중점법 4.995°~5.004°. 시험이 둘을 나란히 잰다).
 *  값은 표본 한 번 더(입자당 bilinear 2회 → 4회). */
export function stepWind(f, lat, lon, k, out, tmp = _tmpWind) {
  if (!sampleWind(f, lat, lon, tmp)) return null;
  let u = tmp.u; let v = tmp.v;
  advectLatLon(lat, lon, u, v, k * 0.5, out);
  let mlat = lat;
  // 중점에 자료가 없으면(빈 칸의 가장자리) 이번 걸음만 오일러로 간다.
  if (!out.pole && sampleWind(f, out.lat, out.lon, tmp)) { u = tmp.u; v = tmp.v; mlat = out.lat; }
  advectLatLon(lat, lon, u, v, k, out, mlat);
  out.u = u; out.v = v; out.speed = Math.sqrt(u * u + v * v);
  return out;
}

export const SEG_FLOATS = 8;   // [sx sy sz 풍속 · ex ey ez 페이드]

/** 입자 상태와 꼬리 이력. THREE 를 모른다 — 타입 배열만 고쳐 쓴다.
 *  seg 는 슬롯 우선 · 블록 폭 = max(고정). GPU 쪽 배열(블록 폭 = count)은 packInto 가 만든다. */
export class WindParticleSim {
  constructor({
    maxParticles = 5000, trailSegments = WIND_TRAIL_SEGMENTS, trailSeconds = WIND_TRAIL_SECONDS,
    radius = 1.0012, random = Math.random,
  } = {}) {
    this.max = Math.max(1, Math.floor(maxParticles));
    this.slots = Math.max(2, Math.floor(trailSegments));
    this.interval = trailSeconds / this.slots;
    this.radius = radius;
    this.random = random;
    // 버퍼는 최대치로 **한 번만** 잡는다 — 발열로 예산이 오르내려도 다시 잡지 않는다.
    this.lat = new Float64Array(this.max);
    this.lon = new Float64Array(this.max);
    this.age = new Float32Array(this.max);
    this.life = new Float32Array(this.max);
    this.px = new Float32Array(this.max);
    this.py = new Float32Array(this.max);
    this.pz = new Float32Array(this.max);
    this.seg = new Float32Array(this.max * this.slots * SEG_FLOATS);
    this.field = null;
    this.budget = this.max;
    this.intensity = 3;
    this.view = null;            // { fovDeg, widthCss, heightCss } — 없으면 줌 정규화·밀도를 못 한다
    this.count = 0;
    this.head = 0;
    this.phase = 0;              // 0~1 · 마지막 슬롯 넘김 뒤 흐른 비율(셰이더 uPhase)
    this._since = 0;
    this.frames = 0;
    this.respawnsLast = 0;
    this.floatsLast = 0;
    this.degPerPx = 0;
    this.capAngle = 0;
    this._spawn = { x: 0, y: 0, z: 1, lat: 0, lon: 0 };
    this._step = { lat: 0, lon: 0, u: 0, v: 0, speed: 0, wrapped: false, pole: false };
    this._tmp = { u: 0, v: 0 };
    this._res = { count: 0, head: 0, relayout: false, committed: false };
  }

  setField(spec) { this.field = spec ? createWindField(spec) : null; }
  setMix(m) { if (this.field) this.field.mix = clamp01(m); }
  setBudget(n) { this.budget = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : this.max; }
  setIntensity(k) { this.intensity = k === 1 ? 1 : k === 2 ? 2 : 3; }
  setRadius(r) { if (r > 0) this.radius = r; }
  setView(view) {
    this.view = view && view.heightCss > 0 && view.widthCss > 0 && view.fovDeg > 0
      ? { fovDeg: view.fovDeg, widthCss: view.widthCss, heightCss: view.heightCss } : null;
  }

  /** 지금 그려야 할 입자 수 = min(기기 예산, CSS 픽셀 밀도 예산, 버퍼) × 단계/3. 자료가 없으면 0. */
  targetCount() {
    if (!this.field) return 0;
    const density = this.view ? particleBudgetFor(this.view.widthCss, this.view.heightCss) : Infinity;
    return particleCountFor(Math.min(this.budget, density), this.intensity, this.max);
  }

  _place(p, ax, ay, az, cosCap, desync) {
    const s = spawnInCap(this.random, ax, ay, az, cosCap, this._spawn);
    const r = this.radius;
    this.lat[p] = s.lat; this.lon[p] = s.lon;
    this.px[p] = s.x * r; this.py[p] = s.y * r; this.pz[p] = s.z * r;
    const life = LIFE_MIN_S + this.random() * (LIFE_MAX_S - LIFE_MIN_S);
    this.life[p] = life;
    // 처음 뿌릴 때는 나이를 흩는다 — 안 그러면 전부 같은 순간에 죽는다.
    this.age[p] = desync ? this.random() * life * 0.8 : 0;
  }

  /** 입자 하나를 정한 자리에 놓는다(이력은 그 점으로 접힌다). 시험·디버그용 — 그리기 경로는 쓰지 않는다.
   *  "동풍에서 위도가 유지되는가" 같은 결과 시험은 무작위 자리로는 잴 수 없다. */
  pin(p, lat, lon, lifeSeconds = 1e6) {
    if (!(p >= 0 && p < this.max)) throw new RangeError('particle index out of range');
    const la = lat * D2R; const lo = lon * D2R; const cl = Math.cos(la); const r = this.radius;
    this.lat[p] = lat; this.lon[p] = lon;
    this.px[p] = r * cl * Math.sin(lo); this.py[p] = r * Math.sin(la); this.pz[p] = r * cl * Math.cos(lo);
    this.age[p] = FADE_IN_S; this.life[p] = lifeSeconds;
    for (let s = 0; s < this.slots; s += 1) this._degenerate(s, p);
  }

  _degenerate(slot, p) {
    const o = (slot * this.max + p) * SEG_FLOATS;
    const g = this.seg;
    const x = this.px[p]; const y = this.py[p]; const z = this.pz[p];
    g[o] = x; g[o + 1] = y; g[o + 2] = z; g[o + 3] = 0;
    g[o + 4] = x; g[o + 5] = y; g[o + 6] = z; g[o + 7] = 0;
  }

  /** 한 프레임. cam = 지구 좌표계의 카메라 위치(지구 반지름 단위 — radius 와 같은 단위).
   *  forward(선택) = 카메라가 보는 방향 단위 벡터. 천저에서 2° 넘게 벗어나 있으면 틸트로 본다.
   *  돌려주는 객체는 재사용한다: { count, head, relayout, committed }. */
  step(dt, cam, forward = null) {
    const res = this._res;
    const dtc = dt > 0 ? Math.min(dt, MAX_DT_S) : 0;
    const dist = Math.sqrt(cam.x * cam.x + cam.y * cam.y + cam.z * cam.z) || 1;
    const ax = cam.x / dist; const ay = cam.y / dist; const az = cam.z / dist;
    const v = this.view;
    const fov = v ? v.fovDeg : 48;               // main.js 의 카메라 화각. 뷰를 모르면 밀도 예산은 걸지 않는다.
    const hCss = v ? v.heightCss : 900;
    const aspect = v ? v.widthCss / v.heightCss : 1.6;
    const tilted = !!forward && -(forward.x * ax + forward.y * ay + forward.z * az) < 0.99939;   // cos 2°
    const cap = visibleCapAngle(dist, this.radius, fov, aspect, tilted);
    const cosCap = Math.cos(cap);
    // 캡 밖으로 나간 입자(자동 회전으로 뒤로 넘어간 것 포함)는 앞에 다시 뿌린다. 15% 는 경계에서 깜빡이지 않게 하는 여유.
    const cosOut = Math.cos(Math.min(Math.PI, cap * 1.15 + 0.01));
    this.degPerPx = degPerCssPx(dist, this.radius, fov, hCss);
    this.capAngle = cap;
    const k = WIND_SCREEN_PX_PER_S_PER_MS * this.degPerPx * dtc;   // m/s 당 이번 프레임에 움직일 도

    // 입자 수가 바뀌었나 — 새로 켜지는 입자는 자리와 이력을 처음부터 만든다(오래된 선분이 되살아나지 않게).
    const want = this.targetCount();
    res.relayout = want !== this.count;
    if (want > this.count) {
      for (let p = this.count; p < want; p += 1) {
        this._place(p, ax, ay, az, cosCap, true);
        for (let s = 0; s < this.slots; s += 1) this._degenerate(s, p);
      }
    }
    this.count = want;

    // 슬롯 넘김 — 프레임 수가 아니라 **시간**으로 넘긴다. 프레임마다 넘기면 12칸이 0.4초라 꼬리가 점이 된다
    // (v1 이 09-08 에 밟은 '선이 안 나오고 점만 찍힌다'와 같은 병이다).
    this._since += dtc;
    let committed = false;
    if (this._since >= this.interval) {
      this._since -= this.interval;
      if (this._since >= this.interval) this._since = 0;
      this.head = (this.head + 1) % this.slots;
      committed = true;
    }
    this.phase = this._since / this.interval;
    res.committed = committed;

    const n = this.count; const f = this.field; const g = this.seg; const r = this.radius;
    const st = this._step; const tmp = this._tmp;
    const base = this.head * this.max * SEG_FLOATS;
    const maxChord2 = WIND_MAX_CHORD * WIND_MAX_CHORD * r * r;
    let respawns = 0;
    for (let p = 0; p < n; p += 1) {
      const o = base + p * SEG_FLOATS;
      // 슬롯을 넘긴 프레임: 새 머리 선분은 직전 위치에서 시작한다(지난 머리 선분의 끝과 같은 점).
      if (committed) { g[o] = this.px[p]; g[o + 1] = this.py[p]; g[o + 2] = this.pz[p]; }
      const age = this.age[p] + dtc;
      const life = this.life[p];
      let moved = null;
      if (age <= life) moved = stepWind(f, this.lat[p], this.lon[p], k, st, tmp);
      let x = 0; let y = 0; let z = 0;
      let alive = !!moved && !moved.pole && moved.speed >= WIND_CALM_MS;
      if (alive) {
        const la = moved.lat * D2R; const lo = moved.lon * D2R;
        const cl = Math.cos(la);
        x = cl * Math.sin(lo); y = Math.sin(la); z = cl * Math.cos(lo);
        alive = x * ax + y * ay + z * az >= cosOut;
      }
      if (!alive) {
        // 수명·결측·무풍·극·캡 밖 — 어느 쪽이든 앞쪽 캡에 다시 뿌린다. 옛 자리와 새 자리를 잇지 않는다:
        // 머리 선분을 새 자리의 점으로 만든다. 옛 꼬리는 자기 슬롯에 남아 제 나이대로 사라진다.
        this._place(p, ax, ay, az, cosCap, false);
        this._degenerate(this.head, p);
        respawns += 1;
        continue;
      }
      x *= r; y *= r; z *= r;
      this.lat[p] = moved.lat; this.lon[p] = moved.lon; this.age[p] = age;
      this.px[p] = x; this.py[p] = y; this.pz[p] = z;
      const dx = x - g[o]; const dy = y - g[o + 1]; const dz = z - g[o + 2];
      if (dx * dx + dy * dy + dz * dz > maxChord2) { g[o] = x; g[o + 1] = y; g[o + 2] = z; }   // 안전망(위 상수 주석)
      const fin = age < FADE_IN_S ? age / FADE_IN_S : 1;
      const left = life - age;
      const fout = left < FADE_OUT_S ? left / FADE_OUT_S : 1;
      g[o + 3] = moved.speed;
      g[o + 4] = x; g[o + 5] = y; g[o + 6] = z;
      g[o + 7] = fin * fout;
    }
    this.respawnsLast = respawns;
    this.floatsLast = n * SEG_FLOATS;       // 상한 — 슬롯을 안 넘긴 프레임은 입자당 5개만 실제로 바뀐다
    this.frames += 1;
    res.count = n; res.head = this.head;
    return res;
  }

  /** seg(블록 폭 max) → target(블록 폭 count). GPU 배열을 통째로 다시 만든다. 쓴 float 수를 돌려준다. */
  packInto(target) {
    const n = this.count; const w = SEG_FLOATS;
    for (let s = 0; s < this.slots; s += 1) {
      const from = s * this.max * w;
      target.set(this.seg.subarray(from, from + n * w), s * n * w);
    }
    return this.slots * n * w;
  }
}

const VERT = /* glsl */ `
attribute vec4 aStart;   // xyz 선분 시작(지구 좌표) · w 풍속 m/s
attribute vec4 aEnd;     // xyz 선분 끝 · w 수명 페이드 0~1
attribute float aSlot;
uniform float uHead;
uniform float uSlots;
uniform float uPhase;
uniform float uGamma;
uniform float uLimb;
uniform float uFeather;
uniform vec2 uViewport;      // CSS px — 굵기를 CSS px 로 약속하려면 화면도 CSS px 로 받아야 한다
uniform float uBounds[7];
uniform vec3 uColors[8];
uniform float uBandAlpha[8];
uniform float uBandWidth[8];
uniform float uWhite;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vHalf;

void main() {
  float t = position.x;        // 0 = 시작 · 1 = 끝
  float side = position.y;     // −1 · +1 (선 모드는 0)
  vColor = vec3(1.0); vAlpha = 0.0; vEdge = 0.0; vHalf = 0.5;

  vec4 w0 = modelMatrix * vec4(aStart.xyz, 1.0);
  vec4 w1 = modelMatrix * vec4(aEnd.xyz, 1.0);
  vec4 c0 = projectionMatrix * viewMatrix * w0;
  vec4 c1 = projectionMatrix * viewMatrix * w1;

  // 나이(슬롯 단위). 머리 슬롯의 끝은 '지금'(0), 그 시작은 마지막 넘김 뒤 흐른 만큼(uPhase).
  float s = mod(uHead - aSlot + uSlots, uSlots);
  float age = mix(s + uPhase, max(0.0, s - 1.0 + uPhase), t);
  float tail = pow(clamp(1.0 - age / uSlots, 0.0, 1.0), uGamma);

  // 지구 가장자리에서는 선이 비스듬히 겹쳐 밝은 테가 된다 — 시선과 지표 법선이 수직에 가까우면 지운다.
  // 뒤편(facing < 0)도 여기서 0 이 된다.
  vec3 center = modelMatrix[3].xyz;
  vec3 wp = mix(w0.xyz, w1.xyz, t);
  float facing = dot(normalize(wp - center), normalize(cameraPosition - wp));
  float limb = smoothstep(0.0, uLimb, facing);

  int band = 0;
  for (int i = 0; i < 7; i++) { if (aStart.w >= uBounds[i]) band = i + 1; }
  vColor = mix(uColors[band], vec3(1.0), uWhite);
  vAlpha = tail * aEnd.w * limb * uBandAlpha[band];

  vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * uViewport;
  float len = length(d);
  // 카메라 뒤(w ≤ 0) · 길이 0(막 태어난 입자) · 안 보이는 선분은 화면 밖 한 점으로 접는다.
  if (c0.w <= 0.0 || c1.w <= 0.0 || len < 1e-4 || vAlpha < 0.003) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 perp = vec2(-d.y, d.x) / len;
  vHalf = 0.5 * uBandWidth[band];
  float halfPx = vHalf + uFeather;
  vEdge = side * halfPx;
  vec4 c = mix(c0, c1, t);
  c.xy += perp * (side * halfPx * 2.0) / uViewport * c.w;   // NDC 는 화면을 2 로 본다 → px × 2 / 화면
  gl_Position = c;
}`;

const FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
varying float vEdge;
varying float vHalf;
void main() {
  // 리본 가장자리 1px 을 부드럽게 — 굵기 1px 짜리 쿼드는 그냥 그리면 계단이 선다.
  float cover = clamp(vHalf + 0.5 - abs(vEdge), 0.0, 1.0);
  float a = vAlpha * cover * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

/** 바람 입자 — THREE 물체 하나(드로우콜 1). scene.add(wind.object) 로 건다.
 *
 *  new WindParticles({ maxParticles, trailSegments, trailSeconds, radius, primitive, random, renderOrder, depthTest, speedColors })
 *    radius     색면과 **같은 반지름**을 넣는다(시차 방지 — 지상 10 m 바람이지만 지형 과장은 따르지 않는다).
 *    primitive  'ribbon'(기본 · 굵기 CSS px) | 'line'(1 장치픽셀 선 — 폰에서 나란히 재 보기 위한 것)
 *    depthTest  기본 true(지구 뒤편은 지구가 가린다). ⚠️ 지형 과장이 크면 산이 반지름 위로 솟아 입자를 가린다 —
 *               색면 껍질과 같은 한계다(지시서 W1-5 의 지형 lift 가 풀 일). false 로 두면 뒤편은 uLimb 가 지운다.
 *  ⚠️ 물체는 지구와 같은 좌표계(원점 = 지구 중심, 회전 없음)에 둔다. v2 는 지구가 아니라 카메라가 돈다. */
export class WindParticles {
  constructor({
    maxParticles = 5000, trailSegments = WIND_TRAIL_SEGMENTS, trailSeconds = WIND_TRAIL_SECONDS,
    radius = 1.0012, primitive = 'ribbon', random = Math.random,
    renderOrder = 4, depthTest = true, speedColors = WIND_SPEED_COLORS_TEMP,
  } = {}) {
    this.sim = new WindParticleSim({ maxParticles, trailSegments, trailSeconds, radius, random });
    this.primitive = primitive === 'line' ? 'line' : 'ribbon';
    const sim = this.sim;
    const instances = sim.max * sim.slots;

    const geo = new THREE.InstancedBufferGeometry();
    if (this.primitive === 'ribbon') {
      geo.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
      geo.setIndex([0, 1, 2, 2, 1, 3]);
    } else {
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    }
    // GPU 쪽 배열 — 블록 폭이 '지금 입자 수'다. 크기는 최대치로 한 번만 잡는다.
    this.gpu = new Float32Array(instances * SEG_FLOATS);
    this.buffer = new THREE.InstancedInterleavedBuffer(this.gpu, SEG_FLOATS, 1);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aStart', new THREE.InterleavedBufferAttribute(this.buffer, 4, 0));
    geo.setAttribute('aEnd', new THREE.InterleavedBufferAttribute(this.buffer, 4, 4));
    this.slotAttr = new THREE.InstancedBufferAttribute(new Float32Array(instances), 1);
    geo.setAttribute('aSlot', this.slotAttr);
    geo.instanceCount = 0;
    this.geometry = geo;

    this.uniforms = {
      uHead: { value: 0 },
      uSlots: { value: sim.slots },
      uPhase: { value: 0 },
      uGamma: { value: WIND_TRAIL_GAMMA },
      uLimb: { value: 0.18 },
      uFeather: { value: this.primitive === 'ribbon' ? 1 : 0 },
      uViewport: { value: new THREE.Vector2(1440, 900) },
      uBounds: { value: Array.from(WIND_SPEED_BOUNDS_MS) },
      uColors: { value: WIND_SPEED_COLORS_TEMP.map((c) => new THREE.Color(c)) },
      uBandAlpha: { value: Array.from(BAND_ALPHA) },
      uBandWidth: { value: Array.from(BAND_WIDTH_CSS) },
      uWhite: { value: 1 },
      uOpacity: { value: 0.9 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest,
      side: THREE.DoubleSide,     // 화면에서 선분이 어느 쪽으로 누워도 쿼드가 뒤집혀 사라지지 않게
    });
    this.object = this.primitive === 'ribbon'
      ? new THREE.Mesh(geo, this.material)
      : new THREE.LineSegments(geo, this.material);
    // 정점 위치는 셰이더가 정한다 — three 가 아는 경계 구(밑 쿼드 하나)로 컬링하면 통째로 사라진다.
    this.object.frustumCulled = false;
    this.object.renderOrder = renderOrder;
    this.object.visible = false;
    this.colorMode = 'white';
    this.setSpeedColors(speedColors);

    this._views = [];
    this._viewsFor = -1;
    this._relayouts = 0;
    this._uploadFloats = 0;
    this._ms = 0; this._msSum = 0; this._msN = 0; this._msAvg = 0; this._msMax = 0;
    this._on = true;
  }

  /** { w, h, dataA, dataB?, mix?, decode:{scale, offset}, grid? } — createWindField 주석. null 이면 아무것도 안 그린다. */
  setField(spec) { this.sim.setField(spec); }
  /** 두 프레임 사이 비율 0~1. 타임라인을 밀 때 프레임을 다시 넣지 않고 이것만 부른다. */
  setMix(m) { this.sim.setMix(m); }
  setRadius(r) { this.sim.setRadius(r); }
  /** 화면. ⚠️ **CSS 픽셀**이다(canvas.clientWidth/Height). 장치픽셀을 넣으면 DPR 2 에서 입자가 4배, 굵기가 절반이 된다. */
  setView(view) {
    this.sim.setView(view);
    if (this.sim.view) this.uniforms.uViewport.value.set(this.sim.view.widthCss, this.sim.view.heightCss);
  }
  /** 기기 예산(입자 수). 부르는 쪽이 flowRenderBudget × ThermalGovernor.particleScale 로 정한다. */
  setBudget(n) { this.sim.setBudget(n); }
  /** 입자 강도 칩 — 1 = 예산의 1/3 · 2 = 2/3 · 3 = 전부. */
  setIntensity(k) { this.sim.setIntensity(k); }
  /** 'white' = 색면이 켜져 있을 때(입자는 방향만 말한다) · 'speed' = 색면이 꺼져 있을 때(입자가 풍속 구간색). */
  setColorMode(mode) {
    this.colorMode = mode === 'speed' ? 'speed' : 'white';
    this.uniforms.uWhite.value = this.colorMode === 'speed' ? 0 : 1;
  }
  /** 구간색 8개(경계 WIND_SPEED_BOUNDS_MS 의 아래 칸부터). THREE.Color 가 받는 모든 표기 또는 [r,g,b](sRGB 0~1). */
  setSpeedColors(colors) {
    if (!Array.isArray(colors) || colors.length !== WIND_SPEED_BOUNDS_MS.length + 1) {
      throw new TypeError(`speed colors must have ${WIND_SPEED_BOUNDS_MS.length + 1} entries`);
    }
    colors.forEach((c, i) => {
      const dst = this.uniforms.uColors.value[i];
      if (Array.isArray(c)) dst.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); else dst.set(c);
    });
  }
  setOpacity(a) { this.uniforms.uOpacity.value = clamp01(a); }
  setVisible(v) { this._on = !!v; if (!this._on) this.object.visible = false; }

  _layout() {
    // 입자 수가 바뀌었다 — GPU 배열의 블록 폭이 달라진다. 원본에서 통째로 다시 채운다(드문 일).
    const sim = this.sim; const n = sim.count;
    const used = sim.packInto(this.gpu);
    const slotArr = this.slotAttr.array;
    for (let s = 0; s < sim.slots; s += 1) slotArr.fill(s, s * n, (s + 1) * n);
    this._views.length = 0;
    for (let s = 0; s < sim.slots; s += 1) {
      const from = s * sim.max * SEG_FLOATS;
      this._views.push(sim.seg.subarray(from, from + n * SEG_FLOATS));   // 프레임마다 subarray 를 만들지 않으려고
    }
    this._viewsFor = n;
    this.geometry.instanceCount = sim.slots * n;
    this.buffer.clearUpdateRanges();
    this.slotAttr.clearUpdateRanges();
    // ⚠️ 입자가 0 이면 올릴 것이 없다 — needsUpdate 만 켜고 범위를 안 주면 three 는 배열 **전체**를 올린다
    //    (WebGLAttributes: updateRanges 가 비면 bufferSubData(0, 전체)). 입자 0 은 발열 SAFE 가 오는 순간이고,
    //    그때 1.92 MB 를 올리는 것은 이 엔진이 가장 아무것도 하지 말아야 할 때 하는 일이다.
    if (used > 0) {
      this.buffer.addUpdateRange(0, used);
      this.slotAttr.addUpdateRange(0, sim.slots * n);
      this.buffer.needsUpdate = true;
      this.slotAttr.needsUpdate = true;
    }
    this._relayouts += 1;
    return used;
  }

  /** 매 프레임. cameraWorldPos = 카메라 월드 위치(.x .y .z), cameraForward(선택) = 카메라가 보는 방향 단위 벡터.
   *  틸트를 쓰는 화면은 cameraForward 를 넘겨야 한다 — 안 넘기면 천저를 본다고 가정해 시야 밖에 뿌릴 수 있다. */
  update(dtSeconds, cameraWorldPos, cameraForward = null) {
    const t0 = performance.now();
    const sim = this.sim;
    const res = sim.step(dtSeconds, cameraWorldPos, cameraForward);
    let uploaded;
    if (res.relayout || this._viewsFor !== res.count) {
      uploaded = this._layout();
    } else {
      const n = res.count;
      const at = res.head * n * SEG_FLOATS;
      uploaded = n * SEG_FLOATS;
      if (n > 0) {
        this.gpu.set(this._views[res.head], at);
        // 그려지지 않는 동안(숨김)에도 update 가 불리면 범위가 쌓인다 — three 는 올릴 때만 비운다.
        if (this.buffer.updateRanges.length > sim.slots) {
          this.buffer.clearUpdateRanges();
          this.buffer.addUpdateRange(0, sim.slots * n * SEG_FLOATS);
        } else {
          this.buffer.addUpdateRange(at, uploaded);
        }
        this.buffer.needsUpdate = true;
      }
    }
    this.uniforms.uHead.value = sim.head;
    this.uniforms.uPhase.value = sim.phase;
    this.object.visible = this._on && res.count > 0;
    this._uploadFloats = uploaded;
    const ms = performance.now() - t0;
    this._ms = ms;
    this._msSum += ms; this._msN += 1;
    if (ms > this._msMax) this._msMax = ms;
    if (this._msN >= 30) { this._msAvg = this._msSum / this._msN; this._msSum = 0; this._msN = 0; }
  }

  /** 계측 — 발열 판단과 회귀 감지에 쓴다(v1 의 canvas.dataset.tickMs 자리). 부를 때만 객체를 만든다. */
  stats() {
    const sim = this.sim;
    const perInstance = this.primitive === 'ribbon' ? 4 : 2;
    const instances = sim.slots * sim.count;
    return {
      particles: sim.count,
      maxParticles: sim.max,
      segmentsPerParticle: sim.slots,
      primitive: this.primitive,
      drawCalls: 1,
      instances,
      drawnVertices: instances * perInstance,
      drawnTriangles: this.primitive === 'ribbon' ? instances * 2 : 0,
      floatsWritten: sim.floatsLast,
      uploadBytes: this._uploadFloats * 4,
      bufferBytes: this.gpu.byteLength,
      cpuMs: this._ms,
      cpuMsAvg: this._msAvg || this._ms,
      cpuMsMax: this._msMax,
      respawns: sim.respawnsLast,
      relayouts: this._relayouts,
      headSlot: sim.head,
      degPerCssPx: sim.degPerPx,
      capDeg: sim.capAngle * R2D,
      viewKnown: !!sim.view,
      frames: sim.frames,
    };
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    if (this.object.parent) this.object.parent.remove(this.object);
  }
}
