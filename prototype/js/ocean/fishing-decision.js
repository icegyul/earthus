// Ocean Fishing v1 shadow — 조황을 예측하지 않고 관측/모델 조건과 안전 gate만 전달한다.

import { buildOceanActivityInputs, OCEAN_METRIC, OCEAN_QUALITY } from './observation-contract.js';
import { OCEAN_SAFETY_STATE } from './safety-gate.js';

export const OCEAN_FISHING_DECISION_SCHEMA = 'earthus.ocean-fishing-decision.v1';
const USABLE = new Set([OCEAN_QUALITY.FRESH, OCEAN_QUALITY.AGING]);

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freeze(item)])));
}

function viewOf(input) {
  const item = input?.observation;
  if (!item) return freeze({ state: 'MISSING', value: null, unit: null, sourceId: null,
    validAt: null, provenance: null, quality: 'UNKNOWN' });
  return freeze({
    state: 'READY', value: item.value, unit: item.unit, sourceId: item.sourceId,
    validAt: item.observedAt || item.validFrom || null,
    provenance: item.provenance, quality: item.quality,
  });
}

function localDay(ms, utcOffsetSeconds) {
  return new Date(ms + utcOffsetSeconds * 1000).toISOString().slice(0, 10);
}

/** 조위 예보만 사용한다. 조위에서 조류 속도나 물때 번호를 만들지 않는다. */
export function summarizeTideObservations(observations = [], {
  nowMs = Date.now(), utcOffsetSeconds = 0,
} = {}) {
  if (!Number.isFinite(Number(utcOffsetSeconds)) || Math.abs(Number(utcOffsetSeconds)) > 18 * 3600) {
    return freeze({ state: 'UNKNOWN', reason: 'UTC_OFFSET_INVALID', rangeM: null, next: [] });
  }
  const points = observations.filter(item => item?.metric === OCEAN_METRIC.TIDE_HEIGHT
      && (item?.freshness?.usable === true || USABLE.has(item?.quality))
      && Number.isFinite(Number(item?.value)))
    .map(item => ({ item, at: Date.parse(item.validFrom || item.observedAt || '') }))
    .filter(point => Number.isFinite(point.at))
    .sort((a, b) => a.at - b.at);
  if (points.length < 12) return freeze({ state: 'UNKNOWN', reason: 'TIDE_SERIES_INSUFFICIENT',
    rangeM: null, next: [], samples: points.length });
  if (points.some(point => !point.item.qualityFlags?.includes('DATUM_GLOBAL_MEAN_SEA_LEVEL'))) {
    return freeze({ state: 'UNKNOWN', reason: 'TIDE_DATUM_MISSING', rangeM: null,
      next: [], samples: points.length });
  }

  const horizon = points.filter(point => point.at >= Number(nowMs) - 3 * 3600_000
    && point.at <= Number(nowMs) + 24 * 3600_000);
  if (horizon.length < 6) return freeze({ state: 'UNKNOWN', reason: 'TIDE_HORIZON_INSUFFICIENT',
    rangeM: null, next: [], samples: points.length });
  const values = horizon.map(point => Number(point.item.value));
  const rangeM = Math.max(...values) - Math.min(...values);
  const next = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    if (points[index].at < Number(nowMs)) continue;
    const before = Number(points[index - 1].item.value);
    const value = Number(points[index].item.value);
    const after = Number(points[index + 1].item.value);
    if (value >= before && value >= after) next.push({ kind: 'HIGH', at: points[index].item.validFrom,
      valueM: value });
    else if (value <= before && value <= after) next.push({ kind: 'LOW', at: points[index].item.validFrom,
      valueM: value });
    if (next.length >= 3) break;
  }
  const rangesByDay = new Map();
  for (const point of points) {
    const key = localDay(point.at, Number(utcOffsetSeconds));
    const valuesForDay = rangesByDay.get(key) || [];
    valuesForDay.push(Number(point.item.value));
    rangesByDay.set(key, valuesForDay);
  }
  const dayRanges = [...rangesByDay.values()].filter(valuesForDay => valuesForDay.length >= 20)
    .map(valuesForDay => Math.max(...valuesForDay) - Math.min(...valuesForDay));
  return freeze({
    state: 'READY', reason: null, datum: 'GLOBAL_MEAN_SEA_LEVEL', navigationUseAllowed: false,
    rangeM: Math.round(rangeM * 100) / 100,
    maxRangeM: dayRanges.length ? Math.round(Math.max(...dayRanges) * 100) / 100 : null,
    minRangeM: dayRanges.length ? Math.round(Math.min(...dayRanges) * 100) / 100 : null,
    next, samples: points.length, days: dayRanges.length, approximationMinutes: 30,
    sourceIds: [...new Set(points.map(point => point.item.sourceId))],
    validFrom: points[0].item.validFrom, validTo: points.at(-1).item.validFrom,
    limitations: ['MODEL_FORECAST', 'COASTAL_ACCURACY_LIMITED', 'NOT_FOR_NAVIGATION'],
  });
}

