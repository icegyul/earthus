// EARTHUS v2-three · 취미 · 바다거북 — 국립해양생물자원관이 추적한 개체들이 어디로 갔나
// 1.0 의 prototype/js/ui-turtle.js 를 ext 규약(ext-scene.js · CONTRACT.md)으로 옮긴 것.
//
// ⚠️⚠️⚠️ **이 자료는 이용 조건이 다른 것들과 다르다.**
//    공공저작물 **제4유형** — 출처표시 + 상업적 이용금지 + 변경금지.
//    → 지켜야 하는 것:
//      · **가공하지 않는다.** 좌표를 그대로 점과 선으로만 그린다 (대권 보간·평활 없음 — ctx.makeLine 은 원자료 점을 그대로 잇는다).
//        ⚠️ 이 자료로 분석 문장을 만들지 않는다 — 그게 곧 '변경'이다.
//      · **유료 기능에 섞지 않는다.** 언제나 무료.
//      · 출처를 화면에 분명히 적는다.
//
// ⚠️⚠️ **실시간이 아니다.** 기관 설명 그대로:
//    "추적이 종료된 수신기에 대해서만 조회합니다."
//    → 화면 맨 위에 그 문장을 적는다. 안 적으면 "지금 여기 있다"로 읽힌다.
//       🐢 는 **마지막으로 신호가 온 자리**다. "지금 위치"가 아니라 "여기서 추적이 끝났다"는 뜻이다.
//
// ⚠️ 성별·성체여부가 **숫자 코드**로 온다(1, 2…). 대조표를 못 받았다 — 추측해서 글자로 바꾸지 않는다. 아예 안 보여준다.

/* 종별 색 — ⚠️ 값을 바꾸는 게 아니라 **구분해 보이게** 하는 것이다.
   경로를 전부 같은 색으로 그리면 45마리가 실뭉치가 된다. */
const SPECIES = {
  푸른바다거북: { c: '#4fd0e0', en: 'Green sea turtle' },
  붉은바다거북: { c: '#f0a878', en: 'Loggerhead' },
  매부리바다거북: { c: '#b9a7f0', en: 'Hawksbill' },
};
const colorOf = (n) => SPECIES[n]?.c || '#9fd8b0';
const nameOf = (ko, t) => (ko ? t.nameKo : (SPECIES[t.nameKo]?.en || t.nameKo));
const day = (s) => String(s || '').slice(0, 10);
const PICK_KM = 60;

/* 안내문은 Lambda 가 `**굵게**` 로 적어 보낸다. 먼저 escape 하고 굵게만 되살린다 —
   순서가 반대면 원문의 `<` 가 태그로 살아난다. */
