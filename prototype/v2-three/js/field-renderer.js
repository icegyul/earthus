// EARTHUS v2 — 공통 색면 렌더러 (DEV-DIRECTIVE 2026-09-20 · W1 "한 번 잘 만들어 여섯 번 쓴다" · 기준 구현체는 W2 기온)
//
// 무엇이 잘못돼 있었나: 색면(live-layers.js buildField)은 5° 격자 한 시각을 72×36 캔버스에 **선형 램프로 먼저 칠하고**
// LinearFilter 로 늘렸다 — 색을 섞은 뒤 또 섞는 그라데이션이다. 등치선·라벨·범례가 없고, 타임라인을 밀어도 안 움직이고,
// 반지름이 고정된 껍질이라 지형을 모른다(2026-09-20 바다 색면이 육지를 덮은 버그의 원인).
// PD: "기온도 그라데이션이 아니라 선으로 하기로 했는데 그라데이션이네?" · "등치선은 만들거지?"
//
// 원칙은 하나다 — **값을 보간하고, 색은 양자화한다.**
//   값 텍스처 A·B(8bit 선형 · gfs-frames.js) → 격자점 네 칸을 **풀어서** 이중선형 → 두 시각을 값으로 섞음 →
//   구간 찾기(field-scales.js 의 구간 규칙 그대로) → 1×N 팔레트(NearestFilter)에서 색 한 칸.
//   색끼리 섞는 연산은 없다. 색 위에 얹히는 것은 흰 등치선 하나뿐이다(아래 '등치선').
//
// ── 왜 하드웨어 이중선형(texture2D 한 번)을 쓰지 않고 네 칸을 직접 읽나 ─────────────────────────────────────────
//   ① 자료가 8bit(기온 0.5°C 눈금)라 **같은 값이 수백 칸 깔린 고원**이 흔하고, 구간 경계(30°C)와 등치선 값이 바로 그
//      눈금 위에 있다. 하드웨어 보간은 r = byte/255 를 float 로 돌려주므로 r×255 가 219.99998 이 되기도 한다 —
//      30.0°C 고원이 통째로 '25–30' 칸으로 칠해지거나 픽셀마다 갈린다. 칸 한가운데를 읽어 **정수 바이트로 되돌린 뒤**
//      (floor(r×255+0.5)) 풀면 CPU 사본(frames.sampleAt — 클릭 값)과 같은 수가 된다: 칠해진 칸 = 클릭한 값의 칸.
//   ② 보간을 a + (b − a)·t 꼴로 직접 쓴다. a = b 인 고원에서 결과가 **정확히 a** 다(a·(1−t) + b·t 는 1 ulp 흔들린다).
//      그래야 고원의 화면 기울기 fwidth(v) 가 정확히 0 이고, 아래 고원 가드가 잡음 없이 선다.
//   ③ GPU 의 보간 가중치는 8bit 고정소수라 한 칸이 256px 보다 크게 보이는 줌에서 값이 잔계단이 된다 — 등치선이 점선이 된다.
//   값은 프래그먼트당 텍스처 8번 읽기(두 시각 × 네 칸)다. 지구 셰이더(main.js EARTH_FRAG)가 고도만 9번 읽는다 — 같은 급이다.
//   칸 좌표는 구면 uv → gfs-frames.js uvTransform(id) 의 su·ou·sv·ov → (열, 행) 으로 간다. 점 격자 보정이 거기 들어 있다
//   (서울 37.5N 127E = 행 105 · 열 614 — 시험이 잠근다). 경도는 감고(RepeatWrapping) 위도는 극 행에서 멈춘다 — sampleAt 과 같다.
//
// ── 구간 찾기 (field-scales.js 머리말 '구간 규칙'과 **같은 규칙**) ─────────────────────────────────────────────
//   idx = Σ step(uBreaks[i], v)  — 아래 경계 포함 · 위 경계 제외 · float32 비교. 남는 칸은 BREAK_PAD(3e38)라 늘 0 을 더한다.
//   JS 로 옮긴 shaderBandIndex 가 모든 경계와 그 바로 아래에서 field-scales.bandIndex 와 같은지 시험이 본다.
//
// ── 무엇을 그 규칙에 넣나 — **읽히는 값**(눈금값)이다 ─────────────────────────────────────────────────────────
//   규칙에 넣는 값은 보간값 v 가 아니라 v + 반 눈금(기온 0.25°C)이다. 풀어 쓰면 '가장 가까운 눈금값의 칸':
//     step(경계, v + q/2)  ⇔  round(v/q)·q ≥ 경계        (q = 자료의 눈금 0.5°C · 경계가 눈금 위에 있을 때 · 동률은 위로)
//   이유 ① 경계(30°C)가 자료의 눈금 위에 있어서, 보간값을 그대로 넣으면 'v ≥ 30' 인 곳은 30.0 고원과 그 고원을 잇는 **격자선**뿐이다 —
//          색 경계가 0.5° 칸의 모서리를 따라 계단으로 꺾인다(확대하면 픽셀 그림이 된다). 지시서 W1-2 가 바란 것은 '매끄러운 곡선'이다.
//          반 눈금을 더하면 경계는 29.5 와 30.0 사이 **경사면의 한가운데**를 지난다 — 마칭 스퀘어가 긋는 그 곡선이다.
//        ② 누른 자리의 값은 눈금으로 반올림해 '~30.0 °C' 라고 말한다(field-layer.js). 보간값 29.8 을 '25–30' 색으로 칠해 놓고
//          '~30.0 °C' 라고 말하면 색과 글자가 어긋난다. 눈금값으로 칠하면 **칠해진 칸 = 읽히는 값의 칸**이다(시험이 전 구간을 훑는다).
//        ③ 자료는 반올림으로 만들어졌다(handler.py). 30.0 으로 적힌 칸의 참값은 29.75 ~ 30.25 다 — '30 이상' 칸에 넣는 쪽이 자료의 뜻이다.
//   등치선도 같은 값(v + q/2)으로 긋는다 — 선과 색 경계가 늘 같은 자리다. 풍속(크기 모드)은 경계가 눈금 위에 있지 않아 0 을 더한다.
//
// ── 로그로 실린 자료 (강수율 · W4 2026-09-20) ────────────────────────────────────────────────────────────────
//   매니페스트가 transfer 'log10' 이라고 말하는 필드는 값 = 10^(byte/255 × logSpan + logLo) 이고, 정해진 바이트
//   하나(zeroByte)가 '없음' = 0 이다(강수율은 바이트 0 = 0.05 mm/h 미만). 디코드는 **tapValue 안**에서 한다 —
//   네 칸을 정수 바이트로 되돌려 **각각 값으로 푼 뒤** 값에서 공간·시간 보간하는 길이 그대로 쓰인다.
//   ⚠️ 바이트를 먼저 섞고 나중에 풀면 틀린다: 1 mm/h 와 10 mm/h 의 가운데는 5.5 mm/h 인데, 바이트의 가운데를 풀면
//      3.16 mm/h(기하평균)가 나온다. 비 오는 가장자리가 통째로 한 칸씩 약해 보인다.
//   디코드 식은 컴파일 때 갈린다(#ifdef FIELD_TRANSFER_LOG10) — 선형 필드가 프래그먼트마다 분기를 밟지 않게.
//   GLSL 에는 log10 도 pow(10, x) 의 보증도 없다 — exp2(x × LOG2_10) 으로 셈한다(field-log.js 가 같은 수를 쥔다).
//   반 눈금(위 '읽히는 값')은 로그에서 **0** 이다 — 이유는 field-log.js 머리말('읽히는 값 규칙을 로그에는 쓰지 않는다').
//   R 채널만 값이다: 강수 프레임의 G 는 강수 종류 부호, B 는 유도값이라 섞으면 없는 값이 된다(매니페스트 notDecoded).
//
// ── 등치선 ──────────────────────────────────────────────────────────────────────────────────────────────────
//   기법은 main.js 의 해저 등심선과 같다(값을 간격으로 나눠 fract · 굵기는 fwidth 로 화면 px 에 묶는다 — 줌과 무관).
//   다른 점 둘:
//   · **아래쪽에서만 긋는다.** 선은 통째로 'v < 레벨' 쪽에 들어앉는다 — 위쪽 가장자리가 레벨(= 색 경계)에 닿고 거기서 알파가 0 이다.
//     이유: 위 ①의 고원. 30.0°C 고원은 양쪽 가장자리에서 v = 30 이 된다. 가운데 맞춤 선(|v − L| < w)이면 고원의 **양쪽**에
//     선이 서서 등온선이 두 줄이 된다(열대 바다에서는 수백 km 떨어진 두 줄). 레벨 위쪽에 1px 이라도 걸치면 같은 일이 난다 —
//     고원을 벗어나는 첫 픽셀도 'v 가 L 을 막 넘은 픽셀'이기 때문이다(처음에 그렇게 짰다가 시험이 두 줄을 잡았다).
//     아래쪽에서만 그으면 선은 'v < L 과 v ≥ L 의 경계' 한 곳에만 선다 — 그 자리가 곧 색 경계다(구간 규칙이 아래 경계 포함이므로).
//     색 경계 = 등치선 = 범례 경계. 선의 가운데는 경계에서 (굵기/2 + 0.5)px 아래이고 양쪽 가장자리가 다 매끄럽다.
//   · **고원 가드.** 화면 기울기 fwidth(v) 가 FIELD_GRAD_EPS 이하면 선을 긋지 않는다. 고원 한가운데서는 기울기가 0 이라
//     거리/기울기가 0/0 이 되고, 값이 레벨과 같으면(30.0 고원 · 또는 29.5 와 30.5 를 시간으로 반씩 섞은 순간) 면 전체가
//     흰 선으로 번진다. 가드는 그 둘을 같이 막는다. 셰이더 식을 JS 로 옮긴 lineCoverage 를 시험이 잠근다.
//   · 선이 화면 픽셀보다 촘촘해지면(전지구 뷰의 2°C 선 · 전선대) 스스로 흐려진다 — 모아레 대신 색면만 남는다.
//     ⚠️ 그 '촘촘함'은 **CSS px** 로 잰다. fwidth 는 장치 픽셀 기준이라 DPR 2 인 폰에서는 같은 화면이 두 배로 넓게
//        읽혀, 사라져야 할 선이 절반쯤 살아남아 전선대가 허옇게 떴다(2026-09-20 작업 E3 ④). 굵기와 같은 자로 나눈다.
//   간격·굵은 선·강조값은 field-scales.isolineSpec 에서만 온다(기온 2°C|5°C · 10°C 마다 굵게). 풍속처럼 명세가 null 이면 안 긋는다.
//
// ── 지형 ────────────────────────────────────────────────────────────────────────────────────────────────────
//   색면은 **지형을 따라간다.** 정점을 main.js EARTH_VERT 와 같은 식으로 올리고(uHeightMap · mercatorUV · decodeHeight ·
//   displacementHeight · 극지 페이드 · max(h,0)/R × uExagger) 그 위에 FIELD_LIFT 만큼 띄운다. 고정 반지름 껍질이면
//   과장 50× 에서 산이 색을 뚫고 나오거나 저지대가 색에 묻힌다.
//   · GLSL 조각은 main.js 에서 꺼내 오지 않고 **같은 글자로 여기 한 벌 더 둔다**(FIELD_TERRAIN_GLSL). main.js 의 셰이더를
//     한 글자도 건드리지 않으려는 것이고(세 작업이 main.js 를 동시에 고친다), 두 벌이 어긋나면 시험이 떨어진다
//     (tools/earthus-v53/field-renderer.test.mjs 가 main.js 의 함수 본문과 글자를 대조한다).
//   · uniform 은 **main.js 의 객체를 그대로 물린다**(terrain.uHeightMap · uHasHeight · uExagger). 과장이 바뀌면 main.js 가
//     그 객체의 value 를 고치고 이 셰이더는 같은 객체를 읽는다 — 지오메트리를 다시 만들지 않고, 여기서 따로 맞출 것도 없다.
//   · 지오메트리도 지구의 것을 받아 같이 쓴다(1024×512). 정점이 같고 변위 식이 같으면 두 면은 어디서나 FIELD_LIFT 만큼
//     떨어진 평행면이다. 성긴 구를 따로 만들면 지구의 사이 정점이 그 위로 솟는다(히말라야 · 과장 50× 에서 약 0.008).
//     같이 쓰면 52만 정점 버퍼(16 MB)를 한 벌 더 올리지도 않는다. 받은 지오메트리는 dispose 하지 않는다.
//
// ── 색 공간 ─────────────────────────────────────────────────────────────────────────────────────────────────
//   팔레트는 sRGB 바이트 그대로 올리고(NoColorSpace) 셰이더도 colorspace 변환 없이 그대로 쓴다. 캔버스는 sRGB 이므로
//   화면의 색 = 표의 #rrggbb = 범례(DOM)의 색이다. 선형화했다 되돌리는 길(SRGBColorSpace + colorspace_fragment)은
//   같은 값을 두 번 반올림할 뿐이다. ⚠️ 둘을 섞으면(한쪽만 변환) 띠가 허옇게 뜨고 범례와 어긋난다.
//   ⚠️ 2026-09-20(작업 E3 ⑤) — 그런데 **바탕색이 섞이는 몫**이 그 약속을 깼다. 불투명 0.8 이면 20% 가 밑의 지구 색이라,
//      범례가 (238,129,48)인 25~30 °C 칸이 밤바다 위에서는 (192,107,46) · 밝은 사막 위에서는 (230,139,66) ·
//      빙상 위에서는 (237,151,87) 로 칠해졌다(채널 최대 차 46 · 15~20 °C 칸은 47). 색이 곧 값인 화면에서 바탕이 값을 바꿨다.
//      0.92 로 올려 그 몫을 8% 로 줄였다 — 같은 세 자리가 (220,120,47) · (235,133,55) · (238,138,64) 로 최대 차 19 다.
//      지형 결은 바탕색 대신 **음영 계수**로 준다(아래 FIELD_SHADE · 셰이더 terrainShade): 색조는 그대로 두고 밝기만
//      깎으므로 평지에서는 화면의 색이 범례의 색 그대로이고, 비탈에서만 최대 28% 어두워진다.
//
// 이 파일은 DOM 을 모른다. 계산은 순수 함수로 밖에 냈고 시험이 그대로 부른다. THREE 는 WebGL 없이도 재질·기하가 만들어진다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { bandCount, breaksFloat32, paletteRGBA } from './field-scales.js?v=1';
import { FIELD_LOG2_10, logUniforms, shaderLogDecode } from './field-log.js?v=1';

