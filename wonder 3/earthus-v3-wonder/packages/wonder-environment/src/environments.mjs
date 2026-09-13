// EARTHUS V3 WONDER — wonder-environment / 환경 카탈로그 조회 (순수)
import { haversineKm } from '../../globe-engine/src/geo.mjs';

/** 좌표 → 반경 안 가장 가까운 Wonder Environment. 없으면 null (그러면 지역 카메라 포커스만). */
export function environmentAt(lat, lon, environments) {
  let best = null;
  for (const e of environments) {
    const d = haversineKm(lat, lon, e.anchor.lat, e.anchor.lon);
    if (d <= e.radiusKm && (!best || d < best.distanceKm)) best = { environment: e, distanceKm: Math.round(d) };
  }
  return best;
}

/** 환경이 참조하는 자산 경로들(LOD 순). 초기 로드에 쓰지 않고, 진입 때만. */
export function environmentAssets(env, manifestBySlug, landmarks) {
  const lm = landmarks?.items?.[env.landmark];
  const chars = env.characters.map(slug => manifestBySlug.get(slug)).filter(Boolean);
  return {
    landmark: lm ? lm.path : null,
    thumbs: chars.map(c => c.art?.thumb).filter(Boolean),
    runtimes: chars.map(c => c.art?.character).filter(Boolean),
    scenes: chars.map(c => c.art?.scene).filter(Boolean),
  };
}
