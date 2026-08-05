// 다국어 (§5-7)
// 규칙: 기기 언어 감지는 "최초 1회 기본값"으로만. 수동 변경 시 저장하고 이후 덮어쓰지 않음.

const KO = {
  loading: '지구 불러오는 중…',
  layers: '레이어',
  settings: '설정',
  language: '언어',
  tempUnit: '온도 단위',
  tier: '요금제',
  free: '무료',
  paid: '구독',
  freeUser: '무료 사용자',
  paidUser: '구독 사용자',
  tierHint: '프로토타입: 티어를 전환해 게이팅 동작을 확인할 수 있습니다',
  locked: '구독 전용',
  unlock: '구독하고 열기',
  soon: '준비 중',
  blockedProxy: '서버 프록시 필요 (AWS 연결 후)',
  blockedAuth: '연구자 계정 필요',
  blockedPaid: '유료 API — Phase 2',
  close: '닫기',
  now: '지금',
  // 레이어명
  L: {
    /* ⚠️ 레이어를 추가하면 여기에도 이름을 넣는다 — 없으면 화면에 **id 가 그대로**
       나온다('gk2aIR · 천리안2A 적외…'). 실제로 그렇게 나갔다. */
    gk2aIR:'천리안2A 구름', gk2aNightLow:'천리안2A 야간 하층운', gk2aVIS:'천리안2A 구름 (낮)', gk2aVISfd:'천리안2A 구름 (낮 · 전지구)', gk2aIRea:'천리안2A 구름 (동아시아 2km)', gk2aVISea:'천리안2A 구름 (낮 · 동아시아 2km)', gk2aWV:'천리안2A 수증기',
    clouds:'구름', himawari:'구름 (동아시아 고해상도)', himaIR:'구름 꼭대기 온도', regional:'각국 기관 재해', alerts:'기상경보', truecolor:'실제 위성 영상', citylight:'야간 불빛', temp:'기온', aurora:'오로라',
    wind:'바람', orbits:'위성 궤도', stations:'관측소', volcano:'화산', launch:'로켓 발사',
    poi:'명소', phenomena:'해양 환류', heatdome:'열돔', quake:'지진', buoy:'해양 부이', news:'이벤트 뉴스',
    wildlife:'야생동물', plastic:'해양 쓰레기', flight:'항공기', ship:'선박',
    tsunami:'쓰나미 경보', wildfire:'산불', eclipse:'일식', launchpad:'발사대', cyclone:'태풍', sky:'하늘',
    // 대기질
    pm25:'초미세먼지', pm10:'미세먼지', dust:'먼지', ozone:'오존', uv:'자외선 지수', aqi:'대기질 지수',
    // 해양 (⚠️ current 는 해류다. 조류/물때가 아니다)
    sst:'해수면 온도', sstanom:'수온 편차(평년 대비)', wave:'파고', swell:'너울', current:'해류',
    // 안개·토양 (⚠️ drought 는 "지금 메마름"이지 가뭄 판정이 아니다)
    fog:'안개', drought:'토양 수분', pressure:'기압 배치', rain:'비구름', landobs:'지상 관측소', coverage:'관측망 밀도',
    /* ⚠️ 이름에 '예보'를 반드시 남긴다 — 바로 옆 landobs 가 실황이라
       구분이 없으면 사용자가 둘을 같은 것으로 읽는다. */
    ukfc:'영국 예보',
  },
  G: { base:'기본', weather:'기상', hazard:'재난', space:'우주', air:'대기질',
       ocean:'해양', events:'이벤트', nature:'자연', travel:'여행', transit:'교통', learn:'학습' },
  // 필드
  F: {
    temp:'기온', humidity:'습도', wind:'풍속', pressure:'기압', precip:'강수',
    mag:'규모', depth:'깊이', time:'발생', place:'위치',
    provider:'운용', pad:'발사대', net:'발사 예정', status:'상태', watch:'중계',
    type:'분류', lastEruption:'최근 분화', alert:'경보',
    kp:'Kp 지수', activity:'활동도', altitude:'고도', velocity:'속도', period:'주기',
    forecast:'예보', feelsLike:'체감',
  },
  ago:{ m:'분 전', h:'시간 전', d:'일 전', inM:'분 후', inH:'시간 후', inD:'일 후' },
  quakeGlobal: (m)=>`규모 ${m} 이상만 전지구에 표시됩니다`,
  zoomHint: '확대하면 핀이 나타납니다',
};

