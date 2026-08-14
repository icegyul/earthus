// AETHERUS의 첫 화면은 기능 목록이 아니라, 지금 연결된 공식 자료와 3D 지구를
// 한눈에 확인하는 미션 컨트롤이다. 숫자를 채워 보이게 만드는 대신 응답이 없으면
// 그대로 "미수신"으로 남긴다. 발사 일정과 생중계는 기관 원문으로만 연결한다.

import { API } from '../config.js';
import { fetchT } from '../net.js';

const STYLE_ID = 'aetherusMissionControlStyle';
const PHOTO_CATALOG = '/data/space-photos.json';
const REFRESH_MS = 5 * 60 * 1000;

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../../css/aetherus-dashboard.css?v=20260815-mc1', import.meta.url).href;
  document.head.append(link);
}

function formatKst(value, withSeconds = false) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '시각 미수신';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false, hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
    + (withSeconds ? `:${parts.second}` : '');
}

function makeRouteButton(route, icon, title, copy) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mission-observer';
  button.dataset.missionRoute = route;
  button.innerHTML = `<span class="mission-observer-icon" aria-hidden="true">${icon}</span>`
    + `<span><b>${title}</b><small>${copy}</small></span><i aria-hidden="true">›</i>`;
  return button;
}

function makeOfficialLink(href, icon, title, copy) {
  const link = document.createElement('a');
  link.className = 'mission-official-link';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.innerHTML = `<span aria-hidden="true">${icon}</span><span><b>${title}</b><small>${copy}</small></span>`
    + '<i aria-hidden="true">↗</i>';
  return link;
}

