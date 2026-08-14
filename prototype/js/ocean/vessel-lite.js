// Vessel Lite v1 local contract.
// Pure policy module: no provider fetch, marker synthesis, timers or owned animation.

export const AIS_PROVIDER_MANIFEST_SCHEMA = 'earthus.ais-provider-manifest.v1';
export const VESSEL_VIEW_STATE = Object.freeze({
  LIVE: 'LIVE', DELAYED: 'DELAYED', HISTORICAL: 'HISTORICAL',
  EXTERNAL: 'EXTERNAL', UNAVAILABLE: 'UNAVAILABLE',
});

const PROVIDER_STATUS = Object.freeze(['DRAFT', 'APPROVED', 'DISABLED']);
const FEATURE_FLAG = Object.freeze(['OFF', 'SHADOW', 'PUBLIC']);
const LATENCY_CLASS = Object.freeze(['LIVE', 'DELAYED', 'HISTORICAL', 'EXTERNAL']);

export class VesselLiteError extends Error {
  constructor(code, details = {}) {
    super(code); this.name = 'VesselLiteError'; this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const fail = (code, details = {}) => { throw new VesselLiteError(code, details); };
const requireValue = (condition, code, details = {}) => { if (!condition) fail(code, details); };
const token = (value, code) => {
  const output = String(value || '').trim();
  requireValue(/^[A-Za-z0-9._:-]{1,120}$/.test(output), code); return output;
};
const utc = (value, code = 'VESSEL_UTC_REQUIRED') => {
  const parsed = Date.parse(value || ''); requireValue(Number.isFinite(parsed), code);
  return new Date(Math.floor(parsed / 1000) * 1000).toISOString();
};
const finite = (value, code) => {
  const output = Number(value); requireValue(Number.isFinite(output), code); return output;
};
const clone = value => globalThis.structuredClone
  ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

function safeHttps(value, code) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(code); }
  requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password, code);
  return parsed.toString();
}

function safeHttpsTemplate(value, code) {
  const template = String(value || '');
  requireValue(template.includes('{mmsi}'), 'AIS_EXTERNAL_MMSI_TEMPLATE_REQUIRED');
  safeHttps(template.replace('{mmsi}', '000000000'), code);
  return template;
}

function normalizeCoverage(coverage, providerStatus) {
  const status = coverage?.status;
  requireValue(['DRAFT', 'APPROVED'].includes(status), 'AIS_COVERAGE_STATUS_INVALID');
  const polygons = coverage?.polygons;
  requireValue(Array.isArray(polygons), 'AIS_COVERAGE_POLYGONS_REQUIRED');
  const normalized = polygons.map(polygon => {
    requireValue(Array.isArray(polygon) && polygon.length >= 4, 'AIS_COVERAGE_POLYGON_INVALID');
    const points = polygon.map(point => {
      requireValue(Array.isArray(point) && point.length === 2, 'AIS_COVERAGE_POINT_INVALID');
      const lon = finite(point[0], 'AIS_COVERAGE_LONGITUDE_INVALID');
      const lat = finite(point[1], 'AIS_COVERAGE_LATITUDE_INVALID');
      requireValue(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90,
        'AIS_COVERAGE_POINT_INVALID');
      return [lon, lat];
    });
    requireValue(points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1],
      'AIS_COVERAGE_POLYGON_MUST_CLOSE');
    return points;
  });
  if (providerStatus === 'APPROVED') {
    requireValue(status === 'APPROVED', 'AIS_APPROVED_PROVIDER_COVERAGE_NOT_APPROVED');
  }
  return freeze({ status, polygons: normalized });
}

