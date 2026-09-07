// EARTHUS v2-three — ext · Dive · 심해 (hobby/dive)
//
// 1.0 의 심해 탐사 조종 화면(/js/ocean/divescene.js)을 intel 카드 안에 그대로 띄운다.
//   · divescene.js · depth.js · obis.js 는 Cesium 을 모르므로 ctx.v1 로 빌려 쓴다.
//   · v2 에는 장면 관리자가 없다. card() 가 1.0 <section data-scene-view="ocean"> 의
//     id 들(oceanSceneIntro · diveExperience …)을 그대로 내놓고, afterRender 가 그 위에
//     divescene.build() 를 얹는다 (build 가 안쪽 마크업을 통째로 바꾼다).
//   · divescene.init() 은 부르지 않는다 — document 전역 keydown/visibilitychange 를 매번
//     덧붙이고 root 를 한 번만 잡기 때문에 카드가 다시 그려질 때마다 새 DOM 에 못 붙는다.
//     대신 root 범위 바인딩만 여기서 다시 건다 (mountLite). 빠진 것: 배경 드래그·휠로 수심
//     바꾸기(카드 스크롤과 충돌), 전역 화살표 키(슬라이더에 초점을 주면 화살표가 된다).
//   · "특집 잠수" = /data/trenches.json items[0] (1.0 trenchcards.openFeaturedDive 와 같다).
//   · 수심은 GEBCO 0.1° 셀 최심값 기반 정보 제품. 육지 셀이면 육지라고 쓰고 잠수하지 않는다.
//     값을 만들지 않는다.

const TRENCHES_URL = '/data/trenches.json';
const DIVE_ALT_KM = 1800;
const CSS_ID = 'hobby-dive-css';

let mods = null;            // { diveScene, oceanDepth, i18n } — 1.0 모듈
let docBound = false;       // visibilitychange 는 한 번만

const num = (v) => Number(v).toLocaleString();
const nameOf = (ctx, loc) => {
  if (!loc) return '';
  if (loc.name && typeof loc.name === 'object') return loc.name[ctx.ko ? 'ko' : 'en'] || loc.name.ko || loc.name.en || '';
  if (typeof loc.name === 'string' && loc.name) return loc.name;
  return ctx.ko ? '이 지점의 심해' : 'Deep ocean at this point';
};
const sameLoc = (a, b) => !!a && !!b && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;
const fmtLL = (lat, lon) => `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(3)}°${lon < 0 ? 'W' : 'E'}`;

async function v1mods(ctx) {
  if (mods) return mods;
  const [a, b, c] = await Promise.all([ctx.v1('ocean/divescene.js'), ctx.v1('ocean/depth.js'), ctx.v1('i18n.js')]);
  mods = { diveScene: a.diveScene, oceanDepth: b.oceanDepth, i18n: c.i18n };
  return mods;
}

function locFromTrench(item, kind = 'trench') {
  return { lat: Number(item.lat), lon: Number(item.lon), name: item.name, id: item.id, kind };
}

function setLocation(st, loc) {
  st.location = loc;
  st.depth = null; st.depthError = null;
  st.point = { lat: loc.lat, lon: loc.lon, altKm: DIVE_ALT_KM };
}

/** GEBCO 격자 한 점. 실패해도 throw 하지 않는다 — 카드가 "연결 실패" 라고 쓴다. */
async function probeDepth(ctx, st, loc) {
  try {
    const { oceanDepth } = await v1mods(ctx);
    const d = await oceanDepth.query(loc.lat, loc.lon);
    if (sameLoc(st.location, loc)) { st.depth = d; st.depthError = null; }
    return d;
  } catch (e) {
    if (sameLoc(st.location, loc)) { st.depth = null; st.depthError = e?.message || String(e); }
    return null;
  }
}

function depthLine(ctx, st) {
  const d = st.depth;
  if (d) {
    return d.isOcean
      ? (ctx.ko ? `해저 ${num(d.depthM)} m · GEBCO 2026 0.1° 셀 최심값 · 실측 아님` : `Seafloor ${num(d.depthM)} m · GEBCO 2026 0.1° cell deepest value · not a sounding`)
      : (ctx.ko ? `이 격자 셀은 육지(고도 ${num(d.elevationM)} m)로 분류 — 잠수하지 않습니다` : `This grid cell is land (elevation ${num(d.elevationM)} m) — no dive`);
  }
  if (st.depthError) return ctx.ko ? '수심 자료 연결 실패 — 값을 만들지 않습니다' : 'Depth data unavailable — nothing is fabricated';
  return ctx.ko ? 'GEBCO 격자 읽는 중…' : 'Reading the GEBCO grid…';
}

