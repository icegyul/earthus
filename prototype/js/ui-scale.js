// 은하에서 해구까지 공용 로그 스케일 자

import { sceneMgr } from './scene.js';
import { store } from './store.js';
import { i18n } from './i18n.js';

const ROUTES = {
  galaxies: ['space', 'galaxies'], milkyway: ['space', 'milkyway'],
  solar: ['space', 'solar'],
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
    this._wide = window.matchMedia('(min-width: 561px)');
    this._wide.addEventListener?.('change', () => this.render(store.scene, store.sceneStage));
    this.render(store.scene, store.sceneStage);
    return this;
  },
  render(next, stage) {
    if (!this.root) return;
    /* 데스크톱 탐험 장면에서는 자동으로 펼친다. 560px 이하에서 112px 트랙을
       자동으로 펴면 태양계 캔버스와 심해 자료를 덮으므로 손잡이만 남긴다.
       사용자가 손잡이를 누르면 모바일에서도 그대로 열 수 있다. */
    const autoOpen = next !== 'earth' && !!this._wide?.matches;
    this.root.classList.toggle('open', autoOpen);
    this.root.setAttribute('aria-expanded', String(autoOpen));
    this.root.querySelector('.scale-handle').textContent = 'AETHERUS';
    /* 받은 요청: "우주로 나가면 Aetherus 메뉴, 지구로 가면 earthus 메뉴".
       바다도 우리가 사는 지구의 영역이므로 space 장면만 Aetherus로 바꾼다. */
    const menuBrand = next === 'space' ? 'AETHERUS' : 'EARTHUS';
    const menuTab = document.getElementById('menuTab');
    const menuLabel = menuTab?.querySelector('.mt-label');
    if (menuLabel) menuLabel.textContent = menuBrand;
    menuTab?.setAttribute('aria-label', `${menuBrand} 메뉴`);
    this.root.querySelectorAll('[data-scale-stage]').forEach(button => {
      const active = button.dataset.scaleStage === stage;
      button.classList.toggle('current', active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
      const label = button.querySelector(i18n.lang === 'ko' ? 'span' : 'small');
      button.setAttribute('aria-label', label?.textContent || button.dataset.scaleStage);
    });
  },
};
