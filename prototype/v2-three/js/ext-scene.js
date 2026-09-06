// EARTHUS v2-three — 확장 씬 런타임 (LAB · 취미)
//
// 왜 있나 (2026-09-06 받은 지시): 1.0(Cesium) 의 LAB·취미 메뉴를 v1 에서 숨기고 v2 로 옮긴다.
// 1.0 쪽 화면은 Cesium 엔티티에 묶여 있어 그대로 못 가져온다. 대신
//   · 자료·판정 모듈(1.0 의 /js/beaches.js, fishing.js, para.js, mountain.js, stats.js …)은
//     Cesium 을 모르므로 **절대경로 /js/… 로 그대로 import 해 다시 쓴다** (같은 origin 에 1.0 이 있다).
//   · 지구 위 그리기와 카드는 여기 규약으로 새로 쓴다 (travel.js 와 같은 Three.js 문법).
//
// 한 화면(모듈) = js/ext/<이름>.js 의 default export:
//   { key:'hobby/surf', title, badge,
//     async load(ctx, state, signal)   자료 받기 — state 에 채운다 (값을 만들지 않는다)
//     build(ctx, state)                ctx.add(...) 로 지구 위에 얹는다 (없으면 생략)
//     card(ctx, state) -> html         #intel-content 카드 본문
//     pick?(ctx, state, lat, lon)      지구를 눌렀을 때 → {title, badge, body} | null
//     action?(ctx, state, name, ds, value) -> {html?, inPlace?, point?:{lat,lon,altKm}, rebuild?, pending?} | null
//     afterRender?(ctx, state, root)   카드가 DOM 에 붙은 뒤 (SVG 그래프 등)
//     update?(ctx, state, camera, altKm) }
// 카드 안 버튼은 반드시 data-action="ext:<이름>" — 런타임이 ext: 를 떼고 활성 모듈에 넘긴다.
// 모듈은 **누를 때 처음 받는다** (v2 에는 동적 import 관례가 없었지만, 1.0 자료 모듈까지
// 끌고 오면 첫 로딩이 무거워지므로 여기서만 예외로 쓴다).

const R_M = 6371000;
const D2R = Math.PI / 180;
export const S3 = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const distKm = (a, b) => {
  const dLa = (b.lat - a.lat) * D2R; const dLo = (b.lon - a.lon) * D2R;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, x)));
};

/* 모듈 표 — 메뉴 키 → 파일. ui-shell.js 의 SCENES(lab·hobby) 와 짝이다.
   ⚠️ 여기 빠지면 메뉴는 보이는데 "모듈 없음" 카드가 뜬다. */
const MODULES = {
  'lab/today':     './ext/lab-today.js',
  'lab/charts':    './ext/lab-charts.js',
  'lab/reports':   './ext/lab-reports.js',
  'lab/crust':     './ext/lab-crust.js',
  'lab/requests':  './ext/lab-requests.js',
  'hobby/surf':    './ext/hobby-surf.js',
  'hobby/fishing': './ext/hobby-fishing.js',
  'hobby/para':    './ext/hobby-para.js',
  'hobby/mountain':'./ext/hobby-mountain.js',
  'hobby/turtle':  './ext/hobby-turtle.js',
  'hobby/seabird': './ext/hobby-seabird.js',
  'hobby/migbird': './ext/hobby-migbird.js',
  'hobby/ecobird': './ext/hobby-ecobird.js',
  'hobby/vessel':  './ext/hobby-vessel.js',
  'hobby/trench':  './ext/hobby-trench.js',
  'hobby/dive':    './ext/hobby-dive.js',
};
const EXT_VERSION = 'v=1';

let dotTex = null;

