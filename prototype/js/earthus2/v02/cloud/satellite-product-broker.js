import { clamp, normalizeWeights } from '../core/math.js';

export const DEFAULT_REGIONAL_PREFERENCES = Object.freeze({
  KR: Object.freeze(['GK2A', 'HIMAWARI9', 'NOAA21', 'NOAA20']),
  ASIA: Object.freeze(['HIMAWARI9', 'GK2A', 'NOAA21', 'NOAA20']),
  GB: Object.freeze(['METEOSAT12', 'METEOSAT11', 'NOAA21', 'NOAA20', 'GOES19']),
  EUROPE: Object.freeze(['METEOSAT12', 'METEOSAT11', 'NOAA21', 'NOAA20']),
  AMERICAS: Object.freeze(['GOES19', 'GOES18', 'NOAA21', 'NOAA20']),
  GLOBAL: Object.freeze(['METEOSAT12', 'HIMAWARI9', 'GOES19', 'GOES18', 'GK2A', 'NOAA21', 'NOAA20']),
});

function sourceScore(source, request) {
  const reasons = [];
  if (source.health !== 'HEALTHY') reasons.push('UNHEALTHY');
  if (source.rights?.display !== true) reasons.push('DISPLAY_RIGHTS_BLOCKED');
  if (request.derivedProduct && source.rights?.derivative !== true) reasons.push('DERIVATIVE_RIGHTS_BLOCKED');
  if (!source.products?.includes(request.product)) reasons.push('PRODUCT_UNAVAILABLE');
  if (source.missingTiles?.includes(request.tileId)) reasons.push('TILE_MISSING');
  if (request.isNight && source.dayOnlyProducts?.includes(request.product)) reasons.push('DAY_ONLY_PRODUCT');
  if (Number.isFinite(source.ageMinutes) && source.ageMinutes > (request.maxAgeMinutes ?? Infinity)) reasons.push('TOO_OLD');
  if (Number.isFinite(source.viewZenithDeg) && source.viewZenithDeg > (request.maxViewZenithDeg ?? 75)) reasons.push('LIMB_ANGLE_TOO_HIGH');
  if (reasons.length) return Object.freeze({ sourceId: source.id, eligible: false, score: 0, reasons: Object.freeze(reasons) });

  const preferences = DEFAULT_REGIONAL_PREFERENCES[request.regionId] ?? DEFAULT_REGIONAL_PREFERENCES.GLOBAL;
  const preferenceIndex = preferences.indexOf(source.id);
  const regionalPreference = preferenceIndex === -1 ? 0.35 : 1 - preferenceIndex / Math.max(1, preferences.length);
  const freshness = Number.isFinite(source.ageMinutes) ? clamp(1 - source.ageMinutes / Math.max(1, request.maxAgeMinutes ?? source.freshnessSlaMinutes ?? 120), 0, 1) : 0.5;
  const targetResolution = Math.max(0.1, request.targetResolutionKm ?? 2);
  const resolution = clamp(targetResolution / Math.max(0.1, source.resolutionKmByProduct?.[request.product] ?? source.resolutionKm ?? 10), 0, 1);
  const viewAngle = Number.isFinite(source.viewZenithDeg) ? clamp(1 - source.viewZenithDeg / 80, 0, 1) : 0.6;
  const timeAlignment = Number.isFinite(source.timeOffsetMinutes) ? clamp(1 - Math.abs(source.timeOffsetMinutes) / Math.max(1, request.maxTimeOffsetMinutes ?? 15), 0, 1) : 0.5;
  const channelFit = clamp(source.channelFitByProduct?.[request.product] ?? 0.5, 0, 1);
  const parallax = source.parallaxCorrection === true ? 1 : request.requiresParallaxCorrection ? 0.25 : 0.7;
  const reliability = clamp(source.reliability ?? 0.7, 0, 1);
  const cost = clamp(1 - (source.costWeight ?? 0), 0, 1);
  const score = 0.20 * regionalPreference + 0.18 * freshness + 0.15 * resolution + 0.10 * viewAngle + 0.10 * timeAlignment + 0.10 * channelFit + 0.07 * parallax + 0.07 * reliability + 0.03 * cost;
  return Object.freeze({ sourceId: source.id, eligible: true, score, components: Object.freeze({ regionalPreference, freshness, resolution, viewAngle, timeAlignment, channelFit, parallax, reliability, cost }), reasons: Object.freeze([]) });
}

export function selectSatelliteProducts({ sources, request }) {
  if (!Array.isArray(sources) || !sources.length) throw new TypeError('sources are required');
  if (!request?.product || !request?.regionId || !request?.tileId) throw new TypeError('request product, regionId and tileId are required');
  const evaluations = sources.map((source) => ({ source, evaluation: sourceScore(source, request) })).sort((left, right) => right.evaluation.score - left.evaluation.score);
  const eligible = evaluations.filter((item) => item.evaluation.eligible);
  const primary = eligible[0] ?? null;
  const secondary = eligible.slice(1).find((item) => item.source.family === 'GEO') ?? eligible[1] ?? null;
  const calibration = eligible.find((item) => ![primary, secondary].includes(item) && item.source.family === 'POLAR') ?? null;
  const weights = normalizeWeights(Object.fromEntries(eligible.map((item) => [item.source.id, item.evaluation.score])));
  return Object.freeze({
    request: Object.freeze(structuredClone(request)),
    primary: primary?.source.id ?? null,
    secondary: secondary?.source.id ?? null,
    calibration: calibration?.source.id ?? null,
    state: primary ? 'READY' : 'UNAVAILABLE',
    weights,
    evaluations: Object.freeze(evaluations.map((item) => item.evaluation)),
  });
}
