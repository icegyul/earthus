// Ocean Core v1 — 관측·모델 값을 같은 모양으로 읽되 의미는 섞지 않는다.
//
// 이 모듈은 순수 shadow 계약이다. 네트워크를 호출하거나 공개 reader를 바꾸지 않는다.
// 모델 격자를 부이 실측으로 승격하지 않고, 결측을 0으로 채우지 않으며, 조위에서 조류를
// 만들지 않는다. provider 권리도 manifest가 APPROVED일 때만 operation을 허용한다.

export const OCEAN_OBSERVATION_SCHEMA = 'earthus.ocean-observation.v1';
export const OCEAN_PROVIDER_MANIFEST_SCHEMA = 'earthus.ocean-provider-manifest.v1';

export const OCEAN_PROVENANCE = Object.freeze({
  MEASURED: 'MEASURED',
  FORECAST: 'FORECAST',
  INFERRED: 'INFERRED',
  USER_REPORTED: 'USER_REPORTED',
  SIMULATED: 'SIMULATED',
});

export const OCEAN_QUALITY = Object.freeze({
  FRESH: 'FRESH',
  AGING: 'AGING',
  STALE: 'STALE',
  FUTURE: 'FUTURE',
  UNKNOWN: 'UNKNOWN',
  REJECTED: 'REJECTED',
});

export const OCEAN_METRIC = Object.freeze({
  WAVE_HEIGHT: 'WAVE_HEIGHT',
  WAVE_DIRECTION: 'WAVE_DIRECTION',
  WAVE_PERIOD: 'WAVE_PERIOD',
  SWELL_HEIGHT: 'SWELL_HEIGHT',
  SWELL_DIRECTION: 'SWELL_DIRECTION',
  SWELL_PERIOD: 'SWELL_PERIOD',
  SEA_SURFACE_TEMPERATURE: 'SEA_SURFACE_TEMPERATURE',
  OCEAN_CURRENT_SPEED: 'OCEAN_CURRENT_SPEED',
  OCEAN_CURRENT_DIRECTION: 'OCEAN_CURRENT_DIRECTION',
  TIDE_HEIGHT: 'TIDE_HEIGHT',
  WIND_SPEED: 'WIND_SPEED',
  WIND_DIRECTION: 'WIND_DIRECTION',
  AIR_TEMPERATURE: 'AIR_TEMPERATURE',
  AIR_PRESSURE: 'AIR_PRESSURE',
});

const RIGHTS = new Set(['DRAFT', 'APPROVED', 'BLOCKED', 'EXPIRED']);
const OPERATIONS = new Set(['DISPLAY', 'CACHE', 'HISTORY', 'DERIVATIVE', 'EXPORT']);
const USABLE_QUALITY = new Set([OCEAN_QUALITY.FRESH, OCEAN_QUALITY.AGING]);
const FINITE = value => value !== null && value !== undefined && value !== ''
  && Number.isFinite(Number(value));

const GRID_FIELDS = Object.freeze({
  wave: { metric: OCEAN_METRIC.WAVE_HEIGHT, unit: 'm' },
  wdir: { metric: OCEAN_METRIC.WAVE_DIRECTION, unit: 'deg' },
  wper: { metric: OCEAN_METRIC.WAVE_PERIOD, unit: 's' },
  swell: { metric: OCEAN_METRIC.SWELL_HEIGHT, unit: 'm' },
  sper: { metric: OCEAN_METRIC.SWELL_PERIOD, unit: 's' },
  sst: { metric: OCEAN_METRIC.SEA_SURFACE_TEMPERATURE, unit: 'degC' },
  cur: { metric: OCEAN_METRIC.OCEAN_CURRENT_SPEED, unit: 'm/s' },
  cdir: { metric: OCEAN_METRIC.OCEAN_CURRENT_DIRECTION, unit: 'deg' },
});

const KMA_FIELDS = Object.freeze({
  wh: { metric: OCEAN_METRIC.WAVE_HEIGHT, unit: 'm' },
  wp: { metric: OCEAN_METRIC.WAVE_PERIOD, unit: 's' },
  tw: { metric: OCEAN_METRIC.SEA_SURFACE_TEMPERATURE, unit: 'degC' },
  ws: { metric: OCEAN_METRIC.WIND_SPEED, unit: 'm/s' },
  wd: { metric: OCEAN_METRIC.WIND_DIRECTION, unit: 'deg' },
});

