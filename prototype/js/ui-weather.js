// 내 자리 날씨 — 아래 온도를 누르면 열린다
//
// 왜 만들었나 (받은 요청)
//   "오늘 날씨, 14일 날씨, 안내는 첫 화면 뜨면 아래 지금 온도 나오는곳 누르면
//    나오게 해주고, 그전에 말한 날씨 분석 멘트도 함께 나오게 해줘,
//    이후에는 메뉴->내위치 누르면 거기서 내 위치로 가면서 다시 화면 나오게"
//
//   첫 화면의 큰 온도 숫자는 "누르면 뭔가 있을 것 같은" 자리인데 아무 일도 없었다.
//   실제로 눌러도 터치가 그대로 지구본으로 빠져나갔다(#ambient 는 pointer-events:none).
//
// 구성
//   오늘   — 지금 값 + 시간별 (이미 받아 둔 자료를 그대로 쓴다)
//   14일   — 일별 최고/최저·강수. ⚠️ 뒤로 갈수록 맞을 확률이 떨어진다는 걸 화면에 적는다
//   안내   — 날씨 분석 서술. ⚠️ 아직 만들지 않았다 — **자리만 두고 없다고 적는다**
//
// ⚠️ 분석 멘트를 지어내지 않는다.
//    air-state 야간 잡(build-order 16e)이 만들어 S3 에 올리기 전까지는
//    "준비 중"이라고 정직하게 적는다. 그럴듯한 문장을 만들어 두면
//    그게 관측인지 우리 추측인지 아무도 구분할 수 없게 된다.
//
// ⚠️ 예보 자료는 Open-Meteo 다. 기상청이 아니다 — 화면에 그렇게 적는다.
// ⚠️⚠️ 2026-08-15 정정: 한국의 '오늘'은 기상청 동네예보가 1순위이고,
//    Open-Meteo 는 한국 밖 또는 기상청 자료를 못 받은 동안의 폴백이다.

import { i18n } from './i18n.js';
/* ⚠️ inJapan 만 정적으로 가져온다 — render() 는 async 가 아니라
   여기서 await import 를 쓸 수 없다. 패널 본체는 눌렀을 때 받는다. */
