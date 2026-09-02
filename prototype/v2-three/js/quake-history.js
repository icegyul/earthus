// 지진 25년 — USGS 카탈로그를 시간순으로 쌓아 판 경계가 스스로 드러나게 한다.
// 참고한 그림: PTWC "All Earthquakes 2001–2015" (평면 지도). 우리는 3D 지구라
// 깊이를 색으로 보여주되 값도 그대로 들고 있는다.
//
// 출처: USGS Earthquake Hazards Program ComCat — 공공 도메인.
// 값 보존: 진앙·깊이·규모는 원값(정밀도만 낮춤). 없는 값은 채우지 않고 버렸다(헤더의 dropped).

import * as THREE from '../../vendor/three-r184.module.min.js';

const HEADER_URL = './quakes/quakes.json?v=2026a';
const BIN_URL = './quakes/quakes.bin?v=2026a';

// PTWC 깊이 팔레트 — 얕을수록 붉고 깊을수록 보라. 경계값은 원 그림과 같다.
const DEPTH_STOPS = [
  [0, 0xff3b30, '0'],
  [25, 0xff9500, '25'],
  [50, 0xffe000, '50'],
  [100, 0x4cd964, '100'],
  [200, 0x34c6e6, '200'],
  [400, 0x5b7bff, '400'],
  [800, 0xb45cff, '800'],
];

