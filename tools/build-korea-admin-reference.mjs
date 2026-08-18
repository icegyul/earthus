#!/usr/bin/env node

// 한국 안의 탭 좌표에 시·도와 시·군·구명을 붙이는 정적 참조 자료를 만든다.
//
// ⚠️ 최근접 도시·관측소로 행정구역을 추정하지 않는다. 36.327N, 128.236E는
//    상주 관측소와 선산 관측소가 거의 같은 거리라 최근접점 방식이 실제 구미시를
//    상주시로 바꿀 수 있다. 반드시 ADM2 면 안에 좌표가 들어가는지 판정한다.
// ⚠️ 이 자료는 지명 표기용 참조다. 법적 경계·주소·특보구역 판정에는 쓰지 않는다.

import { writeFile } from 'node:fs/promises';

const GEOB_COMMIT = '9469f09';
const KOSTAT_MAP_COMMIT = 'fe65e05e549d04083e52f380a7e9166a8ea0a01e';
const ADM2_URL = `https://github.com/wmgeolab/geoBoundaries/raw/${GEOB_COMMIT}`
  + '/releaseData/gbOpen/KOR/ADM2/geoBoundaries-KOR-ADM2_simplified.geojson';
const KOSTAT_ROOT = `https://raw.githubusercontent.com/southkorea/southkorea-maps/${KOSTAT_MAP_COMMIT}`
  + '/kostat/2013/json';
const OUTPUT = new URL('../prototype/data/korea-admin-reference.json', import.meta.url);

const CURRENT_NAME_KO = Object.freeze({
  'Pohang-si': '포항시',
  'Cheorwon-gun': '철원군',
  'Gwangju-si': '광주시',
  Yeoju: '여주시',
  'Cheongju-si': '청주시',
  'Sejong-si': '세종특별자치시',
  'Cheonan-si': '천안시',
  'Yongin-si': '용인시',
  'Jeonju-si': '전주시',
  'Goyang-si': '고양시',
  'Seongnam-si': '성남시',
  'Suwon-si': '수원시',
  'Changwon-si': '창원시',
  'Ansan-si': '안산시',
  'Michuhol-gu [Nam-gu]': '미추홀구',
  'Bucheon-si': '부천시',
  'Anyang-si': '안양시',
});

const GENERIC_DISTRICT_KO = Object.freeze({
  'Nam-gu [South District]': '남구',
  'Dong-gu [East District]': '동구',
  'Seo-gu [West District]': '서구',
  'Jung-gu [Central District]': '중구',
  'Buk-gu [North Distrikt]': '북구',
});

const CURRENT_REGION_KO = Object.freeze({
  강원도: '강원특별자치도',
  전라북도: '전북특별자치도',
});

const CURRENT_REGION_EN = Object.freeze({
  강원특별자치도: 'Gangwon State',
  전북특별자치도: 'Jeonbuk State',
});

async function load(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const round = value => Number(value.toFixed(4));
function roundCoordinates(value) {
  if (!Array.isArray(value)) return value;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [round(value[0]), round(value[1])];
  }
  return value.map(roundCoordinates);
}

