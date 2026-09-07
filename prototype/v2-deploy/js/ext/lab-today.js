// LAB · 오늘의 지구 — 1.0 ui-community.js renderToday 의 이식 (v2-three ext 규약)
//
// 자료는 1.0 의 /js/today.js 를 그대로 빌려 쓴다 (`today.build()`).
//   ⚠️ today.build() 는 안에서 gridoverlay.js → viewer.js 를 끌어오지만, 둘 다 모듈
//      최상위에서는 Cesium 을 만지지 않는다 (viewer 는 initViewer 전까지 undefined).
//      격자 JSON 을 받아 최댓값·최솟값을 찾는 부분만 쓰인다.
//   ⚠️ today.counts() 는 못 쓴다 — 1.0 의 layers/registry.js(pointLayers) 에 이미
//      **켜진 레이어의 항목 수**를 세는 함수라, v2 에서는 항목이 하나도 없다.
//      대신 같은 원자료(wildfire.json · USGS all_day · buoys.json)를 직접 세어 같은 문구로 적는다.
//      지상관측소·폭풍은 1.0 이 여러 파일과 필터를 거쳐 세므로 여기서는 세지 않는다(없다고 지어내지 않는다).
//
// ⚠️ 1.0 과 같은 원칙: 숫자는 전부 격자에서 찾은 값이다. 형용사를 붙이지 않는다.
//    산불·지진은 "가장 큰"이 아니라 "지금 몇 건"으로만 적는다.

const PICK_COLOR = {
  wave: 0x5fb8ff, sst: 0xff7a5c, sstc: 0x8fd0ff, temp: 0xff9f45, cold: 0xa8c8ff,
  wind: 0x7ee0a0, dust: 0xd9b66b, uv: 0xc9a8ff, fog: 0xcfd8e0,
};
const PICK_CSS = {
  wave: '#5fb8ff', sst: '#ff7a5c', sstc: '#8fd0ff', temp: '#ff9f45', cold: '#a8c8ff',
  wind: '#7ee0a0', dust: '#d9b66b', uv: '#c9a8ff', fog: '#cfd8e0',
};
const DAY_MS = 24 * 3600_000;

/** 지금 진행 중인 사건 — 순위 없이 "지금 몇 건". 1.0 today.counts() 와 같은 문구·같은 기준. */
async function counts(ctx, signal) {
  const ko = ctx.ko;
  let API = null;
  try { API = (await ctx.v1('config.js')).API; } catch (_) { API = null; }
  if (!API) return [];
  const jobs = [
    { id: 'wildfire', label: ko ? '위성이 보는 산불' : 'Fires seen from orbit',
      run: async () => (await ctx.fetchJson(`${API.EVENTS}/wildfire.json`, { signal, cache: 'no-cache' })).items?.length },
    { id: 'quake', label: ko ? '오늘 지진' : 'Quakes today',
      /* 1.0 layers/hazard.js 와 같은 거름: M2.5 이상 · 24시간 안 */
      run: async () => {
        const j = await ctx.fetchJson(API.QUAKE_DAY, { signal, timeout: 25000 });
        const now = Date.now();
        return (j.features || []).filter((f) => f.properties?.mag != null && f.properties.mag >= 2.5
          && now - f.properties.time <= DAY_MS).length;
      } },
    { id: 'buoy', label: ko ? '살아있는 해양 부이' : 'Reporting ocean buoys',
      run: async () => (await ctx.fetchJson(`${API.OCEAN}/buoys.json`, { signal, cache: 'no-cache' })).buoys?.length },
  ];
  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const rows = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && Number.isFinite(r.value) && r.value > 0) rows.push({ id: jobs[i].id, label: jobs[i].label, n: r.value });
  });
  return rows;
}

