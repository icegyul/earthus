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
export const MODULES = {
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

/* ⚠️⚠️ v2 에서 내린 화면 (2026-09-21) ───────────────────────────────────────────────
   무엇이 잘못돼 있었나: 이 세 화면은 아래 ctx.v1() 로 빌려 온 1.0 자료 모듈을 통해
   **브라우저가 곧바로** Open-Meteo 를 불렀다. v2 소스만 훑는 검사(tools/earthus-v53/
   point-readout.test.mjs)는 v2-three/js/*.js 만 보므로 이 길을 못 봤고, 그래서
   "브라우저 직호출은 route.js 하나뿐" 이라는 기록이 사실과 달랐다.
     hobby/para    → /js/para.js    para.now()     API.WEATHER_POINT 가 비어 있어 기본값인
                                                   api.open-meteo.com/v1/forecast 로 나갔다
     hobby/surf    → /js/beaches.js beaches.sea()  API.MARINE = marine-api.open-meteo.com
     hobby/fishing → /js/fishing.js fishing.sea()  같은 주소
   v2 는 유료 서비스이고 Open-Meteo 무료 API 는 비상업 조건이다. 게다가 등급 문이 없어
   (main.js 는 sid==='hobby' 면 곧장 open) 누구나 닿았다.

   왜 우리 자료로 갈아 끼우지 않고 내렸나 — **화면의 머리값을 우리 자료로 못 만든다**:
     · 물때(만조·간조 시각·조차)   events/coast-kr.json 은 조위관측소마다 '지금 조위(tideCm)'
                                   한 값만 준다 — 만조·간조 시각 칸이 아예 없다.
                                   낚시 화면의 이름이 물때인데 그 값이 없다.
                                   ⚠️ 2026-09-21 고침: 여기와 아래 카드가 근거로 대던 `ocean/coast.json`
                                   은 **없는 파일**이었다(공개 GET 2026-09-21 02:36 KST: ocean/coast.json
                                   → 403 · events/coast-kr.json → 200). 수집기 aws/khoa-coast/handler.py
                                   의 DST 가 정본이다. 없는 파일을 근거로 대면 카드 전체를 믿을 수 없게 된다.
                                   같은 시각 실측: 그 문서는 조위관측소 45곳을 훑어 **0곳**이 응답했고
                                   이안류도 0곳이었다. 지점 수는 날마다 바뀌므로 카드에는 적지 않는다 —
                                   카드가 말하는 것은 바뀌지 않는 사실(만조·간조 칸이 없다)뿐이다.
     · 너울 방향 · 풍파 높이·주기   ocean/marine*.json 에 그 칸이 없다 —
                                   point-readout.js 도 같은 이유로 그 줄을 뺐다.
     · 저층 운량 · 시정 · CAPE      clouds/gfs-fc 프레임에 그 필드가 없다(매니페스트 fields).
   없는 값을 근사치로 채우지 않는다. 낼 수 있는 값만 남겨 반쪽으로 세우는 길도 여기서는 못 간다 —
   출처 문장('Open-Meteo')이 ext/hobby-*.js 와 ui-shell.js 에 박혀 있어 자료만 바꾸면
   **화면이 제가 한 일과 다른 말을 한다.** 그 두 파일은 이 작업의 담당이 아니다.

   되살리려면: 그 화면의 출처 문장을 함께 고친 뒤 여기서 키를 빼고 V1_DENY 도 푼다.
   ⚠️ 여기서 키를 빼도 ui-shell.js 의 SCENES 행은 그대로다 — 메뉴는 계속 보인다. */
export const WITHDRAWN = Object.freeze({
  'hobby/surf': Object.freeze({
    v1: 'beaches.js', call: 'beaches.sea()', host: 'marine-api.open-meteo.com',
    ko: Object.freeze({
      title: '서핑 — 내린 화면',
      cant: '너울 방향 · 풍파 높이·주기 · 만조·간조 시각',
      why: '우리 해양 격자(ocean/marine*.json)에 그 칸이 없습니다.',
      /* ⚠️ 여기에 "몇 km 안 부이" 라고 적지 않는다. 그 거리는 point-readout.js 의 BUOY_KM 이고
         이 파일과 따로 움직인다 — 한쪽만 바뀌면 카드가 거짓말을 한다(실제로 120 이라 적었다가
         잡았다: 그건 내린 hobby-sea-common.js 쪽 값이고 지금 길은 100 이다). */
      instead: '지구의 바다를 누르면 우리 해양 격자와 가까운 부이 실측을 함께 읽어 줍니다 — 파고·너울·주기·수온·해류.',
    }),
    en: Object.freeze({
      title: 'Surf — withdrawn',
      cant: 'swell direction, wind-wave height/period, high/low tide times',
      why: 'Our ocean grid (ocean/marine*.json) does not carry those columns.',
      instead: 'Tap the sea on the globe: we read our ocean grid together with the nearest buoy observation.',
    }),
  }),
  'hobby/fishing': Object.freeze({
    v1: 'fishing.js', call: 'fishing.sea()', host: 'marine-api.open-meteo.com',
    ko: Object.freeze({
      title: '낚시 — 내린 화면',
      cant: '물때(만조·간조 시각·조차) · 풍파 높이 · 너울 방향',
      why: '국립해양조사원 조위관측소 자료(events/coast-kr.json)는 관측소마다 지금 조위 한 값만 주고, 만조·간조 시각 칸이 아예 없습니다.',
      instead: '지구의 바다를 누르면 파고·너울·수온·해류를 우리 격자와 부이 실측으로 읽어 줍니다. 물때는 아직 어디에도 없습니다.',
    }),
    en: Object.freeze({
      title: 'Fishing — withdrawn',
      cant: 'tide table (high/low times, range), wind-wave height, swell direction',
      why: 'KHOA tide-gauge data (events/coast-kr.json) carries one current level per gauge — it has no column for predicted high and low tide times.',
      instead: 'Tap the sea for waves, swell, SST and current. We still have no tide table anywhere.',
    }),
  }),
  'hobby/para': Object.freeze({
    v1: 'para.js', call: 'para.now()', host: 'api.open-meteo.com',
    ko: Object.freeze({
      title: '패러글라이딩 — 내린 화면',
      cant: '저층 운량 · 시정 · CAPE',
      why: 'clouds/gfs-fc 프레임에 그 필드가 없습니다. 바람·돌풍·기온·이슬점은 기상청 AWS 실측(wind/kma-aws-min.json)으로 옮길 수 있지만, 활공장 26곳은 산 정상이라 몇 km 떨어진 평지 관측소 값을 이륙장 바람이라고 말할 수 없습니다.',
      instead: '대신 볼 것을 만들어 두지 않았습니다 — 없는 것을 있는 척하지 않기 위해 비워 둡니다.',
    }),
    en: Object.freeze({
      title: 'Paragliding — withdrawn',
      cant: 'low-cloud cover, visibility, CAPE',
      why: 'Those fields are not in our clouds/gfs-fc frames. Wind, gust, temperature and dew point could come from KMA AWS observations, but the 26 sites are mountain summits — a lowland station kilometres away is not launch-site wind.',
      instead: 'Nothing was put in its place: we would rather show nothing than something we cannot stand behind.',
    }),
  }),
});

/* ctx.v1 의 세관. 브라우저에서 Open-Meteo 를 부르는 1.0 모듈은 v2 런타임에 **못 들어온다**.
   ⚠️ 위 WITHDRAWN 하나로는 못 막는다 — 다른 ext 모듈이 같은 모듈을 빌리면 그 길로 또 나간다.
      그래서 문을 하나 더 세운다(값 = 위 표의 키, 이유 문장은 그 표에서 만든다).
   ⚠️ config.js 는 여기 없다 — 그 파일은 주소를 **적어 둔 표**일 뿐 부르지 않는다.
      lab/today·hobby/vessel 이 API.EVENTS·API.OCEAN 을 그 표에서 읽으므로 막으면 안 된다. */
export const V1_DENY = Object.freeze(Object.fromEntries(
  Object.entries(WITHDRAWN).map(([key, w]) => [w.v1, { key, call: w.call, host: w.host }]),
));

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
      /** 1.0 의 Cesium 없는 자료 모듈을 그대로 빌려 쓴다 (같은 origin 의 /js/…).
       *  ⚠️ 세관이다. V1_DENY 에 적힌 모듈은 브라우저에서 Open-Meteo 를 부르므로 들이지 않는다 —
       *     들이는 순간 그 호출자가 유료 화면의 런타임에 들어온다. 이유를 적고 거절한다. */
      v1: (path) => {
        const deny = V1_DENY[path];
        if (!deny) return import(/* @vite-ignore */ `/js/${path}`);
        return Promise.reject(new Error(self.i18n.ko
          ? `/js/${path} 는 v2 에 들이지 않습니다 — ${deny.call} 이 브라우저에서 ${deny.host} 를 직접 부릅니다 (${deny.key} 를 내린 이유와 같습니다).`
          : `/js/${path} is not loaded in v2 — ${deny.call} calls ${deny.host} straight from the browser (same reason ${deny.key} was withdrawn).`));
      },
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
    /* 내린 화면 — 모듈을 **받지 않는다**. 동적 import 가 한 번이라도 돌면 그 순간 1.0 모듈이
       v2 런타임에 들어오고, 안에 든 Open-Meteo 호출자도 같이 들어온다. 그래서 문 앞에서 세운다. */
    if (WITHDRAWN[key]) {
      const st = this.state(key);
      st.busy = false; st.data = null; st.point = null;
      st.error = { withdrawn: key, message: this.withdrawnText(key).title };
      this.active = key;
      this.clear(); this.group.visible = false;
      return { on: true };
    }
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
  /** 내린 화면의 문장 — 지금 언어로. (WITHDRAWN 에 없는 키면 null) */
  withdrawnText(key) {
    const w = WITHDRAWN[key];
    return w ? (this.i18n.ko ? w.ko : w.en) : null;
  }

  /** 내린 화면의 카드. ⚠️ '다시 시도' 단추를 붙이지 않는다 — 다시 눌러도 같은 이유로 안 열린다. */
  withdrawnCard(key) {
    const w = WITHDRAWN[key]; const t = this.withdrawnText(key);
    if (!t) return '';
    const ko = this.i18n.ko;
    return `<p class="ext-error"><b>${esc(t.title)}</b></p>`
      + `<p class="mt-danger">${ko
        ? `<b>왜 내렸나</b> · 이 화면은 값을 받을 때 브라우저가 <b>${esc(w.host)}</b> 를 직접 불렀습니다`
          + ` (1.0 모듈 <b>${esc(w.v1)}</b> 의 ${esc(w.call)}). EARTHUS v2 는 유료 서비스이고,`
          + ` Open-Meteo 무료 API 는 <b>비상업 이용</b> 조건입니다.`
        : `<b>Why it is gone</b> · This screen fetched its numbers by calling <b>${esc(w.host)}</b>`
          + ` directly from the browser (${esc(w.call)} in <b>${esc(w.v1)}</b>). EARTHUS v2 is a paid`
          + ` service and the free Open-Meteo API is <b>for non-commercial use</b>.`}</p>`
      + `<div class="mt-foot">`
      + `<p><b>${ko ? '우리 자료로는 못 내는 값' : 'Values our own data cannot produce'}</b> · ${esc(t.cant)}`
      + `<br><small>${esc(t.why)}</small>`
      + `<br><small>${ko
        ? '낼 수 있는 값만 남겨 반쪽으로 세우지 않았고, 없는 값을 근사치로 채우지도 않았습니다.'
        : 'We did not keep a half-screen of the values that survive, and we did not fill the rest with estimates.'}</small></p>`
      + `<p><b>${ko ? '대신' : 'Instead'}</b> · ${esc(t.instead)}</p>`
      + `<p><small>${ko
        ? '무료 EARTHUS(v1)에도 이 화면은 지금 없습니다 — 2026-09-06 메뉴 정리 때 함께 숨겼습니다.'
        : 'The free EARTHUS (v1) does not have this screen either — it was hidden in the 2026-09-06 menu cleanup.'}</small></p>`
      + `</div>`;
  }

  get title() {
    const m = this.modules.get(this.active);
    const t = typeof m?.title === 'function' ? m.title(this.state(this.active)) : m?.title;
    return t || this.withdrawnText(this.active)?.title || this.active || '';
  }
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
    if (st.error?.withdrawn) return this.withdrawnCard(st.error.withdrawn);
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
    if (WITHDRAWN[this.active]) return { handled: true };   // 내린 화면에는 모듈이 없다
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
