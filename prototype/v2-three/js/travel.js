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
import { renderBadge } from './engine-bridge.js?v=12';

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
  }

  // ---------------------------------------------------------------- 로드
  async ensure() {
    if (this.data) return this.data;
    if (!this.loading) {
      this.loading = (async () => {
        const res = await fetch(DATA_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`발견 데이터 HTTP ${res.status}`);
        const d = await res.json();
        d.regions.forEach((r, i) => { r.i = i; });
        this.data = d;
        return d;
      })();
    }
    return this.loading;
  }

  // 실시간 게이트: 특보(기상청) · 대기질(에어코리아). 5분 캐시.
  async ensureGates() {
    if (Date.now() - this.gates.at < 5 * 60 * 1000 && (this.gates.warn || this.gates.air)) return this.gates;
    const get = async (p, ms) => {
      try {
        const r = await Promise.race([fetch(`${S3}${p}`, { cache: 'no-store' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { return { __error: String((e && e.message) || e) }; }
    };
    const [warn, air] = await Promise.all([get('/events/kma-warn.json', 15000), get('/wind/korea-air-obs.json', 20000)]);
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
    if (this.mode === mode) { this.mode = null; this.group.visible = false; return { on: false }; }
    await this.ensure();
    await this.ensureGates();
    this.computeScores();
    this.mode = mode;
    this.build();
    this.group.visible = true;
    return { on: true };
  }

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

  onExaggerChanged() { if (this.mode && this.data) this.build(); }

  update(camera) {
    if (!this.mode || !this.data) return;
    // 지형 과장이 바뀌면 점이 산에 묻히거나 뜬다 — 스스로 감지해 다시 배치한다
    const ex = this.getExagger();
    if (ex !== this._lastEx) { this._lastEx = ex; this.build(); }
    if (!this.labels.length) return;
    const cam = camera.position.clone().normalize();
    this.labels.forEach((l) => { l.visible = l.position.clone().normalize().dot(cam) > 0.3; });
  }

  pick(lat, lon, maxKm = 35) {
    if (!this.mode || !this.data) return null;
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
    if (!this.data) return '';
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
