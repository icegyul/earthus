/* 취미 — 서핑 · 낚시 · 패러글라이딩 · 산 · 하늘을 묶은 자리
 *
 * 받은 요청: "서핑, 낚시, 하늘, 산 이것들을 묶어서 뭐라고 할까?" → "취미로 바꾸자"
 *
 * ⚠️⚠️ 이름을 **"추천"으로 하지 않았다.** 이 앱은 권하지 않는다 —
 *    "오늘 서핑 추천!" 은 우리가 할 수 없는 말이다. 파도가 1.2m 라는 것과
 *    "가도 좋다"는 것은 전혀 다른 문장이고, 뒤엣것은 그 사람의 실력·장비·동행을
 *    알아야 할 수 있다. 바다와 산에서는 사람이 죽는다.
 *    "취미" 는 무엇을 하려는 사람인지만 말하고 판단은 안 넘겨받는 이름이다.
 *
 * ⚠️ 네 화면은 묻는 것이 같다: "지금 저기 조건이 어떤가."
 *    따로 두면 메뉴만 길어지고, 하나를 쓰는 사람이 나머지를 못 찾는다.
 */

import { i18n } from './i18n.js';

const $ = s => document.querySelector(s);

/* ⚠️ 부제는 **그 화면이 실제로 답하는 질문**이다. 기능 이름을 다시 쓰지 않는다 —
   "서핑 · 서핑 정보" 같은 줄은 아무것도 알려주지 않는다. */
const ITEMS = [
  { act: 'surf', ko: '서핑', en: 'Surf',
    subKo: '이 해변에 너울이 들어오는가', subEn: 'Is the swell reaching this beach',
    color: '#4fd0e0',
    ico: '<path d="M2.4 16.6c1.6 0 1.6-1.5 3.2-1.5s1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/><path d="M2.4 20.2c1.6 0 1.6-1.5 3.2-1.5s1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/><path d="M6.6 11.4c2-4.4 6.2-7.3 10.8-7.3-.4 3.6-2.3 6.6-5 8.4"/>' },
  { act: 'fishing', ko: '낚시', en: 'Fishing',
    subKo: '물때와 안전 · 방파제 · 섬', subEn: 'Tide and safety · breakwaters · islands',
    color: '#e0d18a',
    ico: '<path d="M15.4 4.2v11.2a4 4 0 0 1-8 0v-1.6" stroke-linecap="round"/><path d="M12.6 4.2h5.6" stroke-linecap="round"/><circle cx="18.6" cy="4.2" r="1.4"/>' },
  { act: 'para', ko: '패러글라이딩', en: 'Paragliding',
    subKo: '바람 세기와 구름 밑면', subEn: 'Wind strength and cloud base',
    color: '#b9a7f0',
    ico: '<path d="M3.6 10.4a8.4 8.4 0 0 1 16.8 0" /><path d="M3.6 10.4 12 19.6l8.4-9.2" stroke-linecap="round"/><path d="M9.2 10.4 12 19.6l2.8-9.2" stroke-linecap="round"/>' },
  { act: 'mountain', ko: '산', en: 'Mountains',
    subKo: '정상은 여기보다 얼마나 추운가', subEn: 'How much colder is the summit',
    color: '#9fd8b0',
    ico: '<path d="M2.6 19.4 9.4 7.2l4.1 7.1 2.2-3.4 5.7 8.5z"/><path d="M7.6 10.4h3.6" stroke-linecap="round"/>' },
  /* ⚠️ 부제에 **"지나간"** 을 반드시 넣는다. 이 자료는 추적이 끝난 것만 공개되므로
     "바다거북 위치"라고만 쓰면 지금 거기 있는 줄 안다. */
  { act: 'turtle', ko: '바다거북', en: 'Sea turtles',
    subKo: '방류된 거북이 지나간 길', subEn: 'Where released turtles went',
    color: '#4fd0e0',
    ico: '<ellipse cx="12" cy="12.4" rx="6.2" ry="5.2"/><path d="M12 7.2v10.4M6.4 10.6h11.2M6.4 14.2h11.2"/><circle cx="12" cy="4.6" r="1.8"/><path d="M5.2 8.2 2.8 6.4M18.8 8.2l2.4-1.8M5.2 16.6l-2.4 1.8M18.8 16.6l2.4 1.8" stroke-linecap="round"/>' },
  /* ⚠️ 부제에 **"조사한 해에"** 를 넣는다. 이 자료도 실시간이 아니다 —
     "바닷새 위치"라고만 쓰면 지금 거기 있는 줄 안다. 거북과 같은 이유다. */
  { act: 'seabird', ko: '바닷새', en: 'Seabirds',
    subKo: '조사한 해에 어디서 몇 마리를 셌나', subEn: 'Counts made at survey stations',
    color: '#7fd8c8',
    ico: '<path d="M3 13.5c3.2-4 5.6-5.4 9-5.4s5.8 1.4 9 5.4" stroke-linecap="round"/><path d="M6.5 12.2c1.6-2.6 3.4-3.8 5.5-3.8s3.9 1.2 5.5 3.8" stroke-linecap="round" opacity=".55"/><circle cx="12" cy="17.4" r="1.5"/>' },
  { act: 'sky', ko: '하늘', en: 'Sky',
    subKo: '오늘 밤 별이 보이는가', subEn: 'Will the sky be clear tonight',
    color: '#b9a7f0',
    ico: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M21.6 12h-2.4M4.8 12H2.4M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7M18.8 18.8l-1.7-1.7M6.9 6.9 5.2 5.2" stroke-linecap="round"/>' },
];

export const outdoorPanel = {
  _run: null,

  /** @param run (act)=>void — 고른 것을 실제로 여는 쪽 */
  init(run) {
    this._run = run;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-out-act]');
      if (!b) return;
      this.close();
      this._run?.(b.dataset.outAct);
    });
    return this;
  },

  open() {
    const ko = i18n.lang === 'ko';
    const body = $('#outBody');
    if (body) {
      body.innerHTML = `
        <p class="out-lead">${ko
          ? '나가기 전에 <b>지금 조건</b>을 확인하세요.'
          : 'Check the conditions before you go.'}</p>
        <div class="out-grid">${ITEMS.map(it => `
          <button class="out-card" data-out-act="${it.act}" style="--c:${it.color}">
            <span class="out-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"
              stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${it.ico}</svg></span>
            <b>${ko ? it.ko : it.en}</b>
            <span>${ko ? it.subKo : it.subEn}</span>
          </button>`).join('')}</div>
        <p class="out-note">${ko
          ? '⚠️ <b>“가도 좋다”고 말하지 않습니다.</b> 값을 그대로 옮길 뿐입니다 — '
            + '실력·장비·동행은 우리가 모르고, 바다와 산에서는 사람이 다칩니다.'
          : '⚠️ We report conditions. We never tell you it is safe to go.'}</p>`;
    }
    $('#outSheet')?.classList.add('up');
  },

  close() { $('#outSheet')?.classList.remove('up'); },
};