export default {
  key: 'lab/today',
  title: '오늘의 지구',
  badge: 'DERIVED',

  async load(ctx, state, signal) {
    state.ko = ctx.ko;
    const { today } = await ctx.v1('today.js');
    const [picks, cnt] = await Promise.all([
      today.build(),                                   // 실패는 throw → 런타임이 UNAVAILABLE 카드
      counts(ctx, signal).catch(() => []),
    ]);
    if (signal?.aborted) return;
    state.data = { picks: Array.isArray(picks) ? picks : [], counts: cnt };
  },

  build(ctx, state) {
    const picks = state.data?.picks || [];
    if (!picks.length) return;
    ctx.add(ctx.makePoints(picks.map((p) => ({ lat: p.lat, lon: p.lon, c: PICK_COLOR[p.id] ?? 0xffffff })), { size: 7, opacity: 0.95 }));
    picks.forEach((p) => {
      const spr = ctx.makeLabel(`${p.title} ${p.value}`, PICK_CSS[p.id] || '#cfe0ee', { scale: 0.022 });
      ctx.add(ctx.placeLabel(spr, p.lat, p.lon));
    });
  },

  card(ctx, state) {
    const ko = ctx.ko; const esc = ctx.esc;
    const d = state.data;
    if (!d) return `<p class="sky-dim">${ko ? '불러오는 중…' : 'Loading…'}</p>`;
    const { picks, counts: cnt } = d;
    let html = '';

    if (cnt?.length) {
      html += `<div class="td-counts">${cnt.map((c) =>
        `<div class="td-count"><b>${c.n.toLocaleString()}</b><span>${esc(c.label)}</span></div>`).join('')}</div>`;
    }

    if (!picks?.length) {
      return html + `<p class="sky-note">${ko
        ? '격자 자료 연결 대기 · 잠시 뒤 다시 열어 주세요.'
        : 'Grid data pending · try again shortly.'}</p>`;
    }

    html += picks.map((p, i) => {
      /* 왼쪽에 그 자리의 위성 지형도 한 조각 (NASA GIBS 정적 basemap · today.js/geoname miniMap).
         ⚠️ loading="lazy" 필수 · 이미지가 실패해도 카드는 그대로 읽힌다 — onerror 로 조용히 숨긴다. */
      const m = p.map;
      const thumb = m
        ? `<span class="td-map"><img src="${esc(m.url)}" alt="" loading="lazy" decoding="async"
             style="width:${Number(m.tile) || 200}px;height:${Number(m.tile) || 200}px;left:${Number(m.left) || 0}px;top:${Number(m.top) || 0}px"
             onerror="this.parentNode.classList.add('td-map-off')"><i></i></span>`
        : '';
      return `<button class="td-card" type="button" data-action="ext:go" data-i="${i}" data-lat="${p.lat}" data-lon="${p.lon}">
        ${thumb}
        <span class="td-body">
          <span class="td-t">${esc(p.title)}</span>
          <span class="td-v">${esc(p.value)}</span>
          <span class="td-p">${esc(p.place)}</span>
          ${p.coord ? `<span class="td-c">${esc(p.coord)}</span>` : ''}
        </span></button>`;
    }).join('');

    const t = String(picks[0]?.time || '').replace('T', ' ').replace(':00:00Z', ' UTC');
    html += `<p class="sky-note">${ko
      ? `자료 시각 ${esc(t)} · 5° 격자(약 550km)에서 찾은 값입니다. 눌러 보면 그 자리로 갑니다.<br/> 격자 해상도 안에서의 최댓값이라, 더 좁은 곳의 극값은 이보다 클 수 있습니다.`
      : `Data time ${esc(t)} · found on a 5° grid (~550 km). Tap to fly there.<br/> These are extremes at grid resolution; a smaller area may hold a higher value.`}</p>`;
    return html;
  },

  pick(ctx, state, lat, lon) {
    const picks = state.data?.picks || [];
    let best = null;
    picks.forEach((p) => {
      const d = ctx.distKm({ lat, lon }, { lat: p.lat, lon: p.lon });
      if (d < 400 && (!best || d < best.d)) best = { p, d };
    });
    if (!best) return null;
    const p = best.p;
    return {
      title: p.title, badge: 'DERIVED',
      body: `<div class="td-v">${ctx.esc(p.value)}</div><div class="td-p">${ctx.esc(p.place)}</div>${p.coord ? `<div class="td-c">${ctx.esc(p.coord)}</div>` : ''}`,
    };
  },

  action(ctx, state, name, ds) {
    if (name !== 'go') return null;
    const lat = Number(ds.lat); const lon = Number(ds.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { handled: true };
    return { point: { lat, lon, altKm: 2600 } };
  },
};