import { inJapan } from './ui-japan.js';
import { chrome } from './ui.js';
import { wxText } from './layers/weather.js';
import { myLocation } from './mylocation.js';
import { kmaFcst, condText } from './kma-fcst.js';
import { get as getKorea, distKm } from './korea.js';
import { warn } from './warn.js';
import { lookupWaves } from './place.js';
import { fetchWeather } from './layers/weather.js';
import { safetyGateMarkup } from './safety-gate-ui.js';
import { loadWeatherInputsV7 } from './weather-data-v7.js';
import { buildWeatherCardModel, DATA_STATE, SOURCE_TYPE } from './weather-contract-v7.js';
// weather-summary 모듈이 없을 때 fallback 하도록 동적 로딩
let weatherSummary = {
  kmaWeatherSymbol: (sky, pty) => {
    if ([2, 6].includes(Number(pty))) return '🌨️';
    if ([3, 7].includes(Number(pty))) return '❄️';
    if ([1, 4, 5].includes(Number(pty))) return '🌧️';
    if (Number(sky) === 1) return '☀️';
    if (Number(sky) === 3) return '🌤️';
    return '☁️';
  },
  summarizeKma: (kma, ko = true) => {
    const now = kma?.now || {};
    const today = new Date();
    const ymd = `${String(today.getFullYear())}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const hours = Array.isArray(kma?.hours) ? kma.hours : [];
    const todays = hours.filter(h => String(h?.tm || '').startsWith(ymd));
    const n = todays[0] || hours[0] || now;
    const hi = (todays.map(v => Number(v?.t)).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), -Infinity));
    const lo = (todays.map(v => Number(v?.t)).filter(Number.isFinite).reduce((a, b) => Math.min(a, b), Infinity));
    const condition = condText(n.sky, n.pty, ko);
    return {
      today: {
        label: ko ? '오늘' : 'Today',
        icon: weatherSummary.kmaWeatherSymbol(n.sky, n.pty),
        headline: ko ? `현재 ${condition}` : `Now ${condition}`,
        detail: `${ko ? '강수확률' : 'Rain chance'} ${Math.round(Number(n?.pop || 0))}%`,
        tmax: hi > -Infinity ? hi : now.tmax,
        tmin: lo < Infinity ? lo : now.tmin,
      },
      tomorrow: null,
    };
  },
  wmoWeatherSymbol: (code) => {
    const c = Number(code);
    if (c === 0) return '☀️';
    if ([1, 2].includes(c)) return '🌤️';
    if (c === 3 || [45, 48].includes(c)) return '☁️';
    if ((c >= 71 && c <= 77) || [85, 86].includes(c)) return '❄️';
    if (c >= 95) return '⛈️';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return '🌧️';
    return '☁️';
  },
};
let weatherSummaryLoader;
function loadWeatherSummary() {
  if (weatherSummaryLoader) return weatherSummaryLoader;
  weatherSummaryLoader = import('./weather-summary.js')
    .then(mod => {
      weatherSummary = {
        kmaWeatherSymbol: mod.kmaWeatherSymbol || weatherSummary.kmaWeatherSymbol,
        summarizeKma: mod.summarizeKma || weatherSummary.summarizeKma,
        wmoWeatherSymbol: mod.wmoWeatherSymbol || weatherSummary.wmoWeatherSymbol,
      };
    })
    .catch(() => {
      // 실패해도 운영은 멈추지 않음
    })
    .finally(() => { weatherSummaryLoader = null; });
}
loadWeatherSummary();

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c;
  if (h != null) n.innerHTML = h; return n; };

/* 14일 중 어디부터 "참고용"인가.
   ⚠️ 임의로 정한 선이 아니다 — 수치예보의 결정론적 정확도는 대체로 7일 안팎에서
      기후값 수준으로 떨어진다. 그 뒤를 같은 굵기로 보여주면 거짓 확신을 준다.
      정확한 근거 조사는 methodology-sources 로 넘긴다. 그 전까지는 **선을 긋고
      선 뒤는 흐리게 + 문구로 알린다**. */
const CONFIDENT_DAYS = 7;

/* 한국 대략 범위 — warn.js 와 같은 상자를 쓴다.
   ⚠️ 넉넉하게 잡는다: 제주 남단(33.1)·최북단(38.6)·독도(131.9)를 다 품어야 한다. */
const inKorea = (lat, lon) =>
  lat != null && lon != null &&
  lat >= 32.5 && lat <= 39.0 && lon >= 124.0 && lon <= 132.5;

export const weatherPanel = {
  tab: 'today',
  /* 한국이면 기상청 동네예보를 담아 둔다 (없으면 null → Open-Meteo 로 돌아간다) */
  kma: null,
  kmaKey: '',
  kmaRequestKey: '',
  model: null,
  modelKey: '',
  modelRequestKey: '',
  modelErrors: {},
  selectedAt: null,

  init() {
    /* 하단 온도 덩어리를 누를 수 있게 한다.
       ⚠️ #ambient 전체를 pointer-events:auto 로 되돌리면 안 된다 —
          그러면 지구를 돌리려고 화면 위쪽을 잡았을 때 텍스트가 먹어버린다.
          누를 수 있어야 하는 건 아래 온도 덩어리 하나뿐이다. (CSS 에서 지정) */
    const amb = $('#ambBottom');
    amb?.addEventListener('click', () => this.open());
    /* ⚠️ role="button" tabindex="0" 만 붙여 놓고 click 만 듣고 있었다 —
       키보드로는 포커스는 가는데 Enter·Space 로 열리지 않았다. (감사 P2-3)
       기본 <button> 이 공짜로 주는 동작이라, 흉내 냈으면 끝까지 흉내 내야 한다.
       ⚠️ Space 는 기본 동작(화면 스크롤)을 막아야 한다. */
    amb?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        this.open();
      }
    });
    // 위치명은 날씨보다 늦게 도착할 수 있다. 시트가 열린 뒤 도착해도 제목을 갱신한다.
    document.addEventListener('earthus:place', () => {
      /* 시트가 닫혀 있어도 한 번은 받아 둔다 — 좌상단 출처 표기가 날씨 자료 출처를 함께 적기 때문(2026-09-06).
         같은 자리면 다시 받지 않는다(_loadV7 이 키로 막는다). */
      if (!$('#wxSheet')?.classList.contains('up')) { if (!this.model) this._loadV7(); return; }
      this._dropStaleKma();
      this._dropStaleModel();
      this.render();
      this._loadV7();
    });
    // 자리를 이미 알면 한 번 받아 둔다 — earthus:place 가 이 리스너보다 먼저 지나가 좌상단 출처에 날씨 출처가 비어 있었다(2026-09-06).
    if (Number.isFinite(chrome.place?.lat) && Number.isFinite(chrome.place?.lon)) setTimeout(() => { if (!this.model) this._loadV7(); }, 1500);
    return this;
  },

  open(tab) {
    if (tab) this.tab = tab;
    document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
    $('#wxSheet')?.classList.add('up');
    this._dropStaleKma();
    this._dropStaleModel();
    this.render();
    if (!chrome.place.name && !chrome.isDefault) chrome.reverseName(chrome.place.lat, chrome.place.lon);
    /* 아직 안 받았으면 받아 온다 (위치 권한을 늦게 준 경우) */
    /* Weather Card v7는 관측·공식예보·모델·특보를 같은 요청 키로 묶는다.
       ⚠️ 한 Provider가 늦거나 실패해도 다른 근거까지 비우지 않는다. */
    this._loadV7();
  },

  _placeKey() {
    const p = chrome.place;
    return p?.lat == null || p?.lon == null ? '' : `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`;
  },

  _dropStaleKma() {
    /* ⚠️ 위치를 옮긴 직후 이전 지점 예보가 한 프레임이라도 보이면 출처가 섞인다. */
    if (this.kmaKey && this.kmaKey !== this._placeKey()) this.kma = null;
  },

  _dropStaleModel() {
    if (this.modelKey && this.modelKey !== this._placeKey()) {
      this.model = null;
      this.modelKey = '';
      this.selectedAt = null;
    }
  },

  async _loadV7() {
    const key = this._placeKey();
    if (!key || (this.model && this.modelKey === key) || this.modelRequestKey === key) return;
    const place = normalizeWeatherPlace(chrome.place);
    this.modelRequestKey = key;
    this.render();
    try {
      const inputs = await loadWeatherInputsV7(place, {
        fetchWeather: async (lat, lon) => {
          if (this._placeKey() === key && chrome.wx) return chrome.wx;
          const value = await fetchWeather(lat, lon);
          if (this._placeKey() === key) chrome.wx = value;
          return value;
        },
        fetchKmaForecast: (lat, lon) => kmaFcst.at(lat, lon),
        fetchKorea: name => getKorea(name),
        fetchWarningGate: point => warn.safetyAt(point),
        fetchMarine: (lat, lon) => lookupWaves(lat, lon),
      });
      if (this._placeKey() !== key) return;
      this.model = buildWeatherCardModel({ ...inputs, now: new Date().toISOString() });
      this.modelKey = key;
      this.modelErrors = inputs.errors || {};
      this.kma = inputs.kmaForecast || null;
      this.kmaKey = inputs.kmaForecast ? key : '';
      document.dispatchEvent(new CustomEvent('earthus:weather-model', {
        detail: { point: { lat: place.lat, lon: place.lon }, model: this.model },
      }));
    } catch (error) {
      if (this._placeKey() === key) {
        this.model = null;
        this.modelErrors = { weatherCard: error?.message || 'WEATHER_CARD_FAILED' };
      }
    } finally {
      if (this.modelRequestKey === key) this.modelRequestKey = '';
      if (this._placeKey() === key) this.render();
    }
  },

  _loadKma() {
    const key = this._placeKey();
    if (!key || (this.kma && this.kmaKey === key) || this.kmaRequestKey === key) return;
    const { lat, lon } = chrome.place;
    this.kmaRequestKey = key;
    kmaFcst.at(lat, lon).then(k => {
      if (this.kmaRequestKey === key) this.kmaRequestKey = '';
      if (!k || this._placeKey() !== key) return;
      this.kma = k;
      this.kmaKey = key;
      this.render();
    }).catch(() => {
      if (this.kmaRequestKey === key) this.kmaRequestKey = '';
      /* 실패하면 Open-Meteo 그대로 */
    });
  },

  close() { $('#wxSheet')?.classList.remove('up'); },

  render() {
    const body = $('#wxBody');
    if (!body) return;
    const ko = i18n.lang === 'ko';
    body.innerHTML = '';

    /* ⚠️ 제목에 지명을 쓰지 않는다. 히어로가 지명을 말하므로 같은 이름이 60px 안에 두 번 나온다.
       지명은 renderHero 가 chrome.place 에서 직접 읽는다 — 자료 계약의 location.name 은
       비어 있을 수 있고, 실제로 비어서 히어로가 '선택 위치'라고 적고 있었다(실측). */
    $('#wxTitle').textContent = ko ? '지점 날씨' : 'Local weather';

    this._renderV7(body, ko);
    return;

    // 탭
    const tabs = el('div', 'comm-tabs');
    [['today', ko ? '오늘' : 'Today'],
     ['d14',   ko ? '14일' : '14 days'],
     ['note',  ko ? '안내' : 'Notes']].forEach(([k, label]) => {
      const b = el('button', 'comm-tab' + (this.tab === k ? ' on' : ''), label);
      b.onclick = () => { this.tab = k; this.render(); };
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    const wx = chrome.wx;
    if (!wx) {
      body.appendChild(el('p', 'wx-empty', ko ? '날씨를 받는 중입니다…' : 'Loading weather…'));
      return;
    }

    if (this.tab === 'today') this._today(body, wx, ko);
    else if (this.tab === 'd14') this._d14(body, wx, ko);
    else this._noteTab(body, ko);

    /* 한국 안이면 기상청 자료로 이어 준다.
       ⚠️ '한국' 메뉴를 없애면서 그 화면(특보·산·바다·생활·기록)이 갈 곳을 잃었다.
          자료가 있는데 여는 길이 없으면 없는 것과 같다 — 여기서 잇는다.
       ⚠️ 한국 밖에서는 만들지 않는다. 관측소가 없는 곳에서 열면 빈 화면이다. */
    if (inKorea(chrome.place.lat, chrome.place.lon)) {
      const b = el('button', 'wx-kr',
        `<b>${ko ? '기상청 자료 자세히' : 'KMA detail'}</b>`
        + `<i>${ko ? '특보 · 산 · 바다 · 생활기상 · 기록' : 'Warnings · mountains · sea · records'}</i>`
        + `<span>›</span>`);
      b.onclick = async () => {
        const { koreaPanel } = await import('./ui-korea.js?v=20260814-n5');
        this.close();
        koreaPanel.open();
      };
      body.appendChild(b);

      /* Windy의 모델 비교처럼 위치를 본 다음 곧바로 비교로 이어진다.
         ⚠️ 지도 좌표를 임의의 관측소 ID로 바꾸지 않는다. 실제 ASOS 목록에서 가장
            가까운 지점을 찾은 뒤에만 딥링크하고, 실패하면 일반 화면만 연다. */
      const compare = el('a', 'wx-kr',
        `<b>${ko ? '예보와 실제 비교' : 'Forecast vs observation'}</b>`
        + `<i>${ko ? '가까운 ASOS 지점 찾는 중' : 'Finding the nearest ASOS station'}</i>`
        + `<span>›</span>`);
      compare.href = './verify.html';
      compare.dataset.forecastCompare = '';
      body.appendChild(compare);
      import('./korea.js').then(async ({ get, nearest }) => {
        /* 지점별 사례와 전국 집계를 섞지 않는다. verify-daily의 MAE는 96지점 전체
           집계이므로 버튼에는 값이 아니라 축적 범위(며칠·몇 지점)만 밝힌다. */
        const [asos, verify] = await Promise.all([
          get('asos'),
          get('verify').catch(() => null),
        ]);
        const s = nearest(asos?.stations || [], chrome.place.lat, chrome.place.lon);
        if (!s || !compare.isConnected) return;
        compare.href = `./verify.html?station=${encodeURIComponent(s.id)}#stationCase`;
        const detail = compare.querySelector('i');
        const days = Number(verify?.count);
        const stations = Number(verify?.stationCount);
        const scope = Number.isFinite(days) && Number.isFinite(stations)
          ? (ko ? `전체 ${days}일·${stations}지점 집계` : `aggregate: ${days} day${days === 1 ? '' : 's'} · ${stations} stations`)
          : (ko ? '기관 예보와 관측 사례' : 'forecast cases');
        if (detail) detail.textContent = ko
          ? `${s.name} · 약 ${Math.round(s.km)}km · ${scope}`
          : `${s.name || s.id} · about ${Math.round(s.km)} km · ${scope}`;
      }).catch(() => {
        const detail = compare.querySelector('i');
        if (detail) detail.textContent = ko
          ? '지점 목록을 못 받아 전체 비교 화면을 엽니다'
          : 'Station list unavailable · opening the full comparison';
      });
    }

    /* 일본 — 한국과 같은 자리, 같은 규칙.
       ⚠️ 일본 밖에서는 만들지 않는다. 한국 버튼과 똑같은 이유다 — 열면 빈 화면이다.
       ⚠️ 부제에 **특보를 적지 않는다.** 일본 탭에는 특보가 없다(JMA 경로가 멈춰 있다).
          한국 버튼 문구를 그대로 복사하면 있지도 않은 것을 약속하게 된다. */
    {
      if (inJapan(chrome.place.lat, chrome.place.lon)) {
        const j = el('button', 'wx-kr',
          `<b>${ko ? '일본 기상청 자료 자세히' : 'JMA detail'}</b>`
          + `<i>${ko ? '실측 1,280지점 · 지진 · 낙뢰 · 해변 · 산'
                    : '1,280 stations · quakes · lightning · coast · peaks'}</i>`
          + `<span>›</span>`);
        j.onclick = async () => {
          const { japanPanel } = await import('./ui-japan.js');
          this.close();
          japanPanel.open();
        };
        body.appendChild(j);
      }
    }

    /* 출처 — 어느 탭이든 항상 붙는다.
       ⚠️ 탭마다 자료가 다르다. '오늘'은 한국이면 기상청, '14일'은 아직 Open-Meteo 다.
          한 줄로 뭉뚱그리면 어느 값이 어디서 왔는지 알 수 없게 된다. */
    const useKma = this.tab === 'today' && !!this.kma?.now;
    body.appendChild(el('div', 'wx-src', useKma
      ? (ko ? `자료 출처: ${esc(this.kma.source)} · ${esc(this.kma.license)}`
            : `Source: ${esc(this.kma.sourceEn || this.kma.source)}`)
      : (ko ? '자료 출처 · Open-Meteo 전지구 수치예보'
            : 'Source · Open-Meteo global NWP')));
  },

  _renderV7(body, ko) {
    body.dataset.weatherCardV7 = '';
    if (!this.model) {
      const loading = el('section', 'wcv7-skeleton');
      loading.setAttribute('data-weather-card-v7', '');
      loading.setAttribute('aria-busy', 'true');
      loading.innerHTML = `<div></div><div></div><div></div><p>${ko
        ? '관측·예보·특보의 출처와 시각을 확인하는 중…'
        : 'Checking observation, forecast, warning sources and times…'}</p>`;
      body.appendChild(loading);
      if (!this.modelRequestKey && this.modelErrors.weatherCard) {
        loading.classList.add('is-error');
        loading.querySelector('p').textContent = ko
          ? '현재 위치의 날씨 근거를 불러오지 못했습니다.'
          : 'Weather evidence for this location is unavailable.';
      }
      return;
    }

    const model = this.model;
    const sourceMap = new Map(model.sources.map(source => [source.id, source]));
    const activeHour = this.selectedAt
      ? model.hourly.find(hour => hour.validAt === this.selectedAt) || null : null;
    const root = body;
    root.classList.add('wcv7');
    root.setAttribute('data-weather-card-v7', '');

    root.appendChild(renderHero(model, sourceMap, ko, activeHour));

    const warning = el('section', 'wcv7-alert');
    warning.dataset.weatherSection = 'official-warning';
    warning.innerHTML = safetyGateMarkup(model.warningGate, ko ? 'ko' : 'en', {
      countryCode: inKorea(model.location.lat, model.location.lon) ? 'KR' : null,
    });
    root.appendChild(warning);

    root.appendChild(this._renderHourly(model, ko));
    root.appendChild(renderDaily(model, ko));
    // 안내할 특보가 있을 때만 카드를 둔다. "확인할 수 없습니다"·"분리해 읽으세요"는 안내가 아니라
    // 빈 카드라 숨긴다(2026-09-06 요청). 공식 특보 게이트는 위 official-warning 칸이 따로 지킨다.
    const intelligence = renderIntelligence(model, ko, activeHour);
    if (intelligence) root.appendChild(intelligence);
    const detailsEl = renderDetails(model, sourceMap, ko);
    root.appendChild(detailsEl);
    fillMoon(detailsEl, model, ko);
    fillNearbyRain(detailsEl, model, ko);
    /* 출처·시각·상태 카드는 뺐다 (2026-09-06 받은 지시) — 출처는 좌하단 한 줄(ui-source.js inlineSource)에만 적는다. renderSources 는 남겨 둔다. */
    root.appendChild(renderEarthActions(model, ko));
    root.querySelectorAll('.wcv7-detail-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const card = button.closest('.wcv7-detail');
        const expanded = !card.classList.contains('is-expanded');
        card.classList.toggle('is-expanded', expanded);
        button.setAttribute('aria-expanded', String(expanded));
        card.querySelector('.wcv7-detail-body').hidden = !expanded;
      });
    });
    root.querySelectorAll('[data-weather-layer]').forEach(button => {
      button.addEventListener('click', () => document.dispatchEvent(new CustomEvent(
        'earthus:weather-layer-request', { detail: { id: button.dataset.weatherLayer } },
      )));
    });
  },

  _renderHourly(model, ko) {
    const section = el('section', 'wcv7-section wcv7-hourly');
    section.dataset.weatherSection = 'hourly';
    section.innerHTML = `<header><div><small>${ko ? '공식 예보' : 'OFFICIAL FORECAST'}</small>`
      + `<h4>${ko ? '앞으로 24시간' : 'Next 24 hours'}</h4></div>`
      + `<span>${ko ? '시간을 누르면 지구와 카드가 함께 이동합니다' : 'Choose a time to sync Earth and cards'}</span></header>`;
    const rail = el('div', 'wcv7-hour-rail');
    const hours = model.hourly.slice(0, 24);
    /* 일출·일몰을 시간 흐름 속에 끼워 넣는다(애플 날씨가 하는 것).
       ⚠️ 값은 상세 카드가 쓰는 바로 그 값이다 — 여기서 따로 계산하지 않는다.
          24시간 창 밖이면 넣지 않는다. 없는 것을 끝에 몰아 붙이면 시간 순서가 거짓말이 된다. */
    const first = Date.parse(hours[0]?.validAt ?? '');
    const last = Date.parse(hours[hours.length - 1]?.validAt ?? '');
    const marks = [];
    [[model.details.sun?.sunrise?.value, ko ? '일출' : 'Sunrise', '🌅'],
     [model.details.sun?.sunset?.value, ko ? '일몰' : 'Sunset', '🌇']].forEach(([value, label, icon]) => {
      const ms = Date.parse(value ?? '');
      if (Number.isFinite(ms) && Number.isFinite(first) && Number.isFinite(last)
        && ms > first && ms < last) marks.push({ ms, label, icon });
    });
    hours.forEach((hour, index) => {
      const hourMs = Date.parse(hour.validAt ?? '');
      while (marks.length && Number.isFinite(hourMs) && marks[0].ms <= hourMs) {
        const mark = marks.shift();
        const cell = el('div', 'wcv7-hour-mark');
        cell.innerHTML = `<time>${clockText(new Date(mark.ms).toISOString(), model.location.timezone)}</time>`
          + `<span aria-hidden="true">${mark.icon}</span><b>${esc(mark.label)}</b>`;
        rail.appendChild(cell);
      }
      const button = el('button', 'wcv7-hour');
      button.type = 'button';
      button.dataset.weatherTime = hour.validAt || '';
      const selected = this.selectedAt
        ? hour.validAt === this.selectedAt : index === 0;
      button.setAttribute('aria-pressed', String(selected));
      const condition = weatherCondition(hour.condition, ko);
      const pop = numOf(hour.precipitationProbability);
      button.innerHTML = `<time>${hourLabel(hour.validAt, model.location.timezone, ko)}</time>`
        + `<span aria-hidden="true">${condition.icon}</span>`
        + `<b>${temperature(hour.temperature, ko).replace('C', '')}</b>`
        /* 0% 를 24칸에 늘어놓으면 읽을 것이 없다 — 비가 올 가능성이 있을 때만 적는다. */
        + (pop != null && pop > 0 ? `<em>${Math.round(pop)}%</em>` : '');
      button.addEventListener('click', () => {
        this.selectedAt = hour.validAt;
        this.render();
        document.dispatchEvent(new CustomEvent('earthus:weather-time', {
          detail: { validAt: hour.validAt, location: model.location, hour },
        }));
      });
      rail.appendChild(button);
    });
    if (!rail.children.length) rail.appendChild(el('p', 'wcv7-empty', ko
      ? '시간별 예보 자료가 없습니다.' : 'Hourly forecast is unavailable.'));
    section.appendChild(rail);
    return section;
  },

  /* ── 오늘 ─────────────────────────────────────────────────── */
  _today(body, wx, ko) {
    /* ⚠️⚠️ **서술이 맨 위다.** 설계 문서(weather-narrative-design.md §3-b)의 결정 —
       "저런 식의 분석 문구는 오늘 기상정보 제공해줄 때 주는 걸로 가자".
       숫자 위에 "그래서 오늘이 어떤 날인가" 한 문단이 먼저 온다.
       ⚠️ 처음엔 별도 '안내' 탭에 넣었다. 그건 아무도 안 누른다 —
          '내 위치'를 누르면 바로 이 탭이 열리는데 거기 없으면 없는 것과 같다. */
    /* ⚠️⚠️ 2026-08-15 실제 화면에서 위 결정이 잘못 작동했다.
       기온·습도 평년 비교가 비·눈·하늘 예보보다 먼저 나오고, 큰 장기 차트가 현재
       날씨를 아래로 밀었다. '내 위치'의 첫 질문은 지금·오늘·내일이다. 서술은 없애지
       않되 공식 예보 뒤의 배경 설명으로 내리고, 장기 기록은 맨 아래 참고로 접는다. */

    // 한국이면 기상청 동네예보를 가장 먼저 그린다 (공식·가까운 대표 지점)
    if (this.kma?.now) this._todayKma(body, ko);
    else this._todayMeteo(body, wx, ko);

    this._narrative(body, ko);
    this._annualClimate(body, ko);
  },

  _annualClimate(body, ko) {
    const details = el('details', 'wx-climate');
    details.innerHTML = `<summary><span>${ko ? '장기 기온 차트' : 'Long-term temperature chart'}</span>`
      + `<small>${ko ? '오늘·내일 예보 아래의 별도 참고 자료' : 'Separate reference below today and tomorrow'}</small><b aria-hidden="true">⌄</b></summary>`;
    const host = el('div', 'wx-climate-body');
    host.innerHTML = `<p class="wx-narr-load">${ko ? '열면 장기 기록을 불러옵니다.' : 'Open to load the record.'}</p>`;
    details.appendChild(host);
    body.appendChild(details);
    const p = chrome.place;
    if (!p || p.lat == null) return;
    let loaded = false;
    details.addEventListener('toggle', () => {
      if (!details.open || loaded) return;
      loaded = true;
      host.innerHTML = `<p class="wx-narr-load">${ko ? '1년 기온 기록을 불러오는 중…' : 'Loading annual temperature record…'}</p>`;
      Promise.all([
        import('./location-climate.js').then(m => m.climateSeriesAt(p.lat, p.lon)),
        import('./ui-charts.js'),
      ]).then(([result, chart]) => {
        if (!host.isConnected) return;
        if (!result) {
          host.innerHTML = `<p class="wx-narr-load">${ko
            ? '반경 40km 안에 비교 가능한 장기 관측소가 없습니다.'
            : 'No current long-record station within 40 km.'}</p>`;
          return;
        }
        if (result.unavailable && result.reason === 'station-mismatch') {
          const expected = result.expectedStation;
          const reference = result.referenceStation;
          host.innerHTML = `<div class="wx-climate-unavailable"><b>${ko
            ? `${esc(expected.name)} 화면에 ${esc(reference.name)} 장기 차트를 대신 표시하지 않습니다.`
            : `We do not substitute ${esc(reference.name)} for ${esc(expected.name)}.`}</b>`
            + `<p>${ko
              ? `${esc(expected.name)} ASOS는 약 ${expected.km}km에 있지만, 현재 연속 장기 곡선은 `
                + `${esc(reference.name)}(약 ${reference.km}km)만 확인됩니다. 다른 도시의 기록을 `
                + `내 위치 날씨처럼 보이지 않게 막았습니다.`
              : `The local ASOS is about ${expected.km} km away, while the verified continuous `
                + `series is ${reference.name}, about ${reference.km} km away.`}</p>`
            + `<p>${ko
              ? `위의 ‘오늘의 배경’은 ${esc(expected.name)} ASOS 평년 분포를 사용합니다.`
              : `Today in context still uses the local ${expected.name} ASOS normals.`}</p></div>`;
          return;
        }
        const graph = chart.spaghetti(result.data.series, { step: 10 });
        if (!graph) return;
        const station = result.station;
        const altitude = Number.isFinite(station.alt) ? ` · ${Math.round(station.alt)}m` : '';
        host.innerHTML = `<p class="wx-climate-warning">${ko
          ? `현재 ${esc(chrome.place.name || '선택 위치')}의 날씨가 아닙니다. 비교 가능한 가장 가까운 장기 기록입니다.`
          : 'This is not current weather. It is the nearest available long-term record.'}</p>`
          + `<h4>${ko ? `참고 · ${station.name} 관측소 1년 기온` : `Reference · ${station.name} annual temperature`}</h4>`
          + `<p class="wx-climate-sub">${ko
            ? `현재 위치에서 약 ${station.km}km${altitude} · 올해와 10년 간격 비교`
            : `About ${station.km} km away${altitude} · this year and 10-year steps`}</p>`
          + `<div class="ch-wrap">${graph.svg}</div>`
          + `<div class="ch-leg">${chart.legendOf(graph, ko)}</div>`
          + `<p class="ch-note">${esc(chart.rangeNote(graph, ko, result.data.source))}</p>`
          + `<p class="ch-note">${esc(result.data.method)}</p>`;
        chart.makeZoomable(host.querySelector('.ch-wrap'), graph.W, graph.H);
      }).catch(error => {
        if (host.isConnected) host.innerHTML = `<p class="wx-narr-load">${ko
          ? '1년 기온 기록을 불러오지 못했습니다.' : 'Could not load annual temperature record.'}<br><small>${esc(error.message)}</small></p>`;
      });
    });
  },

  /** 기상청 동네예보판 — 항목이 Open-Meteo 와 달라 따로 그린다 */
  _todayKma(body, ko) {
    const k = this.kma, n = k.now;
    const forecast = weatherSummary.summarizeKma ? weatherSummary.summarizeKma(k, ko) : null;
    const today = forecast?.today;
    const dd = today || {};
    const place = chrome.place.name || k.name;
    const condition = condText(n.sky, n.pty, ko);
    const forecastHour = String(n.tm || '').slice(8, 10);

    /* 현재 상태와 오늘의 핵심을 한 덩어리로 읽는다.
       ⚠️ 원인 문장은 넣지 않는다. 이 데이터가 증명하는 것은 하늘·강수·시각뿐이다. */
    const hero = el('section', 'wx-hero');
    hero.innerHTML = `<div class="wx-hero-copy">`
      + `<p class="wx-hero-kicker">${ko ? `${esc(place)} · 오늘 날씨` : `${esc(place)} · today`}</p>`
      + `<div class="wx-hero-title"><span aria-hidden="true">${today?.icon || weatherSummary.kmaWeatherSymbol(n.sky, n.pty)}</span>`
      + `<h3>${esc(today?.headline || condition)}</h3></div>`
      + `${today?.detail ? `<p class="wx-hero-detail">${esc(today.detail)}</p>` : ''}`
      + `</div><div class="wx-current">`
      + `<b>${i18n.temp(n.t)}</b><span>${forecastHour
        ? `${forecastHour}${ko ? '시 예보' : ':00 forecast'} · ` : ''}${esc(condition)}</span>`
      + `<i>${dd.tmax != null ? `${ko ? '최고' : 'H'} ${i18n.temp(dd.tmax)}` : ''}`
      + `${dd.tmin != null ? ` · ${ko ? '최저' : 'L'} ${i18n.temp(dd.tmin)}` : ''}</i></div>`;
    body.appendChild(hero);

    /* ⚠️ 어느 지점 기준인지 위에서 바로 밝힌다. 아래까지 내려가야 보이면
       서울 화면에서 인천 값이 나온 것처럼 또 오해하게 된다. */
    body.appendChild(el('div', 'wx-basis', ko
      ? `기상청 ${esc(k.name)} 지점 · 현재 위치에서 약 ${k.km}km · ${fmtBase(k.baseKst)} 발표`
      : `KMA ${esc(k.name)} · about ${k.km} km away · issued ${fmtBase(k.baseKst)}`));

    const rows = [];
    if (n.rh != null) rows.push([ko ? '습도' : 'Humidity', `${Math.round(n.rh)}%`]);
    if (n.ws != null) rows.push([ko ? '바람' : 'Wind', `${n.ws.toFixed(1)} m/s`]);
    if (n.pop != null) rows.push([ko ? '강수확률' : 'Rain chance', `${Math.round(n.pop)}%`]);
    if (typeof n.pcp === 'number' && n.pcp > 0)
      rows.push([ko ? '강수량' : 'Precip', `${n.pcp} mm`]);
    else if (typeof n.pcp === 'string')
      rows.push([ko ? '강수량' : 'Precip', n.pcp]);       // '1mm 미만' 같은 원문
    if (rows.length) {
      const g = el('div', 'wx-grid');
      rows.forEach(([a, b]) => g.appendChild(el('div', 'wx-cell', `<i>${esc(a)}</i><b>${esc(b)}</b>`)));
      body.appendChild(g);
    }

    // 시간별 하늘·강수 — 하루를 가려 버리지 않도록 앞으로 24시간을 가로로 훑는다.
    const next = k.hours.slice(0, 24);
    if (next.length) {
      body.appendChild(el('div', 'wx-section-title',
        `<b>${ko ? '앞으로 24시간' : 'Next 24 hours'}</b><span>${ko ? '옆으로 넘겨 보기' : 'Scroll'}</span>`));
      const hours = el('div', 'wx-hours');
      const firstDay = String(next[0].tm).slice(0, 8);
      next.forEach(h => {
        const p = h.pop ?? 0;
        const day = String(h.tm).slice(0, 8);
        const hour = String(h.tm).slice(8, 10);
        const label = day === firstDay ? `${hour}시` : `${ko ? '내일 ' : '+1 '}${hour}시`;
        const text = condText(h.sky, h.pty, ko);
        hours.appendChild(el('div', 'wxh',
          `<span class="wxh-time">${esc(label)}</span>`
          + `<span class="wxh-icon" aria-hidden="true">${weatherSummary.kmaWeatherSymbol(h.sky, h.pty)}</span>`
          + `<span class="wxh-cond">${esc(text)}</span>`
          + `<b>${i18n.temp(h.t, 0)}</b>`
          + `<i>${Math.round(p)}%</i>`));
      });
      body.appendChild(hours);
    }

    if (forecast?.tomorrow) {
      const t = forecast.tomorrow;
      body.appendChild(el('section', 'wx-tomorrow',
        `<span class="wx-tomorrow-icon" aria-hidden="true">${t.icon}</span>`
        + `<div><b>${esc(t.headline)}</b><p>${esc(t.detail)}</p></div>`
        + `<i>${t.tmax != null ? `${ko ? '최고' : 'H'} ${i18n.temp(t.tmax)}` : ''}`
        + `${t.tmin != null ? `<br>${ko ? '최저' : 'L'} ${i18n.temp(t.tmin)}` : ''}</i>`));
    }
  },

  /** Open-Meteo 판 (한국 밖, 또는 기상청을 못 받았을 때) */
  _todayMeteo(body, wx, ko) {
    const c = wx.current, d = wx.daily;

    const condition = wxText(c.weather_code);
    const hero = el('section', 'wx-hero');
    hero.innerHTML = `<div class="wx-hero-copy"><p class="wx-hero-kicker">${ko ? '현재 날씨' : 'Current weather'}</p>`
      + `<div class="wx-hero-title"><span aria-hidden="true">${weatherSummary.wmoWeatherSymbol(c.weather_code)}</span>`
      + `<h3>${esc(condition)}</h3></div></div>`
      + `<div class="wx-current"><b>${i18n.temp(c.temperature_2m)}</b><span>${esc(condition)}</span>`
      + `<i>${ko ? '최고' : 'H'} ${i18n.temp(d.temperature_2m_max[0])} · `
      + `${ko ? '최저' : 'L'} ${i18n.temp(d.temperature_2m_min[0])}</i></div>`;
    body.appendChild(hero);

    // 값 몇 개 — 없는 값은 줄을 아예 만들지 않는다
    const rows = [];
    if (c.apparent_temperature != null)
      rows.push([ko ? '체감' : 'Feels like', i18n.temp(c.apparent_temperature)]);
    if (c.relative_humidity_2m != null)
      rows.push([ko ? '습도' : 'Humidity', `${Math.round(c.relative_humidity_2m)}%`]);
    if (c.wind_speed_10m != null)
      rows.push([ko ? '바람' : 'Wind', `${c.wind_speed_10m.toFixed(1)} m/s`]);
    if (c.surface_pressure != null)
      rows.push([ko ? '기압' : 'Pressure', `${Math.round(c.surface_pressure)} hPa`]);
    if (d.sunrise?.[0] && d.sunset?.[0])
      rows.push([ko ? '해뜸 · 해짐' : 'Sun',
                 `${d.sunrise[0].slice(11, 16)} · ${d.sunset[0].slice(11, 16)}`]);
    if (rows.length) {
      const g = el('div', 'wx-grid');
      rows.forEach(([k, v]) => g.appendChild(el('div', 'wx-cell',
        `<i>${esc(k)}</i><b>${esc(v)}</b>`)));
      body.appendChild(g);
    }

    // 시간별 하늘·강수 — 있는 만큼만
    const h = wx.hourly;
    if (h?.time?.length && h.precipitation_probability) {
      const now = Date.now();
      const idx = h.time.map((t, i) => [new Date(t).getTime(), i])
        .filter(([t]) => t >= now - 3600_000).slice(0, 24).map(([, i]) => i);
      if (idx.length) {
        body.appendChild(el('div', 'wx-section-title',
          `<b>${ko ? '앞으로 24시간' : 'Next 24 hours'}</b><span>${ko ? '옆으로 넘겨 보기' : 'Scroll'}</span>`));
        const hours = el('div', 'wx-hours');
        idx.forEach(i => {
          const p = h.precipitation_probability[i] ?? 0;
          const hh = h.time[i].slice(11, 13);
          const code = h.weather_code?.[i];
          hours.appendChild(el('div', 'wxh',
            `<span class="wxh-time">${hh}${ko ? '시' : ':00'}</span>`
            + `<span class="wxh-icon" aria-hidden="true">${weatherSummary.wmoWeatherSymbol(code)}</span>`
            + `<span class="wxh-cond">${esc(wxText(code))}</span>`
            + `<b>${i18n.temp(h.temperature_2m?.[i], 0)}</b><i>${p}%</i>`));
        });
        body.appendChild(hours);
      }
    }

    if (d.time?.[1]) {
      const code = d.weather_code?.[1];
      body.appendChild(el('section', 'wx-tomorrow',
        `<span class="wx-tomorrow-icon" aria-hidden="true">${weatherSummary.wmoWeatherSymbol(code)}</span>`
        + `<div><b>${ko ? '내일' : 'Tomorrow'} · ${esc(wxText(code))}</b>`
        + `<p>${ko ? '강수확률 최고' : 'Rain chance up to'} ${d.precipitation_probability_max?.[1] ?? '—'}%</p></div>`
        + `<i>${ko ? '최고' : 'H'} ${i18n.temp(d.temperature_2m_max[1])}<br>`
        + `${ko ? '최저' : 'L'} ${i18n.temp(d.temperature_2m_min[1])}</i>`));
    }
  },

  /* ── 14일 ─────────────────────────────────────────────────── */
  _d14(body, wx, ko) {
    const d = wx.daily;
    if (!d?.time?.length) {
      body.appendChild(el('p', 'wx-empty', ko ? '예보가 없습니다' : 'No forecast'));
      return;
    }
    /* 막대 길이를 맞추려면 전체 기간의 최저·최고가 필요하다 */
    const lo = Math.min(...d.temperature_2m_min.filter(v => v != null));
    const hi = Math.max(...d.temperature_2m_max.filter(v => v != null));
    const span = Math.max(1, hi - lo);

    const list = el('div', 'wx-days');
    d.time.forEach((t, i) => {
      const dt = new Date(t + 'T00:00:00');
      const day = ko ? '일월화수목금토'[dt.getDay()] : ['Su','Mo','Tu','We','Th','Fr','Sa'][dt.getDay()];
      const mn = d.temperature_2m_min[i], mx = d.temperature_2m_max[i];
      if (mn == null || mx == null) return;
      const left = ((mn - lo) / span) * 100, width = ((mx - mn) / span) * 100;
      const pop = d.precipitation_probability_max?.[i];
      const r = el('div', 'wx-day' + (i >= CONFIDENT_DAYS ? ' far' : ''));
      r.innerHTML =
        `<span class="wd-d">${i === 0 ? (ko ? '오늘' : 'Today') : day}</span>`
        + `<span class="wd-n">${dt.getMonth() + 1}/${dt.getDate()}</span>`
        + `<span class="wd-p">${pop != null ? pop + '%' : ''}</span>`
        + `<span class="wd-lo">${i18n.temp(mn, 0)}</span>`
        + `<span class="wd-bar"><i style="left:${left}%;width:${Math.max(4, width)}%"></i></span>`
        + `<span class="wd-hi">${i18n.temp(mx, 0)}</span>`;
      list.appendChild(r);
    });
    body.appendChild(list);

    /* ⚠️ 뒤쪽이 흐린 이유를 반드시 적는다. 안 적으면 "왜 흐리지?"가 아니라
       그냥 같은 확신으로 읽는다. */
    body.appendChild(el('div', 'wx-caveat', ko
      ? `${CONFIDENT_DAYS}일 이후 · 장기 추세 · 흐린 색으로 구분`
      : `After day ${CONFIDENT_DAYS} · long-range trend · dimmed`));
  },

  /* ── 안내 ───────────────────────────────────────────────────
     받은 요청: 내 위치 날씨를 **원고처럼** 보여 달라.
     ⚠️⚠️ 원고가 좋은 이유는 형용사가 아니라 **검증 가능한 주장**이라는 것이다 —
        "덥습니다"가 아니라 "평년보다 상위 5%". 그래서 규칙은 하나다:
        **숫자 없는 문장은 쓰지 않는다.** (narrative.js 머리말 참고) */
  /* '안내' 탭 — ⚠️ 서술은 '오늘'에 있다. 여기서 또 그리면 같은 글이 두 번 나온다.
     여기는 **어떻게 읽는지**만 적는다. */
  _noteTab(body, ko) {
    body.appendChild(el('div', 'mt-foot',
      `<p><b>${ko ? '오늘 첫 카드는 어떻게 나오나' : 'How the first card works'}</b></p>`
      + `<p>${ko
          ? '한국에서는 <b>기상청 동네예보</b>의 하늘상태·강수형태·강수확률·시간당 강수량으로 '
            + '지금, 오늘, 내일을 먼저 씁니다. 비의 원인은 공식 근거가 없으면 붙이지 않습니다.'
          : 'Current, today, and tomorrow come first from official forecast fields.'}</p>`
      + `<p><b>${ko ? '오늘의 배경은 무엇인가' : 'What is Today in context?'}</b></p>`
      + `<p>${ko
          ? '그 아래에서 지금 값을 <b>1995~2026년 기상청 ASOS 실측</b>과 견줍니다. '
            + '그날 ±7일 분포에서 기온·습도가 평년과 얼마나 다른지 따로 설명합니다.'
          : 'Below the forecast, current temperature and humidity are compared with KMA observations.'}</p>`
      + `<p> ${ko
          ? '기준 · 열대야 25°C · 초열대야 30°C · 폭염 33/35°C · 기상청 정의'
          : 'Thresholds · tropical night 25°C · super tropical night 30°C · heatwave 33/35°C · KMA'}</p>`
      + `<p> ${ko
          ? '표시 · 평년 범위 · 이례 조건'
          : 'Display · normal range · exceptional conditions'}</p>`
      + `<p> ${ko
          ? '비교 유형 · 현재값과 30년 관측 기록'
          : 'Comparison · current value and 30-year observations'}</p>`));
  },

  _narrative(body, ko) {
    body.appendChild(el('div', 'wx-section-title wx-context-title',
      `<b>${ko ? '오늘의 배경' : 'Today in context'}</b>`
      + `<span>${ko ? '기온·습도를 평년과 비교' : 'Temperature and humidity vs normal'}</span>`));
    const box = el('div', 'wx-narr');
    box.innerHTML = `<p class="wx-narr-load">${ko ? '오늘이 어떤 날인지 보는 중…' : 'Reading today…'}</p>`;
    body.appendChild(box);

    const p = chrome.place;
    if (!p || p.lat == null) {
      box.innerHTML = `<p class="wx-narr-load">${ko
        ? '위치를 알면 그날이 평년과 어떻게 다른지 알려드립니다.'
        : 'Grant location to compare today against 30 years.'}</p>`;
      return;
    }

    import('./narrative.js').then(({ narrative }) => narrative.build(p.lat, p.lon, ko))
      .then(n => {
        if (!n) {
          box.innerHTML = `<p class="wx-narr-load">${ko
            ? '지금 값을 받지 못했습니다.' : 'Could not load.'}</p>`;
          return;
        }
        const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        /* 평년 대비를 막대로 — ⚠️ 숫자만 쓰면 "상위 8%"가 얼마나 드문지 안 와닿는다 */
        const bar = r => !r.p ? '' :
          `<span class="wx-pb"><i style="left:${Math.max(2, Math.min(98, r.p))}%"></i></span>`
          + `<em>${r.p >= 50 ? (ko ? `상위 ${100 - r.p}%` : `top ${100 - r.p}%`)
                             : (ko ? `하위 ${r.p}%` : `bottom ${r.p}%`)}</em>`;

        box.innerHTML = `
          <div class="wx-narr-head ${n.level}">
            <p class="h">${md(n.head)}</p>
            ${n.num ? `<p class="n">${esc(n.num)}</p>` : ''}
          </div>
          ${n.story?.length ? `<div class="wx-story">${
            n.story.map(t => `<p>${md(t)}</p>`).join('')}</div>` : ''}
          <button class="wx-narr-more" data-wx-more>${ko ? '근거 보기' : 'Why'}</button>
          <div class="wx-narr-body" hidden>
            ${n.why ? `<p class="wx-why">${esc(n.why)}</p>` : ''}
            ${n.rows.length ? `<ul class="wx-narr-rows">${n.rows.map(r => `
              <li><i>${esc(r.k)}</i><b>${esc(r.v)}</b>${bar(r)}</li>`).join('')}</ul>` : ''}
            ${n.feelN >= 2 ? `
              <div class="wx-feel">
                <b>${ko ? `체감온도 — 공식 ${n.feelN}개 중 ${n.feelHot}개가 폭염 단계`
                        : `Feels-like — ${n.feelHot}/${n.feelN} in heat range`}</b>
                <p>${['kma', 'nws', 'hx'].filter(k => n.feel[k] != null).map(k =>
                  `${({ kma: '기상청', nws: 'NWS 지수', hx: 'Humidex' })[k]} ${n.feel[k]}`)
                  .join(' · ')}</p>
                <p class="wx-feel-warn"> ${ko
                  ? '공식마다 단위와 가정이 다릅니다 — 숫자를 같은 자로 비교하지 마세요. '
                    + '단계로만 견줍니다.'
                  : 'Different units and assumptions — compare levels, not numbers.'}</p>
              </div>` : ''}
            <div class="wx-narr-src">
              ${n.caveats.map(c => `<p>${esc(c)}</p>`).join('')}
              ${n.sources.map(sname => `<p class="s">${esc(sname)}</p>`).join('')}
            </div>
          </div>`;
        box.querySelector('[data-wx-more]')?.addEventListener('click', (e) => {
          const b = box.querySelector('.wx-narr-body');
          const on = b.hasAttribute('hidden');
          if (on) b.removeAttribute('hidden'); else b.setAttribute('hidden', '');
          e.target.textContent = on ? (ko ? '접기' : 'Hide') : (ko ? '근거 보기' : 'Why');
        });
      })
      .catch(err => {
        box.innerHTML = `<p class="wx-narr-load">${ko ? '오늘 상태를 내지 못했습니다.'
          : 'Could not build.'}<br><small>${esc(err.message)}</small></p>`;
      });

    // 지금 어디 기준인지 — 이건 지금도 정직하게 말할 수 있다
    const st = myLocation.state;
    body.appendChild(el('div', 'wx-where', ko
      ? (st === 'ok'
          ? `기준 위치: ${chrome.place.name || '위치 확인 중'} (${chrome.place.lat.toFixed(3)}, ${chrome.place.lon.toFixed(3)})`
          : `기준 위치: 기본값 ${chrome.place.name} — 위치 권한이 없어 내 자리를 모릅니다`)
      : (st === 'ok'
          ? `Based on your location (${chrome.place.lat.toFixed(3)}, ${chrome.place.lon.toFixed(3)})`
          : `Based on a default location — location permission not granted`)));
  },
};

