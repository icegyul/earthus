import { clamp, normalizeWeights } from './math.js';

export const DEFAULT_CONFIDENCE_WEIGHTS = Object.freeze({
  freshness: 0.18,
  coverage: 0.16,
  agreement: 0.18,
  historicalAccuracy: 0.20,
  spatialMapping: 0.12,
  modelStability: 0.10,
  rightsAndSchema: 0.06,
});

export function calculateConfidence({ components, weights = DEFAULT_CONFIDENCE_WEIGHTS, mandatory = [], caps = [] }) {
  const normalizedWeights = normalizeWeights(weights);
  const used = [];
  for (const [name, weight] of Object.entries(normalizedWeights)) {
    const value = components?.[name];
    if (Number.isFinite(value)) used.push({ name, value: clamp(value, 0, 1), weight });
  }
  if (!used.length) return Object.freeze({ value: null, band: 'UNKNOWN', reasonCodes: Object.freeze(['NO_CONFIDENCE_COMPONENTS']), components: Object.freeze({}) });
  const missingMandatory = mandatory.filter((name) => !Number.isFinite(components?.[name]));
  let value = used.reduce((sum, item) => sum + item.value * item.weight, 0) / used.reduce((sum, item) => sum + item.weight, 0);
  const reasonCodes = [];
  if (missingMandatory.length) {
    value = Math.min(value, 0.35);
    reasonCodes.push(...missingMandatory.map((name) => `MISSING_${name.toUpperCase()}`));
  }
  for (const cap of caps) {
    if (cap?.when === true && Number.isFinite(cap.max)) {
      value = Math.min(value, cap.max);
      if (cap.reason) reasonCodes.push(cap.reason);
    }
  }
  value = clamp(value, 0, 1);
  return Object.freeze({
    value,
    band: confidenceBand(value),
    reasonCodes: Object.freeze(reasonCodes),
    components: Object.freeze(Object.fromEntries(used.map((item) => [item.name, item.value]))),
  });
}

export function confidenceBand(value) {
  if (!Number.isFinite(value)) return 'UNKNOWN';
  if (value >= 0.8) return 'HIGH';
  if (value >= 0.55) return 'MEDIUM';
  if (value >= 0.3) return 'LOW';
  return 'VERY_LOW';
}