const NDBC_FIELDS = Object.freeze({
  wvht: { metric: OCEAN_METRIC.WAVE_HEIGHT, unit: 'm' },
  dpd: { metric: OCEAN_METRIC.WAVE_PERIOD, unit: 's' },
  wtmp: { metric: OCEAN_METRIC.SEA_SURFACE_TEMPERATURE, unit: 'degC' },
  wspd: { metric: OCEAN_METRIC.WIND_SPEED, unit: 'm/s' },
  wdir: { metric: OCEAN_METRIC.WIND_DIRECTION, unit: 'deg' },
  atmp: { metric: OCEAN_METRIC.AIR_TEMPERATURE, unit: 'degC' },
  pres: { metric: OCEAN_METRIC.AIR_PRESSURE, unit: 'hPa' },
});

const OPEN_METEO_POINT_FIELDS = Object.freeze({
  wave_height: { metric: OCEAN_METRIC.WAVE_HEIGHT, unit: 'm' },
  wave_direction: { metric: OCEAN_METRIC.WAVE_DIRECTION, unit: 'deg' },
  wave_period: { metric: OCEAN_METRIC.WAVE_PERIOD, unit: 's' },
  swell_wave_height: { metric: OCEAN_METRIC.SWELL_HEIGHT, unit: 'm' },
  swell_wave_direction: { metric: OCEAN_METRIC.SWELL_DIRECTION, unit: 'deg' },
  swell_wave_period: { metric: OCEAN_METRIC.SWELL_PERIOD, unit: 's' },
  sea_surface_temperature: { metric: OCEAN_METRIC.SEA_SURFACE_TEMPERATURE, unit: 'degC' },
  ocean_current_velocity: { metric: OCEAN_METRIC.OCEAN_CURRENT_SPEED, unit: 'm/s' },
  ocean_current_direction: { metric: OCEAN_METRIC.OCEAN_CURRENT_DIRECTION, unit: 'deg' },
});

const SOURCE_UNIT_ALIASES = Object.freeze({
  m: 'm', s: 's', '°': 'deg', deg: 'deg', '°C': 'degC', degC: 'degC',
  'm/s': 'm/s', 'km/h': 'km/h', hPa: 'hPa',
});

function codedError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeIso(value) {
  const raw = String(value || '').trim();
  if (!raw || !/(Z|[+-]\d\d:\d\d)$/.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Open-Meteo의 offset 없는 ISO local time을 응답의 utc_offset_seconds로만 UTC화한다. */
export function openMeteoTimeToIso(value, document = {}) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  const direct = normalizeIso(value);
  if (direct) return direct;
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  let offsetSeconds = Number(document?.utc_offset_seconds);
  if (!Number.isFinite(offsetSeconds)
      && ['GMT', 'UTC'].includes(String(document?.timezone || '').toUpperCase())) offsetSeconds = 0;
  if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > 18 * 3600) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const second = Number(match[6] ?? 0);
  const milliseconds = Date.UTC(year, month - 1, day, hour, minute, second) - offsetSeconds * 1000;
  const localCheck = new Date(milliseconds + offsetSeconds * 1000);
  if (localCheck.getUTCFullYear() !== year || localCheck.getUTCMonth() !== month - 1
      || localCheck.getUTCDate() !== day || localCheck.getUTCHours() !== hour
      || localCheck.getUTCMinutes() !== minute || localCheck.getUTCSeconds() !== second) return null;
  return new Date(milliseconds).toISOString();
}

/** KMA 숫자 시각(YYYYMMDDHHMM[SS])은 명시적으로 KST로만 해석한다. */
export function parseKstCompactTime(value) {
  const raw = String(value || '').trim();
  if (!/^\d{12}(\d{2})?$/.test(raw)) return null;
  const year = +raw.slice(0, 4);
  const month = +raw.slice(4, 6);
  const day = +raw.slice(6, 8);
  const hour = +raw.slice(8, 10);
  const minute = +raw.slice(10, 12);
  const second = raw.length === 14 ? +raw.slice(12, 14) : 0;
  const ms = Date.UTC(year, month - 1, day, hour, minute, second) - 9 * 3600_000;
  const check = new Date(ms + 9 * 3600_000);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1
      || check.getUTCDate() !== day || check.getUTCHours() !== hour
      || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return null;
  return new Date(ms).toISOString();
}

