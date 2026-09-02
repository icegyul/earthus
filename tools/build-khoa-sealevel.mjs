// 국립해양조사원 미래 해수면 상승 전망 → 앱 번들용 압축본
//
// 왜: Lambda(khoa-coast, 이벤트 {"khoaSealevel":true})가 S3에 올린 원본은 3.3MB다.
//     시나리오 4개가 같은 격자(19,160점)를 쓰므로 좌표는 한 번만 담고 값만 4벌 담는다.
//     정적 참조자료라 S3 런타임 의존 대신 번들에 넣는다(NASA AR6와 같은 방식).
//
// 값 보존: cm 원값을 소수 1자리로만 줄인다(원본은 소수 3자리). 좌표는 0.05° 격자라 3자리면 정확.
// 상승률(단위 미확인 지표)은 값은 담되 화면 노출은 카드에서 별도 명시한다.
//
// 사용: node tools/build-khoa-sealevel.mjs <원본 json 경로>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC) { console.error('원본 json 경로를 주세요'); process.exit(2); }
const OUT_DIR = join(ROOT, 'prototype', 'v2-three', 'sealevel');
mkdirSync(OUT_DIR, { recursive: true });

const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const groups = raw.groups || [];
const byKey = new Map(groups.map((g) => [`${g.ssp}/${g.indicator}`, g]));

// 기준 격자 = SSP126 상승폭. 다른 시나리오는 같은 좌표 순서인지 확인하고, 다르면 좌표로 맞춘다.
const base = byKey.get('SSP126/상승폭');
if (!base) throw new Error('SSP126/상승폭 그룹이 없습니다');
const key = (la, lo) => `${la.toFixed(3)},${lo.toFixed(3)}`;
const order = base.lat.map((la, i) => key(la, base.lon[i]));
const idx = new Map(order.map((k, i) => [k, i]));

const lat = base.lat.map((v) => Math.round(v * 1000) / 1000);
const lon = base.lon.map((v) => Math.round(v * 1000) / 1000);
const scenarios = {};
const rates = {};
let mismatch = 0;
for (const g of groups) {
  const target = g.indicator === '상승폭' ? scenarios : (g.indicator === '상승률' ? rates : null);
  if (!target) continue;
  const arr = new Array(order.length).fill(null);
  g.lat.forEach((la, i) => {
    const j = idx.get(key(la, g.lon[i]));
    if (j == null) { mismatch += 1; return; }
    arr[j] = Math.round(g.val[i] * 10) / 10;
  });
  target[g.ssp] = { val: arr, min: Math.round(g.min * 10) / 10, max: Math.round(g.max * 10) / 10, n: g.count };
}

const out = {
  schema: 'earthus.khoa-sealevel.v1',
  source: raw.source,
  via: raw.via,
  license: raw.license,
  generated: raw.generated,
  grid: raw.grid,
  unit: 'cm',
  unitNote: '상승폭 단위 cm — 국립해양조사원 조회 화면의 표 머리(해수면높이(상승)(cm)) 기준. 기준연도는 기관 명세를 따른다.',
  rateNote: '상승률은 기관 원값을 그대로 담았으나 단위 표기를 확인하지 못해 화면에서 단위를 적지 않는다.',
  tilesFailed: raw.tilesFailed || [],
  n: lat.length,
  lat,
  lon,
  scenarios,
  rates,
};
const OUT = join(OUT_DIR, 'khoa-kr.json');
const text = JSON.stringify(out);
writeFileSync(OUT, text, 'utf8');
console.log(`${OUT} — ${lat.length}점 · 시나리오 ${Object.keys(scenarios).join(',')} · ${(text.length / 1024).toFixed(0)}KB · 좌표 불일치 ${mismatch}`);
