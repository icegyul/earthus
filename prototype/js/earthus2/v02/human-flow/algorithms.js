import { clamp, ewma, mad, median, percentile, robustZ, theilSenSlope } from '../core/math.js';

export function calculateDensity({ populationEstimate, effectiveAreaM2 }) {
  if (!Number.isFinite(populationEstimate) || populationEstimate < 0) throw new RangeError('populationEstimate must be >=0');
  if (!Number.isFinite(effectiveAreaM2) || effectiveAreaM2 <= 0) return Object.freeze({ rawDensity: null, state: 'UNKNOWN_AREA' });
  return Object.freeze({ rawDensity: populationEstimate / effectiveAreaM2, state: 'CALCULATED' });
}

export function calculateCrowdIndex({
  rawDensity,
  historicalDensities = [],
  officialLevel = null,
  officialLevelScores = {},
  weights = { percentile: 0.30, relative: 0.25, robustZ: 0.20, official: 0.25 },
}) {
  if (!Number.isFinite(rawDensity) || rawDensity < 0) return Object.freeze({ crowdIndex: null, state: 'UNKNOWN_DENSITY' });
  const validHistory = historicalDensities.filter(Number.isFinite).filter((value) => value >= 0);
  const baseline = median(validHistory);
  const relativeRatio = Number.isFinite(baseline) && baseline > 0 ? rawDensity / baseline : null;
  const z = validHistory.length >= 3 ? robustZ(rawDensity, validHistory) : null;
  const rank = validHistory.length ? validHistory.filter((value) => value <= rawDensity).length / validHistory.length : null;
  const components = [];
  if (Number.isFinite(rank)) components.push({ value: rank * 100, weight: weights.percentile });
  if (Number.isFinite(relativeRatio)) components.push({ value: clamp(Math.log1p(relativeRatio) / Math.log(4), 0, 1) * 100, weight: weights.relative });
  if (Number.isFinite(z)) components.push({ value: clamp((z + 3) / 6, 0, 1) * 100, weight: weights.robustZ });
  const officialScore = officialLevel === null ? null : officialLevelScores[officialLevel];
  if (Number.isFinite(officialScore)) components.push({ value: clamp(officialScore, 0, 100), weight: weights.official });
  const weight = components.reduce((sum, component) => sum + Math.max(0, component.weight), 0);
  const crowdIndex = weight > 0 ? components.reduce((sum, component) => sum + component.value * Math.max(0, component.weight), 0) / weight : null;
  return Object.freeze({ crowdIndex, baseline, relativeRatio, robustZ: z, percentileRank: rank, officialLevel, state: crowdIndex === null ? 'UNKNOWN' : 'CALCULATED' });
}

export function calculateTrend({ values, timestamps = null, alpha = 0.35, thresholds = { stableAbsSlope: 0.01, rapidAbsSlope: 0.08 }, persistence = 2 }) {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return Object.freeze({ state: 'UNKNOWN_INSUFFICIENT_SAMPLES', slope: null, acceleration: null, smoothed: Object.freeze([]) });
  const smoothed = ewma(valid, alpha);
  const xs = timestamps ? timestamps.map((value) => Date.parse(value) / 1000) : smoothed.map((_, index) => index);
  if (xs.some((value) => !Number.isFinite(value))) throw new TypeError('timestamps must be valid ISO date-times');
  const points = smoothed.map((value, index) => ({ x: xs[index], y: value }));
  const slope = theilSenSlope(points);
  const midpoint = Math.max(2, Math.floor(points.length / 2));
  const previousSlope = theilSenSlope(points.slice(0, midpoint));
  const acceleration = slope - previousSlope;
  let state = 'STABLE';
  if (Math.abs(slope) > thresholds.stableAbsSlope) state = slope > 0 ? 'INCREASING' : 'DECREASING';
  if (Math.abs(slope) >= thresholds.rapidAbsSlope) state = slope > 0 ? 'RAPIDLY_INCREASING' : 'RAPIDLY_DECREASING';
  if (persistence > 1 && smoothed.length >= persistence + 1) {
    const recent = valid.slice(-persistence - 1);
    const deltas = recent.slice(1).map((value, index) => value - recent[index]);
    const consistent = state.includes('INCREASING') ? deltas.every((value) => value >= 0) : state.includes('DECREASING') ? deltas.every((value) => value <= 0) : true;
    if (!consistent) state = 'STABLE';
  }
  return Object.freeze({ state, slope, previousSlope, acceleration, smoothed: Object.freeze(smoothed) });
}

