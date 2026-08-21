import { i18n } from './i18n.js';
import { analytics } from './analytics.js';
import { auth } from './auth.js';
import { push } from './push.js';
import { warn } from './warn.js';
import { fetchWeather } from './layers/weather.js';
import { kmaFcst } from './kma-fcst.js';
import { get as getKorea } from './korea.js';
import { loadWeatherInputsV7 } from './weather-data-v7.js';
import { buildWeatherCardModel } from './weather-contract-v7.js';
import { evaluateBestTime, rankAlternatives } from './tourism-flow-contract.js';
import { ktoStateLabel, ktoSummaryRows } from './kto-tourism-contract.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

function timeText(value, ko = true) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-US', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Seoul', hour12: false,
  }).format(date) + ' KST';
}

function number(value, digits = 0) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  }) : '—';
}

function population(range, ko) {
  if (!range) return ko ? '인구 범위 자료 없음' : 'Population range unavailable';
  return `${number(range.min)}–${number(range.max)}${ko ? '명' : ''}`;
}

function trendText(trend, ko) {
  if (trend?.state !== 'READY') return ko
    ? '추세 계산 전 · 관측 이력 3회 이상 필요'
    : 'Trend pending · at least 3 observations required';
  const label = {
    INCREASING: ko ? '늘어나는 흐름' : 'Increasing',
    DECREASING: ko ? '줄어드는 흐름' : 'Decreasing',
    STABLE: ko ? '큰 변화 없음' : 'Stable',
  }[trend.direction] || (ko ? '판정 없음' : 'Unknown');
  return `${label} · ${trend.perHour >= 0 ? '+' : ''}${number(trend.perHour)}${ko ? '명/시간' : ' people/hour'}`;
}