export class ExtScene {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {typeof import('three')} o.THREE
   * @param {(lat:number, lon:number)=>number} o.heightAt   지형 높이(m)
   * @param {()=>number} o.getExagger                        지형 과장 배율
   * @param {(lat:number, lon:number, altKm:number)=>void} o.flyTo
   * @param {()=>{lat:number, lon:number, altKm:number}} o.cam  지금 카메라가 보는 지점
   * @param {(state:string)=>string} o.badge                 dataBadge
   * @param {{ko:boolean, lang:string}} o.i18n
   * @param {(title:string, html:string, badge:string)=>void} o.refresh  활성 카드 다시 그리기
   */
  constructor(o) {
    this.THREE = o.THREE;
    this.group = new this.THREE.Group();
    this.group.visible = false;
    o.scene.add(this.group);
    this.heightAt = o.heightAt; this.getExagger = o.getExagger;
    this.flyTo = o.flyTo; this.cam = o.cam; this.badgeOf = o.badge; this.i18n = o.i18n;
    this._refresh = o.refresh;
    this.active = null;         // 'hobby/surf' 등 — 하나만 켠다
    this.modules = new Map();   // key → module
    this.states = new Map();    // key → state
    this.requestId = 0;
    this.controller = null;
    this._lastEx = null;
    this._cssDone = new Set();
    this.css(new URL('./ext/ext.css?' + EXT_VERSION, import.meta.url).href, 'ext-css');
  }

