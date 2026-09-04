// AETHERUS 레이어 — Three.js 어댑터
//
// 정본 코어(core.js)가 무엇을 그릴지 정하고, 이 파일은 어떻게 그릴지만 정한다.
// Intelligence(/v2)와 WONDER(/v3)가 함께 쓴다. 두 지구의 씬 규약이 같기 때문이다.
//   렌더 좌표 규약: ECEF(X,Y,Z)km → (x=Y, y=Z, z=X)/R  — sat-layer 와 동일하다.
//
// 코어가 위치를 못 준다고 판단하면(스냅샷이 낡았을 때) positions() 가 빈 배열을
// 주고, 여기서는 아무것도 그리지 않는다. 이 파일에는 "그래도 그리자" 는 길이 없다.

import { AetherusCore, R_KM } from './core.js';

const DOT = '#7EDCFF';       // 정본 객체
const DOT_DEBRIS = '#FF9E6B'; // 파편·로켓바디 — 우주쓰레기
const LINK = '#F5B14C';      // 근접사건을 잇는 선

let ringTex = null;
const getRingTex = (THREE) => {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(24, 24, 16, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath(); ctx.arc(24, 24, 5, 0, Math.PI * 2); ctx.fill();
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
};

const POS_INTERVAL_MS = 250;

export class AetherusThreeLayer {
  /**
   * @param {object} THREE  씬이 쓰는 three 모듈 — 지구마다 자기 vendor 사본을 넘긴다.
   *                        (여기서 직접 import 하면 인스턴스가 둘이 되어 재질이 안 먹는다)
   * @param {object} parent 붙일 곳. 씬이든 회전하는 지구 그룹이든 상관없다 —
   *                        좌표는 지구고정계라 회전 그룹에 붙이면 같이 돈다.
   * @param {object} [options] core 로 넘길 값 +
   *   { pointSize,
   *     project(ecefKm) → [x,y,z]   지구마다 렌더 좌표 규약이 다르다. 기본값은
   *                                 v2·sat-layer 규약 (x=Y, y=Z, z=X)/R 이고,
   *                                 WONDER 처럼 고도를 눌러 담는 지구는 자기 것을 넘긴다. }
   */
  constructor(THREE, parent, options = {}) {
    this.THREE = THREE;
    this.core = options.core || new AetherusCore(options);
    this.project = options.project
      || (([X, Y, Z]) => [Y / R_KM, Z / R_KM, X / R_KM]);
    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.on = false;
    this.loading = false;
    this.pointSize = options.pointSize || 13;
    this.points = null;
    this.debrisPoints = null;
    this.linkLines = null;
    this.lastPos = 0;
    this._buckets = { plain: [], debris: [] };
  }

  // 코어의 상태를 그대로 노출한다 — 호출부가 코어를 따로 들여다볼 필요가 없게.
  get entries() { return this.core.entries; }
  get conjunctions() { return this.core.conjunctions; }
  get timer() { return this.core.timer; }
  set timer(v) { if (v == null) this.core.stop(); }
  get lastError() { return this.core.lastError; }

  _disposeGeometry() {
    for (const key of ['points', 'debrisPoints', 'linkLines']) {
      const obj = this[key];
      if (!obj) continue;
      this.group.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
      this[key] = null;
    }
  }

  /* 파편과 그 밖을 다른 색으로 나눈다 — '우주쓰레기가 어디에 얼마나 있는가' 가
     이 레이어의 요점이라, 한 색으로 섞으면 그 요점이 사라진다. */
  _rebuildGeometry() {
    const { THREE } = this;
    this._disposeGeometry();
    const rows = this.core.positions();
    this._buckets = {
      plain: rows.filter((r) => !r.debris),
      debris: rows.filter((r) => r.debris),
    };

    const mkPoints = (count, color, size) => {
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(new Float32Array(Math.max(count, 1) * 3), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      geo.setDrawRange(0, count);
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size, sizeAttenuation: false, color: new THREE.Color(color),
        map: getRingTex(THREE), alphaTest: 0.05, transparent: true,
        opacity: 0.95, depthWrite: false,
      }));
      pts.frustumCulled = false;
      this.group.add(pts);
      return pts;
    };

    this.points = mkPoints(this._buckets.plain.length, DOT, this.pointSize);
    this.debrisPoints = mkPoints(this._buckets.debris.length, DOT_DEBRIS, this.pointSize * 0.8);

    const lineGeo = new THREE.BufferGeometry();
    const lineAttr = new THREE.BufferAttribute(
      new Float32Array(Math.max(this.core.conjunctions.length, 1) * 6), 3);
    lineAttr.setUsage(THREE.DynamicDrawUsage);
    lineGeo.setAttribute('position', lineAttr);
    lineGeo.setDrawRange(0, this.core.conjunctions.length * 2);
    this.linkLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: new THREE.Color(LINK), transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.linkLines.frustumCulled = false;
    this.group.add(this.linkLines);
  }

  async refresh() {
    await this.core.refresh();
    this._rebuildGeometry();
    this.lastPos = 0;
  }

  async toggle() {
    if (this.loading) return { on: this.on };
    this.loading = true;
    try {
      this.on = !this.on;
      if (this.on) {
        await this.core.start();
        this._rebuildGeometry();
      } else {
        this.core.stop();
      }
      this.group.visible = this.on;
      return { on: this.on };
    } catch (error) {
      this.on = false;
      this.group.visible = false;
      this.core.stop();
      console.warn('[aetherus]', error);
      return { on: false, error: String(error?.message || error) };
    } finally { this.loading = false; }
  }

  state() {
    if (!this.on) return { on: false };
    return { on: true, note: this.core.state(true) };
  }

  card(ko = true) { return this.core.card(ko); }

  update(nowMs) {
    if (!this.group.visible) return;
    if (nowMs - this.lastPos < POS_INTERVAL_MS) return;
    this.lastPos = nowMs;

    const rows = this.core.positions(nowMs);
    if (!rows.length) {
      // 위치를 그릴 수 없는 상태 — 이전 점을 남겨두지 않는다.
      if (this.points) this.points.geometry.setDrawRange(0, 0);
      if (this.debrisPoints) this.debrisPoints.geometry.setDrawRange(0, 0);
      if (this.linkLines) this.linkLines.geometry.setDrawRange(0, 0);
      return;
    }
    if (rows.length !== this._buckets.plain.length + this._buckets.debris.length) {
      this._rebuildGeometry();
    }

    const at = new Map();
    const fill = (mesh, list) => {
      if (!mesh) return;
      const arr = mesh.geometry.getAttribute('position');
      list.forEach((row, i) => {
        const [x, y, z] = this.project(row.ecef, row);
        arr.array[i * 3] = x;
        arr.array[i * 3 + 1] = y;
        arr.array[i * 3 + 2] = z;
        at.set(row.catalogId, [x, y, z]);
      });
      mesh.geometry.setDrawRange(0, list.length);
      arr.needsUpdate = true;
    };
    const plain = rows.filter((r) => !r.debris);
    const debris = rows.filter((r) => r.debris);
    fill(this.points, plain);
    fill(this.debrisPoints, debris);
    this._buckets = { plain, debris };

    if (this.linkLines && this.core.conjunctions.length) {
      const arr = this.linkLines.geometry.getAttribute('position');
      let n = 0;
      for (const ev of this.core.conjunctions) {
        const a = at.get(ev.a);
        const b = at.get(ev.b);
        if (!a || !b) continue;
        arr.array[n * 6] = a[0]; arr.array[n * 6 + 1] = a[1]; arr.array[n * 6 + 2] = a[2];
        arr.array[n * 6 + 3] = b[0]; arr.array[n * 6 + 4] = b[1]; arr.array[n * 6 + 5] = b[2];
        n += 1;
      }
      this.linkLines.geometry.setDrawRange(0, n * 2);
      arr.needsUpdate = true;
    }
  }

  dispose() {
    this.core.stop();
    this._disposeGeometry();
    this.group.parent?.remove(this.group);
  }
}
