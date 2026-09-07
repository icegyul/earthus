// EARTHUS v2-three · 취미 · 철새 — 우리 동네 오리가 봄에 어디로 가나
// 1.0 의 prototype/js/ui-migbird.js 를 ext 규약(ext-scene.js · CONTRACT.md)으로 옮긴 것.
//
// ⚠️⚠️⚠️ **바다거북 같은 경로가 아니다.** 원자료는 한 줄에 출발지 하나, 도착지 하나뿐이다.
//    사이를 이은 선은 **실제로 날아간 길이 아니다.** "여기서 저기로"라는 뜻일 뿐이다.
//    선은 1.0 과 똑같이 세 점 [출발(h 20000m), 가운데(h 260000m), 도착(h 20000m)] 이다 —
//    곡선은 보기 쉬우라고 그은 것이다. 실제 경로가 아니다.
//
// ⚠️⚠️ **도착지에 점을 찍지 않는다.** "중국 지린성"은 남한의 두 배다.
//    점을 찍으면 보는 사람은 거기 갔다고 읽는다 — 없는 정밀도를 지어내는 것이다.
//    → 도착지는 **원**(ctx.makeCircle · 반경 p.r km)으로 그린다. 원이 크다는 건 "이 안 어딘가"라는 뜻이다.
//
// ⚠️ 이용허락범위 제한 없음. 거북(제4유형)과 달리 분석해도 된다.

const n0 = (v) => Number(v || 0).toLocaleString('ko-KR');

/* 종별 색 — ⚠️ 값을 바꾸는 게 아니라 구분해 보이게 하는 것이다. */
const COL = ['#4fd0e0', '#f0a878', '#b9a7f0', '#9fd8b0', '#e0c26a', '#e08fb0', '#8fb8e0'];
const colorOf = (list, name) => COL[Math.max(0, list.indexOf(name)) % COL.length];
const ORIGIN = 0xffd08a;
const DEST = 0x4fd0e0;
const PICK_ORIGIN_KM = 40;

const namesOf = (d) => (d?.species || []).map(([n]) => n);
/** 종·연도 필터를 거친 이동 기록 */
const tripsOf = (state) => (state.data?.trips || [])
  .filter((t) => (!state.spc || t.spc === state.spc) && (!state.yr || String(t.yr) === String(state.yr)));

/* 자리마다 **어떤 새**가 오갔는지도 센다.
   받은 지적: "철새중에 이름이 안나오는것도 있네" — 점·원을 눌렀을 때 종 이름이 없으면 답이 비어 보인다.
   그 자리에 많은 새부터 세 가지, 더 있으면 '외 N종'으로 밝힌다 — 세 개만 적고 말면 나머지가 없는 것처럼 읽힌다. */
const speciesAt = (trips) => {
  const at = {};
  trips.forEach((t) => {
    (at[t.from] ||= {})[t.spc] = (at[t.from][t.spc] || 0) + 1;
    (at[t.to] ||= {})[t.spc] = (at[t.to][t.spc] || 0) + 1;
  });
  return (name, ko) => {
    const e = Object.entries(at[name] || {}).sort((a, b) => b[1] - a[1]);
    if (!e.length) return '';
    const head = e.slice(0, 3).map(([nm, n]) => `${nm} ${n}`).join(' · ');
    return head + (e.length > 3 ? (ko ? ` 외 ${e.length - 3}종` : ` +${e.length - 3}`) : '');
  };
};

