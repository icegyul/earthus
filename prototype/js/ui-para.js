/* 패러글라이딩 시트 — 바람과 구름 밑면
 *
 * ⚠️⚠️ **"날기 좋다"고 말하지 않는다.** 서핑·낚시와 같은 규율이고, 여기가 가장 엄하다.
 *    이륙 가능 여부는 그 사람의 등급·날개·경험에 달렸고, 무엇보다
 *    **이륙장이 어느 쪽을 보는지를 우리가 모른다** — 정풍이어야 뜨는데 그 방향이 자료에 없다.
 *    우리가 할 수 있는 것은 값을 정확히 옮기고 어느 구간인지 말하는 것뿐이다.
 *
 * ⚠️⚠️ **좌표는 산 정상이지 이륙장이 아니다.** 찾아가는 좌표로 쓰면 안 된다.
 */

import { i18n } from './i18n.js';
import { para, PARA_RULES, windBand, BAND_KO, BAND_EN, dir16 } from './para.js';
import { myLocation } from './mylocation.js';
import { viewer, onCameraIdle } from './viewer.js';
import { intro } from './intro.js';
import { distKm } from './korea.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ⚠️⚠️ 활공장은 **전국에 17곳**뿐이라 서로 100km 넘게 떨어져 있다.
   해변(120km)처럼 잡으면 한두 곳만 보인다 — 실측 화면에서 감악산·남산·양방산만
   들어왔다. 한반도가 통째로 들어오는 높이로 잡는다. */
const ZOOM_M = 780_000;
const ZOOM_SKIP_M = 1_400_000;
const MARK_MAX_M = 2_600_000;
const LABEL_GAP_KM = 38;   // 780km 상공 기준. 22km 면 이름표가 붙는다

const BAND_COLOR = {
  light: '#8fb8c8', ok: '#7fd8a8', brisk: '#f2c15a',
  strong: '#f0955a', danger: '#e8556a',
};

let _pin = null;
function pinImage() {
  if (_pin) return _pin;
  const S = 48, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
  g.fillStyle = '#b9a7f0'; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.5)'; g.stroke();
  // 캐노피 — 반원 아래로 줄 두 가닥
  g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 3.2; g.lineCap = 'round';
  g.beginPath(); g.arc(S / 2, S / 2 + 2, 13, Math.PI, 0); g.stroke();
  g.beginPath();
  g.moveTo(S / 2 - 13, S / 2 + 2); g.lineTo(S / 2, S / 2 + 15);
  g.moveTo(S / 2 + 13, S / 2 + 2); g.lineTo(S / 2, S / 2 + 15);
  g.stroke();
  _pin = c.toDataURL('image/png');
  return _pin;
}

