// EARTHUS v2-three — 화면 문법 셸 (지시서 §19.12, §106.1)
// 좌측 레일(씬 메뉴) + 우측 EARTH INTELLIGENCE 패널(NOW/WHY/NEXT) + 하단 타임 스트립 + 라벨 엔진.
// 지구 렌더러(main.js)는 건드리지 않고 훅(hooks)으로만 연결한다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { i18n } from './i18n.js?v=1';
import { renderBadge } from './engine-bridge.js?v=12';

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
      { id: 'locate', name: '내 위치로 이동', state: 'LIVE', src: 'GPS', act: true },
      { id: 'globe', name: '전지구 보기', state: 'LIVE', src: '—', act: true },
      { id: 'base-ne2', name: '베이스 · 자연 지형', state: 'LIVE', src: 'Natural Earth II', act: true },
      { id: 'base-bluemarble', name: '베이스 · 블루마블 (지형·수심)', state: 'OBSERVED', src: 'NASA GIBS', act: true },
      { id: 'base-truecolor', name: '베이스 · 오늘의 지구 (실촬영)', state: 'OBSERVED', src: 'VIIRS True Color', act: true },
      { id: 'base-night', name: '베이스 · 밤의 불빛', state: 'OBSERVED', src: 'VIIRS City Lights 2012', act: true },
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
      { id: 'marine', name: '해상 실황 조회', state: 'OBSERVED', src: 'Open-Meteo Marine', act: true },
      { id: 'oceanfocus', name: '해양 포커스', state: 'DEMO', src: '—', act: true },
      { id: 'typhoonsim', name: '태풍 해상 시뮬레이션', state: 'SIMULATION_ONLY', src: '자체 물리', act: true },
      { id: 'buoys', name: '해양 부이 관측 (수온)', state: 'OBSERVED', src: 'NDBC 등 · 1.0 S3', act: true },
      { id: 'kmasea', name: '해상 관측망 (파고·수온 193지점)', state: 'OBSERVED', src: '기상청 해양관측', act: true },
      { id: 'sstfield', name: '해수면 온도 (전지구)', state: 'OBSERVED', src: 'NOAA OISST v2.1', act: true },
      { id: 'sstanom', name: '수온 아노말리 (평년 대비)', state: 'OBSERVED', src: 'OISST − 1991~2020 평년', act: true },
      { id: 'slr', name: '해수면 상승 전망 2100 (전 세계)', state: 'MODEL_SIGNAL', src: 'IPCC AR6 · NASA', act: true },
      { id: 'khoasl126', name: '우리 바다 해수면 전망 · SSP1-2.6 저배출', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true },
      { id: 'khoasl245', name: '우리 바다 해수면 전망 · SSP2-4.5 중간', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true },
      { id: 'khoasl370', name: '우리 바다 해수면 전망 · SSP3-7.0 고배출', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true },
      { id: 'khoasl585', name: '우리 바다 해수면 전망 · SSP5-8.5 최고', state: 'MODEL_SIGNAL', src: '국립해양조사원 지역 해양기후 모델 · 0.05°', act: true },
      { id: 'khoaflood', name: '연안 침수 범위 — 시군구별 침수 예상도', state: 'OFFICIAL_OBSERVATION', src: '국립해양조사원 · 연안 시군구 70곳', act: true },
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
      { id: 'sculpt', name: '인구 데이터 조각 — 국가를 누르세요', state: 'OBSERVED', src: 'WorldPop 1km 격자', act: true },
      { id: 'livemix', name: '지금 사람 × 거주 인구 (서울)', state: 'OBSERVED', src: '서울시 실시간 + WorldPop', act: true },
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
      { id: 'bf', name: '무장애 여행지 11,644곳', state: 'OBSERVED', src: 'KTO 무장애 여행 정보', act: true },
      { id: 'wl', name: '웰니스 관광지 202곳', state: 'OBSERVED', src: 'KTO 웰니스관광정보', act: true },
      { id: 'en', name: '외국인 · 영문 콘텐츠 25,398건', state: 'OBSERVED', src: 'KTO 영문 관광정보', act: true },
      { id: 'visitors', name: '방문자 스냅샷 (이동통신 · 관광객 아님)', state: 'HISTORY', src: 'KTO 지역별 방문자수', act: true },
      { id: 'related', name: '하나 더 — 연관 관광지 그래프', state: 'HISTORY', src: 'KTO 관광지별 연관 관광지 (TMAP 이동)', act: true },
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
      { id: 'tsunami', name: '쓰나미 정보', state: 'LIVE', src: 'PTWC·NWS', act: true },
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
      { id: 'aeth-orbit', name: '궤도 인텔리전스 (정본 카탈로그·근접사건)', state: 'LIVE', src: 'AETHERUS API · 서버 SGP4', act: true },
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

