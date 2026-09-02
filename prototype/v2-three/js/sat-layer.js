// AETHERUS — 인공위성 추적 (CelesTrak OMM 카탈로그 + SGP4 로컬 전파)
// 1.0 space.js의 판단을 이식: S3 카탈로그(SATCAT 조인·Lambda 갱신) 우선,
// 위치는 지어내지 않는다 — 공식 궤도요소의 SGP4 전파(DERIVED)만 그린다.
// 스타링크는 성능 상한으로 자르되, 자르면 반드시 화면에 적는다 (1.0 원칙).

import * as THREE from '../../vendor/three-r184.module.min.js';

const SATJS_URL = new URL('../../vendor/satellite-6.0.2.min.js', import.meta.url);
const CAT_URL = location.hostname.endsWith('earthus.net')
  ? '/celestrak/catalog.json.gz'
  : 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/celestrak/catalog.json.gz';
const R_KM = 6371;
const POS_INTERVAL_MS = 250;   // 1.0 실측 판단: 250ms면 전지구 뷰에서 픽셀 이하 이동
const STARLINK_CAP = 1500;     // 성능 상한 — 초과분은 자르고 개수를 명시한다

const CORE_GROUPS = [
  { key: 'stations', ko: '정거장', color: '#ffffff', size: 10 },
  { key: 'weather', ko: '기상', color: '#9fb9ff', size: 5 },
  { key: 'science', ko: '과학', color: '#c9a8ff', size: 5 },
  { key: 'nav', ko: '항법', color: '#7fd8a0', size: 4.5 },
];

let satJsReady = null;
const loadSatJs = () => {
  if (window.satellite) return Promise.resolve();
  if (!satJsReady) {
    satJsReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SATJS_URL;
      s.onload = res;
      s.onerror = () => rej(new Error('satellite.js load failed'));
      document.head.appendChild(s);
    });
  }
  return satJsReady;
};

// 카탈로그 행(o 배열) → OMM 객체 (1.0 toSat과 동일한 매핑)
const rowToOmm = (row) => {
  const a = row.o;
  if (!Array.isArray(a)) return row.omm || null;
  return {
    OBJECT_NAME: row.n, OBJECT_ID: row.oid, NORAD_CAT_ID: Number(row.id),
    EPOCH: a[0], MEAN_MOTION: a[1], ECCENTRICITY: a[2], INCLINATION: a[3],
    RA_OF_ASC_NODE: a[4], ARG_OF_PERICENTER: a[5], MEAN_ANOMALY: a[6],
    EPHEMERIS_TYPE: a[7], CLASSIFICATION_TYPE: a[8], ELEMENT_SET_NO: a[9],
    REV_AT_EPOCH: a[10], BSTAR: a[11], MEAN_MOTION_DOT: a[12], MEAN_MOTION_DDOT: a[13],
  };
};

let satDotTex = null;
const getSatDotTex = () => {
  if (satDotTex) return satDotTex;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  satDotTex = new THREE.CanvasTexture(c);
  return satDotTex;
};

