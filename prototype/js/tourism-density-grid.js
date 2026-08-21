// 서울시 공식 혼잡 등급을 지역 표시용 밀도 grid로만 분배한다.
// 셀의 값은 실제 구역 면적·수용력·이동량이 아니라, 장소별 공식 추정 인구 범위를 보존한 시각 배분값이다.

import { resolveTourismEvidence } from './tourism-flow-contract.js';

export const DENSITY_LIMITS = Object.freeze({ desktop: 2500, mobile: 900 });

const EARTH_RADIUS_METERS = 6_378_137;
const BAND_COLORS = Object.freeze({
  relaxed: '#f5d58a', normal: '#f7aa45', crowded: '#ef672e', 'very-crowded': '#d93222',
});
const RANK_BANDS = Object.freeze({
  1: Object.freeze([0.00, 0.34]),
  2: Object.freeze([0.35, 0.59]),
  3: Object.freeze([0.60, 0.79]),
  4: Object.freeze([0.80, 1.00]),
});

export function scoreToHeight(score) {
  const value = Number(score);
  const s = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return 12 + 168 * (s ** 0.70);
}

export function densityBand(score) {
  const value = Math.min(1, Math.max(0, Number(score)));
  if (value < 0.35) return 'relaxed';
  if (value < 0.60) return 'normal';
  if (value < 0.80) return 'crowded';
  return 'very-crowded';
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mercatorFromDegrees(lat, lon) {
  const rawLatitude = finiteNumber(lat);
  const longitude = finiteNumber(lon);
  if (rawLatitude == null || longitude == null) return null;
  const latitude = Math.min(85, Math.max(-85, rawLatitude));
  const latRadians = latitude * Math.PI / 180;
  return Object.freeze({
    x: EARTH_RADIUS_METERS * longitude * Math.PI / 180,
    y: EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latRadians / 2)),
  });
}

function degreesFromMercator(x, y) {
  const lon = x / EARTH_RADIUS_METERS * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI;
  return Object.freeze({ lat, lon });
}

function kernel(size) {
  const radius = (size - 1) / 2;
  const rows = [];
  let total = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      // 중심의 기여도가 가장 크되, 유한 kernel의 모든 위치는 양수다.
      const rawWeight = (radius + 1 - Math.abs(x)) * (radius + 1 - Math.abs(y));
      rows.push({ x, y, rawWeight });
      total += rawWeight;
    }
  }
  return rows.map(row => Object.freeze({ ...row, weight: row.rawWeight / total }));
}

function scoreForKernel(rank, x, y, size) {
  const [minimum, maximum] = RANK_BANDS[rank];
  const radius = (size - 1) / 2;
  const edgeRatio = radius === 0 ? 0 : Math.max(Math.abs(x), Math.abs(y)) / radius;
  // 각 기관 등급의 닫힌 score 범위 안에서만 중심/가장자리 차이를 낸다.
  return maximum - (maximum - minimum) * edgeRatio;
}

function midpoint(populationRange) {
  const minimum = finiteNumber(populationRange?.min);
  const maximum = finiteNumber(populationRange?.max);
  return minimum == null || maximum == null ? null : (minimum + maximum) / 2;
}

function resolveOptions(options) {
  const lod = options?.lod === 'mobile' ? 'mobile' : 'district';
  const requestedCellMeters = Math.max(1, finiteNumber(options?.cellMeters) ?? 95);
  const requestedKernelSize = Number(options?.kernelSize ?? 5);
  const kernelSize = requestedKernelSize === 3 ? 3 : 5;
  const maxCells = Math.max(1, Math.floor(finiteNumber(options?.maxCells) ??
    (lod === 'mobile' ? DENSITY_LIMITS.mobile : DENSITY_LIMITS.desktop)));
  return Object.freeze({ lod, requestedCellMeters, kernelSize, maxCells });
}

