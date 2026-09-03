// EARTHUS v2 — 지상관측 기입 모형 (station model)
//
// 왜: PD 가 기상청 일기도 기호표를 주며 "이거 중요해 이걸 표현하자" 라고 했다.
// 운량·일기·바람·전선·기압의 표준 기호 체계다. 우리가 가진 실측으로 그릴 수 있는 것만
// 그린다 — 없는 것은 그리지 않는다.
//
// 그릴 수 있는 것 (전부 OBSERVED, 실측):
//   운량   GTS cloud(8분법) · 기상청 CA(10분법)   ← 척도가 다르다. 아래 참고
//   바람   wd 풍향 · ws 풍속 → 깃 (반깃 1 · 온깃 2 · 삼각깃 10 m/s, 기상청 m/s 관례)
//   기온   ta / temp_c        이슬점 td / dewp_c        해면기압 ps / pres_sea
//   일기   기상청 WW 코드 (있는 곳에만 — 97곳 중 3곳만 값이 온다, 실측 확인)
//
// 못 그리는 것: 전선(한랭·온난·정체·폐색). 각 기관이 그림으로만 발표하고 좌표를 주지
//   않는다. 자료원을 찾기 전에는 그리지 않는다 — 우리가 그으면 그건 우리 예보가 된다.
//
// ⚠ 척도 함정(실측으로 확인): 기상청 CA 는 0~10(10분법)이고 GTS SYNOP N 은 0~8(okta)다.
//   그대로 섞으면 okta 8(온흐림)이 10분법 8(7~8 구간)로 읽혀 흐림이 갬으로 둔갑한다.
//   GTS 는 10분법으로 환산해서 쓰고, 환산했다는 사실을 카드에 적는다.
import * as THREE from '../../vendor/three-r184.module.min.js';

const AWS_URL = '/wind/kma-aws.json';
const GTS_URL = '/wind/gts-global.json';

// 고도별 예산. 멀리서 다 찍으면 기호가 서로 겹쳐 아무것도 안 읽힌다.
const LOD = [
  { alt: 6000, max: 0, gapX: 999, gapY: 999 },   // 이 위에서는 기입 모형이 의미가 없다
  { alt: 3000, max: 14, gapX: 110, gapY: 74 },
  { alt: 1200, max: 30, gapX: 96, gapY: 66 },
  { alt: 500, max: 55, gapX: 88, gapY: 60 },
  { alt: 0, max: 90, gapX: 82, gapY: 56 },
];

function lodFor(altKm) {
  for (const l of LOD) if (altKm >= l.alt) return l;
  return LOD[LOD.length - 1];
}

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

