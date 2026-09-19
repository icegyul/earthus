// P6 — 현상별 5칸 표가 레지스트리·픽스처와 어긋나지 않는지. 표는 생성물이다(손으로 ✅ 금지).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { PRODUCERS, coverageRows } = await import('./intel-coverage-table.mjs');
const { hasIntel } = await import('../../prototype/v2-three/js/intel-questions.js');
const mainSrc = readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');

test('생산자가 있는 현상은 전부 intelligence:true 이고, 화면이 그 패킷을 찾아 준다', () => {
  for (const id of Object.keys(PRODUCERS)) {
    assert.ok(hasIntel(id), `${id} 는 intelligence:true 여야 띠가 그려진다`);
    const short = id === 'hazards.typhoon' ? "kind === 'TC'" : id === 'hazards.earthquake' ? "kind === 'EQ'" : `'${id}'`;
    assert.ok(mainSrc.slice(mainSrc.indexOf('function intelHostFor'), mainSrc.indexOf('const shellHooks')).includes(short),
      `${id} 의 패킷을 intelHostFor 가 돌려줘야 한다`);
  }
});

test('표 — 생산자 있는 현상은 WHAT 이 되고, 없는 현상은 칸을 비운다', () => {
  const rows = coverageRows();
  const withProd = rows.filter((r) => r.prod);
  assert.equal(withProd.length, Object.keys(PRODUCERS).length);
  for (const r of withProd) assert.equal(r.cells.WHAT, '✅', `${r.id} WHAT`);
  assert.deepEqual(Object.values(rows.find((r) => r.id === 'hazards.typhoon').cells), ['✅', '✅', '✅', '✅', '✅']);
  for (const r of rows.filter((x) => !x.prod)) assert.deepEqual(r.cells, {}, `${r.id} 는 생산자가 없다 — 칸을 채우지 않는다`);
});

test('문서가 생성물과 같다 — 레지스트리나 픽스처가 바뀌면 다시 만든다', () => {
  const doc = readFileSync(new URL('../../docs/INTEL-COVERAGE-2026-09-20.md', import.meta.url), 'utf8');
  for (const r of coverageRows()) assert.ok(doc.includes(`| \`${r.id}\` |`), `${r.id} 가 문서에 없다`);
});
