// 물어보기 패널 — 챗창 UI
//
// ⚠️ 대화하는 척하지 않는다.
//    "안녕하세요! 무엇을 도와드릴까요?" 같은 인사말을 넣으면 사람들이 이걸
//    LLM 으로 오해하고, 그러면 답하지 못하는 질문을 던지게 된다.
//    처음부터 "이런 걸 물어볼 수 있다"를 보여주는 편이 정직하고 실제로 더 잘 쓰인다.
//
// ⚠️ 답마다 근거와 출처를 붙인다.
//    어떤 낱말이 걸려서 어떤 자료를 봤는지 접어서 보여주고, 인용문(DOI 포함)을 준다.
//    논문·보고서에 쓰는 사람이 바로 복사할 수 있어야 한다.

import { i18n } from '../i18n.js';
import { ask } from './answer.js';
import { router } from './router.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const askPanel = {
  root: null, log: null, input: null, _busy: false,

  init() {
    this.root = document.getElementById('askSheet');
    if (!this.root) return this;
    this.log = this.root.querySelector('.ask-log');
    this.input = this.root.querySelector('.ask-input');
    const form = this.root.querySelector('.ask-form');

    form?.addEventListener('submit', e => {
      e.preventDefault();
      const q = this.input.value.trim();
      if (q) this.send(q);
    });

    this.root.querySelector('.ask-close')?.addEventListener('click', () => this.close());
    return this;
  },

  open() {
    if (!this.root) return;
    this.root.classList.add('up');
    if (!this.log.children.length) this.greet();
    setTimeout(() => this.input?.focus(), 250);
  },

  close() { this.root?.classList.remove('up'); },

  /** 인사 대신 "무엇을 물을 수 있는가"를 보여준다 */
  greet() {
    const ko = i18n.lang === 'ko';
    const n = el('div', 'ask-msg ask-sys');
    n.appendChild(el('p', null, ko
      ? '지구에서 지금 일어나는 일을 물어보세요. 화면이 그쪽으로 이동하고, 자료와 출처를 같이 보여드립니다.'
      : 'Ask what is happening on Earth right now. The globe moves there, and you get the data with its source.'));
    n.appendChild(el('p', 'ask-note', ko
      ? '이 기능은 우리가 가진 자료만 찾아서 보여줍니다. 답을 지어내지 않고, 모르면 모른다고 합니다.'
      : 'This searches only the data we hold. It does not invent answers; when it does not know, it says so.'));
    this.log.appendChild(n);
    this.chips(ask.examples());
  },

  chips(list) {
    const wrap = el('div', 'ask-chips');
    list.forEach(s => {
      const b = el('button', 'ask-chip', esc(s));
      b.addEventListener('click', () => this.send(s));
      wrap.appendChild(b);
    });
    this.log.appendChild(wrap);
    this.scroll();
  },

  async send(q) {
    if (this._busy) return;
    this._busy = true;
    this.input.value = '';
    this.log.appendChild(el('div', 'ask-msg ask-me', `<p>${esc(q)}</p>`));
    this.scroll();

    let r;
    try {
      r = await ask.run(q);
    } catch (e) {
      r = { ok: false, kind: 'error', title: i18n.lang === 'ko' ? '오류' : 'Error',
            lines: [String(e.message || e)] };
    }
    this.render(r);
    this._busy = false;
  },

  render(r) {
    const ko = i18n.lang === 'ko';
    const n = el('div', 'ask-msg ask-bot');

    if (r.title) n.appendChild(el('div', 'ask-title', esc(r.title)));
    (r.lines || []).forEach(t => n.appendChild(el('p', null, esc(t))));

    // ── 찾은 것 ──
    if (r.items?.length) {
      const ul = el('ul', 'ask-items');
      r.items.forEach(it => {
        ul.appendChild(el('li', null,
          `<b>${esc(it.label)}</b>${it.detail ? ` <span>${esc(it.detail)}</span>` : ''}`));
      });
      n.appendChild(ul);
      if (r.count > r.items.length) {
        n.appendChild(el('p', 'ask-note', ko
          ? `그 밖에 ${r.count - r.items.length}건이 더 있습니다. 지구본에서 확인하세요.`
          : `${r.count - r.items.length} more — see them on the globe.`));
      }
    }

    // ── 출처 (논문에 그대로 쓸 수 있게) ──
    if (r.source) {
      const d = el('details', 'ask-src');
      d.appendChild(el('summary', null, ko ? '출처' : 'Source'));
      const s = r.source;
      const body = el('div');
      body.appendChild(el('p', null,
        `<b>${esc(ko ? s.title?.ko : s.title?.en)}</b><br>${esc(s.org || '')}`));
      if (s.citation) {
        const c = el('p', 'ask-cite', esc(s.citation));
        body.appendChild(c);
        const btn = el('button', 'ask-copy', ko ? '인용문 복사' : 'Copy citation');
        btn.addEventListener('click', () => {
          navigator.clipboard?.writeText(s.citation);
          btn.textContent = ko ? '복사됨' : 'Copied';
          setTimeout(() => { btn.textContent = ko ? '인용문 복사' : 'Copy citation'; }, 1600);
        });
        body.appendChild(btn);
      } else if (s.note) {
        body.appendChild(el('p', 'ask-warn', esc(s.note)));
      }
      if (s.doi) body.appendChild(el('p', 'ask-note', `DOI: ${esc(s.doi)}`));
      // ⚠️ 라이선스 미확인은 반드시 화면에 드러낸다. 조용히 두면 공개 때 사고가 난다.
      if (s.license?.status === 'unverified') {
        body.appendChild(el('p', 'ask-warn', ko
          ? '⚠️ 이 자료는 재배포 조건이 확인되지 않았습니다. 인용은 가능하지만 자료 자체를 다시 배포하기 전에 확인이 필요합니다.'
          : '⚠️ Redistribution terms for this source are unverified. Citing is fine; redistributing the data itself needs checking first.'));
      }
      d.appendChild(body);
      n.appendChild(d);
    }

    // ── 왜 이 답이 나왔나 ──
    if (r.why?.keyword) {
      const d = el('details', 'ask-why');
      d.appendChild(el('summary', null, ko ? '어떻게 찾았나' : 'How this was matched'));
      d.appendChild(el('p', 'ask-note', ko
        ? `걸린 낱말: ${esc((r.why.keyword || []).join(', '))} → 자료 «${esc(r.why.dataset)}»`
        : `Matched: ${esc((r.why.keyword || []).join(', '))} → dataset «${esc(r.why.dataset)}»`));
      n.appendChild(d);
    }

    this.log.appendChild(n);
    if (r.suggest) this.chips(r.suggest);
    this.scroll();
  },

  scroll() { this.log.scrollTop = this.log.scrollHeight; },
};

export { router };
