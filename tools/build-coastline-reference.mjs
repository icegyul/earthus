#!/usr/bin/env node

// Data View 흰색 해안선용 정적 reference를 만든다.
//
// 전지구는 가벼운 Natural Earth 1:110m, 한국·일본을 포함한 동아시아는 1:10m을 쓴다.
// 두 해상도를 같은 지역에 중복해 그리지 않도록 110m은 동아시아 상자 밖만, 10m은
// 상자 안만 잘라 저장한다. 이 자료는 위치 판독용이며 안전·영토·해안 정밀측량에 쓰지 않는다.

import { writeFile } from 'node:fs/promises';

const COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const ROOT = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${COMMIT}/geojson`;
const DETAIL_BOX = Object.freeze({ west: 110, south: 15, east: 155, north: 55 });
const OUTPUT = new URL('../prototype/data/coastline-reference.json', import.meta.url);

const inside = ([lon, lat]) => lon >= DETAIL_BOX.west && lon <= DETAIL_BOX.east
  && lat >= DETAIL_BOX.south && lat <= DETAIL_BOX.north;

function sourceLines(doc) {
  const lines = [];
  for (const feature of doc?.features || []) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'LineString') lines.push(geometry.coordinates);
    else if (geometry?.type === 'MultiLineString') lines.push(...geometry.coordinates);
  }
  return lines;
}

function clipRuns(lines, keepInside) {
  const output = [];
  for (const line of lines) {
    let run = [];
    for (let index = 0; index < line.length; index += 1) {
      const point = line[index];
      const keep = inside(point) === keepInside;
      if (keep) {
        if (!run.length && index > 0) run.push(line[index - 1]);
        run.push(point);
      } else if (run.length) {
        run.push(point);
        if (run.length >= 2) output.push(run);
        run = [];
      }
    }
    if (run.length >= 2) output.push(run);
  }
  return output;
}

const roundLines = lines => lines.map(line => line.map(([lon, lat]) => [
  Number(lon.toFixed(4)), Number(lat.toFixed(4)),
]));

async function load(name) {
  const response = await fetch(`${ROOT}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

const [globalDoc, detailDoc] = await Promise.all([
  load('ne_110m_coastline.geojson'),
  load('ne_10m_coastline.geojson'),
]);
const global = roundLines(clipRuns(sourceLines(globalDoc), false));
const detail = roundLines(clipRuns(sourceLines(detailDoc), true));
const lineCount = global.length + detail.length;
const pointCount = [...global, ...detail].reduce((sum, line) => sum + line.length, 0);
const output = {
  schemaVersion: 'earthus.coastline-reference.v1',
  source: 'Natural Earth coastline',
  sourceUrl: 'https://www.naturalearthdata.com/downloads/',
  termsUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  license: 'Public domain',
  sourceCommit: COMMIT,
  purpose: 'Visual coastline reference only; not an official boundary or safety geometry',
  resolution: {
    global: '1:110m',
    eastAsia: '1:10m',
    eastAsiaBounds: DETAIL_BOX,
  },
  lineCount,
  pointCount,
  lines: [...global, ...detail],
};
await writeFile(OUTPUT, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`coastline reference: ${lineCount} lines, ${pointCount} points`);
