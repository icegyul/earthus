// 오른쪽 EARTHUS 2단 메뉴 — 1단은 큰 갈래, 2단은 지구 스타일
//
// 구조
//   손잡이(#menuTab) 만 화면에 남는다. 확대 여부와 무관하게 항상 있다.
//   누르면 1단(#menuMain)이 오른쪽에서 밀려 나오고,
//   거기서 "지구"를 누르면 2단(#menuSub)이 그 왼쪽으로 한 번 더 나온다.
//
// 왜 2단인가
//   한 화면에 레이어를 다 펼치면 다시 "설정창 열어둔 앱"이 된다.
//   1단은 큰 갈래만 보여주고, 세부 선택은 필요할 때만 편다.
//
// 썸네일은 캔버스로 직접 그린다.
//   이미지 파일을 쓰면 파일이 늘고 레이어를 추가할 때마다 디자이너가 필요하다.
//   각 레이어의 대표 색을 코드로 칠하면 항목이 늘어도 한 줄만 추가하면 된다.

import { store } from './store.js';
import { panels } from './panels.js';
import { LAYER_DEFS, TIER } from './config.js';
import { i18n } from './i18n.js';
import { toast } from './ui.js';
import { CONFIG } from './config.local.js';
import { QUESTION_ENTRIES, matchesLayerQuery, partitionLayerItems, clearSelectedLayers, openQuestionEntry } from './menu-information.js?v=20260905';

const $ = s => document.querySelector(s);
const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };

/* 표시할 레이어. sub 은 "현재/예보" 같은 시제 표시다.
   ready:false 는 데이터가 아직 없는 것 — 회색으로 보이고 누르면 안내만 뜬다.
   ⚠️ export 인 이유: 통합 검색(search.js)이 레이어 이름을 찾을 때 이 표를 쓴다.
      레이어 목록을 두 곳에 적으면 하나만 고치고 지나가는 날이 온다. */
export const ITEMS = [
  /* ── 위성 구름 ─────────────────────────────────────────────
     받은 지적: "지구 스타일에 구름 설명을 국기 달아주고
                 순서는 천리안 부터 위성 이름으로 해줘"

     ⚠️ 이름을 **위성 이름**으로 바꿨다. 예전에는 '구름', '구름 (동아시아)',
        '실제 위성 영상' 이라 **무엇이 다른지 이름만 봐서는 알 수 없었다** —
        전부 구름인데 셋 다 다른 위성이 다른 파장으로 본 것이다.
     ⚠️ 국기는 **누가 찍은 위성인가**다. 우리 것이 맨 위에 온다.
     ⚠️ GMGSI 에 특정 국기를 달지 않는다 — 여러 나라 위성을 NOAA 가 합친 것이라
        한 나라 것이라고 하면 틀린 말이 된다. 🌐 로 둔다. */
  { id:'gk2aAuto', flag:'🇰🇷', ko:'천리안2A', en:'Chollian-2A', sub:'낮 가시광·밤 적외 자동 · 전면→동아시아 2km', subEn:'Auto visible by day, IR by night · full disk→E. Asia 2km', ready:true,
    sky:'#0a1828', paint:'gk2a', img:'img/sat-gk2a.png' },
  { id:'gk2aIR', flag:'🇰🇷', ko:'천리안2A', en:'Chollian-2A', sub:'구름 · 전면 8km + 동아시아 2km 상세 · 밤에도', subEn:'Cloud · full disk 8 km + E. Asia 2 km detail · day & night', ready:true,
    sky:'#0b1626', paint:'gk2a', img:'img/sat-gk2a.png' },
  { id:'gk2aNightLow', flag:'🇰🇷', ko:'천리안2A 야간 하층운', en:'Chollian-2A night low cloud', sub:'물방울 구름 후보 · 아시아·태평양 전체 · 밤에만 (8km)', subEn:'Water-cloud signal · Asia–Pacific full disk · night only (8 km)', ready:true,
    sky:'#0a1724', paint:'gk2a', img:'img/sat-gk2a.png' },
  { id:'gk2aVIS', flag:'🇰🇷', ko:'천리안2A', en:'Chollian-2A', sub:'구름 · 한반도 0.5km · 낮에만', subEn:'Cloud · Korea 0.5km · daylight only', ready:true,
    sky:'#0a1828', paint:'gk2a', img:'img/sat-gk2a.png' },
  /* ⚠️⚠️ 이 레이어가 생긴 이유를 적어 둔다 — 받은 지적이 정확했다.
     "일본꺼는 잘 표현되는데 천리안은 안보여" (같은 시각, 15분 차)
     원인은 위성 성능이 아니라 **채널**이었다. 화면의 히마와리는 가시광이고
     천리안은 적외(온도)였다. 낮은 구름은 꼭대기가 지표만큼 따뜻해 적외로는
     원리상 안 잡힌다 — 실측으로 서울 위 구름이 지표보다 5°C도 안 찼다.
     → 같은 위성의 **가시광을 전면으로** 넓혔다. 낮에는 이게 히마와리와 같은 것을 본다. */
  { id:'gk2aVISfd', flag:'🇰🇷', ko:'천리안2A', en:'Chollian-2A', sub:'구름 · 전면 · 낮에만 · 히마와리와 같은 방식', subEn:'Cloud · full disk · daylight only', ready:true,
    sky:'#0a1828', paint:'gk2a', img:'img/sat-gk2a.png' },
  /* ⚠️⚠️ 한반도(8°)와 전면(120°) 사이가 통째로 비어 있었다.
     한반도 상자는 0.5km 로 선명한데 8°밖에 안 되고, 전면은 8.35km 라
     그 사이 — 오키나와·대만·일본 남부 — 가 어느 쪽으로도 잘 안 보였다.
     태풍이 오키나와쯤 있을 때가 정확히 그 구간이다. 2km 로 메운다. */
  { id:'gk2aIRea', flag:'🇰🇷', ko:'천리안2A', en:'Chollian-2A', sub:'구름 · 동아시아 2km · 밤에도', subEn:'Cloud · E. Asia 2km · day & night', ready:true,
    sky:'#0b1626', paint:'gk2a', img:'img/sat-gk2a.png' },
  { id:'gk2aVISea', flag:'🇰🇷', ko:'천리안2A', en:'Chollian-2A', sub:'구름 · 동아시아 2km · 낮에만', subEn:'Cloud · E. Asia 2km · daylight only', ready:true,
    sky:'#0a1828', paint:'gk2a', img:'img/sat-gk2a.png' },
  { id:'gk2aWV', flag:'🇰🇷', ko:'천리안2A', en:'Chollian-2A', sub:'수증기 · 전면 · 상층 흐름', subEn:'Water vapour · full disk', ready:true,
    sky:'#0c1422', paint:'gk2a', img:'img/sat-gk2a.png' },
  /* 빠른 목록의 히마와리9는 낮 가시광·밤 적외를 한 선택에서 자동으로 잇는다.
     ⚠️ 밤 적외의 색은 강수량이 아니라 구름 꼭대기 온도라는 설명을 반드시 남긴다. */
  { id:'himawari', flag:'🇯🇵', ko:'히마와리9', en:'Himawari-9', sub:'낮 가시광 1km·밤 적외 2km 자동 · 동아시아·서태평양', subEn:'Auto visible 1 km by day, IR 2 km at night · E. Asia–W. Pacific', ready:true,
    sky:'#0a1626', paint:'himawari', img:'img/sat-himawari.png' },
  { id:'himaIR', flag:'🇯🇵', ko:'히마와리', en:'Himawari', sub:'구름 꼭대기 온도 · 찰수록 강한 대류', subEn:'Cloud-top temp · colder = stronger', ready:true,
    sky:'#0d1020', paint:'himawari', img:'img/sat-himawari.png' },
  /* NOAA 가 전 세계 정지위성(Meteosat 포함)을 하나로 합성한 것. 전지구를 덮는 유일한 장. */
  { id:'clouds', flag:'🌐', ko:'전지구 합성', en:'Global composite', sub:'NOAA GMGSI · 구름 · 지금', subEn:'NOAA GMGSI · cloud · now', ready:true,
    sky:'#0b1a2e', paint:'cloud' },
  /* 오늘 찍힌 실사. 기본 지도는 정지 사진이라 연기·황사가 안 보인다. */
  /* ⚠️ **수오미 NPP 는 위성 이름, VIIRS 는 그 위에 실린 센서 이름**이다.
     둘 다 맞지만 가리키는 것이 다르다 — 메뉴는 위성, 부제는 센서로 통일한다.
     (우리가 부르는 GIBS 레이어가 VIIRS_SNPP_… 이다) */
  { id:'truecolor', flag:'🇺🇸', ko:'수오미 NPP', en:'Suomi NPP', sub:'VIIRS 최신 완성일 낮 참고 · 현재 구름량 비교 제외', subEn:'VIIRS latest complete daylight mosaic · not current cloud amount', ready:true,
    sky:'#0a1420', paint:'truecolor', img:'img/sat-suomi.png' },
  { id:'temp', ko:'기온', en:'Temperature', sub:'현재', subEn:'Now', ready:true,
    sky:'#101820', paint:'temp' },
  { id:'wind', ko:'바람', en:'Wind', sub:'현재', subEn:'Now', ready:true,
    sky:'#0d1622', paint:'wind' },
  /* 일기도 표준 기호(기입 모형). 운량·풍향풍속깃·기온·이슬점·해면기압을 실측으로 찍는다.
     v2(three)의 js/station-model.js 와 같은 규칙이다 — 같은 값을 두 화면이 다르게
     그리면 그 자체가 결함이다. */
  { id:'synop', ko:'일기도 기호', en:'Station model', sub:'실측 관측', subEn:'Observed', ready:true,
    sky:'#0d1622', paint:'wind' },
  { id:'humidity', ko:'습도', en:'Humidity', sub:'현재', subEn:'Now', ready:true,
    sky:'#0a1720', paint:'humid' },
  /* 받은 지적: "대기중 수증기량인데 뉴스에 나온 자료야 너무 선명하게 잘 보여"
     기존 천리안2A는 중상층 영상이고 이 값은 대기 기둥 전체의 TPW라 별도 항목이다. */
  { id:'tpw', ko:'수증기 통로', en:'Moisture corridor',
    sub:'총가강수량 · 하늘을 짜면 몇 mm', subEn:'Total precipitable water · mm',
    ready:CONFIG.TPW_READY === true, sky:'#11112a', paint:'tpw' },
  /* 예보 3종 — **내일** 기준이다 (지점 현지 날짜).
     ⚠️ 부제에 '내일'을 반드시 쓴다. '최고'라고만 하면 오늘 최고기온으로 읽힌다. */
  { id:'tmax', ko:'기온', en:'Temp', sub:'내일 최고', subEn:'Tomorrow max', ready:true,
    sky:'#1a1008', paint:'tmax' },
  { id:'tmin', ko:'기온', en:'Temp', sub:'내일 최저', subEn:'Tomorrow min', ready:true,
    sky:'#08121a', paint:'tmin' },
  { id:'windfc', ko:'바람', en:'Wind', sub:'내일', subEn:'Tomorrow', ready:true,
    sky:'#0d1622', paint:'windfc' },
  { id:'aurora', ko:'오로라', en:'Aurora', sub:'현재', subEn:'Now', ready:true,
    sky:'#050d12', paint:'aurora' },
  { id:'news', ko:'이벤트', en:'Events', sub:'검증됨', subEn:'Verified', ready:true,
    sky:'#1a1208', paint:'news' },
  { id:'cyclone', ko:'태풍', en:'Cyclones', sub:'실시간', subEn:'Live', ready:true,
    sky:'#0a1420', paint:'cyclone' },
  { id:'quake', ko:'지진', en:'Quakes', sub:'실시간', subEn:'Live', ready:true,
    sky:'#140a0a', paint:'quake' },
  /* 쓰나미는 평소엔 아무것도 안 그린다. 그래도 목록에 둔다 —
     "이 앱이 쓰나미를 본다"는 걸 알아야 필요할 때 믿는다. */
  { id:'tsunami', ko:'쓰나미', en:'Tsunami', sub:'경보', subEn:'Alerts', ready:true,
    sky:'#0a1018', paint:'tsunami' },
  { id:'alerts', ko:'기상경보', en:'Weather alerts', sub:'호우·한파·폭염·대설·강풍', subEn:'Rain, cold, heat, snow, wind', ready:true,
    sky:'#1a1208', paint:'quake' },
  { id:'regional', ko:'각국 기관 재해', en:'National agencies', sub:'지진·화산·경보 · 작은 것까지', subEn:'Quakes, volcanoes, alerts', ready:true,
    sky:'#101a24', paint:'quake' },
  /* 범위는 메뉴에 반복하지 않고, 레이어를 켰을 때 좌하단 자료 안내에 적는다.
     그 안내는 실제로 들어온 기관 목록으로 만들므로 CWA가 아직 수신되지 않은 상태에서
     "대만도 있다"고 미리 말하지 않는다. */
  { id:'lightning', ko:'낙뢰', en:'Lightning', sub:'최근 30분 · 실측', subEn:'Last 30 min · observed', ready:true,
    sky:'#151020', paint:'quake' },
  { id:'wildfire', ko:'산불', en:'Wildfire', sub:'위성 관측', subEn:'Satellite', ready:true,
    sky:'#1a0c06', paint:'fire' },
  /* ── 대기질 ─────────────────────────────────────────
     ⚠️ dust 의 부제를 "황사"라고 쓰지 않는다. 이 값은 먼지 질량이고
        어디서 온 먼지인지는 들어 있지 않다. 사막 발원은 사람이 판단하게 둔다. */
  { id:'pm25', ko:'초미세먼지', en:'PM2.5', sub:'현재', subEn:'Now', ready:true,
    sky:'#171213', paint:'pm25' },
  { id:'pm10', ko:'미세먼지', en:'PM10', sub:'현재', subEn:'Now', ready:true,
    sky:'#17140f', paint:'pm10' },
  { id:'dust', ko:'먼지', en:'Dust', sub:'모래·황사', subEn:'Desert dust', ready:true,
    sky:'#1a1408', paint:'dust' },
  { id:'aqi', ko:'대기질', en:'Air quality', sub:'유럽 기준', subEn:'European AQI', ready:true,
    sky:'#101614', paint:'aqi' },
  { id:'uv', ko:'자외선', en:'UV index', sub:'현재', subEn:'Now', ready:true,
    sky:'#1a1508', paint:'uv' },
  { id:'ozone', ko:'오존', en:'Ozone', sub:'현재', subEn:'Now', ready:true,
    sky:'#0a1418', paint:'ozone' },

  /* ── 해양 ───────────────────────────────────────────
     ⚠️ current 부제를 "조류"로 쓰지 않는다. 조류(물때)는 다른 것이고,
        어민·낚시하는 사람이 이걸 물때표로 쓰면 위험하다. */
  { id:'sst', ko:'해수면 온도', en:'Sea temperature', sub:'현재', subEn:'Now', ready:true,
    sky:'#06161f', paint:'sst' },
  { id:'sstanom', ko:'수온 편차', en:'SST anomaly', sub:'평년 대비', subEn:'vs 1991–2020', ready:true,
    sky:'#0d1420', paint:'sstanom' },
  /* ⚠️ 부제를 "유의파고"라고 쓰지 않는다 — 이건 기상 전공자의 말이다.
     뜻은 **"큰 쪽 3분의 1 파도의 평균"**이고, 사람이 눈으로 보고 "이 정도 파도"라고
     말하는 크기와 대체로 맞다. 그래서 정의를 그대로 쉬운 말로 적는다. */
  { id:'wave', ko:'파고', en:'Waves', sub:'큰 쪽 파도 평균', subEn:'Significant height', ready:true,
    sky:'#061520', paint:'wave' },
  { id:'swell', ko:'너울', en:'Swell', sub:'먼바다 파도', subEn:'Long-period', ready:true,
    sky:'#05131c', paint:'swell' },
  { id:'current', ko:'해류', en:'Ocean current', sub:'표층 흐름', subEn:'Surface flow', ready:true,
    sky:'#04141c', paint:'current' },

  /* ── 안개 · 가뭄 ────────────────────────────────────
     ⚠️ drought 부제를 "가뭄"으로 단정하지 않는다. 지금의 토양수분일 뿐이고
        진짜 가뭄은 몇 주 누적으로 판정한다. 평년 기준선이 생기면 바꾼다. */
  { id:'fog', ko:'안개', en:'Fog', sub:'시정', subEn:'Visibility', ready:true,
    sky:'#12171a', paint:'fog' },
  { id:'drought', ko:'토양 수분', en:'Soil moisture', sub:'메마름 정도', subEn:'Dryness', ready:true,
    sky:'#1a1610', paint:'drought' },
  /* ⚠️ 부제를 "태풍 진로"라고 쓰지 않는다. 진로를 끄는 것은 상층(500hPa) 흐름이고
     이건 지상 기압이다. 여기서 보이는 건 **고기압·저기압이 어디 있나** 까지다. */
  { id:'pressure', ko:'기압 배치', en:'Pressure pattern', sub:'고기압·저기압', subEn:'Highs and lows',
    ready:true, sky:'#0e1420', paint:'pressure' },
  /* ⚠️ 부제를 "구름"이라 쓰지 않는다 — 구름 레이어가 따로 있고, 그건 다른 것이다. */
  { id:'rain', ko:'비구름', en:'Rain', sub:'지금 내리는 양', subEn:'Falling now',
    ready:true, sky:'#0a1420', paint:'rain' },

  /* 지상 관측소 — 부이의 육지판. 실제 계기의 실황이다. */
  { id:'landobs', ko:'지상 관측소', en:'Ground stations', sub:'실황 관측', subEn:'Live readings', ready:true,
    sky:'#0d1a12', paint:'landobs' },
  /* 영국 예보 — 부제에 '예보'를 반드시 남긴다.
     바로 위 '지상 관측소'가 실황이라, 둘을 구분하지 않으면 사용자가 섞어 읽는다. */
  { id:'ukfc', ko:'영국 예보', en:'UK forecast', sub:'영국 기상청 · 36곳', subEn:'Met Office · 36 sites', ready:true,
    sky:'#0c1622', paint:'ukfc' },
  /* ⚠️ 이건 자료를 보여주는 레이어가 아니라 **자료가 없는 곳**을 보여주는 레이어다. */
  { id:'coverage', ko:'관측 공백', en:'Observation gaps', sub:'관측 적은 곳', subEn:'Sparse observations', ready:true,
    sky:'#0a0e14', paint:'coverage' },

  { id:'buoy', ko:'해양 부이', en:'Buoys', sub:'파고·수온', subEn:'Waves', ready:true,
    sky:'#06121a', paint:'buoy' },
  /* ⚠️ '실측'을 부제에 반드시 남긴다 — 대기질 메뉴의 pm25/pm10 격자는
     유럽 CAMS 모델값이고, 이건 한국환경공단이 실제로 잰 값이라 서로 다르다. */
  { id:'airkr', ko:'대기오염(실측)', en:'Air quality (measured)',
    sub:'전국 673개 측정소', subEn:'673 stations nationwide', ready:true,
    sky:'#141a12', paint:'airkr' },
  { id:'eclipse', ko:'일식', en:'Eclipse', sub:'예정', subEn:'Upcoming', ready:true,
    sky:'#0a0a10', paint:'eclipse' },
  /* 열돔·환류는 예전에 목록에 없어서 끌 방법이 없었다.
     ⚠️ 특히 열돔은 반경 수백 km 반투명 면이라 켜져 있으면 다른 걸 보기 어렵다.
        "끄고 싶은데 끌 곳이 없다"는 건 레이어를 만들어놓고 안 만든 것과 같다. */
  { id:'heatdome', ko:'열돔', en:'Heat dome', sub:'감지', subEn:'Detected', ready:true,
    sky:'#1a0e06', paint:'heatdome' },
  { id:'phenomena', ko:'해양 환류', en:'Ocean gyres', sub:'5개 해역', subEn:'5 basins',
    ready:true, sky:'#06141a', paint:'gyre' },
  { id:'tourism', ko:'관광 밀도', en:'Tourism density', sub:'서울시 공식 혼잡 · 지역 밀도 셀', subEn:'Official Seoul crowd · regional density cells',
    ready:true, sky:'#081b1b', paint:'tourism' },
  { id:'poi', ko:'명소', en:'Places', sub:'박물관·천문대·아쿠아리움 · 확대 후', subEn:'Museums, observatories and aquariums · zoom in',
    ready:true, sky:'#0c1b14', paint:'poi' },
  /* FREE_OPEN 기간에는 없는 글로벌 provider를 결제 대기 경로로 꾸미지 않는다.
     항공기는 실제 항로·내 비행기 도구, 선박은 KOMSA MTIS 공식 화면으로 곧장 연다. */
  { id:'flight', ko:'항공기', en:'Aircraft', sub:'항로·내 비행기 추적', subEn:'Route · my flight tracking',
    ready:true, open:'flight', sky:'#0a1018', paint:'flightlayer' },
  { id:'ship', ko:'선박', en:'Ships', sub:'공식 실시간 위치', subEn:'Official live positions',
    ready:true, open:'vessel', sky:'#06121a', paint:'shiplayer' },
];

