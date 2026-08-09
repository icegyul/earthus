// 출처가 확인된 문헌 범위·단일 관측 깊이 기반 심해 생물 도감
//
// ⚠️ 현재 좌표에 생물이 있다고 판정하지 않는다.
//    문헌 범위는 현재 수심과 겹칠 때, 단일 관측은 작은 탐색창 안에서만 보여 준다.
// ⚠️ Math.random 금지. 종 id 해시로 가로 위치를 고정한다.

import { i18n } from '../i18n.js';

const hash = value => {
  let output = 2166136261;
  for (const character of value) output = Math.imul(output ^ character.charCodeAt(0), 16777619);
  return output >>> 0;
};

export const seaLife = {
  layer: null,
  detail: null,
  items: null,

  init() {
    if (this.layer) return this;
    this.layer = document.getElementById('seaLifeLayer');
    this.detail = document.getElementById('seaLifeDetail');
    i18n.onChange(() => this._last && this.update(this._last.data, this._last.depth));
    return this;
  },

  async load() {
    if (this.items) return this.items;
    const response = await fetch('/data/sea-life.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`SEA_LIFE_${response.status}`);
    const document = await response.json();
    this.items = document.items || [];
    return this.items;
  },

  async setDive(data, depth) {
    this.init();
    try { await this.load(); } catch (error) {
      console.warn('[sea-life]', error.message); this.items = [];
    }
    this.update(data, depth);
  },

  update(data, depth) {
    if (!this.layer || !data) return;
    this._last = { data, depth };
    this.layer.innerHTML = '';
    if (this.detail) this.detail.hidden = true;
    const active = (this.items || []).filter(item => item.depthKind === 'observation-depth'
      ? Math.abs(depth - item.depthMin) <= item.displayWindowM
      : depth >= item.depthMin && depth <= item.depthMax)
      .sort((left, right) => hash(left.id) - hash(right.id)).slice(0, 8);
    const y = Math.max(10, Math.min(90, depth / Math.max(1, data.depthM) * 100));
    active.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'sea-life-item';
      button.style.left = `${12 + hash(item.id) % 72}%`;
      button.style.top = `${Math.max(9, Math.min(91, y + (index % 3 - 1) * 7))}%`;
      const image = new Image(); image.src = item.thumb;
      image.alt = item.name[i18n.lang === 'ko' ? 'ko' : 'en'];
      const name = document.createElement('b'); name.textContent = image.alt;
      const disclaimer = document.createElement('small');
      const observed = item.depthKind === 'observation-depth';
      disclaimer.textContent = depthLabel(item, i18n.lang === 'ko');
      button.append(image, name, disclaimer);
      button.addEventListener('click', () => this.showDetail(item));
      this.layer.appendChild(button);
    });
  },

  showDetail(item) {
    if (!this.detail) return;
    const ko = i18n.lang === 'ko';
    this.detail.innerHTML = '';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '✕';
    close.setAttribute('aria-label', ko ? '닫기' : 'Close'); close.onclick = () => { this.detail.hidden = true; };
    const image = new Image(); image.src = item.thumb; image.alt = item.name[ko ? 'ko' : 'en'];
    const body = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = `${item.name[ko ? 'ko' : 'en']} · ${item.sci}`;
    const range = document.createElement('p');
    const observed = item.depthKind === 'observation-depth';
    range.textContent = observed
      ? `${ko ? '기록된 관측 깊이' : 'Recorded observation depth'}: ${item.depthMin.toLocaleString()}m`
      : `${ko ? '문헌 깊이 범위' : 'Literature depth range'}: ${item.depthMin.toLocaleString()}–${item.depthMax.toLocaleString()}m`;
    const size = document.createElement('p');
    size.textContent = `${ko ? '사진 속 기록 크기' : 'Recorded size in image'}: ${formatSize(item, ko)}`;
    const warning = document.createElement('p');
    warning.textContent = ko ? '관측·문헌 기록 기반 — 이 자리에 지금 있다는 뜻이 아닙니다.' : 'Based on observation and literature records — not evidence that it is here now.';
    const note = document.createElement('p'); note.textContent = item.note[ko ? 'ko' : 'en'];
    const sources = document.createElement('p');
    const depthLink = document.createElement('a'); depthLink.href = item.depthSourceUrl;
    depthLink.target = '_blank'; depthLink.rel = 'noopener'; depthLink.textContent = `${item.depthSource} ↗`;
    const photoLink = document.createElement('a'); photoLink.href = item.photoSourceUrl;
    photoLink.target = '_blank'; photoLink.rel = 'noopener'; photoLink.textContent = `${item.credit} · ${item.license} ↗`;
    sources.append(depthLink, document.createTextNode(' · '), photoLink);
    body.append(title, range, size, warning, note, sources);
    this.detail.append(close, image, body); this.detail.hidden = false;
  },
};

function depthLabel(item, ko) {
  if (item.depthKind !== 'observation-depth') {
    return ko ? '문헌 범위 · 현위치 아님' : 'Literature range · not a live sighting';
  }
  return ko
    ? `단일 관측 · ±${item.displayWindowM}m 탐색창 · 현위치 아님`
    : `Single record · ±${item.displayWindowM}m discovery window · not live`;
}

function formatSize(item, ko) {
  const value = item.sizeM < 1 ? `${Math.round(item.sizeM * 100)}cm` : `${item.sizeM.toLocaleString()}m`;
  if (item.sizeKind === 'minimum') return ko ? `${value} 초과` : `over ${value}`;
  if (item.sizeKind === 'range-midpoint') return ko ? `대표값 약 ${value}` : `representative ~${value}`;
  return ko ? `약 ${value}` : `about ${value}`;
}
