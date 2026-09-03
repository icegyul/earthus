/* EARTHUS 1.0 — 영어 화면에 남은 한국어를 덮는 층
 *
 * i18n.js 의 data-i18n 열쇠 방식이 정본이다. 이 파일은 그 방식이 **아직 닿지 않은 곳**만 덮는다.
 * 1.0 은 오래 자란 앱이라 문구 대부분이 열쇠 없이 마크업·자바스크립트에 박혀 있고,
 * 영어를 고른 사용자에게 우주·해양·계정·약관 화면이 통째로 한국어로 남아 있었다(실측 340곳).
 *
 * 규칙
 *   · 열쇠가 이깁니다. applyStatic() 이 먼저 돌고 그 뒤에 이 층이 지나간다.
 *   · 사전에 없는 문구는 **한국어 그대로 남는다.** 버그가 아니라 아직 안 옮긴 것이다.
 *     i18n.missingKo() 로 화면에 남은 것을 뽑아 여기에 채운다.
 *   · <script>·<style> 은 건드리지 않는다. 코드 안의 한국어까지 바꿔 버린다.
 *
 * ⚠️ 새 문구를 만들 때는 이 사전이 아니라 i18n.js 의 STATIC 열쇠를 쓸 것.
 *    여기는 이미 박혀 있는 것을 걷어내는 임시 층이고, 비어 가는 게 정상이다.
 */

/* 관제센터 위젯 라벨은 «{이름} 위젯 {동작}» 한 틀로 70개가 넘는다.
   하나씩 적지 않고 틀로 푼다 — 위젯이 늘어도 따라온다. */
const WIDGET_ACT = {
  '숨김': (n) => `Hide ${n} widget`,
  '표시': (n) => `Show ${n} widget`,
  '넓게': (n) => `Widen ${n} widget`,
  '위로 이동': (n) => `Move ${n} widget up`,
  '아래로 이동': (n) => `Move ${n} widget down`,
};
const WIDGET_RE = /^(.+?) 위젯 (숨김|표시|넓게|위로 이동|아래로 이동)$/;

/* 숫자·시각이 섞인 문구는 사전에 담기지 않는다. 틀로 푼다.
   위에서 아래로 처음 맞는 것 하나만 쓴다. */
const RULES = [
  [/^(\d+)장 · HST (\d+) \/ JWST (\d+)$/, (m) => `${m[1]} images · HST ${m[2]} / JWST ${m[3]}`],
  [/^최대 (\d+)$/, (m) => `Max ${m[1]}`],
  [/^(.+) 모델 · (.+) KST · 격자 n=([\d,]+)$/, (m) => `${m[1]} model · ${m[2]} KST · grid n=${m[3]}`],
  [/^공식·공개 자료 (\d+)개 연결$/, (m) => `${m[1]} official/public sources connected`],
  [/^(.+) · 일정 위치$/, (m) => `${m[1]} · scheduled position`],
];

