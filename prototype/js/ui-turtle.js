// 바다거북 — 국립해양생물자원관이 추적한 개체들이 어디로 갔나
//
// 받은 요청
//   "바다거북 이모티콘을 띄어서 위치 표시 해주면 어때?" · "취미에 바다거북 메뉴 만들어주고"
//   "다만 '추적이 종료된 수신기에 대해서만 조회' 요건 주석 달아줘 화면 나올때"
//
// ⚠️⚠️⚠️ **이 자료는 이용 조건이 다른 것들과 다르다.**
//    공공저작물 **제4유형** — 출처표시 + 상업적 이용금지 + 변경금지.
//    (다른 자료는 전부 제1유형이거나 제한 없음이다. 이것만 다르다.)
//    → 지켜야 하는 것:
//      · **가공하지 않는다.** 좌표를 그대로 점과 선으로만 그린다.
//        ⚠️ 이 자료로 분석 문장을 만들지 않는다 — 그게 곧 '변경'이다.
//      · **유료 기능에 섞지 않는다.** 언제나 무료.
//      · 출처를 화면에 분명히 적는다.
//
// ⚠️⚠️ **실시간이 아니다.** 기관 설명 그대로:
//    "추적이 종료된 수신기에 대해서만 조회합니다."
//    → 화면 맨 위에 그 문장을 적는다. 안 적으면 "지금 여기 있다"로 읽힌다.
//       거북이 아직 그 자리에 있을 거라 믿고 배를 띄우면 안 된다.
//
// ⚠️ 성별·성체여부가 **숫자 코드**로 온다(1, 2…). 대조표를 못 받았다 —
//    1이 수컷인지 암컷인지 모른다. **추측해서 글자로 바꾸지 않는다.** 아예 안 보여준다.

import { i18n } from './i18n.js';
import { API } from '../js/config.js';
import { viewer } from './viewer.js';

const $ = (s) => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 종별 색 — ⚠️ 값을 바꾸는 게 아니라 **구분해 보이게** 하는 것이다.
   경로를 전부 같은 색으로 그리면 45마리가 실뭉치가 된다. */
const SPECIES = {
  푸른바다거북: { c: '#4fd0e0', en: 'Green sea turtle' },
  붉은바다거북: { c: '#f0a878', en: 'Loggerhead' },
  매부리바다거북: { c: '#b9a7f0', en: 'Hawksbill' },
};
const colorOf = (n) => SPECIES[n]?.c || '#9fd8b0';

let _data = null;

async function load() {
  if (_data) return _data;
  const r = await fetch(`${API.EVENTS}/sea-turtle.json`, { cache: 'no-cache' });
  // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님).
  if (!r.ok) throw new Error('turtle ' + r.status);
  _data = await r.json();
  return _data;
}