export class SatLayer {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.catalog = null;
    this.coreOn = false;
    this.starlinkOn = false;
    this.sets = [];           // [{points, sats:[{rec}], posAttr}]
    this.lastPos = 0;
    this.counts = { core: 0, starlink: 0, starlinkTotal: 0, failed: 0 };
    this.loading = false;
  }

  async ensureCatalog() {
    if (this.catalog) return this.catalog;
    await loadSatJs();
    const res = await fetch(CAT_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
    // S3가 Content-Encoding: gzip이면 브라우저가 풀어준다. 아니면 직접 푼다.
    const buf = await res.arrayBuffer();
    const u8 = new Uint8Array(buf);
    let text;
    if (u8[0] === 0x1f && u8[1] === 0x8b) {
      const ds = new DecompressionStream('gzip');
      const stream = new Blob([buf]).stream().pipeThrough(ds);
      text = await new Response(stream).text();
    } else {
      text = new TextDecoder().decode(u8);
    }
    this.catalog = JSON.parse(text);
    return this.catalog;
  }

  makeSet(rows, colorHex, size, opacity = 0.95) {
    const sats = [];
    for (const row of rows) {
      const omm = rowToOmm(row);
      if (!omm) continue;
      try {
        const rec = window.satellite.json2satrec(omm);
        if (rec && rec.error === 0) sats.push({ rec, name: row.n });
        else this.counts.failed += 1;
      } catch (_) { this.counts.failed += 1; }
    }
    const pos = new Float32Array(sats.length * 3);
    const geo = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(pos, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr);
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: false, color: new THREE.Color(colorHex),
      map: getSatDotTex(), alphaTest: 0.05,
      transparent: true, opacity, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // 위치가 매 틱 바뀌므로 바운딩 갱신 대신 컬링 끔
    this.group.add(points);
    return { points, sats, attr };
  }

  disposeSets() {
    for (const s of this.sets) {
      this.group.remove(s.points);
      s.points.geometry.dispose();
      s.points.material.dispose();
    }
    this.sets = [];
    this.counts = { core: 0, starlink: 0, starlinkTotal: 0, failed: 0 };
  }

  async rebuild() {
    const cat = await this.ensureCatalog();
    this.disposeSets();
    if (this.coreOn) {
      for (const g of CORE_GROUPS) {
        const rows = (cat.groups && cat.groups[g.key]) || [];
        const set = this.makeSet(rows, g.color, g.size);
        this.counts.core += set.sats.length;
        this.sets.push(set);
      }
    }
    if (this.starlinkOn) {
      const rows = (cat.groups && cat.groups.starlink) || [];
      this.counts.starlinkTotal = rows.length;
      const set = this.makeSet(rows.slice(0, STARLINK_CAP), '#8fa3b8', 3, 0.7);
      this.counts.starlink = set.sats.length;
      this.sets.push(set);
    }
    this.group.visible = this.coreOn || this.starlinkOn;
    this.lastPos = 0; // 즉시 위치 계산
  }

  async toggleCore() {
    if (this.loading) return { on: this.coreOn };
    this.loading = true;
    try {
      this.coreOn = !this.coreOn;
      await this.rebuild();
      return { on: this.coreOn };
    } catch (e) {
      this.coreOn = false;
      console.warn('[sat-layer]', e);
      return { on: false, error: String(e && e.message || e) };
    } finally { this.loading = false; }
  }

  async toggleStarlink() {
    if (this.loading) return { on: this.starlinkOn };
    this.loading = true;
    try {
      this.starlinkOn = !this.starlinkOn;
      await this.rebuild();
      return { on: this.starlinkOn };
    } catch (e) {
      this.starlinkOn = false;
      console.warn('[sat-layer]', e);
      return { on: false, error: String(e && e.message || e) };
    } finally { this.loading = false; }
  }

  state(which) {
    const on = which === 'starlink' ? this.starlinkOn : this.coreOn;
    if (!on) return { on: false };
    const note = which === 'starlink'
      ? `${this.counts.starlink.toLocaleString()} / ${this.counts.starlinkTotal.toLocaleString()}기 표시 (성능 상한)`
      : `${this.counts.core}기 · 250ms 갱신 · SGP4`;
    return { on: true, note };
  }

  card() {
    const cat = this.catalog || {};
    const c = cat.counts || {};
    const legend = CORE_GROUPS.map((g) => `<span style="color:${g.color}">●</span> ${g.ko} ${c[g.key] ?? '—'}기`).join(' · ');
    const sl = this.starlinkOn
      ? `<br/>스타링크 ${this.counts.starlink.toLocaleString()}기 표시 — 전체 ${this.counts.starlinkTotal.toLocaleString()}기 중 성능 상한으로 일부만. 자른 만큼 여기에 적습니다 (조용히 버리지 않음).`
      : '';
    return `실제 위성 위치 — CelesTrak 공식 궤도요소(OMM)를 기기에서 SGP4로 전파해 250ms마다 갱신합니다.<br/>${legend}${sl}<br/>고도는 실척(LEO ~400km는 지표 바로 위, GPS는 지구 3배 거리) — 과장 없음.<br/>궤도요소 기준 ${cat.generated ? new Date(cat.generated).toLocaleString('ko-KR', { hour12: false }) : '—'} · 위치는 관측이 아닌 전파 계산(DERIVED)`;
  }

  // 메인 루프에서 매 프레임 호출 — 내부에서 250ms 스로틀
  update(nowMs) {
    if (!this.group.visible || !this.sets.length || !window.satellite) return;
    if (nowMs - this.lastPos < POS_INTERVAL_MS) return;
    this.lastPos = nowMs;
    const sat = window.satellite;
    const date = new Date();
    const gmst = sat.gstime(date);
    for (const set of this.sets) {
      const arr = set.attr.array;
      for (let i = 0; i < set.sats.length; i += 1) {
        const pv = sat.propagate(set.sats[i].rec, date);
        const p = pv && pv.position;
        if (!p) { arr[i * 3] = 0; arr[i * 3 + 1] = 0; arr[i * 3 + 2] = 0; continue; }
        const e = sat.eciToEcf(p, gmst);
        // ECEF(X=경도0, Y=동경90, Z=북) → 렌더 좌표(x=sinλ, y=북, z=경도0)
        arr[i * 3] = e.y / R_KM;
        arr[i * 3 + 1] = e.z / R_KM;
        arr[i * 3 + 2] = e.x / R_KM;
      }
      set.attr.needsUpdate = true;
    }
  }
}