// 셰이더의 고정 길이 uniform 배열. 지금 가장 긴 눈금은 기온(경계 10). 넘치면 breaksFloat32 가 던진다 — 조용히 자르지 않는다.
export const FIELD_MAX_BREAKS = 16;
// 간격이 고르지 않은 등치선(파고 1·2·3·4·6·9 m)과 강조값(기압 1012 · SST 26·29)을 담는 칸 수.
export const FIELD_MAX_LEVELS = 8;

// 지형 위로 띄우는 높이(지구 반지름 단위). 0.0012 ≈ 7.6 km.
//   · 기존 색면·강수면·바람 입자(wind-particles.js radius 1.0012)가 바다 위에서 쓰던 그 값이다 — 입자와 색면이 같은 높이라야
//     비스듬히 볼 때 시차가 없다(지시서 W3).
//   · 깊이 버퍼: 전지구 뷰(거리 2 · near 0.005 · 24bit)의 깊이 눈금은 약 5e-5 다 — 24배 여유. 지형과 평행면이라 더 띄울 이유가 없다.
export const FIELD_LIFT = 0.0012;

// 색면의 불투명도. 1 이면 지형 음영이 사라져 '지구 위의 자료'가 아니라 색칠한 공이 되고(시안 01 은 산맥의 음영이 색 아래로 비친다),
// 0.7(옛 대기 색면)이면 밝은 사막·빙상 위에서 구간색이 범례의 색과 달라 보인다.
// ⚠️ 2026-09-20 작업 E3 ⑤ — 0.8 이었다. 그런데 **바탕색을 섞어 지형 결을 내면 색이 범례와 달라진다**(머리말 '색 공간'의
//    실측 표: 채널 최대 차 47). 색이 곧 값인 화면에서 바탕이 값을 바꾸면 안 된다. 그래서 두 가지를 바꿨다:
//      ① 0.92 로 올린다 — 바탕이 섞이는 몫이 20% 에서 8% 로 줄어 어느 바탕 위에서나 범례 색에 가깝다(최대 차 19).
//      ② 지형 결은 바탕색이 아니라 **음영 계수**로 준다(아래 FIELD_SHADE). 색조는 그대로 두고 밝기만 깎는다.
export const FIELD_OPACITY = 0.92;

// 지형 결 — 구간색에 곱하는 계수. 셰이더가 전역 고도맵으로 경사 음영을 셈해 **평평한 구와의 차이만** 깎는다:
//   평지에서는 정확히 1(= 범례 색 그대로) · 해가 등진 비탈에서만 어두워진다 · 밤면은 양쪽이 다 0 이라 손대지 않는다.
//   k  차이에 곱하는 세기 · min  아무리 깎여도 여기까지(색을 못 알아볼 만큼 어두워지지 않게)
// 위로는 1 을 넘지 않는다 — **범례 색이 천장이다.** 밝은 비탈이 범례보다 밝아지면 그 칸의 색을 다시 읽을 수 없다.
//
// ⚠️ 2026-09-20 정정(F2) — k 0.55 · min 0.72 였다. 위 ①이 고치려던 바로 그 오염을 **비탈에서 더 크게** 되돌려 놓고 있었다:
//   계수는 uSunDir 을 따르는데(재생하면 해가 돌고, 수동 조명이면 카메라를 따라간다) 위로는 1 에서 잘리고 아래로만 열려 있다.
//   그래서 값이 하나도 안 변해도 **타임라인을 재생하거나 지구를 돌리면 같은 칸의 색이 변했다.** 실측(과장 50× · 음영 0.9 ·
//   띠 색 238,129,48 · 바탕 검정·흰색·회색 · 해 고도 45° 를 한 바퀴):
//     경사 0(평지)  계수 1     · 범례와 최대 차 19 · 해가 돌 때 흔들림 0
//     경사 0.02     계수 0.893 · 42 · 23        경사 0.04  0.783 · 66 · 47        경사 0.06 이상  0.720 에 붙어 80 · 61
//   히말라야·안데스·로키 전면(전역 z4 고도맵 한 칸 약 10 km 에서 대략 0.03~0.1)이 범례보다 한눈에 어두워 색으로 값을 못 읽었다.
//   (2026-09-24 정정) 전역 고도맵은 기기마다 다르다 — 폰(terrainLite)은 z3 2048×2048 한 장(적도 약 19.6 km/px), 넓은 화면은 z4 4096×4096(9.8 km/px) · main.js TERRAIN_LEVEL_KM · applyTerrain.
//     z3 는 한 칸이 두 배라 같은 산의 기울기가 더 작게 잡힌다 — 이 계수의 몫 제한(아래)은 기울기와 무관하게 그대로 선다.
// 그래서 **결의 최대 몫을 바탕이 섞이는 몫으로 묶는다**: (1 − min) × FIELD_OPACITY ≤ (1 − FIELD_OPACITY).
//   결이 색을 깎을 수 있는 최대가 바탕이 색을 바꾸는 8% 와 같아진다 — 결이 새 오염원이 되지 않는다는 뜻이다.
//   min = FIELD_OPACITY 가 그 부등식을 만족하는 가장 읽기 쉬운 한 줄이다. k 는 0.15 로 내려 min 에 웬만해선 닿지 않게 둔다.
//   고친 뒤 같은 실측: 경사 0.02 → 25 · 6 · 경사 0.04 → 32 · 13 · 경사 0.06 이상 → 37 · 18(최악에서도 흔들림이 평지의 차 19 아래).
// ⚠️ 결을 통째로 뺄지(k 0 — PD 정본 시안 01·03·05·07 의 색면에는 산맥의 결이 보이지 않는다)는 **PD 가 시안과 나란히 놓고 정할 한 줄**이다.
//   여기서는 지우지 않는다 — 지시서 E3 ⑤ 가 '지형 결은 음영 계수로 준다'고 적었다. k 를 0 으로 두면 결이 사라진다.
export const FIELD_SHADE = Object.freeze({ k: 0.15, min: FIELD_OPACITY });

