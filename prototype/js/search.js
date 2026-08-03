// 통합 검색 — 장소·레이어·기능을 한 입력창에서
//
// 왜 만들었나
//   레이어 48종에 시트가 17장인데 찾아가는 길이 메뉴뿐이었다.
//   "지금 부산 날씨"를 보려면 메뉴 → 지구 → 스타일 목록에서 기온을 찾아 켜고,
//   지구를 손으로 돌려 부산을 찾아야 했다. 탐색 점수가 45/100 이었던 이유다.
//
// 무엇을 찾는가 (세 종류를 한 목록에 섞어 보여준다)
//   ① 장소   — 세계 204곳(geoname) + 기상청 관측지점 736곳 + 공항 4,037곳
//   ② 레이어 — layerbar 의 ITEMS 41종. 누르면 켜진다
//   ③ 기능   — 메뉴 12항목. 누르면 그 메뉴를 누른 것과 같다
//
// ⚠️ 장소 자료를 **이미 라이선스가 확인된 것만** 쓴다.
//    Open-Meteo 지오코딩을 폴백으로 붙이자는 계획이 있었지만(build-order),
//    무료 티어가 비상업 전용으로 확인돼(2026-08-02) 상업 서비스인 우리는 못 쓴다.
//    다행히 위 세 벌로 웬만한 검색은 덮인다 — 세계 도시는 공항 이름이 대신 잡아준다.
//    (유료 구독이 결정되면 그때 폴백을 붙인다. ai-weather-strategy.md §4)
//
// ⚠️ 장소 자료는 **처음 검색창을 열 때** 받는다. 시작할 때 받으면
//    검색을 안 쓰는 사람에게도 300KB 를 물리게 된다.

import { API } from './config.js';
import { store } from './store.js';
import { i18n } from './i18n.js';
import { flyTo } from './viewer.js';
import { worldPlaces } from './geoname.js';
import { ITEMS } from './layerbar.js';

const $ = s => document.querySelector(s);

/* 장소 종류별 도착 고도(m).
   ⚠️ 관측지점은 읍·면 단위라 가깝게, 세계 도시는 넓게 잡는다.
      같은 고도로 날아가면 도시는 답답하고 관측지점은 어디가 어딘지 모른다. */
const ZOOM = { world: 900_000, kma: 90_000, airport: 140_000 };

/* ── 한글 초성 ────────────────────────────────────────────────
   "ㅅㅇ" 로 서울을 찾을 수 있게 한다. 한글 입력에서 이게 없으면
   이름을 정확히 아는 사람만 검색을 쓸 수 있다. */
const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function chosung(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xAC00;
    out += (c >= 0 && c <= 11171) ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}
/** 입력이 초성만으로 이뤄졌나 (그럴 때만 초성 비교를 한다) */
const isChosungOnly = q => q.length > 0 && [...q].every(c => CHO.includes(c));

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

/* ── 점수 ──────────────────────────────────────────────────────
   앞에서부터 맞으면 높고, 중간에 있으면 낮다. 같으면 짧은 이름이 이긴다.
   ⚠️ 0 을 돌려주면 "안 맞음"이다. 0.1 같은 걸 주면 전부 걸린다. */
