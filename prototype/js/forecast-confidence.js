// Earthus Forecast Confidence Engine v1 — 예보 "확률"이 아닌 입력 품질 지표.

export const FORECAST_CONFIDENCE_VERSION = 'earthus.forecast-confidence.v1.0.0';
export const CONFIDENCE_DIMENSIONS = Object.freeze([
  'FRESHNESS',
  'AVAILABILITY',
  'MODEL_AGREEMENT',
  'SPATIAL_SUPPORT',
  'TEMPORAL_HORIZON',
  'PROVIDER_HEALTH',
]);

const WEIGHTS = Object.freeze({
  FRESHNESS: 0.20,
  AVAILABILITY: 0.20,
  MODEL_AGREEMENT: 0.20,
  SPATIAL_SUPPORT: 0.15,
  TEMPORAL_HORIZON: 0.15,
  PROVIDER_HEALTH: 0.10,
});

const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

function band(score) {
  if (score >= 80) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  if (score >= 40) return 'LOW';
  return 'VERY_LOW';
}

function normalizeDimension(name, raw) {
  const record = raw && typeof raw === 'object' ? raw : { score: raw };
  const score = record?.score;
  const reasonCodes = Array.isArray(record?.reasonCodes)
    ? record.reasonCodes.map(String).filter(Boolean).sort()
    : [];
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return { name, status: 'UNKNOWN', score: null, weight: WEIGHTS[name], reasonCodes: reasonCodes.length ? reasonCodes : [`${name}_UNKNOWN`] };
  }
  const n = Number(score);
  if (n < 0 || n > 100) {
    return { name, status: 'INVALID', score: null, weight: WEIGHTS[name], reasonCodes: [`${name}_OUT_OF_RANGE`] };
  }
  return { name, status: 'KNOWN', score: round(n), weight: WEIGHTS[name], reasonCodes };
}

/**
 * 모든 차원이 근거를 가져야 confidence score를 공개한다.
 * 단일 모델이면 agreement를 추정하지 않고 UNKNOWN으로 둔다.
 */
export function evaluateForecastConfidence({ dimensions = {}, modelSourceIds = [], inputSignalIds = [] } = {}) {
  const uniqueSources = [...new Set((Array.isArray(modelSourceIds) ? modelSourceIds : []).map(String).filter(Boolean))].sort();
  const normalizedInputIds = [...new Set((Array.isArray(inputSignalIds) ? inputSignalIds : []).map(String).filter(Boolean))].sort();
  const results = CONFIDENCE_DIMENSIONS.map(name => normalizeDimension(name, dimensions?.[name]));
  const agreement = results.find(item => item.name === 'MODEL_AGREEMENT');
  if (uniqueSources.length < 2) {
    agreement.status = 'UNKNOWN';
    agreement.score = null;
    agreement.reasonCodes = ['MODEL_AGREEMENT_SINGLE_SOURCE'];
  }
  const unknown = results.filter(item => item.status !== 'KNOWN');
  const reasonCodes = [...new Set(results.flatMap(item => item.reasonCodes))].sort();
  if (unknown.length) {
    return {
      schemaVersion: 'earthus.forecast-confidence.v1',
      engineVersion: FORECAST_CONFIDENCE_VERSION,
      confidenceLevel: 'UNKNOWN',
      score: null,
      calibratedProbability: null,
      dimensions: results,
      reasonCodes,
      modelSourceIds: uniqueSources,
      inputSignalIds: normalizedInputIds,
    };
  }
  const score = round(results.reduce((total, item) => total + item.score * item.weight, 0));
  return {
    schemaVersion: 'earthus.forecast-confidence.v1',
    engineVersion: FORECAST_CONFIDENCE_VERSION,
    confidenceLevel: band(score),
    score,
    calibratedProbability: null,
    dimensions: results,
    reasonCodes,
    modelSourceIds: uniqueSources,
    inputSignalIds: normalizedInputIds,
  };
}