const inflate = async (bytes) => {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const VERT = `
uniform float uExagger;
uniform float uCursor;
uniform float uSize;
uniform float uPixelRatio;
uniform float uDepthMode;
attribute float aH;
attribute float aDay;
attribute float aMag;
attribute float aDepth;
varying vec3 vCol;
varying float vAge;
varying float vRing;

vec3 depthColor(float d) {
  vec3 c0 = vec3(1.000, 0.231, 0.188);
  vec3 c1 = vec3(1.000, 0.584, 0.000);
  vec3 c2 = vec3(1.000, 0.878, 0.000);
  vec3 c3 = vec3(0.298, 0.851, 0.392);
  vec3 c4 = vec3(0.204, 0.776, 0.902);
  vec3 c5 = vec3(0.357, 0.482, 1.000);
  vec3 c6 = vec3(0.706, 0.361, 1.000);
  if (d < 25.0) return mix(c0, c1, d / 25.0);
  if (d < 50.0) return mix(c1, c2, (d - 25.0) / 25.0);
  if (d < 100.0) return mix(c2, c3, (d - 50.0) / 50.0);
  if (d < 200.0) return mix(c3, c4, (d - 100.0) / 100.0);
  if (d < 400.0) return mix(c4, c5, (d - 200.0) / 200.0);
  return mix(c5, c6, clamp((d - 400.0) / 400.0, 0.0, 1.0));
}

void main() {
  float age = uCursor - aDay;
  if (age < 0.0) {            // 아직 일어나지 않은 지진은 그리지 않는다
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec3 dir = normalize(position);
  // 표면 모드: 지형 위에 얹는다. 깊이 모드: 진원의 실제 깊이에 박는다(축척 그대로, 700km = 반경의 11%).
  float rSurf = 1.0 + max(aH, 0.0) / 6371000.0 * uExagger + 0.0016;
  float rDeep = 1.0 - aDepth / 6371.0;
  float r = mix(rSurf, rDeep, uDepthMode);
  vec3 wp = dir * r;
  // 깊이 모드는 지구를 뚫고 그리므로(깊이검사 끔) 반대편 반구를 직접 잘라낸다.
  if (uDepthMode > 0.5 && dot(dir, normalize(cameraPosition - wp)) < 0.02) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vAge = age;
  vCol = depthColor(aDepth);
  vRing = step(6.0, aMag);
  float flash = exp(-age / 14.0);                  // 막 일어난 지진은 크게 번쩍인다
  float base = pow(10.0, (aMag - 4.5) * 0.26);     // 규모는 로그 — 원 그림의 원 크기 규칙
  // 원근에 따라 커지되 위아래로 묶는다. 묶지 않으면 전지구에서 경계가 흰 덩어리로 뭉갠다.
  float px = uSize * uPixelRatio * base * (1.0 + flash * 2.2) / max(0.05, -mv.z);
  gl_PointSize = clamp(px, 1.0, 26.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
precision highp float;
uniform float uFade;
varying vec3 vCol;
varying float vAge;
varying float vRing;

void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float a;
  if (vRing > 0.5) {
    a = smoothstep(1.0, 0.80, d) * smoothstep(0.30, 0.62, d) + smoothstep(0.30, 0.0, d) * 0.55;
  } else {
    a = smoothstep(1.0, 0.10, d);
  }
  if (a <= 0.003) discard;
  float flash = exp(-vAge / 14.0);
  float settle = mix(1.0, uFade, clamp(vAge / 1400.0, 0.0, 1.0));
  vec3 col = mix(vCol, vec3(1.0), flash * 0.55);
  gl_FragColor = vec4(col, a * settle * (0.62 + flash * 0.38));
  #include <colorspace_fragment>
}
`;

export class QuakeHistory {
  constructor(scene, getExagger, getHeightCanvas) {
    this.scene = scene;
    this.getExagger = getExagger;
    this.getHeightCanvas = getHeightCanvas;
    this.on = false;
    this.depthMode = false;
    this.playing = true;
    this.speed = 150;          // 하루/초 — 25년을 약 1분에
    this.cursor = 0;
    this.doc = null;
    this.points = null;
    this.error = null;
    this.loading = false;
    this.dom = document.createElement('div');
    this.dom.id = 'quake-ui';
    this.dom.innerHTML = '<div id="quake-cap"></div>';
    document.body.appendChild(this.dom);
    this.capEl = this.dom.querySelector('#quake-cap');
    // 막대를 누르면 그 시점으로, 날짜를 누르면 멈춤/재생 — 자막 자체가 조작기다
    this.capEl.addEventListener('click', (e) => {
      const bar = e.target.closest('.qk-bar');
      if (bar) {
        const r = bar.getBoundingClientRect();
        this.seekFraction((e.clientX - r.left) / Math.max(1, r.width));
        this.playing = false;
        return;
      }
      if (e.target.closest('.qk-date')) this.playing = !this.playing;
    });
  }

  async load() {
    if (this.doc) return this.doc;
    this.loading = true;
    this.error = null;
    try {
      const [hRes, bRes] = await Promise.all([
        fetch(HEADER_URL, { cache: 'force-cache' }),
        fetch(BIN_URL, { cache: 'force-cache' }),
      ]);
      if (!hRes.ok || !bRes.ok) throw new Error('지진 카탈로그를 불러오지 못했습니다');
      const head = await hRes.json();
      const raw = await inflate(new Uint8Array(await bRes.arrayBuffer()));
      const n = head.count;
      const need = n * 9;
      if (raw.length < need) throw new Error(`카탈로그가 깨졌습니다 (${raw.length}/${need})`);
      const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const lon = new Float32Array(n);
      const lat = new Float32Array(n);
      const dep = new Float32Array(n);
      const mag = new Float32Array(n);
      const day = new Float32Array(n);
      let o = 0;
      for (let i = 0; i < n; i += 1, o += 2) lon[i] = dv.getInt16(o, true) / 181;
      for (let i = 0; i < n; i += 1, o += 2) lat[i] = dv.getInt16(o, true) / 362;
      for (let i = 0; i < n; i += 1, o += 2) dep[i] = dv.getUint16(o, true) / 10;
      for (let i = 0; i < n; i += 1, o += 1) mag[i] = raw[o] / 20 + 4.0;
      for (let i = 0; i < n; i += 1, o += 2) day[i] = dv.getUint16(o, true);
      this.doc = { head, n, lon, lat, dep, mag, day };
      this.cursor = 0;
      return this.doc;
    } catch (e) {
      this.error = String((e && e.message) || e);
      return null;
    } finally {
      this.loading = false;
    }
  }

  // 지형 고도는 캔버스를 한 번만 통째로 읽어 표본한다.
  // 점마다 getImageData를 부르면 18만 번 왕복이라 브라우저가 멈춘다.
  sampleHeights(lat, lon, n) {
    const out = new Float32Array(n);
    const canvas = this.getHeightCanvas && this.getHeightCanvas();
    if (!canvas) return out;
    let img;
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (e) {
      return out;                       // 고도를 못 읽으면 해수면에 둔다(값을 지어내지 않음)
    }
    const W = img.width;
    const H = img.height;
    const px = img.data;
    for (let i = 0; i < n; i += 1) {
      const u = ((((lon[i] + 180) / 360) % 1) + 1) % 1;
      const latC = (Math.max(-85, Math.min(85, lat[i])) * Math.PI) / 180;
      const v = 0.5 - Math.log(Math.tan(Math.PI / 4 + latC / 2)) / (2 * Math.PI);
      const x = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
      const y = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
      const p = (y * W + x) * 4;
      out[i] = px[p] * 256 + px[p + 1] + px[p + 2] / 256 - 32768;
    }
    return out;
  }

  build() {
    if (this.points) return;
    const d = this.doc;
    if (!d) return;
    const { n, lat, lon, dep, mag, day } = d;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      const phi = (90 - lat[i]) * (Math.PI / 180);
      const th = (lon[i] + 180) * (Math.PI / 180);
      pos[i * 3] = -Math.sin(phi) * Math.cos(th);
      pos[i * 3 + 1] = Math.cos(phi);
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(th);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aH', new THREE.BufferAttribute(this.sampleHeights(lat, lon, n), 1));
    geo.setAttribute('aDay', new THREE.BufferAttribute(day, 1));
    geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uExagger: { value: this.getExagger ? this.getExagger() : 1 },
        uCursor: { value: 0 },
        uSize: { value: 4.2 },
        uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
        uFade: { value: 0.72 },
        uDepthMode: { value: this.depthMode ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: !this.depthMode,
      // 가산 합성은 경계에서 흰 덩어리가 되어 깊이 색을 지운다 — 깊이가 이 그림의 요점이라 일반 합성.
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.visible = this.on;
    this.scene.add(this.points);
  }

  async toggle() {
    this.on = !this.on;
    if (!this.on) {
      if (this.points) this.points.visible = false;
      if (this.capEl) this.capEl.classList.remove('show');
      return { on: false };
    }
    await this.load();
    if (!this.doc) { this.on = false; return { on: false, error: this.error }; }
    this.build();
    this.points.visible = true;
    this.cursor = 0;
    this.playing = true;
    this.renderCaption();
    return { on: true };
  }

  // 깊이 모드 — 진원을 지구 속 제자리에 두고 앞쪽 반구만 그린다. 섭입대가 대륙 밑으로
  // 파고드는 모습은 평면 지도로는 못 보여준다.
  async setDepthMode(v) {
    this.depthMode = !!v;
    if (!this.on) {
      const st = await this.toggle();
      if (!st.on) return st;
    }
    if (this.mat) {
      this.mat.uniforms.uDepthMode.value = this.depthMode ? 1 : 0;
      this.mat.depthTest = !this.depthMode;   // 지구를 뚫고 봐야 하니 깊이검사를 끈다
      this.mat.needsUpdate = true;
    }
    this.renderCaption();
    return { on: this.on, depth: this.depthMode };
  }

  dateAt(dayN) {
    const d = this.doc;
    if (!d) return '';
    const base = new Date(`${d.head.epoch}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + Math.round(dayN));
    return base.toISOString().slice(0, 10).replace(/-/g, '.');
  }

  // 현재 커서까지 쌓인 지진 수 — day 배열이 시간순이라 이분 탐색으로 센다
  countUpTo(dayN) {
    const d = this.doc;
    if (!d) return 0;
    let lo = 0;
    let hi = d.n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (d.day[mid] <= dayN) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  tick(dt) {
    if (!this.on || !this.doc || !this.points) return;
    if (this.mat) {
      this.mat.uniforms.uExagger.value = this.getExagger ? this.getExagger() : 1;
      this.mat.uniforms.uCursor.value = this.cursor;
    }
    if (!this.playing) return;
    this.cursor += this.speed * dt;
    if (this.cursor > this.doc.head.days + 200) this.cursor = 0;   // 다 쌓이면 처음부터
    if (this.capEl && this.capEl.classList.contains('show')) this.renderCaption();
  }

  setPlaying(v) { this.playing = !!v; }

  seekFraction(f) {
    if (!this.doc) return;
    this.cursor = Math.max(0, Math.min(1, f)) * this.doc.head.days;
    this.renderCaption();
  }

  legendHtml() {
    const sw = DEPTH_STOPS.map(([, c]) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`).join('');
    const ticks = DEPTH_STOPS.map(([km]) => `<u>${km}</u>`).join('');
    return `<span class="qk-legend">${sw}<em>${ticks}<b>깊이 km</b></em></span>`;
  }

  renderCaption() {
    if (!this.capEl || !this.doc) return;
    const shown = this.countUpTo(this.cursor);
    const pct = Math.max(0, Math.min(1, this.cursor / this.doc.head.days));
    this.capEl.innerHTML = `<b>지진 ${this.doc.head.epoch.slice(0, 4)} → 오늘</b>`
      + `<span class="qk-date">${this.dateAt(this.cursor)}${this.playing ? '' : ' <i>멈춤</i>'}</span>`
      + `<span class="qk-count">${shown.toLocaleString('ko-KR')} / ${this.doc.n.toLocaleString('ko-KR')}건 · M${this.doc.head.minMagnitude} 이상</span>`
      + `<span class="qk-bar"><i style="width:${(pct * 100).toFixed(2)}%"></i></span>`
      + this.legendHtml()
      + `<span class="qk-src">USGS ComCat · 공공 도메인 · ${this.depthMode
        ? '진원을 실제 깊이에 둔 <b>깊이 모드</b> — 앞쪽 반구만 그립니다'
        : '규모가 클수록 크게, 깊을수록 보라'}</span>`;
    this.capEl.classList.add('show');
  }

  state() {
    if (!this.on) return { on: false };
    if (this.loading) return { on: true, note: '25년치 카탈로그를 여는 중…' };
    if (this.error) return { on: true, note: this.error };
    return { on: true, note: `${this.dateAt(this.cursor)} · ${this.countUpTo(this.cursor).toLocaleString('ko-KR')}건` };
  }

  // 지질학자가 그린 판 경계선 — 지진이 그린 경계와 같은 자리인지 눈으로 대조하라고 겹친다.
  async togglePlates() {
    if (this.plates) {
      this.platesOn = !this.platesOn;
      this.plates.visible = this.platesOn;
      return { on: this.platesOn };
    }
    try {
      const res = await fetch('./quakes/plates.json?v=2026a', { cache: 'force-cache' });
      if (!res.ok) throw new Error('판 경계선을 불러오지 못했습니다');
      const doc = await res.json();
      this.plateDoc = doc;
      const pos = [];
      for (const flat of doc.coords) {
        for (let i = 0; i + 3 < flat.length; i += 2) {
          for (const [lon, lat] of [[flat[i], flat[i + 1]], [flat[i + 2], flat[i + 3]]]) {
            const phi = (90 - lat) * (Math.PI / 180);
            const th = (lon + 180) * (Math.PI / 180);
            const r = 1.0022;
            pos.push(-Math.sin(phi) * Math.cos(th) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(th) * r);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x6ff2ff, transparent: true, opacity: 0.42, depthWrite: false,
      });
      this.plates = new THREE.LineSegments(geo, mat);
      this.plates.frustumCulled = false;
      this.plates.renderOrder = 5;
      this.platesOn = true;
      this.scene.add(this.plates);
      return { on: true };
    } catch (e) {
      return { on: false, error: String((e && e.message) || e) };
    }
  }

  platesCardHtml() {
    const d = this.plateDoc;
    if (!d) return '판 경계선을 준비하는 중입니다.';
    return `<b>판 경계선</b> — 지진이 그린 경계와 <b>지질학자가 그린 경계</b>를 겹쳐 봅니다.<br/>`
      + `선 ${d.lines.toLocaleString('ko-KR')}개 · 점 ${d.points.toLocaleString('ko-KR')}개 · 좌표는 소수 둘째 자리(≈1km)까지만 줄였습니다.<br/>`
      + `이 선은 지진에서 뽑아낸 것이 아니라 <b>독립된 지질 자료</b>입니다 — 그래서 겹쳐 보는 의미가 있습니다.<br/>`
      + `출처 ${d.source} · ${d.credit} · ${d.license}`;
  }

  cardHtml() {
    const d = this.doc;
    if (!d) return this.error || '지진 카탈로그를 준비하는 중입니다.';
    const h = d.head;
    return `<b>지진 ${h.epoch.slice(0, 4)} → 오늘</b> — 시간순으로 쌓으면 <b>판 경계</b>가 저절로 드러납니다.<br/>`
      + `<b>${d.n.toLocaleString('ko-KR')}건</b> (M${h.minMagnitude} 이상) · 가장 큰 지진 <b>M${h.maxMagnitude}</b> · 가장 깊은 진원 <b>${h.maxDepthKm.toLocaleString('ko-KR')}km</b><br/>`
      + `얕을수록 붉고 깊을수록 보라 — 깊은 지진이 줄지어 대륙 아래로 들어가는 곳이 <b>섭입대</b>입니다.<br/>`
      + `${h.dropped ? `좌표·깊이·규모가 빠진 ${h.dropped.toLocaleString('ko-KR')}건은 지어내지 않고 뺐습니다.<br/>` : ''}`
      + `출처 ${h.source} · ${h.license} · 받은 날 ${h.retrieved.slice(0, 10)}`;
  }
}