const WEATHER_REGION_ALIASES = Object.freeze([
  ['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'],
  ['광주', '광주'], ['대전', '대전'], ['울산', '울산'], ['세종', '세종'],
  ['경기', '경기'], ['강원', '강원'], ['충북', '충북'], ['충청북', '충북'],
  ['충남', '충남'], ['충청남', '충남'], ['전북', '전북'], ['전라북', '전북'],
  ['전남', '전남'], ['전라남', '전남'], ['경북', '경북'], ['경상북', '경북'],
  ['경남', '경남'], ['경상남', '경남'], ['제주', '제주'],
]);

function normalizeWeatherPlace(place = {}) {
  const name = String(place.name || place.region || '');
  const region = place.region || WEATHER_REGION_ALIASES.find(([prefix]) => name.startsWith(prefix))?.[1] || null;
  return {
    name: place.name || null,
    lat: Number(place.lat),
    lon: Number(place.lon),
    region,
  };
}

/* ── 값을 그림으로 읽는 부품 (2026-09-08) ──────────────────────────────
   애플 날씨에서 가져온 것은 색이 아니라 **정보를 배치하는 방식**이다 — 눌러야 펼쳐지던
   아코디언을 없애고, 값을 그림 안에 넣어 카드 앞면에서 바로 읽게 한다.
   색은 전부 app.css 정본 토큰과 이 파일 CSS 의 배지색이고, 피그마 키트에서 가져온 것은 없다.

   ⚠️ 그림은 값을 만들지 않는다. 값이 없으면 그림을 아예 그리지 않는다 —
      게이지가 왼쪽 끝을 가리키는 것과 값이 없는 것은 전혀 다른 뜻이다. */
