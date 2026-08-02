/* 산 시트 — 정상 예보와 실측을 나란히
 *
 * 화면의 뼈대는 하나다:
 *     기상청 예보는 몇 도이고, **실제로 잰 값은 몇 도인가.**
 * 두 숫자가 다르면 그 차이를 크게 적는다. 그게 이 기능의 값어치다.
 * (왜 다른지, 얼마나 다른지는 mountain.js 머리말 참고)
 *
 * ⚠️ "안전합니다"·"등산하기 좋습니다" 같은 말을 쓰지 않는다.
 *    산에서는 사람이 죽고 우리는 예보 기관이 아니다.
 */

import { i18n } from './i18n.js';
import { mountain } from './mountain.js';
import { myLocation } from './mylocation.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const hhmm = (d) => d
  ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Seoul' }).format(d)
  : '—';

/** 풍향(도) → 여덟 방위 */
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const DIR8_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirText = (deg, ko) => deg == null ? ''
  : (ko ? DIR8 : DIR8_EN)[Math.round(deg / 45) % 8];

export const mountainPanel = {
  _tab: 'near',        // near | obs | all
  _ready: false,

  init() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-mt-tab]');
      if (t) { this._tab = t.dataset.mtTab; this.render(); }
    });
    return this;
  },

  async open() {
    $('#mtSheet')?.classList.add('up');
    const body = $('#mtBody');
    const ko = i18n.lang === 'ko';
    if (!this._ready) {
      body.innerHTML = `<p class="mt-load">${ko ? '산 자료를 받는 중…' : 'Loading…'}</p>`;
    }
    try {
      await mountain.build();
      this._ready = true;
      this.render();
    } catch (e) {
      body.innerHTML = `<p class="mt-load">${ko ? '산 자료를 받지 못했습니다' : 'Could not load'}
        <br><small>${esc(e.message)}</small></p>`;
    }
  },

  close() { $('#mtSheet')?.classList.remove('up'); },

  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#mtBody');
    if (!body) return;
    const m = mountain.meta || {};

    let list;
    if (this._tab === 'obs') list = mountain.withObs();
    else if (this._tab === 'near') {
      const p = myLocation.pos;
      list = p ? mountain.near(p.lat, p.lon, 12)
               : mountain.peaks.slice(0, 12);
    } else list = mountain.peaks;

    const tabs = [
      ['near', ko ? '가까운 산' : 'Nearby'],
      ['obs', ko ? `실측 있는 산 ${m.withHigh ?? 0}` : `Measured ${m.withHigh ?? 0}`],
      ['all', ko ? `전체 ${m.count ?? 0}` : `All ${m.count ?? 0}`],
    ].map(([k, t]) =>
      `<button class="mt-tab${this._tab === k ? ' on' : ''}" data-mt-tab="${k}">${t}</button>`
    ).join('');

    /* ⚠️ 예보 시각과 관측 시각을 **맨 위에** 적는다.
       둘이 다른 시각의 값이라는 걸 모르고 비교하면 우리가 사람을 속이는 것이 된다. */
    const times = ko
      ? `기상청 예보 ${m.fcstBase || '—'} 기준 · 관측 ${hhmm(mountain.peaks[0]?.obsAt)} 실황`
      : `KMA forecast ${m.fcstBase || '—'} · observed ${hhmm(mountain.peaks[0]?.obsAt)}`;

    body.innerHTML = `
      <div class="mt-tabs">${tabs}</div>
      <p class="mt-times">${esc(times)}</p>
      ${this._tab === 'obs' ? this._obsIntro(ko) : ''}
      <div class="mt-list">${list.map(p => this._card(p, ko)).join('')}</div>
      ${this._foot(ko)}
    `;
  },

  _obsIntro(ko) {
    const m = mountain.meta || {};
    return `<div class="mt-note">${ko
      ? `<b>같은 산에 관측소가 있는 봉우리</b>입니다. 기상청 <b>예보</b>와
         실제로 <b>잰 값</b>을 나란히 놓았습니다 —
         둘이 다르면 그 차이를 적습니다.
         <br>⚠️ 환산은 고도 1km 당 <b>${m.lapse}도</b>(ECMWF 기준)로 했고,
         환산 거리가 ${mountain.EXTRAPOLATE_MAX_M}m 를 넘으면 아예 하지 않습니다.`
      : `<b>Peaks with a station on the same mountain.</b> The KMA <b>forecast</b>
         sits next to what was actually <b>measured</b>.
         <br>⚠️ Extrapolated at <b>${m.lapse}°C/km</b> (ECMWF), and not at all
         beyond ${mountain.EXTRAPOLATE_MAX_M} m.`}</div>`;
  },

  _card(p, ko) {
    const marks = mountain.marks(p, ko);
    const big = p.temp != null ? p.temp.toFixed(0) : '—';

    // 실측 줄 — 이 기능의 핵심
    let obs = '';
    if (p.high) {
      const g = p.gap;
      const cls = g == null ? '' : (Math.abs(g) >= mountain.MARK.gapC ? ' big' : '');
      obs = `
        <div class="mt-obs${cls}">
          <div class="mt-obs-h">${ko ? '실제로 잰 값' : 'Measured'}</div>
          <div class="mt-obs-row">
            <b>${esc(p.high.name)}</b>
            <span>${p.high.alt.toFixed(0)}m</span>
            <strong>${p.high.temp.toFixed(1)}°</strong>
          </div>
          ${p.est != null ? `
          <div class="mt-obs-row sub">
            <span>${ko ? `정상(${p.alt.toFixed(0)}m)까지 ${p.high.upM}m 환산`
                       : `extrapolated ${p.high.upM} m to summit`}</span>
            <strong>${p.est.toFixed(1)}°</strong>
          </div>
          <div class="mt-gap${g > 0 ? ' warm' : ' cool'}">
            ${ko ? `기상청 예보가 <b>${Math.abs(g).toFixed(1)}도 ${g > 0 ? '더 따뜻' : '더 차갑'}</b>${g > 0 ? '합니다' : '습니다'}`
                 : `KMA forecast is <b>${Math.abs(g).toFixed(1)}°C ${g > 0 ? 'warmer' : 'colder'}</b>`}
          </div>` : `
          <div class="mt-obs-row sub">
            <span>${ko ? `정상까지 ${p.high.upM}m — 너무 멀어 환산하지 않습니다`
                       : `${p.high.upM} m to summit — too far to extrapolate`}</span>
          </div>`}
        </div>`;
    }

    const baseLine = p.base ? `
      <div class="mt-base">
        ${ko ? '산 아래' : 'Valley'} <b>${esc(p.base.name)}</b>
        <span>${p.base.alt.toFixed(0)}m</span>
        <strong>${p.base.temp.toFixed(1)}°</strong>
        ${p.drop != null ? `<em class="${p.drop >= mountain.MARK.dropC ? 'hi' : ''}">${
          p.drop >= 0 ? (ko ? `정상이 ${p.drop.toFixed(1)}도 낮음` : `${p.drop.toFixed(1)}°C colder up top`)
                      : (ko ? `정상이 ${(-p.drop).toFixed(1)}도 높음` : `${(-p.drop).toFixed(1)}°C warmer up top`)
        }</em>` : ''}
      </div>` : '';

    return `
      <article class="mt-card">
        <header>
          <h4>${esc(p.name)}</h4>
          <span class="mt-alt">${p.alt.toFixed(0)}m${p.km != null ? ` · ${p.km}km` : ''}</span>
        </header>

        <div class="mt-main">
          <div class="mt-temp">
            <span class="n">${big}</span><span class="u">°</span>
            <span class="lab">${ko ? '기상청 예보' : 'KMA forecast'}</span>
          </div>
          <ul class="mt-facts">
            <li><i>${ko ? '바람' : 'Wind'}</i>
                <b>${p.wind != null ? `${p.wind.toFixed(1)} m/s` : '—'}</b>
                <em>${dirText(p.windDir, ko)}</em></li>
            <li><i>${ko ? '하늘' : 'Sky'}</i><b>${mountain.skyText(p.sky, ko)}</b></li>
            <li><i>${ko ? '강수확률' : 'Rain'}</i>
                <b>${p.pop != null ? `${Math.round(p.pop)}%` : '—'}</b></li>
            <li><i>${ko ? '습도' : 'Humidity'}</i>
                <b>${p.hum != null ? `${Math.round(p.hum)}%` : '—'}</b></li>
            ${p.feel != null ? `<li><i>${ko ? '체감' : 'Feels'}</i>
                <b>${p.feel.toFixed(1)}°</b></li>` : ''}
          </ul>
        </div>

        ${obs}
        ${baseLine}
        ${marks.length ? `<ul class="mt-marks">${
          marks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      </article>`;
  },

  _foot(ko) {
    const m = mountain.meta || {};
    return `<p class="mt-foot">
      ${ko
        ? `⚠️ <b>정상 값은 예보입니다.</b> 실측이 아닙니다.
           85개 봉우리 중 같은 산에 관측소가 있는 곳은 <b>${m.withHigh ?? 0}곳</b>뿐이고,
           나머지는 비교할 실측이 없습니다.
           <br>⚠️ 위에 적은 표시 기준(바람 ${mountain.MARK.windMs} m/s,
           고도차 ${mountain.MARK.dropC}도 등)은 <b>저희가 정한 값</b>이며
           기상청 특보 기준이 아닙니다.
           <br><b>등산 계획은 반드시 기상청 공식 발표를 확인하세요.</b>
           <br><small>${esc(m.source || '')} · ${esc(m.obsSource || '')}</small>`
        : `⚠️ <b>Summit values are forecasts, not measurements.</b>
           Only <b>${m.withHigh ?? 0}</b> of 85 peaks have a station on the same mountain.
           <br>⚠️ The highlight thresholds above are <b>ours</b>, not official KMA warning criteria.
           <br><b>Always check official KMA announcements before hiking.</b>
           <br><small>${esc(m.source || '')} · ${esc(m.obsSource || '')}</small>`}
    </p>`;
  },
};
