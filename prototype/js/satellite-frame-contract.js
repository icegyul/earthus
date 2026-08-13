/* EARTHUS 위성 프레임 공통 계약.
 *
 * 이 모듈은 관측 영상을 예쁘게 만드는 코드가 아니다. NOAA GMGSI, 천리안2A,
 * 히마와리9 adapter가 서로 다른 출처·시각·채널을 한 장면처럼 뭉개지 못하게 하는
 * 경계다. PR-00에서는 운영 entry에 연결하지 않고 fixture와 진단에서 먼저 검증한다.
 *
 * ⚠️ 시각 효과는 실제 구름 높이·강수량·위험 자료가 아니다. 이 계약을 통과해도
 *    별도 rights/freshness gate 없이는 공개·내보내기·판단 입력이 되지 않는다. */

export const SATELLITE_FRAME_SCHEMA = 'earthus.satellite-frame.v1';

export const SATELLITE_FRAME_FAILURE = Object.freeze([
  'UNAVAILABLE',
  'STALE',
  'UNUSABLE_AT_NIGHT',
  'SCHEMA_MISMATCH',
  'CORS_BLOCKED',
  'DECODE_FAILED',
]);

const PROVIDERS = new Set(['NOAA_GMGSI', 'GK2A', 'HIMAWARI_GIBS']);
const AREAS = new Set(['FD', 'EA', 'LA', 'GLOBAL']);
const PIXEL_ENCODINGS = new Set(['gray-alpha', 'rgba-palette', 'visible-rgb']);
const ALPHA_MEANINGS = new Set(['cloud-confidence', 'processed-mask', 'none']);
const ROOT_FIELDS = new Set([
  'schema', 'provider', 'channel', 'observedAt', 'publishedAt', 'area', 'bbox',
  'resolutionKm', 'signalPercent', 'pixelEncoding', 'alphaMeaning', 'usable', 'provenance',
]);
const BBOX_FIELDS = new Set(['west', 'south', 'east', 'north']);
const USABLE_FIELDS = new Set(['day', 'night']);
const PROVENANCE_FIELDS = new Set([
  'producer', 'distributor', 'processingVersion', 'sourceUrl', 'licenseId',
]);

export class SatelliteFrameContractError extends Error {
  constructor(code, path, message) {
    super(`${code}:${path}${message ? `:${message}` : ''}`);
    this.name = 'SatelliteFrameContractError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message = '') {
  throw new SatelliteFrameContractError(code, path, message);
}

function plainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('OBJECT_REQUIRED', path);
  }
  return value;
}

function exactFields(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('UNKNOWN_FIELD', `${path}.${key}`);
  }
}

function requiredText(value, path, max = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    fail('TEXT_REQUIRED', path);
  }
  return value.trim();
}

function isoInstant(value, path, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) {
    fail('ISO_INSTANT_REQUIRED', path);
  }
  return new Date(value).toISOString();
}

function finiteNumber(value, path, minimum, maximum, { exclusiveMinimum = false } = {}) {
  if (!Number.isFinite(value)
      || (exclusiveMinimum ? value <= minimum : value < minimum)
      || value > maximum) {
    fail('NUMBER_OUT_OF_RANGE', path, `${minimum}..${maximum}`);
  }
  return value;
}

function enumValue(value, allowed, path) {
  if (!allowed.has(value)) fail('ENUM_MISMATCH', path, String(value));
  return value;
}

function booleanValue(value, path) {
  if (typeof value !== 'boolean') fail('BOOLEAN_REQUIRED', path);
  return value;
}

function httpsUrl(value, path) {
  const text = requiredText(value, path, 2048);
  let parsed;
  try { parsed = new URL(text); } catch (_) { fail('HTTPS_URL_REQUIRED', path); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fail('HTTPS_URL_REQUIRED', path);
  }
  return parsed.href;
}

