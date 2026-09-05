// EARTHUS v2-three — 여행 씬 (TRAVEL DISCOVERY · 한국관광 데이터랩 출품 모듈)
//
// 유명한 곳 검색이 아니라 오늘 갈 곳을 데이터로 발견한다.
//   · 시군구 228곳 비콘 — 밝기 = 오늘 점수 (근거 5줄이 카드에 전부 보인다)
//   · 목적별: 무장애 · 웰니스 · 외국인(영문) · 방문자 스냅샷
//   · 하드게이트: 기상청 특보 발효 · 에어코리아 나쁨이면 후보에서 빼고, 뺐다고 적는다
//
// 데이터: data/tourism/kto-discovery.json (tools/build_kto_discovery.py 가 KTO 공개 산출물을 집계)
//        + 실시간 게이트 kma-warn.json · korea-air-obs.json (1.0 S3 캐시)
// 원칙: 값을 만들지 않는다. 라벨은 EARTHUS DISCOVERY — KTO 공식 추천이 아니다.
//       방문자수는 이동통신 기반이라 관광객이 아니다. 그 문구를 화면에 그대로 둔다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { renderBadge } from './engine-bridge.js?v=15';
import { TRAVEL_CATALOGS, ACCESSIBILITY_LABELS, TRAVEL_INTRO_LABELS, safeSourceUrl, validateTravelCatalog, searchTravelCatalog,
  detailSummaryUrl, validateTravelDetailSummary, providerPlainText, providerHomepage } from './travel-catalog.js';

const S3 = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const DATA_URL = './data/tourism/kto-discovery.json';
const R_M = 6371000;
const D2R = Math.PI / 180;
const ACCENT = 0xf2a2c4;

const llToV3 = (lat, lon, r) => {
  const la = lat * D2R; const lo = lon * D2R; const cl = Math.cos(la);
  return new THREE.Vector3(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
};
const distKm = (a, b) => {
  const dLa = (b.lat - a.lat) * D2R; const dLo = (b.lon - a.lon) * D2R;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, x)));
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('ko-KR'));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

const MODES = Object.freeze({
  discover: { title: '오늘 발견', key: 'score' },
  bf: { title: '무장애 여행지', key: 'barrierFree' },
  wl: { title: '웰니스 관광지', key: 'wellness' },
  en: { title: '영문 콘텐츠', key: 'english' },
  visitors: { title: '방문자 스냅샷', key: 'visitorsDomestic' },
});

let dotTex = null;
const getDotTex = () => {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.3)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
};

const makeLabel = (text, color) => {
  const probe = document.createElement('canvas').getContext('2d');
  const font = '600 28px "Noto Sans KR", -apple-system, sans-serif';
  probe.font = font;
  const c = document.createElement('canvas');
  c.width = Math.ceil(probe.measureText(text).width) + 20; c.height = 42;
  const g = c.getContext('2d');
  g.font = font; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 8;
  g.fillStyle = color; g.fillText(text, 10, 21);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false }));
  spr.scale.set((c.width / c.height) * 0.026, 0.026, 1);
  spr.center.set(-0.12, 0.5);
  return spr;
};

export class TravelScene {
  constructor(scene, heightAt, getExagger) {
    this.heightAt = heightAt;
    this.getExagger = getExagger;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.data = null;
    this.gates = { warn: null, air: null, at: 0 };
    this.mode = null;       // 켜져 있는 모드 (하나만)
    this.selected = null;
    this.labels = [];
    this.loading = null;
    this.catalogs = new Map();
    this.catalog = null;
    this.query = ''; this.page = 0; this.selectedPlace = null;
    this.requestId = 0; this.controller = null; this.error = null; this.busy = false;
    this.detailCache = new Map(); this.detailRequest = 0; this.detailController = null;
    if (!document.getElementById('travel-catalog-css')) {
      const link = document.createElement('link'); link.id = 'travel-catalog-css'; link.rel = 'stylesheet';
      link.href = new URL('./travel-catalog.css', import.meta.url).href; document.head.appendChild(link);
    }
  }