function buildContributions(places, at, kernelSize, cellMeters) {
  const contributions = [];
  const audit = [];
  for (const place of Array.isArray(places) ? places : []) {
    const evidence = resolveTourismEvidence(place, at);
    const origin = mercatorFromDegrees(place?.position?.lat, place?.position?.lon);
    const population = midpoint(evidence?.populationRange);
    if (!evidence || !origin || population == null || !RANK_BANDS[evidence.rank]) continue;
    const rows = kernel(kernelSize);
    const placeRows = rows.map(row => Object.freeze({
      placeId: place.id,
      x: origin.x + row.x * cellMeters,
      y: origin.y + row.y * cellMeters,
      weight: row.weight,
      allocatedPopulation: population * row.weight,
      score: scoreForKernel(evidence.rank, row.x, row.y, kernelSize),
      state: place.state,
      sourceType: evidence.sourceType,
      at: evidence.at,
      rank: evidence.rank,
      level: evidence.level,
    }));
    contributions.push(...placeRows);
    audit.push(Object.freeze({
      placeId: place.id,
      contributionCount: placeRows.length,
      weight: placeRows.reduce((total, row) => total + row.weight, 0),
      allocatedPopulation: placeRows.reduce((total, row) => total + row.allocatedPopulation, 0),
      sourceType: evidence.sourceType,
      at: evidence.at,
    }));
  }
  return Object.freeze({ contributions: Object.freeze(contributions), audit: Object.freeze(audit) });
}

function aggregateCells(contributions, cellMeters) {
  const cellsByKey = new Map();
  for (const contribution of contributions) {
    const xIndex = Math.round(contribution.x / cellMeters);
    const yIndex = Math.round(contribution.y / cellMeters);
    const key = `${xIndex}:${yIndex}`;
    const cell = cellsByKey.get(key) || { key, xIndex, yIndex, allocations: [] };
    cell.allocations.push(contribution);
    cellsByKey.set(key, cell);
  }
  return Object.freeze([...cellsByKey.values()].map(cell => {
    const allocationWeight = cell.allocations.reduce((total, row) => total + row.weight, 0);
    const score = allocationWeight > 0
      ? cell.allocations.reduce((total, row) => total + row.score * row.weight, 0) / allocationWeight : 0;
    const position = degreesFromMercator(cell.xIndex * cellMeters, cell.yIndex * cellMeters);
    const allStale = cell.allocations.length > 0 && cell.allocations.every(row => row.state === 'STALE');
    const band = densityBand(score);
    return Object.freeze({
      id: `tourism-density:${cell.key}`,
      lat: position.lat,
      lon: position.lon,
      cellMeters,
      valueMeaning: 'REGIONAL_VISUAL_ALLOCATION',
      allocationWeight,
      allocatedPopulation: cell.allocations.reduce((total, row) => total + row.allocatedPopulation, 0),
      score,
      band,
      color: BAND_COLORS[band],
      heightMeters: scoreToHeight(score),
      alpha: allStale ? 0.66 : 0.9,
      allocations: Object.freeze(cell.allocations),
    });
  }));
}

export function dominantPlaceForCell(cell, placesById) {
  const totals = new Map();
  for (const allocation of Array.isArray(cell?.allocations) ? cell.allocations : []) {
    const placeId = allocation?.placeId;
    if (!placeId || !placesById?.has(placeId)) continue;
    const row = totals.get(placeId) || {
      placeId, allocatedPopulation: 0, weight: 0, rank: 0,
    };
    row.allocatedPopulation += finiteNumber(allocation.allocatedPopulation) ?? 0;
    row.weight += finiteNumber(allocation.weight) ?? 0;
    row.rank = Math.max(row.rank, finiteNumber(allocation.rank) ?? 0);
    totals.set(placeId, row);
  }
  const dominant = [...totals.values()].sort((left, right) =>
    right.allocatedPopulation - left.allocatedPopulation
      || right.weight - left.weight
      || right.rank - left.rank
      || String(left.placeId).localeCompare(String(right.placeId)),
  )[0];
  return placesById?.get(dominant?.placeId) || null;
}

export function buildTourismDensityGrid(places, at = null, options = {}) {
  const settings = resolveOptions(options);
  const built = buildContributions(places, at, settings.kernelSize, settings.requestedCellMeters);
  let cellMeters = settings.requestedCellMeters;
  let cells = aggregateCells(built.contributions, cellMeters);
  // 원래 kernel의 실제 위치를 더 큰 공유 grid에 재집계한다. 배분 행은 보존되므로 질량은 변하지 않는다.
  while (cells.length > settings.maxCells && cellMeters < 100_000_000) {
    cellMeters *= 2;
    cells = aggregateCells(built.contributions, cellMeters);
  }
  return Object.freeze({
    sourceCount: built.audit.length,
    cells,
    allocationAudit: built.audit,
    lod: settings.lod,
    kernelSize: settings.kernelSize,
    requestedCellMeters: settings.requestedCellMeters,
    cellMeters,
    maxCells: settings.maxCells,
    aggregationAdjusted: cellMeters !== settings.requestedCellMeters,
  });
}
