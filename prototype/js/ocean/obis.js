// OBIS 5도 해역 관측 기록 요약
// ⚠️ 기록 수는 개체수나 현재 분포가 아니다. 없는 셀을 0건으로 만들지 않는다.

import { API } from '../config.js';
import { i18n } from '../i18n.js';

const ROOT = `${API.OCEAN}/obis-summary.json`;

export function obisCellId(lat, lon) {
  lat = Number(lat); lon = ((Number(lon) + 180) % 360 + 360) % 360 - 180;
  const south = Math.max(-90, Math.floor((Math.min(lat, 89.999999) + 90) / 5) * 5 - 90);
  const west = Math.floor((lon + 180) / 5) * 5 - 180;
  return `${south < 0 ? `s${Math.abs(south)}` : `n${south}`}_${west < 0 ? `w${Math.abs(west)}` : `e${west}`}`;
}

export const obisSummary = {
  root: null,
  document: null,
  current: null,

  init() {
    this.root = document.getElementById('obisSummary');
    i18n.onChange(() => this.render());
    return this;
  },

  async show(lat, lon) {
    this.init();
    this.current = { lat, lon, cell: null, error: null };
    this.render();
    try {
      if (!this.document) {
        const response = await fetch(ROOT, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`OBIS_SUMMARY_${response.status}`);
        const doc = await response.json();
        if (doc.schema !== 'earthus.obis-summary.v1') throw new Error('OBIS_SUMMARY_SCHEMA');
        this.document = doc;
      }
      const id = obisCellId(lat, lon);
      this.current.cell = this.document.cells.find(item => item.id === id) || null;
    } catch (error) {
      this.current.error = error.message;
      console.warn('[obis-summary]', error.message);
    }
    this.render();
  },

  render() {
    if (!this.root || !this.current) return;
    const ko = i18n.lang === 'ko';
    this.root.replaceChildren();
    const title = document.createElement('h3');
    title.id = 'obisTitle';
    title.textContent = ko ? '이 해역의 생물 관측 기록' : 'Biodiversity records in this area';
    this.root.append(title);
    if (!this.document && !this.current.error) {
      this.root.append(this.p(ko ? 'OBIS 요약을 읽는 중…' : 'Reading the OBIS summary…'));
      return;
    }
    if (this.current.error) {
      this.root.append(this.p(ko
        ? 'OBIS 해역 요약을 불러오지 못했습니다. 자료가 0건이라는 뜻이 아닙니다.'
        : 'The OBIS area summary is unavailable. This does not mean there are zero records.'));
      this.root.append(this.limit(ko ? '기록 없음 ≠ 생물 없음' : 'No records ≠ no life'));
      return;
    }
    const cell = this.current.cell;
    if (!cell) {
      this.root.append(this.p(ko
        ? '이 5도 해역은 이번 요약 대상에 아직 포함되지 않았습니다. 자료 없음으로 판정하지 않습니다.'
        : 'This 5-degree cell is not yet included in this summary. It is not classified as having no records.'));
      this.root.append(this.limit(ko ? '기록 없음 ≠ 생물 없음' : 'No records ≠ no life'));
      return;
    }
    const bounds = cell.bounds;
    const count = document.createElement('strong');
    count.textContent = ko
      ? `이 5° 해역 관측 기록 ${cell.records.toLocaleString()}건 (OBIS)`
      : `${cell.records.toLocaleString()} occurrence records in this 5° cell (OBIS)`;
    const scope = this.p(ko
      ? `범위 ${formatBounds(bounds)} · 종 수준 분류 ${cell.species.toLocaleString()}종 · 자료묶음 ${cell.datasets.toLocaleString()}개`
      : `Bounds ${formatBounds(bounds)} · ${cell.species.toLocaleString()} species-level taxa · ${cell.datasets.toLocaleString()} datasets`);
    this.root.append(count, scope);
    if (cell.topTaxa?.length) {
      const listTitle = document.createElement('h4');
      listTitle.textContent = ko ? '기록 수 상위 학명 · 종 외 분류군 포함' : 'Top scientific names by records · may include ranks above species';
      const list = document.createElement('ol');
      cell.topTaxa.forEach(item => {
        const row = document.createElement('li');
        row.textContent = `${item.scientificName} · n=${item.records.toLocaleString()}`;
        list.append(row);
      });
      this.root.append(listTitle, list);
    }
    const years = Array.isArray(cell.yearRange) ? `${cell.yearRange[0]}–${cell.yearRange[1]}` : '—';
    this.root.append(this.p(ko
      ? `기록 연도 ${years} · API 조회 ${cell.retrievedAt.slice(0, 10)} · 표본 n=${cell.records.toLocaleString()}`
      : `Record years ${years} · API accessed ${cell.retrievedAt.slice(0, 10)} · sample n=${cell.records.toLocaleString()}`));
    this.root.append(this.limit(ko
      ? '기록 없음 ≠ 생물 없음. 조사 시기·장소·노력이 고르지 않으며, 기록 수는 개체수나 지금의 분포가 아닙니다.'
      : 'No records ≠ no life. Sampling is uneven across time, place and effort; counts are not abundance or current distribution.'));
    const links = document.createElement('p'); links.className = 'obis-links';
    links.append(this.link('https://api.obis.org/', ko ? 'OBIS API·출처' : 'OBIS API & source'),
      document.createTextNode(' · '),
      this.link('https://manual.obis.org/policy.html', ko ? '자료 정책' : 'Data policy'));
    this.root.append(links);
  },

  p(text) { const p = document.createElement('p'); p.textContent = text; return p; },
  limit(text) { const p = this.p(text); p.className = 'obis-limit'; return p; },
  link(url, text) {
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = `${text} ↗`; return a;
  },
};

function formatBounds(bounds) {
  const coordinate = (value, axis) => {
    const suffix = axis === 'lat' ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
    return `${Math.abs(value)}°${suffix}`;
  };
  return `${coordinate(bounds.south, 'lat')}–${coordinate(bounds.north, 'lat')}, `
    + `${coordinate(bounds.west, 'lon')}–${coordinate(bounds.east, 'lon')}`;
}
