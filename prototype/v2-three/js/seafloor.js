// EARTHUS v2-three — 해저 표현 (SEAFLOOR)
// 바다 바닥을 두 가지로만 읽게 한다.
//   · 등심선(isobath) — main.js 프래그먼트 셰이더가 고도맵에서 직접 그린다 (여기 없음).
//   · 해구 위치      — GEBCO SCUFN 가제티어의 Trench 축선을 해수면 위에 얹는다 (이 파일).
//
// 지형을 변형하지 않는다. 해구선은 해수면 반경에 고정이라 지형 과장과 무관하게
// 항상 같은 자리에 보인다. 좌표는 전부 원격 실데이터이고 한글명은 번역일 뿐이다.

import * as THREE from '../../vendor/three-r184.module.min.js';
// 깊이 → 시각 강도 곡선은 정본을 쓴다 (geo/bathymetry-policy.js · 200 m까지 선형, 그 뒤 로그)
import { depthVisualScale } from './engine-bridge.js?v=15';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// GEBCO SCUFN 가제티어 (IHO DCDB / NOAA NCEI 호스팅 · CORS 허용)
const SCUFN = 'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/Undersea_Features/FeatureServer/1/query';
const SCUFN_URL = `${SCUFN}?where=${encodeURIComponent("TYPE='Trench'")}`
  + '&outFields=NAME,TYPE,FEATURE_ID&returnGeometry=true&outSR=4326&f=geojson';

const LINE_R = 1.0016;  // 해수면 바로 위 — 지형 과장과 무관하게 항상 보인다
const LABEL_R = 1.0055;

// SCUFN 영문명 → 한글 (번역 대응표 · 값이 아니라 표기)
const KO = {
  Aleutian: '알류샨', Amirante: '아미란테', Cayman: '케이맨', Cedros: '세드로스',
  Chile: '칠레', Colombian: '콜롬비아', Ecuador: '에콰도르', Hellenic: '헬레닉',
  Japan: '일본', Kermadec: '케르마덱', 'Kuril-Kamchatka': '쿠릴·캄차카',
  Mariana: '마리아나', 'Middle America': '중앙아메리카', 'New Guinea': '뉴기니',
  Palau: '팔라우', Peru: '페루', 'Peru-Chile': '페루·칠레', Philippine: '필리핀',
  'Puerto Rico': '푸에르토리코', Puysegur: '푸이세거', 'South New Hebrides': '남뉴헤브리디스',
  'South Sandwich': '사우스샌드위치', Sunda: '순다', Tonga: '통가', Vema: '베마',
  Vityaz: '비탸즈', 'West Melanesian': '서멜라네시아', Yap: '야프',
};
const koName = (n) => (KO[n] ? `${KO[n]} 해구` : `${n} Trench`);

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

const llToV3 = (latDeg, lonDeg, r, out) => {
  const la = latDeg * D2R;
  const lo = lonDeg * D2R;
  const cl = Math.cos(la);
  const v = out || new THREE.Vector3();
  return v.set(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
};

// 대권 보간 — 폴리라인이 구면에서 뜨지 않도록 조밀화
const gcInterp = (lat1, lon1, lat2, lon2, f) => {
  const p1 = llToV3(lat1, lon1, 1);
  const p2 = llToV3(lat2, lon2, 1);
  const ang = Math.acos(clamp(p1.dot(p2), -1, 1));
  if (ang < 1e-9) return [lat1, lon1];
  const s1 = Math.sin((1 - f) * ang) / Math.sin(ang);
  const s2 = Math.sin(f * ang) / Math.sin(ang);
  const p = p1.multiplyScalar(s1).add(p2.multiplyScalar(s2)).normalize();
  return [Math.asin(clamp(p.y, -1, 1)) * R2D, Math.atan2(p.x, p.z) * R2D];
};

const gcDistM = (lat1, lon1, lat2, lon2) => {
  const dLa = (lat2 - lat1) * D2R;
  const dLo = (lon2 - lon1) * D2R;
  const a = Math.sin(dLa / 2) ** 2
    + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(clamp(a, 0, 1)));
};

const fmtM = (v) => (v == null || !Number.isFinite(v) ? '—' : `${Math.round(v).toLocaleString('ko-KR')} m`);

