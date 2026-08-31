export function composeTravelContext(candidate = {}, scoreResult = {}) {
  const reasons = [];
  if ((candidate.weatherSuitability ?? 0) >= 0.7) reasons.push('WEATHER_FAVORABLE');
  if ((candidate.relationSignal ?? 0) >= 0.7) reasons.push('STRONG_NEARBY_CONNECTION');
  if ((candidate.demandSignal ?? 0) >= 0.65) reasons.push('RISING_TOURISM_DEMAND');
  if ((candidate.noveltySignal ?? 0) >= 0.7) reasons.push('DISCOVERY_VALUE');
  if ((candidate.accessibilitySignal ?? 0) >= 0.7) reasons.push('ACCESSIBILITY_SUPPORT');
  return {
    discoveryLabel: scoreResult.label || 'EARTHUS_DISCOVERY',
    score: scoreResult.score ?? null,
    reasons: reasons.slice(0, 4),
    weather: candidate.weather || null,
    visitWindow: candidate.visitWindow || null,
    nearby: Array.isArray(candidate.nearby) ? candidate.nearby.slice(0, 5) : [],
    evidenceIds: Array.isArray(candidate.evidenceIds) ? [...new Set(candidate.evidenceIds)] : [],
    disclaimer: 'Earthus data-derived discovery; not an official KTO recommendation.',
  };
}