function onSegment(x, y, ax, ay, bx, by) {
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  if (Math.abs(cross) > 1e-10) return false;
  return x >= Math.min(ax, bx) - 1e-10 && x <= Math.max(ax, bx) + 1e-10
    && y >= Math.min(ay, by) - 1e-10 && y <= Math.max(ay, by) + 1e-10;
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    if (onSegment(x, y, a[0], a[1], b[0], b[1])) return true;
    const crosses = (a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function inPolygon(x, y, polygon) {
  return !!polygon?.length && inRing(x, y, polygon[0])
    && !polygon.slice(1).some(hole => inRing(x, y, hole));
}

function contains(geometry, x, y) {
  if (geometry?.type === 'Polygon') return inPolygon(x, y, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.some(polygon => inPolygon(x, y, polygon));
  }
  return false;
}

function bbox(geometry) {
  const points = [];
  const visit = value => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') points.push(value);
    else value.forEach(visit);
  };
  visit(geometry.coordinates);
  return [
    round(Math.min(...points.map(point => point[0]))),
    round(Math.min(...points.map(point => point[1]))),
    round(Math.max(...points.map(point => point[0]))),
    round(Math.max(...points.map(point => point[1]))),
  ];
}

/* 두 출처의 간소화 정도가 달라 한 점만 대조하면 해안·경계에서 틀릴 수 있다.
   면 안의 여러 점을 고르게 뽑아 가장 많이 겹치는 시·도를 부모로 쓴다. */
function interiorPoints(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const points = [];
  for (const polygon of polygons) {
    const xs = polygon[0].map(point => point[0]), ys = polygon[0].map(point => point[1]);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const grid = 13;
    for (let row = 1; row < grid; row += 1) {
      for (let col = 1; col < grid; col += 1) {
        const point = [minX + (maxX - minX) * col / grid, minY + (maxY - minY) * row / grid];
        if (contains(geometry, point[0], point[1])) points.push(point);
      }
    }
  }
  if (!points.length) throw new Error('ADM2 interior points not found');
  return points;
}

const normalizeName = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

const [adm2Doc, oldMunicipalDoc, oldProvinceDoc] = await Promise.all([
  load(ADM2_URL),
  load(`${KOSTAT_ROOT}/skorea_municipalities_geo_simple.json`),
  load(`${KOSTAT_ROOT}/skorea_provinces_geo_simple.json`),
]);

const oldMunicipal = oldMunicipalDoc.features || [];
const exactNames = new Map(oldMunicipal.map(feature => [
  feature.properties.name_eng, feature.properties.name,
]));
const normalizedNames = new Map();
for (const feature of oldMunicipal) {
  const key = normalizeName(feature.properties.name_eng);
  const values = normalizedNames.get(key) || [];
  values.push(feature.properties.name);
  normalizedNames.set(key, values);
}

function koreanName(nameEn) {
  if (CURRENT_NAME_KO[nameEn]) return CURRENT_NAME_KO[nameEn];
  if (GENERIC_DISTRICT_KO[nameEn]) return GENERIC_DISTRICT_KO[nameEn];
  if (exactNames.has(nameEn)) return exactNames.get(nameEn);
  const candidates = [...new Set(normalizedNames.get(normalizeName(nameEn)) || [])];
  if (candidates.length === 1) return candidates[0];
  throw new Error(`No unambiguous Korean ADM2 name for ${nameEn}`);
}

function regionFor(feature) {
  if (feature.properties.shapeName === 'Gunwi-gun') {
    return { ko: '대구광역시', en: 'Daegu' }; // 2023-07-01 경상북도에서 대구로 편입
  }
  const votes = new Map();
  for (const [x, y] of interiorPoints(feature.geometry)) {
    const region = oldProvinceDoc.features.find(item => contains(item.geometry, x, y));
    if (region) votes.set(region, (votes.get(region) || 0) + 1);
  }
  const region = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!region) throw new Error(`No province for ${feature.properties.shapeName}`);
  const oldKo = region.properties.name;
  const ko = CURRENT_REGION_KO[oldKo] || oldKo;
  return { ko, en: CURRENT_REGION_EN[ko] || region.properties.name_eng };
}

const features = (adm2Doc.features || []).map(feature => {
  const nameEn = feature.properties.shapeName;
  const region = regionFor(feature);
  return {
    nameKo: koreanName(nameEn), nameEn,
    regionKo: region.ko, regionEn: region.en,
    bbox: bbox(feature.geometry),
    geometry: {
      type: feature.geometry.type,
      coordinates: roundCoordinates(feature.geometry.coordinates),
    },
  };
});

if (features.length !== 228) throw new Error(`Expected 228 ADM2 features, got ${features.length}`);

const output = {
  schemaVersion: 'earthus.korea-admin-reference.v1',
  source: 'geoBoundaries KOR ADM2',
  sourceUrl: 'https://www.geoboundaries.org/api/current/gbOpen/KOR/ADM2/',
  sourceCommit: GEOB_COMMIT,
  boundaryYear: 2020,
  license: 'Creative Commons Attribution 3.0',
  nameSource: 'KOSTAT 2013 Korean administrative names with documented current-name overrides',
  nameSourceCommit: KOSTAT_MAP_COMMIT,
  purpose: 'Approximate municipality label for a tapped Korean coordinate; not a legal or safety boundary',
  features,
};

await writeFile(OUTPUT, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`Korea admin reference: ${features.length} municipalities`);
