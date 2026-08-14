// 커뮤니티 패널 — 경고 / 개발 요청
//
// 두 탭이 성격이 다르다.
//   개발 요청 — 사용자가 쓰고, 서로 공감을 누른다. 내가 무엇을 만들지의 근거가 된다.
//
// ⚠️ 경고(지진·분화·쓰나미·산불)는 「이벤트」 메뉴로 옮겼다.
//    기관이 낸 사실과 사람이 쓴 글은 성격이 다르다. 한 메뉴에 섞으면
//    "지금 위험한 게 뭔가"를 보러 온 사람이 글 목록을 뒤지게 된다.
//    발사는 위성 탭, 검증된 뉴스는 이벤트 메뉴에 있다.
//
// 번역
//   글은 원문 그대로 두고, 다른 언어 사용자를 위해 번역을 접힌 채로 붙인다.
//   ⚠️ 번역이 원문을 대체하지 않는다. 기계 번역이라고 반드시 표시한다.

import { i18n } from './i18n.js';
import { toast } from './ui.js';
import { flyTo } from './viewer.js';
import { store } from './store.js';
import { auth } from './auth.js';
import { requests, STATUS } from './community.js';
/* 땅의 움직임 탭이 쓴다 */
import { API } from './config.js';
import { fetchT } from './net.js';
import { translator, detectLang } from './translate.js';

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 커뮤니티의 탭.
   ⚠️ 경고(지진·분화·쓰나미·산불)는 「이벤트」 메뉴로 옮겼다.
      기관이 낸 사실과 사람이 쓴 글은 성격이 다르고, 한 곳에 섞으면
      "지금 위험한 게 뭔지" 보러 온 사람이 글 목록을 뒤지게 된다. */
const TABS = ko => [
  ['today', ko ? '오늘의 지구' : 'Earth today'],
  ['reports', ko ? '분석 보고서' : 'Reports'],
  ['charts', ko ? '자료' : 'Charts'],
  ['crust', ko ? '땅의 움직임' : 'Ground motion'],
  ['req', ko ? '개발 요청' : 'Requests'],
];