export function evaluateOceanFreshness({ at, nowMs = Date.now(), policy } = {}) {
  const iso = normalizeIso(at);
  const freshFor = Number(policy?.freshForMinutes);
  const staleAfter = Number(policy?.staleAfterMinutes);
  const futureTolerance = Number(policy?.futureToleranceMinutes ?? 5);
  const forecastHorizon = Number(policy?.forecastHorizonMinutes);
  if (!iso) {
    return { status: OCEAN_QUALITY.UNKNOWN, usable: false, ageMinutes: null, reason: 'TIME_MISSING' };
  }
  if (![freshFor, staleAfter, futureTolerance].every(Number.isFinite)
      || freshFor < 0 || staleAfter < freshFor || futureTolerance < 0) {
    return { status: OCEAN_QUALITY.UNKNOWN, usable: false, ageMinutes: null, reason: 'POLICY_MISSING' };
  }
  const ageMinutes = (Number(nowMs) - Date.parse(iso)) / 60_000;
  if (!Number.isFinite(ageMinutes)) {
    return { status: OCEAN_QUALITY.UNKNOWN, usable: false, ageMinutes: null, reason: 'NOW_INVALID' };
  }
  if (ageMinutes < -futureTolerance) {
    if (Number.isFinite(forecastHorizon) && forecastHorizon > 0
        && -ageMinutes <= forecastHorizon) {
      return { status: OCEAN_QUALITY.FUTURE, usable: true, ageMinutes,
        reason: 'FORECAST_VALID_TIME' };
    }
    return { status: OCEAN_QUALITY.FUTURE, usable: false, ageMinutes, reason: 'TIME_IN_FUTURE' };
  }
  if (ageMinutes <= freshFor) {
    return { status: OCEAN_QUALITY.FRESH, usable: true, ageMinutes, reason: null };
  }
  if (ageMinutes <= staleAfter) {
    return { status: OCEAN_QUALITY.AGING, usable: true, ageMinutes, reason: 'PROVIDER_DELAY_POSSIBLE' };
  }
  return { status: OCEAN_QUALITY.STALE, usable: false, ageMinutes, reason: 'PROVIDER_DELAY' };
}

export function validateOceanProviderManifest(document) {
  if (document?.schema !== OCEAN_PROVIDER_MANIFEST_SCHEMA || document?.revision !== 1) {
    throw codedError('OCEAN_PROVIDER_MANIFEST_INVALID', 'Ocean provider manifest schema/revision invalid');
  }
  if (!Array.isArray(document.entries) || !document.entries.length) {
    throw codedError('OCEAN_PROVIDER_MANIFEST_EMPTY', 'Ocean provider manifest has no entries');
  }
  const seen = new Set();
  const entries = document.entries.map(raw => {
    const sourceId = String(raw?.sourceId || '').trim();
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(sourceId) || seen.has(sourceId)) {
      throw codedError('OCEAN_PROVIDER_SOURCE_ID_INVALID', `Invalid or duplicate sourceId: ${sourceId}`);
    }
    seen.add(sourceId);
    if (!RIGHTS.has(raw?.rightsStatus)) {
      throw codedError('OCEAN_PROVIDER_RIGHTS_INVALID', `${sourceId}: rightsStatus invalid`);
    }
    if (!Object.values(OCEAN_PROVENANCE).includes(raw?.provenance)) {
      throw codedError('OCEAN_PROVIDER_PROVENANCE_INVALID', `${sourceId}: provenance invalid`);
    }
    const allowedOperations = [...new Set(Array.isArray(raw?.allowedOperations) ? raw.allowedOperations : [])];
    if (allowedOperations.some(operation => !OPERATIONS.has(operation))) {
      throw codedError('OCEAN_PROVIDER_OPERATION_INVALID', `${sourceId}: operation invalid`);
    }
    return Object.freeze({
      sourceId,
      provider: String(raw?.provider || '').trim() || null,
      dataset: String(raw?.dataset || '').trim() || null,
      provenance: raw.provenance,
      rightsStatus: raw.rightsStatus,
      license: String(raw?.license || '').trim() || null,
      sourceUrl: String(raw?.sourceUrl || '').trim() || null,
      allowedOperations: Object.freeze(allowedOperations),
      freshnessPolicy: raw?.freshnessPolicy ? Object.freeze({ ...raw.freshnessPolicy }) : null,
      evidenceRefs: Object.freeze(Array.isArray(raw?.evidenceRefs) ? [...raw.evidenceRefs] : []),
    });
  });
  return Object.freeze({ schema: document.schema, revision: 1, entries: Object.freeze(entries) });
}

