// Earthus Weather Card v7 canonical view model.
// Values are normalized here before any panel decides how to render them.

export const DATA_STATE = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  MISSING: 'MISSING',
  STALE: 'STALE',
  ESTIMATED: 'ESTIMATED',
  INVALID: 'INVALID',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  CONFLICTING: 'CONFLICTING',
});

export const SOURCE_TYPE = Object.freeze({
  OBSERVED: 'OBSERVED',
  OFFICIAL_FORECAST: 'OFFICIAL_FORECAST',
  OFFICIAL_WARNING: 'OFFICIAL_WARNING',
  MODEL_FORECAST: 'MODEL_FORECAST',
  EARTHUS_ESTIMATE: 'EARTHUS_ESTIMATE',
});

const KMA_OBSERVATION_STALE_MS = 15 * 60_000;
const AIR_OBSERVATION_STALE_MS = 90 * 60_000;

const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));

export function buildWeatherQueryV7(lat, lon) {
  return new URLSearchParams({
    latitude: Number(lat).toFixed(4),
    longitude: Number(lon).toFixed(4),
    current: [
      'temperature_2m', 'relative_humidity_2m', 'dew_point_2m',
      'apparent_temperature', 'precipitation', 'weather_code',
      'surface_pressure', 'wind_speed_10m', 'wind_direction_10m',
      'wind_gusts_10m', 'visibility', 'is_day',
    ].join(','),
    hourly: [
      'temperature_2m', 'relative_humidity_2m', 'dew_point_2m',
      'apparent_temperature', 'precipitation_probability', 'precipitation',
      'weather_code', 'surface_pressure', 'visibility', 'wind_speed_10m',
      'wind_direction_10m', 'wind_gusts_10m', 'uv_index', 'is_day',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'apparent_temperature_max', 'apparent_temperature_min',
      'precipitation_sum', 'precipitation_probability_max',
      'sunrise', 'sunset', 'daylight_duration', 'uv_index_max',
      'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
    ].join(','),
    timezone: 'auto',
    forecast_days: '10',
    forecast_hours: '48',
  });
}

