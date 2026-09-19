// EARTHUS — 시뮬레이션 능력 레지스트리 + 추천 질문
//
// 질문 → 현상 → 연산 → 능력 → 엔진 → 검증 → 실행 → 결과 → 지구, 이 흐름의
// "질문이 무엇을 부를 수 있는가"를 한 곳에 모은 표다. 여러 파일에 if/else 로
// 흩어두면 가짜 시뮬레이션이 한 줄씩 새어 나온다 — 지시서 §16.
//
// 상태 규약 (지시서 §16·§26):
//   available      기록 남는 검증된 계산이 있고(simulation_run 대상) 이 화면에서 부를 수 있다
//   limited        실제 자료·장면으로 답하지만 기록 남는 계산이 아니다(기관 예보 인용·장면 표현).
//                  액션이 있으면 누를 수 있고, 한계 문장(reason)을 항상 같이 보여준다
//                  (2026-09-20 §G-2 — MAPPING §0.1: 브라우저 장면 계산은 simulation_run 대상이 아니다)
//   not_available  계산 엔진이 없다 — 버튼은 두되, 누르면 왜 없는지를 말한다
//                  (pop-metric-menu.js 의 선례: 조용히 아무 일도 안 하지 않는다)
//   not_evaluable  엔진은 있으나 지금 입력이 없다(예: 바다 지점 미선택)
//   unavailable    외부 자료 오류 — 엔진-브리지의 UNAVAILABLE 이 따로 붙는다
//
// 값을 지어내지 않는다. engineRef 는 실제 파일이고, 시험(tools/earthus-v53/)이
// 이 표와 phenomenon-registry 의 66현상·실제 파일 존재를 매번 대조한다.

export const SIM_STATUS = Object.freeze({
  AVAILABLE: 'available',
  LIMITED: 'limited',
  NOT_AVAILABLE: 'not_available',
  NOT_EVALUABLE: 'not_evaluable',
  UNAVAILABLE: 'unavailable',
});

// 가정 장면(Preview) — 계약 §K-2: Preview 는 SIMULATION 배지를 받지 않는다(RUN 만 받는다).
// 시나리오 탭은 원래 capabilities.simulation 이 참일 때만 열렸다. §G-2 정정으로 파도가 simulation:false 가
// 되자 멀쩡한 태풍 해상 가정 장면(ocean/typhoonsim)으로 가는 탭이 사라졌다 — 그래서 장면을
// '능력'이 아니라 '미리보기'로 따로 적고, 셸은 둘 중 하나가 있으면 시나리오 탭을 연다.
const PREVIEW_TYPHOON_SEA = Object.freeze({
  tab: 'scenario',
  ko: '태풍 해상 가정 장면 — 공식 예보 아님 · 기록 남는 계산 아님',
  en: 'Typhoon sea-state what-if scene — not a forecast, not a recorded computation',
});

