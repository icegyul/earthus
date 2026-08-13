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

const ACTIVITIES = Object.freeze({
  BASEBALL_SPECTATOR: { ko: '야구 관람', en: 'Baseball spectator', icon: '⚾' },
  CAMPING: { ko: '캠핑', en: 'Camping', icon: '⌂' },
  FUTSAL_OUTDOOR: { ko: '야외 풋살', en: 'Outdoor futsal', icon: '○' },
  HIKING: { ko: '등산', en: 'Hiking', icon: '△' },
  STARGAZING: { ko: '별보기', en: 'Stargazing', icon: '✦' },
});

const $ = id => document.getElementById(id);
const finitePoint = point => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon));

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

    $('decisionRailHandle')?.addEventListener('click', () => this.setOpen(!this.root.classList.contains('is-open')));
    $('decisionRailClose')?.addEventListener('click', () => this.setOpen(false));
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
    document.addEventListener('earthus:warn', () => {
      if (this.point) this.loadSafety(this.point, { refresh: false });
    });
    i18n.onChange(() => this.render());
    this.render();
    this.root.dataset.ready = 'true';
    return this;
  },

  setOpen(open) {
    const on = !!open;
    this.root.classList.toggle('is-open', on);
    document.body.classList.toggle('decision-rail-open', on);
    this.panel.hidden = !on;
    $('decisionRailHandle')?.setAttribute('aria-expanded', String(on));
    if (on) {
      document.dispatchEvent(new CustomEvent('earthus:close-menu'));
      $('decisionRailTitle')?.focus?.({ preventScroll: true });
    }
  },

  selectPoint(detail = {}) {
    const point = detail?.point || detail;
    if (!finitePoint(point)) return;
    this.point = { lat: Number(point.lat), lon: Number(point.lon) };
    this.activity = null;
    this.safety = null;
    this.root.dataset.state = 'selected';
    this.root.dataset.safety = 'loading';
    this.setOpen(true);
    this.panel.scrollTop = 0;
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
    const empty = $('decisionRailEmpty');
    const activity = ACTIVITIES[this.activity];
    const place = this.point ? describePlace(this.point.lat, this.point.lon, ko) : null;

    $('decisionRailTitle').textContent = ko ? '이 장소의 활동 조건' : 'Activity conditions here';
    $('decisionRailClose').setAttribute('aria-label', ko ? '활동 조건 접기' : 'Collapse activity conditions');
    this.root.setAttribute('aria-label', ko ? '이 장소의 활동 조건' : 'Activity conditions here');

    if (!this.point) {
      $('decisionRailHandleTitle').textContent = ko ? '장소를 눌러 조건 확인' : 'Tap a place to check conditions';
      $('decisionRailHandleNote').textContent = ko ? '공식 특보를 먼저 확인합니다' : 'Official warnings are checked first';
      empty.hidden = false;
      context.hidden = true;
      empty.querySelector('b').textContent = ko ? '지구본에서 궁금한 장소를 눌러보세요.' : 'Tap a place on the globe.';
      empty.querySelector('p').textContent = ko
        ? '선택한 지점의 공식 특보부터 확인하고, 없는 자료는 없다고 표시합니다.'
        : 'Earthus checks official warnings first and labels missing data instead of filling it in.';
      return;
    }

    empty.hidden = true;
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
    if (axisStrong[2]) axisStrong[2].textContent = ko ? '실데이터 연결 전' : 'Live data not connected';
    if (axisStrong[3]) axisStrong[3].textContent = ko ? '확인할 자료 없음' : 'No data to verify';
    if (axisStrong[4]) axisStrong[4].textContent = ko ? '확인할 자료 없음' : 'No data to verify';
    $('decisionRailAsk').textContent = ko ? '지구 자료에 더 물어보기' : 'Ask more about Earth data';
    $('decisionRailLimit').textContent = ko
      ? 'Activity Score는 곡선·실데이터 검증 전이라 아직 공개하지 않습니다.'
      : 'Activity Score remains hidden until profile curves and live data are approved.';
    $('decisionRailHandleTitle').textContent = activity
      ? `${place.text} · ${activity[ko ? 'ko' : 'en']}` : place.text;
    $('decisionRailHandleNote').textContent = safetyLabel(this.safety, ko);
    this.renderSafety();
  },
};
