// 위성 카탈로그 — 그룹 정의 + TLE 에서 상세정보 도출 + 목적 판별
//
// 무료 데이터로 어디까지 알 수 있나
//   CelesTrak TLE 에 들어있는 것 : 이름, NORAD ID, 국제식별번호(COSPAR), 궤도요소
//   TLE 에서 계산 가능한 것      : 고도, 주기, 경사각, 이심률 → 궤도 종류
//   SATCAT 조인으로 얻는 것      : 소유국, 발사일, 발사장, 크기(RCS), 운용 상태
//   이름 계열에서 아는 것        : 무엇을 하는 위성인지 (아래 PURPOSE)
//   ❌ 무료로 못 얻는 것         : 제작사, 개별 위성의 상세 제원
//                                 → 유명 위성은 CURATED 에 직접 넣고,
//                                   나머지는 계열 규칙으로 목적을 채운다.

import { i18n } from '../i18n.js';

/* ── 사용자에게 보여줄 그룹 ────────────────────────────────────
   heavy: 개수가 많아 경고 후 로드
   ⚠️ 예전엔 우주정거장에 always:true 를 걸어 끄지 못하게 했다.
      "기본으로 켜두는 것"과 "끌 수 없게 막는 것"은 다르다 — 기본만 켜두고 끌 수 있게 바꿨다. */
export const SAT_GROUPS = [
  { id:'stations', celestrak:['stations'], ko:'우주정거장', en:'Space stations',
    color:'#3fc7c0', est:25 },
  { id:'weather',  celestrak:['weather','noaa','goes'], ko:'기상',   en:'Weather',
    color:'#ffd166', est:180 },
  { id:'science',  celestrak:['science'],  ko:'과학',     en:'Science',
    color:'#c9a7ff', est:50 },
  { id:'nav',      celestrak:['gps-ops','galileo','beidou'], ko:'항법(GPS)', en:'Navigation',
    color:'#8fd694', est:110 },
  { id:'comm',     celestrak:['intelsat','ses','iridium-NEXT'], ko:'통신', en:'Communications',
    color:'#ff9ecb', est:190 },
  { id:'earth',    celestrak:['resource','planet'], ko:'지구관측', en:'Earth observation',
    color:'#7ec8e3', est:250 },
  { id:'military', celestrak:['military'], ko:'군사',    en:'Military',
    color:'#ff8a65', est:130 },
  { id:'amateur',  celestrak:['amateur'],  ko:'아마추어 무선', en:'Amateur radio',
    color:'#b0bec5', est:100 },
  { id:'starlink', celestrak:['starlink'], ko:'스타링크', en:'Starlink',
    color:'#8fb8ff', heavy:true, est:8000 },
  { id:'all',      celestrak:['active'],   ko:'전체',     en:'All active',
    color:'#cfd8dc', heavy:true, est:16000 },
];

/* ── 유명 위성 큐레이션 ───────────────────────────────────────
   TLE 로는 알 수 없는 정보. 이름으로 매칭한다. */
const CURATED = {
  'ISS (ZARYA)': {
    ko: { name:'국제우주정거장 (ISS)', operator:'NASA · Roscosmos · ESA · JAXA · CSA',
      purpose:'유인 우주정거장 — 미소중력 과학 실험, 지구 관측, 장기 체류 연구',
      built:'미국·러시아·유럽·일본·캐나다 공동 제작 (1998년 첫 모듈 발사)',
      control:'NASA 존슨우주센터(휴스턴) · 러시아 TsUP(모스크바)',
      look:'축구장 크기(약 109m)의 트러스 구조에 태양전지판 8쌍. 맨눈으로 밝은 별처럼 보임',
      crew:'상시 7명 내외' },
    en: { name:'International Space Station', operator:'NASA · Roscosmos · ESA · JAXA · CSA',
      purpose:'Crewed research station — microgravity science, Earth observation',
      built:'Joint US/Russia/Europe/Japan/Canada (first module 1998)',
      control:'NASA Johnson Space Center · Roscosmos TsUP',
      look:'Football-field sized truss (~109m) with 8 solar array pairs. Visible to the naked eye',
      crew:'Typically 7' },
  },
  'CSS (TIANHE)': {
    ko: { name:'톈궁 우주정거장 (핵심모듈 톈허)', operator:'중국 유인우주국(CMSA)',
      purpose:'중국 독자 유인 우주정거장 — 과학 실험 및 장기 체류',
      built:'중국항천과기집단(CASC), 2021년 발사',
      control:'베이징 항천비행통제중심',
      look:'T자형 3모듈 구조 (톈허·원톈·멍톈)', crew:'상시 3명' },
    en: { name:'Tiangong Space Station (Tianhe core)', operator:'China Manned Space Agency',
      purpose:'China\'s crewed space station', built:'CASC, launched 2021',
      control:'Beijing Aerospace Flight Control Center',
      look:'T-shaped 3-module station', crew:'Typically 3' },
  },
  'HST': {
    ko: { name:'허블 우주망원경', operator:'NASA · ESA',
      purpose:'가시광·자외선 우주 관측. 우주 팽창 속도 측정, 외계행성 대기 분석 등',
      built:'록히드마틴 · 퍼킨엘머, 1990년 발사',
      control:'우주망원경과학연구소(STScI, 볼티모어)',
      look:'길이 13.2m 원통형, 주경 지름 2.4m' },
    en: { name:'Hubble Space Telescope', operator:'NASA · ESA',
      purpose:'Optical/UV observatory', built:'Lockheed · Perkin-Elmer, launched 1990',
      control:'Space Telescope Science Institute', look:'13.2m cylinder, 2.4m primary mirror' },
  },
};

