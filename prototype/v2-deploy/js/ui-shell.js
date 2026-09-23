// EARTHUS v2-three — 화면 문법 셸 (지시서 §19.12, §106.1)
// 좌측 레일(씬 메뉴) + 우측 EARTH INTELLIGENCE 패널(NOW/WHY/NEXT) + 하단 타임 스트립 + 라벨 엔진.
// 지구 렌더러(main.js)는 건드리지 않고 훅(hooks)으로만 연결한다.

import * as THREE from '../vendor/three-r184.module.min.js';
import { i18n } from './i18n.js?v=11';
import { renderBadge, layerBadge } from './engine-bridge.js?v=16';
// PHASE 2 STEP 2.4 — 질문을 복합키(scene/layer)로 찾는다. bare id 조회를 새로 만들지 않는다.
// menu-guide.js 의 MENU_QUESTIONS 는 지우지 않았다 — tools/build_information_inventory.mjs 가
// 아직 읽고, 레지스트리의 질문이 거기서 왔다. 다만 화면은 이제 레지스트리만 본다.
// (bare id 조회였기 때문에 hobby/surf 가 ocean/surf 의 질문을 그대로 표시하고 있었다.)
import { questionForLayer, phenomenonForLayer, LAYER_PHENOMENON, reportKindsForPhenomenon, PHENOMENA, representativeLayerFor, MENU_GROUPS, EARTHUS_MENU_GROUPS } from './phenomenon-registry.js?v=6';
// 2026-09-13 아이콘 시스템 — 표는 v1·v2 공용 모듈 하나뿐이다(지시서 §13).
// ⚠️ 번들에서는 tools/build-v2-bundle.sh 가 이 경로를 ./earthus-icons.js 로 고쳐 쓰고
//    모듈을 번들의 js/ 바로 아래에 둔다(그래야 모듈이 그림을 번들 안에서 찾는다).
import { iconForPhenomenon, iconSrc, iconSrcSet, groupIconSrc, groupIconSrcSet } from './earthus-icons.js?v=2';
import { menuCoverage, menuTime, canClearLayer, matchesMenu } from './information-contract.js';
// PHASE 8 §13 — 리포트 센터. 보고서 렌더링은 그쪽 모듈이 한다. 여기서 문장을 만들지 않는다.
import { reportDocHtml, reportKey, reportIndexKey, reportUrl, reportIdFromUrl, currentTier, DATA_LABEL_TEXT } from './report-center.js?v=3';
// 지시서 §8·§16 — 궁금한 점(추천 질문)은 시뮬레이션 능력 레지스트리가 정한다.
// 없는 엔진의 질문 버튼은 여기서도 만들지 않는다. 다만 '왜 없는지'를 말하는 버튼은
// pop-metric-menu 의 선례처럼 둔다 — 조용히 아무 말도 하지 않는 게 더 큰 거짓말이다.
import { simEntryFor, questionsForPhenomenon, questionsForCountry, previewSceneFor } from './sim-questions.js?v=2';
import { intelStripHtml, intelOf } from './intel-strip.js?v=2';
const safeText = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---------------------------------------------------------------------------
// 씬 매니페스트 (§19.3, §72): 메뉴 하나 = 씬 프로파일 하나. 주 엔진은 항상 1개.
// ---------------------------------------------------------------------------

