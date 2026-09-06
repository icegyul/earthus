/* 위성 관제센터 — EARTHUS SATELLITE CONTROL CENTER (지시서 v1.0, 2026-09-07)
 *
 * "단순 위성 시각화가 아니다. 발사 → 궤적 → 궤도 → 운용 → 쓰레기 → 근접 → 임무 기록 → ARCHIVE 재생을
 *  하나의 데이터·UI 흐름으로 잇는 Space Operations 화면이다."
 *
 * 화면(§2): 상단 바 | 좌 = SPACE OPERATIONS 탐색(§3) | 중앙 = 3D 지구(기존 Cesium, 그대로) |
 *           우 = 선택 객체(§7) | 하단 = 최근 발사·주요 임무·우주쓰레기·임무 Archive(§24)
 *
 * 데이터는 전부 이미 있는 것을 쓴다 — 새 프레임워크·새 지구 없음(§30):
 *   위성·궤도   js/layers/space.js orbits (CelesTrak OMM·SATCAT, 브라우저 SGP4)
 *   발사        js/layers/space.js launches (LL2 축약본: 진행 중·예정·지난)
 *   우주쓰레기·근접사건  js/aetherus (정본 카탈로그·P4 스크리닝) — ui-aetherus.ensureLayer 로 같은 레이어를 공유
 *   그리기      ./globe.js  ·  계산  ./model.js (node 검증: tools/spaceops/test_model.mjs)
 *
 * 정직성(§9·§11·§25):
 *   · 충돌확률을 만들지 않는다. 서버가 NOT_COMPUTED 라고 준 것은 그대로 NOT_COMPUTED 라고 적는다.
 *   · 발사 단계 시각은 어느 출처도 주지 않는다 → "예시(MOCK)" 배지 없이는 그리지 않는다.
 *   · ARCHIVE 는 "현재 궤도요소로 역산한 자리" 다. 화면 위에 ◷ ARCHIVE 와 시각·요소 나이를 붙인다.
 *   · KPI 는 받은 자료의 개수다. 못 받았으면 숫자를 안 쓴다(—).
 *
 * 열기: 인공위성 시트의 '위성 관제센터' 줄, 또는 ?spaceops=1
 */
import { i18n } from '../i18n.js';
import { store } from '../store.js';
import { orbits, launches } from '../layers/space.js';
import { SAT_GROUPS } from '../layers/satcat.js';
import { panels } from '../panels.js';
import { globe, KIND_COLOR } from './globe.js';
import * as M from './model.js';

const t = (ko, en) => (i18n.lang === 'ko' ? ko : en);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString());
const CSS_HREF = new URL('../../css/spaceops.css?v=20260907-2', import.meta.url).href;

const SECTIONS = [
  ['live', '●', '실시간 우주 상황', 'Live space'],
  ['launch', '▲', '위성 발사 현황', 'Launches'],
  ['orbit', '◎', '위성 궤도 현황', 'Orbits'],
  ['debris', '✦', '우주쓰레기 추적', 'Space debris'],
  ['risk', '⚠', '접근 / 위험 이벤트', 'Close approaches'],
  ['comm', '⌾', '위성 교신 / 상태', 'Status board'],
  ['mission', '≡', '임무 기록', 'Missions'],
  ['archive', '◷', 'ARCHIVE', 'Archive'],
];
const RANGES = [[60, '1H'], [360, '6H'], [1440, '24H'], [4320, '72H'], [10080, '7D']];
const RADII = [25, 50, 100, 500];
const KIND_LABEL = {
  satellite: ['위성', 'Satellite'], station: ['우주정거장', 'Station'], rocket_body: ['발사체 잔해', 'Rocket body'],
  fragment: ['파편', 'Fragment'], debris: ['우주쓰레기', 'Debris'], unknown: ['미식별', 'Unknown'],
  launch: ['발사', 'Launch'],
};
const KIND_GLYPH = { satellite: '●', station: '◉', rocket_body: '▲', fragment: '◆', debris: '●', unknown: '○', launch: '▲' };
const FREE_SAVE_LIMIT = 3;

