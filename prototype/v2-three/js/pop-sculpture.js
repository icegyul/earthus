// EARTHUS — 국가 데이터 조각 (지시서 R-03 튀르키예 인구 릴리프 문법)
//
// 국경선을 그리는 게 아니라, 국경 안쪽의 실제 인구 격자(WorldPop 1km)를
// 지구 표면에서 솟아오르게 세운다. 나라의 윤곽은 선이 아니라 데이터가 만든다.
//
// 정직성: 셀 값은 실제 거주 인구(명)다. 높이는 표현용 변환(세제곱근)이며 그 사실과
//   총인구·최대 셀 값을 카드에 원값으로 싣는다. 값이 없는 셀은 채우지 않는다.

import * as THREE from '../../vendor/three-r184.module.min.js';

const GRID_URL = (iso3) => `./popgrid/${iso3.toLowerCase()}.json?v=2025a`;
const R_M = 6371000;

// 예술 방향: 저밀도는 차갑고 낮게 깔리고, 도시는 뜨겁게 솟는다.
// (튀르키예 포스터의 크림-마젠타 대비를 어두운 지구 위에서 재해석)
const RAMP = [
  [0.00, 0.10, 0.13, 0.22],
  [0.30, 0.20, 0.22, 0.38],
  [0.55, 0.52, 0.26, 0.52],
  [0.75, 0.86, 0.24, 0.44],
  [0.90, 1.00, 0.34, 0.40],
  [1.00, 1.00, 0.62, 0.50],
];
const rampAt = (t, out) => {
  for (let i = 1; i < RAMP.length; i += 1) {
    if (t <= RAMP[i][0]) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const f = (t - a[0]) / (b[0] - a[0]);
      out.setRGB(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f);
      return out;
    }
  }
  const l = RAMP[RAMP.length - 1];
  return out.setRGB(l[1], l[2], l[3]);
};

const b64ToBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

// zlib(deflate) 해제 — 브라우저 내장 DecompressionStream 사용
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

