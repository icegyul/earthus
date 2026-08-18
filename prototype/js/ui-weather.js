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
      if (!$('#wxSheet')?.classList.contains('up')) return;
      this._dropStaleKma();
      this.render();
      this._loadKma();
    });
    return this;
  },

  open(tab) {
    if (tab) this.tab = tab;
    document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
    $('#wxSheet')?.classList.add('up');
    this._dropStaleKma();
    this.render();
    if (!chrome.place.name && !chrome.isDefault) chrome.reverseName(chrome.place.lat, chrome.place.lon);
    /* 아직 안 받았으면 받아 온다 (위치 권한을 늦게 준 경우) */
    if (!chrome.wx) chrome.loadWeather().then(() => this.render());
    /* 한국이면 기상청 예보를 덧대 온다.
       ⚠️ 먼저 그리고 나서 덧댄다 — 기상청을 기다리느라 화면이 비어 있으면 안 된다. */
    this._loadKma();
  },

  _placeKey() {
    const p = chrome.place;
    return p?.lat == null || p?.lon == null ? '' : `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`;
  },

  _dropStaleKma() {
    /* ⚠️ 위치를 옮긴 직후 이전 지점 예보가 한 프레임이라도 보이면 출처가 섞인다. */
    if (this.kmaKey && this.kmaKey !== this._placeKey()) this.kma = null;
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

    $('#wxTitle').textContent = chrome.place.name
      || (chrome.isDefault ? chrome.defaultName : (ko ? '위치 확인 중…' : 'Locating…'));

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

/** '202608020500' → '8/2 05시' — 언제 발표된 예보인지 밝힌다 */
function fmtBase(s) {
  const t = String(s || '');
  if (t.length < 12) return t;
  return `${+t.slice(4, 6)}/${+t.slice(6, 8)} ${t.slice(8, 10)}시`;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
