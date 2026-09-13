// EARTHUS V3 WONDER — globe-engine / camera (순수 상태기, DOM·three 없음)
// 궤도 카메라: 지구 중심을 보며 {lat, lon, dist} 위치. 줌은 3단 잠금(키즈 규칙), 회전 60°/s 상한, 극 ±85° 잠금.
// 지구 목표 크기(Master Directive §2.2): Desktop 720 · Laptop 660 · Tablet 580 · Mobile 350 px.

import { clampLat, wrapLon, shortestLonDelta } from './geo.mjs';

export const FOV_DEG = 40;
export const ZOOM_STEPS = 3;                    // 0 = 세계, 1 = 지역 접근, 2 = 지역
export const ZOOM_FACTORS = [1, 1.65, 2.7];     // 단계별 지구 지름 배수 (단계 0 지름 × 배수)
export const MAX_RATE_DEG_S = 60;               // 키즈 규칙: 회전 60°/s 상한
export const LAT_LIMIT = 85;
export const MIN_DIST = 1.12;                   // 구 안으로 들어가지 않는다 (반지름 1)

/** 화면 폭 → 지구 목표 지름(px). 화면보다 크면 0.94·min(W,H) 로 캡 (375px 폰에서 350 이 나오게). */
export function targetDiameter(viewW, viewH) {
  const byWidth = viewW >= 1440 ? 720 : viewW >= 1024 ? 660 : viewW >= 768 ? 580 : 350;
  return Math.min(byWidth, 0.94 * Math.min(viewW, viewH));
}

/**
 * 반지름 R 구가 지름 Dpx 로 보이려면 카메라가 얼마나 떨어져야 하는가.
 * 실루엣 각반지름 θ: sinθ = R/d, 화면 반지름(px) = (H/2)·tanθ / tan(fov/2)  ⇒ tanθ = (Dpx/H)·tan(fov/2), d = R/sinθ.
 */
export function distanceForDiameter(dPx, viewH, fovDeg = FOV_DEG, R = 1) {
  const t = (dPx / viewH) * Math.tan(fovDeg / 2 * Math.PI / 180);
  const sinTheta = t / Math.sqrt(1 + t * t);
  return Math.max(MIN_DIST, R / sinTheta);
}

/** 반대로: 거리 d 에서 보이는 지름(px). 검증용. */
export function diameterAtDistance(d, viewH, fovDeg = FOV_DEG, R = 1) {
  const sinTheta = Math.min(1, R / d);
  const tanTheta = sinTheta / Math.sqrt(1 - sinTheta * sinTheta);
  return viewH * tanTheta / Math.tan(fovDeg / 2 * Math.PI / 180);
}

/** 단계별 카메라 거리 배열(길이 3). */
export function zoomDistances(viewW, viewH) {
  const base = targetDiameter(viewW, viewH);
  return ZOOM_FACTORS.map(f => distanceForDiameter(base * f, viewH));
}

const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * 카메라 상태기. 프레임마다 tick(dt) 를 부르면 관성·트윈을 진행한다.
 * 입력(드래그·줌)은 목표를 바꾸고, 렌더러는 `pose()` 만 읽는다.
 */
export class OrbitCamera {
  constructor({ lat = 20, lon = 127, viewW = 1440, viewH = 900, reducedMotion = false } = {}) {
    this.lat = lat; this.lon = lon; this.step = 0;
    this.viewW = viewW; this.viewH = viewH;
    this.dists = zoomDistances(viewW, viewH);
    this.dist = this.dists[0];
    this.vLon = 0; this.vLat = 0;               // 관성 속도(°/s)
    this.tween = null;                          // {from, to, t, dur}
    this.reducedMotion = reducedMotion;
    this.dragging = false;
  }

  /** 뷰포트가 바뀌면 단계 거리를 다시 계산하고 현재 단계 거리로 맞춘다. */
  resize(viewW, viewH) {
    this.viewW = viewW; this.viewH = viewH;
    this.dists = zoomDistances(viewW, viewH);
    if (!this.tween) this.dist = this.dists[this.step];
    else this.tween.to.dist = this.dists[this.step];
  }

