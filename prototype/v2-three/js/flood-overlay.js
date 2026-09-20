// EARTHUS v2 — 해수면 상승: 해안 막대기 대신 '잠기는 땅' (2026-09-20 작업 E1 · PD 가 직접 지목한 것)
//
// 무엇이 잘못돼 있었나: 레이어 'slr' 은 조위관측소 1,016곳에 **수직 막대기**(LineSegments)와 점을 세웠다.
// 막대기 높이는 2100년 상승폭이었다 — 지구 위에 1 m 를 세우려면 지구 반지름의 1/6,371,000 이라 보이지 않으므로
// 실제로는 상승폭에 비례한 **보이기용 길이**(0.003 ~ 0.048 · 지구 반지름 단위 = 19 ~ 306 km)를 세운 것이었다.
// 값이 아닌 길이가 값인 척 서 있었고, 정작 '어디가 잠기나'는 화면에 없었다.
// PD: "해수면 상승 전망은 지금 파고와 너울 누르면 육지가 물에 잠기는데 그걸로 가야하는거 아냐?
//      지금은 해안가에 막대기 나와 — 내가 그 막대기 싫어서 업데이트 진행했던 건데."
//
// 이 파일이 하는 일: **지형 고도가 그 자리의 상승폭보다 낮은 육지**를 물빛으로 덮는다.
//   고도  지구 셰이더가 쓰는 바로 그 높이맵이다(main.js TERRAIN_GLSL heightAt — 전역 z4 + 카메라 주변 디테일 창 z5~z9).
//         ⚠️ uExagger 는 **그리기용 과장**이라 고도 비교에 넣지 않는다. 과장 50× 에서 0.7 m 가 35 m 가 되면
//            잠기는 땅이 50배로 불어난다. 과장은 정점을 올리는 데에만 쓰인다(FIELD_VERT 그대로).
//   상승폭 곳마다 다르다(조위관측소 1,016곳 · IPCC AR6 상대 해수면). 1° 격자 한 장을 IDW 로 구워 값 텍스처로 올린다.
//   육지  바다 색면(field-renderer.js mask 'ocean')이 쓰는 판정을 **뒤집은 것**이다: 육지 판(land-mask.js)이거나
//         고도 ≥ 0 이면 육지다. 바다는 칠하지 않는다 — 이미 물이다.
//
// ── 이것이 무엇이 아닌가 (카드가 네 가지를 반드시 말한다 · floodCardInner) ────────────────────────────────────
//   ① **욕조식 근사**다. '해수면이 그만큼 오르면 지금 지형에서 물보다 낮아지는 땅'을 칠한 것이지 침수 예측이 아니다.
//   ② 방조제 · 배수 · 지반침하 · 바다와의 연결을 **모른다.** 제방 뒤의 **내륙** 저지도 칠해지고,
//      바다와 이어지지 않은 저지(사해 · 카스피 저지)도 칠해진다. 연결 판정(홍수 채우기)은 하지 않는다.
//      ⚠️ 2026-09-20 반박 검증으로 고친 문장이다: 여기서도 카드에서도 '네덜란드 간척지가 칠해진다'고 적었는데
//         화면은 반대였다 — 간척지는 지형 자료가 아직 바다로 담고 있어(송도 −3.1 m · 새만금 −4.1 m · 판도 0)
//         'sea' 로 읽혀 칠해지지 않는다. 카드가 화면과 반대로 말하고 있었다.
//   ③ 지형 해상도가 전지구 약 10 km(z4) · 확대하면 약 300 m(z9)라 **좁은 만 · 제방 · 수로는 못 본다.**
//      ⚠️ 같은 검증: 확대해도 밀집 해안 도시는 칠해지지 않는다. z9 실측 도쿄 고토구 11.0 m · 방콕 중심 10.0 m ·
//         상하이 푸둥 7.0 m · 로테르담 7.2 m — 실제 지면은 0~4 m 다(건물 · 제방이 섞인 표면 고도로 보인다).
//         해상도가 아니라 자료의 성질이라 '확대하면 제자리를 찾는다'는 약속을 지울 수밖에 없었다.
//   ④ 출처는 IPCC AR6 조위관측소 1,016곳이고 값은 **중앙값**이다(하한~상한도 카드에 적는다).
//
// ── 왜 타임라인에 잇지 않나 ───────────────────────────────────────────────────────────────────────────────────
//   이것은 2050 · 2100 · 2150년 **전망**이지 5일 예보가 아니다. 시간 버스를 구독하면 타임라인을 밀 때마다
//   2100년 그림이 '유효 시각'을 가진 것처럼 보인다 — 전망을 예보로 읽히게 하는 가장 빠른 길이다.
//   조작은 시나리오 4개 × 연도 3개뿐이고, 그 12칸은 **전부 자료에 있다**(ar6.json counts 확인 · 죽은 토글 금지).
//
// ── 상승폭 격자 (IDW) ─────────────────────────────────────────────────────────────────────────────────────────
//   가까운 관측소 4곳을 거리 제곱 반비례로 섞는다. **1,500 km 밖뿐인 칸은 섞지 않고 전지구 중앙값**을 두고
//   그 사실을 카드에 적는다 — 관측소 하나를 대륙 전체에 우기지 않기 위해서다(사하라 · 중앙아시아 · 아마존 내륙).
//   무게는 관측소 자리에서만 오는 것이라 **시나리오·연도가 바뀌어도 그대로다.** 그래서 무게 판(스텐실)은 한 번만
//   굽고(전 지구 42 ms · 실측) 단추를 누를 때는 값만 다시 더한다(2 ms). 12칸을 미리 굽지 않는 이유이기도 하다.
//   위도 띠 색인으로 후보를 1,500 km 안쪽 띠(±13.5°)로 줄인다 — 안 하면 칸마다 1,016곳을 다 재서 열 배 느리다.
//
// ── 값 텍스처의 눈금 ──────────────────────────────────────────────────────────────────────────────────────────
//   운영 자료의 중앙값 범위는 −2.38 ~ +4.15 m 다(음수 = 땅이 솟는 곳 — 스칸디나비아 · 알래스카의 빙하 반동).
//   바이트 하나에 3 cm 눈금으로 −2.70 ~ +4.95 m 를 담는다. 3 cm 는 10 km 지형 자료의 오차보다 한참 아래라
//   '잠긴다/아니다'의 선을 바꾸지 못한다. ⚠️ 읽을 때 바이트로 **되돌리지 않는다**(field-renderer 의 tapValue 와 다른 점):
//   구간 경계가 자료의 눈금 위에 있어야 하는 색면과 달리, 여기서 텍스처는 '선의 높이'라 매끄러워야 한다 —
//   되돌리면 3 cm 마다 격자 모양 계단이 삼각주에서 수 km 짜리 직선 해안선으로 보인다.
//
// ── 색 ────────────────────────────────────────────────────────────────────────────────────────────────────────
//   PD: "물빛 한 가지 + 가장자리에 밝은 테. 깊이를 색으로 말하고 싶으면 2~3단으로만 — 이것은 값이 아니라 선/아래 판정이다."
//   그래서 이 표는 field-scales.js 의 등록부(FIELD_SCALES)에 넣지 않았다. 저 표는 **값**의 색 눈금이고(기온 · 풍속 · 강수…)
//   이것은 깊이 3단 판정이다. 대신 표를 짓는 길은 같은 것을 쓴다(defineScale) — 색·경계·범례 글자가 한 줄에서 나온다.
//   ⚠️ 깊이 경계 0.5 m · 2 m 는 **PD 가 정한 값이 아니다**(지시서에 없다). 바꾸려면 아래 표 한 줄만 고치면 된다.
//   (기압 색면의 경계가 같은 사정이다 — field-scales.js 의 pressure 주석.)
//
// 계산은 DOM · THREE 없이 시험할 수 있는 순수 함수다. 셰이더가 하는 일은 floodAt 이 JS 로 그대로 셈한다(시험용 거울).

