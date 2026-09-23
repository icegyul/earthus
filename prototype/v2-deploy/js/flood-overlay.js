// EARTHUS v2 — 해수면 상승 전망 (2026-09-20 작업 E1 → E5)
//
// ── 대표 그림이 세 번 바뀌었다 ──────────────────────────────────────────────────────────────────────────────
//   ① 조위관측소 1,016곳의 **수직 막대기** → PD 가 걷어냈다(아래 E1 기록).
//   ② '잠기는 땅' **색면** → 운영 자료로 재 보니 화면이 실제와 **순서가 뒤집혀** 있었다(E4 · SLR_RISE_SCALE 머리말의 실측).
//   ③ 관측소 1,016곳의 **익명 원반** → 숫자가 없어 눌러 보기 전에는 값을 알 수 없었고 연안에서 점 구름이 됐다.
//   ④ 지금(E5): **숫자를 적은 원판**이 주인공이다 — 멀리서는 나라 하나에 하나, 가까이서는 관측소 하나하나
//      (js/slr-plates.js · 그 파일 머리말이 자리·갈라짐·솎기의 근거를 적는다). 그리고 '잠기는 땅' 색면은 **기본 켬**이 됐다.
//   아래의 색면 기록은 **그대로 둔다**: 지운 것이 아니라 자리를 옮긴 것이고, 네덜란드 · 미시시피 · 메콩에서는 맞다.
//
// ── ⚠️ E5 에서 **재 보고 넣지 않은 것**: '주변에서 가장 낮은 지면'으로 땅 높이를 보정하기 ──────────────────
//   지시서는 점 표본 대신 주변 최저 지면을 쓰라고 했고, 근거로 Terrarium **z11**(텍셀 약 70 m) 표를 들었다.
//   그런데 **3D 지구는 z11 을 절대 읽지 않는다**: main.js DetailTerrain.zoomFor 의 상한이 z9 이고(고도 ≤ 300 km),
//   고도 250 km 아래에서는 지구가 2D 지도로 넘어간다. z9 텍셀은 위도 35°에서 약 250 m 이고, z9 타일은 z11 을
//   평균해 만든 것이라 골짜기가 메워져 있다. 이 세션이 타일을 직접 받아 두 해상도에서 나란히 쟀다:
//
//     곳            상승폭  z9 점하나 → z9 보정(±1km 하위)   z11 점하나 → z11 ±1km 최저
//     다카           1.23     16.9 →  12.0                     19.3 →   3.0
//     호찌민         0.80     17.8 →   8.0                     19.2 →   2.0
//     상하이 푸둥     1.03      2.9 →   2.0                      3.5 →  −1.0
//     방콕           1.79      2.4 →   2.0                      1.5 →   0.0
//     도쿄 고토       0.92      6.0 →   3.0                      0.9 → −98.0(바다 밑바닥)
//     자카르타 북부    0.75      2.9 →   2.3                     −1.0 →  −6.0
//     로테르담        0.81      7.1 →   2.4                      8.0 →  −2.1
//     뉴올리언스      1.34     27.9 →   7.0                      1.4 →  −0.0
//
//   **앱이 실제로 읽는 z9 에서는 보정을 넣어도 열한 곳 가운데 한 곳도 판정이 바뀌지 않는다**(전부 상승폭보다 높다).
//   가장 크게 움직인 로테르담(7.1 → 2.4)도 상승폭 0.81 m 의 세 배다. 반대로 대조군(절벽 해안)은 그냥 끌려 내려온다:
//   발파라이소 68.7 → 14.0 · 강릉 27.5 → 9.0 · 베르겐 12.2 → 6.3. 얻는 것 없이 해안을 낮추기만 한다.
//   게다가 **다카 · 호찌민은 높이 문제가 아니다**: 해안에서 100 km 넘게 들어가 0.25° 바다 도달 판(flood-reach.js)에서
//   대양과 끊긴다(reach = 0). 판을 느슨하게 하면 카스피 · 사해 잠금이 무너진다 — 되돌리지 말라고 한 바로 그것이다.
//   문턱도 재 봤다(z9 ±1 km 원반 안 텍셀): 0 m 로 자르면 송도 · 새만금 · 플레볼란트의 탭이 **전부** 사라지고
//   (그 셋은 둘레가 100% 해수면 아래다), −5 m 면 새만금(−9.8 ~ −7.9)이 통째로 사라진다. 살릴 수 있는 문턱은 −10 m 뿐인데
//   새만금 최저가 −9.8 m 라 여유가 0.2 m 다. 절대 최저는 더 못 쓴다 — 도쿄가 −531 m, 자카르타가 −57 m 로 끌려간다.
//   → 지금 지형 자료(DSM)로는 이 보정이 **z9 에서 아무 도시도 구하지 못하면서 해안만 낮춘다.** 그래서 넣지 않았다.
//      고치는 길은 해상도가 아니라 **맨땅 지형(DTM · FABDEM · Copernicus GLO-30 보정본)**이다(카드 ③ 이 그렇게 적는다).
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

import * as THREE from '../vendor/three-r184.module.min.js';
import { FIELD_LIFT, FIELD_GRAD_EPS, FIELD_RENDER_ORDER, FIELD_TERRAIN_GLSL, FIELD_VERT, lineCoverage } from './field-renderer.js?v=1';
import { bandIndex, defineScale, legendModel, paletteRGBA } from './field-scales.js?v=1';
import { LAND_MASK_RES, sharedLandMask } from './land-mask.js?v=1';
// 범례는 앱에 하나이고 주인 스택으로 나눠 쓴다 — 색면과 **같은 세기**로 든다(색면 표 밖이라고 약한 것이 아니다).
import { fieldLegend as sharedFieldLegend } from './field-legend.js?v=1';
import { LEGEND_PRIORITY_FIELD } from './field-layer.js?v=1';
// 화면 좌표로 되돌리는 일은 지구 위 관측 숫자가 이미 하고 있다(obs-labels.js pick) — 같은 식을 두 벌로 만들지 않는다.
import { projectPx } from './obs-labels.js?v=1';
// 바다에서 물이 닿는 칸 판(0.25° 욕조 채우기) — 왜 필요한지는 저 파일 머리말이 숫자로 적는다.
import { FLOOD_REACH_GROW, FLOOD_REACH_RES, buildOceanReachAsync, reachAt, reachInfo, reachRGBA } from './flood-reach.js?v=1';
// 숫자 원판 — 나라/관측소 두 단계, 메도이드 자리, 솎기. 근거는 저 파일 머리말에 있다.
import {
  SLR_LOD, SLR_MIN_OPACITY, SLR_PLATE_PX, SLR_PLATE_RIM, SLR_PLATE_SCALE, SLR_PLATE_SLOP_PX,
  SLR_LONG_MAXCHARS, SLR_SEP_FRAC, SlrPlates, clipName, countryGroups, countrySummary, isCollidedName,
  plateBoxPx, plateCapOf, plateInkFor, plateInsetOf, plateOnScreen,
  plateOpacity, plateRank, plateText, shortCountryNames, spreadPx, splitDecision, thinPlates,
} from './slr-plates.js?v=1';

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
 * 카드가 적는 '칠해지는 땅'의 크기 — **재서 넣은 수**이지 어림이 아니다(2026-09-20 작업 E5 실측).
 * 세는 법: 0.25° 칸 한가운데에서 floodAt 판정 · cos(위도) 무게 · 메르카토르 높이맵의 한계(±85.05°) 안.
 * 자료는 운영 파일 그대로(ar6.json SSP5-8.5/2100 · country-reference.json 육지 판 · Terrarium z4 · 도달 판 grow 1).
 *   칠해지는 면적 279,614 km² · 육지 149,212,418 km² → 0.19 %
 *   도달 판을 빼면 688,745 km² → 닿는 몫 40.6 %  (flood-reach.js 머리말의 688,744 km² · 40.6 % 와 같은 수다)
 * ⚠️ 옛 카드가 적던 **230,610 km² · 0.17 %** 는 **부풀리기(grow) 전**의 33.7 % 로 센 값이었다(688,744 × 0.337).
 *    지금 코드는 grow 1 을 쓰므로 실제로 칠해지는 것은 이 수다. 판정을 고치면 이 두 줄도 같이 고쳐야 한다.
 */
export const FLOOD_PAINTED_KM2 = 279614;
export const FLOOD_PAINTED_PCT = 0.19;
/**
 * **그 수를 어느 칸에서 쟀나.** 위 두 수는 시나리오 하나 · 연도 하나에서 잰 것이다 —
 * 카드가 그 사실을 적지 않으면, 시나리오 4 × 연도 3 = 12칸 가운데 어느 것을 눌러도 같은 숫자가 따라다니며
 * '지금 화면의 수'인 척한다(2026-09-21 반박 검증). 칠하는 규칙은 상승폭에 대해 단조라
 * SSP1-2.6/2050 과 SSP5-8.5/2150 이 같은 값일 수 없다.
 * ⚠️ FLOOD_DEFAULT 를 가리키지 않는다. 이것은 '기본으로 보여 주는 칸'이 아니라 **잰 칸**이다 —
 *    기본값을 옮기는 날 이 표가 따라 움직이면, 재지도 않은 칸의 수라고 카드가 말하게 된다.
 *    판정이나 자료를 고쳐 다시 재면 위의 두 수와 이 두 글자를 **같이** 고친다.
 */
export const FLOOD_PAINTED_AT = Object.freeze({ scenario: 'ssp585', year: '2100' });
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