// 씬 = 도메인 프로파일 (v5.3 §19.12 도메인 액센트) · 레이어 = 1.0 전체 메뉴의 판단 이식.
// state: 연결됨(LIVE/OBSERVED/MODEL_SIGNAL/SIMULATION_ONLY/DEMO) 또는 LOCKED(준비 중 — 출처·계획 명시)
export const SCENES = [
  {
    id: 'land',
    label: '지형',
    glyph: '지',
    accent: '#7FB7F5',
    layers: [
      { id: 'terrain', name: '실지형 3D', state: 'LIVE', src: 'AWS Terrarium', act: true },
      { id: 'satdetail', name: '위성 표면 (줌인)', state: 'LIVE', src: 'Esri World Imagery', act: true },
      { id: 'snow', name: '눈·얼음 덮임', state: 'OBSERVED', src: 'MODIS NDSI', act: true },
      { id: 'seaice', name: '해빙 농도 (극지)', state: 'OBSERVED', src: 'GHRSST L4 MUR · NASA GIBS', act: true },
      { id: 'lst', name: '지표온도 (위성 관측)', state: 'OBSERVED', src: 'MODIS Terra LST · NASA GIBS', act: true },
      // 나라를 이름에 적지 않는다 — 늘어날 때마다 메뉴가 실제와 어긋난다. 목록은 카드가 낸다.
      { id: 'forest', name: '산림 피복 릴리프 (나무가 덮은 비율)', state: 'OBSERVED', src: 'ESA WorldCover 10m', act: true },
      { id: 'forestloss', name: '산림 감소 2001~2023 (한국)', state: 'OBSERVED', src: 'Hansen GFC v1.11 · UMD', act: true },
      { id: 'locate', name: '내 위치로 이동', state: 'LIVE', src: 'GPS', act: true },
      { id: 'globe', name: '전지구 보기', state: 'LIVE', src: '—', act: true },
      { id: 'base-ne2', name: '베이스 · 자연 지형', state: 'LIVE', src: 'Natural Earth II', act: true },
      { id: 'base-bluemarble', name: '베이스 · 블루마블 (지형·수심)', state: 'OBSERVED', src: 'NASA GIBS', act: true },
      { id: 'base-truecolor', name: '베이스 · 오늘의 지구 (실촬영)', state: 'OBSERVED', src: 'VIIRS True Color', act: true },
      { id: 'base-night', name: '베이스 · 밤의 불빛', state: 'OBSERVED', src: 'NASA Black Marble · 합성 배경', act: true },
    ],
  },
  {
    id: 'weather',
    label: '날씨',
    glyph: '날',
    accent: '#9FB9FF',
    layers: [
      { id: 'cloud-off', name: '구름 끄기', state: 'LIVE', src: '—', act: true },
      { id: 'radar', name: '레이더 강수 (지금 내리는 비)', state: 'OBSERVED', src: 'KMA HSR 합성영상 · 5분', act: true },
      // 2026-09-20 W4: 'Open-Meteo 격자 5°' 한 시각의 그라데이션이었다. 같은 id 가 이제 GFS 강수율 프레임의 구간색이다 — 출처를 사실대로.
      // 2026-09-20 E2: 카드에 기간 칩(현재 강우 | 3시간 | 24시간)이 생겼다 — 메뉴가 그 자리에서 무엇을 볼 수 있는지 말한다.
      { id: 'raingrid', name: '전지구 강수', state: 'MODEL', src: 'NOAA GFS 0.5° · 강수율 mm/h · 3·24시간 누적 mm · 5일 예보 · 3시간 간격', act: true },
      { id: 'tempgrid', name: '전지구 기온', state: 'MODEL', src: 'NOAA GFS 0.5° · 5일 예보 · 3시간 간격', act: true },
      { id: 'presgrid', name: '전지구 기압', state: 'MODEL', src: 'NOAA GFS 0.5° · 해면기압 · 5일 예보 · 3시간 간격', act: true },
      { id: 'windgrid', name: '전지구 풍속', state: 'MODEL', src: 'NOAA GFS 0.5° · 10 m · 5일 예보 · 3시간 간격', act: true },
      // 2026-09-20 작업 D3 — 네 줄(대기질·수온·편차·파고)이 W1 셰이더 색면으로 옮겨졌다. 격자 크기와 '한 시각'을 사실대로 적는다:
      // 매끈하게 보간했다고 해상도가 오르는 것이 아니고, 이 자료들은 5일 예보가 아니라 현재 시각 한 장이다.
      { id: 'pm25grid', name: '전지구 초미세먼지', state: 'MODEL', src: 'CAMS 격자 5°(약 555 km) · 현재 시각 · Open-Meteo 경유', act: true },
      { id: 'uvgrid', name: '전지구 자외선', state: 'MODEL', src: 'CAMS 격자 5°', act: true },
      { id: 'warnworld', name: '미국 기상 특보', state: 'OFFICIAL_FORECAST', src: 'NWS api.weather.gov', act: true },
      { id: 'cloud-obs', name: '구름 실황 (전지구)', state: 'OBSERVED', src: 'NOAA GMGSI', act: true },
      { id: 'cloud-gk2a', name: '구름 천리안 (10분)', state: 'OBSERVED', src: 'GK2A AMI', act: true },
      { id: 'cloud-ea', name: '구름 천리안 · 동아시아 2km', state: 'OBSERVED', src: 'GK2A IR 11.2µm EA', act: true },
      { id: 'cloud-fog', name: '밤 낮은구름·안개 (밤 전용)', state: 'OBSERVED', src: 'GK2A BTD 야간 채널', act: true },
      { id: 'cloud-wv', name: '상층 수증기 — 제트기류의 흐름', state: 'OBSERVED', src: 'GK2A 수증기 6.3µm', act: true },
      { id: 'mysky', name: '내 하늘 — 지금 구름 있나?', state: 'OBSERVED', src: 'GK2A 10분 · GPS', act: true },
      { id: 'cloud-gfs', name: '비·눈·태풍 5일 예보 ▶', state: 'MODEL_SIGNAL', src: 'GFS·Open-Meteo', act: true },
      { id: 'cloud-vol', name: '구름 3D 볼륨 (동아시아)', state: 'MODEL_SIGNAL', src: 'GFS 복셀 95×69×32', act: true },
      { id: 'tempanom', name: '지금 평년보다 몇 도 (전국)', state: 'DERIVED', src: 'KMA 실황 − 1991~2020 평년', act: true },
      // 2026-09-20 W3: '바람 관측 (지상 3천 개소)' · OBSERVED · KMA AWS·GTS 였다(관측소 막대기). 같은 id 가 이제 전지구 입자 흐름이고
      // 자료는 모델이다 — 이름·상태·출처를 사실대로 고친다. 지상 관측은 바로 아래 '일기도 기입 모형'에 그대로 있다.
      { id: 'wind', name: '바람 흐름 (전지구 입자 · 5일 예보)', state: 'MODEL', src: 'NOAA GFS 0.5° · 10 m · 5일 예보', act: true },
      { id: 'synop', name: '일기도 기입 모형 (표준 기호)', state: 'OBSERVED', src: 'KMA AWS · GTS SYNOP', act: true },
      { id: 'airq', name: '대기질 (에어코리아)', state: 'OBSERVED', src: '한국환경공단', act: true },
      { id: 'warn', name: '기상 특보 (실황)', state: 'OFFICIAL_FORECAST', src: 'KMA 특보 · 1.0 S3', act: true },
    ],
  },
  {
    id: 'ocean',
    label: '해양',
    glyph: '해',
    accent: '#5FD3C0',
    layers: [
      // 2026-09-20 W2: 브라우저가 지점마다 marine-api 를 직접 부르던 것을 걷어냈다. 이제 같은 자료를 우리 격자에서 읽는다 — 출처를 사실대로.
      { id: 'marine', name: '해양 격자 · 파도와 바람', state: 'MODEL_SIGNAL', src: 'Open-Meteo Marine 경유 · 0.5°(동아시아)/5° 격자 · 현재 시각 · 바람은 GFS 0.5° 프레임', act: true },
      { id: 'oceanfocus', name: '해양 포커스', state: 'DERIVED', src: '선택 해역 · 연결된 해양 자료', act: true },
      { id: 'typhoonsim', name: '태풍 해상 가정 장면', state: 'DEMO', src: '해양 모델 입력 · 장면 표현(기록 남는 계산 아님)', act: true },
      { id: 'buoys', name: '해양 부이 관측 (수온)', state: 'OBSERVED', src: 'NDBC 등 · 1.0 S3', act: true },
      { id: 'argo', name: 'Argo 플로트 — 잠수 기록', state: 'OBSERVED', src: 'Argo · Ifremer ERDDAP', act: true },
      { id: 'kmasea', name: '해상 관측망 (파고·수온 193지점)', state: 'OBSERVED', src: '기상청 해양관측', act: true },
      { id: 'sstfield', name: '해수면 온도 (전지구)', state: 'OBSERVED', src: 'NOAA OISST v2.1 · 1° 격자(약 110 km) · 하루치 관측', act: true },
      { id: 'sstanom', name: '수온 아노말리 (평년 대비)', state: 'OBSERVED', src: 'OISST − 1991~2020 평년 · 동아시아 0.5° 격자', act: true },
      /* 2026-09-07 지시 §13: 장기 기후 시나리오는 지금 예보와 섞어 보여주지 않는다.
         longterm 플래그만 얹는다 — LiveLayers 렌더 경로(main.js LIVE_LAYER_KEYS)는 그대로
         'ocean/…' 로 남으므로 데이터·계산은 안 건드리고 화면에만 소제목을 가른다. */
      { id: 'slr', name: '해수면 상승 전망 (전 세계 조위관측소)', state: 'MODEL_SIGNAL', src: 'IPCC AR6 · NASA', act: true, longterm: true },
      { id: 'khoasl126', name: '우리 바다 해수면 전망 · SSP1-2.6 저배출', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      { id: 'khoasl245', name: '우리 바다 해수면 전망 · SSP2-4.5 중간', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      { id: 'khoasl370', name: '우리 바다 해수면 전망 · SSP3-7.0 고배출', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      { id: 'khoasl585', name: '우리 바다 해수면 전망 · SSP5-8.5 최고', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      /* '연안 침수 범위'는 **언제의** 침수인지 안 적었다 — 지금 침수도, 이번 태풍 예보도 아니고
         기관이 미리 계산해 둔 가정 상황의 예상도다. 이름이 그 사실을 담는다(2026-09-20 W6). */
      { id: 'khoaflood', name: '연안 침수 예상도 — 가정 상황 (시군구별)', state: 'MODEL_SIGNAL', src: '국립해양조사원 · 사전 산출 침수 예상도(실시간·예보 아님)', act: true, longterm: true },
      { id: 'wavefield', name: '유의파고 (전지구)', state: 'MODEL_SIGNAL', src: 'Open-Meteo Marine 경유 · 5° 격자(약 555 km) · 현재 시각', act: true },
      { id: 'current', name: '표층 해류', state: 'MODEL_SIGNAL', src: 'Open-Meteo Marine', act: true },
      { id: 'surf', name: '해변 271곳·낚시 946곳', state: 'OBSERVED', src: 'OpenStreetMap ODbL', act: true },
      { id: 'isobath', name: '해저 등심선 (등고선)', state: 'OBSERVED', src: 'AWS Terrarium 고도맵', act: true },
      { id: 'trenches', name: '해구 위치 28곳', state: 'OBSERVED', src: 'GEBCO SCUFN 가제티어', act: true },
      { id: 'vessel', name: '선박', state: 'LOCKED', src: 'KOMSA MTIS', plan: '1.0과 동일: AIS 재배포 안 함(정책). 항로 표현은 검색창의 구간 입력으로 대신합니다' },
    ],
  },
  {
    id: 'people',
    label: '사람',
    glyph: '사',
    accent: '#EC7AA6',
    layers: [
      { id: 'seoul', name: '서울 실시간 인구 121곳', state: 'OBSERVED', src: '서울시 실시간 도시데이터', act: true },
      // 위(서울 실시간)는 관측, 아래(도시 타워)는 거주 인구 추정이다. 붙여 두되 배지로 가른다.
      { id: 'poptower', name: '도시 인구 타워 — 서울·도쿄·타이베이·런던 (거주)', state: 'MODEL_SIGNAL', src: 'WorldPop 100m R2025A', act: true },
      { id: 'sculpt', name: '인구 데이터 조각 — 국가를 누르세요', state: 'MODEL_SIGNAL', src: 'WorldPop 1km 인구 추정', act: true },
      { id: 'livemix', name: '지금 사람 × 거주 인구 (서울)', state: 'DERIVED', src: '서울시 실시간 + WorldPop 추정', act: true },
      { id: 'pop', name: '국가 인구 (전 세계 총계)', state: 'OBSERVED', src: 'World Bank SP.POP.TOTL', act: true },
      { id: 'news', name: '지역 뉴스 (지금)', state: 'LIVE', src: '각 지역 매체 RSS', act: true },
      { id: 'travel', name: '여행·관광 POI', state: 'LOCKED', src: 'Overpass API', plan: '공용 서버 응답 불안정(504) — 자체 프록시/캐시 후 연결' },
      { id: 'flight', name: '항공편 추적', state: 'LOCKED', src: 'adsb.lol', plan: 'API는 정상이나 CORS 헤더 없음 — Lambda 프록시 필요. 그동안은 검색창에 «인천 > 나리타 > 로스앤젤레스»처럼 구간을 넣으면 대권 경로와 공항 날씨를 봅니다(추적 아님)' },
    ],
  },
  {
    // 여행 — 한국관광 데이터랩 출품 모듈(TRAVEL DISCOVERY). 유명한 곳 검색이 아니라
    // 오늘 갈 곳을 데이터로 발견한다. KTO 데이터에서 유도한 후보는 EARTHUS DISCOVERY 로만 표기.
    id: 'travel',
    label: '여행',
    glyph: '여',
    accent: '#F2A2C4',
    layers: [
      { id: 'discover', name: '오늘 발견 — 시군구 228곳', state: 'DERIVED', src: 'KTO 데이터랩 5종 + 기상청·에어코리아', act: true },
      { id: 'bf', name: '무장애 여행지 목록', state: 'OFFICIAL_INFORMATION', src: 'KTO 무장애 여행 정보', act: true },
      { id: 'wl', name: '웰니스 관광지 목록', state: 'OFFICIAL_INFORMATION', src: 'KTO 웰니스관광정보', act: true },
      { id: 'en', name: '외국인 · 영문 관광정보', state: 'OFFICIAL_INFORMATION', src: 'KTO 영문 관광정보', act: true },
      { id: 'visitors', name: '방문자 스냅샷 (이동통신 · 관광객 아님)', state: 'HISTORY', src: 'KTO 지역별 방문자수', act: true },
      { id: 'related', name: '하나 더 — 연관 관광지 그래프', state: 'HISTORY', src: 'KTO 관광지별 연관 관광지 (TMAP 이동)', act: true },
    ],
  },
  /* ── LAB · 취미 — 1.0(Cesium) 에서 옮겨온 두 묶음 (2026-09-06 받은 지시: v1 에서 숨기고 v2 로).
     실제 화면은 js/ext/<이름>.js 모듈이고 js/ext-scene.js 가 켜고 끈다. 하나만 켜진다.
     ⚠️ 여기 id 를 바꾸면 ext-scene.js 의 MODULES 표도 같이 바꿔야 한다. */
  {
    id: 'lab',
    label: 'LAB',
    glyph: 'L',
    accent: '#8fd3c7',
    layers: [
      { id: 'today', name: '오늘의 지구 — 지금 가장 눈에 띄는 9곳', state: 'OBSERVED', src: '1.0 S3 격자 · NASA GIBS', act: true },
      { id: 'charts', name: '자료 그래프 — 해수온·해빙·기온 시계열', state: 'OBSERVED', src: '1.0 S3 series', act: true },
      { id: 'reports', name: '분석 보고서 — 태풍·현상 계산기 결과', state: 'DERIVED', src: '1.0 LAB 보고서 색인', act: true },
      { id: 'crust', name: '땅의 움직임 — 한국·일본 GNSS 속도', state: 'OBSERVED', src: 'UNR MIDAS · 1.0 S3', act: true },
      { id: 'requests', name: '개발 요청 — 제안하고 투표', state: 'LIVE', src: 'EARTHUS 회원 서버', act: true },
    ],
  },
  {
    id: 'hobby',
    label: '취미',
    glyph: '취',
    accent: '#65d6e7',
    layers: [
      { id: 'surf', name: '서핑 — 내린 화면(바다를 직접 누르세요)', state: 'UNAVAILABLE', src: '우리 격자에 너울 방향·풍파·물때가 없어 내렸습니다 — ext-scene.js WITHDRAWN', act: true },
      { id: 'fishing', name: '낚시 — 내린 화면(바다를 직접 누르세요)', state: 'UNAVAILABLE', src: '만조·간조 예측이 어디에도 없어 내렸습니다 — ext-scene.js WITHDRAWN', act: true },
      { id: 'vessel', name: '선박 — 공식 실시간 위치 · 여객선 운항', state: 'OFFICIAL_INFORMATION', src: '해양교통안전정보시스템(MTIS)', act: true },
      { id: 'dive', name: 'Dive · 심해 — GEBCO 수심 기둥과 심해 생물', state: 'DERIVED', src: 'GEBCO 2026 · OBIS', act: true },
      { id: 'trench', name: '해구 — 지구의 가장 깊은 바다', state: 'OBSERVED', src: 'GEBCO 2026 · SCUFN', act: true },
      { id: 'turtle', name: '바다거북 — 방류된 거북이 지나간 길', state: 'HISTORY', src: '국립해양생물자원관 · 공공저작물 제4유형', act: true },
      { id: 'seabird', name: '바닷새 — 조사한 해에 어디서 몇 마리를 셌나', state: 'HISTORY', src: '국립생물자원관', act: true },
      { id: 'migbird', name: '철새 — 봄에 우리 동네 새가 어디로 갔나', state: 'HISTORY', src: '농림축산검역본부 · 공공누리', act: true },
      { id: 'ecobird', name: '전국 조류 조사 — 어느 5km 칸에 기록이 있나', state: 'HISTORY', src: '국립생태원 EcoBank · data.go.kr', act: true },
      { id: 'para', name: '패러글라이딩 — 내린 화면', state: 'UNAVAILABLE', src: '저층 운량·시정·CAPE 가 우리 프레임에 없어 내렸습니다 — ext-scene.js WITHDRAWN', act: true },
      { id: 'mountain', name: '산 — 정상은 여기보다 얼마나 추운가', state: 'OFFICIAL_FORECAST', src: '기상청 산악예보 · AWS · 등산로 104봉', act: true },
    ],
  },
  {
    id: 'hazards',
    label: '재해',
    glyph: '재',
    accent: '#FFB36A',
    layers: [
      { id: 'feed', name: '지구 사건 피드', state: 'LIVE', src: 'GDACS·USGS', act: true },
      { id: 'eq', name: '지진 실황 (M4.5+)', state: 'OBSERVED', src: 'USGS', act: true },
      { id: 'eqhistory', name: '지진 25년 — 판 경계가 드러난다', state: 'OBSERVED', src: 'USGS ComCat 2001~오늘 · 18만건', act: true },
      { id: 'eqdepth', name: '지진 깊이 — 지구 속 섭입대', state: 'OBSERVED', src: '같은 카탈로그를 실제 진원 깊이에 배치', act: true },
      { id: 'plates', name: '판 경계선 겹쳐보기', state: 'OBSERVED', src: 'Bird 2003 PB2002 · ODC-BY', act: true },
      { id: 'crustal', name: '지각 이동 속도 (GNSS 실측)', state: 'OBSERVED', src: 'UNR MIDAS · 1,352점', act: true },
      { id: 'tc', name: '태풍 사건 (GDACS)', state: 'LIVE', src: 'GDACS', act: true },
      { id: 'tyoff', name: '태풍 공식 트랙', state: 'OFFICIAL_FORECAST', src: 'KMA·JMA·NHC', act: true },
      { id: 'tyens', name: '태풍 앙상블 — 예보가 갈리는 폭', state: 'MODEL_SIGNAL', src: 'ECMWF IFS ENS · CC-BY', act: true },
      { id: 'tyanalog', name: '태풍 과거 유사 경로 (예보 아님)', state: 'DERIVED', src: '1980~ 아날로그 통계', act: true },
      { id: 'tsunami', name: '쓰나미 발표 기록', state: 'OFFICIAL_WARNING', src: 'PTWC·NWS · 발표별 유효 상태', act: true },
      { id: 'fireglobal', name: '전지구 산불 화점 (24시간)', state: 'OBSERVED', src: 'NASA FIRMS VIIRS 375m', act: true },
      { id: 'wildfire', name: '산불 위험지수 (전국)', state: 'OFFICIAL_FORECAST', src: '산림청 · 1.0 S3', act: true },
      { id: 'lightning', name: '낙뢰 (최근 60분)', state: 'OBSERVED', src: 'KMA 낙뢰관측망', act: true },
      { id: 'glof', name: '빙하호 홍수 (GLOF)', state: 'LOCKED', src: '기관 관측(호수 수위·하천 유량)', plan: '물길 계산 엔진 없음 — 호수마다 댐 형식이 달라 검증 전에는 계산하지 않는다' },
    ],
  },
  {
    id: 'space',
    label: '우주',
    glyph: 'Λ',
    group: 'aetherus',
    brand: 'AETHERUS',
    accent: '#B79AEC',
    layers: [
      { id: 'sats', name: '위성 추적 (정거장·기상·과학·항법)', state: 'LIVE', src: 'CelesTrak · SGP4', act: true },
      { id: 'starlink', name: '스타링크', state: 'LIVE', src: 'CelesTrak · SGP4', act: true },
      /* 출처 줄이 'AETHERUS API · 서버 SGP4' 였다. 운영에는 상시 API 서버가 없다 — 수동으로 발행한
         정적 스냅샷(/aetherus/*.json)을 읽고, 자리는 그 궤도요소로 브라우저가 직접 SGP4 를 푼다
         (prototype/js/aetherus/core.js). 없는 서버를 출처로 적고 있었다(2026-09-20). */
      { id: 'aeth-orbit', name: '궤도 인텔리전스 (우주쓰레기·정본 카탈로그·근접사건)', state: 'LIVE', src: '발행 스냅샷 · 브라우저 SGP4', act: true },
      { id: 'aurora', name: '오로라 예보 (지금 보이는 곳)', state: 'OFFICIAL_FORECAST', src: 'NOAA SWPC OVATION', act: true },
      { id: 'launch', name: '발사 일정 (세계 로켓)', state: 'OFFICIAL_FORECAST', src: 'TheSpaceDevs LL2', act: true },
      { id: 'solaract', name: '오늘의 태양 (실황 관측)', state: 'OBSERVED', src: 'NASA SDO · NOAA SWPC X선', act: true },
      { id: 'solar', name: '오늘의 태양계', state: 'DERIVED', src: 'NASA/JPL 근사 궤도요소', act: true },
      { id: 'photos', name: '우주 사진관 59점 (하늘 위치)', state: 'OBSERVED', src: 'HST·JWST 공식 공개', act: true },
      { id: 'galaxy', name: '우리은하 — 우리는 어디 있나', state: 'DERIVED', src: '구조 수치 NASA/ESA · 별 배치는 재구성', act: true },
    ],
  },
];

// Truth Class 배지 (v5.3 P8): 관측/공식예보/모델/시뮬레이션을 시각·의미적으로 분리.
// 값 조작 금지, 0 대체 금지, 데이터 없으면 INSUFFICIENT_DATA.
// 어휘의 출처는 이제 정본이다 — core/constants.js의 EVIDENCE_KIND × DATA_STATE.
// 셸이 손으로 적어두던 표는 engine-bridge.renderBadge()로 옮겼고, 여기는 호출부 호환용
// 얇은 껍데기만 남긴다. 신선도까지 반영한 배지는 engine-bridge.layerBadge(key)를 쓴다.
export const dataBadge = (state, extra) => renderBadge(state, extra);

// 미오픈 국가 준비도 (§67.1) — 오픈 국가만 LIVE, 그 외 정직한 준비 상태.
// PD 가 정한 대상 다섯 나라다: 한국·일본·대만·영국·미국. 대만이 빠져 있었다.
const OPEN_COUNTRIES = new Set(['KOR', 'JPN', 'TWN', 'GBR', 'USA']);

// 시장 우선순위 — PD 지시: "메뉴를 만들면 항상 한국 먼저야."
// 목록을 만들 때마다 손으로 정렬하지 않도록 여기 한 곳에 둔다.
export const MARKET_ORDER = ['KOR', 'JPN', 'TWN', 'GBR', 'USA'];
export const byMarket = (a, b) => {
  const ia = MARKET_ORDER.indexOf(a);
  const ib = MARKET_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
};

export function initShell(hooks) {
  // hooks: { onScene(id), getNow() -> html, camera, getFocusSel(), labelData() -> [{nameKo,lat,lon,rank}] }
  const root = document.body;
  if(!document.getElementById('information-access-style')){const css=document.createElement('link');css.id='information-access-style';css.rel='stylesheet';css.href=new URL('./information-access.css?v=20260923-uxfix',import.meta.url).href;document.head.append(css);}
  /* 2026-09-23 PD "v2 메뉴 오른쪽 숫자 안 보이게 하고 디자인을 v1 처럼" — **세 번째** 요청이었다. 09-14 에 index.html 을 V1 규격으로
     맞췄지만 information-access.css(마지막에 로드)가 .mp-item 을 72px·15px !important 로, 묶음 제목에 개수와 '＋'를 다시 얹어
     화면은 그대로였다. 메뉴의 **모양**만 맡는 파일을 그 뒤에 읽혀 V1 오른쪽 레이어 판 실측(줄 7·10px 여백·아이콘 42px·이름 13px/500·
     설명 한 줄)으로 되돌린다. ⚠️ 이 파일보다 뒤에 메뉴 모양을 적는 파일을 만들지 말 것 — 같은 일이 네 번째로 난다. */
  if(!document.getElementById('menu-v1look-style')){const css=document.createElement('link');css.id='menu-v1look-style';css.rel='stylesheet';css.href=new URL('./menu-v1look.css?v=1',import.meta.url).href;document.head.append(css);}

  // --- 1.0식 브랜드 메뉴 (PD 지시): 좌측 가장자리 세로 손잡이 + 슬라이드 패널 ---
  // EARTHUS와 AETHERUS는 서로의 카테고리가 아니다 — 각자 독립 손잡이 (1.0 원칙).
  // 도메인(지형~재해)은 패널 안의 섹션으로: 섹션 도트 = §19.12 도메인 액센트.
  const tabE = document.createElement('button');
  tabE.id = 'brand-tab-e';
  tabE.className = 'edge-tab';
  tabE.innerHTML = '<span>EARTHUS</span>';
  const tabA = document.createElement('button');
  tabA.id = 'brand-tab-a';
  tabA.className = 'edge-tab aeth';
  tabA.innerHTML = '<span>AETHERUS</span>';
  root.appendChild(tabE);
  root.appendChild(tabA);

  const panel = document.createElement('div');
  panel.id = 'menu-panel';
  root.appendChild(panel);
  let openBrand = null; // 'earthus' | 'aetherus' | null
  // 하단바 '우주' 칸으로 서랍을 열었을 때만 켜는 표시 — 같은 AETHERUS 서랍이라도
  // 왼쪽 가장자리 탭으로 열었으면 우주 불을 켜지 않는다(들어온 문이 다르다).
  let spaceDoor = false;
  /* 메뉴 안 검색 칸(menuQuery)은 2026-09-20 에 없앴다 — PD: "질문검색을 메뉴에서 삭제해 ·
     v1 의 오른쪽 상단 버튼처럼". 찾기와 묻기는 상단 돋보기(⌕) 하나가 한다(findTopics 참고).
     '켜진 자료만' 은 검색이 아니라 거르개라 메뉴에 남는다. */
  let activeOnly = false;
  /* 2026-09-23 PD "우주 카테고리를 보여줄 필요 없지 aetherus 메뉴 바로 보여줘 몇개도 안되는대" — 서랍에 묶음이 하나뿐이면
     (AETHERUS = 우주 하나) 묶음 제목 줄 없이 현상 줄을 바로 깐다. openPanel 이 그리기 직전에 정한다. */
  let flatMenu = false;
  let selectedMenu = null;

  /* ── PHASE 2 STEP 2.5~2.8 — 선택 문맥과 능력 게이팅 ─────────────────────────
     지침서: "메뉴 구조 최종 변경보다 정확한 context plumbing 이 우선이다."
     그래서 여기서는 패널을 다시 짓지 않는다. 무엇이 선택됐는지 밖에서 읽을 수 있게 하고,
     선택된 현상이 갖지 못한 능력의 버튼을 숨기는 것까지만 한다. */

  const getSelection = () => (selectedMenu
    ? { scene: selectedMenu.s.id, layer: selectedMenu.l.id, key: `${selectedMenu.s.id}/${selectedMenu.l.id}` }
    : null);

  // 선택된 레이어가 속한 현상과 그 능력. 선택이 없거나 현상이 아닌 항목(배경·조작)이면 null.
  const getPhenomenonContext = () => {
    if (!selectedMenu) return null;
    const { s, l } = selectedMenu;
    const p = phenomenonForLayer(s.id, l.id);
    if (!p) return null;
    const hit = LAYER_PHENOMENON[`${s.id}/${l.id}`];
    return {
      phenomenonId: hit && hit.phenomenon ? hit.phenomenon : null,
      layerKey: `${s.id}/${l.id}`,
      sceneId: s.id,
      layerId: l.id,
      domain: p.domain,
      label: p.label,
      question: p.question,
      capabilities: p.capabilities,
      availability: p.availability,
      evidenceProfile: p.evidenceProfile,
      scope: p.scope,
      temporalMode: p.temporalMode,
    };
  };

  // 능력이 없는 행동은 노출하지 않는다(지침서 STEP 2.6).
  // "준비 중"으로 위장하지 않는다 — 없으면 없는 것이다.
  // 선택이 없을 때는 기존 전역 동작 그대로 둔다. 이 단계는 문맥 배선이지 디자인 개편이 아니다.
  /* 하단 메뉴가 만들어지면 여기에 담긴다. `const bottomNav` 를 직접 쓰면 셸 조립
     도중(applyCapabilityGating)에 TDZ 로 죽고, document.querySelector 로 찾으면
     아직 root 에 붙지 않아 못 찾는다. 그 사이를 이 참조가 잇는다. */
  let navRoot = null;
  const CAP_TAB = { scenario: 'simulation', next: 'forecast', history: 'history' };
  /* (2026-09-24 정정) PD "인텔리전스 창에 뜨는 메뉴들 아직도 떠 모두 하나로 통합해줘" — 탭 단추가 없어졌다(아래 intel 템플릿).
     능력 표는 그대로 읽되, 단추를 숨기는 대신 **한 장 시트의 절**이 이 값을 읽어 내용 또는 이유 한 줄을 고른다
     (AGENTS.md '입구는 같은 자리에 두고 없는 이유를 말한다'). true = 그 절에 실을 능력이 있다. */
  const secGate = { scenario: false, next: false, history: false };
  function applyCapabilityGating() {
    const ctx = getPhenomenonContext();
    for (const [tab, cap] of Object.entries(CAP_TAB)) {
      /* 2026-09-09 — `!!ctx &&` 였다. 그래서 **현상을 고르지 않으면 셋이 전부 열렸고**,
         이력은 "현상을 고르면 그 현상의 과거 기록을 봅니다", 시뮬은 "사건 탭에서
         태풍을 고르면 …" 이라는 빈 약속만 냈다(라이브 실측). 능력은 현상의 성질이다 —
         현상이 없으면 능력도 없다. 없는 것을 탭으로 만들지 않는다. */
      /* 2026-09-20 §G-2 — 시나리오 탭은 계산 능력(simulation) **또는** 등록된 가정 장면(Preview, §K-2)이
         있을 때 열린다. 파도가 simulation:false 로 정정되며 태풍 해상 가정 장면으로 가는 길이 끊기는 것을 막는다.
         장면 쪽은 SIMULATION 배지를 달지 않는다(main.js getScenario). */
      const hide = !ctx || !ctx.capabilities[cap] && !(tab === 'scenario' && previewSceneFor(ctx.phenomenonId));
      // (2026-09-24 정정) 예전: btn.hidden = hide — 탭 단추를 숨겼다. 이제 단추가 없으니 절이 읽을 값만 적는다.
      secGate[tab] = !hide;
      // 숨긴 탭이 열려 있었으면 사건 탭으로 되돌린다 — 빈 화면을 남기지 않는다.
      // (2026-09-24 정정) 되돌리지 않는다. 한 장 시트에서 능력이 없는 절은 **그 자리에 이유 한 줄**로 남으므로 빈 화면이 생기지 않고,
      //   여기서 사건으로 되돌리면 고른 현상을 보던 사람을 사건 목록으로 끌고 간다(if (hide && curTab === tab) showTab('feed') 를 뺐다).
    }
    applyPanelIdentity(ctx);
  }

  /* PHASE 3 §0.3 — 우측 손잡이가 'EARTH INTELLIGENCE' 라는 고정 이름을 달고 있으면
     인텔리전스가 현상과 무관한 독립 기능처럼 읽힌다. 현상을 고르면 그 현상의 이름을 단다.
     ※ 좌상단 .es-switch 의 'Intelligence' 는 건드리지 않는다 — 그것은 v2 제품 자체의
        공개 이름이고 배포된 주소(/Intelligence)다. earth-switch.js 머리주석을 볼 것. */
  const PANEL_HOME = () => (i18n.ko ? '지구 인텔리전스' : 'EARTH INTELLIGENCE');
  /* 이름표는 **패널 자신**이 단다.
     손잡이(#intel-tab)에 달려 있던 것을 잠깐 메뉴 버튼으로 옮겼었지만, 그 버튼도
     없앴다 — Intelligence 는 목적지가 아니라 지금 보고 있는 것의 문맥층이다.
     보이는 글자를 새로 만들지 않는다(§8 긴 설명 금지). 접근성 표면에만 남긴다:
     스크린리더는 "지진 — 현재·해석·근거 영역" 으로 읽고, 화면은 조용하다. */
  function applyPanelIdentity(ctx) {
    if (!intel) return;
    const name = ctx ? (i18n.ko ? ctx.label.ko : ctx.label.en) : null;
    const label = name
      ? (i18n.ko ? `${name} — 현재·해석·근거` : `${name} — current, intelligence, evidence`)
      : PANEL_HOME();
    intel.setAttribute('aria-label', label);
  }
  let timelineMinutes = 0;
  // PHASE 4 §2 — 1차 메뉴는 묶음만 보인다. 묶음을 열어야 현상 목록이 나온다.
  // 처음부터 58줄을 펼쳐 두면 '메뉴를 줄였다'가 화면에서 사실이 아니게 된다.
  // 2026-09-13: 도메인 id 여덟에서 §3.2 묶음 id 로 바뀌었다. 여는 손(gotoScene·data-collapse)은 그대로다.
  const collapsedSections = new Set(MENU_GROUPS.map((g) => g.id));

  /* 권역 이동 칩 목록(한반도·전 지구·동북아시아 …)은 2026-09-20 에 지웠다 — '지구 표현 · 이동' 절과 함께 나갔고
     남겨 두면 아무도 그리지 않는 죽은 목록이 된다. 카메라를 그 권역으로 옮기는 손(hooks.onRegion)은
     그대로 살아 있다 — 상단 검색(⌕)이 나라·시군구·도시를 찾아 같은 이동을 하고, 칩 클릭 처리도 남아 있어
     나중에 다른 자리(설정·상단)에 다시 붙이면 바로 돈다. */
  // 인구 격자가 준비된 나라 — 목록을 파일에서 읽어 칩으로 깐다.
  // 손으로 적으면 격자를 늘릴 때마다 메뉴가 실제와 어긋난다.
  let POP_COUNTRIES = [];
  fetch('./popgrid/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j || !Array.isArray(j.countries)) return;
      // 파일은 인구순이라 미국이 맨 앞이다. 화면에서는 한국이 먼저다(PD 지시).
      POP_COUNTRIES = j.countries.slice().sort((a, b) => byMarket(a.iso3, b.iso3));
      if (openBrand) refreshFlyout();
    })
    .catch(() => { /* 목록이 없으면 칩 없이 국가 클릭으로만 쓴다 */ });

  /* ── PHASE 4 — 도메인 → 현상 메뉴 ─────────────────────────────────────────
     지금까지 메뉴는 109개 레이어를 그대로 4~5줄씩 그렸다. 사용자는 자료 목록을 먼저
     읽어야 했다. 이제 1차는 도메인, 2차는 현상 66개다.

     레이어를 지우지 않는다(§0). 한 현상이 여러 레이어를 흡수하면 그 레이어들은
     현상 줄의 펼치기 안에 그대로 남는다 — 109개 전부 계속 도달 가능하다.
     목록은 레지스트리에서 만든다. 손으로 쓴 두 번째 목록을 만들지 않는다(§2). */
  const expandedPhenomena = new Set();

  const LAYER_BY_KEY = new Map();
  for (const sc of SCENES) for (const l of sc.layers) LAYER_BY_KEY.set(sc.id + '/' + l.id, { s: sc, l });

  /* 묶음 → 현상 → 레이어. 대표 레이어는 primary 역할을 먼저 고른다.
     2026-09-13: 도메인별 자동 분류 + 가나다 정렬이었던 것을 레지스트리의 MENU_GROUPS
     **적힌 순서 그대로**로 바꿨다(지시서 §3.2). 정렬을 코드가 다시 하지 않는다 —
     "기온 강수 바람 기압" 은 가나다도 준비도 순도 아니고 사람이 찾는 순서다. */
  const PHEN_ENTRY = new Map();   // 현상 id → {id,p,members,rep}
  const GROUP_INDEX = (() => {
    const byPhen = new Map();
    for (const [key, hit] of Object.entries(LAYER_PHENOMENON)) {
      if (!hit.phenomenon) continue;
      const rec = LAYER_BY_KEY.get(key);
      if (!rec) continue;
      if (!byPhen.has(hit.phenomenon)) byPhen.set(hit.phenomenon, []);
      byPhen.get(hit.phenomenon).push({ key, role: hit.role, s: rec.s, l: rec.l });
    }
    const out = new Map();
    for (const g of MENU_GROUPS) {
      const list = [];
      for (const pid of g.members) {
        const p = PHENOMENA[pid];
        const members = byPhen.get(pid);
        // 레이어가 하나도 없는 현상은 그리지 않는다 — 눌러도 켤 것이 없는 줄이 된다.
        if (!p || !members || !members.length) continue;
        const entry = { id: pid, p, members, rep: members.find((x) => x.role === 'primary') || members[0] };
        PHEN_ENTRY.set(pid, entry);
        list.push(entry);
      }
      out.set(g.id, list);
    }
    return out;
  })();
  const GROUP_BY_ID = new Map(MENU_GROUPS.map((g) => [g.id, g]));

  const layerOnState = (rec) => (hooks.getLayerState && hooks.getLayerState(rec.s.id, rec.l)) || {};
  // 묶음 색은 레지스트리가 정한다 — 전에는 '첫 항목이 속한 씬의 색'이라 목록 순서를
  // 한 줄만 바꿔도 절 제목 색이 따라 바뀌었다.
  const groupAccent = (gid) => (GROUP_BY_ID.get(gid) || {}).accent || '#7FB7F5';

  /* 묶음(절 제목) 아이콘 — 2026-09-14 인수 EARTHUS_MENU_ICONS_V2. 점(i) 앞에 서고 이름을
     대신하지 않는다(§3). 표는 earthus-icons.js 하나뿐이다 — 여기서 파일 이름을 만들지 않는다.
     그림 없는 묶음(우주)은 빈 문자열 → 점과 이름만 남는다. alt 는 비운다(이름이 바로 옆에 있다). */
  const groupIconHtml = (gid) => {
    const src = groupIconSrc(gid, 96);
    return src
      ? '<img class="mp-gico" src="' + src + '" srcset="' + groupIconSrcSet(gid) + '" alt="" loading="lazy" decoding="async">'
      : '';
  };

  // 현상 한 줄이 검색어에 걸리는가 — 이름·질문뿐 아니라 속한 레이어 이름·출처까지 본다.
  // 검색어는 밖(상단 돋보기)에서 온다 — 메뉴 안 검색 칸은 없앴다.
  const phenMatches = (entry, q) => matchesMenu(q, [
    entry.p.label.ko, entry.p.label.en, entry.p.question.ko, entry.p.question.en,
    entry.members.map((m) => m.l.name).join(' '),
    entry.members.map((m) => m.l.src).join(' '),
  ]);

  /* 메뉴 줄의 배지. 목록에 적힌 고정 문자열(state)이 기본이지만, 레이어가 자기 상태로
     낮춘 배지(st.badge)를 주면 그것이 먼저다. 2026-09-20: 궤도 인텔리전스는 스냅샷이 16일
     묵어 지구에 0기를 그리는 동안에도 메뉴 줄은 고정 LIVE 였다. 배지를 주는 레이어가 없으면
     예전과 똑같이 그린다 — 다른 줄은 하나도 바뀌지 않는다. */
  const rowBadge = (rec) => dataBadge(layerOnState(rec).badge || rec.l.state);

  const layerRowHtml = (rec, sub = true) => {
    const st = layerOnState(rec);
    return '<button class="mp-item' + (sub ? ' mp-sub' : '') + (rec.l.state === 'LOCKED' ? ' locked' : '') + (st.on ? ' on' : '') + '"'
      + ' data-fscene="' + rec.s.id + '" data-flayer="' + rec.l.id + '"'
      + ' title="' + safeText(rec.l.src) + '" aria-pressed="' + (!!st.on) + '">'
      + '<span class="mp-lbl">' + i18n.layer(rec.l.id, rec.l.name, rec.s.id) + '</span>' + rowBadge(rec)
      + (st.on && st.note ? '<span class="mp-note">' + st.note + '</span>' : '')
      + '</button>';
  };

  const phenomenonRowHtml = (entry) => {
    const anyOn = entry.members.some((m) => layerOnState(m).on);
    const sel = !!selectedMenu && (selectedMenu.s.id + '/' + selectedMenu.l.id) === entry.rep.key;
    const name = i18n.ko ? entry.p.label.ko : entry.p.label.en;
    const more = entry.members.length > 1;
    const open = expandedPhenomena.has(entry.id);
    // 자료가 여럿이면 펼쳐서 그 안의 레이어를 그대로 켤 수 있다 — 기능은 하나도 안 사라진다.
    const expander = more
      ? '<button class="mp-expand" data-expand="' + entry.id + '" aria-expanded="' + (open ? 'true' : 'false')
        + '" aria-label="' + safeText(name) + ' ' + (i18n.ko ? '자료 목록' : 'data list') + '"><span aria-hidden="true"></span></button>'
        // ↑ 2026-09-23 PD "오른쪽 숫자 안 보이게": 자료 개수(members.length)를 글자로 쓰던 자리를 꺾쇠 그림(menu-v1look.css)으로 바꿨다.
        //   펼치기 자체는 남는다 — 흡수된 레이어에 가는 길이다(시험 '기능이 사라지지 않는다').
      : '';
    /* 아이콘 (2026-09-12 인수 §3). 이름 앞에 서고, 이름을 대신하지 않는다 —
       지시서 §3 "never replace the whole menu with unlabeled icon-only navigation",
       매니페스트 accessibility "icon never carries meaning alone".
       ⚠️ alt 를 비워 둔다: 바로 옆에 같은 이름이 글자로 있어 스크린리더가 두 번 읽는다. */
    const slug = iconForPhenomenon(entry.id);
    const ss = slug ? iconSrcSet(slug, 64) : null;
    const ico = slug
      ? '<img class="mp-ico" src="' + iconSrc(slug, 64) + '"' + (ss ? ' srcset="' + ss + '"' : '')
        + ' alt="" loading="lazy" decoding="async">'
      : '';
    return '<div class="mp-phen' + (anyOn ? ' has-on' : '') + (sel ? ' sel' : '') + '">'
      + '<button class="mp-item mp-phen-main' + (entry.rep.l.state === 'LOCKED' ? ' locked' : '') + (anyOn ? ' on' : '') + '"'
      + ' data-fscene="' + entry.rep.s.id + '" data-flayer="' + entry.rep.l.id + '"'
      + ' title="' + safeText(i18n.ko ? entry.p.question.ko : entry.p.question.en) + '" aria-pressed="' + anyOn + '">'
      // 2026-09-23 V1 줄 문법: 이름 아래 설명 한 줄(V1 .ly-sub 'NOAA GMGSI · 구름 · 지금'). 상태 배지는 오른쪽 끝이 아니라 그 줄 앞에 둔다 —
      //   오른쪽 끝에 무엇이든 세우면 PD 가 지운 숫자 자리와 같은 잡음이 된다.
      + ico + '<span class="mp-lbl">' + safeText(name)
      + '<small class="mp-lsub">' + rowBadge(entry.rep) + (entry.rep.l.src && entry.rep.l.src !== '—' ? safeText(entry.rep.l.src) : '') + '</small></span>'
      + '</button>' + expander
      + (open && more ? '<div class="mp-subs">' + entry.members.map(layerRowHtml).join('') + '</div>' : '')
      + '</div>';
  };

  /* 칩은 절 안에 붙는 보조 조작이다. 남은 것은 인구 국가 칩 하나다 — '생태 · 사람 · 여행' 절.
     지역 이동 칩은 '지구 표현 · 이동' 절과 함께 2026-09-20 에 뺐다(상단 검색이 같은 이동을 한다).
     칩 클릭 처리(hooks.onRegion)는 남겨 두었다 — 다른 자리에 다시 붙일 때 바로 쓰인다. */
  const chipsFor = (gid) => {
    if (gid === 'society' && POP_COUNTRIES.length) {
      const cname = (c) => (hooks.countryName ? hooks.countryName(c.iso3, c.nameKo) : c.nameKo);
      const loc = i18n.ko ? 'ko-KR' : 'en-US';
      return '<div class="mp-chips" role="group" aria-label="' + i18n.t('popChips') + '">'
        + POP_COUNTRIES.map((c) => '<button class="mp-chip" data-pop="' + c.iso3 + '" data-popname="' + c.nameKo + '" title="'
          + i18n.t('popTitle').replace('{n}', c.total.toLocaleString(loc)).replace('{y}', c.year) + '">' + cname(c) + '</button>').join('')
        + '</div><div class="mp-chip-note">' + i18n.t('popNote').replace('{n}', POP_COUNTRIES.length) + '</div>';
    }
    return '';
  };

  const groupSectionHtml = (gid) => {
    const all = GROUP_INDEX.get(gid) || [];
    const shown = all.filter((e) => !activeOnly || e.members.some((m) => layerOnState(m).on));
    if (!shown.length) return '';
    const g = GROUP_BY_ID.get(gid);
    const label = i18n.ko ? g.label.ko : g.label.en;
    // '켜진 자료만' 은 접힌 절도 펼친다 — 절이 전부 접힌 채 시작하므로(기본), 거르고도 제목만 남으면
    // 무엇이 켜져 있는지 여전히 안 보인다. (예전에는 검색어가 있을 때 이렇게 펼쳤다.)
    if (flatMenu) {
      return '<section class="mp-sec mp-flat" data-section="' + gid + '" style="--sc:' + groupAccent(gid) + '">'
        + (activeOnly ? '' : chipsFor(gid)) + shown.map(phenomenonRowHtml).join('') + '</section>';
    }
    const hidden = !activeOnly && collapsedSections.has(gid);
    // 2026-09-23 PD "오른쪽 숫자 안 보이게" — 묶음 제목 끝의 개수(<em>shown.length</em>)를 뺐다. 대신 V1 줄처럼
    //   이름 아래에 무엇이 들었는지 한 줄(앞 세 현상 이름)을 둔다. 숫자는 안에 든 것을 말해 주지 않았다.
    const preview = shown.slice(0, 3).map((e) => (i18n.ko ? e.p.label.ko : e.p.label.en)).join(' · ') + (shown.length > 3 ? ' …' : '');
    return '<section class="mp-sec" data-section="' + gid + '" style="--sc:' + groupAccent(gid) + '">'
      + '<h3 class="mp-title"><button data-collapse="' + gid + '" aria-expanded="' + (hidden ? 'false' : 'true') + '">'
      + groupIconHtml(gid) + '<i></i>' + '<span class="mp-tname">' + safeText(label) + '<small>' + safeText(preview) + '</small></span></button></h3>'
      + '<div ' + (hidden ? 'hidden' : '') + '>'
      + (activeOnly ? '' : chipsFor(gid))
      + shown.map(phenomenonRowHtml).join('')
      + '</div></section>';
  };

  // 거른 결과가 비었을 때 — 남은 거르개는 '켜진 자료만' 하나다. 무엇을 하면 되는지를 말한다.
  const emptyMenuHtml = () => `<p role="status">${i18n.ko
    ? '켜진 자료가 없습니다. \'켜진 자료만\' 을 끄면 전체 메뉴가 보입니다.'
    : 'Nothing is switched on. Untick “Active only” to see every topic.'}</p>`;

  /* 상단 돋보기(⌕)가 메뉴도 찾는다 — 2026-09-20.
     메뉴 안 검색 칸을 없애면서 '이름으로 현상 찾기'까지 사라지면 안 된다. 같은 판정(phenMatches →
     matchesMenu)을 밖에서 부르게 낸다 — 판정이 둘이면 돋보기가 찾은 것과 메뉴에 있는 것이 갈라진다.
     EARTHUS 묶음 전부 + 우주. 돌려주는 것은 그리는 데 필요한 최소한(이름·묶음·대표 레이어)뿐이다. */
  const findTopics = (q, limit = 6) => {
    const query = String(q || '').trim();
    if (!query) return [];
    const out = [];
    for (const gid of [...EARTHUS_MENU_GROUPS, 'space']) {
      const g = GROUP_BY_ID.get(gid);
      for (const e of GROUP_INDEX.get(gid) || []) {
        if (!phenMatches(e, query)) continue;
        out.push({
          id: e.id,
          name: i18n.ko ? e.p.label.ko : e.p.label.en,
          group: g ? (i18n.ko ? g.label.ko : g.label.en) : '',
          sceneId: e.rep.s.id,
          layerId: e.rep.l.id,
          on: e.members.some((m) => layerOnState(m).on),
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  };

  /* '지구 표현 · 이동' 절은 2026-09-20 에 없앴다 (PD: "이건 뭔지 모르겠어 메뉴에서 삭제").
     그 절에 있던 9개의 행선지:
       바탕 지도 3종(자연 지형·블루마블·오늘의 지구) → **설정(⚙)의 '지구 바탕 그림'** 으로 옮겼다.
         자료 레이어가 아니라 지구 표면 재질이라 자료 메뉴에 있을 것이 아니었다(index.html #base-seg, main.js).
       사건 피드·LAB 보고서·요청·내 위치 → 하단 탭(지금·리포트·내 지역)에 같은 문이 이미 있다.
       전체 지구로·해역 초점 → 상단 '◀ 3D 지구로' 와 지도 클릭으로 같은 일을 한다.
       지역 이동 칩(한반도·전 지구·…) → 상단 검색(⌕)이 나라·시군구·도시·공항을 찾아 같은 카메라 이동을 한다.
     켜는 함수(setBaseStyle 등)는 하나도 지우지 않았다 — 손잡이만 옮겼다. */

  /* 씬 기반 메뉴 렌더러(sectionHtml)는 2026-09-13 에 지웠다.
     openPanel 이 현상 묶음으로 그리는데 이것만 씬으로 그려서 검색할 때마다 다른 메뉴가 나왔다.
     기능은 하나도 줄지 않는다 — 같은 레이어를 현상 줄의 펼치기(mp-subs)가 전부 켠다. */

  const scrim = document.getElementById('menu-scrim');
  if (scrim) scrim.addEventListener('click', () => closeFlyout());

  /* ── PHASE 5 §5 — 리포트 진입면 ────────────────────────────────────────────
     실제로 있는 것: 사건별 분석 보고서 9종(aws/lab-report-index → ocean/lab-reports.json).
     아직 없는 것: 월간·분기·연간 회고와 세 전망 — 생성기가 없다.
     없는 것을 있는 것처럼 그리지 않는다. 상태를 그대로 적고, 왜 없는지 말한다. */
  /* PHASE 7 §15 — 정기 보고서 목록을 엔진 산출물에서 읽는다.
     전에는 여섯 종을 '아직 생성되지 않음' 으로 화면에 박아 두었다. 그러면 엔진이
     실제로 보고서를 내놓아도 화면이 영원히 없다고 말한다.
     이제 아카이브 색인을 받아서 그리고, 색인이 없으면 그때 없다고 말한다.
     "생성되지 않음" 과 "생성됐지만 자료 부족" 을 구분해서 보여 준다. */
  let REPORT_INDEX = null;      // null = 아직 안 받아 봄 · {} = 받았는데 비어 있음
  let reportIndexTried = false;
  /* PHASE 8 §13 — 발행 저장소의 기준 주소. 운영에서는 S3 다.
     window.EARTHUS_REPORT_BASE 로 바꿀 수 있게 둔 것은 **설정**이지 시험용 자료가 아니다 —
     번들에 가짜 보고서를 넣지 않고도 다른 저장소를 가리켜 확인할 수 있어야 한다. */
  // (2026-09-23) 다른 v2 자료는 운영에서 같은 출처(earthus.net)로 바꿨지만 여기는 **S3 직접으로 둔다.**
  //   reports/published/ 에는 CloudFront 동작이 없다 — 기본 동작(서울 /app)으로 가서 403 이 난다(실측: earthus.net/reports/published/index.json → 403).
  //   같은 출처로 바꾸려면 CloudFront 에 /reports/published/* 동작을 먼저 만들어야 한다(PD 인프라 작업).
  const reportBase = () => (typeof window !== 'undefined' && window.EARTHUS_REPORT_BASE)
    || 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
  let openReport = null;          // 지금 읽고 있는 보고서 본문 (없으면 목록)
  let openReportId = null;
  let reportLoading = false;
  let reportError = null;
  const REPORT_DOCS = new Map();  // reportId → 본문. 같은 것을 두 번 받지 않는다.
  let reportTab = 'latest';       // latest · monthly · quarterly · annual · outlook

  // 보고서 본문을 받는다. 없으면 없다고 말한다 — 빈 화면을 그럴듯하게 채우지 않는다.
  const loadReport = (reportId, version) => {
    if (REPORT_DOCS.has(reportId)) {
      openReport = REPORT_DOCS.get(reportId); openReportId = reportId; refreshFlyout(); return;
    }
    reportLoading = true; reportError = null; openReportId = reportId; openReport = null;
    refreshFlyout();
    fetch(reportBase() + '/' + reportKey(reportId, version || 1), { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((doc) => { REPORT_DOCS.set(reportId, doc); openReport = doc; reportLoading = false; refreshFlyout(); })
      .catch((e) => { reportLoading = false; reportError = String(e && e.message || e); refreshFlyout(); });
  };
  const loadReportIndex = () => {
    if (reportIndexTried) return;
    reportIndexTried = true;
    fetch(reportBase() + '/' + reportIndexKey(), { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { REPORT_INDEX = j && typeof j === 'object' ? j : {}; if (openBrand === 'report') refreshFlyout(); })
      .catch(() => { REPORT_INDEX = {}; if (openBrand === 'report') refreshFlyout(); });
  };

  // 사건 보고서는 현상에서 온다 — 레지스트리가 이미 종류↔현상을 안다.
  const reportKindRows = () => {
    const rows = [];
    for (const [pid, p] of Object.entries(PHENOMENA)) {
      if (!p.capabilities.report) continue;
      const kinds = reportKindsForPhenomenon(pid);
      if (!kinds.length) continue;
      rows.push({ pid, p, kind: kinds[0] });
    }
    rows.sort((a, b) => a.p.label.ko.localeCompare(b.p.label.ko, 'ko'));
    return rows;
  };

  // §13 — 리포트 센터의 다섯 갈래. 주소와 1:1 로 맞춘다.
  const REPORT_TABS = [
    { id: 'latest',    ko: '최신',   en: 'Latest' },
    { id: 'monthly',   ko: '월간',   en: 'Monthly',   type: 'RETROSPECTIVE_MONTHLY' },
    { id: 'quarterly', ko: '분기',   en: 'Quarterly', type: 'RETROSPECTIVE_QUARTERLY' },
    { id: 'annual',    ko: '연간',   en: 'Annual',    type: 'RETROSPECTIVE_ANNUAL' },
    { id: 'outlook',   ko: '전망',   en: 'Outlook' },
  ];

  const allReports = () => {
    const years = (REPORT_INDEX && REPORT_INDEX.years) || null;
    if (!years) return [];
    const out = [];
    for (const list of Object.values(years)) for (const r of (list || [])) if (r) out.push(r);
    return out.sort((a, b) => String((b.period || {}).from || '').localeCompare(String((a.period || {}).from || '')));
  };

  // 보고서 한 줄. 발행된 것만 열 수 있다 — 생성 중인 것을 완성본처럼 보여 주지 않는다.
  const reportRowHtml = (r, ko) => {
    const per = ((r.period || {}).from || '').slice(0, 7);
    const published = r.lifecycle === 'PUBLISHED';
    const lab = DATA_LABEL_TEXT[r.dataLabel];
    return '<div class="rc-row' + (published ? '' : ' rp-pending') + '" data-testid="report-row">'
      + '<span>' + safeText(per) + (lab ? ' <em class="rc-label">' + safeText(ko ? lab.ko : lab.en) + '</em>' : '') + '</span>'
      + (published
        ? '<button class="rp-phen" data-report-open="' + safeText(r.reportId || '') + '" data-report-version="'
          + safeText(r.version || 1) + '" data-testid="report-open">' + (ko ? '읽기' : 'Read') + '</button>'
        : '<em>' + safeText((ko ? '생성 중 · ' : 'generating · ') + (r.lifecycle || r.status || '')) + '</em>')
      + '</div>';
  };

  const tabBodyHtml = (ko) => {
    if (REPORT_INDEX === null) {
      return '<p class="rp-note" data-testid="report-list-loading">' + (ko ? '목록을 받는 중입니다…' : 'Loading…') + '</p>';
    }
    const tab = REPORT_TABS.find((t) => t.id === reportTab) || REPORT_TABS[0];
    let rows;
    if (tab.id === 'latest') rows = allReports().filter((r) => r.lifecycle === 'PUBLISHED').slice(0, 6);
    else if (tab.id === 'outlook') rows = allReports().filter((r) => String(r.type || '').startsWith('OUTLOOK_'));
    else rows = allReports().filter((r) => r.type === tab.type);
    if (!rows.length) {
      return '<p class="rp-note" data-testid="report-list-empty">' + (ko
        ? '아직 발행된 보고서가 없습니다. 엔진은 준비돼 있습니다(aws/report-engine) — 없는 보고서를 미리 그려 두지 않습니다.'
        : 'Nothing published yet. The engine exists (aws/report-engine); we do not draw reports that do not exist.') + '</p>';
    }
    return rows.map((r) => reportRowHtml(r, ko)).join('');
  };

  const reportCenterHtml = (ko) => {
    // 본문을 읽는 중이면 본문이 화면 전체를 쓴다.
    if (openReportId) {
      if (reportLoading) return '<p class="rp-note" data-testid="report-loading">' + (ko ? '보고서를 받는 중입니다…' : 'Loading the report…') + '</p>';
      if (reportError) {
        return '<div class="rc-doc"><button class="rp-phen" data-report-back="1" data-testid="report-back">'
          + (ko ? '← 목록' : '← Back') + '</button><p class="rc-empty" data-testid="report-error">'
          + (ko ? '보고서를 받지 못했습니다: ' : 'Could not load the report: ') + safeText(reportError) + '</p></div>';
      }
      if (openReport) return reportDocHtml(openReport, { ko, tier: currentTier() });
    }
    return '<nav class="rc-tabs" role="tablist" data-testid="report-tabs">'
      + REPORT_TABS.map((t) => '<button role="tab" class="rc-tab' + (t.id === reportTab ? ' on' : '') + '"'
        + ' aria-selected="' + (t.id === reportTab ? 'true' : 'false') + '"'
        + ' data-report-tab="' + t.id + '">' + safeText(ko ? t.ko : t.en) + '</button>').join('')
      + '</nav><div class="rc-list" data-testid="report-list">' + tabBodyHtml(ko) + '</div>';
  };

  const reportPanelHtml = () => {
    const ko = i18n.ko;
    // 본문을 읽는 중에는 다른 절을 그리지 않는다 — 읽는 데 방해된다.
    if (openReportId) return reportCenterHtml(ko);
    const rows = reportKindRows();
    const live = rows.map((r) => {
      const key = representativeLayerFor(r.pid);
      const name = ko ? r.p.label.ko : r.p.label.en;
      return '<div class="rp-row">'
        + '<a class="rp-open" href="/lab-reports.html?kind=' + encodeURIComponent(r.kind) + '" target="_blank" rel="noopener">'
        + safeText(name) + '</a>'
        // §11 — 보고서에서 그 현상으로 바로 간다.
        + (key ? '<button class="rp-phen" data-report-phenomenon="' + key + '">'
            + (ko ? '현상 보기' : 'Open phenomenon') + '</button>' : '')
        + '</div>';
    }).join('');

    return '<section class="mp-sec" data-section="__rep-live" style="--sc:#8fd0ff">'
      + '<h3 class="mp-title"><button data-collapse="__rep-live" aria-expanded="true"><i></i>'
      + (ko ? '사건 분석 보고서' : 'Event analysis reports') + '<em>' + rows.length + '</em></button></h3>'
      + '<div>' + (live || '<p class="rp-note">' + (ko ? '아직 발행된 보고서가 없습니다.' : 'No reports published yet.') + '</p>')
      + '<p class="rp-note">' + (ko
        ? '끝난 사건마다 계산 결과와 검증을 남깁니다. 목록과 상세는 1.0 보고서 화면에서 엽니다.'
        : 'Each closed event keeps its calculation and verification. The list and detail open in the 1.0 report view.') + '</p>'
      + '</div></section>'

      + '<section class="mp-sec" data-section="__rep-center" style="--sc:#9fb9ff">'
      + '<h3 class="mp-title"><button data-collapse="__rep-center" aria-expanded="true"><i></i>'
      + (ko ? '지구 회고 · 전망' : 'Retrospective / outlook') + '</button></h3>'
      + '<div>' + reportCenterHtml(ko)
      + '<p class="rp-note">' + (ko
        ? '전망에는 지난 전망이 얼마나 맞았는지가 함께 들어갑니다. 예보 스냅샷은 발행 시점 그대로 얼려 두고 나중에 실측과 대조합니다 — 지난 예측을 고쳐서 맞은 것처럼 만들지 않습니다.'
        : 'An outlook carries how the previous outlook actually scored. Forecast snapshots are frozen as issued and compared with observations later — a past prediction is never edited to look right.') + '</p>'
      + '</div></section>';
  };

  const openPanel = (brand) => {
    openBrand = brand;
    // 우주 문 표시는 AETHERUS 서랍이 열려 있는 동안만 유효하다 — 다른 서랍을 열면 끊는다.
    if (brand !== 'aetherus') spaceDoor = false;
    const aeth = brand === 'aetherus';
    const isReport = brand === 'report';
    if (isReport) loadReportIndex();
    // PHASE 4 — 브랜드로 도메인을 고른다. AETHERUS 는 우주 하나(기존 계약 유지, §1).
    // PHASE 4 — 브랜드로 묶음을 고른다. AETHERUS 는 우주 하나(기존 계약 유지, §1).
    // 목록은 레지스트리가 준다 — 여기에 묶음 이름을 손으로 적으면 표가 둘이 된다.
    const groups = isReport ? [] : aeth ? ['space'] : [...EARTHUS_MENU_GROUPS];
    flatMenu = groups.length === 1;
    panel.classList.toggle('aeth', aeth);
    panel.innerHTML = `
      <div class="mp-head">
        <div class="mp-head-copy"><b>${isReport ? (i18n.ko ? '리포트' : 'REPORTS') : aeth ? 'AETHERUS' : 'EARTHUS'}</b><small>${isReport ? (i18n.ko ? '사건 분석 · 지구 회고 · 전망' : 'Event analysis · retrospective · outlook') : i18n.t(aeth ? 'mpTagA' : 'mpTagE')}</small></div>
        <button class="ui-x" data-x="1" aria-label="${i18n.ko ? '메뉴 닫기':'Close menu'}">✕</button>
      </div>
      ${isReport ? '' : `<div class="mp-search"><label class="mp-active-only"><input type="checkbox" data-active-only ${activeOnly ? 'checked':''}>${i18n.ko ? '켜진 자료만':'Active only'}</label></div>`}
      <div class="mp-body">
        ${isReport ? reportPanelHtml() : groups.map(groupSectionHtml).join('') || emptyMenuHtml()}
        ${isReport ? '' : `<div class="mp-foot">${i18n.t('mpFoot')}</div>`}
      </div>`;
    panel.classList.add('open');
    if (scrim) scrim.classList.add('on');
    tabE.classList.toggle('open', !aeth && !isReport);
    tabE.classList.toggle('beside', aeth || isReport);
    tabA.classList.toggle('open', aeth);
    tabA.classList.toggle('beside', !aeth);
    syncIntelNav();
    if (hooks.onFlyoutOpened) hooks.onFlyoutOpened();
  };

  const closeFlyout = () => {
    openBrand = null;
    spaceDoor = false;
    panel.classList.remove('open');
    if (scrim) scrim.classList.remove('on');
    tabE.classList.remove('open');
    tabE.classList.remove('beside');
    tabA.classList.remove('open');
    tabA.classList.remove('beside');
    syncIntelNav();
  };

  // 레이어를 켤 때마다 패널을 통째로 다시 그리는데, 그러면 목록이 맨 위로 튀고
  // 눌러 둔 칩의 표시도 사라진다. 스크롤 위치와 칩 선택을 지켜서 다시 그린다.
  const refreshFlyout = () => {
    if (!openBrand) return;
    const body = panel.querySelector('.mp-body');
    const top = body ? body.scrollTop : 0;
    const active = document.activeElement;
    const restore = active && panel.contains(active) ? {scene:active.dataset.fscene,id:active.dataset.flayer,collapse:active.dataset.collapse} : null;
    const onChips = [...panel.querySelectorAll('.mp-chip.on')]
      .map((c) => c.dataset.region || c.dataset.pop).filter(Boolean);
    openPanel(openBrand);
    const body2 = panel.querySelector('.mp-body');
    if (body2 && top) body2.scrollTop = top;
    const restoreEl = restore?.id ? panel.querySelector(`[data-fscene="${restore.scene}"][data-flayer="${restore.id}"]`) : restore?.collapse ? panel.querySelector(`[data-collapse="${restore.collapse}"]`) : null;
    if (restoreEl) restoreEl.focus({preventScroll:true});
    for (const key of onChips) {
      const c = panel.querySelector(`.mp-chip[data-region="${key}"], .mp-chip[data-pop="${key}"]`);
      if (c) c.classList.add('on');
    }
  };
  /* ⚠️ 여기는 오래 틀려 있었다. 패널은 현상 묶음으로 그리는데 이 핸들러만 **옛 씬 목록**을
     다시 그려서, 검색창에 글자를 넣는 순간 메뉴가 통째로 다른 화면으로 바뀌었다.
     (땅·날씨·바다 묶음 → 지형·날씨·해양·사람·여행·LAB·취미·재해 씬 90줄)
     그리는 곳을 둘로 두면 반드시 갈라진다. 이제 refreshFlyout 하나만 그린다 —
     그쪽이 검색어·커서 위치·스크롤·켜진 칩까지 되살린다. */
  /* 목록만 다시 그린다 — 패널 전체가 아니다.
     ⚠️⚠️ 여기서 refreshFlyout() 을 부르면 안 된다. 그쪽은 openPanel() 로 panel.innerHTML 을
        통째로 새로 쓰는데, 검색창(.mp-search)은 .mp-body **밖**에 있어서 같이 지워진다.
        그러면 **지금 글자를 치고 있는 input 이 글자마다 파괴된다** — 한글은 자모가 조합되는
        도중에 입력 요소가 사라지므로 "ㅎㅏㄴ" 처럼 풀려 버리고, '켜진 자료만' 체크박스는
        누르는 순간 포커스를 잃는다. 값과 커서를 되살려도 조합 중인 IME 는 되살릴 수 없다.
     그리는 함수는 openPanel 과 같은 것을 쓴다 — 그리는 곳이 둘이면 또 갈라진다.
     (2026-09-20: 검색 칸은 상단 돋보기로 옮겨 없앴다. 위 규칙은 '켜진 자료만' 체크박스에 그대로
      해당한다 — 패널을 통째로 다시 쓰면 누르는 순간 포커스를 잃는다.) */
  panel.addEventListener('input',e=>{
    if(e.target.matches('[data-active-only]')) activeOnly=e.target.checked;
    else return;
    const body = panel.querySelector('.mp-body');
    if (!body) return;
    const aeth = openBrand === 'aetherus';
    const groups = aeth ? ['space'] : [...EARTHUS_MENU_GROUPS];
    // 꼬리말(.mp-foot)도 .mp-body 안에 있다 — 같이 그리지 않으면 거르는 동안만 사라진다.
    body.innerHTML = (groups.map(groupSectionHtml).join('') || emptyMenuHtml())
      + `<div class="mp-foot">${i18n.t('mpFoot')}</div>`;
  });
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){const brand=openBrand;closeFlyout();(brand==='aetherus'?tabA:tabE).focus();}});

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { closeFlyout(); return; }
    const collapse=e.target.closest('[data-collapse]');
    // PHASE 8 §13 — 리포트 센터 조작. 목록 ↔ 본문, 탭 전환, 보고서 → 현상.
    const tab = e.target.closest('[data-report-tab]');
    if (tab) { reportTab = tab.dataset.reportTab; refreshFlyout(); return; }
    const back = e.target.closest('[data-report-back]');
    if (back) { openReport = null; openReportId = null; reportError = null; refreshFlyout(); return; }
    const openRep = e.target.closest('[data-report-open]');
    if (openRep) {
      loadReport(openRep.dataset.reportOpen, Number(openRep.dataset.reportVersion) || 1);
      return;
    }
    // §20 REPORT → PHENOMENON. 스토리에서 그 현상을 바로 연다.
    const toStoryPhen = e.target.closest('[data-story-phenomenon]');
    if (toStoryPhen) {
      const [sid, lid] = toStoryPhen.dataset.storyPhenomenon.split('/');
      const sc = SCENES.find((x) => x.id === sid);
      const ly = sc && sc.layers.find((x) => x.id === lid);
      if (ly && hooks.onLayerAction) {
        selectedMenu = { s: sc, l: ly };
        applyCapabilityGating();
        hooks.onLayerAction(sid, ly);
        closeFlyout();
        // ⚠️ 보고서에서 현상으로 왔는데 사건 피드가 떠 있으면, 누른 것과 다른 화면이 나온다.
        //    누른 행동에 맞는 탭으로 옮긴다(§12).
        //      자세히 보기 → 선택 자료 · 분석 → 자료의 근거 · 조건을 바꿔보기 → 시뮬레이션
        //
        // ⚠️⚠️ 이 호출이 **마지막 사용자 의도**를 세운다(§11).
        //    바로 위 onLayerAction 이 '선택 자료'로 카드를 띄우며 의도를 한 번 세우는데,
        //    사용자가 실제로 누른 것은 이쪽이므로 여기서 덮어쓴다. 그 뒤 자료가 도착해
        //    카드가 갱신돼도 'follow' 요청이라 이 의도를 이기지 못한다.
        //    (예전에는 setTimeout 으로 400ms·1200ms 뒤에 다시 골랐다 — 지웠다.)
        const ACTION_TAB = { phenomenon: 'now', intelligence: 'why', simulation: 'scenario' };
        const want = ACTION_TAB[toStoryPhen.dataset.storyAction] || 'now';
        // 능력이 없는 탭으로는 보내지 않는다. 버튼 자체가 능력이 있을 때만 그려지지만
        // (report-center.storyActionsHtml), 실제 탭이 있는지도 확인한다.
        // (2026-09-24 정정) 탭 단추가 없어졌다 — 단추의 hidden 대신 같은 능력 표(secGate)를 읽는다. 능력이 없으면 값 칸('now')으로 간다.
        const target = CAP_TAB[want] && !secGate[want] ? 'now' : want;
        showTab(target, 'intent');
        openIntel();
      }
      return;
    }
    const toPhen = e.target.closest('[data-report-phenomenon]');
    if(toPhen){const [sid,lid]=toPhen.dataset.reportPhenomenon.split('/');const sc=SCENES.find(x=>x.id===sid);const ly=sc&&sc.layers.find(x=>x.id===lid);if(ly&&hooks.onLayerAction){selectedMenu={s:sc,l:ly};applyCapabilityGating();hooks.onLayerAction(sid,ly);closeFlyout();openIntel();}return;}
    const expand = e.target.closest('[data-expand]');
    if(expand){const pid=expand.dataset.expand;expandedPhenomena.has(pid)?expandedPhenomena.delete(pid):expandedPhenomena.add(pid);refreshFlyout();return;}
    if(collapse){const id=collapse.dataset.collapse;collapsedSections.has(id)?collapsedSections.delete(id):collapsedSections.add(id);refreshFlyout();return;}
    const chip = e.target.closest('.mp-chip');
    if (chip) {
      const group = chip.parentElement;
      group.querySelectorAll('.mp-chip').forEach((c) => c.classList.toggle('on', c === chip));
      if (chip.dataset.pop) {
        if (hooks.onPopCountry) hooks.onPopCountry(chip.dataset.pop, chip.dataset.popname);
      } else if (hooks.onRegion) {
        hooks.onRegion(chip.dataset.region);
      }
      return;
    }
    const row = e.target.closest('.mp-item');
    if (!row) return;
    const scene = SCENES.find((s) => s.id === row.dataset.fscene);
    const layer = scene && scene.layers.find((l) => l.id === row.dataset.flayer);
    if (layer && hooks.onLayerAction) { selectedMenu={s:scene,l:layer}; applyCapabilityGating(); intelContent.scrollTop=0; hooks.onLayerAction(scene.id, layer); }
  });

  tabE.addEventListener('click', () => {
    if (openBrand === 'earthus') closeFlyout();
    else { openPanel('earthus'); hooks.onScene('land'); }
  });
  tabA.addEventListener('click', () => {
    if (openBrand === 'aetherus') closeFlyout();
    else { openPanel('aetherus'); hooks.onScene('space'); }
  });

  const setActiveScene = () => {}; // 브랜드 패널 구조에서는 씬 단위 하이라이트가 없다

  // --- 우측 EARTH INTELLIGENCE 패널 (§106.1: 접힘 기본, 지구 65% 이상 유지) ---
  const intel = document.createElement('div');
  intel.id = 'intel';
  // 손잡이(#intel-tab)는 없앴다 — 진입점은 하단 메뉴의 Intelligence 한 곳뿐이다.
  // 375 폭에서 이 손잡이가 출처 상자(#hud, z=7)에 덮여 글자가 잘리던 문제도 같이 사라진다.
  /* M1 (2026-09-20) — 폰에서는 3단 바텀시트다: peek(고른 것 한 줄 · SELECT) → half(지구가 위에 보이는
     INFORMATION) → full. 계약 §C-0: Context Action 은 새 부품이 아니라 이 시트에 흡수한다. 손잡이를
     누르면 한 단씩 돌고, 끌면 방향으로 한 단 옮긴다. 넓은 화면에서는 손잡이가 숨고 예전과 같다.
     ⚠️ 롱프레스는 쓰지 않는다 — 레이어 피커의 '길게 눌러 핀'과 겹친다(§C-0). */
  intel.dataset.sheet = 'half';
  /* (2026-09-23 정정 · B4 PD 승인) 손잡이를 #intel-body **밖**, #intel 의 첫 자식으로 옮겼다.
     본문 안에 있을 때는 ① 표적을 30 이상 못 키웠고(peek 118 에서 빠진다) ② half 에서 본문을 굴리면 손잡이가 같이 밀려
     사라졌다 — 키울 손잡이가 안 보이는 시트가 됐다. 밖에 두면 보이는 띠 24 · 표적 44 · 굴려도 남는다(index.html M1 절).
     누르기·끌기 코드는 그대로다(아래 querySelector 는 #intel 전체에서 찾는다). */
  /* (2026-09-24 정정) 탭 단추 줄(.intel-tabs — 사건·내 지역·선택 자료·자료의 근거·예보·예정·이력·시뮬레이션)을 걷었다.
     PD 2026-09-23 "인텔리전스 창은 하나로 통합하면 되겠는데 버튼 누르면 다른 안내화면 나오지 말고" → 09-24 "아직도 떠 모두 하나로
     통합해줘". 폰(402×714)에서는 그 줄이 두 줄로 접혀 값보다 먼저 섰다. 이제 시트는 **한 장**이다: 머리(무엇을 보고 있나 + ✕) 아래에
     값 → 자료의 근거 → 예보·예정 → 이력 → 모델 비교 → Intelligence → 시뮬레이션 절이 한 줄로 이어진다(renderIntel · renderSheet).
     사건·내 지역은 하단 바의 '지금'·'내 지역'이 여는 문맥이다(탭이 아니다). 탭 이름은 절 제목으로 그대로 남는다 — 사람이 찾던 말이다.
     걷은 단추에 붙어 있던 기록(주석은 사고 기록 — 지우지 않는다):
       · STEP 55: 3열 그리드에서 '내 장소 · FOR ME' 가 칸을 넘어 옆 탭 글자를 덮었다(실측 375폭).
         하단 바가 이미 '내 지역'으로 부르고 있으니 같은 말로 맞춘다 — 가는 곳은 그대로다.
       · PHASE 5 §4 — 이력. 사료를 '지금'처럼 보이지 않게 따로 둔다. (→ 이력 절이 제 제목과 HISTORY 배지를 단다)
       · 2026-09-07 지시 §18: 사용자가 찾을 수 있는 이름을 먼저 쓴다. "가정 실험/What-if"
         는 고급 기능 쪽 표현으로 남기고(탭 안 내용·main.js 는 그대로), 탭 이름만 바꾼다. (→ 절 제목 '시뮬레이션') */
  intel.innerHTML = `
    <button type="button" class="sheet-grip" aria-label="${i18n.ko ? '패널 높이 바꾸기' : 'Resize panel'}"><span></span></button>
    <div id="intel-body">
      <div class="intel-head">
        <strong class="ih-title" role="heading" aria-level="2"></strong>
        <button class="ui-x" id="intel-close" aria-label="${i18n.ko?'정보 닫기':'Close information'}">✕</button>
      </div>
      <div id="intel-content"></div>
    </div>`;
  root.appendChild(intel);

  // ⚠️ 시트 함수는 패널을 만든 바로 뒤에 둔다 — setIntelOpen 이 부르므로 그보다 먼저 선언돼 있어야 한다
  //    (const 는 선언 전에 부르면 죽는다). closeIntel 은 누를 때에야 부르므로 뒤에 있어도 된다.
  // ── 바텀시트 단계 (M1) ─────────────────────────────────────────────
  const SHEET_STEPS = ['peek', 'half', 'full'];
  const setSheet = (step) => {
    if (!SHEET_STEPS.includes(step)) return;
    intel.dataset.sheet = step;
  };
  const moveSheet = (dir) => {
    const i = SHEET_STEPS.indexOf(intel.dataset.sheet || 'half');
    if (dir < 0 && i === 0) { closeIntel(); return; }            // peek 에서 더 내리면 닫는다
    setSheet(SHEET_STEPS[Math.max(0, Math.min(SHEET_STEPS.length - 1, i + dir))]);
  };
  {
    const grip = intel.querySelector('.sheet-grip');
    let y0 = null;
    grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; grip.setPointerCapture?.(e.pointerId); });
    grip.addEventListener('pointerup', (e) => {
      if (y0 == null) return;
      const dy = e.clientY - y0;
      y0 = null;
      if (Math.abs(dy) < 24) {                                   // 누름 — 한 단씩 돈다(full 다음은 peek)
        const i = SHEET_STEPS.indexOf(intel.dataset.sheet || 'half');
        setSheet(SHEET_STEPS[(i + 1) % SHEET_STEPS.length]);
      } else {
        moveSheet(dy < 0 ? 1 : -1);                               // 위로 끌면 크게, 아래로 끌면 작게
      }
    });
    grip.addEventListener('pointercancel', () => { y0 = null; });
  }
  // ⚠️ 이름표는 이제 하단 메뉴 버튼이 단다. 그 버튼은 아래에서 만들어지므로
  //    여기서 applyPanelIdentity 를 부르면 bottomNav 가 아직 없어 죽는다(TDZ).
  //    renderNav() 뒤로 옮겼다.

  /* ---------- 하단 바 — 내 지역 / 무슨 일 / 날씨 / 바다 / 우주 / 더보기 ----------
     2026-09-07 개명: '내 곳' → '내 지역'. 인용한 원 지시문은 그대로 둔다.
     2026-09-07 v1/v2 역할 분리 지시 §15: "109개 SCENES 를 그대로 노출하지 않는다.
     최종 V2 메인 하단 메뉴: 내 곳 무슨 일 날씨 바다 우주 더보기." §17: 기본 화면은
     6탭 우측 패널이 아니라 대표 카드 하나 — 이 바가 그 대표 진입점이다.
     좌측 세로 손잡이·우측 패널은 지우지 않는다. "더보기"가 정확히 그 기존 화면을 연다. */
  const bottomNav = document.createElement('div');
  bottomNav.id = 'bottom-nav';
  bottomNav.setAttribute('role', 'navigation');
  bottomNav.setAttribute('aria-label', '하단 탐색 메뉴');
  navRoot = bottomNav;
  const NAV_ICON = {
    myplace: '<path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/>',
    feed: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><circle cx="12" cy="12" r="1.5"/>',
    weather: '<path d="M7 17a4 4 0 0 1 .6-7.9A6 6 0 0 1 19 11a3 3 0 0 1 0 6Z"/>',
    ocean: '<path d="M2 14c3-4 6-4 9 0s6 4 9 0"/><path d="M2 19c3-4 6-4 9 0s6 4 9 0"/>',
    space: '<rect x="9" y="9" width="6" height="6"/><path d="M2 12h5M17 12h5M4 9v6M20 9v6"/>',
    more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    explore: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    report: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>',
    // 새 자산을 만들지 않는다 — 사건 탭이 쓰던 표적 아이콘을 그대로 쓴다.
    intel: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><circle cx="12" cy="12" r="1.5"/>',
  };
  /* PHASE 5 §2 — 하단 바는 6개였고 그중 5개가 다른 진입점이 이미 가는 곳으로 다시 갔다.
     날씨·바다는 '탐색' 안의 도메인이 됐으므로 하단에서 뺀다(같은 곳으로 가는 길을 셋씩 두지 않는다).
     '더보기'는 '탐색'과 같은 곳이라 합친다. '무슨 일'은 '지금'으로 이름을 하나로 모은다(§15).
     리포트는 EARTHUS 의 핵심 콘텐츠라 최상위로 올린다(§5). */
  /* 2026-09-09 (2차) — 'Intelligence' 칸을 없앤다.
     하루 전에 만든 그 칸은 인텔리전스를 **목적지**로 만들었다. 맥락 없이 누르면
     일곱 탭이 통째로 열리고 이력·시뮬은 "현상을 고르면 …" 이라는 빈 약속만 냈다.
     이 저장소는 그것을 이미 불변식으로 금지하고 있었다 —
     tools/test_v2_ui_information_architecture.mjs 의 '불변식 1: Intelligence 는
     최상위 기능 메뉴가 아니다'. 내 직전 커밋이 그 시험을 깼다.

     인텔리전스는 지금 보고 있는 것의 **문맥층**이다. 그래서 하단 바에는
     인텔리전스가 아니라 **무엇을 보는가**만 남는다:
       지금    → 사건 문맥 (지구에서 지금 벌어지는 일)
       탐색    → 도메인 → 현상 → 그 현상의 문맥
       내 지역 → 사용자 문맥 (씬이 아니다 — 한 장소에서 태풍·지진·쓰나미·파고를
                 가로지른다. for-me-signal.js:210,360,392,442)
       리포트 · 우주
     어느 칸도 'Intelligence' 라고 적혀 있지 않다. 사람은 "인텔리전스가 어디 있지"
     를 묻지 않고 "지금 무슨 일이 있지 / 내 동네는 / 바다를 보자" 를 묻는다.

     ⚠️ '사건'을 하단에서 빼고 탐색 안으로 보내려다 되돌렸다. 실측했더니
     'hazards/feed' 는 phenomenon:null 이라 재해 절이 아니라 **접힌 '지구 표현·이동'**
     절로 빠진다(role:'entrypoint' 인 넷 중 land/locate 는 진짜 이동 조작이라
     role 만으로 가르는 일반 규칙은 그것까지 잘못 옮긴다). 묻어 두는 것은 이동이 아니라
     상실이다. 이 목록은 결국 이 저장소가 원래 갖고 있던 다섯이고,
     가드 시험의 원래 기대값이기도 하다.

     새 메뉴를 만들지 않았다. 뺀 것은 어제 내가 만든 'Intelligence' 칸 하나뿐이다. */
  const NAV_ITEMS = [
    { id: 'feed', ko: '지금', en: 'Now' },
    { id: 'explore', ko: '탐색', en: 'Explore' },
    { id: 'myplace', ko: '내 지역', en: 'My place' },
    { id: 'report', ko: '리포트', en: 'Reports' },
    { id: 'space', ko: '우주', en: 'Space' },
  ];
  // 언어를 바꾸면 라벨도 바뀐다. 한 번만 그리면 영어 화면에 한국어가 남는다(실측으로 잡았다).
  const renderNav = () => {
    const cur = bottomNav.querySelector('button.on');
    const curId = cur ? cur.dataset.nav : null;
    bottomNav.innerHTML = NAV_ITEMS.map((n) => {
      const lbl = i18n.ko ? n.ko : n.en;
      // P0 AX: 하단 '지금'과 타임스트립 '지금'이 리더에 겹쳐 들린다 — 내비는 사건 문맥임을 밝힌다.
      const al = n.id === 'feed' ? (i18n.ko ? '지금 일어나는 일' : 'Happening now') : lbl;
      return `<button type="button" data-nav="${n.id}" aria-label="${al}"${n.id === curId ? ' class="on"' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true">${NAV_ICON[n.id]}</svg><span>${lbl}</span>
    </button>`; }).join('');
    /* innerHTML 을 다시 쓰면 방금 단 이름표(title·aria-label)가 버튼과 함께 사라진다.
       그래서 부르는 쪽 순서에 맡기지 않고 **그리는 쪽**이 다시 단다.
       (refreshPanelIdentity 가 이름표→renderNav 순서라 이름표가 지워지고 있었다.) */
    applyPanelIdentity(getPhenomenonContext());
  };
  renderNav();
  root.appendChild(bottomNav);

  // 씬 목록 패널에서 특정 그룹(날씨·바다)까지 열어 스크롤해 보여준다 — 접혀 있었다면 편다.
  const gotoScene = (brand, sceneId) => {
    // 질문(sim-q · satellite-track)이 직접 우주 문을 열 때도 하단 불이 따라오게 한다 —
    // 전에는 하단 클릭 경로만 spaceDoor 를 켜서 질문 진입의 우주는 불이 꺼져 있었다.
    if (brand === 'aetherus' && sceneId === 'space') spaceDoor = true;
    // 펼침을 먼저 정하고 그린다. 순서가 뒤바뀌면 접힌 채로 그려 놓고 상태만 바꿔
    // 하단 바로 들어온 사용자는 빈 제목만 보게 된다(도메인 기본 접힘 이후 생긴 문제).
    collapsedSections.delete(sceneId);
    openPanel(brand);
    requestAnimationFrame(() => {
      panel.querySelector(`[data-section="${sceneId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  bottomNav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-nav]');
    if (!btn) return;
    // .on 은 여기서 쓰지 않는다 — syncIntelNav 가 상태에서 계산하는 유일한 화가다.
    // 여기서 같이 쓰면 두 화가가 싸워 두 칸이 동시에 켜졌다(2026-09-10 live 실측).
    switch (btn.dataset.nav) {
      /* 두 칸 다 '문맥'이다. 같은 칸을 다시 누르면 닫힌다(없앤 손잡이와 같은 몸짓).
         맥락 없이 열리는 문은 이제 없다 — 여는 순간 applyCapabilityGating 이
         능력 없는 탭을 지운다(setIntelOpen). */
      case 'feed': if (intelOpen && curTab === 'feed') closeIntel(); else openIntel('feed'); break;
      case 'myplace': if (intelOpen && curTab === 'my') closeIntel(); else openIntel('my'); break;
      case 'explore': openPanel('earthus'); break;
      case 'report': openPanel('report'); break;
      case 'space': spaceDoor = true; gotoScene('aetherus', 'space'); break;
    }
    syncIntelNav();
  });

  const intelBody = intel.querySelector('#intel-body');
  const intelContent = intel.querySelector('#intel-content');
  let intelOpen = false;
  /* 열기: 탭을 주면 그 탭으로, 안 주면 지금 탭 그대로. 이미 열려 있으면 다시 그린다.
     리포트→현상·리포트→분석·하단바가 전부 이 문으로만 들어온다. */
  function openIntel(tab) {
    // 2026-09-23 반박 검증 — 지점 카드('point')는 지구를 누른 그 순간의 한 장이다. 탭 없이 여는 길(국가·권역 선택,
    //   사건 표식, 검색의 나라)이 남아 있던 'point' 로 들어가 **옛 자리의 기온 카드**를 다시 띄웠다 → '선택 자료'로 연다.
    if (!tab && curTab === 'point') tab = 'now';
    if (tab) showTab(tab, 'intent');
    setIntelOpen(true);
  }
  let curTab = 'feed';
  // INTEGRATION-3 §11 — '마지막 사용자 의도'. showTab() 아래 설명 참고.
  let tabIntent = 'feed';
  /* (2026-09-24 정정) 한 장 시트 — curTab 은 이제 **바탕 문맥**만 갖는다: 'feed'(사건 목록 · 사건을 고르면 그 사건의 한 장) ·
     'my'(내 지역) · 'now'(고른 자료의 값 카드) · 'point'(지점 카드). 예전 탭 이름 중 나머지 넷(why·next·history·scenario)은
     문맥이 아니라 **한 장 안의 절**이다 — showTab 이 그 절로 굴리고(pendingScroll) 접힌 절을 편다(openSecs).
     바깥 이름(showTab·openIntel·NAV_FOR_TAB[curTab]·intel.dataset.tab)은 그대로다 — main.js 의 40여 호출부가 쓴다. */
  const SECTION_TABS = new Set(['why', 'next', 'history', 'scenario']);
  const openSecs = new Set();      // 편 절·접이 id — 재생 중 220 ms 마다 다시 그려도 사람이 편 것이 접히지 않게
  let pendingScroll = null;        // 다음 그리기 뒤에 굴러 갈 곳 — 절 id 또는 'top'
  const feedRoomOpen = () => !!(hooks.feedSelected && hooks.feedSelected());
  // 지금 시트가 무엇을 그리나 — 'feed'(목록) · 'my' · 'selection'(값 → 근거 → 예보 → 이력 → 비교 → 해석 → 시뮬레이션)
  const intelCtx = () => (curTab === 'my' ? 'my' : curTab === 'feed' && !feedRoomOpen() ? 'feed' : 'selection');

  // 지금 켜져 있는 레이어 — 씬 매니페스트를 한 번 훑어 모은다.
  const activeLayers = () => {
    const rows = [];
    SCENES.forEach((s) => s.layers.forEach((l) => {
      const st = (hooks.getLayerState && hooks.getLayerState(s.id, l)) || {};
      if (st.on) rows.push({ s, l, st, key: `${s.id}/${l.id}` });
    }));
    return rows;
  };

  /* PHASE 5 §4 — 이력 탭. 값을 새로 만들지 않는다. 이 현상에 속한 자료 중
     진리등급이 사료(HISTORY)인 것만 모아, 지금 자료와 섞이지 않게 따로 보여 준다.
     선택이 없거나 history 능력이 없으면 탭 자체가 안 보인다(위 CAP_TAB). */
  const historyHtml = () => {
    const ctx = getPhenomenonContext();
    const ko = i18n.ko;
    if (!ctx) {
      return `<div class="card"><div class="card-b">${ko ? '현상을 고르면 그 현상의 과거 기록을 봅니다.' : 'Pick a phenomenon to see its past record.'}</div></div>`;
    }
    const name = ko ? ctx.label.ko : ctx.label.en;
    const members = PHEN_ENTRY.get(ctx.phenomenonId);
    const rows = members ? members.members : [];
    // 사료와 지금을 갈라 놓는다. 판단 기준은 우리가 정한 진리등급표다.
    const past = rows.filter((m) => layerBadge(m.key) && /HISTORY|기록/.test(layerBadge(m.key)));
    const listed = past.length ? past : rows;
    const body = listed.map((m) => `<div class="stat">
        <span class="k">${safeText(i18n.layer(m.l.id, m.l.name, m.s.id))}</span>
        <span class="v">${layerBadge(m.key) || renderBadge(m.l.state)} ${safeText(m.l.src)}</span>
      </div>`).join('');
    return `<div class="card"><div class="card-h">${safeText(name)} · ${ko ? '이력' : 'History'} ${renderBadge('HISTORY')}</div>
      <div class="card-b">
        <p class="hist-lede">${ko
          ? '아래는 <b>지나간 기록</b>입니다. 지금 상태가 아닙니다.'
          : 'Below is the <b>past record</b>. It is not the current state.'}</p>
        ${safeText(ctx.temporalMode || '')
          ? `<div class="stat"><span class="k">${ko ? '기간' : 'Period'}</span><span class="v">${safeText(ctx.temporalMode)}</span></div>` : ''}
        ${body}
        <p class="hist-lede">${ko
          ? '값을 새로 계산하지 않습니다 — 각 자료의 원 출처와 기준 시각을 그대로 씁니다.'
          : 'No value is recomputed here — each source keeps its own reference time.'}</p>
      </div></div>`;
  };

  const evidenceRow = ({ s, l, st }) => `<div class="stat">
      <span class="k">${i18n.layer(l.id, l.name, s.id)}</span>
      <span class="v">${layerBadge(`${s.id}/${l.id}`) || renderBadge(l.state)} ${l.src}${st.note ? ` · ${st.note}` : ''}</span>
    </div>`;

  // WHY·NEXT 는 오랫동안 "EXPLORER PRO 에서 제공 예정입니다" 한 줄만 있는 벽이었다.
  // 여섯 탭 중 둘을 눌렀을 때 아무것도 없으면, 돈을 낼 이유를 묻기 전에 제품이
  // 안 끝난 것으로 읽힌다. 아직 없는 것(근거 그래프·불확실성 폭)은 그대로 아직이라고
  // 적되, **이미 가진 것**을 먼저 편다 — 지금 화면이 딛고 선 출처와 진리등급,
  // 그리고 기관이 말한 앞. 그게 EARTHUS 가 파는 것의 본체다.
  // (2026-09-24 정정) room = 사건 한 장 안의 근거 절. 사건 방(intel-feed.js roomHtml)이 이미 인과 주장 게이트(WHY)와 EVIDENCE 카드를
  //   싣고 있어 같은 게이트 문장·'고른 사건' 카드를 한 장에 두 번 세우지 않는다 — 지금 켜 놓은 근거 카드만 더한다.
  const whyHtml = ({ room = false } = {}) => {
    const rows = activeLayers();
    const picked = !room && hooks.feedSelected && hooks.feedSelected();
    return `
      ${room ? '' : `<div class="card"><div class="card-h">${i18n.t('whyTitle')}</div>
        <div class="card-b">${i18n.t('whyGate')}</div></div>`}
      ${picked ? `<div class="card"><div class="card-h">${i18n.t('eventPicked')}</div>
        <div class="card-b"><b>${picked.title}</b><br/>
        <button class="feed-back" data-action="shell-open-feed" style="margin:8px 0 0">${i18n.t('eventOpen')}</button></div></div>` : ''}
      <div class="card"><div class="card-h">${i18n.t('whyNow')} <span class="feed-cnt">${rows.length}</span></div>
        <div class="card-b">${rows.length
    ? rows.map(evidenceRow).join('')
    : `${i18n.t('whyEmpty')}<br/><button class="feed-back" data-action="shell-open-menu" style="margin:8px 0 0">${i18n.t('openMenu')}</button>`}</div></div>
      ${room ? '' : `<div class="card"><div class="card-b"><span class="paysub">${i18n.t('whyPro')}</span></div></div>`}`;
  };

  // 선택 사건의 기관별 +24h/+48h — 사건을 열면 켜진 레이어와 무관하게 NEXT 가 채워진다(지시서 D-3).
  const eventNextHtml = () => {
    const rows = hooks.feedNext ? hooks.feedNext() : [];
    const picked = hooks.feedSelected && hooks.feedSelected();
    if (!picked || !rows.length) return '';
    const cell = (s) => (s ? `${s.lat.toFixed(1)}°, ${s.lon.toFixed(1)}°${s.windMs != null ? ` · ${s.windMs} m/s` : ''}${s.categoryKo ? ` · ${s.categoryKo}` : ''}` : '—');
    const nameKo = (a) => ({ KMA: '한국 기상청', JMA: '일본 기상청', NHC: '미국 허리케인센터', ECMWF: 'ECMWF 모델' }[a] || a);
    return `<div class="card"><div class="card-h">${picked.title} — ${i18n.ko ? '기관별 다음 위치' : 'Next positions by agency'}</div>
      <div class="card-b"><div class="wrap"><table class="room-cmp"><thead><tr><th>기관</th><th>+24h</th><th>+48h</th><th>24h 방향</th></tr></thead><tbody>${rows.map((r) =>
        `<tr><td>${nameKo(r.agency)} ${renderBadge(r.official ? 'OFFICIAL_FORECAST' : 'MODEL_SIGNAL')}</td><td>${cell(r.h24)}</td><td>${cell(r.h48)}</td><td>${r.headingKo || '—'}</td></tr>`).join('')}</tbody></table></div>
      <div class="room-sub">${i18n.ko ? '공식 예보와 모델을 합치지 않습니다 — 기관마다 발표 시각이 다릅니다' : 'Official forecasts and models are never merged'}</div></div></div>`;
  };

  const nextHtml = () => {
    // '앞을 말하는 자료' = 예보·특보. 진리등급 어휘가 정본이라 이름으로 가른다.
    const rows = activeLayers().filter(({ l }) => /FORECAST|WARNING|MODEL/.test(String(l.state)));
    return `${eventNextHtml()}
      <div class="card"><div class="card-h">${i18n.t('nextTitle')}</div>
        <div class="card-b">${i18n.t('nextNote')}</div></div>
      <div class="card"><div class="card-h">${i18n.t('nextTitle').split('—')[0].trim()} <span class="feed-cnt">${rows.length}</span></div>
        <div class="card-b">${rows.length ? rows.map(evidenceRow).join('') : i18n.t('nextEmpty')}
          <br/><button class="feed-back" data-action="shell-play5d" style="margin:8px 0 0">${i18n.t('nextPlay')}</button></div></div>
      <div class="card"><div class="card-b"><span class="paysub">${i18n.t('nextPro')}</span></div></div>`;
  };

  /* ── 한 장 시트 (2026-09-24 정정) ──────────────────────────────────────────────────────────────────────
     예전에는 탭 하나 = 화면 하나였다(사건 · 내 지역 · 선택 자료 · 자료의 근거 · 예보·예정 · 이력 · 시뮬레이션).
     이제 무엇을 골랐으면(현상 · 지점 · 나라 · 바다 · 사건) 그것의 **한 장**이 7단계 문법 순서로 이어진다:
       ①② 값(값 카드 · 지점 카드 · 사건 방) → ③ 자료의 근거 → ④ 예보·예정 → 이력 → ⑤ 모델 비교 → ⑥ Intelligence → ⑦ 시뮬레이션
     재료가 없는 절은 자리를 지키고 이유 한 줄을 말한다(지어내지 않는다 · 숨기지 않는다). 긴 절은 접혀 시작하고 '더 보기'가
     그 자리에서 편다 — 다른 화면으로 가지 않는다. 절은 문자열이 바뀐 것만 다시 쓴다(재생 중 220 ms 마다 와도 단추·이유 한 줄이
     손가락 밑에서 사라지지 않게 — 아래 지점 카드 기록과 같은 까닭). */
  let sheetLayout = '';            // 지금 깔린 절 목록 — 바뀌면 뼈대를 새로 깐다
  const secCache = new Map();      // 절 id → 마지막으로 쓴 글
  let lastCtxKey = '';             // 문맥이 바뀌면 맨 위부터 보인다
  const SEC_LABEL = {
    why: ['자료의 근거', 'Evidence'], next: ['예보·예정', 'Forecast & upcoming'], history: ['이력', 'History'],
    compare: ['모델 비교', 'Model comparison'], intel: ['Intelligence 해석', 'Intelligence'], scenario: ['시뮬레이션', 'Simulation'],
  };
  const secLabel = (id) => safeText(SEC_LABEL[id] ? SEC_LABEL[id][i18n.ko ? 0 : 1] : id);
  // 접힌 절 — 제목 줄이 곧 '더 보기'다. 편 상태는 openSecs 가 기억한다(toggle 위임).
  /* (2026-09-24 정정 · 적대 검토) 예전: `${openSecs.has(id) ? ' open' : ''}` 를 글에 구워 넣었다. 그러면 사람이 '더 보기'를 누른 바로
     다음 그리기(재생 중 220 ms)에서 글이 달라져 절 전체를 innerHTML 로 갈았고, 그 안에서 편 '현재 켜진 자료'(끄기 단추)가 접혔다
     (402×714 실측: 재생 3 초에 근거 절 12번 교체 · 안쪽 접이 열림 → 닫힘). 이제 글에는 펴짐을 싣지 않고, 그린 뒤 syncFolds 가 openSecs 로 맞춘다. */
  const foldHtml = (id, body, label = secLabel(id)) => `<details class="is-fold" data-intel-more="${id}"><summary><span class="is-h">${label}</span><span class="is-more" aria-hidden="true">${i18n.ko ? '더 보기' : 'More'}</span><span class="is-less" aria-hidden="true">${i18n.ko ? '접기' : 'Less'}</span></summary><div class="is-b">${body}</div></details>`;
  // 재료가 없는 절 — 자리를 지키고 이유 한 줄.
  // (2026-09-24 정정 · 적대 검토) 절 제목은 스크린리더에도 제목이다(role=heading) — 예전 탭 단추 이름이 하던 길잡이를 대신한다.
  const lineHtml = (id, why) => `<div class="is-h" role="heading" aria-level="3">${secLabel(id)}</div><p class="is-why">${safeText(why)}</p>`;
  const openHtml = (id, body) => `<div class="is-h" role="heading" aria-level="3">${secLabel(id)}</div>${body}`;
  // 접이의 펴짐을 사람이 편 대로(openSecs) 맞춘다 — 글을 새로 쓴 절도, 그대로 둔 절도.
  const syncFolds = () => {
    intelContent.querySelectorAll('details[data-intel-more]').forEach((d) => {
      const want = openSecs.has(d.dataset.intelMore);
      if (d.open !== want) d.open = want;
    });
  };
  // 절 글을 갈 때 그 안의 다른 접이(예: 근거 절의 '현재 켜진 자료')가 펴져 있었으면 편 채로 둔다 — 요약 글로 짝짓는다.
  //   예전 머리말도 매번 새로 그려져 이 접이가 접혔지만, 그때는 탭 화면 맨 위라 재생 중 손댈 일이 드물었다. 이제는 절 안이다.
  const writeKeepingDetails = (el, html) => {
    const keep = new Set([...el.querySelectorAll('details:not([data-intel-more])')].filter((d) => d.open)
      .map((d) => (d.querySelector(':scope > summary') || {}).textContent));
    el.innerHTML = html;
    if (keep.size) el.querySelectorAll('details:not([data-intel-more])').forEach((d) => {
      if (keep.has((d.querySelector(':scope > summary') || {}).textContent)) d.open = true;
    });
  };
  const headTitleEl = intel.querySelector('.intel-head .ih-title');
  // 머리 — 무엇을 보고 있나 한 줄 + ✕. 탭 이름을 늘어놓지 않는다.
  const renderHead = (cx) => {
    const ko = i18n.ko;
    let t = '';
    if (cx === 'feed') t = ko ? '오늘의 지구 사건' : "Today's Earth events";
    else if (cx === 'my') t = ko ? '내 지역' : 'My place';
    else if (curTab === 'feed') { const sel = hooks.feedSelected && hooks.feedSelected(); t = sel ? String(sel.title || '') : ''; }
    // 지점 카드의 머리글(현상 · 좌표)을 머리로 올린다 — 카드 안의 같은 줄은 CSS 가 숨긴다(index.html 한 장 시트 절).
    else if (curTab === 'point') { const k = intelContent.querySelector('.point-card .pc-kicker'); t = k ? k.textContent.trim() : ''; }
    else if (selectedMenu) t = ko ? questionForLayer(selectedMenu.s.id, selectedMenu.l.id) || selectedMenu.l.name : selectedMenu.l.name;
    else { const fs = hooks.getFocusSel && hooks.getFocusSel(); t = fs ? (fs.nameKo || fs.name || '') : (ko ? '선택한 자리' : 'Selection'); }
    if (headTitleEl && headTitleEl.textContent !== t) headTitleEl.textContent = t;
    // 고른 현상의 이름이 머리에 섰다는 표시 — 예전 머리말의 <strong>(고른 현상의 질문)을 세던 계측(measure.js t1)이 읽는다.
    if (headTitleEl) headTitleEl.dataset.phen = cx === 'selection' && selectedMenu ? '1' : '';
  };
  // 굴리는 것은 #intel-body 다(overflow-y:auto 인 쪽 — main.js revealNoteCard 기록). 머리는 붙어 있으니 그 높이만큼 덜 굴린다.
  const scrollToEl = (el) => {
    // peek(118px · overflow:hidden)에서 굴리면 손잡이·✕ 가 밀려 나가 되돌릴 수 없다 — 먼저 half(main.js revealNoteCard 와 같은 함정).
    if (intel.dataset.sheet === 'peek') setSheet('half');
    const head = intel.querySelector('.intel-head');
    intelBody.scrollTop += el.getBoundingClientRect().top - intelBody.getBoundingClientRect().top - (head ? head.offsetHeight : 0) - 4;
  };
  const consumePendingScroll = () => {
    if (!pendingScroll || !intelOpen) return;
    const t = pendingScroll;
    pendingScroll = null;
    if (t === 'top') { intelBody.scrollTop = 0; return; }
    const el = intelContent.querySelector(`:scope > [data-intel-sec="${t}"]`);
    if (!el) return;
    const d = el.querySelector('details[data-intel-more]');
    if (d && !d.open) { d.open = true; openSecs.add(d.dataset.intelMore); }
    scrollToEl(el);
  };
  // 지점 카드 아래의 '표시 설정' — 이 색면의 조작(등치선·간격·강수 누적·H/L)이 든 카드를 **같은 값 절 안에** 접어 둔다.
  //   예전 [표시 설정] 은 'now' 로 옮겨 지점 카드를 조작 카드로 갈아 끼웠다 — PD 가 막은 '버튼 누르면 다른 안내화면'이었다.
  //   조작 카드의 글은 field-layer.js 가 [data-field-card] 를 찾아 제자리에서 바꾼다 — 여기서 다시 쓰지 않는다.
  const pointSettingsHtml = () => {
    const card = hooks.getPointSettings ? hooks.getPointSettings() : '';
    // 조작 카드의 글은 lockedNote 본문(getNowHtml 의 .card-b 안)으로 쓰이던 것이다 — 같은 틀에 담아야 같은 글자 크기·단추 모양이 된다.
    return card ? foldHtml('settings', `<div class="card"><div class="card-b">${card}</div></div>`, safeText(i18n.ko ? '표시 설정' : 'Display settings')) : '';
  };
  const renderValue = (el, point, room) => {
    if (!point) {
      const html = room ? hooks.getFeed() : hooks.getNow();
      if (secCache.get('now') !== html) { el.innerHTML = html; secCache.set('now', html); }
      return;
    }
    // 2026-09-23 PD — 색면 현상을 고른 채 지구를 누르면 **한 장**(js/point-card.js). 탭 단추가 없는 값이라
    // 이 갈래가 없으면 마지막 else 로 떨어져 예보·예정 화면이 그려진다.
    // (2026-09-24 정정) 이제 이 갈래는 한 장 시트의 값 절이다(renderSheet) — 아래에 근거·예보·이력·시뮬레이션 절이 이어진다.
    // 재생 중에는 220 ms 마다 여기로 온다. 카드를 통째로 갈면 누르던 단추가 손가락 밑에서 바뀌고(click 이 사라진다)
    // 떠 있던 이유 한 줄(sim-why)도 지워진다 — 같은 카드(data-key)면 시각 따라 바뀌는 덩어리([data-pc-live])만
    // 제자리에서 바꾼다(field-layer.js:1012 의 [data-field-live] 와 같은 까닭).
    const html = hooks.getPoint ? hooks.getPoint() : '';
    const cur = el.querySelector('.point-card[data-key]');
    const key = (html.match(/data-key="([^"]*)"/) || [])[1];
    if (cur && key && cur.dataset.key === key) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const liveNew = tmp.querySelector('[data-pc-live]');
      const liveCur = cur.querySelector('[data-pc-live]');
      if (liveNew && liveCur) { if (liveCur.innerHTML !== liveNew.innerHTML) liveCur.innerHTML = liveNew.innerHTML; } else el.innerHTML = html + pointSettingsHtml();
    } else {
      // 새로 누른 자리(카드 번호가 바뀜)면 편 절을 접고 맨 위부터 — 예전 자리의 이력이 펼쳐진 채 남지 않게.
      if (!cur || !key || String(cur.dataset.key).split('.')[0] !== key.split('.')[0]) { openSecs.clear(); if (!pendingScroll) pendingScroll = 'top'; }
      el.innerHTML = html + pointSettingsHtml();
    }
  };
  const renderSheet = (p) => {
    const ko = i18n.ko;
    const room = curTab === 'feed';     // 사건을 고른 사건 문맥 — 값 절이 사건 방이다
    const point = curTab === 'point';
    const ctx = getPhenomenonContext();
    const name = ctx ? (ko ? ctx.label.ko : ctx.label.en) : '';
    const secs = [{ id: 'now' }];       // ①② 값 — 문장이 수치보다 앞에 서지 않는다(evidence-first)
    // ③ 자료의 근거 — 예전 머리말의 출처 줄·능력 줄·선택 장소·켜진 자료(끄기 단추) + 지금 켜 놓은 근거
    secs.push({ id: 'why', html: foldHtml('why', `<div class="information-context">${p.srcLine}${p.phenomenonLine()}${p.placeLine}${p.timeNote}${p.activeDetails}</div>${whyHtml({ room })}`) });
    // ④ 예보·예정 — 능력 표(secGate) · 고른 사건의 기관별 다음 위치 · 켜 놓은 예보·특보 중 하나라도 있으면 편다
    const evNext = eventNextHtml();
    const fcRows = activeLayers().filter(({ l }) => /FORECAST|WARNING|MODEL/.test(String(l.state)));
    secs.push({ id: 'next', html: secGate.next || evNext || fcRows.length
      ? foldHtml('next', nextHtml())
      : lineHtml('next', ctx
        ? (ko ? `${name}에는 연결된 예보·예정 자료가 없습니다.` : `No forecast is connected for ${name}.`)
        : (ko ? '켜 놓은 자료 중 앞을 말하는 것이 없습니다 — 날씨·재해 메뉴의 예보·특보를 켜면 여기에 모입니다.' : 'Nothing on speaks about the future — turn on a forecast or warning and it collects here.')) });
    // 이력 — 사료는 '지금'과 섞지 않는다(historyHtml)
    secs.push({ id: 'history', html: secGate.history
      ? foldHtml('history', historyHtml())
      : lineHtml('history', ctx
        ? (ko ? `${name}에는 연결된 지난 기록(사료)이 없습니다.` : `No past record is connected for ${name}.`)
        : (ko ? '현상을 고르면 그 현상의 과거 기록을 봅니다.' : 'Pick a phenomenon to see its past record.')) });
    // ⑤ 모델 비교 — 지점 카드는 자기 입구([모델 비교] · 누르면 이유)를 싣는다. 한 장에 두 번 두지 않는다.
    if (!point) {
      secs.push({ id: 'compare', html: lineHtml('compare', evNext
        ? (ko ? '기관·모델별 다음 위치는 위 예보·예정 절의 표에 나란히 둡니다 — 공식 예보와 모델을 합치지 않습니다.' : 'Next positions by agency and model sit side by side in the table under Forecast above — never merged.')
        : (ko ? '이 선택에는 나란히 비교할 두 번째 모델 자료가 아직 연결되지 않았습니다.' : 'No second model is connected to compare against for this selection yet.')) });
    }
    // ⑥ Intelligence — 패킷이 실려 있을 때만(빈 절 금지 · 계약 §C-0). 지점 카드는 같은 패킷의 WHY·NEXT 를 이미 편다.
    const strip = point ? '' : p.intelStripBlock();
    // (2026-09-24 정정 · 적대 검토) 예전: if (strip) secs.push(...) — 패킷이 늦게 도착해 띠가 '' → 글로 바뀌면 절 목록(sheetLayout)이
    //   바뀌어 시트 전체를 새로 깔았다(읽던 자리 0 으로 · 모든 절 다시 쓰기). 자리는 늘 두고, 패킷이 없으면 빈 절(보이는 것 없음)로 둔다.
    secs.push({ id: 'intel', html: strip ? openHtml('intel', strip) : '' });
    // ⑦ 시뮬레이션 — 궁금한 점(계산 질문 · 없는 엔진은 누르면 이유) + 가정 장면 입구. 없으면 이유 한 줄.
    const qs = `${p.simQuestionsHtml()}${p.regionLine()}${p.mapContextQuestions()}`;
    const fsel = hooks.feedSelected && hooks.feedSelected();
    const simOk = secGate.scenario || (room && fsel && fsel.kind === 'TC');   // 태풍 사건 = 공식 +24h 기준선 실험(getScenario)
    const simWhy = ctx
      ? (ko ? `${name}에는 시뮬레이션 엔진이 없습니다.` : `There is no simulation engine for ${name}.`)
      : (ko ? '이 선택에는 시뮬레이션 엔진이 연결되어 있지 않습니다.' : 'No simulation engine is connected for this selection.');
    /* (2026-09-24 정정 · 적대 검토) 예전 식: simOk ? 질문+장면 : qs ? 질문만 : 이유 한 줄.
       ① 사람이 시뮬레이션을 직접 부른 경우(showTab('scenario') — 태풍 가정 장면 메뉴 · 쓰나미 질문 · FOR ME [시뮬레이션] · 예전 탭)에는
          예전 시뮬레이션 탭이 능력 표와 무관하게 getScenario() 를 그렸다. 능력 표에 걸려 그 본문(가정 장면 [시나리오 시작 →] · 기준선 안내)이
          사라지면 길을 잃는다(402×714 실측: 아무것도 고르지 않고 부르면 이유 한 줄뿐이었다) — 부른 사람에게는 그대로 싣는다.
       ② 능력이 없는데 질문(궁금한 점)만 있으면 '시뮬레이션' 제목 아래 질문만 서서 엔진이 있는 것처럼 읽혔다 — 이유 한 줄을 먼저 둔다. */
    const simAsked = tabIntent === 'scenario';
    secs.push({ id: 'scenario', html: simOk || simAsked ? openHtml('scenario', qs + hooks.getScenario())
      : `${lineHtml('scenario', simWhy)}${qs}` });

    const layout = `${curTab}|${secs.map((x) => x.id).join(',')}`;
    if (layout !== sheetLayout) {
      sheetLayout = layout;
      secCache.clear();
      intelContent.innerHTML = secs.map((x) => `<section class="intel-sec${x.id === 'now' ? ' intel-sec-value' : ''}" data-intel-sec="${x.id}"></section>`).join('');
    }
    /* (2026-09-24 정정 · 적대 검토) 재생 중(220 ms) 자리 붙잡기 — 굴려 내려 이력을 보던 사람 앞에서 글이 100 px 밀렸다(402×714 실측:
       근거 절을 펴 둔 채 재생하면 이력 절 top 333 → 434). 브라우저의 스크롤 붙잡기(overflow-anchor)는 붙잡은 노드가 innerHTML 로
       갈리면 놓친다 — 절(<section>) 자체는 갈지 않으니 **보이는 첫 절의 top** 을 쓰기 전후로 재어 그만큼 되돌린다. */
    let anchor = null, anchorTop = 0;
    if (intelBody.scrollTop > 0) {
      const head = intel.querySelector('.intel-head');
      const vTop = intelBody.getBoundingClientRect().top + (head ? head.offsetHeight : 0);
      // 보이는 칸 안에서 **시작하는** 첫 절을 붙잡는다 — 위로 걸친 절(예: 편 근거 절)이 제 안에서 자라도 그 아래가 밀리지 않게.
      //   칸 안에서 시작하는 절이 없으면(긴 절 한가운데를 읽는 중) 걸친 그 절을 붙잡는다.
      const vBottom = intelBody.getBoundingClientRect().bottom;
      for (const s of intelContent.children) {
        const r = s.getBoundingClientRect();
        if (r.bottom <= vTop) continue;
        if (!anchor) { anchor = s; anchorTop = r.top; }
        if (r.top >= vTop && r.top < vBottom) { anchor = s; anchorTop = r.top; break; }
        if (r.top >= vBottom) break;
      }
    }
    for (const x of secs) {
      const el = intelContent.querySelector(`:scope > [data-intel-sec="${x.id}"]`);
      if (!el) continue;
      if (x.id === 'now') { renderValue(el, point, room); continue; }
      if (secCache.get(x.id) !== x.html) { writeKeepingDetails(el, x.html); secCache.set(x.id, x.html); }
    }
    syncFolds();   // (2026-09-24 정정 · 적대 검토) 펴짐은 글이 아니라 openSecs 가 정한다(위 foldHtml 기록)
    if (anchor && anchor.isConnected && !pendingScroll) {
      const d = anchor.getBoundingClientRect().top - anchorTop;
      if (Math.abs(d) >= 1) intelBody.scrollTop += d;
    }
  };

  const renderIntel = () => {
    const scrollTop=intelContent.scrollTop;
    const cx = intelCtx();
    intel.dataset.ctx = cx;              // CSS·시험이 읽는다 — feed | my | selection
    const ctxKey = `${cx}|${curTab}`;
    if (ctxKey !== lastCtxKey) { lastCtxKey = ctxKey; if (!pendingScroll) pendingScroll = 'top'; }
    // (2026-09-24 정정) 예전 탭 갈래(now · scenario · history · why · point · next)는 위 renderSheet 의 절이 됐다.
    //   여기서는 사건 목록과 내 지역만 예전처럼 한 번에 그린다.
    if (cx === 'feed') {
      intelContent.innerHTML = hooks.getFeed();
    } else if (cx === 'my') {
      intelContent.innerHTML = hooks.getMy ? hooks.getMy() : '';
    }
    const active=activeLayers();
    const picked=hooks.getFocusSel?.();
    /* PHASE 2 STEP 2.5 — INTELLIGENCE 는 별도 최상위 메뉴가 아니라 각 현상의 능력이다.
       선택한 현상이 무엇을 할 수 있는지 여기서 한 줄로 말한다. 없는 능력은 적지 않는다 —
       '준비 중'으로 위장하면 사용자는 곧 열린다고 읽는다. */
    const CAP_KO = { current: '현재', history: '사료', intelligence: '해석', forecast: '예보', simulation: '시뮬레이션', evidence: '근거', report: '리포트' };
    const CAP_EN = { current: 'Current', history: 'History', intelligence: 'Intelligence', forecast: 'Forecast', simulation: 'Simulation', evidence: 'Evidence', report: 'Report' };
    const phenomenonLine = () => {
      const ctx = getPhenomenonContext();
      if (!ctx) return '';
      const dict = i18n.ko ? CAP_KO : CAP_EN;
      const on = Object.keys(dict).filter((k) => ctx.capabilities[k]);
      if (!on.length) return '';
      const name = i18n.ko ? ctx.label.ko : ctx.label.en;
      /* PHASE 3 §15 — 리포트 능력이 참인데 갈 곳이 없었다(현상 7종·레이어 14개에 진입점 0).
         실제 생성기가 있는 종류만 링크한다. 없는 보고서를 '준비 중'으로 걸지 않는다.
         목적지는 기존 1.0 리포트 화면이다 — v2 전용 렌더러를 새로 만들지 않는다. */
      const kinds = ctx.phenomenonId ? reportKindsForPhenomenon(ctx.phenomenonId) : [];
      const parts = on.map((k) => (k === 'report' && kinds.length
        ? `<a class="cap-report" href="/lab-reports.html?kind=${encodeURIComponent(kinds[0])}" target="_blank" rel="noopener">${dict[k]}</a>`
        : dict[k]));
      return `<div class="information-caps">${safeText(name)} · ${parts.join(' · ')}</div>`;
    };
    /* 지시서 §6·§8 — 궁금한 점. 선택한 현상에서 실제로 부를 수 있는 계산(available)만
       실행 버튼이 되고, 엔진이 없는 질문은 눌렀을 때 이유를 말한다(sim-why).
       기본 노출은 3개까지 — 레지스트리가 잘라 준다. 입력이 없어 못 부르는 것은
       not_evaluable 로 내려가 실행 대신 입력 방법을 안내한다(§19 validate input). */
    /* 질문 블록 공용 마크업 — 현상 문맥(simQuestionsHtml)과 지도 문맥(mapContextQuestions)이
       같은 문으로 그린다. 두 경로가 다른 마크업이면 어느 쪽이 진짜 능력인지 알 수 없다. */
    const questionBlock = (qs) => (qs.length
      ? `<div class="sim-questions"><div class="sq-h">${i18n.ko?'궁금한 점':'Questions'}</div>`
        + qs.map((q) => (q.runnable
          ? `<button class="sq-q" data-action="sim-q" data-sim="${q.action}">${safeText(q.text)}</button>`
            // limited(장면·기관 인용)는 누를 수 있어도 한계 문장을 버튼 아래에 붙인다 — 2026-09-20 §G-2
            + (q.status === 'limited' && q.reason ? `<div class="sq-why sq-limit">${safeText(q.reason)}</div>` : '')
          : `<button class="sq-q sq-na" data-action="sim-why" data-why="${safeText(q.reason)}">${safeText(q.text)}</button>`)).join('')
        + `<button class="sq-ask" data-action="shell-open-ask">${i18n.ko?'직접 질문하기':'Ask directly'}</button></div>`
      : '');
    const simQuestionsHtml = () => {
      const pctx = getPhenomenonContext();
      if (!pctx || !pctx.phenomenonId || !simEntryFor(pctx.phenomenonId)) return '';
      const qs = questionsForPhenomenon(pctx.phenomenonId, i18n, {
        hasInput: pctx.phenomenonId !== 'ocean.wave' || !!hooks.hasSeaInput?.(),
        whyKo: '먼저 바다 지점을 선택하세요 — 바다를 클릭하면 해양 모델 값을 조회합니다',
        whyEn: 'Select a sea area first — its marine model values feed the computation',
      });
      return questionBlock(qs);
    };
    /* 계약 §L — 기존 현상 메뉴 안에 '어디서 되는지' 한 줄(✅ 계산됨 / 📋 기관 인용). 독립 지역 목록·지도가
       아니다(§L-1·§L-3). 질문 블록 마크업(questionBlock)은 지도 문맥과 같아야 해서 따로 붙인다. */
    const regionLine = () => {
      const pctx = getPhenomenonContext();
      const reg = pctx && pctx.phenomenonId ? simEntryFor(pctx.phenomenonId)?.regions : null;
      return reg ? `<div class="sim-questions"><div class="sq-why sq-region">${safeText(i18n.ko ? reg.ko : reg.en)}</div></div>` : '';
    };
    /* Intelligence 띠 (P1) — 선택한 현상의 인텔 패킷 v1 이 이미 받은 사건 패킷 안에 있으면 그린다.
       없으면 아무것도 그리지 않는다(빈 절 금지, 계약 §C-0). 요청·계산 없음. */
    const intelStripBlock = () => {
      const pctx = getPhenomenonContext();
      if (!pctx || !pctx.phenomenonId) return '';
      return intelStripHtml({
        // 현상 id 를 넘긴다 — 태풍(사건 패킷)·지진(고른 사건의 패킷)·수온(켜 둔 레이어 문서)이 같은 문으로 온다.
        phenomenonId: pctx.phenomenonId, packet: intelOf(hooks.getEventPacket?.(pctx.phenomenonId)), i18n,
        esc: safeText, badge: (k) => dataBadge(k), mode: hooks.monetizationMode?.(), tier: currentTier(),
      });
    };
    /* 지도 직접 클릭 경로의 궁금한 점 — 현상을 고르지 않아도 바다·국가 문맥이 있으면
       질문이 붙는다. 발견→이해→질문이 클릭 한 번에 이어지게 하는 문(수정 지시서 §4~7). */
    const mapContextQuestions = () => {
      if (selectedMenu) return '';
      if (hooks.hasSeaPoint?.()) {
        return questionBlock(questionsForPhenomenon('ocean.wave', i18n, { hasInput: !!hooks.hasSeaInput?.() }));
      }
      if (hooks.hasCountryContext?.()) {
        return questionBlock(questionsForCountry(i18n, { hasInput: true }));
      }
      return '';
    };
    // (2026-09-24 정정) 머리말 조각을 따로 짓는다 — 사건 목록·내 지역에서는 예전처럼 한 덩어리 머리말로, 한 장 시트에서는
    //   각 절(출처 줄·선택 장소·켜진 자료 → 자료의 근거 · 궁금한 점 → 시뮬레이션 · Intelligence 띠 → Intelligence)로 나눠 싣는다.
    const srcLine = selectedMenu ? `<div>${safeText(selectedMenu.l.src)} · ${dataBadge(selectedMenu.l.state)}</div>` : '';
    const placeLine = `<div>${safeText(i18n.ko?'선택 장소':'Selected place')}: ${safeText(picked?.nameKo || picked?.name || (i18n.ko?'지도에서 선택':'Select on the globe'))}</div>`;
    const timeNote = timelineMinutes ? `<p class="information-time">${safeText(i18n.ko?'재생 시간은 일부 예보에 적용됩니다. 다른 자료는 각 원자료 시각에 고정됩니다.':'Playback applies to supported forecasts. Other data keeps its source time.')}</p>`:'';
    const activeDetails = active.length ? `<details><summary>${i18n.ko?'현재 켜진 자료':'Active data'} ${active.length}</summary>${active.map(({s,l})=>`<div class="active-data-row"><span>${safeText(i18n.layer(l.id,l.name,s.id))}<small>${safeText(menuTime(l.id,i18n.ko))}</small></span>${canClearLayer(l.id)?`<button data-action="shell-layer-off" data-scene="${s.id}" data-layer="${l.id}" aria-label="${safeText(l.name)} 끄기">${i18n.ko?'끄기':'Off'}</button>`:''}</div>`).join('')}<button data-action="shell-clear-layers">${i18n.ko?'추가 자료 모두 끄기':'Clear overlays'}</button></details>`:'';
    if (cx === 'selection') {
      renderSheet({ srcLine, placeLine, timeNote, activeDetails, phenomenonLine, simQuestionsHtml, regionLine, mapContextQuestions, intelStripBlock });
      renderHead(cx);
      intelContent.scrollTop=scrollTop;
      consumePendingScroll();
      return;
    }
    sheetLayout = '';
    const header=document.createElement('div');header.className='information-context';
    header.innerHTML=`${selectedMenu ? `<strong>${safeText(i18n.ko ? questionForLayer(selectedMenu.s.id, selectedMenu.l.id) || selectedMenu.l.name : selectedMenu.l.name)}</strong>${srcLine}${phenomenonLine()}${simQuestionsHtml()}${regionLine()}${intelStripBlock()}`:''}${mapContextQuestions()}${placeLine}${timeNote}
      ${activeDetails}`;
    // 지점 카드는 한 장이다 — 머리말(질문·능력 줄·궁금한 점·선택 장소·켜진 자료)을 그 위에 얹지 않는다.
    // 2026-09-23 PD 가 가리킨 "가장 큰 문제"가 바로 누른 순간 이 머리말과 탭 두 줄이 값보다 먼저 선 것이었다.
    // (2026-09-24 정정) 지점 카드·값 카드·사건 방은 이제 renderSheet 가 그린다(위 return) — 이 머리말은 사건 목록·내 지역 문맥에만 선다.
    intelContent.prepend(header);
    renderHead(cx);
    intelContent.scrollTop=scrollTop;
    consumePendingScroll();
  };

  // 패널 내 버튼 액션 위임 (예: 시뮬레이션 시작)
  intelContent.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    // 셸이 스스로 처리하는 것 — 지구 렌더러까지 갈 일이 아니다
    const a = btn.dataset.action;
    if(a==='shell-layer-off'){const s=SCENES.find(s=>s.id===btn.dataset.scene);const l=s?.layers.find(l=>l.id===btn.dataset.layer);if(l && hooks.getLayerState?.(s.id,l)?.on)hooks.onLayerAction(s.id,l);return;}
    if(a==='shell-clear-layers'){hooks.clearLayers?.();return;}
    if (a === 'shell-open-menu') { openPanel('earthus'); return; }
    if (a === 'shell-open-feed') { showTab('feed'); return; }
    if (a === 'sim-why') {
      // 엔진이 없는 질문 — 누르면 왜 없는지를 말한다. 조용히 무시하지 않는다.
      const prev = btn.parentElement.querySelector('.sq-why');
      if (prev) prev.remove();
      const tip = document.createElement('div');
      tip.className = 'sq-why';
      tip.textContent = btn.dataset.why || '';
      btn.after(tip);
      return;
    }
    if (a === 'shell-play5d') { strip.querySelector('#ts-play').click(); return; }
    // (2026-09-24 정정) 지점 카드의 [표시 설정] — 값 절 안에 접어 둔 조작 카드를 그 자리에서 편다(다른 카드로 갈아 끼우지 않는다).
    //   접이가 없으면(조작 카드를 못 만든 색면) 예전 길(main.js onAction → '선택 자료' 값 카드)로 떨어진다.
    if (a === 'point-field-settings') {
      const d = intelContent.querySelector('details[data-intel-more="settings"]');
      if (d) { d.open = true; openSecs.add('settings'); scrollToEl(d); return; }
    }
    if (hooks.onAction) hooks.onAction(a, btn.dataset);
  });
  // (2026-09-24 정정) 접힌 절의 '더 보기'·'접기' — 사람이 편 것을 기억한다(다시 그려도 그대로). toggle 은 거품이 없어 잡기(capture)로 받는다.
  intelContent.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d || !d.matches || !d.matches('details[data-intel-more]')) return;
    if (d.open) openSecs.add(d.dataset.intelMore); else openSecs.delete(d.dataset.intelMore);
  }, true);

  // 카드 안의 슬라이더는 click 이 아니라 input 으로 온다. 같은 onAction 으로 흘려보낸다.
  intel.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && hooks.onAction) hooks.onAction(el.dataset.action, el.dataset, el.value);
  });

  /* 패널을 여닫는 **유일한** 자리. 예전에는 네 곳이 손잡이 버튼에 click() 을 합성해
     열었고, 그래서 손잡이 DOM 을 지우면 그 넷이 조용히 죽었다. 문을 하나로 모은다. */
  /* 패널이 열려 있다고 아무 칸이나 켜지 않는다 — 켜야 할 칸은 '지금 무슨 문맥인가'
     에 달렸다. 사용자 문맥(my)일 때만 '내 지역'이 켜진다. 현상 문맥이면 하단에
     대응하는 칸이 없다(그게 요점이다 — 현상은 탐색 안에 있다). */
  const NAV_FOR_TAB = { feed: 'feed', my: 'myplace' };
  const syncIntelNav = () => {
    /* 하단바 .on 의 유일한 쓰기 지점 (2026-09-10 live 실측 수정). 전에는 클릭 토글이
       '누른 칸만' 켜고 이 함수가 '지금/내 지역'을 다시 켜서 두 칸이 동시에 켜졌다.
       상태 하나 = 불 하나: 열려 있는 문이 주다. 문은 탭이 아니라 문이라 아무 것도
       열려 있지 않으면 모두 끈다. */
    if (!navRoot) return;
    let want = null;
    if (openBrand === 'report') want = 'report';
    else if (openBrand === 'aetherus') want = spaceDoor ? 'space' : null;
    else if (openBrand === 'earthus') want = 'explore';
    else if (intelOpen) want = NAV_FOR_TAB[curTab] || null;
    navRoot.querySelectorAll('button[data-nav]')
      .forEach((b) => b.classList.toggle('on', b.dataset.nav === want));
  };
  const setIntelOpen = (open) => {
    /* 게이팅은 여는 순간에도 한 번 건다.
       전에는 '선택이 바뀔 때'에만 걸었다(817·841·860·1340·1341). 그래서 앱을 켠 직후처럼
       선택이 한 번도 없었던 상태에서 패널을 열면 btn.hidden 이 아직 아무에게도 안 걸려
       일곱 탭이 통째로 열렸다 — 능력 표(66현상×7)가 화면에 반영되지 않은 채였다. */
    if (open) applyCapabilityGating();
    if (intelOpen === open) { if (open) renderIntel(); syncIntelNav(); return; }
    intelOpen = open;
    // 닫으면 지점 카드 모드도 끝난다 — 다음에 탭 없이 열 때 옛 카드가 되살아나지 않게(위 openIntel 과 같은 사고).
    if (!intelOpen && curTab === 'point') { curTab = 'now'; tabIntent = 'now'; intel.dataset.tab = 'now'; }
    // (2026-09-24 정정 · 적대 검토) 편 절도 닫으면 잊는다 — 지점에서 편 '자료의 근거'가 다음에 연 나라 카드 아래에 펴진 채 남았다
    //   (위 'point' 되돌림과 같은 사고의 한 장 시트판 · 402×714 실측). 새로 열면 half 에서 접힌 절로 시작한다.
    if (!intelOpen) { openSecs.clear(); pendingScroll = null; }
    // 새로 열 때는 half — 지구가 위에 보이는 INFORMATION 단계에서 시작한다(M1 · §C-0).
    if (intelOpen) setSheet('half');
    intel.classList.toggle('open', intelOpen);
    if (intelOpen) renderIntel();
    syncIntelNav();
  };
  /* (2026-09-24 정정) 탭 단추가 없어져 여기서 걸던 click 도 없다. 걸던 규칙의 기록:
       §11 — 사용자가 직접 고른 것이므로 여기서 의도가 갱신된다.
       이 줄 덕분에 "자료를 기다리는 동안 다른 탭을 눌렀다"가 존중된다.
     한 장 시트에서 '다른 절을 보는 것'은 굴리기·'더 보기'라 의도를 바꾸지 않는다 — 기다리던 자료가 오면 같은 장 안에서 값 절만 바뀐다. */

  const closeIntel = () => setIntelOpen(false);
  intel.querySelector('#intel-close').addEventListener('click', closeIntel);


  // --- 하단 타임 스트립 (§19.7): 태양 위치는 진짜 재계산(LIVE), 관측 구름은 STALE ---
  const strip = document.createElement('div');
  strip.id = 'timestrip';
  strip.setAttribute('role', 'navigation');
  strip.setAttribute('aria-label', '시간 탐색');
  strip.innerHTML = `
    <button id="ts-now" aria-label="${i18n.ko?'시간을 현재로 되돌리기':'Back to the present time'}">${i18n.t('now')}</button>
    <button id="ts-play" title="${i18n.t('play5d')}" aria-label="${i18n.t('play5d')}">▶</button>
    <input type="range" id="ts-range" aria-label="${i18n.ko?'자료 시간 이동':'Data timeline'}" min="-1440" max="7200" step="30" value="0" />
    <span id="ts-label">NOW</span>`;
  root.appendChild(strip);

  const tsRange = strip.querySelector('#ts-range');
  const tsLabel = strip.querySelector('#ts-label');
  const fmtOffset = (m) => {
    if (m === 0) return 'NOW';
    const sign = m > 0 ? '+' : '−';
    const a = Math.abs(m);
    if (a < 1440) return `T${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
    return `T${sign}${Math.floor(a / 1440)}일 ${Math.floor((a % 1440) / 60)}h`;
  };
  const applyTime = () => {
    const m = parseInt(tsRange.value, 10);
    timelineMinutes=m;
    const n = m !== 0 && hooks.timeNote ? hooks.timeNote(m) : null;
    hooks.onTimeOffset(m * 60000);
    tsLabel.textContent = m === 0 ? 'NOW'
      : `${fmtOffset(m)} · ${n ? n.short : ''}`;
    strip.title = n ? n.full : '';
    if(intelOpen)renderIntel();
  };
  tsRange.addEventListener('input', applyTime);
  strip.querySelector('#ts-now').addEventListener('click', () => {
    tsRange.value = 0;
    applyTime();
    tsLabel.textContent = 'NOW';
  });

  // ▶ 재생: 5일 예보 구간을 자동 진행 (시간당 1스텝/틱)
  let playTimer = null;
  const playBtn = strip.querySelector('#ts-play');
  playBtn.addEventListener('click', () => {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
      playBtn.textContent = '▶';
      return;
    }
    playBtn.textContent = '⏸';
    if (hooks.onPlay) hooks.onPlay(); // 재생 = 예보 재생: 구름을 모델로 전환해 같이 흐르게
    if (parseInt(tsRange.value, 10) < 0) tsRange.value = 0;
    playTimer = setInterval(() => {
      let v = parseInt(tsRange.value, 10) + 60;
      if (v > 7200) { clearInterval(playTimer);playTimer=null;playBtn.textContent='▶';return; }
      tsRange.value = v;
      applyTime();
    }, 220);
  });

  // --- 라벨 엔진 (§19.6): 최대 5~8개, 포커스 시 외부 라벨 억제 ---
  const labelWrap = document.createElement('div');
  labelWrap.id = 'labels';
  root.appendChild(labelWrap);
  const labelPool = [];
  for (let i = 0; i < 8; i += 1) {
    const d = document.createElement('div');
    d.className = 'geo-label';
    d.style.display = 'none';
    labelWrap.appendChild(d);
    labelPool.push(d);
  }

  const proj = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let frame = 0;

  const updateLabels = (camera, altKm) => {
    frame += 1;
    if (frame % 3 !== 0) return; // 3프레임마다 갱신
    const data = hooks.labelData();
    const focusSel = hooks.getFocusSel();
    // 라벨 예산: 정본 scene-orchestrator의 buildScenePlan().labelBudget (씬·기기·열상태·패널 반영).
    // 엔진이 값을 못 주면 예전 규칙으로 폴백한다.
    const maxLabels = (hooks.labelBudget && hooks.labelBudget()) || (window.innerWidth > 1400 ? 8 : 5);
    if (!data || altKm < 300) {
      labelPool.forEach((d) => { d.style.display = 'none'; });
      return;
    }
    camDir.copy(camera.position).normalize();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const vis = [];
    for (const c of data) {
      const facing = c.unit.dot(camDir);
      if (facing < 0.35) continue;
      proj.copy(c.unit).project(camera);
      if (proj.z > 1 || Math.abs(proj.x) > 0.92 || Math.abs(proj.y) > 0.88) continue;
      vis.push({ c, x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, score: c.rank * facing });
    }
    vis.sort((a, b) => b.score - a.score);
    // 충돌 컬링: 이미 배치한 라벨과 60px 이내면 스킵
    const placed = [];
    for (const v of vis) {
      if (placed.length >= maxLabels) break;
      if (placed.some((p) => Math.abs(p.x - v.x) < 90 && Math.abs(p.y - v.y) < 26)) continue;
      placed.push(v);
    }
    labelPool.forEach((d, i) => {
      const v = placed[i];
      if (!v) { d.style.display = 'none'; return; }
      d.style.display = 'block';
      d.style.left = `${v.x}px`;
      d.style.top = `${v.y}px`;
      // 나라 이름도 언어를 따른다. 자료에 nameEn 이 있고, 없으면 한국어를 쓴다.
      d.textContent = i18n.ko ? v.c.nameKo : (v.c.nameEn || v.c.nameKo);
      const dimmed = focusSel && !focusSel.ocean && focusSel.code3 !== v.c.code3;
      d.classList.toggle('dim', !!dimmed);
      d.classList.toggle('sel', !!(focusSel && focusSel.code3 === v.c.code3));
    });
  };

  /* ── 탭 선택 — INTEGRATION-3 §11 ────────────────────────────────────────
     예전에는 원하는 탭을 400ms·1200ms 뒤에 setTimeout 으로 다시 골랐다.
     자료 로딩이 그보다 느린 기기에서는 그대로 깨지는 방식이고, 무엇보다
     "언제 도착하느냐"가 화면을 정하게 된다. 규칙을 바꾼다:

         마지막 **사용자 의도**가 이긴다.

       source 'intent' — 사용자가 고른 것이다(탭 단추 · 메뉴 행 · 보고서 행동
                         단추 · 지구 클릭). 지금부터 이 탭이 서 있는 의도다.
       source 'follow' — 뒤따르는 요청이다(자료가 도착해 카드를 갈아 끼우는 것).
                         서 있는 의도와 다르면 **조용히 무시한다.**
                         보던 화면을 자료 도착이 뺏지 않는다.

     기본값이 'intent' 인 이유: 기존 호출부는 전부 사용자 제스처다.
     뒤따르는 요청만 호출부에서 'follow' 라고 명시한다.
     돌려주는 값: 실제로 탭을 옮겼으면 true. */
  /* (2026-09-24 정정) 한 장 시트 — t 가 바탕 문맥(feed · my · now · point)이면 그 문맥으로 옮기고, 절 이름(why · next · history ·
     scenario)이면 **문맥은 그대로 두고** 그 절을 펴서 굴린다(다른 화면으로 가지 않는다). 사건 목록·내 지역에서 절을 부르면
     고른 사건이 있으면 그 사건의 한 장, 없으면 값 카드의 한 장으로 간다('forme-sim'·'ocean/typhoonsim'·질문 버튼 등).
     'follow' 규칙(§11)은 그대로다. 돌려주는 값도 그대로: 받아들였으면 true. */
  const showTab = (t, source) => {
    if (source === 'follow' && t !== tabIntent) return false;
    tabIntent = t;
    if (SECTION_TABS.has(t)) {
      if (curTab === 'my' || (curTab === 'feed' && !feedRoomOpen())) curTab = feedRoomOpen() ? 'feed' : 'now';
      openSecs.add(t);
      pendingScroll = t;
    } else {
      curTab = t;
      if (pendingScroll && pendingScroll !== 'top') pendingScroll = null;
    }
    // CSS 가 읽는다 — 지점 카드('point')일 때 탭 단추 줄을 숨긴다(index.html)
    // (2026-09-24 정정) 이제 바탕 문맥만 적는다(절 이름은 적지 않는다). 지점 카드일 때 카드 머리글을 시트 머리로 올린다(index.html) ·
    //   main.js liftPeekForValue·revealNoteCard 도 읽는다.
    intel.dataset.tab = curTab;
    if (intelOpen) renderIntel();
    return true;
  };

  return {
    setActiveScene,
    clearSelection: () => {selectedMenu=null; applyCapabilityGating();},
    setSelection: (sid,id) => {const s=SCENES.find(s=>s.id===sid);const l=s?.layers.find(l=>l.id===id);selectedMenu=l?{s,l}:null; applyCapabilityGating();},
    // PHASE 2 STEP 2.8 — 지금까지 selectedMenu 는 클로저 사적 변수였고 읽는 함수가 없었다.
    // 문맥 패널은 "지금 무엇이 선택돼 있나" 를 모르면 문맥이 될 수 없다.
    getSelection,
    setSheet,
    getPhenomenonContext,
    // 언어를 바꾸면 손잡이 이름도 그 언어로 다시 쓴다.
    refreshPanelIdentity: () => { applyPanelIdentity(getPhenomenonContext()); renderNav(); },
    showTab,
    closeFlyout,
    refreshFlyout,
    closeIntel,
    isFlyoutOpen: () => !!openBrand,
    isIntelOpen: () => intelOpen,
    renderIntel: () => { if (intelOpen) renderIntel(); },
    updateLabels,
    // main.js 열네 자리가 이걸 쓴다(바다 클릭·국가 클릭·내 지역 …).
    // 손잡이 click() 합성이던 것을 같은 문(setIntelOpen)으로 돌린다.
    openIntel: (tab) => { openIntel(tab); },   // 한 문으로 — 위 openIntel 의 'point' 되돌림을 같이 탄다
    // 추천 질문의 위성 경로 — 우주 씬으로 보내 SGP4 전파를 실제로 보여준다 (sim-q · satellite-track).
    gotoScene,
    // 상단 돋보기가 쓴다 — 메뉴 줄을 누른 것과 **같은 길**로 간다(켜져 있으면 끈다. 그래서 돋보기가
    // 결과 줄에 '켜기/끄기'를 적는다). 길을 따로 내면 메뉴와 돋보기의 동작이 갈라진다.
    findTopics,
    openTopic: (sceneId, layerId) => {
      const scene = SCENES.find((s) => s.id === sceneId);
      const layer = scene && scene.layers.find((l) => l.id === layerId);
      if (!layer || !hooks.onLayerAction) return false;
      selectedMenu = { s: scene, l: layer };
      applyCapabilityGating();
      intelContent.scrollTop = 0;
      hooks.onLayerAction(scene.id, layer);
      return true;
    },
  };
}

// NOW 탭 카드 빌더 — main.js에서 데이터를 받아 HTML 생성
export function buildNowCards(ctx) {
  // ctx: { focusSel, focusStatsHtml, sunHtml, cloudHtml, terrainHtml }
  const cards = [];
  if (ctx.focusSel && ctx.focusSel.ocean) {
    // 예전엔 '해류·수온 미연결'이라고 적혀 있었는데 두 레이어 다 실데이터로 동작한다.
    cards.push(`<div class="card"><div class="card-h">해양 포커스 ${dataBadge('DERIVED')}</div>
      <div class="card-b">해양 메뉴에서 <b>수온(NOAA OISST)</b> · <b>유의파고</b> · <b>표층 해류</b>를 켤 수 있습니다.<br/>
      값이 없는 격자는 비워 둡니다 — 보간해서 채우지 않습니다.</div></div>`);
  } else if (ctx.focusSel && ctx.focusSel.region) {
    // 권역은 나라가 아니다 — '미오픈 국가' 문구를 붙이면 거짓말이 된다
    cards.push(`<div class="card"><div class="card-h">${ctx.focusSel.nameKo} ${dataBadge('OBSERVED')}</div>
      <div class="card-b">${ctx.focusStatsHtml}</div>
      <div class="card-b readiness">권역 안의 나라를 눌러 개별 화면으로 들어갈 수 있습니다.</div></div>`);
  } else if (ctx.focusSel) {
    const open = OPEN_COUNTRIES.has(ctx.focusSel.code3);
    cards.push(`<div class="card"><div class="card-h">${ctx.focusSel.nameKo}
      ${open ? dataBadge('LIVE') : dataBadge('LOCKED')}</div>
      <div class="card-b">${ctx.focusStatsHtml}</div>
      ${open ? '' : `<div class="card-b readiness">이 국가는 아직 정식 오픈 전입니다.<br/>
        경계·지형 ${dataBadge('LIVE')} · 실시간 지표 ${dataBadge('UNAVAILABLE')}<br/>
        공식 안전 정보는 오픈 시 항상 무료로 제공됩니다.</div>`}</div>`);
  }
  cards.push(`<div class="card"><div class="card-h">태양 ${dataBadge('LIVE')}</div><div class="card-b">${ctx.sunHtml}</div></div>`);
  cards.push(`<div class="card"><div class="card-h">지형 ${dataBadge('LIVE')}</div><div class="card-b">${ctx.terrainHtml}</div></div>`);
  cards.push(`<div class="card"><div class="card-h">구름 ${ctx.cloudBadge}</div><div class="card-b">${ctx.cloudHtml}</div></div>`);
  return cards.join('');
}

export { OPEN_COUNTRIES };
