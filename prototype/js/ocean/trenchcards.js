// 출처 기반 해구·우리 바다 교육 카드
// ⚠️ 최심부는 측정 불확실성 또는 서로 다른 관측값의 범위로 표시한다.
// ⚠️ 카드 좌표로 잠수해도 GEBCO 격자값은 문헌 수심과 다를 수 있으며 둘을 섞지 않는다.

import { i18n } from '../i18n.js';

export const trenchCards = {
  root: null,
  data: null,

  init() {
    this.root = document.getElementById('trenchExplorer');
    if (!this.root) return this;
    i18n.onChange(() => this.render());
    this.load();
    return this;
  },

  async load() {
    if (this.data) return this.data;
    try {
      const response = await fetch('/data/trenches.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`TRENCHES_${response.status}`);
      this.data = await response.json();
      this.render();
      return this.data;
    } catch (error) {
      console.warn('[trench-cards]', error.message);
      this.root.textContent = i18n.lang === 'ko' ? '해구 자료를 불러오지 못했습니다.' : 'Trench data is unavailable.';
      return null;
    }
  },

  async openDiveAt(lat, lon, name) {
    const { diveScene } = await import('./divescene.js');
    await diveScene.open({ lat, lon, name });
  },

  async openFeaturedDive() {
    const data = this.data || await this.load();
    const item = data?.items?.[0];
    if (!item) throw new Error('FEATURED_TRENCH_UNAVAILABLE');
    const ko = i18n.lang === 'ko';
    await this.openDiveAt(item.lat, item.lon, item.name[ko ? 'ko' : 'en']);
  },

  render() {
    if (!this.root || !this.data) return;
    const ko = i18n.lang === 'ko';
    this.root.innerHTML = '';
    this.root.append(
      this.section(ko ? '우리 바다는 얼마나 깊을까' : 'How deep are Korea’s seas?',
        this.data.koreaCards, item => this.koreaCard(item, ko)),
      this.section(ko ? '측정마다 달라지는 해구의 최심부' : 'Trench depths vary by measurement',
        this.data.items, item => this.trenchCard(item, ko)),
    );
    const limit = document.createElement('p'); limit.className = 'trench-limit';
    limit.textContent = ko
      ? 'GEBCO 2026 약 11km 격자 · 문헌 최심부와 해상도·측정법 차이 · 항해·안전 자료는 공식 해도 이용'
      : 'GEBCO 2026 ~11 km grid · resolution and method differ from published deepest ranges · use official charts for navigation and safety';
    this.root.append(limit);
  },

  section(title, items, makeCard) {
    const section = document.createElement('section'); section.className = 'trench-section';
    const heading = document.createElement('h3'); heading.textContent = title;
    const grid = document.createElement('div'); grid.className = 'trench-grid';
    items.forEach(item => grid.append(makeCard(item)));
    section.append(heading, grid); return section;
  },

  koreaCard(item, ko) {
    const card = document.createElement('article'); card.className = 'trench-card';
    const name = document.createElement('b'); name.textContent = item.name[ko ? 'ko' : 'en'];
    const depth = document.createElement('span'); depth.className = 'depth';
    depth.textContent = `${ko ? '평균수심' : 'Average depth'} ${item.averageDepthM.toLocaleString()}m`;
    const note = document.createElement('p'); note.textContent = item.note[ko ? 'ko' : 'en'];
    const source = this.sourceLink(item);
    card.append(name, depth, note, source); return card;
  },

  trenchCard(item, ko) {
    const card = document.createElement('article'); card.className = 'trench-card';
    const name = document.createElement('b'); name.textContent = item.name[ko ? 'ko' : 'en'];
    const depth = document.createElement('span'); depth.className = 'depth';
    depth.textContent = item.depthMin === item.depthMax
      ? `${item.depthMin.toLocaleString()}m`
      : `${item.depthMin.toLocaleString()}–${item.depthMax.toLocaleString()}m`;
    const method = document.createElement('p'); method.textContent = item.depthMethod[ko ? 'ko' : 'en'];
    const note = document.createElement('p'); note.textContent = item.note[ko ? 'ko' : 'en'];
    const source = this.sourceLink(item);
    const dive = document.createElement('button'); dive.type = 'button';
    dive.textContent = ko ? '이 좌표의 GEBCO 격자 보기' : 'Open GEBCO cell at this point';
    dive.addEventListener('click', async () => {
      const { diveScene } = await import('./divescene.js');
      await diveScene.open({ lat: item.lat, lon: item.lon, name: item.name[ko ? 'ko' : 'en'] });
    });
    card.append(name, depth, method, note, source, dive); return card;
  },

  sourceLink(item) {
    const root = document.createElement('span');
    const link = document.createElement('a'); link.href = item.sourceUrl;
    link.target = '_blank'; link.rel = 'noopener'; link.textContent = `${item.source} ↗`;
    root.append(link);
    if (item.secondarySourceUrl) {
      const second = document.createElement('a'); second.href = item.secondarySourceUrl;
      second.target = '_blank'; second.rel = 'noopener'; second.textContent = `${item.secondarySource} ↗`;
      root.append(document.createTextNode(' · '), second);
    }
    return root;
  },
};
