// 지금 켜져 있는 레이어 — 한 줄로 보이고, 한 번에 끌 수 있다
//
// 받은 감사(3차)
//   "바람·산불·태풍을 차례로 켜면 모두 누적되지만 메뉴를 닫으면 무엇이 켜졌는지
//    알 수 없다. 빨간 산불 점과 태풍 경로가 한 화면에 섞여도 사용자에게 현재
//    조합을 설명하지 않는다."
//
// 맞는 지적이다. 우리 원칙(모든 값에 출처·시각)을 지키면서도 **"지금 화면이
// 무엇으로 이루어져 있나"**는 답하지 못하고 있었다.
//
// ⚠️ 좌하단 출처 표시(ui-source.js)와 역할이 다르다.
//    저쪽은 "바탕에 깔린 자료가 무엇이며 언제 잰 것인가" 한 종을 자세히 말한다.
//    이쪽은 "지금 몇 겹이 겹쳐 있나"를 전부 얕게 보여주고 끌 수 있게 한다.
// ⚠️ 하나도 안 켜져 있으면 아무것도 그리지 않는다. 빈 칩 줄은 화면만 먹는다.

import { store } from './store.js';
import { i18n } from './i18n.js';
import { ITEMS } from './layerbar.js';

/* 켜져 있어도 여기 세지 않는 것 —
   ⚠️ 기본으로 늘 켜져 있는 바탕(구름)까지 세면 "항상 1개"가 되어 뜻이 없어진다. */
const SKIP = new Set(['clouds']);

export const activeBar = {
  el: null,

  init() {
    store.on('layer', () => this.render());
    /* ⚠️ 언어를 바꾸면 칩 글자도 따라가야 한다 — 안 하면 영어 화면에 한국어 칩이 남는다.
       (AX 1차 검수 지적) */
    i18n.onChange(() => this.render());
    this.render();
    return this;
  },

  _list() {
    return ITEMS.filter(it => !SKIP.has(it.id) && store.isOn(it.id));
  },

  render() {
    const on = this._list();
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'actBar';
      document.body.appendChild(this.el);
    }
    if (!on.length) { this.el.classList.remove('on'); this.el.innerHTML = ''; return; }

    const ko = i18n.lang === 'ko';
    this.el.innerHTML = '';
    on.forEach(it => {
      const b = document.createElement('button');
      b.className = 'act-chip';
      b.type = 'button';
      /* ⚠️ 이름 옆에 "무엇인가"를 한 마디로 붙인다 — 관측인지 예보인지 모델인지.
         브랜드 시트의 OBSERVED ≠ FORECAST 를 화면에서 지키는 자리다. */
      b.innerHTML = `<span>${ko ? it.ko : it.en}</span>`
        + `<i class="act-x" aria-hidden="true">×</i>`;
      b.setAttribute('aria-label',
        `${ko ? it.ko : it.en} ${ko ? '끄기' : 'off'}`);
      b.onclick = () => store.setLayer(it.id, false);
      this.el.appendChild(b);
    });

    if (on.length > 1) {
      const all = document.createElement('button');
      all.className = 'act-all';
      all.type = 'button';
      all.textContent = ko ? `모두 끄기 (${on.length})` : `Clear all (${on.length})`;
      /* ⚠️ 한 번에 끄되 **하나씩** 끈다. 상태를 통째로 갈아끼우면
         레이어마다 붙어 있는 정리(엔티티 제거)가 안 돌아 지도에 잔상이 남는다. */
      all.onclick = () => this._list().forEach(it => store.setLayer(it.id, false));
      this.el.appendChild(all);
    }
    this.el.classList.add('on');
  },
};
