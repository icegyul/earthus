/* 취미 안의 바다 상세 화면.
 *
 * 1단 OCEAN 메뉴는 없고 취미가 유일한 공개 진입점이다. 이 시트는 My Ocean과
 * 항로처럼 카드 안에서 한 단계 더 필요한 화면만 담당한다.
 * 이 파일은 관측값이나 안전 결론을 새로 만들지 않는다.
 * 상용 선박 위치를 Earthus 자체 실시간 추적으로 표현하지 않고, 공식 운영 화면은
 * Route Intelligence와 분리된 참고 링크로만 제공한다.
 */

import { i18n } from './i18n.js';
import { store } from './store.js';

const $ = selector => document.querySelector(selector);

const MTIS_LIVE_VESSEL_URL = 'https://mtis.komsa.or.kr/stg/traffic/liveSea';
const MTIS_HOME_URL = 'https://mtis.komsa.or.kr/';

/* 현재 공개 파이프라인의 사실 상태. marine.json의 cur는 표층 속도 스칼라이며
   u/v 방향 성분과 수심별 원본 격자는 아직 없다. 따라서 Flow/Follow를 켜지 않는다.
   provider manifest의 rightsStatus도 DRAFT라 새 재배포·파생 동작은 검토 전까지 닫는다. */
const OCEAN_V8_RUNTIME = Object.freeze({
  surfaceScalar: 'AVAILABLE',
  vectorField: 'UNAVAILABLE',
  rightsState: 'DRAFT',
  depths: Object.freeze([
    Object.freeze({ value: 0, native: true, available: true }),
    Object.freeze({ value: -100, native: false, available: false }),
    Object.freeze({ value: -500, native: false, available: false }),
  ]),
});

const LAYERS = [
  { id: 'sst', ko: '해수면 온도', en: 'Sea temperature', metaKo: '모델 · 유효시각', metaEn: 'Model · valid time' },
  { id: 'sstanom', ko: '수온 편차', en: 'SST anomaly', metaKo: '1991–2020 평년 대비', metaEn: 'vs 1991–2020 normal' },
  { id: 'wave', ko: '파고', en: 'Waves', metaKo: '큰 쪽 파도 평균', metaEn: 'Significant height' },
  { id: 'swell', ko: '너울', en: 'Swell', metaKo: '먼바다 파도', metaEn: 'Long-period waves' },
  { id: 'current', ko: '해류', en: 'Ocean current', metaKo: '표층 흐름 · 조류 아님', metaEn: 'Surface flow · not tide' },
  { id: 'buoy', ko: '해양 부이', en: 'Ocean buoys', metaKo: '기기 실측 · 관측시각', metaEn: 'Measured · observation time' },
];

const MODULES = [
  { action: 'surf', badge: 'LIVE', ko: 'Surf', en: 'Surf',
    subKo: '해변 위치 · 파고 · 너울 · 바람 · 부이 실측',
    subEn: 'Beach location · waves · swell · wind · observed buoys' },
  { action: 'fishing', badge: 'LIVE', ko: 'Fishing', en: 'Fishing',
    subKo: '물때 · 파고 · 바람 · 안전 자료',
    subEn: 'Tide · waves · wind · safety evidence' },
  { action: 'dive', badge: 'LIVE', ko: 'Dive · 심해', en: 'Dive · Deep sea',
    subKo: 'GEBCO 2026 수심 · 해구 · 출처 있는 심해 생물',
    subEn: 'GEBCO 2026 depth · trenches · sourced deep-sea life' },
  { view: 'life', badge: 'RECORD', ko: 'Marine Life', en: 'Marine Life',
    subKo: '심해 생물 · 바다거북 · 바닷새 관측 기록',
    subEn: 'Deep-sea life · sea turtles · seabird records' },
  { view: 'my', badge: 'BOARD', ko: 'My Ocean', en: 'My Ocean',
    subKo: '안전 · 서핑 · 낚시 · 생태 · Dive · 항로',
    subEn: 'Safety · surf · fishing · life · dive · routes' },
  { view: 'route', badge: 'INTEL', ko: '항로', en: 'Routes',
    subKo: '북극항로 · 주요 무역항로 · 연구항로 Intelligence',
    subEn: 'Arctic · trade · research route intelligence' },
];

function buttonCard(item, ko) {
  const target = item.action ? `data-ocean-act="${item.action}"` : `data-ocean-view="${item.view}"`;
  return `<button type="button" class="ocean-module" ${target}>`
    + `<span class="ocean-module-top"><b>${ko ? item.ko : item.en}</b>`
    + `<em data-state="${item.badge}">${item.badge}</em></span>`
    + `<span>${ko ? item.subKo : item.subEn}</span></button>`;
}