export default {
  key: 'hobby/migbird',
  title: '철새',
  badge: 'HISTORY',

  async load(ctx, state, signal) {
    state.data = await ctx.fetchJson(`${ctx.S3}/events/migbird.json`, { signal, cache: 'no-cache' });
    if (state.spc === undefined) state.spc = null;   // 고른 종
    if (state.yr === undefined) state.yr = null;     // 고른 해
    state.point = null;
  },

  build(ctx, state) {
    const d = state.data || {};
    const names = namesOf(d);
    const trips = tripsOf(state);
    const P = {};
    (d.places || []).forEach((p) => { if (p && p.lat != null && p.lon != null) P[p.name] = p; });

    // 이 종·해가 실제로 쓴 곳만 그린다
    const used = new Set();
    trips.forEach((t) => { used.add(t.from); used.add(t.to); });
    const places = (d.places || []).filter((p) => P[p.name] && used.has(p.name));

    /* 출발지 — 시·군 단위라 점으로 찍어도 된다(±12km). 한 무리로. */
    const homes = places.filter((p) => p.home).map((p) => ({ lat: p.lat, lon: p.lon }));
    if (homes.length) ctx.add(ctx.makePoints(homes, { size: 8, color: ORIGIN, opacity: 0.95, lift: 0.0035 }));

    /* ⚠️⚠️ 도착지는 **원**이다. 반경이 곧 "얼마나 모르는가"다. */
    places.filter((p) => !p.home).forEach((p) => {
      ctx.add(ctx.makeCircle(p.lat, p.lon, p.r || 50, { color: DEST, opacity: 0.55, lift: 0.004 }));
    });

    /* 이동 — ⚠️ 곡선은 보기 쉬우라고 그은 것이다. 실제 경로가 아니다.
       양 끝 20 km, 가운데 260 km — 1.0 과 같은 세 점. 지구에 묻히지 않게 띄운 것이고,
       이 선은 실제로 날아간 길이 아니라 "여기서 저기로"를 잇는 표시이므로 띄워도 뜻이 달라지지 않는다.
       ⚠️ 전체(179개)를 진하게 그으면 한국 위가 실뭉치가 된다. 전체일 때는 흐리게, 고르면 진하게. */
    const focused = !!(state.spc || state.yr);
    trips.forEach((t) => {
      const a = P[t.from]; const b = P[t.to];
      if (!a || !b) return;
      ctx.add(ctx.makeLine([
        { lat: a.lat, lon: a.lon, h: 20000 },
        { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2, h: 260000 },
        { lat: b.lat, lon: b.lon, h: 20000 },
      ], { color: colorOf(names, t.spc), opacity: focused ? 0.9 : 0.5, width: focused ? 2.6 : 1.8, lift: 0 }));
    });
  },

  card(ctx, state) {
    const { esc } = ctx; const ko = ctx.ko;
    const d = state.data || {};
    const names = namesOf(d);
    const all = d.trips || [];
    const yrs = d.years || [];
    let h = '';

    h += `<div class="sb-warn">`
      + `<b>${ko ? '이동 기록 표시' : 'Movement record display'}</b>`
      + `<p>${ko
        ? '출발·도착 두 지점을 직선으로 연결 · 도착 범위는 원의 반경으로 표시'
        : 'Departure and arrival joined by a straight line · arrival extent shown as a radius'}</p>`
      + `<p>${ko
        ? '⚠️ 사이를 이은 선은 실제로 날아간 길이 아닙니다 — "여기서 저기로"라는 뜻일 뿐입니다.'
        : '⚠️ The curve is NOT a flown route — it only means "from here to there".'}</p>`
      + `</div>`;

    h += `<div class="sb-sum">`
      + [[n0(all.length), ko ? '이동 기록' : 'movements'],
         [n0((d.species || []).length), ko ? '종' : 'species'],
         [n0(new Set(all.map((t) => t.tag)).size), ko ? '추적기' : 'trackers'],
         [yrs.length ? `${yrs[0][0]}–${yrs[yrs.length - 1][0]}` : '', ko ? '기간' : 'period']]
        .map(([v, k]) => `<div class="sb-cell"><b>${esc(v)}</b><em>${esc(k)}</em></div>`).join('')
      + `</div>`;

    // 종 — 누르면 그 종만 지도에 남는다
    h += `<p class="sb-h">${ko ? '어떤 새가 떠났나' : 'Which birds'}</p><div class="tt-chips">`
      + `<button class="tt-chip${state.spc === null ? ' on' : ''}" data-action="ext:species" data-code="">${ko ? '전체' : 'All'} ${all.length}</button>`
      + (d.species || []).map(([nm, n]) =>
        `<button class="tt-chip${state.spc === nm ? ' on' : ''}" data-action="ext:species" data-code="${esc(nm)}">`
        + `<i style="background:${colorOf(names, nm)}"></i>${esc(nm)} ${n}</button>`).join('')
      + `</div>`;

    // 해 — 누르면 그 해만
    if (yrs.length) {
      h += `<p class="sb-h">${ko ? '어느 해에' : 'Which year'}</p><div class="tt-chips">`
        + `<button class="tt-chip${state.yr === null ? ' on' : ''}" data-action="ext:year" data-year="">${ko ? '전체' : 'All'}</button>`
        + yrs.map(([y, n]) =>
          `<button class="tt-chip${String(state.yr) === String(y) ? ' on' : ''}" data-action="ext:year" data-year="${esc(y)}">${esc(y)} ${n}</button>`).join('')
        + `</div>`;
    }

    // 어디로 갔나 — 도착지 순위 (고른 종·해 기준)
    const trips = tripsOf(state);
    const cnt = {};
    trips.forEach((t) => { cnt[t.to] = (cnt[t.to] || 0) + 1; });
    const rank = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 14);
    const max = rank.length ? rank[0][1] : 1;
    h += `<p class="sb-h">${ko ? '많이 간 곳' : 'Most common destinations'}</p><div class="sb-list">`
      + rank.map(([nm, n]) =>
        `<div class="sb-yrow"><i style="flex:0 0 auto;min-width:0;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nm)}</i>`
        + `<u><b style="width:${(n / max * 100).toFixed(0)}%"></b></u>`
        + `<s style="flex:0 0 34px">${n}</s></div>`).join('')
      + `</div>`;
    if (!trips.length) h += `<p class="kr-note">${ko ? '이 조건의 이동 기록 0건' : '0 movements for this filter'}</p>`;

    h += `<p class="sub-legal">${esc(d.source || '')} · ${esc(d.license || '')}<br>`
      + esc(ko ? (d.note?.ko || '') : (d.note?.en || '')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
      + `</p>`;
    return h;
  },

  /** 지구를 눌렀을 때 — 출발지는 40 km, 도착 원은 그 반경 안. 종 이름을 반드시 같이 적는다. */
  pick(ctx, state, lat, lon) {
    const { esc } = ctx; const ko = ctx.ko; const d = state.data || {};
    const trips = tripsOf(state);
    const used = new Set(); trips.forEach((t) => { used.add(t.from); used.add(t.to); });
    const birdsAt = speciesAt(trips);
    let best = null; let bd = Infinity;
    (d.places || []).filter((p) => p && p.lat != null && used.has(p.name)).forEach((p) => {
      const dk = ctx.distKm({ lat, lon }, { lat: p.lat, lon: p.lon });
      const lim = p.home ? PICK_ORIGIN_KM : (p.r || 50);
      if (dk <= lim && dk / lim < bd) { bd = dk / lim; best = p; }
    });
    if (!best) return null;
    const p = best; const birds = birdsAt(p.name, ko);
    const body = p.home
      ? `<div class="sb-warn"><b>${esc(p.name)}</b>`
        + `<p>${ko ? '여기서 떠난 기록' : 'Departures'} ${p.n}${ko ? '건' : ''}${birds ? ` · ${esc(birds)}` : ''}</p></div>`
      : `<div class="sb-warn"><b>${esc(p.name)}</b>`
        + `<p>${ko ? '도착 기록' : 'Arrivals'} ${p.n}${ko ? '건' : ''}${birds ? ` · ${esc(birds)}` : ''}</p>`
        /* ⚠️ 반경을 반드시 같이 말한다. 원 이름만 읽으면 '거기 갔다'로 들린다. */
        + `<p><b>${ko ? `도착 범위 · 반경 약 ${p.r}km` : `Arrival extent · radius ~${p.r} km`}</b> — ${ko
          ? '이 안 어딘가라는 뜻이지 가운데에 갔다는 뜻이 아닙니다'
          : 'somewhere inside this circle, not its centre'}</p></div>`;
    return {
      title: p.name,
      badge: 'HISTORY',
      body: body + `<p class="sub-legal">${esc(d.source || '')} · ${esc(d.license || '')}</p>`,
    };
  },

  action(ctx, state, name, ds) {
    if (name === 'species') {
      const code = ds?.code ? String(ds.code) : null;
      state.spc = (!code || state.spc === code) ? null : code;
      return { rebuild: true, html: this.card(ctx, state) };
    }
    if (name === 'year') {
      const y = ds?.year ? String(ds.year) : null;
      state.yr = (!y || String(state.yr) === y) ? null : y;
      return { rebuild: true, html: this.card(ctx, state) };
    }
    return null;
  },

  close(ctx, state) { state.spc = null; state.yr = null; },
};
