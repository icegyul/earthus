// AETHERUS — 우주 사진관 (천구 배치)
// 59점을 나열한 갤러리가 아니라, 각 관측 대상이 실제로 하늘의 어느 방향에 있는지
// (SIMBAD 적경·적위) 그 방향에 놓는다. 거리는 실제 광년 값을 카드에 적되 화면에는
// 반영하지 않는다(천구는 방향만 나타낸다 — 1.0의 고지문과 같은 규약).
// 배경 별은 장식이며 실제 항성 카탈로그가 아니다 — 카드에 명시한다.

import * as THREE from '../../vendor/three-r184.module.min.js';

const CAT_URL = './assets/skyphotos/catalog.json';
const IMG_ROOT = './assets/skyphotos/';
const R_SKY = 100;      // 천구 반지름 (표현값)
const LOAD_PER_FRAME = 1; // 프레임당 썸네일 1장씩 (초기 2.7MB 폭주 방지)

const TEL = {
  HST: { ko: '허블 (HST)', color: 0x8fd0ff },
  JWST: { ko: '제임스 웹 (JWST)', color: 0xffc56e },
};

// 적경(deg)·적위(deg) → 천구 단위벡터 (렌더 좌표: x=sinλ 규약과 동일)
const raDecToVec = (raDeg, decDeg) => {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cd = Math.cos(dec);
  return new THREE.Vector3(cd * Math.sin(ra), Math.sin(dec), cd * Math.cos(ra));
};

const fmtLy = (ly) => {
  if (ly == null) return null;
  if (ly >= 1e6) return `${(ly / 1e6).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}백만 광년`;
  if (ly >= 1000) return `${(ly / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}천 광년`;
  return `${ly.toLocaleString('ko-KR')} 광년`;
};

const raText = (ra) => {
  const h = ra / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
};
const decText = (dec) => `${dec >= 0 ? '+' : '−'}${Math.abs(dec).toFixed(1)}°`;

export class SkyView {
  constructor(hud) {
    this.hud = hud;
    this.active = false;
    this.dom = null;
    this.items = [];
    this.filter = 'all';
    this.selected = null;
    this.yaw = 0;
    this.pitch = 0.2;
    this.fov = 62;
    this.raf = 0;
    this.loadQueue = [];
  }

  ensure() {
    if (this.dom) return;
    const dom = document.createElement('div');
    dom.id = 'skyview';
    dom.innerHTML = `
      <canvas id="sk-canvas"></canvas>
      <button id="sk-exit">◀ 지구로</button>
      <div id="sk-crumb">AETHERUS <i>›</i> <b>우주 사진관</b></div>
      <div id="sk-title"><b>DEEP&nbsp;&nbsp;SKY</b><span id="sk-sub">하늘의 실제 방향에 놓인 공식 관측 사진</span></div>
      <div id="sk-filters">
        <button data-f="all" class="on">전체</button>
        <button data-f="HST">허블</button>
        <button data-f="JWST">제임스 웹</button>
      </div>
      <div id="sk-card"></div>
      <div id="sk-hint">드래그로 하늘을 둘러보고, 사진을 클릭하면 관측 정보가 열립니다 · 휠 = 시야각</div>
      <div id="sk-loading">사진 카탈로그 로딩 중…</div>`;
    document.body.appendChild(dom);
    this.dom = dom;
    this.canvas = dom.querySelector('#sk-canvas');
    this.cardEl = dom.querySelector('#sk-card');
    this.loadingEl = dom.querySelector('#sk-loading');

    dom.querySelector('#sk-exit').addEventListener('click', () => this.close());
    dom.querySelectorAll('#sk-filters button').forEach((b) => {
      b.addEventListener('click', () => {
        this.filter = b.dataset.f;
        dom.querySelectorAll('#sk-filters button').forEach((x) => x.classList.toggle('on', x === b));
        this.applyFilter();
      });
    });
    window.addEventListener('keydown', (e) => {
      if (this.active && e.key === 'Escape') { e.stopPropagation(); this.close(); }
    }, true);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.1, 1000);
    this.scene.add(this.makeStars());
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.rayc = new THREE.Raycaster();