// 그리는 순서. 불투명한 지구는 따로 먼저 그려지므로 투명체끼리의 순서만 정한다.
//   −1 = 구름(1)·강수(3)·입자(4)·라벨(7~8)보다 먼저 = **구름 아래 · 지표 위.** 지상 2 m 기온은 구름 밑의 값이다.
//   옛 색면은 2 였다(구름 위에 덧칠). 그 껍질은 구름과 같은 높이(1.004+)에 떠 있었으니 앞뒤가 맞았지만, 이 면은 지형에 붙어 있다 —
//   2 로 두면 아래에 있는 면이 위에 있는 구름을 덮어 칠한다.
//   ⚠️ 그 대가: 구름(기본 켜짐 · 관측 구름 불투명도 0.92)이 색면을 가린다. 시안 01 에는 구름이 없다. 색면을 켤 때 구름을 어떻게 할지는
//      셸(W5 'View 분리')의 결정이라 여기서 구름을 건드리지 않았다. 화면에서 구름 위로 올려야겠으면 이 값을 2 로 바꾸면 된다.
export const FIELD_RENDER_ORDER = -1;

// 고원 가드의 문턱 — 화면 1px 에 값이 이만큼도 안 변하면 선을 긋지 않는다(값 단위/장치 px).
// 고원에서는 위 ②덕에 기울기가 **정확히 0** 이라 문턱은 작아도 된다. 실제 경사는 한 칸에 0.5°C 이상이므로
// 1e-5 는 한 칸이 5만 px 로 보일 때에나 닿는다(그런 줌은 없다).
export const FIELD_GRAD_EPS = 1e-5;