function parseCompactKst(value) {
  const raw = String(value || '').replace(/[^0-9]/g, '');
  if (raw.length < 10) return null;
  const minute = raw.length >= 12 ? raw.slice(10, 12) : '00';
  const date = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    + `T${raw.slice(8, 10)}:${minute}:00+09:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseKstText(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{12}$/.test(raw)) return parseCompactKst(raw);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(`${normalized}:00+09:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function offsetText(seconds = 0) {
  const total = Number(seconds) || 0;
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  const hours = String(Math.floor(abs / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((abs % 3600) / 60)).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function parseProviderLocal(value, offsetSeconds = 0) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/(Z|[+-]\d\d:\d\d)$/.test(raw)) {
    const absolute = new Date(raw);
    return Number.isFinite(absolute.getTime()) ? absolute.toISOString() : null;
  }
  const date = new Date(`${raw}${raw.length === 10 ? 'T00:00' : ''}${offsetText(offsetSeconds)}`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function ageState(instant, now, staleAfterMs) {
  if (!instant) return DATA_STATE.INVALID;
  const at = Date.parse(instant);
  const current = Date.parse(now);
  if (!Number.isFinite(at) || !Number.isFinite(current) || at > current + 5 * 60_000) {
    return DATA_STATE.INVALID;
  }
  return current - at > staleAfterMs ? DATA_STATE.STALE : DATA_STATE.AVAILABLE;
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const dLat = (Number(bLat) - Number(aLat)) * rad;
  const dLon = (Number(bLon) - Number(aLon)) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(Number(aLat) * rad) * Math.cos(Number(bLat) * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function nearest(rows, location, maxKm = 200) {
  if (!Array.isArray(rows) || !finite(location?.lat) || !finite(location?.lon)) return null;
  let best = null;
  for (const row of rows) {
    if (!finite(row?.lat) || !finite(row?.lon)) continue;
    const km = distanceKm(location.lat, location.lon, row.lat, row.lon);
    if (km <= maxKm && (!best || km < best.km)) best = { row, km };
  }
  return best;
}

function point({
  value = null, unit = null, sourceRef, sourceType, dataState,
  observedAt = null, issuedAt = null, validAt = null, method = null,
}) {
  const normalized = finite(value) ? Number(value) : value === 0 ? 0 : null;
  return {
    value: normalized,
    unit,
    dataState: normalized === null ? DATA_STATE.MISSING : (dataState || DATA_STATE.AVAILABLE),
    sourceRef,
    sourceType,
    observedAt,
    issuedAt,
    validAt,
    method,
  };
}

function textPoint({ value = null, sourceRef, sourceType, dataState, observedAt = null,
  issuedAt = null, validAt = null }) {
  const normalized = value === null || value === undefined || value === '' ? null : value;
  return {
    value: normalized,
    unit: null,
    dataState: normalized === null ? DATA_STATE.MISSING : (dataState || DATA_STATE.AVAILABLE),
    sourceRef,
    sourceType,
    observedAt,
    issuedAt,
    validAt,
  };
}

function sourceRef(source) {
  return {
    id: source.id,
    label: source.label,
    labelEn: source.labelEn || source.label,
    sourceType: source.sourceType,
    observedAt: source.observedAt || null,
    issuedAt: source.issuedAt || null,
    receivedAt: source.receivedAt || null,
    dataState: source.dataState || DATA_STATE.AVAILABLE,
    license: source.license,
    distanceKm: finite(source.distanceKm) ? Number(Number(source.distanceKm).toFixed(1)) : null,
    n: Number.isInteger(source.n) ? source.n : null,
  };
}

function forecastHour(row, kmaSource, issuedAt) {
  const validAt = parseCompactKst(row?.tm);
  return {
    validAt,
    sourceRef: kmaSource,
    sourceType: SOURCE_TYPE.OFFICIAL_FORECAST,
    dataState: validAt ? DATA_STATE.AVAILABLE : DATA_STATE.INVALID,
    condition: { sky: finite(row?.sky) ? Number(row.sky) : null,
      precipitationType: finite(row?.pty) ? Number(row.pty) : null },
    temperature: point({ value: row?.t, unit: '°C', sourceRef: kmaSource,
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt, validAt }),
    humidity: point({ value: row?.rh, unit: '%', sourceRef: kmaSource,
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt, validAt }),
    precipitationProbability: point({ value: row?.pop, unit: '%', sourceRef: kmaSource,
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt, validAt }),
    precipitation: point({ value: row?.pcp, unit: 'mm', sourceRef: kmaSource,
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt, validAt }),
    windSpeed: point({ value: row?.ws, unit: 'm/s', sourceRef: kmaSource,
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt, validAt }),
    windDirection: point({ value: row?.wd, unit: '°', sourceRef: kmaSource,
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt, validAt }),
  };
}

function meteoHour(doc, index, timezoneOffset) {
  const hourly = doc?.hourly || {};
  const validAt = parseProviderLocal(hourly.time?.[index], timezoneOffset);
  const args = { sourceRef: 'open-meteo', sourceType: SOURCE_TYPE.MODEL_FORECAST, validAt };
  return {
    validAt,
    sourceRef: 'open-meteo',
    sourceType: SOURCE_TYPE.MODEL_FORECAST,
    dataState: validAt ? DATA_STATE.AVAILABLE : DATA_STATE.INVALID,
    condition: finite(hourly.weather_code?.[index])
      ? { weatherCode: Number(hourly.weather_code[index]) } : null,
    temperature: point({ value: hourly.temperature_2m?.[index], unit: '°C', ...args }),
    humidity: point({ value: hourly.relative_humidity_2m?.[index], unit: '%', ...args }),
    precipitationProbability: point({ value: hourly.precipitation_probability?.[index], unit: '%', ...args }),
    precipitation: point({ value: hourly.precipitation?.[index], unit: 'mm', ...args }),
    windSpeed: point({ value: hourly.wind_speed_10m?.[index], unit: 'km/h', ...args }),
    windDirection: point({ value: hourly.wind_direction_10m?.[index], unit: '°', ...args }),
  };
}

function meteoDaily(doc, index, timezoneOffset) {
  const daily = doc?.daily || {};
  const date = daily.time?.[index] || null;
  const validAt = parseProviderLocal(date, timezoneOffset);
  const args = { sourceRef: 'open-meteo', sourceType: SOURCE_TYPE.MODEL_FORECAST, validAt };
  return {
    date,
    validAt,
    sourceType: SOURCE_TYPE.MODEL_FORECAST,
    sourceRefs: ['open-meteo'],
    condition: textPoint({ value: finite(daily.weather_code?.[index])
      ? { weatherCode: Number(daily.weather_code[index]) } : null, ...args }),
    temperatureMax: point({ value: daily.temperature_2m_max?.[index], unit: '°C', ...args }),
    temperatureMin: point({ value: daily.temperature_2m_min?.[index], unit: '°C', ...args }),
    precipitationProbability: point({ value: daily.precipitation_probability_max?.[index], unit: '%', ...args }),
    precipitation: point({ value: daily.precipitation_sum?.[index], unit: 'mm', ...args }),
    sunrise: textPoint({ value: daily.sunrise?.[index] || null, ...args }),
    sunset: textPoint({ value: daily.sunset?.[index] || null, ...args }),
    uvMax: point({ value: daily.uv_index_max?.[index], unit: null, ...args }),
  };
}

function unknownWarningGate() {
  return {
    gate: 'UNKNOWN', status: 'UNKNOWN', reason: 'WARNING_EVIDENCE_MISSING',
    warnings: [], blocksPositiveRecommendation: true,
  };
}

export function buildWeatherCardModel(input = {}) {
  const now = input.now || new Date().toISOString();
  const location = input.location || {};
  const meteo = input.openMeteo || {};
  const timezoneOffset = Number(meteo.utc_offset_seconds) || 0;
  const timezone = meteo.timezone || location.timezone || 'UTC';
  const sources = [];

  const meteoValidAt = parseProviderLocal(meteo.current?.time, timezoneOffset);
  sources.push(sourceRef({
    id: 'open-meteo', label: 'Open-Meteo forecast models',
    labelEn: 'Open-Meteo forecast models', sourceType: SOURCE_TYPE.MODEL_FORECAST,
    issuedAt: null, dataState: meteo.current ? DATA_STATE.AVAILABLE : DATA_STATE.MISSING,
    license: 'Open-Meteo attribution · provider API plan terms', n: meteo.current ? 1 : 0,
  }));

  const observationMatch = nearest(input.kmaObservation?.stations, location, 100);
  const observedAt = parseCompactKst(input.kmaObservation?.observedKst);
  const observationState = observationMatch
    ? ageState(observedAt, now, KMA_OBSERVATION_STALE_MS) : DATA_STATE.MISSING;
  const observation = observationMatch?.row || null;
  const observationRef = observation ? `kma-aws-${observation.id}` : null;
  if (observation) {
    sources.push(sourceRef({
      id: observationRef,
      label: input.kmaObservation.source || '기상청 AWS 매분 관측',
      labelEn: input.kmaObservation.sourceEn || 'KMA AWS observations',
      sourceType: SOURCE_TYPE.OBSERVED, observedAt,
      receivedAt: input.kmaObservation.generated || null,
      dataState: observationState,
      license: input.kmaObservation.license || '공공누리 제1유형 (출처표시)',
      distanceKm: observationMatch.km, n: 1,
    }));
  }

  const forecast = input.kmaForecast || null;
  const kmaSource = forecast ? `kma-vilage-${encodeURIComponent(forecast.name || 'nearest')}` : null;
  const kmaIssuedAt = parseCompactKst(forecast?.baseKst);
  if (forecast) {
    sources.push(sourceRef({
      id: kmaSource, label: forecast.source || '기상청 동네예보',
      labelEn: forecast.sourceEn || 'KMA Village Forecast',
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt: kmaIssuedAt,
      dataState: kmaIssuedAt ? DATA_STATE.AVAILABLE : DATA_STATE.INVALID,
      license: forecast.license || '공공누리 제1유형 (출처표시)',
      distanceKm: forecast.km, n: Array.isArray(forecast.hours) ? forecast.hours.length : null,
    }));
  }

  const currentSource = observation ? {
    sourceRef: observationRef, sourceType: SOURCE_TYPE.OBSERVED,
    dataState: observationState, observedAt,
  } : {
    sourceRef: 'open-meteo', sourceType: SOURCE_TYPE.MODEL_FORECAST,
    dataState: meteo.current ? DATA_STATE.AVAILABLE : DATA_STATE.MISSING,
    validAt: meteoValidAt,
  };
  const forecastNow = forecast?.now || null;
  const conditionValidAt = parseCompactKst(forecastNow?.tm) || meteoValidAt;
  const condition = forecastNow ? textPoint({
    value: { sky: finite(forecastNow.sky) ? Number(forecastNow.sky) : null,
      precipitationType: finite(forecastNow.pty) ? Number(forecastNow.pty) : null },
    sourceRef: kmaSource, sourceType: SOURCE_TYPE.OFFICIAL_FORECAST,
    issuedAt: kmaIssuedAt, validAt: conditionValidAt,
  }) : textPoint({
    value: finite(meteo.current?.weather_code)
      ? { weatherCode: Number(meteo.current.weather_code) } : null,
    sourceRef: 'open-meteo', sourceType: SOURCE_TYPE.MODEL_FORECAST,
    validAt: meteoValidAt,
  });

  const current = {
    condition,
    temperature: point({ value: observation?.ta ?? meteo.current?.temperature_2m,
      unit: '°C', ...currentSource }),
    feelsLike: observation ? point({ value: null, unit: '°C', sourceRef: observationRef,
      sourceType: SOURCE_TYPE.OBSERVED, dataState: DATA_STATE.NOT_SUPPORTED, observedAt })
      : point({ value: meteo.current?.apparent_temperature, unit: '°C', ...currentSource }),
    humidity: point({ value: observation?.hm ?? meteo.current?.relative_humidity_2m,
      unit: '%', ...currentSource }),
    dewPoint: point({ value: observation?.td, unit: '°C', ...currentSource }),
    windSpeed: point({ value: observation?.ws1 ?? meteo.current?.wind_speed_10m,
      unit: observation ? 'm/s' : 'km/h', ...currentSource }),
    windDirection: point({ value: observation?.wd1 ?? meteo.current?.wind_direction_10m,
      unit: '°', ...currentSource }),
    windGust: point({ value: observation?.wss ?? meteo.current?.wind_gusts_10m,
      unit: observation ? 'm/s' : 'km/h', ...currentSource }),
    pressure: point({ value: observation?.ps ?? meteo.current?.surface_pressure,
      unit: 'hPa', ...currentSource }),
    precipitation15m: point({ value: observation?.rn15, unit: 'mm', ...currentSource }),
    precipitation60m: point({ value: observation?.rn60 ?? meteo.current?.precipitation,
      unit: 'mm', ...currentSource }),
  };

  const hourly = Array.isArray(forecast?.hours) && forecast.hours.length
    ? forecast.hours.slice(0, 24).map(row => forecastHour(row, kmaSource, kmaIssuedAt))
    : Array.from({ length: Math.min(24, meteo.hourly?.time?.length || 0) },
      (_, index) => meteoHour(meteo, index, timezoneOffset));

  const daily = Array.from({ length: Math.min(10, meteo.daily?.time?.length || 0) }, (_, index) => {
    const row = meteoDaily(meteo, index, timezoneOffset);
    const key = String(row.date || '').replace(/-/g, '');
    const official = forecast?.days?.[key];
    if (!official) return row;
    const args = { sourceRef: kmaSource, sourceType: SOURCE_TYPE.OFFICIAL_FORECAST,
      issuedAt: kmaIssuedAt, validAt: row.validAt };
    row.temperatureMax = point({ value: official.tmax, unit: '°C', ...args });
    row.temperatureMin = point({ value: official.tmin, unit: '°C', ...args });
    row.sourceType = SOURCE_TYPE.OFFICIAL_FORECAST;
    row.sourceRefs = [kmaSource, 'open-meteo'];
    return row;
  });

  const airMatch = nearest(input.airObservation?.stations, location, 100);
  const airAt = parseKstText(airMatch?.row?.at || input.airObservation?.observedKst);
  const airState = airMatch ? ageState(airAt, now, AIR_OBSERVATION_STALE_MS) : DATA_STATE.MISSING;
  const airSource = input.airObservation?.sources?.[0];
  if (airMatch) {
    sources.push(sourceRef({
      id: 'airkorea-' + encodeURIComponent(airMatch.row.name || 'nearest'),
      label: airSource?.ko || '한국환경공단 에어코리아',
      labelEn: airSource?.en || 'AirKorea', sourceType: SOURCE_TYPE.OBSERVED,
      observedAt: airAt, receivedAt: input.airObservation.generated || null,
      dataState: airState, license: airSource?.license || '공공누리 제1유형 (출처표시)',
      distanceKm: airMatch.km, n: 1,
    }));
  }
  const airRef = airMatch ? 'airkorea-' + encodeURIComponent(airMatch.row.name || 'nearest') : 'airkorea';
  const airArgs = { sourceRef: airRef, sourceType: SOURCE_TYPE.OBSERVED,
    dataState: airState, observedAt: airAt };

  const uvRegion = input.uvIndex?.indices?.uv?.regions?.[location.region] || null;
  const uvIssuedAt = parseCompactKst(uvRegion?.issuedKst);
  const uvRef = 'kma-life-uv-' + encodeURIComponent(location.region || 'region');
  if (uvRegion) {
    sources.push(sourceRef({
      id: uvRef, label: input.uvIndex.source || '기상청 자외선지수',
      labelEn: input.uvIndex.sourceEn || 'KMA UV index',
      sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt: uvIssuedAt,
      receivedAt: input.uvIndex.generated || null,
      dataState: DATA_STATE.AVAILABLE,
      license: input.uvIndex.license || '공공누리 제1유형 (출처표시)', n: 1,
    }));
  }
  const warningGate = input.warningGate || unknownWarningGate();
  const warningActive = warningGate.gate === 'OFFICIAL_WARNING_ACTIVE';
  const warningUnknown = warningGate.status === 'UNKNOWN' || warningGate.gate === 'UNKNOWN';

  return {
    schemaVersion: 'earthus.weather-card.v1',
    generatedAt: now,
    location: {
      name: location.name || null,
      lat: finite(location.lat) ? Number(location.lat) : null,
      lon: finite(location.lon) ? Number(location.lon) : null,
      region: location.region || null,
      timezone,
      utcOffsetSeconds: timezoneOffset,
    },
    current,
    hourly,
    daily,
    details: {
      airQuality: {
        stationName: airMatch?.row?.name || null,
        stationDistanceKm: airMatch ? Number(airMatch.km.toFixed(1)) : null,
        grade: airMatch?.row?.gradeKo || null,
        pm10: point({ value: airMatch?.row?.pm10, unit: 'µg/m³', ...airArgs }),
        pm25: point({ value: airMatch?.row?.pm25, unit: 'µg/m³', ...airArgs }),
        index: point({ value: airMatch?.row?.khai, unit: null, ...airArgs }),
      },
      uv: {
        level: uvRegion?.levelKo || null,
        value: point({ value: uvRegion?.value, unit: null, sourceRef: uvRef,
          sourceType: SOURCE_TYPE.OFFICIAL_FORECAST, issuedAt: uvIssuedAt,
          dataState: uvRegion ? DATA_STATE.AVAILABLE : DATA_STATE.MISSING }),
      },
      sun: {
        sunrise: daily[0]?.sunrise || textPoint({ value: null, sourceRef: 'open-meteo',
          sourceType: SOURCE_TYPE.MODEL_FORECAST }),
        sunset: daily[0]?.sunset || textPoint({ value: null, sourceRef: 'open-meteo',
          sourceType: SOURCE_TYPE.MODEL_FORECAST }),
      },
      waves: input.marine || null,
    },
    warningGate,
    displayPolicy: {
      safetyFirst: true,
      positiveRecommendationAllowed: !warningActive && !warningUnknown
        && warningGate.blocksPositiveRecommendation === false,
    },
    sources,
  };
}