// sim 액션은 main.js onAction 의 'sim-q' 분기가 받는다. action 값과 분기 이름을
// 다르게 쓰면 연결이 조용히 끊긴다 — 시험이 두 파일을 대조한다.
export const SIM_CAPABILITIES = {
  // ⚠️ 2026-09-20 §G-2 정정: available → limited. Gerstner 파도는 **장면 표현**이다(MAPPING §0.1) —
  //    §N 을 통과한 적 없고 기록 남는 실행이 아니다. 장면은 그대로 열리고, 한계 문장이 같이 붙는다.
  //    '태풍이 오면' 질문은 뺐다 — 태풍 파도를 계산하는 엔진이 없는데 계산처럼 읽혔다(CROSSWALK §4-3).
  'ocean.wave': {
    menu: 'ocean',
    engine: 'sim-ocean.Gerstner — 해양 모델 지점값(파고·너울·풍속)을 입력으로 그리는 파도 표면 장면',
    engineRef: 'prototype/v2-three/js/sim-ocean.js',
    status: SIM_STATUS.LIMITED,
    inputs: '해양 모델 지점값(파고·너울·풍속·풍향) + 그 지점의 실제 태양 고도',
    outputs: '파도 표면 장면(분산 관계 ω=√(g·k) 로 움직임을 그린다) — 기록 남는 계산 아님',
    horizons: '현재 값 기준 실시간 장면 — 시계열 예보 아님',
    preview: PREVIEW_TYPHOON_SEA,
    questions: [
      { id: 'wave-motion', ko: '지금 이 바다는 어떻게 움직일까?', en: 'How is this sea moving right now?', action: 'wave-now', status: SIM_STATUS.LIMITED,
        reasonKo: '지금 바다 장면을 그립니다 — 기록 남는 계산이 아니며 예보가 아닙니다', reasonEn: 'Draws the sea as it is now — not a recorded computation and not a forecast' },
    ],
  },
  'hazards.tsunami': {
    menu: 'hazards',
    engine: 'aws/tsunami-eta — 수심 격자에서 c=√(g·h) 다익스트라 도달시간',
    engineRef: 'aws/tsunami-eta/handler.py',
    status: SIM_STATUS.AVAILABLE,
    inputs: 'GEBCO 수심 격자 + USGS M6.5↑ · 진원 100km 이하 · 바다 지진 사건',
    outputs: '38개 해안 지점 도달시간 · 30~720분 등시선',   // 2026-09-20: 예전 '39개'는 틀렸다 — STATIONS 는 38곳
    horizons: '사건별 단회 계산 — 계속 미끄러지는 예보가 아니다',
    // 계약 §L-2 · §G-4 — 지역은 새 스키마가 아니라 문장으로 적는다. 배지는 ✅ 계산됨 / 📋 기관 인용 둘뿐(§J).
    regions: Object.freeze({
      // ⚠️ 연안 지점 38곳 = 한국 10 + 일본·대만·필리핀·미국 등 태평양 28 (aws/tsunami-eta/handler.py STATIONS).
      //    문서들(계약 §H·MAPPING)의 '39'는 틀린 수였다. 계약 §L-2 표의 '한국 전 해안'은 줄여 쓴 것 —
      //    계산은 38곳 모두 한다. 지역별 검증(§H)은 한국만 끝났다. 시험이 이 수를 STATIONS 와 대조한다.
      ko: '✅ 계산됨 — 태평양 연안 38곳(한국 10곳 포함) 도달시간. PTWC 발표가 있는 사건은 대조해 보여 줍니다. 한국 밖 연안은 지역별 검증 전입니다',
      en: '✅ Computed — arrival times at 38 Pacific coastal points (10 in Korea), cross-checked against PTWC where a bulletin exists. Coasts outside Korea are not yet validated region by region',
    }),
    questions: [
      { id: 'tsunami-reach', ko: '이 쓰나미는 어디까지 갈까?', en: 'How far will this tsunami reach?', action: 'tsunami-reach', status: SIM_STATUS.AVAILABLE },
      { id: 'tsunami-eta', ko: '우리 해안에 언제 도착할까?', en: 'When will it reach our coast?', action: 'tsunami-reach', status: SIM_STATUS.AVAILABLE },
    ],
  },
  'hazards.typhoon': {
    menu: 'hazards',
    engine: '공식 예보 경로(KMA·JMA·NHC) — intel-feed.js 가 그리는 기관별 경로선. 우리가 만든 이동 계산 엔진은 없다',
    engineRef: 'prototype/v2-three/js/intel-feed.js',
    status: SIM_STATUS.LIMITED,
    inputs: '기관별 공식 예보 회차(개정 이력 포함)',
    outputs: '공식 예보 경로 · 과거 유사 사례 통계(aws/cyclone-analog)',
    horizons: '공식 +24h 전망이 시나리오 기준선이 된다',
    regions: Object.freeze({
      ko: '📋 기관 인용 — 한국·일본(기상청·일본 기상청 경로 + ECMWF 앙상블 폭). 계산이 아닙니다',
      en: '📋 Agency quote — Korea and Japan (KMA and JMA tracks + ECMWF ensemble spread). Not a computation',
    }),
    preview: PREVIEW_TYPHOON_SEA,
    questions: [
      { id: 'cyclone-track', ko: '이 태풍은 어디로 이동할까?', en: 'Where is this typhoon heading?', action: 'cyclone-track', status: SIM_STATUS.LIMITED,
        reasonKo: '이동 경로는 기관 공식 예보로 답합니다 — 우리가 만든 이동 계산은 아닙니다', reasonEn: 'The track is answered by official forecasts, not our own model' },
    ],
  },
  // ⚠️ 2026-09-20 §G-2 정정: available → limited. SGP4 전파는 ocean.wave 와 같은 줄에서 장면 표현으로
  //    분류돼 있다(MAPPING §0.1). 채점·검증·limits[] 가 없다. 궤도 표시는 그대로 열린다.
  'space.satellite': {
    menu: 'space',
    engine: 'satellite.js 6.0.2 SGP4 — Celestrak OMM 요소를 현재 순각으로 전파해 그리는 장면',
    engineRef: 'prototype/v2-three/js/sat-layer.js',
    status: SIM_STATUS.LIMITED,
    inputs: 'Celestrak 카탈로그(OMM 평균 궤도 요소)',
    outputs: '위성 위치(250ms 간격 전파) · 궤적 — 기록 남는 계산 아님',
    horizons: '현재 순간 전파 — 장래 궤적 일괄 계산은 아직',
    questions: [
      { id: 'satellite-track', ko: '이 위성은 어디로 이동할까?', en: 'Where is this satellite moving?', action: 'satellite-track', status: SIM_STATUS.LIMITED,
        reasonKo: '카탈로그 궤도 요소로 현재 위치를 전파해 그립니다 — 기록 남는 계산이 아닙니다', reasonEn: 'Propagates catalogue orbital elements to draw the current position — not a recorded computation' },
      { id: 'satellite-next', ko: '다음 위치는 어디일까?', en: 'Where will it be next?', action: 'satellite-track', status: SIM_STATUS.LIMITED,
        reasonKo: '카탈로그 궤도 요소로 현재 위치를 전파해 그립니다 — 기록 남는 계산이 아닙니다', reasonEn: 'Propagates catalogue orbital elements to draw the current position — not a recorded computation' },
    ],
  },
  'weather.precipitation': {
    menu: 'weather',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'precip-move', ko: '비가 어디로 이동할까?', en: 'Where will the rain move?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '이류 계산 엔진(prototype/js/earthus2/v02)이 있지만 화면 자료와 아직 연결되지 않았습니다', reasonEn: 'An advection engine exists in the canonical library but is not wired to screen data yet' },
      { id: 'precip-6h', ko: '6시간 뒤 어떻게 될까?', en: 'What about 6 hours from now?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '시간 미끄러짐은 공식 예보 프레임으로만 봅니다 — 우리가 만든 미래 값은 없습니다', reasonEn: 'Time playback uses official forecast frames — we do not manufacture future values' },
    ],
  },
  'ocean.surface_current': {
    menu: 'ocean',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'current-flow', ko: '해류는 어디로 흐를까?', en: 'Where do the currents flow?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '해류는 지금 값 화살표로만 보입니다 — 흐름 이동 계산은 아직입니다', reasonEn: 'Currents are shown as present-value arrows — flow propagation is not computed yet' },
    ],
  },
  'ocean.sst': {
    menu: 'ocean',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'sst-change', ko: '바닷물 온도는 어떻게 변할까?', en: 'How will sea temperature change?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '수온은 NOAA OISST 현재값·평년 차이만 있습니다 — 변화 계산은 아직입니다', reasonEn: 'Sea temperature shows NOAA OISST present values and anomaly — no change model yet' },
    ],
  },
  'ocean.coastal_inundation': {
    menu: 'ocean',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'flood-spread', ko: '이 침수는 어디까지 퍼질까?', en: 'How far will this flooding spread?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '침수 범위는 공식 재해지도로 보입니다 — 퍼짐 계산 엔진은 아직입니다', reasonEn: 'Inundation shows official hazard maps — no spreading model yet' },
    ],
  },
  'hazards.wildfire': {
    menu: 'hazards',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'fire-spread', ko: '불이 번지는 방향은 어디일까?', en: 'Which way will the fire spread?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '확산 계산 엔진이 아직 없습니다 — 연기 이동 추정(aws/atmos-transport-spike)은 공개 화면에 넣지 않았습니다', reasonEn: 'No spread engine yet; the smoke-transport estimate is not exposed on the public screen' },
    ],
  },
  'people.population': {
    menu: 'people',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'pop-move', ko: '사람들은 어디로 이동할까?', en: 'Where are people moving?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '인구 이동 계산 엔진이 아직 없습니다 — 인구 기둥은 WorldPop 격자를 실제로 세는 표시입니다', reasonEn: 'No migration engine yet; population pillars sum real WorldPop grids' },
    ],
  },
  'travel.visitor_pressure': {
    menu: 'travel',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'travel-flow', ko: '여행객이 늘면 어디가 달라질까?', en: 'Where changes if visitors increase?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '방문객 증가 계산 엔진이 아직 없습니다 — 공식 집계(한국관광공사)의 현재값만 있습니다', reasonEn: 'No visitor-growth engine yet; official KTO counts only' },
    ],
  },
  'land.terrain': {
    menu: 'land',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'terrain-change', ko: '이 지형은 시간이 지나면 어떻게 달라질까?', en: 'How will this terrain change over time?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '지형 변화 계산 엔진이 아직 없습니다 — 지형은 GEBCO·Copernicus 고도를 그대로 그립니다', reasonEn: 'No terrain-evolution engine yet; elevation is drawn as measured' },
    ],
  },
  // ── 2026-09-20 §G-2 등재 9건 (CROSSWALK §4-1) — 기존 현상, 엔진 없음 → 없는 이유를 말한다 ──
  'hazards.glacial_lake_flood': {
    menu: 'hazards',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    regions: Object.freeze({
      ko: '📋 기관 인용 — 미국 알래스카 주노 멘덴홀 강 한 곳(USGS 실측·NWS 예보). 다른 지역은 자료가 없고, 물길 계산은 어느 곳도 하지 않습니다',
      en: '📋 Agency quote — one site, Mendenhall River in Juneau, Alaska (USGS gauge, NWS forecast). No data elsewhere; outburst paths are computed nowhere',
    }),
    questions: [
      { id: 'glof-reach', ko: '빙하호가 터지면 물이 어디까지 갈까?', en: 'If a glacial lake bursts, how far will the water go?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '빙하호 붕괴 물길을 계산하는 검증된 엔진이 없습니다 — 호수마다 댐 형식이 달라 한 곳의 공식을 다른 곳에 쓸 수 없습니다. 기관 관측(호수 수위·하천 유량)은 있는 곳만 보여줍니다',
        reasonEn: 'No validated engine computes an outburst path — dam types differ per lake, so one lake\'s formula cannot be reused elsewhere. Agency gauge readings are shown only where they exist' },
    ],
  },
  'hazards.earthquake': {
    menu: 'hazards',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'eq-aftershock', ko: '여진은 얼마나 더 올까?', en: 'How many more aftershocks are expected?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '여진 기대수 계산은 채점 이력을 갖춘 뒤 공개합니다 — 지금은 기관 발표와 과거 기록만 있습니다',
        reasonEn: 'Aftershock expectations will be published after a scoring record exists — for now only agency reports and history' },
    ],
  },
  'land.snow_cover': {
    menu: 'land',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'snow-change', ko: '눈은 얼마나 더 쌓일까?', en: 'How much more snow will accumulate?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '적설 깊이 자료를 아직 받고 있지 않습니다(겨울 실자료 확인 전) — 적설 범위 관측만 있습니다',
        reasonEn: 'Snow depth is not collected yet (awaiting a winter data check) — only snow-extent observations' },
    ],
  },
  'ocean.sea_ice': {
    menu: 'ocean',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'seaice-move', ko: '해빙은 어떻게 움직일까?', en: 'How will the sea ice move?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '해빙 이동을 계산하는 엔진이 없습니다 — 기관 관측 면적과 평년 대비는 볼 수 있습니다',
        reasonEn: 'No engine computes sea-ice motion — agency-observed extent and its departure from normal are available' },
    ],
  },
  'ocean.sea_level_rise': {
    menu: 'ocean',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'slr-exposure', ko: '해수면이 오르면 어디가 잠길까?', en: 'Where floods if the sea rises?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '해수면 상승 자체는 기관 전망 인용입니다 — 침수 범위 노출 셈은 검증 뒤 공개합니다',
        reasonEn: 'Sea-level rise itself is quoted from agency projections — flood-exposure counts will follow validation' },
    ],
  },
  'ocean.subsurface_profile': {
    menu: 'ocean',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'argo-deep', ko: '깊은 바다의 물은 어디로 흐를까?', en: 'Where does the deep water flow?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '깊이별 해류 계산은 하지 않습니다 — 기관 관측(Argo)을 그대로 보여줍니다',
        reasonEn: 'We do not compute currents by depth — agency observations (Argo) are shown as they are' },
    ],
  },
  'weather.temperature': {
    menu: 'weather',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'temp-future', ko: '내일 기온은 어떻게 될까?', en: 'What will the temperature be tomorrow?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '기온 예보는 기관 발표를 인용합니다 — 우리가 만든 기온 계산은 없습니다',
        reasonEn: 'Temperature forecasts are quoted from agencies — we have no temperature model of our own' },
    ],
  },
  'weather.air_quality': {
    menu: 'weather',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'air-spread', ko: '미세먼지는 어디로 퍼질까?', en: 'Where will the fine dust spread?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '대기질 확산 계산은 하지 않습니다 — 측정소 관측값과 기관 예보를 보여줍니다',
        reasonEn: 'We do not compute air-quality dispersion — station observations and agency forecasts are shown' },
    ],
  },
  'weather.wind': {
    menu: 'weather',
    engine: null,
    engineRef: null,
    status: SIM_STATUS.NOT_AVAILABLE,
    inputs: null,
    outputs: null,
    horizons: null,
    questions: [
      { id: 'wind-future', ko: '바람은 앞으로 어떻게 불까?', en: 'How will the wind blow next?', status: SIM_STATUS.NOT_AVAILABLE,
        reasonKo: '바람장은 기관 수치예보를 그대로 그립니다 — 우리가 만든 바람 계산은 없습니다',
        reasonEn: 'The wind field draws agency numerical forecasts as they are — we have no wind model of our own' },
    ],
  },
};