import * as THREE from '../../vendor/three-r184.module.min.js';
import { FIELD_LIFT, FIELD_GRAD_EPS, FIELD_RENDER_ORDER, FIELD_TERRAIN_GLSL, FIELD_VERT, lineCoverage } from './field-renderer.js?v=1';
import { defineScale, legendModel, paletteRGBA } from './field-scales.js?v=1';
import { LAND_MASK_RES, sharedLandMask } from './land-mask.js?v=1';
// 바다에서 물이 닿는 칸 판(0.25° 욕조 채우기) — 왜 필요한지는 저 파일 머리말이 숫자로 적는다.
import { FLOOD_REACH_GROW, FLOOD_REACH_RES, buildOceanReachAsync, reachAt, reachInfo, reachRGBA } from './flood-reach.js?v=1';

// ── 상수 ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** 상승폭 격자 한 칸(°). 관측소 1,016곳이 만드는 면의 해상도보다 촘촘할 이유가 없다(가장 가까운 관측소가 보통 수백 km). */
export const FLOOD_RISE_RES = 1;
/** 섞을 관측소 수. 하나면 경계에서 값이 튀고, 여덟이면 만(灣) 하나의 특징이 이웃 바다에 녹는다. */
export const FLOOD_IDW_K = 4;
/** 거리 가중 지수 — 1/d². 표준 IDW 값이다. */
export const FLOOD_IDW_POWER = 2;
/** 이보다 먼 관측소는 쓰지 않는다(km). 넘으면 전지구 중앙값이고 카드가 그 사실을 적는다. */
export const FLOOD_FAR_KM = 1500;
/** 지구 반지름(km) — 내적을 거리로 되돌릴 때만 쓴다(IDW 의 무게). 그림에는 쓰지 않는다. */
const KM_PER_RAD = 6371;
/** 값 텍스처의 눈금(m)과 바이트 0 의 값(m) — 머리말 '값 텍스처의 눈금'. */
export const FLOOD_RISE_STEP = 0.03;
export const FLOOD_RISE_BASE = -2.7;
/** 색면의 불투명도. 지형의 결이 물빛 아래로 비쳐야 '지구 위의 물'로 읽힌다(색면 0.8 보다 옅다 — 이것은 값이 아니라 덮개다). */
export const FLOOD_OPACITY = 0.62;
/**
 * 지형 위로 띄우는 높이(지구 반지름 단위). 색면(FIELD_LIFT ≈ 7.6 km)의 1/4 인 약 1.9 km 다.
 * 왜 색면보다 낮게 띄우나: 색면은 '이 칸의 값'이라 몇 km 어긋나도 뜻이 안 바뀌지만, 이 면은 **물가의 선이 곧 답**이다.
 * 비스듬히 볼 때 띄운 높이는 그대로 시차가 된다(L · tanθ — 7.6 km 를 30° 에서 보면 4.4 km 가 밀린다).
 * 지형 자료가 확대에서 약 300 m 인데 선이 4 km 밀리면 그 정밀도가 통째로 사라진다.
 * 더 낮추지 않는 이유: 전지구 뷰의 깊이 눈금이 약 320 m 라(field-renderer.js 머리말) 그 여섯 배는 있어야 지구와 겹쳐 깜빡이지 않는다.
 */
export const FLOOD_LIFT = FIELD_LIFT / 4;
/** 물가의 밝은 테 — 굵기(CSS px)와 진하기. 전지구 줌에서 잠기는 땅은 실오라기라 **이 선이 그림의 주인공**이다. */
export const FLOOD_RIM = Object.freeze({ color: Object.freeze([0.918, 0.988, 1.0]), widthPx: 1.6, alpha: 0.92 });

/** 시나리오 · 연도 — 자료에 있는 것 그대로다(ar6.json scenarios · years). 없는 칸은 단추로 그리지 않는다. */
export const FLOOD_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'ssp126', label: 'SSP1-2.6', word: '저배출' }),
  Object.freeze({ id: 'ssp245', label: 'SSP2-4.5', word: '중간' }),
  Object.freeze({ id: 'ssp370', label: 'SSP3-7.0', word: '고배출' }),
  Object.freeze({ id: 'ssp585', label: 'SSP5-8.5', word: '최고' }),
]);
export const FLOOD_YEARS = Object.freeze(['2050', '2100', '2150']);
/** 기본 — 옛 막대기가 그리던 것과 같은 칸이다(2100 · SSP5-8.5). 켜자마자 그림이 달라 보이지 않게. */
export const FLOOD_DEFAULT = Object.freeze({ scenario: 'ssp585', year: '2100' });

/**
 * 침수 깊이 3단. 이것은 값의 눈금이 아니라 **선/아래 판정**의 깊이 표시다(머리말 '색').
 *   L* 83.8 → 63.5 → 38.6 — 깊을수록 어둡다. 이웃 칸의 명도차 20 이상이라 색각 이상에서도 순서가 읽힌다(시험이 잰다).
 */
