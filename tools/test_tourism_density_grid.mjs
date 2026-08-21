import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gridFile = new URL('../prototype/js/tourism-density-grid.js', import.meta.url);
let gridSource;
try {
  gridSource = await readFile(gridFile, 'utf8');
} catch (_) {
  // RED는 소비자가 보게 될 실제 module-not-found 오류로 남긴다.
  await import('../prototype/js/tourism-density-grid.js');
  throw new Error('density grid source unexpectedly became readable');
}

const flowSource = await readFile(new URL('../prototype/js/tourism-flow-contract.js', import.meta.url), 'utf8');
const flowUrl = `data:text/javascript;base64,${Buffer.from(flowSource).toString('base64')}`;
const gridUrl = `data:text/javascript;base64,${Buffer.from(
  gridSource.replace("'./tourism-flow-contract.js'", `'${flowUrl}'`),
).toString('base64')}`;
const {
  DENSITY_LIMITS, buildTourismDensityGrid, densityBand, dominantPlaceForCell, scoreToHeight,
} = await import(gridUrl);

function place(id, rank, lat, lon, state = 'LIVE') {
  const ranges = {
    1: { min: 100, max: 200 },
    2: { min: 300, max: 500 },
    3: { min: 700, max: 900 },
    4: { min: 1_200, max: 1_600 },
  };
  const levels = { 1: '여유', 2: '보통', 3: '약간 붐빔', 4: '붐빔' };
  return {
    id, state, position: lat == null || lon == null ? null : { lat, lon },
    official: { level: levels[rank], rank, populationRange: ranges[rank] },
    forecast: [], provenance: { observedAt: '2026-08-20T06:35:00.000Z' },
  };
}

// 이 fixture는 한 장소를 하나의 기둥으로 되돌리거나, 장소별 분배 질량을 잃는 변경을 잡는다.
const places = [
  place('rank-1', 1, 37.5700, 126.9760),
  place('rank-2', 2, 37.5750, 126.9810),
  place('rank-3', 3, 37.5800, 126.9860),
  place('rank-4', 4, 37.5850, 126.9910),
  place('shared-a', 2, 37.5900, 126.9960),
  place('shared-b', 3, 37.5900, 126.9960),
];

const result = buildTourismDensityGrid(places, null, {
  lod: 'district', cellMeters: 95, kernelSize: 5, maxCells: 2500,
});

assert.equal(DENSITY_LIMITS.desktop, 2500);
assert.equal(DENSITY_LIMITS.mobile, 900);
assert.equal(result.sourceCount, places.length);
assert.ok(result.cells.length > places.length, 'a place must distribute into multiple rendered cells');
assert.ok(result.cells.length < places.length * 25, 'shared coordinates must merge rendered cells');
for (const item of places) {
  const allocations = result.cells.flatMap(cell => cell.allocations).filter(row => row.placeId === item.id);
  const weight = allocations.reduce((total, row) => total + row.weight, 0);
  assert.ok(Math.abs(weight - 1) < 1e-9, `${item.id}: ${weight}`);
  const midpoint = (item.official.populationRange.min + item.official.populationRange.max) / 2;
  const allocatedPopulation = allocations.reduce((total, row) => total + row.allocatedPopulation, 0);
  assert.ok(Math.abs(allocatedPopulation - midpoint) < 1e-9, `${item.id}: ${allocatedPopulation}`);
}
assert.ok(result.cells.every(cell => cell.valueMeaning === 'REGIONAL_VISUAL_ALLOCATION'));
assert.ok(result.cells.every(cell => cell.heightMeters >= 12 && cell.heightMeters <= 180));
assert.ok(scoreToHeight(0.79) < scoreToHeight(0.80));
// 비유한 입력이 Cesium box 높이까지 전파되어 DeveloperError를 만드는 회귀를 잡는다.
assert.equal(scoreToHeight(Number.NaN), 12);
assert.ok(result.cells.every(cell => !('flowDirection' in cell)));

const kernel3 = buildTourismDensityGrid([places[0]], null, { kernelSize: 3, cellMeters: 95 });
const kernel5 = buildTourismDensityGrid([places[0]], null, { kernelSize: 5, cellMeters: 95 });
assert.equal(kernel3.allocationAudit[0].contributionCount, 9);
assert.equal(kernel5.allocationAudit[0].contributionCount, 25);
assert.equal(kernel3.cells.flatMap(cell => cell.allocations).length, 9);
assert.equal(kernel5.cells.flatMap(cell => cell.allocations).length, 25);

const manyPlaces = Array.from({ length: 50 }, (_, index) => place(
  `budget-${index}`, (index % 4) + 1, 37.20 + Math.floor(index / 10) * 0.02, 126.70 + (index % 10) * 0.02,
));
const constrained = buildTourismDensityGrid(manyPlaces, null, {
  lod: 'mobile', cellMeters: 95, kernelSize: 5, maxCells: 900,
});
assert.ok(constrained.cells.length <= 900, `budget cells: ${constrained.cells.length}`);
assert.equal(constrained.aggregationAdjusted, true);
assert.ok(constrained.cellMeters > 95);

const invalid = buildTourismDensityGrid([
  place('unavailable', 4, 37.56, 126.97, 'UNAVAILABLE'),
  place('missing-coordinate', 4, null, null),
], null, { kernelSize: 3 });
assert.equal(invalid.sourceCount, 0);
assert.equal(invalid.cells.length, 0);

assert.equal(densityBand(0.00), 'relaxed');
assert.equal(densityBand(0.34), 'relaxed');
assert.equal(densityBand(0.35), 'normal');
assert.equal(densityBand(0.59), 'normal');
assert.equal(densityBand(0.60), 'crowded');
assert.equal(densityBand(0.79), 'crowded');
assert.equal(densityBand(0.80), 'very-crowded');
const orderedScores = [0.10, 0.35, 0.60, 0.80];
const orderedBands = orderedScores.map(densityBand);
const order = ['relaxed', 'normal', 'crowded', 'very-crowded'];
for (let index = 1; index < orderedScores.length; index++) {
  assert.ok(scoreToHeight(orderedScores[index]) >= scoreToHeight(orderedScores[index - 1]));
  assert.ok(order.indexOf(orderedBands[index]) >= order.indexOf(orderedBands[index - 1]));
}

// 큰 셀에 같은 장소의 kernel 행이 여러 개 합쳐져도 행 하나가 아니라 장소별 합계로 고른다.
assert.equal(typeof dominantPlaceForCell, 'function');
const dominantPlaces = new Map([
  ['summed', { id: 'summed', nameKo: '합계 우세 장소' }],
  ['single', { id: 'single', nameKo: '단일 행 우세 장소' }],
]);
const mergedCell = {
  allocations: [
    { placeId: 'summed', allocatedPopulation: 30, weight: 0.2, rank: 2 },
    { placeId: 'single', allocatedPopulation: 55, weight: 0.3, rank: 3 },
    { placeId: 'summed', allocatedPopulation: 30, weight: 0.2, rank: 2 },
  ],
};
assert.equal(dominantPlaceForCell(mergedCell, dominantPlaces)?.id, 'summed');

console.log('tourism density grid: PASS');
