export const meta = {
  name: 'v2-paid-ux-redteam-missing',
  description: '단계 사이 절단으로 반박 검증을 못 받은 11현상만 다시 검증한다 (읽기 전용)',
  phases: [{ title: 'RedTeam', detail: '잘리지 않은 개선안으로 3묶음 재검증' }],
}

const BASE = `
저장소: D:\\## APP\\EARTHUS v2_APP (Windows, Git Bash·Grep·Read·Glob).
⚠️ **읽기 전용이다.** 파일 수정·커밋·배포·번들 빌드 금지.
⚠️ v2 화면 정본은 prototype/v2-three/ (prototype/v2-deploy/ 는 생성물). v1 은 prototype/js/.
   메뉴→현상→레이어 연결: prototype/v2-three/js/phenomenon-registry.js (PHENOMENA·LAYER_PHENOMENON·MENU_GROUPS).
   레이어 렌더: prototype/v2-three/js/live-layers.js (fetchFor/buildFromData/build*/meta*), main.js 의 case 'scene/layer' 분기.
⚠️ 추측 금지 — 코드를 열어 보고 파일:줄로 적는다. 모르면 UNKNOWN.

배경: PD(제품 책임자)가 "이 상태로는 유료 구독을 받을 수 없다, v2 존재 의미가 없다"고 판정했다.
PD 가 싫어하는 것: **막대기 기호**, **뭉개진 그라데이션**. PD 가 원하는 것: 값의 차이가 **극적으로** 보이는 표현
(기온은 선이나 레벨별 색), 바람은 **흐르는 입자 선**. 기준은 mapped.earth 와 windy.com 이다.
`

const REF = `
── 기준 사이트 실측 (2026-09-20, 본 세션이 직접 열어 확인) ──
[mapped.earth/earth]
 · 메뉴 구조: AIR(Wind animation[고도 Sfc/850/500/250] · Wind · Temp · MSLP · TPW · CAPE · PM2.5 · Aerosol · Dust · SO₂ · CO)
   / OCEAN(Currents[animated] · SST · SST HD · SSTA · Waves · Wave period · Bleaching) / LAND(Fires · Population[밀도만큼 땅이 솟음]) / SKY(Aurora)
 · **입자 애니메이션(토글)과 색면 오버레이(라디오 하나)가 분리**돼 있다 — 기온 색면 위로도 바람 입자가 계속 흐른다.
 · 항목마다 쉬운 말 한 줄 설명("how hard the surface wind is blowing", "fuel available for thunderstorms").
 · 메뉴 아래 **범례 막대 상시**(0 m/s — Wind — 30 m/s · -40°C — Temp — 45°C).
 · 상단 **모델 전환 GFS/ECMWF + 자료 시각 "GFS 18Z · 5 h ago"** 상시. 시간 스테퍼(‹ UTC·local ›, Now), "Time machine — monthly climate back to 1940".
 · 입자는 속도로 색이 입혀진 혜성 꼬리 모양, 전지구(바다 포함)를 흐른다. 색면은 GFS 0.25° 급 고해상 — 전선·산맥이 읽힌다.
 · 부가 토글: wind by temp(입자를 기온 색으로) · borders · rivers · population · NO₂ · rainfall · spinning. 하단에 출처 크레딧(NOAA GFS public domain 등).
[windy.com]
 · 메뉴: 썸네일 타일(날씨 레이더·위성·바람·비/번개·기온·태풍 추적기[“4 active” 배지]·구름·파도·누적 강수량 + 48개 더) + 분류 칩(모두/바람/기온/비,눈/구름,항공/파도,바다/대기질/가뭄/경고).
 · "지도에 표시": **입자 애니메이션 토글 · 등치선 토글 + 종류 선택(기압/지오포텐셜/기온/결빙 고도)** · 고도 슬라이더.
 · 지도 위 **도시마다 값 숫자**(서울 21° 등)가 직접 찍힌다. 맨 위에 **내 장소 예보 띠**(현재 20°, 4일 최고/최저).
 · 태풍은 풍속 색면에서 **과녁 모양으로 즉시 읽힌다**(보라-빨강 동심원).
 · **타임라인 상시**(재생 ▶, 15일, 3시간 간격, 시각 말풍선), **단위 있는 범례 상시**(kt 0 5 10 20 30 40 60).
 · 예보 모델 선택(ECMWF 9km / GFS 22km / ICON 13km / MSM 5km) + "예보 업데이트됨 2시간 44분 전 (ref 12Z)" + 다음 갱신 예정 시각.
 · POI 오버레이: 기상 관측소·보고된 바람/온도·공항·웹캠·패러글라이딩/서핑 지점·조석·화재·대기질 관측소·라디오존데.
 · 유료 경계: "Premium으로 전환"(더 잦은 갱신·1시간 간격 등) — 기본 그림은 무료로도 완성돼 보인다.
`

const KNOWN = `
── 이미 이번 세션에서 실측으로 확정된 사실 (다시 조사하지 말고 전제로 써라) ──
1. 바람(weather/wind): buildWind(live-layers.js:2130~) — 관측소 3,000곳마다 선분(19~89km) + 자기 선분 위만 왕복하는 입자 2개. 이류·유선 0건.
   v2 는 처음(70366d4e, 09-02)부터 이랬다. 재료: prototype/js/earthus2/v02/visual/flow.js 에 sampleVectorGrid·advectNormalized·flowRenderBudget(데스크톱 18,000/모바일 5,000) 이미 있음(v2 미사용).
   u/v 격자는 wind/global.json 으로 이미 받는다(buildWindGrid 가 방향을 버림). v1 windfield.js 는 Cesium 2D 캔버스라 알고리즘만 이식 가능.
2. 기온(weather/tempgrid) 등 buildField 9종(tempgrid·raingrid·presgrid·windgrid·pm25grid·uvgrid·sstfield·wavefield·sstanom):
   5° 격자(72×36 텍셀) + rampFrom 선형 보간 + LinearFilter = 이중 뭉갬. 등치선 코드 v2 에 0줄. 범례도 v2 에 없음.
   계약: docs/earthus-v23/CONTINUOUS_LAYERS.md §2 — 기온 단계색 + 등치선 -25,-10,0,10,20,30,40°C. v1 은 지금도 지킴(gridoverlay.js stepped, continuous-contours.js).
   이식 가능: prototype/js/contour-math.js(마칭 스퀘어)+gridmath.js 는 Cesium 무의존, 격자 형식 동일.
   ⚠️ 풍속에는 등치선 금지(v1 이 09-08 제거: 5° 격자 등치선은 격자 모양 다각형이 된다).
3. 바다 색면 3종(wavefield·sstfield·sstanom)이 **반지름 1.0012 고정 구 껍질**이라 과장 50× 에서 해발 153m 이하 육지를 덮는다
   (확대하면 764m→1,529m 까지). 5° 한 칸이 555km 를 칠하고 LinearFilter 가 278km 더 번진다. = PD 가 본 '육지가 잠김'은 버그.
4. 해수면 상승 전망(ocean/slr): buildSlr(live-layers.js:1841~) — AR6 조위관측소 1,016곳에 2100년 SSP5-8.5 값으로 LineSegments 기둥 + 점.
   khoasl* 4종은 점 구름. '물이 육지를 덮는' 설계된 그림은 khoaflood(국립해양조사원 침수 폴리곤) 하나뿐인데 '재해' 묶음에 있고 시군구를 눌러야 받는다.
   sim-questions.js 에 "해수면이 오르면 어디가 잠길까?" 가 NOT_AVAILABLE 로 선언돼 있다.
5. **자료 해상도가 근본 제약이다**: wind/global.json 은 Open-Meteo 5° 격자(aws/wind-grid). 동아시아 1° 보강판 wind/wind-ea.json 이 v1 에 쓰인다.
   GFS 파이프라인이 따로 있다(clouds/gfs-fc — 0.5° 구름 예보 프레임, 4° 바람 텍스처가 구름 이류에만 쓰임). NOAA GFS 는 public domain.
   ⚠️ Open-Meteo 는 비상업 조항 위반 위험이 감사로 확인됨(docs/R0-OPEN-METEO-AUDIT-2026-09-20.md) — 유료 상품의 핵심 그림을 Open-Meteo 위에 세우면 안 된다.
6. EARTHUS 정직성 규칙: 없는 값을 만들지 않는다 · 관측과 예보(모델)를 섞지 않고 배지로 구분한다 · 5° 격자값을 도시값처럼 말하지 않는다 ·
   인과·확률을 지어내지 않는다 · 자료 시각과 출처를 항상 말한다. 개선안은 이 규칙 안에서 '극적으로' 보여야 한다.
7. 요금: FREE / EXPLORER(리포트) / PRO(시뮬레이션). 지금은 FREE_OPEN(전부 열림). 기본 그림은 무료에서도 완성돼 보여야 하고, 유료는 깊이(시간축·비교·보고서·시뮬)로 판다.
`

