const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function tourismDiscoveryScore(candidate = {}, policy = {}) {
  if (candidate.closed || candidate.officialRestriction || candidate.criticalHazard) return { score: 0, excluded: true, reason: 'HARD_GATE' };
  const weights = { demand: .18, novelty: .18, relation: .16, diversity: .14, dwell: .12, weather: .14, accessibility: .08, ...(policy.weights || {}) };
  const components = {
    demand: clamp(candidate.demandSignal),
    novelty: clamp(candidate.noveltySignal),
    relation: clamp(candidate.relationSignal),
    diversity: clamp(candidate.diversitySignal),
    dwell: clamp(candidate.dwellSignal),
    weather: clamp(candidate.weatherSuitability),
    accessibility: clamp(candidate.accessibilitySignal),
  };
  const score = Object.entries(weights).reduce((s,[k,w]) => s + w*components[k],0);
  return { score: Math.round(score*1000)/1000, excluded: false, components, label: 'EARTHUS_DISCOVERY' };
}

export function rankTourismDiscoveries(candidates = [], policy = {}) {
  return candidates.map((c) => ({ candidate: c, result: tourismDiscoveryScore(c, policy) }))
    .filter((x) => !x.result.excluded)
    .sort((a,b) => b.result.score-a.result.score);
}
