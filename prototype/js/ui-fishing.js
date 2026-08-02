/* 낚시 시트 — 물때와 안전
 *
 * 받은 요청: "서핑처럼 낚시도 하자. 근교 바다도 보여주면 되지 않을까? 섬도 그렇고"
 *
 * ⚠️⚠️ 서핑 화면과 **묻는 것이 다르다.**
 *      서핑: "이 스웰이 이 해변에 들어오는가" → 방위·주기가 절반이다
 *      낚시: "물이 얼마나 움직이는가 / 지금 나가면 위험한가"
 *   그래서 같은 바다 자료를 쓰면서도 앞에 세우는 값이 다르다.
 *
 * ⚠️⚠️ **안전을 맨 위에 둔다.** 갯바위·방파제에서 해마다 사람이 죽고,
 *      원인은 대부분 너울이다 — 하늘이 맑고 바람도 없는데 갑자기 덮친다.
 *      "조황"보다 이것이 먼저다. (fishing.js 머리말 참고)
 */

import { i18n } from './i18n.js';
import { fishing, safety, FISH_RULES } from './fishing.js';
import { get, nearest, distKm } from './korea.js';
import { myLocation } from './mylocation.js';
import { viewer, onCameraIdle } from './viewer.js';
import { intro } from './intro.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* **굵게** 만 살린다. ⚠️ 이스케이프를 **먼저** 하고 그다음 풀어야 한다 —
   순서를 바꾸면 사용자 문자열의 <가 태그가 된다. */
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

const N_SHOW = 12;
const WIND_MAX_KM = 30;

/* 서핑 화면과 **같은 값**을 쓴다.
   ⚠️ 두 화면이 다른 높이에서 다르게 굴면 사용자는 규칙을 못 배운다. */
const ZOOM_M = 120_000;
const ZOOM_SKIP_M = 300_000;
const MARK_MAX_M = 1_400_000;
const REGION_M = 300_000;
const REGION_SAMPLES = 3;
const AWAY_KM = 90;

/* 종류별 핀 색.
   ⚠️ 색으로 "좋다/나쁘다"를 말하지 않는다 — **무엇인지**만 말한다. */
const KIND_COLOR = {
  island: '#f2a65a',      // 섬·갯바위
  breakwater: '#7fd1e8',  // 방파제
  pier: '#9fd8b0',        // 선착장
  marina: '#b9a7f0',
  harbour: '#e0d18a',     // 항·포구
};

const _pins = new Map();
function pinImage(kind) {
  if (_pins.has(kind)) return _pins.get(kind);
  const S = 48, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const col = KIND_COLOR[kind] || '#e0d18a';
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
  g.fillStyle = col; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.55)'; g.stroke();
  /* ⚠️ 낚싯바늘을 그렸더니 22px 에서 **알파벳 J 로 보였다**(실측 화면).
     물고기 실루엣이 작게 줄여도 무엇인지 읽힌다. */
  g.fillStyle = 'rgba(0,0,0,.82)';
  g.beginPath();                                   // 몸통
  g.ellipse(S / 2 - 1, S / 2, 13, 7.5, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();                                   // 꼬리
  g.moveTo(S / 2 + 11, S / 2);
  g.lineTo(S / 2 + 19, S / 2 - 7);
  g.lineTo(S / 2 + 19, S / 2 + 7);
  g.closePath(); g.fill();
  g.fillStyle = col;                               // 눈
  g.beginPath(); g.arc(S / 2 - 8, S / 2 - 1.5, 1.9, 0, Math.PI * 2); g.fill();
  const url = c.toDataURL('image/png');
  _pins.set(kind, url);
  return url;
}

