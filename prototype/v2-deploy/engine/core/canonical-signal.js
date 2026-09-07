import { DATA_STATE, EVIDENCE_KIND } from './constants.js';
import { clamp, fnv1a64, stableStringify } from './math.js';

const DATA_STATES = new Set(Object.values(DATA_STATE));
const EVIDENCE_KINDS = new Set(Object.values(EVIDENCE_KIND));
const GEOMETRY_TYPES = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);

function isoOrNull(value, field) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${field} must be an ISO date-time or null`);
  return new Date(value).toISOString();
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}

function normalizeGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object' || !GEOMETRY_TYPES.has(geometry.type)) {
    throw new TypeError('valid GeoJSON geometry is required');
  }
  return structuredClone(geometry);
}

export function createCanonicalSignal(input) {
  if (!input || typeof input !== 'object') throw new TypeError('signal input is required');
  const dataState = input.dataState;
  const evidenceKind = input.evidenceKind;
  if (!DATA_STATES.has(dataState)) throw new TypeError(`invalid dataState: ${dataState}`);
  if (!EVIDENCE_KINDS.has(evidenceKind)) throw new TypeError(`invalid evidenceKind: ${evidenceKind}`);
  const times = Object.freeze({
    observedAt: isoOrNull(input.times?.observedAt, 'times.observedAt'),
    issuedAt: isoOrNull(input.times?.issuedAt, 'times.issuedAt'),
    validAt: isoOrNull(input.times?.validAt, 'times.validAt'),
    receivedAt: isoOrNull(input.times?.receivedAt, 'times.receivedAt'),
    processedAt: isoOrNull(input.times?.processedAt, 'times.processedAt') ?? new Date().toISOString(),
  });
  if (evidenceKind === EVIDENCE_KIND.OFFICIAL_OBSERVATION && !times.observedAt) {
    throw new TypeError('official observation requires observedAt');
  }
  if ([EVIDENCE_KIND.OFFICIAL_FORECAST, EVIDENCE_KIND.PROVIDER_FORECAST, EVIDENCE_KIND.EARTHUS_FORECAST].includes(evidenceKind) && !times.validAt) {
    throw new TypeError('forecast evidence requires validAt');
  }
  if (evidenceKind === EVIDENCE_KIND.OFFICIAL_WARNING && !times.issuedAt && !times.validAt) {
    throw new TypeError('official warning requires issuedAt or validAt');
  }

  const sourceRefs = [...new Set((input.sourceRefs ?? []).map((value) => requiredText(value, 'sourceRefs')))].sort();
  if (!sourceRefs.length) throw new TypeError('sourceRefs must contain at least one source');

  const normalized = {
    schemaVersion: 'earthus.signal.v2.0',
    signalId: requiredText(input.signalId, 'signalId'),
    variable: requiredText(input.variable, 'variable'),
    unit: input.unit ?? null,
    value: input.value ?? null,
    geometry: normalizeGeometry(input.geometry),
    vertical: input.vertical ? structuredClone(input.vertical) : null,
    times,
    sourceRefs,
    dataState,
    evidenceKind,
    confidence: Number.isFinite(input.confidence) ? clamp(input.confidence, 0, 1) : null,
    uncertainty: Number.isFinite(input.uncertainty) ? clamp(input.uncertainty, 0, 1) : null,
    spatialResolutionM: Number.isFinite(input.spatialResolutionM) ? Math.max(0, input.spatialResolutionM) : null,
    temporalResolutionSec: Number.isFinite(input.temporalResolutionSec) ? Math.max(0, input.temporalResolutionSec) : null,
    processorVersion: requiredText(input.processorVersion, 'processorVersion'),
    modelVersion: input.modelVersion ?? null,
    rightsClass: input.rightsClass ?? 'UNKNOWN',
    qualityFlags: Object.freeze([...(input.qualityFlags ?? [])]),
    provenance: Object.freeze(structuredClone(input.provenance ?? {})),
  };
  const fingerprintPayload = { ...normalized, signalId: undefined };
  return Object.freeze({ ...normalized, fingerprint: fnv1a64(stableStringify(fingerprintPayload)) });
}

export function isOfficialSafety(signal) {
  return signal?.evidenceKind === EVIDENCE_KIND.OFFICIAL_WARNING;
}

export function canPresentAsLive(signal) {
  return signal?.dataState === DATA_STATE.LIVE && signal?.evidenceKind === EVIDENCE_KIND.OFFICIAL_OBSERVATION;
}

export function deriveFreshnessState({ referenceAt, nowAt = new Date().toISOString(), liveSec, staleSec }) {
  if (![liveSec, staleSec].every(Number.isFinite) || liveSec < 0 || staleSec < liveSec) {
    throw new RangeError('freshness thresholds are invalid');
  }
  const reference = Date.parse(referenceAt);
  const now = Date.parse(nowAt);
  if (!Number.isFinite(reference) || !Number.isFinite(now)) return DATA_STATE.UNAVAILABLE;
  const ageSec = Math.max(0, (now - reference) / 1000);
  if (ageSec <= liveSec) return DATA_STATE.LIVE;
  if (ageSec <= staleSec) return DATA_STATE.STALE;
  return DATA_STATE.UNAVAILABLE;
}
