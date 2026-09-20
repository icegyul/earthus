// EARTHUS v2 — 색 눈금표 한 장 (DEV-DIRECTIVE 2026-09-20 · W1 §6 "팔레트와 레벨 배열은 한 곳에서 나온다")
//
// 무엇이 잘못돼 있었나: 색·범례·등치선 값이 파일마다 따로 적혀 있었다. live-layers.js 의 TEMP_RAMP·SPD_RAMP·WAVE_RAMP 는
// 정지점 사이를 **선형 보간**하는 그라데이션이고(rampFrom), 범례는 v2 에 사실상 없으며, 등치선은 아예 없다.
// 같은 값을 세 군데 적으면 셋이 어긋난다 — 파고가 계약(1·2·3·4·6·9 m)과 다른 0·1·2.5·4·6·8 로 들어가 있는 것이 그 사고다.
// PD(2026-09-20): "기온도 그라데이션이 아니라 선·레벨로 하기로 했는데 그라데이션이네?"
//
// 이 파일이 하는 일: **셰이더(팔레트 텍스처·경계 배열) · 범례(DOM) · 등치선(간격·강조값)이 같이 읽는 표 한 장.**
//   표의 한 줄 = 한 구간 = [아래 경계, 색]. 경계 수 + 1 = 색 수가 **구조로** 보장된다(따로 세어 맞추지 않는다).
//   한 줄을 바꾸면 paletteRGBA · breaksFloat32 · legendModel · isolineSpec 이 같이 바뀐다 — W1 완료 기준 ①이고,
//   tools/earthus-v53/field-scales.test.mjs 가 그것을 잠근다.
//
// 이 파일은 DOM · THREE · i18n 을 모른다(순수 함수 + 얼린 표). 화면은 field-legend.js 가, 셰이더는 W1 FieldRenderer 가 읽는다.
//
// ── 구간 규칙 (⚠️ 셰이더가 **똑같이** 써야 한다 — 다르면 클릭한 값의 칸과 칠해진 칸이 경계에서 갈린다) ──────────
//   구간 i = [ breaks[i-1], breaks[i] )  — **아래 경계 포함(이상) · 위 경계 제외(미만).**
//   bandIndex(v) = 'v 이상인 경계의 개수'.   35.0 → '≥ 35' 칸 · 34.999 → '30 – 35' 칸 · −10.0 → '−10 – −5' 칸 · −10.001 → '< −10' 칸.
//   GLSL 로는 한 줄이다:   float idx = 0.0;  for (i…) idx += step(uBreaks[i], v);      // step(edge, x) = x >= edge ? 1 : 0
//   팔레트 텍스처는 1×N · **NearestFilter** · u = (idx + 0.5) / N 으로 읽는다(Linear 로 읽으면 색이 섞여 그라데이션으로 돌아간다).
//   양 끝은 열린 구간이다('< −10' · '≥ 35'). 값이 없음(null · NaN)은 −1 — 칠하지 않는다.
//   비교는 float32 로 한다(Math.fround) — GPU 가 float32 로 비교하므로 0.1 같은 경계에서 CPU 와 GPU 가 같은 칸을 고른다.
//   ⚠️ W1: 프래그먼트 셰이더는 precision highp float 로. mediump 는 기압(1013.0)의 0.5 hPa 눈금을 못 담는다.
//
// ── 색을 어디서 가져왔나 ──────────────────────────────────────────────────────────────────────────────────────
//   PD 콘셉트 이미지 docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/images/image1.png 의 범례 칸을 픽셀로 읽었다(2026-09-20).
//     기온 11칸  #01297c #0044c5 #0a8bf3 #3ba0f0 #30b7c3 #7ec382 #e2d642 #ecb135 #f38a35 #e73429 #d50738   L* 20 34 57 64 68 73 84 76 68 51 45
//     풍속  8칸  #023e98 #0976e1 #13b3d7 #7bd08d #cad14a #eba345 #e95e3e #eb114f                           L* 29 50 67 77 81 72 58 50
//     강수  8칸  #0363e7 #0396e9 #24bdcc #6ac997 #bed95c #f09551 #e8494e #f02871                           L* 45 60 70 74 83 70 55 53
//     SST  10칸  #0049c3 #0058ef #007bee #019ee7 #19aec7 #60c192 #a5c570 #eec131 #ed531f #e6133d           L* 35 43 52 62 65 71 76 80 56 49
//     PM2.5 6칸  #17ad7d #e4d233 #f69b29 #f67631 #cc1338 #a3054e                                           L* 63 83 72 64 44 35
//   색상 순서(남색 → 파랑 → 청록 → 초록 → 노랑 → 주황 → 빨강 → 진홍)는 시안 그대로다. 손본 것은 **이웃 칸의 구별**뿐이다:
//   시안은 이웃 명도차가 4~7 인 곳이 있다(기온 −5~0 과 0~5 가 거의 같은 파랑 — 하필 어는점 경계다 · SST 12~28 의 네 칸 · 강수 맨 위 두 칸).
//   이웃 칸의 명도차를 5 이상으로 벌리고, 가장 어두운 칸을 L* 25 위로 올렸다(어두운 지구 위에서 남색이 바다에 묻히지 않게).
//
// ── ⚠️ 명도는 '단조'가 아니라 '한 봉우리'다 — 지시와 다른 점이라 크게 적는다 ──────────────────────────────────
//   작업 지시는 "색각 이상에서도 순서가 읽히게(명도 단조)"였다. 그런데 시안의 무지개(파랑 → 노랑 → 빨강)는 명도가
//   **노랑에서 꺾인다**(위 L* 실측). 채도를 지킨 빨강은 L* 53 을 못 넘고 노랑은 85 아래로 못 내려가므로,
//   파랑→노랑→빨강 순서를 지키면서 명도를 끝까지 단조로 만드는 방법은 없다(맨 위 칸이 분홍빛 흰색이 되거나 노랑이 겨자색이 된다).
//   "PD 정본이 이긴다"(지시서 W1 표 머리말) — 그래서 시안의 색상 순서를 지키고, 명도는 **한 봉우리**로 잠갔다:
//     찬 팔(봉우리 앞)은 밝아질수록 큰 값 · 더운 팔(봉우리 뒤)은 어두워질수록 큰 값. 두 팔은 파랑↔노랑 축으로 갈린다 —
//     적록 색각 이상(제1·제2)이 지키는 축이다(ColorBrewer RdYlBu 가 색각 안전으로 분류되는 것과 같은 구조).
//   시험이 잠그는 것: 봉우리 하나 · 이웃 명도차 ≥ 5 · 제1·제2·제3 색각 모의에서도 이웃 칸 색차 ≥ 8 · 어느 두 칸도 한 색으로 겹치지 않음.
//   진짜 단조 팔레트(예: 남색→청록→노랑→흰색)로 바꿀지는 **PD 결정**이다. 바꾸려면 아래 표의 색만 고치면 된다.
//
// ── 표에 없는 것 ─────────────────────────────────────────────────────────────────────────────────────────────
//   · 디코드 상수(byte → 값)는 여기 적지 않는다 — 운영 매니페스트 clouds/gfs-fc/manifest.json 의 fields[].channels 가 정본이다
//     (aws/gfs-cloud-forecast/handler.py field_specs). 같은 값을 두 곳에 적지 않는다(지시서 §7-4).
//   · 기온 편차(W2 Anomaly '발산형 11칸')는 지시서에 경계가 없다. 짓지 않았다.

