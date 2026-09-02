// EARTHUS — 지역 3D 지형 뷰: 위성사진을 실지형(DEM) 위에 입체로.
// 지구→국가 줌인 핸드오프 대상. 향후 홍수·GLOF 시뮬레이션이 이 지형 위에서 돈다.
// 데이터: AWS Terrarium z10 고도 + Esri World Imagery z11 위성 타일.

import * as THREE from '../../vendor/three-r184.module.min.js';

const G_TILE = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const SAT_TILE = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const SEG = 320;

export class LocalTerrain {
  constructor(hud) {
    this.hud = hud;
    this.active = false;
    this.dom = null;
    this.exag = 2.2;
    this.yaw = 0.4;
    this.pitch = 0.62;
    this.dist = 1.1; // 윈도 폭 비율
    this.raf = 0;
  }

  ensure() {
    if (this.dom) return;
    const dom = document.createElement('div');
    dom.id = 'localview';
    dom.innerHTML = `
      <canvas id="lt-canvas"></canvas>
      <button id="lt-exit">◀ 지구로</button>
      <button id="lt-map">2D 지도</button>
      <div id="lt-info"></div>
      <div id="lt-bar">
        <label>지형 과장 <input type="range" id="lt-exag" min="1" max="5" step="0.2" value="2.2" /><b id="lt-exag-v">2.2×</b></label>
        <span id="lt-attrib">위성 © Esri · 고도 AWS Terrarium</span>
      </div>
      <div id="lt-loading">지역 지형·위성 데이터 로딩 중…</div>`;
    document.body.appendChild(dom);
    this.dom = dom;
    this.canvas = dom.querySelector('#lt-canvas');
    this.info = dom.querySelector('#lt-info');
    this.loadingEl = dom.querySelector('#lt-loading');
    dom.querySelector('#lt-exit').addEventListener('click', () => this.close());
    dom.querySelector('#lt-map').addEventListener('click', () => {
      const c = this.center;
      this.close(true);
      if (this.onOpenMap && c) this.onOpenMap(c.lat, c.lon);
    });
    const exagEl = dom.querySelector('#lt-exag');
    exagEl.addEventListener('input', () => {
      this.exag = parseFloat(exagEl.value);
      dom.querySelector('#lt-exag-v').textContent = `${this.exag.toFixed(1)}×`;
      this.applyHeights();
    });

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f14);
    this.camera = new THREE.PerspectiveCamera(55, 1, 10, 1e7);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.55));

    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('#lt-bar')) return;
      drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.004;
      this.pitch = Math.max(0.12, Math.min(1.35, this.pitch + (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', () => { drag = null; });
    // 제스처가 취소돼도 기준점을 버린다 — 안 버리면 다음 터치 첫 프레임에 카메라가 튄다
    dom.addEventListener('pointercancel', () => { drag = null; });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = Math.max(0.12, Math.min(2.4, this.dist * Math.exp(e.deltaY * 0.001)));
    }, { passive: false });
    window.addEventListener('resize', () => { if (this.active) this.resize(); });
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  async fetchGrid(z, tx0, ty0, count, ctx, urlFn) {
    const n = 1 << z;
    const jobs = [];
    let ok = 0;
    for (let dy = 0; dy < count; dy += 1) {
      for (let dx = 0; dx < count; dx += 1) {
        const tx = (((tx0 + dx) % n) + n) % n;
        const ty = Math.max(0, Math.min(n - 1, ty0 + dy));
        jobs.push(new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { ctx.drawImage(img, dx * 256, dy * 256); ok += 1; resolve(); };
          img.onerror = () => resolve();
          img.src = urlFn(z, tx, ty);
        }));
      }
    }
    await Promise.all(jobs);
    return ok;
  }

  async open(latDeg, lonDeg, sunElev) {
    this.ensure();
    this.active = true;
    this.center = { lat: latDeg, lon: lonDeg };
    this.dom.classList.add('active');
    this.loadingEl.style.display = 'block';
    this.resize();
    this.startLoop();

    // z10 고도 6×6 윈도 (약 0.35°/타일)
    const zH = 10;
    const nH = 1 << zH;
    const latC = Math.max(-84, Math.min(84, latDeg));
    const mercV = 0.5 - Math.log(Math.tan(Math.PI / 4 + (latC * Math.PI) / 360)) / (2 * Math.PI);
    const txc = Math.floor(((((lonDeg + 180) / 360) % 1) + 1) % 1 * nH);
    const tyc = Math.max(0, Math.min(nH - 1, Math.floor(mercV * nH)));
    const tx0 = txc - 3;
    const ty0 = Math.max(0, Math.min(nH - 6, tyc - 3));

    const hCan = document.createElement('canvas');
    hCan.width = 1536;
    hCan.height = 1536;
    const hCtx = hCan.getContext('2d', { willReadFrequently: true });
    hCtx.fillStyle = 'rgb(128,0,0)';
    hCtx.fillRect(0, 0, 1536, 1536);

    const sCan = document.createElement('canvas');
    sCan.width = 3072;
    sCan.height = 3072;
    const sCtx = sCan.getContext('2d');
    sCtx.fillStyle = '#12202e';
    sCtx.fillRect(0, 0, 3072, 3072);

    await Promise.all([
      this.fetchGrid(zH, tx0, ty0, 6, hCtx, G_TILE),
      this.fetchGrid(zH + 1, tx0 * 2, ty0 * 2, 12, sCtx, SAT_TILE),
    ]);

    // 높이 그리드 (SEG+1)² 바이리니어 샘플
    const px = hCtx.getImageData(0, 0, 1536, 1536).data;
    const hAt = (x, y) => {
      const xi = Math.max(0, Math.min(1535, x));
      const yi = Math.max(0, Math.min(1535, y));
      const i = (yi * 1536 + xi) * 4;
      return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
    };
    this.heights = new Float32Array((SEG + 1) * (SEG + 1));
    for (let gy = 0; gy <= SEG; gy += 1) {
      for (let gx = 0; gx <= SEG; gx += 1) {
        const sx = (gx / SEG) * 1535;
        const sy = (gy / SEG) * 1535;
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;
        const h = hAt(x0, y0) * (1 - fx) * (1 - fy) + hAt(x0 + 1, y0) * fx * (1 - fy)
          + hAt(x0, y0 + 1) * (1 - fx) * fy + hAt(x0 + 1, y0 + 1) * fx * fy;
        this.heights[gy * (SEG + 1) + gx] = Math.max(h, 0); // 바다는 해수면
      }
    }

    // 메시: 윈도 실폭(m) — 메르카토르 보정
    const cosL = Math.cos((latC * Math.PI) / 180);
    this.spanM = ((40075016 / nH) * 6) * cosL;
    if (!this.mesh) {
      this.geo = new THREE.PlaneGeometry(1, 1, SEG, SEG);
      this.mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
      this.mesh = new THREE.Mesh(this.geo, this.mat);
      this.mesh.rotation.x = -Math.PI / 2;
      this.scene.add(this.mesh);
    }
    this.mesh.scale.set(this.spanM, this.spanM, 1);
    if (this.mat.map) this.mat.map.dispose();
    const tex = new THREE.CanvasTexture(sCan);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.mat.map = tex;
    this.mat.needsUpdate = true;
    this.applyHeights();

    const el = sunElev != null ? Math.max(sunElev, 0.12) : 0.6;
    this.sunLight.position.set(Math.cos(el) * 0.7, Math.sin(el), Math.cos(el) * 0.4).multiplyScalar(this.spanM);

    this.dist = 0.9;
    this.loadingEl.style.display = 'none';
    const latS = `${latDeg >= 0 ? 'N' : 'S'}${Math.abs(latDeg).toFixed(2)}°`;
    const lonS = `${lonDeg >= 0 ? 'E' : 'W'}${Math.abs(lonDeg).toFixed(2)}°`;
    this.info.innerHTML = `<b>지역 3D</b> · ${latS} ${lonS} · 폭 ~${Math.round(this.spanM / 1000)}km<br/>위성 위 실지형 — 드래그 회전 · 휠 줌`;
    if (this.hud) this.hud.textContent = `지역 3D 모드 · ${latS} ${lonS}`;
  }

  applyHeights() {
    if (!this.geo || !this.heights) return;
    const pos = this.geo.attributes.position;
    const zs = this.exag / this.spanM; // 지오메트리 단위(1=윈도폭)로 정규화
    for (let i = 0; i < pos.count; i += 1) {
      pos.setZ(i, this.heights[i] * zs);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  startLoop() {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (!this.active) return;
      try {
        const r = this.spanM * this.dist;
        const cp = Math.cos(this.pitch);
        this.camera.position.set(
          Math.sin(this.yaw) * cp * r,
          Math.sin(this.pitch) * r,
          Math.cos(this.yaw) * cp * r,
        );
        this.camera.lookAt(0, 0, 0);
        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.error('[earthus-local] frame error:', err);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close(toMap) {
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.dom) this.dom.classList.remove('active');
    if (!toMap && this.onClose) this.onClose(this.center ? this.center.lat : 36, this.center ? this.center.lon : 127);
  }
}
