// EARTHUS AX-01 — 선택한 장소 맥락에서 시작하는 판단 레일.
//
// ⚠️ 이 모듈은 Decision Core를 실행하지 않는다.
//    현재 공개할 수 있는 것은 한국 기상청 공식 특보 Hard Gate와 자료 준비 상태다.
//    활동 점수·혼잡·재고·폐쇄·“가도 된다”를 생성하지 말 것.
//
// ⚠️ 표시 지점 마커는 선택 좌표뿐이다. 특보 polygon이 아니며 위험 영역을 추정하지 않는다.

import { i18n } from './i18n.js';
import { latLonText } from './geoname.js';
import { lookupPlace } from './place.js';
import { wxText } from './layers/weather.js';
import { kmaFcst, condText } from './kma-fcst.js';
import { warn } from './warn.js';
import { safetyGateMarkup } from './safety-gate-ui.js';
import { viewer, scene } from './viewer.js';
import { store } from './store.js';

const ACTIVITIES = Object.freeze({
  WALK_RUN: {
    ko: '산책·러닝', en: 'Walk · run', icon: '◌', metrics: ['rain', 'temp', 'wind'],
    hintKo: '비가 오는지, 현재 기온과 바람이 어떤지 확인합니다.',
    hintEn: 'Check rain, the current temperature, and the wind.',
  },
  CYCLING: {
    ko: '자전거', en: 'Cycling', icon: '◇', metrics: ['rain', 'wind', 'temp'],
    hintKo: '노면에 영향을 주는 비와 주행 중 맞게 될 바람을 먼저 봅니다.',
    hintEn: 'Check rain affecting the road and wind during the ride.',
  },
  HIKING: {
    ko: '등산', en: 'Hiking', icon: '△', metrics: ['nextRain', 'wind', 'humidity'],
    hintKo: '앞으로의 강수 가능성, 바람과 습도를 확인합니다. 산 정상 값은 별도 산 자료에서 봅니다.',
    hintEn: 'Check upcoming rain, wind, and humidity. Peak conditions are in Mountain data.',
  },
  CAMPING: {
    ko: '캠핑', en: 'Camping', icon: '⌂', metrics: ['nextRain', 'wind', 'temp'],
    hintKo: '머무는 동안 비가 올 가능성과 바람, 현재 기온을 확인합니다.',
    hintEn: 'Check rain during your stay, wind, and the current temperature.',
  },
  WATER: {
    ko: '물가 활동', en: 'On the water', icon: '≈', metrics: ['wave', 'wind', 'nextRain'],
    hintKo: '바다로 확인된 지점에서만 파고와 바람, 강수 가능성을 보여줍니다.',
    hintEn: 'Wave, wind, and rain data appear only for a point confirmed over water.',
  },
  STARGAZING: {
    ko: '별보기', en: 'Stargazing', icon: '✦', metrics: ['sky', 'nextRain', 'humidity'],
    hintKo: '하늘 상태와 강수 가능성, 습도를 확인합니다. 관측 천문정보는 AETHERUS에서 이어집니다.',
    hintEn: 'Check sky condition, rain chance, and humidity. Astronomy continues in AETHERUS.',
  },
});

const $ = id => document.getElementById(id);
const finitePoint = point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon));

/* 활동 판단은 사람이 방문하려고 고른 일반 장소에만 붙인다.
   ⚠️ 좌표가 있다고 전부 장소가 아니다. 부이·관측소·위성·태풍 같은 관측/현상
      엔티티에 야구·캠핑·등산을 붙이면 장비를 여행지로 오인하게 만든다.
   현재 일반 장소 선택의 정본은 빈 지구를 누를 때 만드는 lazy `stations` 항목이다. */
function isActivityPlace(selected) {
  return finitePoint(selected)
    && selected.kind === 'stations'
    && selected.data?._lazy === true;
}

function safetyTone(gate) {
  if (gate?.gate === 'OFFICIAL_WARNING_ACTIVE') return gate.status === 'DANGER' ? 'danger' : 'warning';
  return gate?.reason === 'KMA_OUT_OF_COVERAGE' ? 'outside' : 'unknown';
}