// 1 kt = 1852 m/h (국제 해리 정의) → 1 m/s = 3600/1852 kt = 1.943844…
export const KT_PER_MS = 3600 / 1852;

// 셰이더 uniform 배열을 고정 길이로 쓸 때 남는 칸을 채우는 값. 어떤 자료값보다 커서 step(PAD, v) 가 늘 0 이다 —
// 셰이더가 '경계가 몇 개인지' 몰라도 같은 반복문으로 돈다. (Infinity 는 GLSL uniform 에서 구현마다 다르게 굴어 쓰지 않는다.)
export const BREAK_PAD = 3.0e38;

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
};

/**
 * 표 한 장(spec) → 얼린 눈금. breaks · colors · alpha 는 bands 에서 **유도**한다(손으로 맞추지 않는다).
 * 시험이 '한 줄을 바꾼 표'를 만들 때도 이 함수를 쓴다.
 *
 * spec.bands: [[아래 경계 | null, '#rrggbb', 불투명도(0~1 · 생략 1)], …]  — 첫 줄의 경계는 null(열린 끝)이고 아래에서 위로 적는다.
 */
export const defineScale = (spec) => {
  const bands = (spec.bands || []).map((b) => [b[0] == null ? null : Number(b[0]), String(b[1]), b[2] == null ? 1 : Number(b[2])]);
  const { breaks: _b, colors: _c, alpha: _a, ...rest } = spec;   // 유도값을 밖에서 받지 않는다 — 표와 어긋난 사본이 들어올 길을 막는다
  return deepFreeze({
    ...JSON.parse(JSON.stringify(rest)),
    bands,
    breaks: bands.slice(1).map((b) => b[0]),
    colors: bands.map((b) => b[1]),
    alpha: bands.map((b) => b[2]),
  });
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//  표 — 경계는 지시서 '### W1' 의 표가 정본이다(PD 시안에서 읽은 값 · 계약 CONTINUOUS_LAYERS.md 와 다르면 PD 가 이긴다).
//  한 줄 = [아래 경계, 색, 불투명도?]   ·   주석의 L* 는 CIELAB 명도(시험이 다시 계산한다)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
const SPECS = {
  // 기온 — 5°C 11단. 봉우리는 15~20(노랑). 등온선은 2°C / 5°C 선택, 10°C 마다 굵게 + 라벨.
  // 기본이 5 인 이유: 5°C 선은 전부 색 경계 위에 놓인다(색 경계 = 범례 경계 = 등치선 값). 2°C 선은 10 의 배수에서만 색 경계와 만난다.
  temp: {
    name: { ko: '기온', en: 'Temperature' },
    unit: '°C', digits: 1, kind: 'sequential',
    bands: [
      [null, '#1c2f96'],   //        < −10   L* 25
      [-10, '#1f52cc'],    //  −10 ~  −5     L* 39
      [-5, '#2878e6'],     //   −5 ~   0     L* 51
      [0, '#3d9fec'],      //    0 ~   5     L* 63   ← 어는점. 시안은 이 칸과 아래 칸이 거의 같은 파랑이었다
      [5, '#33bdb9'],      //    5 ~  10     L* 70
      [10, '#8bd47c'],     //   10 ~  15     L* 78
      [15, '#f4e64e'],     //   15 ~  20     L* 90   ← 봉우리
      [20, '#f2b134'],     //   20 ~  25     L* 76
      [25, '#ee8130'],     //   25 ~  30     L* 65
      [30, '#e2402c'],     //   30 ~  35     L* 52
      [35, '#bd1245'],     //        ≥ 35    L* 41
    ],
    isolines: {
      default: '5',
      choices: {
        2: { interval: 2, majorEvery: 10, label: 'major' },
        5: { interval: 5, majorEvery: 10, label: 'major' },
      },
    },
  },

  // 풍속 — PD m/s 8단. **등치선 없음**: 풍속 등치선은 격자 모양이 된다(5° 교훈 — v1 이 2026-09-08 에 뺐다. 0.5° 재평가는 W3 뒤).
  // m/s 와 kt 를 **동시에** 보인다(mode 'both'). kt 는 환산해 정수로 반올림한 값이라 범례의 자리 표시이지 경계의 정본이 아니다.
  // ⚠️ 40~50 · ≥50 칸은 약속하지 않는다 — GFS 0.5° 는 태풍 중심을 무디게 담는다(지시서 W3). 표에는 있고 자료가 못 채울 뿐이다.
  wind: {
    name: { ko: '풍속', en: 'Wind speed' },
    unit: 'm/s', digits: 1, kind: 'sequential',
    altUnit: { unit: 'kt', factor: KT_PER_MS, digits: 0, mode: 'both' },
    bands: [
      [null, '#123f9a'],   //       < 1     L* 29
      [1, '#1672de'],      //   1 ~  5      L* 49
      [5, '#19b2d8'],      //   5 ~ 10      L* 67
      [10, '#74cf8c'],     //  10 ~ 20      L* 76
      [20, '#e6e04e'],     //  20 ~ 30      L* 87   ← 봉우리
      [30, '#eda243'],     //  30 ~ 40      L* 72
      [40, '#e65a3c'],     //  40 ~ 50      L* 57
      [50, '#d01556'],     //       ≥ 50    L* 45
    ],
    isolines: null,
    legendNote: {
      ko: '입자 속도·꼬리 길이는 방향과 상대 세기를 보이기 위한 과장 표현입니다',
      en: 'Particle speed and tail length are exaggerated to show direction and relative strength',
    },
  },

  // 해면기압 — "색면은 옅게 · 4 hPa 등압선 + H/L 기호"(지시서). 그림의 주인은 등압선이고 색면은 바탕이다 → 모든 칸 불투명도 0.4.
  // ⚠️ PD 표는 색면의 **경계를 정하지 않았다.** 등압선 간격(4 hPa)의 배수인 8 hPa 로 골랐다 — 색 경계가 늘 등압선 위에 놓인다.
  //    1008~1016(표준 기압 1013 을 품은 칸)을 중립으로 두고 저기압 쪽은 붉게·고기압 쪽은 푸르게(기존 PRES_RAMP 와 같은 방향).
  //    경계 값 자체는 PD 가 정할 일이다 — 바꾸려면 이 표만 고친다.
  // 등압선: 4 hPa 는 기상청 지상일기도의 간격이고 1012 를 굵게 하는 것은 v1 의 규칙이다(prototype/js/isobars.js:14 · :148 — "우리가 정한 값이 아니다").
  // H/L 기호를 찍는 일은 W1 의 몫이다(극값 찾기는 눈금이 아니라 자료의 일).
  pressure: {
    name: { ko: '해면기압', en: 'Sea-level pressure' },
    unit: 'hPa', digits: 1, kind: 'diverging', pivot: 1012,
    bands: [
      [null, '#a8243a', 0.4],   //        < 984    L* 38
      [984, '#cf5240', 0.4],    //  984 ~  992     L* 51
      [992, '#e68e5c', 0.4],    //  992 ~ 1000     L* 67
      [1000, '#ecc092', 0.4],   // 1000 ~ 1008     L* 80
      [1008, '#c9ced4', 0.4],   // 1008 ~ 1016     L* 83   ← 중립(무채색)
      [1016, '#a3c6ec', 0.4],   // 1016 ~ 1024     L* 79
      [1024, '#6b9de0', 0.4],   // 1024 ~ 1032     L* 64
      [1032, '#3f6fcc', 0.4],   // 1032 ~ 1040     L* 48
      [1040, '#2a469f', 0.4],   //        ≥ 1040   L* 33
    ],
    isolines: { interval: 4, majorEvery: null, emphasize: [1012], label: 'all' },
  },

  // 강수 — 0.1 미만은 **칠하지 않는다**(불투명도 0): 안 오는 곳을 파랗게 칠하면 지구 전체가 비가 된다(live-layers.js RAIN_RAMP 의 규칙 그대로).
  //   그래서 팔레트는 9칸(경계 8 + 1)이고 범례는 8칸이다 — 범례는 화면에 있는 색만 말한다. PD 시안 03 의 범례도 '0.1 – 0.5' 에서 시작한다.
  // mm/h ↔ 누적 mm: **같은 경계를 쓰고 단위 글자만 바꾼다**(mode 'switch'). 이유:
  //   ① PD 표와 시안 03 이 경계 한 벌에 단위만 바꾼다('1h Accumulation' 옆 범례가 mm/h 8단 그대로) · W4 완료 기준도 '범례 **단위**가 맞게 바뀐다'다.
  //   ② 1시간 누적 mm 는 그 시간의 평균 강수율 mm/h 와 숫자가 같다 — 같은 경계가 같은 뜻이다.
  //   ③ 토글할 때마다 색의 뜻이 바뀌면 '같은 색 = 같은 세기'가 깨진다.
  //   ⚠️ 한계: 3시간·24시간 누적은 50 mm 를 쉽게 넘어 맨 위 칸에 몰린다. 누적 전용 눈금은 PD 표에 없어 짓지 않았다 — W4 에서 PD 결정.
  //   ⚠️ 자료 한계: GFS 강수율 프레임은 30 mm/h 에서 포화한다(handler.py PRATE_HI) — '≥ 50' 칸은 그 자료로는 나오지 않는다(레이더는 나온다).
  // 등치선: '강한 코어(≥10) 윤곽' 하나.
  precip: {
    name: { ko: '강수', en: 'Precipitation' },
    unit: 'mm/h', digits: 1, kind: 'sequential',
    altUnit: { unit: 'mm', factor: 1, digits: 1, mode: 'switch' },
    bands: [
      [null, '#1461e0', 0],   //        < 0.1   칠하지 않는다(색은 자리만 채운다 — 이웃 칸과 같은 색)
      [0.1, '#1461e0'],       //  0.1 ~ 0.5     L* 44
      [0.5, '#1494e8'],       //  0.5 ~ 1       L* 59
      [1, '#22bccb'],         //    1 ~ 2       L* 70
      [2, '#7ad692'],         //    2 ~ 5       L* 79
      [5, '#e6e352'],         //    5 ~ 10      L* 88   ← 봉우리
      [10, '#f09a4c'],        //   10 ~ 20      L* 71
      [20, '#e64b47'],        //   20 ~ 50      L* 54
      [50, '#cf1b78'],        //        ≥ 50    L* 46
    ],
    isolines: { levels: [10], emphasize: [10], label: 'none' },
    legendNote: { ko: '0.1 미만은 칠하지 않습니다', en: 'Below 0.1 is left unpainted' },
  },

  // 해수면 온도 — 4°C 10단. 1°C 등온선 토글 · 26·29°C 강조(태풍 발달 · 산호 백화 경계 — 지시서 W1 표).
  // 26·29 는 색 경계(24·28) 위에 있지 않다 — 등치선으로만 보인다.
  sst: {
    name: { ko: '해수면 온도', en: 'Sea surface temperature' },
    unit: '°C', digits: 1, kind: 'sequential',
    bands: [
      [null, '#15329a'],   //       < 0     L* 26
      [0, '#1a4fc6'],      //   0 ~  4      L* 38
      [4, '#2273e0'],      //   4 ~  8      L* 49
      [8, '#3397e8'],      //   8 ~ 12      L* 60
      [12, '#30b6c4'],     //  12 ~ 16      L* 68
      [16, '#6ccb93'],     //  16 ~ 20      L* 75
      [20, '#acd867'],     //  20 ~ 24      L* 81
      [24, '#f6df48'],     //  24 ~ 28      L* 88   ← 봉우리
      [28, '#ea5f26'],     //  28 ~ 32      L* 58
      [32, '#c4153f'],     //       ≥ 32    L* 42
    ],
    isolines: { interval: 1, majorEvery: null, emphasize: [26, 29], label: 'emphasis' },
    legendNote: { ko: '굵은 선 26 °C 태풍 발달 · 29 °C 산호 백화 경계', en: 'Bold lines: 26 °C cyclone development · 29 °C coral bleaching' },
  },

  // 해수면 온도 편차 — 발산형. 가운데(−0.5 ~ 0.5)는 **중립색**이고 옅게(0.4) 칠한다: '평년 수준'도 뜻이 있는 칸이라 범례에 남긴다.
  // 바다 대부분이 이 칸이라 불투명하게 칠하면 지구가 회색으로 덮인다. 등치선은 경계 + **0 선 강조**.
  sstAnom: {
    name: { ko: '평년 대비 수온', en: 'SST anomaly' },
    unit: '°C', digits: 1, kind: 'diverging', pivot: 0, signed: true,
    bands: [
      [null, '#2b62c9'],        //        < −1.5   L* 43
      [-1.5, '#8fbdf0'],        //  −1.5 ~ −0.5    L* 75
      [-0.5, '#c6cbd2', 0.4],   //  −0.5 ~ +0.5    L* 81   ← 중립(무채색)
      [0.5, '#f0a57c'],         //  +0.5 ~ +1.5    L* 74
      [1.5, '#cf3a30'],         //        ≥ +1.5   L* 48
    ],
    isolines: { levels: 'breaks+pivot', emphasize: [0], label: 'emphasis' },
    legendNote: { ko: '굵은 선 0 = 평년과 같음', en: 'Bold line 0 = same as the climatological normal' },
  },

  // 유의파고 — 계약 경계 1·2·3·4·6·9 m. 등치선은 '같은 값'(경계를 그대로 — levels: 'breaks').
  // live-layers.js WAVE_RAMP 의 0·1·2.5·4·6·8 이 바로 '표가 여러 장'일 때 난 사고다. W6 이 그 램프를 이 표로 바꾼다.
  wave: {
    name: { ko: '유의파고', en: 'Significant wave height' },
    unit: 'm', digits: 1, kind: 'sequential',
    bands: [
      [null, '#123f9a'],   //      < 1     L* 29
      [1, '#1672de'],      //  1 ~ 2       L* 49
      [2, '#19b2d8'],      //  2 ~ 3       L* 67
      [3, '#74cf8c'],      //  3 ~ 4       L* 76
      [4, '#e6e04e'],      //  4 ~ 6       L* 87   ← 봉우리
      [6, '#ee9040'],      //  6 ~ 9       L* 68
      [9, '#d8323f'],      //      ≥ 9     L* 49
    ],
    isolines: { levels: 'breaks', emphasize: [], label: 'all' },
  },

  // 초미세먼지 — PD 6단(15·25·50·75·150). 기존 PM25_BASE 는 환경부 4등급(15·35·75)이었다 — PD 정본이 이긴다.
  pm25: {
    name: { ko: '초미세먼지 PM2.5', en: 'PM2.5' },
    unit: 'µg/m³', digits: 0, kind: 'sequential',
    bands: [
      [null, '#17ad7d'],   //        < 15    L* 63
      [15, '#ead93a'],     //   15 ~  25     L* 86   ← 봉우리
      [25, '#f4a02b'],     //   25 ~  50     L* 73
      [50, '#ea632c'],     //   50 ~  75     L* 59
      [75, '#c9163a'],     //   75 ~ 150     L* 43
      [150, '#8a0a52'],    //        ≥ 150   L* 30
    ],
    isolines: null,
  },
};

export const FIELD_SCALES = Object.freeze(Object.fromEntries(
  Object.entries(SPECS).map(([id, spec]) => [id, defineScale({ id, ...spec })]),
));
export const SCALE_IDS = Object.freeze(Object.keys(FIELD_SCALES));

// 지금 있는 레이어 id → 눈금 id. 레이어 id 는 개명하지 않는다(현상 레지스트리 규칙) — 눈금 쪽에서 맞춘다.
// uvgrid 는 PD 표에 없어 눈금이 없다.
export const SCALE_FOR_LAYER = Object.freeze({
  tempgrid: 'temp', windgrid: 'wind', presgrid: 'pressure', raingrid: 'precip',
  sstfield: 'sst', sstanom: 'sstAnom', wavefield: 'wave', pm25grid: 'pm25',
});

/** 눈금 id 또는 레이어 id → 얼린 눈금. 없으면 null(지어내지 않는다). */
export const scaleOf = (id) => FIELD_SCALES[id] || FIELD_SCALES[SCALE_FOR_LAYER[id]] || null;

/** 구간 수 = 경계 수 + 1 (칠하지 않는 칸 포함 — 팔레트 텍스처의 폭이다). */
export const bandCount = (scale) => scale.breaks.length + 1;

// 값으로 치는 것은 **유한한 숫자뿐**이다. Number('') · Number(null) · Number(true) 는 0·0·1 이 된다 — 빈 칸이 '0 °C'(어는점 칸)로
// 칠해지는 함정이다(이 저장소가 v1 날씨 시트에서 한 번 밟았다). 글자로 온 숫자도 받지 않는다 — 고쳐 읽는 일은 자료를 아는 쪽이 한다.
const isValue = (v) => typeof v === 'number' && Number.isFinite(v);

const _f32 = new WeakMap();
/**
 * 경계 배열(float32) — 셰이더 uniform 용. padTo 를 주면 그 길이까지 BREAK_PAD 로 채운다(고정 길이 uniform 배열).
 * 돌려주는 배열은 호출자의 것이다(사본).
 */
export const breaksFloat32 = (scale, padTo = 0) => {
  let base = _f32.get(scale);
  if (!base) { base = Float32Array.from(scale.breaks); _f32.set(scale, base); }
  if (padTo && padTo < base.length) throw new RangeError(`field-scales: 경계 ${base.length}개가 padTo ${padTo} 에 안 들어간다 (${scale.id})`);
  const out = new Float32Array(Math.max(padTo || 0, base.length)).fill(BREAK_PAD);
  out.set(base);
  return out;
};

/**
 * 값 → 구간 번호(0 … 경계 수). 규칙은 파일 머리의 '구간 규칙' — 아래 경계 포함 · float32 비교. 값 없음은 −1.
 */
export const bandIndex = (scale, v) => {
  if (!isValue(v)) return -1;
  let base = _f32.get(scale);
  if (!base) { base = Float32Array.from(scale.breaks); _f32.set(scale, base); }
  const x = Math.fround(v);
  let idx = 0;
  for (let i = 0; i < base.length; i += 1) if (x >= base[i]) idx += 1;   // = Σ step(break, v)
  return idx;
};

const hexRGB = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new TypeError(`field-scales: 색은 #rrggbb 로 적는다 — '${hex}'`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * 팔레트 텍스처의 바이트 — RGBA × 구간 수. 1×N DataTexture 로 올려 **NearestFilter** 로 읽는다.
 * A 는 칸의 불투명도(칠하지 않는 칸 0 · 옅은 칸 102). 셰이더는 여기에 레이어 불투명도를 곱한다.
 */
export const paletteRGBA = (scale) => {
  const n = bandCount(scale);
  if (scale.colors.length !== n) {
    throw new RangeError(`field-scales: 색 ${scale.colors.length}개 ≠ 경계 ${scale.breaks.length}개 + 1 (${scale.id})`);
  }
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const [r, g, b] = hexRGB(scale.colors[i]);
    out.set([r, g, b, Math.round(Math.min(1, Math.max(0, scale.alpha[i])) * 255)], i * 4);
  }
  return out;
};

/**
 * 등치선 명세 — 셰이더가 선을 긋고(fract(v/interval) + fwidth), contour-math 가 라벨 자리를 찾을 때 같이 읽는다.
 *   interval   고른 간격(값 단위) — 고르지 않은 눈금은 null 이고 levels 를 쓴다
 *   levels     그을 값의 목록 — 간격이 고르면 null
 *   majorEvery 굵은 선의 간격(**값 단위** — '선 몇 개마다'가 아니다. 기온은 2°C 를 골라도 5°C 를 골라도 10°C 마다 굵다)
 *   emphasize  따로 강조할 값(기압 1012 · SST 26·29 · 편차 0)
 *   label      'major'(굵은 선에만) · 'all' · 'emphasis'(강조선에만) · 'none'
 * 등치선이 없는 눈금(풍속 · PM2.5)은 **null** 이다 — 빈 명세가 아니다(풍속 등치선은 '안 그린다'가 결정이다).
 * choice 는 선택지가 있는 눈금(기온 '2' | '5')에서만 뜻이 있다. 모르는 선택은 기본값으로 간다.
 */
export const isolineSpec = (scale, choice) => {
  const iso = scale.isolines;
  if (!iso) return null;
  let pick = iso;
  let chosen = null;
  if (iso.choices) {
    chosen = Object.prototype.hasOwnProperty.call(iso.choices, String(choice)) ? String(choice) : String(iso.default);
    pick = iso.choices[chosen];
  }
  let levels = null;
  if (Array.isArray(pick.levels)) levels = [...pick.levels];
  else if (pick.levels === 'breaks') levels = [...scale.breaks];
  else if (pick.levels === 'breaks+pivot') levels = [...new Set([...scale.breaks, scale.pivot])].sort((a, b) => a - b);
  return Object.freeze({
    choice: chosen,
    choices: iso.choices ? Object.freeze(Object.keys(iso.choices)) : null,
    interval: pick.interval ?? null,
    levels: levels && Object.freeze(levels),
    majorEvery: pick.majorEvery ?? null,
    emphasize: Object.freeze([...(pick.emphasize || [])]),
    label: pick.label || 'none',
  });
};

// ── 글자 ────────────────────────────────────────────────────────────────────────────────────────────────────
const MINUS = '\u2212';   // 하이픈(-)이 아니라 빼기 기호 — 숫자 폭과 같아 tabular-nums 에서 줄이 맞는다
const altOf = (scale, unitAlt) => {
  const a = scale.altUnit;
  if (!a || !unitAlt) return null;
  return (unitAlt === true || unitAlt === a.unit) ? a : null;   // 다른 단위 이름을 주면 기본 단위로 — 없는 환산을 짓지 않는다
};
const numText = (x, digits, signed) => {
  let s = Math.abs(x).toFixed(digits);
  if (digits > 0) s = s.replace(/\.?0+$/, '');            // 범례 눈금은 '5.0' 이 아니라 '5'
  const zero = Number(s) === 0;
  if (x < 0 && !zero) return MINUS + s;
  return (signed && !zero) ? `+${s}` : s;
};

/**
 * 값 한 개 → '27.5 °C'. 눈금의 자릿수를 그대로 찍는다(기온 0.5 눈금 → 소수 한 자리). 값 없음은 '—'.
 * 편차 눈금(signed)은 부호를 붙인다('+1.2 °C'). 0 은 부호가 없다('−0.0' 을 만들지 않는다).
 */
export const formatValue = (scale, v, { unitAlt } = {}) => {
  if (!isValue(v)) return '—';
  const alt = altOf(scale, unitAlt);
  const x = v * (alt ? alt.factor : 1);
  const digits = alt ? alt.digits : scale.digits;
  const s = Math.abs(x).toFixed(digits);
  const zero = Number(s) === 0;
  const sign = (x < 0 && !zero) ? MINUS : ((scale.signed && !zero) ? '+' : '');
  return `${sign}${s} ${alt ? alt.unit : scale.unit}`;
};

const cssColor = ([r, g, b], a) => (a >= 1
  ? `rgb(${r}, ${g}, ${b})`
  : `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`);

/**
 * 범례 모델 — **칠하는 칸만**, 아래에서 위로.
 *   { index, from, to, color, rgba, label, fromText, toText }
 *   from · to 는 늘 기본 단위(경계와 비교할 수 있게). 글자(label · fromText · toText)는 고른 단위로.
 *   color 는 CSS 단색('rgb(…)' · 옅은 칸은 'rgba(…)') — 그라데이션이 아니다. rgba 는 paletteRGBA 의 그 칸과 같은 바이트다.
 *   label 은 색 없이도 읽히는 글자다('30 – 35 °C' · '≥ 35 °C' · '< −10 °C') — 색만으로 말하지 않는다.
 * unitAlt: true 또는 단위 이름('kt' · 'mm'). 그 눈금에 없는 단위면 기본 단위로 돌려준다.
 */
export const legendModel = (scale, { unitAlt } = {}) => {
  const pal = paletteRGBA(scale);
  const alt = altOf(scale, unitAlt);
  const unit = alt ? alt.unit : scale.unit;
  const f = alt ? alt.factor : 1;
  const digits = alt ? alt.digits : scale.digits;
  const txt = (x) => (x == null ? null : numText(x * f, digits, !!scale.signed));
  const out = [];
  for (let i = 0; i < bandCount(scale); i += 1) {
    const a = pal[i * 4 + 3];
    if (a === 0) continue;                                  // 칠하지 않는 칸은 범례에 없다 — 범례는 화면에 있는 색만 말한다
    const from = i === 0 ? null : scale.breaks[i - 1];
    const to = i === scale.breaks.length ? null : scale.breaks[i];
    const fromText = txt(from);
    const toText = txt(to);
    const label = from == null ? `< ${toText} ${unit}`
      : to == null ? `\u2265 ${fromText} ${unit}`
        : `${fromText} \u2013 ${toText} ${unit}`;
    out.push({
      index: i, from, to,
      color: cssColor([pal[i * 4], pal[i * 4 + 1], pal[i * 4 + 2]], a / 255),
      rgba: [pal[i * 4], pal[i * 4 + 1], pal[i * 4 + 2], a],
      label, fromText, toText, unit,
    });
  }
  return out;
};

/** 값 → 그 값이 칠해지는 CSS 색. 값 없음 · 칠하지 않는 칸은 null. (Inspector 값 카드의 색 점 등) */
export const bandColor = (scale, v) => {
  const i = bandIndex(scale, v);
  if (i < 0) return null;
  const hit = legendModel(scale).find((b) => b.index === i);
  return hit ? hit.color : null;
};

/**
 * 표가 스스로와 어긋나지 않는지 — 문제 글의 배열(없으면 빈 배열). 앱을 죽이지 않으려고 import 때 던지지 않고 시험이 부른다.
 *   · 경계는 오름차순 · 색은 #rrggbb · 불투명도 0~1
 *   · 등치선 간격이 있으면 **모든 색 경계가 그 간격의 배수**여야 한다 — 아니면 색 경계와 등치선이 어긋난다(지시서 W1-6).
 *   · 발산형은 pivot 이 가운데 칸 안에 있고 칸 수가 홀수다.
 */
export const validateScale = (scale) => {
  const bad = [];
  const b = scale.breaks;
  if (!b.length) bad.push('경계가 없다');
  for (let i = 1; i < b.length; i += 1) if (!(b[i] > b[i - 1])) bad.push(`경계가 오름차순이 아니다: ${b[i - 1]} → ${b[i]}`);
  if (scale.bands[0][0] !== null) bad.push('첫 줄의 아래 경계는 null(열린 끝)이어야 한다');
  scale.colors.forEach((c) => { if (!/^#[0-9a-f]{6}$/i.test(c)) bad.push(`색 형식: ${c}`); });
  scale.alpha.forEach((a) => { if (!(a >= 0 && a <= 1)) bad.push(`불투명도 범위: ${a}`); });
  const iso = scale.isolines;
  const intervals = !iso ? [] : iso.choices ? [iso.choices[iso.default]?.interval] : [iso.interval];
  for (const iv of intervals) {
    if (iv == null) continue;
    for (const x of b) {
      const q = x / iv;
      if (Math.abs(q - Math.round(q)) > 1e-9) bad.push(`경계 ${x} 이 등치선 간격 ${iv} 의 배수가 아니다 — 색 경계와 등치선이 어긋난다`);
    }
  }
  if (iso && iso.choices && !iso.choices[iso.default]) bad.push(`등치선 기본 선택 '${iso.default}' 이 선택지에 없다`);
  if (scale.kind === 'diverging') {
    const n = bandCount(scale);
    const mid = (n - 1) / 2;
    if (n % 2 !== 1) bad.push('발산형인데 칸 수가 짝수다 — 가운데 중립 칸이 없다');
    else if (bandIndex(scale, scale.pivot) !== mid) bad.push(`pivot ${scale.pivot} 이 가운데 칸에 있지 않다`);
  }
  return bad;
};
