// AETHERUS — 오늘의 태양계 (v2-three 이식)
// 행성 위치는 NASA/JPL 근사 궤도요소(kepler.js)를 이 기기에서 계산한 값이다.
// 화면 반지름·행성 크기는 로그 압축한 표현값이며(실척 아님), 실제 거리(AU)·반지름(km)은
// 카드에 원값으로 표기한다. 텍스처는 표면 재질일 뿐 위치·크기를 만들지 않는다.

import * as THREE from '../../vendor/three-r184.module.min.js';
import { planetPositions, planetOrbit } from './kepler.js';

// 평균 반지름: JPL SSD phys_par (1.0 solarscene.js와 동일 출처)
const PLANETS = [
  { id: 'mercury', ko: '수성', color: 0xa9a5a0, radiusKm: 2439.4, periodD: 88.0, tex: 'mercury.webp' },
  { id: 'venus', ko: '금성', color: 0xdfb96d, radiusKm: 6051.8, periodD: 224.7, tex: 'venus.webp' },
  { id: 'earth', ko: '지구', color: 0x58a6df, radiusKm: 6371.0, periodD: 365.2, tex: 'earth.webp' },
  { id: 'mars', ko: '화성', color: 0xca6548, radiusKm: 3389.5, periodD: 687.0, tex: 'mars.webp' },
  { id: 'jupiter', ko: '목성', color: 0xd2a478, radiusKm: 69911, periodD: 4331, tex: 'jupiter.webp' },
  { id: 'saturn', ko: '토성', color: 0xd9c58d, radiusKm: 58232, periodD: 10747, tex: 'saturn.webp' },
  { id: 'uranus', ko: '천왕성', color: 0x82d4d8, radiusKm: 25362, periodD: 30589, tex: 'uranus.webp' },
  { id: 'neptune', ko: '해왕성', color: 0x557ad9, radiusKm: 24622, periodD: 59800, tex: 'neptune.webp' },
];
const TEX_ROOT = './assets/planets/';

// 표현 반지름: 실제 AU를 로그 압축 (1.0 cosmic3d와 같은 규약 — 내행성이 뭉치지 않게)
const dispR = (au) => 3.5 + 7 * Math.log1p(au * 1.4);
// 표현 구체 크기: 실제 반지름을 로그 압축 (목성이 화면을 삼키지 않게)
const dispSize = (km) => 0.16 + 0.30 * Math.log10(km / 2000);
// 표현 반지름의 바깥 끝 — 해왕성 궤도(≈30.1AU)의 dispR ≈ 29.9 에 약간의 여유
const R_OUTER = 30.5;

const fmt = (n, d = 2) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d });

export class SolarView {
  constructor(hud) {
    this.hud = hud;
    this.active = false;
    this.dom = null;
    this.dayOffset = 0;
    this.yaw = 0.7;
    this.pitch = 0.62;
    this.dist = 46;      // open() 에서 화면 비율에 맞춰 다시 잡는다 (fitDist)
    this.userZoom = false; // 사람이 휠로 줌한 뒤에는 리사이즈가 그 거리를 건드리지 않는다
    this.selected = 'earth';
    this.raf = 0;
  }