function score(text, q, qCho) {
  const t = norm(text);
  if (!t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 - Math.min(t.length, 30) * 0.3;
  if (t.includes(q)) return 50 - Math.min(t.length, 30) * 0.3;
  if (qCho) {
    const c = norm(chosung(text));
    /* ⚠️ 초성이 **정확히** 맞으면 크게 올린다.
       'ㅅㅇ' 은 서울을 찾는 말이지 '수온 편차'를 찾는 말이 아니다.
       앞부분만 맞는 긴 이름이 정확히 맞는 짧은 이름을 이기면 안 된다. */
    if (c === qCho) return 62;
    if (c.startsWith(qCho)) return 40 - Math.min(t.length, 30) * 0.3;
    if (c.includes(qCho)) return 25 - Math.min(t.length, 30) * 0.3;
  }
  return 0;
}

/* ── 기능(메뉴) 목록 ───────────────────────────────────────────
   ⚠️ 여기 이름만 적고 **동작은 메뉴 버튼을 눌러서** 한다.
      같은 동작을 두 번 구현하면 한쪽만 고치는 날이 온다. */
const ACTIONS = [
  { act: 'sat',       ko: '위성',      en: 'Satellites',  hint: '지금 머리 위를 지나는 위성' },
  { act: 'news',      ko: 'News',      en: 'News',        hint: '지구에서 지금 일어나는 일' },
  { act: 'events',    ko: '이벤트',    en: 'Events',      hint: '경고·브리핑·확정 사건' },
  { act: 'community', ko: 'LAB',       en: 'LAB',         hint: '오늘의 지구 · 자료 그래프' },
  { act: 'ask',       ko: 'if',        en: 'if',          hint: '자료에 물어보기' },
  { act: 'flight',    ko: '항공편',    en: 'Flights',     hint: '' },
  { act: 'sky',       ko: '하늘',      en: 'Sky',         hint: '해·달·별' },
  { act: 'locate',    ko: '내 위치',   en: 'My location', hint: '내가 있는 곳으로' },
  { act: 'globe',     ko: '전지구로',  en: 'Whole Earth', hint: '멀리서 지구 전체' },
  { act: 'settings',  ko: '설정',      en: 'Settings',    hint: '' },
];
/* 2단을 여는 것(지구 스타일·Alert)은 data-open 이라 따로 둔다 */
const OPENS = [
  { open: 'earth', ko: '지구 스타일', en: 'Earth style', hint: '바탕·기상·해양 레이어' },
  { open: 'alert', ko: 'Alert',       en: 'Alert',       hint: '태풍·지진·특보 레이어' },
];

export const search = {
  on: false,
  _places: null,          // 지연 로딩
  _loading: null,
  _rows: [],              // 지금 화면의 결과 (키보드 이동용)
  _cursor: 0,

  init() {
    const box = $('#searchBox');
    if (!box) return this;
    const input = $('#searchInput');

    $('#searchBtn')?.addEventListener('click', () => this.open());
    $('#searchClose')?.addEventListener('click', () => this.close());
    box.addEventListener('click', ev => { if (ev.target === box) this.close(); });

    /* ⌘K · Ctrl+K. ⚠️ 글자를 입력 중일 때 단축키를 가로채지 않는다 —
       다른 입력창에 K 를 못 쓰게 되면 그건 고장이다. */
    document.addEventListener('keydown', ev => {
      const typing = /^(INPUT|TEXTAREA)$/.test(ev.target.tagName) || ev.target.isContentEditable;
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault(); this.on ? this.close() : this.open(); return;
      }
      if (ev.key === 'Escape' && this.on) { ev.preventDefault(); this.close(); return; }
      if (!this.on || !typing) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); this._move(1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); this._move(-1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); this._pick(this._cursor); }
    });

    let t = null;
    input.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => this.render(input.value), 90);   // 타자마다 다시 그리지 않는다
    });

    i18n.onChange?.(() => { if (this.on) this.render(input.value); });
    return this;
  },

  open() {
    const box = $('#searchBox'), input = $('#searchInput');
    if (!box) return;
    this.on = true;
    box.classList.add('on');
    box.setAttribute('aria-hidden', 'false');
    input.value = '';
    this.render('');
    this._load();                       // 배경에서 장소 자료를 받아 둔다
    /* ⚠️ 모바일에서 focus() 를 바로 부르면 키보드가 안 올라오는 기기가 있다.
       화면 전환이 끝난 뒤 부른다. */
    setTimeout(() => input.focus(), 60);
  },

  close() {
    const box = $('#searchBox');
    if (!box) return;
    this.on = false;
    box.classList.remove('on');
    box.setAttribute('aria-hidden', 'true');
    $('#searchInput').blur();
  },

  /* ── 장소 자료 (한 번만 받는다) ───────────────────────────── */
  _load() {
    if (this._places || this._loading) return this._loading;
    const ko = i18n.lang === 'ko';

    this._loading = (async () => {
      const out = [];

      // ① 세계 지명 — 번들에 이미 있다 (요청 없음)
      worldPlaces().forEach(p => out.push({
        kind: 'world', ko: p.ko, en: p.en,
        sub: ko ? p.countryKo : p.countryEn,
        lat: p.lat, lon: p.lon,
      }));

      /* ② 기상청 관측지점 736곳 — 읍·면 단위 한국 지명이 여기 다 있다.
         ⚠️ 실패해도 검색은 계속 돌아야 한다. 없으면 없는 대로 쓴다. */
      try {
        const r = await fetch(`${API.WIND}/kma-aws-min.json`, { cache: 'force-cache' });
        if (r.ok) {
          const j = await r.json();
          (j.stations || []).forEach(s => {
            if (s.lat == null || s.lon == null || !s.name) return;
            out.push({ kind: 'kma', ko: s.name, en: s.name,
                       sub: ko ? '기상청 관측지점' : 'KMA station',
                       lat: s.lat, lon: s.lon });
          });
        }
      } catch (_) { /* 조용히 넘어간다 */ }

      /* ③ 공항 — [IATA, 이름, 도시, 나라, 위도, 경도, …]
         세계 도시 검색을 사실상 이게 받쳐 준다 (뮌헨·시애틀 …). */
      try {
        const r = await fetch('data/airports.json', { cache: 'force-cache' });
        if (r.ok) {
          const j = await r.json();
          j.forEach(a => {
            const [iata, name, city, country, lat, lon] = a;
            if (lat == null || lon == null) return;
            out.push({ kind: 'airport', ko: city || name, en: city || name,
                       sub: `${iata} · ${name}`, extra: country,
                       lat, lon });
          });
        }
      } catch (_) { /* 조용히 넘어간다 */ }

      this._places = out;
      this._loading = null;
      if (this.on) this.render($('#searchInput').value);   // 늦게 도착하면 다시 그린다
      return out;
    })();
    return this._loading;
  },

  /* ── 검색 ─────────────────────────────────────────────────── */
  find(qRaw) {
    const ko = i18n.lang === 'ko';
    const q = norm(qRaw);
    if (!q) return [];
    const qCho = isChosungOnly(qRaw.replace(/\s+/g, '')) ? norm(qRaw) : null;
    const hits = [];

    // 기능
    ACTIONS.forEach(a => {
      const s = Math.max(score(a.ko, q, qCho), score(a.en, q, qCho));
      if (s > 0) hits.push({ s: s + 6, type: 'action', title: ko ? a.ko : a.en, sub: a.hint, ref: a });
    });
    OPENS.forEach(a => {
      const s = Math.max(score(a.ko, q, qCho), score(a.en, q, qCho));
      if (s > 0) hits.push({ s: s + 6, type: 'open', title: ko ? a.ko : a.en, sub: a.hint, ref: a });
    });

    // 레이어
    ITEMS.forEach(it => {
      const s = Math.max(score(it.ko, q, qCho), score(it.en, q, qCho));
      if (s > 0) {
        hits.push({ s: s + 3, type: 'layer', title: ko ? it.ko : it.en,
                    sub: ko ? it.sub : it.subEn, ref: it });
      }
    });

    // 장소
    (this._places || []).forEach(p => {
      const s = Math.max(score(p.ko, q, qCho), score(p.en, q, qCho));
      if (s > 0) hits.push({ s, type: 'place', title: ko ? p.ko : p.en, sub: p.sub, ref: p });
    });

    hits.sort((a, b) => b.s - a.s);
    /* ⚠️ 같은 이름이 여러 자료에 있다 (예: '군산' 이 관측지점에도 공항에도).
       위도·경도를 반올림해 같은 자리면 하나만 남긴다. */
    const seen = new Set();
    const out = [];
    for (const h of hits) {
      const key = h.type === 'place'
        ? `p:${h.title}:${h.ref.lat.toFixed(1)}:${h.ref.lon.toFixed(1)}`
        : `${h.type}:${h.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h);
      if (out.length >= 24) break;
    }
    return out;
  },

  /* ── 그리기 ───────────────────────────────────────────────── */
  render(qRaw) {
    const list = $('#searchList');
    if (!list) return;
    const ko = i18n.lang === 'ko';
    list.innerHTML = '';
    this._cursor = 0;

    if (!String(qRaw || '').trim()) {
      this._rows = [];
      list.appendChild(hintBlock(ko));
      return;
    }

    const rows = this.find(qRaw);
    this._rows = rows;

    if (!rows.length) {
      const d = document.createElement('div');
      d.className = 'sr-empty';
      d.textContent = this._places
        ? (ko ? '찾는 것이 없습니다' : 'No matches')
        : (ko ? '장소 자료를 받는 중…' : 'Loading places…');
      list.appendChild(d);
      return;
    }

    const ICON = { place: '📍', layer: '◍', action: '›', open: '›' };
    rows.forEach((h, i) => {
      const b = document.createElement('button');
      b.className = 'sr-row' + (i === 0 ? ' on' : '');
      b.dataset.i = i;
      const tag = ko
        ? { place: '장소', layer: '레이어', action: '기능', open: '기능' }[h.type]
        : { place: 'Place', layer: 'Layer', action: 'Go', open: 'Go' }[h.type];
      b.innerHTML =
        `<span class="sr-ico">${ICON[h.type]}</span>`
        + `<span class="sr-txt"><b>${esc(h.title)}</b>`
        + (h.sub ? `<i>${esc(h.sub)}</i>` : '') + `</span>`
        + `<span class="sr-tag">${tag}</span>`;
      b.onclick = () => this._pick(i);
      list.appendChild(b);
    });
  },

  _move(d) {
    if (!this._rows.length) return;
    const n = this._rows.length;
    this._cursor = (this._cursor + d + n) % n;
    const rows = [...document.querySelectorAll('#searchList .sr-row')];
    rows.forEach((r, i) => r.classList.toggle('on', i === this._cursor));
    rows[this._cursor]?.scrollIntoView({ block: 'nearest' });
  },

  async _pick(i) {
    const h = this._rows[i];
    if (!h) return;
    this.close();

    if (h.type === 'place') {
      const p = h.ref;
      const height = ZOOM[p.kind] || 900_000;
      flyTo(p.lon, p.lat, height, 1.6, async () => {
        const { dropPin } = await import('./pin.js');
        dropPin(p.lon, p.lat, h.title);
      });
      return;
    }

    if (h.type === 'layer') {
      /* ⚠️ toggle 이 아니라 켜기다. 검색해서 고른 것이 꺼지면 고장으로 읽힌다. */
      store.setLayer(h.ref.id, true);
      return;
    }

    // 기능·2단 — 메뉴 버튼을 실제로 누른다 (동작을 한 곳에만 둔다)
    const sel = h.type === 'open'
      ? `#menuMain [data-open="${h.ref.open}"]`
      : `#menuMain [data-act="${h.ref.act}"]`;
    const btn = document.querySelector(sel);
    if (!btn) return;
    if (h.type === 'open') {
      /* 2단은 1단이 열려 있어야 보인다 — 손잡이를 먼저 연다 */
      const { layerBar } = await import('./layerbar.js');
      if (!layerBar.open) { layerBar.open = true; layerBar._apply(); }
    }
    btn.click();
  },
};

/** 빈 입력일 때 보여주는 안내 — 무엇을 칠 수 있는지 알려준다 */
function hintBlock(ko) {
  const d = document.createElement('div');
  d.className = 'sr-hint';
  const ex = ko
    ? ['서울', '기온', '태풍', '내 위치', 'ㅅㅇ']
    : ['Seoul', 'Temperature', 'Cyclones', 'My location'];
  d.innerHTML = `<p>${ko
    ? '장소 · 레이어 · 기능을 한 번에 찾습니다'
    : 'Search places, layers and features'}</p>`
    + `<div class="sr-ex">${ex.map(e => `<button type="button">${esc(e)}</button>`).join('')}</div>`
    + `<p class="sr-note">${ko
        ? '초성으로도 찾습니다 · Esc 로 닫기'
        : 'Press Esc to close'}</p>`;
  d.querySelectorAll('.sr-ex button').forEach(b => {
    b.onclick = () => {
      const input = $('#searchInput');
      input.value = b.textContent;
      input.focus();
      search.render(b.textContent);
    };
  });
  return d;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