const EN = {
  // ── 문서 ──
  'earthus — 지금 지구의 날씨·바다·재난 | Where Earth Becomes One':
    'earthus — Earth’s weather, ocean and hazards now | Where Earth Becomes One',
  'earthus — 지금 지구의 날씨·바다·재난을 출처와 관측 시각으로 보는 3D 지구본':
    'earthus — a 3D globe showing Earth’s weather, ocean and hazards with sources and observation times',
  'earthus 소개': 'About earthus',

  // ── 우주(AETHERUS) 장면 ──
  '미션 컨트롤': 'Mission control', '태양계': 'Solar system', '우주 사진': 'Space photos',
  '은하수': 'Milky Way', '은하': 'Galaxies', '메뉴': 'Menu',
  '태양계의 전진 보기 →': 'Step out through the solar system →',
  '← 태양계': '← Solar system', '← 3D 우주': '← 3D space',
  '← 태양계 전체': '← Whole solar system', '← 은하수 전체': '← Whole Milky Way',
  '지금 하늘에서': 'In the sky now', '지금 다시 계산': 'Recalculate now',
  '내 위치 사용': 'Use my location', '24시간 기하 계획 만들기': 'Build a 24-hour geometry plan',
  'JPL 계산 근거': 'JPL basis of calculation', '화성 기하 계획': 'Mars geometry plan',
  '바뀐 입력으로 다시 계산': 'Recalculate with the changed input',
  '계획 JSON 저장': 'Save plan as JSON', 'USNO 박명 정의': 'USNO twilight definitions',
  '공식 자료': 'Official data', '공식 원본': 'Official original', '공식 자료 ·': 'Official data ·',
  '공식/공개 자료': 'Official / public data', '계산·도식': 'Computed · schematic',
  '우주 사진관': 'Space gallery', '전체': 'All', '허블': 'Hubble', '제임스웹': 'James Webb',
  '다시 시도': 'Try again', '안내 닫기': 'Close the note',
  '1년을 3D로 펼친 교육 도식': 'A teaching diagram of one year laid out in 3D',
  '움직이는 태양계': 'The solar system in motion',
  '태양 이동 0.0 AU': 'Sun moved 0.0 AU', '1년 다시 보기': 'Replay the year',
  'NASA 공식 자료': 'Official NASA data',
  '관측 자료 기반 3D 구조도': 'A 3D structure map built from observations',
  '우리은하 구조': 'Structure of our galaxy', '우리은하': 'Our galaxy',
  '지구로 돌아가기': 'Back to Earth', 'Earthus 지구로': 'To the Earthus globe',
  '개인 관제센터 · 기기 저장': 'Personal control room · saved on this device',
  '위젯 추가': 'Add a widget', '레이아웃 편집': 'Edit layout',
  '미션 컨트롤 레이아웃 편집': 'Edit mission control layout', '편집 닫기': 'Close editing',
  '팔로우할 검증 일정이 없습니다.': 'There is no verified schedule to follow.',
  '태양계 탐색': 'Explore the solar system', '허블·제임스웹 사진': 'Hubble and Webb images',
  '은하·우주 규모': 'Galaxies and cosmic scale',
  '발사': 'Launches', '위성': 'Satellites', '날씨': 'Weather', '천문': 'Astronomy',
  '자료 확인 중': 'Checking data', '사진 확인 중': 'Checking images',
  'HUBBLE · 궤도 도식': 'HUBBLE · orbit diagram', 'JWST · L2 도식': 'JWST · L2 diagram',
  '발사 일정': 'Launch schedule', '위치 미수신': 'No position received',
  '일정': 'Schedule', '기기 시각 · KST': 'Device time · KST',
  '현재 LIVE 상태 미수신': 'No LIVE status received',
  'LL2 webcast_live=true인 해당 발사에 연결된 송출만 표시합니다.':
    'Only streams attached to a launch with LL2 webcast_live=true are shown.',
  '다음 일정 미수신': 'No next schedule received',
  'Launch Library 2 응답 없음': 'No response from Launch Library 2',
  '검증 가능한 미션 타임라인이 없습니다.': 'There is no verifiable mission timeline.',
  '검증 가능한 payload 자료가 없습니다.': 'There is no verifiable payload data.',
  '발사 일정 응답이 없습니다.': 'No response for the launch schedule.',
  '사용자 위치를 선택하지 않아 통과 시각을 계산하지 않았습니다.':
    'No location was chosen, so pass times were not computed.',
  'NOAA SWPC 응답 없음': 'No response from NOAA SWPC',
  'NOAA SWPC OVATION 응답 없음': 'No response from NOAA SWPC OVATION',
  '위치 미선택': 'No location chosen',
  'Earthus에서 위치를 선택하면 공식 관측을 연결합니다.':
    'Choose a location in Earthus and official observations will be linked.',
  '지구에서 위치 선택': 'Choose a location on the globe',
  '위치를 허용하면 ISS의 향후 48시간 통과를 이 기기에서 계산합니다.':
    'Allow location and the ISS passes for the next 48 hours are computed on this device.',
  '내 위치로 계산': 'Compute for my location', '모델 --': 'Model --',
  'LL2 현재 응답에 확인된 한국 발사 일정이 없습니다.':
    'The current LL2 response contains no confirmed Korean launch.',
  'LL2 현재 응답에 확인된 SpaceX 일정이 없습니다.':
    'The current LL2 response contains no confirmed SpaceX launch.',
  'LL2 현재 응답에 확인된 Starship 일정이 없습니다.':
    'The current LL2 response contains no confirmed Starship launch.',
  'JWST provenance 사진 목록을 받지 못했습니다.':
    'The JWST provenance image list was not received.',
  '현재 기기 저장 · 계정 동기화 전':
    'Saved on this device · not yet synced to an account',
  '숨김': 'Hide', '넓게': 'Widen', '표시': 'Show',
  '기본 배치 복원': 'Restore the default layout', '완료': 'Done',
  '관제 알림센터': 'Control room notices', '알림센터 닫기': 'Close notices',
  '현재 화면의 공식·공개 자료 상태': 'Status of the official and public data on screen',
  'Launch Library 2 · 시각 미수신': 'Launch Library 2 · no timestamp received',
  '미수신': 'Not received', 'Kp 관측': 'Kp observation',
  'NOAA SWPC · 시각 미수신': 'NOAA SWPC · no timestamp received',
  '오로라 모델': 'Aurora model',
  'NOAA SWPC OVATION · 시각 미수신': 'NOAA SWPC OVATION · no timestamp received',
  '우주 사진 원장': 'Space image ledger',
  'Earthus provenance catalogue · 시각 미수신':
    'Earthus provenance catalogue · no timestamp received',
  '화면 내 상태 · 푸시 발송 아님': 'On-screen status · not a push notification',
  '자료 새로고침': 'Refresh data', '태양계의 오늘': 'The solar system today',
  '행성 크기 과장됨 · 안쪽 태양계는 확대 창':
    'Planet sizes exaggerated · the inner solar system is an inset',
  '궤도선': 'Orbit lines', '이름표': 'Labels', '실제 크기 비율': 'True size ratio',
  '우주 탐험 기반 장면': 'Space exploration base scene',
  '지구에서 태양계, 은하수, 은하들까지 이어지는 회전 가능한 3D 로그 스케일':
    'A rotatable 3D log scale running from Earth to the solar system, the Milky Way and the galaxies',
  'AETHERUS 경험': 'AETHERUS experience', '우주 탐험 선택': 'Choose a space view',
  'AETHERUS 전체 메뉴': 'Full AETHERUS menu', 'AETHERUS 메뉴': 'AETHERUS menu',
  '달과 행성 선택': 'Choose a moon or planet',
  '우주망원경과 탐사선 선택': 'Choose a space telescope or probe',
  '망원경 필터': 'Telescope filter', '우주 사진 목록': 'Space image list',
  '관제 자료 필터': 'Control room data filter',
  '관제 알림센터, 확인 항목 4개, 단축키 N': 'Control room notices, 4 items to check, shortcut N',
  '관제센터 전체화면, 단축키 F': 'Control room full screen, shortcut F',
  '실시간 위치가 아닌 궤도 구조 도식': 'An orbit structure diagram, not a live position',
  '8행성의 태양중심 위치': 'Heliocentric positions of the eight planets',
  '행성 시간 재생': 'Play planetary time', '행성 시간': 'Planetary time',

  // ── 바다 ──
  '심해 탐험 기반 장면': 'Deep sea base scene',
  '수면에서 해저까지의 수심 기둥': 'A depth column from the surface to the sea floor',
  '이 지점의 수심': 'Depth at this point',
  '수심 자료를 읽는 중…': 'Reading depth data…',
  '현재 깊이': 'Current depth', '자료 판독': 'Data readout', '판독 모드': 'Readout mode',
  '지구 보기': 'Globe view', '바다 도구': 'Ocean tools',
  '서핑': 'Surfing', '낚시': 'Fishing', '패러글라이딩': 'Paragliding',

  // ── 지구 화면 ──
  '약함': 'Light', '인공위성': 'Satellites', '상태 확인 중': 'Checking status',
  '확대해도 계속 보기': 'Keep showing when zoomed in',
  '내 지역 위로 지나가는 위성을 확인할 수 있습니다':
    'You can check which satellites pass over your area',
  'API 신청 관리': 'Manage API requests', '물어보기': 'Ask', '이벤트': 'Events',
  '내 자리': 'My spot', '표시 끄기': 'Turn off markers', '닫기 ×': 'Close ×',
  '산': 'Mountains', '한국': 'Korea', '일본': 'Japan',
  '개발할 수 있는 것': 'What can be developed', '지도에서 지우기': 'Clear from the map',
  '🦆 철새': '🦆 Migratory birds', '🐦 바닷새': '🐦 Seabirds',
  '🐦 전국 조류 조사': '🐦 National bird survey', '🐢 바다거북': '🐢 Sea turtles',
  '알림': 'Notices', '관광 밀도': 'Tourist density', '여행 발견': 'Travel discovery',
  '기상특보': 'Weather warnings', '항공편': 'Flights', '구독': 'Subscription',
  '서비스 알림 신청': 'Sign up for service notices', '하늘': 'Sky',
  '선택한 자료': 'Selected data', '고도': 'Altitude', '측정 대기': 'Waiting to measure',
  '상태': 'Status', '표시핀': 'Pins', '프레임': 'Frames', '해상도': 'Resolution',
  '전지구': 'Global', '국가': 'Country', '시도': 'Province',
  '태풍 자료를 불러오는 중…': 'Loading typhoon data…',
  '천구 배경 ·': 'Celestial background ·',
  '예보 검증 · Forecast check': 'Forecast check',
  '색상 범례': 'Colour legend', '현재 화면의 도시 원격자값': 'City raw grid values on screen',
  '지점 근거 닫기': 'Close point evidence', 'EARTHUS 메뉴': 'EARTHUS menu',
  '질문': 'Question', '보내기': 'Send',
  '내리기 (궤적은 유지)': 'Take down (keep the track)', '내리기': 'Take down',
  '검색 (⌘K)': 'Search (⌘K)', '검색': 'Search', '닫기': 'Close', '열기': 'Open',
  '오늘의 볼거리': "Today's highlights",
  '현재 위치의 시각과 날씨': 'Time and weather where you are',
  '현재 시각 불러오는 중': 'Loading the current time',
  '오늘 날짜 불러오는 중': "Loading today's date",
  '위치 확인 중': 'Checking your location', '날씨 자세히': 'Weather in detail',
  '날씨 자료 확인 중': 'Checking weather data',
  '현재 기온 확인 중': 'Checking the current temperature',
  '최고 기온 확인 중': 'Checking the high', '최저 기온 확인 중': 'Checking the low',

  // ── «지금 이곳에서» ──
  '지금 이곳에서': 'Right here, right now',
  '밖에서 무엇을 할까요?': 'What will you do outside?',
  '현재 날씨와 공식 특보를 먼저 보고, 활동에 필요한 값만 골라 확인합니다.':
    'Start with the current weather and official warnings, then check only the values your activity needs.',
  '현재 날씨': 'Current weather', '확인 중': 'Checking',
  '지점 자료를 불러오고 있습니다': 'Loading data for this point',
  '강수확률': 'Chance of rain', '12시간 최고': '12-hour high',
  '바람': 'Wind', '습도': 'Humidity',
  '출처와 발표 시각 확인 중': 'Checking the source and issue time',
  '공식 특보를 확인하고 있습니다.': 'Checking official warnings.',
  '하려는 활동을 고르세요': 'Choose what you want to do',
  '선택하면 지금 확인해야 할 날씨값만 추려서 보여드립니다.':
    'Pick one and only the weather values that matter right now are shown.',
  '산책·러닝': 'Walking and running', '자전거': 'Cycling', '등산': 'Hiking',
  '캠핑': 'Camping', '물가 활동': 'By the water', '별보기': 'Stargazing',
  '이 활동에서 먼저 볼 것': 'What to check first for this',
  '비가 오는지, 현재 기온과 바람이 어떤지 확인합니다.':
    'Check whether it is raining, and what the temperature and wind are doing.',
  '이 지점 자료로 질문하기': 'Ask a question about this point',
  '한국어': '한국어',   // 언어 고르는 자리라 제 이름으로 둔다

  // ── 계정 · 약관 ──
  '계정': 'Account',
  '로그인하지 않아도 지구본·기상·교육 콘텐츠는 모두 이용하실 수 있습니다.':
    'You can use the globe, the weather and the learning content without signing in.',
  '로그인은': 'Signing in is for', '설정 동기화': 'syncing your settings',
  '와, 나중에 유료 기능이 열렸을 때 필요합니다.':
    ' and for paid features when they open later.',
  '로그인 / 가입': 'Sign in / sign up', '로그인': 'Sign in', '이메일': 'Email',
  '로그인 방식': 'Sign-in method', '요금제': 'Plan', '계정 삭제': 'Delete account',
  '계정을 삭제하면 모든 데이터가 즉시 파기되며 복구할 수 없습니다. 유료 구독 중이라면 App Store / Google Play에서 구독을 별도로 해지하셔야 합니다.':
    'Deleting your account destroys all your data immediately and it cannot be recovered. If you have a paid subscription you must cancel it separately in the App Store or Google Play.',
  'Google 또는 Apple 계정으로만 가입할 수 있습니다.':
    'You can only sign up with a Google or Apple account.',
  '회사는': 'We', '비밀번호를 저장하지 않습니다.': 'do not store passwords.',
  '✓ 이 기기에서는 다음부터': '✓ On this device, from next time',
  'Face ID / 지문': 'Face ID / fingerprint', '으로 바로 들어옵니다.': ' takes you straight in.',
  'Google로 계속하기': 'Continue with Google', 'Apple로 계속하기': 'Continue with Apple',
  '현재 로그인 연결을 점검하고 있습니다. 지구본과 공개 자료는 로그인 없이 계속 이용하실 수 있습니다.':
    'We are checking the sign-in connection. The globe and public data stay available without signing in.',
  '계속 진행하면': 'Continuing takes you to agree to the',
  '이용약관': 'Terms of service', '및': 'and', '개인정보처리방침': 'Privacy policy',
  '에 동의하는 절차로 이동합니다.': '.',
  '약관 동의': 'Agree to the terms',
  '서비스 이용을 위해 아래 항목에 동의해주세요.':
    'Please agree to the items below to use the service.',
  '선택 항목은 동의하지 않아도 가입하실 수 있습니다.':
    'You can sign up without agreeing to the optional items.',
  '전체 동의': 'Agree to all', '[필수]': '[Required]', '[선택]': '[Optional]',
  '이용약관에 동의합니다': 'I agree to the terms of service',
  '보기': 'View',
  '개인정보 수집·이용에 동의합니다':
    'I agree to the collection and use of my personal data',
  '만 14세 이상입니다': 'I am 14 or older',
  '위치정보 이용에 동의합니다': 'I agree to the use of location data',
  '현재 위치의 기상 정보 표시에만 사용하며 저장하지 않습니다':
    'Used only to show the weather where you are; it is not stored',
  '이용 행태 수집에 동의합니다': 'I agree to usage analytics',
  '어떤 화면을 얼마나 보셨는지 · 어떤 자료를 켜셨는지를 모아 무엇을 더 만들지 정하는 데 씁니다. 광고에 쓰지 않고 밖에 팔지 않습니다.':
    'We gather which screens you looked at and which data you turned on, to decide what to build next. We do not use it for advertising and we do not sell it.',
  '마케팅 정보 수신에 동의합니다': 'I agree to receive marketing messages',
  '신규 기능·이벤트 안내': 'News about new features and events',
  '동의하고 시작하기': 'Agree and start', '동의하지 않고 나가기': 'Leave without agreeing',
  '법률 문서': 'Legal documents', '업데이트': 'Updates',


  // ── 관제센터 위젯 안쪽 (그 장면을 열어야 나온다) ──
  '다음 발사 팔로우': 'Follow the next launch',
  '예정 시각 경과': 'Scheduled time has passed',
  '일정 등록': 'Add to schedule',
  '발사 세부 타임라인': 'Detailed launch timeline',
  '공식 이벤트 단계 미수신': 'No official event phases received',
  '궤도 투입·분리': 'Orbit insertion and separation',
  '확인 전에는 표시하지 않음': 'Not shown until confirmed',
  '예정': 'Scheduled',
  '분리·첫 교신 상태': 'Separation and first contact',
  '공식 확인 전에는 비워 둠': 'Left blank until officially confirmed',
  '베타 픽토리스 행성계': 'Beta Pictoris planetary system',
  '관제 알림센터, 단축키 N': 'Control room notices, shortcut N',
  '오늘의 태양계': 'The solar system today',
  '우주의 크기': 'The scale of the universe',

  // ── 출처 (지우지 않는다 — 무엇을 보고 있는지 적는 자리다) ──
  '데이터 · NASA GIBS / NOAA NESDIS GMGSI / NOAA SWPC / USGS / Open-Meteo (CC BY 4.0) / CelesTrak / Launch Library 2.3 / BigDataCloud (현재 위치 이름) / MyMemory (기계 번역) / © OpenStreetMap contributors':
    'Data · NASA GIBS / NOAA NESDIS GMGSI / NOAA SWPC / USGS / Open-Meteo (CC BY 4.0) / CelesTrak / Launch Library 2.3 / BigDataCloud (place names) / MyMemory (machine translation) / © OpenStreetMap contributors',
};

