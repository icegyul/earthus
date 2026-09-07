import { REGION_STANDARD } from './constants.js';

const STANDARDS = Object.freeze({
  [REGION_STANDARD.KR]: Object.freeze({ temperature: 'C', wind: 'MPS', distance: 'KM', precipitation: 'MM', pressure: 'HPA', locale: 'ko-KR', timezone: 'Asia/Seoul' }),
  [REGION_STANDARD.JP]: Object.freeze({ temperature: 'C', wind: 'MPS', distance: 'KM', precipitation: 'MM', pressure: 'HPA', locale: 'ja-JP', timezone: 'Asia/Tokyo' }),
  [REGION_STANDARD.US]: Object.freeze({ temperature: 'F', wind: 'MPH', distance: 'MI', precipitation: 'IN', pressure: 'INHG', locale: 'en-US', timezone: 'America/New_York' }),
  [REGION_STANDARD.GB]: Object.freeze({ temperature: 'C', wind: 'MPH', distance: 'MI', precipitation: 'MM', pressure: 'HPA', locale: 'en-GB', timezone: 'Europe/London' }),
  [REGION_STANDARD.GLOBAL]: Object.freeze({ temperature: 'C', wind: 'MPS', distance: 'KM', precipitation: 'MM', pressure: 'HPA', locale: 'en', timezone: 'UTC' }),
});

export function regionalStandard(region = REGION_STANDARD.GLOBAL) {
  return STANDARDS[region] ?? STANDARDS[REGION_STANDARD.GLOBAL];
}

export function convertTemperatureC(value, unit) {
  if (!Number.isFinite(value)) return null;
  return unit === 'F' ? value * 9 / 5 + 32 : value;
}

export function convertWindMps(value, unit) {
  if (!Number.isFinite(value)) return null;
  if (unit === 'MPH') return value * 2.2369362921;
  if (unit === 'KNOT') return value * 1.9438444924;
  return value;
}

export function convertPrecipitationMm(value, unit) {
  if (!Number.isFinite(value)) return null;
  return unit === 'IN' ? value / 25.4 : value;
}

export function formatRegionalWeather({ region, temperatureC, windMps, precipitationMm }) {
  const standard = regionalStandard(region);
  return Object.freeze({
    temperature: convertTemperatureC(temperatureC, standard.temperature),
    temperatureUnit: standard.temperature,
    wind: convertWindMps(windMps, standard.wind),
    windUnit: standard.wind,
    precipitation: convertPrecipitationMm(precipitationMm, standard.precipitation),
    precipitationUnit: standard.precipitation,
    locale: standard.locale,
    timezone: standard.timezone,
  });
}
