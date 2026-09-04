// EARTHUS v2 — 다국어
//
// 규칙은 1.0(js/i18n.js)과 같다: **기기 언어는 최초 1회 기본값으로만** 쓴다.
// 사용자가 손으로 바꾸면 저장하고, 그 뒤로는 기기 언어가 덮어쓰지 않는다.
// (기기 언어로 매번 덮어쓰면, 영어 기기에서 한국어를 고른 사람이 새로고침마다 영어로 튄다.)
//
// 지금 범위: 화면 뼈대 — 상단·메뉴·레이어 이름·조작·시간 스트립·HUD.
// 아직 아닌 것: **근거 카드 본문**. 카드에는 진리등급과 한계를 설명하는 긴 문장이 많고,
//   그걸 어설프게 옮기면 정직성 문구가 뭉개진다. 그건 문장 단위로 옮겨야 해서 남겨 둔다.
//   영어 화면에서는 그 사실을 설정에 적어 둔다 — 없는 것을 있는 척하지 않는다.

/* 세 지구가 언어를 **한 열쇠**로 나눈다.
   전에는 v2 만 'earthus.v2.lang' 을 따로 썼다. 그래서 1.0 에서 영어를 고른 사람이
   전환기로 v2 에 넘어오면 다시 한국어가 됐다(실측: earthus.lang=en 인데 화면은 ko).
   이제 'earthus.lang' 이 정본이고, 예전 열쇠는 **읽기만** 한다 — 이미 고른 사람의 선택을 버리지 않으려고. */
const LS_KEY = 'earthus.lang';
const LS_OLD = 'earthus.v2.lang';

function detect() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'ko' || saved === 'en') return saved;
    const old = localStorage.getItem(LS_OLD);
    if (old === 'ko' || old === 'en') {
      localStorage.setItem(LS_KEY, old);   // 한 번만 옮겨 적는다
      return old;
    }
  } catch (e) { /* 사생활 모드 등 — 기기 언어로 간다 */ }
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return /^ko/i.test(nav) ? 'ko' : 'en';
}

export const i18n = {
  lang: detect(),
  set(l) {
    this.lang = (l === 'en') ? 'en' : 'ko';
    try {
      localStorage.setItem(LS_KEY, this.lang);
      localStorage.setItem(LS_OLD, this.lang);   // 아직 예전 열쇠를 보는 코드가 있다
    } catch (e) { /* 저장 못 해도 이번 세션은 유지 */ }
  },
  get ko() { return this.lang === 'ko'; },
  // t('key') · 없는 키는 키 자체를 돌려준다(빈 화면보다 낫다 — 무엇이 빠졌는지 보인다)
  t(k) {
    const d = this.lang === 'en' ? EN : KO;
    return (k in d) ? d[k] : ((k in KO) ? KO[k] : k);
  },
  // 레이어 이름. 영어 이름이 없으면 한국어를 그대로 쓴다(id 를 노출하지 않는다).
  layer(id, koName) {
    if (this.lang !== 'en') return koName;
    return L_EN[id] || koName;
  },
  scene(id, koLabel) {
    if (this.lang !== 'en') return koLabel;
    return S_EN[id] || koLabel;
  },
  region(id, koName) {
    if (this.lang !== 'en') return koName;
    return R_EN[id] || koName;
  },
};