// 레지스트리에 없는 현상은 질문 블록을 만들지 않는다 — 진입점이 능력보다 앞서면 거짓말이 된다.
export const simEntryFor = (phenomenonId) => (phenomenonId && SIM_CAPABILITIES[phenomenonId]) || null;

// 이 현상에 탭으로 여는 가정 장면이 있는가 (계약 §K-2 Preview). 능력(simulation)과 다르다.
export const previewSceneFor = (phenomenonId, tab = 'scenario') => {
  const p = simEntryFor(phenomenonId)?.preview;
  return p && p.tab === tab ? p : null;
};

// ── 국가 문맥 질문 (지시서 §5) ──────────────────────────────
// 탐색 메뉴를 거치지 않고 국가를 직접 클릭한 경로의 궁금한 점. 실제로 답할 수 있는
// 것(지점 실황 · 사건 피드)이 위로, 아직 계산이 없는 것(비 이동)은 이유와 함께 아래로.
// ctx.hasInput === false (클릭 좌표를 못 받았을 때)는 not_evaluable 로 내려간다.
export const COUNTRY_QUESTIONS = Object.freeze([
  {
    id: 'country-weather', ko: '이 나라의 지금 날씨는?', en: 'Weather here right now?',
    action: 'country-weather', status: SIM_STATUS.AVAILABLE,
  },
  {
    id: 'country-news', ko: '이 나라에서 무슨 일이 생겼나?', en: 'What just happened here?',
    action: 'country-news', status: SIM_STATUS.AVAILABLE,
  },
  {
    id: 'country-rain-move', ko: '비가 어디로 이동할까?', en: 'Where will the rain move?',
    status: SIM_STATUS.NOT_AVAILABLE,
    reasonKo: '이동 계산 엔진이 화면 자료와 아직 연결되지 않았습니다',
    reasonEn: 'The advection engine is not wired to screen data yet',
  },
]);

