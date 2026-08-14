/* Earthus Ocean 공개 허브.
 *
 * 해양 구현물을 개발 canary와 문서에만 두지 않고, 운영 중인 실제 지도·서핑·낚시·
 * 심해·생태 화면으로 연결한다. 이 파일은 관측값이나 안전 결론을 새로 만들지 않는다.
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
    subKo: '물때 · 파고 · 바람 · 안전 자료를 한 화면에서',
    subEn: 'Tide · waves · wind · safety evidence in one view' },
  { action: 'dive', badge: 'LIVE', ko: 'Dive · 심해', en: 'Dive · Deep sea',
    subKo: 'GEBCO 2026 수심 기둥 · 해구 · 출처 있는 심해 생물',
    subEn: 'GEBCO 2026 depth column · trenches · sourced deep-sea life' },
  { view: 'life', badge: 'LIVE', ko: 'Marine Life', en: 'Marine Life',
    subKo: '심해 생물 · 바다거북 · 바닷새 관측 기록',
    subEn: 'Deep-sea life · sea turtles · seabird records' },
  { view: 'my', badge: 'FREE', ko: 'My Ocean', en: 'My Ocean',
    subKo: '안전·서핑·낚시·생태·Dive·선박을 한 관제판에서',
    subEn: 'Safety, surf, fishing, life, dive and vessel in one board' },
  { view: 'vessel', badge: 'FREE', ko: 'Vessels', en: 'Vessels',
    subKo: '공식 실시간 선박 위치 · 교통량 · 여객선 운항',
    subEn: 'Official live vessel positions, traffic and passenger services' },
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
      if ($('#oceanSheet')?.classList.contains('up') && this._view === 'home') this.render();
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
    if (this._view === 'my') { root.innerHTML = this.myView(ko); return; }
    if (this._view === 'life') { root.innerHTML = this.lifeView(ko); return; }
    root.innerHTML = `
      <section class="ocean-section">
        <header><div><small>NOW</small><h4>${ko ? '오늘의 바다' : 'Today’s ocean'}</h4></div>
          <p>${ko ? '원하는 자료만 한 장씩 켭니다.' : 'Turn on only the layer you need.'}</p></header>
        <div class="ocean-layer-grid">${LAYERS.map(item => `
          <button type="button" class="ocean-layer" data-ocean-layer="${item.id}">
            <b>${ko ? item.ko : item.en}</b><span>${ko ? item.metaKo : item.metaEn}</span>
            ${statusLine(item.id, ko)}</button>`).join('')}</div>
      </section>
      <section class="ocean-section">
        <header><div><small>VERTICALS</small><h4>${ko ? '무엇을 하러 왔나요' : 'What are you here to do?'}</h4></div>
          <p>${ko ? '같은 지구본과 같은 출처 계약을 씁니다.' : 'All modules share the same globe and source contract.'}</p></header>
        <div class="ocean-module-grid">${MODULES.map(item => buttonCard(item, ko)).join('')}</div>
      </section>`;
  },

  lifeView(ko) {
    return `<button type="button" class="ocean-back" data-ocean-view="home">← ${ko ? 'OCEAN 전체' : 'All Ocean'}</button>
      <section class="ocean-access"><b>Marine Life</b><span>${ko
        ? '종 문헌·관측 기록과 사용자 관찰을 섞지 않습니다.'
        : 'Species references, observation records and user observations remain distinct.'}</span></section>
      <div class="ocean-module-grid ocean-life-grid">
        ${buttonCard({ action: 'dive', badge: 'LIVE', ko: '심해 생물 도감', en: 'Deep-sea atlas',
          subKo: '수심을 내리며 문헌 범위·단일 관측 사진 보기', subEn: 'Descend through sourced ranges and single observations' }, ko)}
        ${buttonCard({ action: 'turtle', badge: 'RECORD', ko: '바다거북', en: 'Sea turtles',
          subKo: '방류된 거북이 지나간 경로 · 현재 위치 아님', subEn: 'Historical released-turtle tracks · not current positions' }, ko)}
        ${buttonCard({ action: 'seabird', badge: 'RECORD', ko: '바닷새', en: 'Seabirds',
          subKo: '조사한 해의 관측 지점과 개체 수', subEn: 'Survey-year stations and counts' }, ko)}
        ${buttonCard({ action: 'migbird', badge: 'RECORD', ko: '철새', en: 'Migratory birds',
          subKo: '출발지와 도착지 관측 기록', subEn: 'Recorded origin and destination observations' }, ko)}
        ${buttonCard({ action: 'ecobird', badge: 'RECORD', ko: '전국 조류 조사', en: 'Bird surveys',
          subKo: '조사 기록이 있는 5km 격자', subEn: '5 km cells containing survey records' }, ko)}
      </div>
      <p class="ocean-trust">${ko
        ? '공개 사진은 사진가·기관·라이선스와 원문 링크를 함께 표시합니다. 현재 그 좌표에 생물이 있다고 판정하지 않습니다.'
        : 'Public images retain photographer, institution, licence and source links. They do not assert that an animal is currently at that coordinate.'}</p>`;
  },

  myView(ko) {
    const widgets = [
      { action: 'safety', badge: 'LIVE', ko: 'SAFETY', en: 'SAFETY',
        subKo: '기상청 낙뢰·태풍·특보·해양 관측 열기',
        subEn: 'Open KMA lightning, cyclone, warning and marine observations' },
      { action: 'surf', badge: 'LIVE', ko: 'SURF', en: 'SURF',
        subKo: '해변 조건 화면 열기', subEn: 'Open surf conditions' },
      { action: 'fishing', badge: 'LIVE', ko: 'FISHING', en: 'FISHING',
        subKo: '물때·해양 조건 화면 열기', subEn: 'Open tide and marine conditions' },
      { view: 'life', badge: 'LIVE', ko: 'MARINE LIFE', en: 'MARINE LIFE',
        subKo: '공개 관찰·문헌 도감 열기', subEn: 'Open public records and reference atlas' },
      { action: 'dive', badge: 'LIVE', ko: 'DIVE', en: 'DIVE',
        subKo: 'GEBCO 수심·해구 열기', subEn: 'Open GEBCO depth and trenches' },
      { view: 'vessel', badge: 'FREE', ko: 'VESSEL', en: 'VESSEL',
        subKo: '공식 실시간 선박 화면 열기', subEn: 'Open official live vessel screen' },
    ];
    return `<button type="button" class="ocean-back" data-ocean-view="home">← ${ko ? 'OCEAN 전체' : 'All Ocean'}</button>
      <section class="ocean-access"><b>My Ocean · ${ko ? '무료 관제판' : 'Free control board'}</b><span>${ko
        ? '현재 제공되는 해양 화면을 한곳에서 엽니다.'
        : 'Open every currently available Ocean surface from one place.'}</span></section>
      <div class="ocean-widget-grid">${widgets.map(item => buttonCard(item, ko)).join('')}</div>
      <p class="ocean-trust">${ko
        ? '이 관제판은 지금 무료입니다. 계정 간 레이아웃 동기화·개인 기록·사진 업로드·조건 알림은 운영 서버가 연결되기 전까지 저장 완료로 꾸며내지 않습니다.'
        : 'This board is free. Cross-account layout sync, private records, photo uploads and alerts are not represented as saved before the operating server exists.'}</p>`;
  },

  vesselView(ko) {
    return `<button type="button" class="ocean-back" data-ocean-view="home">← ${ko ? 'OCEAN 전체' : 'All Ocean'}</button>
      <section class="ocean-access"><b>Vessels · FREE</b><span>${ko
        ? '실시간 선박 위치와 해양 교통을 공식 운영 화면에서 바로 확인합니다.'
        : 'Open official live vessel positions and marine traffic directly.'}</span></section>
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