function officialCard({ href, badge, ko, en, subKo, subEn }, isKo) {
  return `<a class="ocean-module" href="${href}" target="_blank" rel="noopener noreferrer">`
    + `<span class="ocean-module-top"><b>${isKo ? ko : en}</b>`
    + `<em data-state="${badge}">${badge}</em></span>`
    + `<span>${isKo ? subKo : subEn}</span></a>`;
}

function routeInfoCard({ badge, ko, en, subKo, subEn }, isKo) {
  return `<article class="ocean-module ocean-route-card">`
    + `<span class="ocean-module-top"><b>${isKo ? ko : en}</b>`
    + `<em data-state="${badge}">${badge}</em></span>`
    + `<span>${isKo ? subKo : subEn}</span></article>`;
}

function statusLine(id, ko) {
  const on = store.isOn(id);
  return `<span class="ocean-layer-state" data-on="${on}">${on
    ? (ko ? '지도에 표시 중' : 'Visible on map')
    : (ko ? '지도에서 보기' : 'Show on map')}</span>`;
}

function oceanEngineStatus(ko) {
  const levels = OCEAN_V8_RUNTIME.depths.map(level => `<span data-available="${level.available}">`
    + `<b>${level.value} m</b><small>${level.available
      ? (ko ? '표층 속도' : 'surface speed')
      : (ko ? '원본 없음' : 'not available')}</small></span>`).join('');
  return `<section class="ocean-engine-state" data-vector-state="${OCEAN_V8_RUNTIME.vectorField}">
    <header><div><small>OCEAN ENGINE · V8</small><h4>${ko ? '수심·흐름 상태' : 'Depth & flow status'}</h4></div>
      <p>${ko ? '있는 자료만 켭니다.' : 'Only available evidence is enabled.'}</p></header>
    <div class="ocean-depth-levels" aria-label="${ko ? '가용 수심' : 'Available depths'}">${levels}</div>
    <div class="ocean-engine-actions">
      <button type="button" data-ocean-follow disabled><b>FOLLOW CURRENT</b><span>${ko ? '방향 벡터 없음' : 'vector field unavailable'}</span></button>
      <button type="button" data-ocean-cinema disabled><b>CINEMA MODE</b><span>${ko ? '장면 자료 미연결' : 'scene manifest not connected'}</span></button>
    </div>
    <p class="ocean-engine-note">${ko
      ? '현재는 0m 표층 속도만 있습니다. 방향 벡터가 없어 Follow를 시작하지 않습니다 · 권리 검토 중.'
      : 'Only 0 m surface speed is available. Follow stays off without vectors · rights review pending.'}</p>
  </section>`;
}

