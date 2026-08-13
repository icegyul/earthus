// 실제 지점 수심 기둥
//
// ⚠️ 애니메이션 루프가 없다. 휠·드래그·슬라이더·리사이즈가 생긴 순간만 다시 그린다.
// ⚠️ 수심은 0.1도 셀 최심값 기반 정보 제품이며 특정 좌표의 실측값이 아니다.

import { i18n } from '../i18n.js';
import { oceanDepth } from './depth.js';
import { seaLife } from './sealife.js';
import { obisSummary } from './obis.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const diveScene = {
  root: null,
  canvas: null,
  slider: null,
  data: null,
  comparisons: [],
  current: 0,
  _drag: null,

  init() {
    if (this.root) return this;
    this.root = document.getElementById('diveExperience');
    this.canvas = document.getElementById('diveCanvas');
    this.slider = document.getElementById('diveSlider');
    if (!this.root || !this.canvas || !this.slider) return this;
    this.slider.addEventListener('input', () => this.setDepth(Number(this.slider.value)));
    const wrap = this.canvas.parentElement;
    wrap.addEventListener('wheel', event => {
      if (!this.data) return;
      event.preventDefault();
      this.setDepth(this.current + Math.sign(event.deltaY) * Math.max(10, this.data.depthM / 45));
    }, { passive: false });
    wrap.addEventListener('pointerdown', event => {
      if (!this.data) return;
      // ⚠️ 생물 카드·출처 링크의 포인터를 잡으면 click 이 취소되어 상세가 열리지 않는다.
      if (event.target.closest('button, a')) return;
      this._drag = { y: event.clientY, depth: this.current };
      wrap.setPointerCapture(event.pointerId);
    });
    wrap.addEventListener('pointermove', event => {
      if (!this._drag || !this.data) return;
      const height = Math.max(1, wrap.clientHeight);
      this.setDepth(this._drag.depth + (event.clientY - this._drag.y) / height * this.data.depthM);
    });
    const end = () => { this._drag = null; };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    new ResizeObserver(() => this.draw()).observe(wrap);
    i18n.onChange(() => { this.renderText(); this.renderComparisons(); this.draw(); });
    seaLife.init();
    obisSummary.init();
    return this;
  },

  async open({ lat, lon, name }) {
    this.init();
    document.getElementById('oceanSceneIntro').hidden = true;
    this.root.hidden = false;
    this.data = null;
    this.current = 0;
    document.getElementById('diveTitle').textContent = name
      || (i18n.lang === 'ko' ? '이 지점의 수심' : 'Depth at this location');
    document.getElementById('diveSource').textContent = i18n.lang === 'ko'
      ? 'GEBCO 2026 격자를 읽는 중…' : 'Reading the GEBCO 2026 grid…';
    document.getElementById('diveLimit').textContent = '';
    obisSummary.show(lat, lon);
    this.draw();
    try {
      const [data, comparisons] = await Promise.all([
        oceanDepth.query(lat, lon),
        fetch('/data/ocean-comparisons.json', { cache: 'no-cache' }).then(response => {
          if (!response.ok) throw new Error(`OCEAN_COMPARISONS_${response.status}`);
          return response.json();
        }),
      ]);
      if (!data.isOcean) throw new Error('LAND_CELL');
      this.data = data;
      this.comparisons = comparisons.items || [];
      this.slider.max = String(Math.max(1, data.depthM));
      this.slider.value = '0';
      this.renderComparisons();
      this.renderText();
      this.draw();
      await seaLife.setDive(data, this.current);
    } catch (error) {
      document.getElementById('diveSource').textContent = error.message === 'LAND_CELL'
        ? (i18n.lang === 'ko' ? '이 격자 셀은 바다가 아니라 육지로 판정됐습니다.' : 'This grid cell is classified as land.')
        : (i18n.lang === 'ko' ? '수심 자료를 불러오지 못했습니다.' : 'Depth data is unavailable.');
      console.warn('[dive]', error.message);
    }
  },

  renderText() {
    if (!this.data) return;
    const ko = i18n.lang === 'ko';
    const source = this.data.source;
    document.querySelector('label[for="diveSlider"]').textContent = ko ? '현재 깊이' : 'Current depth';
    this.slider.setAttribute('aria-label', ko ? '현재 깊이' : 'Current depth');
    this.canvas.setAttribute('aria-label', ko ? '수면에서 해저까지의 수심 기둥' : 'Depth column from surface to seafloor');
    this.root.closest('[data-scene-view="ocean"]')?.setAttribute('aria-label',
      ko ? '심해 탐험 기반 장면' : 'Evidence-based deep-ocean exploration');
    document.getElementById('diveSource').textContent = ko
      ? `해저 ${this.data.depthM.toLocaleString()}m · ${source.title} · 자료 ${source.created} · 격자 ${this.data.source.gridBuilt.slice(0, 10)}`
      : `Seafloor ${this.data.depthM.toLocaleString()}m · ${source.title} · data ${source.created} · grid ${this.data.source.gridBuilt.slice(0, 10)}`;
    document.getElementById('diveLimit').textContent = ko
      ? '약 11km 셀 안의 가장 깊은 원본값입니다. 이 좌표의 실측 수심이 아니며 항해·해상 안전에 쓰면 안 됩니다.'
      : 'Deepest source value within an ~11 km cell, not a sounding at this point. Never use for navigation or safety at sea.';
  },

  renderComparisons() {
    const root = document.getElementById('diveComparisons');
    if (!root) return;
    const ko = i18n.lang === 'ko';
    root.innerHTML = '';
    this.comparisons.filter(item => item.depthM <= this.data.depthM).forEach(item => {
      const link = document.createElement('a');
      link.href = item.sourceUrl;
      link.target = '_blank'; link.rel = 'noopener';
      link.textContent = `${item.name[ko ? 'ko' : 'en']} · ${Number(item.depthM).toLocaleString()}m · ${item.source} ↗`;
      root.appendChild(link);
    });
  },

  setDepth(value) {
    if (!this.data) return;
    this.current = clamp(value, 0, this.data.depthM);
    this.slider.value = String(Math.round(this.current));
    this.draw();
    seaLife.update(this.data, this.current);
  },

  draw() {
    if (!this.canvas) return;
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
    ctx.clearRect(0, 0, w, h);
    const maxDepth = this.data?.depthM || 1;
    const darkY = Math.min(h, 1000 / maxDepth * h);
    const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(1, darkY));
    gradient.addColorStop(0, '#167fa0'); gradient.addColorStop(.25, '#07536f'); gradient.addColorStop(1, '#010609');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, darkY);
    ctx.fillStyle = '#000'; ctx.fillRect(0, darkY, w, h - darkY);

    const ko = i18n.lang === 'ko';
    const layers = [
      [0, ko ? '햇빛이 닿는 층 (표해수층)' : 'Sunlit layer (epipelagic)'],
      [200, ko ? '어스름한 층 (중층원양대)' : 'Twilight layer (mesopelagic)'],
      [1000, ko ? '빛이 없는 층 (점심해대 이하)' : 'Dark layer (bathypelagic and deeper)'],
    ];
    ctx.font = '12px system-ui, sans-serif';
    layers.forEach(([depth, label], index) => {
      if (depth > maxDepth) return;
      const y = depth / maxDepth * h;
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      const labelY = Math.max(16 + index * 18, y + 16);
      ctx.fillStyle = 'rgba(255,255,255,.74)'; ctx.fillText(`${label} · ${depth.toLocaleString()}m`, 12, labelY);
    });
    this.comparisons.forEach(item => {
      if (!this.data || item.depthM > maxDepth) return;
      const y = item.depthM / maxDepth * h;
      const name = item.name?.[ko ? 'ko' : 'en'] || item.id;
      ctx.strokeStyle = 'rgba(98,213,232,.65)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(w * .04, y); ctx.lineTo(w * .42, y); ctx.stroke();
      ctx.fillStyle = '#8de7f4';
      ctx.fillText(`${name} · ${Number(item.depthM).toLocaleString()}m`, w * .05, Math.max(14, y - 5));
    });
    if (this.data) {
      ctx.strokeStyle = '#9b8068'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, h - 2); ctx.lineTo(w, h - 2); ctx.stroke();
      ctx.fillStyle = '#d5c0ab'; ctx.fillText(`${ko ? '해저' : 'Seafloor'} · ${maxDepth.toLocaleString()}m`, 12, h - 12);
      const y = this.current / maxDepth * h;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w * .72, y, 6, 0, Math.PI * 2); ctx.fill();
      const pressure = 1 + this.current / 10;
      const light = this.current < 200
        ? (ko ? '햇빛' : 'sunlit') : this.current < 1000
          ? (ko ? '어스름' : 'twilight') : (ko ? '빛 없음' : 'dark');
      document.getElementById('diveReadout').textContent = `${Math.round(this.current).toLocaleString()} m · ${ko ? '압력 약' : 'approx.'} ${Math.round(pressure).toLocaleString()} atm · ${light}`;
    } else {
      document.getElementById('diveReadout').textContent = ko ? '자료 대기' : 'Waiting for data';
    }
  },
};