export function providerOperationAllowed(entry, operation) {
  return !!entry && RIGHTS.has(entry.rightsStatus) && OPERATIONS.has(operation)
    && entry.rightsStatus === 'APPROVED' && entry.allowedOperations.includes(operation);
}

export function providerById(manifest, sourceId) {
  const validated = validateOceanProviderManifest(manifest);
  return validated.entries.find(entry => entry.sourceId === sourceId) || null;
}

function normalizeUnit(value) {
  return SOURCE_UNIT_ALIASES[String(value ?? '').trim()] || null;
}

function locationValid(lat, lon) {
  return FINITE(lat) && FINITE(lon) && Number(lat) >= -90 && Number(lat) <= 90
    && Number(lon) >= -180 && Number(lon) <= 180;
}

function observationValueIssue(metric, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'VALUE_INVALID';
  if ([OCEAN_METRIC.WAVE_HEIGHT, OCEAN_METRIC.SWELL_HEIGHT].includes(metric)
      && (number < 0 || number > 30)) return 'WAVE_HEIGHT_OUT_OF_RANGE';
  if ([OCEAN_METRIC.WAVE_PERIOD, OCEAN_METRIC.SWELL_PERIOD].includes(metric)
      && number < 0) return 'WAVE_PERIOD_NEGATIVE';
  if ([OCEAN_METRIC.WAVE_DIRECTION, OCEAN_METRIC.SWELL_DIRECTION,
    OCEAN_METRIC.OCEAN_CURRENT_DIRECTION,
    OCEAN_METRIC.WIND_DIRECTION].includes(metric) && (number < 0 || number > 360)) {
    return 'DIRECTION_OUT_OF_RANGE';
  }
  if ([OCEAN_METRIC.OCEAN_CURRENT_SPEED, OCEAN_METRIC.WIND_SPEED].includes(metric)
      && number < 0) return 'SPEED_NEGATIVE';
  if (metric === OCEAN_METRIC.AIR_PRESSURE && number <= 0) return 'PRESSURE_INVALID';
  return null;
}

function makeObservation({
  metric, value, unit, sourceUnit, sourceField, sourceId, providerObjectId = null,
  provenance, observedAt = null, validFrom = null, validTo = null, generatedAt = null,
  lat, lon, depthM = null, rawValue = null, qualityFlags = [], nowMs, freshnessPolicy,
}) {
  if (!Object.values(OCEAN_METRIC).includes(metric) || !FINITE(value) || !unit
      || !Object.values(OCEAN_PROVENANCE).includes(provenance)
      || !locationValid(lat, lon) || observationValueIssue(metric, value)) {
    throw codedError('OCEAN_OBSERVATION_INVALID', `Invalid observation ${metric || sourceField || ''}`);
  }
  const timeForFreshness = provenance === OCEAN_PROVENANCE.MEASURED ? observedAt : validFrom;
  const freshness = evaluateOceanFreshness({ at: timeForFreshness, nowMs, policy: freshnessPolicy });
  return Object.freeze({
    schema: OCEAN_OBSERVATION_SCHEMA,
    metric,
    value: Number(value),
    unit,
    sourceUnit: normalizeUnit(sourceUnit) || sourceUnit || unit,
    sourceField,
    sourceId,
    providerObjectId,
    provenance,
    observedAt: normalizeIso(observedAt),
    validFrom: normalizeIso(validFrom),
    validTo: normalizeIso(validTo),
    generatedAt: normalizeIso(generatedAt),
    lat: Number(lat), lon: Number(lon),
    depthM: FINITE(depthM) ? Number(depthM) : null,
    rawValue: rawValue == null ? null : rawValue,
    qualityFlags: Object.freeze([...qualityFlags]),
    quality: freshness.status,
    freshness: Object.freeze(freshness),
  });
}

