// popgrid/*.json 을 훑어 index.json(준비된 나라 목록)을 만든다.
// 왜: 카드에 "지금 준비된 나라"를 손으로 적어 두면 격자를 추가할 때마다 문구가 거짓이 된다.
//     목록은 파일에서 뽑아야 실제와 어긋나지 않는다.
// 사용: node tools/build-popgrid-index.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'prototype', 'v2-three', 'popgrid');
const REF = join(ROOT, 'prototype', 'data', 'country-reference.json');

// 공용 country-reference의 옛 표기를 대한민국 외교부 공식 표기로 바로잡는다.
// 참조 파일 자체는 다른 레이어도 함께 쓰므로 여기서만 덮어쓴다.
const NAME_FIX = { TUR: '튀르키예' };

const nameByIso = new Map();
try {
  const ref = JSON.parse(readFileSync(REF, 'utf8'));
  const rows = Array.isArray(ref) ? ref : (ref.countries || ref.features || []);
  for (const r of rows) {
    const c = r.code3 || r.iso3 || (r.properties && (r.properties.code3 || r.properties.iso3));
    const n = r.nameKo || r.name_ko || (r.properties && (r.properties.nameKo || r.properties.name_ko));
    if (c && n) nameByIso.set(String(c).toUpperCase(), n);
  }
} catch (e) {
  console.warn('country-reference 를 읽지 못했습니다 — 이름 없이 ISO3만 씁니다:', e.message);
}

const rows = [];
for (const f of readdirSync(DIR).sort()) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const d = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  rows.push({
    iso3: d.iso3,
    nameKo: NAME_FIX[String(d.iso3).toUpperCase()]
      || nameByIso.get(String(d.iso3).toUpperCase())
      || d.iso3,
    year: d.year,
    total: d.total,
    max: d.max,
    nonzero: d.nonzero,
  });
}
rows.sort((a, b) => b.total - a.total);

const out = {
  schema: 'earthus.popgrid.index.v1',
  count: rows.length,
  source: 'WorldPop R2025A (constrained, UN-adjusted) 1km',
  license: 'CC BY 4.0 — WorldPop, University of Southampton',
  countries: rows,
};
writeFileSync(join(DIR, 'index.json'), JSON.stringify(out), 'utf8');
console.log(`popgrid/index.json — ${rows.length}개국, 합계 ${rows.reduce((s, r) => s + r.total, 0).toLocaleString('ko-KR')}명`);