  // ---------------------------------------------------------------- 로드
  async ensure() {
    if (this.data) return this.data;
    if (!this.loading) {
      this.loading = (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const res = await fetch(DATA_URL, { cache: 'no-store', signal: controller.signal });
          if (!res.ok) throw new Error(`발견 데이터 HTTP ${res.status}`);
          const d = await res.json();
          d.regions.forEach((r, i) => { r.i = i; });
          this.data = d;
          return d;
        } finally { clearTimeout(timeout); }
      })().finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  // 실시간 게이트: 특보(기상청) · 대기질(에어코리아). 5분 캐시.
  async ensureGates(signal) {
    if (Date.now() - this.gates.at < 5 * 60 * 1000 && (this.gates.warn || this.gates.air)) return this.gates;
    const get = async (p, ms) => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (signal?.aborted) cancel();
      signal?.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(cancel, ms);
      try {
        const r = await fetch(`${S3}${p}`, { cache: 'no-store', signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { return { __error: String((e && e.message) || e) }; }
      finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
    };
    const [warn, air] = await Promise.all([get('/events/kma-warn.json', 15000), get('/wind/korea-air-obs.json', 20000)]);
    if (signal?.aborted) throw new Error('지역 자료 요청이 취소되었습니다.');
    this.gates = { warn, air, at: Date.now() };
    return this.gates;
  }

  // 시군구 하나의 게이트 판정 — 근거를 그대로 돌려준다 (값 생성 없음)
  gateFor(r) {
    const out = { warn: null, air: null, blocked: false };
    const w = this.gates.warn;
    if (w && !w.__error) {
      const hits = (w.active || []).filter((a) => {
        const reg = String(a.region || ''); const par = String(a.parent || '');
        return reg.includes(r.nameKo) || (par && r.province.startsWith(par.slice(0, 2)) && reg.includes(r.nameKo.replace(/[시군구]$/, '')));
      }).sort((a, b) => (b.levelRank || 0) - (a.levelRank || 0));
      if (hits.length) { out.warn = hits[0]; out.blocked = true; }
    }
    const a = this.gates.air;
    if (a && !a.__error) {
      const st = (a.stations || a.items || []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
      let best = null; let bd = 1e9;
      for (const s of st) { const d = distKm(r, s); if (d < bd) { bd = d; best = s; } }
      if (best && bd < 40) {
        const pm25 = Number(best.pm25);
        const pm10 = Number(best.pm10);
        out.air = {
          station: best.name || '', km: bd, at: best.at || '',
          pm25: Number.isFinite(pm25) ? pm25 : null, pm10: Number.isFinite(pm10) ? pm10 : null,
          gradeKo: best.gradeKo || '', pm25Grade: Number(best.pm25Grade) || null, pm10Grade: Number(best.pm10Grade) || null,
        };
        // 등급은 에어코리아가 매긴 것을 그대로 쓴다 (1 좋음 · 2 보통 · 3 나쁨 · 4 매우나쁨). 3 이상이면 제외.
        if ((out.air.pm25Grade != null && out.air.pm25Grade >= 3) || (out.air.pm10Grade != null && out.air.pm10Grade >= 3)) out.blocked = true;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- 점수
  // 오늘 점수 = 목적 밀도(무장애·웰니스·영문, 로그) 0.6 + 덜 붐빔(외지인 방문자 스냅샷 역순) 0.4
  // 게이트에 걸리면 0. 성분은 카드에 전부 보인다 — 숨은 가중치가 없다.
  computeScores() {
    const rs = this.data.regions;
    const dens = rs.map((r) => Math.log1p(r.barrierFree + r.wellness * 4 + r.english * 0.3));
    const dMax = Math.max(...dens, 1e-6);
    const dom = rs.map((r) => (r.visitors && Number.isFinite(r.visitors.domestic) ? r.visitors.domestic : null));
    const domVals = dom.filter((v) => v != null);
    const domSorted = [...domVals].sort((a, b) => a - b);
    const rank = (v) => (v == null ? null : domSorted.findIndex((x) => x >= v) / Math.max(1, domSorted.length - 1));
    rs.forEach((r, i) => {
      const density = dens[i] / dMax;
      const rk = rank(dom[i]);
      const quiet = rk == null ? 0.5 : 1 - rk;          // 방문자 없으면 중립 0.5 (지어내지 않음)
      const gate = this.gateFor(r);
      r.components = { density, quiet, quietKnown: rk != null, gate };
      r.score = gate.blocked ? 0 : clamp(0.6 * density + 0.4 * quiet, 0, 1);
      r.visitorsDomestic = dom[i] == null ? 0 : dom[i];
    });
  }

  // ---------------------------------------------------------------- 그리기
  async setMode(mode) {
    if (!MODES[mode]) throw new Error('알 수 없는 여행 메뉴입니다.');
    const id = ++this.requestId;
    this.controller?.abort(); this.controller = new AbortController();
    this.detailController?.abort(); this.detailRequest = (this.detailRequest || 0) + 1;
    if (this.mode === mode) {
      this.mode = null; this.busy = false; this.catalog = null; this.group.visible = false; this.clear();
      return { on: false };
    }
    this.mode = mode;
    this.query = ''; this.page = 0; this.selectedPlace = null; this.selected = null;
    this.catalog = null; this.error = null; this.busy = true; this.group.visible = false; this.clear();
    const controller = this.controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      if (TRAVEL_CATALOGS[mode]) {
        if (!this.catalogs.has(mode)) {
          const response = await fetch(new URL(`../data/tourism/${TRAVEL_CATALOGS[mode].file}`, import.meta.url), { signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const catalog = validateTravelCatalog(await response.json(), mode);
          if (id !== this.requestId) return { stale: true };
          this.catalogs.set(mode, catalog);
        }
        this.catalog = this.catalogs.get(mode);
      } else {
        await this.ensure();
        if (id !== this.requestId) return { stale: true };
        await this.ensureGates(controller.signal);
        if (id !== this.requestId) return { stale: true };
        this.computeScores();
      }
      if (id !== this.requestId) return { stale: true };
      this.busy = false; this.build(); this.group.visible = true;
      return { on: true };
    } catch (error) {
      if (id !== this.requestId) return { stale: true };
      this.busy = false; this.error = error; this.catalog = null; this.group.visible = false;
      return { on: true, error: true };
    } finally { clearTimeout(timeout); }
  }

  async retry() { const mode = this.mode; if (!mode) return { stale: true }; this.mode = null; this.catalogs.delete(mode); return this.setMode(mode); }
  get title() { return TRAVEL_CATALOGS[this.mode]?.title || MODES[this.mode]?.title || '여행'; }
  get badge() { return this.error ? 'UNAVAILABLE' : this.busy ? 'LOADING' : TRAVEL_CATALOGS[this.mode] ? 'OFFICIAL_INFORMATION' : this.mode === 'visitors' ? 'HISTORY' : 'DERIVED'; }

  surfR(lat, lon, lift = 0.004) {
    const h = Math.max(this.heightAt(lat, lon), 0);
    return 1 + (h / R_M) * this.getExagger() + lift;
  }

  clear() {
    for (let i = this.group.children.length - 1; i >= 0; i -= 1) {
      const o = this.group.children[i]; this.group.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map && o.material.map !== dotTex) o.material.map.dispose(); o.material.dispose(); }
    }
    this.labels = [];
  }

  build() {
    this.clear();
    if (this.catalog) { this.buildPlaces(); return; }
    const key = MODES[this.mode].key;
    const rs = this.data.regions;
    const vals = rs.map((r) => Number(r[key]) || 0);
    const vMax = Math.max(...vals, 1e-6);
    const pos = new Float32Array(rs.length * 3);
    const col = new Float32Array(rs.length * 3);
    const c = new THREE.Color();
    rs.forEach((r, i) => {
      const v = llToV3(r.lat, r.lon, this.surfR(r.lat, r.lon));
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const t = this.mode === 'discover' ? vals[i] : Math.sqrt(vals[i] / vMax);
      const blocked = this.mode === 'discover' && r.components && r.components.gate.blocked;
      if (blocked) c.setRGB(0.35, 0.22, 0.28);               // 게이트에 걸린 곳: 어둡게, 지우지 않는다
      else c.setRGB(0.30 + 0.70 * t, 0.22 + 0.42 * t, 0.36 + 0.44 * t);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.group.add(new THREE.Points(g, new THREE.PointsMaterial({
      size: 7, sizeAttenuation: false, vertexColors: true, map: getDotTex(), alphaTest: 0.05,
      transparent: true, opacity: 0.95, depthWrite: false,
    })));
    // 웰니스 모드는 202개 실제 지점도 함께
    if (this.mode === 'wl') {
      const pts = this.data.wellnessPoints || [];
      const p2 = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => { const v = llToV3(p.lat, p.lon, this.surfR(p.lat, p.lon, 0.003)); p2[i * 3] = v.x; p2[i * 3 + 1] = v.y; p2[i * 3 + 2] = v.z; });
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(p2, 3));
      this.group.add(new THREE.Points(g2, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, color: 0xfff0f6, map: getDotTex(), alphaTest: 0.05, transparent: true, opacity: 0.85, depthWrite: false })));
    }
    // 라벨: 상위 10곳
    const order = rs.map((r, i) => [vals[i], i]).sort((a, b) => b[0] - a[0]).slice(0, 10);
    order.forEach(([v, i]) => {
      if (v <= 0) return;
      const r = rs[i];
      const lab = makeLabel(r.nameKo, '#F2A2C4');
      lab.position.copy(llToV3(r.lat, r.lon, this.surfR(r.lat, r.lon, 0.007)));
      this.group.add(lab); this.labels.push(lab);
    });
  }

  onExaggerChanged() { if (this.mode && !this.busy && !this.error && (this.data || this.catalog)) this.build(); }

  update(camera) {
    if (!this.mode || this.busy || this.error || (!this.data && !this.catalog)) return;
    // 지형 과장이 바뀌면 점이 산에 묻히거나 뜬다 — 스스로 감지해 다시 배치한다
    const ex = this.getExagger();
    if (ex !== this._lastEx) { this._lastEx = ex; this.build(); }
    if (!this.labels.length) return;
    const cam = camera.position.clone().normalize();
    this.labels.forEach((l) => { l.visible = l.position.clone().normalize().dot(cam) > 0.3; });
  }

  pick(lat, lon, maxKm = 35) {
    if (!this.mode || this.busy || this.error) return null;
    if (this.catalog) {
      let best = null, distance = maxKm;
      for (const item of this.pageResult.items) {
        if (!item.location) continue;
        const km = distKm({ lat, lon }, { lat: item.location[0], lon: item.location[1] });
        if (km < distance) { distance = km; best = item; }
      }
      if (!best) return null;
      this.selectedPlace = best; this.selected = { ...best, nameKo: best.title, province: best.address, lat: best.location[0], lon: best.location[1], _travelPlace: true };
      return this.selected;
    }
    if (!this.data) return null;
    let best = null; let bd = maxKm;
    for (const r of this.data.regions) { const d = distKm({ lat, lon }, r); if (d < bd) { bd = d; best = r; } }
    if (best) this.selected = best;
    return best;
  }

  get top() {
    if (!this.data) return [];
    return [...this.data.regions].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8);
  }

  // ---------------------------------------------------------------- 카드
  provLine(svc) {
    const p = this.data && this.data.provenance && this.data.provenance[svc];
    if (!p) return '';
    return `${esc(p.sourceName || svc)} · ${p.itemCount != null ? n(p.itemCount) + '건' : ''} · 수집 ${esc((p.fetchedAt || '').slice(0, 10))}`;
  }

  sceneCard() {
    if (this.busy) return this.loadingCard(this.mode);
    if (this.error) return `<section class="card tv-catalog"><div class="card-h">${esc(this.title)}</div><div class="card-b"><p role="status">관광지 목록을 불러오지 못했습니다.</p><p>자료가 없는 지역이라는 뜻은 아닙니다. 다시 불러오거나 공식 자료를 확인하세요.</p><button type="button" class="tv-button" data-action="travel-retry">다시 불러오기</button><p><a href="https://www.data.go.kr/" target="_blank" rel="noopener noreferrer">공공데이터포털에서 원자료 확인</a></p></div></section>`;
    if (this.catalog) return this.selectedPlace ? this.placeCard(this.selectedPlace) : this.catalogCard();
    if (!this.data) return '';
    if (this.mode === 'visitors') return this.visitorsCard();
    const top = this.top.map((r) => `<div class="stat"><span class="k">${esc(r.nameKo)} <span style="opacity:.6">${esc(r.province.slice(0, 2))}</span></span><span class="v">${(r.score * 100).toFixed(0)}</span></div>`).join('');
    const blocked = this.data.regions.filter((r) => r.components && r.components.gate.blocked).length;
    const title = MODES[this.mode] ? MODES[this.mode].title : '여행';
    return `<div class="card"><div class="card-h">${esc(title)} <span class="badge sim">EARTHUS DISCOVERY</span></div>
      <div class="card-b">
        시군구 <b>${n(this.data.regions.length)}곳</b>을 데이터랩 5종 + 기상청 특보 + 에어코리아로 매일 다시 점수 매깁니다.
        점수 = 목적 밀도 0.6 + 덜 붐빔 0.4. 특보 발효·미세먼지 나쁨은 후보에서 뺍니다 — 지금 <b>${blocked}곳</b> 제외.
        <div class="stats" style="margin-top:8px">${top}</div>
        <div style="margin-top:8px;opacity:.7;font-size:10.5px;line-height:1.5">
          ${esc(this.data.notes.label)}<br/>${esc(this.data.notes.visitors)}<br/>
          배정 ${esc(this.data.assignment)}
        </div>
      </div></div>`;
  }

  regionCard(r) {
    if (r._travelPlace) return this.placeCard(r);
    const c = r.components || { density: 0, quiet: 0.5, quietKnown: false, gate: { blocked: false } };
    const g = c.gate || {};
    const v = r.visitors;
    const rows = [
      [`무장애 여행지 <b>${n(r.barrierFree)}곳</b>${r.barrierFreeSample && r.barrierFreeSample.length ? ` — ${r.barrierFreeSample.map(esc).join(' · ')}` : ''}`, 'OFFICIAL_OBSERVATION', this.provLine('barrierFree')],
      [`웰니스 관광지 <b>${n(r.wellness)}곳</b>`, 'OFFICIAL_OBSERVATION', this.provLine('wellness')],
      [`영문 관광정보 <b>${n(r.english)}건</b> — 외국인 개별관광객(FIT)에게 바로 보여줄 수 있는 양`, 'OFFICIAL_OBSERVATION', this.provLine('english')],
      // 집계 방식을 그대로 적는다 — 하루치인지 며칠 평균인지 숨기면 "언제 것인지 틀린 숫자"가 된다
      [v
        ? `방문자 ${v.aggregation === 'MEAN_PER_DAY' ? '일평균' : '스냅샷'} 외지인 <b>${n(Math.round(v.domestic))}</b> · 현지인 ${n(Math.round(v.local))} · 외국인 ${n(Math.round(v.foreign))}`
          + ` <span style="opacity:.7">(${esc(v.date)}${v.weekday ? ` ${esc(v.weekday)}` : ''}${v.dayCount > 1 ? ` · ${v.dayCount}일 평균` : ''})</span>`
          + ` → 덜 붐빔 ${(c.quiet * 100).toFixed(0)}/100`
        : '방문자 자료 없음 — 덜 붐빔은 중립 50/100 (지어내지 않음)',
      'HISTORY', `${this.provLine('visitors')} · 이동통신 기반, 관광객 아님`],
      [g.warn ? `<b>특보 발효 — ${esc(g.warn.region)} ${esc(g.warn.kind)} ${esc(g.warn.level)}</b> → 후보 제외` : '발효 특보 없음', 'OFFICIAL_WARNING', '기상청 특보 · 1.0 S3 캐시'],
      [g.air ? `대기질 ${esc(g.air.station)} PM2.5 <b>${g.air.pm25 ?? '—'}</b> · PM10 ${g.air.pm10 ?? '—'} (${g.air.km.toFixed(0)} km)${g.blocked && !g.warn ? ' → 나쁨, 후보 제외' : ''}` : '40 km 안 측정소 없음 — 판단하지 않음', 'OFFICIAL_OBSERVATION', '에어코리아 · 한국환경공단'],
    ];
    const lines = rows.map(([txt, kind, src]) => `<div class="tv-line">${renderBadge(kind)}<div><div>${txt}</div><div class="tv-src">${src}</div></div></div>`).join('');
    return `<div class="card"><div class="card-h">${esc(r.nameKo)} <span style="opacity:.6;font-weight:400">${esc(r.province)}</span> <span class="badge sim">EARTHUS DISCOVERY</span></div>
      <div class="card-b">
        <div class="tv-score">오늘 점수 <b>${(r.score * 100).toFixed(0)}</b><span>/100</span> <span style="opacity:.7">= 목적 밀도 ${(c.density * 100).toFixed(0)} × 0.6 + 덜 붐빔 ${(c.quiet * 100).toFixed(0)} × 0.4${g.blocked ? ' · 게이트 제외' : ''}</span></div>
        <div class="tv-why">왜 지금</div>
        ${lines}
      </div></div>`;
  }

  loadingCard(mode) {
    return `<section class="card tv-catalog" aria-busy="true"><div class="card-h">${esc(TRAVEL_CATALOGS[mode]?.title || MODES[mode]?.title || '여행')}</div><div class="card-b" role="status">${TRAVEL_CATALOGS[mode] ? '관광지 목록을 불러오고 있습니다.' : '지역 자료와 현재 특보·대기질을 확인하고 있습니다.'}</div></section>`;
  }

  get pageResult() { return searchTravelCatalog(this.catalog, this.query, this.page); }

  sourceFooter() {
    const catalog = this.catalog;
    const link = safeSourceUrl(catalog.sourceUrl);
    const at = new Date(catalog.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
    return `<div class="tv-catalog-source">출처 ${esc(catalog.sourceName)}<br/>수집 ${esc(at)} KST · 공식 관광정보 스냅샷</div>
      <details class="tv-provenance"><summary>자료 범위와 출처 보기</summary><p>원본 ${n(catalog.sourceItemCount)}건 중 공개 표시된 콘텐츠 ${n(catalog.items.length)}건. 숨김 콘텐츠와 중복 ID는 목록에서 제외했습니다. 운영시간·입장 가능 여부는 이 목록에 포함되지 않습니다.</p>
      ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">한국관광공사 원자료 안내</a>` : ''}<p>사진은 사용하지 않았습니다. 장소별 공공누리 코드가 제공되면 상세에 보존합니다.</p></details>`;
  }

  catalogCard() {
    return `<section class="card tv-catalog"><div class="card-h">${esc(this.title)} <span class="badge">공식 관광정보</span></div><div class="card-b">
      <p>${this.mode === 'bf' ? `장소를 선택하면 주소와 수집된 무장애 항목을 확인할 수 있습니다. ${this.catalog.detailState === 'NOT_FETCHED' ? '현재 시설별 접근성 항목은 미수집 상태입니다.' : '시설별 접근성 항목은 수집된 장소에서만 표시합니다.'}` : this.mode === 'wl' ? '한국관광공사 웰니스 목록의 실제 장소입니다. 장소를 선택해 주소와 위치를 확인하세요.' : '한국관광공사가 제공한 영문 명칭과 주소입니다. 영문 장소명·지역명으로 검색하세요.'}</p>
      <label class="tv-search-label" for="travel-query">관광지 이름·주소 검색</label>
      <input id="travel-query" class="tv-query" type="search" maxlength="160" value="${esc(this.query)}" placeholder="${this.mode === 'en' ? 'Seoul, Busan, museum…' : '예: 제주, 박물관, 온천'}" data-action="travel-query" autocomplete="off" aria-controls="travel-results"/>
      <div id="travel-results">${this.resultsHtml()}</div>${this.sourceFooter()}</div></section>`;
  }

  resultsHtml() {
    const result = this.pageResult; this.page = result.page;
    const rows = result.items.map(item => `<li><button class="tv-place" type="button" data-action="travel-item" data-id="${esc(item.id)}"><strong${this.mode === 'en' ? ' lang="en"' : ''}>${esc(item.title)}</strong><span>${esc(item.address || '주소 정보 미수집')}${item.location ? '' : ' · 좌표 없음'}</span></button></li>`).join('');
    return `<p class="tv-result-count" id="travel-result-count" role="status" aria-live="polite" tabindex="-1">검색 결과 ${n(result.total)}곳${result.total ? ` · ${n(result.page * result.pageSize + 1)}–${n(result.page * result.pageSize + result.items.length)}번째` : ''}</p>
      ${result.total ? `<ul class="tv-places">${rows}</ul><div class="tv-pagination"><button type="button" class="tv-button" data-action="travel-page" data-page="${result.page - 1}" ${result.page === 0 ? 'disabled' : ''}>이전 목록</button><span>${result.page + 1} / ${result.pages}</span><button type="button" class="tv-button" data-action="travel-page" data-page="${result.page + 1}" ${result.page + 1 >= result.pages ? 'disabled' : ''}>다음 목록</button></div><p class="tv-map-note">지도에는 이 페이지에서 좌표가 있는 장소를 표시합니다.</p>` : '<p>일치하는 관광지가 없습니다. 검색어를 줄이거나 다른 지역명으로 찾아보세요.</p>'}`;
  }

  placeCard(item) {
    if (!this.catalog) return '';
    const position = item.location;
    return `<section class="card tv-catalog"><div class="card-b"><button type="button" class="tv-button" data-action="travel-list">← 검색 목록으로</button>
      <h3 id="travel-place-title" tabindex="-1"${this.mode === 'en' ? ' lang="en"' : ''}>${esc(item.title)}</h3><span class="badge">${esc(this.title)} · 공식 관광정보</span>
      <dl class="tv-facts"><dt>주소</dt><dd${this.mode === 'en' ? ' lang="en"' : ''}>${esc(item.address || '주소 정보 미수집')}</dd><dt>위치</dt><dd>${position ? `${position[0].toFixed(5)}°, ${position[1].toFixed(5)}°` : '좌표 미수집'}</dd>${item.phone ? `<dt>문의 전화</dt><dd>${esc(item.phone)}</dd>` : ''}</dl>
      ${position ? `<button type="button" class="tv-button" data-action="travel-locate" data-id="${esc(item.id)}">지도에서 이 장소 보기</button>` : ''}
      <div id="travel-place-details" data-mode="${esc(this.mode)}" data-content-id="${esc(item.id)}">${this.detailHtml(item)}</div>
      <details class="tv-provenance"><summary>이 장소의 자료 정보</summary><dl class="tv-facts"><dt>공식 콘텐츠 ID</dt><dd>${esc(item.id)}</dd><dt>원문 수정시각</dt><dd>${esc(item.modifiedAtRaw ? item.modifiedAtRaw.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3 $4:$5:$6') + ' (제공자 표기)' : '원문에 없음')}</dd>${item.theme ? `<dt>공식 웰니스 분류 코드</dt><dd>${esc(item.theme)}</dd>` : ''}${item.copyrightCode ? `<dt>공공누리 코드</dt><dd>${esc(item.copyrightCode)}</dd>` : ''}</dl></details>
      ${this.sourceFooter()}</div></section>`;
  }

  detailHtml(item) {
    const status = this.detailCache?.get(`${this.mode}:${item.id}`);
    const summary = status?.summary;
    const rowHtml = (fields, labels) => `<dl class="tv-facts">${Object.keys(labels).filter(key => fields?.[key]).map(key => `<dt>${labels[key]}</dt><dd class="tv-official-text">${esc(providerPlainText(fields[key]))}</dd>`).join('')}</dl>`;
    const source = section => section?.fetchedAt ? `<p class="tv-catalog-source">출처 ${esc(section.sourceName)} · ${section.state === 'STALE' ? '이전 수집 자료 · ' : ''}상세 수집 ${esc(new Date(section.fetchedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }))} KST${section.sourceUrl ? ` · <a href="${esc(section.sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 원자료</a>` : ''}</p>` : '';
    let html = '';
    if (status?.requestState === 'LOADING') html += '<p role="status" aria-live="polite">이 장소의 공식 상세 자료를 확인하고 있습니다.</p>';
    else if (status?.requestState === 'NOT_FETCHED') html += '<p role="status">이 장소의 상세 자료가 아직 연결되지 않았습니다. 목록에서 확인된 주소와 위치를 표시합니다.</p>';
    else if (status?.requestState === 'UNAVAILABLE') html += '<p role="status">상세 자료를 불러오지 못했습니다. 이미 수집된 정보는 아래에 표시합니다.</p>';
    const common = summary?.sections.common;
    if (common?.fields.overview) html += `<h4>장소 소개</h4><p class="tv-official-text"${this.mode === 'en' ? ' lang="en"' : ''}>${esc(providerPlainText(common.fields.overview))}</p>`;
    const homepage = providerHomepage(common?.fields.homepage);
    if (homepage) html += `<p><a href="${esc(homepage)}" target="_blank" rel="noopener noreferrer">관광공사가 제공한 장소 홈페이지</a></p>`;
    if (common && Object.keys(common.fields).length) html += source(common);
    const intro = summary?.sections.intro;
    html += '<h4>이용 안내</h4>';
    html += intro && Object.keys(intro.fields).length ? rowHtml(intro.fields, TRAVEL_INTRO_LABELS) + source(intro) : '<p>운영시간·요금·체험 프로그램 상세는 아직 수집되지 않았습니다.</p>';
    if (this.mode === 'bf') {
      const accessibility = summary?.sections.accessibility;
      html += '<h4>무장애 시설 정보</h4>';
      if (accessibility && Object.keys(accessibility.fields).length) html += rowHtml(accessibility.fields, ACCESSIBILITY_LABELS) + source(accessibility);
      else if (item.accessibility && Object.keys(item.accessibility).length) html += rowHtml(item.accessibility, ACCESSIBILITY_LABELS) + `<p class="tv-catalog-source">시설 항목 수집 ${esc(item.accessibilityFetchedAt)}</p>`;
      else html += '<p>주차·출입구·화장실·휠체어 대여 등 시설별 접근성 자료가 아직 수집되지 않았습니다. 무장애 목록 수록 여부로 시설 이용 가능을 판정하지 않습니다.</p>';
    }
    if (status?.requestState !== 'LOADING') html += `<button type="button" class="tv-button" data-action="travel-detail-retry" data-id="${esc(item.id)}">상세 자료 다시 확인</button>`;
    return html;
  }

  async loadPlaceDetails(item, { force = false } = {}) {
    if (!this.catalog || !TRAVEL_CATALOGS[this.mode] || !item?.id) return null;
    this.detailCache ||= new Map();
    const mode = this.mode, id = item.id, key = `${mode}:${id}`;
    const request = this.detailRequest = (this.detailRequest || 0) + 1;
    this.detailController?.abort();
    const controller = this.detailController = new AbortController();
    const previous = this.detailCache.get(key);
    const current = () => this.mode === mode && this.selectedPlace?.id === id && this.detailRequest === request && !controller.signal.aborted;
    const render = () => {
      if (!current()) return null;
      const target = document.getElementById('travel-place-details');
      if (target?.dataset.mode === mode && target?.dataset.contentId === id) target.innerHTML = this.detailHtml(item);
      return { html: this.placeCard(item), inPlace: true };
    };
    if (!force && previous?.expiresAt > Date.now()) return render();
    this.detailCache.set(key, { ...previous, requestState: 'LOADING', expiresAt: 0 });
    render();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let result;
    try {
      // 서버에서 이미 생성한 summary만 읽는다. provider API·인증키·수집 트리거는 호출하지 않는다.
      const response = await fetch(detailSummaryUrl(mode, id), { signal: controller.signal, credentials: 'omit' });
      if (response.status === 403 || response.status === 404) result = { requestState: 'NOT_FETCHED', summary: previous?.summary || null, expiresAt: Date.now() + 120000 };
      else {
        if (!response.ok) throw new Error('DETAIL_UNAVAILABLE');
        const summary = validateTravelDetailSummary(await response.json(), mode, id);
        result = { requestState: 'RECEIVED', summary, expiresAt: Date.now() + 300000 };
      }
    } catch {
      // 취소된 이전 선택은 새 선택에 실패 상태를 쓰지 않는다. 제한시간 초과만 현재 카드에 알린다.
      if (this.mode !== mode || this.selectedPlace?.id !== id || this.detailRequest !== request) return null;
      result = { requestState: 'UNAVAILABLE', summary: previous?.summary || null, expiresAt: Date.now() + 30000 };
    } finally { clearTimeout(timeout); }
    if (this.mode !== mode || this.selectedPlace?.id !== id || this.detailRequest !== request) return null;
    this.detailCache.set(key, result);
    if (['HIDDEN', 'NOT_IN_CATALOG'].includes(result.summary?.state)) {
      this.catalog.items = this.catalog.items.filter(row => row.id !== id);
      this.selectedPlace = null; this.selected = null; this.build();
      const target = document.getElementById('travel-place-details');
      if (target?.dataset.mode === mode && target?.dataset.contentId === id) {
        const card = target.closest('.tv-catalog'); if (card) card.outerHTML = this.catalogCard();
        this.focusPanel('travel-result-count');
      }
      return { html: this.catalogCard(), inPlace: true };
    }
    // 제한시간으로 Abort된 현재 요청도 현재 카드에 오류를 표시한다.
    const target = document.getElementById('travel-place-details');
    if (target?.dataset.mode === mode && target?.dataset.contentId === id) target.innerHTML = this.detailHtml(item);
    return { html: this.placeCard(item), inPlace: true };
  }

  handleAction(action, dataset = {}, value) {
    if (!action?.startsWith('travel-') || !this.catalog) return null;
    if (action === 'travel-query') {
      // 검색창의 click도 셸의 action 위임을 탄다. 실제 input만 처리해 한글 조합을 보존한다.
      if (typeof value !== 'string') return { handled: true };
      this.query = value.slice(0, 160); this.page = 0; this.selectedPlace = null;
    } else if (action === 'travel-page') {
      this.page = Math.max(0, Number(dataset.page) || 0);
    } else if (action === 'travel-list') {
      this.detailController?.abort(); this.detailRequest = (this.detailRequest || 0) + 1;
      this.selectedPlace = null; this.selected = null;
      return { html: this.catalogCard(), focusId: 'travel-query' };
    } else if (action === 'travel-item' || action === 'travel-locate' || action === 'travel-detail-retry') {
      const item = this.catalog.items.find(row => row.id === dataset.id);
      if (!item) return { handled: true };
      this.selectedPlace = item; this.selected = { ...item, nameKo: item.title, province: item.address, _travelPlace: true };
      if (action === 'travel-locate') return { point: item.location ? { lat: item.location[0], lon: item.location[1], title: item.title } : null };
      const pending = this.loadPlaceDetails(item, { force: action === 'travel-detail-retry' });
      return { html: this.placeCard(item), focusId: action === 'travel-detail-retry' ? null : 'travel-place-title', pending };
    } else return null;
    const target = document.getElementById('travel-results');
    if (target) target.innerHTML = this.resultsHtml();
    this.build();
    if (action === 'travel-page') this.focusPanel('travel-result-count');
    // 호출자는 저장된 본문만 갱신한다. 입력 중인 패널 전체를 교체하지 않는다.
    return { html: this.catalogCard(), inPlace: true };
  }

  focusPanel(id) { if (id) queueMicrotask(() => document.getElementById(id)?.focus({ preventScroll: true })); }

  buildPlaces() {
    const places = this.pageResult.items.filter(item => item.location);
    if (!places.length) return;
    const positions = new Float32Array(places.length * 3);
    places.forEach((item, index) => {
      const [lat, lon] = item.location; const v = llToV3(lat, lon, this.surfR(lat, lon));
      positions.set([v.x, v.y, v.z], index * 3);
      if (index < 8) { const label = makeLabel(item.title, '#F2A2C4'); label.position.copy(llToV3(lat, lon, this.surfR(lat, lon, 0.007))); this.group.add(label); this.labels.push(label); }
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, color: ACCENT, map: getDotTex(), transparent: true, alphaTest: 0.05, depthWrite: false })));
  }

  visitorsCard() {
    const rows = this.data.regions.filter(region => region.visitors).sort((a, b) => (b.visitors.domestic ?? -1) - (a.visitors.domestic ?? -1));
    const content = rows.slice(0, 20).map(region => { const v = region.visitors; return `<tr><th scope="row">${esc(region.province)} ${esc(region.nameKo)}</th><td>${n(v.domestic == null ? null : Math.round(v.domestic))}</td><td>${esc(v.date || '기간 미수신')}${v.aggregation === 'MEAN_PER_DAY' ? ' · 일평균' : ''}</td></tr>`; }).join('');
    return `<section class="card tv-catalog"><div class="card-h">방문자 스냅샷 <span class="badge">과거 통계</span></div><div class="card-b"><p>이동통신 기반 외지인 방문 지표입니다. 관광객 수나 현재 혼잡도가 아닙니다.</p><p>자료가 있는 ${n(rows.length)}개 지역 중 외지인 지표 상위 20곳. 지역별 집계 기간이 다를 수 있습니다.</p><div class="tv-table-wrap"><table><thead><tr><th>지역</th><th>외지인</th><th>집계 기간</th></tr></thead><tbody>${content}</tbody></table></div><p class="tv-catalog-source">${this.provLine('visitors')}</p></div></section>`;
  }

  relatedCard() {
    if (!this.data) return '';
    const rel = this.data.related || {};
    const keys = Object.keys(rel).slice(0, 4);
    const rows = keys.map((k) => `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${rel[k].map((t) => esc(t.target)).join(' → ')}</span></div>`).join('');
    return `<div class="card"><div class="card-h">하나 더 — 연관 관광지 ${renderBadge('HISTORY')}</div>
      <div class="card-b">한 곳을 본 사람이 실제로 이어 간 곳 (TMAP 이동 기준 · ${esc((rel[keys[0]] || [{}])[0].month || '')}). 출발지 <b>${n(Object.keys(rel).length)}곳</b>, 각 상위 5개.
        <div class="stats" style="margin-top:6px">${rows}</div>
        <div style="margin-top:6px;opacity:.7;font-size:10.5px">${this.provLine('related')} · 좌표가 없는 명칭 그래프라 지구 위에는 찍지 않습니다 — 없는 위치를 만들지 않습니다.</div>
      </div></div>`;
  }
}