const KO = {
  search: '검색 (나라·시군구·도시·공항)',
  ask: '지구에 묻기 — 지금 켜 놓은 자료만 근거로 답합니다',
  share: '이 화면 공유 (링크 복사 · 그림 저장)',
  help: '사용법 다시 보기',
  settings: '설정',
  login: '로그인 / 계정 — EARTHUS 계정 화면으로 갑니다',
  play5d: '5일 예보 재생', close: '닫기',
  loadTerrain: '지형 데이터 로딩', loadPrep: '지형 데이터 로딩 준비…',
  mapAttrib: '위성영상 © Esri · Maxar · Earthstar Geographics',
  searchPh: '검색 — 나라·시군구·도시·공항',
  shareLink: '🔗 이 화면 링크 복사',
  shareImage: '🖼 지구 그림 저장 (JPG)',
  shareNote: '링크에는 카메라 위치·켜 놓은 레이어·선택한 나라가 담깁니다',
  now: '지금',
  language: '언어',
  langNote: '근거 카드 본문은 아직 한국어입니다 — 문장 단위로 옮기는 중입니다.',
  loading: '지구 불러오는 중…',
  terrainAdv: '지형 (고급)',
  exagger: '고도 과장',
  shade: '음영',
  isobath: '해저 등심선',
  photo: '위성 사진 혼합',
  sunManual: '태양 수동',
  sunAz: '태양 방위',
  sunEl: '태양 고도',
  rotate: '자동 회전',
  cloudAdv: '구름 (고급 — 기본 조작은 좌측 날씨 메뉴)',
  cloudNone: '없음',
  cloudObs: '관측',
  copy: '복사',
  layers: '레이어',
  on: '켜짐',
  sunCalc: '태양 위치 계산 중…',
  cloudGk2a: '천리안', cloudModel: '모델', cloudStatic: '정적',
  cloudOffNote: '구름 끔',
  snowChk: '눈·얼음 (관측)',
  simOpen: '시뮬레이션 설정 열기 ▾',
  simHead: '시뮬레이션 · 표현 튜닝',
  exaggerL: '지형 과장', isobathGap: '등심선 간격', shadeStr: '음영 강도',
  photoMix: '위성 색 혼합', manualLight: '수동 조명 (화면 기준)',
  sunAzL: '태양 방위각', sunElL: '태양 고도각',
  crTerrain: '지형', crBase: '기본색', crCompare: '비교', crCesium: 'Cesium v2 지구 열기',
  hudCopy: '📋 복사',
  mapExit: '◀ 3D 지구로', map3d: '⛰ 3D 지형',
  hudAlt: '고도 —', hudMore: '진단 정보 (상태를 텍스트로 복사)',
  locked: '준비 중',
  sources: '출처',
  clearSel: '해제',
  // 메뉴 패널 — 손잡이를 열면 나오는 머리말·칩 설명·꼬리말. 레이어 이름만 옮기고
  // 이 문장들을 빼 놓아서, 영어 화면 메뉴에 한국어가 그대로 남아 있었다.
  mpTagE: '실데이터로 살아있는 지구',
  mpTagA: '우주 · 궤도 · 태양계',
  mpFoot: '잠긴 레이어 = 데이터 미연결 (출처·계획 명시) — 가짜 값 없음',
  regionMove: '권역 이동',
  regionNote: '권역 이동 — 3D 지구를 유지한 채 그 구도로 날아갑니다',
  popChips: '인구 조각 국가',
  popNote: '인구 조각 — 격자가 준비된 {n}개국. 지구에서 국가를 눌러도 됩니다',
  popTitle: '{n}명 · {y}',
  // 사건 피드 — 목록 층위의 문구. 근거 카드 본문은 아직 아니다(langNote 참조).
  feedLoading: '지구 사건 조회 중… (GDACS · USGS)',
  feedError: '사건 데이터를 불러오지 못했습니다. 네트워크 확인 후 다시 시도하세요.',
  feedNoneEQ: '지진', feedNoneTC: '태풍', feedNoneEV: '사건',
  feedNone: '지금 조건에 맞는 {what} 사건이 없습니다 — 없는 것을 만들어 채우지 않습니다.',
  tcPending: '태풍 피드(GDACS) 받는 중 — 1.7MB 라 20초쯤 걸립니다',
  tcFailed: '태풍 피드(GDACS) 응답 없음',
  retry: '재시도',
  tcTitle: '열대저기압',
  atSea: '해상',
  fAlert: '경보 등급', fFrom: '시작', fUpdated: '최근 갱신',
  fMag: '규모', fDepth: '진원 깊이', fWhen: '발생',
  fUnderground: '지하',
};