/* ── 발사장 코드 → 이름 ───────────────────────────────────────
   SATCAT 의 LAUNCH_SITE 는 "TYMSC" 같은 5자 코드다. 그대로 보여주면 아무 의미가 없다.
   출처: https://celestrak.org/satcat/launchsites.php (추측 금지 — 표에서 그대로 옮김)
   서버(Lambda)가 아니라 여기서 푸는 이유: 위성 16,123개마다 문자열을 실어 보내면
   카탈로그가 그만큼 커진다. 코드는 5바이트, 이름은 수십 바이트다. */
const SITES = {
  AFETR:['케이프커내버럴 (미 동부시험장, 플로리다)','Air Force Eastern Test Range, Florida, USA'],
  AFWTR:['밴덴버그 (미 서부시험장, 캘리포니아)','Air Force Western Test Range, California, USA'],
  ANDSP:['안되야 스페이스포트 (노르웨이)','Andøya Spaceport, Norway'],
  ALCLC:['알칸타라 발사센터 (브라질)','Alcântara Launch Center, Brazil'],
  BOS:  ['보웬 궤도 스페이스포트 (호주)','Bowen Orbital Spaceport, Australia'],
  CAS:  ['카나리아 공중발사','Canaries Airspace'],
  DLS:  ['돔바롭스키 발사장 (러시아)','Dombarovskiy Launch Site, Russia'],
  ERAS: ['미 동부 공중발사','Eastern Range Airspace'],
  FRGUI:['기아나 우주센터, 쿠루 (프랑스령 기아나)',"Europe's Spaceport, Kourou, French Guiana"],
  HGSTR:['하마기르 우주시험장 (알제리)','Hammaguira Space Track Range, Algeria'],
  JJSLA:['제주 해상 발사구역 (대한민국)','Jeju Island Sea Launch Area, Republic of Korea'],
  JSC:  ['주취안 우주센터 (중국)','Jiuquan Space Center, PRC'],
  KODAK:['코디액 발사장 (미국 알래스카)','Kodiak Launch Complex, Alaska, USA'],
  KSCUT:['우치노우라 우주센터 (일본)','Uchinoura Space Center, Japan'],
  KWAJ: ['콰절레인 환초 (미 육군)','US Army Kwajalein Atoll'],
  KYMSC:['카푸스틴야르 (러시아)','Kapustin Yar Missile and Space Complex, Russia'],
  NSC:  ['나로우주센터 (대한민국)','Naro Space Complex, Republic of Korea'],
  PLMSC:['플레세츠크 (러시아)','Plesetsk Missile and Space Complex, Russia'],
  RLLB: ['로켓랩 마히아 반도 (뉴질랜드)','Rocket Lab Launch Base, Mahia Peninsula, New Zealand'],
  SCSLA:['남중국해 해상 발사구역 (중국)','South China Sea Launch Area, PRC'],
  SEAL: ['시론치 해상 플랫폼 (이동식)','Sea Launch Platform (mobile)'],
  SEMLS:['셈난 위성발사장 (이란)','Semnan Satellite Launch Site, Iran'],
  SMTS: ['샤흐루드 미사일 시험장 (이란)','Shahrud Missile Test Site, Iran'],
  SNMLP:['산마르코 해상 플랫폼 (케냐 앞바다)','San Marco Launch Platform, Indian Ocean (Kenya)'],
  SPKII:['스페이스포트 기이 (일본)','Space Port Kii, Japan'],
  SRILR:['사티시 다완 우주센터 (인도)','Satish Dhawan Space Centre, India'],
  SUBL: ['잠수함 발사 플랫폼 (이동식)','Submarine Launch Platform (mobile)'],
  SVOBO:['스보보드니 (러시아)','Svobodnyy Launch Complex, Russia'],
  TAISC:['타이위안 우주센터 (중국)','Taiyuan Space Center, PRC'],
  TANSC:['다네가시마 우주센터 (일본)','Tanegashima Space Center, Japan'],
  TYMSC:['바이코누르 우주기지 (카자흐스탄)','Baikonur Cosmodrome, Kazakhstan'],
  UNK:  ['알 수 없음','Unknown'],
  VOSTO:['보스토치니 우주기지 (러시아)','Vostochny Cosmodrome, Russia'],
  WLPIS:['월롭스섬 (미국 버지니아)','Wallops Island, Virginia, USA'],
  WOMRA:['우메라 (호주)','Woomera, Australia'],
  WRAS: ['미 서부 공중발사','Western Range Airspace'],
  WSC:  ['원창 위성발사장 (중국 하이난)','Wenchang Satellite Launch Site, PRC'],
  XICLF:['시창 발사장 (중국)','Xichang Launch Facility, PRC'],
  YAVNE:['야브네 발사장 (이스라엘)','Yavne Launch Facility, Israel'],
  YSLA: ['황해 해상 발사구역 (중국)','Yellow Sea Launch Area, PRC'],
  YUN:  ['서해위성발사장 (북한 동창리)','Sohae Satellite Launching Station, North Korea'],
};

