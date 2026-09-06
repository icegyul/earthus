/* 위성 관제패널 — 진행 중 · 예정 전체 · 지난 발사 기록 · 저장한 발사 (2026-09-06 받은 지시)
 *
 * 받은 말 그대로: "위성 관제패널 메뉴도 넣어줘. 그럼 그 안에서 발사 관련 기록과 과거 기록 모두
 * 확인할 수 있잖아. 거기다 유료회원이 저장해두고 언제든 꺼내 볼 수 있게."
 *
 * ⚠️ 저장은 **이 기기(localStorage)** 에 한다. 계정을 따라 기기 사이를 오가지 않는다 —
 *    그런 동기화는 아직 없으므로 있다고 적지 않는다. 화면에도 "이 기기에 저장됩니다"라고 쓴다.
 * ⚠️ 잠금은 결과를 먼저 보여준 뒤에만 건다(무료 3건까지 저장). 배너로 가로막지 않는다.
 */
import { i18n } from './i18n.js';
import { store } from './store.js';
import { launches } from './layers/space.js';

const LS = 'earthus.launch.saved';
const FREE_LIMIT = 3;

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } };
const save = (a) => { try { localStorage.setItem(LS, JSON.stringify(a.slice(-60))); } catch (e) { /* 저장 불가 */ } };

