/* 취미 — 서핑 · 낚시 · 해구 탐험 · 패러글라이딩 · 산 · 하늘을 묶은 자리
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
 *
 * 바다 항목은 취미 카테고리로 통합되어 같은 실행 경로를 공유한다.
 */

import { i18n } from './i18n.js';

const $ = s => document.querySelector(s);

/* ⚠️ 부제는 **그 화면이 실제로 답하는 질문**이다. 기능 이름을 다시 쓰지 않는다 —
   "서핑 · 서핑 정보" 같은 줄은 아무것도 알려주지 않는다. */
const ITEMS = [
  { act: 'layer:sst', ko: '해수면 온도', en: 'Sea temperature',
    subKo: '모델 · 유효시각', subEn: 'Model · valid time',
    color: '#4fd0e0',
    ico: '<path d="M8.2 4.2v10.1a4.2 4.2 0 1 0 7.6 0V4.2a3.8 3.8 0 0 0-7.6 0z"/><path d="M12 7.2v9.5" stroke-linecap="round"/>' },
  { act: 'layer:sstanom', ko: '수온 편차', en: 'SST anomaly',
    subKo: '1991–2020 평년 대비', subEn: 'vs 1991–2020 normal',
    color: '#73c8e7',
    ico: '<path d="M4 8h7M7.5 4.5v7M14 16h6" stroke-linecap="round"/><circle cx="12" cy="12" r="9"/>' },
  { act: 'layer:wave', ko: '파고', en: 'Waves',
    subKo: '큰 쪽 파도 평균', subEn: 'Significant height',
    color: '#4fd0e0',
    ico: '<path d="M2.4 8.2c1.6 0 1.6-1.5 3.2-1.5s1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/><path d="M2.4 13.2c1.6 0 1.6-1.5 3.2-1.5s1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/><path d="M2.4 18.2c1.6 0 1.6-1.5 3.2-1.5s1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/>' },
  { act: 'layer:swell', ko: '너울', en: 'Swell',
    subKo: '먼바다에서 온 긴 파도', subEn: 'Long-period waves from offshore',
    color: '#65d6e7',
    ico: '<path d="M2.5 15.5c3.2 0 3.2-5.5 6.4-5.5s3.2 5.5 6.4 5.5 3.2-5.5 6.2-5.5"/><path d="M3 19h18" stroke-linecap="round"/>' },
  { act: 'layer:current', ko: '해류', en: 'Ocean current',
    subKo: '표층 흐름 · 조류 아님', subEn: 'Surface flow · not tide',
    color: '#51b8d1',
    ico: '<path d="M3 7h14l-3-3M21 17H7l3 3" stroke-linecap="round" stroke-linejoin="round"/>' },
  { act: 'layer:buoy', ko: '해양 부이', en: 'Ocean buoys',
    subKo: '기기 실측 · 관측시각', subEn: 'Measured · observation time',
    color: '#8bd8e6',
    ico: '<path d="M9 5h6l1.5 10h-9z"/><path d="M12 5V2M4 18c2 0 2 1.5 4 1.5S10 18 12 18s2 1.5 4 1.5 2-1.5 4-1.5" stroke-linecap="round"/>' },
  { act: 'surf', ko: '서핑', en: 'Surf',
    subKo: '이 해변에 너울이 들어오는가', subEn: 'Is the swell reaching this beach',
    color: '#4fd0e0',
    ico: '<path d="M2.4 16.6c1.6 0 1.6-1.5 3.2-1.5s1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/><path d="M2.4 20.2c1.6 0 1.6-1.5 3.2-1.5s1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/><path d="M6.6 11.4c2-4.4 6.2-7.3 10.8-7.3-.4 3.6-2.3 6.6-5 8.4"/>' },
  { act: 'fishing', ko: '낚시', en: 'Fishing',
    subKo: '물때와 안전 · 방파제 · 섬', subEn: 'Tide and safety · breakwaters · islands',
    color: '#e0d18a',
    ico: '<path d="M15.4 4.2v11.2a4 4 0 0 1-8 0v-1.6" stroke-linecap="round"/><path d="M12.6 4.2h5.6" stroke-linecap="round"/><circle cx="18.6" cy="4.2" r="1.4"/>' },
  { act: 'my-ocean', ko: 'My Ocean', en: 'My Ocean',
    subKo: '안전·서핑·낚시·생태·Dive·선박 한눈에', subEn: 'Safety · surf · fishing · life · dive · vessels',
    color: '#75d6df',
    ico: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>' },
  { act: 'dive', ko: 'Dive · 심해', en: 'Dive · Deep sea',
    subKo: 'GEBCO 2026 수심 기둥과 심해 생물', subEn: 'GEBCO 2026 depth column and deep-sea life',
    color: '#578fc8',
    ico: '<path d="M5 4v6c0 5 3 9 7 11 4-2 7-6 7-11V4"/><path d="M8 8h8M12 8v8" stroke-linecap="round"/>' },
  { act: 'trench', ko: '해구', en: 'Trenches',
    subKo: '지구의 가장 깊은 바다로 들어가기', subEn: 'Explore Earth’s deepest ocean regions',
    color: '#57b9d0',
    ico: '<path d="M2.4 6.2h19.2" stroke-linecap="round"/><path d="M3.2 9.2c3.2.2 4.4 1.8 6.2 5.2 1.1 2.2 2 4.2 2.6 5.4.6-1.2 1.5-3.2 2.6-5.4 1.8-3.4 3-5 6.2-5.2" stroke-linecap="round"/><path d="M12 9.2v8.2" stroke-linecap="round" opacity=".55"/>' },
  { act: 'vessel', ko: '선박', en: 'Vessels',
    subKo: '공식 실시간 위치 · 여객선 운항', subEn: 'Official live positions · passenger services',
    color: '#4fd0e0',
    ico: '<path d="M4 14.2 6.2 8h11.6l2.2 6.2"/><path d="M8.4 8V4.8h7.2V8"/><path d="M2.8 15.4c1.8 0 1.8 1.5 3.6 1.5s1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5 1.8-1.5 3.6-1.5 1.8 1.5 3.6 1.5" stroke-linecap="round"/><path d="M4.4 20c1.2 0 1.2-1 2.4-1s1.2 1 2.4 1 1.2-1 2.4-1 1.2 1 2.4 1 1.2-1 2.4-1 1.2 1 2.4 1" stroke-linecap="round"/>' },
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
  /* ⚠️ 부제에 **"어디로 갔나"** 로 적는다. "이동 경로"라고 쓰면 길이 있는 줄 안다 —
     이 자료는 출발지와 도착지 두 지점뿐이다. */
  { act: 'migbird', ko: '철새', en: 'Migratory birds',
    subKo: '봄에 우리 동네 새가 어디로 갔나', subEn: 'Where our birds went in spring',
    color: '#ffd08a',
    ico: '<path d="M2.6 9.6c3-1.2 5 .6 6.4 2.6s3 3.8 5.6 3.4" stroke-linecap="round"/><path d="M9.6 5.4c3.4-.8 6.2.8 7.8 3.4s2.6 4.4 4 5.2" stroke-linecap="round" opacity=".55"/>' },
  { act: 'ecobird', ko: '전국 조류 조사', en: 'Bird surveys',
    subKo: '어느 5km 칸에 조사 기록이 있나', subEn: 'Which 5 km cells have survey records',
    color: '#7fd8c8',
    ico: '<path d="M3 13.6c2.8-3.6 5.6-5.4 8.5-5.4 3.3 0 5.2 1.7 9.5 5.4" stroke-linecap="round"/><path d="M8.6 16.8h6.8M12 13.4v6.8" stroke-linecap="round"/><circle cx="17.8" cy="7" r="1.2"/>' },
  { act: 'sky', ko: '하늘', en: 'Sky',
    subKo: '오늘 밤 별이 보이는가', subEn: 'Will the sky be clear tonight',
    color: '#b9a7f0',
    ico: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.4M12 19.2v2.4M21.6 12h-2.4M4.8 12H2.4M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7M18.8 18.8l-1.7-1.7M6.9 6.9 5.2 5.2" stroke-linecap="round"/>' },
];

const GROUPS = [
  { id: 'ocean-data', kicker: 'OCEAN DATA', ko: '바다 관측·지도', en: 'Ocean data & maps',
    noteKo: '모델 자료와 기기 실측을 구분해 한 장씩 켭니다.',
    noteEn: 'Open model data and instrument observations one layer at a time.', color: '#4fd0e0',
    acts: ['layer:sst', 'layer:sstanom', 'layer:wave', 'layer:swell', 'layer:current', 'layer:buoy'] },
  { id: 'ocean-activity', kicker: 'OCEAN ACTIVITY', ko: '바다 활동', en: 'Ocean activities',
    noteKo: '서핑·낚시 조건과 공식 선박 화면, 해양 관제판',
    noteEn: 'Surf and fishing conditions, official vessel tools and the ocean board.', color: '#65d6e7',
    acts: ['surf', 'fishing', 'vessel', 'my-ocean'] },
  { id: 'deep-sea', kicker: 'DEEP SEA', ko: '심해 탐험', en: 'Deep-sea exploration',
    noteKo: 'GEBCO 격자 수심과 출처가 있는 해구·생물 자료',
    noteEn: 'GEBCO grid depth with sourced trench and species records.', color: '#578fc8',
    acts: ['dive', 'trench'] },
  { id: 'life', kicker: 'RECORDS', ko: '생물 관측', en: 'Wildlife records',
    noteKo: '현재 위치가 아닌 조사·이동 기록', noteEn: 'Survey and movement records, not current positions', color: '#7fd8c8',
    acts: ['turtle', 'seabird', 'migbird', 'ecobird'] },
  { id: 'land-sky', kicker: 'LAND · SKY', ko: '땅과 하늘', en: 'Land & sky',
    noteKo: '산·바람·오늘 밤 하늘', noteEn: 'Mountains, wind and tonight’s sky', color: '#b9a7f0',
    acts: ['para', 'mountain', 'sky'] },
];
const ITEM_BY_ACT = new Map(ITEMS.map(item => [item.act, item]));

function card(item, ko) {
  return `<button class="out-card" data-out-act="${item.act}" style="--c:${item.color}">
    <span class="out-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${item.ico}</svg></span>
    <b>${ko ? item.ko : item.en}</b>
    <span>${ko ? item.subKo : item.subEn}</span>
  </button>`;
}

export const outdoorPanel = {
  _run: null,
  _bound: false,
  _pending: null,

  _bind() {
    if (this._bound) return;
    this._bound = true;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-out-act]');
      if (!b) return;
      const action = b.dataset.outAct;
      /* 지구본이 먼저 뜨고 부가 초기화가 이어지는 짧은 구간에도 메뉴는 눌릴 수 있다.
         실행 표가 붙기 전의 첫 선택을 버리지 않고, init 직후 한 번 이어서 연다. */
      if (!this._run) { this._pending = action; return; }
      this.close();
      this._run(action);
    });
  },

  /** @param run (act)=>void — 고른 것을 실제로 여는 쪽 */
  init(run) {
    this._run = run;
    this._bind();
    if (this._pending) {
      const action = this._pending;
      this._pending = null;
      this.close();
      this._run(action);
    }
    return this;
  },

  open() {
    this._bind();
    const ko = i18n.lang === 'ko';
    const body = $('#outBody');
    if (body) {
      body.innerHTML = `
        <p class="out-lead">${ko
          ? '보고 싶은 범주를 고르면 <b>현재 조건과 관측 기록</b>으로 바로 이동합니다.'
          : 'Choose a category to open current conditions or observation records.'}</p>
        <div class="out-groups">${GROUPS.map(group => `
          <section class="out-group" data-out-group="${group.id}" style="--c:${group.color}">
            <header class="out-group-head"><small>${group.kicker}</small><h4>${ko ? group.ko : group.en}</h4>
              <p>${ko ? group.noteKo : group.noteEn}</p></header>
            <div class="out-grid">${group.acts.map(act => card(ITEM_BY_ACT.get(act), ko)).join('')}</div>
          </section>`).join('')}</div>`;
    }
    $('#outSheet')?.classList.add('up');
  },

  close() { $('#outSheet')?.classList.remove('up'); },
};