// 등치선의 모양 (CSS px · 장치 픽셀비는 그릴 때 곱한다 — DPR 2 인 폰에서도 같은 굵기).
//   보통 선은 가늘고 옅게, 주 레벨(기온 10°C 마다)은 굵고 또렷하게 — 시안 01 의 흰 선.
//   fadePx: 이웃한 선 사이가 이 px 보다 좁아지면 흐려지기 시작해(둘째 값) 첫째 값에서 사라진다.
export const FIELD_LINE = Object.freeze({
  color: Object.freeze([1, 1, 1]),
  minorWidthPx: 1.0, majorWidthPx: 1.9, emphasisWidthPx: 2.2,
  minorAlpha: 0.62, majorAlpha: 0.95,
  fadePx: Object.freeze([3, 8]),
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  순수 계산 — 셰이더가 하는 일을 JS 로 옮긴 것. 시험은 이 함수들로 '결과'를 본다.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 눈금표 한 장 → 셰이더가 읽는 것 셋. 표를 한 줄 바꾸면 셋이 같이 바뀐다(W1 완료 기준 ①) — 색·경계를 여기 다시 적지 않는다.
 *   breaks    Float32Array(FIELD_MAX_BREAKS) — 남는 칸은 BREAK_PAD
 *   bandCount 칸 수(팔레트 텍스처의 폭)
 *   palette   Uint8Array(칸 수 × 4) — sRGB 바이트 + 칸 불투명도
 */
export const scaleUniforms = (scale) => ({
  breaks: breaksFloat32(scale, FIELD_MAX_BREAKS),
  bandCount: bandCount(scale),
  palette: paletteRGBA(scale),
});

/**
 * 구간과 등치선을 정할 때 보간값에 더하는 반 눈금(머리말 '무엇을 그 규칙에 넣나'). 눈금은 매니페스트의 디코드 scale 이다 — 여기 적지 않는다.
 * 크기 모드(풍속)는 0: 두 성분의 크기는 눈금 위에 있지 않고 경계(1·5·10…)도 그렇다.
 * 로그 자료(강수율)도 0 이다 — 눈금이 값마다 다르고 경계가 바이트 값 위에 있지 않다(field-log.js 머리말).
 */
export const halfStepOf = (channels, mode = 'scalar') => {
  const c = channels && channels[0];
  return (mode === 'scalar' && c && c.transfer === 'linear' && c.scale > 0) ? c.scale / 2 : 0;
};

/** 셰이더가 한 픽셀을 칠하는 칸: 읽히는 값(v + 반 눈금)을 구간 규칙에 넣는다. */
export const paintedBandIndex = (breaksPadded, v, halfStep = 0) => shaderBandIndex(breaksPadded, v + halfStep);

/** 셰이더의 구간 찾기를 그대로 옮긴 것:  idx = Σ step(uBreaks[i], v).  step(edge, x) = x >= edge ? 1 : 0 · 둘 다 float32. */
export const shaderBandIndex = (breaksPadded, v) => {
  const x = Math.fround(v);
  let idx = 0;
  for (let i = 0; i < breaksPadded.length; i += 1) idx += x >= breaksPadded[i] ? 1 : 0;
  return idx;
};

/**
 * 등치선 명세(field-scales.isolineSpec) → 셰이더 uniform 값.
 *   interval·majorEvery 는 고른 간격의 선(기온 · 기압 · SST). levels[] 는 그 밖의 선 —
 *   간격이 없는 눈금은 levels 전부(파고 · 강수 코어), 간격이 있는 눈금은 강조값만(기압 1012 · SST 26·29)이 굵게 들어간다.
 *   명세가 null(풍속 · PM2.5)이거나 on 이 거짓이면 전부 0 — 셰이더는 선 계산을 건너뛴다.
 */
export const isolineUniforms = (spec, on = true) => {
  const levels = new Float32Array(FIELD_MAX_LEVELS);
  const widths = new Float32Array(FIELD_MAX_LEVELS);
  const out = { on: 0, interval: 0, majorEvery: 0, levels, widths, levelCount: 0 };
  if (!spec || !on) return out;
  out.on = 1;
  out.interval = spec.interval > 0 ? spec.interval : 0;
  out.majorEvery = (out.interval && spec.majorEvery > 0) ? spec.majorEvery : 0;
  const emph = new Set(spec.emphasize || []);
  const list = out.interval ? [...emph] : [...new Set([...(spec.levels || []), ...emph])];
  list.sort((a, b) => a - b);
  if (list.length > FIELD_MAX_LEVELS) {
    throw new RangeError(`field-renderer: 등치선 값 ${list.length}개가 ${FIELD_MAX_LEVELS}칸에 안 들어간다`);
  }
  list.forEach((lv, i) => {
    levels[i] = lv;
    widths[i] = emph.has(lv) ? FIELD_LINE.emphasisWidthPx : FIELD_LINE.minorWidthPx;
  });
  out.levelCount = list.length;
  return out;
};

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * 지형 결의 계수 — 셰이더 terrainShade 의 마지막 줄과 같은 식(시험용 거울). 기울기를 어떻게 구하느냐는 셰이더의 일이고,
 * 여기서는 **규칙**을 잰다: 평지(lit = sphereLit)면 정확히 1, 해가 등진 비탈이면 어두워지되 min 아래로는 안 가고, 1 을 넘지 않는다.
 *   lit  기울인 법선의 밝기 · sphereLit  평평한 구의 밝기 (둘 다 0~1)
 */
export const terrainShadeOf = (lit, sphereLit, k = FIELD_SHADE.k) => {
  if (!(k > 0) || !(sphereLit > 0)) return 1;      // 세기 0 · 밤면 — 값을 어둡게 하지 않는다
  const x = 1 + k * (lit - sphereLit);
  return Math.max(FIELD_SHADE.min, Math.min(1, x));
};

/** 화면에 칠해지는 색 = 구간색 × 지형 결 × 불투명도 + 바탕 × (1 − 불투명도). 범례 색과 얼마나 다른지를 숫자로 보려고 둔다. */
export const paintedColorOf = (band, under, { shade = 1, opacity = FIELD_OPACITY } = {}) => {
  const a = Math.max(0, Math.min(1, opacity));
  return band.map((c, i) => Math.round(c * shade * a + under[i] * (1 - a)));
};

/**
 * 선 하나가 이 픽셀을 얼마나 덮나 (0~1). 셰이더의 lineCover 와 같은 식.
 *   below   레벨까지 **아래에서** 남은 값(L − v). 0 이하면(레벨에 닿았거나 넘었다) 선이 아니다 — 그 픽셀은 위 칸의 색이다.
 *   grad    화면 1px 에 값이 변하는 양(fwidth(v)) · widthPx  선 굵기(장치 px)
 * 고원 가드: grad 가 문턱 이하면 0. 선의 가운데는 레벨에서 (굵기/2 + 0.5)px 아래 — 레벨에 닿는 곳과 반대쪽 끝에서 알파가 0 이다.
 */
export const lineCoverage = (below, grad, widthPx) => {
  if (!(grad > FIELD_GRAD_EPS) || !(below > 0)) return 0;
  const hw = widthPx / 2;
  return 1 - smooth(hw - 0.5, hw + 0.5, Math.abs(below / grad - (hw + 0.5)));
};

/**
 * 고른 간격의 선. 이웃 선 사이가 fadePx 보다 좁으면 흐려진다(선이 픽셀보다 촘촘한 곳 — 모아레 대신 색면만 남긴다).
 *   widthPx  선 굵기(**장치** px — 부른 쪽이 이미 pxScale 을 곱했다) · pxScale  장치 픽셀비
 * ⚠️ 흐림 문턱만은 **CSS px** 로 잰다. grad(= fwidth)는 장치 px 당 값 변화라 interval/grad 는 장치 px 간격이고,
 *    fadePx(3·8)는 FIELD_LINE 이 CSS px 로 적어 둔 수다. DPR 2 인 폰에서는 장치 간격이 CSS 의 두 배라
 *    사라져야 할 선(CSS 2.5 px 간격)이 장치 5 px 로 읽혀 0.35 쯤 살아남는다 — 전선대가 통째로 허옇게 뜬다
 *    (2026-09-20 작업 E3 ④ · B1 반박 검증). pxScale 로 나눠 CSS px 기준으로 되돌린다.
 */
export const intervalLineCoverage = (v, grad, interval, widthPx, pxScale = 1) => {
  if (!(interval > 0) || !(grad > FIELD_GRAD_EPS)) return 0;
  const f = v / interval;
  const fr = f - Math.floor(f);
  const s = pxScale > 0 ? pxScale : 1;
  const fade = smooth(FIELD_LINE.fadePx[0], FIELD_LINE.fadePx[1], interval / (grad * s));
  return lineCoverage((1 - fr) * interval, grad, widthPx) * fade;   // fr = 0(레벨 위)이면 다음 레벨까지 한 간격이 남았다 — 선이 아니다
};

/** 한 픽셀의 등치선 알파 — 보통 선 · 굵은 선 · 따로 적힌 값 중 가장 센 것. iso 는 isolineUniforms 의 결과. pxScale = 장치 픽셀비. */
export const isolineAlpha = (v, grad, iso, pxScale = 1) => {
  if (!iso || !iso.on) return 0;
  let a = 0;
  if (iso.interval) a = intervalLineCoverage(v, grad, iso.interval, FIELD_LINE.minorWidthPx * pxScale, pxScale) * FIELD_LINE.minorAlpha;
  if (iso.majorEvery) {
    a = Math.max(a, intervalLineCoverage(v, grad, iso.majorEvery, FIELD_LINE.majorWidthPx * pxScale, pxScale) * FIELD_LINE.majorAlpha);
  }
  for (let i = 0; i < iso.levelCount; i += 1) {
    const wide = iso.widths[i] > FIELD_LINE.minorWidthPx;
    a = Math.max(a, lineCoverage(iso.levels[i] - v, grad, iso.widths[i] * pxScale)
      * (wide ? FIELD_LINE.majorAlpha : FIELD_LINE.minorAlpha));
  }
  return a;
};

/**
 * 위도·경도 → 값 텍스처의 연속 칸 좌표 [열, 행] (행 0 = 북). 셰이더의 gridCoord 와 같은 식이다:
 *   구면 uv(uS = lon/360 + 0.5 · vS = lat/180 + 0.5) → uvTransform(su·ou·sv·ov) → 텍스처 uv → (u·ni − 0.5 , (1 − v)·nj − 0.5).
 *   flipY(THREE 기본)라 그림 첫 행(북)이 v = 1 이다 — 그래서 1 − v.
 */
export const gridCoordOf = (uvT, size, lat, lon, out = [0, 0]) => {
  const u = (lon / 360 + 0.5) * uvT.su + uvT.ou;
  const v = (lat / 180 + 0.5) * uvT.sv + uvT.ov;
  out[0] = u * size.ni - 0.5;
  out[1] = (1 - v) * size.nj - 0.5;
  return out;
};

/** 채널 하나의 '바이트 → 값' — 셰이더 tapValue 안의 디코드와 같은 식이다(로그는 field-log.js 의 사본을 그대로 탄다). */
const decoderOf = (ch) => {
  if (ch && ch.transfer === 'log10') { const u = logUniforms(ch); return (b) => shaderLogDecode(u, b); }
  return (b) => b * ch.scale + ch.offset;
};

const tapValue = (px, dec, k, col, row, ni, nj, wraps) => {
  const x = wraps ? ((col % ni) + ni) % ni : Math.max(0, Math.min(ni - 1, col));
  const y = Math.max(0, Math.min(nj - 1, row));
  return dec[k](px.data[(y * ni + x) * px.channels + k]);
};

/**
 * 셰이더가 한 픽셀에서 셈하는 값을 CPU 사본으로 똑같이 셈한다(시험용 거울 — 앱은 frames.sampleAt 을 쓴다).
 *   a · b   프레임의 CPU 사본 {data, channels} · mix 0~1 · decode  frames.fieldSpec(id).channels(채널 순 · 선형이든 로그든) ·
 *   mode 'scalar' | 'magnitudeRG'
 * 네 칸을 **풀고 나서** a + (b − a)·t 로 잇는다 — a = b 면 결과가 정확히 a 다. 로그 채널도 같은 자리에서 풀린다(머리말 '로그로 실린 자료').
 */
export const shaderValueAt = ({ a, b, mix = 0, decode, uvT, size, wraps = true, mode = 'scalar' }, lat, lon) => {
  const g = gridCoordOf(uvT, size, lat, lon);
  const gy = Math.max(0, Math.min(size.nj - 1, g[1]));
  const x0 = Math.floor(g[0]);
  const y0 = Math.floor(gy);
  const fx = g[0] - x0;
  const fy = gy - y0;
  const chans = mode === 'magnitudeRG' ? 2 : 1;
  const dec = decode.slice(0, chans).map(decoderOf);
  const at = (px, k) => {
    const v00 = tapValue(px, dec, k, x0, y0, size.ni, size.nj, wraps);
    const v10 = tapValue(px, dec, k, x0 + 1, y0, size.ni, size.nj, wraps);
    const v01 = tapValue(px, dec, k, x0, y0 + 1, size.ni, size.nj, wraps);
    const v11 = tapValue(px, dec, k, x0 + 1, y0 + 1, size.ni, size.nj, wraps);
    const top = v00 + (v10 - v00) * fx;
    const bot = v01 + (v11 - v01) * fx;
    return top + (bot - top) * fy;
  };
  const c = [];
  for (let k = 0; k < chans; k += 1) {
    const va = at(a, k);
    const vb = b && mix > 0 ? at(b, k) : va;
    c.push(va + (vb - va) * mix);
  }
  return mode === 'magnitudeRG' ? Math.hypot(c[0], c[1]) : c[0];   // 풍속은 두 성분을 섞은 **뒤에** 크기를 구한다
};

/**
 * 셰이더의 maskedGrid 를 JS 로 옮긴 것 — 결측 채널이 있는 자료(JSON 격자)의 한 픽셀.
 *   px  프레임의 CPU 사본 {data, channels} — 칸마다 [값 바이트, 마스크 바이트]
 *   → { value, weight, all }   weight 0 = 네 칸이 다 결측(셰이더는 버린다) · all 1 = 네 칸이 다 값이다
 * 무게의 합이 아니라 **곱**으로 '다 있나'를 가른다(셰이더와 같은 이유 — float 에서 합은 1 에 못 미친다).
 */
export const shaderMaskedAt = ({ px, decode, uvT, size, wraps = true }, lat, lon) => {
  const g = gridCoordOf(uvT, size, lat, lon);
  const gy = Math.max(0, Math.min(size.nj - 1, g[1]));
  const x0 = Math.floor(g[0]);
  const y0 = Math.floor(gy);
  const fx = g[0] - x0;
  const fy = gy - y0;
  const tap = (col, row) => {
    const x = wraps ? ((col % size.ni) + size.ni) % size.ni : Math.max(0, Math.min(size.ni - 1, col));
    const y = Math.max(0, Math.min(size.nj - 1, row));
    const o = (y * size.ni + x) * px.channels;
    return { v: px.data[o] * decode[0].scale + decode[0].offset, m: px.data[o + 1] >= 128 ? 1 : 0 };
  };
  const c00 = tap(x0, y0);
  const c10 = tap(x0 + 1, y0);
  const c01 = tap(x0, y0 + 1);
  const c11 = tap(x0 + 1, y0 + 1);
  const w00 = (1 - fx) * (1 - fy) * c00.m;
  const w10 = fx * (1 - fy) * c10.m;
  const w01 = (1 - fx) * fy * c01.m;
  const w11 = fx * fy * c11.m;
  const sw = w00 + w10 + w01 + w11;
  return {
    value: sw > 0 ? (c00.v * w00 + c10.v * w10 + c01.v * w01 + c11.v * w11) / sw : 0,
    weight: sw,
    all: c00.m * c10.m * c01.m * c11.m,
  };
};

/** 셰이더의 FIELD_CLIP_OUTSIDE 와 같은 판정 — 격자 밖이면 참(칠하지 않는다). */
export const shaderClipsOutside = (uvT, size, wraps, lat, lon) => {
  const g = gridCoordOf(uvT, size, lat, lon);
  if (g[1] < -0.5 || g[1] > size.nj - 0.5) return true;
  return !wraps && (g[0] < -0.5 || g[0] > size.ni - 0.5);
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  셰이더
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

// main.js TERRAIN_GLSL 의 세 함수와 **같은 글자**다(머리말 '지형'). 고치려면 main.js 를 먼저 고치고 여기를 맞춘다 — 시험이 대조한다.
export const FIELD_TERRAIN_GLSL = /* glsl */ `
uniform sampler2D uHeightMap;
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

// 정점: main.js EARTH_VERT 의 변위를 그대로 따르고(극지 페이드 포함 — 빼면 남극 빙상 2,800 m 아래에 색이 묻힌다) uLift 만 더한다.
export const FIELD_VERT = FIELD_TERRAIN_GLSL + /* glsl */ `
uniform float uExagger;
uniform float uLift;
varying vec3 vUnit;

void main() {
  vUnit = normalize(position);
  float lat = asin(clamp(vUnit.y, -1.0, 1.0));
  float lon = atan(vUnit.x, vUnit.z);
  float h = displacementHeight(lon, lat);
  float poleFade = smoothstep(1.437, 1.4844, abs(lat));
  h = mix(h, lat < 0.0 ? 2800.0 : 0.0, poleFade);
  float disp = max(h, 0.0) / 6371000.0 * uExagger;
  vec3 p = vUnit * (1.0 + disp + uLift);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

// 프래그먼트. ⚠️ highp 여야 한다 — mediump 는 기압(1013.0)의 0.5 hPa 눈금을 못 담는다(field-scales.js 머리말).
//   sampler 도 highp 로 적는다: 기본(lowp)이면 읽은 값이 10bit 로 잘리는 GPU 가 있다.
// 바다 가림(FIELD_MASK_OCEAN)은 능력만 있다 — 고도 ≥ 0 인 픽셀을 버린다. 바다 레이어를 옮겨 오는 것은 다음 묶음의 일이다.
//   ⚠️ 2026-09-20(작업 D3) — 그 '다음 묶음'이 왔다. 수온·파고·평년대비수온이 이 가림을 쓴다: 0.25° CPU 가림판이
//      비우던 해안 15~40 km 와 다도해·대한해협이 프래그먼트 단위 해안선으로 돌아왔다(grid-frames.js 머리말).
//   ⚠️ 2026-09-20(반박 검증) — 고도의 **부호**만으로는 해수면보다 낮은 육지(네덜란드 간척지 · 카스피 저지 ·
//      요르단 계곡)를 가르지 못해 그 위에 바다 색면이 칠해졌다. 그래서 가림이 두 단이 됐다: 깎은 육지 판
//      (uLandMask · land-mask.js)이 먼저고 고도가 그다음이다. 판이 없으면 uHasLand = 0 으로 옛 동작이다.
// 같은 작업에서 define 둘이 늘었다 — 둘 다 **없는 값을 그리지 않기 위한 것**이다:
//   FIELD_MISSING_MASK   G 채널이 '값 있음(255)/없음(0)'인 자료. 네 칸을 마스크로 가중해 이어(maskedGrid)
//                        결측 이웃과 섞지 않는다. 네 칸이 다 결측이면 버린다.
//   FIELD_CLIP_OUTSIDE   격자 밖을 버린다. 지역 격자(동아시아 편차 114~150°E)와 ±80° 격자(OISST)의
//                        가장자리 칸이 지구 반대편·극까지 늘어나던 것을 막는다.
export const FIELD_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform vec2 uGridSize;      // 칸 수 (ni, nj)
uniform float uWrapX;        // 1 = 경도로 한 바퀴 도는 격자
uniform vec4 uUv;            // gfs-frames uvTransform: su, ou, sv, ov
uniform vec4 uDecode;        // 채널 R 의 scale·offset , 채널 G 의 scale·offset (매니페스트에서 온다)
uniform float uBreaks[FIELD_MAX_BREAKS];
uniform sampler2D uPalette;  // 1×N · NearestFilter · sRGB 바이트 그대로
uniform float uBandCount;
uniform float uOpacity;
uniform float uIsoOn;
uniform float uIsoInterval;
uniform float uIsoMajor;
uniform float uIsoLevels[FIELD_MAX_LEVELS];
uniform float uIsoWidths[FIELD_MAX_LEVELS];
uniform float uIsoLevelCount;
uniform vec3 uLineColor;
uniform vec4 uLineStyle;     // 보통 굵기px · 굵은 굵기px · 보통 알파 · 굵은 알파
uniform vec2 uLineFade;      // 이웃 선 간격(**CSS** px): 사라지는 값 · 다 보이는 값
uniform float uGradEps;
uniform float uHalfStep;     // 자료 눈금의 절반(기온 0.25) — 구간과 등치선은 '읽히는 값' v + uHalfStep 으로 정한다(머리말)
uniform float uPxScale;      // 장치 픽셀비 — 굵기는 CSS px 로 정한다
// 지형 — 바다 가림과 지형 결이 **같은 고도맵 한 장**을 본다. 그래서 #ifdef 밖에 둔다(안에 또 적으면 같은 이름이
// 두 번 선언돼 바다 레이어에서만 셰이더가 통째로 컴파일되지 않는다). main.js 지구의 uniform 객체를 그대로 물고 있다.
uniform sampler2D uHeightMap;
uniform float uHasHeight;
uniform float uExagger;      // 음영 세기만 쓴다 — 변위는 정점 셰이더가 한다
uniform float uShade;        // 지구의 음영 세기(설정 ⚙) — 지구와 색면이 같은 손잡이를 따른다
uniform vec3 uSunDir;        // 실시간 태양(월드 고정) 또는 수동 조명 — main.js 가 매 프레임 넣는다
uniform float uShadeK;       // 0 이면 지형 결 없음(평평한 구와의 차이에 곱하는 세기)
#ifdef FIELD_MASK_OCEAN
uniform sampler2D uLandMask;   // 등장방형 육지 판 — R > 0.5 면 육지(land-mask.js · 행 0 = 남 · NearestFilter)
uniform float uHasLand;        // 0 이면 판이 없다 — 옛 동작(고도 부호만)으로 돈다
#endif
#ifdef FIELD_TRANSFER_LOG10
uniform vec2 uLog;           // 로그 디코드: (logSpan/255, logLo) — 값 = 10^(byte * uLog.x + uLog.y) (매니페스트에서 온다)
uniform float uZeroByte;     // 이 바이트는 '없음' = 0 (강수율은 0.05 mm/h 미만)
const float LOG2_10 = ${FIELD_LOG2_10};   // GLSL 에 log10 이 없다 — 10^x = exp2(x * LOG2_10). field-log.js 와 같은 수다
#endif
varying vec3 vUnit;

const float PI = 3.141592653589793;

// 격자점 (열, 행) 한 칸을 **풀어서** 돌려준다. 칸 한가운데를 읽으므로 LinearFilter 텍스처여도 그 칸의 바이트 그대로다.
// floor(r×255 + 0.5) 로 정수 바이트로 되돌린다 — 머리말 ①.
vec2 tapValue(sampler2D tex, float col, float row) {
  vec2 uv = vec2((col + 0.5) / uGridSize.x, 1.0 - (row + 0.5) / uGridSize.y);
  vec2 bytes = floor(texture2D(tex, uv).rg * 255.0 + 0.5);
#ifdef FIELD_TRANSFER_LOG10
  // 로그 자료는 **한 칸씩 여기서 값으로 푼다** — 바이트를 섞은 뒤 풀면 두 값의 기하평균이 나온다(머리말 '로그로 실린 자료').
  // 없음 바이트는 0 이다(10^(…) 은 0 이 되지 못한다). 정수로 되돌린 바이트끼리 재므로 0.5 문턱이 정확하다.
  // G 는 읽지 않는다: 강수 프레임의 G(종류 부호)·B(유도값)는 값이 아니라 섞을 수 없다.
  float val = abs(bytes.x - uZeroByte) < 0.5 ? 0.0 : exp2((bytes.x * uLog.x + uLog.y) * LOG2_10);
  return vec2(val, 0.0);
#else
  return bytes * uDecode.xz + uDecode.yw;
#endif
}

// 네 칸 이중선형. a + (b − a)·t 꼴 — 고원에서 정확히 a (머리말 ②). 경도는 감고 위도는 극 행에서 멈춘다(frames.sampleAt 과 같다).
vec2 sampleGrid(sampler2D tex, vec2 g) {
  vec2 g0 = floor(g);
  vec2 f = g - g0;
  float x1 = uWrapX > 0.5 ? g0.x + 1.0 : min(g0.x + 1.0, uGridSize.x - 1.0);
  float y1 = min(g0.y + 1.0, uGridSize.y - 1.0);
  vec2 v00 = tapValue(tex, g0.x, g0.y);
  vec2 v10 = tapValue(tex, x1, g0.y);
  vec2 v01 = tapValue(tex, g0.x, y1);
  vec2 v11 = tapValue(tex, x1, y1);
  vec2 top = v00 + (v10 - v00) * f.x;
  vec2 bot = v01 + (v11 - v01) * f.x;
  return top + (bot - top) * f.y;
}

#ifdef FIELD_MISSING_MASK
// 결측(육지의 SST null 등)은 값이 아니다. 네 칸을 **마스크로 가중해** 잇는다 — 결측 이웃은 무게 0 이라
// 해안에 가짜 값 띠가 서지 않는다(grid-frames.js 머리말 '결측은 값이 아니다'). G 채널은 바이트 그대로(0 또는 255)다.
//   → vec3(값, 무게의 합, 네 칸이 다 값이면 1)
// ⚠️ '네 칸이 다 있나'를 무게의 합이 1 인지로 가르면 안 된다 — (1−f)+f 가 float 에서 0.99999994 가 된다. 곱으로 가른다.
vec3 maskedGrid(sampler2D tex, vec2 g) {
  vec2 g0 = floor(g);
  vec2 f = g - g0;
  float x1 = uWrapX > 0.5 ? g0.x + 1.0 : min(g0.x + 1.0, uGridSize.x - 1.0);
  float y1 = min(g0.y + 1.0, uGridSize.y - 1.0);
  vec2 v00 = tapValue(tex, g0.x, g0.y);
  vec2 v10 = tapValue(tex, x1, g0.y);
  vec2 v01 = tapValue(tex, g0.x, y1);
  vec2 v11 = tapValue(tex, x1, y1);
  vec4 m = vec4(step(127.5, v00.y), step(127.5, v10.y), step(127.5, v01.y), step(127.5, v11.y));
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) * m;
  float sw = w.x + w.y + w.z + w.w;
  float val = v00.x * w.x + v10.x * w.y + v01.x * w.z + v11.x * w.w;
  return vec3(sw > 0.0 ? val / sw : 0.0, sw, m.x * m.y * m.z * m.w);
}
#endif

// 선 하나의 덮임 — JS 의 lineCoverage 와 같은 식. 레벨의 아래쪽에만 서고, 기울기가 문턱 이하면(고원) 긋지 않는다.
float lineCover(float below, float grad, float widthPx) {
  if (grad <= uGradEps || below <= 0.0) return 0.0;
  float hw = widthPx * 0.5;     // ⚠️ 'half' 라고 이름 붙이면 안 된다 — GLSL ES 의 예약어라 셰이더가 통째로 컴파일되지 않는다
  return 1.0 - smoothstep(hw - 0.5, hw + 0.5, abs(below / grad - (hw + 0.5)));
}

// 전역 고도맵의 한 점(m). 바다 가림이 쓰던 그 두 줄과 같은 식이다 — 디테일 타일은 보지 않는다(색면의 '결'에는 전역 한 장이면 된다).
// ⚠️ 이름을 heightAt 으로 두지 않는다: main.js 지구 셰이더의 같은 이름 함수와 헷갈리기 쉽고, 그쪽은 디테일 타일까지 섞는다.
float fieldHeightM(float lon, float lat) {
  float latC = clamp(lat, -1.4844, 1.4844);
  vec2 muv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - log(tan(PI * 0.25 + latC * 0.5)) / (2.0 * PI));
  return dot(texture2D(uHeightMap, muv).rgb, vec3(65280.0, 255.0, 255.0 / 256.0)) - 32768.0;
}

// 지형 결 — 구간색에 곱하는 계수. main.js EARTH_FRAG 의 hillshade 와 **같은 기법**(고도 기울기로 법선을 기울여 태양과 내적)이되,
// 돌려주는 것은 밝기가 아니라 **평평한 구와의 차이**다: 평지에서는 정확히 1 이라 화면의 색이 범례의 색 그대로이고,
// 비탈에서만 어두워진다. 밤면은 양쪽이 다 0 이라 1 이 된다 — 색면은 값이지 조명이 아니다(밤에 값이 어두워지면 안 된다).
// 위로는 1 을 넘지 않는다: 밝은 비탈이 범례보다 밝아지면 그 칸의 색을 되읽을 수 없다.
// ⚠️ 폰 발열 — 이 함수는 고도맵을 최대 다섯 번 읽는다. 값이 1 로 정해지는 곳에서는 **읽기 전에** 빠져나간다:
//    밤면(고도맵 0회 · 지구의 절반) · 바다와 극(1회 · 낮 쪽 화면의 대부분). 다섯 번 읽는 것은 해가 든 육지뿐이다.
float terrainShade(vec3 nGeo, float lon, float lat) {
  if (uHasHeight < 0.5 || uShadeK <= 0.0) return 1.0;
  float sphereLit = clamp(dot(nGeo, uSunDir), 0.0, 1.0);   // ⚠️ 'flat' 이라 부르면 안 된다 — GLSL ES 의 예약어다
  if (sphereLit <= 0.0) return 1.0;                        // 밤면 — 색면은 값이지 조명이 아니다(밤이라고 값이 어두워지면 안 된다)
  float hC = fieldHeightM(lon, lat);
  float poleFade = smoothstep(1.437, 1.4844, abs(lat));
  // 지구와 같은 식 — 과장의 제곱근만큼만 음영을 키운다(같은 50배를 또 곱하면 낮은 구릉까지 자갈처럼 번쩍인다).
  // 해수면 아래(측심 — 원본이 성겨 계단이 결로 드러난다)와 극에서는 0 이다.
  float bumpK = sqrt(max(uExagger, 1.0)) * 2.0 * uShade * smoothstep(0.0, 30.0, hC) * (1.0 - poleFade);
  if (bumpK <= 0.0) return 1.0;
  vec3 crossUp = cross(vec3(0.0, 1.0, 0.0), nGeo);
  if (length(crossUp) <= 1e-4) return 1.0;                 // 극에서는 동서 축이 없다 — 결을 만들지 않는다
  float e = 0.0016;                                        // 전역 고도맵 한 칸쯤(약 10 km) — 이보다 잘게 미분하면 타일의 계단이 결이 된다
  float arcE = e * 6371000.0 * max(cos(lat), 0.08);
  float arcN = e * 6371000.0;
  float slopeE = (fieldHeightM(lon + e, lat) - fieldHeightM(lon - e, lat)) / (2.0 * arcE);
  float slopeN = (fieldHeightM(lon, lat + e) - fieldHeightM(lon, lat - e)) / (2.0 * arcN);
  vec3 tE = normalize(crossUp);
  vec3 tN = cross(nGeo, tE);
  vec3 N = normalize(nGeo - (slopeE * tE + slopeN * tN) * bumpK);
  float lit = clamp(dot(N, uSunDir), 0.0, 1.0);
  return clamp(1.0 + uShadeK * (lit - sphereLit), ${FIELD_SHADE.min.toFixed(4)}, 1.0);
}

float intervalLine(float v, float grad, float interval, float widthPx) {
  if (interval <= 0.0 || grad <= uGradEps) return 0.0;
  float fr = fract(v / interval);
  // 흐림 문턱은 CSS px 로 잰다 — grad 는 장치 px 당 값 변화라 interval/grad 는 장치 px 간격이고,
  // uLineFade 는 CSS px 로 적힌 수다(JS 의 intervalLineCoverage 와 같은 식 · 머리말 '등치선').
  float fade = smoothstep(uLineFade.x, uLineFade.y, interval / (grad * max(uPxScale, 0.0001)));
  return lineCover((1.0 - fr) * interval, grad, widthPx) * fade;
}

void main() {
  vec3 n = normalize(vUnit);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);

#ifdef FIELD_MASK_OCEAN
  // ① 육지 판이 먼저다. 고도의 **부호**로는 해수면보다 낮은 육지(네덜란드 간척지 −3 m · 요르단 계곡 −217 m ·
  //    카라기예 −107 m)를 가르지 못한다 — 2026-09-20 반박 검증이 운영 자료로 재현한 자리다(land-mask.js 머리말).
  //    판은 한 칸(약 28 km) 깎여 있어 **바다는 잃지 않는다**: 해안 한 칸 안쪽은 아래 ②가 맡는다.
  if (uHasLand > 0.5) {
    if (texture2D(uLandMask, vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5)).r > 0.5) discard;
  }
  // ② 고도 가림 — 해수면 위는 전부 육지다. 해안선이 프래그먼트 단위인 것은 이 줄이다.
  if (uHasHeight > 0.5) {
    float latC = clamp(lat, -1.4844, 1.4844);
    vec2 muv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - log(tan(PI * 0.25 + latC * 0.5)) / (2.0 * PI));
    float hgt = dot(texture2D(uHeightMap, muv).rgb, vec3(65280.0, 255.0, 255.0 / 256.0)) - 32768.0;
    if (hgt >= 0.0) discard;
  }