const BEFORE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phenomenonId: { type: 'string' },
          menuName: { type: 'string' },
          layers: { type: 'string', description: '켜지는 레이어 id 들' },
          drawsNow: { type: 'string', description: '지금 화면에 그려지는 것 — 기하 종류(점/선분/색면/폴리곤/아이콘/DOM)와 함수 파일:줄' },
          data: { type: 'string', description: '자료 출처·해상도·갱신 주기·관측/모델 여부' },
          hasLegend: { type: 'boolean' },
          hasTime: { type: 'boolean', description: '시간축(과거/예보 재생)이 이 레이어에 연결돼 있나' },
          subscriberView: { type: 'string', description: '돈 내는 사람 눈에 이게 어떻게 보이는가 — 한두 문장, 과장 없이' },
          problems: { type: 'array', items: { type: 'string' } },
          grade: { type: 'string', enum: ['A_GOOD', 'B_OK', 'C_WEAK', 'D_BROKEN'], description: '유료 관점 등급' },
        },
        required: ['phenomenonId', 'menuName', 'drawsNow', 'data', 'subscriberView', 'problems', 'grade'],
      },
    },
  },
  required: ['items'],
}

const AFTER_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phenomenonId: { type: 'string' },
          menuName: { type: 'string' },
          before: { type: 'string', description: '지금 (한 문장)' },
          reference: { type: 'string', description: 'mapped.earth·windy 는 같은 것을 어떻게 보여주나 (없으면 "기준 사이트에 없음 — EARTHUS 고유")' },
          after: { type: 'string', description: '바꾼 뒤 화면 — 표현 종류·색 규칙·범례·지도 위 숫자·시간축·선택 시 패널까지 구체적으로' },
          renderType: { type: 'string', description: '입자장 | 단계색+등치선 | 고해상 색면 | 폴리곤 면 | 아이콘/마커 | 3D 기둥 | DOM 카드 | 유지' },
          dataNeed: { type: 'string', description: '지금 자료로 되나? 안 되면 어떤 자료·해상도가 필요한가(출처·라이선스)' },
          reuse: { type: 'string', description: '재사용할 기존 코드 파일' },
          paidHook: { type: 'string', description: '무료에서 보이는 것 / 유료(EXPLORER·PRO)에서 더해지는 것' },
          size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          action: { type: 'string', enum: ['REBUILD', 'IMPROVE', 'KEEP', 'MERGE', 'MOVE', 'REMOVE'], description: '메뉴 자체의 처분' },
        },
        required: ['phenomenonId', 'menuName', 'before', 'reference', 'after', 'renderType', 'dataNeed', 'paidHook', 'size', 'priority', 'action'],
      },
    },
    groupNotes: { type: 'string', description: '묶음 차원의 제안 — 이름·순서·합치기' },
  },
  required: ['items', 'groupNotes'],
}

const RED_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phenomenonId: { type: 'string' },
          menuName: { type: 'string' },
          before: { type: 'string' },
          reference: { type: 'string' },
          after: { type: 'string', description: '반박을 반영해 고친 최종 After' },
          renderType: { type: 'string' },
          dataNeed: { type: 'string' },
          reuse: { type: 'string' },
          paidHook: { type: 'string' },
          size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
          priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          action: { type: 'string', enum: ['REBUILD', 'IMPROVE', 'KEEP', 'MERGE', 'MOVE', 'REMOVE'] },
          blockers: { type: 'array', items: { type: 'string' }, description: '자료·라이선스·정직성·성능상 걸리는 것과 그 해법' },
          acceptance: { type: 'array', items: { type: 'string' }, description: '완료 판정 기준 — 화면에서 확인 가능한 문장' },
        },
        required: ['phenomenonId', 'menuName', 'before', 'after', 'renderType', 'dataNeed', 'size', 'priority', 'action', 'blockers', 'acceptance'],
      },
    },
    groupNotes: { type: 'string' },
    corrections: { type: 'array', items: { type: 'string' }, description: '2단계 안에서 뒤집거나 낮춘 것과 이유' },
  },
  required: ['items', 'groupNotes', 'corrections'],
}

// PD 가 2026-09-20 에 준 정본 — "EARTHUS V2 유료 사용자 중심 UX 전면개편 보고서"(docx, 콘셉트 이미지 14장).
// PD: "이 문서의 이미지처럼 지구가 메뉴별로 표현돼야 한다. 이게 맞아." → After 는 이 문서에 맞춘다.
const PD_SPEC = `
══ PD 정본: EARTHUS V2 유료 UX 전면개편 보고서 (2026-09-20) — After 설계는 **이 문서가 목표**다 ══
[절대 규칙 8]
 1 현상 우선: Temperature·Wind·Rain·Clouds·Ocean·Hazards·Air Quality·Space·Terrain 을 1급 현상 메뉴(좌측 레일 9개)로.
 2 단일 Global Timeline: 시간축은 화면 전체에 **하나**. 메뉴마다 새 슬라이더 금지.
 3 Data 와 View 분리: 지형 과장·태양각·위성 색 혼합·음영 같은 렌더링 조작은 View > Appearance 로. 데이터 패널에 두지 않는다.
 4 Stepped visualization: 온도·강수·대기질·해양 편차·위험도는 **연속 그라데이션 단독 금지**. 구간형 색 + contour + 숫자 라벨.
 5 Inspector: 선택한 위치·이벤트·관측소의 정확값·단위·시간·출처·모델을 **우측 하나의 Inspector** 에서.
 6 Compare first-class: 모델 비교는 설정이 아니라 독립 작업(split globe / draggable wipe / diff, 카메라·시간·고도·legend 동기화).
 7 Intelligence is evidence-first: AI 문장보다 원수치·출처·시간·계산근거가 먼저.
 8 Simulation is a workspace: 일반 레이어 메뉴에 섞지 않고 별도 공간(Current → Baseline → Scenario → Result, 슬라이더 대신 시나리오 칩).
[셸] LEFT RAIL 현상 / CENTER 3D Earth + data field + 선택적 isolines·particles / RIGHT Inspector(Value·Unit·Source·Obs time·Model·Compare·Intelligence)
     / BOTTOM 타임라인 하나 / TOP Search·Share·View·Compare·Intelligence·Simulation·Account.
[콘셉트 이미지에서 읽은 목표 화면 — 범례 값까지]
 01 Temperature: 5°C 구간색 10단(<-10 · -10~-5 · -5~0 · 0~5 · 5~10 · 10~15 · 15~20 · 20~25 · 25~30 · 30~35 · ≥35) + **흰 등온선과 지구 위 숫자 라벨(20°C·30°C·-10°C)**.
    Inspector: Surface(2m)/850hPa 선택 · Isotherm 토글 + 간격(2°C/5°C) · Model(GFS) · Time. Actual/Anomaly 전환.
 02 Wind: **유선/입자 애니메이션 + 속도 구간색**(m/s <1 · 1~5 · 5~10 · 10~20 · 20~30 · 30~40 · 40~50 · ≥50), 저기압 소용돌이가 읽힌다.
    Inspector: 고도(10m/850hPa…) · Particles 토글(강도는 3단 프리셋, 슬라이더 금지) · Pressure(hPa) 등압선 토글 · Model(ECMWF) · Time. legend m/s·kt 동시.
 03 Rain: mm/h 구간색(0.1~0.5 · 0.5~1 · 1~2 · 2~5 · 5~10 · 10~20 · 20~50 · ≥50) + 강한 코어 contour. 칩: 현재 강우 / 1·3·24h 누적 / 눈·비 타입 / 레이더·모델. 누적이면 legend 단위 자동 변경.
 04 Clouds: Observation/Forecast 를 먼저 구분 · Satellite 는 별도 quick mode · 칩(구름량/운정고/저·중·고층) · 불투명도·입체감은 View 로.
 05 Ocean: SST | SSTA 탭 · Currents 입자/유선 기본 ON · Contour(1°C) 토글. SST 구간(<0 · 0~4 · 4~8 · 8~12 · 12~16 · 16~20 · 20~24 · 24~28 · 28~32 · ≥32°C). Waves 는 방향+높이 glyph, 파고·너울 별도 수치.
 06 Hazards: Event-first. 태풍 = Track · Forecast Cone · Wind Area 토글, Model(JTWC 등), Category 5~1 / TS / TD 범례. 지진 = 진앙·규모·깊이 동시. 산불 = hot spot 과 perimeter 구분.
    공식 발표 시각·기관명 상시. **안전 정보는 구독과 무관하게 무료.** severity band 우선.
 07 Air Quality: PM2.5/PM10/O3/NO2 칩 1탭 전환 · 오염물질별 threshold band(PM2.5 µg/m³: 0~15 · 15~25 · 25~50 · 50~75 · 75~150 · ≥150) · Show Stations 토글 · Model(CAMS). 관측소와 모델 field 를 혼동시키지 않는다.
 08 Space: Aurora probability 구간(0~20 … ≥80%) + Kp index 동시 · Satellites/Show Orbits 토글 · 위성 선택 시 orbit·altitude·speed·next pass.
 09 Terrain: Elevation/Contours(100/250/500/1000m 프리셋)/Hillshade/Satellite 데이터 모드만. exaggeration·sun angle·satellite blend 는 View > Appearance.
 10 Compare: split globe(GFS | ECMWF) 또는 wipe · Model A/B · Variable · Level(850hPa) · Time(+24h) · 공통/모델별 scale 선택 · difference mode · run 시각·해상도 표시 · URL 공유. **Pro 핵심 가치.**
 11 Intelligence: 위치 선택 → Current(28.4°C) → vs Normal(+2.3°C) → Data Source(KMA Observation · 시각) → 그 **아래에** AI 문장 → View Details. 탭 Now/Forecast/Climatology/Analysis. **Explorer 핵심 가치.**
 12 Simulation: 별도 작업 공간. 시나리오 칩(Current / +2°C / +4°C) · Variable · Season · Model(CMIP6) · 결과는 absolute 와 delta 동시 · 진입 전 현재 상태 스냅샷 저장. **Pro.**
[요금] 무료: 현상 선택 → 현재 시각화 → 기본 위치값 / EXPLORER: 정확값 → source·time → anomaly → 짧은 intelligence report / PRO: compare → multi-model → intelligence → simulation → export.
      "잠금 아이콘이 많다"가 아니라 **분석 깊이와 시간 절약**에서 가치가 느껴져야 한다.
[우선순위] P0: Global Shell 재배치·Single Timeline·Right Inspector·Data/View 분리 · Temperature renderer(기준 구현체) · Wind renderer · Rain renderer
          P1: Ocean/Hazards/Air Quality/Clouds 에 공통 renderer contract · Compare workspace · Intelligence inspector
          P2: Simulation workspace·export · presets·saved views·alerts·history.
[금지] 메뉴마다 새 slider bar · 연속 그라데이션 단독 · 데이터와 렌더 튜닝 한 패널 · AI 설명을 데이터보다 앞에 · 모델 비교를 settings 에 숨김 · 유료를 잠금 아이콘만으로 표현.
[DoD] 1탭 진입 · 10초 안에 "어디가 얼마나 다른가" · 모든 수치에 source+timestamp+model/observation 구분 · 지도 클릭 한 번으로 정확값 · 1440p 에서 레이어 전환 시 UI reflow·반복 slider 생성 없음.
⚠️ 이 문서의 좌측 레일에는 **생태·사람·여행(20현상)과 일부 해양·관측 현상의 자리가 없다.** 자리가 없는 현상은 억지로 끼우지 말고
   action 을 MOVE/MERGE/REMOVE 중 하나로 제안하되, **"PD 결정 필요"** 라고 명시한다(예: v1 로 보냄 / 'Life' 보조 서랍 / 삭제).
⚠️ 콘셉트의 Intelligence 예문("…due to a persistent high-pressure system", "likely to continue")은 EARTHUS 계약 §C-2(인과·확률 금지)와 충돌한다.
   **배치(수치→출처→문장)는 그대로 따르되 문장 내용은 계약을 따른다** — '함께 나타난 조건'과 기관 예보 인용으로.
`

