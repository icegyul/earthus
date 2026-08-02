/* 서핑 시트 — 이 해변에 스웰이 들어오는가
 *
 * 화면의 뼈대는 셋이다. 하나로 합치지 않는다:
 *     ① 스웰이 들어오는가   (스웰 방향 vs 해변이 보는 방향)
 *     ② 파면이 깔끔한가     (바람이 육풍인가 해풍인가)
 *     ③ 어떤 파도인가       (주기 — 잡파인가 너울인가)
 *
 * ⚠️ **점수를 만들지 않는다.** "서핑 지수 7.2점"은 근거 없이 권위를 갖고
 *    무엇 때문에 7.2인지 아무도 모른다. 셋을 각각 말하고 합치는 판단은 타는 사람이 한다.
 *
 * ⚠️ **"타기 좋습니다"라고 말하지 않는다.** 바다에서는 사람이 죽는다.
 *    이안류·조류·수심·바닥은 우리가 모르는 값이고, 모르면서 권할 수 없다.
 */

import { i18n } from './i18n.js';
import { beaches } from './beaches.js';
import { judge, SURF_RULES } from './surf.js';
import { get, nearest } from './korea.js';
import { myLocation } from './mylocation.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const DIR8_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirText = (deg, ko) => deg == null ? '—'
  : (ko ? DIR8 : DIR8_EN)[Math.round(deg / 45) % 8];

/* 바람 관측소를 해변에서 얼마나 멀리까지 찾을까.
   ⚠️ 너무 멀면 산 너머 바람을 해변 바람이라고 말하게 된다. */
const WIND_MAX_KM = 25;

const N_SHOW = 12;

