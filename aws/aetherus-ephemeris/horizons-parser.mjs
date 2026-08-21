// Pure parser for JPL Horizons VECTORS CSV output.
// Kept free of AWS dependencies so the exact wire contract can be unit-tested by Node.

const DAY_MS = 86_400_000;

export function jdToUnixMs(jd) {
  const value = Number(jd);
  if (!Number.isFinite(value)) throw new RangeError('HORIZONS_JD_REQUIRED');
  return Math.round((value - 2_440_587.5) * DAY_MS);
}

// VEC_TABLE=2 + CSV_FORMAT=YES + VEC_LABELS=NO contract:
// JD, calendar, X, Y, Z, VX, VY, VZ
export function parseHorizonsVectorResult(result, body = 'body') {
  const text = String(result || '');
  const start = text.indexOf('$$SOE');
  const stop = text.indexOf('$$EOE');
  if (start < 0 || stop <= start) throw new Error(`HORIZONS_VECTOR_BLOCK_MISSING:${body}`);
  const block = text.slice(start + 5, stop);
  const samples = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*')) continue;
    const fields = line.split(',').map(value => value.trim());
    if (fields.length < 8) continue;
    const jd = Number(fields[0]);
    const vector = fields.slice(2, 8).map(Number);
    if (!Number.isFinite(jd) || vector.some(value => !Number.isFinite(value))) continue;
    samples.push([jdToUnixMs(jd), ...vector]);
  }
  if (samples.length < 2) throw new Error(`HORIZONS_VECTOR_ROWS_TOO_FEW:${body}:${samples.length}`);
  for (let index = 1; index < samples.length; index += 1) {
    if (!(samples[index][0] > samples[index - 1][0])) {
      throw new Error(`HORIZONS_VECTOR_TIME_NOT_MONOTONIC:${body}`);
    }
  }
  return samples;
}

/* 아래 세 함수는 index.mjs 에서 옮긴 순수 로직이다. AWS SDK import 이전에
   계약 테스트가 전송 파라미터와 천체 정렬 규칙을 검사할 수 있게 하기 위함이며
   동작은 원본과 같다. */

export function floorToStep(date, hours) {
  const stepMs = hours * 60 * 60 * 1000;
  return new Date(Math.floor(date.getTime() / stepMs) * stepMs);
}

export function horizonsCalendar(date) {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export function buildHorizonsUrl(command, start, stop, {
  endpoint = 'https://ssd.jpl.nasa.gov/api/horizons.api',
  stepHours,
} = {}) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    OBJ_DATA: `'NO'`,
    MAKE_EPHEM: `'YES'`,
    EPHEM_TYPE: `'VECTORS'`,
    CENTER: `'@0'`,
    REF_PLANE: `'FRAME'`,
    REF_SYSTEM: `'ICRF'`,
    OUT_UNITS: `'AU-D'`,
    VEC_TABLE: `'2'`,
    VEC_CORR: `'NONE'`,
    CSV_FORMAT: `'YES'`,
    VEC_LABELS: `'NO'`,
    CAL_TYPE: `'GREGORIAN'`,
    TIME_DIGITS: `'SECONDS'`,
    TIME_TYPE: `'UT'`,
    START_TIME: `'${horizonsCalendar(start)}'`,
    STOP_TIME: `'${horizonsCalendar(stop)}'`,
    STEP_SIZE: `'${stepHours} h'`,
  });
  return `${endpoint}?${params.toString()}`;
}

export function assertAlignedBodies(bodyResults) {
  const first = bodyResults[0];
  const firstTimes = first.samples.map(row => row[0]);
  for (const result of bodyResults.slice(1)) {
    if (result.samples.length !== firstTimes.length) {
      throw new Error(`HORIZONS_SAMPLE_COUNT_MISMATCH:${result.body}`);
    }
    result.samples.forEach((row, index) => {
      if (Math.abs(row[0] - firstTimes[index]) > 1000) {
        throw new Error(`HORIZONS_SAMPLE_TIME_MISMATCH:${result.body}:${index}`);
      }
    });
  }
}
