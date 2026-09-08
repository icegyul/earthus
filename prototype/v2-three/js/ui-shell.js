// EARTHUS v2-three — 화면 문법 셸 (지시서 §19.12, §106.1)
// 좌측 레일(씬 메뉴) + 우측 EARTH INTELLIGENCE 패널(NOW/WHY/NEXT) + 하단 타임 스트립 + 라벨 엔진.
// 지구 렌더러(main.js)는 건드리지 않고 훅(hooks)으로만 연결한다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { i18n } from './i18n.js?v=11';
import { renderBadge, layerBadge } from './engine-bridge.js?v=15';
// PHASE 2 STEP 2.4 — 질문을 복합키(scene/layer)로 찾는다. bare id 조회를 새로 만들지 않는다.
// menu-guide.js 의 MENU_QUESTIONS 는 지우지 않았다 — tools/build_information_inventory.mjs 가
// 아직 읽고, 레지스트리의 질문이 거기서 왔다. 다만 화면은 이제 레지스트리만 본다.
// (bare id 조회였기 때문에 hobby/surf 가 ocean/surf 의 질문을 그대로 표시하고 있었다.)
import { questionForLayer, phenomenonForLayer, LAYER_PHENOMENON, reportKindsForPhenomenon, PHENOMENA, representativeLayerFor } from './phenomenon-registry.js?v=4';
import { menuCoverage, menuTime, canClearLayer, matchesMenu } from './information-contract.js';
// PHASE 8 §13 — 리포트 센터. 보고서 렌더링은 그쪽 모듈이 한다. 여기서 문장을 만들지 않는다.
import { reportDocHtml, reportKey, reportUrl, reportIdFromUrl, currentTier, DATA_LABEL_TEXT } from './report-center.js?v=1';
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
      { id: 'raingrid', name: '전지구 강수', state: 'MODEL', src: 'Open-Meteo 격자 5°', act: true },
      { id: 'tempgrid', name: '전지구 기온', state: 'MODEL', src: 'Open-Meteo 격자 5°', act: true },
      { id: 'presgrid', name: '전지구 기압', state: 'MODEL', src: 'Open-Meteo 격자 5°', act: true },
      { id: 'windgrid', name: '전지구 풍속', state: 'MODEL', src: 'Open-Meteo 격자 5°', act: true },
      { id: 'pm25grid', name: '전지구 초미세먼지', state: 'MODEL', src: 'CAMS 격자 5°', act: true },
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
      { id: 'wind', name: '바람 관측 (지상 3천 개소)', state: 'OBSERVED', src: 'KMA AWS·GTS', act: true },
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
      { id: 'marine', name: '해양 모델 · 파고와 바람', state: 'MODEL_SIGNAL', src: 'Open-Meteo Marine · GFS 바람', act: true },
      { id: 'oceanfocus', name: '해양 포커스', state: 'DERIVED', src: '선택 해역 · 연결된 해양 자료', act: true },
      { id: 'typhoonsim', name: '태풍 해상 시뮬레이션', state: 'SIMULATION_ONLY', src: '자체 물리', act: true },
      { id: 'buoys', name: '해양 부이 관측 (수온)', state: 'OBSERVED', src: 'NDBC 등 · 1.0 S3', act: true },
      { id: 'argo', name: 'Argo 플로트 — 잠수 기록', state: 'OBSERVED', src: 'Argo · Ifremer ERDDAP', act: true },
      { id: 'kmasea', name: '해상 관측망 (파고·수온 193지점)', state: 'OBSERVED', src: '기상청 해양관측', act: true },
      { id: 'sstfield', name: '해수면 온도 (전지구)', state: 'OBSERVED', src: 'NOAA OISST v2.1', act: true },
      { id: 'sstanom', name: '수온 아노말리 (평년 대비)', state: 'OBSERVED', src: 'OISST − 1991~2020 평년', act: true },
      /* 2026-09-07 지시 §13: 장기 기후 시나리오는 지금 예보와 섞어 보여주지 않는다.
         longterm 플래그만 얹는다 — LiveLayers 렌더 경로(main.js LIVE_LAYER_KEYS)는 그대로
         'ocean/…' 로 남으므로 데이터·계산은 안 건드리고 화면에만 소제목을 가른다. */
      { id: 'slr', name: '해수면 상승 전망 2100 (전 세계)', state: 'MODEL_SIGNAL', src: 'IPCC AR6 · NASA', act: true, longterm: true },
      { id: 'khoasl126', name: '우리 바다 해수면 전망 · SSP1-2.6 저배출', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      { id: 'khoasl245', name: '우리 바다 해수면 전망 · SSP2-4.5 중간', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      { id: 'khoasl370', name: '우리 바다 해수면 전망 · SSP3-7.0 고배출', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      { id: 'khoasl585', name: '우리 바다 해수면 전망 · SSP5-8.5 최고', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true, longterm: true },
      { id: 'khoaflood', name: '연안 침수 범위 — 시군구별 침수 예상도', state: 'MODEL_SIGNAL', src: '국립해양조사원 · 침수 예상도', act: true },
      { id: 'wavefield', name: '유의파고 (전지구)', state: 'MODEL_SIGNAL', src: 'Open-Meteo Marine', act: true },
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
      { id: 'surf', name: '서핑 — 이 해변에 너울이 들어오는가', state: 'MODEL', src: 'Open-Meteo Marine · 기상청 AWS · 해변 1,027곳', act: true },
      { id: 'fishing', name: '낚시 — 물때와 안전 · 방파제 · 섬', state: 'MODEL', src: 'Open-Meteo Marine · 기상청 · 낚시터 1,009곳', act: true },
      { id: 'vessel', name: '선박 — 공식 실시간 위치 · 여객선 운항', state: 'OFFICIAL_INFORMATION', src: '해양교통안전정보시스템(MTIS)', act: true },
      { id: 'dive', name: 'Dive · 심해 — GEBCO 수심 기둥과 심해 생물', state: 'DERIVED', src: 'GEBCO 2026 · OBIS', act: true },
      { id: 'trench', name: '해구 — 지구의 가장 깊은 바다', state: 'OBSERVED', src: 'GEBCO 2026 · SCUFN', act: true },
      { id: 'turtle', name: '바다거북 — 방류된 거북이 지나간 길', state: 'HISTORY', src: '국립해양생물자원관 · 공공저작물 제4유형', act: true },
      { id: 'seabird', name: '바닷새 — 조사한 해에 어디서 몇 마리를 셌나', state: 'HISTORY', src: '국립생물자원관', act: true },
      { id: 'migbird', name: '철새 — 봄에 우리 동네 새가 어디로 갔나', state: 'HISTORY', src: '농림축산검역본부 · 공공누리', act: true },
      { id: 'ecobird', name: '전국 조류 조사 — 어느 5km 칸에 기록이 있나', state: 'HISTORY', src: '국립생태원 EcoBank · data.go.kr', act: true },
      { id: 'para', name: '패러글라이딩 — 바람 세기와 구름 밑면', state: 'MODEL', src: 'Open-Meteo · 활공장 26곳', act: true },
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
      { id: 'glof', name: '빙하호 홍수 (GLOF)', state: 'LOCKED', src: 'DEM+파열모델', plan: '지역 3D 위 시나리오' },
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
      { id: 'aeth-orbit', name: '궤도 인텔리전스 (우주쓰레기·정본 카탈로그·근접사건)', state: 'LIVE', src: 'AETHERUS API · 서버 SGP4', act: true },
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
  if(!document.getElementById('information-access-style')){const css=document.createElement('link');css.id='information-access-style';css.rel='stylesheet';css.href=new URL('./information-access.css?v=20260905',import.meta.url).href;document.head.append(css);}

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
  let menuQuery = '';
  let activeOnly = false;
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
  const CAP_TAB = { scenario: 'simulation', next: 'forecast', history: 'history' };
  function applyCapabilityGating() {
    const ctx = getPhenomenonContext();
    for (const [tab, cap] of Object.entries(CAP_TAB)) {
      const btn = intel && intel.querySelector(`.intel-tabs [data-tab="${tab}"]`);
      if (!btn) continue;
      const hide = !!ctx && !ctx.capabilities[cap];
      btn.hidden = hide;
      // 숨긴 탭이 열려 있었으면 사건 탭으로 되돌린다 — 빈 화면을 남기지 않는다.
      if (hide && curTab === tab) showTab('feed');
    }
    applyPanelIdentity(ctx);
  }

  /* PHASE 3 §0.3 — 우측 손잡이가 'EARTH INTELLIGENCE' 라는 고정 이름을 달고 있으면
     인텔리전스가 현상과 무관한 독립 기능처럼 읽힌다. 현상을 고르면 그 현상의 이름을 단다.
     ※ 좌상단 .es-switch 의 'Intelligence' 는 건드리지 않는다 — 그것은 v2 제품 자체의
        공개 이름이고 배포된 주소(/Intelligence)다. earth-switch.js 머리주석을 볼 것. */
  const PANEL_HOME = () => (i18n.ko ? '지구 인텔리전스' : 'EARTH INTELLIGENCE');
  function applyPanelIdentity(ctx) {
    const handle = intel && intel.querySelector('#intel-tab');
    if (!handle) return;
    const name = ctx ? (i18n.ko ? ctx.label.ko : ctx.label.en) : null;
    handle.textContent = name || PANEL_HOME();
    handle.setAttribute('aria-label', name
      ? (i18n.ko ? `${name} — 현재·해석·근거` : `${name} — current, intelligence, evidence`)
      : PANEL_HOME());
  }
  let timelineMinutes = 0;
  // PHASE 4 §2 — 1차 메뉴는 도메인만 보인다. 도메인을 열어야 현상 목록이 나온다.
  // 처음부터 58줄을 펼쳐 두면 '메뉴를 줄였다'가 화면에서 사실이 아니게 된다.
  const collapsedSections = new Set(['land','weather','ocean','people','travel','hazards','space','__loose']);

  // 권역 이동 (v5.3 스케일 사다리: GLOBAL → CONTINENT → REGION → COUNTRY).
  // 3D 지구를 벗어나지 않고 카메라만 그 권역 구도로 옮긴다 — 평면 전환이 아니다.
  // ⚠️ 순서는 시장 우선순위를 따른다 — 한반도가 맨 앞이다(PD 지시).
  const REGION_CHIPS = [
    { id: 'korea', ko: '한반도' },
    { id: 'globe', ko: '전 지구' },
    { id: 'eastasia', ko: '동북아시아' },
    { id: 'seasia', ko: '동남아시아' },
    { id: 'southasia', ko: '남아시아' },
    { id: 'oceania', ko: '오세아니아' },
    { id: 'europe', ko: '유럽' },
    { id: 'mideast', ko: '중동' },
    { id: 'africa', ko: '아프리카' },
    { id: 'namerica', ko: '북미' },
    { id: 'samerica', ko: '남미' },
    { id: 'arctic', ko: '북극' },
    { id: 'antarctic', ko: '남극' },
  ];

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
  const DOMAIN_KO = { land: '땅', weather: '날씨', ocean: '바다', people: '사람', travel: '여행', hazards: '재해', space: '우주' };
  const DOMAIN_EN = { land: 'Land', weather: 'Weather', ocean: 'Ocean', people: 'People', travel: 'Travel', hazards: 'Hazards', space: 'Space' };
  const expandedPhenomena = new Set();

  const LAYER_BY_KEY = new Map();
  for (const sc of SCENES) for (const l of sc.layers) LAYER_BY_KEY.set(sc.id + '/' + l.id, { s: sc, l });

  // 도메인 → 현상 → 레이어. 대표 레이어는 primary 역할을 먼저 고른다.
  const DOMAIN_INDEX = (() => {
    const byPhen = new Map();
    for (const [key, hit] of Object.entries(LAYER_PHENOMENON)) {
      if (!hit.phenomenon) continue;
      const rec = LAYER_BY_KEY.get(key);
      if (!rec) continue;
      if (!byPhen.has(hit.phenomenon)) byPhen.set(hit.phenomenon, []);
      byPhen.get(hit.phenomenon).push({ key, role: hit.role, s: rec.s, l: rec.l });
    }
    const out = new Map();
    for (const [pid, members] of byPhen) {
      const p = PHENOMENA[pid];
      if (!p) continue;
      const rep = members.find((x) => x.role === 'primary') || members[0];
      if (!out.has(p.domain)) out.set(p.domain, []);
      out.get(p.domain).push({ id: pid, p, members, rep });
    }
    // 준비된 것부터 — planned 를 위에 두면 첫 화면이 빈 약속으로 시작한다.
    const rank = { ready: 0, partial: 1, planned: 2 };
    for (const list of out.values()) {
      list.sort((a, b) => (rank[a.p.availability] - rank[b.p.availability])
        || a.p.label.ko.localeCompare(b.p.label.ko, 'ko'));
    }
    return out;
  })();

  // 현상이 아닌 것(배경·조작·진입점). 지우지 않고 한 곳에 모은다.
  const LOOSE_LAYERS = Object.entries(LAYER_PHENOMENON)
    .filter((e) => !e[1].phenomenon)
    .map((e) => ({ key: e[0], role: e[1].role, rec: LAYER_BY_KEY.get(e[0]) }))
    .filter((x) => x.rec)
    .map((x) => ({ key: x.key, role: x.role, s: x.rec.s, l: x.rec.l }));

  const layerOnState = (rec) => (hooks.getLayerState && hooks.getLayerState(rec.s.id, rec.l)) || {};
  const domainAccent = (dom) => {
    const list = DOMAIN_INDEX.get(dom) || [];
    return (list[0] && list[0].rep.s.accent) || '#7FB7F5';
  };

  // 현상 한 줄이 검색어에 걸리는가 — 이름·질문뿐 아니라 속한 레이어 이름·출처까지 본다.
  const phenMatches = (entry) => matchesMenu(menuQuery, [
    entry.p.label.ko, entry.p.label.en, entry.p.question.ko, entry.p.question.en,
    entry.members.map((m) => m.l.name).join(' '),
    entry.members.map((m) => m.l.src).join(' '),
  ]);

  const layerRowHtml = (rec, sub = true) => {
    const st = layerOnState(rec);
    return '<button class="mp-item' + (sub ? ' mp-sub' : '') + (rec.l.state === 'LOCKED' ? ' locked' : '') + (st.on ? ' on' : '') + '"'
      + ' data-fscene="' + rec.s.id + '" data-flayer="' + rec.l.id + '"'
      + ' title="' + safeText(rec.l.src) + '" aria-pressed="' + (!!st.on) + '">'
      + '<span class="mp-lbl">' + i18n.layer(rec.l.id, rec.l.name, rec.s.id) + '</span>' + dataBadge(rec.l.state)
      + (st.on && st.note ? '<span class="mp-note">' + st.note + '</span>' : '')
      + '</button>';
  };

  const phenomenonRowHtml = (entry) => {
    const anyOn = entry.members.some((m) => layerOnState(m).on);
    const sel = !!selectedMenu && (selectedMenu.s.id + '/' + selectedMenu.l.id) === entry.rep.key;
    const name = i18n.ko ? entry.p.label.ko : entry.p.label.en;
    const more = entry.members.length > 1;
    const open = expandedPhenomena.has(entry.id) || !!menuQuery;
    // 자료가 여럿이면 펼쳐서 그 안의 레이어를 그대로 켤 수 있다 — 기능은 하나도 안 사라진다.
    const expander = more
      ? '<button class="mp-expand" data-expand="' + entry.id + '" aria-expanded="' + (open ? 'true' : 'false')
        + '" aria-label="' + safeText(name) + ' ' + (i18n.ko ? '자료 목록' : 'data list') + '">' + entry.members.length + '</button>'
      : '';
    return '<div class="mp-phen' + (anyOn ? ' has-on' : '') + (sel ? ' sel' : '') + '">'
      + '<button class="mp-item mp-phen-main' + (entry.rep.l.state === 'LOCKED' ? ' locked' : '') + (anyOn ? ' on' : '') + '"'
      + ' data-fscene="' + entry.rep.s.id + '" data-flayer="' + entry.rep.l.id + '"'
      + ' title="' + safeText(i18n.ko ? entry.p.question.ko : entry.p.question.en) + '" aria-pressed="' + anyOn + '">'
      + '<span class="mp-lbl">' + safeText(name) + '</span>' + dataBadge(entry.rep.l.state)
      + '</button>' + expander
      + (open && more ? '<div class="mp-subs">' + entry.members.map(layerRowHtml).join('') + '</div>' : '')
      + '</div>';
  };

  const chipsFor = (dom) => {
    if (dom === 'land') {
      return '<div class="mp-chips" role="group" aria-label="' + i18n.t('regionMove') + '">'
        + REGION_CHIPS.map((r) => '<button class="mp-chip" data-region="' + r.id + '">' + i18n.region(r.id, r.ko) + '</button>').join('')
        + '</div><div class="mp-chip-note">' + i18n.t('regionNote') + '</div>';
    }
    if (dom === 'people' && POP_COUNTRIES.length) {
      const cname = (c) => (hooks.countryName ? hooks.countryName(c.iso3, c.nameKo) : c.nameKo);
      const loc = i18n.ko ? 'ko-KR' : 'en-US';
      return '<div class="mp-chips" role="group" aria-label="' + i18n.t('popChips') + '">'
        + POP_COUNTRIES.map((c) => '<button class="mp-chip" data-pop="' + c.iso3 + '" data-popname="' + c.nameKo + '" title="'
          + i18n.t('popTitle').replace('{n}', c.total.toLocaleString(loc)).replace('{y}', c.year) + '">' + cname(c) + '</button>').join('')
        + '</div><div class="mp-chip-note">' + i18n.t('popNote').replace('{n}', POP_COUNTRIES.length) + '</div>';
    }
    return '';
  };

  const domainSectionHtml = (dom) => {
    const all = DOMAIN_INDEX.get(dom) || [];
    const shown = all.filter((e) => {
      if (activeOnly && !e.members.some((m) => layerOnState(m).on)) return false;
      return phenMatches(e);
    });
    if (!shown.length) return '';
    const label = i18n.ko ? DOMAIN_KO[dom] : DOMAIN_EN[dom];
    const hidden = !menuQuery && collapsedSections.has(dom);
    return '<section class="mp-sec" data-section="' + dom + '" style="--sc:' + domainAccent(dom) + '">'
      + '<h3 class="mp-title"><button data-collapse="' + dom + '" aria-expanded="' + (hidden ? 'false' : 'true') + '">'
      + '<i></i>' + safeText(label) + '<em>' + shown.length + '</em></button></h3>'
      + '<div ' + (hidden ? 'hidden' : '') + '>'
      + (menuQuery || activeOnly ? '' : chipsFor(dom))
      + shown.map(phenomenonRowHtml).join('')
      + '</div></section>';
  };

  // 배경·조작 — 현상이 아니다. 맨 아래 한 곳에 모아 둔다.
  const looseSectionHtml = () => {
    const shown = LOOSE_LAYERS.filter((rec) => {
      const st = layerOnState(rec);
      return (!activeOnly || st.on) && matchesMenu(menuQuery, [rec.l.name, rec.l.src, questionForLayer(rec.s.id, rec.l.id)]);
    });
    if (!shown.length) return '';
    const hidden = !menuQuery && collapsedSections.has('__loose');
    return '<section class="mp-sec" data-section="__loose" style="--sc:#8aa0b4">'
      + '<h3 class="mp-title"><button data-collapse="__loose" aria-expanded="' + (hidden ? 'false' : 'true') + '">'
      + '<i></i>' + (i18n.ko ? '지구 표현 · 이동' : 'Globe view & controls') + '<em>' + shown.length + '</em></button></h3>'
      + '<div ' + (hidden ? 'hidden' : '') + '>' + shown.map((r) => layerRowHtml(r, false)).join('') + '</div></section>';
  };

  const sectionHtml = (s) => {
    const shown = s.layers.filter(l => {
      const st = hooks.getLayerState?.(s.id, l) || {};
      return (!activeOnly || st.on) && matchesMenu(menuQuery, [s.label,l.name,l.src,questionForLayer(s.id,l.id),menuCoverage(l.id)]);
    });
    if (!shown.length) return '';
    let chips = '';
    if (s.id === 'land') {
      chips = `<div class="mp-chips" role="group" aria-label="${i18n.t('regionMove')}">
          ${REGION_CHIPS.map((r) => `<button class="mp-chip" data-region="${r.id}">${i18n.region(r.id, r.ko)}</button>`).join('')}
        </div>
        <div class="mp-chip-note">${i18n.t('regionNote')}</div>`;
    } else if (s.id === 'people' && POP_COUNTRIES.length) {
      // 격자 목록(popgrid/index.json)에는 우리말 이름만 있다. 영어 이름은 나라 정본이 갖고 있어서
      // 셸이 직접 들고 있지 않고 hooks.countryName 으로 물어본다 — 손으로 표를 만들면 격자를
      // 늘릴 때마다 메뉴가 실제와 어긋난다.
      const cname = (c) => (hooks.countryName ? hooks.countryName(c.iso3, c.nameKo) : c.nameKo);
      const loc = i18n.ko ? 'ko-KR' : 'en-US';
      chips = `<div class="mp-chips" role="group" aria-label="${i18n.t('popChips')}">
          ${POP_COUNTRIES.map((c) => `<button class="mp-chip" data-pop="${c.iso3}" data-popname="${c.nameKo}" title="${i18n.t('popTitle').replace('{n}', c.total.toLocaleString(loc)).replace('{y}', c.year)}">${cname(c)}</button>`).join('')}
        </div>
        <div class="mp-chip-note">${i18n.t('popNote').replace('{n}', POP_COUNTRIES.length)}</div>`;
    }
    return `<section class="mp-sec" data-section="${s.id}" style="--sc:${s.accent}">
      <h3 class="mp-title"><button data-collapse="${s.id}" aria-expanded="${menuQuery || !collapsedSections.has(s.id) ? 'true':'false'}"><i></i>${i18n.scene(s.id, s.label)}<em>${shown.length} ${i18n.ko ? '항목':'items'}</em></button></h3>
      <div ${!menuQuery && collapsedSections.has(s.id) ? 'hidden':''}>
      ${menuQuery || activeOnly ? '' : chips}
      ${(() => {
        let sawLongterm = false;
        return shown.map((l) => {
          // §13: 첫 장기 시나리오 항목 앞에 소제목을 한 번만 끼운다 — "지금 예보"와 섞이지 않게.
          const divider = (!menuQuery && l.longterm && !sawLongterm)
            ? (sawLongterm = true, `<div class="mp-subdiv">${i18n.ko ? '장기 기후 시나리오 — 예보 아님, 2100년까지 전망' : 'Long-term climate scenarios — not a forecast, out to 2100'}</div>`)
            : '';
          const st = (hooks.getLayerState && hooks.getLayerState(s.id, l)) || {};
          return divider + `<button class="mp-item${l.state === 'LOCKED' ? ' locked' : ''}${st.on ? ' on' : ''}"
            data-fscene="${s.id}" data-flayer="${l.id}" title="${safeText(l.src)}" aria-pressed="${!!st.on}">
            <span class="mp-lbl">${i18n.layer(l.id, l.name, s.id)}</span>${dataBadge(l.state)}
            <span class="mp-question">${safeText(i18n.ko ? questionForLayer(s.id,l.id) || l.name : l.name)}</span>
            <span class="mp-support">${safeText(menuCoverage(l.id,i18n.ko))} · ${safeText(menuTime(l.id,i18n.ko))}</span>
            ${st.on && st.note ? `<span class="mp-note">${st.note}</span>` : ''}
          </button>`;
        }).join('');
      })()}
      </div></section>`;
  };

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
    fetch(reportBase() + '/reports/index.json', { cache: 'no-cache' })
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
    const aeth = brand === 'aetherus';
    const isReport = brand === 'report';
    if (isReport) loadReportIndex();
    // PHASE 4 — 브랜드로 도메인을 고른다. AETHERUS 는 우주 하나(기존 계약 유지, §1).
    const domains = isReport ? [] : aeth ? ['space'] : ['land', 'weather', 'ocean', 'people', 'travel', 'hazards'];
    panel.classList.toggle('aeth', aeth);
    panel.innerHTML = `
      <div class="mp-head">
        <div class="mp-head-copy"><b>${isReport ? (i18n.ko ? '리포트' : 'REPORTS') : aeth ? 'AETHERUS' : 'EARTHUS'}</b><small>${isReport ? (i18n.ko ? '사건 분석 · 지구 회고 · 전망' : 'Event analysis · retrospective · outlook') : i18n.t(aeth ? 'mpTagA' : 'mpTagE')}</small></div>
        <button class="ui-x" data-x="1" aria-label="${i18n.ko ? '메뉴 닫기':'Close menu'}">✕</button>
      </div>
      ${isReport ? '' : `<div class="mp-search"><label>${i18n.ko ? '메뉴·질문 검색':'Find a topic'}<input type="search" data-menu-search value="${safeText(menuQuery)}" placeholder="${i18n.ko ? '예: 파고, 무장애, 한국':'Search topics'}"></label>
      <label class="mp-active-only"><input type="checkbox" data-active-only ${activeOnly ? 'checked':''}>${i18n.ko ? '켜진 자료만':'Active only'}</label></div>`}
      <div class="mp-body">
        ${isReport ? reportPanelHtml() : (domains.map(domainSectionHtml).join('') + (aeth ? '' : looseSectionHtml())) || `<p role="status">${i18n.ko ? '조건에 맞는 메뉴가 없습니다. 검색어 또는 필터를 바꿔 주세요.':'No matching topics. Change the search or filter.'}</p>`}
        ${isReport ? '' : `<div class="mp-foot">${i18n.t('mpFoot')}</div>`}
      </div>`;
    panel.classList.add('open');
    if (scrim) scrim.classList.add('on');
    tabE.classList.toggle('open', !aeth && !isReport);
    tabE.classList.toggle('beside', aeth || isReport);
    tabA.classList.toggle('open', aeth);
    tabA.classList.toggle('beside', !aeth);
    if (hooks.onFlyoutOpened) hooks.onFlyoutOpened();
  };

  const closeFlyout = () => {
    openBrand = null;
    panel.classList.remove('open');
    if (scrim) scrim.classList.remove('on');
    tabE.classList.remove('open');
    tabE.classList.remove('beside');
    tabA.classList.remove('open');
    tabA.classList.remove('beside');
  };

  // 레이어를 켤 때마다 패널을 통째로 다시 그리는데, 그러면 목록이 맨 위로 튀고
  // 눌러 둔 칩의 표시도 사라진다. 스크롤 위치와 칩 선택을 지켜서 다시 그린다.
  const refreshFlyout = () => {
    if (!openBrand) return;
    const body = panel.querySelector('.mp-body');
    const top = body ? body.scrollTop : 0;
    const active = document.activeElement;
    const restore = active && panel.contains(active) ? {search:active.matches('[data-menu-search]'), start:active.selectionStart, end:active.selectionEnd,scene:active.dataset.fscene,id:active.dataset.flayer,collapse:active.dataset.collapse} : null;
    const onChips = [...panel.querySelectorAll('.mp-chip.on')]
      .map((c) => c.dataset.region || c.dataset.pop).filter(Boolean);
    openPanel(openBrand);
    const body2 = panel.querySelector('.mp-body');
    if (body2 && top) body2.scrollTop = top;
    const restoreEl = restore?.search ? panel.querySelector('[data-menu-search]') : restore?.id ? panel.querySelector(`[data-fscene="${restore.scene}"][data-flayer="${restore.id}"]`) : restore?.collapse ? panel.querySelector(`[data-collapse="${restore.collapse}"]`) : null;
    if (restoreEl) { restoreEl.focus({preventScroll:true}); if(restore?.search)restoreEl.setSelectionRange(restore.start,restore.end); }
    for (const key of onChips) {
      const c = panel.querySelector(`.mp-chip[data-region="${key}"], .mp-chip[data-pop="${key}"]`);
      if (c) c.classList.add('on');
    }
  };
  panel.addEventListener('input',e=>{
    if(e.target.matches('[data-menu-search]')) menuQuery=e.target.value;
    else if(e.target.matches('[data-active-only]')) activeOnly=e.target.checked;
    else return;
    const scenes=SCENES.filter(s=>(s.group||'earthus')===openBrand);
    panel.querySelector('.mp-body').innerHTML=scenes.map(sectionHtml).join('') || `<p role="status">${i18n.ko?'조건에 맞는 메뉴가 없습니다. 검색어 또는 필터를 바꿔 주세요.':'No matching topics. Change the search or filter.'}</p>`;
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
        const btn = intel.querySelector(`[data-tab="${want}"]`);
        const target = btn && !btn.hidden ? want : 'now';
        showTab(target, 'intent');
        if (!intelOpen) intel.querySelector('#intel-tab').click();
      }
      return;
    }
    const toPhen = e.target.closest('[data-report-phenomenon]');
    if(toPhen){const [sid,lid]=toPhen.dataset.reportPhenomenon.split('/');const sc=SCENES.find(x=>x.id===sid);const ly=sc&&sc.layers.find(x=>x.id===lid);if(ly&&hooks.onLayerAction){selectedMenu={s:sc,l:ly};applyCapabilityGating();hooks.onLayerAction(sid,ly);closeFlyout();if(!intelOpen)intel.querySelector('#intel-tab').click();else renderIntel();}return;}
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
  intel.innerHTML = `
    <button id="intel-tab">EARTH INTELLIGENCE</button>
    <div id="intel-body">
      <div class="intel-tabs">
        <button data-tab="feed" class="on">${i18n.ko?'사건':'Feed'}</button>
        <!-- STEP 55: 3열 그리드에서 '내 장소 · FOR ME' 가 칸을 넘어 옆 탭 글자를 덮었다(실측 375폭).
             하단 바가 이미 '내 지역'으로 부르고 있으니 같은 말로 맞춘다 — 가는 곳은 그대로다. -->
        <button data-tab="my">${i18n.ko?'내 지역':'My place'}</button>
        <button data-tab="now">${i18n.ko?'선택 자료':'Now'}</button>
        <button data-tab="why">${i18n.ko?'자료의 근거':'Why'}</button>
        <button data-tab="next">${i18n.ko?'예보·예정':'Next'}</button>
        <!-- PHASE 5 §4 — 이력. 사료를 '지금'처럼 보이지 않게 따로 둔다. -->
        <button data-tab="history">${i18n.ko?'이력':'History'}</button>
        <!-- 2026-09-07 지시 §18: 사용자가 찾을 수 있는 이름을 먼저 쓴다. "가정 실험/What-if"
             는 고급 기능 쪽 표현으로 남기고(탭 안 내용·main.js 는 그대로), 탭 이름만 바꾼다. -->
        <button data-tab="scenario">${i18n.ko?'시뮬레이션':'Simulation'}</button>
        <button class="ui-x" id="intel-close" aria-label="${i18n.ko?'정보 닫기':'Close information'}">✕</button>
      </div>
      <div id="intel-content"></div>
    </div>`;
  root.appendChild(intel);
  // 손잡이 기본 이름을 화면 언어에 맞춘다. 마크업의 'EARTH INTELLIGENCE' 는 영어 고정이라
  // 한국어 화면에서 혼자 영어로 남아 있었다. 현상을 고르면 그 현상 이름으로 바뀐다.
  applyPanelIdentity(null);

  /* ---------- 하단 바 — 내 지역 / 무슨 일 / 날씨 / 바다 / 우주 / 더보기 ----------
     2026-09-07 개명: '내 곳' → '내 지역'. 인용한 원 지시문은 그대로 둔다.
     2026-09-07 v1/v2 역할 분리 지시 §15: "109개 SCENES 를 그대로 노출하지 않는다.
     최종 V2 메인 하단 메뉴: 내 곳 무슨 일 날씨 바다 우주 더보기." §17: 기본 화면은
     6탭 우측 패널이 아니라 대표 카드 하나 — 이 바가 그 대표 진입점이다.
     좌측 세로 손잡이·우측 패널은 지우지 않는다. "더보기"가 정확히 그 기존 화면을 연다. */
  const bottomNav = document.createElement('div');
  bottomNav.id = 'bottom-nav';
  const NAV_ICON = {
    myplace: '<path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/>',
    feed: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7a5 5 0 1 0 5 5"/><circle cx="12" cy="12" r="1.5"/>',
    weather: '<path d="M7 17a4 4 0 0 1 .6-7.9A6 6 0 0 1 19 11a3 3 0 0 1 0 6Z"/>',
    ocean: '<path d="M2 14c3-4 6-4 9 0s6 4 9 0"/><path d="M2 19c3-4 6-4 9 0s6 4 9 0"/>',
    space: '<rect x="9" y="9" width="6" height="6"/><path d="M2 12h5M17 12h5M4 9v6M20 9v6"/>',
    more: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
    explore: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    report: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>',
  };
  /* PHASE 5 §2 — 하단 바는 6개였고 그중 5개가 다른 진입점이 이미 가는 곳으로 다시 갔다.
     날씨·바다는 '탐색' 안의 도메인이 됐으므로 하단에서 뺀다(같은 곳으로 가는 길을 셋씩 두지 않는다).
     '더보기'는 '탐색'과 같은 곳이라 합친다. '무슨 일'은 '지금'으로 이름을 하나로 모은다(§15).
     리포트는 EARTHUS 의 핵심 콘텐츠라 최상위로 올린다(§5). */
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
    bottomNav.innerHTML = NAV_ITEMS.map((n) => `<button type="button" data-nav="${n.id}"${n.id === curId ? ' class="on"' : ''}>
      <svg viewBox="0 0 24 24">${NAV_ICON[n.id]}</svg><span>${i18n.ko ? n.ko : n.en}</span>
    </button>`).join('');
  };
  renderNav();
  root.appendChild(bottomNav);

  // 씬 목록 패널에서 특정 그룹(날씨·바다)까지 열어 스크롤해 보여준다 — 접혀 있었다면 편다.
  const gotoScene = (brand, sceneId) => {
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
    bottomNav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    switch (btn.dataset.nav) {
      case 'myplace': showTab('my'); if (!intelOpen) intel.querySelector('#intel-tab').click(); break;
      case 'feed': showTab('feed'); if (!intelOpen) intel.querySelector('#intel-tab').click(); break;
      case 'explore': openPanel('earthus'); break;
      case 'report': openPanel('report'); break;
      case 'space': gotoScene('aetherus', 'space'); break;
    }
  });

  const intelBody = intel.querySelector('#intel-body');
  const intelContent = intel.querySelector('#intel-content');
  let intelOpen = false;
  let curTab = 'feed';
  // INTEGRATION-3 §11 — '마지막 사용자 의도'. showTab() 아래 설명 참고.
  let tabIntent = 'feed';

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
    const members = (DOMAIN_INDEX.get(ctx.domain) || []).find((e) => e.id === ctx.phenomenonId);
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
  const whyHtml = () => {
    const rows = activeLayers();
    const picked = hooks.feedSelected && hooks.feedSelected();
    return `
      <div class="card"><div class="card-h">${i18n.t('whyTitle')}</div>
        <div class="card-b">${i18n.t('whyGate')}</div></div>
      ${picked ? `<div class="card"><div class="card-h">${i18n.t('eventPicked')}</div>
        <div class="card-b"><b>${picked.title}</b><br/>
        <button class="feed-back" data-action="shell-open-feed" style="margin:8px 0 0">${i18n.t('eventOpen')}</button></div></div>` : ''}
      <div class="card"><div class="card-h">${i18n.t('whyNow')} <span class="feed-cnt">${rows.length}</span></div>
        <div class="card-b">${rows.length
    ? rows.map(evidenceRow).join('')
    : `${i18n.t('whyEmpty')}<br/><button class="feed-back" data-action="shell-open-menu" style="margin:8px 0 0">${i18n.t('openMenu')}</button>`}</div></div>
      <div class="card"><div class="card-b"><span class="paysub">${i18n.t('whyPro')}</span></div></div>`;
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

  const renderIntel = () => {
    const scrollTop=intelContent.scrollTop;
    if (curTab === 'feed') {
      intelContent.innerHTML = hooks.getFeed();
    } else if (curTab === 'now') {
      intelContent.innerHTML = hooks.getNow();
    } else if (curTab === 'my') {
      intelContent.innerHTML = hooks.getMy ? hooks.getMy() : '';
    } else if (curTab === 'scenario') {
      intelContent.innerHTML = hooks.getScenario();
    } else if (curTab === 'history') {
      intelContent.innerHTML = historyHtml();
    } else if (curTab === 'why') {
      intelContent.innerHTML = whyHtml();
    } else {
      intelContent.innerHTML = nextHtml();
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
    const header=document.createElement('div');header.className='information-context';
    header.innerHTML=`${selectedMenu ? `<strong>${safeText(i18n.ko ? questionForLayer(selectedMenu.s.id, selectedMenu.l.id) || selectedMenu.l.name : selectedMenu.l.name)}</strong><div>${safeText(selectedMenu.l.src)} · ${dataBadge(selectedMenu.l.state)}</div>${phenomenonLine()}`:''}<div>${safeText(i18n.ko?'선택 장소':'Selected place')}: ${safeText(picked?.nameKo || picked?.name || (i18n.ko?'지도에서 선택':'Select on the globe'))}</div>${timelineMinutes ? `<p class="information-time">${safeText(i18n.ko?'재생 시간은 일부 예보에 적용됩니다. 다른 자료는 각 원자료 시각에 고정됩니다.':'Playback applies to supported forecasts. Other data keeps its source time.')}</p>`:''}
      ${active.length ? `<details><summary>${i18n.ko?'현재 켜진 자료':'Active data'} ${active.length}</summary>${active.map(({s,l})=>`<div class="active-data-row"><span>${safeText(i18n.layer(l.id,l.name,s.id))}<small>${safeText(menuTime(l.id,i18n.ko))}</small></span>${canClearLayer(l.id)?`<button data-action="shell-layer-off" data-scene="${s.id}" data-layer="${l.id}" aria-label="${safeText(l.name)} 끄기">${i18n.ko?'끄기':'Off'}</button>`:''}</div>`).join('')}<button data-action="shell-clear-layers">${i18n.ko?'추가 자료 모두 끄기':'Clear overlays'}</button></details>`:''}`;
    intelContent.prepend(header);
    intelContent.scrollTop=scrollTop;
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
    if (a === 'shell-play5d') { strip.querySelector('#ts-play').click(); return; }
    if (hooks.onAction) hooks.onAction(a, btn.dataset);
  });

  // 카드 안의 슬라이더는 click 이 아니라 input 으로 온다. 같은 onAction 으로 흘려보낸다.
  intel.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && hooks.onAction) hooks.onAction(el.dataset.action, el.dataset, el.value);
  });

  intel.querySelector('#intel-tab').addEventListener('click', () => {
    intelOpen = !intelOpen;
    intel.classList.toggle('open', intelOpen);
    if (intelOpen) renderIntel();
  });
  intel.querySelectorAll('.intel-tabs button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // §11 — 사용자가 직접 고른 것이므로 여기서 의도가 갱신된다.
      // 이 줄 덕분에 "자료를 기다리는 동안 다른 탭을 눌렀다"가 존중된다.
      showTab(btn.dataset.tab, 'intent');
    });
  });

  const closeIntel = () => {
    if (intelOpen) intel.querySelector('#intel-tab').click();
  };
  intel.querySelector('#intel-close').addEventListener('click', closeIntel);

  // --- 하단 타임 스트립 (§19.7): 태양 위치는 진짜 재계산(LIVE), 관측 구름은 STALE ---
  const strip = document.createElement('div');
  strip.id = 'timestrip';
  strip.innerHTML = `
    <button id="ts-now">${i18n.t('now')}</button>
    <button id="ts-play" title="${i18n.t('play5d')}">▶</button>
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
  const showTab = (t, source) => {
    if (source === 'follow' && t !== tabIntent) return false;
    tabIntent = t;
    curTab = t;
    intel.querySelectorAll('.intel-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
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
    openIntel: () => { if (!intelOpen) intel.querySelector('#intel-tab').click(); },
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
