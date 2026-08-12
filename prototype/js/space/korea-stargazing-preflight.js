// Nationwide Korea stargazing evidence preflight.
// It does not fetch weather, infer missing sky data, select a place, or make a recommendation.
// KMA warning safety is an upstream hard gate; each sky/astronomy input must carry its own evidence.

export const KOREA_STARGAZING_PREFLIGHT_SCHEMA = 'aetherus.korea-stargazing-preflight.v1';
export class KoreaStargazingPreflightError extends Error { constructor(code) { super(code); this.name = 'KoreaStargazingPreflightError'; this.code = code; } }
const fail = code => { throw new KoreaStargazingPreflightError(code); };
const need = (value, code) => { if (!value) fail(code); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const iso = (value, code) => { const date = new Date(value); need(Number.isFinite(date.getTime()), code); return date.toISOString(); };
const finite = value => Number.isFinite(Number(value));
const REQUIRED = Object.freeze([
  ['CLOUD_COVER', '%'], ['VISIBILITY', 'm'], ['RELATIVE_HUMIDITY', '%'], ['PRECIPITATION_PROBABILITY', '%'],
  ['MOON_ILLUMINATION', '%'], ['DARKNESS_MARGIN', 'min'],
]);

function inKorea(coords) { const lat = Number(coords?.lat), lon = Number(coords?.lon); return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 32 && lat <= 39.8 && lon >= 124 && lon <= 132.5; }
function validSignal(signal, factor, unit, nowMs) {
  if (!signal || signal.factor !== factor || signal.unit !== unit || !finite(signal.value)) return null;
  if (typeof signal.sourceUrl !== 'string' || !/^https:\/\//.test(signal.sourceUrl) || typeof signal.revision !== 'string' || !signal.revision.trim()) return null;
  const observed = Date.parse(signal.observedAtUtc); if (!Number.isFinite(observed) || observed > nowMs + 5 * 60_000 || nowMs - observed > 6 * 60 * 60_000) return null;
  return freeze({ factor, value: Number(signal.value), unit, sourceUrl: signal.sourceUrl, observedAtUtc: new Date(observed).toISOString(), revision: signal.revision.trim(), provenance: signal.provenance || 'observation' });
}

export function evaluateKoreaStargazingPreflight({ coords, timeWindow, safety, signals, evaluatedAtUtc } = {}) {
  const evaluatedAt = iso(evaluatedAtUtc, 'PREFLIGHT_EVALUATED_AT_REQUIRED'); const nowMs = Date.parse(evaluatedAt);
  const start = iso(timeWindow?.start, 'PREFLIGHT_WINDOW_START_REQUIRED'); const end = iso(timeWindow?.end, 'PREFLIGHT_WINDOW_END_REQUIRED'); need(Date.parse(end) > Date.parse(start), 'PREFLIGHT_WINDOW_INVALID');
  const base = { schemaVersion: KOREA_STARGAZING_PREFLIGHT_SCHEMA, countryCode: 'KR', evaluatedAtUtc: evaluatedAt, timeWindow: { start, end }, action: null, publicRecommendation: null, reservation: null, signals: [] };
  if (!inKorea(coords)) return freeze({ ...base, state: 'OUT_OF_KOREA_SCOPE', reasonCodes: ['KOREA_ONLY_PREFLIGHT'], safety: null });
  if (!safety || safety.applies !== true || safety.engineVersion !== 'earthus.safety.warning.v1') return freeze({ ...base, state: 'WITHHELD', reasonCodes: ['KMA_SAFETY_EVIDENCE_REQUIRED'], safety: safety || null });
  if (safety.blocksPositiveRecommendation !== false || safety.status === 'UNKNOWN' || safety.status === 'DANGER' || safety.status === 'WARNING') return freeze({ ...base, state: 'WITHHELD', reasonCodes: ['KMA_SAFETY_BLOCKED_OR_UNKNOWN'], safety });
  const sourceSignals = Array.isArray(signals) ? signals : [];
  const normalized = REQUIRED.map(([factor, unit]) => validSignal(sourceSignals.find(value => value?.factor === factor), factor, unit, nowMs));
  const missing = REQUIRED.filter((_, index) => !normalized[index]).map(([factor]) => factor);
  if (missing.length) return freeze({ ...base, state: 'WITHHELD', reasonCodes: ['STARGAZING_EVIDENCE_INCOMPLETE', ...missing.map(factor => `MISSING_OR_STALE:${factor}`)], safety, signals: normalized.filter(Boolean) });
  return freeze({ ...base, state: 'EVIDENCE_READY_CALIBRATION_SHADOW', reasonCodes: ['NATIONWIDE_KOREA_NO_PLACE_OR_RESERVATION_SCOPE', 'PUBLIC_RECOMMENDATION_DISABLED'], safety, signals: normalized });
}