const EN = {
  search: 'Search (country · district · city · airport)',
  ask: 'Ask the Earth — answers are grounded only in the layers you have on',
  share: 'Share this view (copy link · save image)',
  help: 'Show the walkthrough again',
  settings: 'Settings',
  login: 'Sign in / account — opens the EARTHUS account screen',
  play5d: 'Play the 5-day forecast', close: 'Close',
  loadTerrain: 'Loading terrain', loadPrep: 'Preparing terrain…',
  mapAttrib: 'Satellite imagery © Esri · Maxar · Earthstar Geographics',
  searchPh: 'Search — country, district, city, airport',
  shareLink: '🔗 Copy link to this view',
  shareImage: '🖼 Save the Earth as an image (JPG)',
  shareNote: 'The link carries the camera position, the layers you have on, and the country you selected',
  now: 'NOW',
  language: 'Language',
  langNote: 'Evidence cards are still in Korean — they are being translated sentence by sentence.',
  loading: 'Loading the Earth…',
  terrainAdv: 'Terrain (advanced)',
  exagger: 'Elevation exaggeration',
  shade: 'Shading',
  isobath: 'Seafloor contours',
  photo: 'Satellite imagery blend',
  sunManual: 'Manual sun',
  sunAz: 'Sun azimuth',
  sunEl: 'Sun elevation',
  rotate: 'Auto-rotate',
  cloudAdv: 'Cloud (advanced — the weather menu on the left is the normal way)',
  cloudNone: 'None',
  cloudObs: 'Observed',
  copy: 'Copy',
  layers: 'Layers',
  on: 'on',
  sunCalc: 'Computing sun position…',
  cloudGk2a: 'GK-2A', cloudModel: 'Model', cloudStatic: 'Static',
  cloudOffNote: 'Clouds off',
  snowChk: 'Snow & ice (observed)',
  simOpen: 'Open simulation settings ▾',
  simHead: 'Simulation · rendering tuning',
  exaggerL: 'Terrain exaggeration', isobathGap: 'Contour interval', shadeStr: 'Shading strength',
  photoMix: 'Satellite colour blend', manualLight: 'Manual lighting (screen-relative)',
  sunAzL: 'Sun azimuth', sunElL: 'Sun elevation',
  crTerrain: 'Terrain', crBase: 'Base colour', crCompare: 'Compare', crCesium: 'Open the Cesium v2 globe',
  hudCopy: '📋 Copy',
  mapExit: '◀ Back to 3D Earth', map3d: '⛰ 3D terrain',
  hudAlt: 'alt —', hudMore: 'Diagnostics (copy state as text)',
  locked: 'not connected yet',
  sources: 'Source',
  clearSel: 'Clear',
  mpTagE: 'A living Earth, from real data',
  mpTagA: 'Space · orbits · the solar system',
  mpFoot: 'A locked layer = no data connected yet (source and plan stated) — no invented values',
  regionMove: 'Jump to a region',
  regionNote: 'Region jump — the camera flies to that framing, still on the 3D Earth',
  popChips: 'Population sculpture — countries',
  popNote: 'Population sculpture — {n} countries have a grid ready. You can also click a country on the Earth',
  popTitle: '{n} people · {y}',
  feedLoading: 'Looking up Earth events… (GDACS · USGS)',
  feedError: 'Could not load event data. Check the network and try again.',
  feedNoneEQ: 'earthquake', feedNoneTC: 'tropical cyclone', feedNoneEV: 'Earth event',
  feedNone: 'No {what} matches the current filter — we do not invent events to fill the list.',
  tcPending: 'Fetching the typhoon feed (GDACS) — it is 1.7 MB, so this takes about 20 s',
  tcFailed: 'No response from the typhoon feed (GDACS)',
  retry: 'Retry',
  tcTitle: 'Tropical cyclone',
  atSea: 'At sea',
  fAlert: 'Alert level', fFrom: 'Started', fUpdated: 'Last update',
  fMag: 'Magnitude', fDepth: 'Focal depth', fWhen: 'Occurred',
  fUnderground: 'below surface',
};

// 씬 — 글리프도 함께 바꾼다(한글 초성은 영어 화면에서 읽히지 않는다)
const S_EN = {
  land: 'Land', weather: 'Weather', ocean: 'Ocean', people: 'People',
  travel: 'Travel', hazards: 'Hazards', space: 'Space',
};
export const SCENE_GLYPH_EN = {
  land: 'L', weather: 'W', ocean: 'O', people: 'P', travel: 'T', hazards: 'H', space: 'S',
};

const R_EN = {
  globe: 'Whole Earth', eastasia: 'Northeast Asia', korea: 'Korean Peninsula',
  seasia: 'Southeast Asia', southasia: 'South Asia', oceania: 'Oceania',
  europe: 'Europe', mideast: 'Middle East', africa: 'Africa',
  namerica: 'North America', samerica: 'South America', arctic: 'Arctic',
  antarctic: 'Antarctic', pacific: 'Pacific', atlantic: 'Atlantic', indian: 'Indian Ocean',
};