/* 썸네일 — 구(球) 느낌만 나면 된다. 실제 지구를 렌더할 필요는 없다. */
/* export — 태풍 정보창(ui-cyclone.js)이 같은 동그라미를 그린다.
   받은 요청: "요거 메뉴는 지구 스타일 메뉴의 동그란 걸로 같은 걸로 넣어줘" */
export function drawThumb(cv, kind) {
  const S = 124;                       // 레티나 대비 2배로 그린다
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const R = S / 2 - 2, cx = S / 2, cy = S / 2;

  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();

  const paint = {
    /* 히마와리 — 한 지역만 아주 촘촘하게. 원반 일부와 촘촘한 구름결로 그린다. */
    himawari: () => { bg(['#0e2038', '#04101c']); blobs('rgba(255,255,255,.85)', 14, 7); streaks('rgba(200,225,255,.35)'); },
    cloud: () => { bg(['#10365e', '#0a1f38']); blobs('rgba(255,255,255,.85)', 9, 13); },
    /* 실사 느낌 — 땅색 위에 흰 구름·연기 줄기 */
    truecolor: () => {
      bg(['#4a6b3d', '#8a7a52']);
      blobs('rgba(255,255,255,.8)', 5, 15);
      g.strokeStyle = 'rgba(230,230,235,.75)'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(30, 82); g.quadraticCurveTo(62, 62, 96, 40); g.stroke();
      g.beginPath(); g.moveTo(22, 52); g.quadraticCurveTo(50, 40, 78, 22); g.stroke();
    },
    temp:  () => { band(['#3b4cc0', '#4fb3d9', '#7dd87d', '#f5e05a', '#f0803c', '#c92b2b']); },
    wind:  () => { bg(['#cfe4f5', '#8fb8d8']); streaks('rgba(255,255,255,.9)'); },
    humid: () => { bg(['#7fc6e8', '#2a6f95']); blobs('rgba(240,150,60,.75)', 7, 15); },
    tpw: () => { band(['#3c1e6e', '#2d50af', '#379bd2', '#91d7be', '#f5dc7d', '#ee9146', '#be4164', '#e191c3']); },
    tmax:  () => { band(['#f5e05a', '#f0a03c', '#e0562b', '#a81f1f']); },
    tmin:  () => { band(['#0d2a6b', '#2b62c0', '#69a8de', '#bcd8f0']); },
    aurora:() => { bg(['#04141c', '#02080c']); aurora(); },
    quake: () => { bg(['#2a1410', '#120806']); dots('#ff5d5d'); },
    cyclone: () => { bg(['#0d2438', '#061421']); spiral('#ff9f45'); },
    news: () => { bg(['#241608', '#100a04']); dots('#ffd166'); },
    tsunami: () => { bg(['#0a2030', '#04101a']); waves('#ff5d5d'); },
    fire: () => { bg(['#2a1206', '#120602']); flames(); },
    buoy: () => { bg(['#062535', '#031018']); waves('#5ad1e8'); dots('#9fe8f5'); },
    // 초록(좋음)~빨강(매우나쁨) — 등급 4단계를 점으로 흩어 놓는다
    airkr: () => { bg(['#141a12', '#0a0e08']); dots('#5fd15a'); dots('#ff9f43'); },
    /* 관측망 — 촘촘한 곳과 빈 곳. 점이 몰린 데와 없는 데가 대비되게. */
    coverage: () => { bg(['#0a0e14', '#050810']); dots('#a8d4ec'); },
    landobs: () => { bg(['#0e2418', '#04120a']); dots('#9fd8a8'); streaks('rgba(200,240,210,.45)'); },
    /* 영국 — 흐린 하늘에 점점이 지점. 비 계열 파랑을 바탕에 깐다. */
    ukfc: () => { bg(['#132638', '#060e18']); streaks('rgba(150,200,240,.35)'); dots('#8fd0ff'); },
    /* 대기질 — 탁한 공기는 알갱이로, 깨끗한 쪽은 맑은 띠로 */
    pm25: () => { bg(['#4a4048', '#1a1418']); blobs('rgba(230,190,150,.5)', 11, 9); },
    pm10: () => { bg(['#4e463a', '#1c1812']); blobs('rgba(235,205,150,.55)', 8, 13); },
    dust: () => { bg(['#8a6a38', '#2e2010']); streaks('rgba(240,205,140,.8)'); },
    aqi:  () => { band(['#50c8be', '#78cd8c', '#f5e178', '#f5a050', '#e15541']); },
    uv:   () => { band(['#3c82b4', '#6ec88c', '#f5e16e', '#f5a546', '#e15046', '#a03ca5']); },
    ozone:() => { band(['#466ebe', '#6ebec8', '#bedc96', '#f5dc78', '#f0964b']); },
    /* 해양 — 물빛 바탕에 파도. 파고와 너울은 파장을 다르게 그려 구분한다. */
    sst:  () => { band(['#2d2378', '#375fbe', '#46a0d7', '#6ecdbe', '#ebdc82', '#f0a550', '#e15f41']); },
    /* 편차 — 가운데가 흰색인 발산형. 색만 봐도 "0 이 기준"임이 읽힌다. */
    sstanom: () => { band(['#283c96', '#4682c8', '#96c8e1', '#ebeef0', '#fad296', '#eb8246', '#aa1e32']); },
    wave: () => { bg(['#0a2c48', '#04121e']); waves('#7fd0e8'); },
    swell:() => { bg(['#08243c', '#03101a']); waves('#9fd8f0', 1.7); },
    current: () => { bg(['#052030', '#020e16']); streaks('rgba(140,220,235,.85)'); },
    /* 안개 — 흐릿한 띠. 가뭄 — 갈라진 땅빛 */
    fog:  () => { bg(['#8a969c', '#2a3236']); blobs('rgba(255,255,255,.45)', 6, 26); },
    drought: () => { band(['#9b5f2d', '#c8a05f', '#e1d796', '#96c89b', '#3c96af']); },
    /* ⚠️ 가운데(1013hPa)가 무채색이어야 한다 — 고기압·저기압이 양쪽으로 갈린다 */
    pressure: () => { band(['#465ac0', '#82becf', '#e8ecee', '#facd8c', '#eb7d41']); },
    rain: () => { band(['#5a96dc', '#46bed2', '#5ad28c', '#ebd764', '#e14650']); },
    eclipse: () => { bg(['#0b0b14', '#020208']); corona(); },
    flightlayer: () => { bg(['#0a1c2e', '#04101c']); tracks('#8fd0ff'); },
    shiplayer: () => { bg(['#062232', '#03111a']); waves('#7fb8d8'); tracks('#bfe4f5'); },
    tourism: () => { band(['#48d7a0', '#f0cf63', '#f39a54', '#ef5a67']); },
    /* 열돔 — 안이 진하고 바깥으로 옅어지는 넓은 열 덩어리 */
    heatdome: () => { bg(['#2a1206', '#140803']); heatBlob('#ff6b3d'); },
    /* 환류 — 도는 타원 흐름 두 개 */
    gyre: () => { bg(['#06202e', '#031218']); swirl('#8fd694'); },
    /* 내일 바람 — 지금 바람과 같은 그림이면 목록에서 구분이 안 된다.
       점선으로 그려 "아직 오지 않은 것"임을 시각적으로 구분한다. */
    windfc: () => { bg(['#101d2e', '#070f1a']); streaks('rgba(180,215,255,.85)', true); },
  }[kind] || (() => bg(['#123', '#012']));

  function heatBlob(color) {
    const gr = g.createRadialGradient(cx, cy, R * 0.06, cx, cy, R * 0.9);
    gr.addColorStop(0, color);
    gr.addColorStop(0.45, 'rgba(255,107,61,.5)');
    gr.addColorStop(1, 'rgba(255,107,61,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, R * 0.9, 0, 6.3); g.fill();
    // 하강기류 — 열돔의 원리
    g.strokeStyle = 'rgba(255,200,170,.75)'; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * R * 0.34;
      g.beginPath(); g.moveTo(x, cy - R * 0.5); g.lineTo(x, cy + R * 0.16); g.stroke();
      g.beginPath();
      g.moveTo(x - 5, cy + R * 0.05); g.lineTo(x, cy + R * 0.2); g.lineTo(x + 5, cy + R * 0.05);
      g.stroke();
    }
  }
  function swirl(color) {
    g.strokeStyle = color; g.lineWidth = 3.4; g.globalAlpha = 0.9;
    [[-0.3, -0.22, 1], [0.32, 0.26, -1]].forEach(([ox, oy, dir]) => {
      g.beginPath();
      g.ellipse(cx + ox * R, cy + oy * R, R * 0.4, R * 0.27, dir * 0.5, 0, 6.3);
      g.stroke();
      // 화살촉 — 어느 쪽으로 도는지
      const hx = cx + ox * R + Math.cos(dir * 0.5) * R * 0.4;
      const hy = cy + oy * R + Math.sin(dir * 0.5) * R * 0.4;
      g.beginPath();
      g.moveTo(hx - 6 * dir, hy - 7); g.lineTo(hx + 4 * dir, hy); g.lineTo(hx - 6 * dir, hy + 7);
      g.stroke();
    });
    g.globalAlpha = 1;
  }

  function bg(cs) {
    const gr = g.createLinearGradient(0, 0, S, S);
    cs.forEach((c, i) => gr.addColorStop(i / (cs.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  function band(cs) {   // 위도별 색띠 — 기온·습도 지도의 전형적인 모습
    const gr = g.createLinearGradient(0, 0, 0, S);
    cs.forEach((c, i) => gr.addColorStop(i / (cs.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  function blobs(color, n, r) {
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = i * 2.399, rr = R * 0.82 * Math.sqrt((i + .5) / n);
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, r, r * .62, a, 0, 6.3);
      g.fill();
    }
  }
  function streaks(color, dashed) {
    g.strokeStyle = color; g.lineWidth = 2.2; g.lineCap = 'round';
    // 점선 = 아직 오지 않은 것(예보). 지금 바람과 한눈에 구분된다.
    if (dashed) g.setLineDash([7, 6]);
    for (let i = 0; i < 11; i++) {
      const y = 10 + i * (S - 20) / 10, w = 22 + (i % 3) * 12;
      const x = cx - 34 + ((i * 29) % 58);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 5, x + w, y); g.stroke();
    }
    g.setLineDash([]);        // ⚠️ 되돌리지 않으면 뒤에 그리는 것까지 점선이 된다
  }
  function aurora() {
    for (let i = 0; i < 3; i++) {
      const gr = g.createLinearGradient(0, 22 + i * 9, 0, 52 + i * 9);
      gr.addColorStop(0, 'rgba(80,255,180,0)');
      gr.addColorStop(.5, `rgba(90,255,170,${.5 - i * .12})`);
      gr.addColorStop(1, 'rgba(80,255,180,0)');
      g.fillStyle = gr; g.fillRect(0, 20 + i * 9, S, 34);
    }
  }
  function spiral(c) {   // 태풍 나선 — 눈과 나선팔
    g.strokeStyle = c; g.lineWidth = 5; g.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      g.beginPath();
      for (let t = 0; t <= 1; t += 0.03) {
        const a = arm * 2.09 + t * 3.4, r = 8 + t * R * 0.8;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        t ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(10,20,32,.9)';
    g.beginPath(); g.arc(cx, cy, 7, 0, 6.3); g.fill();
  }
  function dots(c) {
    g.fillStyle = c;
    for (let i = 0; i < 7; i++) {
      const a = i * 2.399, rr = R * 0.75 * Math.sqrt((i + .5) / 7);
      g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 4.2, 0, 6.3); g.fill();
    }
  }
  /* 물결. wl 은 파장 배수 — 1 보다 크면 길고 완만한 파도(너울)가 된다.
     ⚠️ 파고와 너울을 같은 그림으로 두면 목록에서 둘을 구분할 수 없다. */
  function waves(c, wl = 1) {
    g.strokeStyle = c; g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.globalAlpha = 0.85 - i * 0.18;
      g.beginPath();
      const y = 34 + i * 19;
      for (let x = 6; x <= S - 6; x += 4) {
        const yy = y + Math.sin((x / S) * 6.3 / wl + i) * 6 * wl;
        x === 6 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  function tracks(c) {   // 교차하는 항적 — 항공기·선박 레이어의 인상
    g.strokeStyle = c; g.lineWidth = 1.6; g.lineCap = 'round';
    const seg = [[8, 96, 116, 30], [14, 30, 104, 92], [10, 62, 118, 58]];
    seg.forEach(([x1, y1, x2, y2], i) => {
      g.globalAlpha = 0.75 - i * 0.16;
      g.setLineDash([9, 6]);
      g.beginPath(); g.moveTo(x1, y1);
      g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 16, x2, y2);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.fillStyle = c;
      g.beginPath(); g.arc(x2, y2, 3, 0, 6.3); g.fill();
    });
  }
  function flames() {   // 열점 — 크기가 제각각인 불덩이
    const spots = [[42,54,13],[74,40,9],[58,84,11],[86,74,6],[34,86,7],[64,26,5]];
    spots.forEach(([x, y, r], i) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
      gr.addColorStop(0, 'rgba(255,240,180,.95)');
      gr.addColorStop(.35, 'rgba(255,120,30,.8)');
      gr.addColorStop(1, 'rgba(255,60,10,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r * 2.2, 0, 6.3); g.fill();
    });
  }
  function corona() {   // 검은 원반 + 코로나 — 개기일식의 그 모습
    const gr = g.createRadialGradient(cx, cy, 22, cx, cy, R);
    gr.addColorStop(0, 'rgba(255,244,214,.9)');
    gr.addColorStop(.35, 'rgba(255,210,140,.28)');
    gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.fill();
    g.fillStyle = '#05050a';
    g.beginPath(); g.arc(cx, cy, 22, 0, 6.3); g.fill();
  }
  paint();

  // 구 느낌 — 오른쪽 아래를 어둡게 해서 입체로 보이게
  const sh = g.createRadialGradient(cx - R * .35, cy - R * .35, R * .1, cx, cy, R * 1.08);
  sh.addColorStop(0, 'rgba(255,255,255,.16)');
  sh.addColorStop(.55, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,.72)');
  g.fillStyle = sh; g.fillRect(0, 0, S, S);
  g.restore();

  // 대기 테두리
  g.strokeStyle = 'rgba(120,190,255,.45)'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
}

/* 지구 스타일 묶음.
   ⚠️ 왜 묶는가 (받은 지적)
     "스타일별로 관측소+부이 등 비슷한 카테고리별로 모아주고"
     33종이 한 줄로 늘어서 있으면 원하는 걸 찾을 수 없다.
     그리고 어떤 것끼리 서로를 대체하는지도 안 보인다.

   ⚠️ 순서는 "많이 쓰는 것부터"다. 알파벳순이나 만든 순서가 아니다. */
const CATEGORIES_FULL = [
  /* ⚠️⚠️ **이 순서가 화면 순서다.** ITEMS 의 순서가 아니다 —
     ITEMS 만 고쳐 놓고 여기를 안 고치면 새 항목이 조용히 '그 밖에'로 밀려난다
     (실제로 천리안 3종이 그렇게 목록 맨 아래로 갔다).
     받은 지적: "순서는 천리안 부터 위성 이름으로 해줘" */
  { id: 'base',    ko: '바탕',       en: 'Base',
    /* 받은 지시대로: 넓은 것 → 좁은 것, 그리고 같은 위성끼리 붙이지 않는다.
       ⚠️ 앞의 넷이 **서로 다른 위성이 본 같은 하늘**이라 나란히 두면 비교가 된다. */
    ids: ['clouds',        // 🌐 NOAA 전지구 합성 (가장 넓다)
          'truecolor',     // 🇺🇸 수오미 NPP
          'gk2aIR',        // 🇰🇷 전면 8km + 동아시아 2km 상세
          'gk2aNightLow',  // 🇰🇷 11.2−3.8㎛ 야간 하층 물구름 신호
          'himawari',      // 🇯🇵 히마와리 1km
          'gk2aVIS',       // 🇰🇷 천리안 0.5km (낮)
          'gk2aVISfd',     // 🇰🇷 천리안 전면 가시광 (낮) — 히마와리와 같은 것을 본다
          'gk2aIRea',      // 🇰🇷 천리안 동아시아 2km (밤에도)
          'gk2aVISea',     // 🇰🇷 천리안 동아시아 2km (낮)
          'gk2aWV',        // 🇰🇷 천리안 수증기
          'himaIR'] },     // 🇯🇵 히마와리 구름 꼭대기 온도
  { id: 'weather', ko: '기상',       en: 'Weather',
    ids: ['temp', 'tmax', 'tmin', 'humidity', 'tpw', 'wind', 'synop', 'windfc', 'rain', 'pressure',
          'fog', 'drought'] },
  { id: 'air',     ko: '대기질',     en: 'Air quality',
    ids: ['airkr', 'pm25', 'pm10', 'dust', 'aqi', 'uv', 'ozone'] },
  { id: 'ocean',   ko: '해양',       en: 'Ocean',
    ids: ['sst', 'sstanom', 'wave', 'swell', 'current', 'phenomena'] },
  { id: 'station', ko: '관측소',     en: 'Stations',
    ids: ['landobs', 'ukfc', 'buoy'] },
  /* 사람·도시는 지구를 읽는 데이터 계층이다. 여행 메뉴는 이 레이어를 다시 쓰는
     목적별 입구일 뿐, 별도 관광 엔진이나 복제 상태를 만들지 않는다. */
  { id: 'human',  ko: '사람·도시',   en: 'People & cities',
    ids: ['tourism', 'poi', 'coverage'] },
  { id: 'sky',     ko: '하늘·우주',  en: 'Sky & space',
    ids: ['aurora', 'eclipse'] },
  { id: 'move',    ko: '이동',       en: 'Movement',
    ids: ['flight', 'ship'] },
  { id: 'events',  ko: '이벤트',     en: 'Events',
    ids: ['news'] },
];

/* ── v1 정리(2026-09-06) ─────────────────────────────────────────
   받은 지시(그대로): v1 의 전체 레이어는
     바탕  전지구 합성 · 수오미 NPP · 천리안2A · 히마와리9
     기상  기온(현재) · 습도(현재) · 수증기 통로 · 바람(현재) · 기압 배치 · 토양수분
     대기  대기오염(실측) · 초미세먼지 · 미세먼지 · 먼지(모래·황사) · 대기질 · 자외선 · 오존
     해양  해수면 온도 · 수온 편차 · 파고 · 너울 · 해류
   그 밖의 항목(내일 예보·일기도 기호·비구름·안개·관측소·사람·도시·하늘·이동·이벤트)과
   위성 전문 채널은 목록에서 뺀다. 시간 전환·한 번에 보기·기상청 라이브 입구·질문 항목도
   같이 숨긴다(V1_LEAN). ITEMS·LAYER_DEFS 자체는 건드리지 않는다 — 검색·딥링크·
   저장된 상태가 그 id 를 계속 쓴다. 되돌리려면 V1_LEAN 만 false 로.
   ⚠️ 첫 로딩 무게는 여기가 아니라 main.js 의 lazy 표가 줄인다. 이 표는 화면만 정리한다. */
const V1_LEAN = true;
/* 2026-09-06 받은 지시: "메뉴를 v3 처럼 하단으로 넣고 그 위로 두 번째 메뉴가 나오게. 설정은 좌상단에 있으니 빼라."
   MENU_BAR 가 켜지면 #menuMain 은 오른쪽 서랍이 아니라 늘 보이는 하단 바가 되고(body.menu-bar, app.css 끝),
   2단(#menuSub)은 항목 아래가 아니라 바 위에 뜬다. 옛 서랍 방식으로 되돌리려면 false. */
const MENU_BAR = true;
const CATEGORIES_LEAN = [
  { id: 'base',    ko: '바탕',       en: 'Base',
    ids: ['clouds', 'truecolor', 'gk2aAuto', 'himawari'] },
  { id: 'weather', ko: '기상',       en: 'Weather',
    ids: ['temp', 'humidity', 'tpw', 'wind', 'pressure', 'drought'] },
  { id: 'air',     ko: '대기질',     en: 'Air quality',
    ids: ['airkr', 'pm25', 'pm10', 'dust', 'aqi', 'uv', 'ozone'] },
  { id: 'ocean',   ko: '해양',       en: 'Ocean',
    ids: ['sst', 'sstanom', 'wave', 'swell', 'current'] },
];
const CATEGORIES = V1_LEAN ? CATEGORIES_LEAN : CATEGORIES_FULL;

/* ── 메뉴 이동 = 한 화면만 (2026-09-06) ──────────────────────
   받은 지적: 서울 관광 밀도 시트를 보다가 AETHERUS 미션 컨트롤에 들어가니 둘이 겹쳐 보였다.
   규칙 (받은 말 그대로):
     1. 지구 보기·읽고 분석·활동 어느 카테고리든 **다른 항목을 열면 열려 있던 시트는 전부 닫는다.**
     2. 테마 묶음(기상·해양·재난 같은 한 묶음) 안에서만 겹쳐 켜고, 묶음 밖으로 옮기면 기존 레이어는 끈다.
   바탕(base) 묶음은 지구 표면 자체라 끄지 않는다 — 끄면 빈 지구가 남는다.
   ⚠️ 시트 닫기는 동기다. 새 화면을 연 **뒤에** 닫으면 방금 연 것까지 닫힌다. */
const ALL_GROUPS = () => [...CATEGORIES, ...TRAVEL_CATEGORIES, ...ALERT_CATEGORIES];
function groupIdsOf(groupId) { return ALL_GROUPS().filter(c => c.id === groupId).flatMap(c => c.ids); }
function groupsOfLayer(layerId) { return ALL_GROUPS().filter(c => c.ids.includes(layerId)).map(c => c.id); }
/** 지금 열린 화면을 떠난다. keep: 살려 둘 묶음 id(들). layers:false 면 시트만 닫는다. 끈 레이어 수를 돌려준다. */
function leaveMenus({ keep = null, layers = true } = {}) {
  panels.closeAll();
  if (!layers) return 0;
  const hold = new Set(groupIdsOf('base'));
  (Array.isArray(keep) ? keep : keep ? [keep] : []).forEach(g => groupIdsOf(g).forEach(id => hold.add(id)));
  let n = 0;
  LAYER_DEFS.forEach(d => { if (!hold.has(d.id) && store.isOn(d.id)) { store.setLayer(d.id, false); n += 1; } });
  return n;
}
/* 1단 동작·질문 항목이 곧바로 여는 화면과 짝인 묶음 — 그 묶음의 레이어는 살려 둔다 */
const ACTION_KEEP = { news: 'events', flight: 'move', outdoor: 'ocean', surf: 'ocean', fishing: 'ocean', sky: 'sky' };
/* 설정·질문·커뮤니티·내 위치·지구로 는 자료를 보여주는 메뉴가 아니라 이동·도구다 — 시트만 닫고 레이어는 둔다 */
const ACTION_SHEET_ONLY = new Set(['settings', 'ask', 'community', 'locate', 'earth-home', 'intel']);
const QUESTION_KEEP = { weather: 'weather', alerts: 'hazard', ocean: 'ocean', travel: ['travel', 'human'], sky: 'sky' };

/* 여행은 목적별 입구다. 같은 tourism/poi 레이어를 켜므로 지구 레이어 상태·시간·출처가
   그대로 이어지고, 여행 화면만의 별도 값이나 중복 수집기를 만들지 않는다. */
const TRAVEL_CATEGORIES = [
  { id: 'travel', ko: '여행', en: 'Travel', ids: ['tourism', 'poi'] },
];

/* ── Alert 묶음 ──────────────────────────────────────────────
   재난 레이어는 '지구 스타일'에서 빼내 **Alert 메뉴**로 옮겼다 (받은 요청).
   이유: 지구 스타일은 "지구를 어떻게 볼 것인가"(바탕·기상·해양)이고,
   재난은 "지금 무슨 일이 났는가"다. 성격이 달라 한 목록에 섞으면
   급할 때 찾기 어렵다.

   ⚠️ CATEGORIES 에서 빼는 것만으로는 부족하다. render() 의 '그 밖에' 수거가
      ITEMS 에 남은 항목을 자동으로 다시 붙여서 지구 스타일에 조용히 재등장한다.
      그래서 ALERT_IDS 로 명시적으로 걸러낸다. */
const ALERT_CATEGORIES = [
  { id: 'hazard',  ko: '재난',       en: 'Hazards',
    ids: ['cyclone', 'quake', 'tsunami', 'wildfire', 'alerts', 'lightning', 'regional', 'heatdome'] },
];
const ALERT_IDS = new Set(ALERT_CATEGORIES.flatMap(c => c.ids));

/* Windy처럼 자주 쓰는 조합을 한 번에 켜되, earthus는 조합의 성격을 글로 밝힌다.
   ⚠️ 프리셋은 새 자료를 만들지 않는다. 이미 검증된 레이어를 묶는 단축키일 뿐이다.
   ⚠️ 한 프리셋을 적용하면 기존 레이어는 하나씩 끈다. 상태 객체를 통째로 바꾸면
      레이어별 정리 경로가 실행되지 않아 점·선 잔상이 남는다. */
const PRESETS = [
  { id: 'typhoon', ko: '태풍 보기', en: 'Cyclone view',
    sub: '천리안 전면 8km·동아시아 2km · 기관 경로 · 부이 실측', subEn: 'Satellite: full 8 km + E. Asia 2 km · agency tracks · observed buoys',
    /* 전면(gk2aIR)은 상자 밖 태풍까지 남기되, 동아시아 안에서는 2km 타일을
       함께 올린다. 8km 전면만 보이게 두면 한반도 접근 단계에서 판독력이 부족했다. */
    ids: ['gk2aIR', 'cyclone', 'buoy'] },
  { id: 'fire', ko: '산불 보기', en: 'Wildfire view',
    sub: '전지구 구름 · 위성 탐지 · 모델 바람', subEn: 'Clouds · satellite detections · model wind',
    ids: ['clouds', 'wildfire', 'wind'] },
  { id: 'quake', ko: '지진 보기', en: 'Earthquake view',
    sub: '지진 관측 · 쓰나미 경보', subEn: 'Observed quakes · tsunami alerts',
    ids: ['quake', 'tsunami'] },
  { id: 'ocean', ko: '바다 보기', en: 'Ocean view',
    sub: '모델 파고 · 부이 실측', subEn: 'Model waves · observed buoys',
    ids: ['wave', 'buoy'] },
];

/* 일반 기상 격자에는 연속 시간축 자료가 없다. 현재 실황과 내일 하루 최고·최저,
   대표 바람만 있으므로 그 세 상태만 정직하게 빠르게 바꾼다.
   ⚠️ '내일 낮/밤'이라고 쓰지 않는다 — 최고·최저가 발생하는 시각은 지점마다 다르다. */
const TIME_PRESETS = [
  { id: 'wx-now', ko: '지금', en: 'Now', sub: '실황 기온·바람', subEn: 'Observed temp · wind',
    ids: ['temp', 'wind'] },
  { id: 'wx-high', ko: '내일 최고', en: 'Tomorrow high', sub: '일 최고·대표 바람', subEn: 'Daily high · wind',
    ids: ['tmax', 'windfc'] },
  { id: 'wx-low', ko: '내일 최저', en: 'Tomorrow low', sub: '일 최저·대표 바람', subEn: 'Daily low · wind',
    ids: ['tmin', 'windfc'] },
];

/* 빠른 레이어 — 받은 지시(2026-08-06)
   "NOAA 와 수오미, 천리안 2km 밤에도, 히마와리9 이렇게 빠른 레이어로 배치"
   ⚠️ 천리안 동아시아 2km(gk2aIRea)는 맨 앞이었는데 **뒤로 내린다**.
      위성 넷을 나란히 두고 그중 하나로 보이게 하는 것이 지시의 뜻이다.
   2026-08-11 재확인: 빠른 목록은 다른 기상 레이어를 섞지 않고 이 위성 4개만 둔다.
   히마와리는 현재 운용 위성을 분명히 보이도록 화면 이름을 '히마와리9'로 적는다. */
const QUICK_IDS = [
  'clouds',     // 🌐 NOAA GMGSI 전지구 합성
  'truecolor',  // 🇺🇸 수오미 NPP
  /* 🇰🇷 천리안2A 자동 — 낮 가시광/밤 적외, 전면에서 시작해
     동아시아는 같은 채널의 2km 타일로 자세히 보이고,
     한반도로 가까워지면 유효한 낮에만 0.5km 원본 타일을 요청한다. */
  'gk2aAuto',
  'himawari',   // 🇯🇵 히마와리9 — 낮 가시광/밤 적외 자동
];

/* AETHERUS는 반대쪽 레일도, EARTHUS 안의 카테고리도 아니다.
   EARTHUS 바로 아래 독립 손잡이가 이 목록을 같은 2단 패널에 그린다. */
const AETHERUS_ROUTES = [
  { id: 'solar', ko: '오늘의 태양계', en: 'Solar system today' },
  { id: 'photos', ko: '우주 사진관', en: 'Official photo gallery' },
  { id: 'milkyway', ko: '우리은하 이해하기', en: 'Understand the Milky Way' },
  { id: 'galaxies', ko: '우주의 크기', en: 'Scale of the universe' },
];

export const layerBar = {
  open: false,      // 1단
  query: '',
  expertExpanded: false,
  /* 2단 — 어떤 목록을 펼쳤나. null · 'earth'(지구 스타일) · 'alert'(재난)
     ⚠️ 예전엔 불리언이었다. 2단이 하나뿐이라는 전제였는데 Alert 가 생기며 깨졌다.
        DOM(#menuSub)과 CSS 는 그대로 두고 **내용만 갈아끼운다** — 폭·위치 계산이
        --ms-w 하나에 묶여 있어(app.css) 패널을 하나 더 만들면 그것까지 손대야 한다. */
  sub: null,

  init() {
    if (!document.querySelector('link[data-menu-information]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = new URL('../css/menu-information.css?v=20260905', import.meta.url).href;
      style.dataset.menuInformation = 'true';
      document.head.appendChild(style);
    }
    /* AETHERUS 손잡이는 v1 에서 뺐다(2026-09-06 받은 지시). 아래 배선이 널 검사 없이 쓰므로 떼어낸 더미로 받는다. */
    const tab = $('#menuTab'), aetherusTab = $('#aetherusTab') || document.createElement('button');
    if (MENU_BAR) document.body.classList.add('menu-bar');
    const main = $('#menuMain'), sub = $('#menuSub');
    const closeButton = $('#menuClose');

    const apply = () => {
      const aetherusOpen = this.open && this.sub === 'aetherus';
      const earthusOpen = this.open && !aetherusOpen;
      main.classList.toggle('open', earthusOpen);
      /* 2단은 옆이 아니라 **누른 항목 바로 아래**에 펼친다 (2026-09-06 받은 지시).
         #menuSub 를 그 버튼 뒤로 옮기고 inline 로 표시한다. AETHERUS 2단(숨김)은 예전 방식 그대로. */
      const inline = !MENU_BAR && earthusOpen && !!this.sub && this.sub !== 'aetherus';
      const anchor = inline ? main.querySelector(`[data-open="${this.sub}"]`) : null;
      if (inline && anchor) {
        if (!this._subHome) { this._subHome = document.createComment('menuSub-home'); sub.parentNode.insertBefore(this._subHome, sub); }
        if (anchor.nextSibling !== sub) anchor.insertAdjacentElement('afterend', sub);
        sub.classList.add('inline');
      } else if (sub.classList.contains('inline')) {
        sub.classList.remove('inline');
        if (this._subHome?.parentNode) this._subHome.parentNode.insertBefore(sub, this._subHome);
      }
      main.classList.toggle('has-inline', inline);
      document.body.classList.toggle('menu-sub-open', MENU_BAR && this.open && !!this.sub);   // 2단이 떠 있는 동안 온도·출처를 더 올린다 (app.css)
      main.classList.toggle('sub-open', earthusOpen && !!this.sub && !inline);
      sub.classList.toggle('open', this.open && !!this.sub);
      tab.classList.toggle('open', earthusOpen);
      tab.classList.toggle('sub', earthusOpen && !!this.sub && !inline);
      aetherusTab.classList.toggle('open', aetherusOpen);
      /* AETHERUS 패널이 열리면 EARTHUS 손잡이도 패널 왼쪽으로 옮긴다.
         그대로 두면 z29 손잡이가 패널(z28) 오른쪽 위에 떠서 항목을 가리고,
         그 자리를 누르면 메뉴가 갑자기 EARTHUS 로 바뀌었다.
         CSS 인접 형제 선택자로는 앞 형제(menuTab)를 못 잡아 클래스로 처리한다. */
      tab.classList.toggle('beside', aetherusOpen);
      /* 2단을 보는 동안 1단은 모바일에서 화면 밖으로 나가므로, 보조기술에도
         같은 한 장 메뉴만 읽힌다. */
      main.setAttribute('aria-hidden', String(!MENU_BAR && (!earthusOpen || (!!this.sub && !inline))));
      sub.setAttribute('aria-hidden', String(!(this.open && this.sub)));
      /* ⚠️⚠️ aria-hidden 만으로는 **키보드 탭이 그대로 들어간다.** (감사 P2-2)
         화면 밖으로 밀어 둔 메뉴 버튼들이 탭 순서에 남아, 탭을 누르면
         보이지도 않는 것에 포커스가 갔다. inert 가 그걸 통째로 막는다.
         ⚠️ inert 를 모르는 브라우저를 위해 지원 여부를 보고 tabindex 도 함께 끈다. */
      const seal = (el, off) => {
        if ('inert' in HTMLElement.prototype) { el.inert = off; return; }
        el.querySelectorAll('button,a,input,select,textarea,[tabindex]')
          .forEach(n => { if (off) { n.setAttribute('tabindex', '-1'); }
                          else { n.removeAttribute('tabindex'); } });
      };
      /* 모바일에서는 2단이 1단을 완전히 대체한다. 화면 밖의 1단까지 탭으로
         들어가면 사용자가 길을 잃으므로, 2단을 연 동안은 1단도 inert 처리한다. */
      seal(main, !MENU_BAR && (!earthusOpen || (!!this.sub && !inline)));
      seal(sub, !(this.open && this.sub));
      if (inline && anchor) requestAnimationFrame(() => { try { anchor.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) { } });
      tab.setAttribute('aria-expanded', String(earthusOpen));
      aetherusTab.setAttribute('aria-expanded', String(aetherusOpen));
      // 열린 쪽 버튼만 펼침 표시 — 보조기술에도 같은 상태를 알린다
      main.querySelectorAll('[data-open]').forEach(b => {
        b.classList.toggle('open', this.sub === b.dataset.open);
        b.setAttribute('aria-expanded', String(this.sub === b.dataset.open));
        if (!b.hasAttribute('aria-controls')) b.setAttribute('aria-controls', 'menuSub');
      });
    };
    this._apply = apply;

    const closeEarthusMenu = ({ restoreFocus = false } = {}) => {
      if (!this.open) return;
      const wasEarthStyle = this.sub === 'earth';
      this.open = false;
      this.sub = null;
      apply();
      if (wasEarthStyle) {
        document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
          detail: { view: 'earth', reason: 'style-closed' },
        }));
      }
      if (restoreFocus) queueMicrotask(() => tab.focus());
    };

    if (closeButton) {
      closeButton.onclick = () => closeEarthusMenu({ restoreFocus: true });
      closeButton.setAttribute('aria-label', i18n.lang === 'ko' ? '메뉴 닫기' : 'Close menu');
    }

    tab.onclick = () => {
      const wasEarthusOpen = this.open && this.sub !== 'aetherus';
      const wasEarthStyle = this.open && this.sub === 'earth';
      this.open = !wasEarthusOpen;
      if (this.open) document.dispatchEvent(new CustomEvent('earthus:open-menu'));
      /* ⚠️ 열 때도 2단을 접는다. 닫을 때만 접으면 한 번 '지구'를 펼친 뒤로는
         메뉴를 열 때마다 2단이 따라 나온다 — "누르기 전엔 안 보인다"가 깨진다. */
      this.sub = null;
      apply();
      if (wasEarthStyle) {
        document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
          detail: { view: 'earth', reason: 'style-closed' },
        }));
      }
    };
    aetherusTab.onclick = () => {
      const wasAetherusOpen = this.open && this.sub === 'aetherus';
      /* '레이어' 2단에서 갈아탈 때도 다른 닫기 경로와 같이 스타일 보기 상태를
         정리한다 — 빼먹으면 view 가 'style' 로 남아 새로고침 때 저절로 다시 열린다. */
      const wasEarthStyle = this.open && this.sub === 'earth';
      this.open = !wasAetherusOpen;
      this.sub = this.open ? 'aetherus' : null;
      if (this.open) {
        document.dispatchEvent(new CustomEvent('earthus:open-menu'));
        this.render('aetherus');
      }
      apply();
      if (wasEarthStyle) {
        document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
          detail: { view: 'earth', reason: 'style-closed' },
        }));
      }
    };
    document.addEventListener('earthus:close-menu', () => {
      closeEarthusMenu();
    });

    document.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !this.open) return;
      /* 검색(z30)이 메뉴 위에 떠 있으면 Esc 는 검색 몫이다 — 같이 반응하면
         한 번에 두 겹이 사라진다. */
      if (ev.defaultPrevented) return;
      if (document.getElementById('searchBox')?.classList.contains('on')) return;
      ev.preventDefault();
      if (this.sub && this.sub !== 'aetherus') {
        const opener = main.querySelector(`[data-open="${this.sub}"]`);
        /* Esc 로 접는 경로도 다른 닫기 경로처럼 스타일 보기 상태를 정리한다 —
           빼먹으면 view 가 'style' 로 남아 새로고침 때 스타일 메뉴가 저절로 열린다. */
        const wasEarthStyle = this.sub === 'earth';
        this.sub = null;
        apply();
        if (wasEarthStyle) {
          document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
            detail: { view: 'earth', reason: 'style-closed' },
          }));
        }
        queueMicrotask(() => opener?.focus());
        return;
      }
      closeEarthusMenu({ restoreFocus: true });
    });

    /* data-open 을 가진 1단 항목(지구·Alert)은 2단을 토글한다.
       같은 걸 다시 누르면 접히고, 다른 걸 누르면 그쪽으로 갈아탄다. */
    main.querySelectorAll('[data-open]').forEach(b => {
      b.onclick = () => {
        const k = b.dataset.open;
        const wasEarthStyle = this.sub === 'earth';
        this.sub = (this.sub === k) ? null : k;
        if (MENU_BAR) this.open = !!this.sub;   // 하단 바는 늘 보이므로 '열림'은 2단이 떠 있는지만 뜻한다
        /* 2단이 뜨는 자리에 시트(위성·날씨 등)가 떠 있으면 겹친다(받은 지적) — 2단을 열 때 시트는 닫는다. 레이어는 둔다. */
        if (MENU_BAR && this.sub) panels.closeAll();
        if (this.sub === 'earth') {
          this.query = '';
        }
        if (this.sub) this.render(this.sub);
        apply();
        if (this.sub === 'earth') {
          document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
            detail: { view: 'style', reason: 'style-opened' },
          }));
        } else if (wasEarthStyle) {
          /* 다른 2단(Alert 등)으로 갈아탄 것이면 메뉴는 그대로 둔다 — 아래로 펼치는 모드에서 닫히면 갈아타기가 안 된다 */
          document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
            detail: { view: 'earth', reason: 'style-closed', keepMenu: !!this.sub },
          }));
        }
      };
    });

    // 바깥을 누르면 닫는다 — 지구를 조작하려는 것이므로
    document.addEventListener('pointerdown', ev => {
      if (!this.open) return;
      if (tab.contains(ev.target) || aetherusTab.contains(ev.target)
          || main.contains(ev.target) || sub.contains(ev.target)) return;
      const wasEarthStyle = this.sub === 'earth';
      this.open = false; this.sub = null; apply();
      if (wasEarthStyle) {
        document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
          detail: { view: 'earth', reason: 'style-closed' },
        }));
      }
    }, true);

    this._renderQuestionEntries(main, i18n.lang === 'ko');
    this.render();
    const sourceRoot = document.getElementById('srcNote');
    if (sourceRoot && !this._sourceObserver) {
      // Reuse the exact source/time/coverage already shown by ui-source; do not duplicate its registry or fetch data.
      this._sourceObserver = new MutationObserver(() => this._syncSourceContext());
      this._sourceObserver.observe(sourceRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-inline-source'] });
    }
    store.on('layer', () => { this.sync(); this._renderSceneFilter(store.scene); });
    store.on('scene', next => this._renderSceneFilter(next));
    store.on('tier', () => this.render(this.sub || 'earth'));
    i18n.onChange(() => {
      closeButton?.setAttribute('aria-label', i18n.lang === 'ko' ? '메뉴 닫기' : 'Close menu');
      this._renderQuestionEntries(main, i18n.lang === 'ko');
      this.render(this.sub || 'earth');
      this._renderSceneFilter(store.scene);
    });
    this._renderSceneFilter(store.scene);
    apply();
    return this;
  },

  canOpenLayer(id) {
    const item = ITEMS.find(entry => entry.id === id);
    const def = LAYER_DEFS.find(entry => entry.id === id);
    return !!item && item.ready === true && !!def && !def.blocked && store.canUse(def);
  },

  showEarthStyle() {
    this.open = true;
    this.sub = 'earth';
    this.query = '';
    this.render('earth');
    this._apply?.();
  },

  closeMenus() {
    this.open = false;
    this.sub = null;
    this._apply?.();
  },

  _renderQuestionEntries(main, ko) {
    if (!main || V1_LEAN) return;   // v1 정리: 질문 항목이 여는 화면(기상청·취미·여행·하늘)이 숨겨졌다
    main.querySelector('.mm-questions')?.remove();
    const section = el('section', 'mm-questions');
    const title = el('h2', 'mm-question-title');
    title.textContent = ko ? '무엇이 궁금한가요?' : 'What would you like to know?';
    section.appendChild(title);
    QUESTION_ENTRIES.forEach(entry => {
      const button = el('button', 'mm-question');
      button.type = 'button';
      button.dataset.question = entry.id;
      const label = el('b'); label.textContent = ko ? entry.ko : entry.en;
      const sub = el('small'); sub.textContent = ko ? entry.subKo : entry.subEn;
      button.append(label, sub);
      button.onclick = () => this._openQuestion(entry.id, button);
      section.appendChild(button);
    });
    this._mountSelection(section, ko);
    // 기존 메뉴(지구 보기·읽고 분석…)가 먼저, 질문 항목은 그 뒤에(2026-09-06 요청).
    main.appendChild(section);
  },

  async _openQuestion(id, button) {
    if (button) button.disabled = true;
    try {
      document.dispatchEvent(new CustomEvent('earthus:close-menu'));
      this.leave({ keep: QUESTION_KEEP[id] || null });
      await openQuestionEntry(id, {
        weather: async () => (await import('./ui-korea.js?v=20260814-n5')).koreaPanel.open(),
        alerts: async () => {
          const { eventPanel } = await import('./ui-events.js');
          eventPanel.mode = 'alert'; eventPanel.show = 'warn'; eventPanel.open();
        },
        ocean: async () => {
          (await import('./ui-outdoor.js')).outdoorPanel.open();
          document.querySelector('#outBody [data-out-group="ocean-activity"]')?.scrollIntoView({ block: 'start' });
        },
        travel: async () => (await import('./ui-travel-discovery.js?v=20260903-travel-discovery')).travelSheet.open(),
        sky: async () => (await import('./ui-sky.js')).skyPanel.open(),
      });
    } catch (error) {
      console.warn('[layerbar] question entry', id, error?.message || error);
      toast(i18n.lang === 'ko' ? '정보 화면을 열지 못했습니다. 메뉴에서 다시 시도해 주세요.' : 'Could not open this view. Please try again from the menu.');
    } finally { if (button) button.disabled = false; }
  },

  _mountSelection(parent, ko) {
    const section = el('section', 'ly-selection');
    const active = el('details', 'ly-selection-active');
    active.append(el('summary'), el('div', 'ly-selection-controls'));
    const clear = el('button', 'ly-clear'); clear.type = 'button';
    clear.onclick = () => {
      const n = clearSelectedLayers(LAYER_DEFS, store);
      toast(ko ? `켜진 정보 ${n}개를 껐습니다` : `Cleared ${n} layers`);
      section.querySelector('summary')?.focus();
    };
    const source = el('details', 'ly-selection-source');
    const summary = el('summary'); summary.textContent = ko ? '지도 출처·시각·범위' : 'Map sources, times & coverage';
    source.append(summary, el('div', 'ly-source-content'));
    section.append(active, clear, source);
    parent.appendChild(section);
  },

  _syncSelection() {
    const ko = i18n.lang === 'ko';
    const active = LAYER_DEFS.filter(def => store.isOn(def.id));
    document.querySelectorAll('#menuMain .ly-selection, #layerStrip .ly-selection').forEach(section => {
      section.querySelector('.ly-selection-active > summary').textContent = ko ? `현재 켠 정보 ${active.length}개` : `${active.length} layers on`;
      const controls = section.querySelector('.ly-selection-controls');
      controls.replaceChildren();
      active.forEach(def => {
        const item = ITEMS.find(it => it.id === def.id);
        const name = (ko ? item?.ko : item?.en) || i18n.t.L?.[def.id] || def.id;
        const off = el('button'); off.type = 'button';
        off.textContent = `${name} ×`;
        off.setAttribute('aria-label', ko ? `${name} 끄기` : `Turn off ${name}`);
        off.onclick = () => { store.setLayer(def.id, false); section.querySelector('summary')?.focus(); };
        controls.appendChild(off);
      });
      const clear = section.querySelector('.ly-clear');
      clear.textContent = ko ? '켜진 정보 모두 끄기' : 'Clear all layers';
      clear.disabled = active.length === 0;
    });
    this._syncSourceContext();
  },

  _syncSourceContext() {
    const source = document.getElementById('srcNote');
    document.querySelectorAll('#menuMain .ly-source-content, #layerStrip .ly-source-content').forEach(content => {
      const lines = source?.classList.contains('on') ? [...source.querySelectorAll(':scope > span')] : [];
      content.replaceChildren(...lines.map(line => line.cloneNode(true)));
      if (!lines.length) content.textContent = i18n.lang === 'ko'
        ? '지도의 자료 안내를 기다리는 중입니다. 수신된 출처·시각·범위가 이곳에도 표시됩니다.'
        : 'Waiting for the map data note. Received sources, times and coverage appear here.';
    });
  },

  _renderSceneFilter(next = 'earth') {
    const main = $('#menuMain');
    if (!main) return;
    const away = next === 'space';
    const space = next === 'space';

    /* EARTHUS는 우주에서도 전체 메뉴를 유지한다. 장면이 브랜드를 바꾸거나
       지구로 돌아가는 길을 숨기면 두 세계가 한 공간이라는 구조가 끊긴다. */
    const hiddenAway = [];
    const sceneFiltered = [
      '[data-open="earth"]', '[data-open="travel"]', '[data-act="sat"]', '[data-act="flight"]',
      '[data-act="outdoor"]', '[data-act="earth-home"]', '[data-act="earth-surface"]',
      '[data-act="locate"]', '[data-act="globe"]',
    ];
    sceneFiltered.forEach(selector => {
      const button = main.querySelector(selector);
      if (button) button.hidden = hiddenAway.includes(selector);
    });
    const activeEarthRoute = store.sceneStage === 'surface' ? 'earth-surface'
      : store.sceneStage === 'earth' ? 'earth-home' : null;
    main.querySelectorAll('.mm-earth-route').forEach(item => {
      item.classList.toggle('on', !space && item.dataset.act === activeEarthRoute);
    });

    // 지구 레이어 2단이 열린 채 장면을 떠나면 빈 맥락의 패널을 남기지 않는다.
    if (away && this.sub === 'earth') {
      this.sub = null;
      this._apply?.();
    }
  },

  /** 메뉴 이동 규칙 — 파일 머리의 leaveMenus 참고. main.js 등 바깥에서도 부를 수 있다. */
  leave(opts) { return leaveMenus(opts); },

  /** 1단 항목의 동작을 바깥(main.js)에서 붙인다 */
  onAction(name, fn) {
    const b = document.querySelector(`#menuMain [data-act="${name}"]`);
    if (b) b.onclick = () => { this.leave(ACTION_SHEET_ONLY.has(name) ? { layers: false } : { keep: ACTION_KEEP[name] || null }); fn(); this.open = false; this.sub = null; this._apply(); };
  },

  /** 2단 목록을 그린다. kind: 'earth'(레이어) | 'travel'(여행) | 'alert'(재난) | 'aetherus'(우주) */
  render(kind = 'earth') {
    const strip = $('#layerStrip');
    if (!strip) return;
    strip.innerHTML = '';
    const ko = i18n.lang === 'ko';
    const isAlert = kind === 'alert';
    const isTravel = kind === 'travel';
    const isAetherus = kind === 'aetherus';
    strip.classList.toggle('aetherus-menu-list', isAetherus);
    document.querySelector('#menuSub')?.classList.toggle('aetherus-open', isAetherus);
    /* 2026-09-06 받은 지시: "전체레이어는 오른쪽에 — 윈디처럼 아이콘과 설명글이 나오게. 하단 메뉴는 그대로."
       하단 바 모드에서 레이어 목록만 오른쪽 세로 판(#menuSub.layers-right, app.css 끝)이 되고,
       Alert·여행은 바 위의 가로 칩 줄 그대로다. 항목 구조(.ly 캔버스·이름·설명)는 건드리지 않는다 — CSS 로만 편다. */
    document.querySelector('#menuSub')?.classList.toggle('layers-right', MENU_BAR && !isAlert && !isTravel && !isAetherus);

    // 머리글은 목록에 따라 바뀐다 (DOM 은 하나를 돌려 쓴다)
    const head = $('#menuSub .ms-head');
    /* ⚠️ '지구 스타일'이라 부르던 것을 '레이어'로 바꿨다. (감사 3차)
       안에 기온·바람·대기질·바다·관측소가 다 들어 있는데 '스타일'이라고 하면
       테마를 고르는 곳처럼 읽힌다 — 실제 이름은 레이어가 맞다. */
    if (head) head.textContent = isAetherus ? 'AETHERUS'
      : isAlert ? (ko ? '경보·재난' : 'Alerts')
        : isTravel ? (ko ? '여행' : 'Travel') : (ko ? '레이어' : 'Layers');

    if (isAetherus) {
      this._renderAetherus(strip, ko);
      return;
    }
    this._mountSelection(strip, ko);

    /* 묶음별로 제목을 두고 그 아래에 항목을 놓는다.
       ⚠️ CATEGORIES 에 없는 항목이 생기면 조용히 사라지므로 마지막에 모아 붙인다.
          단 Alert 로 옮긴 것들(ALERT_IDS)은 여기서 제외한다 — 안 그러면
          '그 밖에'로 수거돼 지구 스타일에 그대로 다시 나타난다. */
    const placed = new Set();
    const order = [];
    (isAlert ? ALERT_CATEGORIES : isTravel ? TRAVEL_CATEGORIES : CATEGORIES).forEach(c => {
      const items = c.ids.map(id => ITEMS.find(x => x.id === id)).filter(Boolean);
      if (!items.length) return;
      items.forEach(x => placed.add(x.id));
      order.push({ cat: c, items });
    });
    /* v1 정리: 목록에서 뺀 항목이 '그 밖에'로 되살아나면 안 된다 → V1_LEAN 이면 수거하지 않는다 */
    if (!isAlert && !isTravel && !V1_LEAN) {
      const rest = ITEMS.filter(x => !placed.has(x.id) && !ALERT_IDS.has(x.id));
      if (rest.length) {
        order.push({ cat: { id: 'etc', ko: '그 밖에', en: 'Other' }, items: rest });
      }
    }

    /* ⚠️ 묶음 이름은 적지 않는다 (받은 요청).
       대신 묶음 사이에 옅은 구분선만 둔다 — 순서로 묶임이 읽히면 충분하고,
       제목이 33종 위에 아홉 줄 더 얹히면 목록이 더 길어진다. */
    /* ⚠️ Alert 목록 맨 위에 **지금 일어난 일** 입구를 둔다 (받은 요청).
       아래 항목들은 "지도에 무엇을 켤까"고, 이건 "무슨 일이 났나"다.
       예전엔 1단의 '이벤트' 메뉴가 이 일을 했는데 News 와 같은 패널을 여는
       문 두 개였다 → 그 메뉴를 없애고 여기로 넣었다. */
    if (isAlert) {
      const go = el('button', 'ly-open');
      go.type = 'button';
      /* ⚠️ 이 파일의 `el(t, c)` 는 **인자가 둘뿐이다** — 다른 파일의 el(t,c,html) 과 다르다.
         세 번째로 글을 넘겼더니 **조용히 버려져 빈 버튼**이 나왔다. innerHTML 로 넣는다. */
      go.innerHTML = `<span class="ly-open-copy">`
        + `<b>${ko ? '지금 일어난 일' : "What's happening"}</b>`
        + `<em>${ko ? '지진 · 쓰나미 · 태풍 · 산불 · 경보' : 'Quakes, tsunami, storms, fires'}</em>`
        + `</span><span class="ly-open-arrow" aria-hidden="true">›</span>`;
      go.onclick = async () => {
        /* ⚠️ 여기서 `this.close()` 를 불렀다가 조용히 터졌다 —
           **layerBar 에는 close() 가 없다.** onclick 이 async 라 그 오류가
           삼켜져서 "눌러도 아무 일이 없다"로만 보였다.
           메뉴는 바깥 눌림 감지가 알아서 닫는다. 손대지 않는다. */
        try {
          const { eventPanel } = await import('./ui-events.js');
          this.leave({ keep: 'hazard' });
          eventPanel.mode = 'alert';
          eventPanel.show = 'warn';
          eventPanel.open();
        } catch (e) {
          console.warn('[layerbar] 지금 일어난 일을 못 열었습니다', e.message);
        }
      };
      strip.appendChild(go);

      /* Windy류 앱에서 즐겨찾기와 알림은 지도 레이어와 별개인 핵심 동작이다.
         earthus도 이미 저장 지점 기반 웹푸시가 있었지만 설정 맨 아래에만 있어
         Alert 메뉴를 연 사람조차 찾기 어려웠다. 레이어처럼 켜는 스위치로 섞지 않고,
         위의 현황 화면과 나란한 '다른 화면을 여는 줄'로 분명히 구분한다.
         ⚠️ '현재 위치 알림'이라고 쓰지 않는다 — 앱이 닫히면 위치를 추적하지 않으며
         알림은 사용자가 저장한 지점 기준이다 (ui-alerts.js의 안전 원칙). */
      const watch = el('button', 'ly-open ly-open--watch');
      watch.type = 'button';
      watch.innerHTML = `<span class="ly-open-copy">`
        + `<b>${ko ? '지켜볼 곳 · 알림 설정' : 'Saved places & alerts'}</b>`
        + `<em>${ko ? '저장한 장소 기준 · 안전 알림은 무료' : 'For saved places · safety alerts are free'}</em>`
        + `</span><span class="ly-open-arrow" aria-hidden="true">›</span>`;
      watch.onclick = async () => {
        try {
          const { alertsSheet } = await import('./ui-alerts.js');
          this.open = false;
          this.sub = null;
          this._apply?.();
          this.leave({ keep: 'hazard' });
          alertsSheet.open();
        } catch (e) {
          console.warn('[layerbar] 알림 설정을 못 열었습니다', e.message);
        }
      };
      strip.appendChild(watch);
      strip.appendChild(el('div', 'ly-gap'));
    }

    if (!isAlert && !isTravel && !V1_LEAN) {   // v1 정리: 기상청 라이브·시간 전환·한 번에 보기 숨김
      /* 받은 지적: 기상청 자료는 이미 9개 수집기가 살아 있는데 날씨 상세의 작은 링크
         뒤에 숨어 있어 업데이트가 사용자 눈에는 '별거 없음'으로 보였다. 데이터 레이어와
         성격이 다른 관측·공식예보·특보 탐색판이므로 스위치가 아닌 공개 입구로 둔다. */
      const kma = el('button', 'ly-open ly-open--kma');
      kma.type = 'button';
      kma.innerHTML = `<span class="ly-open-copy"><b>${ko ? '기상청 라이브' : 'KMA Live'}</b>`
        + `<em>${ko ? '736개 실측 · 5일 공식예보 · 레이더 · 특보 · 상층 · 바다' : '736 observations · 5-day forecast · radar · warnings · upper air · sea'}</em>`
        + `</span><span class="ly-open-arrow" aria-hidden="true">›</span>`;
      kma.onclick = async () => {
        try {
          const { koreaPanel } = await import('./ui-korea.js?v=20260814-n5');
          this.open = false; this.sub = null; this._apply?.();
          this.leave({ keep: 'weather' });
          koreaPanel.open();
        } catch (error) {
          console.warn('[layerbar] 기상청 라이브를 못 열었습니다', error?.message || error);
        }
      };
      strip.appendChild(kma);
      strip.appendChild(el('div', 'ly-gap'));

      const times = el('section', 'ly-times');
      const timeHead = el('div', 'ly-time-head');
      timeHead.textContent = ko ? '시간 빠른 전환' : 'Time shortcuts';
      times.appendChild(timeHead);
      TIME_PRESETS.forEach(p => {
        const b = el('button', 'ly-time');
        b.type = 'button'; b.dataset.timePreset = p.id;
        b.innerHTML = `<b>${ko ? p.ko : p.en}</b><span>${ko ? p.sub : p.subEn}</span>`;
        b.onclick = () => this.applyWeatherTime(p);
        times.appendChild(b);
      });
      const timeNote = el('p', 'ly-time-note');
      timeNote.textContent = ko
        ? '기온·바람만 바꿉니다. 내일은 시간별 지도가 아니라 하루 최고·최저 요약입니다.'
        : 'Changes temp and wind only. Tomorrow is a daily summary, not an hourly map.';
      times.appendChild(timeNote);
      strip.appendChild(times);
      strip.appendChild(el('div', 'ly-gap'));

      const presets = el('section', 'ly-presets');
      const title = el('div', 'ly-preset-head');
      title.textContent = ko ? '한 번에 보기' : 'Quick combinations';
      presets.appendChild(title);
      PRESETS.forEach(p => {
        const b = el('button', 'ly-preset');
        b.type = 'button'; b.dataset.preset = p.id;
        b.innerHTML = `<b>${ko ? p.ko : p.en}</b><span>${ko ? p.sub : p.subEn}</span>`;
        b.onclick = () => this.applyPreset(p);
        presets.appendChild(b);
      });
      strip.appendChild(presets);
      strip.appendChild(el('div', 'ly-gap'));
    }

    if (isTravel) {
      const intro = el('p', 'ly-purpose-intro');
      intro.textContent = ko
        ? '관광 밀도와 명소를 여행 목적에 맞게 빠르게 켭니다.'
        : 'Turn on tourism density and places from a travel-focused entrance.';
      strip.appendChild(intro);
      // 레이어를 켜는 것과 "오늘 어디 갈까"는 다른 질문이다. 후자는 시트로 연다.
      const discover = el('button', 'ly-purpose-item ly-purpose-discover');
      discover.type = 'button';
      discover.innerHTML = `<b>${ko ? '오늘 발견' : 'Discover today'}</b>`
        + `<small>${ko ? '시군구 228곳 · 근거와 제외 사유를 함께' : '228 districts, with evidence and exclusions'}</small>`;
      discover.addEventListener('click', () => {
        import('./ui-travel-discovery.js?v=20260903-travel-discovery')
          .then(({ travelSheet }) => { this.leave({ keep: ['travel', 'human'] }); travelSheet.open(); });
      });
      strip.appendChild(discover);
      order.flatMap(group => group.items).forEach(it => this._item(strip, it, ko, 'ly-purpose-item'));
      const note = el('p', 'ly-purpose-note');
      note.textContent = ko
        ? '여행에서 켠 레이어는 지구 레이어와 같은 상태를 사용합니다.'
        : 'Layers enabled here use the same state as Earth layers.';
      strip.appendChild(note);
    } else if (isAlert) {
      order.forEach(({ items }, i) => {
        if (i) strip.appendChild(el('div', 'ly-gap'));
        items.forEach(it => this._item(strip, it, ko));
      });
    } else {
      const orderedItems = [...QUICK_IDS.map(id => ITEMS.find(x => x.id === id)).filter(Boolean), ...order.flatMap(x => x.items)];
      const groups = partitionLayerItems(orderedItems, QUICK_IDS);
      const qh = el('div', 'ly-section-head');
      qh.textContent = ko ? '빠른 레이어' : 'Quick layers';
      strip.appendChild(qh);
      groups.quick.forEach(it => this._item(strip, it, ko, 'ly-quick-item'));

      const search = el('label', 'ly-search');
      search.innerHTML = `<input type="search" aria-label="${ko ? '전체 레이어 검색' : 'Search all layers'}"`
        + ` value="${this.query.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
        + ` placeholder="${ko ? '이름·설명·지역 검색' : 'Search name, description, coverage'}" autocomplete="off">`
        + `<span class="ly-search-count" role="status" aria-live="polite"></span>`;
      const input = search.querySelector('input');
      input.oninput = () => { this.query = input.value; this._filterAll(strip); };
      strip.prepend(search);
      groups.regular.forEach(it => this._item(strip, it, ko, 'ly-all-item'));
      if (groups.expert.length) {   // v1 정리: 전문 채널이 없으면 빈 접이식을 그리지 않는다
      const expert = el('details', 'ly-expert');
      expert.open = this.expertExpanded;
      const summary = el('summary'); summary.textContent = ko ? `위성 전문 채널 ${groups.expert.length}개` : `${groups.expert.length} satellite channels`;
      const intro = el('p', 'ly-expert-note'); intro.textContent = ko ? '적외·가시광·수증기와 관측 범위를 직접 고릅니다.' : 'Choose infrared, visible and water-vapour channels and their coverage.';
      const expertItems = el('div', 'ly-expert-items');
      groups.expert.forEach(it => this._item(expertItems, it, ko, 'ly-all-item'));
      expert.append(summary, intro, expertItems);
      expert.ontoggle = () => { if (!this.query.trim()) this.expertExpanded = expert.open; };
      strip.appendChild(expert);
      }
      this._filterAll(strip);
    }
    this.sync();
  },

  _renderAetherus(strip, ko) {
    const intro = el('p', 'aetherus-menu-intro');
    intro.textContent = ko
      ? '지구를 도는 것들과 공식 관측 사진, 태양계·우리은하·우주의 크기를 봅니다.'
      : 'What orbits Earth, plus official observations, the Solar System and the scale of the universe.';
    strip.appendChild(intro);

    /* 궤도 인텔리전스 — 세 지구가 함께 쓰는 정본 AETHERUS.
       ⚠️ 아래 네 줄과 성격이 다르다. 그것들은 우주 장면으로 **가는 문**이고,
          이건 지금 보고 있는 지구 위에 켜는 **겹**이다. 그래서 스위치로 둔다.
       위치는 서버 SGP4 스냅샷에서 오고, 낡으면 코어가 알아서 그리지 않는다. */
    const orbit = el('button', 'aetherus-route aetherus-orbit');
    orbit.type = 'button';
    const paintOrbit = (note) => {
      orbit.classList.toggle('current', !!note);
      orbit.setAttribute('aria-pressed', note ? 'true' : 'false');
      orbit.innerHTML = '<span>'
        + `<b>${ko ? '궤도 인텔리전스' : 'Orbital intelligence'}</b>`
        + `<small>${note || (ko ? '우주쓰레기 · 정본 카탈로그 · 근접사건' : 'Space debris · canonical catalogue · conjunctions')}</small>`
        + '</span><i aria-hidden="true">◈</i>';
    };
    paintOrbit(null);
    orbit.onclick = async () => {
      orbit.disabled = true;
      try {
        const { aetherusOrbit } = await import('./ui-aetherus.js');
        await aetherusOrbit.toggle();
        paintOrbit(aetherusOrbit.note());
      } catch (error) {
        console.warn('[layerbar] AETHERUS 궤도 레이어를 열지 못했습니다', error?.message || error);
        toast(ko ? '궤도 인텔리전스를 열지 못했습니다' : 'Could not open orbital intelligence');
      } finally { orbit.disabled = false; }
    };
    strip.appendChild(orbit);
    strip.appendChild(el('div', 'ly-gap'));

    AETHERUS_ROUTES.forEach(route => {
      const button = el('button', 'aetherus-route');
      button.type = 'button';
      button.dataset.aetherusRoute = route.id;
      const active = (route.id === store.sceneStage && store.scene === 'space')
        || (route.id === 'galaxy-structure' && store.scene === 'space' && store.sceneStage === 'milkyway');
      button.classList.toggle('current', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
      button.innerHTML = `<span><b>${ko ? route.ko : route.en}</b><small>${ko ? route.en : route.ko}</small></span>`
        + (route.count ? `<em>${route.count}</em>` : '<i aria-hidden="true">›</i>');
      button.onclick = () => {
        this.open = false;
        this.sub = null;
        this._apply?.();
        this.leave();
        document.dispatchEvent(new CustomEvent('aetherus:route', { detail: route.id }));
      };
      strip.appendChild(button);
    });
  },

  /** 항목 하나 */
  _item(strip, it, ko, extraClass = '') {
    {
      const def = LAYER_DEFS.find(d => d.id === it.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ly';
      if (extraClass) b.classList.add(extraClass);
      b.dataset.id = it.id;
      b.dataset.search = `${it.ko} ${it.en} ${it.sub || ''} ${it.subEn || ''}`.toLocaleLowerCase();

      /* ⚠️⚠️ 위성 그림이 있으면 **캔버스 대신 그림**을 쓴다.
         받은 요청: "지금 위성 동그라미는 아무것도 없이 그냥 원이야
                    차라리 위성 이미지를 넣자"
         ⚠️ drawThumb 안에서 그리지 않는 이유: 캔버스 그리기는 **그 자리에서 끝나는데**
            그림은 나중에 도착한다. 캔버스에 그리려면 도착을 기다렸다 다시 그려야 하고,
            이 앱은 '변할 때만 그리는' 모드라 그 다시 그리기를 또 요청해야 한다.
            그림 태그로 두면 브라우저가 알아서 한다. */
      if (it.img) {
        const im = document.createElement('img');
        im.className = 'ly-sat';
        im.src = it.img;
        im.alt = '';                       // ⚠️ 이름은 옆에 글자로 있다. 두 번 읽히면 안 된다
        im.loading = 'lazy';
        b.appendChild(im);
      } else {
        const cv = document.createElement('canvas');
        drawThumb(cv, it.paint);
        b.appendChild(cv);
      }

      const n = document.createElement('div');
      n.className = 'ly-name';
      /* ⚠️ 국기를 이름 문자열에 섞지 않는다 — 통합 검색(search.js)이 이 표의
         ko/en 으로 이름을 찾기 때문에, 섞으면 "천리안"으로 검색이 안 된다. */
      if (it.flag) {
        const fl = document.createElement('span');
        fl.className = 'ly-flag'; fl.textContent = it.flag;
        fl.setAttribute('aria-hidden', 'true');
        n.appendChild(fl);
      }
      n.appendChild(document.createTextNode(ko ? it.ko : it.en));
      const s2 = document.createElement('div');
      s2.className = 'ly-sub'; s2.textContent = ko ? it.sub : it.subEn;
      b.append(n, s2);

      if (it.open) {
        b.classList.add('open');
        b.onclick = async () => {
          try {
            this.open = false; this.sub = null; this._apply?.();
            this.leave({ keep: groupsOfLayer(it.id) });
            if (it.open === 'flight') {
              const { flightPanel } = await import('./ui-flight.js');
              await flightPanel.open();
            } else if (it.open === 'vessel') {
              const { oceanPanel } = await import('./ui-ocean.js?v=20260821-v8p3-1');
              oceanPanel.open('vessel');
            }
          } catch (error) {
            console.warn(`[layerbar] ${it.open} 화면을 못 열었습니다`, error?.message || error);
            toast(ko ? '화면을 열지 못했습니다' : 'Could not open this view');
          }
        };
        strip.appendChild(b);
        return;
      }

      if (!it.ready || !def || def.blocked) {
        b.classList.add('blocked');
        b.onclick = () => toast(ko ? '아직 준비 중입니다' : 'Coming soon');
      } else if (!store.canUse(def)) {
        /* 잠긴 레이어를 누르면 토스트 한 줄만 뜨고 끝이었다.
           "구독하고 열기"라고 써놓고 열 방법을 안 주면 안내가 아니다. */
        b.classList.add('locked');
        b.onclick = async () => {
          /* ⚠️ 구독을 감춰 둔 동안에는 "구독하면 열린다"고 말하면 안 된다.
             열 방법이 없는데 열 수 있다고 하는 셈이다. 준비 중이라고만 한다. */
          if (!CONFIG.SHOW_SUBSCRIBE) {
            toast(ko ? `${it.ko}는 아직 준비 중입니다` : `${it.en} is coming soon`);
            return;
          }
          const { subscribeSheet } = await import('./ui-subscribe.js');
          subscribeSheet.open(ko
            ? `${it.ko}는 구독하시면 볼 수 있습니다.`
            : `${it.en} is available with a subscription.`);
        };
      } else {
        b.onclick = () => { if (!store.isOn(it.id)) this.leave({ keep: groupsOfLayer(it.id) }); store.toggle(it.id); };
      }
      strip.appendChild(b);
    }
  },

  _filterAll(strip) {
    const q = this.query.trim().toLocaleLowerCase();
    const buttons = [...strip.querySelectorAll('.ly-all-item, .ly-quick-item')];
    buttons.forEach(b => {
      b.hidden = !matchesLayerQuery(b.dataset.search, q);
    });
    strip.querySelectorAll(':scope > .ly-open, :scope > .ly-times, :scope > .ly-presets, :scope > .ly-gap, :scope > .ly-section-head')
      .forEach(node => { node.hidden = !!q; });
    const expert = strip.querySelector('.ly-expert');
    if (expert) {
      const matches = [...expert.querySelectorAll('.ly-all-item')].some(b => !b.hidden);
      expert.hidden = !!q && !matches;
      expert.open = q ? matches : this.expertExpanded;
    }
    const none = strip.querySelector('.ly-search-empty') || el('p', 'ly-search-empty');
    const count = buttons.filter(b => !b.hidden).length;
    const visible = count > 0;
    const counter = strip.querySelector('.ly-search-count');
    if (counter) counter.textContent = i18n.lang === 'ko' ? `${count}개 정보${q ? ' 검색됨' : ' · 전문 채널 포함'}` : `${count} layers${q ? ' found' : ', including expert channels'}`;
    none.textContent = i18n.lang === 'ko' ? '일치하는 레이어가 없습니다.' : 'No matching layers.';
    if (!visible && !none.isConnected) strip.appendChild(none);
    if (visible) none.remove();
  },

  sync() {
    document.querySelectorAll('#layerStrip .ly').forEach(b => {
      b.classList.toggle('on', store.isOn(b.dataset.id));
      if (!b.classList.contains('open')) b.setAttribute('aria-pressed', String(store.isOn(b.dataset.id)));
    });
    document.querySelectorAll('#layerStrip .ly-preset').forEach(b => {
      const p = PRESETS.find(x => x.id === b.dataset.preset);
      const on = !!p && p.ids.every(id => store.isOn(id));
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('#layerStrip .ly-time').forEach(b => {
      const p = TIME_PRESETS.find(x => x.id === b.dataset.timePreset);
      const on = !!p && p.ids.every(id => store.isOn(id));
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    this._syncSelection();
  },

  applyWeatherTime(preset) {
    const ids = new Set(preset.ids);
    /* 다른 바탕·관측소는 그대로 두고 시간에 따라 바뀌는 기온·바람만 교체한다.
       전체 프리셋 applyPreset을 쓰면 부이·구름까지 꺼져 '시간만 바꿨는데 화면이
       초기화됐다'가 된다. */
    this.leave({ layers: false });
    ['temp', 'tmax', 'tmin', 'wind', 'windfc'].forEach(id => {
      if (!ids.has(id) && store.isOn(id)) store.setLayer(id, false);
    });
    preset.ids.forEach(id => {
      if (!store.isOn(id)) store.setLayer(id, true);
    });
    document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
      detail: { view: 'data', layer: preset.ids[0], reason: 'time-preset' },
    }));
    this.open = false; this.sub = null; this._apply?.();
    toast(i18n.lang === 'ko'
      ? `${preset.ko} 기온·바람으로 바꿨습니다`
      : `Switched to ${preset.en.toLowerCase()} temperature and wind`);
  },

  applyPreset(preset) {
    const target = new Set(preset.ids);
    /* ⚠️ 끄기부터 한다. 격자·바탕 배타 그룹의 교대 순서가 뒤집히면 짧게 두 장이
       겹쳐 보일 수 있다. 모든 변경은 setLayer를 지나 정리 이벤트를 보낸다. */
    this.leave({ layers: false });
    LAYER_DEFS.forEach(d => {
      if (!target.has(d.id) && store.isOn(d.id)) store.setLayer(d.id, false);
    });
    preset.ids.forEach(id => {
      if (!store.isOn(id)) store.setLayer(id, true);
    });
    document.dispatchEvent(new CustomEvent('earthus:earth-view-intent', {
      detail: { view: 'data', layer: preset.ids[0], reason: 'layer-preset' },
    }));
    this.open = false; this.sub = null; this._apply?.();
    toast(i18n.lang === 'ko' ? `${preset.ko} 조합을 켰습니다` : `${preset.en} enabled`);
  },
};
