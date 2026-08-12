import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* 이 저장소는 package.json의 type=module을 쓰지 않는다. 브라우저 ES module인 .js를
   Node가 CommonJS로 오해하지 않도록 원문을 data module로 불러 테스트한다. */
const source = await readFile(new URL('../prototype/js/gridmath.js', import.meta.url), 'utf8');
const gridmath = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { gridBounds, isGlobalGrid, nearestGridIndex, nearestGridValue } = gridmath;

const regional = { lat0: 20, lon0: 90, res: 1, nx: 91, ny: 36 };
assert.equal(isGlobalGrid(regional), false);
assert.deepEqual(gridBounds(regional), { west: 89.5, east: 180, south: 19.5, north: 55.5 });
assert.equal(nearestGridIndex(regional, 37.5, 127), 18 * 91 + 37);
assert.equal(nearestGridIndex(regional, 37.5, -170), null, '지역 격자는 반대편으로 감으면 안 된다');

const values = new Array(regional.nx * regional.ny).fill(null);
values[18 * 91 + 37] = 42.3;
assert.equal(nearestGridValue(regional, values, 37.5, 127), 42.3);
assert.equal(nearestGridValue(regional, values, 10, 127), null);

const globalGrid = { lat0: -80, lon0: -180, res: 5, nx: 72, ny: 33 };
assert.equal(isGlobalGrid(globalGrid), true);
assert.deepEqual(gridBounds(globalGrid), { west: -180, east: 180, south: -82.5, north: 82.5 });
assert.equal(nearestGridIndex(globalGrid, 0, 181), nearestGridIndex(globalGrid, 0, -179));

console.log('TPW grid math: PASS');
