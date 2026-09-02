// 여행 발견 시트 — 시군구 후보를 근거와 함께 보여준다.
//
// 카드에 점수 성분(목적 밀도·덜 붐빔)과 제외 사유(특보·대기질)를 전부 적는다.
// 왜 그렇게까지 적는가: 이 목록은 "공사가 추천한 곳"이 아니라 "우리가 공개 자료로
// 고른 곳"이다. 근거를 접으면 둘을 구분할 방법이 사라진다.

import { i18n } from './i18n.js';
import { analytics } from './analytics.js';
import { travelDiscovery, DISCOVERY_MODES } from './travel-discovery.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const num = value => (Number.isFinite(Number(value))
  ? Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : '—');
const pct = value => `${Math.round(clamp(value) * 100)}%`;
const clamp = value => Math.min(Math.max(Number(value) || 0, 0), 1);

function timeText(value, ko = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-US', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul', hour12: false,
  }).format(date) + ' KST';
}

function gateLine(region, ko) {
  const { gate } = region.components;
  if (!gate.blocked) return '';
  const reasons = [];
  if (gate.warn) {
    reasons.push(ko
      ? `기상특보 ${esc(gate.warn.title || gate.warn.level || '발효')}`
      : `Weather warning ${esc(gate.warn.title || gate.warn.level || 'active')}`);
  }
  if (gate.air && ((gate.air.pm25Grade || 0) >= 3 || (gate.air.pm10Grade || 0) >= 3)) {
    reasons.push(ko
      ? `대기질 ${esc(gate.air.gradeKo || '나쁨')} (${esc(gate.air.station)} ${gate.air.km.toFixed(0)}km)`
      : `Air quality poor (${esc(gate.air.station)} ${gate.air.km.toFixed(0)}km)`);
  }
  return `<p class="td-gate">${ko ? '오늘 후보에서 제외' : 'Excluded today'} — ${reasons.join(' · ')}</p>`;
}

function regionCard(region, ko) {
  const { density, quiet, quietKnown, gate } = region.components;
  const visitors = region.visitors;
  return `<article class="tf-card td-item" data-blocked="${gate.blocked ? '1' : '0'}">
    <header>
      <small>${esc(region.province)}</small>
      <h4>${esc(ko ? region.nameKo : (region.nameEn || region.nameKo))}</h4>
    </header>
    <div class="td-score">
      <b>${pct(region.score)}</b>
      <span>${ko ? '오늘 점수' : 'Today score'}</span>
    </div>
    <ul class="td-why">
      <li>${ko ? '목적 밀도' : 'Purpose density'} ${pct(density)}
        <small>${ko ? '무장애' : 'Barrier-free'} ${num(region.barrierFree)} ·
        ${ko ? '웰니스' : 'Wellness'} ${num(region.wellness)} ·
        ${ko ? '영문' : 'English'} ${num(region.english)}</small></li>
      <li>${ko ? '덜 붐빔' : 'Less crowded'} ${pct(quiet)}
        <small>${quietKnown
          ? `${ko ? '외지인 방문자' : 'Non-resident visitors'} ${num(region.visitorsDomestic)}${visitors?.date ? ` · ${esc(visitors.date)}` : ''}`
          : (ko ? '방문자 자료 없음 — 중립 0.5로 둠(지어내지 않음)' : 'No visitor data — neutral 0.5, not invented')}</small></li>
    </ul>
    ${region.barrierFreeSample?.length
      ? `<p class="td-sample">${region.barrierFreeSample.slice(0, 3).map(esc).join(' · ')}</p>` : ''}
    ${gateLine(region, ko)}
  </article>`;
}

