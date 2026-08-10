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
      const opening = !this.root.classList.contains('open');
      if (opening) document.dispatchEvent(new CustomEvent('earthus:close-menu'));
      this.root.classList.toggle('open', opening);
      this.root.setAttribute('aria-expanded', String(this.root.classList.contains('open')));
    });
    this.root.querySelectorAll('[data-scale-stage]').forEach(button => {
      button.addEventListener('click', () => {
        const [next, stage] = ROUTES[button.dataset.scaleStage] || [];
        if (next) sceneMgr.to(next, { stage });
      });
    });
    this.root.querySelectorAll('[data-aetherus-act]').forEach(button => {
      button.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('aetherus:photo', {
          detail: button.dataset.aetherusAct === 'webb' ? 'JWST' : 'HST',
        }));
      });
    });
    document.addEventListener('earthus:open-menu', () => {
      this.root.classList.remove('open');
      this.root.setAttribute('aria-expanded', 'false');
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
    /* AETHERUS와 EARTHUS는 장면에 따라 교체하지 않는다. 우주에서도 EARTHUS로
       즉시 돌아갈 수 있어야 하므로 두 손잡이를 왼쪽에 함께 유지한다. */
    const menuTab = document.getElementById('menuTab');
    const menuLabel = menuTab?.querySelector('.mt-label');
    if (menuLabel) menuLabel.textContent = 'EARTHUS';
    menuTab?.setAttribute('aria-label', 'EARTHUS 메뉴');
    this.root.querySelectorAll('[data-scale-stage]').forEach(button => {
      const active = button.dataset.scaleStage === stage;
      button.classList.toggle('current', active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
      const label = button.querySelector(i18n.lang === 'ko' ? 'span' : 'small');
      button.setAttribute('aria-label', label?.textContent || button.dataset.scaleStage);
    });
  },
};