export const oceanPanel = {
  _run: null,
  _view: 'home',

  init(run) {
    this._run = run;
    /* 유료 서비스 개시 전에는 가격 배지나 결제 안내를 별도 상품처럼 노출하지 않는다. */
    const setTitle = () => {
      const title = $('#oceanTitle');
      if (title) title.textContent = i18n.lang === 'ko' ? '바다 도구' : 'Ocean tools';
    };
    setTitle();
    document.addEventListener('click', async event => {
      const back = event.target.closest('[data-ocean-view="home"]');
      if (back) { this._view = 'home'; this.render(); return; }
      const view = event.target.closest('[data-ocean-view]');
      if (view) { this._view = view.dataset.oceanView; this.render(); return; }
      const layer = event.target.closest('[data-ocean-layer]');
      if (layer) {
        this.close();
        await this._run?.(`layer:${layer.dataset.oceanLayer}`);
        return;
      }
      const action = event.target.closest('[data-ocean-act]');
      if (!action) return;
      this.close();
      await this._run?.(action.dataset.oceanAct);
    });
    store.on('layer', () => {
      if ($('#oceanSheet')?.classList.contains('up') && ['home', 'layers'].includes(this._view)) this.render();
    });
    i18n.onChange(() => {
      setTitle();
      if ($('#oceanSheet')?.classList.contains('up')) this.render();
    });
    return this;
  },

  open(view = 'home') {
    this._view = view;
    this.render();
    $('#oceanSheet')?.classList.add('up');
  },

  close() { $('#oceanSheet')?.classList.remove('up'); },

  render() {
    const root = $('#oceanBody');
    if (!root) return;
    const ko = i18n.lang === 'ko';
    if (['route', 'vessel'].includes(this._view)) { root.innerHTML = this.routeView(ko); return; }
    if (this._view === 'my') { root.innerHTML = this.myView(ko); return; }
    if (this._view === 'life') { root.innerHTML = this.lifeView(ko); return; }
    if (this._view === 'home') { root.innerHTML = this.homeView(ko); return; }
    root.innerHTML = this.layersView(ko);
  },

  homeView(ko) {
    return `<section class="ocean-section">
        <header><div><small>NOW</small><h4>${ko ? '오늘의 바다' : 'Today’s ocean'}</h4></div>
          <p>${ko ? '필요한 자료만 지도에 켭니다.' : 'Turn on only the data you need.'}</p></header>
        <div class="ocean-layer-grid">${LAYERS.map(item => `
          <button type="button" class="ocean-layer" data-ocean-layer="${item.id}">
            <b>${ko ? item.ko : item.en}</b><span>${ko ? item.metaKo : item.metaEn}</span>
            ${statusLine(item.id, ko)}</button>`).join('')}</div>
      </section>
      ${oceanEngineStatus(ko)}
      <section class="ocean-section">
        <header><div><small>EXPLORE</small><h4>${ko ? '해양 화면' : 'Ocean views'}</h4></div></header>
        <div class="ocean-module-grid">${MODULES.map(item => buttonCard(item, ko)).join('')}</div>
      </section>`;
  },

  layersView(ko) {
    return `<button type="button" class="ocean-back" data-ocean-act="hobby">← ${ko ? '취미' : 'Hobbies'}</button>
      <section class="ocean-section">
        <header><div><small>NOW</small><h4>${ko ? '오늘의 바다' : 'Today’s ocean'}</h4></div>
          <p>${ko ? '원하는 자료만 한 장씩 켭니다.' : 'Turn on only the layer you need.'}</p></header>
        <div class="ocean-layer-grid">${LAYERS.map(item => `
          <button type="button" class="ocean-layer" data-ocean-layer="${item.id}">
            <b>${ko ? item.ko : item.en}</b><span>${ko ? item.metaKo : item.metaEn}</span>
            ${statusLine(item.id, ko)}</button>`).join('')}</div>
      </section>`;
  },

  lifeView(ko) {
    const records = [
      { action: 'dive', badge: 'LIVE', ko: '심해 생물', en: 'Deep-sea life',
        subKo: '수심별 문헌 범위와 출처', subEn: 'Sourced depth ranges and references' },
      { action: 'turtle', badge: 'RECORD', ko: '바다거북', en: 'Sea turtles',
        subKo: '방류 개체의 이동 기록', subEn: 'Released-animal movement records' },
      { action: 'seabird', badge: 'RECORD', ko: '바닷새', en: 'Seabirds',
        subKo: '조사 시점의 관측 기록', subEn: 'Survey-time observation records' },
      { action: 'migbird', badge: 'RECORD', ko: '철새', en: 'Migratory birds',
        subKo: '출발지와 도착지 관측 기록', subEn: 'Recorded origin and destination observations' },
      { action: 'ecobird', badge: 'RECORD', ko: '전국 조류 조사', en: 'Bird surveys',
        subKo: '조사 기록이 있는 5km 격자', subEn: '5 km cells containing survey records' },
    ];
    return `<button type="button" class="ocean-back" data-ocean-act="hobby">← ${ko ? '취미' : 'Hobbies'}</button>
      <div class="ocean-module-grid ocean-life-grid">${records.map(item => buttonCard(item, ko)).join('')}</div>`;
  },

  myView(ko) {
    const widgets = [
      { action: 'safety', badge: 'LIVE', ko: 'SAFETY', en: 'SAFETY',
        subKo: '기상청 특보·낙뢰·태풍·해양 관측', subEn: 'KMA warnings, lightning, cyclones and marine observations' },
      { action: 'surf', badge: 'LIVE', ko: 'SURF', en: 'SURF',
        subKo: '해변 파고·너울·바람·부이', subEn: 'Beach waves, swell, wind and buoys' },
      { action: 'fishing', badge: 'LIVE', ko: 'FISHING', en: 'FISHING',
        subKo: '물때·파고·바람·안전 자료', subEn: 'Tide, waves, wind and safety evidence' },
      { view: 'life', badge: 'RECORD', ko: 'MARINE LIFE', en: 'MARINE LIFE',
        subKo: '심해 생물·바다거북·조류 기록', subEn: 'Deep-sea life, turtles and bird records' },
      { action: 'dive', badge: 'LIVE', ko: 'DIVE', en: 'DIVE',
        subKo: 'GEBCO 2026 수심·해구', subEn: 'GEBCO 2026 depth and trenches' },
      { view: 'route', badge: 'INTEL', ko: 'ROUTES', en: 'ROUTES',
        subKo: '북극·무역·연구 항로 Intelligence', subEn: 'Arctic, trade and research route intelligence' },
    ];
    return `<button type="button" class="ocean-back" data-ocean-act="hobby">← ${ko ? '취미' : 'Hobbies'}</button>
      <section class="ocean-section">
        <header><div><small>MY OCEAN</small><h4>${ko ? '바다 화면 모아보기' : 'Ocean control board'}</h4></div>
          <p>${ko ? '각 카드는 기존 관측 화면을 그대로 엽니다.' : 'Each card opens an existing observation surface.'}</p></header>
        <div class="ocean-widget-grid">${widgets.map(item => buttonCard(item, ko)).join('')}</div>
      </section>`;
  },

  routeView(ko) {
    const routes = [
      { badge: 'FLAGSHIP', ko: '북극항로', en: 'Arctic Routes',
        subKo: 'NSR · NWP · 검증 가능한 극지 회랑 · 해빙·위성·기상·파고·위험·뉴스·계절 비교를 한 화면에 결합',
        subEn: 'NSR · NWP · sourced polar corridors · combine sea ice, satellite, weather, waves, hazards, news and seasonal comparison' },
      { badge: 'INTEL', ko: '주요 무역항로', en: 'Trade Routes',
        subKo: '수에즈 · 파나마 · 말라카 · 희망봉 등 · 항로·병목·항만·기상·파고·위험·관련 뉴스',
        subEn: 'Suez · Panama · Malacca · Cape routes · corridors, chokepoints, ports, weather, waves, hazards and related news' },
      { badge: 'RECORD', ko: '연구항로', en: 'Research Routes',
        subKo: '공개된 탐사·해양관측 임무의 항로와 관측 지점 · 위성·해양·기후 자료와 연구 업데이트',
        subEn: 'Published expedition and ocean-observation routes · stations, satellite/ocean/climate context and mission updates' },
    ];
    return `<button type="button" class="ocean-back" data-ocean-act="hobby">← ${ko ? '취미' : 'Hobbies'}</button>
      <section class="ocean-section">
        <header><div><small>ROUTE INTELLIGENCE</small><h4>${ko ? '선박이 아니라 항로를 본다' : 'Track route context, not commercial vessels'}</h4></div>
          <p>${ko
            ? 'Earthus의 핵심은 상용 선박 좌표 복제가 아니라 항로 주변 조건을 지구 위에서 함께 읽는 것입니다.'
            : 'Earthus focuses on route conditions on the globe instead of republishing commercial vessel positions.'}</p></header>
        <div class="ocean-module-grid">${routes.map(item => routeInfoCard(item, ko)).join('')}</div>
      </section>
      <section class="ocean-section">
        <header><div><small>REFERENCE</small><h4>${ko ? '공식 선박 위치 참고' : 'Official vessel references'}</h4></div>
          <p>${ko ? '필요할 때만 공식 운영 화면으로 이동합니다.' : 'Open official operational services only when needed.'}</p></header>
        <div class="ocean-module-grid">
          ${officialCard({ href: MTIS_LIVE_VESSEL_URL, badge: 'REFERENCE',
            ko: 'MTIS 선박 위치', en: 'MTIS vessel positions',
            subKo: '한국해양교통안전공단 공식 화면에서 위치·수신시각 확인 ↗',
            subEn: 'Check positions and reception time on the official KOMSA MTIS screen ↗' }, ko)}
          ${officialCard({ href: MTIS_HOME_URL, badge: 'REFERENCE',
            ko: '여객선 위치 · 운항', en: 'Passenger vessel position · service',
            subKo: 'MTIS 여객선 교통정보서비스(PATIS)에서 확인 ↗',
            subEn: 'Open the MTIS passenger transportation service (PATIS) ↗' }, ko)}
        </div>
      </section>
      <p class="ocean-trust">${ko
        ? '제품 원칙 · Earthus는 상용 선박의 실시간 좌표를 자체 추적한다고 표시하지 않습니다. 항로별 해빙·기상·해양·위험·뉴스는 각 원본의 출처와 유효시각을 유지하고, 공식 운항 상태가 없으면 개방·폐쇄·안전 여부를 단정하지 않습니다.'
        : 'Product rule · Earthus does not claim to track commercial vessels itself. Route sea-ice, weather, ocean, hazard and news context keeps source and valid time, and no open/closed/safe state is inferred without an authoritative operational source.'}</p>`;
  },
};