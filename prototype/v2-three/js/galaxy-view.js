// AETHERUS — 우리은하 (스케일 교육 씬)
//
// 정직성이 이 화면의 전부다: 우리은하는 밖에서 찍은 사진이 없다.
// 여기 보이는 별 배치는 관측된 구조 수치(지름 10만 광년, 태양까지 26,000광년,
// 나선팔 4개)에 맞춰 만든 **재구성 도식**이고, 그 사실을 화면과 카드 양쪽에 적는다.
// 수치와 팔 이름은 data/milky-way-structure.json(출처 명시)에서 읽는다.

import * as THREE from '../../vendor/three-r184.module.min.js';

const DATA_URL = './data/milky-way-structure.json?v=1';
const R_DISK = 50; // 표현 반지름 = 지름 10만 광년의 절반
const fmt = (n) => Number(n).toLocaleString('ko-KR');

export class GalaxyView {
  constructor(hud) {
    this.hud = hud;
    this.active = false;
    this.dom = null;
    this.doc = null;
    this.yaw = 0.5;
    this.pitch = 0.55;
    this.dist = 145;        // 가로 화면 기준 구도. 세로로 긴 화면에서는 resize()가 넓힌다
    this.userZoom = false;  // 사람이 휠로 줌한 뒤에는 리사이즈가 그 거리를 건드리지 않는다
    this.raf = 0;
    this.labels = [];
  }

  async load() {
    if (this.doc) return this.doc;
    const r = await fetch(DATA_URL);
    if (!r.ok) throw new Error(`은하 구조 자료 ${r.status}`);
    this.doc = await r.json();
    return this.doc;
  }

  // 로그 나선 — t(0~1)를 반지름으로 삼고 각도를 역산한다.
  // 각도를 매개변수로 쓰면 팔마다 시작 각이 달라 길이가 제각각이 되고,
  // 4개를 그려도 화면에는 2개처럼 보인다.
  static armPoint(armIdx, t, arms) {
    const r0 = R_DISK * 0.14;
    const r = r0 + (R_DISK - r0) * Math.max(0, Math.min(1, t));
    const th = Math.log(r / r0) / 0.3 + (armIdx * Math.PI * 2) / arms;
    return [r, th];
  }