/** Open-Meteo Marine 격자 한 칸을 모델/예보 관측 계약으로 바꾼다. */
export function normalizeMarineGridCell(document, {
  index, sourceId = 'open-meteo-marine', nowMs = Date.now(), freshnessPolicy,
} = {}) {
  const nx = Number(document?.nx), ny = Number(document?.ny), res = Number(document?.res);
  const lat0 = Number(document?.lat0), lon0 = Number(document?.lon0), i = Number(index);
  if (![nx, ny, res, lat0, lon0, i].every(Number.isFinite)
      || nx <= 0 || ny <= 0 || i < 0 || i >= nx * ny || !Number.isInteger(i)) {
    throw codedError('OCEAN_GRID_INDEX_INVALID', 'Marine grid geometry/index invalid');
  }
  const row = Math.floor(i / nx), col = i % nx;
  const lat = lat0 + row * res, lon = lon0 + col * res;
  if (!locationValid(lat, lon)) throw codedError('OCEAN_GRID_LOCATION_INVALID');

  const fields = Array.isArray(document?.vars) ? document.vars : Object.keys(GRID_FIELDS);
  const observations = [], missingMetrics = [], rejected = [];
  for (const field of fields) {
    const def = GRID_FIELDS[field];
    if (!def) continue;
    const values = document?.[field];
    const value = Array.isArray(values) ? values[i] : null;
    if (value == null) {
      missingMetrics.push(def.metric);
      continue;
    }
    const sourceUnit = document?.units?.[field] ?? def.unit;
    const valueIssue = observationValueIssue(def.metric, value);
    if (valueIssue || normalizeUnit(sourceUnit) !== def.unit) {
      rejected.push({ metric: def.metric, sourceField: field, rawValue: value,
        reason: valueIssue || 'UNIT_MISMATCH', sourceUnit });
      continue;
    }
    observations.push(makeObservation({
      metric: def.metric, value, unit: def.unit, sourceUnit, sourceField: field,
      sourceId, provenance: OCEAN_PROVENANCE.FORECAST,
      observedAt: null, validFrom: document?.time, validTo: null,
      generatedAt: document?.generated ?? null, lat, lon,
      nowMs, freshnessPolicy,
    }));
  }
  return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1',
    sourceId, provenance: OCEAN_PROVENANCE.FORECAST,
    coordinates: Object.freeze({ lat, lon, row, col, index: i, resolutionDeg: res }),
    observations: Object.freeze(observations),
    missingMetrics: Object.freeze([...new Set(missingMetrics)]),
    rejected: Object.freeze(rejected),
  });
}

/** KMA 해상관측 지점 하나를 실측 계약으로 바꾼다. */
export function normalizeKmaMarineStation(document, station, {
  sourceId = 'kma-marine-observation', nowMs = Date.now(), freshnessPolicy,
} = {}) {
  if (!locationValid(station?.lat, station?.lon) || !station?.id) {
    throw codedError('OCEAN_KMA_STATION_INVALID', 'KMA station identity/location invalid');
  }
  const observedAt = parseKstCompactTime(station.tm);
  const observations = [], missingMetrics = [], rejected = [];
  for (const [field, def] of Object.entries(KMA_FIELDS)) {
    let sourceField = field;
    let value = station[field];
    if (field === 'wh' && value == null && FINITE(station.whSig)) {
      value = station.whSig;
      sourceField = 'whSig';
    }
    if (value == null) {
      missingMetrics.push(def.metric);
      continue;
    }
    const valueIssue = observationValueIssue(def.metric, value);
    if (valueIssue) {
      rejected.push({ metric: def.metric, sourceField, rawValue: value, reason: valueIssue });
      continue;
    }
    observations.push(makeObservation({
      metric: def.metric, value, unit: def.unit, sourceUnit: def.unit, sourceField,
      sourceId, providerObjectId: String(station.id), provenance: OCEAN_PROVENANCE.MEASURED,
      observedAt, validFrom: observedAt, validTo: null, generatedAt: document?.generated,
      lat: station.lat, lon: station.lon, rawValue: value,
      qualityFlags: Array.isArray(station.qualityFlags) ? station.qualityFlags : [],
      nowMs, freshnessPolicy,
    }));
  }
  if (station.wh == null && FINITE(station.whRaw)) {
    rejected.push({
      metric: OCEAN_METRIC.WAVE_HEIGHT, sourceField: 'whRaw', rawValue: Number(station.whRaw),
      reason: Array.isArray(station.qualityFlags) && station.qualityFlags.length
        ? station.qualityFlags.join(',') : 'SOURCE_REJECTED',
    });
  }
  return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1',
    sourceId, provenance: OCEAN_PROVENANCE.MEASURED,
    providerObjectId: String(station.id),
    observations: Object.freeze(observations),
    missingMetrics: Object.freeze([...new Set(missingMetrics)]),
    rejected: Object.freeze(rejected),
    source: Object.freeze({
      name: document?.source || null,
      license: document?.license || null,
      generatedAt: normalizeIso(document?.generated),
    }),
  });
}