export const paraPanel = {
  _tab: 'near',
  _ready: false,

  init() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-pg-grow]')) { this.toggleHeight(); return; }
      const t = e.target.closest('[data-pg-tab]');
      if (t) { this._tab = t.dataset.pgTab; this.render(); }
    });
    onCameraIdle(() => this._onCamera());
    return this;
  },

  async open() {
    $('#pgSheet')?.classList.add('up', 'peek');
    intro.stop();
    const ko = i18n.lang === 'ko';
    const body = $('#pgBody');
    if (!this._ready) body.innerHTML =
      `<p class="mt-load">${ko ? '활공장 자료를 받는 중…' : 'Loading…'}</p>`;
    try {
      await para.load();
      await this._fill();
      this._ready = true;
      this.render();
      this._marks();
      setTimeout(() => this._zoom(), 380);
    } catch (e) {
      body.innerHTML = `<p class="mt-load">${ko ? '활공장 자료를 받지 못했습니다'
        : 'Could not load'}<br><small>${esc(e.message)}</small></p>`;
    }
  },

  close() { $('#pgSheet')?.classList.remove('up'); this._clearMarks(); },

  toggleHeight() {
    const el = $('#pgSheet');
    if (!el) return;
    el.classList.toggle('peek');
    this.render();
    setTimeout(() => this._zoom(true), 380);
  },

  async _fill() {
    /* ⚠️ 활공장이 17곳뿐이라 **전부** 받는다. 가까운 것만 고르면
       "왜 저기는 안 나오지"가 된다 — 전국이 한 화면에 들어오는 개수다. */
    this._pick = para.list.slice();
    const p = myLocation.coords;
    if (p) {
      this._pick = this._pick.map(s => ({ ...s, km: Math.round(distKm(p.lat, p.lon, s.lat, s.lon)) }))
        .sort((a, b) => a.km - b.km);
    }
    await para.now(this._pick);
  },

  _center() {
    const l = this._pick || [];
    if (!l.length) return null;
    return { lat: l.reduce((s, b) => s + b.lat, 0) / l.length,
             lon: l.reduce((s, b) => s + b.lon, 0) / l.length };
  },

  _sheetShiftDeg() {
    const vh = window.innerHeight || 900;
    const el = $('#pgSheet');
    const top = el ? el.getBoundingClientRect().top : vh;
    const shiftPx = vh / 2 - Math.max(0, top) / 2;
    if (!(shiftPx > 0)) return 0;
    const fovy = viewer.camera?.frustum?.fovy ?? (Math.PI / 3);
    return (shiftPx * ((2 * ZOOM_M * Math.tan(fovy / 2)) / vh)) / 111_320;
  },

  _zoom(force) {
    try {
      const h = viewer.camera.positionCartographic?.height ?? Infinity;
      if (!force && h < ZOOM_SKIP_M) return;
      intro.stop();
      viewer.camera.cancelFlight?.();
      viewer.scene.tweens?.removeAll?.();
      const c = this._center();
      if (!c) return;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat - this._sheetShiftDeg(), ZOOM_M),
        duration: 1.6,
      });
    } catch (_) { }
  },

  _onCamera() {
    const el = $('#pgSheet');
    if (!el?.classList.contains('up')) return;
  },

  _ensureDs() {
    if (!this._ds) {
      this._ds = new Cesium.CustomDataSource('para');
      viewer.dataSources.add(this._ds);
    }
    return this._ds;
  },
  _clearMarks() { try { this._ds?.entities.removeAll(); } catch (_) { } },

  _marks() {
    this._clearMarks();
    const ko = i18n.lang === 'ko';
    const list = this._pick || [];
    if (!list.length) return;
    try {
      this._ensureDs();
      const img = pinImage();
      const ordered = [...list].sort((a, b) => b.lat - a.lat);
      const labeled = [];
      ordered.forEach((s, i) => {
        const n = para._now.get(s.name) || null;
        const far = labeled.every(p => distKm(p.lat, p.lon, s.lat, s.lon) >= LABEL_GAP_KM);
        if (far) labeled.push(s);
        const band = n ? windBand(n.wind) : null;
        const col = Cesium.Color.fromCssColorString(BAND_COLOR[band] || '#b9a7f0');
        const bits = [];
        if (n?.wind != null) bits.push(`${n.wind.toFixed(1)}m/s`);
        if (n?.dir != null) bits.push(dir16(n.dir, ko));
        const right = i % 2 === 0;
        this._ds.entities.add({
          id: `para:${s.name}`,
          position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
          billboard: {
            image: img, width: 22, height: 22,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, MARK_MAX_M),
          },
          ...(far ? {
            label: {
              text: s.name.replace(' 활공장', '') + (bits.length ? '  ' + bits.join(' ') : ''),
              font: '600 11px -apple-system, sans-serif',
              fillColor: Cesium.Color.WHITE, showBackground: true,
              /* ⚠️ 배경색이 **바람 구간**이다. 색으로 말하는 유일한 것 */
              backgroundColor: col.withAlpha(0.34),
              backgroundPadding: new Cesium.Cartesian2(6, 4),
              style: Cesium.LabelStyle.FILL,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: right ? Cesium.HorizontalOrigin.LEFT
                                      : Cesium.HorizontalOrigin.RIGHT,
              pixelOffset: new Cesium.Cartesian2(right ? 14 : -14, 0),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, MARK_MAX_M),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          } : {}),
          _paraSite: s.name,
        });
      });
    } catch (e) { console.warn('[활공장] 지도 표시 실패 —', e.message); }
  },

  focus(name) {
    $('#pgSheet')?.classList.add('up');
    const card = document.querySelector(`[data-pg-site="${CSS.escape(name)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('sf-hit');
    setTimeout(() => card.classList.remove('sf-hit'), 1600);
  },

  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#pgBody');
    if (!body) return;
    const list = this._pick || [];
    const m = para.meta || {};
    const tabs = [['near', ko ? '활공장' : 'Sites'], ['how', ko ? '읽는 법' : 'How to read']]
      .map(([k, t]) => `<button class="mt-tab${this._tab === k ? ' on' : ''}" data-pg-tab="${k}">${t}</button>`)
      .join('');
    const peek = $('#pgSheet')?.classList.contains('peek');
    body.innerHTML = `
      <button class="sf-grow" data-pg-grow>${peek
        ? (ko ? '목록 크게 ▲' : 'Expand ▲') : (ko ? '지도 보기 ▼' : 'Show map ▼')}</button>
      <div class="mt-tabs">${tabs}</div>
      ${this._tab === 'how' ? this._how(ko) : `
        <p class="mt-times">${ko
          ? `활공장 <b>${m.count}곳</b> · 바람 Open-Meteo`
          : `${m.count} sites · wind from Open-Meteo`}</p>
        <div class="pg-warn">${ko
          ? '좌표 기준 · <b>산 정상</b> · 이륙장 위치는 현장 정보 확인'
          : 'Coordinate basis · <b>summit</b> · check local launch information'}</div>
        <div class="mt-list">${list.map(s => this._card(s, ko)).join('')}</div>
        ${this._foot(ko)}`}
    `;
  },

  _card(s, ko) {
    const n = para._now.get(s.name) || null;
    const head = `
      <header>
        <h4>${esc(s.name)}</h4>
        <span class="mt-alt">${esc(s.peak)}${s.alt ? ` ${Math.round(s.alt)}m` : ''}${
          s.km != null ? ` · ${s.km}km` : ''}</span>
      </header>`;
    if (!n) {
      return `<article class="mt-card" data-pg-site="${esc(s.name)}">${head}
        <p class="sf-none">${ko ? '이 지점의 바람 자료가 없습니다' : 'No wind data'}</p></article>`;
    }
    const band = windBand(n.wind);
    const gustGap = (n.gust != null && n.wind != null) ? n.gust - n.wind : null;
    const v = (x, d = 1) => (x == null ? '—' : x.toFixed(d));

    /* ⚠️⚠️ 돌풍 차이를 **따로** 말한다. 평균 풍속보다 이게 더 위험하다 —
       4m/s 평균에 돌풍 12m/s 면 날개가 접힌다. */
    let gustLine = '';
    if (gustGap != null) {
      const cls = gustGap >= PARA_RULES.gustDanger ? 'danger'
                : gustGap >= PARA_RULES.gustWatch ? 'watch' : 'low';
      gustLine = `<p class="pg-gust ${cls}">${ko
        ? `돌풍 <b>${v(n.gust)}m/s</b> — 평균보다 <b>${v(gustGap)}m/s</b> 높습니다`
        : `Gusts ${v(n.gust)} m/s — ${v(gustGap)} m/s above mean`}${
        gustGap >= PARA_RULES.gustDanger
          ? (ko ? '. 날개가 접힐 수 있는 차이입니다.' : '. Enough to collapse a wing.') : ''}</p>`;
    }

    return `<article class="mt-card" data-pg-site="${esc(s.name)}">
      ${head}
      <div class="pg-band ${band}">
        <div class="pg-w"><span class="n">${v(n.wind)}</span><i>m/s</i>
          <em>${dir16(n.dir, ko)}</em></div>
        <p>${ko ? BAND_KO[band] : BAND_EN[band]}</p>
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
      <p class="pg-note">${ko ? '풍속 기준 높이 · <b>지상 10m</b>' : 'Wind reference height · <b>10 m AGL</b>'}</p>
    </article>`;
  },

  _how(ko) {
    if (!ko) {
      return '<div class="mt-foot"><p>Inputs · 10 m wind · gust · cloud base · temperature</p></div>';
    }
    return `<div class="mt-foot">
      <p><b>바람 표시 구간</b><br>
        ${PARA_RULES.lightMs}m/s 미만 — 약함, 이륙이 어려울 수 있음<br>
        ${PARA_RULES.lightMs}~${PARA_RULES.okHiMs}m/s — 흔히 말하는 적정 구간<br>
        ${PARA_RULES.okHiMs}~${PARA_RULES.strongMs}m/s — 센 편<br>
        ${PARA_RULES.strongMs}m/s 이상 — 강함<br>
        ${PARA_RULES.dangerMs}m/s 이상 — 대부분 비행을 접음</p>
      <p>돌풍 경계 · 평균보다 ${PARA_RULES.gustDanger}m/s 이상 높을 때 강조</p>
      <p>구름 밑면 근사 · (기온−이슬점) × 125m</p>
      <p>풍속 기준 높이 · <b>지상 10m</b></p>
    </div>`;
  },

  _foot(ko) {
    const m = para.meta || {};
    return `<div class="mt-foot">
      <p>${ko ? '위치 OpenStreetMap (ODbL) · 바람 Open-Meteo'
              : 'Locations: OpenStreetMap (ODbL) · Wind: Open-Meteo'}</p>
      ${m.generated ? `<p>${ko ? '자료 시각' : 'Data time'} · ${esc(m.generated)}</p>` : ''}
    </div>`;
  },
};