// 미오픈 국가 준비도 (§67.1) — 오픈 국가만 LIVE, 그 외 정직한 준비 상태
const OPEN_COUNTRIES = new Set(['KOR', 'JPN', 'USA', 'GBR']);

export function initShell(hooks) {
  // hooks: { onScene(id), getNow() -> html, camera, getFocusSel(), labelData() -> [{nameKo,lat,lon,rank}] }
  const root = document.body;

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

  // 권역 이동 (v5.3 스케일 사다리: GLOBAL → CONTINENT → REGION → COUNTRY).
  // 3D 지구를 벗어나지 않고 카메라만 그 권역 구도로 옮긴다 — 평면 전환이 아니다.
  const REGION_CHIPS = [
    { id: 'globe', ko: '전 지구' },
    { id: 'eastasia', ko: '동북아시아' },
    { id: 'korea', ko: '한반도' },
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
      POP_COUNTRIES = j.countries;
      if (openBrand) refreshFlyout();
    })
    .catch(() => { /* 목록이 없으면 칩 없이 국가 클릭으로만 쓴다 */ });

  const sectionHtml = (s) => {
    const liveN = s.layers.filter((l) => l.state !== 'LOCKED').length;
    let chips = '';
    if (s.id === 'land') {
      chips = `<div class="mp-chips" role="group" aria-label="권역 이동">
          ${REGION_CHIPS.map((r) => `<button class="mp-chip" data-region="${r.id}">${i18n.region(r.id, r.ko)}</button>`).join('')}
        </div>
        <div class="mp-chip-note">권역 이동 — 3D 지구를 유지한 채 그 구도로 날아갑니다</div>`;
    } else if (s.id === 'people' && POP_COUNTRIES.length) {
      chips = `<div class="mp-chips" role="group" aria-label="인구 조각 국가">
          ${POP_COUNTRIES.map((c) => `<button class="mp-chip" data-pop="${c.iso3}" data-popname="${c.nameKo}" title="${c.total.toLocaleString('ko-KR')}명 · ${c.year}">${c.nameKo}</button>`).join('')}
        </div>
        <div class="mp-chip-note">인구 조각 — 격자가 준비된 ${POP_COUNTRIES.length}개국. 지구에서 국가를 눌러도 됩니다</div>`;
    }
    return `<div class="mp-sec" style="--sc:${s.accent}">
      <h3 class="mp-title"><i></i>${i18n.scene(s.id, s.label)}<em>${liveN}/${s.layers.length}</em></h3>
      ${chips}
      ${s.layers.map((l) => {
        const st = (hooks.getLayerState && hooks.getLayerState(s.id, l)) || {};
        return `<button class="mp-item${l.state === 'LOCKED' ? ' locked' : ''}${st.on ? ' on' : ''}"
          data-fscene="${s.id}" data-flayer="${l.id}" title="${l.src}">
          <span class="mp-lbl">${i18n.layer(l.id, l.name)}</span>${dataBadge(l.state)}
          ${st.on && st.note ? `<span class="mp-note">${st.note}</span>` : ''}
        </button>`;
      }).join('')}
    </div>`;
  };

  const scrim = document.getElementById('menu-scrim');
  if (scrim) scrim.addEventListener('click', () => closeFlyout());

  const openPanel = (brand) => {
    openBrand = brand;
    const aeth = brand === 'aetherus';
    const scenes = SCENES.filter((s) => (s.group || 'earthus') === brand);
    panel.classList.toggle('aeth', aeth);
    panel.innerHTML = `
      <div class="mp-head">
        <div class="mp-head-copy"><b>${aeth ? 'AETHERUS' : 'EARTHUS'}</b><small>${aeth ? '우주 · 궤도 · 태양계' : '실데이터로 살아있는 지구'}</small></div>
        <button class="ui-x" data-x="1">✕</button>
      </div>
      <div class="mp-body">
        ${scenes.map(sectionHtml).join('')}
        <div class="mp-foot">잠긴 레이어 = 데이터 미연결 (출처·계획 명시) — 가짜 값 없음</div>
      </div>`;
    panel.classList.add('open');
    if (scrim) scrim.classList.add('on');
    tabE.classList.toggle('open', !aeth);
    tabE.classList.toggle('beside', aeth);
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
    const onChips = [...panel.querySelectorAll('.mp-chip.on')]
      .map((c) => c.dataset.region || c.dataset.pop).filter(Boolean);
    openPanel(openBrand);
    const body2 = panel.querySelector('.mp-body');
    if (body2 && top) body2.scrollTop = top;
    for (const key of onChips) {
      const c = panel.querySelector(`.mp-chip[data-region="${key}"], .mp-chip[data-pop="${key}"]`);
      if (c) c.classList.add('on');
    }
  };

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { closeFlyout(); return; }
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
    if (layer && hooks.onLayerAction) hooks.onLayerAction(scene.id, layer);
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
        <button data-tab="feed" class="on">FEED</button>
        <button data-tab="my">MY</button>
        <button data-tab="now">NOW</button>
        <button data-tab="why">WHY</button>
        <button data-tab="next">NEXT</button>
        <button data-tab="scenario">WHAT IF</button>
        <button class="ui-x" id="intel-close">✕</button>
      </div>
      <div id="intel-content"></div>
    </div>`;
  root.appendChild(intel);

  const intelBody = intel.querySelector('#intel-body');
  const intelContent = intel.querySelector('#intel-content');
  let intelOpen = false;
  let curTab = 'feed';

  const LOCKED_TABS = {
    why: {
      title: 'WHY — 왜 이런 상태인가',
      preview: '사건·상태 변화의 원인 후보를 근거 그래프와 함께 설명합니다. 원인은 근거 등급(가설→강한 근거→공식 조사)으로만 표시.',
    },
    next: {
      title: 'NEXT — 다음에 어떻게 되나',
      preview: '공식 예보와 모델 신호를 신뢰도·불확실성과 함께 제공합니다. (관측≠예보, 모델은 항상 라벨)',
    },
  };

  const renderIntel = () => {
    if (curTab === 'feed') {
      intelContent.innerHTML = hooks.getFeed();
    } else if (curTab === 'now') {
      intelContent.innerHTML = hooks.getNow();
    } else if (curTab === 'my') {
      intelContent.innerHTML = hooks.getMy ? hooks.getMy() : '';
    } else if (curTab === 'scenario') {
      intelContent.innerHTML = hooks.getScenario();
    } else {
      const t = LOCKED_TABS[curTab];
      intelContent.innerHTML = `
        <div class="card">
          <div class="card-h">${t.title}</div>
          <div class="card-b">${t.preview}</div>
          <div class="paycard">
            <div><b>EXPLORER PRO</b> — UNDERSTAND THE EARTH에서 제공 예정입니다.</div>
            <div class="paysub">FREE는 체험판이 아님 — 공식 안전정보·표시된 사실 근거는 항상 무료</div>
          </div>
        </div>`;
    }
  };

  // 패널 내 버튼 액션 위임 (예: 시뮬레이션 시작)
  intelContent.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn && hooks.onAction) hooks.onAction(btn.dataset.action, btn.dataset);
  });

  intel.querySelector('#intel-tab').addEventListener('click', () => {
    intelOpen = !intelOpen;
    intel.classList.toggle('open', intelOpen);
    if (intelOpen) renderIntel();
  });
  intel.querySelectorAll('.intel-tabs button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      curTab = btn.dataset.tab;
      intel.querySelectorAll('.intel-tabs button[data-tab]').forEach((b) => b.classList.toggle('on', b === btn));
      renderIntel();
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
    <button id="ts-play" title="5일 예보 재생">▶</button>
    <input type="range" id="ts-range" min="-1440" max="7200" step="30" value="0" />
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
    const n = m !== 0 && hooks.timeNote ? hooks.timeNote(m) : null;
    hooks.onTimeOffset(m * 60000);
    tsLabel.textContent = m === 0 ? 'NOW'
      : `${fmtOffset(m)} · ${n ? n.short : ''}`;
    strip.title = n ? n.full : '';
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
      if (v > 7200) v = 0;
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

  const showTab = (t) => {
    curTab = t;
    intel.querySelectorAll('.intel-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    if (intelOpen) renderIntel();
  };

  return {
    setActiveScene,
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
    cards.push(`<div class="card"><div class="card-h">해양 포커스 ${dataBadge('OBSERVED')}</div>
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