const EN = {
  loading: 'Loading Earth…',
  layers: 'Layers',
  settings: 'Settings',
  language: 'Language',
  tempUnit: 'Temperature',
  tier: 'Plan',
  free: 'Free',
  paid: 'Subscribed',
  freeUser: 'Free user',
  paidUser: 'Subscriber',
  tierHint: 'Prototype: switch tiers to preview gating behavior',
  locked: 'Subscribers only',
  unlock: 'Subscribe to unlock',
  soon: 'Coming soon',
  blockedProxy: 'Needs server proxy (after AWS)',
  blockedAuth: 'Needs researcher account',
  blockedPaid: 'Paid API — Phase 2',
  close: 'Close',
  now: 'now',
  L: {
    gk2aIR:'Chollian-2A cloud', gk2aNightLow:'Chollian-2A night low cloud', gk2aVIS:'Chollian-2A cloud (day)', gk2aVISfd:'Chollian-2A cloud (day, full disk)', gk2aIRea:'Chollian-2A cloud (E. Asia 2km)', gk2aVISea:'Chollian-2A cloud (day, E. Asia 2km)', gk2aWV:'Chollian-2A water vapour',
    clouds:'Clouds', himawari:'Clouds (E. Asia, high-res)', himaIR:'Cloud-top temperature', regional:'National agency hazards', alerts:'Weather alerts', truecolor:'Satellite view', citylight:'City lights', temp:'Temperature', aurora:'Aurora',
    wind:'Wind', orbits:'Satellite orbits', stations:'Stations', volcano:'Volcanoes', launch:'Launches',
    poi:'Places', phenomena:'Ocean gyres', heatdome:'Heat dome', quake:'Earthquakes', buoy:'Ocean buoys', news:'Event news',
    wildlife:'Wildlife', plastic:'Ocean plastic', flight:'Aircraft', ship:'Ships',
    tsunami:'Tsunami alert', wildfire:'Wildfire', eclipse:'Solar eclipse', launchpad:'Launch pad', cyclone:'Tropical cyclone', sky:'Sky',
    pm25:'PM2.5', pm10:'PM10', dust:'Desert dust', ozone:'Ozone', uv:'UV index', aqi:'Air quality index',
    sst:'Sea surface temperature', sstanom:'SST anomaly vs normal', wave:'Wave height', swell:'Swell', current:'Ocean current',
    fog:'Fog (visibility)', drought:'Soil moisture', pressure:'Pressure pattern', rain:'Rain', landobs:'Ground stations', coverage:'Observation coverage',
    ukfc:'UK forecast',
  },
  G: { base:'Base', weather:'Weather', hazard:'Hazards', space:'Space', air:'Air quality',
       ocean:'Ocean', events:'Events', nature:'Nature', travel:'Travel', transit:'Transit', learn:'Learn' },
  F: {
    temp:'Temp', humidity:'Humidity', wind:'Wind', pressure:'Pressure', precip:'Precip',
    mag:'Magnitude', depth:'Depth', time:'Time', place:'Location',
    provider:'Provider', pad:'Pad', net:'Launch', status:'Status', watch:'Watch',
    type:'Type', lastEruption:'Last eruption', alert:'Alert',
    kp:'Kp index', activity:'Activity', altitude:'Altitude', velocity:'Velocity', period:'Period',
    forecast:'Forecast', feelsLike:'Feels like',
  },
  ago:{ m:'m ago', h:'h ago', d:'d ago', inM:'in m', inH:'in h', inD:'in d' },
  quakeGlobal: (m)=>`Only M${m}+ shown at globe view`,
  zoomHint: 'Zoom in to reveal pins',
};

const PACKS = { ko: KO, en: EN };

const LS_LANG = 'earthus.lang';
const LS_UNIT = 'earthus.unit';

function detect() {
  const n = (navigator.language || 'en').toLowerCase();
  return n.startsWith('ko') ? 'ko' : 'en';
}

