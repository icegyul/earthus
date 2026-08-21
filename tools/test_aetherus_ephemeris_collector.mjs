#!/usr/bin/env node
// AETHERUS ephemeris 수집기 계약 검사.
// AWS SDK 없이 순수 모듈(horizons-parser.mjs)만으로 전송 파라미터와
// Horizons 응답 파싱·천체 정렬 규칙을 고정한다.
import assert from 'node:assert/strict';
import {
  assertAlignedBodies,
  buildHorizonsUrl,
  floorToStep,
  jdToUnixMs,
  parseHorizonsVectorResult,
} from '../aws/aetherus-ephemeris/horizons-parser.mjs';

/* ── JD → Unix ms ─────────────────────────────────────────────── */
// 기준점: JD 2451545.0 은 2000-01-01T12:00:00Z 다 (J2000 에포크).
assert.equal(jdToUnixMs(2451545.0), Date.parse('2000-01-01T12:00:00Z'));
assert.equal(jdToUnixMs('2451545.0'), Date.parse('2000-01-01T12:00:00Z'));
assert.throws(() => jdToUnixMs('not-a-number'), RangeError);

/* ── VECTORS CSV 파싱 ─────────────────────────────────────────── */
const jd0 = 2461234.0;
const row = (jd, x, y, z, vx, vy, vz) =>
  `${jd.toFixed(9)}, A.D. 2026-Jan-01 00:00:00.0000, ${x}, ${y}, ${z}, ${vx}, ${vy}, ${vz}`;

const horizonsResult = [
  '*******************************************************************************',
  '$$SOE',
  row(jd0, '-1.2345678901234E-1', '5.6789012345678E-1', '-2.3456789012345E-3',
    '1.2345678901234E-7', '-5.6789012345678E-7', '3.4567890123456E-8'),
  '*',
  row(jd0 + 0.25, '1.1E-1', '2.2E-1', '3.3E-1', '4.4E-7', '5.5E-7', '6.6E-8'),
  '*',
  row(jd0 + 0.5, '2.0E-1', '3.0E-1', '4.0E-1', '7.7E-7', '8.8E-7', '9.9E-8'),
  '$$EOE',
  '*******************************************************************************',
].join('\n');

const samples = parseHorizonsVectorResult(horizonsResult, 'earth');
assert.equal(samples.length, 3);
assert.equal(samples[0][0], jdToUnixMs(jd0));
assert.ok(Math.abs(samples[0][1] - -0.12345678901234) < 1e-15);
assert.equal(samples[1].length, 7); // t, x, y, z, vx, vy, vz
for (let index = 1; index < samples.length; index += 1) {
  assert.ok(samples[index][0] > samples[index - 1][0]);
}

// $$SOE/$$EOE 블록이 없으면 실패다 — 빈 배열로 성공하면 안 된다.
assert.throws(
  () => parseHorizonsVectorResult('no block here', 'mars'),
  /HORIZONS_VECTOR_BLOCK_MISSING:mars/,
);
// 유효 행이 2개 미만이면 보간을 만들 수 없다.
assert.throws(
  () => parseHorizonsVectorResult(
    '$$SOE\n' + row(jd0, '1', '2', '3', '4', '5', '6') + '\n$$EOE',
    'venus',
  ),
  /HORIZONS_VECTOR_ROWS_TOO_FEW:venus/,
);
// 시각이 역행하면 조용히 정렬하지 말고 실패해야 한다.
const backward = [
  '$$SOE',
  row(jd0 + 0.5, '1', '2', '3', '4', '5', '6'),
  row(jd0, '1', '2', '3', '4', '5', '6'),
  '$$EOE',
].join('\n');
assert.throws(
  () => parseHorizonsVectorResult(backward, 'sun'),
  /HORIZONS_VECTOR_TIME_NOT_MONOTONIC:sun/,
);

/* ── 전송 URL 계약 ─────────────────────────────────────────────── */
const url = buildHorizonsUrl('399', new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 2)), {
  endpoint: 'https://ssd.jpl.nasa.gov/api/horizons.api',
  stepHours: 6,
});
const params = new URL(url).searchParams;
assert.equal(new URL(url).origin + new URL(url).pathname,
  'https://ssd.jpl.nasa.gov/api/horizons.api');
assert.equal(params.get('format'), 'json');
assert.equal(params.get('COMMAND'), "'399'");
assert.equal(params.get('EPHEM_TYPE'), "'VECTORS'");
assert.equal(params.get('CENTER'), "'@0'");           // 태양계 질량중심
assert.equal(params.get('REF_PLANE'), "'FRAME'");
assert.equal(params.get('REF_SYSTEM'), "'ICRF'");
assert.equal(params.get('OUT_UNITS'), "'AU-D'");
assert.equal(params.get('VEC_TABLE'), "'2'");          // X/Y/Z + VX/VY/VZ
assert.equal(params.get('VEC_CORR'), "'NONE'");
assert.equal(params.get('CSV_FORMAT'), "'YES'");
assert.equal(params.get('TIME_TYPE'), "'UT'");
assert.equal(params.get('STEP_SIZE'), "'6 h'");
assert.match(params.get('START_TIME'), /^'2026-01-01 00:00:00'$/);
assert.match(params.get('STOP_TIME'), /^'2026-01-02 00:00:00'$/);

/* ── 천체 간 시간 격자 정렬 ───────────────────────────────────── */
const base = [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1, 6), Date.UTC(2026, 0, 1, 12)];
assertAlignedBodies([
  { body: 'sun', samples: base.map(t => [t, 0, 0, 0, 0, 0, 0]) },
  { body: 'earth', samples: base.map((t, i) => [t, i, i, i, 0, 0, 0]) },
]);
// 행 수가 다르면 그대로 쓰면 안 된다.
assert.throws(
  () => assertAlignedBodies([
    { body: 'sun', samples: base.map(t => [t, 0, 0, 0, 0, 0, 0]) },
    { body: 'earth', samples: base.slice(0, 2).map((t, i) => [t, i, i, i, 0, 0, 0]) },
  ]),
  /HORIZONS_SAMPLE_COUNT_MISMATCH:earth/,
);
// 같은 노드가 1초 이상 어긋나도 실패다 — Hermite 보간이 어긋난 격자 위에서 돌면 안 된다.
assert.throws(
  () => assertAlignedBodies([
    { body: 'sun', samples: base.map(t => [t, 0, 0, 0, 0, 0, 0]) },
    { body: 'earth', samples: base.map((t, i) => [t + 60_001, i, i, i, 0, 0, 0]) },
  ]),
  /HORIZONS_SAMPLE_TIME_MISMATCH:earth:0/,
);

/* ── 6시간 바닥 정렬 ──────────────────────────────────────────── */
const floored = floorToStep(new Date(Date.UTC(2026, 0, 1, 14, 23)), 6);
assert.equal(floored.toISOString(), '2026-01-01T12:00:00.000Z');

console.log('aetherus-ephemeris collector contract: PASS');
