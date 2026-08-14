// 출처가 확인된 문헌 범위·단일 관측 깊이 기반 심해 생물 도감
//
// ⚠️ 현재 좌표에 생물이 있다고 판정하지 않는다.
//    문헌 범위는 현재 수심과 겹칠 때, 단일 관측은 작은 탐색창 안에서만 보여 준다.
// ⚠️ Math.random 금지. 종 id 해시로 표시 순서를 고정한다.

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
    const layout = cardLayout(this.layer.clientWidth, this.layer.clientHeight);
    const active = (this.items || []).filter(item => item.depthKind === 'observation-depth'
      ? Math.abs(depth - item.depthMin) <= item.displayWindowM
      : depth >= item.depthMin && depth <= item.depthMax)
      .sort((left, right) => observationRank(left) - observationRank(right)
        || hash(left.id) - hash(right.id)).slice(0, layout.capacity);
    const y = Math.max(10, Math.min(90, depth / Math.max(1, data.depthM) * 100));
    const positions = cardPositions(active.length, layout, y);
    active.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'sea-life-item';
      button.style.left = `${positions[index].left}px`;
      button.style.top = `${positions[index].top}px`;
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
    size.textContent = `${sizeLabel(item, ko)}: ${formatSize(item, ko)}`;
    const warning = document.createElement('p');
    warning.textContent = ko ? '자료 유형 · 관측·문헌 기록' : 'Data type · observation and literature records';
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
    return ko ? '문헌 깊이 범위' : 'Literature depth range';
  }
  return ko
    ? `단일 관측 · ±${item.displayWindowM}m 탐색창 · 현위치 아님`
    : `Single record · ±${item.displayWindowM}m discovery window`;
}

function observationRank(item) {
  return item.depthKind === 'observation-depth' ? 0 : 1;
}

function cardLayout(layerWidth, layerHeight) {
  const width = Math.max(120, layerWidth || 600);
  const height = Math.max(260, layerHeight || 300);
  const compact = width < 480;
  const cardWidth = compact ? 92 : 112;
  const cardHeight = 65;
  const gap = compact ? 6 : 8;
  const columns = Math.max(1, Math.min(4, Math.floor((width + gap) / (cardWidth + gap))));
  const rows = Math.max(1, Math.floor((height + gap) / (cardHeight + gap)));
  return {
    width, height, cardWidth, cardHeight, gap, columns,
    capacity: Math.max(1, Math.min(8, columns * rows)),
  };
}

function cardPositions(count, layout, depthPercent) {
  // 받은 수심에서 문헌 카드가 모두 위쪽으로 몰릴 때 해시 좌표가 겹쳐,
  // 보이는 종과 다른 버튼이 열렸다. 실제 카드 크기와 탐색창 크기로 격자를 고정한다.
  const { width, height, cardWidth, cardHeight, gap, columns } = layout;
  const rows = Math.ceil(count / columns);
  const usedWidth = columns * cardWidth + (columns - 1) * gap;
  const blockHeight = rows * cardHeight + (rows - 1) * gap;
  const leftEdge = Math.max(4, (width - usedWidth) / 2);
  const desiredTopEdge = depthPercent / 100 * height - blockHeight / 2;
  const maxTopEdge = Math.max(4, height - blockHeight - 4);
  const topEdge = Math.max(4, Math.min(maxTopEdge, desiredTopEdge));

  return Array.from({ length: count }, (_, index) => ({
    left: leftEdge + cardWidth / 2 + (index % columns) * (cardWidth + gap),
    top: topEdge + cardHeight / 2 + Math.floor(index / columns) * (cardHeight + gap),
  }));
}

function formatSize(item, ko) {
  if (item.sizeKind === 'range-midpoint' && item.sizeMinM && item.sizeMaxM) {
    return `${formatMeters(item.sizeMinM)}–${formatMeters(item.sizeMaxM)}`;
  }
  const value = item.sizeM < 1 ? `${Math.round(item.sizeM * 100)}cm` : `${item.sizeM.toLocaleString()}m`;
  if (item.sizeKind === 'minimum') return ko ? `${value} 초과` : `over ${value}`;
  if (item.sizeKind === 'range-midpoint') return ko ? `대표값 약 ${value}` : `representative ~${value}`;
  return ko ? `약 ${value}` : `about ${value}`;
}

function sizeLabel(item, ko) {
  if (item.depthKind === 'observation-depth') {
    return ko ? '사진 속 기록 크기' : 'Recorded size in image';
  }
  return item.sizeKind === 'range-midpoint'
    ? (ko ? '문헌 크기 범위' : 'Literature size range')
    : (ko ? '문헌 대표 크기' : 'Representative literature size');
}

function formatMeters(value) {
  if (value >= 1) return `${value.toLocaleString()}m`;
  const centimeters = Number((value * 100).toFixed(1));
  return `${centimeters.toLocaleString()}cm`;
}