  ensure() {
    if (this.dom) return;
    const dom = document.createElement('div');
    dom.id = 'solarview';
    dom.innerHTML = `
      <canvas id="sv-canvas"></canvas>
      <button id="sv-exit">◀ 지구로</button>
      <div id="sv-crumb">AETHERUS <i>›</i> <b>오늘의 태양계</b></div>
      <div id="sv-title"><b>SOLAR&nbsp;&nbsp;SYSTEM</b><span id="sv-date">—</span></div>
      <div id="sv-card"></div>
      <div id="sv-bar">
        <button id="sv-today">오늘</button>
        <label>날짜 <input type="range" id="sv-day" min="-365" max="365" step="1" value="0" /><b id="sv-day-v">+0일</b></label>
        <span id="sv-src">위치: NASA/JPL 근사 궤도요소 · 기기 계산</span>
      </div>`;
    document.body.appendChild(dom);
    this.dom = dom;
    this.canvas = dom.querySelector('#sv-canvas');
    this.cardEl = dom.querySelector('#sv-card');
    this.dateEl = dom.querySelector('#sv-date');

    dom.querySelector('#sv-exit').addEventListener('click', () => this.close());
    const dayEl = dom.querySelector('#sv-day');
    const dayV = dom.querySelector('#sv-day-v');
    dayEl.addEventListener('input', () => {
      this.dayOffset = parseInt(dayEl.value, 10);
      dayV.textContent = `${this.dayOffset >= 0 ? '+' : ''}${this.dayOffset}일`;
      this.layout();
    });
    dom.querySelector('#sv-today').addEventListener('click', () => {
      this.dayOffset = 0;
      dayEl.value = 0;
      dayV.textContent = '+0일';
      this.layout();
    });
    window.addEventListener('keydown', (e) => {
      if (this.active && e.key === 'Escape') { e.stopPropagation(); this.close(); }
    }, true);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03060c);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.05, 4000);
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.5));
    this.sunLight = new THREE.PointLight(0xfff2d8, 900, 0, 2);
    this.scene.add(this.sunLight);
    this.scene.add(this.makeStars());

    const loader = new THREE.TextureLoader();
    // 태양 (발광 — 광원 자체라 재질은 Basic)
    const sunTex = loader.load(`${TEX_ROOT}sun.webp`);
    sunTex.colorSpace = THREE.SRGBColorSpace;
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 48, 32),
      new THREE.MeshBasicMaterial({ map: sunTex, color: 0xffffff }),
    );
    this.scene.add(this.sun);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb857, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(glow);

    this.bodies = {};
    for (const p of PLANETS) {
      const tex = loader.load(TEX_ROOT + p.tex);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(dispSize(p.radiusKm), 40, 28),
        new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.92, metalness: 0 }),
      );
      this.scene.add(mesh);
      const orbit = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.26 }),
      );
      this.scene.add(orbit);
      this.bodies[p.id] = { mesh, orbit, def: p };
    }

    // 라벨 (DOM 오버레이)
    this.labelWrap = document.createElement('div');
    this.labelWrap.id = 'sv-labels';
    dom.appendChild(this.labelWrap);
    for (const p of PLANETS) {
      const el = document.createElement('button');
      el.className = 'sv-label';
      el.textContent = p.ko;
      el.addEventListener('click', () => { this.selected = p.id; this.renderCard(); });
      this.labelWrap.appendChild(el);
      this.bodies[p.id].label = el;
    }

    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('#sv-bar') || e.target.closest('#sv-card')) return;
      drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.005;
      this.pitch = Math.max(0.05, Math.min(1.5, this.pitch + (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', () => { drag = null; });
    dom.addEventListener('pointercancel', () => { drag = null; });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.userZoom = true;
      // 상한을 90으로 못박아 두면 세로로 긴 화면에서는 8행성을 담는 거리조차 못 간다
      this.dist = Math.max(6, Math.min(this.fitDist() * 2.4, this.dist * Math.exp(e.deltaY * 0.001)));
    }, { passive: false });
    window.addEventListener('resize', () => { if (this.active) this.resize(); });
  }

  makeStars() {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 900 + Math.random() * 600;
      pos[i * 3] = Math.cos(a) * s * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = Math.sin(a) * s * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaac4e4, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75 }));
  }

  // 황도 좌표(x,y,z AU) → 화면 좌표: z(황도북)를 Three.js y로 올리고 반지름만 로그 압축
  toScene(v) {
    const au = Math.hypot(v.x, v.y, v.z) || 1e-9;
    const k = dispR(au) / au;
    return new THREE.Vector3(v.x * k, v.z * k, v.y * k);
  }

  layout() {
    const date = new Date(Date.now() + this.dayOffset * 86400000);
    this.date = date;
    let pos;
    try {
      pos = planetPositions(date);
    } catch (e) {
      // JPL Table 1은 1800~2050 범위 — 벗어나면 계산하지 않는다 (값 생성 금지)
      this.dateEl.textContent = '이 날짜는 근사식 적용 범위(1800~2050) 밖입니다';
      return;
    }
    this.pos = pos;
    for (const p of PLANETS) {
      const b = this.bodies[p.id];
      const v = pos[p.id];
      if (!v) continue;
      b.mesh.position.copy(this.toScene(v));
      b.au = Math.hypot(v.x, v.y, v.z);
      try {
        const orb = planetOrbit(p.id, date, 200);
        const pts = orb.map((o) => this.toScene(o));
        pts.push(pts[0].clone());
        b.orbit.geometry.dispose();
        b.orbit.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      } catch (_) { /* 궤도 실패해도 위치는 유지 */ }
    }
    const kst = new Date(date.getTime() + 9 * 3600000);
    this.dateEl.textContent = `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}. ${String(kst.getUTCHours()).padStart(2, '0')}시 KST 기준`
      + (this.dayOffset ? ` (오늘 ${this.dayOffset > 0 ? '+' : ''}${this.dayOffset}일)` : '');
    this.renderCard();
  }

  renderCard() {
    const b = this.bodies[this.selected];
    if (!b) return;
    const p = b.def;
    const earthAu = this.bodies.earth ? this.bodies.earth.au : null;
    let sep = null;
    if (this.pos && this.selected !== 'earth' && this.pos.earth && this.pos[this.selected]) {
      const a = this.pos[this.selected];
      const e = this.pos.earth;
      sep = Math.hypot(a.x - e.x, a.y - e.y, a.z - e.z);
    }
    const lightMin = sep != null ? (sep * 499.0) / 60 : null;
    this.cardEl.innerHTML = `
      <div class="sv-h"><b>${p.ko}</b><span>${p.id}</span></div>
      <div class="sv-r"><span>태양까지</span><b>${b.au != null ? `${fmt(b.au, 3)} AU` : '—'}</b></div>
      ${sep != null ? `<div class="sv-r"><span>지구까지</span><b>${fmt(sep, 3)} AU</b></div>
      <div class="sv-r"><span>빛의 이동시간</span><b>${fmt(lightMin, 1)}분</b></div>` : `<div class="sv-r"><span>지구 궤도반경</span><b>${earthAu != null ? `${fmt(earthAu, 3)} AU` : '—'}</b></div>`}
      <div class="sv-r"><span>평균 반지름</span><b>${fmt(p.radiusKm, 0)} km</b></div>
      <div class="sv-r"><span>공전 주기</span><b>${fmt(p.periodD, 0)}일</b></div>
      <div class="sv-note">위치 = NASA/JPL 근사 궤도요소로 이 기기에서 계산 (항해·관측 조준용 아님).<br/>
      화면의 거리·크기는 로그 압축한 <b>표현값</b>입니다 — 위 수치가 실제 값입니다.<br/>
      반지름 출처 JPL SSD phys_par · 표면 텍스처 Solar System Scope (CC BY 4.0)</div>`;
    for (const q of PLANETS) {
      this.bodies[q.id].label.classList.toggle('on', q.id === this.selected);
    }
  }

  // 8행성이 다 들어오는 카메라 거리. 46으로 못박아 두었더니 세로 화각이 모자라
  // 가까운 쪽 바깥 궤도가 화면 아래로 잘렸고, 천왕성·해왕성은 라벨까지 화면 밖이라
  // 아예 없는 행성이 됐다 — 터치 기기엔 휠이 없어 되돌릴 방법도 없었다.
  fitDist() {
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * (this.camera.aspect || 1));
    const sp = Math.sin(this.pitch);
    const cp = Math.cos(this.pitch);
    // 가장 빡빡한 곳은 카메라와 같은 방위의 바깥 궤도(화면 아래 끝)다
    const needV = (R_OUTER * cp + (R_OUTER * sp) / Math.tan(vHalf)) * 1.12; // 아래 날짜 막대 여유
    const needH = (R_OUTER / Math.tan(hHalf)) * 1.06;
    return Math.max(needV, needH);
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    if (!this.userZoom) this.dist = this.fitDist();
  }

  open() {
    this.ensure();
    this.active = true;
    this.dom.classList.add('active');
    this.resize();
    this.layout();
    this.startLoop();
    if (this.hud) this.hud.textContent = 'AETHERUS · 오늘의 태양계';
  }

  startLoop() {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (!this.active) return;
      try {
        const cp = Math.cos(this.pitch);
        this.camera.position.set(
          Math.sin(this.yaw) * cp * this.dist,
          Math.sin(this.pitch) * this.dist,
          Math.cos(this.yaw) * cp * this.dist,
        );
        this.camera.lookAt(0, 0, 0);
        // 라벨 투영
        const W = window.innerWidth;
        const H = window.innerHeight;
        for (const p of PLANETS) {
          const b = this.bodies[p.id];
          const v = b.mesh.position.clone().project(this.camera);
          if (v.z > 1) { b.label.style.display = 'none'; continue; }
          b.label.style.display = 'block';
          if (!b.labelW) b.labelW = b.label.offsetWidth; // 글자가 안 바뀌니 한 번만 잰다
          const px = (v.x * 0.5 + 0.5) * W;
          // 오른쪽 끝에 붙은 행성(좁은 화면의 해왕성)은 라벨이 잘려 이름이 사라졌다.
          // 그럴 때만 라벨을 점 왼쪽으로 붙인다.
          b.label.style.transform = px + b.labelW + 16 > W ? 'translate(calc(-100% - 10px), -50%)' : '';
          b.label.style.left = `${px}px`;
          b.label.style.top = `${(-v.y * 0.5 + 0.5) * H}px`;
        }
        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.error('[earthus-solar] frame error:', err);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.dom) this.dom.classList.remove('active');
    if (this.onClose) this.onClose();
  }
}
