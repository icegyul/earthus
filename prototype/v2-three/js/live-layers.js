// EARTHUS v2-three — 라이브 레이어 (1.0 S3 캐시 실데이터 → 지구 위 표현)
// 원칙(v5.3): 값 생성 금지 — 캐시에 있는 관측·공식 발표만 그린다. 없으면 그리지 않는다.
// 각 레이어는 첫 켬에서 로드하고 원본 데이터를 보관한다 (지형 과장 변경 시 재배치용).

import * as THREE from '../../vendor/three-r184.module.min.js';

// CloudFront(earthus.net)는 /clouds/* 외 경로에 CORS 헤더를 안 붙인다 → 1.0처럼 S3 직접 (CORS *)
const S3 = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

// NASA GIBS EPSG4326 L3 = 10×5 타일 (2^n이 아니다 — 이걸 틀리면 지도가 어긋난다)
const loadGibs = (layer, source) => {
  const date = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const cols = 10;
  const rows = 5;
  const can = document.createElement('canvas');
  can.width = cols * 512;
  can.height = rows * 512;
  const ctx = can.getContext('2d');
  let ok = 0;
  const jobs = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      jobs.push(new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { ctx.drawImage(img, c * 512, r * 512); ok += 1; resolve(); };
        img.onerror = () => resolve();
        setTimeout(resolve, 20000);
        img.src = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${layer}/default/${date}/1km/3/${r}/${c}.png`;
      }));
    }
  }
  return Promise.all(jobs).then(() => {
    if (ok < 15) throw new Error(`${layer} 타일 ${ok}/50 — 표시하지 않습니다`);
    return { canvas: can, ok, total: cols * rows, date, source };
  });
};
const R_M = 6371000;

const fetchJson = (path, timeoutMs = 15000, base = S3) =>
  Promise.race([
    fetch(`${base}${path}`, { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
      return r.json();
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${path} timeout`)), timeoutMs)),
  ]);

// 발표기관의 유효시각 표기 "YYYYMMDDHHmm" (UTC) → ms
const parseValidUtc = (v) => {
  const t = String(v || '');
  if (t.length < 12) return null;
  const ms = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12));
  return Number.isFinite(ms) ? ms : null;
};