export const travelSheet = {
  mode: 'discover',
  result: null,
  error: null,
  loading: false,

  init() {
    i18n.onChange(() => {
      if ($('#travelSheet')?.classList.contains('up')) this.render();
    });
    document.addEventListener('click', event => {
      const modeButton = event.target.closest('[data-td-mode]');
      if (modeButton && $('#travelSheet')?.classList.contains('up')) {
        this.setMode(modeButton.dataset.tdMode);
      }
    });
    return this;
  },

  async open() {
    document.querySelectorAll('.sheet-panel.up').forEach(panel => panel.classList.remove('up'));
    $('#travelSheet')?.classList.add('up');
    this.render();
    analytics.track('tourism.place_viewed', {
      placeClass: 'DISCOVERY_REGION_LIST',
      sourceStatusClass: this.result ? 'LOADED' : 'LOADING',
    });
    await this.load();
  },

  close() { $('#travelSheet')?.classList.remove('up'); },

  async setMode(mode) {
    if (!DISCOVERY_MODES[mode] || this.mode === mode) return;
    this.mode = mode;
    await this.load();
    analytics.track('tourism.forecast_selected', {
      forecastClass: `DISCOVERY_${mode.toUpperCase()}`,
      sourceStatusClass: this.error ? 'ERROR' : 'LOADED',
    });
  },

  async load() {
    this.loading = true;
    this.error = null;
    this.render();
    try {
      this.result = await travelDiscovery.rank(this.mode, 12);
    } catch (error) {
      this.error = String(error?.message || error);
      this.result = null;
    } finally {
      this.loading = false;
      this.render();
    }
  },

  render() {
    const body = $('#travelBody');
    if (!body) return;
    const ko = i18n.lang === 'ko';
    const title = $('#travelTitle');
    if (title) title.textContent = ko ? '여행 발견' : 'Travel discovery';

    const modes = Object.entries(DISCOVERY_MODES).map(([id, meta]) => `
      <button type="button" data-td-mode="${id}" class="${id === this.mode ? 'on' : ''}">
        ${esc(ko ? meta.ko : meta.en)}
      </button>`).join('');

    if (this.error) {
      body.innerHTML = `<div class="td-modes">${modes}</div>
        <section class="tf-card"><header><small>DISCOVERY</small><h4>${ko ? '발견 자료를 불러오지 못했습니다' : 'Discovery data unavailable'}</h4></header>
        <p>${esc(this.error)}</p>
        <p>${ko ? '값을 만들어 채우지 않습니다. 자료가 연결되면 다시 표시됩니다.'
          : 'No values are invented. The list returns when the data connects.'}</p></section>`;
      return;
    }
    if (this.loading && !this.result) {
      body.innerHTML = `<div class="td-modes">${modes}</div>
        <p class="td-note">${ko ? '공개 자료를 읽는 중…' : 'Reading public data…'}</p>`;
      return;
    }
    const result = this.result;
    if (!result) { body.innerHTML = `<div class="td-modes">${modes}</div>`; return; }

    const sources = Object.entries(result.provenance || {})
      .map(([id, meta]) => `<li>${esc(meta.sourceName || id)} · ${esc(meta.state || '')} · ${timeText(meta.fetchedAt, ko)}</li>`)
      .join('');

    body.innerHTML = `
      <div class="td-modes">${modes}</div>

      <section class="tf-card td-head">
        <header><small>EARTHUS DISCOVERY</small><h4>${ko ? '오늘 갈 곳을 데이터로 고릅니다' : 'Choosing today from data'}</h4></header>
        <p>${ko
          ? '점수 = 목적 밀도(무장애·웰니스·영문) 0.6 + 덜 붐빔(방문자 역순) 0.4. 기상특보나 대기질 나쁨이면 후보에서 빼고 그 사실을 적습니다.'
          : 'Score = purpose density 0.6 + less-crowded 0.4. Regions under a weather warning or poor air are excluded, and that is stated.'}</p>
        <p class="td-note">${ko
          ? `시군구 ${num(result.total)}곳 · 오늘 제외 ${num(result.blockedCount)}곳 · 집계 ${timeText(result.generatedAt, ko)}`
          : `${num(result.total)} districts · ${num(result.blockedCount)} excluded today · built ${timeText(result.generatedAt, ko)}`}</p>
      </section>

      <div class="td-list">${result.items.map(region => regionCard(region, ko)).join('')}</div>

      <section class="tf-card td-truth">
        <header><small>SOURCE</small><h4>${ko ? '이 목록의 근거' : 'What this list is built on'}</h4></header>
        <ul class="td-src">${sources}</ul>
        <p>${esc(result.notes?.visitors || '')}</p>
        <p>${esc(result.notes?.label || '')}</p>
        <p class="td-note">${esc(result.assignment || '')}</p>
      </section>`;
  },
};
