// 오른쪽 2단 메뉴 — 1단은 큰 갈래, 2단은 지구 스타일
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
import { LAYER_DEFS, TIER } from './config.js';
import { i18n } from './i18n.js';
import { toast } from './ui.js';

const $ = s => document.querySelector(s);
const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };

/* 표시할 레이어. sub 은 "현재/예보" 같은 시제 표시다.
   ready:false 는 데이터가 아직 없는 것 — 회색으로 보이고 누르면 안내만 뜬다. */
const ITEMS = [
  /* 오늘 찍힌 실사 위성 영상. 기본 지도는 정지 사진이라 연기·황사가 안 보인다. */
  { id:'truecolor', ko:'실제 위성 영상', en:'Satellite view', sub:'낮면 · 최근 완전한 날', subEn:'Day side · latest full day',
    ready:true, sky:'#0a1420', paint:'truecolor' },
  { id:'himawari', ko:'구름 (동아시아)', en:'Clouds (E. Asia)', sub:'1km · 10분', subEn:'1 km · 10 min', ready:true,
    sky:'#0a1626', paint:'himawari' },
  { id:'himaIR', ko:'구름 꼭대기 온도', en:'Cloud-top temp', sub:'동아시아 · 찰수록 강한 대류', subEn:'E. Asia · colder = stronger', ready:true,
    sky:'#0d1020', paint:'himawari' },
  { id:'clouds', ko:'구름', en:'Clouds', sub:'현재', subEn:'Now', ready:true,
    sky:'#0b1a2e', paint:'cloud' },
  { id:'temp', ko:'기온', en:'Temperature', sub:'현재', subEn:'Now', ready:true,
    sky:'#101820', paint:'temp' },
  { id:'wind', ko:'바람', en:'Wind', sub:'현재', subEn:'Now', ready:true,
    sky:'#0d1622', paint:'wind' },
  { id:'humidity', ko:'습도', en:'Humidity', sub:'현재', subEn:'Now', ready:true,
    sky:'#0a1720', paint:'humid' },
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
  { id:'lightning', ko:'낙뢰 (한국)', en:'Lightning (Korea)', sub:'최근 1시간 · 실측', subEn:'Last hour · observed', ready:true,
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
  { id:'wave', ko:'파고', en:'Waves', sub:'유의파고', subEn:'Significant height', ready:true,
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

  /* 지상 관측소 — 부이의 육지판. 실제 계기의 실황이다. */
  { id:'landobs', ko:'지상 관측소', en:'Ground stations', sub:'실황 관측', subEn:'Live readings', ready:true,
    sky:'#0d1a12', paint:'landobs' },
  /* 영국 예보 — 부제에 '예보'를 반드시 남긴다.
     바로 위 '지상 관측소'가 실황이라, 둘을 구분하지 않으면 사용자가 섞어 읽는다. */
  { id:'ukfc', ko:'영국 예보', en:'UK forecast', sub:'영국 기상청 · 36곳', subEn:'Met Office · 36 sites', ready:true,
    sky:'#0c1622', paint:'ukfc' },
  /* ⚠️ 이건 자료를 보여주는 레이어가 아니라 **자료가 없는 곳**을 보여주는 레이어다. */
  { id:'coverage', ko:'관측망 밀도', en:'Observation coverage', sub:'빈 곳 찾기', subEn:'Where nobody looks', ready:true,
    sky:'#0a0e14', paint:'coverage' },

  { id:'buoy', ko:'해양 부이', en:'Buoys', sub:'파고·수온', subEn:'Waves', ready:true,
    sky:'#06121a', paint:'buoy' },
  { id:'eclipse', ko:'일식', en:'Eclipse', sub:'예정', subEn:'Upcoming', ready:true,
    sky:'#0a0a10', paint:'eclipse' },
  /* 열돔·환류는 예전에 목록에 없어서 끌 방법이 없었다.
     ⚠️ 특히 열돔은 반경 수백 km 반투명 면이라 켜져 있으면 다른 걸 보기 어렵다.
        "끄고 싶은데 끌 곳이 없다"는 건 레이어를 만들어놓고 안 만든 것과 같다. */
  { id:'heatdome', ko:'열돔', en:'Heat dome', sub:'감지', subEn:'Detected', ready:true,
    sky:'#1a0e06', paint:'heatdome' },
  { id:'phenomena', ko:'해양 환류', en:'Ocean gyres', sub:'5개 해역', subEn:'5 basins',
    ready:true, sky:'#06141a', paint:'gyre' },
  /* 항공기·선박은 유료 API 라 가입자가 모여야 열린다.
     '준비 중'으로 흐려두면 언제 열릴지 알 수 없어 보인다 —
     누르면 "몇 명 모이면 연다"를 숫자로 보여주고 관심 등록을 받는다. */
  { id:'flight', ko:'항공기', en:'Aircraft', sub:'선착순 오픈', subEn:'Unlock at goal',
    ready:true, demand:'flight', sky:'#0a1018', paint:'flightlayer' },
  { id:'ship', ko:'선박', en:'Ships', sub:'선착순 오픈', subEn:'Unlock at goal',
    ready:true, demand:'ship', sky:'#06121a', paint:'shiplayer' },
];

/* 썸네일 — 구(球) 느낌만 나면 된다. 실제 지구를 렌더할 필요는 없다. */
function drawThumb(cv, kind) {
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
    tmax:  () => { band(['#f5e05a', '#f0a03c', '#e0562b', '#a81f1f']); },
    tmin:  () => { band(['#0d2a6b', '#2b62c0', '#69a8de', '#bcd8f0']); },
    aurora:() => { bg(['#04141c', '#02080c']); aurora(); },
    quake: () => { bg(['#2a1410', '#120806']); dots('#ff5d5d'); },
    cyclone: () => { bg(['#0d2438', '#061421']); spiral('#ff9f45'); },
    news: () => { bg(['#241608', '#100a04']); dots('#ffd166'); },
    tsunami: () => { bg(['#0a2030', '#04101a']); waves('#ff5d5d'); },
    fire: () => { bg(['#2a1206', '#120602']); flames(); },
    buoy: () => { bg(['#062535', '#031018']); waves('#5ad1e8'); dots('#9fe8f5'); },
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
    eclipse: () => { bg(['#0b0b14', '#020208']); corona(); },
    flightlayer: () => { bg(['#0a1c2e', '#04101c']); tracks('#8fd0ff'); },
    shiplayer: () => { bg(['#062232', '#03111a']); waves('#7fb8d8'); tracks('#bfe4f5'); },
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
const CATEGORIES = [
  { id: 'base',    ko: '바탕',       en: 'Base',
    ids: ['truecolor', 'clouds', 'himawari', 'himaIR'] },
  { id: 'weather', ko: '기상',       en: 'Weather',
    ids: ['temp', 'tmax', 'tmin', 'humidity', 'wind', 'windfc', 'fog', 'drought'] },
  { id: 'air',     ko: '대기질',     en: 'Air quality',
    ids: ['pm25', 'pm10', 'dust', 'aqi', 'uv', 'ozone'] },
  { id: 'ocean',   ko: '해양',       en: 'Ocean',
    ids: ['sst', 'sstanom', 'wave', 'swell', 'current', 'phenomena'] },
  { id: 'station', ko: '관측소',     en: 'Stations',
    ids: ['landobs', 'ukfc', 'buoy', 'coverage'] },
  { id: 'hazard',  ko: '재난',       en: 'Hazards',
    ids: ['cyclone', 'quake', 'tsunami', 'wildfire', 'alerts', 'lightning', 'regional', 'heatdome'] },
  { id: 'sky',     ko: '하늘·우주',  en: 'Sky & space',
    ids: ['aurora', 'eclipse'] },
  { id: 'move',    ko: '이동',       en: 'Movement',
    ids: ['flight', 'ship'] },
  { id: 'events',  ko: '이벤트',     en: 'Events',
    ids: ['news'] },
];

export const layerBar = {
  open: false,      // 1단
  sub: false,       // 2단(지구 스타일)

  init() {
    const tab = $('#menuTab'), main = $('#menuMain'), sub = $('#menuSub');

    const apply = () => {
      main.classList.toggle('open', this.open);
      sub.classList.toggle('open', this.open && this.sub);
      tab.classList.toggle('open', this.open);
      tab.classList.toggle('sub', this.open && this.sub);
      main.setAttribute('aria-hidden', String(!this.open));
      sub.setAttribute('aria-hidden', String(!(this.open && this.sub)));
      tab.setAttribute('aria-expanded', String(this.open));
      main.querySelector('[data-open="earth"]')?.classList.toggle('open', this.sub);
    };
    this._apply = apply;

    tab.onclick = () => {
      this.open = !this.open;
      if (!this.open) this.sub = false;    // 닫으면 2단도 같이 접는다
      apply();
    };
    main.querySelector('[data-open="earth"]').onclick = () => { this.sub = !this.sub; apply(); };

    // 바깥을 누르면 닫는다 — 지구를 조작하려는 것이므로
    document.addEventListener('pointerdown', ev => {
      if (!this.open) return;
      if (tab.contains(ev.target) || main.contains(ev.target) || sub.contains(ev.target)) return;
      this.open = false; this.sub = false; apply();
    }, true);

    this.render();
    store.on('layer', () => this.sync());
    store.on('tier', () => this.render());
    i18n.onChange(() => this.render());
    apply();
    return this;
  },

  /** 1단 항목의 동작을 바깥(main.js)에서 붙인다 */
  onAction(name, fn) {
    const b = document.querySelector(`#menuMain [data-act="${name}"]`);
    if (b) b.onclick = () => { fn(); this.open = false; this.sub = false; this._apply(); };
  },

  render() {
    const strip = $('#layerStrip');
    if (!strip) return;
    strip.innerHTML = '';
    const ko = i18n.lang === 'ko';

    /* 묶음별로 제목을 두고 그 아래에 항목을 놓는다.
       ⚠️ CATEGORIES 에 없는 항목이 생기면 조용히 사라지므로 마지막에 모아 붙인다. */
    const placed = new Set();
    const order = [];
    CATEGORIES.forEach(c => {
      const items = c.ids.map(id => ITEMS.find(x => x.id === id)).filter(Boolean);
      if (!items.length) return;
      items.forEach(x => placed.add(x.id));
      order.push({ cat: c, items });
    });
    const rest = ITEMS.filter(x => !placed.has(x.id));
    if (rest.length) {
      order.push({ cat: { id: 'etc', ko: '그 밖에', en: 'Other' }, items: rest });
    }

    /* ⚠️ 묶음 이름은 적지 않는다 (받은 요청).
       대신 묶음 사이에 옅은 구분선만 둔다 — 순서로 묶임이 읽히면 충분하고,
       제목이 33종 위에 아홉 줄 더 얹히면 목록이 더 길어진다. */
    order.forEach(({ items }, i) => {
      if (i) strip.appendChild(el('div', 'ly-gap'));
      items.forEach(it => this._item(strip, it, ko));
    });
    this.sync();
  },

  /** 항목 하나 */
  _item(strip, it, ko) {
    {
      const def = LAYER_DEFS.find(d => d.id === it.id);
      const b = document.createElement('button');
      b.className = 'ly';
      b.dataset.id = it.id;

      const cv = document.createElement('canvas');
      drawThumb(cv, it.paint);
      b.appendChild(cv);

      const n = document.createElement('div');
      n.className = 'ly-name'; n.textContent = ko ? it.ko : it.en;
      const s2 = document.createElement('div');
      s2.className = 'ly-sub'; s2.textContent = ko ? it.sub : it.subEn;
      b.append(n, s2);

      /* 선착순 오픈 대기 항목 — 잠긴 것도, 준비 중인 것도 아니다.
         왜 아직 없는지와 언제 열리는지를 숫자로 보여준다. */
      if (it.demand) {
        b.classList.add('demand');
        b.onclick = async () => {
          const { demandSheet } = await import('./ui-subscribe.js');
          demandSheet.open(it.demand);
        };
        strip.appendChild(b);
        return;
      }

      if (!it.ready || !def || def.blocked) {
        b.classList.add('blocked');
        b.onclick = () => toast(ko ? '아직 준비 중입니다' : 'Coming soon');
      } else if (def.tier === TIER.PAID && !store.isPaid()) {
        /* 잠긴 레이어를 누르면 토스트 한 줄만 뜨고 끝이었다.
           "구독하고 열기"라고 써놓고 열 방법을 안 주면 안내가 아니다. */
        b.classList.add('locked');
        b.onclick = async () => {
          const { subscribeSheet } = await import('./ui-subscribe.js');
          subscribeSheet.open(ko
            ? `${it.ko}는 구독하시면 볼 수 있습니다.`
            : `${it.en} is available with a subscription.`);
        };
      } else {
        b.onclick = () => store.toggle(it.id);
      }
      strip.appendChild(b);
    }
  },

  sync() {
    document.querySelectorAll('#layerStrip .ly').forEach(b => {
      b.classList.toggle('on', store.isOn(b.dataset.id));
    });
  },
};