const GRAPH_TEAL = '#3fc7c0';

/** 값 하나를 숫자로. 없으면 null.
    ⚠️ Number(null) 은 0 이다. 이 한 줄이 없으면 자료가 없는 칸이 화면에서 '0' 이 되고,
       그건 이 제품이 하지 않기로 한 바로 그 거짓말이다. 숫자로 바꾸는 곳은 여기 하나뿐이다. */
function numOf(point) {
  const raw = (point && typeof point === 'object') ? point.value : point;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** 값을 [min,max] 안의 0~1 로. 값이 없으면 null(= 그리지 않는다). */
function ratio(value, min, max) {
  const n = numOf(value);
  if (n == null) return null;
  return Math.min(1, Math.max(0, (n - min) / (max - min)));
}

/** 카드 앞면의 큰 숫자. 값이 없으면 null 을 돌려주고, 부르는 쪽이 이유를 적는다. */
function faceBig(point, digits = 1, unitOverride = null) {
  const n = numOf(point);
  if (n == null) return null;
  const num = n.toFixed(digits).replace(/\.0$/, '');
  const unit = unitOverride ?? point.unit ?? '';
  return `<span class="wcv7-c-big">${esc(num)}${unit ? `<small>${esc(unit)}</small>` : ''}</span>`;
}

/** 값 없음 — 칸을 0 으로 채우지 않고 왜 없는지 적는다. */
function faceNa(text) { return `<span class="wcv7-c-na">${esc(text)}</span>`; }

/** 색 막대 — 자외선·공기질처럼 '어느 구간인가'가 숫자보다 중요한 값. */
function faceBar(r) {
  if (r == null) return '';
  return `<span class="wcv7-c-bar"><i style="left:${(r * 100).toFixed(1)}%"></i></span>`;
}

/* 반원 게이지 — 시안의 호는 반지름 42 라 위가 잘려 나갔다(현 30 · 화살 26 이면 반지름은 46.9).
   진행 부분은 삼각함수 대신 pathLength=100 + dasharray 로 자른다 — 같은 d 를 쓰니 어긋날 수 없다. */
const GAUGE_D = 'M8 30 A46.9 46.9 0 0 1 92 30';
const GAUGE_R = 46.9, GAUGE_CY = 50.9, GAUGE_HALF = 1.1065;   // 반호 63.4°
function faceGauge(r) {
  if (r == null) return '';
  const phi = -GAUGE_HALF + r * GAUGE_HALF * 2;
  const x = 50 + GAUGE_R * Math.sin(phi);
  const y = GAUGE_CY - GAUGE_R * Math.cos(phi);
  return '<svg class="wcv7-c-arc" viewBox="0 0 100 34" aria-hidden="true">'
    + `<path d="${GAUGE_D}" stroke="rgba(242,245,248,.16)" stroke-width="5"/>`
    + `<path d="${GAUGE_D}" pathLength="100" stroke-dasharray="${(r * 100).toFixed(1)} 100"`
    + ` stroke="${GRAPH_TEAL}" stroke-width="5"/>`
    + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#f2f5f8"/></svg>`;
}

/* 해가 뜬 뒤 어디쯤 왔는지 — 2차 베지에 위의 점으로 찍는다(시안의 호 그대로). */
function faceSunArc(r) {
  let sun = '';
  if (r != null) {
    const t = r, u = 1 - t;
    const x = u * u * 6 + 2 * u * t * 160 + t * t * 314;
    const y = u * u * 30 + 2 * u * t * -12 + t * t * 30;
    sun = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#f2a65a"/>`;
  }
  return '<svg class="wcv7-c-arc is-wide" viewBox="0 0 320 34" aria-hidden="true">'
    + '<path d="M6 30 Q160 -12 314 30" stroke="rgba(242,245,248,.18)" stroke-width="1.6"/>'
    + '<line x1="6" y1="30" x2="314" y2="30" stroke="rgba(242,245,248,.1)" stroke-width="1"/>'
    + sun + '</svg>';
}

/* 바람 — 나침반. 화살은 **바람이 불어오는 쪽**을 가리킨다(북풍이면 위). 풍향이 없으면 화살을 뺀다. */
function faceCompass(dirPoint, speedPoint) {
  const deg = numOf(dirPoint);
  const spd = numOf(speedPoint);
  const arrow = deg != null
    ? `<g transform="rotate(${deg.toFixed(0)} 26 26)"><path d="M26 12 L30 30 L26 26.5 L22 30 Z" fill="${GRAPH_TEAL}"/></g>`
    : '';
  const num = spd != null ? spd.toFixed(1).replace(/\.0$/, '') : '—';
  return '<svg class="wcv7-c-compass" viewBox="0 0 52 52" aria-hidden="true">'
    + '<circle cx="26" cy="26" r="22" fill="none" stroke="rgba(242,245,248,.16)" stroke-width="1.3"/>'
    + '<text x="26" y="9.5" fill="rgba(242,245,248,.5)" font-size="6.5" text-anchor="middle">N</text>'
    + arrow
    + `<text x="26" y="29" fill="#f2f5f8" font-size="12" text-anchor="middle">${esc(num)}</text>`
    + `<text x="26" y="37" fill="rgba(242,245,248,.5)" font-size="6" text-anchor="middle">${esc(speedPoint?.unit || 'm/s')}</text>`
    + '</svg>';
}

/* 풍향 각도 → 바람 이름. 기상에서 '북풍'은 북에서 불어오는 바람이다. */
function windFrom8(deg, ko) {
  if (deg == null || !Number.isFinite(deg)) return null;
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return (ko ? ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][i] + '풍'
             : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][i]);
}

