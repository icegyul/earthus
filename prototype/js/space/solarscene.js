// 8행성 태양계 2D 장면
//
// ⚠️ 기본은 정지 화면이다. 날짜 변경·리사이즈에만 그리고,
//    사용자가 ▶를 누른 동안만 rAF를 쓴다. 2050년 경계에서 반드시 멈춘다.
// ⚠️ 행성 색은 구분을 위한 시각 보조이며 실제 관측색이 아니다.

import { store } from '../store.js';
import { i18n } from '../i18n.js';
import { planetOrbit, planetPositions } from './kepler.js';

const DAY_MS = 86_400_000;
const LIGHT_HOURS_PER_AU = 499.004783836 / 3600;
const JWST_START = Date.parse('2022-01-24T00:00:00Z');
const JWST_DISPLAY_END = Date.parse('2031-08-10T00:00:00Z');
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
const probePosition = (probe, date) => {
  const elapsedDays = (date.getTime() - Date.parse(probe.epoch)) / DAY_MS;
  return {
    x: probe.pos[0] + probe.vel[0] * elapsedDays,
    y: probe.pos[1] + probe.vel[1] * elapsedDays,
    z: probe.pos[2] + probe.vel[2] * elapsedDays,
  };
};

export const solarScene = {
  root: null,
  canvas: null,
  slider: null,
  day: clamp(Math.floor(Date.now() / DAY_MS), MIN_DAY, MAX_DAY),
  playing: false,
  _frame: 0,
  _lastFrame: 0,
  probes: [],

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
    this.loadProbes();
    return this;
  },

  async loadProbes() {
    try {
      const response = await fetch('data/probes.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`probes ${response.status}`);
      const document = await response.json();
      this.probes = Array.isArray(document.items) ? document.items : [];
      this.renderText(); this.draw();
    } catch (error) {
      // 자료를 못 읽으면 탐사선 위치를 만들지 않는다. 행성 장면은 그대로 둔다.
      this.probes = [];
      console.warn('[solar] 탐사선 상태벡터를 못 읽었습니다', error.message);
    }
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
      ? '이 날의 위치 계산값 · JPL 공개 궤도요소(1800–2050) · Horizons 8행성×4시점·보이저 상태벡터 검증'
      : 'Positions calculated for this date · JPL public elements (1800–2050) · planets and Voyager vectors checked against Horizons';
    document.getElementById('solarOrbitsLabel').textContent = ko ? '궤도선' : 'Orbit lines';
    document.getElementById('solarNamesLabel').textContent = ko ? '이름표' : 'Names';
    document.getElementById('solarActualLabel').textContent = ko ? '실제 크기 비율' : 'Actual size ratio';
    const actual = document.getElementById('solarActualSize').checked;
    document.getElementById('solarScaleNote').textContent = actual
      ? (ko ? '실제 크기는 1픽셀보다 작아 위치표시만 보입니다 · 안쪽 태양계는 확대 창' : 'True sizes are subpixel; only location markers remain · inner system is an inset')
      : (ko ? '행성 크기 과장됨 · 안쪽 태양계는 확대 창' : 'Planet sizes exaggerated · inner system is an inset');
    document.getElementById('solarLimit').textContent = ko
      ? '교육용 근사 위치 · 제임스웹: 태양–지구 L2 부근 헤일로 궤도 · 보이저: JPL 2026-08-10 기준+등속 추정, ±5년 · 정밀 계산: JPL Horizons'
      : 'Educational approximation · Webb: halo orbit near Sun–Earth L2 · Voyager: JPL 2026-08-10 epoch plus linear motion, ±5 years · precision source: JPL Horizons';
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
    this.drawProbeGuides(ctx, outerBox, utcDate(this.day));
    const insetSize = Math.min(230, w * .34, h * .45);
    const inset = { x: 18, y: 18, width: insetSize, height: insetSize };
    ctx.fillStyle = 'rgba(4,7,14,.88)'; ctx.fillRect(inset.x, inset.y, inset.width, inset.height);
    ctx.strokeStyle = 'rgba(142,125,224,.34)'; ctx.strokeRect(inset.x, inset.y, inset.width, inset.height);
    this.drawSystem(ctx, IDS.slice(0, 4), positions, inset, 1.75, true);
    this.drawJwst(ctx, positions.earth, inset, utcDate(this.day));
  },

  drawProbeGuides(ctx, box, date) {
    const centerX = box.x + box.width / 2, centerY = box.y + box.height / 2;
    const radius = Math.min(box.width, box.height) * .405;
    this.probes.forEach(probe => {
      const elapsedYears = Math.abs(date.getTime() - Date.parse(probe.epoch)) / (DAY_MS * 365.25);
      if (!Number.isFinite(elapsedYears) || elapsedYears > probe.displayRangeYears) return;
      const point = probePosition(probe, date);
      const planar = Math.hypot(point.x, point.y);
      if (!planar) return;
      const ux = point.x / planar, uy = -point.y / planar;
      const x = centerX + ux * radius, y = centerY + uy * radius;
      const angle = Math.atan2(uy, ux);
      ctx.save();
      ctx.translate(x, y); ctx.rotate(angle);
      ctx.strokeStyle = 'rgba(255,211,107,.76)'; ctx.fillStyle = '#ffd36b'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
      const distanceAu = Math.hypot(point.x, point.y, point.z);
      const name = probe.name[i18n.lang === 'ko' ? 'ko' : 'en'];
      const leftSide = ux < 0;
      const compact = box.width < 500;
      const alignLeft = !compact && !leftSide;
      const textX = x + (alignLeft ? 9 : -9);
      const nameY = y + (compact && !leftSide ? 12 : -7);
      // 두 보이저가 화면 아래쪽에서 서로 가까워져 글자를 중앙으로 쓰면 겹친다.
      // 좁은 화면에서는 오른쪽 자료를 한 줄 아래로 내려 스케일 손잡이와도 겹치지 않는다.
      ctx.textAlign = alignLeft ? 'left' : 'right';
      ctx.font = '600 10px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,226,148,.92)';
      ctx.fillText(name, textX, nameY);
      ctx.font = '500 8px ui-monospace,monospace'; ctx.fillStyle = 'rgba(255,226,148,.62)';
      const detail = i18n.lang === 'ko'
        ? `${distanceAu.toFixed(1)} AU · 빛 ${Math.round(distanceAu * LIGHT_HOURS_PER_AU)}시간`
        : `${distanceAu.toFixed(1)} AU · ${Math.round(distanceAu * LIGHT_HOURS_PER_AU)} light-hours`;
      ctx.fillText(detail, textX, nameY + 12);
    });
    ctx.textAlign = 'start';
  },

  drawJwst(ctx, earth, box, date) {
    if (!earth || date.getTime() < JWST_START || date.getTime() > JWST_DISPLAY_END) return;
    const centerX = box.x + box.width / 2, centerY = box.y + box.height / 2;
    const scale = Math.min(box.width, box.height) * .45 / 1.75;
    const earthX = centerX + earth.x * scale, earthY = centerY - earth.y * scale;
    const planar = Math.hypot(earth.x, earth.y);
    if (!planar) return;
    // 실제 0.01 AU 간격은 이 화면에서 1px 미만이라 11px로 과장하고 라벨에 밝힌다.
    const ux = earth.x / planar, uy = -earth.y / planar;
    const x = earthX + ux * 11, y = earthY + uy * 11;
    ctx.save();
    ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(189,177,255,.66)';
    ctx.beginPath(); ctx.moveTo(earthX, earthY); ctx.lineTo(x, y); ctx.stroke();
    ctx.setLineDash([]); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#bdb1ff'; ctx.fillRect(-2.5, -2.5, 5, 5); ctx.restore();
    ctx.font = '600 8px system-ui,sans-serif'; ctx.fillStyle = 'rgba(211,204,255,.9)';
    ctx.textAlign = ux < 0 ? 'right' : 'left';
    ctx.fillText(i18n.lang === 'ko' ? '제임스웹 · L2 부근 (간격 과장)' : 'Webb · near L2 (gap exaggerated)',
      x + (ux < 0 ? -5 : 5), y - 4);
    ctx.textAlign = 'start';
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
