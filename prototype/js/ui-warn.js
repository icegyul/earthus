// 기상특보 화면 — 상단 띠 + 상세 패널
//
// ⚠️ 띠는 **한국 안에 있고 내가 속한 특보구역에 특보가 있을 때만** 뜬다.
//    전 세계 사용자에게 한국 폭염경보를 띄우면 알림이 아니라 방해다.
//
// ⚠️ 반경으로 고르지 않는다. 옆 시·군 특보까지 딸려 오기 때문이다 —
//    대구 한복판에서 달성군·경산시 것까지 14건이 떴던 적이 있다.
//    warn.js 가 '가장 가까운 관측지점의 특보구역'을 내 구역으로 잡고,
//    화면에는 그 **구역 이름을 반드시 같이 적는다** (경계 옆에서는 어긋날 수 있으므로).

import { i18n } from './i18n.js';
import { warn } from './warn.js';
import { safetyActions } from './safety-actions.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 20260727 1100 → 27일 11:00 */
function hhmm(t) {
  const s = String(t || '');
  return s.length >= 12 ? `${+s.slice(6, 8)}일 ${s.slice(8, 10)}:${s.slice(10, 12)}` : '';
}

export const warnUI = {
  bar: null,
  body: null,

  init() {
    this.bar = document.getElementById('warnBar');
    this.body = document.getElementById('warnBody');
    if (this.bar) this.bar.onclick = () => this.open();
    document.addEventListener('earthus:warn', e => this.renderBar(e.detail));
    i18n.onChange(() => this.renderBar(warn.summary()));
    return this;
  },

  /* ⚠️⚠️ 별도 특보 띠를 없앴다. 이제 아무것도 그리지 않는다.
     ─────────────────────────────────────────────────────────────
     예전에는 특보를 상단 #warnBar 에, 지진·쓰나미를 하단 #banner 에 따로 띄웠다.
     둘 다 뜨면 **두 줄이 쌓여** 화면 위쪽을 먹었다 (지적받음: "한 줄로 뜨게 해줘").
     body.has-warn 으로 겹침만 피했을 뿐, 줄 수는 그대로였다.

     → 특보는 ui.js 의 banner 큐로 옮겼다 (banner.rebuild 의 1-b 항목).
       한 줄에서 쓰나미·지진과 함께 번갈아 표시된다.
       특보는 '지속되는 상태'라 persist 로 표시해 계속 다시 올라온다.

     이 함수는 남겨 둔다 — earthus:warn 이벤트와 i18n.onChange 가 부르고 있어
     지우면 그쪽에서 터진다. 대신 띠를 확실히 감추는 일만 한다. */
  renderBar() {
    if (this.bar) this.bar.hidden = true;
    document.body.classList.remove('has-warn');
  },

  open() {
    this.render();
    // ⚠️ 시트를 여는 클래스는 'on' 이 아니라 'up' 이다 (ui-events.js 와 같다).
    document.getElementById('warnSheet')?.classList.add('up');
  },

  close() { document.getElementById('warnSheet')?.classList.remove('up'); },

  render() {
    if (!this.body) return;
    const ko = i18n.lang === 'ko';
    const s = warn.summary();
    if (!s.ready) {
      this.body.innerHTML = `<p class="warn-note">${ko ? '특보 자료를 불러오지 못했습니다.' : 'Could not load warnings.'}</p>`;
      return;
    }

    const rows = (list) => list.map(w => {
      const lv = `<span class="warn-lv" style="background:${esc(w.color)}33;color:${esc(w.color)}">${esc(w.level)}</span>`;
      const km = '';   // ⚠️ 거리는 안 쓴다. 내 구역 안이면 거리는 뜻이 없다.
      return `<div class="warn-row"><span class="wk">${esc(w.icon)}</span>`
        + `<span class="wn"><b>${esc(ko ? w.kind : w.kindEn)}${lv}</b>`
        + `<i>${esc(w.region)} · ${ko ? '발효' : 'from'} ${hhmm(w.effectiveKst)}</i></span>${km}</div>`;
    }).join('');

    const z = s.zone;
    const near = s.mine.length
      ? `<h4>${ko ? `내 지역 · ${z ? z.name : ''}` : `My area · ${z ? z.name : ''}`}</h4>${rows(s.mine)}`
      : `<p class="warn-note">${s.inKorea
          ? (ko ? `내 지역(${s.zone ? s.zone.name : '?'})에는 발효 중인 특보가 없습니다.`
                : `No active warnings in your area (${s.zone ? s.zone.name : '?'}).`)
          : (ko ? '현재 위치가 한국 밖이거나 위치를 아직 못 받았습니다.' : 'Location is outside Korea or not available yet.')}</p>`;

    const all = (warn.data?.active || []).slice(0, 60);
    this.body.innerHTML = near
      + `<h4 style="margin-top:16px">${ko ? `전국 발효 중 ${s.activeCount}건` : `${s.activeCount} active nationwide`}</h4>`
      + rows(all)
      + (s.activeCount > all.length
          ? `<p class="warn-note">${ko ? `… 외 ${s.activeCount - all.length}건` : `… and ${s.activeCount - all.length} more`}</p>` : '')
      + `<p class="warn-note">${esc(ko ? s.note.ko : s.note.en)}<br>`
      + `${ko ? '출처' : 'Source'}: ${esc(warn.data.source)} · ${esc(warn.data.license)}<br>`
      + `${ko ? '기준시각(KST)' : 'As of (KST)'} ${hhmm(s.observedKst)}</p>`;
    this.body.appendChild(safetyActions());
  },
};
