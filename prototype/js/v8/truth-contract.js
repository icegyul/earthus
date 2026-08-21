export const DATA_CLASS = Object.freeze({
  OBSERVED: 'OBSERVED',
  OFFICIAL_FORECAST: 'OFFICIAL_FORECAST',
  OFFICIAL_WARNING: 'OFFICIAL_WARNING',
  MODEL_OUTPUT: 'MODEL_OUTPUT',
  EARTHUS_DERIVED: 'EARTHUS_DERIVED',
  SIMULATION: 'SIMULATION',
});

export const ACCESS_CLASS = Object.freeze({
  PUBLIC: 'PUBLIC',
  PREMIUM: 'PREMIUM',
  ALWAYS_FREE_SAFETY: 'ALWAYS_FREE_SAFETY',
  INTERNAL_SHADOW: 'INTERNAL_SHADOW',
  BLOCKED_RIGHTS: 'BLOCKED_RIGHTS',
});

const TIME_KEYS = ['observedAt', 'issuedAt', 'validAt', 'receivedAt'];
const DATA_CLASSES = new Set(Object.values(DATA_CLASS));

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}

function normalizeTimes(times) {
  if (!times || typeof times !== 'object') throw new TypeError('times is required');
  return Object.fromEntries(TIME_KEYS.map(key => {
    const value = times[key] ?? null;
    if (value !== null && Number.isNaN(Date.parse(value))) throw new TypeError(`${key} must be an ISO date-time or null`);
    return [key, value];
  }));
}

export function classifyAccess({ dataClass, rightsAllowed = true, shadow = false }) {
  if (!DATA_CLASSES.has(dataClass)) throw new TypeError(`unknown dataClass: ${dataClass}`);
  if (!rightsAllowed) return ACCESS_CLASS.BLOCKED_RIGHTS;
  if (dataClass === DATA_CLASS.OFFICIAL_WARNING) return ACCESS_CLASS.ALWAYS_FREE_SAFETY;
  if (shadow) return ACCESS_CLASS.INTERNAL_SHADOW;
  if (dataClass === DATA_CLASS.EARTHUS_DERIVED) return ACCESS_CLASS.PREMIUM;
  return ACCESS_CLASS.PUBLIC;
}

export function makeCanonicalSignal(input) {
  const signalId = requiredText(input?.signalId, 'signalId');
  const variable = requiredText(input?.variable, 'variable');
  if (!DATA_CLASSES.has(input?.dataClass)) throw new TypeError(`unknown dataClass: ${input?.dataClass}`);
  if (!input?.geometry || typeof input.geometry !== 'object') throw new TypeError('geometry is required');
  if (!Array.isArray(input.sourceRefs) || input.sourceRefs.length === 0) throw new TypeError('sourceRefs must contain at least one source reference');
  const sourceRefs = [...new Set(input.sourceRefs.map(ref => requiredText(ref, 'sourceRefs')))].sort();
  return Object.freeze({
    schemaVersion: '8.0',
    signalId,
    variable,
    dataClass: input.dataClass,
    accessClass: classifyAccess({ dataClass: input.dataClass, rightsAllowed: input.rightsAllowed, shadow: input.shadow }),
    value: input.value ?? null,
    unit: input.unit ?? null,
    geometry: structuredClone(input.geometry),
    vertical: input.vertical ? structuredClone(input.vertical) : null,
    times: normalizeTimes(input.times),
    sourceRefs,
    quality: structuredClone(input.quality ?? { state: 'UNKNOWN', flags: [] }),
  });
}

export function signalLiveState(signal, nowIso = new Date().toISOString(), freshnessSeconds = 300) {
  if (signal?.dataClass !== DATA_CLASS.OBSERVED) return 'NOT_LIVE';
  const observedAt = signal?.times?.observedAt;
  const nowMs = Date.parse(nowIso);
  const observedMs = Date.parse(observedAt);
  if (!observedAt || Number.isNaN(nowMs) || Number.isNaN(observedMs)) return 'UNKNOWN';
  const ageSeconds = Math.max(0, (nowMs - observedMs) / 1000);
  return ageSeconds <= freshnessSeconds ? 'LIVE' : 'STALE';
}