#endif

  // 구면 uv → 점 격자 보정 → 연속 칸 좌표 (JS 의 gridCoordOf 와 같은 식)
  vec2 suv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
  vec2 tuv = vec2(suv.x * uUv.x + uUv.y, suv.y * uUv.z + uUv.w);
  vec2 g = vec2(tuv.x * uGridSize.x - 0.5, (1.0 - tuv.y) * uGridSize.y - 0.5);
#ifdef FIELD_CLIP_OUTSIDE
  // 격자 밖에서는 아무 말도 하지 않는다. 아래 clamp 는 '전지구 격자가 극 행에서 멈춘다'는 규칙이라
  // 위도로 ±90° 를 다 덮지 않는 격자(OISST 는 ±80°)에서는 가장자리 행을 극까지 늘여 칠한다 — 그 전에 버린다.
  // 경도는 한 바퀴 도는 격자면 감기므로 판정하지 않고, 지역 격자(동아시아 편차 114~150°E)만 본다.
  // 여유 반 칸은 점 격자가 대표하는 칸의 폭이다(끝 점이 제 칸의 한가운데에 있다).
  if (g.y < -0.5 || g.y > uGridSize.y - 0.5) discard;
  if (uWrapX < 0.5 && (g.x < -0.5 || g.x > uGridSize.x - 0.5)) discard;