// 라벨 스프라이트
const makeLabel = (text, accent) => {
  const pad = 10;
  const probe = document.createElement('canvas').getContext('2d');
  const font = '600 30px "Noto Sans KR", -apple-system, sans-serif';
  probe.font = font;
  const c = document.createElement('canvas');
  c.width = Math.ceil(probe.measureText(text).width) + pad * 2;
  c.height = 44;
  const g = c.getContext('2d');
  g.font = font;
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)';
  g.shadowBlur = 8;
  g.fillStyle = accent;
  g.fillText(text, pad, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, sizeAttenuation: false,
  }));
  spr.scale.set((c.width / c.height) * 0.028, 0.028, 1);
  spr.center.set(-0.10, 0.5);
  return spr;
};

export class SeaFloor {
  // heightAt(lat,lon) → m (음수 = 수심) — 해구별 렌더 소스 수심을 표에 쓰기 위해서만 쓴다
  constructor(scene, heightAt, dataBadge) {
    this.heightAt = heightAt;
    this.dataBadge = dataBadge;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.trenches = null;
    this.on = false;
    this.loading = false;
    this.selected = null;
    this.labels = [];
  }

  async toggle() {
    if (this.on) {
      this.on = false;
      this.group.visible = false;
      return { on: false };
    }
    if (this.trenches) {
      this.on = true;
      this.group.visible = true;
      return { on: true, badge: 'OBSERVED' };
    }
    if (this.loading) return { on: false };
    this.loading = true;
    try {
      const res = await fetch(SCUFN_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`SCUFN HTTP ${res.status}`);
      const gj = await res.json();
      if (gj.error) throw new Error(gj.error.message || 'SCUFN error');
      const feats = gj.features || [];
      if (!feats.length) throw new Error('해구 피처 0개');
      this.trenches = feats.map((f) => this.prepare(f)).filter(Boolean);
      this.trenches.sort((a, b) => a.minD - b.minD); // 깊은 것부터
      this.build();
      this.on = true;
      this.group.visible = true;
      this.loading = false;
      return { on: true, badge: 'OBSERVED' };
    } catch (e) {
      this.loading = false;
      console.warn('[seafloor] SCUFN', e);
      return { on: false, error: String((e && e.message) || e) };
    }
  }

  prepare(f) {
    const co = f.geometry && f.geometry.coordinates;
    if (!co) return null;
    const parts = f.geometry.type === 'MultiLineString' ? co : [co];
    const name = (f.properties && f.properties.NAME) || '?';

    const dense = [];
    let minD = 0;
    let deepest = null;
    parts.forEach((part) => {
      const seg = [];
      const push = (la, lo) => {
        const d = this.heightAt(la, lo);
        seg.push([la, lo]);
        if (d < minD) { minD = d; deepest = { lat: la, lon: lo, d }; }
      };
      for (let i = 0; i < part.length - 1; i += 1) {
        const [lo1, la1] = part[i];
        const [lo2, la2] = part[i + 1];
        const n = Math.max(2, Math.min(64, Math.round(gcDistM(la1, lo1, la2, lo2) / 20000)));
        for (let k = 0; k < n; k += 1) {
          const [la, lo] = gcInterp(la1, lo1, la2, lo2, k / n);
          push(la, lo);
        }
      }
      push(part[part.length - 1][1], part[part.length - 1][0]);
      if (seg.length > 1) dense.push(seg);
    });
    if (!dense.length) return null;

    const longest = dense.reduce((a, b) => (b.length > a.length ? b : a), dense[0]);
    const mid = longest[Math.floor(longest.length / 2)];
    return {
      name,
      ko: koName(name),
      id: (f.properties && f.properties.FEATURE_ID) || 0,
      dense,
      minD,
      deepest: deepest || { lat: mid[0], lon: mid[1], d: 0 },
      anchor: { lat: mid[0], lon: mid[1] },
    };
  }