function normalizeProvider(entry) {
  const id = token(entry?.id, 'AIS_PROVIDER_ID_REQUIRED');
  requireValue(PROVIDER_STATUS.includes(entry?.status), 'AIS_PROVIDER_STATUS_INVALID', { id });
  requireValue(FEATURE_FLAG.includes(entry?.featureFlag), 'AIS_PROVIDER_FEATURE_FLAG_INVALID', { id });
  requireValue(LATENCY_CLASS.includes(entry?.latencyClass), 'AIS_PROVIDER_LATENCY_CLASS_INVALID', { id });
  const coverage = normalizeCoverage(entry?.coverage, entry.status);
  const limits = entry?.rateLimit || {};
  const rateLimit = freeze({
    minZoom: finite(limits.minZoom, 'AIS_PROVIDER_MIN_ZOOM_REQUIRED'),
    maxBboxAreaDeg2: finite(limits.maxBboxAreaDeg2, 'AIS_PROVIDER_BBOX_LIMIT_REQUIRED'),
    maxPositionsPerRequest: finite(limits.maxPositionsPerRequest,
      'AIS_PROVIDER_POSITION_LIMIT_REQUIRED'),
  });
  requireValue(Number.isInteger(rateLimit.minZoom) && rateLimit.minZoom >= 0
    && rateLimit.maxBboxAreaDeg2 > 0
    && Number.isInteger(rateLimit.maxPositionsPerRequest)
    && rateLimit.maxPositionsPerRequest > 0 && rateLimit.maxPositionsPerRequest <= 10_000,
  'AIS_PROVIDER_RATE_LIMIT_INVALID', { id });
  const approved = entry.status === 'APPROVED';
  let freshness = null;
  if (entry.freshness) {
    freshness = freeze({
      liveMaxAgeSeconds: finite(entry.freshness.liveMaxAgeSeconds,
        'AIS_PROVIDER_LIVE_FRESHNESS_REQUIRED'),
      delayedMaxAgeSeconds: finite(entry.freshness.delayedMaxAgeSeconds,
        'AIS_PROVIDER_DELAYED_FRESHNESS_REQUIRED'),
      maxDisplayAgeSeconds: finite(entry.freshness.maxDisplayAgeSeconds,
        'AIS_PROVIDER_DISPLAY_FRESHNESS_REQUIRED'),
    });
    requireValue(freshness.liveMaxAgeSeconds >= 0
      && freshness.delayedMaxAgeSeconds >= freshness.liveMaxAgeSeconds
      && freshness.maxDisplayAgeSeconds >= freshness.delayedMaxAgeSeconds,
    'AIS_PROVIDER_FRESHNESS_INVALID', { id });
  }
  if (approved) requireValue(freshness, 'AIS_APPROVED_PROVIDER_FRESHNESS_REQUIRED', { id });
  const externalAllowed = entry?.external?.allowed === true;
  const external = freeze({ allowed: externalAllowed,
    vesselUrlTemplate: externalAllowed
      ? safeHttpsTemplate(entry.external.vesselUrlTemplate, 'AIS_EXTERNAL_URL_INVALID') : null });
  const attribution = String(entry?.attribution || '').trim();
  if (approved) {
    requireValue(attribution.length > 0, 'AIS_APPROVED_PROVIDER_ATTRIBUTION_REQUIRED', { id });
    requireValue(entry.termsUrl, 'AIS_APPROVED_PROVIDER_TERMS_REQUIRED', { id });
    requireValue(entry.licenseRevision, 'AIS_APPROVED_PROVIDER_LICENSE_REVISION_REQUIRED', { id });
    requireValue(entry.reviewedAt, 'AIS_APPROVED_PROVIDER_REVIEW_TIME_REQUIRED', { id });
  }
  return freeze({ id, status: entry.status, featureFlag: entry.featureFlag,
    latencyClass: entry.latencyClass, coverage,
    redistribution: entry?.redistribution === true,
    cacheTTLSeconds: Math.max(0, Math.floor(Number(entry?.cacheTTLSeconds) || 0)),
    historyAllowed: entry?.historyAllowed === true,
    attribution: attribution || null,
    termsUrl: entry?.termsUrl ? safeHttps(entry.termsUrl, 'AIS_PROVIDER_TERMS_URL_INVALID') : null,
    licenseRevision: entry?.licenseRevision ? String(entry.licenseRevision) : null,
    reviewedAt: entry?.reviewedAt ? utc(entry.reviewedAt) : null,
    rateLimit, freshness, external });
}

export function validateAisProviderManifest(raw) {
  requireValue(raw?.schema === AIS_PROVIDER_MANIFEST_SCHEMA, 'AIS_PROVIDER_MANIFEST_SCHEMA_INVALID');
  requireValue(raw?.revision, 'AIS_PROVIDER_MANIFEST_REVISION_REQUIRED');
  requireValue(Array.isArray(raw?.entries) && raw.entries.length > 0,
    'AIS_PROVIDER_MANIFEST_ENTRIES_REQUIRED');
  const entries = raw.entries.map(normalizeProvider);
  requireValue(new Set(entries.map(entry => entry.id)).size === entries.length,
    'AIS_PROVIDER_ID_DUPLICATE');
  return freeze({ schema: AIS_PROVIDER_MANIFEST_SCHEMA, revision: String(raw.revision), entries });
}

function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    const intersects = ((yi > lat) !== (yj > lat))
      && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointCovered(provider, lon, lat) {
  return provider.coverage.status === 'APPROVED'
    && provider.coverage.polygons.some(polygon => pointInPolygon(lon, lat, polygon));
}

