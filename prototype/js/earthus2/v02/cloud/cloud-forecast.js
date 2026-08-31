import { clamp, lerp } from '../core/math.js';

const KNOTS = Object.freeze([
  Object.freeze({ hour: 0, observation: 0.75, deterministic: 0.25, ensemble: 0.00 }),
  Object.freeze({ hour: 2, observation: 0.75, deterministic: 0.25, ensemble: 0.00 }),
  Object.freeze({ hour: 6, observation: 0.45, deterministic: 0.45, ensemble: 0.10 }),
  Object.freeze({ hour: 72, observation: 0.05, deterministic: 0.70, ensemble: 0.25 }),
  Object.freeze({ hour: 240, observation: 0.00, deterministic: 0.35, ensemble: 0.65 }),
]);

function interpolate(left, right, t) {
  const values = {
    observation: lerp(left.observation, right.observation, t),
    deterministic: lerp(left.deterministic, right.deterministic, t),
    ensemble: lerp(left.ensemble, right.ensemble, t),
  };
  const total = values.observation + values.deterministic + values.ensemble;
  return Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total])));
}

export function cloudBlendWeights(horizonHours) {
  if (!Number.isFinite(horizonHours) || horizonHours < 0) throw new RangeError('horizonHours must be >=0');
  if (horizonHours >= KNOTS.at(-1).hour) return interpolate(KNOTS.at(-1), KNOTS.at(-1), 0);
  for (let index = 0; index < KNOTS.length - 1; index += 1) {
    const left = KNOTS[index]; const right = KNOTS[index + 1];
    if (horizonHours >= left.hour && horizonHours <= right.hour) return interpolate(left, right, (horizonHours - left.hour) / Math.max(1, right.hour - left.hour));
  }
  throw new Error('cloud horizon interpolation failed');
}

export function cloudHorizonKind(horizonHours) {
  if (!Number.isFinite(horizonHours) || horizonHours < 0) throw new RangeError('horizonHours must be >=0');
  if (horizonHours === 0) return 'OBSERVED';
  if (horizonHours <= 2) return 'NOWCAST';
  if (horizonHours <= 6) return 'HYBRID_NOWCAST';
  if (horizonHours <= 72) return 'FORECAST';
  if (horizonHours <= 168) return 'OUTLOOK';
  return 'LONG_RANGE_OUTLOOK';
}

export function blendCloudStates({ observed, deterministic, ensemble, horizonHours }) {
  const weights = cloudBlendWeights(horizonHours);
  const fields = ['lowCloudFraction', 'midCloudFraction', 'highCloudFraction', 'cloudTopHeightM', 'cloudBaseHeightM', 'opticalDepth'];
  const result = {};
  for (const field of fields) {
    const items = [
      { value: observed?.[field], weight: weights.observation },
      { value: deterministic?.[field], weight: weights.deterministic },
      { value: ensemble?.[field], weight: weights.ensemble },
    ].filter((item) => Number.isFinite(item.value) && item.weight > 0);
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    result[field] = total > 0 ? items.reduce((sum, item) => sum + item.value * item.weight, 0) / total : null;
  }
  const uncertainty = clamp((ensemble?.uncertainty ?? 0.5) * weights.ensemble + (deterministic?.uncertainty ?? 0.35) * weights.deterministic + (observed?.uncertainty ?? 0.2) * weights.observation, 0, 1);
  return Object.freeze({ ...result, weights, uncertainty, horizonKind: cloudHorizonKind(horizonHours), horizonHours });
}
