/* Earthus Ocean 세부 자료.
 *
 * 취미의 바다 범주에서 해양 레이어와 공식 선박 화면을 연다.
 * 이 파일은 관측값이나 안전 결론을 새로 만들지 않는다.
 * 선박 위치는 권리 미확인 좌표를 복제하지 않고 일반 공개된 공식 운영 화면으로 연결한다.
 */

import { i18n } from './i18n.js';
import { store } from './store.js';

const $ = selector => document.querySelector(selector);

const MTIS_LIVE_VESSEL_URL = 'https://mtis.komsa.or.kr/stg/traffic/liveSea';
const MTIS_HOME_URL = 'https://mtis.komsa.or.kr/';

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
  { view: 'vessel', badge: 'LIVE', ko: 'Vessels', en: 'Vessels',
    subKo: '공식 실시간 선박 위치 · 여객선 운항',
    subEn: 'Official live vessel positions · passenger services' },
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

function statusLine(id, ko) {
  const on = store.isOn(id);
  return `<span class="ocean-layer-state" data-on="${on}">${on
    ? (ko ? '지도에 표시 중' : 'Visible on map')
    : (ko ? '지도에서 보기' : 'Show on map')}</span>`;
}

export const oceanPanel = {
  _run: null,
  _view: 'home',

  init(run) {
    this._run = run;
    /* 유료 서비스 개시 전에는 FREE 배지나 결제 안내를 별도 상품처럼 노출하지 않는다. */
    const title = $('#oceanTitle');
    if (title) title.textContent = 'OCEAN';
    document.querySelector('[data-act="ocean"] .mm-free')?.remove();
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
    if (this._view === 'vessel') { root.innerHTML = this.vesselView(ko); return; }
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
      <section class="ocean-section">
        <header><div><small>EXPLORE</small><h4>${ko ? '해양 화면' : 'Ocean views'}</h4></div></header>
        <div class="ocean-module-grid">${MODULES.map(item => buttonCard(item, ko)).join('')}</div>
      </section>`;
  },

  layersView(ko) {
    return `<button type="button" class="ocean-back" data-ocean-view="home">← OCEAN</button>
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
    return `<button type="button" class="ocean-back" data-ocean-view="home">← OCEAN</button>
      <div class="ocean-module-grid ocean-life-grid">${records.map(item => buttonCard(item, ko)).join('')}</div>`;
  },

  vesselView(ko) {
    return `<button type="button" class="ocean-back" data-ocean-view="home">← OCEAN</button>
      <div class="ocean-module-grid">
        ${officialCard({ href: MTIS_LIVE_VESSEL_URL, badge: 'LIVE',
          ko: '실시간 선박 위치', en: 'Live vessel positions',
          subKo: '한국해양교통안전공단 MTIS · 용도·톤수·격자별 조회 ↗',
          subEn: 'KOMSA MTIS · filter by use, tonnage and grid ↗' }, ko)}
        ${officialCard({ href: MTIS_HOME_URL, badge: 'LIVE',
          ko: '여객선 위치 · 운항', en: 'Passenger vessel position · service',
          subKo: 'MTIS 여객선 교통정보서비스(PATIS)에서 확인 ↗',
          subEn: 'Open the MTIS passenger transportation service (PATIS) ↗' }, ko)}
      </div>
      <p class="ocean-trust">${ko
        ? '출처: 한국해양교통안전공단 해양교통안전정보시스템(MTIS) · 위치 수신시각은 공식 화면에서 확인'
        : 'Source: Korea Maritime Transportation Safety Authority MTIS · check reception time on the official screen'}</p>`;
  },
};
