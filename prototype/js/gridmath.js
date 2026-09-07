// 격자 좌표 계산 — 전지구 격자와 지역 격자를 같은 공식으로 다루기 위한 순수 함수.
// DOM/Cesium 의존성이 없어서 Node 테스트에서도 그대로 검증한다.

export function isGlobalGrid(grid) {
  if (!grid || !Number.isFinite(grid.nx) || !Number.isFinite(grid.res)) return false;
  return grid.nx * grid.res >= 359;
}

export function gridBounds(grid) {
  if (!grid || !Number.isFinite(grid.lat0) || !Number.isFinite(grid.lon0)
      || !Number.isFinite(grid.nx) || !Number.isFinite(grid.ny)
      || !Number.isFinite(grid.res) || grid.nx < 1 || grid.ny < 1) return null;
  const half = grid.res / 2;
  return {
    west: isGlobalGrid(grid) ? -180 : Math.max(-180, grid.lon0 - half),
    east: isGlobalGrid(grid) ? 180 : Math.min(180, grid.lon0 + (grid.nx - 1) * grid.res + half),
    south: Math.max(-90, grid.lat0 - half),
    north: Math.min(90, grid.lat0 + (grid.ny - 1) * grid.res + half),
  };
}

export function nearestGridIndex(grid, lat, lon) {
  if (!grid || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const iy = Math.round((lat - grid.lat0) / grid.res);
  if (iy < 0 || iy >= grid.ny) return null;
  let ix = Math.round((lon - grid.lon0) / grid.res);
  if (isGlobalGrid(grid)) ix = ((ix % grid.nx) + grid.nx) % grid.nx;
  else if (ix < 0 || ix >= grid.nx) return null;
  return iy * grid.nx + ix;
}

/** 가장 가까운 원격자점이 **어디에 있는지**까지 돌려준다.
 *  ⚠️ 5° 격자에서는 이 점이 도시에서 300km 넘게 떨어질 수 있다. 서울(37.57°N)의
 *     가장 가까운 점은 40°N·125°E — 서해 북부다. 그 값을 "서울"이라고 부르면
 *     실제 서울 관측(57%)과 다른 숫자(87%)가 서울 이름을 달고 나온다(실측).
 *  @returns {{index:number, lat:number, lon:number, km:number}|null} */
export function nearestGridPoint(grid, lat, lon) {
  const index = nearestGridIndex(grid, lat, lon);
  if (index == null) return null;
  const iy = Math.floor(index / grid.nx), ix = index % grid.nx;
  const pointLat = grid.lat0 + iy * grid.res;
  let pointLon = grid.lon0 + ix * grid.res;
  // 전지구 격자는 감기므로 -180~180 으로 되돌린 뒤 가까운 쪽으로 재는다.
  pointLon = ((pointLon + 540) % 360) - 180;
  let dLon = pointLon - lon;
  if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;
  const meanLat = (pointLat + lat) * Math.PI / 360;
  const km = Math.hypot(dLon * Math.cos(meanLat), pointLat - lat) * 111.32;
  return { index, lat: pointLat, lon: pointLon, km };
}

export function nearestGridValue(grid, field, lat, lon) {
  const index = nearestGridIndex(grid, lat, lon);
  if (index == null || !Array.isArray(field)) return null;
  const value = field[index];
  return value == null || !Number.isFinite(value) ? null : value;
}