export function buildFishingDecision({
  observations = [], safety = null, tideSummary = null, providerDisplayAllowed = false,
  spot = null,
} = {}) {
  const selected = buildOceanActivityInputs(observations, [
    OCEAN_METRIC.WAVE_HEIGHT,
    OCEAN_METRIC.SWELL_HEIGHT,
    OCEAN_METRIC.SWELL_PERIOD,
    OCEAN_METRIC.SEA_SURFACE_TEMPERATURE,
    OCEAN_METRIC.OCEAN_CURRENT_SPEED,
  ]);
  const safetyState = Object.values(OCEAN_SAFETY_STATE).includes(safety?.state)
    ? safety.state : OCEAN_SAFETY_STATE.UNKNOWN;
  const reasons = [];
  if (safetyState === OCEAN_SAFETY_STATE.BLOCKED) reasons.push('OFFICIAL_SAFETY_BLOCK');
  if (safetyState === OCEAN_SAFETY_STATE.UNKNOWN) reasons.push('SAFETY_EVIDENCE_UNKNOWN');
  if (selected.missing.includes(OCEAN_METRIC.OCEAN_CURRENT_SPEED)) {
    reasons.push('CURRENT_MISSING_NOT_INFERRED_FROM_TIDE');
  }
  if (!tideSummary || tideSummary.state !== 'READY') reasons.push('TIDE_SERIES_UNKNOWN');
  if (!providerDisplayAllowed) reasons.push('PROVIDER_DISPLAY_RIGHTS_UNAPPROVED');

  return freeze({
    schema: OCEAN_FISHING_DECISION_SCHEMA,
    status: providerDisplayAllowed ? 'READY_FOR_REVIEW' : 'LOCAL_SHADOW',
    spot: spot ? { id: spot.id || null, label: spot.label || null, kind: spot.kind || null } : null,
    safetyState,
    safetyReasons: Array.isArray(safety?.reasons) ? safety.reasons : ['SAFETY_UNKNOWN'],
    conditions: {
      waveHeight: viewOf(selected.inputs[OCEAN_METRIC.WAVE_HEIGHT]),
      swellHeight: viewOf(selected.inputs[OCEAN_METRIC.SWELL_HEIGHT]),
      swellPeriod: viewOf(selected.inputs[OCEAN_METRIC.SWELL_PERIOD]),
      seaSurfaceTemperature: viewOf(selected.inputs[OCEAN_METRIC.SEA_SURFACE_TEMPERATURE]),
      oceanCurrentSpeed: viewOf(selected.inputs[OCEAN_METRIC.OCEAN_CURRENT_SPEED]),
    },
    tide: tideSummary || { state: 'UNKNOWN', reason: 'TIDE_SERIES_MISSING' },
    reasons,
    // 조황·어종·입질 확률을 만들지 않는다.
    catchForecast: null,
    biteScore: null,
    catchGuaranteeAllowed: false,
    safeClaimAllowed: false,
    departureCtaAllowed: false,
    bookingCtaAllowed: false,
    currentInferredFromTide: false,
  });
}
