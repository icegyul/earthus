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
const REFRESH_MS = 5 * 60 * 1000;
const ROOM_TEMPLATES = Object.freeze([
  ['SPACE_CONTROL', 'SPACE CONTROL', '◈'],
  ['WEATHER_CENTER', 'WEATHER CENTER', '☼'],
  ['ASTRONOMY_LAB', 'ASTRONOMY LAB', '✦'],
  ['SATELLITE_TRACKING', 'SATELLITE TRACKING', '⌁'],
]);
const EDITABLE_WIDGETS = Object.freeze([
  ['FOLLOWING', 'Following'], ['LIVE', 'Live Stream'], ['COUNTDOWN', 'Countdown'],
  ['MISSION_TIMELINE', 'Mission Timeline'], ['PAYLOAD_STATUS', 'Payload Status'],
  ['UPCOMING_LAUNCHES', 'Upcoming Launches'], ['TONIGHT', 'Tonight Above Me'],
  ['SPACE_WEATHER', 'Space Weather'], ['EARTH_WEATHER', 'Earth Weather'],
  ['CONTROL_ROOMS', 'My Control Rooms'],
]);
const DEFAULT_STATE = Object.freeze({
  activeRoom: 'SPACE_CONTROL',
  hidden: [],
  wide: [],
  order: ['UPCOMING_LAUNCHES', 'TONIGHT', 'SPACE_WEATHER', 'EARTH_WEATHER', 'CONTROL_ROOMS'],
  followingLaunchId: null,
});

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../../css/aetherus-dashboard.css?v=20260815-mc10', import.meta.url).href;
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
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_STATE, hidden: [], wide: [], order: [...DEFAULT_STATE.order] };
    }
    const allowedWidgets = new Set(EDITABLE_WIDGETS.map(([id]) => id));
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter(id => allowedWidgets.has(id)) : [];
    const wide = Array.isArray(parsed.wide) ? parsed.wide.filter(id => allowedWidgets.has(id)) : [];
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter(id => DEFAULT_STATE.order.includes(id)) : [...DEFAULT_STATE.order];
    DEFAULT_STATE.order.forEach(id => { if (!order.includes(id)) order.push(id); });
    return {
      activeRoom: ROOM_TEMPLATES.some(([id]) => id === parsed.activeRoom)
        ? parsed.activeRoom : DEFAULT_STATE.activeRoom,
      hidden, wide, order,
      followingLaunchId: typeof parsed.followingLaunchId === 'string' ? parsed.followingLaunchId : null,
    };
  } catch {
    return { ...DEFAULT_STATE, order: [...DEFAULT_STATE.order] };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeRoom: state.activeRoom,
      hidden: [...state.hidden],
      wide: [...state.wide],
      order: [...state.order],
      followingLaunchId: state.followingLaunchId,
    }));
    return true;
  } catch {
    return false;
  }
}

function routeButton(route, icon, label) {
  return `<button type="button" data-mission-route="${route}"><span aria-hidden="true">${icon}</span>`
    + `<b>${label}</b><i aria-hidden="true">›</i></button>`;
}