/** NOAA NDBC/OSMC 부이 한 지점을 실측 계약으로 바꾼다. */
export function normalizeNdbcBuoy(document, buoy, {
  sourceId = 'noaa-ndbc-osmc', nowMs = Date.now(), freshnessPolicy,
} = {}) {
  if (!locationValid(buoy?.lat, buoy?.lon) || !buoy?.id) {
    throw codedError('OCEAN_NDBC_BUOY_INVALID', 'NDBC buoy identity/location invalid');
  }
  const observedAt = normalizeIso(buoy.time);
  const observations = [], missingMetrics = [], rejected = [];
  for (const [field, def] of Object.entries(NDBC_FIELDS)) {
    const value = buoy[field];
    if (value == null) {
      missingMetrics.push(def.metric);
      continue;
    }
    const valueIssue = observationValueIssue(def.metric, value);
    if (valueIssue) {
      rejected.push({ metric: def.metric, sourceField: field, rawValue: value, reason: valueIssue });
      continue;
    }
    observations.push(makeObservation({
      metric: def.metric, value, unit: def.unit, sourceUnit: def.unit, sourceField: field,
      sourceId, providerObjectId: String(buoy.id), provenance: OCEAN_PROVENANCE.MEASURED,
      observedAt, validFrom: observedAt, validTo: null, generatedAt: document?.generated,
      lat: buoy.lat, lon: buoy.lon, rawValue: value,
      nowMs, freshnessPolicy,
    }));
  }
  return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1',
    sourceId, provenance: OCEAN_PROVENANCE.MEASURED,
    providerObjectId: String(buoy.id),
    observations: Object.freeze(observations),
    missingMetrics: Object.freeze([...new Set(missingMetrics)]),
    rejected: Object.freeze(rejected),
    source: Object.freeze({
      name: document?.source || null,
      license: document?.license || null,
      generatedAt: normalizeIso(document?.generated),
      stationOwner: buoy?.meta?.ownerEn || buoy?.meta?.ownerKo || null,
      stationSource: buoy?.meta?.src || null,
    }),
  });
}

function convertOpenMeteoValue(value, sourceUnit, targetUnit) {
  const normalizedSource = normalizeUnit(sourceUnit);
  if (normalizedSource === targetUnit) return Number(value);
  if (normalizedSource === 'km/h' && targetUnit === 'm/s') return Number(value) / 3.6;
  return null;
}

/** Open-Meteo Marine의 current 한 지점을 모델/예보 계약으로 바꾼다. */
export function normalizeOpenMeteoMarinePoint(document, {
  sourceId = 'open-meteo-marine', nowMs = Date.now(), freshnessPolicy,
} = {}) {
  if (!locationValid(document?.latitude, document?.longitude)) {
    throw codedError('OCEAN_OPEN_METEO_LOCATION_INVALID', 'Open-Meteo point location invalid');
  }
  const current = document?.current && typeof document.current === 'object' ? document.current : {};
  const units = document?.current_units && typeof document.current_units === 'object'
    ? document.current_units : {};
  const validFrom = openMeteoTimeToIso(current.time, document);
  const observations = [], missingMetrics = [], rejected = [];
  for (const [field, def] of Object.entries(OPEN_METEO_POINT_FIELDS)) {
    const value = current[field];
    if (value == null) {
      missingMetrics.push(def.metric);
      continue;
    }
    if (!validFrom) {
      rejected.push({ metric: def.metric, sourceField: field, rawValue: value, reason: 'TIME_INVALID' });
      continue;
    }
    const sourceUnit = units[field];
    const converted = convertOpenMeteoValue(value, sourceUnit, def.unit);
    const valueIssue = converted == null ? 'UNIT_MISMATCH' : observationValueIssue(def.metric, converted);
    if (valueIssue) {
      rejected.push({ metric: def.metric, sourceField: field, rawValue: value,
        reason: valueIssue, sourceUnit: sourceUnit || null });
      continue;
    }
    observations.push(makeObservation({
      metric: def.metric, value: converted, unit: def.unit, sourceUnit, sourceField: field,
      sourceId, providerObjectId: FINITE(document?.location_id) ? String(document.location_id) : null,
      provenance: OCEAN_PROVENANCE.FORECAST,
      observedAt: null, validFrom, validTo: null, generatedAt: null,
      lat: document.latitude, lon: document.longitude, rawValue: value,
      qualityFlags: sourceUnit === 'km/h' && def.unit === 'm/s' ? ['UNIT_CONVERTED_KMH_TO_MS'] : [],
      nowMs, freshnessPolicy,
    }));
  }
  return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1',
    sourceId, provenance: OCEAN_PROVENANCE.FORECAST,
    providerObjectId: FINITE(document?.location_id) ? String(document.location_id) : null,
    coordinates: Object.freeze({ lat: Number(document.latitude), lon: Number(document.longitude),
      requestedLatitude: FINITE(document?.requestedLatitude) ? Number(document.requestedLatitude) : null,
      requestedLongitude: FINITE(document?.requestedLongitude) ? Number(document.requestedLongitude) : null }),
    observations: Object.freeze(observations),
    missingMetrics: Object.freeze([...new Set(missingMetrics)]),
    rejected: Object.freeze(rejected),
    source: Object.freeze({
      name: 'Open-Meteo Marine', validFrom,
      timezone: document?.timezone || null,
      utcOffsetSeconds: FINITE(document?.utc_offset_seconds) ? Number(document.utc_offset_seconds) : null,
    }),
  });
}

