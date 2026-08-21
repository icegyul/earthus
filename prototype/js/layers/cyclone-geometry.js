// GDACS 태풍 GeoJSON을 Cesium에 넘기기 전 검증하는 순수 함수.
// 자료에 없는 좌표를 메우거나 이어 붙이지 않고, 유효한 원형만 그대로 돌려준다.

function finiteLonLat(pair) {
  return Array.isArray(pair)
    && pair.length >= 2
    && Number.isFinite(pair[0])
    && Number.isFinite(pair[1])
    && pair[0] >= -180 && pair[0] <= 180
    && pair[1] >= -90 && pair[1] <= 90;
}

function validOuterRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(finiteLonLat)) return false;
  return new Set(ring.map(([lon, lat]) => `${lon},${lat}`)).size >= 3;
}

/** Polygon/MultiPolygon에서 각 polygon의 바깥 고리만 꺼낸다. */
export function cycloneOuterRings(geometry) {
  const polygons = geometry?.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  return (Array.isArray(polygons) ? polygons : [])
    .map(polygon => polygon?.[0])
    .filter(validOuterRing);
}