/** 히어로의 큰 기온 — 단위는 도 기호 하나로 줄인다(항상 섭씨다). */
/* 화면에 적을 지명. 좌상단 도시 이름(ui.js render)과 **같은 순서**로 고른다 —
   두 곳이 다른 이름을 말하면 어느 쪽이 맞는지 알 수 없다.
   ⚠️ 위치 권한이 없어 기본 위치(인천)를 쓰는 중이면 그 사실을 밝힌다 (감사 P1-5 와 같은 규칙).
      지명만 크게 적으면 사용자는 자기 동네로 읽는다. */
function placeMarkup(model, ko) {
  const name = chrome.place?.name
    || (chrome.isDefault ? chrome.defaultName : null)
    || model.location?.name
    || (ko ? '위치 확인 중…' : 'Locating…');
  return `${esc(name)}${chrome.isDefault
    ? `<small class="wcv7-hero-default">${ko ? '기본 위치' : 'default location'}</small>` : ''}`;
}

function heroTemp(point) {
  const n = numOf(point);
  return n == null ? '—' : `${Math.round(n)}<sup>°</sup>`;
}

function roundDeg(point) {
  const n = numOf(point);
  return n == null ? null : `${Math.round(n)}°`;
}

/* 히어로 — 애플식: 지명 → 큰 기온 → 조건 → 최고·최저 → 출처 한 줄.
   ⚠️ 출처는 없애지 않는다. 알약 배지를 색 점 하나로 줄였을 뿐이다. 애플은 자료를 직접 만드니
      안 밝혀도 되지만 우리는 여러 기관 자료를 섞어 쓴다 — 밝히는 것이 제품 그 자체다. */
