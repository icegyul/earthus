// EARTHUS — 현상 연결표 (INTELLIGENCE-LAYER-PLAN §2.3 · 계약 §C · 부록 IMPACT/RELATED)
//
// RELATED·IMPACT 는 **레지스트리에 있는 현상 사이의 연결**로만 만든다. 연결마다 근거가 하나 있다:
//   computed    우리 계산이 두 현상을 실제로 잇는다 (report-engine crossdomain rDetrended 판정,
//               또는 사건 패킷의 거리 판정) — evidenceRef 는 그 계산이 있는 파일
//   co_located  같은 자리·같은 때에 함께 관측된다 — 거리 기준과 그 판정 코드
//   reference   교과서 관계 — 이번 사건에서 계산한 연결이 아니다. 문헌을 반드시 단다
//
// ⚠️ 인과 문장을 쓰지 않는다(FORBIDDEN_CAUSAL — aws/_shared/contracts/intel-vocab.json).
//    '함께 나타났다'와 '그래서 생겼다'는 다르다.
// ⚠️ 자료 없는 연결(전력·농업·건강 등 도메인 밖 영향)은 넣지 않는다 — 물으면 not_available 로 이유를 말한다.
// ⚠️ 적게 두는 것이 맞다. 근거 파일이 없는 연결을 채워 넣으면 IMPACT 절이 소설이 된다.
//    계산된 연쇄는 오늘 지진→쓰나미 하나뿐이다(사다리 문서 §2).

export const RELATION = Object.freeze(['computed', 'co_located', 'reference']);

export const RELATIONS = Object.freeze([
  Object.freeze({
    from: 'hazards.earthquake', to: 'hazards.tsunami', relation: 'computed',
    evidenceRef: 'aws/tsunami-eta/handler.py',
    ruleKo: '바다 지진(M6.5 이상·진원 100 km 이하)마다 수심 격자에서 도달시간을 계산한다',
    ruleEn: 'Arrival times are computed on the depth grid for each sea quake (M6.5+, depth ≤100 km)',
  }),
  Object.freeze({
    from: 'hazards.typhoon', to: 'weather.warning', relation: 'co_located',
    evidenceRef: 'aws/cyclone-analog/handler.py',
    ruleKo: '태풍 중심이 한국 특보구역 350 km 안에 들면 같은 사건 패킷에 함께 적는다',
    ruleEn: 'Recorded together in the event packet when the storm centre is within 350 km of a Korean warning zone',
  }),
  Object.freeze({
    from: 'hazards.typhoon', to: 'ocean.sea_observation', relation: 'co_located',
    evidenceRef: 'aws/cyclone-analog/handler.py',
    ruleKo: '태풍 중심 800 km 안의 부이·지상 실측을 방위별로 센다(진로·세기 계산에는 쓰지 않는다)',
    ruleEn: 'Buoy and surface observations within 800 km of the centre are counted by sector (not used to compute track or intensity)',
  }),
  Object.freeze({
    from: 'hazards.typhoon', to: 'ocean.sst', relation: 'reference',
    citation: 'Gray, W. M. (1968). Global view of the origin of tropical disturbances and storms. Monthly Weather Review, 96(10), 669–700.',
    ruleKo: '교과서 관계 — 열대저기압은 대체로 해수면 온도 약 26.5 °C 이상인 바다에서 발달한다고 알려져 있다',
    ruleEn: 'Textbook relation — tropical cyclones are known to develop mostly over seas with surface temperature above about 26.5 °C',
  }),
]);

export const relationsFrom = (phenomenonId) => RELATIONS.filter((r) => r.from === phenomenonId);
export const relationsOf = (phenomenonId) => RELATIONS.filter((r) => r.from === phenomenonId || r.to === phenomenonId);