  build() {
    this.clear();
    const v = new THREE.Vector3();
    this.trenches.forEach((t) => {
      // 해구별 밝기는 정본 depthVisualScale()로 — 얕은 해구와 최심 해구가 같은 세기로
      // 보이지 않게 한다 (200 m까지 선형, 그 아래는 로그 · 챌린저 해연 기준 정규화)
      const k = Number.isFinite(t.minD) && t.minD < 0 ? depthVisualScale(t.minD) : 0.5;
      const opacity = 0.55 + 0.42 * k;
      this.depthScale = k;
      t.dense.forEach((seg) => {
        const pos = new Float32Array(seg.length * 3);
        seg.forEach((p, i) => {
          llToV3(p[0], p[1], LINE_R, v);
          pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.group.add(new THREE.Line(g, new THREE.LineBasicMaterial({
          color: 0xffc46a, transparent: true, opacity,
          depthWrite: false, blending: THREE.AdditiveBlending,
        })));
      });
      // 최심 정점
      const dg = new THREE.BufferGeometry();
      const dv = llToV3(t.deepest.lat, t.deepest.lon, LINE_R + 0.0008);
      dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([dv.x, dv.y, dv.z]), 3));
      this.group.add(new THREE.Points(dg, new THREE.PointsMaterial({
        color: 0xfff0d0, size: 5, sizeAttenuation: false,
        transparent: true, opacity: 0.95, depthWrite: false,
      })));
      // 라벨
      const lab = makeLabel(t.ko, '#FFC46A');
      lab.position.copy(llToV3(t.anchor.lat, t.anchor.lon, LABEL_R));
      this.group.add(lab);
      this.labels.push(lab);
    });
  }

  clear() {
    for (let i = this.group.children.length - 1; i >= 0; i -= 1) {
      const o = this.group.children[i];
      this.group.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    }
    this.labels = [];
  }

  // 지구 반대편 라벨은 숨기고, 화면에서 겹치면 깊은 해구만 남긴다 (labels는 깊은 순)
  update(camera, altKm) {
    if (!this.on || !this.labels.length) return;
    const cam = camera.position.clone().normalize();
    const showAll = altKm < 4000;
    const shown = [];
    const v = new THREE.Vector3();
    this.labels.forEach((l, i) => {
      const facing = l.position.clone().normalize().dot(cam);
      if (facing <= 0.25 || (!showAll && i >= 10)) { l.visible = false; return; }
      v.copy(l.position).project(camera);
      const collide = shown.some((s) => Math.abs(s.x - v.x) < 0.22 && Math.abs(s.y - v.y) < 0.055);
      l.visible = !collide;
      if (!collide) shown.push({ x: v.x, y: v.y });
      l.material.opacity = clamp((facing - 0.25) * 3.2, 0, 1);
    });
  }

  // 지구를 클릭했을 때: 임계거리 안의 가장 가까운 해구
  pick(lat, lon, maxKm = 400) {
    if (!this.on || !this.trenches) return null;
    let best = null;
    let bestD = maxKm * 1000;
    this.trenches.forEach((t) => {
      t.dense.forEach((seg) => {
        for (let i = 0; i < seg.length; i += 2) {
          const d = gcDistM(lat, lon, seg[i][0], seg[i][1]);
          if (d < bestD) { bestD = d; best = t; }
        }
      });
    });
    if (best) this.selected = best;
    return best;
  }

  card() {
    if (!this.trenches) return '';
    const rows = this.trenches.slice(0, 8).map((t) => (
      `<div class="stat"><span class="k">${t.ko}</span><span class="v">${fmtM(t.minD)}</span></div>`
    )).join('');
    return `<div class="card"><div class="card-h">해구 위치 ${this.dataBadge('OBSERVED')}</div>
      <div class="card-b">
        GEBCO SCUFN 가제티어에 등재된 해구 <b>${this.trenches.length}곳</b>의 축선을 해수면 위에 표시했습니다.
        선을 클릭하면 그 해구가 선택됩니다.
        <div class="stats" style="margin-top:8px">${rows}</div>
        <div style="margin-top:8px;opacity:.7;font-size:11px">
          축선 좌표 출처 GEBCO Sub-Committee on Undersea Feature Names (IHO DCDB / NOAA NCEI)<br/>
          옆의 수심은 이 지구본이 쓰는 고도맵(AWS Terrarium z4 · 적도 약 9.8 km/px)에서 읽은 값이며
          공식 최심값이 아닙니다.
        </div>
      </div></div>`;
  }

  trenchCard(t) {
    return `축선 출처 GEBCO SCUFN 가제티어 (feature ${t.id})<br/>
      축선 최심 정점 ${t.deepest.lat.toFixed(3)}°, ${t.deepest.lon.toFixed(3)}°<br/>
      그 지점의 고도맵 수심 ${fmtM(t.deepest.d)}
      <span style="opacity:.7">(Terrarium z4 · 공식 최심값 아님)</span>`;
  }
}