  // ---------------------------------------------------------------- ctx (모듈에 넘기는 도구)
  get ctx() {
    if (this._ctx) return this._ctx;
    const THREE = this.THREE;
    const self = this;
    const llToV3 = (lat, lon, r) => {
      const la = lat * D2R; const lo = lon * D2R; const cl = Math.cos(la);
      return new THREE.Vector3(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
    };
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
    this._ctx = {
      THREE, S3, esc, distKm, llToV3,
      get ko() { return self.i18n.ko; },
      get lang() { return self.i18n.lang; },
      badge: (s) => self.badgeOf(s),
      cam: () => self.cam(),
      flyTo: (lat, lon, altKm) => self.flyTo(lat, lon, altKm),
      /** 지표 반지름(과장 지형 위로 띄운다) — travel.js 와 같은 식 */
      surfR(lat, lon, lift = 0.004) {
        const h = Math.max(self.heightAt(lat, lon), 0);
        return 1 + (h / R_M) * self.getExagger() + lift;
      },
      add(obj) { self.group.add(obj); return obj; },
      /** 점 무리. items = [{lat, lon, c?:{r,g,b}|0xrrggbb}] */
      makePoints(items, { size = 6, lift = 0.0035, opacity = 0.95, color = 0xffffff } = {}) {
        const pos = new Float32Array(items.length * 3); const col = new Float32Array(items.length * 3);
        const tmp = new THREE.Color();
        items.forEach((p, i) => {
          const v = llToV3(p.lat, p.lon, this.surfR(p.lat, p.lon, p.lift ?? lift));
          pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
          if (p.c && typeof p.c === 'object') tmp.setRGB(p.c.r, p.c.g, p.c.b); else tmp.set(p.c ?? color);
          col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return new THREE.Points(g, new THREE.PointsMaterial({
          size, sizeAttenuation: false, vertexColors: true, map: getDotTex(), alphaTest: 0.05,
          transparent: true, opacity, depthWrite: false,
        }));
      },
      /** 이어진 선 하나. pts = [{lat, lon, h?}] (h = 지표 위 m). 대권 보간은 하지 않는다 — 원자료 점을 그대로 잇는다. */
      makeLine(pts, { color = 0xffffff, opacity = 0.9, lift = 0.004, width = 1 } = {}) {
        const pos = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => {
          const v = llToV3(p.lat, p.lon, this.surfR(p.lat, p.lon, lift) + (p.h || 0) / R_M);
          pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, linewidth: width }));
      },
      /** 여러 짧은 선분을 한 객체로. segs = [[{lat,lon,h?},{lat,lon,h?}], …] */
      makeSegments(segs, { color = 0xffffff, opacity = 0.7, lift = 0.004 } = {}) {
        const pos = new Float32Array(segs.length * 6);
        segs.forEach((s, i) => {
          const a = llToV3(s[0].lat, s[0].lon, this.surfR(s[0].lat, s[0].lon, lift) + (s[0].h || 0) / R_M);
          const b = llToV3(s[1].lat, s[1].lon, this.surfR(s[1].lat, s[1].lon, lift) + (s[1].h || 0) / R_M);
          pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      },
      /** 지표 위 원(반지름 km) — 철새 도착 범위 같은 것. */
      makeCircle(lat, lon, radiusKm, { color = 0xffffff, opacity = 0.5, lift = 0.004, n = 48 } = {}) {
        const pts = [];
        const dLat = radiusKm / 111.2;
        const dLon = radiusKm / (111.2 * Math.max(0.05, Math.cos(lat * D2R)));
        for (let i = 0; i <= n; i += 1) { const t = (i / n) * Math.PI * 2; pts.push({ lat: lat + dLat * Math.sin(t), lon: lon + dLon * Math.cos(t) }); }
        return this.makeLine(pts, { color, opacity, lift });
      },
      /** 글자 스프라이트 (travel.js 와 같은 모양). */
      makeLabel(text, color = '#cfe0ee', { scale = 0.026 } = {}) {
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
        spr.scale.set((c.width / c.height) * scale, scale, 1);
        spr.center.set(-0.12, 0.5);
        spr.userData.isLabel = true;
        return spr;
      },
      /** 라벨을 지표 위 한 점에 놓는다 */
      placeLabel(spr, lat, lon, lift = 0.007) { spr.position.copy(llToV3(lat, lon, this.surfR(lat, lon, lift))); return spr; },
      async fetchJson(url, { timeout = 15000, signal, cache } = {}) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), timeout);
        if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
        try {
          const r = await fetch(url, { signal: ctl.signal, cache: cache || 'default' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.json();
        } finally { clearTimeout(t); }
      },
      /** 1.0 의 Cesium 없는 자료 모듈을 그대로 빌려 쓴다 (같은 origin 의 /js/…). */
      v1: (path) => import(/* @vite-ignore */ `/js/${path}`),
      css: (href, id) => self.css(href, id),
      /** 활성 카드만 다시 그린다 (비동기 자료가 늦게 왔을 때) */
      refresh: () => self.refreshActive(),
      /** 지금 그려 둔 것을 지우고 build 를 다시 부른다 */
      rebuild: () => self.rebuild(),
    };
    return this._ctx;
  }

  css(href, id) {
    if (this._cssDone.has(id) || document.getElementById(id)) return;
    this._cssDone.add(id);
    const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  }

  // ---------------------------------------------------------------- 열고 닫기
  async module(key) {
    if (this.modules.has(key)) return this.modules.get(key);
    const path = MODULES[key];
    if (!path) throw new Error(`모듈 없음: ${key}`);
    const m = (await import(/* @vite-ignore */ `${path}?${EXT_VERSION}`)).default;
    this.modules.set(key, m);
    return m;
  }
  state(key) {
    if (!this.states.has(key)) this.states.set(key, { data: null, error: null, busy: false });
    return this.states.get(key);
  }

  /** 켜기/끄기 토글. 같은 키면 끈다. 다른 키면 이전 것을 끄고 연다. */
  async open(key) {
    const id = ++this.requestId;
    this.controller?.abort(); this.controller = new AbortController();
    if (this.active === key) { this.close(); return { on: false }; }
    if (this.active) this.close();
    let m;
    try { m = await this.module(key); }
    catch (e) { return { on: true, error: e }; }
    if (id !== this.requestId) return { stale: true };
    const st = this.state(key);
    st.error = null; st.busy = true;
    this.active = key;
    this.clear();
    try {
      await m.load?.(this.ctx, st, this.controller.signal);
      if (id !== this.requestId) return { stale: true };
      st.busy = false;
      if (m.build) { m.build(this.ctx, st); this.group.visible = true; }
      return { on: true, point: st.point || null };
    } catch (e) {
      if (id !== this.requestId) return { stale: true };
      st.busy = false; st.error = e;
      return { on: true, error: e };
    }
  }

  close() {
    const key = this.active;
    this.active = null;
    this.clear();
    this.group.visible = false;
    if (key) { const m = this.modules.get(key); try { m?.close?.(this.ctx, this.state(key)); } catch (_) { } }
  }

  clear() {
    for (let i = this.group.children.length - 1; i >= 0; i -= 1) {
      const o = this.group.children[i]; this.group.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map && o.material.map !== dotTex) o.material.map.dispose(); o.material.dispose(); }
    }
  }

