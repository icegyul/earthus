// 이벤트 패널 — 교차검증을 통과한 사건 목록 (§5-2, §5-3)
//
// 무엇을 보여주나
//   GDELT 원본을 신뢰도 채점한 결과. 확정과 미확정을 섞지 않고 나눠서 보여준다.
//   각 항목에 "왜 이 등급인가"를 숫자로 밝히고, 원문 링크로 보낸다.
//
// ⚠️ 기사 본문을 그대로 싣지 않는다 (§5-3 저작권).
//    우리가 직접 요약하는 건 **메타데이터**다:
//      "20분 전 Gironde 에서 발생한 사안을 「재난 보도」로 분류했습니다.
//       보도 문서 62건 · 서로 다른 매체 3곳."
//    이건 우리가 센 사실이라 저작권 문제가 없고, 검증 가능하다.
//
// ⚠️ 브리핑 탭은 여기서 한 걸음 더 나간다 — 방침이 바뀐 지점이라 적어둔다.
//    news-brief Lambda 가 Claude 로 **사실을 새 문장으로 다시 써서** 항목마다
//    근거 기사를 붙인 것을 보여준다. 원문 문장을 옮기지 않고, 출처 없는 항목은
//    서버가 버린다. 그래도 이건 "링크만 준다"에서 벗어난 결정이므로,
//    화면에 AI 가 썼다는 사실과 원문 링크를 항상 함께 둔다.
//    자세한 안전선은 aws/news-brief/handler.py 머리말에 있다.
//
// ⚠️ 분류를 단정하지 않는다.
//    CAMEO 는 "기사 문장의 꼴"을 코딩하는 체계다. 실제로 산불 기사의
//    "firefighters battle the blaze" 가 무력 충돌로 코딩돼 있었다.
//    그래서 화면에 "자동 분류"라고 쓰고, 재분류된 것은 그 사실도 밝힌다.

import { i18n } from './i18n.js';
import { flyTo } from './viewer.js';
import { store } from './store.js';
import { events } from './layers/events.js';
import { translator, detectLang } from './translate.js';
import { briefs } from './brief.js';
import { API } from './config.js';
/* ⚠️ 경고(지진·분화·쓰나미·산불)를 커뮤니티에서 여기로 옮겼다.
   커뮤니티는 사람이 쓰는 곳이고, 경고는 기관이 낸 사실이다. 성격이 다른 둘을
   한 메뉴에 두면 "어디를 봐야 지금 위험한지 아나"가 흐려진다. */
import { warnings } from './community.js';
import { briefCard, briefNotice } from './ui-brief.js';

const $ = s => document.querySelector(s);
/* 지역 뉴스 — 아프리카·중동·남미·동남아·오세아니아 매체가 직접 낸 헤드라인.
   ⚠️ **제목과 링크만** 담긴 자료다. 본문도 요약도 없다 (저작권 원칙).
      화면에서도 제목만 보여주고 읽으려면 원문으로 보낸다. */
