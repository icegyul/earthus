// EARTHUS v2-three — 엔진 어댑터 (정본 core/engine-runtime.js 계약 구현)
//
// 정본 EarthusEngineRuntime이 요구하는 9개 메서드:
//   mount · setManifest · setData · setTime · setFocus · setQuality · setVisibility · measure · dispose
//
// 기존 시각 모듈(sat-layer, cloud-volume, live-layers, seafloor, intel-feed, aetherus-link,
// sim-ocean, local-terrain, solar-view, sky-view)은 **재작성하지 않고 감싼다**. 그 파일들은
// 지금도 계속 수정되는 중이라, 위임으로 계약을 만족시키는 편이 충돌 없이 안전하다.
//
// 이 어댑터가 실제로 가져다주는 것:
//   1. ResourceScope가 타이머·AbortController를 소유 → dispose가 진짜로 정리한다
//      (지금 aetherus-link의 setInterval은 꺼도 계속 돈다)
//   2. thermalBudget()의 입자·볼륨 배율이 각 레이어까지 전달된다
//   3. measure()로 엔진별 실제 자원량(드로우콜·삼각형·객체 수)을 볼 수 있다

import { ENGINE_CLASS } from '../../js/earthus2/v02/core/constants.js';

export { ENGINE_CLASS };

const countGroup = (group) => {
  if (!group) return { objects: 0, points: 0 };
  let objects = 0;
  let points = 0;
  group.traverse((o) => {
    objects += 1;
    if (o.isPoints && o.geometry?.attributes?.position) points += o.geometry.attributes.position.count;
  });
  return { objects, points };
};

// ---------------------------------------------------------------------------
// 지구 렌더러 — 상시 컨텍스트 엔진. 교체되지 않으므로 dispose 하지 않는다.
// ---------------------------------------------------------------------------
export function globeAdapter({ renderer, basePixelRatio, uniforms }) {
  let quality = { scale: 1 };
  return {
    async mount() { /* 이미 구성된 렌더러를 인계받는다 */ },
    setManifest() {},
    setData() {},
    setTime() {},
    setFocus() {},
    setQuality(q) {
      quality = { ...quality, ...q };
      if (Number.isFinite(q?.scale)) {
        renderer.setPixelRatio(Math.max(0.5, basePixelRatio * q.scale));
      }
    },
    setVisibility() { /* 지구는 항상 보인다 */ },
    measure() {
      const info = renderer.info;
      return {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        pixelRatio: Number(renderer.getPixelRatio().toFixed(2)),
        exagger: uniforms?.uExagger?.value ?? null,
        qualityScale: quality.scale ?? 1,
      };
    },
    async dispose() { /* 상시 엔진 — 앱 수명과 같다 */ },
  };
}

// ---------------------------------------------------------------------------
// 지구 위 추가 레이어 (마커·위성·볼륨) — 감싸서 자원·품질·측정만 계약에 태운다.
// spec: { group, isOn, hide, show, disposeAll, applyBudget, adoptTimers }
// ---------------------------------------------------------------------------
export function overlayAdapter(spec) {
  let scope = null;
  let budget = null;
  return {
    async mount(ctx) {
      scope = ctx?.resourceScope ?? null;
      // 모듈이 스스로 만든 타이머를 스코프에 넘긴다 → dispose가 실제로 멈춘다
      if (scope && typeof spec.adoptTimers === 'function') spec.adoptTimers(scope);
    },
    setManifest() {},
    setData(d) { if (typeof spec.setData === 'function') spec.setData(d); },
    setTime(t) { if (typeof spec.setTime === 'function') spec.setTime(t); },
    setFocus(f) { if (typeof spec.setFocus === 'function') spec.setFocus(f); },
    setQuality(q) {
      if (q && q.budget) budget = q.budget;
      if (budget && typeof spec.applyBudget === 'function') spec.applyBudget(budget);
      if (scope && budget) scope.setMetric('particleScale', budget.particleScale);
    },
    setVisibility(v) {
      if (v && typeof spec.show === 'function') spec.show();
      if (!v && typeof spec.hide === 'function') spec.hide();
    },
    measure() {
      const g = typeof spec.group === 'function' ? spec.group() : spec.group;
      return {
        on: typeof spec.isOn === 'function' ? !!spec.isOn() : false,
        ...countGroup(g),
        ...(budget ? { particleScale: budget.particleScale } : {}),
      };
    },
    async dispose() {
      if (typeof spec.disposeAll === 'function') await spec.disposeAll();
      if (scope && !scope.disposed) scope.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// 전체화면 인수 뷰 (시나리오·지역 3D·태양계·사진관·지도)
// 이들은 지금도 서로 배타적이다 — 정본 DYNAMIC 규칙("주 엔진은 항상 1개")과 일치한다.
// ---------------------------------------------------------------------------
export function takeoverAdapter({ view, label }) {
  let scope = null;
  return {
    async mount(ctx) { scope = ctx?.resourceScope ?? null; },
    setManifest() {},
    setData() {},
    setTime() {},
    setFocus() {},
    setQuality(q) { if (scope && q?.budget) scope.setMetric('fpsTarget', q.budget.fps); },
    setVisibility(v) { if (!v && view && view.active && typeof view.close === 'function') view.close(); },
    measure() { return { label, active: !!(view && view.active) }; },
    async dispose() {
      if (view && view.active && typeof view.close === 'function') view.close();
      if (scope && !scope.disposed) scope.dispose();
    },
  };
}
