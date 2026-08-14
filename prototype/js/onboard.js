// 첫 만남 — 오늘의 볼거리 칩 + 코치마크 3개
//
// 왜 만들었나
//   온보딩이 없었다. 처음 온 사람은 까만 화면에 지구 하나를 보고,
//   돌려볼 수 있다는 것도 메뉴가 있다는 것도 모른 채 나갔다.
//   "지구만 돌리다 나간다"는 게 아니라 **돌릴 수 있는지도 몰랐다**.
//
// 두 가지를 함께 둔다
//   ① 볼거리 칩 — "오늘 지구에서 가장 눈에 띄는 곳" 3개. 누르면 날아간다.
//      할 일을 주지 않으면 첫 화면은 예쁜 배경화면일 뿐이다.
//   ② 코치마크  — 돌려보기 → 칩 눌러보기 → 메뉴. 딱 세 걸음, 한 번만.
//   ⚠️ 둘을 한 파일에 두는 이유: 코치마크 2단계가 칩을 가리킨다.
//      칩이 아직 안 왔는데 "이걸 눌러보세요"라고 하면 아무것도 없는 곳을 가리킨다.
//
// ⚠️ 코치마크는 **한 번만** 뜬다. 매번 뜨면 안내가 아니라 방해다.
// ⚠️ 자료를 못 받아도 앱은 그대로 돌아가야 한다. 칩이 없으면 없는 대로 간다.

import { i18n } from './i18n.js';
import { store } from './store.js';
import { flyTo } from './viewer.js';

const $ = s => document.querySelector(s);
const LS_COACH = 'earthus.coachDone';

/* 칩에 쓸 항목 수. ⚠️ 3개를 넘기지 않는다 —
   고르라고 여섯 개를 주면 고르지 못하고 아무것도 안 누른다. */
const CHIP_N = 3;

/* 항목별 아이콘·짧은 이름. today.js 의 id 와 맞춘다.
   ⚠️ 모르는 id 가 와도 기본값으로 뜬다 — 빠뜨리는 것보다 낫다.
   ⚠️ 짧은 이름이 왜 필요한가: today.js 의 제목은 "가장 파도가 높은 바다"처럼
      문장이라 375px 폰에서 칩 하나가 화면을 다 먹는다. 두 개가 안 보이면
      "밀어서 더 볼 수 있다"는 걸 아무도 모른다. 값과 장소가 핵심이므로
      종류는 낱말 하나로 줄인다. */
const ICON = {
  wave: '🌊', sst: '🌡️', sstc: '❄️', temp: '🔥', cold: '❄️',
  wind: '💨', dust: '🟤', uv: '☀️', fog: '🌫️',
};
const SHORT = {
  wave: { ko: '최고 파고', en: 'Highest waves' },
  sst:  { ko: '최고 수온', en: 'Warmest sea' },
  sstc: { ko: '최저 수온', en: 'Coldest sea' },
  temp: { ko: '최고 기온', en: 'Hottest' },
  cold: { ko: '최저 기온', en: 'Coldest' },
  wind: { ko: '최강 바람', en: 'Strongest wind' },
  dust: { ko: '최고 먼지', en: 'Most dust' },
  uv:   { ko: '최고 자외선', en: 'Highest UV' },
  fog:  { ko: '최저 시정', en: 'Lowest visibility' },
};

