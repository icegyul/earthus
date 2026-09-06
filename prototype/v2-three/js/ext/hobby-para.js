/* 취미 · 패러글라이딩 — 바람과 구름 밑면 (v2-three ext 모듈)
 *
 * 1.0 의 ui-para.js(카드) + para.js(자료·판정) 이식. 규약은 ext/CONTRACT.md.
 *   · 판정(windBand · BAND_KO/EN · dir16 · PARA_RULES · 구름 밑면 Espy 근사)과
 *     Open-Meteo 점 예보(para.now)는 1.0 의 /js/para.js 를 **그대로 빌려 쓴다**.
 *   · ⚠️ para.load() 는 상대경로 'data/para.json' 을 부르므로 v2 페이지에서는 404 다.
 *     그래서 활공장 목록은 여기서 /data/para.json 을 절대경로로 받아 para.list 에 채운다.
 *   · 지구 위 표시(점·이름표)와 카드는 Three.js 규약으로 새로 썼다.
 *
 * ⚠️⚠️ **"날기 좋다"고 말하지 않는다.** 이륙 가능 여부는 등급·날개·경험에 달렸고,
 *    무엇보다 이륙장이 어느 쪽을 보는지 자료에 없다. 값을 옮기고 구간만 말한다.
 * ⚠️⚠️ **좌표는 산 정상이지 이륙장이 아니다.** 찾아가는 좌표로 쓰면 안 된다.
 */

const SRC = '/data/para.json';
const LABEL_GAP_KM = 38;   // 1.0 과 같다 — 780km 상공 기준 이름표 간격
const PICK_KM = 20;        // 지구를 눌렀을 때 이 안의 활공장만 답한다
const ZOOM_ALT_KM = 780;   // 1.0 ZOOM_M — 한반도가 통째로 들어오는 높이
const FOCUS_ALT_KM = 60;

/* 1.0 ui-para.js 의 BAND_COLOR. ⚠️ 색이 말하는 것은 **바람 구간**뿐이다 */
const BAND_COLOR = {
  light: '#8fb8c8', ok: '#7fd8a8', brisk: '#f2c15a',
  strong: '#f0955a', danger: '#e8556a',
};
const NO_DATA_COLOR = '#b9a7f0';   // 1.0 핀 색 — 바람 자료가 없는 자리

const v = (x, d = 1) => (x == null ? '—' : Number(x).toFixed(d));

function center(list) {
  if (!list.length) return null;
  return { lat: list.reduce((s, b) => s + b.lat, 0) / list.length,
           lon: list.reduce((s, b) => s + b.lon, 0) / list.length };
}

function nowOf(state, s) { return state.now?.get(s.name) || null; }

