// PB2002 판 경계선(Bird 2003) → EARTHUS 겹쳐보기용 압축 선분
//
// 왜: 지진을 25년 쌓으면 판 경계가 저절로 드러난다. 그 위에 지질학자가 그린 경계선을
//     겹치면 "정말 같은 자리인가"를 눈으로 확인할 수 있다.
//
// 출처: Bird, P. (2003) An updated digital model of plate boundaries,
//       Geochem. Geophys. Geosyst. 4(3), 1027, doi:10.1029/2001GC000252.
//       GIS 변환: Hugo Ahlenius / Nordpil (fraxen/tectonicplates), ODC-BY 1.0.
// 값 보존: 좌표는 소수 둘째 자리(≈1km)로만 줄인다. 선 자체는 원본 그대로.
//
// 사용: node tools/build-plates.mjs

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json';
const OUT = join(ROOT, 'prototype', 'v2-three', 'quakes', 'plates.json');

const res = await fetch(SRC);
if (!res.ok) throw new Error(`판 경계 원본을 받지 못했습니다: ${res.status}`);
const gj = await res.json();

const lines = [];
let pts = 0;
for (const f of gj.features || []) {
  const g = f.geometry;
  if (!g) continue;
  const parts = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
  for (const part of parts) {
    const flat = [];
    let prevLon = null;
    for (const [lon, lat] of part) {
      // ±180 경계를 넘는 선은 지구 반대편을 가로지르는 가짜 선분이 되므로 끊는다
      if (prevLon !== null && Math.abs(lon - prevLon) > 180) {
        if (flat.length >= 4) { lines.push(flat.slice()); pts += flat.length / 2; }
        flat.length = 0;
      }
      flat.push(Math.round(lon * 100) / 100, Math.round(lat * 100) / 100);
      prevLon = lon;
    }
    if (flat.length >= 4) { lines.push(flat); pts += flat.length / 2; }
  }
}

const out = {
  schema: 'earthus.plates.v1',
  source: 'Bird, P. (2003) An updated digital model of plate boundaries, G-cubed 4(3), 1027',
  sourceUrl: 'https://github.com/fraxen/tectonicplates',
  credit: 'Peter Bird · GIS 변환 Hugo Ahlenius / Nordpil',
  license: 'Open Data Commons Attribution License (ODC-BY) 1.0',
  lines: lines.length,
  points: pts,
  coords: lines,
};
writeFileSync(OUT, JSON.stringify(out), 'utf8');
console.log(`plates.json — 선 ${lines.length}개 · 점 ${pts}개 · ${(JSON.stringify(out).length / 1024).toFixed(0)}KB`);