function renderHero(model, sourceMap, ko, activeHour = null) {
  const section = el('section', 'wcv7-hero');
  section.dataset.weatherSection = 'hero';
  const current = model.current;
  const temperaturePoint = activeHour?.temperature || current.temperature;
  const conditionPoint = activeHour?.condition || current.condition;
  const source = sourceMap.get(temperaturePoint.sourceRef);
  const condition = weatherCondition(conditionPoint, ko);
  const today = model.daily[0];
  const feels = roundDeg(current.feelsLike);
  const range = [
    roundDeg(today?.temperatureMax) ? `${ko ? '최고' : 'H'} ${roundDeg(today.temperatureMax)}` : null,
    roundDeg(today?.temperatureMin) ? `${ko ? '최저' : 'L'} ${roundDeg(today.temperatureMin)}` : null,
  ].filter(Boolean).join('   ');
  const instant = formatInstant(temperaturePoint.observedAt || temperaturePoint.issuedAt
    || temperaturePoint.validAt, model.location.timezone, ko);
  const srcLabel = source ? (ko ? source.label : (source.labelEn || source.label))
    : (ko ? '출처 확인 중' : 'Source pending');
  section.innerHTML = `<div class="wcv7-eyebrow"><span>${activeHour
    ? (ko ? '선택 시각' : 'SELECTED TIME') : (ko ? '지금' : 'NOW')}</span></div>`
    + `<div class="wcv7-hero-place">${placeMarkup(model, ko)}</div>`
    + `<div class="wcv7-temperature">${heroTemp(temperaturePoint)}</div>`
    + `<div class="wcv7-hero-cond"><span aria-hidden="true">${condition.icon}</span> ${esc(condition.label)}`
    + `${feels ? ` · ${ko ? '체감' : 'feels'} ${esc(feels)}` : ''}</div>`
    + (range ? `<div class="wcv7-hero-range">${esc(range)}</div>` : '')
    + `<div class="wcv7-hero-src"><i class="wcv7-c-dot ${sourceTypeClass(temperaturePoint.sourceType)}"></i>`
    + `<span>${esc(sourceTypeLabel(temperaturePoint.sourceType, ko))} · ${esc(srcLabel)} · ${esc(instant)}</span>`
    + `${stateNotice(temperaturePoint, ko)}</div>`;
  return section;
}

function renderDaily(model, ko) {
  const section = el('section', 'wcv7-section wcv7-daily');
  section.dataset.weatherSection = '10-day';
  section.innerHTML = `<header><div><small>${ko ? '공식·모델 구분' : 'OFFICIAL / MODEL'}</small>`
    + `<h4>${ko ? '10일 날씨' : '10-day weather'}</h4></div>`
    + `<span>${ko ? '막대는 그날 최저~최고 구간입니다' : 'Bars show each day low-to-high'}</span></header>`;
  const list = el('div', 'wcv7-day-list');
  const days = model.daily.slice(0, 10);
  /* 막대는 10일 전체의 최저~최고를 기준으로 그린다 — 날마다 기준이 달라지면 비교가 안 된다. */
  const temps = days.flatMap(day => [numOf(day.temperatureMin), numOf(day.temperatureMax)])
    .filter(value => value != null);
  const floor = temps.length ? Math.min(...temps) : null;
  const span = temps.length ? (Math.max(...temps) - floor) || 1 : null;
  days.forEach((day, index) => {
    const row = el('article', 'wcv7-day');
    const condition = weatherCondition(day.condition, ko);
    const min = numOf(day.temperatureMin);
    const max = numOf(day.temperatureMax);
    /* 최저·최고가 다 있어야 구간이다. 하나만 있으면 막대를 그리지 않는다(반쪽을 지어내지 않는다). */
    const bar = (floor != null && min != null && max != null)
      ? `<span class="wcv7-day-track"><i style="left:${((min - floor) / span * 100).toFixed(1)}%;`
        + `right:${(100 - (max - floor) / span * 100).toFixed(1)}%"></i></span>`
      : '<span class="wcv7-day-track"></span>';
    const pop = numOf(day.precipitationProbability);
    row.innerHTML = `<div class="wcv7-day-date"><b>${dayLabel(day.date, index, ko)}</b>`
      + `<span>${shortDate(day.date, ko)}</span></div>`
      + `<div class="wcv7-day-condition"><span aria-hidden="true">${condition.icon}</span>`
      + (pop != null && pop > 0 ? `<em>${Math.round(pop)}%</em>` : '')
      + `</div>`
      + `<span class="wcv7-day-lo">${temperature(day.temperatureMin, ko).replace('C', '')}</span>`
      + bar
      + `<span class="wcv7-day-hi">${temperature(day.temperatureMax, ko).replace('C', '')}</span>`
      + `<i class="wcv7-c-dot ${sourceTypeClass(day.temperatureMax?.sourceType || day.temperatureMin?.sourceType)}"`
      + ` title="${esc(sourceTypeLabel(day.temperatureMax?.sourceType || day.temperatureMin?.sourceType, ko))}"></i>`;
    list.appendChild(row);
  });
  if (!list.children.length) list.appendChild(el('p', 'wcv7-empty', ko
    ? '10일 예보 자료가 없습니다.' : '10-day forecast is unavailable.'));
  section.appendChild(list);
  return section;
}

function renderIntelligence(model, ko, activeHour = null) {
  const active = model.warningGate?.gate === 'OFFICIAL_WARNING_ACTIVE';
  if (!active) return null;   // 특보가 없으면 카드 자체를 만들지 않는다
  const section = el('section', 'wcv7-section wcv7-intelligence');
  section.dataset.weatherSection = 'intelligence';
  const unknown = model.warningGate?.status === 'UNKNOWN' || model.warningGate?.gate === 'UNKNOWN';
  let title;
  let body;
  if (active) {
    title = ko ? '공식 특보를 먼저 확인하세요' : 'Check the official warning first';
    body = ko
      ? '특보가 발효 중이므로 이 카드에서는 야외 활동에 대한 긍정 추천을 만들지 않습니다.'
      : 'An official warning is active, so this card does not create a positive outdoor recommendation.';
  } else if (unknown) {
    title = ko ? '특보 상태를 확인할 수 없습니다' : 'Warning status is unavailable';
    body = ko
      ? '공식 특보 확인 전에는 안전하다고 단정하거나 활동을 추천하지 않습니다.'
      : 'Earthus does not declare conditions safe or recommend activity before official warning verification.';
  } else {
    title = ko ? '관측과 예보를 분리해 읽으세요' : 'Read observations and forecasts separately';
    body = ko
      ? '현재 수치는 관측, 앞으로의 값은 공식 예보 또는 모델입니다. 원인이나 안전 결론은 자료가 증명하는 범위 밖에서 덧붙이지 않습니다.'
      : 'Current values are observations; future values are official or model forecasts. No unsupported cause or safety conclusion is added.';
  }
  const selected = activeHour
    ? (ko
      ? `선택한 시각 ${formatInstant(activeHour.validAt, model.location.timezone, true)} · `
        + `${sourceTypeLabel(activeHour.sourceType, true)} · 기온 ${temperature(activeHour.temperature, true)} · `
        + `강수확률 ${valueText(activeHour.precipitationProbability, 0)}`
      : `Selected ${formatInstant(activeHour.validAt, model.location.timezone, false)} · `
        + `${sourceTypeLabel(activeHour.sourceType, false)} · ${temperature(activeHour.temperature, false)} · `
        + `rain ${valueText(activeHour.precipitationProbability, 0)}`)
    : null;
  section.innerHTML = `<header><div><small>EARTHUS WEATHER INTELLIGENCE</small>`
    + `<h4>${esc(title)}</h4></div></header><p>${esc(body)}</p>`
    + (selected ? `<p class="wcv7-selected-fact">${esc(selected)}</p>` : '');
  return section;
}

/* 달 위상·월출·월몰·다음 보름 — 2026-09-07 받은 요청(애플 날씨에는 있고 우리에는 없던 것).
   ⚠️ 이 값은 관측이 아니라 **표준 공식 계산**이다. 그래서 기관 이름을 출처로 적지 않고
      '천문 계산'이라고 밝히며, sky.js 의 저정밀 한계(달 ~0.3°)에서 오는 오차도 같이 적는다.
   교차검증(2026-09-07 인천) 애플 날씨: 그므달 18% · 월몰 16:34 · 다음 만월 20일
                                우리: 그므달 17% · 월몰 16:39 · 다음 보름 20일 뒤 */
async function fillMoon(section, model, ko) {
  const slot = section.querySelector('[data-moon-slot]');
  if (!slot) return;
  const lat = model.location?.lat, lon = model.location?.lon;   // 계약의 이름은 lat/lon 이다(latitude 아니다)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;   // 좌표가 없으면 달은 적지 않는다
  let sky;
  try { sky = await import('./sky.js'); } catch (_) { return; }
  const now = Date.now();
  const ph = sky.moonPhase(now);
  const times = sky.moonTimes(now, lat, lon);
  const full = sky.nextMoonPhase(now, 0.5);
  const tz = model.location.timezone;
  const clock = ms => clockText(new Date(ms).toISOString(), tz);
  const parts = [`${ko ? '달' : 'Moon'} ${esc(sky.moonPhaseName(ph.elong, ko))} · ${ko ? '밝은 면' : 'lit'} ${Math.round(ph.illum * 100)}%`];
  if (times.rise) parts.push(`${ko ? '월출' : 'Moonrise'} ${clock(times.rise)}`);
  if (times.set) parts.push(`${ko ? '월몰' : 'Moonset'} ${clock(times.set)}`);
  if (full) { const d = Math.max(0, Math.round((full - now) / 86400000));
    parts.push(ko ? `다음 보름 ${d}일 뒤` : `Next full moon in ${d} d`); }
  slot.innerHTML = ` · ${parts.join(' · ')}`;
  /* 계산이라는 단서는 카드 앞면이 아니라 근거 칸에 둔다 — 앞면은 값만 읽게 하고,
     성격을 밝히는 문장은 누르면 나온다. 밝히기를 그만두는 것이 아니다. */
  const note = section.querySelector('[data-moon-note]');
  if (note) note.innerHTML = `<div class="wcv7-moon-src">${ko
    ? '달 값은 관측이 아니라 천문 계산입니다(저정밀 공식). 위상은 거의 정확하고 월출·월몰은 몇 분 틀릴 수 있습니다.'
    : 'Moon values are computed with low-precision formulae, not observed. Phase is close; rise and set can be off by a few minutes.'}</div>`;
}

/* 8방위. 관측소가 나에게서 어느 쪽인지만 말한다(정밀한 방위각은 쓸 데가 없다). */
function bearing8(fromLat, fromLon, toLat, toLon, ko) {
  const r = Math.PI / 180;
  const dLon = (toLon - fromLon) * r;
  const y = Math.sin(dLon) * Math.cos(toLat * r);
  const x = Math.cos(fromLat * r) * Math.sin(toLat * r)
    - Math.sin(fromLat * r) * Math.cos(toLat * r) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) / r + 360) % 360;
  const i = Math.round(deg / 45) % 8;
  return (ko ? ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][i] + '쪽'
             : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][i]);
}

/* 주변에서 지금 비가 오는 곳 — 2026-09-07 요청("분단위 강수 예보 가능?")의 1단계.
 *
 * ⚠️ 이건 예보가 아니다. **지금 어디에 내리고 있는지 실측**만 말한다.
 *    도달 시각·이동 방향을 만들어내지 않는다. 그러려면 연속된 레이더 격자가 있어야 하는데,
 *    우리 레이더(aws/kma-radar)는 기상청이 이미 그려 놓은 지도 PNG 라서
 *    핸들러가 "직접 위경도로 재투영하지 않는다"고 못 박아 두었다 — 픽셀을 좌표로 되돌릴 수 없다.
 *
 * ⚠️ 관측소는 736곳, 평균 15~20km 간격이다. 그 사이로 지나가는 소나기는 안 잡힌다.
 *    그래서 "비 없음"은 "관측소에 안 잡혔다"는 뜻이고, 문구에도 그렇게 적는다.
 *
 * ⚠️ 자료가 늙었으면(허브 용량 초과로 Lambda 가 묵으면) 지금 상태를 말하지 않는다.
 *    옛 관측을 현재로 읽으면 "비 없음"이 거짓말이 된다.
 */
