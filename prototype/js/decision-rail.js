// EARTHUS AX-01 — 선택한 장소 맥락에서 시작하는 판단 레일.
//
// ⚠️ 이 모듈은 Decision Core를 실행하지 않는다.
//    현재 공개할 수 있는 것은 한국 기상청 공식 특보 Hard Gate와 자료 준비 상태다.
//    활동 점수·혼잡·재고·폐쇄·“가도 된다”를 생성하지 말 것.
//
// ⚠️ 표시 지점 마커는 선택 좌표뿐이다. 특보 polygon이 아니며 위험 영역을 추정하지 않는다.

import { i18n } from './i18n.js';
import { describePlace, latLonText } from './geoname.js';
import { warn } from './warn.js';
import { safetyGateMarkup } from './safety-gate-ui.js';
import { askPanel } from './ask/panel.js';
import { viewer, scene } from './viewer.js';
import { store } from './store.js';

const ACTIVITIES = Object.freeze({
  BASEBALL_SPECTATOR: { ko: '야구 관람', en: 'Baseball spectator', icon: '⚾' },
  CAMPING: { ko: '캠핑', en: 'Camping', icon: '⌂' },
  FUTSAL_OUTDOOR: { ko: '야외 풋살', en: 'Outdoor futsal', icon: '○' },
  HIKING: { ko: '등산', en: 'Hiking', icon: '△' },
  STARGAZING: { ko: '별보기', en: 'Stargazing', icon: '✦' },
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

function safetyLabel(gate, ko) {
  if (!gate) return ko ? '확인 중' : 'Checking';
  if (gate.gate === 'OFFICIAL_WARNING_ACTIVE') {
    return gate.status === 'DANGER'
      ? (ko ? '공식 경보 · 추천 제한' : 'Official warning · restricted')
      : (ko ? '공식 주의보 · 추천 제한' : 'Official advisory · restricted');
  }
  if (gate.reason === 'KMA_OUT_OF_COVERAGE') return ko ? '현지 공식 특보 연결 전' : 'Local official warnings not connected';
  return ko ? '판단 보류 · 근거 확인 필요' : 'Held · evidence needed';
}

export const decisionRail = {
  root: null,
  panel: null,
  point: null,
  activity: null,
  safety: null,
  marker: null,
  requestId: 0,

  init() {
    this.root = $('decisionRail');
    this.panel = $('decisionRailPanel');
    if (!this.root || !this.panel) return this;

    this.root.querySelectorAll('[data-activity]').forEach(button => {
      button.addEventListener('click', () => this.selectActivity(button.dataset.activity));
    });
    $('decisionRailAsk')?.addEventListener('click', () => {
      if (!this.point) return;
      const ko = i18n.lang === 'ko';
      const activity = ACTIVITIES[this.activity];
      askPanel.openContext({
        label: describePlace(this.point.lat, this.point.lon, ko).text,
        coordinates: latLonText(this.point.lat, this.point.lon, ko),
        activity: activity ? activity[ko ? 'ko' : 'en'] : null,
      });
    });

    document.addEventListener('earthus:decision-point', event => this.selectPoint(event.detail));
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
    i18n.onChange(() => this.render());
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
    this.point = null;
    this.activity = null;
    this.safety = null;
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
    this.activity = null;
    this.safety = null;
    this.root.dataset.state = 'selected';
    this.root.dataset.safety = 'loading';
    this.show();
    this.drawMarker('unknown');
    this.render();
    this.loadSafety(this.point);
  },

  selectActivity(id) {
    if (!ACTIVITIES[id]) return;
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
    host.innerHTML = safetyGateMarkup(this.safety, i18n.lang);
  },

  render() {
    if (!this.root) return;
    const ko = i18n.lang === 'ko';
    const context = $('decisionRailContext');
    const activity = ACTIVITIES[this.activity];
    const place = this.point ? describePlace(this.point.lat, this.point.lon, ko) : null;

    $('decisionRailTitle').textContent = ko ? '이 장소의 활동 조건' : 'Activity conditions here';
    this.root.setAttribute('aria-label', ko ? '이 장소의 활동 조건' : 'Activity conditions here');

    if (!this.point) {
      this.hide();
      return;
    }

    this.show();
    context.hidden = false;
    $('decisionRailPlace').textContent = place.text;
    $('decisionRailCoords').textContent = `${latLonText(this.point.lat, this.point.lon, ko)} · ${ko ? '가까운 지명 기준' : 'nearest-place reference'}`;
    $('decisionRailNow').textContent = ko ? '현재 자료' : 'CURRENT DATA';
    this.root.querySelector('.dr-activity legend').textContent = ko ? '무엇을 하려고 하나요?' : 'What are you planning to do?';
    this.root.querySelectorAll('[data-activity]').forEach(button => {
      const item = ACTIVITIES[button.dataset.activity];
      button.textContent = `${item.icon} ${item[ko ? 'ko' : 'en']}`;
      button.setAttribute('aria-pressed', String(button.dataset.activity === this.activity));
    });
    $('decisionRailTimeNote').textContent = ko
      ? '현재 자료 기준입니다. 미래 시각은 현지 시간대와 예보 근거가 연결된 뒤 제공합니다.'
      : 'Current data only. Future times require verified local-time and forecast evidence.';
    $('decisionRailAxesTitle').textContent = ko ? '판단 근거 5축' : 'Five decision evidence axes';
    const axisLabels = this.root.querySelectorAll('.dr-axis span');
    const labels = ko
      ? ['1 · SAFETY', '2 · 활동 적합도', '3 · 예보 자료 신뢰도', '4 · 혼잡', '5 · 예약 가능성']
      : ['1 · SAFETY', '2 · ACTIVITY FIT', '3 · FORECAST DATA CONFIDENCE', '4 · CROWD', '5 · AVAILABILITY'];
    axisLabels.forEach((node, index) => { node.textContent = labels[index]; });
    $('decisionRailSafetyState').textContent = safetyLabel(this.safety, ko);
    $('decisionRailFitState').textContent = activity
      ? `${ko ? '공개 전 검증' : 'Pre-release validation'} · ${activity[ko ? 'ko' : 'en']}`
      : (ko ? '활동을 선택해주세요' : 'Choose an activity');
    const axisStrong = this.root.querySelectorAll('.dr-axis strong');
    if (axisStrong[2]) axisStrong[2].textContent = ko ? '자료 준비 중' : 'Data in preparation';
    if (axisStrong[3]) axisStrong[3].textContent = ko ? '혼잡 자료 없음' : 'No crowd data';
    if (axisStrong[4]) axisStrong[4].textContent = ko ? '예약 자료 없음' : 'No booking data';
    $('decisionRailAsk').textContent = ko ? '지구 자료에 더 물어보기' : 'Ask more about Earth data';
    $('decisionRailLimit').textContent = '';
    $('decisionRailLimit').hidden = true;
    this.renderSafety();
  },
};