const bold = (esc, s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const lastOf = (t) => {
  const tr = t.track || [];
  return tr.length ? tr[tr.length - 1] : (t.last && t.last.lat != null ? t.last : null);
};

export default {
  key: 'hobby/turtle',
  title: '바다거북',
  badge: 'HISTORY',

  async load(ctx, state, signal) {
    // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님) — fetchJson 이 HTTP 코드로 throw 한다.
    const d = await ctx.fetchJson(`${ctx.S3}/events/sea-turtle.json`, { signal, cache: 'no-cache' });
    state.data = d;
    state.turtles = Array.isArray(d?.turtles) ? d.turtles : [];
    if (state.shown === undefined) state.shown = null;   // 지금 강조한 pttId (null = 전부 같은 밝기)
    // 카메라 이동 없음 — 전체 보기는 사용자가 보던 자리에서 시작한다
    state.point = null;
  },

  /** 좌표를 그대로 잇는다. 매끄럽게 다듬거나 사이를 채우지 않는다 — 그게 '변경'이다. */
  build(ctx, state) {
    const T = state.turtles || [];
    const sel = state.shown;
    T.forEach((t) => {
      const pts = (t.track || []).filter((p) => p && p.lat != null && p.lon != null);
      if (pts.length < 2) return;
      const on = sel === t.pttId;
      const dim = sel !== null && !on;
      /* 전체를 볼 때는 흐리게. 45마리를 진하게 그으면 바다가 안 보인다. 고른 한 마리만 밝고 굵게. */
      ctx.add(ctx.makeLine(pts, {
        color: colorOf(t.nameKo),
        opacity: on ? 0.95 : (dim ? 0.14 : 0.45),
        width: on ? 2.4 : 1.4,
        lift: on ? 0.0045 : 0.004,
      }));
      /* 🐢 는 **마지막으로 신호가 온 자리**에 둔다 — "여기서 추적이 끝났다". */
      const last = pts[pts.length - 1];
      const lab = ctx.makeLabel('🐢', '#ffffff', { scale: on ? 0.034 : 0.024 });
      if (dim) lab.material.opacity = 0.35;
      ctx.add(ctx.placeLabel(lab, last.lat, last.lon, 0.007));
    });
  },

  card(ctx, state) {
    const { esc } = ctx; const ko = ctx.ko;
    const d = state.data || {}; const T = state.turtles || [];
    const sel = state.shown;
    let h = '';

    /* ── 맨 위: 실시간이 아니라는 문장. 기관 문장 그대로. ─────────── */
    const rt = d.realtimeNote && (ko ? d.realtimeNote.ko : d.realtimeNote.en);
    h += `<div class="tt-warn">`
      + `<b>${ko ? '완료된 추적 경로' : 'Completed tracking routes'}</b>`
      + `<p>${ko
        ? '국립해양생물자원관 · 종료된 수신기 · 개체별 추적 날짜 표시'
        : 'MABIK · completed trackers · dates shown per individual'}</p>`
      + `<p>${rt ? bold(esc, rt)
        : (ko ? '⚠️ 실시간이 아닙니다. "추적이 종료된 수신기에 대해서만 조회합니다" — 이미 끝난 추적의 지나간 경로입니다. 지금 그 자리에 있다는 뜻이 아닙니다.'
              : 'Not live. Only completed trackers are published — these are past routes, not current positions.')}</p>`
      + `<p><small>${ko ? '🐢 = 마지막 수신점 (추적이 끝난 자리)' : '🐢 = last received point (where tracking ended)'}</small></p>`
      + `</div>`;

    if (!T.length) h += `<p class="kr-note">${ko ? '받은 추적 기록 0건' : '0 tracking records received'}</p>`;

    // 종별 요약 — ⚠️ 세는 것은 '변경'이 아니다. 값을 바꾸지 않는다.
    const bySpc = {};
    T.forEach((t) => { bySpc[t.nameKo] = (bySpc[t.nameKo] || 0) + 1; });
    h += `<div class="tt-chips">`
      + `<button class="tt-chip${sel === null ? ' on' : ''}" data-action="ext:turtle" data-id="">${ko ? '전체' : 'All'} ${T.length}</button>`
      + Object.entries(bySpc).map(([nm, n]) =>
        `<span class="tt-chip static"><i style="background:${colorOf(nm)}"></i>${esc(ko ? nm : (SPECIES[nm]?.en || nm))} ${n}</span>`).join('')
      + `</div>`;

    // 개체 목록 — 점이 많은 순 (오래 추적된 것이 볼 것이 많다). 누르면 그 거북만 밝게 + 마지막 수신점으로 이동.
    const list = T.slice().sort((a, b) => (b.points || 0) - (a.points || 0));
    h += list.map((t) => {
      const on = sel === t.pttId;
      return `<button class="tt-row${on ? ' on' : ''}" data-action="ext:turtle" data-id="${esc(t.pttId)}">`
        + `<i style="background:${colorOf(t.nameKo)}"></i>`
        + `<span><b>🐢 ${esc(nameOf(ko, t))}</b>`
        + `<em>${esc(day(t.first?.at))} ~ ${esc(day(t.last?.at))} · ${t.points || 0}${ko ? '점' : ' pts'}`
        + `${t.releasedWhere ? ` · ${ko ? '방류' : 'released'} ${esc(t.releasedWhere)}` : ''}</em></span>`
        + `</button>`;
    }).join('');

    /* ── 출처 — ⚠️ 제4유형이라 특히 분명히 적는다 ───────────── */
    h += `<p class="sub-legal">${esc(d.source || '')}${d.license ? ` · ${esc(d.license)}` : ''}<br>`
      + bold(esc, ko ? (d.licenseNote?.ko || '') : (d.licenseNote?.en || ''))
      + `</p>`;
    return h;
  },

  /** 지구를 눌렀을 때 — 마지막 수신점에서 60 km 안의 거북. 말풍선 문장은 1.0 그대로. */
  pick(ctx, state, lat, lon) {
    const T = state.turtles || [];
    let best = null; let bd = PICK_KM;
    T.forEach((t) => {
      const p = lastOf(t); if (!p) return;
      const dk = ctx.distKm({ lat, lon }, { lat: p.lat, lon: p.lon });
      if (dk < bd) { bd = dk; best = t; }
    });
    if (!best) return null;
    return { title: `🐢 ${nameOf(ctx.ko, best)}`, badge: 'HISTORY', body: this._info(ctx, state, best) };
  },

  _info(ctx, state, t) {
    const { esc } = ctx; const ko = ctx.ko; const d = state.data || {};
    return `<div class="tt-warn">`
      + `<b>🐢 ${esc(t.nameKo || '')}</b>`
      + (t.nameSci ? `<br><i style="opacity:.6">${esc(t.nameSci)}</i>` : '')
      + `<hr style="opacity:.2">`
      + `${ko ? '추적' : 'Tracked'} ${esc(day(t.first?.at))} ~ ${esc(day(t.last?.at))} · ${t.points || 0}${ko ? '점' : ' pts'}<br>`
      + (t.releasedWhere ? `${ko ? '방류' : 'Released'} ${esc(t.releasedAt || '')} · ${esc(t.releasedWhere)}<br>` : '')
      + (t.caughtWhere ? `${ko ? '확보' : 'Found'} ${esc(t.caughtAt || '')} · ${esc(t.caughtWhere)}<br>` : '')
      + (t.weightKg ? `${ko ? '몸무게' : 'Weight'} ${esc(t.weightKg)}kg · ${ko ? '길이' : 'Length'} ${esc(t.lengthCm)}cm<br>` : '')
      + `<hr style="opacity:.2"><b>${ko ? '마지막 수신점 · 완료된 추적' : 'Last received point · tracking ended'}</b><br>`
      + `<small style="opacity:.6">${esc(d.source || '')} · ${esc(d.license || '')}</small>`
      + `</div>`;
  },

  /** 카드 버튼. ext:turtle data-id="" 는 전체 보기. 같은 거북을 다시 누르면 전체로. */
  action(ctx, state, name, ds) {
    if (name !== 'turtle') return null;
    const id = ds?.id ? String(ds.id) : null;
    const next = (!id || state.shown === id) ? null : id;
    state.shown = next;
    const r = { rebuild: true, html: this.card(ctx, state) };
    if (next) {
      const t = (state.turtles || []).find((x) => x.pttId === next);
      const p = t && lastOf(t);
      if (p) r.point = { lat: p.lat, lon: p.lon, altKm: 900 };
    }
    return r;
  },

  close(ctx, state) { state.shown = null; },
};