/* ── 카드 조각 ──────────────────────────────────────────────── */
function siteCard(ctx, state, s, { detail = false } = {}) {
  const { esc, ko } = ctx;
  const M = state.mod;
  const n = nowOf(state, s);
  const on = state.sel === s.name;
  const head = `
    <header>
      <h4>${esc(s.name)}</h4>
      <span class="mt-alt">${esc(s.peak || '')}${s.alt ? ` ${Math.round(s.alt)}m` : ''}${
        s.km != null ? ` · ${s.km}km` : ''}</span>
    </header>`;
  const focusBtn = detail ? '' :
    `<button class="mt-trailbtn" data-action="ext:focus" data-site="${esc(s.name)}">${
      on ? (ko ? '지도에서 보는 중' : 'Viewing on globe') : (ko ? '지도에서 보기' : 'View on globe')}</button>`;

  if (!n) {
    return `<article class="mt-card${on ? ' sf-hit' : ''}" data-pg-site="${esc(s.name)}">${head}
      <p class="sf-none">${ko ? '이 지점의 바람 자료가 없습니다' : 'No wind data'}</p>
      ${focusBtn}</article>`;
  }
  const band = M.windBand(n.wind);
  const gustGap = (n.gust != null && n.wind != null) ? n.gust - n.wind : null;

  /* ⚠️⚠️ 돌풍 차이를 **따로** 말한다. 평균 풍속보다 이게 더 위험하다 —
     4m/s 평균에 돌풍 12m/s 면 날개가 접힌다. */
  let gustLine = '';
  if (gustGap != null) {
    const R = M.PARA_RULES;
    const cls = gustGap >= R.gustDanger ? 'danger' : gustGap >= R.gustWatch ? 'watch' : 'low';
    gustLine = `<p class="pg-gust ${cls}">${ko
      ? `돌풍 <b>${v(n.gust)}m/s</b> — 평균보다 <b>${v(gustGap)}m/s</b> 높습니다`
      : `Gusts ${v(n.gust)} m/s — ${v(gustGap)} m/s above mean`}${
      gustGap >= R.gustDanger
        ? (ko ? '. 날개가 접힐 수 있는 차이입니다.' : '. Enough to collapse a wing.') : ''}</p>`;
  }

  return `<article class="mt-card${on ? ' sf-hit' : ''}" data-pg-site="${esc(s.name)}">
    ${head}
    <div class="pg-band ${band}">
      <div class="pg-w"><span class="n">${v(n.wind)}</span><i>m/s</i>
        <em>${esc(M.dir16(n.dir, ko))}</em></div>
      <p>${esc(ko ? M.BAND_KO[band] : M.BAND_EN[band])}</p>
    </div>
    ${gustLine}
    <div class="sf-trio">
      <div class="sf-cell">
        <span class="k">${ko ? '구름 밑면' : 'Cloud base'}</span>
        <span class="n">${n.base == null ? '—' : n.base}<i>m</i></span>
        <span class="s">${ko ? '지면 기준' : 'AGL'}</span>
      </div>
      <div class="sf-cell">
        <span class="k">${ko ? '기온' : 'Temp'}</span>
        <span class="n">${v(n.temp)}<i>°</i></span>
        <span class="s">${ko ? `이슬점 ${v(n.dew)}°` : `dew ${v(n.dew)}°`}</span>
      </div>
      <div class="sf-cell">
        <span class="k">${ko ? '하늘' : 'Cloud'}</span>
        <span class="n">${n.cloud == null ? '—' : Math.round(n.cloud)}<i>%</i></span>
        <span class="s">${n.rain ? (ko ? `비 ${v(n.rain)}mm` : `rain ${v(n.rain)}mm`) : ''}</span>
      </div>
    </div>
    <p class="pg-note">${ko ? '풍속 기준 높이 · <b>지상 10m</b>' : 'Wind reference height · <b>10 m AGL</b>'}${
      n.at ? ` · ${esc(n.at)}` : ''}</p>
    ${focusBtn}
  </article>`;
}

function howCard(ctx, state) {
  const R = state.mod.PARA_RULES;
  if (!ctx.ko) {
    return `<div class="mt-foot">
      <p>Inputs · 10 m wind · gust · cloud base · temperature</p>
      <p>Wind bands (our display bands, not an association rule) · under ${R.lightMs} m/s light ·
         ${R.lightMs}–${R.okHiMs} commonly quoted band · ${R.okHiMs}–${R.strongMs} brisk ·
         over ${R.strongMs} strong · over ${R.dangerMs} most pilots stand down</p>
      <p>Gust flag · ${R.gustDanger} m/s or more above the mean</p>
      <p>Cloud base approximation · (temp − dew point) × 125 m (Espy) — off by hundreds of metres in practice</p>
    </div>`;
  }
  return `<div class="mt-foot">
    <p><b>바람 표시 구간</b> (우리가 정한 표시 구간 — 협회 공식 기준이 아닙니다)<br>
      ${R.lightMs}m/s 미만 — 약함, 이륙이 어려울 수 있음<br>
      ${R.lightMs}~${R.okHiMs}m/s — 흔히 말하는 적정 구간<br>
      ${R.okHiMs}~${R.strongMs}m/s — 센 편<br>
      ${R.strongMs}m/s 이상 — 강함<br>
      ${R.dangerMs}m/s 이상 — 대부분 비행을 접음</p>
    <p>돌풍 경계 · 평균보다 ${R.gustDanger}m/s 이상 높을 때 강조</p>
    <p>구름 밑면 근사 · (기온−이슬점) × 125m (Espy) — 근사라 실제와 수백 m 어긋납니다</p>
    <p>풍속 기준 높이 · <b>지상 10m</b> · 산 위 이륙장의 바람은 지형이 조이고 돌려 이것과 다릅니다</p>
  </div>`;
}