function weatherIcon(code, isDay = 1) {
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(Number(code))) return '🌧';
  if ([71, 73, 75].includes(Number(code))) return '🌨';
  if ([95, 96, 99].includes(Number(code))) return '⛈';
  if ([45, 48].includes(Number(code))) return '🌫';
  if (Number(code) === 3) return '☁️';
  if (Number(code) === 2) return '⛅';
  return Number(isDay) === 0 ? '🌙' : '☀️';
}

function kmaWeatherIcon(sky, pty) {
  if ([1, 4, 5].includes(Number(pty))) return '🌧';
  if ([2, 3, 6, 7].includes(Number(pty))) return '🌨';
  if (Number(sky) === 4) return '☁️';
  if (Number(sky) === 3) return '⛅';
  return '☀️';
}

function kmaStamp(raw, ko) {
  const s = String(raw || '');
  if (!/^\d{12}/.test(s)) return '';
  return ko ? `${s.slice(4, 6)}/${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)} 발표`
    : `issued ${s.slice(4, 6)}/${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)} KST`;
}

function maxRain(hours = [], key = 'precipitation_probability') {
  const values = hours.slice(0, 12).map(row => Number(row?.[key])).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function normalizedConditions(conditions, ko) {
  if (!conditions?.weather) return null;
  const global = conditions.weather;
  const current = global.current || {};
  const kma = conditions.kma;
  if (kma?.now) {
    const now = kma.now;
    const rainNow = Number(now.pop);
    const rainNext = maxRain(kma.hours, 'pop');
    const temperature = Number(now.t);
    const humidity = Number(now.reh);
    const wind = Number(now.ws);
    const condition = condText(now.sky, now.pty, ko);
    const station = [kma.name, Number.isFinite(kma.km) ? `${ko ? '약 ' : '~'}${kma.km}km` : null]
      .filter(Boolean).join(' · ');
    const source = [ko ? '기상청 5km 동네예보' : 'KMA 5 km forecast', station,
      kmaStamp(kma.baseKst, ko)].filter(Boolean).join(' · ');
    return {
      icon: kmaWeatherIcon(now.sky, now.pty), condition,
      temperature: Number.isFinite(temperature) ? i18n.temp(temperature, 1) : '—',
      rain: Number.isFinite(rainNow) ? `${Math.round(rainNow)}%` : '—',
      nextRain: Number.isFinite(rainNext) ? `${Math.round(rainNext)}%` : '—',
      wind: Number.isFinite(wind) ? `${wind.toFixed(1)} m/s` : '—',
      humidity: Number.isFinite(humidity) ? `${Math.round(humidity)}%` : '—',
      feels: Number.isFinite(Number(current.apparent_temperature))
        ? i18n.temp(Number(current.apparent_temperature), 1) : (Number.isFinite(temperature) ? i18n.temp(temperature, 1) : '—'),
      source,
      signals: {
        rain: { label: ko ? '현재 강수확률' : 'Rain chance now', value: Number.isFinite(rainNow) ? `${Math.round(rainNow)}%` : '—' },
        nextRain: { label: ko ? '12시간 최고 강수확률' : 'Max rain chance · 12 h', value: Number.isFinite(rainNext) ? `${Math.round(rainNext)}%` : '—' },
        wind: { label: ko ? '바람' : 'Wind', value: Number.isFinite(wind) ? `${wind.toFixed(1)} m/s` : '—' },
        humidity: { label: ko ? '습도' : 'Humidity', value: Number.isFinite(humidity) ? `${Math.round(humidity)}%` : '—' },
        feels: { label: ko ? '체감온도' : 'Feels like', value: Number.isFinite(Number(current.apparent_temperature)) ? i18n.temp(Number(current.apparent_temperature), 1) : '—' },
        temp: { label: ko ? '기온' : 'Temperature', value: Number.isFinite(temperature) ? i18n.temp(temperature, 1) : '—' },
        sky: { label: ko ? '하늘 상태' : 'Sky', value: condition },
      },
    };
  }

  const rainNow = Number(global.hourly?.precipitation_probability?.[0]);
  const rainNext = (global.hourly?.precipitation_probability || []).slice(0, 12)
    .map(Number).filter(Number.isFinite);
  const temperature = Number(current.temperature_2m);
  const feels = Number(current.apparent_temperature);
  const humidity = Number(current.relative_humidity_2m);
  const wind = Number(current.wind_speed_10m);
  const condition = wxText(current.weather_code);
  const sourceTime = current.time ? `${current.time}${global.timezone_abbreviation ? ` ${global.timezone_abbreviation}` : ''}` : '';
  return {
    icon: weatherIcon(current.weather_code, current.is_day), condition,
    temperature: Number.isFinite(temperature) ? i18n.temp(temperature, 1) : '—',
    rain: Number.isFinite(rainNow) ? `${Math.round(rainNow)}%` : '—',
    nextRain: rainNext.length ? `${Math.round(Math.max(...rainNext))}%` : '—',
    wind: Number.isFinite(wind) ? `${wind.toFixed(1)} km/h` : '—',
    humidity: Number.isFinite(humidity) ? `${Math.round(humidity)}%` : '—',
    feels: Number.isFinite(feels) ? i18n.temp(feels, 1) : '—',
    source: [ko ? 'Open-Meteo 전지구 수치예보' : 'Open-Meteo global NWP', sourceTime].filter(Boolean).join(' · '),
    signals: {
      rain: { label: ko ? '현재 강수확률' : 'Rain chance now', value: Number.isFinite(rainNow) ? `${Math.round(rainNow)}%` : '—' },
      nextRain: { label: ko ? '12시간 최고 강수확률' : 'Max rain chance · 12 h', value: rainNext.length ? `${Math.round(Math.max(...rainNext))}%` : '—' },
      wind: { label: ko ? '바람' : 'Wind', value: Number.isFinite(wind) ? `${wind.toFixed(1)} km/h` : '—' },
      humidity: { label: ko ? '습도' : 'Humidity', value: Number.isFinite(humidity) ? `${Math.round(humidity)}%` : '—' },
      feels: { label: ko ? '체감온도' : 'Feels like', value: Number.isFinite(feels) ? i18n.temp(feels, 1) : '—' },
      temp: { label: ko ? '기온' : 'Temperature', value: Number.isFinite(temperature) ? i18n.temp(temperature, 1) : '—' },
      sky: { label: ko ? '하늘 상태' : 'Sky', value: condition },
    },
  };
}

export const decisionRail = {
  root: null,
  panel: null,
  point: null,
  activity: 'WALK_RUN',
  safety: null,
  place: null,
  conditions: null,
  marker: null,
  requestId: 0,
  placeRequestId: 0,
  conditionsRequestId: 0,

  init() {
    this.root = $('decisionRail');
    this.panel = $('decisionRailPanel');
    if (!this.root || !this.panel) return this;

    this.root.querySelectorAll('[data-activity]').forEach(button => {
      button.addEventListener('click', () => this.selectActivity(button.dataset.activity));
    });
    $('decisionRailAsk')?.addEventListener('click', async () => {
      if (!this.point) return;
      const ko = i18n.lang === 'ko';
      const activity = ACTIVITIES[this.activity];
      /* v1 정리: 물어보기 모듈(ask/* 약 50 KB)은 누를 때만 받는다. */
      const { askPanel } = await import('./ask/panel.js');
      if (!askPanel._inited) { askPanel._inited = true; askPanel.init(); }
      askPanel.openContext({
        label: this.place?.detail || this.place?.country || latLonText(this.point.lat, this.point.lon, ko),
        coordinates: latLonText(this.point.lat, this.point.lon, ko),
        activity: activity ? activity[ko ? 'ko' : 'en'] : null,
      });
    });

    document.addEventListener('earthus:decision-point', event => this.selectPoint(event.detail));
    document.addEventListener('earthus:place-conditions', event => this.setConditions(event.detail));
    /* 시트는 검색·지도·레이어 등 여러 길에서 열린다. 지도 이벤트만 믿으면
       프로그래밍으로 다른 항목을 연 뒤 이전 장소 판단이 아래에 남는다.
       선택 정본(store)에 좌표가 없으면 숨기고, 좌표가 있으면 같은 통합 시트에 맞춘다. */
    store.on('select', selected => {
      if (!isActivityPlace(selected)) {
        /* 지도 pick 이벤트가 store.select보다 먼저 온다. 부이를 누른 순간 잠깐 시작된
           특보 조회도 여기서 무효화해야, 늦게 끝난 응답이 활동 UI를 다시 열지 않는다. */
        this.clearContext();
        return;
      }
      const lat = Number(selected.lat), lon = Number(selected.lon);
      if (this.point?.lat === lat && this.point?.lon === lon) {
        this.show();
        return;
      }
      this.selectPoint({ point: { lat, lon } });
    });
    document.addEventListener('earthus:warn', () => {
      if (this.point) this.loadSafety(this.point, { refresh: false });
    });
    i18n.onChange(() => {
      this.place = null;
      if (this.point) this.loadPlace(this.point);
      this.render();
    });
    this.hide();
    this.root.dataset.ready = 'true';
    return this;
  },

  show() {
    this.root.hidden = false;
    this.panel.hidden = false;
  },

  hide() {
    if (!this.root || !this.panel) return;
    this.root.hidden = true;
    this.panel.hidden = true;
  },

  clearContext() {
    this.requestId += 1;
    this.placeRequestId += 1;
    this.conditionsRequestId += 1;
    this.point = null;
    this.activity = 'WALK_RUN';
    this.safety = null;
    this.place = null;
    this.conditions = null;
    if (this.root) {
      this.root.dataset.state = 'empty';
      this.root.dataset.safety = 'idle';
    }
    if (this.marker && viewer?.entities) {
      viewer.entities.remove(this.marker);
      this.marker = null;
      scene.requestRender();
    }
    this.hide();
  },

  selectPoint(detail = {}) {
    const point = detail?.point || detail;
    if (!finitePoint(point)) return;
    this.point = { lat: Number(point.lat), lon: Number(point.lon) };
    this.activity = 'WALK_RUN';
    this.safety = null;
    this.place = null;
    this.conditions = null;
    /* 이전 지점의 늦은 KMA 응답이 새 지점에 붙지 않게 즉시 무효화한다. */
    this.conditionsRequestId += 1;
    this.root.dataset.state = 'selected';
    this.root.dataset.safety = 'loading';
    this.show();
    this.drawMarker('unknown');
    this.render();
    this.loadPlace(this.point);
    this.loadSafety(this.point);
  },

  async loadPlace(point) {
    const id = ++this.placeRequestId;
    const place = await lookupPlace(point.lat, point.lon).catch(() => null);
    if (id !== this.placeRequestId || !this.point
        || this.point.lat !== point.lat || this.point.lon !== point.lon) return;
    this.place = place;
    this.render();
  },

  async setConditions(detail = {}) {
    const point = detail.point || detail;
    if (!finitePoint(point) || !this.point
        || this.point.lat !== Number(point.lat) || this.point.lon !== Number(point.lon)) return;
    const id = ++this.conditionsRequestId;
    this.conditions = {
      weather: detail.weather || null,
      sea: detail.sea || null,
      kma: null,
      error: detail.error || null,
    };
    if (detail.place) this.place = detail.place;
    this.render();
    if (detail.place?.countryCode !== 'KR' || !detail.weather) return;
    const kma = await kmaFcst.at(point.lat, point.lon).catch(() => null);
    if (id !== this.conditionsRequestId || !this.point
        || this.point.lat !== Number(point.lat) || this.point.lon !== Number(point.lon)) return;
    this.conditions = { ...this.conditions, kma };
    this.render();
  },

  selectActivity(id) {
    if (!ACTIVITIES[id]) return;
    if (id === 'WATER' && !this.conditions?.sea) return;
    this.activity = id;
    this.render();
  },

  async loadSafety(point, { refresh = true } = {}) {
    const id = ++this.requestId;
    if (refresh) {
      this.safety = null;
      this.root.dataset.safety = 'loading';
      this.renderSafety();
    }
    let gate;
    try {
      gate = await warn.safetyAt(point);
    } catch (_) {
      gate = null;
    }
    if (id !== this.requestId || !this.point
        || this.point.lat !== point.lat || this.point.lon !== point.lon) return;
    this.safety = gate;
    const tone = safetyTone(gate);
    this.root.dataset.safety = tone;
    this.drawMarker(tone);
    this.render();
  },

  drawMarker(tone = 'unknown') {
    if (!this.point || !globalThis.Cesium || !viewer?.entities) return;
    const palette = {
      danger: ['#ff6960', 0.32], warning: ['#ffb56f', 0.28],
      outside: ['#b8c7ce', 0.22], unknown: ['#a6e8f5', 0.26],
    };
    const [hex, alpha] = palette[tone] || palette.unknown;
    const color = Cesium.Color.fromCssColorString(hex);
    if (!this.marker) {
      this.marker = viewer.entities.add({
        id: 'earthus-decision-context-point',
        position: Cesium.Cartesian3.fromDegrees(this.point.lon, this.point.lat, 1200),
        point: {
          pixelSize: 15,
          color: color.withAlpha(alpha),
          outlineColor: color,
          outlineWidth: 2.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      this.marker.position = Cesium.Cartesian3.fromDegrees(this.point.lon, this.point.lat, 1200);
      this.marker.point.color = color.withAlpha(alpha);
      this.marker.point.outlineColor = color;
    }
    scene.requestRender();
  },

  renderSafety() {
    const host = $('decisionRailSafety');
    if (!host) return;
    const ko = i18n.lang === 'ko';
    if (!this.safety) {
      host.innerHTML = `<div class="dr-skeleton" role="status">${ko
        ? '공식 특보 근거를 확인하는 중입니다.'
        : 'Checking official warning evidence.'}</div>`;
      return;
    }
    host.innerHTML = safetyGateMarkup(this.safety, i18n.lang, {
      countryCode: this.place?.countryCode || null,
    });
  },

  renderConditions() {
    const ko = i18n.lang === 'ko';
    const current = normalizedConditions(this.conditions, ko);
    const put = (id, value) => { const node = $(id); if (node) node.textContent = value; };
    put('decisionRailWeatherTitle', ko ? '현재 날씨' : 'Current weather');
    put('decisionRailRainLabel', ko ? '현재 강수확률' : 'Rain chance now');
    put('decisionRailNextRainLabel', ko ? '12시간 최고' : 'Max · 12 h');
    put('decisionRailWindLabel', ko ? '바람' : 'Wind');
    put('decisionRailHumidityLabel', ko ? '습도' : 'Humidity');
    if (!current) {
      put('decisionRailWeatherIcon', '·');
      put('decisionRailWeatherTemp', ko ? '확인 중' : 'Checking');
      put('decisionRailWeatherState', this.conditions?.error
        ? (ko ? '이 지점의 날씨 자료를 받지 못했습니다' : 'Weather data unavailable for this point')
        : (ko ? '지점 자료를 불러오고 있습니다' : 'Loading point data'));
      ['decisionRailRain', 'decisionRailNextRain', 'decisionRailWind', 'decisionRailHumidity']
        .forEach(id => put(id, '—'));
      put('decisionRailWeatherMeta', ko ? '출처와 발표 시각 확인 중' : 'Checking source and issue time');
    } else {
      put('decisionRailWeatherIcon', current.icon);
      put('decisionRailWeatherTemp', current.temperature);
      put('decisionRailWeatherState', current.condition);
      put('decisionRailRain', current.rain);
      put('decisionRailNextRain', current.nextRain);
      put('decisionRailWind', current.wind);
      put('decisionRailHumidity', current.humidity);
      put('decisionRailWeatherMeta', current.source);
      if (this.conditions?.sea && Number.isFinite(Number(this.conditions.sea.wave_height))) {
        current.signals.wave = {
          label: ko ? '파고' : 'Wave height', value: `${Number(this.conditions.sea.wave_height).toFixed(2)} m`,
        };
      }
    }

    const waterAvailable = !!this.conditions?.sea;
    const waterButton = this.root.querySelector('[data-activity="WATER"]');
    if (waterButton) waterButton.hidden = !waterAvailable;
    if (this.activity === 'WATER' && !waterAvailable) this.activity = 'WALK_RUN';
    const activity = ACTIVITIES[this.activity] || ACTIVITIES.WALK_RUN;
    this.root.querySelectorAll('[data-activity]').forEach(button => {
      const item = ACTIVITIES[button.dataset.activity];
      button.setAttribute('aria-pressed', String(button.dataset.activity === this.activity));
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.icon;
      const label = document.createElement('b');
      label.textContent = item[ko ? 'ko' : 'en'];
      button.replaceChildren(icon, label);
    });

    put('decisionRailActivityIcon', activity.icon);
    put('decisionRailActivityTitle', activity[ko ? 'ko' : 'en']);
    put('decisionRailActivityHint', activity[ko ? 'hintKo' : 'hintEn']);
    const signals = $('decisionRailActivitySignals');
    if (signals) {
      signals.replaceChildren();
      const items = current
        ? activity.metrics.map(key => current.signals[key]).filter(Boolean)
        : [];
      if (!items.length) {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = ko ? '현재값' : 'Current values';
        dd.textContent = ko ? '날씨 자료를 불러오는 중입니다' : 'Loading weather data';
        row.append(dt, dd); signals.appendChild(row);
      } else items.forEach(item => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = item.label; dd.textContent = item.value;
        row.append(dt, dd); signals.appendChild(row);
      });
    }
    const alert = $('decisionRailActivityAlert');
    if (alert) {
      const active = this.safety?.gate === 'OFFICIAL_WARNING_ACTIVE';
      alert.hidden = !active;
      if (active) alert.textContent = ko
        ? '이 지역에 공식 특보가 발효 중입니다. 활동별 날씨값보다 특보 내용을 먼저 확인하세요.'
        : 'An official warning is in effect here. Read it before using the activity weather values.';
    }
  },

  render() {
    if (!this.root) return;
    const ko = i18n.lang === 'ko';
    const context = $('decisionRailContext');
    const place = this.place;

    $('decisionRailTitle').textContent = ko ? '밖에서 무엇을 할까요?' : 'What are you doing outside?';
    this.root.setAttribute('aria-label', ko ? '이 장소의 날씨와 활동 정보' : 'Weather and activity information here');

    if (!this.point) {
      this.hide();
      return;
    }

    this.show();
    context.hidden = false;
    $('decisionRailPlace').textContent = place?.detail || place?.country
      || latLonText(this.point.lat, this.point.lon, ko);
    const reference = place?.reference?.[ko ? 'ko' : 'en'] || (place?.country
      ? (ko ? 'Natural Earth 국가 경계 참조' : 'Natural Earth country reference')
      : (ko ? '좌표 기준 · 국가 미확인' : 'coordinates · country unverified'));
    $('decisionRailCoords').textContent = `${latLonText(this.point.lat, this.point.lon, ko)} · ${reference}`;
    this.root.querySelector('.dr-kicker').textContent = ko ? '지금 이곳에서' : 'Here, right now';
    this.root.querySelector('.dr-lead').textContent = ko
      ? '현재 날씨와 공식 특보를 먼저 보고, 활동에 필요한 값만 골라 확인합니다.'
      : 'Start with current weather and official warnings, then see only the values your activity needs.';
    this.root.querySelector('.dr-activity legend').textContent = ko ? '하려는 활동을 고르세요' : 'Choose your activity';
    this.root.querySelector('.dr-activity > p').textContent = ko
      ? '선택하면 지금 확인해야 할 날씨값만 추려서 보여드립니다.'
      : 'We will show only the weather values to check now.';
    $('decisionRailAsk').textContent = ko ? '이 지점 자료로 질문하기' : 'Ask about this point';
    this.renderConditions();
    this.renderSafety();
  },
};