export const tourismSheet = {
  snapshot: null,
  place: null,
  selectedAt: null,
  safety: null,
  weather: null,
  contextLoading: false,
  watching: false,
  errorCode: null,

  init() {
    document.addEventListener('earthus:tourism-snapshot', event => {
      this.snapshot = event.detail;
      if (this.place) {
        this.place = this.snapshot.places.find(place => place.id === this.place.id) || this.place;
        this.render();
      }
    });
    document.addEventListener('earthus:tourism-error', event => {
      this.errorCode = event.detail?.code || 'TOURISM_SNAPSHOT_UNAVAILABLE';
      if ($('#tourismSheet')?.classList.contains('up')) this.render();
    });
    i18n.onChange(() => {
      if ($('#tourismSheet')?.classList.contains('up')) this.render();
    });
    return this;
  },

  async open(place) {
    document.querySelectorAll('.sheet-panel.up').forEach(panel => panel.classList.remove('up'));
    this.place = place;
    this.selectedAt = null;
    this.safety = null;
    this.weather = null;
    this.errorCode = null;
    const panel = $('#tourismSheet');
    panel?.classList.add('up');
    this.render();
    analytics.track('tourism.place_viewed', {
      // 장소명·자유문구는 분석 이벤트로 보내지 않고 공식 카탈로그 분류만 남긴다.
      placeClass: place.code?.startsWith('POI') ? 'OFFICIAL_SEOUL_PLACE' : 'UNKNOWN',
      sourceStatusClass: place.state,
    });
    await Promise.allSettled([this._loadContext(), this._loadWatchState()]);
  },

  close() { $('#tourismSheet')?.classList.remove('up'); },

  async _loadContext() {
    if (!this.place?.position || this.contextLoading) return;
    const id = this.place.id;
    this.contextLoading = true;
    this.render();
    try {
      const point = { lat: this.place.position.lat, lon: this.place.position.lon };
      const inputs = await loadWeatherInputsV7({ ...point, name: this.place.nameKo }, {
        fetchWeather,
        fetchKmaForecast: (lat, lon) => kmaFcst.at(lat, lon),
        fetchKorea: name => getKorea(name),
        fetchWarningGate: coords => warn.safetyAt(coords),
      });
      if (this.place?.id !== id) return;
      this.weather = buildWeatherCardModel({ ...inputs, now: new Date().toISOString() });
      this.safety = inputs.warningGate || null;
    } catch (_) {
      if (this.place?.id === id) this.safety = {
        status: 'UNKNOWN', gate: 'UNKNOWN', blocksPositiveRecommendation: true,
      };
    } finally {
      this.contextLoading = false;
      if (this.place?.id === id) this.render();
    }
  },

  async _loadWatchState() {
    if (!auth.user) { this.watching = false; this.render(); return; }
    try {
      const spots = await push.spots();
      this.watching = spots.some(spot => spot.tourism === true
        && spot.tourism_place_code === this.place?.code);
    } catch (_) { this.watching = false; }
    this.render();
  },

  render() {
    const body = $('#tourismBody');
    if (!body || !this.place) return;
    const ko = i18n.lang === 'ko';
    const place = this.place;
    const official = place.official || {};
    const trend = place.flow?.scalarTrend;
    const best = evaluateBestTime(place, {
      safetyGate: this.safety,
      now: this.snapshot?.generatedAt,
      // 운영시간 근거가 없으므로 accessibility를 OPEN으로 만들지 않는다.
      accessibility: null,
    });
    const alternatives = rankAlternatives(this.snapshot?.places || [], place.id);
    const selectedForecast = this.selectedAt
      ? place.forecast?.find(row => row.at === this.selectedAt) : null;
    const temp = this.weather?.current?.temperature;
    const air = this.weather?.details?.airQuality;
    const stateClass = place.state.toLocaleLowerCase();
    const coverage = this.snapshot?.coverage || {};
    const quality = this.snapshot?.quality || {};
    const health = this.snapshot?.health || null;
    const ktoRows = ktoSummaryRows(this.snapshot?.ktoSummary || null);
    const barrierFree = ktoRows.find(row => row.id === 'barrierFree');

    $('#tourismTitle').textContent = ko ? '관광 밀도' : 'Tourism density';
    body.innerHTML = `
      <section class="tf-hero ${stateClass}">
        <div class="tf-state"><b>${esc(place.stateLabelKo)}</b><span>${esc(place.category || '')}</span></div>
        <h4>${esc(ko ? place.nameKo : (place.nameEn || place.nameKo))}</h4>
        <div class="tf-level" style="--tf-level:${esc(official.color || '#9aa6b2')}">
          <strong>${esc(official.level || '—')}</strong><span>${population(official.populationRange, ko)}</span>
        </div>
        <p>${esc(official.message || (ko ? '기관 설명 없음' : 'No agency message'))}</p>
        <footer><b>${ko ? '공식 현재' : 'OFFICIAL CURRENT'}</b><time>${timeText(place.provenance?.observedAt, ko)}</time></footer>
      </section>

      <section class="tf-card tf-trend">
        <header><small>TREND</small><h4>${ko ? '사람 수 변화' : 'Population trend'}</h4></header>
        <strong>${esc(trendText(trend, ko))}</strong>
        <p>${ko
          ? '강건한 시간 기울기로 계산한 집계 추세입니다. OD·이동 경로 근거가 없어 실시간 이동 방향은 만들지 않습니다.'
          : 'Aggregate robust time slope. No live direction arrow is created without OD or route evidence.'}</p>
      </section>

      <section class="tf-card tf-context">
        <header><small>WEATHER · AIR · TIME</small><h4>${ko ? '같이 볼 조건' : 'Context'}</h4></header>
        ${this.contextLoading ? `<p class="tf-loading">${ko ? '기상청·대기질·특보 근거 확인 중…' : 'Checking weather, air and warnings…'}</p>` : `
          <div class="tf-context-grid">
            <span><small>${ko ? '기온' : 'Temperature'}</small><b>${temp?.value != null ? `${number(temp.value, 1)}${temp.unit || '°C'}` : '—'}</b></span>
            <span><small>${ko ? '대기질 실측' : 'Measured air'}</small><b>${esc(air?.grade || '—')}</b></span>
            <span><small>PM2.5</small><b>${air?.pm25?.value != null ? `${number(air.pm25.value)} µg/m³` : '—'}</b></span>
            <span><small>${ko ? '공식 특보' : 'Official warning'}</small><b>${esc(this.safety?.gate || this.safety?.status || 'UNKNOWN')}</b></span>
          </div>
          <p>${ko ? '값마다 Weather Card v7의 관측·공식예보·출처 시각 계약을 그대로 사용합니다.' : 'Uses the Weather Card v7 evidence and timestamp contract.'}</p>`}
      </section>

      <section class="tf-card tf-timeline">
        <header><small>${ko ? '공식 예측' : 'OFFICIAL FORECAST'}</small><h4>${ko ? '시간에 따른 혼잡' : 'Crowd over time'}</h4></header>
        <div class="tf-time-rail">
          <button type="button" data-tourism-time="" aria-pressed="${!this.selectedAt}"><time>${ko ? '지금' : 'Now'}</time><b>${esc(official.level || '—')}</b></button>
          ${(place.forecast || []).map(row => `<button type="button" data-tourism-time="${esc(row.at)}" aria-pressed="${row.at === this.selectedAt}">
            <time>${timeText(row.at, ko).replace(' KST', '')}</time><b>${esc(row.level || '—')}</b></button>`).join('')}
        </div>
        ${selectedForecast ? `<p class="tf-selected"><b>${timeText(selectedForecast.at, ko)}</b> · ${esc(selectedForecast.level)} · ${population(selectedForecast.populationRange, ko)}</p>` : ''}
        <p>${ko
          ? '시간을 누르면 서울 지역 밀도 셀도 같은 기관 예측 시각으로 바뀝니다. 지역 밀도 셀은 공식 장소값을 주변 지역에 시각 배분한 표시이며 실제 구역 면적·이동량이 아닙니다.'
          : 'Selecting a time updates the Seoul regional density cells to the same agency forecast. The cells visually allocate official place values across nearby areas; they are not actual boundaries or movement volumes.'}</p>
      </section>

      <section class="tf-card tf-best" data-state="${esc(best.state)}">
        <header><small>BEST TIME</small><h4>${ko ? '언제 덜 붐비나' : 'When is it less crowded?'}</h4></header>
        <strong>${best.at ? timeText(best.at, ko) : esc(best.labelKo)}</strong>
        ${best.at ? `<p>${esc(best.labelKo)}. ${esc(best.caveatKo || '')}</p>` : ''}
        <p>${ko
          ? '안전·운영시간·입장 가능 여부가 확인되지 않으면 Earthus는 이 값을 방문 권고로 바꾸지 않습니다.'
          : 'Without verified safety, opening hours and admission, this is not a visit recommendation.'}</p>
      </section>

      <section class="tf-card tf-alternatives">
        <header><small>ALTERNATIVES</small><h4>${ko ? '공식 자료가 있는 대안' : 'Evidence-backed alternatives'}</h4></header>
        ${alternatives.length ? `<div class="tf-alt-list">${alternatives.map(alt => `<button type="button" data-tourism-alt="${esc(alt.id)}"><b>${esc(ko ? alt.nameKo : (alt.nameEn || alt.nameKo))}</b><span>${esc(alt.level)}</span></button>`).join('')}</div>`
          : `<p>${ko ? '현재 공식 실시간 근거로 비교할 다른 장소가 없습니다.' : 'No other place has comparable current official evidence.'}</p>`}
      </section>

      <section class="tf-card tf-kto">
        <header><small>KTO DATASETS</small><h4>${ko ? '한국관광공사 공식 자료' : 'Official Korea Tourism data'}</h4></header>
        <p>${ko
          ? '관광지 상대 집중률 예측, 과거 방문 지표, 차량 이동 기반 연관성, 무장애·웰니스·영문 관광정보와 지역 분석지수를 서로 다른 근거로 표시합니다. 상대 집중률과 방문 지표는 실시간 인구가 아닙니다.'
          : 'Relative concentration forecasts, historical visitor metrics, mobility relationships, official content and regional indices remain separate evidence types. They are not live population.'}</p>
        <div class="tf-kto-list">
          ${ktoRows.map(row => `<article data-kto-service="${esc(row.id)}" data-state="${esc(row.state)}">
            <div><b>${esc(ko ? row.labelKo : row.labelEn)}</b><span>${esc(ktoStateLabel(row.state, ko))}</span></div>
            <small>${row.operationCount
              ? `${ko ? '수집 작업' : 'Operations'} ${number(row.availableCount)}/${number(row.operationCount)} · ${ko ? '항목' : 'items'} ${number(row.itemCount)}`
              : (ko ? '공식 수집 결과가 아직 없습니다.' : 'No official collection result yet.')}</small>
            ${row.updatedAt ? `<time>${timeText(row.updatedAt, ko)}</time>` : ''}
            ${row.sourceUrl ? `<a href="${esc(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">${ko ? '공식 데이터셋 ↗' : 'Official dataset ↗'}</a>` : ''}
          </article>`).join('')}
        </div>
        <p>${this.snapshot?.ktoSummary
          ? `${ko ? '한국관광공사 요약 수신' : 'KTO summary received'} · ${timeText(this.snapshot.ktoSummary.generatedAt, ko)}`
          : (ko ? '한국관광공사 수집 결과가 연결되기 전 상태입니다. 값을 만들거나 서울시 자료로 대신 채우지 않습니다.' : 'KTO collection is not connected yet; no value is fabricated or substituted from Seoul data.')}</p>
      </section>

      <section class="tf-card tf-access">
        <header><small>ACCESSIBILITY</small><h4>${ko ? '접근성·운영정보' : 'Accessibility & operations'}</h4></header>
        <p>${ko
          ? `서울시 실시간 인구 API 응답에는 휠체어 접근성, 운영시간, 휴관, 입장 가능 여부가 없습니다. 한국관광공사 무장애 자료 상태는 “${ktoStateLabel(barrierFree?.state, true)}”이지만, 이 장소와 공식 콘텐츠 ID로 연결되기 전에는 접근 가능 판정을 만들지 않습니다.`
          : `The Seoul population API does not include accessibility, hours, closure or admission. KTO barrier-free data is “${ktoStateLabel(barrierFree?.state, false)}”, but no accessibility verdict is created until this place has a verified official content-ID link.`}</p>
      </section>

      <section class="tf-card tf-ops">
        <header><small>DATA STATUS</small><h4>${ko ? '자료 운영 상태' : 'Data operations'}</h4></header>
        <div class="tf-context-grid">
          <span><small>${ko ? '조회 범위' : 'Coverage'}</small><b>${number(coverage.available)}/${number(coverage.total)}</b></span>
          <span><small>LIVE</small><b>${number(quality.live)}</b></span>
          <span><small>${ko ? '기관 예측' : 'Official forecast'}</small><b>${number(quality.withOfficialForecast)}</b></span>
          <span><small>${ko ? '이동 방향 근거' : 'Direction evidence'}</small><b>${number(quality.withDirectionEvidence)}</b></span>
        </div>
        <p>${health
          ? `${ko ? '수집기' : 'Collector'} ${esc(health.state || 'UNKNOWN')} · ${esc(health.mode || this.snapshot?.provider?.mode || 'UNKNOWN')}`
          : (ko ? '수집기 health 보조 자료를 확인하지 못했습니다. 현재 관측의 출처·시각은 위에 그대로 표시합니다.' : 'Collector health is unavailable; current observation provenance remains visible above.')}</p>
      </section>

      <button type="button" class="tf-watch" data-tourism-watch aria-pressed="${this.watching}">
        ${this.watching ? (ko ? '지켜보기 해제' : 'Stop watching') : (ko ? '이 장소 지켜보기' : 'Watch this place')}
      </button>

      <section class="tf-source">
        <b>${ko ? '출처' : 'Source'} · ${ko ? '서울특별시 실시간 인구데이터' : 'Seoul Metropolitan Government real-time population data'}</b>
        <span>${ko ? '수신' : 'Received'} ${timeText(place.provenance?.receivedAt, ko)} · ${esc(place.provenance?.license || '')}</span>
        <a href="${esc(place.provenance?.sourceUrl)}" target="_blank" rel="noopener noreferrer">${ko ? '공식 데이터셋 ↗' : 'Official dataset ↗'}</a>
        <em>${esc(this.snapshot?.coverage?.noteKo || '')}</em>
      </section>
      ${this.errorCode ? `<p class="tf-error">${ko ? '최신 관광 밀도 자료를 다시 확인해야 합니다.' : 'Latest tourism density data needs rechecking.'}</p>` : ''}`;

    body.querySelectorAll('[data-tourism-time]').forEach(button => {
      button.onclick = () => {
        this.selectedAt = button.dataset.tourismTime || null;
        document.dispatchEvent(new CustomEvent('earthus:tourism-time', {
          detail: { at: this.selectedAt, placeId: place.id },
        }));
        analytics.track('tourism.forecast_selected', {
          forecastClass: this.selectedAt ? 'OFFICIAL_FORECAST' : 'OFFICIAL_CURRENT',
          sourceStatusClass: place.state,
        });
        this.render();
      };
    });
    body.querySelectorAll('[data-tourism-alt]').forEach(button => {
      button.onclick = () => {
        const alternative = this.snapshot?.places.find(item => item.id === button.dataset.tourismAlt);
        if (alternative) this.open(alternative);
      };
    });
    body.querySelector('[data-tourism-watch]')?.addEventListener('click', () => this._toggleWatch());
  },

  async _toggleWatch() {
    if (!auth.user) {
      this.close();
      const { loginSheet } = await import('./ui-account.js');
      loginSheet.open(i18n.lang === 'ko'
        ? '관광지 지켜보기를 계정에 연결하면 기기를 바꿔도 설정이 유지됩니다.'
        : 'Sign in so this tourism watch follows you across devices.');
      return;
    }
    const spots = await push.spots();
    const existing = spots.find(spot => spot.tourism_place_code === this.place.code);
    if (existing) {
      await push.updateSpot(existing.id, { tourism: !this.watching });
      this.watching = !this.watching;
    } else {
      await push.addSpot({
        label: this.place.nameKo, lat: this.place.position.lat, lon: this.place.position.lon,
        rip: false, quake: false, warn: false, tourism: true,
        tourism_place_code: this.place.code, tourism_min_rank: 3,
      });
      this.watching = true;
    }
    analytics.track('tourism.watch_changed', {
      state: this.watching ? 'ON' : 'OFF', sourceStatusClass: this.place.state,
    });
    this.render();
  },
};