export const questionsForCountry = (i18n, ctx = null) => {
  const ko = !!(i18n && i18n.ko);
  return COUNTRY_QUESTIONS.map((q) => {
    let status = q.status;
    let reasonKo = q.reasonKo || null;
    let reasonEn = q.reasonEn || null;
    if (status === SIM_STATUS.AVAILABLE && ctx && ctx.hasInput === false) {
      status = SIM_STATUS.NOT_EVALUABLE;
      reasonKo = '먼저 지도에서 나라를 고르면 그 자리의 실제 값으로 답합니다';
      reasonEn = 'Pick a country on the globe first — its real values answer this';
    }
    return {
      id: q.id,
      action: q.action || null,
      text: ko ? q.ko : q.en,
      status,
      runnable: status === SIM_STATUS.AVAILABLE,
      reason: status === SIM_STATUS.AVAILABLE ? null
        : (ko ? (reasonKo || '아직 계산 엔진이 없습니다') : (reasonEn || 'No computation engine yet')),
    };
  });
};

// 누를 수 있는가 — available 이거나, limited 인데 실제 액션(장면·기관 예보로 가는 길)이 있을 때.
// ⚠️ limited 를 누를 수 없게 두면 §G-2 정정(파도·위성 available→limited)이 멀쩡한 장면 버튼을
//    '왜 없나' 버튼으로 바꿔 버린다. limited 는 누를 수 있되 한계 문장(reason)을 항상 같이 낸다.
export const pressable = (status, action) => !!action
  && (status === SIM_STATUS.AVAILABLE || status === SIM_STATUS.LIMITED);