export const communityPanel = {
  tab: 'today',
  _today: null,
  _reqs: undefined,      // undefined=아직 안 불러옴, null=백엔드 없음, []=비어 있음

  init() {
    i18n.onChange(() => { if ($('#commSheet')?.classList.contains('up')) this.render(); });
    return this;
  },

  async open(tab) {
    if (tab) this.tab = tab;
    $('#commSheet').classList.add('up');
    this.render();
    await this.load();
    if ($('#commSheet').classList.contains('up')) this.render();
  },
  close() { $('#commSheet').classList.remove('up'); },

  async load() {
    if (this.tab === 'today') {
      if (!this._today) {
        const { today } = await import('./today.js');
        const [picks, counts] = await Promise.all([today.build(), today.counts()]);
        this._today = { picks, counts };
      }
    } else if (this.tab === 'charts') {
      const { chartsPanel } = await import('./ui-charts.js');
      await chartsPanel.load();
    } else if (this.tab === 'reports') {
      const { labReportsPanel } = await import('./ui-lab-reports.js');
      await labReportsPanel.load();
    } else if (this._reqs === undefined) {
      this._reqs = await requests.list();
    }
  },

  render() {
    const ko = i18n.lang === 'ko';
    // 표시명은 LAB. 내부 id(commSheet·community)는 그대로 둔다 — 이름만 바뀐 것이다.
    $('#commTitle').textContent = 'LAB';
    const body = $('#commBody');
    if (!body) return;
    body.innerHTML = '';

    // 탭
    const tabs = el('div', 'comm-tabs');
    TABS(ko).forEach(([k, label]) => {
      const b = el('button', 'comm-tab' + (this.tab === k ? ' on' : ''), label);
      b.onclick = async () => { this.tab = k; this.render(); await this.load(); this.render(); };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    if (this.tab === 'crust') this.renderCrust(body, ko);
    else if (this.tab === 'today') this.renderToday(body, ko);
    else if (this.tab === 'reports') this.renderReports(body, ko);
    else if (this.tab === 'charts') this.renderCharts(body, ko);
    else this.renderRequests(body, ko);
  },


  /* ── 땅의 움직임 ────────────────────────────────────────────
     ⚠️⚠️ 이 앱에서 **유일하게 하늘이 아닌 자료**다. 그리고 가장 순수하게 "잰 값"이다 —
        관측점의 좌표가 해마다 얼마나 달라졌는지, 그뿐이다. 모델도 예보도 아니다.
     ⚠️ 그래서 못 하는 것을 화면에 먼저 적는다. 안 그러면 "지진 감지"로 읽힌다. */
  _crust: null,
  async loadCrust() {
    if (this._crust) return this._crust;
    try {
      const r = await fetchT(`${API.EVENTS}/crustal.json`, { cache: 'no-cache' });
      this._crust = r.ok ? await r.json() : null;
    } catch (_) { this._crust = null; }
    return this._crust;
  },

  renderCrust(body, ko) {
    const d = this._crust;
    if (!d) {
      body.appendChild(el('p', 'comm-load', ko ? '받는 중…' : 'Loading…'));
      this.loadCrust().then(() => this.render());
      return;
    }
    const near = (a) => a == null ? '—' : a.toFixed(0);
    const compass = deg => {
      const N = ko ? ['북','북동','동','남동','남','남서','서','북서']
                   : ['N','NE','E','SE','S','SW','W','NW'];
      return N[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
    };
    const k = d.korea, j = d.japan;

    body.appendChild(el('p', 'cr-lead', ko
      ? '<b>땅이 실제로 얼마나 움직였는지</b>입니다. 계산한 값이 아니라 '
        + 'GNSS 상시관측점의 좌표가 해마다 달라진 거리입니다.'
      : '<b>Measured</b> motion of continuous GNSS stations — not a model.'));

    const grid = el('div', 'cr-grid');
    [[ko ? '한국' : 'Korea', k], [ko ? '일본' : 'Japan', j]].forEach(([nm, v]) => {
      const c = el('div', 'cr-stat');
      c.innerHTML = `<div class="n">${near(v.medianSpeed)}<small>mm/${ko ? '년' : 'yr'}</small></div>`
        + `<div class="k">${nm} · ${compass(v.medianDir)}${ko ? '쪽' : ''} · `
        + `${v.n}${ko ? '지점' : ' sites'}</div>`;
      grid.appendChild(c);
    });
    body.appendChild(grid);

    /* ⚠️⚠️ 이 문단을 지우면 안 된다. 숫자만 보면 "땅이 갈라지고 있다"로 읽힌다. */
    body.appendChild(el('p', 'cr-note', ko
      ? ' 이 움직임의 대부분은 <b>판 전체가 함께 가는 것</b>입니다. 한반도가 연 3cm '
        + '동남동으로 가는 것은 유라시아판이 그렇게 가기 때문이지, 땅이 찢어지고 '
        + '있어서가 아닙니다. 우리도 그 위에 얹혀 같이 갑니다.'
      : ' Most of this is whole-plate drift, not local deformation.'));

    /* 큰 지진이 실제로 땅을 얼마나 옮겼는지 — 우리가 직접 재 본 값 */
    const ex = el('div', 'cr-case');
    ex.innerHTML = (ko
      ? '<b>2011년 동일본대지진(M9.0) 때</b><br>'
        + '<span>진앙 130km 지점 <b>3.42m</b> 이동 · 200km 지점 1.97m · '
        + '<b>대전 2.3cm</b> — 한반도가 통째로 동쪽으로 끌려갔습니다.</span>'
      : '<b>2011 Tōhoku (M9.0)</b><br><span>3.42 m at 130 km · 1.97 m at 200 km · '
        + '2.3 cm in Daejeon — the whole peninsula shifted east.</span>');
    body.appendChild(ex);

    /* ⚠️⚠️ 못 하는 것 — 크게, 먼저 */
    body.appendChild(el('div', 'cr-cant', ko
      ? '<b>자료 범위</b><br>· 최종 좌표 약 <b>한 달 지연</b><br>· 중소 지진 변위는 일일 관측 잡음 범위<br>· 분석 단위 · 월간 GNSS 위치 변화'
      : '<b>Data scope</b><br>· Final positions lag about <b>one month</b><br>· Smaller-quake displacement sits within daily noise<br>· Analysis unit · monthly GNSS position change'));

    body.appendChild(el('p', 'cr-src', ko
      ? `자료: 네바다 측지연구소(UNR) MIDAS 속도장 · 관측점 ${d.count.toLocaleString()}곳 · `
        + `${d.cite}`
      : `Source: Nevada Geodetic Laboratory · ${d.count.toLocaleString()} sites · ${d.cite}`));
  },

  /* ── 오늘의 지구 ────────────────────────────────────────────
     ⚠️ 여기 있는 숫자는 전부 우리가 격자에서 직접 찾은 값이다.
        형용사를 붙이지 않는다 — "무시무시한 파도"라고 쓰는 순간 근거가 없어진다.
     ⚠️ 재난을 순위로 소비하게 만들지 않는다. 산불·지진은 "가장 큰"이 아니라
        "지금 몇 건"으로만 적고, 눌러서 사건 자체로 가게 한다. */
  renderToday(body, ko) {
    if (!this._today) {
      body.appendChild(el('p', 'sky-dim', ko ? '불러오는 중…' : 'Loading…'));
      return;
    }
    const { picks, counts } = this._today;

    if (counts?.length) {
      const strip = el('div', 'td-counts');
      counts.forEach(c => {
        strip.appendChild(el('div', 'td-count',
          `<b>${c.n.toLocaleString()}</b><span>${esc(c.label)}</span>`));
      });
      body.appendChild(strip);
    }

    if (!picks?.length) {
      body.appendChild(el('p', 'sky-note', ko
        ? '격자 자료 연결 대기 · 잠시 뒤 다시 열어 주세요.'
        : 'Grid data pending · try again shortly.'));
      return;
    }

    picks.forEach(p => {
      const card = el('button', 'td-card');
      /* 왼쪽에 그 자리의 위성 지형도 한 조각을 붙인다 (NASA GIBS 정적 basemap).
         ⚠️ 글자만 있으면 "여기가 어디인지"가 안 읽힌다 — 지도가 그 일을 한다.
         ⚠️ loading="lazy" 필수. 카드 9장이 한꺼번에 타일을 받으면 시트가 늦게 뜬다.
         ⚠️ 이미지가 실패해도 카드는 그대로 읽혀야 한다 — onerror 로 조용히 숨긴다. */
      const m = p.map;
      const thumb = m
        ? `<span class="td-map">
             <img src="${esc(m.url)}" alt="" loading="lazy" decoding="async"
                  style="width:${m.tile}px;height:${m.tile}px;left:${m.left}px;top:${m.top}px"
                  onerror="this.parentNode.classList.add('td-map-off')">
             <i></i>
           </span>`
        : '';
      card.innerHTML =
        `${thumb}
         <span class="td-body">
           <span class="td-t">${esc(p.title)}</span>
           <span class="td-v">${esc(p.value)}</span>
           <span class="td-p">${esc(p.place)}</span>
           ${p.coord ? `<span class="td-c">${esc(p.coord)}</span>` : ''}
         </span>`;
      card.onclick = async () => {
        this.close();
        if (p.layer && !store.isOn(p.layer)) store.setLayer(p.layer, true);
        /* 날아가서 **도착한 뒤** 핀을 꽂는다.
           ⚠️ 출발과 동시에 꽂으면 화면 밖에서 떨어져 아무도 못 본다. */
        const { dropPin } = await import('./pin.js');
        flyTo(p.lon, p.lat, 2_600_000, 1.5,
              () => dropPin(p.lon, p.lat, `${p.title} ${p.value}`));
      };
      body.appendChild(card);
    });

    const t = (picks[0]?.time || '').replace('T', ' ').replace(':00:00Z', ' UTC');
    body.appendChild(el('p', 'sky-note', ko
      ? `자료 시각 ${t} · 5° 격자(약 550km)에서 찾은 값입니다. 눌러 보면 그 자리로 갑니다.\n 격자 해상도 안에서의 최댓값이라, 더 좁은 곳의 극값은 이보다 클 수 있습니다.`
      : `Data time ${t} · found on a 5° grid (~550 km). Tap to fly there.\n These are extremes at grid resolution; a smaller area may hold a higher value.`));
  },

  /* ── 자료 그래프 ────────────────────────────────────────────
     ⚠️ 그리기는 ui-charts.js 가 한다. 여기서는 붙이기만 한다 —
        커뮤니티 패널이 차트 코드까지 안고 있으면 파일이 걷잡을 수 없이 커진다. */
  renderCharts(body, ko) {
    import('./ui-charts.js')
      .then(({ chartsPanel }) => chartsPanel.render(body, ko))
      .catch(e => {
        body.appendChild(el('p', 'sky-note', ko
          ? `그래프를 불러오지 못했습니다 (${e.message}).`
          : `Could not load charts (${e.message}).`));
      });
  },

  renderReports(body, ko) {
    import('./ui-lab-reports.js')
      .then(({ labReportsPanel }) => labReportsPanel.render(body, ko))
      .catch(e => body.appendChild(el('p', 'sky-note', ko
        ? `보고서를 불러오지 못했습니다 (${e.message}).`
        : `Could not load reports (${e.message}).`)));
  },

  /* ── 개발 요청 ─────────────────────────────────────────────── */
  renderRequests(body, ko) {
    body.appendChild(el('div', 'req-intro',
      `<b>${ko ? '무엇이 불편하신가요?' : 'What should improve?'}</b>
       <p>${ko
        ? '불편한 점과 필요한 기능을 남겨 주세요. <b>공감이 많은 요청부터 검토합니다.</b>'
        : 'Share what feels difficult and what you need. <b>Most-upvoted requests are reviewed first.</b>'}</p>`));

    // 작성 폼
    const form = el('form', 'req-form');
    const ta = el('textarea', 'req-input');
    ta.placeholder = ko
      ? '예: 지진 알림을 진도 기준으로 받고 싶어요'
      : 'e.g. I want quake alerts based on local intensity';
    ta.rows = 3; ta.maxLength = 1000; ta.id = 'reqBody';
    form.appendChild(ta);

    /* 반대 언어 미리보기 — 내가 쓴 글이 상대에게 어떻게 보일지.
       ⚠️ 예전에는 타이핑 700ms 뒤 초안을 MyMemory로 자동 전송했다.
       사용자가 보내기도 전에 제3자에게 글을 넘기는 건 고지와 선택이 없었다.
       이제 버튼을 직접 눌러야만 최대 500바이트가 전송된다. */
    const prev = el('div', 'req-preview'); prev.style.display = 'none';
    form.appendChild(prev);
    const previewBtn = el('button', 'tr-btn req-preview-btn', ko
      ? '기계 번역 미리보기 · MyMemory로 전송'
      : 'Machine translation preview · sends to MyMemory');
    previewBtn.type = 'button'; previewBtn.disabled = true;
    form.appendChild(previewBtn);
    ta.oninput = () => {
      const v = ta.value.trim();
      previewBtn.disabled = v.length < 8;
      prev.style.display = 'none';
    };
    previewBtn.onclick = async () => {
      const v = ta.value.trim();
      if (v.length < 8) return;
      previewBtn.disabled = true;
      previewBtn.textContent = ko ? '번역 중…' : 'Translating…';
      const r = await translator.both(v);
      previewBtn.textContent = ko
        ? '기계 번역 미리보기 · MyMemory로 전송'
        : 'Machine translation preview · sends to MyMemory';
      previewBtn.disabled = false;
      if (!r.translated) { prev.style.display = 'none'; return; }
      prev.style.display = 'block';
      prev.innerHTML = `<span class="tr-tag">${r.to === 'ko' ? '한국어' : 'English'} · ${
        ko ? '기계 번역' : 'machine'}</span>${esc(r.translated)}`;
    };

    const btn = el('button', 'btn-primary', ko ? '요청 보내기' : 'Send request');
    btn.type = 'submit';
    form.appendChild(btn);
    form.onsubmit = e => this.submit(e);
    body.appendChild(form);

    // 목록
    if (this._reqs === undefined) {
      body.appendChild(el('p', 'sky-dim', ko ? '불러오는 중…' : 'Loading…'));
      return;
    }
    if (this._reqs === null) {
      /* ⚠️ 백엔드가 없으면 "요청이 없습니다"가 아니다. 저장할 곳이 없는 것이다.
         빈 목록으로 보이게 하면 아무도 안 쓰는 게시판처럼 오해된다. */
      body.appendChild(el('div', 'tr-warn', ko
        ? '아직 게시판 서버가 연결되지 않아 요청을 저장할 수 없습니다. 연결되면 여기에 목록이 나타납니다.'
        : 'The board backend is not connected yet, so requests cannot be saved. The list will appear once it is.'));
      return;
    }
    if (!this._reqs.length) {
      body.appendChild(el('p', 'sky-dim', ko
        ? '아직 올라온 요청이 없습니다. 첫 번째로 남겨주세요.'
        : 'No requests yet — be the first.'));
      return;
    }

    this._reqs.forEach(r => body.appendChild(this.reqCard(r, ko)));
  },

  reqCard(r, ko) {
    const st = STATUS[r.status] || STATUS.open;
    const card = el('div', 'req-card');
    const voted = requests.hasVoted(r.id);

    card.innerHTML = `
      <div class="rq-top">
        <span class="rq-st" style="color:${st.color};border-color:${st.color}55">${ko ? st.ko : st.en}</span>
        <span class="rq-date">${(r.created_at || '').slice(0, 10)}</span>
      </div>
      <div class="rq-body">${esc(r.body)}</div>`;

    // 다른 언어로 쓰인 글이면 번역을 붙인다
    const mine = detectLang(r.body);
    if (mine !== i18n.lang) {
      const tr = el('div', 'rq-tr');
      tr.innerHTML = `<button class="tr-btn">${ko ? '한국어로 보기' : 'Show in English'}</button>`;
      tr.querySelector('.tr-btn').onclick = async (ev) => {
        const b = ev.target;
        b.disabled = true;
        b.textContent = ko ? '번역 중…' : 'Translating…';
        const out = await translator.to(r.body, i18n.lang);
        if (!out) {
          b.textContent = ko ? '번역할 수 없습니다' : 'Translation unavailable';
          return;
        }
        tr.innerHTML = `<span class="tr-tag">${ko ? '기계 번역' : 'Machine translation'}</span>`
          + `<div class="tr-text">${esc(out.text)}</div>`;
      };
      card.appendChild(tr);
    }

    const foot = el('div', 'rq-foot');
    const vote = el('button', 'rq-vote' + (voted ? ' on' : ''),
      `▲ <b>${r.votes || 0}</b>`);
    vote.onclick = async () => {
      try {
        const res = await requests.vote(r.id);
        if (res.already) { toast(ko ? '이미 공감하셨습니다' : 'Already voted'); return; }
        r.votes = (r.votes || 0) + 1;
        this.render();
      } catch (e) {
        toast(e.message === 'BACKEND_NOT_CONFIGURED'
          ? (ko ? '서버가 아직 연결되지 않았습니다' : 'Backend not connected')
          : (ko ? '실패: ' : 'Failed: ') + e.message);
      }
    };
    foot.appendChild(vote);

    // 신고 — 공개 게시판에 신고 수단이 없으면 안 된다
    const rep = el('button', 'rq-report', ko ? '신고' : 'Report');
    rep.onclick = async () => {
      if (!confirm(ko ? '이 글을 신고할까요?' : 'Report this post?')) return;
      try { await requests.report(r.id); toast(ko ? '신고했습니다' : 'Reported'); }
      catch (e) { toast(ko ? '신고 실패' : 'Report failed'); }
    };
    foot.appendChild(rep);
    card.appendChild(foot);
    return card;
  },

  async submit(ev) {
    ev.preventDefault();
    const ko = i18n.lang === 'ko';
    const ta = $('#reqBody');
    try {
      await requests.submit(ta.value);
      ta.value = '';
      $('.req-preview').style.display = 'none';
      toast(ko ? '보내주셔서 고맙습니다. 확인하겠습니다.' : 'Thank you — I will read it.');
      this._reqs = await requests.list();
      this.render();
    } catch (e) {
      const msg = {
        TOO_SHORT: ko ? '조금 더 자세히 적어주세요' : 'A little more detail, please',
        TOO_LONG: ko ? '1,000자 이내로 적어주세요' : 'Keep it under 1,000 characters',
        BACKEND_NOT_CONFIGURED: ko ? '게시판 서버가 아직 연결되지 않았습니다' : 'Board backend not connected',
      }[e.message];
      toast(msg || (ko ? '실패: ' : 'Failed: ') + e.message);
    }
  },
};
