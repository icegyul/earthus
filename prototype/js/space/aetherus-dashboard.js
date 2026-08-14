// AETHERUS My Mission Control — Sheets 115–132 runtime UI.
//
// 승인 reference의 위젯 구조를 실제 3D Earth 위에 연결한다. 화면을 채우려고 수치를
// 만들지 않는다. 발사 일정은 Launch Library 2 응답, Kp는 NOAA SWPC 응답, 사진 수는
// Earthus가 보유한 provenance catalogue에서만 표시한다. 사용자 레이아웃은 서버 동기화가
// 붙기 전까지 민감정보 없이 이 기기에만 저장하며, 그 사실을 화면에 명시한다.

import { API } from '../config.js';
import { fetchT } from '../net.js';

const STYLE_ID = 'aetherusMissionControlStyle';
const PHOTO_CATALOG = '/data/space-photos.json';
const STORAGE_KEY = 'earthus:aetherus-mission-control-layout:v1';
const DATA_CACHE_KEY = 'earthus:aetherus-mission-control-public-data:v1';
const REFRESH_MS = 5 * 60 * 1000;
const ROOM_TEMPLATES = Object.freeze([
  ['SPACE_CONTROL', 'SPACE CONTROL', '◈'],
  ['WEATHER_CENTER', 'WEATHER CENTER', '☼'],
  ['ASTRONOMY_LAB', 'ASTRONOMY LAB', '✦'],
  ['SATELLITE_TRACKING', 'SATELLITE TRACKING', '⌁'],
]);
const EDITABLE_WIDGETS = Object.freeze([
  ['FOLLOWING', 'Following'], ['NEXT_LAUNCH', 'Next Launch'], ['LIVE', 'Live Stream'], ['COUNTDOWN', 'Countdown'],
  ['MISSION_TIMELINE', 'Mission Timeline'], ['PAYLOAD_STATUS', 'Payload Status'],
  ['UPCOMING_LAUNCHES', 'Upcoming Launches'], ['TONIGHT', 'Tonight Above Me'],
  ['SPACE_WEATHER', 'Space Weather'], ['EARTH_WEATHER', 'Earth Weather'],
  ['CONTROL_ROOMS', 'My Control Rooms'], ['SATELLITE_PASS', 'Satellite Pass'],
  ['AURORA', 'Aurora'], ['KOREA_SPACE', 'Korea Space'], ['SPACEX', 'SpaceX'],
  ['STARSHIP', 'Starship'], ['JWST', 'JWST'],
]);
const BOTTOM_WIDGETS = Object.freeze([
  'UPCOMING_LAUNCHES', 'TONIGHT', 'SPACE_WEATHER', 'EARTH_WEATHER', 'CONTROL_ROOMS',
  'SATELLITE_PASS', 'AURORA', 'KOREA_SPACE', 'SPACEX', 'STARSHIP', 'JWST',
]);
const ROOM_DEFAULTS = Object.freeze({
  SPACE_CONTROL: Object.freeze({
    order: ['UPCOMING_LAUNCHES', 'TONIGHT', 'SPACE_WEATHER', 'EARTH_WEATHER', 'CONTROL_ROOMS'], wide: [],
  }),
  WEATHER_CENTER: Object.freeze({
    order: ['SPACE_WEATHER', 'AURORA', 'EARTH_WEATHER', 'SATELLITE_PASS', 'CONTROL_ROOMS'], wide: [],
  }),
  ASTRONOMY_LAB: Object.freeze({
    order: ['JWST', 'TONIGHT', 'SPACE_WEATHER', 'SATELLITE_PASS', 'CONTROL_ROOMS'], wide: [],
  }),
  SATELLITE_TRACKING: Object.freeze({
    order: ['SATELLITE_PASS', 'KOREA_SPACE', 'SPACEX', 'STARSHIP', 'CONTROL_ROOMS'], wide: [],
  }),
});
const DEFAULT_STATE = Object.freeze({
  activeRoom: 'SPACE_CONTROL',
  followingLaunchId: null,
  activeFilter: 'all',
});
const FILTER_WIDGETS = Object.freeze({
  launches: Object.freeze(['FOLLOWING', 'NEXT_LAUNCH', 'LIVE', 'COUNTDOWN', 'MISSION_TIMELINE', 'PAYLOAD_STATUS',
    'UPCOMING_LAUNCHES', 'KOREA_SPACE', 'SPACEX', 'STARSHIP']),
  satellites: Object.freeze(['SATELLITE_PASS']),
  iss: Object.freeze(['SATELLITE_PASS']),
  weather: Object.freeze(['SPACE_WEATHER', 'AURORA', 'EARTH_WEATHER']),
  astronomy: Object.freeze(['TONIGHT', 'JWST']),
});
const STATUS_SOURCES = Object.freeze([
  ['launches', '발사 일정', 'Launch Library 2'],
  ['kp', 'Kp 관측', 'NOAA SWPC'],
  ['aurora', '오로라 모델', 'NOAA SWPC OVATION'],
  ['photos', '우주 사진 원장', 'Earthus provenance catalogue'],
]);

function defaultRoomLayouts() {
  return Object.fromEntries(Object.entries(ROOM_DEFAULTS).map(([room, preset]) => [room, {
    hidden: BOTTOM_WIDGETS.filter(id => !preset.order.includes(id)),
    wide: [...preset.wide],
    order: [...preset.order, ...BOTTOM_WIDGETS.filter(id => !preset.order.includes(id))],
  }]));
}

function currentRoomLayout(state) {
  return state.rooms[state.activeRoom];
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../../css/aetherus-dashboard.css?v=20260815-mc14', import.meta.url).href;
  document.head.append(link);
}

function formatKst(value, withSeconds = false) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '시각 미수신';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined,
    hour12: false, hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
    + (withSeconds ? `:${parts.second}` : '');
}

function countdownLabel(value, nowMs = Date.now()) {
  const target = Date.parse(value || '');
  if (!Number.isFinite(target)) return '일정 시각 미수신';
  const delta = target - nowMs;
  if (delta < 0) return '예정 시각 경과';
  const totalMinutes = Math.floor(delta / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days ? `T-${days}D ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    : `T-${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function safeStoredState() {
  const defaults = defaultRoomLayouts();
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_STATE, rooms: defaults };
    }
    const allowedWidgets = new Set(EDITABLE_WIDGETS.map(([id]) => id));
    const rooms = Object.fromEntries(ROOM_TEMPLATES.map(([room]) => {
      const raw = parsed.rooms?.[room] || (room === parsed.activeRoom ? parsed : null);
      const allowedOrder = BOTTOM_WIDGETS;
      const order = Array.isArray(raw?.order)
        ? raw.order.filter(id => allowedOrder.includes(id)) : [...defaults[room].order];
      BOTTOM_WIDGETS.forEach(id => { if (!order.includes(id)) order.push(id); });
      let hidden = Array.isArray(raw?.hidden)
        ? raw.hidden.filter(id => allowedWidgets.has(id)) : [...defaults[room].hidden];
      /* v1 저장값에는 새 위젯이 없었다. 기존 사용자의 hidden=[]을 그대로 해석하면
         업데이트 직후 11개가 한꺼번에 열리므로, 옛 order 밖의 새 위젯은 숨김으로 이관한다. */
      if (!parsed.rooms && raw) {
        hidden = [...new Set([...hidden, ...BOTTOM_WIDGETS.filter(id => !raw.order?.includes(id))])];
      }
      const wide = Array.isArray(raw?.wide)
        ? raw.wide.filter(id => allowedWidgets.has(id)) : [...defaults[room].wide];
      return [room, { hidden, wide, order }];
    }));
    return {
      activeRoom: ROOM_TEMPLATES.some(([id]) => id === parsed.activeRoom)
        ? parsed.activeRoom : DEFAULT_STATE.activeRoom,
      rooms,
      followingLaunchId: typeof parsed.followingLaunchId === 'string' ? parsed.followingLaunchId : null,
      activeFilter: 'all',
    };
  } catch {
    return { ...DEFAULT_STATE, rooms: defaults };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeRoom: state.activeRoom,
      rooms: Object.fromEntries(Object.entries(state.rooms).map(([room, layout]) => [room, {
        hidden: [...layout.hidden], wide: [...layout.wide], order: [...layout.order],
      }])),
      followingLaunchId: state.followingLaunchId,
    }));
    return true;
  } catch {
    return false;
  }
}

function safeDataCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null');
    if (!parsed || parsed.version !== 1 || typeof parsed.sources !== 'object') return {};
    return parsed.sources;
  } catch {
    return {};
  }
}

function saveDataCache(sources) {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ version: 1, sources }));
    return true;
  } catch {
    return false;
  }
}

function cacheEntry(value, retrievedAt = new Date()) {
  return { retrievedAt: new Date(retrievedAt).toISOString(), value };
}

function validCachedSource(sources, name, validate) {
  const entry = sources?.[name];
  if (!entry || !Number.isFinite(Date.parse(entry.retrievedAt || '')) || !validate(entry.value)) return null;
  return entry;
}

function routeButton(route, icon, label) {
  return `<button type="button" data-mission-route="${route}"><span aria-hidden="true">${icon}</span>`
    + `<b>${label}</b><i aria-hidden="true">›</i></button>`;
}

function widgetShell(type, title, className = '') {
  return `<article class="mission-widget ${className}" data-widget="${type}" aria-label="${title}">`
    + `<header><b>${title}</b><span data-widget-state="${type}">자료 확인 중</span></header>`
    + `<div class="mission-widget-body" data-widget-body="${type}"></div></article>`;
}

function buildMarkup() {
  const mission = document.createElement('section');
  mission.id = 'aetherusMissionControl';
  mission.className = 'aetherus-mission-control';
  mission.hidden = true;
  mission.setAttribute('aria-label', 'AETHERUS My Mission Control');
  mission.innerHTML = `
    <aside class="mission-left mission-surface" data-widget="FOLLOWING">
      <header class="mission-panel-title"><span><b>MY MISSION CONTROL</b><small>개인 관제센터 · 기기 저장</small></span>
        <button type="button" data-mission-edit aria-label="레이아웃 편집">⌁</button></header>
      <button type="button" class="mission-add-widget" data-mission-edit><span>＋</span> 위젯 추가</button>
      <section class="mission-following">
        <header><b>FOLLOWING</b><span data-following-count>0</span></header>
        <div data-following-list class="mission-following-list"></div>
      </section>
      <section class="mission-quick">
        <header><b>QUICK MENU</b></header>
        ${routeButton('solar', '◉', '태양계 탐색')}
        ${routeButton('photos', '▣', '허블·제임스웹 사진')}
        ${routeButton('milkyway', '⌁', '우리은하')}
        ${routeButton('galaxies', '✦', '은하·우주 규모')}
        ${routeButton('earth', '◎', 'Earthus 지구로')}
      </section>
    </aside>

    <section class="mission-center">
      <div class="mission-center-tools">
        <div class="mission-filter" role="group" aria-label="관제 자료 필터">
          <button type="button" class="current" data-mission-filter="all" aria-pressed="true">전체</button>
          <button type="button" data-mission-filter="launches" aria-pressed="false">발사</button>
          <button type="button" data-mission-filter="satellites" aria-pressed="false">위성</button>
          <button type="button" data-mission-filter="iss" aria-pressed="false">ISS</button>
          <button type="button" data-mission-filter="weather" aria-pressed="false">날씨</button>
          <button type="button" data-mission-filter="astronomy" aria-pressed="false">천문</button>
        </div>
        <div class="mission-center-actions">
          <span class="mission-source-mode" data-mission-source-mode>자료 확인 중</span>
          <button type="button" class="mission-status-button" data-mission-status-open
            aria-label="관제 알림센터, 단축키 N" aria-haspopup="dialog" aria-expanded="false">
            <span aria-hidden="true">◌</span><i data-mission-status-count hidden>0</i></button>
          <button type="button" class="mission-fullscreen-button" data-mission-fullscreen
            aria-label="관제센터 전체화면, 단축키 F" aria-pressed="false">⛶</button>
          <button type="button" class="mission-edit-button" data-mission-edit>레이아웃 편집</button>
        </div>
      </div>
      <div class="mission-orbit-diagram" aria-label="실시간 위치가 아닌 궤도 구조 도식">
        <i class="mission-orbit mission-orbit-a"></i><i class="mission-orbit mission-orbit-b"></i>
        <span class="mission-orbit-label mission-orbit-label-a">HUBBLE · 궤도 도식</span>
        <span class="mission-orbit-label mission-orbit-label-b">JWST · L2 도식</span>
      </div>
      <div class="mission-launch-marker" data-widget="NEXT_LAUNCH" data-launch-marker hidden
        role="group" aria-label="Next Launch">
        <span aria-hidden="true">△</span><b data-launch-name>발사 일정</b>
        <small><span data-launch-site>위치 미수신</span> · <span data-launch-marker-state>일정</span></small>
      </div>
      <div class="mission-stage-clock"><small>기기 시각 · KST</small><b data-mission-device-time>--</b></div>
      <div class="mission-center-legend">
        <span><i class="ready"></i>공식/공개 자료</span><span><i></i>계산·도식</span>
        <span>▣ <em data-mission-photo-count>사진 확인 중</em></span>
        <b>3D EARTH</b>
      </div>
    </section>

    <aside class="mission-right">
      <div class="mission-right-top">
        ${widgetShell('LIVE', 'LIVE STREAM')}
        ${widgetShell('COUNTDOWN', 'LAUNCH COUNTDOWN')}
      </div>
      <div class="mission-right-bottom">
        ${widgetShell('MISSION_TIMELINE', 'MISSION TIMELINE')}
        ${widgetShell('PAYLOAD_STATUS', 'PAYLOADS')}
      </div>
    </aside>

    <section class="mission-bottom">
      ${widgetShell('UPCOMING_LAUNCHES', 'UPCOMING LAUNCHES')}
      ${widgetShell('TONIGHT', 'TONIGHT ABOVE ME')}
      ${widgetShell('SPACE_WEATHER', 'SPACE WEATHER')}
      ${widgetShell('EARTH_WEATHER', 'EARTH WEATHER')}
      ${widgetShell('CONTROL_ROOMS', 'MY CONTROL ROOMS')}
      ${widgetShell('SATELLITE_PASS', 'SATELLITE PASS')}
      ${widgetShell('AURORA', 'AURORA')}
      ${widgetShell('KOREA_SPACE', 'KOREA SPACE')}
      ${widgetShell('SPACEX', 'SPACEX')}
      ${widgetShell('STARSHIP', 'STARSHIP')}
      ${widgetShell('JWST', 'JWST')}
    </section>

    <aside class="mission-editor mission-surface" data-mission-editor hidden role="dialog" aria-modal="true"
      aria-label="미션 컨트롤 레이아웃 편집">
      <header><span><b>레이아웃 편집</b><small>현재 기기 저장 · 계정 동기화 전</small></span>
        <button type="button" data-mission-editor-close aria-label="편집 닫기">×</button></header>
      <div class="mission-room-picker" data-room-picker></div>
      <div class="mission-editor-widgets" data-editor-widgets></div>
      <footer><button type="button" data-layout-reset>기본 배치 복원</button>
        <button type="button" data-mission-editor-close>완료</button></footer>
    </aside>
    <aside class="mission-status-panel mission-surface" data-mission-status hidden role="dialog"
      aria-label="관제 알림센터">
      <header><span><b>관제 알림센터</b><small>현재 화면의 공식·공개 자료 상태</small></span>
        <button type="button" data-mission-status-close aria-label="알림센터 닫기">×</button></header>
      <div class="mission-status-list" data-mission-status-list></div>
      <footer><small>화면 내 상태 · 푸시 발송 아님</small>
        <button type="button" data-mission-status-refresh>자료 새로고침</button></footer>
    </aside>
    <p class="mission-announcement" data-mission-announcement aria-live="polite" aria-atomic="true"></p>`;
  return mission;
}

