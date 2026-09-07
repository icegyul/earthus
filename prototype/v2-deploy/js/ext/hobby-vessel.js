// 취미 · 선박 — 1.0 ui-ocean.js routeView 를 옮겨 적음 (2026-09-06). 자료를 받지 않는다.
//
// 제품 원칙(1.0 그대로): Earthus 는 상용 선박의 실시간 좌표를 자체 추적한다고 표시하지 않는다.
// 필요할 때만 공식 운영 화면(MTIS)으로 보낸다. 항로 카드는 안내문이다 — 개방·폐쇄·안전 여부를 단정하지 않는다.

const MTIS_LIVE_VESSEL_URL = 'https://mtis.komsa.or.kr/stg/traffic/liveSea';
const MTIS_HOME_URL = 'https://mtis.komsa.or.kr/';

const routeInfoCard = ({ badge, ko, en, subKo, subEn }, isKo, esc) => `<article class="ocean-module ocean-route-card">
  <small>${esc(badge)}</small><b>${esc(isKo ? ko : en)}</b><span>${esc(isKo ? subKo : subEn)}</span></article>`;
const officialCard = ({ href, badge, ko, en, subKo, subEn }, isKo, esc) => `<a class="ocean-module ocean-official" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
  <small>${esc(badge)}</small><b>${esc(isKo ? ko : en)}</b><span>${esc(isKo ? subKo : subEn)}</span></a>`;

export default {
  key: 'hobby/vessel',
  title: '선박',
  badge: 'OFFICIAL_INFORMATION',

  async load(ctx, state) { state.data = { at: Date.now() }; },

  card(ctx) {
    const ko = ctx.ko; const esc = ctx.esc;
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
    return `<section class="ocean-section">
        <header><div><small>ROUTE INTELLIGENCE</small><h4>${ko ? '선박이 아니라 항로를 본다' : 'Track route context, not commercial vessels'}</h4></div>
          <p>${ko
            ? 'Earthus의 핵심은 상용 선박 좌표 복제가 아니라 항로 주변 조건을 지구 위에서 함께 읽는 것입니다.'
            : 'Earthus focuses on route conditions on the globe instead of republishing commercial vessel positions.'}</p></header>
        <div class="ocean-module-grid">${routes.map((item) => routeInfoCard(item, ko, esc)).join('')}</div>
        <p class="kr-note">${ko
          ? '해빙은 지형 › <b>해빙 농도</b>, 파고·해류는 해양 묶음, 태풍은 재해 묶음에서 겹쳐 봅니다.'
          : 'Overlay sea ice (Land › Sea ice), waves and currents (Ocean) and cyclones (Hazards) from the menu.'}
          <button type="button" data-action="ext:open/land/seaice">${ko ? '해빙 켜기' : 'Sea ice'}</button>
          <button type="button" data-action="ext:open/ocean/buoys">${ko ? '해양 부이' : 'Buoys'}</button></p>
      </section>
      <section class="ocean-section">
        <header><div><small>REFERENCE</small><h4>${ko ? '공식 선박 위치 참고' : 'Official vessel references'}</h4></div>
          <p>${ko ? '필요할 때만 공식 운영 화면으로 이동합니다.' : 'Open official operational services only when needed.'}</p></header>
        <div class="ocean-module-grid">
          ${officialCard({ href: MTIS_LIVE_VESSEL_URL, badge: 'REFERENCE',
            ko: 'MTIS 선박 위치', en: 'MTIS vessel positions',
            subKo: '한국해양교통안전공단 공식 화면에서 위치·수신시각 확인 ↗',
            subEn: 'Check positions and reception time on the official KOMSA MTIS screen ↗' }, ko, esc)}
          ${officialCard({ href: MTIS_HOME_URL, badge: 'REFERENCE',
            ko: '여객선 위치 · 운항', en: 'Passenger vessel position · service',
            subKo: 'MTIS 여객선 교통정보서비스(PATIS)에서 확인 ↗',
            subEn: 'Open the MTIS passenger transportation service (PATIS) ↗' }, ko, esc)}
        </div>
      </section>
      <p class="ocean-trust">${ko
        ? '제품 원칙 · Earthus는 상용 선박의 실시간 좌표를 자체 추적한다고 표시하지 않습니다. 항로별 해빙·기상·해양·위험·뉴스는 각 원본의 출처와 유효시각을 유지하고, 공식 운항 상태가 없으면 개방·폐쇄·안전 여부를 단정하지 않습니다.'
        : 'Product rule · Earthus does not claim to track commercial vessels itself. Route sea-ice, weather, ocean, hazard and news context keeps source and valid time, and no open/closed/safe state is inferred without an authoritative operational source.'}</p>`;
  },
};