/* divescene.bind() 의 root 범위 부분만 다시 건다 (document 전역 리스너는 걸지 않는다). */
function mountLite(diveScene, host, st) {
  diveScene.root = host;
  diveScene.build();
  diveScene.canvas = host.querySelector('#diveCanvas');
  diveScene.slider = host.querySelector('#diveSlider');
  diveScene.slider?.addEventListener('input', () => diveScene.setDepth(Number(diveScene.slider.value)));
  host.querySelectorAll('[data-dive-home]').forEach((b) => { b.disabled = true; b.tabIndex = -1; });
  host.querySelector('[data-dive-help]')?.addEventListener('click', () => diveScene.openDrawer('help'));
  host.querySelectorAll('[data-dive-evidence]').forEach((b) => b.addEventListener('click', () => diveScene.openDrawer('evidence')));
  host.querySelectorAll('[data-dive-drawer-close]').forEach((b) => b.addEventListener('click', () => diveScene.closeDrawers()));
  host.querySelector('[data-specimen-prev]')?.addEventListener('click', () => diveScene.shiftSpecimen(-1));
  host.querySelector('[data-specimen-next]')?.addEventListener('click', () => diveScene.shiftSpecimen(1));
  host.querySelectorAll('[data-dive-control]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.diveControl;
    if (a === 'down') diveScene.move(1);
    else if (a === 'up') diveScene.move(-1);
    else if (a === 'pause') diveScene.pause();
    else if (a === 'speed') diveScene.cycleSpeed();
    else if (a === 'reset') { diveScene.pause(); diveScene.setDepth(0); }
  }));
  st.ro?.disconnect();
  const rail = host.querySelector('.od-depth-rail');
  if (rail && typeof ResizeObserver !== 'undefined') { st.ro = new ResizeObserver(() => diveScene.draw()); st.ro.observe(rail); }
  if (!docBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) mods?.diveScene?.pause(); });
    docBound = true;
  }
}

async function mount(ctx, st, root, host, seq) {
  const loc = st.location;
  const { diveScene, i18n } = await v1mods(ctx);
  if (seq !== st.mountSeq || !host.isConnected) return;
  i18n.lang = ctx.ko ? 'ko' : 'en';          // 1.0 모듈이 보는 언어를 v2 와 맞춘다 (emit 은 하지 않는다)
  const prevDepth = (diveScene.data && sameLoc(diveScene.location, loc)) ? diveScene.current : null;
  await diveScene.ensureStyles();
  if (seq !== st.mountSeq || !host.isConnected) return;
  diveScene.pause();
  mountLite(diveScene, host, st);
  await diveScene.open({ lat: loc.lat, lon: loc.lon, name: nameOf(ctx, loc) });
  if (seq !== st.mountSeq) return;
  if (diveScene.data) {
    st.depth = diveScene.data; st.depthError = null;
    if (prevDepth != null) diveScene.setDepth(prevDepth);   // 카드가 다시 그려져도 가상 수심을 잃지 않는다
  } else {
    // open() 은 육지·연결 실패를 #diveSource 문장으로만 알린다 — 카드 머리에도 같은 사실을 쓴다
    const d = await probeDepth(ctx, st, loc);
    if (seq !== st.mountSeq) return;
    if (d && !d.isOcean) { host.hidden = true; const intro = root.querySelector('#oceanSceneIntro'); if (intro) intro.hidden = false; }
  }
  const line = root.querySelector('[data-dive-depthline]');
  if (line) line.textContent = depthLine(ctx, st);
  const intro = root.querySelector('#oceanSceneIntro .scene-status');
  if (intro) intro.textContent = depthLine(ctx, st);
}

