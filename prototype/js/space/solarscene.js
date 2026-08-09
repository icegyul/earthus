// 8행성 태양계 2D 장면
//
// ⚠️ 기본은 정지 화면이다. 날짜 변경·리사이즈에만 그리고,
//    사용자가 ▶를 누른 동안만 rAF를 쓴다. 2050년 경계에서 반드시 멈춘다.
// ⚠️ 행성 색은 구분을 위한 시각 보조이며 실제 관측색이 아니다.

import { store } from '../store.js';
import { i18n } from '../i18n.js';
import { planetOrbit, planetPositions } from './kepler.js';

const DAY_MS = 86_400_000;
const MIN_DAY = Date.UTC(2000, 0, 1) / DAY_MS;
const MAX_DAY = Date.UTC(2050, 0, 1) / DAY_MS;
const IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
// 평균 반지름: https://ssd.jpl.nasa.gov/planets/phys_par.html
const META = {
  mercury: { ko: '수성', en: 'Mercury', color: '#a9a5a0', radiusKm: 2439.4 },
  venus: { ko: '금성', en: 'Venus', color: '#dfb96d', radiusKm: 6051.8 },
  earth: { ko: '지구', en: 'Earth', color: '#58a6df', radiusKm: 6371.0 },
  mars: { ko: '화성', en: 'Mars', color: '#ca6548', radiusKm: 3389.5 },
  jupiter: { ko: '목성', en: 'Jupiter', color: '#d2a478', radiusKm: 69911 },
  saturn: { ko: '토성', en: 'Saturn', color: '#d9c58d', radiusKm: 58232 },
  uranus: { ko: '천왕성', en: 'Uranus', color: '#82d4d8', radiusKm: 25362 },
  neptune: { ko: '해왕성', en: 'Neptune', color: '#557ad9', radiusKm: 24622 },
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const utcDate = day => new Date(day * DAY_MS);

export const solarScene = {
  root: null,
  canvas: null,
  slider: null,
  day: clamp(Math.floor(Date.now() / DAY_MS), MIN_DAY, MAX_DAY),
  playing: false,
  _frame: 0,
  _lastFrame: 0,

  init() {
    if (this.root) return this;
    this.root = document.getElementById('solarExperience');
    this.canvas = document.getElementById('solarCanvas');
    this.slider = document.getElementById('solarTime');
    if (!this.root || !this.canvas || !this.slider) return this;
    this.slider.min = String(MIN_DAY); this.slider.max = String(MAX_DAY);
    this.slider.value = String(this.day);
    this.slider.addEventListener('input', () => { this.pause(); this.setDay(Number(this.slider.value)); });
    document.getElementById('solarPlay').addEventListener('click', () => this.playing ? this.pause() : this.play());
    ['solarOrbits', 'solarNames', 'solarActualSize'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => { this.renderText(); this.draw(); });
    });
    new ResizeObserver(() => this.draw()).observe(this.canvas.parentElement);
    store.on('scene', (next, stage) => this.setVisible(next === 'space' && stage === 'solar'));
    i18n.onChange(() => { this.renderText(); this.draw(); });
    this.setVisible(store.scene === 'space' && store.sceneStage === 'solar');
    return this;
  },

  setVisible(visible) {
    if (!this.root) return;
    document.getElementById('spaceSceneIntro').hidden = visible;
    this.root.hidden = !visible;
    if (!visible) this.pause();
    else { this.renderText(); this.draw(); }
  },

  setDay(day) {
    this.day = clamp(Math.round(day), MIN_DAY, MAX_DAY);
    this.slider.value = String(this.day);
    this.renderText(); this.draw();
    if (this.day >= MAX_DAY) this.pause();
  },

  play() {
    if (this.day >= MAX_DAY) this.setDay(MIN_DAY);
    this.playing = true; this._lastFrame = 0;
    document.getElementById('solarPlay').textContent = '⏸';
    const step = timestamp => {
      if (!this.playing) return;
      if (this._lastFrame) this.setDay(this.day + (timestamp - this._lastFrame) * 0.2);
      this._lastFrame = timestamp;
      if (this.playing) this._frame = requestAnimationFrame(step);
    };
    this._frame = requestAnimationFrame(step);
  },

  pause() {
    this.playing = false; this._lastFrame = 0;
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = 0;
    const button = document.getElementById('solarPlay');
    if (button) button.textContent = '▶';
  },

  renderText() {
    if (!this.root) return;
    const ko = i18n.lang === 'ko';
    const date = utcDate(this.day);
    document.getElementById('solarTitle').textContent = ko ? '태양계의 이 날' : 'The Solar System on this date';
    document.getElementById('solarDate').textContent = new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date) + ' UTC';
    document.getElementById('solarSource').textContent = ko
      ? '이 날의 위치 계산값 · JPL 공개 궤도요소(1800–2050) · Horizons 8행성×4시점 검증'
      : 'Positions calculated for this date · JPL public elements (1800–2050) · checked against Horizons at 8 planets × 4 dates';
    document.getElementById('solarOrbitsLabel').textContent = ko ? '궤도선' : 'Orbit lines';
    document.getElementById('solarNamesLabel').textContent = ko ? '이름표' : 'Names';
    document.getElementById('solarActualLabel').textContent = ko ? '실제 크기 비율' : 'Actual size ratio';
    const actual = document.getElementById('solarActualSize').checked;
    document.getElementById('solarScaleNote').textContent = actual
      ? (ko ? '실제 크기는 1픽셀보다 작아 위치표시만 보입니다 · 안쪽 태양계는 확대 창' : 'True sizes are subpixel; only location markers remain · inner system is an inset')
      : (ko ? '행성 크기 과장됨 · 안쪽 태양계는 확대 창' : 'Planet sizes exaggerated · inner system is an inset');
    document.getElementById('solarLimit').textContent = ko
      ? '교육용 근사 위치입니다. 관측 조준·우주비행에는 JPL Horizons를 사용하세요. 색은 행성 구분을 위한 표현입니다.'
      : 'Educational approximate positions. Use JPL Horizons for pointing or spaceflight. Colors are visual identifiers, not observed color.';
  },

  draw() {
    if (!this.canvas || this.root.hidden) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = width / dpr, h = height / dpr;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, w, h);
    // Math.random 금지: 같은 인덱스는 항상 같은 배경 점을 만든다.
    for (let index = 0; index < 90; index += 1) {
      const x = ((index * 73) % 997) / 997 * w;
      const y = ((index * index * 29 + 17) % 991) / 991 * h;
      ctx.fillStyle = index % 9 ? 'rgba(255,255,255,.18)' : 'rgba(180,192,255,.42)';
      ctx.fillRect(x, y, 1, 1);
    }
    const positions = planetPositions(utcDate(this.day));
    const outerBox = { x: 10, y: 10, width: w - 20, height: h - 20 };
    this.drawSystem(ctx, IDS, positions, outerBox, 31.5, false);
    const insetSize = Math.min(230, w * .34, h * .45);
    const inset = { x: 18, y: 18, width: insetSize, height: insetSize };
    ctx.fillStyle = 'rgba(4,7,14,.88)'; ctx.fillRect(inset.x, inset.y, inset.width, inset.height);
    ctx.strokeStyle = 'rgba(142,125,224,.34)'; ctx.strokeRect(inset.x, inset.y, inset.width, inset.height);
    this.drawSystem(ctx, IDS.slice(0, 4), positions, inset, 1.75, true);
  },

  drawSystem(ctx, ids, positions, box, maxAu, inset) {
    const centerX = box.x + box.width / 2, centerY = box.y + box.height / 2;
    const scale = Math.min(box.width, box.height) * .45 / maxAu;
    const date = utcDate(this.day);
    const showOrbits = document.getElementById('solarOrbits').checked;
    const showNames = document.getElementById('solarNames').checked;
    const actual = document.getElementById('solarActualSize').checked;
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
    if (showOrbits) ids.forEach(id => {
      const points = planetOrbit(id, date, 140);
      ctx.strokeStyle = 'rgba(183,190,215,.18)'; ctx.lineWidth = 1; ctx.beginPath();
      points.forEach((point, index) => {
        const x = centerX + point.x * scale, y = centerY - point.y * scale;
        if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
    const sunRadius = actual ? .65 : (inset ? 4 : 5);
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(centerX, centerY, sunRadius, 0, Math.PI * 2); ctx.fill();
    ids.forEach((id, index) => {
      const point = positions[id], meta = META[id];
      const x = centerX + point.x * scale, y = centerY - point.y * scale;
      const radius = actual ? .65 : (inset ? 2.7 + Math.log10(meta.radiusKm / 2000) * 1.4
        : 3.2 + Math.log10(meta.radiusKm / 2000) * 2.2);
      ctx.fillStyle = meta.color; ctx.beginPath(); ctx.arc(x, y, Math.max(.65, radius), 0, Math.PI * 2); ctx.fill();
      // 밖쪽 전체 창의 안쪽 4행성 이름은 한 픽셀 근처에 겹친다.
      // 확대 창에서 이름을 보여 주고 전체 창에서는 위치점만 남긴다.
      if (showNames && (inset || index >= 4)) {
        ctx.font = `${inset ? 9 : 11}px system-ui,sans-serif`;
        ctx.fillStyle = 'rgba(242,243,249,.78)';
        const name = meta[i18n.lang === 'ko' ? 'ko' : 'en'];
        ctx.fillText(name, x + 5, y - 5 - (index % 2) * 7);
      }
    });
    if (inset) {
      ctx.font = '600 9px ui-monospace,monospace'; ctx.fillStyle = 'rgba(190,178,255,.72)';
      ctx.fillText(i18n.lang === 'ko' ? '안쪽 태양계 · 1.75 AU' : 'INNER SYSTEM · 1.75 AU', box.x + 8, box.y + 14);
    }
    ctx.restore();
  },
};