// ⚠️ 이름이 '침수 깊이' 였다(2026-09-20 반박 검증으로 고침). 이 수는 물이 그만큼 찬다는 뜻이 아니라
//    **지금 지형이 예상 해수면보다 그만큼 낮다**는 뜻이다. 옛 이름으로는 사해의 −415 m 가 '침수 깊이 415 m' 였다.
export const FLOOD_SCALE = defineScale({
  id: 'floodDepth',
  name: { ko: '해수면보다 낮은 정도', en: 'Depth below the projected sea level' },
  unit: 'm', digits: 1, kind: 'sequential',
  bands: [
    [null, '#8fdcf7'],   //      < 0.5 m   L* 83.8
    [0.5, '#35a2e3'],    // 0.5 ~ 2 m      L* 63.5
    [2, '#1257b8'],      //      ≥ 2 m     L* 38.6
  ],
  legendNote: {
    ko: '지금 지형이 예상 해수면보다 얼마나 낮은가입니다 — 물이 차는 깊이가 아닙니다',
    en: 'How far today’s terrain lies below the projected sea level — not a water depth',
  },
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtM = (x) => (Number.isFinite(x) ? `${x >= 0 ? '' : '−'}${Math.abs(x).toFixed(2)} m` : '—');

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산 — 자료 → 상승폭 격자
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** 중앙값(원본을 건드리지 않는다). 빈 배열이면 null — 0 으로 메우지 않는다. */
export const medianOf = (list) => {
  const v = [...list].filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const h = v.length >> 1;
  return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
};

/**
 * 쓸 수 있는 관측소만 골라 단위벡터까지 붙인다.
 * **12칸(시나리오 4 × 연도 3)이 다 있는 곳만** 쓴다 — 칸마다 관측소 목록이 달라지면 단추를 누를 때 무게 판을 다시 구워야 하고,
 * 같은 자리의 값이 시나리오마다 다른 이웃에서 오게 된다(운영 자료는 1,016곳 전부가 12칸을 갖고 있다).
 */
export const floodStations = (items = []) => {
  const out = [];
  for (const it of items) {
    if (!it || !Number.isFinite(it.lat) || !Number.isFinite(it.lon) || !it.s) continue;
    let ok = true;
    for (const sc of FLOOD_SCENARIOS) {
      for (const y of FLOOD_YEARS) {
        const cell = it.s[sc.id] && it.s[sc.id][y];
        if (!Array.isArray(cell) || !Number.isFinite(cell[0])) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const la = (it.lat * Math.PI) / 180;
    const lo = (it.lon * Math.PI) / 180;
    const cl = Math.cos(la);
    out.push({
      id: it.id, name: it.name || '', country: it.country || '', lat: it.lat, lon: it.lon, s: it.s,
      x: cl * Math.cos(lo), y: cl * Math.sin(lo), z: Math.sin(la),
    });
  }
  return out;
};

/** 한 시나리오·연도의 관측소 값 세 줄 [중앙값, 하한, 상한] → 중앙값 배열(스텐실의 차례와 같다). */
export const stationMedians = (stations, scenario, year) => stations.map((s) => s.s[scenario][year][0]);

/**
 * 무게 판 — 칸마다 '어느 관측소를 얼마로 섞나'. 관측소 자리만으로 정해지므로 시나리오·연도와 무관하다(머리말).
 *   → { res, width, height, k, idx, w, near, nearCells }
 *   near[c] = 1 이면 1,500 km 안에 관측소가 있다 · 0 이면 그 칸은 전지구 중앙값을 쓴다.
 * 칸의 좌표는 칸 **한가운데**다(land-mask.js cellCenter 와 같은 규약 · 행 0 = 남쪽).
 */
export function buildRiseStencil(stations, { res = FLOOD_RISE_RES, k = FLOOD_IDW_K, farKm = FLOOD_FAR_KM, power = FLOOD_IDW_POWER } = {}) {
  const width = Math.round(360 / res);
  const height = Math.round(180 / res);
  const idx = new Uint16Array(width * height * k);
  const w = new Float32Array(width * height * k);
  const near = new Uint8Array(width * height);
  const out = { res, width, height, k, idx, w, near, nearCells: 0, stations: stations.length, farKm, power };
  if (!stations.length) return out;
  // 색인은 Uint16 이다(칸 26만 × k 개라 32bit 로 두면 1 MB 가 더 든다). 조용히 잘리면 엉뚱한 관측소의 값이 섞이므로 던진다.
  if (stations.length > 65535) throw new RangeError('flood-overlay: 관측소가 65,535곳을 넘으면 Uint16 색인이 모자란다');
  // 위도 띠 색인 — 1,500 km 는 위도로 13.5° 다. 이 띠 밖의 관측소는 어떤 경도에 있어도 1,500 km 보다 멀다.
  const spanDeg = (farKm / KM_PER_RAD) * (180 / Math.PI);
  const bands = new Map();
  stations.forEach((s, i) => {
    const b = Math.floor(s.lat);
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b).push(i);
  });
  const cosFar = Math.cos(farKm / KM_PER_RAD);
  const bi = new Array(k).fill(0);
  const bd = new Array(k).fill(-2);
  const cand = [];
  for (let y = 0; y < height; y += 1) {
    const lat = -90 + (y + 0.5) * res;
    const la = (lat * Math.PI) / 180;
    const cl = Math.cos(la);
    const sl = Math.sin(la);
    cand.length = 0;
    for (let b = Math.floor(lat - spanDeg); b <= Math.ceil(lat + spanDeg); b += 1) {
      const list = bands.get(b);
      if (list) for (const i of list) cand.push(i);
    }
    for (let x = 0; x < width; x += 1) {
      const lon = ((-180 + (x + 0.5) * res) * Math.PI) / 180;
      const px = cl * Math.cos(lon);
      const py = cl * Math.sin(lon);
      let n = 0;
      // 가장 가까운 k 곳 — 거리 대신 **단위벡터의 내적**으로 고른다(큰 쪽이 가깝다). acos 는 고른 뒤 k 번만 부른다.
      for (let m = 0; m < cand.length; m += 1) {
        const s = stations[cand[m]];
        const d = px * s.x + py * s.y + sl * s.z;
        if (d < cosFar) continue;
        if (n < k) {
          let p = n; n += 1;
          while (p > 0 && bd[p - 1] < d) { bd[p] = bd[p - 1]; bi[p] = bi[p - 1]; p -= 1; }
          bd[p] = d; bi[p] = cand[m];
        } else if (d > bd[k - 1]) {
          let p = k - 1;
          while (p > 0 && bd[p - 1] < d) { bd[p] = bd[p - 1]; bi[p] = bi[p - 1]; p -= 1; }
          bd[p] = d; bi[p] = cand[m];
        }
      }
      const c = y * width + x;
      const o = c * k;
      if (!n) continue;                                  // near 는 0 인 채로 — 이 칸은 전지구 중앙값이다
      near[c] = 1;
      out.nearCells += 1;
      let sw = 0;
      for (let m = 0; m < n; m += 1) {
        const km = Math.max(Math.acos(Math.min(1, bd[m])) * KM_PER_RAD, 1);   // 1 km 아래는 '그 관측소 자리'로 본다(1/d² 발산 방지)
        const g = 1 / Math.pow(km, power);
        idx[o + m] = bi[m];
        w[o + m] = g;
        sw += g;
      }
      for (let m = 0; m < n; m += 1) w[o + m] /= sw;     // 무게의 합은 늘 1 — 관측소가 셋뿐인 칸도 값이 작아지지 않는다
      for (let m = n; m < k; m += 1) { idx[o + m] = 0; w[o + m] = 0; }
    }
  }
  return out;
}

/**
 * 무게 판 + 관측소 값 → 상승폭 격자(m). 관측소가 먼 칸은 fallback(전지구 중앙값).
 *   → { res, width, height, values, fallback, farCells }
 */
export function riseGridOf(stencil, values, fallback) {
  const { width, height, k, idx, w, near } = stencil;
  const n = width * height;
  const out = new Float32Array(n);
  const fb = Number.isFinite(fallback) ? fallback : 0;
  let farCells = 0;
  for (let c = 0; c < n; c += 1) {
    if (!near[c]) { out[c] = fb; farCells += 1; continue; }
    const o = c * k;
    let v = 0;
    for (let m = 0; m < k; m += 1) { const g = w[o + m]; if (g > 0) v += values[idx[o + m]] * g; }
    out[c] = v;
  }
  return { res: stencil.res, width, height, values: out, fallback: fb, farCells };
}

/**
 * 12칸(시나리오 4 × 연도 3) 가운데 **가장 큰** 상승폭 격자. 바다 도달 판을 한 번만 굽기 위한 것이다(flood-reach.js 머리말):
 * 상승폭이 작아지면 물이 지나갈 수 있는 칸은 줄어들 뿐이라, 최대에서 닿지 않는 칸은 어느 시나리오에서도 닿지 않는다.
 */
export function riseMaxGridOf(stencil, stations) {
  let out = null;
  for (const sc of FLOOD_SCENARIOS) {
    for (const y of FLOOD_YEARS) {
      const values = stationMedians(stations, sc.id, y);
      const g = riseGridOf(stencil, values, medianOf(values));
      if (!out) out = { ...g, values: Float32Array.from(g.values) };
      else for (let i = 0; i < out.values.length; i += 1) out.values[i] = Math.max(out.values[i], g.values[i]);
    }
  }
  return out;
}

/** 값(m) → 바이트. 눈금 밖은 양 끝으로 잘린다(운영 자료는 −2.38 ~ 4.15 m 라 잘리지 않는다). */
export const encodeRise = (v) => Math.max(0, Math.min(255, Math.round((v - FLOOD_RISE_BASE) / FLOOD_RISE_STEP)));
/** 바이트 → 값(m). 셰이더의 `바이트 * uRiseDecode.x + uRiseDecode.y` 와 같은 식이다. */
export const decodeRise = (b) => b * FLOOD_RISE_STEP + FLOOD_RISE_BASE;

/** 격자 → RGBA 바이트. R = 상승폭 · G = 관측소가 가까운 칸인가(255/0 · 화면은 안 읽는다 · 시험과 콘솔이 읽는다). 행 0 = 남쪽. */
export function riseRGBA(grid, stencil) {
  const n = grid.width * grid.height;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = encodeRise(grid.values[i]);
    out[i * 4 + 1] = stencil && stencil.near && stencil.near[i] ? 255 : 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * 셰이더가 한 픽셀에서 읽는 상승폭 — **바이트로 구운 뒤** 이중선형(LinearFilter 와 같은 식).
 * 칸 한가운데가 격자점이다: u = lon/360 + 0.5 · v = lat/180 + 0.5 → (u·W − 0.5, v·H − 0.5) · 행 0 = 남.
 * 경도는 감고(RepeatWrapping) 위도는 끝 행에서 멈춘다(ClampToEdge) — field-renderer.gridCoordOf 와 같은 규칙이다.
 */
export function riseAt(grid, lat, lon) {
  const { width, height, values } = grid;
  const gx = ((((lon / 360 + 0.5) % 1) + 1) % 1) * width - 0.5;
  const gy = Math.max(0, Math.min(height - 1e-6, (lat / 180 + 0.5) * height - 0.5));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const wrap = (x) => ((x % width) + width) % width;
  const clamp = (y) => Math.max(0, Math.min(height - 1, y));
  const at = (x, y) => decodeRise(encodeRise(values[clamp(y) * width + wrap(x)]));
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return top + (bot - top) * fy;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산 — 셰이더가 하는 판정을 JS 로 (시험용 거울)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** 깊이 → 칠하는 칸. 셰이더의 `step(경계1, 깊이) + step(경계2, 깊이)` 와 같다(아래 경계 포함 · field-scales 의 구간 규칙). */
export const floodBandIndex = (depth) => {
  let i = 0;
  for (const b of FLOOD_SCALE.breaks) i += depth >= b ? 1 : 0;
  return i;
};

/**
 * 물가의 밝은 테가 이 픽셀을 얼마나 덮나 — 색면의 등치선과 **같은 함수**다(베끼지 않고 그대로 부른다).
 *   sub  상승폭 − 고도(m · 0 보다 크면 물보다 낮다) · grad  화면 1px 에 sub 가 변하는 양 · widthPx  굵기(장치 px)
 * 등치선과 같은 식이라 뜻도 같다: 선은 물가의 **안쪽**에만 서고(바깥은 안 칠하는 곳이라 테를 걸면 마른 땅이 하얘진다),
 * 평평한 곳(grad ≈ 0 · 호수면 · 고도가 상수인 곳)에서는 긋지 않는다 — 면 전체가 번지는 것을 막는 가드다.
 * 셰이더 쪽 lineCover 도 FIELD_FRAG 의 것과 같은 글자다(시험이 두 본문을 대조한다).
 */
export const floodRimCoverage = (sub, grad, widthPx) => lineCoverage(sub, grad, widthPx);

/**
 * 한 지점을 칠하나 — 셰이더 main() 과 같은 차례.
 *   deps { heightAt(lat,lon) → m · landAt(lat,lon) → 0|1|null · riseAt(lat,lon) → m · reachAt(lat,lon) → 0|1|null · hasHeight }
 *   → { painted, why, height, rise, depth, band }
 * why: 'noTerrain'(지형을 못 받았다 — 아무것도 말하지 않는다) · 'sea'(바다다) · 'dry'(물보다 높다) ·
 *      'basin'(물보다 낮지만 바다에서 물이 닿지 않는 내륙 저지다 — 사해 · 카스피 저지)
 */
export function floodAt(deps, lat, lon) {
  const { heightAt, landAt = null, riseAt: riseOf, reachAt: reachOf = null, hasHeight = true } = deps || {};
  if (!hasHeight || typeof heightAt !== 'function') return { painted: false, why: 'noTerrain' };
  const h = heightAt(lat, lon);
  const plate = landAt ? landAt(lat, lon) : null;
  // 육지인가 — 바다 색면(field-renderer.js)의 두 단을 뒤집은 것이다. 판이 육지라 하거나 해수면 위면 육지다.
  // 판이 없는 세션(uHasLand = 0)은 고도의 부호만 남는다: 해수면보다 낮은 땅을 바다로 읽는 쪽이 지어내는 것보다 낫다.
  const land = (plate === 1) || (Number.isFinite(h) && h >= 0);
  if (!land) return { painted: false, why: 'sea', height: h };
  const rise = riseOf(lat, lon);
  const depth = rise - h;
  if (!(depth > 0)) return { painted: false, why: 'dry', height: h, rise, depth };
  // 셰이더와 같은 차례의 마지막 단. 판이 아직 없으면(uHasReach = 0) 가르지 않는다 — 카드가 그 사실을 적는다.
  if (reachOf && reachOf(lat, lon) !== 1) return { painted: false, why: 'basin', height: h, rise, depth };
  return { painted: true, why: 'wet', height: h, rise, depth, band: floodBandIndex(depth) };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  셰이더
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

// 지형 — FIELD_TERRAIN_GLSL(decodeHeight · mercatorUV · displacementHeight)에 **디테일 창 세 함수**를 더한다.
// 세 함수는 main.js TERRAIN_GLSL 의 것과 같은 글자다(시험이 대조한다 · 고치려면 main.js 를 먼저 고치고 여기를 맞춘다).
// 색면(field-renderer)은 전역맵만 읽지만 이 레이어는 **읽히는 고도가 곧 판정**이라 디테일 창까지 읽는다 —
// 카드가 말하는 '확대하면 약 300 m'(z9)가 바로 이 세 함수다. 창이 없는 세션은 detailFade 가 0 을 돌려주고 전역 z4 로 돈다.
export const FLOOD_TERRAIN_GLSL = `${FIELD_TERRAIN_GLSL}
uniform sampler2D uDetailMap;
uniform vec4 uDetailRect;
uniform float uHasDetail;
uniform float uDetailAmt;

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
`;

// 정점은 색면과 **같은 것**을 쓴다(field-renderer.js FIELD_VERT) — 지구의 변위 식 그대로에 uLift 만 더한 면이다.
// 한 글자도 베끼지 않는다: 두 벌이 생기면 한쪽만 고쳐져 어긋난다(그 파일 머리말 '지형').
export const FLOOD_VERT = FIELD_VERT;

// 프래그먼트. ⚠️ highp — 고도(m)와 상승폭(m)의 차이가 0.01 m 단위이고 mediump 로는 6,371,000 을 못 담는다.
//   · PI 를 다시 선언하지 않는다 — FIELD_TERRAIN_GLSL 이 이미 선언했다.
//   · fwidth 는 **discard 앞에서** 부른다: 버려진 이웃 픽셀의 도함수는 정의되지 않는다(물가의 테가 바로 그 자리에 선다).
//   · uHasHeight 가 0 인 세션은 heightAt 이 어디서나 0 을 돌려준다 — 그때 칠하면 '육지가 다 잠겼다'는 거짓말이 된다.
//     그 갈래는 uniform 분기라 도함수와 무관하게 통째로 버린다.
export const FLOOD_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

${FLOOD_TERRAIN_GLSL}

uniform sampler2D uRise;       // 1° 상승폭 격자 (R = 바이트 · 행 0 = 남 · LinearFilter)
uniform vec2 uRiseDecode;      // 값(m) = 바이트 * x + y
uniform sampler2D uLandMask;   // 등장방형 육지 판 — R > 0.5 면 육지(land-mask.js · 행 0 = 남 · NearestFilter)
uniform float uHasLand;        // 0 이면 판이 없다 — 고도의 부호만으로 가른다
uniform sampler2D uReach;      // 0.25° 바다 도달 판 — R > 0.5 면 대양에서 물이 닿는 칸(flood-reach.js · 행 0 = 남 · NearestFilter)
uniform float uHasReach;       // 0 이면 아직 안 구웠다 — 그때는 가르지 않고 카드가 그 사실을 적는다
uniform sampler2D uPalette;    // 1×N · NearestFilter · sRGB 바이트 그대로
uniform float uBandCount;
uniform vec2 uDepthBreaks;     // 깊이 경계 둘 (0.5 · 2 m)
uniform float uOpacity;
uniform vec3 uRimColor;
uniform vec2 uRimStyle;        // 굵기px · 진하기
uniform float uPxScale;        // 장치 픽셀비 — 굵기는 CSS px 로 정한다
uniform float uGradEps;
varying vec3 vUnit;

// field-renderer.js FIELD_FRAG 의 lineCover 와 **같은 글자**다(시험이 대조한다). 레벨의 아래쪽에만 서고 평평한 곳에서는 긋지 않는다.
float lineCover(float below, float grad, float widthPx) {
  if (grad <= uGradEps || below <= 0.0) return 0.0;
  float hw = widthPx * 0.5;     // ⚠️ 'half' 라고 이름 붙이면 안 된다 — GLSL ES 의 예약어라 셰이더가 통째로 컴파일되지 않는다
  return 1.0 - smoothstep(hw - 0.5, hw + 0.5, abs(below / grad - (hw + 0.5)));
}

void main() {
  if (uHasHeight < 0.5) discard;                       // 지형을 못 받았다 — 무엇이 잠기는지 말하지 않는다(카드가 그렇게 적는다)
  vec3 n = normalize(vUnit);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  vec2 suv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);

  float hgt = heightAt(lon, lat);                      // 전역 z4 + 디테일 창 z5~z9 — 과장(uExagger)은 섞지 않는다
  float rise = texture2D(uRise, suv).r * 255.0 * uRiseDecode.x + uRiseDecode.y;
  float sub = rise - hgt;                              // 0 보다 크면 물보다 낮다
  float grad = fwidth(sub);                            // ⚠️ 아래의 discard 보다 먼저

  // 육지인가 — 바다 색면(field-renderer.js)의 두 단을 뒤집은 것이다: 판이 육지라 하거나 해수면 위면 육지다.
  float plate = uHasLand > 0.5 ? step(0.5, texture2D(uLandMask, suv).r) : 0.0;
  if (max(plate, step(0.0, hgt)) < 0.5) discard;       // 바다다 — 이미 물이라 칠하지 않는다
  if (sub <= 0.0) discard;                             // 물보다 높다
  // 바다에서 물이 닿지 않는 내륙 저지(사해 · 카스피 저지 · 카타라 · 투르판)는 칠하지 않는다.
  // 해수면이 올라도 그곳에는 바닷물이 가지 않는다 — 옛 화면에서 전지구 뷰의 파란 것이 카스피 저지 하나였다(flood-reach.js 머리말).
  if (uHasReach > 0.5 && texture2D(uReach, suv).r < 0.5) discard;

  float idx = step(uDepthBreaks.x, sub) + step(uDepthBreaks.y, sub);
  vec4 band = texture2D(uPalette, vec2((idx + 0.5) / uBandCount, 0.5));
  float bandA = band.a * uOpacity;
  float rim = lineCover(sub, grad, uRimStyle.x * uPxScale) * uRimStyle.y;
  float outA = rim + bandA * (1.0 - rim);
  if (outA < 0.004) discard;
  vec3 rgb = (uRimColor * rim + band.rgb * bandA * (1.0 - rim)) / outA;
  gl_FragColor = vec4(rgb, outA);                      // sRGB 바이트 그대로 — colorspace 변환을 넣지 않는다(색면과 같은 규칙)
}
`;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  카드 (순수 — 시험이 글자를 본다)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** 카드 묶음의 앞뒤 표 — 떠 있는 카드 안에서 이 레이어의 글만 갈아 끼우려고 단다(field-layer.js 와 같은 방식 · 표만 다르다). */
const cardOpen = '<div data-slr-card="slr">';
const cardClose = '</div><!--/slr-card-->';
/** body 안의 이 카드만 새 글로 바꾼다. 없으면 body 그대로 — 다른 카드가 떠 있다. */
export const swapFloodCard = (body, inner) => {
  if (typeof body !== 'string') return body;
  const a = body.indexOf(cardOpen);
  if (a < 0) return body;
  const b = body.indexOf(cardClose, a);
  if (b < 0) return body;
  return body.slice(0, a) + cardOpen + inner + cardClose + body.slice(b + cardClose.length);
};

const pressed = (on) => (on
  ? 'border:1px solid var(--accent);color:var(--accent);background:rgba(120,180,255,0.14);border-radius:8px;font-family:inherit;'
  : 'border:1px solid rgba(120,160,200,0.30);color:inherit;background:none;border-radius:8px;font-family:inherit;');

/** 범례 — 화면에 실제로 칠해지는 칸만(legendModel 이 그것을 고른다) + 물가의 테 한 칸. 색·글자는 위 표 한 줄에서 나온다. */
export const floodLegendHtml = () => {
  const cells = legendModel(FLOOD_SCALE).map((c) => `<span style="display:inline-flex;align-items:center;gap:4px">`
    + `<i style="width:14px;height:10px;border-radius:2px;background:${c.color};display:inline-block"></i>${esc(c.label)}</span>`).join('');
  const rim = `<span style="display:inline-flex;align-items:center;gap:4px">`
    + `<i style="width:14px;height:10px;border-radius:2px;background:rgb(${FLOOD_RIM.color.map((v) => Math.round(v * 255)).join(',')});display:inline-block"></i>물가</span>`;
  // 이름은 표 한 줄에서 온다 — 범례와 표가 다른 이름을 말할 자리를 남기지 않는다(머리말 '색').
  return `<span style="display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 2px">${esc(FLOOD_SCALE.name.ko)} ${cells}${rim}</span>`;
};

/**
 * 카드 안쪽 글(순수).  model = 겹면의 model() — 지금 시나리오·연도·통계·육지 판 정보가 들어 있다.
 * 이웃한 카드들(live-layers.js 의 metaXxx)이 전부 한국어라 이 카드도 한국어다 — 색면 카드(field-layer.js)의 두 나라 말 규약은 저쪽 화면의 것이다.
 */
export const floodCardInner = (m) => {
  const sc = FLOOD_SCENARIOS.find((s) => s.id === m.scenario) || FLOOD_SCENARIOS[3];
  const btn = (action, data, on, text) => `<button data-action="${action}" data-layer="slr" ${data} aria-pressed="${on ? 'true' : 'false'}" style="${pressed(on)}">${esc(text)}</button>`;
  const L = [];
  L.push(`<b>잠기는 땅 — ${esc(sc.label)} · ${esc(m.year)}년</b>`);
  L.push('<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px">배출 시나리오 '
    + FLOOD_SCENARIOS.map((s) => btn('slr-scenario', `data-ssp="${s.id}"`, s.id === m.scenario, s.label)).join('') + '</span>');
  L.push('<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 4px">기준 연도 '
    + FLOOD_YEARS.map((y) => btn('slr-year', `data-year="${y}"`, y === m.year, `${y}년`)).join('') + '</span>');
  if (!m.hasHeight) {
    // 고칠 수 있는 척하지 않는다 — 지형이 없으면 판정 자체가 없다.
    L.push('<b>지형 고도를 받지 못해 잠기는 땅을 그리지 않습니다.</b> 이 레이어는 지구 셰이더가 쓰는 높이맵으로 '
      + '\'물보다 낮은 땅\'을 가르는데, 그 자료가 없으면 어디가 낮은지 알 수 없습니다.');
  }
  L.push(floodLegendHtml());
  L.push(`전 세계 조위관측소 <b>${m.stations.toLocaleString()}곳</b>의 상대 해수면 상승 전망을 `
    + `1° 격자로 이어(가까운 ${FLOOD_IDW_K}곳 · 거리 제곱 반비례) <b>그 값보다 낮은 땅</b>을 물빛으로 덮었습니다.`);
  L.push(`전지구 중앙값 <b>${esc(fmtM(m.globalMedian))}</b> · 관측소 범위 ${esc(fmtM(m.min))} ~ ${esc(fmtM(m.max))}`
    + `<span style="opacity:.75"> (음수 = 땅이 솟아 상대 해수면이 내려가는 곳)</span>`);
  if (m.top.length) {
    L.push(`가장 큰 곳: ${m.top.map((t) => `${esc(t.name)} <b>${esc(fmtM(t.v))}</b> <span style="opacity:.75">(${esc(fmtM(t.lo))}~${esc(fmtM(t.hi))})</span>`).join(' · ')}`);
  }
  if (m.korea.length) {
    L.push(`한국 ${m.koreaCount}곳 중 큰 곳: ${m.korea.map((t) => `${esc(t.name)} <b>${esc(fmtM(t.v))}</b> <span style="opacity:.75">(${esc(fmtM(t.lo))}~${esc(fmtM(t.hi))})</span>`).join(' · ')}`);
  }
  L.push(`<b>① 이것은 침수 예측이 아닙니다.</b> 해수면이 그만큼 오르면 <b>지금 지형에서</b> 물보다 낮아지는 땅을 칠한 것입니다(욕조식 근사).`);
  // ⚠️ 2026-09-20 반박 검증: 여기서 '제방 뒤의 낮은 땅도 칠해진다(네덜란드 간척지)'고 약속했는데 화면은 그 반대였다.
  //    간척지는 지형 자료 자체가 아직 바다라서 칠하지 않는다(아래 floodLandLine 과 같은 사실). 약속을 화면에 맞춘다.
  L.push(`<b>② 방조제 · 배수 · 지반침하를 모릅니다.</b> 제방 뒤의 <b>내륙</b> 저지도 칠해집니다. `
    + `거꾸로 <b>간척지 · 매립지(송도 · 새만금)는 지형 자료가 아직 바다로 담고 있어 칠하지 않습니다.</b>`);
  L.push(floodReachLine(m));
  // ⚠️ 같은 검증: '확대할수록 제자리를 찾는다'는 약속은 밀집 해안 도시에서 지켜지지 않았다. 실측(z9 · Terrarium):
  //    도쿄 고토구 11.0 m · 방콕 중심 10.0 m · 상하이 푸둥 7.0 m · 로테르담 7.2 m — 실제 지면은 0~4 m 다.
  //    상승폭 0.75~1.7 m 와 견주면 전부 '마른 땅'이라 확대해도 비어 있다. 지형 해상도가 아니라 자료의 성질이라
  //    ③ 의 고지로는 덮이지 않는다 — 한 줄을 더 적는다. 고치려면 DTM(FABDEM · Copernicus GLO-30 보정본)이 필요하고 그것은 다음 작업이다.
  L.push(`<b>③ 지형 해상도가 전지구 약 10 km · 확대하면 약 300 m</b> 라 좁은 만 · 제방 · 수로는 보지 못합니다. `
    + `또 도시의 고도 자료는 <b>건물 · 제방이 섞인 표면 고도</b>라 밀집 시가지(도쿄 · 방콕 · 상하이 · 뉴올리언스 · 로테르담)는 `
    + `실제 지면보다 몇 m 높게 읽혀 <b>확대해도 칠해지지 않을 수 있습니다.</b>`);
  L.push(`<b>④ 출처 ${esc(m.source)}</b> · ${esc(m.license)} · 기준선 ${esc(m.baseline)}<br/>`
    + `값은 <b>중앙값</b>이고 괄호는 17~83% 범위입니다. 예보가 아니라 배출 경로별 전망이라 타임라인(5일 예보)과 잇지 않았습니다.<br/>`
    // 지시서 §이 현상: '기관 시나리오 전망'과 '우리 셈'을 한 배지로 묶지 않는다 — 둘의 주인이 다르다.
    + `상승폭은 <b>기관 전망</b>(IPCC AR6)이고, 그 높이를 지금 지형과 견줘 '어디가 낮은가'를 가른 것은 <b>EARTHUS 의 셈</b>입니다.`);
  if (m.farPct != null) {
    L.push(`<span style="opacity:.8">관측소가 ${FLOOD_FAR_KM.toLocaleString()} km 밖인 곳(육지 칸의 ${m.farPct}%)은 `
      + `가까운 관측소를 우기지 않고 <b>전지구 중앙값</b>(${esc(fmtM(m.globalMedian))})을 썼습니다.</span>`);
  }
  L.push(`<span style="opacity:.8">${esc(floodLandLine(m.landMask))}</span>`);
  return L.join('<br/>');
};

export const floodCardHtml = (m) => cardOpen + floodCardInner(m) + cardClose;

/**
 * 바다와의 연결 판정 한 줄 — 무엇을 보고 무엇을 못 보는지를 상태 그대로 말한다(2026-09-20 반박 검증).
 * 옛 카드는 '바다와의 연결을 모릅니다 … 사해 · 카스피 저지도 칠해집니다' 한 줄로 넘겼는데, 실제로 칠해지는 면적의
 * 66.3% 가 그런 땅이었다. 긴 카드 한 줄과 화면 전체를 덮은 색은 무게가 다르다 — 이제 화면에서 가르고, 한 줄은 그 사실을 적는다.
 */
export const floodReachLine = (m) => {
  const st = m && m.reach;
  // 칸 크기는 **구운 판이 들고 온 것**을 적는다 — 상수를 다시 적으면 판과 카드가 갈라질 자리가 생긴다.
  const cellKm = (m && m.reachInfo && m.reachInfo.cellKm) || Math.round(FLOOD_REACH_RES * 111.195);
  if (st === 'ready') {
    return `<b>바다와의 연결은 약 ${cellKm} km 격자로만 봅니다.</b> 대양에서 물이 닿는 칸만 칠하므로 `
      + `바다와 이어지지 않는 내륙 저지(사해 · 카스피 저지 · 카타라)는 칠하지 않습니다 — 해수면이 올라도 그곳에는 바닷물이 가지 않습니다. `
      + `그 격자가 삼킬 만큼 좁은 물길(삼각주 · 수로)을 놓치지 않으려고 ${FLOOD_REACH_GROW} 칸짜리 벽은 한 번 넘어갑니다 — `
      + `그보다 두꺼운 벽 뒤의 저지는 바다와 이어져 있어도 칠하지 않습니다.`;
  }
  // 아직 굽는 중인 것과 **영영 못 굽는 것**을 같은 말로 하지 않는다 — '아직'은 기다리면 된다는 뜻이라 거짓이 된다.
  if (st === 'failed' || st === 'noTerrain' || st === 'noSampler') {
    return `<b>바다와의 연결을 가리지 못했습니다.</b> 지형 고도를 다 읽어야 대양에서 물이 닿는 칸을 셀 수 있는데 `
      + `그러지 못했습니다 — 지금 화면에는 바다와 이어지지 않는 내륙 저지(사해 · 카스피 저지)도 함께 칠해져 있습니다.`;
  }
  return `<b>바다와의 연결은 아직 가리지 않았습니다.</b> 지형 고도를 다 읽어야 대양에서 물이 닿는 칸을 셀 수 있습니다 — `
    + `그때까지는 바다와 이어지지 않는 내륙 저지(사해 · 카스피 저지)도 함께 칠해집니다.`;
};

/**
 * 육지 판정의 고지 한 줄. 바다 색면의 landMaskCardLine 과 **같은 사실**을 말하지만 방향이 반대라 글을 따로 짓는다:
 * 저쪽은 '바다에만 칠한다', 이쪽은 '육지에만 칠한다'. 같은 문장을 돌려 쓰면 카드가 화면과 반대로 말한다.
 * 숫자(깎은 폭·경계 정밀도)는 판 자신이 들고 온 것을 적는다 — 여기 다시 적지 않는다.
 */
export const floodLandLine = (info) => {
  if (!info) {
    return '국가 경계 판을 받지 못해 지금은 지형 고도의 부호만으로 육지를 가릅니다 — '
      + '해수면보다 낮은 땅(네덜란드 간척지 · 카스피 저지 · 요르단 계곡)은 바다로 읽혀 칠하지 않습니다.';
  }
  const km = Number.isFinite(info.erodeKm) ? info.erodeKm : Math.round(LAND_MASK_RES * 111.195);
  const r = info.resolution || {};
  const fine = Object.keys(r).filter((k) => k !== 'global').map((k) => `${k} ${r[k]}`).join(' · ');
  return `육지에만 칠합니다 — 국가 경계 판(${info.source || 'Natural Earth admin 0 countries'})과 지형 고도로 가릅니다. `
    + `경계 정밀도는 대부분 ${r.global || '1:110m'}${fine ? ` 이고 ${fine} 만 더 자세해서` : ' 라서'}, `
    + `판을 해안에서 ${km} km 물려 두었습니다 — 그 띠 안쪽에서 해수면보다 낮은 땅(해안 간척지)은 바다로 읽혀 칠하지 않습니다.`;
};

/** 메뉴에 적히는 한 줄 — 무엇이 켜졌는지 값으로 말한다. */
export const floodNote = (m) => {
  const sc = FLOOD_SCENARIOS.find((s) => s.id === m.scenario) || FLOOD_SCENARIOS[3];
  return `${sc.label} · ${m.year}년 · 전지구 중앙값 ${fmtM(m.globalMedian)} · 관측소 ${m.stations.toLocaleString()}곳`;
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  그리기
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * createFloodOverlay(doc, deps)
 *   doc   ar6.json 문서 { items, source, license, baseline, … }
 *   deps  { terrain, geometry, landMask, onCard, getDocument, segments } — 전부 선택
 *     terrain   main.js 지구의 uniform 묶음(uHeightMap · uHasHeight · uExagger · uDetail*) — **객체를 그대로** 물린다
 *     geometry  지구의 SphereGeometry 를 같이 쓴다(정점이 같아야 평행면이다 · 52만 정점을 한 벌 더 올리지 않는다)
 *     landMask  land-mask.js 의 저장소. 없으면 앱이 나눠 쓰는 하나. 못 받으면 고도의 부호만으로 가른다(열린 실패).
 *     onCard    (swap) => void — 카드 글이 바뀌면 부른다(field-layer.js 의 같은 이름과 같은 약속)
 */
export function createFloodOverlay(doc = {}, deps = {}) {
  const t = deps.terrain || {};
  const stations = floodStations(doc.items || []);
  // 관측소가 하나도 없으면 **그리지 않는다.** 0 m 를 상승폭으로 두면 해수면보다 낮은 땅이 통째로 잠긴 그림이 되고,
  // 그것은 자료가 없다는 사실을 색으로 지어내는 것이다(레이어는 켜지지 않고 그 이유를 말한다 — live-layers.toggle).
  if (!stations.length) throw new Error('해수면 상승 전망에 쓸 조위관측소가 없습니다');
  const stencil = buildRiseStencil(stations);
  const state = { scenario: FLOOD_DEFAULT.scenario, year: FLOOD_DEFAULT.year };
  let grid = null;
  let stats = null;

  const palette = paletteRGBA(FLOOD_SCALE);
  const paletteTex = new THREE.DataTexture(palette, FLOOD_SCALE.colors.length, 1, THREE.RGBAFormat);
  paletteTex.minFilter = THREE.NearestFilter;      // 칸을 섞으면 3단 판정이 그라데이션으로 돌아간다
  paletteTex.magFilter = THREE.NearestFilter;
  paletteTex.wrapS = THREE.ClampToEdgeWrapping;
  paletteTex.wrapT = THREE.ClampToEdgeWrapping;
  paletteTex.generateMipmaps = false;
  paletteTex.colorSpace = THREE.NoColorSpace;      // sRGB 바이트 그대로 — 화면의 색 = 표의 #rrggbb = 범례의 색
  paletteTex.needsUpdate = true;

  const riseTex = new THREE.DataTexture(new Uint8Array(stencil.width * stencil.height * 4), stencil.width, stencil.height, THREE.RGBAFormat);
  riseTex.minFilter = THREE.LinearFilter;          // 상승폭은 '선의 높이'라 매끄러워야 한다(머리말 '값 텍스처의 눈금')
  riseTex.magFilter = THREE.LinearFilter;
  riseTex.wrapS = THREE.RepeatWrapping;            // 경도는 한 바퀴 돈다
  riseTex.wrapT = THREE.ClampToEdgeWrapping;
  riseTex.generateMipmaps = false;
  riseTex.colorSpace = THREE.NoColorSpace;         // 값이지 색이 아니다

  const uniforms = {
    // 지형 — main.js 의 uniform **객체**를 그대로 쓴다. 과장·고도맵·디테일 창이 바뀌면 저쪽이 value 를 고치고 이쪽은 같은 객체를 읽는다.
    uHeightMap: t.uHeightMap || { value: null },
    uHasHeight: t.uHasHeight || { value: 0 },
    uExagger: t.uExagger || { value: 1 },
    uDetailMap: t.uDetailMap || { value: null },
    uDetailRect: t.uDetailRect || { value: new THREE.Vector4(0, 0, 1, 1) },
    uHasDetail: t.uHasDetail || { value: 0 },
    uDetailAmt: t.uDetailAmt || { value: 0 },
    uLift: { value: FLOOD_LIFT },
    uRise: { value: riseTex },
    uRiseDecode: { value: new THREE.Vector2(FLOOD_RISE_STEP, FLOOD_RISE_BASE) },
    uLandMask: { value: null },
    uHasLand: { value: 0 },
    uReach: { value: null },
    uHasReach: { value: 0 },
    uPalette: { value: paletteTex },
    uBandCount: { value: FLOOD_SCALE.colors.length },
    uDepthBreaks: { value: new THREE.Vector2(FLOOD_SCALE.breaks[0], FLOOD_SCALE.breaks[1]) },
    uOpacity: { value: FLOOD_OPACITY },
    uRimColor: { value: new THREE.Vector3(...FLOOD_RIM.color) },
    uRimStyle: { value: new THREE.Vector2(FLOOD_RIM.widthPx, FLOOD_RIM.alpha) },
    uPxScale: { value: 1 },
    uGradEps: { value: FIELD_GRAD_EPS },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: FLOOD_VERT, fragmentShader: FLOOD_FRAG,
    transparent: true, depthWrite: false, depthTest: true, precision: 'highp',
  });
  const ownsGeometry = !deps.geometry;
  const geometry = deps.geometry || new THREE.SphereGeometry(1, ...(deps.segments || [1024, 512]));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = FIELD_RENDER_ORDER;           // 구름 아래 · 지표 위(색면과 같은 자리)
  mesh.frustumCulled = false;                      // 정점이 셰이더에서 올라간다
  // ⚠️ live-layers.disposeObj 가 이 표를 보고 지구의 지오메트리를 건드리지 않는다(같이 쓰는 것이라 여기서도 안 버린다).
  mesh.userData.keepGeometry = !ownsGeometry;
  mesh.onBeforeRender = (renderer) => {
    const pr = renderer && renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    if (pr > 0) uniforms.uPxScale.value = pr;      // 테 굵기는 CSS px — DPR 2 인 폰에서도 같은 굵기
  };
  const group = new THREE.Group();
  group.add(mesh);

  // 육지 판 — 바다 색면 3종이 읽는 **같은 장**이다(같은 파일을 두 번 받지 않는다). 못 받으면 고도의 부호만 남는다.
  const landStore = deps.landMask || sharedLandMask({ THREE });
  const attachLand = () => {
    const tex = landStore && landStore.texture ? landStore.texture() : null;
    uniforms.uLandMask.value = tex || null;
    uniforms.uHasLand.value = tex ? 1 : 0;
  };
  if (landStore && landStore.load) {
    // 판이 늦게 오면 그림만 바뀌는 것이 아니다 — 카드의 '관측소가 먼 육지 칸 %' 와 육지 판정 고지가 그때 서야 사실이 된다.
    Promise.resolve(landStore.load()).then(() => { attachLand(); recompute(); publish(); }).catch(() => {});
  }
  attachLand();

  // ── 바다 도달 판 (0.25° 욕조 채우기 · flood-reach.js) ─────────────────────────────────────────────────────
  // 지형이 없으면 셀 것이 없다(heightAt 이 어디서나 0 을 돌려주면 전 지구가 '물이 닿는 칸'이 된다). 그래서 uHasHeight 를 기다린다.
  // 기다리는 김에 **카드도 그때 고친다** — 지형이 늦게 오면 카드가 '지형을 받지 못해…'에 멈춰 있던 결함을 같이 닫는다.
  let reachGrid = null;
  let reachTex = null;
  let reachState = deps.heightAt ? 'pending' : 'noSampler';   // pending → running → ready | noTerrain | failed
  let reachTimer = null;
  let disposed = false;
  const terrainReady = () => uniforms.uHasHeight.value > 0.5 && typeof deps.heightAt === 'function';
  function attachReach(grid) {
    reachGrid = grid;
    reachTex = new THREE.DataTexture(reachRGBA(grid), grid.width, grid.height, THREE.RGBAFormat);
    reachTex.minFilter = THREE.NearestFilter;      // 칸 판정이다 — 섞으면 해안에서 경계가 흐려진다(육지 판과 같은 규칙)
    reachTex.magFilter = THREE.NearestFilter;
    reachTex.wrapS = THREE.RepeatWrapping;
    reachTex.wrapT = THREE.ClampToEdgeWrapping;
    reachTex.generateMipmaps = false;
    reachTex.colorSpace = THREE.NoColorSpace;
    reachTex.needsUpdate = true;
    uniforms.uReach.value = reachTex;
    uniforms.uHasReach.value = 1;
    reachState = 'ready';
  }
  let reachPromise = null;
  function startReach() {
    if (disposed || reachState === 'running' || reachState === 'ready' || reachState === 'noSampler') return reachPromise;
    reachState = 'running';
    const riseMax = riseMaxGridOf(stencil, stations);
    reachPromise = buildOceanReachAsync({
      heightAt: (la, lo) => deps.heightAt(la, lo),
      riseAt: (la, lo) => riseAt(riseMax, la, lo),
      ...(deps.reachOptions || {}),
    }).then((g) => { if (disposed) return; attachReach(g); recompute(); publish(); })
      .catch(() => { if (disposed) return; reachState = 'failed'; recompute(); publish(); });
    return reachPromise;
  }
  // 운영에서는 지구가 먼저 서므로 첫 판에서 바로 참이다. 그래도 기다리는 길을 두는 것은, 지형이 늦은 세션에서
  // 화면과 카드가 영영 '판정 없음'에 멈추기 때문이다(반박 검증 minor). 1분이면 포기하고 그 사실을 적는다.
  const REACH_WAIT_MS = 500;
  const REACH_WAIT_MAX = 120;
  let reachWaits = 0;
  function waitForTerrain() {
    if (disposed || reachState !== 'pending') return;
    if (terrainReady()) { startReach(); return; }
    if (reachWaits >= REACH_WAIT_MAX) { reachState = 'noTerrain'; publish(); return; }
    reachWaits += 1;
    if (typeof setTimeout !== 'function') return;
    reachTimer = setTimeout(waitForTerrain, REACH_WAIT_MS);
    if (reachTimer && typeof reachTimer.unref === 'function') reachTimer.unref();   // 시험(node)에서 타이머가 프로세스를 붙잡지 않게
  }

  /**
   * 관측소가 먼 **육지** 칸의 비율(%) — 카드가 '어디를 전지구 중앙값으로 뒀나'를 숫자로 말하는 근거.
   * 무게 판과 육지 판만으로 정해져 시나리오·연도와 무관하므로 한 번만 센다. 판이 없으면 null — 모르는 것을 숫자로 말하지 않는다.
   */
  let farPctCache;
  function farLandPct() {
    if (farPctCache !== undefined) return farPctCache;
    const raster = landStore && landStore.raster ? landStore.raster() : null;
    if (!raster || !landStore.landAt) return null;          // 아직 안 왔다 — 판이 오면 그때 세고 카드를 고친다
    let land = 0;
    let far = 0;
    for (let y = 0; y < stencil.height; y += 1) {
      const lat = -90 + (y + 0.5) * stencil.res;
      for (let x = 0; x < stencil.width; x += 1) {
        const lon = -180 + (x + 0.5) * stencil.res;
        if (landStore.landAt(lat, lon) !== 1) continue;
        land += 1;
        if (!stencil.near[y * stencil.width + x]) far += 1;
      }
    }
    farPctCache = land ? Math.round((far / land) * 1000) / 10 : null;
    return farPctCache;
  }

  /** 지금 시나리오·연도의 값으로 격자를 다시 굽는다(무게 판은 그대로 — 2 ms). */
  function recompute() {
    const values = stationMedians(stations, state.scenario, state.year);
    const globalMedian = medianOf(values);
    grid = riseGridOf(stencil, values, globalMedian);
    riseTex.image.data.set(riseRGBA(grid, stencil));
    riseTex.needsUpdate = true;
    const farPct = farLandPct();
    const rows = stations.map((s) => {
      const cell = s.s[state.scenario][state.year];
      return { name: s.name, country: s.country, v: cell[0], lo: cell[1], hi: cell[2] };
    });
    const sorted = [...rows].sort((a, b) => b.v - a.v);
    const kr = rows.filter((r) => (r.country || '').startsWith('Korea'));
    stats = {
      scenario: state.scenario, year: state.year, stations: stations.length,
      globalMedian, farPct, landMask: landStore && landStore.info ? landStore.info() : null,
      hasHeight: !!(uniforms.uHasHeight.value > 0.5),
      reach: reachState, reachInfo: reachGrid ? reachInfo(reachGrid) : null,
      min: rows.length ? Math.min(...rows.map((r) => r.v)) : null,
      max: rows.length ? Math.max(...rows.map((r) => r.v)) : null,
      top: sorted.slice(0, 3),
      korea: [...kr].sort((a, b) => b.v - a.v).slice(0, 3),
      koreaCount: kr.length,
      source: doc.source || 'IPCC AR6 · NASA/JPL',
      license: doc.license || 'CC BY 4.0',
      baseline: doc.baseline || '1995–2014 평균 대비 상대 해수면 (m)',
    };
  }
  recompute();
  waitForTerrain();     // 운영에서는 지구가 이미 서 있어 첫 판에서 바로 굽기 시작한다

  let lastInner = null;
  /** 떠 있는 카드를 제자리에서 고치고, 그 **원본 문자열**도 같이 바꾼다(패널이 다시 그려질 때 옛 글이 되살아나지 않게). */
  function publish() {
    const inner = floodCardInner(api.model());
    if (inner === lastInner) return;
    lastInner = inner;
    const d = deps.getDocument ? deps.getDocument() : (typeof document !== 'undefined' ? document : null);
    if (d && d.querySelectorAll) for (const el of d.querySelectorAll('[data-slr-card="slr"]')) el.innerHTML = inner;
    if (deps.onCard) deps.onCard((body) => swapFloodCard(body, inner));
  }

  const api = {
    get object() { return group; },
    get mesh() { return mesh; },
    get uniforms() { return uniforms; },
    get state() { return { ...state }; },
    stencil() { return stencil; },
    grid() { return grid; },
    model() { return { ...stats, hasHeight: !!(uniforms.uHasHeight.value > 0.5), reach: reachState }; },
    /** 바다 도달 판(콘솔·시험용) — 안 구웠으면 null. */
    reachGrid() { return reachGrid; },
    /** 판을 다 구웠을 때 풀리는 약속(시험이 기다린다) — 아직 시작도 안 했으면 null. */
    reachReady() { return reachPromise; },
    /** 지금 상태의 카드 글 · 메뉴 한 줄 — 읽을 때마다 지금 것을 낸다(단추를 누른 뒤 다시 열어도 맞는다). */
    cardHtml() { return floodCardHtml(api.model()); },
    note() { return floodNote(api.model()); },
    /** 한 지점을 칠하나 — 셰이더와 같은 판정(콘솔·시험용). heightAt 은 부른 쪽이 준다(CPU 고도 샘플러). */
    floodAt(lat, lon, heightAt) {
      return floodAt({
        heightAt: heightAt || deps.heightAt,
        landAt: landStore && landStore.landAt ? (la, lo) => landStore.landAt(la, lo) : null,
        riseAt: (la, lo) => riseAt(grid, la, lo),
        reachAt: reachGrid ? (la, lo) => reachAt(reachGrid, la, lo) : null,
        hasHeight: uniforms.uHasHeight.value > 0.5,
      }, lat, lon);
    },
    /** 카드의 단추. 처리했으면 true — 부른 쪽(live-layers)이 그대로 돌려준다. */
    handleAction(action, ds = {}) {
      if (ds.layer && ds.layer !== 'slr') return false;
      if (action === 'slr-scenario') {
        if (!FLOOD_SCENARIOS.some((s) => s.id === ds.ssp)) return false;   // 없는 시나리오는 단추로 그리지도 않는다
        if (state.scenario === ds.ssp) return true;
        state.scenario = ds.ssp;
      } else if (action === 'slr-year') {
        if (!FLOOD_YEARS.includes(String(ds.year))) return false;
        if (state.year === String(ds.year)) return true;
        state.year = String(ds.year);
      } else return false;
      recompute();
      publish();
      return true;
    },
    dispose() {
      disposed = true;             // 늦게 끝난 굽기가 버린 겹면에 텍스처를 달거나 카드를 고치지 않게
      if (reachTimer && typeof clearTimeout === 'function') clearTimeout(reachTimer);
      reachTimer = null;
      if (reachTex) reachTex.dispose();
      riseTex.dispose();
      paletteTex.dispose();
      material.dispose();
      if (ownsGeometry) geometry.dispose();       // 받은 지오메트리(지구의 것)는 버리지 않는다
      if (group.parent) group.parent.remove(group);
    },
  };
  return api;
}