/* 시각을 사람 말로 — "오늘 오후 3시 20분" */
function clock(ms, ko) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  const h = d.getHours(), m = d.getMinutes();
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const day = sameDay ? '' : `${d.getMonth() + 1}/${d.getDate()} `;
  if (ko) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${day}${h < 12 ? '오전' : '오후'} ${h12}시${m ? ` ${m}분` : ''}`;
  }
  return `${day}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const fishPanel = {
  _tab: 'near',
  _ready: false,
  _wind: null,
  _region: null,

  init() {
    document.addEventListener('click', async (e) => {
      if (e.target.closest('[data-fs-grow]')) { this.toggleHeight(); return; }
      if (e.target.closest('#fsHere')) { this.here(); return; }
      const t = e.target.closest('[data-fs-tab]');
      if (t) { this._tab = t.dataset.fsTab; this.render(); return; }
      const r = e.target.closest('[data-fs-region]');
      if (r) {
        this._region = r.dataset.fsRegion || null;
        const body = $('#fsBody');
        if (body) body.insertAdjacentHTML('afterbegin',
          `<p class="mt-load sf-loading">${i18n.lang === 'ko' ? '받는 중…' : 'Loading…'}</p>`);
        await this._fill();
        this.render();
        this._marks();
        this._zoom(true);
      }
    });
    onCameraIdle(() => this._onCamera());
    return this;
  },

  async open() {
    $('#fsSheet')?.classList.add('up', 'peek');
    /* ⚠️ 인트로 회전을 여기서 세운다 — 기준점을 읽는 사이에도 지구가 돌면
       기준이 실제로 보던 곳에서 밀린다 (ui-surf.js 에서 실측한 함정). */
    intro.stop();
    const ko = i18n.lang === 'ko';
    const body = $('#fsBody');
    if (!this._ready) body.innerHTML =
      `<p class="mt-load">${ko ? '낚시 지점을 받는 중…' : 'Loading…'}</p>`;
    try {
      await fishing.load();
      try { this._wind = await get('aws'); } catch (_) { this._wind = null; }
      await this._fill();
      this._ready = true;
      this.render();
      this._marks();
      setTimeout(() => this._zoom(), 380);
    } catch (e) {
      body.innerHTML = `<p class="mt-load">${ko ? '낚시 지점을 받지 못했습니다'
        : 'Could not load'}<br><small>${esc(e.message)}</small></p>`;
    }
  },

  close() {
    $('#fsSheet')?.classList.remove('up');
    this._clearMarks();
    this._hereBtn(false);
  },

  toggleHeight() {
    const el = $('#fsSheet');
    if (!el) return;
    el.classList.toggle('peek');
    this.render();
    setTimeout(() => this._zoom(true), 380);
  },

  /* ── 어디를 기준으로 고를까 (서핑과 같은 순서) ── */
  _anchor() {
    if (this._region) {
      const l = fishing.byRegion(this._region);
      if (l.length) {
        return { lat: l.reduce((s, b) => s + b.lat, 0) / l.length,
                 lon: l.reduce((s, b) => s + b.lon, 0) / l.length, from: 'region' };
      }
    }
    try {
      const c = viewer.camera.positionCartographic;
      if (c && c.height < 3_000_000) {
        return { lat: Cesium.Math.toDegrees(c.latitude),
                 lon: Cesium.Math.toDegrees(c.longitude), from: 'map' };
      }
    } catch (_) { }
    const p = myLocation.coords;
    if (p) return { lat: p.lat, lon: p.lon, from: 'me' };
    /* ⚠️ 마지막 기본값은 서핑과 다르다. 낚시는 서·남해가 중심이라
       동해(양양)로 보내면 첫 화면이 엉뚱해진다. → 태안 앞바다. */
    return { lat: 36.68, lon: 126.13, from: 'home' };
  },

  async _fill() {
    const at = this._anchor();
    this._at = at;
    this._pick = this._region
      ? fishing.byRegion(this._region).slice(0, N_SHOW)
      : fishing.near(at.lat, at.lon, N_SHOW);
    await fishing.sea(this._pick);
  },

  _center() {
    const l = this._pick || [];
    if (!l.length) return null;
    return { lat: l.reduce((s, b) => s + b.lat, 0) / l.length,
             lon: l.reduce((s, b) => s + b.lon, 0) / l.length };
  },

  _sheetShiftDeg() {
    const vh = window.innerHeight || 900;
    const el = $('#fsSheet');
    const top = el ? el.getBoundingClientRect().top : vh;
    const shiftPx = vh / 2 - Math.max(0, top) / 2;
    if (!(shiftPx > 0)) return 0;
    const fovy = viewer.camera?.frustum?.fovy ?? (Math.PI / 3);
    return (shiftPx * ((2 * ZOOM_M * Math.tan(fovy / 2)) / vh)) / 111_320;
  },

  _zoom(force) {
    const at = this._at;
    if (!at) return;
    try {
      const h = viewer.camera.positionCartographic?.height ?? Infinity;
      if (!force && at.from !== 'region' && h < ZOOM_SKIP_M) return;
      intro.stop();
      viewer.camera.cancelFlight?.();
      viewer.scene.tweens?.removeAll?.();
      const c = this._center() || at;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat - this._sheetShiftDeg(), ZOOM_M),
        duration: 1.6,
      });
    } catch (_) { }
  },

  _onCamera() {
    const el = $('#fsSheet');
    if (!el?.classList.contains('up')) { this._hereBtn(false); return; }
    const h = viewer.camera?.positionCartographic?.height ?? 0;
    const want = h > REGION_M ? 'region' : 'spot';
    /* ⚠️ 지도만 갈아 끼우면 목록이 그대로다 — 지도는 지점을 찍는데 시트는
       권역 목록을 보여주는 어긋남이 실측에서 나왔다. 같이 다시 그린다. */
    if (want !== this._markMode) { this._marks(); this.render(); }
    if (want === 'region') { this._hereBtn(false); return; }
    const c = this._center();
    let away = Infinity;
    try {
      const p = viewer.camera.positionCartographic;
      if (c && p) away = distKm(Cesium.Math.toDegrees(p.latitude),
                                Cesium.Math.toDegrees(p.longitude), c.lat, c.lon);
    } catch (_) { }
    this._hereBtn(away > AWAY_KM);
  },

  _hereBtn(on) {
    let b = document.getElementById('fsHere');
    if (!on) { b?.classList.remove('on'); return; }
    if (!b) { b = document.createElement('button'); b.id = 'fsHere'; document.body.appendChild(b); }
    b.textContent = i18n.lang === 'ko' ? '이 지역 낚시 지점 보기' : 'Search this area';
    b.classList.add('on');
  },

  async here() {
    this._region = null;
    this._hereBtn(false);
    const body = $('#fsBody');
    if (body) body.insertAdjacentHTML('afterbegin',
      `<p class="mt-load sf-loading">${i18n.lang === 'ko' ? '받는 중…' : 'Loading…'}</p>`);
    await this._fill();
    this.render();
    this._marks();
  },

  /* ══ 지도 표시 ═════════════════════════════════════════════════ */
  _ensureDs() {
    if (!this._ds) {
      this._ds = new Cesium.CustomDataSource('fishing');
      viewer.dataSources.add(this._ds);
    }
    return this._ds;
  },
  _clearMarks() { try { this._ds?.entities.removeAll(); } catch (_) { } },

  _marks() {
    const h = viewer.camera?.positionCartographic?.height ?? 0;
    const mode = h > REGION_M ? 'region' : 'spot';
    this._markMode = mode;
    if (mode === 'region') { this._regionsDrawn = false; this._markRegions(); return; }

    this._clearMarks();
    const ko = i18n.lang === 'ko';
    const list = this._pick || [];
    if (!list.length) return;
    try {
      this._ensureDs();
      /* ⚠️ 이름표가 겹친다 — 항구는 해안을 따라 촘촘하다.
         서핑에서 쓴 방법과 같다: 위에서부터 좌우 번갈아. */
      const ordered = [...list].sort((a, b) => b.lat - a.lat);
      /* ⚠️⚠️ 좌우 번갈이만으로는 부족하다. 서해는 섬·방파제가 2km 간격이라
         120km 상공에서 13px 밖에 안 떨어진다 — 실측 화면에서 12개 중 절반이 뭉갰다.
         → 앞서 이름을 단 곳에서 **실거리로 멀리 떨어진 것만** 이름을 단다.
           나머지는 핀만 찍는다(있다는 건 보이고, 확대하면 이름이 나온다).
         ⚠️ 화면 좌표가 아니라 실거리로 판단한다 — 카메라가 움직일 때마다 다시
            계산하지 않기 위해서다. 그게 이 앱 발열의 원인이었다. */
      const LABEL_GAP_KM = 4;
      const labeled = [];
      ordered.forEach((s, i) => {
        const far = labeled.every(p => distKm(p.lat, p.lon, s.lat, s.lon) >= LABEL_GAP_KM);
        if (far) labeled.push(s);
        s._label = far;
        const sea = fishing._sea.get(s.name) || null;
        /* 지도에는 **물때와 너울**만 올린다.
           ⚠️ 낚시에서 먼저 알아야 할 둘이다. 나머지는 카드에 있다. */
        /* ⚠️ 지도 라벨은 **짧게**. "조차 5.8m · 너울 0.1m"는 한 줄이 너무 길어
           옆 지점을 덮는다. 단위 이름은 카드에 있다. */
        const bits = [];
        if (sea?.tide?.rangeM != null) bits.push(`${sea.tide.rangeM.toFixed(1)}m`);
        if (sea?.swellH != null && sea.swellH >= 0.5) bits.push(`너울 ${sea.swellH.toFixed(1)}`);
        const right = i % 2 === 0;
        const danger = sea?.swellH != null && sea.swellH >= FISH_RULES.swellDangerM;
        this._ds.entities.add({
          id: `fish:${s.name}`,
          position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
          billboard: {
            image: pinImage(s.kind), width: 22, height: 22,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, MARK_MAX_M),
          },
          ...(s._label ? { label: {
            text: s.name + (bits.length ? '  ' + bits.join(' · ') : ''),
            font: '600 11px -apple-system, sans-serif',
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            /* ⚠️ 위험한 곳만 배경을 붉게 한다. 색으로 말하는 유일한 것이 안전이다. */
            backgroundColor: Cesium.Color
              .fromCssColorString(danger ? '#3a1216' : '#0b1a20').withAlpha(0.8),
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            style: Cesium.LabelStyle.FILL,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: right ? Cesium.HorizontalOrigin.LEFT
                                    : Cesium.HorizontalOrigin.RIGHT,
            pixelOffset: new Cesium.Cartesian2(right ? 14 : -14, 0),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, MARK_MAX_M),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } } : {}),
          _fishSpot: s.name,
        });
      });
    } catch (e) { console.warn('[낚시] 지도 표시 실패 —', e.message); }
  },

  /* 권역 대표 — 멀리서는 "어느 바다가 물이 크게 가는가"를 먼저 말한다.
     ⚠️ 서핑은 "가장 큰 너울"이었지만 낚시는 **조차**다. 묻는 것이 다르기 때문이다. */
  async _fillRegions() {
    if (this._regions && Date.now() - this._regionsAt < 10 * 60_000) return this._regions;
    const picks = [], byRegion = new Map();
    fishing.regions().forEach(r => {
      const l = fishing.byRegion(r).slice().sort((a, b) => b.lat - a.lat);
      if (!l.length) return;
      const take = [];
      for (let i = 0; i < REGION_SAMPLES; i++) {
        const idx = Math.round((i / Math.max(1, REGION_SAMPLES - 1)) * (l.length - 1));
        if (!take.includes(l[idx])) take.push(l[idx]);
      }
      byRegion.set(r, take); picks.push(...take);
    });
    await fishing.sea(picks);
    const out = [];
    byRegion.forEach((take, r) => {
      const seas = take.map(s => fishing._sea.get(s.name)).filter(Boolean);
      const tr = seas.map(s => s.tide?.rangeM).filter(v => v != null);
      const sw = seas.map(s => s.swellH).filter(v => v != null);
      const st = seas.map(s => s.sst).filter(v => v != null);
      const all = fishing.byRegion(r);
      out.push({
        region: r,
        lat: all.reduce((s, b) => s + b.lat, 0) / all.length,
        lon: all.reduce((s, b) => s + b.lon, 0) / all.length,
        range: tr.length ? Math.max(...tr) : null,
        swell: sw.length ? Math.max(...sw) : null,
        sst: st.length ? st.reduce((a, b) => a + b, 0) / st.length : null,
        spots: all.length, sampled: seas.length,
      });
    });
    this._regions = out; this._regionsAt = Date.now();
    return out;
  },

  _markRegions() {
    const ko = i18n.lang === 'ko';
    this._fillRegions().then(rows => {
      if (this._markMode !== 'region') return;
      if (!this._regionsDrawn) { this._regionsDrawn = true; this.render(); }
      this._clearMarks();
      this._ensureDs();
      rows.forEach((r, i) => {
        const bits = [];
        if (r.range != null) bits.push(`조차 ${r.range.toFixed(1)}m`);
        if (r.swell != null) bits.push(`너울 ${r.swell.toFixed(1)}m`);
        const danger = r.swell != null && r.swell >= FISH_RULES.swellDangerM;
        this._ds.entities.add({
          id: `fish:r:${r.region}`,
          position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat),
          billboard: {
            image: pinImage('harbour'), width: 26, height: 26,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: shortR(r.region) + (bits.length ? '  ' + bits.join(' · ') : ''),
            font: '600 12px -apple-system, sans-serif',
            fillColor: Cesium.Color.WHITE, showBackground: true,
            backgroundColor: Cesium.Color
              .fromCssColorString(danger ? '#3a1216' : '#0b1a20').withAlpha(0.82),
            backgroundPadding: new Cesium.Cartesian2(7, 5),
            style: Cesium.LabelStyle.FILL,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: i % 2 ? Cesium.HorizontalOrigin.RIGHT
                                    : Cesium.HorizontalOrigin.LEFT,
            pixelOffset: new Cesium.Cartesian2(i % 2 ? -16 : 16, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          _fishRegion: r.region,
        });
      });
    }).catch(e => console.warn('[낚시] 권역 표시 실패 —', e.message));
  },

  async openRegion(region) {
    this._region = region;
    $('#fsSheet')?.classList.add('up', 'peek');
    await this._fill();
    this.render();
    this._marks();
    this._zoom(true);
  },

  focus(name) {
    $('#fsSheet')?.classList.add('up');
    const card = document.querySelector(`[data-fs-spot="${CSS.escape(name)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('sf-hit');
    setTimeout(() => card.classList.remove('sf-hit'), 1600);
  },

  /* ══ 시트 ══════════════════════════════════════════════════════ */
  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#fsBody');
    if (!body) return;
    const m = fishing.meta || {};
    const list = this._pick || [];

    const tabs = [
      ['near', ko ? '이 주변' : 'Here'],
      ['how', ko ? '읽는 법' : 'How to read'],
    ].map(([k, t]) =>
      `<button class="mt-tab${this._tab === k ? ' on' : ''}" data-fs-tab="${k}">${t}</button>`
    ).join('');

    const regions = fishing.regions().map(r => {
      const n = fishing.byRegion(r).length;
      if (!n) return '';
      return `<button class="mt-tab sm${this._region === r ? ' on' : ''}" `
        + `data-fs-region="${esc(r)}">${esc(shortR(r))} ${n}</button>`;
    }).join('');

    const peek = $('#fsSheet')?.classList.contains('peek');
    body.innerHTML = `
      <button class="sf-grow" data-fs-grow>${peek
        ? (ko ? '목록 크게 ▲' : 'Expand ▲') : (ko ? '지도 보기 ▼' : 'Show map ▼')}</button>
      <div class="mt-tabs">${tabs}</div>
      ${this._tab === 'how' ? this._how(ko) : `
        <div class="mt-tabs regions">
          <button class="mt-tab sm${!this._region ? ' on' : ''}" data-fs-region="">${
            ko ? '이 주변' : 'Here'}</button>${regions}
        </div>
        <p class="mt-times">${ko
          ? `${{ region: '', map: '<b>지금 보고 있는 지도</b> 주변입니다 · ',
                 me: '<b>내 위치</b> 주변입니다 · ',
                 home: '<b>태안 기준</b>입니다 (위치를 모릅니다) · ' }[this._at?.from] || ''}`
            + `방파제·항·섬 ${m.count}곳 · 바다 자료 Open-Meteo 해양`
          : `${m.count} spots · sea data from Open-Meteo Marine`}</p>
        ${this._markMode === 'region' ? this._regionList(ko) : ''}
        <div class="mt-list">${list.map(s => this._card(s, ko)).join('')}</div>
        ${this._foot(ko)}`}
    `;
  },

  _regionList(ko) {
    const rows = (this._regions || []).slice()
      .sort((a, b) => (b.range ?? -1) - (a.range ?? -1));
    if (!rows.length) return '';
    return `
      <div class="sf-rglist">
        <p class="sf-rghead">${ko
          ? `바다별 <b>오늘 조차</b> · 권역마다 ${REGION_SAMPLES}곳을 재서 낸 값입니다`
          : `Today's tidal range by sea · ${REGION_SAMPLES} sample points each`}</p>
        ${rows.map((r, i) => `
          <button class="sf-rg${i === 0 && r.range != null ? ' top' : ''}"
                  data-fs-region="${esc(r.region)}">
            <b>${esc(shortR(r.region))}</b>
            <span class="n">${r.range == null ? '—' : r.range.toFixed(1) + 'm'}</span>
            <em>${r.swell == null ? '' : '너울 ' + r.swell.toFixed(1) + 'm'}</em>
          </button>`).join('')}
        <p class="sf-rgnote">${ko
          ? '⚠️ 조차가 클수록 물이 크게 갑니다. 권역 전체를 잰 값이 아닙니다 — '
            + '바다를 누르거나 지도를 확대하면 지점별로 나옵니다.'
          : '⚠️ Sampled, not a full survey. Tap a sea or zoom in.'}</p>
      </div>`;
  },

  _windAt(s) {
    if (!this._wind?.stations) return null;
    const st = nearest(this._wind.stations, s.lat, s.lon, WIND_MAX_KM);
    if (!st) return null;
    const spd = st.ws10 ?? st.ws1;
    if (spd == null) return null;
    return { speed: spd, dir: st.wd10 ?? st.wd1, name: st.name, km: Math.round(st.km) };
  },

  _card(s, ko) {
    const sea = fishing._sea.get(s.name) || null;
    const wind = this._windAt(s);
    const head = `
      <header>
        <h4>${esc(s.name)}</h4>
        <span class="mt-alt">${esc(s.kindKo)}${s.km != null ? ` · ${s.km}km` : ''}</span>
      </header>`;

    if (!sea) {
      return `<article class="mt-card" data-fs-spot="${esc(s.name)}">${head}
        <p class="sf-none">${ko ? '이 지점의 바다 자료가 없습니다'
                                : 'No sea data at this point'}</p></article>`;
    }

    const sf = safety(sea, wind, s, ko);
    const t = sea.tide;
    const v = (x, d = 1) => (x == null ? '—' : x.toFixed(d));

    /* ⚠️⚠️ 안전을 **맨 위**에 둔다. 아래에 두면 조차·수온을 보고 그냥 나간다. */
    const safe = `
      <div class="fs-safe ${sf.level}">
        ${sf.lines.map(l => `<p>${md(l)}</p>`).join('')}
      </div>`;

    /* 물때 — 낚시에서 가장 크게 봐야 하는 값.
       ⚠️ 물때 번호(몇 물)는 적지 않는다. 서해식·남해식이 어긋나 틀리면 하루를 버린다.
          대신 조차와 다음 만조·간조를 적는다 (fishing.js 머리말 참고). */
    const PHASE = { spring: ko ? '사리에 가까움' : 'near spring tide',
                    mid: ko ? '중간' : 'mid',
                    neap: ko ? '조금에 가까움' : 'near neap tide' };
    const tide = !t ? '' : `
      <div class="fs-tide${t.matters ? '' : ' dim'}">
        <div class="fs-trow">
          <span class="k">${ko ? '오늘 조차' : "Today's range"}</span>
          <span class="n">${v(t.rangeM, 2)}<i>m</i></span>
          <span class="s">${t.phase ? PHASE[t.phase] : ''}</span>
        </div>
        ${t.next?.length ? `<p class="fs-next">${t.next.slice(0, 2).map(x =>
          `${x.kind === 'high' ? (ko ? '만조' : 'High') : (ko ? '간조' : 'Low')} `
          + `<b>${clock(x.at, ko)}</b>`).join(' · ')}</p>` : ''}
        ${t.maxRangeM ? `<p class="fs-cmp">${ko
          ? `이번 ${t.days}일 중 가장 큰 날은 ${v(t.maxRangeM, 2)}m 입니다`
          : `Largest in the next ${t.days} days: ${v(t.maxRangeM, 2)} m`}</p>` : ''}
        ${!t.matters ? `<p class="fs-cmp">${ko
          ? '⚠️ 이 바다는 조차가 작아 물때의 영향이 크지 않습니다'
          : '⚠️ Small tidal range here — tide matters less'}</p>` : ''}
      </div>`;

    const trio = `
      <div class="sf-trio">
        <div class="sf-cell">
          <span class="k">${ko ? '너울' : 'Swell'}</span>
          <span class="n">${v(sea.swellH)}<i>m</i></span>
          <span class="s">${sea.swellPeriod ? `${v(sea.swellPeriod, 0)}${ko ? '초' : 's'}` : ''}</span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '수온' : 'Sea temp'}</span>
          <span class="n">${v(sea.sst)}<i>°</i></span>
          <span class="s"></span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '물살' : 'Current'}</span>
          <span class="n">${v(sea.cur, 2)}<i>m/s</i></span>
          <span class="s">${wind ? `${ko ? '바람' : 'wind'} ${v(wind.speed)}m/s` : ''}</span>
        </div>
      </div>`;

    return `<article class="mt-card" data-fs-spot="${esc(s.name)}">
      ${head}${safe}${tide}${trio}</article>`;
  },

  _how(ko) {
    if (!ko) {
      return `<div class="mt-foot">
        <p>We report three things and nothing more: how much the water moves (tidal range),
        whether it is dangerous to go out now (swell and wind), and how cold the water is.</p>
        <p><b>We never say the fishing is good.</b> Catch depends on things we cannot see.</p>
        <p><b>Tide numbers (몇 물) are not shown</b> because the west-coast and south-coast
        conventions disagree by a day. We give the measured tidal range instead — which is
        what those numbers stand for.</p></div>`;
    }
    return `<div class="mt-foot">
      <p><b>이 화면이 말하는 것은 셋뿐입니다.</b><br>
        ① 물이 얼마나 움직이는가 (조차)<br>
        ② 지금 나가면 위험한가 (너울·바람)<br>
        ③ 물이 얼마나 찬가 (수온)</p>
      <p>⚠️ <b>"잘 나온다"고 말하지 않습니다.</b> 조황은 어군·미끼·시기·그날의 운이
        섞인 값이고, 그건 우리가 아는 값이 아닙니다. 무슨 고기가 나오는지도 적지 않습니다.</p>
      <p>⚠️ <b>물때 번호(몇 물)는 적지 않습니다.</b> 서해식(8물때)과 남해식(7물때)이
        하루씩 어긋나고 지역마다 부르는 법이 또 다릅니다. 틀린 물때를 적으면 그날 하루를
        통째로 버리게 만듭니다. 대신 <b>실제 조위 예보에서 잰 조차</b>를 적습니다 —
        물때 번호가 대신 말하려던 것이 바로 그 값입니다.</p>
      <p>⚠️ <b>만조·간조 시각은 최대 30분쯤 어긋납니다.</b> 예보 곡선이 1시간 간격이라
        봉우리를 정확히 짚지 못합니다. 물때표 대신 쓰지 마세요.</p>
      <p><b>안전 문턱</b><br>
        너울 ${FISH_RULES.swellWatchM}m 이상 — 갯바위·방파제에서 조심<br>
        너울 ${FISH_RULES.swellDangerM}m 이상 — 올라가지 말 것<br>
        바람 ${FISH_RULES.windDangerMs}m/s 이상 — 배는 대부분 못 뜸</p>
      <p>⚠️ 낮은 값이 나와도 <b>"안전합니다"라고 말하지 않습니다.</b> 발판·이끼·조류·수심,
        혼자인지, 구명조끼를 입었는지 — 우리가 모르는 것이 훨씬 많습니다.</p>
    </div>`;
  },

  _foot(ko) {
    const m = fishing.meta || {};
    return `<div class="mt-foot">
      <p>${ko
        ? '지점 자료 OpenStreetMap (ODbL) · 바다 자료 Open-Meteo 해양 · 바람 기상청 AWS'
        : 'Spots: OpenStreetMap (ODbL) · Sea: Open-Meteo Marine · Wind: KMA AWS'}</p>
      <p>⚠️ ${ko
        ? (m.note?.ko || '')
        : (m.note?.en || '')}</p>
    </div>`;
  },
};

function shortR(r) { return String(r || '').replace(/\s*\(.*$/, '').trim(); }