export function estimateScalarFlow({ previousPopulation, currentPopulation, deltaSeconds }) {
  if (![previousPopulation, currentPopulation, deltaSeconds].every(Number.isFinite) || previousPopulation < 0 || currentPopulation < 0 || deltaSeconds <= 0) {
    throw new RangeError('invalid scalar flow inputs');
  }
  const delta = currentPopulation - previousPopulation;
  return Object.freeze({
    inflowRatePerSecond: Math.max(0, delta) / deltaSeconds,
    outflowRatePerSecond: Math.max(0, -delta) / deltaSeconds,
    netRatePerSecond: delta / deltaSeconds,
    vector: null,
    vectorState: 'UNKNOWN_NO_OD_OR_GRAPH_EVIDENCE',
  });
}

export function estimateGraphFlow({ neighborVectors, weights }) {
  if (!Array.isArray(neighborVectors) || !neighborVectors.length) return Object.freeze({ vector: null, state: 'UNKNOWN_NO_VECTOR_EVIDENCE' });
  const usable = neighborVectors.map((vector, index) => ({ ...vector, weight: Number.isFinite(weights?.[index]) ? Math.max(0, weights[index]) : 0 })).filter((vector) => Number.isFinite(vector.u) && Number.isFinite(vector.v) && vector.weight > 0);
  const total = usable.reduce((sum, vector) => sum + vector.weight, 0);
  if (total <= 0) return Object.freeze({ vector: null, state: 'UNKNOWN_NO_VECTOR_EVIDENCE' });
  return Object.freeze({ vector: Object.freeze({ u: usable.reduce((sum, vector) => sum + vector.u * vector.weight, 0) / total, v: usable.reduce((sum, vector) => sum + vector.v * vector.weight, 0) / total }), state: 'ESTIMATED_FROM_GRAPH_EVIDENCE' });
}

export function forecastCrowd({ baseline, trendCorrection = 0, eventFactor = 0, weatherFactor = 0, mobilityFactor = 0, providerFactor = 0, bounds = [0, 100] }) {
  for (const [name, value] of Object.entries({ baseline, trendCorrection, eventFactor, weatherFactor, mobilityFactor, providerFactor })) {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  }
  const unbounded = baseline + trendCorrection + eventFactor + weatherFactor + mobilityFactor + providerFactor;
  return Object.freeze({
    value: clamp(unbounded, bounds[0], bounds[1]),
    unbounded,
    contributions: Object.freeze({ baseline, trendCorrection, eventFactor, weatherFactor, mobilityFactor, providerFactor }),
  });
}

export function detectAnomaly({ current, history, threshold = 3, minimumHistory = 8, persistencePassed = true, dataQuality = 1, correlatedSignals = [] }) {
  if (!Number.isFinite(current)) throw new TypeError('current must be finite');
  const valid = history.filter(Number.isFinite);
  if (valid.length < minimumHistory) return Object.freeze({ state: 'UNKNOWN_INSUFFICIENT_HISTORY', score: null });
  const score = Math.abs(robustZ(current, valid));
  if (!Number.isFinite(score) || score < threshold || !persistencePassed || dataQuality < 0.5) return Object.freeze({ state: 'NORMAL', score });
  return Object.freeze({ state: correlatedSignals.length ? 'EVENT_DETECTED' : 'UNEXPLAINED_ANOMALY', score, correlatedSignals: Object.freeze([...correlatedSignals]) });
}

export function capacityPressure({ currentOccupancy, validatedCapacity }) {
  if (!Number.isFinite(currentOccupancy) || currentOccupancy < 0) throw new RangeError('currentOccupancy must be >=0');
  if (!Number.isFinite(validatedCapacity) || validatedCapacity <= 0) return Object.freeze({ pressure: null, state: 'UNKNOWN_CAPACITY' });
  return Object.freeze({ pressure: currentOccupancy / validatedCapacity, state: 'CALCULATED_FROM_VALIDATED_CAPACITY' });
}

export function calculateRisk({ officialEmergency = 0, weatherGate = 0, crowdPolicy = 0, capacityPolicy = 0, bottleneckPolicy = 0, reliabilityPenalty = 0 }) {
  const values = [officialEmergency, weatherGate, crowdPolicy, capacityPolicy, bottleneckPolicy, reliabilityPenalty];
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('risk inputs must be finite');
  if (reliabilityPenalty >= 1) return Object.freeze({ state: 'UNKNOWN', score: null, officialEmergency });
  const score = clamp(Math.max(...values.slice(0, 5)) + 0.15 * clamp(reliabilityPenalty, 0, 1), 0, 1);
  const state = officialEmergency >= 0.8 ? 'CRITICAL' : score >= 0.75 ? 'WARNING' : score >= 0.45 ? 'CAUTION' : 'SAFE';
  return Object.freeze({ state, score, officialEmergency });
}

export function historicalBaseline(values, quantile = 0.5) {
  return percentile(values, quantile);
}

export function distributionSummary(values) {
  const valid = values.filter(Number.isFinite);
  return Object.freeze({ count: valid.length, median: median(valid), mad: mad(valid), p10: percentile(valid, 0.1), p90: percentile(valid, 0.9) });
}
