function finite(value, field = 'value') {
  if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite`);
  return value;
}

export function clamp(value, min = 0, max = 1) {
  finite(value);
  finite(min, 'min');
  finite(max, 'max');
  if (min > max) throw new RangeError('min must not exceed max');
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  finite(a, 'a');
  finite(b, 'b');
  return a + (b - a) * clamp(t, 0, 1);
}

export function median(values) {
  const valid = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

export function percentile(values, p) {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('p must be in [0,1]');
  const valid = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const position = (valid.length - 1) * p;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return valid[low];
  return lerp(valid[low], valid[high], position - low);
}

export function mad(values, center = median(values)) {
  if (!Number.isFinite(center)) return null;
  return median([...values].filter(Number.isFinite).map((value) => Math.abs(value - center)));
}

export function robustZ(value, history, epsilon = 1e-9) {
  finite(value);
  const center = median(history);
  const dispersion = mad(history, center);
  if (!Number.isFinite(center) || !Number.isFinite(dispersion)) return null;
  return (value - center) / Math.max(1.4826 * dispersion, epsilon);
}

export function ewma(values, alpha) {
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) throw new RangeError('alpha must be in (0,1]');
  const valid = [...values].filter(Number.isFinite);
  if (!valid.length) return [];
  const result = [valid[0]];
  for (let index = 1; index < valid.length; index += 1) {
    result.push(alpha * valid[index] + (1 - alpha) * result.at(-1));
  }
  return result;
}

export function theilSenSlope(points) {
  const valid = [...points]
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .sort((left, right) => left.x - right.x);
  if (valid.length < 2) return 0;
  const slopes = [];
  for (let left = 0; left < valid.length - 1; left += 1) {
    for (let right = left + 1; right < valid.length; right += 1) {
      const dx = valid[right].x - valid[left].x;
      if (dx !== 0) slopes.push((valid[right].y - valid[left].y) / dx);
    }
  }
  return median(slopes) ?? 0;
}

export function weightedMean(items) {
  const valid = items.filter((item) => Number.isFinite(item?.value) && Number.isFinite(item?.weight) && item.weight > 0);
  const weight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (weight <= 0) return null;
  return valid.reduce((sum, item) => sum + item.value * item.weight, 0) / weight;
}

export function weightedVariance(items, mean = weightedMean(items)) {
  if (!Number.isFinite(mean)) return null;
  const valid = items.filter((item) => Number.isFinite(item?.value) && Number.isFinite(item?.weight) && item.weight > 0);
  const weight = valid.reduce((sum, item) => sum + item.weight, 0);
  if (weight <= 0) return null;
  return valid.reduce((sum, item) => sum + item.weight * ((item.value - mean) ** 2), 0) / weight;
}

export function normalizeWeights(weights) {
  const entries = Object.entries(weights ?? {}).filter(([, value]) => Number.isFinite(value) && value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return Object.freeze({});
  return Object.freeze(Object.fromEntries(entries.map(([key, value]) => [key, value / total])));
}

export function boundedLogScale(value, { minValue = 0, maxValue, minOutput = 0, maxOutput = 1 } = {}) {
  finite(value);
  finite(minValue, 'minValue');
  finite(maxValue, 'maxValue');
  if (maxValue <= minValue) throw new RangeError('maxValue must exceed minValue');
  const normalized = Math.log1p(Math.max(0, value - minValue)) / Math.log1p(maxValue - minValue);
  return lerp(minOutput, maxOutput, clamp(normalized, 0, 1));
}

export function haversineMeters(left, right) {
  const lat1 = finite(left?.lat, 'left.lat') * Math.PI / 180;
  const lat2 = finite(right?.lat, 'right.lat') * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLon = (finite(right?.lon, 'right.lon') - finite(left?.lon, 'left.lon')) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function fnv1a64(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const character of text) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}
