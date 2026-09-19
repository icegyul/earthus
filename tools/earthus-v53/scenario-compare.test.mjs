// S-A — ScenarioCompare 시험. 기준 기록은 저장소의 실제 research-runtime 실행(hycom-2015-atlantic)을
// tools/research/register_simulation_run.py 로 등재한 것(승인자 'fixture-approver'). 가지는 시험 안에서
// 바람 끌림 α 만 바꾼 사본이다 — 운영 기록이 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REC = JSON.parse(readFileSync(new URL('./fixtures/simrun-fixture-hycom-2015-atlantic.json', import.meta.url), 'utf8'));
const RES = JSON.parse(readFileSync(new URL('../../services/research-runtime/examples/hycom-2015-atlantic.result.json', import.meta.url), 'utf8'));
const sc = await import('../../prototype/v2-three/js/scenario-compare.js');

const base = () => ({ record: structuredClone(REC), summary: { meanDisplacementMeters: RES.summary.meanDisplacementMeters, maxDisplacementMeters: RES.summary.maxDisplacementMeters } });
const branch = () => {
  const b = base();
  b.record.runRef = 'research-runtime:branch-alpha-003';
  b.record.modelId = 'surface-passive-advection.v2.windage';
  b.record.forcing = { kind: 'WIND', ref: 'ncep-doe-r2-10m-wind-natl-20150105', sha256: null, params: { windage: { alpha: 0.03 } } };
  b.summary.meanDisplacementMeters += 1500;
  return b;
};

test('같은 바다·같은 범위의 두 실행은 비교되고, 바꾼 조건과 결과 차이만 적는다', () => {
  const cmp = sc.compareRuns(base(), branch());
  assert.equal(cmp.comparable, true, cmp.reasons.join(';'));
  const keys = cmp.changed.map((c) => c.key);
  assert.ok(keys.includes('model'));
  assert.ok(keys.includes('forcing.windage.alpha'));
  const m = cmp.metrics.find((x) => x.key === 'meanDisplacementMeters');
  assert.equal(Math.round(m.delta), 1500);
  assert.equal(m.same, false);
});

test('다른 자료·다른 범위·다른 시간이면 비교하지 않고 이유를 말한다', () => {
  const b = branch();
  b.record.datasetVersions = [{ ...b.record.datasetVersions[0], sha256: 'f'.repeat(64) }];
  b.record.temporalRange = { start: '2015-01-06T12:00:00Z', end: '2015-01-09T12:00:00Z' };
  const cmp = sc.compareRuns(base(), b);
  assert.equal(cmp.comparable, false);
  assert.ok(cmp.reasons.some((r) => /입력 자료/.test(r)));
  assert.ok(cmp.reasons.some((r) => /시간 범위/.test(r)));
  assert.match(sc.scenarioCompareHtml(cmp), /비교할 수 없음/);
});

test('같은 실행·시뮬레이션이 아닌 것은 비교 대상이 아니다', () => {
  assert.ok(sc.comparability(base().record, base().record).some((r) => /같은 실행/.test(r)));
  const x = branch(); x.record.truthStatus = 'OFFICIAL_FORECAST';
  assert.ok(sc.comparability(base().record, x.record).some((r) => /SIMULATION/.test(r)));
});

test('차이가 0 이면 "같음" — "나아짐"이라 판정하지 않는다', () => {
  const b = branch(); b.summary.meanDisplacementMeters = base().summary.meanDisplacementMeters;
  const html = sc.scenarioCompareHtml(sc.compareRuns(base(), b));
  assert.match(html, /같음/);
  assert.ok(!/나아|개선|improv|better|worse|악화/i.test(html));
  assert.match(html, /검증 기록이 말합니다/);
});

test('비교기는 요청·계산을 하지 않는다 — 뺄셈만', () => {
  const src = readFileSync(new URL('../../prototype/v2-three/js/scenario-compare.js', import.meta.url), 'utf8');
  assert.ok(!/\bfetch\(|XMLHttpRequest/.test(src));
});