/** 발사장 코드를 사람이 읽는 이름으로. 모르는 코드는 코드 그대로 돌려준다. */
export function siteName(code, ko = true) {
  if (!code) return null;
  const s = SITES[String(code).trim().toUpperCase()];
  return s ? (ko ? s[0] : s[1]) : code;
}


/* ── 위성 계열별 목적 ──────────────────────────────────────────
   이름 접두어로 무엇을 하는 위성인지 알아낸다.
   위성은 대부분 위성군(constellation)이라 이름이 규칙적이다 —
   실측: 상위 40개 계열이 카탈로그 16,123개의 86% 를 덮는다 (스타링크만 67%).

   ⚠️ 확실한 것만 쓴다. 임무가 공개되지 않은 위성(러시아 COSMOS, 미국 USA,
      중국 TJS 등)은 "비공개"라고 쓰는 게 맞다. 그럴듯하게 지어내면 거짓말이 된다.
   ⚠️ 순서가 중요하다. 위에서부터 먼저 맞는 것을 쓰므로
      더 구체적인 규칙을 위에 둘 것 (SENTINEL-1 이 SENTINEL 보다 위). */
const PURPOSE = [
  // ── 저궤도 인터넷 위성군 ──
  [/^STARLINK/i, {
    ko: ['저궤도 인터넷', 'SpaceX 가 운용하는 광대역 인터넷 위성군. 지상 단말과 Ku·Ka 대역으로 통신하고, 위성끼리는 레이저로 연결해 해상·오지까지 인터넷을 보낸다.'],
    en: ['LEO internet', 'SpaceX broadband constellation. Ku/Ka-band links to ground terminals, laser crosslinks between satellites.'] }],
  [/^ONEWEB/i, {
    ko: ['저궤도 인터넷', 'Eutelsat OneWeb 의 광대역 위성군. Ku 대역을 쓰고 극지방까지 덮는 궤도로 설계됐다.'],
    en: ['LEO internet', 'Eutelsat OneWeb broadband constellation, Ku-band, polar coverage.'] }],
  [/^KUIPER/i, {
    ko: ['저궤도 인터넷', 'Amazon 의 광대역 인터넷 위성군(프로젝트 카이퍼).'],
    en: ['LEO internet', "Amazon's Project Kuiper broadband constellation."] }],
  [/^(QIANFAN|HULIANWANG|GUOWANG)/i, {
    ko: ['저궤도 인터넷', '중국이 구축 중인 광대역 인터넷 위성군.'],
    en: ['LEO internet', 'Chinese broadband internet constellation under deployment.'] }],

  // ── 위성항법 ──
  [/^(NAVSTAR|GPS)/i, {
    ko: ['위성항법 (GPS)', '미국 GPS. 정밀한 원자시계 신호를 뿌려 수신기가 위치와 시각을 계산하게 한다. 금융·통신망의 시각 동기에도 쓰인다.'],
    en: ['Navigation (GPS)', 'US GPS. Broadcasts atomic-clock signals for positioning and timing.'] }],
  [/^GALILEO|^GSAT-0/i, {
    ko: ['위성항법 (갈릴레오)', '유럽연합의 민간 위성항법 시스템.'],
    en: ['Navigation (Galileo)', 'European Union civil navigation system.'] }],
  [/^BEIDOU/i, {
    ko: ['위성항법 (베이더우)', '중국 위성항법 시스템. 항법 외에 단문 메시지 송수신 기능이 있다.'],
    en: ['Navigation (BeiDou)', 'Chinese navigation system, also supports short messaging.'] }],
  [/^(GLONASS|COSMOS 2\d{3}.*GLONASS)/i, {
    ko: ['위성항법 (글로나스)', '러시아 위성항법 시스템.'],
    en: ['Navigation (GLONASS)', 'Russian navigation system.'] }],
  [/^(CENTISPACE|GEESAT)/i, {
    ko: ['항법 보강', '저궤도에서 위성항법 정확도를 높여주는 보강 신호를 보낸다.'],
    en: ['Navigation augmentation', 'LEO augmentation improving satnav accuracy.'] }],

  // ── 기상 ──
  [/^(GOES|METEOSAT|HIMAWARI|FENGYUN|ELEKTRO|INSAT-3D)/i, {
    ko: ['정지궤도 기상', '적도 상공 약 35,800km 에 머물며 같은 반구를 10~15분마다 찍는다. 구름·수증기·해수면온도를 관측해 태풍 추적의 핵심이 된다.'],
    en: ['Geostationary weather', 'Images the same hemisphere every 10-15 min from 35,800 km. Clouds, water vapour, sea surface temperature.'] }],
  [/^(NOAA|SUOMI|JPSS|METOP|FY-3)/i, {
    ko: ['극궤도 기상', '남북 극을 도는 궤도에서 하루 두 번 전지구를 훑는다. 구름·기온·해빙·산불을 정지궤도보다 훨씬 자세히 본다.'],
    en: ['Polar-orbiting weather', 'Scans the whole globe twice a day at higher detail than geostationary.'] }],
  [/^TIANMU/i, {
    ko: ['기상 (GNSS 전파엄폐)', '항법위성 신호가 대기를 지나며 휘는 정도를 재서 기온·수증기 연직 분포를 얻는다.'],
    en: ['Weather (radio occultation)', 'Measures bending of navsat signals to profile temperature and humidity.'] }],

  // ── 지구관측 ──
  [/^SENTINEL-1/i, {
    ko: ['지구관측 (레이더)', '합성개구레이더(SAR)로 관측한다. 구름과 밤에 관계없이 지표를 보고, 지반 침하·유출유·해빙을 감시한다.'],
    en: ['Earth observation (SAR)', 'Synthetic aperture radar — sees through cloud and at night.'] }],
  [/^SENTINEL-2/i, {
    ko: ['지구관측 (광학)', '13개 파장으로 지표를 찍는다. 농작물 생육·산림·수질 변화를 추적한다.'],
    en: ['Earth observation (optical)', '13 spectral bands for crops, forests, water quality.'] }],
  [/^SENTINEL-3/i, {
    ko: ['해양·육상 관측', '해수면 온도·높이, 해색, 지표 온도를 잰다.'],
    en: ['Ocean & land', 'Sea surface temperature/height, ocean colour, land temperature.'] }],
  [/^SENTINEL-5|^SENTINEL-4/i, {
    ko: ['대기 관측', '오존·이산화질소·메탄 같은 대기 오염물질과 온실가스를 측정한다.'],
    en: ['Atmospheric monitoring', 'Ozone, NO2, methane and other pollutants.'] }],
  [/^LANDSAT/i, {
    ko: ['지구관측 (광학)', '1972년부터 이어지는 최장기 지표 관측. 같은 곳을 수십 년간 찍어 도시 확장·빙하 후퇴·삼림 벌채를 비교할 수 있다.'],
    en: ['Earth observation (optical)', 'Longest-running land record since 1972 — urban growth, glacier retreat, deforestation.'] }],
  [/^(TERRA|AQUA)$/i, {
    ko: ['지구관측 (MODIS)', '구름·에어로졸·해수면온도·식생을 매일 전지구로 관측한다.'],
    en: ['Earth observation (MODIS)', 'Daily global clouds, aerosols, SST, vegetation.'] }],
  [/^(FLOCK|DOVE|SKYSAT|NUSAT|JILIN|GAOFEN|IRIDE|SPOT|PLEIADES|WORLDVIEW)/i, {
    ko: ['상업 지구영상', '지표를 광학으로 촬영해 판매한다. 재난 피해 확인, 농업, 도시 변화 분석에 쓰인다.'],
    en: ['Commercial imaging', 'Optical imagery sold for disaster response, agriculture, urban analysis.'] }],
  [/^(ICEYE|CAPELLA|UMBRA)/i, {
    ko: ['상업 레이더 영상', 'SAR 로 촬영해 구름·야간에도 지표를 본다. 홍수·유출유·선박 탐지에 강하다.'],
    en: ['Commercial SAR', 'Radar imaging through cloud and darkness — floods, oil spills, ships.'] }],

  // ── 통신·IoT ──
  [/^IRIDIUM/i, {
    ko: ['위성전화·IoT', '극궤도 66기가 서로 연결돼 지구 어디서나 통화와 데이터가 된다. 항공기·선박 추적에도 쓰인다.'],
    en: ['Satphone & IoT', '66 cross-linked satellites giving true global voice/data coverage.'] }],
  [/^(INTELSAT|SES |SES-|EUTELSAT|ZHONGXING|CHINASAT|ASTRA|GALAXY|ANIK|OPTUS|THAICOM|MEASAT|KOREASAT)/i, {
    ko: ['정지궤도 통신·방송', '적도 상공에 고정돼 보여 접시 안테나를 한 방향으로 고정할 수 있다. TV 방송과 광역 통신을 중계한다.'],
    en: ['GEO comms & broadcast', 'Appears fixed above the equator — TV and wide-area communications relay.'] }],
  [/^O3B/i, {
    ko: ['중궤도 통신', '적도 상공 약 8,000km 에서 도는 SES 의 통신 위성군. 정지궤도보다 지연이 짧다.'],
    en: ['MEO comms', 'SES constellation at ~8,000 km — lower latency than GEO.'] }],
  [/^(GLOBALSTAR|GONETS|ORBCOMM|KINEIS|TIANQI|SWARM)/i, {
    ko: ['IoT·데이터 중계', '소형 단말의 짧은 데이터를 모은다. 선박·화물·기상관측장비·야생동물 추적 등에 쓰인다.'],
    en: ['IoT & data relay', 'Collects short messages from remote terminals — ships, cargo, sensors, wildlife.'] }],
  [/^LEMUR/i, {
    ko: ['선박 추적·기상', 'Spire 의 위성군. 선박 AIS 신호를 받아 항로를 추적하고, 동시에 GNSS 전파엄폐로 대기를 관측한다.'],
    en: ['Ship tracking & weather', 'Spire constellation — AIS ship tracking plus GNSS radio occultation.'] }],
  [/^(SITRO|EXACTVIEW|AISSAT)/i, {
    ko: ['선박 추적 (AIS)', '선박이 보내는 AIS 신호를 우주에서 받아 전 해역의 항적을 파악한다.'],
    en: ['Ship tracking (AIS)', 'Receives ship AIS beacons from orbit for global vessel traffic.'] }],

  // ── 과학 ──
  [/^(HST|HUBBLE)/i, null],   // CURATED 에 상세가 있다
  [/^(JWST|WEBB)/i, {
    ko: ['천문 관측 (적외선)', '적외선으로 초기 우주와 외계행성 대기를 관측한다.'],
    en: ['Astronomy (infrared)', 'Infrared observations of the early universe and exoplanet atmospheres.'] }],
  [/^(TESS|KEPLER|CHEOPS|PLATO)/i, {
    ko: ['외계행성 탐색', '별의 밝기가 미세하게 어두워지는 순간을 잡아 행성이 앞을 지나갔음을 알아낸다.'],
    en: ['Exoplanet hunting', 'Detects planets by tiny dips in starlight as they transit.'] }],
  [/^(SWIFT|FERMI|CHANDRA|XMM|NUSTAR|IXPE|EINSTEIN PROBE)/i, {
    ko: ['고에너지 천문', 'X선·감마선으로 블랙홀, 중성자별, 감마선 폭발을 관측한다.'],
    en: ['High-energy astronomy', 'X-ray and gamma-ray observations of black holes and bursts.'] }],
  [/^(GRACE|GOCE)/i, {
    ko: ['중력장 관측', '지구 중력의 미세한 변화를 재서 지하수량·빙하 질량 변화를 알아낸다.'],
    en: ['Gravity field', 'Measures gravity changes to track groundwater and ice mass.'] }],
  [/^(JASON|SENTINEL-6|SWOT)/i, {
    ko: ['해수면 관측', '레이더 고도계로 해수면 높이를 밀리미터 단위로 잰다. 해수면 상승과 엘니뇨 감시에 쓰인다.'],
    en: ['Sea level', 'Radar altimetry measuring sea surface height to millimetres.'] }],
  [/^(SMAP|SMOS)/i, {
    ko: ['토양 수분', '지표의 물 함량을 재서 가뭄과 홍수 예측에 쓴다.'],
    en: ['Soil moisture', 'Measures surface water content for drought and flood forecasting.'] }],
  [/^CYGNSS/i, {
    ko: ['열대 폭풍 관측', 'GPS 신호가 바다에서 반사되는 것을 받아 태풍 중심의 해상 풍속을 잰다.'],
    en: ['Tropical storm winds', 'Uses reflected GPS signals to measure ocean winds inside cyclones.'] }],
  [/^(CALIPSO|CLOUDSAT|EARTHCARE)/i, {
    ko: ['구름·에어로졸 연직 관측', '레이저와 레이더로 구름과 먼지의 높이별 분포를 잘라 본다.'],
    en: ['Cloud & aerosol profiling', 'Lidar/radar slicing clouds and dust by altitude.'] }],
  [/^(SDO|SOHO|PARKER|SOLAR ORBITER|GOES.*SUVI)/i, {
    ko: ['태양 관측', '태양 표면과 코로나를 감시해 지구로 오는 태양폭풍을 조기에 알린다.'],
    en: ['Solar observation', 'Watches the Sun to give early warning of space weather.'] }],

  // ── 유인·화물 ──
  [/^(SOYUZ|SHENZHOU|SZ-\d)/i, {
    ko: ['유인 우주선', '우주비행사를 정거장으로 실어 나르고 귀환시킨다. 비상 시 구명정 역할도 한다.'],
    en: ['Crewed spacecraft', 'Carries astronauts to and from the station; also serves as lifeboat.'] }],
  [/^(PROGRESS|CYGNUS|TIANZHOU|CARGO DRAGON|HTV)/i, {
    ko: ['화물선', '정거장에 식량·연료·실험장비를 나른다. 임무가 끝나면 대기권에서 태워 없앤다.'],
    en: ['Cargo craft', 'Delivers supplies and experiments to the station.'] }],
  [/^(CREW DRAGON|DRAGON|STARLINER)/i, {
    ko: ['유인 우주선', '민간이 만든 유인 왕복선. 승무원과 화물을 정거장으로 나른다.'],
    en: ['Crewed spacecraft', 'Commercial crew vehicle carrying astronauts and cargo.'] }],
  [/^ION |^ION$|^D-ORBIT/i, {
    ko: ['궤도 수송선', '다른 소형위성들을 싣고 올라가 각자의 궤도에 내려놓는다.'],
    en: ['Orbital transfer vehicle', 'Carries smallsats and deploys them into their own orbits.'] }],

  // ── 임무가 공개되지 않은 것 ──
  [/^(COSMOS|KOSMOS)/i, {
    ko: ['러시아 군·정부 위성 (임무 비공개)', 'COSMOS 는 러시아가 군용·시험용 위성에 붙이는 통칭이다. 구체적인 임무는 공개되지 않는 경우가 많다.'],
    en: ['Russian military/gov (undisclosed)', 'COSMOS is a generic designation; missions are usually not published.'] }],
  [/^USA \d|^NROL/i, {
    ko: ['미국 군·정찰 위성 (임무 비공개)', '미 국방부·국가정찰국 위성에 붙는 통칭이다. 임무와 성능은 공개되지 않는다.'],
    en: ['US military/recon (undisclosed)', 'US DoD/NRO designation; mission and capability are classified.'] }],
  [/^(TJS|SHIYAN|SHIJIAN)/i, {
    ko: ['중국 기술시험 위성 (임무 비공개)', '"기술시험" 명목으로 발사되며 구체적 임무가 공개되지 않는 경우가 많다.'],
    en: ['Chinese technology test (undisclosed)', 'Launched as technology demonstrators; specifics usually undisclosed.'] }],
  [/^YAOGAN/i, {
    ko: ['중국 원격탐사', '중국이 "원격탐사"로 분류하는 위성군. 자원조사·재해감시 용도로 발표되며, 일부는 군 정찰 목적으로 평가된다.'],
    en: ['Chinese remote sensing', 'Announced for resource survey and disaster monitoring; some assessed as reconnaissance.'] }],
  [/^(SDA|TRANCHE)/i, {
    ko: ['미 우주개발국 위성군', '미 국방부 우주개발국(SDA)이 구축하는 저궤도 통신·미사일 추적 위성군.'],
    en: ['US SDA constellation', 'LEO transport and missile-tracking layer built by the Space Development Agency.'] }],
  [/^(HAWK|CLUSTER \d)/i, {
    ko: ['무선 신호 탐지', '지상에서 나오는 무선 신호의 발신 위치를 삼각측량으로 찾아낸다. 불법 조업 선박 추적 등에 쓰인다.'],
    en: ['RF geolocation', 'Triangulates radio emitters — used to find dark vessels and interference.'] }],
  [/^TRANSPORTER|^BANDWAGON/i, {
    ko: ['라이드셰어 발사분', 'SpaceX 공유 발사로 함께 올라간 소형위성이다. 위성마다 임무가 제각각이라 이 이름만으로는 알 수 없다.'],
    en: ['Rideshare payload', 'Launched on a shared SpaceX mission — purposes vary by satellite.'] }],
];

