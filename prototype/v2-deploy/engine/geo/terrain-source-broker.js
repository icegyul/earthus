import { clamp } from '../core/math.js';

function scoreSource(source, request) {
  const reasons = [];
  if (source.health !== 'HEALTHY') reasons.push('UNHEALTHY');
  if (source.rights?.display !== true) reasons.push('DISPLAY_RIGHTS_BLOCKED');
  if (!source.coverage?.includes(request.regionId) && !source.coverage?.includes('GLOBAL')) reasons.push('NO_COVERAGE');
  if (Number.isFinite(source.minZoom) && request.zoom < source.minZoom) reasons.push('BELOW_MIN_ZOOM');
  if (Number.isFinite(source.maxZoom) && request.zoom > source.maxZoom) reasons.push('ABOVE_MAX_ZOOM');
  if (reasons.length) return Object.freeze({ sourceId: source.id, eligible: false, score: 0, reasons: Object.freeze(reasons) });

  const targetResolution = Math.max(0.1, request.targetResolutionM ?? 1000);
  const sourceResolution = Math.max(0.1, source.resolutionM ?? 10000);
  const resolutionScore = clamp(targetResolution / sourceResolution, 0, 1);
  const freshnessScore = Number.isFinite(source.ageHours) ? clamp(1 - source.ageHours / Math.max(1, source.freshnessSlaHours ?? 720), 0, 1) : 0.6;
  const continuityScore = source.seamless === true ? 1 : 0.65;
  const verticalDatumScore = source.verticalDatum === request.verticalDatum ? 1 : source.verticalDatum ? 0.7 : 0.5;
  const costScore = clamp(1 - (source.costWeight ?? 0), 0, 1);
  const priorityScore = clamp((source.priorityByRegion?.[request.regionId] ?? source.priority ?? 0.5), 0, 1);
  const score = 0.34 * resolutionScore + 0.14 * freshnessScore + 0.14 * continuityScore + 0.12 * verticalDatumScore + 0.10 * costScore + 0.16 * priorityScore;
  return Object.freeze({ sourceId: source.id, eligible: true, score, components: Object.freeze({ resolutionScore, freshnessScore, continuityScore, verticalDatumScore, costScore, priorityScore }), reasons: Object.freeze([]) });
}

export function selectTerrainSources({ sources, request }) {
  if (!Array.isArray(sources) || !sources.length) throw new TypeError('terrain sources are required');
  if (!request?.regionId || !Number.isFinite(request.zoom)) throw new TypeError('request regionId and zoom are required');
  const evaluations = sources.map((source) => ({ source, evaluation: scoreSource(source, request) })).sort((a, b) => b.evaluation.score - a.evaluation.score);
  const eligible = evaluations.filter((item) => item.evaluation.eligible);
  const primary = eligible[0] ?? null;
  const fallback = eligible.slice(1).find((item) => item.source.id !== primary?.source.id) ?? null;
  return Object.freeze({
    primary: primary?.source.id ?? null,
    fallback: fallback?.source.id ?? null,
    state: primary ? 'READY' : 'UNAVAILABLE',
    evaluations: Object.freeze(evaluations.map((item) => item.evaluation)),
  });
}