export const i18n = {
  lang: localStorage.getItem(LS_LANG) || detect(),   // 저장값 우선 — 기기 언어로 덮어쓰지 않음
  unit: localStorage.getItem(LS_UNIT) || 'c',        // 온도 단위는 언어와 분리 (§5-7)
  listeners: [],

  get t() { return PACKS[this.lang]; },

  setLang(l) {
    this.lang = l;
    localStorage.setItem(LS_LANG, l);   // 수동 변경 → 영구 저장
    this.emit();
  },
  setUnit(u) {
    this.unit = u;
    localStorage.setItem(LS_UNIT, u);
    this.emit();
  },
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.applyStatic(); this.listeners.forEach(f => f()); },

  /* ── HTML 에 박힌 정적 문구 ────────────────────────────────────
     받은 검수(AX 1차): "레이어 내용과 설정 제목은 영어로 바뀌지만, 메인 메뉴와
     설정 하단의 로그인·약관·업데이트는 한국어로 남는다. 언어를 선택한 사용자에게
     가장 눈에 띄는 불일치다." — 맞다.
     원인은 이 글들이 index.html 에 **한국어로 박혀** 있고 아무도 손대지 않은 것이었다.
     → data-i18n="키" 를 붙이고 여기서 한 번에 갈아 끼운다.
     ⚠️ 키가 사전에 없으면 **건드리지 않는다.** 빈 글자로 지우면 메뉴가 통째로 사라진다. */
  STATIC: {
    /* ⚠️ 한때 '레이어'로 바꿨다가 되돌렸다 (받은 지시). 감사에서는 '스타일'이
       테마 고르는 곳으로 읽힌다고 했지만, PD 판단은 '지구 스타일'이다. */
    'm.layers':   { ko: '지구 스타일',      en: 'Earth style' },
    'm.sat':      { ko: '인공위성',          en: 'Satellites' },
    'm.alert':    { ko: '경보·재난',         en: 'Alerts' },
    'm.news':     { ko: '뉴스',              en: 'News' },
    'm.lab':      { ko: 'LAB',               en: 'LAB' },
    'm.ask':      { ko: '물어보기',          en: 'Ask' },
    'm.flight':   { ko: '항공편',            en: 'Flights' },
    'm.outdoor':  { ko: '취미',              en: 'Outdoors' },
    'm.locate':   { ko: '내 위치',           en: 'My location' },
    'm.globe':    { ko: '전지구로',          en: 'Whole Earth' },
    'm.settings': { ko: '설정',              en: 'Settings' },
    's.account':  { ko: '계정',              en: 'Account' },
    's.login':    { ko: '로그인 / 가입',     en: 'Sign in / up' },
    's.subscribe':{ ko: '구독',              en: 'Subscription' },
    's.waitlist': { ko: '사전등록 · 창립 멤버', en: 'Waitlist · founding member' },
    's.terms':    { ko: '이용약관',          en: 'Terms of service' },
    's.privacy':  { ko: '개인정보처리방침',  en: 'Privacy policy' },
    's.consent':  { ko: '약관 · 동의 관리',  en: 'Consent settings' },
    's.changelog':{ ko: '업데이트',          en: 'Updates' },
    's.intro':    { ko: 'earthus 소개',      en: 'About earthus' },
    's.export':   { ko: '내 데이터 내려받기', en: 'Download my data' },
    's.logout':   { ko: '로그아웃',          en: 'Sign out' },
  },

  applyStatic(root = document) {
    const L = this.lang === 'en' ? 'en' : 'ko';
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const v = this.STATIC[el.dataset.i18n];
      if (v && v[L]) el.textContent = v[L];
    });
    // 문서 언어도 함께 바꾼다 — 스크린리더가 읽는 발음이 달라진다
    document.documentElement.lang = L;
  },

  // 온도 변환 + 포맷
  temp(celsius, digits = 0) {
    if (celsius == null || Number.isNaN(celsius)) return '—';
    return this.unit === 'f'
      ? `${(celsius * 9 / 5 + 32).toFixed(digits)}°F`
      : `${celsius.toFixed(digits)}°C`;
  },

  // 상대 시각
  rel(iso) {
    const t = this.t.ago;
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    const fut = diff < 0;
    const s = Math.abs(diff);
    if (s < 60) return this.t.now;
    if (s < 3600) return `${Math.round(s / 60)}${fut ? t.inM : t.m}`;
    if (s < 86400) return `${Math.round(s / 3600)}${fut ? t.inH : t.h}`;
    return `${Math.round(s / 86400)}${fut ? t.inD : t.d}`;
  },
};