export default {
  key: 'hobby/dive',
  title: 'Dive · 심해',
  badge: 'DERIVED',

  async load(ctx, st, signal) {
    ctx.css(new URL('./hobby-dive.css', import.meta.url).href, CSS_ID);
    st.mountSeq = st.mountSeq || 0;
    const doc = await ctx.fetchJson(TRENCHES_URL, { signal, cache: 'no-cache' });
    const items = Array.isArray(doc?.items) ? doc.items.filter((i) => Number.isFinite(Number(i.lat)) && Number.isFinite(Number(i.lon))) : [];
    if (!items.length) throw new Error('FEATURED_TRENCH_UNAVAILABLE');
    st.trenches = items;
    st.featured = items[0];
    if (!st.location) setLocation(st, locFromTrench(st.featured, 'featured'));
    await v1mods(ctx);                         // divescene · depth · i18n — 없으면 UNAVAILABLE 카드
    void mods.diveScene.ensureStyles();        // /css/ocean-dive.css (절대경로 · /v2/ 아래서도 같은 origin)
    await probeDepth(ctx, st, st.location);
  },

  build(ctx, st) {
    const loc = st.location; if (!loc) return;
    const land = st.depth && !st.depth.isOcean;
    ctx.add(ctx.makePoints([{ lat: loc.lat, lon: loc.lon, c: land ? 0xf9aa27 : 0x27bfff }], { size: 10, lift: 0.004 }));
    const label = ctx.makeLabel(nameOf(ctx, loc).split(' · ')[0], land ? '#f9c56a' : '#9fe6ff');
    ctx.add(ctx.placeLabel(label, loc.lat, loc.lon));
  },

  card(ctx, st) {
    const ko = ctx.ko; const esc = ctx.esc;
    const loc = st.location;
    const land = st.depth && !st.depth.isOcean;
    const kindTxt = loc?.kind === 'featured' ? (ko ? '특집 잠수' : 'Featured dive')
      : loc?.kind === 'trench' ? (ko ? '해구 카드' : 'Trench card')
        : loc?.kind === 'pick' ? (ko ? '지구에서 고른 지점' : 'Picked on the globe')
          : (ko ? '지도 중심' : 'Map centre');
    const options = (st.trenches || []).map((t) => `<option value="${esc(t.id)}"${loc?.id === t.id ? ' selected' : ''}>${esc(t.name?.[ko ? 'ko' : 'en'] || t.id)}</option>`).join('');
    return `
      <div class="hd-head">
        <div class="stat"><span class="k">${ko ? '잠수 지점' : 'Dive point'}</span><span class="v">${esc(nameOf(ctx, loc))}</span></div>
        <div class="stat"><span class="k">${kindTxt}</span><span class="v">${loc ? fmtLL(loc.lat, loc.lon) : '—'}</span></div>
        <div class="stat"><span class="k">${ko ? '수심' : 'Depth'}</span><span class="v${land || st.depthError ? ' na' : ''}" data-dive-depthline>${esc(depthLine(ctx, st))}</span></div>
        <div class="hd-actions">
          <button type="button" data-action="ext:dive-here" title="${ko ? '지금 지도 중심 지점의 GEBCO 셀을 연다' : 'Open the GEBCO cell under the map centre'}">${ko ? '여기서 잠수' : 'Dive here'}</button>
          <button type="button" data-action="ext:dive-featured"${loc?.kind === 'featured' ? ' disabled' : ''}>${ko ? '특집 잠수로' : 'Featured dive'}</button>
          <label class="hd-select">${ko ? '해구' : 'Trench'}
            <select data-action="ext:dive-trench" aria-label="${ko ? '해구 골라 잠수' : 'Dive at a trench'}">
              <option value="">${ko ? '골라서 잠수…' : 'Choose…'}</option>${options}
            </select></label>
        </div>
      </div>
      <section class="scene-view ocean-scene hd-scene" data-scene-view="ocean" aria-label="${ko ? '심해 탐사 조종 화면' : 'Deep-ocean exploration console'}">
        <div id="oceanSceneIntro"${loc && !land ? ' hidden' : ''}>
          <p class="scene-kicker">${ko ? '심해 / GEBCO 2026' : 'Deep sea / GEBCO 2026'}</p>
          <p class="scene-status">${esc(land
    ? (ko ? '이 격자 셀은 육지로 분류됩니다. 바다 지점으로 지도를 옮기고 「여기서 잠수」를 누르세요.' : 'This grid cell is land. Move the map over the ocean and press “Dive here”.')
    : (ko ? '검증된 GEBCO 2026 격자로 이 지점의 수심 기둥을 보여줍니다.' : 'Shows the depth column at this point from the GEBCO 2026 grid.'))}</p>
        </div>
        <div id="diveExperience" class="dive-experience"${land ? ' hidden' : ''}>
          <header class="dive-head">
            <p class="scene-kicker">${ko ? '심해 / GEBCO 2026' : 'Deep sea / GEBCO 2026'}</p>
            <h2 id="diveTitle">${esc(nameOf(ctx, loc))}</h2>
            <p id="diveSource" class="scene-status">${ko ? '수심 자료를 읽는 중…' : 'Reading depth data…'}</p>
          </header>
          <div class="dive-canvas-wrap">
            <canvas id="diveCanvas" aria-label="${ko ? '수면에서 해저까지의 수심 기둥' : 'Depth column from surface to seafloor'}"></canvas>
            <div id="seaLifeLayer" class="sea-life-layer" aria-live="polite"></div>
            <aside id="seaLifeDetail" class="sea-life-detail" hidden></aside>
            <output id="diveReadout" aria-live="polite">0 m</output>
          </div>
          <label class="dive-slider-label" for="diveSlider">${ko ? '현재 깊이' : 'Current depth'}</label>
          <input id="diveSlider" class="dive-slider" type="range" min="0" max="1" value="0" step="1">
          <aside id="obisSummary" class="obis-summary" aria-live="polite" aria-labelledby="obisTitle"></aside>
          <div id="diveComparisons" class="dive-comparisons"></div>
          <p id="diveLimit" class="dive-limit"></p>
        </div>
      </section>
      <p class="hd-note">${ko
    ? '중앙 장면·단각류 이미지는 이해를 돕는 시각화이며 관측 사진이 아닙니다. 수심은 약 11km 셀의 최심 원본값으로, 이 좌표의 실측이 아니며 항해·해상 안전에 쓰면 안 됩니다. 출처·OBIS 관측 기록·비교는 ☰ 에 있습니다.'
    : 'The scene and the amphipod image are illustrative, not observation photos. Depth is the deepest source value in an ~11 km cell — not a sounding at this coordinate, not for navigation or safety. Sources, OBIS records and comparisons are behind ☰.'}</p>`;
  },

  afterRender(ctx, st, root) {
    const seq = ++st.mountSeq;
    if (!root || !st.location) return;
    const host = root.querySelector('#diveExperience');
    if (!host) return;
    if (st.depth && !st.depth.isOcean) return;              // 육지 — 조종 화면을 띄우지 않는다
    mount(ctx, st, root, host, seq).catch((e) => {
      console.warn('[ext:dive] mount', e);
      if (seq !== st.mountSeq) return;
      const s = root.querySelector('#diveSource');
      if (s) s.textContent = ctx.ko ? '심해 화면을 열지 못했습니다 — 값을 만들지 않습니다.' : 'Could not open the dive console — nothing is fabricated.';
    });
  },

  pick(ctx, st, lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      title: ctx.ko ? '이 지점에서 잠수' : 'Dive at this point',
      badge: 'DERIVED',
      body: `<div>${fmtLL(lat, lon)}</div>
        <p>${ctx.ko ? 'GEBCO 격자를 열어야 수심을 알 수 있습니다 — 미리 값을 말하지 않습니다. 육지 셀이면 육지라고 표시합니다.' : 'Depth is known only after opening the GEBCO cell — no value is stated in advance. A land cell is reported as land.'}</p>
        <button type="button" data-action="ext:dive-at" data-lat="${lat.toFixed(5)}" data-lon="${lon.toFixed(5)}">${ctx.ko ? '이 좌표의 GEBCO 셀 열기' : 'Open GEBCO cell at this point'}</button>`,
    };
  },

  action(ctx, st, name, ds, value) {
    if (name === 'dive-here') {
      const c = ctx.cam?.();
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) return { handled: true };
      setLocation(st, { lat: c.lat, lon: c.lon, name: null, kind: 'here' });
      ctx.refresh();
      return { rebuild: true };
    }
    if (name === 'dive-at') {
      const lat = Number(ds?.lat); const lon = Number(ds?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { handled: true };
      setLocation(st, { lat, lon, name: null, kind: 'pick' });
      ctx.refresh();
      return { rebuild: true, point: st.point };
    }
    if (name === 'dive-featured') {
      if (!st.featured) return { handled: true };
      setLocation(st, locFromTrench(st.featured, 'featured'));
      ctx.refresh();
      return { rebuild: true, point: st.point };
    }
    if (name === 'dive-trench') {
      const id = value || ds?.id;                 // click 이벤트로도 오지만 그땐 value 가 없다 — 무시
      const item = id && (st.trenches || []).find((t) => t.id === id);
      if (!item) return { handled: true };
      setLocation(st, locFromTrench(item, item === st.featured ? 'featured' : 'trench'));
      ctx.refresh();
      return { rebuild: true, point: st.point };
    }
    return null;
  },

  close(ctx, st) {
    st.mountSeq = (st.mountSeq || 0) + 1;
    st.ro?.disconnect(); st.ro = null;
    try { mods?.diveScene?.close(); } catch (_) { /* 이미 닫힘 */ }
    try { document.body?.classList.remove('earthus-dive-open'); } catch (_) { /* DOM 없음 */ }
  },
};
