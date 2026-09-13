// EARTHUS V3 WONDER — globe-engine / geo (순수 수학, DOM 없음)
// 좌표식은 ARCHITECTURE_LOCK §4 하나뿐이다. 다른 곳에서 재정의하지 않는다.
//   x =  cos φ · cos λ,  y = sin φ,  z = −cos φ · sin λ   (단위 구, 북극 +y, 경도 0 = +x, 동경 = −z)
// three.js SphereGeometry 의 기본 UV 는 u=(λ+180)/360, v=(φ+90)/180 로 이 식과 그대로 맞는다 (paper-texture.mjs 참조).

export const DEG = Math.PI / 180;
export const R_EARTH_KM = 6371;

/** 위도·경도(도) → 단위 구 벡터. r 로 반지름 조절. */
export function llToVec(lat, lon, r = 1) {
  const p = lat * DEG, l = lon * DEG, c = Math.cos(p);
  return { x: r * c * Math.cos(l), y: r * Math.sin(p), z: -r * c * Math.sin(l) };
}

/** 벡터 → 위도·경도(도). 원점 거리는 무시(정규화). */
export function vecToLL(v) {
  const r = Math.hypot(v.x, v.y, v.z) || 1;
  return { lat: Math.asin(Math.max(-1, Math.min(1, v.y / r))) / DEG, lon: Math.atan2(-v.z, v.x) / DEG };
}

/** 경도를 (-180, 180] 로. */
export function wrapLon(lon) {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  return l === -180 ? 180 : l;
}

export function clampLat(lat, limit = 85) { return Math.max(-limit, Math.min(limit, lat)); }

/** 대권 거리(km). */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG, dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 등장방형 텍스처 좌표. (lat 90 → y 0 위쪽, lon −180 → x 0 왼쪽, lon 180 → x w 오른쪽)
 *  일부러 감지(wrap) 않는다 — −180 을 180 으로 감으면 이음새의 점이 반대 끝으로 튀어 가로선이 생긴다. 입력은 [−180, 180]. */
export function equirect(lat, lon, w, h) {
  const l = Math.max(-180, Math.min(180, lon));
  return { x: (l + 180) / 360 * w, y: (90 - lat) / 180 * h };
}

/** 두 각도 사이의 최단 부호 차(도). a → b 로 가는 델타. */
export function shortestLonDelta(a, b) { return wrapLon(b - a); }
