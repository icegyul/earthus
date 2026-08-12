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

export function nearestGridValue(grid, field, lat, lon) {
  const index = nearestGridIndex(grid, lat, lon);
  if (index == null || !Array.isArray(field)) return null;
  const value = field[index];
  return value == null || !Number.isFinite(value) ? null : value;
}