export const spaceOps = {
  root: null,
  open_: false,
  section: 'live',
  sel: null,
  range: 90,
  radiusKm: 500,
  clockMs: null,            // null = LIVE, 숫자 = ARCHIVE 재생 시각
  archivePlay: { on: false, speed: 60 },
  replay: { tPlus: 0, on: false, speed: 10, live: false },
  launchTab: 'upcoming',
  debrisFilter: 'ALL',
  orbitQuery: '',
  layer: null,              // AETHERUS Cesium 레이어(공유)
  stations: [],             // data/ground-stations.json (참고 좌표)
  _gsRows: null,
  _sats: null, _satsRef: null,
  _aeth: null, _aethStamp: null,
  _nearby: null,
  _tick: null,
  _snapTimer: null,
  _lastTickMs: 0,
  _orbitsWasShown: true,
  _firstOpen: true,

  /* ── 열고 닫기 ───────────────────────────────────────────────────────── */
  async open() {
    this._mount();
    if (this.open_) return;
    this.open_ = true;
    globalThis.__spaceOps = this;
    panels.closeAll();
    document.body.classList.add('spaceops');
    this.root.hidden = false;
    globe.init();
    globe.setClock(() => this.clock());
    this._renderShell();
    this._renderAll();
    this._setMtab('globe');
    this._loadStations().then(() => { globe.groundStations(this.stations, i18n.lang === 'ko'); if (this.section === 'comm') this._renderSection(); });

    /* 자료 확보 — 이미 받은 것은 다시 받지 않는다. 열기 전 레이어 상태는 기억해 두었다가 닫을 때 되돌린다
       (받은 지적: 닫았더니 지구 위에 쓰레기·위성 점이 그대로 남아 홈 화면을 덮었다). */
    this._prev = { orbitsOn: store.isOn('orbits') };
    try {
      if (typeof satellite === 'undefined') {
        const { loadSatJs } = await import('../aetherus/core.js');
        await loadSatJs();
      }
      if (!orbits.selected.length) await orbits.setGroups(['stations', 'korea', 'weather', 'science']);
      if (!store.isOn('orbits')) store.setLayer('orbits', true);
      if (!orbits.sats.length && !orbits.loading) orbits.refresh().catch(e => console.warn('[spaceops] orbits', e?.message || e));
      if (!launches.upcoming?.length) launches.refresh().catch(e => console.warn('[spaceops] launches', e?.message || e)).finally(() => this._renderAll());
      launches.recent().catch(() => null).then(() => this._renderAll());
      this._ensureAetherus();
    } catch (e) { console.warn('[spaceops] data', e?.message || e); }

    if (!this._subs) {
      this._subs = [
        (() => { const f = () => { this._sats = null; this._renderAll(); this._snapshot(); }; orbits.onChange(f); return () => {}; })(),
        store.on('select', m => this._fromStoreSelect(m)),
        store.on('tier', () => this._renderAll()),
      ];
      i18n.onChange(() => { this._renderShell(); this._renderAll(); });
    }
    if (this._firstOpen) { this._firstOpen = false; globe.camera('ASIA'); }
    this._tick = setInterval(() => this._onTick(), 500);
    this._lastTickMs = performance.now();
    this._snapshot();
    this._snapTimer = setInterval(() => this._snapshot(), 15 * 60_000);
    try { history.replaceState(null, '', `${location.pathname}?spaceops=1${location.hash}`); } catch (_) {}
  },

  close() {
    if (!this.open_) return;
    this.open_ = false;
    clearInterval(this._tick); this._tick = null;
    clearInterval(this._snapTimer); this._snapTimer = null;
    if (this.clockMs != null) this.exitArchive();
    this.replay.on = false;
    /* 선택도 지운다 — 지구 위 그림(궤적·발사 궤적)은 clearAll 로 사라지는데 패널만 남으면
       다음에 열었을 때 "궤적을 그리지 않습니다" 같은 틀린 말이 남는다(실측). */
    this.sel = null; this._nearby = null;
    globe.clearAll();
    if (this._prev && !this._prev.orbitsOn) store.setLayer('orbits', false);
    if (this._aethTurnedOn && this.layer?.on) { this.layer.toggle().catch(() => {}); this._aethTurnedOn = false; }
    globe.setClock(null);
    this.root.hidden = true;
    document.body.classList.remove('spaceops');
    try { history.replaceState(null, '', `${location.pathname}${location.hash}`); } catch (_) {}
  },

  toggle() { return this.open_ ? this.close() : this.open(); },

  async _loadStations() {
    if (this.stations.length) return this.stations;
    try {
      const res = await fetch(new URL('../../data/ground-stations.json', import.meta.url), { cache: 'force-cache' });
      const doc = await res.json();
      this.stations = doc.stations || [];
      this._stationsNote = doc.note || '';
    } catch (e) { console.warn('[spaceops] ground stations', e?.message || e); }
    return this.stations;
  },

  async _ensureAetherus() {
    if (this.layer) {
      // 닫을 때 꺼 두었으면 다시 켠다(공유 레이어라 인스턴스는 그대로)
      if (!this.layer.on) { try { await this.layer.toggle(); this._aethTurnedOn = true; this._aeth = null; this._renderAll(); } catch (_) {} }
      return this.layer;
    }
    try {
      const { ensureLayer } = await import('../ui-aetherus.js');
      const layer = await ensureLayer();
      this.layer = layer;
      if (!layer.on) { await layer.toggle(); this._aethTurnedOn = true; }
      this._aeth = null;
      this._renderAll();
      this._snapshot();
    } catch (e) { console.warn('[spaceops] aetherus', e?.message || e); }
    return this.layer;
  },

  /* ── 시계 ───────────────────────────────────────────────────────────── */
  clock() { return this.clockMs ?? Date.now(); },

  _onTick() {
    if (!this.open_ || document.hidden) return;
    const now = performance.now();
    const dt = (now - this._lastTickMs) / 1000;
    this._lastTickMs = now;
    // 상단 시계
    const clk = this.root.querySelector('[data-so-clock]');
    if (clk) clk.textContent = M.fmtKst(this.clock(), true);
    // ARCHIVE 재생
    if (this.clockMs != null && this.archivePlay.on) {
      this.clockMs += dt * 1000 * this.archivePlay.speed;
      this._archiveDraw();
      const s = this.root.querySelector('[data-so-arch-slider]');
      if (s && document.activeElement !== s) s.value = String(Math.round((this.clockMs - Date.now()) / 60_000));
      const lbl = this.root.querySelector('[data-so-arch-time]'); if (lbl) lbl.textContent = M.fmtKst(this.clockMs);
      this._refreshSelectionGeometry();
    }
    // 발사 재생
    if (this.sel?.kind === M.KIND.LAUNCH && globe.launchPlan()) {
      if (this.replay.live) {
        const net = Date.parse(this.sel.meta.net || '');
        if (Number.isFinite(net)) this.replay.tPlus = (Date.now() - net) / 1000;
      } else if (this.replay.on) {
        this.replay.tPlus += dt * this.replay.speed;
        const max = globe.launchPlan().T * 1.6;
        if (this.replay.tPlus >= max) { this.replay.tPlus = max; this.replay.on = false; this._renderRight(); }
      }
      globe.launchAt(this.replay.tPlus);
      const sl = this.root.querySelector('[data-so-replay-slider]');
      if (sl && document.activeElement !== sl) sl.value = String(Math.round(this.replay.tPlus));
      const tl = this.root.querySelector('[data-so-replay-t]'); if (tl) tl.textContent = M.fmtTPlus(this.replay.tPlus);
    }
    // 라이브 위치 숫자(오른쪽 패널) — 2초에 한 번
    if ((now | 0) % 2000 < 520) this._refreshLivePos();
  },

  /* ── 자료 컨텍스트 ──────────────────────────────────────────────────── */
  sats() {
    if (this._sats && this._satsRef === orbits.sats) return this._sats;
    this._satsRef = orbits.sats;
    this._sats = orbits.sats.map((s, i) => M.fromSat(s, i, orbits.catalogAge));
    return this._sats;
  },
  aeth() {
    const core = this.layer?.core;
    if (!core?.entries?.length) return [];
    const stamp = `${core.entries.length}:${core.sampleMs}:${core.snapshotAt}`;
    if (this._aeth && this._aethStamp === stamp) return this._aeth;
    this._aethStamp = stamp;
    this._aeth = core.entries.map(e => M.fromAetherus(e, core));
    return this._aeth;
  },
  launchObjs() {
    const seen = new Set();
    const all = [];
    for (const m of [...(launches.live || []), ...(launches.upcoming || []), ...(launches._recent || [])]) {
      if (seen.has(m.id)) continue; seen.add(m.id); all.push(M.fromLaunch(m));
    }
    return all;
  },
  approaches(forNorad = null) {
    return M.closeApproaches(this.layer?.core?.conjunctions || [], Date.now(), forNorad);
  },
  /** 주변 계산용 후보 — 두 출처의 같은 물체는 하나로 */
  pool() {
    const out = [...this.sats()];
    const have = new Set(out.map(o => o.noradId).filter(Boolean));
    for (const o of this.aeth()) if (!o.noradId || !have.has(o.noradId)) out.push(o);
    return out;
  },
  ctx() {
    const cat = orbits._catalog;
    const catalogTotal = cat?.groups ? (cat.groups.all?.length || Object.values(cat.groups).reduce((n, g) => n + (g?.length || 0), 0)) : null;
    return {
      sats: this.sats(), aeth: this.aeth(), launches: this.launchObjs(),
      closeApproaches: this.approaches(),
      conjunctions: this.layer?.core ? this.layer.core.conjunctions.length : null,
      catalogTotal, satsTotal: orbits.satsTotal ?? null, aethTotal: this.layer?.core?.totalObjects?.() ?? null,
      nowMs: this.clock(),
    };
  },
  findObj(id) {
    if (!id) return null;
    if (id.startsWith('sat:')) return this.sats().find(o => o.id === id) || null;
    if (id.startsWith('aeth:')) return this.aeth().find(o => o.id === id) || null;
    if (id.startsWith('launch:')) return this.launchObjs().find(o => o.id === id) || null;
    return null;
  },

  /* ── 선택 ───────────────────────────────────────────────────────────── */
  pick(picked) {
    const id = picked?.id;
    if (!id) return;
    if (id._meta?.kind === 'satellite' && id._meta._satIdx != null) {
      const s = this.sats()[id._meta._satIdx]; if (s) this.select(s); return;
    }
    if (id._aeth != null) { const o = this.aeth().find(x => x.ref.catalogId === id._aeth); if (o) this.select(o); return; }
    if (id._meta?.kind === 'ground-station') { this.selectStation(id._meta._gs); return; }
    if (id._spaceops) { const o = this.findObj(id._spaceops); if (o) this.select(o); return; }
    const lm = id._meta?._launch || (id._meta?.kind === 'launch' ? id._meta : null);
    if (lm) { const o = this.launchObjs().find(x => x.ref.launchId === lm.id) || M.fromLaunch(lm); this.select(o); }
  },

  _fromStoreSelect(m) {
    if (!this.open_ || !m) return;
    document.getElementById('sheet')?.classList.remove('up');
    if (m.kind === 'satellite' && m._satIdx != null) { const s = this.sats()[m._satIdx]; if (s) this.select(s); }
    else if (m.kind === 'launch') { const o = this.launchObjs().find(x => x.ref.launchId === m.id) || M.fromLaunch(m); this.select(o); }
  },

  async select(obj, opts = {}) {
    this.sel = obj;
    this._nearby = null;
    this.replay = { tPlus: 0, on: false, speed: 10, live: false };
    try { orbits.clearTrack?.(); } catch (_) {}
    globe.clearSelection();
    if (obj?.kind === M.KIND.LAUNCH) {
      await globe.clearLaunch();
      const plan = await globe.launchScene(obj);
      this._launchPlan = plan;
      const st = obj.meta.status;
      if (st === 'IN FLIGHT' || st === 'LIFTOFF') this.replay.live = true;
      if (opts.fly !== false) globe.camera('LAUNCH_SITE', { launch: obj });
    } else if (obj?.rec) {
      await globe.clearLaunch();
      this._refreshSelectionGeometry(true);
      if (opts.fly) globe.camera('SELECTED', { object: obj });
    }
    this._renderRight();
    this._markActive();
    this._setMtab('right');
    document.dispatchEvent(new CustomEvent('earthus:spaceops-select', { detail: { id: obj?.id || null, kind: obj?.kind || null } }));
  },

  /** 지상국을 누르면 — 지금 그 지상국 지평선 위에 있는(고도각 ≥5°) 불러온 객체를 센다. */
  selectStation(st) {
    if (!st) return;
    this.sel = { id: `gs:${st.id}`, kind: M.KIND.GROUND_STATION, name: i18n.lang === 'ko' ? st.name : st.en, station: st,
      source: { provider: st.operator, dataset: 'data/ground-stations.json', observedAt: null, ingestedAt: null, processing: this._stationsNote || '' }, meta: {} };
    globe.clearSelection();
    const now = this.clock();
    const rows = [];
    for (const o of this.pool()) {
      if (!o.rec) continue;
      const r = M.stationsInView(o.rec, [st], now, 5)[0];
      if (r?.visible) rows.push({ obj: o, elDeg: r.elDeg, azDeg: r.azDeg, rangeKm: r.rangeKm });
    }
    rows.sort((a, b) => b.elDeg - a.elDeg);
    this._gsView = rows;
    this._renderRight();
    this._setMtab('right');
    globe.camera('KOREA', {}); // 카메라 프리셋이 아니라 지상국으로: 아래에서 덮어쓴다
    globe.camera('LAUNCH_SITE', { launch: { lat: st.lat, lon: st.lon } });
  },

  /** 선택 객체의 궤적·주변을 지금 시계로 다시 그린다 (범위·반경·ARCHIVE 시각이 바뀔 때) */
  _refreshSelectionGeometry(recomputeNearby = false) {
    const o = this.sel;
    if (!o?.rec) return;
    globe.highlight(o);
    globe.tracks(o, this.range, this.clock());
    if (recomputeNearby || !this._nearby) {
      this._nearby = M.nearby(o, this.pool(), this.clock(), this.radiusKm, 10);
    }
    globe.nearby(o, this._nearby.rows, this.clock());
    this._gsRows = this.stations.length ? M.stationsInView(o.rec, this.stations, this.clock(), 5) : [];
    globe.stationLinks(o, this._gsRows, this.clock());
  },

  _markActive() {
    this.root.querySelectorAll('[data-act="select"]').forEach(b => b.classList.toggle('on', !!this.sel && b.dataset.id === this.sel.id));
  },

  /* ── ARCHIVE (§17·§25) ──────────────────────────────────────────────── */
  enterArchive(atMs) {
    if (!Number.isFinite(atMs)) return;
    if (this.clockMs == null) {
      this._orbitsWasShown = !!orbits.ds?.show;
      if (orbits.ds) orbits.ds.show = false;
      if (this.layer?.points) { this.layer.points.show = false; this.layer.lines.show = false; }
    }
    this.clockMs = atMs;
    this.root.classList.add('so-archive');
    this.section = 'archive';
    globe.setClock(() => this.clock());
    this._archiveDraw();
    this._nearby = null;
    this._refreshSelectionGeometry(true);
    this._renderAll();
  },
  exitArchive() {
    if (this.clockMs == null) return;
    this.clockMs = null;
    this.archivePlay.on = false;
    this.root.classList.remove('so-archive');
    globe.archive(false);
    if (orbits.ds) orbits.ds.show = this._orbitsWasShown && store.isOn('orbits');
    if (this.layer?.points && this.layer.on) { this.layer.points.show = true; this.layer.lines.show = true; }
    globe.setClock(() => this.clock());
    this._nearby = null;
    this._refreshSelectionGeometry(true);
    this._renderAll();
  },
  _archiveDraw() {
    if (this.clockMs == null) return;
    this._archiveDrawn = globe.archive(true, this.pool(), this.clockMs);
  },

  _snapshot() {
    try {
      const k = M.kpis(this.ctx());
      // 자료가 하나도 안 왔을 때의 빈 기록은 남기지 않는다 — 열자마자 찍히던 "— · — · —" 줄이 그것이었다
      if (k.active.value == null && k.rocketDebris.value == null && k.launches.value == null) return;
      M.recordSnapshot(localStorage, { at: Date.now(), kpi: { tracked: k.tracked.value, active: k.active.value,
        rocketDebris: k.rocketDebris.value, events: k.events.value, launches: k.launches.value }, sel: this.sel?.id || null });
    } catch (_) { /* 저장 불가 환경 */ }
  },

  /* ── DOM ────────────────────────────────────────────────────────────── */
  _mount() {
    if (this.root) return;
    if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = CSS_HREF; document.head.appendChild(link);
    }
    const root = document.createElement('section');
    root.id = 'spaceOps';
    root.className = 'so';
    root.hidden = true;
    root.setAttribute('aria-label', 'EARTHUS Satellite Control Center');
    root.innerHTML = `
      <header class="so-top">
        <button class="so-back" type="button" data-act="close" title="EARTHUS">←</button>
        <div class="so-brand"><b>SATELLITE CONTROL CENTER</b><small data-so-brand-sub></small></div>
        <div class="so-mode" data-so-mode></div>
        <div class="so-search"><input type="search" data-so-search autocomplete="off" spellcheck="false"><div class="so-search-out" data-so-search-out hidden></div></div>
        <div class="so-cams" data-so-cams></div>
        <div class="so-clock"><small>KST</small><b data-so-clock>--</b></div>
      </header>
      <aside class="so-left"><button type="button" class="so-handle" data-act="sheet-toggle" aria-label="펼치기/접기"><i></i></button>
        <nav class="so-nav" data-so-nav></nav><div class="so-section" data-so-section></div></aside>
      <main class="so-center">
        <div class="so-kpis" data-so-kpis></div>
        <div class="so-legend" data-so-legend></div>
        <div class="so-center-note" data-so-center-note hidden></div>
      </main>
      <aside class="so-right"><button type="button" class="so-handle" data-act="sheet-toggle" aria-label="펼치기/접기"><i></i></button>
        <div class="so-right-body" data-so-right></div></aside>
      <footer class="so-bottom" data-so-bottom></footer>
      <nav class="so-mnav" data-so-mnav aria-label="구역"></nav>`;
    document.body.appendChild(root);
    this.root = root;

    root.addEventListener('click', ev => this._onClick(ev));
    root.addEventListener('input', ev => this._onInput(ev));
    root.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); this._escape(); } });
    document.addEventListener('keydown', ev => {
      if (!this.open_ || ev.defaultPrevented) return;
      if (ev.key === 'Escape' && !ev.target.closest?.('#spaceOps')) { ev.preventDefault(); this._escape(); }
    }, true);
  },

  _escape() {
    const out = this.root.querySelector('[data-so-search-out]');
    if (out && !out.hidden) { out.hidden = true; return; }
    if (this.clockMs != null) { this.exitArchive(); return; }
    if (this.sel) { this.sel = null; globe.clearSelection(); globe.clearLaunch(); this._renderRight(); this._markActive(); return; }
    this.close();
  },

  _renderShell() {
    const r = this.root;
    r.querySelector('[data-so-brand-sub]').textContent = t('EARTHUS 위성 관제센터', 'EARTHUS space operations');
    r.querySelector('[data-so-search]').placeholder = t('위성 · 임무 · 객체 · 날짜 검색', 'Search satellite / mission / object / date');
    r.querySelector('[data-so-nav]').innerHTML = `<div class="so-nav-title">SPACE OPERATIONS</div>`
      + SECTIONS.map(([id, g, ko, en]) => `<button type="button" class="so-nav-item${this.section === id ? ' on' : ''}" data-act="section" data-id="${id}"><i>${g}</i><span>${t(ko, en)}</span></button>`).join('');
    r.querySelector('[data-so-cams]').innerHTML = [['GLOBAL', 'GLOBAL'], ['ASIA', 'ASIA'], ['KOREA', 'KOREA'], ['LAUNCH_SITE', t('발사장', 'LAUNCH SITE')], ['SELECTED', t('선택 객체', 'SELECTED')]]
      .map(([id, l]) => `<button type="button" data-act="cam" data-id="${id}">${l}</button>`).join('');
    r.querySelector('[data-so-legend]').innerHTML = `<b>${t('객체 구분', 'Objects')}</b>` + Object.entries(KIND_LABEL).filter(([k]) => k !== 'launch')
      .map(([k, [ko, en]]) => `<span><i style="color:${KIND_COLOR[k]}">${KIND_GLYPH[k]}</i>${t(ko, en)}</span>`).join('')
      + `<span><i style="color:${KIND_COLOR.launch}">▲</i>${t('발사장 · 궤적', 'Launch site · track')}</span>`
      + `<span><i style="color:#5ad1e8">⌾</i>${t('지상국 (참고 좌표)', 'Ground station (approx.)')}</span>`;
    /* 모바일 하단 구역 바 — 8구역 + 선택 객체. 데스크톱에서는 CSS 가 숨긴다. */
    r.querySelector('[data-so-mnav]').innerHTML = `<button type="button" data-act="mtab" data-id="globe"><i>◍</i><span>${t('지구', 'Earth')}</span></button>`
      + SECTIONS.map(([id, g, ko, en]) => `<button type="button" data-act="msection" data-id="${id}"><i>${g}</i><span>${t(ko, en).replace(' / ', '/')}</span></button>`).join('')
      + `<button type="button" data-act="mtab" data-id="right"><i>◎</i><span>${t('선택', 'Selected')}</span></button>`;
  },

  _renderAll() {
    if (!this.root || !this.open_) return;
    this._renderMode();
    this._renderKpis();
    this._renderSection();
    this._renderRight();
    this._renderBottom();
    this._markActive();
  },

  _renderMode() {
    const el = this.root.querySelector('[data-so-mode]');
    if (this.clockMs == null) el.innerHTML = `<span class="so-live"><i></i>LIVE</span>`;
    else el.innerHTML = `<span class="so-arch"><i>◷</i>ARCHIVE MODE <b data-so-arch-time>${M.fmtKst(this.clockMs)}</b></span><button type="button" data-act="archive-exit">${t('EXIT ARCHIVE', 'EXIT ARCHIVE')}</button>`;
    this.root.querySelectorAll('.so-nav-item').forEach(b => b.classList.toggle('on', b.dataset.id === this.section));
  },

  _renderKpis() {
    const k = M.kpis(this.ctx());
    const tile = (id, label, v, sub) => `<button type="button" class="so-kpi" data-act="kpi" data-id="${id}"><small>${label}</small><b>${v}</b><em>${sub || ''}</em></button>`;
    const core = this.layer?.core;
    this.root.querySelector('[data-so-kpis]').innerHTML =
      tile('orbit', 'TRACKED OBJECTS', n0(k.tracked.value), t('카탈로그 활성 물체', 'active catalogue'))
      + tile('orbit', 'ACTIVE SATELLITES', n0(k.active.value), k.active.total && k.active.total > (k.active.value || 0) ? t(`${n0(k.active.total)} 중 표시`, `of ${n0(k.active.total)} shown`) : t('불러온 위성', 'loaded'))
      + tile('debris', 'ROCKET / DEBRIS', n0(k.rocketDebris.value), core?.totalObjects?.() ? t(`정본 ${n0(core.totalObjects())}기 중`, `of ${n0(core.totalObjects())} catalogued`) : t('불러온 잔해', 'loaded'))
      + tile('risk', 'ACTIVE EVENTS', n0(k.events.value), t('근접사건 · 서버 산출', 'close approaches · server'))
      + tile('launch', 'LAUNCHES ±24H', n0(k.launches.value), t('진행 중 · 예정 · 직전', 'live · upcoming · recent'));
  },

  /* ── 좌측 구역 ──────────────────────────────────────────────────────── */
  _renderSection() {
    const box = this.root.querySelector('[data-so-section]');
    const fn = this[`_sec_${this.section}`];
    box.innerHTML = fn ? fn.call(this) : '';
    box.scrollTop = 0;
  },

  _row(o, extra = '', when = '') {
    const [ko, en] = KIND_LABEL[o.kind] || KIND_LABEL.unknown;
    return `<button type="button" class="so-row${this.sel?.id === o.id ? ' on' : ''}" data-act="select" data-id="${esc(o.id)}">
      <i style="color:${KIND_COLOR[o.kind] || '#ccc'}">${KIND_GLYPH[o.kind] || '●'}</i>
      <span><b>${esc(o.name)}</b><small>${esc(extra || t(ko, en))}</small></span><em>${when}</em></button>`;
  },
  _launchRow(o) {
    const h = o.meta.hoursOut;
    const when = h == null ? '—' : h < -48 ? new Date(o.meta.net).toLocaleDateString(i18n.lang)
      : h < 0 ? t(`${Math.round(-h)}시간 전`, `${Math.round(-h)}h ago`) : h < 1 ? t(`${Math.round(h * 60)}분 뒤`, `in ${Math.round(h * 60)}m`)
        : h < 48 ? t(`${Math.round(h)}시간 뒤`, `in ${Math.round(h)}h`) : t(`${Math.round(h / 24)}일 뒤`, `in ${Math.round(h / 24)}d`);
    const st = o.meta.status;
    return `<button type="button" class="so-row so-launch-row${this.sel?.id === o.id ? ' on' : ''}" data-act="select" data-id="${esc(o.id)}">
      <i style="color:${KIND_COLOR.launch}">▲</i>
      <span><b>${esc(o.name)}</b><small>${esc([o.meta.mission, o.meta.pad || o.meta.site].filter(Boolean).join(' · '))}</small>
      <small class="so-sub">${esc(o.meta.provider || '')}${o.meta.failReason ? ` · ${esc(o.meta.failReason)}` : ''}</small></span>
      <em><span class="so-st st-${st.replace(/\s/g, '-')}">${st}</span>${when}</em></button>`;
  },

  _sec_live() {
    const c = this.ctx();
    const live = c.launches.filter(o => o.meta.status === 'IN FLIGHT' || o.meta.status === 'LIFTOFF');
    const soon = c.launches.filter(o => o.meta.hoursOut != null && o.meta.hoursOut >= 0 && o.meta.hoursOut <= 48).slice(0, 5);
    const recent = c.launches.filter(o => o.meta.hoursOut != null && o.meta.hoursOut < 0).sort((a, b) => b.meta.hoursOut - a.meta.hoursOut).slice(0, 4);
    const ca = c.closeApproaches.slice(0, 4);
    const core = this.layer?.core;
    const stations = c.sats.filter(o => o.kind === M.KIND.STATION).slice(0, 3);
    return `<h4>${t('지금 우주에서', 'Right now')}</h4>
      ${live.length ? `<div class="so-group"><div class="so-gh live"><i></i>${t('진행 중 발사', 'Launch in flight')}</div>${live.map(o => this._launchRow(o)).join('')}</div>` : ''}
      <div class="so-group"><div class="so-gh">${t('주요 접근 이벤트', 'Close approaches')}<button type="button" data-act="section" data-id="risk">${t('전체', 'all')} ›</button></div>
        ${ca.length ? ca.map(ev => this._caRow(ev)).join('') : `<p class="so-empty">${core ? t('앞으로 예정된 근접사건이 없습니다(서버 산출).', 'No upcoming close approaches (server).') : t('AETHERUS 카탈로그를 받는 중…', 'Loading AETHERUS catalogue…')}</p>`}</div>
      <div class="so-group"><div class="so-gh">${t('48시간 안 예정 발사', 'Launches within 48h')}<button type="button" data-act="section" data-id="launch">${t('전체', 'all')} ›</button></div>
        ${soon.length ? soon.map(o => this._launchRow(o)).join('') : `<p class="so-empty">${t('48시간 안 예정된 발사가 없습니다.', 'No launches within 48h.')}</p>`}</div>
      <div class="so-group"><div class="so-gh">${t('최근 발사', 'Recent launches')}</div>
        ${recent.length ? recent.map(o => this._launchRow(o)).join('') : `<p class="so-empty">${t('지난 발사 기록을 받는 중…', 'Loading past launches…')}</p>`}</div>
      <div class="so-group"><div class="so-gh">${t('우주정거장', 'Stations')}</div>${stations.map(o => this._row(o)).join('') || `<p class="so-empty">${t('위성 카탈로그를 받는 중…', 'Loading catalogue…')}</p>`}</div>
      <div class="so-src">${t('출처', 'Sources')}: CelesTrak OMM·SATCAT (${orbits.catalogAge ? M.fmtAge(Date.now() - Date.parse(orbits.catalogAge), i18n.lang === 'ko') : '—'}) · Launch Library 2 (${launches.retrievedAt ? M.fmtAge(Date.now() - Date.parse(launches.retrievedAt), i18n.lang === 'ko') : '—'})${core ? ` · AETHERUS ${esc(core.state(i18n.lang === 'ko'))}` : ''}</div>`;
  },

  _caRow(ev) {
    const a = this.findObj(`aeth:${ev.a.catalogId}`) || this.sats().find(o => o.noradId === String(ev.a.catalogId));
    return `<button type="button" class="so-row so-ca" data-act="approach" data-id="${esc(ev.id)}">
      <i style="color:${KIND_COLOR.approach}">⚠</i>
      <span><b>${esc(ev.a.name)} ↕ ${esc(ev.b.name)}</b><small>${t('최소 예상 거리', 'Min. distance')} ${ev.missKm != null ? `${ev.missKm < 10 ? ev.missKm.toFixed(2) : Math.round(ev.missKm)} km` : '—'} · TCA ${M.fmtKst(ev.tcaMs)}</small></span>
      <em><span class="so-st st-MON">${ev.status}</span>${ev.timeToTcaMin != null ? (ev.timeToTcaMin < 90 ? t(`${Math.round(ev.timeToTcaMin)}분 뒤`, `in ${Math.round(ev.timeToTcaMin)}m`) : t(`${Math.round(ev.timeToTcaMin / 60)}시간 뒤`, `in ${Math.round(ev.timeToTcaMin / 60)}h`)) : ''}</em></button>`;
  },

  _sec_launch() {
    const all = this.launchObjs();
    const saved = M.readSavedLaunches(localStorage);
    const tabs = [['live', t('진행 중', 'In flight'), all.filter(o => o.meta.status === 'IN FLIGHT' || o.meta.status === 'LIFTOFF').length],
      ['upcoming', 'UPCOMING', (launches.upcoming || []).length], ['past', t('지난 발사', 'Past'), (launches._recent || []).length], ['saved', t('저장', 'Saved'), saved.length]];
    let list;
    if (this.launchTab === 'live') list = all.filter(o => o.meta.status === 'IN FLIGHT' || o.meta.status === 'LIFTOFF');
    else if (this.launchTab === 'upcoming') list = all.filter(o => o.meta.hoursOut != null && o.meta.hoursOut > 0).sort((a, b) => a.meta.hoursOut - b.meta.hoursOut);
    else if (this.launchTab === 'past') list = all.filter(o => o.meta.hoursOut != null && o.meta.hoursOut <= 0 && o.meta.status !== 'IN FLIGHT').sort((a, b) => b.meta.hoursOut - a.meta.hoursOut);
    else list = saved.slice().reverse().map(x => all.find(o => o.ref.launchId === x.id) || M.fromLaunch({ id: x.id, name: x.name, lat: x.lat, lon: x.lon, data: { _mission: x.mission, _net: x.net, _orbitAbbrev: x.orbit, _hoursOut: x.net ? (Date.parse(x.net) - Date.now()) / 3600_000 : null } }));
    const empty = { live: t('지금 날고 있는 발사가 없습니다. 이륙 60분 전부터 여기에 나타납니다.', 'No launch in flight. Rockets appear here from T-60 minutes.'),
      upcoming: t('예정된 발사를 아직 받지 못했습니다.', 'No upcoming launches loaded yet.'),
      past: t('지난 발사 기록을 받는 중…', 'Loading past launches…'),
      saved: t('저장한 발사가 없습니다. 발사 상세의 ☆ 로 저장합니다 — 이 기기에 저장됩니다.', 'Nothing saved. Tap ☆ in a launch — saved on this device.') }[this.launchTab];
    return `<h4>${t('위성 발사 현황', 'Launches')}</h4>
      <div class="so-tabs">${tabs.map(([id, l, n]) => `<button type="button" class="${this.launchTab === id ? 'on' : ''}" data-act="launchtab" data-id="${id}">${l}<i>${n}</i></button>`).join('')}</div>
      <div class="so-status-key">${['SCHEDULED', 'HOLD', 'SCRUBBED', 'IN FLIGHT', 'SUCCESS', 'FAILED', 'UNKNOWN'].map(s => `<span class="so-st st-${s.replace(/\s/g, '-')}">${s}</span>`).join('')}</div>
      ${list.length ? list.map(o => this._launchRow(o)).join('') : `<p class="so-empty">${empty}</p>`}
      <div class="so-src">${t('출처', 'Source')}: The Space Devs · Launch Library 2 — ${t('발사 시각은 자주 바뀝니다. 기관 공지가 정본입니다.', 'Times change often; the agency notice is authoritative.')}</div>`;
  },

  _sec_orbit() {
    const q = this.orbitQuery.trim().toLowerCase();
    const sats = this.sats().filter(o => !q || o.name.toLowerCase().includes(q) || (o.noradId || '').includes(q));
    const shown = sats.slice(0, 200);
    return `<h4>${t('위성 궤도 현황', 'Orbits')}</h4>
      <div class="so-chips">${SAT_GROUPS.map(g => `<button type="button" class="${orbits.isSelected(g.id) ? 'on' : ''}" data-act="group" data-id="${g.id}" style="--c:${g.color}"><i></i>${t(g.ko, g.en)}${g.heavy ? ' ⚠' : ''}</button>`).join('')}</div>
      <div class="so-note">${orbits.loading ? t('카탈로그 불러오는 중…', 'Loading catalogue…') : orbits.satsCapped
        ? t(`${n0(orbits.satsTotal)}기 중 ${n0(orbits.sats.length)}기 표시 — 기기 성능에 맞춰 줄였습니다`, `${n0(orbits.sats.length)} of ${n0(orbits.satsTotal)} shown (device limit)`)
        : t(`${n0(orbits.sats.length)}기 불러옴 · 브라우저 SGP4`, `${n0(orbits.sats.length)} loaded · SGP4 in browser`)}</div>
      <input type="search" class="so-filter" data-so-orbit-q value="${esc(this.orbitQuery)}" placeholder="${t('이름 · NORAD 번호로 거르기', 'Filter by name / NORAD')}">
      ${shown.map(o => this._row(o, [o.meta.ownerKo || o.meta.owner, o.elements ? `${Math.round(o.elements.perigeeKm)} km · ${o.elements.incDeg.toFixed(1)}°` : null].filter(Boolean).join(' · '), o.meta.opsKo && i18n.lang === 'ko' ? o.meta.opsKo : (o.meta.opsEn || ''))).join('')}
      ${sats.length > shown.length ? `<p class="so-empty">${t(`+${n0(sats.length - shown.length)}기 더 — 검색으로 좁혀 주세요`, `+${n0(sats.length - shown.length)} more — narrow with search`)}</p>` : ''}
      ${this._orbitAethHtml(q)}`;
  },

  /** AETHERUS 정본 카탈로그의 위성(잔해 아님) — CelesTrak 그룹에 없는 것만 따로 보인다. */
  _orbitAethHtml(q) {
    const have = new Set(this.sats().map(o => o.noradId).filter(Boolean));
    const list = this.aeth().filter(o => (o.kind === M.KIND.SATELLITE || o.kind === M.KIND.STATION) && !(o.noradId && have.has(o.noradId))
      && (!q || o.name.toLowerCase().includes(q) || (o.noradId || '').includes(q)));
    if (!list.length) return '';
    return `<div class="so-group"><div class="so-gh">${t('AETHERUS 정본 위성', 'AETHERUS catalogued satellites')}<span>${n0(list.length)}</span></div>
      ${list.slice(0, 120).map(o => this._row(o, o.elements ? `${Math.round(o.elements.perigeeKm)} km · ${o.elements.incDeg.toFixed(1)}°` : t('요소 없음', 'no elements'), o.meta.status || '')).join('')}
      ${list.length > 120 ? `<p class="so-empty">+${n0(list.length - 120)}</p>` : ''}</div>`;
  },

  _sec_debris() {
    const core = this.layer?.core;
    /* 잔해 = 발사체 잔해·파편·기타 잔해·미식별. 두 출처 모두에서 모으되 같은 NORAD 는 하나로. */
    const isJunk = o => o.kind === M.KIND.ROCKET_BODY || o.kind === M.KIND.FRAGMENT || o.kind === M.KIND.DEBRIS || o.kind === M.KIND.UNKNOWN;
    const all = this.pool().filter(isJunk);
    const aethSats = this.aeth().filter(o => !isJunk(o)).length;
    const f = this.debrisFilter;
    const list = all.filter(o => f === 'ALL' ? true : f === 'ROCKET BODY' ? o.kind === M.KIND.ROCKET_BODY : f === 'FRAGMENT' ? o.kind === M.KIND.FRAGMENT
      : f === 'DEBRIS' ? o.kind === M.KIND.DEBRIS : f === 'UNKNOWN' ? o.kind === M.KIND.UNKNOWN : f === 'ACTIVE TRACKING' ? !!o.rec : true);
    const filters = ['ALL', 'ROCKET BODY', 'FRAGMENT', 'DEBRIS', 'UNKNOWN', 'ACTIVE TRACKING'];
    return `<h4>${t('우주쓰레기 추적', 'Space debris')}</h4>
      <div class="so-chips">${filters.map(x => `<button type="button" class="${f === x ? 'on' : ''}" data-act="debrisfilter" data-id="${x}">${x}</button>`).join('')}</div>
      <div class="so-note">${core ? esc(core.state(i18n.lang === 'ko')) : t('AETHERUS 정본 카탈로그를 받는 중…', 'Loading AETHERUS catalogue…')}${core && aethSats ? t(` · 정본의 위성 ${n0(aethSats)}기는 궤도 현황에`, ` · ${n0(aethSats)} catalogued satellites are under Orbits`) : ''}</div>
      ${list.slice(0, 200).map(o => this._row(o, [KIND_LABEL[o.kind] ? t(...KIND_LABEL[o.kind]) : '', o.elements ? `${Math.round(o.elements.perigeeKm)} km · ${o.elements.incDeg.toFixed(1)}°` : t('요소 없음 · 상태벡터', 'no elements · state vector')].filter(Boolean).join(' · '),
        o.source.observedAt ? M.fmtAge(Date.now() - Date.parse(o.source.observedAt), i18n.lang === 'ko') : '')).join('')
        || `<p class="so-empty">${t('해당하는 객체가 없습니다.', 'No objects match.')}</p>`}
      ${list.length > 200 ? `<p class="so-empty">+${n0(list.length - 200)}</p>` : ''}
      ${core ? `<div class="so-card">${core.card(i18n.lang === 'ko')}</div>` : ''}`;
  },

  _sec_risk() {
    const ca = this.approaches();
    const core = this.layer?.core;
    return `<h4>${t('접근 / 위험 이벤트', 'Close approaches')}</h4>
      <div class="so-note warn">${t('초기 버전은 CLOSE APPROACH 만 다룹니다. 충돌확률은 공식 CDM·공분산 근거가 없어 계산하지 않습니다 — 거리·상대속도·최근접 시각·출처만 보여줍니다.',
        'This version shows CLOSE APPROACH only. No collision probability is computed without official CDM/covariance — distance, relative velocity, TCA and source only.')}</div>
      ${ca.length ? ca.map(ev => this._caRow(ev)).join('') : `<p class="so-empty">${core ? t(`앞으로 예정된 근접사건이 없습니다 (지난 사건 ${n0(core.pastConjunctions)}건은 ARCHIVE 에서).`, `No upcoming close approaches (${n0(core.pastConjunctions)} past ones in ARCHIVE).`) : t('AETHERUS 카탈로그를 받는 중…', 'Loading…')}</p>`}
      ${this.sel?.rec ? `<div class="so-group"><div class="so-gh">${t('선택 객체 주변(브라우저 계산)', 'Around selected (browser)')}</div>${this._nearbyHtml(true)}</div>` : ''}
      <div class="so-src">${t('출처', 'Source')}: AETHERUS P4 screening · ADVISORY_ONLY · ${t('확률 없음', 'no probability')}</div>`;
  },

  _sec_comm() {
    const sats = this.sats();
    const byOps = {};
    sats.forEach(o => { const k = (i18n.lang === 'ko' ? o.meta.opsKo : o.meta.opsEn) || t('상태 미상', 'unknown'); byOps[k] = (byOps[k] || 0) + 1; });
    const now = Date.now();
    const age = o => o.elements?.epochMs != null ? now - o.elements.epochMs : null;
    const buckets = [[t('1일 안', '<1d'), 0], [t('1~3일', '1–3d'), 0], [t('3일 넘음', '>3d'), 0], [t('없음', 'n/a'), 0]];
    sats.forEach(o => { const a = age(o); if (a == null) buckets[3][1]++; else if (a < 86400e3) buckets[0][1]++; else if (a < 3 * 86400e3) buckets[1][1]++; else buckets[2][1]++; });
    const stale = sats.filter(o => age(o) != null).sort((a, b) => age(b) - age(a)).slice(0, 25);
    return `<h4>${t('위성 교신 / 상태', 'Status board')}</h4>
      <div class="so-note">${t('텔레메트리·교신 자료는 공개 출처가 없어 아직 연결하지 않았습니다. 여기의 "상태"는 SATCAT 운용 상태와 궤도요소 신선도(마지막 관측 근거)입니다.',
        'No public telemetry feed is connected. "Status" here means SATCAT operational status plus element-set freshness (last-observed proxy).')}</div>
      <div class="so-group"><div class="so-gh">${t('운용 상태 (SATCAT)', 'Operational status (SATCAT)')}</div>
        <div class="so-stats">${Object.entries(byOps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span><b>${n0(v)}</b>${esc(k)}</span>`).join('') || `<p class="so-empty">—</p>`}</div></div>
      <div class="so-group"><div class="so-gh">${t('궤도요소 신선도', 'Element-set age')}</div>
        <div class="so-stats">${buckets.map(([k, v]) => `<span><b>${n0(v)}</b>${k}</span>`).join('')}</div></div>
      <div class="so-group"><div class="so-gh">${t('지상국', 'Ground stations')}<span>${n0(this.stations.length)}</span></div>
        <div class="so-note">${t('참고 좌표(공개 자료). 지상국을 누르면 지금 그 지평선 위에 있는 객체를 셉니다.', 'Approximate public coordinates. Tap one to list objects above its horizon now.')}</div>
        ${this.stations.map(st => { const r = this.sel?.rec ? (this._gsRows || []).find(x => x.station.id === st.id) : null;
          return `<button type="button" class="so-row sm" data-act="station" data-id="${st.id}"><i style="color:#5ad1e8">⌾</i><span><b>${esc(i18n.lang === 'ko' ? st.name : st.en)}</b><small>${esc(st.operator)} · ${M.fmtLatLon(st.lat, st.lon)}</small></span><em class="${r?.visible ? 'approaching' : ''}">${r ? (r.visible ? `${r.elDeg.toFixed(0)}° ↑` : t('지평선 아래', 'below')) : ''}</em></button>`; }).join('')}</div>
      <div class="so-group"><div class="so-gh">${t('가장 오래된 요소', 'Oldest element sets')}</div>
        ${stale.map(o => this._row(o, o.meta.opsKo && i18n.lang === 'ko' ? o.meta.opsKo : (o.meta.opsEn || ''), M.fmtAge(age(o), i18n.lang === 'ko'))).join('') || `<p class="so-empty">—</p>`}</div>`;
  },

  _sec_mission() {
    const sats = this.sats().filter(o => o.meta.launchDate);
    const years = {};
    sats.forEach(o => { const y = String(o.meta.launchDate).slice(0, 4); (years[y] = years[y] || []).push(o); });
    const recent = this.launchObjs().filter(o => o.meta.hoursOut != null && o.meta.hoursOut < 0).sort((a, b) => b.meta.hoursOut - a.meta.hoursOut).slice(0, 8);
    const yearList = Object.keys(years).sort((a, b) => b.localeCompare(a));
    return `<h4>MISSION ARCHIVE</h4>
      <div class="so-group"><div class="so-gh">${t('최근 발사 결과 (Launch Library 2)', 'Recent launch results (LL2)')}</div>${recent.map(o => this._launchRow(o)).join('') || `<p class="so-empty">${t('받는 중…', 'Loading…')}</p>`}</div>
      <div class="so-group"><div class="so-gh">${t('발사 연도별 위성 (SATCAT)', 'Satellites by launch year (SATCAT)')}</div>
        ${yearList.slice(0, 12).map(y => `<details class="so-year"${y === yearList[0] ? ' open' : ''}><summary>${y}<i>${years[y].length}</i></summary>${years[y].slice(0, 12).map(o => this._row(o, o.meta.launchDate)).join('')}${years[y].length > 12 ? `<p class="so-empty">+${years[y].length - 12}</p>` : ''}</details>`).join('')
          || `<p class="so-empty">${t('발사일 자료가 있는 위성이 없습니다 (카탈로그 폴백 경로면 SATCAT 조인이 빠집니다).', 'No launch-date data (SATCAT join is missing on the fallback path).')}</p>`}</div>
      <div class="so-note">${t('위성을 고르면 오른쪽에 MISSION TIMELINE 이 열립니다. 발사 단계별 시각은 공개 출처가 없어 "자료 없음"으로 둡니다 — 지어내지 않습니다.',
        'Pick a satellite to open its MISSION TIMELINE on the right. Stage-level times have no public source and stay "no data".')}</div>`;
  },

  _sec_archive() {
    const snaps = M.readSnapshots(localStorage).slice().reverse();
    const core = this.layer?.core;
    const ageS = core?.ageSeconds?.();
    const on = this.clockMs != null;
    const offMin = on ? Math.round((this.clockMs - Date.now()) / 60_000) : 0;
    const local = (ms) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
    return `<h4>ARCHIVE REPLAY</h4>
      <div class="so-note warn">${t('재생은 지금 가진 궤도요소를 그 시각으로 전파한 결과입니다(브라우저 SGP4). 요소가 오래될수록 실제와 벌어집니다 — 발행 요소 나이:',
        'Replay propagates the element sets we have to that time (browser SGP4). Accuracy degrades with element age — current age:')} <b>${ageS != null ? M.fmtAge(ageS * 1000, i18n.lang === 'ko') : '—'}</b>. ${t('실측 기록이 아닙니다.', 'Not an observation record.')}</div>
      <div class="so-arch-ctl">
        <label>${t('재생 시각', 'Replay time')}<input type="datetime-local" data-so-arch-input value="${local(on ? this.clockMs : Date.now() - 3600_000)}"></label>
        <div class="so-quick">${[[-1440, '−24H'], [-360, '−6H'], [-60, '−1H'], [60, '+1H'], [1440, '+24H']].map(([m, l]) => `<button type="button" data-act="archive-shift" data-min="${m}">${l}</button>`).join('')}<button type="button" data-act="archive-exit">${t('지금(LIVE)', 'NOW (LIVE)')}</button></div>
        <input type="range" data-so-arch-slider min="-4320" max="4320" step="5" value="${offMin}">
        <div class="so-arch-row"><button type="button" class="so-play" data-act="archive-play">${on && this.archivePlay.on ? '❚❚' : '▶'}</button>
          ${[1, 10, 60, 600].map(s => `<button type="button" class="${this.archivePlay.speed === s ? 'on' : ''}" data-act="archive-speed" data-speed="${s}">${s}x</button>`).join('')}
          <b data-so-arch-time>${on ? M.fmtKst(this.clockMs) : t('LIVE', 'LIVE')}</b></div>
        ${on ? `<div class="so-note">${t(`이 시각으로 ${n0(this._archiveDrawn)}기 전파 · 지난 근접사건 ${n0(core?.pastConjunctions)}건`, `${n0(this._archiveDrawn)} objects propagated · ${n0(core?.pastConjunctions)} past close approaches`)}</div>` : ''}
      </div>
      <div class="so-group"><div class="so-gh">${t('지난 근접사건 (서버 산출)', 'Past close approaches (server)')}<span>${n0(core?.pastConjunctions)}</span></div>
        ${(core?.pastConjunctionList || []).slice(0, 12).map(ev => `<button type="button" class="so-row" data-act="past-ca" data-id="${esc(`${ev.a}:${ev.b}:${ev.tca}`)}"><i style="color:${KIND_COLOR.approach}">⚠</i><span><b>${esc(ev.aName)} ↕ ${esc(ev.bName)}</b><small>${ev.missM != null ? `${(ev.missM / 1000) < 10 ? (ev.missM / 1000).toFixed(2) : Math.round(ev.missM / 1000)} km` : '—'} · TCA ${M.fmtKst(ev.tcaMs)}</small></span><em>${t('그 시각으로', 'replay')} ›</em></button>`).join('')
          || `<p class="so-empty">${t('지난 근접사건이 없습니다.', 'No past close approaches.')}</p>`}</div>
      <div class="so-group"><div class="so-gh">${t('기록된 스냅샷 (이 기기)', 'Recorded snapshots (this device)')}</div>
        ${snaps.slice(0, 24).map(s => `<button type="button" class="so-row" data-act="archive-at" data-at="${s.at}"><i>◷</i><span><b>${M.fmtKst(s.at)}</b><small>${t('위성', 'sats')} ${n0(s.kpi?.active)} · ${t('잔해', 'debris')} ${n0(s.kpi?.rocketDebris)} · ${t('근접', 'events')} ${n0(s.kpi?.events)} · ${t('발사', 'launches')} ${n0(s.kpi?.launches)}</small></span><em>${t('재생', 'replay')} ›</em></button>`).join('')
          || `<p class="so-empty">${t('아직 기록이 없습니다. 관제센터를 열어 두면 15분마다 KPI 스냅샷이 쌓입니다.', 'No snapshots yet — KPIs are recorded every 15 minutes while open.')}</p>`}</div>
      <div class="so-note">${t('서버 쪽 archive_snapshots(전 객체 상태 보존)는 다음 단계입니다. 지금은 KPI 요약만 기기에 남깁니다.', 'Server-side archive_snapshots (full state history) is the next phase; only KPI summaries are kept on this device for now.')}</div>`;
  },

  /* ── 오른쪽: 선택 객체 (§7·§8·§11·§13) ───────────────────────────────── */
  _renderRight() {
    const box = this.root.querySelector('[data-so-right]');
    if (!box) return;
    const o = this.sel;
    if (!o) {
      box.innerHTML = `<div class="so-r-empty"><b>SELECTED OBJECT</b><p>${t('지구 위의 점을 누르거나 왼쪽 목록에서 고르세요.', 'Tap an object on Earth or pick one from the list.')}</p>
        <p class="dim">${t('선택하면 현재 위치·궤도·과거/미래 궤적·주변 객체·임무 기록이 여기에 열립니다.', 'Position, orbit, past/future track, nearby objects and mission history open here.')}</p></div>`;
      return;
    }
    box.innerHTML = o.kind === M.KIND.LAUNCH ? this._rightLaunch(o) : o.kind === M.KIND.GROUND_STATION ? this._rightStation(o) : this._rightObject(o);
    box.scrollTop = 0;
    this._refreshLivePos();
    if (o.rec) this._loadThumb(o);
  },

  /** 위성 사진(위키 자유 이미지) 또는 개념도 — 1.0 정보 시트와 같은 satimage.js 를 쓴다. */
  async _loadThumb(o) {
    const box = this.root.querySelector('[data-so-thumb]');
    if (!box) return;
    try {
      const { satPhoto, drawSchematic } = await import('../satimage.js');
      const photo = await satPhoto(o.name, i18n.lang);
      if (this.sel !== o || !box.isConnected) return;
      if (photo) {
        box.innerHTML = `<img src="${esc(photo.url)}" alt="${esc(photo.title)}" loading="lazy"><a class="so-thumb-cap" href="${esc(photo.page)}" target="_blank" rel="noopener">${esc(photo.credit)} ↗</a>`;
      } else {
        const cv = document.createElement('canvas');
        const satLike = { name: o.name, rec: o.rec, group: o.meta.group || 'science', rcs: o.meta.rcs };
        drawSchematic(cv, satLike, o.color || KIND_COLOR[o.kind], i18n.lang);
        box.innerHTML = '';
        box.appendChild(cv);
        box.insertAdjacentHTML('beforeend', `<span class="so-thumb-cap">${t('개념도 · 크기·궤도 반영', 'schematic · size & orbit')}</span>`);
      }
    } catch (_) { box.remove(); }
  },

  /** 궤도 개념도 — 지구 원 + 경사각만큼 기울인 궤도 타원 + 현재 위상. 축척은 개념적이다(고도는 로그 압축). */
  _orbitSvg(o) {
    const el = o.elements; if (!el) return '';
    const alt = Math.max(150, el.perigeeKm);
    const r = 30 + 30 * Math.min(1, Math.log10(alt / 150) / Math.log10(36000 / 150));   // 150km→30, GEO→60
    const inc = el.incDeg;
    const phase = ((this.clock() / (el.periodMin * 60_000)) % 1) * 2 * Math.PI;
    const ry = r * 0.36;
    const px = Math.cos(phase) * r, py = Math.sin(phase) * ry;
    const col = KIND_COLOR[o.kind] || KIND_COLOR.satellite;
    return `<svg class="so-orbit" viewBox="-70 -70 140 140" aria-label="${t('궤도 개념도', 'orbit diagram')}">
      <defs><radialGradient id="soEarth" cx="35%" cy="35%"><stop offset="0" stop-color="#3d7fbf"/><stop offset="1" stop-color="#0b2140"/></radialGradient></defs>
      <circle r="66" fill="none" stroke="rgba(120,180,230,.08)"/>
      <ellipse rx="66" ry="24" fill="none" stroke="rgba(120,180,230,.12)" stroke-dasharray="2 3"/>
      <circle r="26" fill="url(#soEarth)"/><ellipse rx="26" ry="6" cy="0" fill="none" stroke="rgba(255,255,255,.18)"/>
      <g transform="rotate(${-inc})"><ellipse rx="${r}" ry="${ry}" fill="none" stroke="${col}" stroke-opacity=".85" stroke-width="1.4"/>
        <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.6" fill="${col}" stroke="#fff" stroke-width="1"/></g>
      <text x="0" y="66" text-anchor="middle" font-size="7" fill="rgba(232,241,248,.45)">${t('개념도', 'schematic')} · i ${inc.toFixed(1)}°</text></svg>`;
  },

  _rightStation(o) {
    const st = o.station;
    const rows = this._gsView || [];
    return `<div class="so-r-head"><i class="so-kind-ic gs">⌾</i><div><b>${esc(o.name)}</b><small>GROUND STATION · ${esc(st.operator)} · ${st.country}</small></div><span class="so-pill">${M.fmtLatLon(st.lat, st.lon)}</span></div>
      <div class="so-note">${t('참고 좌표(공개 시설 자료, 대략)입니다. 실제 교신·스케줄 자료는 연결 전이고, 아래는 브라우저가 계산한 "지금 이 지상국 지평선 위(고도각 5° 이상)에 있는 불러온 객체"입니다.',
        'Approximate public coordinates. No contact schedule is connected; below are loaded objects currently above this station\'s horizon (elevation ≥5°), computed in the browser.')}</div>
      <div class="so-block"><div class="so-bh">IN VIEW NOW<span class="dim">${n0(rows.length)}</span></div>
        ${rows.slice(0, 30).map(r => `<button type="button" class="so-row sm" data-act="select" data-id="${esc(r.obj.id)}"><i style="color:${KIND_COLOR[r.obj.kind]}">${KIND_GLYPH[r.obj.kind]}</i><span><b>${esc(r.obj.name)}</b><small>${t('고도각', 'el')} ${r.elDeg.toFixed(0)}° · ${t('방위', 'az')} ${r.azDeg.toFixed(0)}° · ${Math.round(r.rangeKm)} km</small></span></button>`).join('')
          || `<p class="so-empty">${t('지금 지평선 위에 있는 불러온 객체가 없습니다.', 'No loaded object above the horizon now.')}</p>`}</div>
      ${this._prov(o)}`;
  },

  _prov(o) {
    const s = o.source;
    return `<details class="so-prov"><summary>SOURCE · ${esc(s.provider)}</summary><dl>
      <dt>Provider</dt><dd>${esc(s.provider)}</dd><dt>Dataset</dt><dd>${esc(s.dataset)}</dd>
      <dt>${t('관측/요소 시각', 'Observation (epoch)')}</dt><dd>${s.observedAt ? `${M.fmtKst(Date.parse(s.observedAt))} (${M.fmtAge(Date.now() - Date.parse(s.observedAt), i18n.lang === 'ko')})` : '—'}</dd>
      <dt>${t('수집 시각', 'Ingested')}</dt><dd>${s.ingestedAt ? M.fmtKst(Date.parse(s.ingestedAt)) : '—'}</dd>
      <dt>Processing</dt><dd>${esc(s.processing)}</dd></dl></details>`;
  },

  _rightObject(o) {
    const el = o.elements;
    const g = o.rec ? M.geodeticAt(o.rec, new Date(this.clock())) : null;
    const cls = el ? M.orbitClass(el.perigeeKm, el.incDeg, el.periodMin) : null;
    const [kko, ken] = KIND_LABEL[o.kind] || KIND_LABEL.unknown;
    const ops = (i18n.lang === 'ko' ? o.meta.opsKo : o.meta.opsEn) || o.meta.status || null;
    const kv = (k, v) => `<div class="so-kv"><small>${k}</small><b>${v}</b></div>`;
    const ca = this.approaches(o.noradId);
    const tl = M.missionTimeline(o, { closeApproaches: ca });
    const gs = (this._gsRows || []).filter(r => r.visible);
    return `<div class="so-r-head"><i class="so-kind-ic" style="color:${KIND_COLOR[o.kind]}">${KIND_GLYPH[o.kind]}</i><div><b>${esc(o.name)}</b><small>${t(kko, ken)}${o.noradId ? ` · NORAD ${o.noradId}` : ''}${o.cospar ? ` · ${o.cospar}` : ''}</small></div>
        <span class="so-pill ${ops ? 'ok' : ''}">${ops ? esc(ops) : t('상태 미상', 'STATUS N/A')}</span></div>
      <div class="so-visual"><div class="so-thumb" data-so-thumb></div>${this._orbitSvg(o)}</div>
      <div class="so-kvs" data-so-livepos>
        ${kv(t('운용', 'Operator'), esc(o.meta.ownerKo || o.meta.owner || '—'))}${kv(t('궤도', 'Orbit'), cls ? cls.code : '—')}
        ${kv(t('고도', 'Altitude'), g ? `${Math.round(g.altKm)} km` : '—')}${kv(t('경사각', 'Inclination'), el ? `${el.incDeg.toFixed(1)}°` : '—')}
        ${kv(t('속도', 'Velocity'), g?.velKmS ? `${g.velKmS.toFixed(2)} km/s` : '—')}${kv(t('주기', 'Period'), el ? `${el.periodMin.toFixed(1)} min` : '—')}
        ${kv(t('위도', 'Latitude'), g ? `${Math.abs(g.lat).toFixed(1)}° ${g.lat >= 0 ? 'N' : 'S'}` : '—')}${kv(t('경도', 'Longitude'), g ? `${Math.abs(g.lon).toFixed(1)}° ${g.lon >= 0 ? 'E' : 'W'}` : '—')}
        ${el ? kv(t('근지점/원지점', 'Perigee/Apogee'), `${Math.round(el.perigeeKm)} / ${Math.round(el.apogeeKm)} km`) : ''}${o.meta.launchDate ? kv(t('발사일', 'Launched'), esc(o.meta.launchDate)) : ''}
      </div>
      <div class="so-actions">
        <button type="button" data-act="cam" data-id="SELECTED">${t('궤도 보기', 'View orbit')}</button>
        <button type="button" data-act="range" data-min="1440">${t('24시간 경로', '24h track')}</button>
        <button type="button" data-act="jump" data-id="nearby">${t('주변 객체', 'Nearby')}</button>
        <button type="button" data-act="jump" data-id="mission">${t('임무 기록', 'Mission')}</button>
        <button type="button" data-act="archive-shift" data-min="-60">Archive</button>
      </div>
      <div class="so-block"><div class="so-bh">${t('궤적 범위', 'Track range')}<span class="dim">${t('지나온 2바퀴 + 앞으로', 'past 2 orbits + ahead')}</span></div>
        <div class="so-seg">${RANGES.map(([m, l]) => `<button type="button" class="${this.range === m ? 'on' : ''}" data-act="range" data-min="${m}">${l}</button>`).join('')}</div></div>
      <div class="so-block" id="soNearby"><div class="so-bh">NEARBY OBJECTS<span class="so-seg sm">${RADII.map(r => `<button type="button" class="${this.radiusKm === r ? 'on' : ''}" data-act="radius" data-km="${r}">${r} km</button>`).join('')}</span></div>${this._nearbyHtml(false)}</div>
      <div class="so-block"><div class="so-bh">CLOSE APPROACH<span class="dim">${t('서버 산출', 'server')}</span></div>${ca.length ? ca.slice(0, 5).map(ev => this._caCard(ev)).join('') : `<p class="so-empty">${t('이 객체가 포함된 예정 근접사건이 없습니다.', 'No upcoming close approach involves this object.')}</p>`}</div>
      <div class="so-block" id="soMission"><div class="so-bh">MISSION TIMELINE</div><ol class="so-tl">${tl.map(s => `<li class="${s.known ? 'known' : 'nodata'}"><b>${s.key}</b><span>${s.known
        ? [s.at ? esc(Number.isFinite(Date.parse(s.at)) && String(s.at).length > 10 ? M.fmtKst(Date.parse(s.at)) : s.at) : null, s.note ? esc(s.note) : null, s.count ? String(s.count) : null].filter(Boolean).join(' · ')
        : t('자료 없음', 'no data')}</span>${s.source ? `<small>${esc(s.source)}${s.epochIsProxy ? t(' · 요소 epoch 기준', ' · element epoch') : ''}</small>` : ''}</li>`).join('')}</ol></div>
      <div class="so-block"><div class="so-bh">GROUND STATIONS IN VIEW<span class="dim">${t('고도각 ≥5° · 참고 좌표', 'el ≥5° · approx.')}</span></div>
        ${gs.length ? `<div class="so-gs">${gs.slice(0, 6).map(r => `<button type="button" data-act="station" data-id="${r.station.id}"><b>${esc(i18n.lang === 'ko' ? r.station.name : r.station.en)}</b><small>${r.elDeg.toFixed(0)}° · ${Math.round(r.rangeKm)} km</small></button>`).join('')}</div>`
          : `<p class="so-empty">${t('지금 지평선 위에 이 객체를 둔 지상국(목록 18곳)이 없습니다.', 'None of the 18 listed stations sees it right now.')}</p>`}</div>
      <div class="so-block"><div class="so-bh">FOR ME<span class="dim">${t('내 위치 통과', 'passes over me')}</span></div><div data-so-passes>${this._passesHtml || `<button type="button" class="so-link" data-act="passes">${t('다음 24시간 동안 내 위치 위를 언제 지나가나 →', 'When does it pass over my location in the next 24h →')}</button>`}</div></div>
      ${this._prov(o)}
      ${this._nextQuestion(o)}`;
  },

  /** 다음 질문 한 줄 — 배너 없이, 결과를 다 보여준 뒤 맨 아래에. Intelligence 지구로 잇는다. */
  _nextQuestion(o) {
    const q = o.kind === M.KIND.LAUNCH
      ? t('이 발사가 올린 위성은 앞으로 무엇을 관측하나?', 'What will this launch\'s payload observe next?')
      : o.kind === M.KIND.SATELLITE || o.kind === M.KIND.STATION
        ? t('이 위성이 지금 내려다보는 곳에서 무슨 일이 벌어지나?', 'What is happening where this satellite looks right now?')
        : t('이 잔해가 가까워지면 어느 위성·통신이 영향을 받나?', 'Which satellites or links would this debris affect?');
    return `<button type="button" class="so-next" data-act="intel"><small>${t('다음 질문', 'Next question')}</small><b>${q}</b><i>Intelligence ›</i></button>`;
  },

  _nearbyHtml(compact) {
    const o = this.sel;
    if (!o?.rec) return '';
    if (!this._nearby) this._nearby = M.nearby(o, this.pool(), this.clock(), this.radiusKm, 10);
    const r = this._nearby;
    const trend = { approaching: t('접근 중', 'approaching'), receding: t('멀어짐', 'receding'), steady: t('유지', 'steady') };
    return `${r.rows.length ? r.rows.map((x, i) => `<button type="button" class="so-row sm" data-act="select" data-id="${esc(x.obj.id)}"><i style="color:${KIND_COLOR[x.obj.kind]}">${KIND_GLYPH[x.obj.kind]}</i><span><b>${i + 1}. ${esc(x.obj.name)}</b><small>${t('거리', 'dist')} ${x.distKm < 10 ? x.distKm.toFixed(1) : Math.round(x.distKm)} km${x.relKmS != null ? ` · ${t('상대속도', 'rel')} ${x.relKmS.toFixed(1)} km/s` : ''}</small></span><em class="${x.trend}">${trend[x.trend]}</em></button>`).join('')
      : `<p class="so-empty">${t(`${this.radiusKm} km 안에 불러온 객체가 없습니다.`, `No loaded object within ${this.radiusKm} km.`)}</p>`}
      ${compact ? '' : `<div class="so-src">${t(`브라우저 SGP4 · ${n0(r.computed)}기 계산 · 요소 없는 ${n0(r.skipped)}기 제외 · 불러온 객체 안에서만 · 확률 아님`, `browser SGP4 · ${n0(r.computed)} computed · ${n0(r.skipped)} without elements skipped · loaded objects only · no probability`)}</div>`}`;
  },

  _caCard(ev) {
    return `<button type="button" class="so-ca-card" data-act="approach" data-id="${esc(ev.id)}">
      <div class="so-ca-h">⚠ CLOSE APPROACH <span class="so-st st-MON">${ev.status}</span></div>
      <div class="so-ca-pair"><b>${esc(ev.a.name)}</b><i>↕</i><b>${esc(ev.b.name)}</b></div>
      <dl><dt>${t('최소 예상 거리', 'Min. distance')}</dt><dd>${ev.missKm != null ? `${ev.missKm < 10 ? ev.missKm.toFixed(2) : Math.round(ev.missKm)} km` : '—'}</dd>
      <dt>${t('최근접 예상', 'TCA')}</dt><dd>${M.fmtKst(ev.tcaMs)}</dd>
      <dt>${t('충돌확률', 'Collision prob.')}</dt><dd>${ev.pcStatus === 'NOT_COMPUTED' ? t('미산출 (공식 CDM 없음)', 'NOT COMPUTED (no CDM)') : esc(ev.pcStatus)}</dd>
      <dt>Source</dt><dd>${esc(ev.source)}</dd></dl></button>`;
  },

  _rightLaunch(o) {
    const m = o.meta;
    const net = Date.parse(m.net || '');
    const plan = globe.launchPlan();
    const ev = M.launchEventTimeline(o);
    const saved = M.readSavedLaunches(localStorage).some(x => x.id === o.ref.launchId);
    const kv = (k, v) => `<div class="so-kv"><small>${k}</small><b>${v}</b></div>`;
    const max = plan ? Math.round(plan.T * 1.6) : 0;
    const vids = (m.videos || []).slice(0, 2);
    return `<div class="so-r-head"><i class="so-kind-ic" style="color:${KIND_COLOR.launch}">▲</i><div><b>${esc(o.name)}</b><small>LAUNCH EVENT · ${esc(m.provider || '')}</small></div><span class="so-st st-${m.status.replace(/\s/g, '-')}">${m.status}</span></div>
      <div class="so-kvs">${kv('NET', Number.isFinite(net) ? M.fmtKst(net) : '—')}${kv(t('발사체', 'Rocket'), esc(m.rocket || '—'))}
        ${kv(t('발사대', 'Pad'), esc(m.pad || '—'))}${kv(t('장소', 'Site'), esc(m.site || '—'))}
        ${kv(t('목표 궤도', 'Target orbit'), esc(m.orbitAbbrev || m.orbit || '—'))}${kv(t('임무', 'Mission'), esc(m.missionType || m.mission || '—'))}</div>
      ${m.missionDescription ? `<p class="so-desc">${esc(m.missionDescription).slice(0, 420)}${m.missionDescription.length > 420 ? '…' : ''}</p>` : ''}
      ${m.statusNote ? `<p class="so-note">${esc(m.statusNote)}</p>` : ''}${m.failReason ? `<p class="so-note warn">${esc(m.failReason)}</p>` : ''}
      <div class="so-actions">
        <button type="button" data-act="cam" data-id="LAUNCH_SITE">${t('발사장으로', 'Launch site')}</button>
        <button type="button" data-act="replay-toggle">${this.replay.on ? t('일시정지', 'Pause') : t('궤적 재생', 'Replay')}</button>
        ${vids.map(v => `<a href="${esc(v.url)}" target="_blank" rel="noopener">${t('중계', 'Webcast')} ↗</a>`).join('')}
        <button type="button" data-act="save-launch" data-id="${esc(o.ref.launchId)}">${saved ? '★' : '☆'} ${t('저장', 'Save')}</button>
      </div>
      <div class="so-block"><div class="so-bh">ROCKET TRAJECTORY ${this.replay.live ? `<span class="so-st st-IN-FLIGHT">LIVE</span>` : `<span class="dim">REPLAY</span>`}</div>
        ${plan && !plan.skipped ? `<div class="so-replay"><div class="so-arch-row"><button type="button" class="so-play" data-act="replay-toggle" ${this.replay.live ? 'disabled' : ''}>${this.replay.on ? '❚❚' : '▶'}</button>
            ${[1, 10, 60].map(s => `<button type="button" class="${this.replay.speed === s ? 'on' : ''}" data-act="replay-speed" data-speed="${s}" ${this.replay.live ? 'disabled' : ''}>${s}x</button>`).join('')}
            <b data-so-replay-t>${M.fmtTPlus(this.replay.tPlus)}</b></div>
          <input type="range" data-so-replay-slider min="0" max="${max}" step="5" value="${Math.round(this.replay.tPlus)}" ${this.replay.live ? 'disabled' : ''}>
          <div class="so-src">${t('근사 궤적', 'Approximate track')}: ${esc(String(plan.why || '').replace(/\*\*/g, ''))} · ${t('경사각', 'inc')} ${plan.inc?.toFixed?.(1)}° · ${Math.round(plan.alt)} km · ${t('주기', 'period')} ${(plan.T / 60).toFixed(1)} min${plan.exact ? '' : t(' · 실제 궤도요소는 발사 뒤 카탈로그에서 확정', ' · real elements appear in the catalogue after launch')}</div></div>`
        : `<p class="so-empty">${esc(plan?.why || t('이 발사의 궤적은 그리지 않습니다(목표 궤도 정보 부족).', 'No track drawn for this launch (target orbit unknown).'))}</p>`}</div>
      <div class="so-block"><div class="so-bh">LAUNCH EVENT TIMELINE</div>
        <ol class="so-tl">${ev.known.map(s => `<li class="known"><b>${M.fmtTPlus(s.tPlusSec)}</b><span>${s.key}</span><small>${esc(s.source)}</small></li>`).join('')}
        ${ev.mock.map(s => `<li class="mock"><b>${M.fmtTPlus(s.tPlusSec)}</b><span>${s.key}</span><small>MOCK</small></li>`).join('')}</ol>
        <div class="so-note warn">MOCK — ${t('단계별 실제 시각은 어느 공개 출처도 주지 않습니다. 위 회색 줄은 일반적인 예시이며 이 발사의 기록이 아닙니다.', ev.mockNote)}</div></div>
      ${(m.links || []).length ? `<div class="so-links">${m.links.slice(0, 4).map(l => `<a href="${esc(l.url || l)}" target="_blank" rel="noopener">${esc(l.title || l.url || l)} ↗</a>`).join('')}</div>` : ''}
      ${this._prov(o)}
      ${this._nextQuestion(o)}`;
  },

  _refreshLivePos() {
    const o = this.sel;
    if (!o?.rec) return;
    const box = this.root.querySelector('[data-so-livepos]');
    if (!box) return;
    const g = M.geodeticAt(o.rec, new Date(this.clock()));
    if (!g) return;
    const bs = box.querySelectorAll('.so-kv b');
    // 순서: 운용, 궤도, 고도, 경사각, 속도, 주기, 위도, 경도 …
    if (bs[2]) bs[2].textContent = `${Math.round(g.altKm)} km`;
    if (bs[4]) bs[4].textContent = g.velKmS ? `${g.velKmS.toFixed(2)} km/s` : '—';
    if (bs[6]) bs[6].textContent = `${Math.abs(g.lat).toFixed(1)}° ${g.lat >= 0 ? 'N' : 'S'}`;
    if (bs[7]) bs[7].textContent = `${Math.abs(g.lon).toFixed(1)}° ${g.lon >= 0 ? 'E' : 'W'}`;
  },

  /* ── 하단 4모듈 (§24) ───────────────────────────────────────────────── */
  _renderBottom() {
    const box = this.root.querySelector('[data-so-bottom]');
    if (!box) return;
    const c = this.ctx();
    const recent = c.launches.filter(o => o.meta.hoursOut != null && o.meta.hoursOut < 0).sort((a, b) => b.meta.hoursOut - a.meta.hoursOut).slice(0, 4);
    const major = [...c.sats.filter(o => o.kind === M.KIND.STATION), ...c.sats.filter(o => o.meta.group === 'korea'), ...c.sats.filter(o => o.meta.group === 'weather')].slice(0, 5);
    const deb = c.aeth.filter(o => o.kind !== M.KIND.SATELLITE && o.kind !== M.KIND.STATION).slice(0, 4);
    const snaps = M.readSnapshots(localStorage);
    const core = this.layer?.core;
    const mod = (id, title, body) => `<section class="so-mod"><header><button type="button" data-act="section" data-id="${id}"><b>${title}</b><i>›</i></button></header><div class="so-mod-body">${body}</div></section>`;
    box.innerHTML = mod('launch', t('최근 발사', 'Recent launches'), recent.map(o => this._launchRow(o)).join('') || `<p class="so-empty">${t('받는 중…', 'Loading…')}</p>`)
      + mod('orbit', t('주요 임무', 'Key missions'), major.map(o => this._row(o, o.elements ? `${Math.round(o.elements.perigeeKm)} km` : '', (i18n.lang === 'ko' ? o.meta.opsKo : o.meta.opsEn) || '')).join('') || `<p class="so-empty">${t('받는 중…', 'Loading…')}</p>`)
      + mod('debris', t('우주쓰레기', 'Space debris'), `<div class="so-stats">${core ? `<span><b>${n0(core.debrisCount())}</b>${t('잔해 표시', 'debris shown')}</span><span><b>${n0(core.totalObjects())}</b>${t('정본 총계', 'catalogued')}</span><span><b>${n0(core.conjunctions.length)}</b>${t('근접 예정', 'upcoming CA')}</span>` : `<span><b>—</b>${t('받는 중', 'loading')}</span>`}</div>${deb.map(o => this._row(o)).join('')}`)
      + mod('archive', t('임무 Archive', 'Mission archive'), `<div class="so-stats"><span><b>${n0(snaps.length)}</b>${t('스냅샷', 'snapshots')}</span><span><b>${n0(core?.pastConjunctions)}</b>${t('지난 근접', 'past CA')}</span><span><b>${n0((launches._recent || []).length)}</b>${t('지난 발사', 'past launches')}</span></div>${snaps.slice(-3).reverse().map(s => `<button type="button" class="so-row sm" data-act="archive-at" data-at="${s.at}"><i>◷</i><span><b>${M.fmtKst(s.at)}</b></span><em>${t('재생', 'replay')} ›</em></button>`).join('')}`);
  },

  /* ── 검색 (§23) ─────────────────────────────────────────────────────── */
  _renderSearch(q) {
    const out = this.root.querySelector('[data-so-search-out]');
    if (!q) { out.hidden = true; out.innerHTML = ''; return; }
    const r = M.search(q, this.ctx(), 6);
    const grp = (title, rows) => rows.length ? `<div class="so-sg"><small>${title}</small>${rows}</div>` : '';
    out.innerHTML = grp('SATELLITE', r.satellites.map(o => this._row(o)).join(''))
      + grp('LAUNCH', r.launches.map(o => this._launchRow(o)).join(''))
      + grp('DEBRIS', r.debris.map(o => this._row(o)).join(''))
      + grp('EVENT', r.events.map(ev => this._caRow(ev)).join(''))
      + grp('DATE → ARCHIVE', r.dates.map(d => `<button type="button" class="so-row" data-act="archive-at" data-at="${d.ms}"><i>◷</i><span><b>${esc(d.iso)}</b><small>${t('이 시각으로 재생', 'replay at this time')}</small></span></button>`).join(''))
      || `<p class="so-empty">${t('불러온 자료 안에 없습니다. 궤도 현황에서 그룹을 더 켜 보세요.', 'Not in loaded data — enable more groups in Orbits.')}</p>`;
    out.hidden = false;
  },

  /* ── 입력 ───────────────────────────────────────────────────────────── */
  _onInput(ev) {
    const el = ev.target;
    if (el.matches('[data-so-search]')) { this._renderSearch(el.value.trim()); return; }
    if (el.matches('[data-so-orbit-q]')) {
      this.orbitQuery = el.value; const pos = el.selectionStart;
      this._renderSection(); const n = this.root.querySelector('[data-so-orbit-q]'); n?.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {}
      return;
    }
    if (el.matches('[data-so-arch-slider]')) { this.enterArchive(Date.now() + Number(el.value) * 60_000); return; }
    if (el.matches('[data-so-arch-input]')) { const ms = Date.parse(el.value); if (Number.isFinite(ms)) this.enterArchive(ms); return; }
    if (el.matches('[data-so-replay-slider]')) { this.replay.tPlus = Number(el.value); this.replay.on = false; globe.launchAt(this.replay.tPlus); const tl = this.root.querySelector('[data-so-replay-t]'); if (tl) tl.textContent = M.fmtTPlus(this.replay.tPlus); }
  },

  async _onClick(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b || !this.root.contains(b)) return;
    const act = b.dataset.act, id = b.dataset.id;
    const out = this.root.querySelector('[data-so-search-out]');
    if (!b.closest('.so-search')) { out.hidden = true; }
    switch (act) {
      case 'close': this.close(); break;
      case 'section': this.section = id; this._renderMode(); this._renderSection(); this._setMtab('left'); break;
      case 'msection': {
        // 모바일 바에서 같은 구역을 다시 누르면 시트를 접는다(지구로)
        const same = this.section === id && this.root.classList.contains('mob-left');
        this.section = id; this._renderMode(); this._renderSection(); this._setMtab(same ? 'globe' : 'left'); break;
      }
      case 'sheet-toggle': this.root.classList.toggle('so-full'); break;
      case 'past-ca': {
        const ev2 = (this.layer?.core?.pastConjunctionList || []).find(x => `${x.a}:${x.b}:${x.tca}` === id);
        if (!ev2) break;
        this.enterArchive(ev2.tcaMs);
        const A = this.findObj(`aeth:${ev2.a}`) || this.sats().find(o => o.noradId === String(ev2.a));
        const B = this.findObj(`aeth:${ev2.b}`) || this.sats().find(o => o.noradId === String(ev2.b));
        if (A) { await this.select(A, { fly: true }); if (B) globe.approach(A, B, { id }, this.clock()); }
        break;
      }
      case 'station': { const st = this.stations.find(s => s.id === id); if (st) this.selectStation(st); break; }
      case 'intel': location.href = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/v2-three/' : '/Intelligence'; break;
      case 'kpi': this.section = id; this._renderMode(); this._renderSection(); this._setMtab('left'); break;
      case 'cam': globe.camera(id, { launch: this.sel?.kind === M.KIND.LAUNCH ? this.sel : this.launchObjs()[0], object: this.sel }); break;
      case 'select': { const o = this.findObj(id); if (o) { await this.select(o, { fly: o.kind === M.KIND.LAUNCH }); out.hidden = true; this._setMtab('right'); } break; }
      case 'approach': {
        const ev2 = this.approaches().find(x => x.id === id);
        if (!ev2) break;
        const A = this.findObj(`aeth:${ev2.a.catalogId}`) || this.sats().find(o => o.noradId === String(ev2.a.catalogId));
        const B = this.findObj(`aeth:${ev2.b.catalogId}`) || this.sats().find(o => o.noradId === String(ev2.b.catalogId));
        if (A) { await this.select(A, { fly: true }); if (B) globe.approach(A, B, ev2, this.clock()); this._setMtab('right'); }
        break;
      }
      case 'range': this.range = Number(b.dataset.min); this._refreshSelectionGeometry(); this._renderRight(); break;
      case 'radius': this.radiusKm = Number(b.dataset.km); this._nearby = null; this._refreshSelectionGeometry(true); this._renderRight(); this._jump('soNearby'); break;
      case 'jump': this._jump(id === 'nearby' ? 'soNearby' : 'soMission'); break;
      case 'launchtab': this.launchTab = id; if (id === 'past') launches.recent().catch(() => null).then(() => this._renderSection()); this._renderSection(); break;
      case 'debrisfilter': this.debrisFilter = id; this._renderSection(); break;
      case 'group': {
        const g = SAT_GROUPS.find(x => x.id === id); if (!g) break;
        const next = orbits.isSelected(id) ? orbits.selected.filter(x => x !== id) : [...orbits.selected, id];
        if (!orbits.isSelected(id) && g.heavy && !confirm(t(`${g.ko}는 약 ${g.est.toLocaleString()}기입니다. 기기에 따라 느려질 수 있습니다. 계속할까요?`, `${g.en} has ~${g.est.toLocaleString()} objects and may slow this device. Continue?`))) break;
        await orbits.setGroups(next); store.setLayer('orbits', next.length > 0); this._sats = null; this._renderAll(); break;
      }
      case 'archive-exit': this.exitArchive(); break;
      case 'archive-shift': this.enterArchive((this.clockMs ?? Date.now()) + Number(b.dataset.min) * 60_000); break;
      case 'archive-at': this.enterArchive(Number(b.dataset.at)); this._setMtab('left'); break;
      case 'archive-play': if (this.clockMs == null) this.enterArchive(Date.now() - 3600_000); this.archivePlay.on = !this.archivePlay.on; this._lastTickMs = performance.now(); this._renderSection(); break;
      case 'archive-speed': this.archivePlay.speed = Number(b.dataset.speed); this._renderSection(); break;
      case 'replay-toggle': if (!this.replay.live) { this.replay.on = !this.replay.on; this._lastTickMs = performance.now(); this._renderRight(); } break;
      case 'replay-speed': this.replay.speed = Number(b.dataset.speed); this._renderRight(); break;
      case 'save-launch': this._toggleSave(id); break;
      case 'passes': await this._passes(); break;
      case 'mtab': this._setMtab(id); break;
      default: break;
    }
  },

  _setMtab(id) {
    this.root.classList.remove('mob-left', 'mob-right', 'mob-bottom', 'so-full');
    if (id !== 'globe') this.root.classList.add(`mob-${id}`);
    this.root.querySelectorAll('[data-act="mtab"]').forEach(x => x.classList.toggle('on', x.dataset.id === id));
    this.root.querySelectorAll('[data-act="msection"]').forEach(x => x.classList.toggle('on', id === 'left' && x.dataset.id === this.section));
  },

  _jump(id) { const el = this.root.querySelector(`#${id}`); if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 900); } },

  _toggleSave(launchId) {
    const o = this.sel?.kind === M.KIND.LAUNCH && this.sel.ref.launchId === launchId ? this.sel : this.launchObjs().find(x => x.ref.launchId === launchId);
    const list = M.readSavedLaunches(localStorage);
    const at = list.findIndex(x => x.id === launchId);
    if (at >= 0) list.splice(at, 1);
    else {
      if (!store.isPaid() && list.length >= FREE_SAVE_LIMIT) {
        this._say(t(`무료로는 ${FREE_SAVE_LIMIT}건까지 저장됩니다. 더 저장하려면 EXPLORER 가 필요합니다 — 저장한 발사는 그대로 남습니다.`, `Free keeps ${FREE_SAVE_LIMIT} saved launches. EXPLORER removes the limit; what you saved stays.`));
        return;
      }
      if (!o) return;
      list.push({ id: launchId, name: o.name, mission: o.meta.mission, provider: o.meta.provider, orbit: o.meta.orbitAbbrev, net: o.meta.net, lat: o.lat, lon: o.lon, savedAt: new Date().toISOString() });
    }
    try { localStorage.setItem(M.SAVED_LAUNCH_KEY, JSON.stringify(list.slice(-60))); } catch (_) {}
    this._renderRight(); if (this.section === 'launch') this._renderSection();
  },

  async _passes() {
    const o = this.sel; if (!o?.rec) return;
    const box = this.root.querySelector('[data-so-passes]');
    box.innerHTML = `<p class="so-empty">${t('내 위치 확인 중…', 'Locating…')}</p>`;
    try {
      const { myLocation } = await import('../mylocation.js');
      const c = myLocation.coords || await myLocation.locate();
      if (!c) { box.innerHTML = `<p class="so-empty">${t('위치를 얻지 못했습니다.', 'Location unavailable.')}</p>`; return; }
      const p = M.passesOver(o.rec, { lat: c.lat, lon: c.lon }, this.clock(), 24, 10, 30);
      box.innerHTML = p.length ? `<ol class="so-passes">${p.slice(0, 6).map(x => `<li><b>${M.fmtKst(x.startMs)}</b><span>${t('최대 고도각', 'max el.')} ${Math.round(x.maxEl)}° · ${Math.round((x.endMs - x.startMs) / 60_000)}${t('분', 'm')}</span></li>`).join('')}</ol><div class="so-src">${t(`내 위치(${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}) 기준 · 고도각 10° 이상 · 브라우저 SGP4`, `at ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)} · elevation ≥10° · browser SGP4`)}</div>`
        : `<p class="so-empty">${t('24시간 안에 내 위치 위(10° 이상)를 지나지 않습니다.', 'No pass above 10° over your location in 24h.')}</p>`;
    } catch (e) { box.innerHTML = `<p class="so-empty">${esc(e?.message || e)}</p>`; }
  },

  _say(text) {
    const n = document.createElement('div'); n.className = 'so-toast'; n.textContent = text;
    this.root.appendChild(n); setTimeout(() => n.remove(), 6000);
  },
};