function decorateExperienceNav(root) {
  const group = root.querySelector('#cosmicExperienceNav')?.querySelector('div');
  if (!group) return;
  if (!group.querySelector('[data-aetherus-nav="mission"]')) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.aetherusNav = 'mission'; button.textContent = '미션 컨트롤';
    group.prepend(button);
  }
  const labels = { solar: '태양계', photos: '우주 사진', milkyway: '은하수', galaxies: '은하' };
  Object.entries(labels).forEach(([route, label]) => {
    const button = group.querySelector(`[data-aetherus-nav="${route}"]`);
    if (button) button.textContent = label;
  });
}

function makeMenuMissionButton(onRoute) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'aetherus-route aetherus-mission-route';
  button.dataset.aetherusRoute = 'mission';
  button.innerHTML = '<span><b>미션 컨트롤</b><small>MISSION CONTROL</small></span><i aria-hidden="true">›</i>';
  button.addEventListener('click', () => {
    document.getElementById('aetherusTab')?.click(); onRoute('mission');
  });
  return button;
}

function launchListUrl() {
  try {
    const url = new URL(API.LAUNCH);
    /* 한 번의 LL2 응답에서 다음 발사뿐 아니라 Korea/SpaceX/Starship 위젯도
       대조한다. 별도 provider 호출을 반복하지 않도록 24건을 한 번만 받는다. */
    url.searchParams.set('limit', '24');
    url.searchParams.set('ordering', 'window_start');
    return url.href;
  } catch {
    return API.LAUNCH;
  }
}

function normalizeLaunches(value) {
  if (!Array.isArray(value?.results)) return [];
  return value.results.filter(item => item?.id && item?.name && item?.window_start).map(item => ({
    id: String(item.id), name: String(item.name), scheduledAt: item.window_start,
    windowEnd: item.window_end || null, status: item.status?.name || '상태 미수신',
    statusDescription: item.status?.description || '', webcastLive: item.webcast_live === true,
    provider: item.launch_service_provider?.name || '운영기관 미수신',
    site: item.pad?.location?.name || item.pad?.name || '발사장 미수신',
    missionType: item.mission?.type || null, missionName: item.mission?.name || null,
    videoUrls: (Array.isArray(item.mission?.vid_urls) ? item.mission.vid_urls : []).map(video => {
      const rawUrl = typeof video === 'string' ? video : video?.url;
      try {
        const parsed = new URL(rawUrl); if (parsed.protocol !== 'https:') return null;
        return { url: parsed.href, title: String(video?.title || video?.publisher || '발사 송출 열기') };
      } catch { return null; }
    }).filter(Boolean),
  }));
}

function normalizeAurora(value) {
  const coordinates = Array.isArray(value?.coordinates) ? value.coordinates : [];
  const intensity = coordinates.map(row => Number(row?.[2])).filter(Number.isFinite);
  if (!intensity.length) return null;
  const forecastAt = value['Forecast Time'] || value.forecast_time || value.forecastTime || null;
  const observedAt = value['Observation Time'] || value.observation_time || value.observationTime || null;
  return {
    forecastAt, observedAt,
    max: Math.max(...intensity),
    activeCells: intensity.filter(item => item > 0).length,
    sampleCount: intensity.length,
  };
}

function providerLaunches(launches, pattern) {
  return launches.filter(item => pattern.test([
    item.name, item.provider, item.site, item.missionName, item.missionType,
  ].filter(Boolean).join(' ')));
}

function latestTelescopePhoto(catalog, telescope) {
  return (catalog?.items || []).filter(item => item?.telescope === telescope)
    .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))[0] || null;
}

function setText(root, selector, value) {
  root.querySelectorAll(selector).forEach(node => { node.textContent = value; });
}

function stateBadge(root, type, value) {
  const node = root.querySelector(`[data-widget-state="${type}"]`);
  if (!node) return;
  node.textContent = value.label;
  node.dataset.state = value.state;
}

function sourceBadge(data, source, liveLabel) {
  if (data.sourceModes?.[source] === 'cached') {
    const retrievedAt = data.sourceRetrievedAt?.[source];
    return { label: `CACHED · ${formatKst(retrievedAt)}`, state: 'cached' };
  }
  return { label: liveLabel, state: 'ready' };
}

function renderRows(container, rows, emptyCopy) {
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p'); empty.className = 'mission-widget-empty';
    empty.textContent = emptyCopy; container.append(empty); return;
  }
  rows.forEach(row => {
    const item = document.createElement('div'); item.className = 'mission-data-row';
    const main = document.createElement('span');
    const title = document.createElement('b'); title.textContent = row.title;
    const copy = document.createElement('small'); copy.textContent = row.copy;
    main.append(title, copy);
    const tail = document.createElement('i'); tail.textContent = row.tail || '';
    item.append(main, tail); container.append(item);
  });
}