/** 이름으로 목적 찾기. 못 찾으면 null. */
export function purposeOf(name) {
  if (!name) return null;
  const ko = i18n?.lang === 'ko';
  for (const [re, info] of PURPOSE) {
    if (!re.test(name)) continue;
    if (!info) return null;                 // CURATED 가 더 자세한 경우
    const [short, long] = ko ? info.ko : info.en;
    return { short, long };
  }
  return null;
}

/** 계열도 모를 때 — 그룹과 궤도로 최소한의 설명 */
function fallbackPurpose(groupId, cls, ko) {
  const byGroup = {
    weather:  ko ? '기상 관측' : 'Weather observation',
    nav:      ko ? '위성항법' : 'Navigation',
    comm:     ko ? '통신 중계' : 'Communications',
    science:  ko ? '과학 관측' : 'Science',
    earth:    ko ? '지구관측' : 'Earth observation',
    military: ko ? '군용 (임무 비공개)' : 'Military (undisclosed)',
    amateur:  ko ? '아마추어 무선 중계' : 'Amateur radio relay',
    stations: ko ? '유인 우주활동' : 'Human spaceflight',
  };
  const g = byGroup[groupId];
  if (g) return g;
  // 그룹도 모르면 궤도에서 유추 — 단정하지 말고 "주로" 라고 쓴다
  if (/정지궤도|Geostationary/.test(cls)) return ko ? '주로 통신·기상 (정지궤도)' : 'Typically comms/weather (GEO)';
  if (/태양동기|Sun-sync/.test(cls)) return ko ? '주로 지구관측 (태양동기궤도)' : 'Typically Earth observation (SSO)';
  return ko ? '용도 미상' : 'Purpose unknown';
}