export const launchOps = {
  el: null,
  tab: 'live',

  open() {
    this._mount();
    /* ⚠️ panels 에는 open(id) 가 없다 — .up 클래스를 붙이면 panels 의 감시자가 배타성을 집행한다. */
    this.el.classList.add('up');
    this.render();
  },

  close() { if (this.el) this.el.classList.remove('up'); },

  _mount() {
    if (this.el) return;
    const box = document.createElement('div');
    box.id = 'launchOpsSheet';
    box.className = 'sheet-panel lo-sheet';
    box.setAttribute('aria-hidden', 'true');
    /* 닫기 점 하나만 — 이 패널도 지도에 남길 상태가 없어 '내리기'가 닫기와 같아진다.
       두 점이 같은 일을 하면 색으로 뜻을 나눈 신호등 규칙이 깨진다. */
    box.innerHTML = `<div class="traffic">
        <button class="tl close" type="button" aria-label="닫기" title="닫기"><span>×</span></button>
      </div>
      <div class="lo-head"></div>
      <div class="lo-tabs"></div>
      <div class="lo-body"></div>`;
    document.body.appendChild(box);
    box.querySelector('.tl.close').onclick = () => this.close();
    this.el = box;
    store.on('tier', () => { if (this.el && this.el.classList.contains('up')) this.render(); });
  },

  async render() {
    const ko = i18n.lang === 'ko';
    const box = this.el;
    box.querySelector('.lo-head').innerHTML =
      `<div class="lo-kind">${ko ? '위성 관제패널' : 'Launch operations'}</div>`
      + `<h3>${ko ? '발사 기록' : 'Launch log'}</h3>`;

    const saved = load();
    const tabs = [
      ['live', ko ? '진행 중' : 'In progress', (launches.live || []).length],
      ['upcoming', ko ? '예정' : 'Upcoming', (launches.upcoming || []).length],
      ['past', ko ? '지난 발사' : 'Past', null],
      ['saved', ko ? '저장' : 'Saved', saved.length],
    ];
    box.querySelector('.lo-tabs').innerHTML = tabs.map(([id, label, n]) =>
      `<button class="lo-tab${this.tab === id ? ' on' : ''}" data-tab="${id}">${label}`
      + `${n != null ? `<i>${n}</i>` : ''}</button>`).join('');
    box.querySelectorAll('.lo-tab').forEach(b => {
      b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    });

    const body = box.querySelector('.lo-body');
    if (this.tab === 'live') return this._list(body, launches.live || [], ko, {
      empty: ko ? '지금 날고 있는 발사가 없습니다. 이륙 60분 전부터 여기에 나타납니다.'
                : 'No launch in flight. Rockets appear here from T-60 minutes.',
    });
    if (this.tab === 'upcoming') return this._list(body, launches.upcoming || [], ko, {
      empty: ko ? '예정된 발사를 아직 받지 못했습니다.' : 'No upcoming launches loaded yet.',
    });
    if (this.tab === 'saved') return this._saved(body, ko, saved);

    /* 지난 발사 — 열 때만 받는다 */
    body.innerHTML = `<p class="lo-empty">${ko ? '지난 발사를 받는 중…' : 'Loading past launches…'}</p>`;
    try {
      const list = await launches.recent();
      this._list(body, list, ko, {
        empty: ko ? '지난 발사 기록을 받지 못했습니다.' : 'Could not load past launches.',
        note: ko ? '최근 20건 · 결과와 실패 사유는 발사 기관 발표를 그대로 옮깁니다.'
                 : 'Last 20 · results and failure reasons are relayed as published.',
      });
    } catch (e) {
      body.innerHTML = `<p class="lo-empty">${ko ? '지난 발사를 받지 못했습니다' : 'Could not load past launches'} (${esc(e.message)})</p>`;
    }
  },

  _list(body, list, ko, opt = {}) {
    if (!list.length) { body.innerHTML = `<p class="lo-empty">${opt.empty || ''}</p>`; return; }
    const saved = new Set(load().map(x => x.id));
    body.innerHTML = list.map(m => {
      const d = m.data || {};
      const h = d._hoursOut;
      const when = h == null ? '—'
        : h < -48 ? new Date(d._net).toLocaleDateString(i18n.lang)
          : h < 0 ? (ko ? `${Math.round(-h)}시간 전` : `${Math.round(-h)}h ago`)
            : h < 1 ? (ko ? `${Math.round(h * 60)}분 뒤` : `in ${Math.round(h * 60)}m`)
              : h < 48 ? (ko ? `${Math.round(h)}시간 뒤` : `in ${Math.round(h)}h`)
                : (ko ? `${Math.round(h / 24)}일 뒤` : `in ${Math.round(h / 24)}d`);
      const st = String(d[i18n.t.F.status] || '');
      const bad = /fail/i.test(st) || d._failReason;
      const good = /success/i.test(st);
      return `<div class="lo-row${bad ? ' bad' : good ? ' good' : ''}">
        <button class="lo-open" data-id="${esc(m.id)}">
          <b>${esc(m.name)}</b>
          <span>${esc(d._mission || d[i18n.t.F.pad] || '')}${d._orbitAbbrev ? ` · ${esc(d._orbitAbbrev)}` : ''}</span>
          <em>${esc(d[i18n.t.F.provider] || '')} · ${esc(st)}${d._failReason ? ` · ${esc(d._failReason)}` : ''}</em>
        </button>
        <div class="lo-side">
          <div class="lo-when">${when}</div>
          <button class="lo-star${saved.has(m.id) ? ' on' : ''}" data-save="${esc(m.id)}"
            title="${ko ? '저장' : 'Save'}">${saved.has(m.id) ? '★' : '☆'}</button>
        </div>
      </div>`;
    }).join('') + (opt.note ? `<p class="lo-note">${opt.note}</p>` : '');
    this._wire(body, list, ko);
  },

  _saved(body, ko, saved) {
    if (!saved.length) {
      body.innerHTML = `<p class="lo-empty">${ko
        ? '저장한 발사가 없습니다. 목록에서 ☆ 를 누르면 여기에 모입니다 — 이 기기에 저장됩니다.'
        : 'Nothing saved yet. Tap ☆ in any list — saved on this device.'}</p>`;
      return;
    }
    body.innerHTML = saved.slice().reverse().map(x => `<div class="lo-row">
        <button class="lo-open" data-id="${esc(x.id)}">
          <b>${esc(x.name)}</b>
          <span>${esc(x.mission || '')}${x.orbit ? ` · ${esc(x.orbit)}` : ''}</span>
          <em>${esc(x.provider || '')}${x.net ? ` · ${new Date(x.net).toLocaleString(i18n.lang)}` : ''}</em>
        </button>
        <div class="lo-side">
          <div class="lo-when">${esc(x.savedAt ? new Date(x.savedAt).toLocaleDateString(i18n.lang) : '')}</div>
          <button class="lo-star on" data-save="${esc(x.id)}" title="${ko ? '저장 해제' : 'Remove'}">★</button>
        </div>
      </div>`).join('')
      + `<p class="lo-note">${ko
        ? `이 기기에 저장됩니다 — 계정을 따라 다른 기기로 옮겨 가지 않습니다. ${store.isPaid() ? '' : `무료는 ${FREE_LIMIT}건까지입니다.`}`
        : `Saved on this device. ${store.isPaid() ? '' : `Free plan keeps ${FREE_LIMIT}.`}`}</p>`;
    this._wire(body, null, ko);
  },

  _wire(body, list, ko) {
    body.querySelectorAll('.lo-open').forEach(b => {
      b.onclick = async () => {
        const m = (list || []).find(x => x.id === b.dataset.id)
          || (launches.upcoming || []).concat(launches.live || [], launches._recent || []).find(x => x.id === b.dataset.id);
        if (!m) { this._say(ko ? '이 발사의 상세를 다시 받지 못했습니다 — 목록에서 다시 열어 주세요.' : 'Details unavailable — reopen from a list.'); return; }
        this.close();
        const { flyTo } = await import('./viewer.js');
        flyTo(m.lon, m.lat, 900_000);
        try {
          const { launchPads } = await import('./layers/launchpad.js');
          launchPads.pin(m);
        } catch (e) { /* 핀이 없어도 시트는 열린다 */ }
        store.select(m);
      };
    });
    body.querySelectorAll('.lo-star').forEach(b => {
      b.onclick = () => { this._toggleSave(b.dataset.save, list, ko); };
    });
  },

  _toggleSave(id, list, ko) {
    const saved = load();
    const at = saved.findIndex(x => x.id === id);
    if (at >= 0) {
      saved.splice(at, 1);
      save(saved);
      this.render();
      return;
    }
    /* 잠금은 결과를 보여준 뒤에만 — 무료도 몇 건은 저장된다. */
    if (!store.isPaid() && saved.length >= FREE_LIMIT) {
      this._say(ko
        ? `무료로는 ${FREE_LIMIT}건까지 저장됩니다. 더 저장하려면 EXPLORER 가 필요합니다 — 저장한 발사는 그대로 남아 있습니다.`
        : `Free keeps ${FREE_LIMIT} saved launches. EXPLORER removes the limit; what you saved stays.`);
      return;
    }
    const m = (list || []).concat(launches.upcoming || [], launches.live || [], launches._recent || [])
      .find(x => x.id === id);
    if (!m) return;
    const d = m.data || {};
    saved.push({ id: m.id, name: m.name, mission: d._mission || null, provider: d[i18n.t.F.provider] || null,
      orbit: d._orbitAbbrev || null, net: d._net || null, lat: m.lat, lon: m.lon, savedAt: new Date().toISOString() });
    save(saved);
    this.render();
  },

  _say(text) {
    const p = this.el.querySelector('.lo-body');
    const note = document.createElement('p');
    note.className = 'lo-note warn';
    note.textContent = text;
    p.prepend(note);
    setTimeout(() => note.remove(), 6000);
  },
};