// 컨텍스트가 주는 입력 상태(예: 바다 지점 선택 여부)에 따라 누를 수 있는 질문이
// not_evaluable 로 내려갈 수 있다. ctx: { hasInput: boolean } | null
export const questionsForPhenomenon = (phenomenonId, i18n, ctx = null) => {
  const entry = simEntryFor(phenomenonId);
  if (!entry) return [];
  const ko = !!(i18n && i18n.ko);
  return entry.questions.slice(0, 3).map((q) => {
    let status = q.status;
    let reasonKo = q.reasonKo || null;
    let reasonEn = q.reasonEn || null;
    if (pressable(status, q.action) && ctx && ctx.hasInput === false) {
      // 엔진은 있으나 입력(선택한 바다 지점 등)이 없다 — 누르면 입력 방법을 알려준다.
      status = SIM_STATUS.NOT_EVALUABLE;
      reasonKo = ctx.whyKo || '먼저 대상을 선택하면 계산에 쓸 실제 값을 조회합니다';
      reasonEn = ctx.whyEn || 'Select a target first — its real values feed the computation';
    }
    return {
      id: q.id,
      action: q.action || null,
      text: ko ? q.ko : q.en,
      status,
      runnable: pressable(status, q.action),
      reason: status === SIM_STATUS.AVAILABLE ? null
        : (ko ? (reasonKo || '아직 계산 엔진이 없습니다') : (reasonEn || 'No computation engine yet')),
    };
  });
};