    let drag = null;
    let moved = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target.closest('#sk-card') || e.target.closest('#sk-filters')) return;
      drag = { x: e.clientX, y: e.clientY };
      moved = 0;
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.0022 * (this.fov / 62);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022 * (this.fov / 62)));
      drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      const wasDrag = drag && moved > 6;
      drag = null;
      if (!wasDrag && !e.target.closest('button') && !e.target.closest('#sk-card')) this.pick(e);
    });
    dom.addEventListener('pointercancel', () => { drag = null; });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.fov = Math.max(16, Math.min(88, this.fov * Math.exp(e.deltaY * 0.0008)));
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }, { passive: false });
    window.addEventListener('resize', () => { if (this.active) this.resize(); });
  }

  makeStars() {
    // 배경 별 — 장식(실제 항성 카탈로그 아님). 카드에 명시한다.
    const N = 2600;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * 400;
      pos[i * 3 + 1] = u * 400;
      pos[i * 3 + 2] = Math.sin(a) * s * 400;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x9fb4d4, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.6,
    }));
  }

  async open() {
    this.ensure();
    this.active = true;
    this.dom.classList.add('active');
    this.resize();
    this.startLoop();
    if (this.hud) this.hud.textContent = 'AETHERUS · 우주 사진관';
    if (this.loaded) { this.loadingEl.style.display = 'none'; return; }
    if (!this.loadingP) this.loadingP = this.loadCatalog();
    try {
      await this.loadingP;
      this.loadingEl.style.display = 'none';
    } catch (e) {
      this.loadingP = null;
      this.loadingEl.textContent = `카탈로그를 불러오지 못했습니다 — ${String((e && e.message) || e)}`;
    }
  }

  async loadCatalog() {
    const cat = await fetch(CAT_URL, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json(); });
    this.items = cat.items || [];
    this.generated = cat.generated;
    const geo = new THREE.PlaneGeometry(1, 1);
    for (const it of this.items) {
      const dir = raDecToVec(it.ra, it.dec);
      // 텍스처 도착 전 자리표시자 (망원경 색 사각) — 위치는 실제 좌표
      const mat = new THREE.MeshBasicMaterial({
        color: (TEL[it.tel] || {}).color || 0x8899aa,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(dir).multiplyScalar(R_SKY);
      m.scale.setScalar(9);
      m.lookAt(0, 0, 0);
      m.userData.item = it;
      this.group.add(m);
      it._mesh = m;
      this.loadQueue.push(it);
    }
    // 방향 표시 링 (천구 격자 대용: 적위 0° = 천구적도)
    const eq = [];
    for (let i = 0; i <= 180; i += 1) {
      const a = (i / 180) * Math.PI * 2;
      eq.push(new THREE.Vector3(Math.sin(a) * R_SKY, 0, Math.cos(a) * R_SKY));
    }
    this.group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(eq),
      new THREE.LineBasicMaterial({ color: 0x3d5a80, transparent: true, opacity: 0.4 }),
    ));
    this.loaded = true;
    this.renderCard();
    return true;
  }

  // 카메라가 향한 쪽부터 순차 로드 (초기 2.7MB 동시 요청 방지)
  pumpLoads() {
    if (!this.loadQueue.length) return;
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    this.loadQueue.sort((a, b) => {
      const da = raDecToVec(a.ra, a.dec).dot(fwd);
      const db = raDecToVec(b.ra, b.dec).dot(fwd);
      return db - da;
    });
    for (let i = 0; i < LOAD_PER_FRAME && this.loadQueue.length; i += 1) {
      const it = this.loadQueue.shift();
      const tex = new THREE.TextureLoader().load(IMG_ROOT + it.thumb, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        const img = t.image;
        if (img && img.width && img.height) {
          const s = 11;
          it._mesh.scale.set(s * (img.width / img.height), s, 1);
        }
        it._mesh.material.color.setHex(0xffffff);
        it._mesh.material.opacity = 1;
        it._mesh.material.map = t;
        it._mesh.material.needsUpdate = true;
      }, undefined, () => { /* 실패 시 자리표시자 유지 — 가짜 이미지 없음 */ });
      it._tex = tex;
    }
  }

  applyFilter() {
    for (const it of this.items) {
      if (!it._mesh) continue;
      it._mesh.visible = this.filter === 'all' || it.tel === this.filter;
    }
    this.renderCard();
  }

  pick(e) {
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.rayc.setFromCamera(ndc, this.camera);
    const hits = this.rayc.intersectObjects(this.group.children, false)
      .filter((h) => h.object.visible && h.object.userData.item);
    if (hits.length) {
      this.selected = hits[0].object.userData.item;
      this.renderCard();
    }
  }

  renderCard() {
    const n = this.items.filter((it) => this.filter === 'all' || it.tel === this.filter).length;
    if (!this.selected) {
      this.cardEl.innerHTML = `<div class="sk-h"><b>우주 사진관</b><span>${n}점</span></div>
        <div class="sk-note">허블(9점)과 제임스 웹(50점)의 공식 공개 관측 사진을, 각 대상이 하늘에서 실제로 놓인 방향(적경·적위)에 배치했습니다.<br/>
        사진을 클릭하면 관측 정보가 열립니다.<br/>
        위치 출처 SIMBAD · 사진 NASA/ESA/CSA 공식 공개본 · 배경 별은 장식이며 항성 카탈로그가 아닙니다.<br/>
        천구는 <b>방향만</b> 나타냅니다 — 실제 거리는 각 사진 카드에 광년으로 표기합니다.</div>`;
      return;
    }
    const it = this.selected;
    const tel = TEL[it.tel] || { ko: it.tel };
    const ly = fmtLy(it.ly);
    this.cardEl.innerHTML = `
      <div class="sk-h"><b>${it.ko}</b><span>${tel.ko}</span></div>
      <img class="sk-img" src="${IMG_ROOT}${it.thumb}" alt="${it.ko}" />
      <div class="sk-r"><span>하늘 위치</span><b>적경 ${raText(it.ra)} · 적위 ${decText(it.dec)}</b></div>
      ${ly ? `<div class="sk-r"><span>거리</span><b>${ly}</b></div>` : ''}
      <div class="sk-r"><span>${it.dateKind === 'release' ? '공개일' : '관측일'}</span><b>${it.date}</b></div>
      <div class="sk-note">${it.credit}<br/>이용 조건: ${it.lic}<br/>
        <a href="${it.full}" target="_blank" rel="noopener">공식 원본·설명 →</a>
        ${it.pos ? ` · <a href="${it.pos}" target="_blank" rel="noopener">좌표 출처(SIMBAD)</a>` : ''}</div>`;
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  startLoop() {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (!this.active) return;
      try {
        const cp = Math.cos(this.pitch);
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(
          Math.sin(this.yaw) * cp,
          Math.sin(this.pitch),
          Math.cos(this.yaw) * cp,
        );
        this.pumpLoads();
        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.error('[earthus-sky] frame error:', err);
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
