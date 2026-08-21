#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

let cycloneGeometry;
try {
  const source = fs.readFileSync(
    new URL('../prototype/js/layers/cyclone-geometry.js', import.meta.url), 'utf8');
  cycloneGeometry = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
} catch (error) {
  assert.fail(`태풍 geometry 정규화 모듈이 필요하다: ${error.code || error.message}`);
}

const { cycloneOuterRings } = cycloneGeometry;

/* 2026-08-20 GDACS LALA 응답은 날짜변경선에서 예보 원뿔을 두 조각의
   MultiPolygon으로 나눠 보낸다. 각 조각을 독립된 숫자 좌표 고리로 돌려줘야
   Cesium에 좌표 배열 자체가 들어가 NaN 원점이 생기지 않는다. */
const lalaCone = {
  type: 'MultiPolygon',
  coordinates: [
    [[
      [180, 33.3451], [179.2, 34.1], [179.7, 36.8], [180, 33.3451],
    ]],
    [[
      [-171.6, 22.55], [-180, 33.3451], [-176.4, 37.2], [-171.6, 22.55],
    ]],
  ],
};

assert.deepEqual(cycloneOuterRings(lalaCone), [
  lalaCone.coordinates[0][0],
  lalaCone.coordinates[1][0],
]);

const ordinaryCone = {
  type: 'Polygon',
  coordinates: [[
    [126, 20], [130, 24], [128, 28], [126, 20],
  ]],
};
assert.deepEqual(cycloneOuterRings(ordinaryCone), [ordinaryCone.coordinates[0]]);

const malformedCone = {
  type: 'MultiPolygon',
  coordinates: [
    [[[140, 10], [141, 11], [142, 10], [140, 10]]],
    [[[150, 10], [null, 11], [152, 10], [150, 10]]],
  ],
};
assert.deepEqual(cycloneOuterRings(malformedCone), [malformedCone.coordinates[0][0]],
  '결측 좌표가 든 고리는 모양을 추측해 고치지 말고 통째로 제외해야 한다');

console.log('cyclone geometry: 3/3 passed');