#endif
  g.y = clamp(g.y, 0.0, uGridSize.y - 1.0);

  // 값을 보간한다 — 공간(네 칸)도 시간(두 프레임)도 값으로.
#ifdef FIELD_MISSING_MASK
  vec3 ma = maskedGrid(uTexA, g);
  vec3 mb = maskedGrid(uTexB, g);
  if (min(ma.y, mb.y) <= 0.0) discard;                  // 네 칸이 다 결측 — 없는 값을 지어내지 않는다
#ifdef FIELD_MASK_OCEAN
  // 지형을 통째로 못 받은 세션(uHasHeight = 0)은 위의 고도 가림이 돌지 않는다. 그때는 **자료 자신의 결측**이
  // 해안선 노릇을 한다 — 네 칸이 다 값일 때만 칠한다(옛 erodeNodes 대체 규칙과 같은 뜻이고, 자리는 프래그먼트다).
  // 전부 가리지도(바다가 사라진다), 전부 드러내지도(육지가 물든다) 않는 자리다.
  if (uHasHeight < 0.5 && min(ma.z, mb.z) < 0.5) discard;
#endif
  vec2 ca = vec2(ma.x, 0.0);
  vec2 cb = vec2(mb.x, 0.0);
#else
  vec2 ca = sampleGrid(uTexA, g);
  vec2 cb = sampleGrid(uTexB, g);