function renderStatusCenter(mission, data, state) {
  const list = mission.querySelector('[data-mission-status-list]');
  if (!list) return;
  list.replaceChildren();
  const launches = data.launches || [];
  const next = launches[0] || null;
  const following = state.followingLaunchId
    ? launches.find(item => item.id === state.followingLaunchId) : null;
  const rows = [];

  if (next?.webcastLive) {
    rows.push({ state: 'live', badge: 'LIVE', title: next.name,
      copy: `LL2 webcast_live=true · ${formatKst(data.launchRetrievedAt)} KST` });
  }
  if (following) {
    rows.push({ state: 'following', badge: 'FOLLOWING', title: following.name,
      copy: `${formatKst(following.scheduledAt)} KST · ${following.status}` });
  } else if (next) {
    rows.push({ state: 'info', badge: 'NEXT', title: next.name,
      copy: `${formatKst(next.scheduledAt)} KST · ${next.status}` });
  }

  STATUS_SOURCES.forEach(([id, title, provider]) => {
    const mode = data.sourceModes?.[id] || 'unavailable';
    let evidenceTime = data.sourceRetrievedAt?.[id];
    if (id === 'kp' && data.kp?.observedAt) evidenceTime = data.kp.observedAt;
    if (id === 'aurora' && (data.aurora?.forecastAt || data.aurora?.observedAt)) {
      evidenceTime = data.aurora.forecastAt || data.aurora.observedAt;
    }
    rows.push({ state: mode, badge: mode === 'live' ? 'LIVE' : (mode === 'cached' ? 'CACHED' : '미수신'),
      title, copy: evidenceTime ? `${provider} · ${formatKst(evidenceTime)} KST` : `${provider} · 시각 미수신` });
  });

  rows.forEach(row => {
    const item = document.createElement('article');
    item.className = 'mission-status-row'; item.dataset.state = row.state;
    const marker = document.createElement('i'); marker.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    const title = document.createElement('b'); title.textContent = row.title;
    const meta = document.createElement('small'); meta.textContent = row.copy;
    const badge = document.createElement('em'); badge.textContent = row.badge;
    copy.append(title, meta); item.append(marker, copy, badge); list.append(item);
  });

  const attentionCount = Object.values(data.sourceModes || {})
    .filter(mode => mode === 'cached' || mode === 'unavailable').length + (next?.webcastLive ? 1 : 0);
  const badge = mission.querySelector('[data-mission-status-count]');
  if (badge) { badge.textContent = String(attentionCount); badge.hidden = attentionCount === 0; }
  const button = mission.querySelector('[data-mission-status-open]');
  if (button) button.setAttribute('aria-label', attentionCount
    ? `관제 알림센터, 확인 항목 ${attentionCount}개, 단축키 N` : '관제 알림센터, 단축키 N');
}

