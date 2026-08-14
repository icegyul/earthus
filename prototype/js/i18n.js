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
  blockedProvider: '자료 제공사 연결 준비 중',
  blockedPaid: '유료 API — Phase 2',
  close: '닫기',
  now: '지금',
  // 레이어명
  L: {
    /* ⚠️ 레이어를 추가하면 여기에도 이름을 넣는다 — 없으면 화면에 **id 가 그대로**
       나온다('gk2aIR · 천리안2A 적외…'). 실제로 그렇게 나갔다. */
    gk2aAuto:'천리안2A 자동 구름', gk2aIR:'천리안2A 구름 (전면 8km · 동아시아 2km)', gk2aNightLow:'천리안2A 야간 하층운', gk2aVIS:'천리안2A 구름 (낮)', gk2aVISfd:'천리안2A 구름 (낮 · 전지구)', gk2aIRea:'천리안2A 구름 (동아시아 2km)', gk2aVISea:'천리안2A 구름 (낮 · 동아시아 2km)', gk2aWV:'천리안2A 수증기',
    clouds:'구름', himawari:'히마와리9 자동 구름', himaIR:'구름 꼭대기 온도', regional:'각국 기관 재해', alerts:'기상경보', truecolor:'실제 위성 영상', citylight:'야간 불빛', temp:'기온', aurora:'오로라',
    wind:'바람', orbits:'위성 궤도', stations:'관측소', volcano:'화산', launch:'로켓 발사',
    poi:'명소', phenomena:'해양 환류', heatdome:'열돔', quake:'지진', buoy:'해양 부이', lightning:'낙뢰', news:'이벤트 뉴스',
    wildlife:'야생동물', plastic:'해양 쓰레기', flight:'항공기', ship:'선박',
    tsunami:'쓰나미 경보', wildfire:'산불', eclipse:'일식', launchpad:'발사대', cyclone:'태풍', sky:'하늘',
    // 대기질
    pm25:'초미세먼지', pm10:'미세먼지', dust:'먼지', ozone:'오존', uv:'자외선 지수', aqi:'대기질 지수',
    // 해양 (⚠️ current 는 해류다. 조류/물때가 아니다)
    sst:'해수면 온도', sstanom:'수온 편차(평년 대비)', wave:'파고', swell:'너울', current:'해류',
    // 안개·토양 (⚠️ drought 는 "지금 메마름"이지 가뭄 판정이 아니다)
    tpw:'수증기 통로', fog:'안개', drought:'토양 수분', pressure:'기압 배치', rain:'비구름', landobs:'지상 관측소', coverage:'관측망 밀도',
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
  blockedProvider: 'Data provider connection in preparation',
  blockedPaid: 'Paid API — Phase 2',
  close: 'Close',
  now: 'now',
  L: {
    gk2aAuto:'Chollian-2A auto cloud', gk2aIR:'Chollian-2A cloud (full disk 8 km · E. Asia 2 km)', gk2aNightLow:'Chollian-2A night low cloud', gk2aVIS:'Chollian-2A cloud (day)', gk2aVISfd:'Chollian-2A cloud (day, full disk)', gk2aIRea:'Chollian-2A cloud (E. Asia 2km)', gk2aVISea:'Chollian-2A cloud (day, E. Asia 2km)', gk2aWV:'Chollian-2A water vapour',
    clouds:'Clouds', himawari:'Himawari-9 auto cloud', himaIR:'Cloud-top temperature', regional:'National agency hazards', alerts:'Weather alerts', truecolor:'Satellite view', citylight:'City lights', temp:'Temperature', aurora:'Aurora',
    wind:'Wind', orbits:'Satellite orbits', stations:'Stations', volcano:'Volcanoes', launch:'Launches',
    poi:'Places', phenomena:'Ocean gyres', heatdome:'Heat dome', quake:'Earthquakes', buoy:'Ocean buoys', lightning:'Lightning', news:'Event news',
    wildlife:'Wildlife', plastic:'Ocean plastic', flight:'Aircraft', ship:'Ships',
    tsunami:'Tsunami alert', wildfire:'Wildfire', eclipse:'Solar eclipse', launchpad:'Launch pad', cyclone:'Tropical cyclone', sky:'Sky',
    pm25:'PM2.5', pm10:'PM10', dust:'Desert dust', ozone:'Ozone', uv:'UV index', aqi:'Air quality index',
    sst:'Sea surface temperature', sstanom:'SST anomaly vs normal', wave:'Wave height', swell:'Swell', current:'Ocean current',
    tpw:'Moisture corridor', fog:'Fog (visibility)', drought:'Soil moisture', pressure:'Pressure pattern', rain:'Rain', landobs:'Ground stations', coverage:'Observation coverage',
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
    'm.explore':  { ko: '탐색·활동',         en: 'Explore & activities' },
    'm.news':     { ko: '뉴스',              en: 'News' },
    'm.lab':      { ko: 'LAB',               en: 'LAB' },
    'm.ask':      { ko: '물어보기',          en: 'Ask' },
    'm.flight':   { ko: '항공편',            en: 'Flights' },
    'm.outdoor':  { ko: '취미',              en: 'Outdoors' },
    'm.earth':    { ko: '지구',              en: 'Earth' },
    'm.surface':  { ko: '수면',              en: 'Surface' },
    'm.trench':   { ko: '해구',              en: 'Trenches' },
    'm.solar':    { ko: '태양계',            en: 'Solar System' },
    'm.milkyway': { ko: '은하수',            en: 'Milky Way' },
    'm.galaxies': { ko: '은하들',            en: 'Galaxies' },
    'm.hubble':   { ko: '허블',              en: 'Hubble' },
    'm.webb':     { ko: '제임스웹',          en: 'James Webb' },
    'm.soon':     { ko: '준비 중',           en: 'Soon' },
    'm.locate':   { ko: '내 위치',           en: 'My location' },
    'explore.space.kicker': { ko: '우주 / 크기 전환 데모', en: 'SPACE / SCALE DEMO' },
    'explore.space.title':  { ko: '지구 밖의 크기를 한 단계씩 봅니다.', en: 'See the scale beyond Earth, one step at a time.' },
    'explore.space.status': { ko: '검증된 허블·JWST 사진과 JPL 궤도요소로 계산한 8행성의 위치를 보세요.', en: 'Browse validated Hubble and JWST images and the calculated positions of all eight planets from JPL orbital elements.' },
    'explore.solar.kicker': { ko: '태양계 / JPL 근사 계산', en: 'SOLAR SYSTEM / JPL APPROXIMATION' },
    'galaxy.milkyway.kicker': { ko: '우리 은하 / 가이아 자료 기반', en: 'OUR GALAXY / BASED ON GAIA DATA' },
    'galaxy.milkyway.title': { ko: '우리가 사는 은하수', en: 'The Milky Way, our home galaxy' },
    'galaxy.milkyway.body': { ko: '가이아 우주망원경 자료를 바탕으로 그린 은하수 상상도입니다. 화살표는 태양계의 추정 위치를 가리킵니다. 은하수 원반은 10만 광년보다 넓습니다.', en: 'An artist’s impression of the Milky Way based on Gaia space-telescope data. The arrow marks the estimated Solar System location. The Milky Way’s disk spans more than 100,000 light-years.' },
    'galaxy.milkyway.note': { ko: '자료 기반 상상도 · 태양계 추정 위치 표시', en: 'Data-based artist’s impression · estimated Solar System location' },
    'galaxy.galaxies.kicker': { ko: '은하들 / 우주 거대 구조', en: 'GALAXIES / LARGE-SCALE UNIVERSE' },
    'galaxy.galaxies.title': { ko: '은하들이 놓인 거대한 그물', en: 'The vast web where galaxies gather' },
    'galaxy.galaxies.body': { ko: '은하·가스·별·암흑물질이 이루는 우주 거대 구조의 상상도입니다. 관측 자료에서 알려진 ‘우주 거미줄’을 한 장면으로 표현했습니다.', en: 'An artist’s concept of the large-scale structure formed by galaxies, gas, stars and dark matter, expressing the observed cosmic web in one scene.' },
    'galaxy.galaxies.note': { ko: 'earthus 크기 자의 마지막 단계 · 관측 가능한 우주', en: 'Final step on the earthus scale rail · observable universe' },
    'galaxy.artist': { ko: '상상도', en: 'Artist’s impression' },
    'galaxy.source': { ko: '공식 원본·설명', en: 'Official source & description' },
    'galaxy.facts': { ko: '크기 설명', en: 'Scale reference' },
    'galaxy.licence': { ko: '이용 조건', en: 'Usage terms' },
    'explore.ocean.kicker': { ko: '심해 / 크기 전환 데모', en: 'OCEAN / SCALE DEMO' },
    'explore.ocean.title':  { ko: '수면 아래의 깊이를 층으로 내려갑니다.', en: 'Descend through the layers below the surface.' },
    'explore.ocean.status': { ko: '지구에서 바다 지점을 누른 뒤 「여기서 잠수」를 고르면, 검증된 GEBCO 2026 격자로 그 지점의 수심 기둥을 보여줍니다.', en: 'Tap an ocean point on Earth and choose Dive here to see its depth column from the validated GEBCO 2026 grid.' },
    'explore.dive.kicker':  { ko: '심해 / GEBCO 2026', en: 'OCEAN / GEBCO 2026' },
    'explore.home':         { ko: '지구로 돌아가기', en: 'Return to Earth' },
    'm.globe':    { ko: '전지구로',          en: 'Whole Earth' },
    'm.settings': { ko: '설정',              en: 'Settings' },
    's.account':  { ko: '계정',              en: 'Account' },
    's.login':    { ko: '로그인 / 가입',     en: 'Sign in / up' },
    's.subscribe':{ ko: '구독',              en: 'Subscription' },
    's.waitlist': { ko: '사전등록 · 창립 멤버', en: 'Waitlist · founding member' },

    /* 사전등록 화면 — 2026-08-06 전면 교체.
       ⚠️ 날짜·일수는 실제 보관함을 센 값이다. 자료가 더 쌓이면 여기도 고쳐야 한다. */
    'wl.title': { ko: '창립 멤버 사전등록', en: 'Founding member — join the list' },
    'wl.lead':  { ko: '사전등록 항목은 이메일 주소 하나입니다. 유료 서비스가 열리는 날 안내해 드립니다.',
                  en: 'Pre-registration collects one email address. We will write when the paid service opens.' },
    'wl.h1':    { ko: '출시 때 함께 여는 것', en: 'What opens at launch' },
    /* ⚠️ 항공기·선박은 지금 자료원이 없다 (config.js 에서 blocked:'provider').
       "곧"이라고 쓰지 않고 "지금은 아직 없습니다"를 문장 안에 넣어 둔다. */
    'wl.i0':    { ko: '항공기 · 선박 실시간 위치 — 유료 자료 제공사 계약 후 공개',
                  en: 'Live aircraft & ship positions — opens after the paid data-provider contract' },
    'wl.i1':    { ko: '되감기 · 이력 — 자료를 2026년 7월 26일부터 모으고 있습니다. 오늘로 11일치입니다. 30일이 차야 "지난달 같은 날"을 보여드릴 수 있습니다.',
                  en: 'Rewind & history — we have been archiving since 26 July 2026. That is 11 days so far. It takes 30 days before we can show you "the same date last month".' },
    'wl.i2':    { ko: '위성 전체 목록 · 궤도 추적선 — 스타링크를 포함한 약 16,000기',
                  en: 'Full satellite catalogue & orbit tracks — about 16,000 objects including Starlink' },
    'wl.i3':    { ko: '관심 지점 알림 20곳 — 내 자리에 비·바람이 들어올 때',
                  en: 'Alerts for 20 saved spots — when rain or wind reaches your place' },
    'wl.h4':    { ko: '창립 멤버 500명에게 드리는 것', en: 'For the first 500 founding members' },
    /* ⚠️ 값을 숫자로 안 적었다. 기준 가격이 아직 확정이 아니다 (SALES_OPEN=false).
       '정가의 반값'은 값이 바뀌어도 그대로 지켜지는 약속이라 더 안전하고 더 세다. */
    'wl.i6':    { ko: '언제나 정가의 반값 — 나중에 값이 오르더라도 창립 멤버는 계속 반값입니다',
                  en: 'Half the standard price, always — even if the price goes up later, founding members stay at half' },
    'wl.i4':    { ko: '열리는 날 가장 먼저 연락드립니다',
                  en: 'We write to you first on the day it opens' },
    'wl.i5':    { ko: '계정에 창립 멤버 표시가 붙습니다',
                  en: 'Your account carries a founding member mark' },
    'wl.h2':    { ko: '계속 무료인 것', en: 'What stays free' },
    'wl.p2':    { ko: '태풍 · 지진 · 쓰나미 같은 안전 정보, 구름과 날씨, 3D 학습은 구독과 상관없이 계속 무료입니다.',
                  en: 'Safety information — cyclones, earthquakes, tsunami — plus clouds, weather and the 3D lessons stay free regardless of subscription.' },
    'wl.h3':    { ko: '결제', en: 'Payment' },
    'wl.p3':    { ko: '사전등록 수집 항목 · 이메일 주소 · 결제 선택 · 서비스 공개 후',
                  en: 'Pre-registration field · email address · payment choice · after service launch' },
    'acc.founding': { ko: '✦ 창립 멤버', en: '✦ Founding member' },
    /* {n} 자리에 남은 수가 들어간다 */
    'wl.seats':  { ko: '500자리 가운데 {n}자리 남았습니다',
                   en: '{n} of the 500 places are still open' },
    'wl.seatsFull': { ko: '창립 멤버 자리가 모두 찼습니다. 등록해 두시면 열리는 날 함께 연락드립니다.',
                      en: 'All founding member places are taken. Sign up anyway and we will write to you when it opens.' },
    'wl.opt':    { ko: '[선택]', en: '[optional]' },
    'wl.mkt':    { ko: '출시 소식과 이벤트 안내를 받겠습니다',
                   en: 'Send me launch news and event notices' },
    'wl.submit': { ko: '사전등록하기', en: 'Join the list' },
    'wl.fine1':  { ko: '등록하신 이메일은 출시 안내 목적으로만 사용하며,',
                   en: 'Your email is used only to tell you when it opens, and is handled under our' },
    'wl.priv':   { ko: '개인정보처리방침', en: 'privacy policy' },
    'ph.email':  { ko: '이메일 주소',              en: 'Email address' },
    'ph.search': { ko: '장소 · 레이어 · 위성 검색', en: 'Search places, layers, satellites' },
    'ph.ask':    { ko: '지금 태풍 어디야?',        en: 'Where is the typhoon right now?' },
    'wl.fine2':  { ko: '에 따라 처리됩니다.', en: '.' },
    'wl.fine3':  { ko: '창립 멤버 반값은', en: 'The founding member half price is set out in' },
    'wl.terms':  { ko: '이용약관 제8조 제7항', en: 'the terms of service, article 8(7)' },
    'wl.fine4':  { ko: '에 정해져 있습니다.', en: '.' },
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
    /* ⚠️ placeholder 는 textContent 가 아니라 위에서 안 잡힌다.
       영어로 바꿔도 검색창·질문창·이메일칸에 한국어가 그대로 남아 있었다. */
    root.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const v = this.STATIC[el.dataset.i18nPh];
      if (v && v[L]) el.placeholder = v[L];
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