const llToV3 = (latDeg, lonDeg, r, out) => {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(la);
  return out.set(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
};

export class PopSculpture {
  constructor(scene, heightAt, getExagger) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.getExagger = getExagger;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.cache = {};
    this.on = false;
    this.iso3 = null;
    this.doc = null;
    this.loading = false;
    this.error = null;
    this.peaks = [];
    this.nameKo = null;
    // 포스터 캡션 + 도시 라벨 (R-03의 타이포그래피 문법)
    this.dom = document.createElement('div');
    this.dom.id = 'sculpt-ui';
    this.dom.innerHTML = '<div id="sculpt-cap"></div><div id="sculpt-peaks"></div>';
    document.body.appendChild(this.dom);
    this.capEl = this.dom.querySelector('#sculpt-cap');
    this.peakWrap = this.dom.querySelector('#sculpt-peaks');
    this.labelPool = [];
    this._v = new THREE.Vector3();
  }

  // 상위 인구 봉우리 N개 (같은 도시가 여러 셀로 겹치지 않게 최소 간격 유지)
  findPeaks(doc, cells, n = 5, minDeg = 0.6) {
    const { nx } = doc;
    const [cw, ch] = doc.cellDeg;
    const [lon0, lat0] = doc.originDeg;
    const order = [];
    for (let i = 0; i < cells.length; i += 1) if (cells[i] > 40) order.push(i);
    order.sort((a, b) => cells[b] - cells[a]);
    const out = [];
    for (const i of order) {
      const x = i % nx;
      const y = (i / nx) | 0;
      const lon = lon0 + (x + 0.5) * cw;
      const lat = lat0 - (y + 0.5) * ch;
      if (out.some((p) => Math.abs(p.lat - lat) < minDeg && Math.abs(p.lon - lon) < minDeg)) continue;
      out.push({ lat, lon, pop: doc.max * ((cells[i] / 255) ** 3) });
      if (out.length >= n) break;
    }
    return out;
  }

  setCaption(nameKo) {
    this.nameKo = nameKo || null;
    const d = this.doc;
    if (!this.on || !d) { this.capEl.innerHTML = ''; this.capEl.classList.remove('show'); return; }
    const b = this.breaks || [];
    const fmtB = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v));
    const swatches = b.map((v, i) => {
      const c = new THREE.Color();
      rampAt((i + 1) / 10, c);
      return `<i style="background:rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})"></i>`;
    }).join('');
    const cellTxt = this.cellKm ? `${this.cellKm[0].toFixed(1)}×${this.cellKm[1].toFixed(1)}km` : '칸';
    const legend = b.length
      ? `<span class="sc-legend">${swatches}<em>${fmtB(b[0])} → ${fmtB(b[9])}<u>명 / ${cellTxt} · 10단계</u></em></span>`
      : '';
    const over = this.overflowCells
      ? ` · 상한 초과 ${this.overflowCells.toLocaleString()}칸은 바깥 고리로 퍼뜨렸습니다`
      : '';
    const dens = this.denseCells
      ? `<br/>3×3이 꽉 찬 밀집 ${this.denseCells.toLocaleString()}칸은 낱개 말뚝 대신 <b>언덕</b>으로 — 가운데가 솟고 가장자리로 낮아집니다.`
      : '';
    this.capEl.innerHTML = `<b>${(nameKo || d.iso3)}</b>
      <span class="sc-sub">POPULATION DENSITY · ${d.source || 'WorldPop 1km'}</span>
      <span class="sc-num">${(d.total / 1e6).toFixed(1)}<i>백만 명</i> · 격자 ${d.nonzero.toLocaleString()}칸</span>
      ${legend}
      <span class="sc-src">국경선을 그리지 않았습니다 — 나라의 모양은 인구 데이터가 만듭니다.<br/>기둥 높이·색은 <b>10단계 등급</b>이며 상위 1%에서 잘립니다${over}.${dens}<br/>CC BY 4.0 WorldPop</span>`;
    this.capEl.classList.add('show');
  }

  // ---------- 거주 인구 × 지금 사람 (서울 실시간) ----------
  // 두 데이터는 서로 다른 것을 잰다:
  //   · WorldPop 격자 = 그 칸에 '사는' 사람 (2025 추정)
  //   · 서울 실시간   = 그 장소에 '지금 있는' 사람 (서울시 관측, 5~10분 주기)
  // 그래서 더하지 않는다. 거주 밀도 위에 현재 인원을 얹고, 그 비(比)를 따로 계산한다.
  async toggleLive() {
    this.liveOn = !this.liveOn;
    if (!this.liveOn) {
      if (this.liveGroup) { this.group.remove(this.liveGroup); this.disposeGroup(this.liveGroup); this.liveGroup = null; }
      this.livePlaces = null;
      return { on: false };
    }
    try {
      if (!this.liveDoc) {
        const r = await fetch('https://earthus.net/tourism/seoul-flow.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(`서울 실시간 인구 HTTP ${r.status}`);
        this.liveDoc = await r.json();
      }
      this.buildLive();
      return { on: true };
    } catch (e) {
      this.liveOn = false;
      this.liveError = String((e && e.message) || e);
      return { on: false, error: this.liveError };
    }
  }

  disposeGroup(g) {
    for (const c of g.children.slice()) {
      g.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
  }

  // 격자가 실제로 값을 가진 범위의 중심과 크기 — 나라마다 다른 거리로 날아가기 위해.
  // 격자 전체가 아니라 값 있는 셀의 경계를 쓴다(해외 영토·빈 여백에 끌려가지 않게).
  extent() {
    const d = this.doc;
    if (!d || !d._cells) return null;
    const { nx, ny } = d;
    const [cw, ch] = d.cellDeg;
    const [lon0, lat0] = d.originDeg;
    let x0 = nx; let x1 = -1; let y0 = ny; let y1 = -1;
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        if (!d._cells[y * nx + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const lonA = lon0 + x0 * cw;
    const lonB = lon0 + (x1 + 1) * cw;
    const latA = lat0 - (y1 + 1) * ch;
    const latB = lat0 - y0 * ch;
    const lat = (latA + latB) / 2;
    const spanKm = Math.max(
      (lonB - lonA) * 111.32 * Math.cos((lat * Math.PI) / 180),
      (latB - latA) * 110.57,
    );
    return { lat, lon: (lonA + lonB) / 2, spanKm };
  }

  // 비교 창(주변 3×3칸)의 실제 크기 — 격자 셀이 1km가 아니므로 매번 계산해 적는다
  windowKmText() {
    if (!this.cellKm) return '주변 3×3칸';
    return `약 ${(this.cellKm[0] * 3).toFixed(0)}×${(this.cellKm[1] * 3).toFixed(0)}km`;
  }

  // 격자에서 (lat,lon) 주변 3×3칸의 거주 인구 합 — 없으면 null
  residentsAround(lat, lon) {
    const d = this.doc;
    if (!d || !d._cells) return null;
    const { nx, ny } = d;
    const [cw, ch] = d.cellDeg;
    const [lon0, lat0] = d.originDeg;
    const x0 = Math.floor((lon - lon0) / cw);
    const y0 = Math.floor((lat0 - lat) / ch);
    if (x0 < 0 || y0 < 0 || x0 >= nx || y0 >= ny) return null;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
        const u = d._cells[y * nx + x];
        if (u > 0) sum += d.max * ((u / 255) ** 3);
      }
    }
    return sum;
  }

  buildLive() {
    if (this.liveGroup) { this.group.remove(this.liveGroup); this.disposeGroup(this.liveGroup); }
    const g = new THREE.Group();
    this.liveGroup = g;
    this.group.add(g);
    const places = ((this.liveDoc && this.liveDoc.places) || []).filter(
      (p) => p.position && p.official && p.official.populationRange,
    );
    const exag = this.getExagger();
    const rows = places.map((p) => {
      const pr = p.official.populationRange;
      const now = (pr.min + pr.max) / 2;
      const res = this.residentsAround(p.position.lat, p.position.lon);
      return {
        name: p.nameKo, lat: p.position.lat, lon: p.position.lon,
        now, level: p.official.level, rank: p.official.rank, color: p.official.color,
        res, ratio: res && res > 0 ? now / res : null,
      };
    });
    this.livePlaces = rows;
    if (!rows.length) return;
    const maxNow = Math.max(...rows.map((r) => r.now));
    const pos = new Float32Array(rows.length * 6);
    const col = new Float32Array(rows.length * 6);
    const ups = new Float32Array(rows.length * 6);
    const lens = new Float32Array(rows.length * 2);
    const p3 = new THREE.Vector3();
    const c = new THREE.Color();
    // 거주 기둥(분홍)과 구분되는 청록–호박 계열: '지금 있는 사람'
    rows.forEach((r, i) => {
      const t = Math.min(r.now / maxNow, 1);
      c.setHSL(0.47 - t * 0.35, 0.9, 0.5 + t * 0.16);
      const groundH = Math.max(this.heightAt(r.lat, r.lon), 0);
      const r0 = 1 + (groundH / R_M) * exag + 0.0009;
      llToV3(r.lat, r.lon, r0, p3);
      const up = p3.clone().normalize();
      const h = (0.004 + Math.sqrt(t) * 0.055) * (exag / 50);
      pos[i * 6] = p3.x; pos[i * 6 + 1] = p3.y; pos[i * 6 + 2] = p3.z;
      pos[i * 6 + 3] = p3.x; pos[i * 6 + 4] = p3.y; pos[i * 6 + 5] = p3.z;
      ups[i * 6] = up.x; ups[i * 6 + 1] = up.y; ups[i * 6 + 2] = up.z;
      ups[i * 6 + 3] = up.x; ups[i * 6 + 4] = up.y; ups[i * 6 + 5] = up.z;
      lens[i * 2] = 0;
      lens[i * 2 + 1] = h;
      col[i * 6] = c.r * 0.15; col[i * 6 + 1] = c.g * 0.15; col[i * 6 + 2] = c.b * 0.15;
      col[i * 6 + 3] = c.r; col[i * 6 + 4] = c.g; col[i * 6 + 5] = c.b;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aUp', new THREE.BufferAttribute(ups, 3));
    geo.setAttribute('aLen', new THREE.BufferAttribute(lens, 1));
    const mat = this.mat ? this.mat.clone() : null;
    if (mat) { mat.uniforms.uOpacity.value = 0.95; this.liveMat = mat; }
    const line = new THREE.LineSegments(geo, mat || new THREE.LineBasicMaterial({ vertexColors: true }));
    line.frustumCulled = false;
    g.add(line);
  }

  liveCardHtml() {
    const rows = this.livePlaces || [];
    if (!rows.length) return this.liveError || '서울 실시간 인구를 불러오지 못했습니다.';
    const withRatio = rows.filter((r) => r.ratio != null).sort((a, b) => b.ratio - a.ratio);
    const busiest = [...rows].sort((a, b) => b.now - a.now).slice(0, 4);
    const at = (this.liveDoc && this.liveDoc.generatedAt) || '';
    return `<b>거주 인구 × 지금 사람</b> — 두 데이터는 서로 다른 것을 잽니다. 그래서 더하지 않고 나란히 세웁니다.<br/>`
      + `<span style="color:#ec7aa6">분홍</span> = 그 칸에 <b>사는</b> 사람 (WorldPop 2025 격자) · `
      + `<span style="color:#57d8c8">청록~호박</span> = 그 장소에 <b>지금 있는</b> 사람 (서울시 실시간 관측)<br/>`
      + `<b>지금 가장 많은 곳</b><br/>${busiest.map((r) => `· ${r.name} — ${Math.round(r.now).toLocaleString()}명 (${r.level})`).join('<br/>')}<br/>`
      + (withRatio.length
        ? `<b>거주 인구 대비 지금 사람이 많은 순</b> (${this.windowKmText()} 거주 인구 대비)<br/>`
          + `${withRatio.slice(0, 4).map((r) => `· ${r.name} — <b>${r.ratio.toFixed(2)}배</b> (지금 ${Math.round(r.now).toLocaleString()}명 / 거주 ${Math.round(r.res).toLocaleString()}명)`).join('<br/>')}<br/>`
          + (withRatio[0].ratio < 1
            ? `※ 서울은 모든 장소가 1배 아래입니다 — 한 지점에 모인 사람보다 그 ${this.windowKmText()} 안에 사는 사람이 더 많다는 뜻이지, 그 장소가 한산하다는 뜻이 아닙니다.<br/>`
            : '')
        : '')
      + `<b>배율은 파생값(DERIVED)입니다</b> — 장소의 실제 면적이 공개되지 않아 ${this.windowKmText()} 격자와 비교한 근사입니다. 관측 인원과 거주 인구는 각각 원값 그대로입니다.<br/>`
      + `출처 서울특별시 실시간 인구데이터 · ${at ? at.replace('T', ' ').slice(0, 16) : ''} · 거주 격자 WorldPop CC BY 4.0`;
  }

  // 카메라가 가까워질수록 기둥을 짧게 — 국가 뷰는 마천루, 도시 뷰는 촘촘한 막대그래프.
  // 데이터는 그대로고 표현 높이만 시점에 맞춘다.
  updateScale(altKm) {
    if (!this.mat) return;
    const t = Math.min(Math.max((altKm - 60) / 760, 0), 1); // 60km 이하 = 최소, 820km 이상 = 최대
    const s = 0.045 + t * 0.955;
    this.mat.uniforms.uScale.value = s;
    this.mat.uniforms.uOpacity.value = 0.5 + (1 - t) * 0.22; // 가까울수록 또렷하게
    if (this.liveMat) this.liveMat.uniforms.uScale.value = s;
  }

  // 매 프레임: 봉우리 라벨을 화면 좌표로 투영 (지구 뒤편은 감춘다)
  updateLabels(camera) {
    if (!this.on || !this.peaks.length) {
      for (const el of this.labelPool) el.style.display = 'none';
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const camDir = camera.position.clone().normalize();
    this.peaks.forEach((p, i) => {
      let el = this.labelPool[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'sc-peak';
        this.peakWrap.appendChild(el);
        this.labelPool[i] = el;
      }
      llToV3(p.lat, p.lon, 1, this._v);
      if (this._v.dot(camDir) < 0.15) { el.style.display = 'none'; return; }
      this._v.project(camera);
      if (Math.abs(this._v.x) > 1 || Math.abs(this._v.y) > 1) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.left = `${(this._v.x * 0.5 + 0.5) * W}px`;
      el.style.top = `${(-this._v.y * 0.5 + 0.5) * H}px`;
      // 셀은 집계 후 1km가 아닐 수 있다 — 실제 셀 면적으로 나눠 km²당 값으로 적는다
      const perKm2 = this.cellAreaKm2 ? p.pop / this.cellAreaKm2 : p.pop;
      el.innerHTML = `<i></i><span>${(perKm2 / 1000).toFixed(1)}<em>천 명/km²</em></span>`;
    });
    for (let i = this.peaks.length; i < this.labelPool.length; i += 1) this.labelPool[i].style.display = 'none';
  }

  state() {
    if (!this.on) return { on: false };
    if (this.loading) return { on: true, note: '인구 격자 로딩 중…' };
    if (this.error) return { on: true, note: this.error };
    if (!this.doc) return { on: true, note: '국가를 선택하면 그 나라의 인구가 솟아오릅니다' };
    const d = this.doc;
    return { on: true, note: `${d.iso3} · ${d.nonzero.toLocaleString()}셀 · 총 ${(d.total / 1e6).toFixed(1)}백만` };
  }

  async toggle(iso3) {
    this.on = !this.on;
    this.group.visible = this.on;
    if (this.on) await this.loadIndex();
    if (this.on && iso3) await this.show(iso3);
    if (!this.on) this.clear();
    return { on: this.on };
  }

  clear() {
    for (const c of this.group.children.slice()) {
      this.group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    this.doc = null;
    this.iso3 = null;
    this.peaks = [];
    this.capEl.classList.remove('show');
    for (const el of this.labelPool) el.style.display = 'none';
  }

  // 준비된 나라 목록 — 파일에서 읽는다. 문구에 손으로 적으면 격자를 늘릴 때마다 거짓이 된다.
  async loadIndex() {
    if (this.index !== undefined) return this.index;
    this.index = null;
    try {
      const res = await fetch('./popgrid/index.json', { cache: 'no-cache' });
      if (res.ok) this.index = await res.json();
    } catch (e) { /* 목록이 없으면 목록 없이 안내한다 */ }
    return this.index;
  }

  readyCountriesText() {
    const rows = (this.index && this.index.countries) || [];
    if (!rows.length) return '';
    const names = rows.map((r) => r.nameKo).join('·');
    return `지금 준비된 ${rows.length}개국: ${names}. 다른 나라는 값을 지어내지 않고 비워 둡니다.`;
  }

  // 국가 선택이 바뀌면 호출된다. 준비된 나라가 아니면 조용히 비운다(가짜로 만들지 않음).
  async show(iso3, nameKo) {
    if (nameKo) this.pendingName = nameKo;
    if (!this.on || !iso3) return;
    if (this.iso3 === iso3 && this.doc) return;
    this.clear();
    this.iso3 = iso3;
    this.loading = true;
    this.error = null;
    try {
      let doc = this.cache[iso3];
      if (!doc) {
        const res = await fetch(GRID_URL(iso3), { cache: 'force-cache' });
        if (!res.ok) throw new Error(`준비된 인구 격자가 없습니다 (${iso3})`);
        doc = await res.json();
        doc._cells = await inflate(b64ToBytes(doc.data));
        this.cache[iso3] = doc;
      }
      this.doc = doc;
      this.build(doc);
      this.peaks = this.findPeaks(doc, doc._cells);
      this.setCaption(this.pendingName);
    } catch (e) {
      this.error = String((e && e.message) || e);
      this.doc = null;
    } finally {
      this.loading = false;
    }
  }

  // 10단계 등급 경계 (셀당 인구, 로그 간격). 상위 1%는 '넘침'으로 따로 처리한다.
  // 기둥을 무한정 높이지 않고 등급으로 끊어야 값이 읽힌다 (PD 지시).
  makeBreaks(doc, cells) {
    const hist = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < cells.length; i += 1) if (cells[i] > 0) { hist[cells[i]] += 1; n += 1; }
    const at = (q) => {
      let acc = 0;
      const want = n * q;
      for (let u = 1; u < 256; u += 1) {
        acc += hist[u];
        if (acc >= want) return doc.max * ((u / 255) ** 3);
      }
      return doc.max;
    };
    const lo = Math.max(at(0.10), 1);
    const hi = Math.max(at(0.99), lo * 10);
    const breaks = [];
    for (let k = 1; k <= 10; k += 1) {
      breaks.push(lo * ((hi / lo) ** ((k - 1) / 9)));
    }
    return breaks; // breaks[9] = 상위 1% 문턱 = 등급 10의 시작
  }

  build(doc) {
    const cells = doc._cells;
    const { nx, ny } = doc;
    const [cw, ch] = doc.cellDeg;
    const [lon0, lat0] = doc.originDeg;
    // 값 있는 셀만 세운다 — 빈 셀을 0으로 그리지 않는다
    const idx = [];
    for (let i = 0; i < cells.length; i += 1) if (cells[i] > 0) idx.push(i);
    if (!idx.length) return;
    const breaks = this.makeBreaks(doc, cells);
    this.breaks = breaks;
    // 셀 실면적(km²) — 집계 배수가 들어가 1km가 아닐 수 있으므로 위도 보정해 계산한다
    const midLat = lat0 - (ny / 2) * ch;
    this.cellKm = [cw * 111.32 * Math.cos((midLat * Math.PI) / 180), ch * 110.57];
    this.cellAreaKm2 = this.cellKm[0] * this.cellKm[1];
    const top = breaks[9];
    // 등급 계산 + 넘침 칸 수 (등급 10을 넘어선 만큼 옆에 칸을 더 세운다)
    const clsOf = (v) => {
      for (let k = 9; k >= 0; k -= 1) if (v >= breaks[k]) return k + 1;
      return 1;
    };
    // ── 밀집 언덕 규칙 (PD 지시) ────────────────────────────────
    // 셀이 9칸(3×3) 이상 붙어 뭉치면 그 덩어리를 낱개 말뚝이 아니라 언덕으로 만든다:
    //   ① 이웃 평균으로 완만하게 깎아 가장자리가 점차 낮아지고
    //   ② 그 안의 봉우리(국소 최댓값)는 한 단계 더 올려 가운데가 솟는다.
    // 등급 10을 넘는 값은 높이를 더 키우지 않고 바깥 고리로 퍼뜨린다 — 넘칠수록 넓어진다.
    const clsArr = new Uint8Array(nx * ny);
    const valArr = new Float32Array(nx * ny);
    for (const i of idx) {
      const v = doc.max * ((cells[i] / 255) ** 3);
      valArr[i] = v;
      clsArr[i] = clsOf(v);
    }
    const at = (x, y) => ((x < 0 || y < 0 || x >= nx || y >= ny) ? 0 : clsArr[y * nx + x]);
    const disp = new Uint8Array(nx * ny);
    const dense = new Uint8Array(nx * ny);
    for (const i of idx) {
      const x = i % nx;
      const y = (i / nx) | 0;
      let sum = 0;
      let cnt = 0;
      let isMax = true;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const c2 = at(x + dx, y + dy);
          if (c2 > 0) { sum += c2; cnt += 1; }
          if ((dx || dy) && c2 > clsArr[i]) isMax = false;
        }
      }
      dense[i] = cnt >= 9 ? 1 : 0;           // 3×3이 꽉 찬 밀집 덩어리
      const avg = cnt ? sum / cnt : clsArr[i];
      // 밀집 구간만 완만하게 (성긴 곳은 원래 등급을 지킨다)
      let d = dense[i] ? (clsArr[i] * 0.55 + avg * 0.45) : clsArr[i];
      if (dense[i] && isMax) d += 1;          // 덩어리의 가운데를 한 단계 더
      disp[i] = Math.max(1, Math.min(10, Math.round(d)));
    }

    const RING = [ // 고리별 방향 (셀 크기 배수) — 넘칠수록 바깥으로 넓어진다
      [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]],
      [[1.0, 0], [-1.0, 0], [0, 1.0], [0, -1.0], [0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]],
      [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]],
    ];
    const stacks = [];    // [{lat, lon, cls}] — 실제로 세울 기둥 목록
    let overflowCells = 0;
    let denseCells = 0;
    for (const i of idx) {
      const x = i % nx;
      const y = (i / nx) | 0;
      const lon = lon0 + (x + 0.5) * cw;
      const lat = lat0 - (y + 0.5) * ch;
      stacks.push({ lat, lon, cls: disp[i] });
      if (dense[i]) denseCells += 1;
      const v = valArr[i];
      if (v > top) {
        // 넘친 배수만큼 고리를 늘리고, 고리가 멀어질수록 낮아진다 (언덕 자락)
        const rings = Math.min(RING.length, Math.max(1, Math.round(Math.log2(v / top) + 1)));
        overflowCells += 1;
        for (let r = 0; r < rings; r += 1) {
          const cls = Math.max(2, 10 - (r + 1) * 2);
          for (const [ox, oy] of RING[r]) {
            stacks.push({ lat: lat + oy * ch, lon: lon + ox * cw, cls });
          }
        }
      }
    }
    this.overflowCells = overflowCells;
    this.denseCells = denseCells;
    this.stackCount = stacks.length;

    const exag = this.getExagger();
    // 인구 표현 높이: 지형 과장과 같은 축척계로 환산해 지형 위로 솟게 한다.
    // u8 자체가 이미 세제곱근 정규화라, 화면 높이는 u8에 선형으로 대응시킨다.
    // 등급 10칸의 최대 높이 — 여기서 잘린다. 더 큰 값은 옆 칸으로 표현한다.
    const H_MAX = (0.030 * exag) / 50;
    const n = stacks.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const ups = new Float32Array(n * 6); // 각 정점의 지역 수직 (윗점만 밀어올린다)
    const lens = new Float32Array(n * 2);
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let k = 0; k < n; k += 1) {
      const s = stacks[k];
      const u = s.cls / 10; // 등급(1~10)이 곧 높이·색 단계
      const groundH = Math.max(this.heightAt(s.lat, s.lon), 0);
      const r0 = 1 + (groundH / R_M) * exag + 0.0008;
      llToV3(s.lat, s.lon, r0, p);
      const up = p.clone().normalize();
      const h = 0.0006 + u * H_MAX;
      rampAt(u, c);
      // 아래 점은 지표 고정, 위 점은 셰이더가 uScale만큼 밀어올린다
      pos[k * 6] = p.x; pos[k * 6 + 1] = p.y; pos[k * 6 + 2] = p.z;
      pos[k * 6 + 3] = p.x; pos[k * 6 + 4] = p.y; pos[k * 6 + 5] = p.z;
      ups[k * 6] = up.x; ups[k * 6 + 1] = up.y; ups[k * 6 + 2] = up.z;
      ups[k * 6 + 3] = up.x; ups[k * 6 + 4] = up.y; ups[k * 6 + 5] = up.z;
      lens[k * 2] = 0;
      lens[k * 2 + 1] = h;
      // 바닥은 거의 잠기고 끝만 발광 — 세로 그라데이션이 조각의 부피감을 만든다
      col[k * 6] = c.r * 0.10; col[k * 6 + 1] = c.g * 0.10; col[k * 6 + 2] = c.b * 0.14;
      col[k * 6 + 3] = c.r; col[k * 6 + 4] = c.g; col[k * 6 + 5] = c.b;
    }
    // 최고 셀은 등급이 아니라 원값으로 찾는다 (라벨에 실제 인구를 적기 위해)
    let peak = null;
    for (const i of idx) {
      if (!peak || cells[i] > peak.u) {
        const x = i % nx;
        const y = (i / nx) | 0;
        peak = { u: cells[i], lat: lat0 - (y + 0.5) * ch, lon: lon0 + (x + 0.5) * cw };
      }
    }
    this.peak = peak;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aUp', new THREE.BufferAttribute(ups, 3));
    g.setAttribute('aLen', new THREE.BufferAttribute(lens, 1));
    // 높이를 유니폼으로 조절한다 — 도시로 줌인하면 기둥이 짧아져 그래프처럼 촘촘히 읽힌다.
    // (가산혼합은 겹쳐서 흰 덩어리로 포화되므로 일반 혼합 + 낮은 불투명도)
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 }, uOpacity: { value: 0.5 } },
      vertexShader: /* glsl */ `
        attribute vec3 aUp;
        attribute float aLen;
        attribute vec3 color;
        uniform float uScale;
        varying vec3 vC;
        void main() {
          vec3 p = position + aUp * (aLen * uScale);
          vC = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vC;
        void main() {
          gl_FragColor = vec4(vC, uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    const line = new THREE.LineSegments(g, this.mat);
    line.frustumCulled = false;
    this.group.add(line);
    this.group.visible = this.on;
  }

  cardHtml() {
    const d = this.doc;
    if (!d) {
      const ready = this.readyCountriesText();
      return this.error
        ? `${this.error}${ready ? `<br/>${ready}` : ''}`
        : `지구에서 국가를 클릭하면 그 나라의 인구가 국경 안쪽에서 솟아오릅니다.${ready ? `<br/>${ready}` : ''}`;
    }
    const peakPop = this.peak ? d.max * ((this.peak.u / 255) ** 3) : null;
    return `<b>인구 데이터 조각</b> — 국경선이 아니라 <b>실제 인구 격자</b>가 나라의 모양을 만듭니다.<br/>`
      + `격자 ${d.nx}×${d.ny} · 한 칸 ${this.cellKm ? `${this.cellKm[0].toFixed(1)}×${this.cellKm[1].toFixed(1)}km` : '—'} · 값 있는 셀 ${d.nonzero.toLocaleString()}개<br/>`
      + `총인구 <b>${d.total.toLocaleString()}명</b> · 최대 셀 <b>${Math.round(d.max).toLocaleString()}명</b>`
      + `${this.peak ? ` (${this.peak.lat.toFixed(2)}°, ${this.peak.lon.toFixed(2)}° 부근 ≈ ${Math.round(peakPop).toLocaleString()}명)` : ''}<br/>`
      + `높이는 표현용 <b>세제곱근</b> 변환입니다 — 선형이면 최대 도시만 남고 나머지가 사라집니다. 위 수치가 실제 값입니다.<br/>`
      + `출처 ${d.source} · ${d.license}`;
  }

  // 지형 과장이 바뀌면 같은 데이터로 다시 세운다
  rebuild() {
    if (!this.doc) return;
    const doc = this.doc;
    for (const c of this.group.children.slice()) {
      this.group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    this.build(doc);
  }
}