/**
 * SatelliteFrameContract v1을 엄격하게 검증하고 canonical 복사본을 돌려준다.
 * 입력 객체를 고치지 않으며 freshness·rights 승인까지 대신하지 않는다.
 */
export function validateSatelliteFrame(input) {
  const frame = plainObject(input, '$');
  exactFields(frame, ROOT_FIELDS, '$');
  if (frame.schema !== SATELLITE_FRAME_SCHEMA) fail('SCHEMA_MISMATCH', '$.schema');

  const bbox = plainObject(frame.bbox, '$.bbox');
  exactFields(bbox, BBOX_FIELDS, '$.bbox');
  const west = finiteNumber(bbox.west, '$.bbox.west', -180, 180);
  const south = finiteNumber(bbox.south, '$.bbox.south', -90, 90);
  const east = finiteNumber(bbox.east, '$.bbox.east', -180, 180);
  const north = finiteNumber(bbox.north, '$.bbox.north', -90, 90);
  if (west >= east) fail('BBOX_ORDER_INVALID', '$.bbox.west');
  if (south >= north) fail('BBOX_ORDER_INVALID', '$.bbox.south');

  const usable = plainObject(frame.usable, '$.usable');
  exactFields(usable, USABLE_FIELDS, '$.usable');
  const provenance = plainObject(frame.provenance, '$.provenance');
  exactFields(provenance, PROVENANCE_FIELDS, '$.provenance');

  const provider = enumValue(frame.provider, PROVIDERS, '$.provider');
  const channel = requiredText(frame.channel, '$.channel', 120);
  const observedAt = isoInstant(frame.observedAt, '$.observedAt');
  const publishedAt = isoInstant(frame.publishedAt, '$.publishedAt', true);
  if (publishedAt && Date.parse(publishedAt) < Date.parse(observedAt)) {
    fail('PUBLISHED_BEFORE_OBSERVED', '$.publishedAt');
  }

  const normalized = {
    schema: SATELLITE_FRAME_SCHEMA,
    provider,
    channel,
    observedAt,
    publishedAt,
    area: enumValue(frame.area, AREAS, '$.area'),
    bbox: { west, south, east, north },
    resolutionKm: finiteNumber(frame.resolutionKm, '$.resolutionKm', 0, 100, { exclusiveMinimum: true }),
    signalPercent: finiteNumber(frame.signalPercent, '$.signalPercent', 0, 100),
    pixelEncoding: enumValue(frame.pixelEncoding, PIXEL_ENCODINGS, '$.pixelEncoding'),
    alphaMeaning: enumValue(frame.alphaMeaning, ALPHA_MEANINGS, '$.alphaMeaning'),
    usable: {
      day: booleanValue(usable.day, '$.usable.day'),
      night: booleanValue(usable.night, '$.usable.night'),
    },
    provenance: {
      producer: requiredText(provenance.producer, '$.provenance.producer'),
      distributor: requiredText(provenance.distributor, '$.provenance.distributor'),
      processingVersion: requiredText(provenance.processingVersion, '$.provenance.processingVersion', 120),
      sourceUrl: httpsUrl(provenance.sourceUrl, '$.provenance.sourceUrl'),
      licenseId: requiredText(provenance.licenseId, '$.provenance.licenseId', 120),
    },
  };

  /* 알파가 없는데 alpha 기반 mask라고 주장하면 시각 효과가 원자료 의미를 지어낸다. */
  if (normalized.pixelEncoding === 'visible-rgb' && normalized.alphaMeaning !== 'none') {
    fail('ALPHA_SEMANTICS_INVALID', '$.alphaMeaning');
  }
  if (normalized.pixelEncoding === 'gray-alpha' && normalized.alphaMeaning === 'none') {
    fail('ALPHA_SEMANTICS_INVALID', '$.alphaMeaning');
  }

  return normalized;
}

export function satelliteFrameId(frame) {
  const valid = validateSatelliteFrame(frame);
  return `${valid.provider}/${encodeURIComponent(valid.channel)}/${valid.observedAt}`;
}