/* 마크업에서 줄바꿈·들여쓰기로 끊긴 문장은 열쇠와 글자가 다르다. 눌러 쓴 열쇠를 미리 만든다. */
const FLAT = {};
Object.keys(EN).forEach((k) => {
  const f = k.replace(/\s+/g, ' ');
  if (f !== k && FLAT[f] === undefined) FLAT[f] = EN[k];
});

const HAN = /[가-힣]/;
const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/;

export function tKo(s) {
  if (!s) return s;
  const k = String(s).trim();
  let hit = EN[k];
  if (hit === undefined) {
    const flat = k.replace(/\s+/g, ' ');
    if (flat !== k) hit = EN[flat] || FLAT[flat];
  }
  if (hit === undefined) {
    const m = WIDGET_RE.exec(k);
    if (m) hit = WIDGET_ACT[m[2]](m[1]);
  }
  if (hit === undefined) {
    for (const [re, fn] of RULES) {
      const m = re.exec(k);
      if (m) { hit = fn(m); break; }
    }
  }
  if (!hit) return s;                    // 없거나 빈 값이면 원문 그대로
  return String(s).replace(k, hit);      // 앞뒤 공백은 살린다
}

export function sweepKo(root) {
  if (!root) return;
  // <head> 의 link[title] 은 브라우저 메뉴에 뜬다. 몸통을 훑을 때 한 번 같이 본다.
  if (root === document.body) {
    document.head.querySelectorAll('[title]').forEach((el) => {
      const v = el.getAttribute('title');
      if (v && HAN.test(v)) { const o = tKo(v); if (o !== v) el.setAttribute('title', o); }
    });
  }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (SKIP.test(n.parentElement && n.parentElement.tagName)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const todo = [];
  let n;
  while ((n = w.nextNode())) if (n.nodeValue && HAN.test(n.nodeValue)) todo.push(n);
  todo.forEach((node) => {
    const out = tKo(node.nodeValue);
    if (out !== node.nodeValue) node.nodeValue = out;
  });

  // root 자신도 본다 — 새로 붙는 것이 컨테이너가 아니라 버튼 하나일 때가 있다.
  const A = ['title', 'aria-label', 'placeholder'];
  const els = root.querySelectorAll ? [...root.querySelectorAll('[title],[aria-label],[placeholder]')] : [];
  if (root.nodeType === 1 && root.hasAttribute && A.some((a) => root.hasAttribute(a))) els.push(root);
  els.forEach((el) => A.forEach((a) => {
    const v = el.getAttribute(a);
    if (v && HAN.test(v)) {
      const out = tKo(v);
      if (out !== v) el.setAttribute(a, out);
    }
  }));
}

/* 아직 안 옮긴 것을 알려준다. 사전을 채울 때 이걸 본다. */
export function missingKo() {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (SKIP.test(n.parentElement && n.parentElement.tagName)
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = w.nextNode())) {
    const v = (n.nodeValue || '').trim();
    if (v && HAN.test(v) && out.indexOf(v) < 0) out.push(v);
  }
  return out;
}

let observing = false;
export function watchKo() {
  if (observing) return;
  observing = true;
  new MutationObserver((ms) => {
    ms.forEach((m) => {
      if (SKIP.test(m.target.parentElement && m.target.parentElement.tagName)) return;
      if (m.type === 'characterData') {
        const o = tKo(m.target.nodeValue);
        if (o !== m.target.nodeValue) m.target.nodeValue = o;
      } else if (m.type === 'attributes') {
        const v = m.target.getAttribute(m.attributeName);
        if (v && HAN.test(v)) {
          const o = tKo(v);
          if (o !== v) m.target.setAttribute(m.attributeName, o);
        }
      }
      [...(m.addedNodes || [])].forEach((nd) => {
        if (nd.nodeType === 3) {
          const o = tKo(nd.nodeValue);
          if (o !== nd.nodeValue) nd.nodeValue = o;
        } else if (nd.nodeType === 1) sweepKo(nd);
      });
    });
  }).observe(document.body, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'],
  });
}