function setText(root, selector, value) {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

function buildMarkup() {
  const mission = document.createElement('section');
  mission.id = 'aetherusMissionControl';
  mission.className = 'aetherus-mission-control';
  mission.hidden = true;
  mission.setAttribute('aria-label', 'AETHERUS 미션 컨트롤');

  const left = document.createElement('aside');
  left.className = 'mission-panel mission-left';
  left.innerHTML = '<header><span><b>관측 / 추적</b><small>공식 자료와 3D 장면</small></span></header>';
  const observerList = document.createElement('div');
  observerList.className = 'mission-observer-list';
  observerList.append(
    makeRouteButton('mission', '◎', '지구 3D 뷰', '현재 미션 컨트롤'),
    makeRouteButton('solar', '◉', '태양계', 'JPL 궤도요소 계산'),
    makeRouteButton('photos', '▣', '우주 사진', '허블 · 제임스웹 공식 원본'),
    makeRouteButton('milkyway', '⌁', '은하수', '관측 기반 3D 구조도'),
    makeRouteButton('galaxies', '✦', '은하', '우주 크기 교육 도식'),
  );
  left.append(observerList);
  const craftHeading = document.createElement('div');
  craftHeading.className = 'mission-section-heading';
  craftHeading.innerHTML = '<b>우주 관측기</b><small>현재 위치가 아닌 궤도·방향 도식</small>';
  left.append(craftHeading);
  const craftList = document.createElement('div');
  craftList.className = 'mission-craft-list';
  ['hubble', 'jwst', 'voyager-1', 'voyager-2'].forEach((id, index) => {
    const names = ['허블 우주망원경', '제임스웹 우주망원경', '보이저 1', '보이저 2'];
    const notes = ['지구 저궤도 도식', '태양-지구 L2 도식', 'JPL 기준시점 계산', 'JPL 기준시점 계산'];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.missionCraft = id;
    button.innerHTML = `<span aria-hidden="true">${index < 2 ? '⌖' : '➤'}</span>`
      + `<span><b>${names[index]}</b><small>${notes[index]}</small></span>`;
    craftList.append(button);
  });
  left.append(craftList);

  const center = document.createElement('section');
  center.className = 'mission-center';
  center.innerHTML = '<header class="mission-stage-head"><span><b>지구 3D 뷰</b>'
    + '<small>드래그하여 회전 · 표면 시각화</small></span>'
    + '<span class="mission-stage-time"><small>기기 시각 (KST)</small><b data-mission-device-time>--</b></span></header>'
    + '<div class="mission-orbit-diagram" aria-label="현재 위치가 아닌 궤도 구조 도식">'
    + '<i class="mission-orbit mission-orbit-a"></i><i class="mission-orbit mission-orbit-b"></i>'
    + '<span class="mission-orbit-label mission-orbit-label-a">HUBBLE · 위치 도식</span>'
    + '<span class="mission-orbit-label mission-orbit-label-b">JWST · L2 도식</span></div>'
    + '<div class="mission-stage-instruction"><span aria-hidden="true">◎</span>'
    + '<span><b>지구 중심 미션 컨트롤</b><small>태양계로 이동하면 행성·탐사선 3D가 이어집니다.</small></span></div>'
    + '<div class="mission-mobile-strip" aria-label="현재 연결 상태">'
    + '<span><small>공식 사진</small><b data-mission-photo-count>확인 중</b></span>'
    + '<span><small>우주 기상</small><b data-mission-kp-value>확인 중</b></span>'
    + '<span><small>자료 시각</small><b data-mission-kp-time>확인 중</b></span></div>';

  const right = document.createElement('aside');
  right.className = 'mission-panel mission-right';
  right.innerHTML = '<section><header><span><b>공식 일정</b><small>예고·생중계는 기관 원문 기준</small></span></header>'
    + '<p class="mission-empty-state"><b>임의 카운트다운을 표시하지 않습니다.</b>'
    + '<span>공식 발표 전에는 일정 미확인으로 남깁니다.</span></p><div data-mission-schedule-links></div></section>'
    + '<section class="mission-source-state"><header><span><b>자료 출처 상태</b>'
    + '<small>값마다 출처와 자료 시각 표시</small></span></header>'
    + '<div class="mission-source-row"><span><i data-state="loading"></i>NASA/JPL 천체 위치</span><b>접속 시각 계산</b></div>'
    + '<div class="mission-source-row"><span><i data-mission-photo-state data-state="loading"></i>NASA/ESA 사진 목록</span><b data-mission-photo-time>확인 중</b></div>'
    + '<div class="mission-source-row"><span><i data-mission-kp-state data-state="loading"></i>NOAA SWPC Kp</span><b data-mission-kp-source-time>확인 중</b></div>'
    + '</section></aside>';

  const bottom = document.createElement('section');
  bottom.className = 'mission-bottom';
  bottom.innerHTML = '<article><header><span aria-hidden="true">▣</span><b>공식 관측 사진</b></header>'
    + '<strong data-mission-photo-count>확인 중</strong><p>허블·제임스웹 카탈로그</p>'
    + '<small data-mission-photo-time>자료 시각 확인 중</small></article>'
    + '<article><header><span aria-hidden="true">☀</span><b>우주 기상</b></header>'
    + '<strong data-mission-kp-value>확인 중</strong><p>NOAA SWPC 행성 K 지수</p>'
    + '<small data-mission-kp-time>자료 시각 확인 중</small></article>'
    + '<article><header><span aria-hidden="true">⌖</span><b>천체 위치</b></header>'
    + '<strong>JPL 궤도요소</strong><p>브라우저에서 현재 위치 계산</p>'
    + '<small data-mission-position-time>접속 시각 기준</small></article>'
    + '<article><header><span aria-hidden="true">◌</span><b>표현 범위</b></header>'
    + '<strong>관측 · 계산 · 도식 구분</strong><p>실시간 위치가 아닌 항목은 도식으로 표시</p>'
    + '<small>임의 생중계 · 임의 예보 없음</small></article>';

  const scheduleLinks = right.querySelector('[data-mission-schedule-links]');
  scheduleLinks.append(
    makeOfficialLink('https://www.kasa.go.kr/', '🇰🇷', '우주항공청 공지', '대한민국 공식 원문'),
    makeOfficialLink('https://www.nasa.gov/event-type/launch-schedule/', '△', 'NASA 발사 일정', 'NASA 공식 일정 원문'),
    makeOfficialLink('https://www.nasa.gov/live/', '◉', 'NASA 생중계 안내', '공식 편성표에서 확인'),
  );
  mission.append(left, center, right, bottom);
  return mission;
}

function decorateExperienceNav(root) {
  const nav = root.querySelector('#cosmicExperienceNav');
  const group = nav?.querySelector('div');
  if (!group) return;
  if (!group.querySelector('[data-aetherus-nav="mission"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.aetherusNav = 'mission';
    button.textContent = '미션 컨트롤';
    group.prepend(button);
  }
  const labels = {
    solar: '태양계', photos: '우주 사진', milkyway: '은하수', galaxies: '은하',
  };
  Object.entries(labels).forEach(([route, label]) => {
    const button = group.querySelector(`[data-aetherus-nav="${route}"]`);
    if (button) button.textContent = label;
  });
}

function makeMenuMissionButton(onRoute) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'aetherus-route aetherus-mission-route';
  button.dataset.aetherusRoute = 'mission';
  button.innerHTML = '<span><b>미션 컨트롤</b><small>MISSION CONTROL</small></span><i aria-hidden="true">›</i>';
  button.addEventListener('click', () => {
    document.getElementById('aetherusTab')?.click();
    onRoute('mission');
  });
  return button;
}

export function createAetherusMissionControl({ root, onRoute, onCraft }) {
  if (!root) return null;
  ensureStylesheet();
  decorateExperienceNav(root);
  const mission = buildMarkup();
  root.append(mission);
  let lastRefresh = 0;
  let refreshPromise = null;

  const decorateMenu = () => {
    const list = document.querySelector('#menuSub .aetherus-menu-list');
    if (!list) return;
    let button = list.querySelector('[data-aetherus-route="mission"]');
    if (!button) {
      button = makeMenuMissionButton(onRoute);
      const intro = list.querySelector('.aetherus-menu-intro');
      if (intro) intro.after(button);
      else list.prepend(button);
    }
    list.querySelectorAll('.aetherus-route').forEach(item => {
      const active = !mission.hidden && item.dataset.aetherusRoute === 'mission';
      if (!mission.hidden && item.dataset.aetherusRoute === 'solar') item.classList.remove('current');
      button.classList.toggle('current', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  };

  const menuRoot = document.getElementById('menuSub');
  if (menuRoot) new MutationObserver(decorateMenu).observe(menuRoot, { childList: true, subtree: true });

  mission.addEventListener('click', event => {
    const route = event.target.closest('[data-mission-route]')?.dataset.missionRoute;
    if (route) { onRoute(route); return; }
    const craft = event.target.closest('[data-mission-craft]')?.dataset.missionCraft;
    if (craft) onCraft(craft);
  });

  const refresh = async () => {
    if (refreshPromise) return refreshPromise;
    const now = Date.now();
    if (now - lastRefresh < REFRESH_MS) return null;
    lastRefresh = now;
    refreshPromise = Promise.allSettled([
      fetchT(PHOTO_CATALOG, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`PHOTO_${response.status}`);
        return response.json();
      }),
      fetchT(API.KP, { cache: 'no-cache' }).then(response => {
        if (!response.ok) throw new Error(`KP_${response.status}`);
        return response.json();
      }),
    ]).then(([photos, kp]) => {
      if (photos.status === 'fulfilled' && Array.isArray(photos.value?.items)) {
        const hst = photos.value.items.filter(item => item.telescope === 'HST').length;
        const jwst = photos.value.items.filter(item => item.telescope === 'JWST').length;
        mission.querySelectorAll('[data-mission-photo-count]').forEach(node => {
          node.textContent = `${photos.value.items.length}장 · HST ${hst} / JWST ${jwst}`;
        });
        mission.querySelectorAll('[data-mission-photo-time]').forEach(node => {
          node.textContent = `카탈로그 생성일 ${photos.value.generated || '미표기'}`;
        });
        mission.querySelector('[data-mission-photo-state]')?.setAttribute('data-state', 'ok');
      } else {
        mission.querySelectorAll('[data-mission-photo-count]').forEach(node => { node.textContent = '자료 미수신'; });
        mission.querySelectorAll('[data-mission-photo-time]').forEach(node => { node.textContent = '공식 사진 목록 응답 없음'; });
        mission.querySelector('[data-mission-photo-state]')?.setAttribute('data-state', 'error');
      }

      const rows = kp.status === 'fulfilled' && Array.isArray(kp.value)
        ? kp.value.filter(row => row?.kp_index != null && row?.time_tag) : [];
      const latest = rows[rows.length - 1];
      if (latest) {
        const value = Number(latest.kp_index);
        const label = Number.isFinite(value) ? `Kp ${value.toFixed(2)}` : 'Kp 값 미수신';
        const observed = formatKst(latest.time_tag);
        mission.querySelectorAll('[data-mission-kp-value]').forEach(node => { node.textContent = label; });
        mission.querySelectorAll('[data-mission-kp-time]').forEach(node => { node.textContent = observed; });
        setText(mission, '[data-mission-kp-source-time]', observed);
        mission.querySelector('[data-mission-kp-state]')?.setAttribute('data-state', 'ok');
      } else {
        mission.querySelectorAll('[data-mission-kp-value]').forEach(node => { node.textContent = '자료 미수신'; });
        mission.querySelectorAll('[data-mission-kp-time]').forEach(node => { node.textContent = 'NOAA SWPC 응답 없음'; });
        setText(mission, '[data-mission-kp-source-time]', '응답 확인 필요');
        mission.querySelector('[data-mission-kp-state]')?.setAttribute('data-state', 'error');
      }
    }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  };

  return {
    root: mission,
    setOpen(open) {
      mission.hidden = !open;
      root.classList.toggle('is-dashboard', open);
      if (open) {
        const now = new Date();
        setText(mission, '[data-mission-device-time]', formatKst(now, true));
        setText(mission, '[data-mission-position-time]', `${formatKst(now)} KST 계산`);
        refresh().catch(error => console.warn('[aetherus-mission]', error.message));
      }
      decorateMenu();
    },
    refresh,
  };
}