  buildGalaxy(doc) {
    const g = new THREE.Group();
    const arms = (doc.arms || []).length || 4;
    const N = 26000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    let seed = 20260902;
    const rnd = () => { // 고정 시드 — 새로고침마다 은하 모양이 바뀌면 안 된다
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < N; i += 1) {
      let x; let y; let z; let warm;
      if (i < N * 0.16) {
        // 팽대부 — 늙고 붉은 별이 중심에 몰린 부분
        const r = R_DISK * 0.16 * (rnd() ** 0.55);
        const th = rnd() * Math.PI * 2;
        const ph = Math.acos(2 * rnd() - 1);
        x = r * Math.sin(ph) * Math.cos(th);
        y = r * Math.cos(ph) * 0.62;
        z = r * Math.sin(ph) * Math.sin(th);
        warm = 0.85;
      } else {
        const [r0, th0] = GalaxyView.armPoint(i % arms, rnd() ** 0.72, arms);
        const spread = 1.4 + r0 * 0.16;
        const th = th0 + (rnd() - 0.5) * 0.34;
        const r = Math.min(R_DISK, r0 + (rnd() - 0.5) * spread);
        x = r * Math.cos(th);
        z = r * Math.sin(th);
        y = (rnd() - 0.5) * (1.2 + r * 0.045); // 원반 두께
        warm = 0.18 + rnd() * 0.35; // 팔에는 젊고 푸른 별이 많다
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      col[i * 3] = 0.62 + warm * 0.38;
      col[i * 3 + 1] = 0.66 + warm * 0.18;
      col[i * 3 + 2] = 1.0 - warm * 0.22;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.5,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })));
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(R_DISK * 0.09, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffe0a8,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ));
    return g;
  }

  // 태양 위치 — 중심에서 26,000광년(자료값)을 표현 반지름으로 환산
  sunRadius(doc) {
    const ly = doc.sunDistanceFromCenterLightYears || 26000;
    const half = (doc.diameterLightYears || 100000) / 2;
    return R_DISK * (ly / half);
  }

  ensure() {
    if (this.dom) return;
    const dom = document.createElement('div');
    dom.id = 'gxview';
    dom.innerHTML = '<canvas id="gx-canvas"></canvas>'
      + '<button id="gx-exit">◀ 지구로</button>'
      + '<div id="gx-crumb">AETHERUS <i>›</i> <b>우리은하</b></div>'
      + '<div id="gx-title"><b>MILKY&nbsp;&nbsp;WAY</b><span id="gx-sub">—</span></div>'
      + '<div id="gx-card"></div>'
      + '<div id="gx-bar"><span id="gx-src">—</span></div>';
    document.body.appendChild(dom);
    this.dom = dom;
    this.canvas = dom.querySelector('#gx-canvas');
    dom.querySelector('#gx-exit').addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (this.active && e.key === 'Escape') { e.stopPropagation(); this.close(); }
    }, true);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.5, 4000);

    // 드래그 회전 + 휠 줌 (캔버스는 CSS에서 touch-action:none)
    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#gx-card') || e.target.closest('#gx-bar') || e.target.closest('button')) return;
      drag = { x: e.clientX, y: e.clientY };
      try { dom.setPointerCapture(e.pointerId); } catch (err) { /* 살아있는 포인터가 아니면 넘어간다 */ }
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.005;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (e.clientY - drag.y) * 0.005));
      drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => { drag = null; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.userZoom = true;
      this.dist = Math.max(28, Math.min(420, this.dist * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
    window.addEventListener('resize', () => { if (this.active) this.resize(); });

    this.labelWrap = document.createElement('div');
    this.labelWrap.id = 'gx-labels';
    dom.appendChild(this.labelWrap);
  }

  buildScene(doc) {
    if (this.built) return;
    this.built = true;
    this.scene.add(this.buildGalaxy(doc));

    // 태양 — 이 도식에서 '우리가 있는 곳'
    const sr = this.sunRadius(doc);
    this.sunPos = new THREE.Vector3(sr * Math.cos(1.9), 0, sr * Math.sin(1.9));
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    );
    sun.position.copy(this.sunPos);
    this.scene.add(sun);
    this.scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 181 }, (_, i) => {
        const t = (i / 180) * Math.PI * 2;
        return new THREE.Vector3(sr * Math.cos(t), 0, sr * Math.sin(t));
      })),
      new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.32 }),
    ));

    // 라벨: 나선팔 + 태양 (자료의 labelRadius를 그대로 쓴다)
    const mk = (text, v3, cls) => {
      const el = document.createElement('div');
      el.className = `gx-label${cls ? ` ${cls}` : ''}`;
      el.textContent = text;
      this.labelWrap.appendChild(el);
      this.labels.push({ el, v: v3 });
    };
    const arms = (doc.arms || []).length || 4;
    (doc.arms || []).forEach((a, i) => {
      const lr = (a.labelRadius || 30) / 50; // 자료는 0~50 스케일
      const idx = a.modelArm != null ? a.modelArm : i;
      let best = null;
      for (let t = 0.02; t <= 1; t += 0.01) {
        const [r, th] = GalaxyView.armPoint(idx, t, arms);
        if (r >= lr * R_DISK) { best = [r, th]; break; }
      }
      if (!best) best = GalaxyView.armPoint(idx, 0.9, arms).length ? GalaxyView.armPoint(idx, 0.9, arms) : null;
      if (!best) return;
      mk(a.ko || a.en,
        new THREE.Vector3(best[0] * Math.cos(best[1]), 1.6, best[0] * Math.sin(best[1])),
        a.class === 'major' ? 'major' : '');
    });
    mk(`☉ 태양 · ${fmt(doc.sunDistanceFromCenterLightYears)}광년`, this.sunPos.clone().setY(2.2), 'sun');
    if (doc.orionSpur) {
      mk(doc.orionSpur.ko || 'Orion Spur', this.sunPos.clone().multiplyScalar(0.86).setY(-2.2));
    }
  }

  cardHtml(doc) {
    const src = (doc.sources || [])
      .map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>`).join(' · ');
    const major = (doc.arms || []).filter((a) => a.class === 'major').length;
    return '<div class="gx-card-h">우리은하 <span class="gx-badge">재구성 도식</span></div>'
      + '<div class="gx-card-b">'
      + `<div class="stat"><span class="k">지름</span><span class="v">${fmt(doc.diameterLightYears)} 광년</span></div>`
      + `<div class="stat"><span class="k">중심에서 태양까지</span><span class="v">${fmt(doc.sunDistanceFromCenterLightYears)} 광년</span></div>`
      + `<div class="stat"><span class="k">태양의 은하 공전</span><span class="v">약 ${fmt(Math.round((doc.solarOrbitYears || 0) / 1e6))}백만 년에 한 바퀴</span></div>`
      + `<div class="stat"><span class="k">나선팔</span><span class="v">${(doc.arms || []).length}개 (주팔 ${major})</span></div>`
      + `<p class="gx-warn">${(doc.limitations || {}).ko || ''}</p>`
      + `<p class="gx-src">출처 ${src}</p></div>`;
  }

  // 은하 원반(표현 반지름 50)이 다 들어오는 거리. 145로 못박아 두었더니 세로로 긴
  // 화면에서는 가로 화각이 모자라 원반 좌우가 잘렸다 — 휠이 없는 휴대폰에서는
  // '우리는 어디 있나'를 잘린 은하로 보게 된다. 가로 화면 구도(145)는 그대로 둔다.
  fitDist() {
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * (this.camera.aspect || 1));
    const sp = Math.abs(Math.sin(this.pitch));
    const cp = Math.abs(Math.cos(this.pitch));
    const needV = (R_DISK * cp + (R_DISK * sp) / Math.tan(vHalf)) * 1.05;
    const needH = (R_DISK / Math.tan(hHalf)) * 1.06;
    return Math.max(145, needV, needH);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.userZoom) this.dist = this.fitDist();
  }

  async open() {
    this.ensure();
    this.dom.classList.add('active');
    this.active = true;
    if (this.hud) this.hud.textContent = 'AETHERUS · 우리은하';
    try {
      const doc = await this.load();
      this.buildScene(doc);
      this.dom.querySelector('#gx-card').innerHTML = this.cardHtml(doc);
      this.dom.querySelector('#gx-sub').textContent =
        `지름 ${fmt(doc.diameterLightYears)}광년 · 밖에서 찍은 사진이 아닙니다`;
      this.dom.querySelector('#gx-src').textContent =
        `구조 수치: ${(doc.sources || []).map((s) => s.name).join(' · ')} · 별 배치는 그 수치에 맞춘 재구성`;
    } catch (e) {
      this.dom.querySelector('#gx-card').innerHTML =
        `<div class="gx-card-b">은하 구조 자료를 불러오지 못했습니다 — 값을 지어내지 않습니다.<br/>${String((e && e.message) || e)}</div>`;
    }
    this.resize();
    this.startLoop();
  }

  startLoop() {
    cancelAnimationFrame(this.raf);
    const v = new THREE.Vector3();
    const loop = () => {
      if (!this.active) return;
      const cp = Math.cos(this.pitch);
      this.camera.position.set(
        Math.sin(this.yaw) * cp * this.dist,
        Math.sin(this.pitch) * this.dist,
        Math.cos(this.yaw) * cp * this.dist,
      );
      this.camera.lookAt(0, 0, 0);
      for (const l of this.labels) {
        v.copy(l.v).project(this.camera);
        const on = v.z < 1;
        l.el.style.display = on ? 'block' : 'none';
        if (on) {
          if (!l.w) l.w = l.el.offsetWidth; // 글자가 안 바뀌니 한 번만 잰다
          const W = window.innerWidth;
          // 라벨은 점 위에 가운데로 놓인다. 화면 끝에 걸린 팔 이름은 절반이 잘려
          // 읽히지 않았다(좁은 화면의 '페르세우스자리 팔') — 안쪽으로 물린다.
          const x = Math.min(Math.max(((v.x + 1) / 2) * W, l.w / 2 + 6), W - l.w / 2 - 6);
          l.el.style.left = `${x}px`;
          l.el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
        }
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  close() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.dom) this.dom.classList.remove('active');
  }
}
