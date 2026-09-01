// EARTHUS v2-three — 화면 문법 셸 (지시서 §19.12, §106.1)
// 좌측 레일(씬 메뉴) + 우측 EARTH INTELLIGENCE 패널(NOW/WHY/NEXT) + 하단 타임 스트립 + 라벨 엔진.
// 지구 렌더러(main.js)는 건드리지 않고 훅(hooks)으로만 연결한다.

import * as THREE from '../../vendor/three-r184.module.min.js';

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
      { id: 'locate', name: '내 위치로 이동', state: 'LIVE', src: 'GPS', act: true },
      { id: 'globe', name: '전지구 보기', state: 'LIVE', src: '—', act: true },
      { id: 'basestyles', name: '위성 베이스 11종', state: 'LOCKED', src: 'GIBS·RealEarth', plan: '1.0 레이어 이식 대기' },
    ],
  },
  {
    id: 'weather',
    label: '날씨',
    glyph: '날',
    accent: '#9FB9FF',
    layers: [
      { id: 'cloud-obs', name: '구름 실황 (전지구)', state: 'OBSERVED', src: 'NOAA GMGSI', act: true },
      { id: 'cloud-gk2a', name: '구름 천리안 (10분)', state: 'OBSERVED', src: 'GK2A AMI', act: true },
      { id: 'cloud-gfs', name: '비·눈·태풍 5일 예보 ▶', state: 'MODEL_SIGNAL', src: 'GFS·Open-Meteo', act: true },
      { id: 'wind', name: '바람장', state: 'LOCKED', src: 'GFS·1.0 S3 /wind', plan: '흐름(Flow) 표현으로 이식' },
      { id: 'airq', name: '대기질 7종', state: 'LOCKED', src: '1.0 S3 /wind(air)', plan: '지표 필드로 이식' },
      { id: 'warn', name: '기상 경보', state: 'LOCKED', src: 'KMA·1.0 warn.js', plan: '재해 씬과 연동' },
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
      { id: 'sst', name: '해수온·파고·해류 6종', state: 'LOCKED', src: '1.0 S3 /ocean', plan: '필드·흐름으로 이식' },
      { id: 'surf', name: '서핑 271곳·낚시 946곳', state: 'LOCKED', src: '1.0 로컬 JSON', plan: '지역 3D 마커로 이식' },
      { id: 'trench', name: '해구 10곳·다이브', state: 'LOCKED', src: '1.0 trenches.json', plan: 'UNDERWATER 씬으로' },
      { id: 'vessel', name: '선박', state: 'LOCKED', src: 'KOMSA MTIS', plan: '1.0과 동일: AIS 재배포 안 함(정책)' },
    ],
  },
  {
    id: 'people',
    label: '사람',
    glyph: '사',
    accent: '#EC7AA6',
    layers: [
      { id: 'seoul', name: '서울 실시간 인구', state: 'LOCKED', src: '서울시·1.0 S3 /tourism', plan: 'R-14 밀도 타워로 이식' },
      { id: 'poprelief', name: '인구 릴리프 (국가)', state: 'LOCKED', src: 'WorldPop 등', plan: 'R-03 데이터 조각' },
      { id: 'travel', name: '여행·관광 POI', state: 'LOCKED', src: 'Overpass·1.0', plan: '지역 3D 연동' },
      { id: 'flight', name: '항공편 추적', state: 'LOCKED', src: 'adsb.lol', plan: '프록시 복구 필요 (403)' },
      { id: 'news', name: '지구 뉴스 → 사건', state: 'LOCKED', src: 'GDELT·1.0 S3 /events', plan: '피드 사건 검증 트리거로' },
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
      { id: 'tc', name: '태풍 트랙', state: 'LIVE', src: 'GDACS', act: true },
      { id: 'tsunami', name: '쓰나미 경보', state: 'LOCKED', src: 'NWS·1.0 S3', plan: '공식 경보 채널 이식' },
      { id: 'wildfire', name: '산불·낙뢰', state: 'LOCKED', src: '1.0 S3 /events', plan: '핫스팟·낙뢰 이식' },
      { id: 'glof', name: '빙하호 홍수 (GLOF)', state: 'LOCKED', src: 'DEM+파열모델', plan: '지역 3D 위 시나리오' },
    ],
  },
  {
    id: 'space',
    label: '우주',
    glyph: '우',
    accent: '#B79AEC',
    layers: [
      { id: 'sats', name: '인공위성 추적', state: 'LOCKED', src: 'CelesTrak·1.0 SGP4', plan: '1.0 ui-sat 코드 이식' },
      { id: 'launch', name: '발사 일정', state: 'LOCKED', src: 'TheSpaceDevs', plan: '피드 연동' },
      { id: 'solar', name: '오늘의 태양계', state: 'LOCKED', src: 'AETHERUS', plan: 'cosmic3d 씬 이식' },
      { id: 'photos', name: '우주 사진관 59점', state: 'LOCKED', src: 'HST·JWST', plan: 'AETHERUS 이식' },
      { id: 'galaxy', name: '우리은하·우주의 크기', state: 'LOCKED', src: 'AETHERUS', plan: '교육 씬 이식' },
    ],
  },
];