/* ── TLE 에서 도출 ────────────────────────────────────────── */

/** 국제식별번호(COSPAR) "1998-067A" → 발사 연도 */
export function launchYear(objectId) {
  if (!objectId) return null;
  const m = String(objectId).match(/^(\d{4})-/);
  return m ? +m[1] : null;
}

/** 궤도 종류 판정 */
export function orbitClass(altKm, incDeg, periodMin) {
  if (altKm > 35000 && altKm < 36500 && incDeg < 5) return { ko:'정지궤도(GEO)', en:'Geostationary' };
  if (altKm > 30000) return { ko:'고궤도(HEO/GEO)', en:'High orbit' };
  if (altKm > 2000)  return { ko:'중궤도(MEO)', en:'Medium Earth orbit' };
  if (incDeg > 96 && incDeg < 102 && altKm < 1200) return { ko:'태양동기궤도(SSO)', en:'Sun-synchronous' };
  if (incDeg > 80)   return { ko:'극궤도(LEO)', en:'Polar low orbit' };
  return { ko:'저궤도(LEO)', en:'Low Earth orbit' };
}

/**
 * 위성 상세정보 조립 — 정보 시트에 그대로 넣을 수 있는 형태
 * @param sat   { name, rec, group, objectId, noradId }
 * @param live  { lat, lon, alt, vel }  SGP4 결과
 */