/**
 * 구름이 물러나며 화면에 적는 이름(js/cloud-yield.js 의 quantity 자리).
 * 색면들은 FIELD_DESCRIPTORS 에서 이 이름을 얻는데, 잠기는 땅은 그 표 밖이라 여기서 준다 —
 * 없으면 '색면 색면을 보는 동안 구름을 숨겼습니다'가 된다.
 * ⚠️ cloudYield.read 는 이 객체를 **같은 것인가**로 견주므로(폰 발열) 매번 새로 짓지 않는다.
 */
export const FLOOD_QUANTITY = Object.freeze({ ko: '잠기는 땅', en: 'flooded land' });

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
 * '잠기는 땅' 색면이 처음부터 켜져 있나 — **켬**이다(2026-09-20 작업 E5).
 * PD: "육지 위로 물이 올라온거 색으로 표현하고, 그위에 나라 도시 단위로 숫자 원판도 올리는게 맞을거 같은데?"
 * E4 에서 꺼짐으로 내렸던 이유(표면 고도라 아시아 삼각주가 빠진다)는 지금도 참이지만, 그 사실은 **카드가 말하고**
 * 화면은 자기가 아는 것을 보여 준다 — 맞는 곳(네덜란드 · 미시시피 하류 · 북유럽 연안)에서는 이 면이 이 레이어의 답이다.
 */
export const FLOOD_DEPTH_DEFAULT = true;

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

/**
 * ── 관측소 원반의 값 눈금 (2026-09-20 작업 E4 · 대표 그림을 색면에서 원반으로 옮기며 세웠다) ──────────────
 *
 * 무엇이 잘못돼 있었나: 위의 색면(FLOOD_SCALE)이 대표 그림이었는데, 운영 자료로 재 보니 **순서가 뒤집혀 있었다.**
 *   네덜란드 52.5N 5.5E 는 지형 −3.1 m 라 칠해지고, 방글라데시 22.5N 90.5E(5.6 m) · 도쿄 고토(3.7 m) ·
 *   방콕(3.4 m) · 상하이 푸둥(4.0 m) · 자카르타 북부(5.1 m) · 인천 송도(3.6 m)는 전부 안 칠해진다.
 *   지형이 표면모델(DSM)이라 건물 · 나무 · 제방이 섞인 탓이고, 그 결과 전지구에서 칠해지는 땅은 육지의 0.17%
 *   (230,610 km²)뿐이며 대부분이 유럽 · 미시시피다. 전지구 줌에서는 아무것도 안 보인다.
 * 그런데 **관측소 전망값 자체는 순서가 맞다**: TOBA(일본) 2.61 m · TRIBENI(인도) 2.23 m · 방콕 1.89 m ·
 *   제주 1.08 m · 포항 1.05 m — 아시아가 앞이다. 그래서 대표 그림을 관측소 1,016곳의 **값**으로 옮겼다.
 *
 * 왜 원반인가: 옛 그림은 수직 막대기였고 PD 가 걷어냈다. 막대기는 **길이로 거짓말한다** — 지구 위에 1 m 를 세우면
 *   보이지 않으므로 보이기용 길이(19~306 km)를 세운 것이었고, 그 길이가 값인 척 서 있었다. 원반은 화면 고정 크기라
 *   길이로 말하지 않고 **색으로만** 말한다. 크기는 어디서나 같다(sizeAttenuation 없는 점 · gl_PointSize 고정).
 *
 * 경계를 어디서 가져왔나 — **운영 자료에서 잰 것**이다(ar6.json 1,016곳 × 시나리오 4 × 연도 3 = 12,192개 실측):
 *   전체 범위 −2.38 ~ +4.15 m · 중앙값 0.54 m.  기본 칸(SSP5-8.5 · 2100)은 −1.27 ~ 2.61 m · 중앙값 0.78 m ·
 *   10% 0.47 m · 90% 1.04 m — **0.47 ~ 1.04 m 에 몰려 있다.** 그래서 0 ~ 1 m 는 0.25 m 로 촘촘히 넷으로 가르고
 *   (그 구간에서만 색이 네 번 바뀐다) 위는 0.5 → 1 → 열린 끝으로 성기게 간다. 누적 비율로 보면
 *   < 0 4.5% · < 0.25 · < 0.5 47.5% · < 0.75 67.1% · < 1 81.6% · < 1.5 96.6% · < 2 99.5% — 어느 칸도 비지 않는다(시험이 센다).
 *
 * 색 — 콘셉트 팔레트 A(파랑 → 청록 → 초록 → 노랑 → 주황 → 빨강). 여덟 칸의 #rrggbb 는 field-scales.js 의 **풍속 눈금 그대로**다.
 *   같은 팔레트를 손으로 다시 고르면 두 화면의 '같은 파랑'이 달라진다.
 * ⚠️ **음수 칸만 팔레트 밖이다.** 음수는 땅이 솟아 상대 해수면이 내려가는 곳이고(스칸디나비아 · 알래스카의 빙하 반동)
 *   램프의 찬 끝(남색)에 두면 "조금 오른다"로 읽힌다 — 뜻이 반대인 칸을 같은 줄에 세울 수 없다. 그래서 **무채색**이다.
 *   이 저장소가 '램프 밖 칸'에 쓰는 방식 그대로다(field-scales.js 의 pressure #c9ced4 · sstAnom #c6cbd2 '중립(무채색)').
 *   시험이 잠근다: 음수 칸의 채도(C*)는 10 아래 · 여덟 양수 칸은 전부 20 위 — 화면에서 하나만 색이 없다.
 *   보라 같은 새 색상을 넣지 않은 것은 "팔레트 A 를 벗어나지 마라"는 규칙 때문이고, **PD 가 다른 답을 원하면 아래 한 줄만 고치면 된다.**
 */
export const SLR_RISE_SCALE = defineScale({
  id: 'slrRise',
  name: { ko: '해수면 상승 전망', en: 'Sea level rise projection' },
  unit: 'm', digits: 2, kind: 'sequential',
  bands: [
    [null, '#f2f6f9'],   //        < 0      L* 96  ← 무채색. 땅이 솟아 상대 해수면이 내려가는 곳(램프 밖)
    [0, '#123f9a'],      //    0 ~ 0.25     L* 29
    [0.25, '#1672de'],   // 0.25 ~ 0.5      L* 49
    [0.5, '#19b2d8'],    //  0.5 ~ 0.75     L* 67
    [0.75, '#74cf8c'],   // 0.75 ~ 1        L* 76
    [1, '#e6e04e'],      //    1 ~ 1.5      L* 87   ← 봉우리
    [1.5, '#eda243'],    //  1.5 ~ 2        L* 72
    [2, '#e65a3c'],      //    2 ~ 3        L* 57
    [3, '#d01556'],      //        ≥ 3      L* 45
  ],
  isolines: null,        // 점이다 — 선을 그을 면이 없다
  legendNote: {
    ko: '무채색(< 0)은 땅이 솟아 상대 해수면이 내려가는 곳입니다 — 스칸디나비아 · 알래스카',
    en: 'The grey band (< 0) is where the land is rising, so relative sea level falls — Scandinavia, Alaska',
  },
});

/**
 * 원판을 지형 위로 띄우는 높이(지구 반지름 단위 · 약 7.6 km). 색면(FLOOD_LIFT ≈ 1.9 km)보다 높다:
 * 원판은 '물가의 선'이 아니라 **한 지점의 표식**이라 몇 km 의 시차가 뜻을 바꾸지 않고,
 * 과장(uExagger 최대 50×)을 켠 해안 산지에 파묻히지 않아야 한다.
 */
export const SLR_DISC_LIFT = FIELD_LIFT;
/** 카드 · 범례의 작은 점이 쓰는 테 — 화면의 원판과 **같은 것**이다(js/slr-plates.js 가 정본). */
export { SLR_PLATE_RIM };
/** 원판이 서는 자리(renderOrder). 구름(1) · 비(3) · 입자(4) **위**다 — 구름을 끄지 않고도 숫자가 읽혀야 한다. */
export const SLR_PLATE_ORDER = 7;
/**
 * 다시 솎는 문턱 — 카메라가 제 거리의 이만큼 움직였거나, 거리가 이 비율만큼 바뀌었거나, 이 시간이 지났을 때.
 * 그 사이에는 **지평선 흐림만** 고친다(1,016곳을 매 프레임 화면으로 옮기고 정렬하면 폰이 뜨거워진다 —
 * obs-labels.js OBS_RECULL_* 과 같은 사정이고 같은 방식이다).
 */
export const SLR_RECULL = Object.freeze({ moveFrac: 0.004, zoomFrac: 0.015, jumpFrac: 0.05, everyMs: 600, minMs: 100 });
/**
 * 늘 떠 있는 범례의 출처 줄에 적는 짧은 이름. 범례 상자는 340 px 고정이라 원본의 긴 제목
 * ('IPCC AR6 Sea Level Projections (Garner et al. 2021) · NASA/JPL Sea Level Projection Tool')이 들어가지 않는다.
 * **온전한 출처와 라이선스는 카드가 doc.source 그대로 적는다** — 짧은 쪽이 정본을 대신하지 않는다.
 * 글자는 recompute 의 doc.source 기본값과 같은 것이다(자료에 출처가 없을 때 쓰는 그 이름).
 */
export const SLR_LEGEND_SOURCE = 'IPCC AR6 · NASA/JPL';

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
      id: it.id, name: it.name || '', country: it.country || '', span: it.span || '', lat: it.lat, lon: it.lon, s: it.s,
      x: cl * Math.cos(lo), y: cl * Math.sin(lo), z: Math.sin(la),
    });
  }
  return out;
};

/** 한 시나리오·연도의 관측소 값 세 줄 [중앙값, 하한, 상한] → 중앙값 배열(스텐실의 차례와 같다). */
export const stationMedians = (stations, scenario, year) => stations.map((s) => s.s[scenario][year][0]);