#endif
  vec2 c = ca + (cb - ca) * uMix;
#ifdef FIELD_MODE_MAGNITUDE
  float v = length(c);          // 풍속 = |(u, v)| — 두 성분을 섞은 뒤에 크기를 구한다
#else
  float v = c.x;
#endif

  // 색은 양자화한다 — field-scales.js 의 구간 규칙 그대로(아래 경계 포함). 넣는 값은 읽히는 값(v + 반 눈금)이다. 팔레트는 한 번만 읽는다.
  float vs = v + uHalfStep;
  float idx = 0.0;
  for (int i = 0; i < FIELD_MAX_BREAKS; i++) idx += step(uBreaks[i], vs);
  vec4 band = texture2D(uPalette, vec2((idx + 0.5) / uBandCount, 0.5));
  float bandA = band.a * uOpacity;
  // 지형 결은 **바탕색을 섞어** 내지 않는다(그러면 밑에 무엇이 있느냐에 따라 같은 값이 다른 색으로 칠해져 범례와 어긋난다).
  // 색조는 그대로 두고 밝기만 깎는 계수 하나로 준다 — 평지에서는 1 이라 화면의 색 = 범례의 색이다.
  band.rgb *= terrainShade(n, lon, lat);

  // 등치선
  float line = 0.0;
  if (uIsoOn > 0.5) {
    float grad = fwidth(vs);
    line = intervalLine(vs, grad, uIsoInterval, uLineStyle.x * uPxScale) * uLineStyle.z;
    line = max(line, intervalLine(vs, grad, uIsoMajor, uLineStyle.y * uPxScale) * uLineStyle.w);
    for (int i = 0; i < FIELD_MAX_LEVELS; i++) {
      if (float(i) >= uIsoLevelCount) break;
      float wide = step(uLineStyle.x + 0.01, uIsoWidths[i]);
      float cov = lineCover(uIsoLevels[i] - vs, grad, uIsoWidths[i] * uPxScale);
      line = max(line, cov * (uLineStyle.z + (uLineStyle.w - uLineStyle.z) * wide));
    }
  }

  // 흰 선을 구간색 **위에 얹는다**(over 합성). 이 셰이더에서 색이 다른 색과 만나는 곳은 여기 하나고, 상대는 늘 상수 uLineColor 다 —
  // 구간색끼리는 어디서도 섞이지 않는다.
  float outA = line + bandA * (1.0 - line);
  if (outA < 0.004) discard;
  vec3 rgb = (uLineColor * line + band.rgb * bandA * (1.0 - line)) / outA;
  gl_FragColor = vec4(rgb, outA);   // sRGB 바이트 그대로 — colorspace 변환을 넣지 않는다(머리말 '색 공간')
}
`;

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  그리기
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const MODES = Object.freeze(['scalar', 'magnitudeRG']);
const MASKS = Object.freeze(['none', 'ocean']);
const TRANSFERS = Object.freeze(['linear', 'log10']);

/**
 * new FieldRenderer({ scale, mode, mask, transfer, missing, clip, terrain, geometry, segments, lift, opacity, renderOrder })
 *   scale     field-scales.js 의 얼린 눈금(scaleOf('temp'))
 *   mode      'scalar'(기온·기압) | 'magnitudeRG'(풍속 = |R,G|)
 *   mask      'none' | 'ocean'(고도 ≥ 0 인 픽셀을 버린다)
 *   transfer  'linear'(byte × scale + offset) | 'log10'(강수율 — 머리말 '로그로 실린 자료'). 매니페스트가 말한 것과 다르면 setField 가 던진다.
 *   missing   참이면 둘째 채널이 결측 마스크다 — 네 칸을 마스크로 가중해 잇고 다 결측이면 버린다(JSON 격자)
 *   clip      참이면 격자 밖을 버린다(지역 격자 · 극까지 안 닿는 격자). 전지구 0.5° GFS 는 거짓이다
 *   terrain   main.js 지구의 uniform 묶음 — uHeightMap · uHasHeight · uExagger **객체를 그대로** 물린다. 없으면(시험) 평평한 구.
 *   geometry  지구의 SphereGeometry 를 받아 같이 쓴다(머리말 '지형'). 없으면 segments 로 하나 만든다.
 * 프레임이 오기 전에는 보이지 않는다(visible = false) — 빈 색·검은 구를 그리지 않는다. setFrames 가 켠다.
 */
export class FieldRenderer {
  constructor({
    scale, mode = 'scalar', mask = 'none', transfer = 'linear', missing = false, clip = false,
    terrain = null, geometry = null, segments = [1024, 512],
    lift = FIELD_LIFT, opacity = FIELD_OPACITY, renderOrder = FIELD_RENDER_ORDER, shadeK = FIELD_SHADE.k,
  } = {}) {
    if (!MODES.includes(mode)) throw new RangeError(`field-renderer: 모르는 mode '${mode}'`);
    if (!MASKS.includes(mask)) throw new RangeError(`field-renderer: 모르는 mask '${mask}'`);
    if (!TRANSFERS.includes(transfer)) throw new RangeError(`field-renderer: 모르는 transfer '${transfer}'`);
    if (missing && mode === 'magnitudeRG') throw new RangeError('field-renderer: 크기 모드는 둘째 채널이 성분이라 결측 마스크를 실을 수 없다');
    this.mode = mode;
    this.mask = mask;
    this.transfer = transfer;
    this.missing = !!missing;
    this.clip = !!clip;
    const t = terrain || {};
    this.uniforms = {
      uTexA: { value: null },
      uTexB: { value: null },
      uMix: { value: 0 },
      uGridSize: { value: new THREE.Vector2(1, 1) },
      uWrapX: { value: 1 },
      uUv: { value: new THREE.Vector4(1, 0, 1, 0) },
      uDecode: { value: new THREE.Vector4(1, 0, 1, 0) },
      // 로그 디코드(강수율). 선형 필드에서는 셰이더가 읽지 않는다 — 그래도 재질에 두는 것은 uHeightMap 과 같은 이유다(uniform 표가 한 벌).
      uLog: { value: new THREE.Vector2(0, 0) },
      uZeroByte: { value: 0 },
      uBreaks: { value: new Float32Array(FIELD_MAX_BREAKS) },
      uPalette: { value: null },
      uBandCount: { value: 1 },
      uOpacity: { value: opacity },
      uIsoOn: { value: 0 },
      uIsoInterval: { value: 0 },
      uIsoMajor: { value: 0 },
      uIsoLevels: { value: new Float32Array(FIELD_MAX_LEVELS) },
      uIsoWidths: { value: new Float32Array(FIELD_MAX_LEVELS) },
      uIsoLevelCount: { value: 0 },
      uLineColor: { value: new THREE.Vector3(...FIELD_LINE.color) },
      uLineStyle: { value: new THREE.Vector4(FIELD_LINE.minorWidthPx, FIELD_LINE.majorWidthPx, FIELD_LINE.minorAlpha, FIELD_LINE.majorAlpha) },
      uLineFade: { value: new THREE.Vector2(FIELD_LINE.fadePx[0], FIELD_LINE.fadePx[1]) },
      uGradEps: { value: FIELD_GRAD_EPS },
      uHalfStep: { value: 0 },
      uPxScale: { value: 1 },
      // 지형 — main.js 의 uniform **객체**를 그대로 쓴다. 과장·고도맵·태양이 바뀌면 저쪽이 value 를 고치고 이쪽은 같은 객체를 읽는다.
      // (그래서 지형 결에 필요한 것이 늘어도 여기서 매 프레임 맞춰 줄 일이 없다 — 태양은 main.js tick 이 uSunDir 에 넣는다.)
      uHeightMap: t.uHeightMap || { value: null },
      uHasHeight: t.uHasHeight || { value: 0 },
      uExagger: t.uExagger || { value: 1 },
      uShade: t.uShade || { value: 0.9 },
      uSunDir: t.uSunDir || { value: new THREE.Vector3(0, 0, 1) },
      // 지형 결의 세기. 지구 uniform 묶음이 없으면(시험 · 지형을 못 받은 세션) 0 — 셰이더가 그 줄을 지나간다.
      uShadeK: { value: t.uHeightMap ? shadeK : 0 },
      uLift: { value: lift },
      // 육지 판 — 바다 가림 레이어만 쓴다. 판이 오기 전에는 uHasLand = 0 이라 셰이더가 이 줄을 지나간다(열린 실패).
      uLandMask: { value: null },
      uHasLand: { value: 0 },
    };
    const defines = { FIELD_MAX_BREAKS, FIELD_MAX_LEVELS };
    if (mode === 'magnitudeRG') defines.FIELD_MODE_MAGNITUDE = 1;
    if (mask === 'ocean') defines.FIELD_MASK_OCEAN = 1;
    if (transfer === 'log10') defines.FIELD_TRANSFER_LOG10 = 1;
    if (this.missing) defines.FIELD_MISSING_MASK = 1;
    if (this.clip) defines.FIELD_CLIP_OUTSIDE = 1;
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, defines, vertexShader: FIELD_VERT, fragmentShader: FIELD_FRAG,
      transparent: true, depthWrite: false, depthTest: true, precision: 'highp',
    });
    this.ownsGeometry = !geometry;
    this.geometry = geometry || new THREE.SphereGeometry(1, segments[0], segments[1]);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;   // 정점이 셰이더에서 올라간다 — 반지름 1 짜리 경계구로 자르면 과장된 산 너머가 잘린다
    this.mesh.visible = false;
    // 그리기 직전: 장치 픽셀비를 맞추고(선 굵기는 CSS px) 듣는 쪽(라벨)에 카메라를 넘긴다. tick 을 따로 배선하지 않는다.
    this.onFrame = null;
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const pr = renderer && renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
      if (pr > 0) this.uniforms.uPxScale.value = pr;
      if (this.onFrame) this.onFrame(camera);
    };
    this.palette = null;
    this.scale = null;
    if (scale) this.setScale(scale);
  }

  get object() { return this.mesh; }

  /**
   * 눈금표 → 경계 배열 + 팔레트 텍스처. 팔레트는 **NearestFilter** 다 — Linear 로 읽으면 칸 사이에서 색이 섞여 그라데이션으로 돌아간다.
   * '칠하지 않는 칸'(강수 0.1 mm/h 미만 · 눈금표의 불투명도 0)은 팔레트의 **알파 바이트 0** 으로 들어온다:
   * 셰이더가 bandA = 0 을 받고 선도 없으면 outA < 0.004 에서 discard 한다 — 옅게도 칠하지 않고 아예 그리지 않는다.
   * 그래서 렌더러는 어느 칸이 '칠하지 않는 칸'인지 따로 알 필요가 없다. 눈금표 한 줄이 그것을 말한다.
   */
  setScale(scale) {
    const u = scaleUniforms(scale);
    this.uniforms.uBreaks.value.set(u.breaks);
    this.uniforms.uBandCount.value = u.bandCount;
    if (this.palette) this.palette.dispose();
    const tex = new THREE.DataTexture(u.palette, u.bandCount, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;   // sRGB 바이트를 그대로 내보낸다(머리말 '색 공간')
    tex.needsUpdate = true;
    this.palette = tex;
    this.uniforms.uPalette.value = tex;
    this.scale = scale;
  }

  /**
   * 어느 필드인가 — 프레임 저장소가 말해 준 것을 그대로 넣는다(디코드 상수를 여기 적지 않는다).
   *   channels  frames.fieldSpec(id).channels (이 렌더러의 transfer 와 같은 식이어야 한다 — 다르면 던진다)
   *   uv        frames.uvTransform(id) · grid  frames.fieldSpec(id).grid
   * ⚠️ 디코드 식이 어긋나면 화면이 죽지 않고 **조용히 틀린 값**을 칠한다(셰이더의 #ifdef 는 컴파일 때 이미 갈렸다) — 그래서 던진다.
   */
  setField({ channels, uv, grid }) {
    const need = this.mode === 'magnitudeRG' ? 2 : 1;
    if (!channels || channels.length < need) throw new RangeError(`field-renderer: '${this.mode}' 는 채널 ${need}개가 필요하다`);
    for (let k = 0; k < need; k += 1) {
      if (channels[k].transfer !== this.transfer) {
        throw new RangeError(this.transfer === 'linear'
          ? `field-renderer: 선형 디코드만 그린다 — 이 필드는 '${channels[k].transfer}' 다(로그 필드는 transfer:'log10' 렌더러가 그린다)`
          : `field-renderer: 이 렌더러는 '${this.transfer}' 로 푼다 — 매니페스트의 '${channels[k].transfer}' 와 다르다`);
      }
    }
    // 결측을 셈하겠다고 했으면 둘째 채널이 실제로 마스크여야 한다 — 성분 채널을 마스크로 읽으면 바다가 통째로 사라진다.
    if (this.missing && !(channels[1] && channels[1].role === 'mask')) {
      throw new RangeError("field-renderer: missing 인데 둘째 채널이 결측 마스크(role 'mask')가 아니다");
    }
    const c0 = channels[0];
    if (this.transfer === 'log10') {
      // 로그는 채널 하나(R)뿐이다. uDecode 는 건드리지 않는다 — 로그 채널에는 scale·offset 이 없어 넣으면 NaN 이 된다.
      const u = logUniforms(c0);
      this.uniforms.uLog.value.set(u.span, u.lo);
      this.uniforms.uZeroByte.value = u.zeroByte;
    } else {
      const c1 = channels[1] || c0;
      this.uniforms.uDecode.value.set(c0.scale, c0.offset, c1.scale, c1.offset);
    }
    this.uniforms.uUv.value.set(uv.su, uv.ou, uv.sv, uv.ov);
    this.uniforms.uGridSize.value.set(grid.ni, grid.nj);
    this.uniforms.uWrapX.value = grid.wraps === false ? 0 : 1;
    this.uniforms.uHalfStep.value = halfStepOf(channels, this.mode);
  }

  /** 두 프레임과 그 사이 비율. texA 가 없으면 숨는다 — 없는 자료를 빈 색으로 그리지 않는다. */
  setFrames(texA, texB, mix = 0) {
    if (!texA) { this.mesh.visible = false; return; }
    this.uniforms.uTexA.value = texA;
    this.uniforms.uTexB.value = texB || texA;
    this.setMix(texB ? mix : 0);
    this.mesh.visible = true;
  }

  setMix(mix) { this.uniforms.uMix.value = Math.max(0, Math.min(1, Number(mix) || 0)); }

  /** 등치선 — field-scales.isolineSpec 의 결과와 켬/끔. 명세가 null(풍속)이면 on 이어도 긋지 않는다. */
  setIsolines(spec, on = true) {
    const iso = isolineUniforms(spec, on);
    const u = this.uniforms;
    u.uIsoOn.value = iso.on;
    u.uIsoInterval.value = iso.interval;
    u.uIsoMajor.value = iso.majorEvery;
    u.uIsoLevels.value.set(iso.levels);
    u.uIsoWidths.value.set(iso.widths);
    u.uIsoLevelCount.value = iso.levelCount;
    return iso;
  }

  setOpacity(a) { this.uniforms.uOpacity.value = Math.max(0, Math.min(1, a)); }

  /**
   * 육지 판을 물린다(mask 'ocean' 에서만 뜻이 있다 — 다른 렌더러는 셰이더에 그 줄이 없다).
   * 판이 없거나(null) 아직 못 받았으면 uHasLand = 0 이라 고도 부호만으로 가르던 옛 동작 그대로다.
   * 판 텍스처는 저장소(land-mask.js)의 것이다 — 여기서 버리지 않는다.
   */
  setLandMask(tex) {
    this.uniforms.uLandMask.value = tex || null;
    this.uniforms.uHasLand.value = (this.mask === 'ocean' && tex) ? 1 : 0;
  }

  setVisible(v) { this.mesh.visible = !!v && !!this.uniforms.uTexA.value; }

  dispose() {
    if (this.palette) this.palette.dispose();
    this.material.dispose();
    if (this.ownsGeometry) this.geometry.dispose();   // 받은 지오메트리(지구의 것)는 버리지 않는다
    // 값 텍스처는 프레임 저장소의 것이다 — 여기서 버리지 않는다.
    this.uniforms.uTexA.value = null;
    this.uniforms.uTexB.value = null;
    this.mesh.visible = false;
  }
}