// Truth Class 배지 (v5.3 P8): 관측/공식예보/모델/시뮬레이션을 시각·의미적으로 분리.
// 값 조작 금지, 0 대체 금지, 데이터 없으면 INSUFFICIENT_DATA.
export const dataBadge = (state, extra) => {
  const map = {
    LIVE: ['live', 'LIVE'],
    OBSERVED: ['live', 'OBSERVED'],
    OFFICIAL_FORECAST: ['off', 'OFFICIAL'],
    MODEL_SIGNAL: ['model', 'MODEL'],
    SIMULATION_ONLY: ['sim', 'SIMULATION'],
    STALE: ['stale', 'STALE'],
    DEMO: ['demo', 'DEMO'],
    UNAVAILABLE: ['na', 'UNAVAILABLE'],
    INSUFFICIENT_DATA: ['na', 'INSUFFICIENT_DATA'],
    LOCKED: ['locked', '준비 중'],
    PRO: ['locked', 'EXPLORER PRO'],
  };
  const m = map[state];
  if (!m) return '';
  return `<span class="badge ${m[0]}">${m[1]}${extra ? ' · ' + extra : ''}</span>`;
};

// 미오픈 국가 준비도 (§67.1) — 오픈 국가만 LIVE, 그 외 정직한 준비 상태
const OPEN_COUNTRIES = new Set(['KOR', 'JPN', 'USA', 'GBR']);

export function initShell(hooks) {
  // hooks: { onScene(id), getNow() -> html, camera, getFocusSel(), labelData() -> [{nameKo,lat,lon,rank}] }
  const root = document.body;

  // --- 좌측 레일 (도메인 액센트) + 레이어 플라이아웃 ---
  const rail = document.createElement('div');
  rail.id = 'rail';
  rail.innerHTML = SCENES.map((s) => {
    const liveN = s.layers.filter((l) => l.state !== 'LOCKED').length;
    return `
    <button class="rail-item${s.id === 'land' ? ' active' : ''}" data-scene="${s.id}" style="--sc:${s.accent}">
      <span class="glyph">${s.glyph}</span>
      <span class="rlabel">${s.label}</span>
      <span class="rlock">${liveN}/${s.layers.length}</span>
    </button>`;
  }).join('');
  root.appendChild(rail);

  const flyout = document.createElement('div');
  flyout.id = 'flyout';
  root.appendChild(flyout);
  let flyScene = null;

  const closeFlyout = () => {
    flyScene = null;
    flyout.classList.remove('open');
  };

  const openFlyout = (scene) => {
    flyScene = scene.id;
    flyout.style.setProperty('--sc', scene.accent);
    flyout.innerHTML = `
      <div class="fly-head"><b>${scene.label}</b><span>레이어 ${scene.layers.length}</span><button class="ui-x" data-x="1">✕</button></div>
      ${scene.layers.map((l) => `
        <button class="fly-row${l.state === 'LOCKED' ? ' locked' : ''}" data-fscene="${scene.id}" data-flayer="${l.id}">
          <span class="fly-name">${l.name}</span>
          <span class="fly-meta">${dataBadge(l.state)}<i>${l.src}</i></span>
        </button>`).join('')}
      <div class="fly-note">잠긴 레이어 = 데이터 미연결 (출처·계획 명시) — 가짜 값 없음</div>`;
    flyout.classList.add('open');
  };

  flyout.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) { closeFlyout(); return; }
    const row = e.target.closest('.fly-row');
    if (!row) return;
    const scene = SCENES.find((s) => s.id === row.dataset.fscene);
    const layer = scene && scene.layers.find((l) => l.id === row.dataset.flayer);
    if (layer && hooks.onLayerAction) hooks.onLayerAction(scene.id, layer);
  });

  rail.querySelectorAll('.rail-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.scene;
      if (flyScene === id) { closeFlyout(); return; }
      rail.querySelectorAll('.rail-item').forEach((b) => b.classList.toggle('active', b === btn));
      openFlyout(SCENES.find((s) => s.id === id));
      hooks.onScene(id);
    });
  });

  const setActiveScene = (id) => {
    rail.querySelectorAll('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.scene === id));
  };

  // --- 우측 EARTH INTELLIGENCE 패널 (§106.1: 접힘 기본, 지구 65% 이상 유지) ---
  const intel = document.createElement('div');
  intel.id = 'intel';
  intel.innerHTML = `
    <button id="intel-tab">EARTH INTELLIGENCE</button>
    <div id="intel-body">
      <div class="intel-tabs">
        <button data-tab="feed" class="on">FEED</button>
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
    <button id="ts-now">지금</button>
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
    hooks.onTimeOffset(m * 60000);
    tsLabel.textContent = m === 0 ? 'NOW'
      : `${fmtOffset(m)} · 태양 LIVE · 예보구름 MODEL · 관측은 STALE`;
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
    const maxLabels = window.innerWidth > 1400 ? 8 : 5;
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
      d.textContent = v.c.nameKo;
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
    closeIntel,
    isFlyoutOpen: () => !!flyScene,
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
    cards.push(`<div class="card"><div class="card-h">해양 포커스 ${dataBadge('DEMO')}</div>
      <div class="card-b">해류·수온 데이터 미연결 — 시각 모드만 제공.<br/>화살표·흐름 연출 없음 (데이터 없이는 그리지 않음)</div></div>`);
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