export const turtlePanel = {
  _ents: [],
  _shown: null,        // 지금 지도에 그린 pttId (null = 전부)

  async open() {
    document.querySelectorAll('.sheet-panel.up').forEach((p) => p.classList.remove('up'));
    $('#turtleSheet')?.classList.add('up');
    const body = $('#turtleBody');
    const ko = i18n.lang === 'ko';
    if (body) body.innerHTML = `<p class="kr-note">${ko ? '불러오는 중…' : 'Loading…'}</p>`;
    try {
      await load();
      this.render();
      this.draw(null);
    } catch (e) {
      if (body) body.innerHTML = `<p class="kr-note">${ko
        ? '자료를 불러오지 못했습니다' : 'Could not load'} — ${esc(e.message)}</p>`;
    }
  },

  close() {
    $('#turtleSheet')?.classList.remove('up');
    this.clear();
  },

  render() {
    const body = $('#turtleBody');
    if (!body || !_data) return;
    const ko = i18n.lang === 'ko';
    body.innerHTML = '';

    /* ── ⚠️ 맨 위: 이게 무엇이 아닌지 ─────────────────────────
       받은 요청 그대로 — "추적이 종료된 수신기에 대해서만 조회" 를 화면에 적는다. */
    body.appendChild(el('div', 'tt-warn',
      `<b>${ko ? '⚠️ 지금 위치가 아닙니다' : '⚠️ Not current positions'}</b>`
      + `<p>${ko
        ? '국립해양생물자원관은 <b>추적이 종료된 수신기에 대해서만</b> 자료를 공개합니다. '
          + '여기 보이는 것은 <b>이미 끝난 추적의 지나간 경로</b>입니다 — '
          + '그 거북이 지금 그 자리에 있다는 뜻이 아닙니다.<br>'
          + '<small>가장 최근 추적도 몇 해 전에 끝난 것일 수 있습니다. 개체마다 날짜를 함께 적었습니다.</small>'
        : 'The agency publishes <b>only completed trackers</b>. These are past routes — '
          + 'not where the turtle is now.'}</p>`));

    const T = _data.turtles || [];
    if (!T.length) {
      body.appendChild(el('p', 'kr-note', ko
        ? '지금 받아온 개체가 없습니다. ⚠️ 바다거북이 없다는 뜻이 아니라 저희가 못 받았다는 뜻입니다.'
        : 'No individuals loaded — that means we could not fetch, not that none exist.'));
    }

    // 종별 요약 — ⚠️ 세는 것은 '변경'이 아니다. 값을 바꾸지 않는다.
    const bySpc = {};
    T.forEach((t) => { bySpc[t.nameKo] = (bySpc[t.nameKo] || 0) + 1; });
    const chips = el('div', 'tt-chips');
    const all = el('button', 'tt-chip' + (this._shown === null ? ' on' : ''),
      `${ko ? '전체' : 'All'} ${T.length}`);
    all.onclick = () => { this.draw(null); this.render(); };
    chips.appendChild(all);
    Object.entries(bySpc).forEach(([nm, n]) => {
      const c = el('span', 'tt-chip static',
        `<i style="background:${colorOf(nm)}"></i>${esc(ko ? nm : (SPECIES[nm]?.en || nm))} ${n}`);
      chips.appendChild(c);
    });
    body.appendChild(chips);

    // 개체 목록 — 점이 많은 순 (오래 추적된 것이 볼 것이 많다)
    const list = T.slice().sort((a, b) => b.points - a.points);
    list.forEach((t) => {
      const on = this._shown === t.pttId;
      const row = el('button', 'tt-row' + (on ? ' on' : ''),
        `<i style="background:${colorOf(t.nameKo)}"></i>`
        + `<span><b>🐢 ${esc(ko ? t.nameKo : (SPECIES[t.nameKo]?.en || t.nameKo))}</b>`
        + `<em>${esc(String(t.first?.at || '').slice(0, 10))} ~ ${esc(String(t.last?.at || '').slice(0, 10))}`
        + ` · ${t.points}${ko ? '점' : ' pts'}`
        + `${t.releasedWhere ? ` · ${ko ? '방류' : 'released'} ${esc(t.releasedWhere)}` : ''}</em></span>`);
      row.onclick = () => { this.draw(on ? null : t.pttId); this.render(); };
      body.appendChild(row);
    });

    /* ── 출처 — ⚠️ 제4유형이라 특히 분명히 적는다 ───────────── */
    body.appendChild(el('p', 'sub-legal',
      `${esc(_data.source || '')}${_data.license ? ` · ${esc(_data.license)}` : ''}<br>`
      /* ⚠️ 안내문은 Lambda 가 `**굵게**` 로 적어 보낸다. 그대로 넣으면
         화면에 별표가 그냥 보였다. 먼저 escape 하고 굵게만 되살린다 —
         순서가 반대면 원문의 `<` 가 태그로 살아난다. */
      + esc(ko ? (_data.licenseNote?.ko || '') : (_data.licenseNote?.en || ''))
          .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')));
  },

  /** 지도에 그린다. pttId 가 null 이면 전부.
   *  ⚠️ 좌표를 그대로 잇는다. 매끄럽게 다듬거나 사이를 채우지 않는다 — 그게 '변경'이다. */
  draw(pttId) {
    this.clear();
    this._shown = pttId;
    if (!_data || !window.Cesium || !viewer) return;
    const C = window.Cesium;
    const ko = i18n.lang === 'ko';
    const list = (_data.turtles || []).filter((t) => !pttId || t.pttId === pttId);

    list.forEach((t) => {
      const col = C.Color.fromCssColorString(colorOf(t.nameKo));
      const pts = t.track || [];
      if (pts.length < 2) return;

      /* 경로선 — ⚠️ 전체를 볼 때는 흐리게. 45마리를 진하게 그으면 바다가 안 보인다. */
      this._ents.push(viewer.entities.add({
        polyline: {
          positions: pts.map((p) => C.Cartesian3.fromDegrees(p.lon, p.lat)),
          width: pttId ? 2.4 : 1.4,
          material: col.withAlpha(pttId ? 0.9 : 0.42),
          clampToGround: false,
          arcType: C.ArcType.GEODESIC,
        },
      }));

      /* 🐢 는 **마지막으로 신호가 온 자리**에 둔다.
         ⚠️ "지금 위치"가 아니라 "여기서 추적이 끝났다"는 뜻이다 — 말풍선에 그렇게 적는다. */
      const last = pts[pts.length - 1];
      this._ents.push(viewer.entities.add({
        position: C.Cartesian3.fromDegrees(last.lon, last.lat),
        label: {
          text: '🐢',
          font: `${pttId ? 26 : 18}px sans-serif`,
          verticalOrigin: C.VerticalOrigin.CENTER,
          horizontalOrigin: C.HorizontalOrigin.CENTER,
          // ⚠️ 이모지는 외곽선을 주면 뭉개진다. 그림자만 살짝.
          style: C.LabelStyle.FILL,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        description:
          `<div style="font:14px/1.7 -apple-system,sans-serif">`
          + `<b>🐢 ${esc(t.nameKo || '')}</b>`
          + (t.nameSci ? `<br><i style="opacity:.6">${esc(t.nameSci)}</i>` : '')
          + `<hr style="opacity:.2">`
          + `${ko ? '추적' : 'Tracked'} ${esc(String(t.first?.at || '').slice(0, 10))}`
          + ` ~ ${esc(String(t.last?.at || '').slice(0, 10))} · ${t.points}${ko ? '점' : ' pts'}<br>`
          + (t.releasedWhere ? `${ko ? '방류' : 'Released'} ${esc(t.releasedAt || '')} · ${esc(t.releasedWhere)}<br>` : '')
          + (t.caughtWhere ? `${ko ? '확보' : 'Found'} ${esc(t.caughtAt || '')} · ${esc(t.caughtWhere)}<br>` : '')
          + (t.weightKg ? `${ko ? '몸무게' : 'Weight'} ${esc(t.weightKg)}kg · ${ko ? '길이' : 'Length'} ${esc(t.lengthCm)}cm<br>` : '')
          + `<hr style="opacity:.2">`
          + `<b style="color:#f0a878">⚠️ ${ko
              ? '여기가 <b>추적이 끝난 자리</b>입니다. 지금 이 거북이 여기 있다는 뜻이 아닙니다.'
              : 'This is where tracking ended — not where the turtle is now.'}</b><br>`
          + `<small style="opacity:.6">${esc(_data.source || '')} · ${esc(_data.license || '')}</small>`
          + `</div>`,
      }));
    });

    // 한 마리만 볼 때는 그쪽으로 옮겨 준다
    if (pttId && this._ents.length) {
      try { viewer.flyTo(this._ents[0], { duration: 1.2 }); } catch (_) { /* 실패해도 그림은 그대로 */ }
    }
  },

  clear() {
    if (!viewer) return;
    this._ents.forEach((e) => { try { viewer.entities.remove(e); } catch (_) { } });
    this._ents = [];
  },
};