function renderMissionData(mission, data, state) {
  const launches = data.launches || [];
  const next = launches[0] || null;
  const retrieved = data.launchRetrievedAt ? formatKst(data.launchRetrievedAt) : '조회 시각 미수신';
  const unavailable = { label: 'UNAVAILABLE', state: 'unavailable' };
  const ready = { label: 'READY', state: 'ready' };
  const cachedSources = Object.entries(data.sourceModes || {})
    .filter(([, mode]) => mode === 'cached').map(([source]) => source);
  const liveSources = Object.values(data.sourceModes || {}).filter(mode => mode === 'live').length;
  setText(mission, '[data-mission-source-mode]', cachedSources.length
    ? `오프라인 캐시 ${cachedSources.length} · 마지막 성공 시각 유지`
    : (liveSources ? `공식·공개 자료 ${liveSources}개 연결` : '자료 확인 중'));
  mission.dataset.sourceMode = cachedSources.length ? 'cached' : (liveSources ? 'live' : 'unavailable');

  const liveBody = mission.querySelector('[data-widget-body="LIVE"]');
  liveBody.replaceChildren();
  const liveCopy = document.createElement('div'); liveCopy.className = 'mission-live-copy';
  const liveTitle = document.createElement('strong');
  liveTitle.textContent = next?.webcastLive ? 'LL2에서 LIVE 상태 수신' : '현재 LIVE 상태 미수신';
  const liveMeta = document.createElement('p');
  liveMeta.textContent = next?.webcastLive
    ? `${next.name} · Launch Library 2 · ${retrieved}`
    : 'LL2 webcast_live=true인 해당 발사에 연결된 송출만 표시합니다.';
  liveCopy.append(liveTitle, liveMeta);
  const liveVideo = next?.videoUrls?.[0];
  if (next?.webcastLive && liveVideo) {
    const liveLink = document.createElement('a');
    liveLink.href = liveVideo.url; liveLink.target = '_blank';
    liveLink.rel = 'noopener noreferrer'; liveLink.textContent = `${liveVideo.title} ↗`;
    liveCopy.append(liveLink);
  } else if (next?.webcastLive) {
    const missingLink = document.createElement('p');
    missingLink.className = 'mission-widget-empty';
    missingLink.textContent = '이 발사에 연결된 HTTPS 송출 URL은 미수신입니다.';
    liveCopy.append(missingLink);
  }
  liveBody.append(liveCopy);
  stateBadge(mission, 'LIVE', next?.webcastLive ? sourceBadge(data, 'launches', ready.label) : unavailable);

  const countdownBody = mission.querySelector('[data-widget-body="COUNTDOWN"]');
  countdownBody.replaceChildren();
  const countdown = document.createElement('strong'); countdown.className = 'mission-countdown';
  countdown.textContent = next ? countdownLabel(next.scheduledAt) : '--';
  const countdownName = document.createElement('b'); countdownName.textContent = next?.name || '다음 일정 미수신';
  const countdownTime = document.createElement('small');
  countdownTime.textContent = next ? `${formatKst(next.scheduledAt)} KST · ${next.status}` : 'Launch Library 2 응답 없음';
  countdownBody.append(countdownName, countdown, countdownTime);
  stateBadge(mission, 'COUNTDOWN', next ? sourceBadge(data, 'launches', ready.label) : unavailable);

  renderRows(mission.querySelector('[data-widget-body="MISSION_TIMELINE"]'), next ? [
    { title: '일정 등록', copy: formatKst(next.scheduledAt) + ' KST', tail: next.status },
    { title: '발사 세부 타임라인', copy: '공식 이벤트 단계 미수신', tail: '—' },
    { title: '궤도 투입·분리', copy: '확인 전에는 표시하지 않음', tail: '—' },
  ] : [], '검증 가능한 미션 타임라인이 없습니다.');
  stateBadge(mission, 'MISSION_TIMELINE', next ? sourceBadge(data, 'launches', ready.label) : unavailable);

  renderRows(mission.querySelector('[data-widget-body="PAYLOAD_STATUS"]'), next ? [
    { title: next.missionName || 'Payload manifest 미수신', copy: next.missionType || '임무 유형 미수신', tail: '예정' },
    { title: '분리·첫 교신 상태', copy: '공식 확인 전에는 비워 둠', tail: '—' },
  ] : [], '검증 가능한 payload 자료가 없습니다.');
  stateBadge(mission, 'PAYLOAD_STATUS', next ? sourceBadge(data, 'launches', 'SCHEDULED') : unavailable);

  renderRows(mission.querySelector('[data-widget-body="UPCOMING_LAUNCHES"]'), launches.slice(0, 4).map(item => ({
    title: item.name, copy: `${formatKst(item.scheduledAt)} KST · ${item.provider}`,
    tail: countdownLabel(item.scheduledAt),
  })), '발사 일정 응답이 없습니다.');
  stateBadge(mission, 'UPCOMING_LAUNCHES', launches.length
    ? sourceBadge(data, 'launches', `LL2 · ${retrieved}`) : unavailable);

  const tonight = mission.querySelector('[data-widget-body="TONIGHT"]');
  renderRows(tonight, [], '사용자 위치를 선택하지 않아 통과 시각을 계산하지 않았습니다.');
  stateBadge(mission, 'TONIGHT', { label: 'LOCATION REQUIRED', state: 'unavailable' });

  const spaceWeather = mission.querySelector('[data-widget-body="SPACE_WEATHER"]');
  spaceWeather.replaceChildren();
  const kpValue = document.createElement('strong'); kpValue.className = 'mission-kp-value';
  kpValue.dataset.missionKpValue = '';
  kpValue.textContent = data.kp ? `Kp ${data.kp.value.toFixed(2)}` : 'Kp --';
  const kpCopy = document.createElement('p');
  kpCopy.dataset.missionKpTime = '';
  kpCopy.textContent = data.kp ? `NOAA SWPC · ${formatKst(data.kp.observedAt)} KST` : 'NOAA SWPC 응답 없음';
  spaceWeather.append(kpValue, kpCopy);
  stateBadge(mission, 'SPACE_WEATHER', data.kp ? sourceBadge(data, 'kp', 'OBSERVED') : unavailable);

  const aurora = mission.querySelector('[data-widget-body="AURORA"]');
  aurora.replaceChildren();
  const auroraValue = document.createElement('strong'); auroraValue.className = 'mission-kp-value';
  auroraValue.dataset.missionAuroraValue = '';
  auroraValue.textContent = data.aurora ? `최대 ${data.aurora.max}` : '모델 --';
  const auroraCopy = document.createElement('p'); auroraCopy.dataset.missionAuroraTime = '';
  auroraCopy.textContent = data.aurora
    ? `NOAA SWPC OVATION 모델 · ${formatKst(data.aurora.forecastAt || data.aurora.observedAt)} KST · 격자 n=${data.aurora.sampleCount}`
    : 'NOAA SWPC OVATION 응답 없음';
  aurora.append(auroraValue, auroraCopy);
  stateBadge(mission, 'AURORA', data.aurora ? sourceBadge(data, 'aurora', 'MODEL') : unavailable);

  const earthWeather = mission.querySelector('[data-widget-body="EARTH_WEATHER"]');
  earthWeather.replaceChildren();
  const weatherTitle = document.createElement('strong'); weatherTitle.textContent = '위치 미선택';
  const weatherCopy = document.createElement('p'); weatherCopy.textContent = 'Earthus에서 위치를 선택하면 공식 관측을 연결합니다.';
  const weatherButton = document.createElement('button'); weatherButton.type = 'button';
  weatherButton.dataset.missionRoute = 'earth'; weatherButton.textContent = '지구에서 위치 선택';
  earthWeather.append(weatherTitle, weatherCopy, weatherButton);
  stateBadge(mission, 'EARTH_WEATHER', unavailable);

  const passBody = mission.querySelector('[data-widget-body="SATELLITE_PASS"]');
  if (data.satellitePass?.status === 'ready') {
    renderRows(passBody, data.satellitePass.rows, '앞으로 48시간 안에 앙각 10° 이상 ISS 통과가 없습니다.');
    stateBadge(mission, 'SATELLITE_PASS', { label: 'ISS · CALCULATED', state: 'ready' });
  } else {
    passBody.replaceChildren();
    const passCopy = document.createElement('p'); passCopy.className = 'mission-widget-empty';
    passCopy.textContent = data.satellitePass?.message || '위치를 허용하면 ISS의 향후 48시간 통과를 이 기기에서 계산합니다.';
    const passButton = document.createElement('button'); passButton.type = 'button';
    passButton.className = 'mission-widget-action'; passButton.dataset.missionSatellitePass = '';
    passButton.textContent = data.satellitePass?.status === 'loading' ? '계산 중…' : '내 위치로 계산';
    passButton.disabled = data.satellitePass?.status === 'loading'; passBody.append(passCopy, passButton);
    stateBadge(mission, 'SATELLITE_PASS', data.satellitePass?.status === 'loading'
      ? { label: 'CALCULATING', state: 'ready' } : { label: 'LOCATION REQUIRED', state: 'unavailable' });
  }

  const koreaLaunches = providerLaunches(launches, /korea|korean|kari|kasa|naro|innospace|한빛|누리|대한민국/i);
  renderRows(mission.querySelector('[data-widget-body="KOREA_SPACE"]'), koreaLaunches.slice(0, 3).map(item => ({
    title: item.name, copy: `${formatKst(item.scheduledAt)} KST · ${item.site}`,
    tail: countdownLabel(item.scheduledAt),
  })), 'LL2 현재 응답에 확인된 한국 발사 일정이 없습니다.');
  stateBadge(mission, 'KOREA_SPACE', koreaLaunches.length
    ? sourceBadge(data, 'launches', 'LL2') : unavailable);

  const spacexLaunches = providerLaunches(launches, /spacex|falcon|dragon/i);
  renderRows(mission.querySelector('[data-widget-body="SPACEX"]'), spacexLaunches.slice(0, 3).map(item => ({
    title: item.name, copy: `${formatKst(item.scheduledAt)} KST · ${item.status}`,
    tail: countdownLabel(item.scheduledAt),
  })), 'LL2 현재 응답에 확인된 SpaceX 일정이 없습니다.');
  stateBadge(mission, 'SPACEX', spacexLaunches.length
    ? sourceBadge(data, 'launches', 'LL2') : unavailable);

  const starshipLaunches = providerLaunches(launches, /starship|super heavy/i);
  renderRows(mission.querySelector('[data-widget-body="STARSHIP"]'), starshipLaunches.slice(0, 3).map(item => ({
    title: item.name, copy: `${formatKst(item.scheduledAt)} KST · ${item.status}`,
    tail: countdownLabel(item.scheduledAt),
  })), 'LL2 현재 응답에 확인된 Starship 일정이 없습니다.');
  stateBadge(mission, 'STARSHIP', starshipLaunches.length
    ? sourceBadge(data, 'launches', 'LL2') : unavailable);

  const jwstBody = mission.querySelector('[data-widget-body="JWST"]'); jwstBody.replaceChildren();
  const jwst = latestTelescopePhoto(data.photos, 'JWST');
  if (jwst) {
    const card = document.createElement('button'); card.type = 'button';
    card.className = 'mission-jwst-card'; card.dataset.missionRoute = 'photos';
    const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy';
    image.src = new URL(`/${String(jwst.thumb || '').replace(/^\//, '')}`, location.origin).href;
    const copy = document.createElement('span');
    const title = document.createElement('b'); title.textContent = jwst.name?.ko || jwst.name?.en || jwst.id;
    const meta = document.createElement('small'); meta.textContent = `${jwst.date || '공개일 미수신'} · ${jwst.credit || 'credit 미수신'}`;
    copy.append(title, meta); card.append(image, copy); jwstBody.append(card);
    stateBadge(mission, 'JWST', sourceBadge(data, 'photos', `PROVENANCE · ${jwst.date || 'DATE N/A'}`));
  } else {
    const empty = document.createElement('p'); empty.className = 'mission-widget-empty';
    empty.textContent = 'JWST provenance 사진 목록을 받지 못했습니다.'; jwstBody.append(empty);
    stateBadge(mission, 'JWST', unavailable);
  }

  const rooms = mission.querySelector('[data-widget-body="CONTROL_ROOMS"]');
  rooms.replaceChildren();
  ROOM_TEMPLATES.forEach(([id, title, icon]) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'mission-room-row'; button.dataset.room = id;
    button.classList.toggle('current', state.activeRoom === id);
    button.setAttribute('aria-pressed', state.activeRoom === id ? 'true' : 'false');
    button.innerHTML = `<span aria-hidden="true">${icon}</span><b>${title}</b><i>${state.activeRoom === id ? 'ACTIVE' : ''}</i>`;
    rooms.append(button);
  });
  stateBadge(mission, 'CONTROL_ROOMS', { label: 'DEVICE LOCAL', state: 'ready' });

  const marker = mission.querySelector('[data-launch-marker]');
  marker.hidden = !next || currentRoomLayout(state).hidden.includes('NEXT_LAUNCH');
  if (next) {
    setText(marker, '[data-launch-name]', next.name);
    setText(marker, '[data-launch-site]', next.site);
    setText(marker, '[data-launch-marker-state]', `${next.status} · 일정 위치`);
  }

  const following = state.followingLaunchId ? launches.find(item => item.id === state.followingLaunchId) : null;
  const followingList = mission.querySelector('[data-following-list]'); followingList.replaceChildren();
  if (following) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'mission-following-row current';
    row.dataset.unfollowLaunch = following.id;
    row.innerHTML = '<span aria-hidden="true">△</span><span><b></b><small></small></span><i>×</i>';
    row.querySelector('b').textContent = following.name;
    row.querySelector('small').textContent = `${countdownLabel(following.scheduledAt)} · ${following.status}`;
    followingList.append(row);
  } else if (next) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'mission-following-row';
    row.dataset.followLaunch = next.id;
    row.innerHTML = '<span aria-hidden="true">＋</span><span><b>다음 발사 팔로우</b><small></small></span><i>›</i>';
    row.querySelector('small').textContent = next.name;
    followingList.append(row);
  } else {
    const copy = document.createElement('p'); copy.className = 'mission-widget-empty';
    copy.textContent = '팔로우할 검증 일정이 없습니다.'; followingList.append(copy);
  }
  setText(mission, '[data-following-count]', following ? '1' : '0');
  renderStatusCenter(mission, data, state);
}