/** Open-Meteo Marine의 hourly 한 시점을 72시간 Surf/Fishing 계약으로 바꾼다. */
export function normalizeOpenMeteoMarineHourlyPoint(document, {
  index, sourceId = 'open-meteo-marine', nowMs = Date.now(), freshnessPolicy,
} = {}) {
  if (!locationValid(document?.latitude, document?.longitude)) {
    throw codedError('OCEAN_OPEN_METEO_LOCATION_INVALID', 'Open-Meteo hourly location invalid');
  }
  const hourly = document?.hourly && typeof document.hourly === 'object' ? document.hourly : {};
  const units = document?.hourly_units && typeof document.hourly_units === 'object'
    ? document.hourly_units : {};
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= (hourly.time?.length || 0)) {
    throw codedError('OCEAN_OPEN_METEO_HOURLY_INDEX_INVALID', 'Open-Meteo hourly index invalid');
  }
  const validFrom = openMeteoTimeToIso(hourly.time[i], document);
  const observations = [], missingMetrics = [], rejected = [];
  for (const [field, def] of Object.entries(OPEN_METEO_POINT_FIELDS)) {
    const values = hourly[field];
    const value = Array.isArray(values) ? values[i] : null;
    if (value == null) {
      missingMetrics.push(def.metric);
      continue;
    }
    if (!validFrom) {
      rejected.push({ metric: def.metric, sourceField: field, rawValue: value, reason: 'TIME_INVALID' });
      continue;
    }
    const sourceUnit = units[field];
    const converted = convertOpenMeteoValue(value, sourceUnit, def.unit);
    const valueIssue = converted == null ? 'UNIT_MISMATCH' : observationValueIssue(def.metric, converted);
    if (valueIssue) {
      rejected.push({ metric: def.metric, sourceField: field, rawValue: value,
        reason: valueIssue, sourceUnit: sourceUnit || null });
      continue;
    }
    observations.push(makeObservation({
      metric: def.metric, value: converted, unit: def.unit, sourceUnit, sourceField: field,
      sourceId, providerObjectId: FINITE(document?.location_id) ? String(document.location_id) : null,
      provenance: OCEAN_PROVENANCE.FORECAST,
      observedAt: null, validFrom, validTo: null, generatedAt: null,
      lat: document.latitude, lon: document.longitude, rawValue: value,
      qualityFlags: sourceUnit === 'km/h' && def.unit === 'm/s' ? ['UNIT_CONVERTED_KMH_TO_MS'] : [],
      nowMs, freshnessPolicy,
    }));
  }
  return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1', sourceId,
    provenance: OCEAN_PROVENANCE.FORECAST, validFrom,
    coordinates: Object.freeze({ lat: Number(document.latitude), lon: Number(document.longitude) }),
    observations: Object.freeze(observations),
    missingMetrics: Object.freeze([...new Set(missingMetrics)]),
    rejected: Object.freeze(rejected),
  });
}