export const onboard = {
  _items: [],

  /* @param {{chips?:boolean,coach?:boolean}} opt
     ⚠️ 첫 화면에서 칩을 끄기 위해 옵션을 받는다. 받은 지시:
        "밑에 최고파도 최고 수온 그런거 다 빼줘. 처음 보자마자 아름다운 지구와
         기초 정보만 보여주고 싶어."
     ⚠️ 칩 코드를 지우지 않고 **부르지 않을 뿐**이다. 코치마크가 칩 자리를
        참조하고(STEPS 의 at:'chips'), 나중에 다른 자리에 다시 쓸 수 있다. */
  async init(opt = {}) {
    if (opt.chips !== false) {
      /* ⚠️ await 하지 않는다 — 격자 자료를 받는 데 몇 초가 걸리는데
         그동안 코치마크가 안 뜨면 "아무것도 없는 앱"으로 보인다. */
      this.chips().catch(e => console.warn('[볼거리] ', e.message));
    }
    /* 첫 화면을 지구·날짜·시각·날씨만 두라는 제품 결정이 우선한다.
       false면 첫 방문이어도 안내 카드를 자동으로 올리지 않는다. */
    if (opt.coach !== false) this.coach();
    return this;
  },

  /* ── 오늘의 볼거리 칩 ─────────────────────────────────────── */
  async chips() {
    const wrap = $('#spotChips');
    if (!wrap) return;

    const { today } = await import('./today.js');
    const all = await today.build();
    if (!all || !all.length) return;

    /* ⚠️ 앞에서 3개를 자르지 않고 **값이 극단적인 순서**로 고르고 싶지만,
       항목마다 단위가 달라(m, °C, µg/m³) 서로 비교할 수 없다.
       그래서 today.js 가 정한 순서를 그대로 쓰되 종류가 겹치지 않게만 한다. */
    const seen = new Set();
    this._items = all.filter(it => {
      const k = it.layer || it.id;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).slice(0, CHIP_N);

    this.render();
    i18n.onChange(() => this.render());
  },

  render() {
    const wrap = $('#spotChips');
    if (!wrap || !this._items.length) return;
    wrap.innerHTML = '';

    const ko = i18n.lang === 'ko';
    this._items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'spot-chip';
      /* 짧은 이름이 없으면 원래 제목을 그대로 쓴다 — 지어내지 않는다 */
      const name = SHORT[it.id] ? (ko ? SHORT[it.id].ko : SHORT[it.id].en) : it.title;
      b.title = `${it.title} — ${it.place || ''}`;      // 마우스로는 전체 문장을 볼 수 있다
      b.innerHTML = `<span class="sc-ico">${ICON[it.id] || '📍'}</span>`
        + `<span class="sc-txt"><b>${esc(name)} ${esc(it.value)}</b>`
        + `<i>${esc(it.place || '')}</i></span>`;
      b.onclick = async () => {
        /* 레이어를 켜고 → 날아가고 → 도착해서 핀.
           ⚠️ 핀은 도착한 뒤에 꽂는다. 같이 시작하면 날아가는 내내
              화면 밖에서 떨어진다 (pin.js 에 적어 둔 것과 같은 이유). */
        if (it.layer) store.setLayer(it.layer, true);
        flyTo(it.lon, it.lat, 2_600_000, 1.6, async () => {
          const { dropPin } = await import('./pin.js');
          dropPin(it.lon, it.lat, `${it.title} ${it.value}`);
        });
        /* 눌렀으면 안내는 끝났다 — 칩을 접어 지구를 가리지 않게 한다 */
        wrap.classList.remove('on');
      };
      wrap.appendChild(b);
    });

    wrap.classList.add('on');
  },

  /* ── 코치마크 ─────────────────────────────────────────────── */
  coach() {
    if (localStorage.getItem(LS_COACH) === '1') return;
    const box = $('#coach');
    if (!box) return;

    const ko = i18n.lang === 'ko';
    const STEPS = [
      { at: 'center',
        ko: { t: '지구를 돌려보세요', d: '손가락으로 끌면 돌아갑니다. 두 손가락으로 확대할 수 있어요.' },
        en: { t: 'Spin the globe', d: 'Drag to rotate. Pinch to zoom in.' } },
      { at: 'chips',
        ko: { t: '오늘의 볼거리', d: '누르면 그곳으로 날아가서 표시해 드립니다.' },
        en: { t: "Today's highlights", d: 'Tap one to fly there.' } },
      { at: 'menu',
        ko: { t: '메뉴는 오른쪽에', d: '레이어 · 위성 · 특보를 여기서 켭니다. 검색은 오른쪽 위 돋보기.' },
        en: { t: 'Menu on the right', d: 'Turn on layers, satellites and alerts here.' } },
    ];

    let i = 0;
    const done = () => {
      localStorage.setItem(LS_COACH, '1');
      box.classList.remove('on');
      box.setAttribute('aria-hidden', 'true');
      cleanup();
    };

    /* ⚠️ 1단계는 사람이 실제로 지구를 돌리면 스스로 넘어간다.
       "돌려보세요"라고 해놓고 돌렸는데도 그대로 있으면 말을 안 듣는 화면이 된다. */
    let spun = null;
    const cleanup = () => {
      if (spun) { document.querySelector('#cesiumContainer')?.removeEventListener('pointerdown', spun); spun = null; }
    };

    const show = () => {
      const s = STEPS[i];
      const txt = ko ? s.ko : s.en;
      box.className = 'on at-' + s.at;
      box.setAttribute('aria-hidden', 'false');
      box.innerHTML =
        `<div class="co-card">`
        + `<div class="co-step">${i + 1} / ${STEPS.length}</div>`
        + `<b>${esc(txt.t)}</b><p>${esc(txt.d)}</p>`
        + `<div class="co-btns">`
        + `<button class="co-skip">${ko ? '건너뛰기' : 'Skip'}</button>`
        + `<button class="co-next">${i === STEPS.length - 1 ? (ko ? '시작하기' : 'Start') : (ko ? '다음' : 'Next')}</button>`
        + `</div></div>`;
      box.querySelector('.co-skip').onclick = done;
      box.querySelector('.co-next').onclick = next;

      cleanup();
      if (s.at === 'center') {
        spun = () => { if (i === 0) next(); };
        document.querySelector('#cesiumContainer')?.addEventListener('pointerdown', spun, { once: true, passive: true });
      }
    };

    const next = () => {
      i += 1;
      if (i >= STEPS.length) { done(); return; }
      /* 칩이 아직 안 왔으면 그 단계는 건너뛴다 —
         아무것도 없는 자리를 가리키지 않는다 */
      if (STEPS[i].at === 'chips' && !$('#spotChips')?.classList.contains('on')) i += 1;
      if (i >= STEPS.length) { done(); return; }
      show();
    };

    /* 인트로(지구가 도는 연출)가 끝날 즈음에 띄운다.
       바로 띄우면 연출을 덮어 첫인상을 망친다. */
    setTimeout(show, 2600);
  },
};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