export const surfPanel = {
  _tab: 'near',
  _ready: false,
  _wind: null,

  init() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-sf-tab]');
      if (t) { this._tab = t.dataset.sfTab; this.render(); }
    });
    return this;
  },

  async open() {
    $('#sfSheet')?.classList.add('up');
    const ko = i18n.lang === 'ko';
    const body = $('#sfBody');
    if (!this._ready) body.innerHTML =
      `<p class="mt-load">${ko ? '해변 자료를 받는 중…' : 'Loading…'}</p>`;
    try {
      await beaches.load();
      /* 바람은 기상청 AWS 736지점에서 가져온다.
         ⚠️ 없어도 화면은 뜬다 — 바람 없이도 스웰·주기는 말할 수 있다. */
      try { this._wind = await get('aws'); } catch (_) { this._wind = null; }
      await this._fill();
      this._ready = true;
      this.render();
    } catch (e) {
      body.innerHTML = `<p class="mt-load">${ko ? '해변 자료를 받지 못했습니다'
        : 'Could not load'}<br><small>${esc(e.message)}</small></p>`;
    }
  },

  close() { $('#sfSheet')?.classList.remove('up'); },

  /** 지금 보여줄 해변들의 파랑을 한 번에 받아 둔다 */
  async _fill() {
    const p = myLocation.coords;
    /* ⚠️ 위치를 모르면 **양양**을 기준으로 삼는다. 목록 순서대로 자르면
       남해 동부가 먼저 나오는데, 한국에서 서핑이 실제로 이뤄지는 곳은
       동해 북부(양양·고성)다. 임의로 자른 목록보다 이쪽이 맞다. */
    const HOME = { lat: 38.02, lon: 128.72 };      // 죽도해변 근처
    const at = p || HOME;
    const pick = beaches.near(at.lat, at.lon, N_SHOW);
    this._fromHome = !p;
    this._pick = pick;
    await beaches.sea(pick);
  },

  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#sfBody');
    if (!body) return;
    const m = beaches.meta || {};

    const list = this._pick || [];
    const tabs = [
      ['near', ko ? '가까운 해변' : 'Nearby'],
      ['how', ko ? '읽는 법' : 'How to read'],
    ].map(([k, t]) =>
      `<button class="mt-tab${this._tab === k ? ' on' : ''}" data-sf-tab="${k}">${t}</button>`
    ).join('');

    body.innerHTML = `
      <div class="mt-tabs">${tabs}</div>
      ${this._tab === 'how' ? this._how(ko) : `
        <p class="mt-times">${ko
          ? `${this._fromHome ? '<b>양양 기준</b>입니다 (위치를 모릅니다) · ' : ''}`
            + `해변 ${m.count}곳 중 바다 방향을 낸 곳 ${m.withFacing}곳 · 파랑 자료 Open-Meteo 해양`
          : `${m.withFacing} of ${m.count} beaches have a shore orientation · waves: Open-Meteo Marine`}</p>
        <div class="mt-list">${list.map(b => this._card(b, ko)).join('')}</div>
        ${this._foot(ko)}`}
    `;
  },

  _windAt(b) {
    if (!this._wind?.stations) return null;
    const st = nearest(this._wind.stations, b.lat, b.lon, WIND_MAX_KM);
    if (!st) return null;
    const dir = st.wd10 ?? st.wd1;
    const spd = st.ws10 ?? st.ws1;
    if (dir == null) return null;
    return { dir, speed: spd ?? null, name: st.name, km: Math.round(st.km) };
  },

  _card(b, ko) {
    const sea = beaches._sea.get(b.name) || null;
    const wind = this._windAt(b);
    const j = judge(b, sea, wind, ko);

    if (!j.ok) {
      return `<article class="mt-card">
        <header><h4>${esc(b.name)}</h4>
          <span class="mt-alt">${b.km != null ? `${b.km}km` : ''}</span></header>
        <p class="sf-none">${esc(j.why)}</p></article>`;
    }

    const cls = { direct: 'good', angled: 'ok', glancing: 'weak', blocked: 'bad' };
    const wcls = { offshore: 'good', cross: 'ok', onshore: 'bad' };

    return `
      <article class="mt-card">
        <header>
          <h4>${esc(b.name)}</h4>
          <span class="mt-alt">${ko ? '해변 방향' : 'Faces'} ${b.facing}°
            ${dirText(b.facing, ko)}${b.km != null ? ` · ${b.km}km` : ''}</span>
        </header>

        <div class="sf-main">
          <div class="sf-h">
            <span class="n">${j.height.toFixed(1)}</span><span class="u">m</span>
            <span class="lab">${ko ? '파고' : 'Wave'}</span>
          </div>
          <div class="sf-p">
            <span class="n">${j.period ? j.period.s.toFixed(1) : '—'}</span><span class="u">s</span>
            <span class="lab">${ko ? '주기' : 'Period'}</span>
          </div>
        </div>

        <ul class="sf-rows">
          <li class="${cls[j.exposure.key] || ''}">
            <i>${ko ? '스웰' : 'Swell'}</i>
            <b>${j.exposure.text}</b>
            <em>${ko ? `${j.exposure.gapDeg}° 차이` : `${j.exposure.gapDeg}° off`}</em>
          </li>
          ${j.period ? `<li class="${j.period.key === 'wind' ? 'weak' : 'good'}">
            <i>${ko ? '파도' : 'Type'}</i><b>${j.period.text}</b></li>` : ''}
          ${j.wind ? `<li class="${wcls[j.wind.key] || ''}">
            <i>${ko ? '바람' : 'Wind'}</i>
            <b>${j.wind.text}</b>
            <em>${j.wind.speed != null ? `${j.wind.speed.toFixed(1)} m/s` : ''}</em>
          </li>` : `<li><i>${ko ? '바람' : 'Wind'}</i>
            <b class="dim">${ko ? '가까운 관측소가 없습니다' : 'No nearby station'}</b></li>`}
        </ul>
      </article>`;
  },

  _how(ko) {
    const P = SURF_RULES.PERIOD;
    return `<div class="mt-note">${ko ? `
      <b>파고만으로는 아무 말도 안 됩니다.</b><br>
      파고 1.5m · 주기 6초 → 잡파. 파고 1.5m · 주기 14초 → 좋은 너울.
      같은 1.5m 인데 완전히 다릅니다.
      <br><br>
      <b>그리고 그 해변에 들어와야 합니다.</b> 북향 해변에 남쪽 스웰은 안 들어옵니다.
      그래서 스웰이 오는 방향과 <b>해변이 보는 방향</b>을 견줍니다 —
      전국 해변 ${beaches.meta?.withFacing ?? 0}곳의 방향을
      OpenStreetMap 해안선에서 계산해 두었습니다.
      <br><br>
      <b>바람은 파면을 만들거나 부숩니다.</b> 육지에서 바다로 부는 육풍은
      파면을 세워 깔끔하게 하고, 바다에서 불어오는 해풍은 뭉갭니다.
      ` : `
      <b>Wave height alone says nothing.</b><br>
      1.5 m at 6 s is chop; 1.5 m at 14 s is a good groundswell.
      <br><br><b>And it has to reach the beach.</b> A south swell does not enter a
      north-facing beach, so we compare swell direction against the
      <b>shore orientation</b> of ${beaches.meta?.withFacing ?? 0} beaches,
      computed from OpenStreetMap coastlines.
      <br><br><b>Wind shapes or ruins the face.</b> Offshore cleans it up; onshore blows it out.`}
      <br><br>
      <b>${ko ? '주기 구분 (저희 기준)' : 'Period bands (ours)'}</b><br>
      ${P.map(p => `· ~${p.max}s ${ko ? p.ko : p.en}`).join('<br>')}
    </div>`;
  },

  _foot(ko) {
    const m = beaches.meta || {};
    return `<p class="mt-foot">
      ${ko ? `⚠️ <b>“타기 좋다”고 말하지 않습니다.</b> 이안류·조류·수심·바닥은 저희가
        모르는 값이고, 모르면서 권할 수 없습니다. 파도·바람·방향만 있는 그대로 놓습니다.
        <br>⚠️ 스웰 노출·바람 구간과 주기 구분은 <b>저희가 정한 표시 기준</b>입니다.
        확실한 것은 “90°를 넘으면 육지가 막는다” 하나뿐이고 그 안을 어떻게 나눌지는 판단입니다.
        <br>⚠️ 해변 방향은 해안선에서 계산한 값이라 <b>실제 지형과 다를 수 있습니다</b>
        (본토 해안 90%가 기대 방향과 맞는 것까지 확인했습니다).
        방파제·이안제가 있는 곳은 특히 다릅니다.
        <br><small>${esc(m.source || '')} · ${esc(m.license || '')} · 파랑 Open-Meteo 해양</small>`
      : `⚠️ <b>We never say “good to surf.”</b> Rips, currents, depth and bottom are
        unknown to us. Only waves, wind and orientation are stated as they are.
        <br>⚠️ The exposure/wind/period bands are <b>ours</b>, not a standard.
        <br><small>${esc(m.source || '')} · ${esc(m.license || '')}</small>`}
    </p>`;
  },
};
