// EARTHUS — 시뮬레이션 능력 레지스트리 + 추천 질문
//
// 질문 → 현상 → 연산 → 능력 → 엔진 → 검증 → 실행 → 결과 → 지구, 이 흐름의
// "질문이 무엇을 부를 수 있는가"를 한 곳에 모은 표다. 여러 파일에 if/else 로
// 흩어두면 가짜 시뮬레이션이 한 줄씩 새어 나온다 — 지시서 §16.
//
// 상태 규약 (지시서 §16·§26):
//   available      실제 계산 엔진이 있고 이 화면에서 부를 수 있다
//   limited        실제 자료로 답하지만 우리 시뮬레이션 엔진은 아니다(공식 경로 안내)
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

// sim 액션은 main.js onAction 의 'sim-q' 분기가 받는다. action 값과 분기 이름을
// 다르게 쓰면 연결이 조용히 끊긴다 — 시험이 두 파일을 대조한다.
export const SIM_CAPABILITIES = {
  'ocean.wave': {
    menu: 'ocean',
    engine: 'sim-ocean.Gerstner — 유의파고·너울·풍속을 입력값으로 쓰는 파도 물리',
    engineRef: 'prototype/v2-three/js/sim-ocean.js',
    status: SIM_STATUS.AVAILABLE,
    inputs: '해양 모델 지점값(파고·너울·풍속·풍향) + 그 지점의 실제 태양 고도',
    outputs: '파도 표면 운동(분산 관계 ω=√(g·k) · 급경사도 정규화 · 파크름)',
    horizons: '현재 값 기준 실시간 장면 — 시계열 예보 아님',
    questions: [
      { id: 'wave-motion', ko: '지금 이 바다는 어떻게 움직일까?', en: 'How is this sea moving right now?', action: 'wave-now', status: SIM_STATUS.AVAILABLE },
      { id: 'wave-typhoon', ko: '태풍이 오면 이 바다는 어떻게 변할까?', en: 'What if a typhoon arrives here?', action: 'wave-typhoon', status: SIM_STATUS.AVAILABLE },
    ],
  },
  'hazards.tsunami': {
    menu: 'hazards',
    engine: 'aws/tsunami-eta — 수심 격자에서 c=√(g·h) 다익스트라 도달시간',
    engineRef: 'aws/tsunami-eta/handler.py',
    status: SIM_STATUS.AVAILABLE,
    inputs: 'GEBCO 수심 격자 + USGS M6.5↑ · 진원 100km 이하 · 바다 지진 사건',
    outputs: '39개 해안 관측소 도달시간 · 30~720분 등시선',
    horizons: '사건별 단회 계산 — 계속 미끄러지는 예보가 아니다',
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
    questions: [
      { id: 'cyclone-track', ko: '이 태풍은 어디로 이동할까?', en: 'Where is this typhoon heading?', action: 'cyclone-track', status: SIM_STATUS.LIMITED,
        reasonKo: '이동 경로는 기관 공식 예보로 답합니다 — 우리가 만든 이동 계산은 아닙니다', reasonEn: 'The track is answered by official forecasts, not our own model' },
    ],
  },
  'space.satellite': {
    menu: 'space',
    engine: 'satellite.js 6.0.2 SGP4 — Celestrak OMM 요소를 현재 순각으로 전파',
    engineRef: 'prototype/v2-three/js/sat-layer.js',
    status: SIM_STATUS.AVAILABLE,
    inputs: 'Celestrak 카탈로그(OMM 평균 궤도 요소)',
    outputs: '위성 위치(250ms 간격 전파) · 궤적',
    horizons: '현재 순간 전파 — 장래 궤적 일괄 계산은 아직',
    questions: [
      { id: 'satellite-track', ko: '이 위성은 어디로 이동할까?', en: 'Where is this satellite moving?', action: 'satellite-track', status: SIM_STATUS.AVAILABLE },
      { id: 'satellite-next', ko: '다음 위치는 어디일까?', en: 'Where will it be next?', action: 'satellite-track', status: SIM_STATUS.AVAILABLE },
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
};

// 레지스트리에 없는 현상은 질문 블록을 만들지 않는다 — 진입점이 능력보다 앞서면 거짓말이 된다.
export const simEntryFor = (phenomenonId) => (phenomenonId && SIM_CAPABILITIES[phenomenonId]) || null;

// 컨텍스트가 주는 입력 상태(예: 바다 지점 선택 여부)에 따라 available 이
// not_evaluable 로 내려갈 수 있다. ctx: { hasInput: boolean } | null
export const questionsForPhenomenon = (phenomenonId, i18n, ctx = null) => {
  const entry = simEntryFor(phenomenonId);
  if (!entry) return [];
  const ko = !!(i18n && i18n.ko);
  return entry.questions.slice(0, 3).map((q) => {
    let status = q.status;
    let reasonKo = q.reasonKo || null;
    let reasonEn = q.reasonEn || null;
    if (status === SIM_STATUS.AVAILABLE && ctx && ctx.hasInput === false) {
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
      runnable: status === SIM_STATUS.AVAILABLE,
      reason: status === SIM_STATUS.AVAILABLE ? null
        : (ko ? (reasonKo || '아직 계산 엔진이 없습니다') : (reasonEn || 'No computation engine yet')),
    };
  });
};