// 레이어 89개. 숫자는 그대로 둔다 — 그 수 자체가 자료의 규모다.
const L_EN = {
  terrain: 'Real terrain 3D',
  satdetail: 'Satellite surface (on zoom)',
  snow: 'Snow & ice cover',
  seaice: 'Sea ice concentration (polar)',
  lst: 'Land surface temperature (satellite)',
  forest: 'Forest cover relief (share covered by trees)',
  forestloss: 'Forest loss 2001–2023 (Korea)',
  locate: 'Go to my location',
  globe: 'Whole Earth view',
  'base-ne2': 'Base · Natural Earth',
  'base-bluemarble': 'Base · Blue Marble (relief · bathymetry)',
  'base-truecolor': "Base · Today's Earth (true colour)",
  'base-night': 'Base · City lights at night',
  'cloud-off': 'Clouds off',
  radar: 'Radar precipitation (falling now)',
  raingrid: 'Global precipitation',
  tempgrid: 'Global temperature',
  presgrid: 'Global pressure',
  windgrid: 'Global wind speed',
  pm25grid: 'Global PM2.5',
  uvgrid: 'Global UV index',
  warnworld: 'US weather alerts',
  'cloud-obs': 'Clouds now (global)',
  'cloud-gk2a': 'Clouds · GK-2A (10 min)',
  'cloud-ea': 'Clouds · GK-2A East Asia 2 km',
  'cloud-fog': 'Night low cloud & fog (night only)',
  'cloud-wv': 'Upper-level water vapour — the jet stream',
  mysky: 'My sky — is there cloud over me?',
  'cloud-gfs': 'Rain · snow · typhoon 5-day forecast ▶',
  'cloud-vol': 'Cloud 3D volume (East Asia)',
  tempanom: 'How far from normal, right now (Korea)',
  wind: 'Wind observations (3,000 surface sites)',
  synop: 'Station model (standard chart symbols)',
  airq: 'Air quality (AirKorea)',
  warn: 'Weather warnings (live)',
  marine: 'Marine conditions lookup',
  oceanfocus: 'Ocean focus',
  typhoonsim: 'Typhoon sea-state simulation',
  buoys: 'Ocean buoys (sea temperature)',
  argo: 'Argo floats — the dive record',
  kmasea: 'Marine observation network (waves · temp, 193 sites)',
  sstfield: 'Sea surface temperature (global)',
  sstanom: 'Sea temperature anomaly (vs normal)',
  slr: 'Sea level rise outlook 2100 (worldwide)',
  khoasl126: 'Korean seas sea-level outlook · SSP1-2.6 low',
  khoasl245: 'Korean seas sea-level outlook · SSP2-4.5 middle',
  khoasl370: 'Korean seas sea-level outlook · SSP3-7.0 high',
  khoasl585: 'Korean seas sea-level outlook · SSP5-8.5 highest',
  khoaflood: 'Coastal flood extent — by district',
  wavefield: 'Significant wave height (global)',
  current: 'Surface currents',
  surf: '271 beaches · 946 fishing spots',
  isobath: 'Seafloor contours',
  trenches: '28 ocean trenches',
  vessel: 'Vessels',
  seoul: 'Seoul live population, 121 areas',
  poptower: 'City population towers — Seoul · Tokyo · Taipei · London (residential)',
  sculpt: 'Population data sculpture — pick a country',
  livemix: 'People now × residents (Seoul)',
  pop: 'Country population (world totals)',
  news: 'Local news (now)',
  travel: 'Travel & tourism POI',
  flight: 'Flight tracking',
  discover: 'Discover today — 228 districts',
  bf: '11,644 barrier-free destinations',
  wl: '202 wellness destinations',
  en: '25,398 English-language listings',
  visitors: 'Visitor snapshot (mobile signals · not tourist counts)',
  related: 'One more — related-destination graph',
  feed: 'Earth event feed',
  eq: 'Earthquakes live (M4.5+)',
  eqhistory: '25 years of earthquakes — the plate edges appear',
  eqdepth: 'Earthquake depth — subduction inside the Earth',
  plates: 'Plate boundaries overlay',
  crustal: 'Crustal motion speed (GNSS measured)',
  tc: 'Tropical cyclone events (GDACS)',
  tyoff: 'Official typhoon tracks',
  tyens: 'Typhoon ensemble — how far forecasts diverge',
  tyanalog: 'Past analogue tracks (not a forecast)',
  tsunami: 'Tsunami information',
  fireglobal: 'Global fire detections (24 h)',
  wildfire: 'Wildfire risk index (Korea)',
  lightning: 'Lightning (last 60 min)',
  glof: 'Glacial lake outburst flood (GLOF)',
  sats: 'Satellite tracking (station · weather · science · navigation)',
  starlink: 'Starlink',
  'aeth-orbit': 'Orbital intelligence (canonical catalogue · conjunctions)',
  aurora: 'Aurora forecast (where it is visible now)',
  launch: 'Launch schedule (worldwide)',
  solaract: 'The Sun today (live observation)',
  solar: 'The solar system today',
  photos: '59 space photographs (placed on the sky)',
  galaxy: 'The Milky Way — where we are',
};