const BATCHES = [{"key": "atmosphere2", "name": "대기(바람·기압·상층 수증기)", "items": [{"phenomenonId": "weather.wind", "menuName": "바람", "before": "관측소 약 3,000곳마다 선분(19~89km)을 그리고, 입자 2개가 자기 선분 위만 왕복한다. 이류·유선은 0건이다(buildWind live-layers.js:2130~). 격자(windgrid)는 u/v의 방향을 버리고 속력만 5° 선형 색면으로 그린다(buildWindGrid :1154-1166, SPD_RAMP :2979-2982). PD가 싫어하는 '막대기' 그 자체다.", "reference": "mapped.earth: 'Wind animation' 입자 토글이 색면 라디오와 분리돼 있다. 고도는 Sfc/850/500/250이다. 속도로 색이 입혀진 혜성 꼬리 입자가 전지구(바다 포함)를 흐르고, 범례 '0 m/s — Wind — 30 m/s'가 상시다. GFS/ECMWF 전환과 자료 시각도 표기한다. windy: 입자 애니메이션 토글, 풍속 색면(태풍이 보라-빨강 동심원 과녁으로 즉시 읽힌다), 등치선 토글(기압), 고도 슬라이더, kt 범례 0·5·10·20·30·40·60, 타임라인 상시, POI '보고된 바람'.", "after": "[→ 02 Wind]\n\n① 입자장(토글, 기본 ON)\n- 전지구 u/v 격자를 따라 입자가 이류한다. 혜성 꼬리(트레일 페이드) 모양이다.\n- 이동 속도와 꼬리 길이는 풍속에 비례한다.\n- 색면이 켜져 있으면 입자는 흰색이고, 색면이 꺼져 있으면 입자가 속도 구간색을 입는다.\n- 강도는 3단 프리셋 칩이다([약 6,000][중 12,000][강 18,000]). 모바일 상한은 5,000이다(flow.js flowRenderBudget). 슬라이더는 없다.\n- 수명 4~8초 뒤 재배치한다. 뒤쪽 반구는 컬링한다. 줌에 따라 시드 영역과 속도를 정규화한다.\n- 등치선 금지, stepped, 밀도, 줌 정규화 네 가지 중 하나만 빠져도 다시 구려진다(v1 교훈).\n\n② 풍속 색면(라디오)\n- 01·03 색면과 상호배타이고 입자와는 독립이다.\n- PD m/s 구간 8칸이다(<1 · 1~5 · 5~10 · 10~20 · 20~30 · 30~40 · 40~50 · ≥50).\n- 값을 보간한 뒤 셰이더에서 구간화한다(precip-field.js 방식. buildField는 폐기).\n- 등풍속선은 그리지 않는다. v1이 09-08에 제거했고, 색 경계가 그 역할을 한다.\n- 0.5°에서는 태풍의 20~30 / 30~40 / 40~50 칸이 동심 과녁으로 읽힌다.\n\n③ 범례 상시\n- m/s와 kt 두 줄을 동시에 표기한다(0·1·5·10·20·30·40·50 m/s = 0·2·10·19·39·58·78·97 kt).\n- 'MODEL · GFS run/valid'를 붙인다.\n\n④ Inspector\n- 칩: Level [10m][850][500][250hPa] · Particles 토글+3단 · Pressure(hPa) 등압선 토글(기압 항목 참조) · Model · Time.\n- 클릭 1회로 그 점의 풍속·풍향(16방위+도)을 '0.5° 모델값' 고지와 함께 보여 준다. 최근접 관측소 실측도 같이 보여 준다.\n\n⑤ 관측소 3,000곳\n- 막대는 폐기한다.\n- 'Show Stations' 토글(기본 OFF)로 바꾼다. 확대 시 숫자와 작은 화살촉 마커가 'OBS' 배지와 함께 나온다.\n- 모델 입자와 절대 섞지 않는다.\n- 관측 공백(중국·몽골·러시아)은 비워 둔다.\n\n⑥ 시간\n- Global Timeline 하나만 쓴다.\n- 프레임 사이 u/v는 선형 보간하고 '보간'이라고 고지한다.\n\n⑦ 공유\n- 입자 토글은 01 Temperature·03 Rain 위에서도 유지된다(mapped.earth 방식).", "renderType": "입자장", "dataNeed": "지금 자료(wind/global.json, Open-Meteo 5°)로는 불가다.\n- 입자는 흐르겠지만 저기압 소용돌이와 태풍이 격자 사이로 빠진다. aws/pressure-grid 주석의 실측으로 5° 전지구 최대 풍속이 23.8m/s였고 30m/s 이상은 0칸이었다.\n- 유료 핵심 그림이 비상업 조항 위에 서게 된다.\n\n해법은 aws/gfs-cloud-forecast를 확장하는 것이다.\n- var_UGRD/VGRD는 이미 요청 중이다(:100). 레벨 lev_10_m_above_ground(+850/500/250_mb)만 추가한다.\n- 출력은 uv{step}.png 0.5°이고 R=u, G=v다. 기존 wind_png 인코딩((m/s+64)/128×255, 0.5m/s 양자화)을 재사용한다.\n- ⚠️ ±64m/s 한계가 있다. 250hPa 제트는 이를 넘으므로 상층은 ±128 범위로 넓힌다.\n- 프레임당 전송량은 UNKNOWN이다(실측 필요). 입자용 1° / 색면용 0.5° 분리 여부는 실측 뒤에 정한다.\n- 기존 4° 700hPa w{step}.png는 구름 이류 전용으로 그대로 둔다.\n\n태풍 눈벽(약 50km)\n- 0.5°로는 폭풍역까지만 담긴다.\n- 서태평양 창 0.25°는 filter_gfs_0p25.pl(aws/tpw-grid가 사용 중)로 P1 후속에 넣는다.\n\n과도기\n- wind/wind-ea.json(1° 동아시아)은 Open-Meteo 기반이라 과도기용으로만 쓴다.\n- NOAA GFS는 public domain이다.", "paidHook": "무료:\n- 10m 입자+풍속 구간색+범례(m/s·kt).\n- +24h.\n- 클릭 기본값.\n\nEXPLORER:\n- +120h.\n- 정확값과 실측 대조.\n- 내 위치 풍속 시계열.\n- 강풍 알림과 짧은 리포트.\n- 상층 고도(850/500/250hPa) — 등급은 제안이다.\n\nPRO:\n- GFS|ECMWF 바람 비교·diff.\n- 태풍 주변 0.25° 창.\n- export.", "size": "L", "priority": "P0", "action": "REBUILD", "reuse": "prototype/js/earthus2/v02/visual/flow.js(sampleVectorGrid·advectNormalized·flowRenderBudget) · prototype/js/windfield.js(이류·꼬리·줌 정규화 알고리즘만) · prototype/v2-three/js/precip-field.js(구간화 셰이더·프레임 blend) · prototype/v2-three/js/main.js:1811-1835(w{step}.png 로더), 4897-4898, 5454-5474(단일 시계) · prototype/v2-three/js/live-layers.js:2130~(관측소 자료 로딩부만) · aws/gfs-cloud-forecast/handler.py(wind_png :293-320)"}, {"phenomenonId": "weather.pressure", "menuName": "기압", "before": "presgrid = buildField(data,'mslp',PRES_RAMP,airShell())다(live-layers.js:583, PRES_RAMP :2974-2977). 5° 선형 색면 한 장이고 등압선과 고·저기압 표식이 0개다. 등압선용 1° 동아시아판(wind/pressure-ea.json)은 서버에 있으나 v2가 읽지 않는다(phenomenon-registry.js:735).", "reference": "mapped.earth: AIR › MSLP 색면 라디오(GFS 고해상). windy: '지도에 표시 › 등치선' 토글과 종류 '기압'. 바람 입자·색면 위에 흰 등압선이 겹친다. 기압은 독립 메뉴가 아니라 어느 레이어 위에나 얹는 선이다. PD 정본 02 Wind의 Inspector에도 'Pressure(hPa) 등압선 토글'로 들어가 있다.", "after": "[→ 02 Wind의 'Pressure (hPa)' 등압선 토글 · 10 Compare의 대표 변수] 독립 색면 메뉴를 폐지한다. 선이 곧 그림이다.\n\n① 등압선\n- 흰 등압선을 4hPa 간격으로 긋는다. 기상청 지상일기도 간격이다(v1 isobars.js STEP=4).\n- 20hPa마다(1000·1020…) 굵은 선을 긋는다.\n- 선 위에 숫자 라벨('1008')을 단다.\n\n② 고·저기압 중심\n- 'H 1026' / 'L 992' 글자를 찍는다.\n- 이웃 2칸 극값으로 찾는다(isobars.js extrema HL_RADIUS=2).\n- 고기압은 주황, 저기압은 파랑이다.\n\n③ 겹치기\n- 입자와 겹치면 '선이 촘촘한 곳 = 바람 센 곳'이 한눈에 읽힌다.\n- 01 Temperature·03 Rain 위에도 같은 토글로 겹친다(windy 방식).\n\n④ 전지구 뷰에서의 솎음\n- 고도 약 12,000km 이상에서는 8hPa 간격으로 솎아 실뭉치를 막는다(isobars.js SHOW_MAX_M의 교훈).\n\n⑤ 계산\n- 선은 자료 스텝이 바뀔 때만 다시 만든다. 렌더마다 만들지 않는다(isobars.js:16-17).\n- 0.5° 원값은 잔물결이 생긴다. 1° 평균으로 평활한 뒤 contour하고 '1° 평활'이라고 표기한다.\n\n⑥ 범례\n- '등압선 4 hPa · MODEL GFS run/valid'를 표기한다.\n\n⑦ 시간\n- Global Timeline을 따른다.\n\n⚠️ 5° 격자로는 등압선을 그리지 않는다(aws/pressure-grid 주석: 없는 정밀도를 있는 척하는 것). GFS 해면기압이 들어오기 전에는 동아시아 1° 창에서만 토글이 활성이다.", "renderType": "단계색+등치선", "dataNeed": "전지구는 지금 자료(5°)로 불가다.\n- 해법은 aws/gfs-cloud-forecast 요청에 var_PRMSL과 lev_mean_sea_level을 추가하는 것이다. 0.5° 전지구 41스텝이 나오고 새 Lambda는 0개다. NOAA GFS는 public domain이다.\n- 과도기에는 wind/pressure-ea.json(1° 동아시아, aws/pressure-grid, 1시간 주기 — aws/schedules.sh:38)으로 동아시아만 즉시 가능하다. 단 Open-Meteo 기반(비상업 조항 위험)이라 GFS가 들어오면 교체한다.\n- Compare 짝은 ECMWF 오픈데이터 msl(CC-BY-4.0)이다. aws/ecmwf-ingest의 Range 수신 방식을 재사용한다(ecCodes 필요, deploy-ecmwf.sh).", "paidHook": "무료:\n- 등압선과 H/L 표식(02 Wind의 기본 그림 일부).\n\nEXPLORER:\n- +120h 기압 배치 재생.\n- 내 위치 기압 시계열.\n\nPRO:\n- GFS|ECMWF 해면기압 split/wipe/diff. 모델 간 저기압 위치 차이가 가장 극적으로 보이는 Compare의 간판 변수다.\n- export.", "size": "M", "priority": "P1", "action": "MERGE", "reuse": "prototype/js/isobars.js(4hPa·extrema·라벨) · prototype/js/contour-math.js(contourSegments·stitchSegments·contourPathMidpoint) · prototype/js/gridmath.js · prototype/v2-three/js/live-layers.js:1169-1172(airShell) · prototype/v2-three/js/main.js:4897-4898, 5454-5474 · aws/gfs-cloud-forecast/handler.py · aws/pressure-grid/handler.py · aws/ecmwf-ingest/handler.py"}, {"phenomenonId": "weather.upper_moisture", "menuName": "상층 수증기", "before": "setCloud('gk2a:wv063')(main.js:4428, 라벨 1506)로 그린다. 천리안 6.3µm 영상을 구름과 같은 껍질에 흰 밝기 알파로 그리고 구름을 대체한다. 동아시아 원반만 나오고 범례가 없다. 질문은 '상층 대기의 흐름은'인데 흐름(바람)은 그리지 않는다.", "reference": "mapped.earth: AIR › TPW. 공기 기둥의 수증기 총량을 전지구 모델 색면으로 보여 주고 쉬운 말 한 줄 설명이 붙는다. 6.3µm 위성 수증기 영상은 두 기준 사이트에서 확인되지 않았다(windy '위성' 타일의 채널 구성은 미확인 — UNKNOWN). EARTHUS에서 mapped.earth의 TPW에 대응하는 것은 천리안 영상이 아니라 v2가 안 쓰고 있는 aws/tpw-grid다.", "after": "[→ 04 Clouds › Satellite quick mode의 '수증기 6.3µm' 채널 칩] 독립 메뉴 줄을 없앤다.\n\n① 위성 채널 칩\n- 전용 2색 단계를 쓴다(건조=갈색·주황, 습윤=흰색~청록. 구간화는 셰이더). 흰 구름과 구분된다.\n- 구름 위에 겹친다(비배타).\n- 'OBS · GK2A 6.3µm · 10분 · 동아시아 원반'을 표기한다.\n\n② '제트기류가 보입니다' 같은 단정·인과 문구를 고친다.\n- '건조한 띠(어두운 띠)와 습한 띠의 배치'로 바꾼다.\n- 02 Wind에 250hPa 입자가 들어오면 같이 켜서 '상층 흐름' 질문에 실제 바람으로 답한다.\n\n③ 가강수량(TPW)은 [→ 자리 없음 · PD 결정 필요]다. PD 정본 12메뉴에 자리가 없다.\n- 권고는 03 Rain Inspector의 보조 칩 '수증기량(TPW)'이다.\n- 10mm 구간 단계색(10·20·30·40·50·60·70mm)과 등치선을 쓴다. 레벨은 v1 continuous-contours.js:35와 동일하다.\n- 'MODEL_ANALYSIS · GFS' 배지를 단다.\n- 높은 TPW만으로 비가 온다고 말하지 않는다(tpw-grid 주석의 규칙).\n- 태풍·장마 때 수증기 공급 띠가 극적으로 보이는 그림이라 유료 Rain의 깊이로 쓸 만하다.\n\n④ 시간\n- WV 칩은 '지금'만 있다.\n- TPW는 Global Timeline을 따른다.", "renderType": "고해상 색면", "dataNeed": "WV 칩은 지금 자료로 된다(gk2a-clouds wv063, FD).\n- TPW는 aws/tpw-grid가 이미 1시간마다 돈다(aws/schedules.sh:40). NOAA GFS 0.25° f000에서 1° 원격자를 추출한 동아시아·서태평양(20~55°N, 90~180°E) 격자이고 public domain이다. 출력은 wind/tpw-ea.json이며 v1 gridoverlay.js:405만 읽고 v2는 읽지 않는다.\n- 전지구·예보 TPW는 aws/gfs-cloud-forecast 요청에 var_PWAT를 추가하면 된다(entire atmosphere 레벨은 이미 요청 중 :105). 41스텝 0.5°가 나온다. 새 Lambda는 0개다.", "paidHook": "무료:\n- 위성 수증기 채널 칩(관측 영상).\n\nEXPLORER:\n- TPW 칩(동아시아 분석장)과 강수 색면 겹쳐 보기.\n- 짧은 리포트('함께 나타난 조건'으로만 서술).\n\nPRO:\n- TPW +120h와 GFS|ECMWF 비교.\n- export.", "size": "M", "priority": "P2", "action": "MERGE", "reuse": "prototype/v2-three/js/main.js:1472-1519 · prototype/js/gridoverlay.js:405(TPW 로더·단계 정의) · prototype/js/continuous-contours.js:35 · prototype/js/contour-math.js · prototype/v2-three/js/precip-field.js · aws/tpw-grid/handler.py · aws/gk2a-clouds/handler.py · aws/gfs-cloud-forecast/handler.py"}]}, {"key": "obs2", "name": "관측·지형(기후 시계열·지표온도·지형)", "items": [{"phenomenonId": "weather.climate_series", "menuName": "기후 시계열", "before": "지구에는 아무것도 그리지 않고 v1 의 chartsPanel 을 오른쪽 패널에 그대로 붙인다(ext/lab-charts.js:18-67) — 40년 스파게티 곡선은 이 묶음에서 유일하게 '차이가 극적으로' 보이지만 409×188px 에 갇혀 있고 도구 링크 3개 뒤에 나오며 지구본·시간축과 연결이 없다.", "reference": "mapped.earth: 'Time machine — monthly climate back to 1940' — 시간 스테퍼로 과거 월별 기후를 지구 위에서 직접 본다(그래프가 아니라 지구가 바뀐다). windy: 같은 것 없음(실측 기록 기준).", "after": "[→ 11 Intelligence · Climatology 탭] 제안 = MOVE: 좌측 메뉴 항목을 없애고 정본 콘셉트 11 의 탭(Now / Forecast / Climatology / Analysis) 중 Climatology 로 옮긴다. '도구(role: tool)'가 아니라 EXPLORER 의 핵심 자산으로 재분류.\n배치(정본 규칙 7 — 수치 먼저): ① 맨 위 숫자 세 줄 '오늘 값 · 같은 날 1991–2020 평균 대비 · 기록 시작 이후 같은 날 순위'(전부 계열에서 계산, DERIVED 표기) ② 출처·자료일·기준 기간 ③ 스파게티 그래프(올해 빨강, 10년 단위 색, 나머지 회색 — 지금 문법 유지) ④ 그 아래에 문장. 문장은 관측된 사실과 '함께 나타난 조건'만 — 원인·전망 단정 없음.\n문맥 연동: 켜져 있는 현상에 따라 계열이 자동 선택된다 — Ocean>SST → OISST 60°S–60°N / Ocean>Ice → NSIDC 북극·남극 / Temperature → CPC 대륙별, 한국 지점을 선택했으면 GHCN-Daily 한국 10개 관측소 중 가장 가까운 곳(1973~). 계열이 없는 현상에서는 탭에 '장기 계열 없음'이라고 말한다.\n지구와 연결(이 개편의 핵심): 곡선의 한 날짜를 짚으면 Global Timeline 이 그 날로 이동하고, 일별 프레임이 있는 현상(해빙·수온·지표온도·눈)은 지구가 그날의 그림으로 바뀐다. 프레임이 없는 현상(전지구 기온)은 '그날의 지구 그림은 없음 — 계열값만 있음'. 새 슬라이더를 만들지 않는다 — 그래프가 Global Timeline 의 또 하나의 손잡이일 뿐.\n크기: Inspector 폭 안 요약 그래프 + '넓게 보기' → 하단 시트(화면 높이 55%, 1440p 에서 약 1,300×420px)로 펼침. 45개 연도선을 읽을 수 있는 크기. 메뉴 재클릭 시 머리말 카드만 남는 토글 버그 제거.\n정리: 첫 화면의 외부 도구 링크 3개(ui-charts.js:569-587)는 탭 맨 아래 'Tools'로. '지금 기온 — 지역별' 막대는 Open-Meteo 5° 상자평균(ui-charts.js:631)이므로 삭제하고 '국가별 공항 관측소 평균'만 남긴다.", "renderType": "DOM 카드", "dataNeed": "지금 자료로 된다 — 계열 넷은 전부 기관 공식 일별 자료이고 Open-Meteo 와 무관: NOAA OISST v2.1(1982~) · NSIDC Sea Ice Index(1978~; aws/climatology/build_seaice_series.py) · CPC Global Daily Temperature · GHCN-Daily 한국 10소(1973~), aws/climatology 하루 1회. 미국 정부·NOAA@NSIDC 공개 자료(인용 표기). 지구 연동용 일별 프레임은 추가 필요: 해빙 = NSIDC 일별 농도 25km, 수온 = OISST 일별 0.25°(NOAA 퍼블릭 도메인; aws/climatology/build_sst_clim.py 가 같은 출처 사용), 지표온도·눈 = GIBS 는 날짜만 바꾸면 2000년대부터 제공. 전지구 기온의 과거 그림(mapped.earth Time machine 급)은 ERA5 월별(Copernicus 라이선스 — 구현 전 확인)이 필요하며 XL·P2 로 분리. 제거 대상: 5° wind 격자 상자평균 막대.", "paidHook": "무료: 올해 선이 40년 다발 위에 있는 그래프 전체(가치가 먼저 보여야 한다 — 잠그지 않는다) + 출처. EXPLORER(핵심 가치): 오늘 값·평년 대비·순위 숫자, 내 장소 최근접 관측소 계열, 날짜 짚기 → 지구 연동, 짧은 Intelligence 리포트 저장·공유. PRO: 계열 CSV·고해상 이미지 export, 두 해의 같은 날을 Compare 작업공간 split globe 로, Research Pack 연결, 기록 갱신 알림.", "size": "M", "priority": "P1", "action": "MOVE", "reuse": "prototype/js/ui-charts.js(chartsPanel 415-682 · legendOf · makeZoomable — 그래프 코드는 그대로), prototype/js/stats.js, prototype/v2-three/js/ext/lab-charts.js · ext-scene.js(이식 규약), aws/climatology/*(build_sst_series · build_seaice_series · build_land_series · build_korea_series · build_sst_clim), prototype/v2-three/js/intel-strip.js · report-center.js(리포트 저장), live-layers.js loadGibs(date 인자화)"}, {"phenomenonId": "land.surface_temperature", "menuName": "지표온도", "before": "MODIS 주간 지표온도 타일을 반지름 1.0014 고정 껍질에 NASA 색 그대로 얹어(live-layers.js:1576-1590), 과장 50× 지형에서 해발 약 178m 넘는 땅은 전부 지형 밑에 깔린다 — 대륙 전체를 덮는 7.8km 급 관측이 있는데 강 하구·평야에만 노란 조각이 보이는 버그 상태이고 범례·시간축·판독이 없다.", "reference": "mapped.earth 의 Temp 는 GFS 모델의 기온 색면(-40~45°C 범례 상시)이고 위성 지표온도는 없다. windy 실측 기록에도 없음. → 기준 사이트에 없음 — EARTHUS 고유. 강점: 모델이 아니라 '관측'이고, 5° 기온 격자보다 약 70배 촘촘해 도시·사막·분지·산맥이 실제로 읽힌다.", "after": "[→ 01 Temperature · 'Land surface(위성 관측)' 칩] 제안 = MERGE: 정본 Inspector 의 Surface(2m) / 850hPa 선택 옆에 셋째 칩으로 넣는다(정본에 없는 칩 추가라 PD 확인 필요). 독립 메뉴로 두면 '기온이 왜 두 개냐'는 혼란만 남는다. 칩 이름과 범례에 '땅 표면 온도 — 2m 기온 아님'을 고정 표기하고 배지는 OBSERVED(모델 기온 칩은 MODEL)로 확실히 구분.\n버그 수정이 먼저(S): 껍질 메시를 버리고 눈 덮임과 같은 방식으로 지형 셰이더 안에서 칠한다(main.js:414-419 패턴) → 50× 과장 지형을 그대로 따라가 티베트·이란·몽골·데칸 전역이 즉시 드러난다.\n표현: NASA 팔레트 그대로가 아니라 값으로 되돌려 01 Temperature 와 같은 5°C 구간색(정본 범례: <-10 · -10~-5 · -5~0 · 0~5 · 5~10 · 10~15 · 15~20 · 20~25 · 25~30 · 30~35 · ≥35)을 쓰되, 지표온도는 사막에서 60°C 를 넘으므로 위쪽에 35~40 · 40~45 · 45~50 · 50~60 · ≥60 구간을 확장한다(확장 구간은 이 칩에서만 — PD 확인 필요). 연속 그라데이션 없음. 같은 색 체계라 2m 기온 칩과 번갈아 누르면 '땅이 공기보다 얼마나 뜨거운가'가 바로 비교된다.\n등치선: 구름 구멍이 많은 관측이라 기본 OFF(조각난 선이 된다). 대신 구름·궤도 틈은 비우지 않고 회색 빗금 '관측 없음(구름)' — '자료 없는 레이어'로 오해되지 않게.\n지도 위 숫자: 화면 안 최고 구간 덩어리 상위 몇 곳에 구간 라벨('≥60°C', '50~60°C')을 찍는다. 팔레트 양자화 때문에 소수점 값은 만들지 않는다 — 구간으로만 말한다.\n칩: 주간/야간(GIBS 에 야간 레이어 존재 여부 구현 전 확인) · 오늘/작년 같은 날. 시간축: Global Timeline 일 단위(관측 2일 지연 표기). 범례 상시: '°C 지표온도 · 위성 관측 · 관측일 · NASA MODIS Terra / LP DAAC'.\nInspector: 클릭 → 구간·관측일·출처·'2m 기온 아님' → 가까운 관측소의 2m 기온(관측)과 나란히 → Intelligence 문장은 '함께 나타난 조건'만(예: '같은 날 가장 가까운 관측소 기온 31.2°C(KMA) · 지표온도 구간 45~50°C(MODIS)').", "renderType": "고해상 색면", "dataNeed": "해상도는 지금 자료로 충분하다(z3 50장 ≈7.8km/px; z4 로 올리면 ≈3.9km — 타일 200장이라 확대 시 시야 범위만 스트리밍). 필요한 것은 '값': (1) GIBS 레이어별 colormap XML 로 색→K 역변환(구현 전 확인 필요). 13M 픽셀 역변환은 브라우저 메인 스레드에서 하지 말고 Lambda 에서 값 인코딩 PNG(예: 3600×1800, 0.1°)로 미리 굽는다 — 눈·해빙과 같은 수집기 하나('gibs-value' 가칭)로 세 메뉴를 동시에 해결. (2) 정밀값이 필요하면 원제품 MOD11C1(0.05° 일별 CMG, NASA LP DAAC, Earthdata 로그인) — NASA 자료는 공개·인용 표기. (3) 시간축은 GIBS 가 날짜별 타일을 제공하므로 loadGibs 의 date 고정(live-layers.js:13)만 풀면 된다. Open-Meteo 의존 없음 → 유료 핵심 그림으로 세워도 안전.", "paidHook": "무료: 오늘(−2일) 주간 지표온도 구간색 전지구 + 범례 + 클릭 구간값 — 고치기만 해도 이 묶음에서 가장 극적인 무료 그림. EXPLORER: 최근 30일 재생, 작년 같은 날, 2m 기온 관측과의 나란한 판독, 도시 단위 짧은 리포트. PRO: 두 날짜 split/wipe/diff, 주간−야간 차이 지도, 관심 영역 평균 구간 시계열·export. 시뮬레이션은 12 Simulation 의 +2°C/+4°C 시나리오와 섞지 않는다(지표온도 엔진 없음 — NOT_AVAILABLE).", "size": "M", "priority": "P1", "action": "MERGE", "reuse": "prototype/v2-three/js/live-layers.js(loadGibs 12-38 · metaGibs 1592-1607 — '2m 기온과 다르다' 문구 유지), prototype/v2-three/js/main.js(EARTH_FRAG 414-419 드레이프 패턴 · 변위 270 · 과장 기본값 2500), 01 Temperature 구간 렌더러·범례 계약(docs/earthus-v23/CONTINUOUS_LAYERS.md §2), aws/deploy-grib-python.sh 류 Lambda 배포 스크립트, aws/kma-aws · aws/land-stations(나란한 2m 기온)"}, {"phenomenonId": "land.terrain", "menuName": "지형", "before": "지형은 항상 켜진 기본 씬이라 메뉴를 눌러도 안내 카드 한 줄만 뜨고(main.js:4391-4396), 정작 조작은 설정 서랍의 '시뮬레이션 · 표현 튜닝'에 슬라이더 6개(지형 과장 1~80× · 등심선 간격 · 음영 강도 · 위성 색 혼합 · 태양 방위각·고도각, index.html:1488-1518)로 자료 선택과 뒤섞여 있다 — 고도 구간색·육지 등고선·범례·고도 판독은 없다(등고선 셰이더는 바다 h<0 전용, main.js:506).", "reference": "mapped.earth: 지형을 데이터 그 자체가 아니라 표현 도구로 쓴다 — LAND > Population 은 밀도만큼 땅이 솟고, borders·rivers 는 부가 토글. 지형 튜닝 패널은 없다. windy: 지형 메뉴 없음 — Altitude 슬라이더는 자료의 고도 선택이고 'Display on map' 이 표현 보조로 분리돼 있다.", "after": "[→ 09 Terrain] + 렌더 조작은 View > Appearance 로(정본 규칙 3 — P0 'Data/View 분리'의 본체가 이 메뉴다).\nTerrain 데이터 패널에는 데이터 모드만 남긴다: ① Elevation 토글 — 고도 구간색(hypsometric tint) 10단: 0~100 · 100~250 · 250~500 · 500~1000 · 1000~2000 · 2000~3000 · 3000~4000 · 4000~5000 · ≥5000 m(+해수면 아래 육지 <0), 범례 단위 m 상시(구간값은 정본에 없어 제안값 — PD 확정 필요). ② Contour 토글 + 간격 프리셋 칩 100 / 250 / 500 / 1000 m(슬라이더 금지) — 5번째마다 굵은 주곡선, 주곡선 위 숫자 라벨 '1000 m'. 줌에 따라 간격을 2배씩 성기게 하는 기존 로직 유지(모아레 방지). ③ Hillshade 토글(켬/끔만). ④ Satellite — imagery source picker: 자연 지형(Natural Earth II) · 블루마블 · 오늘의 지구(GIBS true color, 관측일 표기) · 고해상 위성(확대 시). 지금의 '지구 바탕 그림' 세그먼트(index.html:1470-1475)를 여기로 옮긴다.\nView > Appearance 로 이동(데이터 메뉴에서 제거): 지형 과장(1× 실제 / 10× / 25× / 50× 기본 — 프리셋 칩), 음영 강도(약/중/강), 위성 색 혼합, 태양 조명(실시간 태양 / 고정 조명 + 방위·고도는 Advanced 에만), 3D Earth ↔ 3D Terrain 전환 하나로 통합, 자동 회전. ⚠ 콘셉트 이미지 09 의 패널에는 'Exaggeration 2x'가 그려져 있으나 정본 본문 AC 는 'terrain exaggeration 은 Advanced View 에만'이다 — 본문을 따른다(PD 확인 필요).\n지도 위 숫자: 확대 시 화면 안 최고점 몇 곳에 고도 라벨('8,8xx m' 식으로 타일 해상도가 허용하는 자릿수까지만). Inspector: 클릭 → 고도 m · 자료 해상도(현재 타일 z 레벨과 대략의 m/px) · 출처(AWS Terrain Tiles/Terrarium) · '과장 50× 는 표현일 뿐 값은 실측 그대로' 고정 문구. 시간축: 없음(정적 자료) — Global Timeline 은 그대로 두되 'Terrain 은 시간에 따라 변하지 않는 자료' 배지.\n이 묶음 전체에 거는 계약: 과장 50× 가 기본인 한, 모든 자료 색면은 구 껍질이 아니라 지형 셰이더에 드레이프한다(지표온도·바다 색면·대기질이 지형에 깔리거나 떠 보이는 버그의 공통 원인).", "renderType": "단계색+등치선", "dataNeed": "지금 자료로 된다: AWS Terrain Tiles(Terrarium) 전역 z4 + 지역 z5~z9 스트리밍(phenomenon-registry.js:193) — 공개 자료(구성 원천별 출처 표기는 구현 시 정리). 고도 구간색·등고선은 같은 고도맵을 셰이더에서 읽어 그리므로 새 수집기가 필요 없다. 전역 z4 는 약 2.4km/px 급이라 전지구 시점의 100m 등고선은 뭉개진다 → 프리셋은 줌에 따라 유효한 것만 활성(전지구 1000m, 대륙 500m, 지역 250/100m). ⚠ 확대 시 얹히는 Esri World Imagery 는 유료 상품에서의 이용 조건을 구현 전 확인해야 한다(UNKNOWN — 확인 전에는 PRO 의 'high-detail' 가치로 약속하지 않는다). 대안 후보는 NASA GIBS/Blue Marble(공개).", "paidHook": "무료: 3D 실지형 + Elevation 구간색 + 등고선 프리셋 + 클릭 고도값(정본: Explorer 'terrain & contours' 이지만 기본 그림은 무료에서 완성돼 보여야 한다 — 경계는 PD 결정). EXPLORER: 두 지점 단면도(measure.js 확장), 저장된 뷰·프리셋. PRO: 고해상 지역 3D(local-terrain.js z9+), 경사·향 분석 프리셋, 뷰 export. '해수면이 오르면 어디가 잠길까'는 sim-questions.js 에 NOT_AVAILABLE 로 선언된 그대로 둔다 — 고도맵 단순 물채움을 시뮬레이션이라 부르지 않는다.", "size": "M", "priority": "P0", "action": "IMPROVE", "reuse": "prototype/v2-three/js/main.js(해저 등심선 셰이더 501-520 을 육지로 일반화 — h<0 조건과 uIsobath/uIsobathStep 2501-2502·bind 2618 을 공용화, terrainHtml 3816), prototype/v2-three/index.html(1470-1518 컨트롤을 View > Appearance 로 이전), prototype/v2-three/js/local-terrain.js · measure.js, prototype/v2-three/js/sim-questions.js:207-219(NOT_AVAILABLE 선언 유지)"}]}, {"key": "life2", "name": "여가(해변·서핑·낚시·패러글라이딩·산 정상)", "items": [{"phenomenonId": "ocean.coastal_spots", "menuName": "해변과 낚시터", "before": "해변 271곳(노랑 6px)·낚시 946곳(청록 3.5px)을 값 없는 단색 점 두 무리로 찍고 클릭이 안 된다(live-layers.js:1802-1816).", "reference": "windy POI 의 '서핑 지점'·'조석' 오버레이 — 값과 함께 찍힌다. 값 없는 점만 찍는 메뉴는 기준 사이트에 없다.", "after": "[→ 05 Ocean · Waves 탭] 독립 메뉴 폐지 → Waves 탭 Inspector 의 'Show spots' 토글(칩 [서핑 | 낚시])이 쓰는 마커 바탕으로 MERGE. 서핑·낚시 모듈이 같은 좌표를 값과 함께 그리므로 값 없는 점 메뉴는 중복이다. 남기는 것은 좌표 목록(해변 271 + 일본 756, 낚시 946 + 일본 63)과 해변 방위(facing) 계산값뿐.", "renderType": "아이콘/마커", "dataNeed": "지금 자료로 된다(prototype/data/beaches.json · fishing.json, OpenStreetMap ODbL 1.0 — 상업 가능·출처표기).", "paidHook": "무료: 마커 위치. 유료 깊이는 surf_conditions·fishing_conditions 쪽에서 판다.", "reuse": "D:/## APP/EARTHUS v2_APP/prototype/data/beaches.json · D:/## APP/EARTHUS v2_APP/prototype/data/fishing.json", "size": "S", "priority": "P2", "action": "MERGE"}, {"phenomenonId": "ocean.surf_conditions", "menuName": "서핑", "before": "카메라 근처 해변 12곳에 8px 점(색=스웰 노출 4판정)과 '너울 m·수온' 이름표를, 300km 위에서는 권역 대표점을 찍으며 파랑·수온·조위는 브라우저가 Open-Meteo Marine 을 직접 부른다(ext/hobby-surf.js:84-116, prototype/js/beaches.js:206-250).", "reference": "windy — 파도·너울 색면 위에 '서핑 지점' POI, 누르면 그 지점의 파고·주기·방향·바람·조석 타임라인. mapped.earth — Waves·Wave period 색면만(지점 없음).", "after": "[→ 05 Ocean · Waves 탭] Inspector 토글 'Surf spots'(07 의 'Show Stations' 와 같은 부품). 부모 그림(파고 단계색 + 방향·높이 glyph, 파고·너울 별도 수치)은 05 Ocean 담당이 그린다 — 여기서는 마커와 Inspector 만 정의한다. 마커: 해변마다 방위 아이콘(해변이 보는 방향 부채꼴 + 스웰 방향 화살 — 둘의 각이 곧 판정) + 색 4종은 판정이 아니라 기하 사실로 범례에 적는다 '스웰 노출: 정면 · 비스듬 · 스침 · 막힘'(기존 JUDGE_COLOR) + 숫자 라벨('1.2m · 9s'). 파고 색면 위에 마커 색이 겹쳐 이중 부호가 되므로 마커는 흰 테두리 원판 안에 색을 넣고 색면과 다른 팔레트를 쓴다. 12곳 제한 대신 화면 안 전부를 클러스터로(멀리서는 권역 최대 너울 숫자). 일본 해변은 facing 이 없으므로 회색 아이콘 '방위 자료 없음'. 점수·'타기 좋습니다' 는 재도입하지 않는다(모듈 머리말의 금지). Inspector(안전이 맨 위): 이안류 등급(KHOA 10곳, 여름 한정 — 빈 계절에 '안전'으로 읽히지 않게) → ① 스웰 유입 ② 파면(육풍/해풍 — KMA AWS 10분 실측) ③ 주기 세 칸 → 부이 실측(120km 이내, OBSERVED)과 모델값(MODEL) 나란히 → 조위. Global Timeline 을 밀면 마커 숫자·노출이 그 예보 시각으로 바뀐다(지금은 current 한 시점).", "renderType": "아이콘/마커(방위 아이콘 + 숫자 라벨)", "dataNeed": "지금 자료로는 유료 불가 — 파랑·수온·조위가 Open-Meteo Marine 브라우저 직호출(beaches.js:226)이고 aws/marine-ea 도 Open-Meteo 다(비상업 조항 위험, R0 감사). 대체 경로: aws/ecmwf-ingest 가 이미 ECMWF Open Data(CC BY 4.0)를 .index Range 방식으로 지점 최근접값만 집는다(README:87-88) — 지금은 PARAMS=['2t'](handler.py:64)·oper 스트림(:100)뿐이라 swh·mwd·mwp(파랑은 별도 wave 스트림으로 알려져 있음 — URL 분기 확인 필요)를 더하는 확장이 가장 싸다. 차선은 NOAA GFS-Wave(0.25°, public domain, GRIB 파서는 aws/gfs-cloud-forecast/grib2lite.py 후보). 실측은 이미 있다: aws/kma-ocean(부이 10분, 파고 3종·파향) · aws/khoa-coast(조위 45곳·이안류 10곳) · aws/kma-aws(10분 바람). 조석 '예보'는 KHOA 조석예보 API 추가 필요(지금은 관측 조위만).", "paidHook": "무료: 마커·노출 색·현재 값 + 안전 정보(이안류·너울 경고는 구독과 무관하게 무료). EXPLORER: 7일 타임라인 + 내 해변 즐겨찾기 + '이 해역에서 모델이 부이 실측과 지난 30일 몇 m 어긋났나' 검증 이력 + 사용자가 정한 임계 알림(우리가 '좋다'고 말하지 않는다). PRO: 10 Compare 에서 ECMWF-WAM | GFS-Wave.", "reuse": "D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-surf.js · D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-sea-common.js · D:/## APP/EARTHUS v2_APP/prototype/js/surf.js (judge) · D:/## APP/EARTHUS v2_APP/aws/ecmwf-ingest/handler.py · D:/## APP/EARTHUS v2_APP/aws/kma-ocean/handler.py", "size": "L", "priority": "P2", "action": "MERGE"}, {"phenomenonId": "ocean.fishing_conditions", "menuName": "낚시", "before": "카메라 근처 낚시터 12곳에 8px 점(색=종류 5색)과 '조차·너울' 이름표를 찍고 너울 1.5m 이상만 붉게 하며 값은 Open-Meteo Marine 브라우저 직호출이다(ext/hobby-fishing.js:79-108, prototype/js/fishing.js:57-58, :293).", "reference": "windy POI 의 '조석' 오버레이 + 파도 색면. mapped.earth 에는 없다. 안전을 맨 위에 두는 구성은 EARTHUS 고유.", "after": "[→ 05 Ocean · Waves 탭] Inspector 토글 'Fishing spots'(서핑과 같은 'Show spots' 부품의 다른 칩). 부모 색면은 05 담당. 마커: 종류 아이콘 5종(섬·갯바위 / 방파제 / 선착장 / 마리나 / 항·포구 — 색은 '무엇인지'만 말하고 좋다/나쁘다를 말하지 않는다, 기존 원칙) + 숫자 라벨('조차 3.2m · 너울 0.8'). 색으로 말하는 유일한 것은 안전: 너울 ≥1.0m 주황 고리 · ≥1.5m 붉은 고리(fishing.js SWELL_WATCH/DANGER 그대로, severity band 우선). 파고 색면의 붉은색과 겹쳐 이중 부호가 되므로 고리는 흰 외곽선을 두른다. 12곳 제한 대신 화면 안 클러스터(멀리서는 권역 최대 조차 숫자 — 서핑은 최대 너울, 묻는 것이 다르다). Inspector 순서: 안전(너울·바람·이안류, 기관 발표 시각) → 물때(만조·간조 시각, 조차) → 수온. 조황·어종은 말하지 않는다. Global Timeline 을 밀면 조위·너울 숫자가 그 시각으로 바뀐다.", "renderType": "아이콘/마커(종류 아이콘 + 숫자 라벨 + 안전 고리)", "dataNeed": "서핑과 같은 Open-Meteo 문제(fishing.js:293) — 같은 대체 수집기를 공유한다(ECMWF Open Data wave 확장 또는 GFS-Wave). 물때는 모델 sea_level 대신 KHOA 조석예보(공공누리)로 바꾸는 편이 더 정확하고 라이선스도 깨끗하다 — 수집기 추가 필요(aws/khoa-coast 는 관측 조위만). 실측은 aws/kma-ocean · aws/kma-aws · aws/khoa-coast 재사용.", "paidHook": "무료: 마커 + 지금의 안전 정보(구독과 무관하게 무료). EXPLORER: 물때 7일 + 시간대별 조건표(값 나열이지 추천이 아니다) + 너울 경고 알림 + 내 포인트 저장. PRO: 없음.", "reuse": "D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-fishing.js · D:/## APP/EARTHUS v2_APP/prototype/js/fishing.js (safety·FISH_RULES) · D:/## APP/EARTHUS v2_APP/aws/khoa-coast/handler.py", "size": "M", "priority": "P2", "action": "MERGE"}, {"phenomenonId": "weather.paragliding", "menuName": "패러글라이딩", "before": "한국 활공장 26곳에 9px 점(색=바람 5구간)과 '풍속·16방위' 이름표를 찍고 값은 Open-Meteo forecast current 를 브라우저가 직접 부른다(ext/hobby-para.js:176-205, prototype/js/para.js:136).", "reference": "windy POI 의 '패러글라이딩 지점' — 바람 입자·색면 위에 마커, 누르면 지점 예보와 고도별 바람. mapped.earth 에는 없다.", "after": "[→ 02 Wind] Inspector 토글 'Flying sites'. 부모 그림(흐르는 입자 + 풍속 구간색)은 02 Wind 담당 — 여기서는 마커와 Inspector 만. 마커: 풍향 화살 아이콘(화살 방향 = 풍향) + 색 5구간은 기존 PARA_RULES 수치 그대로 범례에 적는다(<3 약함 · 3~6 흔히 말하는 적정 구간 · 6~8 센 편 · 8~11 강함 · ≥11 m/s 대부분 비행 중단) + 숫자 라벨('4.2 m/s NW'). 돌풍차(돌풍−평균)가 4 이상이면 주황 고리, 7 이상이면 붉은 고리 — 평균 풍속보다 위험한 값이므로 severity 로 따로 세운다. 범례 상시: '우리가 정한 표시 구간 — 협회 기준 아님 · 좌표는 산 정상이지 이륙장이 아님 · 풍속 기준 지상 10m'. '날기 좋다'는 말은 재도입하지 않는다. Inspector: 10m 바람·돌풍차·구름 밑면(Espy 근사, ±수백 m 고지)·기온/이슬점 + 가장 가까운 KMA AWS 실측(OBSERVED)을 모델값(MODEL)과 나란히 + 고도는 02 Wind 의 고도 선택(10m/850hPa…)을 그대로 따른다(새 컨트롤 없음).", "renderType": "아이콘/마커(풍향 화살 + 숫자 라벨)", "dataNeed": "지금 자료(Open-Meteo 직호출)로는 유료 불가. 대체: 1차 값은 KMA AWS 10분 실측(aws/kma-aws, 이미 있음 — 다만 활공장은 산 위라 가까운 관측소와의 거리·고도차를 표기), 예보는 aws/kma-fcst(단기예보) 또는 02 Wind 가 쓸 GFS 0.25° 10m·850hPa(public domain). 구름 밑면은 ECMWF 2t 와 이슬점으로 같은 Espy 식을 계산할 수 있다(aws/ecmwf-ingest 에 2d 추가 필요). 활공장 목록은 OSM(ODbL) 26곳 — aws/para-sites. 이륙장 방위 자료는 없다(만들지 않는다).", "paidHook": "무료: 마커·지금 값. EXPLORER: 48h 타임라인 + 고도별 바람 + 사용자 설정 임계 알림. PRO: 없음. 26곳이라 단독 유료 가치는 낮고 02 Wind 의 부가 가치로 본다.", "reuse": "D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-para.js · D:/## APP/EARTHUS v2_APP/prototype/js/para.js (windBand·PARA_RULES :33-46) · D:/## APP/EARTHUS v2_APP/aws/kma-aws", "size": "S", "priority": "P3", "action": "MERGE"}, {"phenomenonId": "weather.mountain_summit", "menuName": "산 정상 날씨", "before": "기상청 산악예보 봉우리에 7px 점 3색(예보만/실측 있음/선택)을 찍을 뿐 값이 지구 위에 없고, 봉우리를 고르면 OSM 등산로를 sac 등급색 1px 선분으로 그린다 — 예보 대 실측 비교는 카드에만 있다(ext/hobby-mountain.js:297-326).", "reference": "windy — 기온 색면 위에 '도시마다 값 숫자' + POI '기상 관측소·보고된 온도'. 산 정상의 '예보 대 실측 병기'는 두 기준 사이트에 없음 — EARTHUS 고유.", "after": "[→ 01 Temperature] Inspector 토글 'Summits'(07 Air Quality 의 'Show Stations' 와 같은 부품). 부모 그림(5°C 단계색 10단 + 흰 등온선 + 숫자 라벨)은 01 담당 — 여기서는 마커와 Inspector 만. 마커: 봉우리마다 두 숫자 라벨 '설악산 1,708m  예보 4° | 실측 1°' — 예보는 OFFICIAL_FORECAST 배지색, 실측은 OBSERVED 배지색으로 갈라 관측과 예보를 섞지 않는다. 마커 색은 01 의 5°C 단계색 팔레트를 그대로 쓴다(정상 예보 기온) — 평지 색면과 마커의 색 차이가 곧 '정상은 여기보다 얼마나 추운가'라는 이 메뉴의 질문에 대한 그림 답이다. 예보−실측 차가 3°C 이상이면 고리(mountain.js MARK.gapC = 3 그대로). 실측 없는 봉우리는 예보 숫자만 + '실측 없음'. 범례에 시각 3줄 상시(예보 발표시각 · 유효시각 · 관측시각 — 둘이 다른 시각의 값임을 숨기지 않는다) + '응답 ○/165곳'. Global Timeline: 산악예보의 시간별 값을 타임라인에 연결(지금은 가장 가까운 1시각). 등산로: 1px 선 → 2px 리본, sac 6등급 범례('국제 등급 — 우리가 매긴 것 아님 · 폐쇄·통제 미포함'). '안전합니다'·'등산하기 좋습니다'는 쓰지 않는다. Inspector: 예보(기온·풍속·풍향·강수) · 실측 · 감률 환산(5.5°C/km, EARTHUS_ANALYSIS 배지) · 출처 — 수치가 먼저, 문장은 그 아래.", "renderType": "아이콘/마커(두 숫자 라벨) + 경로선(등산로 리본)", "dataNeed": "지금 자료로 되고 라이선스가 깨끗하다 — 전부 기상청 공공데이터: aws/kma-mountain(산악예보 165곳, 3시간) · aws/kma-aws(10분 실측). 그리고 aws/mountain-verify 가 예보−실측 차이를 매시간 보관·일별 집계(wind/series/mountain-gap-daily.json)로 이미 쌓고 있다 — 유료 깊이의 재료가 지금도 축적 중이다(겨울 표본은 이번 겨울이 지나야 생긴다). 등산로는 OSM(ODbL) 104봉. KMA 허브 일일 용량 공유에 주의.", "paidHook": "무료: 두 숫자 마커 + 지금 값(기관 예보·실측은 무료). EXPLORER: 검증 이력 리포트('이 산에서 지난 30일 예보는 실측보다 평균 몇 °C 따뜻했나' — 표본 수·기간·계산식 표기, 원인 단정 없음) + 시간별 타임라인 + 영하 진입·강풍 알림. PRO: 없음. 이 묶음에서 지금 자료만으로 EXPLORER 가치가 서는 유일한 항목이다.", "reuse": "D:/## APP/EARTHUS v2_APP/prototype/v2-three/js/ext/hobby-mountain.js · D:/## APP/EARTHUS v2_APP/prototype/js/mountain.js (MARK :53) · D:/## APP/EARTHUS v2_APP/aws/mountain-verify/handler.py · D:/## APP/EARTHUS v2_APP/aws/kma-mountain/handler.py", "size": "M", "priority": "P1", "action": "MERGE"}]}]