/**
 * 상승폭 `a` 를 `b` 와 **관측소 하나하나** 견준다 → { n, lower, higher, verdict }.
 *   verdict 'same' 전부 같다 · 'below' 한 곳도 더 높지 않다 · 'above' 한 곳도 더 낮지 않다 · 'mixed' 엇갈린다
 *
 * 왜 이 물음이 면적 이야기가 되나: 상승폭 격자는 IDW 라 어느 칸의 값도 **양수 무게의 가중평균**이고 무게의 합은 1 이다
 * (riseGridOf). 그러니 지점값이 한 곳도 안 높으면 **어느 칸의 상승폭도 안 높다.** 그리고 칠하는 규칙은
 * '지형 ≤ 상승폭' 이라 상승폭에 대해 단조다 — 칠해지는 땅은 반드시 부분집합이 된다.
 * 바다 도달 판(reach)은 riseMaxGridOf, 즉 **시나리오·연도와 무관한** 최댓값으로 굽기 때문에 이 비교를 흔들지 않는다.
 * → 그래서 'below' 일 때만 카드가 "그 칸보다 좁습니다"를 거짓 없이 말할 수 있다.
 *
 * ⚠️ 운영 자료로 재 보니 12칸 가운데 **11칸이 'mixed'** 다(2026-09-21 실측). 배출이 낮거나 이른 해라도
 *    땅이 솟는 관측소(스칸디나비아 · 알래스카 · 31곳이 음수)에서는 값이 거꾸로 **높다** — 시간이 갈수록 더 내려가기 때문이다.
 *    예: SSP1-2.6/2050 은 1,016곳 중 1,000곳이 낮고 16곳이 높다. 그래서 verdict 만으로는 카드가 할 말이 없어진다 —
 *    센 수(lower · higher)를 같이 들려 보내, 말할 수 있는 것은 말하고 말할 수 없는 것은 말할 수 없다고 적게 한다.
 * 견줄 수 없으면(길이가 다르거나 비어 있으면) null — 모르는 것을 '같다'로 메우지 않는다.
 */
export const riseCompare = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return null;
  let lower = 0;
  let higher = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < y) lower += 1;
    else if (x > y) higher += 1;
  }
  const verdict = (!lower && !higher) ? 'same' : (lower && higher) ? 'mixed' : (higher ? 'above' : 'below');
  return Object.freeze({ n: a.length, lower, higher, verdict });
};

/**
 * ar6.json 의 `country` 글자 그대로 — **대한민국**의 열쇠다.
 * ⚠️ 2026-09-21 반박 검증: 카드가 `startsWith('Korea')` 로 골라 북한 관측소 한 곳(SONBONG)이 '한국 24곳'에 섞여 있었다.
 *    앱의 다른 곳에서 '한국'은 대한민국이고, 화면의 나라 원판도 `country` 글자 그대로 갈라 두 나라를 따로 세운다
 *    (slr-plates.js countryGroups) — 화면은 가르는데 카드만 뭉쳐 세고 있었다.
 *    이름을 '한반도'로 바꾸는 길도 있었지만, 그러면 화면의 원판 둘과 카드의 한 덩어리가 다시 어긋난다.
 */
export const KOREA_COUNTRY = 'Korea, Republic Of';

/** '한국' 줄이 세는 관측소 — 화면의 나라 원판과 **같은 가름**(country 글자 그대로)이다. */
export const koreaStations = (rows = []) => rows.filter((r) => r && r.country === KOREA_COUNTRY);

/**
 * ⚠️ 2026-09-20 작업 E5 — `discOrder`(작은 값부터 찍어 큰 값을 위에 남기던 차례)와 `stationFacing`(뒤편 버리기)은
 * 여기서 사라졌다. **겹치는 것을 그려 놓고 위에 남기는 대신 아예 솎기** 때문이다(slr-plates.js thinPlates).
 * 솎을 때의 차례는 `plateRank` 가 정하고(한국 먼저 · 그다음 |값| 이 큰 것부터), 뒤편은 `plateOpacity` 가 0 으로 만든다.
 * 되살리지 마라: 두 벌의 '무엇이 위에 오나' 규칙이 있으면 화면과 누르기가 서로 다른 것을 고른다.
 */

/** 위도·경도(도) → 반지름 r 의 단위구 위 자리. main.js · live-layers 의 llToV3 와 같은 축 규약이다(x = cosφ·sinλ · y = sinφ · z = cosφ·cosλ). */
export const stationPoint = (lat, lon, r = 1) => {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const c = Math.cos(la) * r;
  return [c * Math.sin(lo), Math.sin(la) * r, c * Math.cos(lo)];
};

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

// ── 관측소 원반의 셰이더는 사라졌다 (2026-09-20 작업 E5) ────────────────────────────────────────────────────
// gl_PointSize 로 그리던 익명 원반(SLR_DISC_VERT · SLR_DISC_FRAG)을 걷어냈다. GL 점 안에는 **글자를 넣을 수 없어서**다 —
// PD 가 요구한 것은 '숫자가 적힌 원판'이고, 숫자는 캔버스에 굽는 수밖에 없다(js/slr-plates.js plateTexture).
// 되살리지 마라: 점과 원판이 같이 서면 같은 관측소가 화면에 두 번 뜬다.

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

/** 카드 안의 원판 범례 — 늘 떠 있는 범례(field-legend.js)와 **같은 표**에서 나온다. 칸의 색·글자를 여기 적지 않는다. */
export const slrDiscLegendHtml = () => {
  const cells = legendModel(SLR_RISE_SCALE).map((c) => `<span style="display:inline-flex;align-items:center;gap:4px">`
    + `<i style="width:11px;height:11px;border-radius:50%;background:${c.color};border:1px solid rgb(${SLR_PLATE_RIM.color.map((v) => Math.round(v * 255)).join(',')});display:inline-block"></i>${esc(c.label)}</span>`).join('');
  return `<span style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 2px">${esc(SLR_RISE_SCALE.name.ko)} ${cells}</span>`;
};

/**
 * 못 세운 까닭을 **가른 두 수** — 겹쳐서 · 자리(상한)가 모자라서.
 * ⚠️ 2026-09-21 폰 실측 ②: 예전에는 둘을 한 수로 합쳐 놓고 화면에는 전부 '겹쳐'라 적었다. 폰에서 훑은 판
 *    10,200개 가운데 9,360개가 상한에 걸려 있었으므로, 그 문장이 말하던 수는 거의 전부 **겹친 적 없는 것**이었다.
 *    화면 밖으로 투영된 것은 어느 쪽에도 넣지 않는다 — 겹친 적이 없고, 이번 화면에 그릴 수도 없다.
 * 옛 model 처럼 hidden 하나만 오면 전부 겹침으로 읽는다(카드·범례의 순수 시험이 그 꼴을 쓴다).
 */
export const plateThinCounts = (m = {}) => {
  const capped = Number.isFinite(m.capped) && m.capped > 0 ? m.capped : 0;
  const clashed = Number.isFinite(m.clashed)
    ? Math.max(0, m.clashed)
    : Math.max(0, (Number.isFinite(m.hidden) ? m.hidden : 0) - capped);
  return { clashed, capped };
};

/** 그 두 수를 '겹쳐 N곳 · 자리가 모자라 M곳' 꼴로 — 0 인 쪽은 적지 않는다. 뒤에 붙는 말은 부르는 쪽이 정한다. */
export const plateThinBody = (m, lead = '겹쳐') => {
  const { clashed, capped } = plateThinCounts(m);
  const p = [];
  if (clashed > 0) p.push(`${lead} ${clashed.toLocaleString()}곳`);
  if (capped > 0) p.push(`자리가 모자라 ${capped.toLocaleString()}곳`);
  return p.join(' · ');
};

/**
 * 늘 떠 있는 범례에 넘길 것(순수). run · valid 를 넘기지 않는다 — 이 레이어는 타임라인을 구독하지 않고(머리말),
 * '유효 시각'을 적으면 2100년 전망이 5일 예보처럼 읽힌다. 시나리오·연도는 출처 줄에 글자로 적는다.
 * 풀이 줄(note)은 넘기지 않는다 — 넘기면 눈금표의 legendNote(음수 칸 설명)를 통째로 잃는다(field-legend.js legendView).
 */
export const slrLegendArgs = (m) => {
  const sc = FLOOD_SCENARIOS.find((s) => s.id === m.scenario) || FLOOD_SCENARIOS[3];
  // ⚠️ 솎은 수는 **늘 떠 있는 범례**에도 적는다(2026-09-20 작업 E5 · 지시서 "솎은 것이 있으면 화면이 그 사실을 말해야 한다").
  //    카드는 닫혀 있을 수 있고 메뉴 줄도 그렇다 — 범례는 이 레이어가 켜져 있는 동안 늘 화면에 있다.
  const body = plateThinBody(m);
  const hid = body ? ` · ${body} 솎음` : '';
  return { scale: SLR_RISE_SCALE, source: `${SLR_LEGEND_SOURCE} · ${sc.label} · ${m.year}${hid}` };
};

/** 원판을 누르면 뜨는 카드의 제목 — 관측소 이름과 나라. */
export const stationCardTitle = (st) => `${st.name || st.id}${st.country ? ` · ${st.country}` : ''}`;

/** 나라 원판을 누르면 뜨는 카드의 제목. 관측소가 한 곳뿐이면 **나라가 아니라 그 관측소**를 제목으로 낸다(없는 대표성을 짓지 않는다). */
export const countryCardTitle = (g, stations) => (g.n === 1
  ? stationCardTitle(stations[g.idx[0]])
  : `${g.country} · 조위관측소 ${g.n}곳`);

