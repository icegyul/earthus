// EARTHUS 선택 이용행태 분석 계약.
// 좌표·자유문구·연락처·토큰·원 provider payload는 브라우저에서도 먼저 거절하고,
// 같은 allowlist를 Supabase trigger가 다시 검증한다.

export const ANALYTICS_CATALOG_VERSION = 'earthus.analytics.v1';
export const ANALYTICS_RETENTION_VERSION = 'earthus.analytics-retention.365d.v1';
export const ANALYTICS_CONSENT_VERSION = 'earthus.usage-consent.v1';

export const ANALYTICS_EVENTS = Object.freeze({
  'app.opened': ['locale', 'viewportBucket', 'entryKind'],
  'earth_style.opened': ['entryKind'],
  'layer.selected': ['layerId', 'state', 'sourceStatusClass'],
  'evidence.opened': ['signalType', 'evidenceClass'],
  'decision.viewed': ['activityProfile', 'safetyClass', 'confidenceBand'],
  'activity.profile_selected': ['profileId'],
  'reservation.impact_viewed': ['impactClass', 'providerResultClass'],
  'aetherus.opened': ['entryKind'],
  'aetherus.scene_selected': ['sceneId'],
  'error.shown': ['reasonCode', 'surface', 'recoverable'],
  'offline.entered': ['cacheVersion', 'staleBand'],
  'action.proposed': ['actionType', 'confirmationRequired'],
});

export const ANALYTICS_FORBIDDEN_KEYS = Object.freeze([
  'latitude', 'longitude', 'lat', 'lon', 'address', 'searchText', 'questionText',
  'healthState', 'reservationId', 'paymentKey', 'email', 'phone', 'accessToken',
  'serviceKey', 'rawProviderPayload', 'preciseCameraState', 'sensitiveSpeciesCoordinate',
  'ip', 'userAgent', 'stack', 'message',
]);

const forbidden = new Set(ANALYTICS_FORBIDDEN_KEYS);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const CATEGORY = /^[A-Z][A-Z0-9_.:-]{0,79}$/;
const LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const ID_KEYS = new Set(['layerId', 'signalType', 'activityProfile', 'profileId', 'sceneId', 'cacheVersion']);
const CATEGORY_KEYS = new Set([
  'viewportBucket', 'entryKind', 'state', 'sourceStatusClass', 'evidenceClass',
  'safetyClass', 'confidenceBand', 'impactClass', 'providerResultClass', 'reasonCode',
  'surface', 'staleBand', 'actionType',
]);
const BOOLEAN_KEYS = new Set(['recoverable', 'confirmationRequired']);

export function viewportBucket(width) {
  const n = Number(width);
  if (!Number.isFinite(n) || n <= 0) return 'UNKNOWN';
  if (n < 480) return 'MOBILE_SMALL';
  if (n < 768) return 'MOBILE';
  if (n < 1024) return 'TABLET';
  if (n < 1440) return 'DESKTOP';
  return 'DESKTOP_WIDE';
}

export function sanitizeAnalyticsProperties(eventName, properties = {}) {
  const allowed = ANALYTICS_EVENTS[eventName];
  if (!allowed) throw new Error('ANALYTICS_EVENT_NOT_CATALOGUED');
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    throw new Error('ANALYTICS_PROPERTIES_NOT_OBJECT');
  }
  const out = {};
  for (const [key, value] of Object.entries(properties)) {
    if (forbidden.has(key) || !allowed.includes(key)) {
      throw new Error(`ANALYTICS_PROPERTY_NOT_ALLOWED:${key}`);
    }
    if (value == null) {
      out[key] = value;
      continue;
    }
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof value !== 'boolean') throw new Error(`ANALYTICS_PROPERTY_NOT_BOOLEAN:${key}`);
      out[key] = value;
      continue;
    }
    if (typeof value !== 'string' || value.length > 80) {
      throw new Error(`ANALYTICS_PROPERTY_INVALID:${key}`);
    }
    if (key === 'locale' && !LOCALE.test(value)) throw new Error('ANALYTICS_LOCALE_INVALID');
    if (ID_KEYS.has(key) && !ID.test(value)) {
      throw new Error(`ANALYTICS_ID_INVALID:${key}`);
    }
    if (CATEGORY_KEYS.has(key) && !CATEGORY.test(value)) {
      throw new Error(`ANALYTICS_CATEGORY_INVALID:${key}`);
    }
    out[key] = value;
  }
  return Object.freeze(out);
}

export function analyticsSurface(eventName) {
  if (eventName.startsWith('aetherus.')) return 'aetherus';
  if (eventName === 'offline.entered' || eventName === 'error.shown') return 'system';
  return 'earth';
}

export function buildAnalyticsRow({
  eventName, properties, userId, sessionPseudonym, occurredAt, consentVersion,
  privacyVersion, eventId,
}) {
  if (!/^[a-f0-9-]{36}$/.test(String(eventId || ''))) throw new Error('ANALYTICS_EVENT_ID_INVALID');
  if (!/^[a-f0-9]{32}$/.test(String(sessionPseudonym || ''))) {
    throw new Error('ANALYTICS_SESSION_INVALID');
  }
  if (!/^[a-f0-9-]{36}$/.test(String(userId || ''))) throw new Error('ANALYTICS_USER_INVALID');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(privacyVersion || ''))) {
    throw new Error('ANALYTICS_PRIVACY_VERSION_INVALID');
  }
  const time = new Date(occurredAt);
  if (!Number.isFinite(time.getTime())) throw new Error('ANALYTICS_TIME_INVALID');
  return Object.freeze({
    event_id: eventId,
    user_id: userId,
    event_name: eventName,
    event_version: 1,
    occurred_at: time.toISOString(),
    session_pseudonym: sessionPseudonym,
    consent_version: consentVersion,
    privacy_version: privacyVersion,
    catalog_version: ANALYTICS_CATALOG_VERSION,
    retention_version: ANALYTICS_RETENTION_VERSION,
    surface: analyticsSurface(eventName),
    properties: sanitizeAnalyticsProperties(eventName, properties),
  });
}
