// 취미 · 해구 — 1.0 ocean/trenchglobe.js + trenchcards.js 의 자료 부분을 Three.js 로 옮김 (2026-09-06)
//
// 1.0 은 해구 윤곽(footprints)·수심 채색 타일·깊이 HUD 를 Cesium 프리미티브로 그렸다. v2 에는 이미
// 'ocean/trenches'(GEBCO SCUFN 축선, seafloor.js) 가 있으므로 축선은 그 레이어에 맡기고,
// 여기서는 1.0 의 **해구 카드(10곳 + 한국 바다 3장)** 와 위치 점·이름표를 지구 위에 얹는다.
// 자료: /data/trenches.json (1.0 정적 자료, 복사하지 않는다) — items[] {id, name{ko,en}, lat, lon,
//       depthMin, depthMax, depthMethod{ko,en}, note{ko,en}, credit, source, sourceUrl, …}, koreaCards[]
// 원칙: 수심은 자료의 depthMin~depthMax 범위를 그대로 적는다. 하나의 값으로 줄이지 않는다.

const ACCENT = '#57b9d0';

export default {
  key: 'hobby/trench',
  title: '해구',
  badge: 'OBSERVED',

  async load(ctx, state, signal) {
    const j = await ctx.fetchJson('/data/trenches.json', { signal });
    if (!Array.isArray(j.items) || !j.items.length) throw new Error('trenches.json 에 items 가 없습니다');
    state.data = j;
    state.selected = state.selected || null;
    // 처음 켜면 서태평양 해구대가 한 화면에 들어오는 곳으로 (1.0: 145E 8S 17,000km)
    state.point = { lat: -8, lon: 145, altKm: 17000 };
  },

  build(ctx, state) {
    const items = state.data.items;
    ctx.add(ctx.makePoints(items.map((t) => ({ lat: t.lat, lon: t.lon, c: t.id === state.selected ? 0xffffff : 0x57b9d0 })), { size: 8, lift: 0.003 }));
    items.forEach((t) => {
      const lab = ctx.makeLabel(ctx.ko ? t.name.ko : t.name.en, t.id === state.selected ? '#ffffff' : ACCENT, { scale: 0.022 });
      ctx.add(ctx.placeLabel(lab, t.lat, t.lon, 0.006));
    });
  },

  _depth(ctx, t) {
    const ko = ctx.ko;
    if (t.depthMin != null && t.depthMax != null && t.depthMin !== t.depthMax) return `${t.depthMin.toLocaleString()}–${t.depthMax.toLocaleString()} m`;
    const d = t.depthMax ?? t.depthMin;
    return d != null ? `${Number(d).toLocaleString()} m` : (ko ? '수심 미기재' : 'depth not stated');
  },

  card(ctx, state) {
    const ko = ctx.ko; const esc = ctx.esc; const d = state.data;
    const sel = d.items.find((t) => t.id === state.selected);
    const link = (t) => (t.sourceUrl ? `<a href="${esc(t.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t.source || t.credit || 'source')} ↗</a>` : esc(t.source || t.credit || ''));
    const detail = sel ? `<section class="trench-section trench-detail">
        <h4>${esc(ko ? sel.name.ko : sel.name.en)}</h4>
        <p class="trench-depth"><b>${this._depth(ctx, sel)}</b> <small>${esc(ko ? sel.depthMethod?.ko : sel.depthMethod?.en) || ''}</small></p>
        ${sel.note ? `<p class="kr-note">${esc(ko ? sel.note.ko : sel.note.en)}</p>` : ''}
        <p class="sub-legal">${link(sel)}${sel.secondarySourceUrl ? ` · <a href="${esc(sel.secondarySourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(sel.secondarySource || '')} ↗</a>` : ''}</p>
        <p><button type="button" data-action="ext:go" data-id="${esc(sel.id)}">${ko ? '이 해구로 가기' : 'Fly here'}</button>
           <button type="button" data-action="ext:open/hobby/dive">${ko ? 'Dive · 심해로 내려가기' : 'Dive below'}</button></p>
      </section>` : '';
    const list = `<section class="trench-section"><div class="trench-grid">${d.items.map((t) => `
        <button type="button" class="trench-card${t.id === state.selected ? ' on' : ''}" data-action="ext:select" data-id="${esc(t.id)}">
          <b>${esc(ko ? t.name.ko : t.name.en)}</b><span>${this._depth(ctx, t)}</span></button>`).join('')}</div></section>`;
    const korea = Array.isArray(d.koreaCards) && d.koreaCards.length ? `<section class="trench-section"><h4>${ko ? '한국의 바다' : 'Seas around Korea'}</h4>
        ${d.koreaCards.map((c) => `<p class="trench-limit"><b>${esc(ko ? c.name.ko : c.name.en)}</b> · ${ko ? '평균' : 'avg'} ${Number(c.averageDepthM).toLocaleString()} m<br><small>${esc(ko ? c.note?.ko : c.note?.en) || ''}</small></p>`).join('')}
      </section>` : '';
    return `<p class="kr-note">${ko
      ? '지구의 가장 깊은 바다 10곳. 점을 누르거나 목록에서 고르면 그 해구로 갑니다. 축선(GEBCO SCUFN)은 해양 › <b>해구 위치</b> 레이어와 함께 켜면 겹쳐 보입니다.'
      : 'The ten deepest ocean regions. Tap a point or choose from the list. Turn on Ocean › <b>Trench axes</b> (GEBCO SCUFN) to overlay the axes.'}
      <button type="button" data-action="ext:open/ocean/trenches">${ko ? '해구 축선 켜기' : 'Trench axes'}</button></p>
      ${detail}${list}${korea}
      <p class="sub-legal">${esc(ko ? `자료 ${d.schema || ''} · ${d.generated || ''}` : `Data ${d.schema || ''} · ${d.generated || ''}`)}</p>`;
  },

  pick(ctx, state, lat, lon) {
    let best = null; let bd = 400;
    for (const t of state.data.items) { const k = ctx.distKm({ lat, lon }, t); if (k < bd) { bd = k; best = t; } }
    if (!best) return null;
    state.selected = best.id;
    ctx.rebuild();
    return { title: ctx.ko ? best.name.ko : best.name.en, badge: 'OBSERVED', body: this.card(ctx, state) };
  },

  action(ctx, state, name, ds) {
    if (name === 'select' || name === 'go') {
      const t = state.data.items.find((x) => x.id === ds.id);
      if (!t) return { handled: true };
      state.selected = t.id;
      return { html: this.card(ctx, state), rebuild: true, point: { lat: t.lat, lon: t.lon, altKm: name === 'go' ? 650 : 2600 } };
    }
    return null;
  },
};
