// EARTHUS V3 WONDER — globe-engine / camera = Rotation State (순수 상태기, DOM·three 없음)
//
// 회전 규칙의 원본은 EARTHUS V2 `prototype/v2-three/js/main.js` class OrbitCam (PD ROTATION RULE LOCK 2026-09-13).
// V2 에서 확인한 규칙을 그대로 옮긴다 — 새 회전 알고리즘을 만들지 않는다:
//   · dragSpeed: 1px 끌면 손가락 아래 지점이 정확히 1px 따라오는 각 = 2·tan(fov/2)·(targetDist−1)/H  (rad/px)
//   · 속도 상한 없음 · 속도 관성 없음. 목표(target)를 두고 매 프레임 k = 1−exp(−dt·8.0) 로 따라간다(프로그램 이동은 3.2 = glide).
//   · 위도(pitch) 한계 ±(π/2 − 0.05) rad = ±87.135°. 경도(yaw)는 무한 — 감지 않는다(pose() 에서만 −180..180 으로 접는다).
//   · 카메라는 지구 중심을 본다(up = +y). 좌표 규약은 ARCHITECTURE_LOCK §4 (V2 와 축 배치는 다르지만 회전 의미는 같다).
// V3 고유(유지): 줌 3단 잠금 — 휠·버튼·핀치는 단(step)만 바꾸고 이동은 트윈(0.9s ease). 지구 목표 지름(Master Directive §2.2).
// 구조: Globe Interaction(input.mjs) → Rotation State(이 파일) → Paper Earth Visual(earth.mjs, pose() 만 읽는다).

import { wrapLon, shortestLonDelta } from './geo.mjs';

export const FOV_DEG = 40;
export const ZOOM_STEPS = 3;                    // 0 = 세계, 1 = 지역 접근, 2 = 지역
export const ZOOM_FACTORS = [1, 1.65, 2.7];     // 단계별 지구 지름 배수 (단계 0 지름 × 배수)
export const PITCH_LIMIT_DEG = (Math.PI / 2 - 0.05) * 180 / Math.PI;   // V2: lim = π/2 − 0.05 → 87.135°
export const DAMP_FOLLOW = 8.0;                 // V2 update(): 드래그·줌 따라가기 감쇠
export const DAMP_GLIDE = 3.2;                  // V2 update(): glide > 0 (프로그램 이동) 감쇠
export const MIN_ALT_R = 0.0006;                // V2 dragSpeed: 지표까지 남은 거리 하한(지구반경 배수)
export const MIN_DIST = 1.12;                   // 구 안으로 들어가지 않는다 (반지름 1)
const SETTLE_DEG = 1e-3, SETTLE_DIST = 1e-4;    // 이 안이면 목표에 붙인다(animating 종료)
const clampPitch = lat => Math.max(-PITCH_LIMIT_DEG, Math.min(PITCH_LIMIT_DEG, lat));

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

/** V2 dragSpeed 를 그대로 — rad/px. 화면 높이와 화각, 목표 거리(지표까지 남은 거리)로 정해진다. */
export function dragSpeedRad(targetDist, viewH, fovDeg = FOV_DEG) {
  const altR = Math.max(targetDist - 1.0, MIN_ALT_R);
  return (2 * Math.tan((fovDeg * Math.PI) / 360) * altR) / Math.max(1, viewH);
}

const easeInOut = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * 회전 상태기. 입력(drag·zoom)은 목표만 바꾸고, 프레임마다 tick(dt) 가 V2 방식으로 따라간다. 렌더러는 `pose()` 만 읽는다.
 * 필드: lat/lon/dist = 지금 보이는 값, targetLat/targetLon/targetDist = 손·줌이 정한 목표. lon 과 targetLon 은 감지 않는다.
 */
export class OrbitCamera {
  constructor({ lat = 20, lon = 127, viewW = 1440, viewH = 900, reducedMotion = false } = {}) {
    this.lat = lat; this.lon = lon; this.targetLat = lat; this.targetLon = lon;
    this.step = 0;
    this.viewW = viewW; this.viewH = viewH;
    this.dists = zoomDistances(viewW, viewH);
    this.dist = this.targetDist = this.dists[0];
    this.tween = null;                          // 프로그램 이동 {from, to, t, dur} (줌 단·지역 접근)
    this.glide = 0;                             // V2: >0 이면 느린 감쇠(3.2)
    this.reducedMotion = reducedMotion;
    this.dragging = false;
  }

  /** 뷰포트가 바뀌면 단계 거리를 다시 계산하고 현재 단계 거리로 맞춘다(이동 연출 없음). */
  resize(viewW, viewH) {
    this.viewW = viewW; this.viewH = viewH;
    this.dists = zoomDistances(viewW, viewH);
    if (this.tween) this.tween.to.dist = this.dists[this.step];
    else this.dist = this.targetDist = this.dists[this.step];
  }

