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