function widgetShell(type, title, className = '') {
  return `<article class="mission-widget ${className}" data-widget="${type}">`
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
          <button type="button" class="current" data-mission-filter="all">전체</button>
          <button type="button" data-mission-filter="launches">발사</button>
          <button type="button" data-mission-filter="satellites">위성</button>
          <button type="button" data-mission-filter="iss">ISS</button>
          <button type="button" data-mission-filter="weather">날씨</button>
          <button type="button" data-mission-filter="astronomy">천문</button>
        </div>
        <button type="button" class="mission-edit-button" data-mission-edit>레이아웃 편집</button>
      </div>
      <div class="mission-orbit-diagram" aria-label="실시간 위치가 아닌 궤도 구조 도식">
        <i class="mission-orbit mission-orbit-a"></i><i class="mission-orbit mission-orbit-b"></i>
        <span class="mission-orbit-label mission-orbit-label-a">HUBBLE · 궤도 도식</span>
        <span class="mission-orbit-label mission-orbit-label-b">JWST · L2 도식</span>
      </div>
      <div class="mission-launch-marker" data-launch-marker hidden>
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
    </section>

    <aside class="mission-editor mission-surface" data-mission-editor hidden aria-label="미션 컨트롤 레이아웃 편집">
      <header><span><b>레이아웃 편집</b><small>무료 · 현재 기기에 저장</small></span>
        <button type="button" data-mission-editor-close aria-label="편집 닫기">×</button></header>
      <div class="mission-room-picker" data-room-picker></div>
      <div class="mission-editor-widgets" data-editor-widgets></div>
      <footer><button type="button" data-layout-reset>기본 배치 복원</button>
        <button type="button" data-mission-editor-close>완료</button></footer>
    </aside>
    <p class="mission-announcement" data-mission-announcement aria-live="polite"></p>`;
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
    url.searchParams.set('limit', '6');
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
    latitude: Number.isFinite(Number(item.pad?.latitude)) ? Number(item.pad.latitude) : null,
    longitude: Number.isFinite(Number(item.pad?.longitude)) ? Number(item.pad.longitude) : null,
    missionType: item.mission?.type || null, missionName: item.mission?.name || null,
  }));
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

function renderMissionData(mission, data, state) {
  const launches = data.launches || [];
  const next = launches[0] || null;
  const retrieved = data.launchRetrievedAt ? formatKst(data.launchRetrievedAt) : '조회 시각 미수신';
  const unavailable = { label: 'UNAVAILABLE', state: 'unavailable' };
  const ready = { label: 'READY', state: 'ready' };

  const liveBody = mission.querySelector('[data-widget-body="LIVE"]');
  liveBody.replaceChildren();
  const liveCopy = document.createElement('div'); liveCopy.className = 'mission-live-copy';
  const liveTitle = document.createElement('strong');
  liveTitle.textContent = next?.webcastLive ? '공식 생중계 편성 확인 필요' : '현재 확인된 생중계 없음';
  const liveMeta = document.createElement('p');
  liveMeta.textContent = '임의 영상·LIVE 표시는 사용하지 않습니다.';
  const liveLink = document.createElement('a');
  liveLink.href = 'https://www.nasa.gov/live/'; liveLink.target = '_blank';
  liveLink.rel = 'noopener noreferrer'; liveLink.textContent = 'NASA 공식 LIVE ↗';
  liveCopy.append(liveTitle, liveMeta, liveLink); liveBody.append(liveCopy);
  stateBadge(mission, 'LIVE', next?.webcastLive ? ready : unavailable);

  const countdownBody = mission.querySelector('[data-widget-body="COUNTDOWN"]');
  countdownBody.replaceChildren();
  const countdown = document.createElement('strong'); countdown.className = 'mission-countdown';
  countdown.textContent = next ? countdownLabel(next.scheduledAt) : '--';
  const countdownName = document.createElement('b'); countdownName.textContent = next?.name || '다음 일정 미수신';
  const countdownTime = document.createElement('small');
  countdownTime.textContent = next ? `${formatKst(next.scheduledAt)} KST · ${next.status}` : 'Launch Library 2 응답 없음';
  countdownBody.append(countdownName, countdown, countdownTime);
  stateBadge(mission, 'COUNTDOWN', next ? ready : unavailable);

  renderRows(mission.querySelector('[data-widget-body="MISSION_TIMELINE"]'), next ? [
    { title: '일정 등록', copy: formatKst(next.scheduledAt) + ' KST', tail: next.status },
    { title: '발사 세부 타임라인', copy: '공식 이벤트 단계 미수신', tail: '—' },
    { title: '궤도 투입·분리', copy: '확인 전에는 표시하지 않음', tail: '—' },
  ] : [], '검증 가능한 미션 타임라인이 없습니다.');
  stateBadge(mission, 'MISSION_TIMELINE', next ? ready : unavailable);

  renderRows(mission.querySelector('[data-widget-body="PAYLOAD_STATUS"]'), next ? [
    { title: next.missionName || 'Payload manifest 미수신', copy: next.missionType || '임무 유형 미수신', tail: '예정' },
    { title: '분리·첫 교신 상태', copy: '공식 확인 전에는 비워 둠', tail: '—' },
  ] : [], '검증 가능한 payload 자료가 없습니다.');
  stateBadge(mission, 'PAYLOAD_STATUS', next ? { label: 'SCHEDULED', state: 'ready' } : unavailable);

  renderRows(mission.querySelector('[data-widget-body="UPCOMING_LAUNCHES"]'), launches.slice(0, 4).map(item => ({
    title: item.name, copy: `${formatKst(item.scheduledAt)} KST · ${item.provider}`,
    tail: countdownLabel(item.scheduledAt),
  })), '발사 일정 응답이 없습니다.');
  stateBadge(mission, 'UPCOMING_LAUNCHES', launches.length ? { label: `LL2 · ${retrieved}`, state: 'ready' } : unavailable);

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
  stateBadge(mission, 'SPACE_WEATHER', data.kp ? { label: 'OBSERVED', state: 'ready' } : unavailable);

  const earthWeather = mission.querySelector('[data-widget-body="EARTH_WEATHER"]');
  earthWeather.replaceChildren();
  const weatherTitle = document.createElement('strong'); weatherTitle.textContent = '위치 미선택';
  const weatherCopy = document.createElement('p'); weatherCopy.textContent = 'Earthus에서 위치를 선택하면 공식 관측을 연결합니다.';
  const weatherButton = document.createElement('button'); weatherButton.type = 'button';
  weatherButton.dataset.missionRoute = 'earth'; weatherButton.textContent = '지구에서 위치 선택';
  earthWeather.append(weatherTitle, weatherCopy, weatherButton);
  stateBadge(mission, 'EARTH_WEATHER', unavailable);

  const rooms = mission.querySelector('[data-widget-body="CONTROL_ROOMS"]');
  rooms.replaceChildren();
  ROOM_TEMPLATES.forEach(([id, title, icon]) => {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'mission-room-row'; button.dataset.room = id;
    button.classList.toggle('current', state.activeRoom === id);
    button.innerHTML = `<span aria-hidden="true">${icon}</span><b>${title}</b><i>${state.activeRoom === id ? 'ACTIVE' : ''}</i>`;
    rooms.append(button);
  });
  stateBadge(mission, 'CONTROL_ROOMS', { label: 'DEVICE LOCAL', state: 'ready' });

  const marker = mission.querySelector('[data-launch-marker]');
  marker.hidden = !next;
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
}

function renderEditor(mission, state) {
  const roomPicker = mission.querySelector('[data-room-picker]'); roomPicker.replaceChildren();
  ROOM_TEMPLATES.forEach(([id, title]) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.room = id;
    button.classList.toggle('current', state.activeRoom === id); button.textContent = title;
    roomPicker.append(button);
  });
  const list = mission.querySelector('[data-editor-widgets]'); list.replaceChildren();
  EDITABLE_WIDGETS.forEach(([id, title]) => {
    const row = document.createElement('div'); row.className = 'mission-editor-row'; row.dataset.editorWidget = id;
    const name = document.createElement('b'); name.textContent = title;
    const visibility = document.createElement('button'); visibility.type = 'button';
    visibility.dataset.layoutToggle = id; visibility.textContent = state.hidden.includes(id) ? '표시' : '숨김';
    const size = document.createElement('button'); size.type = 'button';
    size.dataset.layoutSize = id; size.textContent = state.wide.includes(id) ? '기본 크기' : '넓게';
    const up = document.createElement('button'); up.type = 'button'; up.dataset.layoutMove = id; up.dataset.direction = 'up'; up.textContent = '↑';
    const down = document.createElement('button'); down.type = 'button'; down.dataset.layoutMove = id; down.dataset.direction = 'down'; down.textContent = '↓';
    const isBottom = DEFAULT_STATE.order.includes(id);
    size.hidden = !isBottom; up.hidden = !isBottom; down.hidden = !isBottom;
    row.append(name, visibility, size, up, down); list.append(row);
  });
}

function applyLayout(mission, state) {
  mission.querySelectorAll('[data-widget]').forEach(widget => {
    const id = widget.dataset.widget;
    widget.hidden = state.hidden.includes(id);
    widget.classList.toggle('is-wide', state.wide.includes(id));
    const order = state.order.indexOf(id);
    if (order >= 0) widget.style.order = String(order);
  });
  mission.dataset.room = state.activeRoom;
  renderEditor(mission, state);
}

export function createAetherusMissionControl({ root, onRoute, onCraft }) {
  if (!root) return null;
  ensureStylesheet(); decorateExperienceNav(root);
  const mission = buildMarkup(); root.append(mission);
  const state = safeStoredState();
  const data = { launches: [], launchRetrievedAt: null, kp: null, photos: null };
  let lastRefresh = 0; let refreshPromise = null;

  const announce = copy => { setText(mission, '[data-mission-announcement]', copy); };
  const persistAndRender = copy => {
    const saved = saveState(state); applyLayout(mission, state); renderMissionData(mission, data, state);
    announce(saved ? copy : `${copy} · 기기 저장은 사용할 수 없습니다.`);
  };

  // 편집기 안쪽 목록은 설정을 적용할 때마다 교체된다. 편집기 자체에서 먼저
  // 이벤트를 받아야 크기·표시·순서 버튼이 다시 그려진 뒤에도 일관되게 동작한다.
  const editor = mission.querySelector('[data-mission-editor]');
  const handleEditorClick = event => {
    if (event.__aetherusEditorHandled) return;
    event.__aetherusEditorHandled = true;
    if (event.target.closest('[data-mission-editor-close]')) {
      event.stopPropagation(); editor.hidden = true; mission.classList.remove('is-editing'); return;
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
      state.hidden = state.hidden.includes(toggle) ? state.hidden.filter(id => id !== toggle) : [...state.hidden, toggle];
      persistAndRender(`${EDITABLE_WIDGETS.find(([id]) => id === toggle)?.[1]} 표시 상태를 변경했습니다.`); return;
    }
    const size = event.target.closest('[data-layout-size]')?.dataset.layoutSize;
    if (size) {
      event.stopPropagation();
      state.wide = state.wide.includes(size) ? state.wide.filter(id => id !== size) : [...state.wide, size];
      persistAndRender(`${EDITABLE_WIDGETS.find(([id]) => id === size)?.[1]} 크기를 변경했습니다.`); return;
    }
    const moveButton = event.target.closest('[data-layout-move]');
    if (moveButton) {
      event.stopPropagation();
      const id = moveButton.dataset.layoutMove; const index = state.order.indexOf(id);
      const nextIndex = moveButton.dataset.direction === 'up' ? index - 1 : index + 1;
      if (index >= 0 && nextIndex >= 0 && nextIndex < state.order.length) {
        [state.order[index], state.order[nextIndex]] = [state.order[nextIndex], state.order[index]];
        persistAndRender(`${EDITABLE_WIDGETS.find(([item]) => item === id)?.[1]} 순서를 변경했습니다.`);
      }
      return;
    }
    if (event.target.closest('[data-layout-reset]')) {
      event.stopPropagation(); state.activeRoom = DEFAULT_STATE.activeRoom; state.hidden = []; state.wide = [];
      state.order = [...DEFAULT_STATE.order]; state.followingLaunchId = null;
      persistAndRender('기본 SPACE CONTROL 배치를 복원했습니다.');
    }
  };
  editor.addEventListener('click', handleEditorClick, true);
  editor.onclick = handleEditorClick;

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

  mission.addEventListener('click', event => {
    const route = event.target.closest('[data-mission-route]')?.dataset.missionRoute;
    if (route) { onRoute(route); return; }
    const craft = event.target.closest('[data-mission-craft]')?.dataset.missionCraft;
    if (craft) { onCraft(craft); return; }
    const filter = event.target.closest('[data-mission-filter]');
    if (filter) {
      mission.querySelectorAll('[data-mission-filter]').forEach(button => button.classList.toggle('current', button === filter));
      announce(`${filter.textContent.trim()} 자료 필터를 선택했습니다.`); return;
    }
    if (event.target.closest('[data-mission-edit]')) {
      mission.querySelector('[data-mission-editor]').hidden = false;
      mission.classList.add('is-editing');
      renderEditor(mission, state); mission.querySelector('[data-mission-editor-close]')?.focus(); return;
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

  const refresh = async ({ force = false } = {}) => {
    if (refreshPromise) return refreshPromise;
    const now = Date.now(); if (!force && now - lastRefresh < REFRESH_MS) return null;
    lastRefresh = now;
    refreshPromise = Promise.allSettled([
      fetchT(PHOTO_CATALOG, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`PHOTO_${response.status}`); return response.json();
      }),
      fetchT(API.KP, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`KP_${response.status}`); return response.json();
      }),
      fetchT(launchListUrl(), { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`LAUNCH_${response.status}`); return response.json();
      }),
    ]).then(([photos, kp, launches]) => {
      data.photos = photos.status === 'fulfilled' && Array.isArray(photos.value?.items) ? photos.value : null;
      const rows = kp.status === 'fulfilled' && Array.isArray(kp.value)
        ? kp.value.filter(row => row?.kp_index != null && row?.time_tag) : [];
      const latest = rows[rows.length - 1]; const value = Number(latest?.kp_index);
      data.kp = latest && Number.isFinite(value) ? { value, observedAt: latest.time_tag } : null;
      data.launches = launches.status === 'fulfilled' ? normalizeLaunches(launches.value) : [];
      data.launchRetrievedAt = launches.status === 'fulfilled' ? new Date() : null;
      if (data.photos) {
        const hst = data.photos.items.filter(item => item.telescope === 'HST').length;
        const jwst = data.photos.items.filter(item => item.telescope === 'JWST').length;
        mission.dataset.photoCount = String(data.photos.items.length);
        mission.dataset.photoSummary = `HST ${hst} / JWST ${jwst}`;
        setText(mission, '[data-mission-photo-count]', `${data.photos.items.length}장 · HST ${hst} / JWST ${jwst}`);
      } else {
        setText(mission, '[data-mission-photo-count]', '사진 목록 미수신');
      }
      renderMissionData(mission, data, state);
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
        mission.querySelector('[data-mission-editor]').hidden = true;
        mission.classList.remove('is-editing');
      }
      decorateMenu();
    },
    refresh,
  };
}
