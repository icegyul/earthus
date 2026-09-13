// EARTHUS V3 WONDER — 배경 선택기 (PHASE 0)
// 캐릭터 좌표에서 가장 가까운 지리 배경을 고른다. 반경 밖이면 fallback. 한 번에 배경 하나만 고른다
// (BACKGROUND_ASSET_SPEC: "loaded by region/environment, never all at first paint").

const R_EARTH_KM = 6371;
const rad = d => d * Math.PI / 180;

/** 두 좌표 사이 대권 거리(km). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @param {{radius_km:number, fallback:string, backgrounds:{id:string, geo?:{lat:number,lon:number}, radius_km?:number, generic?:boolean}[]}} regions
 * @param {number} lat @param {number} lon
 * @returns {{ id: string, distance_km: number|null, reason: 'nearest'|'fallback' }}
 */
export function resolveBackground(regions, lat, lon) {
  let best = null;
  for (const b of regions.backgrounds) {
    if (!b.geo || b.generic) continue;
    const d = haversineKm(lat, lon, b.geo.lat, b.geo.lon);
    const limit = b.radius_km ?? regions.radius_km;
    if (d > limit) continue;
    if (!best || d < best.distance_km) best = { id: b.id, distance_km: Math.round(d), reason: 'nearest' };
  }
  return best ?? { id: regions.fallback, distance_km: null, reason: 'fallback' };
}