phase('RedTeam')
// ⚠️ 1차 실행은 JSON.stringify(...).slice(0, 16000) 로 입력을 잘라 뒤쪽 항목을 잃었다. 여기서는 자르지 않는다.
const results = await parallel(BATCHES.map((b) => () => agent(`${BASE}${KNOWN}${PD_SPEC}
**'${b.name}' 개선안의 반박 검증(Red Team).** 너는 이 개선안을 **깨뜨리려는** 기술 책임자다.
PD 정본(PD_SPEC)의 목표 화면은 바꾸지 않는다 — 네가 공격하는 것은 "그 목표에 **지금 자료와 코드로 어떻게·얼마 만에** 도달하느냐"다.
콘셉트 이미지는 시안이다. 시안의 모델 이름(GFS·ECMWF·CAMS·JTWC·CMIP6)이 지금 저장소에 수집기가 있는지 aws/ 에서 확인하고,
없으면 "자료 확보"를 선행 작업으로 분리해 크기를 정직하게 올린다.

이미 확정된 이웃 결정(같은 묶음의 1차 검증에서 나온 것 — 어긋나지 않게 한다):
- 'GFS 확장'은 묶음 공통 선행 작업(M) **하나**다: aws/gfs-cloud-forecast 에 TMP 2m · UGRD/VGRD 10m · PRMSL · APCP 를 한 번에 추가,
  gl.describe 로 선별 해독, 새 필드는 '없으면 그 프레임만 생략'. 기준 실측 41스텝 270.4초 / 한도 900초. 0.25° 불가.
- 프레임 값은 **8bit 1채널 선형**(예: 기온 0.5°C 눈금) — 16bit PNG 는 브라우저가 8bit 로 내려 읽는다. LinearFilter 보간 = 값 보간.
- 등치선은 **셰이더 선**, contour-math 는 **라벨 자리 찾기 전용**(솎은 격자, 키프레임 바뀔 때만).
- GFS 프레임 로더를 CloudManager 에서 떼어 공용 프레임 저장소로(main.js:1814-1844).
- aws/ecmwf-ingest 는 **격자가 아니다**(ASOS 97지점 점값, 미스케줄, AEC 압축이라 eccodes 필요). ECMWF 격자는 별도 L 작업.
- 동아시아 1° 보강판(wind-ea · pressure-ea)도 Open-Meteo 다.

개선안(JSON — 잘리지 않았다, ${b.items.length}항목):
${JSON.stringify(b.items, null, 1)}

각 항목을 다음으로 공격하고, 살아남는 형태로 **고쳐서** 최종안을 낸다:
- **자료**: 그 그림이 정말 그 자료로 나오는가? 해상도·갱신 주기·결측을 코드/수집기에서 확인한다(aws/ 아래 handler.py).
- **라이선스**: Open-Meteo 파생은 유료 상품의 핵심 그림으로 쓰면 안 된다. 대체 경로를 적는다.
- **정직성**: 없는 값 생성·관측/모델 혼동·격자값을 도시값으로 말하기가 있으면 고친다. v2 는 예보하고 원인·확률을 말한다 — 근거가 패킷에 있으면 허용이다(막지 말 것).
- **성능**: 모바일에서 도는가(입자 5,000 예산, 텍스처 크기, 드로우콜).
- **범위**: size 가 과소평가됐으면 올린다. P0 는 "이것 없이는 유료 불가"만. ⚠️ 02 Wind 는 PD 정본의 P0 다.
- acceptance — 완료 판정 기준을 **화면에서 확인 가능한 문장**으로 2~4개.
corrections 에 뒤집거나 낮춘 것을 이유와 함께 적는다. **${b.items.length}항목 전부를 돌려준다.**`,
  { label: `redteam:${b.key}`, phase: 'RedTeam', schema: RED_SCHEMA })
  .then((r) => ({ group: b.key, groupName: b.name, ...r }))))
const ok = results.filter(Boolean)
const n = ok.reduce((s, r) => s + (r.items || []).length, 0)
log(`재검증 ${n}/11 항목`)
if (n < 11) log('⚠️ 아직 빠진 항목이 있다 — 지시서에 미검증으로 표시해야 한다')
return { groups: ok, count: n }