  rebuild() {
    if (!this.active) return;
    const m = this.modules.get(this.active); const st = this.state(this.active);
    if (!m?.build || st.busy || st.error) return;
    this.clear(); m.build(this.ctx, st); this.group.visible = true;
  }

  // ---------------------------------------------------------------- 카드
  get title() { const m = this.modules.get(this.active); const t = typeof m?.title === 'function' ? m.title(this.state(this.active)) : m?.title; return t || this.active || ''; }
  get badge() {
    const st = this.active && this.state(this.active); const m = this.modules.get(this.active);
    if (!st) return 'UNAVAILABLE';
    if (st.error) return 'UNAVAILABLE';
    if (st.busy) return 'LOADING';
    return (typeof m?.badge === 'function' ? m.badge(st) : m?.badge) || 'OBSERVED';
  }
  loadingCard(name) {
    return `<p class="ext-loading">${esc(name || '')} — ${this.i18n.ko ? '자료를 받는 중…' : 'Loading…'}</p>`;
  }
  card() {
    if (!this.active) return '';
    const m = this.modules.get(this.active); const st = this.state(this.active);
    if (st.error) {
      return `<p class="ext-error">${this.i18n.ko ? '자료를 불러오지 못했습니다 — 값을 생성하지 않습니다.' : 'Could not load data — nothing is fabricated.'}<br/>${esc(st.error.message || st.error)}</p>`
        + `<button data-action="ext:__retry">${this.i18n.ko ? '다시 시도' : 'Retry'}</button>`;
    }
    try { return m.card(this.ctx, st); }
    catch (e) { console.warn('[ext] card', this.active, e); return `<p class="ext-error">${esc(e.message)}</p>`; }
  }
  afterRender() {
    if (!this.active) return;
    const m = this.modules.get(this.active); const st = this.state(this.active);
    const root = document.getElementById('intel-content');
    if (!root || !m?.afterRender) return;
    try { m.afterRender(this.ctx, st, root); } catch (e) { console.warn('[ext] afterRender', this.active, e); }
  }
  refreshActive() {
    if (!this.active) return;
    this._refresh(this.title, this.card(), this.badge);
    this.afterRender();
  }

  /** 카드 안 버튼. name 은 'ext:' 를 뗀 것. 모듈이 모르는 이름이면 null. */
  handleAction(action, ds, value) {
    if (typeof action !== 'string' || !action.startsWith('ext:')) return null;
    const name = action.slice(4);
    if (name === '__retry') { const key = this.active; this.active = null; return { reopen: key }; }
    if (name.startsWith('open/')) return { reopen: name.slice(5) };   // 다른 확장 화면으로 (허브 카드 등)
    if (!this.active) return { handled: true };
    const m = this.modules.get(this.active); const st = this.state(this.active);
    try {
      const r = m.action?.(this.ctx, st, name, ds || {}, value) || null;
      if (r?.rebuild) this.rebuild();
      return r || { handled: true };
    } catch (e) { console.warn('[ext] action', name, e); return { handled: true }; }
  }

  pick(lat, lon) {
    if (!this.active) return null;
    const m = this.modules.get(this.active); const st = this.state(this.active);
    if (!m?.pick || st.busy || st.error) return null;
    try { return m.pick(this.ctx, st, lat, lon) || null; } catch (e) { console.warn('[ext] pick', e); return null; }
  }

  update(camera, altKm) {
    if (!this.active) return;
    const ex = this.getExagger();
    if (this._lastEx !== null && ex !== this._lastEx) this.rebuild();
    this._lastEx = ex;
    // 지구 뒤쪽 라벨은 숨긴다
    const cam = camera.position.clone().normalize();
    this.group.children.forEach((o) => { if (o.userData.isLabel) o.visible = o.position.clone().normalize().dot(cam) > 0.3; });
    const m = this.modules.get(this.active);
    if (m?.update) { try { m.update(this.ctx, this.state(this.active), camera, altKm); } catch (_) { } }
  }
  onExaggerChanged() { this.rebuild(); }
}
