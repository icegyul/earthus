#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const importSource = async (url, transform = source => source) => {
  const source = transform(await readFile(url, 'utf8'));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

const dataUrl = new URL('../prototype/data/korea-admin-reference.json', import.meta.url).href;
const { koreaAdminAt } = await importSource(
  new URL('../prototype/js/korea-admin-reference.js', import.meta.url),
  source => source.replace(
    /const DATA_URL = new URL\([^;]+;/,
    `const DATA_URL = ${JSON.stringify(dataUrl)};`,
  ),
);

globalThis.fetch = async input => {
  const data = await readFile(new URL(String(input)));
  return new Response(data, { status: 200, headers: { 'content-type': 'application/json' } });
};

const cases = [
  [36.327, 128.236, '경상북도', '구미시'],       // 신고 좌표 · 옥성면
  [37.5665, 126.978, '서울특별시', '종로구'],    // 광화문·중구 경계 인접 좌표
  [35.1796, 129.0756, '부산광역시', '연제구'],  // 부산시청
  [35.1601, 126.8516, '광주광역시', '서구'],    // 광주시청
  [33.4996, 126.5312, '제주특별자치도', '제주시'],
  [36.2428, 128.5728, '대구광역시', '군위군'],  // 2023년 대구 편입 반영
];

for (const [lat, lon, regionKo, nameKo] of cases) {
  const result = await koreaAdminAt(lat, lon);
  assert.equal(result?.regionKo, regionKo, `${lat},${lon} 시·도`);
  assert.equal(result?.nameKo, nameKo, `${lat},${lon} 시·군·구`);
  assert.equal(result?.boundaryYear, 2020, `${lat},${lon} boundary year`);
}

assert.equal(await koreaAdminAt(35.452, 133.362), null, '일본 좌표에 한국 행정구역을 붙였다');
assert.equal(await koreaAdminAt(37.0, 130.5), null, '동해 바다에 한국 행정구역을 붙였다');

const placeSource = await readFile(new URL('../prototype/js/place.js', import.meta.url), 'utf8');
assert.match(placeSource, /boundaryCountry\?\.code === 'KR' \? await koreaAdminAt\(lat, lon\) : null/);
assert.match(placeSource, /geoBoundaries.*시·군·구 경계 참조/);

console.log(`PASS: ${cases.length} Korean coordinates use municipality polygons; 36.327,128.236 is Gumi-si`);