/**
 * 나라 원판을 누르면 뜨는 카드(순수). 관측소 수 · 중앙값 · 범위.
 * ⚠️ **이 값은 기관이 발표한 나라별 값이 아니다.** IPCC AR6 이 내놓은 것은 조위관측소 지점값이고,
 *   그것을 나라로 묶어 중앙값을 낸 것은 EARTHUS 의 집계다 — 카드가 그 줄을 반드시 적는다.
 * ⚠️ 관측소가 한 곳뿐인 나라가 113개 중 40개다(운영 자료 실측 · slr-plates.js 머리말). 그때는 '중앙값'이라는 말을
 *   쓰지 않는다: 관측소 하나의 값을 중앙값이라 부르면 여러 곳을 재 본 것처럼 읽힌다.
 */
export const countryCardHtml = (g, stations, m) => {
  const sc = FLOOD_SCENARIOS.find((s) => s.id === m.scenario) || FLOOD_SCENARIOS[3];
  const one = stations[g.idx[0]];
  if (g.n === 1) {
    return `${stationCardHtml(one, m)}<br/><span style="opacity:.8"><b>${esc(g.country)}에는 이 조위관측소 한 곳뿐입니다.</b> `
      + `그래서 이 원판은 나라 값이 아니라 <b>관측소 한 곳의 값</b>입니다.</span>`;
  }
  const s = g.summary || {};
  const dot = legendModel(SLR_RISE_SCALE).find((b) => b.index === bandIndex(SLR_RISE_SCALE, s.median));
  const L = [];
  L.push(`<b style="font-size:19px">${dot ? `<i style="width:12px;height:12px;border-radius:50%;background:${dot.color};`
    + `border:1px solid rgb(${SLR_PLATE_RIM.color.map((x) => Math.round(x * 255)).join(',')});display:inline-block;margin-right:6px"></i>` : ''}`
    + `${esc(fmtM(s.median))}</b> <span style="opacity:.8">(관측소 ${g.n}곳의 중앙값 · 범위 ${esc(fmtM(s.min))} ~ ${esc(fmtM(s.max))})</span>`);
  L.push(`${esc(sc.label)} <span style="opacity:.75">${esc(sc.word)}</span> · ${esc(m.year)}년`);
  if (s.min < 0 && s.max >= 0) L.push('<b>이 나라 안에서 방향이 갈립니다</b> — 땅이 솟아 상대 해수면이 내려가는 관측소가 섞여 있습니다.');
  else if (s.max < 0) L.push('<b>이 나라는 땅이 솟아 상대 해수면이 내려갑니다.</b> 빙하가 물러난 뒤 지각이 되올라오는 곳입니다.');
  L.push(`<span style="opacity:.8">원판은 이 나라 관측소들의 <b>가운데 자리에 가장 가까운 관측소</b> 위에 섰습니다 — `
    + `${esc(stations[g.medoid].name || '')} ${esc(stations[g.medoid].lat.toFixed(2))}° ${stations[g.medoid].lat >= 0 ? 'N' : 'S'}. `
    + `확대하면 관측소 하나하나로 갈라집니다.</span>`);
  L.push(`<span style="opacity:.8">기준선 ${esc(m.baseline)} · 출처 ${esc(m.source)} · ${esc(m.license)}</span>`);
  L.push('<span style="opacity:.8"><b>나라별 값은 기관이 발표한 것이 아니라 EARTHUS 가 묶은 집계입니다.</b> '
    + 'IPCC AR6 이 내놓은 것은 조위관측소 지점값이고, 그것을 나라로 모아 중앙값을 낸 것은 우리 셈입니다.</span>');
  return L.join('<br/>');
};

/**
 * 원반을 누르면 뜨는 카드(순수). 값 · 17~83% 범위 · 시나리오 · 연도 · 기준선 — 카드가 **무엇에 대한 수인지** 다 말한다.
 * 기준선을 빼면 '0.78 m' 가 어디서부터 0.78 m 인지 알 수 없다(1995–2014 평균 대비다).
 */
export const stationCardHtml = (st, m) => {
  const sc = FLOOD_SCENARIOS.find((s) => s.id === m.scenario) || FLOOD_SCENARIOS[3];
  const cell = (st.s && st.s[m.scenario] && st.s[m.scenario][m.year]) || [];
  const v = cell[0];
  const dot = legendModel(SLR_RISE_SCALE).find((b) => b.index === bandIndex(SLR_RISE_SCALE, v));
  const L = [];
  L.push(`<b style="font-size:19px">${dot ? `<i style="width:12px;height:12px;border-radius:50%;background:${dot.color};`
    + `border:1px solid rgb(${SLR_PLATE_RIM.color.map((x) => Math.round(x * 255)).join(',')});display:inline-block;margin-right:6px"></i>` : ''}`
    + `${esc(fmtM(v))}</b> <span style="opacity:.8">(17~83% ${esc(fmtM(cell[1]))} ~ ${esc(fmtM(cell[2]))})</span>`);
  L.push(`${esc(sc.label)} <span style="opacity:.75">${esc(sc.word)}</span> · ${esc(m.year)}년`);
  if (v < 0) L.push('<b>이곳은 땅이 솟아 상대 해수면이 내려갑니다.</b> 빙하가 물러난 뒤 지각이 되올라오는 곳입니다.');
  L.push(`<span style="opacity:.8">${esc(st.lat.toFixed(3))}° ${st.lat >= 0 ? 'N' : 'S'} · ${esc(Math.abs(st.lon).toFixed(3))}° ${st.lon >= 0 ? 'E' : 'W'}`
    + `${st.span ? ` · 관측 기간 ${esc(st.span)}` : ''}</span>`);
  L.push(`<span style="opacity:.8">기준선 ${esc(m.baseline)} · 출처 ${esc(m.source)} · ${esc(m.license)}</span>`);
  L.push(`<span style="opacity:.8">값은 <b>중앙값</b>이고 괄호는 17~83% 범위입니다. 배출 경로별 <b>전망</b>이라 예보가 아닙니다.</span>`);
  return L.join('<br/>');
};

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
 * '칠해지는 땅이 얼마나 되나' 한 줄(순수).
 *
 * 무엇이 잘못돼 있었나(2026-09-21 반박 검증): 카드가 `0.19% · 279,614 km²` 를 **고정 숫자**로 적었는데,
 * 같은 카드 위의 시나리오 4 × 연도 3 = 12칸 어느 것을 눌러도 그 수가 그대로였다. 칠하는 규칙은 상승폭에 대해
 * 단조라 SSP1-2.6/2050 과 SSP5-8.5/2150 이 같을 수 없다 — 화면이 바뀌는데 숫자만 안 바뀌면 그 숫자가 거짓이 된다.
 *
 * 고친 방향: **잰 칸과 지금 칸을 둘 다 문장 안에 적는다.** 그리고 넓이의 방향은 `riseCompare`
 * (관측소 1,016곳을 하나하나 견준 결과)가 **보장하는 만큼만** 말한다.
 *   'same'  → 지금 화면이 바로 잰 칸이다. 숫자를 그대로 적는다.
 *   'below' → 잰 칸보다 **반드시** 좁다(riseCompare 주석의 단조성).  'above' → 반드시 넓다.
 *   'mixed' → 한 방향으로 말할 수 없다. 대신 **센 수**를 적는다(몇 곳이 낮고 몇 곳이 높은가).
 *   null    → 견주지 못했다. 잰 칸의 수만 그 칸의 것으로 적는다.
 * ⚠️ 지금 칸의 면적을 **숫자로 적지 않는다.** 그것을 알려면 0.25° 격자 100만 칸을 단추를 누를 때마다 다시 세야 하고
 *    (바다 도달 판을 굽는 것과 같은 일이다), 그 값이 없는데 있는 척하지 않는 것이 이 저장소의 잣대다.
 */
export const floodPaintedLine = (m = {}) => {
  const at = FLOOD_SCENARIOS.find((s) => s.id === FLOOD_PAINTED_AT.scenario) || FLOOD_SCENARIOS[3];
  const atText = `${at.label} · ${FLOOD_PAINTED_AT.year}년`;
  const now = FLOOD_SCENARIOS.find((s) => s.id === m.scenario);
  const nowText = now && m.year ? `${now.label} · ${m.year}년` : '';
  const size = `<b>${FLOOD_PAINTED_PCT}%</b>(약 ${FLOOD_PAINTED_KM2.toLocaleString()} km²)`;
  const head = '<b>물빛 면은 이 지형 자료에서 해수면보다 낮아지는 땅</b>입니다 — '
    + '네덜란드 · 미시시피 하류 · 북유럽 연안이 여기서 칠해집니다. ';
  const c = m.painted;
  if (c && c.verdict === 'same') {
    return `<span style="opacity:.85">${head}지금 화면(${esc(atText)})에서 칠해지는 땅은 전지구 육지의 ${size}입니다.</span>`;
  }
  const lead = `${head}칠해지는 땅을 재 본 것은 <b>${esc(atText)}</b> 한 칸이고, 그때 전지구 육지의 ${size}였습니다. `
    + `${nowText ? `지금 화면은 <b>${esc(nowText)}</b>라 이 수가 아닙니다 — ` : ''}`;
  const tail = !c
    ? '지금 칸의 넓이는 견주지 못했습니다.'
    : c.verdict === 'below'
      ? `관측소 ${c.n.toLocaleString()}곳이 <b>한 곳도 그 칸보다 높지 않아</b> 칠해지는 땅은 그보다 좁습니다.`
      : c.verdict === 'above'
        ? `관측소 ${c.n.toLocaleString()}곳이 <b>한 곳도 그 칸보다 낮지 않아</b> 칠해지는 땅은 그보다 넓습니다.`
        : `관측소 ${c.n.toLocaleString()}곳 가운데 <b>${c.lower.toLocaleString()}곳이 그 칸보다 낮고 ${c.higher.toLocaleString()}곳이 높습니다</b>`
          + '(높은 쪽은 땅이 솟아 상대 해수면이 내려가는 곳입니다). 그래서 <b>넓이가 어느 쪽인지는 이 자료만으로 말할 수 없습니다.</b>';
  return `<span style="opacity:.85">${lead}${tail}</span>`;
};

/**
 * 카드 안쪽 글(순수).  model = 겹면의 model() — 지금 시나리오·연도·통계·육지 판 정보가 들어 있다.
 * 이웃한 카드들(live-layers.js 의 metaXxx)이 전부 한국어라 이 카드도 한국어다 — 색면 카드(field-layer.js)의 두 나라 말 규약은 저쪽 화면의 것이다.
 */
export const floodCardInner = (m) => {
  const sc = FLOOD_SCENARIOS.find((s) => s.id === m.scenario) || FLOOD_SCENARIOS[3];
  const btn = (action, data, on, text) => `<button data-action="${action}" data-layer="slr" ${data} aria-pressed="${on ? 'true' : 'false'}" style="${pressed(on)}">${esc(text)}</button>`;
  const L = [];
  L.push(`<b>해수면 상승 전망 — ${esc(sc.label)} · ${esc(m.year)}년</b>`);
  L.push('<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0 2px">배출 시나리오 '
    + FLOOD_SCENARIOS.map((s) => btn('slr-scenario', `data-ssp="${s.id}"`, s.id === m.scenario, s.label)).join('') + '</span>');
  L.push('<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 4px">기준 연도 '
    + FLOOD_YEARS.map((y) => btn('slr-year', `data-year="${y}"`, y === m.year, `${y}년`)).join('') + '</span>');
  // ── 주인공: 숫자 원판 ───────────────────────────────────────────────────────────────────────────────────
  L.push(slrDiscLegendHtml());
  L.push(`전 세계 조위관측소 <b>${m.stations.toLocaleString()}곳</b>의 상대 해수면 상승 전망을 <b>숫자를 적은 원판</b>으로 올렸습니다. `
    + `<b>멀리서는 나라 하나에 원판 하나</b>(그 나라 관측소들의 중앙값 · 이름줄에 관측소 수), `
    + `<b>확대하면 관측소 하나하나로 갈라집니다.</b> 원판을 누르면 그 곳의 중앙값과 17~83% 범위가 나옵니다. `
    + `<span style="opacity:.75">단위는 m 이고 크기는 어디서나 같습니다 — 원판은 길이로 값을 말하지 않습니다.</span>`);
  L.push(`<b>나라별 값은 기관이 발표한 것이 아니라 EARTHUS 가 묶은 집계입니다.</b> `
    + `IPCC AR6 이 내놓은 것은 <b>조위관측소 지점값</b>이고, 그것을 나라로 모아 중앙값을 낸 것은 우리 셈입니다. `
    + `<b>관측소가 한 곳뿐인 나라가 ${esc(String(m.soloCountries ?? 0))}개</b>(전체 ${esc(String(m.countries ?? 0))}개 나라 가운데)라 `
    + `그런 곳의 원판은 나라 이름 대신 <b>그 관측소 이름</b>을 답니다.`);
  if (m.plateMode) {
    const mode = m.plateMode === 'station' ? '관측소 하나하나' : m.plateMode === 'mixed' ? '일부는 나라 · 일부는 관측소' : '나라 단위';
    const thin = plateThinBody(m, '겹쳐서');
    L.push(`지금 화면: <b>${esc(mode)}</b> · 원판 ${esc(String(m.plateShown ?? 0))}개`
      + (thin ? ` · <b>${esc(thin)}을 솎았습니다</b>(확대하면 나옵니다)` : ' · 솎은 것 없음'));
  }
  L.push(`전지구 중앙값 <b>${esc(fmtM(m.globalMedian))}</b> · 관측소 범위 ${esc(fmtM(m.min))} ~ ${esc(fmtM(m.max))}`
    + `<span style="opacity:.75"> (음수 = 땅이 솟아 상대 해수면이 내려가는 곳)</span>`);
  if (m.top.length) {
    L.push(`가장 큰 곳: ${m.top.map((t) => `${esc(t.name)} <b>${esc(fmtM(t.v))}</b> <span style="opacity:.75">(${esc(fmtM(t.lo))}~${esc(fmtM(t.hi))})</span>`).join(' · ')}`);
  }
  if (m.korea.length) {
    L.push(`한국 ${m.koreaCount}곳 중 큰 곳: ${m.korea.map((t) => `${esc(t.name)} <b>${esc(fmtM(t.v))}</b> <span style="opacity:.75">(${esc(fmtM(t.lo))}~${esc(fmtM(t.hi))})</span>`).join(' · ')}`);
  }
  L.push(`<b>출처 ${esc(m.source)}</b> · ${esc(m.license)} · 기준선 ${esc(m.baseline)}<br/>`
    + `값은 <b>중앙값</b>이고 괄호는 17~83% 범위입니다. 예보가 아니라 배출 경로별 전망이라 타임라인(5일 예보)과 잇지 않았습니다.`);
  // ── 같이 켜지는 것: '잠기는 땅' 색면 (2026-09-20 작업 E5 부터 **기본 켬**) ───────────────────────────────
  // PD: "육지 위로 물이 올라온거 색으로 표현하고, 그위에 나라 도시 단위로 숫자 원판도 올리는게 맞을거 같은데?"
  // E4 에서 단추 뒤로 내렸던 것을 앞면으로 되돌린다. 내렸던 이유(표면 고도라 아시아 삼각주가 빠진다)는 그대로 참이므로
  // **끄는 단추는 남기고**, 무엇이 칠해지고 무엇이 빠지는지를 카드가 먼저 말한다.
  L.push('<span style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 2px">'
    + btn('slr-depth', '', !!m.depth, m.depth ? '잠기는 땅 끄기' : '잠기는 땅 켜기') + '</span>');
  L.push(floodPaintedLine(m));
  L.push('<span style="opacity:.85"><b>⚠️ 실제로 가장 위험한 곳이 오히려 빠집니다.</b> '
    + '두 가지 이유를 이 세션이 타일을 받아 직접 쟀습니다 — '
    + '① 지형이 건물 · 나무가 얹힌 <b>표면 고도</b>라 가장 크게 확대해도 다카 12 m · 뉴올리언스 7 m · 로테르담 2.4 m 로 읽혀 '
    + '상승폭(0.8~1.8 m)보다 높습니다. ② <b>다카 · 호찌민은 해안에서 100 km 넘게 들어가 있어</b> '
    + '약 28 km 격자의 바다 연결 판에서 대양과 끊깁니다. 고치는 길은 확대가 아니라 <b>맨땅 지형(DTM)</b>입니다.</span>');
  if (!m.depth) return L.join('<br/>');
  if (!m.hasHeight) {
    // 고칠 수 있는 척하지 않는다 — 지형이 없으면 판정 자체가 없다.
    L.push('<b>지형 고도를 받지 못해 잠기는 땅을 그리지 않습니다.</b> 이 레이어는 지구 셰이더가 쓰는 높이맵으로 '
      + '\'물보다 낮은 땅\'을 가르는데, 그 자료가 없으면 어디가 낮은지 알 수 없습니다.');
  }
  L.push(floodLegendHtml());
  L.push(`관측소 값을 1° 격자로 이어(가까운 ${FLOOD_IDW_K}곳 · 거리 제곱 반비례) <b>그 값보다 낮은 땅</b>을 덮은 것입니다.`);
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
  // (2026-09-23 정정) '약 10 km' 는 PC(z4)의 값이다. 폰은 z3 한 장이라 약 20 km — 얹힌 고도맵에서 센 값(m.terrainKm)을 쓴다.
  L.push(`<b>③ 지형 해상도가 전지구 약 ${m.terrainKm ? Math.round(m.terrainKm) : 10} km · 확대하면 약 300 m</b> 라 좁은 만 · 제방 · 수로는 보지 못합니다. `
    + `또 도시의 고도 자료는 <b>건물 · 제방이 섞인 표면 고도</b>라 밀집 시가지(도쿄 · 방콕 · 상하이 · 뉴올리언스 · 로테르담)는 `
    + `실제 지면보다 몇 m 높게 읽혀 <b>확대해도 칠해지지 않을 수 있습니다.</b>`);
  // 출처 · 기준선 · '중앙값과 17~83%' 는 이제 카드 위쪽(원반 이야기)에 늘 떠 있다 — 같은 문장을 두 번 적지 않는다.
  // 여기 남는 것은 **이 색면에만 해당하는 주인 가르기**다: 지시서 §이 현상 — '기관 시나리오 전망'과 '우리 셈'을 한 배지로 묶지 않는다.
  L.push(`<b>④ 상승폭은 기관 전망</b>(IPCC AR6)이고, 그 높이를 지금 지형과 견줘 '어디가 낮은가'를 가른 것은 <b>EARTHUS 의 셈</b>입니다.`);
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

/** 메뉴에 적히는 한 줄 — 무엇이 켜졌는지 값으로 말한다. 솎은 수는 여기에도 적는다(카드가 닫혀 있어도 읽히게). */
export const floodNote = (m) => {
  const sc = FLOOD_SCENARIOS.find((s) => s.id === m.scenario) || FLOOD_SCENARIOS[3];
  const body = plateThinBody(m);
  return `${sc.label} · ${m.year}년 · 전지구 중앙값 ${fmtM(m.globalMedian)} · 관측소 ${m.stations.toLocaleString()}곳`
    + (body ? ` · ${body} 솎음` : '')
    + (m.depth ? ' · 잠기는 땅 켜짐' : '');
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  그리기
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════


// (2026-09-23 · PERF-LTE V2-1) 전역 고도맵 한 칸의 적도 폭(km). Terrarium 은 2^z·256 px 로 지구 둘레 40,075 km 를 덮는다.
export function globalTerrainKm(tex) {
  const w = tex && tex.image && tex.image.width;
  return w > 0 ? 40075 / w : null;
}

/**
 * createFloodOverlay(doc, deps)
 *   doc   ar6.json 문서 { items, source, license, baseline, … }
 *   deps  { terrain, geometry, landMask, onCard, getDocument, segments } — 전부 선택
 *     terrain   main.js 지구의 uniform 묶음(uHeightMap · uHasHeight · uExagger · uDetail*) — **객체를 그대로** 물린다
 *     geometry  지구의 SphereGeometry 를 같이 쓴다(정점이 같아야 평행면이다 · 52만 정점을 한 벌 더 올리지 않는다)
 *     landMask  land-mask.js 의 저장소. 없으면 앱이 나눠 쓰는 하나. 못 받으면 고도의 부호만으로 가른다(열린 실패).
 *     onCard    (swap) => void — 카드 글이 바뀌면 부른다(field-layer.js 의 같은 이름과 같은 약속)
 *     legend    늘 떠 있는 범례. 없으면 앱이 나눠 쓰는 하나(field-legend.js) — 주인 이름은 'slr' 이다.
 */
export function createFloodOverlay(doc = {}, deps = {}) {
  const t = deps.terrain || {};
  const stations = floodStations(doc.items || []);
  // 관측소가 하나도 없으면 **그리지 않는다.** 0 m 를 상승폭으로 두면 해수면보다 낮은 땅이 통째로 잠긴 그림이 되고,
  // 그것은 자료가 없다는 사실을 색으로 지어내는 것이다(레이어는 켜지지 않고 그 이유를 말한다 — live-layers.toggle).
  if (!stations.length) throw new Error('해수면 상승 전망에 쓸 조위관측소가 없습니다');
  const stencil = buildRiseStencil(stations);
  // ⚠️ 상태는 **한 벌뿐**이다. 원반과 색면이 같은 state 를 읽는다 — 두 벌이면 단추를 눌렀을 때 하나만 바뀐다.
  //    depth 는 '잠기는 땅 색면을 켰나'이고 **기본은 켬**이다(2026-09-20 작업 E5 · 카드의 slr-depth 단추로 끌 수 있다).
  const state = { scenario: FLOOD_DEFAULT.scenario, year: FLOOD_DEFAULT.year, depth: FLOOD_DEPTH_DEFAULT };
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
  mesh.visible = state.depth;                      // 기본 켬(FLOOD_DEPTH_DEFAULT) — 카드의 단추로 끌 수 있다
  const group = new THREE.Group();
  group.add(mesh);

  // ── 숫자 원판 (이 화면의 주인공 · js/slr-plates.js) ─────────────────────────────────────────────────────
  // 나라 묶음과 메도이드 자리는 **관측소 자리만으로** 정해진다 → 시나리오·연도가 바뀌어도 그대로다(한 번만 짓는다).
  // 바뀌는 것은 값(숫자·색)뿐이고, 그것은 recompute() 가 `values` 를 새로 내면서 다음 솎기에 따라온다.
  const groups = countryGroups(stations);
  const shortName = shortCountryNames(groups.map((g) => g.country));
  const groupOfStation = new Uint16Array(stations.length);
  groups.forEach((g, gi) => { for (const i of g.idx) groupOfStation[i] = gi; });
  const soloCountries = groups.filter((g) => g.n === 1).length;
  const plates = new SlrPlates({
    makeTexture: deps.makeTexture,                 // 시험은 캔버스가 없다 — 가짜를 넣는다
    renderOrder: SLR_PLATE_ORDER,
    lift: SLR_DISC_LIFT,
  });
  group.add(plates.object);

  // 화면 크기 — flood-discs.js 와 같은 길로 얻는다(렌더러를 기다리지 않는다: 스프라이트에는 onBeforeRender 가 없다).
  const getViewport = deps.getViewport || ((out) => {
    out.w = globalThis.innerWidth > 0 ? globalThis.innerWidth : 0;
    out.h = globalThis.innerHeight > 0 ? globalThis.innerHeight : 0;
    return out;
  });
  const now = deps.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const view = { w: 0, h: 0 };
  const vpM = new THREE.Matrix4();
  const px2 = [0, 0];
  let lastCamera = null;
  // 솎기의 결과 — 누를 때 이 목록만 본다. **그린 것만 눌린다**(화면에 없는 관측소의 카드가 뜨지 않는다).
  let shownPlates = [];
  let hiddenCount = 0;
  // 못 선 까닭을 **가른다**: 겹쳐서 · 자리(상한)가 없어서 · 이번 화면 밖이라서. 화면이 '겹쳐 N곳 솎음'이라 적으므로
  // 그 N 에 겹치지 않은 것을 넣으면 거짓말이 된다(2026-09-21 폰 실측 ②의 곁가지).
  let clashedCount = 0;
  let cappedCount = 0;
  let offScreenCount = 0;
  let plateMode = null;                            // 'country' | 'station' | 'mixed'
  const splitState = new Map();                    // 나라 → 지난번에 갈라져 있었나(되새김)
  // 관측소의 지구 위 자리 — 움직이지 않으므로 한 번만 센다(매 프레임 sin/cos 를 1,016번 부르지 않는다).
  const stationPos = new Float32Array(stations.length * 3);
  for (let i = 0; i < stations.length; i += 1) {
    const p = stationPoint(stations[i].lat, stations[i].lon, 1 + SLR_DISC_LIFT);
    stationPos[i * 3] = p[0]; stationPos[i * 3 + 1] = p[1]; stationPos[i * 3 + 2] = p[2];
  }
  const projected = new Float32Array(stations.length * 2);
  const visible = new Uint8Array(stations.length);
  /** 지금 시나리오·연도의 관측소 값 — recompute() 가 채운다. 원판의 숫자·색이 여기서 나온다. */
  let lastValues = stationMedians(stations, state.scenario, state.year);
  let lastCull = { x: 0, y: 0, z: 0, r: 0, w: 0, h: 0, t: -1e9 };
  let plateSig = null;

  /** 지금 화면에서 원판 하나의 지름(px). 화면 높이에 매인다(slr-plates.js SLR_PLATE_SCALE 머리말). */
  const platePxOf = () => (view.h > 0 ? SLR_PLATE_SCALE * view.h : SLR_PLATE_PX);

  /**
   * 지금 화면의 눈금 — 지구 위 1° 가 화면에서 몇 px 인가. 카메라 **바로 아래 점**과 거기서 1° 떨어진 점을
   * 실제로 화면으로 옮겨 재는 것이라, 시야각 · 고도 · 화면 크기를 따로 셈하지 않는다(식이 두 벌이 될 자리가 없다).
   * 가장자리에서는 실제보다 작게 나온다 — 그쪽 나라는 뭉친 채로 남는다(원하는 쪽으로 틀린다).
   */
  const subA = [0, 0];
  const subB = [0, 0];
  function screenScale(e, cx, cy, cz) {
    const L = Math.hypot(cx, cy, cz) || 1;
    const r = 1 + SLR_DISC_LIFT;
    const nx = cx / L; const ny = cy / L; const nz = cz / L;
    // 카메라 방향과 직교하는 아무 방향 하나(극에서 무너지지 않게 더 작은 성분 쪽을 고른다)
    let ax = 0; let ay = 0; let az = 0;
    if (Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)) ax = 1;
    else if (Math.abs(ny) <= Math.abs(nz)) ay = 1;
    else az = 1;
    let tx = ay * nz - az * ny;
    let ty = az * nx - ax * nz;
    let tz = ax * ny - ay * nx;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const d = Math.PI / 180;                       // 1°
    const c1 = Math.cos(d); const s1 = Math.sin(d);
    if (!projectPx(e, nx * r, ny * r, nz * r, view.w, view.h, subA)) return 0;
    if (!projectPx(e, (nx * c1 + tx * s1) * r, (ny * c1 + ty * s1) * r, (nz * c1 + tz * s1) * r, view.w, view.h, subB)) return 0;
    return Math.hypot(subB[0] - subA[0], subB[1] - subA[1]);
  }

  /**
   * 원판을 다시 고른다 — 1,016곳을 화면으로 옮기고 · 나라마다 갈라질지 정하고 · 차례대로 솎는다.
   * 매 프레임 돌지 않는다(SLR_RECULL): 그 사이에는 plates.tick 이 지평선 흐림만 고친다.
   */
  function recull(camera) {
    const cm = camera.matrixWorld.elements;
    const cx = cm[12]; const cy = cm[13]; const cz = cm[14];
    vpM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = vpM.elements;
    const platePx = platePxOf();
    // ① 화면 좌표 + 지평선 흐림 + **화면 안인가**
    //    ⚠️ 2026-09-21 폰 실측 ②: 화면 밖을 안 걸렀다. 375×812 화면에서 후보의 자리가 x=1785 · y=2011 이어도
    //       후보로 들어가 차례를 앞지르고 상한을 먹었다 — 폰은 화면이 좁아 투영된 반구의 아주 일부만 담는다.
    //       그래서 **이번 화면에 그릴 수 없는 것은 후보가 아니다**(솎은 것으로도 세지 않는다 — 겹친 적이 없다).
    let offScreen = 0;
    /* ⚠️ 화면 밖만 빼는 것으로는 모자랐다(2026-09-21 폰 실측, 위 고침 **뒤에** 드러난 것).
       원판이 서로 안 겹치게 되자 이번에는 **화면 부품 뒤**로 들어갔다: 375×812 에서 상단 막대(56~102) ·
       범례(108~197) · 하단 알약(600~654) · 출처 독(667~746) · 타임라인(762~802)이 화면의 절반을 덮는데
       솎기는 그것을 몰랐다. 값을 읽으라고 그린 숫자가 UI 뒤에 숨거나 가장자리에서 잘렸다.
       부품의 **실제 상자**를 재서 여백으로 넘긴다 — 수를 박으면 부품이 바뀌는 날 어긋난다. */
    const inset = plateInsetOf(chromeBoxes(), view.w, view.h);
    for (let i = 0; i < stations.length; i += 1) {
      const wx = stationPos[i * 3]; const wy = stationPos[i * 3 + 1]; const wz = stationPos[i * 3 + 2];
      visible[i] = 0;
      if (plateOpacity(wx, wy, wz, cx, cy, cz) < SLR_MIN_OPACITY) continue;
      if (!projectPx(e, wx, wy, wz, view.w, view.h, px2)) continue;
      if (!plateOnScreen(px2[0], px2[1], view.w, view.h, platePx, inset)) { offScreen += 1; continue; }
      projected[i * 2] = px2[0];
      projected[i * 2 + 1] = px2[1];
      visible[i] = 1;
    }
    // ② 나라마다 — 그 나라가 **화면에서 차지하는 폭**으로 갈라질지 정한다(되새김).
    //    ⚠️ 보이는 관측소만으로 재면 안 된다: 바짝 다가가 그 나라의 한 곳만 화면에 남았을 때 폭이 0 이 되어
    //       '나라 원판'이 그대로 선다 — 화면 밖 관측소 115곳까지 대표한다고 말하는 꼴이다(실측으로 잡은 결함).
    //    그래서 폭은 **자료에 매인 각반경**(radiusDeg · 나라마다 고정)에 지금 화면의 눈금(px/°)을 곱해서 낸다.
    const pxPerDeg = screenScale(e, cx, cy, cz);
    const cands = [];
    let anyCountry = false;
    let anyStation = false;
    // 이름은 **솎기 전에** 짓는다 — 솎기의 상자가 이름표 폭을 재야 하기 때문이다(slr-plates.js plateBoxPx).
    const stationName = (i) => clipName(stations[i].name || String(stations[i].id));
    const countryName = (g) => (g.n === 1
      ? `${clipName(stations[g.idx[0]].name || g.country)} · 1곳`
      // 줄였더니 부딪혀 원래 이름을 쓰는 나라(남·북한)는 더 길게 — 16자로 자르면 'Korea, Republic…' 이 된다.
      : `${clipName(shortName.get(g.country) || g.country,
        isCollidedName(g.country, shortName.get(g.country)) ? SLR_LONG_MAXCHARS : undefined)} · ${g.n}곳`);
    const push = (c) => { const b = plateBoxPx(c.name, platePx); c.w = b.w; c.h = b.h; cands.push(c); };
    for (const g of groups) {
      let seen = 0;
      for (const i of g.idx) if (visible[i]) seen += 1;
      if (!seen) { continue; }
      const split = splitDecision(splitState.get(g.country), 2 * g.radiusDeg * pxPerDeg, g.n, platePx, SLR_LOD);
      splitState.set(g.country, split);
      if (split) {
        anyStation = true;
        for (const i of g.idx) {
          if (!visible[i]) continue;
          push({
            kind: 'station', key: `s${i}`, station: i, value: lastValues[i], name: stationName(i),
            // 솎을 때 '한국 먼저'(plateRank)가 뜻하는 한국도 **카드가 세는 그 한국**이다 — 한 파일 안에서
            // 두 가지 '한국'을 쓰면 화면의 차례와 카드의 셈이 다시 갈라진다(KOREA_COUNTRY 주석).
            korea: stations[i].country === KOREA_COUNTRY,
            x: projected[i * 2], y: projected[i * 2 + 1], lat: stations[i].lat, lon: stations[i].lon,
          });
        }
      } else {
        anyCountry = true;
        const m = g.medoid;
        // 메도이드가 뒤편이거나 화면 밖이면 그 나라는 이번 판에 없다. ⚠️ 원판은 **늘 메도이드 관측소 위**에 서고
        // 카드가 "가장 가까운 관측소"라고 적는다(countryCardHtml) — 자리를 화면 안으로 옮기면 그 줄이 거짓이 된다.
        if (!visible[m]) continue;
        push({
          kind: 'country', key: `c${g.country}`, group: g, value: (g.summary && g.summary.median), name: countryName(g),
          korea: g.country === KOREA_COUNTRY,
          x: projected[m * 2], y: projected[m * 2 + 1], lat: g.lat, lon: g.lon,
        });
      }
    }
    // ③ 차례 — 한국 먼저, 그다음 |값| 이 큰 것부터(plateRank). 그리고 겹치는 것을 솎는다.
    cands.sort((a, b) => plateRank(a) - plateRank(b));
    const cap = plateCapOf(view.w, view.h, platePx);
    const out = thinPlates(cands, { sepPx: platePx * SLR_SEP_FRAC, cap });
    shownPlates = out.shown;
    hiddenCount = out.hidden;
    clashedCount = out.clashed;
    cappedCount = out.capped;
    offScreenCount = offScreen;
    plateMode = anyCountry && anyStation ? 'mixed' : anyStation ? 'station' : 'country';
    // ④ 그리기 — 모양이 그대로면 스프라이트를 다시 쓰지 않는다(폰 발열).
    const list = shownPlates.map((c) => {
      const v = c.value;
      const bi = bandIndex(SLR_RISE_SCALE, v);
      // ⚠️ 눈금표의 **#rrggbb 그대로**다. legendModel 의 color 는 'rgb(…)' 문자열이라 여기서 쓰면
      //    숫자 색을 고르는 plateInkFor 가 그것을 못 읽고 늘 흰 글자를 준다(밝은 칸에서 숫자가 사라진다).
      const color = SLR_RISE_SCALE.colors[bi < 0 ? 0 : bi];
      return { key: c.key, lat: c.lat, lon: c.lon, text: plateText(v), name: c.name, color, ink: plateInkFor(color) };
    });
    const sig = list.map((p) => `${p.key}~${p.text}~${p.color}`).join('|');
    if (sig !== plateSig) { plateSig = sig; plates.setPlates(list); }
    lastCull = { x: cx, y: cy, z: cz, r: Math.hypot(cx, cy, cz), w: view.w, h: view.h, t: now() };
  }

  /** 매 프레임 — live-layers.tick 이 부른다. 다시 솎을 때가 아니면 흐림만 고친다. */
  function tick(camera) {
    if (!camera || !group.visible) return 0;
    lastCamera = camera;
    getViewport(view);
    if (!(view.w > 0) || !(view.h > 0)) return 0;
    const cm = camera.matrixWorld.elements;
    const cx = cm[12]; const cy = cm[13]; const cz = cm[14];
    const rad = Math.hypot(cx, cy, cz);
    const t = now();
    const move = Math.hypot(cx - lastCull.x, cy - lastCull.y, cz - lastCull.z);
    const moved = move > rad * SLR_RECULL.moveFrac;
    const zoomed = Math.abs(rad - lastCull.r) > Math.max(lastCull.r, 1e-6) * SLR_RECULL.zoomFrac;
    const resized = view.w !== lastCull.w || view.h !== lastCull.h;
    const stale = t - lastCull.t > SLR_RECULL.everyMs;
    // 기다리면 안 되는 세 가지: ① 값이 바뀌었다(단추를 눌렀다 — 화면의 숫자가 카드와 어긋난다)
    //   ② 화면 크기가 바뀌었다(솎기 격자가 통째로 달라진다) ③ 카메라가 훌쩍 뛰었다(flyTo — 옛 자리의 원판을
    //   들고 있으면 **누르는 자리가 어긋난다**). 그 밖에는 minMs 만큼 쉬었다 간다(끄는 중에 매 프레임 1,016곳을 옮기지 않는다).
    const urgent = plateSig === null || resized || move > rad * SLR_RECULL.jumpFrac;
    if (urgent || ((moved || zoomed || stale) && t - lastCull.t >= SLR_RECULL.minMs)) recull(camera);
    return plates.tick(camera);
  }

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
  // (2026-09-23 정정 · PERF-LTE V2-2 검수) '운영에서는 지구가 먼저 서므로 첫 판에서 바로 참이다'는 더 이상 참이 아니다 —
  //   덮개는 이제 지형을 기다리지 않는다. PC LTE 에서 지형이 얹히기까지 약 33 s, 폰은 z3 시한 90 s 뒤 z4 타일로 가는 길까지 있어
  //   1분(120회)이면 느린 망에서 잠기는 땅을 먼저 켠 세션이 '지형 없음'으로 굳는다. 5분(600회)을 기다린다 — 0.5 s 마다 값 하나 보는 것이라 싸다.
  const REACH_WAIT_MAX = 600;
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

  /** 넓이를 잰 칸(FLOOD_PAINTED_AT)의 관측소 값 — 바뀌지 않으므로 한 번만 뽑는다. */
  let paintedRefCache;
  function paintedRefValues() {
    if (paintedRefCache === undefined) {
      paintedRefCache = FLOOD_SCENARIOS.some((s) => s.id === FLOOD_PAINTED_AT.scenario)
        && FLOOD_YEARS.includes(FLOOD_PAINTED_AT.year)
        ? stationMedians(stations, FLOOD_PAINTED_AT.scenario, FLOOD_PAINTED_AT.year)
        : null;                       // 잰 칸이 자료에 없다 — 견주지 않는다(지어내지 않는다)
    }
    return paintedRefCache;
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
    // '한국'은 대한민국이다 — 화면의 나라 원판과 같은 가름(KOREA_COUNTRY 주석에 근거).
    const kr = koreaStations(rows);
    stats = {
      scenario: state.scenario, year: state.year, stations: stations.length,
      // 칠해지는 땅의 넓이를 **잰 칸**과 견준 결과. 카드의 면적 한 줄이 이것을 보고 말한다(floodPaintedLine).
      // 견줌은 관측소 값 배열끼리라 값싸다(1,016번) — 넓이를 다시 세는 것이 아니다.
      painted: riseCompare(values, paintedRefValues()),
      globalMedian, farPct, landMask: landStore && landStore.info ? landStore.info() : null,
      hasHeight: !!(uniforms.uHasHeight.value > 0.5),
      reach: reachState, reachInfo: reachGrid ? reachInfo(reachGrid) : null,
      min: rows.length ? Math.min(...rows.map((r) => r.v)) : null,
      max: rows.length ? Math.max(...rows.map((r) => r.v)) : null,
      top: sorted.slice(0, 3),
      korea: [...kr].sort((a, b) => b.v - a.v).slice(0, 3),
      koreaCount: kr.length,
      countries: groups.length,
      soloCountries,
      source: doc.source || 'IPCC AR6 · NASA/JPL',
      license: doc.license || 'CC BY 4.0',
      baseline: doc.baseline || '1995–2014 평균 대비 상대 해수면 (m)',
      depth: state.depth,
    };
    // 원판의 숫자·색이 읽을 값 — **같은 시나리오·연도**의 같은 배열이다(색면과 상태를 나눠 쓰는 것이 이 한 줄로 보인다).
    lastValues = values;
    for (const g of groups) g.summary = countrySummary(g, values);
    plateSig = null;                               // 값이 바뀌었다 — 다음 솎기에서 원판을 반드시 다시 굽는다
    if (shown) legend.show(slrLegendArgs(api.model()), 'slr', LEGEND_PRIORITY_FIELD);
  }

  // ── 늘 떠 있는 범례 ───────────────────────────────────────────────────────────────────────────────────
  // 주인 스택을 쓴다(field-legend.js show/release) — 바람 입자가 같이 켜져 있어도 서로의 범례를 말없이 덮지 않는다.
  // ⚠️ 켜짐을 **여기서 알 수 없다**: live-layers 는 끌 때 겹면을 버리지 않고 group.visible 만 뒤집으므로
  //    onBeforeRender 가 안 불린다. 그래서 켜짐은 밖에서 알려 준다(setOn · live-layers.starLayer 가 매 프레임 부른다).
  const legend = deps.legend || sharedFieldLegend;
  let shown = false;
  recompute();
  waitForTerrain();     // 운영에서는 지구가 이미 서 있어 첫 판에서 바로 굽기 시작한다

  /** 화면에 떠 있는 부품들의 상자 — 원판을 그 뒤에 세우지 않으려고 잰다(slr-plates.plateInsetOf).
   *  ⚠️ 자리를 **읽기만** 한다. 부품을 옮기거나 숨기지 않는다 — 이 레이어가 남의 화면을 건드리면 안 된다.
   *  id·클래스를 여기 적는 대신 부품이 스스로 표시하게 하는 편이 낫지만, 그러려면 남의 파일을 고쳐야 한다. */
  function chromeBoxes() {
    const d = deps.getDocument ? deps.getDocument() : (typeof document !== 'undefined' ? document : null);
    if (!d || !d.querySelector) return [];
    const out = [];
    for (const sel of ['#chrome', '#field-legend', '#hud', '#timestrip', '#bottom-nav']) {
      const el = d.querySelector(sel);
      if (!el || !el.getBoundingClientRect) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return out;
  }

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
    /** 숫자 원판(콘솔·시험용) — 화면 고정 크기라 길이로 값을 말하지 않는다. */
    get plates() { return plates; },
    /** 지금 화면에 선 원판들(콘솔·시험용) — **여기 있는 것만 눌린다.** */
    shownPlates() { return shownPlates; },
    /** 겹쳐서 솎은 수 — 범례 · 카드 · 메뉴 한 줄이 이 수를 말한다. */
    hidden() { return hiddenCount; },
    /** 매 프레임(live-layers.tick) — 지평선 흐림, 그리고 때가 되면 다시 솎기. */
    tick(camera) { return tick(camera); },
    /**
     * **지금 색면이 그려지고 있나.** 색면의 FieldLayer.isDrawing 과 같은 뜻이다 —
     * 지형을 못 받은 세션은 셰이더 첫 줄에서 전부 discard 하므로(FLOOD_FRAG) 켜져 있어도 화면에는 아무것도 없다.
     * main.js 가 이것을 보고 구름·윤곽선을 물린다: 안 보이는 겹면 때문에 구름까지 끄면 맨 지구만 남는다(작업 E3 ③).
     * ⚠️ 2026-09-20 작업 E4 — **색면이 켜져 있을 때만** 참이다. 원반만 있는 화면에서 구름을 끄면 안 된다:
     *    원반은 구름 위(renderOrder 7)에 서므로 구름이 이 화면의 방해물이 아니다. 끄면 이유 없이 지구만 민둥해진다.
     */
    get drawing() { return !!state.depth && uniforms.uHasHeight.value > 0.5; },
    stencil() { return stencil; },
    grid() { return grid; },
    model() {
      return {
        ...stats, hasHeight: !!(uniforms.uHasHeight.value > 0.5), reach: reachState, depth: state.depth,
        // (2026-09-23 · PERF-LTE V2-1) 카드 ③ 의 '전지구 약 N km' — 지구에 **실제로 얹힌** 전역 고도맵의 폭에서 센다
        //   (폰 z3 2048px → 약 20 km · PC z4 4096px → 약 10 km). 못 세면 null 이고 카드는 옛 문구(약 10 km)를 쓴다.
        terrainKm: globalTerrainKm(uniforms.uHeightMap && uniforms.uHeightMap.value),
        hidden: hiddenCount, clashed: clashedCount, capped: cappedCount, offScreen: offScreenCount,
        plateMode, plateShown: shownPlates.length,
      };
    },
    /**
     * 레이어가 켜졌나 — **밖에서** 알려 준다(live-layers.starLayer). 여기서 알 수 없는 이유는 위 '늘 떠 있는 범례' 주석에 있다.
     * 범례를 들고 물러나는 일만 한다. 두 번 불러도 한 번이다.
     */
    setOn(on) {
      const v = !!on;
      if (v === shown) return v;
      shown = v;
      if (v) legend.show(slrLegendArgs(api.model()), 'slr', LEGEND_PRIORITY_FIELD);
      else if (legend.release) legend.release('slr');
      return v;
    },
    /**
     * 누른 자리의 원판 — { title, html, badge, station? , country? } 또는 null.
     * ⚠️ **화면에 선 원판만** 본다(shownPlates). 솎여 나간 관측소가 눌리면 '왜 이 카드가 떴는지' 설명할 수 없고,
     *    지구 뒤편도 마찬가지다 — 솎을 때 이미 지평선 흐림으로 걸렀다.
     * 자리는 솎을 때 잰 화면 좌표를 그대로 쓴다: 그리기와 누르기가 **같은 수**를 보게 하는 유일한 길이다
     *    (다시 재면 그 사이에 카메라가 움직인 만큼 어긋난다).
     * 레이어가 꺼져 있으면 그려지지 않아 lastCamera 가 낡는다 — group.visible 로 한 번 더 막는다.
     */
    pick(hit) {
      if (!hit || !lastCamera || !group.visible || !(view.w > 0 && view.h > 0)) return null;
      const x = hit.x;
      const y = hit.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const reach = platePxOf() / 2 + SLR_PLATE_SLOP_PX;
      let best = null;
      let bestD = Infinity;
      for (const c of shownPlates) {
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best || bestD > reach) return null;
      const m = api.model();
      if (best.kind === 'country') {
        return {
          country: best.group.country, group: best.group,
          title: countryCardTitle(best.group, stations),
          html: countryCardHtml(best.group, stations, m), badge: 'MODEL_SIGNAL',
        };
      }
      const st = stations[best.station];
      return { station: st, title: stationCardTitle(st), html: stationCardHtml(st, m), badge: 'MODEL_SIGNAL' };
    },
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
      } else if (action === 'slr-depth') {
        // '잠기는 땅' 색면 켬/끔. 켜짐은 **겹면의 visible 하나**로만 말한다 — 두 곳에 적으면 카드와 화면이 갈라진다.
        state.depth = !state.depth;
        mesh.visible = state.depth;
      } else return false;
      recompute();
      publish();
      return true;
    },
    dispose() {
      disposed = true;             // 늦게 끝난 굽기가 버린 겹면에 텍스처를 달거나 카드를 고치지 않게
      if (reachTimer && typeof clearTimeout === 'function') clearTimeout(reachTimer);
      reachTimer = null;
      // ⚠️ 범례는 **내가 들고 있을 때만** 내려놓는다. 취소된 build 가 늦게 버려지면서 release 하면
      //    지금 화면에 선 겹면의 범례를 빼앗는다(같은 주인 이름 'slr' 을 쓴다).
      if (shown) { shown = false; if (legend.release) legend.release('slr'); }
      if (reachTex) reachTex.dispose();
      riseTex.dispose();
      paletteTex.dispose();
      material.dispose();
      plates.dispose();
      if (ownsGeometry) geometry.dispose();       // 받은 지오메트리(지구의 것)는 버리지 않는다
      if (group.parent) group.parent.remove(group);
    },
  };
  return api;
}
