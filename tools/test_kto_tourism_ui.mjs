import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/kto-tourism-contract.js', import.meta.url), 'utf8');
const { ktoSummaryRows, validateKtoSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

const summary = {
  schemaVersion: 'earthus.kto-summary.v1',
  provider: 'KTO',
  generatedAt: '2026-08-20T12:05:00Z',
  state: 'PARTIAL',
  services: {
    concentration: {
      sourceName: '한국관광공사 관광지 집중률 방문자 추이 예측 정보',
      sourceUrl: 'https://www.data.go.kr/data/15128555/openapi.do',
      updatedAt: '2026-08-20T12:00:00Z',
      operations: {
        tatsCnctrRatedList: {
          state: 'AVAILABLE',
          semanticType: 'RELATIVE_CONCENTRATION_FORECAST',
          itemCount: 5,
          path: '/app/tourism/kto/concentration/tatsCnctrRatedList.json',
        },
      },
    },
  },
};

assert.equal(validateKtoSummary(summary), true);
const rows = ktoSummaryRows(summary, '2026-08-20T13:00:00Z');
assert.equal(rows.length, 9);
assert.equal(rows[0].id, 'concentration');
assert.equal(rows[0].state, 'AVAILABLE');
assert.equal(rows[0].itemCount, 5);
assert.equal(rows.find(row => row.id === 'barrierFree').state, 'NOT_COLLECTED');
assert.equal(rows.find(row => row.id === 'english').labelEn, 'Official English tourism content');
assert.equal(
  ktoSummaryRows(summary, '2026-08-21T01:00:00Z')[0].state,
  'STALE',
  'an old concentration forecast must not keep an available label',
);

assert.throws(
  () => validateKtoSummary({ ...summary, provider: 'UNTRUSTED' }),
  /KTO_SUMMARY_PROVIDER_INVALID/,
);
assert.throws(
  () => validateKtoSummary({ ...summary, generatedAt: 'not-a-date' }),
  /KTO_SUMMARY_TIME_INVALID/,
);

console.log('KTO tourism UI contract: PASS');
