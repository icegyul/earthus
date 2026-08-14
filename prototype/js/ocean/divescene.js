// EARTHUS 심해 탐사 조종 화면
//
// ⚠️ 배경과 H. gigas 이미지는 제품 전용 시각화이며 관측 사진이 아니다.
// ⚠️ 수심은 GEBCO 0.1도 셀 최심값 기반 정보 제품이다. 특정 좌표의 실측값이 아니다.
// ⚠️ 자동 조종은 사용자가 누른 동안에만 유한하게 움직이고 경계에서 멈춘다.
//    백그라운드 무한 애니메이션·무작위 배치는 쓰지 않는다.

import { i18n } from '../i18n.js';
import { oceanDepth } from './depth.js';
import { obisSummary } from './obis.js';

const STYLE_ID = 'earthusOceanDiveStyles';
const STYLE_URL = '/css/ocean-dive.css?v=20260815-cockpit3';
const DEFAULT_DEPTH_M = 6420;
const SPEEDS = [1, 2, 4];
const EVEREST = {
  depthM: 8848.86,
  sourceUrl: 'https://dmgnepal.gov.np/en/pages/general-geology-4128',
};

const HADAL_SPECIMEN = {
  id: 'hirondellea-gigas-literature',
  name: { ko: '초심해 단각류', en: 'Hadal amphipod' },
  sci: 'Hirondellea gigas',
  depthKind: 'literature-range',
  depthMin: 6800,
  depthMax: 11000,
  thumb: '/img/ocean-hadal-amphipod-illustration.jpg',
  illustration: true,
  credit: 'Earthus 시각화 · 관측 사진 아님',
  license: 'Earthus project asset',
  depthSource: 'H. gigas genome study · Mariana Trench specimens',
  depthSourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/40054448/',
  photoSourceUrl: '',
  note: {
    ko: '마리아나 해구 개체군 연구가 보고한 약 6,800–11,000m 서식 범위를 시각화했습니다. 현재 좌표의 개체 관측을 뜻하지 않습니다.',
    en: 'Visualizes the approximately 6,800–11,000m range reported for a Mariana Trench population. It is not an observation at the current coordinate.',
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = value => Number(value).toLocaleString();
const absoluteUrl = path => path?.startsWith('/') ? path : `/${path || ''}`;
const isMariana = ({ lat, lon, name }) => /마리아나|챌린저|mariana|challenger/i.test(name || '')
  || (lat >= 5 && lat <= 25 && lon >= 135 && lon <= 150);

export const diveScene = {
  root: null,
  canvas: null,
  slider: null,
  data: null,
  comparisons: [],
  specimens: [HADAL_SPECIMEN],
  specimenIndex: 0,
  current: 0,
  startDepth: DEFAULT_DEPTH_M,
  speedIndex: 0,
  direction: 0,
  _raf: 0,
  _lastFrame: 0,
  _drag: null,
  location: null,

  async ensureStyles() {
    let link = document.getElementById(STYLE_ID);
    if (link?.sheet) return;
    if (!link) {
      link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = STYLE_URL;
      document.head.append(link);
    }
    await new Promise(resolve => {
      if (link.sheet) { resolve(); return; }
      const done = () => resolve();
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
    });
  },

  async init() {
    if (this.root) return this;
    await this.ensureStyles();
    this.root = document.getElementById('diveExperience');
    if (!this.root) return this;
    this.build();
    this.canvas = document.getElementById('diveCanvas');
    this.slider = document.getElementById('diveSlider');
    this.bind();
    obisSummary.init();
    i18n.onChange(() => {
      this.renderStaticText();
      this.renderSpecimen();
      this.renderComparisons();
      this.draw();
    });
    return this;
  },

  build() {
    this.root.className = 'dive-experience od-dive';
    this.root.innerHTML = `
      <div class="od-dive-bg" aria-hidden="true"></div>
      <div class="od-dive-shade" aria-hidden="true"></div>
      <div class="od-dive-grain" aria-hidden="true"></div>

      <header class="od-dive-header">
        <nav class="od-breadcrumb" aria-label="심해 탐사 경로">
          <button type="button" data-dive-home>EARTHUS</button><i>›</i><span data-dive-copy="earth">지구</span><i>›</i><span data-dive-copy="ocean">바다</span><i>›</i><span id="diveBreadcrumbName">마리아나 해구</span>
        </nav>
        <div class="od-dive-title">
          <p id="diveEnglishTitle">MARIANA TRENCH</p>
          <h2 id="diveTitle">마리아나 해구 · 챌린저 해연</h2>
        </div>
        <div class="od-dive-utils">
          <button type="button" data-dive-help aria-label="심해 화면 도움말">?</button>
          <button type="button" data-dive-evidence aria-label="출처와 관측 기록">☰</button>
          <button type="button" data-dive-home aria-label="지구로 돌아가기">×</button>
        </div>
      </header>

      <aside class="od-locator" aria-label="탐사 위치">
        <div class="od-locator-globe" aria-hidden="true"></div>
        <span id="diveLocationLabel" class="od-locator-label">마리아나 해구</span>
      </aside>

      <aside class="od-specimen" aria-labelledby="diveSpecimenName">
        <header class="od-specimen-head">
          <span data-dive-copy="literatureLife">문헌 생물</span>
          <div class="od-specimen-nav">
            <button type="button" data-specimen-prev aria-label="이전 생물">‹</button>
            <output id="diveSpecimenCount">1 / 1</output>
            <button type="button" data-specimen-next aria-label="다음 생물">›</button>
          </div>
        </header>
        <div class="od-specimen-media"><img id="diveSpecimenImage" src="/img/ocean-hadal-amphipod-illustration.jpg" alt="초심해 단각류 시각화"></div>
        <div class="od-specimen-copy">
          <h3 id="diveSpecimenName">초심해 단각류</h3>
          <em id="diveSpecimenSci">Hirondellea gigas</em>
          <p id="diveSpecimenDepth">문헌 깊이 6,800–11,000m</p>
          <small id="diveSpecimenStatus">현재 위치 실측 아님 · 시각화</small>
          <button type="button" class="od-specimen-evidence" data-dive-evidence><span data-dive-copy="literatureRecord">문헌 관측 기록</span></button>
        </div>
      </aside>

      <aside class="od-depth-rail" aria-label="0에서 11,000미터까지의 수심계">
        <canvas id="diveCanvas" aria-label="수면에서 해저까지 수심 구간과 현재 가상 수심"></canvas>
        <label class="od-sr-only" for="diveSlider">현재 가상 수심</label>
        <input id="diveSlider" type="range" min="0" max="11000" value="6420" step="1" aria-label="현재 가상 수심">
        <output id="diveReadout" for="diveSlider" aria-live="polite">6,420m</output>
      </aside>

      <aside class="od-telemetry" aria-label="현재 가상 수심 정보">
        <div class="od-telemetry-head"><span data-dive-copy="virtualDepth">현재 가상 수심</span><strong id="diveDepthValue">6,420m</strong></div>
        <dl>
          <dt data-dive-copy="temperature">수온</dt><dd id="diveTemperature">자료 없음</dd>
          <dt data-dive-copy="pressure">압력</dt><dd id="divePressure">약 643기압</dd>
          <dt data-dive-copy="seafloorRemaining">해저까지</dt><dd id="diveRemaining">4,406m</dd>
        </dl>
        <button type="button" class="od-telemetry-source" data-dive-evidence><span id="diveSource">GEBCO 2026 · 자료 읽는 중…</span></button>
      </aside>

      <div class="od-controls-wrap" aria-label="가상 잠수 조종">
        <div class="od-controls">
          <button type="button" data-dive-control="down"><span>↓</span><b data-dive-copy="descend">하강</b></button>
          <button type="button" data-dive-control="pause" class="is-active" aria-pressed="true"><span>Ⅱ</span><b data-dive-copy="pause">일시정지</b></button>
          <button type="button" data-dive-control="up"><span>↑</span><b data-dive-copy="ascend">상승</b></button>
          <button type="button" data-dive-control="speed"><span id="diveSpeed">1×</span><b data-dive-copy="speed">속도</b></button>
          <button type="button" data-dive-control="reset"><span>↺</span><b data-dive-copy="reset">초기화</b></button>
        </div>
        <p id="diveMotionStatus" class="od-motion-status">가상 수심 정지 · 장면은 탐사 연출</p>
      </div>

      <aside id="diveEvidenceDrawer" class="od-dive-drawer" aria-labelledby="diveEvidenceTitle" hidden>
        <header class="od-drawer-head"><h3 id="diveEvidenceTitle">출처와 관측 기록</h3><button type="button" data-dive-drawer-close aria-label="닫기">×</button></header>
        <p class="od-scene-disclosure">중앙 심해 장면과 단각류 이미지는 이해를 돕는 시각화이며 실제 촬영·현재 위치 관측이 아닙니다. 수심·생물 기록은 아래 출처와 별도로 표시합니다.</p>
        <div id="diveSpecimenSource" class="od-specimen-source"></div>
        <aside id="obisSummary" class="obis-summary" aria-live="polite" aria-labelledby="obisTitle"></aside>
        <div id="diveComparisons" class="dive-comparisons"></div>
        <p id="diveLimit" class="dive-limit"></p>
      </aside>

      <aside id="diveHelpDrawer" class="od-dive-drawer" aria-labelledby="diveHelpTitle" hidden>
        <header class="od-drawer-head"><h3 id="diveHelpTitle">심해 탐사 화면 사용법</h3><button type="button" data-dive-drawer-close aria-label="닫기">×</button></header>
        <p>오른쪽 수심계를 직접 드래그하거나, 아래 하강·상승 버튼을 눌러 가상 수심을 바꿉니다. 배경 장면을 위아래로 드래그하거나 마우스 휠을 사용해도 됩니다.</p>
        <p>압력은 수심 10m당 약 1기압으로 단순 환산한 교육용 근사값입니다. 수온은 관측 프로파일이 연결되지 않았으므로 값을 만들지 않고 ‘자료 없음’으로 표시합니다.</p>
        <p>GEBCO 격자 수심은 항해·해상 안전 또는 특정 지점의 실측 수심으로 사용하면 안 됩니다.</p>
      </aside>

      <div id="seaLifeLayer" hidden></div><aside id="seaLifeDetail" hidden></aside>
    `;
  },

  bind() {
    this.slider.addEventListener('input', () => this.setDepth(Number(this.slider.value)));
    const visual = this.root;
    visual.addEventListener('wheel', event => {
      if (!this.data || event.target.closest('button,a,input,.od-dive-drawer')) return;
      event.preventDefault();
      this.pause();
      this.setDepth(this.current + Math.sign(event.deltaY) * Math.max(20, this.data.depthM / 55));
    }, { passive: false });
    visual.addEventListener('pointerdown', event => {
      if (!this.data || event.target.closest('button,a,input,.od-dive-drawer,.od-depth-rail')) return;
      this.pause();
      this._drag = { y: event.clientY, depth: this.current, id: event.pointerId };
      visual.setPointerCapture?.(event.pointerId);
    });
    visual.addEventListener('pointermove', event => {
      if (!this._drag || !this.data) return;
      const height = Math.max(1, visual.clientHeight);
      this.setDepth(this._drag.depth + (event.clientY - this._drag.y) / height * this.data.depthM);
    });
    const endDrag = () => { this._drag = null; };
    visual.addEventListener('pointerup', endDrag);
    visual.addEventListener('pointercancel', endDrag);

    this.root.querySelectorAll('[data-dive-home]').forEach(button => button.addEventListener('click', () => {
      this.close();
      document.querySelector('.ocean-scene>[data-scene-home]')?.click();
    }));
    this.root.querySelector('[data-dive-help]').addEventListener('click', () => this.openDrawer('help'));
    this.root.querySelectorAll('[data-dive-evidence]').forEach(button => button.addEventListener('click', () => this.openDrawer('evidence')));
    this.root.querySelectorAll('[data-dive-drawer-close]').forEach(button => button.addEventListener('click', () => this.closeDrawers()));
    this.root.querySelector('[data-specimen-prev]').addEventListener('click', () => this.shiftSpecimen(-1));
    this.root.querySelector('[data-specimen-next]').addEventListener('click', () => this.shiftSpecimen(1));
    this.root.querySelectorAll('[data-dive-control]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.diveControl;
      if (action === 'down') this.move(1);
      if (action === 'up') this.move(-1);
      if (action === 'pause') this.pause();
      if (action === 'speed') this.cycleSpeed();
      if (action === 'reset') { this.pause(); this.setDepth(0); }
    }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    document.addEventListener('keydown', event => {
      if (!document.body.classList.contains('earthus-dive-open')) return;
      if (event.key === 'Escape') this.closeDrawers();
      if (event.key === 'ArrowDown') { event.preventDefault(); this.pause(); this.setDepth(this.current + 100); }
      if (event.key === 'ArrowUp') { event.preventDefault(); this.pause(); this.setDepth(this.current - 100); }
      if (event.key === ' ') { event.preventDefault(); this.pause(); }
    });
    new ResizeObserver(() => this.draw()).observe(this.root.querySelector('.od-depth-rail'));
  },

  async open({ lat, lon, name }) {
    await this.init();
    if (!this.root) throw new Error('DIVE_ROOT_MISSING');
    this.pause();
    this.closeDrawers();
    this.location = { lat: Number(lat), lon: Number(lon), name: name || '' };
    document.getElementById('oceanSceneIntro').hidden = true;
    this.root.hidden = false;
    document.body.classList.add('earthus-dive-open');
    this.data = null;
    this.current = 0;
    this.comparisons = [];
    this.specimens = isMariana(this.location) ? [HADAL_SPECIMEN] : [];
    this.specimenIndex = 0;
    document.getElementById('diveSource').textContent = i18n.lang === 'ko'
      ? 'GEBCO 2026 · 자료 읽는 중…' : 'GEBCO 2026 · loading data…';
    this.renderStaticText();
    this.renderSpecimen();
    this.draw();
    void obisSummary.show(lat, lon);

    try {
      const [data, comparisons, lifeDocument] = await Promise.all([
        oceanDepth.query(lat, lon),
        fetch('/data/ocean-comparisons.json', { cache: 'no-cache' }).then(response => {
          if (!response.ok) throw new Error(`OCEAN_COMPARISONS_${response.status}`);
          return response.json();
        }),
        fetch('/data/sea-life.json', { cache: 'no-cache' }).then(response => {
          if (!response.ok) throw new Error(`SEA_LIFE_${response.status}`);
          return response.json();
        }),
      ]);
      if (!data.isOcean) throw new Error('LAND_CELL');
      this.data = data;
      this.comparisons = comparisons.items || [];
      const documentaryItems = (lifeDocument.items || [])
        .slice()
        .sort((left, right) => specimenDistance(left, DEFAULT_DEPTH_M) - specimenDistance(right, DEFAULT_DEPTH_M))
        .slice(0, this.specimens.length ? 7 : 8);
      this.specimens.push(...documentaryItems);
      this.slider.max = String(Math.max(1, data.depthM));
      this.startDepth = Math.min(DEFAULT_DEPTH_M, data.depthM);
      this.current = this.startDepth;
      this.slider.value = String(Math.round(this.current));
      this.renderStaticText();
      this.renderSpecimen();
      this.renderComparisons();
      this.draw();
    } catch (error) {
      document.getElementById('diveSource').textContent = error.message === 'LAND_CELL'
        ? (i18n.lang === 'ko' ? 'GEBCO · 이 격자 셀은 육지로 분류됨' : 'GEBCO · this grid cell is land')
        : (i18n.lang === 'ko' ? 'GEBCO · 수심 자료 연결 실패' : 'GEBCO · depth data unavailable');
      console.warn('[dive]', error.message);
    }
  },

  close() {
    this.pause();
    this.closeDrawers();
    document.body.classList.remove('earthus-dive-open');
  },

  renderStaticText() {
    const ko = i18n.lang === 'ko';
    const name = this.location?.name || (ko ? '이 지점의 심해' : 'Deep ocean at this location');
    const mariana = this.location && isMariana(this.location);
    document.getElementById('diveEnglishTitle').textContent = mariana ? 'MARIANA TRENCH' : 'DEEP OCEAN DIVE';
    document.getElementById('diveTitle').textContent = name;
    document.getElementById('diveBreadcrumbName').textContent = name.split(' · ')[0];
    document.getElementById('diveLocationLabel').textContent = name.split(' · ')[0];
    this.root.closest('[data-scene-view="ocean"]')?.setAttribute('aria-label', ko ? '심해 탐사 조종 화면' : 'Deep-ocean exploration console');
    const copy = ko ? {
      earth: '지구', ocean: '바다', literatureLife: '문헌 생물', literatureRecord: '문헌 관측 기록',
      virtualDepth: '현재 가상 수심', temperature: '수온', pressure: '압력', seafloorRemaining: '해저까지',
      descend: '하강', pause: '일시정지', ascend: '상승', speed: '속도', reset: '초기화',
    } : {
      earth: 'Earth', ocean: 'Ocean', literatureLife: 'Literature life', literatureRecord: 'Evidence record',
      virtualDepth: 'Virtual depth', temperature: 'Temperature', pressure: 'Pressure', seafloorRemaining: 'To seafloor',
      descend: 'Descend', pause: 'Pause', ascend: 'Ascend', speed: 'Speed', reset: 'Reset',
    };
    this.root.querySelectorAll('[data-dive-copy]').forEach(node => { node.textContent = copy[node.dataset.diveCopy] || node.textContent; });
    if (!this.data) return;
    const source = this.data.source;
    document.getElementById('diveSource').textContent = ko
      ? `GEBCO 2026 · 해저 ${number(this.data.depthM)}m · 격자 ${source.gridBuilt.slice(0, 10)}`
      : `GEBCO 2026 · seafloor ${number(this.data.depthM)}m · grid ${source.gridBuilt.slice(0, 10)}`;
    document.getElementById('diveLimit').textContent = ko
      ? `수심 자료 · ${source.title} · 자료 ${source.created} · 약 11km 셀 안 최심 원본값. 이 좌표의 실측 수심이 아니며 항해·해상 안전에 사용하면 안 됩니다.`
      : `Depth data · ${source.title} · data ${source.created} · deepest source value in an ~11 km cell. Not a sounding at this coordinate and not for navigation or safety.`;
  },

  renderSpecimen() {
    const ko = i18n.lang === 'ko';
    const total = this.specimens.length;
    const item = total ? this.specimens[clamp(this.specimenIndex, 0, total - 1)] : null;
    const image = document.getElementById('diveSpecimenImage');
    const sourceRoot = document.getElementById('diveSpecimenSource');
    document.getElementById('diveSpecimenCount').textContent = `${total ? this.specimenIndex + 1 : 0} / ${total}`;
    sourceRoot.replaceChildren();
    if (!item) {
      image.removeAttribute('src'); image.alt = '';
      document.getElementById('diveSpecimenName').textContent = ko ? '연결된 문헌 생물 없음' : 'No literature species linked';
      document.getElementById('diveSpecimenSci').textContent = '';
      document.getElementById('diveSpecimenDepth').textContent = ko ? '자료 없음' : 'No data';
      document.getElementById('diveSpecimenStatus').textContent = ko ? '현재 위치의 생물로 추정하지 않습니다.' : 'No inference is made for this location.';
      return;
    }
    image.src = absoluteUrl(item.thumb);
    image.alt = `${item.name[ko ? 'ko' : 'en']}${item.illustration ? (ko ? ' 시각화' : ' visualization') : ''}`;
    document.getElementById('diveSpecimenName').textContent = item.name[ko ? 'ko' : 'en'];
    document.getElementById('diveSpecimenSci').textContent = item.sci || '';
    const range = item.depthKind === 'observation-depth'
      ? `${ko ? '기록된 관측 깊이' : 'Recorded depth'} ${number(item.depthMin)}m`
      : `${ko ? '문헌 깊이' : 'Literature depth'} ${number(item.depthMin)}–${number(item.depthMax)}m`;
    document.getElementById('diveSpecimenDepth').textContent = range;
    const overlap = this.current >= item.depthMin && this.current <= item.depthMax;
    document.getElementById('diveSpecimenStatus').textContent = item.illustration
      ? (ko ? `${overlap ? '현재 가상 수심과 문헌 범위 겹침' : '현재 가상 수심과 문헌 범위 다름'} · 관측 사진 아님` : `${overlap ? 'Virtual depth overlaps literature range' : 'Outside literature range'} · not an observation photo`)
      : (ko ? '문헌·관측 기록 사진 · 현재 위치 실측 아님' : 'Literature/observation image · not observed here');
    const note = document.createElement('p'); note.textContent = item.note?.[ko ? 'ko' : 'en'] || '';
    const depthLink = sourceLink(item.depthSourceUrl, `${item.depthSource || (ko ? '깊이 출처' : 'Depth source')} ↗`);
    sourceRoot.append(note);
    if (depthLink) sourceRoot.append(depthLink);
    if (item.photoSourceUrl && item.photoSourceUrl !== item.depthSourceUrl) {
      const photoLink = sourceLink(item.photoSourceUrl, `${item.credit || (ko ? '사진 출처' : 'Image source')} · ${item.license || ''} ↗`);
      if (photoLink) sourceRoot.append(photoLink);
    } else if (item.illustration) {
      const disclosure = document.createElement('p'); disclosure.textContent = ko
        ? '이미지 유형 · Earthus 생성 시각화 · 관측·표본 사진 아님'
        : 'Image type · Earthus generated visualization · not an observation/specimen photograph';
      sourceRoot.append(disclosure);
    }
  },

  renderComparisons() {
    const root = document.getElementById('diveComparisons');
    if (!root) return;
    const ko = i18n.lang === 'ko';
    root.replaceChildren();
    const everest = sourceLink(EVEREST.sourceUrl, ko
      ? `에베레스트산 · 8,848.86m · 네팔 정부 지질 자료 ↗`
      : `Mount Everest · 8,848.86m · Government of Nepal geology source ↗`);
    if (everest) root.append(everest);
    this.comparisons.filter(item => !this.data || item.depthM <= this.data.depthM).forEach(item => {
      const link = sourceLink(item.sourceUrl,
        `${item.name[ko ? 'ko' : 'en']} · ${number(item.depthM)}m · ${item.source} ↗`);
      if (link) root.append(link);
    });
  },

  shiftSpecimen(delta) {
    if (!this.specimens.length) return;
    this.specimenIndex = (this.specimenIndex + delta + this.specimens.length) % this.specimens.length;
    this.renderSpecimen();
  },

  openDrawer(kind) {
    this.pause();
    this.closeDrawers();
    const drawer = document.getElementById(kind === 'help' ? 'diveHelpDrawer' : 'diveEvidenceDrawer');
    drawer.hidden = false;
    drawer.querySelector('button')?.focus();
  },

  closeDrawers() {
    this.root?.querySelectorAll('.od-dive-drawer').forEach(drawer => { drawer.hidden = true; });
  },

  setDepth(value) {
    if (!this.data) return;
    this.current = clamp(Number(value) || 0, 0, this.data.depthM);
    this.slider.value = String(Math.round(this.current));
    this.draw();
    this.renderSpecimen();
  },

  move(direction) {
    if (!this.data) return;
    this.pause();
    this.direction = direction;
    this._lastFrame = 0;
    this.renderControls();
    const tick = now => {
      if (!this.direction || document.hidden || !document.body.classList.contains('earthus-dive-open')) { this.pause(); return; }
      if (!this._lastFrame) this._lastFrame = now;
      const seconds = Math.min(.08, (now - this._lastFrame) / 1000);
      this._lastFrame = now;
      const next = this.current + this.direction * seconds * 280 * SPEEDS[this.speedIndex];
      this.setDepth(next);
      const ended = (this.direction > 0 && this.current >= this.data.depthM)
        || (this.direction < 0 && this.current <= 0);
      if (ended) { this.pause(); return; }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },

  pause() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._lastFrame = 0;
    this.direction = 0;
    this.renderControls();
  },

  cycleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    document.getElementById('diveSpeed').textContent = `${SPEEDS[this.speedIndex]}×`;
  },

  renderControls() {
    if (!this.root) return;
    const ko = i18n.lang === 'ko';
    this.root.querySelectorAll('[data-dive-control]').forEach(button => {
      const action = button.dataset.diveControl;
      const active = (action === 'down' && this.direction > 0)
        || (action === 'up' && this.direction < 0)
        || (action === 'pause' && this.direction === 0);
      button.classList.toggle('is-active', active);
      if (action === 'pause') button.setAttribute('aria-pressed', String(active));
    });
    const status = document.getElementById('diveMotionStatus');
    if (!status) return;
    status.textContent = this.direction > 0
      ? (ko ? `가상 하강 중 · ${SPEEDS[this.speedIndex]}×` : `Virtual descent · ${SPEEDS[this.speedIndex]}×`)
      : this.direction < 0
        ? (ko ? `가상 상승 중 · ${SPEEDS[this.speedIndex]}×` : `Virtual ascent · ${SPEEDS[this.speedIndex]}×`)
        : (ko ? '가상 수심 정지 · 장면은 탐사 연출' : 'Virtual depth paused · scene is illustrative');
  },

  draw() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = width / dpr, h = height / dpr;
    ctx.clearRect(0, 0, w, h);
    const ko = i18n.lang === 'ko';
    const scaleMax = Math.max(11000, this.data?.depthM || 11000);
    const top = 20, bottom = Math.max(top + 1, h - 20), x = Math.max(48, w * .37);
    const yFor = depth => {
      if (depth <= 200) return top + depth / 200 * Math.min(38, (bottom - top) * .12);
      const head = Math.min(38, (bottom - top) * .12);
      return top + head + (depth - 200) / Math.max(1, scaleMax - 200) * (bottom - top - head);
    };

    ctx.strokeStyle = 'rgba(74,189,239,.74)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.fillStyle = '#f3f8fa';
    ctx.beginPath(); ctx.moveTo(x - 6, top); ctx.lineTo(x + 6, top); ctx.lineTo(x, top + 7); ctx.closePath(); ctx.fill();

    for (let depth = 0; depth <= scaleMax; depth += 250) {
      const y = yFor(depth);
      const major = depth % 1000 === 0;
      ctx.strokeStyle = major ? 'rgba(87,195,240,.56)' : 'rgba(87,195,240,.35)';
      ctx.lineWidth = major ? 1.2 : .8;
      ctx.beginPath(); ctx.moveTo(x - (major ? 8 : 4), y); ctx.lineTo(x + (major ? 8 : 4), y); ctx.stroke();
    }
    const labels = [0, 200, 1000, 4000, 6000, 8000, 10000, 11000];
    ctx.font = `${Math.max(9, Math.min(12, w / 22))}px system-ui,sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(230,239,243,.68)';
    labels.filter(depth => depth <= scaleMax).forEach(depth => {
      let y = yFor(depth);
      if (depth === 0) y += 1;
      ctx.fillText(`${number(depth)}m`, x - 13, y);
    });
    ctx.textAlign = 'left'; ctx.fillStyle = '#27bfff';
    const zones = ko
      ? [[100, '표해수층'], [620, '중층원양대'], [2500, '점심해대'], [5000, '심해대'], [8500, '초심해대']]
      : [[100, 'Epipelagic'], [620, 'Mesopelagic'], [2500, 'Bathypelagic'], [5000, 'Abyssal'], [8500, 'Hadal']];
    zones.forEach(([depth, label]) => ctx.fillText(label, x + 14, yFor(depth)));

    const everestY = yFor(EVEREST.depthM);
    ctx.strokeStyle = 'rgba(142,211,240,.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    const mountainX = x + 18;
    ctx.moveTo(mountainX, everestY + 12); ctx.lineTo(mountainX + 12, everestY - 2); ctx.lineTo(mountainX + 20, everestY + 5); ctx.lineTo(mountainX + 28, everestY - 14); ctx.lineTo(mountainX + 43, everestY + 12); ctx.stroke();
    ctx.fillStyle = 'rgba(173,221,241,.72)'; ctx.font = `${Math.max(8, Math.min(10, w / 25))}px system-ui,sans-serif`;
    ctx.fillText(ko ? '에베레스트 8,849m' : 'Everest 8,849m', mountainX, everestY + 24);

    const currentY = yFor(this.current);
    const marker = ctx.createLinearGradient(0, 0, w, 0);
    marker.addColorStop(0, 'rgba(39,191,255,.05)'); marker.addColorStop(.55, '#27bfff'); marker.addColorStop(1, 'rgba(39,191,255,.08)');
    ctx.strokeStyle = marker; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, currentY); ctx.lineTo(w, currentY); ctx.stroke();
    ctx.fillStyle = '#e8fbff'; ctx.shadowColor = '#27bfff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(x, currentY, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

    const progress = this.data ? this.current / Math.max(1, this.data.depthM) : 0;
    this.root.style.setProperty('--od-depth', progress.toFixed(4));
    this.root.style.setProperty('--od-marker-y', `${currentY}px`);
    const currentRounded = Math.round(this.current);
    document.getElementById('diveReadout').textContent = `${number(currentRounded)}m`;
    document.getElementById('diveDepthValue').textContent = `${number(currentRounded)}m`;
    document.getElementById('divePressure').textContent = ko
      ? `약 ${number(Math.round(1 + this.current / 10))}기압`
      : `approx. ${number(Math.round(1 + this.current / 10))} atm`;
    document.getElementById('diveTemperature').textContent = ko ? '자료 없음' : 'No profile';
    document.getElementById('diveRemaining').textContent = this.data
      ? `${number(Math.max(0, Math.round(this.data.depthM - this.current)))}m`
      : '—';
  },
};

function specimenDistance(item, depth) {
  const min = Number(item.depthMin) || 0;
  const max = Number(item.depthMax) || min;
  if (depth >= min && depth <= max) return 0;
  return Math.min(Math.abs(depth - min), Math.abs(depth - max));
}

function sourceLink(url, label) {
  if (!url) return null;
  const link = document.createElement('a');
  link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = label;
  return link;
}
