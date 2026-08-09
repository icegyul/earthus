// 은하에서 해구까지 공용 로그 스케일 자

import { sceneMgr } from './scene.js';
import { store } from './store.js';
import { i18n } from './i18n.js';

const ROUTES = {
  galaxies: ['space', 'galaxies'], milkyway: ['space', 'milkyway'],
  solar: ['space', 'solar'], moon: ['space', 'moon'],
  earth: ['earth', 'earth'], surface: ['ocean', 'surface'], trench: ['ocean', 'trench'],
};

export const scaleRail = {
  root: null,
  init() {
    this.root = document.getElementById('scaleRail');
    if (!this.root) return this;
    this.root.querySelector('.scale-handle')?.addEventListener('click', () => {
      this.root.classList.toggle('open');
      this.root.setAttribute('aria-expanded', String(this.root.classList.contains('open')));
    });
    this.root.querySelectorAll('[data-scale-stage]').forEach(button => {
      button.addEventListener('click', () => {
        const [next, stage] = ROUTES[button.dataset.scaleStage] || [];
        if (next) sceneMgr.to(next, { stage });
      });
    });
    store.on('scene', (next, stage) => this.render(next, stage));
    i18n.onChange(() => this.render(store.scene, store.sceneStage));
    this.render(store.scene, store.sceneStage);
    return this;
  },
  render(next, stage) {
    if (!this.root) return;
    // 지구에서는 접혀 기존 UI를 가리지 않고, 다른 장면에서는 자동으로 펼친다.
    this.root.classList.toggle('open', next !== 'earth');
    this.root.setAttribute('aria-expanded', String(next !== 'earth'));
    this.root.querySelector('.scale-handle').textContent = 'Aetherus';
    this.root.querySelectorAll('[data-scale-stage]').forEach(button => {
      const active = button.dataset.scaleStage === stage;
      button.classList.toggle('current', active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
      const label = button.querySelector(i18n.lang === 'ko' ? 'span' : 'small');
      button.setAttribute('aria-label', label?.textContent || button.dataset.scaleStage);
    });
  },
};