/** Open-Meteo Marine의 hourly sea_level_height_msl 한 시점을 조위 예보로 바꾼다. */
export function normalizeOpenMeteoTidePoint(document, {
  index, sourceId = 'open-meteo-marine', nowMs = Date.now(), freshnessPolicy,
} = {}) {
  if (!locationValid(document?.latitude, document?.longitude)) {
    throw codedError('OCEAN_OPEN_METEO_LOCATION_INVALID', 'Open-Meteo tide location invalid');
  }
  const hourly = document?.hourly && typeof document.hourly === 'object' ? document.hourly : {};
  const units = document?.hourly_units && typeof document.hourly_units === 'object'
    ? document.hourly_units : {};
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= (hourly.time?.length || 0)) {
    throw codedError('OCEAN_OPEN_METEO_TIDE_INDEX_INVALID', 'Open-Meteo tide index invalid');
  }
  const validFrom = openMeteoTimeToIso(hourly.time[i], document);
  const value = hourly.sea_level_height_msl?.[i];
  if (value == null) return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1', sourceId,
    provenance: OCEAN_PROVENANCE.FORECAST, observations: Object.freeze([]),
    missingMetrics: Object.freeze([OCEAN_METRIC.TIDE_HEIGHT]), rejected: Object.freeze([]),
  });
  const sourceUnit = units.sea_level_height_msl;
  const converted = convertOpenMeteoValue(value, sourceUnit, 'm');
  if (!validFrom || converted == null) return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1', sourceId,
    provenance: OCEAN_PROVENANCE.FORECAST, observations: Object.freeze([]),
    missingMetrics: Object.freeze([]), rejected: Object.freeze([{
      metric: OCEAN_METRIC.TIDE_HEIGHT, sourceField: 'sea_level_height_msl', rawValue: value,
      reason: !validFrom ? 'TIME_INVALID' : 'UNIT_MISMATCH', sourceUnit: sourceUnit || null,
    }]),
  });
  const observation = makeObservation({
    metric: OCEAN_METRIC.TIDE_HEIGHT, value: converted, unit: 'm', sourceUnit,
    sourceField: 'sea_level_height_msl', sourceId,
    providerObjectId: FINITE(document?.location_id) ? String(document.location_id) : null,
    provenance: OCEAN_PROVENANCE.FORECAST,
    observedAt: null, validFrom, validTo: null, generatedAt: null,
    lat: document.latitude, lon: document.longitude, rawValue: value,
    qualityFlags: ['DATUM_GLOBAL_MEAN_SEA_LEVEL', 'COASTAL_NAVIGATION_UNSUITABLE'],
    nowMs, freshnessPolicy,
  });
  return Object.freeze({
    schema: 'earthus.ocean-normalization-result.v1', sourceId,
    provenance: OCEAN_PROVENANCE.FORECAST,
    observations: Object.freeze([observation]), missingMetrics: Object.freeze([]),
    rejected: Object.freeze([]),
    datum: 'GLOBAL_MEAN_SEA_LEVEL', navigationUseAllowed: false,
  });
}

/** 정확히 같은 metric만 activity input으로 고른다. 다른 값으로 결측을 추정하지 않는다. */
export function buildOceanActivityInputs(observations = [], metrics = []) {
  const provenanceRank = {
    [OCEAN_PROVENANCE.MEASURED]: 5,
    [OCEAN_PROVENANCE.FORECAST]: 4,
    [OCEAN_PROVENANCE.USER_REPORTED]: 3,
    [OCEAN_PROVENANCE.INFERRED]: 2,
    [OCEAN_PROVENANCE.SIMULATED]: 1,
  };
  const inputs = {}, missing = [];
  for (const metric of metrics) {
    const candidates = observations.filter(item => item?.metric === metric
      && (item?.freshness?.usable === true || USABLE_QUALITY.has(item?.quality)))
      .sort((a, b) => (provenanceRank[b.provenance] || 0) - (provenanceRank[a.provenance] || 0)
        || (Date.parse(b.observedAt || b.validFrom || 0) - Date.parse(a.observedAt || a.validFrom || 0)));
    if (!candidates.length) {
      inputs[metric] = Object.freeze({ value: null, observation: null, state: 'MISSING' });
      missing.push(metric);
    } else {
      inputs[metric] = Object.freeze({ value: candidates[0].value, observation: candidates[0], state: 'READY' });
    }
  }
  return Object.freeze({ inputs: Object.freeze(inputs), missing: Object.freeze(missing) });
}