const regionalNews = {
  data: null,
  fetchedAt: 0,
  pending: null,
  async load(force = false) {
    if (!force && this.data && Date.now() - this.fetchedAt < 300000) return this.data;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const r = await fetch(`${API.EVENTS}/regional-news.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('regional-news ' + r.status);
      this.data = await r.json();
      this.fetchedAt = Date.now();
      return this.data;
    })();
    try { return await this.pending; } finally { this.pending = null; }
  },
};

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 경고 종류별 색 — 쓰나미가 가장 강하다 */
const WARN_COLOR = {
  tsunami: '#ff3b30', quake: '#ff5d5d', volcano: '#ff8a65', wildfire: '#ff9a3c',
};

const KIND_COLOR = {
  DIS: '#ff8a3c', '14': '#ffd166', '13': '#ffb84d', '15': '#ff9f45',
  '17': '#ff9f45', '18': '#ff7a5d', '19': '#ff5d5d', '20': '#e03131',
};

/** 도메인만 뽑는다 — 어느 매체인지 보여주되 우리가 순위를 매기지 않는다 */
function host(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}

function ago(min, ko) {
  if (min < 60) return ko ? `${min}분 전` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return ko ? `${h}시간 전` : `${h}h ago`;
  return ko ? `${Math.round(h / 24)}일 전` : `${Math.round(h / 24)}d ago`;
}

/** 실제로 서로 다른 매체가 몇 곳인가 — 도메인 기준.
    ⚠️ 이게 진짜 교차검증 수치다. GDELT 의 NumSources 는 "문서 수"라
       같은 기사가 지역지 수십 곳에 신디케이트되면 그만큼 부풀려진다.
       실제로 "82개 매체"라고 표시됐는데 링크가 전부 thewestonmercury.co.uk
       하나였다 — Newsquest 계열 지역지들이 같은 통신사 기사를 재게재한 것이다.
       교차검증을 보여주는 화면에서 이걸 "82곳이 확인했다"로 쓰면 거짓 신호다. */
function distinctHosts(e) {
  const urls = [e.url, ...(e.alt || [])].filter(Boolean);
  return [...new Set(urls.map(host))];
}

/** 메타데이터 요약 — 기사 내용이 아니라 "언제 어디를 몇 건이 보도했나".
    ⚠️ "N개 매체"라고 쓰지 않는다. GDELT 가 주는 값은 문서 수다.
       우리가 실제로 확인할 수 있는 매체 수는 링크의 도메인 수뿐이다. */
function summarize(e, ko) {
  const kind = ko ? e.kindKo : e.kindEn;
  const when = ago(e.ageMin, ko);
  const where = e.place || (ko ? '위치 미상' : 'unknown location');
  const n = distinctHosts(e).length;
  if (ko) {
    return `${when} ${where}에서 발생한 사안을 「${kind}」으로 분류했습니다. `
      + `보도 문서 ${e.sources.toLocaleString()}건 · 언급 ${e.mentions.toLocaleString()}회`
      + (e.merged > 1 ? ` · 같은 사건으로 판단해 ${e.merged}건을 합쳤습니다` : '')
      + `. 링크 기준 서로 다른 매체 ${n}곳입니다.`;
  }
  return `Classified as ${kind} at ${where} ${when}. `
    + `${e.sources.toLocaleString()} source documents, ${e.mentions.toLocaleString()} mentions`
    + (e.merged > 1 ? `, ${e.merged} reports merged as one event` : '')
    + `. We can verify ${n} distinct outlet(s) from our links.`;
}

export const eventPanel = {
  /* ⚠️ 첫 화면을 '브리핑'으로 둔다. 사용자가 이 메뉴를 여는 이유는
        점수표가 아니라 "지금 무슨 일이 났나"다. 브리핑이 없으면 확정 목록으로 떨어진다. */
  show: 'brief',            // 'brief' | 'warn' | 'confirmed' | 'all'
  /* 어느 문으로 들어왔나. ⚠️ 같은 패널이 두 가지 일을 한다 —
     'alert' = 지금 일어난 일(경고·확정·미확정) · 'news' = 읽을 거리(브리핑·지역뉴스)
     받은 요청: "이벤트 삭제하고 지진과 쓰나미 등 정보는 alert 메뉴로,
                뉴스탭만 남으니 뉴스를 다루게" */
  mode: 'alert',
  _warn: null,

  init() {
    if (this._inited) return this;
    this._inited = true;
    i18n.onChange(() => { if ($('#eventSheet')?.classList.contains('up')) this.render(); });
    return this;
  },

  async open() {
    // v1 정리: 부팅 때 init 하지 않는다. Alert 의 '지금 일어난 일'이 먼저 열어도 스스로 준비한다.
    this.init();
    $('#eventSheet').classList.add('up');
    this.render();
    // ⚠️ 둘을 함께 받는다. 브리핑을 이벤트 뒤에 순차로 받으면 열고 나서 두 번 깜빡인다.
    const jobs = [];
    if (this.mode !== 'news' && this._warn == null) {
      jobs.push(warnings().then(w => { this._warn = w; })
        .catch(e => { console.warn('[warn]', e.message); this._warnError = true; }));
    }
    if (!events.list.length) jobs.push(events.refresh().catch(e => console.warn('[events]', e.message)));
    if (!briefs.loaded) jobs.push(briefs.load());
    if (jobs.length) {
      await Promise.all(jobs);
      if ($('#eventSheet').classList.contains('up')) this.render();
    }
  },
  close() { $('#eventSheet').classList.remove('up'); },

  render() {
    this._renderId = (this._renderId || 0) + 1;
    const ko = i18n.lang === 'ko';
    const body = $('#eventBody');
    if (!body) return;
    body.innerHTML = '';
    $('#eventTitle').textContent = this.mode === 'news' ? (ko ? '뉴스' : 'News') : (ko ? '지금 일어난 일' : "What's happening");

    const list = events.list || [];
    const conf = list.filter(e => e.status === 'confirmed');
    const unconf = list.filter(e => e.status !== 'confirmed');

    // 받은 지적: 뉴스 메뉴가 이벤트 자료 실패 때문에 함께 닫혔다.
    // 지역 뉴스와 공식 경고는 독립 자료다. 이벤트 0건이어도 각 탭은 유지한다.

    /* 채점 결과를 먼저 보여준다 — 몇 건에서 몇 건이 걸러졌는지.
       이 숫자가 이 레이어의 존재 이유다. */
    const m = events.meta || {};
    const c = m.counts || {};
    /* ⚠️ 교차검증 깔때기(원본→중복제거→확정)는 **이벤트 쪽 이야기**다.
       뉴스 문으로 들어온 사람에게는 뜻 없는 숫자다. 받은 지적으로 갈랐다. */
    if (this.mode !== 'news') body.appendChild(el('div', 'ev-funnel',
      `<div class="ef-head">${ko ? '교차검증 결과' : 'Cross-verification'}</div>`
      + `<div class="ef-row">`
      + `<span><b>${(c.raw || 0).toLocaleString()}</b>${ko ? '원본' : 'raw'}</span>`
      + `<i>→</i><span><b>${(c.afterDedup || 0).toLocaleString()}</b>${ko ? '중복제거' : 'deduped'}</span>`
      + `<i>→</i><span class="ok"><b>${conf.length}</b>${ko ? '확정' : 'confirmed'}</span>`
      + `</div>`
      + `<div class="ef-note">${ko
          ? `최근 ${m.windowHours || 3}시간 · ${(m.generated || '').slice(11, 16)} UTC 기준`
          : `last ${m.windowHours || 3}h · as of ${(m.generated || '').slice(11, 16)} UTC`}</div>`));

    // 탭 — 브리핑이 하나도 없으면 그 탭을 만들지 않는다 (빈 탭은 고장으로 보인다)
    const hasBrief = briefs.list.length > 0;
    if (!hasBrief && this.show === 'brief') this.show = 'confirmed';

    /* ⚠️ 제목도 문에 따라 바꾼다. 뉴스로 들어왔는데 '이벤트'라고 적혀 있으면
       메뉴를 잘못 누른 줄 안다. DOM 은 하나를 돌려 쓴다. */
    const h3 = document.querySelector('#eventTitle');
    if (h3) h3.textContent = this.mode === 'news'
      ? (ko ? '뉴스' : 'News') : (ko ? '지금 일어난 일' : "What's happening");

    const tabs = el('div', 'comm-tabs');
    const defs = [];
    /* ⚠️ 경고를 맨 앞에 둔다. 급한 순서가 곧 탭 순서다.
       건수가 0 이어도 탭을 없애지 않는다 — "경고 0"은 그 자체로 알아야 할 정보다.
       (브리핑은 없으면 탭을 없앤다. 그건 우리가 못 만든 것이지 사실이 아니다.) */
    const isNews = this.mode === 'news';
    if (!isNews) {
      defs.push(['warn', ko ? `경고 ${this._warn ? this._warn.length : '…'}`
                            : `Warnings ${this._warn ? this._warn.length : '…'}`]);
      defs.push(['confirmed', ko ? `확정 ${conf.length}` : `Confirmed ${conf.length}`]);
      defs.push(['all', ko ? `미확정 포함 ${list.length}` : `All ${list.length}`]);
    }
    // 브리핑은 뉴스 쪽 글이다
    if (hasBrief && isNews) defs.push(['brief', ko ? `브리핑 ${briefs.list.length}` : `Briefs ${briefs.list.length}`]);
    /* 지역 뉴스 — GDELT 가 상대적으로 덜 잡는 지역 매체를 따로 본다.
       ⚠️ 건수를 아직 모를 때는 '…' 로 둔다. 0 으로 적으면 "없다"로 읽힌다. */
    if (isNews) {
      /* ⚠️ 뉴스 문에서는 그냥 '뉴스'다 (받은 지적). 패널 제목이 이미 '뉴스'이고
         탭이 하나뿐인데 '지역 뉴스'라고 적으면 무엇과 구분하는 말인지 알 수 없다.
         '지역 매체'라는 사실은 아래 헤드라인 묶음이 그대로 말해 준다. */
      defs.push(['local', ko ? `뉴스 ${this._news ? this._news.count : '…'}`
                             : `News ${this._news ? this._news.count : '…'}`]);
    }
    /* ⚠️ 지금 고른 탭이 이 문에 없는 탭이면 첫 탭으로 되돌린다.
       안 그러면 **탭은 하나도 안 켜지고 본문만 엉뚱한 것**이 나온다
       (show 가 남는 값이라 예전에 뉴스/이벤트가 같아 보였던 것과 같은 뿌리다). */
    if (!defs.some(([k]) => k === this.show)) this.show = defs[0][0];
    defs.forEach(([k, label]) => {
      const b = el('button', 'comm-tab' + (this.show === k ? ' on' : ''), label);
      b.dataset.tab = k;          // ⚠️ 나중에 라벨을 고칠 때 글자로 찾지 않기 위해
      b.onclick = () => { this.show = k; this.render(); };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    /* 지도에 뉴스 점을 켜고 끄는 스위치 — 받은 요청: "뉴스 버튼도 만들어줘 껏다 켰다".
       ⚠️ 목록만 보고 지도는 안 켜고 싶을 때가 있고, 반대도 있다.
          레이어 칩까지 찾아가지 않아도 여기서 바로 되게 둔다.
       ⚠️ 상태를 store 에서 **매번 읽는다.** 여기 따로 기억해 두면
          다른 곳에서 끈 뒤 이 버튼만 켜진 채로 남는다. */
    if (this.mode === 'news') {
      const on = store.isOn('news');
      const sw = el('button', 'ev-maptoggle' + (on ? ' on' : ''),
        `<i></i>${ko ? (on ? '지도에 뉴스 켜짐' : '지도에 뉴스 꺼짐')
                     : (on ? 'News on map: on' : 'News on map: off')}`);
      sw.onclick = () => { store.setLayer('news', !store.isOn('news')); this.render(); };
      body.appendChild(sw);
    }

    if (this.show === 'warn') { this.renderWarnings(body, ko); return; }
    if (this.show === 'brief') { this.renderBriefs(body, ko); return; }
    if (this.show === 'local') { this.renderLocalNews(body, ko); return; }

    const rows = this.show === 'confirmed' ? conf : [...conf, ...unconf];
    if (!rows.length) {
      body.appendChild(el('p', 'sky-dim', ko
        ? '확정 기준 충족 사건 0건'
        : '0 events meet the confirmed threshold'));
    }

    rows.forEach(e => body.appendChild(this.card(e, ko)));

    body.appendChild(el('p', 'sky-note', ko
      ? '분류 · GDELT CAMEO 자동 코딩 · 산불 문장의 무력 충돌 오분류 보정 · 표시 범위 제목·원문 링크'
      : 'Classification · GDELT CAMEO automatic coding · armed-conflict correction for wildfire wording · display: headline and source link'));
  },

  /* ── 브리핑 목록 ────────────────────────────────────────────
     ⚠️ 브리핑은 확정 이벤트 중 일부만 있다 (회당 최대 4건).
        "왜 이것만 있나"를 밝혀야 빠진 것을 고장으로 오해하지 않는다. */
  /* ── 지역 뉴스 ──────────────────────────────────────────────
     ⚠️ **제목과 링크만** 보여준다. 본문 발췌·요약을 넣지 않는다.
        수집기(regional-news)가 애초에 본문을 저장하지 않으므로 화면에서도 나올 수 없다.
     ⚠️ 제목은 매체가 쓴 **원어 그대로**다 (포르투갈어·인도네시아어 등).
        번역해서 보여주면 "매체가 이렇게 썼다"가 아니라 "우리가 이렇게 옮겼다"가 된다. */
  async renderLocalNews(body, ko) {
    const requestId = this._renderId;
    const loading = el('p', 'sky-dim', ko ? '지역 뉴스 불러오는 중…' : 'Loading regional news…');
    body.appendChild(loading);
    let j;
    try {
      j = await regionalNews.load();
    } catch (e) {
      if (requestId !== this._renderId || this.show !== 'local') return;
      loading.textContent = ko ? '지역 뉴스를 받지 못했습니다.' : 'Regional news is unavailable.';
      const retry = el('button', 'comm-tab', ko ? '다시 불러오기' : 'Retry');
      retry.onclick = () => { regionalNews.fetchedAt = 0; this.render(); };
      body.appendChild(retry);
      if (regionalNews.data) {
        body.appendChild(el('p', 'sky-note', ko ? '이전에 받은 뉴스가 있습니다.' : 'Previously loaded headlines are available.'));
        j = regionalNews.data;
      } else return;
    }
    if (this.show !== 'local' || requestId !== this._renderId) return; // 그 사이 탭 또는 요청이 바뀌었다
    /* ⚠️ 건수를 처음 알게 된 순간 **탭 라벨을 다시 그려야** 한다.
       안 그리면 '지역 뉴스 …' 가 그대로 남아 영원히 로딩 중처럼 보인다.
       ⚠️ 단, render() 를 다시 부르면 무한 재귀가 된다 — 라벨만 고쳐 넣는다. */
    const first = this._news == null;
    this._news = { count: j.count };
    /* ⚠️⚠️ 예전에는 탭을 **글자로** 찾았다(`/지역 뉴스|Local news/`). 그런데 탭 이름이
       '뉴스'로 바뀌면서 아무것도 못 찾게 됐고, 라벨이 영원히 `뉴스 …` 로 남아
       **다 불러온 뒤에도 로딩 중처럼** 보였다. (감사 P1-9)
       → 화면 글자가 아니라 data-tab 키로 찾는다. 이름을 또 바꿔도 안 깨진다.
       ⚠️ first 조건도 뺀다 — 갱신될 때마다 건수를 맞춰야 한다. */
    const tab = document.querySelector('.comm-tab[data-tab="local"]');
    if (tab) tab.textContent = ko ? `뉴스 ${j.count}` : `News ${j.count}`;
    loading.remove();
    body.appendChild(el('p', 'sky-note', `${ko ? '자료 수집' : 'Collected'} · ${esc(j.generated || j.updated || '시각 미제공')} · ${ko ? '제목을 눌러 원문 보기' : 'Open a headline to read the source'}`));
    if (!(j.items || []).length) body.appendChild(el('p', 'sky-dim', ko ? '이번 자료에 표시할 뉴스가 없습니다.' : 'No headlines in this collection.'));

    const byRegion = j.byRegion || {};
    body.appendChild(el('div', 'ev-funnel',
      `<div class="ef-head">${ko ? '지역 매체 헤드라인' : 'Regional headlines'}</div>`
      + `<div class="ef-row">`
      + Object.entries(byRegion).map(([r, n]) => `<span><b>${n}</b>${esc(r)}</span>`).join('<i>·</i>')
      + `</div>`
      + `<div class="ef-note">${ko
          ? 'GDELT 가 상대적으로 덜 잡는 지역 매체를 직접 받습니다.'
          : 'Fed directly from outlets that GDELT covers less densely.'}</div>`));

    // 지역별로 묶어 보여준다 — 섞어 놓으면 "왜 이 지역만"이 안 보인다
    const groups = {};
    (j.items || []).forEach(it => { (groups[it.region] = groups[it.region] || []).push(it); });

    Object.entries(groups).forEach(([region, items]) => {
      body.appendChild(el('h4', 'ev-grp', esc(region)));
      items.slice(0, 8).forEach(it => {
        const card = el('a', 'ev-news');
        card.href = it.link;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.innerHTML = `<span class="en-title">${esc(it.title)}</span>`
          + `<span class="en-meta">${esc(it.source)}`
          + (it.lang && it.lang !== 'en' ? ` · ${esc(it.lang)}` : '')
          + (it.utc ? ` · ${esc(String(it.utc).slice(5, 16).replace('T', ' '))} UTC` : '')
          + `</span>`;
        body.appendChild(card);
      });
    });

    /* ⚠️ 어느 매체가 안 들어왔는지 밝힌다. 조용히 빠지면
       "그 지역은 뉴스가 없나 보다"로 읽힌다. */
    const failed = Object.keys(j.failed || {});
    if (failed.length) {
      body.appendChild(el('p', 'sky-note', ko
        ? ` 이번 수집에서 ${failed.join('·')} 는 받지 못했습니다.`
        : ` ${failed.join(', ')} did not respond in this collection.`));
    }
    body.appendChild(el('p', 'sky-note', ko
      ? '표시 범위 · 매체 원문 제목 · 원문 링크 · 제목을 눌러 기사 보기'
      : 'Display · publisher headline · source link · tap the headline to read'));
  },

  /* ── 경고 — 지금 위험한 것만 ────────────────────────────────
     ⚠️ 여기 있는 것은 전부 기관 발표다. 우리가 등급을 다시 매기지 않는다.
        "우리 판단"이 섞이는 순간 사람들이 무엇을 믿어야 할지 알 수 없게 된다. */
  renderWarnings(body, ko) {
    if (this._warnError && this._warn == null) {
      body.appendChild(el('p', 'sky-dim', ko ? '공식 경고 자료를 받지 못했습니다.' : 'Official warning data is unavailable.'));
      const retry = el('button', 'comm-tab', ko ? '다시 불러오기' : 'Retry');
      retry.onclick = () => { this._warnError = false; this.open(); };
      body.appendChild(retry);
      return;
    }
    if (this._warn == null) {
      body.appendChild(el('p', 'sky-dim', ko ? '불러오는 중…' : 'Loading…'));
      return;
    }
    if (!this._warn.length) {
      body.appendChild(el('div', 'warn-clear', ko
        ? '✓ 지금 진행 중인 경고가 없습니다.'
        : '✓ No active warnings right now.'));
      body.appendChild(el('p', 'sky-note', ko
        ? '대상 · 규모 4.5 이상 지진 · 쓰나미 경보 · 대형 산불 · 현재 0건'
        : 'Scope · M4.5+ earthquakes · tsunami alerts · large wildfires · current count 0'));
      return;
    }

    this._warn.forEach(it => {
      const card = el('button', 'fd-card' + (it.severity >= 3 ? ' urgent' : ''));
      const col = WARN_COLOR[it.kind] || '#9fb4c4';
      card.innerHTML =
        `<div class="fd-top">
           <span class="fd-badge" style="color:${col};border-color:${col}66">${esc(it.badge)}</span>
           <span class="fd-time">${esc(it.meta)}</span>
         </div>
         <div class="fd-title">${esc(it.title)}</div>
         <div class="fd-sub">${esc(it.sub)}</div>`;
      card.onclick = () => {
        $('#eventSheet').classList.remove('up');
        if (it.lat != null && it.lon != null) flyTo(it.lon, it.lat, 2_400_000);
        if (it.select) store.select(it.select);
      };
      body.appendChild(card);
    });

    body.appendChild(el('p', 'sky-note', ko
      ? '지진은 USGS(일본 근해는 기상청 대조), 쓰나미는 PTWC·NTWC·NWS, 산불은 NASA FIRMS 위성 관측입니다. 화산은 실시간 기관 피드가 없으므로 이 경고 목록에 넣지 않습니다.'
      : 'Quakes come from USGS (JMA cross-check near Japan), tsunami alerts from PTWC/NTWC/NWS, and wildfires from NASA FIRMS. Volcanoes are excluded because no live agency feed is connected.'));
  },

  renderBriefs(body, ko) {
    const note = briefNotice(briefs.meta);
    if (note) body.appendChild(note);

    briefs.list.forEach(b => body.appendChild(briefCard(b, {
      onGo: () => {
        this.close();
        flyTo(b.lon, b.lat, 1_500_000);
        // 지구 위에서도 같은 브리핑을 볼 수 있게 이벤트를 선택 상태로 만든다
        const ev = (events.list || []).find(e => String(e.id) === String(b.id));
        store.select({ id: `ev-${b.id}`, kind: 'newsevent',
                       name: ko ? b.kindKo : b.kindEn,
                       lat: b.lat, lon: b.lon, _ev: ev || null, _brief: b });
      },
    })));

    const m = briefs.meta;
    const c = m.counts || {};
    body.appendChild(el('p', 'sky-note', ko
      ? `확정 이벤트 중 관심도가 높은 건부터 정리합니다 (이번 회차 신규 ${c.new ?? 0}건, 유지 ${c.kept ?? 0}건). `
        + `모든 이벤트에 브리핑이 있는 건 아닙니다 — 없는 것은 「확정」 탭에서 원문 링크로 보실 수 있습니다. `
        + `${m.ttlHours || 36}시간이 지난 브리핑은 내려갑니다.`
      : `Briefs are written for the highest-interest confirmed events first (${c.new ?? 0} new this run, ${c.kept ?? 0} kept). `
        + `Not every event has one — those without are in the Confirmed tab with links to original reporting. `
        + `Briefs are removed after ${m.ttlHours || 36} hours.`));
  },

  card(e, ko) {
    const confirmed = e.status === 'confirmed';
    const col = KIND_COLOR[e.root] || '#9fb4c4';
    const card = el('div', 'ev-card' + (confirmed ? '' : ' dim'));

    /* ⚠️ 제목이 주인공이다.
       분류(「재난 보도」)와 위치만 보여주던 때는 "무슨 일이 났는지" 알 수 없었다.
       GKG 에서 받은 실제 기사 제목을 크게 얹는다 — 이게 사용자가 찾던 정보다. */
    card.innerHTML = `
      <div class="ev-top">
        <span class="ev-kind" style="color:${col};border-color:${col}55">${esc(ko ? e.kindKo : e.kindEn)}</span>
        <span class="ev-status${confirmed ? ' ok' : ''}">${confirmed
          ? (ko ? '확정' : 'Confirmed') : (ko ? '미확정' : 'Unconfirmed')}</span>
        <span class="ev-score">${e.score}<em>/100</em></span>
      </div>
      ${e.title ? `<div class="ev-headline">${esc(e.title)}</div>` : ''}
      <div class="ev-place">${esc(e.place || (ko ? '위치 미상' : 'Unknown'))}</div>
      <div class="ev-summary">${esc(summarize(e, ko))}</div>`;

    /* 제목을 읽는 사람 언어로 자동 번역해 제자리에 넣는다.
       ⚠️ 버튼을 눌러야 번역되던 방식을 버렸다. 목록을 훑을 때 매 항목마다
          버튼을 누르게 하면 "무슨 일이 났는지"를 훑을 수가 없다.
       ⚠️ 원문은 지우지 않고 제목 아래 작게 남긴다. 기계 번역은 고유명사에서 틀린다 —
          "Tisha B'Av"(유대 금식일)를 "티샤 브아브 관찰"로 옮긴 걸 실제로 확인했다. */
    if (e.title && detectLang(e.title) !== i18n.lang) {
      const h = card.querySelector('.ev-headline');
      translator.to(e.title, i18n.lang).then(out => {
        if (!out || !h?.isConnected) return;      // 실패하면 원문을 그대로 둔다
        h.textContent = out.text;
        const orig = el('div', 'ev-orig');
        orig.innerHTML = `<span class="to-tag">${ko ? '원문' : 'original'}</span>${esc(e.title)}`;
        h.insertAdjacentElement('afterend', orig);
      });
    }

    /* 원문 링크 — 도메인 기준으로 중복을 없앤다.
       ⚠️ 같은 매체 링크 4개를 나란히 보여주면 "4곳이 확인했다"로 읽힌다.
          실제로는 한 곳이다. 교차검증을 보여주는 화면에서 그건 거짓 신호다. */
    const all = [e.url, ...(e.alt || [])].filter(Boolean);
    const byHost = new Map();
    all.forEach(u => { const h = host(u); if (!byHost.has(h)) byHost.set(h, u); });
    const urls = [...byHost.entries()].slice(0, 5);

    if (urls.length) {
      const box = el('div', 'ev-links');
      box.appendChild(el('div', 'ev-links-h', ko
        ? `서로 다른 매체 ${byHost.size}곳`
        : `${byHost.size} distinct outlet(s)`));
      urls.forEach(([h, u]) => {
        const a = el('a', 'ev-link', `${esc(h)} <em>↗</em>`);
        a.href = u; a.target = '_blank'; a.rel = 'noopener';
        box.appendChild(a);
      });
      /* 한 곳뿐인데 문서 수가 많으면 신디케이트다. 그걸 말해준다. */
      if (byHost.size === 1 && e.sources >= 10) {
        box.appendChild(el('div', 'ev-syndicate', ko
          ? `보도 문서 ${e.sources.toLocaleString()}건 · 링크 매체 1곳 · 동일 기사 재게재 가능성`
          : `${e.sources.toLocaleString()} documents · 1 linked outlet · possible syndication`));
      }
      card.appendChild(box);
    }

    const go = el('button', 'ev-go', ko ? '지도에서 보기' : 'Show on globe');
    go.onclick = () => {
      this.close();
      flyTo(e.lon, e.lat, 1_800_000);
      store.select({ id: `ev-${e.id}`, kind: 'newsevent',
                     name: ko ? e.kindKo : e.kindEn, lat: e.lat, lon: e.lon, _ev: e });
    };
    card.appendChild(go);
    return card;
  },
};
