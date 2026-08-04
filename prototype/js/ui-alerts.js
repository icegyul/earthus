// 알림 설정 — 지켜볼 지점 · 켜고 끄기
//
// ⚠️⚠️⚠️ **이 화면의 첫 줄은 "못 하는 것"이다.** 알림은 사람이 위험을 피하려고
//    믿는 기능이라, 흐리게 적으면 그 믿음이 그대로 위험이 된다.
//      · 웹은 **앱이 닫히면 사용자가 어디 있는지 모른다** (배경 위치 추적이 없다)
//        → 알림은 **저장한 지점** 기준이다. 해변에 도착하면 알아서 오지 않는다.
//      · **아이폰은 홈 화면에 추가해야만** 알림이 온다
//      · 기기가 절전 중이면 늦게 온다 — "즉시"라고 쓰지 않는다
//
// ⚠️ 안전 알림(이안류·지진·특보·쓰나미)은 **무료**다. 유료로 갈리는 것은
//    지켜볼 지점 개수뿐이다 (무료 1곳 · 유료 20곳). billing.js 참고.

import { i18n } from './i18n.js';
import { auth } from './auth.js';
import { push } from './push.js';
import { myLocation } from './mylocation.js';
import { toast } from './ui.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const alertsSheet = {
  _spots: [],

  open() {
    document.querySelectorAll('.sheet-panel.up').forEach((p) => p.classList.remove('up'));
    $('#alertSheet')?.classList.add('up');
    this.render();
    this._load();
  },
  close() { $('#alertSheet')?.classList.remove('up'); },

  async _load() {
    try { this._spots = await push.spots(); } catch (_) { this._spots = []; }
    if ($('#alertSheet')?.classList.contains('up')) this.render();
  },

  async render() {
    const body = $('#alertBody');
    if (!body) return;
    const ko = i18n.lang === 'ko';
    body.innerHTML = '';

    /* ── 1. 못 하는 것부터 ─────────────────────────────────── */
    body.appendChild(el('div', 'al-limits',
      `<b>${ko ? '⚠️ 먼저 알아 두실 것' : '⚠️ Before you turn this on'}</b>`
      + `<ul>`
      + `<li>${ko
          ? '알림은 <b>저장해 두신 지점</b> 기준입니다. 앱이 닫히면 지금 어디 계신지 알 수 없어서, <b>해변에 도착하셨다고 알아서 오지 않습니다.</b>'
          : 'Alerts are based on <b>saved places</b>. The web cannot track you in the background, so arriving somewhere does not trigger anything.'}</li>`
      + `<li>${ko
          ? '<b>아이폰은 홈 화면에 추가</b>해야 알림이 옵니다. 사파리 탭에서는 오지 않습니다.'
          : '<b>On iPhone you must add this to the Home Screen</b> — Safari tabs receive nothing.'}</li>`
      + `<li>${ko
          ? '기기가 절전 중이면 <b>늦게 도착할 수 있습니다.</b> 도착 시각은 저희가 정하지 못합니다.'
          : 'Delivery can be delayed while the device sleeps. We do not control timing.'}</li>`
      + `<li>${ko
          ? '⚠️ <b>알림을 대피 수단으로 쓰지 마세요.</b> 공식 경보(기상청·지자체 재난문자)를 대신하지 않습니다.'
          : '⚠️ Do not rely on this for evacuation. It does not replace official warnings.'}</li>`
      + `</ul>`));

    /* ── 2. 이 기기에서 되나 ───────────────────────────────── */
    const s = push.support();
    if (!s.ok) {
      body.appendChild(el('div', 'al-block',
        `<b>${ko ? '이 기기에서는 아직 받을 수 없습니다' : 'Not available on this device'}</b>`
        + `<p>${s.msg || ''}</p>`));
      /* ⚠️ 여기서 끝내지 않는다. 지점 저장은 지금 해 둘 수 있고,
         나중에 다른 기기에서 켜면 그 지점이 그대로 쓰인다. */
    }

    if (!auth.user) {
      const b = el('button', 'btn-primary', ko ? '로그인하고 알림 켜기' : 'Sign in to enable alerts');
      b.onclick = async () => {
        this.close();
        const { loginSheet } = await import('./ui-account.js');
        loginSheet.open(ko
          ? '알림을 계정에 연결하려면 로그인이 필요합니다. 기기를 바꿔도 지점이 그대로 따라갑니다.'
          : 'Sign in so your alert places follow you across devices.');
      };
      body.appendChild(b);
      body.appendChild(el('p', 'sky-note', ko
        ? '⚠️ 로그인이 필요한 이유: 알림 주소를 계정에 묶어야 <b>남이 내 알림을 지우거나 훔쳐보지 못합니다.</b>'
        : 'Sign-in ties the push address to your account so nobody else can read or delete it.'));
      return;
    }

    /* ── 3. 켜고 끄기 ──────────────────────────────────────── */
    const cur = await push.current();
    const row = el('div', 'al-toggle');
    row.appendChild(el('div', null,
      `<b>${ko ? '이 기기에서 알림 받기' : 'Alerts on this device'}</b>`
      + `<i>${cur ? (ko ? '켜져 있습니다' : 'On') : (ko ? '꺼져 있습니다' : 'Off')}</i>`));
    const btn = el('button', cur ? 'btn-secondary' : 'btn-primary',
      cur ? (ko ? '끄기' : 'Turn off') : (ko ? '켜기' : 'Turn on'));
    btn.disabled = !s.ok && !cur;
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (cur) { await push.disable(); toast(ko ? '알림을 껐습니다' : 'Alerts off'); }
        else { await push.enable(); toast(ko ? '알림을 켰습니다' : 'Alerts on'); }
      } catch (e) {
        /* ⚠️ 실패 이유를 뭉뚱그리지 않는다. "실패"만 뜨면 같은 시도를 반복한다. */
        const M = {
          NOT_SIGNED_IN: ['로그인이 필요합니다', 'Sign in first'],
          PERMISSION: ['브라우저에서 알림을 허용해 주세요', 'Please allow notifications'],
          DENIED: ['알림이 차단돼 있습니다. 브라우저 설정에서 허용해 주세요',
                   'Notifications are blocked — allow them in settings'],
          NOT_CONFIGURED: ['알림 서버가 아직 연결되지 않았습니다', 'Push server not connected yet'],
          IOS_NEEDS_INSTALL: ['아이폰은 홈 화면에 추가한 뒤에만 알림이 옵니다',
                              'Add to Home Screen first on iPhone'],
          UNSUPPORTED: ['이 브라우저는 웹 알림을 지원하지 않습니다', 'Browser does not support push'],
        }[e.message];
        toast(M ? (ko ? M[0] : M[1]) : `${ko ? '실패' : 'Failed'}: ${e.message}`);
      }
      this.render();
    };
    row.appendChild(btn);
    body.appendChild(row);

    /* ── 4. 지켜볼 지점 ────────────────────────────────────── */
    const paid = auth.isPaid?.();
    const max = paid ? 20 : 1;
    body.appendChild(el('h4', null,
      `${ko ? '지켜볼 곳' : 'Places to watch'} <i style="font-style:normal;opacity:.55">${this._spots.length}/${max}</i>`));

    if (!this._spots.length) {
      body.appendChild(el('p', 'sky-note', ko
        ? '⚠️ <b>지점이 없으면 알림도 없습니다.</b> 지켜볼 곳을 한 곳 이상 저장해 주세요.'
        : '⚠️ <b>No places, no alerts.</b> Save at least one place to watch.'));
    }

    this._spots.forEach((sp) => {
      const r = el('div', 'al-spot',
        `<div><b>${esc(sp.label)}</b>`
        + `<i>${sp.lat.toFixed(3)}, ${sp.lon.toFixed(3)}`
        + ` · ${[sp.rip && (ko ? '이안류' : 'rip'), sp.quake && (ko ? '지진' : 'quake'),
                 sp.warn && (ko ? '특보' : 'warnings')].filter(Boolean).join(' · ')}</i></div>`);
      const del = el('button', 'al-del', '×');
      del.title = ko ? '삭제' : 'Remove';
      del.onclick = async () => { await push.removeSpot(sp.id); this._load(); };
      r.appendChild(del);
      body.appendChild(r);
    });

    if (this._spots.length < max) {
      const add = el('button', 'btn-secondary',
        ko ? '＋ 지금 내 위치를 지켜볼 곳으로' : '＋ Watch my current location');
      add.onclick = async () => {
        const c = myLocation.coords;
        if (!c) { toast(ko ? '위치를 먼저 확인해 주세요' : 'Location unknown'); return; }
        const label = prompt(ko ? '이 곳의 이름 (예: 경포해변)' : 'Name this place');
        if (!label) return;
        try {
          await push.addSpot({ label: label.slice(0, 40), lat: c.lat, lon: c.lon });
          this._load();
        } catch (e) {
          toast(e.message === 'SPOT_LIMIT'
            ? (ko ? `지켜볼 곳은 ${max}곳까지입니다${paid ? '' : ' (구독하면 20곳)'}`
                  : `Limit is ${max} place${max > 1 ? 's' : ''}`)
            : `${ko ? '저장 실패' : 'Failed'}: ${e.message}`);
        }
      };
      body.appendChild(add);
    } else if (!paid) {
      body.appendChild(el('p', 'sky-note', ko
        ? '무료로는 한 곳을 지켜봅니다. 구독하면 20곳까지 늘어납니다. '
          + '⚠️ 알림 자체(이안류·지진·특보)는 <b>무료로도 그대로 옵니다</b> — 곳 수만 다릅니다.'
        : 'Free covers one place; subscribing raises it to 20. The alerts themselves are free either way.'));
    }

    body.appendChild(el('p', 'sub-legal', ko
      ? '⚠️ 이안류·지진 등급은 <b>기관이 매긴 것</b>을 그대로 옮깁니다. 저희가 판단하지 않습니다. '
        + '대피 여부는 기상청·지자체 공식 발표와 현장 안내를 따르세요.'
      : 'Grades come from the issuing agency, unchanged. Follow official announcements for any decision to evacuate.'));
  },
};