export function satDetail(sat, live, lang = 'ko') {
  const ko = lang === 'ko';
  const rec = sat.rec;
  const incDeg = rec.inclo * 180 / Math.PI;
  const periodMin = (2 * Math.PI) / rec.no;          // no = rad/min
  const alt = live?.alt ?? 0;
  const cls = orbitClass(alt, incDeg, periodMin);
  const year = launchYear(sat.objectId);
  const cur = CURATED[sat.name]?.[ko ? 'ko' : 'en'];

  const d = {};
  /* 목적 — 사용자가 가장 궁금해하는 항목이라 맨 위에 둔다.
     ① CURATED 에 있으면 그것 (가장 자세하다)
     ② 계열 규칙(PURPOSE)으로 알아낸 것 — 카탈로그의 86% 를 덮는다
     ③ 둘 다 없으면 그룹·궤도에서 유추한 최소한의 설명
     ⚠️ ③ 은 단정하지 않는다. "주로 …" 또는 "용도 미상"이라고 쓴다. */
  const fam = purposeOf(sat.name);
  if (cur) {
    d[ko ? '용도' : 'Purpose']   = cur.purpose;
    d[ko ? '운용' : 'Operator']  = cur.operator;
    d[ko ? '제작' : 'Built by']  = cur.built;
    d[ko ? '관제' : 'Control']   = cur.control;
    d[ko ? '생김새' : 'Appearance'] = cur.look;
    if (cur.crew) d[ko ? '탑승 인원' : 'Crew'] = cur.crew;
  } else if (fam) {
    d[ko ? '용도' : 'Purpose'] = fam.short;
    d[ko ? '하는 일' : 'What it does'] = fam.long;
    const gp = SAT_GROUPS.find(g => g.id === sat.group);
    if (gp) d[ko ? '분류' : 'Category'] = ko ? gp.ko : gp.en;
  } else {
    d[ko ? '용도' : 'Purpose'] = fallbackPurpose(sat.group, ko ? cls.ko : cls.en, ko);
    const gp = SAT_GROUPS.find(g => g.id === sat.group);
    if (gp) d[ko ? '분류' : 'Category'] = ko ? gp.ko : gp.en;
  }

  // SATCAT 조인분 (Lambda 가 CelesTrak SATCAT 을 붙여준 값)
  if (sat.ownerKo || sat.owner) d[ko ? '소유' : 'Owner'] = ko ? (sat.ownerKo || sat.owner) : sat.owner;
  if (sat.launchSite)  d[ko ? '발사장' : 'Launch site'] = siteName(sat.launchSite, ko);
  if (sat.opsKo || sat.opsEn) d[ko ? '운용 상태' : 'Status'] = ko ? sat.opsKo : sat.opsEn;
  if (sat.rcs) {
    const m = Number(sat.rcs);
    d[ko ? '크기(RCS)' : 'Size (RCS)'] = m >= 1
      ? `${m.toFixed(1)} m²` + (ko ? (m > 100 ? ' — 대형' : m > 10 ? ' — 중형' : ' — 소형') : '')
      : `${m.toFixed(2)} m²` + (ko ? ' — 초소형' : '');
  }

  d[ko ? '궤도' : 'Orbit']    = ko ? cls.ko : cls.en;
  d[ko ? '고도' : 'Altitude'] = `${Math.round(alt)} km`;
  d[ko ? '속도' : 'Speed']    = live?.vel ? `${(live.vel * 3600).toFixed(0)} km/h` : '—';
  d[ko ? '공전주기' : 'Period'] = `${periodMin.toFixed(1)} ${ko ? '분' : 'min'}`;
  d[ko ? '궤도경사각' : 'Inclination'] = `${incDeg.toFixed(1)}°`;
  const ld = sat.launchDate || (year ? String(year) : null);
  if (ld) d[ko ? '발사일' : 'Launched'] = ld;
  if (sat.noradId) d[ko ? '카탈로그 번호' : 'NORAD ID'] = sat.noradId;

  d['_curated'] = !!cur;
  d['_note'] = ko
    ? (cur ? null : fam
        ? '용도는 위성 계열에서 판별한 것입니다. 개별 위성의 세부 임무는 다를 수 있습니다.'
        : '이 위성의 구체적 임무는 공개 자료로 확인되지 않았습니다.')
    : (cur ? null : fam
        ? 'Purpose inferred from the satellite family; individual missions may differ.'
        : 'No public information found on this satellite\'s specific mission.');
  return { title: cur?.name || sat.name, rows: d };
}

/* ── ISS 아이콘 (SVG data URI) ────────────────────────────────
   외부 파일 없이 쓸 수 있도록 인라인. 실제 에셋이 나오면 교체. */
export const ISS_ICON = 'data:image/svg+xml;base64,' + btoa(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <g stroke="#dff6ff" stroke-width="2.6" stroke-linecap="round" fill="none">
    <line x1="10" y1="32" x2="54" y2="32"/>
    <line x1="24" y1="22" x2="24" y2="42"/>
    <line x1="40" y1="22" x2="40" y2="42"/>
  </g>
  <g fill="#4aa8d8" stroke="#bfe9ff" stroke-width="1.2">
    <rect x="12" y="16" width="11" height="12" rx="1.5"/>
    <rect x="12" y="36" width="11" height="12" rx="1.5"/>
    <rect x="41" y="16" width="11" height="12" rx="1.5"/>
    <rect x="41" y="36" width="11" height="12" rx="1.5"/>
  </g>
  <rect x="28" y="28" width="8" height="8" rx="2" fill="#f2f5f8"/>
  <circle cx="32" cy="32" r="15" fill="none" stroke="#3fc7c0" stroke-width="1" opacity="0.5"/>
</svg>`.trim());
