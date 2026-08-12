// 연속 격자에서 등치선을 만드는 순수 함수.
//
// ⚠️ 점 관측을 면으로 만들 때 쓰지 않는다. 네 귀퉁이가 모두 있는 **연속 격자**만 받는다.
// ⚠️ 값 하나라도 결측인 칸은 통째로 건너뛴다. 이웃 값으로 메우면 없던 선이 생긴다.
// ⚠️ 전지구 격자의 마지막 열은 날짜변경선(+180°)까지만 잇는다. -180°까지 긴 직선을
//    그리지 않도록 좌표와 배열 인덱스를 따로 계산한다.

import { isGlobalGrid } from './gridmath.js';

const CASES = {
  1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
  6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]],
  11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
  5: null, 10: null,
};

const finite = value => Number.isFinite(value);
const pointKey = ([lon, lat]) => `${Math.round(lon * 1e6)},${Math.round(lat * 1e6)}`;

function crossing(level, v1, v2, p1, p2) {
  const denominator = v2 - v1;
  const raw = Math.abs(denominator) < 1e-12 ? 0.5 : (level - v1) / denominator;
  const t = Math.max(0, Math.min(1, raw));
  return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
}

/**
 * 마칭 스퀘어 선분.
 * @returns {{segments:number[][][], cells:number, missingCells:number}}
 */
export function contourSegments(grid, field, level) {
  if (!grid || !Array.isArray(field) || !finite(level)
      || !Number.isInteger(grid.nx) || !Number.isInteger(grid.ny)
      || !finite(grid.lat0) || !finite(grid.lon0) || !finite(grid.res)
      || grid.nx < 2 || grid.ny < 2) {
    return { segments: [], cells: 0, missingCells: 0 };
  }

  const global = isGlobalGrid(grid);
  const xCells = global ? grid.nx : grid.nx - 1;
  const segments = [];
  let cells = 0, missingCells = 0;
  const at = (x, y) => field[y * grid.nx + x];

  for (let y = 0; y < grid.ny - 1; y++) {
    for (let x = 0; x < xCells; x++) {
      cells++;
      const x1 = global ? (x + 1) % grid.nx : x + 1;
      const values = [at(x, y + 1), at(x1, y + 1), at(x1, y), at(x, y)];
      if (!values.every(finite)) { missingCells++; continue; }

      const lonA = grid.lon0 + x * grid.res;
      /* 마지막 전지구 칸의 배열 인덱스는 0으로 감기지만 지도 좌표는 +180°다. */
      const lonB = lonA + grid.res;
      const latA = grid.lat0 + y * grid.res;
      const latB = latA + grid.res;
      const points = [
        [lonA, latB], [lonB, latB], [lonB, latA], [lonA, latA],
      ];

      let index = 0;
      for (let i = 0; i < 4; i++) if (values[i] >= level) index |= (1 << i);
      if (index === 0 || index === 15) continue;
      const edges = [
        crossing(level, values[0], values[1], points[0], points[1]),
        crossing(level, values[1], values[2], points[1], points[2]),
        crossing(level, values[2], values[3], points[2], points[3]),
        crossing(level, values[3], values[0], points[3], points[0]),
      ];

      let pairs = CASES[index];
      /* 안장점(5·10)은 네 값의 평균으로 연결 방향을 정한다. 임의 방향은 금지한다. */
      if (pairs === null) {
        const centerHigh = values.reduce((sum, value) => sum + value, 0) / 4 >= level;
        pairs = index === 5
          ? (centerHigh ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]])
          : (centerHigh ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]);
      }
      pairs.forEach(([a, b]) => segments.push([edges[a], edges[b]]));
    }
  }
  return { segments, cells, missingCells };
}

/** 짧은 마칭 스퀘어 선분을 연결된 선 하나로 묶어 Cesium 엔티티 수를 줄인다. */
export function stitchSegments(segments) {
  const clean = (segments || []).filter(segment => Array.isArray(segment)
    && segment.length === 2 && segment[0].every(finite) && segment[1].every(finite)
    && pointKey(segment[0]) !== pointKey(segment[1]));
  const connected = new Map();
  clean.forEach((segment, index) => segment.forEach(point => {
    const key = pointKey(point);
    if (!connected.has(key)) connected.set(key, []);
    connected.get(key).push(index);
  }));

  const used = new Set();
  const takeNext = point => (connected.get(pointKey(point)) || []).find(index => !used.has(index));
  const extend = (path, atEnd) => {
    let guard = clean.length + 1;
    while (guard-- > 0) {
      const point = atEnd ? path[path.length - 1] : path[0];
      const index = takeNext(point);
      if (index == null) break;
      used.add(index);
      const [a, b] = clean[index];
      const next = pointKey(a) === pointKey(point) ? b : a;
      if (atEnd) path.push(next); else path.unshift(next);
      if (path.length > 3 && pointKey(path[0]) === pointKey(path[path.length - 1])) break;
    }
  };

  const paths = [];
  clean.forEach((segment, index) => {
    if (used.has(index)) return;
    used.add(index);
    const path = [segment[0], segment[1]];
    extend(path, true);
    extend(path, false);
    paths.push(path);
  });
  return paths;
}

/** 위경도 좌표계에서 라벨 우선순위를 정하기 위한 상대 길이. 거리 주장에는 쓰지 않는다. */
export function contourPathLength(path) {
  let total = 0;
  for (let i = 1; i < (path?.length || 0); i++) {
    const meanLat = (path[i - 1][1] + path[i][1]) * Math.PI / 360;
    const dx = (path[i][0] - path[i - 1][0]) * Math.max(0.1, Math.cos(meanLat));
    const dy = path[i][1] - path[i - 1][1];
    total += Math.hypot(dx, dy);
  }
  return total;
}

/** 선의 누적 길이 절반 지점. 단순 배열 중간보다 긴 선의 중앙을 안정적으로 고른다. */
export function contourPathMidpoint(path) {
  if (!path?.length) return null;
  const total = contourPathLength(path);
  if (total <= 0) return path[Math.floor(path.length / 2)];
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const meanLat = (a[1] + b[1]) * Math.PI / 360;
    const length = Math.hypot((b[0] - a[0]) * Math.max(0.1, Math.cos(meanLat)), b[1] - a[1]);
    if (walked + length >= total / 2) {
      const t = length ? (total / 2 - walked) / length : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += length;
  }
  return path[path.length - 1];
}
