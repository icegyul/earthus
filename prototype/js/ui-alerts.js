// 알림 설정 — 지켜볼 지점 · 켜고 끄기
//
// ⚠️⚠️⚠️ **이 화면의 첫 줄은 "못 하는 것"이다.** 알림은 사람이 위험을 피하려고
//    믿는 기능이라, 흐리게 적으면 그 믿음이 그대로 위험이 된다.
//      · 웹은 **앱이 닫히면 사용자가 어디 있는지 모른다** (배경 위치 추적이 없다)
//        → 알림은 **저장한 지점** 기준이다. 해변에 도착하면 알아서 오지 않는다.
//      · **아이폰은 홈 화면에 추가해야만** 알림이 온다
//      · 기기가 절전 중이면 늦게 온다 — "즉시"라고 쓰지 않는다
//
// ⚠️ 현재 FREE_OPEN 정책에서는 안전 알림과 관광 혼잡 지켜보기를 모두 무료로 열고,
//    비용 폭주 방지를 위한 서버 상한 20곳만 둔다. 판매가 다시 열리기 전에는 잠그지 않는다.

import { i18n } from './i18n.js';
import { auth } from './auth.js';
import { push } from './push.js';
import { myLocation } from './mylocation.js';
import { toast } from './ui.js';
import { flyTo, viewCenter } from './viewer.js';
import { API } from './config.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const alertsSheet = {
  _spots: [],
  _health: null,
  _spotsLoading: false,
  _spotsError: false,
  _renderSeq: 0,

  open() {
    document.querySelectorAll('.sheet-panel.up').forEach((p) => p.classList.remove('up'));
    $('#alertSheet')?.classList.add('up');
    this._spotsLoading = true;
    this._spotsError = false;
    this.render();
    this._load();
  },
  close() { $('#alertSheet')?.classList.remove('up'); },

  async _load() {
    /* 지점 DB와 발송 상태는 서로 독립이다. 한쪽이 실패했다고 다른 쪽까지 지우지 않는다.
       특히 상태 파일 요청 실패를 '저장 지점 0개'로 바꾸면 사용자가 지점을 다시 만들다
       서버 제한에 걸린다. */
    const [spots, health] = await Promise.allSettled([
      push.spots(),
      fetch(`${API.EVENTS}/push-tick.json`, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ]);
    this._spotsLoading = false;
    if (spots.status === 'fulfilled') {
      this._spots = spots.value;
      this._spotsError = false;
    } else {
      this._spotsError = true;
    }
    if (health.status === 'fulfilled') this._health = health.value;
    else this._health = { unavailable: true };
    if ($('#alertSheet')?.classList.contains('up')) this.render();
  },

  async render() {
    const seq = ++this._renderSeq;
    const body = $('#alertBody');
    if (!body) return;
    const ko = i18n.lang === 'ko';
    body.innerHTML = '';

    /* ── 1. 알림 조건 ──────────────────────────────────────── */
    body.appendChild(el('div', 'al-limits',
      `<b>${ko ? '알림 조건' : 'Alert setup'}</b>`
      + `<ul>`
      + `<li>${ko
          ? '기준 위치 · <b>저장한 지점</b>'
          : 'Location · <b>saved places</b>'}</li>`
      + `<li>${ko
          ? '아이폰 · <b>홈 화면에 추가</b>'
          : 'iPhone · <b>Add to Home Screen</b>'}</li>`
      + `<li>${ko
          ? '도착 시각 · 운영체제와 절전 상태에 따라 지연 가능'
          : 'Delivery · may be delayed by device power state'}</li>`
      + `<li>${ko
          ? '대피 기준 · <b>기상청·지자체 공식 경보</b>'
          : 'Evacuation · <b>official local warnings</b>'}</li>`
      + `</ul>`));

    /* '켜짐'은 서버가 실제로 도는지 말해 주지 않는다. 공개 health 산출물의 마지막
       실행 시각만 보여 준다. ⚠️ 화면 요청 실패와 서버 장애를 같은 말로 쓰지 않으며,
       targets/sent 같은 이용자 규모 정보는 노출하지 않는다. */
    if (this._health) {
      const h = this._health;
      const at = Date.parse(String(h.generated || ''));
      const age = Number.isFinite(at) ? (Date.now() - at) / 60_000 : Infinity;
      const ok = h.configured === true && h.ok === true && age <= 20;
      const stamp = h.generatedKst
        ? `${h.generatedKst} KST`
        : (Number.isFinite(at) ? `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '—');
      const text = h.unavailable
        ? (ko
            ? '<b>발송 서버 상태 · 확인 지연</b><span>대피 기준 · 공식 경보</span>'
            : '<b>Delivery server · check delayed</b><span>Evacuation source · official warnings</span>')
        : ok
          ? (ko
              ? `<b>발송 서버 최근 확인</b><span>${esc(stamp)} · 정상 실행</span>`
              : `<b>Delivery server recently checked</b><span>${esc(stamp)} · running</span>`)
          : (ko
              ? `<b>발송 서버 상태 확인이 필요합니다.</b><span>마지막 기록 ${esc(stamp)} · 공식 경보를 함께 확인하세요.</span>`
              : `<b>Delivery server status needs checking.</b><span>Last record ${esc(stamp)} · check official warnings too.</span>`);
      body.appendChild(el('div', `al-health ${ok ? 'ok' : 'warn'}`, text));
    }

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
        ? ' 로그인이 필요한 이유: 알림 주소를 계정에 묶어야 <b>남이 내 알림을 지우거나 훔쳐보지 못합니다.</b>'
        : 'Sign-in ties the push address to your account so nobody else can read or delete it.'));
      return;
    }

    /* ── 3. 켜고 끄기 ──────────────────────────────────────── */
    const cur = await push.current();
    /* open()의 첫 렌더가 구독 확인을 기다리는 사이 _load()가 끝나 두 번째 렌더가
       시작될 수 있다. 옛 렌더가 뒤늦게 행을 붙이면 토글·장소가 두 벌 생긴다.
       DOM을 비운 가장 최신 회차만 이후 내용을 이어 쓴다. */
    if (seq !== this._renderSeq) return;
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
    const max = 20;
    body.appendChild(el('h4', null,
      `${ko ? '지켜볼 곳' : 'Places to watch'} <i style="font-style:normal;opacity:.55">${this._spots.length}/${max}</i>`));

    if (this._spotsLoading) {
      body.appendChild(el('p', 'al-sync', ko ? '저장한 장소를 확인하는 중…' : 'Checking saved places…'));
    } else if (this._spotsError) {
      const sync = el('div', 'al-sync warn', ko
        ? '<span> 저장 장소 목록의 최신 상태를 확인하지 못했습니다. 아래 목록은 이전에 받은 내용일 수 있습니다.</span>'
        : '<span> Could not refresh saved places. The list below may be from an earlier load.</span>');
      const retry = el('button', null, ko ? '다시 확인' : 'Retry');
      retry.onclick = () => {
        this._spotsLoading = true;
        this._spotsError = false;
        this.render();
        this._load();
      };
      sync.appendChild(retry);
      body.appendChild(sync);
    } else if (!this._spots.length) {
      body.appendChild(el('p', 'sky-note', ko
        ? ' <b>지점이 없으면 알림도 없습니다.</b> 지켜볼 곳을 한 곳 이상 저장해 주세요.'
        : ' <b>No places, no alerts.</b> Save at least one place to watch.'));
    }

    this._spots.forEach((sp) => {
      const r = el('div', 'al-spot');
      /* 저장한 곳은 알림 서버의 관리 행이면서, 다시 그 장소를 보는 가장 짧은 길이다.
         예전에는 좌표를 읽고 삭제만 할 수 있어 저장 후 지도와 완전히 끊겼다.
         ⚠️ 저장 좌표만 그대로 쓴다. 현재 위치로 바꾸거나 장소를 추측하지 않는다. */
      const go = el('button', 'al-go',
        `<div><b>${esc(sp.label)}</b>`
        + `<i>${sp.lat.toFixed(3)}, ${sp.lon.toFixed(3)}`
        + ` · ${[sp.rip && (ko ? '이안류' : 'rip'), sp.quake && (ko ? '지진' : 'quake'),
                 sp.warn && (ko ? '특보' : 'warnings'),
                 sp.tourism && (ko ? '관광 혼잡' : 'tourism crowd')].filter(Boolean).join(' · ')}</i></div>`
        + `<span aria-hidden="true">›</span>`);
      go.title = ko ? `${sp.label} 지도에서 보기` : `Show ${sp.label} on map`;
      go.onclick = () => {
        this.close();
        flyTo(sp.lon, sp.lat, 900_000, 1.4, async () => {
          const { dropPin } = await import('./pin.js');
          dropPin(sp.lon, sp.lat, sp.label);
        });
      };
      const edit = el('button', 'al-edit', '✎');
      edit.title = ko ? `${sp.label} 이름 바꾸기` : `Rename ${sp.label}`;
      edit.setAttribute('aria-label', edit.title);
      edit.onclick = async () => {
        const next = prompt(ko ? '지켜볼 곳의 새 이름' : 'New name for this place', sp.label);
        if (next == null || next.trim() === sp.label) return;
        if (!next.trim()) {
          toast(ko ? '이름을 한 글자 이상 적어 주세요' : 'Enter at least one character');
          return;
        }
        edit.disabled = true;
        try {
          sp.label = await push.renameSpot(sp.id, next);
          this.render();
        } catch (e) {
          toast(`${ko ? '이름 변경 실패' : 'Could not rename place'}: ${e.message}`);
          edit.disabled = false;
        }
      };
      const del = el('button', 'al-del', '×');
      del.title = ko ? `${sp.label} 삭제` : `Remove ${sp.label}`;
      del.setAttribute('aria-label', del.title);
      del.onclick = async () => {
        const yes = confirm(ko
          ? `${sp.label}을(를) 지켜볼 곳에서 삭제할까요? 이 장소의 알림도 중단됩니다.`
          : `Remove ${sp.label}? Alerts for this place will stop.`);
        if (!yes) return;
        del.disabled = true;
        try {
          await push.removeSpot(sp.id);
          this._load();
        } catch (e) {
          toast(`${ko ? '장소 삭제 실패' : 'Could not remove place'}: ${e.message}`);
          del.disabled = false;
        }
      };
      r.appendChild(go);
      r.appendChild(edit);
      r.appendChild(del);

      /* 값은 DB에 이미 있었지만 화면에서는 읽기만 가능했다. 각 저장 지점마다
         어떤 안전 알림을 받을지 직접 고르게 한다. ⚠️ 등급이나 판정 기준을 바꾸는
         옵션이 아니다 — 기관이 매긴 항목 종류를 받을지 여부만 켜고 끈다. */
      const types = el('div', 'al-types');
      let quakeRule = null;
      [['rip', ko ? '이안류' : 'Rip current'],
       ['quake', ko ? '지진' : 'Quake'],
       ['warn', ko ? '기상특보' : 'Weather warning'],
       ['tourism', ko ? '관광 혼잡' : 'Tourism crowd']].forEach(([key, label]) => {
        const chip = el('label', 'al-type' + (sp[key] ? ' on' : ''));
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!sp[key];
        input.setAttribute('aria-label', `${sp.label} · ${label}`);
        input.onchange = async () => {
          const next = input.checked;
          input.disabled = true;
          chip.classList.add('saving');
          try {
            await push.updateSpot(sp.id, { [key]: next });
            sp[key] = next;
            chip.classList.toggle('on', next);
            if (key === 'quake' && quakeRule) quakeRule.hidden = !next;
          } catch (e) {
            input.checked = !next;
            toast(`${ko ? '알림 설정 저장 실패' : 'Could not save alert setting'}: ${e.message}`);
          } finally {
            input.disabled = false;
            chip.classList.remove('saving');
          }
        };
        chip.appendChild(input);
        chip.appendChild(document.createTextNode(label));
        types.appendChild(chip);
      });
      r.appendChild(types);

      /* 서버가 처음부터 규모·거리 기준을 갖고 있었지만 화면에서는 기본값 3.5/150km가
         보이지도, 바뀌지도 않았다. 이 값은 기관의 경보 등급이 아니라 사용자가 정하는
         수신 필터다. 그 차이를 바로 아래에 적는다. */
      quakeRule = el('div', 'al-quake-rule');
      quakeRule.hidden = !sp.quake;
      const ruleTitle = el('span', 'al-rule-title', ko ? '지진 수신 기준' : 'Quake alert filter');
      const magLabel = el('label', null, ko ? '규모 M' : 'Magnitude M');
      const magSelect = document.createElement('select');
      const currentMag = Number(sp.quake_min_mag ?? 3.5);
      [...new Set([2.5, 3, 3.5, 4, 4.5, 5, 6, currentMag])].sort((a, b) => a - b)
        .forEach((v) => magSelect.appendChild(new Option(
          ko ? `${v.toFixed(1)} 이상` : `M${v.toFixed(1)} or greater`,
          String(v), false, v === currentMag)));
      magSelect.setAttribute('aria-label', ko ? `${sp.label} 지진 최소 규모` : `${sp.label} minimum quake magnitude`);
      magLabel.appendChild(magSelect);
      const kmLabel = el('label', null, ko ? '거리' : 'Distance');
      const kmSelect = document.createElement('select');
      const currentKm = Number(sp.quake_max_km ?? 150);
      [...new Set([50, 100, 150, 300, 500, currentKm])].sort((a, b) => a - b)
        .forEach((v) => kmSelect.appendChild(new Option(`${v}km ${ko ? '이내' : 'or less'}`, String(v), false, v === currentKm)));
      kmSelect.setAttribute('aria-label', ko ? `${sp.label} 지진 최대 거리` : `${sp.label} maximum quake distance`);
      kmLabel.appendChild(kmSelect);
      const saveRule = async (input, key, value) => {
        const before = Number(sp[key] ?? (key === 'quake_min_mag' ? 3.5 : 150));
        input.disabled = true;
        try {
          await push.updateSpot(sp.id, { [key]: value });
          sp[key] = value;
        } catch (e) {
          input.value = String(before);
          toast(`${ko ? '지진 기준 저장 실패' : 'Could not save quake filter'}: ${e.message}`);
        } finally { input.disabled = false; }
      };
      magSelect.onchange = () => saveRule(magSelect, 'quake_min_mag', Number(magSelect.value));
      kmSelect.onchange = () => saveRule(kmSelect, 'quake_max_km', Number(kmSelect.value));
      quakeRule.append(ruleTitle, magLabel, kmLabel,
        el('small', null, ko ? '내가 정하는 수신 기준 · 기관 경보 등급 아님' : 'Your delivery filter · not an agency warning level'));
      r.appendChild(quakeRule);

      if (sp.tourism && sp.tourism_place_code) {
        const tourismRule = el('div', 'al-quake-rule');
        const title = el('span', 'al-rule-title', ko ? '관광 혼잡 수신 기준' : 'Tourism crowd filter');
        const label = el('label', null, ko ? '서울시 등급' : 'Seoul level');
        const select = document.createElement('select');
        const current = Number(sp.tourism_min_rank ?? 3);
        [[2, ko ? '보통 이상' : 'Normal or above'],
         [3, ko ? '약간 붐빔 이상' : 'Slightly crowded or above'],
         [4, ko ? '붐빔만' : 'Crowded only']].forEach(([value, text]) => {
          select.appendChild(new Option(text, String(value), false, value === current));
        });
        select.setAttribute('aria-label', ko ? `${sp.label} 관광 혼잡 최소 등급` : `${sp.label} minimum tourism crowd level`);
        select.onchange = async () => {
          const before = Number(sp.tourism_min_rank ?? 3);
          select.disabled = true;
          try {
            const value = Number(select.value);
            await push.updateSpot(sp.id, { tourism_min_rank: value });
            sp.tourism_min_rank = value;
          } catch (error) {
            select.value = String(before);
            toast(`${ko ? '관광 혼잡 기준 저장 실패' : 'Could not save tourism filter'}: ${error.message}`);
          } finally { select.disabled = false; }
        };
        label.appendChild(select);
        tourismRule.append(title, label, el('small', null, ko
          ? '서울시 공식 현재 혼잡 등급 · 운영·안전 판단 아님'
          : 'Official Seoul current crowd level · not an operation or safety decision'));
        r.appendChild(tourismRule);
      }
      body.appendChild(r);
    });

    /* 목록 개수를 확인하지 못했을 때 새 지점을 만들면 실제 서버에는 이미 제한만큼 있어
       SPOT_LIMIT만 나고, 사용자는 왜 안 되는지 알 수 없다. 최신 목록을 받은 뒤에만 연다. */
    if (!this._spotsLoading && !this._spotsError && this._spots.length < max) {
      const saveAt = async (c) => {
        if (!c) { toast(ko ? '위치를 먼저 확인해 주세요' : 'Location unknown'); return; }
        const label = prompt(ko ? '이 곳의 이름 (예: 경포해변)' : 'Name this place');
        if (!label) return;
        try {
          await push.addSpot({ label: label.slice(0, 40), lat: c.lat, lon: c.lon });
          this._load();
        } catch (e) {
          toast(e.message === 'SPOT_LIMIT'
            ? (ko ? `지켜볼 곳은 ${max}곳까지입니다`
                  : `Limit is ${max} place${max > 1 ? 's' : ''}`)
            : `${ko ? '저장 실패' : 'Failed'}: ${e.message}`);
        }
      };

      /* GPS 위치만 저장할 수 있으면 여행지·가족이 있는 곳처럼 실제로 지켜볼 장소를
         미리 등록할 수 없다. 사용자가 지구를 돌려 고른 화면 중심을 좌표 그대로 저장한다.
         ⚠️ 화면 중심은 viewer.viewCenter()의 지표 교차점이며 지명을 추측하지 않는다. */
      const center = viewCenter();
      const addMap = el('button', 'btn-secondary al-add', center
        ? (ko
            ? `＋ 지금 보고 있는 곳 (${center.lat.toFixed(2)}, ${center.lon.toFixed(2)})`
            : `＋ Watch map centre (${center.lat.toFixed(2)}, ${center.lon.toFixed(2)})`)
        : (ko ? '＋ 지금 보고 있는 곳' : '＋ Watch map centre'));
      /* 버튼에 적힌 좌표와 저장값이 반드시 같아야 한다. 배경 인트로가 천천히 도는 중
         클릭 시점에 다시 읽으면 몇 초 사이 경도가 달라져 보지 않은 곳을 저장한다. */
      addMap.onclick = () => saveAt(center);
      body.appendChild(addMap);

      const addMe = el('button', 'btn-secondary al-add',
        ko ? '＋ 지금 내 위치' : '＋ Watch my current location');
      addMe.onclick = async () => {
        addMe.disabled = true;
        const c = myLocation.coords || await myLocation.locate(true);
        addMe.disabled = false;
        if (!c) {
          toast(myLocation.reason() || (ko ? '위치를 가져오지 못했습니다' : 'Could not get location'));
          return;
        }
        saveAt(c);
      };
      body.appendChild(addMe);
    } else if (!this._spotsLoading && !this._spotsError && this._spots.length >= max) {
      body.appendChild(el('p', 'sky-note', ko
        ? '현재 공개 정책의 지켜볼 곳 상한은 20곳입니다. 안전 알림과 관광 혼잡 알림은 모두 무료입니다.'
        : 'The current public limit is 20 watched places. Safety and tourism crowd alerts are free.'));
    }

    body.appendChild(el('p', 'sub-legal', ko
      ? '등급 출처 · 발표 기관 원문 · 대피는 기상청·지자체 발표와 현장 안내'
      : 'Grades come from the issuing agency, unchanged. Follow official announcements for any decision to evacuate.'));
  },
};
