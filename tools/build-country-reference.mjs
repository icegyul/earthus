#!/usr/bin/env node

// 지구본에서 탭한 좌표의 국가명을 붙이기 위한 정적 참조 자료를 만든다.
//
// ⚠️ 가까운 도시의 나라를 좌표의 나라로 쓰지 않는다. 부산이 가장 가깝다는 이유로
//    일본 시마네현을 대한민국이라 표시했던 사고가 실제로 있었다.
// ⚠️ 이 자료는 화면의 대략적인 국가명 표기용이다. 공식 영토·특보구역·안전 판정
//    geometry가 아니며, 경계선 자체를 EARTHUS가 새로 해석하지 않는다.

import { writeFile } from 'node:fs/promises';

const COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const ROOT = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${COMMIT}/geojson`;
const OUTPUT = new URL('../prototype/data/country-reference.json', import.meta.url);
const DETAIL_CODES = new Set(['KOR', 'PRK', 'JPN']);

async function load(name) {
  const response = await fetch(`${ROOT}/${name}`);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json();
}

function roundCoordinates(value) {
  if (!Array.isArray(value)) return value;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [Number(value[0].toFixed(4)), Number(value[1].toFixed(4))];
  }
  return value.map(roundCoordinates);
}

function compact(feature) {
  const p = feature.properties || {};
  const code = [p.ISO_A2, p.ISO_A2_EH].find(value => value && value !== '-99') || null;
  return {
    code,
    code3: p.ADM0_A3 || p.ISO_A3 || null,
    nameKo: p.NAME_KO || p.ADMIN || p.NAME,
    nameEn: p.NAME_EN || p.ADMIN || p.NAME,
    geometry: {
      type: feature.geometry.type,
      coordinates: roundCoordinates(feature.geometry.coordinates),
    },
  };
}

const [globalDoc, detailDoc] = await Promise.all([
  load('ne_110m_admin_0_countries.geojson'),
  load('ne_10m_admin_0_countries.geojson'),
]);
const detailed = new Map((detailDoc.features || [])
  .filter(feature => DETAIL_CODES.has(feature.properties?.ADM0_A3))
  .map(feature => [feature.properties.ADM0_A3, feature]));
const features = (globalDoc.features || []).map(feature => {
  const code = feature.properties?.ADM0_A3;
  return compact(detailed.get(code) || feature);
});

const output = {
  schemaVersion: 'earthus.country-reference.v1',
  source: 'Natural Earth admin 0 countries',
  sourceUrl: 'https://www.naturalearthdata.com/downloads/',
  termsUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  license: 'Public domain',
  sourceCommit: COMMIT,
  purpose: 'Approximate country label for a tapped land coordinate; not an official boundary or safety geometry',
  resolution: { global: '1:110m', KOR: '1:10m', PRK: '1:10m', JPN: '1:10m' },
  features,
};

await writeFile(OUTPUT, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`country reference: ${features.length} countries`);