function foot(ctx, state) {
  const { esc, ko } = ctx;
  const m = state.meta || {};
  return `<div class="mt-foot">
    <p>${ko ? '위치 OpenStreetMap (ODbL) · 바람 Open-Meteo'
            : 'Locations: OpenStreetMap (ODbL) · Wind: Open-Meteo'}</p>
    ${m.generated ? `<p>${ko ? '목록 시각' : 'List time'} · ${esc(m.generated)}</p>` : ''}
    ${m.note ? `<p><small>${esc(ko ? m.note.ko : m.note.en)}</small></p>` : ''}
  </div>`;
}

export default {
  key: 'hobby/para',
  title: '패러글라이딩',
  badge: 'MODEL',

  async load(ctx, state, signal) {
    state.tab = state.tab || 'near';
    const mod = await ctx.v1('para.js');
    state.mod = mod;
    const j = await ctx.fetchJson(SRC, { signal, cache: 'force-cache' });
    const list = (j.sites || []).map(s => ({
      name: s.n, peak: s.peak, lat: s.la, lon: s.lo, alt: s.alt ?? null,
    }));
    if (!list.length) throw new Error(ctx.ko ? '활공장 목록이 비었습니다' : 'Site list is empty');
    /* 1.0 para 객체에 목록을 채워 둔다 — now() 가 이름으로 값을 잇는다 */
    if (!mod.para.list.length) mod.para.list = list.slice();
    mod.para.meta = mod.para.meta || { generated: j.generated, note: j.note, source: j.source, count: list.length };
    state.meta = { generated: j.generated, note: j.note, source: j.source, count: list.length };

    /* ⚠️ 활공장은 몇 십 곳뿐이라 **전부** 받는다. 가까운 것만 고르면 "왜 저기는 안 나오지"가 된다.
       거리는 내 위치가 아니라 **지금 보는 자리**(카메라) 기준 — v2 에는 myLocation 이 없다. */
    let cam = null;
    try { cam = ctx.cam(); } catch (_) { cam = null; }
    state.sites = list.map(s => ({ ...s, km: cam ? Math.round(ctx.distKm(cam, s)) : null }));
    if (cam) state.sites.sort((a, b) => a.km - b.km);

    await mod.para.now(state.sites);          // 실패한 지점은 조용히 빠진다 — 카드가 "자료 없음"을 적는다
    if (signal?.aborted) throw new Error('aborted');
    state.now = mod.para._now;
    state.data = state.sites;
    const c = center(state.sites);
    if (c) state.point = { lat: c.lat, lon: c.lon, altKm: ZOOM_ALT_KM };
  },

  build(ctx, state) {
    const list = state.sites || [];
    if (!list.length) return;
    const M = state.mod;
    const pts = list.map(s => {
      const n = nowOf(state, s);
      const band = n ? M.windBand(n.wind) : null;
      return { lat: s.lat, lon: s.lon, c: BAND_COLOR[band] || NO_DATA_COLOR };
    });
    ctx.add(ctx.makePoints(pts, { size: 9, opacity: 0.95 }));

    /* 이름표 — 1.0 과 같이 북쪽부터 훑으며 LABEL_GAP_KM 안에 이미 이름표가 있으면 붙이지 않는다.
       배경색 대신 글자색이 바람 구간이다. 고른 활공장은 간격과 상관없이 붙인다. */
    const ordered = [...list].sort((a, b) => b.lat - a.lat);
    const labeled = [];
    ordered.forEach(s => {
      const far = labeled.every(p => ctx.distKm(p, s) >= LABEL_GAP_KM);
      if (!far && state.sel !== s.name) return;
      labeled.push(s);
      const n = nowOf(state, s);
      const band = n ? M.windBand(n.wind) : null;
      const bits = [];
      if (n?.wind != null) bits.push(`${n.wind.toFixed(1)}m/s`);
      if (n?.dir != null) bits.push(M.dir16(n.dir, ctx.ko));
      const text = s.name.replace(' 활공장', '') + (bits.length ? '  ' + bits.join(' ') : '');
      try {
        ctx.add(ctx.placeLabel(ctx.makeLabel(text, BAND_COLOR[band] || NO_DATA_COLOR), s.lat, s.lon));
      } catch (_) { /* DOM 이 없으면 이름표는 생략 */ }
    });
  },

  card(ctx, state) {
    const { ko } = ctx;
    const list = state.sites || [];
    const tabs = [['near', ko ? '활공장' : 'Sites'], ['how', ko ? '읽는 법' : 'How to read']]
      .map(([k, t]) => `<button class="mt-tab${state.tab === k ? ' on' : ''}" data-action="ext:tab" data-tab="${k}">${t}</button>`)
      .join('');
    if (state.tab === 'how') return `<div class="mt-tabs">${tabs}</div>${howCard(ctx, state)}${foot(ctx, state)}`;

    const withWind = list.filter(s => nowOf(state, s)).length;
    const sel = state.sel ? list.find(s => s.name === state.sel) : null;
    const rest = sel ? list.filter(s => s.name !== sel.name) : list;
    return `
      <div class="mt-tabs">${tabs}</div>
      <p class="mt-times">${ko
        ? `활공장 <b>${list.length}곳</b> · 바람 자료 ${withWind}곳 · Open-Meteo 예보(모델값)`
        : `<b>${list.length}</b> sites · wind on ${withWind} · Open-Meteo forecast (model)`}</p>
      <div class="pg-warn">${ko
        ? '좌표 기준 · <b>산 정상</b> · 이륙장 위치·방향은 현장 정보 확인'
        : 'Coordinate basis · <b>summit</b> · check local launch position and direction'}</div>
      ${list.length && list[0].km != null ? `<p class="mt-note">${ko
        ? '거리는 지금 보는 자리 기준입니다'
        : 'Distances are from the current view centre'}</p>` : ''}
      <div class="mt-list">${sel ? siteCard(ctx, state, sel) : ''}${rest.map(s => siteCard(ctx, state, s)).join('')}</div>
      ${foot(ctx, state)}`;
  },

  pick(ctx, state, lat, lon) {
    const list = state.sites || [];
    let best = null, bd = Infinity;
    list.forEach(s => { const d = ctx.distKm({ lat, lon }, s); if (d < bd) { bd = d; best = s; } });
    if (!best || bd > PICK_KM) return null;
    state.sel = best.name;
    return { title: best.name, badge: 'MODEL', body: siteCard(ctx, state, best, { detail: true }) };
  },

  action(ctx, state, name, ds) {
    if (name === 'tab') {
      state.tab = ds.tab === 'how' ? 'how' : 'near';
      return { html: this.card(ctx, state), inPlace: true };
    }
    if (name === 'focus') {
      const s = (state.sites || []).find(x => x.name === ds.site);
      if (!s) return { handled: true };
      state.sel = s.name;
      return {
        point: { lat: s.lat, lon: s.lon, altKm: FOCUS_ALT_KM },
        rebuild: true,
        html: this.card(ctx, state), inPlace: true,
      };
    }
    return null;
  },

  close(ctx, state) { state.sel = null; },
};