const RAIN_RADIUS_KM = 80;
const RAIN_STALE_MIN = 30;

async function fillNearbyRain(section, model, ko) {
  const slot = section.querySelector('[data-rain-slot]');
  if (!slot) return;
  const lat = model.location?.lat, lon = model.location?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (!inKorea(lat, lon)) return;          // AWS 망은 한국뿐 — 밖에서는 아무 말도 하지 않는다
  let data;
  try { data = await getKorea('aws'); } catch (_) { return; }
  const list = Array.isArray(data?.stations) ? data.stations : null;
  if (!list || !list.length) return;

  // 관측 시각(KST, YYYYMMDDHHMM) — 늙었으면 현재로 읽지 않는다
  const kst = String(data.observedKst || '');
  let obsMs = null;
  if (/^\d{12}$/.test(kst)) {
    obsMs = Date.UTC(+kst.slice(0, 4), +kst.slice(4, 6) - 1, +kst.slice(6, 8),
      +kst.slice(8, 10) - 9, +kst.slice(10, 12));
  }
  const ageMin = obsMs == null ? null : Math.round((Date.now() - obsMs) / 60000);
  const hhmm = /^\d{12}$/.test(kst) ? `${kst.slice(8, 10)}:${kst.slice(10, 12)}` : null;

  let near = 0, wet = 0, best = null;
  for (const s of list) {
    if (s.lat == null || s.lon == null) continue;
    const km = distKm(lat, lon, s.lat, s.lon);
    if (km > RAIN_RADIUS_KM) continue;
    near++;
    const mm15 = Number.isFinite(s.rn15) ? s.rn15 : null;
    const mm60 = Number.isFinite(s.rn60) ? s.rn60 : null;
    if (!(mm15 > 0) && !(mm60 > 0)) continue;
    wet++;
    if (!best || km < best.km) best = { km, mm15, mm60, name: s.name, lat: s.lat, lon: s.lon };
  }
  if (!near) return;   // 반경 안에 관측소가 하나도 없으면 "비 없음"이라 말할 근거도 없다

  let line, short;
  if (ageMin != null && ageMin > RAIN_STALE_MIN) {
    short = ko ? `주변 관측 ${ageMin}분 늦음` : `Nearby obs ${ageMin} min late`;
    line = ko
      ? `주변 관측이 ${ageMin}분 늦어 지금 비가 오는지는 말하지 않습니다.`
      : `Nearby observations are ${ageMin} min late, so current rain is not stated.`;
  } else if (best) {
    const dir = bearing8(lat, lon, best.lat, best.lon, ko);
    const amount = best.mm15 > 0
      ? `${ko ? '최근 15분' : 'past 15 min'} ${best.mm15.toFixed(1)} mm`
      : `${ko ? '최근 60분' : 'past 60 min'} ${best.mm60.toFixed(1)} mm`;
    short = ko
      ? `${esc(dir)} ${Math.round(best.km)}km 지금 비`
      : `Rain now ${esc(dir)} ${Math.round(best.km)} km`;
    line = ko
      ? `지금 비 오는 가장 가까운 관측소 ${esc(dir)} ${Math.round(best.km)}km ${esc(best.name || '')} · ${amount}`
        + ` · 반경 ${RAIN_RADIUS_KM}km 관측소 ${near}곳 중 ${wet}곳`
      : `Nearest station reporting rain: ${esc(best.name || '')}, ${esc(dir)} ${Math.round(best.km)} km · ${amount}`
        + ` · ${wet} of ${near} stations within ${RAIN_RADIUS_KM} km`;
  } else {
    short = ko ? `반경 ${RAIN_RADIUS_KM}km 안 비 없음` : `No rain within ${RAIN_RADIUS_KM} km`;
    line = ko
      ? `반경 ${RAIN_RADIUS_KM}km 관측소 ${near}곳 어디에도 지금 비가 잡히지 않습니다.`
      : `None of the ${near} stations within ${RAIN_RADIUS_KM} km is reporting rain now.`;
  }

  /* 앞면은 한 마디만. 관측소 수·한계·"예보가 아니다"는 근거 칸에 그대로 남는다. */
  slot.innerHTML = ` · ${short}`;
  const note = section.querySelector('[data-rain-note]');
  if (!note) return;
  note.innerHTML = `<br>${line}`
    + `<div class="wcv7-obs-src">${ko
      ? `기상청 방재기상관측(AWS) 매분 실측${hhmm ? ` · ${hhmm} KST` : ''}. `
        + '예보가 아닙니다. 관측소가 선 자리만 알 수 있어 그 사이로 지나는 소나기는 잡히지 않고, '
        + '언제 도착할지는 계산하지 않습니다.'
      : `KMA AWS one-minute observations${hhmm ? ` · ${hhmm} KST` : ''}. `
        + 'Not a forecast. Only station points are measured, so a shower between stations is missed, '
        + 'and no arrival time is computed.'}</div>`;
}

function renderDetails(model, sourceMap, ko) {
  const section = el('section', 'wcv7-section wcv7-details');
  section.dataset.weatherSection = 'details';
  section.innerHTML = `<header><div><small>${ko ? '값·단위·근거' : 'VALUE / UNIT / EVIDENCE'}</small>`
    + `<h4>${ko ? '상세 날씨' : 'Weather details'}</h4></div>`
    + `<span>${ko ? '값은 앞면에, 근거는 누르면' : 'Values up front, evidence on tap'}</span></header>`;
  const current = model.current;
  const air = model.details.airQuality;
  const uv = model.details.uv;
  const sun = model.details.sun;
  const waves = model.details.waves;
  const today = model.daily[0];
  const na = ko ? '자료 없음' : 'Unavailable';

  /* 공기질 — 통합대기환경지수(CAI)는 251 부터 '매우나쁨' 한 칸이라 막대는 0~250 으로 그린다. */
  const aqi = numOf(air.index);
  const aqiFace = aqi != null
    ? `<span class="wcv7-c-big">${Math.round(aqi)}${air.grade ? `<small>${esc(air.grade)}</small>` : ''}</span>`
      + faceBar(ratio(aqi, 0, 250))
    : (air.grade ? `<span class="wcv7-c-big">${esc(air.grade)}</span>` : faceNa(na));
  const uvNum = numOf(uv.value);
  const uvFace = uvNum != null
    ? `<span class="wcv7-c-big">${Math.round(uvNum)}${uv.level ? `<small>${esc(uv.level)}</small>` : ''}</span>`
      + faceBar(ratio(uvNum, 0, 11))
    : faceNa(na);
  /* 해가 뜬 뒤 어디쯤인지 — 밤이면 호만 그리고 해는 찍지 않는다(없는 위치를 지어내지 않는다). */
  const sunriseMs = Date.parse(sun.sunrise?.value ?? '');
  const sunsetMs = Date.parse(sun.sunset?.value ?? '');
  const nowMs = Date.now();
  const dayRatio = (Number.isFinite(sunriseMs) && Number.isFinite(sunsetMs) && sunsetMs > sunriseMs
    && nowMs >= sunriseMs && nowMs <= sunsetMs) ? (nowMs - sunriseMs) / (sunsetMs - sunriseMs) : null;
  const visKm = current.visibility?.value != null
    ? (current.visibility.value / 1000).toFixed(current.visibility.value >= 10000 ? 0 : 1) : null;
  const windDeg = numOf(current.windDirection);

  const items = [
    {
      icon: '☔', title: ko ? '비·눈' : 'Rain & snow',
      face: faceBig(current.precipitation60m, 1) || faceNa(na),
      say: `${ko ? '최근 60분' : 'Past 60 min'}${numOf(current.precipitation60m) === 0
        ? (ko ? ' 비 없음' : ' no rain') : ` ${valueText(current.precipitation60m, 1)}`}`
        + ` · ${ko ? '오늘 확률' : 'today'} ${valueText(today?.precipitationProbability, 0)}`
        /* 주변 실측 강수는 자료 계약(Open-Meteo) 밖이라 렌더 뒤에 채운다. 한국 밖이면 비어 있다. */
        + '<span data-rain-slot></span>',
      points: [current.precipitation15m, current.precipitation60m, today?.precipitationProbability, today?.precipitation],
      body: `${ko ? '최근 15분' : 'Past 15 min'} ${valueText(current.precipitation15m, 1)} · `
        + `${ko ? '오늘 합계' : 'Today total'} ${valueText(today?.precipitation, 1)}`
        + '<span data-rain-note></span>',
    },
    {
      icon: '↗', title: ko ? '바람' : 'Wind',
      face: faceCompass(current.windDirection, current.windSpeed),
      say: [windFrom8(windDeg, ko) && `${windFrom8(windDeg, ko)} ${Math.round(windDeg)}°`,
        numOf(current.windGust) != null && `${ko ? '돌풍' : 'gust'} ${valueText(current.windGust, 1)}`]
        .filter(Boolean).join(' · ') || (ko ? '풍향 자료 없음' : 'Direction unavailable'),
      points: [current.windSpeed, current.windDirection, current.windGust],
      body: `${ko ? '풍속' : 'Speed'} ${valueText(current.windSpeed, 1)} · `
        + `${ko ? '풍향' : 'Direction'} ${valueText(current.windDirection, 0)} · `
        + `${ko ? '최대 순간풍속' : 'Gust'} ${valueText(current.windGust, 1)}`,
    },
    {
      icon: '◌', title: ko ? '공기질' : 'Air quality',
      face: aqiFace,
      say: `PM2.5 ${valueText(air.pm25, 0)} · PM10 ${valueText(air.pm10, 0)}`,
      points: [air.pm10, air.pm25, air.index],
      body: `PM10 ${valueText(air.pm10, 0)} · PM2.5 ${valueText(air.pm25, 0)} · `
        + `${ko ? '통합지수' : 'Index'} ${valueText(air.index, 0)}`
        + `${air.stationName ? ` · ${esc(air.stationName)} ${air.stationDistanceKm ?? '—'}km` : ''}`,
    },
    {
      icon: '☀', title: ko ? '자외선' : 'UV',
      face: uvFace,
      say: ko ? '기상청 생활기상지수 예보값입니다.' : 'Official life-weather index forecast.',
      points: [uv.value],
      body: ko
        ? '기상청 생활기상지수 예보값입니다. 피부 영향은 개인 조건에 따라 다릅니다.'
        : 'Official life-weather index forecast. Personal effects vary.',
    },
    {
      icon: '≈', title: ko ? '체감·습도' : 'Feels like & humidity',
      face: faceBig(current.humidity, 0) || faceNa(na),
      say: [numOf(current.feelsLike) != null && `${ko ? '체감' : 'Feels'} ${valueText(current.feelsLike, 0)}`,
        numOf(current.dewPoint) != null && `${ko ? '이슬점' : 'dew point'} ${valueText(current.dewPoint, 0)}`]
        .filter(Boolean).join(' · ')
        || (ko ? '체감온도를 관측값으로 지어내지 않습니다.' : 'No apparent temperature is invented.'),
      points: [current.feelsLike, current.humidity, current.dewPoint],
      body: `${ko ? '체감' : 'Feels like'} ${valueText(current.feelsLike, 1)} · `
        + `${ko ? '이슬점' : 'Dew point'} ${valueText(current.dewPoint, 1)}. `
        + (current.feelsLike?.dataState === DATA_STATE.NOT_SUPPORTED
          ? (ko ? '관측값만으로 체감온도를 임의 계산하지 않았습니다.' : 'No apparent temperature was invented from observation fields.') : ''),
    },
    {
      icon: '◎', title: ko ? '기압·가시거리' : 'Pressure & visibility',
      face: (faceBig(current.pressure, 0) || faceNa(na)) + faceGauge(ratio(current.pressure, 970, 1040)),
      say: visKm != null
        ? `${ko ? '가시거리' : 'Visibility'} ${visKm} km`
        : (ko ? '가시거리 응답 없음' : 'Visibility unavailable'),
      points: [current.pressure, current.visibility],
      /* 가시거리는 모델값이라 기압(관측)과 같은 카드에 있다고 같은 성격으로 읽힌다. 그래서 집어 말한다. */
      body: `${ko ? '현지기압' : 'Surface pressure'} ${valueText(current.pressure, 0)}`
        + (visKm != null
          ? ` · ${ko ? '가시거리' : 'Visibility'} ${visKm} km`
            + `<div class="wcv7-moon-src">${ko
              ? '가시거리는 관측소 시정계 값이 아니라 모델 예상치입니다(방재기상관측에는 시정계가 없습니다).'
              : 'Visibility is a model value, not a station measurement.'}</div>`
          : ` · ${ko ? '가시거리 응답 없음' : 'Visibility unavailable'}`),
    },
    {
      icon: '◐', title: ko ? '해·달' : 'Sun & moon', wide: true,
      face: faceSunArc(dayRatio),
      say: `${ko ? '일출' : 'Sunrise'} ${clockText(sun.sunrise?.value, model.location.timezone)} · `
        + `${ko ? '일몰' : 'Sunset'} ${clockText(sun.sunset?.value, model.location.timezone)}`
        /* 달은 관측이 아니라 계산이라 자료 계약 밖에 있다. sky.js(18KB)를 지연해 열고 렌더 뒤에 채운다. */
        + '<span data-moon-slot></span>',
      points: [sun.sunrise, sun.sunset],
      body: `${ko ? '해뜸' : 'Sunrise'} ${clockText(sun.sunrise?.value, model.location.timezone)} · `
        + `${ko ? '해짐' : 'Sunset'} ${clockText(sun.sunset?.value, model.location.timezone)}`
        + '<span data-moon-note></span>',
    },
    {
      icon: '≋', title: ko ? '파도·조석' : 'Waves & tide', wide: true,
      face: waves?.wave_height != null
        ? `<span class="wcv7-c-big">${esc(String(waves.wave_height))}<small>m</small></span>`
        : faceNa(ko ? '해상 자료 없음 — 육지이거나 해상 모델값이 없습니다' : 'No marine data — inland or model absent'),
      say: waves?.wave_height != null
        ? `${ko ? '주기' : 'Period'} ${waves.wave_period ?? '—'} s · ${ko ? '유효시각' : 'valid'} ${esc(waves.time || '—')}`
        : (ko ? '없는 값을 0 으로 표시하지 않습니다.' : 'Missing values are not shown as zero.'),
      points: [],
      body: waves?.wave_height != null
        ? `${ko ? '모델 파고' : 'Model wave height'} ${waves.wave_height} m · `
          + `${ko ? '주기' : 'Period'} ${waves.wave_period ?? '—'} s · `
          + `${ko ? '유효시각' : 'Valid'} ${esc(waves.time || '—')} · `
          + (ko ? '조석은 제공하지 않습니다.' : 'Tide is not provided.')
        : (ko ? '육지이거나 해상 모델값이 없습니다. 조석을 0으로 표시하지 않습니다.'
          : 'This is land or marine model data is absent. Missing tide is not shown as zero.'),
    },
  ];
  const grid = el('div', 'wcv7-detail-grid');
  items.forEach((item, index) => {
    const card = el('article', `wcv7-detail${item.wide ? ' is-wide' : ''}`);
    const point = item.points.find(candidate => candidate?.sourceRef);
    const source = sourceMap.get(point?.sourceRef);
    const bodyId = `wcv7-detail-${index}`;
    /* 출처는 색 점 하나로만 남긴다 — 알약 배지 여덟 개가 카드 앞면을 덮으면 값이 안 보인다.
       점을 없애지는 않는다. 누르면 기관 이름과 시각이 그대로 펼쳐진다. */
    const dotLabel = sourceTypeLabel(point?.sourceType, ko);
    card.innerHTML = `<button type="button" class="wcv7-detail-toggle" aria-expanded="false" aria-controls="${bodyId}">`
      + `<span class="wcv7-c-lab"><i class="wcv7-c-ic" aria-hidden="true">${item.icon}</i>`
      + `<b>${esc(item.title)}</b>`
      + `<i class="wcv7-c-dot ${sourceTypeClass(point?.sourceType)}" title="${esc(dotLabel)}"></i></span>`
      + `<span class="wcv7-c-face">${item.face}</span>`
      + `<span class="wcv7-c-say">${item.say}</span></button>`
      + `<div id="${bodyId}" class="wcv7-detail-body" hidden><p>${item.body}</p>`
      + `<small>${source ? `${esc(sourceTypeLabel(source.sourceType, ko))} · ${esc(ko ? source.label : source.labelEn)}`
        : (ko ? '해당 값의 출처 자료 없음' : 'No source record for this value')}</small></div>`;
    grid.appendChild(card);
  });
  section.appendChild(grid);
  return section;
}

