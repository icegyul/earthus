// Aetherus Observation Planner — PR-04 최소 수직 슬라이스
//
// 화성·관측자·UTC 입력을 24시간의 "기하 후보 구간"으로만 바꾼다.
// 날씨·빛공해·현지 지평선·달·장비 적합성이 없으므로 관측 가능성, 안전,
// 성공률 또는 이동 추천을 반환하지 않는다. 계산은 정적 ES module 안에서 끝나며
// 같은 입력/기준/엔진 revision은 항상 같은 plan revision을 만든다.

import {
  calculateMarsObservation,
  calculateSunObservation,
  normalizeAstronomyObserver,
} from './astronomy.js';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const ENGINE_REVISION = 'geometry-mars-24h-explorer-v1';
const PLAN_SCHEMA = 'earthus.observation-plan.v1';
const MANIFEST_SCHEMA = 'earthus.offline-observation-pack-manifest.v1';

export const GEOMETRY_24H_PLAN = 'geometry24h';
export const DEFAULT_PLAN_CRITERIA = Object.freeze({
  durationHours: 24,
  stepMinutes: 15,
  marsAltitudeMinDeg: 0,
  sunAltitudeMaxDeg: -18,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizedInstant(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_PLAN_START_UTC_REQUIRED');
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function normalizedCriteria(criteria = {}) {
  const value = { ...DEFAULT_PLAN_CRITERIA, ...(criteria || {}) };
  const durationHours = Number(value.durationHours);
  const stepMinutes = Number(value.stepMinutes);
  const marsAltitudeMinDeg = Number(value.marsAltitudeMinDeg);
  const sunAltitudeMaxDeg = Number(value.sunAltitudeMaxDeg);
  if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 48) {
    throw new RangeError('PLAN_DURATION_OUT_OF_RANGE');
  }
  if (!Number.isInteger(stepMinutes) || stepMinutes < 5 || stepMinutes > 60
    || durationHours * 60 % stepMinutes !== 0) {
    throw new RangeError('PLAN_STEP_OUT_OF_RANGE');
  }
  if (!Number.isFinite(marsAltitudeMinDeg) || marsAltitudeMinDeg < -90 || marsAltitudeMinDeg > 90) {
    throw new RangeError('MARS_ALTITUDE_THRESHOLD_OUT_OF_RANGE');
  }
  if (!Number.isFinite(sunAltitudeMaxDeg) || sunAltitudeMaxDeg < -90 || sunAltitudeMaxDeg > 0) {
    throw new RangeError('SUN_ALTITUDE_THRESHOLD_OUT_OF_RANGE');
  }
  return Object.freeze({ durationHours, stepMinutes, marsAltitudeMinDeg, sunAltitudeMaxDeg });
}

function privacySafeObserver(observer) {
  const normalized = normalizeAstronomyObserver(observer);
  const sharedPrecision = normalized.source === 'default' ? 6 : 2;
  return Object.freeze({
    id: normalized.source === 'default' ? 'default' : null,
    lat: Number(normalized.lat.toFixed(sharedPrecision)),
    lon: Number(normalized.lon.toFixed(sharedPrecision)),
    privacyMode: normalized.source === 'default' ? 'default-location' : 'rounded-shared-location',
  });
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function canonicalInput({ observer, startAt, criteria }) {
  const start = normalizedInstant(startAt);
  const safeObserver = privacySafeObserver(observer);
  const normalized = normalizedCriteria(criteria);
  return Object.freeze({
    target: 'mars',
    observer: safeObserver,
    availability: Object.freeze({
      startUtc: start.toISOString(),
      endUtc: new Date(start.getTime() + normalized.durationHours * HOUR_MS).toISOString(),
    }),
    precision: 'explorer',
    criteria: normalized,
  });
}

function inputRevision(input) {
  return `input_${fnv1a(JSON.stringify(input))}`;
}

function planRevision(input) {
  return `plan_${fnv1a(JSON.stringify({ engine: ENGINE_REVISION, input }))}`;
}

function sampleAt(input, at) {
  const observer = {
    lat: input.observer.lat,
    lon: input.observer.lon,
    source: input.observer.id === 'default' ? 'default' : 'shared',
  };
  const mars = calculateMarsObservation({ observer, at, precision: input.precision });
  const sun = calculateSunObservation({ observer, at, precision: input.precision });
  const marsAltitudeDeg = mars.coordinates.horizontal.altitudeDeg;
  const sunAltitudeDeg = sun.coordinates.horizontal.altitudeDeg;
  const marsPass = marsAltitudeDeg >= input.criteria.marsAltitudeMinDeg;
  const darknessPass = sunAltitudeDeg <= input.criteria.sunAltitudeMaxDeg;
  return Object.freeze({
    utc: at.toISOString(),
    marsAltitudeDeg,
    marsAzimuthDeg: mars.coordinates.horizontal.azimuthDeg,
    sunAltitudeDeg,
    passes: Object.freeze({ marsGeometricHorizon: marsPass, astronomicalDarkness: darknessPass }),
    candidate: marsPass && darknessPass,
  });
}

function candidateWindows(samples, stepMinutes) {
  const windows = [];
  let current = null;
  samples.forEach(sample => {
    if (sample.candidate) {
      if (!current) current = { first: sample, last: sample, peak: sample, sampleCount: 0 };
      current.last = sample;
      current.sampleCount += 1;
      if (sample.marsAltitudeDeg > current.peak.marsAltitudeDeg) current.peak = sample;
      return;
    }
    if (current) {
      windows.push(current);
      current = null;
    }
  });
  if (current) windows.push(current);
  return windows.map((window, index) => Object.freeze({
    id: `window-${index + 1}`,
    startUtc: window.first.utc,
    endUtc: window.last.utc,
    gridSupportMinutes: Math.max(0, (window.sampleCount - 1) * stepMinutes),
    calculationSampleCount: window.sampleCount,
    peak: Object.freeze({
      utc: window.peak.utc,
      marsAltitudeDeg: window.peak.marsAltitudeDeg,
      marsAzimuthDeg: window.peak.marsAzimuthDeg,
      sunAltitudeDeg: window.peak.sunAltitudeDeg,
    }),
  }));
}

function constraintLedger(input, samples) {
  const count = predicate => samples.filter(predicate).length;
  return Object.freeze([
    Object.freeze({
      id: 'mars-geometric-altitude', status: 'APPLIED', operator: '>=',
      threshold: input.criteria.marsAltitudeMinDeg, unit: 'deg',
      passingCalculationSamples: count(sample => sample.passes.marsGeometricHorizon),
      sourceRevision: 'earthus.astronomy-observation.v1',
    }),
    Object.freeze({
      id: 'sun-astronomical-darkness', status: 'APPLIED', operator: '<=',
      threshold: input.criteria.sunAltitudeMaxDeg, unit: 'deg',
      passingCalculationSamples: count(sample => sample.passes.astronomicalDarkness),
      definitionSource: 'https://aa.usno.navy.mil/faq/RST_defs',
      sourceRevision: 'earthus.astronomy-observation.v1',
    }),
    Object.freeze({ id: 'local-horizon', status: 'UNAVAILABLE', fallback: 'geometric-horizon-0deg' }),
    Object.freeze({ id: 'weather', status: 'UNAVAILABLE', fallback: null }),
    Object.freeze({ id: 'sky-brightness-light-pollution', status: 'UNAVAILABLE', fallback: null }),
    Object.freeze({ id: 'moon-separation-illumination', status: 'UNAVAILABLE', fallback: null }),
    Object.freeze({ id: 'equipment-compatibility', status: 'UNAVAILABLE', fallback: null }),
  ]);
}

export function createMarsGeometryPlan({ observer, startAt, criteria } = {}) {
  const input = canonicalInput({ observer, startAt, criteria });
  const start = new Date(input.availability.startUtc);
  const stepMs = input.criteria.stepMinutes * MINUTE_MS;
  const calculationSampleCount = input.criteria.durationHours * 60 / input.criteria.stepMinutes + 1;
  const samples = Array.from({ length: calculationSampleCount }, (_, index) =>
    sampleAt(input, new Date(start.getTime() + index * stepMs)));
  const windows = candidateWindows(samples, input.criteria.stepMinutes);
  const candidateSampleCount = samples.filter(sample => sample.candidate).length;
  const result = windows.length ? 'GEOMETRY_CANDIDATE' : 'NO_FEASIBLE';
  const plan = {
    schema: PLAN_SCHEMA,
    engineRevision: ENGINE_REVISION,
    revision: planRevision(input),
    inputRevision: inputRevision(input),
    lifecycle: Object.freeze({
      state: windows.length ? 'READY' : 'DRAFT',
      transitionsEvaluated: Object.freeze(['DRAFT', 'VALIDATING', windows.length ? 'READY' : 'NO_FEASIBLE']),
      activationAllowed: false,
    }),
    result,
    reason: windows.length ? 'LIMITED_GEOMETRY_ONLY' : 'NO_GEOMETRY_WINDOW_IN_AVAILABILITY',
    input,
    windows: Object.freeze(windows),
    alternatives: Object.freeze([]),
    constraints: constraintLedger(input, samples),
    evidence: Object.freeze({
      calculationSampleCount,
      candidateCalculationSampleCount: candidateSampleCount,
      observationSampleCount: null,
      calculationGrid: `${input.criteria.stepMinutes}min-inclusive`,
      freshness: 'deterministic-static-model',
      sourceRevision: 'NASA/JPL-approximate-positions-table-1-1800-2050',
      sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      twilightDefinitionUrl: 'https://aa.usno.navy.mil/faq/RST_defs',
    }),
    limitations: Object.freeze([
      'not-an-observability-safety-or-success-probability-claim',
      'no-local-horizon-weather-light-pollution-moon-or-equipment',
      'grid-boundaries-are-not-rise-set-event-times',
      'not-for-telescope-pointing-or-solar-observation',
    ]),
  };
  return deepFreeze(plan);
}

export function assessObservationPlan(plan, { observer, startAt, criteria } = {}) {
  if (!plan || plan.schema !== PLAN_SCHEMA) throw new TypeError('OBSERVATION_PLAN_REQUIRED');
  const currentInput = canonicalInput({ observer, startAt, criteria });
  const currentInputRevision = inputRevision(currentInput);
  return Object.freeze({
    status: currentInputRevision === plan.inputRevision ? 'CURRENT' : 'STALE',
    reason: currentInputRevision === plan.inputRevision ? null : 'INPUT_CHANGED',
    planInputRevision: plan.inputRevision,
    currentInputRevision,
  });
}

export function createOfflinePlanManifest(plan) {
  if (!plan || plan.schema !== PLAN_SCHEMA) throw new TypeError('OBSERVATION_PLAN_REQUIRED');
  const manifest = {
    schema: MANIFEST_SCHEMA,
    version: 1,
    manifestRevision: `pack_${fnv1a(JSON.stringify({ planRevision: plan.revision, version: 1 }))}`,
    planRevision: plan.revision,
    mode: 'PLAN_DATA_ONLY',
    networkRequiredForCalculation: false,
    appShellIncluded: false,
    embedded: Object.freeze({ plan }),
    resources: Object.freeze([
      Object.freeze({ id: 'planner-engine', revision: ENGINE_REVISION, availability: 'already-loaded-app-module' }),
      Object.freeze({ id: 'astronomy-engine', revision: 'earthus.astronomy-observation.v1', availability: 'already-loaded-app-module' }),
      Object.freeze({ id: 'jpl-source-reference', url: plan.evidence.sourceUrl, availability: 'reference-link-not-cached' }),
      Object.freeze({ id: 'usno-twilight-definition', url: plan.evidence.twilightDefinitionUrl, availability: 'reference-link-not-cached' }),
    ]),
    excluded: Object.freeze([
      'web-app-shell-and-service-worker-cache',
      'weather-local-horizon-light-pollution-moon-equipment-data',
      'user-original-captures',
    ]),
    integrity: Object.freeze({
      revisionAlgorithm: 'fnv1a-32-non-cryptographic-identity',
      cryptographicChecksumsIncluded: false,
    }),
  };
  return deepFreeze(manifest);
}