  /** 드래그 1px 이 몇 도인가 — V2 dragSpeed (°/px). 상한 없음. */
  degPerPx() { return dragSpeedRad(this.targetDist, this.viewH) * 180 / Math.PI; }

  /** 손이 닿았다. V2 pointerdown 처럼 목표를 되돌리지 않는다 — 따라가던 목표 위에 드래그가 더해진다.
   *  프로그램 트윈(줌 단·지역 접근) 중이면 트윈을 따라가기 목표로 바꾼다(줌은 마저 도착, 회전은 손이 가진다). */
  beginDrag() {
    this.dragging = true; this.glide = 0;
    if (this.tween) { const to = this.tween.to; this.targetLat = to.lat; this.targetLon = to.lon; this.targetDist = to.dist; this.tween = null; }
  }

  /** 드래그 이동(px). V2: targetYaw −= dx·speed, targetPitch += dy·speed, pitch 는 ±(π/2−0.05). 상한·관성 없음. */
  drag(dx, dy) {
    const k = this.degPerPx();
    this.targetLon -= dx * k;
    this.targetLat = clampPitch(this.targetLat + dy * k);
  }

  endDrag() { this.dragging = false; }

  /** 현재 값과 목표를 함께 미는 회전(첫 화면 자동 회전용) — 따라가기 지연을 만들지 않는다. */
  nudgeLon(deg) { this.lon += deg; this.targetLon += deg; }

  /** 줌 단계를 잠근 범위 안에서 바꾼다. 트윈으로 이동(움직임 줄이기면 즉시). @returns 실제로 바뀌었는가 */
  setZoomStep(step, { lat, lon } = {}, { durMs = 900 } = {}) {
    const s = Math.max(0, Math.min(ZOOM_STEPS - 1, Math.round(step)));
    const toLat = clampPitch(lat ?? this.targetLat);
    const toLon = lon != null ? this.lon + shortestLonDelta(wrapLon(this.lon), lon) : this.targetLon;
    const to = { lat: toLat, lon: toLon, dist: this.dists[s] };
    const changed = s !== this.step || lat != null || lon != null;
    this.step = s; this.glide = 0;
    if (this.reducedMotion || durMs <= 0) {
      this.lat = this.targetLat = to.lat; this.lon = this.targetLon = to.lon; this.dist = this.targetDist = to.dist; this.tween = null;
      return changed;
    }
    this.tween = { from: { lat: this.lat, lon: this.lon, dist: this.dist }, to, t: 0, dur: durMs / 1000 };
    return changed;
  }

  zoomIn() { return this.setZoomStep(this.step + 1); }
  zoomOut() { return this.setZoomStep(this.step - 1); }

  /** 프레임 진행(dt 초). 트윈이 있으면 트윈, 없으면 V2 update(): 목표를 k = 1−exp(−dt·damp) 로 따라간다. */
  tick(dt) {
    if (this.tween) {
      const tw = this.tween; tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = easeInOut(tw.t);
      this.lat = tw.from.lat + (tw.to.lat - tw.from.lat) * e;
      this.lon = tw.from.lon + (tw.to.lon - tw.from.lon) * e;
      this.dist = tw.from.dist + (tw.to.dist - tw.from.dist) * e;
      this.targetLat = this.lat; this.targetLon = this.lon; this.targetDist = this.dist;
      if (tw.t >= 1) this.tween = null;
      return;
    }
    const damp = this.glide > 0 ? DAMP_GLIDE : DAMP_FOLLOW;
    this.glide = Math.max(0, this.glide - dt);
    const k = this.reducedMotion ? 1 : 1.0 - Math.exp(-dt * damp);
    this.lat += (this.targetLat - this.lat) * k;
    this.lon += (this.targetLon - this.lon) * k;
    this.dist += (this.targetDist - this.dist) * k;
    if (!this.dragging && Math.abs(this.targetLat - this.lat) < SETTLE_DEG && Math.abs(this.targetLon - this.lon) < SETTLE_DEG && Math.abs(this.targetDist - this.dist) < SETTLE_DIST) {
      this.lat = this.targetLat; this.lon = this.targetLon; this.dist = this.targetDist;
    }
  }

  get animating() {
    return !!this.tween || Math.abs(this.targetLat - this.lat) >= SETTLE_DEG || Math.abs(this.targetLon - this.lon) >= SETTLE_DEG || Math.abs(this.targetDist - this.dist) >= SETTLE_DIST;
  }

  /** 렌더러가 읽는 자세. 경도는 여기서만 접는다. */
  pose() { return { lat: this.lat, lon: wrapLon(this.lon), dist: this.dist, step: this.step, fov: FOV_DEG }; }
}