  /** 드래그 1픽셀이 몇 도인가 — 지구를 가로질러 끌면 약 150° 돌게. 줌인일수록 느리다. */
  degPerPx() {
    const d = this.dists[0], base = 150 / Math.max(80, targetDiameter(this.viewW, this.viewH));
    return base * (d - 1) / Math.max(0.05, this.dist - 1) * (this.dist / d);
  }

  beginDrag() { this.dragging = true; this.vLon = 0; this.vLat = 0; this.tween = null; }

  /** 드래그 이동(px)과 경과 시간(s). 속도 상한 60°/s 를 넘는 부분은 잘라 낸다. */
  drag(dx, dy, dt) {
    const k = this.degPerPx();
    let dLon = -dx * k, dLat = dy * k;
    const cap = MAX_RATE_DEG_S * Math.max(dt, 1 / 240);
    dLon = Math.max(-cap, Math.min(cap, dLon)); dLat = Math.max(-cap, Math.min(cap, dLat));
    this.lon = wrapLon(this.lon + dLon);
    this.lat = clampLat(this.lat + dLat, LAT_LIMIT);
    if (dt > 0) { this.vLon = Math.max(-MAX_RATE_DEG_S, Math.min(MAX_RATE_DEG_S, dLon / dt)); this.vLat = Math.max(-MAX_RATE_DEG_S, Math.min(MAX_RATE_DEG_S, dLat / dt)); }
  }

  endDrag() { this.dragging = false; if (this.reducedMotion) { this.vLon = 0; this.vLat = 0; } }

  /** 줌 단계를 잠근 범위 안에서 바꾼다. 트윈으로 이동(움직임 줄이기면 즉시). @returns 실제로 바뀌었는가 */
  setZoomStep(step, { lat, lon } = {}) {
    const s = Math.max(0, Math.min(ZOOM_STEPS - 1, Math.round(step)));
    const to = { lat: lat ?? this.lat, lon: lon ?? this.lon, dist: this.dists[s] };
    const changed = s !== this.step || lat != null || lon != null;
    this.step = s;
    this.vLon = 0; this.vLat = 0;
    if (this.reducedMotion) { this.lat = clampLat(to.lat); this.lon = wrapLon(to.lon); this.dist = to.dist; this.tween = null; return changed; }
    this.tween = { from: { lat: this.lat, lon: this.lon, dist: this.dist }, to, t: 0, dur: 0.9 };
    return changed;
  }

  zoomIn() { return this.setZoomStep(this.step + 1); }
  zoomOut() { return this.setZoomStep(this.step - 1); }

  /** 프레임 진행. dt 초. */
  tick(dt) {
    if (this.tween) {
      const tw = this.tween; tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = easeInOut(tw.t);
      this.lat = tw.from.lat + (clampLat(tw.to.lat) - tw.from.lat) * e;
      this.lon = wrapLon(tw.from.lon + shortestLonDelta(tw.from.lon, tw.to.lon) * e);
      this.dist = tw.from.dist + (tw.to.dist - tw.from.dist) * e;
      if (tw.t >= 1) this.tween = null;
      return;
    }
    if (!this.dragging && (this.vLon || this.vLat)) {
      const decay = Math.exp(-dt * 3.2);
      this.lon = wrapLon(this.lon + this.vLon * dt);
      this.lat = clampLat(this.lat + this.vLat * dt, LAT_LIMIT);
      this.vLon *= decay; this.vLat *= decay;
      if (Math.abs(this.vLon) < 0.4 && Math.abs(this.vLat) < 0.4) { this.vLon = 0; this.vLat = 0; }
    }
  }

  get animating() { return !!this.tween || this.vLon !== 0 || this.vLat !== 0; }

  /** 렌더러가 읽는 자세. */
  pose() { return { lat: this.lat, lon: this.lon, dist: this.dist, step: this.step, fov: FOV_DEG }; }
}