// ---------------------------------------------------------------------------
// 운량 기호 (10분법) — 기상청 기호표 그대로
//   0 빈원 · 1 세로선 · 2~3 1/4 · 4 1/4+선 · 5 1/2 · 6 1/2+선 · 7~8 3/4 · 9 거의참 · 10 참
//   불명은 ⊗
// ---------------------------------------------------------------------------
function cloudGlyph(g, cx, cy, r, tenths) {
  const stroke = '#e8eef6';
  g.appendChild(el('circle', { cx, cy, r, fill: 'none', stroke, 'stroke-width': 1.4 }));
  if (tenths == null) {                                   // 불명 — ⊗
    const d = r * 0.72;
    g.appendChild(el('line', { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke, 'stroke-width': 1.3 }));
    g.appendChild(el('line', { x1: cx - d, y1: cy + d, x2: cx + d, y2: cy - d, stroke, 'stroke-width': 1.3 }));
    return;
  }
  const t = Math.max(0, Math.min(10, tenths));
  const pie = (a0, a1) => {                               // 12시 방향에서 시계로
    const p0 = (a0 - 90) * Math.PI / 180;
    const p1 = (a1 - 90) * Math.PI / 180;
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${cx + r * Math.cos(p0)} ${cy + r * Math.sin(p0)} `
      + `A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(p1)} ${cy + r * Math.sin(p1)} Z`;
  };
  const tick = () => g.appendChild(el('line', {
    x1: cx, y1: cy - r, x2: cx, y2: cy + r, stroke, 'stroke-width': 1.4,
  }));
  if (t >= 10) { g.appendChild(el('circle', { cx, cy, r, fill: stroke })); return; }
  if (t === 9) {                                          // 거의 참 — 가는 흰 틈만 남긴다
    g.appendChild(el('circle', { cx, cy, r, fill: stroke }));
    g.appendChild(el('line', { x1: cx, y1: cy - r, x2: cx, y2: cy + r, stroke: '#10151c', 'stroke-width': 1.6 }));
    return;
  }
  if (t >= 7) g.appendChild(el('path', { d: pie(0, 270), fill: stroke }));
  else if (t >= 5) { g.appendChild(el('path', { d: pie(0, 180), fill: stroke })); if (t === 6) tick(); }
  else if (t >= 2) { g.appendChild(el('path', { d: pie(0, 90), fill: stroke })); if (t === 4) tick(); }
  else if (t === 1) tick();
}

// ---------------------------------------------------------------------------
// 바람 깃 — 기상청 m/s 관례: 반깃 1 · 온깃 2 · 삼각깃 10
// PD 가 준 표의 값(1·2·5·7·10·12·25·27)이 이 규칙으로 정확히 떨어진다.
// 축은 '바람이 불어오는 쪽'으로 뻗는다(기상 관례). 깃은 북반구에서 축의 왼쪽에 붙인다.
// ---------------------------------------------------------------------------
function windGlyph(g, cx, cy, r, wsMs, wdDeg, north) {
  if (wsMs == null) return;
  if (wsMs < 0.5) {                                       // 고요함 — 이중 원
    g.appendChild(el('circle', { cx, cy, r: r + 3.2, fill: 'none', stroke: '#e8eef6', 'stroke-width': 1.1 }));
    return;
  }
  if (wdDeg == null) return;
  const stroke = '#dfe9f5';
  const a = (wdDeg - 90) * Math.PI / 180;                 // 불어오는 방향
  const ux = Math.cos(a), uy = Math.sin(a);
  const px = -uy * (north ? 1 : -1), py = ux * (north ? 1 : -1);   // 깃이 붙는 쪽
  const L = 26;
  const x0 = cx + ux * r, y0 = cy + uy * r;
  const x1 = cx + ux * (r + L), y1 = cy + uy * (r + L);
  g.appendChild(el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke, 'stroke-width': 1.5 }));

  let v = Math.round(wsMs);
  const tri = Math.floor(v / 10); v -= tri * 10;
  const full = Math.floor(v / 2); v -= full * 2;
  const half = v >= 1 ? 1 : 0;
  let d = r + L;                                          // 끝에서부터 안쪽으로 채운다
  const at = (dist) => [cx + ux * dist, cy + uy * dist];
  for (let i = 0; i < tri; i += 1) {
    const [ax, ay] = at(d);
    const [bx, by] = at(d - 7);
    g.appendChild(el('path', {
      d: `M ${ax} ${ay} L ${ax + px * 11} ${ay + py * 11} L ${bx} ${by} Z`, fill: stroke,
    }));
    d -= 8.5;
  }
  for (let i = 0; i < full; i += 1) {
    const [ax, ay] = at(d);
    g.appendChild(el('line', { x1: ax, y1: ay, x2: ax + px * 11, y2: ay + py * 11, stroke, 'stroke-width': 1.5 }));
    d -= 4.6;
  }
  if (half) {
    const [ax, ay] = at(d);
    g.appendChild(el('line', { x1: ax, y1: ay, x2: ax + px * 5.6, y2: ay + py * 5.6, stroke, 'stroke-width': 1.5 }));
  }
}

// ---------------------------------------------------------------------------
// 일기 기호 — 기상청 기호표. WMO ww(4677) 두 자리로 가른다.
// 값이 오는 곳에만 그린다(실측: 기상청 97곳 중 3곳).
// ---------------------------------------------------------------------------
function wxKind(ww) {
  if (ww == null) return null;
  const s = String(ww).trim();
  if (!s || s === '-' || s === '0') return null;
  const n = parseInt(s.slice(0, 2), 10);
  if (!Number.isFinite(n)) return null;
  if (n >= 95) return 'thunder';
  if (n >= 85) return 'snowShower';
  if (n >= 83) return 'sleetShower';
  if (n >= 80) return 'shower';
  if (n >= 70) return 'snow';
  if (n >= 68) return 'sleet';
  if (n >= 60) return 'rain';
  if (n >= 50) return 'drizzle';
  if (n >= 40) return 'fog';
  return null;
}

function wxGlyph(g, cx, cy, kind) {
  const c = '#cfe0f2';
  const dot = (x, y, rr) => g.appendChild(el('circle', { cx: x, cy: y, r: rr, fill: c }));
  const star = (x, y, s) => {
    for (let i = 0; i < 3; i += 1) {
      const a = (i * 60) * Math.PI / 180;
      g.appendChild(el('line', {
        x1: x - Math.cos(a) * s, y1: y - Math.sin(a) * s,
        x2: x + Math.cos(a) * s, y2: y + Math.sin(a) * s, stroke: c, 'stroke-width': 1.2,
      }));
    }
  };
  const tri = (x, y, s) => g.appendChild(el('path', {   // 소나기의 ▽
    d: `M ${x - s} ${y - s * 0.9} L ${x + s} ${y - s * 0.9} L ${x} ${y + s} Z`,
    fill: 'none', stroke: c, 'stroke-width': 1.2,
  }));
  switch (kind) {
    case 'rain': dot(cx, cy, 2.1); break;
    case 'drizzle': g.appendChild(el('path', {
      d: `M ${cx} ${cy - 2} q 2.4 1.4 0 4.2`, fill: 'none', stroke: c, 'stroke-width': 1.4,
    })); break;
    case 'snow': star(cx, cy, 3.4); break;
    case 'sleet': dot(cx, cy - 3.2, 1.8); star(cx, cy + 2.6, 3.0); break;
    case 'shower': tri(cx, cy + 1.5, 3.6); dot(cx, cy - 4.6, 1.8); break;
    case 'sleetShower': tri(cx, cy + 1.5, 3.6); dot(cx, cy - 5.0, 1.6); break;
    case 'snowShower': tri(cx, cy + 1.5, 3.6); star(cx, cy - 4.8, 2.6); break;
    case 'thunder':                                       // ⌐| 모양
      g.appendChild(el('path', {
        d: `M ${cx - 3.6} ${cy - 4.4} L ${cx + 2.6} ${cy - 4.4} L ${cx - 1.2} ${cy + 0.4} `
          + `L ${cx + 3.2} ${cy + 0.4} L ${cx - 2.4} ${cy + 5.2}`,
        fill: 'none', stroke: c, 'stroke-width': 1.3, 'stroke-linejoin': 'round',
      })); break;
    case 'fog':
      for (let i = 0; i < 3; i += 1) {
        g.appendChild(el('line', {
          x1: cx - 4, y1: cy - 3.4 + i * 3.4, x2: cx + 4, y2: cy - 3.4 + i * 3.4,
          stroke: c, 'stroke-width': 1.2,
        }));
      }
      break;
    default: break;
  }
}

const n1 = (v) => (v == null ? null : Math.round(v));
// 해면기압은 마지막 세 자리만 적는 것이 관례다 (1013.9 → 139, 998.4 → 984).
const presShort = (hpa) => (hpa == null ? null : String(Math.round(hpa * 10) % 1000).padStart(3, '0'));

export class StationModel {
  constructor(host) {
    this.host = host;
    this.layer = document.createElement('div');
    this.layer.id = 'synop-layer';
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;display:none';
    host.appendChild(this.layer);
    this.pool = [];
    this.sites = null;
    this.on = false;
    this.meta = null;
    this.lastKey = '';
    this.frame = 0;
    this._v = new THREE.Vector3();
    this._cam = new THREE.Vector3();
  }

  setVisible(v) {
    this.on = !!v;
    this.layer.style.display = this.on ? 'block' : 'none';
    if (!this.on) this.lastKey = '';
  }

  // 두 자료를 그대로 나란히 둔다. 합치지 않는다 — 척도도 기관도 다르다.
  async load() {
    if (this.sites) return this.meta;
    const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`${u} ${r.status}`);
      return r.json();
    });
    const [aws, gts] = await Promise.all([get(AWS_URL).catch(() => null), get(GTS_URL).catch(() => null)]);
    if (!aws && !gts) throw new Error('지상관측 자료를 받지 못했습니다');
    const sites = [];
    if (aws && aws.stations) {
      for (const s of aws.stations) {
        if (s.lat == null || s.lon == null) continue;
        sites.push({
          lat: s.lat, lon: s.lon, name: s.name, src: 'KMA',
          // 기상청 CA 는 10분법 그대로. -9 는 결측이다.
          cloud: (s.cloud == null || s.cloud < 0) ? null : Math.round(s.cloud),
          ws: s.wind_ms, wd: s.wind_dir, ta: s.temp_c, td: s.dewp_c, ps: s.pres_sea,
          wx: wxKind((s.raw || {}).WW),
          rank: 3,
        });
      }
    }
    if (gts && gts.stations) {
      for (const s of gts.stations) {
        if (s.lat == null || s.lon == null) continue;
        // GTS N 은 okta(0~8). 9 는 '하늘 안 보임' — 불명으로 둔다.
        let cl = null;
        if (s.cloud != null && s.cloud >= 0 && s.cloud <= 8) cl = Math.round((s.cloud * 10) / 8);
        sites.push({
          lat: s.lat, lon: s.lon, name: s.name, src: 'GTS',
          cloud: cl, ws: s.ws, wd: s.wd, ta: s.ta, td: s.td, ps: s.ps,
          wx: null,                                        // GTS 자료에 일기 항목이 없다
          rank: 1,
        });
      }
    }
    for (const s of sites) {
      const la = (s.lat * Math.PI) / 180;
      const lo = (s.lon * Math.PI) / 180;
      const cl = Math.cos(la);
      s.unit = new THREE.Vector3(cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo));
    }
    this.sites = sites;
    // 어디에 눈이 있고 어디에 없는지를 센다. 빈 지역은 '날씨가 없다'가 아니라
    // '관측이 안 들어온다'는 뜻이다 — 그걸 말해주지 않으면 지도가 거짓말을 한다.
    const box = (la0, la1, lo0, lo1) => sites.filter(
      (x) => x.lat >= la0 && x.lat < la1 && x.lon >= lo0 && x.lon < lo1,
    ).length;
    this.meta = {
      aws: aws ? (aws.stations || []).length : 0,
      gts: gts ? (gts.stations || []).length : 0,
      awsAt: aws && aws.observedKst,
      gtsAt: gts && gts.observedUtc,
      wxCount: sites.filter((s) => s.wx).length,
      cover: {
        '한국·일본': box(25, 46, 122, 146),
        '중국 본토': box(20, 48, 75, 122),
        '몽골': box(42, 52, 88, 120),
        '인도': box(8, 32, 68, 90),
        '러시아 동부': box(50, 70, 90, 140),
        '유럽': box(35, 70, -10, 40),
        '북미': box(25, 70, -170, -50),
        '아프리카': box(-35, 35, -18, 52),
        '남미': box(-55, 12, -82, -35),
        '오세아니아': box(-48, -8, 110, 180),
      },
    };
    return this.meta;
  }

  // 한 관측소의 기입 모형 하나. 가운데 운량, 축은 바람, 왼쪽 기온·이슬점, 오른쪽 기압.
  buildSvg(s) {
    const W = 96, H = 58, cx = 48, cy = 29, r = 7.5;
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const g = el('g', {});
    svg.appendChild(g);
    windGlyph(g, cx, cy, r, s.ws, s.wd, s.lat >= 0);
    cloudGlyph(g, cx, cy, r, s.cloud);
    if (s.wx) wxGlyph(g, cx - 17, cy, s.wx);
    const txt = (x, y, v, fill, anchor) => {
      if (v == null) return;
      const t = el('text', {
        x, y, fill, 'text-anchor': anchor, 'font-size': 10.5,
        'font-family': 'ui-monospace,Menlo,Consolas,monospace', 'font-weight': 600,
      });
      t.textContent = v;
      g.appendChild(t);
    };
    txt(cx - 11, cy - 6, n1(s.ta), '#f0a882', 'end');       // 기온
    txt(cx - 11, cy + 13, n1(s.td), '#8fd3a6', 'end');      // 이슬점
    txt(cx + 11, cy - 6, presShort(s.ps), '#cfd9e6', 'start'); // 해면기압(끝 세 자리)
    return svg;
  }

  update(camera, altKm) {
    if (!this.on || !this.sites) return 0;
    this.frame += 1;
    if (this.frame % 3 !== 0) return -1;
    const lod = lodFor(altKm);
    if (!lod.max) { this.layer.style.display = 'none'; return 0; }
    this.layer.style.display = 'block';
    this._cam.copy(camera.position).normalize();
    const W = window.innerWidth, H = window.innerHeight;
    const vis = [];
    for (const s of this.sites) {
      const facing = s.unit.dot(this._cam);
      if (facing < 0.28) continue;
      this._v.copy(s.unit).project(camera);
      if (this._v.z > 1 || Math.abs(this._v.x) > 0.95 || Math.abs(this._v.y) > 0.92) continue;
      vis.push({
        s,
        x: (this._v.x * 0.5 + 0.5) * W,
        y: (-this._v.y * 0.5 + 0.5) * H,
        score: s.rank * facing,
      });
    }
    // 국내 관측(기상청)을 먼저, 그 다음 정면에 가까운 순으로.
    vis.sort((a, b) => b.score - a.score);
    const placed = [];
    for (const v of vis) {
      if (placed.length >= lod.max) break;
      if (placed.some((p) => Math.abs(p.x - v.x) < lod.gapX && Math.abs(p.y - v.y) < lod.gapY)) continue;
      placed.push(v);
    }
    // 같은 관측소 조합이면 위치만 옮긴다 — 매번 SVG 를 다시 만들면 눈에 띄게 버벅인다.
    const key = placed.map((p) => p.s.src + p.s.name).join('|');
    const rebuild = key !== this.lastKey;
    if (rebuild) this.lastKey = key;
    while (this.pool.length < placed.length) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;transform:translate(-50%,-50%);will-change:transform';
      this.layer.appendChild(d);
      this.pool.push(d);
    }
    this.pool.forEach((d, i) => {
      const v = placed[i];
      if (!v) { d.style.display = 'none'; return; }
      d.style.display = 'block';
      d.style.left = `${v.x}px`;
      d.style.top = `${v.y}px`;
      if (rebuild) { d.textContent = ''; d.appendChild(this.buildSvg(v.s)); }
      d.title = `${v.s.name || ''} (${v.s.src === 'KMA' ? '기상청' : 'GTS'})`;
    });
    return placed.length;
  }

  cardHtml() {
    const m = this.meta || {};
    const cov = Object.entries(m.cover || {})
      .map(([k, v]) => `${k} <b>${v.toLocaleString()}</b>`).join(' · ');
    return '지상관측 <b>기입 모형</b> — 기상청 일기도 기호 그대로. 전부 실측입니다(모델 아님).<br/>'
      + '가운데 원 = <b>운량</b> · 축과 깃 = <b>풍향·풍속</b> · 왼쪽 위 <span style="color:#f0a882">기온</span> · '
      + '왼쪽 아래 <span style="color:#8fd3a6">이슬점</span> · 오른쪽 위 <b>해면기압</b>(관례대로 끝 세 자리)<br/>'
      + '깃: 반깃 1 · 온깃 2 · 삼각깃 10 m/s (기상청 m/s 관례) · 고요함은 이중 원<br/>'
      + `관측소 기상청 ${m.aws || 0}개소 · GTS ${(m.gts || 0).toLocaleString()}개소`
      + `${m.awsAt ? ` · 기상청 ${m.awsAt} KST` : ''}${m.gtsAt ? ` · GTS ${m.gtsAt} UTC` : ''}<br/>`
      + '<b>변환 고지</b> — 기상청 운량은 10분법(0~10), GTS 는 8분법(okta 0~8)입니다. '
      + '섞으면 온흐림이 갬으로 읽혀서, GTS 값을 10분법으로 환산해 그립니다(×10÷8).<br/>'
      + `<b>일기 기호</b>는 기상청 WW 코드가 오는 곳에만 그립니다 — 지금 ${m.wxCount || 0}곳. `
      + 'GTS 자료에는 일기 항목이 없어 비워 둡니다.<br/>'
      + '<b>전선</b>(한랭·온난·정체·폐색)은 아직 그리지 않습니다 — 기관들이 그림으로만 발표하고 '
      + '좌표를 주지 않습니다. 우리가 그으면 그건 우리 예보가 됩니다.<br/><br/>'
      + `<b>관측이 닿는 곳</b> — ${cov}<br/>`
      + '비어 있는 지역은 <b>날씨가 없는 게 아니라 관측이 들어오지 않는 것</b>입니다. '
      + '이 피드(기상청 API허브 경유 GTS)는 중국·몽골·러시아 내륙이 사실상 비어 있습니다.';
  }
}