function renderSources(model, ko) {
  const section = el('section', 'wcv7-section wcv7-sources');
  section.dataset.weatherSection = 'sources';
  section.innerHTML = `<header><div><small>PROVENANCE</small><h4>${ko ? '출처·시각·상태' : 'Sources, times, status'}</h4></div></header>`;
  const list = el('div', 'wcv7-source-list');
  model.sources.forEach(source => {
    const article = el('article', 'wcv7-source');
    const time = source.observedAt || source.issuedAt || source.receivedAt;
    const meta = [
      sourceTypeLabel(source.sourceType, ko),
      formatInstant(time, model.location.timezone, ko),
      source.distanceKm != null ? `${source.distanceKm}km` : null,
      source.n != null ? `n=${source.n}` : null,
      dataStateLabel(source.dataState, ko),
    ].filter(Boolean).join(' · ');
    article.innerHTML = `<div><b>${esc(ko ? source.label : (source.labelEn || source.label))}</b>`
      + `<span>${esc(meta)}</span></div><small>${esc(source.license)}</small>`;
    list.appendChild(article);
  });
  if (!list.children.length) list.appendChild(el('p', 'wcv7-empty', ko
    ? '출처 자료가 없습니다.' : 'No source records.'));
  section.appendChild(list);
  return section;
}

function renderEarthActions(model, ko) {
  const section = el('section', 'wcv7-section wcv7-earth');
  section.dataset.weatherSection = 'earth';
  section.innerHTML = `<header><div><small>EARTH SYNC</small><h4>${ko ? '지구에서 함께 보기' : 'View on Earth'}</h4></div>`
    + `<span>${ko ? '카드는 닫지 않고 레이어를 엽니다' : 'Open a layer without losing this card'}</span></header>`
    + `<div class="wcv7-earth-actions">`
    + `<button type="button" data-weather-layer="rain">${ko ? '강수' : 'Rain'}</button>`
    + `<button type="button" data-weather-layer="wind">${ko ? '바람' : 'Wind'}</button>`
    + `<button type="button" data-weather-layer="pm25">PM2.5</button></div>`;
  return section;
}

function sourceTypeClass(type) {
  return `is-${String(type || 'unknown').toLowerCase().replaceAll('_', '-')}`;
}

function sourceTypeLabel(type, ko) {
  const labels = {
    [SOURCE_TYPE.OBSERVED]: ko ? '관측' : 'Observed',
    [SOURCE_TYPE.OFFICIAL_FORECAST]: ko ? '공식 예보' : 'Official forecast',
    [SOURCE_TYPE.OFFICIAL_WARNING]: ko ? '공식 특보' : 'Official warning',
    [SOURCE_TYPE.MODEL_FORECAST]: ko ? '모델 예보' : 'Model forecast',
    [SOURCE_TYPE.EARTHUS_ESTIMATE]: ko ? 'Earthus 추정' : 'Earthus estimate',
  };
  return labels[type] || (ko ? '출처 미확인' : 'Source unknown');
}

function dataStateLabel(state, ko) {
  const labels = {
    [DATA_STATE.AVAILABLE]: ko ? '사용 가능' : 'Available',
    [DATA_STATE.MISSING]: ko ? '자료 없음' : 'Missing',
    [DATA_STATE.STALE]: ko ? '지연' : 'Stale',
    [DATA_STATE.ESTIMATED]: ko ? '추정' : 'Estimated',
    [DATA_STATE.INVALID]: ko ? '시각 오류' : 'Invalid',
    [DATA_STATE.NOT_SUPPORTED]: ko ? '미지원' : 'Not supported',
    [DATA_STATE.CONFLICTING]: ko ? '상충' : 'Conflicting',
  };
  return labels[state] || state || (ko ? '상태 미확인' : 'Unknown state');
}

function stateNotice(point, ko) {
  if (!point || point.dataState === DATA_STATE.AVAILABLE) return '';
  return `<strong class="wcv7-state is-${esc(String(point.dataState || '').toLowerCase())}">`
    + `${esc(dataStateLabel(point.dataState, ko))}</strong>`;
}

function weatherCondition(point, ko) {
  const value = point?.value ?? point;
  if (value && (value.sky != null || value.precipitationType != null)) {
    const label = condText(value.sky, value.precipitationType, ko);
    return { label, icon: weatherSummary.kmaWeatherSymbol(value.sky, value.precipitationType) };
  }
  if (value && value.weatherCode != null) {
    const label = wxText(value.weatherCode);
    return { label, icon: weatherSummary.wmoWeatherSymbol(value.weatherCode) };
  }
  return { label: ko ? '상태 자료 없음' : 'Condition unavailable', icon: '—' };
}

function temperature(point, ko) {
  if (!point || point.value == null || !Number.isFinite(Number(point.value))) return ko ? '—' : '—';
  return `${Math.round(Number(point.value))}°C`;
}

function valueText(point, digits = 1) {
  if (!point || point.value == null || !Number.isFinite(Number(point.value))) return '—';
  const value = Number(point.value).toFixed(digits).replace(/\.0$/, '');
  const unit = point.unit || '';
  return unit && !['%', '°C', '°'].includes(unit) ? `${value} ${unit}` : `${value}${unit}`;
}

function evidenceTime(point, timezone, ko) {
  const type = sourceTypeLabel(point?.sourceType, ko);
  const at = point?.observedAt || point?.issuedAt || point?.validAt;
  return `${type} · ${formatInstant(at, timezone, ko)}`;
}

function formatInstant(value, timezone, ko) {
  if (!value) return ko ? '시각 없음' : 'Time unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return ko ? '시각 오류' : 'Invalid time';
  try {
    return new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-US', {
      timeZone: timezone || 'UTC', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: !ko,
    }).format(date);
  } catch (_) {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function clockText(value, timezone) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(11, 16) || '—';
  try {
    return new Intl.DateTimeFormat(i18n.lang === 'ko' ? 'ko-KR' : 'en-US', {
      timeZone: timezone || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  } catch (_) { return String(value).slice(11, 16) || '—'; }
}

function hourLabel(value, timezone, ko) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-US', {
      timeZone: timezone || 'UTC', weekday: 'short', hour: '2-digit', hour12: !ko,
    }).format(date);
  } catch (_) { return value.slice(11, 16); }
}

function dayLabel(value, index, ko) {
  if (index === 0) return ko ? '오늘' : 'Today';
  if (!value) return ko ? `${index + 1}일` : `Day ${index + 1}`;
  const date = new Date(`${value}T12:00:00Z`);
  try { return new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-US', { weekday: 'short' }).format(date); }
  catch (_) { return value; }
}

function shortDate(value, ko) {
  if (!value) return '—';
  const [year, month, day] = String(value).split('-');
  return ko ? `${Number(month)}.${Number(day)}` : `${month}/${day}/${String(year).slice(2)}`;
}

/** '202608020500' → '8/2 05시' — 언제 발표된 예보인지 밝힌다 */
function fmtBase(s) {
  const t = String(s || '');
  if (t.length < 12) return t;
  return `${+t.slice(4, 6)}/${+t.slice(6, 8)} ${t.slice(8, 10)}시`;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