function renderEditor(mission, state) {
  const layout = currentRoomLayout(state);
  const roomPicker = mission.querySelector('[data-room-picker]'); roomPicker.replaceChildren();
  ROOM_TEMPLATES.forEach(([id, title]) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.room = id;
    button.classList.toggle('current', state.activeRoom === id); button.textContent = title;
    button.setAttribute('aria-pressed', state.activeRoom === id ? 'true' : 'false');
    roomPicker.append(button);
  });
  const list = mission.querySelector('[data-editor-widgets]'); list.replaceChildren();
  EDITABLE_WIDGETS.forEach(([id, title]) => {
    const row = document.createElement('div'); row.className = 'mission-editor-row'; row.dataset.editorWidget = id;
    const name = document.createElement('b'); name.textContent = title;
    const visibility = document.createElement('button'); visibility.type = 'button';
    visibility.dataset.layoutToggle = id; visibility.textContent = layout.hidden.includes(id) ? '표시' : '숨김';
    visibility.setAttribute('aria-label', `${title} 위젯 ${visibility.textContent}`);
    const size = document.createElement('button'); size.type = 'button';
    size.dataset.layoutSize = id; size.textContent = layout.wide.includes(id) ? '기본 크기' : '넓게';
    size.setAttribute('aria-label', `${title} 위젯 ${size.textContent}`);
    const up = document.createElement('button'); up.type = 'button'; up.dataset.layoutMove = id; up.dataset.direction = 'up'; up.textContent = '↑';
    const down = document.createElement('button'); down.type = 'button'; down.dataset.layoutMove = id; down.dataset.direction = 'down'; down.textContent = '↓';
    up.setAttribute('aria-label', `${title} 위젯 위로 이동`);
    down.setAttribute('aria-label', `${title} 위젯 아래로 이동`);
    const isBottom = BOTTOM_WIDGETS.includes(id);
    size.hidden = !isBottom; up.hidden = !isBottom; down.hidden = !isBottom;
    row.append(name, visibility, size, up, down); list.append(row);
  });
}

function applyLayout(mission, state) {
  const layout = currentRoomLayout(state);
  mission.querySelectorAll('[data-widget]').forEach(widget => {
    const id = widget.dataset.widget;
    widget.hidden = layout.hidden.includes(id);
    widget.classList.toggle('is-wide', layout.wide.includes(id));
    const order = layout.order.indexOf(id);
    if (order >= 0) widget.style.order = String(order);
  });
  mission.dataset.room = state.activeRoom;
  renderEditor(mission, state);
  applyFilter(mission, state);
}