const llToV3 = (latDeg, lonDeg, r) => {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(la);
  return new THREE.Vector3(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
};

const kstShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const k = new Date(d.getTime() + 9 * 3600000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')} KST`;
};

// 수온(°C) → 색 (한색 −2° → 난색 32°)
const wtmpColor = (t) => {
  const x = Math.min(Math.max((t + 2) / 34, 0), 1);
  const c = new THREE.Color();
  c.setHSL(0.62 - 0.62 * x, 0.85, 0.42 + 0.18 * x);
  return c;
};

const STORM_COLORS = ['#ffb36a', '#ff6a8a', '#7fd8ff', '#c9a8ff', '#a8ffc9'];

// 원형 소프트 도트 스프라이트 (사각 포인트 방지)
let dotTex = null;
const getDotTex = () => {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
};

// 사이클론 글리프. 태풍·허리케인 중심에 얹는 표식이다(PD 요청) — 흰 점만으로는
// '여기가 태풍의 중심'이 읽히지 않는다. 흰색으로 그려서 태풍마다 다른 색으로 물들인다.
// 눈(가운데 구멍)을 뚫는 것이 이 기호의 핵심이다.
let cycloneTex = null;
const getCycloneTex = () => {
  if (cycloneTex) return cycloneTex;
  const S = 160, cx = S / 2, cy = S / 2;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  // 팔 두 개. 눈 가까이서 굵게 시작해 바깥으로 감기며 끝은 뾰족해진다.
  const rIn = 24, rOut = 63, wMax = 17, A0 = -0.45 * Math.PI, A1 = 0.95 * Math.PI, N = 64;
  for (let k = 0; k < 2; k += 1) {
    const phi = k * Math.PI;
    const outer = [], inner = [];
    for (let i = 0; i <= N; i += 1) {
      const t = i / N;
      const a = phi + A0 + (A1 - A0) * t;
      const rc = rIn + (rOut - rIn) * Math.pow(t, 0.85);
      const w = wMax * Math.pow(1 - t, 0.8);
      outer.push([cx + Math.cos(a) * (rc + w), cy + Math.sin(a) * (rc + w)]);
      inner.push([cx + Math.cos(a) * (rc - w), cy + Math.sin(a) * (rc - w)]);
    }
    ctx.beginPath();
    ctx.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i += 1) ctx.lineTo(outer[i][0], outer[i][1]);
    for (let i = inner.length - 1; i >= 0; i -= 1) ctx.lineTo(inner[i][0], inner[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  // 태풍의 눈
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  cycloneTex = new THREE.CanvasTexture(c);
  // 캔버스는 y가 아래로, gl_PointCoord 도 y가 아래로 간다. 뒤집으면 회전 방향이 반대가 된다.
  cycloneTex.flipY = false;
  cycloneTex.minFilter = THREE.LinearFilter;
  cycloneTex.magFilter = THREE.LinearFilter;
  cycloneTex.generateMipmaps = false;
  return cycloneTex;
};

const CYCLONE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSpin;
attribute float aSize;
varying vec3 vCol;
varying float vSpin;
void main() {
  vCol = aColor;
  vSpin = aSpin;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
}`;

const CYCLONE_FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D uMap;
uniform float uTime;
uniform float uOpacity;
varying vec3 vCol;
varying float vSpin;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  // 북반구는 반시계, 남반구는 시계 — 실제 회전 방향이다(코리올리). aSpin 이 부호를 준다.
  float a = uTime * 0.5 * vSpin;
  float s = sin(a), c = cos(a);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
  // 색을 0으로 만든 것은 '예보 구간 밖'이라는 뜻이다(setTimeOffset). 검게 그리지 않는다.
  if (vCol.r + vCol.g + vCol.b < 0.01) discard;
  float m = texture2D(uMap, q).a;
  if (m < 0.03) discard;
  gl_FragColor = vec4(vCol, m * uOpacity);
  #include <colorspace_fragment>
}`;

export class LiveLayers {
  constructor(scene, heightAt, getExagger, dataBadge) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.heightAt = heightAt;
    this.getExagger = getExagger;
    this.dataBadge = dataBadge;
    // id → { on, obj, data, meta:{note, badge, cardHtml}, loading }
    this.layers = {};
    this.lastExagger = getExagger();
  }

  // 지표 반경: 실지형 고도 × 현재 과장 + 살짝 띄움 (마커가 산에 묻히지 않게)
  surfR(lat, lon, liftUnits = 0.0035) {
    const h = Math.max(this.heightAt(lat, lon), 0);
    return 1 + (h / R_M) * this.getExagger() + liftUnits;
  }

  // 구름 셸(예보 평면·릴리프 운정) 위 반경 — 태풍 트랙 등 주석 레이어용
  aboveCloudsR() {
    return 1.004 + (this.getExagger() * 11000) / R_M;
  }

  // 지금 켜져 있는 레이어 id 목록
  activeIds() {
    return Object.keys(this.layers).filter((k) => this.layers[k] && this.layers[k].on);
  }

  state(id) {
    const l = this.layers[id];
    if (!l) return {};
    return { on: !!l.on, note: l.on && l.meta ? l.meta.note : undefined };
  }

  card(id) {
    const l = this.layers[id];
    return l && l.meta ? l.meta.cardHtml : '';
  }

  async toggle(id) {
    let l = this.layers[id];
    if (l && l.on) {
      l.obj.visible = false;
      l.on = false;
      if (id === 'khoaflood') { this._floodSel = null; }   // 끄면 근접 허용도 함께 해제
      return { on: false };
    }
    if (l && l.obj) {
      l.obj.visible = true;
      l.on = true;
      return { on: true, badge: l.meta.badge };
    }
    if (l && l.loading) return { on: false };
    l = this.layers[id] = { on: false, loading: true };
    try {
      const built = await this.build(id);
      l.obj = built.obj;
      l.data = built.data;
      l.meta = built.meta;
      this.group.add(l.obj);
      l.on = true;
      l.loading = false;
      return { on: true, badge: l.meta.badge };
    } catch (e) {
      console.warn('[live-layers]', id, e);
      delete this.layers[id];
      return { on: false, error: String(e && e.message || e) };
    }
  }

  // 켜 둔 레이어를 실제로 다시 받아 온다.
  // 이게 없으면 화면은 처음 켠 순간에 멈춰 있는데 신선도 배지만 갱신돼, 묵은 데이터에 LIVE가 붙는다.
  // 갱신 주기(분) — 원본이 갱신되는 주기에 맞춘다. 없는 id는 갱신하지 않는다(정적 자산).
  static get REFRESH_MIN() {
    return {
      lightning: 5, warn: 10, kmasea: 10, buoys: 20, airq: 20, wind: 20,
      tsunami: 10, seoul: 10, tyoff: 30, wildfire: 30, news: 30,
      sstfield: 180, wavefield: 60, current: 60, tyanalog: 60,
    };
  }

  async refresh(id) {
    const l = this.layers[id];
    if (!l || !l.on || l.loading || l.refreshing) return false;
    l.refreshing = true;
    try {
      const built = await this.build(id);
      this.group.remove(l.obj);
      this.disposeObj(l.obj);
      built.obj.visible = true;
      this.group.add(built.obj);
      l.obj = built.obj;
      l.data = built.data;
      l.meta = built.meta;
      l.refreshedAt = new Date();
      return true;
    } catch (e) {
      console.warn('[live-layers] refresh 실패', id, e);  // 실패해도 옛 화면은 그대로 둔다
      return false;
    } finally {
      l.refreshing = false;
    }
  }

  disposeObj(obj) {
    if (!obj) return;
    obj.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const m of mats) {
          if (m.map && m.map.dispose) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  // 주기 갱신 시작 — 30초마다 만기된 레이어만 다시 받는다
  startAutoRefresh(onChanged) {
    if (this._refreshTimer) return;
    this._refreshedAt = this._refreshedAt || {};
    this._refreshTimer = setInterval(() => {
      if (document.hidden) return;                 // 안 보는 화면은 받지 않는다
      const now = Date.now();
      const table = LiveLayers.REFRESH_MIN;
      for (const id of this.activeIds()) {
        const min = table[id];
        if (!min) continue;
        const last = this._refreshedAt[id] || 0;
        if (now - last < min * 60000) continue;
        this._refreshedAt[id] = now;
        this.refresh(id).then((ok) => { if (ok && onChanged) onChanged(id); });
      }
    }, 30000);
  }

  // 지형 과장 변경 → 로드된 레이어를 원본 데이터로 재배치 (재요청 없음)
  onExaggerChanged() {
    const ex = this.getExagger();
    if (ex === this.lastExagger) return;
    this.lastExagger = ex;
    for (const [id, l] of Object.entries(this.layers)) {
      if (!l.obj || !l.data) continue;
      const wasOn = l.on;
      this.group.remove(l.obj);
      disposeDeep(l.obj);
      this.buildFromData(id, l.data).then((built) => {
        l.obj = built.obj;
        l.meta = built.meta;
        l.obj.visible = wasOn;
        this.group.add(l.obj);
      }).catch(() => {});
    }
  }

  async build(id) {
    const data = await this.fetchFor(id);
    return this.buildFromData(id, data);
  }

  fetchFor(id) {
    switch (id) {
      case 'buoys': return fetchJson('/ocean/buoys.json', 20000);
      case 'lightning': return fetchJson('/events/kma-lightning.json');
      case 'wildfire': return fetchJson('/events/forest-fire-kr.json');
      case 'warn': return fetchJson('/events/kma-warn.json');
      case 'tsunami': return fetchJson('/events/tsunami-intl.json');
      // /tourism은 S3 직접이 403 (버킷 정책) — CloudFront 경유는 CORS 포함 200
      case 'seoul': return fetchJson('/tourism/seoul-flow.json', 20000, 'https://earthus.net');
      // 색인의 순서가 곧 시장 우선순위다 — 첫 도시(한국)를 먼저 띄운다.
      // (이 switch 는 async 가 아니라서 await 를 쓸 수 없다 — 약속을 그대로 돌려준다.)
      case 'poptower':
        return fetch('./popcity/index.json', { cache: 'no-cache' })
          .then((r) => r.json())
          .then((idx) => {
            const first = (idx.cities || [])[0];
            if (!first) throw new Error('도시 격자가 없습니다');
            return fetch(`./popcity/${first.id}.json`, { cache: 'no-cache' })
              .then((r2) => r2.json())
              .then((city) => ({ index: idx, city }));
          });
      case 'tyoff': return fetchJson('/events/typhoon-official.json');
      case 'argo': return fetchJson('/ocean/argo-floats.json');
      // 발사 일정: TheSpaceDevs LL2 (CORS 허용 확인 · 무료 티어 rate limit 있어 세션 캐시)
      case 'launch':
        return fetchJson('/2.2.0/launch/upcoming/?limit=30&hide_recent_previous=true', 25000, 'https://ll.thespacedevs.com');
      case 'kmasea': return fetchJson('/ocean/kma-buoy.json', 20000);
      // 해수면 상승 전망: NASA/IPCC AR6 미러 (같은 출처 경로 — tools/mirror-sealevel-ar6.mjs)
      case 'slr': return fetch('./sealevel/ar6.json', { cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error(`AR6 ${r.status}`); return r.json(); });
      case 'news': return fetchJson('/events/regional-news.json', 20000);
      case 'pop':
        // 국가 인구(World Bank 최신값) + 국가 폴리곤(번들 내장)
        return Promise.all([
          fetchJson('/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1', 25000, 'https://api.worldbank.org'),
          fetch('./data/country-reference.json').then((r) => (r.ok ? r.json() : null)),
        ]).then(([wb, cr]) => {
          if (!wb || !cr) throw new Error('인구·국가 데이터 없음');
          return { wb, cr };
        });
      case 'sstfield': return fetchJson('/ocean/sst-global.json', 30000);
      case 'wavefield':
      case 'current': return fetchJson('/ocean/marine.json', 25000);
      case 'surf':
        // 1.0 로컬 자산을 번들에 포함 (OSM ODbL · 해양수산부 계열)
        return Promise.all([
          fetch('./data/beaches.json').then((r) => (r.ok ? r.json() : null)),
          fetch('./data/fishing.json').then((r) => (r.ok ? r.json() : null)),
        ]).then(([b, f]) => {
          if (!b && !f) throw new Error('해변·낚시 데이터 없음');
          return { beaches: b, fishing: f };
        });
      case 'tyanalog': return fetchJson('/ocean/cyclone-analog.json', 20000);
      case 'airq': return fetchJson('/wind/korea-air-obs.json', 20000);
      case 'wind':
        return Promise.all([
          fetchJson('/wind/kma-aws.json', 20000).catch(() => null),
          fetchJson('/wind/gts-global.json', 25000).catch(() => null),
        ]).then(([aws, gts]) => {
          if (!aws && !gts) throw new Error('바람 관측 없음');
          return { aws, gts };
        });
      // ---- 전지구 확장 레이어 (1.0 캐시에 이미 매시간 올라오는 것들) ----
      case 'fireglobal': return fetchJson('/events/wildfire.json', 30000);
      case 'raingrid':
      case 'tempgrid':
      case 'presgrid':
      case 'windgrid': return fetchJson('/wind/global.json', 25000);
      case 'pm25grid':
      case 'uvgrid': return fetchJson('/wind/air.json', 25000);
      case 'warnworld': return fetchJson('/events/world-alerts.json', 20000);
      case 'radar': return fetchJson('/wind/kma-radar.json', 20000);
      case 'solaract': return fetchJson('/solar/meta.json', 20000);
      case 'crustal': return fetchJson('/events/crustal.json', 25000);
      case 'tyens': return fetchJson('/events/typhoon-ecmwf.json', 30000);
      case 'sstanom': return fetchJson('/ocean/sst-anom-ea.json', 25000);
      // NASA GIBS 관측 타일 — 이미지 자체가 색이므로 격자로 바꾸지 않고 그대로 얹는다
      case 'seaice': return loadGibs('GHRSST_L4_MUR_Sea_Ice_Concentration',
        'GHRSST L4 MUR 해빙 농도 (JPL/NASA)');
      case 'lst': return loadGibs('MODIS_Terra_Land_Surface_Temp_Day',
        'MODIS Terra 주간 지표온도 (NASA LP DAAC)');
      // 오로라 예보 — NOAA SWPC OVATION (CORS 열림, 1°×1° 전지구 65,160칸)
      case 'aurora': return fetchJson('/json/ovation_aurora_latest.json', 30000, 'https://services.swpc.noaa.gov');
      // 국립해양조사원 미래 해수면 전망 — 번들 압축본(tools/build-khoa-sealevel.mjs), 시나리오 4개가 한 파일
      case 'khoasl126':
      case 'khoasl245':
      case 'khoasl370':
      case 'khoasl585':
        if (!this._khoaSl) {
          this._khoaSl = fetch('./sealevel/khoa-kr.json?v=1')
            .then((r) => { if (!r.ok) throw new Error(`KHOA 해수면 ${r.status}`); return r.json(); })
            .catch((e) => { this._khoaSl = null; throw e; });
        }
        return this._khoaSl;
      // 연안 침수 범위 색인 — Lambda khoa-coast({"khoaFlood":true})가 S3 ocean/khoa/ 에 올린다
      case 'khoaflood': return fetchJson('/ocean/khoa/flood-index.json', 20000);
      // 평년 대비 기온 — 실황과 평년을 같은 지점 id로 맞춰 뺀다
      case 'tempanom': return Promise.all([
        fetchJson('/wind/kma-aws.json', 25000),
        fetchJson('/wind/kma-normal.json', 30000),
      ]).then(([aws, norm]) => {
        if (!aws || !norm) throw new Error('실황 또는 평년값 없음');
        return { aws, norm };
      });
      default: return Promise.reject(new Error(`unknown layer ${id}`));
    }
  }

  async buildFromData(id, data) {
    switch (id) {
      case 'buoys': return { obj: this.buildBuoys(data), data, meta: this.metaBuoys(data) };
      case 'lightning': return { obj: this.buildLightning(data), data, meta: this.metaLightning(data) };
      case 'wildfire': return { obj: this.buildFire(data), data, meta: this.metaFire(data) };
      case 'warn': return { obj: this.buildWarn(data), data, meta: this.metaWarn(data) };
      case 'tsunami': return { obj: this.buildTsunami(data), data, meta: this.metaTsunami(data) };
      case 'seoul': return { obj: this.buildSeoul(data), data, meta: this.metaSeoul(data) };
      case 'poptower': return { obj: this.buildPopTower(data), data, meta: this.metaPopTower(data) };
      case 'tyoff': return { obj: this.buildTyphoon(data), data, meta: this.metaTyphoon(data) };
      case 'argo': return { obj: this.buildArgo(data), data, meta: this.metaArgo(data) };
      case 'launch': return { obj: this.buildLaunch(data), data, meta: this.metaLaunch(data) };
      case 'kmasea': return { obj: this.buildKmaSea(data), data, meta: this.metaKmaSea(data) };
      case 'slr': return { obj: this.buildSlr(data), data, meta: this.metaSlr(data) };
      case 'news': return { obj: this.buildNews(data), data, meta: this.metaNews(data) };
      case 'pop': return { obj: this.buildPop(data), data, meta: this.metaPop(data) };
      case 'sstfield': return { obj: this.buildField(data, 'sst', SST_RAMP), data, meta: this.metaSst(data) };
      case 'wavefield': return { obj: this.buildField(data, 'wave', WAVE_RAMP), data, meta: this.metaWave(data) };
      case 'current': return { obj: this.buildCurrent(data), data, meta: this.metaCurrent(data) };
      case 'surf': return { obj: this.buildSurf(data), data, meta: this.metaSurf(data) };
      case 'tyanalog': return { obj: this.buildTyAnalog(data), data, meta: this.metaTyAnalog(data) };
      case 'airq': return { obj: this.buildAirq(data), data, meta: this.metaAirq(data) };
      case 'wind': return { obj: this.buildWind(data), data, meta: this.metaWind(data) };
      case 'fireglobal': return { obj: this.buildFireGlobal(data), data, meta: this.metaFireGlobal(data) };
      case 'raingrid': return { obj: this.buildField(data, 'rain', RAIN_RAMP, this.airShell()), data, meta: this.metaGrid(data, 'rain') };
      case 'tempgrid': return { obj: this.buildField(data, 't', TEMP_RAMP, this.airShell()), data, meta: this.metaGrid(data, 't') };
      case 'presgrid': return { obj: this.buildField(data, 'mslp', PRES_RAMP, this.airShell()), data, meta: this.metaGrid(data, 'mslp') };
      case 'windgrid': return { obj: this.buildWindGrid(data), data, meta: this.metaGrid(data, 'spd') };
      case 'pm25grid': return { obj: this.buildField(data, 'pm25', PM25_RAMP, this.airShell()), data, meta: this.metaGrid(data, 'pm25') };
      case 'uvgrid': return { obj: this.buildField(data, 'uv', UV_RAMP, this.airShell()), data, meta: this.metaGrid(data, 'uv') };
      case 'warnworld': return { obj: this.buildWarnWorld(data), data, meta: this.metaWarnWorld(data) };
      case 'radar': return { obj: new THREE.Group(), data, meta: this.metaRadar(data) };
      case 'solaract': return { obj: new THREE.Group(), data, meta: this.metaSolarAct(data) };
      case 'crustal': return { obj: this.buildCrustal(data), data, meta: this.metaCrustal(data) };
      case 'tyens': return { obj: this.buildTyEns(data), data, meta: this.metaTyEns(data) };
      case 'sstanom': return { obj: this.buildField(data, 'sstAnom', SSTANOM_RAMP), data, meta: this.metaSstAnom(data) };
      case 'seaice': return { obj: this.buildGibsShell(data), data, meta: this.metaGibs(data, 'seaice') };
      case 'lst': return { obj: this.buildGibsShell(data), data, meta: this.metaGibs(data, 'lst') };
      case 'aurora': return { obj: this.buildAurora(data), data, meta: this.metaAurora(data) };
      case 'tempanom': return { obj: this.buildTempAnom(data), data, meta: this.metaTempAnom(data) };
      case 'khoasl126': return { obj: this.buildKhoaSl(data, 'SSP126'), data, meta: this.metaKhoaSl(data, 'SSP126') };
      case 'khoasl245': return { obj: this.buildKhoaSl(data, 'SSP245'), data, meta: this.metaKhoaSl(data, 'SSP245') };
      case 'khoasl370': return { obj: this.buildKhoaSl(data, 'SSP370'), data, meta: this.metaKhoaSl(data, 'SSP370') };
      case 'khoasl585': return { obj: this.buildKhoaSl(data, 'SSP585'), data, meta: this.metaKhoaSl(data, 'SSP585') };
      case 'khoaflood': return { obj: this.buildFloodIndex(data), data, meta: this.metaFloodIndex(data) };
      default: throw new Error(`unknown layer ${id}`);
    }
  }

  makePoints(items, { size = 5, lift = 0.0035, opacity = 0.95, additive = false } = {}) {
    const pos = new Float32Array(items.length * 3);
    const col = new Float32Array(items.length * 3);
    items.forEach((it, i) => {
      const v = llToV3(it.lat, it.lon, this.surfR(it.lat, it.lon, lift));
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      col[i * 3] = it.c.r; col[i * 3 + 1] = it.c.g; col[i * 3 + 2] = it.c.b;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({
      size, sizeAttenuation: false, vertexColors: true,
      map: getDotTex(), alphaTest: 0.05,
      transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    return new THREE.Points(g, m);
  }

  // 태풍·허리케인 중심 표식. 점 하나에 사이클론 기호를 얹고 반구에 맞춰 돌린다.
  makeCyclones(items, { size = 26, lift = 0.0035, opacity = 0.96 } = {}) {
    const n = items.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const spin = new Float32Array(n);
    const siz = new Float32Array(n);
    items.forEach((it, i) => {
      const v = llToV3(it.lat, it.lon, this.surfR(it.lat, it.lon, lift));
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      col[i * 3] = it.c.r; col[i * 3 + 1] = it.c.g; col[i * 3 + 2] = it.c.b;
      spin[i] = it.lat < 0 ? -1 : 1;      // 남반구는 반대로 돈다
      siz[i] = it.size || size;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSpin', new THREE.BufferAttribute(spin, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: CYCLONE_VERT,
      fragmentShader: CYCLONE_FRAG,
      uniforms: {
        uMap: { value: getCycloneTex() },
        uTime: { value: 0 },
        uOpacity: { value: opacity },
      },
      transparent: true,
      depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;   // 점 하나짜리라 경계상자로 자르면 사라진다
    return pts;
  }

  // ---------- 해양 부이 (NDBC 등 · OBSERVED) ----------
  buildBuoys(d) {
    const items = (d.buoys || [])
      .filter((b) => b.lat != null && b.lon != null && b.wtmp != null)
      .map((b) => ({ lat: b.lat, lon: b.lon, c: wtmpColor(b.wtmp) }));
    return this.makePoints(items, { size: 4, lift: 0.0025, opacity: 0.9 });
  }

  metaBuoys(d) {
    const withT = (d.buoys || []).filter((b) => b.wtmp != null).length;
    const note = `${withT.toLocaleString()}기 표시 (색=수온) · ${kstShort(d.generated)}`;
    return {
      badge: 'OBSERVED', note,
      cardHtml: `전 세계 관측 부이 ${Number(d.count || 0).toLocaleString()}기 중 수온 보고 ${withT.toLocaleString()}기를 색(한색 −2°C → 난색 32°C)으로 표시합니다.<br/>수온 미보고 부이는 그리지 않습니다 (값 생성 금지).<br/>출처 ${d.source || 'NDBC'} · ${kstShort(d.generated)}`,
    };
  }

  // ---------- 낙뢰 (KMA 낙뢰관측망 · 최근 60분 · OBSERVED) ----------
  buildLightning(d) {
    const g = new THREE.Group();
    const strikes = d.strikes || [];
    if (strikes.length) {
      const items = strikes.map((s) => ({
        lat: s.lat, lon: s.lon,
        c: new THREE.Color(s.type === 'G' ? '#fff3a0' : '#ffe066'),
      }));
      g.add(this.makePoints(items, { size: 8, lift: 0.004, additive: true }));
    }
    return g;
  }

  metaLightning(d) {
    const n = d.count || 0;
    const note = n
      ? `${n}회 (대지 ${d.groundCount ?? '—'} · 최강 ${d.strongestKA ?? '—'}kA) · ${kstShort(d.generated)}`
      : `최근 ${d.windowMinutes || 60}분 낙뢰 없음 (관측값 0) · ${kstShort(d.generated)}`;
    return {
      badge: 'OBSERVED', note,
      cardHtml: `최근 ${d.windowMinutes || 60}분 한반도 낙뢰 ${n}회${n ? ` — 대지방전 ${d.groundCount ?? '—'}회 · 운간 ${d.cloudCount ?? '—'}회 · 최강 ${d.strongestKA ?? '—'} kA` : ' (실제 관측 0 — 좋은 소식입니다)'}.<br/>출처 ${d.source || 'KMA'} · ${kstShort(d.generated)} · 10분 주기 갱신`,
    };
  }

  // ---------- 산불 위험지수 (산림청 · 시도 16 · OFFICIAL) ----------
  buildFire(d) {
    const stepColor = { '1단계': '#7fd88f', '2단계': '#ffd24d', '3단계': '#ff8a3d', '4단계': '#ff4040' };
    const items = (d.sido || [])
      .filter((s) => s.lat != null && s.lon != null)
      .map((s) => ({ lat: s.lat, lon: s.lon, c: new THREE.Color(stepColor[s.topStep] || '#7fd88f') }));
    return this.makePoints(items, { size: 9, lift: 0.004 });
  }

  metaFire(d) {
    const nation = d.nation || {};
    const top = [...(d.sigungu || [])].sort((a, b) => (b.max || 0) - (a.max || 0)).slice(0, 4);
    const note = `전국 평균 ${nation.avg ?? '—'} · 상향발령 ${d.elevatedCount ?? 0}곳 · ${nation.at || ''}`;
    return {
      badge: 'OFFICIAL_FORECAST', note,
      cardHtml: `산림청 산불위험지수 — 전국 평균 ${nation.avg ?? '—'} / 최대 ${nation.max ?? '—'} (${nation.topStep || '—'}), 단계 상향 발령 ${d.elevatedCount ?? 0}곳.<br/>시도 16곳을 단계색(초록 1단계 → 빨강 4단계)으로 표시.<br/>위험 상위: ${top.map((s) => `${s.sido} ${s.sigun} ${s.max}`).join(' · ') || '—'}<br/>기준 ${nation.at || '—'} · 시군구 ${d.sigungu ? d.sigungu.length : 0}곳 분석`,
    };
  }

  // ---------- 기상 특보 (KMA 공식 · OFFICIAL) ----------
  buildWarn(d) {
    const items = (d.active || [])
      .filter((w) => w.lat != null && w.lon != null)
      .map((w) => ({ lat: w.lat, lon: w.lon, c: new THREE.Color(w.color || '#ffb36a') }));
    return this.makePoints(items, { size: 7, lift: 0.0045 });
  }

  metaWarn(d) {
    const byKind = {};
    (d.active || []).forEach((w) => {
      const k = `${w.icon || ''}${w.kind} ${w.level}`;
      byKind[k] = (byKind[k] || 0) + 1;
    });
    const parts = Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}곳`);
    const note = `유효 ${d.activeCount ?? 0}건 · 최고 ${d.topLevel || '—'} · ${kstShort(d.generated)}`;
    return {
      badge: 'OFFICIAL_FORECAST', note,
      cardHtml: `기상청 특보 현황 — 유효 ${d.activeCount ?? 0}건 (예고 ${d.upcomingCount ?? 0}건).<br/>${parts.join('<br/>') || '현재 유효 특보 없음'}<br/>지역 점 색상 = 기상청 공식 특보 색 · 좌표는 특보구역 대표점 · ${kstShort(d.generated)}`,
    };
  }

  // ---------- 쓰나미 정보 (PTWC/NWS 공식 채널) ----------
  buildTsunami(d) {
    const items = (d.alerts || [])
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => ({
        lat: a.lat, lon: a.lon,
        c: new THREE.Color(a.category === 'Information' ? '#8fd0ff' : '#ff5f7a'),
      }));
    return this.makePoints(items, { size: 11, lift: 0.005 });
  }

  metaTsunami(d) {
    const rows = (d.alerts || []).map((a) =>
      `${a.category === 'Information' ? 'ℹ️' : '🚨'} ${a.region || a.title} — M${a.magnitude ?? '—'} · ${a.centerName || a.center} · ${kstShort(a.updated)}`);
    const note = `${(d.alerts || []).length}건 (${(d.alerts || []).filter((a) => a.category !== 'Information').length}건 경보) · ${kstShort(d.generated)}`;
    return {
      badge: 'LIVE', note,
      cardHtml: `태평양쓰나미경보센터(PTWC)·NWS 공식 채널 최신 발표 ${(d.alerts || []).length}건.<br/>${rows.join('<br/>') || '현재 발표 없음'}<br/>ℹ️ Information = 쓰나미 위협 평가 정보(경보 아님) · ${kstShort(d.generated)}`,
    };
  }

  // ---------- 서울 실시간 인구 121곳 (R-14 밀도 타워) ----------
  // 지시서 R-01(맨해튼 수직 막대)이 보존하라는 것:
  //   "도시 전체에서 수많은 vertical bars 가 실제 지리 위에 솟고 **time scrub 으로 상태가 바뀌는** 문법"
  //   금지: 평면 heatmap 으로 대체.
  //
  // 서울시 실시간 도시데이터에는 지금 값(OFFICIAL_OBSERVATION)과 그 뒤 12스텝의
  // 공식 예측(OFFICIAL_FORECAST)이 함께 온다. 그래서 시간을 밀면 막대가 실제로 바뀐다.
  // 다만 **관측과 예측을 같은 막대로 그리면 안 된다** — 예측 구간에서는 막대를 비우고
  // 테두리만 남겨 "이건 앞으로의 이야기"라고 눈으로 알게 한다.
  //
  // 예측 지평(약 +24시간)을 넘어가면 값이 없다. 그때는 **감춘다.** 늘려 그리지 않는다.
  buildSeoul(d) {
    const places = (d.places || []).filter((p) => p.position && p.official);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.88 });
    const mesh = new THREE.InstancedMesh(geo, mat, places.length);
    // 각 장소의 시간축: [지금(관측)] + [예측 12스텝]. 값이 없는 스텝은 담지 않는다.
    const mid = (r) => (r && Number.isFinite(r.min) && Number.isFinite(r.max)
      ? (r.min + r.max) / 2 : null);
    const series = places.map((p) => {
      const rows = [{
        t: Date.parse(d.generatedAt) || Date.now(),
        rank: p.official.rank || 1,
        pop: mid(p.official.populationRange),
        color: p.official.color || '#7fd88f',
        level: p.official.level,
        obs: true,
      }];
      for (const f of (p.forecast || [])) {
        const t = Date.parse(f.at);
        if (!Number.isFinite(t)) continue;
        rows.push({
          t, rank: f.rank || 1, pop: mid(f.populationRange),
          color: f.color || p.official.color || '#7fd88f', level: f.level, obs: false,
        });
      }
      rows.sort((a, b) => a.t - b.t);
      return rows;
    });
    mesh.userData.seoul = {
      places, series,
      // 높이는 인구에 **선형** 비례한다. 값이 없으면 단계로 물러난다(그 사실은 카드에 적는다).
      maxPop: Math.max(1, ...series.flat().map((r) => r.pop || 0)),
      horizon: Math.max(...series.flat().map((r) => r.t)),
    };
    this._seoulApply(mesh, 0);
    return mesh;
  }

  // 스크럽한 시각의 막대를 다시 세운다. altKm 을 주면 그 고도에 맞춰 폭도 맞춘다.
  _seoulApply(mesh, offsetMs, altKm) {
    const u = mesh.userData.seoul;
    if (!u) return;
    if (Number.isFinite(altKm)) u.altKm = altKm;
    const at = Date.now() + (offsetMs || 0);
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const UP = new THREE.Vector3(0, 1, 0);
    // 폭은 고도를 따라간다. 2km 고정으로 두면 500km 상공에서 1.5픽셀이라
    // '수많은 막대가 솟는' 문법(R-01)이 화면에서 사라진다. 서울은 30km 남짓이고
    // 이 앱은 300km 아래로 내려가면 지도/지역 3D 로 넘어가므로, 막대가 읽히는
    // 구간이 그 위뿐이다. 위치는 그대로 두고 굵기만 키운다.
    const W = 0.00032 * Math.max(1, Math.min(5, (u.altKm || 400) / 250));
    const H_MAX = 0.0052;         // 최고 인구에서 ~33km (시각 과장)
    let shown = 0;
    let future = false;
    u.places.forEach((p, i) => {
      const rows = u.series[i];
      // 그 시각에 해당하는 값. 예측 지평을 넘어가면 없다 — 늘려 쓰지 않는다.
      let row = null;
      if (Math.abs(offsetMs || 0) <= 60 * 60 * 1000) row = rows[0];
      else if (at <= u.horizon + 30 * 60 * 1000) {
        for (const r of rows) if (r.t <= at + 60 * 60 * 1000) row = r;
      }
      if (!row) { M.makeScale(0, 0, 0); mesh.setMatrixAt(i, M); return; }
      if (!row.obs) future = true;
      const { lat, lon } = p.position;
      // 높이는 인구의 **제곱근**이다. 선형으로 두면 중앙값(9,750명)이 최대(162,500명)의
      // 6%가 되어 막대 대부분이 사라진다 — R-01 이 보존하라는 '수많은 막대가 솟는' 문법이
      // 성립하지 않는다. 값을 바꾸는 게 아니라 자리만 넓히는 것이고, 그 사실은 카드에 적는다.
      const frac = row.pop != null
        ? Math.sqrt(row.pop / u.maxPop)
        : (Math.min(Math.max(row.rank, 1), 4) - 1) / 3 * 0.8 + 0.15;
      const h = 0.0009 + H_MAX * frac;
      const rBase = this.surfR(lat, lon, 0.0002);
      const dir = llToV3(lat, lon, 1).normalize();
      Q.setFromUnitVectors(UP, dir);
      M.compose(dir.clone().multiplyScalar(rBase + h / 2), Q, new THREE.Vector3(W, h, W));
      mesh.setMatrixAt(i, M);
      // 예측 구간은 색을 눌러 관측과 구분한다 — 같은 밝기로 그리면 예보가 관측처럼 읽힌다.
      const c = new THREE.Color(row.color);
      if (!row.obs) c.multiplyScalar(0.55);
      mesh.setColorAt(i, c);
      shown += 1;
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.opacity = future ? 0.66 : 0.88;
    u.shown = shown;
    u.future = future;
  }

  metaSeoul(d) {
    const lv = {};
    (d.places || []).forEach((p) => {
      const k = p.official && p.official.level;
      if (k) lv[k] = (lv[k] || 0) + 1;
    });
    const order = ['붐빔', '약간 붐빔', '보통', '여유'];
    const parts = order.filter((k) => lv[k]).map((k) => `${k} ${lv[k]}곳`);
    const busiest = [...(d.places || [])]
      .sort((a, b) => (b.official?.rank || 0) - (a.official?.rank || 0)).slice(0, 4);
    const stale = d.state === 'STALE';
    const note = `${(d.places || []).length}곳 · ${parts.join(' · ')}${stale ? ' · 지난 관측' : ''}`;
    // 예측 지평은 자료가 말하게 한다 — 숫자를 우리가 적어 두면 자료가 바뀔 때 거짓말이 된다.
    const lastT = Math.max(0, ...(d.places || []).flatMap(
      (p) => (p.forecast || []).map((f) => Date.parse(f.at) || 0),
    ));
    const fcH = lastT ? Math.max(1, Math.round((lastT - Date.now()) / 3.6e6)) : 0;
    const pops = (d.places || []).map((p) => {
      const r = p.official && p.official.populationRange;
      return r && Number.isFinite(r.min) && Number.isFinite(r.max) ? (r.min + r.max) / 2 : null;
    }).filter((x) => x != null).sort((a, b) => a - b);
    const medPop = pops.length ? pops[Math.floor(pops.length / 2)] : 0;
    const maxPop = pops.length ? pops[pops.length - 1] : 0;
    return {
      badge: stale ? 'STALE' : 'OBSERVED', note,
      cardHtml: `서울시 실시간 도시데이터 — 주요 ${(d.places || []).length}장소의 혼잡을 `
        + `<b>수직 막대</b>로 세웁니다. 색은 서울시 공식 4단계 색 그대로.<br/>${parts.join(' · ')}<br/>`
        + `가장 붐빔: ${busiest.map((p) => `${p.nameKo}(${p.official.level})`).join(' · ')}<br/><br/>`
        + `<b>하단 시간을 밀면 막대가 바뀝니다.</b> 지금은 <b>서울시 공식 관측</b>이고, `
        + `앞으로는 <b>서울시 공식 예측</b>입니다(+${fcH}시간까지). 예측 구간에서는 막대 색을 `
        + `눌러 관측과 구분합니다 — 같은 밝기로 그리면 예보가 관측처럼 읽힙니다.<br/>`
        + `예측이 끝나는 시각을 넘기면 <b>막대를 감춥니다</b>. 값이 없는 시간을 늘려 그리지 않습니다.<br/>`
        + `<b>높이</b>는 발표된 인구 범위의 가운데 값의 <b>제곱근</b>에 비례합니다 — `
        + `선형으로 두면 중앙값(약 ${Math.round(medPop).toLocaleString()}명)이 최대`
        + `(${Math.round(maxPop).toLocaleString()}명)의 6%가 되어 막대 대부분이 사라집니다. `
        + `값이 아니라 자리를 넓힌 것입니다. 인구 범위 자체는 서울시가 밴드로 발표합니다.<br/>`
        + `${stale ? '⚠ 지난 관측(STALE) — 최신 관측 대기 중 · ' : ''}${kstShort(d.generatedAt)}`,
    };
  }

  // ---------- 지역 뉴스 (각 지역 매체 RSS · 지역 단위) ----------
  // 기사에는 좌표가 없다 — 지역 대표점에 묶어 표시하고 "지역 단위"임을 카드에 밝힌다.
  buildNews(d) {
    const g = new THREE.Group();
    const items = d.items || [];
    const by = {};
    for (const it of items) {
      if (!NEWS_REGION[it.region]) continue;
      (by[it.region] = by[it.region] || []).push(it);
    }
    this._newsBy = by;
    const keys = Object.keys(by);
    if (!keys.length) return g;
    const maxN = Math.max(...keys.map((k) => by[k].length));
    keys.forEach((k) => {
      const [lat, lon] = NEWS_REGION[k];
      const n = by[k].length;
      const c = new THREE.Color(0xec7aa6);
      const p = llToV3(lat, lon, this.surfR(lat, lon, 0.004));
      const up = p.clone().normalize();
      const h = 0.006 + (n / maxN) * 0.03;
      const pos = new Float32Array([p.x, p.y, p.z, p.x + up.x * h, p.y + up.y * h, p.z + up.z * h]);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
        color: c, transparent: true, opacity: 0.8, depthWrite: false,
      })));
    });
    g.add(this.makePoints(keys.map((k) => ({ lat: NEWS_REGION[k][0], lon: NEWS_REGION[k][1], c: new THREE.Color(0xec7aa6) })),
      { size: 9, lift: 0.004, additive: true }));
    return g;
  }

  metaNews(d) {
    const by = this._newsBy || {};
    const keys = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
    const rows = keys.map((k) => {
      const list = by[k].slice(0, 3).map((it) => {
        const t = new Date(it.utc);
        const ago = Number.isNaN(t.getTime()) ? '' : `${Math.max(0, Math.round((Date.now() - t.getTime()) / 3600000))}시간 전`;
        return `&nbsp;&nbsp;<a href="${it.link}" target="_blank" rel="noopener">${(it.title || '').slice(0, 46)}</a> <span style="color:var(--text-dim)">${it.source} · ${ago}</span>`;
      }).join('<br/>');
      return `<b>${k}</b> ${by[k].length}건<br/>${list}`;
    }).join('<br/>');
    const note = `${(d.items || []).length}건 · ${keys.map((k) => `${k} ${by[k].length}`).join(' · ')}`;
    return {
      badge: 'LIVE', note,
      cardHtml: `세계 각 지역 매체가 지금 내보내는 헤드라인입니다 — 기사에 좌표가 없어 <b>지역 대표점</b>에 묶어 세웠습니다(막대 높이 = 기사 수). 특정 지점의 사건 위치가 아닙니다.<br/>${rows}<br/>`
        + `출처 ${(d.source || '').slice(0, 120)}<br/>헤드라인·링크만 표시하며 본문은 각 매체에서 확인하세요 · ${(d.generated || '').replace('T', ' ').slice(0, 16)}Z`,
    };
  }

  // 국가 카드가 레이어와 무관하게 쓸 수 있는 인구 조회.
  // 예전엔 buildPop 안의 지역 변수라, 인구 레이어를 켠 적 없으면 국가 카드가 늘 UNAVAILABLE이었다.
  countryPop(iso3) {
    if (!iso3) return Promise.resolve(null);
    if (!this._popByIso) {
      this._popByIso = fetchJson('/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1', 25000, 'https://api.worldbank.org')
        .then((wb) => {
          const map = {};
          for (const r of (wb && wb[1]) || []) {
            if (r && r.value && r.countryiso3code) {
              map[r.countryiso3code] = { v: r.value, year: r.date, name: r.country && r.country.value };
            }
          }
          return map;
        })
        .catch(() => null);
    }
    return this._popByIso.then((m) => (m ? m[iso3] || null : null));
  }

  // ---------- 국가 인구 (World Bank 최신 관측값) ----------
  buildPop(d) {
    const rows = (d.wb && d.wb[1]) || [];
    const feats = (d.cr && (d.cr.features || d.cr)) || [];
    const byIso = {};
    for (const r of rows) {
      if (r && r.value && r.countryiso3code) byIso[r.countryiso3code] = { v: r.value, year: r.date, name: r.country && r.country.value };
    }
    // 레이어를 켜는 김에 카드용 캐시도 채워 둔다
    if (!this._popByIso) this._popByIso = Promise.resolve(byIso);
    // 국가 폴리곤 최대 조각의 bbox 중심 (해외영토·반자오선 왜곡 회피)
    const centers = [];
    for (const f of feats) {
      const p = f.properties || f;
      const rec = byIso[p.code3];
      if (!rec) continue;
      const geo = p.geometry || f.geometry;
      if (!geo) continue;
      const polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates;
      let best = null;
      let bestA = -1;
      for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 3) continue;
        let x0 = 180; let x1 = -180; let y0 = 90; let y1 = -90;
        for (const [lo, la] of ring) {
          if (lo < x0) x0 = lo; if (lo > x1) x1 = lo;
          if (la < y0) y0 = la; if (la > y1) y1 = la;
        }
        const a = (x1 - x0) * (y1 - y0);
        if (a > bestA) { bestA = a; best = [(y0 + y1) / 2, (x0 + x1) / 2]; }
      }
      if (best) centers.push({ lat: best[0], lon: best[1], v: rec.v, year: rec.year, ko: p.nameKo, iso: p.code3 });
    }
    this._popRows = centers.sort((a, b) => b.v - a.v);
    const g = new THREE.Group();
    if (!centers.length) return g;
    // 높이 = 인구의 세제곱근 비례 (선형이면 인도·중국만 보이고 나머지가 사라진다 — 표현 규약 명시)
    const maxC = Math.cbrt(Math.max(...centers.map((c) => c.v)));
    const pos = new Float32Array(centers.length * 6);
    const col = new Float32Array(centers.length * 6);
    centers.forEach((c, i) => {
      const f = Math.cbrt(c.v) / maxC;
      const p = llToV3(c.lat, c.lon, this.surfR(c.lat, c.lon, 0.001));
      const up = p.clone().normalize();
      const h = 0.004 + f * 0.10;
      const cc = new THREE.Color().setHSL(0.92 - f * 0.12, 0.75, 0.35 + f * 0.30);
      pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
      pos[i * 6 + 3] = p.x + up.x * h;
      pos[i * 6 + 4] = p.y + up.y * h;
      pos[i * 6 + 5] = p.z + up.z * h;
      col[i * 6] = cc.r * 0.2; col[i * 6 + 1] = cc.g * 0.2; col[i * 6 + 2] = cc.b * 0.2;
      col[i * 6 + 3] = cc.r; col[i * 6 + 4] = cc.g; col[i * 6 + 5] = cc.b;
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    })));
    return g;
  }

  metaPop(d) {
    const rows = this._popRows || [];
    const top = rows.slice(0, 6);
    const year = rows.length ? rows[0].year : '';
    const fmtP = (v) => (v >= 1e8 ? `${(v / 1e8).toFixed(2)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString()}만` : v.toLocaleString());
    return {
      badge: 'OBSERVED', note: `${rows.length}개국 · ${year}년 · 최대 ${top[0] ? fmtP(top[0].v) : '—'}`,
      cardHtml: `국가별 인구 — ${rows.length}개국의 최신 공식 통계를 기둥 높이로 세웠습니다.<br/>`
        + `${top.map((c) => `${c.ko || c.iso} <b>${fmtP(c.v)}</b>`).join(' · ')}<br/>`
        + `높이는 인구의 <b>세제곱근</b>에 비례합니다 — 선형이면 상위 2개국만 보이고 나머지가 사라지기 때문이며, 실제 값은 위 수치입니다.<br/>`
        + `기둥은 국가 최대 조각의 중심에 하나씩 세운 <b>국가 총계</b>입니다 — 국내 인구 분포(밀도)가 아닙니다.<br/>`
        + `출처 World Bank SP.POP.TOTL (${year}년 최신값) · 국가 경계 Natural Earth`,
    };
  }

  // ---------- 해양 필드 (격자 → 해수면 위 얇은 셸) ----------
  // 결측(null) 셀은 알파 0 — 육지·미관측 해역을 채우지 않는다.
  // 바다는 지오메트리상 정확히 반경 1.0(수심은 변위 없음)이라 1.0012 셸이면 딱 위에 앉는다.
  // opts.radius: 대기 격자는 과장된 지형에 파묻히므로 구름처럼 지형 위에 얹는다.
  //              바다 격자(수온·파고)는 해수면이 정확히 r=1이라 기본값 그대로 쓴다.
  buildField(d, key, ramp, opts = {}) {
    const arr = d[key];
    if (!arr) throw new Error(`${key} 격자 없음`);
    const { nx, ny, res, lat0, lon0 } = d;
    const CW = Math.round(360 / res);
    const CH = Math.round(180 / res);
    const can = document.createElement('canvas');
    can.width = CW;
    can.height = CH;
    const ctx = can.getContext('2d');
    const img = ctx.createImageData(CW, CH);
    let n = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < ny; y += 1) {
      const lat = lat0 + y * res;
      const py = Math.floor((90 - lat) / res);
      if (py < 0 || py >= CH) continue;
      for (let x = 0; x < nx; x += 1) {
        const v = arr[y * nx + x];
        if (v == null) continue;
        const lon = lon0 + x * res;
        const px = ((Math.floor((lon + 180) / res) % CW) + CW) % CW;
        const c = ramp(v);
        if (!c) continue;              // ramp가 null이면 '칠하지 않음' — 0을 값으로 그리지 않는다
        const o = (py * CW + px) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 235;
        n += 1;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    ctx.putImageData(img, 0, 0);
    this._fieldStat = { n, min, max };
    const tex = new THREE.CanvasTexture(can);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.generateMipmaps = false;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.radius || 1.0012, 256, 128),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: opts.opacity || 0.82, depthWrite: false,
      }),
    );
    mesh.rotation.y = -Math.PI / 2; // 구면 UV(경도 0 기준)와 렌더 좌표 정렬
    mesh.renderOrder = 2;
    return mesh;
  }

  // ---------- 전지구 산불 화점 (NASA FIRMS · VIIRS 375m NRT) ----------
  buildFireGlobal(d) {
    const items = (d.items || [])
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => {
        // 색은 화재복사에너지(FRP) — 세기이지 크기가 아니다
        const t = Math.min(1, Math.log10(Math.max(1, f.frp || 1)) / 4);
        return {
          lat: f.lat,
          lon: f.lon,
          c: { r: 1, g: 0.85 - t * 0.62, b: 0.28 - t * 0.24 },
        };
      });
    return this.makePoints(items, { size: 4.5, lift: 0.003, opacity: 0.92, additive: true });
  }

  metaFireGlobal(d) {
    const shown = (d.items || []).length;
    const note = `${shown.toLocaleString()}곳 표시 · 최근 24시간 · ${kstShort(d.generated)}`;
    return {
      badge: 'OBSERVED', note,
      cardHtml: `<b>전지구 산불 화점</b> — 위성이 최근 24시간에 잡은 열점입니다.<br/>`
        + `탐지 ${Number(d.detections || 0).toLocaleString()}건을 ${Number(d.clusterKm || 0)}km로 묶어 화재 ${Number(d.fires || 0).toLocaleString()}곳, `
        + `그중 <b>${shown.toLocaleString()}곳</b>만 화면에 그립니다 — 나머지는 생략했을 뿐 없는 것이 아닙니다.<br/>`
        + `${d.newFires != null ? `24시간 새로 생긴 불 ${Number(d.newFires).toLocaleString()}곳 · ` : ''}색은 화재복사에너지(FRP) 세기입니다.<br/>`
        + `<b>열점 = 산불은 아닙니다</b> — 화산·가스 플레어·농경지 소각도 잡히고, 구름에 가린 불은 안 잡힙니다.<br/>`
        + `출처 ${d.source || 'NASA FIRMS'} · ${d.credit || ''} · ${kstShort(d.generated)}`,
    };
  }

  // ---------- 전지구 바람 격자 (속력장) ----------
  buildWindGrid(d) {
    if (!d._spd) {
      const u = d.u || [];
      const v = d.v || [];
      const spd = new Array(u.length);
      for (let i = 0; i < u.length; i += 1) {
        spd[i] = (u[i] == null || v[i] == null) ? null : Math.hypot(u[i], v[i]);
      }
      d.spd = spd;
      d._spd = true;
    }
    return this.buildField(d, 'spd', SPD_RAMP, this.airShell());
  }

  // 과장된 지형(최대 9km × 과장)보다 위에 얹을 반지름 — 구름 셸과 같은 계산
  airShell() {
    const ex = this.getExagger ? this.getExagger() : 1;
    return { radius: 1.004 + (ex * 9000) / 6371000, opacity: 0.7 };
  }

  // 전지구 격자 공통 카드 — 값·범위·출처를 그대로 적는다
  metaGrid(d, key) {
    const s = this._fieldStat || {};
    const INFO = {
      rain: ['강수', 'mm', '시간당 강수량 — <b>0.1mm 미만은 칠하지 않습니다</b>(안 오는 곳을 비로 그리지 않기 위해)', 'Open-Meteo (GFS/ECMWF)'],
      t: ['기온', '°C', '지상 2m 기온', 'Open-Meteo (GFS/ECMWF)'],
      mslp: ['해면기압', 'hPa', '해면 환산 기압 — 저기압(붉은색)이 폭풍의 자리입니다', 'Open-Meteo (GFS/ECMWF)'],
      spd: ['풍속', 'm/s', '지상 10m 바람의 세기(방향은 바람 관측 레이어)', 'Open-Meteo (GFS/ECMWF)'],
      pm25: ['초미세먼지 PM2.5', '㎍/㎥', '한국 환경부 4등급 색(좋음·보통·나쁨·매우나쁨) 기준', 'Open-Meteo Air Quality (CAMS)'],
      uv: ['자외선 지수', '', '밤(0)은 칠하지 않습니다', 'Open-Meteo Air Quality (CAMS)'],
    };
    const [ko, unit, desc, src] = INFO[key] || [key, '', '', d.source || ''];
    const rng = Number.isFinite(s.min) ? `${s.min.toFixed(1)} ~ ${s.max.toFixed(1)}${unit}` : '—';
    const note = `${(s.n || 0).toLocaleString()}칸 · ${rng} · ${kstShort(d.time)}`;
    return {
      badge: 'MODEL', note,
      cardHtml: `<b>전지구 ${ko}</b> — ${Math.round(360 / d.res)}×${Math.round(180 / d.res)} (${d.res}°) 격자 중 값이 있는 <b>${(s.n || 0).toLocaleString()}칸</b>을 칠합니다.<br/>`
        + `${desc}<br/>관측 범위 ${rng}<br/>`
        + `이 격자는 <b>관측이 아니라 수치예보 모델값</b>입니다 — 관측이 필요하면 지점 관측 레이어를 쓰세요.<br/>`
        + `지형 과장(${this.getExagger ? Math.round(this.getExagger()) : 1}×) 때문에 산에 파묻히지 않도록 <b>대기층 높이</b>에 얹어 그립니다.<br/>`
        + `출처 ${d.source || src} · 기준시각 ${kstShort(d.time)}`,
    };
  }

  // ---------- 해외 기상 특보 (미국 NWS) ----------
  buildWarnWorld(d) {
    const items = (d.alerts || [])
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => {
        const hex = (a.color || '#ff5f7a').replace('#', '');
        const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
        return {
          lat: a.lat,
          lon: a.lon,
          c: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
        };
      });
    return this.makePoints(items, { size: 10, lift: 0.006, opacity: 0.95 });
  }

  metaWarnWorld(d) {
    const kinds = Object.entries(d.kinds || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      badge: 'OFFICIAL_FORECAST',
      note: `${Number(d.count || 0)}건 · ${kstShort(d.generated)}`,
      cardHtml: `<b>미국 기상 특보</b> — 미국 국립기상청이 지금 내놓은 유효 특보 <b>${Number(d.count || 0)}건</b>입니다.<br/>`
        + `${kinds.map(([k, v]) => `${k} ${v}건`).join(' · ')}<br/>`
        + `색은 발표 기관이 정한 색 그대로이고, 좌표가 없는 특보는 그리지 않습니다${d.unplaced ? ` (${d.unplaced}건)` : ''}.<br/>`
        + `출처 ${d.source || 'NWS'} · ${d.license || ''} · ${kstShort(d.generated)}`,
    };
  }

  // ---------- 기상청 레이더 (지구에 얹지 않고 원본 영상 그대로) ----------
  metaRadar(d) {
    const frames = Array.isArray(d.frames) && d.frames.length ? d.frames : [];
    const latest = frames.length ? frames[frames.length - 1] : null;
    const path = String((latest && latest.url) || (d.image && d.image.url) || '/wind/kma-radar.png').replace(/^\//, '');
    const url = `${S3}/${path}`;
    return {
      badge: 'OBSERVED',
      note: `${d.unit || 'mm/h'} · ${frames.length}장 · ${kstShort(d.generated)}`,
      cardHtml: `<b>기상청 레이더 강수</b> — 이 앱에서 <b>지금 실제로 내리는 비</b>를 보는 유일한 화면입니다(나머지 강수는 예보 모델).<br/>`
        + `<img src="${url}" alt="기상청 HSR 레이더 강수 합성영상" `
        + `style="width:100%;border-radius:8px;margin:8px 0;background:#0a0f14" loading="lazy" />`
        + `<b>지구본 위에 겹치지 않습니다</b> — 원본 영상에 좌표계가 따로 없어서, 억지로 얹으면 위치가 틀어집니다. 기상청이 그린 그대로 보여 줍니다.<br/>`
        + `단위 ${d.unit || 'mm/h'} · ${d.updateMinutes || 5}분 주기 · 최근 ${frames.length}장 보관<br/>`
        + `출처 ${d.source || 'KMA'} · ${d.license || ''} · ${kstShort(d.generated)}`,
    };
  }

  // ---------- 태양 활동 실황 (SDO 이미지 + GOES X선) ----------
  metaSolarAct(d) {
    const cls = d.flareClass || '—';
    const lvl = String(cls)[0];
    const KO = {
      A: '아주 조용함', B: '조용함', C: '작은 플레어',
      M: '중간 플레어 — 극지 통신 영향 가능', X: '큰 플레어 — 통신·위성 영향',
    };
    return {
      badge: 'OBSERVED',
      note: `X선 등급 ${cls} · ${kstShort(d.generated)}`,
      cardHtml: `<b>오늘의 태양</b> — 지금 태양이 어떤 상태인지 실제 관측으로 봅니다.<br/>`
        + `<img src="${S3}/${(d.image || 'solar/latest.jpg').replace(/^\//, '')}" alt="NASA SDO AIA 193Å 태양 관측 영상" `
        + `style="width:100%;border-radius:10px;margin:8px 0;background:#0a0f14" loading="lazy" />`
        + `X선 등급 <b>${cls}</b>${KO[lvl] ? ` — ${KO[lvl]}` : ''}<br/>`
        + `X선 플럭스 ${d.xrayFlux != null ? `${Number(d.xrayFlux).toExponential(2)} W/m²` : 'UNAVAILABLE'} (GOES 1~8Å 관측값)<br/>`
        + `사진은 <b>SDO AIA 193Å</b> — 눈에 보이는 빛이 아니라 100만 도 코로나의 극자외선입니다.<br/>`
        + `출처 ${d.source || 'NASA SDO · NOAA SWPC'} · ${kstShort(d.generated)}`,
    };
  }

  // ---------- 국립해양조사원 미래 해수면 상승 전망 (SSP 시나리오, cm) ----------
  buildKhoaSl(d, ssp) {
    const sc = (d.scenarios || {})[ssp];
    if (!sc) throw new Error(`${ssp} 시나리오 없음`);
    // 한 시나리오 안에서는 값이 거의 균일하다(SSP585: 5~95%가 65~72cm). 절대 눈금(0~80)으로
    // 칠하면 시나리오마다 단색 판이 된다. 그래서 색은 **이 시나리오 안의 상대 차이**(5~95% 구간)로 펴고,
    // 시나리오 사이 비교는 카드의 숫자로 한다. 이 선택을 카드에 그대로 적는다.
    const vals = sc.val.filter((v) => v != null).sort((x, y) => x - y);
    const p5 = vals[Math.floor(vals.length * 0.05)] ?? sc.min;
    const p95 = vals[Math.floor(vals.length * 0.95)] ?? sc.max;
    const span = Math.max(0.5, p95 - p5);
    const items = [];
    for (let i = 0; i < d.n; i += 1) {
      const v = sc.val[i];
      if (v == null) continue;                      // 좌표 불일치 점은 비운다
      const t = Math.max(0, Math.min(1, (v - p5) / span));
      const c = SLR_KHOA_RAMP(t * 80);
      items.push({ lat: d.lat[i], lon: d.lon[i], c: { r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 } });
    }
    this._khoaSlStat = { n: items.length, ssp, min: sc.min, max: sc.max, p5, p95 };
    return this.makePoints(items, { size: 3.4, lift: 0.0012, opacity: 0.72 });
  }

  metaKhoaSl(d, ssp) {
    const s = this._khoaSlStat || {};
    const KO = {
      SSP126: 'SSP1-2.6 · 저배출(탄소중립 달성)',
      SSP245: 'SSP2-4.5 · 중간 배출',
      SSP370: 'SSP3-7.0 · 고배출',
      SSP585: 'SSP5-8.5 · 최고 배출(화석연료 지속)',
    };
    const others = Object.keys(d.scenarios || {}).filter((k) => k !== ssp)
      .map((k) => `${k} 최대 ${d.scenarios[k].max}cm`).join(' · ');
    return {
      badge: 'MODEL_SIGNAL',
      note: `${(s.n || 0).toLocaleString()}점 · ${s.min}~${s.max}cm · ${ssp}`,
      cardHtml: `<b>우리 바다 해수면 상승 전망 — ${KO[ssp] || ssp}</b><br/>`
        + `국립해양조사원의 <b>지역 해양기후 수치모델</b>이 시나리오별로 계산한 해수면 상승폭입니다. `
        + `NASA/IPCC 전 세계 조위관측소(24곳)보다 훨씬 촘촘한 <b>격자 ${(s.n || 0).toLocaleString()}점</b>(위도 0.042° × 경도 0.05°)이 우리 해역을 덮습니다.<br/>`
        + `이 시나리오 범위 <b>${s.min} ~ ${s.max}cm</b> · 다른 시나리오: ${others}<br/>`
        + `색은 <b>이 시나리오 안에서의 상대 차이</b>입니다 — 옅은 쪽이 ${s.p5}cm, 자주색 쪽이 ${s.p95}cm(5~95% 구간). `
        + `시나리오끼리는 값이 거의 겹치지 않아 절대 눈금으로 칠하면 단색 판이 되기에 이렇게 폅니다. 시나리오 간 비교는 위 숫자로 하세요.<br/>`
        + `${d.unitNote || ''}<br/>`
        + `<b>이것은 예보가 아니라 시나리오 전망</b>입니다 — 배출 경로에 따라 갈리는 폭 자체가 메시지입니다.<br/>`
        + `격자는 해역 값입니다. 국가 경계 폴리곤과 겹쳐 보면 61점이 육지 안으로 들어오는데, 이는 남서 다도해의 경계 단순화 때문이며 값을 지우거나 옮기지 않았습니다.<br/>`
        + `<b>가까이 가면 서서히 사라집니다</b> — 격자 간격이 약 5km라 도시 축척에서는 점 사이가 벌어져 읽을 수 없기 때문입니다. 값을 지운 것이 아니라 이 축척에서 읽지 말라는 뜻입니다. 권역 시점(고도 900km 이상)에서 온전히 보입니다.<br/>`
        + `출처 ${d.source} · ${d.via} · ${d.license} · 수집 ${(d.generated || '').slice(0, 10)}`,
    };
  }

  // ---------- 연안 침수 범위 (국립해양조사원 침수 예상도, 시군구별 온디맨드) ----------
  buildFloodIndex(d) {
    const rows = (d.districts || []).filter((r) => r.count > 0 && r.bbox);
    const items = rows.map((r) => {
      const t = Math.min(1, Math.log10(1 + r.count) / 3);
      return {
        lat: (r.bbox[1] + r.bbox[3]) / 2,
        lon: (r.bbox[0] + r.bbox[2]) / 2,
        c: { r: 0.35 + t * 0.55, g: 0.7 - t * 0.3, b: 1.0 },
      };
    });
    const g = new THREE.Group();
    g.add(this.makePoints(items, { size: 9, lift: 0.006, opacity: 0.95 }));
    this._floodDistricts = rows;
    this._floodSel = null;
    return g;
  }

  metaFloodIndex(d) {
    const rows = (this._floodDistricts || []).slice().sort((a, b) => b.count - a.count);
    const buttons = rows.map((r) =>
      `<button class="simgo" style="margin:2px 3px 2px 0;padding:3px 8px;font-size:10.5px" `
      + `data-action="flood-district" data-sgg="${r.sggCd}">${r.name} <i style="opacity:.6">${r.count}</i></button>`).join('');
    const empty = (d.districts || []).filter((r) => !r.count).map((r) => r.name);
    return {
      badge: 'OFFICIAL_OBSERVATION',
      note: `${rows.length}곳 자료 · 침수면 ${Number(d.totalPolygons || 0).toLocaleString()}개`,
      cardHtml: `<b>연안 침수 범위 — 국립해양조사원 침수 예상도</b><br/>`
        + `시군구를 누르면 그 지역의 <b>침수 예상 범위</b>가 지형 위에 실제 폴리곤으로 올라옵니다. 색은 침수 깊이 구간(m).<br/>`
        + `<div style="margin:8px 0 6px">${buttons}</div>`
        + `${d.note || ''}<br/>`
        + `${empty.length ? `자료가 비어 있는 곳: ${empty.join(' · ')} — 없는 것을 그리지 않습니다.<br/>` : ''}`
        + `출처 ${d.source || '국립해양조사원'} · ${d.license || ''} · 수집 ${(d.generated || '').slice(0, 10)}`,
    };
  }

  // 시군구 하나의 침수 폴리곤을 받아 채운다. 반환: { name, count, bbox, classes } 또는 null
  async loadFloodDistrict(code) {
    const l = this.layers.khoaflood;
    if (!l || !l.on) return null;
    const d = await fetchJson(`/ocean/khoa/flood/${code}.json`, 30000);
    if (!d || !d.features) return null;
    if (this._floodMesh) { l.obj.remove(this._floodMesh); this.disposeObj(this._floodMesh); this._floodMesh = null; }
    const toV2 = (flat) => {
      const out = [];
      for (let i = 0; i + 1 < flat.length; i += 2) out.push(new THREE.Vector2(flat[i], flat[i + 1]));
      return out;
    };
    const pos = [];
    const col = [];
    const idx = [];
    let base = 0;
    for (const f of d.features) {
      const low = parseFloat(String(f.v).split('-')[0]);
      const c = FLOOD_RAMP(Number.isFinite(low) ? low : 0);
      for (const poly of f.g) {
        const shape = new THREE.Shape(toV2(poly[0]));
        for (let h2 = 1; h2 < poly.length; h2 += 1) shape.holes.push(new THREE.Path(toV2(poly[h2])));
        let geo;
        try { geo = new THREE.ShapeGeometry(shape); } catch (e) { continue; }
        // 침수 예상 범위는 수평면이다. 정점마다 지형을 따로 읽으면 과장 50배가 곱해져
        // 한 면이 수직 벽으로 찢어진다(실측: 삼각형 668개가 5km 초과, 최대 7km).
        // → 면 하나는 그 면 중심의 지형 높이 한 값에 통째로 놓는다.
        //    위치(경위도)는 원자료 그대로고, 통일한 것은 높이뿐이다.
        const ring0 = poly[0];
        let sLon = 0; let sLat = 0; let nPt = 0;
        for (let i = 0; i + 1 < ring0.length; i += 2) { sLon += ring0[i]; sLat += ring0[i + 1]; nPt += 1; }
        const rFace = nPt ? this.surfR(sLat / nPt, sLon / nPt, 0.0022) : 1.0022;
        const p2 = geo.attributes.position;
        for (let i = 0; i < p2.count; i += 1) {
          const v = llToV3(p2.getY(i), p2.getX(i), rFace);
          pos.push(v.x, v.y, v.z);
          col.push(c[0] / 255, c[1] / 255, c[2] / 255);
        }
        const ix = geo.index ? geo.index.array : null;
        if (ix) for (let i = 0; i < ix.length; i += 1) idx.push(ix[i] + base);
        base += p2.count;
        geo.dispose();
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide,
    }));
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    l.obj.add(mesh);
    this._floodMesh = mesh;
    this._floodSel = { code, name: d.name, count: d.count, bbox: d.bbox, classes: d.classes, unit: d.unit };
    return this._floodSel;
  }

  // 지금 침수 시군구가 선택돼 있나 — 카메라 근접 허용 판단에 쓴다
  floodSelected() {
    return !!(this._floodSel && this._floodMesh);
  }

  floodDistrictCardHtml() {
    const s = this._floodSel;
    if (!s) return '';
    const cls = Object.entries(s.classes || {}).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .map(([k, v]) => `${k}m ${v}면`).join(' · ');
    return `<b>${s.name} 침수 예상 범위</b> — 폴리곤 ${s.count.toLocaleString()}면<br/>`
      + `깊이 구간별: ${cls}<br/>`
      + `침수값은 기관이 산출한 <b>깊이 구간</b>이며 저희가 계산하지 않았습니다. 지형 과장 위에 얹혀 있어 위치는 정확하고 높이는 표현용입니다.<br/>`
      + `면 하나는 <b>수평면</b>으로 놓았습니다 — 면 안에서 과장된 지형을 따라가게 두면 면이 수직으로 찢어지기 때문입니다. 경위도는 원자료 그대로이고, 통일한 것은 높이뿐입니다.`;
  }

  // ---------- 평년 대비 기온 (실황 − 1991~2020 평년) ----------
  buildTempAnom(d) {
    const norms = (d.norm && d.norm.normals) || {};
    // 연중 일자(1~366) — 평년값 배열의 색인
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const doy = Math.floor((Date.now() - start) / 86400000);
    const rows = [];
    let missing = 0;
    for (const st of (d.aws && d.aws.stations) || []) {
      if (st.lat == null || st.lon == null || st.temp_c == null) continue;
      const arr = norms[String(st.id)];
      const rec = arr && arr[Math.min(arr.length - 1, Math.max(0, doy - 1))];
      const nAvg = rec && rec[0];
      if (nAvg == null) { missing += 1; continue; }   // 평년값 없는 지점은 그리지 않는다
      rows.push({ ...st, anom: st.temp_c - nAvg, normal: nAvg });
    }
    rows.sort((a, b) => b.anom - a.anom);
    this._anomStat = {
      n: rows.length,
      missing,
      doy,
      hot: rows[0],
      cold: rows[rows.length - 1],
      period: (d.norm && d.norm.period) || '1991-2020',
      at: (d.aws && d.aws.observedKst) || '',
    };
    const items = rows.map((r) => {
      const t = Math.max(-1, Math.min(1, r.anom / 6));  // ±6°C를 양 끝으로
      return {
        lat: r.lat,
        lon: r.lon,
        c: t >= 0
          ? { r: 0.95, g: 0.72 - t * 0.5, b: 0.45 - t * 0.4 }
          : { r: 0.45 + t * 0.35, g: 0.72 + t * 0.2, b: 0.98 },
      };
    });
    return this.makePoints(items, { size: 9, lift: 0.005, opacity: 0.95 });
  }

  metaTempAnom(d) {
    const s = this._anomStat || {};
    const one = (r) => (r ? `${r.name || r.id} ${r.anom >= 0 ? '+' : ''}${r.anom.toFixed(1)}°C (지금 ${r.temp_c}°C · 평년 ${r.normal}°C)` : '—');
    return {
      badge: 'DERIVED',
      note: `${s.n || 0}지점 · 최고 ${s.hot ? `${s.hot.anom >= 0 ? '+' : ''}${s.hot.anom.toFixed(1)}°C` : '—'} · ${s.at}`,
      cardHtml: `<b>지금 평년보다 몇 도인가</b> — 기상청 실황 기온에서 <b>${s.period} 평년값</b>을 뺀 값입니다.<br/>`
        + `붉을수록 평년보다 덥고 푸를수록 춥습니다 (±6°C를 양 끝으로).<br/>`
        + `<b>가장 더운 곳</b> ${one(s.hot)}<br/><b>가장 추운 곳</b> ${one(s.cold)}<br/>`
        + `${s.n || 0}지점 · 평년값이 없는 ${s.missing || 0}지점은 그리지 않습니다(값 생성 금지) · 연중 ${s.doy}일째 기준<br/>`
        + `<b>이 편차는 파생값(DERIVED)입니다</b> — 실황과 평년은 각각 원값 그대로이고, 뺄셈만 이 앱이 했습니다.<br/>`
        + `평년값은 기준 기간마다 다릅니다 — 다른 기간과 섞어 쓰면 안 됩니다.<br/>`
        + `출처 ${(d.norm && d.norm.source) || 'KMA 평년값'} · 실황 ${(d.aws && d.aws.source) || 'KMA AWS'} · ${s.at}`,
    };
  }

  // ---------- 오로라 예보 (NOAA SWPC OVATION) ----------
  buildAurora(d) {
    const rows = d.coordinates || [];
    // 값 0은 '오로라 없음'이라는 관측 결과다 — 그리지 않는 것이 맞다
    let maxV = 0;
    for (const r of rows) if (r[2] > maxV) maxV = r[2];
    // OVATION 값은 그 칸에서 오로라가 보일 확률(%)이다. 1~4%까지 다 찍으면
    // 북반구 절반이 덮여 실제보다 훨씬 넓어 보인다 — 기준을 정하고 그 사실을 밝힌다.
    const MIN = 5;
    const items = [];
    let nonzero = 0;
    for (const [lon0, lat, v] of rows) {
      if (!v) continue;
      nonzero += 1;
      if (v < MIN) continue;
      const lon = lon0 > 180 ? lon0 - 360 : lon0;
      const t = Math.min(1, (v - MIN) / Math.max(1, maxV - MIN));
      // 초록(약) → 자홍(강): 실제 오로라 색 순서와 같은 방향
      items.push({ lat, lon, c: { r: 0.12 + t * 0.88, g: 0.92 - t * 0.42, b: 0.4 + t * 0.5 } });
    }
    this._auroraStat = { shown: items.length, nonzero, total: rows.length, maxV, min: MIN };
    return this.makePoints(items, { size: 3.2, lift: 0.012, opacity: 0.6, additive: true });
  }

  metaAurora(d) {
    const s = this._auroraStat || {};
    const obs = (d['Observation Time'] || '').replace('T', ' ').slice(0, 16);
    const fc = (d['Forecast Time'] || '').replace('T', ' ').slice(0, 16);
    return {
      badge: 'OFFICIAL_FORECAST',
      note: `${(s.shown || 0).toLocaleString()}칸 · 최대 ${s.maxV || 0} · ${fc}Z`,
      cardHtml: `<b>오로라 예보</b> — 지금 어디서 오로라가 보일 가능성이 있는지입니다.<br/>`
        + `전지구 1°×1° ${(s.total || 0).toLocaleString()}칸 중 확률이 0이 아닌 칸은 ${(s.nonzero || 0).toLocaleString()}개이고, `
        + `그중 <b>${s.min}% 이상인 ${(s.shown || 0).toLocaleString()}칸</b>만 그립니다 — ${s.min}% 미만은 있지만 사실상 안 보이는 값이라 뺐습니다(뺀 사실을 여기 적습니다).<br/>`
        + `숫자는 그 칸에서 오로라가 보일 확률이고 지금 최대 <b>${s.maxV || 0}%</b>입니다. 초록에서 자홍으로 갈수록 강합니다.<br/>`
        + `관측 기준 ${obs}Z → <b>예보 시각 ${fc}Z</b> (약 30~90분 뒤)<br/>`
        + `구름이 끼면 하늘이 밝아도 안 보입니다 — 구름 레이어와 함께 보세요.<br/>`
        + `출처 NOAA SWPC OVATION Aurora Forecast · 미국 정부 저작물(퍼블릭 도메인)`,
    };
  }

  // GIBS 타일 캔버스를 얇은 셸로 — 알파 0인 곳(관측 없음)은 그대로 비운다
  buildGibsShell(d) {
    const tex = new THREE.CanvasTexture(d.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.generateMipmaps = false;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.0014, 256, 128),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.86, depthWrite: false }),
    );
    mesh.rotation.y = -Math.PI / 2;
    mesh.renderOrder = 2;
    return mesh;
  }

  metaGibs(d, kind) {
    const INFO = {
      seaice: ['해빙 농도', '바다 얼음이 덮은 비율 — 극지방이 데이터로 바뀝니다(셰이더 색칠이 아니라).',
        '얼음이 없는 바다·육지는 칠하지 않습니다.'],
      lst: ['지표온도 (주간)', '위성이 잰 <b>땅 표면</b>의 온도입니다 — 기상관측소의 기온(지상 2m)과 다릅니다.',
        '구름에 가린 곳은 관측이 없어 비어 있습니다.'],
    };
    const [ko, desc, gap] = INFO[kind] || [kind, '', ''];
    return {
      badge: 'OBSERVED',
      note: `${d.ok}/${d.total}타일 · ${d.date}`,
      cardHtml: `<b>${ko}</b> — ${desc}<br/>${gap}<br/>`
        + `타일 ${d.ok}/${d.total}장 수신 · 관측일 ${d.date} (위성 자료는 하루 이틀 뒤 공개됩니다)<br/>`
        + `출처 ${d.source} · NASA GIBS/Worldview`,
    };
  }

  // ---------- 지각 이동 속도장 (GNSS · UNR MIDAS) ----------
  buildCrustal(d) {
    const g = new THREE.Group();
    const rows = (d.stations || []).filter((st) => st.lat != null && st.lon != null && st.speed != null);
    const pos = [];
    const col = [];
    for (const st of rows) {
      // 길이는 속도 비례(연 30mm ≈ 화면 상 짧은 선), 방향은 실제 이동 방위
      const len = Math.min(0.06, 0.0016 * Math.max(0.5, st.speed));
      const a = llToV3(st.lat, st.lon, this.surfR(st.lat, st.lon, 0.004));
      const th = ((st.dir || 0) * Math.PI) / 180;
      const dLat = Math.cos(th) * len * 8;
      const dLon = (Math.sin(th) * len * 8) / Math.max(0.2, Math.cos((st.lat * Math.PI) / 180));
      const b = llToV3(st.lat + dLat, st.lon + dLon, this.surfR(st.lat, st.lon, 0.004));
      const t = Math.min(1, st.speed / 45);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      for (let i = 0; i < 2; i += 1) col.push(0.35 + t * 0.6, 0.85 - t * 0.35, 0.95 - t * 0.5);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    line.frustumCulled = false;
    g.add(line);
    g.add(this.makePoints(rows.map((st) => ({ lat: st.lat, lon: st.lon, c: { r: 0.55, g: 0.9, b: 1 } })),
      { size: 2.6, lift: 0.004, opacity: 0.7 }));
    return g;
  }

  metaCrustal(d) {
    const kr = d.korea || {};
    const jp = d.japan || {};
    return {
      badge: 'OBSERVED',
      note: `${Number(d.count || 0).toLocaleString()}개 관측점 · ${kstShort(d.generated)}`,
      cardHtml: `<b>지각은 지금도 움직인다</b> — GNSS 상시관측점 <b>${Number(d.count || 0).toLocaleString()}곳</b>이 실제로 측정한 연간 이동 속도입니다.<br/>`
        + `선의 방향이 땅이 가는 방향, 길이·색이 빠르기입니다.<br/>`
        + `${kr.n ? `한국 ${kr.n}점 — 중앙값 <b>연 ${kr.medianSpeed}mm</b> 방위 ${kr.medianDir}°<br/>` : ''}`
        + `${jp.n ? `일본 ${jp.n}점 — 중앙값 <b>연 ${jp.medianSpeed}mm</b> 방위 ${jp.medianDir}°<br/>` : ''}`
        + `판 경계선(정적)·지진 25년(사건)과 겹쳐 보면 <b>같은 자리</b>인 것이 보입니다.<br/>`
        + `출처 ${d.source || 'UNR MIDAS'} · ${d.cite || ''} · ${kstShort(d.generated)}`,
    };
  }

  // ---------- ECMWF 태풍 앙상블 (예보가 갈리는 폭) ----------
  buildTyEns(d) {
    const g = new THREE.Group();
    const seg = (steps, color, opacity, lift) => {
      const pts = (steps || []).filter((s) => s.lat != null && s.lon != null);
      if (pts.length < 2) return;
      const pos = [];
      for (let i = 0; i + 1 < pts.length; i += 1) {
        const a = llToV3(pts[i].lat, pts[i].lon, 1 + lift);
        const b = llToV3(pts[i + 1].lat, pts[i + 1].lon, 1 + lift);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthWrite: false,
      }));
      l.frustumCulled = false;
      g.add(l);
    };
    let members = 0;
    for (const st of d.storms || []) {
      // 옅은 선 = 앙상블 각 멤버(예보가 갈리는 폭), 진한 선 = 결정론 예보
      for (const m of ((st.ensemble || {}).members) || []) {
        seg(m.steps, 0x7fb7f5, 0.16, 0.006);
        members += 1;
      }
      seg(st.steps, 0xffd9c2, 0.95, 0.008);
    }
    this._ensMembers = members;
    return g;
  }

  metaTyEns(d) {
    const storms = d.storms || [];
    const names = storms.map((s) => `${s.name || s.id}`).join(' · ');
    return {
      badge: 'MODEL_SIGNAL',
      note: `${storms.length}개 · 멤버 ${this._ensMembers || 0}줄 · ${kstShort(d.generated)}`,
      cardHtml: `<b>태풍 예보가 갈리는 폭</b> — 유럽중기예보센터 앙상블입니다.<br/>`
        + `진한 선 = 결정론 예보(HRES), 옅은 선 = 앙상블 멤버 각각. <b>옅은 선이 벌어질수록 불확실합니다.</b><br/>`
        + `${storms.length ? `대상 ${names}<br/>` : '지금 추적 중인 태풍이 없습니다.<br/>'}`
        + `앙상블 ${((storms[0] || {}).ensemble || {}).totalMembers || 51}개 중 파일에 담긴 멤버만 그립니다 · 예보 구간 ${d.capH || 120}시간<br/>`
        + `<b>공식 예보가 아닙니다</b> — 공식 진로는 '태풍 공식 트랙'(KMA·JMA·NHC)을 보세요.<br/>`
        + `출처 ${d.source || 'ECMWF Open Data'} · ${d.license || ''} · 런 ${d.run || ''}`,
    };
  }

  metaSstAnom(d) {
    const s = this._fieldStat || {};
    const rng = Number.isFinite(s.min) ? `${s.min.toFixed(1)} ~ ${s.max.toFixed(1)}°C` : '—';
    return {
      badge: 'OBSERVED',
      note: `${(s.n || 0).toLocaleString()}칸 · ${rng} · ${(d.observed || '').slice(0, 10)}`,
      cardHtml: `<b>바다가 평년보다 얼마나 뜨거운가</b> — 관측 수온에서 ${d.period || '1991-2020'} 평년값을 뺀 값입니다.<br/>`
        + `붉을수록 평년보다 높고 푸를수록 낮습니다. <b>±0.25°C 안쪽은 칠하지 않습니다</b>(평년과 같다는 뜻).<br/>`
        + `범위 ${rng} · 값 있는 해양 격자 ${(s.n || 0).toLocaleString()}칸 (동아시아 0.5°)<br/>`
        + `'26도'보다 '평년보다 3도 높다'가 태풍·폭염을 설명합니다.<br/>`
        + `출처 ${d.source || 'NOAA OISST v2.1'} · ${d.attribution || ''} · 관측일 ${(d.observed || '').slice(0, 10)}`,
    };
  }

  metaSst(d) {
    const s = this._fieldStat || {};
    const note = `${(s.n || 0).toLocaleString()}셀 · ${s.min != null && Number.isFinite(s.min) ? `${s.min.toFixed(1)}~${s.max.toFixed(1)}°C` : ''} · ${(d.observed || '').slice(0, 10)}`;
    return {
      badge: 'OBSERVED', note,
      cardHtml: `전지구 해수면 온도 — ${(s.n || 0).toLocaleString()}개 해양 격자(1°)를 한색 −2°C → 난색 32°C로 표시합니다. 육지·결측 해역은 칠하지 않습니다.<br/>`
        + `관측 범위 ${Number.isFinite(s.min) ? `${s.min.toFixed(1)}°C ~ ${s.max.toFixed(1)}°C` : '—'}<br/>`
        + `출처 ${d.source || 'NOAA OISST v2.1'} · 관측일 ${(d.observed || '').slice(0, 10)} · ${d.sampling || ''}<br/>`
        + `일별 관측 분석장(위성+부이 융합)이며 예보가 아닙니다.`,
    };
  }

  metaWave(d) {
    const s = this._fieldStat || {};
    const note = `${(s.n || 0).toLocaleString()}셀 · 최고 ${Number.isFinite(s.max) ? s.max.toFixed(1) : '—'}m · ${(d.time || '').slice(5, 16).replace('T', ' ')}Z`;
    return {
      badge: 'MODEL_SIGNAL', note,
      cardHtml: `전지구 유의파고 — ${(s.n || 0).toLocaleString()}개 해양 격자(5°)를 청 0m → 적 8m로 표시합니다.<br/>`
        + `현재 격자 최고 ${Number.isFinite(s.max) ? `${s.max.toFixed(1)}m` : '—'}<br/>`
        + `출처 ${d.source || 'Open-Meteo Marine'} · 기준 ${(d.time || '').replace('T', ' ').slice(0, 16)}Z<br/>`
        + `해상 모델 값입니다 — 관측 지점값은 '해상 관측망'(기상청 193지점)을 보세요.`,
    };
  }

  // ---------- 해류 (방향·속도 화살 · 5° 격자) ----------
  buildCurrent(d) {
    const g = new THREE.Group();
    const { nx, ny, res, lat0, lon0 } = d;
    const cur = d.cur;
    const cdir = d.cdir;
    if (!cur || !cdir) throw new Error('해류 격자 없음');
    const rows = [];
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const i = y * nx + x;
        if (cur[i] == null || cdir[i] == null) continue;
        rows.push({ lat: lat0 + y * res, lon: lon0 + x * res, v: cur[i], dir: cdir[i] });
      }
    }
    this._curN = rows.length;
    this._curMax = rows.length ? Math.max(...rows.map((r) => r.v)) : 0;
    const up = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const pos = new Float32Array(rows.length * 6);
    const col = new Float32Array(rows.length * 6);
    rows.forEach((s, i) => {
      const p = llToV3(s.lat, s.lon, 1.0022);
      const n = p.clone().normalize();
      east.crossVectors(up, n).normalize();
      north.crossVectors(n, east);
      // cdir = 흘러가는 방위 (Open-Meteo 규약)
      const brg = (s.dir * Math.PI) / 180;
      dir.copy(east).multiplyScalar(Math.sin(brg)).addScaledVector(north, Math.cos(brg));
      const len = 0.004 + Math.min(s.v / 1.5, 1) * 0.016;
      const c = new THREE.Color().setHSL(0.5 - Math.min(s.v / 1.5, 1) * 0.5, 0.9, 0.55);
      pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
      pos[i * 6 + 3] = p.x + dir.x * len;
      pos[i * 6 + 4] = p.y + dir.y * len;
      pos[i * 6 + 5] = p.z + dir.z * len;
      col[i * 6] = c.r * 0.25; col[i * 6 + 1] = c.g * 0.25; col[i * 6 + 2] = c.b * 0.25;
      col[i * 6 + 3] = c.r; col[i * 6 + 4] = c.g; col[i * 6 + 5] = c.b;
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    })));
    return g;
  }

  metaCurrent(d) {
    const note = `${(this._curN || 0).toLocaleString()}격자 · 최고 ${(this._curMax || 0).toFixed(2)}m/s · ${(d.time || '').slice(5, 16).replace('T', ' ')}Z`;
    return {
      badge: 'MODEL_SIGNAL', note,
      cardHtml: `표층 해류 — 5° 격자 ${(this._curN || 0).toLocaleString()}곳의 흐름 방향(흘러가는 쪽)과 속도를 화살로 표시합니다.<br/>`
        + `현재 격자 최고 ${(this._curMax || 0).toFixed(2)} m/s<br/>`
        + `출처 ${d.source || 'Open-Meteo Marine'} · 기준 ${(d.time || '').replace('T', ' ').slice(0, 16)}Z<br/>`
        + `격자 값 그대로이며 격자 사이를 보간한 유선은 그리지 않습니다.`,
    };
  }

  // ---------- 해변 271곳 · 낚시 946곳 (지역 POI) ----------
  buildSurf(d) {
    const g = new THREE.Group();
    const beaches = (d.beaches && d.beaches.beaches) || [];
    const fish = (d.fishing && d.fishing.spots) || [];
    this._surfN = { b: beaches.length, f: fish.length };
    if (fish.length) {
      g.add(this.makePoints(fish.map((s) => ({ lat: s.la, lon: s.lo, c: new THREE.Color(0x5fd3c0) })),
        { size: 3.5, lift: 0.0028, opacity: 0.62 }));
    }
    if (beaches.length) {
      g.add(this.makePoints(beaches.map((s) => ({ lat: s.la, lon: s.lo, c: new THREE.Color(0xffe08a) })),
        { size: 6, lift: 0.003 }));
    }
    return g;
  }

  metaSurf(d) {
    const n = this._surfN || { b: 0, f: 0 };
    const beaches = (d.beaches && d.beaches.beaches) || [];
    const withFacing = beaches.filter((b) => b.f != null).length;
    const wide = [...beaches].sort((a, b) => (b.sp || 0) - (a.sp || 0)).slice(0, 3);
    const regions = {};
    beaches.forEach((b) => { regions[b.r] = (regions[b.r] || 0) + 1; });
    const topR = Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${k} ${v}`).join(' · ');
    return {
      badge: 'OBSERVED', note: `해변 ${n.b}곳(노랑) · 낚시 ${n.f}곳(청록)`,
      cardHtml: `해변 <b>${n.b}곳</b>과 낚시 지점 <b>${n.f}곳</b>의 실제 위치입니다.<br/>`
        + `해변 중 ${withFacing}곳은 해안이 바라보는 방향(향)까지 계산돼 있어 파도·바람 판단에 쓸 수 있습니다.<br/>`
        + `지역 분포: ${topR}<br/>`
        + `가장 넓은 해변: ${wide.map((b) => `${b.n}(${b.sp}m)`).join(' · ')}<br/>`
        + `출처 ${(d.beaches && d.beaches.source) || 'OpenStreetMap'} · ${(d.beaches && d.beaches.license) || 'ODbL 1.0'}<br/>`
        + `파도·수온 판단은 같은 메뉴의 '해상 관측망'·'해수면 온도'와 함께 보세요.`,
    };
  }

  // ---------- 해수면 상승 전망 (IPCC AR6 · 전 세계 조위관측소) ----------
  // 전망(projection)이지 예보가 아니다. 기둥 높이 = 2100년 중앙값 상승폭, 색 = 시나리오 위험도.
  // 시나리오는 SSP5-8.5(고배출)를 기본 표시하고 카드에서 4개 시나리오를 모두 보여준다.
  buildSlr(d, scenario = 'ssp585') {
    const items = (d.items || []).filter((i) => i.s && i.s[scenario] && i.s[scenario]['2100']);
    this._slrItems = items;
    this._slrScenario = scenario;
    const g = new THREE.Group();
    if (!items.length) return g;
    const vals = items.map((i) => i.s[scenario]['2100'][0]);
    const maxV = Math.max(...vals);
    this._slrMax = maxV;
    this._slrMean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const pos = new Float32Array(items.length * 6);
    const col = new Float32Array(items.length * 6);
    items.forEach((it, i) => {
      const v = it.s[scenario]['2100'][0];
      const f = Math.min(Math.max(v / 1.2, 0), 1); // 1.2m를 상한으로 색 정규화
      const c = new THREE.Color().setHSL(0.58 - f * 0.58, 0.85, 0.42 + f * 0.16);
      const p = llToV3(it.lat, it.lon, this.surfR(it.lat, it.lon, 0.0025));
      const up = p.clone().normalize();
      const h = 0.003 + f * 0.045;
      pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
      pos[i * 6 + 3] = p.x + up.x * h;
      pos[i * 6 + 4] = p.y + up.y * h;
      pos[i * 6 + 5] = p.z + up.z * h;
      col[i * 6] = c.r * 0.25; col[i * 6 + 1] = c.g * 0.25; col[i * 6 + 2] = c.b * 0.25;
      col[i * 6 + 3] = c.r; col[i * 6 + 4] = c.g; col[i * 6 + 5] = c.b;
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false,
    })));
    g.add(this.makePoints(items.map((it) => {
      const v = it.s[scenario]['2100'][0];
      const f = Math.min(Math.max(v / 1.2, 0), 1);
      return { lat: it.lat, lon: it.lon, c: new THREE.Color().setHSL(0.58 - f * 0.58, 0.85, 0.5) };
    }), { size: 4, lift: 0.0025, opacity: 0.85 }));
    return g;
  }

  metaSlr(d) {
    const items = this._slrItems || [];
    const kr = items.filter((i) => (i.country || '').startsWith('Korea'));
    const fmtM = (x) => (x == null ? '—' : `${x.toFixed(2)}m`);
    const line = (it) => {
      const a = it.s.ssp245 && it.s.ssp245['2100'];
      const b = it.s.ssp585 && it.s.ssp585['2100'];
      return `${it.name} — 저감(SSP2-4.5) <b>${fmtM(a && a[0])}</b> · 고배출(SSP5-8.5) <b>${fmtM(b && b[0])}</b>`;
    };
    const krTop = [...kr].sort((x, y) => (y.s.ssp585['2100'][0]) - (x.s.ssp585['2100'][0])).slice(0, 5);
    const worst = [...items].sort((x, y) => (y.s.ssp585['2100'][0]) - (x.s.ssp585['2100'][0])).slice(0, 3);
    return {
      badge: 'MODEL_SIGNAL',
      note: `${items.length.toLocaleString()}개 조위관측소 · 2100년 SSP5-8.5 평균 ${fmtM(this._slrMean)} · 최대 ${fmtM(this._slrMax)}`,
      cardHtml: `<b>2100년 해수면 상승 전망</b> — 전 세계 조위관측소 ${items.length.toLocaleString()}곳. 기둥 높이·색 = 고배출 시나리오(SSP5-8.5) 중앙값.<br/>`
        + `<b>한국 ${kr.length}곳</b><br/>${krTop.map((i) => `· ${line(i)}`).join('<br/>')}<br/>`
        + `세계 최대: ${worst.map((i) => `${i.name} ${fmtM(i.s.ssp585['2100'][0])}`).join(' · ')}<br/>`
        + `기준선 ${d.baseline || '1995–2014 평균'} · 각 값은 중앙값이며 원자료에는 17~83% 범위가 함께 있습니다.<br/>`
        + `<b>예보가 아니라 시나리오별 전망입니다.</b> 배출 경로에 따라 값이 달라지며, 지역 침수 여부는 이 값 하나로 판단할 수 없습니다.<br/>`
        + `출처 ${d.source || 'IPCC AR6 · NASA/JPL'} · ${d.license || 'CC BY 4.0'}`,
    };
  }

  // ---------- 한국 해상 관측망 (KMA 193지점 · OBSERVED) ----------
  // 파고를 보고하는 지점은 파고 색, 파고가 없는 지점은 흐린 점 — 값을 지어내지 않는다.
  buildKmaSea(d) {
    const g = new THREE.Group();
    const sts = (d.stations || []).filter((s) => s.lat != null && s.lon != null);
    const waveColor = (m) => {
      const x = Math.min(Math.max(m / 5, 0), 1);
      const c = new THREE.Color();
      c.setHSL(0.55 - 0.55 * x, 0.85, 0.42 + 0.16 * x);
      return c;
    };
    const withWave = sts.filter((s) => s.wh != null);
    const noWave = sts.filter((s) => s.wh == null);
    if (withWave.length) {
      // 파고 막대: 지점에서 위로 파고 비례 (관측값만)
      const pos = new Float32Array(withWave.length * 6);
      const col = new Float32Array(withWave.length * 6);
      withWave.forEach((s, i) => {
        const c = waveColor(s.wh);
        const p = llToV3(s.lat, s.lon, this.surfR(s.lat, s.lon, 0.0025));
        const up = p.clone().normalize();
        const h = 0.002 + Math.min(s.wh / 5, 1) * 0.014;
        pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
        pos[i * 6 + 3] = p.x + up.x * h;
        pos[i * 6 + 4] = p.y + up.y * h;
        pos[i * 6 + 5] = p.z + up.z * h;
        col[i * 6] = c.r * 0.4; col[i * 6 + 1] = c.g * 0.4; col[i * 6 + 2] = c.b * 0.4;
        col[i * 6 + 3] = c.r; col[i * 6 + 4] = c.g; col[i * 6 + 5] = c.b;
      });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      })));
      g.add(this.makePoints(withWave.map((s) => ({ lat: s.lat, lon: s.lon, c: waveColor(s.wh) })),
        { size: 5, lift: 0.0025 }));
    }
    if (noWave.length) {
      g.add(this.makePoints(noWave.map((s) => ({ lat: s.lat, lon: s.lon, c: new THREE.Color(0x5b6f80) })),
        { size: 3, lift: 0.0025, opacity: 0.6 }));
    }
    this._kmaSea = { withWave, noWave };
    return g;
  }

  metaKmaSea(d) {
    const w = (this._kmaSea && this._kmaSea.withWave) || [];
    const sst = (d.stations || []).filter((s) => s.tw != null);
    const maxW = w.length ? w.reduce((a, b) => (b.wh > a.wh ? b : a)) : null;
    const kinds = {};
    (d.stations || []).forEach((s) => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
    const kindTxt = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, n]) => `${k} ${n}`).join(' · ');
    const note = `${(d.stations || []).length}지점 · 파고 보고 ${w.length} · 수온 ${sst.length}${maxW ? ` · 최고 ${maxW.wh}m(${maxW.name})` : ''}`;
    return {
      badge: 'OBSERVED', note,
      cardHtml: `기상청 해양관측망 — 파고를 보고하는 ${w.length}지점은 막대 높이·색(청 0m → 적 5m)으로, 파고 항목이 없는 지점은 흐린 점으로 표시합니다 (없는 값을 채우지 않습니다).<br/>`
        + `${kindTxt}<br/>`
        + `${maxW ? `현재 최고 파고 <b>${maxW.wh}m</b> — ${maxW.name} (${maxW.kind})<br/>` : ''}`
        + `수온 보고 ${sst.length}지점 · 관측 ${(d.generated || '').replace('T', ' ').slice(0, 16)}Z · 출처 ${d.source || '기상청'}`,
    };
  }

  // ---------- 태풍 과거 유사 경로 (아날로그 · 예보 아님) ----------
  // Delle Monache et al. (2013) 유사도로 뽑은 과거 30건이 그 뒤 72시간에 간 길.
  // v5.3 인과 게이트: 예측이 아니라 "과거에 이랬다"는 기록임을 카드에 명시한다.
  buildTyAnalog(d) {
    const g = new THREE.Group();
    const r = this.aboveCloudsR();
    const storms = (d.storms || []).filter((s) => s.sample && s.sample.length);
    storms.forEach((s, si) => {
      const base = new THREE.Color(STORM_COLORS[si % STORM_COLORS.length]);
      const pts = [];
      for (const smp of s.sample) {
        const path = smp.path || [];
        for (let i = 1; i < path.length; i += 1) {
          const a = llToV3(path[i - 1][1], path[i - 1][0], r);
          const b = llToV3(path[i][1], path[i][0], r);
          pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
      if (pts.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
        g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
          color: base, transparent: true, opacity: 0.22, depthWrite: false,
        })));
      }
      // 아날로그 중앙값 경로 (있으면 진하게 — 여전히 예보 아님)
      const st = (s.estimate && s.estimate.steps) || [];
      if (st.length > 1) {
        const mp = new Float32Array(st.length * 3);
        st.forEach((p, i) => {
          const v = llToV3(p.lat, p.lon, r);
          mp[i * 3] = v.x; mp[i * 3 + 1] = v.y; mp[i * 3 + 2] = v.z;
        });
        const mg = new THREE.BufferGeometry();
        mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
        g.add(new THREE.Line(mg, new THREE.LineBasicMaterial({
          color: base, transparent: true, opacity: 0.95, depthWrite: false,
        })));
      }
    });
    this._analogN = storms.length;
    return g;
  }

  metaTyAnalog(d) {
    const storms = (d.storms || []).filter((s) => s.sample && s.sample.length);
    const rows = storms.slice(0, 5).map((s, si) => {
      const c = STORM_COLORS[si % STORM_COLORS.length];
      const bins = (s.bins || []).slice(0, 3).map((b) => `${b.dir} ${b.n}`).join(' · ');
      const rec = s.recurve;
      const now = s.estimate && s.estimate.steps && s.estimate.steps[0];
      return `<span style="color:${c}">●</span> <b>${s.name}</b> — 유사 과거 ${s.matches}건 중 <b>${s.topDir}쪽 ${s.topN}건(${s.topPct}%)</b><br/>`
        + `&nbsp;&nbsp;<span style="color:var(--text-dim)">${bins}${rec && rec.n ? ` · 북동 재곡 ${rec.turned}/${rec.n}건` : ''}</span>`
        + `${now ? ` <button class="simgo" style="padding:2px 8px;font-size:11px" data-action="ty-focus" data-lat="${now.lat}" data-lon="${now.lon}">보기 →</button>` : ''}`;
    }).join('<br/>');
    const note = `${storms.length}개 태풍 · 과거 ${d.historyStorms ? Number(d.historyStorms).toLocaleString() : '—'}건에서 유사 사례 검색`;
    return {
      badge: 'DERIVED', note,
      cardHtml: `<b>예보가 아닙니다.</b> 지금 태풍과 위치·진행방향·강도가 비슷했던 <b>과거 시점</b>을 찾아, 그 태풍들이 그 뒤 72시간에 어디로 갔는지 센 기록입니다.<br/>`
        + `연한 선 = 과거 유사 사례 경로 · 진한 선 = 그 사례들의 좌표별 중앙값<br/>${rows}<br/>`
        + `방법: Delle Monache et al. (2013) 유사도 · 같은 계절 ±21일 · 최근 24시간 경로 기준 가까운 30건 · ${d.historyFrom || 1980}년 이후 ${d.historyStorms ? Number(d.historyStorms).toLocaleString() : ''}개 태풍<br/>`
        + `실제 진로는 기상청·JMA 공식 예보를 따르세요 (같은 메뉴의 '태풍 공식 트랙').`,
    };
  }

  // ---------- 발사 일정 (TheSpaceDevs LL2 · 공식 발표 예정 시각) ----------
  buildLaunch(d) {
    const g = new THREE.Group();
    const rows = (d.results || [])
      .map((r) => {
        const pad = r.pad || {};
        const lat = parseFloat(pad.latitude);
        const lon = parseFloat(pad.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return { lat, lon, t: Date.parse(r.net) || 0, r };
      })
      .filter(Boolean);
    this._launchRows = rows;
    if (!rows.length) return g;
    // 임박할수록 밝은 주황, 먼 일정은 차분한 청회색
    const colorFor = (t) => {
      const h = Math.max((t - Date.now()) / 3600000, 0);
      const x = Math.min(h / 240, 1); // 10일 이후는 동일 취급
      const c = new THREE.Color();
      c.setHSL(0.09 + 0.48 * x, 0.85 - 0.35 * x, 0.62 - 0.12 * x);
      return c;
    };
    // 발사대 지점 + 위로 뻗는 짧은 상승선 (지구 위에서 발사장을 읽히게)
    const pos = new Float32Array(rows.length * 6);
    const col = new Float32Array(rows.length * 6);
    rows.forEach((s, i) => {
      const c = colorFor(s.t);
      const r0 = this.surfR(s.lat, s.lon, 0.002);
      const p = llToV3(s.lat, s.lon, r0);
      const up = p.clone().normalize();
      const h = 0.012 + 0.02 * Math.max(0, 1 - Math.max((s.t - Date.now()) / 3600000, 0) / 240);
      pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
      pos[i * 6 + 3] = p.x + up.x * h;
      pos[i * 6 + 4] = p.y + up.y * h;
      pos[i * 6 + 5] = p.z + up.z * h;
      col[i * 6] = c.r; col[i * 6 + 1] = c.g; col[i * 6 + 2] = c.b;
      col[i * 6 + 3] = c.r * 0.25; col[i * 6 + 4] = c.g * 0.25; col[i * 6 + 5] = c.b * 0.25;
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
    })));
    g.add(this.makePoints(rows.map((s) => ({ lat: s.lat, lon: s.lon, c: colorFor(s.t) })),
      { size: 7, lift: 0.002, additive: true }));
    return g;
  }

  metaLaunch(d) {
    const rows = this._launchRows || [];
    const nowMs = Date.now();
    const tMinus = (t) => {
      const s = Math.max(t - nowMs, 0) / 1000;
      if (s < 3600) return `T-${Math.round(s / 60)}분`;
      if (s < 86400) return `T-${Math.round(s / 3600)}시간`;
      return `T-${Math.round(s / 86400)}일`;
    };
    const list = rows.slice(0, 6).map((s) => {
      const r = s.r;
      const pad = r.pad || {};
      const loc = (pad.location || {}).name || '';
      const prov = (r.launch_service_provider || {}).name || '';
      const st = (r.status || {}).abbrev || '';
      return `<b>${tMinus(s.t)}</b> ${r.name}<br/>&nbsp;&nbsp;<span style="color:var(--text-dim)">${prov} · ${loc.slice(0, 34)} · ${st}</span>
        <button class="simgo" style="padding:2px 8px;font-size:11px" data-action="ty-focus" data-lat="${s.lat}" data-lon="${s.lon}">발사장 보기 →</button>`;
    }).join('<br/>');
    const note = `예정 ${rows.length}건 표시 (전체 ${d.count ?? '—'}건) · 다음 ${rows[0] ? tMinus(rows[0].t) : '—'}`;
    return {
      badge: 'OFFICIAL_FORECAST', note,
      cardHtml: `세계 로켓 발사 예정 — 발사장을 지구 위에 표시하고, 임박할수록 밝게/길게 나타냅니다.<br/>${list || '예정 발사 없음'}<br/>`
        + `출처 TheSpaceDevs Launch Library 2 · 발사 시각(NET)은 발사기관 발표값 그대로이며 자주 변경됩니다 · 전체 ${d.count ?? '—'}건 중 ${rows.length}건`,
    };
  }

  // ---------- 대기질 (에어코리아 673개 측정소 · OBSERVED) ----------
  buildAirq(d) {
    const items = (d.stations || [])
      .filter((s) => s.lat != null && s.lon != null && s.grade)
      .map((s) => ({ lat: s.lat, lon: s.lon, c: new THREE.Color(AIR_GRADE_COLOR[s.grade] || '#7f95a8') }));
    return this.makePoints(items, { size: 5.5, lift: 0.004 });
  }

  metaAirq(d) {
    const byG = { 1: 0, 2: 0, 3: 0, 4: 0 };
    (d.stations || []).forEach((s) => { if (byG[s.grade] != null) byG[s.grade] += 1; });
    const worst = [...(d.sido || [])].sort((a, b) => (b.pm25 || 0) - (a.pm25 || 0)).slice(0, 3);
    const note = `${d.located || 0}개소 · 좋음 ${byG[1]} 보통 ${byG[2]} 나쁨 ${byG[3]} 매우나쁨 ${byG[4]} · ${d.observedKst || ''}`;
    return {
      badge: 'OBSERVED', note,
      cardHtml: `에어코리아 통합대기환경 등급 — 측정소 ${d.located || 0}개소를 공식 4등급 색(좋음 파랑 → 매우나쁨 빨강)으로 표시.<br/>`
        + `좋음 ${byG[1]} · 보통 ${byG[2]} · 나쁨 ${byG[3]} · 매우나쁨 ${byG[4]}<br/>`
        + `PM2.5 높은 시도: ${worst.map((s) => `${s.sido} ${s.pm25}㎍`).join(' · ') || '—'}<br/>`
        + `관측 ${d.observedKst || '—'} KST · 출처 한국환경공단 에어코리아`,
    };
  }

  // ---------- 바람 관측 (KMA AWS + 전 세계 GTS · OBSERVED) ----------
  // 관측소마다 바람이 불어가는 방향으로 선분 — 길이·색 = 풍속. 값 보간·생성 없음.
  buildWind(d) {
    const g = new THREE.Group();
    const rows = [];
    (d.aws && d.aws.stations || []).forEach((s) => {
      if (s.lat != null && s.wind_ms != null && s.wind_dir != null) {
        rows.push({ lat: s.lat, lon: s.lon, ws: s.wind_ms, wd: s.wind_dir });
      }
    });
    (d.gts && d.gts.stations || []).forEach((s) => {
      if (s.lat != null && s.ws != null && s.wd != null) {
        rows.push({ lat: s.lat, lon: s.lon, ws: s.ws, wd: s.wd });
      }
    });
    this._windN = rows.length;
    let maxWs = 0;
    const pos = new Float32Array(rows.length * 6);
    const col = new Float32Array(rows.length * 6);
    const up = new THREE.Vector3(0, 1, 0);
    const east = new THREE.Vector3();
    const north = new THREE.Vector3();
    const dir = new THREE.Vector3();
    rows.forEach((s, i) => {
      if (s.ws > maxWs) maxWs = s.ws;
      const r = this.surfR(s.lat, s.lon, 0.0035);
      const p = llToV3(s.lat, s.lon, r);
      const n = p.clone().normalize();
      east.crossVectors(up, n).normalize();
      north.crossVectors(n, east);
      // wd = 불어오는 방위 → 화살은 불어가는 쪽(wd+180°)
      const brg = ((s.wd + 180) * Math.PI) / 180;
      dir.copy(east).multiplyScalar(Math.sin(brg)).addScaledVector(north, Math.cos(brg));
      const len = 0.003 + Math.min(s.ws / 25, 1) * 0.011;
      const c = windColor(s.ws);
      pos[i * 6] = p.x; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
      pos[i * 6 + 3] = p.x + dir.x * len;
      pos[i * 6 + 4] = p.y + dir.y * len;
      pos[i * 6 + 5] = p.z + dir.z * len;
      col[i * 6] = c.r * 0.55; col[i * 6 + 1] = c.g * 0.55; col[i * 6 + 2] = c.b * 0.55;
      col[i * 6 + 3] = c.r; col[i * 6 + 4] = c.g; col[i * 6 + 5] = c.b;
    });
    this._windMax = maxWs;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false,
    })));
    const items = rows.map((s) => ({ lat: s.lat, lon: s.lon, c: windColor(s.ws) }));
    g.add(this.makePoints(items, { size: 3, lift: 0.0035, opacity: 0.75 }));

    // 흐름 애니메이션: 관측 선분 위를 입자가 풍속 비례 속도로 흐른다.
    // 관측 지점의 실측 벡터 위에서만 움직임 — 격자 보간·유선 생성 없음.
    const P_PER = 2;
    const nP = rows.length * P_PER;
    const aStart = new Float32Array(nP * 3);
    const aDir = new Float32Array(nP * 3);
    const aPhase = new Float32Array(nP);
    const aSpeed = new Float32Array(nP);
    const aColor = new Float32Array(nP * 3);
    for (let i = 0; i < rows.length; i += 1) {
      for (let k = 0; k < P_PER; k += 1) {
        const j = i * P_PER + k;
        aStart[j * 3] = pos[i * 6];
        aStart[j * 3 + 1] = pos[i * 6 + 1];
        aStart[j * 3 + 2] = pos[i * 6 + 2];
        aDir[j * 3] = pos[i * 6 + 3] - pos[i * 6];
        aDir[j * 3 + 1] = pos[i * 6 + 4] - pos[i * 6 + 1];
        aDir[j * 3 + 2] = pos[i * 6 + 5] - pos[i * 6 + 2];
        aPhase[j] = (i * 0.618 + k / P_PER) % 1;
        aSpeed[j] = Math.min(rows[i].ws / 25, 1);
        aColor[j * 3] = col[i * 6 + 3];
        aColor[j * 3 + 1] = col[i * 6 + 4];
        aColor[j * 3 + 2] = col[i * 6 + 5];
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(aStart, 3)); // 기준점 (셰이더에서 이동)
    fg.setAttribute('aDir', new THREE.BufferAttribute(aDir, 3));
    fg.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
    fg.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
    fg.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
    const flowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aDir;
        attribute float aPhase;
        attribute float aSpeed;
        attribute vec3 aColor;
        uniform float uTime;
        varying vec3 vC;
        varying float vA;
        void main() {
          float t = fract(uTime * (0.10 + aSpeed * 0.45) + aPhase);
          vec3 p = position + aDir * t;
          vC = aColor;
          vA = sin(t * 3.14159) * (0.35 + aSpeed * 0.65);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 3.2;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          if (dot(d, d) > 0.25) discard;
          gl_FragColor = vec4(vC, vA);
          #include <colorspace_fragment>
        }`,
    });
    const flow = new THREE.Points(fg, flowMat);
    flow.frustumCulled = false;
    g.add(flow);
    g.userData.animMats = [flowMat];
    return g;
  }

  // 매 프레임 호출 (main.js tick): 흐름 입자 시간 갱신 + 축척에 안 맞는 격자 페이드
  tick(nowMs, altKm) {
    for (const l of Object.values(this.layers)) {
      if (l.on && l.obj && l.obj.userData && l.obj.userData.animMats) {
        for (const m of l.obj.userData.animMats) m.uniforms.uTime.value = nowMs * 0.001;
      }
    }
    if (altKm != null) this.fadeCoarseGrids(altKm);
    // 서울 타워는 고도에 따라 굵기가 달라진다 — 고도가 한 단계 바뀔 때만 다시 세운다.
    const pt = this.layers.poptower;
    if (altKm != null && pt && pt.on && pt.obj && pt.obj.userData && pt.obj.userData.popTower) {
      const b2 = Math.round(Math.log2(Math.max(50, altKm)) * 3);
      if (b2 !== this._popBucket || pt.obj.userData.popTower.altKm == null) {
        this._popBucket = b2;
        this._popTowerApply(pt.obj, altKm);
      }
    }
    const sl = this.layers.seoul;
    if (altKm != null && sl && sl.on && sl.obj && sl.obj.userData && sl.obj.userData.seoul) {
      const bucket = Math.round(Math.log2(Math.max(50, altKm)) * 3);
      // 고도 눈금은 레이어가 꺼져 있는 동안에도 흘러간다. 눈금만 보고 판단하면
      // '켜는 순간'에 한 번도 적용되지 않는다(실측: 켜도 폭이 기본값 그대로였다).
      if (bucket !== this._seoulBucket || sl.obj.userData.seoul.altKm == null) {
        this._seoulBucket = bucket;
        this._seoulApply(sl.obj, this._timeOffsetMs || 0, altKm);
      }
    }
  }

  // 지역 모델 격자(0.05°≈5km)는 권역 축척용이다. 도시까지 내려가면 점 사이가 벌어져
  // 데이터가 아니라 방충망처럼 보이고, 데이터 경계 사각형만 도드라진다.
  // 값을 지우지 않고 '이 축척에서는 읽을 수 없다'는 뜻으로 서서히 감춘다.
  fadeCoarseGrids(altKm) {
    const FADE_IN = 900;   // 이 위에서는 그대로 보인다
    const FADE_OUT = 220;  // 이 아래로는 감춘다 (격자 간격이 화면을 뒤덮는 구간)
    const t = Math.max(0, Math.min(1, (altKm - FADE_OUT) / (FADE_IN - FADE_OUT)));
    for (const id of ['khoasl126', 'khoasl245', 'khoasl370', 'khoasl585']) {
      const l = this.layers[id];
      if (!l || !l.on || !l.obj || !l.obj.material) continue;
      l.obj.material.opacity = 0.72 * t;
      l.obj.visible = t > 0.02;
    }
  }

  metaWind(d) {
    const nA = (d.aws && d.aws.stations || []).length;
    const nG = (d.gts && d.gts.count) || (d.gts && d.gts.stations || []).length;
    const note = `${(this._windN || 0).toLocaleString()}개소 · 입자가 실측 풍속으로 흐름 · 최강 ${this._windMax != null ? this._windMax.toFixed(1) : '—'}m/s`;
    return {
      badge: 'OBSERVED', note,
      cardHtml: `지상 바람 관측 — 관측소 ${(this._windN || 0).toLocaleString()}개소의 실측 풍향·풍속을 선분(불어가는 방향, 색·길이=풍속)으로 표시.<br/>`
        + `한국 AWS ${nA}개소 (기상청) + 전 세계 지상관측 ${Number(nG).toLocaleString()}개소 (GTS)<br/>`
        + `입자는 각 관측소의 실측 벡터 위에서만 흐릅니다 — 격자 보간·가상 유선 없음 (관측 없는 곳은 비어 있음)`,
    };
  }

  // ---------- 도시 인구 타워 (지시서 R-01 맨해튼 · R-02 샌프란만 · MODEL_SIGNAL) ----------
  //
  // R-01/R-02 가 보존하라는 것: "도시 전체에서 **수많은 vertical bars** 가 실제 지리 위에
  // 솟는" 문법. 금지: 평면 heatmap 으로 대체.
  //
  // ⚠️ 서울 실시간 혼잡(seoul)과 **다른 것**이다. 저쪽은 서울시가 지금 관측한 사람 수고,
  //    이쪽은 WorldPop 이 위성·행정자료로 추정한 **거주 인구**다. 같은 막대로 그리되
  //    배지와 카드가 그 차이를 분명히 말해야 한다 — 안 그러면 추정이 관측으로 읽힌다.
  //
  // 대상은 다섯 나라뿐이다(한국·일본·대만·영국·미국). 그 밖의 나라에는 넣지 않는다.
  buildPopTower(d) {
    const c = d.city;
    const g = c.grid;
    const cells = c.cells || [];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
    mesh.userData.popTower = {
      city: c, index: d.index,
      maxPop: Math.max(1, ...cells.map((x) => x[2])),
      altKm: null,
    };
    this._popTowerApply(mesh);
    return mesh;
  }

  _popTowerApply(mesh, altKm) {
    const u = mesh.userData.popTower;
    if (!u) return;
    if (Number.isFinite(altKm)) u.altKm = altKm;
    const c = u.city;
    const g = c.grid;
    const cells = c.cells || [];
    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const UP = new THREE.Vector3(0, 1, 0);
    // 칸 자체의 폭(도 → 지구 반지름 1 기준). 멀리서는 굵게 해야 막대가 보인다.
    const cellW = (g.cellM / 6371000);
    const W = cellW * Math.max(1, Math.min(4, (u.altKm || 400) / 220));
    const H_MAX = 0.0040;      // 최대 인구 칸에서 ~25km (시각 과장)
    for (let i = 0; i < cells.length; i += 1) {
      const [gx, gy, v] = cells[i];
      const lon = g.lon0 + (gx + 0.5) * g.dLon;
      const lat = g.lat0 - (gy + 0.5) * g.dLat;
      // 높이는 인구의 제곱근이다 — 선형이면 도심 몇 칸만 남고 나머지가 사라진다.
      // 값이 아니라 자리를 넓힌 것이고 카드에 적는다(인구 조각의 세제곱근과 같은 관례).
      const h = 0.00012 + H_MAX * Math.sqrt(v / u.maxPop);
      const rBase = this.surfR(lat, lon, 0.00012);
      const dir = llToV3(lat, lon, 1).normalize();
      Q.setFromUnitVectors(UP, dir);
      M.compose(dir.clone().multiplyScalar(rBase + h / 2), Q, new THREE.Vector3(W, h, W));
      mesh.setMatrixAt(i, M);
      const [r, gg, b] = POP_RAMP(v / u.maxPop);
      mesh.setColorAt(i, new THREE.Color(r / 255, gg / 255, b / 255));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // 다른 도시로 갈아 끼운다. 순서는 색인이 정한다(한국이 먼저).
  async popTowerCity(id) {
    const l = this.layers.poptower;
    if (!l || !l.on || !l.obj) return null;
    const city = await (await fetch(`./popcity/${id}.json`, { cache: 'no-cache' })).json();
    l.data.city = city;
    const old = l.obj;
    const next = this.buildPopTower(l.data);
    next.userData.popTower.altKm = old.userData.popTower.altKm;
    this._popTowerApply(next);
    this.group.remove(old);
    old.geometry.dispose();
    old.material.dispose();
    this.group.add(next);
    l.obj = next;
    l.meta = this.metaPopTower(l.data);
    return city;
  }

  metaPopTower(d) {
    const c = d.city;
    const st = c.stats || {};
    const list = (d.index && d.index.cities || []).map((x) => {
      const on = x.id === c.id;
      return `<button class="simgo" style="padding:2px 8px;font-size:11px${on ? ';border-color:var(--accent)' : ''}" `
        + `data-action="popcity" data-city="${x.id}">${x.ko}${on ? ' ●' : ''}</button>`;
    }).join(' ');
    return {
      badge: 'MODEL_SIGNAL',
      note: `${c.ko} · ${(st.cells || 0).toLocaleString()}칸 · ${(st.total || 0).toLocaleString()}명 (거주)`,
      cardHtml: `<b>도시 인구 타워</b> — ${c.grid.cellM}m 칸마다 막대를 세웁니다. `
        + `${c.ko} 창 안 ${(st.cells || 0).toLocaleString()}칸 · 합계 `
        + `<b>${(st.total || 0).toLocaleString()}명</b> · 가장 많은 칸 ${(st.max || 0).toLocaleString()}명.<br/><br/>`
        + `⚠️ <b>거주 인구</b>입니다 — <b>지금 그 자리에 있는 사람 수가 아닙니다.</b> `
        + `WorldPop 이 위성·행정자료로 만든 격자 <b>추정치</b>이며 관측이 아닙니다. `
        + `'서울 실시간 인구'(관측)와 섞어 읽지 마세요.<br/>`
        + `${c.grid.cellM}m 칸으로 합칠 때 <b>합계를 보존</b>했습니다. 높이는 인구의 `
        + `<b>제곱근</b>에 비례합니다 — 선형이면 도심 몇 칸만 남고 나머지가 사라집니다. `
        + `값이 아니라 자리를 넓힌 것입니다.<br/><br/>`
        + `<b>도시</b> ${list}<br/>`
        + `<span style="opacity:.75">대상은 한국·일본·대만·영국·미국입니다. `
        + `미국은 100m 국가 파일이 1.4GB 라 도시 창만 받는 경로가 아직 없어 비워 뒀습니다 — `
        + `성긴 자료로 대신 채우지 않습니다.</span><br/>`
        + `출처 ${c.source} · ${c.license}`,
    };
  }

  // ---------- Argo 플로트 · 잠수 기록 (지시서 R-11 Dive Replay · OBSERVED) ----------
  //
  // R-11 이 지키라는 것: "actual track = solid, estimated horizontal path = dashed;
  // 측정된 depth 와 추정 위치를 혼동하지 않는다."
  //
  // Argo 는 그 구분이 자료의 성질 그 자체다. 플로트는 수면에 떠올랐을 때만 GPS 를 잡는다.
  // 부상점은 **측정**이고, 두 부상점 사이 열흘간의 경로는 **아무도 모른다**.
  // 그래서 점은 실선 점으로, 그 사이는 점선으로 긋는다. 지어낼 것이 없다 —
  // 자료가 이미 "여기까지가 관측이고 여기부터는 아니다"라고 말하고 있다.
  buildArgo(d) {
    const g = new THREE.Group();
    const rT = this.aboveCloudsR();
    const col = new THREE.Color('#63d2ff');
    const marks = [];
    for (const f of (d.floats || [])) {
      const fx = f.fixes || [];
      for (const p of fx) marks.push({ lat: p.lat, lon: p.lon, c: col });
      if (fx.length < 2) continue;
      // 구면에서 두 점을 직선으로 이으면 선이 지구를 파고든다 — 대권으로 잘게 나눈다.
      const pts = [];
      for (let i = 1; i < fx.length; i += 1) {
        const a = llToV3(fx[i - 1].lat, fx[i - 1].lon, 1).normalize();
        const b = llToV3(fx[i].lat, fx[i].lon, 1).normalize();
        const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
        const n = Math.max(2, Math.min(24, Math.ceil(ang / 0.02)));
        for (let k = (i === 1 ? 0 : 1); k <= n; k += 1) {
          const t = k / n;
          const v = (ang < 1e-6)
            ? a.clone()
            : a.clone().multiplyScalar(Math.sin((1 - t) * ang) / Math.sin(ang))
              .add(b.clone().multiplyScalar(Math.sin(t * ang) / Math.sin(ang)));
          pts.push(v.normalize().multiplyScalar(rT));
        }
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: col, transparent: true, opacity: 0.6, depthWrite: false,
        dashSize: 0.006, gapSize: 0.005,
      }));
      line.computeLineDistances();      // 이걸 안 부르면 점선이 실선으로 나온다
      g.add(line);
    }
    // 부상점 = 측정된 위치. 마지막 위치는 크고 밝게.
    if (marks.length) g.add(this.makePoints(marks, { size: 3.4, lift: rT - 1.0035, opacity: 0.9 }));
    const last = (d.floats || []).filter((f) => f.last).map((f) => ({
      lat: f.last.lat, lon: f.last.lon, c: new THREE.Color('#ffffff'),
    }));
    if (last.length) g.add(this.makePoints(last, { size: 7, lift: rT - 1.0035, additive: true }));
    return g;
  }

  // 수심-수온 단면. 가로는 사이클(시간), 세로는 수심, 색은 실측 수온.
  // 이건 우리가 만든 곡선이 아니라 플로트가 층마다 잰 값을 그대로 칠한 것이다.
  argoSectionSvg(f) {
    const sec = f.section || [];
    if (!sec.length) return '';
    const W = 268; const H = 132; const L = 30; const B = 16;
    const maxP = Math.max(2000, ...sec.map((c) => c.lv[c.lv.length - 1][0]));
    const cw = (W - L - 4) / sec.length;
    let body = '';
    sec.forEach((c, i) => {
      const x = L + i * cw;
      for (let k = 0; k < c.lv.length; k += 1) {
        const p0 = c.lv[k][0];
        const p1 = k + 1 < c.lv.length ? c.lv[k + 1][0] : maxP;
        // 수심축은 제곱근이다. 선형으로 두면 바다의 실제 구조인 표층 수온약층이
        // 2,000m 중 100m, 즉 6픽셀로 뭉개진다. 값을 바꾸는 게 아니라 자리만 넓힌다 —
        // 그 사실은 카드에 적는다.
        const y0 = (H - B) * Math.sqrt(p0 / maxP);
        const y1 = (H - B) * Math.sqrt(p1 / maxP);
        const [r, gg, b] = SST_RAMP(c.lv[k][1]);
        body += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${(cw - 1).toFixed(1)}" `
          + `height="${Math.max(0.8, y1 - y0).toFixed(1)}" fill="rgb(${r | 0},${gg | 0},${b | 0})"/>`;
      }
      const t = (c.t || '').slice(5, 10);
      body += `<text x="${(x + cw / 2).toFixed(1)}" y="${H - 4}" fill="#8fa4bd" font-size="8" `
        + `text-anchor="middle">${t}</text>`;
    });
    for (const p of [0, 100, 500, 1000, 2000]) {
      if (p > maxP) continue;
      const y = (H - B) * Math.sqrt(p / maxP);
      body += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" `
        + `stroke="rgba(255,255,255,.18)" stroke-width="0.7"/>`
        + `<text x="${L - 4}" y="${Math.min(H - B - 1, y + 3).toFixed(1)}" fill="#8fa4bd" `
        + `font-size="8" text-anchor="end">${p}m</text>`;
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="margin-top:6px">${body}</svg>`;
  }

  metaArgo(d) {
    const c = d.counts || {};
    const withSec = (d.floats || []).filter((f) => f.section && f.section.length);
    const show = withSec.slice(0, 2);
    const secs = show.map((f) => {
      const n = (f.fixes || []).length;
      return `<div style="margin-top:8px"><b>플로트 ${f.id}</b> — 부상 ${n}회 기록 · `
        + `마지막 ${(f.last && f.last.t || '').slice(0, 10)}`
        + `${this.argoSectionSvg(f)}</div>`;
    }).join('');
    return {
      badge: 'OBSERVED',
      note: `플로트 ${c.tracked || 0}대 · 수심 단면 ${c.withSection || 0}대 · `
        + `전 세계 활동 중 ${(c.activeFloats || 0).toLocaleString()}대`,
      cardHtml: `<b>Argo 플로트</b> — 바다에 떠다니며 스스로 오르내리는 관측 로봇입니다. `
        + `약 열흘에 한 번 2,000m 까지 내려갔다 올라오면서 <b>수심마다 수온·염분을 잽니다</b>.<br/><br/>`
        + `<b>흰 점</b> = 지금 위치 · <b>작은 점</b> = 떠올랐던 자리(측정) · `
        + `<b>점선</b> = 그 사이 경로(<b>추정</b>)<br/>`
        + `잠수 중에는 위치를 알 수 없습니다 — GPS 는 수면에서만 잡힙니다. `
        + `점선은 우리가 이어 본 선이지 관측이 아닙니다.<br/>`
        + `아래 그림은 <b>실측 수심-수온 단면</b>입니다. 가로는 부상 시각, 세로는 수심, 색은 수온.<br/>`
        + `<span style="opacity:.75">세로축은 <b>제곱근 눈금</b>입니다 — 선형으로 두면 바다의 실제 구조인 `
        + `표층 수온약층이 2,000m 중 100m, 즉 몇 픽셀로 뭉개집니다. 값이 아니라 자리만 넓힌 것입니다.</span>`
        + secs
        + `<br/>출처 ${d.source || 'Argo'} · ${(d.generated || '').slice(0, 16).replace('T', ' ')}Z`,
    };
  }

  // ---------- 태풍 공식 트랙 (KMA·JMA·NHC · OFFICIAL) ----------
  buildTyphoon(d) {
    const g = new THREE.Group();
    const rT = this.aboveCloudsR();
    const tracks = [];
    const animMats = [];
    (d.storms || []).forEach((s, si) => {
      const ag = (s.agencies || []).find((a) => a.steps && a.steps.length) || {};
      const steps = ag.steps || [];
      if (!steps.length) return;
      const color = new THREE.Color(STORM_COLORS[si % STORM_COLORS.length]);
      if (steps.length >= 2) {
        const pos = new Float32Array(steps.length * 3);
        steps.forEach((st, i) => {
          const v = llToV3(st.lat, st.lon, rT);
          pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        });
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.85, depthWrite: false,
        })));
      }
      // 스텝 점: 현재(h=0) 크게, 예보점은 풍속 비례
      const items = steps.map((st) => ({ lat: st.lat, lon: st.lon, c: color }));
      const pts = this.makePoints(items, { size: 5, lift: rT - 1.0035 });
      g.add(pts);
      const now = steps[0];
      // 중심에는 사이클론 기호를 얹는다(PD 요청). 흰 점은 '여기가 태풍'을 말해주지 못한다.
      const nowPt = this.makeCyclones([{ lat: now.lat, lon: now.lon, c: color }],
        { size: 34, lift: rT - 1.0035 });
      g.add(nowPt);
      animMats.push(nowPt.material);
      // 타임 스크럽용: 각 스텝의 유효시각을 붙여 둔다. 이게 있어야 '그 시각의 위치'를 낸다.
      const timed = steps
        .map((st) => ({ t: parseValidUtc(st.validUtc), lat: st.lat, lon: st.lon, wind: st.windMs, h: st.h }))
        .filter((x) => x.t && x.lat != null && x.lon != null);
      if (timed.length >= 2) tracks.push({ name: ag.name || s.name, color, steps: timed, nowPt });
    });
    // 시각을 옮겼을 때 그 시각의 예보 위치를 표시할 표식. 관측된 현재 위치(흰 점)와
    // 구분되게 속 빈 느낌으로 크게 둔다 — 이건 관측이 아니라 공식 '예보' 위치다(15.5).
    if (tracks.length) {
      // 스크럽 표식도 같은 기호로 — 다만 조금 작고 옅게(관측이 아니라 '예보 위치'다).
      const mk = this.makeCyclones(
        tracks.map((t) => ({ lat: t.steps[0].lat, lon: t.steps[0].lon, c: t.color })),
        { size: 28, lift: rT - 1.0035, opacity: 0.78 },
      );
      mk.visible = false;
      g.add(mk);
      animMats.push(mk.material);
      g.userData.tyTracks = tracks;
      g.userData.tyMarker = mk;
      g.userData.tyRadius = rT;
    }
    if (animMats.length) g.userData.animMats = animMats;   // tick() 이 매 프레임 uTime 을 준다
    return g;
  }

  // 타임 스크럽 → 태풍의 '그 시각' 공식 예보 위치.
  // 예보 구간 밖(과거이거나 마지막 스텝 이후)이면 표식을 숨긴다. 없는 위치를 만들지 않는다.
  setTimeOffset(ms) {
    this._timeOffsetMs = ms || 0;
    // 서울 혼잡 타워도 시간을 따라 다시 선다 (R-01 time scrub 문법).
    const sl = this.layers.seoul;
    if (sl && sl.on && sl.obj && sl.obj.userData && sl.obj.userData.seoul) {
      this._seoulApply(sl.obj, ms || 0);
    }

    const l = this.layers.tyoff;
    const ud = l && l.on && l.obj && l.obj.userData;
    if (!ud || !ud.tyMarker) return;
    const mk = ud.tyMarker;
    const at = Date.now() + (ms || 0);
    const pos = mk.geometry.attributes.position.array;
    const col = mk.geometry.attributes.aColor.array;
    let shown = 0;
    ud.tyTracks.forEach((tr, i) => {
      const st = tr.steps;
      let p = null;
      if (at >= st[0].t && at <= st[st.length - 1].t) {
        for (let k = 1; k < st.length; k += 1) {
          if (at <= st[k].t) {
            const f = (at - st[k - 1].t) / Math.max(1, st[k].t - st[k - 1].t);
            let dLon = st[k].lon - st[k - 1].lon;
            if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;  // 날짜변경선
            p = { lat: st[k - 1].lat + (st[k].lat - st[k - 1].lat) * f, lon: st[k - 1].lon + dLon * f };
            break;
          }
        }
      }
      const o = i * 3;
      if (p) {
        const v = llToV3(p.lat, p.lon, ud.tyRadius);
        pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        col[o] = tr.color.r; col[o + 1] = tr.color.g; col[o + 2] = tr.color.b;
        shown += 1;
      } else {
        col[o] = 0; col[o + 1] = 0; col[o + 2] = 0;   // 구간 밖 — 그리지 않는다
      }
    });
    mk.geometry.attributes.position.needsUpdate = true;
    mk.geometry.attributes.aColor.needsUpdate = true;
    mk.visible = shown > 0 && Math.abs(ms || 0) > 60000;
    // 관측된 '지금' 위치는 지금일 때만 보인다 — 미래 화면에 과거 관측을 남기지 않는다.
    for (const tr of ud.tyTracks) if (tr.nowPt) tr.nowPt.visible = Math.abs(ms || 0) <= 60000;
  }

  metaTyphoon(d) {
    const rows = (d.storms || []).map((s, si) => {
      const ag = (s.agencies || []).find((a) => a.steps && a.steps.length);
      if (!ag) return null;
      const now = ag.steps[0];
      const last = ag.steps[ag.steps.length - 1];
      const c = STORM_COLORS[si % STORM_COLORS.length];
      return `<span style="color:${c}">●</span> <b>${ag.name || s.name}</b> (${ag.agencyKo || ag.agency}) — 중심기압 ${now.hpa ?? '—'}hPa · 최대풍속 ${now.windMs ?? '—'}m/s<br/>&nbsp;&nbsp;${now.place || ''}<br/>&nbsp;&nbsp;예보 +${last.h}h까지 ${ag.steps.length}스텝 <button class="simgo" style="padding:2px 8px;font-size:11px" data-action="ty-focus" data-lat="${now.lat}" data-lon="${now.lon}">보기 →</button> <button class="simgo" style="padding:2px 8px;font-size:11px" data-action="ty-sim" data-lat="${now.lat}" data-lon="${now.lon}" data-wind="${now.windMs ?? ''}">이 조건으로 바다 시뮬 →</button>`;
    }).filter(Boolean);
    const note = `활성 ${rows.length}개 (전 세계 ${d.count ?? '—'}) · ${kstShort(d.generated)}`;
    return {
      badge: 'OFFICIAL_FORECAST', note,
      cardHtml: `기상청·JMA·NHC 공식 태풍 정보 — 트랙 있는 ${rows.length}개를 선(공식 예보 경로)+점(예보 스텝)으로 표시.<br/>${rows.join('<br/>') || '현재 활성 태풍 없음'}<br/>${kstShort(d.generated)} · 발표기관 원문 값 그대로 (가공 없음)`,
    };
  }
}

// 지역 뉴스 대표점 (기사에 좌표가 없다 — 지역 단위임을 카드에 명시한다)
const NEWS_REGION = {
  동남아: [10.5, 106.0],
  오세아니아: [-27.0, 150.0],
  중동: [27.0, 45.0],
  아프리카: [2.0, 22.0],
  남미: [-12.0, -58.0],
};

// 필드 색 램프 — 정지점 사이 선형 보간 (RGB 0~255 배열 반환)
const rampFrom = (stops) => (v) => {
  if (v <= stops[0][0]) return stops[0].slice(1);
  const last = stops[stops.length - 1];
  if (v >= last[0]) return last.slice(1);
  for (let i = 1; i < stops.length; i += 1) {
    if (v <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = (v - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  return last.slice(1);
};
// 해수온 (°C): 1.0 gridoverlay의 sst 눈금과 같은 계열
// 도시 인구 타워 색 — 어두운 남색(성김) → 청록 → 노랑 → 주황(빽빽).
// 0~1 로 정규화한 값을 받는다.
const POP_RAMP = rampFrom([
  [0.00, 40, 70, 120], [0.08, 46, 130, 170], [0.20, 70, 190, 170],
  [0.40, 200, 205, 110], [0.70, 240, 150, 70], [1.00, 245, 90, 80],
]);
const SST_RAMP = rampFrom([
  [-2, 22, 40, 92], [4, 30, 96, 168], [10, 46, 156, 176], [16, 108, 196, 140],
  [22, 232, 206, 110], [27, 236, 140, 72], [32, 208, 62, 62],
]);
// ---- 전지구 격자 색 눈금 ----
// 강수 (mm): 0은 칠하지 않는다 — 안 오는 곳을 파랗게 칠하면 지구 전체가 비가 된다
const RAIN_BASE = rampFrom([
  [0.1, 90, 150, 230], [1, 60, 190, 200], [3, 80, 210, 120],
  [8, 240, 210, 90], [20, 240, 130, 70], [50, 220, 60, 90],
]);
const RAIN_RAMP = (v) => (v == null || v < 0.1 ? null : RAIN_BASE(v));
// 기온 (°C)
const TEMP_RAMP = rampFrom([
  [-40, 60, 40, 130], [-20, 40, 90, 190], [-5, 70, 165, 205], [5, 120, 195, 165],
  [15, 225, 210, 120], [25, 235, 145, 75], [35, 210, 55, 60], [45, 150, 30, 50],
]);
// 해면기압 (hPa)
const PRES_RAMP = rampFrom([
  [950, 190, 60, 90], [980, 225, 140, 80], [1000, 120, 190, 170],
  [1013, 70, 140, 200], [1030, 60, 80, 175], [1050, 50, 45, 130],
]);
// 풍속 (m/s)
const SPD_RAMP = rampFrom([
  [0, 40, 70, 110], [3, 60, 150, 190], [8, 90, 205, 150],
  [15, 235, 205, 100], [25, 235, 130, 70], [35, 215, 55, 70],
]);
// 초미세먼지 PM2.5 (㎍/㎥) — 한국 환경부 4등급 경계에 맞춘 색
const PM25_BASE = rampFrom([
  [0, 63, 167, 255], [15, 79, 208, 106], [35, 255, 171, 61], [75, 255, 77, 77], [150, 150, 30, 60],
]);
const PM25_RAMP = (v) => (v == null ? null : PM25_BASE(v));
// 자외선 지수 — 0은 밤이라 칠하지 않는다
const UV_BASE = rampFrom([
  [1, 80, 180, 120], [3, 230, 210, 90], [6, 240, 150, 60], [8, 225, 70, 80], [11, 150, 60, 180],
]);
const UV_RAMP = (v) => (v == null || v < 0.5 ? null : UV_BASE(v));

// 수온 아노말리 (평년 대비 °C) — 0 근처는 칠하지 않는다(평년과 같다는 뜻)
const SSTANOM_BASE = rampFrom([
  [-4, 40, 90, 200], [-2, 70, 150, 220], [-0.5, 140, 200, 230],
  [0.5, 245, 210, 150], [2, 240, 130, 70], [4, 215, 45, 55],
]);
const SSTANOM_RAMP = (v) => (v == null || Math.abs(v) < 0.25 ? null : SSTANOM_BASE(v));

// 해수면 상승 전망 (cm) — 0은 거의 흰빛, 80cm는 짙은 자주
const SLR_KHOA_RAMP = rampFrom([
  [0, 200, 225, 245], [15, 120, 190, 215], [30, 90, 150, 210],
  [45, 240, 205, 110], [60, 235, 125, 70], [80, 190, 40, 90],
]);
// 연안 침수 깊이 구간 하한(m)
const FLOOD_RAMP = rampFrom([
  [0, 159, 212, 255], [0.5, 79, 163, 240], [1, 43, 111, 214], [2, 123, 63, 224], [3, 194, 43, 107],
]);

// 유의파고 (m)
const WAVE_RAMP = rampFrom([
  [0, 26, 60, 96], [1, 38, 122, 168], [2.5, 70, 178, 170], [4, 226, 200, 108],
  [6, 232, 132, 72], [8, 210, 60, 66],
]);

// 에어코리아 공식 4등급 색 (좋음/보통/나쁨/매우나쁨)
const AIR_GRADE_COLOR = { 1: '#3fa7ff', 2: '#4fd06a', 3: '#ffab3d', 4: '#ff4d4d' };

// 풍속(m/s) → 색 (잔잔 연청 → 강풍 빨강)
const windColor = (ws) => {
  const x = Math.min(Math.max(ws / 25, 0), 1);
  const c = new THREE.Color();
  c.setHSL(0.55 - 0.55 * x, 0.85, 0.44 + 0.14 * x);
  return c;
};

function disposeDeep(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}