function normalizeBbox(value) {
  requireValue(Array.isArray(value) && value.length === 4, 'VESSEL_BBOX_REQUIRED');
  const bbox = value.map(item => finite(item, 'VESSEL_BBOX_INVALID'));
  const [west, south, east, north] = bbox;
  requireValue(west >= -180 && east <= 180 && south >= -90 && north <= 90
    && west < east && south < north, 'VESSEL_BBOX_INVALID');
  return bbox;
}

function bboxIntersectsCoverage(provider, bbox) {
  const [west, south, east, north] = bbox;
  const probes = [[west, south], [west, north], [east, south], [east, north],
    [(west + east) / 2, (south + north) / 2]];
  if (probes.some(([lon, lat]) => pointCovered(provider, lon, lat))) return true;
  return provider.coverage.polygons.some(polygon => polygon.some(([lon, lat]) =>
    lon >= west && lon <= east && lat >= south && lat <= north));
}

function inBbox(lon, lat, bbox) {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function normalizeMmsi(value) {
  const mmsi = String(value || '').trim();
  requireValue(/^\d{9}$/.test(mmsi), 'VESSEL_MMSI_INVALID'); return mmsi;
}

function buildExternalLink(provider, mmsi) {
  if (!provider.external.allowed || !mmsi) return null;
  return provider.external.vesselUrlTemplate.replace('{mmsi}', encodeURIComponent(normalizeMmsi(mmsi)));
}

export function normalizeVesselPosition(raw, { provider, nowMs = Date.now(), historical = false } = {}) {
  requireValue(provider?.id, 'VESSEL_PROVIDER_REQUIRED');
  requireValue(raw?.providerId === provider.id, 'VESSEL_PROVIDER_MISMATCH');
  const lat = finite(raw.lat, 'VESSEL_LATITUDE_INVALID');
  const lon = finite(raw.lon, 'VESSEL_LONGITUDE_INVALID');
  requireValue(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180,
    'VESSEL_COORDINATES_INVALID');
  const observedAt = utc(raw.observedAt, 'VESSEL_OBSERVED_AT_REQUIRED');
  const receivedAt = utc(raw.receivedAt, 'VESSEL_RECEIVED_AT_REQUIRED');
  requireValue(Date.parse(receivedAt) >= Date.parse(observedAt), 'VESSEL_RECEIVED_BEFORE_OBSERVED');
  const ageSeconds = Math.floor((nowMs - Date.parse(observedAt)) / 1000);
  requireValue(ageSeconds >= -300, 'VESSEL_FUTURE_POSITION_REJECTED');
  const sogKn = raw.sog == null ? null : finite(raw.sog, 'VESSEL_SOG_INVALID');
  const cogDeg = raw.cog == null ? null : finite(raw.cog, 'VESSEL_COG_INVALID');
  const headingDeg = raw.heading == null ? null : finite(raw.heading, 'VESSEL_HEADING_INVALID');
  requireValue(sogKn == null || (sogKn >= 0 && sogKn <= 102.2), 'VESSEL_SOG_INVALID');
  requireValue(cogDeg == null || (cogDeg >= 0 && cogDeg < 360), 'VESSEL_COG_INVALID');
  requireValue(headingDeg == null || (headingDeg >= 0 && headingDeg < 360),
    'VESSEL_HEADING_INVALID');
  let state = VESSEL_VIEW_STATE.HISTORICAL;
  let freshnessStatus = 'HISTORICAL';
  if (!historical) {
    requireValue(provider.freshness, 'VESSEL_PROVIDER_FRESHNESS_REQUIRED');
    if (ageSeconds <= provider.freshness.liveMaxAgeSeconds && provider.latencyClass === 'LIVE') {
      state = VESSEL_VIEW_STATE.LIVE; freshnessStatus = 'FRESH';
    } else if (ageSeconds <= provider.freshness.maxDisplayAgeSeconds) {
      state = VESSEL_VIEW_STATE.DELAYED;
      freshnessStatus = ageSeconds <= provider.freshness.delayedMaxAgeSeconds ? 'DELAYED' : 'STALE';
    } else {
      state = VESSEL_VIEW_STATE.UNAVAILABLE; freshnessStatus = 'EXPIRED';
    }
  }
  return freeze({ schema: 'earthus.vessel-position.v1', mmsi: normalizeMmsi(raw.mmsi),
    coordinates: { lat, lon }, sogKn, cogDeg, headingDeg,
    navStatus: raw.navStatus == null ? null : String(raw.navStatus),
    observedAt, receivedAt, providerId: provider.id, state,
    freshness: { status: freshnessStatus, ageSeconds, realtimeBadgeAllowed: state === 'LIVE' } });
}

function unavailable(provider, reason, externalUrl = null) {
  return freeze({ schema: 'earthus.vessel-lite-view.v1', state: VESSEL_VIEW_STATE.UNAVAILABLE,
    reason, markers: [], track: [], realtimeBadgeAllowed: false,
    externalUrl, provider: provider ? { id: provider.id, attribution: provider.attribution,
      termsUrl: provider.termsUrl, licenseRevision: provider.licenseRevision } : null });
}

export function buildVesselLiteView({ manifest, providerId, mode = 'CURRENT', bbox, zoom,
  positions = [], vesselMmsi = null, nowMs = Date.now(), publicRequest = true } = {}) {
  const normalizedManifest = manifest?.schema === AIS_PROVIDER_MANIFEST_SCHEMA
    && Object.isFrozen(manifest) ? manifest : validateAisProviderManifest(manifest);
  const provider = normalizedManifest.entries.find(entry => entry.id === providerId);
  if (!provider) return unavailable(null, 'AIS_PROVIDER_NOT_FOUND');
  if (provider.status !== 'APPROVED' || provider.featureFlag === 'OFF'
    || (publicRequest && provider.featureFlag !== 'PUBLIC')) {
    return unavailable(provider, 'AIS_PROVIDER_NOT_PUBLIC');
  }
  const queryBbox = normalizeBbox(bbox);
  const queryZoom = finite(zoom, 'VESSEL_ZOOM_REQUIRED');
  const area = (queryBbox[2] - queryBbox[0]) * (queryBbox[3] - queryBbox[1]);
  if (queryZoom < provider.rateLimit.minZoom || area > provider.rateLimit.maxBboxAreaDeg2) {
    return unavailable(provider, 'AIS_QUERY_LIMITED');
  }
  if (!bboxIntersectsCoverage(provider, queryBbox)) {
    return unavailable(provider, 'AIS_COVERAGE_UNAVAILABLE', buildExternalLink(provider, vesselMmsi));
  }
  const externalUrl = buildExternalLink(provider, vesselMmsi);
  if (mode === 'EXTERNAL' || provider.latencyClass === 'EXTERNAL' || !provider.redistribution) {
    if (!externalUrl) return unavailable(provider, 'AIS_REDISTRIBUTION_NOT_ALLOWED');
    return freeze({ schema: 'earthus.vessel-lite-view.v1', state: VESSEL_VIEW_STATE.EXTERNAL,
      reason: 'OPEN_APPROVED_EXTERNAL_PROVIDER', markers: [], track: [], realtimeBadgeAllowed: false,
      externalUrl, provider: { id: provider.id, attribution: provider.attribution,
        termsUrl: provider.termsUrl, licenseRevision: provider.licenseRevision } });
  }
  requireValue(['CURRENT', 'HISTORICAL'].includes(mode), 'VESSEL_MODE_INVALID');
  if (mode === 'HISTORICAL' && !provider.historyAllowed) {
    return unavailable(provider, 'AIS_HISTORY_NOT_LICENSED', externalUrl);
  }
  const historical = mode === 'HISTORICAL';
  const filtered = positions.filter(raw => raw?.providerId === provider.id)
    .map(raw => normalizeVesselPosition(raw, { provider, nowMs, historical }))
    .filter(item => pointCovered(provider, item.coordinates.lon, item.coordinates.lat)
      && inBbox(item.coordinates.lon, item.coordinates.lat, queryBbox)
      && (historical || item.state !== VESSEL_VIEW_STATE.UNAVAILABLE));
  const limited = filtered.slice(0, provider.rateLimit.maxPositionsPerRequest);
  if (limited.length === 0) return unavailable(provider,
    historical ? 'AIS_HISTORY_EMPTY' : 'AIS_POSITION_EMPTY', externalUrl);
  const state = historical ? VESSEL_VIEW_STATE.HISTORICAL
    : limited.some(item => item.state === VESSEL_VIEW_STATE.LIVE)
      ? VESSEL_VIEW_STATE.LIVE : VESSEL_VIEW_STATE.DELAYED;
  return freeze({ schema: 'earthus.vessel-lite-view.v1', state,
    reason: historical ? 'LICENSED_PAST_TRACK' : state === 'LIVE' ? 'PROVIDER_FRESH' : 'PROVIDER_DELAYED',
    markers: historical ? [] : limited,
    track: historical ? limited : [],
    realtimeBadgeAllowed: state === 'LIVE', externalUrl,
    truncated: filtered.length > limited.length,
    provider: { id: provider.id, attribution: provider.attribution,
      termsUrl: provider.termsUrl, licenseRevision: provider.licenseRevision } });
}