function applyFilter(mission, state) {
  const allowed = FILTER_WIDGETS[state.activeFilter] || null;
  mission.querySelectorAll('[data-widget]').forEach(widget => {
    widget.classList.toggle('is-filtered-out', Boolean(allowed) && !allowed.includes(widget.dataset.widget));
  });
  mission.querySelectorAll('[data-mission-filter]').forEach(button => {
    const current = button.dataset.missionFilter === state.activeFilter;
    button.classList.toggle('current', current);
    button.setAttribute('aria-pressed', current ? 'true' : 'false');
  });
  mission.dataset.filter = state.activeFilter;
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function createAetherusMissionControl({ root, onRoute, onCraft }) {
  if (!root) return null;
  ensureStylesheet(); decorateExperienceNav(root);
  const mission = buildMarkup(); root.append(mission);
  const state = safeStoredState();
  const data = { launches: [], launchRetrievedAt: null, kp: null, aurora: null,
    photos: null, satellitePass: null,
    sourceModes: { photos: 'unavailable', kp: 'unavailable', aurora: 'unavailable', launches: 'unavailable' },
    sourceRetrievedAt: { photos: null, kp: null, aurora: null, launches: null } };
  let lastRefresh = 0; let refreshPromise = null;

  const announce = copy => { setText(mission, '[data-mission-announcement]', copy); };
  const persistAndRender = copy => {
    const saved = saveState(state); applyLayout(mission, state); renderMissionData(mission, data, state);
    announce(saved ? copy : `${copy} · 기기 저장은 사용할 수 없습니다.`);
  };

  // 편집기 안쪽 목록은 설정을 적용할 때마다 교체된다. 편집기 자체에서 먼저
  // 이벤트를 받아야 크기·표시·순서 버튼이 다시 그려진 뒤에도 일관되게 동작한다.
  const editor = mission.querySelector('[data-mission-editor]');
  const statusPanel = mission.querySelector('[data-mission-status]');
  let editorReturnFocus = null;
  let statusReturnFocus = null;
  const closeEditor = () => {
    editor.hidden = true; mission.classList.remove('is-editing');
    editorReturnFocus?.focus?.(); editorReturnFocus = null;
    announce('레이아웃 편집을 닫았습니다.');
  };
  const openEditor = trigger => {
    if (!statusPanel.hidden) {
      statusPanel.hidden = true; mission.classList.remove('is-status-open');
      mission.querySelector('[data-mission-status-open]')?.setAttribute('aria-expanded', 'false');
      statusReturnFocus = null;
    }
    editorReturnFocus = trigger || document.activeElement;
    editor.hidden = false; mission.classList.add('is-editing');
    renderEditor(mission, state); mission.querySelector('[data-mission-editor-close]')?.focus();
    announce('레이아웃 편집 대화상자를 열었습니다.');
  };
  const handleEditorClick = event => {
    if (event.__aetherusEditorHandled) return;
    event.__aetherusEditorHandled = true;
    if (event.target.closest('[data-mission-editor-close]')) {
      event.stopPropagation(); closeEditor(); return;
    }
    const roomButton = event.target.closest('.mission-room-picker [data-room]');
    const room = roomButton?.dataset.room;
    if (room && ROOM_TEMPLATES.some(([id]) => id === room)) {
      event.stopPropagation(); state.activeRoom = room;
      persistAndRender(`${roomButton.textContent.trim()} 룸을 적용했습니다.`); return;
    }
    const toggle = event.target.closest('[data-layout-toggle]')?.dataset.layoutToggle;
    if (toggle) {
      event.stopPropagation();
      const layout = currentRoomLayout(state);
      layout.hidden = layout.hidden.includes(toggle)
        ? layout.hidden.filter(id => id !== toggle) : [...layout.hidden, toggle];
      persistAndRender(`${EDITABLE_WIDGETS.find(([id]) => id === toggle)?.[1]} 표시 상태를 변경했습니다.`); return;
    }
    const size = event.target.closest('[data-layout-size]')?.dataset.layoutSize;
    if (size) {
      event.stopPropagation();
      const layout = currentRoomLayout(state);
      layout.wide = layout.wide.includes(size)
        ? layout.wide.filter(id => id !== size) : [...layout.wide, size];
      persistAndRender(`${EDITABLE_WIDGETS.find(([id]) => id === size)?.[1]} 크기를 변경했습니다.`); return;
    }
    const moveButton = event.target.closest('[data-layout-move]');
    if (moveButton) {
      event.stopPropagation();
      const layout = currentRoomLayout(state);
      const id = moveButton.dataset.layoutMove; const index = layout.order.indexOf(id);
      const nextIndex = moveButton.dataset.direction === 'up' ? index - 1 : index + 1;
      if (index >= 0 && nextIndex >= 0 && nextIndex < layout.order.length) {
        [layout.order[index], layout.order[nextIndex]] = [layout.order[nextIndex], layout.order[index]];
        persistAndRender(`${EDITABLE_WIDGETS.find(([item]) => item === id)?.[1]} 순서를 변경했습니다.`);
      }
      return;
    }
    if (event.target.closest('[data-layout-reset]')) {
      event.stopPropagation();
      const defaults = defaultRoomLayouts()[state.activeRoom];
      state.rooms[state.activeRoom] = defaults; state.followingLaunchId = null;
      persistAndRender(`${ROOM_TEMPLATES.find(([id]) => id === state.activeRoom)?.[1]} 기본 배치를 복원했습니다.`);
    }
  };
  editor.addEventListener('click', handleEditorClick, true);
  editor.onclick = handleEditorClick;

  const closeStatus = ({ restoreFocus = true } = {}) => {
    statusPanel.hidden = true; mission.classList.remove('is-status-open');
    mission.querySelector('[data-mission-status-open]')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) statusReturnFocus?.focus?.();
    statusReturnFocus = null;
    announce('관제 알림센터를 닫았습니다.');
  };
  const openStatus = trigger => {
    if (!editor.hidden) {
      editor.hidden = true; mission.classList.remove('is-editing'); editorReturnFocus = null;
    }
    statusReturnFocus = trigger || document.activeElement;
    statusPanel.hidden = false; mission.classList.add('is-status-open');
    mission.querySelector('[data-mission-status-open]')?.setAttribute('aria-expanded', 'true');
    statusPanel.querySelector('[data-mission-status-close]')?.focus();
    announce('현재 자료 상태를 표시하는 관제 알림센터를 열었습니다.');
  };

  const decorateMenu = () => {
    const list = document.querySelector('#menuSub .aetherus-menu-list'); if (!list) return;
    let button = list.querySelector('[data-aetherus-route="mission"]');
    if (!button) {
      button = makeMenuMissionButton(onRoute);
      const intro = list.querySelector('.aetherus-menu-intro'); intro ? intro.after(button) : list.prepend(button);
    }
    list.querySelectorAll('.aetherus-route').forEach(item => {
      const active = !mission.hidden && item.dataset.aetherusRoute === 'mission';
      if (!mission.hidden && item.dataset.aetherusRoute === 'solar') item.classList.remove('current');
      item.classList.toggle('current', active); item.setAttribute('aria-current', active ? 'page' : 'false');
    });
  };
  const menuRoot = document.getElementById('menuSub');
  if (menuRoot) new MutationObserver(decorateMenu).observe(menuRoot, { childList: true, subtree: true });

  const syncFullscreenState = () => {
    const active = fullscreenElement() === root;
    mission.classList.toggle('is-fullscreen', active);
    const button = mission.querySelector('[data-mission-fullscreen]');
    button?.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (button) button.setAttribute('aria-label', `${active ? '관제센터 전체화면 종료' : '관제센터 전체화면'}, 단축키 F`);
  };
  const toggleFullscreen = async () => {
    try {
      if (fullscreenElement() === root) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) throw new Error('이 브라우저는 전체화면 종료를 지원하지 않습니다.');
        await exit.call(document); announce('관제센터 전체화면을 종료했습니다.');
      } else {
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) throw new Error('이 브라우저는 전체화면을 지원하지 않습니다.');
        await request.call(root); announce('관제센터 전체화면입니다. F 키로 종료할 수 있습니다.');
      }
      syncFullscreenState();
    } catch (error) {
      announce(error?.message || '전체화면을 전환하지 못했습니다.');
    }
  };
  document.addEventListener('fullscreenchange', syncFullscreenState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenState);

  const calculateSatellitePass = async () => {
    data.satellitePass = { status: 'loading', message: '위치와 최신 위성 궤도 요소를 확인하고 있습니다.' };
    renderMissionData(mission, data, state);
    try {
      const [{ myLocation }, { orbits }, { computePasses, azName }] = await Promise.all([
        import('../mylocation.js'), import('../layers/space.js'), import('../passes.js'),
      ]);
      const position = await myLocation.locate(true);
      if (!position) throw new Error(myLocation.reason() || '위치를 가져오지 못했습니다.');
      const catalog = await orbits.loadCatalog();
      const stationRows = Array.isArray(catalog?.groups?.stations) ? catalog.groups.stations : [];
      const issRow = stationRows.find(row => String(row?.id) === '25544' || /ISS \(ZARYA\)/i.test(row?.n || ''));
      if (!issRow) throw new Error('위성 카탈로그에서 ISS 궤도 요소를 찾지 못했습니다.');
      const iss = orbits.toSat(issRow, { id: 'stations', color: '#69d7f4' });
      if (!iss?.rec) throw new Error('ISS 궤도 요소를 계산 형식으로 변환하지 못했습니다.');
      const passes = computePasses(iss.rec, { lat: position.lat, lon: position.lon, alt: 0.05 }, 48, 5);
      data.satellitePass = {
        status: 'ready', rows: passes.map(item => ({
          title: `${formatKst(item.start)} KST · 최대앙각 ${item.maxEl}°`,
          copy: `${azName(item.startAz)} → ${azName(item.endAz)} · ${item.minutes}분 · SGP4 계산`,
          tail: `${item.minKm.toLocaleString()} km`,
        })),
      };
    } catch (error) {
      data.satellitePass = { status: 'error', message: error?.message || 'ISS 통과를 계산하지 못했습니다.' };
    }
    renderMissionData(mission, data, state);
  };

  mission.addEventListener('click', event => {
    if (event.target.closest('[data-mission-status-open]')) {
      if (statusPanel.hidden) openStatus(event.target.closest('[data-mission-status-open]'));
      else closeStatus();
      return;
    }
    if (event.target.closest('[data-mission-status-close]')) { closeStatus(); return; }
    if (event.target.closest('[data-mission-status-refresh]')) {
      refresh({ force: true }).then(() => announce('관제 자료 상태를 새로고침했습니다.'))
        .catch(() => announce('일부 자료를 새로고침하지 못해 마지막 성공 상태를 유지합니다.'));
      return;
    }
    if (event.target.closest('[data-mission-satellite-pass]')) {
      calculateSatellitePass(); return;
    }
    const route = event.target.closest('[data-mission-route]')?.dataset.missionRoute;
    if (route) { onRoute(route); return; }
    const craft = event.target.closest('[data-mission-craft]')?.dataset.missionCraft;
    if (craft) { onCraft(craft); return; }
    const filter = event.target.closest('[data-mission-filter]');
    if (filter) {
      state.activeFilter = filter.dataset.missionFilter; applyFilter(mission, state);
      announce(`${filter.textContent.trim()} 자료 필터를 선택했습니다.`); return;
    }
    if (event.target.closest('[data-mission-fullscreen]')) { toggleFullscreen(); return; }
    if (event.target.closest('[data-mission-edit]')) {
      openEditor(event.target.closest('[data-mission-edit]')); return;
    }
    const roomButton = event.target.closest('.mission-room-row[data-room]');
    const room = roomButton?.dataset.room;
    if (room && ROOM_TEMPLATES.some(([id]) => id === room)) {
      state.activeRoom = room; persistAndRender(`${roomButton.textContent.trim()} 룸을 적용했습니다.`); return;
    }
    const follow = event.target.closest('[data-follow-launch]')?.dataset.followLaunch;
    if (follow) { state.followingLaunchId = follow; persistAndRender('다음 발사를 이 기기에서 팔로우합니다.'); return; }
    if (event.target.closest('[data-unfollow-launch]')) {
      state.followingLaunchId = null; persistAndRender('발사 팔로우를 해제했습니다.'); return;
    }
  });

  const handleKeyboard = event => {
    if (mission.hidden || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const typing = event.target instanceof HTMLElement
      && (event.target.matches('input,textarea,select') || event.target.isContentEditable);
    if (!statusPanel.hidden) {
      if (event.key === 'Escape' || event.code === 'KeyN') {
        event.preventDefault(); closeStatus(); return;
      }
      if (event.key === 'Tab') {
        const focusable = [...statusPanel.querySelectorAll('button:not([disabled]),a[href]')]
          .filter(node => !node.hidden && node.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
      return;
    }
    if (!editor.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeEditor(); return; }
      if (event.key === 'Tab') {
        const focusable = [...editor.querySelectorAll('button:not([disabled]),a[href],input,select,textarea')]
          .filter(node => !node.hidden && node.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
      return;
    }
    if (typing) return;
    if (event.code === 'KeyN') {
      event.preventDefault(); openStatus(mission.querySelector('[data-mission-status-open]')); return;
    }
    if (event.code === 'KeyF') { event.preventDefault(); toggleFullscreen(); return; }
    if (event.code === 'KeyE') { event.preventDefault(); openEditor(document.activeElement); return; }
    const roomIndex = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
    if (roomIndex >= 0) {
      event.preventDefault(); const [room, title] = ROOM_TEMPLATES[roomIndex];
      state.activeRoom = room; persistAndRender(`${title} 룸을 적용했습니다.`);
    }
  };
  document.addEventListener('keydown', handleKeyboard);

  const refresh = async ({ force = false } = {}) => {
    if (refreshPromise) return refreshPromise;
    const now = Date.now(); if (!force && now - lastRefresh < REFRESH_MS) return null;
    lastRefresh = now;
    const previousCache = safeDataCache();
    refreshPromise = Promise.allSettled([
      fetchT(PHOTO_CATALOG, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`PHOTO_${response.status}`); return response.json();
      }),
      fetchT(API.KP, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`KP_${response.status}`); return response.json();
      }),
      fetchT(API.AURORA, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`AURORA_${response.status}`); return response.json();
      }),
      fetchT(launchListUrl(), { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`LAUNCH_${response.status}`); return response.json();
      }),
    ]).then(([photos, kp, aurora, launches]) => {
      const refreshedAt = new Date();
      const nextCache = { ...previousCache };
      const useSource = (name, liveValue, validate) => {
        if (validate(liveValue)) {
          const entry = cacheEntry(liveValue, refreshedAt); nextCache[name] = entry;
          data.sourceModes[name] = 'live'; data.sourceRetrievedAt[name] = entry.retrievedAt;
          return liveValue;
        }
        const cached = validCachedSource(previousCache, name, validate);
        if (cached) {
          data.sourceModes[name] = 'cached'; data.sourceRetrievedAt[name] = cached.retrievedAt;
          return cached.value;
        }
        data.sourceModes[name] = 'unavailable'; data.sourceRetrievedAt[name] = null;
        return null;
      };

      const livePhotos = photos.status === 'fulfilled' ? photos.value : null;
      data.photos = useSource('photos', livePhotos, value => Array.isArray(value?.items));

      const rows = kp.status === 'fulfilled' && Array.isArray(kp.value)
        ? kp.value.filter(row => row?.kp_index != null && row?.time_tag) : [];
      const latest = rows[rows.length - 1]; const value = Number(latest?.kp_index);
      const liveKp = latest && Number.isFinite(value) ? { value, observedAt: latest.time_tag } : null;
      data.kp = useSource('kp', liveKp, item => Number.isFinite(Number(item?.value)) && Boolean(item?.observedAt));

      const liveAurora = aurora.status === 'fulfilled' ? normalizeAurora(aurora.value) : null;
      data.aurora = useSource('aurora', liveAurora,
        item => Number.isFinite(Number(item?.max)) && Number(item?.sampleCount) > 0);

      const liveLaunches = launches.status === 'fulfilled' ? normalizeLaunches(launches.value) : null;
      data.launches = useSource('launches', liveLaunches,
        items => Array.isArray(items) && items.every(item => item?.id && item?.scheduledAt)) || [];
      data.launchRetrievedAt = data.sourceRetrievedAt.launches;
      saveDataCache(nextCache);
      if (data.photos) {
        const hst = data.photos.items.filter(item => item.telescope === 'HST').length;
        const jwst = data.photos.items.filter(item => item.telescope === 'JWST').length;
        mission.dataset.photoCount = String(data.photos.items.length);
        mission.dataset.photoSummary = `HST ${hst} / JWST ${jwst}`;
        setText(mission, '[data-mission-photo-count]',
          `${data.photos.items.length}장 · HST ${hst} / JWST ${jwst}${data.sourceModes.photos === 'cached' ? ' · 캐시' : ''}`);
      } else {
        setText(mission, '[data-mission-photo-count]', '사진 목록 미수신');
      }
      renderMissionData(mission, data, state);
      const cachedCount = Object.values(data.sourceModes).filter(mode => mode === 'cached').length;
      if (cachedCount) announce(`연결되지 않은 ${cachedCount}개 자료는 마지막 성공 캐시와 저장 시각을 표시합니다.`);
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  };

  applyLayout(mission, state); renderMissionData(mission, data, state);
  return {
    root: mission,
    setOpen(open) {
      mission.hidden = !open; root.classList.toggle('is-dashboard', open);
      if (open) {
        setText(mission, '[data-mission-device-time]', formatKst(new Date(), true));
        refresh().catch(error => console.warn('[aetherus-mission]', error.message));
      } else {
        editor.hidden = true; mission.classList.remove('is-editing'); editorReturnFocus = null;
        if (!statusPanel.hidden) closeStatus({ restoreFocus: false });
        mission.classList.remove('is-status-open');
        if (fullscreenElement() === root) {
          const exit = document.exitFullscreen || document.webkitExitFullscreen;
          exit?.call(document).catch?.(() => {});
        }
      }
      decorateMenu();
    },
    refresh,
  };
}
